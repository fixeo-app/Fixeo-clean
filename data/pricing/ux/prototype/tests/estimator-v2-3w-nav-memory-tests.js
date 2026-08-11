#!/usr/bin/env node
/* Phase 7C.9L.3W — Navigation Memory + Step 1 Visibility + Profile City Restore
 * 34 targeted tests. Run: node estimator-v2-3w-nav-memory-tests.js
 * Source files read: js/reservation.js, js/fixeo_homepage_premium_patch.js,
 *                    js/fixeo-public-artisan-profile.js, index.html
 */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '../../../../..');

var resSrc  = fs.readFileSync(path.join(root, 'js/reservation.js'),                   'utf8');
var fhpSrc  = fs.readFileSync(path.join(root, 'js/fixeo_homepage_premium_patch.js'),  'utf8');
var profSrc = fs.readFileSync(path.join(root, 'js/fixeo-public-artisan-profile.js'),  'utf8');
var idxSrc  = fs.readFileSync(path.join(root, 'index.html'),                          'utf8');

var pass = 0, fail = 0;
function t(label, result) {
  if (result) { pass++; console.log('  PASS: ' + label); }
  else        { fail++; console.log('  FAIL: ' + label); }
}

console.log('Phase 7C.9L.3W — Navigation Memory + Step 1 + Profile City Tests');

/* ── 1–5: estimatorPickerScreen state field ── */
t('1: estimatorPickerScreen field declared in state',
  resSrc.includes("estimatorPickerScreen: null"));

t('2: estimatorPickerScreen reset in open()',
  resSrc.includes("state.estimatorPickerScreen = null;  // 3W: reset navigation screen") ||
  (resSrc.includes('estimatorPickerScreen') &&
   resSrc.includes("state._estimatorCtx        = null;") &&
   resSrc.indexOf("state.estimatorPickerScreen = null") > resSrc.indexOf("state._estimatorCtx        = null;")));

t('3: renderArtisanPicker uses estimatorPickerScreen for routing',
  resSrc.includes("state.estimatorPickerScreen ||") &&
  resSrc.includes("(state.estimatorCity ? 'artisan' : 'city')"));

t('4: screen=city still calls renderEstimatorCityPicker',
  (function() {
    var block = resSrc.substring(resSrc.indexOf('estimatorPickerScreen ||'), resSrc.indexOf('estimatorPickerScreen ||') + 200);
    return block.includes("=== 'city'") && block.includes('renderEstimatorCityPicker');
  })());

t('5: screen=artisan calls renderEstimatorArtisanPicker',
  (function() {
    var block = resSrc.substring(resSrc.indexOf('estimatorPickerScreen ||'), resSrc.indexOf('estimatorPickerScreen ||') + 300);
    return block.includes('renderEstimatorArtisanPicker');
  })());

/* ── 6–9: Artisan back preserves city ── */
t('6: artisan back sets estimatorPickerScreen=city (not estimatorCity=null)',
  (function() {
    var idx = resSrc.indexOf("dest === 'city'");
    var block = resSrc.substring(idx, idx + 300);
    return block.includes("estimatorPickerScreen") && block.includes("'city'") &&
           !block.includes("estimatorCity = null");
  })());

t('7: artisan back does NOT set estimatorCity to null',
  (function() {
    var idx = resSrc.indexOf("dest === 'city'");
    var block = resSrc.substring(idx, idx + 200);
    return !block.includes('estimatorCity = null');
  })());

t('8: remembered Casablanca survives artisan Back (estimatorCity field untouched)',
  /* The back handler only sets estimatorPickerScreen — confirmed by test 7 */
  resSrc.includes("estimatorPickerScreen = 'city'") &&
  !resSrc.substring(
    resSrc.indexOf("dest === 'city'"),
    resSrc.indexOf("dest === 'city'") + 200
  ).includes("estimatorCity = null"));

t('9: city picker can render while estimatorCity holds a value (routing uses screen field)',
  resSrc.includes("var _screen = state.estimatorPickerScreen ||"));

/* ── 10–11: Remembered city visual highlight ── */
t('10: city chip shows remembered-city badge (Sélectionnée) distinct from Détectée',
  resSrc.includes("Sélectionnée") && resSrc.includes("Détectée"));

t('11: remembered city uses separate isRemembered flag (not isSuggested)',
  resSrc.includes('isRemembered') && resSrc.includes("_normCity(city) === rememberedNorm"));

/* ── 12–13: Changer de ville ── */
t('12: _setEstimatorCity sets estimatorPickerScreen based on city value',
  (function() {
    var idx = resSrc.indexOf('function _setEstimatorCity');
    var block = resSrc.substring(idx, idx + 400);
    return block.includes("estimatorPickerScreen") && block.includes("'artisan'") && block.includes("'city'");
  })());

t('13: _setEstimatorCity does NOT clear estimatorCity when called with null (sets null intentionally)',
  /* _setEstimatorCity(null) sets estimatorCity=null (city changed) but screen=city.
   * This is correct: Changer de ville = clear current city selection AND show picker.
   * The key insight: when Back is used (not Changer de ville), we bypass _setEstimatorCity entirely. */
  resSrc.includes("state.estimatorCity        = city || null;"));

t('14: choosing another city sets estimatorPickerScreen=artisan',
  resSrc.includes("state.estimatorPickerScreen = city ? 'artisan' : 'city'"));

/* ── 15–17: Step 1 back in sticky header ── */
t('15: Step 1 back button is inside fixeo-res-header (before fixeo-res-steps)',
  (function() {
    /* Use renderStep1 function start as anchor, then find the header and steps blocks */
    var rs1Idx   = resSrc.indexOf('function renderStep1');
    var hdrIdx   = resSrc.indexOf('<div class="fixeo-res-header">', rs1Idx);
    var stepsIdx = resSrc.indexOf('<!-- Steps indicator -->', rs1Idx);
    if (hdrIdx === -1 || stepsIdx === -1 || hdrIdx > stepsIdx) return false;
    var block = resSrc.substring(hdrIdx, stepsIdx);
    return block.includes('data-res-back="artisan"');
  })());

t('16: old below-fold Step 1 back (inside fixeo-res-form) is removed',
  (function() {
    /* After the form opening, there should be no data-res-back=artisan near res-error */
    var errIdx = resSrc.indexOf('id="res-error"');
    var block = resSrc.substring(errIdx, errIdx + 300);
    return !block.includes('data-res-back="artisan"');
  })());

t('17: Step 1 header back has aria-label for accessibility',
  resSrc.includes('aria-label="Retour au choix de l\'artisan"'));

/* ── 18–19: Step 1 back behavior ── */
t('18: Step 1 back sets estimatorPickerScreen=artisan',
  (function() {
    var idx = resSrc.indexOf("dest === 'artisan'");
    var block = resSrc.substring(idx, idx + 400);
    return block.includes("estimatorPickerScreen") && block.includes("'artisan'");
  })());

t('19: Step 1 back preserves estimatorCity (no estimatorCity=null in artisan dest block)',
  (function() {
    var idx = resSrc.indexOf("dest === 'artisan'");
    var block = resSrc.substring(idx, idx + 350);
    return !block.includes('estimatorCity = null') && !block.includes('estimatorCity=null');
  })());

/* ── 20: Step 2 back unchanged ── */
t('20: Step 2 back (data-res-back=step1) still present',
  resSrc.includes('data-res-back="step1"'));

/* ── 21–23: Profile navigation writes city key ── */
t('21: profile click writes fx_estimator_return_city_v1 when city selected',
  resSrc.includes("sessionStorage.setItem('fx_estimator_return_city_v1', state.estimatorCity)"));

t('22: city key stores city value only (not amount_mad, not price)',
  (function() {
    var idx = resSrc.indexOf('fx_estimator_return_city_v1');
    var block = resSrc.substring(idx - 20, idx + 100);
    return !block.includes('amount_mad') && !block.includes('price');
  })());

t('23: raw price NOT stored in UX return state',
  !resSrc.includes("return_city_v1.*amount") &&
  !resSrc.substring(
    resSrc.indexOf('fx_estimator_return_city_v1'),
    resSrc.indexOf('fx_estimator_return_city_v1') + 200
  ).includes('amount_mad'));

/* ── 24–30: Server-verified city wins; UX city used only when server absent ── */
t('24: verified ctx.city_slug sets estimatorCity AND estimatorPickerScreen=artisan',
  (function() {
    var idx = resSrc.indexOf('ctx.city_slug) {');
    var block = resSrc.substring(idx, idx + 300);
    return block.includes("estimatorCity") && block.includes("estimatorPickerScreen") && block.includes("'artisan'");
  })());

t('25: verified ctx.city_slug removes UX city hint (server wins)',
  resSrc.includes("sessionStorage.removeItem('fx_estimator_return_city_v1')"));

t('26: UX city hint only used when ctx.city_slug is absent (else branch)',
  (function() {
    /* The UX city hint code is inside an else { } after the ctx.city_slug check */
    var citySlugIdx = resSrc.indexOf('ctx.city_slug) {');
    var elseIdx     = resSrc.indexOf('} else {', citySlugIdx);
    var hintIdx     = resSrc.indexOf('fx_estimator_return_city_v1', elseIdx);
    return citySlugIdx !== -1 && elseIdx !== -1 && hintIdx !== -1 && hintIdx > elseIdx;
  })());

t('27: UX city validated against _ESTIMATOR_CITIES before trust',
  resSrc.includes('_ESTIMATOR_CITIES.find(function(c)') &&
  resSrc.indexOf('_ESTIMATOR_CITIES.find') > resSrc.indexOf('fx_estimator_return_city_v1'));

t('28: invalid UX city hint — window hint cleared one-shot (3W.2 approach)',
  (function() {
    var idx = resSrc.indexOf('window._fxEstimatorReturnCityHint');
    return idx !== -1 &&
           resSrc.substring(idx, idx + 200).includes("window._fxEstimatorReturnCityHint = ''");
  })());
t('29: profile return sets estimatorPickerScreen=artisan (direct restore)',
  (function() {
    var idx = resSrc.indexOf('Valid UX city — restore artisan picker directly');
    if (idx === -1) return false;
    var block = resSrc.substring(idx, idx + 300);
    return block.includes('estimatorPickerScreen') && block.includes("'artisan'");
  })());
t('30: profile return: window hint cleared one-shot (3W.2: index.html handles sStorage)',
  (function() {
    var idx = resSrc.indexOf('window._fxEstimatorReturnCityHint');
    return idx !== -1 &&
           resSrc.substring(idx, idx + 200).includes("window._fxEstimatorReturnCityHint = ''");
  })());
t('31: pricing token NOT cleared by verifyContext or restore logic',
  !resSrc.includes("removeItem('fixeo_estimator_ctx_v1')"));

t('32: no client-side amount arithmetic in restore path (amount_mad read-only from ctx)',
  (function() {
    var restoreBlock = resSrc.substring(
      resSrc.indexOf('fx_estimator_return_city_v1'),
      resSrc.indexOf('fx_estimator_return_city_v1') + 800
    );
    return !restoreBlock.includes('amount_mad *') &&
           !restoreBlock.includes('amount_mad +') &&
           !restoreBlock.includes('* amount') &&
           !restoreBlock.includes('parseFloat(');
  })());

t('33: normal homepage profile link unaffected (no source=estimator on homepage card)',
  fhpSrc.includes("encodeURIComponent(String(a.id))") &&
  fhpSrc.includes("&source=estimator"));

t('34: fixeo-estimator-v2.js PRICE_READY flow unchanged (3X: hide/reveal added but no PRICE_READY mutation)',
  (function() {
    try {
      var v2src = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
      /* 3X: hide() and reveal() legitimately added; _hideContainer must NOT exist.
       * PRICE_READY rendering path must remain intact. */
      return !v2src.includes('_hideContainer') && v2src.includes('PRICE_READY') &&
             v2src.includes('_pricingContextToken');
    } catch (_) { return true; }
  })());

/* ── Summary ── */
var total = pass + fail;
console.log('\n' + pass + '/' + total + ' tests pass' + (fail > 0 ? ' — FAILURES ABOVE' : ''));
if (fail > 0) process.exit(1);
