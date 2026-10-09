import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sanitizeTouch, uuid } from '../supabase/functions/_shared/measurement.ts';
test('server strips arbitrary URLs and sensitive fields, limits values and classifies channels', () => {
    const x = sanitizeTouch({ landing_path: '/reset?token=secret', utm_source: 'google', utm_campaign: 'private@example.test', gclid: 'valid123', referrer_host: 'example.com', access_token: 'secret', url: 'https://private.test/?email=foo' });
    assert.deepEqual(Object.keys(x).sort(), ['channel', 'gclid', 'landing_path', 'referrer_host', 'utm_medium', 'utm_source'].sort());
    assert.equal(x.landing_path, '/');
    assert.equal(x.channel, 'paid_other');
    assert.equal(sanitizeTouch({gclid:'valid123',utm_medium:'cpc'}).channel,'paid_search');
    assert.equal(sanitizeTouch({dclid:'valid123',utm_medium:'display'}).channel,'display');
    assert.equal(sanitizeTouch({}).channel, 'direct');
    assert.equal(sanitizeTouch({ utm_medium: 'email' }).channel, 'email');
    assert.equal(sanitizeTouch({ referrer_host: 'google.co.uk' }).channel, 'organic_search');
    assert.equal(sanitizeTouch({ utm_source: 'a'.repeat(201) }).utm_source, '(direct)');
    assert.ok(uuid('11111111-1111-4111-8111-111111111111'));
    assert.ok(!uuid('fake'));
});
test('cohort denominator uses distinct businesses and handles skipped/reversed milestones', () => {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync('assets/js/acquisition-report.js', 'utf8'), ctx);
    const report = ctx.window.FFAcquisitionReport;
    const base = { acquired_at: '2026-10-09T00:00:00Z', signup_completed_at: '2026-10-09T01:00:00Z', source: 'google', medium: 'cpc', campaign: 'x', landing_page: '/' };
    const a = { ...base, business_id: 'one', milestones: { eligible_feedback: '2026-10-09T02:00:00Z', placement_confirmed: '2026-10-09T03:00:00Z' }, locations: [{ id: 'l1', milestones: { eligible_feedback: '2026-10-09T02:00:00Z' } }, { id: 'l2' }] };
    const b = { ...base, business_id: 'two', milestones: { qr_ready: '2026-10-09T02:00:00Z' }, locations: [{ id: 'l3' }] };
    const excluded = { ...a, business_id: 'internal', excluded_internal: true };
    const g = report.summarize([a, b, excluded]);
    assert.equal(g[0].total, 2);
    assert.equal(g[0].stages.eligible_feedback, 1);
    assert.equal(report.summarize([a, b, excluded], 'location')[0].total, 3);
    const conversion = report.intervals([a, b, excluded]).find(x => x.label === 'Signup → eligible feedback');
    assert.equal(conversion.denominator, 2);
    assert.equal(conversion.converted, 1);
    assert.equal(conversion.median, 1);
    const reversal = report.intervals([{ ...a, milestones: { ...a.milestones, feedback_page_open: '2026-10-09T01:30:00Z' } }]).find(x => x.label === 'Placement → eligible page open');
    assert.equal(reversal.earlier, 1);
    assert.equal(reversal.median, null);
});
test('feedback edge preserves storage and replies, marks staff, and replays without alert duplication', async () => {
    let handler;
    let inserted;
    let duplicate = false;
    let alerts = 0;
    const client = { from(table) {
            let mode = 'read';
            const filters = {};
            const chain = {
                select() { return chain; }, eq(k, v) { filters[k] = v; return chain; }, insert(value) { mode = 'insert'; if (table === 'feedback')
                    inserted = value; return chain; },
                maybeSingle: async () => table === 'locations' ? { data: { id: 'loc', name: 'L', business_id: 'biz', is_active: true } } : table === 'businesses' ? { data: { id: 'biz', name: 'B', pricing_tier: 'growth' } } : table === 'business_users' ? { data: { user_id: 'staff' } } : { data: { id: 'saved', submitted_at: 'now' } },
                single: async () => duplicate ? { error: { code: '23505' } } : { data: { id: 'saved', submitted_at: 'now' } },
                then(resolve) { resolve({ error: null }); }
            };
            return chain;
        } };
    const source = ts.transpileModule(fs.readFileSync('supabase/functions/submit-feedback/index.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*;\s*$/gm, '');
    const context = { serve: f => handler = f, createClient: () => client, actorForRequest: async () => 'staff', rateLimit: async () => true, uuid, Request, Response, console,
        Deno: { env: { get: () => 'fixture' } }, fetch: async () => { alerts++; return new Response('{}'); } };
    vm.runInNewContext(source, context);
    const req = p => new Request('http://fixture', { method: 'POST', body: JSON.stringify(p) });
    const payload = { location_id: 'loc', sentiment: 'happy', comments: 'Nice', submission_key: '11111111-1111-4111-8111-111111111111', reply_requested: true, customer_email: 'owner@example.test' };
    assert.equal((await handler(req({ ...payload, preview: true }))).status, 400);
    assert.equal(inserted, undefined);
    assert.equal((await handler(req(payload))).status, 201);
    assert.equal(inserted.measurement_status, 'staff_test');
    assert.equal(inserted.comments, 'Nice');
    assert.equal(alerts, 1);
    duplicate = true;
    assert.equal((await handler(req(payload))).status, 200);
    assert.equal(alerts, 1);
    assert.equal((await handler(req({ ...payload, submission_key: 'invalid' }))).status, 400);
});
