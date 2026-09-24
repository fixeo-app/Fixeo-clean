'use strict';
const {timingSafeEqual}=require('node:crypto');
const {assertServerTarget}=require('../supabase-environment');

// Vercel cron only. No browser payload, clock, recipient or event identifier accepted.
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  const secret=process.env.CRON_SECRET;
  if(!secret || secret.length<32)return res.status(503).json({ok:false,error:'SERVER_CONFIGURATION_MISSING'});
  const supplied=Buffer.from(String(req.headers.authorization||''));
  const expected=Buffer.from('Bearer '+secret);
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
  if(Object.keys(req.query||{}).length || (req.body && Object.keys(req.body).length))return res.status(400).json({ok:false,error:'NO_PARAMETERS_ALLOWED'});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key)return res.status(503).json({ok:false,error:'SERVER_CONFIGURATION_MISSING'});
  try{
    assertServerTarget();
    const response=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/publish_due_notification_alerts_s1b2',{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:'{}',signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)return res.status(502).json({ok:false,error:'NOTIFICATION_WORKER_FAILED'});
    const result=await response.json();
    if(result?.ok!==true || !Number.isInteger(result.inserted) || !Number.isInteger(result.closed))return res.status(502).json({ok:false,error:'INVALID_WORKER_RESPONSE'});

    const fallbackResponse=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/run_enterprise_dispatch_fallbacks_v1',{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:'{}',signal:AbortSignal.timeout(20000)
    });
    if(!fallbackResponse.ok)return res.status(502).json({ok:false,error:'ENTERPRISE_FALLBACK_WORKER_FAILED'});
    const fallback=await fallbackResponse.json();
    if(fallback?.ok!==true || !Number.isInteger(fallback.processed) || !Number.isInteger(fallback.failed))return res.status(502).json({ok:false,error:'INVALID_ENTERPRISE_FALLBACK_RESPONSE'});

    return res.status(200).json({
      ok:true,
      inserted:result.inserted,
      closed:result.closed,
      enterprise_fallback_processed:fallback.processed,
      enterprise_fallback_failed:fallback.failed
    });
  }catch(_){return res.status(502).json({ok:false,error:'NOTIFICATION_WORKER_UNAVAILABLE'});}
};
