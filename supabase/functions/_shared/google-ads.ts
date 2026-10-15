// Intentionally GCLID-only. Never pass arbitrary browser/user objects to Google.
export const googleScope = 'https://www.googleapis.com/auth/datamanager';
export async function validWorkerSignature(nonce: string, signature: string, secret: string) {
  if (!secret || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g)!, b => parseInt(b,16)), new TextEncoder().encode(nonce));
}
export type GoogleSettings = { clientId: string; clientSecret: string; refreshToken: string; accountId: string; actionId: string; loginAccountId?: string };
export function configured(s: GoogleSettings) {
  return !!(s.clientId && s.clientSecret && s.refreshToken && /^\d{10}$/.test(s.accountId) && /^\d+$/.test(s.actionId)
    && (!s.loginAccountId || /^\d{10}$/.test(s.loginAccountId)));
}
export function signupPayload(job: any, gclid: string, settings: GoogleSettings) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(gclid) || !/^[a-f0-9-]{36}$/i.test(job.transaction_id)
    || !Number.isFinite(Date.parse(job.conversion_time))) throw new Error('invalid_local_event');
  return {
    destinations: [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: settings.accountId }, productDestinationId: settings.actionId,
      ...(settings.loginAccountId ? { loginAccount: { accountType: 'GOOGLE_ADS', accountId: settings.loginAccountId } } : {}) }],
    events: [{ adIdentifiers: { gclid }, eventTimestamp: new Date(job.conversion_time).toISOString(), eventSource: 'WEB', transactionId: job.transaction_id,
      consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_DENIED' } }],
  };
}
// Store categories, never provider error messages/payloads (which may echo identifiers).
export function failure(status: number, stage = 'upload') {
  if ([408,425,429].includes(status) || status >= 500) return { outcome: 'retry', category: stage + '_temporary_' + status };
  if ([401,403].includes(status)) return { outcome: 'needs_attention', category: stage + '_authorization_' + status };
  return { outcome: 'failed', category: stage + '_validation_' + status };
}
export async function accessToken(s: GoogleSettings, fetcher: typeof fetch = fetch) {
  const r = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: s.clientId, client_secret: s.clientSecret, refresh_token: s.refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15000) });
  const body = await r.json();
  if (!r.ok || typeof body.access_token !== 'string') throw new Error(r.status === 400 || r.status === 401 || r.status === 403 ? 'google_auth_configuration' : 'google_auth_unavailable');
  return body.access_token as string;
}
export async function uploadSignup(job: any, gclid: string, s: GoogleSettings, token: string, fetcher: typeof fetch = fetch, validateOnly = false) {
  let payload;
  try { payload = signupPayload(job, gclid, s); } catch { return { outcome: 'failed', category: 'invalid_local_event' }; }
  try {
    const r = await fetcher('https://datamanager.googleapis.com/v1/events:ingest', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ ...payload, ...(validateOnly ? { validateOnly: true } : {}) }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) return failure(r.status);
    const body = await r.json();
    if (validateOnly) return { outcome: 'validated' };
    if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.requestId)) return { outcome: 'retry', category: 'ambiguous_acceptance' };
    return { outcome: 'accepted', request_id: body.requestId, warning_count: Array.isArray(body.fieldWarnings) ? body.fieldWarnings.length : 0 };
  } catch { return { outcome: 'retry', category: 'ambiguous_network' }; }
}
export async function diagnoseSignup(job: any, token: string, fetcher: typeof fetch = fetch) {
  try {
    const r = await fetcher('https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=' + encodeURIComponent(job.request_id), {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return failure(r.status, 'diagnostics');
    const body = await r.json();
    const destinations = body.requestStatusPerDestination;
    if (!Array.isArray(destinations) || destinations.length !== 1) return { outcome: 'processing', category: 'diagnostics_pending' };
    const result = destinations[0];
    const errors = result.errorInfo?.errorCounts || [];
    if (result.requestStatus === 'SUCCESS' && !errors.length) return { outcome: 'uploaded' };
    // A retry of an ambiguously accepted request can be reported as a duplicate.
    if (errors.length && errors.every((e: any) => ['PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID','PROCESSING_ERROR_REASON_DUPLICATE_GCLID'].includes(e.reason)))
      return { outcome: 'uploaded' };
    if (['FAILED','FAILURE','PARTIAL_SUCCESS'].includes(result.requestStatus)) return { outcome: 'needs_attention', category: 'google_processing_failed' };
    return { outcome: 'processing', category: 'google_processing' };
  } catch { return { outcome: 'processing', category: 'diagnostics_network' }; }
}
export async function processSignup(db: any, settings: GoogleSettings, token: string, fetcher: typeof fetch = fetch) {
  const claim = await db.rpc('google_ads_claim_signup', { p_account: settings.accountId, p_action: settings.actionId });
  if (claim.error) throw new Error('queue_unavailable');
  const job = claim.data;
  if (!job) return false;
  const check = await db.rpc('google_ads_confirm_signup', { p_business: job.business_id, p_lease: job.lease_id });
  if (check.error) throw new Error('eligibility_unavailable');
  const result = !check.data ? { outcome: 'cancelled', category: 'no_longer_eligible' }
    : job.mode === 'diagnostics' ? await diagnoseSignup(job, token, fetcher)
    : await uploadSignup(job, check.data.gclid, settings, token, fetcher);
  const saved = await db.rpc('google_ads_finish_signup', { p_business: job.business_id, p_lease: job.lease_id, p_result: result });
  if (saved.error) throw new Error('result_persistence_failed');
  return true;
}
