'use strict';
const c=require('./checks.cjs'),fs=require('node:fs');
const {assert,id}= {assert:c.assert,id:c.syntheticId};
const operations=[['summary',{}],['operations',{}],['dossier',{type:'request',id:id(100)}],['search',{type:'request',query:'Fès'}],['signals',{}],['action/preview',{capability:'artisan.verify',target_id:id(20),payload:{reason:'Synthetic review'}}],['action/execute',{preview_id:id(999),confirmed:true,idempotency_key:c.randomId()}]];
const tests=[];
tests.push(['seven APIs reject anonymous and invalid bearer',async()=>{
 await Promise.all(operations.map(async([op,body])=>{assert.equal((await c.control(op,body,null)).status,401);assert.ok([401,403].includes((await c.control(op,body,null,{token:'invalid-bearer-does-not-authorize'})).status));}));
}]);
for(const actor of ['client','artisan','enterprise_viewer','enterprise_operations','enterprise_owner','enterprise_site_manager','enterprise_b_owner'])tests.push(['seven APIs deny non-admin '+actor,async()=>{await Promise.all(operations.map(async([op,body])=>assert.equal((await c.control(op,body,actor)).status,403,op+':'+actor)));}]);
tests.push(['Admin reads typed APIs; invalid IDs/parameters/method/origin denied',async()=>{
 const summary=c.ok(await c.control('summary'));assert.ok(summary.sources.requests.data.metrics['requests.total']>=841);
 c.ok(await c.control('operations'));c.ok(await c.control('dossier',{type:'request',id:id(100)}));c.ok(await c.control('search',{type:'request',query:'Fès'}));c.ok(await c.control('signals'));
 c.denied(await c.control('dossier',{type:'request',id:id(999999)}),/NOT_FOUND/);
 c.denied(await c.control('dossier',{type:'request',id:'invalid'}),/INVALID_ID/);
 c.denied(await c.control('operations',{limit:101}),/INVALID_FILTER/);
 c.denied(await c.control('summary',{classification:'hidden'}),/INVALID_CLASSIFICATION/);
 c.denied(await c.control('operations',{table:'auth.users'}),/INVALID_PAYLOAD/);
 c.denied(await c.control('summary',{},'admin',{method:'GET'}),/METHOD_NOT_ALLOWED/);
 c.denied(await c.control('summary',{},'admin',{headers:{Origin:'https://attacker.invalid'}}),/ORIGIN_REJECTED/);
 c.denied(await c.control('action/execute',{preview_id:id(999),confirmed:false,idempotency_key:c.randomId()}),/HUMAN_CONFIRMATION_REQUIRED/);
 c.denied(await c.control('operations',{enterprise_id:id(300),site_id:id(311)}),/INVALID_TENANT_SCOPE/);
}]);
tests.push(['Exact metrics exceed 700 and distinguish unknown/fulfilled/active',async()=>{
 const s=c.ok(await c.control('summary')).sources, m=s.requests.data.metrics;
 assert.equal(m['requests.total'],841);assert.equal(m['requests.new'],146);assert.equal(m['requests.fulfilled'],234);assert.equal(m['requests.cancelled'],115);assert.equal(m['urgency.now'],213);assert.equal(m['urgency.urgent'],214);assert.equal(m['urgency.total'],427);assert.ok(m['urgency.active']<m['urgency.total']);
 assert.equal(s.missions.data.metrics['missions.validated_raw'],2);assert.equal(s.missions.data.metrics['missions.validated'],1);assert.equal(s.missions.data.metrics['missions.validation_unproven'],1);
 assert.equal(s.finance.data.metrics['finance.due_gross'],null);assert.equal(s.finance.data.metrics['finance.confirmed'],0);
 assert.equal(s.artisans.data.metrics['artisans.available'],2);assert.equal(s.artisans.data.metrics['artisans.verification_conflict'],1);
 assert.equal(require('../../../api/control/contracts').metricValue(s,'artisans.active_30d'),null);
 const classes=await Promise.all(['production','test','internal','unclassified'].map(async classification=>[classification,c.ok(await c.control('summary',{classification})).sources.requests.data.metrics['requests.total']]));
 assert.deepEqual(Object.fromEntries(classes),{production:200,test:241,internal:200,unclassified:200});
}]);
tests.push(['Keyset pagination traverses all 800 volume requests once',async()=>{
 let after=null;const ids=[];for(let page=0;page<9;page++){
  const r=c.ok(await c.control('operations',{city:'SYNTHETIC_VOLUME',limit:100,after}));assert.equal(r.global_total,null);assert.equal(r.completeness,'page');ids.push(...r.items.map(x=>x.id));if(!r.has_more)break;assert.ok(r.next_cursor);after=r.next_cursor;
 }assert.equal(ids.length,800);assert.equal(new Set(ids).size,800);
}]);
tests.push(['Direct protected writes denied by real PostgREST for all actors',async()=>{
 for(const actor of [null,'client','artisan','admin','enterprise_owner'])await Promise.all(['service_requests','missions','quotes'].map(async table=>{
  for(const method of ['POST','PATCH','DELETE']){
   const r=await c.request('/rest/v1/'+table+(method==='POST'?'':'?id=eq.'+id(100)),{actor,method,body:method==='DELETE'?undefined:method==='POST'?{id:id(9998)}:{status:'validated'}});
   assert.ok([401,403].includes(r.status),`${actor}:${table}:${method}:${r.status}`);
  }
 }));
 assert.equal(c.ok(await c.control('dossier',{type:'request',id:id(100)})).summary.status,'new');
 c.denied(await c.request('/rest/v1/artisans?id=eq.'+id(20),{actor:'artisan',method:'PATCH',body:{verified:true,is_verified:true}}));
 c.denied(await c.request('/rest/v1/users?id=eq.'+c.uid('client'),{actor:'client',method:'PATCH',body:{role:'admin'}}));
}]);
tests.push(['Claims view is private and requester rows remain bounded',async()=>{
 c.denied(await c.select(null,'claims_pending','select=id'));
 assert.equal(c.ok(await c.select('artisan','claims_pending','select=id')).length,0);
 const own=c.ok(await c.select('client','claims_pending','select=id,requester_user_id'));assert.ok(own.length>0);assert.ok(own.every(x=>x.requester_user_id===c.uid('client')));
 assert.equal(c.ok(await c.select('admin','claims_pending','select=id')).length,5);
 c.denied(await c.request('/rest/v1/claim_requests',{actor:'client',body:{requester_user_id:c.uid('client'),status:'approved',artisan_id:id(22)}}));
}]);
tests.push(['Artisan Business inaccessible to Admin, readable only by its owner',async()=>{
 for(const table of ['artisan_business_clients','artisan_business_quotes','artisan_business_jobs','artisan_business_ledger']){
  const owner=c.ok(await c.select('artisan',table,'select=id'));assert.ok(owner.length>0);
  for(const actor of ['admin','client','artisan_other']){const r=await c.select(actor,table,'select=id');assert.ok([401,403].includes(r.status)||(r.status===200&&r.data.length===0));}
  c.denied(await c.control('dossier',{type:table,id:id(800)}),/UNSUPPORTED_ENTITY/);
  c.denied(await c.control('search',{query:'PRIVATE_BUSINESS',type:table}),/INVALID_SEARCH/);
 }
 for(const type of ['client','artisan','request','quote','mission','enterprise'])assert.ok(!JSON.stringify(c.ok(await c.control('search',{query:'PRIVATE_BUSINESS',type}))).includes('PRIVATE_BUSINESS_'));
}]);
tests.push(['Diagnostic and workforce projections exclude raw input, media and private labels',async()=>{
 const d=c.ok(await c.control('dossier',{type:'diagnostic_summary',id:id(400)}));assert.equal(d.summary.request_id,id(100));assert.equal(d.summary.media_access,'forbidden');assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
 const w=c.ok(await c.control('dossier',{type:'worker',id:id(330)}));assert.equal(w.summary.max_concurrent_jobs,10);assert.equal(w.summary.display_label,undefined);assert.equal(w.summary.member_id,undefined);
 for(const actor of ['admin','artisan'])c.denied(await c.request('/rest/v1/diagnostic_sessions_v1?select=id',{actor,method:'GET',headers:{'Accept-Profile':'fixeo_private'}}));
}]);
tests.push(['Sensitive domain mutations cannot bypass Control preview/execute',async()=>{
 for(const actor of ['client','artisan','admin']){
  c.denied(await c.rpc(actor,'admin_verify_artisan_v1',{p_artisan_id:id(20)}));
  c.denied(await c.rpc(actor,'review_marketplace_quote_v1',{p_quote_id:id(720),p_version:1,p_approve:true,p_reason:'Synthetic bypass attempt'}));
  c.denied(await c.rpc(actor,'admin_settle_mission_v1',{p_mission_id:id(620),p_final_price:1000,p_expected_final_price:null,p_reason:'Synthetic bypass attempt'}));
 }
}]);
tests.push(['Prepare real expiring ticket while wrong actor/target and tampering are refused',async()=>{
 const p=await c.preview('artisan.classify',id(24),{classification:'internal'});
 c.denied(await c.execute(p,'admin_other'),/FORBIDDEN|PREVIEW_NOT_FOUND/);
 c.denied(await c.control('action/execute',{preview_id:p.preview_id,confirmed:true,idempotency_key:c.randomId(),target_id:id(20)}),/INVALID_PAYLOAD/);
 c.denied(await c.control('action/execute',{preview_id:p.preview_id,confirmed:true,idempotency_key:c.randomId(),payload:{classification:'production'}}),/INVALID_PAYLOAD/);
 fs.writeFileSync(process.env.FIXEO_STAGING_EVIDENCE_DIR+'/bloc1-expiring-ticket.json',JSON.stringify({preview_id:p.preview_id,expires_at:p.expires_at,created_at:new Date().toISOString(),target_id:id(24)}));
}]);
c.run('read-security',tests);
