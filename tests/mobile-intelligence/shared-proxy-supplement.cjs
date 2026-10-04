'use strict';
const fs=require('fs'),assert=require('assert/strict'),{randomUUID}=require('crypto');for(const key of ['W41_ENV_FILE','W41_AUTH_FILE','W41_FUNCTIONAL_REPORT','W41_REPORT_FILE'])assert.ok(process.env[key],key+' required');
const env={...JSON.parse(fs.readFileSync(process.env.W41_ENV_FILE)),NODE_ENV:'test',VERCEL_URL:'fixture.vercel.app'},[u,other]=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE));
const {createClientTransport,attest}=require('../../api/mobile-intelligence-fn/transport'),security=require('../../api/mobile-intelligence-fn/security');
assert.equal(env.SUPABASE_URL,'https://kqyhusnbybsukbcaoqtu.supabase.co');assert.equal(env.FIXEO_STAGING_PROJECT_REF,'kqyhusnbybsukbcaoqtu');
const previous=JSON.parse(fs.readFileSync(process.env.W41_FUNCTIONAL_REPORT)),report={checks:[],calls:[]};
const mark=x=>{report.checks.push(x);console.log('PASS '+x)};
async function api(label,body,headers={}){const t=performance.now();const r=await fetch(env.SUPABASE_URL+'/functions/v1/mobile-rafi-preview-proxy/api/mobile-estimator-v1',{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,authorization:'Bearer '+u.token,'content-type':'application/json',...headers},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(65000)});const b=await r.json();const entry={label,status:r.status,error:b.error,outcome:b.outcome?.outcome_type,next_step:b.next_step?.type,latency_ms:Math.round(performance.now()-t)};report.calls.push(entry);console.log(JSON.stringify(entry));assert.equal(r.status,headers.origin?403:200);return b;}
(async()=>{
 const tr=createClientTransport({auth:{token:u.token,userId:u.id},env:security.staging(env)}),tr2=createClientTransport({auth:{token:other.token,userId:other.id},env:security.staging(env)});
 const args=attest('diagnostic',{action:'get',session_id:previous.diagnostics[0],payload:{}},u.id,env);
 const rpc='/rest/v1/rpc/mobile_diagnostic_state_v1';
 const a=await tr.request(rpc,{body:args}),b=await tr.request(rpc,{body:args});assert.deepEqual(b,a);mark('ATTESTED_READ_RECHECKED_WITHOUT_MUTATION');
 const changed=attest('diagnostic',{action:'get',session_id:previous.diagnostics[0],payload:{revision:99}},u.id,env,JSON.parse(args.p_envelope).operation_id);
 assert.equal((await tr.request(rpc,{body:changed})).session.id,a.session.id);mark('READS_NOT_CACHED_AS_MUTATION_AUTHORITY');
 await assert.rejects(tr2.request(rpc,{body:args}));mark('DIAGNOSTIC_RPC_CROSS_USER_REFUSED');
 for(const m of a.media)await assert.rejects(tr2.request('/storage/v1/object/diagnostic-private-v1/'+m.clean_path,{method:'GET',binary:true}));mark('STORAGE_CROSS_USER_READ_REFUSED');
 report.provenances=[...new Set([...a.run.result.facts,...a.run.result.hypotheses].map(x=>x.provenance))];assert.ok(report.provenances.every(x=>['observed','user_declared','ai_inferred','user_confirmed'].includes(x)));assert.ok(!report.provenances.includes('user_confirmed'));mark('PROVENANCE_NOT_PROMOTED_TO_USER_CONFIRMED');
 const s=await api('SELECT_SERVICE_START',{action:'start',entry_context:{city_slug:'rabat',description:'W41B_SELECT_FIXTURE',metier_hint:'bricolage'}});assert.equal(s.next_step.type,'SERVICE_SELECTION');
 const selected=await api('SELECT_SERVICE',{action:'select_service',session_token:s.session.session_token,service_code:'bricolage.visite_minimum'});assert.equal(selected.next_step.type,'READY');const evaluated=await api('SELECTED_SERVICE_EVALUATE',{action:'evaluate',session_token:selected.session.session_token});assert.equal(evaluated.outcome.outcome_type,'PRICE_READY');mark('SELECT_SERVICE_CANONICAL');
 const diag=await api('DIAGNOSTIC_TARIFF_START',{action:'start',entry_context:{city_slug:'rabat',description:'W41B_DIAGNOSTIC_TARIFF_FIXTURE',service_hint:'plomberie.diagnostic'}});
 const d=await api('DIAGNOSTIC_TARIFF_ONE_ANSWER',{action:'answer',session_token:diag.session.session_token,question_id:diag.next_step.question_id,answer:'LOCAL_ACCESSIBLE'});assert.equal(d.outcome.outcome_type,'QUOTE_REQUIRED');mark('DIAGNOSTIC_TARIFF_NOT_INVENTED_AFTER_ONE_CLARIFICATION');
 const part=await api('PARTS_TARIFF_START',{action:'start',entry_context:{city_slug:'rabat',description:'W41B_PARTS_TARIFF_FIXTURE',service_hint:'plomberie.robinet_remplacement'}});
 const p=await api('PARTS_TARIFF_ONE_ANSWER',{action:'answer',session_token:part.session.session_token,question_id:part.next_step.question_id,answer:'LOCAL_ACCESSIBLE'});assert.equal(p.outcome.outcome_type,'QUOTE_REQUIRED');mark('PARTS_PRICE_NOT_INVENTED_AFTER_ONE_CLARIFICATION');
 await api('ORIGIN_REJECTED',{action:'start',entry_context:{city_slug:'rabat',description:'fixture'}},{origin:'https://invalid.example'});mark('CALLER_ORIGIN_NOT_AUTHORITY');report.status='PASS';
})().catch(e=>{report.status='FAIL';console.error(JSON.stringify({failure_class:e.name,message:e.message.slice(0,140)}));process.exitCode=1}).finally(()=>fs.writeFileSync(process.env.W41_REPORT_FILE,JSON.stringify(report,null,2)));
