const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('../../api/estimator-v1/index');
const orchestrator=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {normalizeSessionView}=require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
const registry=require('../../data/pricing/canonical/vap-approved-v1.json');
async function api(body){let payload,status;const req={method:'POST',headers:{host:'localhost'},body,socket:{remoteAddress:'vap-test'}};const res={setHeader(){},status(n){status=n;return this},json(p){payload=p;return this},end(p){if(p)payload=JSON.parse(p);return this}};await handler(req,res);return {status,body:payload};}
test('Real estimator handler signs persisted VAP and forwards its exact total to atomic confirmation',async()=>{
 const keys=['FIXEO_ESTIMATOR_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const old=keys.map(k=>process.env[k]);const oldFetch=global.fetch;
 process.env.FIXEO_ESTIMATOR_SECRET='test-secret';process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const approvedInputs=require('../../data/pricing/engine/plumbing-pilot-v1').services['plomberie.fuite_simple'].inputs;
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:false,reason:'test_stop_before_dispatch'})};};
 try{
  const session=orchestrator.startEstimator({service_hint:'plomberie.fuite_simple',city_slug:'rabat',known_inputs:approvedInputs}).session;
  session.entry_context.city_slug='rabat';
  const view=normalizeSessionView(session,process.env.FIXEO_ESTIMATOR_SECRET);
  const r=await api({action:'evaluate',session_token:view.session_token});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.outcome.price.amount_mad,280);assert.equal(r.body.outcome.financial_breakdown.commissionMinor,6000);assert.equal(calls.length,1);
  const verified=await api({action:'verify_pricing_context',pricing_context_token:r.body.pricing_context_token});assert.equal(verified.body.amount_mad,280);
  const confirmed=await api({action:'confirm_request',pricing_context_token:r.body.pricing_context_token,client_phone:'0612345678'});
  assert.equal(confirmed.status,409);assert.match(calls[1].url,/confirm_estimator_request_vap_v1$/);assert.equal(calls[1].body.p_amount_mad,280);assert.equal(calls[1].body.p_offer_id,calls[0].body.id);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]});}
});
