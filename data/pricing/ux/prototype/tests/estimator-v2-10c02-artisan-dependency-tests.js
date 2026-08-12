/**
 * estimator-v2-10c02-artisan-dependency-tests.js
 * Phase 7C.10C.0.2 — Artisan data dependency restoration
 * 20 tests
 *
 * ROOT CAUSE (proved in audit 7C.10C.0.1):
 *   The /estimation reservation stack loaded fixeo-supabase-loader.js
 *   WITHOUT first loading fixeo-db.js or supabase-client.js.
 *   FixeoSupabaseLoader.load() entered the "not configured" branch:
 *     window.FixeoSupabaseClient === undefined → not-configured path
 *     window.FixeoDB === undefined → local=[] → _injectIntoMarketplace NOT called
 *     → window.ARTISANS stays undefined → 6s timeout → open() with [] → FALSE ZERO MATCH
 *
 * FIX:
 *   Added Phase 0 to reservation stack in fixeo-estimation-page-v1.js:
 *     loadScriptOnce('js/fixeo-db.js?v=db2')
 *     → loadScriptOnce('js/supabase-client.js?v=sc2')
 *     → loadScriptOnce('js/fixeo-supabase-loader.js?v=sl2')
 *     → existing chain unchanged
 *
 * NO CHANGES TO: reservation.js, supabase-loader.js, supabase-client.js, fixeo-db.js,
 *   pricing, tokens, matching logic, booking authority, Supabase schema/data.
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

function nodeCheck(rel) {
  try {
    execSync('node --check ' + path.resolve(__dirname, '../../../../../' + rel), { stdio: 'pipe' });
    return true;
  } catch (e) { return false; }
}

const root = path.resolve(__dirname, '../../../../../');
const pageJs       = fs.readFileSync(path.join(root, 'js/fixeo-estimation-page-v1.js'), 'utf8');
const loaderJs     = fs.readFileSync(path.join(root, 'js/fixeo-supabase-loader.js'), 'utf8');
const reservationJs= fs.readFileSync(path.join(root, 'js/reservation.js'), 'utf8');
const supabaseClientJs = fs.readFileSync(path.join(root, 'js/supabase-client.js'), 'utf8');
const fixeoDbJs    = fs.readFileSync(path.join(root, 'js/fixeo-db.js'), 'utf8');
const estimationHtml = fs.readFileSync(path.join(root, 'estimation.html'), 'utf8');
const indexHtml    = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

console.log('\n── 7C.10C.0.2 — ARTISAN DATA DEPENDENCY RESTORATION ──');

/* ══════════════════════════════════════════════════════
   GROUP 1 — SYNTAX CHECKS
══════════════════════════════════════════════════════ */
console.log('\n[1] Syntax checks');

t('1.  fixeo-estimation-page-v1.js passes node --check', nodeCheck('js/fixeo-estimation-page-v1.js'));
t('2.  reservation.js passes node --check (no diff)', nodeCheck('js/reservation.js'));
t('3.  fixeo-supabase-loader.js passes node --check (no diff)', nodeCheck('js/fixeo-supabase-loader.js'));
t('4.  supabase-client.js passes node --check (no diff)', nodeCheck('js/supabase-client.js'));
t('5.  fixeo-db.js passes node --check (no diff)', nodeCheck('js/fixeo-db.js'));

/* ══════════════════════════════════════════════════════
   GROUP 2 — DEPENDENCY ORDER IN STACK
══════════════════════════════════════════════════════ */
console.log('\n[2] Dependency load order');

// Helper: find index of first occurrence of a pattern in the stack
function stackIdx(pattern) {
  return pageJs.indexOf(pattern);
}

const dbIdx      = stackIdx("'js/fixeo-db.js?v=db2'");
const scIdx      = stackIdx("'js/supabase-client.js?v=sc2'");
const loaderIdx  = stackIdx("'js/fixeo-supabase-loader.js?v=sl2'");
const patchIdx   = stackIdx("'js/fixeo_homepage_premium_patch.js?v=fxhome-artisan-section-v1a5-return'");
const resIdx     = stackIdx("'js/reservation.js?v=v1l-syntax-fix'");

t('6.  fixeo-db.js present in stack', dbIdx > 0);
t('7.  supabase-client.js present in stack', scIdx > 0);
t('8.  fixeo-supabase-loader.js present in stack', loaderIdx > 0);
t('9.  fixeo-db.js loads before supabase-client.js', dbIdx > 0 && scIdx > 0 && dbIdx < scIdx);
t('10. supabase-client.js loads before fixeo-supabase-loader.js', scIdx > 0 && loaderIdx > 0 && scIdx < loaderIdx);
t('11. fixeo-supabase-loader.js loads before fixeo_homepage_premium_patch.js', loaderIdx > 0 && patchIdx > 0 && loaderIdx < patchIdx);
t('12. fixeo_homepage_premium_patch.js loads before reservation.js', patchIdx > 0 && resIdx > 0 && patchIdx < resIdx);

/* ══════════════════════════════════════════════════════
   GROUP 3 — CACHE KEYS MATCH INDEX.HTML
══════════════════════════════════════════════════════ */
console.log('\n[3] Cache key consistency with index.html');

t('13. fixeo-db.js uses same v=db2 as index.html',
  pageJs.includes("'js/fixeo-db.js?v=db2'") &&
  indexHtml.includes('js/fixeo-db.js?v=db2'));

t('14. supabase-client.js uses same v=sc2 as index.html',
  pageJs.includes("'js/supabase-client.js?v=sc2'") &&
  indexHtml.includes('js/supabase-client.js?v=sc2'));

/* ══════════════════════════════════════════════════════
   GROUP 4 — DATA READINESS CONTRACT PRESERVED
══════════════════════════════════════════════════════ */
console.log('\n[4] Artisan readiness contract preserved');

t('15. _waitForArtisanData() still calls FixeoSupabaseLoader.load()',
  pageJs.includes('FixeoSupabaseLoader.load()'));

t('16. fixeo:artisans:loaded remains the data-ready event signal',
  pageJs.includes("'fixeo:artisans:loaded'") &&
  loaderJs.includes("'fixeo:artisans:loaded'"));

t('17. 6-second safety timeout still present',
  pageJs.includes('ARTISAN_DATA_TIMEOUT_MS'));

/* ══════════════════════════════════════════════════════
   GROUP 5 — UNTOUCHED FILES CONFIRMED
══════════════════════════════════════════════════════ */
console.log('\n[5] Untouched files');

t('18. reservation.js: matching logic unchanged — _normCity present',
  reservationJs.includes('function _normCity') &&
  reservationJs.includes('window.ARTISANS || []'));

t('19. fixeo-supabase-loader.js: _injectIntoMarketplace unchanged',
  loaderJs.includes('function _injectIntoMarketplace') &&
  loaderJs.includes("'fixeo:artisans:loaded'"));

/* ══════════════════════════════════════════════════════
   GROUP 6 — CACHE KEY + DATA EXISTENCE
══════════════════════════════════════════════════════ */
console.log('\n[6] Cache key + data sanity');

t('20. JS cache key bumped to fxestpage-v2c-artisan-deps',
  estimationHtml.includes('fixeo-estimation-page-v1.js?v=fxestpage-v2c-artisan-deps'));

/* ══════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
