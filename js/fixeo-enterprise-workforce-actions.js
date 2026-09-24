/* FIXEO Enterprise Block A — Workforce + Hybrid Dispatch actions. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseWorkforceActions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var MODES=Object.freeze(['internal_only','internal_first','external_only','hybrid']);
  var AVAIL=Object.freeze(['available','unavailable','off_duty']);

  function validId(v){return UUID_RE.test(String(v||''));}
  function canManage(role){return role==='owner'||role==='admin';}
  function canOperate(role){return ['owner','admin','operations_manager'].includes(String(role||''));}
  function clean(v){return String(v==null?'':v).trim();}
  async function call(client,name,args){
    if(!client||typeof client.rpc!=='function') throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc(name,args);
    if(!r||r.error) throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true){
      var e=new Error((r.data&&r.data.reason)||'RPC_REJECTED');
      e.reason=(r.data&&r.data.reason)||'RPC_REJECTED';
      throw e;
    }
    return r.data;
  }
  async function createWorker(client,eid,input){
    input=input||{};
    if(!validId(eid)||!validId(input.member_id)) throw new Error('INVALID_ID');
    return call(client,'create_enterprise_workforce_worker',{
      p_enterprise_id:eid,
      p_member_id:String(input.member_id),
      p_display_label:clean(input.display_label),
      p_employee_code:clean(input.employee_code)||null,
      p_all_sites:!!input.all_sites,
      p_max_concurrent_jobs:Number(input.max_concurrent_jobs||1)
    });
  }
  async function updateWorker(client,eid,wid,input){
    input=input||{};
    if(!validId(eid)||!validId(wid)) throw new Error('INVALID_ID');
    return call(client,'update_enterprise_workforce_worker',{
      p_enterprise_id:eid,p_worker_id:wid,
      p_display_label:clean(input.display_label),
      p_employee_code:clean(input.employee_code)||null,
      p_status:String(input.status||'active'),
      p_all_sites:!!input.all_sites,
      p_max_concurrent_jobs:Number(input.max_concurrent_jobs||1)
    });
  }
  async function replaceSkills(client,eid,wid,skills){
    if(!validId(eid)||!validId(wid)||!Array.isArray(skills)) throw new Error('INVALID_INPUT');
    return call(client,'replace_enterprise_workforce_skills',{
      p_enterprise_id:eid,p_worker_id:wid,p_skills:skills
    });
  }
  async function replaceSites(client,eid,wid,siteIds){
    if(!validId(eid)||!validId(wid)||!Array.isArray(siteIds)||siteIds.some(x=>!validId(x))) throw new Error('INVALID_INPUT');
    return call(client,'replace_enterprise_workforce_sites',{
      p_enterprise_id:eid,p_worker_id:wid,p_site_ids:siteIds
    });
  }
  async function setAvailability(client,eid,wid,value){
    if(!validId(eid)||!validId(wid)||!AVAIL.includes(value)) throw new Error('INVALID_INPUT');
    return call(client,'set_enterprise_workforce_availability',{
      p_enterprise_id:eid,p_worker_id:wid,p_availability:value
    });
  }
  async function upsertPolicy(client,eid,input){
    input=input||{};
    if(!validId(eid)) throw new Error('INVALID_ID');
    var pid=input.policy_id?String(input.policy_id):null;
    var sid=input.site_id?String(input.site_id):null;
    if(pid&&!validId(pid)) throw new Error('INVALID_ID');
    if(sid&&!validId(sid)) throw new Error('INVALID_ID');
    if(!MODES.includes(String(input.mode||''))) throw new Error('INVALID_MODE');
    return call(client,'upsert_enterprise_dispatch_policy',{
      p_enterprise_id:eid,p_policy_id:pid,p_site_id:sid,
      p_service_category:clean(input.service_category)||null,
      p_mode:String(input.mode),
      p_internal_offer_limit:Number(input.internal_offer_limit||3),
      p_offer_ttl_minutes:Number(input.offer_ttl_minutes||15),
      p_fallback_after_minutes:Number(input.fallback_after_minutes||10),
      p_status:String(input.status||'active')
    });
  }
  async function acceptOffer(client,requestId){
    if(!validId(requestId)) throw new Error('INVALID_ID');
    return call(client,'accept_my_enterprise_workforce_offer_v1',{p_request_id:requestId});
  }
  async function declineOffer(client,requestId){
    if(!validId(requestId)) throw new Error('INVALID_ID');
    return call(client,'decline_my_enterprise_workforce_offer_v1',{p_request_id:requestId});
  }
  async function setAssignmentStatus(client,eid,requestId,status){
    if(!validId(eid)||!validId(requestId)) throw new Error('INVALID_ID');
    return call(client,'set_enterprise_internal_assignment_status_v1',{
      p_enterprise_id:eid,p_request_id:requestId,p_status:status
    });
  }
  async function retryDispatch(client,eid,requestId){
    if(!validId(eid)||!validId(requestId)) throw new Error('INVALID_ID');
    return call(client,'retry_enterprise_hybrid_dispatch_v1',{
      p_enterprise_id:eid,p_request_id:requestId
    });
  }
  async function assignWorker(client,eid,requestId,workerId){
    if(!validId(eid)||!validId(requestId)||!validId(workerId)) throw new Error('INVALID_ID');
    return call(client,'assign_enterprise_internal_worker_v1',{
      p_enterprise_id:eid,p_request_id:requestId,p_worker_id:workerId
    });
  }
  async function myProfile(client,eid){
    if(!validId(eid)) throw new Error('INVALID_ID');
    if(!client||typeof client.rpc!=='function') throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc('get_my_enterprise_workforce_profile_v1',{p_enterprise_id:eid});
    if(!r||r.error) throw new Error('RPC_FAILED');
    return r.data||{ok:false,reason:'worker_not_found'};
  }
  return Object.freeze({
    modes:MODES,availability:AVAIL,canManage:canManage,canOperate:canOperate,
    createWorker:createWorker,updateWorker:updateWorker,replaceSkills:replaceSkills,
    replaceSites:replaceSites,setAvailability:setAvailability,upsertPolicy:upsertPolicy,
    acceptOffer:acceptOffer,declineOffer:declineOffer,setAssignmentStatus:setAssignmentStatus,
    retryDispatch:retryDispatch,assignWorker:assignWorker,myProfile:myProfile
  });
});