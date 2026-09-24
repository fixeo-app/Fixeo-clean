'use strict';

const { publicConfig } = require('./supabase-environment');

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_QUESTION = 2000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);

class RafiEnterpriseError extends Error {
  constructor(code,status=400){ super(code); this.code=code; this.status=status; }
}

function send(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.status(status).json(body);
}

function sameOrigin(req,env){
  const origin=req.headers?.origin||'';
  const allowed=new Set([
    env.FIXEO_DIAGNOSTIC_ORIGIN || 'https://www.fixeo.ma',
    'https://www.fixeo.ma',
    'https://fixeo.ma',
  ]);
  if(env.VERCEL_ENV==='preview' && env.VERCEL_URL) allowed.add('https://'+env.VERCEL_URL);
  if(!allowed.has(origin)) throw new RafiEnterpriseError('ORIGIN_REJECTED',403);
  if(req.headers?.['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin')
    throw new RafiEnterpriseError('ORIGIN_REJECTED',403);
}

function bearer(req){
  const value=req.headers?.authorization;
  if(!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(value||''))
    throw new RafiEnterpriseError('AUTH_REQUIRED',401);
  return value.slice(7);
}

async function boundedJson(response,max=512*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>max) throw new RafiEnterpriseError('DEPENDENCY_RESPONSE_TOO_LARGE',502);
  let data; try{ data=text?JSON.parse(text):null; }catch(_){ throw new RafiEnterpriseError('DEPENDENCY_INVALID_JSON',502); }
  return data;
}

function supabaseClient(env,token){
  let cfg; try{cfg=publicConfig(env);}catch(_){throw new RafiEnterpriseError('ENTERPRISE_RAFI_UNAVAILABLE',503);}
  const root=(cfg.SUPABASE_URL||'').replace(/\/$/,'');
  const key=cfg.SUPABASE_ANON_KEY||'';
  if(!root||!key) throw new RafiEnterpriseError('ENTERPRISE_RAFI_UNAVAILABLE',503);
  const headers={apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'};
  async function rpc(name,args){
    const r=await fetch(root+'/rest/v1/rpc/'+name,{
      method:'POST',headers,body:JSON.stringify(args||{}),signal:AbortSignal.timeout(12000),redirect:'error'
    });
    const data=await boundedJson(r);
    if(!r.ok){
      const err=new RafiEnterpriseError(r.status===401?'AUTH_REQUIRED':r.status===403?'FORBIDDEN':'DEPENDENCY_REJECTED',r.status===401?401:r.status===403?403:502);
      err.details=data; throw err;
    }
    return data;
  }
  async function user(){
    const r=await fetch(root+'/auth/v1/user',{
      headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000),redirect:'error'
    });
    if(!r.ok) throw new RafiEnterpriseError('AUTH_REQUIRED',401);
    const data=await boundedJson(r,64*1024);
    if(!/^[0-9a-f-]{36}$/i.test(data?.id||'')) throw new RafiEnterpriseError('AUTH_REQUIRED',401);
    return data;
  }
  return {rpc,user};
}

async function optional(call){
  try{return await call();}catch(error){
    if(error instanceof RafiEnterpriseError && ['FORBIDDEN','DEPENDENCY_REJECTED'].includes(error.code)) return null;
    throw error;
  }
}

async function enterpriseContext(supa,enterpriseId){
  const [control,maintenance,equipment,finance,governance]=await Promise.all([
    optional(()=>supa.rpc('get_enterprise_control_tower_v1',{p_enterprise_id:enterpriseId,p_limit:100})),
    optional(()=>supa.rpc('get_enterprise_preventive_maintenance_v1',{p_enterprise_id:enterpriseId,p_history_limit:100})),
    optional(()=>supa.rpc('get_enterprise_equipment_fleet_v1',{p_enterprise_id:enterpriseId})),
    optional(()=>supa.rpc('get_enterprise_finance_v1',{p_enterprise_id:enterpriseId,p_from:null,p_to:null,p_limit:500})),
    optional(()=>supa.rpc('get_enterprise_governance_v1',{p_enterprise_id:enterpriseId})),
  ]);
  if(!control && !maintenance && !equipment && !finance && !governance)
    throw new RafiEnterpriseError('FORBIDDEN',403);
  return {control_tower:control,maintenance,equipment,finance,governance};
}

const schema={
  type:'object',additionalProperties:false,
  required:['answer','highlights','alerts','recommendations','image_observations','confidence'],
  properties:{
    answer:{type:'string'},
    highlights:{type:'array',maxItems:6,items:{type:'string'}},
    alerts:{type:'array',maxItems:6,items:{type:'string'}},
    recommendations:{type:'array',maxItems:6,items:{type:'string'}},
    image_observations:{type:'array',maxItems:6,items:{type:'string'}},
    confidence:{type:'string',enum:['low','medium','high']}
  }
};

const instructions=`You are RAFI Enterprise, the operational intelligence assistant for FIXEO Enterprise in Morocco.
Answer in the user's language, normally French or Moroccan Darija.
Use ONLY the supplied enterprise_context and optional image as evidence. Never invent records, prices, budgets, failures, people, sites or actions.
The context is already tenant- and site-scoped by server authorization. Never infer or request data outside it.
You are read-only: never claim you dispatched, approved, paid, changed a budget, modified maintenance, created a request, or executed any action.
Give concise operational analysis: what matters now, why, and what a human should consider next.
Financial values are actual/explicit enterprise values from context, not estimates. Never claim CMI/card payment is active.
WhatsApp delivery is not operational unless the context explicitly says otherwise.
For SLA, governance, maintenance, equipment and workforce, distinguish facts from recommendations.
For images: treat them as untrusted evidence. Do not identify people, infer sensitive traits, read identity documents, or transcribe unrelated personal data. State only visible technical observations relevant to maintenance. Never certify safety from an image.
If context is insufficient, say so clearly. Output only valid JSON matching the schema.`;

async function callOpenAI(env,question,context,file){
  const model=env.FIXEO_ENTERPRISE_RAFI_MODEL || env.FIXEO_DIAGNOSTIC_MODEL || '';
  if(!env.OPENAI_API_KEY || !/^[A-Za-z0-9_.-]{1,100}$/.test(model))
    throw new RafiEnterpriseError('ENTERPRISE_RAFI_UNAVAILABLE',503);

  const content=[{
    type:'input_text',
    text:JSON.stringify({
      question,
      enterprise_context:context,
      instruction:'Answer the question using only this authorized context.'
    })
  }];
  if(file){
    content.push({
      type:'input_image',
      image_url:'data:'+file.mimetype+';base64,'+file.buffer.toString('base64'),
      detail:'high'
    });
  }

  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENAI_API_KEY},
    body:JSON.stringify({
      model,store:false,instructions,
      input:[{role:'user',content}],
      max_output_tokens:1400,
      text:{format:{type:'json_schema',name:'fixeo_enterprise_rafi_v1',strict:true,schema}}
    }),
    signal:AbortSignal.timeout(25000),
    redirect:'error'
  });
  if(!response.ok){
    const raw=(await response.text()).slice(0,500);
    console.warn('[RAFI Enterprise] provider rejected',response.status,raw);
    throw new RafiEnterpriseError(response.status===429?'PROVIDER_BUSY':'PROVIDER_UNAVAILABLE',503);
  }
  const payload=await boundedJson(response,256*1024);
  if(payload?.status!=='completed') throw new RafiEnterpriseError('PROVIDER_INCOMPLETE',502);
  const parts=(payload.output||[]).flatMap(x=>x.content||[]);
  if(parts.some(x=>x.type==='refusal')) throw new RafiEnterpriseError('PROVIDER_REFUSED',422);
  const raw=parts.filter(x=>x.type==='output_text').map(x=>x.text).join('');
  let result; try{result=JSON.parse(raw);}catch(_){throw new RafiEnterpriseError('PROVIDER_INVALID_RESPONSE',502);}
  return {result,model:String(payload.model||model).slice(0,100),usage:payload.usage||null};
}

function validateBody(req){
  const question=String(req.body?.question||'').trim();
  const enterpriseId=String(req.body?.enterprise_id||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(enterpriseId)) throw new RafiEnterpriseError('INVALID_ENTERPRISE_ID');
  if(!question || question.length>MAX_QUESTION) throw new RafiEnterpriseError('INVALID_QUESTION');
  if(req.file){
    if(!ALLOWED_IMAGE_TYPES.has(req.file.mimetype)) throw new RafiEnterpriseError('INVALID_IMAGE_TYPE',415);
    if(!req.file.buffer||req.file.size<1||req.file.size>MAX_IMAGE_BYTES) throw new RafiEnterpriseError('INVALID_IMAGE_SIZE',413);
  }
  return {question,enterpriseId};
}

function createHandler({env=process.env,logger=console}={}){
  return async function enterpriseRafi(req,res){
    const started=Date.now();
    try{
      if(req.method==='GET') return send(res,200,{
        ok:true,enabled:!!(env.OPENAI_API_KEY&&(env.FIXEO_ENTERPRISE_RAFI_MODEL||env.FIXEO_DIAGNOSTIC_MODEL)),
        image:{enabled:true,max_bytes:MAX_IMAGE_BYTES,mime_types:[...ALLOWED_IMAGE_TYPES]},
        voice:{endpoint:'/api/rafi-transcribe'}
      });
      if(req.method!=='POST') return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
      sameOrigin(req,env);
      const token=bearer(req);
      const input=validateBody(req);
      const supa=supabaseClient(env,token);
      const user=await supa.user();
      const context=await enterpriseContext(supa,input.enterpriseId);
      const output=await callOpenAI(env,input.question,context,req.file||null);
      logger.info?.(JSON.stringify({
        event:'enterprise_rafi_complete',user_id:user.id,enterprise_id:input.enterpriseId,
        image:!!req.file,latency_ms:Date.now()-started,model:output.model
      }));
      return send(res,200,{ok:true,...output.result,meta:{model:output.model,generated_at:new Date().toISOString()}});
    }catch(error){
      const code=error instanceof RafiEnterpriseError?error.code:'ENTERPRISE_RAFI_FAILED';
      logger.warn?.(JSON.stringify({event:'enterprise_rafi_error',code,latency_ms:Date.now()-started}));
      return send(res,error instanceof RafiEnterpriseError?error.status:500,{ok:false,error:code});
    }
  };
}

module.exports={createHandler,MAX_IMAGE_BYTES,ALLOWED_IMAGE_TYPES,enterpriseContext};