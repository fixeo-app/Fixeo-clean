'use strict';
const {randomUUID}=require('node:crypto');
const {publicConfig}=require('../supabase-environment');
const C=require('./contracts');
const Rafi=require('./rafi-decisions');
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
   if(!['summary','operations','dossier','search','signals','decisions','dispatch-candidates','network-context','action/preview','action/execute','dossier-section','operation-context','hybrid-context','hybrid/preview','hybrid/execute','people','people-context','trust','trust-context','review-history','quotes','quote-context','finance','finance-context'].includes(operation))fail('UNKNOWN_OPERATION',404);
   const client=transport(env,bearer.slice(7),fetchImpl);const user=await client.user();if(!UUID.test(user?.id||''))fail('AUTH_REQUIRED',401);
   let data;
   if(operation==='decisions'){
    allow(body,['classification']);
    const classification=body.classification??'all';
    if(!['all','production','test','internal','unclassified'].includes(classification))fail('INVALID_CLASSIFICATION');
    const entries=await Promise.all(Rafi.SOURCES.map(async source=>{
     try{return [source,Rafi.sourceState(source,await client.rpc('control_rafi_source_v1',{p_source:source,p_classification:classification}))];}
     catch(error){return [source,Rafi.sourceState(source,null,error)];}
    }));
    if(entries.some(([,state])=>state.status==='FORBIDDEN'))fail('FORBIDDEN',403);
    data=Rafi.build(Object.fromEntries(entries),{classification});
   }else if(operation==='people'){
    allow(body,['type','state','classification','city','trade','query','enterprise_id','site_id','after','limit']);
    const {after,limit,...filters}=body;
    if(filters.enterprise_id!=null)id(filters.enterprise_id);if(filters.site_id!=null)id(filters.site_id);
    data=await client.rpc('control_people_page_v1',{p_filters:filters,p_after:after??null,p_limit:limit??25});
   }else if(operation==='finance'){
    allow(body,['queue','classification','city','trade','enterprise_id','site_id','after','limit']);const {after,limit,...filters}=body;
    if(filters.enterprise_id!=null)id(filters.enterprise_id);if(filters.site_id!=null)id(filters.site_id);
    data=await client.rpc('control_finance_page_v1',{p_filters:filters,p_after:after??null,p_limit:limit??25});
   }else if(operation==='finance-context'){
    allow(body,['type','id','after','limit']);if(!['mission','remittance'].includes(body.type))fail('UNSUPPORTED_ENTITY');
    data=await client.rpc('control_finance_context_v1',{p_type:body.type,p_id:id(body.id),p_after:id(body.after,true),p_limit:body.limit??25});
   }else if(operation==='quotes'){
    allow(body,['queue','classification','city','trade','after','limit']);const {after,limit,...filters}=body;
    data=await client.rpc('control_quotes_page_v1',{p_filters:filters,p_after:after??null,p_limit:limit??25});
   }else if(operation==='quote-context'){
    allow(body,['type','id']);if(!['request','quote'].includes(body.type))fail('UNSUPPORTED_ENTITY');
    data=await client.rpc('control_quote_context_v1',{p_type:body.type,p_id:id(body.id)});
   }else if(operation==='review-history'){
    allow(body,['type','id','after','limit']);if(!['artisan','claim','quote','mission','remittance'].includes(body.type))fail('UNSUPPORTED_ENTITY');
    data=await client.rpc('control_review_history_v1',{p_type:body.type,p_id:id(body.id),p_after:body.after??null,p_limit:body.limit??25});
   }else if(operation==='trust'){
    allow(body,['queue','state','classification','city','trade','after','limit']);const {after,limit,...filters}=body;
    data=await client.rpc('control_trust_page_v1',{p_filters:filters,p_after:after??null,p_limit:limit??25});
   }else if(operation==='trust-context'){
    allow(body,['type','id','after','limit']);if(!['artisan','claim','mission'].includes(body.type))fail('UNSUPPORTED_ENTITY');
    data=await client.rpc('control_trust_context_v1',{p_type:body.type,p_id:id(body.id),p_after:id(body.after,true),p_limit:body.limit??25});
   }else if(operation==='people-context'){
    allow(body,['type','id','after','limit']);if(!['artisan','client','enterprise','site','worker'].includes(body.type))fail('UNSUPPORTED_ENTITY');
    data=await client.rpc('control_people_context_v1',{p_type:body.type,p_id:id(body.id),p_after:id(body.after,true),p_limit:body.limit??25});
   }else if(operation==='network-context'){
    allow(body,['city','trade','state','classification','after','limit']);
    if(typeof body.city!=='string'||!body.city.trim()||body.city.length>120||typeof body.trade!=='string'||!body.trade.trim()||body.trade.length>80||!['all','available','unverified','unclaimed'].includes(body.state??'all')||!['all','production','test','internal','unclassified'].includes(body.classification??'all')||!Number.isInteger(body.limit??25)||(body.limit??25)<1||(body.limit??25)>50)fail('INVALID_FILTER');
    data=await client.rpc('control_rafi_network_list_v1',{p_city:body.city,p_trade:body.trade,p_state:body.state??'all',p_classification:body.classification??'all',p_after:id(body.after,true),p_limit:body.limit??25});
   }else if(operation==='dispatch-candidates'){
    allow(body,['request_id']);data=await client.rpc('control_rafi_dispatch_read_v1',{p_request_id:id(body.request_id)});
   }else if(operation==='summary'||operation==='signals'){
    allow(body,operation==='summary'?['classification','source']:['classification']);const classification=body.classification||'all';if(!['all','production','test','internal','unclassified'].includes(classification))fail('INVALID_CLASSIFICATION');
    if(body.source!==undefined&&!C.SOURCES.includes(body.source))fail('INVALID_SOURCE');
    const sources=body.source?[body.source]:C.SOURCES;
    const entries=await Promise.all(sources.map(async source=>{const startedAt=Date.now();try{const result=await client.rpc('control_summary_v1',{p_source:source,p_classification:classification});return[source,C.sourceState(source,{status:result.completeness==='complete'?'healthy':'partial',data:result,asOf:result.as_of,lastSuccessAt:new Date().toISOString(),startedAt,completeness:result.completeness})];}catch(error){return[source,C.failSource(source,error,null,startedAt)];}}));
    const states=Object.fromEntries(entries);if(entries.every(([,x])=>x.status==='forbidden'))fail('FORBIDDEN',403);
    data=operation==='signals'?C.signals(states):{sources:states,manifest:C.MANIFEST};
   }else if(operation==='operations'){
    allow(body,['after','limit','status','city','trade','enterprise_id','site_id','classification','urgency','origin','executor','mode','sla','min_age','max_age','query']);
    const {after,limit,...filters}=body;
    data=await client.rpc('control_operations_page_v1',{p_filters:filters,p_after:id(after,true),p_limit:limit??25});
   }else if(operation==='dossier'||operation==='dossier-section'){
    allow(body,operation==='dossier'?['type','id']:['type','id','section','after','limit']);if(!C.ENTITY_TYPES.includes(body.type))fail('UNSUPPORTED_ENTITY');
    data=await client.rpc('control_dossier_section_v1',{p_type:body.type,p_id:id(body.id),p_section:operation==='dossier'?'identity':body.section,p_after:body.after??null,p_limit:body.limit??25});
   }else if(operation==='operation-context'||operation==='hybrid-context'){
    allow(body,['request_id']);data=await client.rpc(operation==='operation-context'?'control_operation_read_v1':'control_hybrid_read_v1',{p_request_id:id(body.request_id)});
   }else if(operation==='search'){
    allow(body,['query','type','after','limit']);
    if(typeof body.query!=='string'||body.query.trim().length<2||body.query.length>120||!['all',...C.ENTITY_TYPES].includes(body.type??'all')||(body.after!=null&&(typeof body.after!=='string'||body.after.length>100)))fail('INVALID_SEARCH');
    data=await client.rpc('control_search_all_v1',{p_query:body.query,p_type:body.type??'all',p_after:body.after??null,p_limit:body.limit??25});
   }else if(operation==='hybrid/preview'){
    allow(body,['capability','target_id','payload']);if(!['enterprise.assign','enterprise.retry'].includes(body.capability))fail('UNSUPPORTED_CAPABILITY');
    data=await client.rpc('control_hybrid_preview_v1',{p_capability:body.capability,p_request_id:id(body.target_id),p_payload:body.payload,p_correlation_id:trace});
   }else if(operation==='hybrid/execute'){
    allow(body,['preview_id','confirmed','idempotency_key']);if(body.confirmed!==true)fail('HUMAN_CONFIRMATION_REQUIRED',428);
    data=await client.rpc('control_hybrid_execute_v1',{p_preview_id:id(body.preview_id),p_confirmed:true,p_idempotency_key:id(body.idempotency_key)});
    if(data.ok===false)return res.status(409).json({...data,contract_version:C.VERSION});
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
