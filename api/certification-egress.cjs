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
      // the exact DB-owned path through the attested Certification Edge gateway.
      const match=url.pathname.match(/^\/storage\/v1\/object\/diagnostic-private-v1\/(safe\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp)$/);
      if(!match || url.search || !['GET','POST'].includes(init.method))throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});
      const auth=headers.get('authorization')||'';let user;
      try{user=JSON.parse(Buffer.from(auth.slice(7).split('.')[1],'base64url').toString()).sub;}catch{}
      if(!user)throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});
      const bytes=init.method==='POST'?Buffer.from(init.body):Buffer.alloc(0);
      const {createHash}=require('node:crypto');
      const payload={path:match[1],insert:init.method==='POST',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),context:JSON.parse(context)};
      const signed=require('./mobile-intelligence-fn/transport').attest('enterprise-media',payload,user,process.env);
      // The scoped Edge gateway holds the existing Certification Storage credential.
      // W41 signs path, owner, context and bytes; no privileged key leaves Supabase.
      return send('https://akeyuruypurmendksusc.supabase.co/functions/v1/enterprise-rafi-private-media',{
        method:'POST',headers:{apikey:headers.get('apikey'),authorization:auth,'content-type':'application/json','x-fixeo-enterprise-context':context},
        body:JSON.stringify({...signed,body:bytes.toString('base64')}),redirect:'error',signal:AbortSignal.timeout(12000),
      });
    }
    return send(input,{...init,headers,redirect:'error'});
  };
  globalThis[marker]=true;
};
