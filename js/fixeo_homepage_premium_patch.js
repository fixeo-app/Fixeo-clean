/**
 * fixeo_homepage_premium_patch.js  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the old results-layout (left filters + standard artisan cards) in
 * #artisans-section with a clean premium 2-column pvc-card vedette grid.
 *
 * KEY FIXES vs v1:
 *  - CSS class `fixeo-homepage-mode` applied to <body> immediately so the
 *    inline <style> block hides everything before JS even runs (no flash).
 *  - _hideResultsChrome() hides ALL old-layout pieces including:
 *    results-header, results-filters, results-toolbar, other-artisans-banner,
 *    #artisans-container, #loading-artisans, #no-artisan, #other-see-more-wrap
 *  - _showResultsChrome() restores them all cleanly in search mode.
 *  - MutationObserver on #artisans-container keeps it hidden when main.js
 *    re-shows it (e.g. after refreshMarketplaceFromCurrentFilters).
 *  - renderArtisans override: in homepage mode, calls original but immediately
 *    re-hides the container (state sync without visual bleed-through).
 *
 * Included after: main.js, fixeo_seed_patch.js, secondary-search.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  /* ── Config ── */
  var MAX_CARDS  = 6;
  var GRID_ID    = 'fixeo-homepage-vedette-grid';
  var SECTION_ID = 'artisans-section';

  /* ── State ── */
  var _searchActive = false;
  var _originalRenderArtisans = null;
  var _installed = false;
  var _containerObserver = null;

  /* ══════════════════════════════════════════════════════
     CATEGORY MAPS
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

  /* ══════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════ */
  function _initials(name) {
    if (!name) return '??';
    var p = String(name).trim().split(/\s+/);
    return ((p[0]||'?')[0] + ((p[1]||p[0]||'?')[0])).toUpperCase();
  }
  function _stars(r) {
    var f = Math.round(parseFloat(r) * 2) / 2;
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= f ? '★' : (f >= i-0.5 ? '½' : '☆');
    return s;
  }
  function _hide(el) { if (el) el.style.setProperty('display', 'none', 'important'); }
  function _show(el, d) { if (el) el.style.removeProperty('display'); if (el && d) el.style.display = d; }
  function _$(id) { return document.getElementById(id); }
  function _q(sel) { return document.querySelector(sel); }
  function _qa(sel) { return document.querySelectorAll(sel); }

  /* Priority sort */
  function _sortList(list) {
    var real  = list.filter(function(a){ return !a.claimable && !a._isSeed; });
    var seeds = list.filter(function(a){ return  a.claimable ||  a._isSeed; });
    function sc(a) {
      return (a.trustScore||0)*1.2 + (a.rating||0)*8 +
             (a.availability==='available'?18:0) +
             ((a.reviewCount||0)>10?5:0) + (a.verified||a.certified?10:0);
    }
    real.sort(function(a,b){return sc(b)-sc(a);});
    seeds.sort(function(a,b){return sc(b)-sc(a);});
    return real.concat(seeds);
  }

  /* Build pvc-card HTML */
  function _buildCard(a) {
    var avail   = (a.availability||'').toLowerCase();
    var isAvail = avail === 'available';
    var isToday = avail === 'available_today';
    var catIcon = CAT_ICONS[a.category]  || '🔧';
    var catLbl  = CAT_LABELS[a.category] || (a.service||a.category||'Service');
    var rating  = parseFloat(a.rating) || 0;
    var reviews = parseInt(a.reviewCount||0, 10);
    var trust   = parseInt(a.trustScore||0, 10);
    var rt      = parseInt(a.responseTime||999, 10);
    var price   = parseInt(a.priceFrom||150, 10);
    var unit    = a.priceUnit || 'h';
    var isReal  = !a.claimable && !a._isSeed;
    var isVer   = a.verified || a.certified || (a.badges||[]).indexOf('verified')>=0 || trust>=85;
    var initials = _initials(a.name);
    var src     = a.avatar || a.photo || a.image || '';
    var avatarHtml = src
      ? '<img class="pvc-avatar-img" src="'+src+'" alt="'+(a.name||'')+'" loading="lazy"'+
        ' onerror="this.onerror=null;this.style.display=\'none\';this.parentNode.querySelector(\'.pvc-avatar-initials\').style.display=\'flex\';" />'+
        '<span class="pvc-avatar-initials" style="display:none">'+initials+'</span>'
      : '<span class="pvc-avatar-initials">'+initials+'</span>';
    var availPill = isAvail
      ? '<span class="pvc-avail pvc-avail--on">🟢 Disponible</span>'
      : isToday ? '<span class="pvc-avail pvc-avail--today">🟡 Auj.</span>'
                : '<span class="pvc-avail pvc-avail--off">Réservation</span>';
    var badges = [];
    if (isVer)       badges.push('<span class="pvc-badge pvc-badge--verified">✔ Vérifié</span>');
    if (rt<=30)      badges.push('<span class="pvc-badge pvc-badge--fast">⚡ Rapide</span>');
    if (trust>=90)   badges.push('<span class="pvc-badge pvc-badge--premium">🏅 Premium</span>');
    var badgesHtml = badges.slice(0,2).join('');
    var starsHtml = rating>0
      ? '<span class="pvc-stars">'+_stars(rating)+'</span>'+
        '<span class="pvc-rating-val">'+rating.toFixed(1)+'</span>'+
        (reviews>0?'<span class="pvc-reviews">('+reviews+')</span>':'')
      : '<span class="pvc-rating-empty">Nouveau</span>';
    var trustBar = trust>0
      ? '<div class="pvc-trust-bar"><div class="pvc-trust-fill" style="width:'+trust+'%"></div></div>'+
        '<span class="pvc-trust-label">'+trust+'%</span>' : '';
    var id    = a.id;
    var idJ   = JSON.stringify(id);
    var sidJ  = JSON.stringify(String(id));
    var aJ    = JSON.stringify(a);
    return '<article class="pvc-card'+(isReal?' pvc-card--real':'')+'" data-artisan-id="'+id+'" tabindex="0" role="button" aria-label="Artisan '+(a.name||'')+'">'+
      '<div class="pvc-top">'+
        '<div class="pvc-avatar">'+avatarHtml+'</div>'+
        '<div class="pvc-identity">'+
          '<h3 class="pvc-name">'+(a.name||'')+'</h3>'+
          '<p class="pvc-meta"><span class="pvc-cat-icon">'+catIcon+'</span>'+catLbl+
            ' · <span class="pvc-city">📍 '+(a.city||'Maroc')+'</span></p>'+
        '</div>'+availPill+'</div>'+
      (badgesHtml?'<div class="pvc-badges">'+badgesHtml+'</div>':'')+
      '<div class="pvc-rating-row"><div class="pvc-rating">'+starsHtml+'</div>'+
        (trust>0?'<div class="pvc-trust">'+trustBar+'</div>':'')+
      '</div>'+
      '<div class="pvc-pricing">'+
        '<span class="pvc-price">Dès <strong>'+price+' MAD</strong><span class="pvc-unit">/'+unit+'</span></span>'+
        (rt<999?'<span class="pvc-rt">⏱ '+rt+' min</span>':'')+
      '</div>'+
      '<div class="pvc-actions">'+
        '<button class="pvc-btn-primary" onclick="(window.FixeoReservation?window.FixeoReservation.open('+aJ+',false):(window.openBookingModal?window.openBookingModal('+idJ+'):void 0));event.stopPropagation();" aria-label="Réserver '+(a.name||'')+'">📅 Réserver</button>'+
        '<button class="pvc-btn-secondary" onclick="(window.FixeoPublicProfileLinks?window.FixeoPublicProfileLinks.openBySourceId('+sidJ+',event):(window.openArtisanModal?window.openArtisanModal('+idJ+'):void 0));event.stopPropagation();" aria-label="Voir profil">Voir profil</button>'+
      '</div>'+
    '</article>';
  }

  /* ══════════════════════════════════════════════════════
     HIDE / SHOW OLD LAYOUT CHROME
  ══════════════════════════════════════════════════════ */

  /* All IDs / selectors that belong to the old results UI */
  var OLD_IDS = [
    'artisans-container',
    'loading-artisans',
    'no-artisan',
    'other-artisans-banner',
    'other-see-more-wrap',
    'edit-results-search-btn'
  ];
  var OLD_SELECTORS = [
    '#'+SECTION_ID+' .results-header',
    '#'+SECTION_ID+' .results-filters',
    '#'+SECTION_ID+' .results-toolbar',
    '#'+SECTION_ID+' .results-toolbar-left',
    '#'+SECTION_ID+' .results-sort',
    '#'+SECTION_ID+' .results-trust-strip'
  ];

  function _hideResultsChrome() {
    OLD_IDS.forEach(function(id){ _hide(_$(id)); });
    OLD_SELECTORS.forEach(function(sel){ _hide(_q(sel)); });

    /* Full-width main column — no aside gap */
    var layout  = _q('#'+SECTION_ID+' .results-layout');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    if (layout)  { layout.style.setProperty('display','block','important'); }
    if (mainCol) { mainCol.style.setProperty('width','100%','important');
                   mainCol.style.setProperty('max-width','100%','important'); }

    /* body class for CSS selector overrides */
    document.body.classList.add('fixeo-homepage-mode');
  }

  function _showResultsChrome() {
    OLD_IDS.forEach(function(id){ var el=_$(id); if(el) el.style.removeProperty('display'); });
    OLD_SELECTORS.forEach(function(sel){ var el=_q(sel); if(el) el.style.removeProperty('display'); });
    var layout  = _q('#'+SECTION_ID+' .results-layout');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    if (layout)  { layout.style.removeProperty('display'); }
    if (mainCol) { mainCol.style.removeProperty('width'); mainCol.style.removeProperty('max-width'); }
    document.body.classList.remove('fixeo-homepage-mode');

    /* Hide premium grid */
    var pg = _$(GRID_ID);
    if (pg) _hide(pg);
  }

  /* ══════════════════════════════════════════════════════
     MUTATION OBSERVER — keep #artisans-container hidden
     when main.js/renderArtisans tries to show it
  ══════════════════════════════════════════════════════ */

  function _startObserver() {
    if (_containerObserver) return;
    var target = _$(SECTION_ID);
    if (!target || !window.MutationObserver) return;
    _containerObserver = new MutationObserver(function() {
      if (!_searchActive) {
        var c = _$('artisans-container');
        var l = _$('loading-artisans');
        var sw = _$('other-see-more-wrap');
        if (c && c.style.display !== 'none')  _hide(c);
        if (l && l.style.display !== 'none')  _hide(l);
        if (sw && sw.style.display !== 'none') _hide(sw);
      }
    });
    _containerObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  function _stopObserver() {
    if (_containerObserver) { _containerObserver.disconnect(); _containerObserver = null; }
  }

  /* ══════════════════════════════════════════════════════
     RENDER PREMIUM GRID
  ══════════════════════════════════════════════════════ */

  function _getOrCreateGrid() {
    var pg = _$(GRID_ID);
    if (pg) return pg;
    pg = document.createElement('div');
    pg.id = GRID_ID;
    pg.className = 'ssb2-vedette-grid';
    pg.setAttribute('aria-label', 'Artisans vérifiés — sélection premium');
    /* Prepend into results-main-column so it appears at top */
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    var shell   = _q('#'+SECTION_ID+' .results-page-shell');
    var anchor  = mainCol || shell;
    if (anchor) anchor.insertBefore(pg, anchor.firstChild);
    return pg;
  }

  function _renderPremiumGrid() {
    var list = window.ARTISANS || [];
    if (!list.length) {
      setTimeout(_renderPremiumGrid, 500);
      return;
    }
    var pg = _getOrCreateGrid();
    var renderCard = (window.SecondarySearch && typeof window.SecondarySearch.renderVedetteCard === 'function')
      ? window.SecondarySearch.renderVedetteCard.bind(window.SecondarySearch)
      : _buildCard;
    var sorted = _sortList(list).slice(0, MAX_CARDS);
    pg.innerHTML = sorted.map(renderCard).join('');
    pg.style.removeProperty('display');
  }

  /* ══════════════════════════════════════════════════════
     SWITCH MODES
  ══════════════════════════════════════════════════════ */

  function _enterHomepageMode() {
    _searchActive = false;
    _hideResultsChrome();
    _renderPremiumGrid();
    _startObserver();
  }

  function _enterSearchMode() {
    _searchActive = true;
    _stopObserver();
    _showResultsChrome();
  }

  /* ══════════════════════════════════════════════════════
     PATCH window.renderArtisans
  ══════════════════════════════════════════════════════ */

  function _patchRender() {
    if (typeof window.renderArtisans !== 'function') { setTimeout(_patchRender, 200); return; }
    if (_installed) return;
    _installed = true;
    _originalRenderArtisans = window.renderArtisans;

    window.renderArtisans = function(list, options) {
      /* Always call original to keep internal state in sync */
      _originalRenderArtisans(list, options);
      /* If we're in homepage mode, immediately re-hide the old container */
      if (!_searchActive) {
        _hide(_$('artisans-container'));
        _hide(_$('loading-artisans'));
        _hide(_$('other-see-more-wrap'));
      }
    };
    window.renderArtisans._original  = _originalRenderArtisans;
    window.renderArtisans._isPremium = true;
  }

  /* ══════════════════════════════════════════════════════
     DETECT SEARCH ACTIVITY
  ══════════════════════════════════════════════════════ */

  function _isSearchActive() {
    var ids = ['search-input','ssb2-input-nlp'];
    var sels= ['filter-category','filter-city','filter-availability',
               'ssb2-select-cat','ssb2-select-city'];
    for (var i=0;i<ids.length;i++){var el=_$(ids[i]);if(el&&el.value.trim())return true;}
    for (var j=0;j<sels.length;j++){var el2=_$(sels[j]);if(el2&&el2.value)return true;}
    return false;
  }

  /* ══════════════════════════════════════════════════════
     EVENT LISTENERS
  ══════════════════════════════════════════════════════ */

  function _bindEvents() {
    /* Any search trigger → enter search mode */
    function _onSearch() { if (_isSearchActive()) _enterSearchMode(); }

    ['ssb2-btn-search','hero-search-btn','ssb2-btn-search-mobile'].forEach(function(id){
      var el=_$(id); if(el) el.addEventListener('click',_onSearch);
    });
    _qa('.filter-chip, .ssb2-qfilter, .qf-btn').forEach(function(el){
      el.addEventListener('click', function(){ _enterSearchMode(); });
    });
    /* Inputs */
    ['search-input','ssb2-input-nlp'].forEach(function(id){
      var el=_$(id);
      if(el) el.addEventListener('input', function(){
        if(el.value.trim()) _enterSearchMode();
      });
    });
    /* Reset → back to homepage mode */
    var resetBtn = _$('results-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function(){
        setTimeout(function(){
          if (!_isSearchActive()) _enterHomepageMode();
        }, 150);
      });
    }
    /* Seeds patch fires this event when ARTISANS is enriched */
    window.addEventListener('fixeo:marketplace-artisans-updated', function(){
      if (!_searchActive) _renderPremiumGrid();
    });
  }

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */

  function init() {
    _enterHomepageMode();
    _patchRender();
    _bindEvents();
    console.log('✅ Fixeo Homepage Premium Patch v2 ready');
  }

  /* Run as early as possible — no artificial delay */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Also expose a re-render hook */
  window.FixeoHomepagePremium = { refresh: _renderPremiumGrid, enterSearch: _enterSearchMode, enterHomepage: _enterHomepageMode };

}(window));
