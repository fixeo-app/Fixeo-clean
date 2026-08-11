/**
 * estimator-v2-3z2c2-qsm-reset-tests.js
 * Phase 7C.9L.3Z.2C.2 — QSM / Hero Métier Reset Hotfix
 *
 * Tests 1–18 per spec.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

var ctrlSrc    = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-resume-v1.js'), 'utf8');
var insightsSrc= fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-insights.js'), 'utf8');
var qsmSrc     = fs.readFileSync(path.join(__dirname, '../../../../../js/quick-search-modal.js'), 'utf8');
var resSrc     = fs.readFileSync(path.join(__dirname, '../../../../../js/reservation.js'), 'utf8');
var idxSrc     = fs.readFileSync(path.join(__dirname, '../../../../../index.html'), 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

/* Extract _resetToFresh source */
function resetSrc() {
  var start = ctrlSrc.indexOf('function _resetToFresh(');
  var end   = ctrlSrc.indexOf('\n  function ', start + 1);
  return ctrlSrc.slice(start, end);
}
function resetCode() { return codeOnly(resetSrc()); }

/* ══════════════════════════════════════════════════════════════
   GROUP 1: QSM métier state cleared
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: QSM métier state cleared ──');

test('1. Nouvelle demande clears QSM métier: QuickSearchModal.resetMetier() called', function () {
  var rc = resetCode();
  assert(rc.includes('QuickSearchModal'), 'QuickSearchModal referenced in reset');
  assert(rc.includes('resetMetier'), 'resetMetier called');
});

test('2. CTA resets: FixeoHeroInsights.reset() called in _resetToFresh', function () {
  var rc = resetCode();
  assert(rc.includes('FixeoHeroInsights'), 'FixeoHeroInsights referenced');
  assert(rc.includes('.reset()'), 'reset() called');
});

test('3. stale Plomberie chip cleared: _resetMetier clears st.cat', function () {
  /* _resetMetier in QSM must clear st.cat */
  var resetMetierIdx = qsmSrc.indexOf('function _resetMetier()');
  assert(resetMetierIdx > 0, '_resetMetier exists in QSM');
  var rmSrc = qsmSrc.slice(resetMetierIdx, resetMetierIdx + 400);
  assert(rmSrc.includes("st.cat") && (rmSrc.includes("= ''") || rmSrc.includes('= ""')),
    'st.cat cleared in _resetMetier');
});

test('4. stale plumbing artisan count cleared: insights bar hidden by reset()', function () {
  var insightsResetIdx = insightsSrc.indexOf('function _reset()');
  assert(insightsResetIdx > 0, '_reset() exists in fixeo-hero-insights.js');
  var irs = insightsSrc.slice(insightsResetIdx, insightsResetIdx + 400);
  assert(irs.includes("classList.remove('visible')"), 'bar visible class removed');
  /* _state.category cleared */
  assert(irs.includes('_state.category = null'), '_state.category cleared');
});

test('5. old request text cleared: inp.value cleared in _resetToFresh', function () {
  var rc = resetCode();
  assert(rc.includes("inp.value = ''") || rc.includes('inp.value=""'), 'inp.value cleared');
});

test('6. RFOS remains neutral: memory.reset() + entry.reset() called before _dismissPriceReady', function () {
  var rc = resetCode();
  var memIdx     = rc.indexOf('FixeoRAFI.memory');
  var entryIdx   = rc.indexOf('FixeoRAFI.entry');
  var dismissIdx = rc.indexOf('_dismissPriceReady()');
  assert(memIdx > 0 && entryIdx > 0 && dismissIdx > 0, 'all three present');
  assert(memIdx < dismissIdx && entryIdx < dismissIdx,
    'RFOS resets before _dismissPriceReady');
});

test('7. verified price card cleared: _dismissPriceReady() called', function () {
  var rc = resetCode();
  assert(rc.includes('_dismissPriceReady()'), '_dismissPriceReady in reset');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: City preservation
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: City preservation ──');

test('8. city preserved: fixeo_detected_city not touched in reset', function () {
  var rc = resetCode();
  assert(!rc.includes('fixeo_detected_city'), 'fixeo_detected_city not cleared');
});

test('9. trusted city preserved: fxrf4_trusted_city_session not touched', function () {
  var rc = resetCode();
  assert(!rc.includes('fxrf4_trusted_city_session'), 'trusted city not cleared');
});

test('10. QSM city selection preserved: _resetMetier does NOT clear st.city or #qsm-select-city', function () {
  var rmIdx = qsmSrc.indexOf('function _resetMetier()');
  var rmSrc = qsmSrc.slice(rmIdx, rmIdx + 500);
  var rmCode = codeOnly(rmSrc);
  assert(!rmCode.includes('st.city'), 'st.city not cleared in _resetMetier');
  assert(!rmCode.includes('qsm-select-city'), '#qsm-select-city not touched in _resetMetier');
});

test('10b. HeroInsights reset preserves city: _state.city not cleared', function () {
  var irIdx = insightsSrc.indexOf('function _reset()');
  var irSrc = insightsSrc.slice(irIdx, irIdx + 400);
  var irCode = codeOnly(irSrc);
  assert(!irCode.includes('_state.city = null') && !irCode.includes('_state.city=null'),
    '_state.city preserved in HeroInsights reset');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: No auto-open
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: No Estimator auto-open on reset ──');

test('11. no synthetic input event: _resetMetier does not dispatch events', function () {
  var rmIdx = qsmSrc.indexOf('function _resetMetier()');
  var rmSrc = codeOnly(qsmSrc.slice(rmIdx, rmIdx + 400));
  assert(!rmSrc.includes('dispatchEvent') && !rmSrc.includes('new Event'),
    'no synthetic event in _resetMetier');
  /* HeroInsights.reset() also must not dispatch events */
  var irIdx = insightsSrc.indexOf('function _reset()');
  var irSrc = codeOnly(insightsSrc.slice(irIdx, irIdx + 400));
  assert(!irSrc.includes('dispatchEvent') && !irSrc.includes('new Event'),
    'no synthetic event in HeroInsights.reset');
});

test('12. next real input can detect new category: _analyze() still wired to input events', function () {
  /* _analyze is still called on input events in FixeoHeroInsights */
  assert(insightsSrc.includes("'input'") && insightsSrc.includes('_analyze'),
    '_analyze wired to input events');
  /* _reset() does not remove the listener */
  var irIdx = insightsSrc.indexOf('function _reset()');
  var irSrc = codeOnly(insightsSrc.slice(irIdx, irIdx + 400));
  assert(!irSrc.includes('removeEventListener'), 'reset does not remove listeners');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: New request clean start (source proof)
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: New request clean start ──');

test('13. next electrical request does not inherit plomberie: st.cat reset to empty string', function () {
  /* After _resetMetier(), st.cat = '' — AIRE will re-detect from scratch */
  var rmIdx = qsmSrc.indexOf('function _resetMetier()');
  var rmSrc = qsmSrc.slice(rmIdx, rmIdx + 300);
  assert(rmSrc.includes("st.cat") && rmSrc.includes("''"),
    'st.cat reset to empty string');
});

test('14. CTA updates correctly for new category: CTA_LABELS.electricite exists', function () {
  assert(insightsSrc.includes("electricite:") && insightsSrc.includes("Trouver mon"),
    'electricite CTA label exists in HeroInsights');
  /* After reset, _state.category = null → CTA = CTA_DEFAULT */
  var irIdx = insightsSrc.indexOf('function _reset()');
  var irSrc = insightsSrc.slice(irIdx, irIdx + 400);
  assert(irSrc.includes('_updateCTA(null') || irSrc.includes('_updateCTA( null'),
    '_updateCTA(null) called in reset → canonical neutral label');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: Reset order unchanged from 3Z.2C.1
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: 3Z.2C.1 reset order preserved ──');

test('15. reset order: memory→entry→insights→qsm→dismiss (all before inp.value clear)', function () {
  var rc = resetCode();
  var memIdx      = rc.indexOf('FixeoRAFI.memory');
  var entryIdx    = rc.indexOf('FixeoRAFI.entry');
  var insightsIdx = rc.indexOf('FixeoHeroInsights');
  var qsmIdx      = rc.indexOf('QuickSearchModal');
  var dismissIdx  = rc.indexOf('_dismissPriceReady()');
  var inpIdx      = rc.indexOf("inp.value = ''");
  assert(memIdx < entryIdx, 'memory before entry');
  assert(entryIdx < insightsIdx, 'entry before insights');
  assert(insightsIdx < qsmIdx, 'insights before qsm');
  assert(qsmIdx < dismissIdx, 'qsm before dismiss');
  assert(dismissIdx < inpIdx, 'dismiss before inp.clear');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: Unchanged contracts
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: Unchanged contracts ──');

test('16. PRICE_READY resume unchanged: verifyContext in _runVerification', function () {
  var runStart = ctrlSrc.indexOf('function _runVerification()');
  assert(ctrlSrc.indexOf('verifyContext()', runStart) > runStart,
    'verifyContext in _runVerification');
});

test('17. 3Z.2B re-entry unchanged: fixeo:estimator-closed listener present', function () {
  assert(ctrlSrc.includes("'fixeo:estimator-closed'"), 'estimator-closed listener present');
});

test('18. 3Z.1 FAEE isolation unchanged: data-estimator-context in reservation.js', function () {
  assert(resSrc.includes('data-estimator-context'), 'FAEE guard intact in reservation.js');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 7: Cache keys
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 7: Cache keys ──');

test('19. hero-resume JS: fxhro-v1c-qsm-reset in both file and index.html', function () {
  assert(ctrlSrc.includes('fxhro-v1c-qsm-reset'), 'version in JS');
  assert(idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1c-qsm-reset'), 'JS key in index.html');
  assert(!idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1b-reset'), 'old key gone');
});

test('20. hero-insights: fxhi-v1d-reset in both file and index.html', function () {
  assert(insightsSrc.includes('fxhi-v1d-reset'), 'version in insights JS');
  assert(idxSrc.includes('fixeo-hero-insights.js?v=fxhi-v1d-reset'), 'insights key in index.html');
  assert(!idxSrc.includes('fixeo-hero-insights.js?v=fxhi-v1c'), 'old insights key gone');
});

test('21. quick-search-modal: qsm11-reset in index.html', function () {
  assert(idxSrc.includes('quick-search-modal.js?v=qsm11-reset'), 'QSM key updated in index.html');
  assert(!idxSrc.includes('quick-search-modal.js?v=qsm10'), 'old QSM key gone');
});

test('22. public resetMetier exposed on window.QuickSearchModal', function () {
  assert(qsmSrc.includes('resetMetier: _resetMetier') ||
         qsmSrc.includes('resetMetier:_resetMetier'),
    'resetMetier on QuickSearchModal public API');
});

test('23. public reset exposed on window.FixeoHeroInsights', function () {
  assert(insightsSrc.includes('reset:   _reset') ||
         insightsSrc.includes('reset: _reset') ||
         insightsSrc.includes('reset:_reset'),
    'reset on FixeoHeroInsights public API');
});

/* ── Summary ────────────────────────────────────────────────── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
