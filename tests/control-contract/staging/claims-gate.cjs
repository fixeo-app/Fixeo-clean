'use strict';
const c=require('./checks.cjs'),{assert}=c;
const id=c.syntheticId;
async function pending(actor,artisan){
 const claim=c.randomId();const r=await c.request('/rest/v1/claim_requests',{actor,body:{id:claim,artisan_id:artisan,requester_user_id:c.uid(actor),requester_name:'CLAIM_GATE_SYNTHETIC',status:'pending'},headers:{Prefer:'return=representation'}});
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data[0].status,'pending');return claim;
}
c.run('claims-gate',[
 ['Legacy Claims RPCs are denied even to real Admin; private helper is never callable',async()=>{
  for(const actor of [undefined,'client','artisan','admin','enterprise_owner']){
   for(const [name,payload] of [['approve_artisan_claim',{p_claim_id:id(202)}],['reject_artisan_claim',{p_claim_id:id(202),p_note:'Synthetic bypass attempt'}],['_supersede_competing_claims',{p_artisan_id:id(20),p_winner_claim:id(202),p_winner_legacy:null}]]){
    const r=await c.rpc(actor,name,payload);assert.ok([401,403,404].includes(r.status),name+':'+r.status);
   }
  }
 }],
 ['Own pending producer survives; direct review/identity/delete and foreign creation are denied',async()=>{
  const claim=await pending('client_other',id(20));
  for(const actor of [undefined,'client_other','artisan','admin']){
   c.denied(await c.request('/rest/v1/claim_requests?id=eq.'+claim,{actor,method:'PATCH',body:{status:'approved',reviewed_at:new Date().toISOString(),requester_user_id:c.uid('admin')}}));
   c.denied(await c.request('/rest/v1/claim_requests?id=eq.'+claim,{actor,method:'DELETE'}));
  }
  c.denied(await c.request('/rest/v1/claim_requests',{actor:'client_other',body:{artisan_id:id(20),requester_user_id:c.uid('client'),status:'pending'}}));
  c.denied(await c.request('/rest/v1/claim_requests',{actor:'client_other',body:{artisan_id:id(20),requester_user_id:c.uid('client_other'),status:'approved'}}));
  const rejected=await c.command('claim.reject',claim);assert.equal(rejected.ok,true);assert.equal(rejected.verified.status,'rejected');assert.ok(rejected.audit_id);
 }],
 ['Claims approval still has one winner, durable audit and idempotent replay through Control',async()=>{
  const fs=require('node:fs'),path=require('node:path');
  const checkpointPath=path.join(process.env.FIXEO_STAGING_TEST_SECRET_DIR,'claims-race-checkpoint.json');
  const checkpoint=fs.existsSync(checkpointPath)?JSON.parse(fs.readFileSync(checkpointPath,'utf8')):null;
  let a,b,ka,kb;
  if(checkpoint){
   // Resume the committed race; preserve its exact actor, ticket and key.
   a=checkpoint.find(x=>x.actor_id===c.uid('admin'));b=checkpoint.find(x=>x.actor_id===c.uid('admin_other'));
   assert.ok(a&&b);ka=a.idempotency_key;kb=b.idempotency_key;
  }else{
   const first=await pending('client_other',id(25)),second=await pending('workforce',id(25));
   [a,b]=await Promise.all([c.preview('claim.approve',first),c.preview('claim.approve',second,{},'admin_other')]);
   ka=c.randomId();kb=c.randomId();
  }
  const [ra,rb]=await Promise.all([c.execute(a,'admin',ka),c.execute(b,'admin_other',kb)]);
  const results=[ra,rb].map(r=>r.data);assert.equal(results.filter(x=>x.ok).length,1,JSON.stringify(results));
  const win=results[0].ok?0:1,replay=await c.execute(win?b:a,win?'admin_other':'admin',win?kb:ka);assert.deepEqual(replay.data,results[win]);
  const rows=c.ok(await c.select('admin','claim_requests','select=id,status&artisan_id=eq.'+id(25)));assert.equal(rows.filter(x=>x.status==='approved').length,1);assert.ok(rows.some(x=>x.status==='superseded_by_approval'));
  const dossier=c.ok(await c.control('dossier',{type:'artisan',id:id(25)},'admin'));assert.ok(dossier.summary.claimed);assert.equal(dossier.summary.onboarding_completed,false);
  assert.ok(results[win].audit_id);assert.ok(results[win].correlation_id);
 }],
 ['Claims final checkpoint verifies the concurrent winner without replaying committed fixtures',async()=>{
  // The preceding run already passed the one-winner and identical replay checks.
  // Its last assertion incorrectly counted earlier superseded synthetic claims.
  const rows=c.ok(await c.select('admin','claim_requests','select=id,status,requester_user_id&artisan_id=eq.'+id(25)));
  const current=rows.filter(x=>[c.uid('client_other'),c.uid('workforce')].includes(x.requester_user_id));
  assert.deepEqual(current.map(x=>x.status).sort(),['approved','superseded_by_approval']);
  assert.equal(rows.filter(x=>x.status==='approved').length,1);
  const winner=current.find(x=>x.status==='approved');
  const claim=c.ok(await c.control('dossier',{type:'claim',id:winner.id}));assert.equal(claim.summary.status,'approved');assert.ok(claim.timeline.some(x=>x.action==='execute'&&x.result==='succeeded'));
  const artisan=c.ok(await c.control('dossier',{type:'artisan',id:id(25)}));assert.equal(artisan.summary.has_owner,true);assert.equal(artisan.summary.onboarding_completed,false);
 }]
]);
