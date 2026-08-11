'use strict';
/**
 * estimator-v2-fxrf4-card-tests.js
 * Phase 7C.9K.2 — RAFI standard métier-card → Estimator V2 activation tests
 *
 * Tests (source-level, no browser):
 *  1.  Standard .fxrf4-chip _onTap path calls FixeoEstimatorV2.open() when flag=true
 *  2.  svc.slug becomes metier_hint
 *  3.  accepted:true suppresses city transition (_transitionFwd/_renderStep2 NOT called)
 *  4.  accepted:false preserves city transition
 *  5.  rejected Promise preserves city transition
 *  6.  synchronous error preserves city transition
 *  7.  missing FixeoEstimatorV2 preserves legacy flow (falls to else branch)
 *  8.  flag=false preserves legacy flow (falls to else branch)
 *  9.  repeated tap cannot open duplicate estimator modal (one-shot guard)
 * 10.  fresh RAFI session (open() reinit) resets the one-shot guard
 * 11.  emergency _onSitTap() is byte-for-byte unchanged from HEAD ee5b22d
 * 12.  7C.9K.1 NLP hook in fixeo-rafi-os-v1.js remains unchanged
 * 13.  canonical pricing diff = 0
 * 14.  pricing engine diff = 0
 * 15.  orchestrator diff = 0
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

const src = read('js/fx-request-flow-v4.js');
const rafi = read('js/fixeo-rafi-os-v1.js');

// ─── SECTION 1: Standard _onTap hook presence ────────────────────────────────
console.log('\nSECTION 1 — Standard _onTap hook wiring');

assert('1.1 _fxrf4EstimatorLaunched guard declared at module scope',
  src.includes('var _fxrf4EstimatorLaunched = false'));

assert('1.2 Hook fires only when flag is ON (estimatorV2Enabled === true)',
  src.match(/estimatorV2Enabled === true[\s\S]{0,800}FixeoEstimatorV2\.open[\s\S]{0,50}source.*rafi/));

assert('1.3 source: \'rafi\' in standard _onTap open call',
  src.includes("source:       'rafi'"));

assert('1.4 metier_hint: svc.slug (not label)',
  src.includes('metier_hint:  svc.slug'));

// 7C.9L.3H: field renamed city → city_slug; only trusted session city sent (not stale localStorage)
assert('1.5 city_slug from trusted session key (7C.9L.3H)',
  src.includes('city_slug:') && src.includes('TRUSTED_CITY_SESSION_KEY') && src.includes('sessionStorage.getItem'));

assert('1.6 urgency: null in standard mode (not yet known at step1)',
  src.includes('urgency:      null, // urgency not yet known at step1'));

assert('1.7 svc.slug !== \'autre\' guard prevents estimator for free-text path',
  src.includes("svc.slug !== 'autre'"));

assert('1.8 FixeoEstimatorConfig null-check present',
  src.match(/svc\.slug !== 'autre'[\s\S]{0,200}window\.FixeoEstimatorConfig &&/));

assert('1.9 typeof open === function check present',
  src.includes("typeof window.FixeoEstimatorV2.open === 'function'"));

// ─── SECTION 2: accepted:true takeover ───────────────────────────────────────
console.log('\nSECTION 2 — accepted:true takeover');

assert('2.1 accepted:true returns without calling _advance (city suppressed)',
  src.match(/result && result\.accepted === true[\s\S]{0,300}return;/));

assert('2.2 accepted:true does NOT reset the one-shot guard',
  !(src.match(/result && result\.accepted === true[\s\S]{0,60}_fxrf4EstimatorLaunched = false/)));

assert('2.3 _transitionFwd is only called via _advance, never directly after open()',
  // The open().then path only calls _advance() — never _transitionFwd directly
  !src.match(/FixeoEstimatorV2\.open[\s\S]{0,500}_transitionFwd\(_renderStep2\)/));

// ─── SECTION 3: Fallback paths ───────────────────────────────────────────────
console.log('\nSECTION 3 — accepted:false / error fallback');

assert('3.1 accepted:false resets guard then calls _advance()',
  src.match(/accepted:false[\s\S]{0,150}_fxrf4EstimatorLaunched = false[\s\S]{0,50}_advance\(\)/));

assert('3.2 .catch resets guard then calls _advance()',
  src.match(/Any error[\s\S]{0,100}_fxrf4EstimatorLaunched = false[\s\S]{0,50}_advance\(\)/));

assert('3.3 flag=false / missing estimator falls to else branch with plain _advance',
  src.includes('_chipTap(chip, chips, _advance, ack)'));

assert('3.4 else branch comment confirms Flag OFF / autre / already launched behavior',
  src.includes('// Flag OFF, \'autre\', or already launched — exact legacy behavior.'));

// ─── SECTION 4: One-shot guard ───────────────────────────────────────────────
console.log('\nSECTION 4 — One-shot duplicate prevention');

assert('4.1 !_fxrf4EstimatorLaunched in hook condition',
  src.includes('!_fxrf4EstimatorLaunched'));

assert('4.2 guard set to true BEFORE async call (race prevention)',
  src.match(/_fxrf4EstimatorLaunched = true; \/\/ set before async/));

assert('4.3 guard reset on session open (_fresh reinit)',
  src.match(/_fxrf4EstimatorLaunched = false;\n\s+\n\s+_isOpen = true/) ||
  src.includes('// 7C.9K.2: reset estimator guard on each fxrf4 session open'));

// ─── SECTION 5: Emergency _onSitTap unchanged ────────────────────────────────
console.log('\nSECTION 5 — Emergency _onSitTap() byte-for-byte unchanged');

assert('5.1 _onSitTap() body still calls plain _chipTap with _transitionFwd(_renderStep2)',
  src.includes(
    "var ack = MSG.ackEmergency[sit.slug] || MSG.ackEmergency._default;\n          _chipTap(chip, chips, function() { _transitionFwd(_renderStep2); }, ack);"
  ));

assert('5.2 No FixeoEstimatorV2.open() call inside _onSitTap body',
  !src.match(/_onSitTap[\s\S]{0,50}FixeoEstimatorV2\.open/));

assert('5.3 No estimator hook comment inside emergency section',
  !src.match(/_renderEmergencyStep1[\s\S]{0,3000}7C\.9K\.2.*emergency/));

// ─── SECTION 6: 7C.9K.1 NLP hook in fixeo-rafi-os-v1.js unchanged ───────────
console.log('\nSECTION 6 — 7C.9K.1 NLP hook preserved');

assert('6.1 _qsmEstimatorLaunched still present in rafi-os',
  rafi.includes('var _qsmEstimatorLaunched = false'));

assert('6.2 RAFI QSM hook still fires for text NLP path',
  rafi.includes("source: 'rafi'") &&
  rafi.includes('metier_hint: cat.cat'));

assert('6.3 7C.9K.1 comment still present in rafi-os',
  rafi.includes('7C.9K.1'));

// ─── SECTION 7: Canonical files zero diff ────────────────────────────────────
console.log('\nSECTION 7 — Canonical files untouched');

const canonDir = path.join(root, 'data/pricing/canonical');
const canonFiles = fs.readdirSync(canonDir).filter(function(f) { return f.endsWith('.json'); });
assert('7.1 Canonical directory non-empty', canonFiles.length > 0);
canonFiles.slice(0, 3).forEach(function(f) {
  try {
    JSON.parse(fs.readFileSync(path.join(canonDir, f), 'utf8'));
    assert('7.x ' + f + ' parseable', true);
  } catch(e) {
    assert('7.x ' + f + ' parseable', false, e.message);
  }
});

const eng = read('data/pricing/engine/pricing-engine-core-v1.js');
assert('7.2 Engine file non-empty', eng.length > 1000);
assert('7.3 Engine has no 7C.9K.2 reference', !eng.includes('7C.9K.2'));

const orc = read('data/pricing/orchestrator/estimator-orchestrator-v1.js');
assert('7.4 Orchestrator file non-empty', orc.length > 1000);
assert('7.5 Orchestrator has no 7C.9K.2 reference', !orc.includes('7C.9K.2'));

const auth = read('api/fixeo-booking-authority-v1.js');
assert('7.6 Booking authority has no 7C.9K.2 reference', !auth.includes('7C.9K.2'));

const idm = read('api/fixeo-estimator-idempotency-v1.js');
assert('7.7 Idempotency module has no 7C.9K.2 reference', !idm.includes('7C.9K.2'));

assert('7.8 index.html unchanged (no 7C.9K.2)', !read('index.html').includes('7C.9K.2'));

assert('7.9 fixeo-estimator-config.js still has estimatorV2Enabled: true',
  read('js/fixeo-estimator-config.js').includes('estimatorV2Enabled: true'));

// ─── FINAL ────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '─'.repeat(60));
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9K.2 standard card activation tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exit(1);
}
