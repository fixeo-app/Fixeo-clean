const test=require('node:test');
const assert=require('node:assert/strict');
const actions=require('../../js/fixeo-enterprise-invitation-actions.js');

const eid='00000000-0000-4000-8000-000000000101';
const iid='00000000-0000-4000-8000-000000000701';
const token='a'.repeat(64);

function client(result={ok:true}){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}};
}

test('B7 manager authority is exactly owner/admin',()=>{
  assert.equal(actions.canManage('owner'),true);
  assert.equal(actions.canManage('admin'),true);
  for(const role of ['operations_manager','site_manager','reporter','viewer','']) assert.equal(actions.canManage(role),false);
});

test('B7 create normalizes email, role and expiry and uses canonical RPC',async()=>{
  const c=client({ok:true,invitation_id:iid,invitation_token:token});
  const out=await actions.create(c,eid,{email:' TEST@Example.COM ',role:'viewer',expires_days:7},'2026-09-24T12:00:00.000Z');
  assert.equal(out.invitation_token,token);
  assert.deepEqual(c.calls,[{name:'create_enterprise_invitation',args:{
    p_enterprise_id:eid,p_email:'test@example.com',p_role:'viewer',
    p_expires_at:'2026-10-01T12:00:00.000Z'
  }}]);
});

test('B7 expiry accepts only 1..30 days',()=>{
  assert.equal(actions.expiryFromDays(1,'2026-09-24T12:00:00.000Z'),'2026-09-25T12:00:00.000Z');
  assert.equal(actions.expiryFromDays(30,'2026-09-24T12:00:00.000Z'),'2026-10-24T12:00:00.000Z');
  assert.throws(()=>actions.expiryFromDays(0),/INVALID_EXPIRY/);
  assert.throws(()=>actions.expiryFromDays(31),/INVALID_EXPIRY/);
});

test('B7 revoke uses canonical RPC',async()=>{
  const c=client({ok:true,invitation_id:iid,status:'revoked'});
  await actions.revoke(c,eid,iid);
  assert.equal(c.calls[0].name,'revoke_enterprise_invitation');
});

test('B7 accept requires exact 64-hex token before RPC',async()=>{
  const c=client({ok:true,enterprise_id:eid});
  await assert.rejects(()=>actions.accept(c,'bad'),/INVALID_TOKEN/);
  assert.equal(c.calls.length,0);
  await actions.accept(c,token);
  assert.deepEqual(c.calls,[{name:'accept_enterprise_invitation',args:{p_token:token}}]);
});

test('B7 invalid email/role/id are rejected before RPC',async()=>{
  const c=client();
  await assert.rejects(()=>actions.create(c,'bad',{email:'a@b',role:'viewer',expires_days:7}),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>actions.create(c,eid,{email:'bad',role:'viewer',expires_days:7}),/INVALID_EMAIL/);
  await assert.rejects(()=>actions.create(c,eid,{email:'a@b.com',role:'owner',expires_days:7}),/INVALID_ROLE/);
  await assert.rejects(()=>actions.revoke(c,eid,'bad'),/INVALID_ID/);
  assert.equal(c.calls.length,0);
});

test('B7 source has no table mutations, service role or token persistence',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-invitation-actions.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  for(const name of ['create_enterprise_invitation','accept_enterprise_invitation','revoke_enterprise_invitation']) assert.match(code,new RegExp(name));
});
