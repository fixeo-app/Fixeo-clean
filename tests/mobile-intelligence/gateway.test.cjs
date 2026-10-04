'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createHandler}=require('../../api/mobile-intelligence-fn');
const security=require('../../api/mobile-intelligence-fn/security');
const {runtime,BRANCH}=require('../../api/mobile-intelligence-fn/runtime');
const {attest}=require('../../api/mobile-intelligence-fn/transport');
const {sealToken}=require('../../api/estimator-v1/fixeo-estimator-token-v1');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env={NODE_ENV:'test',VERCEL_URL:'w41-test.vercel.app',SUPABASE_URL:'https://kqyhusnbybsukbcaoqtu.supabase.co',
 FIXEO_STAGING_PROJECT_REF:'kqyhusnbybsukbcaoqtu',SUPABASE_ANON_KEY:'sb_publishable_fixture',FIXEO_ESTIMATOR_SECRET:'test-estimator'.repeat(8),
 FIXEO_DIAGNOSTIC_SECRET:'test-diagnostic'.repeat(8),FIXEO_W41_ATTESTATION_SECRET:'test-attestation'.repeat(8)};
function api(body,{user=uid,role='client',auth=true,transport,headers={},canonical}={}) {
 const t=transport||{rpc:async()=>({ok:true}),offer:async r=>({ok:true,offer_id:r.id}),confirm:async()=>({ok:true,request_id:randomUUID(),tracking_ref:'FX-TEST',status:'new'}),dispatch:async()=>({ok:true})};
 return security.invoke(createHandler({env,canonical,transport:t,fetchImpl:async url=>({ok:auth,json:async()=>url.includes('/auth/')?{id:user}:[{id:user,role}]})}),
 {method:'POST',headers:{authorization:'Bearer '+'a'.repeat(40),...headers},body});
}
const start={action:'start',entry_context:{city_slug:'rabat',description:'Une petite intervention',service_hint:'bricolage.visite_minimum'}};
test('auth, Client, exact target, no privileged fallback, strict inputs',async()=>{
 for(const [opts,status] of [[{headers:{authorization:''}},401],[{auth:false},401],[{role:'artisan'},403],[{headers:{origin:'https://hostile.invalid'}},403]])assert.equal((await api(start,opts)).status,status);
 assert.equal((await api({...start,user_id:other})).status,400);
 assert.equal((await api({...start,entry_context:{...start.entry_context,known_inputs:{price:1}}})).status,400);
 assert.equal((await api(start)).status,200);
 assert.throws(()=>runtime({...env,SUPABASE_URL:'https://ztwtbgoqanqzvwiibtuh.supabase.co'}));
 assert.throws(()=>runtime({...env,NODE_ENV:'production',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:BRANCH}));
 const source=new Proxy(env,{get(t,k){if(k==='SUPABASE_SERVICE_ROLE_KEY')throw Error('Forbidden credential read');return t[k]}});
 assert.equal(runtime(source).FIXEO_DIAGNOSTIC_ORIGIN,'https://w41-test.vercel.app');
});
test('real canonical fixed scope → evaluate → verify → authenticated confirmation, tamper and TTL',async()=>{
 const r=await api(start),session=r.body.session.session_token;
 assert.equal((await api({action:'evaluate',session_token:session},{user:other})).status,403);
 assert.equal((await api({action:'evaluate',session_token:session.slice(0,-15)+'aaaaaaaaaaaaaaa'})).status,400);
 assert.equal((await api({action:'evaluate',session_token:security.unwrap(session,'session',uid,env)})).status,400);
 const expired=security.wrap(sealToken({expires_at:Date.now()+1000,session_id:'x'},env.FIXEO_ESTIMATOR_SECRET),'session',uid,env);
 const now=Date.now;try{Date.now=()=>now()+2000;assert.equal((await api({action:'evaluate',session_token:expired})).status,410)}finally{Date.now=now}
 const e=await api({action:'evaluate',session_token:session});assert.equal(e.status,200);
 assert.ok(e.body.pricing_context_token);assert.equal(e.body.outcome.outcome_type,'PRICE_READY');
 const c={action:'confirm_request',pricing_context_token:e.body.pricing_context_token,client_phone:'0612345678',service_code:start.entry_context.service_hint,city_slug:'rabat',confirmed:true};
 assert.equal((await api({...c,confirmed:false})).status,400);
 assert.equal((await api({...c,city_slug:'fes'})).status,409);
 assert.equal((await api({...c,service_code:'plomberie.fuite_simple'})).status,409);
 assert.equal((await api(c,{user:other})).status,403);
 assert.equal((await api({...c,amount_mad:1})).status,400);
 assert.equal((await api({action:'verify_pricing_context',pricing_context_token:c.pricing_context_token})).body.valid,true);
 const done=await api(c);assert.equal(done.status,200);assert.equal(done.body.guest_token,undefined);
});
test('one useful clarification; no Safety questionnaire, real STOP cannot continue',async()=>{
 const r=await api({...start,entry_context:{...start.entry_context,service_hint:'plomberie.fuite_simple'}});
 assert.equal(r.body.next_step.type,'QUESTION');const q=r.body.next_step;
 const answers=require('../../data/pricing/engine/plumbing-pilot-v1').services['plomberie.fuite_simple'].inputs;
 const a=await api({action:'answer',session_token:r.body.session.session_token,question_id:q.question_id,answer:answers[q.input_id]});
 assert.equal(a.status,200);assert.equal(a.body.outcome.outcome_type,'QUOTE_REQUIRED');assert.equal(a.body.next_step,null);
 assert.equal((await api({action:'answer',session_token:a.body.session.session_token,question_id:q.question_id,answer:answers[q.input_id]})).status,409);
 const lock=await api({...start,entry_context:{...start.entry_context,service_hint:'serrurerie.diagnostic'}});
 assert.equal(lock.status,200);assert.equal(lock.body.next_step,null);assert.equal(lock.body.outcome.outcome_type,'QUOTE_REQUIRED');
 const stop=await api({...start,entry_context:{...start.entry_context,description:'Une forte odeur de gaz'}});
 assert.equal(stop.body.outcome.outcome_type,'SAFETY_STOP');assert.equal(stop.body.pricing_context_token,null);
 assert.equal((await api({action:'select_service',session_token:stop.body.session.session_token,service_code:'nettoyage.visite_minimum'})).status,409);
});
test('attestation binds fixed stage, user, branch, operation, payload, <=60 seconds',()=>{
 const a=attest('confirm',{hello:'world'},uid,env);const e=JSON.parse(a.p_envelope);
 assert.equal(e.user_id,uid);assert.equal(e.branch,BRANCH);assert.equal(e.environment,'staging');assert.equal(e.expires_at-e.issued_at,60);assert.match(a.p_mac,/^[a-f0-9]{64}$/);
});
test('quota fails closed; provider/SQL detail never reaches mobile',async()=>{
 let calls=0;const r=await api(start,{canonical:{mobileAction:async()=>{calls++}},transport:{rpc:async()=>{throw Error('postgres/password-private')}}});
 assert.equal(calls,0);assert.equal(r.status,503);assert.equal(JSON.stringify(r).includes('password'),false);
});
