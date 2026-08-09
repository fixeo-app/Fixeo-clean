'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Validator
 * Phase 7C.7 | DORMANT
 *
 * Validates orchestrator contract, implementation, tests, and isolation.
 */

var { execSync } = require('child_process');
var fs   = require('fs');
var path = require('path');

var REPO = path.join(__dirname, '../../../');
var ORC  = __dirname;
var pass = 0, fail = 0;
var errors = [];

function check(condition, label, hint) {
  if (condition) { pass++; process.stdout.write('  \u2705 ' + label + '\n'); }
  else { fail++; errors.push(label + (hint ? ': ' + hint : '')); process.stdout.write('  \u274c FAIL: ' + label + (hint ? ' \u2014 ' + hint : '') + '\n'); }
}

function runValidator(file, minPass, label) {
  try {
    var out = execSync('node ' + file, { cwd: REPO, encoding: 'utf8' });
    var allMatches = out.match(/^\s*PASS:\s*(\d+)/gm);
    var lastMatch = allMatches ? allMatches[allMatches.length - 1].match(/(\d+)/) : null;
    var p = lastMatch ? parseInt(lastMatch[1]) : 0;
    var anyFail = out.match(/^\s*FAIL:\s*[1-9]/m);
    check(!anyFail && p >= minPass, label + ' \u2265 ' + minPass + ' PASS (got ' + p + ')', anyFail ? 'Failures present' : p < minPass ? 'too low' : null);
  } catch(e) { check(false, label, e.message.slice(0, 80)); }
}

var SEP = '\u2550'.repeat(63);
console.log('\n' + SEP);
console.log('FIXEO ESTIMATOR ORCHESTRATOR V1 \u2014 VALIDATOR');
console.log('Phase 7C.7 | DORMANT');
console.log(SEP + '\n');

// ── 1. ALL PRIOR VALIDATORS PASS ─────────────────────────────────────────────
console.log('[1] All prior validators pass');
runValidator('data/pricing/consolidation/validate-7c1-1.js', 91, '7C.1.1');
runValidator('data/pricing/canonical/validate-canonical-v1.js', 130, '7C.2');
runValidator('data/pricing/consolidation/validate-7c3.js', 92, '7C.3');
runValidator('data/pricing/consolidation/validate-7c3-1.js', 77, '7C.3.1');
runValidator('data/pricing/engine/pricing-engine-validator-v1.js', 664, 'Engine schema');
runValidator('data/pricing/engine/tests/engine-tests-v1.js', 209, 'Engine tests');
runValidator('data/pricing/shadow/shadow-validator-v1.js', 24, 'Shadow validator');
runValidator('data/pricing/shadow/validate-7c5-1.js', 66, '7C.5.1');
runValidator('data/pricing/engine/tests/regression-7c5-v1.js', 49, 'Regression 7C.5');
runValidator('data/pricing/orchestration/validate-7c6.js', 84, '7C.6 orchestration design');

// ── 2. ORCHESTRATOR TESTS PASS ───────────────────────────────────────────────
console.log('\n[2] Orchestrator tests');
runValidator('data/pricing/orchestrator/tests/orchestrator-tests-v1.js', 225, 'Orchestrator flow tests (225)');
runValidator('data/pricing/orchestrator/tests/golden-fixtures-test-v1.js', 140, 'Golden orchestration fixtures (24)');

// ── 3. STATE ENUM EXACT ───────────────────────────────────────────────────────
console.log('\n[3] State machine contract');
try {
  var sessModule = require('./estimator-session-v1');
  var expectedStates = ['START','METIER_SELECTION','SERVICE_SELECTION','QUALIFICATION','QUESTION_REQUIRED','READY_FOR_ENGINE','ENGINE_EVALUATION','PRICE_READY','DIAGNOSTIC_READY','LABOUR_PLUS_PART_READY','ADD_ON_READY','QUOTE_REQUIRED','ROUTE_REQUIRED','SAFETY_STOP','REQUALIFY','CONFIRMATION_READY'];
  check(sessModule.VALID_STATES.length === 16, 'Exactly 16 states defined (actual: ' + sessModule.VALID_STATES.length + ')');
  expectedStates.forEach(function(st) {
    check(sessModule.VALID_STATES.includes(st), 'State exists: ' + st);
  });
} catch(e) { check(false, 'State enum', e.message); }

// ── 4. ALL REFERENCED INPUTS CANONICAL ───────────────────────────────────────
console.log('\n[4] All referenced inputs are canonical');
try {
  var inp = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/consolidation/canonical-inputs.v1.draft.json')));
  var validInputs = new Set(Object.keys(inp.inputs));
  var plannerModule = require('./estimator-question-planner-v1');
  var badInputs = [];
  Object.entries(plannerModule.SERVICE_QUESTION_PLANS).forEach(function(e) {
    e[1].questions.forEach(function(q) {
      if (!validInputs.has(q.input_id)) badInputs.push(e[0] + ':' + q.input_id);
    });
  });
  check(badInputs.length === 0, 'All planner input_ids in canonical-inputs', badInputs.join(', ') || null);
} catch(e) { check(false, 'Canonical inputs check', e.message); }

// ── 5. ALL REFERENCED SERVICES CANONICAL ─────────────────────────────────────
console.log('\n[5] All referenced service codes are canonical');
try {
  var reg = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/canonical/canonical-registry.v1.draft.json')));
  var validCodes = new Set(Object.keys(reg.services));
  var plannerModule2 = require('./estimator-question-planner-v1');
  var badCodes = [];
  Object.keys(plannerModule2.SERVICE_QUESTION_PLANS).forEach(function(code) {
    if (!validCodes.has(code)) badCodes.push(code);
  });
  check(badCodes.length === 0, 'All question plan service codes in canonical registry', badCodes.join(', ') || null);
  check(Object.keys(plannerModule2.SERVICE_QUESTION_PLANS).length === 53, 'Question plan covers all 53 services (actual: ' + Object.keys(plannerModule2.SERVICE_QUESTION_PLANS).length + ')');
} catch(e) { check(false, 'Canonical service codes check', e.message); }

// ── 6. ALL NEXT ACTIONS VALID ─────────────────────────────────────────────────
console.log('\n[6] Next action enum valid');
try {
  var mapperModule = require('./estimator-outcome-mapper-v1');
  var expectedActions = ['CONTINUE_TO_RESERVATION','CHOOSE_ARTISAN','REQUEST_QUOTE','BOOK_DIAGNOSTIC','CHANGE_SERVICE','CHANGE_METIER','PROVIDE_MORE_INFORMATION','CONTACT_SUPPORT','STOP_FOR_SAFETY'];
  check(mapperModule.VALID_NEXT_ACTIONS.length === 9, 'Exactly 9 next actions (actual: ' + mapperModule.VALID_NEXT_ACTIONS.length + ')');
  expectedActions.forEach(function(a) {
    check(mapperModule.VALID_NEXT_ACTIONS.includes(a), 'Next action exists: ' + a);
  });
} catch(e) { check(false, 'Next action enum', e.message); }

// ── 7. ENGINE IMPORT ONLY FROM DORMANT ENGINE ─────────────────────────────────
console.log('\n[7] Engine import isolation');
try {
  var orcSrc = fs.readFileSync(path.join(ORC, 'estimator-orchestrator-v1.js'), 'utf8');
  check(/require.*pricing-engine-core-v1/.test(orcSrc), 'Engine core imported from dormant engine');
  check(!/require.*fixeo-estimation-engine-v1/.test(orcSrc), 'No legacy fixeo-estimation-engine-v1 imported');
  check(!/require.*fixeo-pricing-marocain/.test(orcSrc), 'No legacy fixeo-pricing-marocain imported');
  check(!/require.*reservation/.test(orcSrc), 'No legacy reservation imported');
  check(!/require.*js\//.test(orcSrc), 'No direct js/ imports');
} catch(e) { check(false, 'Engine import', e.message); }

// ── 8. NO PRICE FORMULAS DUPLICATED ──────────────────────────────────────────
console.log('\n[8] No duplicate price logic');
try {
  var orcFiles = ['estimator-orchestrator-v1.js', 'estimator-question-planner-v1.js', 'estimator-outcome-mapper-v1.js', 'estimator-handoff-v1.js', 'estimator-session-v1.js', 'estimator-service-resolver-v1.js'];
  orcFiles.forEach(function(f) {
    var src = fs.readFileSync(path.join(ORC, f), 'utf8');
    var codeLines = src.split('\n').filter(function(l) { return l.trim().indexOf('//') !== 0 && l.trim().indexOf('*') !== 0; }).join('\n');
    var hasCalc = /unit_rate_mad\s*\*|fixed_amount_mad\s*[\+\-\*]|labour_amount_mad\s*[\+\-\*]|Math\.(round|max|min)\s*\(.*MAD/.test(codeLines);
    check(!hasCalc, f + ': no price formula code');
  });
} catch(e) { check(false, 'Price formula check', e.message); }

// ── 9. PAINTING CONVERSION ABSENT ────────────────────────────────────────────
console.log('\n[9] Painting floor conversion absent');
try {
  var plannerSrc = fs.readFileSync(path.join(ORC, 'estimator-question-planner-v1.js'), 'utf8');
  check(!/floor_area_m2.*painted_m2|painted_m2\s*=\s*floor/.test(plannerSrc), 'No floor_area→painted_m2 conversion in planner');
  var orcSrc2 = fs.readFileSync(path.join(ORC, 'estimator-orchestrator-v1.js'), 'utf8');
  check(!/floor_area_m2.*painted_m2|painted_m2\s*=\s*floor/.test(orcSrc2), 'No floor_area→painted_m2 conversion in orchestrator');
} catch(e) { check(false, 'Painting conversion check', e.message); }

// ── 10. CITY PRICE LOGIC ABSENT ──────────────────────────────────────────────
console.log('\n[10] City price logic absent');
try {
  var orcSrc3 = fs.readFileSync(path.join(ORC, 'estimator-orchestrator-v1.js'), 'utf8');
  var codeLines3 = orcSrc3.split('\n').filter(function(l) { return l.trim().indexOf('//') !== 0 && l.trim().indexOf('*') !== 0; }).join('\n');
  check(!/city\s*\*\s*[0-9]|city_adjustment\s*=\s*[0-9]/.test(codeLines3), 'No city price multiplier code in orchestrator');
} catch(e) { check(false, 'City price check', e.message); }

// ── 11. URGENCY PRICE LOGIC ABSENT ───────────────────────────────────────────
console.log('\n[11] Urgency price logic absent');
try {
  var orcSrc4 = fs.readFileSync(path.join(ORC, 'estimator-orchestrator-v1.js'), 'utf8');
  var codeLines4 = orcSrc4.split('\n').filter(function(l) { return l.trim().indexOf('//') !== 0 && l.trim().indexOf('*') !== 0; }).join('\n');
  check(!/urgency\s*\*\s*[0-9]|urgency_modifier\s*=\s*[0-9]/.test(codeLines4), 'No urgency price multiplier code in orchestrator');
} catch(e) { check(false, 'Urgency price check', e.message); }

// ── 12. MENUISERIE BATCH ABSENT ──────────────────────────────────────────────
console.log('\n[12] Menuiserie batch rules properly dormant');
try {
  var plannerSrc2 = fs.readFileSync(path.join(ORC, 'estimator-question-planner-v1.js'), 'utf8');
  check(!/\+50|\+100|batch.*rate|hinge_count\s*\*/.test(plannerSrc2), 'No batch +50/+100 increment in planner');
  var orcSrc5 = fs.readFileSync(path.join(ORC, 'estimator-orchestrator-v1.js'), 'utf8');
  check(/MENUISERIE_BATCH_QUOTE_FIELDS/.test(orcSrc5), 'Menuiserie batch handled via QUOTE_REQUIRED routing');
} catch(e) { check(false, 'Menuiserie batch check', e.message); }

// ── 13. ALL 8 MÉTIERS TESTED ─────────────────────────────────────────────────
console.log('\n[13] All 8 métiers tested in orchestration');
try {
  var testReport = JSON.parse(fs.readFileSync(path.join(ORC, 'orchestrator-test-report.v1.json')));
  check(testReport.metier_coverage.covered === 8, '8 métiers covered');
  ['plomberie','electricite','serrurerie','climatisation','bricolage','nettoyage','peinture','menuiserie'].forEach(function(m) {
    check(testReport.metier_coverage.list.includes(m), 'Métier tested: ' + m);
  });
} catch(e) { check(false, '8 métiers check', e.message); }

// ── 14. ALL OUTCOME TYPES TESTED ─────────────────────────────────────────────
console.log('\n[14] All outcome types tested');
try {
  var testReport2 = JSON.parse(fs.readFileSync(path.join(ORC, 'orchestrator-test-report.v1.json')));
  var outcomeList = ['PRICE_READY','DIAGNOSTIC_READY','LABOUR_PLUS_PART_READY','ADD_ON_READY','QUOTE_REQUIRED','ROUTE_REQUIRED','SAFETY_STOP'];
  outcomeList.forEach(function(o) {
    check(testReport2.outcome_coverage.list.includes(o), 'Outcome tested: ' + o);
  });
  check(testReport2.outcome_coverage.covered >= 7, 'At least 7 outcome types covered');
} catch(e) { check(false, 'Outcome types check', e.message); }

// ── 15. PRICING TOKEN NON-PRODUCTION ─────────────────────────────────────────
console.log('\n[15] Pricing context token non-production');
try {
  var orc = require('./estimator-orchestrator-v1');
  var sess = require('./estimator-session-v1');
  // Build a minimal PRICE_READY session
  var s = sess.createSession({ session_id: 'val_test_001' });
  s = sess.cloneSession(s, {
    state: 'PRICE_READY',
    service_code: 'plomberie.debouchage_evier',
    metier: 'plomberie',
    outcome: { outcome_type: 'PRICE_READY', commercial_output_type: 'FIXEO_PRICE', price: { amount_mad: 250, labour_amount_mad: null, currency: 'MAD' }, next_action: 'CONTINUE_TO_RESERVATION' },
  });
  var tokenR = orc.buildPricingContextToken(s);
  check(tokenR.ok, 'Token builds from PRICE_READY session');
  check(tokenR.token.production_valid === false, 'production_valid = false');
  check(tokenR.token.signature === null, 'signature = null (no crypto)');
  check(tokenR.token.token_version === '1.0.0-dormant', 'token_version = 1.0.0-dormant');
  // Non-final state rejected
  var s2 = sess.createSession();
  var tr2 = orc.buildPricingContextToken(s2);
  check(!tr2.ok && tr2.error.code === 'SESSION_NOT_FINAL', 'Token rejected for non-final state');
} catch(e) { check(false, 'Pricing token check', e.message); }

// ── 16. PRODUCTION RUNTIME REFS = 0 ──────────────────────────────────────────
console.log('\n[16] Runtime isolation');
try {
  var grep = '';
  try {
    grep = execSync(
      "grep -r 'pricing-engine\\|canonical-registry\\.v1\\.draft\\|pricing/orchestrator\\|pricing/engine' --include='*.js' --include='*.html' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git .",
      { cwd: REPO, encoding: 'utf8' }
    ).trim();
  } catch(ge) { grep = ge.status === 1 ? '' : (ge.stdout || ''); }
  var nonPricing = (grep || '').split('\n').filter(function(l) {
    return l && !l.includes('data/pricing/') && !l.includes('data\\pricing\\');
  });
  check(nonPricing.length === 0, '0 runtime refs to engine/orchestrator outside data/pricing/', nonPricing.length ? nonPricing[0].slice(0,80) : null);
} catch(e) { check(false, 'Runtime isolation', e.message.slice(0,80)); }

// ── 17. PRODUCTION DIFF = 0 ──────────────────────────────────────────────────
console.log('\n[17] Production diff = 0');
try {
  var diff = execSync('git diff --name-only HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  var nonPricingDiff = diff.split('\n').filter(function(l) { return l && !l.startsWith('data/pricing/'); });
  check(nonPricingDiff.length === 0, 'Production runtime diff = 0', nonPricingDiff.join(', ') || null);
} catch(e) { check(false, 'Production diff', e.message); }

// ── 18. ENGINE DORMANT ────────────────────────────────────────────────────────
console.log('\n[18] Engine still dormant');
try {
  var freeze = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/shadow/shadow-freeze-manifest.v1.json')));
  check(freeze.production_active === false, 'Engine production_active = false');
  check(freeze.production_ready === false, 'Engine production_ready = false');
} catch(e) { check(false, 'Engine dormant check', e.message); }

// ── 19. ORCHESTRATOR DORMANT ──────────────────────────────────────────────────
console.log('\n[19] Orchestrator dormant');
try {
  var rpt = JSON.parse(fs.readFileSync(path.join(ORC, 'orchestrator-test-report.v1.json')));
  check(rpt.production_active === false, 'Orchestrator production_active = false');
  check(rpt.orchestrator_dormant === true, 'Orchestrator orchestrator_dormant = true');
  check(rpt.production_references_in_runtime === 0, 'Orchestrator production_references_in_runtime = 0');
} catch(e) { check(false, 'Orchestrator dormant check', e.message); }

// ── 20. SECURITY ──────────────────────────────────────────────────────────────
console.log('\n[20] Security');
try {
  var orcSrc6 = fs.readFileSync(path.join(ORC, 'estimator-orchestrator-v1.js'), 'utf8');
  check(!/eval\s*\(/.test(orcSrc6), 'No eval() in orchestrator');
  check(!/new Function\s*\(/.test(orcSrc6), 'No new Function() in orchestrator');
  var codeLines6 = orcSrc6.split('\n').filter(function(l) { return l.trim().indexOf('//') !== 0 && l.trim().indexOf('*') !== 0; }).join('\n');
  check(!/localStorage\./.test(codeLines6), 'No localStorage API calls');
  check(!/document\.(getElementById|querySelector)/.test(codeLines6), 'No DOM API calls');
  check(!/supabase\.(from|auth|storage)/.test(codeLines6.toLowerCase()), 'No Supabase API calls');
} catch(e) { check(false, 'Security check', e.message); }

// ── 21. REQUIRED FILES EXIST ─────────────────────────────────────────────────
console.log('\n[21] Required files exist');
[
  'estimator-orchestrator-v1.js',
  'estimator-session-v1.js',
  'estimator-question-planner-v1.js',
  'estimator-service-resolver-v1.js',
  'estimator-outcome-mapper-v1.js',
  'estimator-handoff-v1.js',
  'validate-orchestrator-v1.js',
  'tests/orchestrator-tests-v1.js',
  'tests/golden-fixtures-test-v1.js',
  'fixtures/golden-orchestration-fixtures.v1.json',
  'README.md',
  'orchestrator-test-report.v1.json',
].forEach(function(f) {
  check(fs.existsSync(path.join(ORC, f)), 'File exists: ' + f);
});

// ── RESULT ────────────────────────────────────────────────────────────────────
var total = pass + fail;
console.log('\n' + SEP);
console.log('ORCHESTRATOR VALIDATOR \u2014 RESULT');
console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + total);
if (fail > 0) {
  console.log('\n  FAILURES:');
  errors.forEach(function(e) { console.log('    \u274c ' + e); });
}
console.log('\n  Status: ' + (fail === 0 ? '\u2705 ALL CHECKS PASSED' : '\u274c ' + fail + ' CHECK(S) FAILED'));
console.log(SEP + '\n');
process.exit(fail > 0 ? 1 : 0);
