begin;

create or replace function ff_measurement.capture_signup_intent() returns trigger
language plpgsql security definer set search_path='' as $$
declare s jsonb:=new.raw_user_meta_data->'ff_setup'; token text; begin
  if jsonb_typeof(s)='object' and length(s->>'business_name') between 1 and 160
    and coalesce(length(s->>'owner_name'),0) <= 160
    and not exists(select 1 from public.business_invites where lower(email)=lower(new.email) and status='pending' and expires_at>now()) then
    token:=s->>'journey_token';
    insert into ff_measurement.signup_intents(user_id,setup,token_hash,campaign_consent_granted)
    values(new.id,jsonb_build_object('business_name',s->>'business_name','owner_name',nullif(btrim(s->>'owner_name'),''),
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

commit;
