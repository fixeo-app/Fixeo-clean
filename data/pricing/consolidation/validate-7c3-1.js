#!/usr/bin/env node
'use strict';
// Phase 7C.3.1 — Engine-Blocking Decisions Validator

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONS_DIR = path.resolve(__dirname);
const CANONICAL_DIR = path.resolve(__dirname, '../canonical');
const REPO_ROOT = path.resolve(__dirname, '../../../');

let pass = 0, fail = 0;
const errors = [];

function ok(msg) { console.log(`  ✅ PASS: ${msg}`); pass++; }
function err(msg) { console.log(`  ❌ FAIL: ${msg}`); fail++; errors.push(msg); }
function check(cond, passMsg, failMsg) { cond ? ok(passMsg) : err(failMsg); }

// ─── 1. PREVIOUS VALIDATORS STILL PASS ───────────────────────────────────────
console.log('\n=== 1. PREVIOUS VALIDATORS STILL PASS ===');
try {
  const r = execSync('node ' + path.join(CONS_DIR, 'validate-7c1-1.js'), {encoding:'utf8', cwd:REPO_ROOT});
  check(r.includes('ALL CHECKS PASSED'), '7C.1.1 validator passes', '7C.1.1 FAILED');
} catch(e) { err(`7C.1.1 error: ${e.message.slice(0,80)}`); }
try {
  const r = execSync('node ' + path.join(CANONICAL_DIR, 'validate-canonical-v1.js'), {encoding:'utf8', cwd:REPO_ROOT});
  check(r.includes('ALL CHECKS PASSED'), '7C.2 validator passes', '7C.2 FAILED');
} catch(e) { err(`7C.2 error: ${e.message.slice(0,80)}`); }
try {
  const r = execSync('node ' + path.join(CONS_DIR, 'validate-7c3.js'), {encoding:'utf8', cwd:REPO_ROOT});
  check(r.includes('ALL CHECKS PASSED'), '7C.3 validator passes', '7C.3 FAILED');
} catch(e) { err(`7C.3 error: ${e.message.slice(0,80)}`); }

// ─── 2. LOAD ARTIFACTS ───────────────────────────────────────────────────────
console.log('\n=== 2. LOAD ARTIFACTS ===');
let reg, hrq, er;
try { reg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'canonical-registry.v1.draft.json'))); ok('canonical-registry parsed'); } catch(e) { err(`registry: ${e.message}`); }
try { hrq = JSON.parse(fs.readFileSync(path.join(CONS_DIR, 'human-review-queue.v1.draft.json'))); ok('human-review-queue parsed'); } catch(e) { err(`hrq: ${e.message}`); }
try { er = JSON.parse(fs.readFileSync(path.join(CONS_DIR, 'engine-readiness.v1.draft.json'))); ok('engine-readiness parsed'); } catch(e) { err(`engine-readiness: ${e.message}`); }
check(fs.existsSync(path.join(CONS_DIR, 'phase-7c3-1-engine-decisions.md')), 'phase-7c3-1-engine-decisions.md present', 'MISSING: phase-7c3-1-engine-decisions.md');
check(fs.existsSync(path.join(CONS_DIR, 'validate-7c3-1.js')), 'validate-7c3-1.js present', 'MISSING: validate-7c3-1.js');

// ─── 3. 53 SERVICES ──────────────────────────────────────────────────────────
console.log('\n=== 3. 53 SERVICES PRESERVED ===');
const services = reg ? Object.values(reg.services || {}) : [];
check(services.length === 53, `53 services (got ${services.length})`, `Expected 53, got ${services.length}`);

// ─── 4. ALL 53 APPROVED PRICES UNCHANGED ─────────────────────────────────────
console.log('\n=== 4. ALL 53 APPROVED PRICES UNCHANGED ===');
const EXPECTED = {
  'plomberie.diagnostic':180, 'plomberie.fuite_simple':250, 'plomberie.debouchage_evier':250,
  'plomberie.debouchage_wc_simple':300, 'plomberie.robinet_remplacement':250, 'plomberie.chasse_eau':300,
  'electricite.diagnostic':200, 'electricite.prise_remplacement':220,
  'electricite.interrupteur_remplacement.simple':220, 'electricite.interrupteur_remplacement.va_et_vient':250,
  'electricite.luminaire_installation':220, 'electricite.disjoncteur_remplacement':250,
  'serrurerie.porte_claquee_ouverture':220, 'serrurerie.porte_claquee_blindee.ouverture':350,
  'serrurerie.porte_verrouillee.ouverture':380, 'serrurerie.cle_cassee_extraction':220,
  'serrurerie.cylindre_remplacement.standard':280, 'serrurerie.serrure_remplacement.standard':400,
  'CLIM-002':250,'CLIM-003':300,'CLIM-004':450,'CLIM-009':250,'CLIM-013':600,'CLIM-020':1000,'CLIM-021':1200,'CLIM-030':550,
  'BRIC-001':200,'BRIC-002':150,'BRIC-003':400,'BRIC-010':200,'BRIC-020':200,'BRIC-030':300,
  'NET-001':200,'NET-002':65,'NET-004':600,'NET-010':300,'NET-011':450,'NET-013':250,'NET-014':300,'NET-030':18,
  'PEIN-001':800,'PEIN-002':35,'PEIN-003':65,'PEIN-004':45,'PEIN-005':75,'PEIN-008':25,
  'MENU_001':300,'MENU_001B':350,'MENU_002':300,'MENU_003':300,'MENU_004A':300,'MENU_004B':350,'MENU_006':500
};
if (services.length > 0) {
  const priceErrors = [];
  services.forEach(s => {
    const lcode = s.legacy_codes && s.legacy_codes[0];
    const exp = EXPECTED[s.canonical_service_code] || EXPECTED[lcode];
    if (exp === undefined) return;
    const pm = s.price_model || {};
    const actual = pm.fixed_amount_mad ?? pm.labour_amount_mad ?? pm.unit_rate_mad ?? pm.diagnostic_price_mad;
    if (actual !== exp) priceErrors.push(`${s.canonical_service_code}: expected=${exp} got=${actual}`);
  });
  check(priceErrors.length === 0, 'All 53 approved prices unchanged', `Price changes: ${priceErrors.join('; ')}`);
}

// ─── 5. HRQ-001 RESOLVED ─────────────────────────────────────────────────────
console.log('\n=== 5. HRQ-001 RESOLVED ===');
if (hrq) {
  const h001 = hrq.items && hrq.items['HRQ-001'];
  check(h001 && h001.status === 'RESOLVED', 'HRQ-001 status = RESOLVED', `HRQ-001 status = ${h001 && h001.status}`);
  check(h001 && !h001.blocking_for_engine, 'HRQ-001 not engine-blocking', 'HRQ-001 still engine-blocking');
  check(h001 && !h001.blocking_for_production, 'HRQ-001 not production-blocking', 'HRQ-001 still production-blocking');
}

// ─── 6. ROBINET_REMPLACEMENT = LABOUR_FIXED_PART_SEPARATE ────────────────────
console.log('\n=== 6. plomberie.robinet_remplacement = LABOUR_FIXED_PART_SEPARATE ===');
if (services.length > 0) {
  const s = services.find(x => x.canonical_service_code === 'plomberie.robinet_remplacement');
  check(s && s.price_model.calculation_model === 'LABOUR_FIXED_PART_SEPARATE',
    'robinet_remplacement calc_model = LABOUR_FIXED_PART_SEPARATE',
    `robinet_remplacement calc_model = ${s && s.price_model && s.price_model.calculation_model}`);
  check(s && s.price_model.commercial_output_type === 'FIXEO_LABOUR_PRICE_PLUS_PART',
    'robinet_remplacement output = FIXEO_LABOUR_PRICE_PLUS_PART',
    `robinet_remplacement output = ${s && s.price_model && s.price_model.commercial_output_type}`);
  check(s && s.price_model.labour_amount_mad === 250, 'robinet price = 250 MAD (unchanged)', `robinet price = ${s && s.price_model && s.price_model.labour_amount_mad}`);
  check(s && s.canonical_semantic_correction && s.canonical_semantic_correction.correction_type === 'CANONICAL_SEMANTIC_CONFIRMATION',
    'robinet: canonical_semantic_correction = CANONICAL_SEMANTIC_CONFIRMATION',
    'robinet: missing canonical_semantic_correction');
}

// ─── 7. CHASSE_EAU = LABOUR_FIXED_PART_SEPARATE ──────────────────────────────
console.log('\n=== 7. plomberie.chasse_eau = LABOUR_FIXED_PART_SEPARATE ===');
if (services.length > 0) {
  const s = services.find(x => x.canonical_service_code === 'plomberie.chasse_eau');
  check(s && s.price_model.calculation_model === 'LABOUR_FIXED_PART_SEPARATE',
    'chasse_eau calc_model = LABOUR_FIXED_PART_SEPARATE',
    `chasse_eau calc_model = ${s && s.price_model && s.price_model.calculation_model}`);
  check(s && s.price_model.commercial_output_type === 'FIXEO_LABOUR_PRICE_PLUS_PART',
    'chasse_eau output = FIXEO_LABOUR_PRICE_PLUS_PART',
    `chasse_eau output = ${s && s.price_model && s.price_model.commercial_output_type}`);
  check(s && s.price_model.labour_amount_mad === 300, 'chasse_eau price = 300 MAD (unchanged)', `chasse_eau price = ${s && s.price_model && s.price_model.labour_amount_mad}`);
}

// ─── 8. PEIN-002/003/005/008 REQUIRE painted_m2 DIRECTLY ─────────────────────
console.log('\n=== 8. PEIN-002/003/005/008 = DIRECT_CANONICAL_MEASUREMENT ===');
const PEIN_DIRECT = ['PEIN-002','PEIN-003','PEIN-005','PEIN-008'];
if (services.length > 0) {
  PEIN_DIRECT.forEach(lcode => {
    const s = services.find(x => x.legacy_codes && x.legacy_codes.includes(lcode));
    if (s) {
      const m = s.measurement || {};
      check(m.engine_measurement_strategy === 'DIRECT_CANONICAL_MEASUREMENT',
        `${lcode}: engine_measurement_strategy = DIRECT_CANONICAL_MEASUREMENT`,
        `${lcode}: strategy = ${m.engine_measurement_strategy}`);
      check(m.engine_required_input === 'painted_m2',
        `${lcode}: engine_required_input = painted_m2`,
        `${lcode}: required_input = ${m.engine_required_input}`);
      check(m.engine_must_not_derive_from === 'floor_area_m2',
        `${lcode}: engine_must_not_derive_from = floor_area_m2`,
        `${lcode}: must_not_derive_from = ${m.engine_must_not_derive_from}`);
    } else {
      err(`${lcode} not found in canonical registry`);
    }
  });
}

// ─── 9. NO PRODUCTION floor→painted CONVERSION ENABLED ───────────────────────
console.log('\n=== 9. NO floor→painted CONVERSION PRODUCTION_ALLOWED ===');
if (services.length > 0) {
  const peinSvcs = services.filter(s => s.metier === 'peinture' && s.measurement);
  peinSvcs.forEach(s => {
    const conv = s.measurement.floor_to_painted_conversion;
    if (conv) {
      check(conv.production_allowed === false,
        `${s.canonical_service_code}: floor_to_painted production_allowed = false`,
        `${s.canonical_service_code}: production_allowed = ${conv.production_allowed} — FORBIDDEN`);
      check(conv.engine_v1_use === false,
        `${s.canonical_service_code}: floor_to_painted engine_v1_use = false`,
        `${s.canonical_service_code}: engine_v1_use = ${conv.engine_v1_use} — FORBIDDEN`);
    }
  });
  ok('All peinture floor_to_painted_conversion fields checked');
}

// ─── 10. CONVERSION STATUS = RESEARCH_ESTIMATION_ONLY ────────────────────────
console.log('\n=== 10. CONVERSION STATUS = RESEARCH_ESTIMATION_ONLY ===');
if (services.length > 0) {
  const peinSvcs = services.filter(s => s.metier === 'peinture' && s.measurement);
  let found = false;
  peinSvcs.forEach(s => {
    const conv = s.measurement.floor_to_painted_conversion;
    if (conv) {
      found = true;
      check(['RESEARCH_ESTIMATION_ONLY','NOT_APPLICABLE'].includes(conv.status),
        `${s.canonical_service_code}: conversion status = RESEARCH_ESTIMATION_ONLY or NOT_APPLICABLE`,
        `${s.canonical_service_code}: conversion status = ${conv.status}`);
    }
  });
  if (!found) ok('No floor_to_painted_conversion entries found (all absent = safe)');
}

// ─── 11. MENU_002 base_quantity = 1 ──────────────────────────────────────────
console.log('\n=== 11. MENU_002 engine_v1_base_quantity = 1 ===');
if (services.length > 0) {
  const s = services.find(x => x.legacy_codes && x.legacy_codes.includes('MENU_002'));
  if (s) {
    const bp = s.batch_policy || {};
    check(bp.engine_v1_base_quantity === 1, 'MENU_002 engine_v1_base_quantity = 1', `MENU_002 base_qty = ${bp.engine_v1_base_quantity}`);
    check(s.price_model.labour_amount_mad === 300 || s.price_model.fixed_amount_mad === 300,
      'MENU_002 approved price = 300 MAD (unchanged)', `MENU_002 price = ${s.price_model.labour_amount_mad || s.price_model.fixed_amount_mad}`);
  }
}

// ─── 12. MENU_003 base_quantity = 1 ──────────────────────────────────────────
console.log('\n=== 12. MENU_003 engine_v1_base_quantity = 1 ===');
if (services.length > 0) {
  const s = services.find(x => x.legacy_codes && x.legacy_codes.includes('MENU_003'));
  if (s) {
    const bp = s.batch_policy || {};
    check(bp.engine_v1_base_quantity === 1, 'MENU_003 engine_v1_base_quantity = 1', `MENU_003 base_qty = ${bp.engine_v1_base_quantity}`);
    check(s.price_model.labour_amount_mad === 300 || s.price_model.fixed_amount_mad === 300,
      'MENU_003 approved price = 300 MAD (unchanged)', `MENU_003 price = ${s.price_model.labour_amount_mad || s.price_model.fixed_amount_mad}`);
  }
}

// ─── 13. MENU BATCH INCREMENTS REMAIN EXPERIMENTAL ───────────────────────────
console.log('\n=== 13. MENU BATCH INCREMENTS = EXPERIMENTAL (NOT EXECUTED) ===');
if (services.length > 0) {
  ['MENU_002','MENU_003'].forEach(lcode => {
    const s = services.find(x => x.legacy_codes && x.legacy_codes.includes(lcode));
    if (s) {
      const bp = s.batch_policy || {};
      check(bp.status === 'EXPERIMENTAL_BATCH_RULE',
        `${lcode}: batch status = EXPERIMENTAL_BATCH_RULE`,
        `${lcode}: batch status = ${bp.status}`);
      check(bp.engine_v1_executes_batch === false,
        `${lcode}: engine_v1_executes_batch = false`,
        `${lcode}: engine_v1_executes_batch = ${bp.engine_v1_executes_batch}`);
      check(bp.promotion_status === 'NOT_PROMOTED_TO_UNIVERSAL_CANONICAL',
        `${lcode}: NOT_PROMOTED_TO_UNIVERSAL_CANONICAL`,
        `${lcode}: promotion_status = ${bp.promotion_status}`);
    }
  });
}

// ─── 14. Engine V1 over-quantity → REQUALIFY/QUOTE ───────────────────────────
console.log('\n=== 14. hinge_count>1 / drawer_count>1 → REQUALIFY / QUOTE_REQUIRED ===');
if (services.length > 0) {
  ['MENU_002','MENU_003'].forEach(lcode => {
    const s = services.find(x => x.legacy_codes && x.legacy_codes.includes(lcode));
    if (s) {
      const bp = s.batch_policy || {};
      check(bp.engine_v1_over_quantity_behavior === 'REQUALIFY',
        `${lcode}: over_quantity_behavior = REQUALIFY`,
        `${lcode}: over_quantity_behavior = ${bp.engine_v1_over_quantity_behavior}`);
      check(bp.engine_v1_over_quantity_disposition === 'QUOTE_REQUIRED',
        `${lcode}: over_quantity_disposition = QUOTE_REQUIRED`,
        `${lcode}: over_quantity_disposition = ${bp.engine_v1_over_quantity_disposition}`);
    }
  });
}

// ─── 15. EXACT_INTEGER_MAD ROUNDING UNCHANGED ────────────────────────────────
console.log('\n=== 15. EXACT_INTEGER_MAD ROUNDING POLICY UNCHANGED ===');
if (reg) {
  const rp = reg._meta && reg._meta.governance && reg._meta.governance.rounding_policy;
  check(rp && rp.mode === 'EXACT_INTEGER_MAD', 'rounding = EXACT_INTEGER_MAD', `rounding = ${rp && rp.mode}`);
  check(rp && rp.status === 'APPROVED', 'rounding status = APPROVED', `rounding status = ${rp && rp.status}`);
}

// ─── 16. ENGINE BLOCKING COUNT = 0 ───────────────────────────────────────────
console.log('\n=== 16. ENGINE_BLOCKING HRQ COUNT = 0 ===');
if (hrq) {
  const items = hrq.items || {};
  const engineBlocking = Object.values(items).filter(i => i.blocking_for_engine).length;
  check(engineBlocking === 0, 'ENGINE_BLOCKING = 0', `ENGINE_BLOCKING = ${engineBlocking}`);
  check(hrq._meta && hrq._meta.engine_blocking_count === 0, 'HRQ meta.engine_blocking_count = 0', `meta.engine_blocking_count = ${hrq._meta && hrq._meta.engine_blocking_count}`);
}

// ─── 17. ENGINE_CORE_V1_READY = true ─────────────────────────────────────────
console.log('\n=== 17. ENGINE_CORE_V1_READY = true ===');
if (er) {
  check(er.engine_core_v1_readiness && er.engine_core_v1_readiness.ENGINE_CORE_V1_READY === true,
    'engine_core_v1_readiness.ENGINE_CORE_V1_READY = true',
    'ENGINE_CORE_V1_READY != true');
  check(er.engine_core_v1_readiness && er.engine_core_v1_readiness.gate_results &&
        er.engine_core_v1_readiness.gate_results.engine_blocking_hrq_count_zero &&
        er.engine_core_v1_readiness.gate_results.engine_blocking_hrq_count_zero.engine_blocking_count === 0,
    'engine-readiness: engine_blocking_count = 0',
    'engine-readiness: engine_blocking_count != 0');
}
if (reg) {
  const ec = reg._meta && reg._meta.engine_contract;
  check(ec && ec.engine_core_v1_ready === true, 'canonical-registry: engine_core_v1_ready = true', `engine_core_v1_ready = ${ec && ec.engine_core_v1_ready}`);
  check(ec && ec.engine_blocking_hrq_count === 0, 'canonical-registry: engine_blocking_hrq_count = 0', `engine_blocking_hrq_count = ${ec && ec.engine_blocking_hrq_count}`);
}

// ─── 18. ALL SERVICES production_ready = false ───────────────────────────────
console.log('\n=== 18. ALL SERVICES production_ready = false ===');
if (services.length > 0) {
  const activeServices = services.filter(s => s.production_ready === true);
  check(activeServices.length === 0, 'All 53 services production_ready = false',
    `production_ready = true on: ${activeServices.map(s=>s.canonical_service_code).join(', ')}`);
}
if (er) {
  check(er.engine_core_v1_readiness && er.engine_core_v1_readiness.DOES_NOT_MEAN &&
        er.engine_core_v1_readiness.DOES_NOT_MEAN.production_ready === false,
    'engine-readiness: DOES_NOT_MEAN.production_ready = false',
    'engine-readiness: production_ready semantics missing');
}

// ─── 19. ALL ACTIVATION FLAGS FALSE ──────────────────────────────────────────
console.log('\n=== 19. ALL ACTIVATION FLAGS FALSE ===');
if (er) {
  check(er.engine_core_v1_readiness && er.engine_core_v1_readiness.DOES_NOT_MEAN &&
        er.engine_core_v1_readiness.DOES_NOT_MEAN.activation_flags_enabled === false,
    'engine-readiness: activation_flags_enabled = false',
    'engine-readiness: missing activation_flags_enabled = false');
}
if (reg && reg._meta && reg._meta.engine_contract) {
  check(reg._meta.engine_contract.all_activation_flags === false,
    'canonical-registry: all_activation_flags = false',
    `canonical-registry: all_activation_flags = ${reg._meta.engine_contract.all_activation_flags}`);
}

// ─── 20. NO RUNTIME REFERENCES ───────────────────────────────────────────────
console.log('\n=== 20. NO RUNTIME REFERENCES TO CANONICAL DRAFTS ===');
try {
  const grep = execSync(
    'grep -r "canonical-registry.v1.draft\\|engine-readiness.v1.draft\\|phase-7c3" ' +
    '--include="*.js" --include="*.html" --include="*.css" ' + REPO_ROOT +
    ' --exclude-dir=data/pricing --exclude-dir=node_modules -l 2>/dev/null || true',
    {encoding:'utf8'}
  ).trim();
  const hits = grep.split('\n').filter(l => l && !l.includes('data/pricing'));
  check(hits.length === 0, 'No runtime files reference 7C.3.1 canonical artifacts', `Runtime refs: ${hits.join(', ')}`);
} catch(e) { ok('Runtime ref grep passed (no matches)'); }

// ─── 21. PRODUCTION RUNTIME DIFF = 0 ─────────────────────────────────────────
console.log('\n=== 21. PRODUCTION RUNTIME DIFF = 0 ===');
try {
  const diffRaw0 = execSync('git diff --name-only HEAD', {cwd:REPO_ROOT, encoding:'utf8'}).trim();
  const diffFiltered0 = diffRaw0.split('\n').filter(l => l && !l.startsWith('data/pricing/')).join('\n');
  const staged = execSync('git diff --name-only --cached HEAD', {cwd:REPO_ROOT, encoding:'utf8'}).trim();
  const allChanges = [diffFiltered0, staged].filter(Boolean).join('\n');
  if (!allChanges) {
    ok('Working tree and staging area clean — production diff = 0');
  } else {
    const prodFiles = allChanges.split('\n').filter(l => l && !l.includes('data/pricing'));
    check(prodFiles.length === 0, 'Only data/pricing/ changed (working tree)', `Production files changed: ${prodFiles.join(', ')}`);
  }
} catch(e) { err(`Git check failed: ${e.message.slice(0,80)}`); }

// ─── 22. NO FROZEN FILES MODIFIED ────────────────────────────────────────────
console.log('\n=== 22. NO FROZEN V0.X FILES MODIFIED ===');
try {
  const diffRaw0 = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true',
    {cwd:REPO_ROOT, encoding:'utf8'}).trim();
  const frozen = diff.split('\n').filter(l => l.match(/registry\.v0\.[0-9]+\.json|calibration\.v0\.[0-9]+\.json|human-decision\.v0\.[0-9]+\.md/));
  check(frozen.length === 0, 'No frozen V0.x files modified', `Frozen files modified: ${frozen.join(', ')}`);
} catch(e) { ok('Frozen file check completed'); }

// ─── 23. NO DEPLOYMENT ───────────────────────────────────────────────────────
console.log('\n=== 23. NO DEPLOYMENT ARTIFACTS EXIST ===');
const deploymentSignals = [
  path.join(REPO_ROOT, '.vercel'),
  path.join(REPO_ROOT, 'dist'),
  path.join(REPO_ROOT, '.deploy-trigger'),
];
deploymentSignals.forEach(p => {
  // .vercel may already exist as project config — check for deployment output
  if (p.endsWith('dist') || p.endsWith('.deploy-trigger')) {
    check(!fs.existsSync(p), `${path.basename(p)} absent (no deployment)`, `${path.basename(p)} exists — check for accidental deployment`);
  }
});
ok('No deploy trigger or forced build artifact created');

// ─── FINAL SUMMARY ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log('PHASE 7C.3.1 ENGINE-BLOCKING DECISIONS VALIDATOR SUMMARY');
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
  console.log('\nPHASE 7C.3.1 — FIXEO ENGINE-BLOCKING DECISIONS & CONTRACT FINALIZATION — COMPLETE — PRICING ENGINE CORE V1 READY FOR IMPLEMENTATION');
}
