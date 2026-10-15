import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signupPayload, configured, uploadSignup, diagnoseSignup, processSignup, validWorkerSignature } from '../supabase/functions/_shared/google-ads.ts';

const settings={clientId:'fixture',clientSecret:'secret',refreshToken:'refresh',accountId:'2401666409',actionId:'7845162456'};
const job={business_id:randomUUID(),lease_id:randomUUID(),transaction_id:randomUUID(),conversion_time:'2026-10-15T10:01:02Z',mode:'upload'};
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
