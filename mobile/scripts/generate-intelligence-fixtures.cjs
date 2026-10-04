// Offline evidence only: server modules are never imported by the mobile runtime.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const engine = require(path.join(root, 'data/pricing/orchestrator/estimator-orchestrator-v1'));
const normalizer = require(path.join(root, 'api/estimator-v1/fixeo-estimator-runtime-v1'));
const plumbing = require(path.join(root, 'data/pricing/engine/plumbing-pilot-v1'));
const mapper = require(path.join(root, 'data/pricing/orchestrator/estimator-outcome-mapper-v1'));
function flow(service, known_inputs) {
  let session = engine.startEstimator({service_hint: service, city_slug: 'rabat', known_inputs}).session;
  for (let i=0; i<20 && !session.outcome; i++) {
    const step = engine.getNextEstimatorStep(session).step;
    if (step.type !== 'QUESTION') { session = engine.evaluateEstimator(session).session; break; }
    const answer = step.answer_type === 'boolean' ? false : step.answer_type === 'enum' ? step.options[0] : 1;
    const response = engine.answerEstimatorQuestion(session, step.question_id, answer);
    assert.ok(response.ok, JSON.stringify(response.error)); session = response.session;
  }
  assert.ok(session.outcome, service); return normalizer.normalizeOutcomeView(session);
}
const outcomes = {
  price: flow('plomberie.fuite_simple', plumbing.services['plomberie.fuite_simple'].inputs),
  diagnostic: flow('plomberie.diagnostic', plumbing.services['plomberie.diagnostic'].inputs),
  labour: flow('menuiserie.remplacement_charniere', {security_door: false, hinge_count: 1}),
  // No currently eligible add-on discovered. Schema-only fixture; deliberately no amount.
  addon: normalizer.normalizeOutcomeView({outcome: mapper.mapEngineResultToOutcome({ok:true, pricing:{commercial_output_type:'FIXEO_ADD_ON', final_amount_mad:null}}, 'peinture.preparation_surface')}),
  quote: flow('plomberie.fuite_simple', {plumbing_scope: 'COMPLEX'}),
  route: flow('climatisation.recharge_gaz_r22', {}),
  safety: flow('peinture.mur_interieur.all_in', {active_moisture: true}),
  more: normalizer.normalizeOutcomeView({outcome: mapper.mapErrorToOutcome({ok: false, error: {code: 'MISSING_REQUIRED_INPUT', message: 'Input requires clarification'}}, 'plomberie.fuite_simple')}),
};
const question = engine.getNextEstimatorStep(engine.startEstimator({ service_hint: 'plomberie.fuite_simple', city_slug: 'rabat' }).session).step;
for(const [key, type] of Object.entries({price:'PRICE_READY',diagnostic:'DIAGNOSTIC_READY',labour:'LABOUR_PLUS_PART_READY',addon:'ADD_ON_READY',quote:'QUOTE_REQUIRED',route:'ROUTE_REQUIRED',safety:'SAFETY_STOP',more:'REQUALIFY'})) assert.equal(outcomes[key].outcome_type,type);
fs.writeFileSync(path.join(root,'mobile/tests/fixtures/estimator-canonical.json'), JSON.stringify({source:'Existing canonical orchestrator + normalizeOutcomeView; offline, no token, no activation, no reservation.', question, outcomes},null,2)+'\n');
console.log(Object.fromEntries(Object.entries(outcomes).map(([key,value])=>[key,value.outcome_type])));
