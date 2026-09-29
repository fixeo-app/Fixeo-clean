'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const h=require('./http.cjs');
const runtime=JSON.parse(fs.readFileSync(path.join(process.env.FIXEO_STAGING_TEST_SECRET_DIR,'preview-runtime.json'),'utf8'));
assert.match(runtime.url,/^https:\/\/fixeo-clean-[a-z0-9]+-elalaouibiz-3410s-projects\.vercel\.app$/);
async function control(operation,body={},actor='admin',options={}){
 if(actor&&!options.token)await h.ensureSession(actor);
 const bearer=options.token??(actor?h.sessions[actor]?.access_token:undefined);
 const response=await fetch(runtime.url+'/api/control-v1/'+operation,{method:options.method||'POST',headers:{Cookie:runtime.cookie,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{}),...(options.headers||{})},body:options.method==='GET'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(options.timeout||18000),redirect:'error'});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={code:'NON_JSON_RESPONSE'}};
 return {status:response.status,data,headers:Object.fromEntries(response.headers)};
}
module.exports={control,previewUrl:runtime.url};
