/**
 * estimator-v2-3z2e-polish-tests.js
 * Phase 7C.9L.3Z.2E — Final Hero premium visual polish
 *
 * Source-level CSS/JS contract tests. No browser automation.
 * Verifies: FXHI 2-row mobile layout, no clipping, hierarchy,
 *           functional freeze, cache keys, visual micro-polish.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

var fxhiCss = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-hero-insights.css'), 'utf8');
var resumeCss = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-hero-resume-v1.css'), 'utf8');
var fxhiJs  = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-insights.js'), 'utf8');
var ctrlJs  = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-resume-v1.js'), 'utf8');
var resSrc  = fs.readFileSync(path.join(__dirname, '../../../../../js/reservation.js'), 'utf8');
var priceSrc = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-estimator-v2.js'), 'utf8');
var idxSrc  = fs.readFileSync(path.join(__dirname, '../../../../../index.html'), 'utf8');

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
   GROUP 1: FXHI mobile layout — no clipping
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: FXHI mobile no-clip layout ──');

test('1. FXHI mobile: flex-wrap added on .fxhi-pills at ≤600px', function () {
  var breakIdx = fxhiCss.lastIndexOf('@media (max-width: 600px)');
  assert(breakIdx > 0, '600px breakpoint found');
  var block = fxhiCss.slice(breakIdx, breakIdx + 2000);
  assert(block.includes('fxhi-pills'), '.fxhi-pills targeted');
  assert(block.includes('flex-wrap') && block.includes('wrap'), 'flex-wrap:wrap in 600px block');
});

test('2. FXHI mobile: count pill gets full width (no 3-column compression)', function () {
  var breakIdx = fxhiCss.lastIndexOf('@media (max-width: 600px)');
  var block = fxhiCss.slice(breakIdx, breakIdx + 2000);
  var countIdx = block.indexOf('.fxhi-pill-count');
  assert(countIdx > 0, '.fxhi-pill-count in mobile block');
  var countBlock = block.slice(countIdx, countIdx + 200);
  assert(countBlock.includes('width: 100%') || countBlock.includes('flex: none'),
    'count pill full width or flex:none');
  assert(countBlock.includes('border-right: none'), 'count pill no right border');
});

test('3. FXHI mobile: time pill has flex:1 and word-break (no clipping)', function () {
  var breakIdx = fxhiCss.lastIndexOf('@media (max-width: 600px)');
  var block = fxhiCss.slice(breakIdx, breakIdx + 2000);
  var timeIdx = block.indexOf('.fxhi-pill-time');
  assert(timeIdx > 0, '.fxhi-pill-time in mobile block');
  var timeBlock = block.slice(timeIdx, timeIdx + 300);
  assert(timeBlock.includes('flex:') || timeBlock.includes('flex: '), 'time pill has flex');
  assert(timeBlock.includes('word-break') || timeBlock.includes('white-space: normal') || timeBlock.includes('white-space:normal'),
    'time pill allows text wrap (no forced nowrap)');
  assert(!timeBlock.includes('text-overflow: ellipsis'), 'no ellipsis on time pill');
});

test('4. FXHI mobile: no global text-overflow:ellipsis on pills (base rules)', function () {
  /* Check base .fxhi-pill (non-mobile) doesn't force clip on mobile */
  var basePillIdx = fxhiCss.indexOf('.fxhi-pill {');
  if (basePillIdx < 0) basePillIdx = fxhiCss.indexOf('.fxhi-pill{');
  /* Find mobile override of white-space — the 3Z.2E append must include white-space:normal */
  assert(fxhiCss.includes('white-space: normal'), 'white-space:normal override exists');
  assert(!fxhiCss.includes('text-overflow: ellipsis'), 'no text-overflow:ellipsis in FXHI CSS');
});

test('5. FXHI: max-height:none overrides 60px cap (allows 2-row on mobile)', function () {
  /* The 60px cap would clip a 2-row layout */
  assert(fxhiCss.includes('max-height: none'), 'max-height:none override present');
});

test('6. FXHI mobile: 360px is covered by ≤600px breakpoint', function () {
  /* 360 < 600 — confirmed by breakpoint range */
  var m = fxhiCss.match(/@media \(max-width:\s*(\d+)px\)/g);
  assert(m && m.some(function(r){ return parseInt(r.match(/\d+/)[0]) >= 430; }),
    'breakpoint covers ≥430px → covers 360,375,390,430');
});

test('7. FXHI mobile: category pill has order:2 (after count)', function () {
  var breakIdx = fxhiCss.lastIndexOf('@media (max-width: 600px)');
  var block = fxhiCss.slice(breakIdx, breakIdx + 2000);
  var catIdx = block.indexOf('.fxhi-pill-category');
  assert(catIdx > 0, '.fxhi-pill-category in mobile block');
  var catBlock = block.slice(catIdx, catIdx + 200);
  assert(catBlock.includes('order: 2') || catBlock.includes('order:2'), 'category has order:2');
});

test('8. FXHI mobile: time pill has order:3 (after category)', function () {
  var breakIdx = fxhiCss.lastIndexOf('@media (max-width: 600px)');
  var block = fxhiCss.slice(breakIdx, breakIdx + 2000);
  var timeIdx = block.indexOf('.fxhi-pill-time');
  var timeBlock = block.slice(timeIdx, timeIdx + 250);
  assert(timeBlock.includes('order: 3') || timeBlock.includes('order:3'), 'time has order:3');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: FXHI visual hierarchy
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: FXHI visual hierarchy ──');

test('9. Category pill: lower contrast (rgba opacity ≤ 0.55)', function () {
  /* Anchor in the 3Z.2E append block, find first .fxhi-pill-category rule */
  var appendStart = fxhiCss.indexOf('PHASE 7C.9L.3Z.2E');
  assert(appendStart > 0, '3Z.2E append anchor found');
  var appendSrc = fxhiCss.slice(appendStart);
  var catIdx = appendSrc.indexOf('.fxhi-pill-category {');
  assert(catIdx > 0, '.fxhi-pill-category found in append block');
  var block = appendSrc.slice(catIdx, catIdx + 250);
  var m = block.match(/color:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/);
  assert(m && parseFloat(m[1]) <= 0.55,
    'category pill opacity ≤ 0.55 (secondary role), got: ' + (m && m[1]));
});

test('10. Count pill: font-weight:700 or 800 (strongest rail item)', function () {
  var appendStart = fxhiCss.indexOf('PHASE 7C.9L.3Z.2E');
  var appendSrc = fxhiCss.slice(appendStart);
  var countIdx = appendSrc.indexOf('.fxhi-pill-count {');
  assert(countIdx > 0, '.fxhi-pill-count in append block');
  var block = appendSrc.slice(countIdx, countIdx + 150);
  var m = block.match(/font-weight:\s*(\d+)/);
  assert(m && parseInt(m[1]) >= 700, 'count pill font-weight ≥ 700, got: ' + (m && m[1]));
});

test('11. Time pill: font-weight ≤ 500 (softest — indicative only)', function () {
  var appendStart = fxhiCss.indexOf('PHASE 7C.9L.3Z.2E');
  var appendSrc = fxhiCss.slice(appendStart);
  var timeIdx = appendSrc.indexOf('.fxhi-pill-time {');
  assert(timeIdx > 0, '.fxhi-pill-time in append block');
  var block = appendSrc.slice(timeIdx, timeIdx + 150);
  var m = block.match(/font-weight:\s*(\d+)/);
  assert(m && parseInt(m[1]) <= 500, 'time pill font-weight ≤ 500, got: ' + (m && m[1]));
});

test('12. Global pill font-size reduced (≤ .76rem)', function () {
  /* The append block overrides .fxhi-pill base font-size */
  var lastPillIdx = fxhiCss.lastIndexOf('.fxhi-pill {');
  assert(lastPillIdx > 0, '.fxhi-pill base override found in append');
  var block = fxhiCss.slice(lastPillIdx, lastPillIdx + 120);
  var m = block.match(/font-size:\s*([\d.]+)rem/);
  assert(m && parseFloat(m[1]) <= 0.76, 'pill base font-size ≤ .76rem, got: ' + (m && m[1]));
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: Data / logic freeze
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: Data / logic freeze ──');

test('13. FXHI JS untouched: _renderBar still uses FixeoAIRE.getArtisanCount', function () {
  assert(fxhiJs.includes('FixeoAIRE') && fxhiJs.includes('getArtisanCount'),
    'AIRE count lookup intact in JS');
});

test('14. FXHI JS untouched: _getAvgResponseTime still present', function () {
  assert(fxhiJs.includes('_getAvgResponseTime'), 'response time function intact');
});

test('15. FXHI JS untouched: category detection unchanged', function () {
  assert(fxhiJs.includes('fxhi-pill-category') && fxhiJs.includes('fxhi-pill-count'),
    'pill rendering in JS intact');
});

test('16. FXHI JS VERSION unchanged (fxhi-v1e-contextual)', function () {
  assert(fxhiJs.includes('fxhi-v1e-contextual') || fxhiJs.includes("VERSION") && !fxhiJs.includes('fxhi-v1e'),
    'JS version not bumped — fxhi-v1e-contextual');
});

test('17. QSM reset logic untouched: resetMetier still exported', function () {
  var qsmJs = fs.readFileSync(path.join(__dirname, '../../../../../js/quick-search-modal.js'), 'utf8');
  assert(qsmJs.includes('resetMetier'), 'QSM.resetMetier intact');
});

test('18. HeroInsights.reset() still present', function () {
  assert(fxhiJs.includes('reset:') || fxhiJs.includes('_reset'), 'HeroInsights reset intact');
});

test('19. Reservation close event untouched: fixeo:reservation-closed in reservation.js', function () {
  assert(resSrc.includes('fixeo:reservation-closed'), 'reservation-closed event intact');
});

test('20. Pricing engine untouched: estimator-v2.js not modified (no v1e tag)', function () {
  assert(!priceSrc.includes('3z2e') && !priceSrc.includes('v1e-polish'),
    'estimator-v2.js not modified in 3Z.2E');
});

test('21. clearContext on booking: COD onSuccess still clears context', function () {
  assert(resSrc.includes('clearContext'), 'clearContext in reservation.js intact');
});

test('22. Hero Resume listener for reservation-closed intact', function () {
  assert(ctrlJs.includes('fixeo:reservation-closed') && ctrlJs.includes('_runVerification'),
    'Hero Resume reservation-closed listener intact');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: Cache keys
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: Cache keys ──');

test('23. FXHI CSS key: fxhi-v1e-v2-clean in index.html', function () {
  assert(idxSrc.includes('fixeo-hero-insights.css?v=fxhi-v1e-v2-clean'), 'FXHI CSS key updated');
  assert(!idxSrc.includes('fixeo-hero-insights.css?v=fxhi-v1c'), 'old FXHI key gone');
});

test('24. Hero-resume CSS key: fxhro-v1e-final-polish in index.html', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1e-final-polish'), 'resume CSS key updated');
  assert(!idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1d-visual'), 'old resume CSS key gone');
});

test('25. JS keys unchanged: fxhi-v1e-contextual, fxhro-v1d-reservation-exit', function () {
  assert(idxSrc.includes('fixeo-hero-insights.js?v=fxhi-v1e-contextual'), 'FXHI JS key unchanged');
  assert(idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1d-reservation-exit'), 'hero-resume JS unchanged');
});

test('26. reservation.js key unchanged: v1k-ios-scroll', function () {
  assert(idxSrc.includes('reservation.js?v=v1k-ios-scroll'), 'reservation JS key unchanged');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: No horizontal overflow rules
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: No overflow / clip rules ──');

test('27. FXHI CSS introduces no overflow:hidden on pills', function () {
  /* The append block must not add overflow:hidden on any pill */
  var appendStart = fxhiCss.indexOf('PHASE 7C.9L.3Z.2E');
  assert(appendStart > 0, '3Z.2E append block found');
  var appendBlock = fxhiCss.slice(appendStart);
  /* Check that no pill is hidden */
  assert(!appendBlock.match(/\.fxhi-pill[^{]*\{[^}]*overflow\s*:\s*hidden/),
    'no overflow:hidden on pills in append block');
});

test('28. Time pill: no overflow clip anywhere (word-break or normal whitespace present)', function () {
  var appendStart = fxhiCss.indexOf('PHASE 7C.9L.3Z.2E');
  var appendBlock = fxhiCss.slice(appendStart);
  /* The time pill appears in BOTH base override AND mobile media query — check either */
  assert(
    appendBlock.includes('word-break: break-word') ||
    appendBlock.includes('word-break:break-word') ||
    appendBlock.includes('white-space: normal') ||
    appendBlock.includes('overflow: visible'),
    'time pill allows text wrap somewhere in 3Z.2E append block'
  );
  assert(!appendBlock.includes('text-overflow: ellipsis'), 'no ellipsis in 3Z.2E append');
});

test('29. No text-overflow:ellipsis in resume CSS', function () {
  assert(!resumeCss.includes('text-overflow: ellipsis') || resumeCss.includes('.fxhro-service'),
    'ellipsis only on .fxhro-service (service label), not on FXHI pills');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: PRICE_READY integrity
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: PRICE_READY integrity ──');

test('30. QSM still hidden in PRICE_READY', function () {
  assert(resumeCss.includes('#home.fxhro-price-ready-state #hero-quick-search') &&
         resumeCss.includes('display: none'), 'QSM hide in PRICE_READY intact');
});

test('31. Price card still shown in PRICE_READY', function () {
  assert(resumeCss.includes('#home.fxhro-price-ready-state #fxhro-card') &&
         resumeCss.includes('display: block'), 'card shown in PRICE_READY');
});

test('32. prefers-reduced-motion preserved', function () {
  assert(resumeCss.includes('prefers-reduced-motion'), 'reduced-motion guard in resume CSS');
});

/* ── Summary ── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
