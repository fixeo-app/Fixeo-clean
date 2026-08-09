'use strict';
/**
 * FIXEO Estimator — Phase 7C.6 Validator
 * Orchestration Design & Flow Contract
 *
 * DORMANT — no production modification.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '../../../');
const ORC  = __dirname;
let pass = 0, fail = 0;
const errors = [];

function check(condition, label, hint) {
  if (condition) { pass++; process.stdout.write('  \u2705 ' + label + '\n'); }
  else { fail++; errors.push(label + (hint ? ': ' + hint : '')); process.stdout.write('  \u274c FAIL: ' + label + (hint ? ' \u2014 ' + hint : '') + '\n'); }
}

function runValidator(file, minPass, label) {
  try {
    const out = execSync('node ' + file, { cwd: REPO, encoding: 'utf8' });
    // Use last PASS: line (summary) not first (individual checks)
    var allMatches = out.match(/^\s*PASS:\s*(\d+)/gm);
    var lastMatch = allMatches ? allMatches[allMatches.length - 1].match(/(\d+)/) : null;
    const p = lastMatch ? parseInt(lastMatch[1]) : 0;
    const anyFail = out.match(/^\s*FAIL:\s*[1-9]/m);
    check(!anyFail && p >= minPass, label + ' \u2265 ' + minPass + ' PASS (got ' + p + ')', anyFail ? 'Failures present' : p < minPass ? 'Count too low' : null);
  } catch(e) { check(false, label, e.message.slice(0,80)); }
}

const SEP = '\u2550'.repeat(63);
console.log('\n' + SEP);
console.log('FIXEO ESTIMATOR \u2014 PHASE 7C.6 VALIDATOR');
console.log('Orchestration Design & Flow Contract');
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
runValidator('data/pricing/shadow/validate-7c5-1.js', 66, 'Post-shadow audit 7C.5.1');
runValidator('data/pricing/engine/tests/regression-7c5-v1.js', 49, 'Regression 7C.5');

// ── 2. 53 SERVICES UNCHANGED ─────────────────────────────────────────────────
console.log('\n[2] 53 canonical services unchanged');
try {
  const reg = JSON.parse(fs.readFileSync(path.join(REPO,'data/pricing/canonical/canonical-registry.v1.draft.json')));
  const count = Object.keys(reg.services).length;
  check(count === 53, '53 services in registry (actual: ' + count + ')');
  // Approved prices spot checks
  const { evaluateFixeoPrice } = require('../engine/pricing-engine-core-v1');
  [
    ['plomberie.diagnostic',{},180],
    ['electricite.diagnostic',{},200],
    ['serrurerie.porte_claquee_ouverture',{},220],
    ['bricolage.montage_meuble',{item_count:2},400],
    ['peinture.mur_interieur.all_in',{painted_m2:15},975],
  ].forEach(function(c) {
    var r = evaluateFixeoPrice({ service_code:c[0], inputs:c[1] });
    check(r.ok && r.pricing.final_amount_mad === c[2], 'Price unchanged: '+c[0]+' → '+c[2]+' MAD', r.ok ? 'got '+r.pricing.final_amount_mad : (r.error&&r.error.code)||'not ok');
  });
} catch(e) { check(false, '53 services unchanged', e.message); }

// ── 3. ALL REFERENCED SERVICE CODES EXIST ────────────────────────────────────
console.log('\n[3] All referenced service codes exist in canonical registry');
try {
  const reg = JSON.parse(fs.readFileSync(path.join(REPO,'data/pricing/canonical/canonical-registry.v1.draft.json')));
  const validCodes = new Set(Object.keys(reg.services));
  const scenarios = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-flow-scenarios.v1.json')));
  var badCodes = [];
  scenarios.scenarios.forEach(function(s) {
    if (s.service_code && !validCodes.has(s.service_code)) badCodes.push(s.id+':'+s.service_code);
  });
  check(badCodes.length === 0, 'All scenario service codes exist in canonical registry', badCodes.join(', ') || null);
  // Entry points
  const ep = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-entrypoints.v1.draft.json')));
  var badEP = [];
  Object.values(ep.entry_modes).forEach(function(m) {
    if (m.initial_payload && m.initial_payload.service_hint && m.initial_payload.service_hint !== '{from_url}' && !validCodes.has(m.initial_payload.service_hint)) {
      badEP.push(m.id+':'+m.initial_payload.service_hint);
    }
  });
  check(badEP.length === 0, 'All entry point service_hints exist in canonical registry', badEP.join(', ') || null);
} catch(e) { check(false, 'Service code references', e.message); }

// ── 4. ALL INPUT REFS EXIST ───────────────────────────────────────────────────
console.log('\n[4] All referenced input ids exist in canonical-inputs');
try {
  const inp = JSON.parse(fs.readFileSync(path.join(REPO,'data/pricing/consolidation/canonical-inputs.v1.draft.json')));
  const validInputs = new Set(Object.keys(inp.inputs));
  const planner = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-question-planner.v1.draft.json')));
  var badInputs = [];
  Object.values(planner.safety_inputs_by_metier).forEach(function(arr) {
    arr.forEach(function(id) { if (!validInputs.has(id)) badInputs.push(id); });
  });
  Object.values(planner.service_simple_flows).forEach(function(f) {
    ['safety_questions','routing_questions','eligibility_questions','quantity_questions'].forEach(function(k) {
      if (f[k]) f[k].forEach(function(id) { if (!validInputs.has(id)) badInputs.push(id); });
    });
  });
  check(badInputs.length === 0, 'All planner input refs exist in canonical-inputs', badInputs.join(', ') || null);
} catch(e) { check(false, 'Input ref check', e.message); }

// ── 5. ALL OUTCOME TYPES VALID ────────────────────────────────────────────────
console.log('\n[5] All outcome types and next actions valid');
try {
  const outcomes = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-outcomes.v1.draft.json')));
  const validOutcomes = new Set(Object.keys(outcomes.outcome_types));
  const validNextActions = new Set(outcomes.next_action_enum);
  // Check state machine references
  const sm = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-state-machine.v1.draft.json')));
  var badActions = [];
  Object.values(sm.states).forEach(function(s) {
    if (s.next_actions) s.next_actions.forEach(function(a) { if (!validNextActions.has(a)) badActions.push(a); });
  });
  check(validOutcomes.size >= 8, 'At least 8 outcome types defined (actual: '+validOutcomes.size+')');
  check(validNextActions.size >= 9, 'At least 9 next actions defined (actual: '+validNextActions.size+')');
  check(badActions.length === 0, 'All state machine next_actions in enum', badActions.join(', ') || null);
} catch(e) { check(false, 'Outcome types valid', e.message); }

// ── 6. NO PRICE FORMULA IN ORCHESTRATOR ──────────────────────────────────────
console.log('\n[6] No price formula / calculation in orchestrator artifacts');
try {
  var orcFiles = fs.readdirSync(ORC).filter(function(f) { return f.endsWith('.json') || f.endsWith('.md'); });
  var pricingPatterns = [
    'unit_rate_mad', 'fixed_amount_mad', 'labour_amount_mad', 'diagnostic_price_mad',
    'Math.round', 'Math.max', 'Math.min', '* rate', '× rate',
  ];
  // These are OK when referenced as field names in schema docs, not as calculations
  var calcPatterns = ['FORMULA-UNIT-V1', 'FORMULA-FIXED-V1', 'FORMULA-DIAGNOSTIC-V1'];
  // Flag only if it looks like a formula application (has = or :)
  orcFiles.forEach(function(f) {
    if (f === 'validate-7c6.js' || f === 'README.md') return;
    var src = fs.readFileSync(path.join(ORC, f), 'utf8');
    // Only flag actual price computation: Math.round/max/min with MAD, direct price formula application
    // Not documentation examples like "15×65=975" in a scenario, or "44px" in a CSS note
    var codeLines = src.split('\n').filter(function(l) {
      var t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#') && !t.startsWith('"note"') && !t.startsWith('"expected_amount"');
    });
    // Flag only genuine JS price computation: unit_rate * qty, fixed_amount + fee
    // NOT documentation references to evaluateFixeoPrice (correct mentions)
    var hasCalcCode = codeLines.some(function(l) {
      return /Math\.(round|max|min)\s*\(.*MAD/.test(l) ||
             /unit_rate_mad\s*\*/.test(l) ||
             /fixed_amount_mad\s*[\+\-\*]/.test(l) ||
             /labour_amount_mad\s*[\+\-\*]/.test(l);
    });
    check(!hasCalcCode, f + ': no inline price formula/calculation code', hasCalcCode ? 'contains price computation code' : null);
  });
} catch(e) { check(false, 'No price formula check', e.message); }

// ── 7. NO CITY PRICE LOGIC ────────────────────────────────────────────────────
console.log('\n[7] No city price logic in orchestration design');
try {
  var oc = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  check(oc.city_behavior && oc.city_behavior.city_affects_price === false, 'city_affects_price = false in contract');
  check(oc.city_behavior && oc.city_behavior.city_adjustment === null, 'city_adjustment = null in contract');
  var src = JSON.stringify(oc);
  var hasCityMultiplier = /city.*1\.1[0-9]|city.*1\.0[0-9]|x1\.[0-9].*city/i.test(src);
  check(!hasCityMultiplier, 'No city multiplier in orchestration contract');
} catch(e) { check(false, 'No city price logic', e.message); }

// ── 8. NO URGENCY PRICE LOGIC ─────────────────────────────────────────────────
console.log('\n[8] No urgency price logic in orchestration design');
try {
  var oc2 = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  check(oc2.urgency_behavior && oc2.urgency_behavior.urgency_affects_price === false, 'urgency_affects_price = false in contract');
  check(oc2.urgency_behavior && oc2.urgency_behavior.urgency_modifier === null, 'urgency_modifier = null in contract');
} catch(e) { check(false, 'No urgency price logic', e.message); }

// ── 9. NO LEGACY PRICE FALLBACK ───────────────────────────────────────────────
console.log('\n[9] No legacy price fallback in orchestration design');
try {
  var oc3 = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  var forbidden = oc3.canonical_authority && oc3.canonical_authority.forbidden_pricing_sources;
  check(forbidden && forbidden.length >= 4, 'Forbidden legacy pricing sources listed ('+((forbidden&&forbidden.length)||0)+')');
  check(oc3.canonical_authority && oc3.canonical_authority.no_legacy_fallback === true, 'no_legacy_fallback = true');
  check(oc3.canonical_authority && oc3.canonical_authority.no_dual_authority === true, 'no_dual_authority = true');
  check(oc3.canonical_authority && oc3.canonical_authority.sole_price_calculator === 'FIXEO_PRICING_ENGINE_CORE_V1', 'sole_price_calculator = FIXEO_PRICING_ENGINE_CORE_V1');
} catch(e) { check(false, 'No legacy fallback', e.message); }

// ── 10. NO FIXEO_ESTIMATE FOR 53 SERVICES ────────────────────────────────────
console.log('\n[10] FIXEO_ESTIMATE count = 0 for standardized 53');
try {
  var reg2 = JSON.parse(fs.readFileSync(path.join(REPO,'data/pricing/canonical/canonical-registry.v1.draft.json')));
  var estimateServices = Object.entries(reg2.services).filter(function(e) { return e[1].price_model && e[1].price_model.commercial_output_type === 'FIXEO_ESTIMATE'; });
  check(estimateServices.length === 0, 'FIXEO_ESTIMATE services = 0 (all 53 have contractual output types)');
} catch(e) { check(false, 'FIXEO_ESTIMATE check', e.message); }

// ── 11. PAINTED_M2 DIRECT MEASUREMENT ────────────────────────────────────────
console.log('\n[11] Painted m² doctrine preserved');
try {
  var oc4 = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  var pm = oc4.painting_ux_contract;
  check(pm && pm.required_input === 'painted_m2', 'painting required_input = painted_m2');
  check(pm && pm.measurement_strategy === 'DIRECT_CANONICAL_MEASUREMENT', 'measurement_strategy = DIRECT_CANONICAL_MEASUREMENT');
  check(pm && pm.client_does_not_know && pm.client_does_not_know.flow === 'GUIDED_MEASUREMENT_ASSISTANT', 'client_unknown → GUIDED_MEASUREMENT_ASSISTANT');
  check(pm && pm.client_does_not_know && pm.client_does_not_know.status === 'DESIGN_DEPENDENCY', 'GUIDED_MEASUREMENT_ASSISTANT = DESIGN_DEPENDENCY (not implemented)');
  var forbidConvert = pm && pm.client_does_not_know && pm.client_does_not_know.floor_to_painted_conversion;
  check(forbidConvert === 'FORBIDDEN_IN_ENGINE_AND_ORCHESTRATOR', 'floor_to_painted_conversion = FORBIDDEN');
} catch(e) { check(false, 'Painted m² doctrine', e.message); }

// ── 12. MENUISERIE BATCH DORMANT ─────────────────────────────────────────────
console.log('\n[12] Menuiserie batch rules dormant');
try {
  var oc5 = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  var mu = oc5.menuiserie_ux_contract;
  check(mu && mu.hinge_count && mu.hinge_count.if_gt_1 === 'QUOTE_REQUIRED', 'hinge_count > 1 → QUOTE_REQUIRED');
  check(mu && mu.hinge_count && mu.hinge_count.batch_rules && mu.hinge_count.batch_rules.includes('DORMANT'), 'hinge batch rules DORMANT');
  check(mu && mu.drawer_count && mu.drawer_count.if_gt_1 === 'QUOTE_REQUIRED', 'drawer_count > 1 → QUOTE_REQUIRED');
  check(mu && mu.drawer_count && mu.drawer_count.batch_rules && mu.drawer_count.batch_rules.includes('DORMANT'), 'drawer batch rules DORMANT');
} catch(e) { check(false, 'Menuiserie batch dormant', e.message); }

// ── 13. DIAGNOSTIC DOCTRINES SEPARATE ────────────────────────────────────────
console.log('\n[13] Diagnostic doctrines separate per métier');
try {
  var oc6 = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  var diag = oc6.diagnostic_ux_contract;
  check(diag && diag.no_universal_absorption === true, 'no_universal_absorption = true');
  check(diag && diag.diagnostic_metiers && diag.diagnostic_metiers.length === 3, 'Exactly 3 diagnostic métiers (plomberie, electricite, climatisation)');
  check(diag && diag.absorption_doctrine && diag.absorption_doctrine.plomberie && diag.absorption_doctrine.electricite && diag.absorption_doctrine.climatisation, 'Absorption doctrine defined per-métier');
} catch(e) { check(false, 'Diagnostic doctrines', e.message); }

// ── 14. ENGINE SOLE CALCULATOR ────────────────────────────────────────────────
console.log('\n[14] Engine is sole price calculator');
try {
  var api = JSON.parse(fs.readFileSync(path.join(ORC,'orchestrator-api.v1.draft.json')));
  var evalFn = api.api_functions && api.api_functions.evaluateEstimator;
  check(evalFn && evalFn.calls && evalFn.calls.includes('evaluateFixeoPrice'), 'evaluateEstimator calls evaluateFixeoPrice');
  check(evalFn && evalFn.calls && evalFn.calls.includes('ONLY price source'), 'evaluateFixeoPrice marked as ONLY price source');
} catch(e) { check(false, 'Engine sole calculator', e.message); }

// ── 15. PRODUCTION ACTIVATION BLOCKED ────────────────────────────────────────
console.log('\n[15] Production activation blocked');
try {
  var oc7 = JSON.parse(fs.readFileSync(path.join(REPO,'data/pricing/shadow/shadow-freeze-manifest.v1.json')));
  check(oc7.production_active === false, 'engine production_active = false');
  check(oc7.production_ready === false, 'engine production_ready = false');
  // Confirm orchestration design acknowledges production blockers
  var uxarch = fs.readFileSync(path.join(ORC,'estimator-ux-architecture.v1.md'), 'utf8');
  check(uxarch.includes('PRODUCTION ACTIVATION GATES'), 'UX architecture documents production activation gates');
  check(uxarch.includes('HRQ-002'), 'HRQ-002 (painted m² UX) referenced as production blocker');
} catch(e) { check(false, 'Production activation blocked', e.message); }

// ── 16. RUNTIME ISOLATION ─────────────────────────────────────────────────────
console.log('\n[16] Runtime isolation');
try {
  var grepResult = '';
  try {
    grepResult = execSync(
      "grep -r 'pricing-engine\\|canonical-registry\\.v1\\.draft\\|pricing/orchestration' --include='*.js' --include='*.html' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git .",
      { cwd: REPO, encoding: 'utf8' }
    ).trim();
  } catch(ge) { grepResult = (ge.status === 1) ? '' : (ge.stdout || ''); }
  var nonPricing = (grepResult || '').split('\n').filter(function(l) {
    return l && !l.includes('data/pricing/') && !l.includes('data\\pricing\\');
  });
  check(nonPricing.length === 0, '0 runtime references outside data/pricing/', nonPricing.length ? nonPricing[0] : null);
} catch(e) { check(false, 'Runtime isolation', e.message.slice(0,80)); }

// ── 17. PRODUCTION DIFF = 0 ───────────────────────────────────────────────────
console.log('\n[17] Production diff = 0');
try {
  var diffRaw = execSync('git diff --name-only HEAD', { cwd: REPO, encoding:'utf8' }).trim();
  var nonPricingDiff = diffRaw.split('\n').filter(function(l) { return l && !l.startsWith('data/pricing/'); });
  check(nonPricingDiff.length === 0, 'Production runtime diff = 0', nonPricingDiff.join(', ') || null);
} catch(e) { check(false, 'Production diff', e.message); }

// ── 18. FLOW SCENARIOS COUNT ──────────────────────────────────────────────────
console.log('\n[18] Flow scenarios');
try {
  var scenarios = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-flow-scenarios.v1.json')));
  check(scenarios.scenarios.length >= 30, 'At least 30 flow scenarios (actual: '+scenarios.scenarios.length+')');
  var metiersCovered = new Set(scenarios.scenarios.map(function(s) { return s.metier; }));
  check(metiersCovered.size >= 8, 'All 8 métiers covered in scenarios (actual: '+metiersCovered.size+')');
  var hasSafety = scenarios.scenarios.some(function(s) { return s.expected_state === 'SAFETY_STOP'; });
  var hasRoute = scenarios.scenarios.some(function(s) { return s.expected_state === 'ROUTE_REQUIRED'; });
  var hasQuote = scenarios.scenarios.some(function(s) { return s.expected_state === 'QUOTE_REQUIRED' || (s.expected_outcome && s.expected_outcome === 'QUOTE_REQUIRED'); });
  var hasCity = scenarios.scenarios.some(function(s) { return s.city_slug_a && s.city_slug_b; });
  var hasUrgency = scenarios.scenarios.some(function(s) { return s.urgency; });
  check(hasSafety, 'Safety stop scenario present');
  check(hasRoute, 'Route required scenario present');
  check(hasQuote, 'Quote required scenario present');
  check(hasCity, 'City neutrality scenario present');
  check(hasUrgency, 'Urgency neutrality scenario present');
} catch(e) { check(false, 'Flow scenarios', e.message); }

// ── 19. ESTIMATOR/RESERVATION SEPARATION ─────────────────────────────────────
console.log('\n[19] Estimator/Reservation separation');
try {
  var hc = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-handoff-contract.v1.draft.json')));
  check(hc.estimator_reservation_boundary && hc.estimator_reservation_boundary.no_recalculation === true, 'Reservation no_recalculation = true');
  check(hc.estimator_reservation_boundary && hc.estimator_reservation_boundary.legacy_not_consulted === true, 'Reservation legacy_not_consulted = true');
  var oc8 = JSON.parse(fs.readFileSync(path.join(ORC,'estimator-orchestration-contract.v1.draft.json')));
  var sep = oc8.estimation_reservation_separation;
  check(sep && sep.estimator_excludes && sep.estimator_excludes.includes('calendar'), 'Estimator excludes calendar');
  check(sep && sep.estimator_excludes && sep.estimator_excludes.includes('payment'), 'Estimator excludes payment');
} catch(e) { check(false, 'Estimator/reservation separation', e.message); }

// ── 20. ARTIFACTS EXIST ───────────────────────────────────────────────────────
console.log('\n[20] Required artifacts exist');
var requiredFiles = [
  'estimator-orchestration-contract.v1.draft.json',
  'estimator-state-machine.v1.draft.json',
  'estimator-entrypoints.v1.draft.json',
  'estimator-question-planner.v1.draft.json',
  'estimator-outcomes.v1.draft.json',
  'estimator-handoff-contract.v1.draft.json',
  'estimator-flow-scenarios.v1.json',
  'orchestrator-api.v1.draft.json',
  'estimator-ux-architecture.v1.md',
  'phase-7c6-report.md',
  'validate-7c6.js',
  'README.md',
];
requiredFiles.forEach(function(f) {
  check(fs.existsSync(path.join(ORC, f)), 'Artifact exists: ' + f);
});

// ── RESULT ─────────────────────────────────────────────────────────────────────
var total = pass + fail;
console.log('\n' + SEP);
console.log('PHASE 7C.6 VALIDATOR \u2014 RESULT');
console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + total);
if (fail > 0) {
  console.log('\n  FAILURES:');
  errors.forEach(function(e) { console.log('    \u274c ' + e); });
}
console.log('\n  Status: ' + (fail === 0 ? '\u2705 ALL CHECKS PASSED' : '\u274c ' + fail + ' CHECK(S) FAILED'));
console.log(SEP + '\n');
process.exit(fail > 0 ? 1 : 0);
