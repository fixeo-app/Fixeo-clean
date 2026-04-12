/**
 * fixeo_homepage_premium_patch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Patches the homepage "#artisans-section" to display a premium 2-column
 * pvc-card grid instead of the old results-layout (left filters + standard cards).
 *
 * Strategy:
 *  • In HOMEPAGE MODE (no active search query) → inject premium vedette grid
 *  • In SEARCH MODE (user typed / filtered) → restore original layout silently
 *  • All existing renderArtisans / main.js / search logic untouched
 *
 * Included after: main.js, fixeo_seed_patch.js, secondary-search.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  /* ── Config ── */
  var HOMEPAGE_MAX_CARDS = 6;    /* cards shown in homepage vedette grid */
  var HOMEPAGE_GRID_ID   = 'fixeo-homepage-vedette-grid';
  var SECTION_ID         = 'artisans-section';

  /* ── State ── */
  var _homepageMode = true;       /* true = showing premium grid */
  var _originalRenderArtisans = null;
  var _installed = false;

  /* ══════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════ */

  var CAT_ICONS = {
    plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹',
    jardinage:'🌿', demenagement:'📦', bricolage:'🔨', climatisation:'❄️',
    menuiserie:'🪚', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🏠',
    etancheite:'🛡', vitrerie:'🪟', soudure:'🔥', informatique:'💻'
  };
  var CAT_LABELS = {
    plomberie:'Plomberie', electricite:'Électricité', peinture:'Peinture',
    nettoyage:'Nettoyage', jardinage:'Jardinage', demenagement:'Déménagement',
    bricolage:'Bricolage', climatisation:'Climatisation', menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie', serrurerie:'Serrurerie', carrelage:'Carrelage',
    etancheite:'Étanchéité', vitrerie:'Vitrerie', soudure:'Soudure',
    informatique:'Informatique'
  };

  function _initials(name) {
    if (!name) return '??';
    var p = String(name).trim().split(/\s+/);
    return ((p[0] || '?')[0] + ((p[1] || p[0] || '?')[1] || (p[0] || '?')[0])).toUpperCase();
  }

  function _stars(r) {
    var f = Math.round(parseFloat(r) * 2) / 2;
    var s = '';
    for (var i = 1; i <= 5; i++) {
      s += i <= f ? '★' : (f >= i - 0.5 ? '½' : '☆');
    }
    return s;
  }

  /* Priority sort: real artisans first, seeds as fallback */
  function _sortList(list) {
    var real  = list.filter(function(a) { return !a.claimable && !a._isSeed; });
    var seeds = list.filter(function(a) { return  a.claimable ||  a._isSeed; });
    function score(a) {
      return (a.trustScore || 0) * 1.2 +
             (a.rating || 0) * 8 +
             (a.availability === 'available' ? 18 : 0) +
             ((a.reviewCount || 0) > 10 ? 5 : 0) +
             (a.verified || a.certified ? 10 : 0);
    }
    real.sort(function(a, b)  { return score(b) - score(a); });
    seeds.sort(function(a, b) { return score(b) - score(a); });
    return real.concat(seeds);
  }

  /* Build one pvc-card (same markup as secondary-search.js renderVedetteCard) */
  function _buildPvcCard(a) {
    var avail    = (a.availability || '').toLowerCase();
    var isAvail  = avail === 'available';
    var isToday  = avail === 'available_today';
    var catIcon  = CAT_ICONS[a.category]  || '🔧';
    var catLbl   = CAT_LABELS[a.category] || (a.service || a.category || 'Service');
    var rating   = parseFloat(a.rating) || 0;
    var reviews  = parseInt(a.reviewCount || 0, 10);
    var trust    = parseInt(a.trustScore  || 0, 10);
    var rt       = parseInt(a.responseTime || 999, 10);
    var price    = parseInt(a.priceFrom || 150, 10);
    var unit     = a.priceUnit || 'h';
    var isReal   = !a.claimable && !a._isSeed;
    var isVer    = a.verified || a.certified ||
                  (a.badges || []).indexOf('verified') >= 0 || trust >= 85;

    var initials  = _initials(a.name);
    var avatarSrc = a.avatar || a.photo || a.image || '';
    var avatarHtml = avatarSrc
      ? '<img class="pvc-avatar-img" src="' + avatarSrc + '" alt="' + (a.name || '') +
        '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';' +
        'this.parentNode.querySelector(\'.pvc-avatar-initials\').style.display=\'flex\';" />' +
        '<span class="pvc-avatar-initials" style="display:none">' + initials + '</span>'
      : '<span class="pvc-avatar-initials">' + initials + '</span>';

    var availPill = isAvail
      ? '<span class="pvc-avail pvc-avail--on">🟢 Disponible</span>'
      : isToday
        ? '<span class="pvc-avail pvc-avail--today">🟡 Auj.</span>'
        : '<span class="pvc-avail pvc-avail--off">Réservation</span>';

    var badges = [];
    if (isVer)       badges.push('<span class="pvc-badge pvc-badge--verified">✔ Vérifié</span>');
    if (rt <= 30)    badges.push('<span class="pvc-badge pvc-badge--fast">⚡ Rapide</span>');
    if (trust >= 90) badges.push('<span class="pvc-badge pvc-badge--premium">🏅 Premium</span>');
    var badgesHtml = badges.slice(0, 2).join('');

    var starsHtml = rating > 0
      ? '<span class="pvc-stars">' + _stars(rating) + '</span>' +
        '<span class="pvc-rating-val">' + rating.toFixed(1) + '</span>' +
        (reviews > 0 ? '<span class="pvc-reviews">(' + reviews + ')</span>' : '')
      : '<span class="pvc-rating-empty">Nouveau</span>';

    var trustBar = trust > 0
      ? '<div class="pvc-trust-bar"><div class="pvc-trust-fill" style="width:' + trust + '%"></div></div>' +
        '<span class="pvc-trust-label">' + trust + '%</span>'
      : '';

    var realClass = isReal ? ' pvc-card--real' : '';
    var id        = a.id;
    var idJson    = JSON.stringify(id);
    var sidJson   = JSON.stringify(String(id));
    var aJson     = JSON.stringify(a);

    return '<article class="pvc-card' + realClass + '" data-artisan-id="' + id + '" tabindex="0" role="button" aria-label="Artisan ' + (a.name || '') + '">' +
      '<div class="pvc-top">' +
        '<div class="pvc-avatar">' + avatarHtml + '</div>' +
        '<div class="pvc-identity">' +
          '<h3 class="pvc-name">' + (a.name || '') + '</h3>' +
          '<p class="pvc-meta"><span class="pvc-cat-icon">' + catIcon + '</span>' + catLbl +
            ' · <span class="pvc-city">📍 ' + (a.city || 'Maroc') + '</span></p>' +
        '</div>' +
        availPill +
      '</div>' +
      (badgesHtml ? '<div class="pvc-badges">' + badgesHtml + '</div>' : '') +
      '<div class="pvc-rating-row">' +
        '<div class="pvc-rating">' + starsHtml + '</div>' +
        (trust > 0 ? '<div class="pvc-trust">' + trustBar + '</div>' : '') +
      '</div>' +
      '<div class="pvc-pricing">' +
        '<span class="pvc-price">Dès <strong>' + price + ' MAD</strong><span class="pvc-unit">/' + unit + '</span></span>' +
        (rt < 999 ? '<span class="pvc-rt">⏱ ' + rt + ' min</span>' : '') +
      '</div>' +
      '<div class="pvc-actions">' +
        '<button class="pvc-btn-primary" onclick="(window.FixeoReservation?' +
          'window.FixeoReservation.open(' + aJson + ',false):' +
          '(window.openBookingModal?window.openBookingModal(' + idJson + '):void 0));' +
          'event.stopPropagation();" aria-label="Réserver ' + (a.name || '') + '">📅 Réserver</button>' +
        '<button class="pvc-btn-secondary" onclick="(window.FixeoPublicProfileLinks?' +
          'window.FixeoPublicProfileLinks.openBySourceId(' + sidJson + ',event):' +
          '(window.openArtisanModal?window.openArtisanModal(' + idJson + '):void 0));' +
          'event.stopPropagation();" aria-label="Voir profil">Voir profil</button>' +
      '</div>' +
    '</article>';
  }

  /* ══════════════════════════════════════════════════════
     DOM HELPERS — show/hide layout pieces
  ══════════════════════════════════════════════════════ */

  function _setHomepageLayout(on) {
    /* aside filters */
    var aside = document.querySelector('#' + SECTION_ID + ' .results-filters');
    /* toolbar (count + sort) */
    var toolbar = document.querySelector('#' + SECTION_ID + ' .results-toolbar');
    /* trust strip banner */
    var strip = document.getElementById('other-artisans-banner');
    /* results header copy */
    var headerCopy = document.querySelector('#' + SECTION_ID + ' .results-header');
    /* original artisans-container */
    var originalGrid = document.getElementById('artisans-container');
    /* section header h2 kicker area */
    var kicker = document.querySelector('#' + SECTION_ID + ' .results-header-kicker');
    var titleEl = document.getElementById('results-main-title');
    var metaEl  = document.getElementById('results-main-meta');

    if (on) {
      /* HOMEPAGE MODE: hide results chrome, show premium grid */
      if (aside)       { aside.style.display = 'none'; }
      if (toolbar)     { toolbar.style.display = 'none'; }
      if (strip)       { strip.style.display = 'none'; }
      if (originalGrid){ originalGrid.style.display = 'none'; }
      /* Restyle header as a section header */
      if (headerCopy)  { headerCopy.style.display = 'none'; }
      if (kicker)      { kicker.textContent = 'SÉLECTION PREMIUM'; }
      if (titleEl)     { titleEl.textContent = '⭐ Artisans vérifiés'; }
      if (metaEl)      { metaEl.textContent = 'Professionnels les mieux notés — disponibles et vérifiés'; }

      /* Make results-layout full width (no aside column) */
      var layout = document.querySelector('#' + SECTION_ID + ' .results-layout');
      if (layout) { layout.style.display = 'block'; }
      var mainCol = document.querySelector('#' + SECTION_ID + ' .results-main-column');
      if (mainCol) { mainCol.style.width = '100%'; mainCol.style.maxWidth = '100%'; }

      /* Ensure premium grid exists */
      var pg = document.getElementById(HOMEPAGE_GRID_ID);
      if (!pg) {
        pg = document.createElement('div');
        pg.id        = HOMEPAGE_GRID_ID;
        pg.className = 'ssb2-vedette-grid';
        pg.setAttribute('aria-label', 'Artisans vérifiés — sélection premium');
        var mainColumn = document.querySelector('#' + SECTION_ID + ' .results-main-column');
        if (mainColumn) {
          mainColumn.insertBefore(pg, mainColumn.firstChild);
        } else {
          /* Fallback: append into container */
          var shell = document.querySelector('#' + SECTION_ID + ' .results-page-shell');
          if (shell) shell.appendChild(pg);
        }
      }
      pg.style.display = 'grid';

    } else {
      /* SEARCH MODE: restore original layout */
      if (aside)       { aside.style.display = ''; }
      if (toolbar)     { toolbar.style.display = ''; }
      if (strip)       { strip.style.display = ''; }
      if (originalGrid){ originalGrid.style.display = ''; }
      if (headerCopy)  { headerCopy.style.display = ''; }
      var layout2 = document.querySelector('#' + SECTION_ID + ' .results-layout');
      if (layout2) { layout2.style.display = ''; }
      var mainCol2 = document.querySelector('#' + SECTION_ID + ' .results-main-column');
      if (mainCol2) { mainCol2.style.width = ''; mainCol2.style.maxWidth = ''; }

      /* Hide premium grid */
      var pg2 = document.getElementById(HOMEPAGE_GRID_ID);
      if (pg2) { pg2.style.display = 'none'; }
    }
  }

  /* ══════════════════════════════════════════════════════
     RENDER PREMIUM VEDETTE into #fixeo-homepage-vedette-grid
  ══════════════════════════════════════════════════════ */

  function _renderHomepageVedette() {
    var pg = document.getElementById(HOMEPAGE_GRID_ID);
    if (!pg) { _setHomepageLayout(true); pg = document.getElementById(HOMEPAGE_GRID_ID); }
    if (!pg) return;

    var list = window.ARTISANS || [];
    if (!list.length) {
      /* ARTISANS not ready yet — retry */
      setTimeout(_renderHomepageVedette, 500);
      return;
    }

    /* Use SecondarySearch.renderVedetteCard if available (same renderer), else fallback */
    var renderCard = (window.SecondarySearch && typeof window.SecondarySearch.renderVedetteCard === 'function')
      ? window.SecondarySearch.renderVedetteCard.bind(window.SecondarySearch)
      : _buildPvcCard;

    var sorted = _sortList(list).slice(0, HOMEPAGE_MAX_CARDS);
    pg.innerHTML = sorted.map(renderCard).join('');
  }

  /* ══════════════════════════════════════════════════════
     DETECT ACTIVE SEARCH
  ══════════════════════════════════════════════════════ */

  function _isSearchActive() {
    var q  = document.getElementById('search-input');
    var c  = document.getElementById('filter-category');
    var ci = document.getElementById('filter-city');
    var av = document.getElementById('filter-availability');
    /* Also check secondary search bar */
    var qs = document.getElementById('ssb2-input-nlp');
    var qc = document.getElementById('ssb2-select-cat');
    var qci= document.getElementById('ssb2-select-city');
    return (
      (q  && q.value.trim()  !== '') ||
      (c  && c.value         !== '') ||
      (ci && ci.value        !== '') ||
      (av && av.value        !== '') ||
      (qs && qs.value.trim() !== '') ||
      (qc && qc.value        !== '') ||
      (qci&& qci.value       !== '')
    );
  }

  /* ══════════════════════════════════════════════════════
     PATCH renderArtisans
  ══════════════════════════════════════════════════════ */

  function _patchRenderArtisans() {
    if (typeof window.renderArtisans !== 'function') {
      setTimeout(_patchRenderArtisans, 200);
      return;
    }
    if (_installed) return;
    _installed = true;
    _originalRenderArtisans = window.renderArtisans;

    window.renderArtisans = function(list, options) {
      if (_isSearchActive()) {
        /* SEARCH MODE: delegate to original renderer, restore layout */
        if (_homepageMode) {
          _homepageMode = false;
          _setHomepageLayout(false);
        }
        return _originalRenderArtisans(list, options);
      } else {
        /* HOMEPAGE MODE: show premium vedette grid, suppress original grid update */
        if (!_homepageMode) {
          _homepageMode = true;
          _setHomepageLayout(true);
          _renderHomepageVedette();
        }
        /* Still call original to keep internal state (_otherArtisansList etc.) in sync
           but keep original grid hidden */
        _originalRenderArtisans(list, options);
        /* Keep original grid hidden */
        var og = document.getElementById('artisans-container');
        if (og) og.style.display = 'none';
      }
    };

    /* Expose for external callers */
    window.renderArtisans._original  = _originalRenderArtisans;
    window.renderArtisans._isPremium = true;
  }

  /* ══════════════════════════════════════════════════════
     LISTEN to search events to flip modes
  ══════════════════════════════════════════════════════ */

  function _bindSearchListeners() {
    /* Secondary search "Trouver" button */
    var searchBtn = document.getElementById('ssb2-btn-search');
    if (searchBtn) {
      searchBtn.addEventListener('click', function() {
        if (_isSearchActive()) {
          _homepageMode = false;
          _setHomepageLayout(false);
        }
      });
    }

    /* Hero search */
    var heroBtn = document.getElementById('hero-search-btn');
    if (heroBtn) {
      heroBtn.addEventListener('click', function() {
        _homepageMode = false;
        _setHomepageLayout(false);
      });
    }

    /* Quick filter chips */
    document.querySelectorAll('.filter-chip, .ssb2-qfilter, .qf-btn').forEach(function(chip) {
      chip.addEventListener('click', function() {
        _homepageMode = false;
        _setHomepageLayout(false);
      });
    });

    /* "Réinitialiser" reset → back to homepage mode */
    var resetBtn = document.getElementById('results-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        setTimeout(function() {
          if (!_isSearchActive()) {
            _homepageMode = true;
            _setHomepageLayout(true);
            _renderHomepageVedette();
          }
        }, 100);
      });
    }

    /* Re-render when ARTISANS updated by seed patch */
    window.addEventListener('fixeo:marketplace-artisans-updated', function() {
      if (_homepageMode) _renderHomepageVedette();
    });
  }

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */

  function init() {
    /* 1. Set homepage layout immediately */
    _setHomepageLayout(true);

    /* 2. Render premium grid (retry if ARTISANS not ready) */
    _renderHomepageVedette();

    /* 3. Patch renderArtisans */
    _patchRenderArtisans();

    /* 4. Bind search events */
    _bindSearchListeners();

    console.log('✅ Fixeo Homepage Premium Patch loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 400); });
  } else {
    setTimeout(init, 400);
  }

}(window));
