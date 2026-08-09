#!/usr/bin/env node
/**
 * FIXEO Phase 7B.10 — Menuiserie Research Validator
 * Validates all V0.1 research artifacts.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname);
const REQUIRED_FILES = [
  'registry.v0.1.json',
  'sources.v0.1.json',
  'evidence.v0.1.json',
  'exclusions.v0.1.json',
  'legacy-comparison.md',
  'README.md',
  'validate.js'
];

let pass = 0;
let fail = 0;
const errors = [];

function ok(msg) {
  console.log(`  ✅ PASS: ${msg}`);
  pass++;
}

function err(msg) {
  console.log(`  ❌ FAIL: ${msg}`);
  errors.push(msg);
  fail++;
}

function check(condition, passMsg, failMsg) {
  if (condition) ok(passMsg);
  else err(failMsg);
}

// ─── 1. FILE EXISTENCE ──────────────────────────────────────────────────────
console.log('\n=== 1. REQUIRED FILES ===');
REQUIRED_FILES.forEach(f => {
  const exists = fs.existsSync(path.join(BASE, f));
  check(exists, `File exists: ${f}`, `Missing file: ${f}`);
});

// ─── 2. JSON PARSE ──────────────────────────────────────────────────────────
console.log('\n=== 2. JSON VALIDITY ===');
const jsonFiles = ['registry.v0.1.json', 'sources.v0.1.json', 'evidence.v0.1.json', 'exclusions.v0.1.json'];
const parsed = {};

jsonFiles.forEach(f => {
  try {
    parsed[f] = JSON.parse(fs.readFileSync(path.join(BASE, f), 'utf8'));
    ok(`Valid JSON: ${f}`);
  } catch (e) {
    err(`JSON parse error in ${f}: ${e.message}`);
    parsed[f] = null;
  }
});

// ─── 3. SERVICE CODES UNIQUE ────────────────────────────────────────────────
console.log('\n=== 3. SERVICE CODE UNIQUENESS ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const codes = services.map(s => s.service_code);
  const unique = new Set(codes);
  check(codes.length === unique.size,
    `All ${codes.length} service codes are unique`,
    `Duplicate service codes found: ${codes.filter((c,i) => codes.indexOf(c) !== i).join(', ')}`
  );
}

// ─── 4. SOURCE IDs RESOLVE ──────────────────────────────────────────────────
console.log('\n=== 4. SOURCE IDs RESOLVE ===');
if (parsed['sources.v0.1.json'] && parsed['registry.v0.1.json']) {
  const srcIds = new Set((parsed['sources.v0.1.json'].sources || []).map(s => s.source_id));
  const services = parsed['registry.v0.1.json'].services || [];
  let allResolve = true;
  services.forEach(svc => {
    (svc.source_ids || []).forEach(sid => {
      if (!srcIds.has(sid)) {
        err(`Service ${svc.service_code} references unknown source: ${sid}`);
        allResolve = false;
      }
    });
  });
  if (allResolve) ok('All registry source_ids resolve to sources.v0.1.json');
}

// ─── 5. EVIDENCE SOURCE IDs RESOLVE ────────────────────────────────────────
console.log('\n=== 5. EVIDENCE SOURCE IDs RESOLVE ===');
if (parsed['sources.v0.1.json'] && parsed['evidence.v0.1.json']) {
  const srcIds = new Set((parsed['sources.v0.1.json'].sources || []).map(s => s.source_id));
  const evidence = parsed['evidence.v0.1.json'].evidence || [];
  let allResolve = true;
  evidence.forEach(ev => {
    if (!srcIds.has(ev.source_id)) {
      err(`Evidence ${ev.evidence_id} references unknown source: ${ev.source_id}`);
      allResolve = false;
    }
  });
  if (allResolve) ok('All evidence source_ids resolve to sources.v0.1.json');
}

// ─── 6. NO APPROVED PRICES ──────────────────────────────────────────────────
console.log('\n=== 6. NO APPROVED PRICES ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const approved = services.filter(s => s.human_decision === 'APPROVED');
  check(approved.length === 0,
    'No services have human_decision = APPROVED',
    `Found APPROVED services: ${approved.map(s => s.service_code).join(', ')}`
  );
}

// ─── 7. ALL CANDIDATES HAVE PENDING DECISION ────────────────────────────────
console.log('\n=== 7. HUMAN DECISION = PENDING FOR CANDIDATES ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const nonPending = services.filter(s =>
    s.human_decision !== 'PENDING' &&
    s.human_decision !== 'DEFERRED' &&
    s.human_decision !== 'QUOTE_REQUIRED' &&
    s.human_decision !== 'INSUFFICIENT_EVIDENCE'
  );
  check(nonPending.length === 0,
    'All services have valid human_decision status (PENDING/DEFERRED/QUOTE_REQUIRED/INSUFFICIENT_EVIDENCE)',
    `Invalid human_decision values: ${nonPending.map(s => `${s.service_code}:${s.human_decision}`).join(', ')}`
  );
}

// ─── 8. PRODUCTION_READY = false ────────────────────────────────────────────
console.log('\n=== 8. PRODUCTION_READY = false ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const ready = services.filter(s => s.production_ready !== false);
  check(ready.length === 0,
    'All services have production_ready = false',
    `Services with production_ready !== false: ${ready.map(s => s.service_code).join(', ')}`
  );
}

// ─── 9. CITY_ADJUSTMENT = null ──────────────────────────────────────────────
console.log('\n=== 9. CITY_ADJUSTMENT = null ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const withCity = services.filter(s => s.city_adjustment !== null);
  check(withCity.length === 0,
    'All services have city_adjustment = null',
    `Services with non-null city_adjustment: ${withCity.map(s => s.service_code).join(', ')}`
  );
}

// ─── 10. URGENCY/TIME MODIFIERS = null ──────────────────────────────────────
console.log('\n=== 10. URGENCY/TIME MODIFIERS = null ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const modifiers = ['urgency_modifier', 'night_modifier', 'weekend_modifier', 'holiday_modifier', 'express_modifier'];
  let allNull = true;
  services.forEach(svc => {
    modifiers.forEach(mod => {
      if (svc[mod] !== null) {
        err(`Service ${svc.service_code} has non-null ${mod}: ${svc[mod]}`);
        allNull = false;
      }
    });
  });
  if (allNull) ok('All urgency/time modifiers are null across all services');
}

// ─── 11. HARDWARE SEMANTICS EXPLICIT WHERE RELEVANT ─────────────────────────
console.log('\n=== 11. HARDWARE SEMANTICS EXPLICIT ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const repairServices = services.filter(s =>
    s.category === 'SMALL_REPAIRS_ADJUSTMENTS' || s.category === 'DOORS'
  );
  const withoutPolicy = repairServices.filter(s => !s.hardware_policy);
  check(withoutPolicy.length === 0,
    'All repair/door services have hardware_policy defined',
    `Services missing hardware_policy: ${withoutPolicy.map(s => s.service_code).join(', ')}`
  );
}

// ─── 12. LINEAR_METER SCOPE EXPLICIT ────────────────────────────────────────
console.log('\n=== 12. LINEAR_METER SCOPE EXPLICIT ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const perMl = services.filter(s => s.pricing_unit === 'PER_LINEAR_METER');
  const withoutScope = perMl.filter(s => !s.linear_meter_scope);
  check(withoutScope.length === 0,
    `All ${perMl.length} PER_LINEAR_METER services have linear_meter_scope defined`,
    `Services missing linear_meter_scope: ${withoutScope.map(s => s.service_code).join(', ')}`
  );
}

// ─── 13. MATERIAL TYPE EXPLICIT FOR FABRICATION ──────────────────────────────
console.log('\n=== 13. MATERIAL TYPE EXPLICIT FOR FABRICATION ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const fabrication = services.filter(s =>
    s.category === 'WARDROBES_CLOSETS' ||
    s.category === 'KITCHEN' ||
    s.category === 'FURNITURE_CUSTOM' ||
    s.category === 'ALUMINIUM'
  );
  const withoutMaterial = fabrication.filter(s => !s.material_type);
  check(withoutMaterial.length === 0,
    `All ${fabrication.length} fabrication services have material_type defined`,
    `Services missing material_type: ${withoutMaterial.map(s => s.service_code).join(', ')}`
  );
}

// ─── 14. T0 NOT COUNTED AS EXTERNAL EVIDENCE ────────────────────────────────
console.log('\n=== 14. T0 SOURCES NOT USED AS EXTERNAL EVIDENCE ===');
if (parsed['sources.v0.1.json']) {
  const sources = parsed['sources.v0.1.json'].sources || [];
  const t0sources = sources.filter(s => s.grade === 'T0');
  check(t0sources.length === 0,
    'No T0 sources in sources.v0.1.json (T0 values are in legacy-comparison.md only)',
    `T0 sources found in sources file: ${t0sources.map(s => s.source_id).join(', ')}`
  );
}

// ─── 15. REPAIR/FABRICATION SEPARATION ──────────────────────────────────────
console.log('\n=== 15. REPAIR vs FABRICATION SEPARATION ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const repairCategories = ['SMALL_REPAIRS_ADJUSTMENTS', 'DOORS'];
  const fabricationCategories = ['WARDROBES_CLOSETS', 'KITCHEN', 'FURNITURE_CUSTOM', 'ALUMINIUM'];
  const hasRepair = services.some(s => repairCategories.includes(s.category));
  const hasFabrication = services.some(s => fabricationCategories.includes(s.category));
  check(hasRepair, 'Registry contains repair/adjustment services', 'No repair/adjustment services found');
  check(hasFabrication, 'Registry contains fabrication services', 'No fabrication services found');

  // Ensure fabrication services are QUOTE_REQUIRED
  const fabricationNotQuoted = services.filter(s =>
    fabricationCategories.includes(s.category) &&
    s.pricing_architecture !== 'QUOTE_REQUIRED' &&
    s.pricing_architecture !== 'DEFERRED'
  );
  check(fabricationNotQuoted.length === 0,
    'All fabrication services are QUOTE_REQUIRED or DEFERRED',
    `Fabrication services with non-QUOTE architecture: ${fabricationNotQuoted.map(s => s.service_code).join(', ')}`
  );
}

// ─── 16. METIER BOUNDARIES PRESERVED ────────────────────────────────────────
console.log('\n=== 16. METIER BOUNDARIES PRESERVED ===');
if (parsed['registry.v0.1.json']) {
  const services = parsed['registry.v0.1.json'].services || [];
  const withBoundaries = services.filter(s => s.metier_boundary !== undefined);
  check(withBoundaries.length > 0,
    `${withBoundaries.length} services have metier_boundary defined`,
    'No services have metier_boundary defined'
  );
  // Check MENU_001 explicitly excludes SERRURERIE
  const door = services.find(s => s.service_code === 'MENU_001');
  if (door) {
    const hasSERR = (door.scope_exclusions || []).some(e => e.toUpperCase().includes('SERRURERIE'));
    check(hasSERR,
      'MENU_001 (door adjustment) explicitly excludes SERRURERIE scope',
      'MENU_001 missing SERRURERIE boundary in scope_exclusions'
    );
  }
}

// ─── PRODUCTION RUNTIME DIFF CHECK ──────────────────────────────────────────
console.log('\n=== 17. PRODUCTION RUNTIME DIFF CHECK ===');
const { execSync } = require('child_process');
try {
  const repo = path.resolve(__dirname, '../../../../');
  const diff = execSync('git diff --name-only HEAD', { cwd: repo, encoding: 'utf8' }).trim();
  const stagedDiff = execSync('git diff --name-only --cached HEAD', { cwd: repo, encoding: 'utf8' }).trim();
  const allChanged = [diff, stagedDiff].join('\n').split('\n').filter(Boolean);
  const prodChanges = allChanged.filter(f =>
    !f.startsWith('data/pricing/research/menuiserie/') &&
    f !== ''
  );
  check(prodChanges.length === 0,
    `PRODUCTION RUNTIME = 0 DIFF (${allChanged.length} files in research dir only)`,
    `PRODUCTION FILES MODIFIED: ${prodChanges.join(', ')}`
  );
} catch (e) {
  err(`Could not run git diff: ${e.message}`);
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`VALIDATION SUMMARY`);
console.log('═'.repeat(60));
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (errors.length > 0) {
  console.log('\nFailed checks:');
  errors.forEach(e => console.log(`  - ${e}`));
}
console.log('\nStatus: ' + (fail === 0
  ? '✅ ALL CHECKS PASSED — PHASE 7B.10 RESEARCH VALID'
  : `❌ ${fail} CHECK(S) FAILED — FIX BEFORE COMMIT`
));
if (fail === 0) {
  console.log('\nPHASE 7B.10 — FIXEO MENUISERIE MOROCCO MARKET RESEARCH — COMPLETE — HUMAN CALIBRATION REQUIRED');
}
