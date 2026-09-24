const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=require('../../js/fixeo-enterprise-finance.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';
const rid='00000000-0000-4000-8000-000000000401';
const cc='00000000-0000-4000-8000-000000000901';
const po='00000000-0000-4000-8000-000000000902';
const worker='00000000-0000-4000-8000-000000000805';

function client(result={ok:true}){const calls=[];return{calls,rpc:async(name,args)=>{calls.push({name,args});return{data:result,error:null};}};}

test('E01 finance roles separate view, master management and request tagging',()=>{
  for(const r of ['owner','admin','operations_manager','reporter','site_manager']) assert.equal(api.canView(r),true);
  for(const r of ['owner','admin']) assert.equal(api.canManage(r),true);
  for(const r of ['operations_manager','reporter','site_manager','viewer']) assert.equal(api.canManage(r),false);
  for(const r of ['owner','admin','operations_manager']) assert.equal(api.canTag(r),true);
  assert.equal(api.canTag('reporter'),false);
});

test('E02 finance read model uses canonical secured RPC',async()=>{
  const c=client({ok:true,summary:{},rows:[],cost_centers:[],budgets:[],purchase_orders:[],worker_rates:[]});
  await api.load(c,eid,'2026-09-01','2026-09-30',500);
  assert.deepEqual(c.calls,[{name:'get_enterprise_finance_v1',args:{p_enterprise_id:eid,p_from:'2026-09-01',p_to:'2026-09-30',p_limit:500}}]);
});

test('E03 master finance mutations use RPCs only',async()=>{
  const c=client({ok:true});
  await api.upsertCostCenter(c,eid,{site_id:sid,code:'OPS',name:'Operations',department:'Maintenance',status:'active'});
  await api.upsertBudget(c,eid,{cost_center_id:cc,period_start:'2026-09-01',period_end:'2026-09-30',amount:10000,status:'active'});
  await api.upsertPurchaseOrder(c,eid,{cost_center_id:cc,site_id:sid,reference:'PO-001',approved_amount:5000,status:'open'});
  await api.setWorkerRate(c,eid,worker,80);
  await api.setRequestContext(c,eid,rid,cc,po);
  assert.deepEqual(c.calls.map(x=>x.name),[
    'upsert_enterprise_cost_center_v1','upsert_enterprise_budget_v1',
    'upsert_enterprise_purchase_order_v1','set_enterprise_worker_cost_rate_v1',
    'set_enterprise_request_finance_context_v1'
  ]);
});

test('E04 CSV export contains only authorized finance rows passed to client',()=>{
  const csv=api.csv({rows:[{request_id:rid,created_at:'2026-09-25',site_name:'Siège',city:'Casablanca',
    service_category:'plomberie',request_status:'validated',cost_center_code:'OPS',department:'Maintenance',
    purchase_order_reference:'PO-001',external_cost:700,internal_cost:0,total_operational_cost:700,fixeo_commission:105}]});
  assert.match(csv,/request_id,date,site/);
  assert.match(csv,/PO-001/);
  assert.match(csv,/700/);
  assert.doesNotMatch(csv,/guest_token|client_phone/);
});

test('E05 browser finance source has no direct table mutations or service role',()=>{
  for(const p of ['js/fixeo-enterprise-finance.js','js/fixeo-enterprise-finance-ui.js']){
    const code=fs.readFileSync(path.join(root,p),'utf8');
    assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  }
});

test('E06 SQL derives external cost from mission final/agreed price and internal cost from real assignment duration × rate',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925000500_enterprise_finance_block_e.sql'),'utf8');
  assert.match(sql,/COALESCE\(m\.final_price,m\.agreed_price,0\)/);
  assert.match(sql,/m\.status IN \('done','validated'\)/);
  assert.match(sql,/EXTRACT\(EPOCH/);
  assert.match(sql,/rate\.hourly_cost/);
  assert.doesNotMatch(sql,/UPDATE public\.missions|INSERT INTO public\.payments|UPDATE public\.payments/);
});

test('E07 finance tables are SELECT-only for browser and mutations are RPC-gated',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925000500_enterprise_finance_block_e.sql'),'utf8');
  assert.match(sql,/GRANT SELECT ON TABLE public\.enterprise_cost_centers[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql,/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]*enterprise_cost_centers[\s\S]*TO authenticated/i);
  assert.match(sql,/_fixeo_is_enterprise_finance_manager/);
  assert.match(sql,/_fixeo_is_enterprise_finance_global_reader/);
});

test('E08 site managers are prevented from reading global cost-center/PO master rows',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925000500_enterprise_finance_block_e.sql'),'utf8');
  assert.match(sql,/site_id IS NULL AND fixeo_private\._fixeo_is_enterprise_finance_global_reader/);
  assert.match(sql,/em\.role IN \('owner','admin','operations_manager','reporter'\)/);
});

test('E09 finance context stays outside service_requests schema',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260925000500_enterprise_finance_block_e.sql'),'utf8');
  assert.match(sql,/CREATE TABLE public\.enterprise_request_finance_context/);
  assert.doesNotMatch(sql,/ALTER TABLE public\.service_requests ADD COLUMN (cost|budget|purchase|po_)/i);
});
