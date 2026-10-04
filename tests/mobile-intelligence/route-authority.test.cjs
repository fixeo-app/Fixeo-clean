'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),sharp=require('sharp');
const voice=require('../../api/mobile-rafi-voice-fn');
const photo=require('../../api/mobile-rafi-photo-fn');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('route authority: Voice shared; ephemeral photo shared; persisted photo Client-only',async()=>{
 const savedFetch=globalThis.fetch,savedEnv={...process.env};
 Object.assign(process.env,{NODE_ENV:'test',OPENAI_API_KEY:'fixture-provider',SUPABASE_URL:'https://kqyhusnbybsukbcaoqtu.supabase.co',FIXEO_STAGING_PROJECT_REF:'kqyhusnbybsukbcaoqtu',SUPABASE_ANON_KEY:'sb_publishable_fixture',FIXEO_W41_ATTESTATION_SECRET:'a'.repeat(64),FIXEO_ESTIMATOR_SECRET:'b'.repeat(64),FIXEO_DIAGNOSTIC_SECRET:'c'.repeat(64),VERCEL_URL:'fixture.vercel.app'});
 let role='client',valid=true,providerCalls=0,quotaCalls=0;
 globalThis.fetch=async url=>{
  const value=String(url);
  if(value.includes('/auth/v1/user'))return Response.json(valid?{id:uid}:{},{status:valid?200:401});
  if(value.includes('/rest/v1/users?'))return Response.json([{id:uid,role}]);
  if(value.includes('/rpc/mobile_rafi_quota_v1')){quotaCalls++;return Response.json({ok:true});}
  if(value==='https://api.openai.com/v1/audio/transcriptions'){providerCalls++;return Response.json({text:'Une fuite sous le lavabo.'});}
  throw new Error('Unexpected dependency in role contract');
 };
 const server=http.createServer((req,res)=>{res.status=function(n){res.statusCode=n;return res};res.json=value=>res.end(JSON.stringify(value));(req.url==='/voice'?voice:photo)(req,res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const image=await sharp({create:{width:64,height:64,channels:3,background:'#ddd'}}).png().toBuffer();
 async function call(route,{auth=true,persist=false}={}){
  const form=new FormData();
  if(route==='/voice')form.append('audio',new Blob(['synthetic-fixture'],{type:'audio/wav'}),'fixture.wav');
  else{form.append('image',new Blob([image],{type:'image/png'}),'fixture.png');form.append('city','rabat');form.append('description','Une forte odeur de gaz');if(persist){form.append('persist','true');form.append('consent_version','diagnostic-privacy-v1');}}
  const response=await savedFetch(origin+route,{method:'POST',headers:auth?{authorization:'Bearer '+'a'.repeat(40)}:{},body:form});
  return {status:response.status,body:await response.json()};
 }
 try{
  assert.equal((await call('/voice',{auth:false})).status,401);
  valid=false;assert.equal((await call('/voice')).status,401);valid=true;
  for(role of ['client','artisan']){const r=await call('/voice');assert.equal(r.status,200);assert.ok(r.body.text);}
  assert.equal(providerCalls,2);
  role='artisan';const refused=await call('/photo',{persist:true});assert.equal(refused.status,403);assert.equal(refused.body.error,'ROLE_FORBIDDEN');assert.equal(quotaCalls,2);
  for(role of ['client','artisan']){const r=await call('/photo');assert.equal(r.status,200);assert.equal(r.body.privacy.persisted,false);assert.equal(r.body.diagnostic_reference,undefined);assert.equal(r.body.result.safety.stop,true);}
 }finally{
  globalThis.fetch=savedFetch;
  for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
});
