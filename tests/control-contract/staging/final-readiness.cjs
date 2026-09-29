'use strict';
const c=require('./checks.cjs'),{assert,syntheticId:id}=c,D=require('../../../api/control/decision-contracts');
const tests=[];
tests.push(['Expired approved and historical unreviewed quotes cannot become an accepted prestation',async()=>{
 const expired=await c.rpc('client','accept_quote_v2',{p_quote_id:id(721)});c.denied(expired);assert.equal(expired.data.message,'QUOTE_EXPIRED');
 assert.equal(c.ok(await c.select('client','quotes','select=id&id=eq.'+id(722))).length,0);c.denied(await c.rpc('client','accept_quote_v2',{p_quote_id:id(722)}));
 assert.equal(c.ok(await c.select('admin','missions','select=id&request_id=in.('+id(101)+','+id(102)+')')).length,0);
}]);
tests.push(['Diagnostic server producers remain denied to real ordinary JWTs and Control sees metadata only',async()=>{
 for(const actor of [null,'client','artisan','admin','enterprise_owner']){
  c.denied(await c.rpc(actor,'create_diagnostic_critical_request_v1',{p_diagnostic:{},p_client_phone:'0600000000',p_tracking_ref:'FX-SYNTHETIC-DENIED',p_guest_token_hash:'b'.repeat(64),p_ack_version:'fixeo-critical-ack-v1'}));
  c.denied(await c.rpc(actor,'create_diagnostic_quote_request_v1',{p_diagnostic:{},p_client_phone:'0600000000',p_tracking_ref:'FX-SYNTHETIC-DENIED',p_guest_token_hash:'c'.repeat(64),p_description:'SYNTHETIC_DENIED',p_service_category:'plomberie',p_city_slug:'rabat'}));
 }
 for(const n of [500,501]){const d=c.ok(await c.control('dossier',{type:'diagnostic_summary',id:id(n)}));assert.equal(d.summary.state,'bound');assert.ok(d.summary.request_id);assert.equal(d.summary.media_access,'forbidden');assert.equal(d.summary.input,undefined);assert.equal(d.summary.guest_secret_hash,undefined);}
}]);
tests.push(['Restored source authority returns healthy results and exact totals remain independent of pages',async()=>{
 const a=c.ok(await c.control('summary',{})),sources=a.sources;assert.ok(Object.values(sources).every(s=>s.status==='healthy'));assert.ok(sources.requests.data.metrics['requests.total']>841);
 const exact=c.ok(await c.select('admin','service_requests','select=id'),null);assert.ok(exact.length>700);
 const page=c.ok(await c.control('operations',{limit:10}));assert.equal(page.items.length,10);assert.equal(page.global_total,null);assert.equal(page.completeness,'page');
 assert.equal(sources.finance.data.metrics['finance.due_gross'],null);assert.equal(sources.missions.data.metrics['missions.validation_unproven'],1);
 const partial=await c.control('summary',{source:'requests',classification:'internal'});assert.equal(c.ok(partial).sources.requests.status,'healthy');
}]);
tests.push(['Real dossier, recommendation and audited execution enforce the RAFI foundation boundaries',async()=>{
 const sources=c.ok(await c.control('summary',{})).sources,rec=D.recommendation('urgent.active',sources);assert.equal(rec.status,'admissible');assert.equal(rec.action,null);
 const dossier=c.ok(await c.control('dossier',{type:'artisan',id:id(20)}));
 assert.equal(D.actionProposal('artisan.verify',dossier,[]).status,'abstained');const proposal=D.actionProposal('artisan.verify',dossier,['artisan.verify']);assert.equal(proposal.execution_authorized,false);
 const result=await c.command('artisan.verify',id(20));assert.equal(result.ok,true);assert.equal(D.decisionResult(result,id(20)).status,'verified');
 const seen=c.ok(await c.control('dossier',{type:'artisan',id:id(20)}));assert.ok(seen.timeline.some(x=>x.id===result.audit_id));assert.ok(!JSON.stringify(seen.timeline).includes('PRIVATE_'));
 c.denied(await c.control('action/execute',{recommendation:rec,confirmed:true}));
}]);
c.run('final-readiness',tests);
