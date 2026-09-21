const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const entries=require('../../data/pricing/canonical/vap-approved-v1.json').entries.filter(x=>x.service_code.startsWith('demenagement.'));
const inputs={moving_task:'MOVING_HANDLING_ONLY',moving_access:'MOVING_ACCESS_READY',moving_items:'MOVING_STANDARD_ITEMS',moving_preparation:'MOVING_PREPARED',moving_duration:'MOVING_TWO_HOUR_TEAM'};
function evaluate(values,city='rabat'){return o.evaluateEstimator(o.startEstimator({service_hint:'demenagement.manutention_2h',city_slug:city,known_inputs:values}).session);}
test('moving team package: all cities, sequential questions, exact total and team retention',async()=>{
 assert.equal(entries.length,20);
 for(const t of entries){let session=o.startEstimator({service_hint:t.service_code,city_slug:t.city_slug}).session;
  for(let i=0;i<5;i++){const step=o.getNextEstimatorStep(session).step;assert.ok(inputs[step.input_id]);const answer=o.answerEstimatorQuestion(session,step.question_id,inputs[step.input_id]);assert.equal(answer.ok,true);session=answer.session;}
  const e=o.evaluateEstimator(session);assert.equal(e.ok,true);assert.equal(e.session.outcome.outcome_type,'PRICE_READY');assert.equal(e.session.outcome.price.amount_mad,690);
  assert.ok(e.session.outcome.scope_summary.some(s=>s.includes('2 intervenants pendant 2 heures')));assert.ok(e.session.outcome.exclusions_summary.some(s=>s.includes('Camion')));
  const p={service_code:t.service_code,city_slug:t.city_slug,session_id:session.session_id,context_id:'fxctx-'+'d'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};let saved;
  await attachOffer(e.session,p,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true}}});
  assert.equal(saved.vap_minor,60000);assert.equal(saved.commission_minor,9000);assert.equal(saved.client_total_minor,69000);assert.equal(p.amount_mad,690);validateFinancialContext(p);
 }
});
test('moving: every missing, complex, unknown or forged answer prevents fixed price',async()=>{
 for(const key of Object.keys(inputs)){
  const missing={...inputs};delete missing[key];assert.equal(evaluate(missing).ok,false);
  for(const val of ['MOVING_COMPLEX','UNKNOWN','forged',null,2]){const bad={...inputs,[key]:val};assert.notEqual(evaluate(bad).session?.outcome?.outcome_type,'PRICE_READY');assert.equal(selectTariff({service_code:'demenagement.manutention_2h',entry_context:{city_slug:'rabat'},outcome:{outcome_type:'PRICE_READY'},known_inputs:bad}),null);}
 }
 await assert.rejects(attachOffer(evaluate(inputs,'unsupported').session,{}),/city not eligible/);
});
