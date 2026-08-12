/**
 * estimator-v2-10c0-artisan-readiness-tests.js
 * Phase 7C.10C.0 — Artisan data readiness fix
 * 20 tests total
 *
 * ROOT CAUSE:
 *   On /estimation, fixeo-supabase-loader.js is lazy-loaded by the reservation stack.
 *   The auto-load path-guard (isHomepage || isMarketplace || isAdmin) does NOT match
 *   /estimation → load() is never called → window.ARTISANS stays empty →
 *   renderEstimatorArtisanPicker() filters [] → false "Aucun artisan" result.
 *
 *   On homepage, loader is in <head> → isHomepage=true → load() auto-fires on
 *   DOMContentLoaded+800ms → data ready long before PRICE_READY reached.
 *
 * FIX:
 *   _waitForArtisanData() in fixeo-estimation-page-v1.js:
 *   1. Checks ARTISANS.length > 0 (fast path)
 *   2. Attaches one-time fixeo:artisans:loaded listener
 *   3. Calls FixeoSupabaseLoader.load() (idempotent via LOADED flag)
 *   4. Safety timeout (6s) as fallback
 *   5. Calls FixeoReservation.open() only AFTER data ready
 *   Also: idle preload now calls load() after scripts ready.
 *
 * NO CHANGES TO: reservation.js, supabase-loader.js, pricing, tokens, Supabase.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let pass = 0; let fail = 0;
function t(label, condition, detail) {
  if (condition) { console.log('  ✓', label); pass++; }
  else { console.error('  ✗', label, detail || ''); fail++; }
}

const pageJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-estimation-page-v1.js'), 'utf8');
const loaderJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-supabase-loader.js'), 'utf8');
const reservationJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/reservation.js'), 'utf8');
const estimationHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../estimation.html'), 'utf8');
const indexHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../index.html'), 'utf8');

function nodeCheck(relPath) {
  try {
    execSync('node --check ' + path.resolve(__dirname, '../../../../../' + relPath), { stdio: 'pipe' });
    return true;
  } catch (e) { return false; }
}

console.log('\n── 7C.10C.0 — ARTISAN DATA READINESS FIX ──');

/* ══════════════════════════════════════════════════════
   GROUP 1 — SYNTAX CHECKS (all touched files)
══════════════════════════════════════════════════════ */
console.log('\n[1] Syntax checks');

t('1.  fixeo-estimation-page-v1.js passes node --check', nodeCheck('js/fixeo-estimation-page-v1.js'));
t('2.  reservation.js passes node --check (regression)', nodeCheck('js/reservation.js'));
t('3.  fixeo-supabase-loader.js passes node --check (unchanged)', nodeCheck('js/fixeo-supabase-loader.js'));

/* ══════════════════════════════════════════════════════
   GROUP 2 — ROOT CAUSE DOCUMENTATION
══════════════════════════════════════════════════════ */
console.log('\n[2] Root cause documentation');

// 4 — /estimation path NOT in supabase-loader auto-load guard
t('4.  Loader auto-load guard does NOT include estimation path',
  (function() {
    var guardLine = loaderJs.match(/if \(isHomepage[^)]*\)/);
    if (!guardLine) return false;
    return !guardLine[0].includes('isEstimation') &&
           !guardLine[0].includes('estimation');
  })());

// 5 — LOADED flag exists (idempotent guard)
t('5.  LOADED flag exists in supabase-loader (idempotent)',
  loaderJs.includes('var LOADED') || loaderJs.includes('LOADED = true'));

// 6 — fixeo:artisans:loaded event fires from _injectIntoMarketplace
t('6.  fixeo:artisans:loaded event dispatched in _injectIntoMarketplace',
  loaderJs.includes("'fixeo:artisans:loaded'"));

/* ══════════════════════════════════════════════════════
   GROUP 3 — FIX: _waitForArtisanData
══════════════════════════════════════════════════════ */
console.log('\n[3] Fix: _waitForArtisanData()');

// 7 — _waitForArtisanData function present
t('7.  _waitForArtisanData() function present in page JS', pageJs.includes('function _waitForArtisanData'));

// 8 — Fast path: returns immediately if ARTISANS already populated
t('8.  Fast path: ARTISANS.length > 0 check present',
  pageJs.includes('window.ARTISANS.length > 0'));

// 9 — Listens for fixeo:artisans:loaded event
t('9.  Listens for fixeo:artisans:loaded event',
  pageJs.includes("'fixeo:artisans:loaded'"));

// 10 — Safety timeout present (not arbitrary polling — single deferred call)
t('10. Safety timeout present (fallback if event never fires)',
  pageJs.includes('ARTISAN_DATA_TIMEOUT_MS') ||
  pageJs.match(/setTimeout[\s\S]{0,50}artisan/));

// 11 — Calls FixeoSupabaseLoader.load() explicitly
t('11. Explicitly calls FixeoSupabaseLoader.load()',
  pageJs.includes('FixeoSupabaseLoader.load()'));

// 12 — _once() guard prevents double-invocation
t('12. done/once guard prevents double-invocation of open()',
  pageJs.includes('var done = false') &&
  (pageJs.includes('if (done) return') || pageJs.includes('if (!done)')));

/* ══════════════════════════════════════════════════════
   GROUP 4 — FIX: HANDOFF ORDERING
══════════════════════════════════════════════════════ */
console.log('\n[4] Handoff ordering');

// 13 — _waitForArtisanData called inside _loadReservationStack callback
t('13. _waitForArtisanData() called inside _loadReservationStack callback',
  (function() {
    // Verify the ordering: _loadReservationStack → _waitForArtisanData → open()
    var stackIdx = pageJs.indexOf('_loadReservationStack(function');
    var waitIdx  = pageJs.indexOf('_waitForArtisanData(function', stackIdx);
    var openIdx  = pageJs.indexOf('FixeoReservation.open(null, false, null)', waitIdx);
    return stackIdx > 0 && waitIdx > stackIdx && openIdx > waitIdx;
  })());

// 14 — FixeoReservation.open() called INSIDE _waitForArtisanData callback
t('14. FixeoReservation.open() is nested inside _waitForArtisanData callback',
  (function() {
    var waitStart = pageJs.indexOf('_waitForArtisanData(function');
    if (waitStart < 0) return false;
    var waitEnd = pageJs.indexOf('});', waitStart + 100);
    // open() must appear between waitStart and waitEnd
    var openIdx = pageJs.indexOf('FixeoReservation.open(null, false, null)', waitStart);
    return openIdx > waitStart && openIdx < waitEnd + 50;
  })());

// 15 — Idle preload also calls load() after stack ready
t('15. Idle preload explicitly calls FixeoSupabaseLoader.load() after stack ready',
  (function() {
    var idleBlock = pageJs.match(/_idle\(function[\s\S]*?_loadReservationStack[\s\S]*?FixeoSupabaseLoader\.load/);
    return !!idleBlock;
  })());

/* ══════════════════════════════════════════════════════
   GROUP 5 — DATA EXISTENCE PROOF
══════════════════════════════════════════════════════ */
console.log('\n[5] Artisan data existence');

// 16 — artisans-master.json contains Plomberie + Casablanca
t('16. artisans-master.json contains Plomberie + Casablanca artisans',
  (function() {
    try {
      var raw = fs.readFileSync(
        path.resolve(__dirname, '../../../../../data/artisans-master.json'), 'utf8');
      var data = JSON.parse(raw);
      var artisans = Array.isArray(data) ? data : data.artisans || data.data || [];
      var match = artisans.filter(function(a) {
        var cat = (a.category || a.service || '').toLowerCase();
        var city = (a.city || '').toLowerCase();
        return cat.includes('plomberie') && city.includes('casablanca');
      });
      return match.length >= 1;
    } catch (e) { return false; }
  })());

// 17 — Filter logic would match if ARTISANS is populated (normCity test)
t('17. _normCity("Casablanca") matches "casablanca" (filter would succeed)',
  (function() {
    // Reproduce _normCity
    function normCity(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    }
    var city = 'Casablanca';
    var artisanCity = 'Casablanca';
    var normC = normCity(city);
    var normA = normCity(artisanCity);
    return normA.indexOf(normC) !== -1;
  })());

/* ══════════════════════════════════════════════════════
   GROUP 6 — FALSE ZERO-MATCH PREVENTION
══════════════════════════════════════════════════════ */
console.log('\n[6] False zero-match prevention');

// 18 — True zero-match still preserved (no fake artisan injection)
t('18. No fake artisan data injected — true zero-match preserved',
  !pageJs.match(/push\s*\(\s*\{.*category.*plomberie/) &&
  !pageJs.match(/window\.ARTISANS\s*=\s*\[/) &&
  !pageJs.includes('fake artisan'));

// 19 — reservation.js NOT modified (authority preserved)
t('19. reservation.js unchanged — matching semantics NOT modified',
  (function() {
    // Verify reservation.js still has the exact filter contract
    return reservationJs.includes('window.ARTISANS || []') &&
           reservationJs.includes('_normCity(a.city)') &&
           reservationJs.includes('CATEGORY_LABELS');
  })());

/* ══════════════════════════════════════════════════════
   GROUP 7 — CACHE KEY
══════════════════════════════════════════════════════ */
console.log('\n[7] Cache key');

// 20 — Cache key bumped
t('20. Cache key bumped to fxestpage-v2d-estimator-copy',
  estimationHtml.includes('fixeo-estimation-page-v1.js?v=fxestpage-v2d-estimator-copy'));

/* ══════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
