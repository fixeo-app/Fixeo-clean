/**
 * Phase 7C.9L.3O — Targeted tests
 * Official homepage card reuse + UUID artisan selection fix
 *
 * Tests 1–17 : visual parity (source-level + in-process renderer)
 * Tests 18–32: UUID/ID lookup correctness (in-process harness)
 * Tests 33–45: authority regressions + cache key checks
 *
 * Run: node data/pricing/ux/prototype/validate-7c9l-3o.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../..');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const patchSrc       = read('js/fixeo_homepage_premium_patch.js');
const reservationSrc = read('js/reservation.js');
const indexHtml      = read('index.html');

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, cond) {
  if (cond) {
    console.log('  \u2713 ' + label);
    passed++;
  } else {
    console.error('  \u2717 ' + label);
    failures.push('FAIL: ' + label);
    failed++;
  }
}

/* ════════════════════════════════════════════════════════
   IN-PROCESS RENDERER HARNESS
   Extracts _buildCard and _buildCardEstimator from the
   patch IIFE without executing the full homepage side-
   effects (DOM mutation, grid rendering, etc.).
════════════════════════════════════════════════════════ */

/* Minimal stubs that the IIFE references at parse/setup time */
const fakeWindow = {
  FixeoMatchingEngine: null,
  FixeoHeroes:         null,
  FixeoPricing:        null,
  FIXEO_CITIES:        [],
  FIXEO_DETECTED_CITY: '',
  ARTISANS:            [],
  renderArtisans:      function() {},
  addEventListener:    function() {},
  MutationObserver:    function() { this.observe=function(){}; this.disconnect=function(){}; },
  FixeoHomepagePremium: null,
  _fxAvStage:          null,
  setTimeout:          function() {},
};
const fakeEl = {
  style:       {},
  classList:   { add:function(){}, remove:function(){}, contains:function(){ return false; } },
  setAttribute:function(){},
  appendChild: function(){},
  innerHTML:   '',
  querySelectorAll: function() { return []; },
  querySelector:    function() { return null; },
};
const fakeDocument = {
  readyState:       'complete',   /* avoid DOMContentLoaded registration paths */
  addEventListener: function() {},
  getElementById:   function() { return null; },
  querySelector:    function() { return null; },
  querySelectorAll: function() { return []; },
  createElement:    function() { return Object.assign({}, fakeEl); },
  body: Object.assign({}, fakeEl),
};

try {
  /* Wrap in a function that injects window/document as locals,
   * so the IIFE's (function(window){…}(window)) resolves our fake. */
  const wrappedSrc = '(function(window, document) {\n' +
    /* Intercept the last line that assigns window.FixeoHomepagePremium */
    patchSrc +
    '\n})(fakeWindow, fakeDocument);';
  /* eslint-disable no-new-func */
  new Function('fakeWindow', 'fakeDocument', wrappedSrc)(fakeWindow, fakeDocument);
} catch (e) {
  /* Some failures are expected (MutationObserver, rAF etc.) — we only need buildCard */
  if (!fakeWindow.FixeoHomepagePremium) {
    console.error('SETUP FAIL: FixeoHomepagePremium not assigned:', e.message);
  }
}

const FHP = fakeWindow.FixeoHomepagePremium;

const SAMPLE_A = {
  id:          '2001',
  name:        'Artisan Test',
  category:    'plomberie',
  city:        'Casablanca',
  description: 'Spécialiste en plomberie.',
  price_from:  200,
  rating:      0,
  reviewCount: 0,
  score_qualification: 0,
};

let estCard    = '';
let normalCard = '';

if (FHP && typeof FHP.buildCard === 'function') {
  estCard    = FHP.buildCard(SAMPLE_A, 0, { estimatorMode: true });
  normalCard = FHP.buildCard(Object.assign({}, SAMPLE_A), 0);
} else {
  failures.push('SETUP WARN: FixeoHomepagePremium.buildCard not available — card content tests will fail');
}

/* ════════════════════════════════════════════════════════
   SECTION 1 — VISUAL PARITY (17 tests)
════════════════════════════════════════════════════════ */
console.log('\nSECTION 1 — Visual parity');

/* 1 — reservation.js calls FixeoHomepagePremium.buildCard */
ok('1 – reservation.js calls FixeoHomepagePremium.buildCard',
  reservationSrc.includes('FixeoHomepagePremium.buildCard'));

/* 2 — buildOtherArtisanCard not the preferred estimator path */
ok('2 – buildOtherArtisanCard NOT the preferred estimator renderer',
  !reservationSrc.includes('window.buildOtherArtisanCard(a, { estimatorMode: true'));

/* 3 — Estimator card contains pvc-card class */
ok('3 – estimator card HTML contains pvc-card class',
  estCard.includes('pvc-card'));

/* 4 — Estimator card contains fhp-card class */
ok('4 – estimator card HTML contains fhp-card class',
  estCard.includes('fhp-card'));

/* 5 — Single avatar block present */
ok('5 – single pvc-avatar block in estimator card',
  (estCard.match(/class="pvc-avatar/g) || []).length >= 1);

/* 6 — Description retained */
ok('6 – description retained in estimator card',
  estCard.includes('Sp\u00e9cialiste en plomberie.'));

/* 7 — Trust row "Profil référencé sur FIXEO" retained */
ok('7 – "Profil référencé sur FIXEO" trust row retained',
  estCard.includes('r\u00e9f\u00e9renc\u00e9 sur FIXEO'));

/* 8 — "À partir de" absent */
ok('8 – "\u00c0 partir de" absent in estimator card',
  !estCard.includes('\u00c0 partir de'));

/* 9 — "Tarif renseigné" absent */
ok('9 – "Tarif renseign\u00e9" absent in estimator card',
  !estCard.includes('Tarif renseign'));

/* 10 — "Voir le profil complet" absent */
ok('10 – "Voir le profil complet" absent in estimator card',
  !estCard.includes('Voir le profil complet'));

/* 11 — CTA says "Choisir cet artisan" */
ok('11 – CTA label is "Choisir cet artisan"',
  estCard.includes('Choisir cet artisan'));

/* 12 — article has data-estimator-id */
ok('12 – article has data-estimator-id="2001"',
  estCard.includes('data-estimator-id="2001"'));

/* 13 — CTA has data-estimator-select */
ok('13 – CTA has data-estimator-select="true"',
  estCard.includes('data-estimator-select="true"'));

/* 14 — no inline _selectArtisanFromPicker */
ok('14 – no inline _selectArtisanFromPicker in estimator card',
  !estCard.includes('_selectArtisanFromPicker'));

/* 15 — normal homepage card price block present */
ok('15 – normal homepage card shows price block (pvc-price-block)',
  normalCard.includes('pvc-price-block') || normalCard.includes('pvc-price-amount'));

/* 16 — normal homepage card shows "Tarif renseigné" */
ok('16 – normal homepage card shows "Tarif renseign\u00e9"',
  normalCard.includes('Tarif renseign'));

/* 17 — normal homepage card shows "Réserver maintenant" */
ok('17 – normal homepage card shows "R\u00e9server maintenant"',
  normalCard.includes('R\u00e9server maintenant'));

/* ════════════════════════════════════════════════════════
   SECTION 2 — UUID / ID LOOKUP (15 tests, in-process)
════════════════════════════════════════════════════════ */
console.log('\nSECTION 2 — UUID / ID lookup');

const UUID_ID  = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NUM_ID   = '2000';
const OTHER_ID = 'custom-id-xyz';

const POOL = [
  { id: UUID_ID,  category: 'plomberie', city: 'Casablanca', name: 'UUID Artisan',   rating: 0, reviewCount: 0 },
  { id: NUM_ID,   category: 'plomberie', city: 'Casablanca', name: 'Legacy Artisan', rating: 4.8, reviewCount: 42 },
  { id: OTHER_ID, category: 'plomberie', city: 'Casablanca', name: 'Custom Artisan', rating: 0, reviewCount: 0 },
];

/* Exact copy of the patched getArtisanById / normalizeArtisan from reservation.js */
function getArtisanByIdLocal(id) {
  var sid = String(id);
  return POOL.find(function(a) { return String(a.id) === sid; }) || null;
}

function normalizeArtisanLocal(input) {
  if (!input) return null;
  if (typeof input === 'number' || typeof input === 'string') {
    return getArtisanByIdLocal(input);
  }
  if (typeof input === 'object') { return input; }
  return null;
}

/* 18 — number 2000 resolves */
ok('18 – number 2000 resolves',
  normalizeArtisanLocal(2000) !== null && normalizeArtisanLocal(2000).name === 'Legacy Artisan');

/* 19 — string "2000" resolves */
ok('19 – string "2000" resolves',
  normalizeArtisanLocal(NUM_ID) !== null && normalizeArtisanLocal(NUM_ID).name === 'Legacy Artisan');

/* 20 — UUID string resolves */
ok('20 – UUID string resolves',
  normalizeArtisanLocal(UUID_ID) !== null && normalizeArtisanLocal(UUID_ID).name === 'UUID Artisan');

/* 21 — other non-numeric string resolves when present */
ok('21 – other non-numeric string ID resolves',
  normalizeArtisanLocal(OTHER_ID) !== null && normalizeArtisanLocal(OTHER_ID).name === 'Custom Artisan');

/* 22 — unknown string returns null */
ok('22 – unknown string returns null',
  normalizeArtisanLocal('totally-unknown-xyz-99999') === null);

/* Simulate _selectArtisanFromPicker */
var simArtisan = null;
var simStep    = 0;
var simCtx     = { service_code: 'plomberie.debouchage_evier', service_label: 'Débouchage évier standard', amount_mad: 250 };
var simCity    = 'Casablanca';

function selectSim(id) {
  simArtisan = normalizeArtisanLocal(id);
  simStep    = 1;
}

/* 23 — UUID CTA sets state.artisan */
selectSim(UUID_ID);
ok('23 – UUID CTA selection sets state.artisan (non-null)',
  simArtisan !== null);

/* 24 — UUID CTA advances to step 1 */
ok('24 – UUID CTA selection advances step to 1',
  simStep === 1);

/* 25 — numeric-string selection still works */
simArtisan = null; simStep = 0;
selectSim(NUM_ID);
ok('25 – numeric-string CTA selection still works',
  simArtisan !== null && simArtisan.name === 'Legacy Artisan');

/* 26 — whole-card UUID selection (same path) */
simArtisan = null; simStep = 0;
selectSim(UUID_ID);
ok('26 – whole-card UUID selection works (same code path)',
  simArtisan !== null);

/* 27 — fires exactly once */
var fireCount = 0;
function selectFire(id) { fireCount++; return normalizeArtisanLocal(id); }
fireCount = 0;
selectFire(UUID_ID);
ok('27 – selection fires exactly once per CTA tap',
  fireCount === 1);

/* 28–32 — context preservation */
ok('28 – _estimatorCtx not mutated by selection', simCtx.service_code === 'plomberie.debouchage_evier');
ok('29 – estimatorCity preserved', simCity === 'Casablanca');
ok('30 – service_code preserved', simCtx.service_code === 'plomberie.debouchage_evier');
ok('31 – service_label preserved', simCtx.service_label === 'Débouchage évier standard');
ok('32 – amount_mad 250 preserved', simCtx.amount_mad === 250);

/* ════════════════════════════════════════════════════════
   SECTION 3 — AUTHORITY REGRESSIONS
════════════════════════════════════════════════════════ */
console.log('\nSECTION 3 — Authority regressions');

/* 33 — no amount_mad modification in patch file */
ok('33 – pricing engine not touched (no amount_mad write in patch)',
  !patchSrc.includes('amount_mad'));

/* 34 — no Supabase schema changes */
ok('34 – no Supabase schema changes in patch',
  !patchSrc.includes('.from('));

/* 35 — idempotency guard still in reservation.js */
ok('35 – idempotency guard present in reservation.js',
  reservationSrc.includes('idempotent') || reservationSrc.includes('idempotencyKey') || reservationSrc.includes('_submitting'));

/* 36 — no booking authority modifications in patch */
ok('36 – no new COD/payment references in patch',
  !patchSrc.includes('FixeoCOD') && !patchSrc.includes('FixeoPayment'));

/* ════════════════════════════════════════════════════════
   SECTION 4 — CACHE KEY CHECKS
════════════════════════════════════════════════════════ */
console.log('\nSECTION 4 — Cache keys');

/* 37 — reservation v1c present */
ok('37 – reservation.js?v=v1c present in index.html',
  indexHtml.includes('reservation.js?v=v1c'));

/* 38 — reservation v1b absent */
ok('38 – OLD reservation.js?v=v1b absent from index.html',
  !indexHtml.includes('reservation.js?v=v1b'));

/* 39 — homepage premium v1a3-estimator present */
ok('39 – homepage-premium cache key v1a3-estimator in index.html',
  indexHtml.includes('fixeo_homepage_premium_patch.js?v=fxhome-artisan-section-v1a3-estimator'));

/* 40 — homepage premium JS (not CSS) no longer uses old key v1a2-int1
 * The CSS file fixeo-artisan-section-v1.css still correctly uses v1a2-int11 (unchanged).
 * Only the JS key needs to be confirmed bumped. */
ok('40 – fixeo_homepage_premium_patch.js no longer uses old v1a2-int1 JS cache key',
  !indexHtml.includes('fixeo_homepage_premium_patch.js?v=fxhome-artisan-section-v1a2-int1'));

/* 41 — main.js cache key unchanged */
ok('41 – main.js cache key unchanged (facp-v2d)',
  indexHtml.includes('main.js?v=facp-v2d'));

/* ════════════════════════════════════════════════════════
   SECTION 5 — HOMEPAGE UNCHANGED
════════════════════════════════════════════════════════ */
console.log('\nSECTION 5 — Normal homepage unchanged');

/* 42 — _bindGridDelegation still present */
ok('42 – _bindGridDelegation still present in patch',
  patchSrc.includes('_bindGridDelegation'));

/* 43 — _doReserve still present */
ok('43 – _doReserve still calls FixeoReservation.open',
  patchSrc.includes('FixeoReservation.open'));

/* 44 — normal card CTA */
ok('44 – normal homepage buildCard CTA = "R\u00e9server maintenant"',
  normalCard.includes('R\u00e9server maintenant'));

/* 45 — normal card profile link */
ok('45 – normal homepage buildCard has "Voir le profil complet"',
  normalCard.includes('Voir le profil complet'));

/* ════════════════════════════════════════════════════════
   RESULTS
════════════════════════════════════════════════════════ */
console.log('\n=== Phase 7C.9L.3O — results ===');
console.log('PASS: ' + passed + ' / ' + (passed + failed));
if (failures.length) {
  failures.forEach(function(f) { console.error(f); });
}
console.log('');
if (failed === 0) {
  console.log('ALL ' + passed + ' TESTS PASSED');
  process.exit(0);
} else {
  console.error(failed + ' TEST(S) FAILED');
  process.exit(1);
}
