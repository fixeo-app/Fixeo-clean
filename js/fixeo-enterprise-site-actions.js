/* FIXEO Enterprise B2 — site management through existing secured RPCs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseSiteActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function canManage(role){ return role==='owner'||role==='admin'; }
  function clean(value,max){
    var v=String(value==null?'':value).trim();
    if(!v) return null;
    if(max && v.length>max) throw new Error('INVALID_INPUT');
    return v;
  }
  function requireText(value,max){
    var v=clean(value,max);
    if(!v) throw new Error('INVALID_INPUT');
    return v;
  }
  function clientRpc(client,name,args){
    if(!client||typeof client.rpc!=='function') throw new Error('RPC_UNAVAILABLE');
    return client.rpc(name,args);
  }
  function unwrap(response){
    if(!response||response.error) throw new Error('RPC_FAILED');
    var data=response.data;
    if(!data||data.ok!==true) {
      var e=new Error((data&&data.reason)||'RPC_REJECTED');
      e.reason=(data&&data.reason)||'RPC_REJECTED';
      throw e;
    }
    return data;
  }
  async function create(client,enterpriseId,input){
    if(!UUID_RE.test(String(enterpriseId||''))) throw new Error('INVALID_ENTERPRISE_ID');
    input=input||{};
    return unwrap(await clientRpc(client,'create_enterprise_site',{
      p_enterprise_id:enterpriseId,
      p_name:requireText(input.name,200),
      p_city:requireText(input.city,120),
      p_site_code:clean(input.site_code,80),
      p_address_line:clean(input.address_line,500)
    }));
  }
  async function update(client,enterpriseId,siteId,input){
    if(!UUID_RE.test(String(enterpriseId||''))||!UUID_RE.test(String(siteId||''))) throw new Error('INVALID_ID');
    input=input||{};
    return unwrap(await clientRpc(client,'update_enterprise_site',{
      p_enterprise_id:enterpriseId,
      p_site_id:siteId,
      p_name:requireText(input.name,200),
      p_city:requireText(input.city,120),
      p_site_code:clean(input.site_code,80),
      p_address_line:clean(input.address_line,500)
    }));
  }
  async function setStatus(client,enterpriseId,siteId,status){
    if(!UUID_RE.test(String(enterpriseId||''))||!UUID_RE.test(String(siteId||''))) throw new Error('INVALID_ID');
    if(status!=='active'&&status!=='inactive') throw new Error('INVALID_STATUS');
    return unwrap(await clientRpc(client,'set_enterprise_site_status',{
      p_enterprise_id:enterpriseId,p_site_id:siteId,p_status:status
    }));
  }
  return Object.freeze({canManage:canManage,create:create,update:update,setStatus:setStatus});
});
