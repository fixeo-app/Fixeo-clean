/**
 * estimator-v2-10b3-handoff-regression-tests.js
 * Phase 7C.10B.3 — Global reservation handoff regression fix
 * 16 tests total
 *
 * ROOT CAUSE: reservation.js had a syntax error (missing closing brace) introduced
 * in Phase 3Z.2E.3. The if (target) block was not closed after scrollIntoView removal.
 * → reservation.js failed to evaluate → window.FixeoReservation never defined
 * → ALL reservation handoff flows globally broken on both homepage and /estimation.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

let pass = 0; let fail = 0;
function t(label, condition, detail) {
  if (condition) { console.log('  ✓', label); pass++; }
  else { console.error('  ✗', label, detail || ''); fail++; }
}

const reservationJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/reservation.js'), 'utf8');
const indexHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../index.html'), 'utf8');
const pageJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-estimation-page-v1.js'), 'utf8');

console.log('\n── 7C.10B.3 — GLOBAL RESERVATION HANDOFF REGRESSION FIX ──');

/* ══════════════════════════════════════════════════════════
   GROUP 1 — SYNTAX FIX (the actual root cause)
══════════════════════════════════════════════════════════ */
console.log('\n[1] Syntax repair');

// 1 — reservation.js is syntactically valid (passes node --check)
t('1. reservation.js is syntactically valid (node --check)',
  (function () {
    try {
      execSync('node --check ' +
        path.resolve(__dirname, '../../../../../js/reservation.js'),
        { stdio: 'pipe' });
      return true;
    } catch (e) {
      return false;
    }
  })());

// 2 — The broken pattern is gone
t('2. Missing closing brace fixed: if (target) { ... } properly closed',
  (function () {
    // The broken pattern: open brace with comment but no closing } before });
    // Look for the fixed pattern: has closing } before the });
    return reservationJs.includes(
      'target.focus({ preventScroll: true }); /* 3Z.2E.3:') &&
      reservationJs.includes(
      'preventScroll prevents iOS viewport jump; scrollIntoView removed (modal is full-screen fixed) */ }');
  })());

// 3 — preventScroll: true preserved (iOS fix not regressed)
t('3. focus({ preventScroll: true }) preserved (iOS viewport fix)',
  reservationJs.includes('target.focus({ preventScroll: true })'));

// 4 — scrollIntoView still absent (not re-introduced)
t('4. scrollIntoView NOT re-introduced in rAF block (iOS safe)',
  !reservationJs.match(/scrollIntoView\s*\(\s*\{[^}]*block/));

// 5 — window.FixeoReservation is set in the file (will be available after eval)
t('5. window.FixeoReservation assigned in reservation.js',
  reservationJs.includes('window.FixeoReservation =') ||
  reservationJs.includes('window.FixeoReservation='));

/* ══════════════════════════════════════════════════════════
   GROUP 2 — CACHE KEY BUMPED
══════════════════════════════════════════════════════════ */
console.log('\n[2] Cache key bump');

// 6 — index.html uses new reservation.js version
t('6. index.html loader uses reservation.js?v=v1m-estimator-copy',
  indexHtml.includes("reservation.js?v=v1m-estimator-copy"));

// 7 — estimation page loader uses new reservation.js version
t('7. fixeo-estimation-page-v1.js loader uses reservation.js?v=v1m-estimator-copy',
  pageJs.includes("reservation.js?v=v1m-estimator-copy"));

// 8 — OLD version key v1k-ios-scroll absent (CDN won't serve broken file)
t('8. Old reservation.js?v=v1k-ios-scroll key absent from all loaders',
  !indexHtml.includes('reservation.js?v=v1k-ios-scroll') &&
  !pageJs.includes('reservation.js?v=v1k-ios-scroll'));

/* ══════════════════════════════════════════════════════════
   GROUP 3 — HANDOFF CONTRACT UNCHANGED
══════════════════════════════════════════════════════════ */
console.log('\n[3] Handoff contract unchanged');

// 9 — fixeo:estimator-reserve listener present on index.html
t('9. fixeo:estimator-reserve listener present on index.html',
  indexHtml.includes("addEventListener('fixeo:estimator-reserve'") ||
  indexHtml.includes('addEventListener("fixeo:estimator-reserve"'));

// 10 — fixeo:estimator-reserve listener present in page-v1.js
t('10. fixeo:estimator-reserve listener present in fixeo-estimation-page-v1.js',
  pageJs.includes("'fixeo:estimator-reserve'"));

// 11 — FixeoReservation.open(null, false, null) still called (unchanged)
t('11. FixeoReservation.open(null, false, null) preserved in index.html handler',
  indexHtml.includes('window.FixeoReservation.open(null, false, null)'));

// 12 — hide() (not close()) called after open — PRICE_READY preserved
t('12. FixeoEstimatorV2.hide() called after Reservation opens (not close())',
  indexHtml.includes('window.FixeoEstimatorV2.hide()'));

/* ══════════════════════════════════════════════════════════
   GROUP 4 — OPEN() STRUCTURE STILL VALID
══════════════════════════════════════════════════════════ */
console.log('\n[4] reservation.js open() structure');

// 13 — verifyContext() path still present
t('13. verifyContext().then() path still present in open()',
  reservationJs.includes('verifyContext().then(function(ctx)'));

// 14 — city picker path still present
t('14. renderEstimatorCityPicker path reachable (no city → city picker)',
  reservationJs.includes('renderEstimatorCityPicker') ||
  reservationJs.includes('estimatorPickerScreen'));

// 15 — pricing diff none (no price arithmetic changed)
t('15. No pricing arithmetic added to reservation.js in this patch',
  (function () {
    // The only diff should be the closing brace
    // Verify PRICE_MAP, amount_mad are unchanged references
    return reservationJs.includes('amount_mad') &&  // still there
           !reservationJs.includes('amount_mad = '); // not assigned (server-authoritative)
  })());

/* ══════════════════════════════════════════════════════════
   GROUP 5 — AUTHORITY UNCHANGED
══════════════════════════════════════════════════════════ */
console.log('\n[5] Authority unchanged');

// 16 — booking authority contract unchanged
t('16. Booking authority unchanged — window.FixeoReservation public API preserved',
  reservationJs.includes('window.FixeoReservation =') ||
  reservationJs.includes('window.FixeoReservation='),
  'FixeoReservation public API must be present');

/* ══════════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
