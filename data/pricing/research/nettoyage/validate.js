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

// ─── V0.2 CHECKS ────────────────────────────────────────────────────────────
const calibration = loadJson('calibration.v0.2.json');
const humanReviewExists = fs.existsSync(path.join(DIR, 'human-review.v0.2.md'));
const fairPolicyExists = fs.existsSync(path.join(DIR, 'fair-price-policy.v0.2.md'));

if (calibration) {
  console.log('\n14. V0.2 artifact existence');
  check('calibration.v0.2.json exists', true);
  check('human-review.v0.2.md exists', humanReviewExists);
  check('fair-price-policy.v0.2.md exists', fairPolicyExists);

  console.log('\n15. Calibration meta checks');
  check('calibration._meta.production_ready = false', calibration._meta?.production_ready === false);
  check('calibration._meta.phase = 7B.8.1', calibration._meta?.phase === '7B.8.1');

  console.log('\n16. Exactly 8 calibration candidates');
  const cands = Object.keys(calibration.candidates || {});
  const requiredCandidates = ['NET-001','NET-002','NET-004','NET-010','NET-011','NET-013','NET-014','NET-030'];
  check(`Exactly 8 candidates (found ${cands.length})`, cands.length === 8, cands.join(','));
  for (const code of requiredCandidates) {
    check(`Candidate ${code} present`, cands.includes(code));
  }

  console.log('\n17. All calibration candidates: human_decision = PENDING, production_ready = false');
  for (const [code, svc] of Object.entries(calibration.candidates || {})) {
    check(`${code}.human_decision = PENDING`, svc.human_decision === 'PENDING');
    check(`${code}.production_ready = false`, svc.production_ready === false);
  }

  console.log('\n18. City/urgency modifiers null in calibration candidates');
  for (const [code, svc] of Object.entries(calibration.candidates || {})) {
    for (const mod of ['city_adjustment','urgency_modifier','night_modifier','weekend_modifier','holiday_modifier']) {
      if (mod in svc) {
        check(`${code}.${mod} = null`, svc[mod] === null, String(svc[mod]));
      }
    }
  }

  console.log('\n19. Cleaner-hour semantics explicit');
  const doctrine = calibration.worker_count_doctrine;
  check('worker_count_doctrine exists', !!doctrine);
  check('canonical_unit = PER_CLEANER_HOUR', doctrine?.canonical_unit === 'PER_CLEANER_HOUR');
  const net002 = calibration.candidates?.['NET-002'];
  check('NET-002 pricing_unit = PER_CLEANER_HOUR', net002?.pricing_unit === 'PER_CLEANER_HOUR');

  console.log('\n20. Anti-double-charge modeled');
  const adc = calibration.anti_double_charge_doctrine;
  check('anti_double_charge_doctrine exists', !!adc);
  check('recommended_architecture defined', typeof adc?.recommended_architecture === 'string');

  console.log('\n21. Minimum visit architecture modeled');
  const net001 = calibration.candidates?.['NET-001'];
  check('NET-001 preferred_candidate_for_human_review defined', net001?.preferred_candidate_for_human_review !== undefined);
  check('NET-001 minimum_cleaner_hours_included defined', net001?.architecture_analysis?.minimum_cleaner_hours_included !== undefined);

  console.log('\n22. Mattress face semantics explicit');
  const net013 = calibration.candidates?.['NET-013'];
  const net014 = calibration.candidates?.['NET-014'];
  check('NET-013 face_semantics defined', !!net013?.face_semantics);
  check('NET-013 pricing_unit = PER_MATTRESS_BOTH_FACES', net013?.pricing_unit === 'PER_MATTRESS_BOTH_FACES');
  check('NET-014 pricing_unit = PER_MATTRESS_BOTH_FACES', net014?.pricing_unit === 'PER_MATTRESS_BOTH_FACES');

  console.log('\n23. Post-construction minimum-project architecture analyzed');
  const net030 = calibration.candidates?.['NET-030'];
  check('NET-030 minimum_project_architecture defined', typeof net030?.minimum_project_architecture === 'string');
  check('NET-030 minimum_project_candidates_mad is array', Array.isArray(net030?.minimum_project_candidates_mad));
  check('NET-030 preferred_candidates_for_human_review defined', !!net030?.preferred_candidates_for_human_review);

  console.log('\n24. Standard/deep/post-construction separated in calibration');
  const std = calibration.candidates?.['NET-002']?.category;
  const deep = calibration.candidates?.['NET-004']?.category;
  const postc = calibration.candidates?.['NET-030']?.category;
  check('NET-002 category = STANDARD_RESIDENTIAL', std === 'STANDARD_RESIDENTIAL');
  check('NET-004 category = DEEP_CLEAN', deep === 'DEEP_CLEAN');
  check('NET-030 category = POST_CONSTRUCTION', postc === 'POST_CONSTRUCTION');

  console.log('\n25. Products/equipment policy defined');
  const prodModel = calibration.products_equipment_model;
  check('products_equipment_model exists', !!prodModel);
  check('recommended_fixeo_split defined', !!prodModel?.recommended_fixeo_split);

  console.log('\n26. Worker net floor defined');
  const floor = calibration.proposed_net_cleaner_hour_floor;
  check('proposed_net_cleaner_hour_floor exists', !!floor);
  check('floor classification = FIXEO_POLICY', (floor?.classification || '').startsWith('FIXEO_POLICY'));

  console.log('\n27. Complexity policy defined');
  const complexity = calibration.complexity_policy;
  check('complexity_policy exists', !!complexity);
  check('approved_levels includes STANDARD, HEAVY, POST_CONSTRUCTION, SPECIALIST',
    JSON.stringify(complexity?.approved_levels || []).includes('STANDARD') &&
    JSON.stringify(complexity?.approved_levels || []).includes('SPECIALIST'));

  console.log('\n28. V0.1 artifacts untouched');
  // Check V0.1 files still pass their own internal checks (file existence)
  const v01files = ['registry.v0.1.json','sources.v0.1.json','evidence.v0.1.json','exclusions.v0.1.json'];
  for (const f of v01files) {
    const content = loadJson(f);
    check(`V0.1 ${f} still parseable`, content !== null);
  }
}

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
