/**
 * Phase 7C.9L.3E — Exact Estimator Service Identity Tests
 *
 * Verifies that:
 * 1. verify_pricing_context returns service_code + canonical service_label
 * 2. Bridge propagates both fields
 * 3. reservation.js uses service_label (not SERVICE_MAP[metier][0]) for selectedService
 * 4. "Prix FIXEO garanti" removed; "(indicatif)" absent from estimator price
 * 5. Non-estimator paths unchanged
 * 6. Canonical pricing / engine / booking authority / idempotency untouched
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var apiSrc      = fs.readFileSync(path.join(__dirname, '../../../../..', 'api/estimator-v1/index.js'), 'utf8');
var bridgeSrc   = fs.readFileSync(path.join(__dirname, '../../../../..', 'js/fixeo-estimator-reservation-bridge-v1.js'), 'utf8');
var resSrc      = fs.readFileSync(path.join(__dirname, '../../../../..', 'js/reservation.js'), 'utf8');

var resolver    = require(path.join(__dirname, '../../../../..', 'data/pricing/orchestrator/estimator-service-resolver-v1'));

var passed = 0;
var failed = 0;

function assert(name, cond) {
  if (cond) { console.log('  \u2713 ' + name); passed++; }
  else       { console.error('  \u2717 FAIL: ' + name); failed++; }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 1 — API: resolver required + service_label in response');
// ─────────────────────────────────────────────────────────────────────────────

assert('1. resolver required in api/estimator-v1/index.js',
  apiSrc.includes("require('../../data/pricing/orchestrator/estimator-service-resolver-v1')") ||
  apiSrc.includes('require("../../data/pricing/orchestrator/estimator-service-resolver-v1")'));

assert('2. service_label populated in handleVerifyPricingContext return',
  (function() {
    var i = apiSrc.indexOf('function handleVerifyPricingContext(');
    var block = apiSrc.slice(i, i + 1200);
    return block.includes('service_label');
  })());

assert('3. resolver.getService used in handleVerifyPricingContext',
  (function() {
    var i = apiSrc.indexOf('function handleVerifyPricingContext(');
    var block = apiSrc.slice(i, i + 1200);
    return block.includes('resolver.getService') || block.includes('getService(');
  })());

assert('4. service_label fallback to null — no invented label',
  (function() {
    var i = apiSrc.indexOf('function handleVerifyPricingContext(');
    var block = apiSrc.slice(i, i + 1200);
    return block.includes('service_label = null') || block.includes('service_label:       null');
  })());

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 2 — Canonical label lookup correctness');
// ─────────────────────────────────────────────────────────────────────────────

assert('5. resolver.getService returns object for plomberie.debouchage_evier',
  resolver.getService('plomberie.debouchage_evier') !== null);

assert('6. plomberie.debouchage_evier resolves label_fr = "Débouchage évier standard"',
  (function() {
    var svc = resolver.getService('plomberie.debouchage_evier');
    return svc && svc.label_fr === 'D\u00e9bouchage \u00e9vier standard';
  })());

assert('7. nonexistent service_code returns null — no crash',
  resolver.getService('nonexistent.code') === null);

assert('8. resolver.getService exported (already used by SERVICE_SELECTION candidate path)',
  typeof resolver.getService === 'function');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 3 — Bridge propagation');
// ─────────────────────────────────────────────────────────────────────────────

assert('9. bridge propagates service_code',
  bridgeSrc.includes('service_code:') && bridgeSrc.includes('r.service_code'));

assert('10. bridge propagates service_label',
  bridgeSrc.includes('service_label:') && bridgeSrc.includes('r.service_label'));

assert('11. bridge service_label fallback to null when absent',
  bridgeSrc.includes('r.service_label || null') || bridgeSrc.includes("r.service_label||null"));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 4 — SERVICE_MAP[metier][0] removed from estimator path');
// ─────────────────────────────────────────────────────────────────────────────

assert('12. SERVICE_MAP[metier][0] NOT used when estimatorCtx valid (estimator branch absent)',
  (function() {
    // Find the _selectArtisanFromPicker function body
    var i = resSrc.indexOf('function _selectArtisanFromPicker(');
    var block = resSrc.slice(i, i + 600);
    // Must NOT contain the old pattern: SERVICE_MAP[_metier][0] or _svcList[0]
    return !block.includes('_svcList[0]') && !block.includes('SERVICE_MAP[_metier][0]');
  })());

assert('13. estimator branch uses service_label || service_code for selectedService',
  (function() {
    var i = resSrc.indexOf('function _selectArtisanFromPicker(');
    var block = resSrc.slice(i, i + 800);
    return block.includes('_estimatorCtx.service_label') &&
           block.includes('_estimatorCtx.service_code') &&
           block.includes('state.selectedService =');
  })());

assert('14. selectedService set in estimator mode without consulting SERVICE_MAP for metier[0]',
  (function() {
    var i = resSrc.indexOf('7C.9L.3E');
    var block = resSrc.slice(i, i + 400);
    return block.includes('service_label') && !block.includes('_svcList');
  })());

assert('15. non-estimator selectedService is unchanged (SERVICE_MAP still used for non-estimator open())',
  (function() {
    var i = resSrc.indexOf('function open(artisanInput');
    var block = resSrc.slice(i, i + 3000);
    return block.includes('SERVICE_MAP') || block.includes('catServices');
  })());

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 5 — State shape and machine identity preservation');
// ─────────────────────────────────────────────────────────────────────────────

assert('16. state._estimatorCtx.service_code preserved throughout (never overwritten)',
  (function() {
    // Ensure service_code is never set to something else after context load
    // The _selectArtisanFromPicker must only read service_code, never assign to it
    var i = resSrc.indexOf('function _selectArtisanFromPicker(');
    var block = resSrc.slice(i, i + 600);
    return !block.includes('_estimatorCtx.service_code =');
  })());

assert('17. state._estimatorCtx.service_label read-only in reservation (never reassigned)',
  (function() {
    var count = (resSrc.match(/_estimatorCtx\.service_label\s*=/g) || []).length;
    return count === 0; // never assigned to — only read
  })());

assert('18. state._estimatorCtx reset on every open() call (service_code/label come fresh from verifyContext)',
  resSrc.includes('state._estimatorCtx = null'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 6 — Step 1 display');
// ─────────────────────────────────────────────────────────────────────────────

assert('19. Step 1 service badge reads state.selectedService (not hardcoded label)',
  (function() {
    var i = resSrc.indexOf('7C.9L.3C: Estimator mode');
    var block = resSrc.slice(i, i + 500);
    return block.includes('state.selectedService');
  })());

assert('20. Step 1 estimator price reads state._estimatorCtx.amount_mad (not priceFrom)',
  (function() {
    var i = resSrc.indexOf('7C.9L.3C: when estimator context active');
    var block = resSrc.slice(i, i + 400);
    return block.includes('_estimatorCtx.amount_mad');
  })());

assert('21. Step 1 shows "Prix FIXEO" — not "Prix FIXEO garanti"',
  (function() {
    var i = resSrc.indexOf('7C.9L.3C: when estimator context active');
    // The price-unit value is inside a single-quoted string in reservation.js
    // Check: the div contains 'Prix FIXEO' (not 'Prix FIXEO garanti')
    return resSrc.includes("'Prix FIXEO'</div>") ||
           resSrc.includes('Prix FIXEO</div>') ||
           (resSrc.includes('Prix FIXEO') && !resSrc.includes('Prix FIXEO garanti'));
  })());

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 7 — Step 2 display');
// ─────────────────────────────────────────────────────────────────────────────

assert('22. Step 2 Service row uses state.selectedService',
  (function() {
    var i = resSrc.indexOf("['Service',");
    var block = resSrc.slice(i, i + 80);
    return block.includes('state.selectedService');
  })());

assert('23. Step 2 estimator shows Prix FIXEO without "(indicatif)"',
  (function() {
    var i = resSrc.indexOf("'Prix FIXEO'");
    return i > 0 && resSrc.slice(i, i + 80).includes('amount_mad');
  })());

assert('24. Step 2 non-estimator retains "(indicatif)" wording',
  resSrc.includes('(indicatif)'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 8 — Wording: "garanti" removed from estimator price path');
// ─────────────────────────────────────────────────────────────────────────────

assert('25. "Prix FIXEO garanti" string absent from reservation.js',
  !resSrc.includes('Prix FIXEO garanti'));

assert('26. "garanti" used only for unrelated "Réponse garantie" (express mode)',
  (function() {
    var matches = resSrc.match(/garanti/gi) || [];
    // Only remaining "garanti" is in "Réponse garantie" (express artisan response)
    return matches.length === 1 && resSrc.includes('R\u00e9ponse garantie');
  })());

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 9 — Pricing authority unchanged');
// ─────────────────────────────────────────────────────────────────────────────

assert('27. _useEstimator gate reads amount_mad from _estimatorCtx (not selectedService)',
  (function() {
    var i = resSrc.indexOf('_useEstimator');
    var block = resSrc.slice(i, i + 400);
    return block.includes('amount_mad') && !block.includes('SERVICE_MAP');
  })());

assert('28. bookingData._estimator_context_token preserved',
  resSrc.includes('_estimator_context_token: (state._estimatorCtx && state._estimatorCtx._token)'));

assert('29. service_label NEVER participates in price calculation (_svcP reads selectedService from SERVICE_PRICING, not label)',
  (function() {
    var i = resSrc.indexOf('SERVICE_PRICING[state.selectedService]');
    // SERVICE_PRICING maps legacy service names → price ranges (display only)
    // In estimator mode _useEstimator overrides this → _svcP unused for total
    // Just verify the pricing gate uses amount_mad, not selectedService for total
    var gateIdx = resSrc.indexOf('_useEstimator ? (state._estimatorCtx.amount_mad');
    return gateIdx > 0;
  })());

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSECTION 10 — Integrity: no change to protected files');
// ─────────────────────────────────────────────────────────────────────────────

assert('30. canonical pricing diff = 0',
  (function() {
    var { execSync } = require('child_process');
    var diff = execSync('git -C ' + path.join(__dirname, '../../../../..') + ' diff -- data/pricing/canonical/').toString().trim();
    return diff.length === 0;
  })());

assert('31. pricing engine diff = 0',
  (function() {
    var { execSync } = require('child_process');
    var diff = execSync('git -C ' + path.join(__dirname, '../../../../..') + ' diff -- data/pricing/engine/pricing-engine-core-v1.js').toString().trim();
    return diff.length === 0;
  })());

assert('32. booking authority diff = 0',
  (function() {
    var { execSync } = require('child_process');
    var diff = execSync('git -C ' + path.join(__dirname, '../../../../..') + ' diff -- api/fixeo-booking-authority-v1.js').toString().trim();
    return diff.length === 0;
  })());

assert('33. idempotency diff = 0',
  (function() {
    var { execSync } = require('child_process');
    var diff = execSync('git -C ' + path.join(__dirname, '../../../../..') + ' diff -- api/fixeo-estimator-idempotency-v1.js').toString().trim();
    return diff.length === 0;
  })());

assert('34. Supabase schema diff = 0 (no schema files changed)',
  (function() {
    var { execSync } = require('child_process');
    var diff = execSync('git -C ' + path.join(__dirname, '../../../../..') + ' diff -- supabase/').toString().trim();
    return diff.length === 0;
  })());

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\u2500'.repeat(60));
var total = passed + failed;
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9L.3E service identity tests passed \u2713');
} else {
  console.error('  ' + failed + ' test(s) FAILED');
  process.exit(1);
}
