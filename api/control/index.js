'use strict';
const {randomUUID}=require('node:crypto');
const {publicConfig}=require('../supabase-environment');
const C=require('./contracts');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class ControlError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const fail=(code,status)=>{throw new ControlError(code,status);};
const id=(v,optional=false)=>{if(optional&&v==null)return null;if(!UUID.test(v||''))fail('INVALID_ID');return v;};
function allow(obj,keys){if(!obj||Array.isArray(obj)||typeof obj!=='object'||Object.keys(obj).some(k=>!keys.includes(k)))fail('INVALID_PAYLOAD');}
function transport(env,token,fetchImpl){
 let cfg;try{cfg=publicConfig(env);}catch(_){fail('CONTROL_BACKEND_UNAVAILABLE',503);}
 const headers={apikey:cfg.SUPABASE_ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'};
 async function call(path,body,timeout=5000){
  let response;try{response=await fetchImpl(cfg.SUPABASE_URL+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout),redirect:'error'});}catch(e){fail(e.name==='TimeoutError'?'SOURCE_TIMEOUT':'DEPENDENCY_UNAVAILABLE',503);}
  const text=await response.text();if(Buffer.byteLength(text)>1024*1024)fail('RESPONSE_TOO_LARGE',502);
  let data;try{data=JSON.parse(text);}catch(_){fail('DEPENDENCY_INVALID_RESPONSE',502);}
  if(!response.ok){const code=data?.message;
   if(response.status===401)fail('AUTH_REQUIRED',401);
   if(data?.code==='42501'||response.status===403)fail('FORBIDDEN',403);
   if(data?.code==='PGRST202'||data?.code==='42883')fail('CONTROL_SCHEMA_NOT_READY',503);
   fail(/^[A-Z_]{3,80}$/.test(code||'')?code:'DEPENDENCY_REJECTED',response.status===409||data?.code==='40001'?409:422);
  }return data;
 }
 return {user:()=>call('/auth/v1/user'),rpc:(name,args)=>call('/rest/v1/rpc/'+name,args)};
}
function createHandler({env=process.env,fetchImpl=fetch}={}){
 return async(req,res)=>{
  const trace=randomUUID();res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Correlation-ID',trace);
  try{
   if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
   const bearer=req.headers?.authorization||'';if(!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(bearer))fail('AUTH_REQUIRED',401);
   const origin=req.headers?.origin;const allowedOrigins=new Set(['https://www.fixeo.ma','https://fixeo.ma']);if(env.VERCEL_ENV==='preview'&&env.VERCEL_URL)allowedOrigins.add('https://'+env.VERCEL_URL);
   if(origin&&!allowedOrigins.has(origin))fail('ORIGIN_REJECTED',403);
   if(req.headers?.['sec-fetch-site']==='cross-site')fail('ORIGIN_REJECTED',403);
   const body=req.body||{};if(Buffer.byteLength(JSON.stringify(body))>8192)fail('PAYLOAD_TOO_LARGE',413);
   const operation=(req.path||req.url||'').split('?')[0].replace(/^\/api\/control-v1\//,'');
   if(!['summary','operations','dossier','search','signals','action/preview','action/execute'].includes(operation))fail('UNKNOWN_OPERATION',404);
   const client=transport(env,bearer.slice(7),fetchImpl);const user=await client.user();if(!UUID.test(user?.id||''))fail('AUTH_REQUIRED',401);
   let data;
   if(operation==='summary'||operation==='signals'){
    allow(body,['classification']);const classification=body.classification||'all';if(!['all','production','test','internal','unclassified'].includes(classification))fail('INVALID_CLASSIFICATION');
    const entries=await Promise.all(C.SOURCES.map(async source=>{const startedAt=Date.now();try{const result=await client.rpc('control_summary_v1',{p_source:source,p_classification:classification});return[source,C.sourceState(source,{status:result.completeness==='complete'?'healthy':'partial',data:result,asOf:result.as_of,lastSuccessAt:new Date().toISOString(),startedAt,completeness:result.completeness})];}catch(error){return[source,C.failSource(source,error,null,startedAt)];}}));
    const states=Object.fromEntries(entries);if(entries.every(([,x])=>x.status==='forbidden'))fail('FORBIDDEN',403);
    data=operation==='signals'?C.signals(states):{sources:states,manifest:C.MANIFEST};
   }else if(operation==='operations'){
    allow(body,['after','limit','status','city','trade','enterprise_id','site_id','classification']);
    data=await client.rpc('control_operations_list_v1',{p_after:id(body.after,true),p_limit:body.limit??50,p_status:body.status??null,p_city:body.city??null,p_trade:body.trade??null,p_enterprise_id:id(body.enterprise_id,true),p_site_id:id(body.site_id,true),p_classification:body.classification??'all'});
   }else if(operation==='dossier'){
    allow(body,['type','id']);if(!C.ENTITY_TYPES.includes(body.type))fail('UNSUPPORTED_ENTITY');data=await client.rpc('control_dossier_read_v1',{p_type:body.type,p_id:id(body.id)});
   }else if(operation==='search'){
    allow(body,['query','type','after','limit']);data=await client.rpc('control_search_v1',{p_query:body.query,p_type:body.type,p_after:id(body.after,true),p_limit:body.limit??25});
   }else if(operation==='action/preview'){
    allow(body,['capability','target_id','payload']);const cap=C.CAPABILITIES[body.capability];if(!cap)fail('UNSUPPORTED_CAPABILITY');
    data=await client.rpc('control_action_preview_v1',{p_capability:body.capability,p_target_id:id(body.target_id),p_payload:body.payload,p_correlation_id:trace});
    data={...data,authority:cap.authority,effect_description:cap.effect};
   }else{
    allow(body,['preview_id','confirmed','idempotency_key']);if(body.confirmed!==true)fail('HUMAN_CONFIRMATION_REQUIRED',428);
    data=await client.rpc('control_action_execute_v1',{p_preview_id:id(body.preview_id),p_confirmed:true,p_idempotency_key:id(body.idempotency_key)});
    if(data.ok===false)return res.status(409).json({...data,contract_version:C.VERSION});
   }
   return res.status(200).json({ok:true,contract_version:C.VERSION,correlation_id:trace,...data});
  }catch(e){return res.status(e instanceof ControlError?e.status:500).json({ok:false,code:e instanceof ControlError?e.code:'CONTROL_UNAVAILABLE',correlation_id:trace});}
 };
}
module.exports={createHandler,ControlError};
