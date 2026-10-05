'use strict';
// Operator-only staging certification. No credentials or private origin in Git.
// Never retries a mutation automatically. Fixture-only, no cleanup/purge authority.
const fs=require('fs'),assert=require('assert/strict'),{randomUUID,createHash}=require('crypto');
const security=require('../../api/mobile-intelligence-fn/security');
const {sealToken,unsealToken}=require('../../api/estimator-v1/fixeo-estimator-token-v1');
const {attest,createClientTransport}=require('../../api/mobile-intelligence-fn/transport');
for(const k of ['W41_ENV_FILE','W41_AUTH_FILE','W41_REPORT_FILE'])assert.ok(process.env[k],k+' required');
const env={...JSON.parse(fs.readFileSync(process.env.W41_ENV_FILE)),NODE_ENV:'test',VERCEL_URL:'fixture.vercel.app'};
assert.equal(env.SUPABASE_URL,'https://kqyhusnbybsukbcaoqtu.supabase.co');assert.equal(env.FIXEO_STAGING_PROJECT_REF,'kqyhusnbybsukbcaoqtu');
const users=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE)),[u,other,artisan]=users;
const edge=env.SUPABASE_URL+'/functions/v1/mobile-rafi-preview-proxy';
const report={mode:'real-shared-proxy',started_at:new Date().toISOString(),passed:[],calls:[],requests:[],diagnostics:[],storage:[]};
const mark=x=>{report.passed.push(x);console.log('PASS '+x)};
const privateValues=[...Object.values(env),...users.map(x=>x.token)].filter(x=>typeof x==='string'&&x.length>25);
async function call(label,route,body,user=u,{method='POST',headers={},raw=false,rpc=false}={}){
 const t=performance.now(),isForm=body instanceof FormData;
 const r=await fetch((rpc?env.SUPABASE_URL:edge)+route,{method,headers:{apikey:env.SUPABASE_ANON_KEY,...(user?{authorization:'Bearer '+user.token}:{}),...(!isForm?{'content-type':'application/json'}:{}),...headers},body:method==='GET'?undefined:isForm||raw?body:JSON.stringify(body),signal:AbortSignal.timeout(65000),redirect:'error'});
 const text=await r.text();for(const secret of privateValues)assert.ok(!text.includes(secret),'Secret in response');
 assert.ok(!/Error:.*\n\s+at |postgresql:\/\//.test(text),'Internal detail in response');
 const b=JSON.parse(text);const entry={label,scope:rpc?'JWT canonical RPC':'shared proxy',status:r.status,error:typeof b.error==='string'?b.error:undefined,latency_ms:Math.round(performance.now()-t),response_bytes:Buffer.byteLength(text)};
 report.calls.push(entry);console.log(JSON.stringify(entry));return {status:r.status,body:b};
}
const api=(label,body,user=u,options)=>call(label,'/api/mobile-estimator-v1',body,user,options);
const rpc=(label,name,args,user=u)=>call(label,'/rest/v1/rpc/'+name,args,user,{rpc:true});
function check(r,status,label){assert.equal(r.status,status,label+(r.body.error?': '+r.body.error:''));return r.body;}
// wrap() validates expiry, so generate a future fixture then allow its TTL to lapse.
async function expired(token,kind){const payload=unsealToken(security.unwrap(token,kind,u.id,env),env.FIXEO_ESTIMATOR_SECRET);const out=security.wrap(sealToken({...payload,expires_at:Date.now()+100},env.FIXEO_ESTIMATOR_SECRET),kind,u.id,env);await new Promise(r=>setTimeout(r,130));return out;}
const tamper=t=>t.slice(0,-12)+'abcdefghijkl';
const fixed={action:'start',entry_context:{city_slug:'rabat',description:'W41B_SHARED_FIXTURE '+randomUUID(),service_hint:'bricolage.visite_minimum'}};
async function estimator(){
 const s=check(await api('ESTIMATOR_START_WITHOUT_DIAGNOSTIC',fixed),200,'start');assert.ok(!s.next_step || s.next_step.type==='READY');mark('ESTIMATOR_OPTIONAL_DIAGNOSTIC_NO_SAFETY_QUESTION');
 const token=s.session.session_token;
 check(await api('SESSION_CROSS_USER',{action:'evaluate',session_token:token},other),403,'session owner');
 check(await api('SESSION_TAMPER',{action:'evaluate',session_token:tamper(token)}),400,'session tamper');
 const e=check(await api('ESTIMATOR_EVALUATE',{action:'evaluate',session_token:token}),200,'evaluate');assert.equal(e.outcome.outcome_type,'PRICE_READY');mark('CANONICAL_PRICE_READY');
 const pricing=e.pricing_context_token;
 check(await api('PRICING_VALID',{action:'verify_pricing_context',pricing_context_token:pricing}),200,'pricing');
 check(await api('PRICING_EXPIRED',{action:'verify_pricing_context',pricing_context_token:await expired(pricing,'pricing')}),410,'expiry');
 check(await api('PRICING_TAMPER',{action:'verify_pricing_context',pricing_context_token:tamper(pricing)}),400,'tamper');
 const confirm={action:'confirm_request',pricing_context_token:pricing,client_phone:'0612345678',city_slug:'rabat',service_code:'bricolage.visite_minimum',confirmed:true};
 check(await api('HANDOFF_CROSS_USER',confirm,other),403,'owner');
 check(await api('HANDOFF_ARTISAN',confirm,artisan),403,'artisan');
 check(await api('HANDOFF_CITY_MISMATCH',{...confirm,city_slug:'fes'}),409,'city');
 check(await api('HANDOFF_SERVICE_MISMATCH',{...confirm,service_code:'plomberie.fuite_simple'}),409,'service');
 check(await api('HANDOFF_PRICE_INJECTION',{...confirm,amount_mad:1}),400,'price injection');
 const taps=await Promise.all([api('HANDOFF_DOUBLE_TAP_A',confirm),api('HANDOFF_DOUBLE_TAP_B',confirm)]);taps.forEach(r=>check(r,200,'double tap'));assert.equal(taps[0].body.request_id,taps[1].body.request_id);assert.ok(taps[0].body.request_id);report.requests.push(taps[0].body.request_id);
 assert.equal(check(await api('HANDOFF_RETRY_IDENTICAL',confirm),200,'retry').request_id,taps[0].body.request_id);
 check(await api('HANDOFF_PAYLOAD_CONFLICT',{...confirm,client_phone:'0612345679'}),409,'conflict');
 const e2=check(await api('REEVALUATE',{action:'evaluate',session_token:token}),200,'reevaluate');assert.equal(check(await api('RECONFIRM',{...confirm,pricing_context_token:e2.pricing_context_token}),200,'reconfirm').request_id,taps[0].body.request_id);mark('HANDOFF_IDEMPOTENCY_DOUBLE_TAP_RETRY_CONFLICT');
 const owned=await fetch(env.SUPABASE_URL+'/rest/v1/service_requests?id=eq.'+taps[0].body.request_id+'&select=id,client_profile_id',{headers:{apikey:env.SUPABASE_ANON_KEY,authorization:'Bearer '+u.token}});assert.equal((await owned.json())[0].client_profile_id,u.id);mark('REQUEST_OWNER_FROM_JWT');
 const q=check(await api('QUALIFICATION_START',{...fixed,entry_context:{...fixed.entry_context,service_hint:'plomberie.fuite_simple'}}),200,'qualification');assert.equal(q.next_step.type,'QUESTION');
 const step=q.next_step,answer=require('../../data/pricing/engine/plumbing-pilot-v1').services['plomberie.fuite_simple'].inputs[step.input_id];
 const qualified=check(await api('ANSWER',{action:'answer',session_token:q.session.session_token,question_id:step.question_id,answer}),200,'answer');assert.equal(qualified.outcome.outcome_type,'QUOTE_REQUIRED');assert.equal(qualified.next_step,null);mark('ONE_CLARIFICATION_CANONICAL_QUOTE_REQUIRED');
 const stop=check(await api('REAL_SAFETY_STOP',{...fixed,entry_context:{...fixed.entry_context,description:'Une très forte odeur de gaz'}}),200,'stop');assert.equal(stop.outcome.outcome_type,'SAFETY_STOP');assert.equal(stop.pricing_context_token,null);
 for(const action of ['evaluate','select_service','confirm_quote'])check(await api('STOP_'+action,{action,session_token:stop.session.session_token,...(action==='select_service'?{service_code:'bricolage.visite_minimum'}:action==='confirm_quote'?{confirmed:true,client_phone:'0612345678'}:{})}),409,'stop guarded');mark('TRUE_STOP_NO_PRICING_NO_REQUEST_NO_LOCAL_LIFT');
}
async function direct(){
 const args={p_service_category:'bricolage',p_city:'rabat',p_description:'W41B_SHARED_DIRECT_FIXTURE besoin simple',p_idempotency_key:randomUUID()};
 const d=check(await rpc('DIRECT_CLIENT_REQUEST','create_my_service_request_v1',args),200,'direct');const id=d.id||d.request_id;assert.ok(id);report.requests.push(id);
 const retry=check(await rpc('DIRECT_IDENTICAL_RETRY','create_my_service_request_v1',args),200,'retry');assert.equal(retry.id||retry.request_id,id);
 assert.ok((await rpc('DIRECT_ARTISAN_REFUSED','create_my_service_request_v1',{...args,p_idempotency_key:randomUUID()},artisan)).status>=400);mark('DIRECT_WITHOUT_DIAGNOSTIC_ESTIMATOR_PRICING');
}
async function diagnostic(){
 const image=await require('sharp')({create:{width:64,height:64,channels:3,background:'#b0aa99'}}).png().toBuffer();
 function form(description){const f=new FormData();f.append('image',new Blob([image],{type:'image/png'}),'w41b-synthetic.png');f.append('city','rabat');f.append('description',description);f.append('persist','true');f.append('consent_version','diagnostic-privacy-v1');return f;}
 const d=check(await call('PERSISTED_DIAGNOSTIC_CLIENT','/api/mobile-rafi-photo',form('W41B_SYNTHETIC_FIXTURE Fuite du robinet déclarée par le client.')) ,200,'diagnostic');
 assert.equal(d.privacy.persisted,true);assert.equal(d.result.safety.stop,false);assert.equal(d.result.questions.length,0);assert.ok(d.diagnostic_reference);assert.ok(d.result.facts.some(x=>x.provenance==='user_declared'));assert.ok(d.result.hypotheses.every(x=>x.provenance==='ai_inferred'));assert.ok(!d.result.facts.some(x=>x.provenance==='user_confirmed'));
 const ref=unsealToken(security.unwrap(d.diagnostic_reference,'diagnostic',u.id,env),env.FIXEO_ESTIMATOR_SECRET);report.diagnostics.push(ref.session_id);
 const transport=createClientTransport({auth:{token:u.token,userId:u.id},env:security.staging(env)});
 const snapshot=await transport.rpc('diagnostic_state_v1',{p_action:'get',p_actor:'u:'+u.id,p_session_id:ref.session_id,p_payload:{}});assert.equal(snapshot.session.owner_user_id,u.id);assert.equal(snapshot.run.id,ref.run_id);
 for(const m of snapshot.media){const bytes=await transport.request('/storage/v1/object/diagnostic-private-v1/'+m.clean_path,{method:'GET',binary:true,maxBytes:8388608});assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256);report.storage.push({session_id:ref.session_id,path:m.clean_path,state:m.state,hash_verified:true});}
 mark('DIAGNOSTIC_PERSISTENCE_SERVER_HASH_PROVENANCE_OWNERSHIP');
 const start={action:'start',entry_context:{city_slug:'rabat',description:'Fuite du robinet',service_hint:'plomberie.fuite_simple',diagnostic_token:d.diagnostic_reference}};
 const ds=check(await api('DIAGNOSTIC_REFERENCE_VALID',start),200,'reference');
 check(await api('DIAGNOSTIC_REFERENCE_CROSS_USER',start,other),403,'reference owner');
 check(await api('DIAGNOSTIC_REFERENCE_TAMPER',{...start,entry_context:{...start.entry_context,diagnostic_token:tamper(d.diagnostic_reference)}}),400,'ref tamper');
 check(await api('DIAGNOSTIC_REFERENCE_EXPIRED',{...start,entry_context:{...start.entry_context,diagnostic_token:await expired(d.diagnostic_reference,'diagnostic')}}),410,'ref expiry');
 const step=ds.next_step;assert.ok(step);
 const qualification=step.type==='SERVICE_SELECTION'?{action:'select_service',session_token:ds.session.session_token,service_code:'plomberie.fuite_simple'}:{action:'answer',session_token:ds.session.session_token,question_id:step.question_id,answer:require('../../data/pricing/engine/plumbing-pilot-v1').services['plomberie.fuite_simple'].inputs[step.input_id]};
 const qualified=check(await api('DIAGNOSTIC_QUALIFY',qualification),200,'qualify');assert.equal(qualified.outcome.outcome_type,'QUOTE_REQUIRED');
 const quote=check(await api('DIAGNOSTIC_QUOTE_HANDOFF',{action:'confirm_quote',session_token:qualified.session.session_token,client_phone:'0612345678',confirmed:true}),200,'quote');assert.ok(quote.request_id);report.requests.push(quote.request_id);mark('DIAGNOSTIC_ESTIMATOR_QUOTE_HANDOFF');
 const stopped=check(await call('PERSISTED_DIAGNOSTIC_TRUE_STOP','/api/mobile-rafi-photo',form('Une très forte odeur de gaz')) ,200,'diagnostic STOP');assert.equal(stopped.result.safety.stop,true);assert.equal(stopped.diagnostic_reference,null);mark('PERSISTED_STOP_NO_HANDOFF');
}
async function negatives(){
 check(await call('METHOD_REFUSED','/api/mobile-estimator-v1',null,u,{method:'GET'}),405,'method');
 check(await call('UNKNOWN_ROUTE','/api/anything',{hello:true}),404,'route');
 check(await api('OVERSIZE',{data:'x'.repeat(97000)}),413,'size');
 const malformed=await call('MALFORMED_JSON_FAILS_CLOSED','/api/mobile-estimator-v1','{',u,{raw:true});
 assert.ok([400,502,503].includes(malformed.status));assert.equal(malformed.body.ok,false);
 check(await api('CLIENT_BYPASS_OVERRIDE_IGNORED',{action:'unknown'},u,{headers:{'x-vercel-protection-bypass':'invalid-client-value'}}),400,'server-owned bypass');
 for(const [label,a,user] of [['TAMPER',{...attest('offer',{},u.id,env),p_mac:'0'.repeat(64)},u],['CROSS_USER',attest('offer',{},u.id,env),other],['EXPIRED',attest('offer',{},u.id,env,randomUUID(),Date.now()-61000),u]])assert.ok((await rpc('ATTESTATION_'+label,'mobile_estimator_offer_v1',a,user)).status>=400);
 mark('BOUNDED_PROXY_AND_CANONICAL_ATTESTATION_NEGATIVES');
}
(async()=>{
 for(const user of users)assert.ok(user.token,'Authenticated staging fixtures required');
 if(process.env.W41_STAGE==='negatives')await negatives();
 else{await estimator();await direct();await diagnostic();await negatives();}report.status='PASS';
})().catch(e=>{report.status='FAIL';report.failure_class=e.name;report.failure=String(e.message).slice(0,180);console.error(JSON.stringify({critical_failure:true,failure:report.failure}));process.exitCode=1}).finally(()=>{report.finished_at=new Date().toISOString();fs.writeFileSync(process.env.W41_REPORT_FILE,JSON.stringify(report,null,2)+'\n')});
