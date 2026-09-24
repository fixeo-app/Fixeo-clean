/* FIXEO Enterprise Block E — Finance client. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseFinance=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function validId(v){return UUID_RE.test(String(v||''));}
  function canView(role){return ['owner','admin','operations_manager','reporter','site_manager'].includes(String(role||''));}
  function canManage(role){return ['owner','admin'].includes(String(role||''));}
  function canTag(role){return ['owner','admin','operations_manager'].includes(String(role||''));}
  async function rpc(client,name,args){
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc(name,args);
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true){var e=new Error((r.data&&r.data.reason)||'RPC_REJECTED');e.reason=(r.data&&r.data.reason)||'RPC_REJECTED';throw e;}
    return r.data;
  }
  async function load(client,eid,from,to,limit){
    if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    var n=Number(limit||500);if(!Number.isInteger(n)||n<1||n>2000)throw new Error('INVALID_LIMIT');
    return rpc(client,'get_enterprise_finance_v1',{
      p_enterprise_id:eid,p_from:from||null,p_to:to||null,p_limit:n
    });
  }
  async function upsertCostCenter(client,eid,input){
    input=input||{};if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    var id=input.cost_center_id?String(input.cost_center_id):null,site=input.site_id?String(input.site_id):null;
    if(id&&!validId(id))throw new Error('INVALID_ID');if(site&&!validId(site))throw new Error('INVALID_SITE_ID');
    return rpc(client,'upsert_enterprise_cost_center_v1',{
      p_enterprise_id:eid,p_cost_center_id:id,p_site_id:site,
      p_code:String(input.code||'').trim(),p_name:String(input.name||'').trim(),
      p_department:String(input.department||'').trim()||null,p_status:String(input.status||'active')
    });
  }
  async function upsertBudget(client,eid,input){
    input=input||{};if(!validId(eid)||!validId(input.cost_center_id))throw new Error('INVALID_ID');
    var id=input.budget_id?String(input.budget_id):null;if(id&&!validId(id))throw new Error('INVALID_ID');
    var amount=Number(input.amount);if(!Number.isFinite(amount)||amount<0)throw new Error('INVALID_AMOUNT');
    return rpc(client,'upsert_enterprise_budget_v1',{
      p_enterprise_id:eid,p_budget_id:id,p_cost_center_id:String(input.cost_center_id),
      p_period_start:String(input.period_start||''),p_period_end:String(input.period_end||''),
      p_amount:amount,p_status:String(input.status||'active')
    });
  }
  async function upsertPurchaseOrder(client,eid,input){
    input=input||{};if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    var id=input.purchase_order_id?String(input.purchase_order_id):null,cc=input.cost_center_id?String(input.cost_center_id):null,site=input.site_id?String(input.site_id):null;
    if(id&&!validId(id)||cc&&!validId(cc)||site&&!validId(site))throw new Error('INVALID_ID');
    var amount=input.approved_amount==null||input.approved_amount===''?null:Number(input.approved_amount);
    if(amount!=null&&(!Number.isFinite(amount)||amount<0))throw new Error('INVALID_AMOUNT');
    return rpc(client,'upsert_enterprise_purchase_order_v1',{
      p_enterprise_id:eid,p_purchase_order_id:id,p_cost_center_id:cc,p_site_id:site,
      p_reference:String(input.reference||'').trim(),p_approved_amount:amount,
      p_status:String(input.status||'open'),p_notes:String(input.notes||'').trim()||null
    });
  }
  async function setWorkerRate(client,eid,workerId,hourlyCost){
    if(!validId(eid)||!validId(workerId))throw new Error('INVALID_ID');
    var value=Number(hourlyCost);if(!Number.isFinite(value)||value<0)throw new Error('INVALID_AMOUNT');
    return rpc(client,'set_enterprise_worker_cost_rate_v1',{p_enterprise_id:eid,p_worker_id:workerId,p_hourly_cost:value});
  }
  async function setRequestContext(client,eid,requestId,costCenterId,purchaseOrderId){
    if(!validId(eid)||!validId(requestId))throw new Error('INVALID_ID');
    var cc=costCenterId?String(costCenterId):null,po=purchaseOrderId?String(purchaseOrderId):null;
    if(cc&&!validId(cc)||po&&!validId(po))throw new Error('INVALID_ID');
    return rpc(client,'set_enterprise_request_finance_context_v1',{
      p_enterprise_id:eid,p_request_id:requestId,p_cost_center_id:cc,p_purchase_order_id:po
    });
  }
  function csv(data){
    var rows=[['request_id','date','site','city','service','status','cost_center','department','purchase_order','external_cost','internal_cost','operational_cost','fixeo_commission']];
    (data&&data.rows||[]).forEach(r=>rows.push([
      r.request_id,r.created_at,r.site_name,r.city,r.service_category,r.request_status,
      r.cost_center_code||'',r.department||'',r.purchase_order_reference||'',
      r.external_cost||0,r.internal_cost||0,r.total_operational_cost||0,r.fixeo_commission||0
    ]));
    function cell(v){var s=String(v==null?'':v);return '"'+s.replace(/"/g,'""')+'"';}
    return rows.map(row=>row.map(cell).join(',')).join('\n');
  }
  return Object.freeze({
    canView:canView,canManage:canManage,canTag:canTag,load:load,
    upsertCostCenter:upsertCostCenter,upsertBudget:upsertBudget,upsertPurchaseOrder:upsertPurchaseOrder,
    setWorkerRate:setWorkerRate,setRequestContext:setRequestContext,csv:csv
  });
});