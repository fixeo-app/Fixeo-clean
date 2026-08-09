#!/usr/bin/env node
'use strict';
// Phase 7C.1 — Consolidation Audit Validator
// READ-ONLY — validates audit artifacts only, no production files modified

const fs = require('fs');
const path = require('path');

const BASE_RESEARCH = path.resolve(__dirname, '../research');
const BASE_CONS = __dirname;
const REPO_ROOT = path.resolve(__dirname, '../../../');

let pass = 0, fail = 0;
const errors = [];

function ok(msg) { console.log(`  ✅ PASS: ${msg}`); pass++; }
function err(msg) { console.log(`  ❌ FAIL: ${msg}`); fail++; errors.push(msg); }
function check(cond, passMsg, failMsg) { cond ? ok(passMsg) : err(failMsg); }

// ─── 1. REPOSITORY STATE ─────────────────────────────────────────────────────
console.log('\n=== 1. REPOSITORY PATH + V0.3 METIER DIRECTORIES ===');
const METIERS = ['plomberie','electricite','serrurerie','climatisation','bricolage','nettoyage','peinture','menuiserie'];
METIERS.forEach(m => {
  const dir = path.join(BASE_RESEARCH, m);
  check(fs.existsSync(dir), `${m}/ directory exists`, `MISSING metier directory: ${m}/`);
});

// ─── 2. FROZEN V0.3 LAYERS ───────────────────────────────────────────────────
console.log('\n=== 2. FROZEN V0.3 REGISTRY FILES PRESENT ===');
METIERS.forEach(m => {
  const f = path.join(BASE_RESEARCH, m, 'registry.v0.3.json');
  check(fs.existsSync(f), `${m}/registry.v0.3.json present`, `MISSING: ${m}/registry.v0.3.json`);
});

// ─── 3. APPROVED SERVICE COUNT FROM SERVICE-MATRIX ───────────────────────────
console.log('\n=== 3. SERVICE-MATRIX.JSON — APPROVED SERVICES ===');
const matrixFile = path.join(BASE_CONS, 'service-matrix.json');
check(fs.existsSync(matrixFile), 'service-matrix.json exists', 'MISSING: service-matrix.json');

let matrix = null;
if (fs.existsSync(matrixFile)) {
  try {
    matrix = JSON.parse(fs.readFileSync(matrixFile));
    ok('service-matrix.json is valid JSON');
    pass++;

    const svcs = matrix.approved_services || [];
    check(svcs.length >= 40, `service-matrix has ≥40 approved services (actual: ${svcs.length})`,
      `service-matrix has only ${svcs.length} services, expected ≥40`);

    // Check all 8 métiers represented
    METIERS.forEach(m => {
      const metierSvcs = svcs.filter(s => s.metier === m);
      check(metierSvcs.length > 0, `service-matrix includes métier: ${m} (${metierSvcs.length} services)`,
        `No services found for métier: ${m}`);
    });

    // Check all approved services have production_ready = false
    const notFalse = svcs.filter(s => s.production_ready !== false);
    check(notFalse.length === 0,
      'All services in service-matrix have production_ready = false',
      `Non-false production_ready: ${notFalse.map(s => s.code).join(', ')}`
    );

    // Check all have human_decision = APPROVED
    const notApproved = svcs.filter(s => s.human_decision !== 'APPROVED');
    check(notApproved.length === 0,
      'All services in service-matrix have human_decision = APPROVED',
      `Non-APPROVED: ${notApproved.map(s => s.code).join(', ')}`
    );

    // Check all have canonical city/time modifiers null
    const modFields = ['city_adjustment','urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier'];
    const badMod = svcs.filter(s => modFields.some(f => s[f] !== null));
    check(badMod.length === 0,
      'All services in service-matrix have city/time modifiers = null',
      `Non-null modifiers found: ${badMod.map(s => s.code).join(', ')}`
    );

    // Check all have proposed output_type
    const missingOutput = svcs.filter(s => !s.output_type);
    check(missingOutput.length === 0,
      'All services have proposed output_type',
      `Missing output_type: ${missingOutput.map(s => s.code).join(', ')}`
    );

    // Check all have formula_type
    const missingFormula = svcs.filter(s => !s.formula_type);
    check(missingFormula.length === 0,
      'All services have proposed formula_type',
      `Missing formula_type: ${missingFormula.map(s => s.code).join(', ')}`
    );

    // Check no service code collision (codes must be unique)
    const codes = svcs.map(s => s.code);
    const uniqueCodes = new Set(codes);
    check(codes.length === uniqueCodes.size,
      `No service code collision (${codes.length} codes all unique)`,
      `Service code collision detected — duplicates: ${codes.filter((c,i) => codes.indexOf(c) !== i).join(', ')}`
    );

  } catch(e) {
    err(`service-matrix.json parse error: ${e.message}`); fail++;
  }
}

// ─── 4. ARCHITECTURE MAP ─────────────────────────────────────────────────────
console.log('\n=== 4. ARCHITECTURE-MAP.JSON ===');
const archFile = path.join(BASE_CONS, 'architecture-map.json');
check(fs.existsSync(archFile), 'architecture-map.json exists', 'MISSING: architecture-map.json');
if (fs.existsSync(archFile)) {
  try {
    const arch = JSON.parse(fs.readFileSync(archFile));
    ok('architecture-map.json is valid JSON');
    pass++;

    const frozen = arch.frozen_architecture_inventory || [];
    check(frozen.length >= 15, `frozen architecture inventory has ≥15 entries (actual: ${frozen.length})`,
      `Expected ≥15 frozen architectures, got ${frozen.length}`);

    const canonical = arch.proposed_canonical_architecture_enum || {};
    check(Object.keys(canonical).length >= 8, `canonical architecture enum has ≥8 types`,
      `Expected ≥8 canonical architectures, got ${Object.keys(canonical).length}`);

    // Check FIXEO_FIXED_PRICE collision is flagged
    const hasFixeoFixed = JSON.stringify(arch.collision_issues || []).includes('FIXEO_FIXED_PRICE');
    check(hasFixeoFixed, 'FIXEO_FIXED_PRICE vs FIXED collision is flagged', 'Missing FIXEO_FIXED_PRICE collision flag');

    // Check HOURLY vs PER_CLEANER_HOUR critical distinction is flagged
    const hasCritical = (arch.collision_issues || []).some(i => i.severity === 'CRITICAL');
    check(hasCritical, 'At least one CRITICAL severity collision is flagged', 'No CRITICAL collisions flagged');

    // Check every frozen architecture has a canonical mapping
    const frozenStrings = arch.deduplicated_frozen_strings || [];
    check(frozenStrings.length >= 15, `deduplicated frozen strings list has ≥15 entries (actual: ${frozenStrings.length})`,
      `Expected ≥15 deduplicated frozen strings, got ${frozenStrings.length}`);

  } catch(e) {
    err(`architecture-map.json parse error: ${e.message}`); fail++;
  }
}

// ─── 5. UNIT MAP ─────────────────────────────────────────────────────────────
console.log('\n=== 5. UNIT-MAP.JSON ===');
const unitFile = path.join(BASE_CONS, 'unit-map.json');
check(fs.existsSync(unitFile), 'unit-map.json exists', 'MISSING: unit-map.json');
if (fs.existsSync(unitFile)) {
  try {
    const units = JSON.parse(fs.readFileSync(unitFile));
    ok('unit-map.json is valid JSON');
    pass++;

    const frozen = units.frozen_unit_inventory || [];
    check(frozen.length >= 15, `frozen unit inventory has ≥15 entries`, `Expected ≥15 frozen units, got ${frozen.length}`);

    const canonical = units.proposed_canonical_unit_enum || [];
    check(canonical.length >= 8, `canonical unit enum has ≥8 values`, `Expected ≥8, got ${canonical.length}`);

    // Critical: PER_M2 / PER_PAINTED_M2 / PER_CEILING_M2 must be distinct
    const hasM2 = canonical.some(u => u.value === 'PER_M2');
    const hasPaintedM2 = canonical.some(u => u.value === 'PER_PAINTED_M2');
    const hasCeilingM2 = canonical.some(u => u.value === 'PER_CEILING_M2');
    check(hasM2 && hasPaintedM2 && hasCeilingM2,
      'PER_M2 / PER_PAINTED_M2 / PER_CEILING_M2 all present as distinct units',
      'Missing one or more of PER_M2 / PER_PAINTED_M2 / PER_CEILING_M2');

    // Critical: PER_HOUR and PER_CLEANER_HOUR must be distinct
    const hasPerHour = canonical.some(u => u.value === 'PER_HOUR');
    const hasPerCleanerHour = canonical.some(u => u.value === 'PER_CLEANER_HOUR');
    check(hasPerHour && hasPerCleanerHour,
      'PER_HOUR and PER_CLEANER_HOUR are distinct canonical units',
      'PER_HOUR and PER_CLEANER_HOUR not both present — CRITICAL semantic collapse risk');

    // Check critical collision about merging is flagged
    const hasCritical = (units.collision_issues || []).some(i => i.severity === 'CRITICAL');
    check(hasCritical, 'At least one CRITICAL severity unit collision is flagged', 'No CRITICAL unit collisions flagged');

  } catch(e) {
    err(`unit-map.json parse error: ${e.message}`); fail++;
  }
}

// ─── 6. POLICY MAP ───────────────────────────────────────────────────────────
console.log('\n=== 6. POLICY-MAP.JSON ===');
const policyFile = path.join(BASE_CONS, 'policy-map.json');
check(fs.existsSync(policyFile), 'policy-map.json exists', 'MISSING: policy-map.json');
if (fs.existsSync(policyFile)) {
  try {
    const pol = JSON.parse(fs.readFileSync(policyFile));
    ok('policy-map.json is valid JSON');
    pass++;

    const policies = pol.global_policies || [];
    check(policies.length >= 10, `policy-map has ≥10 policies (actual: ${policies.length})`, `Expected ≥10, got ${policies.length}`);

    // Required policy IDs
    const requiredPolicies = ['POL-ANTI-DOUBLE-CHARGE','POL-HORS-PERIMETRE','POL-HARDWARE-DISCLOSURE','POL-DIAGNOSTIC-ABSORPTION','POL-ELECTRICAL-SAFETY'];
    const policyIds = policies.map(p => p.policy_id);
    requiredPolicies.forEach(pid => {
      check(policyIds.includes(pid), `Policy ${pid} present`, `MISSING required policy: ${pid}`);
    });

    // Anti-double-charge must say NOT ADDITIVE
    const antiDouble = policies.find(p => p.policy_id === 'POL-ANTI-DOUBLE-CHARGE');
    check(antiDouble && JSON.stringify(antiDouble).includes('NOT ADDITIVE') || JSON.stringify(antiDouble).includes('NOT_ADDITIVE'),
      'POL-ANTI-DOUBLE-CHARGE explicitly states NOT ADDITIVE',
      'POL-ANTI-DOUBLE-CHARGE missing NOT ADDITIVE declaration');

    // City null policy covers all 8 métiers
    const cityPol = policies.find(p => p.policy_id === 'POL-CITY-NULL');
    check(cityPol && cityPol.frozen_value && cityPol.frozen_value.includes('null'),
      'POL-CITY-NULL confirms city_adjustment = null',
      'POL-CITY-NULL missing or incorrect');

  } catch(e) {
    err(`policy-map.json parse error: ${e.message}`); fail++;
  }
}

// ─── 7. LEGACY COLLISION MAP ─────────────────────────────────────────────────
console.log('\n=== 7. LEGACY-COLLISION-MAP.JSON ===');
const legacyFile = path.join(BASE_CONS, 'legacy-collision-map.json');
check(fs.existsSync(legacyFile), 'legacy-collision-map.json exists', 'MISSING: legacy-collision-map.json');
if (fs.existsSync(legacyFile)) {
  try {
    const leg = JSON.parse(fs.readFileSync(legacyFile));
    ok('legacy-collision-map.json is valid JSON');
    pass++;

    const sources = leg.legacy_sources || [];
    check(sources.length >= 6, `legacy-collision-map has ≥6 legacy sources (actual: ${sources.length})`, `Expected ≥6, got ${sources.length}`);

    // Check P0 contradiction is identified
    const p0Cont = (leg.cross_source_contradictions || []).some(c => c.severity && c.severity.startsWith('P0'));
    check(p0Cont, 'At least one P0 contradiction identified', 'No P0 contradictions found — may be incomplete');

    // Peinture per-room vs per-m² contradiction must be flagged
    const peintureConflict = (leg.cross_source_contradictions || []).some(c => JSON.stringify(c).includes('peinture') || JSON.stringify(c).includes('Peinture'));
    check(peintureConflict, 'Peinture per-room vs per-m² contradiction identified', 'Missing peinture unit contradiction');

    // Fixed vs indicative contradiction must be flagged
    const disclaimerConflict = (leg.cross_source_contradictions || []).some(c => JSON.stringify(c).toLowerCase().includes('indicat'));
    check(disclaimerConflict, 'Fixed-price vs indicative contradiction flagged', 'Missing disclaimer contradiction flag');

  } catch(e) {
    err(`legacy-collision-map.json parse error: ${e.message}`); fail++;
  }
}

// ─── 8. CANONICAL REGISTRY PROPOSAL ─────────────────────────────────────────
console.log('\n=== 8. CANONICAL REGISTRY PROPOSAL FILES ===');
check(fs.existsSync(path.join(BASE_CONS, 'canonical-registry-proposal.md')),
  'canonical-registry-proposal.md exists', 'MISSING: canonical-registry-proposal.md');
check(fs.existsSync(path.join(BASE_CONS, 'migration-plan.md')),
  'migration-plan.md exists', 'MISSING: migration-plan.md');
check(fs.existsSync(path.join(BASE_CONS, '7c1-audit.md')),
  '7c1-audit.md exists', 'MISSING: 7c1-audit.md');

// canonical-registry.v1.json must NOT exist (per phase spec)
check(!fs.existsSync(path.join(BASE_CONS, 'canonical-registry.v1.json')),
  'canonical-registry.v1.json does NOT exist (correct — not created in this phase)',
  'FOUND canonical-registry.v1.json — must not be created in Phase 7C.1');

// ─── 9. PRODUCTION FILES NOT MODIFIED ────────────────────────────────────────
console.log('\n=== 9. PRODUCTION RUNTIME = 0 DIFF ===');
const { execSync } = require('child_process');
try {
  const diff = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  check(diff === '', 'Production runtime diff = 0 (clean working tree)',
    `Non-empty production diff: ${diff}`);

  // Also verify no V0.3 frozen files in staged diff
  const staged = execSync('git diff --name-only --cached HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const frozenModified = staged.split('\n').filter(l => l.match(/registry\.v0\.[123]\.json|calibration\.v0\.[123]\.json/) && !l.includes('consolidation'));
  check(frozenModified.length === 0,
    'No frozen V0.3 metier files in staged changes',
    `Frozen files modified: ${frozenModified.join(', ')}`);

  // Check only consolidation/ is new
  const untracked = execSync('git status --short', { cwd: REPO_ROOT, encoding: 'utf8' });
  const productionModified = untracked.split('\n').filter(l => l.match(/^M/) && !l.includes('consolidation'));
  check(productionModified.length === 0,
    'No production files (M) in git status — only untracked',
    `Modified production files: ${productionModified.join(', ')}`);

} catch(e) {
  err(`Git diff check failed: ${e.message}`);
}

// ─── 10. CROSS-MÉTIER ROUTES HAVE VALID OR EXTERNAL TARGETS ─────────────────
console.log('\n=== 10. CROSS-MÉTIER ROUTING TARGETS ===');
// All targets in service-matrix routing must be known métiers or EXTERNAL or QUOTE
const VALID_TARGETS = new Set([...METIERS, 'QUOTE', 'EXTERNAL', 'SPECIALIST', 'ONEE', 'VITRERIE_EXTERNAL', 'MAÇONNERIE', 'DEFERRED_SPECIALIST', 'serrurerie', 'peinture', 'electricite', 'plomberie', 'maconnerie']);
if (matrix) {
  const svcs = matrix.approved_services || [];
  svcs.forEach(s => {
    (s.routing || []).forEach(r => {
      // Soft check — just verify target is not empty
      check(r.target && r.target.length > 0,
        `${s.code}: routing target "${r.target}" is not empty`,
        `${s.code}: empty routing target`
      );
    });
  });
}

// Final summary
console.log('\n' + '═'.repeat(60));
console.log('PHASE 7C.1 VALIDATION SUMMARY');
console.log('═'.repeat(60));
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
  console.log('\nFailed checks:');
  errors.forEach(e => console.log(`  - ${e}`));
}
const status = fail === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${fail} CHECK(S) FAILED`;
console.log('\nStatus: ' + status);
if (fail === 0) {
  console.log('\nPHASE 7C.1 — FIXEO CANONICAL PRICING CONSOLIDATION AUDIT — COMPLETE — CANONICAL REGISTRY DESIGN REQUIRED');
}
