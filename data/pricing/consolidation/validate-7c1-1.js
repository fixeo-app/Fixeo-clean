#!/usr/bin/env node
'use strict';
// Phase 7C.1.1 — Doctrine Correction Validator
// Proves: floors vs diagnostics, serrurerie no floor, separation of concepts,
//         53 services, all production_ready=false, prices unchanged

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '../research');
const CONS = __dirname;
const REPO = path.resolve(__dirname, '../../../');

let pass = 0, fail = 0;
const errors = [];

function ok(msg) { console.log(`  ✅ PASS: ${msg}`); pass++; }
function err(msg) { console.log(`  ❌ FAIL: ${msg}`); fail++; errors.push(msg); }
function check(cond, passMsg, failMsg) { cond ? ok(passMsg) : err(failMsg); }

// ─── 1. ALL 8 V0.3 REGISTRIES STILL PRESENT ─────────────────────────────────
console.log('\n=== 1. FROZEN METIER REGISTRIES PRESENT ===');
const METIERS = ['plomberie','electricite','serrurerie','climatisation','bricolage','nettoyage','peinture','menuiserie'];
METIERS.forEach(m => {
  check(fs.existsSync(path.join(BASE, m, 'registry.v0.3.json')),
    `${m}/registry.v0.3.json still present`, `MISSING: ${m}/registry.v0.3.json`);
});

// ─── 2. LOAD ALL REGISTRIES AND EXTRACT APPROVED SERVICES ────────────────────
console.log('\n=== 2. EXTRACT APPROVED SERVICES + VERIFY PRICES UNCHANGED ===');

// Expected prices from V0.3 (ground truth — these must not change)
const EXPECTED_PRICES = {
  'plomberie.diagnostic': 180, 'plomberie.fuite_simple': 250,
  'plomberie.debouchage_evier': 250, 'plomberie.debouchage_wc_simple': 300,
  'plomberie.robinet_remplacement': 250, 'plomberie.chasse_eau': 300,
  'electricite.diagnostic': 200, 'electricite.prise_remplacement': 220,
  'electricite.interrupteur_remplacement.simple': 220,
  'electricite.interrupteur_remplacement.va_et_vient': 250,
  'electricite.luminaire_installation': 220, 'electricite.disjoncteur_remplacement': 250,
  'serrurerie.porte_claquee_ouverture': 220, 'serrurerie.porte_claquee_blindee_ouverture': 350,
  'serrurerie.porte_verrouillee_ouverture': 380, 'serrurerie.cle_cassee_extraction': 220,
  'serrurerie.cylindre_remplacement_standard': 280, 'serrurerie.serrure_remplacement_standard': 400,
  'CLIM-002': 250, 'CLIM-003': 300, 'CLIM-004': 450, 'CLIM-009': 250,
  'CLIM-013': 600, 'CLIM-020': 1000, 'CLIM-021': 1200, 'CLIM-030': 550,
  'BRIC-001': 200, 'BRIC-002': 150, 'BRIC-003': 400, 'BRIC-010': 200, 'BRIC-020': 200, 'BRIC-030': 300,
  'NET-001': 200, 'NET-002': 65, 'NET-004': 600, 'NET-010': 300, 'NET-011': 450,
  'NET-013': 250, 'NET-014': 300, 'NET-030': 18,
  'PEIN-001': 800, 'PEIN-002': 35, 'PEIN-003': 65, 'PEIN-004': 45, 'PEIN-005': 75, 'PEIN-008': 25,
  'MENU_001': 300, 'MENU_001B': 350, 'MENU_002': 300, 'MENU_003': 300,
  'MENU_004A': 300, 'MENU_004B': 350, 'MENU_006': 500
};

// Read service-classification.v0.1.json
const classFile = path.join(CONS, 'service-classification.v0.1.json');
check(fs.existsSync(classFile), 'service-classification.v0.1.json exists', 'MISSING: service-classification.v0.1.json');

let classification = null;
if (fs.existsSync(classFile)) {
  try {
    classification = JSON.parse(fs.readFileSync(classFile));
    ok('service-classification.v0.1.json is valid JSON');
    pass++;
    const svcs = classification.services || [];
    check(svcs.length === 53, `53 approved services in classification (actual: ${svcs.length})`,
      `Expected 53, got ${svcs.length}`);

    // Verify all production_ready = false
    const notFalse = svcs.filter(s => s.production_ready !== false);
    check(notFalse.length === 0, 'All 53 services have production_ready = false',
      `Non-false production_ready: ${notFalse.map(s => s.legacy_code).join(', ')}`);

    // Verify prices unchanged
    let priceChanges = [];
    svcs.forEach(s => {
      const expected = EXPECTED_PRICES[s.legacy_code];
      const actual = s.approved_price_mad;
      if (expected !== undefined && actual !== undefined && actual !== expected) {
        priceChanges.push(`${s.legacy_code}: expected=${expected} actual=${actual}`);
      }
    });
    check(priceChanges.length === 0, 'All approved prices unchanged from V0.3',
      `Price changes detected: ${priceChanges.join('; ')}`);

    // Check all 53 codes are accounted for
    const classifiedCodes = new Set(svcs.map(s => s.legacy_code));
    const expectedCodes = Object.keys(EXPECTED_PRICES);
    const missing = expectedCodes.filter(c => !classifiedCodes.has(c));
    check(missing.length === 0, `All ${expectedCodes.length} expected service codes classified`,
      `Missing classifications: ${missing.join(', ')}`);

    // Verify classification_status all CLASSIFIED (none stuck at HUMAN_REVIEW_REQUIRED)
    const blocked = svcs.filter(s => s.classification_status === 'HUMAN_REVIEW_REQUIRED');
    check(blocked.length === 0, 'No services stuck at HUMAN_REVIEW_REQUIRED (all classified)',
      `Still HUMAN_REVIEW_REQUIRED: ${blocked.map(s => s.legacy_code).join(', ')}`);

  } catch(e) {
    err(`service-classification.v0.1.json parse error: ${e.message}`); fail++;
  }
}

// ─── 3. MINIMUM FLOOR vs DIAGNOSTIC FEE SEPARATION ───────────────────────────
console.log('\n=== 3. MINIMUM FLOOR vs DIAGNOSTIC FEE SEPARATION ===');
if (classification) {
  const svcs = classification.services || [];

  // Plomberie diagnostic must NOT be minimum floor
  const ploumbDiag = svcs.find(s => s.legacy_code === 'plomberie.diagnostic');
  if (ploumbDiag) {
    check(ploumbDiag.calculation_model === 'DIAGNOSTIC',
      'plomberie.diagnostic has calculation_model = DIAGNOSTIC',
      `plomberie.diagnostic calculation_model = ${ploumbDiag.calculation_model} (expected DIAGNOSTIC)`);
    check(ploumbDiag.commercial_output_type === 'FIXEO_DIAGNOSTIC',
      'plomberie.diagnostic commercial_output_type = FIXEO_DIAGNOSTIC',
      `plomberie.diagnostic commercial_output_type = ${ploumbDiag.commercial_output_type}`);
    check(ploumbDiag.minimum_floor_mad === null || ploumbDiag.minimum_floor_mad === undefined,
      'plomberie.diagnostic minimum_floor_mad = null (NOT a minimum floor)',
      `plomberie.diagnostic minimum_floor_mad = ${ploumbDiag.minimum_floor_mad} — MUST be null`);
    check(ploumbDiag.diagnostic_applicable === true,
      'plomberie.diagnostic has diagnostic_applicable = true',
      'plomberie.diagnostic missing diagnostic_applicable');
  } else { err('plomberie.diagnostic not found in classification'); }

  // Electricite diagnostic must NOT be minimum floor
  const elecDiag = svcs.find(s => s.legacy_code === 'electricite.diagnostic');
  if (elecDiag) {
    check(elecDiag.calculation_model === 'DIAGNOSTIC',
      'electricite.diagnostic has calculation_model = DIAGNOSTIC',
      `electricite.diagnostic calculation_model = ${elecDiag.calculation_model}`);
    check(elecDiag.minimum_floor_mad === null || elecDiag.minimum_floor_mad === undefined,
      'electricite.diagnostic minimum_floor_mad = null (NOT a minimum floor)',
      `electricite.diagnostic minimum_floor_mad = ${elecDiag.minimum_floor_mad}`);
  } else { err('electricite.diagnostic not found in classification'); }

  // Climatisation CLIM-002 must NOT be minimum floor
  const climDiag = svcs.find(s => s.legacy_code === 'CLIM-002');
  if (climDiag) {
    check(climDiag.calculation_model === 'DIAGNOSTIC',
      'CLIM-002 has calculation_model = DIAGNOSTIC',
      `CLIM-002 calculation_model = ${climDiag.calculation_model}`);
    check(climDiag.minimum_floor_mad === null || climDiag.minimum_floor_mad === undefined,
      'CLIM-002 minimum_floor_mad = null (NOT a minimum floor)',
      `CLIM-002 minimum_floor_mad = ${climDiag.minimum_floor_mad}`);
  } else { err('CLIM-002 not found in classification'); }
}

// ─── 4. SERRURERIE NO MINIMUM FLOOR ──────────────────────────────────────────
console.log('\n=== 4. SERRURERIE NO MINIMUM FLOOR ===');
if (classification) {
  const svcs = classification.services || [];
  const summary = classification.validation_summary || {};

  check(summary.serrurerie_minimum_floor === null,
    'validation_summary.serrurerie_minimum_floor = null',
    `serrurerie_minimum_floor = ${summary.serrurerie_minimum_floor} (expected null)`);

  // 220 MAD service is NOT a floor policy
  const porteClaqueeSvc = svcs.find(s => s.legacy_code === 'serrurerie.porte_claquee_ouverture');
  if (porteClaqueeSvc) {
    check(porteClaqueeSvc.is_metier_minimum_floor === false,
      'serrurerie.porte_claquee_ouverture.is_metier_minimum_floor = false',
      'serrurerie.porte_claquee_ouverture missing is_metier_minimum_floor = false');
    check(porteClaqueeSvc.approved_price_mad === 220,
      'serrurerie.porte_claquee_ouverture price unchanged at 220 MAD',
      `price = ${porteClaqueeSvc.approved_price_mad} (expected 220)`);
  } else { err('serrurerie.porte_claquee_ouverture not found'); }
}

// ─── 5. MINIMUM FLOOR VALUES BY METIER ───────────────────────────────────────
console.log('\n=== 5. MINIMUM FLOOR VALUES ===');
const conceptsFile = path.join(CONS, 'canonical-concepts.v0.1.json');
check(fs.existsSync(conceptsFile), 'canonical-concepts.v0.1.json exists', 'MISSING: canonical-concepts.v0.1.json');
if (fs.existsSync(conceptsFile)) {
  try {
    const concepts = JSON.parse(fs.readFileSync(conceptsFile));
    ok('canonical-concepts.v0.1.json is valid JSON');
    pass++;

    const floors = concepts.minimum_floor_concept.metier_floors;
    check(floors.bricolage.minimum_floor_mad === 200, 'Bricolage minimum floor = 200', `Bricolage floor = ${floors.bricolage.minimum_floor_mad}`);
    check(floors.nettoyage.minimum_floor_mad === 200, 'Nettoyage minimum floor = 200', `Nettoyage floor = ${floors.nettoyage.minimum_floor_mad}`);
    check(floors.peinture.minimum_floor_mad === 800, 'Peinture minimum floor = 800', `Peinture floor = ${floors.peinture.minimum_floor_mad}`);
    check(floors.menuiserie.minimum_floor_mad === 300, 'Menuiserie minimum floor = 300', `Menuiserie floor = ${floors.menuiserie.minimum_floor_mad}`);
    check(floors.plomberie.minimum_floor_mad === null, 'Plomberie minimum floor = null', `Plomberie floor = ${floors.plomberie.minimum_floor_mad}`);
    check(floors.electricite.minimum_floor_mad === null, 'Electricite minimum floor = null', `Electricite floor = ${floors.electricite.minimum_floor_mad}`);
    check(floors.climatisation.minimum_floor_mad === null, 'Climatisation minimum floor = null', `Climatisation floor = ${floors.climatisation.minimum_floor_mad}`);
    check(floors.serrurerie.minimum_floor_mad === null, 'Serrurerie minimum floor = null', `Serrurerie floor = ${floors.serrurerie.minimum_floor_mad}`);

    // Verify Hybrid Model C is frozen
    const hybrid = concepts.hybrid_model_c_freeze;
    check(hybrid.decision_value === 'HYBRID_MODEL_C', 'Hybrid Model C frozen in canonical-concepts',
      `Hybrid decision = ${hybrid.decision_value}`);

  } catch(e) { err(`canonical-concepts.v0.1.json parse error: ${e.message}`); fail++; }
}

// ─── 6. CALCULATION_MODEL AND COMMERCIAL_OUTPUT_TYPE ARE SEPARATE FIELDS ─────
console.log('\n=== 6. CALCULATION MODEL vs COMMERCIAL OUTPUT SEPARATION ===');
if (classification) {
  const svcs = classification.services || [];
  const allHaveCalcModel = svcs.every(s => s.calculation_model && s.calculation_model.length > 0);
  const allHaveOutputType = svcs.every(s => s.commercial_output_type && s.commercial_output_type.length > 0);
  check(allHaveCalcModel, 'All 53 services have calculation_model field', 'Some services missing calculation_model');
  check(allHaveOutputType, 'All 53 services have commercial_output_type field', 'Some services missing commercial_output_type');

  // Check that the two fields are different for diagnostic and labour+part services
  const plombDiag = svcs.find(s => s.legacy_code === 'plomberie.diagnostic');
  if (plombDiag) {
    check(plombDiag.calculation_model !== plombDiag.commercial_output_type,
      `plomberie.diagnostic: calculation_model (${plombDiag.calculation_model}) ≠ commercial_output_type (${plombDiag.commercial_output_type})`,
      'plomberie.diagnostic: calculation_model and commercial_output_type should differ');
  }

  const menu002 = svcs.find(s => s.legacy_code === 'MENU_002');
  if (menu002) {
    check(menu002.calculation_model === 'LABOUR_FIXED_PART_SEPARATE',
      'MENU_002: calculation_model = LABOUR_FIXED_PART_SEPARATE',
      `MENU_002 calculation_model = ${menu002.calculation_model}`);
    check(menu002.commercial_output_type === 'FIXEO_LABOUR_PRICE_PLUS_PART',
      'MENU_002: commercial_output_type = FIXEO_LABOUR_PRICE_PLUS_PART',
      `MENU_002 commercial_output_type = ${menu002.commercial_output_type}`);
  }
}

// ─── 7. PER_HOUR vs PER_CLEANER_HOUR DISTINCTION ─────────────────────────────
console.log('\n=== 7. PER_HOUR vs PER_CLEANER_HOUR DISTINCTION ===');
if (classification) {
  const svcs = classification.services || [];
  const bric002 = svcs.find(s => s.legacy_code === 'BRIC-002');
  const net002 = svcs.find(s => s.legacy_code === 'NET-002');

  if (bric002) {
    check(bric002.calculation_model === 'TIME_BASED_SINGLE',
      'BRIC-002 calculation_model = TIME_BASED_SINGLE (single artisan)',
      `BRIC-002 calculation_model = ${bric002.calculation_model}`);
    check(bric002.unit === 'PER_HOUR', 'BRIC-002 unit = PER_HOUR', `BRIC-002 unit = ${bric002.unit}`);
    check(bric002.worker_count_semantics === 'SINGLE_IMPLICIT',
      'BRIC-002 worker_count_semantics = SINGLE_IMPLICIT',
      `BRIC-002 worker_count_semantics = ${bric002.worker_count_semantics}`);
  }

  if (net002) {
    check(net002.calculation_model === 'TIME_BASED_TEAM',
      'NET-002 calculation_model = TIME_BASED_TEAM (team)',
      `NET-002 calculation_model = ${net002.calculation_model}`);
    check(net002.unit === 'PER_CLEANER_HOUR', 'NET-002 unit = PER_CLEANER_HOUR', `NET-002 unit = ${net002.unit}`);
    check(net002.worker_count_semantics === 'EXPLICIT_TEAM',
      'NET-002 worker_count_semantics = EXPLICIT_TEAM',
      `NET-002 worker_count_semantics = ${net002.worker_count_semantics}`);
  }

  if (bric002 && net002) {
    check(bric002.calculation_model !== net002.calculation_model,
      `BRIC-002 (${bric002.calculation_model}) ≠ NET-002 (${net002.calculation_model}) — distinct models`,
      'BRIC-002 and NET-002 have same calculation_model — CRITICAL semantic collapse');
    check(bric002.unit !== net002.unit,
      `BRIC-002 unit (${bric002.unit}) ≠ NET-002 unit (${net002.unit}) — distinct units`,
      'BRIC-002 and NET-002 have same unit — CRITICAL semantic collapse');
  }
}

// ─── 8. PER_M2 / PER_PAINTED_M2 / PER_CEILING_M2 DISTINCT ───────────────────
console.log('\n=== 8. PER_M2 vs PER_PAINTED_M2 vs PER_CEILING_M2 DISTINCT ===');
if (classification) {
  const svcs = classification.services || [];
  const net030 = svcs.find(s => s.legacy_code === 'NET-030');
  const pein002 = svcs.find(s => s.legacy_code === 'PEIN-002');
  const pein004 = svcs.find(s => s.legacy_code === 'PEIN-004');

  if (net030) check(net030.unit === 'PER_M2', 'NET-030 unit = PER_M2', `NET-030 unit = ${net030.unit}`);
  if (pein002) check(pein002.unit === 'PER_PAINTED_M2', 'PEIN-002 unit = PER_PAINTED_M2', `PEIN-002 unit = ${pein002.unit}`);
  if (pein004) check(pein004.unit === 'PER_CEILING_M2', 'PEIN-004 unit = PER_CEILING_M2', `PEIN-004 unit = ${pein004.unit}`);

  if (net030 && pein002 && pein004) {
    const units = [net030.unit, pein002.unit, pein004.unit];
    check(new Set(units).size === 3, 'PER_M2, PER_PAINTED_M2, PER_CEILING_M2 are all distinct',
      'At least two of PER_M2/PER_PAINTED_M2/PER_CEILING_M2 are the same — CRITICAL');
  }
}

// ─── 9. DIAGNOSTIC ABSORPTION IS METIER-SPECIFIC ─────────────────────────────
console.log('\n=== 9. DIAGNOSTIC ABSORPTION IS METIER-SPECIFIC ===');
if (classification) {
  const svcs = classification.services || [];
  const diagnostics = svcs.filter(s => s.calculation_model === 'DIAGNOSTIC');
  check(diagnostics.length === 3, `3 diagnostic services identified (actual: ${diagnostics.length})`,
    `Expected 3 diagnostics, found ${diagnostics.length}`);
  diagnostics.forEach(d => {
    check(d.diagnostic_absorption && d.diagnostic_absorption.qualifying_service_codes,
      `${d.legacy_code}: has metier-specific qualifying_service_codes`,
      `${d.legacy_code}: missing qualifying_service_codes — absorption not metier-specific`);
  });
}

// ─── 10. MENUISERIE EXPERIMENTAL BATCH RULES PRESERVED ───────────────────────
console.log('\n=== 10. MENUISERIE EXPERIMENTAL BATCH RULES PRESERVED ===');
if (classification) {
  const svcs = classification.services || [];
  ['MENU_002','MENU_003'].forEach(code => {
    const s = svcs.find(x => x.legacy_code === code);
    if (s) {
      check(s.batch_policy && s.batch_policy.status === 'EXPERIMENTAL_BATCH_RULE',
        `${code}: batch_policy.status = EXPERIMENTAL_BATCH_RULE`,
        `${code}: batch rule not marked EXPERIMENTAL`);
      check(s.batch_policy && s.batch_policy.promotion_status === 'NOT_PROMOTED_TO_UNIVERSAL_CANONICAL',
        `${code}: batch rule NOT_PROMOTED_TO_UNIVERSAL_CANONICAL`,
        `${code}: batch promotion_status incorrect`);
    } else { err(`${code} not found in classification`); }
  });
}

// ─── 11. COMMERCIAL OUTPUT POLICY FILE ───────────────────────────────────────
console.log('\n=== 11. COMMERCIAL-OUTPUT-POLICY.V0.1.JSON ===');
const commFile = path.join(CONS, 'commercial-output-policy.v0.1.json');
check(fs.existsSync(commFile), 'commercial-output-policy.v0.1.json exists', 'MISSING: commercial-output-policy.v0.1.json');
if (fs.existsSync(commFile)) {
  try {
    const comm = JSON.parse(fs.readFileSync(commFile));
    ok('commercial-output-policy.v0.1.json is valid JSON');
    pass++;
    check(comm.frozen_commercial_model.value === 'HYBRID_MODEL_C',
      'Hybrid Model C frozen in commercial-output-policy', 'Hybrid Model C not frozen');
    const types = comm.commercial_output_types || [];
    check(types.length >= 6, `≥6 commercial output types (actual: ${types.length})`, `Expected ≥6, got ${types.length}`);
    const estimateType = types.find(t => t.type === 'FIXEO_ESTIMATE');
    check(estimateType && estimateType.current_service_count === 0,
      'FIXEO_ESTIMATE current_service_count = 0 (not applied to any current service)',
      'FIXEO_ESTIMATE incorrectly applied to services');
    // Verify scope-change protocol present
    check(comm.contractual_price_doctrine && comm.contractual_price_doctrine.scope_change_protocol,
      'Scope-change protocol present in commercial output policy',
      'Missing scope-change protocol');
    // Verify legacy disclaimer is marked NOT_CANONICAL
    check(comm.legacy_disclaimer_correction &&
      comm.legacy_disclaimer_correction.canonical_status.includes('NOT_CANONICAL'),
      'Legacy disclaimer marked NOT_CANONICAL_FOR_STANDARDIZED_FIXEO_PRICE',
      'Legacy disclaimer not correctly marked');
  } catch(e) { err(`commercial-output-policy.v0.1.json parse error: ${e.message}`); fail++; }
}

// ─── 12. NO CITY MULTIPLIER INTRODUCED ───────────────────────────────────────
console.log('\n=== 12. NO CITY MULTIPLIER / UNAPPROVED MODIFIER ===');
if (classification) {
  const svcs = classification.services || [];
  const badMod = svcs.filter(s =>
    s.city_adjustment !== null && s.city_adjustment !== undefined
  );
  check(badMod.length === 0, 'No city_adjustment introduced in classification',
    `city_adjustment non-null: ${badMod.map(s => s.legacy_code).join(', ')}`);
}
// Check canonical-concepts also doesn't introduce city modifiers
if (fs.existsSync(conceptsFile)) {
  const c = JSON.parse(fs.readFileSync(conceptsFile));
  const fields = c.canonical_schema_fields_required && c.canonical_schema_fields_required.fields;
  if (fields) {
    check(fields.city_adjustment === 'null — always null, all métiers',
      'canonical-concepts confirms city_adjustment = null for all services',
      'canonical-concepts missing city_adjustment null declaration');
  }
}

// ─── 13. PHASE 7C.1 HISTORICAL ARTIFACTS UNTOUCHED ───────────────────────────
console.log('\n=== 13. PHASE 7C.1 HISTORICAL ARTIFACTS PRESERVED ===');
const historicalFiles = ['7c1-audit.md','service-matrix.json','architecture-map.json',
  'unit-map.json','policy-map.json','legacy-collision-map.json',
  'canonical-registry-proposal.md','migration-plan.md','validate.js'];
historicalFiles.forEach(f => {
  check(fs.existsSync(path.join(CONS, f)), `7C.1 historical artifact preserved: ${f}`, `MISSING 7C.1 artifact: ${f}`);
});

// ─── 14. NEW 7C.1.1 ARTIFACTS EXIST ─────────────────────────────────────────
console.log('\n=== 14. NEW 7C.1.1 ARTIFACTS PRESENT ===');
['phase-7c1-1-doctrine-correction.md','canonical-concepts.v0.1.json',
 'commercial-output-policy.v0.1.json','service-classification.v0.1.json',
 'validate-7c1-1.js'].forEach(f => {
  check(fs.existsSync(path.join(CONS, f)), `7C.1.1 artifact present: ${f}`, `MISSING 7C.1.1 artifact: ${f}`);
});

// canonical-registry.v1.json must NOT exist
check(!fs.existsSync(path.join(CONS, 'canonical-registry.v1.json')),
  'canonical-registry.v1.json still does not exist (correct)',
  'FOUND canonical-registry.v1.json — must not be created yet');

// ─── 15. PRODUCTION RUNTIME = 0 DIFF ─────────────────────────────────────────
console.log('\n=== 15. PRODUCTION RUNTIME DIFF = 0 ===');
try {
  const diff = execSync('git diff --name-only HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  check(diff === '', 'Production runtime diff = 0', `Non-empty diff: ${diff}`);
  const staged = execSync('git diff --name-only --cached HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  const frozenModified = staged.split('\n').filter(l =>
    l.match(/registry\.v0\.[123]\.json|calibration\.v0\.[123]\.json|human-decision\.v0\.[123]\.md/) &&
    !l.includes('consolidation')
  );
  check(frozenModified.length === 0, 'No frozen métier V0.3 files modified',
    `Frozen files modified: ${frozenModified.join(', ')}`);
} catch(e) { err(`Git check error: ${e.message}`); }

// ─── FINAL SUMMARY ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(62));
console.log('PHASE 7C.1.1 VALIDATION SUMMARY');
console.log('═'.repeat(62));
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
  console.log('\nFailed checks:');
  errors.forEach(e => console.log(`  - ${e}`));
}
const status = fail === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${fail} CHECK(S) FAILED`;
console.log('\nStatus: ' + status);
if (fail === 0) {
  console.log('\nPHASE 7C.1.1 — FIXEO CANONICAL PRICING DOCTRINE CORRECTION & HYBRID MODEL C FREEZE — COMPLETE — READY FOR PHASE 7C.2 CANONICAL REGISTRY DESIGN');
}
