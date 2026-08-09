'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Golden Fixture Tests
 * Phase 7C.7 | DORMANT
 *
 * Validates all 24 golden orchestration fixtures.
 */

var path = require('path');
var orc  = require('../estimator-orchestrator-v1');
var sess = require('../estimator-session-v1');
var plan = require('../estimator-question-planner-v1');

var fixtures = require('../fixtures/golden-orchestration-fixtures.v1.json');
var pass = 0, fail = 0;
var errors = [];

var SEP = '═'.repeat(63);

function check(condition, label, hint) {
  if (condition) { pass++; }
  else { fail++; errors.push(label + (hint ? ': ' + hint : '')); }
}

/**
 * Run a single golden fixture.
 */
function runFixture(f) {
  // Start session
  var ctx = Object.assign({}, f.entry_context, { session_id: f.id, known_inputs: f.known_inputs || {} });
  var r1 = orc.startEstimator(ctx);
  if (!r1.ok) {
    check(false, f.id + ' startEstimator', r1.error.code);
    return;
  }
  var s = r1.session;

  // Answer remaining questions from fixture
  var answers = (f.question_answers || []).slice();
  var maxIter = 15;
  while ((s.state === 'QUALIFICATION' || s.state === 'QUESTION_REQUIRED') && maxIter-- > 0) {
    var step = orc.getNextEstimatorStep(s);
    if (!step.ok || step.step.type !== 'QUESTION') break;
    var q = step.step;
    // Find matching answer
    var answerEntry = answers.find(function(a) { return a.input_id === q.input_id; });
    var ans;
    if (answerEntry) {
      ans = answerEntry.answer;
      answers = answers.filter(function(a) { return a.input_id !== answerEntry.input_id; });
    } else if (q.answer_type === 'boolean') {
      ans = false;
    } else if (q.answer_type === 'integer') {
      ans = 1;
    } else if (q.answer_type === 'number') {
      ans = 10;
    } else if (q.answer_type === 'enum') {
      ans = q.options[0];
    }
    var r = orc.answerEstimatorQuestion(s, q.question_id, ans);
    if (!r.ok) {
      // If safety/route stop
      check(false, f.id + ' answerQuestion: ' + q.input_id, r.error.code);
      return;
    }
    s = r.session;
    // Stop at terminal states
    if (['SAFETY_STOP', 'ROUTE_REQUIRED', 'QUOTE_REQUIRED'].includes(s.state)) break;
  }

  // Evaluate if ready
  if (s.state === 'READY_FOR_ENGINE') {
    var r2 = orc.evaluateEstimator(s);
    if (!r2.ok) {
      check(false, f.id + ' evaluateEstimator', r2.error.code);
      return;
    }
    s = r2.session;
  }

  // Check expected state
  check(s.state === f.expected_state, f.id + ' state=' + f.expected_state, s.state !== f.expected_state ? 'got ' + s.state : null);

  // Check outcome type
  if (f.expected_outcome_type && s.outcome) {
    check(s.outcome.outcome_type === f.expected_outcome_type, f.id + ' outcome_type=' + f.expected_outcome_type, s.outcome.outcome_type !== f.expected_outcome_type ? 'got ' + s.outcome.outcome_type : null);
  }

  // Check final_amount_mad
  if (f.expected_final_amount_mad !== null && f.expected_final_amount_mad !== undefined) {
    var amt = s.outcome && s.outcome.price && s.outcome.price.amount_mad;
    check(amt === f.expected_final_amount_mad, f.id + ' final_amount_mad=' + f.expected_final_amount_mad, amt !== f.expected_final_amount_mad ? 'got ' + amt : null);
  } else {
    var amt2 = s.outcome && s.outcome.price && s.outcome.price.amount_mad;
    check(amt2 === null || amt2 === undefined, f.id + ' final_amount_mad=null', amt2 !== null && amt2 !== undefined ? 'got ' + amt2 : null);
  }

  // Check labour_amount_mad
  if (f.expected_labour_amount_mad !== null && f.expected_labour_amount_mad !== undefined) {
    var lab = s.outcome && s.outcome.price && s.outcome.price.labour_amount_mad;
    check(lab === f.expected_labour_amount_mad, f.id + ' labour_amount_mad=' + f.expected_labour_amount_mad, lab !== f.expected_labour_amount_mad ? 'got ' + lab : null);
  }

  // Check next_action
  if (f.expected_next_action && s.outcome) {
    check(s.outcome.next_action === f.expected_next_action, f.id + ' next_action=' + f.expected_next_action, s.outcome.next_action !== f.expected_next_action ? 'got ' + s.outcome.next_action : null);
  }

  // Check question count: questions answered = history length
  if (f.expected_questions_asked !== undefined && f.expected_questions_asked !== null) {
    var asked = s.question_history.length;
    check(asked === f.expected_questions_asked, f.id + ' questions_asked=' + f.expected_questions_asked, asked !== f.expected_questions_asked ? 'got ' + asked : null);
  }

  // Check ui_recommendation
  if (f.expected_ui_recommendation && s.ui_recommendation) {
    check(s.ui_recommendation === f.expected_ui_recommendation, f.id + ' ui_recommendation=' + f.expected_ui_recommendation, s.ui_recommendation !== f.expected_ui_recommendation ? 'got ' + s.ui_recommendation : null);
  }
}

console.log('\n' + SEP);
console.log('FIXEO ESTIMATOR — GOLDEN ORCHESTRATION FIXTURE TESTS');
console.log('Phase 7C.7 | DORMANT');
console.log(SEP + '\n');

console.log('Testing ' + fixtures.fixtures.length + ' golden fixtures...\n');
fixtures.fixtures.forEach(function(f) {
  process.stdout.write('  ' + f.id + ': ' + f.description.slice(0, 55) + '...\n');
  runFixture(f);
});

var total = pass + fail;
console.log('\n' + SEP);
console.log('GOLDEN FIXTURE RESULTS');
console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + total);
console.log('  Fixtures: ' + fixtures.fixtures.length);
if (fail > 0) {
  console.log('\n  FAILURES:');
  errors.forEach(function(e) { console.log('    ❌ ' + e); });
}
console.log('\n  Status: ' + (fail === 0 ? '✅ ALL GOLDEN FIXTURES PASS' : '❌ ' + fail + ' FAILURE(S)'));
console.log(SEP + '\n');

module.exports = { pass: pass, fail: fail, total: total, fixture_count: fixtures.fixtures.length };
process.exit(fail > 0 ? 1 : 0);
