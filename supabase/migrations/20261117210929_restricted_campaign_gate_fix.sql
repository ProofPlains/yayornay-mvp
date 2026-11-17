begin;
create or replace function ff_measurement.internal_campaign_capture_allowed(p_code text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from ff_measurement.internal_campaigns c
 cross join ff_measurement.internal_campaign_settings s
 where c.code=p_code and c.verified_at is not null and
 ((s.enabled_at<=now() and s.capture_enabled and s.last_cleanup_at>=now()-interval '36 hours')
   or exists(select 1 from ff_measurement.internal_campaign_test_access t where t.code=c.code and t.expires_at>now())));
$$;
revoke all on function ff_measurement.internal_campaign_capture_allowed(text) from public,anon,authenticated;
commit;
