const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const api=require('../../js/fixeo-enterprise-control-tower.js');
const ui=require('../../js/fixeo-enterprise-control-tower-ui.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';
const rid='00000000-0000-4000-8000-000000000401';
const mid='00000000-0000-4000-8000-000000000801';

function client(result){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}};
}

test('B16 control tower load uses secured canonical RPC only',async()=>{
  const c=client({ok:true,summary:{},attention:[],site_load:[],worker_load:[]});
  const out=await api.load(c,eid,100);
  assert.equal(out.ok,true);
  assert.deepEqual(c.calls,[{name:'get_enterprise_control_tower_v1',args:{p_enterprise_id:eid,p_limit:100}}]);
});

test('B19 escalation mutation is operator-only in UI contract and RPC-only',async()=>{
  assert.equal(api.canEscalate('owner'),true);
  assert.equal(api.canEscalate('admin'),true);
  assert.equal(api.canEscalate('operations_manager'),true);
  assert.equal(api.canEscalate('site_manager'),false);
  const c=client({ok:true,escalation_id:'00000000-0000-4000-8000-000000000901'});
  await api.upsertEscalation(c,eid,{request_id:rid,priority:'critical',status:'open',assigned_to_member_id:mid,note:'Urgent'});
  assert.equal(c.calls[0].name,'upsert_enterprise_control_tower_escalation_v1');
});

test('B16-B19 client rejects malformed inputs before RPC',async()=>{
  const c=client({ok:true});
  await assert.rejects(()=>api.load(c,'bad',100),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>api.load(c,eid,201),/INVALID_LIMIT/);
  await assert.rejects(()=>api.upsertEscalation(c,eid,{request_id:'bad',priority:'high',status:'open'}),/INVALID_ID/);
  await assert.rejects(()=>api.upsertEscalation(c,eid,{request_id:rid,priority:'urgent',status:'open'}),/INVALID_PRIORITY/);
  assert.equal(c.calls.length,0);
});

test('B16-B19 browser source has no direct table mutations or service role',()=>{
  for(const p of ['js/fixeo-enterprise-control-tower.js','js/fixeo-enterprise-control-tower-ui.js']){
    const code=fs.readFileSync(path.join(root,p),'utf8');
    assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  }
});

test('B16-B19 UI renders critical queue, site load and workforce load with escalation control',async()=>{
  const html=fs.readFileSync(path.join(root,'dashboard-enterprise.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/dashboard-enterprise.html'});
  const w=dom.window;
  w.FixeoEnterpriseControlTower={
    canEscalate:r=>r==='owner',
    load:async()=>({
      ok:true,
      summary:{open_requests:7,critical:2,at_risk:3,manual_escalations:1},
      attention:[{request_id:rid,site_id:'00000000-0000-4000-8000-000000000301',site_name:'Siège',city:'Casablanca',
        service_category:'plomberie',request_status:'new',severity:'critical',reason:'sla_breached',due_at:'2026-09-24T12:00:00Z',
        dispatch_mode:'internal_first',dispatch_status:'internal_offered',internal_worker_label:'Ahmed',escalation:null}],
      site_load:[{site_id:'00000000-0000-4000-8000-000000000301',site_name:'Siège',city:'Casablanca',
        open_count:5,breached_count:1,at_risk_count:2,internal_active_count:2}],
      worker_load:[{worker_id:'00000000-0000-4000-8000-000000000805',display_label:'Ahmed',status:'active',
        availability:'available',max_concurrent_jobs:2,active_assignments:1,waiting_start_count:0,in_progress_count:1,utilization_percent:50}]
    }),
    upsertEscalation:async()=>({ok:true})
  };
  const app=ui.mount(w,{getClient:()=>({rpc(){}}),getEnterpriseId:()=>eid,getRole:()=> 'owner'});
  app.setMembers([{id:mid,user_id:'00000000-0000-4000-8000-000000000901',status:'active'}]);
  await app.refresh();
  assert.equal(w.document.getElementById('enterprise-control-tower').hidden,false);
  assert.match(w.document.getElementById('enterprise-control-summary').textContent,/7/);
  assert.match(w.document.getElementById('enterprise-control-attention').textContent,/SLA dépassé/);
  assert.match(w.document.getElementById('enterprise-control-sites').textContent,/Siège/);
  assert.match(w.document.getElementById('enterprise-control-workers').textContent,/Ahmed/);
  assert.ok(w.document.querySelector('[data-control-action="escalate"]'));
  app.destroy();dom.window.close();
});

test('B16-B19 SQL keeps automatic alerts derived and browser escalation table read-only',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260924230000_enterprise_control_tower_block_b.sql'),'utf8');
  assert.match(sql,/CREATE TABLE public\.enterprise_control_tower_escalations/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.get_enterprise_control_tower_v1/);
  assert.match(sql,/sla_breached/);
  assert.match(sql,/sla_at_risk/);
  assert.match(sql,/fallback_due/);
  assert.match(sql,/GRANT SELECT ON TABLE public\.enterprise_control_tower_escalations\s+TO authenticated/);
  assert.doesNotMatch(sql,/GRANT\s+(INSERT|UPDATE|DELETE)\s+ON TABLE public\.enterprise_control_tower_escalations\s+TO authenticated/i);
});
