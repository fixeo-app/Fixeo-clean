/**
 * estimator-v2-10b2-handoff-city-tests.js
 * Phase 7C.10B.2 — Reservation handoff + interactive city picker
 * 28 tests total
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0; let fail = 0;
function t(label, condition, detail) {
  if (condition) { console.log('  ✓', label); pass++; }
  else { console.error('  ✗', label, detail || ''); fail++; }
}

const pageJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-estimation-page-v1.js'), 'utf8');
const pageCss = fs.readFileSync(
  path.resolve(__dirname, '../../../../../css/fixeo-estimation-page-v1.css'), 'utf8');

/* Reproduce city and metier lists */
const PAGE_CITIES = [
  'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
  'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
  'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
  'Taza','Ouarzazate','Mohammedia',
];
const TOP_CITIES = ['Casablanca','Rabat','Marrakech','Tanger','Agadir','Fès'];

console.log('\n── 7C.10B.2 — RESERVATION HANDOFF + CITY PICKER ──');

/* ══════════════════════════════════════════════════════════
   GROUP 1 — RESERVATION STACK: ARTISAN DATA ADDED
══════════════════════════════════════════════════════════ */
console.log('\n[1] Reservation stack — artisan data');

// 1 — fixeo-supabase-loader loaded before reservation.js
t('1. fixeo-supabase-loader.js?v=sl2 in stack (provides window.ARTISANS)',
  pageJs.includes('fixeo-supabase-loader.js?v=sl2'));

// 2 — fixeo_homepage_premium_patch loaded (provides buildCard)
t('2. fixeo_homepage_premium_patch.js in stack (provides FixeoHomepagePremium.buildCard)',
  pageJs.includes('fixeo_homepage_premium_patch.js'));

// 3 — supabase-loader loads BEFORE reservation.js (dependency order)
t('3. supabase-loader loads before reservation.js in chain',
  (function () {
    var sl = pageJs.indexOf('fixeo-supabase-loader');
    var res = pageJs.indexOf("'js/reservation.js");
    return sl !== -1 && res !== -1 && sl < res;
  })());

// 4 — premium patch loads BEFORE reservation.js
t('4. homepage_premium_patch loads before reservation.js in chain',
  (function () {
    var hp = pageJs.indexOf('fixeo_homepage_premium_patch');
    var res = pageJs.indexOf("'js/reservation.js");
    return hp !== -1 && res !== -1 && hp < res;
  })());

// 5 — loadScriptOnce handles defer-present scripts robustly
t('5. loadScriptOnce checks global readiness when script tag already present (defer safety)',
  pageJs.includes('FixeoSupabaseLoader') &&
  pageJs.includes('FixeoHomepagePremium') &&
  pageJs.includes('globalReady'));

/* ══════════════════════════════════════════════════════════
   GROUP 2 — RESERVATION HANDOFF CONTRACT
══════════════════════════════════════════════════════════ */
console.log('\n[2] Reservation handoff');

// 6 — event listener on fixeo:estimator-reserve
t('6. fixeo:estimator-reserve listener installed',
  pageJs.includes("'fixeo:estimator-reserve'") &&
  pageJs.includes('document.addEventListener'));

// 7 — token validated before proceeding
t('7. Token from e.detail.pricing_context_token validated before open()',
  pageJs.includes('e.detail && e.detail.pricing_context_token') &&
  pageJs.includes('if (!token) return'));

// 8 — duplicate tap guard present
t('8. _reservationHandoffPending guard prevents duplicate opens',
  pageJs.includes('_reservationHandoffPending'));

// 9 — FixeoReservation.open(null, false, null) called
t('9. FixeoReservation.open(null, false, null) called after stack load',
  pageJs.includes('window.FixeoReservation.open(null, false, null)'));

// 10 — FixeoEstimatorV2.hide() called (not close()) after reservation opens
t('10. FixeoEstimatorV2.hide() called after reservation opens (preserve PRICE_READY DOM)',
  pageJs.includes('FixeoEstimatorV2.hide()') &&
  !pageJs.match(/FixeoEstimatorV2\.close\(\)/));

// 11 — error in open() resets guard (estimator stays visible for retry)
t('11. Error during open() resets guard, leaves estimator visible',
  pageJs.includes('_reservationHandoffPending = false') &&
  pageJs.includes('catch (_err)'));

// 12 — reservation stack covers full dependency chain
t('12. Full stack: supabase-loader → premium → reservation → slot-lock → payment → cod → v2 → flagship → faee → review',
  pageJs.includes('slot-lock.js') &&
  pageJs.includes('payment.js') &&
  pageJs.includes('cod-payment.js') &&
  pageJs.includes('reservation-v2.js') &&
  pageJs.includes('fixeo-reservation-flagship-v1.js') &&
  pageJs.includes('fixeo-estimation-engine-v1.js') &&
  pageJs.includes('fixeo-review-engine-v1.js'));

/* ══════════════════════════════════════════════════════════
   GROUP 3 — CITY PICKER
══════════════════════════════════════════════════════════ */
console.log('\n[3] City picker');

// 13 — _openCityPicker function exists
t('13. _openCityPicker function defined in page JS',
  pageJs.includes('function _openCityPicker('));

// 14 — city chip is now a button (interactive)
t('14. City chip rendered as <button> element (interactive)',
  pageJs.includes("cityChip = document.createElement('button')") ||
  pageJs.includes('document.createElement("button")'));

// 15 — clicking city chip opens picker
t('15. City chip click opens city picker overlay',
  pageJs.includes('_openCityPicker(function'));

// 16 — canonical city list (_PAGE_CITIES) has 20 cities
t('16. _PAGE_CITIES has 20 canonical cities matching reservation.js _ESTIMATOR_CITIES',
  (function () {
    // Count city strings in the _PAGE_CITIES array definition
    var m = pageJs.match(/_PAGE_CITIES\s*=\s*\[[\s\S]*?\]/);
    if (!m) return false;
    var block = m[0];
    var count = (block.match(/'[A-ZÀ-ÿ]/g) || []).length;
    return count === 20;
  })());

// 17 — top cities list present
t('17. _PAGE_TOP_CITIES (6 cities) present',
  pageJs.includes("_PAGE_TOP_CITIES = ['Casablanca'") ||
  pageJs.includes("_PAGE_TOP_CITIES=['Casablanca'"));

// 18 — city selection writes to fxrf4_trusted_city_session
t('18. City selection writes to sessionStorage fxrf4_trusted_city_session',
  pageJs.includes("'fxrf4_trusted_city_session'") &&
  pageJs.includes('sessionStorage.setItem'));

// 19 — city selection also writes to fixeo_detected_city localStorage
t('19. City selection also writes to localStorage fixeo_detected_city',
  pageJs.includes("localStorage.setItem(CITY_LS_KEY") ||
  pageJs.includes("localStorage.setItem('fixeo_detected_city'"));

// 20 — "Choisir une ville" neutral placeholder retained
t('20. Neutral placeholder "Choisir une ville" shown when no city',
  pageJs.includes('Choisir une ville'));

// 21 — city picker is a fixed overlay (mobile-safe)
t('21. City picker overlay uses position:fixed (mobile-safe)',
  pageJs.includes('position:fixed'));

// 22 — picker closes on backdrop tap
t('22. City picker closes on backdrop tap',
  pageJs.includes('e.target === overlay') &&
  pageJs.includes('overlay.remove()'));

// 23 — no scrollIntoView call in city picker (comments mentioning it are fine)
t('23. No scrollIntoView() call in page JS (iOS safe)',
  !pageJs.match(/\.scrollIntoView\s*\(/));

// 24 — city does not affect pricing (no re-evaluate)
t('24. City selection does not trigger FixeoEstimatorAPI.evaluate() (price unchanged)',
  !pageJs.includes('FixeoEstimatorAPI.evaluate('));

/* ══════════════════════════════════════════════════════════
   GROUP 4 — PAGE_REQUIRED UNCHANGED
══════════════════════════════════════════════════════════ */
console.log('\n[4] PAGE_REQUIRED / authority');

// 25 — mode detection unchanged
t('25. PAGE_REQUIRED token detection unchanged',
  pageJs.includes("'fixeo_estimator_token_v1'") &&
  pageJs.includes("_mode = 'page-required'") &&
  pageJs.includes("if (_mode === 'page-required') {") &&
  pageJs.includes('return;'));

// 26 — "Maroc" still rejected
t('26. "Maroc" city still rejected by _canonicalCity()',
  pageJs.includes('_canonicalCity') &&
  pageJs.includes('VALID_CITIES'));

// 27 — no pricing arithmetic
t('27. No pricing arithmetic in page JS',
  !pageJs.includes('price_per_m2') &&
  !pageJs.includes('PRICE_MAP') &&
  !pageJs.includes('FixeoEstimatorAPI.evaluate('));

// 28 — no Supabase direct calls
t('28. No direct Supabase client calls (supabase-loader handles data loading)',
  !pageJs.includes('supabase.from(') &&
  !pageJs.includes('createClient(') &&
  !pageJs.includes('SUPABASE_URL'));

/* ══════════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
