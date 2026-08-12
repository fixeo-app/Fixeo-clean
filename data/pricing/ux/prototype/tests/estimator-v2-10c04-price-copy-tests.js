/**
 * estimator-v2-10c04-price-copy-tests.js
 * Phase 7C.10C.0.4 — Estimator price narrative consistency
 * 24 tests
 *
 * FIXES:
 *   A. js/reservation.js renderStep1() res-tarif-estime:
 *      Estimator verified mode: "Prix FIXEO vérifié pour le périmètre sélectionné."
 *      Normal mode: "Estimation basée sur les prix du marché." (preserved)
 *      Urgent mode: unchanged
 *   B. js/fixeo-public-artisan-profile.js _injectReturnControl():
 *      When estimator context signals valid: body.classList.add('fx-estimator-context')
 *   C. artisan-profile.html inline <style>:
 *      body.fx-estimator-context .fxpf-price { display: none !important; }
 *
 * NO NEW API CALLS. NO URL PRICE PARAM. NO NEW PRICING AUTHORITY.
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
const reservationJs  = fs.readFileSync(path.join(root, 'js/reservation.js'), 'utf8');
const profileJs      = fs.readFileSync(path.join(root, 'js/fixeo-public-artisan-profile.js'), 'utf8');
const profileHtml    = fs.readFileSync(path.join(root, 'artisan-profile.html'), 'utf8');
const estimationHtml = fs.readFileSync(path.join(root, 'estimation.html'), 'utf8');
const indexHtml      = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pageJs         = fs.readFileSync(path.join(root, 'js/fixeo-estimation-page-v1.js'), 'utf8');

console.log('\n── 7C.10C.0.4 — ESTIMATOR PRICE NARRATIVE CONSISTENCY ──');

/* ══════════════════════════════════════════════════════
   GROUP 1 — SYNTAX CHECKS
══════════════════════════════════════════════════════ */
console.log('\n[1] Syntax checks');

t('1.  reservation.js passes node --check', nodeCheck('js/reservation.js'));
t('2.  fixeo-public-artisan-profile.js passes node --check', nodeCheck('js/fixeo-public-artisan-profile.js'));
t('3.  fixeo-estimation-page-v1.js passes node --check (no change)', nodeCheck('js/fixeo-estimation-page-v1.js'));

/* ══════════════════════════════════════════════════════
   GROUP 2 — RESERVATION STEP 1: ESTIMATOR COPY
══════════════════════════════════════════════════════ */
console.log('\n[2] Reservation Step 1 — estimator verified copy');

// 4 — Estimator guard present in res-tarif-estime block
t('4.  Estimator guard present in res-tarif-estime div',
  (function() {
    // Find the id attribute position and scan surrounding context
    var idx = reservationJs.indexOf('id="res-tarif-estime"');
    if (idx < 0) return false;
    var block = reservationJs.substring(idx, idx + 800);
    return block.includes('_estimatorCtx') &&
           block.includes('_estimatorCtx.valid');
  })());

// 5 — Estimator copy: "Prix FIXEO vérifié pour le périmètre sélectionné."
t('5.  Estimator copy: "Prix FIXEO vérifié pour le périmètre sélectionné." present',
  reservationJs.includes('Prix FIXEO v\u00e9rifi\u00e9 pour le p\u00e9rim\u00e8tre s\u00e9lectionn\u00e9'));

// 6 — Normal (non-estimator) copy still present
t('6.  Normal copy: "Estimation basée sur les prix du marché." still present',
  reservationJs.includes('Estimation bas\u00e9e sur les prix du march\u00e9'));

// 7 — Urgent copy unchanged
t('7.  Urgent copy unchanged: "Priorité urgente incluse"',
  reservationJs.includes('Priorit\u00e9 urgente incluse'));

// 8 — All three branches in correct order: urgent / estimator / normal
t('8.  Three-way ternary order: isUrgent → estimator → normal',
  (function() {
    var idx = reservationJs.indexOf('id="res-tarif-estime"');
    if (idx < 0) return false;
    var block = reservationJs.substring(idx, idx + 900);
    var urgentIdx = block.indexOf('Priorit\u00e9 urgente');
    var estimIdx  = block.indexOf('Prix FIXEO v\u00e9rifi\u00e9');
    var normalIdx = block.indexOf('Estimation bas\u00e9e');
    return urgentIdx >= 0 && estimIdx > urgentIdx && normalIdx > estimIdx;
  })());

/* ══════════════════════════════════════════════════════
   GROUP 3 — _onServiceChange() HYGIENE
══════════════════════════════════════════════════════ */
console.log('\n[3] _onServiceChange() — estimator guard');

// 9 — Normal copy in _onServiceChange only runs if NOT estimator context
t('9.  _onServiceChange tarifEl write gated by !(estimatorCtx.valid)',
  (function() {
    // Find _onServiceChange and scan ~1500 chars
    var idx = reservationJs.indexOf('function _onServiceChange');
    if (idx < 0) return false;
    var block = reservationJs.substring(idx, idx + 1500);
    return block.includes('_estimatorCtx') && block.includes('_estimatorCtx.valid') &&
           block.includes('!(state._estimatorCtx');
  })());

// 10 — _onServiceChange still writes the normal copy for non-estimator path
t('10. _onServiceChange: normal market copy still present for non-estimator',
  (function() {
    var idx = reservationJs.indexOf('function _onServiceChange');
    if (idx < 0) return false;
    var block = reservationJs.substring(idx, idx + 1500);
    // Source uses unicode escapes \u00e9 → match literal escape or actual char
    return block.includes('Estimation bas') && block.includes('prix du march');
  })());

/* ══════════════════════════════════════════════════════
   GROUP 4 — PROFILE: BODY CLASS
══════════════════════════════════════════════════════ */
console.log('\n[4] Profile — body class injection');

// 11 — classList.add('fx-estimator-context') present in profile JS
t('11. profile JS adds body class fx-estimator-context',
  profileJs.includes("classList.add('fx-estimator-context')") ||
  profileJs.includes('classList.add("fx-estimator-context")'));

// 12 — Class injection is inside _injectReturnControl (not global)
t('12. Class injection is inside _injectReturnControl() scope',
  (function() {
    var idx = profileJs.indexOf('function _injectReturnControl');
    if (idx < 0) return false;
    var block = profileJs.substring(idx, idx + 2000);
    return block.includes("classList.add('fx-estimator-context')") ||
           block.includes('classList.add("fx-estimator-context")');
  })());

// 13 — Class injection gated: only runs when _shouldShow() passes
t('13. Class injection only when _shouldShow() returns true (inside _injectReturnControl)',
  (function() {
    var idx = profileJs.indexOf('function _injectReturnControl');
    if (idx < 0) return false;
    var block = profileJs.substring(idx, idx + 600);
    var earlyReturn = block.includes('if (!_shouldShow()) return');
    var classAdd = block.includes('fx-estimator-context');
    return earlyReturn && classAdd;
  })());

// 14 — _shouldShow() still requires all 3 signals (no regression)
t('14. _shouldShow() requires source=estimator + return marker + token',
  profileJs.includes("src !== 'estimator'") &&
  profileJs.includes('RETURN_MARKER') &&
  profileJs.includes('TOKEN_KEY'));

/* ══════════════════════════════════════════════════════
   GROUP 5 — PROFILE HTML: CSS RULE
══════════════════════════════════════════════════════ */
console.log('\n[5] Profile HTML — CSS suppression rule');

// 15 — CSS rule present in artisan-profile.html
t('15. CSS rule: body.fx-estimator-context .fxpf-price { display: none !important }',
  profileHtml.includes('body.fx-estimator-context .fxpf-price') &&
  profileHtml.includes('display: none !important'));

// 16 — Rule targets .fxpf-price specifically (not broader selectors)
t('16. Rule scoped to .fxpf-price only (no broader suppression)',
  (function() {
    var ruleMatch = profileHtml.match(/body\.fx-estimator-context\s+\.fxpf-price\s*\{[^}]+\}/);
    if (!ruleMatch) return false;
    var rule = ruleMatch[0];
    // Should not contain other selectors or comma-joined selectors
    return !rule.includes(',') && rule.includes('display: none');
  })());

// 17 — fixeo-profile-flagship-v1.js NOT modified (unchanged)
t('17. fixeo-profile-flagship-v1.js: .fxpf-price still renders by default',
  (function() {
    var fv1 = fs.readFileSync(path.join(root, 'js/fixeo-profile-flagship-v1.js'), 'utf8');
    return fv1.includes('fxpf-price') &&
           fv1.includes('Budget indicatif') &&
           !fv1.includes('fx-estimator-context');
  })());

/* ══════════════════════════════════════════════════════
   GROUP 6 — SECURITY / AUTHORITY
══════════════════════════════════════════════════════ */
console.log('\n[6] Security — no new pricing authority');

// 18 — No URL price/amount parameter introduced
t('18. No ?price= or ?amount= URL parameter added',
  !profileJs.includes('?price=') &&
  !profileJs.includes('?amount=') &&
  !profileHtml.match(/[?&](price|amount)=\d/));

// 19 — No new API call introduced (no fetch to estimator-v1 on profile)
t('19. No new /api/estimator-v1 call introduced in profile JS',
  !profileJs.includes('/api/estimator-v1') &&
  !profileJs.includes('verifyPricingContext') &&
  !profileJs.includes('FixeoEstimatorAPI'));

// 20 — No raw amount stored/read in profile JS
t('20. No raw price amount injected into DOM from profile JS',
  !profileJs.includes('amount_mad') &&
  !profileJs.includes('250 MAD') &&
  !profileJs.includes('MAR_PRICES'));

/* ══════════════════════════════════════════════════════
   GROUP 7 — CACHE KEYS
══════════════════════════════════════════════════════ */
console.log('\n[7] Cache keys');

t('21. reservation.js bumped to v1m-estimator-copy in index.html',
  indexHtml.includes('reservation.js?v=v1m-estimator-copy') ||
  // In index.html it may be inside a loadScriptOnce call
  indexHtml.includes("'js/reservation.js?v=v1m-estimator-copy'"));

t('22. reservation.js bumped to v1m-estimator-copy in estimation stack',
  pageJs.includes("'js/reservation.js?v=v1m-estimator-copy'"));

t('23. fixeo-public-artisan-profile.js bumped to hts3-estimator-price-context',
  profileHtml.includes('fixeo-public-artisan-profile.js?v=hts3-estimator-price-context'));

t('24. estimation.html page JS key updated (v2d)',
  estimationHtml.includes('fixeo-estimation-page-v1.js?v=fxestpage-v2d-estimator-copy'));

/* ══════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
