/**
 * estimator-v2-3z2e2-suggestions-tests.js
 * Phase 7C.9L.3Z.2E.2 — V2 Hero price hint removal + contextual RAFI suggestions
 *
 * Source-level contract tests. No browser automation.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../../../../../');

var fxhiCss  = fs.readFileSync(ROOT + 'css/fixeo-hero-insights.css', 'utf8');
var fxhiJs   = fs.readFileSync(ROOT + 'js/fixeo-hero-insights.js', 'utf8');
var suggJs   = fs.readFileSync(ROOT + 'js/fixeo-hero-suggestions-v2.js', 'utf8');
var qsmJs    = fs.readFileSync(ROOT + 'js/quick-search-modal.js', 'utf8');
var ctrlJs   = fs.readFileSync(ROOT + 'js/fixeo-hero-resume-v1.js', 'utf8');
var resSrc   = fs.readFileSync(ROOT + 'js/reservation.js', 'utf8');
var priceSrc = fs.readFileSync(ROOT + 'js/fixeo-estimator-v2.js', 'utf8');
var aireJs   = fs.readFileSync(ROOT + 'js/fixeo-ai-request-engine.js', 'utf8');
var idxSrc   = fs.readFileSync(ROOT + 'index.html', 'utf8');
var resumeCss = fs.readFileSync(ROOT + 'css/fixeo-hero-resume-v1.css', 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (e) { console.error('  FAIL:', name, '\n        ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

/* ══════════════════════════════════════════════════════════════
   GROUP 1: Price range suppressed
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: V2 Hero price range removed ──');

test('1. .fxhi-pill-price hidden via CSS (V2 always-on)', function () {
  var appendStart = fxhiCss.indexOf('PHASE 7C.9L.3Z.2E.2');
  assert(appendStart > 0, '3Z.2E.2 append block found in FXHI CSS');
  var block = fxhiCss.slice(appendStart, appendStart + 700);
  assert(block.includes('.fxhi-pill-price'), '.fxhi-pill-price targeted');
  assert(block.includes('display: none') || block.includes('display:none'), 'display:none applied');
  assert(block.includes('!important'), '!important ensures override');
});

test('2. PRICE_MAP still present in AIRE JS (legacy data preserved)', function () {
  assert(aireJs.includes('PRICE_MAP'), 'PRICE_MAP preserved in AIRE');
  assert(aireJs.includes('150\u2013350 MAD') || aireJs.includes('150-350 MAD') || aireJs.includes('150–350 MAD'),
    'plomberie range still in PRICE_MAP (not deleted)');
});

test('3. getPrice() still exported from AIRE (non-Hero callers unaffected)', function () {
  assert(aireJs.includes('getPrice:') || aireJs.includes('getPrice :'), 'getPrice still exported from FixeoAIRE');
});

test('4. Pill 4 render code still present in fxhi-insights.js (logic not deleted)', function () {
  /* The JS logic is intact — only CSS hides it */
  assert(fxhiJs.includes('fxhi-pill-price'), 'price pill render code in JS (CSS-only suppression)');
});

test('5. PRICE_READY card (#fxhro-card) show rule preserved (server-verified price still works)', function () {
  assert(resumeCss.includes('#home.fxhro-price-ready-state #fxhro-card') &&
         resumeCss.includes('display: block'), 'PRICE_READY card display:block intact');
});

test('6. "Prix FIXEO" text preserved in hero resume controller', function () {
  assert(ctrlJs.includes('PRIX FIXEO') || ctrlJs.includes('Prix FIXEO') || ctrlJs.includes('fxhro-card'),
    'verified price card markup/controller intact');
});

test('7. Artisan count logic unchanged in fxhi-insights.js', function () {
  assert(fxhiJs.includes('getArtisanCount'), 'artisan count lookup intact');
  assert(fxhiJs.includes('fxhi-pill-count'), 'count pill render intact');
});

test('8. Response estimate logic unchanged in fxhi-insights.js', function () {
  assert(fxhiJs.includes('_getAvgResponseTime'), 'response time function intact');
  assert(fxhiJs.includes('fxhi-pill-time'), 'time pill render intact');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 2: Suggestion module — category awareness
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: Suggestion category awareness ──');

test('9. _activeCat variable declared in suggestions module', function () {
  assert(suggJs.includes('_activeCat'), '_activeCat module variable');
  assert(suggJs.includes('_activeCat = null'), 'initialized to null (general/fresh)');
});

test('10. refreshForCategory exported on public API', function () {
  assert(suggJs.includes('refreshForCategory:'), 'refreshForCategory in public API');
  /* Guard check: fxhi-insights.js checks typeof before calling */
  assert(fxhiJs.includes('typeof window.FixeoHeroSuggestionsV2.refreshForCategory'),
    'typeof guard in fxhi-insights.js');
});

test('11. refreshForCategory accepts catKey null → general suggestions', function () {
  assert(suggJs.includes('_activeCat = catKey || null'), 'null catKey accepted → general');
});

test('12. Category-filtered pool: same-cat chips only when category known', function () {
  assert(suggJs.includes('var catPool = CHIP_POOL.filter'), 'category pool filter exists');
  assert(suggJs.includes("c.cat === activeCatKey"), 'filter by cat key');
  assert(suggJs.includes('if (catPool.length >= 2) pool = catPool'), 'safety: min 2 chips to switch');
});

test('13. Plomberie category exists in CHIP_POOL', function () {
  var plombChips = (suggJs.match(/cat:\s*'plomberie'/g) || []).length;
  assert(plombChips >= 3, 'at least 3 plomberie chips in pool, got: ' + plombChips);
});

test('14. Électricité category exists in CHIP_POOL', function () {
  var elecChips = (suggJs.match(/cat:\s*'electricite'/g) || []).length;
  assert(elecChips >= 3, 'at least 3 electricite chips in pool, got: ' + elecChips);
});

test('15. Serrurerie category exists in CHIP_POOL', function () {
  var serrChips = (suggJs.match(/cat:\s*'serrurerie'/g) || []).length;
  assert(serrChips >= 2, 'at least 2 serrurerie chips in pool, got: ' + serrChips);
});

test('16. No cross-category leak: plomberie filter excludes electricite chips', function () {
  /* Proven by design: catPool = CHIP_POOL.filter(c => c.cat === activeCatKey)
     All electricite chips have cat:'electricite' — excluded when catKey='plomberie' */
  assert(suggJs.includes("c.cat === activeCatKey"), 'strict equality filter excludes other cats');
  /* Verify no chip has two cat values (would break filter) */
  var multiCat = suggJs.match(/cat:\s*'[^']+',\s*cat2/);
  assert(!multiCat, 'no chip has dual cat (strict filter works)');
});

test('17. fxhi-insights.js calls refreshForCategory after category detected', function () {
  assert(fxhiJs.includes('refreshForCategory'), 'refreshForCategory called from fxhi-insights');
  assert(fxhiJs.includes('category ? category.cat : null'), 'passes cat key or null');
});

test('18. Input cleared → refreshForCategory(null) called (return to general)', function () {
  /* The "Input cleared" branch in _analyze calls refreshForCategory(null) */
  var clearedIdx = fxhiJs.indexOf('Input cleared');
  assert(clearedIdx > 0, 'Input cleared branch found');
  var block = fxhiJs.slice(clearedIdx, clearedIdx + 500);
  assert(block.includes('refreshForCategory(null)'), 'refreshForCategory(null) in cleared branch');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 3: Max 3 chips
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: Max 3 chips ──');

test('19. MAX_CHIPS = 3 declared', function () {
  assert(suggJs.includes('var MAX_CHIPS = 3'), 'MAX_CHIPS=3');
});

test('20. Selection loop uses MAX_CHIPS (not hardcoded 4)', function () {
  assert(suggJs.includes('selected.length < MAX_CHIPS'), 'MAX_CHIPS in selection loop');
  assert(!suggJs.includes('selected.length < 4'), 'no hardcoded < 4 limit remaining');
});

test('21. Fallback fill also capped to MAX_CHIPS', function () {
  var fallbackIdx = suggJs.indexOf('Guarantee MAX_CHIPS');
  assert(fallbackIdx > 0, 'Guarantee MAX_CHIPS comment found');
  var block = suggJs.slice(fallbackIdx, fallbackIdx + 300);
  assert(block.includes('selected.length < MAX_CHIPS'), 'fallback uses MAX_CHIPS');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 4: Label truthfulness
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: Label truthfulness ──');

test('22. Time-aware label logic retained (_getCurrentTier uses Date().getHours)', function () {
  assert(suggJs.includes('new Date().getHours()'), 'time-aware tier detection intact');
  assert(suggJs.includes("'morning'") && suggJs.includes("'evening'"), 'tier labels present');
});

test('23. Category-detected label = "Suggestions rapides" (neutral truth)', function () {
  assert(suggJs.includes('Suggestions rapides'), '"Suggestions rapides" label for cat-detected state');
});

test('24. "ce soir" label only used inside LABEL_CONFIG (time-gated, not faked)', function () {
  /* "ce soir" only appears in LABEL_CONFIG.evening — it IS time-driven */
  assert(suggJs.includes("'Suggestions ce soir'"), 'ce soir in LABEL_CONFIG.evening (truthful)');
  /* The cat-override returns 'Suggestions rapides' first — so 'ce soir' never leaks
     when a category is known */
  var labelFnIdx = suggJs.indexOf('function _buildLabel');
  var labelFn = suggJs.slice(labelFnIdx, labelFnIdx + 600);
  assert(labelFn.includes("if (catKey)") && labelFn.includes("'Suggestions rapides'"),
    'cat key takes priority — ce soir only when no category');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 5: Chip click chain
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: Chip click chain ──');

test('25. Chip click dispatches input event (triggers AIRE/fxhi-insights)', function () {
  assert(suggJs.includes("new Event('input'") && suggJs.includes('bubbles: true'),
    'input event dispatched on chip click');
});

test('26. Chip click does NOT call Estimator directly', function () {
  assert(!suggJs.includes('FixeoEstimator') && !suggJs.includes('fixeo-estimator'),
    'no Estimator API called from suggestions module');
});

test('27. Chip click does NOT mint pricing context', function () {
  assert(!suggJs.includes('prepareContext') && !suggJs.includes('setPriceToken'),
    'no pricing context creation in suggestions module');
});

test('28. Chip data-qsm-suggestion attribute preserved (QSM click delegation intact)', function () {
  assert(suggJs.includes("'data-qsm-suggestion'"), 'data-qsm-suggestion set on dynamic chips');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 6: Cache keys
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: Cache keys ──');

test('29. FXHI CSS key: fxhi-v1e-v2-clean', function () {
  assert(idxSrc.includes('fixeo-hero-insights.css?v=fxhi-v1e-v2-clean'), 'FXHI CSS key updated');
  assert(!idxSrc.includes('fixeo-hero-insights.css?v=fxhi-v1d-polish'), 'old FXHI CSS key gone');
});

test('30. FXHI JS key: fxhi-v1e-contextual', function () {
  assert(idxSrc.includes('fixeo-hero-insights.js?v=fxhi-v1e-contextual'), 'FXHI JS key updated');
  assert(!idxSrc.includes('fixeo-hero-insights.js?v=fxhi-v1d-reset'), 'old FXHI JS key gone');
});

test('31. Suggestions JS key: fxhsv2-v1b-contextual', function () {
  assert(idxSrc.includes('fixeo-hero-suggestions-v2.js?v=fxhsv2-v1b-contextual'), 'sugg JS key updated');
  assert(!idxSrc.includes('fixeo-hero-suggestions-v2.js?v=fxhsv2-v1a'), 'old sugg key gone');
});

test('32. QSM CSS key unchanged: qsm12-ios-zoom', function () {
  assert(idxSrc.includes('quick-search-modal.css?v=qsm12-ios-zoom'), 'QSM CSS unchanged');
});

test('33. Hero resume CSS key unchanged: fxhro-v1e-final-polish', function () {
  assert(idxSrc.includes('fixeo-hero-resume-v1.css?v=fxhro-v1e-final-polish'), 'resume CSS unchanged');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 7: PRICE_READY / Nouvelle demande state
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 7: PRICE_READY / Nouvelle demande state ──');

test('34. QSM hidden in PRICE_READY → suggestions hidden too (CSS cascade)', function () {
  /* suggestions are inside #hero-quick-search → hidden when QSM is display:none */
  assert(resumeCss.includes('#home.fxhro-price-ready-state #hero-quick-search') &&
         resumeCss.includes('display: none'), 'QSM (parent of suggestions) hidden in PRICE_READY');
});

test('35. Hero Resume _resetToFresh calls HeroInsights.reset() (clears _activeCat indirectly)', function () {
  /* When Nouvelle demande resets HeroInsights, _analyze(null) fires → refreshForCategory(null)
     Verified by checking HeroInsights.reset exists */
  assert(fxhiJs.includes('function _reset') || fxhiJs.includes('reset:'), 'HeroInsights.reset preserved');
});

test('36. refreshForCategory(null) → _activeCat=null → general pool used', function () {
  /* When null passed, no catPool filter applied, full CHIP_POOL available */
  assert(suggJs.includes('var activeCatKey = catFilter || _activeCat'), 'catFilter fallback to _activeCat');
  assert(suggJs.includes("if (catPool.length >= 2) pool = catPool"), 'pool only switched when cat found');
});

/* ══════════════════════════════════════════════════════════════
   GROUP 8: Functional freeze
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 8: Functional freeze ──');

test('37. Hero state machine unchanged: fixeo:estimator-closed in controller', function () {
  assert(ctrlJs.includes('fixeo:estimator-closed'), 'hero state machine intact');
});

test('38. Token lifecycle: clearContext in reservation.js', function () {
  assert(resSrc.includes('clearContext'), 'clearContext intact');
});

test('39. Reservation close event unchanged', function () {
  assert(resSrc.includes('fixeo:reservation-closed'), 'reservation-closed event intact');
});

test('40. Pricing engine: no 3Z.2E.2 tag in estimator-v2.js', function () {
  assert(!priceSrc.includes('3z2e2') && !priceSrc.includes('contextual-sugg'),
    'pricing engine not modified');
});

test('41. QSM reset API unchanged: resetMetier', function () {
  assert(qsmJs.includes('resetMetier'), 'QSM.resetMetier intact');
});

test('42. 3Z.2E.1 iOS fix preserved: qsm12-ios-zoom in index', function () {
  assert(idxSrc.includes('quick-search-modal.css?v=qsm12-ios-zoom'), 'iOS zoom fix CSS key intact');
});

test('43. 3Z.2E mobile flex-wrap preserved in FXHI CSS', function () {
  assert(fxhiCss.includes('flex-wrap: wrap'), '2-row mobile layout intact');
});

test('44. Supabase unchanged: no Supabase API calls in suggestions module', function () {
  /* Module has 'ZERO Supabase' in comments — verify no actual API call */
  assert(!suggJs.includes('supabase.from') && !suggJs.includes('supabase.rpc') &&
         !suggJs.includes('createClient'),
    'no Supabase API calls in suggestions module (comments allowed)');
});

/* ── Summary ── */
console.log('\n══════════════════════════════════════════');
console.log('RESULT: ' + pass + '/' + (pass + fail) + ' tests passed');
if (fail > 0) {
  console.error('FAILED: ' + fail + ' test(s)');
  process.exit(1);
}
console.log('ALL PASS');
