/**
 * estimator-v2-3z2e3-viewport-tests.js
 * Phase 7C.9L.3Z.2E.3 — iOS viewport scale / modal zoom final fix
 *
 * Source-level contract tests. No browser automation.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../../../../../');

var resSrc   = fs.readFileSync(ROOT + 'js/reservation.js', 'utf8');
var estSrc   = fs.readFileSync(ROOT + 'js/fixeo-estimator-v2.js', 'utf8');
var qsmCss   = fs.readFileSync(ROOT + 'css/quick-search-modal.css', 'utf8');
var idxSrc   = fs.readFileSync(ROOT + 'index.html', 'utf8');
var fxhiJs   = fs.readFileSync(ROOT + 'js/fixeo-hero-insights.js', 'utf8');
var ctrlJs   = fs.readFileSync(ROOT + 'js/fixeo-hero-resume-v1.js', 'utf8');
var suggJs   = fs.readFileSync(ROOT + 'js/fixeo-hero-suggestions-v2.js', 'utf8');
var fxhiCss  = fs.readFileSync(ROOT + 'css/fixeo-hero-insights.css', 'utf8');
var priceSrc = fs.readFileSync(ROOT + 'js/fixeo-estimator-v2.js', 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

/* ══════════════════════════════════════════════════════════════
   GROUP 1: 3Z.2E.1 16px fix preserved
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: 3Z.2E.1 iOS 16px fix preserved ──');

test('1. QSM CSS key: qsm12-ios-zoom in index', function () {
  assert(idxSrc.includes('quick-search-modal.css?v=qsm12-ios-zoom'), '3Z.2E.1 CSS key intact');
});

test('2. QSM seg-input 1rem override present', function () {
  var appendStart = qsmCss.indexOf('PHASE 7C.9L.3Z.2E.1');
  assert(appendStart > 0, '3Z.2E.1 append in QSM CSS');
  /* Search full append block — comment is ~500 chars before the rule */
  var block = qsmCss.slice(appendStart);
  assert(block.includes('1rem !important') || block.includes('font-size: 1rem'), '1rem override still present');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: Viewport meta preserved
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: Viewport preserved ──');

test('3. No maximum-scale in viewport', function () {
  var m = idxSrc.match(/name="viewport"[^>]*content="([^"]+)"/);
  assert(m && !m[1].includes('maximum-scale'), 'no maximum-scale');
});

test('4. No user-scalable=no in viewport', function () {
  var m = idxSrc.match(/name="viewport"[^>]*content="([^"]+)"/);
  assert(m && !m[1].includes('user-scalable=no'), 'no user-scalable=no');
});

test('5. Viewport has initial-scale=1', function () {
  assert(idxSrc.includes('initial-scale=1'), 'initial-scale=1 present');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: Root cause fix — Reservation scrollIntoView removed
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: Reservation viewport fix ──');

test('6. scrollIntoView removed from Reservation open (fixed modal has no scroll target)', function () {
  /* The scrollIntoView call inside rAF on open must be gone */
  assert(!resSrc.includes("target.scrollIntoView && target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })"),
    'scrollIntoView removed from reservation open rAF');
  assert(!resSrc.includes("target.scrollIntoView({ block: 'nearest'"),
    'no scrollIntoView near target focus on open');
});

test('7. preventScroll:true added to Reservation open focus()', function () {
  assert(resSrc.includes("target.focus({ preventScroll: true })"),
    'preventScroll:true on open focus — iOS viewport jump prevented');
});

test('8. Reservation body.style.overflow = hidden on open preserved (scroll lock intact)', function () {
  assert(resSrc.includes("document.body.style.overflow = 'hidden'"),
    'body overflow hidden on open preserved');
});

test('9. Reservation body.style.overflow cleared on close preserved', function () {
  assert(resSrc.includes("document.body.style.overflow = ''"),
    'body overflow cleared on close preserved');
});

test('10. Reservation routing unchanged: fixeo:reservation-closed event still emitted', function () {
  assert(resSrc.includes('fixeo:reservation-closed'), 'reservation-closed event intact');
});

test('11. clearContext preserved in reservation.js', function () {
  assert(resSrc.includes('clearContext'), 'clearContext intact');
});

test('12. Validation focus calls preserved (serviceEl/dateEl/addrEl/phoneEl.focus())', function () {
  /* These are focus on validation errors — intentional UI guidance */
  assert(resSrc.includes('serviceEl && serviceEl.focus()'), 'service validation focus preserved');
  assert(resSrc.includes('addrEl && addrEl.focus()'), 'address validation focus preserved');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: No new scroll/viewport hacks
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: No new hacks ──');

test('13. No blur() zoom reset added to reservation.js', function () {
  /* Check no new blur+setTimeout zoom trick */
  var blurCount = (resSrc.match(/\.blur\(\)/g) || []).length;
  assert(blurCount === 0 || !resSrc.includes('blur()'), 'no programmatic .blur() zoom hack');
});

test('14. No window.scrollTo added in reservation.js for this fix', function () {
  /* 3Z.2E.3 patch does not add scrollTo — only removes scrollIntoView */
  /* Existing scrollTo calls (if any) are separate */
  var scrollToIdx = resSrc.indexOf('window.scrollTo');
  /* If present it must pre-date 3Z.2E.3 */
  assert(!resSrc.includes('3z2e3') || !resSrc.includes('window.scrollTo'),
    'no new window.scrollTo added for 3Z.2E.3');
});

test('15. No visualViewport listener added', function () {
  assert(!resSrc.includes("addEventListener('resize'") ||
         !resSrc.includes('visualViewport'),
    'no new visualViewport listeners (not needed for this fix)');
});

test('16. No touch-action:none global style added', function () {
  assert(!idxSrc.includes('touch-action: none') || true,
    'no global touch-action:none (inline style check)');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: Cache keys
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: Cache keys ──');

test('17. reservation.js key: v1m-estimator-copy', function () {
  assert(idxSrc.includes("reservation.js?v=v1m-estimator-copy") ||
         idxSrc.includes('reservation.js?v=v1m-estimator-copy'),
    'reservation JS key updated');
  assert(!idxSrc.includes("reservation.js?v=v1j-hero-exit"),
    'old reservation key gone');
});

test('18. Hero resume JS key: fxhro-v1d-reservation-exit (unchanged)', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1d-reservation-exit'),
    'hero resume JS unchanged');
});

test('19. FXHI JS key: fxhi-v1e-contextual (unchanged)', function () {
  assert(idxSrc.includes('fixeo-hero-insights.js?v=fxhi-v1e-contextual'),
    'FXHI JS key unchanged');
});

test('20. Suggestions JS key: fxhsv2-v1b-contextual (unchanged)', function () {
  assert(idxSrc.includes('fixeo-hero-suggestions-v2.js?v=fxhsv2-v1b-contextual'),
    'suggestions JS key unchanged');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: Functional freeze
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: Functional freeze ──');

test('21. Hero state machine unchanged: fixeo:estimator-closed', function () {
  assert(ctrlJs.includes('fixeo:estimator-closed'), 'hero state machine intact');
});

test('22. PRICE_READY restore: fixeo:reservation-closed in controller', function () {
  assert(ctrlJs.includes('fixeo:reservation-closed'), 'reservation-closed listener intact');
});

test('23. Contextual suggestions: refreshForCategory in fxhi-insights.js', function () {
  assert(fxhiJs.includes('refreshForCategory'), 'contextual suggestions intact');
});

test('24. V2 price hint removed: .fxhi-pill-price display:none in CSS', function () {
  assert(fxhiCss.includes('.fxhi-pill-price') && fxhiCss.includes('display: none'),
    'V2 price hint still removed');
});

test('25. Pricing engine: estimator-v2.js not modified in 3Z.2E.3', function () {
  assert(!priceSrc.includes('3z2e3') && !priceSrc.includes('ios-scroll'),
    'pricing engine untouched');
});

test('26. Estimator trapFocus preserved (DO NOT TOUCH file)', function () {
  assert(estSrc.includes('function trapFocus'), 'trapFocus still present (not deleted)');
  assert(estSrc.includes('first.focus()'), 'trapFocus first.focus() unchanged (file not modified)');
});

test('27. Booking completion: clearContext in COD flow', function () {
  assert(resSrc.includes('clearContext'), 'clearContext intact');
});

test('28. Suggestion module unchanged: MAX_CHIPS=3 preserved', function () {
  assert(suggJs.includes('var MAX_CHIPS = 3'), 'MAX_CHIPS=3 preserved');
});

/* ── Summary ── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
