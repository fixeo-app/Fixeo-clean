/**
 * Phase 7C.10D.2.1 — Urgent SUCCESS Preserve / Estimator Return
 * Targeted source tests: 40 total
 */
'use strict';

var assert = require('assert');
var fs     = require('fs');
var path   = require('path');

var REPO       = path.resolve(__dirname, '../../../../..');
var FXRF4_JS   = path.join(REPO, 'js/fx-request-flow-v4.js');
var FXRF4_CSS  = path.join(REPO, 'css/fx-request-flow-v4.css');
var EST_JS     = path.join(REPO, 'js/fixeo-estimator-v2.js');
var INDEX_HTML = path.join(REPO, 'index.html');
var RES_JS     = path.join(REPO, 'js/reservation.js');

var src = fs.readFileSync(FXRF4_JS, 'utf8');
var css = fs.readFileSync(FXRF4_CSS, 'utf8');
var est = fs.readFileSync(EST_JS, 'utf8');
var idx = fs.readFileSync(INDEX_HTML, 'utf8');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch(e) { console.error('  \u2717 ' + name); console.error('    ' + e.message); failed++; }
}

/* Use the full src for most checks — more reliable than windowed slices */

/* Locate _renderSuccess to scope bridge-specific checks */
var renderSuccessIdx = src.lastIndexOf('function _renderSuccess');
var bridgeSection = src.slice(renderSuccessIdx);

/* _onEstimatorClosed function body — find it globally */
var closedFnStart = src.indexOf('function _onEstimatorClosed');
var closedFnBody  = src.slice(closedFnStart, closedFnStart + 1400);

/* _onEstimatorReserve function body */
var reserveFnStart = src.indexOf('function _onEstimatorReserve');
var reserveFnBody  = src.slice(reserveFnStart, reserveFnStart + 600);

/* bridgeCTA click handler — between "bridgeCTA.addEventListener" and "bridgeSkip.addEventListener" */
var ctaStart  = src.indexOf('bridgeCTA.addEventListener');
var ctaEnd    = src.indexOf('bridgeSkip.addEventListener');
var bridgeCTA = src.slice(ctaStart, ctaEnd);

/* Open and catch blocks — after FixeoEstimatorV2.open(entryCtx) */
var openCallIdx = src.indexOf('window.FixeoEstimatorV2.open(entryCtx)');
var openBlock   = src.slice(openCallIdx, openCallIdx + 2500);

/* ── 1. SUSPENSION CONTRACT — NO close() BEFORE open() ────── */
console.log('\n[10D.2.1] Suspension contract');

test('1.1 bridge CTA does NOT call close() immediately before FixeoEstimatorV2.open()', function () {
  /* The old code called close() before open(). Now we suspend instead.
   * Look at the 200 chars directly before the open() call — should have no close(). */
  var openIdx  = bridgeCTA.indexOf('window.FixeoEstimatorV2.open(entryCtx)');
  var immediately = bridgeCTA.slice(Math.max(0, openIdx - 200), openIdx);
  assert.ok(!immediately.includes('close()'),
    'close() must NOT be called in the ~200 chars before open() (suspension, not destroy)');
});

test('1.2 fxrf4-estimator-child class is added before open()', function () {
  var childAddIdx = bridgeCTA.indexOf("classList.add('fxrf4-estimator-child')");
  var openIdx     = bridgeCTA.indexOf('window.FixeoEstimatorV2.open(entryCtx)');
  assert.ok(childAddIdx !== -1, 'fxrf4-estimator-child must be added');
  assert.ok(childAddIdx < openIdx, 'Must be added BEFORE FixeoEstimatorV2.open()');
});

test('1.3 _unlock() called before open() to release scroll lock', function () {
  var unlockIdx = bridgeCTA.indexOf('_unlock()');
  var openIdx   = bridgeCTA.indexOf('window.FixeoEstimatorV2.open(entryCtx)');
  assert.ok(unlockIdx !== -1, '_unlock() must be called');
  assert.ok(unlockIdx < openIdx, '_unlock() must be before open()');
});

test('1.4 _isOpen NOT set to false during suspension (state preserved)', function () {
  assert.ok(!bridgeCTA.includes('_isOpen = false'),
    '_isOpen must remain true during suspension');
});

test('1.5 _st NOT set to null during suspension (state preserved)', function () {
  assert.ok(!bridgeCTA.includes('_st = null'),
    '_st must not be nulled during suspension');
});

/* ── 2. RETURN DETECTION: fixeo:estimator-closed ─────────────── */
console.log('\n[10D.2.1] Return detection');

test('2.1 _onEstimatorClosed listener registered on fixeo:estimator-closed', function () {
  assert.ok(bridgeCTA.includes("'fixeo:estimator-closed'") &&
            bridgeCTA.includes('_onEstimatorClosed'),
    'Must register _onEstimatorClosed for fixeo:estimator-closed');
});

test('2.2 _onEstimatorClosed removes itself (one-shot)', function () {
  assert.ok(closedFnBody.includes("removeEventListener('fixeo:estimator-closed'"),
    '_onEstimatorClosed must remove itself from fixeo:estimator-closed');
});

test('2.3 fxrf4-estimator-child removed in _onEstimatorClosed', function () {
  assert.ok(closedFnBody.includes("classList.remove('fxrf4-estimator-child')"),
    '_onEstimatorClosed must remove fxrf4-estimator-child');
});

test('2.4 _lock() re-applied in non-escalated branch of _onEstimatorClosed', function () {
  /* Non-escalated branch is the else {} block */
  var elseIdx = closedFnBody.indexOf('} else {');
  assert.ok(elseIdx > 0, '_onEstimatorClosed must have an else branch');
  var elseBranch = closedFnBody.slice(elseIdx);
  assert.ok(elseBranch.includes('_lock()'),
    'Non-escalated else branch must call _lock() to restore scroll');
});

test('2.5 No _renderSuccess in _onEstimatorClosed — existing DOM preserved, no re-render', function () {
  assert.ok(!closedFnBody.includes('_renderSuccess'),
    '_renderSuccess must NOT be called in _onEstimatorClosed');
});

test('2.6 No _persistEmergencyRequest in _onEstimatorClosed — no second POST', function () {
  assert.ok(!closedFnBody.includes('_persistEmergencyRequest'),
    'No _persistEmergencyRequest in _onEstimatorClosed');
});

/* ── 3. ESCALATION GUARD: fixeo:estimator-reserve ────────────── */
console.log('\n[10D.2.1] Escalation guard');

test('3.1 _onEstimatorReserve listener registered on fixeo:estimator-reserve', function () {
  assert.ok(bridgeCTA.includes("'fixeo:estimator-reserve'") &&
            bridgeCTA.includes('_onEstimatorReserve'),
    'Must register _onEstimatorReserve for fixeo:estimator-reserve');
});

test('3.2 _escalated flag defined and initially false', function () {
  assert.ok(src.indexOf('var _escalated = false') > ctaStart,
    '_escalated must be defined as false in bridge CTA scope');
});

test('3.3 _onEstimatorReserve sets _escalated = true', function () {
  assert.ok(reserveFnBody.includes('_escalated = true'),
    '_onEstimatorReserve must set _escalated = true');
});

test('3.4 Escalated path calls close() to silently clean up fxrf4', function () {
  /* Escalated path = if (_escalated) { ... } in _onEstimatorClosed */
  var ifEscIdx = closedFnBody.indexOf('if (_escalated)');
  var ifEscBlock = closedFnBody.slice(ifEscIdx, closedFnBody.indexOf('} else {', ifEscIdx));
  assert.ok(ifEscBlock.includes('close()'),
    'Escalated branch must call close()');
});

test('3.5 Escalated branch does NOT call _lock() (urgent SUCCESS stays hidden)', function () {
  var ifEscIdx = closedFnBody.indexOf('if (_escalated)');
  var elseIdx  = closedFnBody.indexOf('} else {', ifEscIdx);
  var escalatedBranch = closedFnBody.slice(ifEscIdx, elseIdx);
  assert.ok(!escalatedBranch.includes('_lock()'),
    'Escalated branch must not call _lock() (do not reveal urgent SUCCESS)');
});

test('3.6 _onEstimatorReserve removes itself (one-shot)', function () {
  assert.ok(reserveFnBody.includes("removeEventListener('fixeo:estimator-reserve'"),
    '_onEstimatorReserve must remove itself (one-shot)');
});

/* ── 4. OPEN FAILURE SAFETY ──────────────────────────────────── */
console.log('\n[10D.2.1] Open failure safety');

test('4.1 Catch handler removes fxrf4-estimator-child on open() throw', function () {
  var catchIdx   = openBlock.indexOf('.catch(function()');
  var catchBlock = openBlock.slice(catchIdx, catchIdx + 600);
  assert.ok(catchBlock.includes("classList.remove('fxrf4-estimator-child')"),
    'Catch handler must remove fxrf4-estimator-child');
});

test('4.2 Catch handler calls _lock() to restore scroll', function () {
  var catchIdx   = openBlock.indexOf('.catch(function()');
  var catchBlock = openBlock.slice(catchIdx, catchIdx + 600);
  assert.ok(catchBlock.includes('_lock()'), 'Catch handler must re-lock scroll');
});

test('4.3 Catch handler shows fxrf4-bridge-open-error (not retry-for-POST)', function () {
  var catchIdx   = openBlock.indexOf('.catch(function()');
  var catchBlock = openBlock.slice(catchIdx, catchIdx + 600);
  assert.ok(catchBlock.includes('fxrf4-bridge-open-error'),
    'Catch handler must show fxrf4-bridge-open-error');
  assert.ok(!catchBlock.includes('_persistEmergencyRequest') &&
            !catchBlock.includes('/api/urgent-request'),
    'Catch handler must NOT trigger another urgent POST');
});

test('4.4 accepted:false/falsy path also restores urgent parent (then handler)', function () {
  var thenIdx    = openBlock.indexOf('.then(function(result)');
  var thenBlock  = openBlock.slice(thenIdx, thenIdx + 800);
  /* Must check !result.accepted or result.accepted falsy */
  assert.ok(thenBlock.includes('!result') || thenBlock.includes('accepted'),
    'Then handler must check accepted');
  assert.ok(thenBlock.includes("classList.remove('fxrf4-estimator-child')"),
    'Accepted:false path must remove fxrf4-estimator-child (restore parent)');
});

/* ── 5. LIFECYCLE SIGNALS — ESTIMATOR JS UNCHANGED ─────────── */
console.log('\n[10D.2.1] Estimator lifecycle unchanged');

test('5.1 fixeo:estimator-closed still dispatched in _destroyContainer', function () {
  assert.ok(est.includes("'fixeo:estimator-closed'"),
    'Estimator must still dispatch fixeo:estimator-closed');
});

test('5.2 fixeo:estimator-reserve still dispatched in Estimator', function () {
  assert.ok(est.includes("'fixeo:estimator-reserve'"),
    'Estimator must still dispatch fixeo:estimator-reserve');
});

test('5.3 fx-estimator-tunnel-active class still managed in Estimator', function () {
  assert.ok(est.includes('fx-estimator-tunnel-active'),
    'Estimator must still manage fx-estimator-tunnel-active');
});

test('5.4 Estimator JS is not modified (frozen sentinel strings present)', function () {
  assert.ok(est.includes('7C.9L.3Z.2B'), 'Must contain 7C.9L.3Z.2B sentinel');
  assert.ok(est.includes('7C.9L.3Y.1'),  'Must contain 7C.9L.3Y.1 sentinel');
});

/* ── 6. CSS SUSPEND RULES ────────────────────────────────────── */
console.log('\n[10D.2.1] CSS suspension rules');

test('6.1 fxrf4-estimator-child CSS rule defined', function () {
  assert.ok(css.includes('fxrf4-estimator-child'),
    'CSS must define fxrf4-estimator-child rule');
});

test('6.2 fxrf4-estimator-child sets opacity:0 (with or without spaces)', function () {
  var ruleIdx = css.indexOf('fxrf4-estimator-child');
  var ruleBlock = css.slice(ruleIdx, ruleIdx + 300);
  assert.ok(ruleBlock.includes('opacity: 0') || ruleBlock.includes('opacity:0'),
    'Must have opacity: 0');
});

test('6.3 fxrf4-estimator-child sets pointer-events:none', function () {
  var ruleIdx   = css.indexOf('fxrf4-estimator-child');
  var ruleBlock = css.slice(ruleIdx, ruleIdx + 300);
  assert.ok(ruleBlock.includes('pointer-events: none') || ruleBlock.includes('pointer-events:none'),
    'Must have pointer-events: none');
});

test('6.4 fxrf4-estimator-child sets visibility:hidden (a11y)', function () {
  /* Find the actual CSS rule block, not the comment */
  var ruleIdx = css.indexOf('#fxrf4-root.fxrf4-estimator-child');
  if (ruleIdx < 0) ruleIdx = css.indexOf('.fxrf4-estimator-child {');
  assert.ok(ruleIdx >= 0, 'CSS rule for fxrf4-estimator-child must exist');
  var ruleBlock = css.slice(ruleIdx, ruleIdx + 300);
  assert.ok(ruleBlock.includes('visibility: hidden') || ruleBlock.includes('visibility:hidden'),
    'Must have visibility: hidden');
});

test('6.5 fxrf4-bridge-open-error CSS defined', function () {
  assert.ok(css.includes('fxrf4-bridge-open-error'),
    'CSS must define .fxrf4-bridge-open-error');
});

/* ── 7. PAS MAINTENANT UNCHANGED ────────────────────────────── */
console.log('\n[10D.2.1] Pas maintenant unchanged');

var skipStart = src.indexOf('bridgeSkip.addEventListener');
var skipEnd   = src.indexOf('bridgeWrap.appendChild(bridgeEyebrow)');
var skipBlock = src.slice(skipStart, skipEnd);

test('7.1 "Pas maintenant" does not open Estimator', function () {
  assert.ok(!skipBlock.includes('FixeoEstimatorV2'),
    '"Pas maintenant" must not open Estimator');
});

test('7.2 "Pas maintenant" does not suspend fxrf4', function () {
  assert.ok(!skipBlock.includes('fxrf4-estimator-child'),
    '"Pas maintenant" must not add fxrf4-estimator-child');
});

test('7.3 "Pas maintenant" removes bridgeWrap from DOM (existing behavior)', function () {
  assert.ok(skipBlock.includes('removeChild') || skipBlock.includes('parentNode'),
    '"Pas maintenant" must remove bridgeWrap from DOM');
});

/* ── 8. PRICING/AUTHORITY UNCHANGED ─────────────────────────── */
console.log('\n[10D.2.1] Pricing authority unchanged');

test('8.1 No pricing_context_token in bridge handler', function () {
  assert.ok(!bridgeCTA.includes('pricing_context_token'),
    'No pricing_context_token in bridge CTA handler');
});

test('8.2 No amount_mad in bridge handler', function () {
  assert.ok(!bridgeCTA.includes('amount_mad'), 'No amount_mad in bridge CTA handler');
});

test('8.3 reservation.js not cross-contaminated by fxrf4-estimator-child', function () {
  var resContent = fs.readFileSync(RES_JS, 'utf8');
  assert.ok(!resContent.includes('fxrf4-estimator-child'),
    'reservation.js must not reference fxrf4-estimator-child');
});

/* ── 9. CACHE KEYS ───────────────────────────────────────────── */
console.log('\n[10D.2.1] Cache keys');

test('9.1 JS cache key: fxrf4-v5e-final-polish in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.js?v=fxrf4-v5e-final-polish'),
    'JS key must be fxrf4-v5e-final-polish');
});

test('9.2 CSS cache key: fxrf4-v5z4-final-polish in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.css?v=fxrf4-v5z4-final-polish'),
    'CSS key must be fxrf4-v5z4-final-polish');
});

test('9.3 VERSION constant: fxrf4-v5e-final-polish', function () {
  assert.ok(src.includes("VERSION: 'fxrf4-v5e-final-polish'"),
    'VERSION must be fxrf4-v5e-final-polish');
});

/* ── SUMMARY ─────────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(60));
console.log('[10D.2.1] Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
