import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { checkedGoogleRedirect } from '../supabase/functions/_shared/google-campaign-auth.ts';
import { signupPayload, configured, uploadSignup, diagnoseSignup, processSignup, validWorkerSignature } from '../supabase/functions/_shared/google-ads.ts';

const settings={clientId:'fixture',clientSecret:'secret',refreshToken:'refresh',accountId:'2401666409',actionId:'7845162456'};
const job={business_id:randomUUID(),lease_id:randomUUID(),transaction_id:randomUUID(),conversion_time:'2026-10-15T10:01:02Z',mode:'upload'};
test('Google campaign handoff permits only an opaque standard Google authorization redirect',()=>{
 const callback='https://project.example/auth/v1/callback';
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 u.search=new URLSearchParams({redirect_uri:callback,client_id:'fixture.apps.googleusercontent.com',
   response_type:'code',prompt:'select_account',scope:'email profile',state:randomUUID()});
 assert.ok(checkedGoogleRedirect(u.href,callback));
 for(const [key,value] of [['redirect_to','https://flashfeedback.co.uk/?ff_campaign=fixture'],
   ['redirect_uri','https://unexpected.example/callback'],['state','encoded-callback'],
   ['scope','email profile adwords'],['prompt','consent']]){
  const bad=new URL(u);bad.searchParams.set(key,value);
  assert.equal(checkedGoogleRedirect(bad.href,callback),null);
 }
 assert.equal(checkedGoogleRedirect(u.href.replace('accounts.google.com','accounts.google.com.example'),callback),null);
});
test('worker HMAC rejects missing, malformed, wrong-key and altered invocations',async()=>{
 const nonce=randomUUID(),signature=createHmac('sha256','fixture-service-secret').update(nonce).digest('hex');
 assert.equal(await validWorkerSignature(nonce,signature,'fixture-service-secret'),true);
 assert.equal(await validWorkerSignature(nonce,signature,'wrong-key'),false);
 assert.equal(await validWorkerSignature(randomUUID(),signature,'fixture-service-secret'),false);
 assert.equal(await validWorkerSignature(nonce,'','fixture-service-secret'),false);
});
test('Google payload is an explicit minimal allowlist with immutable completion time',()=>{
 const p=signupPayload({...job,email:'private@example.test'},'click_123',settings);
 assert.deepEqual(p.events,[{adIdentifiers:{gclid:'click_123'},eventTimestamp:'2026-10-15T10:01:02.000Z',eventSource:'WEB',transactionId:job.transaction_id,consent:{adUserData:'CONSENT_GRANTED',adPersonalization:'CONSENT_DENIED'}}]);
 assert.equal(JSON.stringify(p).includes('private@example.test'),false);
 assert.equal(configured(settings),true); assert.equal(configured({...settings,accountId:''}),false);
});
test('Provider temporary, ambiguous, permanent, successful and validation-only responses',async()=>{
 assert.equal((await uploadSignup(job,'click',settings,'token',async()=>new Response('',{status:503}))).outcome,'retry');
 assert.equal((await uploadSignup(job,'click',settings,'token',async()=>{throw Error('network');})).outcome,'retry');
 assert.equal((await uploadSignup(job,'click',settings,'token',async()=>new Response('',{status:400}))).outcome,'failed');
 assert.equal((await uploadSignup(job,'click',settings,'token',async()=>new Response('',{status:403}))).outcome,'needs_attention');
 const accepted=await uploadSignup(job,'click',settings,'token',async()=>Response.json({requestId:'request-1'}));
 assert.equal(accepted.request_id,'request-1');
 let body;
 const validated=await uploadSignup(job,'click',settings,'token',async(_,options)=>{body=JSON.parse(options.body);return Response.json({});},true);
 assert.equal(body.validateOnly,true);assert.equal(validated.outcome,'validated');
 assert.equal((await diagnoseSignup({...job,request_id:'request-1'},'token',async()=>Response.json({requestStatusPerDestination:[{requestStatus:'SUCCESS'}]}))).outcome,'uploaded');
 assert.equal((await diagnoseSignup({...job,request_id:'request-1'},'token',async()=>Response.json({requestStatusPerDestination:[{requestStatus:'FAILED',errorInfo:{errorCounts:[{reason:'PROCESSING_ERROR_REASON_INVALID_GCLID'}]}}]}))).outcome,'needs_attention');
});

test('Durable signup reporting: eligibility, retries, recovery, exclusion and withdrawal',async t=>{
 const db=new PGlite();
 try {
  const schema=fs.readFileSync('tests/fixtures/production-schema.sql','utf8');
  const constraints=schema.match(/^alter table public\..* add constraint .*;$/gm)||[];
  await db.exec(schema.replace(/^alter table public\..* add constraint .*;$/gm,'')+'\n'+constraints.sort((a,b)=>Number(a.includes('FOREIGN KEY'))-Number(b.includes('FOREIGN KEY'))).join('\n'));
  await db.exec(`create schema net; create table net.http_request_queue(id bigint,headers jsonb); grant usage on schema net to anon,authenticated; grant select on net.http_request_queue to public;
   create schema cron; create table cron.job(jobname text primary key,schedule text,command text,jobid bigint default 1,active boolean default true);
   create function cron.alter_job(bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
   create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set command=excluded.command returning 1::bigint$$;`);
  for(const file of ['20261009151423_acquisition_activation_measurement.sql','20261011170128_signup_campaign_consent.sql','20261012102422_account_campaign_consent.sql','20261015112707_google_ads_signup_reporting.sql','20261015134030_google_ads_signed_worker_invocations.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec('create table auth.identities(user_id uuid references auth.users(id), provider text)');
  await db.exec("alter table auth.users add column created_at timestamptz default now(); create table auth.flow_state(id uuid, provider_type text, referrer text, created_at timestamptz default now())");
  await db.exec(fs.readFileSync('supabase/migrations/20261114215049_optional_signup_owner_name.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261114220741_google_business_signup.sql','utf8'));
  await db.exec("create function public.current_internal_admin_role() returns text language sql stable as $$select null::text$$");
  await db.exec(fs.readFileSync('supabase/migrations/20261117210609_internal_campaign_funnel.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261117210929_restricted_campaign_gate_fix.sql','utf8'));
  const q=(sql,args=[])=>db.query(sql,args);
  const one=async(sql,args=[])=>(await q(sql,args)).rows[0];
  const claim=async()=>(await one('select google_ads_claim_signup($1,$2) x',[settings.accountId,settings.actionId])).x;
  const state=async b=>one('select * from ff_measurement.google_ads_signup_conversions where business_id=$1',[b]);
  const due=async b=>q("update ff_measurement.google_ads_signup_conversions set next_attempt_at=now(),lease_expires_at=null where business_id=$1",[b]);
  async function signup({consent=true,gclid='click_123',version='google_signup_v1',complete=true,late=false,internal=false}={}){
   const user=randomUUID(),token=randomUUID().replaceAll('-','').repeat(2),hash=createHash('sha256').update(token).digest('hex');
   const touch={channel:'paid_search',landing_path:'/restaurants/',utm_source:'google',utm_campaign:'restaurants_search_test_01',attribution_policy:'signup_visit_v2',...(gclid?{gclid}:{})};
   const arrival=()=>q('select record_acquisition_arrival($1,$2,$3,$4,$5,$6,$7)',[hash,randomUUID(),randomUUID(),randomUUID(),'landing',touch,late?user:null]);
   if(consent&&!late)await arrival();
   await q('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[user,user+'@example.test',{ff_setup:{business_name:'Fixture',owner_name:'Fixture',journey_token:consent?token:null,campaign_disclosure_version:version}}]);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   let business;
   if(complete){const x=(await one('select complete_acquisition_signup() x')).x;business=x.business.id;if(internal)await q('update businesses set integration_test_mode=true where id=$1',[business]);}
   return {user,business,arrival};
  }
  assert.equal(await claim(),null,'disabled by default');
  await t.test('Internal campaign capture is isolated, revocable, and expires into suppressed totals', async () => {
   const month = (await one("select date_trunc('month',now() at time zone 'UTC')::date::text m")).m;
   await q("insert into ff_measurement.internal_campaigns(code,ads_id,ever_verified,verified_at) values('restaurant_1','1234',true,now())");
   async function campaignSignup() {
    const user = randomUUID();
    await q('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',
      [user,user+'@example.test',{ff_setup:{business_name:'Campaign fixture'},ff_internal_campaign:'restaurant_1'}]);
    await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    const setup=(await one('select complete_acquisition_signup() x')).x;
    return {user,business:setup.business.id,location:setup.location.id};
   }
   const disabled=await campaignSignup();
   const hasLink = async user => (await one('select exists(select 1 from ff_measurement.internal_campaign_links where user_id=$1) x',[user])).x;
   assert.equal(await hasLink(disabled.user),false);
   await q("update ff_measurement.internal_campaign_settings set enabled_at=now(),capture_enabled=true,last_cleanup_at=now()");
   const a=await campaignSignup();
   assert.equal(await hasLink(a.user),true);
   assert.equal((await one("select raw_user_meta_data ? 'ff_internal_campaign' x from auth.users where id=$1",[a.user])).x,false);
   assert.equal((await one('select campaign_consent_granted x from ff_measurement.signup_intents where user_id=$1',[a.user])).x,false);
   await q("insert into public.feedback(business_id,location_id,sentiment) values($1,$2,'happy'),($1,$2,'happy')",[a.business,a.location]);
   assert.equal(Number((await one("select first_feedback x from ff_measurement.internal_campaign_counts($1) where code='restaurant_1'",[month])).x),1);
   const excluded=await campaignSignup();
   await q('update businesses set integration_test_mode=true where id=$1',[excluded.business]);
   assert.equal(Number((await one("select signups x from ff_measurement.internal_campaign_counts($1) where code='restaurant_1'",[month])).x),1);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[a.user]);
   await assert.rejects(()=>q("select public.internal_campaign_admin('read',p_month:=$1)",[month]),/Superuser required/);
   await q('select public.object_to_internal_campaign_measurement()');
   assert.equal(await hasLink(a.user),false);
   const old=await campaignSignup();
   const start='https://flashfeedback.co.uk/?ff_google=1&ff_campaign=restaurant_1', stateId=randomUUID();
   await q("insert into auth.flow_state(id,provider_type,referrer) values($1,'google',$2)",[stateId,start]);
   assert.equal((await one("select public.internal_campaign_google_handoff('restaurant_1',$1,$2) x",[stateId,start])).x,true);
   assert.equal((await one("select public.internal_campaign_google_handoff('restaurant_1',$1,$2) x",[stateId,start+'wrong'])).x,false);
   async function googleCampaign(oldAuth=false, invite=false) {
    const id=randomUUID(),email=id+'@example.test';
    await q("insert into auth.users(id,email,email_confirmed_at,created_at) values($1,$2,now(),now()-case when $3 then interval '1 day' else interval '0' end)",[id,email,oldAuth]);
    await q("insert into auth.identities values($1,'google')",[id]);
    if(invite) await q("insert into public.business_invites(business_id,email,token,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 day')",[a.business,email,randomUUID()]);
    await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    const finish=()=>one("select complete_google_campaign_signup('Google campaign',null,null,'Hospitality',null,'free',null,'restaurant_1') x");
    return {id,finish};
   }
   const google=await googleCampaign();
   assert.equal((await google.finish()).x.created,true);
   assert.equal(await hasLink(google.id),true);
   assert.equal((await google.finish()).x.created,false);
   const returning=await googleCampaign(true);
   assert.equal((await returning.finish()).x.created,true);
   assert.equal(await hasLink(returning.id),false);
   const invited=await googleCampaign(false,true);
   assert.equal((await invited.finish()).x,null);
   assert.equal(await hasLink(invited.id),false);
   await q("update ff_measurement.internal_campaign_settings set enabled_at=now()-interval '100 days'");
   const past=(await one("update ff_measurement.signup_intents set completed_at=now()-interval '90 days' where user_id=$1 returning date_trunc('month',completed_at at time zone 'UTC')::date::text m",[old.user])).m;
   await q('select ff_measurement.close_internal_campaign_months()');
   await q('select ff_measurement.close_internal_campaign_months()');
   assert.equal(await hasLink(old.user),false);
   assert.equal(await one("select signups,first_feedback from ff_measurement.internal_campaign_totals where month=$1 and code='restaurant_1'",[past]),undefined);
   await q('update ff_measurement.internal_campaign_settings set capture_enabled=false,enabled_at=null');
   const testUser=randomUUID(),testEmail=testUser+'@example.test';
   await q("insert into ff_measurement.internal_campaign_test_access(email,code,expires_at) values($1,'restaurant_1',now()+interval '1 hour')",[testEmail]);
   await q('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',
     [testUser,testEmail,{ff_setup:{business_name:'Restricted test'},ff_internal_campaign:'restaurant_1'}]);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[testUser]);
   const testBusiness=(await one('select complete_acquisition_signup() x')).x.business.id;
   assert.equal(await hasLink(testUser),true);
   assert.equal((await one('select integration_test_mode x from businesses where id=$1',[testBusiness])).x,true);
   assert.equal(await hasLink((await campaignSignup()).user),false);
   await q("update ff_measurement.internal_campaign_test_access set expires_at=now()-interval '1 minute'");
   assert.equal((await one("select ff_measurement.internal_campaign_capture_allowed('restaurant_1') x")).x,false);
  });
  await t.test('Email signup can finish without an owner name', async () => {
   const user=randomUUID();
   await q('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)', [user,'optional-name@example.test',{ff_setup:{business_name:'Email fixture'}}]);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   const { setup }=await one('select complete_acquisition_signup() as setup');
   assert.equal(setup.business.owner_name,null);
  });
  await t.test('Google signup reuses atomic setup and preserves explicit campaign consent', async () => {
   const user=randomUUID(), token='a'.repeat(64), hash=createHash('sha256').update(token).digest('hex');
   const complete=(name='Google fixture')=>one(
    "select complete_google_business_signup($1,'','','Hospitality','','free',$2) as setup",
    [name,token]);
   await q("insert into auth.users(id,email,email_confirmed_at) values($1,'google@example.test',now())",[user]);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   await assert.rejects(complete(),/Confirmed Google/);
   await q("insert into auth.identities values($1,'google')",[user]);
   await q("insert into business_invites(business_id,email,token) values($1,'google@example.test','fixture-invite')",[(await signup({consent:false})).business]);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   assert.equal((await complete()).setup,null);
   await q("update business_invites set status='revoked' where token='fixture-invite'");
   await q("select record_acquisition_arrival($1,$2,$3,$4,'landing',$5)",[hash,randomUUID(),randomUUID(),randomUUID(),{channel:'paid_search',gclid:'google_fixture'}]);
   const first=(await complete()).setup;
   const retry=(await complete('Different name')).setup;
   assert.equal(first.created,true);
   assert.equal(first.business.owner_name,null);
   assert.equal(retry.created,false);
   assert.equal(retry.business.id,first.business.id);
   assert.equal(retry.business.name,'Google fixture');
   assert.equal(retry.location.name,'Location 01');
   assert.deepEqual(await one("select campaign_consent_granted,google_ads_consent_version from ff_measurement.signup_intents where user_id=$1",[user]),
    {campaign_consent_granted:true,google_ads_consent_version:'google_signup_v1'});
   assert.equal((await one("select coverage from ff_measurement.business_acquisition where business_id=$1",[first.business.id])).coverage,'measured');
   assert.equal((await one("select has_function_privilege('anon','public.complete_google_business_signup(text,text,text,text,text,text,text)','execute') as allowed")).allowed,false);
  });
  await q('update ff_measurement.google_ads_settings set enabled=true');
  await t.test('consenting completed signup queues once and preserves analytics',async()=>{
   const x=await signup();
   const snapshot=await one('select * from ff_measurement.business_acquisition where business_id=$1',[x.business]);
   const a=await claim();assert.equal(a.business_id,x.business);
   assert.equal(new Date(a.conversion_time).toISOString(),(await one('select completed_at from ff_measurement.signup_intents where user_id=$1',[x.user])).completed_at.toISOString());
   assert.equal(await claim(),null,'leased job cannot be claimed twice');
   await q('select complete_acquisition_signup()');
   assert.equal((await one('select count(*)::int n from ff_measurement.google_ads_signup_conversions')).n,1);
   assert.deepEqual(await one('select * from ff_measurement.business_acquisition where business_id=$1',[x.business]),snapshot);
   await q('select google_ads_finish_signup($1,$2,$3)',[a.business_id,a.lease_id,{outcome:'failed',category:'fixture_finished'}]);
  });
  await t.test('no GCLID, no consent, old disclosure, internal and incomplete signups never queue',async()=>{
   for(const options of [{gclid:null},{consent:false},{version:null},{internal:true},{complete:false}])await signup(options);
   assert.equal(await claim(),null);
  });
  await t.test('metadata edits cannot upgrade old consent; old signup is not backfilled',async()=>{
   const x=await signup({version:null});
   await q("update auth.users set raw_user_meta_data=jsonb_set(raw_user_meta_data,'{ff_setup,campaign_disclosure_version}','\"google_signup_v1\"') where id=$1",[x.user]);
   assert.equal(await claim(),null);
   const old=await signup();await q("update ff_measurement.signup_intents set created_at='2026-01-01' where user_id=$1",[old.user]);assert.equal(await claim(),null);
  });
  await t.test('delayed attribution after signup queues the original completion only',async()=>{
   const x=await signup({late:true});assert.equal(await claim(),null);await x.arrival();
   const a=await claim();assert.equal(a.business_id,x.business);
   await q('select google_ads_finish_signup($1,$2,$3)',[a.business_id,a.lease_id,{outcome:'failed',category:'fixture_finished'}]);
  });
  await t.test('temporary API failure leaves signup successful; retry accepts exactly once',async()=>{
   const x=await signup();let httpStatus=503;let sent=0;
   const rpc=async(name,args={})=>{
    const values=name==='google_ads_claim_signup'?[args.p_account,args.p_action]:name==='google_ads_confirm_signup'?[args.p_business,args.p_lease]:[args.p_business,args.p_lease,args.p_result];
    const placeholders=values.map((_,i)=>'$'+(i+1)).join(',');
    return {data:(await one('select '+name+'('+placeholders+') x',values)).x,error:null};
   };
   const fetcher=async()=>{sent++;return httpStatus===200?Response.json({requestId:'request-fixture'}):new Response('',{status:httpStatus});};
   await processSignup({rpc},settings,'token',fetcher);
   assert.equal((await state(x.business)).status,'pending');assert.equal((await one('select count(*)::int n from businesses where id=$1',[x.business])).n,1);
   await due(x.business);httpStatus=200;await processSignup({rpc},settings,'token',fetcher);
   const accepted=await state(x.business);assert.equal(accepted.status,'accepted');assert.equal(accepted.attempt_count,2);assert.ok(accepted.uploaded_at);
   assert.equal(await processSignup({rpc},settings,'token',fetcher),false);assert.equal(sent,2);
   await due(x.business);const diagnostic=await claim();assert.equal(diagnostic.mode,'diagnostics');
   await q('select google_ads_finish_signup($1,$2,$3)',[diagnostic.business_id,diagnostic.lease_id,{outcome:'uploaded'}]);
   await q('select google_ads_finish_signup($1,$2,$3)',[diagnostic.business_id,diagnostic.lease_id,{outcome:'uploaded'}]);
   assert.equal((await state(x.business)).status,'uploaded');assert.equal((await state(x.business)).uploaded_at.getTime(),accepted.uploaded_at.getTime());
  });
  await t.test('permanent failures stop and retry limits expire',async()=>{
   const x=await signup(),a=await claim();await q('select google_ads_finish_signup($1,$2,$3)',[a.business_id,a.lease_id,{outcome:'failed',category:'upload_validation_400'}]);
   await due(x.business);assert.equal(await claim(),null);
   const y=await signup();await claim();await q("update ff_measurement.google_ads_signup_conversions set attempt_count=12,lease_expires_at=null,status='pending' where business_id=$1",[y.business]);
   assert.equal(await claim(),null);assert.equal((await state(y.business)).status,'expired');
  });
  await t.test('expired leases replay stable identity; withdrawal cancels unsent and in-flight jobs',async()=>{
   const x=await signup(),a=await claim();await due(x.business);const b=await claim();assert.equal(a.transaction_id,b.transaction_id);assert.notEqual(a.lease_id,b.lease_id);
   await q('select google_ads_finish_signup($1,$2,$3)',[a.business_id,a.lease_id,{outcome:'accepted',request_id:'stale'}]);assert.equal((await state(x.business)).request_id,null);
   await q("select set_config('request.jwt.claim.sub',$1,false)",[x.user]);await q('select withdraw_campaign_measurement()');
   assert.equal((await state(x.business)).status,'cancelled');assert.equal((await one('select google_ads_confirm_signup($1,$2) x',[x.business,b.lease_id])).x,null);
   await q('select google_ads_finish_signup($1,$2,$3)',[b.business_id,b.lease_id,{outcome:'accepted',request_id:'late-acceptance'}]);
   assert.equal((await state(x.business)).status,'cancelled');assert.ok((await state(x.business)).uploaded_at);assert.equal(await claim(),null);
   const y=await signup();const internalJob=await claim();await q('update businesses set subscription_test_mode=true where id=$1',[y.business]);
   assert.equal((await one('select google_ads_confirm_signup($1,$2) x',[y.business,internalJob.lease_id])).x,null);
  });
  await t.test('browser roles cannot read private state or run upload RPCs',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(q('select * from ff_measurement.google_ads_signup_conversions'),/permission/);
    await assert.rejects(q('select google_ads_claim_signup($1,$2)',[settings.accountId,settings.actionId]),/permission/);
    await assert.rejects(q('select * from net.http_request_queue'),/permission/);
    await db.exec('reset role');
   }
  });
  await t.test('invocation tickets are single-use, mode-bound and expire',async()=>{
   const ticket=(await one("insert into ff_measurement.google_ads_worker_invocations(mode) values('health') returning nonce")).nonce;
   assert.equal((await one('select google_ads_consume_invocation($1) x',[ticket])).x,'health');
   assert.equal((await one('select google_ads_consume_invocation($1) x',[ticket])).x,null);
   const expired=(await one("insert into ff_measurement.google_ads_worker_invocations(mode,expires_at) values('run',now()-interval '1 second') returning nonce")).nonce;
   assert.equal((await one('select google_ads_consume_invocation($1) x',[expired])).x,null);
  });
  await t.test('scheduler stages a signed one-use ticket, never its reusable service credential',async()=>{
   await db.exec(`create schema vault;
    create view vault.decrypted_secrets as select 'project_url'::text name,'https://fixture.invalid'::text decrypted_secret union all select 'service_role_key','fixture-private-key';
    create schema extensions;
    create function extensions.hmac(bytea,bytea,text) returns bytea language sql as $$select decode('01','hex')$$;
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$begin insert into net.http_request_queue values(1,headers);return 1;end$$;`);
   assert.equal((await one("select ff_measurement.invoke_google_ads_signup('health') x")).x,1);
   const row=await one('select headers from net.http_request_queue');
   assert.equal(row.headers.Authorization,undefined);
   assert.equal(JSON.stringify(row.headers).includes('fixture-private-key'),false);
   const ticket=row.headers['x-ff-nonce'];
   assert.equal((await one('select google_ads_consume_invocation($1) x',[ticket])).x,'health');
  });
 } finally {await db.close();}
});
