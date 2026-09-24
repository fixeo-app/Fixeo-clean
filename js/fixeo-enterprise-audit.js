/* FIXEO Enterprise B8 — read-only audit history/export through secured RPCs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseAudit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var PERIODS=Object.freeze({7:7,30:30,90:90,all:null});
  var SAFE_KEYS=Object.freeze([
    'status','role','site_id','service_category','urgency',
    'target_user_resolved','acceptance_target_minutes',
    'policy_urgency','policy_source','member_id','worker_id','service_request_id',
    'availability','all_sites','max_concurrent_jobs','mode','offer_count',
    'remaining_offers','skill_count','site_count','internal_offer_limit',
    'offer_ttl_minutes','fallback_after_minutes','source'
  ]);

  function canView(role){ return role==='owner'||role==='admin'; }
  function periodRange(period,nowValue){
    if(!Object.prototype.hasOwnProperty.call(PERIODS,String(period))) throw new Error('INVALID_PERIOD');
    if(String(period)==='all') return {from:null,to:null};
    var now=nowValue?new Date(nowValue):new Date();
    if(Number.isNaN(now.getTime())) throw new Error('INVALID_NOW');
    return {
      from:new Date(now.getTime()-PERIODS[String(period)]*86400000).toISOString(),
      to:now.toISOString()
    };
  }
  async function rpc(client,name,args){
    if(!client||typeof client.rpc!=='function') throw new Error('RPC_UNAVAILABLE');
    var response=await client.rpc(name,args);
    if(!response||response.error) throw new Error('RPC_FAILED');
    var data=response.data;
    if(!data||data.status!=='ok') throw new Error('RPC_REJECTED');
    return data;
  }
  async function listPage(client,enterpriseId,options){
    if(!UUID_RE.test(String(enterpriseId||''))) throw new Error('INVALID_ENTERPRISE_ID');
    options=options||{};
    var limit=Number(options.limit||50);
    if(!Number.isInteger(limit)||limit<1||limit>200) throw new Error('INVALID_LIMIT');
    var range=periodRange(options.period||'30',options.now);
    var cursor=options.cursor||null;
    if(cursor&&(!cursor.created_at||!UUID_RE.test(String(cursor.id||'')))) throw new Error('INVALID_CURSOR');
    return rpc(client,'list_enterprise_audit_events',{
      p_enterprise_id:enterpriseId,
      p_limit:limit,
      p_cursor_created_at:cursor?cursor.created_at:null,
      p_cursor_id:cursor?cursor.id:null,
      p_from:range.from,
      p_to:range.to,
      p_event_type:null,
      p_target_type:null,
      p_target_id:null,
      p_actor_user_id:null
    });
  }
  async function exportPeriod(client,enterpriseId,period,nowValue){
    if(!UUID_RE.test(String(enterpriseId||''))) throw new Error('INVALID_ENTERPRISE_ID');
    var range=periodRange(period||'30',nowValue);
    return rpc(client,'export_enterprise_audit_events',{
      p_enterprise_id:enterpriseId,
      p_from:range.from,
      p_to:range.to,
      p_event_type:null,
      p_target_type:null,
      p_target_id:null,
      p_actor_user_id:null,
      p_limit:5000
    });
  }
  function safeDetails(event){
    event=event||{};
    var out={};
    for(const sourceName of ['before_state','after_state','metadata']){
      var source=event[sourceName];
      if(!source||typeof source!=='object'||Array.isArray(source)) continue;
      var picked={};
      SAFE_KEYS.forEach(function(key){
        if(Object.prototype.hasOwnProperty.call(source,key)) picked[key]=source[key];
      });
      if(Object.keys(picked).length) out[sourceName]=picked;
    }
    return out;
  }
  return Object.freeze({
    canView:canView,periodRange:periodRange,listPage:listPage,
    exportPeriod:exportPeriod,safeDetails:safeDetails
  });
});
