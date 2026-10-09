import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
const root = process.cwd();
const locationId = '11111111-1111-4111-8111-111111111111';
test('HTTP browser journeys, consent, preview, offline queue, mobile and keyboard', { timeout: 90000 }, async (t) => {
    const server = http.createServer((req, res) => {
        const name = new URL(req.url, 'http://localhost').pathname;
        const file = path.join(root, name === '/' ? 'index.html' : name);
        if (!file.startsWith(root) || !fs.existsSync(file)) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
    let browser;
    try {
        browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : {}) });
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const calls = [];
        let failTracking = false;
        await context.addInitScript(({ locationId }) => {
            window.__ffSession = /fixture_(admin|owner)/.test(location.search) ? { access_token: 'fixture-token', user: { id: '33333333-3333-4333-8333-333333333333', email: 'fixture@example.test' } } : null;
            window.__ffCalls = [];
            const row = { id: locationId, location_id: locationId, name: 'Fixture Cafe', location_name: 'Fixture Cafe', business_name: 'Fixture', business_id: '22222222-2222-4222-8222-222222222222', is_active: !location.search.includes('inactive'), reply_requests_enabled: false };
            window.__ffClient = {
                auth: { getSession: async () => ({ data: { session: window.__ffSession } }), getUser: async () => ({ data: { user: window.__ffSession?.user } }), onAuthStateChange: () => { }, signOut: async () => ({}), signUp: async (value) => { window.__ffCalls.push({ signup: value }); return { data: { user: { id: '33333333-3333-4333-8333-333333333333' }, session: null }, error: null }; }, signInWithPassword: async () => ({ error: { message: 'Confirm email' } }) },
                rpc: async () => ({ data: null, error: null }),
                from(table) {
                    const owner = location.search.includes('fixture_owner');
                    const biz = { id: row.business_id, name: 'Fixture business', owner_id: '33333333-3333-4333-8333-333333333333', pricing_tier: 'free', default_location_id: row.id };
                    const membership = { business_id: row.business_id, user_id: biz.owner_id, role: 'owner' };
                    const single = () => table === 'location_public' ? row : owner && table === 'businesses' ? biz : owner && table === 'business_users' ? membership : null;
                    const chain = new Proxy({}, { get(_t, key) { if (key === 'then')
                            return resolve => resolve({ data: table === 'location_public' ? row : owner && table === 'businesses' ? [biz] : owner && table === 'business_users' ? [membership] : owner && table === 'locations' ? [row] : [], error: null }); if (key === 'single' || key === 'maybeSingle')
                            return async () => ({ data: single(), error: null }); return () => chain; } });
                    return chain;
                }
            };
            window.Chart = class {
                static register() { }
                destroy() { }
                update() { }
            };
            window.QRCodeStyling = class {
                append() { }
                update() { }
                getRawData() { return Promise.resolve(new Blob()); }
            };
        }, { locationId });
        await context.route('**/*', async (route) => {
            const url = route.request().url();
            if (url.startsWith(base))
                return route.continue();
            if (url.includes('esm.sh/@supabase/supabase-js'))
                return route.fulfill({ contentType: 'text/javascript', body: 'export const createClient=()=>window.__ffClient;' });
            if (url.includes('supabase-js'))
                return route.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient:()=>window.__ffClient};' });
            if (url.includes('/functions/v1/admin-auth-status'))
                return route.fulfill({ contentType: 'application/json', body: '{"isAdmin":true,"role":"superuser"}' });
            if (url.includes('/functions/v1/admin-support-overview'))
                return route.fulfill({ contentType: 'application/json', body: '{"isAdmin":true,"role":"superuser","businesses":[],"metricsSnapshot":{"metrics":{}}}' });
            if (url.includes('/rpc/acquisition_cohort_report'))
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ businesses: [{ business_id: 'fixture-business', acquired_at: new Date().toISOString(), signup_completed_at: new Date().toISOString(), source: 'google', medium: 'cpc', campaign: 'fixture', landing_page: '/', coverage: 'measured', milestones: { qr_ready: new Date().toISOString() }, locations: [] }], arrivals: [] }) });
            if (url.includes('/functions/v1/track-acquisition')) {
                calls.push(JSON.parse(route.request().postData()));
                return route.fulfill({ status: failTracking ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ ok: !failTracking }) });
            }
            if (url.includes('/functions/v1/submit-feedback')) {
                calls.push({ feedback: JSON.parse(route.request().postData()), authorization: route.request().headers().authorization });
                return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ feedback_id: '44444444-4444-4444-8444-444444444444', submitted_at: new Date().toISOString() }) });
            }
            // Absolutely no traffic leaves the fixture browser for a production API or CDN.
            if (url.includes('.supabase.co/'))
                return route.fulfill({ contentType: 'application/json', body: '{}' });
            if (/\.js(?:\?|$)|chart.js|qr-code-styling|jspdf/.test(url))
                return route.fulfill({ contentType: 'text/javascript', body: '' });
            return route.abort();
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await t.test('tagged marketing arrival requires consent and retains only allowlisted URL data', async () => {
            await page.goto(base + '/?utm_source=google&utm_medium=cpc&utm_campaign=launch&gbraid=abc');
            await page.waitForSelector('#ffMeasurementConsent');
            assert.equal(calls.length, 0);
            await page.getByRole('button', { name: 'Allow measurement', exact: true }).focus();
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => !document.getElementById('ffMeasurementConsent'));
            await page.waitForTimeout(100);
            assert.equal(calls[0].kind, 'landing');
            assert.equal(calls[0].touch.gbraid, 'abc');
            assert.ok(await page.locator('link[rel=canonical]').count());
            const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ff_acquisition')));
            assert.equal(stored.first_touch.utm_source, 'google');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        });
        await t.test('direct return preserves first touch and later campaign updates latest touch', async () => {
            await page.goto(base);
            await page.waitForTimeout(100);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ff_acquisition')).first_touch.utm_source), 'google');
            await page.goto(base + '/?utm_source=newsletter&utm_medium=email');
            await page.waitForTimeout(100);
            const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ff_acquisition')));
            assert.equal(stored.first_touch.utm_source, 'google');
            assert.equal(stored.latest_non_direct.utm_source, 'newsletter');
            await page.evaluate(() => window.showSignup());
            assert.equal(await page.locator('#signupScreen').isVisible(), true);
        });
        await t.test('QR opens deduplicate across refresh and preview/inactive routes do not track', async () => {
            calls.length = 0;
            await page.goto(base + '/?location=' + locationId);
            await page.waitForTimeout(150);
            const first = calls.find(x => x.kind === 'feedback_page_open');
            assert.ok(first);
            await page.reload();
            await page.waitForTimeout(100);
            assert.ok(calls.filter(x => x.kind === 'feedback_page_open').every(x => x.visit_id === first.visit_id));
            calls.length = 0;
            await page.goto(base + '/?location=' + locationId + '&ff_test=1');
            await page.waitForTimeout(100);
            assert.equal(calls.some(x => x.kind === 'feedback_page_open'), false);
            await page.goto(base + '/?location=' + locationId + '&inactive=1');
            await page.waitForTimeout(100);
            assert.equal(calls.some(x => x.kind === 'feedback_page_open'), false);
            assert.equal(await page.locator('#locationClosedNotice').isVisible(), true);
        });
        await t.test('customer saves and explicit previews/demo never submit; staff-test choice is sent', async () => {
            calls.length = 0;
            await page.goto(base + '/?location=' + locationId);
            await page.waitForSelector('[data-sentiment="happy"]');
            await page.locator('[data-sentiment="happy"]').click();
            await page.locator('details').filter({ has: page.locator('#feedbackTestSubmission') }).locator('summary').click();
            await page.locator('#feedbackTestSubmission').check();
            await page.locator('#submitFeedbackBtn').click();
            await page.waitForTimeout(100);
            const saved = calls.find(x => x.feedback);
            assert.ok(saved);
            assert.equal(saved.feedback.is_test, true);
            assert.ok(saved.feedback.submission_key);
            calls.length = 0;
            await page.goto(base + '/?location=' + locationId + '&ff_test=1');
            await page.waitForSelector('[data-sentiment="happy"]');
            await page.locator('[data-sentiment="happy"]').click();
            await page.locator('#submitFeedbackBtn').click();
            await page.waitForTimeout(100);
            assert.equal(calls.some(x => x.feedback), false);
            await page.goto(base);
            await page.evaluate(() => window.showDemo());
            await page.locator('[data-sentiment="happy"]').click();
            await page.locator('#submitFeedbackBtn').click();
            await page.waitForTimeout(100);
            assert.equal(calls.some(x => x.feedback), false);
        });
        await t.test('signup sends durable setup metadata before email confirmation', async () => {
            await page.goto(base + '/?utm_source=signup-fixture');
            await page.evaluate(() => window.showSignup());
            await page.locator('#businessName').fill('Fixture Cafe');
            await page.locator('#ownerName').fill('Fixture Owner');
            await page.locator('#signupIndustry').selectOption('Hospitality');
            await page.locator('#email').fill('owner@example.test');
            await page.locator('#password').fill('test-password');
            await page.locator('#confirmPassword').fill('test-password');
            await page.getByRole('button', { name: 'Create Account', exact: true }).click();
            await page.locator('#pricingModalContinue').click();
            await page.waitForFunction(() => window.__ffCalls.some(x => x.signup));
            const signup = await page.evaluate(() => window.__ffCalls.find(x => x.signup).signup);
            assert.equal(signup.options.data.ff_setup.business_name, 'Fixture Cafe');
            assert.ok(signup.options.data.ff_setup.journey_token);
            assert.match(await page.locator('#signupError').textContent(), /confirm your email/i);
        });
        await t.test('failed delivery survives navigation and retries the same ID', async () => {
            failTracking = true;
            calls.length = 0;
            await page.goto(base + '/?utm_source=offline&utm_campaign=retry');
            await page.waitForTimeout(100);
            const failed = calls.find(x => x.kind === 'landing');
            assert.ok(failed);
            assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('ff_measurement_queue')))).length);
            failTracking = false;
            await page.reload();
            await page.waitForTimeout(2300);
            await page.evaluate(() => window.FFMeasurement.flush());
            assert.ok(calls.filter(x => x.id === failed.id).length >= 2);
        });
        await t.test('blocked storage falls back to memory without breaking the page', async () => {
            const isolated = await browser.newContext({ serviceWorkers: 'block' });
            await isolated.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
            await isolated.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
            const p = await isolated.newPage();
            await p.goto(base);
            const works = await p.evaluate(() => { const x = window.FFMeasurement.submissionKey('fixture'); return x === window.FFMeasurement.submissionKey('fixture'); });
            assert.equal(works, true);
            await isolated.close();
        });
        await t.test('owner dashboard and internal cohort reporting remain usable', async () => {
            await page.goto(base + '/?fixture_owner=1');
            await page.waitForFunction(() => window.currentUser?.businessName === 'Fixture business');
            assert.equal(await page.evaluate(() => window.currentUser.pricingTier), 'free');
            assert.equal(await page.locator('#ffMeasurementConsent').count(), 0);
            await page.goto(base + '/admin-support.html?fixture_admin=1');
            await page.locator('#metricsTab').click();
            await page.locator('#acquisitionRefresh').click();
            await page.waitForFunction(() => document.getElementById('acquisitionStatus').textContent.startsWith('Loaded.'));
            assert.match(await page.locator('#acquisitionReport').textContent(), /google/);
            await page.locator('#acquisitionUnit').selectOption('location');
            assert.match(await page.locator('#acquisitionReport').textContent(), /locations \(separate detail\)/);
            await page.setViewportSize({ width: 1440, height: 1000 });
            fs.mkdirSync('test-results', { recursive: true });
            await page.screenshot({ path: 'test-results/cohort-desktop.png', fullPage: false });
            await page.setViewportSize({ width: 390, height: 844 });
            assert.ok(await page.locator('#acquisitionCohorts').evaluate(el => el.getBoundingClientRect().right <= innerWidth), 'cohort card fits a mobile viewport');
        });
        fs.mkdirSync('test-results', { recursive: true });
        await page.screenshot({ path: 'test-results/marketing-mobile.png', fullPage: false });
        assert.deepEqual(errors, []);
        await context.close();
    }
    finally {
        await browser?.close();
        await new Promise(r => server.close(r));
    }
});
