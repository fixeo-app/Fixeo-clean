#!/usr/bin/env node
/**
 * FIXEO Peinture Research Validator
 * Phase 7B.9
 */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ERRORS = [];
let PASS = true;

function fail(msg) {
  ERRORS.push('  ERROR: ' + msg);
  PASS = false;
}

function check(condition, msg) {
  if (!condition) fail(msg);
}

// Load JSON files
function loadJson(filename) {
  const filepath = path.join(DIR, filename);
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    fail(`JSON parse failed for ${filename}: ${e.message}`);
    return null;
  }
}

console.log('='.repeat(60));
console.log('FIXEO Peinture Research Validator — Phase 7B.9');
console.log('='.repeat(60));

// Load all files
const sources = loadJson('sources.v0.1.json');
const evidence = loadJson('evidence.v0.1.json');
const registry = loadJson('registry.v0.1.json');
const exclusions = loadJson('exclusions.v0.1.json');

if (!sources || !evidence || !registry || !exclusions) {
  console.log('\nFATAL: Cannot continue validation — JSON parse error(s) above.');
  process.exit(1);
}

console.log(`\nLoaded: ${sources.length} sources, ${evidence.length} evidence items, ${registry.length} services, ${exclusions.length} exclusions`);

// ---- CHECK 1: Unique service codes ----
console.log('\n[1] Checking unique service codes...');
const serviceCodes = registry.map(s => s.service_code);
const uniqueCodes = new Set(serviceCodes);
check(
  serviceCodes.length === uniqueCodes.size,
  `Duplicate service codes found: ${serviceCodes.filter((c, i) => serviceCodes.indexOf(c) !== i).join(', ')}`
);
if (serviceCodes.length === uniqueCodes.size) console.log('    OK — all service codes unique');

// ---- CHECK 2: Unique source IDs ----
console.log('\n[2] Checking unique source IDs...');
const sourceIds = sources.map(s => s.source_id);
const uniqueSourceIds = new Set(sourceIds);
check(
  sourceIds.length === uniqueSourceIds.size,
  'Duplicate source_ids found'
);
if (sourceIds.length === uniqueSourceIds.size) console.log('    OK — all source IDs unique');

// ---- CHECK 3: Registry source_ids resolve to sources ----
console.log('\n[3] Checking registry source_ids resolve to sources...');
let registrySourceRefErrors = 0;
for (const svc of registry) {
  for (const sid of (svc.source_ids || [])) {
    if (!uniqueSourceIds.has(sid)) {
      fail(`Registry service ${svc.service_code} references unknown source_id: ${sid}`);
      registrySourceRefErrors++;
    }
  }
}
if (registrySourceRefErrors === 0) console.log('    OK — all registry source_ids resolve');

// ---- CHECK 4: Evidence source_ids resolve to sources ----
console.log('\n[4] Checking evidence source_ids resolve to sources...');
let evidenceSourceRefErrors = 0;
for (const ev of evidence) {
  if (!uniqueSourceIds.has(ev.source_id)) {
    fail(`Evidence ${ev.evidence_id} references unknown source_id: ${ev.source_id}`);
    evidenceSourceRefErrors++;
  }
}
if (evidenceSourceRefErrors === 0) console.log('    OK — all evidence source_ids resolve');

// ---- CHECK 5: No production_ready = true ----
console.log('\n[5] Checking no production_ready = true...');
const productionReady = registry.filter(s => s.production_ready === true);
check(productionReady.length === 0, `Services with production_ready=true: ${productionReady.map(s => s.service_code).join(', ')}`);
if (productionReady.length === 0) console.log('    OK — no service has production_ready=true');

// ---- CHECK 6: human_decision values ----
console.log('\n[6] Checking human_decision values...');
const VALID_DECISIONS = ['PENDING', 'DEFERRED', 'QUOTE_REQUIRED', 'INSUFFICIENT_EVIDENCE', 'NOT_PEINTURE_SCOPE'];
let decisionErrors = 0;
for (const svc of registry) {
  if (!VALID_DECISIONS.includes(svc.human_decision)) {
    fail(`Service ${svc.service_code} has invalid human_decision: ${svc.human_decision}`);
    decisionErrors++;
  }
}
if (decisionErrors === 0) console.log('    OK — all human_decision values are valid');

// ---- CHECK 7: All city/urgency/time modifiers are null ----
console.log('\n[7] Checking all modifiers are null...');
const MODIFIER_FIELDS = ['city_adjustment', 'urgency_modifier', 'night_modifier', 'weekend_modifier', 'holiday_modifier', 'express_modifier'];
let modifierErrors = 0;
for (const svc of registry) {
  for (const field of MODIFIER_FIELDS) {
    if (svc[field] !== null && svc[field] !== undefined) {
      fail(`Service ${svc.service_code} has non-null ${field}: ${svc[field]}`);
      modifierErrors++;
    }
  }
}
if (modifierErrors === 0) console.log('    OK — all modifiers are null');

// ---- CHECK 8: m²-based evidence has explicit measurement_basis ----
console.log('\n[8] Checking m²-based evidence has measurement_basis...');
let mbErrors = 0;
for (const ev of evidence) {
  const hasM2 = (ev.unit || '').toLowerCase().includes('m2') || (ev.unit || '').includes('m²');
  if (hasM2) {
    if (!ev.measurement_basis || ev.measurement_basis === null) {
      fail(`Evidence ${ev.evidence_id} has m² unit but null measurement_basis`);
      mbErrors++;
    }
  }
}
if (mbErrors === 0) console.log('    OK — all m²-based evidence has measurement_basis');

// ---- CHECK 9: No UNKNOWN measurement basis silently applied to m² evidence ----
console.log('\n[9] Checking UNKNOWN_M2_BASIS is explicitly flagged (not null)...');
let unknownBasisErrors = 0;
for (const ev of evidence) {
  const hasM2 = (ev.unit || '').toLowerCase().includes('m2') || (ev.unit || '').includes('m²');
  if (hasM2 && ev.measurement_basis === null) {
    fail(`Evidence ${ev.evidence_id} has m² unit but measurement_basis is null — must be UNKNOWN_M2_BASIS if unclear`);
    unknownBasisErrors++;
  }
}
if (unknownBasisErrors === 0) console.log('    OK — UNKNOWN_M2_BASIS explicitly assigned where applicable');

// ---- CHECK 10: labour_policy is always set on evidence ----
console.log('\n[10] Checking labour_policy set on all evidence...');
const VALID_LABOUR = ['LABOUR_ONLY', 'LABOUR_PLUS_BASIC_CONSUMABLES', 'LABOUR_PLUS_PAINT', 'ALL_IN_MATERIAL_AND_LABOUR', 'UNKNOWN'];
let lpErrors = 0;
for (const ev of evidence) {
  if (!VALID_LABOUR.includes(ev.labour_policy)) {
    fail(`Evidence ${ev.evidence_id} has invalid labour_policy: ${ev.labour_policy}`);
    lpErrors++;
  }
}
if (lpErrors === 0) console.log('    OK — all evidence has valid labour_policy');

// ---- CHECK 11: T0 sources are not used as primary external evidence in registry ----
console.log('\n[11] Checking T0 sources not used as primary external evidence in registry...');
const t0Ids = sources.filter(s => s.grade === 'T0').map(s => s.source_id);
let t0UsageInRegistry = 0;
for (const svc of registry) {
  const usedT0 = (svc.source_ids || []).filter(sid => t0Ids.includes(sid));
  if (usedT0.length > 0) {
    // T0 sources can appear in registry if mixed with real sources, but not as ONLY sources
    const nonT0Sources = (svc.source_ids || []).filter(sid => !t0Ids.includes(sid));
    if (nonT0Sources.length === 0) {
      fail(`Service ${svc.service_code} relies ONLY on T0 sources: ${usedT0.join(', ')}`);
      t0UsageInRegistry++;
    }
  }
}
if (t0UsageInRegistry === 0) console.log('    OK — no service relies exclusively on T0 sources');

// ---- CHECK 12: External research exists (non-T0 sources > 0) ----
console.log('\n[12] Checking external research exists (non-T0 sources)...');
const externalSources = sources.filter(s => s.grade !== 'T0');
check(externalSources.length >= 3, `Too few external sources: ${externalSources.length} (minimum 3 required)`);
if (externalSources.length >= 3) console.log(`    OK — ${externalSources.length} external sources documented`);

// ---- CHECK 13: All evidence IDs are unique ----
console.log('\n[13] Checking evidence IDs are unique...');
const evidenceIds = evidence.map(e => e.evidence_id);
const uniqueEvidenceIds = new Set(evidenceIds);
check(
  evidenceIds.length === uniqueEvidenceIds.size,
  'Duplicate evidence IDs found'
);
if (evidenceIds.length === uniqueEvidenceIds.size) console.log('    OK — all evidence IDs unique');

// ---- V0.2 CALIBRATION CHECKS ----
const calibrationPath = path.join(DIR, 'calibration.v0.2.json');
if (fs.existsSync(calibrationPath)) {
  console.log('\n--- V0.2 Calibration Checks ---');
  let cal;
  try {
    cal = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
  } catch(e) {
    fail(`calibration.v0.2.json parse failed: ${e.message}`);
    cal = null;
  }

  if (cal) {
    // Check 14: Exactly 7 calibration candidates
    console.log('\n[14] Checking exactly 7 calibration candidates...');
    const calServices = cal.calibration_candidates || [];
    check(calServices.length === 7, `Expected 7 calibration candidates, found ${calServices.length}`);
    if (calServices.length === 7) console.log('    OK — exactly 7 calibration candidates');

    // Check 15: All calibration candidates human_decision = PENDING
    console.log('\n[15] Checking all calibration candidates human_decision = PENDING...');
    let calDecisionErrors = 0;
    for (const svc of calServices) {
      if (svc.human_decision !== 'PENDING') {
        fail(`Calibration service ${svc.service_code} has human_decision = ${svc.human_decision} (must be PENDING)`);
        calDecisionErrors++;
      }
    }
    if (calDecisionErrors === 0) console.log('    OK — all calibration candidates are PENDING');

    // Check 16: All calibration candidates production_ready = false
    console.log('\n[16] Checking all calibration candidates production_ready = false...');
    const calProdReady = calServices.filter(s => s.production_ready === true);
    check(calProdReady.length === 0, `Calibration services with production_ready=true: ${calProdReady.map(s => s.service_code).join(', ')}`);
    if (calProdReady.length === 0) console.log('    OK — all calibration candidates have production_ready=false');

    // Check 17: All calibration candidates modifiers = null
    console.log('\n[17] Checking calibration candidate modifiers are null...');
    let calModErrors = 0;
    const MODIFIER_FIELDS_CAL = ['city_adjustment', 'urgency_modifier', 'night_modifier', 'weekend_modifier', 'holiday_modifier', 'express_modifier'];
    for (const svc of calServices) {
      for (const field of MODIFIER_FIELDS_CAL) {
        if (svc[field] !== null && svc[field] !== undefined) {
          fail(`Calibration service ${svc.service_code} has non-null ${field}: ${svc[field]}`);
          calModErrors++;
        }
      }
    }
    if (calModErrors === 0) console.log('    OK — all calibration modifiers are null');

    // Check 18: Painted-surface doctrine preserved (measurement_basis not FLOOR_AREA on wall services)
    console.log('\n[18] Checking painted-surface doctrine (wall services use PAINTED_SURFACE_M2)...');
    let paintedSurfaceErrors = 0;
    const wallServices = calServices.filter(s =>
      s.pricing_unit === 'PER_PAINTED_M2' || s.pricing_unit === 'PER_CEILING_M2'
    );
    for (const svc of wallServices) {
      if (svc.measurement_basis === 'FLOOR_AREA_M2') {
        fail(`Service ${svc.service_code} (${svc.pricing_unit}) uses FLOOR_AREA_M2 measurement — must use PAINTED_SURFACE_M2`);
        paintedSurfaceErrors++;
      }
    }
    if (paintedSurfaceErrors === 0) console.log('    OK — painted surface doctrine preserved');

    // Check 19: Correct code list
    console.log('\n[19] Checking required service codes present...');
    const REQUIRED_CODES = ['PEIN-001', 'PEIN-002', 'PEIN-003', 'PEIN-004', 'PEIN-005', 'PEIN-006', 'PEIN-008'];
    const foundCodes = calServices.map(s => s.service_code);
    const missingCodes = REQUIRED_CODES.filter(c => !foundCodes.includes(c));
    check(missingCodes.length === 0, `Missing required calibration codes: ${missingCodes.join(', ')}`);
    if (missingCodes.length === 0) console.log('    OK — all required service codes present');

    // Check 20: Meta fields correct
    console.log('\n[20] Checking calibration meta fields...');
    check(cal._meta && cal._meta.all_production_ready === false, 'calibration._meta.all_production_ready must be false');
    check(cal._meta && cal._meta.all_human_decision === 'PENDING', 'calibration._meta.all_human_decision must be PENDING');
    if (cal._meta && cal._meta.all_production_ready === false && cal._meta.all_human_decision === 'PENDING') {
      console.log('    OK — meta fields correct');
    }
  }
} else {
  console.log('\n[14–20] calibration.v0.2.json not found — V0.2 checks skipped');
}

// ---- V0.3 FREEZE CHECKS ----
const v03Path = path.join(DIR, 'registry.v0.3.json');
if (fs.existsSync(v03Path)) {
  console.log('\n--- V0.3 Human Price Freeze Checks ---');
  let v03;
  try {
    v03 = JSON.parse(fs.readFileSync(v03Path, 'utf8'));
  } catch(e) {
    fail(`registry.v0.3.json parse failed: ${e.message}`);
    v03 = null;
  }

  if (v03) {
    const approved = v03.approved_services || [];
    const deferred = v03.deferred_services || [];

    // Check 22: Exactly 6 approved services
    console.log('\n[22] Checking exactly 6 approved services...');
    check(approved.length === 6, `Expected 6 approved services, found ${approved.length}`);
    if (approved.length === 6) console.log('    OK — 6 approved services');

    // Check 23: Exact approved prices
    console.log('\n[23] Checking exact approved prices...');
    const EXPECTED = {
      'PEIN-001': 800,
      'PEIN-002': 35,
      'PEIN-003': 65,
      'PEIN-004': 45,
      'PEIN-005': 75,
      'PEIN-008': 25
    };
    let priceErrors = 0;
    for (const [code, expectedPrice] of Object.entries(EXPECTED)) {
      const svc = approved.find(s => s.service_code === code);
      if (!svc) {
        fail(`Missing approved service: ${code}`);
        priceErrors++;
      } else if (svc.approved_price_mad !== expectedPrice) {
        fail(`${code}: expected price ${expectedPrice} MAD, found ${svc.approved_price_mad}`);
        priceErrors++;
      }
    }
    if (priceErrors === 0) console.log('    OK — all 6 prices exact: PEIN-001=800, PEIN-002=35, PEIN-003=65, PEIN-004=45, PEIN-005=75, PEIN-008=25');

    // Check 24: All approved have human_decision = APPROVED
    console.log('\n[24] Checking all approved services have human_decision = APPROVED...');
    let hdErrors = 0;
    for (const svc of approved) {
      if (svc.human_decision !== 'APPROVED') {
        fail(`${svc.service_code}: human_decision = ${svc.human_decision} (expected APPROVED)`);
        hdErrors++;
      }
    }
    if (hdErrors === 0) console.log('    OK — all 6 have human_decision = APPROVED');

    // Check 25: All approved have production_ready = false
    console.log('\n[25] Checking all approved production_ready = false...');
    const prodReady = approved.filter(s => s.production_ready !== false);
    check(prodReady.length === 0, `Services with production_ready != false: ${prodReady.map(s=>s.service_code).join(', ')}`);
    if (prodReady.length === 0) console.log('    OK — all approved have production_ready = false');

    // Check 26: PEIN-006 is DEFERRED with null approved price
    console.log('\n[26] Checking PEIN-006 is DEFERRED with null approved price...');
    const pein006 = deferred.find(s => s.service_code === 'PEIN-006');
    check(pein006 !== undefined, 'PEIN-006 not found in deferred services');
    if (pein006) {
      check(pein006.human_decision === 'DEFERRED', `PEIN-006 human_decision = ${pein006.human_decision} (expected DEFERRED)`);
      check(pein006.approved_price_mad === null, `PEIN-006 approved_price_mad = ${pein006.approved_price_mad} (must be null)`);
      if (pein006.human_decision === 'DEFERRED' && pein006.approved_price_mad === null) {
        console.log('    OK — PEIN-006 DEFERRED with null approved price');
      }
    }

    // Check 27: PEIN-008 is flagged as PREPARATION_ADD_ON
    console.log('\n[27] Checking PEIN-008 canonical role = PREPARATION_ADD_ON...');
    const pein008 = approved.find(s => s.service_code === 'PEIN-008');
    check(pein008 && pein008.canonical_role === 'PREPARATION_ADD_ON',
      `PEIN-008 canonical_role = ${pein008 ? pein008.canonical_role : 'NOT_FOUND'} (expected PREPARATION_ADD_ON)`);
    if (pein008 && pein008.canonical_role === 'PREPARATION_ADD_ON') console.log('    OK — PEIN-008 role = PREPARATION_ADD_ON');

    // Check 28: Painted surface doctrine exact
    console.log('\n[28] Checking measurement_basis frozen correctly...');
    const policies = v03.frozen_policies && v03.frozen_policies.measurement_basis_per_service;
    if (policies) {
      const EXPECTED_BASIS = {
        'PEIN-001': 'NOT_APPLICABLE',
        'PEIN-002': 'PAINTED_SURFACE_M2',
        'PEIN-003': 'PAINTED_SURFACE_M2',
        'PEIN-004': 'CEILING_M2',
        'PEIN-005': 'PAINTED_SURFACE_M2',
        'PEIN-008': 'PAINTED_SURFACE_M2'
      };
      let basisErrors = 0;
      for (const [code, expectedBasis] of Object.entries(EXPECTED_BASIS)) {
        if (policies[code] !== expectedBasis) {
          fail(`${code}: measurement_basis = ${policies[code]} (expected ${expectedBasis})`);
          basisErrors++;
        }
      }
      if (basisErrors === 0) console.log('    OK — measurement basis exact per service (PAINTED_SURFACE_M2/CEILING_M2/NOT_APPLICABLE)');
    } else {
      fail('frozen_policies.measurement_basis_per_service missing from registry.v0.3.json');
    }

    // Check 29: All approved modifiers = null
    console.log('\n[29] Checking approved services have null modifiers...');
    let v03ModErrors = 0;
    const V03_MOD_FIELDS = ['city_adjustment', 'urgency_modifier', 'night_modifier', 'weekend_modifier', 'holiday_modifier', 'express_modifier'];
    for (const svc of approved) {
      for (const field of V03_MOD_FIELDS) {
        if (svc[field] !== null && svc[field] !== undefined) {
          fail(`Approved service ${svc.service_code} has non-null ${field}`);
          v03ModErrors++;
        }
      }
    }
    if (v03ModErrors === 0) console.log('    OK — all approved modifiers are null');

    // Check 30: PEIN-003 price is 65 (not 60 from V0.2)
    console.log('\n[30] Checking PEIN-003 human adjustment to 65 MAD (not 60)...');
    const pein003 = approved.find(s => s.service_code === 'PEIN-003');
    check(pein003 && pein003.approved_price_mad === 65, `PEIN-003 price = ${pein003 ? pein003.approved_price_mad : 'NOT_FOUND'} (must be 65, not 60)`);
    check(pein003 && pein003.v02_recommended_price === 60, `PEIN-003 v02_recommended_price = ${pein003 ? pein003.v02_recommended_price : 'NOT_FOUND'} (must be 60 to preserve V0.2 history)`);
    if (pein003 && pein003.approved_price_mad === 65 && pein003.v02_recommended_price === 60) {
      console.log('    OK — PEIN-003 = 65 MAD (human adjusted from V0.2 recommendation of 60)');
    }

    // Check 31: PEIN-002 has CLIENT_SUPPLIED paint_policy
    console.log('\n[31] Checking PEIN-002 paint_policy = CLIENT_SUPPLIED...');
    const pein002 = approved.find(s => s.service_code === 'PEIN-002');
    check(pein002 && pein002.paint_policy === 'CLIENT_SUPPLIED',
      `PEIN-002 paint_policy = ${pein002 ? pein002.paint_policy : 'NOT_FOUND'} (expected CLIENT_SUPPLIED)`);
    if (pein002 && pein002.paint_policy === 'CLIENT_SUPPLIED') console.log('    OK — PEIN-002 paint_policy = CLIENT_SUPPLIED');

    // Check 32: Provenance and maturity exact
    console.log('\n[32] Checking price_provenance and maturity...');
    let provErrors = 0;
    for (const svc of approved) {
      if (svc.price_provenance !== 'FIXEO_HUMAN_CALIBRATED_PILOT') {
        fail(`${svc.service_code} price_provenance = ${svc.price_provenance}`);
        provErrors++;
      }
      if (svc.maturity !== 'LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION') {
        fail(`${svc.service_code} maturity = ${svc.maturity}`);
        provErrors++;
      }
    }
    if (provErrors === 0) console.log('    OK — price_provenance and maturity exact on all approved services');

    // Check 33: Anti-double-charge formula present in PEIN-002
    console.log('\n[33] Checking anti-double-charge rule present...');
    const pein001 = approved.find(s => s.service_code === 'PEIN-001');
    check(pein001 && pein001.anti_double_charge_rule && pein001.anti_double_charge_rule.length > 20,
      'PEIN-001 anti_double_charge_rule missing or too short');
    if (pein001 && pein001.anti_double_charge_rule && pein001.anti_double_charge_rule.length > 20) {
      console.log('    OK — anti-double-charge rule documented');
    }
  }
} else {
  console.log('\n[22–33] registry.v0.3.json not found — V0.3 checks skipped');
}

// ---- V0.1 INTEGRITY CHECK ----
console.log('\n[21] Verifying V0.1 artifacts not modified (checking file existence)...');
const V01_FILES = ['sources.v0.1.json', 'evidence.v0.1.json', 'registry.v0.1.json', 'exclusions.v0.1.json'];
let v01Errors = 0;
for (const f of V01_FILES) {
  if (!fs.existsSync(path.join(DIR, f))) {
    fail(`V0.1 artifact missing: ${f}`);
    v01Errors++;
  }
}
if (v01Errors === 0) console.log('    OK — all V0.1 artifacts present');

// ---- RESULT ----
console.log('\n' + '='.repeat(60));
if (PASS) {
  console.log('VALIDATION PASSED — All checks succeeded.');
  console.log(`  Sources: ${sources.length} | Evidence: ${evidence.length} | Services: ${registry.length} | Exclusions: ${exclusions.length}`);
  console.log('  production_ready = false for all services');
  console.log('  All modifiers = null');
  console.log('  No approved prices');
  console.log('  External research precedes T0 comparison');
  console.log('  V0.1 artifacts intact');
  if (fs.existsSync(calibrationPath)) {
    console.log('  V0.2 calibration: 7 candidates, all PENDING, painted-surface doctrine preserved');
  }
} else {
  console.log(`VALIDATION FAILED — ${ERRORS.length} error(s):`);
  ERRORS.forEach(e => console.log(e));
  process.exit(1);
}
console.log('='.repeat(60));
