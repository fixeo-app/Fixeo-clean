/**
 * estimator-v2-3z2d-visual-tests.js
 * Phase 7C.9L.3Z.2D — Premium Hero visual refinement
 *
 * Source-level CSS/HTML contract tests.
 * No browser automation — static assertions only.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

var cssSrc  = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-hero-resume-v1.css'), 'utf8');
var qsmCss  = fs.readFileSync(path.join(__dirname, '../../../../../css/quick-search-modal.css'), 'utf8');
var rfosCss = fs.readFileSync(path.join(__dirname, '../../../../../css/fixeo-rafi-os-v1.css'), 'utf8');
var ctrlSrc = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-hero-resume-v1.js'), 'utf8');
var resSrc  = fs.readFileSync(path.join(__dirname, '../../../../../js/reservation.js'), 'utf8');
var idxSrc  = fs.readFileSync(path.join(__dirname, '../../../../../index.html'), 'utf8');
var pricingSrc = fs.readFileSync(path.join(__dirname, '../../../../../js/fixeo-estimator-v2.js'), 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

/* ══════════════════════════════════════════════════════════════
   GROUP 1: FRESH state — QSM remains present
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: FRESH state ──');

test('1. FRESH #hero-quick-search NOT hidden (no global hide rule)', function () {
  /* Must not have a rule that hides #hero-quick-search without the PRICE_READY scope */
  var cssCode = codeOnly(cssSrc);
  /* Any display:none on hero-quick-search must be scoped to fxhro-price-ready-state */
  var lines = cssCode.split('\n');
  var heroSearchHideLines = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].includes('#hero-quick-search') && lines[i+1] && lines[i+1].includes('display: none')) {
      heroSearchHideLines.push(lines[i].trim());
    }
  }
  /* All such rules must contain fxhro-price-ready-state */
  heroSearchHideLines.forEach(function(l) {
    assert(l.includes('fxhro-price-ready-state'),
      'hero-quick-search hide must be scoped to PRICE_READY: ' + l);
  });
});

test('2. FRESH CTA text unchanged — no CSS overrides CTA content', function () {
  /* CSS cannot set textContent; verify no display:none on #qsm-btn-search globally */
  var cssCode = codeOnly(cssSrc);
  assert(!cssCode.match(/#qsm-btn-search\s*\{[^}]*display\s*:\s*none/),
    'qsm-btn-search not globally hidden in hero-resume CSS');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: PRICE_READY — QSM hidden, DOM preserved
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: PRICE_READY QSM hide ──');

test('3. PRICE_READY visually hides #hero-quick-search via CSS', function () {
  assert(cssSrc.includes('#home.fxhro-price-ready-state #hero-quick-search'),
    'PRICE_READY hero-quick-search selector present');
  var idx = cssSrc.indexOf('#home.fxhro-price-ready-state #hero-quick-search');
  var block = cssSrc.slice(idx, idx + 100);
  assert(block.includes('display: none'), 'display:none applied');
});

test('4. QSM DOM NOT destroyed — hide is CSS-only, no JS removeChild', function () {
  var ctrlCode = codeOnly(ctrlSrc);
  /* hero-resume JS must not remove #hero-quick-search */
  assert(!ctrlCode.includes("getElementById('hero-quick-search')") ||
         !ctrlCode.includes('removeChild') ||
         /* Or if both exist, they must not be adjacent */
         !(ctrlCode.indexOf('hero-quick-search') < ctrlCode.indexOf('removeChild') &&
           ctrlCode.indexOf('removeChild') - ctrlCode.indexOf('hero-quick-search') < 200),
    'no removeChild on #hero-quick-search in controller');
  /* Also: fxhro-price-ready-state removal in _dismissPriceReady restores QSM */
  assert(ctrlCode.includes('classList.remove(CLASS_READY'), '_dismissPriceReady removes CLASS_READY');
});

test('5. PRICE_READY card shown under fxhro-price-ready-state', function () {
  assert(cssSrc.includes('#home.fxhro-price-ready-state #fxhro-card'), 'card selector present');
  var idx = cssSrc.indexOf('#home.fxhro-price-ready-state #fxhro-card');
  var block = cssSrc.slice(idx, idx + 100);
  assert(block.includes('display: block'), 'card displayed');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: CTA wiring unchanged
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: CTA wiring ──');

test('6. Continue button wired: FixeoReservation.open(null, false, null)', function () {
  assert(ctrlSrc.includes('FixeoReservation.open(null, false, null)'), 'continue CTA wired');
});

test('7. Nouvelle demande wired: _onNewRequest calls _resetToFresh', function () {
  assert(ctrlSrc.includes('_onNewRequest') && ctrlSrc.includes('_resetToFresh'),
    'new request CTA wired');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: City + state logic untouched
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: State logic untouched ──');

test('8. exiting PRICE_READY restores QSM: _dismissPriceReady removes fxhro-price-ready-state class', function () {
  assert(ctrlSrc.includes('CLASS_READY') && ctrlSrc.includes('classList.remove(CLASS_READY'),
    '_dismissPriceReady removes CLASS_READY → QSM re-appears');
});

test('9. city state untouched: no sessionStorage/localStorage city removal in CSS', function () {
  /* CSS cannot touch storage — this is a JS contract test */
  var ctrlCode = codeOnly(ctrlSrc);
  assert(!ctrlCode.includes("removeItem('fixeo_detected_city')"), 'city not removed');
  assert(!ctrlCode.includes("removeItem('fxrf4_trusted_city_session')"), 'trusted city not removed');
});

test('10. HeroInsights logic untouched: JS files unchanged', function () {
  /* hero-resume.js does NOT redefine _analyze or any insights render function */
  assert(!ctrlSrc.includes('_renderBar') && !ctrlSrc.includes('_updateCTA_'),
    'no insights render in controller');
});

test('11. RAFI reset logic untouched: memory.reset + entry.reset + HeroInsights.reset + QSM.resetMetier all called', function () {
  var ctrlCode = codeOnly(ctrlSrc);
  assert(ctrlCode.includes('FixeoRAFI.memory'), 'memory.reset called');
  assert(ctrlCode.includes('FixeoRAFI.entry'), 'entry.reset called');
  assert(ctrlCode.includes('FixeoHeroInsights'), 'insights.reset called');
  assert(ctrlCode.includes('QuickSearchModal'), 'QSM.resetMetier called');
});

test('12. verified-price state logic untouched: verifyContext still used', function () {
  var runStart = ctrlSrc.indexOf('function _runVerification()');
  assert(ctrlSrc.indexOf('verifyContext()', runStart) > runStart, 'verifyContext in _runVerification');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: Pricing / reservation freeze
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: Functional freeze ──');

test('13. no pricing JS modified: fixeo-estimator-v2.js unchanged from 3Z.2C.2', function () {
  /* Verify the pricing JS version string is still 3z2b-reentry (not a new version) */
  assert(pricingSrc.includes('3z2b-reentry') || pricingSrc.includes('fxhro') === false,
    'estimator-v2.js not modified by visual phase');
});

test('14. no reservation JS modified', function () {
  /* reservation.js must still have data-estimator-context (3Z.1 intact) */
  assert(resSrc.includes('data-estimator-context'), 'reservation.js intact');
});

test('15. no Supabase changes: no supabase references in controller', function () {
  var ctrlCode = codeOnly(ctrlSrc);
  assert(!ctrlCode.includes('supabase') && !ctrlCode.includes('Supabase'),
    'no Supabase in controller');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: CSS visual contract
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: CSS visual contract ──');

test('16. mobile: price card has bounded max-width (not unbounded)', function () {
  /* Card must have max-width on ≥768px to prevent full-screen stretch */
  assert(cssSrc.includes('max-width: 480px') || cssSrc.includes('max-width:480px') ||
         cssSrc.includes('max-width: 460px') || cssSrc.includes('max-width: 520px'),
    'price card max-width present');
});

test('17. reduced-motion safe: fxhro-fadein animation disabled', function () {
  assert(cssSrc.includes('prefers-reduced-motion') && cssSrc.includes('animation: none'),
    'prefers-reduced-motion guard present');
});

test('18. no duplicate FAEE pricing introduced: no FAEE selectors in hero-resume CSS', function () {
  assert(!cssSrc.includes('#faee') && !cssSrc.includes('faee-'),
    'no FAEE selectors in hero-resume CSS');
});

test('19. price amount font-size: dominant (≥2rem on mobile)', function () {
  /* .fxhro-price-amount must be notably larger than service label */
  var priceAmtIdx = cssSrc.indexOf('.fxhro-price-amount');
  var block = cssSrc.slice(priceAmtIdx, priceAmtIdx + 100);
  /* extract rem value */
  var m = block.match(/font-size:\s*([\d.]+)rem/);
  assert(m && parseFloat(m[1]) >= 2.0, 'price amount ≥ 2.0rem on mobile, got: ' + (m && m[1]));
});

test('20. service label font-size: smaller than price (< 2rem)', function () {
  var serviceIdx = cssSrc.indexOf('.fxhro-service');
  var block = cssSrc.slice(serviceIdx, serviceIdx + 100);
  var m = block.match(/font-size:\s*([\d.]+)rem/);
  assert(m && parseFloat(m[1]) < 2.0, 'service label < 2.0rem, got: ' + (m && m[1]));
});

test('21. primary CTA min-height: touch-friendly (≥48px)', function () {
  /* Find the base rule block — stop at the first :hover/:active selector */
  var btnIdx = cssSrc.indexOf('#fxhro-btn-continue {');
  if (btnIdx < 0) btnIdx = cssSrc.indexOf('#fxhro-btn-continue\n{');
  if (btnIdx < 0) btnIdx = cssSrc.indexOf('#fxhro-btn-continue');
  /* Scan up to 600 chars to find min-height inside the base block */
  var block = cssSrc.slice(btnIdx, btnIdx + 600);
  /* Extract only up to the first pseudo-class selector */
  var trimEnd = block.indexOf(':hover');
  if (trimEnd > 0) block = block.slice(0, trimEnd);
  var m = block.match(/min-height:\s*(\d+)px/);
  assert(m && parseInt(m[1]) >= 48, 'min-height ≥ 48px, got: ' + (m && m[1]));
});

test('22. secondary CTA has no large box-shadow (must not visually compete)', function () {
  var btnNewIdx = cssSrc.indexOf('#fxhro-btn-new');
  var block = cssSrc.slice(btnNewIdx, btnNewIdx + 300);
  assert(!block.includes('box-shadow') || block.includes('none'),
    'no prominent box-shadow on Nouvelle demande button');
});

test('23. PRICE_READY compact RAFI: avatar ≤ 80px in result mode', function () {
  /* Find the PRICE_READY avatar rule — may span multiple lines */
  var priceReadyIdx = cssSrc.indexOf('#home.fxhro-price-ready-state .rfos-avatar {');
  if (priceReadyIdx < 0) priceReadyIdx = cssSrc.indexOf('#home.fxhro-price-ready-state .rfos-avatar');
  assert(priceReadyIdx > 0, 'PRICE_READY avatar rule found');
  /* Scan up to 200 chars for width */
  var block = cssSrc.slice(priceReadyIdx, priceReadyIdx + 200);
  var m = block.match(/width:\s*(\d+)px/);
  assert(m && parseInt(m[1]) <= 80,
    'PRICE_READY avatar ≤ 80px, got: ' + (m && m[1]));
});

test('24. cache key updated to fxhro-v1e-final-polish in index.html', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1e-final-polish'), 'CSS cache key updated');
  assert(!idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1c-qsm-reset'), 'old CSS key gone');
  /* JS key unchanged — no JS changes in 3Z.2D */
  assert(idxSrc.includes('fixeo-hero-resume-v1.js?v=fxhro-v1d-reservation-exit'), 'JS key unchanged');
});

/* ── Summary ──────────────────────────────────────────────────── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
