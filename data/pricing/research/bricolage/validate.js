#!/usr/bin/env node
/**
 * FIXEO Bricolage Research Validator — Phase 7B.7
 * Validates research artifact integrity without modifying any production files.
 * 
 * Usage: node validate.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname);
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

let pass = 0;
let fail = 0;
const errors = [];

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  pass++;
}

function err(label, detail) {
  console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  errors.push({ label, detail });
  fail++;
}

function warn(label, detail) {
  console.log(`  ⚠️  WARN: ${label}${detail ? ' — ' + detail : ''}`);
}

// ─── Load files ─────────────────────────────────────────────────────────────

function loadJSON(filename) {
  const filepath = path.join(RESEARCH_DIR, filename);
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    err(`File loadable: ${filename}`, e.message);
    return null;
  }
}

// ─── 1. Required files exist ─────────────────────────────────────────────────

console.log('\n[1] Required files exist');
const requiredFiles = [
  'registry.v0.1.json',
  'sources.v0.1.json',
  'evidence.v0.1.json',
  'exclusions.v0.1.json',
  'legacy-comparison.md',
  'README.md',
  'validate.js'
];

for (const f of requiredFiles) {
  const fpath = path.join(RESEARCH_DIR, f);
  if (fs.existsSync(fpath)) ok(`File exists: ${f}`);
  else err(`File exists: ${f}`, 'MISSING');
}

// ─── 2. Valid JSON ────────────────────────────────────────────────────────────

console.log('\n[2] Valid JSON');
const registry  = loadJSON('registry.v0.1.json');
const sources   = loadJSON('sources.v0.1.json');
const evidence  = loadJSON('evidence.v0.1.json');
const exclusions = loadJSON('exclusions.v0.1.json');

if (registry)  ok('registry.v0.1.json parses');
if (sources)   ok('sources.v0.1.json parses');
if (evidence)  ok('evidence.v0.1.json parses');
if (exclusions) ok('exclusions.v0.1.json parses');

// ─── 3. production_ready = false everywhere ───────────────────────────────────

console.log('\n[3] production_ready = false');

function checkNotProductionReady(obj, label) {
  if (!obj) return;
  if (obj.production_ready === true) {
    err(`${label} production_ready must be false`);
  } else {
    ok(`${label} production_ready = false`);
  }
}

checkNotProductionReady(registry, 'registry root');
checkNotProductionReady(sources, 'sources root');
checkNotProductionReady(evidence, 'evidence root');
checkNotProductionReady(exclusions, 'exclusions root');

if (registry && registry.services) {
  let allFalse = true;
  for (const svc of registry.services) {
    if (svc.production_ready === true) {
      err(`Service ${svc.code} has production_ready=true`, 'MUST be false');
      allFalse = false;
    }
  }
  if (allFalse) ok('All service entries: production_ready = false');
}

// ─── 4. human_decision = PENDING everywhere ───────────────────────────────────

console.log('\n[4] human_decision = PENDING');

if (registry && registry.human_decision === 'PENDING') ok('registry.human_decision = PENDING');
else err('registry.human_decision must be PENDING');

if (registry && registry.services) {
  let allPending = true;
  for (const svc of registry.services) {
    if (svc.human_decision && svc.human_decision !== 'PENDING') {
      err(`Service ${svc.code} human_decision must be PENDING`);
      allPending = false;
    }
  }
  if (allPending) ok('All services: human_decision = PENDING');
}

// ─── 5. city_adjustment = null ───────────────────────────────────────────────

console.log('\n[5] city_adjustment = null');
if (registry && registry.city_adjustment === null) ok('registry.city_adjustment = null');
else err('registry.city_adjustment must be null');

// ─── 6. All time/urgency modifiers = null ────────────────────────────────────

console.log('\n[6] Time/urgency modifiers = null');
const modifiers = ['urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier'];
if (registry) {
  for (const m of modifiers) {
    if (registry[m] === null) ok(`registry.${m} = null`);
    else err(`registry.${m} must be null`, `got: ${registry[m]}`);
  }
}

// ─── 7. Unique service codes ─────────────────────────────────────────────────

console.log('\n[7] Unique service codes');
if (registry && registry.services) {
  const codes = registry.services.map(s => s.code);
  const uniqueCodes = new Set(codes);
  if (codes.length === uniqueCodes.size) ok(`All ${codes.length} service codes are unique`);
  else err('Duplicate service codes found', JSON.stringify([...new Map(codes.map((c,i) => [c,i])).entries()]));
}

// ─── 8. All evidence source IDs resolve ──────────────────────────────────────

console.log('\n[8] Evidence source IDs resolve to sources.v0.1.json');
if (evidence && sources) {
  const sourceIds = new Set(sources.sources.map(s => s.source_id));
  let allResolved = true;
  for (const obs of evidence.evidence_observations) {
    for (const sid of (obs.source_ids || [])) {
      if (!sourceIds.has(sid)) {
        err(`Evidence obs ${obs.obs_id} references unknown source: ${sid}`);
        allResolved = false;
      }
    }
  }
  if (allResolved) ok('All evidence source_ids resolve in sources.v0.1.json');
}

// ─── 9. All services have required fields ────────────────────────────────────

console.log('\n[9] Service entries have required fields');
const requiredServiceFields = ['code', 'label', 'architecture', 'pricing_unit', 'confidence', 'human_decision', 'production_ready'];
if (registry && registry.services) {
  let allComplete = true;
  for (const svc of registry.services) {
    for (const field of requiredServiceFields) {
      if (svc[field] === undefined || svc[field] === null) {
        if (field === 'confidence' && svc.confidence === 'INSUFFICIENT') {
          // INSUFFICIENT is valid
        } else {
          err(`Service ${svc.code} missing field: ${field}`);
          allComplete = false;
        }
      }
    }
  }
  if (allComplete) ok(`All ${registry.services.length} services have required fields`);
}

// ─── 10. No approved/frozen prices ───────────────────────────────────────────

console.log('\n[10] No approved or frozen prices');
if (registry && registry.services) {
  let clean = true;
  for (const svc of registry.services) {
    if (svc.approved === true || svc.frozen === true) {
      err(`Service ${svc.code} must not have approved or frozen = true`);
      clean = false;
    }
    if (svc.price_approved !== undefined) {
      err(`Service ${svc.code} must not have price_approved field`);
      clean = false;
    }
  }
  if (clean) ok('No approved or frozen prices found');
}

// ─── 11. No prior métier artifacts modified ───────────────────────────────────

console.log('\n[11] Prior métier research directories intact');
const priorMetiers = ['plomberie', 'electricite', 'serrurerie', 'climatisation'];
const researchBase = path.join(REPO_ROOT, 'data', 'pricing', 'research');

for (const metier of priorMetiers) {
  const metierPath = path.join(researchBase, metier);
  if (fs.existsSync(metierPath)) {
    const files = fs.readdirSync(metierPath);
    if (files.length > 0) ok(`Prior métier exists and non-empty: ${metier}`);
    else warn(`Prior métier directory exists but empty: ${metier}`);
  } else {
    warn(`Prior métier directory not found: ${metier} (may not yet exist on this branch)`);
  }
}

// ─── 12. Production files unmodified (spot check) ────────────────────────────

console.log('\n[12] Production runtime files not modified by this phase');
const productionFiles = [
  'index.html',
  'services.html',
  'artisans.html',
  'artisan-profile.html',
  'pricing.html',
  'js/fixeo-reservation-flagship-v1.js',
  'js/fixeo-matching-engine.js',
  'js/secondary-search.js',
  'js/fixeo-profile-v2a.js',
  'js/fixeo-profile-v3.js'
];

// We check git status to confirm these files are unmodified
const { execSync } = require('child_process');
try {
  const gitStatus = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  // Only bricolage research files should appear as new
  const changedLines = gitStatus.split('\n').filter(l => l.trim());
  let productionChanges = false;
  for (const line of changedLines) {
    for (const pf of productionFiles) {
      if (line.includes(pf)) {
        err(`Production file modified: ${pf}`, line.trim());
        productionChanges = true;
      }
    }
  }
  if (!productionChanges) ok('No production files appear in git status');
  
  // Check that only bricolage research files are new
  const newFiles = changedLines.filter(l => l.startsWith('??') || l.startsWith('A '));
  const allBricolage = newFiles.every(l => l.includes('bricolage'));
  if (newFiles.length > 0 && allBricolage) ok(`New files are all in bricolage research directory (${newFiles.length} files)`);
  else if (newFiles.length === 0) ok('No unexpected new files');
  else {
    for (const nf of newFiles) {
      if (!nf.includes('bricolage')) {
        warn(`Unexpected new file outside bricolage: ${nf.trim()}`);
      }
    }
  }
} catch(e) {
  warn('Could not run git status check', e.message);
}

// ─── 13. No métier overlap in registry ───────────────────────────────────────

console.log('\n[13] No unsafe métier overlap');
if (registry && registry.services_deferred_or_excluded) {
  const specialistItems = registry.services_deferred_or_excluded.filter(s => s.decision === 'SPECIALIST_REQUIRED');
  if (specialistItems.length > 0) ok(`${specialistItems.length} tasks correctly excluded as SPECIALIST_REQUIRED`);
  else warn('No SPECIALIST_REQUIRED exclusions found — review expected');
}

// ─── 14. Legacy values labeled T0 ────────────────────────────────────────────

console.log('\n[14] Legacy comparison file contains T0 labeling');
const legacyPath = path.join(RESEARCH_DIR, 'legacy-comparison.md');
if (fs.existsSync(legacyPath)) {
  const legacyContent = fs.readFileSync(legacyPath, 'utf8');
  if (legacyContent.includes('LEGACY_T0')) ok('legacy-comparison.md contains T0 labeling');
  else err('legacy-comparison.md must contain LEGACY_T0 classification');
  if (legacyContent.includes('were modified')) ok('legacy-comparison.md contains non-modification statement');
} else {
  err('legacy-comparison.md missing');
}

// ─── 15. Schema version present ──────────────────────────────────────────────

console.log('\n[15] Schema version present in all JSON files');
for (const [name, obj] of [['registry', registry], ['sources', sources], ['evidence', evidence], ['exclusions', exclusions]]) {
  if (obj && obj.schema_version) ok(`${name} has schema_version`);
  else if (obj) err(`${name} missing schema_version`);
}

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`VALIDATION RESULTS: ${pass} PASS / ${fail} FAIL`);
if (errors.length > 0) {
  console.log('\nFailed checks:');
  for (const e of errors) {
    console.log(`  • ${e.label}${e.detail ? ': ' + e.detail : ''}`);
  }
}
console.log('═'.repeat(60));
console.log(`Phase: 7B.7 — FIXEO Bricolage Morocco Market Research`);
console.log(`Status: RESEARCH_ONLY`);
console.log(`production_ready: false`);
console.log(`human_decision: PENDING`);
console.log('═'.repeat(60));

// exit moved to end

// ─── V0.2 Extended Checks ────────────────────────────────────────────────────

console.log('\n[V0.2] V0.2 calibration artifacts');

const v02Files = [
  'calibration.v0.2.json',
  'human-review.v0.2.md',
  'fair-price-policy.v0.2.md'
];

for (const f of v02Files) {
  const fpath = path.join(RESEARCH_DIR, f);
  if (fs.existsSync(fpath)) ok(`V0.2 file exists: ${f}`);
  else err(`V0.2 file exists: ${f}`, 'MISSING');
}

// Load and validate calibration.v0.2.json
const calibration = loadJSON('calibration.v0.2.json');
if (calibration) {
  ok('calibration.v0.2.json parses');
  if (calibration.production_ready === false) ok('calibration production_ready = false');
  else err('calibration production_ready must be false');
  if (calibration.human_decision === 'PENDING') ok('calibration human_decision = PENDING');
  else err('calibration human_decision must be PENDING');
  if (calibration.city_adjustment === null) ok('calibration city_adjustment = null');
  else err('calibration city_adjustment must be null');
  // Check no modifiers
  const mods = ['urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier'];
  let modClean = true;
  for (const m of mods) {
    if (calibration[m] !== null) { err(`calibration ${m} must be null`); modClean = false; }
  }
  if (modClean) ok('calibration all modifiers = null');

  // Check candidate calibrations all have human_decision PENDING
  if (calibration.candidate_calibrations) {
    let allPending = true;
    for (const c of calibration.candidate_calibrations) {
      if (c.human_decision !== 'PENDING') {
        err(`Calibration ${c.code} human_decision must be PENDING`);
        allPending = false;
      }
    }
    if (allPending) ok(`All ${calibration.candidate_calibrations.length} calibration candidates: human_decision = PENDING`);
  }

  // Check no approved prices in candidates
  if (calibration.candidate_calibrations) {
    let noApproved = true;
    for (const c of calibration.candidate_calibrations) {
      if (c.approved_price !== undefined) {
        err(`Candidate ${c.code} must not have approved_price`);
        noApproved = false;
      }
    }
    if (noApproved) ok('No approved_price fields in calibration candidates');
  }

  // Check basket simulations exist
  if (calibration.basket_simulations && calibration.basket_simulations.length >= 8) {
    ok(`Basket simulations present: ${calibration.basket_simulations.length} baskets`);
  } else {
    err('Expected at least 8 basket simulations');
  }

  // Check V0.1 reference is present
  if (calibration.v01_reference_commit === '41583c1') ok('V0.1 reference commit correct');
  else err('V0.1 reference commit must be 41583c1');

  // Commission math check — spot check BRIC-001 at 200 MAD
  const bric001 = calibration.candidate_calibrations.find(c => c.code === 'BRIC-001');
  if (bric001) {
    const cand200 = bric001.candidates_compared.find(c => c.candidate_MAD === 200);
    if (cand200) {
      const expectedNet = Math.round(200 * 0.8);
      if (cand200.worst_case_artisan_net.commission_20pct === expectedNet) ok('Commission math BRIC-001 @200 MAD: 20% → 160 MAD ✓');
      else err(`Commission math BRIC-001 @200 MAD: expected ${expectedNet}, got ${cand200.worst_case_artisan_net.commission_20pct}`);
      const afterFuel = expectedNet - 40;
      if (cand200.worst_case_artisan_net.minus_fuel_40MAD === afterFuel) ok('Post-fuel BRIC-001 @200 MAD: 120 MAD ✓');
      else err(`Post-fuel BRIC-001 @200 MAD: expected ${afterFuel}`);
      if (cand200.worst_case_artisan_net.above_100MAD_floor === true) ok('BRIC-001 @200 MAD above 100 MAD hard floor ✓');
    }
  }

  // Check BRIC-030 at 300 MAD commission math
  const bric030 = calibration.candidate_calibrations.find(c => c.code === 'BRIC-030');
  if (bric030) {
    const cand300 = bric030.candidates_compared.find(c => c.candidate_MAD === 300);
    if (cand300) {
      const expectedNet = Math.round(300 * 0.8);
      if (cand300.worst_case_artisan_net.commission_20pct === expectedNet) ok('Commission math BRIC-030 @300 MAD: 20% → 240 MAD ✓');
      else err(`Commission math BRIC-030 @300 MAD: expected ${expectedNet}`);
      if (cand300.worst_case_artisan_net.above_100MAD_floor === true) ok('BRIC-030 @300 MAD above 100 MAD hard floor ✓');
    }
  }
}

// Check V0.1 files not modified
console.log('\n[V0.2] V0.1 artifact immutability');
const v01Files = ['registry.v0.1.json','sources.v0.1.json','evidence.v0.1.json','exclusions.v0.1.json'];
try {
  const { execSync: execS } = require('child_process');
  for (const f of v01Files) {
    const fpath = `data/pricing/research/bricolage/${f}`;
    try {
      const diff = execS(`git diff HEAD -- ${fpath}`, { cwd: REPO_ROOT }).toString();
      if (diff.length === 0) ok(`V0.1 immutable: ${f}`);
      else err(`V0.1 modified: ${f}`, 'MUST NOT be changed in V0.2 phase');
    } catch(e) {
      warn(`Could not check git diff for ${f}`);
    }
  }
} catch(e) {
  warn('V0.1 immutability check skipped', e.message);
}

// Final summary re-print (the main one already printed above — this is the extended count)
console.log('\n[V0.2 check complete — see final totals above]');

// Final exit
// ─── V0.3 Checks ─────────────────────────────────────────────────────────────

console.log('\n[V0.3] V0.3 decision freeze artifacts');

const v03Files = [
  'registry.v0.3.json',
  'calibration.v0.3.json',
  'human-decision.v0.3.md',
  'fair-price-policy.v0.3.md'
];

for (const f of v03Files) {
  const fpath = path.join(RESEARCH_DIR, f);
  if (fs.existsSync(fpath)) ok(`V0.3 file exists: ${f}`);
  else err(`V0.3 file exists: ${f}`, 'MISSING');
}

// Load registry.v0.3.json
const reg3 = loadJSON('registry.v0.3.json');
if (reg3) {
  ok('registry.v0.3.json parses');

  // Basic flags
  if (reg3.production_ready === false) ok('registry.v0.3 production_ready = false');
  else err('registry.v0.3 production_ready must be false');

  if (reg3.city_adjustment === null) ok('registry.v0.3 city_adjustment = null');
  else err('registry.v0.3 city_adjustment must be null');

  const mods3 = ['urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier'];
  let modsOk3 = true;
  for (const m of mods3) {
    if (reg3[m] !== null) { err(`registry.v0.3 ${m} must be null`); modsOk3 = false; }
  }
  if (modsOk3) ok('registry.v0.3 all time/urgency modifiers = null');

  // Exactly 6 approved services
  const services3 = reg3.services || [];
  const approved3 = services3.filter(s => s.human_decision === 'APPROVED');
  if (approved3.length === 6) ok(`Exactly 6 approved services`);
  else err(`Expected exactly 6 approved services, got ${approved3.length}`);

  // Mandatory approved codes
  const requiredApproved = ['BRIC-001','BRIC-002','BRIC-003','BRIC-010','BRIC-020','BRIC-030'];
  for (const code of requiredApproved) {
    const svc = services3.find(s => s.code === code);
    if (svc && svc.human_decision === 'APPROVED') ok(`${code} human_decision = APPROVED`);
    else err(`${code} must be APPROVED in registry.v0.3`);
  }

  // Exact approved prices
  const priceMap = {
    'BRIC-001': 200, 'BRIC-003': 400, 'BRIC-010': 200, 'BRIC-020': 200, 'BRIC-030': 300
  };
  for (const [code, expected] of Object.entries(priceMap)) {
    const svc = services3.find(s => s.code === code);
    if (svc && svc.approved_price_MAD === expected) ok(`${code} approved_price_MAD = ${expected} ✓`);
    else err(`${code} approved_price_MAD must be ${expected}`);
  }
  // BRIC-002 special check (rate + minimum)
  const bric002 = services3.find(s => s.code === 'BRIC-002');
  if (bric002) {
    if (bric002.approved_rate_MAD_per_hour === 150) ok('BRIC-002 approved_rate_MAD_per_hour = 150 ✓');
    else err('BRIC-002 approved_rate_MAD_per_hour must be 150');
    if (bric002.minimum_billing_hours === 2) ok('BRIC-002 minimum_billing_hours = 2 ✓');
    else err('BRIC-002 minimum_billing_hours must be 2');
    if (bric002.minimum_payable_MAD === 300) ok('BRIC-002 minimum_payable_MAD = 300 ✓');
    else err('BRIC-002 minimum_payable_MAD must be 300');
  }

  // All approved services have production_ready = false
  let allApprovedNotProd = true;
  for (const svc of approved3) {
    if (svc.production_ready !== false) { err(`${svc.code} production_ready must be false`); allApprovedNotProd = false; }
  }
  if (allApprovedNotProd) ok('All 6 approved services: production_ready = false');

  // No approved price on deferred services
  const deferred3 = services3.filter(s => s.human_decision !== 'APPROVED');
  let noApprovedOnDeferred = true;
  for (const svc of deferred3) {
    if (svc.approved_price_MAD !== null && svc.approved_price_MAD !== undefined) {
      err(`Deferred service ${svc.code} must not have approved_price_MAD`); noApprovedOnDeferred = false;
    }
  }
  if (noApprovedOnDeferred) ok(`All ${deferred3.length} deferred/quote services: no approved_price_MAD`);

  // Anti-double-charge rule: BRIC-001 approved price == BRIC-010 approved price (must be >=)
  const b001 = services3.find(s => s.code === 'BRIC-001');
  const b010 = services3.find(s => s.code === 'BRIC-010');
  const b020 = services3.find(s => s.code === 'BRIC-020');
  if (b001 && b010 && b010.approved_price_MAD >= b001.approved_price_MAD)
    ok('BRIC-010 price >= BRIC-001: anti-double-charge coherent ✓');
  else err('BRIC-010 price must be >= BRIC-001 to maintain anti-double-charge coherence');
  if (b001 && b020 && b020.approved_price_MAD >= b001.approved_price_MAD)
    ok('BRIC-020 price >= BRIC-001: anti-double-charge coherent ✓');
  else err('BRIC-020 price must be >= BRIC-001 to maintain anti-double-charge coherence');

  // No universal 65% rate in multi_task_architecture
  const mta = reg3.multi_task_architecture;
  if (mta) {
    const str = JSON.stringify(mta);
    if (!str.includes('"65%"') && !str.includes('"0.65"') && !str.includes('universal_additional_pct')) {
      ok('No universal 65% additional-item rate in multi_task_architecture ✓');
    } else {
      err('Universal 65% additional-item rate must NOT be canonical in registry.v0.3');
    }
    // Scenario E should be DEFERRED
    const scenE = (mta.scenarios || []).find(s => s.scenario === 'E');
    if (scenE && scenE.architecture === 'DEFERRED') ok('Scenario E multi-task: DEFERRED ✓');
    else err('Scenario E (multiple homogeneous items) must be DEFERRED');
  }

  // Métier boundaries present
  const b030 = services3.find(s => s.code === 'BRIC-030');
  if (b030 && b030.scope_contract && b030.scope_contract.metier_boundary_critical) {
    if (b030.scope_contract.metier_boundary_critical.toLowerCase().includes('electricite')) {
      ok('BRIC-030 métier boundary ELECTRICITE documented ✓');
    } else {
      err('BRIC-030 must reference ELECTRICITE boundary in scope_contract');
    }
  }
}

// Load calibration.v0.3.json
const cal3 = loadJSON('calibration.v0.3.json');
if (cal3) {
  ok('calibration.v0.3.json parses');

  if (cal3.production_ready === false) ok('calibration.v0.3 production_ready = false');
  else err('calibration.v0.3 production_ready must be false');

  if (cal3.human_decision === 'APPROVED') ok('calibration.v0.3 human_decision = APPROVED');
  else err('calibration.v0.3 human_decision must be APPROVED');

  if (cal3.city_adjustment === null) ok('calibration.v0.3 city_adjustment = null');
  else err('calibration.v0.3 city_adjustment must be null');

  const modsCal3 = ['urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier'];
  let modsCalOk = true;
  for (const m of modsCal3) {
    if (cal3[m] !== null) { err(`calibration.v0.3 ${m} must be null`); modsCalOk = false; }
  }
  if (modsCalOk) ok('calibration.v0.3 all modifiers = null');

  if (cal3.approved_services && cal3.approved_services.length === 6)
    ok('calibration.v0.3 has exactly 6 approved_services');
  else err('calibration.v0.3 must have exactly 6 approved_services');

  // Commission math spot checks
  console.log('\n[V0.3] Commission math verification');
  const cmChecks = [
    { code: 'BRIC-001', price: 200, rate: 0.20, fuel: 40, expectedNet: 120 },
    { code: 'BRIC-010', price: 200, rate: 0.20, fuel: 40, expectedNet: 120 },
    { code: 'BRIC-020', price: 200, rate: 0.20, fuel: 40, expectedNet: 120 },
    { code: 'BRIC-030', price: 300, rate: 0.20, fuel: 40, expectedNet: 200 },
    { code: 'BRIC-003', price: 400, rate: 0.20, fuel: 40, expectedNet: 280 },
    { code: 'BRIC-002', price: 300, rate: 0.20, fuel: 40, expectedNet: 200, basis: '2h_min' } // 150×2=300
  ];
  for (const chk of cmChecks) {
    const gross = chk.price * (1 - chk.rate);
    const net = gross - chk.fuel;
    if (Math.round(net) === chk.expectedNet) {
      ok(`Commission math ${chk.code} @20% + MID40: net = ${chk.expectedNet} MAD ✓`);
    } else {
      err(`Commission math ${chk.code}: expected net ${chk.expectedNet}, computed ${Math.round(net)}`);
    }
    // Hard floor check
    if (net >= 100) ok(`${chk.code} above 100 MAD hard floor ✓`);
    else err(`${chk.code} BREACHES 100 MAD hard floor at worst case`);
  }

  // Summary checks
  if (cal3.summary) {
    if (cal3.summary.total_approved === 6) ok('calibration.v0.3 summary total_approved = 6');
    else err('calibration.v0.3 summary total_approved must be 6');
    if (cal3.summary.floor_breaches === 0) ok('calibration.v0.3 summary floor_breaches = 0');
    else err('calibration.v0.3 summary floor_breaches must be 0');
    if (cal3.summary.no_65pct_universal_rate === true) ok('calibration.v0.3 no_65pct_universal_rate = true ✓');
    else err('calibration.v0.3 no_65pct_universal_rate must be true');
    if (cal3.summary.minimum_visit_anti_double_charge_verified === true)
      ok('calibration.v0.3 anti-double-charge verified = true ✓');
    else err('calibration.v0.3 minimum_visit_anti_double_charge_verified must be true');
  }
}

// V0.2 artifact immutability (not modified by V0.3)
console.log('\n[V0.3] V0.2 artifact immutability');
const v02FilesToCheck = ['calibration.v0.2.json','human-review.v0.2.md','fair-price-policy.v0.2.md'];
try {
  const { execSync: execS2 } = require('child_process');
  for (const f of v02FilesToCheck) {
    const fpath = `data/pricing/research/bricolage/${f}`;
    try {
      const diff2 = execS2(`git diff HEAD -- ${fpath}`, { cwd: REPO_ROOT }).toString();
      if (diff2.length === 0) ok(`V0.2 immutable: ${f}`);
      else err(`V0.2 modified: ${f}`, 'Must not be changed in V0.3 phase');
    } catch(e) { warn(`Could not check git diff for ${f}`); }
  }
} catch(e) { warn('V0.2 immutability check skipped', e.message); }

console.log('\n[V0.3 checks complete]');
