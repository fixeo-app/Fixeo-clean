import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canSendClientIntake, diagnosticQuestions, diagnosticProvenance, confirmedDiagnosticDescription } from '../lib/clientDiagnostic';
import { clientEstimatorPresentation } from '../lib/clientEstimatorPresentation';
import { diagnosticResult, diagnosticSafety, diagnosticQualification } from './fixtures/diagnostic-results';
import estimator from './fixtures/estimator-canonical.json';

test('diagnostic provenance survives confirmation and unknown provenance stays unconfirmed', () => {
  const original = JSON.stringify(diagnosticResult);
  assert.equal(diagnosticProvenance('observed'), 'OBSERVÉ');
  assert.equal(diagnosticProvenance('user_declared'), 'DÉCLARÉ');
  assert.equal(diagnosticProvenance('ai_inferred'), 'HYPOTHÈSE');
  assert.equal(diagnosticProvenance('user_confirmed'), 'CONFIRMÉ');
  assert.equal(diagnosticProvenance('unknown'), 'À CONFIRMER');
  const description = confirmedDiagnosticDescription(diagnosticQualification, ['Quand l’eau coule.', 'Non.']);
  assert.match(description, /Quand l’eau coule/); assert.doesNotMatch(description, /Non\./);
  assert.equal(JSON.stringify(diagnosticResult), original);
  assert.equal(diagnosticQuestions({...diagnosticQualification, questions:[...diagnosticQualification.questions, diagnosticQualification.questions[0],{}]}).length, 1);
});
test('safety and pending analysis or confirmation always block intake', () => {
  assert.equal(canSendClientIntake({busy:false,diagnostic:diagnosticSafety,reviewed:true}),false);
  assert.equal(canSendClientIntake({busy:true,diagnostic:null,reviewed:true}),false);
  assert.equal(canSendClientIntake({busy:false,diagnostic:diagnosticResult,reviewed:false}),false);
  assert.equal(canSendClientIntake({busy:false,diagnostic:diagnosticResult,reviewed:true}),true);
  assert.equal(canSendClientIntake({busy:false,diagnostic:{...diagnosticResult,questions:[{id:'water_spreading',type:'choice'}]},reviewed:true}),true);
  assert.equal(canSendClientIntake({busy:false,diagnostic:null,reviewed:false}),true);
});
test('all canonical outcomes render literal server amounts, quote and diagnostic are valid outcomes', () => {
  const {price,diagnostic,labour,quote,route,safety,more,addon} = estimator.outcomes;
  assert.equal(clientEstimatorPresentation(price).amount, price.price.amount_mad);
  assert.equal(clientEstimatorPresentation(diagnostic).amount, diagnostic.diagnostic_price_mad);
  assert.equal(clientEstimatorPresentation(labour).amount, labour.price.labour_amount_mad);
  assert.equal(clientEstimatorPresentation(diagnostic).title,'Diagnostic FIXEO');
  assert.equal(clientEstimatorPresentation(quote).title,'Votre intervention nécessite un devis.');
  for(const outcome of [quote,route,safety,more]) assert.equal(clientEstimatorPresentation({...outcome,price:{amount_mad:999,currency:'MAD'}}).amount,null);
  assert.equal(clientEstimatorPresentation(more).moreInformation,true);
  assert.equal(clientEstimatorPresentation(addon).amount,null); // no made-up add-on commercial amount
  for(const outcome of Object.values(estimator.outcomes)) assert.equal(clientEstimatorPresentation(outcome).canCreateRequest,false);
});
test('mobile consumes no pricing engine, legacy import or estimator secret; source guard precedes request', () => {
  for(const file of ['app/index.tsx','components/ClientRequestComposer.tsx','components/ClientFixeoResult.tsx','lib/clientEstimatorPresentation.ts','components/ClientDiagnostic.tsx','lib/clientDiagnostic.ts']) {
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/FIXEO_ESTIMATOR_SECRET|pricing-engine|fixeo-pricing|data\/pricing|PRICE_MAP|amount\s*[*+\/-]/);
  }
  const home=readFileSync('components/ClientRequestComposer.tsx','utf8');
  assert.match(home,/if \(!intakeReady\) \{[^}]*return; \}[\s\S]*setConfirmDirect\(true\)/);
  assert.match(home,/label="Confirmer et chercher un artisan"[\s\S]*void send\(\)/);
  assert.match(home,/onPress=\{idempotencyKeyRef\.current && loop\.state === \'error\' \? \(\) => void send\(\) : sendQualifiedIntake\}/);
  assert.doesNotMatch(home,/onPress=\{\(\) => void send\(\)/);
  const result=readFileSync('components/ClientFixeoResult.tsx','utf8');
  assert.doesNotMatch(result,/createRequest|confirm_request|fetch\(/);
});

test('preventive safety questions are hidden using the real canonical question metadata', async () => {
  const {createRequire} = await import('node:module');
  const require = createRequire(import.meta.url);
  const {QUESTIONS} = require('../../api/diagnostic/contract.js');
  const ids = JSON.parse(readFileSync('lib/diagnosticSafetyQuestions.generated.json','utf8'));
  assert.deepEqual(ids, Object.entries(QUESTIONS).filter(([,q]:any)=>q.hazard).map(([id])=>id));
  const normal = {...diagnosticResult, questions: ids.map((id:string)=>({id,...QUESTIONS[id]}))};
  assert.deepEqual(diagnosticQuestions(normal), []);
  assert.equal(canSendClientIntake({busy:false,diagnostic:normal,reviewed:true}),true);
});
test('mild uncertainty has at most one useful qualification, no safety loop or invented answers', () => {
  const before = JSON.stringify(diagnosticQualification);
  assert.equal(diagnosticQuestions(diagnosticQualification).length,1);
  assert.equal(diagnosticQuestions(diagnosticQualification)[0].id,'occurrence');
  assert.equal(confirmedDiagnosticDescription(diagnosticQualification,[]),diagnosticQualification.problem.value);
  assert.equal(JSON.stringify(diagnosticQualification), before);
  assert.equal(diagnosticQuestions({...diagnosticResult,questions:[{id:'equipment_model',label:'Modèle ?',type:'choice'}]}).length,1);
});
test('a real STOP is never locally cleared, including after confirmation or exit', () => {
  const before = JSON.stringify(diagnosticSafety);
  for(const reviewed of [true,false]) assert.equal(canSendClientIntake({busy:false,diagnostic:diagnosticSafety,reviewed}),false);
  assert.deepEqual(diagnosticQuestions(diagnosticSafety),[]);
  assert.equal(JSON.stringify(diagnosticSafety),before);
  const view = readFileSync('components/ClientDiagnostic.tsx','utf8');
  assert.match(view,/label="Revenir à mon espace"[\s\S]*onPress=\{onExit\}/);
  assert.doesNotMatch(view,/safety\.stop\s*=|fetch\(|analyzeMobileDiagnosticPhoto/);
});
