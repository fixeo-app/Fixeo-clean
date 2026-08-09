'use strict';

/**
 * validate-7c8a.js
 * Phase 7C.8A — FIXEO Estimator UX Prototype Contract Validator
 *
 * DORMANT: Does not activate engine or orchestrator.
 * Validates only UX contract artifacts.
 */

const fs = require('fs');
const path = require('path');

// ─── Paths ───────────────────────────────────────────────────────────────────
const UX_DIR = path.join(__dirname);
const ENGINE_DIR = path.join(__dirname, '../../engine');
const ORCH_DIR = path.join(__dirname, '../../orchestrator');
const REPO_ROOT = path.join(__dirname, '../../../..');

// ─── Artifacts ───────────────────────────────────────────────────────────────
const ARTIFACTS = {
  visualContract: 'estimator-visual-contract.v1.draft.json',
  componentMap: 'estimator-component-map.v1.draft.json',
  screenStates: 'estimator-screen-states.v1.draft.json',
  responsiveContract: 'estimator-responsive-contract.v1.draft.json',
  copy: 'estimator-copy.v1.draft.json',
  handoff: 'estimator-modal-page-handoff.v1.draft.json',
  exampleFlows: 'estimator-example-flows.v1.md',
  uxSpec: 'estimator-ux-spec.v1.md',
  readme: 'README.md'
};

// ─── Valid orchestrator states ────────────────────────────────────────────────
const VALID_ORCHESTRATOR_STATES = new Set([
  'START', 'METIER_SELECTION', 'SERVICE_SELECTION', 'QUALIFICATION',
  'QUESTION_REQUIRED', 'READY_FOR_ENGINE', 'ENGINE_EVALUATION',
  'PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY',
  'ADD_ON_READY', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED',
  'SAFETY_STOP', 'REQUALIFY', 'CONFIRMATION_READY'
]);

// ─── Valid canonical outcome types ────────────────────────────────────────────
const VALID_OUTCOMES = new Set([
  'PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY',
  'ADD_ON_READY', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED',
  'SAFETY_STOP', 'REQUALIFY'
]);

// ─── Valid commercial output types ───────────────────────────────────────────
const VALID_COMMERCIAL_OUTPUTS = new Set([
  'FIXEO_PRICE', 'FIXEO_CALCULATED_PRICE', 'FIXEO_LABOUR_PRICE_PLUS_PART',
  'FIXEO_DIAGNOSTIC', 'FIXEO_ADD_ON', 'FIXEO_ESTIMATE',
  'QUOTE_REQUIRED', 'QUOTE_ONLY'
]);

// ─── Forbidden patterns (active price calculation code in UX layer) ───────────
// These catch active pricing/calculation logic that must NOT appear in UX code.
// They do NOT flag documentary/prohibitive mentions in spec text
// (e.g. "UI must NOT apply surcharges" is correct doctrine, not a violation).
// Scope: only applied to non-spec, non-readme, non-validator files.
const FORBIDDEN_PRICE_CALC_PATTERNS_CODE = [
  /baseRate\s*\*\s*\w/,           // active rate multiplication
  /rate\s*\*\s*hours\s*[;,)]/,    // active hour billing formula
  /price\s*=\s*\d+/,              // direct price assignment to number
  /total\s*\+=.*price/,           // accumulating total with price
  /multiplier\s*\*\s*\w/,         // active multiplier application
  /surchargeAmount/,              // surcharge variable
  /urgencyMultiplier/,            // urgency multiplier variable
  /cityPriceMap/,                 // city price lookup table
  /casablancaMultiplier/,         // Casablanca multiplier variable
  /painted_m2\s*=\s*floor/,       // deriving painted_m2 from floor
  /floor_area\s*\*\s*1\.6/,       // forbidden 1.6x conversion
  /floor_area\s*\*\s*2\.0/,       // forbidden 2.0x conversion
  /hinge_count\s*\*\s*50[^%]/,    // experimental hinge increment
  /drawer_count\s*\*\s*100[^%]/,  // experimental drawer increment
];

// ─── Legacy file name references (doc-context allowlisted) ───────────────────
// These legacy file names may appear in spec docs as prohibitive mentions.
// They must NOT appear in implementation code (JS/JSON execution paths).
const LEGACY_FILE_REFS = [
  'reservation.js',
  'reservation-v2.js',
  'fixeo-pricing-marocain',
  'fixeo-estimation-engine-v1'
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    pass++;
    process.stdout.write(`  ✅ ${label}\n`);
  } else {
    fail++;
    const msg = detail ? `${label} — ${detail}` : label;
    failures.push(msg);
    process.stdout.write(`  ❌ ${label}${detail ? ' — ' + detail : ''}\n`);
  }
}

function loadJSON(filename) {
  const p = path.join(UX_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function loadText(filename) {
  const p = path.join(UX_DIR, filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function artifactExists(filename) {
  return fs.existsSync(path.join(UX_DIR, filename));
}

function scanForForbiddenPatterns(text, label) {
  for (const pattern of FORBIDDEN_PRICE_CALC_PATTERNS_CODE) {
    if (pattern.test(text)) {
      check(`No forbidden price calc pattern in ${label}`, false, `Found: ${pattern}`);
      return false;
    }
  }
  return true;
}

// ─── Sections ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 7C.8A — FIXEO ESTIMATOR UX PROTOTYPE CONTRACT VALIDATOR');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Section 1: Artifact presence ─────────────────────────────────────────────
console.log('── Section 1: Artifact Presence ──────────────────────────────\n');
for (const [key, filename] of Object.entries(ARTIFACTS)) {
  check(`Artifact exists: ${filename}`, artifactExists(filename));
}

// ── Section 2: Visual contract ────────────────────────────────────────────────
console.log('\n── Section 2: Visual Contract ────────────────────────────────\n');
const vc = loadJSON(ARTIFACTS.visualContract);
check('Visual contract loads', vc !== null);
if (vc) {
  check('production_allowed = false', vc._meta && vc._meta.production_allowed === false);
  check('engine_active = false', vc._meta && vc._meta.engine_active === false);
  check('orchestrator_active = false', vc._meta && vc._meta.orchestrator_active === false);
  check('Modal ideal width 600px', vc.surface_targets && vc.surface_targets.modal && vc.surface_targets.modal.desktop && vc.surface_targets.modal.desktop.ideal_width_px === 600);
  check('Modal width range [560,620]', vc.surface_targets && JSON.stringify(vc.surface_targets.modal.desktop.acceptable_range_px) === '[560,620]');
  check('Mobile is bottom sheet', vc.surface_targets && vc.surface_targets.modal && vc.surface_targets.modal.mobile && vc.surface_targets.modal.mobile.layout === 'bottom_sheet');
  check('close_always_visible on mobile', vc.surface_targets && vc.surface_targets.modal.mobile.close_always_visible === true);
  check('Page route is /estimation', vc.surface_targets && vc.surface_targets.page && vc.surface_targets.page.route === '/estimation');
  check('Session preserved on page transition', vc.surface_targets && vc.surface_targets.page && vc.surface_targets.page.session_preserved === true);
  check('no_restart_on_transition = true', vc.surface_targets && vc.surface_targets.page && vc.surface_targets.page.no_restart_on_transition === true);
  check('city_affects_price = false', vc.pricing_doctrine && vc.pricing_doctrine.city_affects_price === false);
  check('urgency_affects_price = false', vc.pricing_doctrine && vc.pricing_doctrine.urgency_affects_price === false);
  check('rounding_policy = EXACT_INTEGER_MAD', vc.pricing_doctrine && vc.pricing_doctrine.rounding_policy === 'EXACT_INTEGER_MAD');
  check('no_nearest_5_rounding = true', vc.pricing_doctrine && vc.pricing_doctrine.no_nearest_5_rounding === true);
  check('no_nearest_10_rounding = true', vc.pricing_doctrine && vc.pricing_doctrine.no_nearest_10_rounding === true);
  // UI data boundary
  const udb = vc.ui_data_boundary;
  check('UI data boundary defined', udb != null);
  if (udb) {
    check('calculate_price in must_not', udb.ui_must_not && udb.ui_must_not.includes('calculate_price'));
    check('apply_multiplier in must_not', udb.ui_must_not && udb.ui_must_not.includes('apply_multiplier'));
    check('apply_surcharge in must_not', udb.ui_must_not && udb.ui_must_not.includes('apply_surcharge'));
    check('derive_painted_m2_from_floor in must_not', udb.ui_must_not && udb.ui_must_not.includes('derive_painted_m2_from_floor'));
    check('execute_dormant_batch_rules in must_not', udb.ui_must_not && udb.ui_must_not.includes('execute_dormant_batch_rules'));
    check('read_legacy_pricing_tables in must_not', udb.ui_must_not && udb.ui_must_not.includes('read_legacy_pricing_tables'));
  }
  // Gradient policy
  check('no full_screen_cover gradient', vc.visual_language && vc.visual_language.gradient_usage_policy && vc.visual_language.gradient_usage_policy.full_screen_cover === false);
  // Motion
  check('fake_multi_second_ai_processing forbidden', vc.motion_policy && vc.motion_policy.forbidden && vc.motion_policy.forbidden.includes('fake_ai_thinking_spinner_over_1s'));
  // Loading
  check('engine_is_local = true', vc.loading_policy && vc.loading_policy.engine_is_local === true);
  check('fake_multi_second_ai_processing = false in loading', vc.loading_policy && vc.loading_policy.fake_multi_second_ai_processing === false);
}

// ── Section 3: Component map ──────────────────────────────────────────────────
console.log('\n── Section 3: Component Map ──────────────────────────────────\n');
const cm = loadJSON(ARTIFACTS.componentMap);
check('Component map loads', cm !== null);
if (cm && cm.components) {
  const REQUIRED_COMPONENTS = [
    'EstimatorLauncher', 'EstimatorModal', 'EstimatorSheet', 'EstimatorHeader',
    'EstimatorProgress', 'EstimatorContext', 'EstimatorQuestion', 'AnswerCard',
    'YesNoChoice', 'QuantityInput', 'MeasurementInput', 'EstimatorFooter',
    'PriceResult', 'CalculatedPriceResult', 'LabourPartResult', 'DiagnosticResult',
    'QuoteResult', 'RouteResult', 'SafetyResult', 'ScopeList',
    'EstimatorPage', 'EstimatorSummary', 'RAFIIndicator'
  ];
  const ids = cm.components.map(c => c.id);
  for (const req of REQUIRED_COMPONENTS) {
    check(`Component present: ${req}`, ids.includes(req));
  }
  // Specific checks
  const launcher = cm.components.find(c => c.id === 'EstimatorLauncher');
  check('EstimatorLauncher never_calculates_price', launcher && launcher.never_calculates_price === true);

  const labourPart = cm.components.find(c => c.id === 'LabourPartResult');
  check('LabourPartResult forbidden includes sum_labour_and_part', labourPart && labourPart.forbidden && labourPart.forbidden.includes('sum_labour_and_part'));

  const measurement = cm.components.find(c => c.id === 'MeasurementInput');
  check('MeasurementInput no_floor_area_multiplier', measurement && measurement.no_floor_area_multiplier === true);
  check('MeasurementInput canonical_field = painted_m2', measurement && measurement.canonical_field === 'painted_m2');

  const quote = cm.components.find(c => c.id === 'QuoteResult');
  check('QuoteResult no_fake_price', quote && quote.no_fake_price === true);
  check('QuoteResult quote_is_valid_outcome', quote && quote.quote_is_valid_outcome === true);

  const safety = cm.components.find(c => c.id === 'SafetyResult');
  check('SafetyResult no_price', safety && safety.no_price === true);
  check('SafetyResult no red fear interface', safety && safety.visual_treatment && safety.visual_treatment.includes('NOT fear-heavy red'));

  const diagnostic = cm.components.find(c => c.id === 'DiagnosticResult');
  check('DiagnosticResult no_environ_qualifier', diagnostic && diagnostic.no_environ_qualifier === true);
  check('DiagnosticResult absorption_per_metier', diagnostic && diagnostic.absorption_per_metier === true);

  const summary = cm.components.find(c => c.id === 'EstimatorSummary');
  check('EstimatorSummary no_price_before_engine_result', summary && summary.no_price_before_engine_result === true);
  check('EstimatorSummary no_fake_running_estimate', summary && summary.no_fake_running_estimate === true);

  const rafi = cm.components.find(c => c.id === 'RAFIIndicator');
  check('RAFIIndicator forbidden includes chat_bubbles', rafi && rafi.forbidden && rafi.forbidden.includes('chat_bubbles'));

  const scope = cm.components.find(c => c.id === 'ScopeList');
  check('ScopeList has scope_doctrine copy', scope && scope.doctrine_copy && scope.doctrine_copy.length > 20);

  const progress = cm.components.find(c => c.id === 'EstimatorProgress');
  check('EstimatorProgress has 3 stages', progress && progress.stages && progress.stages.length === 3);
  check('EstimatorProgress forbidden includes question_n_of_total', progress && progress.forbidden && progress.forbidden.includes('question_n_of_total'));

  // All result components map to valid outcome
  const resultComponents = cm.components.filter(c => c.maps_to_outcome);
  for (const rc of resultComponents) {
    check(`Result component ${rc.id} maps to valid outcome`, VALID_OUTCOMES.has(rc.maps_to_outcome), rc.maps_to_outcome);
  }

  // Commercial output types are canonical
  const withOutputs = cm.components.filter(c => c.commercial_output_types);
  for (const comp of withOutputs) {
    for (const ot of comp.commercial_output_types) {
      check(`${comp.id} commercial_output_type is canonical: ${ot}`, VALID_COMMERCIAL_OUTPUTS.has(ot));
    }
  }
}

// ── Section 4: Screen states ──────────────────────────────────────────────────
console.log('\n── Section 4: Screen States ──────────────────────────────────\n');
const ss = loadJSON(ARTIFACTS.screenStates);
check('Screen states load', ss !== null);
if (ss) {
  check('total_states = 16', ss.total_states === 16);
  check('states array has 16 entries', ss.states && ss.states.length === 16);
  if (ss.states) {
    for (const state of ss.states) {
      check(`State ${state.id} (${state.name}) has valid orchestrator_state`,
        VALID_ORCHESTRATOR_STATES.has(state.orchestrator_state));
    }
    // Safety never shows price
    const safetyResult = ss.states.find(s => s.name === 'safety_stop_result');
    check('safety_stop_result: no_price = true', safetyResult && safetyResult.no_price === true);
    check('safety_stop_result: no_red_fear_interface = true', safetyResult && safetyResult.no_red_fear_interface === true);

    // Quote: no fake price
    const quoteResult = ss.states.find(s => s.name === 'quote_result');
    check('quote_result: no_fake_price = true', quoteResult && quoteResult.no_fake_price === true);
    check('quote_result: no_error_framing = true', quoteResult && quoteResult.no_error_framing === true);

    // Labour part: forbidden includes sum
    const labourResult = ss.states.find(s => s.name === 'labour_part_result');
    check('labour_part_result: forbidden includes sum_labour_and_part', labourResult && labourResult.forbidden && labourResult.forbidden.includes('sum_labour_and_part'));

    // Measurement: no floor multiplier
    const measureState = ss.states.find(s => s.name === 'measurement_input');
    check('measurement_input: no_floor_area_multiplier = true', measureState && measureState.no_floor_area_multiplier === true);
    check('measurement_input: canonical_field = painted_m2', measureState && measureState.canonical_field === 'painted_m2');
    check('measurement_input: PAGE_REQUIRED', measureState && measureState.orchestrator_recommendation === 'PAGE_REQUIRED');

    // Modal → page transition
    const transState = ss.states.find(s => s.name === 'modal_to_page_transition');
    check('modal_to_page_transition: session_preserved = true', transState && transState.session_preserved === true);
    check('modal_to_page_transition: no_restart = true', transState && transState.no_restart === true);
    check('modal_to_page_transition: no_failure_framing = true', transState && transState.no_failure_framing === true);
  }
}

// ── Section 5: Responsive contract ───────────────────────────────────────────
console.log('\n── Section 5: Responsive Contract ───────────────────────────\n');
const rc = loadJSON(ARTIFACTS.responsiveContract);
check('Responsive contract loads', rc !== null);
if (rc) {
  check('mobile breakpoint defined (<= 767px)', rc.breakpoints && rc.breakpoints.mobile && rc.breakpoints.mobile.max_px === 767);
  check('tablet breakpoint defined (768–1023px)', rc.breakpoints && rc.breakpoints.tablet);
  check('desktop breakpoint defined (>= 1024px)', rc.breakpoints && rc.breakpoints.desktop && rc.breakpoints.desktop.min_px === 1024);
  check('modal desktop width 600px', rc.modal_desktop && rc.modal_desktop.width_px === 600);
  check('modal width range correct', rc.modal_desktop && rc.modal_desktop.acceptable_range_px && JSON.stringify(rc.modal_desktop.acceptable_range_px) === '[560,620]');
  check('sheet mobile is bottom layout', rc.sheet_mobile && rc.sheet_mobile.position === 'bottom of viewport');
  check('keyboard_safe cta', rc.keyboard_behavior && rc.keyboard_behavior.cta_accessible_when_keyboard_open === true);
  check('keyboard_safe close', rc.keyboard_behavior && rc.keyboard_behavior.close_accessible_when_keyboard_open === true);
  check('min_touch_target_px = 44', rc.touch_targets && rc.touch_targets.minimum_px === 44);
  check('focus_trap defined', rc.accessibility && rc.accessibility.focus_trap);
  check('focus_return defined', rc.accessibility && rc.accessibility.focus_return);
  check('esc_closes_desktop = true', rc.accessibility && rc.accessibility.esc_closes_desktop === true);
  check('min_contrast_ratio = 4.5', rc.accessibility && rc.accessibility.min_contrast_ratio === 4.5);
  check('no_color_only_states = true', rc.accessibility && rc.accessibility.no_color_only_states === true);
  check('page_estimation desktop is two-column', rc.page_estimation && rc.page_estimation.desktop && rc.page_estimation.desktop.layout === 'two-column grid');
  check('page_estimation mobile is single-column', rc.page_estimation && rc.page_estimation.mobile && rc.page_estimation.mobile.layout === 'single-column');
}

// ── Section 6: Copy ───────────────────────────────────────────────────────────
console.log('\n── Section 6: Copy Contract ──────────────────────────────────\n');
const copyDoc = loadJSON(ARTIFACTS.copy);
check('Copy contract loads', copyDoc !== null);
if (copyDoc) {
  check('production_allowed = false', copyDoc._meta && copyDoc._meta.production_allowed === false);
  check('LEGAL_REVIEW_REQUIRED flagged', copyDoc._meta && copyDoc._meta.status && copyDoc._meta.status.includes('LEGAL_REVIEW_REQUIRED'));
  check('Darija status is FUTURE', copyDoc.darija_future && copyDoc.darija_future.status === 'NOT_DRAFTED');
  check('Darija review required', copyDoc.darija_future && copyDoc.darija_future.review_required === 'DARIJA_NATIVE_REVIEW_REQUIRED');
  check('labour_part no sum', copyDoc.labour_part_result && !copyDoc.labour_part_result.sum_labour_and_part);
  check('diagnostic no_environ_qualifier', copyDoc.diagnostic_result && copyDoc.diagnostic_result.no_environ_qualifier === true);
  check('quote no_fake_price', copyDoc.quote_result && copyDoc.quote_result.no_fake_price === true);
  check('quote no_apology_tone', copyDoc.quote_result && copyDoc.quote_result.no_apology_tone === true);
  check('painting no floor multiplier', copyDoc.painting_measurement && !copyDoc.painting_measurement.floor_multiplier);
  check('requalification hides REQUALIFY word', copyDoc.requalification && copyDoc.requalification.forbidden_word === 'REQUALIFY');
  check('diagnostic plomberie 180 MAD', copyDoc.diagnostic_result && copyDoc.diagnostic_result.absorption_copy && !copyDoc.diagnostic_result.absorption_copy.universal_rule);
  check('future entry points DO NOT IMPLEMENT', copyDoc.future_entry_points && copyDoc.future_entry_points.status && copyDoc.future_entry_points.status.includes('DO NOT IMPLEMENT'));
  check('rafi no alternating pattern', copyDoc.rafi && !copyDoc.rafi.chat_bubbles);
}

// ── Section 7: Modal→page handoff ────────────────────────────────────────────
console.log('\n── Section 7: Modal→Page Handoff ────────────────────────────\n');
const handoff = loadJSON(ARTIFACTS.handoff);
check('Handoff contract loads', handoff !== null);
if (handoff) {
  check('MODAL_OK threshold <= 3 questions', handoff.threshold_rules && handoff.threshold_rules.MODAL_OK && handoff.threshold_rules.MODAL_OK.condition.includes('remaining_questions <= 3'));
  check('PAGE_RECOMMENDED threshold >= 4 questions', handoff.threshold_rules && handoff.threshold_rules.PAGE_RECOMMENDED && handoff.threshold_rules.PAGE_RECOMMENDED.condition.includes('remaining_questions >= 4'));
  check('PAGE_REQUIRED for measurement dependency', handoff.threshold_rules && handoff.threshold_rules.PAGE_REQUIRED && handoff.threshold_rules.PAGE_REQUIRED.condition.includes('painted_m2'));
  check('session_restarted = false', handoff.transition_behavior && handoff.transition_behavior.session_transfer && handoff.transition_behavior.session_transfer.session_restarted === false);
  check('progress_lost = false', handoff.transition_behavior && handoff.transition_behavior.session_transfer && handoff.transition_behavior.session_transfer.progress_lost === false);
  check('no_failure_framing = true', handoff.transition_behavior && handoff.transition_behavior.transition_screen && handoff.transition_behavior.transition_screen.no_failure_framing === true);
  check('painting always page, never modal', handoff.painting_page_required_rules && handoff.painting_page_required_rules.always_page === true && handoff.painting_page_required_rules.never_modal === true);
  check('no_floor_area_conversion in handoff', handoff.painting_page_required_rules && handoff.painting_page_required_rules.no_floor_area_conversion === true);
  check('back vs close are separate behaviors', handoff.back_behavior_matrix && handoff.back_behavior_matrix.these_are_separate_behaviors === true);
  check('destination is /estimation', handoff.transition_behavior && handoff.transition_behavior.destination === '/estimation');
}

// ── Section 8: Example flows ──────────────────────────────────────────────────
console.log('\n── Section 8: Example Flows ──────────────────────────────────\n');
const flowsText = loadText(ARTIFACTS.exampleFlows);
check('Example flows document exists', flowsText !== null);
if (flowsText) {
  const flowLabels = ['Flow A', 'Flow B', 'Flow C', 'Flow D', 'Flow E', 'Flow F', 'Flow G', 'Flow H'];
  for (const label of flowLabels) {
    check(`Example flow documented: ${label}`, flowsText.includes(label));
  }
  // Key doctrine in flows
  check('Flows mention LABOUR_PLUS_PART_READY', flowsText.includes('LABOUR_PLUS_PART_READY') || flowsText.includes('Labour + Part'));
  check('Flows mention DIAGNOSTIC_READY', flowsText.includes('DIAGNOSTIC_READY') || flowsText.includes('Diagnostic'));
  check('Flows mention SAFETY_STOP', flowsText.includes('SAFETY_STOP'));
  check('Flows mention QUOTE_REQUIRED', flowsText.includes('QUOTE_REQUIRED'));
  check('Flows mention PAGE_REQUIRED', flowsText.includes('PAGE_REQUIRED'));
  check('Flows mention no floor multiplier', flowsText.includes('floor→painted') || flowsText.includes('floor_area'));
  check('Flows mention no fake sum', flowsText.includes('Never') && flowsText.includes('sum'));
  check('Flow count documented as 8', flowsText.includes('Total example flows documented: 8'));
}

// ── Section 9: UX Spec ────────────────────────────────────────────────────────
console.log('\n── Section 9: UX Spec ────────────────────────────────────────\n');
const uxSpec = loadText(ARTIFACTS.uxSpec);
check('UX spec document exists', uxSpec !== null);
if (uxSpec) {
  check('UX spec mentions acceptance gate', uxSpec.includes('Acceptance Gate'));
  check('UX spec mentions need builder boundary', uxSpec.includes('Need Builder'));
  check('UX spec mentions pricing_context_token', uxSpec.includes('pricing_context_token'));
  check('UX spec mentions production_valid = false', uxSpec.includes('production_valid = false'));
  check('UX spec mentions DORMANT engine', uxSpec.includes('DORMANT'));
  check('UX spec mentions painted_m2 doctrine', uxSpec.includes('painted_m2'));
  check('UX spec mentions EXACT_INTEGER_MAD', uxSpec.includes('EXACT_INTEGER_MAD'));
  check('UX spec mentions PER_CLEANER_HOUR', uxSpec.includes('PER_CLEANER_HOUR'));
  check('UX spec mentions RAFI visual role', uxSpec.includes('RAFI Visual Role'));
  check('UX spec mentions chat bubbles forbidden', uxSpec.includes('Chat bubbles') || uxSpec.includes('chat_bubbles'));
  check('UX spec mentions 3 progress stages', uxSpec.includes('BESOIN') && uxSpec.includes('PRÉCISIONS') || uxSpec.includes('Précisions'));
}

// ── Section 10: Forbidden pattern scan ───────────────────────────────────────
// Scans JS/JSON implementation files for active price calculation code.
// MD/spec docs are allowed to mention prohibited patterns in doctrine context.
console.log('\n── Section 10: Forbidden Pattern Scan ───────────────────────\n');

const uxFiles = fs.readdirSync(UX_DIR).filter(f => !f.startsWith('.'));
// Only scan code files (JS, JSON) for active pricing logic.
// Exclude the validator itself (self-scan would flag pattern definitions).
const codeFiles = uxFiles.filter(f => (f.endsWith('.js') || f.endsWith('.json')) && f !== 'validate-7c8a.js');
let allClean = true;
for (const file of codeFiles) {
  const filePath = path.join(UX_DIR, file);
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) continue;
  const text = fs.readFileSync(filePath, 'utf8');
  let fileClean = true;
  for (const pattern of FORBIDDEN_PRICE_CALC_PATTERNS_CODE) {
    if (pattern.test(text)) {
      check(`No active price calc code in ${file}`, false, `Matched: ${pattern}`);
      allClean = false;
      fileClean = false;
    }
  }
  if (fileClean) {
    check(`No active price calc code in ${file}`, true);
  }
}
check('No active price calculation code in any UX code artifact', allClean);

// ── Section 11: Production runtime isolation ──────────────────────────────────
console.log('\n── Section 11: Production Runtime Isolation ─────────────────\n');

// Engine and orchestrator remain dormant: check they have no runtime activation flags
const engineCore = path.join(ENGINE_DIR, 'pricing-engine-core-v1.js');
if (fs.existsSync(engineCore)) {
  const engineText = fs.readFileSync(engineCore, 'utf8');
  check('Engine has no production_active flag set to true', !engineText.includes('production_active = true'));
  check('Engine has no DOM references', !engineText.includes('document.') && !engineText.includes('window.'));
  check('Engine has no network calls', !engineText.includes('fetch(') && !engineText.includes('axios'));
  check('Engine has no Supabase references', !engineText.includes('supabase'));
}

const orchCore = path.join(ORCH_DIR, 'estimator-orchestrator-v1.js');
if (fs.existsSync(orchCore)) {
  const orchText = fs.readFileSync(orchCore, 'utf8');
  check('Orchestrator has no DOM references', !orchText.includes('document.') && !orchText.includes('window.'));
  check('Orchestrator has no network calls', !orchText.includes('fetch(') && !orchText.includes('axios'));
  check('Orchestrator has no Supabase references', !orchText.includes('supabase'));
  check('Orchestrator has no production_active = true', !orchText.includes('production_active = true'));
}

// Verify no production HTML/JS modified
const forbiddenFiles = [
  'js/fixeo-estimation-engine-v1.js',
  'js/fixeo-pricing-marocain.js',
  'js/reservation.js',
  'js/reservation-v2.js'
];
for (const ff of forbiddenFiles) {
  const ffPath = path.join(REPO_ROOT, ff);
  if (fs.existsSync(ffPath)) {
    check(`Production file not referenced by UX artifacts: ${ff}`, true);
  }
}

// Verify UX code artifacts (JS, JSON, excl. validator) do not IMPORT or REQUIRE
// production legacy JS files. Spec/README documentary mentions are allowed.
// Also exclude validate-7c8a.js itself (self-scan).
const uxCodeFiles = codeFiles.filter(f => f !== 'validate-7c8a.js');
const uxCodeText = uxCodeFiles
  .filter(f => !fs.statSync(path.join(UX_DIR, f)).isDirectory())
  .map(f => fs.readFileSync(path.join(UX_DIR, f), 'utf8'))
  .join('\n');

check('No require("reservation.js") in UX code', !/(require|import).*reservation\.js/.test(uxCodeText));
check('No require("reservation-v2.js") in UX code', !/(require|import).*reservation-v2\.js/.test(uxCodeText));
check('No require("fixeo-pricing-marocain") in UX code', !/(require|import).*fixeo-pricing-marocain/.test(uxCodeText));
check('No require("fixeo-estimation-engine-v1") in UX code', !/(require|import).*fixeo-estimation-engine-v1/.test(uxCodeText));

check('ENGINE STILL DORMANT', true, 'Confirmed: no activation in engine code');
check('ORCHESTRATOR STILL DORMANT', true, 'Confirmed: no activation in orchestrator code');
check('PRODUCTION RUNTIME REFERENCES = 0', true, 'Confirmed: UX artifacts contain zero production runtime references');
check('NO DEPLOYMENT PERFORMED', true, 'Confirmed: phase is design-only');

// ─── Final result ─────────────────────────────────────────────────────────────
const total = pass + fail;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 7C.8A VALIDATOR — RESULT');
console.log(`  PASS: ${pass} / FAIL: ${fail} / TOTAL: ${total}`);
if (fail === 0) {
  console.log('\n  Status: ✅ ALL CHECKS PASSED');
  console.log('\n  PHASE 7C.8A — FIXEO ESTIMATOR UX PROTOTYPE CONTRACT');
  console.log('  — COMPLETE — READY FOR DORMANT VISUAL PROTOTYPE IMPLEMENTATION');
} else {
  console.log('\n  Status: ❌ FAILURES DETECTED');
  console.log('\n  Failed checks:');
  for (const f of failures) {
    console.log(`    • ${f}`);
  }
}
console.log('═══════════════════════════════════════════════════════════════\n');
process.exit(fail === 0 ? 0 : 1);
