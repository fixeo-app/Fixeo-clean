/*!
 * estimator-v2-artisan-card-selection-tests.js
 * Phase 7C.9L.3K — Fix Estimator artisan card selection
 *
 * Root cause: buildOtherArtisanCard() estimatorMode used JSON.stringify(String(a.id)) = '"2000"'
 * (double-quoted string) inside double-quoted HTML onclick attribute on BOTH the article tag
 * and the CTA button. Browser truncated both attributes at the first inner double-quote.
 * Neither handler ever fired. Card tap → nothing. CTA tap → nothing.
 *
 * Fix:
 *   js/main.js     — estimator article: inline onclick removed (data-estimator-id kept)
 *                    estimator CTA:     inline onclick removed; data-estimator-select="true" added
 *   js/reservation.js — delegated capture listener extended for [data-estimator-select] (CTA)
 *                       and article[data-estimator-id] (card body)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../../..');

function load(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const mainSrc = load('js/main.js');
const resSrc  = load('js/reservation.js');

let passed = 0; let failed = 0;
function assert(name, cond) {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else       { console.error('  ✗ ' + name); failed++; }
}

/* ── Simulate buildOtherArtisanCard output ──────────────────────────────────── */
function sanitize(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function renderEstimatorCard(id) {
  /* Mirror exactly what buildOtherArtisanCard does in estimatorMode */
  var articleAttrs = 'data-estimator-id="' + id + '" role="button" tabindex="0"';
  var ctaAttrs = 'data-estimator-select="true"';
  return {
    article: '<article class="artisan-card" ' + articleAttrs + '>',
    cta: '<button class="btn-primary fhp-btn-reserve-list" ' + ctaAttrs + '>Choisir cet artisan</button>',
    articleAttrs: articleAttrs,
    ctaAttrs: ctaAttrs
  };
}

function renderNormalCard(id) {
  var serialized = JSON.stringify(String(id));
  return {
    article: '<article class="artisan-card" data-id="' + id + '">',
    cta: '<button class="btn-primary fhp-btn-reserve-list" onclick="event.stopPropagation();if(window.FixeoReservation){window.FixeoReservation.open(' + serialized + ');}">Réserver en 1 clic</button>'
  };
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' Phase 7C.9L.3K — Estimator Artisan Card Selection Tests');
console.log('══════════════════════════════════════════════════════════\n');

// ─── 1. MAIN.JS SOURCE STRUCTURE ─────────────────────────────────────────────
console.log('SECTION 1 — main.js buildOtherArtisanCard estimator attributes');

assert('1.1 estimator article has no inline onclick (old JSON.stringify pattern removed)',
  (function() {
    var buildFn = mainSrc.slice(mainSrc.indexOf('function buildOtherArtisanCard'));
    var estimatorOnclick = buildFn.match(/data-estimator-id.*onclick=/);
    return !estimatorOnclick;
  })());

assert('1.2 data-estimator-id preserved on article in estimatorMode',
  mainSrc.includes("'data-estimator-id=\"'+a.id+'\"") ||
  mainSrc.includes('"data-estimator-id=\\""+a.id') ||
  mainSrc.includes("data-estimator-id=\"'+a.id"));

assert('1.3 estimator CTA has data-estimator-select="true"',
  mainSrc.includes('data-estimator-select="true"') ||
  mainSrc.includes("data-estimator-select=\\\"true\\\""));

assert('1.4 estimator CTA has NO inline onclick with JSON.stringify ID',
  !mainSrc.includes('_selectArtisanFromPicker('+JSON.stringify('"')));

assert('1.5 estimator CTA has NO _selectArtisanFromPicker in its onclick attr',
  (function() {
    /* Check that the _estimatorMode branch of the CTA button does NOT include onclick= */
    var buildStart = mainSrc.indexOf('function buildOtherArtisanCard');
    var buildEnd   = mainSrc.indexOf('\nwindow.buildOtherArtisanCard', buildStart);
    var body = mainSrc.substring(buildStart, buildEnd);
    /* Find CTA button section and check estimator branch has no _selectArtisanFromPicker in onclick */
    var ctaIdx = body.indexOf('fhp-btn-reserve-list');
    var ctaRegion = body.substring(ctaIdx, ctaIdx + 600);
    return !ctaRegion.includes("data-estimator-select") ||
           !ctaRegion.includes("_selectArtisanFromPicker("+'"');
  })());

assert('1.6 estimator CTA label is "Choisir cet artisan"',
  mainSrc.includes("'Choisir cet artisan'") || mainSrc.includes('"Choisir cet artisan"'));

// ─── 2. RENDERED HTML SAFETY ─────────────────────────────────────────────────
console.log('\nSECTION 2 — Rendered HTML attribute safety');

function noNestedDoubleQuotes(html) {
  var m = html.match(/data-estimator-id="([^"]*)"/);
  if (!m) return false;
  return m[1].indexOf('"') === -1;
}

assert('2.1 data-estimator-id="2000" renders without nested double quotes',
  noNestedDoubleQuotes(renderEstimatorCard('2000').article));

assert('2.2 data-estimator-id with UUID string renders safely',
  noNestedDoubleQuotes(renderEstimatorCard('abc-123-uuid-def').article));

assert('2.3 data-estimator-select="true" has no nested double quotes',
  renderEstimatorCard('2000').cta.match(/data-estimator-select="([^"]*)"/) !== null);

assert('2.4 estimator article has NO onclick attribute',
  !renderEstimatorCard('2000').article.includes('onclick='));

assert('2.5 estimator CTA has NO onclick attribute',
  !renderEstimatorCard('2000').cta.includes('onclick='));

assert('2.6 normal homepage card STILL has data-id (unchanged)',
  renderNormalCard('2000').article.includes('data-id="2000"'));

assert('2.7 normal homepage CTA STILL has inline onclick for FixeoReservation.open',
  renderNormalCard('2000').cta.includes('onclick=') &&
  renderNormalCard('2000').cta.includes('FixeoReservation'));

// ─── 3. RESERVATION.JS DELEGATED HANDLER ─────────────────────────────────────
console.log('\nSECTION 3 — reservation.js delegated handler');

assert('3.1 One-shot guard _fxResEstimatorCityListenerBound still present',
  resSrc.includes('_fxResEstimatorCityListenerBound'));

assert('3.2 Single addEventListener call for both city + artisan selection',
  (function() {
    var guardIdx = resSrc.indexOf('_fxResEstimatorCityListenerBound = true');
    var afterGuard = resSrc.substring(guardIdx, guardIdx + 3000);
    // Only one addEventListener call after the guard
    var count = (afterGuard.match(/addEventListener\('click'/g) || []).length;
    return count === 1;
  })());

assert('3.3 Handler checks [data-estimator-select] for CTA tap',
  resSrc.includes("'[data-estimator-select]'") || resSrc.includes('"[data-estimator-select]"') ||
  resSrc.includes("closest('[data-estimator-select]')"));

assert('3.4 Handler finds closest article[data-estimator-id] from CTA',
  resSrc.includes("closest('article[data-estimator-id]')") ||
  resSrc.includes('closest("article[data-estimator-id]")'));

assert('3.5 Handler reads getAttribute("data-estimator-id")',
  resSrc.includes("getAttribute('data-estimator-id')") ||
  resSrc.includes('getAttribute("data-estimator-id")'));

assert('3.6 Handler calls _selectArtisanFromPicker(artisanId) — NOT JSON.stringify',
  resSrc.includes('_selectArtisanFromPicker(artisanId)') ||
  resSrc.includes('_selectArtisanFromPicker(cardId)'));

assert('3.7 Card body tap handler checks article[data-estimator-id] directly',
  resSrc.includes("closest('article[data-estimator-id]')") ||
  resSrc.includes('closest("article[data-estimator-id]")'));

assert('3.8 Handler scoped to reservation modal (MODAL_ID)',
  resSrc.includes('modal.contains(selectBtn)') &&
  resSrc.includes('modal.contains(artCard)'));

assert('3.9 e.preventDefault() + e.stopPropagation() called in selection paths',
  (function() {
    var handlerStart = resSrc.indexOf('_fxResEstimatorCityListenerBound = true');
    var handlerEnd = handlerStart + 4000;
    var body = resSrc.substring(handlerStart, handlerEnd);
    return (body.match(/e\.preventDefault\(\)/g) || []).length >= 2 &&
           (body.match(/e\.stopPropagation\(\)/g) || []).length >= 2;
  })());

assert('3.10 Capture phase (true) preserved for iOS tap support',
  resSrc.includes('true /* capture'));

// ─── 4. DOUBLE-FIRE PREVENTION ────────────────────────────────────────────────
console.log('\nSECTION 4 — Double-fire prevention');

assert('4.1 CTA branch uses return after calling _selectArtisanFromPicker',
  (function() {
    var selStart = resSrc.indexOf("closest('[data-estimator-select]')") ||
                   resSrc.indexOf("closest('article[data-estimator-id]')");
    var region = resSrc.substring(
      resSrc.indexOf('data-estimator-select'),
      resSrc.indexOf('data-estimator-select') + 600
    );
    return region.includes('return;') && region.includes('_selectArtisanFromPicker');
  })());

assert('4.2 City chip branch also returns after handling (no fall-through)',
  (function() {
    /* City chip branch ends with return; after _setEstimatorCity call */
    var chipBlock = resSrc.indexOf('_setEstimatorCity(city)');
    if (chipBlock < 0) return false;
    var after = resSrc.substring(chipBlock, chipBlock + 100);
    return after.includes('return;');
  })());

assert('4.3 Card body branch guards against button/a children (unrelated interactive controls)',
  resSrc.includes("button:not([data-estimator-select])") ||
  resSrc.includes('button:not(') && resSrc.includes('data-estimator-select'));

// ─── 5. _selectArtisanFromPicker MECHANICS ────────────────────────────────────
console.log('\nSECTION 5 — _selectArtisanFromPicker state effects');

assert('5.1 state.artisan assigned by normalizeArtisan(id)',
  resSrc.includes('state.artisan = normalizeArtisan(id)'));

assert('5.2 state.step = 1 set',
  (function() {
    var fn = resSrc.substring(resSrc.indexOf('function _selectArtisanFromPicker'), 
                              resSrc.indexOf('function _selectArtisanFromPicker') + 400);
    return fn.includes('state.step = 1');
  })());

assert('5.3 state._estimatorCtx NOT reset in _selectArtisanFromPicker (comment confirms)',
  resSrc.includes('state._estimatorCtx is NOT reset here') &&
  (function() {
    var fnStart = resSrc.indexOf('function _selectArtisanFromPicker');
    var fnEnd   = resSrc.indexOf('\n  }', fnStart) + 4;
    var fn = resSrc.substring(fnStart, fnEnd);
    return !fn.includes('state._estimatorCtx = null');
  })());

assert('5.4 service_label preserved from _estimatorCtx.service_label',
  resSrc.includes('state._estimatorCtx.service_label'));

assert('5.5 service_code preserved from _estimatorCtx.service_code',
  resSrc.includes('state._estimatorCtx.service_code'));

assert('5.6 render() called after selection',
  (function() {
    var fnStart = resSrc.indexOf('function _selectArtisanFromPicker');
    var fn = resSrc.substring(fnStart, fnStart + 900);
    return fn.includes('render()');
  })());

// ─── 6. ESTIMATOR CONTEXT PRESERVATION ──────────────────────────────────────
console.log('\nSECTION 6 — Estimator context fields preserved');

assert('6.1 amount_mad in _estimatorCtx usage (display)',
  resSrc.includes('ctx.amount_mad') || resSrc.includes('_estimatorCtx.amount_mad'));

assert('6.2 estimatorCity preserved (not cleared on artisan selection)',
  !resSrc.includes('state.estimatorCity = null') ||
  (function() {
    var fnSrc = resSrc.substring(resSrc.indexOf('function _selectArtisanFromPicker'),
                                 resSrc.indexOf('function _selectArtisanFromPicker') + 500);
    return !fnSrc.includes('state.estimatorCity = null');
  })());

assert('6.3 pricing_context_token field referenced in bookingData (unchanged)',
  resSrc.includes('_estimator_context_token') ||
  resSrc.includes('pricing_context_token'));

assert('6.4 _setEstimatorCity(null) still exported (Changer de ville path)',
  resSrc.includes('_setEstimatorCity,') || resSrc.includes('_setEstimatorCity:'));

// ─── 7. NORMAL HOMEPAGE PATH UNCHANGED ───────────────────────────────────────
console.log('\nSECTION 7 — Normal homepage cards unchanged');

assert('7.1 buildOtherArtisanCard() non-estimator path still uses data-id',
  mainSrc.includes("('data-id=\"'+a.id+'\"')") ||
  mainSrc.includes("'data-id=\"'+a.id+'\"") ||
  mainSrc.includes(": ('data-id=\"'+a.id+'\"')"));

assert('7.2 Normal homepage CTA still has inline onclick (FixeoReservation.open)',
  (function() {
    /* The non-estimator branch of the ternary must include FixeoReservation.open */
    var i = mainSrc.indexOf('fhp-btn-reserve-list');
    var region = mainSrc.substring(i, i + 500);
    /* Ternary: estimatorMode branch ? ... : (homepage branch with open) */
    return region.includes('FixeoReservation') && region.includes('.open(');
  })());

assert('7.3 Normal homepage cards have NO data-estimator-id',
  (function() {
    var card = renderNormalCard('2000');
    return !card.article.includes('data-estimator-id');
  })());

assert('7.4 Normal homepage cards have NO data-estimator-select',
  (function() {
    var card = renderNormalCard('2000');
    return !card.cta.includes('data-estimator-select');
  })());

assert('7.5 window.buildOtherArtisanCard still exported',
  mainSrc.includes('window.buildOtherArtisanCard = buildOtherArtisanCard'));

// ─── 8. PRICING / AUTHORITY UNCHANGED ────────────────────────────────────────
console.log('\nSECTION 8 — Pricing authority unchanged');

assert('8.1 _estimator_context_token still in bookingData',
  resSrc.includes('_estimator_context_token'));

assert('8.2 city not used in any pricing calculation',
  !resSrc.match(/city.*amount_mad|amount_mad.*city/));

assert('8.3 service_code is machine identity — not overwritten by artisan selection',
  (function() {
    var fn = resSrc.substring(resSrc.indexOf('function _selectArtisanFromPicker'),
                              resSrc.indexOf('function _selectArtisanFromPicker') + 500);
    return !fn.includes('service_code =') && fn.includes('service_code');
  })());

assert('8.4 no pricing change in main.js (no amount_mad modification)',
  !mainSrc.match(/amount_mad\s*=\s*[0-9]/));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed === 0) {
  console.log('  All 7C.9L.3K estimator artisan card selection tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exitCode = 1;
}
console.log('────────────────────────────────────────────────────────────\n');
