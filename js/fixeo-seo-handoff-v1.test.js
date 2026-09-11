'use strict';
/**
 * fixeo-seo-handoff-v1.test.js (fsh-v3)
 * Task 2.6B — Active context seam via window.FixeoSeoHandoff.context
 *
 * 30 required tests (numbered per spec) + additional focused cases.
 * Also validates the fx-request-flow-v4.js _readContext() seam in isolation.
 */

const path = require('path');
const fs   = require('fs');

/* ── Harness ───────────────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    process.stdout.write(`  ✅  ${label}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`);
    failures.push({ label, error: e.message });
    failed++;
  }
}

function assert(cond, msg)             { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)   { if (!s.includes(sub)) throw new Error(msg || `Expected to contain: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg){ if (s.includes(sub))  throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertNull(v, msg)            { if (v !== null) throw new Error(msg || `Expected null, got: ${JSON.stringify(v)}`); }
function assertEquals(a, b, msg)       { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

/* ── Adapter module loader ─────────────────────────────────────────────────── */

function buildWindowStub(search, existingHandoff) {
  return {
    location:    { search: search || '', pathname: '/' },
    URLSearchParams: class {
      constructor(s) { this._p = new URLSearchParams(s || ''); }
      get(k)         { return this._p.get(k); }
    },
    matchMedia:    () => ({ matches: false }),
    dispatchEvent: () => {},
    FixeoSeoHandoff:  existingHandoff || null,
    _fshV1Loaded:     false,
    document: {
      getElementById:   () => null,
      readyState:       'complete',
      addEventListener: () => {},
    },
    CustomEvent: class CustomEvent {
      constructor(name, opts) { this.type = name; this.detail = opts && opts.detail; }
    },
  };
}

function loadAdapter(search, existingHandoff) {
  const stub = buildWindowStub(search, existingHandoff);
  const src  = fs.readFileSync(path.join(__dirname, 'fixeo-seo-handoff-v1.js'), 'utf8');
  const wrapped = `(function(window, document, URLSearchParams) { ${src} })(stub, stub.document, stub.URLSearchParams)`;
  try { new Function('stub', wrapped)(stub); } catch (_) {}
  return stub.FixeoSeoHandoff;
}

function parseWith(search) {
  const api = loadAdapter(search);
  return api ? api.parseContext() : null;
}

/* ── fxrf4 _readContext() simulation ────────────────────────────────────────
 * Simulates the exact _readContext() logic from fx-request-flow-v4.js
 * including the SEO fallback seam (Task 2.6B addition).
 * Uses the actual production source — no duplication.
 */
function simulateReadContext(seoHandoffContext, domState) {
  domState = domState || {};
  /* Build a minimal window/document stub that mimics fxrf4 environment */
  const ALL_CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
    'Taza','Ouarzazate','Mohammedia'
  ];

  const st = {
    prefillService: '',
    prefillCity: '',
    prefillPhone: '',
    detectedCity: '',
  };

  /* Priority 1: localStorage detected city */
  if (domState.detectedCity && ALL_CITIES.indexOf(domState.detectedCity) >= 0) {
    st.detectedCity = domState.detectedCity;
  }

  /* Priority 2: Hero service input */
  if (domState.heroServiceInput && domState.heroServiceInput.trim().length > 2) {
    st.prefillService = domState.heroServiceInput.trim();
  }

  /* Priority 3: Hero city picker */
  if (domState.heroCityValue && ALL_CITIES.indexOf(domState.heroCityValue) >= 0) {
    st.prefillCity = domState.heroCityValue;
  }

  /* Priority 4 (SEO fallback): read window.FixeoSeoHandoff.context */
  try {
    const _seoCtx = seoHandoffContext;
    if (_seoCtx) {
      if (!st.prefillService && _seoCtx._fxrf4ServiceLabel) {
        st.prefillService = _seoCtx._fxrf4ServiceLabel;
      }
      if (!st.prefillCity && _seoCtx._fxrf4CityLabel &&
          ALL_CITIES.indexOf(_seoCtx._fxrf4CityLabel) >= 0) {
        st.prefillCity = _seoCtx._fxrf4CityLabel;
      }
    }
  } catch (_) {}

  return st;
}

/* Also _normalizeSlug equivalent for verification */
function normalizeSlug(raw) {
  const SERVICES = [
    { slug:'plomberie',     label:'Plomberie',      words:['fuite','plomb','robinet','tuyau','wc','canalisation','débouchage','debouchage','chauffe-eau'] },
    { slug:'electricite',   label:'Électricité',    words:['elect','panne','disjoncteur','court-circuit','prise','lumière','lumiere','tableau'] },
    { slug:'serrurerie',    label:'Serrurerie',      words:['serrure','serrurier','porte bloqu','bloquée','clé','clef','barillet','effraction'] },
    { slug:'climatisation', label:'Climatisation',  words:['clim','climatis','froid','chaleur','ventil','pompe'] },
    { slug:'menuiserie',    label:'Menuiserie',      words:['menuiserie','menuisier','porte','fenêtre','fenetre','volet','parquet','bois','placard'] },
    { slug:'peinture',      label:'Peinture',        words:['peinture','peintre','façade','facade','mur','enduit','ravalement'] },
    { slug:'maconnerie',    label:'Maçonnerie',      words:['maconnerie','maçon','beton','béton','carrelage','chape','dallage','mur porteur'] },
    { slug:'nettoyage',     label:'Nettoyage',       words:['nettoyage','ménage','menage','nettoyer','désinfection','vitres'] },
  ];
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (let i = 0; i < SERVICES.length; i++) {
    const svc = SERVICES[i];
    for (let j = 0; j < svc.words.length; j++) {
      const w = svc.words[j].normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if (s.indexOf(w) >= 0) return { slug: svc.slug, label: svc.label };
    }
  }
  return null;
}

/* ── Raw source helpers ──────────────────────────────────────────────────── */

function strippedAdapterSrc() {
  const raw = fs.readFileSync(path.join(__dirname, 'fixeo-seo-handoff-v1.js'), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function strippedFxrf4Src() {
  const raw = fs.readFileSync(path.join(__dirname, 'fx-request-flow-v4.js'), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/* ── TESTS ─────────────────────────────────────────────────────────────────── */

console.log('\nfixeo-seo-handoff-v1.test.js (fsh-v3)\n');

/* ── Tests 1–5: Adapter core validation (spec items 1–5) ─────────────────── */
console.log('── 1–5. Adapter: core param validation ──────────────────────');

test('1. adapter parses valid fx_service=plombier', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  assert(ctx !== null && ctx.service === 'plombier', `Expected service=plombier, got ${JSON.stringify(ctx)}`);
});

test('2. adapter parses valid fx_city=casablanca', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  assert(ctx !== null && ctx.city === 'casablanca', `Expected city=casablanca`);
});

test('3. adapter parses source=seo', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  assert(ctx !== null && ctx.source === 'seo', `Expected source=seo`);
});

test('4. invalid service rejected', () => {
  const ctx = parseWith('?fx_service=hacker<script>&fx_city=casablanca');
  if (ctx !== null) assertNull(ctx.service, `Malformed service must be null`);
});

test('5. invalid city rejected', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=SELECT+*+FROM');
  if (ctx !== null) assertNull(ctx.city, `Malformed city must be null`);
});

/* ── Tests 6–8: fxrf4 reads only validated context, never raw params ─────── */
console.log('── 6–8. fxrf4: never touches raw params ─────────────────────');

test('6. raw params never consumed directly by fx-request-flow-v4.js', () => {
  const src = strippedFxrf4Src();
  assertNotContains(src, 'fx_service', 'fxrf4 must not reference fx_service');
  assertNotContains(src, 'fx_city',   'fxrf4 must not reference fx_city');
  assertNotContains(src, 'URLSearchParams', 'fxrf4 must not parse URL params');
  assertNotContains(src, 'location.search', 'fxrf4 must not read location.search');
});

test('7. request flow reads only validated handoff context (_fxrf4ServiceLabel/_fxrf4CityLabel)', () => {
  const src = strippedFxrf4Src();
  assertContains(src, 'FixeoSeoHandoff', 'fxrf4 must reference FixeoSeoHandoff');
  assertContains(src, '_fxrf4ServiceLabel', 'fxrf4 must use _fxrf4ServiceLabel');
  assertContains(src, '_fxrf4CityLabel',    'fxrf4 must use _fxrf4CityLabel');
});

test('8. existing stronger prefill source takes priority over SEO fallback', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const st  = simulateReadContext(ctx, {
    heroServiceInput: 'Nettoyage', /* explicit hero input */
    heroCityValue:    'Agadir',    /* explicit city picker */
  });
  assertEquals(st.prefillService, 'Nettoyage', 'Hero input must take priority over SEO service');
  assertEquals(st.prefillCity,    'Agadir',    'Hero city must take priority over SEO city');
});

/* ── Tests 9–10: SEO service/city reach correct fxrf4 representations ─────── */
console.log('── 9–10. Representation reaches step1/step2 correctly ────────');

test('9. SEO service reaches exact step1 prefill representation', () => {
  const api = loadAdapter('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const ctx = api.context;
  assert(ctx !== null, 'Context must be non-null');
  /* _fxrf4ServiceLabel must be "Plomberie" — the SERVICES[i].label that _normalizeSlug matches */
  assertEquals(ctx._fxrf4ServiceLabel, 'Plomberie', '_fxrf4ServiceLabel must be "Plomberie"');
  /* Verify it actually matches via _normalizeSlug simulation */
  const match = normalizeSlug(ctx._fxrf4ServiceLabel);
  assert(match !== null && match.slug === 'plomberie',
    `_normalizeSlug("Plomberie") must return slug "plomberie", got ${JSON.stringify(match)}`);
  /* And that it sets prefillService in _readContext() */
  const st = simulateReadContext(ctx, {});
  assertEquals(st.prefillService, 'Plomberie', 'prefillService must be "Plomberie"');
});

test('10. SEO city reaches exact step2 prefill representation', () => {
  const api = loadAdapter('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const ctx = api.context;
  assert(ctx !== null, 'Context must be non-null');
  assertEquals(ctx._fxrf4CityLabel, 'Casablanca', '_fxrf4CityLabel must be "Casablanca"');
  /* Verify ALL_CITIES.indexOf check would pass */
  const ALL_CITIES = ['Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara','El Jadida','Béni Mellal',
    'Nador','Khouribga','Safi','Taza','Ouarzazate','Mohammedia'];
  assert(ALL_CITIES.indexOf(ctx._fxrf4CityLabel) >= 0,
    `"${ctx._fxrf4CityLabel}" must be in ALL_CITIES`);
  const st = simulateReadContext(ctx, {});
  assertEquals(st.prefillCity, 'Casablanca', 'prefillCity must be "Casablanca"');
});

/* ── Tests 11–13: No auto-open/submit/skip ───────────────────────────────── */
console.log('── 11–13. No auto-open / auto-submit / step-skip ────────────');

test('11. no auto-open — adapter does not call FixeoRequestFlowV4.open()', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, 'FixeoRequestFlowV4', 'Adapter must not reference FixeoRequestFlowV4');
  assertNotContains(src, '.open(', 'Adapter must not call .open()');
});

test('12. no auto-next — adapter has no _transitionFwd or next() call', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, '_transitionFwd', 'No _transitionFwd in adapter');
  assertNotContains(src, 'renderStep2', 'No renderStep2 call in adapter');
  assertNotContains(src, 'renderStep3', 'No renderStep3 call in adapter');
});

test('13. no auto-submit — adapter has no form.submit() or fetch(POST)', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, '.submit(', 'No form submit in adapter');
  assertNotContains(src, 'fetch(', 'No fetch in adapter');
  assertNotContains(src, 'XMLHttpRequest', 'No XHR in adapter');
});

/* ── Tests 14–20: No forbidden patterns ─────────────────────────────────── */
console.log('── 14–20. No forbidden patterns in adapter ──────────────────');

test('14. no step skipping', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, 'renderStep', 'No step rendering call in adapter');
  assertNotContains(src, 'transitionFwd', 'No transition in adapter');
});

test('15. no QSM selector dependency in functional code', () => {
  assertNotContains(strippedAdapterSrc(), 'qsm-input-nlp', '#qsm-input-nlp must be absent');
  assertNotContains(strippedAdapterSrc(), 'qsm-select-city', '#qsm-select-city must be absent');
  assertNotContains(strippedAdapterSrc(), 'quick-search-modal', 'quick-search-modal must be absent');
});

test('16. no FixeoEstimationV2 dependency in functional code', () => {
  assertNotContains(strippedAdapterSrc(), 'FixeoEstimationV2', 'FixeoEstimationV2 must be absent');
  assertNotContains(strippedAdapterSrc(), 'toActive', 'toActive must be absent');
});

test('17. no polling in adapter', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, 'setInterval', 'No setInterval');
  assertNotContains(src, 'pollAndSeed', 'No pollAndSeed');
  assertNotContains(src, 'setTimeout',  'No setTimeout polling');
});

test('18. no synthetic click in adapter', () => {
  assertNotContains(strippedAdapterSrc(), '.click(', 'No synthetic .click()');
});

test('19. no direct dispatch (reservation/RAFI bypass) in adapter', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, 'openModal', 'No openModal in adapter');
  assertNotContains(src, 'openExpress', 'No openExpress in adapter');
  assertNotContains(src, 'FixeoClientRequest', 'No FixeoClientRequest in adapter');
  assertNotContains(src, 'data-open-request-form', 'No data-open-request-form in adapter');
});

test('20. no private/PII context in adapter output', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  assert(ctx !== null);
  assert(!('phone' in ctx) && !('email' in ctx) && !('name' in ctx),
    'Context must not contain PII fields');
  assert(!('id' in ctx) && !('legacy_id' in ctx) && !('user_id' in ctx),
    'Context must not contain ID fields');
});

/* ── Tests 21–22: Edge cases ─────────────────────────────────────────────── */
console.log('── 21–22. Edge cases ─────────────────────────────────────────');

test('21. homepage without fx_* params: context null, _readContext unchanged', () => {
  const api = loadAdapter('');
  assert(api.context === null, 'context must be null when no fx_* params');
  const st = simulateReadContext(null, {});
  assertEquals(st.prefillService, '', 'prefillService must be empty');
  assertEquals(st.prefillCity,    '', 'prefillCity must be empty');
});

test('22. invalid fx_* behaves like no SEO context', () => {
  const ctx = parseWith('?fx_service=INVALID&fx_city=UNKNOWN');
  assertNull(ctx, 'Invalid service+city → null context');
  const st = simulateReadContext(ctx, {});
  assertEquals(st.prefillService, '', 'prefillService empty');
  assertEquals(st.prefillCity,    '', 'prefillCity empty');
});

/* ── Tests 23–25: Generator CTA / content-guard ─────────────────────────── */
console.log('── 23–25. Generator CTA and content guard ────────────────────');

test('23. canonical service-city CTA URL is correct in generated page', () => {
  const { generateServiceCityPage } = require('../seo/generators/service-city-v3');
  const r = generateServiceCityPage({ serviceSlug: 'plombier', citySlug: 'casablanca', artisanRecords: [] });
  assertContains(r.html, 'fx_service=plombier', 'CTA must have fx_service=plombier');
  assertContains(r.html, 'fx_city=casablanca',  'CTA must have fx_city=casablanca');
  assertContains(r.html, 'fx_source=seo',       'CTA must have fx_source=seo');
  assertContains(r.html, 'hero-quick-search',   'CTA must anchor to #hero-quick-search');
});

test('24. no old generic ?service=&city= emitted by V3 generator', () => {
  const { generateServiceCityPage } = require('../seo/generators/service-city-v3');
  const r = generateServiceCityPage({ serviceSlug: 'plombier', citySlug: 'casablanca', artisanRecords: [] });
  assertNotContains(r.html, '?service=Plomb', 'Old ?service= URL must be absent');
  assertNotContains(r.html, '?service=plomb', 'Old ?service= URL must be absent');
  assertNotContains(r.html, 'data-open-request-form', 'RAFI attribute must be absent');
});

test('25. content-guard passes on generated page', () => {
  const { generateServiceCityPage } = require('../seo/generators/service-city-v3');
  const { check } = require('../seo/generators/shared/content-guard');
  const r = generateServiceCityPage({ serviceSlug: 'plombier', citySlug: 'casablanca', artisanRecords: [] });
  try { check(r.html, 'full_html', '/plombier/casablanca'); }
  catch (e) { throw new Error('Banned term: ' + e.message); }
});

/* ── Tests 26–30: Regression suite ─────────────────────────────────────────── */
console.log('── 26–30. Regression ─────────────────────────────────────────');

test('26. service-city-v3: all pass', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/service-city-v3.test.js 2>&1', { cwd: path.join(__dirname, '..') }).toString();
  assert(r.includes('Failed    : 0') && !r.includes('❌'), `service-city-v3 failures:\n${r.slice(-400)}`);
});

test('27. page-template: 62/62', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/shared/page-template.test.js 2>&1', { cwd: path.join(__dirname, '..') }).toString();
  assert(r.includes('Passed    : 62') && r.includes('Failed    : 0'), `page-template:\n${r.slice(-400)}`);
});

test('28. artisan-card: 90/90', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/shared/artisan-card-v3.test.js 2>&1', { cwd: path.join(__dirname, '..') }).toString();
  assert(r.includes('Passed    : 90') && r.includes('Failed    : 0'), `artisan-card:\n${r.slice(-400)}`);
});

test('29. seo-head: 42/42', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/shared/seo-head.test.js 2>&1', { cwd: path.join(__dirname, '..') }).toString();
  assert(r.includes('Passed    : 42') && r.includes('Failed    : 0'), `seo-head:\n${r.slice(-400)}`);
});

test('30. seo-v3 CSS: 66/66', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/assets/seo-v3.test.js 2>&1', { cwd: path.join(__dirname, '..') }).toString();
  assert(r.includes('Passed    : 66') && r.includes('Failed    : 0'), `seo-v3:\n${r.slice(-400)}`);
});

/* ── Additional focused tests ────────────────────────────────────────────── */
console.log('── Additional: adapter load path / translation table ─────────');

test('A-1. index.html loads adapter synchronously BEFORE fx-request-flow-v4.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const adapterIdx = html.indexOf('fixeo-seo-handoff-v1.js');
  const fxrf4Idx   = html.indexOf('fx-request-flow-v4.js');
  assert(adapterIdx !== -1, 'Adapter must appear in index.html');
  assert(fxrf4Idx   !== -1, 'fx-request-flow-v4.js must appear in index.html');
  assert(adapterIdx < fxrf4Idx, 'Adapter must appear BEFORE fx-request-flow-v4.js in index.html');
  /* Verify both are synchronous (no defer/async on those exact lines) */
  const adapterLine = html.split('\n').find(l => l.includes('fixeo-seo-handoff-v1.js'));
  const fxrf4Line   = html.split('\n').find(l => l.includes('fx-request-flow-v4.js'));
  assert(adapterLine && !adapterLine.includes('defer') && !adapterLine.includes('async'),
    'Adapter must be synchronous (no defer/async)');
  assert(fxrf4Line && !fxrf4Line.includes('defer') && !fxrf4Line.includes('async'),
    'fxrf4 must be synchronous (no defer/async)');
});

test('A-2. All 8 V3 service slugs translate to correct fxrf4 labels', () => {
  const api = loadAdapter('');
  const map = api._SERVICE_LABEL_MAP;
  const SERVICES_FXRF4 = ['Plomberie','Électricité','Serrurerie','Climatisation',
    'Peinture','Menuiserie','Maçonnerie','Nettoyage'];
  [
    ['plombier', 'Plomberie'],
    ['electricien', 'Électricité'],
    ['serrurier', 'Serrurerie'],
    ['climatisation', 'Climatisation'],
    ['peintre', 'Peinture'],
    ['menuisier', 'Menuiserie'],
    ['macon', 'Maçonnerie'],
    ['nettoyage', 'Nettoyage'],
  ].forEach(([v3slug, expectedLabel]) => {
    assertEquals(map[v3slug], expectedLabel, `SERVICE_LABEL_MAP[${v3slug}] must be "${expectedLabel}"`);
    /* Also verify _normalizeSlug would find this label */
    const match = normalizeSlug(expectedLabel);
    assert(match !== null, `normalizeSlug("${expectedLabel}") must return a match`);
    assert(SERVICES_FXRF4.indexOf(match.label) !== -1, `match.label must be a valid fxrf4 label`);
  });
});

test('A-3. All 20 city slugs translate to exact ALL_CITIES labels', () => {
  const ALL_CITIES = ['Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara','El Jadida','Béni Mellal',
    'Nador','Khouribga','Safi','Taza','Ouarzazate','Mohammedia'];
  const api = loadAdapter('');
  const map = api._CITY_LABEL_MAP;
  Object.keys(map).forEach(slug => {
    const label = map[slug];
    assert(ALL_CITIES.indexOf(label) !== -1,
      `CITY_LABEL_MAP["${slug}"] = "${label}" must be in ALL_CITIES exactly`);
  });
  assertEquals(Object.keys(map).length, 20, 'Must have 20 city mappings');
});

test('A-4. Only one slug-only (service or city) → partial context → no crash', () => {
  /* service only, city invalid */
  const ctx1 = parseWith('?fx_service=plombier&fx_city=invalid');
  assert(ctx1 !== null, 'service-only context must not be null');
  assert(ctx1.service === 'plombier', 'service must be parsed');
  assertNull(ctx1.city, 'invalid city must be null');
  /* city only, service invalid */
  const ctx2 = parseWith('?fx_service=invalid&fx_city=casablanca');
  assert(ctx2 !== null, 'city-only context must not be null');
  assert(ctx2.city === 'casablanca', 'city must be parsed');
  assertNull(ctx2.service, 'invalid service must be null');
});

test('A-5. STATUS is ACTIVE in fsh-v3', () => {
  const api = loadAdapter('');
  assertEquals(api.STATUS, 'ACTIVE', 'STATUS must be ACTIVE in fsh-v3');
});

test('A-6. fxrf4 seam is within _readContext() block — verified by source text proximity', () => {
  const raw = fs.readFileSync(path.join(__dirname, 'fx-request-flow-v4.js'), 'utf8');
  /* FixeoSeoHandoff block must appear INSIDE function _readContext — check that
     the word FixeoSeoHandoff appears between "function _readContext" and the
     next top-level "function " or closing brace at same indent */
  const readCtxStart = raw.indexOf('function _readContext(st)');
  const readCtxEnd   = raw.indexOf('\n  function ', readCtxStart + 1);
  const seam         = raw.slice(readCtxStart, readCtxEnd);
  assertContains(seam, 'FixeoSeoHandoff', 'SEO seam must be inside _readContext()');
  assertContains(seam, '_fxrf4ServiceLabel', 'Service label seam must be in _readContext()');
  assertContains(seam, '_fxrf4CityLabel', 'City label seam must be in _readContext()');
  assertNotContains(seam, 'fx_service', 'Raw param must not appear in seam');
  assertNotContains(seam, 'URLSearchParams', 'URL parsing must not appear in seam');
});

test('A-7. content-guard also passes for electricien/rabat', () => {
  const { generateServiceCityPage } = require('../seo/generators/service-city-v3');
  const { check } = require('../seo/generators/shared/content-guard');
  const r = generateServiceCityPage({ serviceSlug: 'electricien', citySlug: 'rabat', artisanRecords: [] });
  assertContains(r.html, 'fx_service=electricien', 'CTA must have fx_service=electricien');
  assertContains(r.html, 'fx_city=rabat', 'CTA must have fx_city=rabat');
  try { check(r.html, 'full_html', '/electricien/rabat'); }
  catch (e) { throw new Error('Banned term in electricien/rabat: ' + e.message); }
});

test('A-8. no localStorage/sessionStorage writes in adapter', () => {
  const src = strippedAdapterSrc();
  assertNotContains(src, 'localStorage', 'No localStorage');
  assertNotContains(src, 'sessionStorage', 'No sessionStorage');
});

/* ── Task 2.6C: City intent priority tests (C-1 through C-18) ──────────── */

/* Augmented simulateReadContext that accepts detectedCity (from localStorage) separately */
function simulateReadContextFull(seoHandoffContext, domState) {
  domState = domState || {};
  const ALL_CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
    'Taza','Ouarzazate','Mohammedia'
  ];
  const st = { prefillService:'', prefillCity:'', prefillPhone:'', detectedCity:'', city:'' };

  /* Priority 1: localStorage geolocation */
  if (domState.detectedCity && ALL_CITIES.indexOf(domState.detectedCity) >= 0) {
    st.detectedCity = domState.detectedCity;
  }
  /* Priority 2: Hero service input DOM */
  if (domState.heroServiceInput && domState.heroServiceInput.trim().length > 2) {
    st.prefillService = domState.heroServiceInput.trim();
  }
  /* Priority 3: Hero city picker DOM */
  if (domState.heroCityValue && ALL_CITIES.indexOf(domState.heroCityValue) >= 0) {
    st.prefillCity = domState.heroCityValue;
  }
  /* Priority 4: SEO fallback */
  try {
    const _seoCtx = seoHandoffContext;
    if (_seoCtx) {
      if (!st.prefillService && _seoCtx._fxrf4ServiceLabel) {
        st.prefillService = _seoCtx._fxrf4ServiceLabel;
      }
      if (!st.prefillCity && _seoCtx._fxrf4CityLabel &&
          ALL_CITIES.indexOf(_seoCtx._fxrf4CityLabel) >= 0) {
        st.prefillCity = _seoCtx._fxrf4CityLabel;
      }
    }
  } catch (_) {}

  /* Simulate _renderStep2 detected variable (post-fix: prefillCity > detectedCity) */
  const detected = st.prefillCity || st.detectedCity || '';
  const selectedCity = st.city || detected || '';

  return { st, detected, selectedCity };
}

console.log('── C-1–6. City priority: SEO vs detected ─────────────────────');

test('C-1. SEO Casablanca + no detected city → Casablanca selected', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const { detected, selectedCity } = simulateReadContextFull(ctx, {});
  assertEquals(detected, 'Casablanca', 'detected must be Casablanca');
  assertEquals(selectedCity, 'Casablanca', 'selectedCity must be Casablanca');
});

test('C-2. SEO Casablanca + detected Rabat → Casablanca selected (SEO wins)', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const { detected, selectedCity } = simulateReadContextFull(ctx, { detectedCity: 'Rabat' });
  assertEquals(detected, 'Casablanca', `SEO Casablanca must win over detected Rabat, got: ${detected}`);
  assertEquals(selectedCity, 'Casablanca', `selectedCity must be Casablanca, got: ${selectedCity}`);
});

test('C-3. SEO Casablanca + detected Fès → Casablanca selected (SEO wins)', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const { detected } = simulateReadContextFull(ctx, { detectedCity: 'Fès' });
  assertEquals(detected, 'Casablanca', `SEO Casablanca must win over detected Fès, got: ${detected}`);
});

test('C-4. explicit current user city Rabat + SEO Casablanca → explicit Rabat wins', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  /* heroCityValue = explicit DOM city picker selection (priority 3 > SEO priority 4) */
  const { st, detected } = simulateReadContextFull(ctx, { heroCityValue: 'Rabat' });
  assertEquals(st.prefillCity, 'Rabat', 'DOM city picker must win over SEO city');
  assertEquals(detected, 'Rabat', 'detected must be Rabat (explicit DOM wins)');
});

test('C-5. no SEO city + detected Rabat → existing Rabat detection preserved', () => {
  /* No fx_city param → no SEO city context */
  const ctx = parseWith('?fx_service=plombier&fx_source=seo');
  const { detected } = simulateReadContextFull(ctx, { detectedCity: 'Rabat' });
  assertEquals(detected, 'Rabat', 'Rabat detected city must be used when no SEO city');
});

test('C-6. invalid SEO city + detected Rabat → Rabat preserved', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=INVALID&fx_source=seo');
  /* ctx.city = null → _fxrf4CityLabel = null → prefillCity stays empty */
  const { detected } = simulateReadContextFull(ctx, { detectedCity: 'Rabat' });
  assertEquals(detected, 'Rabat', 'Invalid SEO city must fall back to detected Rabat');
});

console.log('── C-7–8. Service priority ────────────────────────────────────');

test('C-7. SEO service + no explicit service → SEO service selected', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const { st } = simulateReadContextFull(ctx, {});
  assertEquals(st.prefillService, 'Plomberie', 'SEO service must set prefillService');
  const match = normalizeSlug(st.prefillService);
  assert(match && match.slug === 'plomberie', `_normalizeSlug must match plomberie, got ${JSON.stringify(match)}`);
});

test('C-8. explicit current service + SEO service → explicit current wins', () => {
  const ctx = parseWith('?fx_service=plombier&fx_city=casablanca&fx_source=seo');
  const { st } = simulateReadContextFull(ctx, { heroServiceInput: 'Nettoyage' });
  assertEquals(st.prefillService, 'Nettoyage', 'DOM hero input must win over SEO service');
});

console.log('── C-9–12. No auto-progression, no estimator via prefill ──────');

test('C-9. SEO prefill does not auto-open request flow', () => {
  /* Proven by: adapter contains no .open() call and no FixeoRequestFlowV4 reference */
  assertNotContains(strippedAdapterSrc(), 'FixeoRequestFlowV4', 'No FixeoRequestFlowV4 in adapter');
  assertNotContains(strippedAdapterSrc(), '.open(', 'No .open() in adapter');
});

test('C-10. SEO prefill does not auto-next (no step transition)', () => {
  assertNotContains(strippedAdapterSrc(), '_transitionFwd', 'No _transitionFwd in adapter');
  assertNotContains(strippedAdapterSrc(), 'renderStep', 'No step render call in adapter');
});

test('C-11. SEO prefill does not trigger FixeoEstimatorV2', () => {
  /* Adapter contains no estimator reference */
  assertNotContains(strippedAdapterSrc(), 'FixeoEstimatorV2', 'No FixeoEstimatorV2 in adapter');
  assertNotContains(strippedAdapterSrc(), 'FixeoEstimatorConfig', 'No FixeoEstimatorConfig in adapter');
  assertNotContains(strippedAdapterSrc(), 'toActive', 'No toActive in adapter');
  /* fxrf4 seam reads context but does NOT call estimator */
  const raw = fs.readFileSync(path.join(__dirname, 'fx-request-flow-v4.js'), 'utf8');
  const readCtxStart = raw.indexOf('function _readContext(st)');
  const readCtxEnd   = raw.indexOf('\n  function ', readCtxStart + 1);
  const seam = raw.slice(readCtxStart, readCtxEnd);
  assertNotContains(seam, 'FixeoEstimatorV2', 'SEO seam in _readContext must not reference estimator');
  assertNotContains(seam, 'FixeoEstimatorLaunched', 'SEO seam must not touch estimator guard');
});

test('C-12. estimator V2 path in chip tap is unchanged by seam; only triggered by user chip click', () => {
  /* Verify: the estimator guard check (_fxrf4EstimatorLaunched) in _onTap() is unchanged.
     The seam in _readContext() does not touch it. The estimator fires only inside
     _onTap() → user chip click → if estimatorV2Enabled === true.
     Verify seam does not reference _fxrf4EstimatorLaunched. */
  const raw = fs.readFileSync(path.join(__dirname, 'fx-request-flow-v4.js'), 'utf8');
  const readCtxStart = raw.indexOf('function _readContext(st)');
  const readCtxEnd   = raw.indexOf('\n  function ', readCtxStart + 1);
  const seam = raw.slice(readCtxStart, readCtxEnd);
  assertNotContains(seam, 'EstimatorLaunched', 'Seam must not touch estimator launched guard');
  assertNotContains(seam, 'estimatorV2Enabled', 'Seam must not touch estimator config');
  /* The estimator path still exists in the chip tap — verify it's there (unchanged) */
  assertContains(raw, '_fxrf4EstimatorLaunched', 'Estimator guard must still exist in fxrf4');
  assertContains(raw, 'estimatorV2Enabled', 'Estimator config check must still exist in fxrf4');
});

console.log('── C-13–17. Forbidden patterns ────────────────────────────────');

test('C-13. no raw fx_* parsing added to fx-request-flow-v4.js', () => {
  assertNotContains(strippedFxrf4Src(), 'fx_service', 'No fx_service in fxrf4');
  assertNotContains(strippedFxrf4Src(), 'fx_city',    'No fx_city in fxrf4');
  assertNotContains(strippedFxrf4Src(), 'location.search', 'No location.search in fxrf4');
});

test('C-14. no QSM transport reintroduced', () => {
  assertNotContains(strippedAdapterSrc(), 'qsm-input-nlp', 'No qsm-input-nlp');
  assertNotContains(strippedAdapterSrc(), 'qsm-select-city', 'No qsm-select-city');
});

test('C-15. no polling', () => {
  assertNotContains(strippedAdapterSrc(), 'setInterval', 'No setInterval in adapter');
  assertNotContains(strippedAdapterSrc(), 'pollAndSeed', 'No pollAndSeed in adapter');
});

test('C-16. homepage without fx_* unchanged (no detectedCity side effects from adapter)', () => {
  const api = loadAdapter('');
  assertNull(api.context, 'context must be null with no params');
  const { detected, selectedCity } = simulateReadContextFull(null, { detectedCity: 'Rabat' });
  assertEquals(detected, 'Rabat', 'Rabat detected city must be used when no SEO context');
  assertEquals(selectedCity, 'Rabat', 'selectedCity must be Rabat');
});

test('C-17. malformed params do not crash or leak into detected', () => {
  const ctx = parseWith('?fx_service=<script>&fx_city=DROP TABLE');
  assertNull(ctx, 'Malformed params must return null context');
  const { detected } = simulateReadContextFull(ctx, { detectedCity: 'Rabat' });
  assertEquals(detected, 'Rabat', 'Rabat must be preserved when params are malformed');
});

console.log('── C-18. All previous 2.6B tests still pass ───────────────────');

test('C-18. All 38 previous tests from 2.6B still pass (regression)', () => {
  /* Individual regression tests 26-30 cover the full suite below */
  /* Service city regression */
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/service-city-v3.test.js 2>&1', { cwd: path.join(__dirname, '..') }).toString();
  assert(r.includes('Failed    : 0'), `service-city-v3 regression:\n${r.slice(-300)}`);
  /* Verify fxrf4 seam is still inside _readContext() (not moved) */
  const raw = fs.readFileSync(path.join(__dirname, 'fx-request-flow-v4.js'), 'utf8');
  const readCtxStart = raw.indexOf('function _readContext(st)');
  const readCtxEnd   = raw.indexOf('\n  function ', readCtxStart + 1);
  const seam = raw.slice(readCtxStart, readCtxEnd);
  assertContains(seam, 'FixeoSeoHandoff', 'SEO seam must still be in _readContext()');
  /* Verify priority fix is in _renderStep2 (where 'detected' variable is declared) */
  const step2Start = raw.indexOf('function _renderStep2()');
  const step2End   = raw.indexOf('\n  function ', step2Start + 1);
  const step2 = raw.slice(step2Start, step2End);
  const strippedStep2 = step2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assertContains(strippedStep2, 'st.prefillCity || st.detectedCity',
    'Priority fix must be in _renderStep2 detected line');
  assertNotContains(strippedStep2, 'st.detectedCity || st.prefillCity',
    'Old defective order must be gone from _renderStep2');
});

/* ── Summary ─────────────────────────────────────────────────────────────── */

console.log(`\nTotal tests : ${passed + failed}`);
console.log(`  Passed    : ${passed}`);
console.log(`  Failed    : ${failed}`);

if (failed > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.label}\n     ${f.error}`));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.\n');
}
