/* FIXEO Enterprise B7 — invitation management through canonical secured RPCs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseInvitationActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var TOKEN_RE=/^[0-9a-f]{64}$/i;
  var ROLES=Object.freeze(['admin','operations_manager','site_manager','reporter','viewer']);

  function canManage(role){ return role==='owner'||role==='admin'; }
  function validId(value){ return UUID_RE.test(String(value||'')); }
  function cleanEmail(value){
    var email=String(value||'').trim().toLowerCase();
    if(email.length<3||email.length>320||email.indexOf('@')<=0) throw new Error('INVALID_EMAIL');
    return email;
  }
  function expiryFromDays(days, nowValue){
    var n=Number(days);
    if(!Number.isInteger(n)||n<1||n>30) throw new Error('INVALID_EXPIRY');
    var now=nowValue?new Date(nowValue):new Date();
    if(Number.isNaN(now.getTime())) throw new Error('INVALID_NOW');
    return new Date(now.getTime()+n*86400000).toISOString();
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
  async function create(client,enterpriseId,input,nowValue){
    if(!validId(enterpriseId)) throw new Error('INVALID_ENTERPRISE_ID');
    input=input||{};
    var role=String(input.role||'');
    if(ROLES.indexOf(role)===-1) throw new Error('INVALID_ROLE');
    return call(client,'create_enterprise_invitation',{
      p_enterprise_id:enterpriseId,
      p_email:cleanEmail(input.email),
      p_role:role,
      p_expires_at:expiryFromDays(input.expires_days||7,nowValue)
    });
  }
  async function revoke(client,enterpriseId,invitationId){
    if(!validId(enterpriseId)||!validId(invitationId)) throw new Error('INVALID_ID');
    return call(client,'revoke_enterprise_invitation',{
      p_enterprise_id:enterpriseId,p_invitation_id:invitationId
    });
  }
  async function accept(client,token){
    token=String(token||'').trim();
    if(!TOKEN_RE.test(token)) throw new Error('INVALID_TOKEN');
    return call(client,'accept_enterprise_invitation',{p_token:token});
  }
  return Object.freeze({
    canManage:canManage,roles:ROLES,expiryFromDays:expiryFromDays,
    create:create,revoke:revoke,accept:accept
  });
});
