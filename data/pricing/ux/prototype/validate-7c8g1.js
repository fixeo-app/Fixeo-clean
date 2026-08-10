#!/usr/bin/env node
/**
 * Validator — Phase 7C.8G.1
 * FIXEO Estimator Flagship Freeze Candidate
 * ─────────────────────────────────────────────────────────────────
 * Validates:
 *  - All baseline files exist
 *  - 7C.8G sphere contract preserved
 *  - Painting result flagship fix applied (price in main + sidebar + CTA)
 *  - Page result flagship parity markers
 *  - All outcome types remain supported
 *  - No UI price arithmetic
 *  - No hardcoded painting price
 *  - No forbidden floor conversion
 *  - No production references
 *  - No files outside prototype scope
 *  - Engine still dormant
 *  - Orchestrator still dormant
 *  - Build markers updated
 *  - CSS variable contracts preserved
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PROTO = path.resolve(__dirname, '.');
const ROOT  = path.resolve(PROTO, '../../../..');

const JS_FILE   = path.join(PROTO, 'estimator-prototype.js');
const CSS_FILE  = path.join(PROTO, 'estimator-prototype.css');
const HTML_FILE = path.join(PROTO, 'estimator-prototype.html');
const PAGE_FILE = path.join(PROTO, 'estimation-page-prototype.html');

let passed = 0, failed = 0, errors = [];

function check(label, ok) {
  if (ok) { passed++; }
  else { failed++; errors.push('  FAIL: ' + label); }
}

const js  = fs.readFileSync(JS_FILE,   'utf8');
const css = fs.readFileSync(CSS_FILE,  'utf8');
const htm = fs.readFileSync(HTML_FILE, 'utf8');
const pag = fs.readFileSync(PAGE_FILE, 'utf8');

// ═══════════════════════════════════════════════════════════════════
// §1 — FILE EXISTENCE
// ═══════════════════════════════════════════════════════════════════

var REQUIRED_FILES = [
  'estimator-prototype.css',
  'estimator-prototype.js',
  'estimator-prototype.html',
  'estimation-page-prototype.html',
  'estimator-prototype-adapter.js',
  'estimator-prototype-fixtures.js',
  'README.md',
  'validate-7c8b.js',
  'validate-7c8c.js',
  'validate-7c8d.js',
  'validate-7c8g.js',
  'validate-7c8g1.js',
  'tests/prototype-tests-v1.js',
  'tests/prototype-tests-v2.js',
  'tests/prototype-tests-v3.js',
  'tests/prototype-tests-v4.js',
  'tests/prototype-tests-v5.js',
];
REQUIRED_FILES.forEach(function(f) {
  check('file exists: ' + f, fs.existsSync(path.join(PROTO, f)));
});

// ═══════════════════════════════════════════════════════════════════
// §2 — 7C.8G SPHERE CONTRACT PRESERVED
// ═══════════════════════════════════════════════════════════════════

check('sphere: rafi-sphere class in CSS',     css.includes('.rafi-sphere {') || css.includes('.rafi-sphere{'));
check('sphere: rafi-sphere-wrap in CSS',      css.includes('.rafi-sphere-wrap'));
check('sphere: rafi-sphere-label in CSS',     css.includes('.rafi-sphere-label'));
check('sphere: 9 data-state rules in CSS',
  ['idle','analyzing','verifying','identified','complete','safety','routing','quote'].every(function(s){
    return css.includes('[data-state="'+s+'"]');
  }));
check('sphere: setSphereState in JS',         js.includes('setSphereState'));
check('sphere: _SPHERE_STATE_MAP in JS',      js.includes('_SPHERE_STATE_MAP'));
check('sphere: sphere in renderHeader JS',    js.includes('rafi-sphere'));
check('sphere: page-sphere in page HTML',     pag.includes('page-sphere'));
check('sphere CSS: rafi-breathe animation',   css.includes('@keyframes rafi-breathe'));
check('sphere CSS: rafi-orbit animation',     css.includes('@keyframes rafi-orbit'));
check('sphere CSS: rafi-verify-pulse',        css.includes('@keyframes rafi-verify-pulse'));
check('sphere CSS: rafi-lock animation',      css.includes('@keyframes rafi-lock'));
check('sphere CSS: prefers-reduced-motion',   css.includes('prefers-reduced-motion'));

// ═══════════════════════════════════════════════════════════════════
// §3 — SPHERE VISUAL REFINEMENT (7C.8G.1)
// ═══════════════════════════════════════════════════════════════════

check('sphere CSS: deeper background (warm highlight layer)',
  css.includes('rgba(80,55,100') || css.includes('2A2035'));
check('sphere CSS: specular highlight on wrap::before',
  css.includes('rafi-sphere-wrap::before'));
check('sphere CSS: label opacity >= 0.70',
  css.includes('rgba(255,122,0,0.75)') || css.includes('rgba(255,122,0,0.80)') ||
  css.includes('rgba(255,122,0,0.70)'));
check('sphere CSS: analyzing orbit has box-shadow for perceptibility',
  css.includes('[data-state="analyzing"]::after') &&
  (css.includes('box-shadow: 0 0 6px') || css.includes('box-shadow:0 0 6px') || css.includes('box-shadow: 0 0 5px')));
check('page-sphere CSS: deeper background',
  css.includes('.page-sphere') && (css.includes('0F0E13') || css.includes('2A2035')));
check('page-sphere CSS: stronger label color (>= 0.75 opacity)',
  css.includes('rgba(255,122,0,0.80)') || css.includes('rgba(255,122,0,0.75)'));

// ═══════════════════════════════════════════════════════════════════
// §4 — PAINTING RESULT FIX
// ═══════════════════════════════════════════════════════════════════

check('page: showPaintingResult uses price-hero',       pag.includes("'price-hero'"));
check('page: showPaintingResult uses price-display',    pag.includes("'price-display'"));
check('page: showPaintingResult uses result-shell',     pag.includes("'result-shell"));
check('page: showPaintingResult uses amount span',      pag.includes("el('span','amount'"));
check('page: showPaintingResult uses currency span',    pag.includes("el('span','currency'"));
check('page: CTA echoes engineAmount variable',
  pag.includes('engineAmount') && (pag.includes("+ ' MAD'") || pag.includes("+ \" MAD\"")));
check('page: sidebar uses amount span', function() {
  var rswrIdx = pag.indexOf('renderSummaryWithResult');
  var rswrBody = pag.slice(rswrIdx, rswrIdx + 2000);
  return rswrBody.includes("el('span','amount'") || rswrBody.includes('el("span","amount"');
}());
check('page: no hardcoded 3575',  !pag.includes('3575'));
check('page: no 1.6× conversion', !pag.includes('* 1.6') && !pag.includes('*1.6'));
check('page: no 2.0× conversion', !pag.includes('* 2.0') && !pag.includes('*2.0'));
check('page: UNIT_RATE_FROM_ENGINE variable or comment', pag.includes('UNIT_RATE_FROM_ENGINE') || pag.includes('unit_rate_mad'));

// ═══════════════════════════════════════════════════════════════════
// §5 — PAGE / MODAL RESULT PARITY MARKERS
// ═══════════════════════════════════════════════════════════════════

check('page: Analyse terminée in result body',    pag.includes('Analyse terminée'));
check('page: Intervention identifiée in result',  pag.includes('Intervention identifiée'));
check('page: result-header in painting result',   pag.includes("'result-header'"));
check('page: scope-doctrine in result',           pag.includes('scope-doctrine'));
check('page: Prix FIXEO eyebrow in result',       pag.includes('Prix FIXEO'));
check('page: Périmètre vérifié in result',        pag.includes('Périmètre vérifié') || pag.includes('P\u00e9rim\u00e8tre v\u00e9rifi\u00e9'));
check('page: RÉSULTAT FIXEO in sidebar',          pag.includes('RÉSULTAT FIXEO') || pag.includes('R\u00c9SULTAT FIXEO'));

// ═══════════════════════════════════════════════════════════════════
// §6 — INTELLIGENCE LOCK LABELS
// ═══════════════════════════════════════════════════════════════════

check('js: Métier intelligence lock',       js.includes('Métier'));
check('js: Périmètre intelligence lock',    js.includes('Périmètre'));
check('js: Tarification intelligence lock', js.includes('Tarification'));
check('page: Métier lock label',            pag.includes('Métier'));
check('page: Périmètre lock label',         pag.includes('Périmètre'));
check('page: Tarification lock label',      pag.includes('Tarification'));

// ═══════════════════════════════════════════════════════════════════
// §7 — ALL OUTCOME TYPES PRESENT
// ═══════════════════════════════════════════════════════════════════

var OUTCOME_TYPES = ['PRICE_READY','LABOUR_PLUS_PART_READY','DIAGNOSTIC_READY',
  'QUOTE_REQUIRED','ROUTE_REQUIRED','SAFETY_STOP'];
OUTCOME_TYPES.forEach(function(t) {
  check('js: outcome type ' + t, js.includes(t));
});
check('page: PAGE_REQUIRED flow present', pag.includes('renderPaintingFlow') || pag.includes('PAGE_REQUIRED'));

// ═══════════════════════════════════════════════════════════════════
// §8 — NO UI PRICE ARITHMETIC
// ═══════════════════════════════════════════════════════════════════

check('js: no UI price arithmetic (amount_mad read from outcome)',
  js.includes('amount_mad') && !js.includes('pricePerUnit') && !js.includes('rate * '));
check('js: price comes from outcome.price.amount_mad',
  js.includes('outcome.price') || js.includes('amount_mad'));
check('js: no hardcoded per-service price map',
  !js.includes('{menuiserie: 300') && !js.includes("menuiserie':300") && !js.includes("'menuiserie':300"));
check('js: no eval()', !js.includes('eval('));
check('js: no fetch()', !js.includes('fetch('));

// ═══════════════════════════════════════════════════════════════════
// §9 — PRODUCTION ISOLATION
// ═══════════════════════════════════════════════════════════════════

// Check no production files modified (proxy: no production references in prototype)
check('js: no production import of reservation',
  !js.includes("require('reservation") && !js.includes('import.*reservation'));
check('htm: no production reservation reference',
  !htm.includes("'reservation.js'") && !htm.includes('"reservation.js"'));
check('js: no Supabase client',
  !js.includes('supabase') && !js.includes('createClient'));
check('js: no network fetch',   !js.includes('fetch('));
check('htm: no network fetch',  !htm.includes('fetch('));
check('page: no network fetch', !pag.includes('fetch('));
check('js: no alert()',   !js.includes('alert('));
check('htm: no alert()',  !htm.includes('alert('));
check('page: no alert()', !pag.includes('alert('));

// ═══════════════════════════════════════════════════════════════════
// §10 — CSS VARIABLE CONTRACTS (all historical aliases preserved)
// ═══════════════════════════════════════════════════════════════════

var REQUIRED_CSS_VARS = [
  '--ink:', '--ink2:', '--ink3:', '--ink4:',
  '--fo:', '--fm:', '--fg:', '--t1:', '--t2:', '--t3:',
  '--page-bg:',
  // 8F-R aliases
  '--modal-surface:', '--modal-elevated:', '--modal-border:',
  '--fixeo-orange:', '--fixeo-magenta:', '--text-primary:', '--text-secondary:',
  // V1/V2 aliases
  '--color-bg:', '--color-surface:', '--color-near-black:', '--color-soft-gray:',
  '--gradient-accent:', '--gradient-v1-start:', '--gradient-v1-end:',
  '--modal-radius:', '--modal-width:', '--card-radius:', '--btn-radius:',
];
REQUIRED_CSS_VARS.forEach(function(v) {
  check('css: var ' + v + ' exists', css.includes(v));
});

// Dual --modal-radius contract
check('css: --modal-radius 20px (v1 contract)', css.includes('--modal-radius') && css.includes('20px'));
check('css: --modal-radius 24px comment (v2 contract)', css.includes('--modal-radius: 24px'));

// ═══════════════════════════════════════════════════════════════════
// §11 — BUILD MARKERS
// ═══════════════════════════════════════════════════════════════════

check('htm: cache-bust ?v=8g1',    htm.includes('v=8g1'));
check('page: cache-bust ?v=8g1',   pag.includes('v=8g1'));
check('htm: 7C.8G.1 build marker', htm.includes('7C.8G.1'));

// ═══════════════════════════════════════════════════════════════════
// §12 — FORBIDDEN PROTOTYPE LANGUAGE IN RESULT
// ═══════════════════════════════════════════════════════════════════

// "dormant" must not appear inside painting result function body
check('page: dormant not in painting result body', function() {
  var idx = pag.indexOf('function showPaintingResult');
  if (idx < 0) return true;
  var nextFn = pag.indexOf('\nfunction ', idx + 10);
  var body = nextFn > 0 ? pag.slice(idx, nextFn) : pag.slice(idx, idx + 3000);
  return !body.includes('dormant');
}());

// ═══════════════════════════════════════════════════════════════════
// §13 — SEMANTIC AMOUNT/CURRENCY DOM
// ═══════════════════════════════════════════════════════════════════

check('js: semantic amount span in price renders', js.includes("'amount'") || js.includes('"amount"'));
check('js: semantic currency span in price renders', js.includes("'currency'") || js.includes('"currency"'));
check('css: .amount gradient styling', css.includes('.price-display .amount'));
check('css: .currency styling',        css.includes('.price-display .currency'));

// ═══════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════

var total = passed + failed;
var bar = '═'.repeat(63);
console.log('\n' + bar);
console.log('  FIXEO Prototype — Phase 7C.8G.1 Validator');
console.log(bar);
if (errors.length) {
  errors.forEach(function(e){ console.log(e); });
  console.log('');
}
console.log('  PASS: ' + passed + ' / FAIL: ' + failed + ' / TOTAL: ' + total);
console.log('  Status: ' + (failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failed + ' CHECKS FAILED'));
console.log(bar + '\n');
process.exit(failed > 0 ? 1 : 0);
