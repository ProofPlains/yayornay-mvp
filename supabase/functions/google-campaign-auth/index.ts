import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { checkedGoogleRedirect } from '../_shared/google-campaign-auth.ts';

const project = new URL(Deno.env.get('SUPABASE_URL')!);
const admin = createClient(project.href, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const allowed = (Deno.env.get('GOOGLE_CAMPAIGN_AUTH_ORIGINS') || 'https://flashfeedback.co.uk').split(',').map(s => s.trim());

Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const headers = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (!allowed.includes(origin)) return reply(403, { error: 'unavailable' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'unavailable' });
  try {
    const raw = await req.text();
    const code = raw.length<=160 ? JSON.parse(raw)?.campaign : null;
    if (typeof code !== 'string' || !/^[a-z][a-z0-9_-]{2,39}$/.test(code) || code === 'unknown') {
      return reply(400, { error: 'unavailable' });
    }
    const allowedCampaign = await admin.rpc('internal_campaign_google_handoff', { p_code: code });
    if (allowedCampaign.error || allowedCampaign.data !== true) return reply(409, { error: 'unavailable' });
    const callback = new URL('/?ff_google=1', origin);
    callback.searchParams.set('ff_campaign', code);
    const authorization = new URL('/auth/v1/authorize?provider=google&prompt=select_account', project);
    // Hosted Auth forwards redirect_to QUERY parameters upstream. Use the
    // server-only header and verify both Auth persistence and the outgoing URL.
    const response = await fetch(authorization, { redirect: 'manual',
      headers: { redirect_to: callback.href }, signal: AbortSignal.timeout(4500) });
    if (response.status !== 302 && response.status !== 303) return reply(502, { error: 'unavailable' });
    const provider = checkedGoogleRedirect(response.headers.get('location'), new URL('/auth/v1/callback', project).href);
    if (!provider) return reply(502, { error: 'unavailable' });
    const recorded = await admin.rpc('internal_campaign_google_handoff',
      { p_code: code, p_state: provider.searchParams.get('state'), p_callback: callback.href });
    if (recorded.error || recorded.data !== true) return reply(409, { error: 'unavailable' });
    return reply(200, { url: provider.href });
  } catch {
    return reply(502, { error: 'unavailable' });
  }
});
