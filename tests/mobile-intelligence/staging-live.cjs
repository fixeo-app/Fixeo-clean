'use strict';
// Explicit opt-in only. Fixture credentials remain outside the repo and all logs.
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createHandler}=require('../../api/mobile-intelligence-fn');
const security=require('../../api/mobile-intelligence-fn/security');
const {createClientTransport,attest}=require('../../api/mobile-intelligence-fn/transport');
const {sealToken,unsealToken}=require('../../api/estimator-v1/fixeo-estimator-token-v1');
const {persistPhoto}=require('../../api/mobile-intelligence-fn/diagnostic');
const {sanitizePhoto}=require('../../api/diagnostic/media');
if(!process.env.W41_ENV_FILE||!process.env.W41_AUTH_FILE)throw Error('Explicit staging fixture files required');
const env={...JSON.parse(fs.readFileSync(process.env.W41_ENV_FILE)),NODE_ENV:'test',VERCEL_ENV:'preview',VERCEL_URL:'w41-contract.vercel.app',VERCEL_GIT_COMMIT_REF:'feat/fixeo-mobile-w4-1-intelligence-gateway'};
assert.equal(env.SUPABASE_URL,'https://kqyhusnbybsukbcaoqtu.supabase.co');assert.equal(env.FIXEO_STAGING_PROJECT_REF,'kqyhusnbybsukbcaoqtu');
const users=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE));const [user,other,artisan]=users;
const passed=[];const report={mode:process.env.W41_PREVIEW_URL?'deployed-preview':'local-server-real-staging',passed,requests:[],diagnostics:[]};
const mark=x=>{passed.push(x);console.log('PASS '+x)};
const preview=process.env.W41_PREVIEW_URL;
const previewHeaders=process.env.W41_PREVIEW_HEADERS_FILE?JSON.parse(fs.readFileSync(process.env.W41_PREVIEW_HEADERS_FILE)):{};
async function apiOnce(body,u=user){
 const headers={...(u?{authorization:'Bearer '+u.token}:{}),'content-type':'application/json'};
 if(preview){const r=await fetch(preview+'/api/mobile-estimator-v1',{method:'POST',headers:{...previewHeaders,...headers},body:JSON.stringify(body),redirect:'error'});return {status:r.status,body:await r.json()}}
 return security.invoke(createHandler({env}),{method:'POST',headers,body});
}
async function api(body,u=user){
 for(let attempt=0;attempt<3;attempt++){
  const r=await apiOnce(body,u);
  if(r.status!==503 || !['AUTH_UNAVAILABLE','DEPENDENCY_UNAVAILABLE'].includes(r.body.error) || attempt===2)return r;
  report.transientRetries=(report.transientRetries||0)+1;
 }
}
async function rpc(name,args,u=user){const r=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,...(u?{Authorization:'Bearer '+u.token}:{}),'content-type':'application/json'},body:JSON.stringify(args),redirect:'error'});return {status:r.status,body:await r.json()};}
function check(r,status,label){assert.equal(r.status,status,label+': '+(r.body.error||r.body.code||r.body.message||''));}
const start={action:'start',entry_context:{city_slug:'rabat',description:'W41_JWT_CONTRACT_FIXTURE '+randomUUID(),service_hint:'bricolage.visite_minimum'}};
(async()=>{
 if(!process.env.W41_DIAGNOSTIC_ONLY){
 check(await api(start,null),401,'anonymous gateway');mark('AUTH_ANON_REJECTED');
 check(await api(start,{token:'invalid.jwt.'+'x'.repeat(32)}),401,'invalid JWT');mark('AUTH_INVALID_JWT_REJECTED');
 check(await api(start,artisan),403,'non-client');mark('AUTH_NONCLIENT_REJECTED');
 assert.ok((await rpc('mobile_intelligence_quota_v1',{p_kind:'estimator'},null)).status>=400);mark('RPC_ANON_REJECTED');
 const s=await api(start);check(s,200,'Client start');mark('AUTH_CLIENT_ACCEPTED');
 const token=s.body.session.session_token;
 check(await api({action:'evaluate',session_token:token},other),403,'other owner');mark('HANDOFF_OTHER_USER_REJECTED');
 check(await api({action:'evaluate',session_token:token.slice(0,-10)+'abcdefghij'}),400,'tamper');mark('SESSION_TAMPER_REJECTED');
 const e=await api({action:'evaluate',session_token:token});check(e,200,'evaluate');assert.equal(e.body.outcome.outcome_type,'PRICE_READY');mark('ESTIMATOR_CANONICAL_PRICE_READY');
 const pricing=e.body.pricing_context_token;assert.ok(pricing);
 check(await api({action:'verify_pricing_context',pricing_context_token:pricing}),200,'verify');mark('HANDOFF_VALID');
 const payload=unsealToken(security.unwrap(pricing,'pricing',user.id,env),env.FIXEO_ESTIMATOR_SECRET);
 const expiredRaw=sealToken({...payload,expires_at:Date.now()+10},env.FIXEO_ESTIMATOR_SECRET);
 const expired=security.wrap(expiredRaw,'pricing',user.id,env);
 await new Promise(resolve=>setTimeout(resolve,30));
 check(await api({action:'verify_pricing_context',pricing_context_token:expired}),410,'expiry');mark('HANDOFF_EXPIRED_REJECTED');
 const confirmation={action:'confirm_request',pricing_context_token:pricing,client_phone:'0612345678',city_slug:'rabat',service_code:'bricolage.visite_minimum',confirmed:true};
 check(await api({...confirmation,service_code:'plomberie.fuite_simple'}),409,'service mismatch');mark('HANDOFF_SERVICE_MISMATCH_REJECTED');
 check(await api({...confirmation,amount_mad:1}),400,'amount injection');mark('PRICE_INJECTION_REJECTED');
 const taps=await Promise.all([api(confirmation),api(confirmation)]);taps.forEach(r=>check(r,200,'double tap'));
 assert.ok(taps[0].body.request_id);assert.equal(taps[0].body.request_id,taps[1].body.request_id);report.requests.push(taps[0].body.request_id);mark('CONFIRM_DOUBLE_TAP_SINGLE_REQUEST');
 const replay=await api(confirmation);check(replay,200,'retry');assert.equal(replay.body.request_id,taps[0].body.request_id);mark('CONFIRM_RETRY_IDENTICAL');
 check(await api({...confirmation,client_phone:'0612345679'}),409,'idempotence conflict');mark('CONFIRM_IDEMPOTENCY_CONFLICT');
 const eval2=await api({action:'evaluate',session_token:token});check(eval2,200,'repeat evaluate');
 const repeat=await api({...confirmation,pricing_context_token:eval2.body.pricing_context_token});check(repeat,200,'second context');assert.equal(repeat.body.request_id,taps[0].body.request_id);mark('REEVALUATE_SAME_SESSION_SINGLE_REQUEST');
 const owned=await fetch(env.SUPABASE_URL+'/rest/v1/service_requests?id=eq.'+taps[0].body.request_id+'&select=id,client_profile_id',{headers:{apikey:env.SUPABASE_ANON_KEY,authorization:'Bearer '+user.token}});const rows=await owned.json();assert.equal(rows[0]?.client_profile_id,user.id);mark('REQUEST_OWNER_FROM_JWT');
 const directKey=randomUUID();const directArgs={p_service_category:'bricolage',p_city:'rabat',p_description:'W41_DIRECT_FIXTURE besoin simple',p_idempotency_key:directKey};
 const direct=await rpc('create_my_service_request_v1',directArgs);check(direct,200,'direct request');const directId=direct.body.id||direct.body.request_id;assert.ok(directId);report.requests.push(directId);mark('DIRECT_REQUEST_WITHOUT_DIAGNOSTIC_OR_ESTIMATOR');
 assert.equal((await rpc('create_my_service_request_v1',directArgs)).body.id||directId,directId);mark('DIRECT_REQUEST_RETRY');
 const att=attest('offer',{},user.id,env);assert.ok((await rpc('mobile_estimator_offer_v1',{...att,p_mac:'0'.repeat(64)})).status>=400);mark('ATTESTATION_TAMPER_REJECTED');
 assert.ok((await rpc('mobile_estimator_offer_v1',att,other)).status>=400);mark('ATTESTATION_CROSS_USER_REJECTED');
 const expiredAtt=attest('offer',{},user.id,env,randomUUID(),Date.now()-61000);assert.ok((await rpc('mobile_estimator_offer_v1',expiredAtt)).status>=400);mark('ATTESTATION_EXPIRED_REJECTED');
 }
 if(!preview){
  const sharp=require('sharp');const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#b0aa99'}}).png().toBuffer();const photo=await sanitizePhoto(bytes,'image/png',bytes.length);
  const provider={analyze:async({media})=>({result:{trade:'plomberie',problem:'Selon votre description, fuite du robinet possible.',observations:[],hypotheses:['Joint à vérifier'],urgency:'moderate',urgency_reason:'Écoulement déclaré.',checks:['À vérifier sur place.'],possible_parts:[],question_ids:[],safety_signals:[]},photoEvidence:media.map(m=>({media_id:m.id,status:'inconclusive',observations:[],safety_signals:[]})),usage:{fixture:true}})};
  const req={headers:{authorization:'Bearer '+user.token},body:{consent_version:'diagnostic-privacy-v1'}};
  const fetchImpl=async(...args)=>{const r=await fetch(...args);if(!r.ok){const body=await r.clone().json().catch(()=>({}));let message=String(body.message||body.error||'');for(const value of [...Object.values(env),...users.map(x=>x.token)])if(typeof value==='string'&&value.length>20)message=message.split(value).join('[REDACTED]');console.log('DEPENDENCY_DIAGNOSTIC '+JSON.stringify({path:new URL(args[0]).pathname,status:r.status,code:body.code,message:message.slice(0,250)}))}return r};
  const d=await persistPhoto(req,photo,'W41_DIAGNOSTIC_FIXTURE fuite robinet','rabat',{env,provider,fetchImpl});assert.ok(d.diagnostic_reference);assert.equal(d.result.safety.stop,false);assert.ok(d.result.facts.some(f=>f.provenance==='user_declared'));assert.equal(d.result.hypotheses[0].provenance,'ai_inferred');mark('DIAGNOSTIC_PERSISTED_REAL_STORAGE_PROVENANCE');
  const ref=unsealToken(security.unwrap(d.diagnostic_reference,'diagnostic',user.id,env),env.FIXEO_ESTIMATOR_SECRET);report.diagnostics.push(ref.session_id);
  const diagnosticStart={action:'start',entry_context:{city_slug:'rabat',description:'Fuite du robinet',service_hint:'plomberie.fuite_simple',diagnostic_token:d.diagnostic_reference}};
  const ds=await api(diagnosticStart);check(ds,200,'diagnostic reference');mark('DIAGNOSTIC_REFERENCE_VALID');
  check(await api(diagnosticStart,other),403,'diagnostic cross-user');mark('DIAGNOSTIC_CROSS_USER_REJECTED');
  check(await api({...diagnosticStart,entry_context:{...diagnosticStart.entry_context,diagnostic_token:d.diagnostic_reference.slice(0,-10)+'abcdefghij'}}),400,'diagnostic tamper');mark('DIAGNOSTIC_TAMPER_REJECTED');
  const ex=security.wrap(sealToken({...ref,expires_at:Date.now()+10},env.FIXEO_ESTIMATOR_SECRET),'diagnostic',user.id,env);await new Promise(r=>setTimeout(r,30));
  check(await api({...diagnosticStart,entry_context:{...diagnosticStart.entry_context,diagnostic_token:ex}}),410,'diagnostic expiry');mark('DIAGNOSTIC_EXPIRED_REJECTED');
  const step=ds.body.next_step;
  const clarification=step.type==='SERVICE_SELECTION'
    ? {action:'select_service',session_token:ds.body.session.session_token,service_code:'plomberie.fuite_simple'}
    : {action:'answer',session_token:ds.body.session.session_token,question_id:step.question_id,answer:require('../../data/pricing/engine/plumbing-pilot-v1').services['plomberie.fuite_simple'].inputs[step.input_id]};
  const qualified=await api(clarification);check(qualified,200,'one clarification');assert.equal(qualified.body.outcome.outcome_type,'QUOTE_REQUIRED');
  const quote=await api({action:'confirm_quote',session_token:qualified.body.session.session_token,client_phone:'0612345678',confirmed:true});check(quote,200,'diagnostic quote');assert.ok(quote.body.request_id);report.requests.push(quote.body.request_id);mark('DIAGNOSTIC_QUOTE_ATOMIC_CLIENT_BINDING');
  const stopped=await persistPhoto(req,photo,'Une très forte odeur de gaz','rabat',{env,provider});assert.equal(stopped.result.safety.stop,true);assert.equal(stopped.diagnostic_reference,null);mark('DIAGNOSTIC_TRUE_STOP_NO_HANDOFF');
  const transport=createClientTransport({auth:{token:user.token,userId:user.id},env:security.staging(env)});
  await assert.rejects(transport.request('/storage/v1/object/diagnostic-private-v1/safe/arbitrary.webp',{method:'POST',binary:true,headers:{'content-type':'image/webp'},body:photo.bytes}));mark('STORAGE_ARBITRARY_PATH_REJECTED');
 }
 report.status='PASS';
})().catch(error=>{report.status='FAIL';report.failure=String(error.message||error.code).slice(0,300);console.error('FAIL '+report.failure);process.exitCode=1}).finally(()=>{if(process.env.W41_REPORT_FILE)fs.writeFileSync(process.env.W41_REPORT_FILE,JSON.stringify(report,null,2)+'\n');console.log('Completed '+passed.length+' staging checks')});
