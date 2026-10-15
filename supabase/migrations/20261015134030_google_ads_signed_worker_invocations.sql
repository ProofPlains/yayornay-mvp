begin;
-- Hosted pg_net staging ACLs are owned by the platform, so never stage a reusable
-- service credential. Sign a one-use invocation bound to a server-stored mode.
create table ff_measurement.google_ads_worker_invocations (
  nonce uuid primary key default gen_random_uuid(),
  mode text not null check(mode in ('run','health','validate')),
  expires_at timestamptz not null default now()+interval '3 minutes'
);
alter table ff_measurement.google_ads_worker_invocations enable row level security;
revoke all on ff_measurement.google_ads_worker_invocations from public,anon,authenticated;

create function public.google_ads_consume_invocation(p_nonce uuid) returns text
language sql security definer set search_path='' as $$
 delete from ff_measurement.google_ads_worker_invocations where nonce=p_nonce and expires_at>now() returning mode;
$$;
revoke all on function public.google_ads_consume_invocation(uuid) from public,anon,authenticated;
grant execute on function public.google_ads_consume_invocation(uuid) to service_role;

create or replace function ff_measurement.invoke_google_ads_signup(mode text default 'run') returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; ticket uuid; signature text; request_id bigint;
begin
 if mode not in ('run','health','validate') then raise exception 'Invalid worker mode'; end if;
 if mode='run' and not (select enabled from ff_measurement.google_ads_settings) then return null; end if;
 delete from ff_measurement.google_ads_worker_invocations where expires_at<=now();
 select decrypted_secret into project_url from vault.decrypted_secrets where name='project_url';
 select decrypted_secret into service_key from vault.decrypted_secrets where name='service_role_key';
 if project_url is null or service_key is null then raise exception 'Worker scheduler configuration missing'; end if;
 insert into ff_measurement.google_ads_worker_invocations(mode) values(mode) returning nonce into ticket;
 signature:=encode(extensions.hmac(convert_to(ticket::text,'UTF8'),convert_to(service_key,'UTF8'),'sha256'),'hex');
 select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/upload-google-ads-conversions',
   headers:=jsonb_build_object('Content-Type','application/json','x-ff-nonce',ticket::text,'x-ff-signature',signature),
   body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function ff_measurement.invoke_google_ads_signup(text) from public,anon,authenticated,service_role;
commit;
