const test=require('node:test');
const assert=require('node:assert/strict');
const actions=require('../../js/fixeo-enterprise-member-actions.js');

const eid='00000000-0000-4000-8000-000000000101';
const mid='00000000-0000-4000-8000-000000000201';
const sid='00000000-0000-4000-8000-000000000301';

function client(result={ok:true}) {
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}};
}

test('B6 management UI authority is exactly owner/admin',()=>{
  assert.equal(actions.canManage('owner'),true);
  assert.equal(actions.canManage('admin'),true);
  for(const role of ['operations_manager','site_manager','reporter','viewer','']) assert.equal(actions.canManage(role),false);
});

test('B6 role update uses only canonical RPC and server role vocabulary',async()=>{
  const c=client({ok:true,new_role:'viewer'});
  await actions.updateRole(c,eid,mid,'viewer');
  assert.deepEqual(c.calls,[{name:'update_enterprise_member_role',args:{
    p_enterprise_id:eid,p_member_id:mid,p_new_role:'viewer'
  }}]);
  await assert.rejects(()=>actions.updateRole(c,eid,mid,'owner'),/INVALID_ROLE/);
});

test('B6 status update accepts only canonical statuses',async()=>{
  const c=client({ok:true,new_status:'suspended'});
  await actions.setStatus(c,eid,mid,'suspended');
  assert.equal(c.calls[0].name,'set_enterprise_member_status');
  await assert.rejects(()=>actions.setStatus(c,eid,mid,'invited'),/INVALID_STATUS/);
});

test('B6 site assignment and unassignment use canonical RPCs',async()=>{
  const c=client();
  await actions.assignSite(c,eid,mid,sid);
  await actions.unassignSite(c,eid,mid,sid);
  assert.deepEqual(c.calls.map(x=>x.name),[
    'assign_enterprise_member_site','unassign_enterprise_member_site'
  ]);
});

test('B6 malformed ids are rejected before RPC',async()=>{
  const c=client();
  await assert.rejects(()=>actions.updateRole(c,'bad',mid,'viewer'),/INVALID_ID/);
  await assert.rejects(()=>actions.setStatus(c,eid,'bad','active'),/INVALID_ID/);
  await assert.rejects(()=>actions.assignSite(c,eid,mid,'bad'),/INVALID_ID/);
  assert.equal(c.calls.length,0);
});

test('B6 propagates business rejection reason without raw backend details',async()=>{
  const c=client({ok:false,reason:'owner_invariant_violation'});
  await assert.rejects(actions.setStatus(c,eid,mid,'removed'),e=>e.reason==='owner_invariant_violation');
});

test('B6 source has no direct table mutations or service role authority',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-member-actions.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  for(const name of [
    'update_enterprise_member_role','set_enterprise_member_status',
    'assign_enterprise_member_site','unassign_enterprise_member_site'
  ]) assert.match(code,new RegExp(name));
});
