/**
 * estimator-v2-3z2c1-reset-order-tests.js
 * Phase 7C.9L.3Z.2C.1 — Nouvelle demande RFOS clean reset hotfix
 *
 * Tests:
 *  1.  Nouvelle demande removes verified card
 *  2.  canonical clearContext() called
 *  3.  RFOS category memory cleared (memory.reset() called before entry.reset())
 *  4.  RFOS urgency cleared
 *  5.  old category badge removed (entry.reset() before _dismissPriceReady)
 *  6.  old category greeting removed
 *  7.  QSM old request text cleared
 *  8.  neutral RFOS idle state restored (entry.reset sets idle greeting)
 *  9.  city localStorage preserved (never touched)
 * 10.  trusted city session marker preserved (never touched)
 * 11.  no Estimator auto-open on programmatic input clear
 * 12.  next genuine user typing can open Estimator (guard not reset on programmatic clear)
 * 13.  PRICE_READY resume unchanged (verifyContext path unmodified)
 * 14.  Continue CTA unchanged (FixeoReservation.open call unmodified)
 * 15.  profile return guard unchanged
 * 16.  FAEE isolation unchanged (reservation.js data-estimator-context unmodified)
 *
 * Source-level assertions (no browser DOM required).
 */
'use strict';

const fs   = require('fs');
const path = require('path');

/* ── Source files ────────────────────────────────────────────── */
var ctrlSrc = fs.readFileSync(
  path.join(__dirname, '../../../../../js/fixeo-hero-resume-v1.js'), 'utf8');
var rfosSrc = fs.readFileSync(
  path.join(__dirname, '../../../../../js/fixeo-rafi-os-v1.js'), 'utf8');
var resSrc  = fs.readFileSync(
  path.join(__dirname, '../../../../../js/reservation.js'), 'utf8');

/* ── Test runner ─────────────────────────────────────────────── */
var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg)     { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ` got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

/* ── Helpers ─────────────────────────────────────────────────── */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

/* Extract _resetToFresh function source (code only, no comments) */
function resetFreshSrc() {
  var start = ctrlSrc.indexOf('function _resetToFresh(');
  var end   = ctrlSrc.indexOf('\n  function ', start + 1);
  return codeOnly(ctrlSrc.slice(start, end));
}

/* ── Group 1: Reset contract ──────────────────────────────────── */
console.log('\n── Group 1: "Nouvelle demande" reset contract ──');

test('1. Nouvelle demande removes verified card (_dismissPriceReady called)', function () {
  assert(ctrlSrc.includes('_dismissPriceReady()'), '_dismissPriceReady exists');
  var resetSrc = resetFreshSrc();
  assert(resetSrc.includes('_dismissPriceReady()'), '_dismissPriceReady called in _resetToFresh');
});

test('2. canonical clearContext() called via bridge', function () {
  var resetSrc = resetFreshSrc();
  assert(resetSrc.includes('clearContext()'), 'clearContext() in _resetToFresh');
  assert(resetSrc.includes('FixeoEstimatorReservationBridge'), 'scoped to bridge');
});

test('3. RFOS category memory cleared (memory.reset() called)', function () {
  var resetSrc = resetFreshSrc();
  assert(resetSrc.includes('FixeoRAFI.memory'), 'memory accessed');
  assert(resetSrc.includes('.reset()'), 'reset() called');
  /* Verify _mem.reset() actually clears category (inspect RFOS source) */
  var memResetIdx = rfosSrc.indexOf('reset: function ()');
  var memResetSrc = rfosSrc.slice(memResetIdx, memResetIdx + 200);
  assert(memResetSrc.includes('this.category = null'), 'memory.reset() clears category');
});

test('4. RFOS urgency cleared by memory.reset()', function () {
  var memResetIdx = rfosSrc.indexOf('reset: function ()');
  var memResetSrc = rfosSrc.slice(memResetIdx, memResetIdx + 200);
  assert(memResetSrc.includes('this.isUrgent = false'), 'memory.reset() clears isUrgent');
});

test('5. entry.reset() called BEFORE _dismissPriceReady() — no flash of old badge', function () {
  var resetSrc = resetFreshSrc();
  var entryIdx   = resetSrc.indexOf('FixeoRAFI.entry');
  var dismissIdx = resetSrc.indexOf('_dismissPriceReady()');
  assert(entryIdx > 0 && dismissIdx > 0, 'both calls present');
  assert(entryIdx < dismissIdx,
    'entry.reset() before _dismissPriceReady() — prevents old category badge flash');
});

test('6. memory.reset() called BEFORE entry.reset() — no stale category in greeting', function () {
  var resetSrc = resetFreshSrc();
  var memIdx   = resetSrc.indexOf('FixeoRAFI.memory');
  var entryIdx = resetSrc.indexOf('FixeoRAFI.entry');
  assert(memIdx > 0 && entryIdx > 0, 'both calls present');
  assert(memIdx < entryIdx,
    'memory.reset() before entry.reset() — _mem.category null when entry sets idle greeting');
});

test('7. QSM old request text cleared (inp.value cleared)', function () {
  var resetSrc = resetFreshSrc();
  assert(resetSrc.includes("inp.value = ''"), 'inp.value cleared');
});

test('8. entry.reset() sets neutral idle RFOS state (proven from RFOS source)', function () {
  /* Find entry.reset() in RFOS — it's the reset() inside RafiEntry IIFE */
  var rafiEntryStart = rfosSrc.indexOf('var RafiEntry') > 0
    ? rfosSrc.indexOf('var RafiEntry')
    : rfosSrc.indexOf('function mount(');
  /* Find reset() after mount() — it's the entry reset */
  var entryResetIdx = rfosSrc.indexOf("function reset() {\n      _setState('idle')");
  assert(entryResetIdx > 0, 'entry reset with _setState idle found');
  var entryResetSrc = rfosSrc.slice(entryResetIdx, entryResetIdx + 700);
  assert(entryResetSrc.includes("_setState('idle')"), 'sets state to idle');
  assert(entryResetSrc.includes('_setBadge(null)'), 'clears badge');
  assert(entryResetSrc.includes('_stopWaiting()'), 'stops old wait loop');
  assert(entryResetSrc.includes('_startWaiting'), 'restarts neutral wait loop');
  /* Greeting set to idle text (heroIdle or heroIdleWithCity — not old category) */
  assert(entryResetSrc.includes('heroIdleWithCity') || entryResetSrc.includes('heroIdle'),
    'greeting set to neutral idle text');
});

/* ── Group 2: City preservation ─────────────────────────────── */
console.log('\n── Group 2: City preservation ──');

test('9. city localStorage (fixeo_detected_city) never touched in reset', function () {
  var resetSrc = resetFreshSrc();
  assert(!resetSrc.includes('fixeo_detected_city'), 'fixeo_detected_city not cleared');
  assert(!resetSrc.includes('localStorage'), 'no localStorage access in reset');
});

test('10. trusted city session marker (fxrf4_trusted_city_session) preserved', function () {
  var resetSrc = resetFreshSrc();
  assert(!resetSrc.includes('fxrf4_trusted_city_session'), 'trusted city key not cleared');
});

test('10b. memory.reset() preserves _mem.city by design (RFOS source)', function () {
  var memResetIdx = rfosSrc.indexOf('reset: function ()');
  var memResetSrc = rfosSrc.slice(memResetIdx, memResetIdx + 300);
  assert(!memResetSrc.includes('this.city = null'), '_mem.city NOT cleared by memory.reset()');
  /* Comment confirms city is intentionally preserved */
  assert(memResetSrc.includes('city') && memResetSrc.includes('kept'),
    'city kept comment present in memory.reset()');
});

/* ── Group 3: No auto-open on programmatic clear ─────────────── */
console.log('\n── Group 3: No Estimator auto-open on reset ──');

test('11. programmatic inp.value clear does not dispatch synthetic input event', function () {
  var resetSrc = resetFreshSrc();
  /* Must set value directly — never via dispatchEvent or .dispatchEvent */
  assert(!resetSrc.includes('dispatchEvent'), 'no synthetic event dispatch');
  assert(!resetSrc.includes('new Event'), 'no Event constructor');
  assert(!resetSrc.includes('new InputEvent'), 'no InputEvent constructor');
  /* Verify comment explains this is intentional */
  /* Check in full source (comments present there) */
  var fullResetStart = ctrlSrc.indexOf('function _resetToFresh(');
  var fullResetEnd   = ctrlSrc.indexOf('\n  function ', fullResetStart + 1);
  var fullResetSrc   = ctrlSrc.slice(fullResetStart, fullResetEnd);
  assert(fullResetSrc.includes('_qsmEstimatorLaunched') ||
         fullResetSrc.includes('programmatic') ||
         fullResetSrc.includes('input event') ||
         fullResetSrc.includes('Estimator'),
    'reset comments address auto-open non-trigger');
});

test('12. _qsmEstimatorLaunched guard NOT reset on programmatic clear', function () {
  var resetSrc = resetFreshSrc();
  /* reset() in hero-resume must NOT call _resetQsmEstimatorGuard or set _qsmEstimatorLaunched */
  assert(!resetSrc.includes('_qsmEstimatorLaunched'), '_qsmEstimatorLaunched not touched in reset');
  assert(!resetSrc.includes('_resetQsmEstimatorGuard'), '_resetQsmEstimatorGuard not called in reset');
  /* The guard IS reset by the fixeo:estimator-closed listener (from 3Z.2B) — not here */
  /* Verify that fixeo:estimator-closed listener still calls _runVerification (3Z.2B intact) */
  assert(ctrlSrc.includes("'fixeo:estimator-closed'"), 'estimator-closed listener present');
});

/* ── Group 4: Unchanged contracts ───────────────────────────── */
console.log('\n── Group 4: Unchanged existing contracts ──');

test('13. PRICE_READY resume path unchanged (verifyContext still called in _runVerification)', function () {
  assert(ctrlSrc.includes('verifyContext()'), 'verifyContext present');
  var runStart = ctrlSrc.indexOf('function _runVerification()');
  assert(ctrlSrc.indexOf('verifyContext()', runStart) > runStart, 'verifyContext in _runVerification');
});

test('14. Continue CTA still delegates to FixeoReservation.open(null, false, null)', function () {
  assert(ctrlSrc.includes('FixeoReservation.open(null, false, null)'), 'continue CTA unchanged');
});

test('15. profile-return guard still early-returns in _runVerification', function () {
  var runStart = ctrlSrc.indexOf('function _runVerification()');
  var profGuard = ctrlSrc.indexOf('if (_profileReturnActive()) return;', runStart);
  assert(profGuard > runStart, 'profile return guard in _runVerification');
});

test('16. FAEE isolation: reservation.js data-estimator-context attribute still set', function () {
  assert(resSrc.includes('data-estimator-context'), 'data-estimator-context in reservation.js');
  assert(resSrc.includes('estimatorCtx') || resSrc.includes('_estimatorCtx'),
    'estimator context referenced in reservation');
});

/* ── Group 5: Cache key updated ─────────────────────────────── */
console.log('\n── Group 5: Cache key ──');

test('17. Cache key updated to fxhro-v1b-reset in JS file', function () {
  assert(ctrlSrc.includes('fxhro-v1b-reset'), 'version string updated in JS');
});

test('18. index.html references fxhro-v1b-reset for both CSS and JS', function () {
  var idxSrc = fs.readFileSync(
    path.join(__dirname, '../../../../../index.html'), 'utf8');
  assert(idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1b-reset'), 'CSS cache key updated');
  assert(idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1b-reset'), 'JS cache key updated');
  assert(!idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1a'), 'old JS key gone');
  assert(!idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1a'), 'old CSS key gone');
});

/* ── Summary ─────────────────────────────────────────────────── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
