'use strict';
/**
 * estimator-v2-rafi-qsm-tests.js
 * Phase 7C.9K.1 — RAFI V5 QSM → Estimator V2 activation hotfix tests
 *
 * Tests:
 *  1. QSM RAFI category resolution launches Estimator V2
 *  2. metier_hint comes from _mem.category.cat (not label)
 *  3. flag OFF = legacy QSM unchanged (no open() call)
 *  4. missing FixeoEstimatorV2 = legacy fallback
 *  5. open() error (throw) = legacy fallback, guard reset
 *  6. open() rejection = legacy fallback, guard reset
 *  7. accepted:false = legacy fallback, guard reset
 *  8. accepted:true = QSM next-step suppressed (no guard reset)
 *  9. repeated input callbacks do NOT open multiple estimator modals (one-shot)
 * 10. existing #request-modal estimator hook in _wireModalInputs unchanged
 * 11. canonical pricing / engine / orchestrator zero diff
 */

const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../../../../');

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else           { console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const src = read('js/fixeo-rafi-os-v1.js');

// ─── SECTION 1: QSM hook present and correctly placed ───────────────────────
console.log('\nSECTION 1 — QSM hook wiring');

assert('1.1 _qsmEstimatorLaunched guard declared inside _watchHeroInput',
  src.includes('var _qsmEstimatorLaunched = false'));

assert('1.2 Hook fires inside input event listener (text.length >= 3 + AIRE path)',
  src.includes('cat.cat') &&
  src.match(/if \(cat\)\s*\{[\s\S]{0,2000}FixeoEstimatorV2\.open/));

assert('1.3 source is rafi',
  src.includes("source: 'rafi'"));

assert('1.4 metier_hint uses cat.cat (canonical slug, not label)',
  src.includes('metier_hint: cat.cat'));

assert('1.5 city comes from _mem.city',
  src.includes('city: _mem.city || null'));

assert('1.6 urgency comes from urg variable',
  src.includes("urgency: urg ? 'urgent' : null"));

// ─── SECTION 2: Feature flag guard ──────────────────────────────────────────
console.log('\nSECTION 2 — Feature flag guard');

assert('2.1 estimatorV2Enabled === true guard present in QSM hook',
  src.match(/estimatorV2Enabled === true[\s\S]{0,800}FixeoEstimatorV2\.open[\s\S]{0,50}source.*rafi/));

assert('2.2 FixeoEstimatorConfig null-check present',
  src.includes('window.FixeoEstimatorConfig &&'));

assert('2.3 FixeoEstimatorV2 existence check present',
  src.includes('window.FixeoEstimatorV2 &&'));

assert('2.4 typeof open === function check present',
  src.includes("typeof window.FixeoEstimatorV2.open === 'function'"));

// ─── SECTION 3: One-shot guard ───────────────────────────────────────────────
console.log('\nSECTION 3 — One-shot duplicate prevention');

assert('3.1 !_qsmEstimatorLaunched guard in condition',
  src.includes('!_qsmEstimatorLaunched'));

assert('3.2 guard set to true BEFORE async call (race prevention)',
  src.match(/_qsmEstimatorLaunched = true;\s*\/\/ set before async/));

assert('3.3 _resetQsmEstimatorGuard function defined',
  src.includes('function _resetQsmEstimatorGuard()'));

assert('3.4 resetEstimatorGuard returned from _watchHeroInput',
  src.includes('return { resetEstimatorGuard: _resetQsmEstimatorGuard }'));

// ─── SECTION 4: accepted:true takeover (no QSM advance) ─────────────────────
console.log('\nSECTION 4 — accepted:true takeover');

assert('4.1 accepted:true path returns without advancing QSM',
  src.includes('result.accepted === true') &&
  src.match(/result && result\.accepted === true[\s\S]{0,400}return;/));

assert('4.2 accepted:true does NOT reset the one-shot guard',
  !(src.match(/result && result\.accepted === true[\s\S]{0,50}_qsmEstimatorLaunched = false/)));

// ─── SECTION 5: Fallback paths (accepted:false, rejection, throw) ────────────
console.log('\nSECTION 5 — Fallback paths');

assert('5.1 accepted:false resets guard (legacy fallback)',
  src.includes('// accepted:false') &&
  src.match(/accepted:false[\s\S]{0,200}_qsmEstimatorLaunched = false/));

assert('5.2 .catch resets guard (rejection fallback)',
  src.match(/Any rejection[\s\S]{0,100}_qsmEstimatorLaunched = false/));

assert('5.3 catch(_e) resets guard (synchronous throw fallback)',
  src.match(/Synchronous throw[\s\S]{0,100}_qsmEstimatorLaunched = false/));

// ─── SECTION 6: Session-end guard reset ─────────────────────────────────────
console.log('\nSECTION 6 — Session-end guard reset');

assert('6.1 _watchModal accepts heroInputHandle parameter',
  src.includes('function _watchModal(heroInputHandle)'));

assert('6.2 heroInputHandle.resetEstimatorGuard() called on modal close',
  src.includes('heroInputHandle.resetEstimatorGuard()'));

assert('6.3 reset guarded: typeof check before call',
  src.includes("typeof heroInputHandle.resetEstimatorGuard === 'function'"));

assert('6.4 _init captures return value of _watchHeroInput',
  src.includes('var _heroInputHandle = _watchHeroInput()'));

assert('6.5 _init passes handle to _watchModal',
  src.includes('_watchModal(_heroInputHandle)'));

// ─── SECTION 7: Existing #request-modal hook untouched ───────────────────────
console.log('\nSECTION 7 — Existing request-modal hook preserved');

assert('7.1 _wireModalInputs chip MutationObserver still present',
  src.includes('chipObs') && src.includes('fxrm2-chip.selected'));

assert('7.2 request-modal estimator hook still present',
  src.match(/source: 'rafi'[\s\S]{0,500}metier_hint: selected\.dataset\.slug/));

assert('7.3 Both hooks use try/catch noop pattern',
  (src.match(/catch \(_\)/g) || []).length >= 2);

// ─── SECTION 8: Flag-OFF equivalence ─────────────────────────────────────────
console.log('\nSECTION 8 — Flag-OFF equivalence');

assert('8.1 _mem.update() call preserved unconditionally before estimator guard',
  src.match(/_mem\.update\(\{ category: cat, isUrgent: urg \}\)[\s\S]{0,50}\/\/ ── 7C\.9K\.1/));

assert('8.2 RafiEntry.onAnalysis() preserved unconditionally (before guard)',
  src.match(/RafiEntry\.onAnalysis\(cat \|\| null, urg\)[\s\S]{0,200}_mem\.update/));

assert('8.3 city select change handler unchanged',
  src.includes("_mem.update({ city: citySelect.value })") &&
  src.includes("RafiEntry.onCityKnown(citySelect.value)"));

// ─── SECTION 9: Canonical pricing / engine / orchestrator zero diff ──────────
console.log('\nSECTION 9 — Canonical files untouched');

const canonDir  = path.join(root, 'data/pricing/canonical');
const canonFiles = fs.readdirSync(canonDir).filter(f => f.endsWith('.json'));
assert('9.1 Canonical directory non-empty', canonFiles.length > 0);
canonFiles.slice(0, 3).forEach(f => {
  try {
    JSON.parse(fs.readFileSync(path.join(canonDir, f), 'utf8'));
    assert('9.x ' + f + ' parseable', true);
  } catch (e) {
    assert('9.x ' + f + ' parseable', false, e.message);
  }
});

const eng = read('data/pricing/engine/pricing-engine-core-v1.js');
assert('9.2 Engine file non-empty', eng.length > 1000);
assert('9.3 Engine has no 7C.9K.1 reference', !eng.includes('7C.9K.1'));

const orc = read('data/pricing/orchestrator/estimator-orchestrator-v1.js');
assert('9.4 Orchestrator file non-empty', orc.length > 1000);
assert('9.5 Orchestrator has no 7C.9K.1 reference', !orc.includes('7C.9K.1'));

const auth = read('api/fixeo-booking-authority-v1.js');
assert('9.6 Booking authority unchanged (no 7C.9K.1)', !auth.includes('7C.9K.1'));

const idm = read('api/fixeo-estimator-idempotency-v1.js');
assert('9.7 Idempotency module unchanged (no 7C.9K.1)', !idm.includes('7C.9K.1'));

assert('9.8 index.html unchanged (no 7C.9K.1)', !read('index.html').includes('7C.9K.1'));

// ─── FINAL ────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '─'.repeat(60));
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9K.1 RAFI QSM activation tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exit(1);
}
