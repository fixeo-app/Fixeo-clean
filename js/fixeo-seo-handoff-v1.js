/**
 * fixeo-seo-handoff-v1.js — SEO V3 → Homepage Flagship Handoff Adapter
 * ======================================================================
 * Version: fsh-v3
 *
 * PURPOSE
 * ────────
 * - Parse and validate fx_* URL params on homepage arrival from a V3 SEO page
 * - Expose validated context via window.FixeoSeoHandoff.context
 * - Translate service/city slugs into the exact representation consumed
 *   by fx-request-flow-v4.js _readContext() for safe FALLBACK prefill
 * - Scroll to #hero-quick-search
 * - Emit analytics CustomEvent fixeo:seo:handoff
 *
 * LOAD ORDER (index.html)
 * ───────────────────────
 * This script is loaded synchronously BEFORE fx-request-flow-v4.js.
 * No event timing dependency: fxrf4 reads window.FixeoSeoHandoff.context
 * inside its open() call (pull model, not push/event model).
 *
 * QUERY CONTRACT (read by this module only)
 * ─────────────────────────────────────────
 *   fx_service  — canonical V3 service slug (e.g. "plombier")
 *   fx_city     — canonical V3 city slug    (e.g. "casablanca")
 *   fx_source   — enum: "seo" | "blog" | "sitemap"
 *   fx_path     — originating canonical path (e.g. "/plombier/casablanca")
 *                 informational only; not used for routing
 *
 * VALIDATION
 * ──────────
 *   fx_service: must be in VALID_SERVICE_SLUGS (allowlist of 8 V3 slugs)
 *   fx_city:    must be in VALID_CITY_SLUGS    (allowlist of 20 V3 slugs)
 *   fx_source:  must be in VALID_SOURCES        (allowlist of 3)
 *   fx_path:    must match /^\/[a-z0-9\/\-]*$/
 *   Invalid value → field set null (no error thrown)
 *   No raw param values reach the DOM
 *
 * TRANSLATION CONTRACT (for fxrf4 FALLBACK prefill)
 * ──────────────────────────────────────────────────
 * context._fxrf4ServiceLabel:
 *   The fxrf4 SERVICES[i].label string (e.g. "Plomberie").
 *   This is what _normalizeSlug(prefillService) matches via svc.words.
 *   _normalizeSlug("Plomberie") → lowercases → "plomberie" → matches svc.words "plomb" → slug "plomberie".
 *   fx-request-flow-v4.js SERVICES slugs differ from V3 slugs:
 *     V3: plombier | fxrf4: plomberie
 *     V3: electricien | fxrf4: electricite
 *     V3: serrurier → fxrf4: serrurerie
 *     V3: peintre → fxrf4: peinture
 *     V3: macon → fxrf4: maconnerie
 *     V3: climatisation → fxrf4: climatisation (same)
 *     V3: menuisier → fxrf4: menuiserie
 *     V3: nettoyage → fxrf4: nettoyage (same)
 *   The label is the stable translation layer — no slug assumption in fxrf4.
 *
 * context._fxrf4CityLabel:
 *   The exact fxrf4 ALL_CITIES display label string (e.g. "Casablanca").
 *   Used as prefillCity: ALL_CITIES.indexOf(prefillCity) >= 0 check in fxrf4.
 *   Also used as detectedCity fallback for the city chip "Detected" highlight.
 *
 * CONTEXT PRIORITY in fx-request-flow-v4.js _readContext():
 *   1. localStorage 'fixeo_detected_city' (geolocation, highest trust)
 *   2. Hero input elements (#qsm-input-nlp, #smart-search-input, etc.)
 *   3. Hero city picker (#qsm-select-city, #filter-city, etc.)
 *   4. SEO handoff context ← THIS MODULE (lowest priority fallback)
 *   SEO context NEVER overrides an already-set prefill value.
 *
 * TAXONOMY MAP MAINTENANCE NOTE
 * ─────────────────────────────────
 * SERVICE_LABEL_MAP and CITY_LABEL_MAP are small static lookup tables.
 * They duplicate data that also lives in fx-request-flow-v4.js:
 *   SERVICES[i].label — 10 entries (8 V3-mapped + jardinage + demenagement)
 *   ALL_CITIES        — 20 entries (exact display labels with accents)
 * No canonical shared runtime taxonomy object exists at browser runtime.
 * These maps can drift if fx-request-flow-v4.js SERVICES or ALL_CITIES changes.
 * Maintenance rule: whenever SERVICES[i].label or ALL_CITIES changes in
 * fx-request-flow-v4.js, SERVICE_LABEL_MAP / CITY_LABEL_MAP here must be
 * updated in the same commit. Test A-2 and A-3 enforce this at CI time.
 * Do NOT import SEO JSON files dynamically into this browser runtime to avoid
 * the map — the overhead is not justified for 8+20 static entries.
 *
 * UX INVARIANTS (hard, by design)
 * ─────────────────────────────────
 * - No auto-open of the request flow
 * - No auto-submit
 * - No step skipping
 * - No synthetic .click()
 * - No RAFI/estimation dependency
 * - No QSM selector dependency
 * - No localStorage/sessionStorage writes
 * - No polling
 * - Normal homepage behavior fully preserved when no fx_* params present
 *
 * ANALYTICS (active)
 * ───────────────────
 * Emits window CustomEvent "fixeo:seo:handoff" with validated dimensions.
 * Bridged to GA4 by fixeo-analytics-bootstrap.js.
 * Analytics is NOT the context transport — it is a separate side-effect.
 *
 * FORBIDS (verified by tests)
 * ────────────────────────────
 * - #qsm-input-nlp writes (removed from all code paths)
 * - FixeoEstimationV2.toActive() (removed)
 * - data-open-request-form usage
 * - localStorage/sessionStorage writes
 * - setInterval polling
 * - Synthetic .click()
 * - window.openModal()
 * - FixeoClientRequest.open/openExpress
 * - Raw fx_* param values flowing into DOM
 *
 * VERSION HISTORY
 * ───────────────
 * fsh-v1 (Task 2.6):   Initial — used legacy QSM/estimation path (incorrect)
 * fsh-v2 (Task 2.6A):  Removed legacy coupling. Status: DESIGNED_NOT_YET_ACTIVE
 * fsh-v3 (Task 2.6B):  Active context seam via window.FixeoSeoHandoff.context
 *                      + _fxrf4ServiceLabel / _fxrf4CityLabel translations.
 *                      Loaded on index.html before fx-request-flow-v4.js.
 *                      STATUS: ACTIVE
 *
 * FILE: js/fixeo-seo-handoff-v1.js
 */

(function () {
  'use strict';

  /* ── Idempotency guard ─────────────────────────────────── */
  if (window._fshV1Loaded) return;
  window._fshV1Loaded = true;

  var VERSION = 'fsh-v3';

  /* ── Validation allowlists ─────────────────────────────── */

  var VALID_SERVICE_SLUGS = [
    'plombier',
    'electricien',
    'serrurier',
    'climatisation',
    'peintre',
    'menuisier',
    'macon',
    'nettoyage',
  ];

  var VALID_CITY_SLUGS = [
    'casablanca',
    'rabat',
    'marrakech',
    'fes',
    'tanger',
    'agadir',
    'meknes',
    'oujda',
    'kenitra',
    'temara',
    'sale',
    'mohammedia',
    'el-jadida',
    'beni-mellal',
    'khouribga',
    'safi',
    'nador',
    'taza',
    'ouarzazate',
    'tetouan',
  ];

  var VALID_SOURCES = ['seo', 'blog', 'sitemap'];

  var SAFE_PATH_RE = /^\/[a-z0-9\/\-]*$/;

  /* ── Service slug → fxrf4 display label ──────────────────
   * MUST match SERVICES[i].label in fx-request-flow-v4.js exactly.
   * _normalizeSlug(label) runs NFD→lowercase→svc.words keyword match.
   * "Plomberie" → "plomberie" → contains "plomb" → slug "plomberie" ✓
   * Do NOT use V3 slugs (plombier/electricien) here — fxrf4 doesn't
   * recognise them as keywords. Use the fxrf4 SERVICES[i].label string.
   */
  var SERVICE_LABEL_MAP = {
    plombier:      'Plomberie',
    electricien:   '\u00c9lectricit\u00e9',   /* Électricité */
    serrurier:     'Serrurerie',
    climatisation: 'Climatisation',
    peintre:       'Peinture',
    menuisier:     'Menuiserie',
    macon:         'Ma\u00e7onnerie',          /* Maçonnerie */
    nettoyage:     'Nettoyage',
  };

  /* ── City slug → fxrf4 ALL_CITIES display label ──────────
   * MUST match ALL_CITIES array in fx-request-flow-v4.js exactly.
   * ALL_CITIES = ['Casablanca','Rabat','Marrakech','Fès','Tanger',
   *   'Agadir','Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
   *   'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
   *   'Taza','Ouarzazate','Mohammedia']
   * prefillCity is compared with ALL_CITIES.indexOf(value) >= 0.
   */
  var CITY_LABEL_MAP = {
    casablanca:    'Casablanca',
    rabat:         'Rabat',
    marrakech:     'Marrakech',
    fes:           'F\u00e8s',           /* Fès */
    tanger:        'Tanger',
    agadir:        'Agadir',
    meknes:        'Mekn\u00e8s',        /* Meknès */
    oujda:         'Oujda',
    kenitra:       'K\u00e9nitra',       /* Kénitra */
    temara:        'Temara',
    sale:          'Sal\u00e9',          /* Salé */
    mohammedia:    'Mohammedia',
    'el-jadida':   'El Jadida',
    'beni-mellal': 'B\u00e9ni Mellal',   /* Béni Mellal */
    khouribga:     'Khouribga',
    safi:          'Safi',
    nador:         'Nador',
    taza:          'Taza',
    ouarzazate:    'Ouarzazate',
    tetouan:       'T\u00e9touan',       /* Tétouan */
  };

  /* ── Parameter parsing ───────────────────────────────────── */

  function parseContext() {
    var params;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (_) {
      return null;
    }

    var rawService = (params.get('fx_service') || '').trim().toLowerCase();
    var rawCity    = (params.get('fx_city')    || '').trim().toLowerCase();
    var rawSource  = (params.get('fx_source')  || '').trim().toLowerCase();
    var rawPath    = (params.get('fx_path')    || '').trim();

    var service = (rawService && VALID_SERVICE_SLUGS.indexOf(rawService) !== -1) ? rawService : null;
    var city    = (rawCity    && VALID_CITY_SLUGS.indexOf(rawCity)       !== -1) ? rawCity    : null;
    var source  = (rawSource  && VALID_SOURCES.indexOf(rawSource)        !== -1) ? rawSource  : null;
    var path    = (rawPath    && SAFE_PATH_RE.test(rawPath))                     ? rawPath    : null;

    if (!service && !city) return null;

    /* Translate to fxrf4 representations at parse time.
       Consumers (fxrf4) read these pre-translated values — no translation in fxrf4. */
    var fxrf4ServiceLabel = service ? (SERVICE_LABEL_MAP[service] || null) : null;
    var fxrf4CityLabel    = city    ? (CITY_LABEL_MAP[city]       || null) : null;

    return {
      service:           service,
      city:              city,
      source:            source,
      path:              path,
      /* Pre-translated for fx-request-flow-v4.js _readContext() */
      _fxrf4ServiceLabel: fxrf4ServiceLabel,
      _fxrf4CityLabel:    fxrf4CityLabel,
    };
  }

  /* ── Scroll to hero ──────────────────────────────────────── */

  function scrollToHero() {
    var hero = document.getElementById('hero-quick-search');
    if (!hero) return;
    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      hero.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    } catch (_) {
      try { hero.scrollIntoView(); } catch (__) {}
    }
  }

  /* ── Analytics event ─────────────────────────────────────── */

  function emitHandoffEvent(ctx) {
    try {
      window.dispatchEvent(new CustomEvent('fixeo:seo:handoff', {
        detail: {
          service: ctx.service || null,
          city:    ctx.city    || null,
          source:  ctx.source  || null,
          path:    ctx.path    || null,
        },
        bubbles: false,
      }));
    } catch (_) {}
  }

  /* ── Public API ──────────────────────────────────────────── */

  window.FixeoSeoHandoff = {
    VERSION:      VERSION,
    STATUS:       'ACTIVE',
    parseContext: parseContext,
    context:      null,   /* populated at boot if fx_* params present */
    /* allowlist exports for testing */
    _VALID_SERVICE_SLUGS: VALID_SERVICE_SLUGS,
    _VALID_CITY_SLUGS:    VALID_CITY_SLUGS,
    _VALID_SOURCES:       VALID_SOURCES,
    _SERVICE_LABEL_MAP:   SERVICE_LABEL_MAP,
    _CITY_LABEL_MAP:      CITY_LABEL_MAP,
  };

  /* ── Boot ────────────────────────────────────────────────── */

  function _boot() {
    var ctx = parseContext();
    if (!ctx) return;

    /* Expose validated + pre-translated context for fxrf4 _readContext() pull */
    window.FixeoSeoHandoff.context = ctx;

    /* Scroll hero into view */
    scrollToHero();

    /* Analytics side-effect (separate from product context transport) */
    emitHandoffEvent(ctx);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})();
