const test=require('node:test');
const assert=require('node:assert/strict');
const actions=require('../../js/fixeo-enterprise-sla-policy-actions.js');

const eid='00000000-0000-4000-8000-000000000101';
const pid='00000000-0000-4000-8000-000000000201';
const sid='00000000-0000-4000-8000-000000000301';

function client(result={ok:true}){const calls=[];return{calls,rpc:async(name,args)=>{calls.push({name,args});return{data:result,error:null};}};}

test('B9 manager authority is owner/admin only',()=>{
  assert.equal(actions.canManage('owner'),true);
  assert.equal(actions.canManage('admin'),true);
  for(const r of ['operations_manager','site_manager','reporter','viewer','']) assert.equal(actions.canManage(r),false);
});

test('B9 create uses audited canonical RPC and normalizes nullable scope',async()=>{
  const c=client({ok:true,policy_id:pid});
  await actions.create(c,eid,{site_id:'',urgency:'',acceptance_target_minutes:120,status:'active'});
  assert.deepEqual(c.calls,[{name:'create_enterprise_sla_policy',args:{
    p_enterprise_id:eid,p_site_id:null,p_urgency:null,p_acceptance_target_minutes:120,p_status:'active'
  }}]);
});

test('B9 update uses exact full policy state',async()=>{
  const c=client({ok:true,policy_id:pid});
  await actions.update(c,eid,pid,{site_id:sid,urgency:'high',acceptance_target_minutes:30,status:'inactive'});
  assert.equal(c.calls[0].name,'update_enterprise_sla_policy');
  assert.equal(c.calls[0].args.p_site_id,sid);
  assert.equal(c.calls[0].args.p_urgency,'high');
});

test('B9 invalid ids, urgency, target and status fail before RPC',async()=>{
  const c=client();
  await assert.rejects(()=>actions.create(c,'bad',{acceptance_target_minutes:1}),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>actions.create(c,eid,{urgency:'now',acceptance_target_minutes:15,status:'active'}),/INVALID_URGENCY/);
  await assert.rejects(()=>actions.create(c,eid,{acceptance_target_minutes:0,status:'active'}),/INVALID_TARGET/);
  await assert.rejects(()=>actions.create(c,eid,{acceptance_target_minutes:15,status:'deleted'}),/INVALID_STATUS/);
  assert.equal(c.calls.length,0);
});

test('B9 source uses RPCs only and no direct table mutation',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-sla-policy-actions.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  assert.match(code,/create_enterprise_sla_policy/);
  assert.match(code,/update_enterprise_sla_policy/);
});
