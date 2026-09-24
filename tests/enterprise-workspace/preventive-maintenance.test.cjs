const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const api=require('../../js/fixeo-enterprise-preventive-maintenance.js');
const ui=require('../../js/fixeo-enterprise-preventive-maintenance-ui.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';
const pid='00000000-0000-4000-8000-000000000901';

function client(result){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}};
}

test('C01 maintenance authority is owner/admin/operations_manager',()=>{
  for(const r of ['owner','admin','operations_manager']) assert.equal(api.canManage(r),true);
  for(const r of ['site_manager','reporter','viewer','']) assert.equal(api.canManage(r),false);
});

test('C02 read model uses one secured maintenance RPC',async()=>{
  const c=client({ok:true,summary:{},plans:[],runs:[]});
  const out=await api.load(c,eid,100);
  assert.equal(out.ok,true);
  assert.deepEqual(c.calls,[{name:'get_enterprise_preventive_maintenance_v1',args:{p_enterprise_id:eid,p_history_limit:100}}]);
});

test('C03 plan management uses canonical RPC and preserves recurrence inputs',async()=>{
  const c=client({ok:true,plan_id:pid});
  await api.upsertPlan(c,eid,{
    plan_id:null,site_id:sid,name:'Clim trimestrielle',service_category:'climatisation',
    description:'Nettoyage et contrôle',urgency:'normale',frequency:'monthly',interval_count:3,
    next_due_at:'2026-10-01T09:00:00.000Z',reminder_hours:48,status:'active'
  });
  assert.equal(c.calls[0].name,'upsert_enterprise_maintenance_plan_v1');
  assert.equal(c.calls[0].args.p_frequency,'monthly');
  assert.equal(c.calls[0].args.p_interval_count,3);
  assert.equal(c.calls[0].args.p_reminder_hours,48);
});

test('C04 invalid IDs, frequency, status and limit fail before RPC',async()=>{
  const c=client({ok:true});
  await assert.rejects(()=>api.load(c,'bad',100),/INVALID_ENTERPRISE_ID/);
  await assert.rejects(()=>api.load(c,eid,501),/INVALID_LIMIT/);
  await assert.rejects(()=>api.upsertPlan(c,eid,{site_id:'bad',frequency:'monthly',status:'active'}),/INVALID_SITE_ID/);
  await assert.rejects(()=>api.upsertPlan(c,eid,{site_id:sid,frequency:'yearly',status:'active'}),/INVALID_FREQUENCY/);
  assert.equal(c.calls.length,0);
});

test('C05 browser source has no direct mutations or service role',()=>{
  for(const p of ['js/fixeo-enterprise-preventive-maintenance.js','js/fixeo-enterprise-preventive-maintenance-ui.js']){
    const code=fs.readFileSync(path.join(root,p),'utf8');
    assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  }
});

test('C06 UI renders reminders, overdue plans and execution history',async()=>{
  const html=fs.readFileSync(path.join(root,'dashboard-enterprise.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/dashboard-enterprise.html'});
  const w=dom.window;
  w.FixeoEnterprisePreventiveMaintenance={
    canManage:r=>r==='owner',
    load:async()=>({
      ok:true,
      summary:{active_plans:2,due_soon:1,overdue:1,paused:0},
      plans:[
        {id:pid,site_id:sid,site_name:'Siège',city:'Casablanca',name:'Clim',service_category:'climatisation',
          description:'Entretien',urgency:'normale',frequency:'monthly',interval_count:3,next_due_at:'2026-09-24T10:00:00Z',
          reminder_hours:24,status:'active',overdue:true,reminder_due:false},
        {id:'00000000-0000-4000-8000-000000000902',site_id:sid,site_name:'Siège',city:'Casablanca',name:'Électricité',
          service_category:'electricite',description:'Contrôle',urgency:null,frequency:'weekly',interval_count:1,
          next_due_at:'2099-09-25T10:00:00Z',reminder_hours:24,status:'active',overdue:false,reminder_due:true}
      ],
      runs:[{id:'00000000-0000-4000-8000-000000000903',plan_id:pid,plan_name:'Clim',site_id:sid,site_name:'Siège',
        due_at:'2026-09-01T09:00:00Z',service_request_id:'00000000-0000-4000-8000-000000000401',status:'generated',
        generated_at:'2026-09-01T09:00:01Z',error_code:null}]
    }),
    upsertPlan:async()=>({ok:true})
  };
  const app=ui.mount(w,{getClient:()=>({rpc(){}}),getEnterpriseId:()=>eid,getRole:()=> 'owner'});
  app.setSites([{id:sid,name:'Siège',city:'Casablanca',status:'active'}]);
  await app.refresh();
  assert.equal(w.document.getElementById('enterprise-preventive-maintenance').hidden,false);
  assert.match(w.document.getElementById('enterprise-maintenance-summary').textContent,/2/);
  assert.match(w.document.getElementById('enterprise-maintenance-plans').textContent,/En retard/);
  assert.match(w.document.getElementById('enterprise-maintenance-plans').textContent,/Rappel/);
  assert.match(w.document.getElementById('enterprise-maintenance-runs').textContent,/generated/);
  assert.equal(w.document.getElementById('enterprise-maintenance-create').hidden,false);
  app.destroy();dom.window.close();
});

test('C07 SQL keeps plans/runs SELECT-only for browser and scheduler service-role only',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260924233000_enterprise_preventive_maintenance_block_c.sql'),'utf8');
  assert.match(sql,/CREATE TABLE public\.enterprise_maintenance_plans/);
  assert.match(sql,/CREATE TABLE public\.enterprise_maintenance_runs/);
  assert.match(sql,/GRANT SELECT ON TABLE[\s\S]*enterprise_maintenance_plans[\s\S]*enterprise_maintenance_runs[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql,/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]*enterprise_maintenance_(plans|runs)[\s\S]*TO authenticated/i);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.run_enterprise_maintenance_scheduler_v1\(\)[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.run_enterprise_maintenance_scheduler_v1\(\)[\s\S]*TO service_role/);
});

test('C08 scheduler is idempotent per plan/due and generated requests enter hybrid dispatch',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260924233000_enterprise_preventive_maintenance_block_c.sql'),'utf8');
  assert.match(sql,/UNIQUE \(plan_id,due_at\)/);
  assert.match(sql,/ON CONFLICT \(plan_id,due_at\)/);
  assert.match(sql,/current_setting|set_config\('fixeo\.enterprise_dispatch_deferred','on',true\)/);
  assert.match(sql,/public\.dispatch_enterprise_hybrid_v1\(v_request_id\)/);
  assert.match(sql,/enterprise_request_context/);
  assert.match(sql,/enterprise_request_sla/);
});

test('C09 existing cron invokes maintenance scheduler and preserves fallback worker',()=>{
  const code=fs.readFileSync(path.join(root,'api/notification-timeout-fn/index.js'),'utf8');
  assert.match(code,/run_enterprise_dispatch_fallbacks_v1/);
  assert.match(code,/run_enterprise_maintenance_scheduler_v1/);
  assert.match(code,/Promise\.all/);
  assert.match(code,/CRON_SECRET/);
});
