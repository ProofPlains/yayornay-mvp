/* Current-page signup attribution only, after explicit consent. Loaded before URL cleanup. */
(function (w) {
    'use strict';
    const DAY = 86400000, keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
    const memory = new Map();
    function read(key, session = false) { try {
        return JSON.parse((session ? w.sessionStorage : w.localStorage).getItem(key)) ?? memory.get(key) ?? null;
    }
    catch {
        return memory.get(key) || null;
    } }
    function write(key, value, session = false) { memory.set(key, value); try {
        (session ? w.sessionStorage : w.localStorage).setItem(key, JSON.stringify(value));
    }
    catch { } }
    function remove(key, session = false) { memory.delete(key); try {
        (session ? w.sessionStorage : w.localStorage).removeItem(key);
    }
    catch { } }
    const id = () => w.crypto.randomUUID();
    function marketing(url) {
        return ['/', '/index.html'].includes(url.pathname) && [...url.searchParams.keys()].every(k => keys.includes(k))
            && (!url.hash || /^#(?:landing(?:Title|How|Benefits|Product|Audience|Plans|Final))?$/.test(url.hash));
    }
    function touch(url, referrer) {
        const out = { landing_path: url.pathname, captured_at: new Date().toISOString() };
        for (const key of keys) {
            const v = url.searchParams.get(key);
            if (v && /^[a-zA-Z0-9 _.,:+~-]{1,200}$/.test(v))
                out[key] = v;
        }
        try {
            const r = new URL(referrer);
            if (r.hostname !== url.hostname && !['flashfeedback.co.uk', 'www.flashfeedback.co.uk'].includes(r.hostname))
                out.referrer_host = r.hostname;
        }
        catch { }
        return out;
    }
    // Preserve the current URL in page memory through SEO cleanup. Parse campaign data
    // only after signup consent; never write this URL or a visitor history to storage.
    const arrivalUrl = new URL(w.location.href), arrivalReferrer = w.document.referrer;
    let client, endpoint, anonKey, flushing = false, knownAuthenticated = false, activated = false;
    let signupJourney = null, signupConsented = false;
    // Retire the former 90-day browser journey and consent. It cannot opt in this form.
    ['ff_acquisition', 'ff_measurement_consent'].forEach(key => remove(key));
    ['ff_acquisition_session', 'ff_arrival_ids'].forEach(key => remove(key, true));
    let queue = read('ff_measurement_queue') || [];
    if (!Array.isArray(queue))
        queue = [];
    queue = queue.filter(x => x && x.type !== 'arrival' && x.expires > Date.now() && x.attempts < 12).slice(-100);
    write('ff_measurement_queue', queue);
    // Restore only delivery retries already bound to their original signup account.
    // This is not used to recognise visitors or attribute another page/visit.
    const pending = read('ff_signup_measurement_queue', true);
    if (Array.isArray(pending)) queue.push(...pending.filter(x => x?.type === 'arrival' && x.userId && x.expires > Date.now() && x.attempts < 12));
    const privacyBlocked = () => !!w.navigator.globalPrivacyControl || w.navigator.doNotTrack === '1';
    function saveQueue() {
        write('ff_measurement_queue', queue.filter(x => x.type !== 'arrival'));
        write('ff_signup_measurement_queue', queue.filter(x => x.type === 'arrival'), true);
    }
    function enqueue(type, body, userId = null, sendNow = true) {
        const key = body.idempotency_key || body.id || `${body.kind}:${body.visit_id}`;
        if (queue.some(x => x.key === key))
            return;
        queue.push({ key, type, body, userId, expires: Date.now() + DAY, attempts: 0, next: 0 });
        queue = queue.slice(-100);
        saveQueue();
        if (sendNow) void flush();
    }
    async function flush() {
        if (flushing || !client)
            return;
        flushing = true;
        try {
            const { data: { session } } = await client.auth.getSession();
            const now = Date.now();
            for (const item of [...queue]) {
                if (!queue.includes(item)) continue; // Withdrawal may cancel items while a request is in flight.
                if (item.expires < now || item.attempts >= 12 || (item.type === 'arrival' && privacyBlocked())) {
                    queue = queue.filter(x => x !== item);
                    continue;
                }
                if (item.next > now)
                    continue;
                if (item.userId && item.userId !== session?.user?.id)
                    continue;
                item.attempts++;
                item.next = now + Math.min(300000, 1000 * 2 ** item.attempts) + Math.random() * 500;
                saveQueue();
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                try {
                    const owner = item.type === 'owner';
                    const response = await fetch(owner ? `${endpoint}/rest/v1/analytics_events` : `${endpoint}/functions/v1/track-acquisition`, {
                        method: 'POST', keepalive: true, signal: controller.signal, headers: { 'Content-Type': 'application/json', apikey: anonKey,
                            Authorization: `Bearer ${session?.access_token || anonKey}`, ...(owner ? { Prefer: 'return=minimal' } : {}) }, body: JSON.stringify(item.body)
                    });
                    if (response.ok || (owner && response.status === 409) || (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status)))
                        queue = queue.filter(x => x !== item);
                }
                catch { }
                finally { clearTimeout(timeout); }
            }
        }
        catch { /* Auth/storage failures leave the queue available for a later retry. */ }
        finally {
            saveQueue();
            flushing = false;
        }
    }
    function acquisition(kind) {
        const j = signupJourney;
        if (!signupConsented || !j || privacyBlocked() || j.sent.has(kind)) return;
        j.sent.add(kind);
        enqueue('arrival', { id: id(), kind, token: j.token, visitor_id: j.visitor_id, session_id: j.session_id, touch: j.touch }, null, false);
    }
    function cancelUnsent() {
        signupConsented = false;
        signupJourney = null;
        queue = queue.filter(x => x.type !== 'arrival');
        saveQueue();
        const checkbox = w.document.getElementById('signupCampaignConsent');
        if (checkbox) checkbox.checked = false;
    }
    function signupStarted() {
        const checkbox = w.document.getElementById('signupCampaignConsent');
        if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = privacyBlocked() || knownAuthenticated || !marketing(arrivalUrl);
        }
    }
    async function boot() {
        if (activated || !client)
            return;
        activated = true;
        try {
            const { data: { session } } = await client.auth.getSession();
            knownAuthenticated = !!session?.user;
        }
        catch { }
        void flush();
    }
    function visit(locationId) {
        const key = `ff_visit_${locationId}`;
        let value = read(key, true);
        if (!value || value.expires < Date.now())
            value = { id: id(), expires: Date.now() + 30 * 60000, submission: id() };
        write(key, value, true);
        return value;
    }
    w.FFMeasurement = {
        configure(c, url, key) { client = c; endpoint = url; anonKey = key; void boot(); },
        signupStarted,
        async signupToken(accepted = false) {
            if (!accepted || privacyBlocked() || knownAuthenticated || !marketing(arrivalUrl)) {
                cancelUnsent();
                return null;
            }
            signupConsented = true;
            if (!signupJourney) signupJourney = {
                token: Array.from(w.crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''),
                visitor_id: id(), session_id: id(), sent: new Set(),
                touch: { ...touch(arrivalUrl, arrivalReferrer), attribution_policy: 'signup_visit_v2', consented_at: new Date().toISOString() }
            };
            acquisition('landing');
            acquisition('signup_started');
            await Promise.race([flush(), new Promise(r => setTimeout(r, 1500))]);
            return signupJourney?.token || null;
        },
        signupCreated(userId, token) {
            if (!userId || token !== signupJourney?.token) return;
            queue.filter(x => x.type === 'arrival' && x.body.token === token).forEach(x => { x.userId = userId; });
            saveQueue();
        },
        async consentStatus() {
            const { data, error } = await client.rpc('campaign_measurement_status');
            if (error) throw error;
            if (!['enabled', 'withdrawn', 'not_enabled'].includes(data)) throw new Error('Invalid consent status');
            return data;
        },
        async withdraw() {
            cancelUnsent();
            const { data: { session }, error: authError } = await client.auth.getSession();
            if (authError) throw authError;
            if (!session?.user) return { linked: false };
            const { error } = await client.rpc('withdraw_campaign_measurement');
            if (error) throw error;
            return { linked: true };
        },
        async ownerEvent(body, userId) {
            if (!userId) {
                const { data: { session } } = await client.auth.getSession();
                userId = session?.user?.id;
            }
            if (!userId) return false;
            body.idempotency_key ||= `browser:${id()}`;
            enqueue('owner', body, userId);
            return true;
        },
        async pageOpen(locationId, preview, isTest = false) {
            if (preview) return;
            try {
                const { data: { session } } = await client.auth.getSession();
                const v = visit(locationId);
                // Never replay a known staff visit anonymously after logout.
                enqueue('visit', { id: `open:${v.id}:${isTest}`, kind: 'feedback_page_open', location_id: locationId, visit_id: v.id, is_test: isTest }, session?.user?.id || null);
            } catch { /* Unknown auth state cannot establish an eligible visit. */ }
        },
        submissionKey(locationId) { return visit(locationId).submission; },
        submissionSucceeded(locationId, submissionKey) { const v = visit(locationId); if (v.submission === submissionKey) {
            v.submission = id();
            write(`ff_visit_${locationId}`, v, true);
        } },
        async authToken() { const { data: { session } } = await client.auth.getSession(); return session?.access_token || anonKey; },
        flush, marketing, touch
    };
    w.addEventListener('online', flush);
    w.addEventListener('pagehide', flush);
    w.document.addEventListener('visibilitychange', () => { if (w.document.visibilityState === 'hidden')
        void flush(); });
    setInterval(flush, 10000);
})(window);
