alter table public.businesses
add column if not exists email_alerts_enabled boolean not null default true;
