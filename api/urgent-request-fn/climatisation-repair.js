'use strict';
const crypto=require('node:crypto');
const actions={climatisation_repair_read:'read',climatisation_repair_accept:'accept',climatisation_repair_decline:'decline'};
module.exports=async function climatisationRepair(body,res){
 const action=actions[body.action];
 const ref=String(body.tracking_ref||'').trim().toUpperCase(),token=String(body.guest_token||'');
 if(!action||!/^FX-[A-Z0-9]{4,24}$/.test(ref)||!/^[a-f0-9]{64}$/i.test(token))return res.status(400).json({ok:false,code:'INVALID_INPUT'});
 if(action!=='read'&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.proposal_id||'')||![0,26000].includes(body.diagnostic_paid_minor)||body.consent_version!=='climatisation-same-visit-v1'))return res.status(400).json({ok:false,code:'INVALID_CONSENT'});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({ok:false,code:'SERVICE_UNAVAILABLE'});
 res.setHeader('Cache-Control','no-store');
 try{
  const response=await fetch(url+'/rest/v1/rpc/climatisation_repair_guest_v1',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},body:JSON.stringify({p_tracking_ref:ref,p_guest_hash:crypto.createHash('sha256').update(token).digest('hex'),p_action:action,p_proposal_id:action==='read'?null:body.proposal_id,p_expected_paid_minor:action==='read'?null:body.diagnostic_paid_minor}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok)return res.status(result.code==='42501'?404:result.code==='22023'?409:503).json({ok:false,code:result.code==='42501'?'NOT_FOUND':'PROPOSAL_UNAVAILABLE'});
  return res.status(200).json({ok:true,repair:result});
 }catch{return res.status(503).json({ok:false,code:'SERVICE_UNAVAILABLE'});}
};
