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
  function _sortList(list) {
    var real  = list.filter(function(a){ return !a.claimable && !a._isSeed; });
    var seeds = list.filter(function(a){ return  a.claimable ||  a._isSeed; });
    function sc(a){ return (a.trustScore||0)*1.2+(a.rating||0)*8+(a.availability==='available'?18:0)+((a.reviewCount||0)>10?5:0)+(a.verified||a.certified?10:0); }
    real.sort(function(a,b){return sc(b)-sc(a);});
    seeds.sort(function(a,b){return sc(b)-sc(a);});
    return real.concat(seeds);
  }

  /* ── Build pvc-card (no inline onclick — delegation handles clicks) ── */
  function _buildCard(a, idx) {
    var avail   = (a.availability||'').toLowerCase();
    var isAvail = avail==='available';
    var isToday = avail==='available_today';
    var catIcon = CAT_ICONS[a.category]||'🔧';
    var catLbl  = CAT_LABELS[a.category]||(a.service||a.category||'Service');
    var rating  = parseFloat(a.rating)||0;
    var reviews = parseInt(a.reviewCount||0,10);
    var trust   = parseInt(a.trustScore||0,10);
    var rt      = parseInt(a.responseTime||999,10);
    var price   = parseInt(a.priceFrom||150,10);
    var unit    = a.priceUnit||'h';
    var isReal  = !a.claimable && !a._isSeed;
    var isVer   = a.verified||a.certified||(a.badges||[]).indexOf('verified')>=0||trust>=85;

    var initials = _initials(a.name);
    var src = a.avatar||a.photo||a.image||'';
    var avatarHtml = src
      ? '<img class="pvc-avatar-img" src="'+src+'" alt="'+(a.name||'')+'" loading="lazy"'+
        ' onerror="this.onerror=null;this.style.display=\'none\';this.parentNode.querySelector(\'.pvc-avatar-initials\').style.display=\'flex\';">'+
        '<span class="pvc-avatar-initials" style="display:none">'+initials+'</span>'
      : '<span class="pvc-avatar-initials">'+initials+'</span>';

    var availPill = isAvail
      ? '<span class="pvc-avail pvc-avail--on">🟢 Disponible</span>'
      : isToday ? '<span class="pvc-avail pvc-avail--today">🟡 Auj.</span>'
                : '<span class="pvc-avail pvc-avail--off">Réservation</span>';

    var badges = [];
    if (isVer)     badges.push('<span class="pvc-badge pvc-badge--verified">✔ Vérifié</span>');
    if (rt<=30)    badges.push('<span class="pvc-badge pvc-badge--fast">⚡ Rapide</span>');
    if (trust>=90) badges.push('<span class="pvc-badge pvc-badge--premium">🏅 Premium</span>');

    var starsHtml = rating>0
      ? '<span class="pvc-stars">'+_stars(rating)+'</span>'+
        '<span class="pvc-rating-val">'+rating.toFixed(1)+'</span>'+
        (reviews>0?'<span class="pvc-reviews">('+reviews+')</span>':'')
      : '<span class="pvc-rating-empty">Nouveau</span>';

    var trustBar = trust>0
      ? '<div class="pvc-trust-bar"><div class="pvc-trust-fill" style="width:'+trust+'%"></div></div>'+
        '<span class="pvc-trust-label">'+trust+'%</span>' : '';

    /* Store artisan data as JSON on the article for delegation */
    var dataAttr = ' data-artisan=\''+JSON.stringify(a).replace(/'/g,'&#39;')+'\'';

    return '<article class="pvc-card fhp-card'+(isReal?' pvc-card--real':'')+
        '" data-artisan-id="'+a.id+'"'+dataAttr+
        ' tabindex="0" role="button" aria-label="Artisan '+(a.name||'')+'"'+
        ' style="--anim-delay:'+idx+';">'+
      '<div class="pvc-top">'+
        '<div class="pvc-avatar">'+avatarHtml+'</div>'+
        '<div class="pvc-identity">'+
          '<h3 class="pvc-name">'+(a.name||'')+'</h3>'+
          '<p class="pvc-meta"><span class="pvc-cat-icon">'+catIcon+'</span>'+catLbl+' · <span class="pvc-city">📍 '+(a.city||'Maroc')+'</span></p>'+
        '</div>'+availPill+
      '</div>'+
      (badges.slice(0,2).length?'<div class="pvc-badges">'+badges.slice(0,2).join('')+'</div>':'')+
      '<div class="pvc-rating-row">'+
        '<div class="pvc-rating">'+starsHtml+'</div>'+
        (trust>0?'<div class="pvc-trust">'+trustBar+'</div>':'')+
      '</div>'+
      '<div class="pvc-pricing">'+
        '<span class="pvc-price">Dès <strong>'+price+' MAD</strong><span class="pvc-unit">/'+unit+'</span></span>'+
        (rt<999?'<span class="pvc-rt">⏱ '+rt+' min</span>':'')+
      '</div>'+
      '<div class="pvc-actions">'+
        '<button class="pvc-btn-primary fhp-btn-reserve" type="button" aria-label="Réserver '+(a.name||'')+'">📅 Réserver</button>'+
        '<button class="pvc-btn-secondary fhp-btn-profile" type="button" aria-label="Voir profil de '+(a.name||'')+'">Voir profil</button>'+
      '</div>'+
    '</article>';
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
  function _buildHeader(total) {
    var avail = (window.ARTISANS||[]).filter(function(a){ return a.availability==='available'; }).length;
    var count = avail > 0 ? avail : total;

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
    var list = window.ARTISANS || [];
    if (!list.length) { setTimeout(_renderPremiumGrid, 500); return; }

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

    var sorted = _sortList(list).slice(0, MAX_CARDS);
    pg.innerHTML = sorted.map(renderCard).join('');

    /* Re-bind delegation (innerHTML replaced) */
    pg.removeEventListener('click', pg._fhpDelegate);
    _bindGridDelegation(pg);

    /* Re-bind if SecondarySearch renderer was used (buttons have inline onclick — override) */
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

    _buildHeader(list.length);
    _triggerFadeIn(pg);
  }

  /* ── Fade-in animation ── */
  function _triggerFadeIn(pg) {
    var cards = pg.querySelectorAll('.pvc-card, .fhp-card');
    cards.forEach(function(card, i) {
      card.classList.remove('fhp-visible');
      card.style.animationDelay = (i * 80) + 'ms';
      setTimeout(function(){ card.classList.add('fhp-visible'); }, 60 + i * 80);
    });
  }

  /* ── Hide / Show old layout chrome ── */
  var OLD_IDS = ['artisans-container','loading-artisans','no-artisan','other-artisans-banner','other-see-more-wrap','edit-results-search-btn'];
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
    var pg = _$(GRID_ID); if (pg) _hide(pg);
    var hd = _$(HEADER_ID); if (hd) _hide(hd);
  }

  /* ── MutationObserver ── */
  function _startObserver() {
    if (_containerObserver) return;
    var target = _$(SECTION_ID);
    if (!target || !window.MutationObserver) return;
    _containerObserver = new MutationObserver(function() {
      if (!_searchActive) {
        ['artisans-container','loading-artisans','other-see-more-wrap'].forEach(function(id){
          var el=_$(id); if(el && getComputedStyle(el).display!=='none') _hide(el);
        });
      }
    });
    _containerObserver.observe(target, {childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  }
  function _stopObserver() { if (_containerObserver) { _containerObserver.disconnect(); _containerObserver=null; } }

  /* ── Mode switches ── */
  function _enterHomepageMode() {
    _searchActive = false;
    document.body.classList.remove('fixeo-search-mode');
    _hideResultsChrome();
    _renderPremiumGrid();
    _startObserver();
  }
  function _enterSearchMode() {
    _searchActive = true;
    _stopObserver();
    document.body.classList.add('fixeo-search-mode');
    _showResultsChrome();
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
    window.addEventListener('fixeo:marketplace-artisans-updated',function(){
      if(!_searchActive) _renderPremiumGrid();
    });
  }

  /* ── Init ── */
  function init() {
    _enterHomepageMode();
    _patchRender();
    _bindEvents();
    console.log('✅ Fixeo Homepage Premium Patch v3 ready');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.FixeoHomepagePremium = { refresh:_renderPremiumGrid, enterSearch:_enterSearchMode, enterHomepage:_enterHomepageMode };

}(window));
