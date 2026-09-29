'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../js/fixeo-repository.js'),'utf8');
function setup(command){
 const events=[];
 const forbidden=()=>{throw Error('DIRECT_OR_OPTIMISTIC_CLAIM_WRITE');};
 const window={FixeoSupabaseClient:{CONFIGURED:true,ready:async()=>{},client:{rpc:forbidden,from:forbidden}},FixeoClaimSystem:{adminApproveClaim:forbidden,adminRejectClaim:forbidden},dispatchEvent:e=>events.push(e)};
 if(command)window.FixeoControl={command};
 vm.runInNewContext(source,{window,console:{info(){},log(){},warn(){},error(){}},CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}}});
 return {repo:window.FixeoRepository,events};
}
test('Legacy Claims consumers require human Control and emit only after canonical verification',async()=>{
 for(const [method,capability,status] of [['approveClaimRequest','claim.approve','approved'],['rejectClaimRequest','claim.reject','rejected']]){
  let complete;const {repo,events}=setup(async(cap,id,payload)=>{assert.equal(cap,capability);assert.equal(id,'claim-id');assert.equal(payload.reason,'Operator reason');return new Promise(r=>complete=r);});
  const pending=repo[method]('claim-id','Operator reason');await new Promise(r=>setImmediate(r));assert.equal(events.length,0);
  complete({ok:true,audit_id:'audit-id',verified:{id:'claim-id',status}});assert.equal((await pending).ok,true);assert.equal(events[0].type,'fixeo:claim-'+status);
 }
});
test('Cancelled, unavailable and unverified Claims never become local success',async()=>{
 for(const result of [{cancelled:true},{ok:false,code:'STALE_PREVIEW'},{ok:true},{ok:true,audit_id:'x',verified:{id:'other',status:'approved'}}]){
  const {repo,events}=setup(async()=>result);assert.equal((await repo.approveClaimRequest('claim-id')).ok,false);assert.equal(events.length,0);
 }
 const {repo}=setup();assert.equal((await repo.rejectClaimRequest('claim-id')).reason,'CONTROL_AUTHORITY_REQUIRED');
});
test('Claims network rejection cannot update local cache or fall back to raw RPC',async()=>{
 const {repo,events}=setup(async()=>{throw Error('CONTROL_TIMEOUT');});await assert.rejects(repo.approveClaimRequest('claim-id'),/CONTROL_TIMEOUT/);assert.equal(events.length,0);
});
