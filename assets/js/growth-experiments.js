/* Internal board. Supabase is the only persistent backlog; no browser-storage copy. */
(function (global) {
  'use strict';
  const STATES = { testing: 'Testing now', next: 'Next', later: 'Later', completed: 'Completed' };
  const OUTCOMES = {
    A: 'Not enough relevant search traffic',
    B: 'Relevant clicks, but few measured signups',
    C: "Signups, but businesses don’t get their QR ready",
    D: 'QR ready/downloaded/ordered, but few real opens',
    E: 'QR opens occur, but little feedback is submitted',
    F: 'Businesses activate, but paid acquisition looks expensive',
    G: 'Activation is strong and acquisition economics look promising'
  };
  const RULES = {
    A: [['EXP-002', 'Capture relevant QR-tool intent with immediate value.'], ['EXP-003', 'Test practical placement searches beyond software keywords.'], ['EXP-006', 'Create demand among operators who are not searching for software.'], ['EXP-010', 'Reach operators through trusted suppliers. Validate activation before investing.']],
    B: [['EXP-002', 'Offer a useful QR sign before asking for an account.'], ['EXP-005', 'Make the proposition concrete by experiencing the customer journey.']],
    C: [['EXP-002', 'Carry ready-to-use QR configuration into onboarding.'], ['EXP-007', 'Reduce the work needed to prepare and deploy physical materials.']],
    D: [['EXP-003', 'Help operators place prompts where customers notice them.'], ['EXP-007', 'Make physical deployment easier with practical materials and wording.']],
    E: [['CTA', 'Test clearer QR/CTA wording and the invitation to submit feedback.'], ['EXP-003', 'Placement and the customer moment may affect willingness to respond.']],
    F: [['EXP-003', 'Test practical organic search as an acquisition and activation route.'], ['EXP-004', 'Use existing customer journeys as a referral loop once scans are meaningful.'], ['EXP-006', 'Test problem-led content as an alternative to paid demand capture.'], ['EXP-008', 'Test adjacent reputation-search demand with useful educational content.'], ['EXP-010', 'Test distribution through trusted restaurant suppliers.']]
  };
  const CTA_IDEA = {
    title: 'Restaurant QR / CTA messaging experiment', category: 'QR messaging / activation',
    hypothesis: 'A clearer invitation at the QR touchpoint will increase genuine feedback submissions among customers who open the feedback page.',
    why_it_might_work: 'Customers may open the page without understanding why to respond or how little effort it takes.',
    test_when: 'Real QR opens occur but little feedback is submitted; first rule out staff tests, tracking gaps and a small sample.',
    primary_success_signal: 'Eligible genuine feedback submissions per eligible real feedback-page open.',
    notes: 'Suggested by outcome E. Define the wording and comparison before starting.'
  };
  function recommendations(outcome, records) {
    return (RULES[outcome] || []).map(([id, reason]) => ({
      id, reason, experiment: id === 'CTA'
        ? records.find(r => r.category === CTA_IDEA.category && !r.archived_at)
        : records.find(r => r.experiment_id === id)
    }));
  }
  function brief(record) {
    const definition = record.completed_definition || record;
    return `# ${record.experiment_id} — ${definition.title}\n\nStatus: ${STATES[record.status]}${record.archived_at ? ' (archived)' : ''}\nType/channel: ${definition.category}\n\nHypothesis: ${definition.hypothesis || 'Not yet defined'}\n\nWhy it matters: ${definition.why_it_might_work || 'Not yet defined'}\n\nTest when: ${definition.test_when || 'Not yet defined'}\n\nPrimary success signal: ${definition.primary_success_signal || 'Not yet defined'}\n\nSupporting signals: ${definition.supporting_signals || 'Not yet defined'}\n\nEvidence/notes: ${record.notes || 'None recorded'}\n\nOutcome: ${record.outcome || 'Not yet recorded'}\nLearning: ${record.learning || 'Not yet recorded'}\nNext step: ${record.next_step_notes || 'Not yet recorded'}\n`;
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const button = (action, id, label, disabled = false) => `<button type="button" class="btn" data-growth-action="${action}" data-id="${escape(id)}"${disabled ? ' disabled' : ''}>${label}</button>`;
  function mount({ root, client, authorize, viewResults }) {
    let records = [], loaded = false, loading = false, busy = false, epoch = 0, returnFocus = null;
    root.innerHTML = `
      <div class="intro growth-intro"><div><h2>Growth Experiments</h2><p class="muted">What are we testing, what have we learned, and what could come next?</p></div>
        <div class="growth-actions">${button('add', '', '+ Add experiment idea')}${button('refresh', '', 'Refresh backlog')}</div></div>
      <p class="growth-message" role="status" aria-live="polite"></p>
      <div class="growth-banner"></div>
      <section class="growth-decision"><h3>What happened in the current experiment?</h3>
        <p class="muted">Choose the strongest evidence. Check sample size and measurement gaps before deciding. Recommendations are candidates, not commitments.</p>
        <label>Outcome<select class="growth-outcome"><option value="">Choose what happened…</option>${Object.entries(OUTCOMES).map(([key, label]) => `<option value="${key}">${escape(label)}</option>`).join('')}</select></label>
        <div class="growth-recommendations" aria-live="polite"></div></section>
      <div class="growth-filters"><label>Status<select class="growth-state"><option value="">All four states</option>${Object.entries(STATES).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        <label>Type/channel<select class="growth-type"><option value="">All types/channels</option></select></label></div>
      <p class="muted">Keep Next to 2–3 candidates. Review this backlog before deciding what to test next.</p>
      <div class="growth-board"></div><details class="growth-archives"><summary>Archived experiments</summary><div class="growth-archive-list"></div></details>
      <dialog class="growth-dialog" aria-labelledby="growthDialogTitle"><form class="growth-form"><h3 id="growthDialogTitle"></h3><div class="growth-fields"></div><p class="growth-form-error" role="alert"></p><div class="growth-actions"><button class="btn" type="submit">Save</button><button class="btn" type="button" data-growth-action="cancel">Cancel</button></div></form></dialog>`;
    const query = selector => root.querySelector(selector);
    const dialog = query('dialog'), form = query('form');
    let formMode = '', editing = null, defaults = null;
    function message(text, error = false) { query('.growth-message').textContent = text; query('.growth-message').classList.toggle('error', error); }
    function clear() {
      epoch++; records = []; loaded = false; loading = false; busy = false;
      editing = null; defaults = null; formMode = ''; returnFocus = null;
      if (dialog.open) dialog.close();
      query('.growth-fields').replaceChildren(); query('.growth-form-error').textContent = '';
      query('.growth-type').innerHTML = '<option value="">All types/channels</option>';
      query('.growth-banner').replaceChildren(); query('.growth-board').replaceChildren();
      query('.growth-archive-list').replaceChildren(); query('.growth-recommendations').replaceChildren();
      query('.growth-outcome').value = ''; message('');
    }
    function failure(error) {
      if (['NO_SESSION', 'SUPERUSER_REQUIRED'].includes(error.code) || ['42501', 'PGRST301'].includes(error.code) || [401, 403].includes(error.status)) clear();
      message(error.message || 'Could not save. Your changes have not been confirmed.', true);
    }
    async function load() {
      if (loading || busy) return;
      loading = true; const version = epoch; message('Loading backlog…');
      try {
        await authorize();
        const { data, error } = await client.from('growth_experiments').select('*').order('sort_order').order('created_at');
        if (error) throw error;
        if (version !== epoch) return;
        records = data; loaded = true; render(); message('Backlog up to date.');
      } catch (error) { if (version === epoch) failure(error); }
      finally { if (version === epoch) loading = false; }
    }
    async function save(values, record) {
      if (busy) return false;
      if (loading) { query('.growth-form-error').textContent = 'Wait for the backlog refresh to finish, then save.'; return false; }
      busy = true; const version = epoch;
      root.querySelectorAll('button').forEach(el => { el.dataset.wasDisabled = String(el.disabled); el.disabled = true; });
      try {
        await authorize();
        if (version !== epoch) return false;
        const table = client.from('growth_experiments');
        const request = record ? table.update(values).eq('experiment_id', record.experiment_id).eq('updated_at', record.updated_at) : table.insert(values);
        const { data, error } = await request.select('*').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('This experiment changed in another session. Cancel, refresh the backlog and review before saving again.');
        if (version !== epoch) return false;
        records = record ? records.map(r => r.experiment_id === data.experiment_id ? data : r) : [...records, data];
        loaded = true; render(); message('Saved to the backlog.'); return true;
      } catch (error) { if (version === epoch) { failure(error); query('.growth-form-error').textContent = error.message; } return false; }
      finally {
        if (version === epoch) {
          busy = false;
          root.querySelectorAll('button[data-was-disabled]').forEach(el => { el.disabled = el.dataset.wasDisabled === 'true'; delete el.dataset.wasDisabled; });
        }
      }
    }
    function actions(record) {
      const id = record.experiment_id;
      if (record.archived_at) return button('restore', id, 'Restore experiment') + button('copy', id, 'Copy experiment brief');
      return button('edit', id, 'Edit details') + button('copy', id, 'Copy experiment brief') +
        (id === 'EXP-001' ? button('results', id, 'View acquisition results') : '') +
        (record.status !== 'completed' ?
          (record.status !== 'next' && record.status !== 'testing' ? button('next', id, 'Move to Next') : '') +
          (record.status !== 'testing' ? button('start', id, 'Start experiment') : button('pause', id, 'Pause')) +
          (record.status !== 'later' ? button('later', id, 'Return to Later') : '') + button('complete', id, 'Complete experiment') : '') +
        button('archive', id, 'Archive');
    }
    function card(record) {
      const definition = record.completed_definition || record;
      return `<details class="growth-card" data-card-id="${escape(record.experiment_id)}"><summary>
        <span class="growth-meta">${escape(record.experiment_id)} · ${escape(STATES[record.status])} · ${escape(definition.category)}</span>
        <strong>${escape(definition.title)}</strong><span class="growth-short">${escape(definition.hypothesis || 'Idea captured — define the hypothesis when ready.')}</span>
        <span class="growth-short muted"><b>Test when:</b> ${escape(definition.test_when || 'Not yet defined')}</span><span class="growth-view">View details</span></summary>
        <div class="growth-card-body">${[['Hypothesis', definition.hypothesis], ['Why this might work', definition.why_it_might_work], ['Test when', definition.test_when], ['Primary success signal', definition.primary_success_signal], ['Supporting signals', definition.supporting_signals], ['Effort', definition.effort], ['Likely cash cost', definition.cash_cost], ['Notes / evidence', record.notes], ['What happened?', record.outcome], ['What did we learn?', record.learning], ['What should happen next?', record.next_step_notes]].map(([label, value]) => `<div><h4>${label}</h4><p>${escape(value || 'Not yet recorded')}</p></div>`).join('')}
          ${record.completed_at ? `<p class="muted">Completed ${escape(new Date(record.completed_at).toLocaleDateString())}. Original definition preserved.</p>` : ''}
          <p class="muted">Updated ${escape(new Date(record.updated_at).toLocaleString())}</p><div class="growth-actions">${actions(record)}</div></div></details>`;
    }
    function renderRecommendations() {
      const outcome = query('.growth-outcome').value;
      if (outcome === 'G') {
        query('.growth-recommendations').innerHTML = '<p>Continue/deepen EXP-001, increase the sample carefully, support restaurant SEO, and optimise conversion. Record the evidence in EXP-001; a new backlog experiment is not required.</p>'; return;
      }
      const cards = recommendations(outcome, records).map(item => {
        const record = item.experiment;
        const title = record?.title || (item.id === 'CTA' ? CTA_IDEA.title : item.id);
        let action = record ? (!record.archived_at && record.status === 'later' ? button('next', record.experiment_id, 'Move to Next') : `<p class="muted">${record.archived_at ? 'Archived — restore from Archived experiments to reconsider.' : escape(STATES[record.status]) + ' — review its evidence before changing direction.'}</p>`) :
          (item.id === 'CTA' ? button('create-cta', '', 'Create messaging experiment') : '<p class="muted">Not available in the live backlog.</p>');
        return `<article class="growth-recommendation"><h4>${escape(record?.experiment_id || 'New idea')} · ${escape(title)}</h4><p>${escape(item.reason)}</p>${action}</article>`;
      });
      query('.growth-recommendations').innerHTML = cards.slice(0, 4).join('') + (cards.length > 4 ? `<details><summary>One more candidate to consider</summary>${cards.slice(4).join('')}</details>` : '');
    }
    function render() {
      const open = new Set([...root.querySelectorAll('.growth-card[open]')].map(el => el.dataset.cardId));
      const active = records.filter(r => r.status === 'testing' && !r.archived_at);
      query('.growth-banner').innerHTML = active.length ? active.map(r => `<article><span class="growth-meta">${escape(r.experiment_id)} · Testing now</span><h3>${escape(r.title)}</h3><p>${escape(r.hypothesis || 'Hypothesis not yet defined.')}</p><p><b>Primary outcome:</b> ${escape(r.primary_success_signal || 'Not yet defined')}</p><div class="growth-actions">${r.experiment_id === 'EXP-001' ? button('results', r.experiment_id, 'View results') : ''}${button('complete', r.experiment_id, 'Record outcome / Complete experiment')}</div></article>`).join('') : '<p>No experiment is testing now. Review Next when you are ready.</p>';
      const selectedType = query('.growth-type').value;
      query('.growth-type').innerHTML = '<option value="">All types/channels</option>' + [...new Set(records.filter(r => !r.archived_at).map(r => r.category))].sort().map(type => `<option value="${escape(type)}">${escape(type)}</option>`).join('');
      query('.growth-type').value = selectedType;
      const status = query('.growth-state').value, type = query('.growth-type').value;
      query('.growth-board').innerHTML = Object.entries(STATES).filter(([key]) => !status || status === key).map(([key, label]) => {
        const group = records.filter(r => r.status === key && !r.archived_at && (!type || r.category === type));
        return `<section class="growth-state-section"><h3>${label} <span class="muted">(${group.length})</span></h3>${key === 'next' ? '<p class="muted">Candidates, not commitments.</p>' : ''}<div class="growth-cards">${group.length ? group.map(card).join('') : '<p class="muted">No experiments here yet.</p>'}</div></section>`;
      }).join('');
      query('.growth-archive-list').innerHTML = records.filter(r => r.archived_at).map(card).join('') || '<p class="muted">No archived experiments.</p>';
      root.querySelectorAll('.growth-card').forEach(el => { el.open = open.has(el.dataset.cardId); });
      renderRecommendations();
    }
    function field(name, label, value, { required = false, input = false, options = null, readonly = false } = {}) {
      return `<label>${label}${options ? `<select name="${name}">${options.map(option => `<option${option === value ? ' selected' : ''}>${escape(option)}</option>`).join('')}</select>` : input ? `<input name="${name}" value="${escape(value)}" maxlength="200"${required ? ' required' : ''}>` : `<textarea name="${name}" rows="3"${required ? ' required' : ''}${readonly ? ' readonly' : ''}>${escape(value)}</textarea>`}</label>`;
    }
    function openForm(mode, record = null, values = {}) {
      formMode = mode; editing = record; defaults = values; returnFocus = document.activeElement;
      query('.growth-form-error').textContent = '';
      query('#growthDialogTitle').textContent = ({ add: 'Add experiment idea', edit: 'Edit experiment', complete: 'Complete experiment', archive: 'Archive experiment', brief: 'Copy experiment brief' })[mode];
      const submit = form.querySelector('[type="submit"]'); submit.hidden = mode === 'brief'; submit.textContent = mode === 'complete' ? 'Record learning & complete' : mode === 'archive' ? 'Archive experiment' : 'Save';
      let html = '';
      if (mode === 'add') html = field('title', 'Title', values.title || '', { required: true, input: true }) + field('notes', 'Optional note', values.notes || '') + '<p class="muted">Saved to Later as an idea. You can fill in the definition when ready.</p>';
      if (mode === 'edit') {
        const definition = record.completed_definition || record;
        html = record.completed_definition ? '<p class="muted">The original completed definition is preserved. Update evidence and learning below.</p>' : field('title', 'Title', record.title, { required: true, input: true });
        if (!record.completed_definition) {
          html += field('category', 'Type/channel', record.category, { input: true });
          for (const [name, label] of [['hypothesis', 'Hypothesis'], ['why_it_might_work', 'Why this might work'], ['test_when', 'Test when'], ['primary_success_signal', 'Primary success signal'], ['supporting_signals', 'Supporting signals']]) html += field(name, label, definition[name]);
          html += field('effort', 'Effort', record.effort, { options: ['Unspecified', 'Low', 'Medium', 'High'] });
          html += field('cash_cost', 'Likely cash cost', record.cash_cost, { options: ['Unspecified', 'None/minimal', 'Low', 'Medium', 'Potentially high'] });
        }
        html += field('notes', 'Notes / evidence', record.notes);
      }
      if (mode === 'complete' || (mode === 'edit' && record.completed_definition)) html += field('outcome', 'What happened?', record.outcome, { required: true }) + field('learning', 'What did we learn?', record.learning, { required: true }) + field('next_step_notes', 'What should happen next? (optional)', record.next_step_notes);
      if (mode === 'archive') html = `<p>Archive ${escape(record.title)}? Its definition, evidence and learning will be retained. You can restore it later.</p>`;
      if (mode === 'brief') html = field('brief', 'Select and copy this brief', brief(record), { readonly: true });
      query('.growth-fields').innerHTML = html; dialog.showModal(); query('.growth-fields input, .growth-fields textarea, button[type="submit"]').focus();
      if (mode === 'brief') query('textarea').select();
    }
    dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); else query('[data-growth-action="add"]').focus(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return;
      const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()]));
      if (formMode === 'complete') values.status = 'completed';
      if (formMode === 'archive') { Object.keys(values).forEach(key => delete values[key]); values.archived_at = new Date().toISOString(); }
      if (formMode === 'add') Object.assign(values, defaults, { title: values.title, notes: values.notes, status: 'later' });
      if (['add', 'edit'].includes(formMode) && 'title' in values && !values.title) { query('.growth-form-error').textContent = 'Enter a title.'; return; }
      if (('learning' in values) && (!values.outcome || !values.learning)) { query('.growth-form-error').textContent = 'Record what happened and what you learned.'; return; }
      if (await save(values, editing)) dialog.close();
    });
    root.addEventListener('click', async event => {
      const target = event.target.closest('[data-growth-action]'); if (!target || busy) return;
      const action = target.dataset.growthAction, record = records.find(r => r.experiment_id === target.dataset.id);
      if (action === 'cancel') { dialog.close(); return; }
      if (action === 'refresh') { await load(); return; }
      if (action === 'add') { openForm('add'); return; }
      if (action === 'create-cta') { openForm('add', null, CTA_IDEA); return; }
      if (!record) return;
      if (['edit', 'complete', 'archive'].includes(action)) { openForm(action, record); return; }
      if (action === 'results') { viewResults(record); return; }
      if (action === 'copy') {
        try { await navigator.clipboard.writeText(brief(record)); message('Experiment brief copied.'); }
        catch (_) { openForm('brief', record); } return;
      }
      const changes = { next: { status: 'next' }, start: { status: 'testing' }, pause: { status: 'later' }, later: { status: 'later' }, restore: { archived_at: null } }[action];
      if (changes) {
        const id = record.experiment_id;
        if (await save(changes, record)) {
          const updatedCard = [...root.querySelectorAll('.growth-card')].find(el => el.dataset.cardId === id);
          if (updatedCard) { updatedCard.open = true; updatedCard.querySelector('summary').focus(); }
        }
      }
    });
    query('.growth-outcome').addEventListener('change', renderRecommendations);
    query('.growth-state').addEventListener('change', render);
    query('.growth-type').addEventListener('change', render);
    return { load, clear, get loaded() { return loaded; } };
  }
  global.FFGrowthExperiments = { mount, recommendations, brief, STATES, OUTCOMES };
})(window);
