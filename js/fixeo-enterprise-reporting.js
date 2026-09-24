/* FIXEO Enterprise B5 — read-only reporting through existing secured RPCs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseReporting = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var PERIODS=Object.freeze({7:7,30:30,90:90,all:null});

  function periodRange(period, nowValue){
    if(!Object.prototype.hasOwnProperty.call(PERIODS,String(period))) throw new Error('INVALID_PERIOD');
    if(String(period)==='all') return {from:null,to:null};
    var now=nowValue?new Date(nowValue):new Date();
    if(Number.isNaN(now.getTime())) throw new Error('INVALID_NOW');
    var to=new Date(now.getTime());
    var from=new Date(now.getTime()-PERIODS[String(period)]*86400000);
    return {from:from.toISOString(),to:to.toISOString()};
  }

  async function rpc(client,name,args){
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

  async function load(client,enterpriseId,period,nowValue){
    if(!UUID_RE.test(String(enterpriseId||''))) throw new Error('INVALID_ENTERPRISE_ID');
    var range=periodRange(period||'30',nowValue);
    var common={p_enterprise_id:enterpriseId,p_from:range.from,p_to:range.to};
    var results=await Promise.all([
      rpc(client,'get_enterprise_operational_summary',{...common,p_site_id:null}),
      rpc(client,'get_enterprise_sla_summary',common),
      rpc(client,'get_enterprise_site_summary',common),
      rpc(client,'get_enterprise_request_breakdown',{...common,p_site_id:null})
    ]);
    return Object.freeze({
      period:String(period||'30'),
      from:range.from,
      to:range.to,
      operational:Object.freeze(results[0]),
      sla:Object.freeze(results[1]),
      sites:Object.freeze(Array.isArray(results[2].sites)?results[2].sites.map(Object.freeze):[]),
      breakdown:Object.freeze({
        by_service_category:Object.freeze(Array.isArray(results[3].by_service_category)?results[3].by_service_category.map(Object.freeze):[]),
        by_urgency:Object.freeze(Array.isArray(results[3].by_urgency)?results[3].by_urgency.map(Object.freeze):[]),
        by_request_status:Object.freeze(Array.isArray(results[3].by_request_status)?results[3].by_request_status.map(Object.freeze):[])
      })
    });
  }

  return Object.freeze({periodRange:periodRange,load:load});
});
