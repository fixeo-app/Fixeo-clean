const test=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../../js/fixeo-enterprise-audit.js');

const eid='00000000-0000-4000-8000-000000000101';
const cursorId='00000000-0000-4000-8000-000000000701';

function client(results={}){
  const calls=[];
  return {
    calls,
    rpc:async(name,args)=>{
      calls.push({name,args});
      return {data:results[name]||{status:'ok',events:[],returned_count:0,has_more:false,next_cursor:null},error:null};
    }
  };
}

test('B8 viewer authority is exactly owner/admin',()=>{
  assert.equal(audit.canView('owner'),true);
  assert.equal(audit.canView('admin'),true);
  for(const role of ['operations_manager','site_manager','reporter','viewer','']) assert.equal(audit.canView(role),false);
});

test('B8 listPage uses canonical list RPC with only period and cursor filters',async()=>{
  const c=client({
    list_enterprise_audit_events:{status:'ok',events:[],returned_count:0,has_more:true,
      next_cursor:{created_at:'2026-09-23T12:00:00Z',id:cursorId}}
  });
  const out=await audit.listPage(c,eid,{period:'7',limit:50,now:'2026-09-24T12:00:00.000Z'});
  assert.equal(out.has_more,true);
  assert.deepEqual(c.calls,[{name:'list_enterprise_audit_events',args:{
    p_enterprise_id:eid,p_limit:50,p_cursor_created_at:null,p_cursor_id:null,
    p_from:'2026-09-17T12:00:00.000Z',p_to:'2026-09-24T12:00:00.000Z',
    p_event_type:null,p_target_type:null,p_target_id:null,p_actor_user_id:null
  }}]);
});

test('B8 pagination forwards exact server cursor',async()=>{
  const c=client();
  const cursor={created_at:'2026-09-23T12:00:00Z',id:cursorId};
  await audit.listPage(c,eid,{period:'30',cursor,now:'2026-09-24T12:00:00.000Z'});
  assert.equal(c.calls[0].args.p_cursor_created_at,cursor.created_at);
  assert.equal(c.calls[0].args.p_cursor_id,cursor.id);
});

test('B8 export uses canonical export RPC and 5000 limit without stale type filters',async()=>{
  const c=client({
    export_enterprise_audit_events:{status:'ok',events:[],returned_count:0,truncated:false}
  });
  await audit.exportPeriod(c,eid,'all','2026-09-24T12:00:00.000Z');
  assert.deepEqual(c.calls,[{name:'export_enterprise_audit_events',args:{
    p_enterprise_id:eid,p_from:null,p_to:null,p_event_type:null,p_target_type:null,
    p_target_id:null,p_actor_user_id:null,p_limit:5000
  }}]);
});

test('B8 safeDetails exposes only allowlisted business fields',()=>{
  const safe=audit.safeDetails({
    before_state:{status:'active',email:'secret@example.com',token:'secret'},
    after_state:{role:'viewer',phone:'0600000000'},
    metadata:{site_id:'s1',service_category:'plomberie',raw_secret:'x'}
  });
  assert.deepEqual(safe,{
    before_state:{status:'active'},
    after_state:{role:'viewer'},
    metadata:{site_id:'s1',service_category:'plomberie'}
  });
});

test('B8 malformed IDs, limits and cursor are rejected before RPC',async()=>{
  const c=client();
  await assert.rejects(()=>audit.listPage(c,'bad',{period:'30'}),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>audit.listPage(c,eid,{period:'30',limit:201}),/INVALID_LIMIT/);
  await assert.rejects(()=>audit.listPage(c,eid,{period:'30',cursor:{created_at:'x',id:'bad'}}),/INVALID_CURSOR/);
  assert.equal(c.calls.length,0);
});

test('B8 source contains no table access, writes or service role authority',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-audit.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  assert.match(code,/list_enterprise_audit_events/);
  assert.match(code,/export_enterprise_audit_events/);
});
