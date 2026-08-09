'use strict';
/**
 * FIXEO Pricing Engine — Phase 7C.5.1 Validator
 * Post-Shadow Freeze & Legacy Runtime Conflict Audit
 *
 * 20 checks as specified. DORMANT. No production modification.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '../../../');
let pass = 0, fail = 0;
const errors = [];

function check(condition, label, hint) {
  if (condition) { pass++; process.stdout.write('  \u2705 ' + label + '\n'); }
  else           { fail++; errors.push(label + (hint ? ': ' + hint : '')); process.stdout.write('  \u274c FAIL: ' + label + (hint ? ' \u2014 ' + hint : '') + '\n'); }
}

function runValidator(file, minPass, label) {
  try {
    const out = execSync('node ' + file, { cwd: REPO, encoding: 'utf8' });
    const m = out.match(/^\s*PASS:\s*(\d+)/m);
    const p = m ? parseInt(m[1]) : 0;
    const anyFail = out.match(/FAIL:\s*[1-9]/);
    check(!anyFail && p >= minPass, label + ' \u2265 ' + minPass + ' PASS (got ' + p + ')',
      anyFail ? 'Validator has failures' : p < minPass ? 'Pass count too low' : null);
  } catch(e) {
    check(false, label, e.message.slice(0, 80));
  }
}

const SEP = '\u2550'.repeat(63);
console.log('\n' + SEP);
console.log('FIXEO PRICING ENGINE \u2014 PHASE 7C.5.1 VALIDATOR');
console.log('Post-Shadow Freeze & Legacy Runtime Conflict Audit');
console.log(SEP + '\n');

// ── CHECK 1: All prior validators pass ──────────────────────────────────────
console.log('[1] All prior validators pass');
runValidator('data/pricing/consolidation/validate-7c1-1.js', 91,  '7C.1.1');
runValidator('data/pricing/canonical/validate-canonical-v1.js', 130, '7C.2');
runValidator('data/pricing/consolidation/validate-7c3.js', 92,  '7C.3');
runValidator('data/pricing/consolidation/validate-7c3-1.js', 77,  '7C.3.1');
runValidator('data/pricing/engine/pricing-engine-validator-v1.js', 664, 'Engine schema');
runValidator('data/pricing/engine/tests/engine-tests-v1.js', 209, 'Engine tests');
runValidator('data/pricing/shadow/shadow-validator-v1.js', 24, 'Shadow validator');
runValidator('data/pricing/engine/tests/regression-7c5-v1.js', 49, 'Regression 7C.5');

// ── CHECK 2: 53 services unchanged ─────────────────────────────────────────
console.log('\n[2] 53 canonical services unchanged');
try {
  const reg = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/canonical/canonical-registry.v1.draft.json')));
  const count = Object.keys(reg.services).length;
  check(count === 53, '53 canonical services in registry (actual: ' + count + ')');
} catch(e) { check(false, '53 canonical services', e.message); }

// ── CHECK 3: Approved prices unchanged ─────────────────────────────────────
console.log('\n[3] Approved prices unchanged (spot check critical services)');
try {
  const { evaluateFixeoPrice } = require('../engine/pricing-engine-core-v1');
  const priceChecks = [
    ['plomberie.diagnostic',                {},                          180, 'plomberie diagnostic 180'],
    ['electricite.diagnostic',              {},                          200, 'electricite diagnostic 200'],
    ['climatisation.diagnostic',            {},                          250, 'climatisation diagnostic 250'],
    ['serrurerie.porte_claquee_ouverture',  {},                          220, 'serrurerie porte_claquee 220'],
    ['bricolage.montage_meuble',            { item_count: 1 },           200, 'BRIC-010 x1 200'],
    ['bricolage.montage_meuble',            { item_count: 2 },           400, 'BRIC-010 x2 400'],
    ['bricolage.fixation_accrochage',       { item_count: 1 },           200, 'BRIC-020 x1 200'],
    ['bricolage.fixation_accrochage',       { item_count: 2 },           400, 'BRIC-020 x2 400'],
    ['peinture.mur_interieur.all_in',       { painted_m2: 15 },          975, 'peinture all_in 15m2 975'],
    ['peinture.mur_interieur.all_in',       { painted_m2: 10 },          800, 'peinture all_in 10m2 floor 800'],
    ['bricolage.horaire',                   { hours: 2 },                300, 'bricolage horaire 2hr 300'],
    ['nettoyage.menage_standard',           { hours: 1, worker_count: 1 }, 200, 'nettoyage menage 1w 1h floor 200'],
  ];
  priceChecks.forEach(function(c) {
    var r = evaluateFixeoPrice({ service_code: c[0], inputs: c[1] });
    check(r.ok && r.pricing.final_amount_mad === c[2], c[3] + ' → ' + c[2] + ' MAD',
      r.ok ? 'got ' + r.pricing.final_amount_mad : (r.error && r.error.code) || 'not ok');
  });
} catch(e) { check(false, 'Approved price spot checks', e.message); }

// ── CHECK 4: 195 shadow scenarios still pass ─────────────────────────────────
console.log('\n[4] 195 shadow scenarios pass');
try {
  const { report } = require('./shadow-runner-v1');
  const s = report.summary;
  check(s.total_scenarios === 195, '195 scenarios (actual: ' + s.total_scenarios + ')');
  check(s.failed === 0, 'Shadow FAIL = 0 (actual: ' + s.failed + ')');
  check(s.shadow_validation_ready === true, 'SHADOW_VALIDATION_READY = true');
} catch(e) { check(false, 'Shadow runner', e.message); }

// ── CHECK 5: Shadow fail = 0 (covered above in check 4) ─────────────────────

// ── CHECK 6: Freeze manifest hashes exist ────────────────────────────────────
console.log('\n[5] Shadow freeze manifest');
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/shadow/shadow-freeze-manifest.v1.json')));
  var h = manifest.hashes;
  check(h && h.canonical_registry_hash && h.canonical_registry_hash.length === 64, 'canonical_registry_hash exists (SHA-256)');
  check(h && h.canonical_inputs_hash && h.canonical_inputs_hash.length === 64, 'canonical_inputs_hash exists');
  check(h && h.shadow_scenarios_hash && h.shadow_scenarios_hash.length === 64, 'shadow_scenarios_hash exists');
  check(h && h.golden_fixtures_hash && h.golden_fixtures_hash.length === 64, 'golden_fixtures_hash exists');
  check(manifest.git_commit && manifest.git_commit.length === 40, 'git_commit recorded in manifest');
  check(manifest.production_active === false, 'production_active = false in manifest');
  check(manifest.service_count === 53, 'service_count = 53 in manifest');
  // Verify canonical_registry_hash is still valid (file not changed since manifest)
  var currentHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, 'data/pricing/canonical/canonical-registry.v1.draft.json'))).digest('hex');
  check(currentHash === h.canonical_registry_hash, 'canonical_registry_hash matches current file', currentHash !== h.canonical_registry_hash ? 'hash mismatch — registry was modified after freeze!' : null);
} catch(e) { check(false, 'Freeze manifest', e.message); }

// ── CHECK 7: Git commit recorded correctly ─────────────────────────────────
console.log('\n[6] Git commit');
try {
  var currentHead = execSync('git rev-parse HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  var manifest2 = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/shadow/shadow-freeze-manifest.v1.json')));
  check(manifest2.git_commit === currentHead, 'Manifest git_commit matches current HEAD', manifest2.git_commit !== currentHead ? 'mismatch' : null);
} catch(e) { check(false, 'Git commit check', e.message); }

// ── CHECK 8-12: Regression protection ──────────────────────────────────────
console.log('\n[7] Regression protection (BRIC-010, BRIC-020, hard-exclusion, zero-qty, MCB)');
try {
  var { evaluateFixeoPrice: efp } = require('../engine/pricing-engine-core-v1');
  // BRIC-010
  var b10 = efp({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 2 } });
  check(b10.ok && b10.pricing.final_amount_mad === 400 && b10.pricing.calculation_model === 'UNIT_MULTIPLICATION',
    'BRIC-010: x2 items = 400 MAD, model=UNIT_MULTIPLICATION');
  var b10z = efp({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 0 } });
  check(!b10z.ok && b10z.error && b10z.error.code === 'NEGATIVE_QUANTITY', 'BRIC-010: item_count=0 → NEGATIVE_QUANTITY');
  // BRIC-020
  var b20 = efp({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 2 } });
  check(b20.ok && b20.pricing.final_amount_mad === 400 && b20.pricing.calculation_model === 'UNIT_MULTIPLICATION',
    'BRIC-020: x2 items = 400 MAD, model=UNIT_MULTIPLICATION');
  // Hard exclusion
  var excl = efp({ service_code: 'electricite.disjoncteur_remplacement', inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: true } });
  check(!excl.ok && excl.qualification && excl.qualification.status === 'STOP_SAFETY', 'Hard exclusion: burning_smell=true → STOP_SAFETY');
  var safe = efp({ service_code: 'electricite.disjoncteur_remplacement', inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: false } });
  check(safe.ok && safe.pricing.final_amount_mad === 250, 'Hard exclusion: burning_smell=false → 250 MAD (no false positive)');
  // Zero quantity
  var zeroAc = efp({ service_code: 'climatisation.entretien_annuel', inputs: { ac_count: 0 } });
  check(!zeroAc.ok && zeroAc.error && zeroAc.error.code === 'NEGATIVE_QUANTITY', 'Zero-qty: ac_count=0 → NEGATIVE_QUANTITY');
  var zeroH = efp({ service_code: 'bricolage.horaire', inputs: { hours: 0 } });
  check(!zeroH.ok && zeroH.error && zeroH.error.code === 'NEGATIVE_QUANTITY', 'Zero-qty: hours=0 → NEGATIVE_QUANTITY');
  // MCB type
  var mcbBool = efp({ service_code: 'electricite.disjoncteur_remplacement', inputs: { mcb_defect_confirmed: true, distributor_equipment_involved: false } });
  check(!mcbBool.ok && mcbBool.error && mcbBool.error.code === 'INVALID_INPUT_TYPE', 'MCB: boolean=true → INVALID_INPUT_TYPE');
  var mcbStr = efp({ service_code: 'electricite.disjoncteur_remplacement', inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: false } });
  check(mcbStr.ok, 'MCB: string=physically_broken → no type error');
} catch(e) { check(false, 'Regression protection', e.message); }

// ── CHECK 13: Legacy sources classified ────────────────────────────────────
console.log('\n[8] Legacy runtime sources classified');
try {
  var cm = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/shadow/legacy-runtime-conflict-matrix.v1.json')));
  check(cm.legacy_sources && cm.legacy_sources.length === 4, '4 legacy sources documented');
  var files = cm.legacy_sources.map(function(s) { return s.file; });
  check(files.includes('js/fixeo-estimation-engine-v1.js'), 'fixeo-estimation-engine-v1.js classified');
  check(files.includes('js/fixeo-pricing-marocain.js'), 'fixeo-pricing-marocain.js classified');
  check(files.includes('js/reservation.js'), 'reservation.js classified');
  check(files.includes('js/reservation-v2.js'), 'reservation-v2.js classified');
  var p0Count = cm.migration_priorities && cm.migration_priorities.P0 ? cm.migration_priorities.P0.length : 0;
  check(p0Count >= 2, 'P0 conflicts documented (' + p0Count + ')');
} catch(e) { check(false, 'Legacy sources classification', e.message); }

// ── CHECK 14: Peinture contradiction documented ─────────────────────────────
console.log('\n[9] Peinture P0 contradiction documented');
try {
  var cm2 = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/shadow/legacy-runtime-conflict-matrix.v1.json')));
  var pc = cm2.peinture_contradiction;
  check(pc && pc.reservation_js_value && pc.reservation_js_value.from === 800, 'reservation.js Peinture 800 documented');
  check(pc && pc.reservation_v2_js_value && pc.reservation_v2_js_value.from === 20, 'reservation-v2.js Peinture 20 documented');
  check(pc && pc.contradiction_analysis && pc.contradiction_analysis.severity === 'P0_ACTIVE_CLIENT_FACING', 'P0_ACTIVE_CLIENT_FACING severity confirmed');
  check(pc && pc.contradiction_analysis && pc.contradiction_analysis.client_reachability && pc.contradiction_analysis.client_reachability.both_on_same_pages === true, 'Both values confirmed client-reachable simultaneously');
} catch(e) { check(false, 'Peinture contradiction', e.message); }

// ── CHECK 15: No legacy source used by new engine ──────────────────────────
console.log('\n[10] No legacy source used by new engine');
try {
  var engineSrc = fs.readFileSync(path.join(REPO, 'data/pricing/engine/pricing-engine-core-v1.js'), 'utf8');
  var legacyRefs = ['fixeo-estimation-engine', 'fixeo-pricing-marocain', 'reservation.js', 'reservation-v2', 'FixeoPricing', 'FixeoReservation', 'SERVICE_PRICING'];
  legacyRefs.forEach(function(ref) {
    var codeLines = engineSrc.split('\n').filter(function(l) { return !l.trim().startsWith('//') && !l.trim().startsWith('*'); });
    check(!codeLines.some(function(l) { return l.includes(ref); }), 'Engine core does not reference: ' + ref);
  });
} catch(e) { check(false, 'Legacy reference check', e.message); }

// ── CHECK 16: production_ready=false for all canonical services ───────────
console.log('\n[11] production_ready=false for all 53 services');
try {
  var reg2 = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/canonical/canonical-registry.v1.draft.json')));
  var notReady = Object.entries(reg2.services).filter(function(e) { return e[1].production_ready !== false; });
  check(notReady.length === 0, '0 services with production_ready≠false', notReady.length > 0 ? notReady.map(function(e){return e[0];}).join(', ') : null);
} catch(e) { check(false, 'production_ready check', e.message); }

// ── CHECK 17: Activation flags false ──────────────────────────────────────
console.log('\n[12] Activation flags');
try {
  var manifest3 = JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing/shadow/shadow-freeze-manifest.v1.json')));
  check(manifest3.production_active === false, 'manifest.production_active = false');
  check(manifest3.production_ready === false, 'manifest.production_ready = false');
  check(manifest3.shadow_validation_ready === true, 'manifest.shadow_validation_ready = true');
} catch(e) { check(false, 'Activation flags', e.message); }

// ── CHECK 18: Zero runtime references to new engine ───────────────────────
console.log('\n[13] Runtime isolation');
try {
  var grepResult = execSync(
    "grep -r 'pricing-engine\\|canonical-registry\\.v1\\.draft\\|pricing/shadow\\|pricing/canonical\\|pricing/engine' --include='*.js' --include='*.html' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git .",
    { cwd: REPO, encoding: 'utf8' }
  ).trim();
  var nonPricing = grepResult.split('\n').filter(function(l) {
    return l && !l.includes('data/pricing/') && !l.includes('data\\pricing\\');
  });
  check(nonPricing.length === 0, '0 runtime references to engine/shadow/canonical outside data/pricing/', nonPricing.length > 0 ? nonPricing[0] : null);
} catch(e) {
  if (e.status === 1) check(true, '0 runtime references (grep returned empty)');
  else check(false, 'Runtime isolation', e.message.slice(0,80));
}

// ── CHECK 19: Production runtime diff = 0 ─────────────────────────────────
console.log('\n[14] Production runtime diff');
try {
  var diffRaw = execSync('git diff --name-only HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  var nonPricingDiff = diffRaw.split('\n').filter(function(l) { return l && !l.startsWith('data/pricing/'); });
  check(nonPricingDiff.length === 0, 'Production runtime diff = 0', nonPricingDiff.join(', ') || null);
} catch(e) { check(false, 'Production diff', e.message); }

// ── CHECK 20: No deployment performed ─────────────────────────────────────
console.log('\n[15] No deployment');
try {
  // Verify no Supabase/deploy commands in engine or shadow tooling
  var shadowSrc = fs.readFileSync(path.join(__dirname, 'shadow-runner-v1.js'), 'utf8');
  var engineSrc2 = fs.readFileSync(path.join(REPO, 'data/pricing/engine/pricing-engine-core-v1.js'), 'utf8');
  var deployPatterns = ['supabase', 'fetch(', 'XMLHttpRequest', 'require(\'http\')', 'require("http")', 'require(\'https\')', 'require("https")', 'deploy', 'process.env.'];
  var combined = shadowSrc + engineSrc2;
  var codeOnly = combined.split('\n').filter(function(l) { return !l.trim().startsWith('//') && !l.trim().startsWith('*'); }).join('\n');
  var found = deployPatterns.filter(function(p) { return codeOnly.toLowerCase().includes(p.toLowerCase()); });
  check(found.length === 0, 'No deployment/network patterns in engine or shadow tooling', found.length > 0 ? found.join(', ') : null);
} catch(e) { check(false, 'No deployment check', e.message); }

// ── RESULT ────────────────────────────────────────────────────────────────
var total = pass + fail;
console.log('\n' + SEP);
console.log('PHASE 7C.5.1 VALIDATOR \u2014 RESULT');
console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + total);
if (fail > 0) {
  console.log('\n  FAILURES:');
  errors.forEach(function(e) { console.log('    \u274c ' + e); });
}
console.log('\n  Status: ' + (fail === 0 ? '\u2705 ALL CHECKS PASSED' : '\u274c ' + fail + ' CHECK(S) FAILED'));
console.log(SEP + '\n');
process.exit(fail > 0 ? 1 : 0);
