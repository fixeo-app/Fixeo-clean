/**
 * fixeo-artisan-directory-v1.js
 * PHASE 6B.1 — Artisan Directory Foundation V1
 *
 * Transforms artisans.html into a functional artisan directory:
 *   - Reads ?ville= and ?metier= URL params
 *   - Waits for window.ARTISANS (populated by fixeo-supabase-loader.js)
 *   - Filters + sorts using FixeoMatchingEngine where available
 *   - Renders directory cards (new artdir-* component, no homepage deps)
 *   - Manages load-more (batch 12, no numbered pagination)
 *   - Updates URL via history.replaceState on filter change
 *   - Populates context pills when params are present
 *   - Handles empty state with fallback actions
 *
 * Dependencies loaded on artisans.html:
 *   js/fixeo-cities.js          → window.FIXEO_CITIES_MAP (slug↔name)
 *   js/supabase-client.js       → window.FixeoSupabaseClient
 *   js/fixeo-supabase-loader.js → window.ARTISANS + 'fixeo:artisans:loaded' event
 *   js/fixeo-matching-engine.js → FixeoMatchingEngine.sortByMatch()
 *
 * ZERO dependency on:
 *   - main.js, homepage-v13.js, secondary-search.js
 *   - renderArtisans(), _renderPremiumGrid()
 *   - homepage DOM IDs (#artisans-container, #fixeo-homepage-vedette-grid)
 *   - artisan-card-conversion-v1.css card classes (fhp-card, pvc-*)
 *
 * State model:
 *   _state = { city, trade, allResults, visibleCount, loading }
 *
 * Geolocation: NEVER called. City from URL or localStorage only.
 */
;(function (window, document) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════════ */

  var VERSION      = '1.0';
  var BATCH        = 12;   /* initial + each load-more batch */
  var PAGE_ID      = 'artisan-directory';
  var GRID_ID      = 'artdir-grid';
  var LOADING_ID   = 'artdir-loading';
  var EMPTY_ID     = 'artdir-empty';
  var SUMMARY_ID   = 'artdir-summary';
  var CTX_ID       = 'artdir-ctx';
  var LOAD_MORE_ID = 'artdir-load-more';
  var CITY_SEL_ID  = 'artdir-city-select';
  var TRADE_SEL_ID = 'artdir-trade-select';
  var RESET_ID     = 'artdir-reset';

  /* Category maps — mirrors fixeo_homepage_premium_patch.js (not imported to avoid dep) */
  var CAT_ICONS = {
    plomberie:'🔧',electricite:'⚡',peinture:'🎨',nettoyage:'🧹',
    jardinage:'🌿',demenagement:'📦',bricolage:'🔨',climatisation:'❄️',
    menuiserie:'🪚',maconnerie:'🧱',serrurerie:'🔑',carrelage:'🏠',
    etancheite:'🛡',vitrerie:'🪟',soudure:'🔥',informatique:'💻',
    toiture:'🏠'
  };
  var CAT_LABELS = {
    plomberie:'Plomberie',electricite:'Électricité',peinture:'Peinture',
    nettoyage:'Nettoyage',jardinage:'Jardinage',demenagement:'Déménagement',
    bricolage:'Bricolage',climatisation:'Climatisation',menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie',serrurerie:'Serrurerie',carrelage:'Carrelage',
    etancheite:'Étanchéité',vitrerie:'Vitrerie',soudure:'Soudure',
    informatique:'Informatique',toiture:'Toiture'
  };

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */

  var _state = {
    city:         '',   /* canonical display name, e.g. "Casablanca" */
    trade:        '',   /* slug, e.g. "plomberie" */
    allResults:   [],   /* filtered + sorted artisan list */
    visibleCount: BATCH,
    loading:      false
  };

  /* ══════════════════════════════════════════════════════════════
     CITY NORMALIZATION
     Slug → canonical display name using FIXEO_CITIES_MAP aliases.
     Fallback: title-case the slug.
  ══════════════════════════════════════════════════════════════ */

  /** Slugify a city display name for URL params.
   *  "Casablanca" → "casablanca", "Fès" → "fes", "El Jadida" → "el-jadida"
   */
  function _cityToSlug(name) {
    if (!name) return '';
    /* NFD decompose + strip combining diacritics */
    var s = name.normalize ? name.normalize('NFD') : name;
    s = s.replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').trim();
  }

  /** Slug → canonical display name.
   *  Checks FIXEO_CITIES_MAP aliases first, then title-cases the slug.
   */
  function _slugToCity(slug) {
    if (!slug) return '';
    var normalized = slug.toLowerCase().replace(/-/g, ' ');
    var map = window.FIXEO_CITIES_MAP || [];
    for (var i = 0; i < map.length; i++) {
      var entry = map[i];
      /* Check value (canonical) */
      if (entry.value.toLowerCase() === normalized) return entry.value;
      /* Check aliases */
      var aliases = entry.aliases || [];
      for (var j = 0; j < aliases.length; j++) {
        if (aliases[j].toLowerCase() === normalized) return entry.value;
      }
    }
    /* Fallback: title-case */
    return normalized.replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  /** Sanitize raw city from localStorage (strip emoji, suffixes). */
  function _sanitizeCity(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    s = s.replace(/^\uD83D\uDCCD\s*/u, '');
    var dotIdx = s.indexOf('\u00b7');
    if (dotIdx >= 0) s = s.slice(0, dotIdx);
    var dashIdx = s.indexOf('\u2014');
    if (dashIdx >= 0) s = s.slice(0, dashIdx);
    s = s.replace(/\s+d\u00e9tect\u00e9e?\s*$/i, '').trim();
    if (!s || s.length < 2) return '';
    if (/^D\u00e9tect/i.test(s)) return '';
    if (s.indexOf('Choisir') >= 0) return '';
    if (/autour/i.test(s)) return '';
    s = s.replace(/[\uD800-\uDFFF]/g, '').trim();
    if (s.length > 30) s = s.slice(0, 30).trim();
    return s;
  }

  /* ══════════════════════════════════════════════════════════════
     URL / PARAMS
  ══════════════════════════════════════════════════════════════ */

  function _readParams() {
    var params = new URLSearchParams(window.location.search);
    var villeSlug  = (params.get('ville')  || '').toLowerCase().trim();
    var metierSlug = (params.get('metier') || '').toLowerCase().trim();

    /* City: URL → localStorage fallback */
    var city = '';
    if (villeSlug) {
      city = _slugToCity(villeSlug);
    } else {
      try {
        var stored = localStorage.getItem('fixeo_detected_city');
        city = _sanitizeCity(stored);
      } catch(_) {}
    }

    /* Trade: URL only, validate against known slugs */
    var trade = '';
    if (metierSlug && CAT_LABELS[metierSlug]) {
      trade = metierSlug;
    }

    return { city: city, trade: trade };
  }

  function _pushURL(city, trade) {
    try {
      var params = new URLSearchParams();
      if (city)  params.set('ville',  _cityToSlug(city));
      if (trade) params.set('metier', trade);
      var qs = params.toString();
      var url = window.location.pathname + (qs ? '?' + qs : '');
      window.history.replaceState(null, '', url);
    } catch(_) {}
  }

  /* ══════════════════════════════════════════════════════════════
     FILTERING & SORTING
  ══════════════════════════════════════════════════════════════ */

  function _matchCity(artisan, city) {
    if (!city) return true;
    var ac = (artisan.city || artisan.ville || '').toLowerCase();
    var wz = (artisan.work_zone || '').toLowerCase();
    var c  = city.toLowerCase();
    return ac.includes(c) || c.includes(ac) || wz.includes(c);
  }

  function _matchTrade(artisan, trade) {
    if (!trade) return true;
    var cat = (artisan.category || artisan.service || '').toLowerCase();
    var svcs = artisan.services || [];
    if (cat === trade) return true;
    for (var i = 0; i < svcs.length; i++) {
      if (String(svcs[i]).toLowerCase() === trade) return true;
    }
    return false;
  }

  function _filter(list, city, trade) {
    return list.filter(function(a) {
      return _matchCity(a, city) && _matchTrade(a, trade);
    });
  }

  function _sort(list, city, trade) {
    /* Use FixeoMatchingEngine if available */
    if (
      window.FixeoMatchingEngine &&
      typeof window.FixeoMatchingEngine.sortByMatch === 'function' &&
      (city || trade)
    ) {
      var catSlug = trade || '';
      /* MatchingEngine expects service in its own slug format */
      return window.FixeoMatchingEngine.sortByMatch(list.slice(), {
        city:    city    || '',
        service: catSlug || ''
      });
    }
    /* Simple fallback: verified first, then by rating */
    return list.slice().sort(function(a, b) {
      var av = a.verified ? 1 : 0;
      var bv = b.verified ? 1 : 0;
      if (bv !== av) return bv - av;
      return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     CARD RENDERER
  ══════════════════════════════════════════════════════════════ */

  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function _initials(name) {
    var p = String(name || '??').trim().split(/\s+/);
    return ((p[0]||'?')[0] + ((p[1]||p[0]||'?')[0])).toUpperCase();
  }

  function _buildPricing(a) {
    var from = a.price_from || a.priceFrom;
    if (!from) return null;
    var amount = parseFloat(from);
    if (!amount || isNaN(amount)) return null;
    var label = a.priceLabel || a.price_label || '';
    return {
      main: '\u00c0 partir de\u00a0' + Math.round(amount).toLocaleString('fr-FR') + '\u00a0MAD',
      hint: label || 'Tarif indicatif'
    };
  }

  function _buildCard(a) {
    var name    = _esc(a.name || a.full_name || 'Artisan Fixeo');
    var city    = _esc(a.city || a.ville || '');
    var cat     = (a.category || a.service || '').toLowerCase();
    var catIcon = CAT_ICONS[cat] || '🔧';
    var catLabel = CAT_LABELS[cat] || _esc(a.category || a.service || '');
    var desc    = (a.description || a.shortBio || '').trim();
    var photo   = a.photo || a.photo_url || a.avatar || '';
    var slug    = a.public_slug || '';
    var aid     = a.id || a._supabase_id || '';
    var pricing = _buildPricing(a);

    /* Profile href */
    var profileHref = 'artisan-profile.html?id=' + encodeURIComponent(String(aid));

    /* Avatar HTML */
    var avatarInner;
    if (photo) {
      avatarInner = '<img class="artdir-avatar-img" src="' + _esc(photo) + '"'
        + ' alt="' + name + '" loading="lazy"'
        + ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
        + '<span class="artdir-avatar-initials" style="display:none">' + _esc(_initials(a.name||'')) + '</span>';
    } else {
      avatarInner = '<span class="artdir-avatar-initials">' + _esc(_initials(a.name||'')) + '</span>';
    }

    /* Meta items */
    var metaItems = '';
    if (city)     metaItems += '<span class="artdir-card-meta-item">\uD83D\uDCCD\u00a0' + city + '</span>';
    if (catLabel) metaItems += '<span class="artdir-card-meta-item">' + _esc(catIcon) + '\u00a0' + _esc(catLabel) + '</span>';

    /* Description */
    var descHtml = desc
      ? '<p class="artdir-card-desc">' + _esc(desc) + '</p>'
      : '';

    /* Trust */
    var trustHtml =
      '<div class="artdir-card-trust">' +
        '<span class="artdir-card-trust-item">✓\u00a0Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO</span>' +
        '<span class="artdir-card-trust-item">💳\u00a0Paiement apr\u00e8s intervention</span>' +
      '</div>';

    /* Price */
    var priceHtml = '';
    if (pricing) {
      priceHtml =
        '<div class="artdir-card-price">' +
          '<span class="artdir-card-price-amount">' + _esc(pricing.main) + '</span>' +
          '<span class="artdir-card-price-hint">' + _esc(pricing.hint) + '</span>' +
        '</div>';
    }

    /* CTAs */
    var ctaHtml =
      '<div class="artdir-card-actions">' +
        '<button class="artdir-btn-reserve" type="button"'
          + ' data-artisan-id="' + _esc(String(aid)) + '"'
          + ' data-artisan-name="' + name + '"'
          + ' aria-label="R\u00e9server avec ' + name + '">'
          + 'R\u00e9server maintenant' +
        '</button>' +
        '<a class="artdir-btn-profile" href="' + _esc(profileHref) + '"'
          + ' aria-label="Voir le profil de ' + name + '">'
          + 'Voir le profil \u2192' +
        '</a>' +
      '</div>';

    return '<article class="artdir-card" data-artisan-id="' + _esc(String(aid)) + '">' +
      '<div class="artdir-avatar" aria-hidden="true">' + avatarInner + '</div>' +
      '<div class="artdir-card-body">' +
        '<div class="artdir-card-top">' +
          '<h3 class="artdir-card-name" title="' + name + '">' + name + '</h3>' +
        '</div>' +
        (metaItems ? '<div class="artdir-card-meta">' + metaItems + '</div>' : '') +
        descHtml +
        trustHtml +
        priceHtml +
        ctaHtml +
      '</div>' +
    '</article>';
  }

  /* ══════════════════════════════════════════════════════════════
     HEADER / CONTEXT UI
  ══════════════════════════════════════════════════════════════ */

  function _updateHeader(city, trade) {
    var h1 = document.querySelector('.artdir-h1');
    var ctxEl = document.getElementById(CTX_ID);
    if (!h1) return;

    var catLabel = trade ? (CAT_LABELS[trade] || trade) : '';
    var catIcon  = trade ? (CAT_ICONS[trade] || '🔧') : '';

    /* h1 text */
    var h1Text, h1Em;
    if (trade && city) {
      /* "Plombiers référencés à [Casablanca]" */
      h1Text = _catPlural(trade) + ' r\u00e9f\u00e9renc\u00e9s \u00e0\u00a0';
      h1Em   = city;
    } else if (city) {
      h1Text = 'Artisans r\u00e9f\u00e9renc\u00e9s \u00e0\u00a0';
      h1Em   = city;
    } else if (trade) {
      h1Text = _catPlural(trade) + ' r\u00e9f\u00e9renc\u00e9s sur FIXEO';
      h1Em   = '';
    } else {
      h1Text = 'Le r\u00e9seau d\u2019artisans FIXEO';
      h1Em   = '';
    }

    if (h1Em) {
      h1.innerHTML = _esc(h1Text) + '<em class="artdir-h1-em">' + _esc(h1Em) + '</em>';
    } else {
      h1.textContent = h1Text;
    }

    /* Context pills */
    if (!ctxEl) return;
    if (!city && !trade) {
      ctxEl.classList.remove('artdir-context--visible');
      ctxEl.innerHTML = '';
      return;
    }
    var pills = '';
    if (city)  pills += '<span class="artdir-ctx-pill">\uD83D\uDCCD\u00a0' + _esc(city) + '</span>';
    if (trade) pills += '<span class="artdir-ctx-pill">' + _esc(catIcon) + '\u00a0' + _esc(catLabel) + '</span>';
    ctxEl.innerHTML = pills;
    ctxEl.classList.add('artdir-context--visible');
  }

  function _catPlural(slug) {
    var map = {
      plomberie:'Plombiers',electricite:'Électriciens',peinture:'Peintres',
      nettoyage:'Agents de nettoyage',jardinage:'Jardiniers',
      demenagement:'Déménageurs',bricolage:'Bricoleurs',
      climatisation:'Techniciens climatisation',menuiserie:'Menuisiers',
      maconnerie:'Maçons',serrurerie:'Serruriers',carrelage:'Carreleurs',
      toiture:'Couvreurs',etancheite:'Étancheurs',vitrerie:'Vitriers',
      soudure:'Soudeurs',informatique:'Techniciens informatique'
    };
    return map[slug] || (CAT_LABELS[slug] || slug);
  }

  /* ══════════════════════════════════════════════════════════════
     SUMMARY
  ══════════════════════════════════════════════════════════════ */

  function _updateSummary(total, visible) {
    var el = document.getElementById(SUMMARY_ID);
    if (!el) return;
    if (!total) { el.textContent = ''; return; }
    var txt;
    if (total === 1) {
      txt = '1 artisan trouv\u00e9';
    } else if (visible < total) {
      txt = visible + '\u00a0sur\u00a0' + total + ' artisans';
    } else {
      txt = total + ' artisan' + (total > 1 ? 's' : '') + ' trouv\u00e9' + (total > 1 ? 's' : '');
    }
    el.textContent = txt;
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */

  function _showLoading(on) {
    var el = document.getElementById(LOADING_ID);
    if (!el) return;
    if (on) el.classList.add('artdir-loading--visible');
    else    el.classList.remove('artdir-loading--visible');
  }

  function _showEmpty(on) {
    var el = document.getElementById(EMPTY_ID);
    if (!el) return;
    if (on) el.classList.add('artdir-empty--visible');
    else    el.classList.remove('artdir-empty--visible');
  }

  function _renderCards() {
    var grid = document.getElementById(GRID_ID);
    if (!grid) return;

    var list    = _state.allResults;
    var visible = Math.min(_state.visibleCount, list.length);

    if (list.length === 0) {
      grid.innerHTML = '';
      _showEmpty(true);
      _updateSummary(0, 0);
      _updateLoadMore(0, 0);
      return;
    }

    _showEmpty(false);
    var html = '';
    for (var i = 0; i < visible; i++) {
      html += _buildCard(list[i]);
    }
    grid.innerHTML = html;
    _updateSummary(list.length, visible);
    _updateLoadMore(list.length, visible);
  }

  function _updateLoadMore(total, visible) {
    var btn = document.getElementById(LOAD_MORE_ID);
    if (!btn) return;
    if (visible >= total) {
      btn.hidden = true;
    } else {
      btn.hidden = false;
      var remaining = total - visible;
      btn.textContent = 'Voir plus d\u2019artisans (' + remaining + ' restant' + (remaining > 1 ? 's' : '') + ')';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     APPLY FILTERS
  ══════════════════════════════════════════════════════════════ */

  function _applyFilters(city, trade) {
    _state.city         = city  || '';
    _state.trade        = trade || '';
    _state.visibleCount = BATCH;

    var raw = window.ARTISANS || [];
    var filtered = _filter(raw, city, trade);
    _state.allResults = _sort(filtered, city, trade);

    _updateHeader(city, trade);
    _updateEmptyActions(city, trade);
    _updateSelectValues(city, trade);
    _pushURL(city, trade);
    _renderCards();
  }

  function _updateEmptyActions(city, trade) {
    /* "Voir tous les artisans à [ville]" button in empty state */
    var widenBtn = document.querySelector('.artdir-empty-btn-widen');
    if (!widenBtn) return;
    if (city && trade) {
      widenBtn.textContent = 'Voir tous les artisans \u00e0 ' + city;
      widenBtn.style.display = '';
      widenBtn.onclick = function() {
        _applyFilters(city, '');
        _syncSelects();
      };
    } else if (city) {
      widenBtn.textContent = 'Voir tous les artisans';
      widenBtn.style.display = '';
      widenBtn.onclick = function() {
        _applyFilters('', '');
        _syncSelects();
      };
    } else {
      widenBtn.style.display = 'none';
    }
  }

  function _syncSelects() {
    var cityEl  = document.getElementById(CITY_SEL_ID);
    var tradeEl = document.getElementById(TRADE_SEL_ID);
    if (cityEl)  cityEl.value  = _cityToSlug(_state.city);
    if (tradeEl) tradeEl.value = _state.trade;
  }

  function _updateSelectValues(city, trade) {
    var cityEl  = document.getElementById(CITY_SEL_ID);
    var tradeEl = document.getElementById(TRADE_SEL_ID);
    if (cityEl)  cityEl.value  = _cityToSlug(city);
    if (tradeEl) tradeEl.value = trade || '';
  }

  /* ══════════════════════════════════════════════════════════════
     SELECT BUILDERS
  ══════════════════════════════════════════════════════════════ */

  function _populateCitySelect(currentSlug) {
    var el = document.getElementById(CITY_SEL_ID);
    if (!el) return;
    var map = window.FIXEO_CITIES_MAP || [];
    var opts = '<option value="">Toutes les villes</option>';
    map.forEach(function(c) {
      var slug = _cityToSlug(c.value);
      var sel  = slug === currentSlug ? ' selected' : '';
      opts += '<option value="' + _esc(slug) + '"' + sel + '>' + _esc(c.label) + '</option>';
    });
    el.innerHTML = opts;
  }

  function _populateTradeSelect(currentTrade) {
    var el = document.getElementById(TRADE_SEL_ID);
    if (!el) return;
    var opts = '<option value="">Tous les métiers</option>';
    Object.keys(CAT_LABELS).forEach(function(slug) {
      var sel = slug === currentTrade ? ' selected' : '';
      opts += '<option value="' + _esc(slug) + '"' + sel + '>' + _esc(CAT_ICONS[slug]||'') + '\u00a0' + _esc(CAT_LABELS[slug]) + '</option>';
    });
    el.innerHTML = opts;
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT BINDING
  ══════════════════════════════════════════════════════════════ */

  function _bindEvents() {
    /* City select change */
    var cityEl = document.getElementById(CITY_SEL_ID);
    if (cityEl) {
      cityEl.addEventListener('change', function() {
        var slug = cityEl.value;
        var city = slug ? _slugToCity(slug) : '';
        _applyFilters(city, _state.trade);
      });
    }

    /* Trade select change */
    var tradeEl = document.getElementById(TRADE_SEL_ID);
    if (tradeEl) {
      tradeEl.addEventListener('change', function() {
        _applyFilters(_state.city, tradeEl.value || '');
      });
    }

    /* Reset */
    var resetEl = document.getElementById(RESET_ID);
    if (resetEl) {
      resetEl.addEventListener('click', function() {
        _applyFilters('', '');
        _syncSelects();
      });
    }

    /* Load more */
    var loadMoreEl = document.getElementById(LOAD_MORE_ID);
    if (loadMoreEl) {
      loadMoreEl.addEventListener('click', function() {
        _state.visibleCount += BATCH;
        _renderCards();
      });
    }

    /* Reserve button — delegate to section */
    var section = document.getElementById(PAGE_ID);
    if (section) {
      section.addEventListener('click', function(e) {
        var btn = e.target.closest('.artdir-btn-reserve');
        if (!btn) return;
        var aid  = btn.getAttribute('data-artisan-id');
        var aname = btn.getAttribute('data-artisan-name');

        /* Open RAFI/request form with prefilled artisan context if available */
        if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
          window.FixeoClientRequest.open({ artisanId: aid, artisanName: aname });
          return;
        }
        /* Fallback: trigger existing data-open-request-form handler */
        var trigger = document.querySelector('[data-open-request-form]');
        if (trigger) {
          trigger.click();
          return;
        }
        /* Last resort: profile page */
        if (aid) {
          window.location.href = 'artisan-profile.html?id=' + encodeURIComponent(aid);
        }
      });
    }

    /* Métier pills in existing page sections → filter directory */
    var metierItems = document.querySelectorAll('.cp-metier-item[data-metier]');
    metierItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var slug = item.getAttribute('data-metier');
        if (!slug) return;
        var tradeEl2 = document.getElementById(TRADE_SEL_ID);
        if (tradeEl2) tradeEl2.value = slug;
        _applyFilters(_state.city, slug);
        /* Scroll to directory */
        var dir = document.getElementById(PAGE_ID);
        if (dir) dir.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* City pills in existing page sections → filter directory */
    var cityPills = document.querySelectorAll('.cp-city-pill[data-city]');
    cityPills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        var cityName = pill.getAttribute('data-city');
        if (!cityName) return;
        var slug = _cityToSlug(cityName);
        var cityEl2 = document.getElementById(CITY_SEL_ID);
        if (cityEl2) cityEl2.value = slug;
        _applyFilters(cityName, _state.trade);
        var dir = document.getElementById(PAGE_ID);
        if (dir) dir.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */

  function _init() {
    /* Only run on artisans.html */
    if (!document.getElementById(PAGE_ID)) return;

    var params = _readParams();
    var city   = params.city;
    var trade  = params.trade;
    var citySlug  = _cityToSlug(city);
    var tradeSlug = trade;

    /* Populate selects */
    _populateCitySelect(citySlug);
    _populateTradeSelect(tradeSlug);

    /* Show loading */
    _showLoading(true);
    _updateHeader(city, trade);

    /* Bind UI events */
    _bindEvents();

    /* If ARTISANS already populated (cached) — render immediately */
    if (window.ARTISANS && window.ARTISANS.length > 0) {
      _showLoading(false);
      _applyFilters(city, trade);
      return;
    }

    /* Wait for supabase-loader to dispatch 'fixeo:artisans:loaded' */
    window.addEventListener('fixeo:artisans:loaded', function _onLoaded() {
      window.removeEventListener('fixeo:artisans:loaded', _onLoaded);
      _showLoading(false);
      _applyFilters(city, trade);
    });

    /* Fallback polling if event never fires (localStorage offline data) */
    var _poll = 0;
    var _pollId = setInterval(function() {
      _poll++;
      if (window.ARTISANS && window.ARTISANS.length > 0) {
        clearInterval(_pollId);
        _showLoading(false);
        _applyFilters(city, trade);
        return;
      }
      if (_poll > 30) { /* 15s max */
        clearInterval(_pollId);
        _showLoading(false);
        /* Show empty state with helpful fallback */
        _state.allResults = [];
        _renderCards();
      }
    }, 500);
  }

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* Public API (minimal) */
  window.FixeoArtisanDirectory = {
    version:       VERSION,
    applyFilters:  _applyFilters,
    state:         _state,
  };

}(window, document));
