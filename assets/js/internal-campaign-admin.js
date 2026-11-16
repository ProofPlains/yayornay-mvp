window.FFInternalCampaignAdmin = {
  mount(panel, client, authorize) {
    const root = panel.querySelector('#internalCampaignReport');
    root.innerHTML = `
      <form data-operation="read"><label>Signup cohort month (UTC) <input name="month" type="month" required></label>
      <button type="submit" class="small-btn">Load report</button></form>
      <p role="status"></p><div data-results></div>
      <p>Before enabling spend: open the campaign's actual Google Ads final URL, confirm it opens signup,
      then paste that URL here and verify the mapping. Repeat after any change in Google Ads.</p>
      <form data-operation="register"><label>Campaign label <input name="code" required pattern="[a-z][a-z0-9_\\-]{2,39}"></label>
      <label>Google Ads campaign ID <input name="ads_id" required inputmode="numeric" pattern="[0-9]{1,20}"></label>
      <button class="small-btn">Save mapping</button></form>
      <form data-operation="verify"><label>Campaign label <input name="code" required></label>
      <label>Google Ads campaign ID <input name="ads_id" required></label>
      <label>Actual final URL from Google Ads <input name="url" type="url" required></label>
      <button class="small-btn">Verify tracking</button></form>
      <form data-operation="cost"><label>Campaign label <input name="code" required></label>
      <label>Monthly spend (GBP) <input name="spend" type="number" min="0" step="0.01" required></label>
      <label>Monthly clicks <input name="clicks" type="number" min="0" step="1" required></label>
      <button class="small-btn">Save for selected month</button></form>`;
    const status = root.querySelector('[role=status]');
    const results = root.querySelector('[data-results]');
    const month = root.querySelector('input[type=month]');
    month.value = new Date().toISOString().slice(0, 7);
    let generation = 0;
    const call = async (op, fields) => {
      const { data, error } = await client.rpc('internal_campaign_admin', { p_operation: op, ...fields });
      if (error) throw Error(error.message);
      return data;
    };
    function render(report) {
      results.replaceChildren();
      const summary = document.createElement('p');
      const cohort = document.createElement('p');
      cohort.textContent = !report.captureHealthy ? 'Campaign capture is off or retention has not run recently.' : 'Campaign capture is on.';
      results.append(cohort);
      summary.textContent = !report.enabledAt ? 'Collection has not started.' : report.closed
        ? 'Closed cohort. Small counts may be withheld.' : 'Open cohort. Recent signups can still convert.';
      results.append(summary);
      const list = document.createElement('ul');
      const campaigns = [...report.campaigns, { code: 'unknown' }];
      for (const campaign of campaigns) {
        const row = document.createElement('li');
        const counts = report.counts.find(x => x.code === campaign.code);
        const cost = report.costs.find(x => x.code === campaign.code);
        const signups = counts?.signups;
        const conversions = counts?.first_feedback;
        const label = campaign.code === 'unknown' ? 'Unknown source' : campaign.code + ' · Google Ads ' + campaign.ads_id;
        row.textContent = label + ': ' + (signups ?? (report.closed ? 'unavailable' : 0)) + ' signups; '
          + (conversions ?? (report.closed ? 'unavailable' : 0)) + ' first feedback'
          + (counts?.maturing ? ' · ' + counts.maturing + ' still maturing' : '')
          + (cost ? ' · £' + Number(cost.spend_gbp).toFixed(2) + ' spend · ' + cost.clicks + ' clicks' : '')
          + (cost && conversions > 0 && !counts?.maturing ? ' · £' + (cost.spend_gbp / conversions).toFixed(2) + ' per conversion' : '');
        if (campaign.ads_id) {
          const url = 'https://flashfeedback.co.uk/?ff_campaign=' + campaign.code;
          const link = document.createElement('a');
          link.href = url;
          link.textContent = url;
          row.append(document.createTextNode(' · ' + (campaign.verified_at
            ? 'Tracking verified ' + new Date(campaign.verified_at).toLocaleDateString() : 'Tracking unverified') + ' · '), link);
          if (campaign.verified_at) {
            const reset = document.createElement('button');
            reset.type = 'button'; reset.className = 'small-btn'; reset.textContent = 'Mark unverified';
            reset.onclick = () => submit('reset', { p_code: campaign.code }, reset);
            row.append(' ', reset);
          }
        }
        list.append(row);
      }
      results.append(list);
    }
    async function submit(operation, fields, button) {
      const current = ++generation;
      if (button) button.disabled = true;
      status.textContent = 'Checking…';
      try {
        await authorize();
        if (current !== generation) return;
        if (operation === 'verify') {
          const expected = 'https://flashfeedback.co.uk/?ff_campaign=' + fields.p_code;
          if (fields.p_url !== expected) throw Error('Use the exact registered URL.');
          const check = await fetch('/?ff_campaign=' + encodeURIComponent(fields.p_code), {
            credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'
          });
          if (!check.ok || !(await check.text()).includes('id="signupInternalCampaignNotice"')) throw Error('Signup route check failed.');
          if (current !== generation) return;
        }
        if (operation !== 'read') await call(operation, fields);
        const report = await call('read', { p_month: month.value + '-01' });
        if (current === generation) {
          render(report);
          status.textContent = operation === 'read' ? 'Report loaded.' : 'Saved.';
        }
      } catch (err) {
        if (current === generation) status.textContent = err.message || 'Unable to load campaign reporting.';
      } finally { if (button) button.disabled = false; }
    }
    root.addEventListener('submit', event => {
      event.preventDefault();
      const fields = {};
      for (const [key, value] of new FormData(event.target)) {
        fields['p_' + key] = key === 'month' ? value + '-01'
          : ['spend','clicks'].includes(key) ? Number(value) : value.trim();
      }
      if (event.target.dataset.operation === 'cost') fields.p_month = month.value + '-01';
      submit(event.target.dataset.operation, fields, event.submitter);
    });
    panel.addEventListener('toggle', () => {
      if (panel.open) submit('read', {});
    });
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { generation++; results.replaceChildren(); status.textContent = ''; }
    });
  }
};
