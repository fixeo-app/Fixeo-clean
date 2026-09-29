'use strict';
const fs=require('node:fs'),path=require('node:path');
const c=require('./checks.cjs'),{assert,syntheticId:id}=c;
const phase=process.env.FIXEO_STAGING_GOVERNANCE_PHASE;
const ticketFile=path.join(process.env.FIXEO_STAGING_TEST_SECRET_DIR,'governance-ticket.json');
const tests=[];
if(phase==='prepare')tests.push(['Prepare a real preview before role withdrawal',async()=>{
 const ticket=await c.preview('artisan.classify',id(24),{classification:'internal'},'admin_other');
 fs.writeFileSync(ticketFile,JSON.stringify({ticket,token:c.sessions.admin_other.access_token}),{mode:0o600});
}]);
if(phase==='revoked')tests.push(['A previously valid JWT cannot execute after public.users.role is withdrawn',async()=>{
 const {ticket,token}=JSON.parse(fs.readFileSync(ticketFile,'utf8'));
 const response=await c.control('action/execute',{preview_id:ticket.preview_id,confirmed:true,idempotency_key:c.randomId()},null,{token});assert.equal(response.status,403);
 c.denied(await c.control('summary',{},null,{token}));
 const current=c.ok(await c.control('dossier',{type:'artisan',id:id(24)}));assert.equal(current.summary.data_classification,null);
}]);
if(phase==='recovered')tests.push(['Role restoration returns through canonical preview, execute, verify and audit',async()=>{
 const result=await c.command('artisan.classify',id(24),{classification:'internal'},'admin_other');assert.equal(result.ok,true);assert.ok(result.audit_id);assert.equal(result.verified.data_classification,'internal');
 assert.equal((await c.command('artisan.classify',id(24),{classification:'unclassified'},'admin_other')).ok,true);
}]);
if(phase==='paused')tests.push(['Operational rollback denies sensitive actions but preserves reads and Client producer',async()=>{
 c.denied(await c.control('action/preview',{capability:'artisan.verify',target_id:id(20),payload:{reason:'Synthetic rollback verification'}}));
 const {ticket}=JSON.parse(fs.readFileSync(ticketFile,'utf8'));c.denied(await c.execute(ticket,'admin_other'));
 const summary=c.ok(await c.control('summary',{}));assert.ok(Object.values(summary.sources).every(s=>s.status==='healthy'));
 const request=await c.createRequest('SYNTHETIC_DURING_ACTION_PAUSE');assert.equal(request.data_classification,'production');
}]);
if(phase==='resumed')tests.push(['Resume restores only governed actions; raw protected writes remain denied',async()=>{
 const result=await c.command('artisan.verify',id(20));assert.equal(result.ok,true);assert.equal(result.verified.verified,true);
 c.denied(await c.request('/rest/v1/missions?id=eq.'+id(600),{actor:'admin',method:'PATCH',body:{status:'validated'}}));
 const summary=c.ok(await c.control('summary',{classification:'internal'}));assert.ok(Object.values(summary.sources).every(s=>s.status==='healthy'));
}]);
if(!tests.length)throw Error('GOVERNANCE_PHASE_REQUIRED');
c.run('governance-'+phase,tests);
