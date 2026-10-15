begin;
-- Disabled until the release checklist is completed; no historical backfill.
create table ff_measurement.google_ads_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  rollout_at timestamptz not null default clock_timestamp(),
  last_error_category text,
  last_error_at timestamptz
);
insert into ff_measurement.google_ads_settings default values;
alter table ff_measurement.google_ads_settings enable row level security;
revoke all on ff_measurement.google_ads_settings from public,anon,authenticated;
alter table ff_measurement.signup_intents add column google_ads_consent_version text;

-- Capture new disclosure evidence only at immutable intent creation, never on login.
create function ff_measurement.capture_google_ads_consent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.google_ads_consent_version := null;
  if new.campaign_consent_granted and new.token_hash is not null and exists(
    select 1 from auth.users u where u.id=new.user_id
      and u.raw_user_meta_data#>>'{ff_setup,campaign_disclosure_version}'='google_signup_v1'
      and encode(sha256(convert_to(u.raw_user_meta_data#>>'{ff_setup,journey_token}','UTF8')),'hex')=new.token_hash
  ) then new.google_ads_consent_version := 'google_signup_v1'; end if;
  return new;
end $$;
create trigger ff_capture_google_ads_consent before insert on ff_measurement.signup_intents
for each row execute function ff_measurement.capture_google_ads_consent();

create table ff_measurement.google_ads_signup_conversions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  conversion_type text not null default 'signup' check(conversion_type='signup'),
  transaction_id uuid not null default gen_random_uuid() unique,
  conversion_time timestamptz not null,
  account_id text not null,
  action_id text not null,
  status text not null default 'pending' check(status in ('pending','leased','accepted','uploaded','failed','cancelled','expired','needs_attention')),
  attempt_count integer not null default 0,
  diagnostic_count integer not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_expires_at timestamptz,
  request_id text,
  uploaded_at timestamptz,
  processed_at timestamptz,
  last_error_category text,
  warning_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table ff_measurement.google_ads_signup_conversions enable row level security;
revoke all on ff_measurement.google_ads_signup_conversions from public,anon,authenticated;
create index on ff_measurement.google_ads_signup_conversions(next_attempt_at) where status in ('pending','leased','accepted');

-- Reuse the authoritative internal-business classifier. GCLID stays exclusively
-- in the existing acquisition snapshot, so withdrawal/90-day cleanup still erase it.
create function ff_measurement.google_ads_signup_eligible(b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from ff_measurement.signup_intents i
 join ff_measurement.business_acquisition a on a.business_id=i.business_id
 join public.businesses x on x.id=i.business_id and x.owner_id=i.user_id
 join auth.users u on u.id=i.user_id
 cross join ff_measurement.google_ads_settings s
 where i.business_id=b and i.completed_at is not null and u.email_confirmed_at is not null
   and i.created_at>=s.rollout_at and i.completed_at>=s.rollout_at
   and i.campaign_consent_granted and i.campaign_consent_withdrawn_at is null
   and i.google_ads_consent_version='google_signup_v1' and a.coverage='measured'
   and a.first_touch->>'attribution_policy'='signup_visit_v2'
   and a.first_touch->>'gclid' ~ '^[A-Za-z0-9_-]{1,200}$'
   and a.acquired_at>now()-interval '90 days'
   and not ff_measurement.internal_business(b)
   and exists(select 1 from public.business_users m where m.business_id=b and m.user_id=i.user_id and m.role='owner')
   and exists(select 1 from public.locations l where l.id=x.default_location_id and l.business_id=b));
$$;

-- Withdrawal shares the signup-intent lock with dispatch. An already dispatched
-- HTTP request cannot be recalled; record its eventual acceptance without retrying.
create function ff_measurement.cancel_google_ads_signup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.campaign_consent_withdrawn_at is not null then
   update ff_measurement.google_ads_signup_conversions set status='cancelled',last_error_category='consent_withdrawn'
   where business_id=new.business_id and status in ('pending','leased','accepted');
 end if;
 return new;
end $$;
create trigger ff_cancel_google_ads_signup after update of campaign_consent_withdrawn_at on ff_measurement.signup_intents
for each row execute function ff_measurement.cancel_google_ads_signup();

create function public.google_ads_claim_signup(p_account text,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record; o ff_measurement.google_ads_signup_conversions%rowtype; mode text;
begin
 if not (select enabled from ff_measurement.google_ads_settings) then return null; end if;
 if p_account !~ '^\d{10}$' or p_action !~ '^\d+$' then raise exception 'Invalid conversion destination'; end if;
 -- Periodic reconciliation covers attribution arriving after successful signup.
 insert into ff_measurement.google_ads_signup_conversions(business_id,conversion_time,account_id,action_id)
 select i.business_id,i.completed_at,p_account,p_action from ff_measurement.signup_intents i
 where i.business_id is not null and ff_measurement.google_ads_signup_eligible(i.business_id)
 on conflict(business_id) do nothing;
 for r in select c.business_id,i.user_id from ff_measurement.google_ads_signup_conversions c
   join ff_measurement.signup_intents i on i.business_id=c.business_id
   where c.status in ('pending','leased','accepted') and c.next_attempt_at<=now()
   and (c.lease_expires_at is null or c.lease_expires_at<=now())
   order by c.next_attempt_at limit 50
 loop
   -- Same per-user lock as complete_acquisition_signup / withdrawal; never wait
   -- for a second worker, and consistently lock intent before integration state.
   if not pg_try_advisory_xact_lock(hashtextextended(r.user_id::text,0)) then continue; end if;
   perform 1 from ff_measurement.signup_intents where user_id=r.user_id for update;
   select * into o from ff_measurement.google_ads_signup_conversions where business_id=r.business_id for update;
   if o.lease_expires_at>now() or o.status not in ('pending','leased','accepted') then continue; end if;
   if o.account_id<>p_account or o.action_id<>p_action then
     update ff_measurement.google_ads_signup_conversions set status='needs_attention',last_error_category='destination_changed' where business_id=o.business_id; continue;
   end if;
   if not ff_measurement.google_ads_signup_eligible(o.business_id) then
     update ff_measurement.google_ads_signup_conversions set status='cancelled',last_error_category='no_longer_eligible' where business_id=o.business_id; continue;
   end if;
   mode:=case when o.request_id is not null then 'diagnostics' else 'upload' end;
   if mode='upload' and (o.attempt_count>=12 or o.conversion_time<now()-interval '7 days') then
     update ff_measurement.google_ads_signup_conversions set status='expired',last_error_category='retry_limit' where business_id=o.business_id; continue;
   end if;
   if mode='diagnostics' and (o.diagnostic_count>=24 or o.uploaded_at<now()-interval '24 hours') then
     update ff_measurement.google_ads_signup_conversions set status='needs_attention',last_error_category='diagnostics_timeout' where business_id=o.business_id; continue;
   end if;
   update ff_measurement.google_ads_signup_conversions set lease_id=gen_random_uuid(),lease_expires_at=now()+interval '3 minutes',
     status=case when mode='upload' then 'leased' else 'accepted' end,
     attempt_count=attempt_count+case when mode='upload' then 1 else 0 end,
     diagnostic_count=diagnostic_count+case when mode='diagnostics' then 1 else 0 end,last_attempt_at=now()
     where business_id=o.business_id returning * into o;
   return jsonb_build_object('business_id',o.business_id,'lease_id',o.lease_id,'mode',mode,
     'transaction_id',o.transaction_id,'conversion_time',o.conversion_time,'request_id',o.request_id);
 end loop;
 return null;
end $$;

create function public.google_ads_pause_reporting() returns void
language sql security definer set search_path='' as $$
 update ff_measurement.google_ads_settings set enabled=false,last_error_category='google_auth_configuration',last_error_at=now();
$$;

create function public.google_ads_confirm_signup(p_business uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; g text;
begin
 select user_id into u from ff_measurement.signup_intents where business_id=p_business;
 if u is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform 1 from ff_measurement.signup_intents where user_id=u for update;
 if not (select enabled from ff_measurement.google_ads_settings) or not ff_measurement.google_ads_signup_eligible(p_business) then return null; end if;
 if not exists(select 1 from ff_measurement.google_ads_signup_conversions where business_id=p_business and lease_id=p_lease
   and lease_expires_at>now() and status in ('leased','accepted')) then return null; end if;
 select first_touch->>'gclid' into g from ff_measurement.business_acquisition where business_id=p_business;
 return jsonb_build_object('gclid',g);
end $$;

create function public.google_ads_finish_signup(p_business uuid,p_lease uuid,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o ff_measurement.google_ads_signup_conversions%rowtype; outcome text:=p_result->>'outcome'; code text;
begin
 select * into o from ff_measurement.google_ads_signup_conversions where business_id=p_business and lease_id=p_lease for update;
 if not found then return; end if;
 code:=left(regexp_replace(coalesce(p_result->>'category',''),'[^A-Z_a-z0-9]','','g'),100);
 -- Stale leases cannot complete a newer worker's attempt. Cancellation remains
 -- authoritative even if Google's response arrived after withdrawal.
 if o.status='cancelled' then
   if outcome='accepted' then update ff_measurement.google_ads_signup_conversions set
     request_id=left(p_result->>'request_id',200),uploaded_at=coalesce(uploaded_at,now()) where business_id=p_business; end if;
   return;
 end if;
 if o.status not in ('leased','accepted') then return; end if;
 if outcome='accepted' and o.request_id is null then
   update ff_measurement.google_ads_signup_conversions set status='accepted',request_id=left(p_result->>'request_id',200),
     uploaded_at=coalesce(uploaded_at,now()),next_attempt_at=now()+interval '30 minutes',last_error_category=null,
     warning_count=least(2000,greatest(0,coalesce((p_result->>'warning_count')::int,0))),lease_id=null,lease_expires_at=null where business_id=p_business;
 elsif outcome='uploaded' and o.request_id is not null then
   update ff_measurement.google_ads_signup_conversions set status='uploaded',processed_at=coalesce(processed_at,now()),
     lease_id=null,lease_expires_at=null,last_error_category=null where business_id=p_business;
 elsif outcome in ('retry','processing') then
   update ff_measurement.google_ads_signup_conversions set status=case when request_id is null then 'pending' else 'accepted' end,
     next_attempt_at=now()+make_interval(secs=>case when request_id is null then least(21600,60*power(2,least(attempt_count,9)))
       else 3600 end + random()*30),last_error_category=nullif(code,''),lease_id=null,lease_expires_at=null where business_id=p_business;
 else
   update ff_measurement.google_ads_signup_conversions set status=case when outcome='cancelled' then 'cancelled' when outcome='failed' then 'failed' else 'needs_attention' end,
     last_error_category=nullif(code,''),lease_id=null,lease_expires_at=null where business_id=p_business;
 end if;
end $$;

create function ff_measurement.invoke_google_ads_signup(mode text default 'run') returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; request_id bigint;
begin
 if mode not in ('run','validate','health') then raise exception 'Invalid worker mode'; end if;
 if mode='run' and not (select enabled from ff_measurement.google_ads_settings) then return null; end if;
 select decrypted_secret into project_url from vault.decrypted_secrets where name='project_url';
 select decrypted_secret into service_key from vault.decrypted_secrets where name='service_role_key';
 if project_url is null or service_key is null then raise exception 'Worker scheduler configuration missing'; end if;
 select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/upload-google-ads-conversions',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
   body:=jsonb_build_object('mode',mode),timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
select cron.schedule('ff-google-ads-signup','*/5 * * * *','select ff_measurement.invoke_google_ads_signup()');
-- pg_net stages authenticated request headers. Existing browser SELECT grants
-- are unnecessary for its SECURITY DEFINER HTTP functions and expose secrets.
revoke select on net.http_request_queue from public,anon,authenticated;
-- The scheduler is inert while settings.enabled=false.
revoke all on function ff_measurement.capture_google_ads_consent(),ff_measurement.cancel_google_ads_signup(),
 ff_measurement.google_ads_signup_eligible(uuid),ff_measurement.invoke_google_ads_signup(text) from public,anon,authenticated,service_role;
revoke all on function public.google_ads_claim_signup(text,text),public.google_ads_confirm_signup(uuid,uuid),public.google_ads_finish_signup(uuid,uuid,jsonb),public.google_ads_pause_reporting() from public,anon,authenticated;
grant execute on function public.google_ads_claim_signup(text,text),public.google_ads_confirm_signup(uuid,uuid),public.google_ads_finish_signup(uuid,uuid,jsonb),public.google_ads_pause_reporting() to service_role;
commit;
