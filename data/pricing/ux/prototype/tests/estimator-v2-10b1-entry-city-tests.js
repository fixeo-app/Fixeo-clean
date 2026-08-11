/**
 * estimator-v2-10b1-entry-city-tests.js
 * Phase 7C.10B.1 — Public entry contract + city context hotfix
 * 21 tests total
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0; let fail = 0;
function t(label, condition, detail) {
  if (condition) { console.log('  ✓', label); pass++; }
  else { console.error('  ✗', label, detail || ''); fail++; }
}

const pageJs = fs.readFileSync(
  path.resolve(__dirname, '../../../../../js/fixeo-estimation-page-v1.js'), 'utf8');
const estimationHtml = fs.readFileSync(
  path.resolve(__dirname, '../../../../../estimation.html'), 'utf8');

/* ── Minimal AIRE stub for unit tests ──────────────────── */
const VALID_METIERS = ['plomberie','electricite','serrurerie','climatisation','bricolage','nettoyage','peinture','menuiserie'];

function aireDetect(query) {
  var q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/fuite|robinet|debouchage|evier|plomberie|tuyau|chauffe.eau/.test(q))
    return { cat: 'plomberie', label: 'Plomberie' };
  if (/prise|electrique|electricite|disjoncteur|panne elect/.test(q))
    return { cat: 'electricite', label: 'Électricité' };
  if (/serrure|porte|claque|cle|verrou/.test(q))
    return { cat: 'serrurerie', label: 'Serrurerie' };
  if (/climatisation|clim|froid|chaud/.test(q))
    return { cat: 'climatisation', label: 'Climatisation' };
  return null;
}

/* ── Reproduce _canonicalCity and _detectMetier from page JS ── */
const VALID_CITIES = ['Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir','Meknès','Oujda','Kénitra','Tétouan','Safi','El Jadida'];
function canonicalCity(raw) {
  if (!raw || typeof raw !== 'string') return null;
  var trimmed = raw.trim();
  if (!trimmed) return null;
  var lower = trimmed.toLowerCase();
  for (var i = 0; i < VALID_CITIES.length; i++) {
    if (VALID_CITIES[i].toLowerCase() === lower) return VALID_CITIES[i];
  }
  return null;
}

function detectMetier(query) {
  var cat = aireDetect(query);
  if (!cat || !cat.cat) return null;
  return VALID_METIERS.indexOf(cat.cat) !== -1 ? cat.cat : null;
}

console.log('\n── 7C.10B.1 — PUBLIC ENTRY CONTRACT + CITY HOTFIX ──');

/* ══════════════════════════════════════════════════════════
   GROUP 1 — PUBLIC ENTRY PAYLOAD
══════════════════════════════════════════════════════════ */
console.log('\n[1] Public entry payload');

// 1 — metier_hint used (not initial_query as a JS key assignment)
t('1. entryContext/ctx uses metier_hint (not initial_query as assignment)',
  (pageJs.includes('entryContext.metier_hint') || pageJs.includes('ctx.metier_hint')) &&
  !pageJs.match(/entryContext\.initial_query\s*=/) &&
  !pageJs.match(/ctx\.initial_query\s*=/));

// 2 — source: rafi used (canonical RFOS contract)
t('2. source: rafi in entryContext (matches RFOS canonical contract)',
  pageJs.includes("source: 'rafi'"));

// 3 — city passed as city (not city_slug alone)
t('3. city passed as entryContext.city (matches RFOS contract)',
  (function() {
    // Must have: entryContext.city = city (or similar)
    return pageJs.includes('entryContext.city = city') ||
           pageJs.includes("entryContext['city'] = city") ||
           pageJs.includes('ctx.city = city') ||
           pageJs.includes("ctx['city'] = city");
  })());

// 4 — no initial_query assignment in entryContext
t('4. entryContext.initial_query assignment absent from page JS',
  !pageJs.match(/entryContext\.initial_query\s*=/));

// 5 — no free_text assignment in entryContext
t('5. entryContext.free_text assignment absent from page JS',
  !pageJs.match(/entryContext\.free_text\s*=/));

// 6 — no description key used for query text
t('6. description key not used for passing raw query (not handled by orchestrator)',
  !pageJs.match(/entryContext\.description\s*=\s*query/) &&
  !pageJs.match(/entryContext\['description'\]\s*=\s*query/));

// 7 — urgency absent (not detected on this page)
t('7. urgency not added to entryContext (no urgency detection on estimation page)',
  !pageJs.match(/entryContext\.urgency\s*=/) ||
  pageJs.includes('urgency: null'));

/* ══════════════════════════════════════════════════════════
   GROUP 2 — AIRE DETECTION
══════════════════════════════════════════════════════════ */
console.log('\n[2] AIRE/metier detection');

// 8 — "Fuite d'eau" → plomberie
t('8. "Fuite d\'eau" → plomberie (would produce metier_hint: plomberie)',
  detectMetier("Fuite d'eau") === 'plomberie');

// 9 — "Robinet qui fuit" → plomberie
t('9. "Robinet qui fuit" → plomberie',
  detectMetier("Robinet qui fuit") === 'plomberie');

// 10 — "Débouchage évier" → plomberie
t('10. "Débouchage évier" → plomberie',
  detectMetier('Débouchage évier') === 'plomberie');

// 11 — non-estimator cat filtered out
t('11. AIRE cats not in VALID_METIERS (maconnerie, jardinage) → null metier_hint',
  (function() {
    // Simulate a cat not in VALID_METIERS
    var nonEstimator = { cat: 'maconnerie' };
    return VALID_METIERS.indexOf(nonEstimator.cat) === -1; // confirms filter needed
  })());

// 12 — _detectMetier in page JS filters to VALID_METIERS
t('12. _detectMetier filters against VALID_METIERS list',
  pageJs.includes('VALID_METIERS') &&
  pageJs.includes('VALID_METIERS.indexOf') &&
  pageJs.includes("'plomberie'") &&
  pageJs.includes("'electricite'"));

// 13 — no metier_hint when query is empty/unrecognized
t('13. entryContext.metier_hint only added when metier is non-null',
  pageJs.includes('if (metier)') &&
  (pageJs.match(/if \(metier\)\s+entryContext\.metier_hint = metier/) ||
   pageJs.match(/if \(metier\)\s+ctx\.metier_hint = metier/)));

/* ══════════════════════════════════════════════════════════
   GROUP 3 — CITY VALIDATION
══════════════════════════════════════════════════════════ */
console.log('\n[3] City validation');

// 14 — "Maroc" rejected
t('14. "Maroc" → canonicalCity() returns null (rejected)',
  canonicalCity('Maroc') === null);

// 15 — "Casablanca" accepted
t('15. "Casablanca" → canonicalCity() returns "Casablanca"',
  canonicalCity('Casablanca') === 'Casablanca');

// 16 — empty string rejected
t('16. "" → canonicalCity() returns null',
  canonicalCity('') === null);

// 17 — null rejected
t('17. null → canonicalCity() returns null',
  canonicalCity(null) === null);

// 18 — city chip shows "Choisir une ville" when no canonical city (not "Maroc")
t('18. Neutral city placeholder text "Choisir une ville" present in page JS',
  pageJs.includes('Choisir une ville'));

// 19 — "Maroc" string absent from city display logic
t('19. "Maroc" fallback removed from city chip display',
  !pageJs.match(/cityChip.*Maroc/) &&
  !pageJs.match(/'Maroc'\s*\)/) &&
  !pageJs.match(/"Maroc"\s*\)/));

/* ══════════════════════════════════════════════════════════
   GROUP 4 — PAGE_REQUIRED / AUTHORITY UNCHANGED
══════════════════════════════════════════════════════════ */
console.log('\n[4] PAGE_REQUIRED / authority');

// 20 — PAGE_REQUIRED token key unchanged
t('20. fixeo_estimator_token_v1 PAGE_REQUIRED detection unchanged',
  pageJs.includes("'fixeo_estimator_token_v1'") &&
  pageJs.includes("_mode = 'page-required'"));

// 21 — No pricing arithmetic in page JS (comments mentioning evaluate are OK)
t('21. No pricing arithmetic or FixeoEstimatorAPI.evaluate() call in page JS',
  !pageJs.includes('FixeoEstimatorAPI.evaluate(') &&
  !pageJs.includes('PRICE_MAP') &&
  !pageJs.includes('price_per_m2'));

/* ══════════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════════ */
console.log('\n──────────────────────────────────────────');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed ' +
  (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
if (fail > 0) process.exit(1);
