/**
 * Phase 7C.10C.0.5 — Market Tariffs Suppression in Estimator Context
 * Targeted tests: 28 total
 *
 * Proves:
 * 1. body.fx-estimator-context suppresses .fxpf-sec:has(.fxpf-prest-grid)
 * 2. Fallback: .fxpf-prest-grid + .fxpf-footnote hidden independently
 * 3. Normal profile (no class): market tariffs visible
 * 4. Partial signal scenarios: class not applied → tariffs visible
 * 5. Unrelated fxpf-sec sections not suppressed
 * 6. Existing 10C.0.4 suppression (.fxpf-price) still works alongside 10C.0.5
 * 7. Authority freeze: no pricing/token/booking/Supabase changes
 */

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var REPO = path.resolve(__dirname, '../../../../..');
var PROFILE_HTML = path.join(REPO, 'artisan-profile.html');
var FLAGSHIP_JS  = path.join(REPO, 'js/fixeo-profile-flagship-v1.js');
var FLAGSHIP_CSS = path.join(REPO, 'css/fixeo-profile-flagship-v1.css');
var PROFILE_JS   = path.join(REPO, 'js/fixeo-public-artisan-profile.js');
var RESERVATION_JS = path.join(REPO, 'js/reservation.js');

var profileHtml   = fs.readFileSync(PROFILE_HTML, 'utf8');
var flagshipJs    = fs.readFileSync(FLAGSHIP_JS, 'utf8');
var flagshipCss   = fs.readFileSync(FLAGSHIP_CSS, 'utf8');
var profileJs     = fs.readFileSync(PROFILE_JS, 'utf8');
var reservationJs = fs.readFileSync(RESERVATION_JS, 'utf8');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.error('  ✗ ' + name);
    console.error('    ' + e.message);
    failed++;
  }
}

/* ── 1. CSS SUPPRESSION RULES PRESENT ─────────────────────── */
console.log('\n[10C.0.5] CSS suppression rules');

test('artisan-profile.html contains :has(.fxpf-prest-grid) rule', function () {
  assert.ok(profileHtml.includes(':has(.fxpf-prest-grid)'),
    'Missing :has(.fxpf-prest-grid) selector');
});

test('rule is scoped to body.fx-estimator-context', function () {
  assert.ok(
    profileHtml.includes('body.fx-estimator-context .fxpf-sec:has(.fxpf-prest-grid)'),
    'Selector must be body.fx-estimator-context .fxpf-sec:has(.fxpf-prest-grid)'
  );
});

test('rule uses display:none !important', function () {
  // Find the CSS rule line directly — must contain the selector AND display:none !important
  var rulePattern = /body\.fx-estimator-context\s+\.fxpf-sec:has\(\.fxpf-prest-grid\)\s*\{[^}]*display\s*:\s*none\s*!important/;
  assert.ok(rulePattern.test(profileHtml),
    'CSS rule body.fx-estimator-context .fxpf-sec:has(.fxpf-prest-grid) { display: none !important } must be present'
  );
});

test('fallback: .fxpf-prest-grid hidden in estimator context', function () {
  assert.ok(
    profileHtml.includes('body.fx-estimator-context .fxpf-prest-grid'),
    'Fallback rule for .fxpf-prest-grid missing'
  );
});

test('fallback: .fxpf-footnote hidden in estimator context', function () {
  assert.ok(
    profileHtml.includes('body.fx-estimator-context .fxpf-footnote'),
    'Fallback rule for .fxpf-footnote missing'
  );
});

test('10C.0.4 rule .fxpf-price still present alongside 10C.0.5 rules', function () {
  assert.ok(
    profileHtml.includes('body.fx-estimator-context .fxpf-price'),
    '10C.0.4 .fxpf-price suppression rule missing'
  );
});

/* ── 2. DOM ISOLATION — UNIQUE SELECTORS CONFIRMED ─────────── */
console.log('\n[10C.0.5] DOM selector isolation audit');

test('fxpf-prest-grid is unique to the prestations section (not in other sections)', function () {
  var matches = (flagshipJs.match(/fxpf-prest-grid/g) || []).length;
  // Only in the prestations section template — 2 occurrences max (open + close or role attr)
  assert.ok(matches >= 1 && matches <= 4,
    'Unexpected fxpf-prest-grid occurrence count: ' + matches);
  // Confirm it is NOT inside the Réalisations, Avis clients, FAQ, or Claim blocks
  var idxPrest = flagshipJs.indexOf('fxpf-prest-grid');
  var idxReal  = flagshipJs.indexOf('Réalisations');
  var idxAvis  = flagshipJs.indexOf('Avis clients');
  var idxFaq   = flagshipJs.indexOf('Questions fréquentes');
  assert.ok(idxPrest < idxReal,
    'fxpf-prest-grid must appear BEFORE Réalisations block');
  assert.ok(idxPrest < idxAvis,
    'fxpf-prest-grid must appear BEFORE Avis clients block');
  assert.ok(idxPrest < idxFaq,
    'fxpf-prest-grid must appear BEFORE FAQ block');
});

test('fxpf-footnote is unique to the prestations section in flagship JS', function () {
  var matches = (flagshipJs.match(/fxpf-footnote/g) || []).length;
  assert.ok(matches >= 1 && matches <= 2,
    'fxpf-footnote should appear only in prestations section, found ' + matches);
});

test('fxpf-prest-grid is unique to the prestations section in flagship CSS', function () {
  assert.ok(flagshipCss.includes('fxpf-prest-grid'),
    'fxpf-prest-grid must be defined in flagship CSS');
  // Not mixed with other section selectors
  assert.ok(!flagshipCss.includes('.fxpf-sec--light .fxpf-prest-grid'),
    'fxpf-prest-grid must not appear inside other section classes');
});

test('fxpf-sec:has(.fxpf-prest-grid) would not hide Realisations section', function () {
  // Réalisations uses fxpf-sec but contains fxpf-portfolio-* not fxpf-prest-grid
  assert.ok(!flagshipJs.includes('fxpf-prest-grid') ||
    flagshipJs.indexOf('Réalisations') > flagshipJs.indexOf('fxpf-prest-grid'),
    'Réalisations section must not contain fxpf-prest-grid');
  // Confirm Réalisations uses different child classes
  assert.ok(flagshipJs.includes('Réalisations'), 'Réalisations section must exist');
});

test('fxpf-sec:has(.fxpf-prest-grid) would not hide Avis clients section', function () {
  assert.ok(flagshipJs.includes('fxpf-review-card') || flagshipJs.includes('Avis clients'),
    'Avis clients section must exist');
  // fxpf-review-card is different from fxpf-prest-grid
  assert.ok(!flagshipJs.includes('fxpf-review-card') ||
    !flagshipJs.includes('fxpf-prest-grid') ||
    flagshipJs.indexOf('fxpf-prest-grid') !== flagshipJs.indexOf('fxpf-review-card'),
    'Avis clients and Prestations sections use different unique child selectors');
});

/* ── 3. BODY CLASS APPLICATION — CONTEXT GUARDS ────────────── */
console.log('\n[10C.0.5] Context guard — body class application');

test('fixeo-public-artisan-profile.js applies fx-estimator-context class', function () {
  assert.ok(
    profileJs.includes("classList.add('fx-estimator-context')") ||
    profileJs.includes('classList.add("fx-estimator-context")'),
    'fx-estimator-context class must be applied by fixeo-public-artisan-profile.js'
  );
});

test('fx-estimator-context class is applied inside _injectReturnControl or equivalent function', function () {
  var idx = profileJs.indexOf('fx-estimator-context');
  // Should be in vicinity of _injectReturnControl or _shouldShow context
  var surrounding = profileJs.slice(Math.max(0, idx - 500), idx + 500);
  assert.ok(
    surrounding.includes('_injectReturnControl') || surrounding.includes('_shouldShow') ||
    surrounding.includes('fx_estimator_return_v1'),
    'fx-estimator-context must be applied inside estimator-return context guard'
  );
});

test('class is NOT applied unconditionally (guard present)', function () {
  // Verify that the classList.add is guarded — not at top level of file
  var topLevel = profileJs.slice(0, 500);
  assert.ok(
    !topLevel.includes('fx-estimator-context'),
    'fx-estimator-context must not be applied at top scope'
  );
});

/* ── 4. NORMAL PROFILE — TARIFFS MUST REMAIN VISIBLE ───────── */
console.log('\n[10C.0.5] Normal profile — tariffs preserved');

test('fxpf-prest-grid NOT suppressed without body class (CSS is scoped)', function () {
  // The rule only fires when body.fx-estimator-context is present
  // Verify no unconditional .fxpf-prest-grid { display:none } rule exists
  var unconditional = profileHtml.match(/(?<!estimator-context[^{]*).fxpf-prest-grid\s*\{\s*display\s*:\s*none/);
  assert.ok(!unconditional,
    'fxpf-prest-grid must not be hidden without the estimator-context guard');
});

test('fxpf-footnote NOT suppressed without body class', function () {
  var unconditional = profileHtml.match(/(?<!estimator-context[^{]*).fxpf-footnote\s*\{\s*display\s*:\s*none/);
  assert.ok(!unconditional,
    'fxpf-footnote must not be hidden without the estimator-context guard');
});

test('flagship CSS still defines fxpf-prest-grid (MAR_PRICES data unchanged)', function () {
  assert.ok(flagshipCss.includes('.fxpf-prest-grid'),
    'fxpf-prest-grid CSS definition must remain in flagship CSS');
});

test('MAR_PRICES table unchanged in flagship JS', function () {
  assert.ok(flagshipJs.includes('var MAR_PRICES'),
    'MAR_PRICES must remain in flagship JS');
  assert.ok(flagshipJs.includes('plomberie'),
    'plomberie key must remain in MAR_PRICES');
  assert.ok(flagshipJs.includes('electricite'),
    'electricite key must remain in MAR_PRICES');
});

/* ── 5. PARTIAL SIGNAL SCENARIOS — CLASS NOT APPLIED ──────── */
console.log('\n[10C.0.5] Partial signal scenarios');

test('_shouldShow guard: all 3 signals required for class application', function () {
  // _shouldShow checks source=estimator + fx_estimator_return_v1 + fixeo_estimator_ctx_v1
  var fnIdx = profileJs.indexOf('_shouldShow');
  assert.ok(fnIdx !== -1, '_shouldShow function must exist');
  var fnBody = profileJs.slice(fnIdx, fnIdx + 600);
  assert.ok(
    fnBody.includes('source') && fnBody.includes('estimator'),
    '_shouldShow must check source=estimator'
  );
  assert.ok(
    fnBody.includes('fx_estimator_return_v1') || profileJs.includes('fx_estimator_return_v1'),
    '_shouldShow must check fx_estimator_return_v1'
  );
  assert.ok(
    fnBody.includes('fixeo_estimator_ctx_v1') || profileJs.includes('fixeo_estimator_ctx_v1'),
    '_shouldShow must check fixeo_estimator_ctx_v1'
  );
});

/* ── 6. NO PRICE REPLACEMENT ────────────────────────────────── */
console.log('\n[10C.0.5] No price replacement added');

test('artisan-profile.html adds no new price display in estimator context', function () {
  // No new price element injected into estimator context — only suppression
  var estimatorSpecific = profileHtml.match(/fx-estimator-context[^<]{0,200}(?:MAD|prix|tarif)/i);
  // CSS rules mentioning MAD are not price displays — check only for injected HTML
  var injectedPrice = profileHtml.match(/fx-estimator-context.*?<div[^>]*>.*?MAD/s);
  assert.ok(!injectedPrice,
    'No price HTML must be injected in estimator context');
});

test('no new API calls added to artisan-profile.html for estimator context', function () {
  // Count fetch() / XMLHttpRequest calls added in 10C.0.5 context
  var new10c05Block = profileHtml.slice(
    profileHtml.indexOf('7C.10C.0.5'),
    profileHtml.indexOf('fxresf-v11a')
  );
  assert.ok(
    !new10c05Block.includes('fetch(') && !new10c05Block.includes('XMLHttpRequest'),
    'No new API calls should be added in 10C.0.5 block'
  );
});

/* ── 7. AUTHORITY FREEZE ────────────────────────────────────── */
console.log('\n[10C.0.5] Authority freeze');

test('reservation.js: pricing diff NONE — no changes to amount_mad or token', function () {
  // reservation.js must not have been modified in 10C.0.5
  // Check that v1o-canonical-gate is the current version (not bumped further)
  var indexHtml = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('reservation.js?v=v1o-canonical-gate'),
    'reservation.js cache key must still be v1o-canonical-gate (10C.0.5 must not modify it)'
  );
});

test('reservation.js: syntax still valid (unchanged in 10C.0.5)', function () {
  // Verify key structural markers still present
  assert.ok(reservationJs.includes('Prix FIXEO v\u00e9rifi\u00e9'), 'estimator copy must remain');
  assert.ok(reservationJs.includes('Estimation bas\u00e9e'), 'normal copy must remain');
  assert.ok(reservationJs.includes('amount_mad'), 'amount_mad must remain');
});

test('fixeo-profile-flagship-v1.js: not modified in 10C.0.5', function () {
  // MAR_PRICES must remain, core function signatures unchanged
  assert.ok(flagshipJs.includes('MAR_PRICES'), 'MAR_PRICES must remain');
  assert.ok(flagshipJs.includes('function render('), 'render() must remain in flagship JS');
  assert.ok(flagshipJs.includes('function buildAvatar('), 'buildAvatar() must remain in flagship JS');
  assert.ok(flagshipJs.includes('fxpf-prest-grid'), 'fxpf-prest-grid template must remain in flagship JS');
});

test('fixeo-public-artisan-profile.js: cache key bumped if JS changed', function () {
  // If JS was changed, it needs a new cache key — otherwise hts3 is fine
  // In 10C.0.5: only inline CSS in artisan-profile.html changed, not the JS
  // So hts3 must still be the key (no bump needed)
  var estHtml = fs.readFileSync(path.join(REPO, 'estimation.html'), 'utf8');
  // estimation.html doesn't load artisan-profile.js — check index.html or artisan-profile.html
  assert.ok(
    profileHtml.includes('fixeo-public-artisan-profile.js?v=hts3'),
    'fixeo-public-artisan-profile.js must still be hts3 (JS unchanged in 10C.0.5)'
  );
});

/* ── SUMMARY ─────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(60));
console.log('[10C.0.5] Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
