'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const h=require('./http.cjs'),p=require('./preview.cjs');
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
const denied=(r,pattern)=>{assert.ok(r.status>=400||r.data?.ok===false,'MUST_BE_DENIED');if(pattern)assert.match(r.data?.code||r.data?.message||r.data?.reason||'',pattern);return r.data;};
async function preview(capability,target,payload={},actor='admin'){return ok(await p.control('action/preview',{capability,target_id:target,payload:{reason:'Synthetic authenticated certification',...payload}},actor));}
async function execute(ticket,actor='admin',key=h.randomId()){return p.control('action/execute',{preview_id:ticket.preview_id,confirmed:true,idempotency_key:key},actor);}
async function command(capability,target,payload={},actor='admin'){const result=await execute(await preview(capability,target,payload,actor),actor);if(result.status===409&&result.data?.ok===false)return result.data;return ok(result);}
async function createRequest(label='SYNTHETIC_RUNTIME'){
 return ok(await h.rpc('client','create_my_service_request_v1',{p_service_category:'plomberie',p_city:'Fès',p_description:label,p_idempotency_key:h.randomId()}));
}
async function submitQuote(request,price=1000,actor='artisan',scope='SYNTHETIC_REPAIR_SCOPE'){
 return ok(await h.rpc(actor,'submit_artisan_quote_v2',{p_request_id:request.id,p_proposed_price:price,p_service_description:scope,p_supplies_description:'Synthetic supplied parts',p_estimated_duration:'1 hour',p_message:null}));
}
async function completedMission(label='SYNTHETIC_COMPLETED'){
 const request=await createRequest(label),quote=await submitQuote(request);await command('quote.approve',quote.id,{version:quote.quote_version});
 const mission=ok(await h.rpc('client','accept_quote_v2',{p_quote_id:quote.id}));
 assert.equal(ok(await h.rpc('artisan','start_mission',{p_mission_id:mission.id})).ok,true);
 assert.equal(ok(await h.rpc('artisan','complete_mission',{p_mission_id:mission.id})).ok,true);
 return {request,quote,mission};
}
async function run(suite,tests){
 const results=[];const selected=process.argv[2];
 for(const [name,fn] of tests){if(selected&&!selected.split('|').some(x=>name.includes(x)))continue;const started=Date.now();try{await fn();results.push({name,status:'PASS',duration_ms:Date.now()-started});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message,duration_ms:Date.now()-started});console.log('FAIL '+name+': '+e.message);}}
 const out={suite,project_ref:h.REF,preview:p.previewUrl,completed_at:new Date().toISOString(),results,pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length,skip:0};
 const suffix=selected?'-focused-'+require('node:crypto').createHash('sha256').update(selected).digest('hex').slice(0,8):'';
 fs.writeFileSync(path.join(process.env.FIXEO_STAGING_EVIDENCE_DIR,`bloc1-staging-${suite}${suffix}.json`),JSON.stringify(out,null,2));
 console.log(JSON.stringify({suite,pass:out.pass,fail:out.fail,skip:0}));if(out.fail)process.exitCode=1;
}
module.exports={...h,...p,ok,denied,preview,execute,command,createRequest,submitQuote,completedMission,run,assert};
