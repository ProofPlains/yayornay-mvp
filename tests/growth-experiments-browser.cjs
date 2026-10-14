/* HTTP-served integration checks with fake sessions/records, never production writes.
   Requires Playwright on NODE_PATH (or installed locally). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'growth-experiments.fixture.json'), 'utf8'));
const fakeClient = `window.supabase = { createClient() {
  const callbacks = [];
  return {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fake-authorised-session' } } }),
      onAuthStateChange: callback => { callbacks.push(callback); return {}; },
      signOut: async () => { callbacks.forEach(callback => callback('SIGNED_OUT')); return {}; },
      signInWithPassword: async () => ({ error: null }) },
    from(table) {
      let mode='read', values=null, filters={};
      const execute = async () => { const response = await fetch('/__test_records', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,mode,values,filters})}); return response.json(); };
      const chain = { select() { return chain; }, order() { return chain; },
        insert(data) { mode='insert'; values=data; return chain; }, update(data) { mode='update'; values=data; return chain; },
        eq(key,value) { filters[key]=value; return chain; }, maybeSingle: execute,
        then(resolve,reject) { return execute().then(resolve,reject); } };
      return chain;
    }
  };
} };`;
(async () => {
  let records = structuredClone(fixture), authorised = true, failRead = false, conflict = false, next = 14;
  const errors = [], requests = [];
  const server = http.createServer((req,res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__test_records') {
      let body=''; req.on('data',chunk=>body+=chunk); req.on('end',()=> {
        const data = JSON.parse(body); requests.push(data);
        res.setHeader('Content-Type','application/json');
        if (!authorised) return res.end(JSON.stringify({data:null,error:{code:'42501',message:'Access denied'}}));
        if (data.mode === 'read') return res.end(JSON.stringify(failRead ? {data:null,error:{message:'Temporary read failure'}} : {data:records,error:null}));
        if (data.mode === 'insert') {
          const record = {...fixture[12],experiment_id:`IDEA-test-${next++}`,title:'',status:'later',category:'Idea',hypothesis:'',why_it_might_work:'',test_when:'',primary_success_signal:'',supporting_signals:'',notes:'',outcome:'',learning:'',next_step_notes:'',completed_definition:null,...data.values,updated_at:new Date().toISOString()};
          records.push(record); return res.end(JSON.stringify({data:record,error:null}));
        }
        const record = records.find(r=>r.experiment_id===data.filters.experiment_id && r.updated_at===data.filters.updated_at);
        if (!record || conflict) return res.end(JSON.stringify({data:null,error:null}));
        Object.assign(record,data.values,{updated_at:new Date().toISOString()});
        if (record.status==='completed' && !record.completed_definition) { record.completed_definition=structuredClone(record); record.completed_at=new Date().toISOString(); }
        res.end(JSON.stringify({data:record,error:null}));
      }); return;
    }
    const file = path.resolve(root, '.'+url.pathname);
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) { res.statusCode=404;res.end();return; }
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chromium'}).catch(error => { server.close(); throw error; });
  try {
    const context = await browser.newContext({viewport:{width:1200,height:900}});
    const page = await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',async route=> {
      const url=route.request().url();
      if (url.includes('@supabase/supabase-js')) return route.fulfill({contentType:'application/javascript',body:fakeClient});
      if (url.includes('/functions/v1/admin-auth-status')) return route.fulfill({status:authorised?200:403,json:authorised?{isAdmin:true,role:'superuser'}:{isAdmin:false}});
      if (url.includes('/functions/v1/admin-support-overview')) return route.fulfill({json:{businesses:[],generatedAt:new Date().toISOString()}});
      if (url.includes('/rpc/acquisition_cohort_report')) return route.fulfill({json:{businesses:[],arrivals:[]}});
      return route.fulfill({body:'',contentType:url.endsWith('.js')?'application/javascript':'text/plain'});
    });
    const url=`http://127.0.0.1:${server.address().port}/admin-support.html`;
    await page.goto(url); await page.locator('#consoleShell').waitFor({state:'visible'});
    // The existing tab keyboard contract extends to the new tab.
    await page.locator('#metricsTab').focus(); await page.keyboard.press('End');
    await page.waitForFunction(()=>document.activeElement.id==='growthTab');
    await page.waitForFunction(()=>document.querySelectorAll('.growth-card').length===13);
    assert.equal(await page.locator('.growth-state-section').count(),4);
    assert.deepEqual(await page.locator('.growth-state-section > h3').allTextContents(),['Testing now (1)','Next (2)','Later (10)','Completed (0)']);
    assert.match(await page.locator('.growth-banner').innerText(),/Restaurant Google Search acquisition/);
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(root,'test-results/growth-desktop.png')});
    await page.setViewportSize({width:320,height:900});
    await page.screenshot({path:path.join(root,'test-results/growth-mobile-initial.png')});
    await page.setViewportSize({width:1200,height:900});
    for (const [value,count] of [['A',4],['B',2],['C',2],['D',2],['E',2],['F',5],['G',0]]) {
      await page.locator('.growth-outcome').selectOption(value);
      assert.equal(await page.locator('.growth-recommendation').count(),count);
    }
    assert.match(await page.locator('.growth-recommendations').innerText(),/Continue\/deepen EXP-001/);
    await page.locator('.growth-outcome').selectOption('E');
    await page.getByRole('button',{name:'Create messaging experiment',exact:true}).click();
    await page.locator('.growth-form').getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('dialog').waitFor({state:'hidden'});
    assert.equal(records.filter(r=>r.category==='QR messaging / activation').length,1);
    await page.reload(); await page.locator('#growthTab').click();
    await page.waitForFunction(()=>document.querySelectorAll('.growth-card').length===14);
    await page.locator('.growth-outcome').selectOption('E');
    assert.equal(await page.getByRole('button',{name:'Create messaging experiment',exact:true}).count(),0);
    // Quick capture, escaped text, and full definition editing.
    await page.getByRole('button',{name:'+ Add experiment idea',exact:true}).click();
    await page.locator('[name="title"]').fill('A new <growth> idea'); await page.locator('[name="notes"]').fill('Useful evidence <script>');
    await page.locator('.growth-form').getByRole('button',{name:'Save',exact:true}).click(); await page.locator('dialog').waitFor({state:'hidden'});
    const id=records.at(-1).experiment_id;
    const card=page.locator(`[data-card-id="${id}"]`); await card.locator('summary').click();
    assert.match(await card.innerText(),/A new <growth> idea/); assert.equal(await card.locator('script').count(),0);
    await card.getByRole('button',{name:'Edit details',exact:true}).click();
    await page.locator('[name="hypothesis"]').fill('Original test hypothesis');
    await page.locator('[name="test_when"]').fill('Relevant evidence');
    await page.locator('[name="effort"]').selectOption('Low'); await page.locator('[name="cash_cost"]').selectOption('None/minimal');
    await page.locator('.growth-form').getByRole('button',{name:'Save',exact:true}).click(); await page.locator('dialog').waitFor({state:'hidden'});
    for (const [label,state] of [['Move to Next','next'],['Start experiment','testing'],['Pause','later'],['Start experiment','testing'],['Return to Later','later']]) {
      await card.getByRole('button',{name:label,exact:true}).click();
      await page.waitForFunction(({id,state})=>document.querySelector(`[data-card-id="${id}"] .growth-meta`).textContent.includes(({next:'Next',testing:'Testing now',later:'Later'})[state]),{id,state});
      assert.equal(records.find(r=>r.experiment_id===id).status,state);
    }
    await card.getByRole('button',{name:'Complete experiment',exact:true}).click();
    await page.locator('.growth-form').getByRole('button',{name:'Record learning & complete',exact:true}).click();
    assert.equal(await page.locator('dialog').isVisible(),true); assert.equal(records.find(r=>r.experiment_id===id).status,'later');
    await page.locator('[name="outcome"]').fill('Outcome recorded'); await page.locator('[name="learning"]').fill('Learning recorded');
    await page.locator('[name="next_step_notes"]').fill('Review existing backlog');
    await page.locator('.growth-form').getByRole('button',{name:'Record learning & complete',exact:true}).click(); await page.locator('dialog').waitFor({state:'hidden'});
    assert.equal(records.find(r=>r.experiment_id===id).completed_definition.hypothesis,'Original test hypothesis');
    await card.getByRole('button',{name:'Copy experiment brief',exact:true}).click();
    // Clipboard may open a fallback dialog in headless runs.
    if (await page.locator('dialog').isVisible()) { assert.match(await page.locator('[name="brief"]').inputValue(),/Learning recorded/); await page.getByRole('button',{name:'Cancel',exact:true}).click(); }
    await card.getByRole('button',{name:'Archive',exact:true}).click();
    await page.locator('.growth-form').getByRole('button',{name:'Archive experiment',exact:true}).click(); await page.locator('dialog').waitFor({state:'hidden'});
    await page.locator('.growth-archives > summary').click();
    await page.locator(`.growth-archive-list [data-card-id="${id}"]`).getByRole('button',{name:'Restore experiment',exact:true}).click();
    assert.equal(records.find(r=>r.experiment_id===id).status,'completed');
    // Stale edits remain reviewable rather than overwriting another session.
    await page.getByRole('button',{name:'+ Add experiment idea',exact:true}).click(); await page.locator('[name="title"]').fill('Conflict example');
    await page.locator('.growth-form').getByRole('button',{name:'Save',exact:true}).click(); await page.locator('dialog').waitFor({state:'hidden'});
    const conflictCard=page.locator(`[data-card-id="${records.at(-1).experiment_id}"]`); await conflictCard.locator('summary').click();
    await conflictCard.getByRole('button',{name:'Edit details',exact:true}).click(); conflict=true;
    await page.locator('[name="notes"]').fill('Unsaved evidence'); await page.locator('.growth-form').getByRole('button',{name:'Save',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.growth-form-error').textContent.includes('another session'));
    assert.equal(await page.locator('[name="notes"]').inputValue(),'Unsaved evidence'); conflict=false; await page.getByRole('button',{name:'Cancel',exact:true}).click();
    // Results link selects filters on a fresh and previously-loaded report.
    await page.locator('.growth-banner').getByRole('button',{name:'View results',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('acquisitionCampaign').disabled);
    assert.equal(await page.locator('#acquisitionCampaign').inputValue(),JSON.stringify('restaurants_search_test_01'));
    assert.equal(await page.locator('#acquisitionLanding').inputValue(),JSON.stringify('/restaurants/'));
    assert.match(await page.locator('#acquisitionStatus').innerText(),/Loaded/);
    await page.locator('#acquisitionCampaign').selectOption(''); await page.locator('#acquisitionLanding').selectOption('');
    await page.locator('#growthTab').click(); await page.locator('.growth-banner').getByRole('button',{name:'View results',exact:true}).click();
    assert.equal(await page.locator('#acquisitionCampaign').inputValue(),JSON.stringify('restaurants_search_test_01'));
    // Existing support panels and refresh remain usable.
    for (const tab of ['activationTab','orderRescueTab','businessTab','metricsTab']) { await page.locator('#'+tab).click(); assert.equal(await page.locator('#'+tab).getAttribute('aria-selected'),'true'); }
    await page.locator('#growthTab').click();
    for (const width of [320,390]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.locator('.growth-cards').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Horizontal page overflow at ${width}px`);
      await page.getByRole('button',{name:'+ Add experiment idea',exact:true}).click();
      await page.locator('[name="title"]').fill('Keyboard idea'); await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.growthAction),'add');
      fs.mkdirSync(path.join(root,'test-results'),{recursive:true}); await page.screenshot({path:path.join(root,`test-results/growth-${width}.png`),fullPage:true});
    }
    failRead=true; await page.getByRole('button',{name:'Refresh backlog',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.growth-message').textContent.includes('Temporary read failure'));
    assert.ok(await page.locator('.growth-card').count()>0); failRead=false;
    // Permission revocation clears cached strategy data and closes editing.
    authorised=false; await page.getByRole('button',{name:'Refresh backlog',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.growth-card').length===0);
    assert.equal(await page.locator('.growth-fields').innerText(),'');
    assert.equal(await page.locator('.growth-type option').count(),1);
    await page.reload(); await page.locator('#accessDenied').waitFor({state:'visible'}); assert.equal(await page.locator('#consoleShell').isVisible(),false);
    assert.deepEqual(errors,[]); assert.ok(requests.some(r=>r.mode==='insert')); assert.ok(requests.some(r=>r.mode==='update'));
    console.log('Browser checks passed: four states, A–G, capture/edit, persistent transitions, completion, archive/restore, conflict, results filters, support tabs, 320/390px, keyboard, transient failure, and access denial.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
