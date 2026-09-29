'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHandler}=require('../../api/control');
const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC',FIXEO_STAGING_PROJECT_REF:'abcdefghijklmnopqrst',VERCEL_ENV:'preview',VERCEL_URL:'preview.example.vercel.app'};
const user='00000000-0000-4000-8000-000000000001';
const reply=(data,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(data)});
async function run({method='POST',op='search',body={},headers={},fetchImpl=async()=>{throw Error('UNEXPECTED_FETCH')}}={}){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
 await createHandler({env,fetchImpl})({method,url:'/api/control-v1/'+op,path:'/api/control-v1/'+op,headers,body},res);return res;
}
const auth={authorization:'Bearer synthetic.not_a_real_token_1234567890'};

test('B8 security envelope is no-store, correlated and rejects unauthenticated/cross-site before dependencies',async()=>{
 const unauth=await run();assert.equal(unauth.statusCode,401);assert.equal(unauth.headers['Cache-Control'],'private, no-store');assert.match(unauth.headers['X-Correlation-ID'],/^[0-9a-f-]{36}$/i);assert.equal(unauth.body.correlation_id,unauth.headers['X-Correlation-ID']);
 const cross=await run({headers:{...auth,'sec-fetch-site':'cross-site'}});assert.equal(cross.statusCode,403);assert.equal(cross.body.code,'ORIGIN_REJECTED');
 const get=await run({method:'GET',headers:auth});assert.equal(get.statusCode,405);assert.equal(get.body.code,'METHOD_NOT_ALLOWED');
});

test('B8 security envelope never echoes invalid payload or authorization material',async()=>{
 const privateText='PRIVATE_PHONE_0612345678_PRIVATE_NOTE';
 let calls=0;const fetchImpl=async url=>{calls++;assert.ok(url.endsWith('/auth/v1/user'));return reply({id:user});};
 const r=await run({headers:auth,body:{query:privateText.repeat(8),type:'all'},fetchImpl});
 assert.equal(r.statusCode,400);assert.equal(r.body.code,'INVALID_SEARCH');assert.equal(calls,1);
 const serialized=JSON.stringify(r.body);assert.ok(!serialized.includes(privateText));assert.ok(!serialized.includes('0612345678'));assert.ok(!serialized.includes(auth.authorization));
});

test('B8 unknown route and oversized body are denied before backend calls',async()=>{
 const unknown=await run({op:'free-sql',headers:auth});assert.equal(unknown.statusCode,404);assert.equal(unknown.body.code,'UNKNOWN_OPERATION');
 const huge=await run({headers:auth,body:{query:'x'.repeat(9000)}});assert.equal(huge.statusCode,413);assert.equal(huge.body.code,'PAYLOAD_TOO_LARGE');
});
