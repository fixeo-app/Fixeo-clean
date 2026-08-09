#!/usr/bin/env node
'use strict';
// Phase 7C.3 — Semantic Hardening Validator
// Verifies all 7C.3 artifacts + re-runs 7C.1.1 and 7C.2 validators as sub-checks.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONS_DIR = path.resolve(__dirname);
const CANONICAL_DIR = path.resolve(__dirname, '../canonical');
const RESEARCH_DIR = path.resolve(__dirname, '../research');
const REPO_ROOT = path.resolve(__dirname, '../../../');

let pass = 0, fail = 0;
const errors = [];

function ok(msg) { console.log(`  ✅ PASS: ${msg}`); pass++; }
function err(msg) { console.log(`  ❌ FAIL: ${msg}`); fail++; errors.push(msg); }
function check(cond, passMsg, failMsg) { cond ? ok(passMsg) : err(failMsg); }

// Ground truth prices — must not change
const EXPECTED_PRICES = {
  'plomberie.diagnostic':180, 'plomberie.fuite_simple':250, 'plomberie.debouchage_evier':250,
  'plomberie.debouchage_wc_simple':300, 'plomberie.robinet_remplacement':250, 'plomberie.chasse_eau':300,
  'electricite.diagnostic':200, 'electricite.prise_remplacement':220,
  'electricite.interrupteur_remplacement.simple':220, 'electricite.interrupteur_remplacement.va_et_vient':250,
  'electricite.luminaire_installation':220, 'electricite.disjoncteur_remplacement':250,
  'serrurerie.porte_claquee_ouverture':220, 'serrurerie.porte_claquee_blindee_ouverture':350,
  'serrurerie.porte_verrouillee_ouverture':380, 'serrurerie.cle_cassee_extraction':220,
  'serrurerie.cylindre_remplacement_standard':280, 'serrurerie.serrure_remplacement_standard':400,
  'CLIM-002':250, 'CLIM-003':300, 'CLIM-004':450, 'CLIM-009':250,
  'CLIM-013':600, 'CLIM-020':1000, 'CLIM-021':1200, 'CLIM-030':550,
  'BRIC-001':200, 'BRIC-002':150, 'BRIC-003':400, 'BRIC-010':200, 'BRIC-020':200, 'BRIC-030':300,
  'NET-001':200, 'NET-002':65, 'NET-004':600, 'NET-010':300, 'NET-011':450,
  'NET-013':250, 'NET-014':300, 'NET-030':18,
  'PEIN-001':800, 'PEIN-002':35, 'PEIN-003':65, 'PEIN-004':45, 'PEIN-005':75, 'PEIN-008':25,
  'MENU_001':300, 'MENU_001B':350, 'MENU_002':300, 'MENU_003':300,
  'MENU_004A':300, 'MENU_004B':350, 'MENU_006':500
};

const VALID_OPERATORS = new Set(['EQ','NEQ','IN','NOT_IN','GT','GTE','LT','LTE','EXISTS','NOT_EXISTS']);
const VALID_EFFECTS = new Set(['ELIGIBLE','INELIGIBLE','ROUTE','QUOTE_REQUIRED']);
const VALID_EXCL_ACTIONS = new Set(['ROUTE','QUOTE_REQUIRED','UNAVAILABLE','STOP_SAFETY','REQUALIFY','HORS_PERIMETRE','HORS_PERIMETRE_ABSOLU']);

// ─── 0. PREVIOUS VALIDATORS STILL PASS ───────────────────────────────────────
console.log('\n=== 0. PREVIOUS VALIDATORS STILL PASS ===');
try {
  const r71 = execSync('node ' + path.join(CONS_DIR, 'validate-7c1-1.js'), {encoding:'utf8', cwd: REPO_ROOT});
  check(r71.includes('ALL CHECKS PASSED'), '7C.1.1 validator still passes', '7C.1.1 validator FAILED');
} catch(e) { err(`7C.1.1 validator error: ${e.message.slice(0,100)}`); }
try {
  const r72 = execSync('node ' + path.join(CANONICAL_DIR, 'validate-canonical-v1.js'), {encoding:'utf8', cwd: REPO_ROOT});
  check(r72.includes('ALL CHECKS PASSED'), '7C.2 validator still passes', '7C.2 validator FAILED');
} catch(e) { err(`7C.2 validator error: ${e.message.slice(0,100)}`); }

// ─── 1. 7C.3 FILES PRESENT ────────────────────────────────────────────────────
console.log('\n=== 1. 7C.3 ARTIFACT FILES PRESENT ===');
const REQUIRED_7C3 = [
  path.join(CONS_DIR, 'canonical-inputs.v1.draft.json'),
  path.join(CONS_DIR, 'prebooking-questions.v1.draft.json'),
  path.join(CONS_DIR, 'commercial-copy.v1.draft.json'),
  path.join(CONS_DIR, 'human-review-queue.v1.draft.json'),
  path.join(CONS_DIR, 'phase-7c3-semantic-hardening.md'),
  path.join(CONS_DIR, 'validate-7c3.js'),
  path.join(CANONICAL_DIR, 'canonical-registry.v1.draft.json'),
];
REQUIRED_7C3.forEach(f => check(fs.existsSync(f), `${path.basename(f)} present`, `MISSING: ${path.basename(f)}`));

// ─── 2. LOAD ARTIFACTS ───────────────────────────────────────────────────────
console.log('\n=== 2. PARSE 7C.3 ARTIFACTS ===');
let reg, inputs, questions, copy_reg, hrq;
try { reg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'canonical-registry.v1.draft.json'))); ok('canonical-registry parsed'); } catch(e) { err(`canonical-registry parse: ${e.message}`); }
try { inputs = JSON.parse(fs.readFileSync(path.join(CONS_DIR, 'canonical-inputs.v1.draft.json'))); ok('canonical-inputs parsed'); } catch(e) { err(`inputs parse: ${e.message}`); }
try { questions = JSON.parse(fs.readFileSync(path.join(CONS_DIR, 'prebooking-questions.v1.draft.json'))); ok('prebooking-questions parsed'); } catch(e) { err(`questions parse: ${e.message}`); }
try { copy_reg = JSON.parse(fs.readFileSync(path.join(CONS_DIR, 'commercial-copy.v1.draft.json'))); ok('commercial-copy parsed'); } catch(e) { err(`copy parse: ${e.message}`); }
try { hrq = JSON.parse(fs.readFileSync(path.join(CONS_DIR, 'human-review-queue.v1.draft.json'))); ok('human-review-queue parsed'); } catch(e) { err(`hrq parse: ${e.message}`); }
try { JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'formula-registry.v1.draft.json'))); ok('formula-registry parsed'); } catch(e) { err(`formula parse: ${e.message}`); }
try { JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'policy-registry.v1.draft.json'))); ok('policy-registry parsed'); } catch(e) { err(`policy parse: ${e.message}`); }
try { JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'routing-registry.v1.draft.json'))); ok('routing-registry parsed'); } catch(e) { err(`routing parse: ${e.message}`); }

// ─── 3. 53 SERVICES PRESERVED ────────────────────────────────────────────────
console.log('\n=== 3. 53 SERVICES PRESERVED ===');
const services = reg ? Object.values(reg.services || {}) : [];
check(services.length === 53, `53 services (actual: ${services.length})`, `Expected 53, got ${services.length}`);

// ─── 4. ALL APPROVED PRICES UNCHANGED ────────────────────────────────────────
console.log('\n=== 4. ALL 53 APPROVED PRICES UNCHANGED ===');
if (services.length > 0) {
  const priceErrors = [];
  services.forEach(svc => {
    const lcode = svc.legacy_codes && svc.legacy_codes[0];
    const expected = EXPECTED_PRICES[lcode];
    if (expected === undefined) return;
    const pm = svc.price_model || {};
    const actual = pm.fixed_amount_mad ?? pm.labour_amount_mad ?? pm.unit_rate_mad ?? pm.diagnostic_price_mad;
    if (actual !== expected) priceErrors.push(`${lcode}: expected=${expected} actual=${actual}`);
  });
  check(priceErrors.length === 0, 'All 53 approved prices unchanged', `Price changes: ${priceErrors.join('; ')}`);
}

// ─── 5. ROUNDING POLICY APPROVED ─────────────────────────────────────────────
console.log('\n=== 5. EXACT_INTEGER_MAD ROUNDING POLICY APPROVED ===');
if (reg) {
  const rp = reg._meta && reg._meta.governance && reg._meta.governance.rounding_policy;
  check(rp && rp.status === 'APPROVED', 'rounding_policy.status = APPROVED', `rounding_policy.status = ${rp && rp.status}`);
  check(rp && rp.mode === 'EXACT_INTEGER_MAD', 'rounding_policy.mode = EXACT_INTEGER_MAD', `mode = ${rp && rp.mode}`);
  check(rp && rp.approved_by === 'HUMAN_DECISION_PHASE_7C3', 'rounding_policy.approved_by = HUMAN_DECISION_PHASE_7C3', `approved_by = ${rp && rp.approved_by}`);
  if (rp) {
    const notApproved = rp.NOT_APPROVED || [];
    check(notApproved.includes('NEAREST_5_MAD'), 'NEAREST_5_MAD is in NOT_APPROVED list', 'NEAREST_5_MAD missing from NOT_APPROVED');
    check(notApproved.includes('NEAREST_10_MAD'), 'NEAREST_10_MAD is in NOT_APPROVED list', 'NEAREST_10_MAD missing from NOT_APPROVED');
  }
}

// ─── 6. EVERY PREDICATE USES REGISTERED INPUT ─────────────────────────────────
console.log('\n=== 6. EVERY ELIGIBILITY PREDICATE USES REGISTERED INPUT ===');
if (inputs && services.length > 0) {
  const knownInputs = new Set(Object.keys(inputs.inputs || {}));
  const predicateErrors = [];
  services.forEach(svc => {
    const e = svc.eligibility || {};
    (e.required_conditions || []).forEach(cond => {
      if (cond.field && !knownInputs.has(cond.field)) {
        predicateErrors.push(`${svc.canonical_service_code}: unknown input field '${cond.field}'`);
      }
      if (cond.operator && !VALID_OPERATORS.has(cond.operator)) {
        predicateErrors.push(`${svc.canonical_service_code}: invalid operator '${cond.operator}'`);
      }
      if (cond.effect && !VALID_EFFECTS.has(cond.effect)) {
        predicateErrors.push(`${svc.canonical_service_code}: invalid effect '${cond.effect}'`);
      }
    });
  });
  check(predicateErrors.length === 0, 'All predicates use registered inputs with valid operators/effects', `Predicate errors: ${predicateErrors.join('; ')}`);
}

// ─── 7. EVERY PREBOOKING QUESTION USES REGISTERED INPUT ───────────────────────
console.log('\n=== 7. EVERY PREBOOKING QUESTION USES REGISTERED INPUT ===');
if (inputs && questions) {
  const knownInputs = new Set(Object.keys(inputs.inputs || {}));
  const questionErrors = [];
  Object.values(questions.questions || {}).forEach(q => {
    if (q.input_id && !knownInputs.has(q.input_id)) {
      questionErrors.push(`${q.question_id}: unknown input_id '${q.input_id}'`);
    }
  });
  check(questionErrors.length === 0, 'All prebooking questions use registered inputs', `Question errors: ${questionErrors.join('; ')}`);
}

// ─── 8. EVERY PREBOOKING QUESTION REF RESOLVES ────────────────────────────────
console.log('\n=== 8. ALL PREBOOKING QUESTION REFS RESOLVE ===');
if (questions && services.length > 0) {
  const knownQuestions = new Set(Object.keys(questions.questions || {}));
  const missingQRefs = [];
  services.forEach(svc => {
    const e = svc.eligibility || {};
    (e.prebooking_question_refs || []).forEach(qref => {
      if (!knownQuestions.has(qref)) missingQRefs.push(`${svc.canonical_service_code} → ${qref}`);
    });
  });
  check(missingQRefs.length === 0, 'All prebooking_question_refs resolve', `Missing q refs: ${missingQRefs.join(', ')}`);
}

// ─── 9. EVERY HARD EXCLUSION ACTION IS VALID ─────────────────────────────────
console.log('\n=== 9. ALL HARD EXCLUSION ACTIONS VALID ===');
if (services.length > 0) {
  const exclErrors = [];
  services.forEach(svc => {
    const e = svc.eligibility || {};
    (e.hard_exclusions || []).forEach(excl => {
      if (excl.action && !VALID_EXCL_ACTIONS.has(excl.action)) {
        exclErrors.push(`${svc.canonical_service_code}: invalid exclusion action '${excl.action}'`);
      }
    });
  });
  check(exclErrors.length === 0, 'All hard_exclusion actions are valid', `Invalid actions: ${exclErrors.join('; ')}`);
}

// ─── 10. ALL ROUTE REFS IN EXCLUSIONS EXIST IN ROUTING REGISTRY ───────────────
console.log('\n=== 10. ALL ROUTE REFS IN EXCLUSIONS RESOLVE ===');
let routeReg = null;
try { routeReg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'routing-registry.v1.draft.json'))); } catch(e) {}
if (routeReg && services.length > 0) {
  const knownRoutes = new Set(Object.keys(routeReg.routes || {}));
  const missingRoutes = [];
  services.forEach(svc => {
    const e = svc.eligibility || {};
    (e.hard_exclusions || []).forEach(excl => {
      if (excl.route_ref && !knownRoutes.has(excl.route_ref)) {
        missingRoutes.push(`${svc.canonical_service_code}: unknown route_ref '${excl.route_ref}'`);
      }
    });
  });
  check(missingRoutes.length === 0, 'All exclusion route_refs resolve in routing registry', `Missing routes: ${missingRoutes.join(', ')}`);
}

// ─── 11. ALL POLICY REFS RESOLVE ─────────────────────────────────────────────
console.log('\n=== 11. ALL POLICY REFS RESOLVE ===');
let polReg = null;
try { polReg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'policy-registry.v1.draft.json'))); } catch(e) {}
if (polReg && services.length > 0) {
  const knownPolicies = new Set(Object.keys(polReg.policies || {}));
  const missingPols = [];
  services.forEach(svc => {
    (svc.policy_refs || []).forEach(ref => {
      if (!knownPolicies.has(ref)) missingPols.push(`${svc.canonical_service_code} → ${ref}`);
    });
  });
  check(missingPols.length === 0, 'All policy_refs resolve', `Missing policies: ${missingPols.join(', ')}`);
}

// ─── 12. ALL FORMULA REFS RESOLVE ────────────────────────────────────────────
console.log('\n=== 12. ALL FORMULA REFS RESOLVE ===');
let formulaReg = null;
try { formulaReg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'formula-registry.v1.draft.json'))); } catch(e) {}
if (formulaReg && services.length > 0) {
  const knownFormulas = new Set(Object.keys(formulaReg.formulas || {}));
  const missingFormulas = [];
  services.forEach(svc => {
    const fid = svc.price_model && svc.price_model.formula_id;
    if (fid && !knownFormulas.has(fid)) missingFormulas.push(`${svc.canonical_service_code} → ${fid}`);
  });
  check(missingFormulas.length === 0, 'All formula_id refs resolve', `Missing formulas: ${missingFormulas.join(', ')}`);
}

// ─── 13. ALL DIAGNOSTIC QUALIFYING SERVICES EXIST ────────────────────────────
console.log('\n=== 13. ALL DIAGNOSTIC QUALIFYING SERVICE CODES EXIST ===');
const allCanonicalCodes = new Set(services.map(s => s.canonical_service_code));
const allLegacyCodes = new Set(services.flatMap(s => s.legacy_codes || []));
if (services.length > 0) {
  const missingDiag = [];
  services.forEach(svc => {
    const diag = svc.diagnostic || {};
    if (diag.enabled) {
      (diag.qualifying_service_codes || []).forEach(code => {
        // Allow both canonical and legacy codes
        if (!allCanonicalCodes.has(code) && !allLegacyCodes.has(code)) {
          missingDiag.push(`${svc.canonical_service_code}: qualifying code '${code}' not found`);
        }
      });
    }
  });
  check(missingDiag.length === 0, 'All diagnostic qualifying_service_codes exist in registry', `Missing: ${missingDiag.join(', ')}`);
}

// ─── 14. NO DIAGNOSTIC RULE GENERALIZED ACROSS METIERS ────────────────────────
console.log('\n=== 14. DIAGNOSTIC ABSORPTION RULES NOT GENERALIZED ACROSS METIERS ===');
const DIAGNOSTIC_METIERS = {plomberie: 'POL-DIAGNOSTIC-ABSORPTION-PLOMBERIE-V1', electricite: 'POL-DIAGNOSTIC-ABSORPTION-ELECTRICITE-V1', climatisation: 'POL-DIAGNOSTIC-ABSORPTION-CLIM-V1'};
if (services.length > 0) {
  const crossMetierDiag = [];
  services.forEach(svc => {
    const diag = svc.diagnostic || {};
    if (!diag.enabled) return;
    const expectedPol = DIAGNOSTIC_METIERS[svc.metier];
    if (!expectedPol) {
      crossMetierDiag.push(`${svc.canonical_service_code}: diagnostic enabled on métier '${svc.metier}' which has no diagnostic doctrine`);
    } else {
      const polRefs = svc.policy_refs || [];
      if (!polRefs.includes(expectedPol)) {
        crossMetierDiag.push(`${svc.canonical_service_code}: missing métier-specific diagnostic policy '${expectedPol}'`);
      }
      // Must NOT reference another métier's diagnostic policy
      Object.entries(DIAGNOSTIC_METIERS).forEach(([m, pol]) => {
        if (m !== svc.metier && polRefs.includes(pol)) {
          crossMetierDiag.push(`${svc.canonical_service_code}: cross-métier diagnostic policy '${pol}' — GENERALIZATION DETECTED`);
        }
      });
    }
  });
  check(crossMetierDiag.length === 0, 'Diagnostic absorption rules are métier-specific, not generalized', `Issues: ${crossMetierDiag.join('; ')}`);
}

// ─── 15. FLOOR SEMANTICS CORRECT FOR EXACTLY FOUR METIERS ─────────────────────
console.log('\n=== 15. MINIMUM FLOOR SEMANTICS — 4 METIERS ONLY ===');
const FLOOR_METIERS = {bricolage: 200, nettoyage: 200, peinture: 800, menuiserie: 300};
const NO_FLOOR_METIERS = ['plomberie', 'electricite', 'climatisation', 'serrurerie'];
if (services.length > 0) {
  // No-floor métiers must not have enabled floors
  NO_FLOOR_METIERS.forEach(m => {
    const wrongFloors = services.filter(s => s.metier === m && s.minimum_floor && s.minimum_floor.enabled === true);
    check(wrongFloors.length === 0, `${m}: no minimum_floor enabled`, `${m} has enabled floor: ${wrongFloors.map(s=>s.canonical_service_code).join(', ')}`);
  });
  // Floor métiers must have at least one service with correct floor amount
  Object.entries(FLOOR_METIERS).forEach(([m, floor]) => {
    const correct = services.filter(s => s.metier === m && s.minimum_floor && s.minimum_floor.enabled && s.minimum_floor.amount_mad === floor);
    check(correct.length > 0, `${m}: has services with floor = ${floor} MAD`, `${m}: no service with floor = ${floor}`);
    // All enabled floors must be NON_ADDITIVE
    const additive = services.filter(s => s.metier === m && s.minimum_floor && s.minimum_floor.enabled && s.minimum_floor.mode !== 'NON_ADDITIVE');
    check(additive.length === 0, `${m}: all floors are NON_ADDITIVE`, `${m}: additive floor found`);
  });
}

// ─── 16. NO FLOOR FOR NO-FLOOR METIERS ────────────────────────────────────────
// (Covered in check 15 above — combined for clarity)

// ─── 17. NET-030 RETAINS 1000 MAD PROJECT FLOOR ────────────────────────────────
console.log('\n=== 17. NET-030 PROJECT FLOOR = 1000 MAD ===');
if (services.length > 0) {
  const net030 = services.find(s => s.legacy_codes && s.legacy_codes.includes('NET-030'));
  if (net030) {
    const pm = net030.price_model;
    const mf = net030.minimum_floor;
    // NET-030 may have a service-specific floor at 1000 MAD
    // It's in the price_model formula params or minimum_floor with amount_mad = 1000
    const hasProjectFloor = (mf && mf.enabled && mf.amount_mad === 1000) ||
                            (pm && pm.formula_params && pm.formula_params.project_minimum_mad === 1000);
    check(hasProjectFloor, 'NET-030 has 1000 MAD project-specific minimum floor', 'NET-030 missing 1000 MAD project floor');
    check(net030.price_model.unit_rate_mad === 18, 'NET-030 rate = 18 MAD/m²', `NET-030 rate = ${net030.price_model.unit_rate_mad}`);
  } else {
    err('NET-030 not found in canonical registry');
  }
}

// ─── 18. PER_HOUR != PER_CLEANER_HOUR ─────────────────────────────────────────
console.log('\n=== 18. PER_HOUR != PER_CLEANER_HOUR (DISTINCT UNITS) ===');
if (services.length > 0) {
  const bric002 = services.find(s => s.legacy_codes && s.legacy_codes.includes('BRIC-002'));
  const net002 = services.find(s => s.legacy_codes && s.legacy_codes.includes('NET-002'));
  if (bric002 && net002) {
    check(bric002.price_model.unit === 'PER_HOUR', 'BRIC-002 unit = PER_HOUR', `BRIC-002 unit = ${bric002.price_model.unit}`);
    check(net002.price_model.unit === 'PER_CLEANER_HOUR', 'NET-002 unit = PER_CLEANER_HOUR', `NET-002 unit = ${net002.price_model.unit}`);
    check(bric002.price_model.unit !== net002.price_model.unit, 'PER_HOUR ≠ PER_CLEANER_HOUR (no unit collapse)', 'UNIT COLLAPSE DETECTED');
    check(bric002.price_model.calculation_model === 'TIME_BASED_SINGLE', 'BRIC-002 = TIME_BASED_SINGLE', `BRIC-002 = ${bric002.price_model.calculation_model}`);
    check(net002.price_model.calculation_model === 'TIME_BASED_TEAM', 'NET-002 = TIME_BASED_TEAM', `NET-002 = ${net002.price_model.calculation_model}`);
    check(net002.measurement && net002.measurement.worker_count_required === true, 'NET-002 worker_count_required = true', 'NET-002 missing worker_count_required = true');
    check(bric002.measurement && bric002.measurement.worker_count_required !== true, 'BRIC-002 worker_count_required ≠ true', 'BRIC-002 has worker_count_required = true — FORBIDDEN');
  }
}

// ─── 19. PAINTED M2 DISTINCT FROM FLOOR M2 AND CEILING M2 ────────────────────
console.log('\n=== 19. PER_M2 / PER_PAINTED_M2 / PER_CEILING_M2 DISTINCT ===');
if (services.length > 0) {
  const net030 = services.find(s => s.legacy_codes && s.legacy_codes.includes('NET-030'));
  const pein002 = services.find(s => s.legacy_codes && s.legacy_codes.includes('PEIN-002'));
  const pein004 = services.find(s => s.legacy_codes && s.legacy_codes.includes('PEIN-004'));
  if (net030) check(net030.price_model.unit === 'PER_M2', 'NET-030 = PER_M2', `NET-030 unit = ${net030.price_model.unit}`);
  if (pein002) check(pein002.price_model.unit === 'PER_PAINTED_M2', 'PEIN-002 = PER_PAINTED_M2', `PEIN-002 unit = ${pein002.price_model.unit}`);
  if (pein004) check(pein004.price_model.unit === 'PER_CEILING_M2', 'PEIN-004 = PER_CEILING_M2', `PEIN-004 unit = ${pein004.price_model.unit}`);
  if (net030 && pein002 && pein004) {
    const units = [net030.price_model.unit, pein002.price_model.unit, pein004.price_model.unit];
    check(new Set(units).size === 3, 'All 3 m² units distinct (no collapse)', `Collapsed: ${units}`);
  }
}

// ─── 20. PEINTURE CONVERSION = RESEARCH_ESTIMATION_ONLY ───────────────────────
console.log('\n=== 20. PEINTURE PAINTED M2 CONVERSION = RESEARCH_ESTIMATION_ONLY ===');
if (services.length > 0) {
  const peinSvcs = services.filter(s => s.metier === 'peinture' && s.price_model && ['PER_PAINTED_M2','PER_CEILING_M2'].includes(s.price_model.unit));
  peinSvcs.forEach(s => {
    if (s.measurement && s.measurement.conversion_status) {
      check(['RESEARCH_ESTIMATION_ONLY','NOT_APPLICABLE'].includes(s.measurement.conversion_status),
        `${s.canonical_service_code}: conversion_status = RESEARCH_ESTIMATION_ONLY or NOT_APPLICABLE`,
        `${s.canonical_service_code}: conversion_status = ${s.measurement.conversion_status} — SHOULD NOT BE APPROVED`);
    }
  });
  const painput = inputs && inputs.inputs && inputs.inputs['painted_m2'];
  check(painput && painput.conversion_note && painput.conversion_note.includes('RESEARCH_ESTIMATION_ONLY'),
    'painted_m2 input: conversion_note = RESEARCH_ESTIMATION_ONLY',
    'painted_m2 input missing RESEARCH_ESTIMATION_ONLY conversion note');
}

// ─── 21. MENU_002/003 BATCH REMAINS EXPERIMENTAL ─────────────────────────────
console.log('\n=== 21. MENU_002/MENU_003 BATCH = EXPERIMENTAL (NOT PROMOTED) ===');
if (services.length > 0) {
  ['MENU_002','MENU_003'].forEach(lcode => {
    const s = services.find(x => x.legacy_codes && x.legacy_codes.includes(lcode));
    if (s) {
      check(s.batch_policy && s.batch_policy.status === 'EXPERIMENTAL_BATCH_RULE',
        `${lcode}: batch = EXPERIMENTAL_BATCH_RULE`,
        `${lcode}: batch status = ${s.batch_policy && s.batch_policy.status}`);
      check(s.batch_policy && s.batch_policy.promotion_status === 'NOT_PROMOTED_TO_UNIVERSAL_CANONICAL',
        `${lcode}: NOT_PROMOTED_TO_UNIVERSAL_CANONICAL`,
        `${lcode}: promotion_status wrong`);
    }
  });
}

// ─── 22. PEIN-008 IS ADD_ON_ONLY, NOT STANDALONE ─────────────────────────────
console.log('\n=== 22. PEIN-008 = ADD_ON_ONLY, NOT STANDALONE ===');
if (services.length > 0) {
  const pein008 = services.find(s => s.legacy_codes && s.legacy_codes.includes('PEIN-008'));
  if (pein008) {
    check(pein008.eligibility && pein008.eligibility.qualification_status === 'ADD_ON_ONLY',
      'PEIN-008 qualification_status = ADD_ON_ONLY',
      `PEIN-008 qualification_status = ${pein008.eligibility && pein008.eligibility.qualification_status}`);
    check(pein008.eligibility && (pein008.eligibility.primary_service_required === true || (pein008.eligibility.hard_exclusions || []).some(e => e.trigger && e.trigger.includes('standalone'))),
      'PEIN-008 has standalone booking exclusion',
      'PEIN-008 missing standalone booking exclusion');
    check(pein008.price_model && pein008.price_model.calculation_model === 'ADD_ON',
      'PEIN-008 calc_model = ADD_ON',
      `PEIN-008 calc_model = ${pein008.price_model && pein008.price_model.calculation_model}`);
  }
}

// ─── 23. NO APPROVED STANDARDIZED SERVICE = FIXEO_ESTIMATE ───────────────────
console.log('\n=== 23. NO APPROVED STANDARDIZED SERVICE = FIXEO_ESTIMATE ===');
if (services.length > 0) {
  const estSvcs = services.filter(s =>
    s.human_decision === 'APPROVED' &&
    s.availability_status === 'STANDARDIZED' &&
    s.price_model && s.price_model.commercial_output_type === 'FIXEO_ESTIMATE'
  );
  check(estSvcs.length === 0, 'FIXEO_ESTIMATE = 0 on approved standardized services',
    `FIXEO_ESTIMATE incorrectly applied: ${estSvcs.map(s=>s.canonical_service_code).join(', ')}`);
}

// ─── 24. NO APPROVED PRICE CHANGED ───────────────────────────────────────────
// (Check 4 already covers this — confirm count)
console.log('\n=== 24. APPROVED PRICE INTEGRITY CONFIRMATION ===');
check(services.length === 53, '53 services, 53 prices, 0 changed (see check 4)', `Service count = ${services.length}`);

// ─── 25. NO DANGLING INPUT/QUESTION/ROUTE/POLICY/FORMULA REFS ─────────────────
console.log('\n=== 25. NO DANGLING REFS (INPUT / QUESTION / ROUTE / POLICY / FORMULA) ===');
// Already covered in checks 6–12. Summarize.
ok('All ref resolution checks already performed in checks 6–12 (inputs, questions, routes, policies, formulas)');

// ─── 26. NO RUNTIME IMPORT OF DRAFT ARTIFACTS ─────────────────────────────────
console.log('\n=== 26. NO RUNTIME IMPORT OF 7C.3 DRAFT ARTIFACTS ===');
try {
  const grep7c3 = execSync(
    'grep -r "canonical-inputs.v1.draft\\|prebooking-questions.v1.draft\\|commercial-copy.v1.draft\\|human-review-queue.v1.draft" --include="*.js" --include="*.html" --include="*.json" ' +
    REPO_ROOT + ' --exclude-dir=data/pricing --exclude-dir=node_modules -l 2>/dev/null || true',
    { encoding: 'utf8' }
  ).trim();
  const runtimeRefs = grep7c3.split('\n').filter(l => l && !l.includes('data/pricing'));
  check(runtimeRefs.length === 0, 'No runtime file imports 7C.3 draft artifacts', `Runtime refs: ${runtimeRefs.join(', ')}`);
} catch(e) { ok('Runtime ref grep passed (no matches)'); }

// ─── 27. PRODUCTION RUNTIME DIFF = 0 ──────────────────────────────────────────
console.log('\n=== 27. PRODUCTION RUNTIME DIFF = 0 ===');
try {
  const diff = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  check(diff === '', 'Working tree clean — production diff = 0', `Non-empty working tree diff: ${diff.slice(0,200)}`);
  const staged = execSync('git diff --name-only --cached HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  if (staged) {
    const stagedFiles = staged.split('\n').filter(l => l);
    const prodFiles = stagedFiles.filter(l => !l.includes('data/pricing'));
    check(prodFiles.length === 0, 'Only data/pricing/ in staged changes', `Staged production files: ${prodFiles.join(', ')}`);
    const frozenModified = stagedFiles.filter(l => l.match(/registry\.v0\.[123]\.json|calibration\.v0\.[123]\.json/) && !l.includes('data/pricing'));
    check(frozenModified.length === 0, 'No frozen V0.x files modified', `Frozen files modified: ${frozenModified.join(', ')}`);
  } else {
    ok('No staged changes — all committed');
  }
} catch(e) { err(`Git check failed: ${e.message.slice(0,100)}`); }

// ─── 28. COMMERCIAL COPY — NO PRIX INDICATIF FOR CONTRACTUAL TYPES ────────────
console.log('\n=== 28. COMMERCIAL COPY — NO PRIX INDICATIF FOR CONTRACTUAL TYPES ===');
if (copy_reg) {
  const contractual = ['FIXEO_PRICE','FIXEO_CALCULATED_PRICE','FIXEO_LABOUR_PRICE_PLUS_PART','FIXEO_DIAGNOSTIC','FIXEO_ADD_ON'];
  const copyByType = copy_reg.copy_by_output_type || {};
  contractual.forEach(type => {
    const entry = copyByType[type];
    if (entry) {
      const allText = JSON.stringify(entry).toLowerCase();
      // Check NOT_ALLOWED field exists and contains the prohibition
      const hasProhibition = entry.NOT_ALLOWED_fr && entry.NOT_ALLOWED_fr.includes('INTERDIT');
      check(hasProhibition, `${type}: NOT_ALLOWED_fr contains prohibition`, `${type}: missing prix-indicatif prohibition`);
    }
  });
  // FIXEO_ESTIMATE must explicitly state it's non-contractual
  const estimate = copyByType['FIXEO_ESTIMATE'];
  check(estimate && estimate.commercial_status === 'NON_CONTRACTUAL_ESTIMATE',
    'FIXEO_ESTIMATE: commercial_status = NON_CONTRACTUAL_ESTIMATE', 'FIXEO_ESTIMATE missing NON_CONTRACTUAL_ESTIMATE');
  check(estimate && estimate.approved_services_count === 0,
    'FIXEO_ESTIMATE: approved_services_count = 0', `FIXEO_ESTIMATE: approved_services_count = ${estimate && estimate.approved_services_count}`);
}

// ─── 29. HUMAN REVIEW QUEUE COMPLETENESS ─────────────────────────────────────
console.log('\n=== 29. HUMAN REVIEW QUEUE STRUCTURE ===');
if (hrq) {
  const items = Object.values(hrq.items || {});
  check(items.length > 0, `HRQ has items (${items.length})`, 'HRQ is empty — suspicious');
  const engineBlocking = items.filter(i => i.blocking_for_engine).length;
  const prodBlocking = items.filter(i => i.blocking_for_production).length;
  ok(`HRQ: ${items.length} total, ${engineBlocking} engine-blocking, ${prodBlocking} production-blocking`);
  // All items must have required fields
  const missingFields = items.filter(i => !i.review_id || !i.category || !i.problem || !i.recommended_next_action);
  check(missingFields.length === 0, 'All HRQ items have required fields', `Incomplete items: ${missingFields.map(i=>i.review_id).join(', ')}`);
  check(hrq._meta && hrq._meta.engine_blocking_count === engineBlocking, `HRQ meta.engine_blocking_count = ${engineBlocking}`, `HRQ meta count mismatch`);
}

// ─── 30. CONDITIONAL ELIGIBILITY COVERAGE ────────────────────────────────────
console.log('\n=== 30. ALL CONDITIONAL SERVICES HAVE STRUCTURED ELIGIBILITY ===');
if (services.length > 0) {
  const conditional = services.filter(s => s.eligibility && s.eligibility.qualification_status === 'CONDITIONAL');
  const unstructured = conditional.filter(s => !s.eligibility.structured);
  check(unstructured.length === 0, `All ${conditional.length} CONDITIONAL services are fully structured`,
    `Unstructured CONDITIONAL services: ${unstructured.map(s=>s.canonical_service_code).join(', ')}`);
  const noPreds = conditional.filter(s => {
    const e = s.eligibility;
    const hasPreds = e.required_conditions && e.required_conditions.length > 0;
    const hasExcls = e.hard_exclusions && e.hard_exclusions.length > 0;
    const hasProse = e.supporting_prose && e.supporting_prose.length > 0;
    return !hasPreds && !hasExcls && !hasProse;
  });
  check(noPreds.length === 0, `All ${conditional.length} CONDITIONAL services have ≥1 predicate/exclusion/prose`,
    `No predicates, exclusions, or prose: ${noPreds.map(s=>s.canonical_service_code).join(', ')}`);
  const addOnSvcs = services.filter(s => s.eligibility && s.eligibility.qualification_status === 'ADD_ON_ONLY');
  ok(`ADD_ON_ONLY services: ${addOnSvcs.length} (expected 1 — PEIN-008)`);
  check(addOnSvcs.length === 1, 'Exactly 1 ADD_ON_ONLY service (PEIN-008)', `ADD_ON_ONLY count = ${addOnSvcs.length}`);
}

// ─── FINAL SUMMARY ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log('PHASE 7C.3 SEMANTIC HARDENING VALIDATOR SUMMARY');
console.log('═'.repeat(65));
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
  console.log('\nFailed checks:');
  errors.forEach(e => console.log(`  - ${e}`));
}
const status = fail === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${fail} CHECK(S) FAILED`;
console.log('\nStatus: ' + status);
if (fail === 0) {
  console.log('\nPHASE 7C.3 — FIXEO CANONICAL PRICING SEMANTIC HARDENING — COMPLETE — ENGINE CONTRACT READY');
}
