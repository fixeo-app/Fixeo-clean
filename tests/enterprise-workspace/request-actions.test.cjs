const test=require('node:test');
const assert=require('node:assert/strict');
const actions=require('../../js/fixeo-enterprise-request-actions.js');

const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';

function client(result={ok:true,service_request_id:'00000000-0000-4000-8000-000000000401'}){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}};
}

test('B3 creation roles mirror server contract',()=>{
  for(const role of ['owner','admin','operations_manager','site_manager','reporter']) assert.equal(actions.canCreate(role),true,role);
  for(const role of ['viewer','client','artisan','']) assert.equal(actions.canCreate(role),false,role);
});

test('Block F create uses governed enterprise request RPC',async()=>{
  const c=client();
  const out=await actions.create(c,eid,{
    site_id:sid,service_category:' Plomberie ',description:' Fuite sous évier ',urgency:'urgent'
  });
  assert.ok(out.service_request_id);
  assert.deepEqual(c.calls,[{name:'submit_enterprise_governed_request_v1',args:{
    p_enterprise_id:eid,p_site_id:sid,p_service_category:'Plomberie',
    p_description:'Fuite sous évier',p_urgency:'urgent'
  }}]);
});

test('B3 normalizes empty urgency to null',async()=>{
  const c=client();
  await actions.create(c,eid,{site_id:sid,service_category:'Électricité',description:'Panne',urgency:''});
  assert.equal(c.calls[0].args.p_urgency,null);
});

test('B3 rejects malformed ids, empty required fields and invalid urgency before RPC',async()=>{
  const c=client();
  await assert.rejects(()=>actions.create(c,'bad',{site_id:sid,service_category:'A',description:'B'}),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>actions.create(c,eid,{site_id:'bad',service_category:'A',description:'B'}),/INVALID_SITE_ID/);
  await assert.rejects(()=>actions.create(c,eid,{site_id:sid,service_category:'',description:'B'}),/INVALID_INPUT/);
  await assert.rejects(()=>actions.create(c,eid,{site_id:sid,service_category:'A',description:'B',urgency:'low'}),/INVALID_URGENCY/);
  assert.equal(c.calls.length,0);
});

test('B3 propagates server rejection reason without exposing transport detail',async()=>{
  const c=client({ok:false,reason:'site_inactive'});
  await assert.rejects(actions.create(c,eid,{site_id:sid,service_category:'A',description:'B'}),e=>e.reason==='site_inactive');
});

test('B3 source has no direct table write or service role authority',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-request-actions.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  assert.match(code,/submit_enterprise_governed_request_v1/);
});
