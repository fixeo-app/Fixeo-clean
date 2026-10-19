'use strict';
// Installed before any handler: no shared Supabase or Production destination.
module.exports = function install() {
  const marker=Symbol.for('fixeo.certification.egress');
  if(globalThis[marker])return;
  const send=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async (input,init={})=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const backend=url.origin==='https://akeyuruypurmendksusc.supabase.co' &&
      (url.pathname==='/auth/v1/user'||/^\/rest\/v1\/rpc\/(rafi_certification_trust_v1|mobile_rafi_quota_v1|mobile_intelligence_quota_v1|mobile_diagnostic_state_v1)$/.test(url.pathname)||url.pathname.startsWith('/storage/v1/object/'));
    const provider=url.origin==='https://api.openai.com'&&['/v1/responses','/v1/audio/transcriptions'].includes(url.pathname);
    if(url.username||url.password||url.hash||(!backend&&!provider))throw Object.assign(Error('CERTIFICATION_EGRESS_REFUSED'),{code:'FORBIDDEN',status:403});
    if(provider)console.info(JSON.stringify({event:'rafi_certification_provider_call',path:url.pathname}));
    const context=require('./enterprise-context.cjs').current();
    const headers=new Headers(init.headers);
    if(backend && context)headers.set('x-fixeo-enterprise-context',context);
    if(backend && context && url.pathname.startsWith('/storage/')) {
      // Storage caches authorization by JWT, not the Enterprise context header.
      // Enterprise media never grants direct user-JWT Storage access. Revalidate
      // the exact DB-owned path first; the server credential stays on this origin.
      const match=url.pathname.match(/^\/storage\/v1\/object\/diagnostic-private-v1\/(safe\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp)$/);
      if(!match || url.search || !['GET','POST'].includes(init.method))throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});
      const gate=await send('https://akeyuruypurmendksusc.supabase.co/rest/v1/rpc/enterprise_rafi_media_gate_v1',{
        method:'POST',headers:{apikey:headers.get('apikey'),authorization:headers.get('authorization'),'content-type':'application/json','x-fixeo-enterprise-context':context},
        body:JSON.stringify({p_path:match[1],p_insert:init.method==='POST'}),redirect:'error',signal:AbortSignal.timeout(10000),
      });
      const permission=await gate.json();
      if(!gate.ok || permission.allowed!==true || permission.path!==match[1] || permission.insert!==(init.method==='POST'))throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});
      const service=process.env.SUPABASE_SERVICE_ROLE_KEY;let claims;
      try{claims=JSON.parse(Buffer.from(service.split('.')[1],'base64url').toString());}catch{}
      if(claims?.role!=='service_role'||claims?.ref!=='akeyuruypurmendksusc')throw Object.assign(Error('FEATURE_UNAVAILABLE'),{code:'FEATURE_UNAVAILABLE',status:503});
      headers.set('apikey',service);headers.set('authorization','Bearer '+service);headers.delete('x-fixeo-enterprise-context');
    }
    return send(input,{...init,headers,redirect:'error'});
  };
  globalThis[marker]=true;
};
