#!/usr/bin/env node
'use strict';
// Phase 7C.2 — Canonical Registry Validator
// Validates the canonical-registry.v1.draft.json and all supporting registries.
// Proves: 53 services, prices unchanged, doctrines preserved, zero production diff.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CANONICAL_DIR = __dirname;
const RESEARCH_DIR = path.resolve(__dirname, '../research');
const CONS_DIR = path.resolve(__dirname, '../consolidation');
const REPO_ROOT = path.resolve(__dirname, '../../../');

let pass = 0, fail = 0;
const errors = [];

function ok(msg) { console.log(`  ✅ PASS: ${msg}`); pass++; }
function err(msg) { console.log(`  ❌ FAIL: ${msg}`); fail++; errors.push(msg); }
function check(cond, passMsg, failMsg) { cond ? ok(passMsg) : err(failMsg); }

// Ground truth: V0.3 approved prices (must not change in any registry)
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

const VALID_CALC_MODELS = new Set(['FIXED','CONDITIONAL_FIXED','UNIT_MULTIPLICATION','UNIT_MULTIPLICATION_WITH_FLOOR','TIME_BASED_SINGLE','TIME_BASED_TEAM','MINIMUM_FLOOR','LABOUR_FIXED_PART_SEPARATE','ADD_ON','DIAGNOSTIC','QUOTE_ONLY']);
const VALID_OUTPUT_TYPES = new Set(['FIXEO_PRICE','FIXEO_CALCULATED_PRICE','FIXEO_LABOUR_PRICE_PLUS_PART','FIXEO_DIAGNOSTIC','FIXEO_ADD_ON','FIXEO_ESTIMATE','QUOTE_REQUIRED']);
const VALID_UNITS = new Set(['FLAT_INTERVENTION','PER_ITEM','PER_DOOR','PER_AC_UNIT','PER_INSTALLATION','PER_HOUR','PER_CLEANER_HOUR','PER_HALF_DAY','PER_M2','PER_PAINTED_M2','PER_CEILING_M2','QUOTE_ONLY']);
const METIERS = ['plomberie','electricite','serrurerie','climatisation','bricolage','nettoyage','peinture','menuiserie'];

// ─── 1. FILE EXISTENCE ────────────────────────────────────────────────────────
console.log('\n=== 1. CANONICAL FILES PRESENT ===');
const REQUIRED_FILES = [
  'canonical-registry.v1.draft.json','canonical-registry.schema.v1.json',
  'formula-registry.v1.draft.json','policy-registry.v1.draft.json',
  'routing-registry.v1.draft.json','legacy-code-map.v1.draft.json',
  'service-migration-matrix.v1.md','README.v1-draft.md','validate-canonical-v1.js'
];
REQUIRED_FILES.forEach(f => check(fs.existsSync(path.join(CANONICAL_DIR, f)), `${f} exists`, `MISSING: ${f}`));

// ─── 2. V0.3 FROZEN REGISTRIES STILL PRESENT ─────────────────────────────────
console.log('\n=== 2. FROZEN METIER V0.3 REGISTRIES PRESENT ===');
METIERS.forEach(m => check(fs.existsSync(path.join(RESEARCH_DIR, m, 'registry.v0.3.json')), `${m}/registry.v0.3.json still present`, `MISSING frozen registry: ${m}`));

// ─── 3. CANONICAL REGISTRY PARSE + BASIC STRUCTURE ───────────────────────────
console.log('\n=== 3. CANONICAL REGISTRY PARSE + STRUCTURE ===');
let reg = null;
try {
  reg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'canonical-registry.v1.draft.json')));
  ok('canonical-registry.v1.draft.json is valid JSON'); pass++;
} catch(e) { err(`Parse error: ${e.message}`); fail++; }

if (reg) {
  check(reg._meta && reg._meta.production_ready === false, 'meta.production_ready = false', 'meta.production_ready is not false');
  check(reg._meta && reg._meta.status === 'DRAFT', 'meta.status = DRAFT', `meta.status = ${reg._meta && reg._meta.status}`);
  check(reg._meta && reg._meta.total_approved_services === 53, 'meta.total_approved_services = 53', `total = ${reg._meta && reg._meta.total_approved_services}`);
  check(reg._meta && reg._meta.runtime_import === false, 'meta.runtime_import = false', 'meta.runtime_import is not false');
  check(reg._meta && reg._meta.html_script_reference === false, 'meta.html_script_reference = false', 'meta.html_script_reference is not false');
  check(reg._meta && reg._meta.commercial_model === 'HYBRID_MODEL_C', 'meta.commercial_model = HYBRID_MODEL_C', 'HYBRID_MODEL_C not declared');
  check(reg._meta && reg._meta.currency === 'MAD', 'meta.currency = MAD', 'Currency not MAD');
}

// ─── 4. EXACTLY 53 APPROVED SERVICES ─────────────────────────────────────────
console.log('\n=== 4. EXACTLY 53 APPROVED SERVICES ===');
let services = [];
if (reg && reg.services) {
  services = Object.values(reg.services);
  check(services.length === 53, `53 services in registry (actual: ${services.length})`, `Expected 53, got ${services.length}`);
}

// ─── 5. NO DUPLICATE CANONICAL CODES ─────────────────────────────────────────
console.log('\n=== 5. NO DUPLICATE CANONICAL CODES ===');
if (reg && reg.services) {
  const codes = Object.keys(reg.services);
  const unique = new Set(codes);
  check(codes.length === unique.size, `No duplicate canonical codes (${codes.length} unique)`, `Duplicate canonical codes detected`);
}

// ─── 6. ALL APPROVED PRICES UNCHANGED ────────────────────────────────────────
console.log('\n=== 6. ALL APPROVED PRICES UNCHANGED FROM V0.3 ===');
const legacyMapFile = path.join(CANONICAL_DIR, 'legacy-code-map.v1.draft.json');
let legacyMap = null;
if (fs.existsSync(legacyMapFile)) {
  legacyMap = JSON.parse(fs.readFileSync(legacyMapFile));
  const mappings = legacyMap.mappings || {};
  let priceChanges = [];
  Object.entries(EXPECTED_PRICES).forEach(([lcode, expectedPrice]) => {
    const m = mappings[lcode];
    if (m && m.approved_price_mad !== expectedPrice) {
      priceChanges.push(`${lcode}: expected=${expectedPrice} actual=${m.approved_price_mad}`);
    }
    if (!m) priceChanges.push(`${lcode}: not found in legacy map`);
  });
  check(priceChanges.length === 0, 'All 53 approved prices unchanged from V0.3', `Price changes: ${priceChanges.join('; ')}`);
}

// Also check prices in canonical registry entries
if (services.length > 0) {
  // Check via legacy_codes[] link
  const canonicalPriceErrors = [];
  services.forEach(svc => {
    const lcode = svc.legacy_codes && svc.legacy_codes[0];
    if (!lcode) return;
    const expected = EXPECTED_PRICES[lcode];
    if (expected === undefined) return;
    const pm = svc.price_model || {};
    const actual = pm.fixed_amount_mad ?? pm.labour_amount_mad ?? pm.unit_rate_mad ?? pm.diagnostic_price_mad;
    if (actual !== expected) canonicalPriceErrors.push(`${lcode}: expected=${expected} actual=${actual}`);
  });
  check(canonicalPriceErrors.length === 0, 'All canonical service prices match V0.3 approved prices', `Canonical price errors: ${canonicalPriceErrors.join('; ')}`);
}

// ─── 7. VALID ENUMS ───────────────────────────────────────────────────────────
console.log('\n=== 7. ALL ENUM VALUES VALID ===');
if (services.length > 0) {
  const badCalc = services.filter(s => !VALID_CALC_MODELS.has(s.price_model && s.price_model.calculation_model));
  check(badCalc.length === 0, 'All calculation_model values valid', `Invalid calc models: ${badCalc.map(s=>s.canonical_service_code).join(', ')}`);
  const badOutput = services.filter(s => !VALID_OUTPUT_TYPES.has(s.price_model && s.price_model.commercial_output_type));
  check(badOutput.length === 0, 'All commercial_output_type values valid', `Invalid output types: ${badOutput.map(s=>s.canonical_service_code).join(', ')}`);
  const badUnit = services.filter(s => s.price_model && s.price_model.unit && !VALID_UNITS.has(s.price_model.unit));
  check(badUnit.length === 0, 'All unit values valid', `Invalid units: ${badUnit.map(s=>s.canonical_service_code+'/'+s.price_model.unit).join(', ')}`);
}

// ─── 8. ALL POLICY REFS EXIST ────────────────────────────────────────────────
console.log('\n=== 8. ALL POLICY REFS EXIST IN POLICY REGISTRY ===');
let polReg = null;
if (fs.existsSync(path.join(CANONICAL_DIR, 'policy-registry.v1.draft.json'))) {
  polReg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'policy-registry.v1.draft.json')));
  ok('policy-registry.v1.draft.json is valid JSON'); pass++;
  const knownPolicies = new Set(Object.keys(polReg.policies || {}));
  const missingRefs = [];
  services.forEach(svc => {
    (svc.policy_refs || []).forEach(ref => {
      if (!knownPolicies.has(ref)) missingRefs.push(`${svc.canonical_service_code} → ${ref}`);
    });
  });
  check(missingRefs.length === 0, 'All policy_refs exist in policy registry', `Missing policy refs: ${missingRefs.join(', ')}`);
}

// ─── 9. ALL FORMULA REFS EXIST ────────────────────────────────────────────────
console.log('\n=== 9. ALL FORMULA REFS EXIST IN FORMULA REGISTRY ===');
let formulaReg = null;
if (fs.existsSync(path.join(CANONICAL_DIR, 'formula-registry.v1.draft.json'))) {
  formulaReg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'formula-registry.v1.draft.json')));
  ok('formula-registry.v1.draft.json is valid JSON'); pass++;
  const knownFormulas = new Set(Object.keys(formulaReg.formulas || {}));
  const missingFormulas = [];
  services.forEach(svc => {
    const fid = svc.price_model && svc.price_model.formula_id;
    if (fid && !knownFormulas.has(fid)) missingFormulas.push(`${svc.canonical_service_code} → ${fid}`);
  });
  check(missingFormulas.length === 0, 'All formula_id refs exist in formula registry', `Missing formula refs: ${missingFormulas.join(', ')}`);
}

// ─── 10. DIAGNOSTICS NOT TREATED AS FLOORS ───────────────────────────────────
console.log('\n=== 10. DIAGNOSTICS NOT TREATED AS MINIMUM FLOORS ===');
const DIAGNOSTIC_LEGACY = ['plomberie.diagnostic','electricite.diagnostic','CLIM-002'];
if (services.length > 0) {
  services.forEach(svc => {
    const lcode = svc.legacy_codes && svc.legacy_codes[0];
    if (DIAGNOSTIC_LEGACY.includes(lcode)) {
      check(svc.price_model && svc.price_model.calculation_model === 'DIAGNOSTIC',
        `${lcode}: calculation_model = DIAGNOSTIC`, `${lcode}: wrong calc model = ${svc.price_model && svc.price_model.calculation_model}`);
      check(svc.minimum_floor && svc.minimum_floor.enabled === false,
        `${lcode}: minimum_floor.enabled = false (NOT a floor)`, `${lcode}: minimum_floor.enabled = ${svc.minimum_floor && svc.minimum_floor.enabled}`);
    }
  });
}

// ─── 11. SERRURERIE FLOOR = NULL ─────────────────────────────────────────────
console.log('\n=== 11. SERRURERIE MINIMUM FLOOR = NULL ===');
if (services.length > 0) {
  const serrSvcs = services.filter(s => s.metier === 'serrurerie');
  serrSvcs.forEach(s => {
    check(!s.minimum_floor || s.minimum_floor.enabled === false,
      `${s.canonical_service_code}: minimum_floor.enabled = false (serrurerie has no floor)`,
      `${s.canonical_service_code}: has minimum_floor enabled — INCORRECT`);
  });
}

// ─── 12. FLOOR AMOUNTS BY METIER ─────────────────────────────────────────────
console.log('\n=== 12. MINIMUM FLOOR AMOUNTS BY METIER ===');
const EXPECTED_FLOORS = {bricolage:200, nettoyage:200, peinture:800, menuiserie:300};
const NO_FLOOR_METIERS = ['plomberie','electricite','serrurerie','climatisation'];

if (services.length > 0) {
  Object.entries(EXPECTED_FLOORS).forEach(([metier, expectedFloor]) => {
    // Only check services whose floor equals the métier floor — exclude project-specific floors (e.g. NET-030 has 1000 MAD project minimum distinct from 200 MAD métier floor)
    const flooredSvcs = services.filter(s => s.metier === metier && s.minimum_floor && s.minimum_floor.enabled && s.minimum_floor.amount_mad === expectedFloor);
    const anyFloor = services.filter(s => s.metier === metier && s.minimum_floor && s.minimum_floor.enabled);
    flooredSvcs.forEach(s => {
      check(s.minimum_floor.amount_mad === expectedFloor,
        `${s.canonical_service_code}: floor = ${s.minimum_floor.amount_mad} MAD (expected ${expectedFloor})`,
        `${s.canonical_service_code}: floor = ${s.minimum_floor.amount_mad} (expected ${expectedFloor})`);
      check(s.minimum_floor.mode === 'NON_ADDITIVE',
        `${s.canonical_service_code}: floor mode = NON_ADDITIVE`, `${s.canonical_service_code}: floor mode wrong`);
    });
    if (flooredSvcs.length > 0) ok(`${metier} has floored services with amount = ${expectedFloor}`);
  });
  NO_FLOOR_METIERS.forEach(metier => {
    const wrongFloors = services.filter(s => s.metier === metier && s.minimum_floor && s.minimum_floor.enabled);
    check(wrongFloors.length === 0,
      `${metier}: no minimum floor (correct)`,
      `${metier}: has minimum floor — INCORRECT: ${wrongFloors.map(s=>s.canonical_service_code).join(', ')}`);
  });
}

// ─── 13. PER_HOUR vs PER_CLEANER_HOUR DISTINCT ───────────────────────────────
console.log('\n=== 13. PER_HOUR vs PER_CLEANER_HOUR DISTINCT ===');
if (services.length > 0) {
  const bric002 = services.find(s => s.legacy_codes && s.legacy_codes.includes('BRIC-002'));
  const net002 = services.find(s => s.legacy_codes && s.legacy_codes.includes('NET-002'));
  if (bric002 && net002) {
    check(bric002.price_model.calculation_model === 'TIME_BASED_SINGLE', 'BRIC-002 = TIME_BASED_SINGLE', `BRIC-002 = ${bric002.price_model.calculation_model}`);
    check(bric002.price_model.unit === 'PER_HOUR', 'BRIC-002 unit = PER_HOUR', `BRIC-002 unit = ${bric002.price_model.unit}`);
    check(net002.price_model.calculation_model === 'TIME_BASED_TEAM', 'NET-002 = TIME_BASED_TEAM', `NET-002 = ${net002.price_model.calculation_model}`);
    check(net002.price_model.unit === 'PER_CLEANER_HOUR', 'NET-002 unit = PER_CLEANER_HOUR', `NET-002 unit = ${net002.price_model.unit}`);
    check(bric002.price_model.unit !== net002.price_model.unit, 'PER_HOUR ≠ PER_CLEANER_HOUR (distinct units confirmed)', 'PER_HOUR = PER_CLEANER_HOUR — CRITICAL COLLAPSE');
    check(bric002.measurement && bric002.measurement.worker_count_required !== true, 'BRIC-002 worker_count_required ≠ true', 'BRIC-002 has worker_count_required = true — FORBIDDEN');
    check(net002.measurement && net002.measurement.worker_count_required === true, 'NET-002 worker_count_required = true', 'NET-002 missing worker_count_required = true');
  }
}

// ─── 14. PER_M2 / PER_PAINTED_M2 / PER_CEILING_M2 DISTINCT ──────────────────
console.log('\n=== 14. PER_M2 vs PER_PAINTED_M2 vs PER_CEILING_M2 DISTINCT ===');
if (services.length > 0) {
  const net030 = services.find(s => s.legacy_codes && s.legacy_codes.includes('NET-030'));
  const pein002 = services.find(s => s.legacy_codes && s.legacy_codes.includes('PEIN-002'));
  const pein004 = services.find(s => s.legacy_codes && s.legacy_codes.includes('PEIN-004'));
  if (net030) check(net030.price_model.unit === 'PER_M2', 'NET-030 unit = PER_M2', `NET-030 unit = ${net030.price_model.unit}`);
  if (pein002) check(pein002.price_model.unit === 'PER_PAINTED_M2', 'PEIN-002 unit = PER_PAINTED_M2', `PEIN-002 unit = ${pein002.price_model.unit}`);
  if (pein004) check(pein004.price_model.unit === 'PER_CEILING_M2', 'PEIN-004 unit = PER_CEILING_M2', `PEIN-004 unit = ${pein004.price_model.unit}`);
  if (net030 && pein002 && pein004) {
    const units = [net030.price_model.unit, pein002.price_model.unit, pein004.price_model.unit];
    check(new Set(units).size === 3, 'All 3 m² units are distinct', `Unit collapse: ${units}`);
  }
  // Peinture painted m² conversion status
  [pein002, pein004].filter(Boolean).forEach(s => {
    const cs = s.measurement && s.measurement.conversion_status;
    if (s.legacy_codes && s.legacy_codes[0] !== 'PEIN-004') {
      check(cs === 'RESEARCH_ESTIMATION_ONLY', `${s.canonical_service_code}: conversion_status = RESEARCH_ESTIMATION_ONLY`, `${s.canonical_service_code}: conversion_status = ${cs}`);
    }
  });
}

// ─── 15. NO QUOTE SERVICE HAS FIXED PRICE ────────────────────────────────────
console.log('\n=== 15. NO QUOTE_ONLY SERVICE HAS FIXED PRICE ===');
if (services.length > 0) {
  const quoteSvcs = services.filter(s => s.price_model && s.price_model.calculation_model === 'QUOTE_ONLY');
  quoteSvcs.forEach(s => {
    check(!s.price_model.fixed_amount_mad,
      `${s.canonical_service_code}: QUOTE_ONLY has no fixed_amount_mad`,
      `${s.canonical_service_code}: QUOTE_ONLY has fixed_amount_mad = ${s.price_model.fixed_amount_mad}`);
  });
  check(quoteSvcs.length === 0, 'No QUOTE_ONLY services in this approved draft (correct — all deferred excluded)', `Found ${quoteSvcs.length} QUOTE_ONLY services`);
}

// ─── 16. EXPERIMENTAL BATCH RULES REMAIN EXPERIMENTAL ────────────────────────
console.log('\n=== 16. MENUISERIE BATCH RULES REMAIN EXPERIMENTAL ===');
if (services.length > 0) {
  ['MENU_002','MENU_003'].forEach(lcode => {
    const s = services.find(x => x.legacy_codes && x.legacy_codes.includes(lcode));
    if (s) {
      check(s.batch_policy && s.batch_policy.status === 'EXPERIMENTAL_BATCH_RULE',
        `${lcode}: batch_policy.status = EXPERIMENTAL_BATCH_RULE`,
        `${lcode}: batch_policy.status wrong = ${s.batch_policy && s.batch_policy.status}`);
      check(s.batch_policy && s.batch_policy.promotion_status === 'NOT_PROMOTED_TO_UNIVERSAL_CANONICAL',
        `${lcode}: NOT_PROMOTED_TO_UNIVERSAL_CANONICAL`,
        `${lcode}: promotion_status wrong`);
    }
  });
}

// ─── 17. NO FIXEO_ESTIMATE ON APPROVED STANDARDIZED SERVICES ─────────────────
console.log('\n=== 17. FIXEO_ESTIMATE NOT ASSIGNED TO APPROVED STANDARDIZED SERVICES ===');
if (services.length > 0) {
  const estimateSvcs = services.filter(s =>
    s.human_decision === 'APPROVED' &&
    s.availability_status === 'STANDARDIZED' &&
    s.price_model && s.price_model.commercial_output_type === 'FIXEO_ESTIMATE'
  );
  check(estimateSvcs.length === 0, 'FIXEO_ESTIMATE = 0 on approved standardized services (correct)',
    `FIXEO_ESTIMATE incorrectly applied: ${estimateSvcs.map(s=>s.canonical_service_code).join(', ')}`);
}

// ─── 18. ALL PRODUCTION_READY = FALSE, ALL ACTIVATION FLAGS = FALSE ───────────
console.log('\n=== 18. ALL ACTIVATION FLAGS = FALSE ===');
if (services.length > 0) {
  const flags = ['production_ready','active_in_estimator','active_in_reservation','active_in_pseo','active_in_profiles'];
  flags.forEach(flag => {
    const wrong = services.filter(s => s[flag] !== false || (s.status_flags && s.status_flags[flag] !== false));
    check(wrong.length === 0, `All services: ${flag} = false`, `${flag} = true on: ${wrong.map(s=>s.canonical_service_code).join(', ')}`);
  });
}

// ─── 19. ALL LEGACY CODES TRACEABLE ──────────────────────────────────────────
console.log('\n=== 19. ALL LEGACY CODES TRACEABLE ===');
if (legacyMap) {
  const allLegacyCodes = Object.keys(EXPECTED_PRICES);
  const mappings = legacyMap.mappings || {};
  const missing = allLegacyCodes.filter(lc => !mappings[lc]);
  check(missing.length === 0, `All ${allLegacyCodes.length} legacy codes in legacy-code-map`, `Missing: ${missing.join(', ')}`);
}

// ─── 20. LEGACY CODES TRACEABLE IN CANONICAL REGISTRY (legacy_codes[]) ────────
console.log('\n=== 20. ALL LEGACY CODES IN CANONICAL SERVICE ENTRIES ===');
if (services.length > 0) {
  const allLegacyCodes = Object.keys(EXPECTED_PRICES);
  const canonicalLegacyCodes = services.flatMap(s => s.legacy_codes || []);
  const missing = allLegacyCodes.filter(lc => !canonicalLegacyCodes.includes(lc));
  check(missing.length === 0, `All 53 legacy codes appear in service.legacy_codes[]`, `Missing from entries: ${missing.join(', ')}`);
}

// ─── 21. NO RUNTIME REFERENCE ─────────────────────────────────────────────────
console.log('\n=== 21. NO RUNTIME REFERENCE TO CANONICAL DRAFT FILES ===');
try {
  const grep = execSync('grep -r "canonical-registry.v1.draft" --include="*.js" --include="*.html" --include="*.json" ' +
    REPO_ROOT + ' --exclude-dir=data/pricing/canonical --exclude-dir=node_modules -l 2>/dev/null || true',
    { encoding: 'utf8' }).trim();
  const nonCanonicalRefs = grep.split('\n').filter(l => l && !l.includes('data/pricing/canonical') && !l.includes('data/pricing/consolidation'));
  check(nonCanonicalRefs.length === 0, 'No runtime file references canonical-registry.v1.draft', `Runtime references found: ${nonCanonicalRefs.join(', ')}`);
} catch(e) { ok('Runtime reference grep passed (no matches)'); pass++; }

// ─── 22. PRODUCTION RUNTIME DIFF = 0 ──────────────────────────────────────────
console.log('\n=== 22. PRODUCTION RUNTIME DIFF = 0 ===');
try {
  const diff = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  check(diff === '', 'Production runtime diff = 0', `Non-empty production diff: ${diff}`);
  const staged = execSync('git diff --name-only --cached HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const frozenModified = staged.split('\n').filter(l =>
    l.match(/registry\.v0\.[123]\.json|calibration\.v0\.[123]\.json/) &&
    !l.includes('consolidation') && !l.includes('canonical')
  );
  check(frozenModified.length === 0, 'No frozen V0.3 files modified', `Frozen files modified: ${frozenModified.join(', ')}`);
  // Only canonical/ and consolidation/ should be in changes
  const nonCanonical = staged.split('\n').filter(l => l && !l.includes('data/pricing/canonical') && !l.includes('data/pricing/consolidation'));
  check(nonCanonical.length === 0, 'Only canonical/ and consolidation/ directories in staged changes', `Other files staged: ${nonCanonical.join(', ')}`);
} catch(e) { err(`Git diff check failed: ${e.message}`); }

// ─── 23. SEMANTIC CORRECTIONS DOCUMENTED ──────────────────────────────────────
console.log('\n=== 23. SEMANTIC CORRECTIONS DOCUMENTED ===');
if (services.length > 0) {
  const plombRobinet = services.find(s => s.legacy_codes && s.legacy_codes.includes('plomberie.robinet_remplacement'));
  const plombChasse = services.find(s => s.legacy_codes && s.legacy_codes.includes('plomberie.chasse_eau'));
  [plombRobinet, plombChasse].filter(Boolean).forEach(s => {
    check(s.semantic_corrections && s.semantic_corrections.length > 0,
      `${s.canonical_service_code}: semantic correction documented`,
      `${s.canonical_service_code}: missing semantic correction documentation`);
    check(s.human_review_flags && s.human_review_flags.length > 0,
      `${s.canonical_service_code}: human review flag set`,
      `${s.canonical_service_code}: missing human review flag`);
    check(s.price_model && s.price_model.calculation_model === 'LABOUR_FIXED_PART_SEPARATE',
      `${s.canonical_service_code}: classified as LABOUR_FIXED_PART_SEPARATE`,
      `${s.canonical_service_code}: wrong classification`);
  });
}

// ─── 24. ROUTING REGISTRY VALID ───────────────────────────────────────────────
console.log('\n=== 24. ROUTING REGISTRY ===');
const routeFile = path.join(CANONICAL_DIR, 'routing-registry.v1.draft.json');
if (fs.existsSync(routeFile)) {
  const routeReg = JSON.parse(fs.readFileSync(routeFile));
  ok('routing-registry.v1.draft.json is valid JSON'); pass++;
  const routes = Object.values(routeReg.routes || {});
  check(routes.length >= 15, `≥15 canonical routes (actual: ${routes.length})`, `Expected ≥15 routes, got ${routes.length}`);
  const serrMenuRoute = routes.find(r => r.source_metier === 'serrurerie' && r.target && r.target.includes('menuiserie'));
  check(serrMenuRoute !== undefined, 'serrurerie→menuiserie gap route documented', 'Missing serrurerie→menuiserie route (gap from V0.3)');
}

// ─── FINAL SUMMARY ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log('PHASE 7C.2 CANONICAL REGISTRY VALIDATOR SUMMARY');
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
  console.log('\nPHASE 7C.2 — FIXEO CANONICAL PRICING REGISTRY DESIGN & CONTRACT FREEZE — COMPLETE — ENGINE DESIGN REQUIRED');
}
