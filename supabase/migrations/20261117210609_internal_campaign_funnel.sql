begin;
create table ff_measurement.internal_campaigns (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]{2,39}$' and code <> 'unknown'),
  ads_id text not null unique check (ads_id ~ '^[0-9]{1,20}$'),
  verified_at timestamptz,
  verified_url text,
  ever_verified boolean not null default false
);
create table ff_measurement.internal_campaign_settings (
  singleton boolean primary key default true check(singleton),
  enabled_at timestamptz,
  capture_enabled boolean not null default false,
  last_cleanup_at timestamptz
);
insert into ff_measurement.internal_campaign_settings default values;
create table ff_measurement.internal_campaign_links (
  user_id uuid primary key references ff_measurement.signup_intents(user_id) on delete cascade,
  code text not null references ff_measurement.internal_campaigns(code),
  captured_at timestamptz not null default now()
);
create table ff_measurement.internal_campaign_test_access (
 email text primary key check(email=lower(email)),
 expires_at timestamptz not null,
 code text not null references ff_measurement.internal_campaigns(code)
);
create table ff_measurement.internal_campaign_totals (
  month date not null,
  code text not null,
  signups bigint,
  first_feedback bigint,
  primary key(month,code)
);
create table ff_measurement.internal_campaign_costs (
  month date not null check (extract(day from month)=1),
  code text not null references ff_measurement.internal_campaigns(code),
  spend_gbp numeric(12,2) not null check(spend_gbp>=0),
  clicks bigint not null check(clicks>=0),
  primary key(month,code)
);
do $$ declare t text; begin
  foreach t in array array['internal_campaigns','internal_campaign_settings','internal_campaign_links','internal_campaign_totals','internal_campaign_costs','internal_campaign_test_access'] loop
    execute format('alter table ff_measurement.%I enable row level security',t);
    execute format('revoke all on ff_measurement.%I from public,anon,authenticated',t);
  end loop;
end $$;

create function ff_measurement.internal_campaign_capture_allowed(p_code text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from ff_measurement.internal_campaigns c
 cross join ff_measurement.internal_campaign_settings s
 where c.code=p_code and c.verified_at is not null and s.enabled_at<=now()
 and ((s.capture_enabled and s.last_cleanup_at>=now()-interval '36 hours')
   or exists(select 1 from ff_measurement.internal_campaign_test_access t where t.code=c.code and t.expires_at>now())));
$$;

create function ff_measurement.internal_campaign_actor_allowed(p_code text,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select ff_measurement.internal_campaign_capture_allowed(p_code) and
 ((select capture_enabled from ff_measurement.internal_campaign_settings) or exists(
   select 1 from auth.users u join ff_measurement.internal_campaign_test_access t
   on t.email=lower(u.email) where u.id=p_actor and t.code=p_code and t.expires_at>now()));
$$;

-- Run after ff_capture_signup_intent. Copy only an allowlisted label, and
-- remove the transport field from Auth metadata in the same transaction.
create function ff_measurement.capture_internal_campaign() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into ff_measurement.internal_campaign_links(user_id,code)
  select new.id,new.raw_user_meta_data->>'ff_internal_campaign'
  where ff_measurement.internal_campaign_actor_allowed(new.raw_user_meta_data->>'ff_internal_campaign',new.id)
    and exists(select 1 from ff_measurement.signup_intents where user_id=new.id)
  on conflict(user_id) do nothing;
  update auth.users set raw_user_meta_data=raw_user_meta_data-'ff_internal_campaign' where id=new.id;
  return new;
end $$;
create trigger ff_zzz_internal_campaign after insert on auth.users
for each row when (new.raw_user_meta_data ? 'ff_internal_campaign')
execute function ff_measurement.capture_internal_campaign();

-- The relay confirms the hosted OAuth service accepted the exact private
-- callback before allowing the browser to visit the provider URL.
create function public.internal_campaign_google_handoff(p_code text,p_state uuid default null,p_callback text default null)
returns boolean language sql stable security definer set search_path='' as $$
 select ff_measurement.internal_campaign_capture_allowed(p_code) and
   ((p_state is null and p_callback is null) or exists(
    select 1 from auth.flow_state where id=p_state and provider_type='google'
      and referrer=p_callback and created_at>=now()-interval '1 minute'));
$$;
revoke all on function public.internal_campaign_google_handoff(text,uuid,text) from public,anon,authenticated;
grant execute on function public.internal_campaign_google_handoff(text,uuid,text) to service_role;

create function public.complete_google_campaign_signup(
  p_business_name text,p_owner_name text,p_location_name text,p_industry text,
  p_business_type text,p_plan text,p_journey_token text,p_campaign text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); was_new boolean; setup jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select exists(select 1 from auth.users where id=actor and created_at>=now()-interval '30 minutes')
   and not exists(select 1 from ff_measurement.signup_intents where user_id=actor)
 into was_new;
 setup:=public.complete_google_business_signup(p_business_name,p_owner_name,p_location_name,
   p_industry,p_business_type,p_plan,p_journey_token);
 if was_new and setup->>'created'='true' and ff_measurement.internal_campaign_actor_allowed(p_campaign,actor) then
   insert into ff_measurement.internal_campaign_links(user_id,code) values(actor,p_campaign)
   on conflict(user_id) do nothing;
 end if;
 return setup;
end $$;
revoke all on function public.complete_google_campaign_signup(text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_google_campaign_signup(text,text,text,text,text,text,text,text) to authenticated;

-- Mark allowlisted businesses before the signup transaction commits, so no
-- asynchronous Google upload or normal analytics can treat them as genuine.
create function ff_measurement.mark_campaign_test_business() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.business_id is not null and old.business_id is null and exists(
  select 1 from auth.users u join ff_measurement.internal_campaign_test_access t on t.email=lower(u.email)
  where u.id=new.user_id and t.expires_at>now()
 ) then
  update public.businesses set integration_test_mode=true,email_alerts_enabled=false where id=new.business_id;
 end if;
 return new;
end $$;
create trigger ff_mark_campaign_test after update of business_id on ff_measurement.signup_intents
for each row execute function ff_measurement.mark_campaign_test_business();

create function public.object_to_internal_campaign_measurement() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('ff_internal_campaign_months',0));
 delete from ff_measurement.internal_campaign_links where user_id=auth.uid();
end
$$;

create function ff_measurement.internal_campaign_counts(p_month date)
returns table(code text,signups bigint,first_feedback bigint,maturing bigint)
language sql stable security definer set search_path='' as $$
 select coalesce(c.code,'unknown'),count(*),
 count(*) filter(where exists(select 1 from public.locations l
    join public.feedback f on f.location_id=l.id and f.business_id=l.business_id
    where l.business_id=i.business_id and f.submitted_at>=i.completed_at
      and f.submitted_at<i.completed_at+interval '14 days')),
 count(*) filter(where i.completed_at+interval '14 days'>now())
 from ff_measurement.signup_intents i
 cross join ff_measurement.internal_campaign_settings s
 left join ff_measurement.internal_campaign_links c on c.user_id=i.user_id
 where i.completed_at>=greatest(p_month::timestamp at time zone 'UTC',s.enabled_at)
   and s.enabled_at is not null and i.completed_at<(p_month+interval '1 month') at time zone 'UTC'
   and i.business_id is not null and not ff_measurement.internal_business(i.business_id)
 group by 1;
$$;

-- Finalise once, atomically with unlinking. Suppress sparse cohorts and sparse
-- outcomes (including the complement); no overlapping permanent totals.
create function ff_measurement.close_internal_campaign_months() returns void
language plpgsql security definer set search_path='' as $$
declare m date; prior date; begin
 perform pg_advisory_xact_lock(hashtextextended('ff_internal_campaign_months',0));
 select (date_trunc('month',enabled_at at time zone 'UTC'))::date into m
 from ff_measurement.internal_campaign_settings where enabled_at is not null;
 select max(month) into prior from ff_measurement.internal_campaign_totals where code='__closed';
 if prior is not null then m:=(prior+interval '1 month')::date; end if;
 while m is not null and (m+interval '1 month 21 days') at time zone 'UTC'<=now() loop
   insert into ff_measurement.internal_campaign_totals(month,code,signups,first_feedback)
   select m,code,signups,
     case when first_feedback>=5 and signups-first_feedback>=5 then first_feedback end
   from ff_measurement.internal_campaign_counts(m) where signups>=5;
   insert into ff_measurement.internal_campaign_totals values(m,'__closed',null,null);
   delete from ff_measurement.internal_campaign_links l using ff_measurement.signup_intents i
   where l.user_id=i.user_id and i.completed_at<(m+interval '1 month') at time zone 'UTC';
   m:=(m+interval '1 month')::date;
 end loop;
 delete from ff_measurement.internal_campaign_links l using ff_measurement.signup_intents i
 where l.user_id=i.user_id and i.completed_at is null and l.captured_at<now()-interval '7 days';
 update ff_measurement.internal_campaign_settings set last_cleanup_at=now();
end $$;

create function public.internal_campaign_admin(p_operation text,p_code text default null,p_ads_id text default null,
 p_url text default null,p_month date default null,p_spend numeric default null,p_clicks bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare expected text:='https://flashfeedback.co.uk/?ff_campaign='||p_code; closed boolean; begin
 if auth.uid() is null or public.current_internal_admin_role() is distinct from 'superuser' then
   raise exception 'Superuser required' using errcode='42501';
 end if;
 if p_operation='register' then
   if exists(select 1 from ff_measurement.internal_campaigns
       where code=p_code and ads_id<>p_ads_id and ever_verified) then
     raise exception 'Use a new label for a different Google Ads campaign';
   end if;
   insert into ff_measurement.internal_campaigns(code,ads_id) values(p_code,p_ads_id)
   on conflict(code) do update set ads_id=excluded.ads_id,verified_at=null,verified_url=null
   where internal_campaigns.ads_id<>excluded.ads_id and not internal_campaigns.ever_verified;
 elsif p_operation='verify' then
   update ff_measurement.internal_campaigns set verified_at=now(),verified_url=expected,ever_verified=true
   where code=p_code and ads_id=p_ads_id and p_url=expected;
   if not found then raise exception 'Final URL or campaign ID does not match the register'; end if;
 elsif p_operation='reset' then
   update ff_measurement.internal_campaigns set verified_at=null,verified_url=null where code=p_code;
 elsif p_operation='cost' then
   insert into ff_measurement.internal_campaign_costs values(p_month,p_code,p_spend,p_clicks)
   on conflict(month,code) do update set spend_gbp=excluded.spend_gbp,clicks=excluded.clicks;
 elsif p_operation='read' then
   if p_month is null or extract(day from p_month)<>1 then raise exception 'Select a cohort month'; end if;
   select exists(select 1 from ff_measurement.internal_campaign_totals where month=p_month and code='__closed') into closed;
   return jsonb_build_object('closed',closed,
    'enabledAt',(select enabled_at from ff_measurement.internal_campaign_settings),
    'captureHealthy',(select capture_enabled and enabled_at<=now() and last_cleanup_at>=now()-interval '36 hours'
      from ff_measurement.internal_campaign_settings),
    'campaigns',(select coalesce(jsonb_agg(to_jsonb(c) order by c.code),'[]') from ff_measurement.internal_campaigns c),
    'costs',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from ff_measurement.internal_campaign_costs c where c.month=p_month),
    'counts',case when closed then
      (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from ff_measurement.internal_campaign_totals t
       where month=p_month and code<>'__closed')
    else (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from ff_measurement.internal_campaign_counts(p_month) t) end);
 else raise exception 'Unknown campaign operation'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function ff_measurement.internal_campaign_actor_allowed(text,uuid),ff_measurement.mark_campaign_test_business(),
 ff_measurement.internal_campaign_capture_allowed(text),ff_measurement.capture_internal_campaign(),ff_measurement.internal_campaign_counts(date),
 ff_measurement.close_internal_campaign_months() from public,anon,authenticated;
revoke all on function public.object_to_internal_campaign_measurement(),
 public.internal_campaign_admin(text,text,text,text,date,numeric,bigint) from public,anon,authenticated;
grant execute on function public.object_to_internal_campaign_measurement(),
 public.internal_campaign_admin(text,text,text,text,date,numeric,bigint) to authenticated;
commit;
