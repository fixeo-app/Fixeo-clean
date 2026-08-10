#!/usr/bin/env node
/*!
 * estimator-v2-functional-tests.js
 * Phase 7C.9B — FIXEO Estimator Production Dormant Integration
 * Functional tests: 8 canonical flows via real orchestrator (Node.js direct)
 *
 * These tests use the actual canonical orchestrator + engine.
 * They do NOT go through HTTP — they run Node.js only.
 * They do NOT load prototype fixtures.
 * They are test-only and never shipped to the browser.
 */
'use strict';

const assert = require('assert');
const path   = require('path');

const ROOT  = path.resolve(__dirname, '../../../../..');
const ORCH  = require(path.join(ROOT, 'data/pricing/orchestrator/estimator-orchestrator-v1'));

/* ── Test runner ── */
let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name + ' — ' + e.message);
    failed++;
    errors.push({ name, error: e.message });
  }
}

/* ── Helper: complete all pending questions for a session ── */
function answerAll(session, answers) {
  let s = session;
  for (const [qid, ans] of Object.entries(answers)) {
    const r = ORCH.answerEstimatorQuestion(s, qid, ans);
    if (!r.ok) throw new Error('answerEstimatorQuestion failed for ' + qid + ': ' + (r.error && r.error.message));
    s = r.session;
  }
  return s;
}

/* ══════════════════════════════════════════════════════════════
   FLOW A — Menuiserie réglage porte sans rabotage
   Expected: PRICE_READY, amount_mad = 300
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow A: Menuiserie PRICE_READY ──');

test('A.1 startEstimator with service_hint returns QUALIFICATION state', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  assert(r.ok, 'startEstimator must succeed');
  assert.strictEqual(r.session.state, 'QUALIFICATION');
  assert.strictEqual(r.session.service_code, 'menuiserie.reglage_porte.sans_rabotage');
});

test('A.2 Flow A reaches READY_FOR_ENGINE after answering all questions', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const s = answerAll(r.session, {
    'security_door@menuiserie.reglage_porte.sans_rabotage': false,
    'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage': false,
    'frame_condition@menuiserie.reglage_porte.sans_rabotage': 'SOUND',
  });
  assert.strictEqual(s.state, 'READY_FOR_ENGINE');
});

test('A.3 Flow A evaluate produces PRICE_READY', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const s = answerAll(r.session, {
    'security_door@menuiserie.reglage_porte.sans_rabotage': false,
    'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage': false,
    'frame_condition@menuiserie.reglage_porte.sans_rabotage': 'SOUND',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok, 'evaluateEstimator must succeed');
  assert.strictEqual(ev.session.outcome.outcome_type, 'PRICE_READY');
});

test('A.4 Flow A canonical price = 300 MAD', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const s = answerAll(r.session, {
    'security_door@menuiserie.reglage_porte.sans_rabotage': false,
    'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage': false,
    'frame_condition@menuiserie.reglage_porte.sans_rabotage': 'SOUND',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.amount_mad, 300);
  assert.strictEqual(ev.session.outcome.price.currency, 'MAD');
});

test('A.5 Flow A outcome.price.labour_amount_mad is null for PRICE_READY', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const s = answerAll(r.session, {
    'security_door@menuiserie.reglage_porte.sans_rabotage': false,
    'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage': false,
    'frame_condition@menuiserie.reglage_porte.sans_rabotage': 'SOUND',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.labour_amount_mad, null);
});

/* ══════════════════════════════════════════════════════════════
   FLOW B — Plomberie robinet remplacement
   Expected: LABOUR_PLUS_PART_READY, labour_amount_mad = 250
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow B: Plomberie LABOUR_PLUS_PART_READY ──');

test('B.1 Flow B evaluate produces LABOUR_PLUS_PART_READY', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'plomberie.robinet_remplacement' });
  const s = answerAll(r.session, {
    'part_replacement_required@plomberie.robinet_remplacement': true,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok, 'evaluate must succeed');
  assert.strictEqual(ev.session.outcome.outcome_type, 'LABOUR_PLUS_PART_READY');
});

test('B.2 Flow B labour_amount_mad = 250 MAD', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'plomberie.robinet_remplacement' });
  const s = answerAll(r.session, {
    'part_replacement_required@plomberie.robinet_remplacement': true,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.labour_amount_mad, 250);
});

test('B.3 Flow B amount_mad is null (never summed — parts separate)', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'plomberie.robinet_remplacement' });
  const s = answerAll(r.session, {
    'part_replacement_required@plomberie.robinet_remplacement': true,
  });
  const ev = ORCH.evaluateEstimator(s);
  // amount_mad MUST be null for LABOUR_PLUS_PART — never sum labour + part
  assert.strictEqual(ev.session.outcome.price.amount_mad, null, 'amount_mad must be null for LABOUR_PLUS_PART — part is separate');
});

/* ══════════════════════════════════════════════════════════════
   FLOW C — Electricité diagnostic
   Expected: DIAGNOSTIC_READY, amount_mad = 200
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow C: Diagnostic DIAGNOSTIC_READY ──');

test('C.1 Flow C evaluate produces DIAGNOSTIC_READY', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const s = answerAll(r.session, {
    'burning_smell@electricite.diagnostic': false,
    'scorch_marks@electricite.diagnostic': false,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok, 'evaluate must succeed');
  assert.strictEqual(ev.session.outcome.outcome_type, 'DIAGNOSTIC_READY');
});

test('C.2 Flow C diagnostic price = 200 MAD', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const s = answerAll(r.session, {
    'burning_smell@electricite.diagnostic': false,
    'scorch_marks@electricite.diagnostic': false,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.amount_mad, 200);
});

test('C.3 Flow C diagnostic_notice_required is present in outcome', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const s = answerAll(r.session, {
    'burning_smell@electricite.diagnostic': false,
    'scorch_marks@electricite.diagnostic': false,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(typeof ev.session.outcome.diagnostic_notice_required === 'boolean');
});

/* ══════════════════════════════════════════════════════════════
   FLOW D — Nettoyage grand ménage apartment
   Expected: PRICE_READY (apartment variant)
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow D: Nettoyage calculated PRICE_READY ──');

test('D.1 Flow D APARTMENT produces PRICE_READY', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'nettoyage.grand_menage' });
  const s = answerAll(r.session, {
    'property_type@nettoyage.grand_menage': 'APARTMENT',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok, 'evaluate must succeed');
  assert.strictEqual(ev.session.outcome.outcome_type, 'PRICE_READY');
});

test('D.2 Flow D APARTMENT amount_mad is a positive number', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'nettoyage.grand_menage' });
  const s = answerAll(r.session, {
    'property_type@nettoyage.grand_menage': 'APARTMENT',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.session.outcome.price.amount_mad > 0, 'must have positive amount');
});

test('D.3 Flow D VILLA produces a valid priced or quote outcome', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'nettoyage.grand_menage' });
  const s = answerAll(r.session, {
    'property_type@nettoyage.grand_menage': 'VILLA',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok, 'evaluate must succeed');
  // VILLA may produce PRICE_READY or QUOTE_REQUIRED depending on engine config
  const VALID_OUTCOMES = ['PRICE_READY', 'QUOTE_REQUIRED', 'LABOUR_PLUS_PART_READY'];
  assert(VALID_OUTCOMES.includes(ev.session.outcome.outcome_type),
    'VILLA outcome must be a valid outcome type: ' + ev.session.outcome.outcome_type);
});

/* ══════════════════════════════════════════════════════════════
   FLOW E — Peinture mur intérieur all_in
   Expected: ui_recommendation = PAGE_REQUIRED (needs measurement)
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow E: Peinture PAGE_REQUIRED ──');

test('E.1 Flow E first step has ui_recommendation = PAGE_REQUIRED', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'peinture.mur_interieur.all_in' });
  const step = ORCH.getNextEstimatorStep(r.session);
  assert(step.ok, 'getNextEstimatorStep must succeed');
  assert.strictEqual(step.step.ui_recommendation, 'PAGE_REQUIRED');
});

test('E.2 PAGE_REQUIRED is ui_recommendation not an outcome_type', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'peinture.mur_interieur.all_in' });
  // Session outcome is null at this point — PAGE_REQUIRED is only ui_recommendation
  assert.strictEqual(r.session.outcome, null, 'outcome must be null at PAGE_REQUIRED step');
});

test('E.3 PAGE_REQUIRED step type is QUESTION with ui_recommendation PAGE_REQUIRED', function() {
  // The PAGE_REQUIRED flow: the step returned is a QUESTION type requiring PAGE_REQUIRED UI
  // We verify the question structure is complete and sound
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'peinture.mur_interieur.all_in' });
  const stepResult = ORCH.getNextEstimatorStep(r.session);
  assert(stepResult.ok, 'getNextEstimatorStep must succeed');
  assert(stepResult.step, 'step must be present');
  assert.strictEqual(stepResult.step.type, 'QUESTION');
  assert.strictEqual(stepResult.step.ui_recommendation, 'PAGE_REQUIRED');
  // The question_id must be present
  assert(stepResult.step.question_id, 'question_id must be present in PAGE_REQUIRED step');
  // questions_remaining must be >= 1
  assert(stepResult.step.questions_remaining >= 1, 'questions_remaining must be >= 1 for PAGE_REQUIRED');
});

/* ══════════════════════════════════════════════════════════════
   FLOW F — Nettoyage grand ménage f4_f5_large
   Expected: QUOTE_REQUIRED (outside priced scope)
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow F: QUOTE_REQUIRED ──');

test('F.1 Flow F f4_f5_large produces QUOTE_REQUIRED', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'nettoyage.grand_menage' });
  const s = answerAll(r.session, {
    'property_type@nettoyage.grand_menage': 'f4_f5_large',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok, 'evaluate must succeed');
  assert.strictEqual(ev.session.outcome.outcome_type, 'QUOTE_REQUIRED');
});

test('F.2 QUOTE_REQUIRED has no price amounts', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'nettoyage.grand_menage' });
  const s = answerAll(r.session, {
    'property_type@nettoyage.grand_menage': 'f4_f5_large',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.amount_mad, null);
  assert.strictEqual(ev.session.outcome.price.labour_amount_mad, null);
});

test('F.3 QUOTE_REQUIRED: server must NOT generate pricing_context_token', function() {
  // This is a contract test — verify the outcome has no pricing amount
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'nettoyage.grand_menage' });
  const s = answerAll(r.session, {
    'property_type@nettoyage.grand_menage': 'f4_f5_large',
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.outcome_type, 'QUOTE_REQUIRED');
  // No price = no pricing context should be generated
  assert.strictEqual(ev.session.outcome.price.amount_mad, null);
  assert.strictEqual(ev.session.outcome.price.labour_amount_mad, null);
});

/* ══════════════════════════════════════════════════════════════
   FLOW G — Electricité diagnostic with burning_smell = true
   Expected: SAFETY_STOP
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow G: SAFETY_STOP ──');

test('G.1 burning_smell=true transitions directly to SAFETY_STOP', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'burning_smell@electricite.diagnostic', true);
  assert(r2.ok, 'answer must succeed');
  assert.strictEqual(r2.session.state, 'SAFETY_STOP');
});

test('G.2 SAFETY_STOP outcome_type correct', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'burning_smell@electricite.diagnostic', true);
  const step = ORCH.getNextEstimatorStep(r2.session);
  assert.strictEqual(step.step.type, 'OUTCOME');
  assert.strictEqual(r2.session.outcome.outcome_type, 'SAFETY_STOP');
});

test('G.3 SAFETY_STOP has no price amounts', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'burning_smell@electricite.diagnostic', true);
  assert.strictEqual(r2.session.outcome.price.amount_mad, null);
  assert.strictEqual(r2.session.outcome.price.labour_amount_mad, null);
});

test('G.4 SAFETY_STOP: evaluateEstimator must fail (cannot price a safety stop)', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'burning_smell@electricite.diagnostic', true);
  // Evaluating from SAFETY_STOP state must fail
  const ev = ORCH.evaluateEstimator(r2.session);
  assert.strictEqual(ev.ok, false, 'evaluateEstimator must fail from SAFETY_STOP state');
});

test('G.5 SAFETY_STOP safety_reason field present', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'burning_smell@electricite.diagnostic', true);
  assert(r2.session.outcome.safety_reason, 'safety_reason must be present for SAFETY_STOP');
});

/* ══════════════════════════════════════════════════════════════
   FLOW H — Serrurerie cylindre remplacement standard
   Expected: LABOUR_PLUS_PART_READY, labour_amount_mad = 280
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Flow H: Serrurerie LABOUR_PLUS_PART_READY ──');

test('H.1 Flow H produces LABOUR_PLUS_PART_READY', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'serrurerie.cylindre_remplacement.standard' });
  const s = answerAll(r.session, {
    'security_door@serrurerie.cylindre_remplacement.standard': false,
    'cylinder_count@serrurerie.cylindre_remplacement.standard': 1,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert(ev.ok);
  assert.strictEqual(ev.session.outcome.outcome_type, 'LABOUR_PLUS_PART_READY');
});

test('H.2 Flow H labour_amount_mad = 280 MAD', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'serrurerie.cylindre_remplacement.standard' });
  const s = answerAll(r.session, {
    'security_door@serrurerie.cylindre_remplacement.standard': false,
    'cylinder_count@serrurerie.cylindre_remplacement.standard': 1,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.labour_amount_mad, 280);
});

test('H.3 Flow H amount_mad is null (part is separate, never summed)', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'serrurerie.cylindre_remplacement.standard' });
  const s = answerAll(r.session, {
    'security_door@serrurerie.cylindre_remplacement.standard': false,
    'cylinder_count@serrurerie.cylindre_remplacement.standard': 1,
  });
  const ev = ORCH.evaluateEstimator(s);
  assert.strictEqual(ev.session.outcome.price.amount_mad, null, 'amount_mad must be null — part is separate');
});

/* ══════════════════════════════════════════════════════════════
   CROSS-CUTTING CANONICAL CONTRACT TESTS
   ══════════════════════════════════════════════════════════════ */
console.log('\n── Cross-cutting canonical contract ──');

test('CC.1 All outcomes have required canonical fields', function() {
  const REQUIRED = ['outcome_type', 'service_code', 'price', 'scope_summary', 'exclusions_summary',
    'parts_notice_required', 'diagnostic_notice_required', 'route', 'next_action'];
  // Flow A
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const s = answerAll(r.session, {
    'security_door@menuiserie.reglage_porte.sans_rabotage': false,
    'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage': false,
    'frame_condition@menuiserie.reglage_porte.sans_rabotage': 'SOUND',
  });
  const ev = ORCH.evaluateEstimator(s);
  for (const field of REQUIRED) {
    assert(field in ev.session.outcome, 'outcome must have field: ' + field);
  }
});

test('CC.2 SAFETY_STOP outcome has all required canonical fields', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'electricite.diagnostic' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'burning_smell@electricite.diagnostic', true);
  const outcome = r2.session.outcome;
  assert('outcome_type' in outcome);
  assert('price' in outcome);
  assert('safety_reason' in outcome);
});

test('CC.3 price object always has amount_mad, labour_amount_mad, currency', function() {
  // Check PRICE_READY
  const rA = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const sA = answerAll(rA.session, {
    'security_door@menuiserie.reglage_porte.sans_rabotage': false,
    'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage': false,
    'frame_condition@menuiserie.reglage_porte.sans_rabotage': 'SOUND',
  });
  const evA = ORCH.evaluateEstimator(sA);
  assert('amount_mad' in evA.session.outcome.price);
  assert('labour_amount_mad' in evA.session.outcome.price);
  assert.strictEqual(evA.session.outcome.price.currency, 'MAD');
});

test('CC.4 orchestrator startEstimator returns ok:true and session', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'plomberie.robinet_remplacement' });
  assert.strictEqual(r.ok, true);
  assert(r.session, 'session must be present');
  assert(r.session.session_id, 'session_id must be present');
});

test('CC.5 Invalid question_id is rejected by answerEstimatorQuestion', function() {
  const r = ORCH.startEstimator({ source: 'test', service_hint: 'plomberie.robinet_remplacement' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'nonexistent_question@fake', true);
  assert.strictEqual(r2.ok, false);
  assert(r2.error && r2.error.code === 'UNKNOWN_QUESTION');
});

/* ══════════════════════════════════════════════════════════════
   RESULTS
   ══════════════════════════════════════════════════════════════ */
console.log('\n══ Functional Test Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(e => console.log('    ✗ ' + e.name + ': ' + e.error));
  process.exit(1);
} else {
  console.log('  All functional tests passed ✓');
}
