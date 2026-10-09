/* Acquisition only stores allowlisted campaign values after consent. Loaded before URL cleanup. */
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
    const arrivalUrl = new URL(w.location.href), arrival = marketing(arrivalUrl) ? touch(arrivalUrl, w.document.referrer) : null;
    let client, endpoint, anonKey, flushing = false, knownAuthenticated = false, activated = false;
    let queue = read('ff_measurement_queue') || [];
    if (!Array.isArray(queue))
        queue = [];
    queue = queue.filter(x => x && x.expires > Date.now() && x.attempts < 12).slice(-100);
    const consent = () => !w.navigator.globalPrivacyControl && w.navigator.doNotTrack !== '1' && read('ff_measurement_consent') === 'accepted';
    function enqueue(type, body, userId = null) {
        const key = body.idempotency_key || body.id || `${body.kind}:${body.visit_id}`;
        if (queue.some(x => x.key === key))
            return;
        queue.push({ key, type, body, userId, expires: Date.now() + DAY, attempts: 0, next: 0 });
        queue = queue.slice(-100);
        write('ff_measurement_queue', queue);
        void flush();
    }
    async function flush() {
        if (flushing || !client)
            return;
        flushing = true;
        try {
            const { data: { session } } = await client.auth.getSession();
            const now = Date.now();
            for (const item of [...queue]) {
                if (item.expires < now || item.attempts >= 12 || (item.type === 'arrival' && !consent())) {
                    queue = queue.filter(x => x !== item);
                    continue;
                }
                if (item.next > now)
                    continue;
                if (item.userId && item.userId !== session?.user?.id)
                    continue;
                item.attempts++;
                item.next = now + Math.min(300000, 1000 * 2 ** item.attempts) + Math.random() * 500;
                write('ff_measurement_queue', queue);
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
            write('ff_measurement_queue', queue);
            flushing = false;
        }
    }
    function journey() {
        let j = read('ff_acquisition');
        if (!j || !j.expires || j.expires < Date.now()) {
            if (!arrival)
                return null;
            j = { token: Array.from(w.crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''), visitor_id: id(), expires: Date.now() + 90 * DAY, first_touch: arrival };
        }
        let session = read('ff_acquisition_session', true);
        const campaign = arrival ? JSON.stringify([...keys.map(k => arrival[k] || ''), arrival.referrer_host || '']) : '';
        const tagged = arrival && (keys.some(k => arrival[k]) || arrival.referrer_host);
        if (!session || session.expires < Date.now() || (tagged && session.campaign !== campaign))
            session = { id: id(), expires: Date.now() + 30 * 60000, campaign };
        session.expires = Date.now() + 30 * 60000;
        write('ff_acquisition_session', session, true);
        j.session_id = session.id;
        write('ff_acquisition', j);
        return j;
    }
    function acquisition(kind) {
        if (!consent() || knownAuthenticated)
            return;
        const j = journey();
        if (!j)
            return;
        const current = arrival || j.first_touch;
        if (arrival && keys.some(k => arrival[k]) || arrival?.referrer_host)
            j.latest_non_direct = arrival;
        write('ff_acquisition', j);
        const eventKey = `${kind}:${j.session_id}`;
        const sent = read('ff_arrival_ids', true) || {};
        const eventId = sent[eventKey] || id();
        sent[eventKey] = eventId;
        write('ff_arrival_ids', sent, true);
        enqueue('arrival', { id: eventId, kind, token: j.token, visitor_id: j.visitor_id, session_id: j.session_id, touch: current });
    }
    function setConsent(accepted) {
        write('ff_measurement_consent', accepted ? 'accepted' : 'declined');
        if (!accepted) {
            remove('ff_acquisition');
            remove('ff_acquisition_session', true);
            queue = queue.filter(x => x.type !== 'arrival');
            write('ff_measurement_queue', queue);
        }
        w.document.getElementById('ffMeasurementConsent')?.remove();
        if (accepted)
            acquisition('landing');
    }
    function showConsent(force = false) {
        if ((!arrival && !force) || (knownAuthenticated && !force) || w.navigator.globalPrivacyControl || w.navigator.doNotTrack === '1' || (!force && read('ff_measurement_consent')))
            return;
        if (w.document.getElementById('ffMeasurementConsent'))
            return;
        const panel = w.document.createElement('aside');
        panel.id = 'ffMeasurementConsent';
        panel.setAttribute('aria-label', 'Optional measurement');
        panel.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:540px;padding:16px;background:#fff;color:#171717;border:1px solid #777;border-radius:12px;z-index:10000;box-shadow:0 4px 24px #0003;font:14px/1.5 system-ui';
        panel.innerHTML = '<p style="margin:0 0 12px">May we remember which campaign brought you here for 90 days? This helps us understand signups. Optional measurement does not affect your service.</p><button type="button" data-choice="yes">Allow measurement</button> <button type="button" data-choice="no">No thanks</button>';
        panel.querySelectorAll('button').forEach(button => { button.style.cssText = 'padding:10px;margin:2px;border:1px solid #555;border-radius:6px;background:#f5f5f5;color:#171717;cursor:pointer'; button.onclick = () => setConsent(button.dataset.choice === 'yes'); });
        w.document.body.appendChild(panel);
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
        if (arrival && !knownAuthenticated) {
            acquisition('landing');
            showConsent();
        }
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
        signupStarted() { acquisition('signup_started'); },
        async signupToken() { await Promise.race([flush(), new Promise(r => setTimeout(r, 1500))]); return consent() ? journey()?.token : null; },
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
        consentSettings() { showConsent(true); },
        flush, marketing, touch
    };
    w.addEventListener('online', flush);
    w.addEventListener('pagehide', flush);
    w.document.addEventListener('visibilitychange', () => { if (w.document.visibilityState === 'hidden')
        void flush(); });
    setInterval(flush, 10000);
})(window);
