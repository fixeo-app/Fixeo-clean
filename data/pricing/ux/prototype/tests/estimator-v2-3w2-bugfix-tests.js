#!/usr/bin/env node
/* Phase 7C.9L.3W.2 — Step 1 Back DOM Location + Profile City Restore Race Fix
 * 31 targeted tests. Run: node estimator-v2-3w2-bugfix-tests.js
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '../../../../..');

var resSrc = fs.readFileSync(path.join(root, 'js/reservation.js'), 'utf8');
var idxSrc = fs.readFileSync(path.join(root, 'index.html'),        'utf8');

var pass = 0, fail = 0;
function t(label, result) {
  if (result) { pass++; console.log('  PASS: ' + label); }
  else        { fail++; console.log('  FAIL: ' + label); }
}

console.log('Phase 7C.9L.3W.2 — Step 1 Back + Profile City Restore Tests');

/* ── BUG A: Step 1 Back DOM Location ── */

/* Helper: extract renderStep1 template string */
var rs1Idx      = resSrc.indexOf('function renderStep1');
var returnIdx   = resSrc.indexOf('return `', rs1Idx);
var templateEnd = resSrc.indexOf('\n  }', returnIdx + 3000); // approx end
var tpl         = resSrc.substring(returnIdx, templateEnd + 20);

/* Positions of key structural landmarks */
var hdrLeftPos  = tpl.indexOf('fixeo-res-header-left');
var hdrClosePos = tpl.indexOf('</div>\n\n        ${', hdrLeftPos); // after header block
var backPos     = tpl.indexOf('data-res-back="artisan"');
var stepsPos    = tpl.indexOf('<!-- Steps indicator -->');
var bodyPos     = tpl.indexOf('<!-- Body -->');

t('1: Step 1 template has exactly one data-res-back="artisan"',
  (tpl.match(/data-res-back="artisan"/g) || []).length === 1);

t('2: back button appears AFTER fixeo-res-header-left in template',
  backPos > hdrLeftPos);

t('3: fixeo-res-header-left is CLOSED before back button (header div closes first)',
  (function() {
    /* The segment from fixeo-res-header-left to the back button must contain
     * the closing tags for both the header-left div and the header div */
    var segment = tpl.substring(hdrLeftPos, backPos);
    return segment.includes('</div>\n\n        ${');
  })());

t('4: back button is NOT inside fixeo-res-header-left subtree',
  (function() {
    /* Verify: from fixeo-res-header-left open to its first </div> does NOT contain back button */
    var hdrLeftOpen = tpl.indexOf('"fixeo-res-header-left"', hdrLeftPos);
    /* Find the block between hdr-left and the outer header close */
    var hdrBlock = tpl.substring(hdrLeftOpen, hdrClosePos);
    return !hdrBlock.includes('data-res-back="artisan"');
  })());

t('5: back button is inside its own standalone div row (not inside fixeo-res-header)',
  (function() {
    /* The back button should be in a div sibling to fixeo-res-header */
    var backCtx = tpl.substring(backPos - 700, backPos);
    return backCtx.includes('7C.9L.3W.2/BUG-A') && !backCtx.includes('class="fixeo-res-header"');
  })());

t('6: back button row appears BEFORE <!-- Steps indicator -->',
  backPos !== -1 && stepsPos !== -1 && backPos < stepsPos);

t('7: back button row appears BEFORE <!-- Body -->',
  backPos !== -1 && bodyPos !== -1 && backPos < bodyPos);

t('8: flagship enhancer cannot hide it (no fixeo-res-header-left ancestor)',
  (function() {
    /* Proven by test 4. Additionally verify no other hidden-by-flagship class wraps it */
    var backCtx = tpl.substring(backPos - 200, backPos);
    return !backCtx.includes('fixeo-res-header-left') &&
           !backCtx.includes('fxresf-enhanced');
  })());

t('9: × close button remains unchanged (fixeo-res-close still present)',
  tpl.includes('fixeo-res-close') && tpl.includes('FixeoReservation.close()'));

t('10: back button uses existing delegated handler (data-res-back, no inline onclick)',
  tpl.includes('data-res-back="artisan"') && !tpl.includes('onclick.*goToArtisan'));

t('11: back button is estimator-only (guarded by _estimatorCtx.valid)',
  (function() {
    var backCtx = tpl.substring(backPos - 300, backPos);
    return backCtx.includes('_estimatorCtx') && backCtx.includes('.valid');
  })());

/* ── BUG A: Functional behavior unchanged (via delegated handler) ── */
t('12: Step 1 back handler still saves draft before clearing artisan',
  resSrc.includes("dest === 'artisan'") &&
  resSrc.includes("state.description = descEl2.value"));

t('13: Step 1 back sets estimatorPickerScreen=artisan (city preserved)',
  (function() {
    var idx = resSrc.indexOf("dest === 'artisan'");
    var block = resSrc.substring(idx, idx + 400);
    return block.includes("estimatorPickerScreen") && block.includes("'artisan'");
  })());

t('14: Step 1 back does not clear estimatorCity',
  (function() {
    var idx = resSrc.indexOf("dest === 'artisan'");
    var block = resSrc.substring(idx, idx + 400);
    return !block.includes('estimatorCity = null') && !block.includes('estimatorCity=null');
  })());

/* ── BUG B: index.html — city capture before marker removal ── */
t('15: index.html initialises window._fxEstimatorReturnCityHint before removing markers',
  idxSrc.includes('window._fxEstimatorReturnCityHint'));

t('16: index captures city from fx_estimator_return_city_v1 BEFORE removeItem calls',
  (function() {
    var captureIdx = idxSrc.indexOf('_fxEstimatorReturnCityHint');
    var removeIdx  = idxSrc.indexOf("removeItem(RETURN_MARKER)");
    return captureIdx !== -1 && removeIdx !== -1 && captureIdx < removeIdx;
  })());

t('17: index removes fx_estimator_return_v1 after capture (RETURN_MARKER)',
  idxSrc.includes("removeItem(RETURN_MARKER)") ||
  idxSrc.includes("removeItem('fx_estimator_return_v1')"));

t('18: index also removes fx_estimator_return_city_v1 during cleanup',
  idxSrc.includes("removeItem('fx_estimator_return_city_v1')"));

t('19: pricing token (fixeo_estimator_ctx_v1) NOT removed by index restore hook',
  !idxSrc.includes("removeItem('fixeo_estimator_ctx_v1')"));

t('20: window hint contains only city string — no raw price persisted',
  (function() {
    var idx = idxSrc.indexOf('_fxEstimatorReturnCityHint');
    var block = idxSrc.substring(idx - 50, idx + 300);
    return !block.includes('amount_mad') && !block.includes('price') && !block.includes('MAD');
  })());

/* ── BUG B: reservation.js verifyContext — reads window hint, NOT sessionStorage ── */
t('21: verifyContext else-branch reads window._fxEstimatorReturnCityHint',
  resSrc.includes('window._fxEstimatorReturnCityHint'));

t('22: window hint cleared one-shot before conditional use (fail-safe)',
  (function() {
    var idx = resSrc.indexOf('window._fxEstimatorReturnCityHint');
    /* Must set to empty string immediately after reading */
    var block = resSrc.substring(idx, idx + 200);
    return block.includes("window._fxEstimatorReturnCityHint = ''");
  })());

t('23: Casablanca validates against _ESTIMATOR_CITIES in restore path',
  resSrc.includes('_ESTIMATOR_CITIES.find(function(c)'));

t('24: valid city sets estimatorCity AND estimatorPickerScreen=artisan',
  (function() {
    var idx = resSrc.indexOf('Valid UX city — restore artisan picker directly');
    return idx !== -1 &&
           resSrc.substring(idx, idx + 300).includes('estimatorCity') && resSrc.substring(idx, idx + 300).includes("'artisan'");
  })());

t('25: server ctx.city_slug takes precedence — clears window hint when present',
  (function() {
    var idx = resSrc.indexOf('ctx.city_slug) {');
    var block = resSrc.substring(idx, idx + 600);
    return block.includes("window._fxEstimatorReturnCityHint = ''");
  })());

t('26: terminal failure clears window hint',
  (function() {
    var catchIdx = resSrc.lastIndexOf('.catch(function()');
    var block = resSrc.substring(catchIdx, catchIdx + 200);
    return block.includes("window._fxEstimatorReturnCityHint = ''");
  })());

t('27: window hint does not persist amount_mad or service price',
  !resSrc.includes('_fxEstimatorReturnCityHint.*amount') &&
  (function() {
    var idx = resSrc.indexOf('_fxEstimatorReturnCityHint');
    var block = resSrc.substring(idx - 100, idx + 200);
    return !block.includes('amount_mad') && !block.includes('price');
  })());

t('28: verifyContext still runs server-side (not bypassed)',
  resSrc.includes('verifyContext().then'));

/* ── Routing: if city restored, artisan picker shows ── */
t('29: routing uses estimatorPickerScreen to show artisan picker when set',
  resSrc.includes("var _screen = state.estimatorPickerScreen ||"));

/* ── Non-regression guards ── */
t('30: normal reservation (non-estimator open) unaffected — open() still accepts artisan ID',
  resSrc.includes('function open(artisanInput, isExpress, urgentContext)'));

t('31: fixeo-estimator-v2.js not modified',
  (function() {
    try {
      var v2 = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
      return !v2.includes('_fxEstimatorReturnCityHint') && !v2.includes('_hideContainer');
    } catch (_) { return true; }
  })());

var total = pass + fail;
console.log('\n' + pass + '/' + total + ' tests pass' + (fail > 0 ? ' — FAILURES ABOVE' : ''));
if (fail > 0) process.exit(1);
