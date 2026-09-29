'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {control,previewUrl}=require('./preview.cjs');
(async()=>{
 const r=await control('summary');assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.sources.requests.data.metrics['requests.total'],0);
 assert.equal(r.data.sources.requests.completeness,'complete');
 const op=await control('operations');assert.equal(op.status,200);assert.equal(op.data.items.length,0);assert.equal(op.data.global_total,null);
 const signals=await control('signals');assert.equal(signals.status,200);
 const out={preview:previewUrl,admin_real_auth:'PASS',empty_summary:'PASS',empty_operations:'PASS',signals:'PASS',sources:Object.fromEntries(Object.entries(r.data.sources).map(([k,v])=>[k,{status:v.status,completeness:v.completeness}]))};
 fs.writeFileSync(process.env.FIXEO_STAGING_EVIDENCE_DIR+'/bloc1-staging-empty-preview.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
