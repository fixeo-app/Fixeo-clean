/**
 * estimator-v2-10b-dual-mode-tests.js
 * Phase 7C.10B — /estimation dual-mode architecture tests
 * 31 tests total
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const CITY_LS_KEY = 'fixeo_detected_city';

let pass = 0; let fail = 0;
function t(label, condition, detail) {
  if (condition) { console.log('  ✓', label); pass++; }
  else { console.error('  ✗', label, detail || ''); fail++; }
}

/* ── Load source files ───────────────────────────────── */
const estimationHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../estimation.html'), 'utf8');
const pageJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-estimation-page-v1.js'), 'utf8');
const pageCss = fs.readFileSync(
  path.resolve(__dirname, '../../../../../css/fixeo-estimation-page-v1.css'), 'utf8');

console.log('\n── 7C.10B — DUAL MODE ARCHITECTURE ──');

/* ══════════════════════════════════════════════════════
   GROUP 1 — MODE DETECTION
══════════════════════════════════════════════════════ */
console.log('\n[1] Mode detection');

// 1 — TOKEN_PR_KEY is correct
t('1. PAGE_REQUIRED token key = fixeo_estimator_token_v1',
  pageJs.includes("'fixeo_estimator_token_v1'") ||
  pageJs.includes('"fixeo_estimator_token_v1"'));

// 2 — mode defaults to 'public'
t('2. Default mode = public',
  pageJs.includes("var _mode = 'public'"));

// 3 — PAGE_REQUIRED detection reads sessionStorage non-destructively
t('3. PAGE_REQUIRED detection reads token without deleting it',
  pageJs.includes("sessionStorage.getItem(TOKEN_PR_KEY)") &&
  !pageJs.match(/sessionStorage\.removeItem\s*\(\s*TOKEN_PR_KEY/));

// 4 — mode applied to body before DOM paint
t('4. Body class applied synchronously (before DOMContentLoaded check)',
  pageJs.includes("document.documentElement.classList.add('fxep-mode-'") &&
  pageJs.includes("document.body.dataset.estimationMode = _mode"));

// 5 — early return in PAGE_REQUIRED mode
t('5. PAGE_REQUIRED mode: early return, no public modules mount',
  pageJs.includes("if (_mode === 'page-required') {") &&
  pageJs.includes("return;"));

/* ══════════════════════════════════════════════════════
   GROUP 2 — PAGE_REQUIRED PRESERVATION
══════════════════════════════════════════════════════ */
console.log('\n[2] PAGE_REQUIRED preservation');

// 6 — TOKEN_PR_KEY still consumed by estimation.html inline JS
t('6. estimation.html inline JS reads fixeo_estimator_token_v1',
  estimationHtml.includes("fixeo_estimator_token_v1"));

// 7 — painting flow function still present
t('7. renderPaintingFlow() still present in estimation.html',
  estimationHtml.includes('renderPaintingFlow'));

// 8 — FixeoEstimatorAPI.answer() call preserved
t('8. FixeoEstimatorAPI.answer() call preserved',
  estimationHtml.includes('FixeoEstimatorAPI.answer('));

// 9 — FixeoEstimatorAPI.evaluate() call preserved
t('9. FixeoEstimatorAPI.evaluate() call preserved',
  estimationHtml.includes('FixeoEstimatorAPI.evaluate('));

// 10 — pricing_context_token flow preserved
t('10. pricing_context_token used in reservation dispatch',
  estimationHtml.includes('pricing_context_token'));

// 11 — service code unchanged
t('11. peinture.mur_interieur.all_in service code unchanged',
  estimationHtml.includes('peinture.mur_interieur.all_in'));

// 12 — painted_m2 answer key unchanged
t('12. painted_m2 answer key unchanged',
  estimationHtml.includes("'painted_m2@'"));

/* ══════════════════════════════════════════════════════
   GROUP 3 — RESERVATION GAP FIX
══════════════════════════════════════════════════════ */
console.log('\n[3] Reservation gap fix');

// 13 — fixeo:estimator-reserve listener in page JS
t('13. fixeo:estimator-reserve listener in fixeo-estimation-page-v1.js',
  pageJs.includes("'fixeo:estimator-reserve'"));

// 14 — lazy reservation loader installed
t('14. _loadReservationStack installed when not already present',
  pageJs.includes('window._loadReservationStack'));

// 15 — reservation.js loaded in correct version
t('15. reservation.js?v=v1l-syntax-fix in loader',
  pageJs.includes('reservation.js?v=v1l-syntax-fix'));

// 16 — full stack loaded in dependency order
t('16. Full reservation stack: reservation → slot-lock → payment → cod-payment → reservation-v2 → flagship → faee → review',
  pageJs.includes('slot-lock.js') &&
  pageJs.includes('payment.js') &&
  pageJs.includes('cod-payment.js') &&
  pageJs.includes('reservation-v2.js') &&
  pageJs.includes('fixeo-reservation-flagship-v1.js') &&
  pageJs.includes('fixeo-estimation-engine-v1.js') &&
  pageJs.includes('fixeo-review-engine-v1.js'));

// 17 — duplicate tap guard present
t('17. _reservationHandoffPending guard prevents duplicate taps',
  pageJs.includes('_reservationHandoffPending'));

// 18 — reservation CSS loaded on estimation.html
t('18. reservation.css loaded in estimation.html',
  estimationHtml.includes('reservation.css'));

// 19 — FixeoEstimatorV2.hide() called after reservation opens (not close)
t('19. FixeoEstimatorV2.hide() called after reservation opens (not close())',
  pageJs.includes('FixeoEstimatorV2.hide()') &&
  !pageJs.match(/FixeoEstimatorV2\.close\(\)/));

/* ══════════════════════════════════════════════════════
   GROUP 4 — PUBLIC PAGE
══════════════════════════════════════════════════════ */
console.log('\n[4] Public page structure');

// 20 — H1 present
t('20. Public H1 "Obtenez votre estimation FIXEO" rendered',
  pageJs.includes('Obtenez votre estimation FIXEO'));

// 21 — Input ≥16px (iOS zoom)
t('21. NLP input font-size: 1rem (iOS auto-zoom prevention)',
  pageJs.includes("'1rem'") || pageJs.includes('"1rem"') ||
  pageJs.includes('font-size: 1rem'));

// 22 — CTA launches Estimator V2 (no pricing duplication)
t('22. CTA calls FixeoEstimatorV2.open() — no pricing logic in page JS',
  pageJs.includes('FixeoEstimatorV2.open(') &&
  !pageJs.includes('PRICE_MAP') &&              // no price map
  !pageJs.includes('price_per_m2') &&           // no per-m2 calc
  !pageJs.includes('FixeoEstimatorAPI.evaluate(')); // no direct evaluation calls

// 23 — Max 3 suggestion chips
t('23. MAX_CHIPS = 3',
  pageJs.includes('var MAX_CHIPS = 3'));

// 24 — City reused from existing storage only
t('24. City read from fxrf4_trusted_city_session or fixeo_detected_city only',
  pageJs.includes('fxrf4_trusted_city_session') &&
  pageJs.includes(CITY_LS_KEY || 'fixeo_detected_city'));

/* ══════════════════════════════════════════════════════
   GROUP 5 — RESUME PATH
══════════════════════════════════════════════════════ */
console.log('\n[5] Resume / existing context');

// 25 — verifyContext() used (server round-trip required)
t('25. verifyContext() called for existing context — server verification required',
  pageJs.includes('verifyContext()'));

// 26 — invalid token: clearContext() called
t('26. Invalid token: clearContext() called',
  pageJs.includes('clearContext()'));

// 27 — network failure: token NOT cleared
t('27. Network failure: token NOT cleared (catch block does not call clearContext)',
  (function () {
    // The catch block for network failure must not contain clearContext
    var catchIdx = pageJs.indexOf('.catch(function () {');
    if (catchIdx === -1) return false;
    var catchBlock = pageJs.slice(catchIdx, catchIdx + 200);
    return !catchBlock.includes('clearContext');
  })());

/* ══════════════════════════════════════════════════════
   GROUP 6 — SECURITY / AUTHORITY
══════════════════════════════════════════════════════ */
console.log('\n[6] Security / authority');

// 28 — No raw price arithmetic in page JS
t('28. No client-side price arithmetic in page JS',
  !pageJs.includes('* m2') &&
  !pageJs.includes('amount_mad *') &&
  !pageJs.includes('Math.round(amount') &&
  !pageJs.includes('price_per_m2'));

// 29 — No direct Supabase API calls (comments mentioning Supabase are allowed)
t('29. No direct Supabase client calls in page JS',
  !pageJs.includes('supabase.from(') &&
  !pageJs.includes('supabase.auth') &&
  !pageJs.includes('createClient(') &&
  !pageJs.includes('SUPABASE_URL'));

// 30 — No booking authority duplication
t('30. No openBookingModal() override in page JS (booking authority intact)',
  !pageJs.includes('window.openBookingModal'));

/* ══════════════════════════════════════════════════════
   GROUP 7 — CSS
══════════════════════════════════════════════════════ */
console.log('\n[7] CSS isolation');

// 31 — Public sections hidden in page-required mode
t('31. .fxep-public-only hidden when body.fxep-mode-page-required',
  pageCss.includes('fxep-mode-page-required') &&
  pageCss.includes('fxep-public-only') &&
  pageCss.includes('display: none !important'));

/* ══════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);


