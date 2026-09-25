/* FIXEO Enterprise H2 — confirmed RAFI action execution. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseRafiActions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function id(v){v=String(v||'');if(!UUID.test(v))throw new Error('INVALID_ID');return v;}
  function text(v,max,required){v=String(v==null?'':v).trim();if(required&&!v)throw new Error('INVALID_TEXT');if(v.length>max)throw new Error('INVALID_TEXT');return v||null;}
  function num(v,min,max,nullable){if(v==null||v===''){if(nullable)return null;throw new Error('INVALID_NUMBER');}v=Number(v);if(!Number.isFinite(v)||v<min||v>max)throw new Error('INVALID_NUMBER');return v;}
  async function rpc(client,name,args){if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');var r=await client.rpc(name,args);if(!r||r.error)throw new Error('RPC_FAILED');if(!r.data||r.data.ok!==true){var e=new Error('RPC_REJECTED');e.reason=r&&r.data&&r.data.reason;e.result=r&&r.data;throw e;}return r.data;}
  function auditTarget(proposal,result){var t=proposal.target||{},p=proposal.params||{};return t.case_id||p.case_id||t.request_id||p.request_id||t.site_id||p.site_id||(result&&(result.request_id||result.case_id||result.escalation_id||result.plan_id))||null;}
  async function audit(client,eid,proposal,result){var target=auditTarget(proposal,result);if(!target||!UUID.test(String(target)))return;var status=result&&result.governance_status==='pending_approval'?'pending_approval':'executed';try{await rpc(client,'audit_enterprise_rafi_action_v1',{p_enterprise_id:eid,p_action_type:proposal.type,p_target_id:String(target),p_result:status,p_details:{workflow:'canonical_enterprise_rpc',governance_status:result&&result.governance_status||null}});}catch(_){/* Business action succeeded: audit failure is surfaced server-side, never replay mutation. */}}
  async function execute(client,eid,proposal){
    eid=id(eid);if(!proposal||proposal.proposal_version!=='h1'||proposal.requires_confirmation!==true||proposal.executable!==false)throw new Error('INVALID_PROPOSAL');
    var p=proposal.params||{},t=proposal.target||{};
    switch(proposal.type){
      case 'create_governed_request':
        return rpc(client,'submit_enterprise_governed_request_v1',{p_enterprise_id:eid,p_site_id:id(t.site_id||p.site_id),p_service_category:text(p.service_category,160,true),p_description:text(p.description,4000,true),p_urgency:text(p.urgency,40,false),p_requested_amount:num(p.requested_amount,0,100000000,true)});
      case 'propose_internal_assignment':
        return rpc(client,'assign_enterprise_internal_worker_v1',{p_enterprise_id:eid,p_request_id:id(t.request_id||p.request_id),p_worker_id:id(t.worker_id||p.worker_id)});
      case 'propose_hybrid_dispatch':
        return rpc(client,'retry_enterprise_hybrid_dispatch_v1',{p_enterprise_id:eid,p_request_id:id(t.request_id||p.request_id)});
      case 'decide_approval':
        var decision=text(p.decision,20,true);if(!['approved','rejected'].includes(decision))throw new Error('INVALID_DECISION');
        return rpc(client,'decide_enterprise_approval_case_v1',{p_enterprise_id:eid,p_case_id:id(t.case_id||p.case_id),p_decision:decision,p_note:text(p.note,2000,false)});
      case 'upsert_control_tower_escalation':
        var priority=text(p.priority,20,true),status=text(p.status,30,true);
        if(!['normal','high','critical'].includes(priority)||!['open','acknowledged','resolved'].includes(status))throw new Error('INVALID_ESCALATION');
        return rpc(client,'upsert_enterprise_control_tower_escalation_v1',{p_enterprise_id:eid,p_request_id:id(t.request_id||p.request_id),p_priority:priority,p_status:status,p_assigned_to_member_id:p.assigned_to_member_id?id(p.assigned_to_member_id):null,p_note:text(p.note,1000,false)});
      case 'prepare_maintenance_action':
        var frequency=text(p.frequency,30,true),planStatus=text(p.status,20,true);
        return rpc(client,'upsert_enterprise_maintenance_plan_v1',{p_enterprise_id:eid,p_plan_id:p.plan_id?id(p.plan_id):null,p_site_id:id(t.site_id||p.site_id),p_name:text(p.name,200,true),p_service_category:text(p.service_category,160,true),p_description:text(p.description,2000,false),p_urgency:text(p.urgency,40,false),p_frequency:frequency,p_interval_count:num(p.interval_count,1,365,false),p_next_due_at:text(p.next_due_at,80,true),p_reminder_hours:num(p.reminder_hours,0,8760,false),p_status:planStatus});
      default: throw new Error('ACTION_NOT_ALLOWED');
    }
  }
  async function executeConfirmed(client,eid,proposal){var result=await execute(client,eid,proposal);await audit(client,eid,proposal,result);return result;}
  return Object.freeze({execute:executeConfirmed});
});
