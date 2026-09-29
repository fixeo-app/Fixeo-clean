'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const REF = 'kqyhusnbybsukbcaoqtu';
const secretDir = process.env.FIXEO_STAGING_TEST_SECRET_DIR;
if (!secretDir) throw new Error('STAGING_SYNTHETIC_CREDENTIALS_REQUIRED');
const config = JSON.parse(fs.readFileSync(process.env.FIXEO_STAGING_TEST_PUBLIC_CONFIG, 'utf8'));
const identities = JSON.parse(fs.readFileSync(path.join(secretDir, 'identities.json'), 'utf8'));
assert.equal(identities.project_ref, REF);
assert.equal(config.url, `https://${REF}.supabase.co`);
const sessionFile = path.join(secretDir, 'sessions.json');
let sessions = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')) : {};
async function request(route, {actor, method='POST', body, headers={}, token, timeout=15000}={}) {
  if(actor && !token) await ensureSession(actor);
  const bearer = token ?? (actor ? sessions[actor]?.access_token : undefined);
  const response = await fetch(config.url + route, {method, headers:{apikey:config.key,...(bearer?{Authorization:'Bearer '+bearer}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  const text = await response.text(); let data;
  try { data = JSON.parse(text); } catch { data = {code:'NON_JSON_RESPONSE'}; }
  return {status:response.status,data,headers:Object.fromEntries(response.headers)};
}
function persist(){fs.writeFileSync(sessionFile,JSON.stringify(sessions),{mode:0o600});fs.chmodSync(sessionFile,0o600);}
async function login(name){
  const identity = identities.identities[name];
  const r=await request('/auth/v1/token?grant_type=password',{body:{email:identity.email,password:identity.password}});
  assert.equal(r.status,200,'AUTH_LOGIN_STATUS:'+name+':'+(r.data.error_code||r.data.code||''));
  assert.equal(r.data.user?.id,identity.id);assert.ok(r.data.access_token?.length>100,'REAL_ACCESS_TOKEN_REQUIRED');
  sessions[name]={access_token:r.data.access_token,refresh_token:r.data.refresh_token,user_id:r.data.user.id,expires_at:Date.now()+r.data.expires_in*1000};
  persist();return r.data.user.id;
}
async function refresh(name){const r=await request('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:sessions[name].refresh_token}});assert.equal(r.status,200,'AUTH_REFRESH_STATUS');assert.equal(r.data.user.id,identities.identities[name].id);sessions[name]={access_token:r.data.access_token,refresh_token:r.data.refresh_token,user_id:r.data.user.id,expires_at:Date.now()+r.data.expires_in*1000};persist();}
const refreshing=new Map();
async function ensureSession(name){
 if(!sessions[name]) throw new Error('SYNTHETIC_SESSION_REQUIRED:'+name);
 if(sessions[name].expires_at>Date.now()+60000)return;
 if(!refreshing.has(name))refreshing.set(name,refresh(name).finally(()=>refreshing.delete(name)));
 await refreshing.get(name);
}
const rpc=(actor,name,body)=>request('/rest/v1/rpc/'+name,{actor,body});
const select=(actor,table,query)=>request('/rest/v1/'+table+'?'+query,{actor,method:'GET'});
const uid=name=>identities.identities[name].id;
const syntheticId=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
module.exports={REF,config,identities:identities.identities,sessions,request,login,refresh,ensureSession,rpc,select,uid,syntheticId,randomId:crypto.randomUUID};
