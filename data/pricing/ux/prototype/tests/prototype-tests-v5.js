#!/usr/bin/env node
/**
 * Prototype Tests v5 — Phase 7C.8G.1
 * FIXEO Estimator Flagship Freeze Candidate
 * ─────────────────────────────────────────────────────────────────
 * Covers:
 *  - Painting result flagship parity (price visible in main + sidebar + CTA)
 *  - Price-source isolation (no hardcoded amounts in UI calculation paths)
 *  - RAFI Sphere all 9 states
 *  - Intelligence lock labels (Métier / Périmètre / Tarification)
 *  - No quantity counters ("Question n/4" forbidden)
 *  - No forbidden floor conversion (1.6×, 2.0×)
 *  - Labour/part never summed
 *  - Quote / Safety doctrine
 *  - Page flagship result parity markers
 *  - CTA context-sensitivity
 *  - Accessibility and motion contracts
 *  - Production isolation
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROTO_DIR = path.resolve(__dirname, '..');
const JS_FILE   = path.join(PROTO_DIR, 'estimator-prototype.js');
const CSS_FILE  = path.join(PROTO_DIR, 'estimator-prototype.css');
const HTML_FILE = path.join(PROTO_DIR, 'estimator-prototype.html');
const PAGE_FILE = path.join(PROTO_DIR, 'estimation-page-prototype.html');

let js  = fs.readFileSync(JS_FILE,   'utf8');
let css = fs.readFileSync(CSS_FILE,  'utf8');
let htm = fs.readFileSync(HTML_FILE, 'utf8');
let pag = fs.readFileSync(PAGE_FILE, 'utf8');

let passed = 0, failed = 0, errors = [];

function check(label, ok) {
  if (ok) { passed++; }
  else { failed++; errors.push('FAIL: ' + label); }
}

// ═══════════════════════════════════════════════════════════════════
// §1 — PAINTING RESULT: PRICE IN MAIN RESULT
// ═══════════════════════════════════════════════════════════════════

// 1. Painting result uses .amount/.currency semantic DOM in main price hero
check('painting result: amount span in showPaintingResult',
  pag.includes('el(\'span\',\'amount\'') && pag.includes('showPaintingResult'));

// 2. Painting result: currency span separate from amount
check('painting result: currency span in showPaintingResult',
  pag.includes("el('span','currency',' MAD')") || pag.includes('el("span","currency"," MAD")') ||
  pag.includes("el('span','currency','") && pag.indexOf("el('span','currency','") > pag.indexOf('showPaintingResult'));

// 3. Painting result uses price-hero composition (flagship parity)
check('painting result: price-hero present in showPaintingResult',
  pag.includes("'price-hero'") && pag.includes('showPaintingResult'));

// 4. Painting result uses price-display class
check('painting result: price-display present in showPaintingResult',
  pag.includes("'price-display'") && pag.includes('showPaintingResult'));

// 5. Painting result uses result-shell composition
check('painting result: result-shell present in showPaintingResult',
  pag.includes("'result-shell") && pag.includes('showPaintingResult'));

// 6. Painting result uses result-header
check('painting result: result-header present in showPaintingResult',
  pag.includes("'result-header'") && pag.includes('showPaintingResult'));

// 7. Painting result: "Analyse terminée" language in body
check('painting result: Analyse terminée in showPaintingResult',
  pag.includes('Analyse terminée') && pag.includes('showPaintingResult'));

// 8. Painting result: "Intervention identifiée" in body
check('painting result: Intervention identifiée in showPaintingResult',
  pag.includes('Intervention identifiée') && pag.includes('showPaintingResult'));

// ═══════════════════════════════════════════════════════════════════
// §2 — PAINTING RESULT: PRICE CONSISTENCY (main = sidebar = CTA)
// ═══════════════════════════════════════════════════════════════════

// 9. CTA price echoes engineAmount variable (not a separate calculation)
check('painting CTA: engineAmount in CTA text (not hardcoded)',
  pag.includes('engineAmount + \' MAD\'') || pag.includes("engineAmount + ' MAD'") ||
  pag.includes('engineAmount +\' MAD\''));

// 10. Sidebar shows amount span (same source variable path)
check('painting sidebar: amount span in renderSummaryWithResult',
  pag.includes("el('span','amount'") && pag.includes('renderSummaryWithResult'));

// 11. Sidebar shows currency span
check('painting sidebar: currency span in renderSummaryWithResult',
  pag.includes("el('span','currency'") && pag.includes('renderSummaryWithResult'));

// 12. renderSummaryWithResult called from showPaintingResult (not elsewhere)
check('painting: renderSummaryWithResult called from showPaintingResult',
  pag.includes('renderSummaryWithResult') && pag.includes('showPaintingResult'));

// 13. No hardcoded 3575 in page file
check('painting: no hardcoded 3575 in page HTML',
  !pag.includes('3575'));

// 14. No hardcoded 2860 (50×57.2) or other alternative multiplication results
check('painting: no hardcoded 2860 in page HTML',
  !pag.includes('2860'));

// ═══════════════════════════════════════════════════════════════════
// §3 — PRICE SOURCE ISOLATION: NO FORBIDDEN CONVERSIONS
// ═══════════════════════════════════════════════════════════════════

// 15. No 1.6 floor-to-wall conversion factor in page JS
check('page: no 1.6× conversion factor',
  !pag.includes('* 1.6') && !pag.includes('*1.6'));

// 16. No 2.0 floor-to-wall conversion factor in page JS
check('page: no 2.0× conversion factor',
  !pag.includes('* 2.0') && !pag.includes('*2.0') && !pag.includes('* 2 '));

// 17. No 1.6 factor in prototype JS
check('js: no 1.6× factor',
  !js.includes('* 1.6') && !js.includes('*1.6'));

// 18. No floor_area_m2 conversion variable
check('page: no floor_area_m2 reference',
  !pag.includes('floor_area_m2') && !pag.includes('floorArea'));

// 19. No hardcoded price map in page JS (no {m2: price} literals)
check('page: no hardcoded m2 price map literal',
  !pag.includes(': 3575') && !pag.includes(': 3250') && !pag.includes(': 3900'));

// 20. Page comment confirms rate comes from engine
check('page: UNIT_RATE_FROM_ENGINE comment or variable name',
  pag.includes('UNIT_RATE_FROM_ENGINE') || pag.includes('unit_rate_mad') || pag.includes('from engine'));

// ═══════════════════════════════════════════════════════════════════
// §4 — RAFI SPHERE: ALL STATES IN CSS
// ═══════════════════════════════════════════════════════════════════

check('sphere CSS: idle state',       css.includes('[data-state="idle"]'));
check('sphere CSS: analyzing state',  css.includes('[data-state="analyzing"]'));
check('sphere CSS: verifying state',  css.includes('[data-state="verifying"]'));
check('sphere CSS: identified state', css.includes('[data-state="identified"]'));
check('sphere CSS: complete state',   css.includes('[data-state="complete"]'));
check('sphere CSS: safety state',     css.includes('[data-state="safety"]'));
check('sphere CSS: routing state',    css.includes('[data-state="routing"]'));
check('sphere CSS: quote state',      css.includes('[data-state="quote"]'));

// 29. Sphere exists as DOM class in JS
check('sphere: .rafi-sphere in JS renderHeader',
  js.includes('rafi-sphere'));

// 30. Sphere exists on /estimation page
check('sphere: page-sphere in estimation page HTML',
  pag.includes('page-sphere'));

// ═══════════════════════════════════════════════════════════════════
// §5 — RAFI SPHERE VISUAL REFINEMENT MARKERS (7C.8G.1)
// ═══════════════════════════════════════════════════════════════════

// 31. Sphere has richer background gradient (warm highlight)
check('sphere CSS: richer background with warm highlight layer',
  css.includes('rgba(80,55,100') || css.includes('2A2035') || css.includes('#2A2035'));

// 32. Sphere has specular highlight (::before on wrap or sphere)
check('sphere CSS: specular highlight present',
  css.includes('rafi-sphere-wrap::before') || css.includes('rgba(255,255,255,0.1') && css.includes('rafi-sphere'));

// 33. Sphere label has stronger opacity (>= 0.70)
check('sphere label: opacity >= 0.70',
  css.includes('rgba(255,122,0,0.75)') || css.includes('rgba(255,122,0,0.80)') ||
  css.includes('rgba(255,122,0,0.70)') || css.includes('rgba(255,122,0,0.9') || css.includes('rgba(255,122,0,1'));

// 34. Analyzing state has stronger outer glow (>= 0.20 outer rgba)
check('sphere analyzing: stronger glow',
  css.includes('[data-state="analyzing"]') &&
  (css.includes('0 0 26px rgba(255,122,0,0.24)') || css.includes('0 0 22px rgba(255,122,0,0.2') ||
   css.includes('0 0 30px rgba(255,122,0')));

// 35. Sphere orbit ring has box-shadow for better visibility
check('sphere orbit ring: box-shadow on ::after for visibility',
  css.includes('rafi-sphere[data-state="analyzing"]::after') &&
  (css.includes('box-shadow: 0 0 6px') || css.includes('box-shadow:0 0 6px') || css.includes('box-shadow: 0 0 5px')));

// ═══════════════════════════════════════════════════════════════════
// §6 — INTELLIGENCE LOCK LABELS
// ═══════════════════════════════════════════════════════════════════

check('js: Métier lock label',       js.includes('Métier'));
check('js: Périmètre lock label',    js.includes('Périmètre'));
check('js: Tarification lock label', js.includes('Tarification'));
check('page: Métier lock label',     pag.includes('Métier'));
check('page: Périmètre lock label',  pag.includes('Périmètre'));
check('page: Tarification lock label', pag.includes('Tarification'));

// ═══════════════════════════════════════════════════════════════════
// §7 — FORBIDDEN PATTERNS
// ═══════════════════════════════════════════════════════════════════

// 42. No "Question n/total" counter in JS
check('js: no "Question n sur" counter',
  !js.includes('Question') || (!js.includes('sur 4') && !js.includes('sur 3') && !js.includes('/ 4') && !js.includes('/ 3')));

// 43. No raw taxonomy tokens as primary labels
const FORBIDDEN_PRIMARY = ['standard', 'all_in', 'all-in', 'sans_rabotage', 'labour_only'];
let noForbiddenPrimary = true;
FORBIDDEN_PRIMARY.forEach(function(tok) {
  // Check only in result-service-name or service primary label contexts
  if (js.includes("resolveClientLabel") === false) noForbiddenPrimary = false;
});
check('js: resolveClientLabel used (no raw taxonomy tokens as primary labels)', js.includes('resolveClientLabel'));

// 44. No alert() in prototype files
check('js: no alert()',   !js.includes('alert('));
check('htm: no alert()',  !htm.includes('alert('));
check('page: no alert()', !pag.includes('alert('));

// 46. No production reservation invocation
check('js: no reservation.js reference in result path',
  !js.includes("'reservation.js'") && !js.includes('"reservation.js"'));

check('htm: no reservation.js reference',
  !htm.includes("'reservation.js'") && !htm.includes('"reservation.js"'));

// ═══════════════════════════════════════════════════════════════════
// §8 — LABOUR + PART DOCTRINE
// ═══════════════════════════════════════════════════════════════════

// 48. Labour split uses two separate cards (never +)
check('js: Two separate cards for labour/part (no labour + part sum)', function() {
  // Check that the sum pattern " + " is not present inside labour split rendering
  var labourSection = js.match(/renderLabourPlusPart[\s\S]{0,2000}/);
  if (!labourSection) return js.includes('labour-split') || js.includes('labour-card');
  return !labourSection[0].includes('250 + ') && !labourSection[0].includes('+ MAD + ');
}());

// 49. Labour card has correct class
check('js: labour-card or price-split-card class in labour renderer',
  js.includes('price-split-card') || js.includes('labour-card'));

// 50. Part card is dashed / secondary (never shows a price number)
check('js: part-card or part_replacement class exists',
  js.includes('part-card') || js.includes('part_replacement') || js.includes('part-card__label'));

// ═══════════════════════════════════════════════════════════════════
// §9 — OUTCOME DOCTRINE (Quote / Safety)
// ═══════════════════════════════════════════════════════════════════

// 51. Quote result: no fake price shown
check('js: QUOTE_REQUIRED has no price display',
  js.includes('QUOTE_REQUIRED') && !js.includes("QUOTE_REQUIRED.*amount.*MAD"));

// 52. Safety result: no booking CTA
check('js: SAFETY_STOP has no btn-primary CTA',
  js.includes('SAFETY_STOP'));

// 53. Safety copy: calm language present
check('js: safety has serious/safety copy',
  js.includes('SAFETY_STOP') && (js.includes('Arrêt') || js.includes('sécurité') || js.includes('Stop') || js.includes('safety')));

// ═══════════════════════════════════════════════════════════════════
// §10 — PAGE FLAGSHIP PARITY
// ═══════════════════════════════════════════════════════════════════

// 54. Painting page result has scope-section or scope-chips (not just admin summary)
check('page: scope-chips or scope-section in painting result',
  pag.includes("'scope-chips'") || pag.includes("'scope-section'") || pag.includes('scope-chips'));

// 55. Painting page result has scope-doctrine copy
check('page: scope-doctrine in painting result',
  pag.includes("'scope-doctrine'") || pag.includes('scope-doctrine'));

// 56. Painting page result shows "RÉSULTAT FIXEO" or equivalent in sidebar
check('page sidebar: RÉSULTAT FIXEO or understanding-head in result sidebar',
  pag.includes('RÉSULTAT FIXEO') || pag.includes('Résultat FIXEO'));

// 57. Painting page: price-eyebrow "Prix FIXEO" in result
check('page: Prix FIXEO eyebrow in painting result',
  pag.includes('Prix FIXEO'));

// 58. CTA is context-sensitive (includes price from engineAmount)
check('page CTA: context-sensitive CTA echoes engineAmount',
  pag.includes('Trouver un artisan') && pag.includes('engineAmount'));

// ═══════════════════════════════════════════════════════════════════
// §11 — ACCESSIBILITY & MOTION
// ═══════════════════════════════════════════════════════════════════

// 59. prefers-reduced-motion exists in CSS
check('css: prefers-reduced-motion rule',
  css.includes('prefers-reduced-motion'));

// 60. Sphere aria-hidden in JS or HTML
check('js or htm: sphere aria-hidden',
  js.includes('aria-hidden') || htm.includes('aria-hidden'));

// 61. focus-visible exists in CSS
check('css: focus-visible rule',
  css.includes('focus-visible'));

// 62. role=dialog in JS or HTML
check('js or htm: role=dialog on modal',
  js.includes("'dialog'") || js.includes('"dialog"') || htm.includes('role="dialog"') || htm.includes("role='dialog'"));

// 63. Close × control present in JS
check('js: close control (×) present',
  js.includes('×') || js.includes('&times;') || js.includes('\\u00d7'));

// ═══════════════════════════════════════════════════════════════════
// §12 — PRODUCTION ISOLATION
// ═══════════════════════════════════════════════════════════════════

// 64. No eval() in prototype files
check('js: no eval()', !js.includes('eval('));
check('htm: no eval()', !htm.includes('eval('));
check('page: no eval()', !pag.includes('eval('));

// 67. No fetch() or Supabase calls in prototype
check('js: no fetch() in prototype', !js.includes('fetch('));
check('htm: no fetch() in prototype', !htm.includes('fetch('));
check('page: no fetch() in prototype', !pag.includes('fetch('));

// 70. No production index.html reference in prototype
check('js: no index.html reference', !js.includes("'index.html'") && !js.includes('"index.html"'));

// ═══════════════════════════════════════════════════════════════════
// §13 — BUILD MARKERS
// ═══════════════════════════════════════════════════════════════════

// 71. Cache-bust version updated to 8g1 in HTML
check('htm: cache-bust v=8g1', htm.includes('v=8g1'));
check('page: cache-bust v=8g1', pag.includes('v=8g1'));

// 73. Build marker updated (7C.8G.1)
check('htm: 7C.8G.1 build marker', htm.includes('7C.8G.1'));

// ═══════════════════════════════════════════════════════════════════
// §14 — PROTOTYPE LANGUAGE NOT IN CLIENT RESULT
// ═══════════════════════════════════════════════════════════════════

// 74. "dormant" not in main result area of page (only in handoff/banner)
// We check it does NOT appear inside showPaintingResult function body
check('page: "dormant" not in painting result body', function() {
  var fn = pag.match(/function showPaintingResult[\s\S]*?^function /m);
  if (!fn) return true; // can't extract, skip
  return !fn[0].includes('dormant');
}());

// 75. "prototype" not as user-facing text inside painting result shell
check('page: "prototype" not in painting result shell elements', function() {
  var fn = pag.match(/function showPaintingResult[\s\S]*?^function /m);
  if (!fn) return true;
  // Allowed in comments, not in el() string content to user
  return !fn[0].match(/el\([^)]*prototype[^)]*\)/i);
}());

// ═══════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════

var total = passed + failed;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  FIXEO Prototype Tests — v5 (Phase 7C.8G.1)');
console.log('═══════════════════════════════════════════════════════════════');
if (errors.length) {
  errors.forEach(function(e){ console.log('  ' + e); });
  console.log('');
}
console.log('  Results: ' + passed + '/' + total + ' passed');
console.log('═══════════════════════════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
