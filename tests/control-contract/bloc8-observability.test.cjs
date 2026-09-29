'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const code=fs.readFileSync(path.resolve(__dirname,'../../js/fixeo-control-client-v1.js'),'utf8');
const correlation='00000000-0000-4000-8000-000000000111';

function page(fetchImpl){
 const d=new JSDOM('<!doctype html><body></body>',{url:'https://www.fixeo.ma/admin.html',runScripts:'outside-only'});
 const w=d.window;
 w.FixeoSupabaseClient={client:{auth:{getSession:async()=>({data:{session:{access_token:'PRIVATE_TOKEN_SHOULD_NEVER_APPEAR',user:{id:'00000000-0000-4000-8000-000000000001'}}}})}}};
 w.fetch=fetchImpl;
 if(!w.AbortSignal.timeout)w.AbortSignal.timeout=()=>undefined;
 w.eval(code);
 return w;
}
function response(status,data){
 return {ok:status>=200&&status<300,status,headers:{get:n=>n.toLowerCase()==='x-correlation-id'?correlation:null},json:async()=>data};
}

test('B8 Control observability stores only allowlisted transport metadata',async()=>{
 const privateText='PRIVATE_PHONE_0612345678_PRIVATE_NOTE';
 const w=page(async()=>response(200,{ok:true,correlation_id:correlation,items:[]}));
 await w.FixeoControl.request('search',{query:privateText,phone:'0612345678'});
 const t=w.FixeoControl.traceSnapshot();
 assert.equal(t.length,1);assert.deepEqual(Object.keys(t[0]),['operation','status','http_status','ms','code','correlation_id','at']);
 assert.equal(t[0].operation,'search');assert.equal(t[0].status,'success');assert.equal(t[0].http_status,200);assert.equal(t[0].correlation_id,correlation);
 const serialized=JSON.stringify(t);assert.ok(!serialized.includes(privateText));assert.ok(!serialized.includes('0612345678'));assert.ok(!serialized.includes('PRIVATE_TOKEN_SHOULD_NEVER_APPEAR'));
 w.close();
});

test('B8 Control error trace preserves code and correlation without response or request body',async()=>{
 const w=page(async()=>response(503,{ok:false,code:'SOURCE_TIMEOUT',correlation_id:correlation,detail:'PRIVATE_ERROR_DETAIL'}));
 await assert.rejects(()=>w.FixeoControl.request('summary',{source:'operations',private:'PRIVATE_PAYLOAD'}),/SOURCE_TIMEOUT/);
 const t=w.FixeoControl.traceSnapshot().at(-1);assert.equal(t.status,'error');assert.equal(t.http_status,503);assert.equal(t.code,'SOURCE_TIMEOUT');assert.equal(t.correlation_id,correlation);
 assert.ok(!JSON.stringify(t).includes('PRIVATE_ERROR_DETAIL'));assert.ok(!JSON.stringify(t).includes('PRIVATE_PAYLOAD'));w.close();
});

test('B8 Control transport trace is bounded and does not expose arbitrary operation strings',async()=>{
 const w=page(async()=>response(200,{ok:true,correlation_id:correlation}));
 for(let i=0;i<55;i++)await w.FixeoControl.request(i===54?'../../PRIVATE_OPERATION':'summary',{secret:'PRIVATE_'+i});
 const t=w.FixeoControl.traceSnapshot();assert.equal(t.length,50);assert.equal(t.at(-1).operation,'unknown');assert.ok(!JSON.stringify(t).includes('PRIVATE_OPERATION'));assert.ok(!JSON.stringify(t).includes('PRIVATE_54'));w.close();
});
