/* FIXEO Enterprise Block F — Governance client. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseGovernance=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var APPROVER_ROLES=Object.freeze(['owner','admin','operations_manager','site_manager']);
  function validId(v){return UUID_RE.test(String(v||''));}
  function canManage(role){return role==='owner'||role==='admin';}
  async function rpc(client,name,args){
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc(name,args);
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true){var e=new Error((r.data&&r.data.reason)||'RPC_REJECTED');e.reason=(r.data&&r.data.reason)||'RPC_REJECTED';throw e;}
    return r.data;
  }
  async function load(client,eid){
    if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    return rpc(client,'get_enterprise_governance_v1',{p_enterprise_id:eid});
  }
  async function upsertPolicy(client,eid,input){
    input=input||{};if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    var pid=input.policy_id?String(input.policy_id):null,site=input.site_id?String(input.site_id):null;
    if(pid&&!validId(pid)||site&&!validId(site))throw new Error('INVALID_ID');
    var steps=Array.isArray(input.steps)?input.steps:[];
    if(!steps.length||steps.length>10||steps.some((s,i)=>s.step_order!==i+1||!APPROVER_ROLES.includes(s.approver_role)))throw new Error('INVALID_STEPS');
    function num(v){if(v==null||v==='')return null;var n=Number(v);if(!Number.isFinite(n)||n<0)throw new Error('INVALID_AMOUNT');return n;}
    return rpc(client,'upsert_enterprise_approval_policy_v1',{
      p_enterprise_id:eid,p_policy_id:pid,p_name:String(input.name||'').trim(),
      p_site_id:site,p_service_category:String(input.service_category||'').trim()||null,
      p_urgency:input.urgency||null,p_requester_role:input.requester_role||null,
      p_min_amount:num(input.min_amount),p_max_amount:num(input.max_amount),
      p_priority:Number(input.priority||100),p_status:String(input.status||'active'),
      p_steps:steps
    });
  }
  async function decide(client,eid,caseId,decision,note){
    if(!validId(eid)||!validId(caseId))throw new Error('INVALID_ID');
    if(!['approved','rejected'].includes(decision))throw new Error('INVALID_DECISION');
    return rpc(client,'decide_enterprise_approval_case_v1',{
      p_enterprise_id:eid,p_case_id:caseId,p_decision:decision,p_note:String(note||'').trim()||null
    });
  }
  return Object.freeze({roles:APPROVER_ROLES,canManage:canManage,load:load,upsertPolicy:upsertPolicy,decide:decide});
});