-- Read-only review using the same denominator as the admin activation card.
-- Requires an authenticated internal-admin context. An ordinary Supabase SQL
-- Editor session has no auth.uid() and will receive "Internal admin required".
-- This file is a reporting query, not a migration.
-- Change p_from/p_to and campaign below; p_from/p_to select acquisition cohorts
-- in UTC, not the feedback observation period. RPC limit: up to 367 days.
-- Default range is the last 31 UTC calendar dates. Set the real experiment
-- start date when needed so older campaign signups do not silently fall out.
with parameters as (
  select (now() at time zone 'UTC')::date - 30 as p_from,
    (now() at time zone 'UTC')::date as p_to,
    'restaurants_search_test_01'::text as campaign
), report as (
  select public.acquisition_cohort_report(p_from, p_to) as data, campaign
  from parameters
), cohort as (
  select distinct on (b.value->>'business_id') b.value,
    (b.value->>'signup_completed_at')::timestamptz as signup_at,
    (b.value->'milestones'->>'feedback_page_open')::timestamptz as first_page_open,
    (b.value->'milestones'->>'eligible_feedback')::timestamptz as first_feedback
  from report cross join lateral jsonb_array_elements(data->'businesses') b
  where b.value->>'landing_page' = '/restaurants/'
    and b.value->>'campaign' = report.campaign
    and b.value->>'coverage' = 'measured'
    and b.value->>'attribution_policy' = 'signup_visit_v2'
    and b.value->>'business_id' is not null
    and b.value->>'signup_completed_at' is not null
    and not coalesce((b.value->>'excluded_internal')::boolean, false)
  order by b.value->>'business_id'
)
select value->>'business_id' as business_id, signup_at,
  value->'milestones' as all_milestones,
  first_page_open, first_feedback,
  extract(epoch from (first_page_open - signup_at))/3600 as hours_to_page_open,
  extract(epoch from (first_feedback - signup_at))/3600 as hours_to_feedback,
  signup_at + interval '14 days' <= now() as has_full_14_day_observation,
  coalesce(first_feedback >= signup_at
    and first_feedback <= signup_at + interval '14 days', false) as feedback_within_14_days,
  value->>'excluded_feedback' as excluded_feedback,
  value->>'flagged_eligible_feedback' as flagged_eligible_feedback
from cohort order by signup_at, business_id;
-- Lifetime dashboard rate: rows with first_feedback / all returned rows.
-- 14-day rate: mature rows with feedback_within_14_days=true / all mature rows.
-- If there are no rows/mature rows, that rate is unavailable, not 0%.
-- Keep later outcomes and actual elapsed times. Fresh successes remain visible,
-- but include only mature cohorts in the comparable 14-day conversion rate.
-- Page opens are a scan proxy. Eligible feedback is unverified after known-test
-- exclusions; flagged eligible responses are retained. A timestamp before
-- signup remains visible but does not count as feedback within the 14-day window.
-- Neither this query nor the dashboard estimates unconsented signup attribution
-- or the all-visitor conversion denominator. Consent withdrawal can change cohorts.
