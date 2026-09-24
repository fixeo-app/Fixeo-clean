/* FIXEO Enterprise Block B — Control Tower client. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseControlTower=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var PRIORITIES=Object.freeze(['normal','high','critical']);
  var STATUSES=Object.freeze(['open','acknowledged','resolved']);
  function canEscalate(role){return ['owner','admin','operations_manager'].includes(String(role||''));}
  async function load(client,eid,limit){
    if(!UUID_RE.test(String(eid||'')))throw new Error('INVALID_ENTERPRISE_ID');
    var n=Number(limit||100);if(!Number.isInteger(n)||n<1||n>200)throw new Error('INVALID_LIMIT');
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc('get_enterprise_control_tower_v1',{p_enterprise_id:eid,p_limit:n});
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true)throw new Error('RPC_REJECTED');
    return r.data;
  }
  async function upsertEscalation(client,eid,input){
    input=input||{};
    if(!UUID_RE.test(String(eid||''))||!UUID_RE.test(String(input.request_id||'')))throw new Error('INVALID_ID');
    if(!PRIORITIES.includes(String(input.priority||'')))throw new Error('INVALID_PRIORITY');
    if(!STATUSES.includes(String(input.status||'')))throw new Error('INVALID_STATUS');
    var assignee=input.assigned_to_member_id?String(input.assigned_to_member_id):null;
    if(assignee&&!UUID_RE.test(assignee))throw new Error('INVALID_ASSIGNEE');
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc('upsert_enterprise_control_tower_escalation_v1',{
      p_enterprise_id:eid,p_request_id:String(input.request_id),
      p_priority:String(input.priority),p_status:String(input.status),
      p_assigned_to_member_id:assignee,p_note:String(input.note||'').trim()||null
    });
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true){
      var e=new Error((r.data&&r.data.reason)||'RPC_REJECTED');e.reason=(r.data&&r.data.reason)||'RPC_REJECTED';throw e;
    }
    return r.data;
  }
  return Object.freeze({canEscalate:canEscalate,load:load,upsertEscalation:upsertEscalation});
});