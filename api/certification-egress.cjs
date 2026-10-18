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
    return send(input,{...init,redirect:'error'});
  };
  globalThis[marker]=true;
};
