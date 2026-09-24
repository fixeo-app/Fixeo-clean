/* FIXEO Enterprise B9 — audited SLA policy actions. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseSlaPolicyActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var URGENCIES=Object.freeze(['urgent','high','normal','low']);
  var STATUSES=Object.freeze(['active','inactive']);

  function canManage(role){ return role==='owner'||role==='admin'; }
  function validId(v){ return UUID_RE.test(String(v||'')); }
  function normalize(input){
    input=input||{};
    var siteId=input.site_id==null||input.site_id===''?null:String(input.site_id);
    if(siteId!==null&&!validId(siteId)) throw new Error('INVALID_SITE_ID');
    var urgency=input.urgency==null||input.urgency===''?null:String(input.urgency);
    if(urgency!==null&&URGENCIES.indexOf(urgency)===-1) throw new Error('INVALID_URGENCY');
    var target=Number(input.acceptance_target_minutes);
    if(!Number.isInteger(target)||target<=0) throw new Error('INVALID_TARGET');
    var status=String(input.status||'active');
    if(STATUSES.indexOf(status)===-1) throw new Error('INVALID_STATUS');
    return {site_id:siteId,urgency:urgency,acceptance_target_minutes:target,status:status};
  }
  async function call(client,name,args){
    if(!client||typeof client.rpc!=='function') throw new Error('RPC_UNAVAILABLE');
    var response=await client.rpc(name,args);
    if(!response||response.error) throw new Error('RPC_FAILED');
    var data=response.data;
    if(!data||data.ok!==true){
      var e=new Error((data&&data.reason)||'RPC_REJECTED');
      e.reason=(data&&data.reason)||'RPC_REJECTED';
      throw e;
    }
    return data;
  }
  async function create(client,enterpriseId,input){
    if(!validId(enterpriseId)) throw new Error('INVALID_ENTERPRISE_ID');
    var v=normalize(input);
    return call(client,'create_enterprise_sla_policy',{
      p_enterprise_id:enterpriseId,
      p_site_id:v.site_id,
      p_urgency:v.urgency,
      p_acceptance_target_minutes:v.acceptance_target_minutes,
      p_status:v.status
    });
  }
  async function update(client,enterpriseId,policyId,input){
    if(!validId(enterpriseId)||!validId(policyId)) throw new Error('INVALID_ID');
    var v=normalize(input);
    return call(client,'update_enterprise_sla_policy',{
      p_enterprise_id:enterpriseId,
      p_policy_id:policyId,
      p_site_id:v.site_id,
      p_urgency:v.urgency,
      p_acceptance_target_minutes:v.acceptance_target_minutes,
      p_status:v.status
    });
  }
  return Object.freeze({
    canManage:canManage,urgencies:URGENCIES,statuses:STATUSES,
    create:create,update:update
  });
});
