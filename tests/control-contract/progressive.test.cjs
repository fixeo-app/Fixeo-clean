'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createHandler}=require('../../api/control');
test('Progressive source loading publishes available cards and coalesces refreshes',async()=>{
 const pending=new Map(),published=[],second=[];let calls=0;
 const root={FixeoSupabaseClient:{client:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic.token'}}})}}}};
 const fetch=async(url,options)=>{calls++;const source=JSON.parse(options.body).source;return new Promise(resolve=>pending.set(source,()=>resolve({ok:true,json:async()=>({sources:{[source]:{source,status:'healthy'}}})})));};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../js/fixeo-control-client-v1.js'),'utf8'),{window:root,fetch,crypto:require('node:crypto'),AbortSignal});
 const a=root.FixeoControl.summary((s)=>published.push(s)),b=root.FixeoControl.summary((s)=>second.push(s));assert.equal(a,b);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,6);
 for(const [s,resolve] of pending)if(s!=='finance')resolve();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(published.length,5);assert.equal(second.length,5);assert.ok(!published.includes('finance'));
 pending.get('finance')();await a;assert.equal(published.length,6);assert.equal(calls,6);
});
test('A source selector is a fixed enum and does not permit arbitrary RPC access',async()=>{
 const seen=[];const env={VERCEL_ENV:'preview',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC',FIXEO_STAGING_PROJECT_REF:'abcdefghijklmnopqrst'};
 const fetchImpl=async(url,o)=>{seen.push(url);return{ok:true,text:async()=>JSON.stringify(url.endsWith('/user')?{id:'10000000-0000-4000-8000-000000000003'}:{source:'requests',completeness:'complete',as_of:new Date().toISOString(),metrics:{}})}};
 const handler=createHandler({env,fetchImpl});
 const run=async body=>{const res={setHeader(){},status(s){this.statusCode=s;return this},json(j){this.body=j;return this}};await handler({method:'POST',url:'/api/control-v1/summary',headers:{authorization:'Bearer synthetic.not_a_real_token'},body},res);return res;};
 assert.equal((await run({source:'requests'})).statusCode,200);assert.equal(seen.length,2);
 assert.equal((await run({source:'arbitrary_rpc'})).body.code,'INVALID_SOURCE');assert.equal(seen.length,3);
});
