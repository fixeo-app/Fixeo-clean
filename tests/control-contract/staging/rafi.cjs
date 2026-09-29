'use strict';
// Isolated Supabase Auth / RLS / API certification. http.cjs pins the staging ref.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./http.cjs'),R=require('../../../api/control/rafi-decisions');
const report={environment:h.REF,started_at:new Date().toISOString(),production_mutated:false,checks:[],sources:{}};
const out=process.env.FIXEO_RAFI_EVIDENCE_FILE;if(!out)throw Error('EVIDENCE_PATH_REQUIRED');
const check=async(name,fn)=>{const at=Date.now();try{const detail=await fn();report.checks.push({name,status:'PASS',duration_ms:Date.now()-at,...(detail||{})});}catch(e){report.checks.push({name,status:'FAIL',error:e.message,duration_ms:Date.now()-at});throw e;}};
async function session(name){try{await h.ensureSession(name);}catch{await h.login(name);}}
async function main(){
 await check('Real staging identities authenticate',async()=>{for(const name of Object.keys(h.identities))await session(name);return {identities:Object.keys(h.identities).length};});
 await check('Anon cannot invoke any new RAFI RPC',async()=>{for(const [name,body] of [['control_rafi_source_v1',{p_source:'network'}],['control_rafi_dispatch_read_v1',{p_request_id:h.randomId()}],['control_rafi_network_list_v1',{p_city:'Fès',p_trade:'plomberie'}]]){const r=await h.request('/rest/v1/rpc/'+name,{body});assert.ok([401,403].includes(r.status),name+':'+r.status);}});
 for(const name of Object.keys(h.identities).filter(x=>!x.startsWith('admin')))await check('Non-admin denied / '+name,async()=>{for(const [rpc,body] of [['control_rafi_source_v1',{p_source:'enterprise'}],['control_rafi_dispatch_read_v1',{p_request_id:h.randomId()}],['control_rafi_network_list_v1',{p_city:'Fès',p_trade:'plomberie'}]]){const r=await h.rpc(name,rpc,body);assert.equal(r.status,403,rpc+':'+r.status);assert.equal(r.data.code,'42501');}});
 await check('Admin reads each real source; completeness stays explicit',async()=>{
  const states={};for(const source of R.SOURCES){const at=Date.now(),r=await h.rpc('admin','control_rafi_source_v1',{p_source:source,p_classification:'all'});assert.equal(r.status,200,source+':'+JSON.stringify(r.data));states[source]=R.sourceState(source,r.data);assert.ok(['FRESH','PARTIAL'].includes(states[source].status),source+':'+states[source].status);report.sources[source]={status:states[source].status,total_observations:r.data.total_observations,returned:r.data.observations.length,duration_ms:Date.now()-at};assert.ok(!JSON.stringify(r.data).includes('PRIVATE_MARKER'));}
  const b=R.build(states);assert.equal(new Set(b.decisions.map(d=>d.decision_id)).size,b.decisions.length);assert.ok(b.decisions.every(d=>d.actionability.execution_authorized===false));report.briefing={status:b.status,decision_count:b.decisions.length,types:[...new Set(b.decisions.map(d=>d.decision_type))].sort()};
  const cohort=states.network.data.observations.find(o=>o.facts.location_known&&o.facts.to_verify>0)||states.network.data.observations.find(o=>o.facts.location_known);
  if(cohort){const n=await h.rpc('admin','control_rafi_network_list_v1',{p_city:cohort.city,p_trade:cohort.service_category,p_state:'all',p_classification:'all',p_limit:1});assert.equal(n.status,200);assert.ok(n.data.items.length<=1);assert.ok(n.data.items.every(a=>!Object.hasOwn(a,'phone')));if(n.data.has_more){const next=await h.rpc('admin','control_rafi_network_list_v1',{p_city:cohort.city,p_trade:cohort.service_category,p_limit:1,p_after:n.data.next_cursor});assert.equal(next.status,200);assert.ok(next.data.items.every(a=>a.id!==n.data.items[0].id));}}
 });
 await check('Scoped classification and invalid input are enforced',async()=>{const r=await h.rpc('admin','control_rafi_source_v1',{p_source:'network',p_classification:'test'});assert.equal(r.status,200);assert.equal(r.data.classification,'test');const bad=await h.rpc('admin','control_rafi_source_v1',{p_source:'network',p_classification:'secret'});assert.equal(bad.status,400);assert.equal(bad.data.message,'INVALID_CLASSIFICATION');});
 await check('Governed Claims action requires confirmation and returns one audited idempotent outcome',async()=>{
  const a=await h.select('admin','artisans','select=id&claimed=eq.false&owner_user_id=is.null&limit=1');assert.equal(a.status,200);assert.ok(a.data.length,'ISOLATED_UNCLAIMED_PROFILE_REQUIRED');
  const target=h.randomId(),key=h.randomId();
  const created=await h.request('/rest/v1/claim_requests',{actor:'claimant_a',body:{id:target,artisan_id:a.data[0].id,requester_user_id:h.uid('claimant_a'),requester_name:'Synthetic RAFI certification',requester_phone:'+000000000001',status:'pending'},headers:{Prefer:'return=representation'}});assert.equal(created.status,201,created.data?.message);
  const p=await h.rpc('admin','control_action_preview_v1',{p_capability:'claim.reject',p_target_id:target,p_payload:{reason:'Synthetic Bloc 2 staging certification'},p_correlation_id:h.randomId()});assert.equal(p.status,200,p.data?.message);
  const denied=await h.rpc('admin','control_action_execute_v1',{p_preview_id:p.data.preview_id,p_confirmed:false,p_idempotency_key:key});assert.equal(denied.status,400);assert.equal(denied.data.message,'HUMAN_CONFIRMATION_REQUIRED');
  const args={p_preview_id:p.data.preview_id,p_confirmed:true,p_idempotency_key:key},first=await h.rpc('admin','control_action_execute_v1',args),replay=await h.rpc('admin','control_action_execute_v1',args);assert.equal(first.status,200);assert.equal(first.data.ok,true,first.data.code);assert.equal(first.data.verified.status,'rejected');assert.deepEqual(first.data,replay.data);
  const dossier=await h.rpc('admin','control_dossier_read_v1',{p_type:'claim',p_id:target});assert.equal(dossier.status,200);assert.equal(dossier.data.timeline.filter(e=>e.id===first.data.audit_id).length,1);
  return {target_id:target,audit_id:first.data.audit_id,idempotency_key:key};
 });
 report.verdict='PASS';
}
main().catch(error=>{report.verdict='FAIL';report.error=error.message;process.exitCode=1;}).finally(()=>{report.finished_at=new Date().toISOString();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verdict:report.verdict,checks:report.checks.length,sources:report.sources,briefing:report.briefing,error:report.error}));});
