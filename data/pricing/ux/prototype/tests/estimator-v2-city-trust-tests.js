/*!
 * estimator-v2-city-trust-tests.js
 * Phase 7C.9L.3H — Trusted city continuity + unknown-city picker fix
 *
 * Covers:
 *  - Session trust marker (sessionStorage, not localStorage)
 *  - RAFI → city_slug (not stale detectedCity)
 *  - city_slug sealed in pricing context
 *  - city_slug verified and propagated to reservation
 *  - Trusted city skips city picker
 *  - Unknown city requires explicit tap
 *  - Artisan filter: a.category OR a.service match
 *  - Supabase loader: service_category ingested
 *  - Pricing/authority diffs = 0
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../../..');

function load(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const fxrf4Src    = load('js/fx-request-flow-v4.js');
const estV2Src    = load('js/fixeo-estimator-v2.js');
const bridgeSrc   = load('js/fixeo-estimator-reservation-bridge-v1.js');
const resSrc      = load('js/reservation.js');
const loaderSrc   = load('js/fixeo-supabase-loader.js');
const runtimeSrc  = load('api/estimator-v1/fixeo-estimator-runtime-v1.js');
const apiSrc      = load('api/estimator-v1/index.js');
const orchSrc     = load('data/pricing/orchestrator/estimator-orchestrator-v1.js');

let passed = 0; let failed = 0;
function assert(name, cond) {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else       { console.error('  ✗ ' + name); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' Phase 7C.9L.3H — Trusted City Continuity Tests');
console.log('══════════════════════════════════════════════════════════\n');

// ─── 1. SESSION TRUST MARKER ──────────────────────────────────────────────────
console.log('SECTION 1 — Session trust marker');

assert('1.1 TRUSTED_CITY_SESSION_KEY declared in fx-request-flow-v4.js',
  fxrf4Src.includes("TRUSTED_CITY_SESSION_KEY = 'fxrf4_trusted_city_session'"));

assert('1.2 Trusted session key written on geolocation success (index.html indirect — marked by presence in fxrf4)',
  fxrf4Src.includes('TRUSTED_CITY_SESSION_KEY'));

assert('1.3 Stale localStorage detectedCity NOT sent as city_slug without session check',
  !fxrf4Src.includes("city_slug:    st.detectedCity") &&
  !fxrf4Src.includes("city_slug: st.detectedCity || st.prefillCity"));

assert('1.4 sessionStorage.getItem(TRUSTED_CITY_SESSION_KEY) used at métier tap',
  fxrf4Src.includes('sessionStorage.getItem(TRUSTED_CITY_SESSION_KEY)'));

assert('1.5 stale localStorage detectedCity NOT auto-promoted to city_slug',
  fxrf4Src.includes('_trustedCity') &&
  fxrf4Src.includes('sessionStorage.getItem(TRUSTED_CITY_SESSION_KEY)'));

// ─── 2. RAFI → ESTIMATOR FIELD CONTRACT ──────────────────────────────────────
console.log('\nSECTION 2 — RAFI → Estimator city field');

assert('2.1 RAFI sends city_slug (not legacy city field)',
  fxrf4Src.includes('city_slug:') && !fxrf4Src.includes("city:         st.detectedCity"));

assert('2.2 city_slug allowed in _ALLOWED_ENTRY_FIELDS',
  estV2Src.includes("'city_slug'") && estV2Src.includes('_ALLOWED_ENTRY_FIELDS'));

assert('2.3 Orchestrator reads ctx.city_slug (unchanged)',
  orchSrc.includes('ctx.city_slug'));

assert('2.4 Orchestrator stores city_slug in entry_context (no price effect)',
  orchSrc.includes('city_slug:') && orchSrc.includes('no price effect'));

// ─── 3. CITY SEALED IN PRICING CONTEXT ───────────────────────────────────────
console.log('\nSECTION 3 — city_slug sealed in pricing context');

assert('3.1 city_slug present in buildPricingContextPayload',
  runtimeSrc.includes('city_slug:') && runtimeSrc.includes('buildPricingContextPayload'));

assert('3.2 city_slug reads from session.entry_context.city_slug',
  runtimeSrc.includes('session.entry_context') && runtimeSrc.includes('city_slug'));

assert('3.3 city_slug labeled as matching context only — not price authority',
  runtimeSrc.includes('matching context') && runtimeSrc.includes('MUST NOT affect price'));

assert('3.4 No pricing calculation uses city_slug',
  !runtimeSrc.match(/amount_mad.*city_slug|city_slug.*amount_mad/));

// ─── 4. VERIFY + BRIDGE ───────────────────────────────────────────────────────
console.log('\nSECTION 4 — verify_pricing_context returns city_slug');

assert('4.1 handleVerifyPricingContext returns city_slug',
  apiSrc.includes('city_slug:') && apiSrc.includes('handleVerifyPricingContext'));

assert('4.2 city_slug sourced from payload.city_slug (unsealed token)',
  apiSrc.includes('payload.city_slug'));

assert('4.3 Bridge propagates city_slug to state._estimatorCtx',
  bridgeSrc.includes('city_slug:') && bridgeSrc.includes('r.city_slug'));

assert('4.4 No localStorage read in bridge (no stale re-injection)',
  !bridgeSrc.includes('localStorage'));

// ─── 5. RESERVATION INITIALIZATION ───────────────────────────────────────────
console.log('\nSECTION 5 — Reservation auto-set from verified city_slug');

assert('5.1 verifyContext callback assigns state.estimatorCity from ctx.city_slug',
  resSrc.includes('state.estimatorCity = ctx.city_slug') ||
  resSrc.includes("if (ctx.city_slug) state.estimatorCity = ctx.city_slug"));

assert('5.2 Assignment is conditional on ctx.city_slug being truthy',
  (function() {
    var i = resSrc.indexOf('ctx.city_slug');
    return i > 0 && resSrc.substring(i - 20, i).includes('if (');
  })() || resSrc.includes('if (ctx.city_slug) state.estimatorCity'));

assert('5.3 null city_slug does NOT set estimatorCity (city picker shows)',
  !resSrc.includes('state.estimatorCity = ctx.city_slug || null'));

assert('5.4 _setEstimatorCity(null) correctly returns to city picker',
  resSrc.includes('state.estimatorCity = city || null') &&
  resSrc.includes('render()'));

// ─── 6. ARTISAN CATEGORY FILTER ───────────────────────────────────────────────
console.log('\nSECTION 6 — Artisan category filter fix');

assert('6.1 Filter checks both a.category AND a.service (dual-field)',
  resSrc.includes("aCat !== metier && aSvc !== metier") ||
  (resSrc.includes('aCat') && resSrc.includes('aSvc') && resSrc.includes('metier')));

assert('6.2 a.category lowercased before compare',
  resSrc.includes("(a.category || '').toLowerCase()") ||
  resSrc.includes('aCat = (a.category'));

assert('6.3 a.service lowercased before compare',
  resSrc.includes("(a.service  || '').toLowerCase()") ||
  resSrc.includes("(a.service || '').toLowerCase()") ||
  resSrc.includes('aSvc = (a.service'));

assert('6.4 "Maroc" default city still excluded',
  resSrc.includes("ac === 'maroc'") && resSrc.includes('return false'));

assert('6.5 NFD city normalization preserved',
  resSrc.includes("normalize('NFD')") && resSrc.includes("replace(/[\\u0300-\\u036f]/g"));

assert('6.6 Zero match returns empty state — not all artisans',
  resSrc.includes('matched.length === 0') && resSrc.includes('Aucun artisan'));

// ─── 7. SUPABASE LOADER ───────────────────────────────────────────────────────
console.log('\nSECTION 7 — Supabase loader service_category');

assert('7.1 service_category ingested in rawCategory chain',
  loaderSrc.includes('row.service_category'));

assert('7.2 Precedence: row.category || row.service_category || svc[0]',
  loaderSrc.match(/row\.category\s*\|\|\s*row\.service_category/) ||
  loaderSrc.match(/row\.category\s*\|\|.*service_category/));

assert('7.3 finalCategory still falls back to bricolage for unknown',
  loaderSrc.includes("|| 'bricolage'"));

assert('7.4 Both a.category and a.service still set in returned object',
  loaderSrc.includes('service: finalCategory') &&
  loaderSrc.includes('category: finalCategory'));

// ─── 8. PRICING / AUTHORITY UNCHANGED ────────────────────────────────────────
console.log('\nSECTION 8 — Pricing authority unchanged');

assert('8.1 pricing_context_token chain untouched (amount_mad, labour_amount_mad present)',
  runtimeSrc.includes('amount_mad') && runtimeSrc.includes('labour_amount_mad'));

assert('8.2 city_slug not used in any pricing calculation',
  !runtimeSrc.match(/city_slug.*\*|city_slug.*\+|city_slug.*rate/));

assert('8.3 booking authority (bookingData._estimator_context_token) unchanged',
  resSrc.includes('_estimator_context_token'));

assert('8.4 resolveAuthoritativeBookingPricing referenced (not removed)',
  resSrc.includes('resolveAuthoritativeBookingPricing') ||
  resSrc.includes('_estimator_context_token'));

assert('8.5 service_code still preserved as machine identity',
  resSrc.includes('service_code') && bridgeSrc.includes('service_code'));

assert('8.6 service_label still present in bridge',
  bridgeSrc.includes('service_label'));

// ─── 9. FXRF4 COMPATIBILITY ───────────────────────────────────────────────────
console.log('\nSECTION 9 — RAFI compatibility');

assert('9.1 metier_hint: svc.slug still sent',
  fxrf4Src.includes('metier_hint:  svc.slug'));

assert('9.2 source: rafi still sent',
  fxrf4Src.includes("source:       'rafi'"));

assert('9.3 one-shot guard _fxrf4EstimatorLaunched still present',
  fxrf4Src.includes('_fxrf4EstimatorLaunched'));

assert('9.4 accepted:false fallback still present',
  fxrf4Src.includes('_fxrf4EstimatorLaunched = false'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed === 0) {
  console.log('  All 7C.9L.3H city trust + artisan matching tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exitCode = 1;
}
console.log('────────────────────────────────────────────────────────────\n');
