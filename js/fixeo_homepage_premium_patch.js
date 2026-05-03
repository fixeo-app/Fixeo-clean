/**
 * fixeo_homepage_premium_patch.js  v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces old results-layout with premium 2-col pvc-card vedette grid.
 * v3 adds: event delegation for clicks, section header + counter, fade-in anim.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  var MAX_CARDS  = 6;
  var GRID_ID    = 'fixeo-homepage-vedette-grid';
  var HEADER_ID  = 'fixeo-homepage-header';
  var SECTION_ID = 'artisans-section';

  var _searchActive = false;
  var _originalRenderArtisans = null;
  var _installed = false;
  var _containerObserver = null;

  /* ── Category maps ── */
  var CAT_ICONS = {
    plomberie:'🔧',electricite:'⚡',peinture:'🎨',nettoyage:'🧹',
    jardinage:'🌿',demenagement:'📦',bricolage:'🔨',climatisation:'❄️',
    menuiserie:'🪚',maconnerie:'🧱',serrurerie:'🔑',carrelage:'🏠',
    etancheite:'🛡',vitrerie:'🪟',soudure:'🔥',informatique:'💻'
  };
  var CAT_LABELS = {
    plomberie:'Plomberie',electricite:'Électricité',peinture:'Peinture',
    nettoyage:'Nettoyage',jardinage:'Jardinage',demenagement:'Déménagement',
    bricolage:'Bricolage',climatisation:'Climatisation',menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie',serrurerie:'Serrurerie',carrelage:'Carrelage',
    etancheite:'Étanchéité',vitrerie:'Vitrerie',soudure:'Soudure',
    informatique:'Informatique'
  };

  /* ── Helpers ── */
  function _initials(name) {
    if (!name) return '??';
    var p = String(name).trim().split(/\s+/);
    return ((p[0]||'?')[0] + ((p[1]||p[0]||'?')[0])).toUpperCase();
  }
  function _stars(r) {
    var f = Math.round(parseFloat(r)*2)/2, s='';
    for (var i=1;i<=5;i++) s += i<=f ? '★' : (f>=i-0.5 ? '½' : '☆');
    return s;
  }
  function _hide(el) { if (el) el.style.setProperty('display','none','important'); }
  function _show(el) { if (el) el.style.removeProperty('display'); }
  function _$(id) { return document.getElementById(id); }
  function _q(s)  { return document.querySelector(s); }
  function _qa(s) { return document.querySelectorAll(s); }

  /* ── Sort: real artisans first ── */
  function _getFilterContext() {
    var cityEl = document.getElementById('filter-city') || document.getElementById('services-city-filter') || document.getElementById('ssb2-select-city');
    var catEl  = document.getElementById('filter-category') || document.getElementById('ssb2-select-cat');
    var qEl    = document.getElementById('search-input') || document.getElementById('ssb2-input-nlp');
    return {
      city:    (cityEl && cityEl.value) ? cityEl.value.trim() : '',
      service: (catEl  && catEl.value)  ? catEl.value.trim()  : '',
      query:   (qEl    && qEl.value)    ? qEl.value.trim()    : '',
    };
  }

  function _qualityScore(a) {
    // Higher quality = master artisans (IDs 2000+) + high trust + high rating + verified
    var isMaster = Number(a.id) >= 2000;
    var masterBonus = isMaster ? 0.15 : 0;
    var trust = (Number(a.trustScore || a.trust_score || 0)) / 100;
    var rating = Number(a.rating || 0) / 5;
    var reviewBonus = Math.min(Number(a.reviewCount || a.total_reviews || 0), 100) / 100 * 0.1;
    var verified = (a.verified || a.certified) ? 0.05 : 0;
    return masterBonus + trust * 0.4 + rating * 0.35 + reviewBonus + verified;
  }

  function _sortList(list, ctx) {
    var context = ctx || _getFilterContext();
    /* 3C: cap candidate pool at MAX_CARDS*4 before scoring.
       scoreArtisan is O(1) per artisan but called on all 367 by default.
       Pre-filtering by qualityScore keeps the same top results in O(N log N)
       with a much smaller scoring pass. Only applies when no city/service
       filter is active (filters already reduce the list size). */
    var hasFilters = !!(context.city || context.service || context.query);
    var candidates = list;
    var CAP = MAX_CARDS * 4; /* 24 — score 4× what we need, pick top MAX_CARDS */
    if (!hasFilters && list.length > CAP) {
      /* Sort cheaply by quality score (no ML, pure arithmetic) to get top candidates */
      var pre = list.slice().sort(function(a, b) { return _qualityScore(b) - _qualityScore(a); });
      candidates = pre.slice(0, CAP);
    }
    // Use FixeoMatchingEngine for scoring, but combine with quality bonus
    if (window.FixeoMatchingEngine) {
      var scored = candidates.map(function(a) {
        var matchScore = window.FixeoMatchingEngine.scoreArtisan(a, context);
        var qualScore  = _qualityScore(a);
        return { a: a, s: matchScore * 0.65 + qualScore * 0.35 };
      });
      scored.sort(function(x, y) { return y.s - x.s; });
      return scored.map(function(x) { return x.a; });
    }
    // Fallback
    var real  = candidates.filter(function(a){ return Number(a.id) >= 2000; });
    var seeds = candidates.filter(function(a){ return Number(a.id) < 2000; });
    real.sort(function(a,b){return _qualityScore(b)-_qualityScore(a);});
    seeds.sort(function(a,b){return _qualityScore(b)-_qualityScore(a);});
    return real.concat(seeds);
  }

  
  /* ─── Moroccan pricing by service ──────────────────────────── */
  /* MAR_PRICES v2 — aligned with fixeo-pricing-marocain.js canonical values.
   * to/range values kept proportional to from increases.
   * Used only for display: card price badge + hint line. Never feeds payment. */
  var MAR_PRICES = {
    plomberie:    { from: 150, to: 400,  label: '150–400 MAD' },
    electricite:  { from: 100, to: 400,  label: '100–400 MAD' },
    menuiserie:   { from: 150, to: 600,  label: '150–600 MAD' },
    peinture:     { from: 800, to: 2500, label: '800–2 500 MAD' },
    nettoyage:    { from: 200, to: 600,  label: '200–600 MAD' },
    climatisation:{ from: 200, to: 700,  label: '200–700 MAD' },
    maconnerie:   { from: 200, to: 800,  label: '200–800 MAD' },
    carrelage:    { from: 150, to: 500,  label: '150–500 MAD' },
    jardinage:    { from: 150, to: 450,  label: '150–450 MAD' },
    serrurerie:   { from: 150, to: 400,  label: '150–400 MAD' },
    demenagement: { from: 500, to: 1500, label: '500–1 500 MAD' },
    bricolage:    { from: 100, to: 350,  label: '100–350 MAD' },
    toiture:      { from: 300, to: 900,  label: '300–900 MAD' },
    etancheite:   { from: 250, to: 900,  label: '250–900 MAD' },
    vitrerie:     { from: 200, to: 700,  label: '200–700 MAD' },
    soudure:      { from: 150, to: 500,  label: '150–500 MAD' },
    informatique: { from: 100, to: 350,  label: '100–350 MAD' }
  };

  function _getPricing(a) {
    var cat  = (a.category || a.service || '').toLowerCase().trim();
    var info = MAR_PRICES[cat];
    /* priceFrom > 100: real artisan-specific price set by admin or Supabase.
     * priceFrom <= 100: main.js normalizer default (null → 100) — treat as absent,
     * fall through to category-level MAR_PRICES so cards show market rate. */
    if (a.price_from || a.priceFrom) {
      var pf = parseInt(a.price_from || a.priceFrom, 10);
      if (!isNaN(pf) && pf > 100) return { from: pf, label: '\u00c0 partir de ' + pf + ' MAD' };
    }
    if (info) return { from: info.from, label: '\u00c0 partir de ' + info.from + ' MAD', range: info.label };
    return { from: 150, label: '\u00c0 partir de 150 MAD' };
  }

  function _responseTimeLabel(rt) {
    rt = parseInt(rt, 10);
    if (!rt || rt >= 999) return null;
    if (rt <= 10) return 'Répond en 10 min';
    if (rt <= 30) return 'Répond en ' + rt + ' min';
    if (rt <= 60) return 'Répond en 1h';
    return 'Répond en ' + Math.round(rt / 60) + 'h';
  }

  function _missionsLabel(a) {
    var m = parseInt(a.missionsCompleted || a.missions_count || a.reviewCount || a.reviews || 0, 10);
    if (m >= 200) return m + '+ missions';
    if (m >= 50)  return m + ' missions';
    if (m >= 10)  return m + ' missions';
    return null;
  }

  /* ─── Premium card builder v2 ───────────────────────────────── */
  function _buildCard(a, idx) {
    idx = idx || 0;
    var cat      = (a.category || a.service || '').toLowerCase();
    var catIcon  = CAT_ICONS[cat] || '🔧';
    var catLbl   = CAT_LABELS[cat] || (a.service || a.category || 'Service');
    var rating   = parseFloat(a.rating) || 0;
    var reviews  = parseInt(a.reviewCount || a.reviews || a.review_count || 0, 10);
    var trust    = parseInt(a.trustScore || 0, 10);
    var rt       = parseInt(a.responseTime || 999, 10);
    var isReal   = !a.claimable && !a._isSeed;
    var isVer    = !!(a.verified || a.certified || trust >= 85);
    var isClaimed= !!(a.claimed);
    var avail    = (a.availability || '').toLowerCase();
    var isAvail  = avail === 'available' || a.available;
    var isToday  = avail === 'available_today';
    var pricing  = _getPricing(a);
    /* rtLabel/misLabel unused since T2 chip rewrite — kept for future use */
    var rtLabel  = null;
    var misLabel = null;

    /* Avatar — branded silhouette (T1/T3: no initials, no emoji) */
    var avatarSrc = a.avatar || a.photo || a.photo_url || '';
    var avatarHtml = avatarSrc
      ? '<img class="pvc-avatar-img" src="' + avatarSrc + '" alt="' + _esc(a.name) + '" loading="lazy"'
        + ' onerror="this.onerror=null;this.style.display=\'none\';var sb=this.parentNode.querySelector(\'.pvc-avatar-silhouette\');if(sb)sb.style.display=\'block\';">' 
        + '<span class="pvc-avatar-silhouette" style="display:none"></span>'
      : '<span class="pvc-avatar-silhouette"></span>';

    /* Availability badge */
    var availHtml = isAvail
      ? '<span class="pvc-avail-badge pvc-avail-badge--on">🟢 Réponse rapide</span>'
      : isToday
        ? '<span class="pvc-avail-badge pvc-avail-badge--today">🟡 Disponible aujourd\'hui</span>'
        : '<span class="pvc-avail-badge pvc-avail-badge--off">Sur RDV</span>';

    /* Rating stars */
    /* Rating — always 5 stars + credible state (T1: no fake numbers) */
    var starsHtml = '<span class="pvc-stars-v2">★★★★★</span>' +
                    '<span class="pvc-rating-state">Évaluation en cours</span>';

    /* Chips — credible state only (T2: no mission counts) */
    /* chips removed — info block is FOMO + trust-line only (T2) */

    /* Trust badges — verified/premium only (T2) */
    var badges = '';
    if (isVer)       badges += '<span class="pvc-badge-v2 pvc-badge-v2--verified">✔ Vérifié Fixeo</span>';
    if (trust >= 90) badges += '<span class="pvc-badge-v2 pvc-badge-v2--premium">🏅 Premium</span>';

    /* Data attribute (for click delegation) */
    var dataAttr;
    try {
      dataAttr = ' data-artisan=\'' + JSON.stringify(a).replace(/'/g, '&#39;') + '\'';
    } catch(_) { dataAttr = ''; }

    return '<article class="pvc-card fhp-card' + (isReal ? ' pvc-card--real' : '') + '"' +
      ' data-artisan-id="' + a.id + '"' + dataAttr +
      ' tabindex="0" role="button"' +
      ' aria-label="' + _esc(a.name) + ', ' + catLbl + '"' +
      ' style="--anim-delay:' + idx + '">' +

      /* ── Header ── */
      '<div class="pvc-card-header">' +
        '<div class="pvc-avatar' + (isVer ? ' pvc-avatar--verified' : '') + '" data-category="' + cat + '">' + avatarHtml + '<span class="pvc-avatar-badge">' + catIcon + '</span></div>' +
        '<div class="pvc-identity">' +
          '<h3 class="pvc-name">' + _esc(a.name || '—') + '</h3>' +
          '<div class="pvc-meta-row">' +
            '<span class="pvc-cat-pill">' + catIcon + ' ' + catLbl + '</span>' +
            '<span class="pvc-city-pill">📍 ' + _esc(a.city || 'Maroc') + '</span>' +
          '</div>' +
        '</div>' +
        availHtml +
      '</div>' +

      /* ── Badges ── */
      (badges ? '<div class="pvc-badges-v2">' + badges + '</div>' : '') +

      /* ── Divider ── */
      '<div class="pvc-divider"></div>' +

      /* ── Stats ── */
      '<div class="pvc-stats">' +
        '<div class="pvc-rating-block">' + starsHtml + '</div>' +
      '</div>' +

      /* info-bar removed — FOMO line below is the only chip (T2) */

      /* Step 1 — FOMO line after chips */
      '<div class="pvc-fomo">🔥 Demande élevée dans votre zone</div>' +

      /* Step 3 — Trust line after stats */
      '<div class="pvc-trust-line">\u2714\ufe0f Artisan v\u00e9rifi\u00e9 \u2022 Paiement apr\u00e8s intervention</div>' +

      /* ── Footer: price + CTAs ── */
      /* Step 2: clean vertical structure — label, amount, hint all in column */
      '<div class="pvc-footer">' +
        '<div class="pvc-price-block">' +
          
          '<div class="pvc-price-amount">Dès ' + pricing.from + '<span class="price-currency">MAD</span></div>' +
          (function() {
            var _cat = (a.category || a.service || '').toLowerCase().trim();
            var _info = MAR_PRICES[_cat];
            if (!_info || !_info.to) return '';
            var _rec = Math.round((_info.from + _info.to) / 2);
            /* T5: removed 'Marché' row — only Fixeo recommended price */
            return '<span class="pvc-price-from">💡 Estimation Fixeo : ~' + _rec + ' MAD</span>';
          })() +
        '</div>' +
        '<div class="pvc-cta-col">' +
          '<div class="pvc-cta-row">' +
            '<button class="pvc-btn-reserve-v2 fhp-btn-reserve" type="button">Réserver maintenant</button>' +
            '<span class="pvc-profile-link fhp-btn-profile">Voir profil →</span>' +
          '</div>' +
          /* under-CTA removed — paiement covered by trust-line above (T2) */
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* esc helper for v2 */
  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ── Actions ── */
  function _doReserve(a) {
    if (!a) return;
    if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
      window.FixeoReservation.open(a, false);
    } else if (window.FixeoReservation && typeof window.FixeoReservation.openBooking === 'function') {
      window.FixeoReservation.openBooking(a.id);
    } else if (typeof window.openBookingModal === 'function') {
      window.openBookingModal(a.id);
    } else if (typeof window.openModal === 'function') {
      window.openModal('booking-modal');
    }
  }

  function _doProfile(a) {
    if (!a) return;
    if (window.FixeoPublicProfileLinks && typeof window.FixeoPublicProfileLinks.openBySourceId === 'function') {
      window.FixeoPublicProfileLinks.openBySourceId(String(a.id));
    } else {
      window.location.href = 'artisan-profile.html?id=' + encodeURIComponent(String(a.id));
    }
  }

  /* ── Event delegation on the grid ── */
  function _bindGridDelegation(pg) {
    pg.addEventListener('click', function(e) {
      /* Stop propagation up to artisans-section container (prevents any overlay blocks) */
      e.stopPropagation();

      /* Find the card */
      var card = e.target.closest('.fhp-card');
      if (!card) return;

      /* Parse artisan data from attribute */
      var a = null;
      try { a = JSON.parse(card.getAttribute('data-artisan').replace(/&#39;/g,"'")); } catch(_) {}
      if (!a) { a = { id: card.getAttribute('data-artisan-id') }; }

      /* Delegate to correct action */
      if (e.target.closest('.fhp-btn-reserve')) {
        e.preventDefault();
        _doReserve(a);
      } else if (e.target.closest('.fhp-btn-profile')) {
        e.preventDefault();
        _doProfile(a);
      } else {
        /* Whole-card click → Réserver */
        _doReserve(a);
      }
    });

    /* Keyboard: Enter/Space on card */
    pg.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.fhp-card');
      if (!card) return;
      e.preventDefault();
      var a = null;
      try { a = JSON.parse(card.getAttribute('data-artisan').replace(/&#39;/g,"'")); } catch(_) {}
      if (!a) a = { id: card.getAttribute('data-artisan-id') };
      _doReserve(a);
    });
  }

  /* ── Section header + counter ── */
  function _buildHeader(total, filteredCount) {
    var artisans = window.ARTISANS || [];
    // Count available + available_today (both = actively available)
    var avail = artisans.filter(function(a){
      return a.availability === 'available' || a.availability === 'available_today';
    }).length;
    // Use filtered count if filters are active
    var ctx = _getFilterContext ? _getFilterContext() : {};
    var hasFilters = !!(ctx.city || ctx.service || ctx.query);
    var count = hasFilters && filteredCount > 0 ? filteredCount : (avail > 0 ? avail : total);

    var el = _$(HEADER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = HEADER_ID;
      el.className = 'fhp-section-header';
      var pg = _$(GRID_ID);
      if (pg && pg.parentNode) pg.parentNode.insertBefore(el, pg);
    }
    el.innerHTML =
      '<div class="fhp-header-copy">'+
        '<h2 class="fhp-title">Artisans recommandés</h2>'+
        '<p class="fhp-subtitle">Des professionnels disponibles immédiatement</p>'+
      '</div>'+
      '<span class="fhp-counter">'+count.toLocaleString('fr-FR')+' artisans disponibles</span>';
  }

  /* ── Render premium grid ── */
  function _getOrCreateGrid() {
    var pg = _$(GRID_ID);
    if (pg) return pg;
    pg = document.createElement('div');
    pg.id = GRID_ID;
    pg.className = 'ssb2-vedette-grid fhp-grid';
    pg.setAttribute('aria-label','Artisans recommandés — sélection premium');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    var shell   = _q('#'+SECTION_ID+' .results-page-shell');
    var anchor  = mainCol || shell;
    if (anchor) anchor.insertBefore(pg, anchor.firstChild);
    _bindGridDelegation(pg);
    return pg;
  }

  function _renderPremiumGrid() {
    var fullList = window.ARTISANS || [];
    if (!fullList.length) { setTimeout(_renderPremiumGrid, 500); return; }

    // Use SearchEngine filtered results when filters/search are active
    var ctx = _getFilterContext();
    var hasFilters = !!(ctx.city || ctx.service || ctx.query);
    var list;
    if (hasFilters && window.searchEngine) {
      var seState = { query: ctx.query, category: ctx.service, city: ctx.city, sortBy: 'rating', availability: '', minRating: 0, maxPrice: 0, verifiedOnly: false };
      list = window.searchEngine.filter(seState);
    } else {
      list = fullList;
    }
    if (!list.length && hasFilters) list = fullList; // fallback: no results → show all

    var pg = _getOrCreateGrid();

    /* Use SecondarySearch renderer if available, else local _buildCard */
    var renderCard;
    if (window.SecondarySearch && typeof window.SecondarySearch.renderVedetteCard === 'function') {
      var _orig = window.SecondarySearch.renderVedetteCard.bind(window.SecondarySearch);
      /* Wrap to add delegation classes + data-artisan */
      renderCard = function(a, i) {
        var html = _orig(a);
        /* Inject data-artisan and fhp-card class into the article tag */
        var dataStr = ' data-artisan=\''+JSON.stringify(a).replace(/'/g,'&#39;')+'\'';
        html = html.replace(/^<article /, '<article class="fhp-card" '+dataStr+' ');
        html = html.replace('<article class="fhp-card" ', '<article class="fhp-card" style="--anim-delay:'+i+';" ');
        return html;
      };
    } else {
      renderCard = _buildCard;
    }

    var sorted = _sortList(list, ctx).slice(0, MAX_CARDS);
    pg.innerHTML = sorted.map(renderCard).join('');
    /* Signal sections-ready immediately after innerHTML so anti-FOUC CSS resolves
       in the same paint frame — do NOT defer this to rAF. */
    document.body.classList.add('fixeo-sections-ready');

    /* 3C: defer delegation re-bind + querySelectorAll to next rAF.
       These are click-handler bindings — they have zero first-paint impact.
       Moving them out of the synchronous innerHTML path saves ~40-80ms on slow CPUs. */
    requestAnimationFrame(function() {
      pg.removeEventListener('click', pg._fhpDelegate);
      _bindGridDelegation(pg);

      if (window.SecondarySearch && typeof window.SecondarySearch.renderVedetteCard === 'function') {
        pg.querySelectorAll('.pvc-btn-primary, .ssb2-btn-reserve').forEach(function(btn){
          btn.onclick = null;
          btn.classList.add('fhp-btn-reserve');
        });
        pg.querySelectorAll('.pvc-btn-secondary, .ssb2-btn-profile').forEach(function(btn){
          btn.onclick = null;
          btn.classList.add('fhp-btn-profile');
        });
      }

      _buildHeader(list.length, sorted.length);
      _triggerFadeIn(pg);
    });
  }

  /* ── Fade-in animation ── */
  function _triggerFadeIn(pg) {
    var cards = pg.querySelectorAll('.pvc-card, .fhp-card');
    /* 3A-4: was N individual setTimeouts (one per card, up to 30 timers on main thread).
       Now: set animationDelay inline (CSS handles the visual stagger), then apply
       fhp-visible to ALL cards in one requestAnimationFrame — single paint cycle. */
    cards.forEach(function(card, i) {
      card.classList.remove('fhp-visible');
      card.style.animationDelay = (i * 80) + 'ms';
    });
    requestAnimationFrame(function() {
      cards.forEach(function(card) { card.classList.add('fhp-visible'); });
    });
  }

  /* ── Hide / Show old layout chrome ── */
  var OLD_IDS = ['loading-artisans','no-artisan','other-artisans-banner','other-see-more-wrap','edit-results-search-btn']; /* artisans-container always hidden — vedette is the card UI */
  var OLD_SELS = ['#'+SECTION_ID+' .results-header','#'+SECTION_ID+' .results-filters','#'+SECTION_ID+' .results-toolbar','#'+SECTION_ID+' .results-trust-strip'];

  function _hideResultsChrome() {
    OLD_IDS.forEach(function(id){ _hide(_$(id)); });
    OLD_SELS.forEach(function(sel){ _hide(_q(sel)); });
    var layout  = _q('#'+SECTION_ID+' .results-layout');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    if (layout)  layout.style.setProperty('display','block','important');
    if (mainCol) { mainCol.style.setProperty('width','100%','important'); mainCol.style.setProperty('max-width','100%','important'); }
    document.body.classList.add('fixeo-homepage-mode');
  }

  function _showResultsChrome() {
    OLD_IDS.forEach(function(id){ _show(_$(id)); });
    OLD_SELS.forEach(function(sel){ _show(_q(sel)); });
    var layout  = _q('#'+SECTION_ID+' .results-layout');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    if (layout)  layout.style.removeProperty('display');
    if (mainCol) { mainCol.style.removeProperty('width'); mainCol.style.removeProperty('max-width'); }
    document.body.classList.remove('fixeo-homepage-mode');
    /* vedette grid stays visible — it IS the search results UI */
    var pg = _$(GRID_ID); if (pg) _show(pg);
    var hd = _$(HEADER_ID); if (hd) _show(hd);
    /* always keep artisans-container hidden (legacy card grid) */
    var legacyContainer = document.getElementById('artisans-container');
    if (legacyContainer) _hide(legacyContainer);
  }

  /* ── MutationObserver ── */
  function _startObserver() {
    if (_containerObserver) return;
    var target = _$(SECTION_ID);
    if (!target || !window.MutationObserver) return;
    _containerObserver = new MutationObserver(function() {
      /* 3A-3: replaced getComputedStyle(el).display (forced sync layout) with
         el.style.display — reads only inline style, no layout recalculation.
         _hide() sets display:none inline so this check is fully equivalent. */
      ['artisans-container','loading-artisans','other-see-more-wrap'].forEach(function(id){
        var el=_$(id); if(el && !el.hidden && el.style.display!=='none') _hide(el);
      });
    });
    _containerObserver.observe(target, {childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  }
  function _stopObserver() { if (_containerObserver) { _containerObserver.disconnect(); _containerObserver=null; } }

  /* ── Mode switches ── */
  function _enterHomepageMode() {
    _searchActive = false;
    document.body.classList.remove('fixeo-search-mode');
    document.body.classList.remove('fixeo-hero-search-mode'); /* clear hero-search suppression */
    // Restore any hero-mode JS-hidden elements
    (function _restoreHeroHidden() {
      var toRestore = [
        document.querySelector('#artisans-section .results-header'),
        document.querySelector('#artisans-section .results-toolbar'),
        document.getElementById('fixeo-premium-filters-extra'),
        document.getElementById('other-artisans-banner'),
      ];
      toRestore.forEach(function(el) {
        if (el) el.style.removeProperty('display');
      });
    })();
    _hideResultsChrome();
    _renderPremiumGrid();
    _startObserver();
  }
  function _enterSearchMode() {
    _searchActive = true;
    _stopObserver();
    document.body.classList.add('fixeo-search-mode');
    document.body.classList.add('fixeo-sections-ready'); /* keep sections visible */
    _showResultsChrome();
    // Refresh vedette with current filter context
    setTimeout(_renderPremiumGrid, 50);
  }

  /* ── Patch renderArtisans ── */
  function _patchRender() {
    if (typeof window.renderArtisans !== 'function') { setTimeout(_patchRender,200); return; }
    if (_installed) return;
    _installed = true;
    _originalRenderArtisans = window.renderArtisans;
    window.renderArtisans = function(list, options) {
      _originalRenderArtisans(list, options);
      if (!_searchActive) {
        _hide(_$('artisans-container'));
        _hide(_$('loading-artisans'));
        _hide(_$('other-see-more-wrap'));
      }
    };
    window.renderArtisans._original  = _originalRenderArtisans;
    window.renderArtisans._isPremium = true;
  }

  /* ── Detect search active ── */
  function _isSearchActive() {
    var ids=['search-input','ssb2-input-nlp'];
    var sels=['filter-category','filter-city','filter-availability','ssb2-select-cat','ssb2-select-city'];
    for(var i=0;i<ids.length;i++){var e=_$(ids[i]);if(e&&e.value.trim())return true;}
    for(var j=0;j<sels.length;j++){var e2=_$(sels[j]);if(e2&&e2.value)return true;}
    return false;
  }

  /* ── Bind global events ── */
  function _bindEvents() {
    function _onSearch(){ if(_isSearchActive()) _enterSearchMode(); }

    // Refresh vedette grid when filters change (even in homepage mode)
    function _onFilterChange() {
      if (!_searchActive) {
        // In homepage mode: update vedette grid with filtered artisans
        _renderPremiumGrid();
      }
    }
    ['filter-city','filter-category','services-city-filter','ssb2-select-city','ssb2-select-cat'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', _onFilterChange);
    });
    // Also refresh when marketplace artisans are updated
    window.addEventListener('fixeo:marketplace-artisans-updated', function(){
      setTimeout(_renderPremiumGrid, 150);
    });
    ['ssb2-btn-search','hero-search-btn','ssb2-btn-search-mobile'].forEach(function(id){
      var el=_$(id); if(el) el.addEventListener('click',_onSearch);
    });
    _qa('.filter-chip,.ssb2-qfilter,.qf-btn').forEach(function(el){
      el.addEventListener('click',function(){ _enterSearchMode(); });
    });
    ['search-input','ssb2-input-nlp'].forEach(function(id){
      var el=_$(id);
      if(el) el.addEventListener('input',function(){ if(el.value.trim()) _enterSearchMode(); });
    });
    var resetBtn = _$('results-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click',function(){
        setTimeout(function(){ if(!_isSearchActive()) _enterHomepageMode(); },150);
      });
    }
    /* fixeo:marketplace-artisans-updated handled in _bindEvents above */
  }

  /* ── Init ── */
  function init() {
    _enterHomepageMode();
    _patchRender();
    _bindEvents();
    /* Safety fallback: reveal sections after 1.2s max regardless of grid state.
       This guarantees how-it-works, feed, testimonials never stay hidden on slow CPUs. */
    setTimeout(function() {
      document.body.classList.add('fixeo-sections-ready');
    }, 1200);
    console.log('✅ Fixeo Homepage Premium Patch v3 ready');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.FixeoHomepagePremium = { refresh:_renderPremiumGrid, enterSearch:_enterSearchMode, enterHomepage:_enterHomepageMode };

}(window));
