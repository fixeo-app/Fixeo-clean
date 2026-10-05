'use strict';
const fs=require('fs'),assert=require('assert/strict');
const env=JSON.parse(fs.readFileSync(process.env.W41_ENV_FILE));
assert.equal(env.FIXEO_STAGING_PROJECT_REF,'kqyhusnbybsukbcaoqtu');
const users=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE));
const headers=JSON.parse(fs.readFileSync(process.env.W41_PREVIEW_HEADERS_FILE));
const passed=[];const mark=x=>{passed.push(x);console.log('PASS '+x)};
async function api(body,user=users[0]){const r=await fetch(process.env.W41_PREVIEW_URL+'/api/mobile-estimator-v1',{method:'POST',headers:{...headers,authorization:'Bearer '+user.token,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'});return {status:r.status,body:await r.json()}}
(async()=>{
 for(const u of users.slice(0,2)){
  const r=await fetch(env.SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});
  const b=await r.json();assert.equal(r.status,200);assert.equal(b.user.id,u.id);u.token=b.access_token;
 }
 fs.writeFileSync(process.env.W41_AUTH_FILE,JSON.stringify(users),{mode:0o600});
 const start={action:'start',entry_context:{city_slug:'rabat',description:'W41_NEGATIVE_PREVIEW_FIXTURE',service_hint:'bricolage.visite_minimum'}};
 const s=await api(start);assert.equal(s.status,200);
 const e=await api({action:'evaluate',session_token:s.body.session.session_token});assert.equal(e.status,200);
 const token=e.body.pricing_context_token;assert.ok(token);
 const c={action:'confirm_request',pricing_context_token:token,client_phone:'0612345678',service_code:'bricolage.visite_minimum',city_slug:'rabat',confirmed:true};
 assert.equal((await api({...c,pricing_context_token:token.slice(0,-10)+'abcdefghij'})).status,400);mark('PRICING_CONTEXT_TAMPER_REJECTED');
 assert.equal((await api(c,users[1])).status,403);mark('PRICING_CONTEXT_CROSS_USER_REJECTED');
 assert.equal((await api({...c,city_slug:'fes'})).status,409);mark('PRICING_CONTEXT_CITY_MISMATCH_REJECTED');
 const stop=await api({...start,entry_context:{...start.entry_context,description:'Une forte odeur de gaz'}});assert.equal(stop.status,200);assert.equal(stop.body.outcome.outcome_type,'SAFETY_STOP');assert.equal(stop.body.pricing_context_token,null);
 assert.equal((await api({action:'evaluate',session_token:stop.body.session.session_token})).status,409);mark('PREVIEW_TRUE_STOP_NO_LOCAL_LIFT');
 fs.writeFileSync(process.env.W41_REPORT_FILE,JSON.stringify({status:'PASS',passed},null,2)+'\n');
})().catch(e=>{console.error('Negative Preview check failed: '+e.name);process.exitCode=1});
