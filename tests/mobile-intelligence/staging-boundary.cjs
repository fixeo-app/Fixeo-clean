'use strict';
// Explicit operator-run staging test. Credential files stay outside Git.
const fs=require('fs'),assert=require('assert/strict'),{randomUUID,createHmac}=require('crypto');
const {attest,createClientTransport}=require('../../api/mobile-intelligence-fn/transport');
const {persistPhoto}=require('../../api/mobile-intelligence-fn/diagnostic');
const {sanitizePhoto}=require('../../api/diagnostic/media');
const security=require('../../api/mobile-intelligence-fn/security');
const {unsealToken}=require('../../api/estimator-v1/fixeo-estimator-token-v1');
const env={...JSON.parse(fs.readFileSync(process.env.W41_ENV_FILE)),NODE_ENV:'test',VERCEL_URL:'w41-test.vercel.app'};
assert.equal(env.FIXEO_STAGING_PROJECT_REF,'kqyhusnbybsukbcaoqtu');
const [u,other]=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE));
const report={passed:[],requests:[]};const mark=name=>{report.passed.push(name);console.log('PASS '+name)};
const transport=user=>createClientTransport({auth:{token:user.token,userId:user.id},env:security.staging(env)});
const raw=(name,args,user=u)=>transport(user).request('/rest/v1/rpc/'+name,{body:args});
(async()=>{
 for(const patch of [{environment:'production'},{branch:'main'},{operation:'diagnostic'},{project_ref:'wrong-project'}]){
  const a=attest('offer',{},u.id,env);a.p_envelope=JSON.stringify({...JSON.parse(a.p_envelope),...patch});
  a.p_mac=createHmac('sha256',env.FIXEO_W41_ATTESTATION_SECRET).update('fixeo-w41-attestation-v1:'+a.p_envelope).digest('hex');
  await assert.rejects(raw('mobile_estimator_offer_v1',a),/ATTESTATION_SCOPE/);
 }mark('ATTESTATION_ENV_BRANCH_OPERATION_PROJECT_REJECTED');
 const row={id:randomUUID(),offer_key:randomUUID(),pricing_version:'vap-bp33-v1',currency:'MAD',service_code:'jardinage.tonte_pelouse',catalogue_version:'staging-synthetic-fixture',city:'rabat',scope:{context_id:'fxctx-'+randomUUID().replaceAll('-',''),session_id:'w41-live-'+randomUUID(),outcome_type:'PRICE_READY'},vap_minor:30000,materials_minor:0,commission_minor:6000,client_total_minor:36000,expires_at:new Date(Date.now()+600000).toISOString()};
 await transport(u).offer(row);assert.equal((await transport(u).offer(row)).replayed,true);mark('PERSISTED_OFFER_IDENTICAL_REPLAY');
 await assert.rejects(transport(u).offer({...row,city:'fes'}),/IDEMPOTENCY_CONFLICT/);mark('PERSISTED_OFFER_CONFLICT_REJECTED');
 const c={p_context_id:row.scope.context_id,p_outcome_type:'PRICE_READY',p_service_code:row.service_code,p_session_id:row.scope.session_id,p_amount_mad:360,p_city_slug:'rabat',p_client_phone:'0612345678',p_description:'W41_VAP_SQL_FIXTURE',p_tracking_ref:'FX-'+randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),p_guest_token_hash:'a'.repeat(64),p_offer_id:row.id};
 await assert.rejects(transport(other).confirm(c),/REJECTED/);mark('OFFER_CROSS_USER_CONFIRM_REJECTED');
 const confirmed=await transport(u).confirm(c);assert.equal(confirmed.ok,true);report.requests.push(confirmed.request_id);mark('REAL_VAP_TRANSACTION_CLIENT_JWT');
 const ref=unsealToken(security.unwrap(JSON.parse(fs.readFileSync(process.env.W41_PHOTO_REFERENCE_FILE)).reference,'diagnostic',u.id,env),env.FIXEO_ESTIMATOR_SECRET);
 const d=await transport(u).rpc('diagnostic_state_v1',{p_action:'get',p_actor:'u:'+u.id,p_session_id:ref.session_id,p_payload:{}});
 const path='/storage/v1/object/diagnostic-private-v1/'+d.media[0].clean_path;
 const bytes=await transport(u).request(path,{method:'GET',binary:true,maxBytes:8388608});
 await assert.rejects(transport(other).request(path,{method:'GET',binary:true}));mark('STORAGE_CROSS_USER_READ_REJECTED');
 await assert.rejects(transport(u).request(path,{method:'POST',binary:true,headers:{'content-type':'image/webp','x-upsert':'true'},body:bytes}));mark('STORAGE_OVERWRITE_REJECTED');
 const image=await require('sharp')({create:{width:16,height:16,channels:3,background:'#aaccee'}}).webp().toBuffer();const photo=await sanitizePhoto(image,'image/webp',image.length);
 let providerCalled=false;
 const fetchImpl=async(url,options)=>fetch(url,options.method==='POST'&&url.includes('/storage/v1/object/')?{...options,body:Buffer.concat([options.body,Buffer.from('tampered')])}:options);
 await assert.rejects(persistPhoto({headers:{authorization:'Bearer '+other.token},body:{consent_version:'diagnostic-privacy-v1'}},photo,'W41_HASH_SUBSTITUTION_FIXTURE','rabat',{env,fetchImpl,provider:{analyze:async()=>{providerCalled=true;throw Error('must not run')}}}),/MEDIA_HASH_MISMATCH/);
 assert.equal(providerCalled,false);mark('REAL_STORAGE_HASH_SUBSTITUTION_REJECTED_BEFORE_ANALYSIS');
 report.status='PASS';
})().catch(e=>{report.status='FAIL';report.failure=String(e.message).slice(0,180);console.error('FAIL '+report.failure);process.exitCode=1}).finally(()=>{fs.writeFileSync(process.env.W41_REPORT_FILE,JSON.stringify(report,null,2)+'\n')});
