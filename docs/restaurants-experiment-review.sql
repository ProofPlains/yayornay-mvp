-- Run with an authenticated internal-admin context: the RPC enforces that access.
-- Change the dates/campaign below for the experiment. This is read-only.
with report as (
  select public.acquisition_cohort_report(current_date - 30, current_date) as data
), cohort as (
  select b.value,
    (b.value->>'signup_completed_at')::timestamptz as signup_at,
    (b.value->'milestones'->>'feedback_page_open')::timestamptz as first_page_open,
    (b.value->'milestones'->>'eligible_feedback')::timestamptz as first_feedback
  from report cross join lateral jsonb_array_elements(data->'businesses') b
  where b.value->>'landing_page' = '/restaurants/'
    and b.value->>'campaign' = 'restaurants_search_test_01'
    and b.value->>'attribution_policy' = 'signup_visit_v2'
    and not coalesce((b.value->>'excluded_internal')::boolean, false)
)
select value->>'business_id' as business_id, signup_at,
  value->'milestones' as all_milestones,
  first_page_open, first_feedback,
  extract(epoch from (first_page_open - signup_at))/3600 as hours_to_page_open,
  extract(epoch from (first_feedback - signup_at))/3600 as hours_to_feedback,
  signup_at + interval '14 days' <= now() as has_full_14_day_observation,
  first_feedback >= signup_at and first_feedback <= signup_at + interval '14 days' as feedback_within_14_days,
  value->>'excluded_feedback' as excluded_feedback,
  value->>'flagged_eligible_feedback' as flagged_eligible_feedback
from cohort order by signup_at;
-- Keep later outcomes; compare 14-day conversion only among mature cohorts.
-- Page opens are a scan proxy. Eligible feedback is unverified after known-test exclusions.
-- This cannot estimate unconsented signups or the all-visitor conversion denominator.
