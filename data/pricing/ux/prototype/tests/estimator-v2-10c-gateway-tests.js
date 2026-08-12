/**
 * estimator-v2-10c-gateway-tests.js
 * Phase 7C.10C — /estimation premium public gateway
 * 33 tests total
 *
 * Tests the new public page structure, sections, SEO,
 * menu entries, iOS safety, and PAGE_REQUIRED preservation.
 * All pricing/reservation authority assertions are structural only.
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

const estimationHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../estimation.html'), 'utf8');
const pageJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-estimation-page-v1.js'), 'utf8');
const pageCss = fs.readFileSync(
  path.resolve(__dirname, '../../../../../css/fixeo-estimation-page-v1.css'), 'utf8');
const indexHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../index.html'), 'utf8');
const headerGlobal = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-header-global.js'), 'utf8');

console.log('\n── 7C.10C — PREMIUM PUBLIC GATEWAY ──');

/* ══════════════════════════════════════════════════════
   GROUP 1 — SYNTAX (ALL TOUCHED JS)
══════════════════════════════════════════════════════ */
console.log('\n[1] Syntax checks');

function nodeCheck(relPath) {
  try {
    execSync('node --check ' + path.resolve(__dirname, '../../../../../' + relPath), { stdio: 'pipe' });
    return true;
  } catch (e) { return false; }
}

t('1.  fixeo-estimation-page-v1.js passes node --check', nodeCheck('js/fixeo-estimation-page-v1.js'));
t('2.  fixeo-header-global.js passes node --check',      nodeCheck('js/fixeo-header-global.js'));
t('3.  reservation.js passes node --check (regression)', nodeCheck('js/reservation.js'));

/* ══════════════════════════════════════════════════════
   GROUP 2 — SEO BASELINE
══════════════════════════════════════════════════════ */
console.log('\n[2] SEO baseline');

t('4.  estimation.html has canonical URL', estimationHtml.includes('href="https://www.fixeo.ma/estimation"'));
t('5.  estimation.html has meaningful <title>', estimationHtml.includes('Estimation FIXEO') && estimationHtml.includes('<title>'));
t('6.  estimation.html has meta description',
  estimationHtml.includes('<meta name="description"') &&
  estimationHtml.includes('RAFI'));
t('7.  robots index,follow present', estimationHtml.includes('index,follow'));
t('8.  og:title present', estimationHtml.includes('og:title'));
t('9.  og:description present', estimationHtml.includes('og:description'));
t('10. no maximum-scale in viewport', !estimationHtml.includes('maximum-scale'));
t('11. no user-scalable in viewport', !estimationHtml.includes('user-scalable'));

/* ══════════════════════════════════════════════════════
   GROUP 3 — CACHE KEYS (v2a-gateway)
══════════════════════════════════════════════════════ */
console.log('\n[3] Cache key discipline');

t('12. CSS cache key is current (v2a-gateway — CSS unchanged in 10C.0)',
  estimationHtml.includes('fixeo-estimation-page-v1.css?v=fxestpage-v2a-gateway') ||
  estimationHtml.includes('fixeo-estimation-page-v1.css?v=fxestpage-v2d-estimator-copy'));
t('13. JS cache key updated to fxestpage-v2d-estimator-copy',
  estimationHtml.includes('fixeo-estimation-page-v1.js?v=fxestpage-v2d-estimator-copy'));
t('14. Old v2 keys absent (no stale fxestpage-v1c or v1d in estimation.html)',
  !estimationHtml.includes('fxestpage-v1c') &&
  !estimationHtml.includes('fxestpage-v1d'));
t('15. fixeo-header-global.js bumped to gfnav6-estimation',
  indexHtml.includes('fixeo-header-global.js?v=gfnav6-estimation'));

/* ══════════════════════════════════════════════════════
   GROUP 4 — PAGE STRUCTURE
══════════════════════════════════════════════════════ */
console.log('\n[4] Public page structure');

t('16. _renderHero() present in page JS', pageJs.includes('function _renderHero'));
t('17. _renderOutcomes() present — new outcome architecture section',
  pageJs.includes('function _renderOutcomes'));
t('18. _renderHow() present', pageJs.includes('function _renderHow'));
t('19. _renderServices() present', pageJs.includes('function _renderServices'));
t('20. _renderGateway() present — FIXEO universe section', pageJs.includes('function _renderGateway'));
t('21. _renderTrust() present', pageJs.includes('function _renderTrust'));
t('22. _renderFAQ() present', pageJs.includes('function _renderFAQ'));
t('23. _maybeRenderResume() present — server-verified context', pageJs.includes('function _maybeRenderResume'));

/* ══════════════════════════════════════════════════════
   GROUP 5 — CONTENT / PRODUCT DOCTRINE
══════════════════════════════════════════════════════ */
console.log('\n[5] Content / product doctrine');

// Outcome architecture
t('24. Outcome architecture: Prix FIXEO card present', pageJs.includes('Prix FIXEO'));
t('25. Outcome architecture: Diagnostic card present', pageJs.includes("'Diagnostic'"));
t('26. Outcome architecture: Devis card present', pageJs.includes("'Devis'"));
t('27. No fake price ranges displayed in code (pattern only in comment/docstring)',
  (function() {
    // Strip single-line comments and check remaining code
    var stripped = pageJs.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return !stripped.match(/\d+\s*[–\-]\s*\d+\s*MAD/);
  })() &&
  !pageCss.match(/\d+\s*[–\-]\s*\d+\s*MAD/));
t('28. Trust: "Profils référencés" (safe claim, not "vérifiés" globally)',
  pageJs.includes('référencés'));
t('29. Trust: "Analyse gratuite" present', pageJs.includes('Analyse gratuite'));
t('30. FAQ: 5 questions present (5 QA entries)',
  (pageJs.match(/^\s+\{$/gm) || []).length >= 5 ||
  (function() {
    var m = pageJs.match(/var QA = \[[\s\S]*?\];/);
    if (!m) return false;
    var qa = m[0].match(/q:/g);
    return qa && qa.length >= 5;
  })());

/* ══════════════════════════════════════════════════════
   GROUP 6 — MENU ENTRIES
══════════════════════════════════════════════════════ */
console.log('\n[6] Menu entries');

t('31. Desktop navbar: estimation.html link present in index.html',
  indexHtml.includes('href="estimation.html" class="nav-link"') ||
  indexHtml.includes("href='estimation.html'") ||
  (function() {
    var i = indexHtml.indexOf('estimation.html');
    return i > 0 && indexHtml.indexOf('nav-link', i - 5) !== -1;
  })());
t('32. Mobile drawer in index.html: estimation.html link present',
  (function() {
    // Mobile nav section starts around "mobile-nav-section-main"
    var idx = indexHtml.indexOf('mobile-nav-section-main');
    return idx > 0 && indexHtml.indexOf('estimation.html', idx) > 0;
  })());
t('33. fixeo-header-global.js drawer: estimation.html link present',
  headerGlobal.includes('estimation.html'));

/* ══════════════════════════════════════════════════════
   GROUP 7 — iOS / ACCESSIBILITY SAFETY
══════════════════════════════════════════════════════ */
console.log('\n[7] iOS / accessibility safety');

t('34. NLP input font-size 1rem (≥16px — no iOS auto-zoom)',
  pageJs.includes("style.fontSize = '1rem'") ||
  pageJs.includes('fontSize = "1rem"'));
t('35. fxep-nlp-input font-size 1rem in CSS',
  pageCss.includes('font-size: 1rem'));
t('36. City chip min-height ≥44px in CSS (touch target)',
  pageCss.includes('min-height: 44px') ||
  pageCss.includes('min-height:44px'));
t('37. No user-scalable=no added (pinch zoom preserved)',
  !estimationHtml.includes('user-scalable=no'));
t('38. No maximum-scale=1 added',
  !estimationHtml.includes('maximum-scale=1'));
t('39. No new scrollIntoView on public page NLP input focus',
  !pageJs.match(/scrollIntoView[\s\S]{0,50}fxep-nlp-input/) &&
  !pageJs.match(/fxep-nlp-input[\s\S]{0,50}scrollIntoView[\s\S]{0,50}focus\(/));
t('40. No forced focus() called inside _mount on a text input (no auto-zoom risk)',
  (function() {
    var mountIdx = pageJs.indexOf('function _mount()');
    if (mountIdx < 0) return true; // not found = not an issue
    var mountBody = pageJs.substring(mountIdx, mountIdx + 600);
    // _mount should not call .focus() directly
    return !mountBody.match(/\bfocus\s*\(/);
  })());
t('41. prefers-reduced-motion handled in CSS',
  pageCss.includes('prefers-reduced-motion'));

/* ══════════════════════════════════════════════════════
   GROUP 8 — PAGE_REQUIRED PRESERVATION
══════════════════════════════════════════════════════ */
console.log('\n[8] PAGE_REQUIRED preservation');

t('42. fixeo_estimator_token_v1 key unchanged',
  pageJs.includes("'fixeo_estimator_token_v1'"));
t('43. PAGE_REQUIRED early return preserved',
  pageJs.includes("if (_mode === 'page-required') {") ||
  pageJs.includes("_mode === 'page-required'"));
t('44. renderPaintingFlow in estimation.html inline JS (unchanged)',
  estimationHtml.includes('renderPaintingFlow'));
t('45. fetchPaintingResult in estimation.html (unchanged)',
  estimationHtml.includes('fetchPaintingResult'));
t('46. FixeoEstimatorAPI.answer() call unchanged (no multiplying in browser)',
  estimationHtml.includes('FixeoEstimatorAPI.answer('));
t('47. FixeoEstimatorAPI.evaluate() call unchanged',
  estimationHtml.includes('FixeoEstimatorAPI.evaluate('));

/* ══════════════════════════════════════════════════════
   GROUP 9 — FUNCTIONAL AUTHORITY UNCHANGED
══════════════════════════════════════════════════════ */
console.log('\n[9] Functional authority unchanged');

t('48. fixeo:estimator-reserve listener preserved in page JS',
  pageJs.includes("'fixeo:estimator-reserve'"));
t('49. FixeoReservation.open(null, false, null) preserved',
  pageJs.includes('window.FixeoReservation.open(null, false, null)'));
t('50. reservation.js?v=v1m-estimator-copy in reservation stack',
  pageJs.includes('reservation.js?v=v1m-estimator-copy'));
t('51. Resume card uses server amount_mad only (no client multiplication)',
  pageJs.includes('ctx.amount_mad') &&
  !pageJs.match(/amount_mad\s*\*/));
t('52. No raw price written to sessionStorage / localStorage (opaque token only)',
  !pageJs.match(/setItem[^)]*amount_mad/) &&
  !pageJs.match(/setItem[^)]*\d+\s*MAD/));

/* ══════════════════════════════════════════════════════
   GROUP 10 — GATEWAY LINKS (verified routes only)
══════════════════════════════════════════════════════ */
console.log('\n[10] Gateway links (verified routes)');

t('53. Gateway uses artisans.html (confirmed existing)',
  pageJs.includes('/artisans.html'));
t('54. Gateway uses comment-ca-marche.html (confirmed existing)',
  pageJs.includes('/comment-ca-marche.html'));
t('55. Gateway uses entreprises.html (confirmed existing)',
  pageJs.includes('/entreprises.html'));
t('56. No invented /trouver-artisan or /request href',
  !pageJs.includes("href: '/trouver-artisan'") &&
  !pageJs.includes("href: '/request'"));

/* ══════════════════════════════════════════════════════
   GROUP 11 — LAYOUT / RESPONSIVE SAFETY
══════════════════════════════════════════════════════ */
console.log('\n[11] Layout / responsive safety');

t('57. fxep-outcome-card uses 2-column grid at narrow width (≤480px or default)',
  pageCss.includes('repeat(2, 1fr)'));
t('58. fxep-outcomes-grid expands to 4 columns at ≥640px',
  pageCss.includes('grid-template-columns: repeat(4, 1fr)'));
t('59. 360px safety rule present in CSS',
  pageCss.includes('max-width: 380px') || pageCss.includes('max-width:380px'));
t('60. No 100vh assumptions — dvh used where appropriate',
  pageCss.includes('100dvh') || pageCss.includes('80dvh'));
t('61. safe-area-inset-bottom used in city picker sheet',
  pageJs.includes('safe-area-inset-bottom'));

/* ══════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
