begin;

-- Keep the password signup disclosure check. The Google setup RPC supplies
-- equivalent disclosure evidence directly on the private intent row.
create or replace function ff_measurement.capture_google_ads_consent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.campaign_consent_granted and new.token_hash is not null and (
    new.google_ads_consent_version = 'google_signup_v1' or exists (
      select 1 from auth.users u where u.id=new.user_id
        and u.raw_user_meta_data#>>'{ff_setup,campaign_disclosure_version}'='google_signup_v1'
        and encode(sha256(convert_to(u.raw_user_meta_data#>>'{ff_setup,journey_token}','UTF8')),'hex')=new.token_hash
    )
  ) then
    new.google_ads_consent_version := 'google_signup_v1';
  else
    new.google_ads_consent_version := null;
  end if;
  return new;
end $$;

create function public.complete_google_business_signup(
  p_business_name text, p_owner_name text, p_location_name text,
  p_industry text, p_business_type text, p_plan text, p_journey_token text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  journey_hash text;
begin
  select email into actor_email from auth.users where id=actor and email_confirmed_at is not null;
  if actor_email is null or not exists (
    select 1 from auth.identities where user_id=actor and provider='google'
  ) then
    raise exception 'Confirmed Google authentication required' using errcode='42501';
  end if;

  -- Share the existing signup lock and retain the first completed setup.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if exists (select 1 from ff_measurement.signup_intents where user_id=actor) then
    return public.complete_acquisition_signup();
  end if;
  if exists (select 1 from public.businesses where owner_id=actor)
    or exists (select 1 from public.business_users where user_id=actor)
    or exists (
      select 1 from public.business_invites
      where accepted_by=actor or (lower(email)=lower(actor_email) and status='pending' and expires_at>now())
    ) then
    return null;
  end if;

  if coalesce(length(btrim(p_business_name)),0) not between 1 and 160
    or coalesce(length(btrim(p_owner_name)),0)>160
    or coalesce(length(p_location_name),0)>160 or coalesce(length(p_business_type),0)>160 then
    raise exception 'Invalid business setup details' using errcode='22023';
  end if;
  if p_journey_token ~ '^[a-f0-9]{64}$' then
    journey_hash := encode(sha256(convert_to(p_journey_token,'UTF8')),'hex');
  end if;
  insert into ff_measurement.signup_intents (
    user_id, setup, token_hash, campaign_consent_granted, google_ads_consent_version
  ) values (
    actor, jsonb_build_object(
      'business_name',btrim(p_business_name),'owner_name',nullif(btrim(p_owner_name),''),
      'location_name',coalesce(nullif(btrim(p_location_name),''),'Location 01'),
      'industry',left(p_industry,80),'business_type',p_business_type,
      'plan',case when p_plan in ('growth','pro') then p_plan else 'free' end
    ), journey_hash, journey_hash is not null,
    case when journey_hash is not null then 'google_signup_v1' end
  );
  return public.complete_acquisition_signup();
end $$;

revoke all on function public.complete_google_business_signup(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.complete_google_business_signup(text,text,text,text,text,text,text) to authenticated;

commit;
