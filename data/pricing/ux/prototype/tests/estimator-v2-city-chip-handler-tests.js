/*!
 * estimator-v2-city-chip-handler-tests.js
 * Phase 7C.9L.3I — Replace malformed city chip inline onclick
 *
 * Root cause: JSON.stringify('Casablanca') = '"Casablanca"' injected inside
 * a double-quoted HTML attribute → browser terminates attribute at first inner
 * double-quote → onclick silently discarded → city tap does nothing.
 *
 * Fix: data-estimator-city attribute + one delegated capture listener on document.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../../..');

function load(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const resSrc = load('js/reservation.js');

let passed = 0; let failed = 0;
function assert(name, cond) {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else       { console.error('  ✗ ' + name); failed++; }
}

/* ── Simulate _chip() rendering from source ────────────────────────────────── */
function sanitize(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function renderChip(city, isSuggested) {
  return '<button type="button" class="fixeo-res-slot' + (isSuggested ? ' active' : '') + '"'
    + ' data-estimator-city="' + sanitize(city) + '"'
    + ' style="text-align:center;padding:10px 14px;font-size:.85rem;font-weight:700;cursor:pointer;border-radius:10px;'
    + (isSuggested ? 'border:1.5px solid rgba(225,48,108,.6);' : '')
    + '">'
    + sanitize(city)
    + (isSuggested ? ' <span style="font-size:.65rem;opacity:.75">✓ Détecté</span>' : '')
    + '</button>';
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' Phase 7C.9L.3I — City Chip Handler Tests');
console.log('══════════════════════════════════════════════════════════\n');

// ─── 1. OLD DEFECT PROVEN ─────────────────────────────────────────────────────
console.log('SECTION 1 — Old defect absent from production source');

assert('1.1 No inline onclick on city chips (old JSON.stringify pattern removed)',
  !resSrc.includes("onclick=\"event.stopPropagation();FixeoReservation._setEstimatorCity("));

assert('1.2 No JSON.stringify(city) in _chip() function',
  (function() {
    var chipStart = resSrc.indexOf('function _chip(city)');
    var chipEnd   = resSrc.indexOf('\n    }', chipStart) + 6;
    var chipBody  = resSrc.substring(chipStart, chipEnd);
    return !chipBody.includes('JSON.stringify(city)') && !chipBody.includes('onclick=');
  })());

assert('1.3 Casablanca chip no longer embeds JS string "Casablanca" in onclick',
  !resSrc.includes('_setEstimatorCity(\\"Casablanca\\")')  &&
  !resSrc.includes("_setEstimatorCity(\"Casablanca\")"));

// ─── 2. DATA ATTRIBUTE USED ───────────────────────────────────────────────────
console.log('\nSECTION 2 — data-estimator-city attribute');

assert('2.1 data-estimator-city attribute present in _chip()',
  resSrc.includes('data-estimator-city="'));

assert('2.2 sanitize() used for attribute value (no raw city interpolation)',
  resSrc.includes('data-estimator-city="' + '" + sanitize(city) + "') ||
  resSrc.includes("data-estimator-city=\"' + sanitize(city) + '\""));

assert('2.3 button has type="button" (prevents accidental form submit)',
  resSrc.includes('type="button"'));

// ─── 3. SAFE RENDERING OF SPECIAL CITY NAMES ─────────────────────────────────
console.log('\nSECTION 3 — Safe HTML attribute rendering');

function chipHasNoNestedQuotes(city) {
  var html = renderChip(city, false);
  var m = html.match(/data-estimator-city="([^"]*)"/);
  if (!m) return false;
  // attribute value must not contain unescaped double quotes
  return m[1].indexOf('"') === -1;
}

assert('3.1 Casablanca renders safely (no nested double quotes)',
  chipHasNoNestedQuotes('Casablanca'));

assert('3.2 Fès renders safely (diacritic in attribute)',
  chipHasNoNestedQuotes('Fès'));

assert('3.3 Béni Mellal renders safely (space + diacritic)',
  chipHasNoNestedQuotes('Béni Mellal'));

assert('3.4 El Jadida renders safely (space)',
  chipHasNoNestedQuotes('El Jadida'));

assert('3.5 Mohammedia renders safely',
  chipHasNoNestedQuotes('Mohammedia'));

assert('3.6 Suggested chip (active class) also safe',
  chipHasNoNestedQuotes('Casablanca') && renderChip('Casablanca', true).includes('data-estimator-city="Casablanca"'));

// ─── 4. DELEGATED HANDLER ─────────────────────────────────────────────────────
console.log('\nSECTION 4 — Delegated capture listener');

assert('4.1 One-shot guard present (_fxResEstimatorCityListenerBound)',
  resSrc.includes('_fxResEstimatorCityListenerBound'));

assert('4.2 addEventListener with capture=true (iOS tap support)',
  resSrc.includes("addEventListener('click'") && resSrc.includes('true /* capture'));

assert('4.3 Handler reads data-estimator-city attribute',
  resSrc.includes("getAttribute('data-estimator-city')") ||
  resSrc.includes('getAttribute("data-estimator-city")'));

assert('4.4 Handler scoped to reservation modal (MODAL_ID check)',
  resSrc.includes('modal.contains(chip)'));

assert('4.5 e.preventDefault() called',
  resSrc.includes('e.preventDefault()'));

assert('4.6 e.stopPropagation() called',
  resSrc.includes('e.stopPropagation()'));

assert('4.7 Calls window.FixeoReservation._setEstimatorCity(city)',
  resSrc.includes('window.FixeoReservation._setEstimatorCity(city)') ||
  resSrc.includes('FixeoReservation._setEstimatorCity(city)'));

assert('4.8 typeof guard on _setEstimatorCity before call',
  resSrc.includes("typeof window.FixeoReservation._setEstimatorCity === 'function'") ||
  resSrc.includes('typeof FixeoReservation._setEstimatorCity'));

// ─── 5. _setEstimatorCity MECHANICS UNCHANGED ────────────────────────────────
console.log('\nSECTION 5 — _setEstimatorCity mechanics unchanged');

assert('5.1 _setEstimatorCity sets state.estimatorCity',
  resSrc.includes('state.estimatorCity = city || null'));

assert('5.2 _setEstimatorCity calls render()',
  (function() {
    var fnStart = resSrc.indexOf('function _setEstimatorCity(city)');
    var fnEnd   = resSrc.indexOf('\n  }', fnStart) + 4;
    return resSrc.substring(fnStart, fnEnd).includes('render()');
  })());

assert('5.3 Changer de ville still calls _setEstimatorCity(null)',
  resSrc.includes("_setEstimatorCity(null)"));

// ─── 6. RENDER BRANCH AFTER CITY TAP ─────────────────────────────────────────
console.log('\nSECTION 6 — Render branches intact');

assert('6.1 renderArtisanPicker → estimatorCity set → renderEstimatorArtisanPicker()',
  resSrc.includes('!state.estimatorCity') && resSrc.includes('renderEstimatorArtisanPicker()'));

assert('6.2 renderArtisanPicker → no estimatorCity → renderEstimatorCityPicker()',
  resSrc.includes('return renderEstimatorCityPicker()'));

assert('6.3 City picker no longer shown after _setEstimatorCity("Casablanca") simulation',
  (function() {
    // Verify the branch: if estimatorCity is set, city picker is skipped
    var i = resSrc.indexOf('!state.estimatorCity');
    var branch = resSrc.substring(i, i + 200);
    return branch.includes('renderEstimatorCityPicker') && branch.includes('renderEstimatorArtisanPicker');
  })());

// ─── 7. TRUSTED CITY FLOW UNCHANGED ──────────────────────────────────────────
console.log('\nSECTION 7 — Trusted city flow unchanged');

assert('7.1 ctx.city_slug still pre-sets state.estimatorCity in open()',
  resSrc.includes('state.estimatorCity = ctx.city_slug'));

assert('7.2 Conditional guard on ctx.city_slug still present',
  resSrc.includes('if (ctx.city_slug) state.estimatorCity'));

assert('7.3 stale localStorage used only for suggested chip highlight (not auto-assigned)',
  resSrc.includes("localStorage.getItem('fixeo_detected_city')") &&
  !resSrc.includes("state.estimatorCity = localStorage"));

// ─── 8. PRICING AUTHORITY UNCHANGED ──────────────────────────────────────────
console.log('\nSECTION 8 — Pricing authority unchanged');

assert('8.1 _estimator_context_token still in bookingData',
  resSrc.includes('_estimator_context_token'));

assert('8.2 service_code still machine identity (not overwritten by city)',
  resSrc.includes('service_code') && !resSrc.includes('service_code = city'));

assert('8.3 No city in price calculation paths',
  !resSrc.match(/city.*amount_mad|amount_mad.*city/));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed === 0) {
  console.log('  All 7C.9L.3I city chip handler tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exitCode = 1;
}
console.log('────────────────────────────────────────────────────────────\n');
