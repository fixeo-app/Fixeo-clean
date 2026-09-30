'use strict';
const { timingSafeEqual }=require('node:crypto');
const { assertServerTarget }=require('../supabase-environment');
function eq(a,b){a=Buffer.from(String(a||''));b=Buffer.from(String(b||''));return a.length===b.length&&timingSafeEqual(a,b);}
async function rpc(url,key){
 const r=await fetch(String(url).replace(/\/$/,'')+'/rest/v1/rpc/supply_learning_cycle_v1',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
 const t=await r.text();let d=null;try{d=t?JSON.parse(t):null;}catch(_){}
 if(!r.ok)throw new Error('LEARNING_RPC_FAILED');return d;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const secret=String(process.env.CRON_SECRET||'');
 if(secret.length<16||!eq(req.headers.authorization,'Bearer '+secret))return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
 const url=String(process.env.SUPABASE_URL||''),key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!url||!key)return res.status(503).json({ok:false,error:'SERVER_CONFIGURATION_MISSING'});
 try{assertServerTarget();const result=await rpc(url,key);return res.status(result&&result.ok===false?409:200).json({ok:true,result});}
 catch(e){return res.status(500).json({ok:false,error:e&&e.message||'LEARNING_CYCLE_FAILED'});}
};
module.exports.__test={eq};
