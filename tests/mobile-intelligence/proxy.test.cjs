'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/mobile-rafi-preview-proxy/index.ts','utf8').replace(/^import .+;$/m,''));
function proxy({origin='https://w41-fixture.vercel.app',bypass='fixture-server-bypass',fetchImpl}={}){
 let handler;const calls=[],deadlines=[];
 vm.runInNewContext(source,{Request,Response,URL,Uint8Array,Error,AbortSignal:{timeout:ms=>{deadlines.push(ms);return AbortSignal.timeout(ms)}},Deno:{env:{get:k=>({FIXEO_MOBILE_PREVIEW_ORIGIN:origin,FIXEO_MOBILE_PREVIEW_BYPASS:bypass})[k]},serve:f=>{handler=f}},fetch:async(...args)=>{calls.push(args);return fetchImpl?fetchImpl(...args):Response.json({ok:true})}});
 const send=(path='/api/mobile-estimator-v1',{method='POST',body='{}',headers={}}={})=>handler(new Request('https://fixture.supabase.co/functions/v1/mobile-rafi-preview-proxy'+path,{method,headers:{authorization:'Bearer '+'a'.repeat(40),'content-type':'application/json',...headers},...(method==='GET'?{}:{body})}));
 return {send,calls,deadlines};
}
test('proxy allows only three authenticated routes and keeps authority at endpoints',async()=>{
 const p=proxy();
 for(const route of ['/api/mobile-rafi-photo','/api/mobile-rafi-transcribe','/api/mobile-estimator-v1'])assert.equal((await p.send(route)).status,200);
 assert.equal(p.calls.length,3);assert.deepEqual(p.deadlines,[55000,55000,55000]);
 assert.equal((await p.send('/api/other')).status,404);
 assert.equal((await p.send(undefined,{method:'GET'})).status,405);
 assert.equal((await p.send(undefined,{headers:{authorization:''}})).status,401);
 assert.equal(p.calls.length,3);
 const request=p.calls[0][1];assert.equal(request.redirect,'error');assert.equal(request.headers.authorization,'Bearer '+'a'.repeat(40));assert.equal(request.headers['x-vercel-protection-bypass'],'fixture-server-bypass');
});
test('proxy bounds input/output, fails closed on upstream timeout/non-JSON and missing config',async()=>{
 assert.equal((await proxy().send(undefined,{body:'x'.repeat(96001)})).status,413);
 assert.equal((await proxy({origin:'https://production.invalid'}).send()).status,503);
 assert.equal((await proxy({bypass:''}).send()).status,503);
 const timeout=proxy({fetchImpl:async()=>{throw new Error('private upstream timeout detail')}});
 const nonJson=proxy({fetchImpl:async()=>new Response('<html>protected deployment internals</html>',{status:401,headers:{'content-type':'text/html'}})});
 for(const p of [timeout,nonJson]){const r=await p.send();assert.equal(r.status,502);assert.deepEqual(await r.json(),{ok:false,error:'GATEWAY_UNAVAILABLE'});assert.equal(p.calls.length,1);}
 const huge=proxy({fetchImpl:async()=>new Response('x'.repeat(262145),{headers:{'content-type':'application/json'}})});assert.equal((await huge.send()).status,413);
 const clean=proxy({fetchImpl:async()=>Response.json({ok:false,error:'ROLE_FORBIDDEN'},{status:403,headers:{'x-secret-internal':'private'}})});const r=await clean.send();assert.equal(r.status,403);assert.equal(r.headers.get('x-secret-internal'),null);
});
