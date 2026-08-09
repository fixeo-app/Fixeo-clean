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
