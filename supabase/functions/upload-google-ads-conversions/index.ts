import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { configured, accessToken, uploadSignup, processSignup, validWorkerSignature } from '../_shared/google-ads.ts';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const client = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });
const settings = {
  clientId: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '', clientSecret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') || '',
  refreshToken: Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN') || '', accountId: Deno.env.get('GOOGLE_ADS_OPERATING_ACCOUNT_ID') || '',
  actionId: Deno.env.get('GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID') || '', loginAccountId: Deno.env.get('GOOGLE_ADS_LOGIN_ACCOUNT_ID') || '',
};
Deno.serve(async req => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  // Custom HMAC authentication avoids placing the reusable service key in pg_net.
  // A valid signature also needs an unexpired, single-use, backend-created ticket.
  const nonce = req.headers.get('x-ff-nonce') || '';
  if (!await validWorkerSignature(nonce, req.headers.get('x-ff-signature') || '', serviceKey)) return reply(403, { error: 'forbidden' });
  try {
    const text = await req.text();
    if (text.length > 1000) return reply(413, { error: 'payload_too_large' });
    const invocation = await client.rpc('google_ads_consume_invocation', { p_nonce: nonce });
    if (invocation.error) return reply(503, { error: 'invocation_unavailable' });
    const mode = invocation.data;
    if (!['run','health','validate'].includes(mode)) return reply(403, { error: 'invalid_invocation' });
    if (!configured(settings)) return reply(503, { configured: false });
    if (mode === 'health') return reply(200, { configured: true, credentials_exposed: false });
    const token = await accessToken(settings);
    if (mode === 'validate') {
      const result = await uploadSignup({ transaction_id: crypto.randomUUID(), conversion_time: new Date().toISOString() },
        'FF_VALIDATE_ONLY_NO_REAL_CLICK', settings, token, fetch, true);
      return reply(result.outcome === 'validated' ? 200 : 503, { configured: true, validation: result.outcome, conversions_recorded: false });
    }
    let processed = 0;
    while (processed < 3 && await processSignup(client, settings, token)) processed++;
    return reply(200, { processed });
  } catch (error) {
    if (error instanceof Error && error.message === 'google_auth_configuration') await client.rpc('google_ads_pause_reporting');
    // Never log provider messages, request bodies, click IDs or credentials.
    return reply(503, { error: 'reporting_temporarily_unavailable' });
  }
});
