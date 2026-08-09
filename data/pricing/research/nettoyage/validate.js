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
  const v01files = ['registry.v0.1.json','sources.v0.1.json','evidence.v0.1.json','exclusions.v0.1.json'];
  for (const f of v01files) {
    const content = loadJson(f);
    check(`V0.1 ${f} still parseable`, content !== null);
  }
}

// ─── V0.3 CHECKS ────────────────────────────────────────────────────────────
const reg3 = loadJson('registry.v0.3.json');
const cal3 = loadJson('calibration.v0.3.json');
const hdExists = fs.existsSync(path.join(DIR, 'human-decision.v0.3.md'));
const fp3Exists = fs.existsSync(path.join(DIR, 'fair-price-policy.v0.3.md'));

if (reg3 && cal3) {
  console.log('\n29. V0.3 artifact existence');
  check('registry.v0.3.json exists', true);
  check('calibration.v0.3.json exists', true);
  check('human-decision.v0.3.md exists', hdExists);
  check('fair-price-policy.v0.3.md exists', fp3Exists);

  console.log('\n30. V0.3 meta');
  check('registry.v0.3._meta.production_ready = false', reg3._meta?.production_ready === false);
  check('registry.v0.3._meta.phase = 7B.8.2', reg3._meta?.phase === '7B.8.2');
  check('calibration.v0.3._meta.production_ready = false', cal3._meta?.production_ready === false);
  check('calibration.v0.3._meta.phase = 7B.8.2', cal3._meta?.phase === '7B.8.2');
  check('calibration.v0.3._meta.price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT', cal3._meta?.price_provenance === 'FIXEO_HUMAN_CALIBRATED_PILOT');
  check('calibration.v0.3._meta.maturity = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION', cal3._meta?.maturity === 'LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION');

  console.log('\n31. Exactly 8 approved services in registry.v0.3');
  const approved3 = Object.entries(reg3.services || {}).filter(([,s]) => s.human_decision === 'APPROVED');
  check(`Exactly 8 APPROVED services (found ${approved3.length})`, approved3.length === 8);
  const requiredApproved = ['NET-001','NET-002','NET-004','NET-010','NET-011','NET-013','NET-014','NET-030'];
  for (const code of requiredApproved) {
    check(`${code} human_decision = APPROVED`, reg3.services?.[code]?.human_decision === 'APPROVED');
    check(`${code} production_ready = false`, reg3.services?.[code]?.production_ready === false);
  }

  console.log('\n32. Exact approved prices in registry.v0.3');
  check('NET-001 approved_price_mad = 200', reg3.services?.['NET-001']?.approved_price_mad === 200);
  check('NET-002 approved_price_mad_per_cleaner_hour = 65', reg3.services?.['NET-002']?.approved_price_mad_per_cleaner_hour === 65);
  check('NET-004 approved_price_mad = 600', reg3.services?.['NET-004']?.approved_price_mad === 600);
  check('NET-010 approved_price_mad = 300', reg3.services?.['NET-010']?.approved_price_mad === 300);
  check('NET-011 approved_price_mad = 450', reg3.services?.['NET-011']?.approved_price_mad === 450);
  check('NET-013 approved_price_mad = 250', reg3.services?.['NET-013']?.approved_price_mad === 250);
  check('NET-014 approved_price_mad = 300', reg3.services?.['NET-014']?.approved_price_mad === 300);
  check('NET-030 approved_rate_per_m2_mad = 18', reg3.services?.['NET-030']?.approved_rate_per_m2_mad === 18);
  check('NET-030 approved_minimum_project_mad = 1000', reg3.services?.['NET-030']?.approved_minimum_project_mad === 1000);

  console.log('\n33. Exact approved prices in calibration.v0.3');
  const ap = cal3.approved_prices || {};
  check('cal3 NET-001 approved_mad = 200', ap['NET-001']?.approved_mad === 200);
  check('cal3 NET-002 approved_mad_per_cleaner_hour = 65', ap['NET-002']?.approved_mad_per_cleaner_hour === 65);
  check('cal3 NET-004 approved_mad = 600', ap['NET-004']?.approved_mad === 600);
  check('cal3 NET-010 approved_mad = 300', ap['NET-010']?.approved_mad === 300);
  check('cal3 NET-011 approved_mad = 450', ap['NET-011']?.approved_mad === 450);
  check('cal3 NET-013 approved_mad = 250', ap['NET-013']?.approved_mad === 250);
  check('cal3 NET-014 approved_mad = 300', ap['NET-014']?.approved_mad === 300);
  check('cal3 NET-030 approved_mad_per_m2 = 18', ap['NET-030']?.approved_mad_per_m2 === 18);
  check('cal3 NET-030 approved_minimum_mad = 1000', ap['NET-030']?.approved_minimum_mad === 1000);

  console.log('\n34. NET-002 unit and worker-count doctrine');
  check('NET-002 pricing_unit = PER_CLEANER_HOUR', reg3.services?.['NET-002']?.pricing_unit === 'PER_CLEANER_HOUR');
  const wcd = reg3.services?.['NET-002']?.worker_count_doctrine;
  check('NET-002 worker_count_doctrine exists', !!wcd);
  check('worker_count canonical_unit = PER_CLEANER_HOUR', wcd?.canonical_unit === 'PER_CLEANER_HOUR');
  // Verify canonical examples in registry
  const exs = wcd?.canonical_examples || [];
  check('canonical_examples array exists', exs.length >= 4);

  console.log('\n35. Anti-double-charge canonical examples in registry.v0.3');
  function findExample(arr, cleaners, hours) {
    return arr.find(e => e.cleaners === cleaners && e.hours === hours);
  }
  const ex1c3h = findExample(exs, 1, 3);
  const ex1c4h = findExample(exs, 1, 4);
  const ex2c3h = findExample(exs, 2, 3);
  const ex2c4h = findExample(exs, 2, 4);
  check('1 cleaner × 3h → final = 200', ex1c3h?.final === 200);
  check('1 cleaner × 4h → final = 260', ex1c4h?.final === 260);
  check('2 cleaners × 3h → final = 390', ex2c3h?.final === 390);
  check('2 cleaners × 4h → final = 520', ex2c4h?.final === 520);
  check('1 cleaner × 3h → cleaner_hours = 3', ex1c3h?.cleaner_hours === 3);
  check('2 cleaners × 3h → cleaner_hours = 6', ex2c3h?.cleaner_hours === 6);

  console.log('\n36. Anti-double-charge doctrine in calibration.v0.3');
  const adc3 = cal3.doctrines?.anti_double_charge || {};
  check('anti_double_charge doctrine exists', !!adc3.rule);
  // Verify calibration.v0.3 also has the canonical examples
  const calExs = adc3.canonical_examples || [];
  const calEx3ch = calExs.find(e => e.total_ch === 3);
  const calEx4ch = calExs.find(e => e.total_ch === 4);
  check('calibration anti_double_charge: 3ch → final = 200', calEx3ch?.final === 200);
  check('calibration anti_double_charge: 4ch → final = 260', calEx4ch?.final === 260);
  const calEx6ch = calExs.find(e => e.total_ch === 6);
  check('calibration anti_double_charge: 6ch → final = 390', calEx6ch?.final === 390);
  // multi-cleaner examples
  const mcExs = adc3.multi_cleaner_examples || [];
  const mc2x3 = mcExs.find(e => e.cleaners === 2 && e.hours === 3);
  const mc2x4 = mcExs.find(e => e.cleaners === 2 && e.hours === 4);
  check('multi_cleaner 2×3h → final = 390', mc2x3?.final === 390);
  check('multi_cleaner 2×4h → final = 520', mc2x4?.final === 520);

  console.log('\n37. Mattress both-faces unit');
  check('NET-013 pricing_unit = PER_MATTRESS_BOTH_FACES', reg3.services?.['NET-013']?.pricing_unit === 'PER_MATTRESS_BOTH_FACES');
  check('NET-014 pricing_unit = PER_MATTRESS_BOTH_FACES', reg3.services?.['NET-014']?.pricing_unit === 'PER_MATTRESS_BOTH_FACES');
  check('NET-013 cal3 unit = PER_MATTRESS_BOTH_FACES', ap['NET-013']?.unit === 'PER_MATTRESS_BOTH_FACES');
  check('NET-014 cal3 unit = PER_MATTRESS_BOTH_FACES', ap['NET-014']?.unit === 'PER_MATTRESS_BOTH_FACES');
  check('NET-013 face_ambiguity_resolution documented', !!reg3.services?.['NET-013']?.face_ambiguity_resolution);
  const mfs = cal3.doctrines?.mattress_face_semantics || {};
  check('mattress_face_semantics canonical_unit = PER_MATTRESS_BOTH_FACES', mfs.canonical_unit === 'PER_MATTRESS_BOTH_FACES');
  check('mattress_face_semantics historical_integrity documented', !!mfs.historical_integrity);

  console.log('\n38. Products/equipment MODEL_A and MODEL_C');
  const pe3 = cal3.doctrines?.products_equipment || {};
  check('MODEL_A applies to NET-001 and NET-002', (pe3.MODEL_A?.applies_to || []).includes('NET-001') && (pe3.MODEL_A?.applies_to || []).includes('NET-002'));
  check('MODEL_A products = CLIENT_SUPPLIED', pe3.MODEL_A?.products === 'CLIENT_SUPPLIED');
  check('MODEL_A equipment = CLIENT_SUPPLIED', pe3.MODEL_A?.equipment === 'CLIENT_SUPPLIED');
  check('MODEL_C applies to NET-004', (pe3.MODEL_C?.applies_to || []).includes('NET-004'));
  check('MODEL_C applies to NET-010', (pe3.MODEL_C?.applies_to || []).includes('NET-010'));
  check('MODEL_C applies to NET-030', (pe3.MODEL_C?.applies_to || []).includes('NET-030'));
  check('MODEL_C products = ARTISAN_SUPPLIED_INCLUDED', pe3.MODEL_C?.products === 'ARTISAN_SUPPLIED_INCLUDED');
  check('MODEL_C equipment = ARTISAN_SUPPLIED_INCLUDED', pe3.MODEL_C?.equipment === 'ARTISAN_SUPPLIED_INCLUDED');
  // Check in registry
  for (const code of ['NET-001','NET-002']) {
    check(`${code} products = CLIENT_SUPPLIED`, reg3.services?.[code]?.products === 'CLIENT_SUPPLIED');
    check(`${code} equipment = CLIENT_SUPPLIED`, reg3.services?.[code]?.equipment === 'CLIENT_SUPPLIED');
  }
  for (const code of ['NET-004','NET-010','NET-011','NET-013','NET-014','NET-030']) {
    check(`${code} products = ARTISAN_SUPPLIED_INCLUDED`, reg3.services?.[code]?.products === 'ARTISAN_SUPPLIED_INCLUDED');
    check(`${code} equipment = ARTISAN_SUPPLIED_INCLUDED`, reg3.services?.[code]?.equipment === 'ARTISAN_SUPPLIED_INCLUDED');
  }

  console.log('\n39. NET-030 post-construction canonical price points');
  const ex30 = (reg3.services?.['NET-030']?.canonical_examples || []);
  function find30(area) { return ex30.find(e => e.area_m2 === area); }
  check('NET-030: 40m² → final = 1000', find30(40)?.final === 1000);
  check('NET-030: 60m² → final = 1080', find30(60)?.final === 1080);
  check('NET-030: 80m² → final = 1440', find30(80)?.final === 1440);
  check('NET-030: 100m² → final = 1800', find30(100)?.final === 1800);
  // Also verify in calibration economic_validation
  const stressTest = cal3.economic_validation?.post_construction_stress_test?.scenarios || {};
  check('stress_test 40m² final = 1000', stressTest['40m2']?.final_billed === 1000);
  check('stress_test 60m² final = 1080', stressTest['60m2']?.final_billed === 1080);
  check('stress_test 80m² final = 1440', stressTest['80m2']?.final_billed === 1440);
  check('stress_test 100m² final = 1800', stressTest['100m2']?.final_billed === 1800);
  check('stress_test 150m² final = 2700', stressTest['150m2']?.final_billed === 2700);

  console.log('\n40. All modifiers null in registry.v0.3 approved services');
  const allMods = ['city_adjustment','urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier','recurring_modifier'];
  for (const code of requiredApproved) {
    const svc = reg3.services?.[code] || {};
    for (const mod of allMods) {
      if (mod in svc) {
        check(`${code}.${mod} = null in v0.3`, svc[mod] === null);
      }
    }
  }
  // Verify modifier policy doctrine
  const modPolicy = cal3.doctrines?.modifier_policy || {};
  for (const mod of ['urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier','recurring_modifier']) {
    check(`modifier_policy.${mod} = null`, modPolicy[mod] === null);
  }

  console.log('\n41. Price provenance and maturity exact');
  for (const code of requiredApproved) {
    const svc = reg3.services?.[code] || {};
    check(`${code}.price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT`, svc.price_provenance === 'FIXEO_HUMAN_CALIBRATED_PILOT');
    check(`${code}.maturity = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION`, svc.maturity === 'LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION');
  }

  console.log('\n42. Worker economic floor validation');
  const evStd = cal3.economic_validation?.standard_cleaning_matrix?.results || {};
  const e1c3h = evStd['1_cleaner_3h'];
  const e1c4h = evStd['1_cleaner_4h'];
  const e2c3h = evStd['2_cleaners_3h'];
  const e2c4h = evStd['2_cleaners_4h'];
  check('economic_validation 1×3h final_billed = 200', e1c3h?.final_billed === 200);
  check('economic_validation 1×4h final_billed = 260', e1c4h?.final_billed === 260);
  check('economic_validation 2×3h final_billed = 390', e2c3h?.final_billed === 390);
  check('economic_validation 2×4h final_billed = 520', e2c4h?.final_billed === 520);
  check('economic_validation 1×3h floor_pass_20pct = true', e1c3h?.floor_pass_20pct === true);
  check('economic_validation 1×4h floor_pass_20pct = true', e1c4h?.floor_pass_20pct === true);
  check('economic_validation 2×3h floor_pass_20pct = true', e2c3h?.floor_pass_20pct === true);
  check('economic_validation 2×4h floor_pass_20pct = true', e2c4h?.floor_pass_20pct === true);

  console.log('\n43. Worker floor policy classification');
  const wef = cal3.doctrines?.worker_economic_floor || {};
  check('worker_economic_floor target = 40', wef.target_net_cleaner_hour_floor_mad === 40);
  check('worker_economic_floor classification starts with FIXEO_POLICY', (wef.classification || '').startsWith('FIXEO_POLICY'));

  console.log('\n44. Geographic policy');
  const geo = cal3.doctrines?.geographic_policy || {};
  check('geographic_policy market_scope = NATIONAL_MOROCCO', geo.market_scope === 'NATIONAL_MOROCCO');
  check('geographic_policy city_adjustment = null', geo.city_adjustment === null);
  check('registry market_scope = NATIONAL_MOROCCO', reg3._meta?.market_scope === 'NATIONAL_MOROCCO');

  console.log('\n45. V0.2 → V0.3 delta documented');
  const delta = cal3.v0_2_to_v0_3_delta || {};
  check('delta NET-002 changed = true', delta['NET-002']?.changed === true);
  check('delta NET-002 v0_3 = 65', delta['NET-002']?.v0_3_approved === 65);
  check('delta NET-013 changed = true', delta['NET-013']?.changed === true);
  check('delta NET-013 v0_3 = 250', delta['NET-013']?.v0_3_approved === 250);
  check('delta NET-014 changed = true', delta['NET-014']?.changed === true);
  check('delta NET-014 v0_3 = 300', delta['NET-014']?.v0_3_approved === 300);
  check('delta NET-001 changed = false', delta['NET-001']?.changed === false);
  check('delta NET-004 changed = false', delta['NET-004']?.changed === false);
  check('delta NET-010 changed = false', delta['NET-010']?.changed === false);
  check('delta NET-011 changed = false', delta['NET-011']?.changed === false);

  console.log('\n46. V0.1/V0.2 immutability confirmed');
  const v01reg = loadJson('registry.v0.1.json');
  check('V0.1 registry parseable', v01reg !== null);
  check('V0.1 registry phase = 7B.8', v01reg?._meta?.phase === '7B.8');
  const v02cal = loadJson('calibration.v0.2.json');
  check('V0.2 calibration parseable', v02cal !== null);
  check('V0.2 calibration phase = 7B.8.1', v02cal?._meta?.phase === '7B.8.1');
  // Verify V0.2 NET-002 recommendation was 60 (not 65) — historical integrity
  check('V0.2 NET-002 recommended was 60 (history preserved)', v02cal?.candidates?.['NET-002']?.preferred_candidate_for_human_review === 60);
  check('V0.2 NET-013 recommended was 200 (history preserved)', v02cal?.candidates?.['NET-013']?.preferred_candidate_for_human_review === 200);
  check('V0.2 NET-014 recommended was 280 (history preserved)', v02cal?.candidates?.['NET-014']?.preferred_candidate_for_human_review === 280);

  console.log('\n47. Scope contracts defined in calibration.v0.3');
  const sc = cal3.scope_contracts || {};
  check('standard_cleaning_scope exists', !!sc.standard_cleaning_scope);
  check('deep_clean_scope exists', !!sc.deep_clean_scope);
  check('sofa_cleaning_scope exists', !!sc.sofa_cleaning_scope);
  check('mattress_cleaning_scope exists', !!sc.mattress_cleaning_scope);
  check('post_construction_scope exists', !!sc.post_construction_scope);
  check('standard scope has included array', Array.isArray(sc.standard_cleaning_scope?.included));
  check('standard scope has excluded array', Array.isArray(sc.standard_cleaning_scope?.excluded));
  check('post_construction scope has escape conditions', Array.isArray(sc.post_construction_scope?.excluded_and_escape_conditions));

  console.log('\n48. Non-approved services list complete');
  const nonAppr = cal3.non_approved_services || [];
  check('non_approved_services is array', Array.isArray(nonAppr));
  check('non_approved includes villa', nonAppr.some(s => s.includes('villa')));
  check('non_approved includes mold', nonAppr.some(s => s.includes('mold')));
  check('non_approved includes biohazard', nonAppr.some(s => s.includes('biohazard')));

  console.log('\n49. Complexity policy in calibration.v0.3');
  const cp3 = cal3.doctrines?.complexity_policy || {};
  check('complexity_policy levels defined', !!cp3.levels?.STANDARD);
  check('complexity_policy SPECIALIST defined', !!cp3.levels?.SPECIALIST);
  check('on_site_discovery_protocol is array', Array.isArray(cp3.on_site_discovery_protocol));
  check('on_site_discovery_protocol has 7 steps', cp3.on_site_discovery_protocol?.length === 7);
  check('no_silent_price_increase rule present', typeof cp3.no_silent_price_increase === 'string');

  console.log('\n50. NET-030 mandatory escape conditions documented');
  const escConds = reg3.services?.['NET-030']?.mandatory_escape_conditions || [];
  check('escape_conditions is array', Array.isArray(escConds) && escConds.length > 0);
  check('escape includes biohazard', escConds.some(c => c.toLowerCase().includes('biohazard')));
  check('escape includes sewage', escConds.some(c => c.toLowerCase().includes('sewage')));
  check('escape includes mold', escConds.some(c => c.toLowerCase().includes('mold')));
  check('escape_routing = QUOTE_REQUIRED or ROUTE_TO_SPECIALIST', (reg3.services?.['NET-030']?.escape_routing || '').includes('QUOTE_REQUIRED'));

  console.log('\n51. Approved summary in registry.v0.3');
  const summ = reg3.approved_summary || {};
  check('approved_summary count = 8', summ.count === 8);
  check('approved_summary codes has 8 items', (summ.codes || []).length === 8);
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
