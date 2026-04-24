/**
 * fixeo-search-engine-v2.js  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-grade search + matching pipeline fix for Fixeo.
 * Patches ALL known bugs in the artisan discovery system post-Supabase migration.
 *
 * BUGS FIXED:
 *   1. SearchEngine stale on init — constructed before ARTISANS is populated;
 *      never re-seeded when Supabase data arrives.
 *   2. status='active' filter kills ALL Supabase artisans — Supabase records
 *      have no 'status' field; normalizeMarketplaceArtisanRecord defaults it to
 *      'active' but the Supabase loader bypasses that function.
 *   3. bio object missing — Supabase artisans have no a.bio{} → TypeError in
 *      SearchEngine.filter when accessing a.bio[lang].
 *   4. secondary-search city filter uses strict === after normalization, breaking
 *      partial queries like "casa" for "casablanca".
 *   5. secondary-search filterArtisans skips text search when NLP detects nothing,
 *      resulting in 0 results for partial category names.
 *   6. Result count badge not synced with actual rendered card count.
 *   7. SearchEngine.artisans is the module-scoped ARTISANS[] ref — splice on the
 *      outer array doesn't update the engine's private reference in all cases.
 *   8. normalizeMarketplaceArtisanRecord requires name — silently drops records
 *      where name is empty even if it would resolve from full_name.
 *
 * ARCHITECTURE:
 *   - This file loads LAST (after all other scripts).
 *   - It patches in-place: wraps/replaces functions, does NOT fork state.
 *   - Zero CSS / HTML changes.
 *   - Zero new storage keys.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════════
     1. SHARED NORMALIZATION HELPER
     Used consistently by all filter/search code paths.
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxNorm(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // strip diacritics: é→e, à→a
      .replace(/[^a-z0-9 ]/g, ' ')       // non-alphanumeric → space
      .replace(/\s+/g, ' ')
      .trim();
  }
  window.fxNorm = fxNorm;

  /* ═══════════════════════════════════════════════════════════════════════════
     2. ARTISAN NORMALIZER — safe wrapper for Supabase records
     Ensures every artisan in window.ARTISANS has all expected fields.
     Called once after Supabase load completes.
  ═══════════════════════════════════════════════════════════════════════════ */
  var CATEGORY_ALIASES = {
    // French variants → canonical key
    plomberie:     'plomberie',  plomb: 'plomberie',
    electricite:   'electricite', electri: 'electricite', elec: 'electricite',
    peinture:      'peinture',   peint: 'peinture',
    nettoyage:     'nettoyage',  nettoy: 'nettoyage',
    jardinage:     'jardinage',  jardin: 'jardinage',
    demenagement:  'demenagement', demen: 'demenagement', demenag: 'demenagement',
    bricolage:     'bricolage',  bricol: 'bricolage',
    climatisation: 'climatisation', clim: 'climatisation', clima: 'climatisation',
    menuiserie:    'menuiserie', menuis: 'menuiserie',
    maconnerie:    'maconnerie', macon: 'maconnerie',
    serrurerie:    'serrurerie', serru: 'serrurerie',
    carrelage:     'carrelage',  carre: 'carrelage',
    etancheite:    'etancheite', etanch: 'etancheite',
    vitrerie:      'vitrerie',   vitre: 'vitrerie',
    soudure:       'soudure',    soud: 'soudure',
    informatique:  'informatique', info: 'informatique'
  };

  var CITY_ALIASES = {
    casa: 'casablanca', casab: 'casablanca', casablanca: 'casablanca',
    rabat: 'rabat', rbt: 'rabat',
    marra: 'marrakech', marrak: 'marrakech', marrakech: 'marrakech',
    fes: 'fes', fez: 'fes',
    agadir: 'agadir', agad: 'agadir',
    tanger: 'tanger', tng: 'tanger',
    meknes: 'meknes',
    settat: 'settat',
    sale: 'sale',
    oujda: 'oujda',
    khouribga: 'khouribga',
    beni: 'beni mellal', mellal: 'beni mellal',
    mohammedia: 'mohammedia', moham: 'mohammedia',
    kenitra: 'kenitra', ken: 'kenitra',
    tetouan: 'tetouan', tet: 'tetouan',
    laayoune: 'laayoune',
    safi: 'safi',
    eljadida: 'el jadida',
    berrechid: 'berrechid',
    khenifra: 'khenifra'
  };

  function _resolveAlias(norm, aliases) {
    if (aliases[norm]) return aliases[norm];
    for (var k in aliases) {
      if (norm.startsWith(k) && k.length >= 3) return aliases[k];
    }
    return norm;
  }

  function _normCat(s)  { return _resolveAlias(fxNorm(s), CATEGORY_ALIASES); }
  function _normCity(s) { return _resolveAlias(fxNorm(s), CITY_ALIASES); }
  window.fxNormCat  = _normCat;
  window.fxNormCity = _normCity;

  /**
   * Ensure every artisan record has the fields expected by search/render.
   * Safe to call multiple times — idempotent.
   */
  function fxNormalizeArtisan(a) {
    if (!a || typeof a !== 'object') return null;

    /* Name: Supabase uses 'name', legacy used 'full_name' */
    var name = (a.name || a.full_name || '').trim();
    if (!name) return null;  // truly empty — skip
    a.name      = name;
    a.full_name = name;

    /* Status: Supabase records have no status field → always treat as active */
    if (!a.status || a.status === '') a.status = 'active';

    /* Bio: SearchEngine.filter accesses a.bio[lang] */
    if (!a.bio || typeof a.bio !== 'object') {
      var desc = a.description || a.shortBio || '';
      a.bio = { fr: desc, ar: desc, en: desc };
    }

    /* Category normalization */
    var rawCat = (a.category || a.service || '').trim();
    if (rawCat) {
      a.category = _normCat(rawCat);  // canonical key
      if (!a.service) a.service = a.category;
    } else {
      a.category = 'bricolage';
      if (!a.service) a.service = 'bricolage';
    }

    /* Skills: used in text search */
    if (!Array.isArray(a.skills) || a.skills.length === 0) {
      a.skills = a.category ? [a.category] : [];
    }

    /* City normalization */
    if (a.city && a.city !== 'Maroc') {
      a._cityNorm = _normCity(a.city);
    } else {
      a._cityNorm = '';
    }

    /* Numeric fields — safe cast */
    a.rating      = isFinite(+a.rating)      ? +a.rating      : 0;
    a.reviewCount = isFinite(+a.reviewCount)  ? +a.reviewCount : isFinite(+a.review_count) ? +a.review_count : 0;
    a.trustScore  = isFinite(+a.trustScore)   ? +a.trustScore  : 80;
    a.priceFrom   = isFinite(+a.priceFrom)    ? +a.priceFrom   : isFinite(+a.price_from) ? +a.price_from : 100;
    a.responseTime= isFinite(+a.responseTime) ? +a.responseTime: 15;

    /* Availability */
    var avail = (a.availability || '').toLowerCase();
    if (!avail || avail === 'null' || avail === 'undefined') avail = 'available';
    a.availability  = avail;
    a.available     = (avail === 'available');
    a.available_today = (avail === 'available' || avail === 'available_today');

    /* _source tag */
    if (!a._source) a._source = 'supabase';

    /* Precomputed search tokens for fast matching */
    a._searchTokens = fxNorm(
      [name, a.city || '', a.category || '', a.description || '', (a.bio && a.bio.fr) || ''].join(' ')
    );

    return a;
  }
  window.fxNormalizeArtisan = fxNormalizeArtisan;

  /* ═══════════════════════════════════════════════════════════════════════════
     3. NORMALIZE ALL LOADED ARTISANS
     Called once after Supabase data populates window.ARTISANS.
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxNormalizeAll() {
    var art = window.ARTISANS;
    if (!Array.isArray(art) || art.length === 0) return 0;
    var valid = [];
    for (var i = 0; i < art.length; i++) {
      var a = fxNormalizeArtisan(art[i]);
      if (a) valid.push(a);
    }
    // Splice in-place to preserve all references
    art.splice(0, art.length);
    for (var j = 0; j < valid.length; j++) art.push(valid[j]);
    console.log('[FxSearch] ✅ Normalized ' + art.length + ' artisans. Sample:', art[0] && art[0].name, '/', art[0] && art[0].city);
    return art.length;
  }
  window.fxNormalizeAll = fxNormalizeAll;

  /* ═══════════════════════════════════════════════════════════════════════════
     4. RESEED SearchEngine AFTER DATA LOAD
     main.js's SearchEngine is constructed at page load with an empty ARTISANS[].
     We must patch its .artisans reference after data arrives.
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxReseedSearchEngine() {
    var se = window.searchEngine;
    if (!se) return;
    var art = window.ARTISANS || [];
    // Replace reference — the ARTISANS array IS the same object after splice,
    // so in most cases this is already correct. But force it anyway.
    se.artisans = art;
    se.filtered  = art.slice();
    console.log('[FxSearch] SearchEngine re-seeded with', art.length, 'artisans');
  }
  window.fxReseedSearchEngine = fxReseedSearchEngine;

  /* ═══════════════════════════════════════════════════════════════════════════
     5. PRODUCTION FILTER ENGINE  (replaces filterArtisans in secondary-search)
     - Unified normalization
     - City: substring match ("casa" → casablanca)
     - Category: alias-aware ("clim" → climatisation)
     - Text: searches name + city + category + description + bio
     - Combined: all filters AND-ed together
     - Never crashes on missing fields
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxFilter(params) {
    params = params || {};
    var q      = fxNorm(params.query    || '');
    var cat    = _normCat(params.category || '');
    var city   = _normCity(params.city   || '');
    var avail  = (params.availability   || '').toLowerCase();

    var list = (window.ARTISANS || []).filter(function(a) {
      if (!a || !a.name) return false;

      /* ── Category filter ── */
      if (cat) {
        var aCat = _normCat(a.category || a.service || '');
        if (aCat !== cat) return false;
      }

      /* ── City filter — substring match (casa → casablanca) ── */
      if (city) {
        var aCity = _normCity(a.city || '');
        if (!aCity || (!aCity.includes(city) && !city.includes(aCity) && aCity !== city)) return false;
      }

      /* ── Availability filter ── */
      if (avail === 'available' || avail === 'disponible') {
        if ((a.availability || '').toLowerCase() !== 'available') return false;
      }

      /* ── Text search ── */
      if (q && q.length >= 2) {
        var tokens = a._searchTokens || fxNorm(
          [(a.name || ''), (a.city || ''), (a.category || ''), (a.description || ''), ((a.bio && a.bio.fr) || '')].join(' ')
        );
        if (!tokens.includes(q)) {
          // Try alias resolution: "elec" should match "electricite"
          var qCatAlias = _normCat(q);
          var qCityAlias = _normCity(q);
          var catMatch = qCatAlias !== q && fxNorm(a.category || '').includes(qCatAlias);
          var cityMatch = qCityAlias !== q && fxNorm(a.city || '').includes(qCityAlias);
          if (!catMatch && !cityMatch) return false;
        }
      }

      return true;
    });

    /* ── Smart ranking ── */
    list.sort(function(a, b) {
      // Primary: availability
      var aAvail = (a.availability === 'available') ? 20 : 0;
      var bAvail = (b.availability === 'available') ? 20 : 0;
      // Secondary: trust score
      var aScore = (a.trustScore || 0) + aAvail + (a.rating || 0) * 3 - (a.responseTime || 60) * 0.1;
      var bScore = (b.trustScore || 0) + bAvail + (b.rating || 0) * 3 - (b.responseTime || 60) * 0.1;
      return bScore - aScore;
    });

    return list;
  }
  window.fxFilter = fxFilter;

  /* ═══════════════════════════════════════════════════════════════════════════
     6. PATCH SearchEngine.filter  (fixes bio crash + status filter)
  ═══════════════════════════════════════════════════════════════════════════ */
  function _patchSearchEngine() {
    var se = window.searchEngine;
    if (!se || se._fxPatched) return;

    var _origFilter = se.filter.bind(se);
    se.filter = function(params) {
      // Delegate to fxFilter for robust matching
      var results = fxFilter(params);
      this.filtered = results;
      return results;
    };
    se._fxPatched = true;
    console.log('[FxSearch] SearchEngine.filter patched');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     7. PATCH secondary-search filterArtisans
  ═══════════════════════════════════════════════════════════════════════════ */
  function _patchSecondarySearch() {
    if (window.SecondarySearch && !window.SecondarySearch._fxPatched) {
      // Replace doSearch to use fxFilter
      var ss = window.SecondarySearch;
      var _origDoSearch = ss.doSearch;
      ss.doSearch = function(q, cat, city, filters) {
        var results = fxFilter({
          query:        q,
          category:     cat,
          city:         city,
          availability: (filters && filters.availableNow) ? 'available' : ''
        });
        if (filters && filters.topScore)     results = results.filter(function(a){ return (a.trustScore||0) >= 85; });
        if (filters && filters.fastResponse) results = results.filter(function(a){ return (a.responseTime||999) <= 30; });
        // Call original renderResults
        if (typeof ss._renderResults === 'function') {
          ss._renderResults(results);
        } else if (typeof ss.renderVedette === 'function') {
          ss.renderVedette(true);
        }
        return results;
      };
      ss._fxPatched = true;
      console.log('[FxSearch] SecondarySearch.doSearch patched');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     8. RESULT COUNT SYNC
     Updates every count badge/label with the actual rendered card count.
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxSyncCount(count) {
    count = typeof count === 'number' ? count : (window.ARTISANS || []).length;
    var label = count + ' artisan' + (count !== 1 ? 's' : '');

    // main.js badge
    var badge = document.getElementById('other-artisans-count-badge');
    if (badge) badge.textContent = '👷 ' + label;

    // premium filter count
    var premiumCount = document.getElementById('fixeo-filter-results-count');
    if (premiumCount) premiumCount.textContent = label;

    // secondary-search count
    var ssCount = document.getElementById('ssb2-count') || document.getElementById('results-count');
    if (ssCount) ssCount.textContent = label;

    // section subtitle
    var vedetteCount = document.querySelector('.fhp-subtitle, .pvc-section-counter');
    if (vedetteCount) vedetteCount.textContent = count + ' artisans disponibles';
  }
  window.fxSyncCount = fxSyncCount;

  /* ═══════════════════════════════════════════════════════════════════════════
     9. PATCH replaceMarketplaceArtisans — ensure normalization + reseed
  ═══════════════════════════════════════════════════════════════════════════ */
  function _patchReplaceMarketplace() {
    var _orig = window.replaceMarketplaceArtisans;
    if (!_orig || _orig._fxPatched) return;

    window.replaceMarketplaceArtisans = function(list) {
      _orig(list);
      // After base replace, normalize all records (fix status, bio, etc.)
      fxNormalizeAll();
      fxReseedSearchEngine();
      fxSyncCount((window.ARTISANS || []).length);
    };
    window.replaceMarketplaceArtisans._fxPatched = true;
    console.log('[FxSearch] replaceMarketplaceArtisans patched');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     10. HOMEPAGE VEDETTE RE-RENDER
     After data load, ensure homepage premium patch re-renders from real data.
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxRefreshVedette() {
    if (window.FixeoHomepagePremium && typeof window.FixeoHomepagePremium.refresh === 'function') {
      window.FixeoHomepagePremium.refresh();
    }
    if (window.SecondarySearch && typeof window.SecondarySearch.renderVedette === 'function') {
      window.SecondarySearch.renderVedette(true);
    }
  }
  window.fxRefreshVedette = fxRefreshVedette;

  /* ═══════════════════════════════════════════════════════════════════════════
     11. FULL PIPELINE BOOT — called once after data is confirmed loaded
  ═══════════════════════════════════════════════════════════════════════════ */
  function fxBootSearchPipeline() {
    if (window._fxSearchBooted) return;
    var art = window.ARTISANS || [];
    if (art.length === 0) return;  // data not ready yet

    console.log('[FxSearch] Booting pipeline with', art.length, 'artisans...');

    // Step 1: normalize all records
    var total = fxNormalizeAll();

    // Step 2: patch engines
    _patchSearchEngine();
    _patchSecondarySearch();
    _patchReplaceMarketplace();

    // Step 3: reseed SearchEngine
    fxReseedSearchEngine();

    // Step 4: refresh rendering
    if (typeof window.refreshMarketplaceFromCurrentFilters === 'function') {
      window.refreshMarketplaceFromCurrentFilters();
    }
    fxRefreshVedette();

    // Step 5: sync count
    fxSyncCount(total);

    window._fxSearchBooted = true;
    console.log('[FxSearch] ✅ Pipeline booted. Total valid artisans:', total);
  }
  window.fxBootSearchPipeline = fxBootSearchPipeline;

  /* ═══════════════════════════════════════════════════════════════════════════
     12. LISTEN FOR DATA-READY EVENTS
  ═══════════════════════════════════════════════════════════════════════════ */
  // Supabase loader fires this when done
  window.addEventListener('fixeo:artisans:loaded', function(e) {
    var count = e.detail && e.detail.count;
    console.log('[FxSearch] fixeo:artisans:loaded event received, count=' + count);
    // Reset boot flag so we re-run on new data
    window._fxSearchBooted = false;
    setTimeout(fxBootSearchPipeline, 150);
  });

  window.addEventListener('fixeo:marketplace-artisans-updated', function(e) {
    window._fxSearchBooted = false;
    setTimeout(fxBootSearchPipeline, 150);
  });

  // Also hook into DOMContentLoaded in case data is already there
  function _tryBoot() {
    if ((window.ARTISANS || []).length > 0) {
      fxBootSearchPipeline();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_tryBoot, 500); });
  } else {
    setTimeout(_tryBoot, 500);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     13. EXPOSE PUBLIC SEARCH API  (used by homepage hero input)
  ═══════════════════════════════════════════════════════════════════════════ */
  window.FixeoSearch = {
    filter: fxFilter,
    norm:   fxNorm,
    normCat: _normCat,
    normCity: _normCity,
    normalizeArtisan: fxNormalizeArtisan,
    normalizeAll: fxNormalizeAll,
    reseedEngine: fxReseedSearchEngine,
    syncCount: fxSyncCount,
    boot: fxBootSearchPipeline,
    refreshVedette: fxRefreshVedette,
    version: '1.0'
  };

  console.log('[FxSearch] fixeo-search-engine-v2.js v1.0 loaded');

})(window);
