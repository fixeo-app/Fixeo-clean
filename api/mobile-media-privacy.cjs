'use strict';
// Prepared integration only. A separate reviewed activation must change this
// literal AND provide the server configuration. No request can enable it.
const MEDIA_V2_ACTIVATED = true;
const REF = 'akeyuruypurmendksusc';
const ORIGIN = `https://${REF}.supabase.co`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail = (code, status=503) => { throw Object.assign(Error(code), {code,status}); };
const SAFE = new Set(['AUTH_REQUIRED','FORBIDDEN','POLICY_VERSION_OUTDATED','RATE_LIMITED','FEATURE_UNAVAILABLE','CONTRACT_REQUIRED']);
function createMediaBoundary({enabled=false,env=process.env,fetchImpl=globalThis.fetch}={}) {
  function config() {
    if (!enabled || env.FIXEO_STORE_MEDIA_ENABLED !== 'true' || env.VERCEL_ENV !== 'preview' ||
        env.FIXEO_CERTIFICATION_PROJECT_REF !== REF || env.SUPABASE_URL !== ORIGIN ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_ANON_KEY || '') ||
        !/^[a-f0-9]{64}$/.test(env.FIXEO_STORE_MEDIA_REVIEW_SHA256 || '')) fail('FEATURE_UNAVAILABLE');
  }
  async function json(path, authorization, body) {
    if (!['/auth/v1/user','/rest/v1/rpc/rafi_certification_trust_v1','/rest/v1/rpc/rafi_certification_trust_v1'].includes(path)) fail('FORBIDDEN',403);
    const response=await fetchImpl(ORIGIN+path, {method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:authorization,'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)});
    const reader=response.body?.getReader();let raw='';
    if(!reader) fail('DEPENDENCY_UNAVAILABLE');
    let size=0;const chunks=[];
    try { for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)fail('DEPENDENCY_UNAVAILABLE');chunks.push(Buffer.from(value));}raw=Buffer.concat(chunks).toString(); }
    finally { await reader.cancel().catch(()=>{}); }
    let data;try{data=JSON.parse(raw);}catch{fail('DEPENDENCY_UNAVAILABLE');}
    if(!response.ok){const code=SAFE.has(data?.message)?data.message:'DEPENDENCY_UNAVAILABLE';fail(code,code==='AUTH_REQUIRED'?401:code==='FORBIDDEN'?403:code==='RATE_LIMITED'?429:503);}
    return data;
  }
  return { async preflight(req,purpose) {
    config();
    if(req.method!=='POST'||!/^multipart\/form-data(?:;|$)/i.test(req.headers?.['content-type']||''))fail('INVALID_INPUT',400);
    if(!['voice_transcription','photo_analysis'].includes(purpose))fail('FORBIDDEN',403);
    if(req.headers?.origin && req.headers.origin!==env.FIXEO_STORE_WEB_ORIGIN)fail('FORBIDDEN',403);
    const authorization=req.headers?.authorization;
    if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization||'')||authorization.length>8192)fail('AUTH_REQUIRED',401);
    const user=await json('/auth/v1/user',authorization);
    if(!UUID.test(user?.id||'')||user.is_anonymous)fail('AUTH_REQUIRED',401);
    let claims;try{claims=JSON.parse(Buffer.from(authorization.slice(7).split('.')[1],'base64url').toString());}catch{fail('AUTH_REQUIRED',401);}
    if(claims.sub!==user.id||claims.iss!==ORIGIN+'/auth/v1'||claims.role!=='authenticated'||!UUID.test(claims.session_id||'')||!(claims.exp>Date.now()/1000))fail('AUTH_REQUIRED',401);
    const rpc=(name,action,input={})=>json('/rest/v1/rpc/'+name,authorization,{p_action:action,p_input:input});
    async function live() {
      const p=await rpc('rafi_certification_trust_v1','profile_get');
      if(p?.id!==user.id||!['client','artisan'].includes(p.role))fail('AUTH_REQUIRED',401);
      const contract=await rpc('rafi_certification_trust_v1','contract_status');
      if(contract?.ownerId!==user.id||contract?.role!==p.role)fail('FORBIDDEN',403);
      if(contract.accepted!==true)fail('CONTRACT_REQUIRED',409);
      return p;
    }
    const actor=await live(); // canonical D5 session checked before receiving the upload
    let check=null;
    return { actor, async currentContext() { await live(); const raw=require('./enterprise-context.cjs').current(); return raw?JSON.parse(raw):null; }, async approve(input) {
      if(!input||input.trust_protocol!=='account-trust-v1'||!UUID.test(input.trust_context||'')||
          typeof input.trust_notice_version!=='string'||input.trust_notice_version.length<1||input.trust_notice_version.length>120||
          ['owner_id','user_id','role','session_id'].some(k=>Object.hasOwn(input,k)))fail('INVALID_INPUT',400);
      if(input.persist!==undefined && !['true','false'].includes(input.persist))fail('INVALID_INPUT',400);
      const retained=input.persist==='true';
      if(retained && (purpose!=='photo_analysis'||actor.role!=='client'))fail('FORBIDDEN',403);
      const context=input.trust_context,notice=input.trust_notice_version;
      check=async()=>{
        const current=await live();if(current.role!==actor.role)fail('AUTH_REQUIRED',401);
        if((await rpc('rafi_certification_trust_v1','transfer_check',{purpose,context,notice_version:notice}))?.allowed!==true)fail('POLICY_VERSION_OUTDATED',409);
        if(retained){
          const caps=await rpc('rafi_certification_trust_v1','capabilities'),version=caps?.notices?.diagnostic_retention;
          if(!version||(await rpc('rafi_certification_trust_v1','transfer_check',{purpose:'diagnostic_retention',context,notice_version:version}))?.allowed!==true)fail('POLICY_VERSION_OUTDATED',409);
        }
      };
      await check();
    }, async providerFetch(target,init={}) {
      if(!check)fail('POLICY_VERSION_OUTDATED',409);
      const expected=purpose==='photo_analysis'?'https://api.openai.com/v1/responses':'https://api.openai.com/v1/audio/transcriptions';
      if(String(target)!==expected||init.method!=='POST')fail('FORBIDDEN',403);
      await check(); // recheck withdrawal/session/version immediately before every transfer
      return fetchImpl(target,{...init,redirect:'error'});
    }};
  }};
}
const runtimeBoundary=()=>createMediaBoundary({enabled:MEDIA_V2_ACTIVATED});
module.exports={createMediaBoundary,runtimeBoundary,MEDIA_V2_ACTIVATED};
