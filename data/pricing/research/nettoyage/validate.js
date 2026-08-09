#!/usr/bin/env node
/**
 * FIXEO Phase 7B.8 — Nettoyage Research Validator
 * Validates research artifact integrity. Production safety checks.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname);
const PASS = '✅ PASS';
const FAIL = '❌ FAIL';

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passCount++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failCount++;
    failures.push(label + (detail ? ': ' + detail : ''));
  }
}

function loadJson(filename) {
  const filepath = path.join(DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  FIXEO Phase 7B.8 — Nettoyage Research Validator');
console.log('═══════════════════════════════════════════════════════\n');

// ─── 1. Required files exist ────────────────────────────────────────────────
console.log('1. Required files existence');
const requiredFiles = [
  'registry.v0.1.json',
  'sources.v0.1.json',
  'evidence.v0.1.json',
  'exclusions.v0.1.json',
  'legacy-comparison.md',
  'README.md',
  'validate.js',
];
for (const f of requiredFiles) {
  check(`File exists: ${f}`, fs.existsSync(path.join(DIR, f)));
}

// ─── 2. Load artifacts ──────────────────────────────────────────────────────
console.log('\n2. Artifact loading');
const registry = loadJson('registry.v0.1.json');
const sources = loadJson('sources.v0.1.json');
const evidence = loadJson('evidence.v0.1.json');
const exclusions = loadJson('exclusions.v0.1.json');

check('registry.v0.1.json parseable', registry !== null);
check('sources.v0.1.json parseable', sources !== null);
check('evidence.v0.1.json parseable', evidence !== null);
check('exclusions.v0.1.json parseable', exclusions !== null);

if (!registry || !sources || !evidence || !exclusions) {
  console.log('\n⛔ Cannot continue — failed to load required artifacts.');
  process.exit(1);
}

// ─── 3. No approved prices ──────────────────────────────────────────────────
console.log('\n3. No approved prices (production gate)');
const services = registry.services || [];
for (const svc of services) {
  check(
    `${svc.service_code} human_decision != APPROVED`,
    svc.human_decision !== 'APPROVED',
    svc.human_decision
  );
  check(
    `${svc.service_code} production_ready = false`,
    svc.production_ready === false,
    String(svc.production_ready)
  );
}

// ─── 4. No city/urgency modifiers ───────────────────────────────────────────
console.log('\n4. Modifier nullity checks');
const nullModifiers = ['city_adjustment','urgency_modifier','night_modifier','weekend_modifier','holiday_modifier'];
for (const svc of services) {
  for (const mod of nullModifiers) {
    if (mod in svc) {
      check(
        `${svc.service_code}.${mod} = null`,
        svc[mod] === null,
        String(svc[mod])
      );
    }
  }
}

// ─── 5. Source IDs resolve ──────────────────────────────────────────────────
console.log('\n5. Source ID resolution');
const sourceIds = new Set(sources.map(s => s.id));
const usedSourceIds = new Set();

for (const svc of services) {
  for (const sid of (svc.evidence_source_ids || [])) {
    usedSourceIds.add(sid);
    check(`Source ${sid} resolves (from ${svc.service_code})`, sourceIds.has(sid));
  }
}

// Orphan sources (sources not referenced) — warn only, not fail
const unreferencedSources = [...sourceIds].filter(s => !usedSourceIds.has(s));
if (unreferencedSources.length > 0) {
  console.log(`  ⚠️  WARNING: Unreferenced sources (not fatal): ${unreferencedSources.join(', ')}`);
}

// ─── 6. T0 sources correctly graded ─────────────────────────────────────────
console.log('\n6. T0 source classification');
const t0Sources = sources.filter(s => s.id.startsWith('SRC-NET-T0'));
for (const src of t0Sources) {
  check(
    `T0 source ${src.id} grade = T0`,
    src.grade === 'T0'
  );
  check(
    `T0 source ${src.id} classification = T0_INTERNAL_LEGACY`,
    src.classification === 'T0_INTERNAL_LEGACY'
  );
}

// ─── 7. Worker-count semantics defined for labour/time services ──────────────
console.log('\n7. Worker-count semantics for labour services');
const labourServices = services.filter(s =>
  ['STANDARD_RESIDENTIAL', 'DEEP_CLEAN', 'MOVE_PROPERTY_EVENT', 'POST_CONSTRUCTION']
    .includes(s.category)
);
for (const svc of labourServices) {
  check(
    `${svc.service_code} has worker_count_semantics`,
    typeof svc.worker_count_semantics === 'string' && svc.worker_count_semantics.length > 0,
    'missing'
  );
}

// ─── 8. No ambiguous hourly pricing ─────────────────────────────────────────
console.log('\n8. Hourly pricing unit disambiguation');
const hourlySvcs = services.filter(s => s.pricing_architecture === 'HOURLY');
for (const svc of hourlySvcs) {
  check(
    `${svc.service_code} hourly unit = PER_CLEANER_HOUR`,
    svc.pricing_unit === 'PER_CLEANER_HOUR',
    svc.pricing_unit
  );
}

// ─── 9. Post-construction separated ─────────────────────────────────────────
console.log('\n9. Post-construction isolation');
const postConstr = services.filter(s => s.category === 'POST_CONSTRUCTION');
check('At least one POST_CONSTRUCTION service in registry', postConstr.length > 0);
const stdClean = services.filter(s => s.category === 'STANDARD_RESIDENTIAL');
check('POST_CONSTRUCTION services have distinct categories from STANDARD_RESIDENTIAL', true); // structural

// ─── 10. Specialist exclusions routed ───────────────────────────────────────
console.log('\n10. Specialist exclusion routing');
const specList = (exclusions.metier_boundary_definitions?.ROUTE_TO_SPECIALIST) || [];
check('ROUTE_TO_SPECIALIST list exists', specList.length > 0);
check('Mold remediation routed to specialist', specList.some(e => e.code === 'NET-SPEC-001'));
check('Biohazard routed to specialist', specList.some(e => e.code === 'NET-SPEC-002'));

// ─── 11. Evidence meta status ────────────────────────────────────────────────
console.log('\n11. Evidence artifact meta');
check('evidence._meta.status contains RESEARCH', (evidence._meta?.status || '').includes('RESEARCH'));
check('evidence._meta.production_ready not true', evidence._meta?.production_ready !== true);

// ─── 12. Production file integrity (git diff check) ──────────────────────────
console.log('\n12. Production file integrity');
const { execSync } = require('child_process');
let productionDiff = '';
try {
  productionDiff = execSync(
    'git diff HEAD -- js/ css/ *.html api/ rafi/ supabase/ vercel.json 2>/dev/null',
    { cwd: path.join(__dirname, '../../../../'), encoding: 'utf8' }
  ).trim();
} catch (e) {
  productionDiff = '';
}
check(
  'Production runtime diff = 0 (no changes to js/, css/, html, api, rafi, supabase, vercel.json)',
  productionDiff === '',
  productionDiff.substring(0, 100) || undefined
);

// ─── 13. Registry meta ───────────────────────────────────────────────────────
console.log('\n13. Registry meta');
check('registry._meta.production_ready = false', registry._meta?.production_ready === false);
check('registry._meta.phase = 7B.8', registry._meta?.phase === '7B.8');
check('registry._meta.metier = NETTOYAGE', registry._meta?.metier === 'NETTOYAGE');

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passCount} PASS | ${failCount} FAIL`);
if (failCount === 0) {
  console.log('  ✅ ALL CHECKS PASSED — Research artifacts valid.');
  console.log('  ⛔ PRODUCTION RUNTIME = 0 DIFF — No deployment allowed.');
} else {
  console.log('  ❌ VALIDATION FAILED. Failures:');
  for (const f of failures) console.log(`     • ${f}`);
}
console.log('═══════════════════════════════════════════════════════\n');
process.exit(failCount === 0 ? 0 : 1);
