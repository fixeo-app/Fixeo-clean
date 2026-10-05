'use strict';
const {createHmac,randomUUID,createHash} = require('node:crypto');
const {boundedBody,DiagnosticError} = require('../diagnostic/transport');
const {BRANCH,REF} = require('./runtime');
function operationId(value) {
  const h=createHash('sha256').update('fixeo-w41-operation:'+value).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
function attest(operation,payload,userId,env,id=randomUUID(),now=Date.now()) {
  const issued=Math.floor(now/1000);
  const p_envelope=JSON.stringify({v:1,kid:'w41-v1',aud:'fixeo-mobile-w41',environment:'staging',project_ref:REF,
    branch:BRANCH,user_id:userId,operation,operation_id:id,issued_at:issued,expires_at:issued+60,payload});
  if(Buffer.byteLength(p_envelope)>65536) throw new DiagnosticError('MOBILE_PAYLOAD_INVALID',413);
  const p_mac=createHmac('sha256',env.FIXEO_W41_ATTESTATION_SECRET).update('fixeo-w41-attestation-v1:'+p_envelope).digest('hex');
  return {p_envelope,p_mac};
}
function createClientTransport({auth,env,fetchImpl=fetch}) {
  if(!auth?.token || !auth.userId) throw new DiagnosticError('AUTH_REQUIRED',401);
  async function request(path,{method='POST',body,binary=false,headers={},maxBytes=262144}={}) {
    if(!/^\/(rest\/v1\/rpc\/[a-z0-9_]+|storage\/v1\/object\/)/.test(path)) throw new DiagnosticError('MOBILE_OPERATION_FORBIDDEN');
    if(Object.keys(headers).some(k=>/authorization|apikey/i.test(k))) throw new DiagnosticError('MOBILE_OPERATION_FORBIDDEN');
    let response;
    try { response=await fetchImpl(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_ANON_KEY,
      Authorization:'Bearer '+auth.token,...(!binary?{'Content-Type':'application/json'}:{}),...headers},
      body:body===undefined?undefined:binary?body:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'}); }
    catch { throw new DiagnosticError('DEPENDENCY_UNAVAILABLE',503); }
    const buffer=await boundedBody(response,maxBytes);
    if(!response.ok) {
      let code;try {code=JSON.parse(buffer.toString()).message?.match(/(?:MOBILE|DIAGNOSTIC)_[A-Z_]+/)?.[0]}catch{}
      throw new DiagnosticError(code||'DEPENDENCY_REJECTED',response.status===401?401:/QUOTA/.test(code||'')?429:/EXPIRED/.test(code||'')?410:409);
    }
    return binary?buffer:buffer.length?JSON.parse(buffer.toString()):null;
  }
  const rawRpc=(name,args)=>request('/rest/v1/rpc/'+name,{body:args});
  const signed=(name,op,payload,id)=>rawRpc(name,attest(op,payload,auth.userId,env,id));
  return {
    root:env.SUPABASE_URL,request,
    user:async token=>{if(token!==auth.token)throw new DiagnosticError('AUTH_REQUIRED',401);return auth.userId;},
    offer:row=>signed('mobile_estimator_offer_v1','offer',row,row.id),
    confirm:args=>signed('confirm_mobile_estimator_request_v2','confirm',{kind:'pricing',confirmation:args},operationId(auth.userId+':confirm:'+args.p_context_id)),
    dispatch:id=>rawRpc('dispatch_my_estimator_request_v1',{p_request_id:id}),
    async rpc(name,args) {
      if(name==='mobile_intelligence_quota_v1') return rawRpc(name,{p_kind:args.p_kind});
      if(name==='diagnostic_quota_v1') return rawRpc('mobile_intelligence_quota_v1',{p_kind:'diagnostic'});
      if(name==='diagnostic_state_v1') {
        if(args.p_actor!=='u:'+auth.userId)throw new DiagnosticError('MOBILE_OWNER_MISMATCH',403);
        const payload={...args.p_payload};delete payload.limits;delete payload.source;delete payload.reserved_micro_usd;
        return signed('mobile_diagnostic_state_v1','diagnostic',{action:args.p_action,session_id:args.p_session_id,payload});
      }
      if(name==='create_diagnostic_quote_request_v1')return signed('confirm_mobile_estimator_request_v2','confirm',
        {kind:'quote',confirmation:args},operationId(auth.userId+':quote:'+args.p_diagnostic.session_id));
      throw new DiagnosticError('MOBILE_OPERATION_FORBIDDEN',403);
    },
  };
}
module.exports={createClientTransport,attest,operationId};
