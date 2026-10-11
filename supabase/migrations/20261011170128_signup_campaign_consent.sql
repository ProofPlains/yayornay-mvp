-- Optional signup-visit consent and authenticated self-service withdrawal.
-- No automatic deletion of historical attribution. Existing retention stays intact.
begin;
alter table ff_measurement.signup_intents add column campaign_consent_withdrawn_at timestamptz;

create or replace function public.record_acquisition_arrival(p_hash text,p_visitor uuid,p_session uuid,p_id uuid,p_kind text,p_touch jsonb,p_actor uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Lock the immutable intent before the journey, matching signup/withdrawal order.
  if p_actor is not null then
    perform 1 from ff_measurement.signup_intents
      where user_id=p_actor and token_hash=p_hash and created_at>now()-interval '24 hours' for update;
    if not found then return; end if;
  end if;
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

create function public.withdraw_campaign_measurement() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); i ff_measurement.signup_intents%rowtype;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into i from ff_measurement.signup_intents where user_id=u for update;
  -- Lock journeys before the business snapshot, as delayed arrival recovery does.
  perform 1 from ff_measurement.journeys
    where claimed_by=u or (token_hash=i.token_hash and claimed_by is null) for update;
  update ff_measurement.business_acquisition a
    set first_touch=null,latest_non_direct=null,visitor_id=null,
        coverage='unknown',acquired_at=a.signup_completed_at
    where exists(select 1 from public.businesses b where b.id=a.business_id and b.owner_id=u);
  update ff_measurement.signup_intents
    set token_hash=null,campaign_consent_withdrawn_at=coalesce(campaign_consent_withdrawn_at,now())
    where user_id=u;
  update auth.users set raw_user_meta_data=raw_user_meta_data #- '{ff_setup,journey_token}' where id=u;
  delete from ff_measurement.journeys
    where claimed_by=u or (token_hash=i.token_hash and claimed_by is null);
end $$;
revoke all on function public.withdraw_campaign_measurement() from public,anon;
grant execute on function public.withdraw_campaign_measurement() to authenticated;
-- CREATE OR REPLACE retains the service-only grants on the arrival RPC.
-- Preserve the existing reporting contract, adding a scope dimension to avoid
-- combining the former returning-visitor window with consented signup visits.
create or replace function public.acquisition_cohort_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
  if auth.uid() is null or not exists(select 1 from public.internal_admins where user_id=auth.uid()) then
    raise exception 'Internal admin required' using errcode='42501'; end if;
  if p_to<p_from or p_to-p_from>366 then raise exception 'Choose up to 367 days'; end if;
  select jsonb_build_object('businesses',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) into result from (
    select a.business_id,a.acquired_at,a.signup_completed_at,a.coverage,
      case when a.first_touch is null then 'unknown'
        when a.first_touch->>'attribution_policy'='signup_visit_v2' then 'signup_visit_v2' else 'browser_journey_v1' end as attribution_policy,
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
      case when j.first_touch->>'attribution_policy'='signup_visit_v2' then 'signup_visit_v2' else 'browser_journey_v1' end as attribution_policy,
      count(*) as visitors,count(*) filter(where exists(select 1 from ff_measurement.arrivals v where v.token_hash=j.token_hash and kind='signup_started')) as signup_started,
      count(*) filter(where exists(select 1 from ff_measurement.signup_intents i where i.user_id=j.claimed_by and i.business_id is not null)) as signup_completed
    from ff_measurement.journeys j where j.created_at>=p_from::timestamp at time zone 'UTC' and j.created_at<(p_to+1)::timestamp at time zone 'UTC'
      and not exists(select 1 from ff_measurement.signup_intents i where i.user_id=j.claimed_by and i.business_id is not null and ff_measurement.internal_business(i.business_id))
    group by 1,2,3,4,5,6) r),'policy_version',1);
end $$;
commit;
