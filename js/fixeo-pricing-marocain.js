/**
 * fixeo-pricing-marocain.js  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces hourly pricing (/h, MAD/h, hourlyRate) with Moroccan market
 * fixed-estimate tariffs.
 *
 * Tarifs par service (fourchettes marché Maroc):
 *   Plomberie:      150-300 MAD (fuite), 250-500 (WC), 150-350 (débouchage)
 *   Electricité:    100-200 MAD (prise), 120-250 (luminaire), 200-400 (panne)
 *   Peinture:       800-1500 MAD (chambre), 1200-2500 (salon)
 *   Climatisation:  500-900 MAD (install), 200-350 (entretien)
 *   Menuiserie:     400-900 MAD (porte), 150-400 (réparation)
 *   + autres métiers
 *
 * DISPLAY FORMAT:
 *   "À partir de X MAD"  →  priceType: 'fixed_estimate'
 *   "Estimation X-Y MAD" →  priceRange
 *
 * ZERO UI/CSS changes. Patches data layer only.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     TARIFS MARCHÉ MAROCAIN
  ══════════════════════════════════════════════════════════ */
  var SERVICE_PRICING = {
    plomberie:     { from: 150, to: 350, label: 'À partir de 150 MAD', range: '150–350 MAD' },
    electricite:   { from: 100, to: 400, label: 'À partir de 100 MAD', range: '100–400 MAD' },
    peinture:      { from: 800, to: 2500, label: 'À partir de 800 MAD', range: '800–2500 MAD' },
    climatisation: { from: 200, to: 900, label: 'À partir de 200 MAD', range: '200–900 MAD' },
    menuiserie:    { from: 150, to: 900, label: 'À partir de 150 MAD', range: '150–900 MAD' },
    serrurerie:    { from: 150, to: 400, label: 'À partir de 150 MAD', range: '150–400 MAD' },
    maconnerie:    { from: 200, to: 800, label: 'À partir de 200 MAD', range: '200–800 MAD' },
    carrelage:     { from: 150, to: 600, label: 'À partir de 150 MAD', range: '150–600 MAD' },
    nettoyage:     { from: 200, to: 600, label: 'À partir de 200 MAD', range: '200–600 MAD' },
    jardinage:     { from: 150, to: 500, label: 'À partir de 150 MAD', range: '150–500 MAD' },
    bricolage:     { from: 100, to: 400, label: 'À partir de 100 MAD', range: '100–400 MAD' },
    demenagement:  { from: 500, to: 2000, label: 'À partir de 500 MAD', range: '500–2000 MAD' },
    toiture:       { from: 300, to: 1200, label: 'À partir de 300 MAD', range: '300–1200 MAD' },
    vitrerie:      { from: 200, to: 700, label: 'À partir de 200 MAD', range: '200–700 MAD' },
    chauffage:     { from: 200, to: 600, label: 'À partir de 200 MAD', range: '200–600 MAD' },
    _default:      { from: 150, to: 500, label: 'Devis rapide', range: 'Sur devis' },
    // seed-specific normalized categories
    'plomberieurgence': { from: 150, to: 350, label: '\u00c0 partir de 150 MAD', range: '150\u2013350 MAD' },
    'electriciteurgence': { from: 100, to: 400, label: '\u00c0 partir de 100 MAD', range: '100\u2013400 MAD' },
    'securite':    { from: 150, to: 500, label: '\u00c0 partir de 150 MAD', range: '150\u2013500 MAD' },
    'placo':       { from: 150, to: 600, label: '\u00c0 partir de 150 MAD', range: '150\u2013600 MAD' },
    'aluminium':   { from: 200, to: 800, label: '\u00c0 partir de 200 MAD', range: '200\u2013800 MAD' },
    'electromenager': { from: 100, to: 400, label: '\u00c0 partir de 100 MAD', range: '100\u2013400 MAD' },
    'etancheite':  { from: 250, to: 900, label: '\u00c0 partir de 250 MAD', range: '250\u2013900 MAD' },
    'piscine':     { from: 300, to: 1200, label: '\u00c0 partir de 300 MAD', range: '300\u20131200 MAD' },
    'cuisine':     { from: 500, to: 2000, label: '\u00c0 partir de 500 MAD', range: '500\u20132000 MAD' },
  };

  function _normalizeService(s) {
    if (!s) return '_default';
    var n = String(s).toLowerCase()
      .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a').replace(/ç/g,'c')
      .trim();
    return SERVICE_PRICING[n] ? n : '_default';
  }

  function getPricing(service) {
    return SERVICE_PRICING[_normalizeService(service)] || SERVICE_PRICING._default;
  }

  /* ══════════════════════════════════════════════════════════
     PATCH ARTISAN RECORD — set fixed estimate pricing
  ══════════════════════════════════════════════════════════ */
  function patchArtisanPricing(artisan) {
    // Prefer category (normalized chip key) over service (may be capitalized variant)
    var svc = artisan.category || artisan.service || '';
    var p = getPricing(svc);
    artisan.priceFrom  = p.from;
    artisan.priceTo    = p.to;
    artisan.priceRange = p.range;
    artisan.priceLabel = p.label;
    artisan.priceType  = 'fixed_estimate';
    artisan.priceUnit  = 'intervention';  // replaces 'h'
    artisan.hasPriceData = true;
    return artisan;
  }

  /* ══════════════════════════════════════════════════════════
     PATCH window.ARTISANS ARRAY
  ══════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════
     CATEGORY NORMALIZATION — maps seed categories to chip keys
  ══════════════════════════════════════════════════════════ */
  var CATEGORY_MAP = {
    // plomberie
    'plomberieurgence': 'plomberie',
    'plombier': 'plomberie',
    // electricite
    'electriciteurgence': 'electricite',
    'electricien': 'electricite',
    // peinture
    'peintre': 'peinture',
    // serrurerie
    'serrurier': 'serrurerie',
    // maconnerie
    'maon': 'maconnerie',
    'maçon': 'maconnerie',
    // menuiserie
    'menuisier': 'menuiserie',
    // nettoyage
    // carrelage
    'carreleur': 'carrelage',
    // various → bricolage
    'placo': 'bricolage',
    'aluminium': 'menuiserie',
    'electromenager': 'bricolage',
    // specific
    'securite': 'electricite',
    'camera': 'electricite',
    'piscine': 'bricolage',
    'etancheite': 'toiture',
    'cuisine': 'menuiserie',
  };

  function _normalizeArtisanCategory(a) {
    if (!a || !a.category) return;
    var raw = String(a.category).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '').trim();
    var mapped = CATEGORY_MAP[raw];
    if (mapped) {
      a._originalCategory = a.category;
      a.category = mapped;
    }
  }

  function patchAllArtisans() {
    if (!window.ARTISANS || !Array.isArray(window.ARTISANS)) return 0;
    var patched = 0;
    window.ARTISANS.forEach(function (a) {
      // Normalize category to chip keys (plomberieurgence → plomberie, etc.)
      _normalizeArtisanCategory(a);
      // Always patch — set fixed_estimate pricing for every artisan
      patchArtisanPricing(a);
      patched++;
    });
    if (window._fixeoDebug && patched > 0) {
      console.log('[fixeo-pricing] Patched', patched, 'artisans with Moroccan fixed-estimate pricing');
    }
    return patched;
  }

  /* ══════════════════════════════════════════════════════════
     PATCH i18n art_per_hour
  ══════════════════════════════════════════════════════════ */
  function patchI18n() {
    if (!window.i18n) return;
    var langs = ['fr', 'ar', 'en'];
    langs.forEach(function (lang) {
      if (window.i18n[lang] && window.i18n[lang].art_per_hour !== undefined) {
        window.i18n[lang].art_per_hour = 'intervention';
      }
    });
    // Also patch i18n.t() result if cached
    if (window.i18n.current && window.i18n.current.art_per_hour !== undefined) {
      window.i18n.current.art_per_hour = 'intervention';
    }
  }

  /* ══════════════════════════════════════════════════════════
     DOM PATCH: Replace rendered "/h" and "MAD/h" text nodes
     in artisan cards AFTER render (non-destructive mutation)
  ══════════════════════════════════════════════════════════ */
  function _patchTextNode(node) {
    if (node.nodeType !== 3) return; // text nodes only
    var text = node.textContent;
    // Replace "/h" and "MAD/h" patterns
    var patched = text
      .replace(/(\d+)\s*MAD\s*\/\s*h(eure)?\b/gi, '$1 MAD/interv.')
      .replace(/par\s+h(eure)?\b/gi, 'par intervention')
      .replace(/\bMAD\/h\b/gi, 'MAD/interv.')
      .replace(/\b\/h\b/g, '/interv.');
    if (patched !== text) {
      node.textContent = patched;
    }
  }

  function patchRenderedCards() {
    var containers = [
      document.getElementById('artisans-section'),
      document.getElementById('top-artisans'),
      document.getElementById('secondary-search-section'),
    ];
    containers.forEach(function (container) {
      if (!container) return;
      var walker = document.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
      var node;
      while ((node = walker.nextNode())) {
        _patchTextNode(node);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     OBSERVE and patch after re-renders
  ══════════════════════════════════════════════════════════ */
  var _observer = null;
  function _watchCards() {
    if (_observer || !window.MutationObserver) return;
    var targets = ['artisans-section', 'top-artisans', 'secondary-search-section'];
    targets.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var obs = new MutationObserver(function (mutations) {
        var needsPatch = mutations.some(function (m) { return m.addedNodes.length > 0; });
        if (needsPatch) {
          setTimeout(patchRenderedCards, 30);
        }
      });
      obs.observe(el, { childList: true, subtree: true });
    });
  }

  /* ══════════════════════════════════════════════════════════
     _fpb() — price badge HTML helper (used by main.js card render)
  ══════════════════════════════════════════════════════════ */
  function _priceBadgeHTML(a) {
    var from  = a.priceFrom || 150;
    var lbl   = a.priceLabel || ('\u00c0 partir de ' + from + ' MAD');
    var sub   = a.priceRange ? ('Fourchette ' + a.priceRange) : 'Estimation intervention';
    return (
      '<div class="fixeo-price-badge">' +
        '<span class="fpb-label">Prix indicatif march\u00e9</span>' +
        '<span class="fpb-from">' + lbl + '</span>' +
        '<span class="fpb-sub">' + sub + '</span>' +
      '</div>'
    );
  }
  window._fpb = _priceBadgeHTML;

  /* ══════════════════════════════════════════════════════════
     INJECT PRICE BADGE CSS (once, on first load)
  ══════════════════════════════════════════════════════════ */
  function _injectCSS() {
    if (document.getElementById('fixeo-price-badge-css')) return;
    var style = document.createElement('style');
    style.id = 'fixeo-price-badge-css';
    style.textContent = [
      /* Badge wrapper */
      '.fixeo-price-badge-wrap { margin-left:auto; flex-shrink:0; }',
      '.fixeo-price-badge {',
      '  display:flex; flex-direction:column; align-items:flex-end;',
      '  gap:2px; padding:8px 12px; border-radius:14px;',
      '  background:rgba(255,255,255,0.045);',
      '  border:1px solid rgba(255,255,255,0.08);',
      '  backdrop-filter:blur(8px);',
      '  -webkit-backdrop-filter:blur(8px);',
      '  min-width:128px; text-align:right;',
      '}',
      /* Label "Prix indicatif marché" */
      '.fpb-label {',
      '  display:block;',
      '  font-size:0.62rem; font-weight:600; letter-spacing:0.04em;',
      '  color:rgba(255,255,255,0.35);',
      '  text-transform:uppercase;',
      '  margin-bottom:1px;',
      '}',
      /* "À partir de 150 MAD" */
      '.fpb-from {',
      '  display:block;',
      '  font-size:0.96rem; font-weight:700; line-height:1.15;',
      '  color:#ffd166;',
      '}',
      '.fpb-from strong { font-weight:800; }',
      /* "Fourchette 150–350 MAD" */
      '.fpb-sub {',
      '  display:block;',
      '  font-size:0.70rem; font-weight:500;',
      '  color:rgba(255,255,255,0.50);',
      '  margin-top:1px;',
      '}',
      /* pvc-card (vedette) overrides */
      '.pvc-card .pvc-price {',
      '  display:flex; flex-direction:column; align-items:flex-start; gap:1px;',
      '}',
      '.pvc-card .pvc-price .fpb-from { font-size:0.90rem; color:#ffd166; }',
      '.pvc-card .pvc-price .pvc-unit {',
      '  font-size:0.68rem; color:rgba(255,255,255,0.45);',
      '  font-weight:500;',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  window.FixeoPricing = {
    getPricing:          getPricing,
    patchArtisan:        patchArtisanPricing,
    patchAll:            patchAllArtisans,
    patchRendered:       patchRenderedCards,
    SERVICE_PRICING:     SERVICE_PRICING,
  };

  /* ── Boot ── */
  function _boot() {
    function _init() {
      _injectCSS();
      patchI18n();
      patchAllArtisans();
      patchRenderedCards();
      _watchCards();

      // Re-patch after marketplace loads
      window.addEventListener('fixeo:marketplace-artisans-updated', function () {
        setTimeout(function () {
          patchAllArtisans();
          patchRenderedCards();
        }, 100);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _init);
    } else {
      setTimeout(_init, 200);
    }
  }

  _boot();

})(window);
