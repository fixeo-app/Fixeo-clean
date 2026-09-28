'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../../api/control');
const C=require('../../api/control/contracts');
const uid='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC',FIXEO_STAGING_PROJECT_REF:'abcdefghijklmnopqrst',VERCEL_ENV:'preview',VERCEL_URL:'test.vercel.app'};
const request=(path,body,headers={})=>({method:'POST',path:'/api/control-v1/'+path,body,headers:{authorization:'Bearer synthetic.not_a_real_token',...headers}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(j){this.body=j;return this;}});
test('No authentication: refuse before any backend access',async()=>{const res=response();await createHandler({env,fetchImpl:()=>{throw Error('must not call')}})({method:'POST',headers:{},url:'/api/control-v1/summary'},res);assert.equal(res.statusCode,401);});
test('Preview rejects Production backend configuration',async()=>{const res=response();await createHandler({env:{...env,SUPABASE_URL:'https://ztwtbgoqanqzvwiibtuh.supabase.co'},fetchImpl:()=>{throw Error('must not call')}})(request('summary',{}),res);assert.equal(res.statusCode,503);});
test('Fixed reader routes use only public key + user JWT, reject arbitrary fields and business types',async()=>{
 let calls=[];const fetchImpl=async(url,options)=>{calls.push([url,options]);return{ok:true,status:200,text:async()=>JSON.stringify(url.endsWith('/user')?{id:uid}:{summary:{id:uid}})}};
 const h=createHandler({env,fetchImpl});let r=response();await h(request('dossier',{type:'request',id:uid}),r);assert.equal(r.statusCode,200);assert.ok(calls[1][0].endsWith('/rpc/control_dossier_read_v1'));assert.equal(calls[1][1].headers.apikey,'sb_publishable_SYNTHETIC');assert.equal(calls[1][1].headers.Authorization,'Bearer synthetic.not_a_real_token');
 r=response();await h(request('dossier',{type:'artisan_business_clients',id:uid}),r);assert.equal(r.statusCode,400);
 r=response();await h(request('dossier',{type:'request',id:uid,table:'users'}),r);assert.equal(r.statusCode,400);
});
test('One failed source never makes a global zero or a healthy briefing',async()=>{
 const fetchImpl=async(url,o)=>{if(url.endsWith('/user'))return{ok:true,text:async()=>JSON.stringify({id:uid})};const source=JSON.parse(o.body).p_source;if(source==='requests')throw Error('offline');return{ok:true,text:async()=>JSON.stringify({source,completeness:'complete',as_of:new Date().toISOString(),metrics:{}})};};
 const r=response();await createHandler({env,fetchImpl})(request('signals',{}),r);assert.equal(r.statusCode,200);assert.equal(r.body.coverage,'partial');assert.ok(r.body.unknown_sources.includes('requests'));assert.match(r.body.briefing,/partielle/);
});
test('Unknown/partial/forbidden metrics stay null; stale keeps dated values only',()=>{
 assert.equal(C.metricValue({requests:{status:'partial',completeness:'page',data:{metrics:{'requests.total':50}}}},'requests.total'),null);
 const previous=C.sourceState('requests',{status:'healthy',data:{metrics:{'requests.total':132}},asOf:'2026-01-01',completeness:'complete'});
 assert.equal(C.failSource('requests',{code:'SOURCE_TIMEOUT'},previous).status,'stale');assert.equal(C.failSource('requests',{code:'FORBIDDEN'},previous).data,null);
 assert.equal(C.signals({}).coverage,'partial');
});
test('Human confirmation is mandatory; a model cannot choose an RPC',async()=>{
 const fetchImpl=async()=>({ok:true,text:async()=>JSON.stringify({id:uid})});const h=createHandler({env,fetchImpl});let r=response();await h(request('action/execute',{preview_id:uid,confirmed:false,idempotency_key:uid}),r);assert.equal(r.statusCode,428);
 r=response();await h(request('action/preview',{capability:'arbitrary_rpc',target_id:uid,payload:{}}),r);assert.equal(r.statusCode,400);
 r=response();await h(request('action/execute',{preview_id:uid,confirmed:true,idempotency_key:uid},{origin:'https://hostile.invalid'}),r);assert.equal(r.statusCode,403);
});
test('An observed activity lower bound is not published as a complete global metric',()=>{
 const states={artisans:{status:'healthy',completeness:'complete',data:{metrics:{'artisans.active_30d':2},metric_quality:{'artisans.active_30d':'partial_historical_coverage'}}}};
 assert.equal(C.metricValue(states,'artisans.active_30d'),null);
});
test('Registry covers every SQL summary metric and specifies its completeness contract',()=>{
 const fs=require('node:fs'),path=require('node:path');const registry=require('../../api/control/metrics-registry.json');const ids=new Set(registry.metrics.map(x=>x.id));assert.equal(ids.size,registry.metrics.length);
 const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260928212728_control_os_b1_projections.sql'),'utf8').split('CREATE FUNCTION public.control_summary_v1')[1].split('CREATE FUNCTION fixeo_private.control_action_type_v1')[0];
 for(const match of sql.matchAll(/'((?:requests|urgency|missions|artisans|trust|network|finance)\.[a-z0-9_.]+)'/g))assert.ok(ids.has(match[1]),match[1]);
 for(const metric of registry.metrics)for(const key of ['version','grain','source','authority','formula','scope','window','timezone','exclusions','freshness_ms','completeness','pagination'])assert.ok(metric[key]!=null,metric.id+':'+key);
});
