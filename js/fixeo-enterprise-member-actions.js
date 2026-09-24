/* FIXEO Enterprise B6 — member access management through canonical secured RPCs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseMemberActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var ROLES=Object.freeze(['admin','operations_manager','site_manager','reporter','viewer']);
  var STATUSES=Object.freeze(['active','suspended','removed']);

  function canManage(role){ return role==='owner'||role==='admin'; }
  function validId(value){ return UUID_RE.test(String(value||'')); }
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
  async function updateRole(client,enterpriseId,memberId,newRole){
    if(!validId(enterpriseId)||!validId(memberId)) throw new Error('INVALID_ID');
    if(ROLES.indexOf(String(newRole||''))===-1) throw new Error('INVALID_ROLE');
    return call(client,'update_enterprise_member_role',{
      p_enterprise_id:enterpriseId,p_member_id:memberId,p_new_role:newRole
    });
  }
  async function setStatus(client,enterpriseId,memberId,newStatus){
    if(!validId(enterpriseId)||!validId(memberId)) throw new Error('INVALID_ID');
    if(STATUSES.indexOf(String(newStatus||''))===-1) throw new Error('INVALID_STATUS');
    return call(client,'set_enterprise_member_status',{
      p_enterprise_id:enterpriseId,p_member_id:memberId,p_new_status:newStatus
    });
  }
  async function assignSite(client,enterpriseId,memberId,siteId){
    if(!validId(enterpriseId)||!validId(memberId)||!validId(siteId)) throw new Error('INVALID_ID');
    return call(client,'assign_enterprise_member_site',{
      p_enterprise_id:enterpriseId,p_member_id:memberId,p_site_id:siteId
    });
  }
  async function unassignSite(client,enterpriseId,memberId,siteId){
    if(!validId(enterpriseId)||!validId(memberId)||!validId(siteId)) throw new Error('INVALID_ID');
    return call(client,'unassign_enterprise_member_site',{
      p_enterprise_id:enterpriseId,p_member_id:memberId,p_site_id:siteId
    });
  }
  return Object.freeze({
    canManage:canManage,roles:ROLES,statuses:STATUSES,
    updateRole:updateRole,setStatus:setStatus,assignSite:assignSite,unassignSite:unassignSite
  });
});
