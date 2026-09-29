'use strict';
const c=require('./checks.cjs'),{assert}=c,C=require('../../../api/control/contracts'),D=require('../../../api/control/decision-contracts');
const tests=[];
tests.push(['Real source faults stay isolated: stale, partial, forbidden, error, timeout and healthy',async()=>{
 const r=c.ok(await c.control('summary',{classification:'internal'})),s=r.sources;
 assert.equal(s.requests.status,'stale');assert.equal(s.missions.status,'partial');assert.equal(s.artisans.status,'forbidden');assert.equal(s.trust.status,'unavailable');assert.equal(s.finance.status,'unavailable');assert.equal(s.finance.error,'SOURCE_TIMEOUT');assert.equal(s.network.status,'healthy');
 for(const metric of ['requests.total','missions.total','artisans.total','trust.claims.pending','finance.confirmed'])assert.equal(C.metricValue(s,metric),null);
 assert.equal(D.recommendation('urgent.active',s).status,'abstained');assert.equal(s.artisans.data,null);
 const signals=c.ok(await c.control('signals',{classification:'internal'}));assert.equal(signals.coverage,'partial');assert.equal(signals.llm_required,false);
}]);
tests.push(['Independent HTTP source responses arrive before a deliberately slow source',async()=>{
 const published=[];const started=Date.now();
 await Promise.all(['finance','network','requests','missions','trust','artisans'].map(async source=>{
  const response=await c.control('summary',{source,classification:'internal'});published.push({source,duration_ms:Date.now()-started,status:response.status});
  if(source==='artisans')assert.equal(response.status,403);else c.ok(response);
 }));
 const fast=published.find(x=>x.source==='network'),slow=published.find(x=>x.source==='finance');assert.ok(fast.duration_ms<slow.duration_ms,JSON.stringify(published));assert.ok(slow.duration_ms-fast.duration_ms>=2000,JSON.stringify(published));
 require('node:fs').writeFileSync(process.env.FIXEO_STAGING_EVIDENCE_DIR+'/bloc1-progressive-timings.json',JSON.stringify({preview:c.previewUrl,published},null,2));
}]);
tests.push(['Unfaulted scope remains healthy and ordinary roles cannot use fault scope',async()=>{
 const states=c.ok(await c.control('summary',{classification:'all'})).sources;assert.ok(Object.values(states).every(x=>x.status==='healthy'));
 for(const actor of ['client','artisan','enterprise_owner'])c.denied(await c.control('summary',{classification:'internal'},actor));
 c.denied(await c.control('summary',{source:'arbitrary_rpc'}));
}]);
c.run('source-faults',tests);
