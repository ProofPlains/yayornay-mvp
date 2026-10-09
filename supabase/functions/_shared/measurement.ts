// No raw URL, email, address, or user-agent values enter measurement storage.
export const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
export const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export function sanitizeTouch(input: any) {
    const touch: Record<string, string> = { landing_path: input?.landing_path === '/index.html' ? '/index.html' : '/' };
    const captured = Date.parse(input?.captured_at);
    if (Number.isFinite(captured) && captured <= Date.now() + 300000 && captured > Date.now() - 90 * 86400000)
        touch.captured_at = new Date(captured).toISOString();
    for (const key of trackingKeys) {
        const v = input?.[key];
        if (typeof v === 'string' && /^[a-zA-Z0-9 _.,:+~-]{1,200}$/.test(v))
            touch[key] = v;
    }
    if (typeof input?.referrer_host === 'string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/i.test(input.referrer_host) && input.referrer_host.length <= 200) {
        touch.referrer_host = input.referrer_host.toLowerCase();
    }
    const medium = (touch.utm_medium || '').toLowerCase();
    touch.channel = /^(cpc|ppc|paidsearch)$/.test(medium) ? 'paid_search'
        : /^(paid_social|paidsocial)$/.test(medium) ? 'paid_social'
        : /^(display|cpm|banner)$/.test(medium) ? 'display'
        : medium === 'email' ? 'email'
        : /^(organic|seo)$/.test(medium) ? 'organic_search'
        : touch.gclid || touch.dclid || touch.gbraid || touch.wbraid || touch.msclkid ? 'paid_other'
        : touch.fbclid || /^(social|social-media)$/.test(medium) ? 'social'
        : touch.utm_source || touch.utm_medium || touch.utm_campaign || touch.utm_id ? 'tagged_other'
        : touch.referrer_host ? (/^(www\.)?(google\.[a-z.]+|bing.com|duckduckgo.com)$/.test(touch.referrer_host) ? 'organic_search' : 'referral') : 'direct';
    if (!touch.utm_source)
        touch.utm_source = touch.gclid || touch.dclid || touch.gbraid || touch.wbraid ? 'google' : touch.msclkid ? 'bing' : touch.fbclid ? 'facebook' : touch.referrer_host || '(direct)';
    if (!touch.utm_medium)
        touch.utm_medium = touch.channel === 'direct' ? '(none)' : touch.channel;
    return touch;
}
export async function hash(value: string) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function actorForRequest(req: Request, client: any): Promise<string | null> {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === Deno.env.get('SUPABASE_ANON_KEY'))
        return null;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user)
        throw new Error('Invalid authentication');
    return data.user.id;
}
export async function rateLimit(req: Request, client: any, namespace: string, limit = 60) {
    // Supabase gateway supplies this header. Store only a daily salted hash.
    const secret = Deno.env.get('MEASUREMENT_HASH_SECRET');
    if (!secret)
        throw new Error('Measurement is not configured');
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    const bucket = namespace + ':' + await hash(secret + ':' + new Date().toISOString().slice(0, 10) + ':' + ip);
    const { data, error } = await client.rpc('measurement_rate_limit', { p_bucket: bucket, p_limit: limit });
    if (error)
        throw new Error('Measurement unavailable');
    return data === true;
}
