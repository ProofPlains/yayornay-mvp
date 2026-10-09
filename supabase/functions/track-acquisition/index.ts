import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { actorForRequest, hash, rateLimit, sanitizeTouch, uuid } from '../_shared/measurement.ts';
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const allowed = (Deno.env.get('MEASUREMENT_ALLOWED_ORIGINS') || 'https://flashfeedback.co.uk,https://www.flashfeedback.co.uk').split(',');
serve(async (req) => {
    const origin = req.headers.get('origin') || '';
    const headers = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Vary': 'Origin',
        'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json' };
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (!allowed.includes(origin))
        return reply(403, { error: 'Origin not allowed' });
    if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers });
    if (req.method !== 'POST')
        return reply(405, { error: 'Method not allowed' });
    try {
        const raw = await req.text();
        if (raw.length > 8000)
            return reply(413, { error: 'Payload too large' });
        const p = JSON.parse(raw);
        if (!p || typeof p !== 'object' || Array.isArray(p))
            return reply(400, { error: 'Invalid payload' });
        if (!await rateLimit(req, client, 'measurement'))
            return reply(429, { error: 'Please retry later' });
        if (p.kind === 'feedback_page_open') {
            if (!uuid(p.location_id) || !uuid(p.visit_id) || p.preview === true)
                return reply(400, { error: 'Invalid visit' });
            const actor = await actorForRequest(req, client);
            const { error } = await client.rpc('record_feedback_page_open', { p_location: p.location_id, p_visit: p.visit_id, p_actor: actor, p_test: p.is_test === true });
            if (error)
                throw error;
        }
        else {
            if (!['landing', 'signup_started'].includes(p.kind) || !/^[a-f0-9]{64}$/.test(p.token) || !uuid(p.visitor_id) || !uuid(p.session_id) || !uuid(p.id))
                return reply(400, { error: 'Invalid arrival' });
            const actor = await actorForRequest(req, client);
            const { error } = await client.rpc('record_acquisition_arrival', { p_hash: await hash(p.token), p_visitor: p.visitor_id, p_session: p.session_id, p_id: p.id, p_kind: p.kind, p_touch: sanitizeTouch(p.touch), p_actor: actor });
            if (error)
                throw error;
        }
        return reply(200, { ok: true });
    }
    catch (e) {
        if (e instanceof SyntaxError)
            return reply(400, { error: 'Invalid JSON' });
        if (e instanceof Error && e.message === 'Invalid authentication')
            return reply(401, { error: 'Invalid authentication' });
        return reply(503, { error: 'Measurement temporarily unavailable' });
    }
});
