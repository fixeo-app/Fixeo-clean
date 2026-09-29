'use strict';
// HTTP certification of the protected deployment with existing isolated Auth identities.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const h=require('./http.cjs');
const runtime=JSON.parse(fs.readFileSync(process.env.FIXEO_RAFI_PREVIEW_RUNTIME,'utf8'));
assert.match(runtime.url,/^https:\/\/fixeo-clean-[a-z0-9]+-elalaouibiz-3410s-projects\.vercel\.app$/);
const out=process.env.FIXEO_RAFI_EVIDENCE_FILE;if(!out)throw Error('EVIDENCE_PATH_REQUIRED');
const report={preview:runtime.url,sha:process.env.FIXEO_RAFI_CANDIDATE_SHA,environment:h.REF,started_at:new Date().toISOString(),production_mutated:false,checks:[],assets:[]};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function request(route,{actor=null,body,method='POST',headers={}}={}){
 if(actor)await h.ensureSession(actor);
 const r=await fetch(runtime.url+route,{method,headers:{Cookie:runtime.cookie,'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+h.sessions[actor].access_token}:{}),...headers},body:method==='GET'?undefined:JSON.stringify(body||{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const raw=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(raw.toString());}catch{data=null;}
 return {status:r.status,headers:r.headers,raw,data};
}
const api=(op,actor,body,options={})=>request('/api/control-v1/'+op,{actor,body,...options});
const check=async(name,fn)=>{const at=Date.now();try{const detail=await fn();report.checks.push({name,status:'PASS',duration_ms:Date.now()-at,...detail});}catch(e){report.checks.push({name,status:'FAIL',error:e.message});throw e;}};
async function main(){
 for(const name of Object.keys(h.identities)){try{await h.ensureSession(name);}catch{await h.login(name);}}
 await check('Preview public config pins isolated staging; Production ref absent',async()=>{const r=await request('/api/env.js',{method:'GET'});assert.equal(r.status,200);assert.ok(r.raw.includes(Buffer.from(h.REF)));assert.ok(!r.raw.includes(Buffer.from('ztwtbgoqanqzvwiibtuh')));});
 await check('HTTP and deployed assets equal candidate bytes',async()=>{
  for(const file of ['admin.html','admin-control-os.html','js/admin-rafi-decision-center.js','js/admin-control-os-clean.js','js/fixeo-control-client-v1.js','css/admin-rafi-decision-center.css']){
   const r=await request('/'+file,{method:'GET'});assert.equal(r.status,200,file);
   const expected=fs.readFileSync(path.resolve(__dirname,'../../..',file));
   const toolbar=file.endsWith('.html')&&r.raw.subarray(0,expected.length).equals(expected)?r.raw.subarray(expected.length).toString():'';
   const verifiedToolbar=/^<script async data-explicit-opt-in="true" data-deployment-id="dpl_[A-Za-z0-9]+" src="https:\/\/vercel\.live\/_next-live\/feedback\/feedback\.js"><\/script>$/.test(toolbar);
   const application=verifiedToolbar?r.raw.subarray(0,expected.length):r.raw;
   assert.equal(hash(application),hash(expected),file+' application byte hash');report.assets.push({path:file,sha256:hash(application),http_sha256:hash(r.raw),vercel_toolbar_appended:verifiedToolbar,status:200});
  }
 });
 const routes=[['decisions',{}],['network-context',{city:'Fès',trade:'plomberie'}],['dispatch-candidates',{request_id:h.randomId()}]];
 await check('Anonymous denied on all RAFI API routes',async()=>{for(const [op,b] of routes){const r=await api(op,null,b);assert.equal(r.status,401,op);assert.equal(r.data.code,'AUTH_REQUIRED');}});
 for(const name of Object.keys(h.identities).filter(x=>!x.startsWith('admin')))await check('Non-admin API denied / '+name,async()=>{for(const [op,b] of routes){const r=await api(op,name,b);assert.equal(r.status,403,op+':'+r.status);assert.equal(r.data.code,'FORBIDDEN');}});
 let briefing;
 await check('Admin briefing preserves real provenance, bounded partial state and no-store',async()=>{
  const r=await api('decisions','admin',{classification:'all'},{headers:{Origin:runtime.url}});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.ok,true);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.ok(r.headers.get('x-correlation-id'));briefing=r.data;
  assert.equal(Object.keys(briefing.sources).length,5);assert.ok(briefing.decisions.length>0);assert.equal(new Set(briefing.decisions.map(d=>d.decision_id)).size,briefing.decisions.length);
  assert.ok(briefing.decisions.every(d=>!d.actionability.execution_authorized&&d.evidence.length&&d.reason.length));
  assert.equal(briefing.sources.operations.status,'PARTIAL');assert.equal(briefing.status,'PARTIAL');
  return {state:briefing.status,decisions:briefing.decisions.length,sources:Object.fromEntries(Object.entries(briefing.sources).map(([k,v])=>[k,{status:v.status,total:v.total_observations,returned:v.returned_observations}]))};
 });
 await check('Contextual network navigation and canonical dossier round trip',async()=>{
  const d=briefing.decisions.find(d=>d.decision_type==='network.activate');assert.ok(d);
  const c=d.recommended_action.context,b={city:c.city,trade:c.trade,state:c.state,classification:c.classification,limit:1};
  const r=await api('network-context','admin',b);assert.equal(r.status,200);assert.equal(r.data.items.length,1);assert.equal(r.data.classification,c.classification);
  const item=r.data.items[0];assert.ok(!Object.hasOwn(item,'phone'));
  if(r.data.has_more){const next=await api('network-context','admin',{...b,after:r.data.next_cursor});assert.equal(next.status,200);assert.ok(next.data.items.every(x=>x.id!==item.id));}
  const dossier=await api('dossier','admin',{type:'artisan',id:item.id});assert.equal(dossier.status,200);assert.equal(dossier.data.id,item.id);
 });
 await check('Payload, origin, method and confirmation gates hold on deployed API',async()=>{
  assert.equal((await api('decisions','admin',{role:'admin'})).status,400);
  assert.equal((await api('decisions','admin',{}, {headers:{Origin:'https://example.invalid'}})).status,403);
  assert.equal((await api('decisions','admin',{}, {method:'GET'})).status,405);
  const denied=await api('action/execute','admin',{preview_id:h.randomId(),confirmed:false,idempotency_key:h.randomId()});assert.equal(denied.status,428);assert.equal(denied.data.code,'HUMAN_CONFIRMATION_REQUIRED');
 });
 report.verdict='PASS';
}
main().catch(error=>{report.verdict='FAIL';report.error=error.message;process.exitCode=1;}).finally(()=>{report.finished_at=new Date().toISOString();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verdict:report.verdict,checks:report.checks.length,error:report.error}));});
