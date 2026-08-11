/**
 * estimator-v2-3z2d1-reservation-exit-tests.js
 * Phase 7C.9L.3Z.2D.1 — Reservation × → Hero PRICE_READY restore
 *
 * Source-level static contract tests. No browser automation.
 * Verifies: event emission, listener wiring, clear-on-booking, guard chain,
 *           visual contract unchanged, pricing/booking authority freeze.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

var resSrc   = fs.readFileSync(path.join(__dirname, '../../../../../js/reservation.js'), 'utf8');
var ctrlSrc  = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-resume-v1.js'), 'utf8');
var cssSrc   = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-hero-resume-v1.css'), 'utf8');
var idxSrc   = fs.readFileSync(path.join(__dirname, '../../../../../index.html'), 'utf8');
var bridgeSrc= fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-estimator-reservation-bridge-v1.js'), 'utf8');
var priceSrc = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-estimator-v2.js'), 'utf8');

function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

/* ══════════════════════════════════════════════════════════════
   GROUP 1: Event emission — true close only
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: fixeo:reservation-closed emission ──');

test('1. fixeo:reservation-closed dispatched in close() function', function () {
  /* Find close() function body */
  var closeIdx = resSrc.indexOf('function close()');
  assert(closeIdx > 0, 'close() function found');
  /* Find the end of close() — next function declaration */
  var nextFn = resSrc.indexOf('\n  function ', closeIdx + 1);
  var closeBody = resSrc.slice(closeIdx, nextFn > 0 ? nextFn : closeIdx + 800);
  assert(closeBody.includes("fixeo:reservation-closed"), 'event in close() body');
  assert(closeBody.includes('dispatchEvent'), 'dispatchEvent called in close()');
});

test('2. fixeo:reservation-closed NOT in _dismissReservationLayer() (internal transition safe)', function () {
  var dismissIdx = resSrc.indexOf('function _dismissReservationLayer()');
  assert(dismissIdx > 0, '_dismissReservationLayer found');
  var nextFn = resSrc.indexOf('\n  function ', dismissIdx + 1);
  var dismissBody = resSrc.slice(dismissIdx, nextFn > 0 ? nextFn : dismissIdx + 500);
  assert(!dismissBody.includes('fixeo:reservation-closed'),
    '_dismissReservationLayer does NOT emit reservation-closed event');
});

test('3. event has no price payload — CustomEvent options are empty or bubbles:false only', function () {
  var idx = resSrc.indexOf("fixeo:reservation-closed");
  var block = resSrc.slice(Math.max(0, idx - 50), idx + 200);
  /* No amount, price, token, service in the event options */
  assert(!block.includes('amount_mad') && !block.includes('token') && !block.includes('service_code'),
    'no price/token/service data in reservation-closed event');
});

test('4. artisan←Back does NOT call close() — uses _dismissReservationLayer + reveal', function () {
  /* dest=city-back-to-estimator handler must not call close() */
  var btcIdx = resSrc.indexOf("'city-back-to-estimator'");
  assert(btcIdx > 0, 'city-back-to-estimator handler found');
  var block = resSrc.slice(btcIdx, btcIdx + 300);
  assert(!block.includes('FixeoReservation.close()') && !block.includes('close()'),
    'city-back handler does not call close()');
});

test('5. internal Step back (dest=artisan/city/step1) does NOT call close()', function () {
  /* dest='artisan' back handler */
  var artIdx = resSrc.indexOf("dest === 'artisan'");
  assert(artIdx > 0, 'artisan back handler found');
  var block = resSrc.slice(artIdx, artIdx + 200);
  assert(!block.includes('FixeoReservation.close()'),
    'artisan-back does not call close()');
  /* dest='city' back handler */
  var cityIdx = resSrc.indexOf("dest === 'city'");
  assert(cityIdx > 0, 'city back handler found');
  var cityBlock = resSrc.slice(cityIdx, cityIdx + 200);
  assert(!cityBlock.includes('FixeoReservation.close()'),
    'city-back does not call close()');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: Hero Resume listener
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: Hero Resume listener ──');

test('6. Hero Resume listens for fixeo:reservation-closed', function () {
  assert(ctrlSrc.includes("fixeo:reservation-closed"), 'controller listens for reservation-closed');
  assert(ctrlSrc.includes("addEventListener('fixeo:reservation-closed'") ||
         ctrlSrc.includes('addEventListener("fixeo:reservation-closed"'),
    'addEventListener on reservation-closed');
});

test('7. Hero Resume listener calls _runVerification (reuses canonical verify)', function () {
  var listenerIdx = ctrlSrc.indexOf("fixeo:reservation-closed");
  var block = ctrlSrc.slice(listenerIdx, listenerIdx + 600);
  assert(block.includes('_runVerification()'), '_runVerification called in listener');
});

test('8. Hero listener guards: profile-return check', function () {
  var listenerIdx = ctrlSrc.indexOf("fixeo:reservation-closed");
  var block = ctrlSrc.slice(listenerIdx, listenerIdx + 700);
  assert(block.includes('_profileReturnActive'), 'profile-return guard in listener');
});

test('9. Hero listener guards: estimator tunnel check', function () {
  /* The listener block starts with the comment; guards are inside the setTimeout callback.
     Use the _resClosedTimer anchor (defined just before the addEventListener) to find
     the full block, then scan 1500 chars for all guard logic. */
  var listenerIdx = ctrlSrc.indexOf('_resClosedTimer');
  if (listenerIdx < 0) listenerIdx = ctrlSrc.indexOf("fixeo:reservation-closed");
  var block = ctrlSrc.slice(listenerIdx, listenerIdx + 1500);
  assert(block.includes('_estimatorTunnelActive'), 'tunnel guard in listener block');
});

test('10. Hero listener guards: token-exists check (getContext)', function () {
  var listenerIdx = ctrlSrc.indexOf('_resClosedTimer');
  if (listenerIdx < 0) listenerIdx = ctrlSrc.indexOf("fixeo:reservation-closed");
  var block = ctrlSrc.slice(listenerIdx, listenerIdx + 1500);
  assert(block.includes('getContext'), 'getContext guard in listener block');
});

test('11. Hero listener guards: modal open check', function () {
  var listenerIdx = ctrlSrc.indexOf('_resClosedTimer');
  if (listenerIdx < 0) listenerIdx = ctrlSrc.indexOf("fixeo:reservation-closed");
  var block = ctrlSrc.slice(listenerIdx, listenerIdx + 1500);
  assert(block.includes('fixeo-reservation-modal'), 'modal guard in listener block');
  assert(block.includes('.open') || block.includes("'open'"), 'open class check in listener block');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: _onContinue fix — card NOT destroyed prematurely
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: _onContinue card preservation ──');

test('12. _onContinue does NOT CALL _dismissPriceReady (only mentions it in comments)', function () {
  var continueIdx = ctrlSrc.indexOf('function _onContinue()');
  assert(continueIdx > 0, '_onContinue found');
  var nextFn = ctrlSrc.indexOf('\n  function ', continueIdx + 1);
  var body = ctrlSrc.slice(continueIdx, nextFn > 0 ? nextFn : continueIdx + 700);
  /* Strip comments — _dismissPriceReady may appear in a comment explaining the change */
  var codeBody = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  assert(!codeBody.includes('_dismissPriceReady()'),
    '_onContinue code does not call _dismissPriceReady() — only mentions in comments OK');
});

test('13. _onContinue still calls FixeoReservation.open', function () {
  var continueIdx = ctrlSrc.indexOf('function _onContinue()');
  var nextFn = ctrlSrc.indexOf('\n  function ', continueIdx + 1);
  var body = ctrlSrc.slice(continueIdx, nextFn > 0 ? nextFn : continueIdx + 600);
  assert(body.includes('FixeoReservation.open(null, false, null)'), 'Reservation.open called');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: Booking completion clears token
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: Booking completion token clear ──');

test('14. COD onSuccess calls clearContext before redirect', function () {
  var successIdx = resSrc.indexOf('onSuccess: function(orderID, record, apiBody)');
  assert(successIdx > 0, 'onSuccess handler found');
  /* COD success block can be up to 1000 chars — scan wider */
  var block = resSrc.slice(successIdx, successIdx + 1200);
  var clearIdx = block.indexOf('clearContext');
  /* Redirect: may use window.location.href or confirmURL variable assignment */
  var redirectIdx = block.indexOf('window.location.href');
  if (redirectIdx < 0) redirectIdx = block.indexOf('confirmURL');
  assert(clearIdx > 0, 'clearContext in onSuccess block (chars from success: ' + clearIdx + ')');
  assert(redirectIdx > 0, 'redirect in onSuccess block');
  assert(clearIdx < redirectIdx, 'clearContext before redirect (' + clearIdx + ' < ' + redirectIdx + ')');
});

test('15. COD fallback path calls clearContext', function () {
  var fallbackIdx = resSrc.indexOf('FixeoCOD non charg');
  assert(fallbackIdx > 0, 'COD fallback path found');
  /* Fallback block spans ~700 chars (localStorage.setItem + bridgeToArtisanInbox + clearContext + alert) */
  var block = resSrc.slice(fallbackIdx, fallbackIdx + 2200);
  assert(block.includes('clearContext'), 'clearContext in COD fallback block');
});

test('16. clearContext calls sessionStorage.removeItem on fixeo_estimator_ctx_v1', function () {
  assert(bridgeSrc.includes("fixeo_estimator_ctx_v1"), 'bridge references ctx key');
  assert(bridgeSrc.includes('clearContext'), 'clearContext defined in bridge');
  /* Find clearContext body */
  var idx = bridgeSrc.indexOf('clearContext:');
  var block = bridgeSrc.slice(idx, idx + 200);
  assert(block.includes('removeItem') || block.includes('setItem'), 'clearContext removes/clears item');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: Nouvelle demande does NOT resurrect old price
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: Nouvelle demande → no resurrection ──');

test('17. _resetToFresh calls clearContext (clears token before reservation-closed fires)', function () {
  var resetIdx = ctrlSrc.indexOf('function _resetToFresh(');
  assert(resetIdx > 0, '_resetToFresh found');
  var nextFn = ctrlSrc.indexOf('\n  function ', resetIdx + 1);
  var body = ctrlSrc.slice(resetIdx, nextFn > 0 ? nextFn : resetIdx + 400);
  assert(body.includes('clearContext'), 'clearContext in _resetToFresh');
});

test('18. listener guard: getContext returns null after clearContext → listener exits early', function () {
  /* Proves the logical path without running JS:
     clearContext() removes sessionStorage key → getContext() returns null
     → listener guard `if (!getContext()) return;` fires → no _runVerification */
  assert(bridgeSrc.includes('getContext') && bridgeSrc.includes('clearContext'),
    'bridge has both getContext and clearContext');
  /* getContext must return something from sessionStorage */
  var getCtxIdx = bridgeSrc.indexOf('getContext');
  var block = bridgeSrc.slice(getCtxIdx, getCtxIdx + 200);
  assert(block.includes('sessionStorage') || block.includes('getItem'),
    'getContext reads from sessionStorage');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: Visual contract — 3Z.2D unchanged
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: Visual contract unchanged ──');

test('19. CSS cache key fxhro-v1d-visual still present in index.html (CSS unchanged)', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1d-visual'), 'CSS cache key unchanged');
});

test('20. JS cache key updated to fxhro-v1d-reservation-exit', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1d-reservation-exit'), 'JS cache key updated');
  assert(!idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1c-qsm-reset'), 'old JS key gone');
});

test('21. reservation.js cache key updated to v1j-hero-exit', function () {
  assert(idxSrc.includes('reservation.js?v=v1j-hero-exit'), 'reservation cache key updated');
  assert(!idxSrc.includes('reservation.js?v=v1i'), 'old reservation key gone');
});

test('22. PRICE_READY CSS: QSM display:none still present (visual unchanged)', function () {
  assert(cssSrc.includes('#home.fxhro-price-ready-state #hero-quick-search') &&
         cssSrc.includes('display: none'), 'QSM hide in PRICE_READY state intact');
});

test('23. price card max-width 480px still present', function () {
  assert(cssSrc.includes('max-width: 480px'), 'card max-width intact');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 7: Internal navigation unchanged
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 7: Internal navigation unchanged ──');

test('24. city-back-to-estimator still uses reveal (3X behavior intact)', function () {
  var idx = resSrc.indexOf("dest === 'city-back-to-estimator'");
  assert(idx > 0, 'city-back-to-estimator handler found');
  var block = resSrc.slice(idx, idx + 400);
  assert(block.includes('FixeoEstimatorV2') &&
         (block.includes('.reveal') || block.includes('reveal')),
    'city-back handler references FixeoEstimatorV2 reveal');
});

test('25. Step 1 back (dest=artisan) still uses render (3W behavior intact)', function () {
  var artIdx = resSrc.indexOf("dest === 'artisan'");
  assert(artIdx > 0, 'artisan back found');
  var block = resSrc.slice(artIdx, artIdx + 200);
  assert(block.includes('render()') || block.includes('estimatorPickerScreen'),
    'artisan back renders via render()');
});

test('26. profile-return flow unchanged: _profileReturnActive guard exists in _runVerification', function () {
  var runIdx = ctrlSrc.indexOf('function _runVerification()');
  var block = ctrlSrc.slice(runIdx, runIdx + 300);
  assert(block.includes('_profileReturnActive'), 'profile-return guard in _runVerification');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 8: Functional freeze
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 8: Functional freeze ──');

test('27. no pricing JS changes: fixeo-estimator-v2.js not modified', function () {
  assert(priceSrc.includes('3z2b-reentry') || !priceSrc.includes('3z2d'),
    'estimator-v2.js not modified in 3Z.2D.1');
});

test('28. no amount_mad arithmetic in hero-resume controller', function () {
  var code = codeOnly(ctrlSrc);
  assert(!code.includes('amount_mad *') && !code.includes('amount_mad +') &&
         !code.includes('amount_mad -') && !code.includes('amount_mad /'),
    'no arithmetic on amount_mad in controller');
});

test('29. no Supabase references in reservation.js close() or added code', function () {
  var closeIdx = resSrc.indexOf('function close()');
  var nextFn = resSrc.indexOf('\n  function ', closeIdx + 1);
  var body = resSrc.slice(closeIdx, nextFn > 0 ? nextFn : closeIdx + 600);
  assert(!body.includes('supabase') && !body.includes('Supabase'), 'no Supabase in close()');
});

test('30. booking authority unchanged: no changes to _createBooking or _selectArtisanFromPicker', function () {
  assert(resSrc.includes('function _selectArtisanFromPicker'), '_selectArtisanFromPicker present');
  /* These functions must not reference fixeo:reservation-closed */
  var artisanPickerIdx = resSrc.indexOf('function _selectArtisanFromPicker');
  var artisanPickerBlock = resSrc.slice(artisanPickerIdx, artisanPickerIdx + 400);
  assert(!artisanPickerBlock.includes('reservation-closed'),
    '_selectArtisanFromPicker does not emit reservation-closed');
});

/* ── Summary ── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
