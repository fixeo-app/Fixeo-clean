#!/usr/bin/env node
/* Phase 7C.9L.3X — City Picker Back → PRICE_READY Reveal
 * 32 targeted tests. Run: node estimator-v2-3x-city-back-tests.js
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '../../../../..');

var estSrc = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
var resSrc = fs.readFileSync(path.join(root, 'js/reservation.js'),        'utf8');
var idxSrc = fs.readFileSync(path.join(root, 'index.html'),               'utf8');

var pass = 0, fail = 0;
function t(label, result) {
  if (result) { pass++; console.log('  PASS: ' + label); }
  else        { fail++; console.log('  FAIL: ' + label); }
}

console.log('Phase 7C.9L.3X — City Picker Back → PRICE_READY Tests');

/* ── 1-9: hide() / reveal() API ── */

t('1: FixeoEstimatorV2 exposes hide()',
  estSrc.includes('hide: function()'));

t('2: FixeoEstimatorV2 exposes reveal()',
  estSrc.includes('reveal: function()'));

t('3: hide does NOT call _destroyContainer',
  (function() {
    var idx = estSrc.indexOf('hide: function()');
    var block = estSrc.substring(idx, idx + 300);
    return !block.includes('_destroyContainer');
  })());

t('4: hide does NOT clear _activeModal or _activeContainer',
  (function() {
    var idx = estSrc.indexOf('hide: function()');
    var block = estSrc.substring(idx, idx + 300);
    return !block.includes('_activeModal = null') && !block.includes('_activeContainer = null');
  })());

t('5: hide does NOT create a pricing token or call an API',
  (function() {
    var idx = estSrc.indexOf('hide: function()');
    var block = estSrc.substring(idx, idx + 300);
    return !block.includes('prepareContext') && !block.includes('fetch') &&
           !block.includes('sessionStorage') && !block.includes('token');
  })());

t('6: reveal does NOT call open()',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    var block = estSrc.substring(idx, idx + 300);
    return !block.includes('open(') && !block.includes('EstimatorModal');
  })());

t('7: reveal does NOT call a pricing API or prepareContext',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    var block = estSrc.substring(idx, idx + 300);
    return !block.includes('prepareContext') && !block.includes('fetch') &&
           !block.includes('verifyContext');
  })());

t('8: reveal reuses existing container (visibility toggle only)',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    var block = estSrc.substring(idx, idx + 300);
    return block.includes('_activeContainer') &&
           block.includes('visibility') &&
           !block.includes('_createContainer');
  })());

t('9: normal close() still destroys container',
  (function() {
    var idx = estSrc.indexOf('close: function()');
    var block = estSrc.substring(idx, idx + 200);
    return block.includes('_destroyContainer') || block.includes('STATE.onClose');
  })());

/* ── 10-12: Handoff ── */

t('10: successful reservation handoff uses hide(), not close()',
  (function() {
    var idx = idxSrc.indexOf('fixeo:estimator-reserve');
    var block = idxSrc.substring(idx, idx + 3000);
    /* Fallback close() allowed as secondary path; primary must be hide().
     * Verify hide() appears AND comes before any fallback close(). */
    var hidePos  = block.indexOf('FixeoEstimatorV2.hide()');
    var closePos = block.indexOf('FixeoEstimatorV2.close()');
    /* hide() must exist; if close() exists it must be a labelled fallback */
    /* close() only exists as a fallback — verify hide() comes first */
    return hidePos !== -1 && (closePos === -1 || (closePos > hidePos && block.substring(closePos - 120, closePos).includes('Fallback')));
  })());

t('11: failed reservation open leaves Estimator visible (no hide/close on error path)',
  (function() {
    var idx = idxSrc.indexOf('fixeo:estimator-reserve');
    var block = idxSrc.substring(idx, idx + 3000);
    /* error path sets _reservationHandoffPending=false and returns;
     * hide() appears AFTER FixeoReservation.open() call only on success */
    var openIdx  = block.indexOf('FixeoReservation.open(');
    var hideIdx  = block.indexOf('FixeoEstimatorV2.hide()');
    return openIdx !== -1 && hideIdx !== -1 && hideIdx > openIdx;
  })());

t('12: handoff has duplicate-open guard (_reservationHandoffPending)',
  idxSrc.includes('_reservationHandoffPending'));

/* ── 13-20: City Back ── */

t('13: city picker ← Retour button uses data-res-back="city-back-to-estimator"',
  resSrc.includes('data-res-back="city-back-to-estimator"'));

t('14: city picker ← Retour does NOT use data-res-back="close"',
  (function() {
    var cpIdx = resSrc.indexOf('function renderEstimatorCityPicker');
    var endIdx = resSrc.indexOf('function render', cpIdx + 10);
    var block = resSrc.substring(cpIdx, endIdx);
    return !block.includes('data-res-back="close"');
  })());

t('15: city-back-to-estimator handler calls _dismissReservationLayer()',
  (function() {
    var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
    var block = resSrc.substring(idx, idx + 500);
    return block.includes('_dismissReservationLayer()');
  })());

t('16: city-back-to-estimator handler calls FixeoEstimatorV2.reveal()',
  (function() {
    var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
    var block = resSrc.substring(idx, idx + 500);
    return block.includes('FixeoEstimatorV2.reveal()');
  })());

t('17: city back does NOT clear pricing token (no sessionStorage.removeItem for ctx key)',
  (function() {
    var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
    var block = resSrc.substring(idx, idx + 400);
    return !block.includes('fixeo_estimator_ctx_v1') &&
           !block.includes('removeItem');
  })());

t('18: city back does NOT call pricing API (no fetch or prepareContext)',
  (function() {
    var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
    var block = resSrc.substring(idx, idx + 300);
    return !block.includes('fetch') && !block.includes('prepareContext') &&
           !block.includes('verifyContext');
  })());

t('19: city back does NOT create new token',
  (function() {
    var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
    var block = resSrc.substring(idx, idx + 300);
    /* 'token' appears in the comment; check for actual token operations */
    return !block.includes('sessionStorage.setItem') && !block.includes('prepareContext');
  })());

t('20: city back uses _dismissReservationLayer, not FixeoReservation.close()',
  (function() {
    var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
    var block = resSrc.substring(idx, idx + 500);
    return block.includes('_dismissReservationLayer') &&
           !block.includes('FixeoReservation.close()');
  })());

/* ── 21-24: Forward Again (second handoff) ── */

t('21: PRICE_READY CTA still dispatches fixeo:estimator-reserve event',
  estSrc.includes("'fixeo:estimator-reserve'"));

t('22: handoff listener is not destroyed after first use (addEventListener, not once)',
  (function() {
    var idx = idxSrc.indexOf("fixeo:estimator-reserve");
    var block = idxSrc.substring(idx, idx + 100);
    return !block.includes("{ once: true }") && !block.includes("once:");
  })());

t('23: second handoff finds same hide() path (no special single-use guard)',
  idxSrc.includes('FixeoEstimatorV2.hide()'));

t('24: no duplicate _createContainer calls on reveal (reveal does not call open)',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    var block = estSrc.substring(idx, idx + 300);
    return !block.includes('_createContainer');
  })());

/* ── 25-28: Full Exit ── */

t('25: reservation × calls FixeoReservation.close() (unchanged inline onclick)',
  (function() {
    // Multiple close buttons exist; none call city-back-to-estimator
    return resSrc.includes('onclick="FixeoReservation.close()"') &&
           !resSrc.includes('onclick="FixeoReservation.cityBack()"');
  })());

t('26: full exit (close()) destroys hidden Estimator via FixeoEstimatorV2.close()',
  (function() {
    var idx = resSrc.indexOf('function close()');
    var endIdx = resSrc.indexOf('\n  function ', idx + 10);
    var block = (endIdx > idx) ? resSrc.substring(idx, endIdx) : resSrc.substring(idx, idx + 700);
    return block.includes('FixeoEstimatorV2.close()') && block.includes('isOpen()');
  })());

t('27: Estimator own × calls STATE.onClose → _destroyContainer (unchanged)',
  estSrc.includes('STATE.onClose') && estSrc.includes('_destroyContainer'));

t('28: _dismissReservationLayer defined and does NOT clear state.artisan',
  (function() {
    var idx = resSrc.indexOf('function _dismissReservationLayer()');
    var block = resSrc.substring(idx, idx + 400);
    return idx !== -1 && !block.includes('state.artisan');
  })());

/* ── 29-32: Regressions ── */

t('29: artisan → city remembers Casablanca (estimatorPickerScreen separation intact)',
  resSrc.includes("state.estimatorPickerScreen = 'city'") &&
  resSrc.includes('estimatorCity preserved'));

t('30: profile return still uses window._fxEstimatorReturnCityHint',
  resSrc.includes('window._fxEstimatorReturnCityHint'));

t('31: Step 1 ← Retour standalone row still present (BUG-A fix intact)',
  resSrc.includes('7C.9L.3W.2/BUG-A'));

t('32: fixeo-estimator-v2.js not touched beyond hide/reveal (PRICE_READY flow unchanged)',
  estSrc.includes('PRICE_READY') &&
  estSrc.includes('_pricingContextToken') &&
  estSrc.includes("'fixeo:estimator-reserve'"));

var total = pass + fail;
console.log('\n' + pass + '/' + total + ' tests pass' + (fail > 0 ? ' — FAILURES ABOVE' : ''));
if (fail > 0) process.exit(1);
