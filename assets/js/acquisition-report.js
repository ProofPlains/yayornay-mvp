(function (w) {
    'use strict';
    const stages = [['qr_ready', 'QR ready'], ['download_requested', 'Download requested'], ['print_requested', 'Print requested'], ['order_paid', 'Order paid'], ['order_fulfilled', 'Order fulfilled'], ['placement_confirmed', 'Placement confirmed'], ['feedback_page_open', 'Eligible page open'], ['eligible_feedback', 'Eligible feedback']];
    const escape = v => String(v ?? 'Unknown').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function summarize(rows, unit = 'business') {
        const groups = new Map();
        for (const b of rows) {
            const key = JSON.stringify([b.acquired_at.slice(0, 10), b.source || '(unknown)', b.medium || '(unknown)', b.campaign || '(none)', b.landing_page || '(unknown)']);
            if (!groups.has(key))
                groups.set(key, { dimensions: JSON.parse(key), businesses: [], excluded: 0 });
            const g = groups.get(key);
            if (b.excluded_internal) {
                g.excluded++;
                continue;
            }
            g.businesses.push(b);
        }
        return [...groups.values()].map(g => {
            const units = unit === 'location' ? g.businesses.flatMap(b => (b.locations || []).map(l => ({ ...b, ...l }))) : g.businesses;
            return { ...g, total: units.length, stages: Object.fromEntries(stages.map(([s]) => [s, units.filter(b => b.milestones?.[s]).length])),
                materials: units.filter(b => ['download_requested', 'print_requested', 'order_fulfilled'].some(s => b.milestones?.[s])).length };
        });
    }
    function intervals(rows) {
        const sequence = [['landing', 'signup', 'Arrival → signup'], ['signup', 'qr_ready', 'Signup → QR ready'], ['qr_ready', 'materials', 'QR ready → materials signal'], ['materials', 'placement_confirmed', 'Materials signal → placement'], ['placement_confirmed', 'feedback_page_open', 'Placement → eligible page open'], ['feedback_page_open', 'eligible_feedback', 'Eligible page open → eligible feedback'], ['signup', 'eligible_feedback', 'Signup → eligible feedback']];
        const at = (b, s) => s === 'landing' ? b.acquired_at : s === 'signup' ? b.signup_completed_at : s === 'materials' ? ['download_requested', 'print_requested', 'order_fulfilled'].map(k => b.milestones?.[k]).filter(Boolean).sort()[0] : b.milestones?.[s];
        return sequence.map(([a, b, label]) => {
            const eligible = rows.filter(r => !r.excluded_internal), denominator = eligible.filter(r => at(r, a)).length;
            const pairs = eligible.filter(r => at(r, a) && at(r, b));
            const hours = pairs.map(r => (Date.parse(at(r, b)) - Date.parse(at(r, a))) / 3600000).filter(x => x >= 0).sort((x, y) => x - y);
            const n = hours.length;
            const median = n ? (hours[Math.floor((n - 1) / 2)] + hours[Math.floor(n / 2)]) / 2 : null;
            return { label, denominator, converted: pairs.length, earlier: pairs.length - n, median };
        });
    }
    function render(root, data, unit) {
        const rows = data.businesses || [], groups = summarize(rows, unit);
        const cell = (n, d) => `${n} / ${d} (${d ? (100 * n / d).toFixed(1) : '0.0'}%)`;
        root.innerHTML = `<p>Primary funnel unit: <strong>${unit === 'business' ? 'distinct businesses' : 'locations (separate detail)'}</strong>. Cohort date is first recorded marketing arrival in UTC, or signup date when attribution is unknown. Source dimensions use first touch.</p>
      <p>Every stage percentage uses all eligible ${unit === 'business' ? 'businesses' : 'locations'} in that cohort as its denominator. Stages may be skipped or occur out of order. Materials signal combines download/print requests or fulfilled orders; it does not prove materials were obtained or placed. Page opens are a scan proxy, not verified physical scans. Eligible feedback is unverified customer activity after known test exclusions.</p>
      <p>${rows.filter(b => b.excluded_internal).length} internal/test businesses excluded; ${rows.filter(b => b.coverage !== 'measured').length} businesses with unknown attribution; ${rows.reduce((n, b) => n + Number(b.excluded_feedback || 0), 0)} known test responses excluded; ${rows.reduce((n, b) => n + Number(b.unclassified_feedback || 0), 0)} historical/legacy responses unclassified; ${rows.reduce((n, b) => n + Number(b.flagged_eligible_feedback || 0), 0)} flagged responses retained as eligible.</p>
      <div style="overflow:auto" tabindex="0" aria-label="Acquisition cohort table"><table><caption>Activation by acquisition cohort</caption><thead><tr><th>Cohort / source / medium / campaign / landing</th><th>Total</th><th>Materials signal</th>${stages.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${groups.map(g => `<tr><th scope="row">${g.dimensions.map(escape).join('<br>')}</th><td>${g.total}</td><td>${cell(g.materials, g.total)}</td>${stages.map(([s]) => `<td>${cell(g.stages[s], g.total)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="11">No cohorts in this date range.</td></tr>'}</tbody></table></div>
      <h3>Conversion and elapsed time · distinct businesses</h3><p>Conditional conversion = businesses with both milestones / businesses with the starting milestone. Median hours use only pairs in chronological order. Earlier outcomes remain counted and are listed separately.</p>
      <div style="overflow:auto" tabindex="0"><table><thead><tr><th>Transition</th><th>Conditional conversion</th><th>Median hours</th><th>Outcome before start</th></tr></thead><tbody>${intervals(rows).map(x => `<tr><th scope="row">${x.label}</th><td>${cell(x.converted, x.denominator)}</td><td>${x.median === null ? '—' : x.median.toFixed(1)}</td><td>${x.earlier}</td></tr>`).join('')}</tbody></table></div>
      <details><summary>Marketing arrivals and signup starts · anonymous journeys</summary><p>Consent-based, with a 90-day attribution window. This is a separate pre-signup visitor unit, never added to business totals. Unknown/unconsented traffic is not estimated. Refreshes within a session are deduplicated.</p><div style="overflow:auto" tabindex="0"><table><thead><tr><th>Cohort / source / medium / campaign / landing</th><th>Visitors</th><th>Signup started / visitors</th><th>Completed / visitors</th></tr></thead><tbody>${(data.arrivals || []).map(r => `<tr><th scope="row">${[r.cohort, r.source, r.medium, r.campaign, r.landing_page].map(escape).join('<br>')}</th><td>${r.visitors}</td><td>${cell(r.signup_started, r.visitors)}</td><td>${cell(r.signup_completed, r.visitors)}</td></tr>`).join('')}</tbody></table></div></details>
      <details><summary>Business and location milestone detail</summary>${rows.filter(b => !b.excluded_internal).map(b => `<details><summary>${escape(b.business_id)} · ${escape(b.coverage)} · latest non-direct source ${escape(b.latest_source)}</summary>${(b.locations || []).map(l => `<p><strong>${escape(l.name)}</strong> (${escape(l.id)})<br>${stages.map(([s, label]) => `${label}: ${escape(l.milestones?.[s] || 'Not observed')}`).join('<br>')}</p>`).join('')}</details>`).join('')}</details>
      <p>Coverage begins when this measurement migration is deployed. Historical feedback and operational metrics are preserved, but unclassified history cannot establish eligible first feedback. Recent cohorts have had less time to activate.</p>`;
    }
    w.FFAcquisitionReport = { summarize, intervals, render, stages };
})(window);
