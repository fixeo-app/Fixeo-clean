'use strict';

const { publicConfig } = require('./supabase-environment');
const { normalizeActions } = require('./enterprise-rafi-actions');

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
  async function sites(enterpriseId){
    const q=new URLSearchParams({select:'id,name,site_code,city,status',enterprise_id:'eq.'+enterpriseId,status:'eq.active',order:'id.asc',limit:'50'});
    const r=await fetch(root+'/rest/v1/enterprise_sites?'+q.toString(),{headers,signal:AbortSignal.timeout(8000),redirect:'error'});
    const data=await boundedJson(r,128*1024);if(!r.ok)throw new RafiEnterpriseError(r.status===403?'FORBIDDEN':'DEPENDENCY_REJECTED',r.status===403?403:502);return Array.isArray(data)?data:[];
  }
  return {rpc,user,sites};
}

async function optional(call){
  try{return await call();}catch(error){
    if(error instanceof RafiEnterpriseError && ['FORBIDDEN','DEPENDENCY_REJECTED'].includes(error.code)) return null;
    throw error;
  }
}

function compactContext(raw){
  function arr(v,n){return Array.isArray(v)?v.slice(0,n):[];}
  const context={
    sites:arr(raw.sites,50).map(s=>({id:s.id,name:s.name,site_code:s.site_code,city:s.city,status:s.status})),
    control_tower:raw.control_tower?{
      summary:raw.control_tower.summary||{},
      attention:arr(raw.control_tower.attention,60),
      site_load:arr(raw.control_tower.site_load,50),
      worker_load:arr(raw.control_tower.worker_load,50)
    }:null,
    maintenance:raw.maintenance?{
      summary:raw.maintenance.summary||{},
      plans:arr(raw.maintenance.plans,60),
      runs:arr(raw.maintenance.runs,40)
    }:null,
    equipment:raw.equipment?{
      summary:raw.equipment.summary||{},
      equipment:arr(raw.equipment.equipment,100)
    }:null,
    finance:raw.finance?{
      summary:raw.finance.summary||{},
      rows:arr(raw.finance.rows,100),
      cost_centers:arr(raw.finance.cost_centers,80),
      budgets:arr(raw.finance.budgets,80),
      purchase_orders:arr(raw.finance.purchase_orders,80),
      worker_rates:arr(raw.finance.worker_rates,50)
    }:null,
    governance:raw.governance?{
      role:raw.governance.role||'',
      pending_for_me:Number(raw.governance.pending_for_me)||0,
      policies:arr(raw.governance.policies,50),
      cases:arr(raw.governance.cases,80)
    }:null
  };
  if(Buffer.byteLength(JSON.stringify(context))>220000){
    if(context.control_tower){context.control_tower.attention=context.control_tower.attention.slice(0,25);context.control_tower.worker_load=context.control_tower.worker_load.slice(0,25);}
    if(context.maintenance){context.maintenance.plans=context.maintenance.plans.slice(0,25);context.maintenance.runs=context.maintenance.runs.slice(0,20);}
    if(context.equipment)context.equipment.equipment=context.equipment.equipment.slice(0,40);
    if(context.finance){context.finance.rows=context.finance.rows.slice(0,40);context.finance.cost_centers=context.finance.cost_centers.slice(0,30);context.finance.budgets=context.finance.budgets.slice(0,30);context.finance.purchase_orders=context.finance.purchase_orders.slice(0,30);}
    if(context.governance){context.governance.policies=context.governance.policies.slice(0,20);context.governance.cases=context.governance.cases.slice(0,30);}
  }
  return context;
}

async function enterpriseContext(supa,enterpriseId){
  await optional(()=>supa.rpc('reconcile_enterprise_rafi_followups_v1',{p_enterprise_id:enterpriseId}));
  const changes=await optional(()=>supa.rpc('capture_enterprise_rafi_changes_v1',{p_enterprise_id:enterpriseId}));
  const [sites,control,maintenance,equipment,finance,governance,followups]=await Promise.all([
    optional(()=>supa.sites(enterpriseId)),
    optional(()=>supa.rpc('get_enterprise_control_tower_v1',{p_enterprise_id:enterpriseId,p_limit:80})),
    optional(()=>supa.rpc('get_enterprise_preventive_maintenance_v1',{p_enterprise_id:enterpriseId,p_history_limit:80})),
    optional(()=>supa.rpc('get_enterprise_equipment_fleet_v1',{p_enterprise_id:enterpriseId})),
    optional(()=>supa.rpc('get_enterprise_finance_v1',{p_enterprise_id:enterpriseId,p_from:null,p_to:null,p_limit:200})),
    optional(()=>supa.rpc('get_enterprise_governance_v1',{p_enterprise_id:enterpriseId})),
    optional(()=>supa.rpc('get_enterprise_rafi_followups_v1',{p_enterprise_id:enterpriseId})),
  ]);
  if(!control && !maintenance && !equipment && !finance && !governance && !followups)
    throw new RafiEnterpriseError('FORBIDDEN',403);
  const context=compactContext({sites,control_tower:control,maintenance,equipment,finance,governance});
  context.followups=followups&&followups.ok===true&&Array.isArray(followups.followups)?followups.followups.slice(0,60):[];
  context.operational_changes=changes&&changes.ok===true&&Array.isArray(changes.changes)?changes.changes.slice(0,60):[];
  return context;
}

const schema={
  type:'object',additionalProperties:false,
  required:['answer','highlights','alerts','recommendations','image_observations','confidence','action_proposals'],
  properties:{
    answer:{type:'string'},
    highlights:{type:'array',maxItems:6,items:{type:'string'}},
    alerts:{type:'array',maxItems:6,items:{type:'string'}},
    recommendations:{type:'array',maxItems:6,items:{type:'string'}},
    image_observations:{type:'array',maxItems:6,items:{type:'string'}},
    confidence:{type:'string',enum:['low','medium','high']},
    action_proposals:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['type','title','summary','target','params','impact'],properties:{type:{type:'string',enum:['create_governed_request','propose_internal_assignment','propose_hybrid_dispatch','decide_approval','upsert_control_tower_escalation','prepare_maintenance_action']},title:{type:'string'},summary:{type:'string'},target:{type:'object',additionalProperties:false,required:['enterprise_id','site_id','request_id','case_id','plan_id','member_id'],properties:{enterprise_id:{type:['string','null']},site_id:{type:['string','null']},request_id:{type:['string','null']},case_id:{type:['string','null']},plan_id:{type:['string','null']},member_id:{type:['string','null']}}},params:{type:'object',additionalProperties:false,required:['service_category','description','urgency','requested_amount','decision','note','status'],properties:{service_category:{type:['string','null']},description:{type:['string','null']},urgency:{type:['string','null']},requested_amount:{type:['number','null']},decision:{type:['string','null']},note:{type:['string','null']},status:{type:['string','null']}}},impact:{type:'string'}}}}
  }
};

const instructions=`You are RAFI Enterprise, the operational intelligence assistant for FIXEO Enterprise in Morocco.
Answer in the user's language, normally French or Moroccan Darija.
Use ONLY the supplied enterprise_context and optional image as evidence. Never invent records, prices, budgets, failures, people, sites or actions.
The context is already tenant- and site-scoped by server authorization. Never infer or request data outside it.
You are read-only until a human confirms an action proposal: never claim you dispatched, approved, paid, changed a budget, modified maintenance, created a request, or executed any action. You may prepare supported actions for explicit human confirmation; do not say the system cannot create an intervention when a valid create_governed_request proposal can be prepared.
You may return up to 3 action_proposals when a concrete next action would help. A proposal is only a draft for human review: it never executes anything. Use only the allowed action types in the schema. Include only identifiers and parameters supported by enterprise_context; never invent IDs. For create_governed_request, resolve the requested active site from enterprise_context.sites and include its exact site_id; if the site cannot be resolved unambiguously, do not propose the action. Never propose create_governed_request as a follow-up for an incident when enterprise_context already contains an active service_request matching that same site/service/incident; recommend monitoring, escalation, retry dispatch or internal assignment using the existing request_id instead. Do not create duplicate requests merely for suivi/follow-up. Keep target and params minimal. If no safe concrete action is supported, return an empty action_proposals array.
Give concise operational analysis: what matters now, why, and what a human should consider next.
Financial values are actual/explicit enterprise values from context, not estimates. Never claim CMI/card payment is active.
WhatsApp delivery is not operational unless the context explicitly says otherwise.
For SLA, governance, maintenance, equipment and workforce, distinguish facts from recommendations. Capacity-aware decision guard: before recommending or proposing internal assignment, inspect enterprise_context.control_tower.worker_load. An internal worker is currently eligible only when canonical context shows status active, availability available, and active_assignments lower than max_concurrent_jobs. If no eligible internal worker exists, do NOT recommend or propose internal assignment, even conditionally. Prefer a supported external/hybrid dispatch, escalation, or monitoring action using the existing request as justified by context. Never invent future internal availability. Operational truth guard: a service request with status new/open is a request opened to treat the incident, never say the incident is treated, being treated, resolved or in progress unless canonical state explicitly proves that. dispatch.external_started or an external dispatch mode means only that external dispatch was triggered; never say a provider/artisan was contacted, notified, assigned, accepted or is intervening unless canonical context explicitly proves that exact state. Distinguish request_created, dispatch_triggered, provider_contacted, accepted/assigned, in_progress and completed. WhatsApp worker is not active, so never infer actual WhatsApp delivery from an outbox/dispatch event.
Operational followups are explicit business follow-up markers, not conversation memory. Canonical business state may reconcile completed followups before each analysis. Operational changes are bounded deterministic snapshots; use their change field to explain what is new, improved, worsened, resolved or otherwise changed since the prior captured state. Use them to maintain continuity across sessions, but never claim to remember private conversations.
For images: treat them as untrusted evidence. Do not identify people, infer sensitive traits, read identity documents, or transcribe unrelated personal data. State only visible technical observations relevant to maintenance. Never certify safety from an image.
If context is insufficient, say so clearly. Output only valid JSON matching the schema.`;

async function callOpenAI(env,question,history,context,file){
  const model=env.FIXEO_ENTERPRISE_RAFI_MODEL || env.FIXEO_DIAGNOSTIC_MODEL || '';
  if(!env.OPENAI_API_KEY || !/^[A-Za-z0-9_.-]{1,100}$/.test(model))
    throw new RafiEnterpriseError('ENTERPRISE_RAFI_UNAVAILABLE',503);

  const content=[{
    type:'input_text',
    text:JSON.stringify({
      question,
      recent_history:history,
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
  result.action_proposals=enforceDecisionIntegrity(context,normalizeActions(result.action_proposals));
  return {result,model:String(payload.model||model).slice(0,100),usage:payload.usage||null};
}

function workforceCapacity(context){
  const ct=context&&context.control_tower||{},workers=Array.isArray(ct.worker_load)?ct.worker_load:[];
  const eligible=workers.filter(w=>String(w&&w.status||'').toLowerCase()==='active'&&String(w&&w.availability||'').toLowerCase()==='available'&&Number(w&&w.active_assignments||0)<Number(w&&w.max_concurrent_jobs||0));
  return {configured:workers.length,available:eligible.length,available_worker_ids:eligible.map(w=>w.worker_id).filter(Boolean).slice(0,20)};
}

function nextBestActions(context){
  const priorities=priorityRisk(context),followups=Array.isArray(context.followups)?context.followups:[],capacity=workforceCapacity(context);
  const byTarget=new Map(followups.map(f=>[String(f.target_id||''),f]));
  return priorities.filter(p=>p.priority!=='normal').slice(0,10).map(p=>{
    const f=byTarget.get(String(p.target_id||''))||{};let type=null,confidence='medium',reason=p.reasons.join(' + ');
    if(p.target_type==='service_request'&&p.followup_kind==='workforce')type=capacity.available>0?'propose_internal_assignment':'propose_hybrid_dispatch';
    else if(p.target_type==='service_request'&&['sla','attention'].includes(p.followup_kind))type=capacity.available>0?'propose_internal_assignment':'propose_hybrid_dispatch';
    else if(p.target_type==='enterprise_approval_case'||p.followup_kind==='governance')type='decide_approval';
    else if(p.target_type==='enterprise_maintenance_plan'||p.followup_kind==='maintenance')type='prepare_maintenance_action';
    else if(p.target_type==='service_request'&&p.priority==='critical')type='upsert_control_tower_escalation';
    if(!type)return null;
    if(p.priority==='critical'&&p.change==='worsened')confidence='high';
    if(type==='propose_internal_assignment'&&capacity.available<1)return null;
    if(type==='propose_hybrid_dispatch'&&capacity.available<1)reason+=(reason?' + ':'')+'aucune_capacite_interne_disponible';
    return {action_type:type,target_type:p.target_type,target_id:p.target_id,priority:p.priority,reason,expected_impact:type==='decide_approval'?'debloquer le workflow de gouvernance':'reduire le risque operationnel',confidence,requires_confirmation:true};
  }).filter(Boolean).slice(0,5);
}

function enforceDecisionIntegrity(context,actions){
  const allowed=nextBestActions(context);
  const allowedByKey=new Set(allowed.map(a=>String(a.action_type||'')+'|'+String(a.target_id||'')));
  const capacity=workforceCapacity(context);
  return (Array.isArray(actions)?actions:[]).filter(action=>{
    if(!action||!action.type)return false;
    if(action.type==='propose_internal_assignment'&&capacity.available<1)return false;
    const target=action.target&&typeof action.target==='object'?action.target:{};
    const targetId=target.request_id||target.case_id||target.plan_id||'';
    return allowedByKey.has(String(action.type)+'|'+String(targetId));
  }).slice(0,3);
}

function priorityRisk(context){
  const rows=Array.isArray(context.operational_changes)?context.operational_changes:[];
  const changeWeight={worsened:4,new:3,changed:2,unchanged:0,improved:-1,resolved:-4};
  return rows.slice(0,60).map(x=>{
    const reasons=[];let score=Math.max(0,Math.min(4,Number(x.severity)||0));
    if(x.change==='worsened'){score+=4;reasons.push('situation_aggravee');}
    else if(x.change==='new'){score+=3;reasons.push('nouveau_sujet');}
    else if(x.change==='changed'){score+=2;reasons.push('etat_modifie');}
    else if(x.change==='improved'){score=Math.max(0,score-1);reasons.push('amelioration');}
    else if(x.change==='resolved'){score=0;reasons.push('resolu');}
    if(x.followup_kind==='sla'){score+=4;reasons.push('risque_sla');}
    if(x.followup_kind==='governance'){score+=2;reasons.push('attente_gouvernance');}
    if(['maintenance','equipment'].includes(x.followup_kind)){score+=2;reasons.push('risque_actif');}
    const priority=score>=8?'critical':score>=5?'high':'normal';
    return {priority,score,change:x.change,followup_kind:x.followup_kind,target_type:x.target_type,target_id:x.target_id,reasons:reasons.slice(0,4)};
  }).sort((a,b)=>b.score-a.score).slice(0,20);
}

function deltaSummary(context){
  const rows=Array.isArray(context.operational_changes)?context.operational_changes:[];
  const order={worsened:0,new:1,changed:2,unchanged:3,improved:4,resolved:5};
  const sorted=rows.slice(0,60).sort((a,b)=>(order[a.change]??9)-(order[b.change]??9));
  const counts={new:0,worsened:0,changed:0,unchanged:0,improved:0,resolved:0};
  sorted.forEach(x=>{if(Object.hasOwn(counts,x.change))counts[x.change]++;});
  return {counts,items:sorted.slice(0,20).map(x=>({change:x.change,followup_kind:x.followup_kind,target_type:x.target_type,target_id:x.target_id,state_key:x.state_key,severity:x.severity}))};
}

function proactiveQuestion(context){
  const parts=[];
  const ct=context.control_tower&&context.control_tower.summary||{};
  const mt=context.maintenance&&context.maintenance.summary||{};
  const eq=context.equipment&&context.equipment.summary||{};
  const fn=context.finance&&context.finance.summary||{};
  const gv=context.governance||{};
  const delta=deltaSummary(context);
  const priorities=priorityRisk(context);
  const nextActions=nextBestActions(context);
  const capacity=workforceCapacity(context);
  parts.push('Construis le briefing opérationnel priorisé du responsable Enterprise.');
  parts.push('Commence par un DELTA depuis le dernier état capturé: aggravations, nouveaux sujets, autres changements, puis améliorations et résolutions. Ne présente pas unchanged comme une nouveauté.');
  parts.push('Delta déterministe: '+JSON.stringify(delta));
  parts.push('Priorités déterministes et raisons explicables: '+JSON.stringify(priorities)+'. Respecte cet ordre de priorité; ne transforme jamais ce classement en exécution autonome.');
  parts.push('Capacité workforce canonique: '+JSON.stringify(capacity)+'. N\'émets aucune recommandation ou proposition d\'assignation interne si available=0.');
  parts.push('Next Best Actions déterministes: '+JSON.stringify(nextActions)+'. Elles sont des recommandations uniquement. Si tu émets action_proposals, elles doivent correspondre à ces recommandations, utiliser uniquement les identifiants réellement présents dans enterprise_context et rester soumises à confirmation humaine.');
  parts.push('Classe uniquement les éléments réellement présents dans le contexte selon urgence SLA, blocage opérationnel, maintenance/équipement, capacité workforce, gouvernance puis impact financier.');
  parts.push('Ne crée aucune action autonome. Si une action concrète sûre est justifiée, utilise action_proposals pour demander confirmation humaine.');
  parts.push('Indicateurs disponibles: '+JSON.stringify({control_tower:ct,maintenance:mt,equipment:eq,finance:fn,pending_for_me:Number(gv.pending_for_me)||0,open_followups:Array.isArray(context.followups)?context.followups.length:0,operational_changes:Array.isArray(context.operational_changes)?context.operational_changes.length:0}));
  return parts.join(' ');
}

function validateBody(req){
  let question=String(req.body?.question||'').trim();
  const mode=String(req.body?.mode||'ask').trim();
  const enterpriseId=String(req.body?.enterprise_id||'').trim();
  let history=req.body?.history||[];
  if(typeof history==='string'){
    try{history=JSON.parse(history);}catch(_){throw new RafiEnterpriseError('INVALID_HISTORY');}
  }
  if(!Array.isArray(history)||history.length>6) throw new RafiEnterpriseError('INVALID_HISTORY');
  history=history.map(item=>{
    if(!item||!['user','assistant'].includes(item.role)||typeof item.content!=='string'||item.content.length>1200)
      throw new RafiEnterpriseError('INVALID_HISTORY');
    return {role:item.role,content:item.content.trim()};
  });
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(enterpriseId)) throw new RafiEnterpriseError('INVALID_ENTERPRISE_ID');
  if(!['ask','briefing'].includes(mode)) throw new RafiEnterpriseError('INVALID_MODE');
  if(mode==='ask'&&(!question || question.length>MAX_QUESTION)) throw new RafiEnterpriseError('INVALID_QUESTION');
  if(mode==='briefing') question='__PROACTIVE_BRIEFING__';
  if(req.file){
    if(!ALLOWED_IMAGE_TYPES.has(req.file.mimetype)) throw new RafiEnterpriseError('INVALID_IMAGE_TYPE',415);
    if(!req.file.buffer||req.file.size<1||req.file.size>MAX_IMAGE_BYTES) throw new RafiEnterpriseError('INVALID_IMAGE_SIZE',413);
  }
  return {question,enterpriseId,history,mode};
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
      await supa.user();
      const context=await enterpriseContext(supa,input.enterpriseId);
      const question=input.mode==='briefing'?proactiveQuestion(context):input.question;
      const output=await callOpenAI(env,question,input.history,context,req.file||null);
      logger.info?.(JSON.stringify({
        event:'enterprise_rafi_complete',enterprise_id:input.enterpriseId,
        image:!!req.file,mode:input.mode,latency_ms:Date.now()-started,model:output.model
      }));
      return send(res,200,{ok:true,...output.result,meta:{model:output.model,generated_at:new Date().toISOString()}});
    }catch(error){
      const code=error instanceof RafiEnterpriseError?error.code:'ENTERPRISE_RAFI_FAILED';
      logger.warn?.(JSON.stringify({event:'enterprise_rafi_error',code,latency_ms:Date.now()-started}));
      return send(res,error instanceof RafiEnterpriseError?error.status:500,{ok:false,error:code});
    }
  };
}

module.exports={workforceCapacity,enforceDecisionIntegrity,createHandler,MAX_IMAGE_BYTES,ALLOWED_IMAGE_TYPES,enterpriseContext,proactiveQuestion,deltaSummary,priorityRisk,nextBestActions};