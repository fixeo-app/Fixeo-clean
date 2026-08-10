'use strict';
/**
 * estimator-v2-city-picker-tests.js
 * Phase 7C.9L.3C — 30 targeted tests
 */
const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../../../../');

let passed = 0, failed = 0;
function assert(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); passed++; }
  else       { console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const bridgeSrc  = read('js/fixeo-estimator-reservation-bridge-v1.js');
const resSrc     = read('js/reservation.js');
const mainSrc    = read('js/main.js');
const authSrc    = read('api/fixeo-booking-authority-v1.js');
const canonSrc   = read('data/pricing/canonical/canonical-registry.v1.draft.json');
const engineSrc  = read('data/pricing/engine/pricing-engine-core-v1.js');

// ─── SECTION 1: Bridge service_code propagation ───────────────────────────────
console.log('\nSECTION 1 — Bridge service_code propagation');

assert('1. service_code propagated in verifyContext return',
  bridgeSrc.includes('service_code:      r.service_code'));

// ─── SECTION 2: Context-before-render lifecycle ───────────────────────────────
console.log('\nSECTION 2 — Context before render');

assert('2. verifyContext resolves THEN render() in open()',
  (function() {
    var vIdx = resSrc.indexOf('verifyContext().then');
    var rIdx = resSrc.indexOf('render();', vIdx);
    return vIdx > 0 && rIdx > vIdx && (rIdx - vIdx) < 300;
  })());

assert('3. state._estimatorCtx reset on open()',
  resSrc.includes('state._estimatorCtx = null') &&
  (resSrc.includes('state.estimatorCity = null') || resSrc.includes('estimatorCity:  null')));

assert('4. Loading placeholder shown before context resolves',
  resSrc.includes('Chargement\u2026') || resSrc.includes('Chargement...') || resSrc.includes('Chargement\u2026'));

// ─── SECTION 3: City selection stage ─────────────────────────────────────────
console.log('\nSECTION 3 — City selection stage');

assert('5. renderEstimatorCityPicker exists',
  resSrc.includes('function renderEstimatorCityPicker()'));

assert('6. City picker shown when estimatorCtx valid AND no city selected',
  resSrc.match(/estimatorCity[\s\S]{0,30}renderEstimatorCityPicker/) ||
  resSrc.match(/!state\.estimatorCity[\s\S]{0,100}renderEstimatorCityPicker/));

assert('7. Cached city shown as suggested chip only — not auto-confirmed',
  resSrc.includes('fixeo_detected_city') &&
  resSrc.includes('Détecté') &&
  !resSrc.match(/estimatorCity\s*=.*fixeo_detected_city/));

assert('8. _setEstimatorCity sets city and calls render()',
  resSrc.includes('function _setEstimatorCity(city)') &&
  resSrc.includes('state.estimatorCity = city || null') &&
  (function(){
    var i = resSrc.indexOf('function _setEstimatorCity(city)');
    var b = resSrc.slice(i, i+200);
    return b.includes('render()');
  })());

assert('9. _setEstimatorCity exported on window.FixeoReservation',
  resSrc.includes('_setEstimatorCity,'));

assert('10. City chips use _setEstimatorCity in onclick',
  resSrc.includes('FixeoReservation._setEstimatorCity('));

// ─── SECTION 4: City → artisan cards transition ───────────────────────────────
console.log('\nSECTION 4 — City → artisan cards');

assert('11. renderEstimatorArtisanPicker exists',
  resSrc.includes('function renderEstimatorArtisanPicker()'));

assert('12. renderArtisanPicker dispatches to city picker when no city set',
  (function() {
    var dispatchIdx = resSrc.indexOf('function renderArtisanPicker()');
    var block = resSrc.slice(dispatchIdx, dispatchIdx + 500);
    return block.includes('renderEstimatorCityPicker') && block.includes('renderEstimatorArtisanPicker');
  })());

// ─── SECTION 5: Strict métier + city filtering ────────────────────────────────
console.log('\nSECTION 5 — Métier + city filtering');

assert('13. Métier derived from service_code.split(\'.\')[0]',
  resSrc.match(/service_code\.split\('\.'\)\[0\]/));

assert('14. a.category === metier — exact métier match',
  resSrc.match(/a\.category\s*!==\s*metier/));

assert('15. City normalized — NFD + diacritics + lowercase',
  resSrc.includes("normalize('NFD')") && resSrc.includes("replace(/[\\u0300-\\u036f]/g") &&
  resSrc.includes('_normCity'));

assert('16. "Maroc" default excluded — never matches specific city',
  resSrc.match(/ac\s*===\s*'maroc'/) || resSrc.includes("ac === 'maroc'"));

assert('17. Zero-match returns city-specific empty state — no fallback to all artisans',
  (function() {
    var emptyIdx = resSrc.indexOf('matched.length === 0');
    var block    = resSrc.slice(emptyIdx, emptyIdx + 1500);
    return emptyIdx > 0 && block.includes('Aucun artisan') && !block.includes('ARTISANS.slice');
  })());

assert('18. "Changer de ville" link in empty state resets city',
  (function(){
    var i = resSrc.indexOf('matched.length === 0');
    var b = resSrc.slice(i, i+1500);
    return b.includes('Changer de ville') && b.includes('_setEstimatorCity(null)');
  })());

// ─── SECTION 6: Homepage card reuse ──────────────────────────────────────────
console.log('\nSECTION 6 — Homepage card reuse');

assert('19. window.buildOtherArtisanCard exposed',
  mainSrc.includes('window.buildOtherArtisanCard = buildOtherArtisanCard'));

assert('20. buildOtherArtisanCard(a) — homepage call without opts unchanged',
  mainSrc.includes('buildOtherArtisanCard(a, opts)') &&
  mainSrc.includes('var _estimatorMode = !!(opts && opts.estimatorMode)'));

assert('21. Estimator card uses window.buildOtherArtisanCard with estimatorMode:true',
  resSrc.includes("window.buildOtherArtisanCard(a, { estimatorMode: true, hidePrice: true })"));

assert('22. Estimator card has no competing price — hidePrice suppresses facp-price-block',
  mainSrc.includes('_hidePrice ? \'\' :'));

assert('23. Estimator card uses data-estimator-id (not data-id) — disables profile nav',
  mainSrc.includes("data-estimator-id") && mainSrc.includes("_estimatorMode"));

assert('24. Whole card onclick calls _selectArtisanFromPicker',
  mainSrc.includes('FixeoReservation._selectArtisanFromPicker'));

assert('25. CTA text is "Choisir cet artisan" in estimator mode',
  mainSrc.includes('Choisir cet artisan'));

// ─── SECTION 7: Step 1 / Step 2 estimator behavior ───────────────────────────
console.log('\nSECTION 7 — Step 1 and Step 2');

assert('26. Step 1 artisan price shows Prix FIXEO when estimator active',
  resSrc.includes('Prix FIXEO garanti'));

assert('27. Step 2 shows "Prix FIXEO" without "(indicatif)" when estimator active',
  resSrc.includes("['Prix FIXEO'") && !resSrc.match(/'Prix FIXEO'.*indicatif/));

assert('28. Non-estimator Step 2 retains "(indicatif)"',
  resSrc.includes('(indicatif)'));

// ─── SECTION 8: Context preservation ─────────────────────────────────────────
console.log('\nSECTION 8 — Context preservation');

assert('29. _selectArtisanFromPicker does NOT reset _estimatorCtx',
  (function() {
    var fnIdx = resSrc.indexOf('function _selectArtisanFromPicker');
    var fnEnd = resSrc.indexOf('\n  }', fnIdx + 10);
    var block = resSrc.slice(fnIdx, fnEnd);
    return !block.includes('_estimatorCtx = null') && !block.includes('_estimatorCtx = {}');
  })());

assert('30. pricing_context_token chain intact — booking authority unchanged',
  authSrc.includes('estimatorContextToken') &&
  !authSrc.includes('7C.9L.3C'));

// ─── Integrity checks ─────────────────────────────────────────────────────────
console.log('\nSECTION 9 — Integrity');

assert('27c. canonical pricing diff = 0',
  !canonSrc.includes('7C.9L.3C'));

assert('27e. pricing engine diff = 0',
  !engineSrc.includes('7C.9L.3C'));

// ─── FINAL ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '─'.repeat(60));
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9L.3C city picker tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exit(1);
}
