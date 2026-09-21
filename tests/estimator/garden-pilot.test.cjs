const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const entries=require('../../data/pricing/canonical/vap-approved-v1.json').entries.filter(x=>x.service_code.startsWith('jardinage.'));
const common={garden_access:'GARDEN_ACCESS_OK',garden_state:'GARDEN_MAINTAINED',garden_waste:'GARDEN_WASTE_ONSITE',garden_tasks:'GARDEN_ROUTINE_ONLY'};
const cases=[['jardinage.entretien_courant','GARDEN_UP_TO_100',360],['jardinage.taille_haie_basse','HEDGE_WITHIN_LIMITS',310]];
test('two qualified gardening packages use the same approved price across all 20 cities',async()=>{
 assert.equal(entries.length,40);assert.equal(new Set(entries.map(x=>x.city_slug)).size,20);
 for(const entry of entries){
  const s=o.startEstimator({service_hint:entry.service_code,city_slug:entry.city_slug,known_inputs:entry.inputs}).session;s.entry_context.city_slug=entry.city_slug;
  const e=o.evaluateEstimator(s);assert.equal(e.session.outcome.outcome_type,'PRICE_READY');
  const payload={service_code:entry.service_code,city_slug:entry.city_slug,session_id:s.session_id,context_id:'fxctx-'+'a'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};
  let saved;await attachOffer(e.session,payload,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true}}});
  assert.equal(payload.amount_mad,e.session.outcome.price.amount_mad);assert.equal(validateFinancialContext(payload).commissionMinor,6000);assert.equal(saved.city,entry.city_slug);
 }
});
test('all missing, unknown and out-of-scope gardening answers fail to produce a price',()=>{
 for(const [code,dimension,total] of cases){const inputs={...common,garden_dimensions:dimension};
  for(const key of Object.keys(inputs)){
   const missing={...inputs};delete missing[key];const s=o.startEstimator({service_hint:code,known_inputs:missing}).session;assert.equal(o.evaluateEstimator(s).ok,false);
   const unknown=o.startEstimator({service_hint:code,known_inputs:{...inputs,[key]:'UNKNOWN'}}).session;assert.equal(o.evaluateEstimator(unknown).session.outcome.outcome_type,'QUOTE_REQUIRED');
  }
  for(const patch of [{garden_dimensions:'GARDEN_OVERSIZE'},{garden_access:'GARDEN_COMPLEX'},{garden_state:'GARDEN_COMPLEX'},{garden_waste:'GARDEN_WASTE_REMOVE'},{garden_tasks:'GARDEN_COMPLEX'}]){const s=o.startEstimator({service_hint:code,known_inputs:{...inputs,...patch}}).session;assert.equal(o.evaluateEstimator(s).session.outcome.outcome_type,'QUOTE_REQUIRED');}
 }
});
test('gardening without an approved city cannot fall back to an unversioned price',async()=>{
 const s=o.startEstimator({service_hint:cases[0][0],known_inputs:{...common,garden_dimensions:cases[0][1]}}).session;
 const e=o.evaluateEstimator(s).session;
 await assert.rejects(attachOffer(e,{}),/city not eligible/);
});
