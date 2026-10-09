-- Schema-only fixture captured read-only from production 2026-10-09; contains no user data.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table public.analytics_events (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  event_type text not null,
  created_at timestamp with time zone default now() not null,
  location_id uuid,
  source text,
  metadata jsonb,
  idempotency_key text
);
create table public.business_invites (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  email text not null,
  role text default 'admin'::text not null,
  token text not null,
  status text default 'pending'::text not null,
  invited_by uuid,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  accepted_at timestamp with time zone,
  accepted_by uuid
);
create table public.business_users (
  business_id uuid not null,
  user_id uuid not null,
  role text not null,
  created_at timestamp with time zone default now() not null,
  general_feedback_alerts_enabled boolean default true not null,
  reply_request_alerts_enabled boolean default true not null
);
create table public.businesses (
  id uuid default gen_random_uuid() not null,
  name text not null,
  owner_id uuid not null,
  created_at timestamp with time zone default now() not null,
  owner_name text,
  logo_url text,
  timezone text default 'Europe/London'::text,
  default_location_id uuid,
  notify_frequency text default 'off'::text,
  theme_color text,
  customer_heading text,
  comments_required boolean default false,
  enable_neutral boolean default true,
  notifications_email text,
  industry text,
  business_type text,
  email_alerts_enabled boolean default true not null,
  pricing_tier text default 'free'::text not null,
  subscription_status text default 'none'::text not null,
  subscription_comped boolean default false not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier_updated_at timestamp with time zone default now() not null,
  subscription_test_mode boolean default false not null,
  pending_pricing_tier text,
  plan_change_effective_at timestamp with time zone,
  stripe_subscription_schedule_id text,
  stripe_test_clock_id text,
  integration_test_mode boolean default false not null
);
create table public.customer_events (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  location_id uuid not null,
  event_type text not null,
  created_at timestamp with time zone default now() not null
);
create table public.feedback (
  id uuid default gen_random_uuid() not null,
  location_id uuid not null,
  business_id uuid not null,
  sentiment text not null,
  comments text,
  submitted_at timestamp with time zone default now() not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  device_key text,
  client_context jsonb default '{}'::jsonb not null,
  anomaly_flags text[] default '{}'::text[] not null,
  anomaly_score integer default 0 not null,
  anomaly_metadata jsonb default '{}'::jsonb not null,
  customer_email text,
  reply_requested boolean default false not null,
  reply_status text,
  reply_started_by uuid,
  reply_started_at timestamp with time zone,
  reply_resolved_by uuid,
  reply_resolved_at timestamp with time zone,
  reply_reminder_sent_at timestamp with time zone,
  reply_expiry_warning_sent_at timestamp with time zone,
  customer_email_erased_at timestamp with time zone
);
create table public.internal_admins (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  email text not null,
  role text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.locations (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  is_active boolean default true not null,
  pending_deactivation_at timestamp with time zone,
  google_review_url text,
  google_review_routing_enabled boolean default false not null
);
create table public.qr_print_order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  created_at timestamp with time zone default now() not null,
  product_type text not null,
  product_name text not null,
  prodigi_sku text not null,
  quantity integer not null,
  quantity_increment integer default 10 not null,
  artwork_url text,
  artwork_storage_path text,
  metadata jsonb default '{}'::jsonb not null
);
create table public.qr_print_orders (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  business_id uuid not null,
  location_id uuid not null,
  user_id uuid,
  product_type text not null,
  product_name text not null,
  prodigi_sku text not null,
  quantity integer not null,
  quantity_increment integer default 10 not null,
  delivery_method text default 'Standard'::text not null,
  shipping_method text default 'Standard'::text not null,
  country text default 'United Kingdom'::text not null,
  country_code text default 'GB'::text not null,
  currency text default 'gbp'::text not null,
  prodigi_quote_amount integer default 0 not null,
  markup_amount integer default 0 not null,
  shipping_amount integer default 0 not null,
  customer_total_amount integer default 0 not null,
  quote_options jsonb default '[]'::jsonb not null,
  quote_expires_at timestamp with time zone,
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_payment_status text default 'pending'::text not null,
  prodigi_order_id text,
  prodigi_status text,
  fulfilment_status text default 'quoted'::text not null,
  tracking_url text,
  shipment_reference text,
  artwork_url text,
  insert_url text,
  prodigi_payload jsonb,
  prodigi_response jsonb,
  callback_payload jsonb,
  error_message text,
  delivery_contact text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  postcode text not null,
  notes text,
  owner_email text,
  owner_name text,
  business_name text,
  location_name text,
  metadata jsonb default '{}'::jsonb not null,
  kit_items jsonb default '[]'::jsonb not null,
  artwork_storage_path text,
  fulfilment_completed_at timestamp with time zone,
  artwork_deleted_at timestamp with time zone,
  internal_email_status text default 'not_tracked'::text not null,
  internal_email_sent_at timestamp with time zone,
  internal_email_error text,
  internal_email_subject text,
  order_kind text default 'paid'::text not null,
  starter_pack_tier text,
  starter_pack_allowance integer
);
create table public.starter_pack_entitlements (
  business_id uuid not null,
  state text default 'eligible'::text not null,
  basis text default 'paid_subscription'::text not null,
  first_eligible_tier text not null,
  eligible_at timestamp with time zone default now() not null,
  order_id uuid,
  reserved_tier text,
  reserved_allowance integer,
  reserved_quantity integer,
  reserved_at timestamp with time zone,
  claimed_at timestamp with time zone,
  admin_granted_by uuid,
  admin_grant_note text,
  admin_granted_allowance integer,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.internal_admins add constraint internal_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.internal_admins add constraint internal_admins_email_normalized CHECK ((email = lower(btrim(email))));
alter table public.internal_admins add constraint internal_admins_pkey PRIMARY KEY (id);
alter table public.internal_admins add constraint internal_admins_role_check CHECK ((role = ANY (ARRAY['superuser'::text, 'admin'::text])));
alter table public.internal_admins add constraint internal_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.internal_admins add constraint internal_admins_user_id_key UNIQUE (user_id);
alter table public.feedback add constraint feedback_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.feedback add constraint feedback_comments_len CHECK (((comments IS NULL) OR (length(comments) <= 500)));
alter table public.feedback add constraint feedback_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
alter table public.feedback add constraint feedback_pkey PRIMARY KEY (id);
alter table public.feedback add constraint feedback_reply_request_email_check CHECK ((((reply_requested = false) AND (customer_email IS NULL) AND (reply_status IS NULL)) OR ((reply_requested = true) AND (reply_status IS NOT NULL) AND ((customer_email IS NOT NULL) OR (customer_email_erased_at IS NOT NULL)))));
alter table public.feedback add constraint feedback_reply_resolved_by_fkey FOREIGN KEY (reply_resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.feedback add constraint feedback_reply_started_by_fkey FOREIGN KEY (reply_started_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.feedback add constraint feedback_reply_status_check CHECK (((reply_status IS NULL) OR (reply_status = ANY (ARRAY['requested'::text, 'in_progress'::text, 'resolved'::text, 'expired'::text]))));
alter table public.feedback add constraint feedback_sentiment_check CHECK ((sentiment = ANY (ARRAY['very-happy'::text, 'happy'::text, 'neutral'::text, 'sad'::text, 'very-sad'::text])));
alter table public.analytics_events add constraint analytics_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.analytics_events add constraint analytics_events_event_type_check CHECK ((event_type = ANY (ARRAY['dashboard_view'::text, 'dashboard_filter_changed'::text, 'dashboard_feedback_expanded'::text, 'dashboard_attention_filter_used'::text, 'dashboard_pagination_clicked'::text, 'dashboard_qr_cta_clicked'::text, 'dashboard_empty_state_cta_clicked'::text, 'feedback_history_upgrade_prompt_shown'::text, 'feedback_history_upgrade_clicked'::text, 'qr_checkout_started'::text, 'qr_downloaded'::text, 'qr_generated'::text, 'qr_deployed'::text, 'qr_step2_path_opened'::text, 'qr_kit_recommendation_shown'::text, 'qr_preview_test_completed'::text, 'qr_print_order_paid'::text, 'qr_print_order_submitted'::text, 'qr_print_order_in_production'::text, 'qr_print_order_shipped'::text, 'qr_print_order_completed'::text, 'qr_print_order_failed'::text, 'paid_upgrade'::text, 'starter_pack_eligible'::text, 'starter_pack_reserved'::text, 'starter_pack_claimed'::text, 'google_review_prompt_shown'::text, 'google_review_cta_clicked'::text, 'google_review_text_link_shown'::text, 'google_review_text_link_clicked'::text, 'owner_onboarding_block_shown'::text, 'owner_onboarding_block_clicked'::text, 'onboarding_card_viewed'::text, 'onboarding_cta_clicked'::text, 'onboarding_dismissed'::text, 'onboarding_completed'::text, 'onboarding_placement_tips_opened'::text, 'onboarding_qr_placed_confirmed'::text, 'reply_request_option_shown'::text, 'reply_request_saved'::text, 'reply_request_alert_attempted'::text, 'reply_request_alert_delivered'::text, 'reply_request_alert_failed'::text, 'reply_request_dashboard_viewed'::text, 'reply_request_email_clicked'::text, 'reply_request_status_prompted'::text, 'reply_request_left_in_progress'::text, 'reply_request_resolved'::text, 'reply_request_reopened'::text, 'reply_request_filter_used'::text, 'reply_request_reminder_sent'::text, 'reply_request_reminder_opened'::text, 'reply_request_expiry_warning_sent'::text, 'reply_request_email_erased'::text, 'ios_install_guidance_shown'::text, 'ios_install_guidance_dismissed'::text, 'ios_settings_install_guidance_opened'::text])));
alter table public.analytics_events add constraint analytics_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
alter table public.analytics_events add constraint analytics_events_pkey PRIMARY KEY (id);
alter table public.business_invites add constraint business_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.business_invites add constraint business_invites_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.business_invites add constraint business_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.business_invites add constraint business_invites_pkey PRIMARY KEY (id);
alter table public.business_invites add constraint business_invites_role_check CHECK ((role = 'admin'::text));
alter table public.business_invites add constraint business_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
alter table public.business_invites add constraint business_invites_token_key UNIQUE (token);
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_admin_allowance_check CHECK (((admin_granted_allowance IS NULL) OR (admin_granted_allowance = ANY (ARRAY[5, 10]))));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_admin_granted_by_fkey FOREIGN KEY (admin_granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_allowance_check CHECK (((reserved_allowance IS NULL) OR (reserved_allowance = ANY (ARRAY[5, 10]))));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_basis_audit_check CHECK ((((basis = 'paid_subscription'::text) AND (admin_granted_allowance IS NULL) AND (admin_granted_by IS NULL)) OR ((basis = 'admin_test'::text) AND (admin_granted_allowance IS NOT NULL) AND (admin_granted_by IS NOT NULL) AND (admin_grant_note IS NOT NULL))));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_basis_check CHECK ((basis = ANY (ARRAY['paid_subscription'::text, 'admin_test'::text])));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_first_tier_check CHECK ((first_eligible_tier = ANY (ARRAY['growth'::text, 'pro'::text])));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_order_id_fkey FOREIGN KEY (order_id) REFERENCES qr_print_orders(id) ON DELETE RESTRICT;
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_order_id_key UNIQUE (order_id);
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_pkey PRIMARY KEY (business_id);
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_reserved_tier_check CHECK (((reserved_tier IS NULL) OR (reserved_tier = ANY (ARRAY['growth'::text, 'pro'::text]))));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_state_check CHECK ((state = ANY (ARRAY['eligible'::text, 'reserved'::text, 'claimed'::text])));
alter table public.starter_pack_entitlements add constraint starter_pack_entitlements_state_shape_check CHECK ((((state = 'eligible'::text) AND (order_id IS NULL) AND (reserved_at IS NULL) AND (claimed_at IS NULL)) OR ((state = 'reserved'::text) AND (order_id IS NOT NULL) AND (reserved_tier IS NOT NULL) AND (reserved_allowance IS NOT NULL) AND ((reserved_quantity >= 1) AND (reserved_quantity <= reserved_allowance)) AND (reserved_at IS NOT NULL) AND (claimed_at IS NULL)) OR ((state = 'claimed'::text) AND (order_id IS NOT NULL) AND (reserved_tier IS NOT NULL) AND (reserved_allowance IS NOT NULL) AND ((reserved_quantity >= 1) AND (reserved_quantity <= reserved_allowance)) AND (reserved_at IS NOT NULL) AND (claimed_at IS NOT NULL))));
alter table public.customer_events add constraint customer_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.customer_events add constraint customer_events_event_type_check CHECK ((event_type = 'learn_more_click'::text));
alter table public.customer_events add constraint customer_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
alter table public.customer_events add constraint customer_events_pkey PRIMARY KEY (id);
alter table public.businesses add constraint businesses_default_location_id_fkey FOREIGN KEY (default_location_id) REFERENCES locations(id) ON DELETE SET NULL;
alter table public.businesses add constraint businesses_industry_check CHECK ((industry = ANY (ARRAY['Hospitality'::text, 'Healthcare'::text, 'Retail'::text, 'Events'::text, 'Beauty & Wellness'::text, 'Fitness & Sport'::text, 'Automotive'::text, 'Education'::text, 'Government & Public'::text, 'Nonprofit'::text, 'Other'::text])));
alter table public.businesses add constraint businesses_notify_frequency_check CHECK ((notify_frequency = ANY (ARRAY['off'::text, 'daily'::text, 'weekly'::text])));
alter table public.businesses add constraint businesses_pending_pricing_tier_check CHECK (((pending_pricing_tier IS NULL) OR (pending_pricing_tier = ANY (ARRAY['free'::text, 'growth'::text, 'pro'::text]))));
alter table public.businesses add constraint businesses_pkey PRIMARY KEY (id);
alter table public.businesses add constraint businesses_pricing_tier_check CHECK ((pricing_tier = ANY (ARRAY['free'::text, 'growth'::text, 'pro'::text])));
alter table public.businesses add constraint businesses_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['none'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'comped'::text])));
alter table public.business_users add constraint business_users_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.business_users add constraint business_users_pkey PRIMARY KEY (business_id, user_id);
alter table public.business_users add constraint business_users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'viewer'::text])));
alter table public.locations add constraint locations_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.locations add constraint locations_pkey PRIMARY KEY (id);
alter table public.qr_print_order_items add constraint qr_print_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES qr_print_orders(id) ON DELETE CASCADE;
alter table public.qr_print_order_items add constraint qr_print_order_items_pkey PRIMARY KEY (id);
alter table public.qr_print_order_items add constraint qr_print_order_items_quantity_check CHECK ((quantity > 0));
alter table public.qr_print_order_items add constraint qr_print_order_items_quantity_increment_check CHECK ((quantity_increment > 0));
alter table public.qr_print_orders add constraint qr_print_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.qr_print_orders add constraint qr_print_orders_internal_email_status_check CHECK ((internal_email_status = ANY (ARRAY['not_tracked'::text, 'sent'::text, 'failed'::text, 'not_applicable'::text])));
alter table public.qr_print_orders add constraint qr_print_orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
alter table public.qr_print_orders add constraint qr_print_orders_order_kind_check CHECK ((order_kind = ANY (ARRAY['paid'::text, 'starter_pack'::text])));
alter table public.qr_print_orders add constraint qr_print_orders_pkey PRIMARY KEY (id);
alter table public.qr_print_orders add constraint qr_print_orders_prodigi_order_id_key UNIQUE (prodigi_order_id);
alter table public.qr_print_orders add constraint qr_print_orders_starter_pack_allowance_check CHECK (((starter_pack_allowance IS NULL) OR (starter_pack_allowance = ANY (ARRAY[5, 10]))));
alter table public.qr_print_orders add constraint qr_print_orders_starter_pack_tier_check CHECK (((starter_pack_tier IS NULL) OR (starter_pack_tier = ANY (ARRAY['growth'::text, 'pro'::text]))));
alter table public.qr_print_orders add constraint qr_print_orders_stripe_session_id_key UNIQUE (stripe_session_id);
alter table public.qr_print_orders add constraint qr_print_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
create unique index analytics_idempotency on public.analytics_events(idempotency_key);
CREATE OR REPLACE FUNCTION public.is_member_of(bid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = bid
      and bu.user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_valid_active_location(loc_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE ok boolean;
BEGIN
  SELECT COALESCE(is_active, true)      -- treat NULL as active
  INTO ok
  FROM public.locations
  WHERE id = loc_id;
  RETURN COALESCE(ok, FALSE);           -- false if no row
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_active_location(p_location uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.locations l
    WHERE l.id = p_location
      AND COALESCE(l.is_active, true) = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.set_feedback_business_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Look up the business for the provided location
  select l.business_id into NEW.business_id
  from public.locations l
  where l.id = NEW.location_id;

  if NEW.business_id is null then
    raise exception 'Invalid location_id (no matching location)';
  end if;

  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_feedback_set_business_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  SELECT l.business_id INTO NEW.business_id
  FROM public.locations l
  WHERE l.id = NEW.location_id;

  IF NEW.business_id IS NULL THEN
    RAISE EXCEPTION 'Invalid location_id';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_feedback_anomaly_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  location_business_id uuid;
  same_device_1h integer := 0;
  same_device_24h integer := 0;
  location_10m integer := 0;
  location_1h integer := 0;
  positive_1h integer := 0;
  flags text[] := coalesce(new.anomaly_flags, '{}'::text[]);
begin
  select locations.business_id
    into location_business_id
  from public.locations
  where locations.id = new.location_id;

  if new.business_id is null then
    new.business_id := location_business_id;
  end if;

  if new.device_key is not null and length(btrim(new.device_key)) > 0 then
    select count(*)
      into same_device_1h
    from public.feedback
    where feedback.device_key = new.device_key
      and feedback.submitted_at >= now() - interval '1 hour';

    select count(*)
      into same_device_24h
    from public.feedback
    where feedback.device_key = new.device_key
      and feedback.submitted_at >= now() - interval '24 hours';

    if same_device_1h >= 2 then
      flags := array_append(flags, 'repeated_device_1h');
    end if;

    if same_device_24h >= 4 then
      flags := array_append(flags, 'repeated_device_24h');
    end if;
  end if;

  select count(*)
    into location_10m
  from public.feedback
  where feedback.location_id = new.location_id
    and feedback.submitted_at >= now() - interval '10 minutes';

  select count(*)
    into location_1h
  from public.feedback
  where feedback.location_id = new.location_id
    and feedback.submitted_at >= now() - interval '1 hour';

  select count(*)
    into positive_1h
  from public.feedback
  where feedback.location_id = new.location_id
    and feedback.submitted_at >= now() - interval '1 hour'
    and feedback.sentiment in ('very-happy', 'happy');

  if location_10m >= 8 then
    flags := array_append(flags, 'location_spike_10m');
  end if;

  if location_1h >= 25 then
    flags := array_append(flags, 'location_spike_1h');
  end if;

  if new.sentiment in ('very-happy', 'happy')
     and location_1h >= 10
     and ((positive_1h + 1)::numeric / (location_1h + 1)::numeric) >= 0.9 then
    flags := array_append(flags, 'positive_spike_1h');
  end if;

  select coalesce(array_agg(distinct flag), '{}'::text[])
    into flags
  from unnest(flags) as flag;

  new.anomaly_flags := flags;
  new.anomaly_score := coalesce(array_length(flags, 1), 0);
  new.anomaly_metadata := jsonb_build_object(
    'same_device_1h', same_device_1h,
    'same_device_24h', same_device_24h,
    'location_10m', location_10m,
    'location_1h', location_1h,
    'positive_1h', positive_1h
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_feedback_reply_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tier text;
begin
  if new.reply_requested is true then
    select businesses.pricing_tier into tier
    from public.locations join public.businesses on businesses.id = locations.business_id
    where locations.id = new.location_id and locations.is_active is true;
    if tier not in ('growth','pro') then
      raise exception 'Reply requests are not available for this location' using errcode = '42501';
    end if;
    new.customer_email := lower(btrim(coalesce(new.customer_email,'')));
    if length(new.customer_email) > 254 or new.customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid email address' using errcode = '22023';
    end if;
    new.reply_status := 'requested';
  else
    new.customer_email := null;
    new.reply_status := null;
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER trg_set_feedback_business_id BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION set_feedback_business_id();
CREATE TRIGGER trg_feedback_set_business BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION set_feedback_business_id();
CREATE TRIGGER trg_feedback_set_business_id BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION fn_feedback_set_business_id();
CREATE TRIGGER feedback_anomaly_tracking_before_insert BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION set_feedback_anomaly_tracking();
CREATE TRIGGER feedback_reply_request_before_insert BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION enforce_feedback_reply_request();
alter table public.businesses enable row level security;
grant select,insert,update,delete on public.businesses to authenticated;
grant insert on public.businesses to anon;
create policy "biz_owner_select" on public.businesses for SELECT to authenticated using ((owner_id = auth.uid()));
create policy "biz_owner_modify" on public.businesses for ALL to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy "Authenticated users can create their own business" on public.businesses for INSERT to authenticated with check ((owner_id = auth.uid()));
create policy "Members can read their business row" on public.businesses for SELECT to authenticated using (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = businesses.id) AND (business_users.user_id = auth.uid()))))));
create policy "Owners can update their business row" on public.businesses for UPDATE to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
alter table public.business_users enable row level security;
grant select,insert,update,delete on public.business_users to authenticated;
grant insert on public.business_users to anon;
create policy "bu_member_select" on public.business_users for SELECT to authenticated using ((auth.uid() = user_id));
create policy "bu_owner_insert" on public.business_users for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "bu_owner_delete" on public.business_users for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Users can read their own business memberships" on public.business_users for SELECT to authenticated using ((user_id = auth.uid()));
create policy "Owners can create their initial owner membership" on public.business_users for INSERT to authenticated with check (((user_id = auth.uid()) AND (role = 'owner'::text) AND (EXISTS ( SELECT 1
   FROM businesses
  WHERE ((businesses.id = business_users.business_id) AND (businesses.owner_id = auth.uid()))))));
alter table public.locations enable row level security;
grant select,insert,update,delete on public.locations to authenticated;
grant insert on public.locations to anon;
create policy "owner can update locations" on public.locations for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM business_users bu
  WHERE ((bu.user_id = auth.uid()) AND (bu.business_id = locations.business_id))))) with check ((EXISTS ( SELECT 1
   FROM business_users bu
  WHERE ((bu.user_id = auth.uid()) AND (bu.business_id = locations.business_id)))));
create policy "loc_member_select" on public.locations for SELECT to authenticated using (is_member_of(business_id));
create policy "loc_member_cud" on public.locations for ALL to authenticated using (is_member_of(business_id)) with check (is_member_of(business_id));
create policy "Members can read business locations" on public.locations for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = locations.business_id) AND (business_users.user_id = auth.uid())))));
create policy "Owners and admins can manage locations" on public.locations for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = locations.business_id) AND (business_users.user_id = auth.uid()) AND (business_users.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) with check ((EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = locations.business_id) AND (business_users.user_id = auth.uid()) AND (business_users.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
alter table public.feedback enable row level security;
grant select,insert,update,delete on public.feedback to authenticated;
grant insert on public.feedback to anon;
create policy "fb_member_select" on public.feedback for SELECT to authenticated using (is_member_of(business_id));
create policy "public can insert feedback for valid active locations" on public.feedback for INSERT to anon,authenticated with check (is_valid_active_location(location_id));
alter table public.analytics_events enable row level security;
grant select,insert,update,delete on public.analytics_events to authenticated;
grant insert on public.analytics_events to anon;
create policy "ae_member_insert" on public.analytics_events for INSERT to authenticated with check (is_member_of(business_id));
create policy "ae_member_select" on public.analytics_events for SELECT to authenticated using (is_member_of(business_id));
create policy "Business members can read onboarding analytics" on public.analytics_events for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM business_users member
  WHERE ((member.business_id = analytics_events.business_id) AND (member.user_id = auth.uid()) AND (member.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) AND (event_type = ANY (ARRAY['qr_generated'::text, 'qr_deployed'::text, 'qr_checkout_started'::text, 'qr_print_order_paid'::text, 'qr_print_order_submitted'::text, 'qr_print_order_in_production'::text, 'qr_print_order_shipped'::text, 'qr_print_order_completed'::text, 'onboarding_qr_placed_confirmed'::text, 'onboarding_completed'::text]))));
create policy "Business members can record product analytics" on public.analytics_events for INSERT to authenticated with check (((EXISTS ( SELECT 1
   FROM business_users member
  WHERE ((member.business_id = analytics_events.business_id) AND (member.user_id = auth.uid()) AND (member.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) AND ((location_id IS NULL) OR (EXISTS ( SELECT 1
   FROM locations location
  WHERE ((location.id = analytics_events.location_id) AND (location.business_id = analytics_events.business_id))))) AND (event_type = ANY (ARRAY['dashboard_view'::text, 'dashboard_filter_changed'::text, 'dashboard_feedback_expanded'::text, 'dashboard_attention_filter_used'::text, 'dashboard_pagination_clicked'::text, 'dashboard_qr_cta_clicked'::text, 'dashboard_empty_state_cta_clicked'::text, 'feedback_history_upgrade_prompt_shown'::text, 'feedback_history_upgrade_clicked'::text, 'qr_checkout_started'::text, 'qr_downloaded'::text, 'qr_generated'::text, 'qr_deployed'::text, 'qr_step2_path_opened'::text, 'qr_kit_recommendation_shown'::text, 'qr_preview_test_completed'::text, 'qr_print_order_paid'::text, 'qr_print_order_submitted'::text, 'qr_print_order_in_production'::text, 'qr_print_order_shipped'::text, 'qr_print_order_completed'::text, 'qr_print_order_failed'::text, 'starter_pack_reserved'::text, 'starter_pack_claimed'::text, 'onboarding_card_viewed'::text, 'onboarding_cta_clicked'::text, 'onboarding_dismissed'::text, 'onboarding_completed'::text, 'onboarding_placement_tips_opened'::text, 'onboarding_qr_placed_confirmed'::text, 'reply_request_dashboard_viewed'::text, 'reply_request_email_clicked'::text, 'reply_request_status_prompted'::text, 'reply_request_left_in_progress'::text, 'reply_request_resolved'::text, 'reply_request_reopened'::text, 'reply_request_filter_used'::text, 'ios_install_guidance_shown'::text, 'ios_install_guidance_dismissed'::text, 'ios_settings_install_guidance_opened'::text]))));
