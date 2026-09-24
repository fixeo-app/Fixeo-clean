/* FIXEO Enterprise Block C — Preventive Maintenance client. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterprisePreventiveMaintenance=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var FREQUENCIES=Object.freeze(['daily','weekly','monthly']);
  var STATUSES=Object.freeze(['active','paused','inactive']);
  var URGENCIES=Object.freeze(['normale','urgent','now']);
  function canManage(role){return ['owner','admin','operations_manager'].includes(String(role||''));}
  function validId(v){return UUID_RE.test(String(v||''));}
  async function load(client,eid,limit){
    if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    var n=Number(limit||100);if(!Number.isInteger(n)||n<1||n>500)throw new Error('INVALID_LIMIT');
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc('get_enterprise_preventive_maintenance_v1',{p_enterprise_id:eid,p_history_limit:n});
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true)throw new Error('RPC_REJECTED');
    return r.data;
  }
  async function upsertPlan(client,eid,input){
    input=input||{};
    if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    var pid=input.plan_id?String(input.plan_id):null;
    var sid=String(input.site_id||'');
    if(pid&&!validId(pid))throw new Error('INVALID_PLAN_ID');
    if(!validId(sid))throw new Error('INVALID_SITE_ID');
    if(!FREQUENCIES.includes(String(input.frequency||'')))throw new Error('INVALID_FREQUENCY');
    if(!STATUSES.includes(String(input.status||'')))throw new Error('INVALID_STATUS');
    var urgency=input.urgency?String(input.urgency):null;
    if(urgency&&!URGENCIES.includes(urgency))throw new Error('INVALID_URGENCY');
    var interval=Number(input.interval_count), reminder=Number(input.reminder_hours);
    if(!Number.isInteger(interval)||interval<1||interval>24)throw new Error('INVALID_INTERVAL');
    if(!Number.isInteger(reminder)||reminder<0||reminder>720)throw new Error('INVALID_REMINDER');
    var due=new Date(input.next_due_at);
    if(Number.isNaN(due.getTime()))throw new Error('INVALID_DUE_AT');
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc('upsert_enterprise_maintenance_plan_v1',{
      p_enterprise_id:eid,
      p_plan_id:pid,
      p_site_id:sid,
      p_name:String(input.name||'').trim(),
      p_service_category:String(input.service_category||'').trim(),
      p_description:String(input.description||'').trim(),
      p_urgency:urgency,
      p_frequency:String(input.frequency),
      p_interval_count:interval,
      p_next_due_at:due.toISOString(),
      p_reminder_hours:reminder,
      p_status:String(input.status)
    });
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true){
      var e=new Error((r.data&&r.data.reason)||'RPC_REJECTED');e.reason=(r.data&&r.data.reason)||'RPC_REJECTED';throw e;
    }
    return r.data;
  }
  return Object.freeze({canManage:canManage,load:load,upsertPlan:upsertPlan});
});