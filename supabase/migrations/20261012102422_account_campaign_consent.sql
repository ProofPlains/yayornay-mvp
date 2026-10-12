-- Consent status survives expiry of the original attribution capability.
begin;
alter table ff_measurement.signup_intents add column campaign_consent_granted boolean not null default false;
update ff_measurement.signup_intents i set campaign_consent_granted=true
where i.token_hash is not null or i.campaign_consent_withdrawn_at is not null
  or exists(select 1 from ff_measurement.business_acquisition a where a.business_id=i.business_id and a.first_touch is not null);
create or replace function ff_measurement.capture_signup_intent() returns trigger
language plpgsql security definer set search_path='' as $$
declare s jsonb:=new.raw_user_meta_data->'ff_setup'; token text; begin
  if jsonb_typeof(s)='object' and length(s->>'business_name') between 1 and 160
    and length(s->>'owner_name') between 1 and 160
    and not exists(select 1 from public.business_invites where lower(email)=lower(new.email) and status='pending' and expires_at>now()) then
    token:=s->>'journey_token';
    insert into ff_measurement.signup_intents(user_id,setup,token_hash,campaign_consent_granted)
    values(new.id,jsonb_build_object('business_name',s->>'business_name','owner_name',s->>'owner_name',
      'location_name',left(coalesce(nullif(s->>'location_name',''),'Location 01'),160),
      'industry',left(s->>'industry',80),'business_type',left(s->>'business_type',160),
      'plan',case when s->>'plan' in ('growth','pro') then s->>'plan' else 'free' end),
      case when token ~ '^[a-f0-9]{64}$' then encode(sha256(convert_to(token,'UTF8')),'hex') end, coalesce(token ~ '^[a-f0-9]{64}$',false));
    -- Freeze the latest touch at auth signup, even when email confirmation follows later.
    update ff_measurement.journeys set claimed_by=new.id
      where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and claimed_by is null and expires_at>now();
  end if;
  return new;
end $$;
create function public.campaign_measurement_status() returns text
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result text;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select case when campaign_consent_withdrawn_at is not null then 'withdrawn'
    when campaign_consent_granted then 'enabled' else 'not_enabled' end into result
    from ff_measurement.signup_intents where user_id=u;
  return coalesce(result,'not_enabled');
end $$;
revoke all on function public.campaign_measurement_status() from public,anon;
grant execute on function public.campaign_measurement_status() to authenticated;
commit;
