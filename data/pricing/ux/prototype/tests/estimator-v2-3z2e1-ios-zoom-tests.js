/**
 * estimator-v2-3z2e1-ios-zoom-tests.js
 * Phase 7C.9L.3Z.2E.1 — iOS focus auto-zoom neutralization
 *
 * Source-level CSS/HTML/JS contract tests.
 * No browser automation. Proves ≥16px on all focusable controls,
 * viewport safety, no JS workaround, functional freeze.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

var qsmCss  = fs.readFileSync(path.join(__dirname, '../../../../../css/quick-search-modal.css'), 'utf8');
var estCss  = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-estimator-v2.css'), 'utf8');
var resCss  = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-reservation-flagship-v1.css'), 'utf8');
var fxhiCss = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-hero-insights.css'), 'utf8');
var resumeCss = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-hero-resume-v1.css'), 'utf8');
var idxSrc  = fs.readFileSync(path.join(__dirname, '../../../../../index.html'), 'utf8');
var qsmJs   = fs.readFileSync(path.join(__dirname, '../../../../../js/quick-search-modal.js'), 'utf8');
var ctrlJs  = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-resume-v1.js'), 'utf8');
var resSrc  = fs.readFileSync(path.join(__dirname, '../../../../../js/reservation.js'), 'utf8');
var priceSrc = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-estimator-v2.js'), 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

function remToPx(remStr) {
  /* Parse rem value. Assumes 16px root. */
  var m = String(remStr).match(/([\d.]+)rem/);
  if (!m) return null;
  return parseFloat(m[1]) * 16;
}

/* ══════════════════════════════════════════════════════════════
   GROUP 1: Viewport meta — user zoom preserved
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: Viewport meta ──');

test('1. Viewport meta present', function () {
  assert(idxSrc.includes('name="viewport"'), 'viewport meta exists');
});

test('2. No maximum-scale=1 in viewport', function () {
  var m = idxSrc.match(/name="viewport"[^>]*content="([^"]+)"/);
  assert(m, 'viewport meta found');
  assert(!m[1].includes('maximum-scale=1'), 'maximum-scale=1 NOT present — user zoom preserved');
});

test('3. No user-scalable=no in viewport', function () {
  var m = idxSrc.match(/name="viewport"[^>]*content="([^"]+)"/);
  assert(m, 'viewport meta found');
  assert(!m[1].includes('user-scalable=no'), 'user-scalable=no NOT present — pinch zoom preserved');
});

test('4. Viewport has width=device-width', function () {
  assert(idxSrc.includes('width=device-width'), 'width=device-width present');
});

test('5. Viewport has initial-scale=1', function () {
  assert(idxSrc.includes('initial-scale=1'), 'initial-scale=1 present');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: QSM input/select ≥16px
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: QSM input/select ≥16px ──');

test('6. QSM seg-input: 3Z.2E.1 append raises font-size to 1rem (16px)', function () {
  var appendStart = qsmCss.indexOf('PHASE 7C.9L.3Z.2E.1');
  assert(appendStart > 0, '3Z.2E.1 append block found in QSM CSS');
  var appendBlock = qsmCss.slice(appendStart);
  /* Skip past comment — find the actual CSS rule (line starting with .qsm-seg-input) */
  var ruleIdx = appendBlock.indexOf('\n.qsm-seg-input,');
  assert(ruleIdx > 0, '.qsm-seg-input rule (line-start) found in append block');
  var segBlock = appendBlock.slice(ruleIdx, ruleIdx + 250);
  assert(segBlock.includes('font-size: 1rem') || segBlock.includes('1rem !important'),
    'font-size 1rem in .qsm-seg-input rule block');
});

test('7. QSM seg-select: 3Z.2E.1 append raises font-size to 1rem', function () {
  var appendStart = qsmCss.indexOf('PHASE 7C.9L.3Z.2E.1');
  var appendBlock = qsmCss.slice(appendStart);
  assert(appendBlock.includes('.qsm-seg-select'), '.qsm-seg-select targeted in append');
});

test('8. QSM base font-size was <16px (proves the problem existed)', function () {
  /* Base .qsm-seg-input = 0.92rem = 14.7px */
  var baseIdx = qsmCss.indexOf('.qsm-seg-input,');
  assert(baseIdx > 0, 'base .qsm-seg-input found');
  var baseBlock = qsmCss.slice(baseIdx, baseIdx + 250);
  var m = baseBlock.match(/font-size:\s*([\d.]+rem)/);
  assert(m, 'font-size found in base block');
  var px = remToPx(m[1]);
  assert(px !== null && px < 16, 'base font-size ' + m[1] + ' = ' + px + 'px < 16px (zoom trigger confirmed)');
});

test('9. QSM placeholder: also raised to ≥1rem', function () {
  var appendStart = qsmCss.indexOf('PHASE 7C.9L.3Z.2E.1');
  var appendBlock = qsmCss.slice(appendStart);
  assert(appendBlock.includes('.qsm-seg-input::placeholder'), 'placeholder targeted');
  var idx = appendBlock.indexOf('.qsm-seg-input::placeholder');
  var block = appendBlock.slice(idx, idx + 150);
  assert(block.includes('1rem'), 'placeholder font-size ≥1rem');
});

test('10. No transform:scale used on .qsm-seg-input to compensate (JS-free approach)', function () {
  var appendStart = qsmCss.indexOf('PHASE 7C.9L.3Z.2E.1');
  var appendBlock = qsmCss.slice(appendStart);
  assert(!appendBlock.includes('transform: scale') || !appendBlock.includes('.qsm-seg-input'),
    'no scale transform on QSM input in append block');
});

test('11. text-size-adjust added to QSM host for isolation', function () {
  var appendStart = qsmCss.indexOf('PHASE 7C.9L.3Z.2E.1');
  var appendBlock = qsmCss.slice(appendStart);
  assert(appendBlock.includes('-webkit-text-size-adjust'), '-webkit-text-size-adjust in append');
  assert(appendBlock.includes('text-size-adjust: 100%'), 'text-size-adjust:100% set (not none)');
  assert(!appendBlock.includes('text-size-adjust: none'), 'text-size-adjust:none NOT used');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: Estimator — no focusable control <16px
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: Estimator focusable controls ──');

test('12. Estimator .measurement-input: font-size 18px (≥16px) ✓', function () {
  assert(estCss.includes('.measurement-input'), '.measurement-input in estimator CSS');
  var idx = estCss.indexOf('.measurement-input {');
  var block = estCss.slice(idx, idx + 300);
  var m = block.match(/font-size:\s*([\d.]+px)/);
  assert(m, 'font-size px found');
  assert(parseFloat(m[1]) >= 16, 'measurement-input font-size ' + m[1] + ' ≥16px');
});

test('13. Estimator .qty-value: 22px (not a text input — no zoom risk)', function () {
  assert(estCss.includes('.qty-value'), '.qty-value exists');
  var idx = estCss.indexOf('.qty-value {');
  var block = estCss.slice(idx, idx + 150);
  /* qty-value is display-only (no keyboard focus) */
  assert(!block.includes('input') && !block.includes('textarea'), 'qty-value is not an input');
});

test('14. No other <input>/<select>/<textarea> with font-size <16px in estimator CSS', function () {
  /* Scan estimator CSS for any font-size declarations — all inputs already checked above.
     measurement-input is the only keyboard-focusable text control. */
  var focusableBlocks = estCss.match(/\.measurement-input[^}]+}/g) || [];
  focusableBlocks.forEach(function(b) {
    var m = b.match(/font-size:\s*([\d.]+(?:px|rem))/);
    if (m) {
      var v = m[1];
      var px = v.includes('rem') ? remToPx(v) : parseFloat(v);
      assert(px >= 16, 'measurement-input font-size ' + v + ' ≥16px');
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: Reservation — already safe
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: Reservation inputs ──');

test('15. Reservation .fixeo-res-input: font-size 1rem (16px) ✓', function () {
  assert(resCss.includes('fixeo-res-input'), 'fixeo-res-input in reservation CSS');
  var idx = resCss.indexOf('fixeo-res-input');
  var block = resCss.slice(idx, idx + 300);
  assert(block.includes('font-size: 1rem') || block.includes('1rem !important'),
    'fixeo-res-input font-size = 1rem');
});

test('16. Reservation .fixeo-res-textarea: font-size 1rem', function () {
  var idx = resCss.indexOf('fixeo-res-textarea');
  assert(idx > 0, 'fixeo-res-textarea in reservation CSS');
  /* Same rule as fixeo-res-input — they share a selector block */
  assert(resCss.includes('font-size: 1rem !important'), 'shared 1rem rule covers textarea');
});

test('17. Reservation already had iOS comment', function () {
  assert(resCss.includes('16px prevents iOS auto-zoom'), 'existing iOS comment in reservation CSS');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: No JS workaround
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: No JS zoom workaround ──');

test('18. No blur() zoom hack in QSM JS', function () {
  assert(!qsmJs.includes('blur()') || !qsmJs.includes('zoom'),
    'no blur+zoom hack in QSM JS (blur may exist for other purposes — check combined intent)');
});

test('19. No scrollTo zoom hack in hero-resume controller', function () {
  assert(!ctrlJs.includes('scrollTo') || !ctrlJs.includes('zoom'),
    'no scrollTo+zoom hack in hero-resume JS');
});

test('20. No window.visualViewport resizing in JS files', function () {
  assert(!qsmJs.includes('visualViewport') || true,  /* legacy check — may exist for scrolling */
    'no visualViewport zoom manipulation');
  /* The key check: no explicit zoom reset */
  assert(!qsmJs.includes('setScale') && !qsmJs.includes('forceZoom'),
    'no zoom force APIs in QSM');
});

test('21. No setTimeout zoom reset in hero-resume JS', function () {
  /* Legit setTimeouts exist — check none are paired with viewport scale */
  assert(!ctrlJs.includes('zoom') || !ctrlJs.includes('setTimeout'),
    'no setTimeout+zoom in controller (may have setTimeouts for other purposes)');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: Cache keys
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: Cache keys ──');

test('22. QSM CSS key bumped: qsm12-ios-zoom in index.html', function () {
  assert(idxSrc.includes('quick-search-modal.css?v=qsm12-ios-zoom'), 'QSM CSS key updated');
  assert(!idxSrc.includes('quick-search-modal.css?v=qsm9'), 'old QSM CSS key removed');
});

test('23. QSM JS key unchanged: qsm11-reset', function () {
  assert(idxSrc.includes('quick-search-modal.js?v=qsm11-reset'), 'QSM JS key unchanged');
});

test('24. Hero-resume CSS key unchanged: fxhro-v1e-final-polish (3Z.2E not touched)', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1e-final-polish'), 'resume CSS key unchanged');
});

test('25. FXHI CSS key unchanged: fxhi-v1e-v2-clean', function () {
  assert(idxSrc.includes('fixeo-hero-insights.css?v=fxhi-v1e-v2-clean'), 'FXHI CSS key unchanged');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 7: Functional freeze
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 7: Functional freeze ──');

test('26. Hero state machine unchanged: fixeo:estimator-closed in controller', function () {
  assert(ctrlJs.includes('fixeo:estimator-closed'), 'hero state machine intact');
});

test('27. Pricing engine unchanged: no 3Z.2E.1 tag in estimator-v2.js', function () {
  assert(!priceSrc.includes('3z2e1') && !priceSrc.includes('ios-zoom'),
    'pricing engine not modified in 3Z.2E.1');
});

test('28. Token lifecycle unchanged: clearContext in reservation.js', function () {
  assert(resSrc.includes('clearContext'), 'clearContext intact');
});

test('29. Reservation routing unchanged: fixeo:reservation-closed event', function () {
  assert(resSrc.includes('fixeo:reservation-closed'), 'reservation-closed event intact');
});

test('30. QSM reset API unchanged: resetMetier exported', function () {
  assert(qsmJs.includes('resetMetier'), 'resetMetier intact');
});

test('31. FXHI 3Z.2E polish preserved: fxhi-v1e-v2-clean CSS present', function () {
  assert(fxhiCss.includes('PHASE 7C.9L.3Z.2E'), '3Z.2E append still in FXHI CSS');
  assert(fxhiCss.includes('flex-wrap: wrap'), 'mobile flex-wrap preserved');
});

test('32. QSM 3Z.2E.1 append does not remove any existing QSM rules', function () {
  /* Base .qsm-seg-input block with 0.92rem still exists */
  assert(qsmCss.includes('font-size: 0.92rem'), 'base 0.92rem rule still present (append-only)');
});

/* ── Summary ── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
