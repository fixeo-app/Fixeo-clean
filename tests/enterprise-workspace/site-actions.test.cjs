const test=require('node:test');
const assert=require('node:assert/strict');
const actions=require('../../js/fixeo-enterprise-site-actions.js');

const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';

function client(result={ok:true}){
  const calls=[];
  return {
    calls,
    rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}
  };
}

test('B2 managers are exactly owner/admin in the browser UI',()=>{
  assert.equal(actions.canManage('owner'),true);
  assert.equal(actions.canManage('admin'),true);
  for(const role of ['operations_manager','site_manager','reporter','viewer','client','']) assert.equal(actions.canManage(role),false);
});

test('B2 create calls only canonical create_enterprise_site RPC with normalized values',async()=>{
  const c=client({ok:true,site_id:sid});
  const out=await actions.create(c,eid,{name:'  Siège  ',city:' Casablanca ',site_code:' CAS-01 ',address_line:' Centre '});
  assert.equal(out.site_id,sid);
  assert.deepEqual(c.calls,[{name:'create_enterprise_site',args:{
    p_enterprise_id:eid,p_name:'Siège',p_city:'Casablanca',p_site_code:'CAS-01',p_address_line:'Centre'
  }}]);
});

test('B2 update uses selected site id and nullable optional fields',async()=>{
  const c=client({ok:true,site_id:sid});
  await actions.update(c,eid,sid,{name:'Agence',city:'Rabat',site_code:'',address_line:''});
  assert.deepEqual(c.calls[0],{name:'update_enterprise_site',args:{
    p_enterprise_id:eid,p_site_id:sid,p_name:'Agence',p_city:'Rabat',p_site_code:null,p_address_line:null
  }});
});

test('B2 status accepts only active/inactive and uses canonical RPC',async()=>{
  const c=client({ok:true,new_status:'inactive'});
  await actions.setStatus(c,eid,sid,'inactive');
  assert.equal(c.calls[0].name,'set_enterprise_site_status');
  await assert.rejects(()=>actions.setStatus(c,eid,sid,'deleted'),/INVALID_STATUS/);
});

test('B2 rejects malformed ids and invalid required text before RPC',async()=>{
  const c=client();
  await assert.rejects(()=>actions.create(c,'bad',{name:'A',city:'B'}),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>actions.create(c,eid,{name:'',city:'B'}),/INVALID_INPUT/);
  await assert.rejects(()=>actions.update(c,eid,'bad',{name:'A',city:'B'}),/INVALID_ID/);
  assert.equal(c.calls.length,0);
});

test('B2 exposes RPC rejection reason but no raw backend error',async()=>{
  const c=client({ok:false,reason:'site_code_exists'});
  await assert.rejects(actions.create(c,eid,{name:'A',city:'B',site_code:'X'}),e=>e.reason==='site_code_exists');
});

test('B2 source contains no table mutations, service role or direct enterprise_sites write',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-site-actions.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  assert.match(code,/create_enterprise_site/);
  assert.match(code,/update_enterprise_site/);
  assert.match(code,/set_enterprise_site_status/);
});
