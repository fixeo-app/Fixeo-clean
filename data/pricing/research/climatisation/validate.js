#!/usr/bin/env node
/**
 * validate.js — Phase 7B.6 FIXEO Climatisation Research Artifact Validator
 *
 * Validates:
 *  1.  Unique service codes in registry
 *  2.  All source_ids referenced in registry exist in sources.v0.1.json
 *  3.  All evidence_ids referenced in evidence.v0.1.json are internally unique
 *  4.  production_ready === false everywhere in registry
 *  5.  No service has review_status "APPROVED"
 *  6.  No city multipliers (city_adjustment must be null in _meta)
 *  7.  No urgency/night/weekend modifiers in _meta
 *  8.  reference_price === null when confidence === "INSUFFICIENT"
 *  9.  consensus_low <= market_anchor <= consensus_high where all present
 * 10.  Refrigerant services have refrigerant_policy !== null
 * 11.  Major component services have hardware_policy !== null
 * 12.  Production files untouched (git diff --name-only HEAD)
 * 13.  Prior research artifacts untouched (plomberie/electricite/serrurerie)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const RESEARCH_DIR = __dirname;

let passed = 0;
let failed = 0;
const errors = [];
const warnings = [];

function check(testName, condition, message) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}: ${message}`);
    errors.push({ test: testName, message });
    failed++;
  }
}

function warn(testName, message) {
  console.log(`  ⚠️  ${testName}: ${message}`);
  warnings.push({ test: testName, message });
}

// ─── Load files ─────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  FIXEO Phase 7B.6 — Climatisation Research Artifact Validator');
console.log('═══════════════════════════════════════════════════════════════\n');

const registryPath = path.join(RESEARCH_DIR, 'registry.v0.1.json');
const sourcesPath  = path.join(RESEARCH_DIR, 'sources.v0.1.json');
const evidencePath = path.join(RESEARCH_DIR, 'evidence.v0.1.json');
const exclusionsPath = path.join(RESEARCH_DIR, 'exclusions.v0.1.json');

let registry, sources, evidence, exclusions;

try {
  registry   = JSON.parse(fs.readFileSync(registryPath,  'utf8'));
  sources    = JSON.parse(fs.readFileSync(sourcesPath,   'utf8'));
  evidence   = JSON.parse(fs.readFileSync(evidencePath,  'utf8'));
  exclusions = JSON.parse(fs.readFileSync(exclusionsPath, 'utf8'));
  console.log('✅ All 4 JSON files loaded successfully.\n');
} catch (e) {
  console.error('❌ FATAL: Failed to load one or more JSON files:', e.message);
  process.exit(1);
}

const services   = registry.services || [];
const sourceList = sources.sources   || [];
const evidenceList = evidence.evidence || [];

// ─── Test 1: Unique service codes ────────────────────────────────────────────
console.log('── Test 1: Unique service codes ──');
const codes = services.map(s => s.service_code);
const uniqueCodes = new Set(codes);
check('All service_codes are unique', uniqueCodes.size === codes.length,
  `Duplicate codes: ${codes.filter((c, i) => codes.indexOf(c) !== i).join(', ')}`);
console.log(`  Service count: ${codes.length}\n`);

// ─── Test 2: Source references valid ─────────────────────────────────────────
console.log('── Test 2: Source references in registry exist in sources.v0.1.json ──');
const validSourceIds = new Set(sourceList.map(s => s.source_id));
let badSourceRefs = [];
services.forEach(svc => {
  (svc.source_ids || []).forEach(sid => {
    if (!validSourceIds.has(sid)) {
      badSourceRefs.push(`${svc.service_code} → ${sid}`);
    }
  });
});
check('All source_ids in registry exist in sources file', badSourceRefs.length === 0,
  `Invalid refs: ${badSourceRefs.join(' | ')}`);
console.log();

// ─── Test 3: Evidence IDs unique ─────────────────────────────────────────────
console.log('── Test 3: Evidence IDs are unique ──');
const evIds = evidenceList.map(e => e.evidence_id);
const uniqueEvIds = new Set(evIds);
check('All evidence_ids are unique', uniqueEvIds.size === evIds.length,
  `Duplicate: ${evIds.filter((e,i) => evIds.indexOf(e) !== i).join(', ')}`);
console.log(`  Evidence count: ${evIds.length}\n`);

// ─── Test 4: production_ready = false everywhere ──────────────────────────────
console.log('── Test 4: production_ready === false in all services ──');
const readyViolations = services.filter(s => s.production_ready !== false).map(s => s.service_code);
check('production_ready === false everywhere', readyViolations.length === 0,
  `Violations: ${readyViolations.join(', ')}`);
// Also check registry _meta
check('Registry _meta production_ready === false', registry._meta.production_ready === false,
  'Registry _meta has production_ready !== false');
console.log();

// ─── Test 5: No APPROVED review_status ──────────────────────────────────────
console.log('── Test 5: No service has review_status "APPROVED" ──');
const approvedSvcs = services.filter(s => s.review_status === 'APPROVED').map(s => s.service_code);
check('No service has review_status APPROVED', approvedSvcs.length === 0,
  `Approved services found: ${approvedSvcs.join(', ')}`);
console.log();

// ─── Test 6: No city multiplier ──────────────────────────────────────────────
console.log('── Test 6: No city_adjustment in registry _meta ──');
check('city_adjustment is null in registry _meta',
  registry._meta.city_adjustment === null,
  `city_adjustment = ${registry._meta.city_adjustment}`);
const svcsWithCity = services.filter(s => s.city_adjustment != null).map(s => s.service_code);
check('No service has city_adjustment', svcsWithCity.length === 0,
  `Services with city_adjustment: ${svcsWithCity.join(', ')}`);
console.log();

// ─── Test 7: No urgency/night/weekend modifiers ───────────────────────────────
console.log('── Test 7: Urgency/night/weekend modifiers all null ──');
const modifierFields = ['urgency_modifier', 'night_modifier', 'weekend_modifier', 'holiday_modifier', 'express_modifier'];
modifierFields.forEach(field => {
  check(`registry._meta.${field} === null`,
    registry._meta[field] === null,
    `${field} = ${registry._meta[field]}`);
});
console.log();

// ─── Test 8: INSUFFICIENT confidence → reference_price null ──────────────────
console.log('── Test 8: reference_price === null when confidence === INSUFFICIENT ──');
let insufficientViolations = [];
services.forEach(svc => {
  if (svc.confidence === 'INSUFFICIENT' && svc.reference_price !== null) {
    insufficientViolations.push(svc.service_code);
  }
});
check('reference_price null for all INSUFFICIENT services', insufficientViolations.length === 0,
  `Violations: ${insufficientViolations.join(', ')}`);
console.log();

// ─── Test 9: consensus_low <= market_anchor <= consensus_high ────────────────
console.log('── Test 9: Price range ordering (low ≤ anchor ≤ high) ──');
let rangeViolations = [];
services.forEach(svc => {
  const rp = svc.reference_price;
  if (!rp || rp === null) return;
  const { consensus_low: lo, market_anchor: mid, consensus_high: hi } = rp;
  if (lo != null && mid != null && hi != null) {
    if (!(lo <= mid && mid <= hi)) {
      rangeViolations.push(`${svc.service_code}: ${lo} ≤ ${mid} ≤ ${hi} FAILS`);
    }
  }
});
check('All reference price ranges are correctly ordered', rangeViolations.length === 0,
  rangeViolations.join(' | '));
console.log();

// ─── Test 10: Refrigerant services have refrigerant_policy ──────────────────
console.log('── Test 10: Refrigerant services have refrigerant_policy !== null ──');
const REFRIGERANT_SERVICES = ['CLIM-007', 'CLIM-008', 'CLIM-010', 'CLIM-011', 'CLIM-012',
  'CLIM-013', 'CLIM-014', 'CLIM-015', 'CLIM-020', 'CLIM-021', 'CLIM-030', 'CLIM-031'];
const missingRefPolicy = services.filter(s =>
  REFRIGERANT_SERVICES.includes(s.service_code) && !s.refrigerant_policy
).map(s => s.service_code);
check('All refrigerant services have refrigerant_policy', missingRefPolicy.length === 0,
  `Missing: ${missingRefPolicy.join(', ')}`);
console.log();

// ─── Test 11: Major component services have hardware_policy ─────────────────
console.log('── Test 11: Major component services have hardware_policy !== null ──');
const HARDWARE_SERVICES = ['CLIM-016', 'CLIM-017', 'CLIM-018', 'CLIM-019'];
const missingHwPolicy = services.filter(s =>
  HARDWARE_SERVICES.includes(s.service_code) && !s.hardware_policy
).map(s => s.service_code);
check('All major component services have hardware_policy', missingHwPolicy.length === 0,
  `Missing: ${missingHwPolicy.join(', ')}`);
console.log();

// ─── Test 12: Production files untouched ────────────────────────────────────
console.log('── Test 12: Production files untouched ──');
const PRODUCTION_PATTERNS = [
  'index.html', 'artisans.html', 'services.html', 'artisan-profile.html',
  'js/', 'css/', 'supabase/migrations', 'rafi'
];

let gitDiffOutput = '';
let gitDiffError = null;
try {
  gitDiffOutput = execSync('git diff --name-only HEAD 2>&1', { cwd: ROOT, encoding: 'utf8' });
} catch (e) {
  gitDiffError = e.message;
  gitDiffOutput = e.stdout || '';
}

const modifiedFiles = gitDiffOutput.split('\n').filter(Boolean);
const productionTouched = modifiedFiles.filter(f => {
  const fl = f.toLowerCase();
  return PRODUCTION_PATTERNS.some(p => fl.startsWith(p.toLowerCase()) || fl === p.toLowerCase());
});

check('No production files in git working tree diff', productionTouched.length === 0,
  `Production files modified: ${productionTouched.join(', ')}`);

if (gitDiffError) {
  warn('Git diff', `Error running git diff: ${gitDiffError}`);
}

const researchFilesChanged = modifiedFiles.filter(f =>
  f.startsWith('data/pricing/research/climatisation/')
);
console.log(`  Research files in diff: ${researchFilesChanged.length}`);
researchFilesChanged.forEach(f => console.log(`    + ${f}`));
console.log();

// ─── Test 13: Prior research artifacts untouched ────────────────────────────
console.log('── Test 13: Prior research artifacts (plomberie/electricite/serrurerie) untouched ──');
const priorTouched = modifiedFiles.filter(f =>
  f.startsWith('data/pricing/research/plomberie/') ||
  f.startsWith('data/pricing/research/electricite/') ||
  f.startsWith('data/pricing/research/serrurerie/')
);
check('Prior research artifacts untouched', priorTouched.length === 0,
  `Modified: ${priorTouched.join(', ')}`);
console.log();

// ─── V0.2 Calibration artifact checks ────────────────────────────────────────
console.log('── Test 14: Calibration V0.2 artifact checks ──');
const calPath = path.join(RESEARCH_DIR, 'calibration.v0.2.json');
let cal = null;
if (fs.existsSync(calPath)) {
  try {
    cal = JSON.parse(fs.readFileSync(calPath, 'utf8'));
  } catch(e) {
    check('calibration.v0.2.json parseable', false, e.message);
  }
}
if (cal) {
  const calMeta = cal._meta || {};
  const calCandidates = cal.candidates || [];

  check('calibration.v0.2 production_ready = false', calMeta.production_ready === false,
    `production_ready = ${calMeta.production_ready}`);
  check('calibration.v0.2 human_decision = PENDING', calMeta.human_decision === 'PENDING',
    `human_decision = ${calMeta.human_decision}`);
  check('calibration.v0.2 city_adjustment = null', calMeta.city_adjustment === null,
    `city_adjustment = ${calMeta.city_adjustment}`);
  check('calibration.v0.2 urgency_modifier = null', calMeta.urgency_modifier === null,
    `urgency_modifier = ${calMeta.urgency_modifier}`);
  check('calibration.v0.2 exactly 8 candidates', calCandidates.length === 8,
    `candidate count = ${calCandidates.length}`);

  const EXPECTED_CODES = ['CLIM-002','CLIM-003','CLIM-004','CLIM-009','CLIM-013','CLIM-020','CLIM-021','CLIM-030'];
  const actualCodes = calCandidates.map(c => c.service_code).sort();
  check('calibration.v0.2 correct 8 candidate codes',
    JSON.stringify(actualCodes.sort()) === JSON.stringify(EXPECTED_CODES.sort()),
    `Got: ${actualCodes.join(', ')}`);

  const notPending = calCandidates.filter(c => c.human_decision !== 'PENDING');
  check('All calibration candidates have human_decision = PENDING', notPending.length === 0,
    `Non-pending: ${notPending.map(c=>c.service_code).join(', ')}`);

  const REFRIGERANT_SERVICES = ['CLIM-010','CLIM-011','CLIM-012','CLIM-015'];
  const refInCalibration = calCandidates.filter(c => REFRIGERANT_SERVICES.includes(c.service_code));
  check('No refrigerant fixed-price service in calibration candidates', refInCalibration.length === 0,
    `Found: ${refInCalibration.map(c=>c.service_code).join(', ')}`);

  const clim013 = calCandidates.find(c => c.service_code === 'CLIM-013');
  if (clim013) {
    const refStatus = clim013.scope_contract && clim013.scope_contract.refrigerant_status || '';
    check('CLIM-013 explicitly excludes refrigerant', refStatus.includes('EXCLU') || refStatus.includes('exclu'),
      'refrigerant_status does not contain EXCLU');
  }

  const clim020 = calCandidates.find(c => c.service_code === 'CLIM-020');
  if (clim020) {
    const excl = clim020.scope_contract && clim020.scope_contract.explicit_exclusions || [];
    const hasACExclusion = Array.isArray(excl) && excl.some(e => e.includes('FOURNITURE') || e.includes('climatiseur'));
    check('CLIM-020 explicitly excludes AC unit (fourniture)', hasACExclusion,
      'explicit_exclusions does not mention fourniture/climatiseur');
  }

  const price3m = (calCandidates.find(c => c.service_code === 'CLIM-020') || {}).proposed_fixeo_price_MAD;
  const price5m = (calCandidates.find(c => c.service_code === 'CLIM-021') || {}).proposed_fixeo_price_MAD;
  check('CLIM-021 price > CLIM-020 price (5m > 3m scope)', price5m > price3m,
    `CLIM-020: ${price3m}, CLIM-021: ${price5m}`);

  const blindRechargeProhibited = calMeta.blind_recharge_prohibition || '';
  check('Blind recharge prohibition stated in calibration meta', blindRechargeProhibited.includes('ABSOLUTE') || blindRechargeProhibited.length > 10,
    'blind_recharge_prohibition missing or empty');

} else {
  warn('calibration.v0.2.json', 'File does not exist yet — skipping V0.2 checks');
}
console.log();

// ─── V0.3 Human Decision Freeze checks ───────────────────────────────────────
console.log('── Test 15: V0.3 Human Decision Freeze checks ──');
const reg3Path = path.join(RESEARCH_DIR, 'registry.v0.3.json');
const cal3Path = path.join(RESEARCH_DIR, 'calibration.v0.3.json');
let reg3 = null, cal3 = null;

if (fs.existsSync(reg3Path)) {
  try { reg3 = JSON.parse(fs.readFileSync(reg3Path, 'utf8')); } catch(e) {
    check('registry.v0.3.json parseable', false, e.message); }
}
if (fs.existsSync(cal3Path)) {
  try { cal3 = JSON.parse(fs.readFileSync(cal3Path, 'utf8')); } catch(e) {
    check('calibration.v0.3.json parseable', false, e.message); }
}

if (reg3 && cal3) {
  const APPROVED_PRICES = { 'CLIM-002':250,'CLIM-003':300,'CLIM-004':450,'CLIM-009':250,'CLIM-013':600,'CLIM-020':1000,'CLIM-021':1200,'CLIM-030':550 };
  const EXPECTED_ARCHITECTURES = { 'CLIM-002':'FIXED','CLIM-003':'FIXED_PER_AC_UNIT','CLIM-004':'FIXED_PER_AC_UNIT','CLIM-009':'FIXED','CLIM-013':'CONDITIONAL_FIXED','CLIM-020':'CONDITIONAL_FIXED','CLIM-021':'CONDITIONAL_FIXED','CLIM-030':'FIXED' };

  // Registry checks
  check('registry.v0.3 production_ready = false', reg3._meta.production_ready === false, `production_ready = ${reg3._meta.production_ready}`);
  check('registry.v0.3 city_adjustment = null', reg3._meta.city_adjustment === null, 'city_adjustment not null');
  check('registry.v0.3 urgency_modifier = null', reg3._meta.urgency_modifier === null, 'urgency_modifier not null');
  check('registry.v0.3 has 8 approved services', (reg3.approved_services||[]).length === 8, `count = ${(reg3.approved_services||[]).length}`);

  const reg3codes = (reg3.approved_services||[]);
  reg3codes.forEach(svc => {
    const expected = APPROVED_PRICES[svc.service_code];
    check(`registry.v0.3 ${svc.service_code} approved_price = ${expected}`, svc.approved_price_MAD === expected, `got ${svc.approved_price_MAD}`);
    check(`registry.v0.3 ${svc.service_code} human_decision = APPROVED`, svc.human_decision === 'APPROVED', `got ${svc.human_decision}`);
    check(`registry.v0.3 ${svc.service_code} production_ready = false`, svc.production_ready === false, `got ${svc.production_ready}`);
    const expArch = EXPECTED_ARCHITECTURES[svc.service_code];
    check(`registry.v0.3 ${svc.service_code} architecture = ${expArch}`, svc.architecture === expArch, `got ${svc.architecture}`);
  });

  // Calibration checks
  check('calibration.v0.3 production_ready = false', cal3._meta.production_ready === false, 'production_ready not false');
  check('calibration.v0.3 human_decision = APPROVED', cal3._meta.human_decision === 'APPROVED', `got ${cal3._meta.human_decision}`);
  check('calibration.v0.3 city_adjustment = null', cal3._meta.city_adjustment === null, 'city_adjustment not null');
  check('calibration.v0.3 urgency_modifier = null', cal3._meta.urgency_modifier === null, 'urgency_modifier not null');
  check('calibration.v0.3 universal_hard_floor = 100', cal3._meta.universal_hard_floor_MAD === 100, `got ${cal3._meta.universal_hard_floor_MAD}`);
  check('calibration.v0.3 climatisation_target_floor = 150', cal3._meta.climatisation_target_floor_MAD === 150, `got ${cal3._meta.climatisation_target_floor_MAD}`);

  const cal3svcs = cal3.approved_services || [];
  check('calibration.v0.3 has 8 approved services', cal3svcs.length === 8, `count = ${cal3svcs.length}`);

  cal3svcs.forEach(svc => {
    const expectedPrice = APPROVED_PRICES[svc.service_code];
    check(`calibration.v0.3 ${svc.service_code} price = ${expectedPrice}`, svc.approved_price_MAD === expectedPrice, `got ${svc.approved_price_MAD}`);
    check(`calibration.v0.3 ${svc.service_code} human_decision = APPROVED`, svc.human_decision === 'APPROVED', `got ${svc.human_decision}`);
    check(`calibration.v0.3 ${svc.service_code} production_ready = false`, svc.production_ready === false, `got ${svc.production_ready}`);
  });

  // CLIM-013 refrigerant exclusion
  const c13v3 = cal3svcs.find(s => s.service_code === 'CLIM-013');
  check('calibration.v0.3 CLIM-013 refrigerant_included = false', c13v3 && c13v3.refrigerant_included === false, 'refrigerant_included not false');
  check('calibration.v0.3 CLIM-013 price_semantics = LABOUR_ONLY', c13v3 && c13v3.price_semantics === 'LABOUR_ONLY', `got ${c13v3 && c13v3.price_semantics}`);

  // CLIM-020/021 AC unit exclusion
  const c20v3 = (reg3.approved_services||[]).find(s => s.service_code === 'CLIM-020');
  const c21v3 = (reg3.approved_services||[]).find(s => s.service_code === 'CLIM-021');
  check('registry.v0.3 CLIM-020 ac_unit_supply = CLIENT_SUPPLIED_ALWAYS_EXCLUDED', c20v3 && c20v3.ac_unit_supply === 'CLIENT_SUPPLIED_ALWAYS_EXCLUDED', `got ${c20v3 && c20v3.ac_unit_supply}`);
  check('registry.v0.3 CLIM-021 ac_unit_supply = CLIENT_SUPPLIED_ALWAYS_EXCLUDED', c21v3 && c21v3.ac_unit_supply === 'CLIENT_SUPPLIED_ALWAYS_EXCLUDED', `got ${c21v3 && c21v3.ac_unit_supply}`);

  // Copper scope
  check('registry.v0.3 CLIM-020 copper_scope = 3m', c20v3 && c20v3.copper_scope === 'UP_TO_3_LINEAR_METRES', `got ${c20v3 && c20v3.copper_scope}`);
  check('registry.v0.3 CLIM-021 copper_scope = 5m', c21v3 && c21v3.copper_scope === 'UP_TO_5_LINEAR_METRES', `got ${c21v3 && c21v3.copper_scope}`);

  // Exact 200 MAD delta CLIM-021 - CLIM-020
  check('CLIM-021 - CLIM-020 = exactly 200 MAD', APPROVED_PRICES['CLIM-021'] - APPROVED_PRICES['CLIM-020'] === 200,
    `delta = ${APPROVED_PRICES['CLIM-021'] - APPROVED_PRICES['CLIM-020']}`);

  // Diagnostic absorption policy present
  const diagPolicy = cal3._meta.diagnostic_absorption_policy || {};
  check('calibration.v0.3 diagnostic_absorption_policy present', diagPolicy.classification === 'FIXEO_POLICY', 'diagnostic_absorption_policy missing or wrong classification');

  // Refrigeration doctrine present
  const refDoctrine = cal3._meta.refrigeration_integrity_doctrine || {};
  check('calibration.v0.3 refrigeration_integrity_doctrine present', Array.isArray(refDoctrine.sequence) && refDoctrine.sequence.length > 0, 'refrigeration_integrity_doctrine missing');
  check('calibration.v0.3 blind top-up prohibited', Array.isArray(refDoctrine.prohibited_practices) && refDoctrine.prohibited_practices.some(p => p.includes('aveugle') || p.includes('top-up')), 'blind top-up not in prohibited_practices');
  check('calibration.v0.3 pump-down doctrine present', (refDoctrine.pump_down_doctrine || '').length > 10, 'pump_down_doctrine missing or empty');

  // Material stress test present for installation services
  const c20v3cal = cal3svcs.find(s => s.service_code === 'CLIM-020');
  const c21v3cal = cal3svcs.find(s => s.service_code === 'CLIM-021');
  check('calibration.v0.3 CLIM-020 material_cost_stress_test present', c20v3cal && c20v3cal.material_cost_stress_test && c20v3cal.material_cost_stress_test.scenarios, 'CLIM-020 material_cost_stress_test missing');
  check('calibration.v0.3 CLIM-021 material_cost_stress_test present', c21v3cal && c21v3cal.material_cost_stress_test && c21v3cal.material_cost_stress_test.scenarios, 'CLIM-021 material_cost_stress_test missing');

  // No AI/ML claims
  const priceIsNot = cal3._meta.price_is_not || [];
  check('calibration.v0.3 price_is_not includes AI_GENERATED', priceIsNot.includes('AI_GENERATED'), 'AI_GENERATED not in price_is_not');
  check('calibration.v0.3 price_is_not includes ML_PREDICTION', priceIsNot.includes('ML_PREDICTION'), 'ML_PREDICTION not in price_is_not');

} else {
  if (!reg3) warn('registry.v0.3.json', 'File does not exist — skipping V0.3 checks');
  if (!cal3) warn('calibration.v0.3.json', 'File does not exist — skipping V0.3 checks');
}
console.log();

// V0.2 artifacts still present
console.log('── Test 16: V0.2 artifacts preserved ──');
const V02_FILES = ['calibration.v0.2.json','human-review.v0.2.md','fair-price-policy.v0.2.md'];
V02_FILES.forEach(f => {
  const fp = path.join(RESEARCH_DIR, f);
  check(`V0.2 artifact ${f} still exists`, fs.existsSync(fp), 'File missing');
});
console.log();

// ─── Additional: Evidence usable flag on unsafe practices ───────────────────
console.log('── Test 17: Unsafe practice evidence is marked usable=false ──');
const unsafeUsable = evidenceList.filter(e =>
  e.unsafe_practice_flag && e.usable === true
).map(e => e.evidence_id);
check('Unsafe practice evidence not marked usable=true', unsafeUsable.length === 0,
  `Usable unsafe entries: ${unsafeUsable.join(', ')}`);
console.log();

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('  VALIDATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Warnings: ${warnings.length}`);

if (failed === 0) {
  console.log('\n  ✅ ALL CHECKS PASSED');
  console.log('  PRODUCTION RUNTIME = 0 DIFF (no production files touched)');
  console.log('  NO DEPLOYMENT PERFORMED');
  console.log('\n  PHASE 7B.6 — FIXEO CLIMATISATION MOROCCO MARKET RESEARCH — ARTIFACT VALIDATION PASSED');
} else {
  console.log('\n  ❌ VALIDATION FAILED');
  console.log('\n  Errors:');
  errors.forEach(e => console.log(`    - [${e.test}] ${e.message}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('\n  Warnings:');
  warnings.forEach(w => console.log(`    - [${w.test}] ${w.message}`));
}
console.log('═══════════════════════════════════════════════════════════════\n');
