/**
 * fixeo-marketplace-density.js  v2c2a (V2-C2A)
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest marketplace density layer.
 * Improves low-density and empty states without inventing activity.
 *
 * Responsibilities:
 *  1. Enhance #no-artisan empty state (results.html) — actionable, calm, local
 *  2. Adjacent-city suggestion when city filter returns 0 results
 *  3. Category density indicator (shows artisan count for selected category)
 *  4. "Submit request" CTA when no artisans shown — keeps client in the funnel
 *  5. Availability influence on card ordering (available artisans surface first)
 *
 * ZERO fake signals:
 *  - No "X artisans online now" counters
 *  - No fake urgency
 *  - No synthetic activity timestamps
 *  - No ranking manipulation
 *  - No polling / realtime infrastructure
 *
 * Architecture: passive observer, event-driven, append-only CSS via data-attrs.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     ADJACENT CITY MAP (mirrors fixeo-matching-engine.js)
  ══════════════════════════════════════════════════════════ */
  var ZONES = {
    'Casablanca':   ['Mohammedia', 'Berrechid', 'El Jadida', 'Settat', 'Khouribga'],
    'Rabat':        ['Salé', 'Temara', 'Kénitra'],
    'Marrakech':    ['Safi', 'Agadir', 'Béni Mellal'],
    'Tanger':       ['Tétouan'],
    'Fès':          ['Meknès', 'Errachidia'],
    'Agadir':       ['Inezgane', 'Safi', 'Laâyoune'],
    'Meknès':       ['Fès'],
    'Tétouan':      ['Tanger'],
    'Oujda':        [],
    'Kénitra':      ['Rabat', 'Salé'],
    'Safi':         ['Marrakech'],
    'El Jadida':    ['Casablanca'],
    'Mohammedia':   ['Casablanca'],
    'Salé':         ['Rabat', 'Kénitra'],
    'Temara':       ['Rabat'],
    // V2-C2A: Southern / eastern cities absent from original map
    'Ouarzazate':   ['Marrakech', 'Agadir'],
    'Errachidia':   ['Fès', 'Meknès'],
    'Laâyoune':     ['Agadir'],
    'Dakhla':       ['Laâyoune'],
    'Béni Mellal':  ['Marrakech', 'Casablanca'],
    'Khouribga':    ['Casablanca', 'Béni Mellal'],
    'Settat':       ['Casablanca'],
    'Inezgane':     ['Agadir'],
    'Berrechid':    ['Casablanca'],
    'Nador':        ['Oujda'],
    'Taza':         ['Fès', 'Oujda'],
  };

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _getContext() {
    // V2-C2A: results.html urgent-flow uses results-filter-city (the visible
    // <select> populated by urgent-results.js), NOT filter-city (hidden input).
    // Priority: results-filter-city → filter-city → ssb2 → services-city-filter
    var cityEl = document.getElementById('results-filter-city')
               || document.getElementById('filter-city')
               || document.getElementById('ssb2-select-city')
               || document.getElementById('services-city-filter');
    var catEl  = document.getElementById('filter-category')
               || document.getElementById('ssb2-select-cat');
    var city = (cityEl && cityEl.value) ? cityEl.value.trim() : '';
    var service = (catEl && catEl.value) ? catEl.value.trim() : '';

    // V2-C2A: Also read city/service from URL params for results.html context
    // so _buildEmptyStateContent gets correct city even before filter select is wired.
    if (!city || !service) {
      try {
        var params = new URLSearchParams(window.location.search);
        if (!city)    city    = (params.get('city')  || '').trim();
        if (!service) service = (params.get('query') || params.get('category') || params.get('service') || '').trim();
      } catch (e) {}
    }

    return { city: city, service: service };
  }

  /* ══════════════════════════════════════════════════════════
     EMPTY STATE ENHANCEMENT — #no-artisan
  ══════════════════════════════════════════════════════════ */

  var _emptyEl    = null;
  var _lastCtx    = null;
  var _observer   = null;

  function _buildEmptyStateContent(ctx, adjacentCities, adjacentCount) {
    var hasCity    = !!(ctx.city);
    var hasService = !!(ctx.service);

    /* Title: honest, local, never alarming */
    var title = hasCity && hasService
      ? 'Aucun artisan ' + _esc(ctx.service) + ' disponible \u00e0 ' + _esc(ctx.city) + ' pour le moment'
      : hasCity
      ? 'Aucun artisan disponible \u00e0 ' + _esc(ctx.city) + ' pour le moment'
      : hasService
      ? 'Aucun artisan ' + _esc(ctx.service) + ' disponible pour le moment'
      : 'Aucun artisan disponible pour le moment';

    /* Subtitle: explain without alarming */
    var subtitle = hasCity
      ? 'Le march\u00e9 local peut \u00eatre en croissance dans votre ville. Votre demande sera visible des artisans d\u00e8s leur inscription.'
      : 'Essayez d\u2019affiner votre recherche par ville ou cat\u00e9gorie.';

    /* Adjacent city suggestion (honest density signal) */
    var adjHtml = '';
    if (hasCity && adjacentCities.length > 0 && adjacentCount > 0) {
      adjHtml = '<div class="fxmd-adj-suggestion">'
        + '<div class="fxmd-adj-icon">\ud83d\udccc</div>'
        + '<div class="fxmd-adj-body">'
        + '<div class="fxmd-adj-title">' + adjacentCount + ' artisan' + (adjacentCount > 1 ? 's' : '') + ' disponible' + (adjacentCount > 1 ? 's' : '') + ' dans une ville proche</div>'
        + '<div class="fxmd-adj-cities">'
        + adjacentCities.slice(0, 3).map(function (c) {
            return '<button class="fxmd-adj-chip" data-density-city="' + _esc(c) + '">' + _esc(c) + '</button>';
          }).join('')
        + '</div>'
        + '</div>'
        + '</div>';
    }

    /* "Déposer quand même" CTA — keeps client in funnel honestly */
    var ctaHtml = '<div class="fxmd-submit-cta">'
      + '<div class="fxmd-submit-title">Pas d\u2019artisan disponible maintenant\u00a0?</div>'
      + '<div class="fxmd-submit-sub">D\u00e9posez votre demande — Fixeo vous contactera d\u00e8s qu\u2019un artisan est disponible' + (hasCity ? ' \u00e0 ' + _esc(ctx.city) : '') + '.</div>'
      + '<button class="fxmd-submit-btn" id="fxmd-submit-request-btn">D\u00e9poser une demande \u203a</button>'
      + '</div>';

    return '<div class="fxmd-empty-wrap">'
      + '<div class="fxmd-empty-icon">\ud83d\udd0d</div>'
      + '<div class="fxmd-empty-title">' + title + '</div>'
      + '<div class="fxmd-empty-sub">' + subtitle + '</div>'
      + adjHtml
      + ctaHtml
      + '</div>';
  }

  function _getAdjacentArtisans(city) {
    var artisans = window.ARTISANS || [];
    if (!city || !artisans.length) return { cities: [], count: 0 };
    var zones = ZONES[city] || [];
    if (!zones.length) return { cities: [], count: 0 };
    var normZones = zones.map(_norm);
    var found = artisans.filter(function (a) {
      return a.status === 'active' &&
             (a.availability === 'available' || a.availability === 'available_today' || !a.availability || a.availability === '') &&
             normZones.indexOf(_norm(a.city || '')) >= 0;
    });
    /* Which adjacent cities actually have artisans */
    var citiesToShow = zones.filter(function (c) {
      return found.some(function (a) { return _norm(a.city) === _norm(c); });
    });
    return { cities: citiesToShow, count: found.length };
  }

  function _renderEmptyState() {
    var emptyEl = document.getElementById('no-artisan');
    if (!emptyEl || emptyEl.style.display === 'none') return;
    var ctx = _getContext();
    var adj = _getAdjacentArtisans(ctx.city);

    /* Check if we already rendered this exact context */
    var ctxStr = ctx.city + '|' + ctx.service;
    if (_lastCtx === ctxStr && emptyEl.querySelector('.fxmd-empty-wrap')) return;
    _lastCtx = ctxStr;

    emptyEl.innerHTML = _buildEmptyStateContent(ctx, adj.cities, adj.count);

    /* Wire adjacent city chips */
    emptyEl.querySelectorAll('.fxmd-adj-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var city = btn.getAttribute('data-density-city');
        if (!city) return;
        var cityEl = document.getElementById('filter-city');
        if (cityEl) {
          cityEl.value = city;
          cityEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        try { window.FIXEO_DETECTED_CITY = city; } catch (e) {}
      });
    });

    /* Wire submit CTA */
    var submitBtn = document.getElementById('fxmd-submit-request-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        /* Open client request form if available */
        if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
          window.FixeoClientRequest.open();
        } else {
          /* Fallback: scroll to search */
          var hero = document.querySelector('.hero-section, .search-box, #hero-search');
          if (hero) hero.scrollIntoView({ behavior: 'smooth' });
          else window.location.href = 'index.html#services';
        }
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     OBSERVE #no-artisan visibility changes
  ══════════════════════════════════════════════════════════ */
  function _watchEmptyEl() {
    var el = document.getElementById('no-artisan');
    if (!el) return;
    _emptyEl = el;

    /* Initial check */
    if (el.style.display !== 'none') _renderEmptyState();

    /* Observe attribute + style changes */
    if (typeof MutationObserver !== 'undefined') {
      _observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'hidden')) {
            var target = m.target;
            if (target.style.display !== 'none' && !target.hidden) {
              _renderEmptyState();
            }
          }
        });
      });
      _observer.observe(el, { attributes: true, attributeFilter: ['style', 'hidden'] });
    }
  }

  /* ══════════════════════════════════════════════════════════
     AVAILABILITY SURFACE — artisan cards badge refresh
     When V1-C bridge updates availability in marketplace pool,
     refresh visible card availability badges without full re-render.
  ══════════════════════════════════════════════════════════ */
  function _refreshAvailBadges() {
    var artisans = window.ARTISANS || [];
    var pool = [];
    try {
      pool = JSON.parse(localStorage.getItem('fixeo_admin_artisans_v21') || '[]');
    } catch (e) {}

    /* Build id → availability map from pool (most recent writes) */
    var availMap = {};
    pool.forEach(function (a) {
      if (a.id) availMap[String(a.id)] = a.availability || '';
    });

    if (!Object.keys(availMap).length) return;

    /* Update ARTISANS array in-place (next render will pick up) */
    artisans.forEach(function (a) {
      var newAvail = availMap[String(a.id)];
      if (newAvail !== undefined && newAvail !== a.availability) {
        a.availability = newAvail;
      }
    });

    /* Update visible card badges (DOM patch — no full re-render) */
    document.querySelectorAll('.pvc-card[data-artisan-id]').forEach(function (card) {
      var id = card.getAttribute('data-artisan-id');
      if (!id || availMap[id] === undefined) return;
      var badge = card.querySelector('.pvc-avail-badge');
      if (!badge) return;
      var newAvail = availMap[id];
      var isAvail = (newAvail === 'available' || newAvail === 'available_today');
      badge.className = isAvail
        ? 'pvc-avail-badge pvc-avail-badge--on'
        : 'pvc-avail-badge pvc-avail-badge--off';
      badge.textContent = isAvail ? '\ud83d\udfe2 Disponible' : 'Sur RDV';
    });
  }

  /* ══════════════════════════════════════════════════════════
     LISTEN: filter changes → re-check empty state
  ══════════════════════════════════════════════════════════ */
  function _bindFilterListeners() {
    // V2-C2A: results.html uses results-filter-city, not filter-city.
    // Bind both so empty-state re-renders correctly on city dropdown change.
    var cityIds = ['filter-city', 'results-filter-city'];
    var catEl   = document.getElementById('filter-category');
    cityIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () {
        setTimeout(_renderEmptyState, 300);
      });
    });
    if (catEl) catEl.addEventListener('change', function () {
      setTimeout(_renderEmptyState, 300);
    });
  }

  /* ══════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════ */
  function _init() {
    _watchEmptyEl();
    _bindFilterListeners();

    /* Listen for marketplace availability updates from V1-C dashboard */
    window.addEventListener('storage', function (e) {
      if (e.key === 'fixeo_admin_artisans_v21') {
        setTimeout(_refreshAvailBadges, 200);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

  /* ── Public API ── */
  window.FixeoMarketplaceDensity = {
    refresh:             _renderEmptyState,
    refreshAvailBadges:  _refreshAvailBadges,
  };

})(window);
