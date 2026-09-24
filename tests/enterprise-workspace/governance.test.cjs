const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const api=require('../../js/fixeo-enterprise-governance.js');
const ui=require('../../js/fixeo-enterprise-governance-ui.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';
const cid='00000000-0000-4000-8000-000000000901';

function client(result={ok:true}){const calls=[];return{calls,rpc:async(name,args)=>{calls.push({name,args});return{data:result,error:null};}};}

test('F01 governance policy management is owner/admin only',()=>{
  assert.equal(api.canManage('owner'),true);
  assert.equal(api.canManage('admin'),true);
  for(const r of ['operations_manager','site_manager','reporter','viewer','']) assert.equal(api.canManage(r),false);
});

test('F02 governance read model uses canonical RPC',async()=>{
  const c=client({ok:true,role:'admin',pending_for_me:0,policies:[],cases:[]});
  const out=await api.load(c,eid);
  assert.equal(out.ok,true);
  assert.deepEqual(c.calls,[{name:'get_enterprise_governance_v1',args:{p_enterprise_id:eid}}]);
});

test('F03 policy mutation preserves ordered approval steps',async()=>{
  const c=client({ok:true,policy_id:'00000000-0000-4000-8000-000000000902'});
  await api.upsertPolicy(c,eid,{
    name:'Dépense importante',site_id:sid,service_category:'climatisation',urgency:'urgent',
    requester_role:'site_manager',min_amount:1000,max_amount:5000,priority:10,status:'active',
    steps:[
      {step_order:1,approver_role:'operations_manager'},
      {step_order:2,approver_role:'admin'}
    ]
  });
  assert.equal(c.calls[0].name,'upsert_enterprise_approval_policy_v1');
  assert.deepEqual(c.calls[0].args.p_steps,[
    {step_order:1,approver_role:'operations_manager'},
    {step_order:2,approver_role:'admin'}
  ]);
});

test('F04 decision RPC carries exact case, decision and optional note',async()=>{
  const c=client({ok:true,status:'pending'});
  await api.decide(c,eid,cid,'approved','OK budget');
  assert.deepEqual(c.calls,[{name:'decide_enterprise_approval_case_v1',args:{
    p_enterprise_id:eid,p_case_id:cid,p_decision:'approved',p_note:'OK budget'
  }}]);
});

test('F05 browser governance source has no table writes or service role authority',()=>{
  for(const p of ['js/fixeo-enterprise-governance.js','js/fixeo-enterprise-governance-ui.js']){
    const code=fs.readFileSync(path.join(root,p),'utf8');
    assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  }
});

test('F06 governance UI exposes decision only when current role matches required role',async()=>{
  const html=fs.readFileSync(path.join(root,'dashboard-enterprise.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/dashboard-enterprise.html'});
  const w=dom.window;
  w.FixeoEnterpriseGovernance={
    canManage:r=>r==='admin',
    load:async()=>({ok:true,role:'operations_manager',pending_for_me:1,policies:[],cases:[
      {id:cid,site_id:sid,policy_id:'00000000-0000-4000-8000-000000000902',requester_role:'site_manager',
       service_category:'climatisation',description:'Réparation groupe froid',urgency:'urgent',requested_amount:3000,
       current_step:1,total_steps:2,status:'pending',required_role:'operations_manager',decisions:[]}
    ]}),
    upsertPolicy:async()=>({ok:true}),decide:async()=>({ok:true})
  };
  const app=ui.mount(w,{getClient:()=>({}),getEnterpriseId:()=>eid,getRole:()=> 'operations_manager',refreshOperations:async()=>{}});
  app.setSites([{id:sid,name:'Siège',city:'Casablanca',status:'active'}]);
  await app.refresh();
  assert.equal(w.document.getElementById('enterprise-governance-module').hidden,false);
  assert.equal(w.document.getElementById('enterprise-governance-pending').textContent,'1');
  assert.ok(w.document.querySelector('[data-governance-action="decide"]'));
  assert.equal(w.document.getElementById('enterprise-governance-create').hidden,true);
  app.destroy();dom.window.close();
});

test('F07 SQL never introduces pending approval into service_requests status',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925003000_enterprise_governance_block_f.sql'),'utf8');
  assert.doesNotMatch(sql,/ALTER TABLE public\.service_requests/);
  assert.doesNotMatch(sql,/pending_approval[^\n]*service_requests|service_requests[^\n]*pending_approval/i);
});

test('F08 no matching policy preserves immediate hybrid dispatch',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925003000_enterprise_governance_block_f.sql'),'utf8');
  assert.match(sql,/IF v_policy_id IS NULL THEN[\s\S]*create_enterprise_request_hybrid/);
  assert.match(sql,/governance_status','not_required'/);
});

test('F09 matched policy creates approval case before any service request',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925003000_enterprise_governance_block_f.sql'),'utf8');
  const submit=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.submit_enterprise_governed_request_v1'),sql.indexOf('-- 6) Approve/reject'));
  assert.match(submit,/INSERT INTO public\.enterprise_approval_cases/);
  assert.doesNotMatch(submit,/INSERT INTO public\.service_requests/);
  assert.match(submit,/governance_status','pending_approval'/);
});

test('F10 final approval alone creates the real request and hybrid dispatch',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925003000_enterprise_governance_block_f.sql'),'utf8');
  const decide=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.decide_enterprise_approval_case_v1'),sql.indexOf('-- 7) Governance read model'));
  assert.match(decide,/IF v_case\.current_step<v_case\.total_steps THEN/);
  assert.match(decide,/create_enterprise_request_hybrid/);
  assert.match(decide,/SET status='approved',service_request_id=v_request_id/);
  assert.match(decide,/SET status='rejected'/);
});

test('F11 policy rules are manager-readable only and runtime tables remain SELECT-only',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925003000_enterprise_governance_block_f.sql'),'utf8');
  assert.match(sql,/eap_managers_select/);
  assert.match(sql,/_fixeo_is_enterprise_manager\(enterprise_id\)/);
  assert.match(sql,/GRANT SELECT ON TABLE public\.enterprise_approval_policies[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql,/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]*enterprise_approval_(policies|cases|decisions)[\s\S]*TO authenticated/i);
});

test('F12 policy steps are fully validated before any policy-step replacement',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925003000_enterprise_governance_block_f.sql'),'utf8');
  const fn=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.upsert_enterprise_approval_policy_v1'),sql.indexOf('-- 5) Governed intake'));
  const validatePos=fn.indexOf('v_order<>v_count');
  const deletePos=fn.indexOf('DELETE FROM public.enterprise_approval_policy_steps');
  assert.ok(validatePos>=0 && deletePos>validatePos);
});
