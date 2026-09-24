/* FIXEO Enterprise B3 — request creation through canonical secured RPC. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseRequestActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var ALLOWED_ROLES=Object.freeze(['owner','admin','operations_manager','site_manager','reporter']);
  var ALLOWED_URGENCY=Object.freeze(['normale','urgent','now']);

  function canCreate(role){ return ALLOWED_ROLES.indexOf(String(role||''))!==-1; }
  function clean(value){ return String(value==null?'':value).trim(); }
  function requireText(value){ var v=clean(value); if(!v) throw new Error('INVALID_INPUT'); return v; }
  async function create(client,enterpriseId,input){
    if(!UUID_RE.test(String(enterpriseId||''))) throw new Error('INVALID_ENTERPRISE_ID');
    input=input||{};
    var siteId=String(input.site_id||'');
    if(!UUID_RE.test(siteId)) throw new Error('INVALID_SITE_ID');
    var urgency=input.urgency==null||input.urgency===''?null:String(input.urgency);
    if(urgency!==null&&ALLOWED_URGENCY.indexOf(urgency)===-1) throw new Error('INVALID_URGENCY');
    if(!client||typeof client.rpc!=='function') throw new Error('RPC_UNAVAILABLE');
    var response=await client.rpc('create_enterprise_request',{
      p_enterprise_id:enterpriseId,
      p_site_id:siteId,
      p_service_category:requireText(input.service_category),
      p_description:requireText(input.description),
      p_urgency:urgency
    });
    if(!response||response.error) throw new Error('RPC_FAILED');
    var data=response.data;
    if(!data||data.ok!==true){
      var e=new Error((data&&data.reason)||'RPC_REJECTED');
      e.reason=(data&&data.reason)||'RPC_REJECTED';
      throw e;
    }
    return data;
  }
  return Object.freeze({canCreate:canCreate,create:create});
});
