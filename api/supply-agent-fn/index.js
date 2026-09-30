'use strict';

const { timingSafeEqual } = require('node:crypto');
const { assertServerTarget } = require('../supabase-environment');

const SUPABASE_TIMEOUT_MS = 15000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function flag(value){ return String(value||'').trim().toLowerCase()==='true'; }
function safeEqual(actual,expected){
  const a=Buffer.from(String(actual||'')),b=Buffer.from(String(expected||''));
  return a.length===b.length && timingSafeEqual(a,b);
}
function uuid(value){ return UUID_RE.test(String(value||'')); }
function bodyObject(req){ return req.body && typeof req.body==='object' && !Array.isArray(req.body) ? req.body : {}; }

async function rpc(url,key,name,args){
  const response=await fetch(String(url).replace(/\/$/,'')+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(args||{}),
    signal:AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
  });
  const text=await response.text();
  let data=null; try{data=text?JSON.parse(text):null;}catch(_){}
  if(!response.ok){
    const error=new Error('RPC_'+name+'_FAILED');
    error.status=response.status;
    throw error;
  }
  return data;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  }
  if(!flag(process.env.SUPPLY_AGENT_API_ENABLED)){
    return res.status(503).json({ok:false,error:'SUPPLY_AGENT_RUNTIME_DISABLED'});
  }
  const secret=String(process.env.SUPPLY_AGENT_API_SECRET||'');
  if(secret.length<32) return res.status(503).json({ok:false,error:'SUPPLY_AGENT_SECRET_MISSING'});
  if(!safeEqual(req.headers.authorization,'Bearer '+secret)){
    return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
  }
  if(Object.keys(req.query||{}).length) return res.status(400).json({ok:false,error:'NO_QUERY_PARAMETERS_ALLOWED'});
  const supabaseUrl=String(process.env.SUPABASE_URL||'');
  const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!supabaseUrl||!serviceKey) return res.status(503).json({ok:false,error:'SERVER_CONFIGURATION_MISSING'});

  try{
    assertServerTarget();
    const b=bodyObject(req);
    const op=String(b.operation||'').trim();
    const input=b.input&&typeof b.input==='object'&&!Array.isArray(b.input)?b.input:{};
    let result;

    switch(op){
      case 'begin_run':
        if(!uuid(input.agent_id)) return res.status(400).json({ok:false,error:'INVALID_AGENT_ID'});
        result=await rpc(supabaseUrl,serviceKey,'supply_agent_begin_run_v1',{
          p_agent_id:input.agent_id,p_campaign_id:uuid(input.campaign_id)?input.campaign_id:null
        });
        break;
      case 'lease_work':
        if(!uuid(input.agent_id)) return res.status(400).json({ok:false,error:'INVALID_AGENT_ID'});
        result=await rpc(supabaseUrl,serviceKey,'supply_lease_work_v1',{
          p_worker:input.agent_id,p_limit:Number(input.limit)||5,p_lease_seconds:Number(input.lease_seconds)||300
        });
        break;
      case 'task_brief':
        if(!uuid(input.agent_id)||!uuid(input.run_id)||!uuid(input.task_id))
          return res.status(400).json({ok:false,error:'INVALID_TASK_IDENTIFIERS'});
        result=await rpc(supabaseUrl,serviceKey,'supply_agent_task_brief_v1',{
          p_agent_id:input.agent_id,p_run_id:input.run_id,p_task_id:input.task_id
        });
        break;
      case 'rules_decision':
        if(!uuid(input.agent_id)||!uuid(input.run_id)||!uuid(input.task_id))
          return res.status(400).json({ok:false,error:'INVALID_TASK_IDENTIFIERS'});
        result=await rpc(supabaseUrl,serviceKey,'supply_agent_rules_decision_v1',{
          p_agent_id:input.agent_id,p_run_id:input.run_id,p_task_id:input.task_id
        });
        break;
      case 'action':
        if(!uuid(input.agent_id)||!uuid(input.run_id)||!uuid(input.task_id)||!uuid(input.idempotency_key))
          return res.status(400).json({ok:false,error:'INVALID_ACTION_IDENTIFIERS'});
        result=await rpc(supabaseUrl,serviceKey,'supply_agent_action_v1',{
          p_agent_id:input.agent_id,p_run_id:input.run_id,p_task_id:input.task_id,
          p_action_type:String(input.action_type||''),p_payload:input.payload||{},p_idempotency_key:input.idempotency_key
        });
        break;
      case 'complete_work':
        if(!uuid(input.task_id)||!uuid(input.lease_token)) return res.status(400).json({ok:false,error:'INVALID_TASK_IDENTIFIERS'});
        result=await rpc(supabaseUrl,serviceKey,'supply_complete_work_v1',{
          p_task_id:input.task_id,p_lease_token:input.lease_token,p_status:String(input.status||''),
          p_result:input.result||null,p_error:input.error||null
        });
        break;
      case 'record_usage':
        if(!uuid(input.agent_id)||!uuid(input.run_id)||!uuid(input.idempotency_key))
          return res.status(400).json({ok:false,error:'INVALID_USAGE_IDENTIFIERS'});
        result=await rpc(supabaseUrl,serviceKey,'supply_agent_record_ai_usage_v1',{
          p_agent_id:input.agent_id,p_run_id:input.run_id,p_task_id:uuid(input.task_id)?input.task_id:null,
          p_purpose_code:String(input.purpose_code||''),p_model_tier:String(input.model_tier||''),
          p_model_name:input.model_name||null,p_input_units:Number(input.input_units)||0,
          p_output_units:Number(input.output_units)||0,p_cached_units:Number(input.cached_units)||0,
          p_estimated_cost_minor:Number(input.estimated_cost_minor)||0,p_latency_ms:Number.isFinite(Number(input.latency_ms))?Number(input.latency_ms):null,
          p_escalation_from:input.escalation_from||null,p_outcome_code:input.outcome_code||null,
          p_idempotency_key:input.idempotency_key
        });
        break;
      case 'learning_cycle':
        result=await rpc(supabaseUrl,serviceKey,'supply_learning_cycle_v1',{});
        break;
      case 'national_plan':
        result=await rpc(supabaseUrl,serviceKey,'supply_national_plan_v1',{});
        break;
      case 'national_orchestrate':
        result=await rpc(supabaseUrl,serviceKey,'supply_national_orchestrate_v1',{});
        break;
      case 'national_provider_gate':
        result=await rpc(supabaseUrl,serviceKey,'supply_national_provider_gate_v1',{});
        break;
      case 'channel_peek':
        result=await rpc(supabaseUrl,serviceKey,'supply_channel_peek_v1',{p_channel:String(input.channel||'WHATSAPP')});
        break;
      case 'channel_claim':
        result=await rpc(supabaseUrl,serviceKey,'supply_channel_claim_next_v1',{
          p_channel:String(input.channel||'WHATSAPP'),p_worker:String(input.worker||'supply-channel')
        });
        break;
      case 'channel_finalize':
        if(!uuid(input.outbox_id)) return res.status(400).json({ok:false,error:'INVALID_OUTBOX_ID'});
        result=await rpc(supabaseUrl,serviceKey,'supply_channel_finalize_v1',{
          p_outbox_id:input.outbox_id,p_status:String(input.status||''),
          p_provider_message_id:input.provider_message_id||null,p_error:input.error||null,
          p_channel_cost_minor:Number(input.channel_cost_minor)||0
        });
        break;
      case 'process_whatsapp_inbound':
        if(!uuid(input.inbound_id)) return res.status(400).json({ok:false,error:'INVALID_INBOUND_ID'});
        result=await rpc(supabaseUrl,serviceKey,'supply_process_whatsapp_inbound_v1',{p_inbound_id:input.inbound_id});
        break;
      default:
        return res.status(400).json({ok:false,error:'OPERATION_NOT_ALLOWED'});
    }
    return res.status(200).json({ok:true,operation:op,result});
  }catch(error){
    console.error('[FIXEO Supply Agent] unavailable',error&&error.message?error.message:'unknown');
    return res.status(502).json({ok:false,error:'SUPPLY_AGENT_RUNTIME_UNAVAILABLE'});
  }
};

module.exports.__test={flag,safeEqual,uuid};
