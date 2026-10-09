-- Forward-only additive measurement. No historical feedback is reclassified.
begin;
create schema if not exists ff_measurement;
revoke all on schema ff_measurement from public, anon, authenticated;

create table ff_measurement.journeys (
  token_hash text primary key,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  first_touch jsonb not null,
  latest_non_direct jsonb,
  claimed_by uuid unique references auth.users(id) on delete set null
);
create table ff_measurement.arrivals (
  id uuid primary key,
  token_hash text not null references ff_measurement.journeys(token_hash) on delete cascade,
  session_id uuid not null,
  kind text not null check (kind in ('landing','signup_started')),
  received_at timestamptz not null default now(),
  touch jsonb not null,
  unique(token_hash,session_id,kind)
);
create table ff_measurement.signup_intents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  setup jsonb not null,
  token_hash text,
  created_at timestamptz not null default now(),
  business_id uuid references public.businesses(id) on delete set null,
  completed_at timestamptz
);
create table ff_measurement.business_acquisition (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  acquired_at timestamptz not null,
  signup_completed_at timestamptz not null,
  first_touch jsonb,
  latest_non_direct jsonb,
  visitor_id uuid,
  coverage text not null check (coverage in ('measured','unknown','historical_unknown'))
);
create table ff_measurement.milestones (
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  stage text not null check(stage in ('qr_ready','download_requested','print_requested','order_paid','order_fulfilled','placement_confirmed','feedback_page_open','eligible_feedback')),
  occurred_at timestamptz not null default now(),
  primary key(business_id,location_id,stage)
);
create table ff_measurement.page_opens (
  location_id uuid not null references public.locations(id) on delete cascade,
  visit_id uuid not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  received_at timestamptz not null default now(),
  eligibility text not null check(eligibility in ('eligible_unverified','staff_test','declared_test','internal')),
  primary key(location_id,visit_id)
);
create table ff_measurement.feedback_eligibility (
  feedback_id uuid primary key references public.feedback(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  received_at timestamptz not null default now(),
  status text not null check(status in ('eligible_unverified','staff_test','declared_test','internal','legacy_unclassified')),
  flagged boolean not null,
  policy_version integer not null default 1
);
create table ff_measurement.rate_limits (
  bucket text primary key,
  started_at timestamptz not null default now(),
  requests integer not null default 1
);
create index on ff_measurement.arrivals(received_at);
create index on ff_measurement.feedback_eligibility(business_id,status,received_at);
create index on ff_measurement.business_acquisition(acquired_at);
create index on ff_measurement.milestones(stage,occurred_at);
do $$ declare t text; begin
  foreach t in array array['journeys','arrivals','signup_intents','business_acquisition','milestones','page_opens','feedback_eligibility','rate_limits'] loop
    execute format('alter table ff_measurement.%I enable row level security',t);
    execute format('revoke all on ff_measurement.%I from public,anon,authenticated',t);
  end loop;
end $$;

-- Private helpers are never exposed through PostgREST.
create function ff_measurement.mark(b uuid,l uuid,s text,at_time timestamptz default now()) returns void
language sql security definer set search_path='' as $$
  insert into ff_measurement.milestones values(b,l,s,at_time)
  on conflict(business_id,location_id,stage) do update
  set occurred_at=least(ff_measurement.milestones.occurred_at,excluded.occurred_at);
$$;
create function ff_measurement.internal_business(b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select x.integration_test_mode or x.subscription_test_mode or exists(
    select 1 from public.internal_admins a where a.user_id=x.owner_id)
    from public.businesses x where x.id=b),true);
$$;

create function public.measurement_rate_limit(p_bucket text,p_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; begin
  if length(p_bucket)>160 or p_limit not between 1 and 200 then return false; end if;
  insert into ff_measurement.rate_limits(bucket) values(p_bucket)
  on conflict(bucket) do update set
    requests=case when ff_measurement.rate_limits.started_at < now()-interval '1 minute' then 1 else ff_measurement.rate_limits.requests+1 end,
    started_at=case when ff_measurement.rate_limits.started_at < now()-interval '1 minute' then now() else ff_measurement.rate_limits.started_at end
  returning requests into n;
  return n<=p_limit;
end $$;

create function public.record_acquisition_arrival(p_hash text,p_visitor uuid,p_session uuid,p_id uuid,p_kind text,p_touch jsonb,p_actor uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_actor is not null and not exists(select 1 from ff_measurement.signup_intents where user_id=p_actor and token_hash=p_hash and created_at>now()-interval '24 hours') then return; end if;
  if p_hash !~ '^[a-f0-9]{64}$' or p_kind not in ('landing','signup_started') or octet_length(p_touch::text)>5000 then
    raise exception 'Invalid arrival';
  end if;
  insert into ff_measurement.journeys(token_hash,visitor_id,first_touch,latest_non_direct)
  values(p_hash,p_visitor,p_touch||jsonb_build_object('received_at',now()),
    case when p_touch->>'channel' not in ('direct','unknown') then p_touch||jsonb_build_object('received_at',now()) end)
  on conflict do nothing;
  -- Serialize visits, preserve first touch, and stop modifying a journey after signup.
  perform 1 from ff_measurement.journeys where token_hash=p_hash for update;
  if not exists(select 1 from ff_measurement.journeys where token_hash=p_hash and expires_at>now() and claimed_by is null) then return; end if;
  insert into ff_measurement.arrivals(id,token_hash,session_id,kind,touch)
    values(p_id,p_hash,p_session,p_kind,p_touch) on conflict do nothing;
  if found and p_kind='landing' and p_touch->>'channel' not in ('direct','unknown') then
    update ff_measurement.journeys set latest_non_direct=p_touch||jsonb_build_object('received_at',now()) where token_hash=p_hash;
  end if;
  -- Recover a navigation/network-interrupted original arrival only for the user
  -- whose immutable signup intent contained this capability. Never attach on login.
  if p_actor is not null then
    update ff_measurement.business_acquisition a set first_touch=j.first_touch,latest_non_direct=j.latest_non_direct,
      visitor_id=j.visitor_id,acquired_at=j.created_at,coverage='measured'
    from ff_measurement.signup_intents i,ff_measurement.journeys j
    where i.user_id=p_actor and i.token_hash=p_hash and j.token_hash=p_hash
      and a.business_id=i.business_id and a.coverage='unknown';
    if found then update ff_measurement.journeys set claimed_by=p_actor where token_hash=p_hash; end if;
  end if;
end $$;

-- Snapshot setup ONLY at auth-user creation. Subsequent user_metadata edits cannot
-- mint acquisition or let an existing login create a newly acquired business.
create function ff_measurement.capture_signup_intent() returns trigger
language plpgsql security definer set search_path='' as $$
declare s jsonb:=new.raw_user_meta_data->'ff_setup'; token text; begin
  if jsonb_typeof(s)='object' and length(s->>'business_name') between 1 and 160
    and length(s->>'owner_name') between 1 and 160
    and not exists(select 1 from public.business_invites where lower(email)=lower(new.email) and status='pending' and expires_at>now()) then
    token:=s->>'journey_token';
    insert into ff_measurement.signup_intents(user_id,setup,token_hash)
    values(new.id,jsonb_build_object('business_name',s->>'business_name','owner_name',s->>'owner_name',
      'location_name',left(coalesce(nullif(s->>'location_name',''),'Location 01'),160),
      'industry',left(s->>'industry',80),'business_type',left(s->>'business_type',160),
      'plan',case when s->>'plan' in ('growth','pro') then s->>'plan' else 'free' end),
      case when token ~ '^[a-f0-9]{64}$' then encode(sha256(convert_to(token,'UTF8')),'hex') end);
    -- Freeze the latest touch at auth signup, even when email confirmation follows later.
    update ff_measurement.journeys set claimed_by=new.id
      where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and claimed_by is null and expires_at>now();
  end if;
  return new;
end $$;
create trigger ff_capture_signup_intent after insert on auth.users for each row execute function ff_measurement.capture_signup_intent();

create function ff_measurement.business_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into ff_measurement.business_acquisition(business_id,acquired_at,signup_completed_at,coverage)
    values(new.id,now(),now(),'unknown') on conflict do nothing;
  return new;
end $$;
create trigger ff_business_created after insert on public.businesses for each row execute function ff_measurement.business_created();
insert into ff_measurement.business_acquisition(business_id,acquired_at,signup_completed_at,coverage)
select id,created_at,created_at,'historical_unknown' from public.businesses;

create function public.complete_acquisition_signup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); i ff_measurement.signup_intents%rowtype; b public.businesses%rowtype;
  l public.locations%rowtype; j ff_measurement.journeys%rowtype;
begin
  if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then
    raise exception 'Confirmed authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into i from ff_measurement.signup_intents where user_id=u for update;
  if not found then return null; end if;
  if i.completed_at is not null then
    if i.business_id is null then return null; end if;
    select * into b from public.businesses where id=i.business_id and owner_id=u;
    if not found then return null; end if;
    select * into l from public.locations where id=b.default_location_id;
    return jsonb_build_object('business',to_jsonb(b),'location',to_jsonb(l),'plan',i.setup->>'plan','created',false);
  end if;
  if exists(select 1 from public.businesses where owner_id=u) or exists(select 1 from public.business_users where user_id=u) then return null; end if;
  insert into public.businesses(name,owner_id,owner_name,timezone,industry,business_type,email_alerts_enabled,pricing_tier,subscription_status,subscription_comped)
    values(i.setup->>'business_name',u,i.setup->>'owner_name','Europe/London',nullif(i.setup->>'industry',''),nullif(i.setup->>'business_type',''),true,'free','none',false) returning * into b;
  insert into public.business_users(business_id,user_id,role) values(b.id,u,'owner');
  insert into public.locations(business_id,name,is_active) values(b.id,i.setup->>'location_name',true) returning * into l;
  update public.businesses set default_location_id=l.id where id=b.id returning * into b;
  update ff_measurement.signup_intents set business_id=b.id,completed_at=now() where user_id=u;
  select * into j from ff_measurement.journeys where token_hash=i.token_hash and expires_at>i.created_at and created_at<=i.created_at+interval '24 hours' and (claimed_by is null or claimed_by=u) for update;
  if found then
    update ff_measurement.journeys set claimed_by=u where token_hash=j.token_hash;
    update ff_measurement.business_acquisition set acquired_at=j.created_at,first_touch=j.first_touch,
      latest_non_direct=j.latest_non_direct,visitor_id=j.visitor_id,coverage='measured' where business_id=b.id;
  end if;
  return jsonb_build_object('business',to_jsonb(b),'location',to_jsonb(l),'plan',i.setup->>'plan','created',true);
end $$;

-- Restrictive policies compose with all existing permissive policies (OR).
-- In particular bu_owner_insert previously allowed arbitrary self-membership.
create policy ff_initial_membership_only on public.business_users as restrictive for insert to authenticated
with check(user_id=auth.uid() and role='owner' and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()));
create policy ff_owner_event_boundary on public.analytics_events as restrictive for insert to authenticated with check (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())
  or exists(select 1 from public.business_users m where m.business_id=analytics_events.business_id and m.user_id=auth.uid() and m.role in ('owner','admin'))
);
create policy ff_owner_event_kind on public.analytics_events as restrictive for insert to authenticated with check (
  event_type not like 'qr_print_order_%' and event_type not like 'starter_pack_%'
  and event_type not in ('paid_upgrade','reply_request_saved','reply_request_alert_attempted','reply_request_alert_delivered','reply_request_alert_failed','reply_request_email_erased')
  and (location_id is null or exists(select 1 from public.locations l where l.id=location_id and l.business_id=analytics_events.business_id))
);
create function ff_measurement.owner_event_timestamp() returns trigger
language plpgsql set search_path='' as $$ begin
  if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='authenticated' then new.created_at:=now(); end if;
  return new;
end $$;
create trigger ff_owner_event_timestamp before insert on public.analytics_events for each row execute function ff_measurement.owner_event_timestamp();
create function ff_measurement.owner_milestone() returns trigger
language plpgsql security definer set search_path='' as $$
declare s text; begin
  if new.location_id is null or not exists(select 1 from public.locations where id=new.location_id and business_id=new.business_id) then return new; end if;
  s:=case when new.event_type='qr_generated' then 'qr_ready'
    when new.event_type='onboarding_qr_placed_confirmed' then 'placement_confirmed'
    when new.event_type='qr_deployed' and new.source in ('download','support_download') then 'download_requested'
    when new.event_type='qr_deployed' and new.source='print' then 'print_requested' end;
  if s is not null then perform ff_measurement.mark(new.business_id,new.location_id,s,now()); end if;
  return new;
end $$;
create trigger ff_owner_milestone after insert on public.analytics_events for each row execute function ff_measurement.owner_milestone();

create function ff_measurement.order_milestone() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.location_id is null or ff_measurement.internal_business(new.business_id)
    or coalesce(new.metadata->>'integration_environment',new.metadata->>'stripe_environment','unknown')<>'production' then return new; end if;
  if not exists(select 1 from public.locations where id=new.location_id and business_id=new.business_id) then return new; end if;
  -- Client draft insertion is not payment. Only trusted backend writes qualify.
  if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then return new; end if;
  if new.stripe_payment_status='paid' and new.stripe_session_id is not null and coalesce(new.order_kind,'paid')='paid' then
    perform ff_measurement.mark(new.business_id,new.location_id,'order_paid'); end if;
  if new.fulfilment_status='completed' and new.prodigi_order_id is not null then
    perform ff_measurement.mark(new.business_id,new.location_id,'order_fulfilled'); end if;
  return new;
end $$;
create trigger ff_order_milestone after insert or update on public.qr_print_orders for each row execute function ff_measurement.order_milestone();

create function public.record_feedback_page_open(p_location uuid,p_visit uuid,p_actor uuid,p_test boolean) returns void
language plpgsql security definer set search_path='' as $$
declare b uuid; status text; begin
  select business_id into b from public.locations where id=p_location and is_active;
  if b is null then return; end if;
  status:=case when ff_measurement.internal_business(b) then 'internal'
    when exists(select 1 from public.businesses where id=b and owner_id=p_actor) or exists(select 1 from public.business_users where business_id=b and user_id=p_actor) then 'staff_test'
    when p_test then 'declared_test' else 'eligible_unverified' end;
  -- Serialize classification and first-open recomputation for this location.
  perform pg_advisory_xact_lock(hashtextextended(p_location::text,1));
  insert into ff_measurement.page_opens(location_id,visit_id,business_id,eligibility) values(p_location,p_visit,b,status)
    on conflict(location_id,visit_id) do update set eligibility=case when excluded.eligibility<>'eligible_unverified' then excluded.eligibility else ff_measurement.page_opens.eligibility end;
  delete from ff_measurement.milestones where location_id=p_location and stage='feedback_page_open';
  if exists(select 1 from ff_measurement.page_opens where location_id=p_location and eligibility='eligible_unverified') then
    perform ff_measurement.mark(b,p_location,'feedback_page_open',(select min(received_at) from ff_measurement.page_opens where location_id=p_location and eligibility='eligible_unverified'));
  end if;
end $$;

alter table public.feedback add column measurement_status text check(measurement_status in ('eligible_unverified','staff_test','declared_test'));
alter table public.feedback add column submission_key uuid;
create unique index ff_feedback_submission_key on public.feedback(location_id,submission_key) where submission_key is not null;
create function ff_measurement.feedback_recorded() returns trigger
language plpgsql security definer set search_path='' as $$
declare s text; begin
  s:=case when ff_measurement.internal_business(new.business_id) then 'internal'
    when coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='service_role'
      and new.measurement_status in ('eligible_unverified','staff_test','declared_test') then new.measurement_status
    else 'legacy_unclassified' end;
  insert into ff_measurement.feedback_eligibility(feedback_id,business_id,location_id,status,flagged)
    values(new.id,new.business_id,new.location_id,s,coalesce(new.anomaly_score,0)>0);
  if s='eligible_unverified' then perform ff_measurement.mark(new.business_id,new.location_id,'eligible_feedback'); end if;
  return new;
end $$;
create trigger ff_feedback_recorded after insert on public.feedback for each row execute function ff_measurement.feedback_recorded();

-- Authenticated internal-admin read; no click IDs, token hashes, customer contact
-- details, IP-derived buckets, or signup form values are returned.
create function public.acquisition_cohort_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
  if auth.uid() is null or not exists(select 1 from public.internal_admins where user_id=auth.uid()) then
    raise exception 'Internal admin required' using errcode='42501'; end if;
  if p_to<p_from or p_to-p_from>366 then raise exception 'Choose up to 367 days'; end if;
  select jsonb_build_object('businesses',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into result from (
    select a.business_id,a.acquired_at,a.signup_completed_at,a.coverage,
      a.first_touch->>'utm_source' as source,a.first_touch->>'utm_medium' as medium,
      a.first_touch->>'utm_campaign' as campaign,a.first_touch->>'landing_path' as landing_page,
      a.first_touch->>'channel' as channel,a.latest_non_direct->>'utm_source' as latest_source,
      ff_measurement.internal_business(a.business_id) as excluded_internal,
      (select jsonb_object_agg(stage,at_time) from (select stage,min(occurred_at) at_time from ff_measurement.milestones m where m.business_id=a.business_id group by stage) x) as milestones,
      (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select l.id,l.name,
        (select jsonb_object_agg(stage,occurred_at) from ff_measurement.milestones m where m.location_id=l.id) as milestones
        from public.locations l where l.business_id=a.business_id) x) as locations,
      (select count(*) from ff_measurement.feedback_eligibility f where f.business_id=a.business_id and status in ('staff_test','declared_test','internal')) as excluded_feedback,
      (select count(*) from public.feedback f where f.business_id=a.business_id and not exists(select 1 from ff_measurement.feedback_eligibility e where e.feedback_id=f.id and e.status<>'legacy_unclassified')) as unclassified_feedback,
      (select count(*) from ff_measurement.feedback_eligibility f where f.business_id=a.business_id and status='eligible_unverified' and flagged) as flagged_eligible_feedback
    from ff_measurement.business_acquisition a
    where a.acquired_at >= p_from::timestamp at time zone 'UTC' and a.acquired_at < (p_to+1)::timestamp at time zone 'UTC'
  ) r;
  return result || jsonb_build_object('arrivals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
    select date_trunc('day',j.created_at at time zone 'UTC')::date as cohort,
      j.first_touch->>'utm_source' as source,j.first_touch->>'utm_medium' as medium,
      j.first_touch->>'utm_campaign' as campaign,j.first_touch->>'landing_path' as landing_page,
      count(*) as visitors,count(*) filter(where exists(select 1 from ff_measurement.arrivals v where v.token_hash=j.token_hash and kind='signup_started')) as signup_started,
      count(*) filter(where exists(select 1 from ff_measurement.signup_intents i where i.user_id=j.claimed_by and i.business_id is not null)) as signup_completed
    from ff_measurement.journeys j where j.created_at>=p_from::timestamp at time zone 'UTC' and j.created_at<(p_to+1)::timestamp at time zone 'UTC'
      and not exists(select 1 from ff_measurement.signup_intents i where i.user_id=j.claimed_by and i.business_id is not null and ff_measurement.internal_business(i.business_id))
    group by 1,2,3,4,5) r),'policy_version',1);
end $$;

-- Service-only ingress. Default PUBLIC execute is explicitly removed.
revoke all on all functions in schema ff_measurement from public,anon,authenticated;
revoke all on function public.measurement_rate_limit(text,integer), public.record_acquisition_arrival(text,uuid,uuid,uuid,text,jsonb,uuid),
  public.record_feedback_page_open(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.measurement_rate_limit(text,integer), public.record_acquisition_arrival(text,uuid,uuid,uuid,text,jsonb,uuid),
  public.record_feedback_page_open(uuid,uuid,uuid,boolean) to service_role;
revoke all on function public.complete_acquisition_signup(),public.acquisition_cohort_report(date,date) from public,anon;
grant execute on function public.complete_acquisition_signup(),public.acquisition_cohort_report(date,date) to authenticated;
commit;
