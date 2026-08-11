#!/usr/bin/env node
/* Phase 7C.9L.3Y.1 — Floating Urgence Suppression During Estimator Tunnel
 * 27 targeted tests. Run: node estimator-v2-3y-urgence-tunnel-tests.js
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '../../../../..');

var estSrc = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
var fabCss = fs.readFileSync(path.join(root, 'css/urgent-fab.css'),        'utf8');
var resSrc = fs.readFileSync(path.join(root, 'js/reservation.js'),        'utf8');
var idxSrc = fs.readFileSync(path.join(root, 'index.html'),               'utf8');

var pass = 0, fail = 0;
function t(label, result) {
  if (result) { pass++; console.log('  PASS: ' + label); }
  else        { fail++; console.log('  FAIL: ' + label); }
}

console.log('Phase 7C.9L.3Y.1 — Floating Urgence Tunnel Suppression Tests');

/* ── 1-8: Estimator lifecycle — tunnel class ── */

t('1: open() adds fx-estimator-tunnel-active to body',
  estSrc.includes("document.body.classList.add('fx-estimator-tunnel-active')"));

t('2: class added only after successful Estimator render (inside try, after render())',
  (function() {
    var addIdx = estSrc.indexOf("document.body.classList.add('fx-estimator-tunnel-active')");
    /* render() is ~270 chars before the classList.add call */
    var before = estSrc.substring(addIdx - 400, addIdx);
    return before.includes('_activeModal.render()');
  })());

t('3: hide() does NOT touch fx-estimator-tunnel-active',
  (function() {
    var idx = estSrc.indexOf('hide: function()');
    var block = estSrc.substring(idx, idx + 400);
    return !block.includes('fx-estimator-tunnel-active');
  })());

t('4: reveal() does NOT touch fx-estimator-tunnel-active',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    var block = estSrc.substring(idx, idx + 400);
    return !block.includes('fx-estimator-tunnel-active');
  })());

t('5: _destroyContainer() removes fx-estimator-tunnel-active',
  (function() {
    var idx = estSrc.indexOf('function _destroyContainer()');
    var block = estSrc.substring(idx, idx + 400);
    return block.includes("document.body.classList.remove('fx-estimator-tunnel-active')");
  })());

t('6: class removed BEFORE container removed (no orphan if removal throws)',
  (function() {
    var idx = estSrc.indexOf('function _destroyContainer()');
    // 7C.9L.3Z.2B: window extended from 400→700 to accommodate idempotency guard
    var block = estSrc.substring(idx, idx + 700);
    var removeClassPos = block.indexOf("classList.remove('fx-estimator-tunnel-active')");
    var removeNodePos  = block.indexOf('parentNode.removeChild');
    return removeClassPos !== -1 && removeNodePos !== -1 && removeClassPos < removeNodePos;
  })());

t('7: failed open() path does NOT add tunnel class (class added after render, not before)',
  (function() {
    /* catch block must not reference add('fx-estimator-tunnel-active') */
    var catchIdx = estSrc.indexOf('} catch (e) {\n        // open() failed');
    var catchBlock = estSrc.substring(catchIdx, catchIdx + 200);
    return !catchBlock.includes("classList.add('fx-estimator-tunnel-active')");
  })());

t('8: close() path reaches _destroyContainer (via STATE.onClose) — class removed',
  estSrc.includes('close: function()') &&
  estSrc.includes('STATE.onClose') &&
  estSrc.includes('_destroyContainer'));

/* ── 9-13: CSS suppression ── */

t('9: urgent-fab.css has body.fx-estimator-tunnel-active selector',
  fabCss.includes('body.fx-estimator-tunnel-active #fixeo-urgent-fab'));

t('10: selector targets only #fixeo-urgent-fab (not .chat-widget or other elements)',
  (function() {
    /* Use the actual CSS rule line, not the comment that also contains the class name */
    var idx = fabCss.indexOf('body.fx-estimator-tunnel-active #fixeo-urgent-fab');
    var block = fabCss.substring(idx, idx + 300);
    return idx !== -1 && block.includes('#fixeo-urgent-fab') &&
           !block.includes('chat-widget') && !block.includes('whatsapp');
  })());

t('11: suppression sets opacity:0',
  (function() {
    var idx = fabCss.indexOf('body.fx-estimator-tunnel-active #fixeo-urgent-fab');
    var block = fabCss.substring(idx, idx + 300);
    return idx !== -1 && block.includes('opacity: 0 !important');
  })());

t('12: suppression sets pointer-events:none',
  (function() {
    var idx = fabCss.indexOf('body.fx-estimator-tunnel-active #fixeo-urgent-fab');
    var block = fabCss.substring(idx, idx + 300);
    return idx !== -1 && block.includes('pointer-events: none !important');
  })());

t('13: WhatsApp .chat-widget NOT referenced in tunnel suppression rule',
  (function() {
    var idx = fabCss.indexOf('body.fx-estimator-tunnel-active #fixeo-urgent-fab');
    var block = fabCss.substring(idx, idx + 400);
    return idx !== -1 && !block.includes('chat-widget') && !block.includes('chat-toggle');
  })());

/* ── 14-20: Lifecycle handoff proofs ── */

t('14: RAFI → Estimator: class added in open() which is called by RAFI handoff',
  estSrc.includes("document.body.classList.add('fx-estimator-tunnel-active')") &&
  /* RAFI calls FixeoEstimatorV2.open() — no RAFI source change needed */
  !fs.readFileSync(path.join(root, 'js/fx-request-flow-v4.js'), 'utf8')
        .includes('fx-estimator-tunnel-active'));

t('15: PRICE_READY: class remains — hide() does not remove it',
  (function() {
    /* After handoff uses hide(), class stays. Verify hide() block is clean. */
    var idx = estSrc.indexOf('hide: function()');
    return estSrc.substring(idx, idx + 400).indexOf('fx-estimator-tunnel-active') === -1;
  })());

t('16: Estimator hide() (Estimator→Reservation handoff) preserves tunnel ownership',
  (function() {
    /* hide() only touches visibility/pointerEvents; class untouched */
    var idx = estSrc.indexOf('hide: function()');
    var block = estSrc.substring(idx, idx + 300);
    return block.includes('visibility') && !block.includes('fx-estimator-tunnel-active');
  })());

t('17: reservation flow: fixeo-booking-modal-open added by reservation.open() — class coexists',
  resSrc.includes("document.body.classList.add('fixeo-booking-modal-open')") &&
  /* reservation.js must NOT touch fx-estimator-tunnel-active */
  !resSrc.includes('fx-estimator-tunnel-active'));

t('18: city Back → reveal(): class remains (reveal() is clean)',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    return estSrc.substring(idx, idx + 400).indexOf('fx-estimator-tunnel-active') === -1;
  })());

t('19: second reservation handoff: open() already resolved — isOpen()=true returns early; class already present',
  (function() {
    /* open() guard: if (_activeModal) return accepted:true without re-adding class
     * (class is already on body from first open). This is correct — no double-add needed. */
    var idx = estSrc.indexOf('if (_activeModal)');
    var block = estSrc.substring(idx, idx + 100);
    return block.includes('accepted: true') && !block.includes('classList.add');
  })());

t('20: true exit restores FAB — _destroyContainer removes class, urgency CSS rule stops matching',
  (function() {
    var idx = estSrc.indexOf('function _destroyContainer()');
    var block = estSrc.substring(idx, idx + 400);
    return block.includes("classList.remove('fx-estimator-tunnel-active')");
  })());

/* ── 21-27: Regressions ── */

t('21: 3X hide() semantics unchanged (visibility toggle only)',
  (function() {
    var idx = estSrc.indexOf('hide: function()');
    var block = estSrc.substring(idx, idx + 300);
    return block.includes('visibility') && block.includes('pointerEvents') &&
           !block.includes('_destroyContainer') && !block.includes('_activeContainer = null');
  })());

t('22: 3X reveal() semantics unchanged',
  (function() {
    var idx = estSrc.indexOf('reveal: function()');
    var block = estSrc.substring(idx, idx + 300);
    return block.includes('visibility') && !block.includes('_destroyContainer');
  })());

t('23: city-back-to-estimator handler unchanged in reservation.js',
  resSrc.includes("dest === 'city-back-to-estimator'") &&
  resSrc.includes('_dismissReservationLayer()') &&
  resSrc.includes('FixeoEstimatorV2.reveal()'));

t('24: Step 1 standalone ← Retour (3W.2 BUG-A) unchanged',
  resSrc.includes('7C.9L.3W.2/BUG-A'));

t('25: window._fxEstimatorReturnCityHint (3W.2 BUG-B) unchanged',
  resSrc.includes('window._fxEstimatorReturnCityHint'));

t('26: estimatorPickerScreen city-memory (3W) unchanged',
  resSrc.includes("state.estimatorPickerScreen = 'city'"));

t('27: reservation.js NOT modified in this phase (no fx-estimator-tunnel-active in res.js)',
  !resSrc.includes('fx-estimator-tunnel-active'));

var total = pass + fail;
console.log('\n' + pass + '/' + total + ' tests pass' + (fail > 0 ? ' — FAILURES ABOVE' : ''));
if (fail > 0) process.exit(1);
