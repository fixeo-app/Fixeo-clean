(function () {
  // ── PARSE-TIME FLAG — set before any defer script runs ──────────────────────
  // main.js renderArtisans and applyMarketplaceFilters are shared with the
  // homepage and run on results.html too (no page guard in main.js).
  // This flag lets us neutralize window.renderArtisans after urgent init
  // so main.js rAF callbacks cannot clobber fxu-card output.
  window.__FIXEO_URGENT_PAGE__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const CATEGORY_RULES = [
    { category: 'plomberie', keywords: ['fuite', 'eau', 'robinet', 'toilette', 'wc', 'canalisation', 'chauffe eau', 'chauffe-eau', 'évier', 'evier', 'plomberie'] },
    { category: 'electricite', keywords: ['electricite', 'électricité', 'courant', 'prise', 'tableau', 'lumiere', 'lumière', 'disjoncteur', 'panne electrique', 'panne électrique'] },
    { category: 'serrurerie', keywords: ['serrure', 'porte', 'clé', 'cle', 'verrou'] },
    { category: 'climatisation', keywords: ['clim', 'climatisation', 'chauffage', 'vmc', 'pompe a chaleur', 'pompe à chaleur'] },
    { category: 'nettoyage', keywords: ['nettoyage', 'ménage', 'menage', 'désinfection', 'desinfection', 'vitre'] },
    { category: 'peinture', keywords: ['peinture', 'mur', 'enduit', 'plafond'] },
    { category: 'menuiserie', keywords: ['fenêtre', 'fenetre', 'placard', 'meuble', 'porte bois', 'charnière', 'charniere'] },
    { category: 'bricolage', keywords: ['fixation', 'montage', 'perçage', 'percage', 'petit travaux', 'petits travaux'] },
    { category: 'maconnerie', keywords: ['carrelage', 'béton', 'beton', 'fissure', 'maçonnerie', 'maconnerie'] },
    { category: 'jardinage', keywords: ['jardin', 'pelouse', 'taille', 'arrosage'] },
    { category: 'demenagement', keywords: ['déménagement', 'demenagement', 'transport', 'camion'] }
  ];


  const URGENT_EVENTS_STORAGE_KEY = 'fixeo_urgent_events';
  const MAX_URGENT_EVENTS = 250;

  function getUrgentAnalytics() {
    if (window.FixeoUrgentAnalytics) return window.FixeoUrgentAnalytics;

    const readEvents = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(URGENT_EVENTS_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    };

    const api = {
      track(type, payload = {}) {
        if (!type) return null;
        const event = {
          id: `urgent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          type,
          timestamp: new Date().toISOString(),
          page: window.location.pathname.split('/').pop() || 'results.html',
          payload,
        };

        try {
          const events = readEvents();
          events.unshift(event);
          localStorage.setItem(URGENT_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_URGENT_EVENTS)));
        } catch (error) {
          console.warn('Fixeo urgent analytics unavailable', error);
        }

        return event;
      },
      read: readEvents,
    };

    window.FixeoUrgentAnalytics = api;
    return api;
  }

  function trackUrgentEvent(type, payload = {}) {
    return getUrgentAnalytics().track(type, payload);
  }

  function norm(value) {
    return (value || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function inferCategory(query) {
    const text = norm(query);
    if (!text) return '';

    let bestCategory = '';
    let bestScore = 0;

    CATEGORY_RULES.forEach((rule) => {
      const score = rule.keywords.reduce((sum, keyword) => sum + (text.includes(norm(keyword)) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = rule.category;
      }
    });

    return bestCategory;
  }

  function getUrlState() {
    const params = new URLSearchParams(window.location.search);
    return {
      urgent: params.get('urgent') === '1',
      query: (params.get('query') || '').trim(),
      city: (params.get('city') || '').trim(),
      category: inferCategory(params.get('query') || '')
    };
  }

  function availabilityRank(artisan) {
    if (artisan.availability === 'available') return 0;
    if (artisan.availability === 'busy') return 1;
    return 2;
  }

  function sortUrgentResults(list, sortBy) {
    const items = [...list];

    items.sort((a, b) => {
      const availabilityDiff = availabilityRank(a) - availabilityRank(b);
      if (availabilityDiff !== 0) return availabilityDiff;

      if (sortBy === 'price_asc') {
        const priceDiff = Number(a.priceFrom || 0) - Number(b.priceFrom || 0);
        if (priceDiff !== 0) return priceDiff;
      }

      if (sortBy === 'rating') {
        const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
      }

      const responseDiff = Number(a.responseTime || 999) - Number(b.responseTime || 999);
      if (responseDiff !== 0) return responseDiff;

      return Number(b.rating || 0) - Number(a.rating || 0);
    });

    return items;
  }

  function filterUrgentResults(baseList, state, uiFilters) {
    const cityNorm = norm(uiFilters.city || state.city);
    const category = uiFilters.category || state.category;
    const availability = uiFilters.availability || '';

    let list = Array.isArray(baseList) ? [...baseList] : [];

    if (cityNorm) {
      list = list.filter((artisan) => norm(artisan.city) === cityNorm);
    }

    if (category) {
      list = list.filter((artisan) => norm(artisan.category) === norm(category));
    }

    if (availability) {
      list = list.filter((artisan) => artisan.availability === availability);
    }

    return sortUrgentResults(list, uiFilters.sortBy || 'response');
  }

  // ── Helpers (self-contained, mirrored from fixeo_homepage_premium_patch.js) ──
  var _UC_ICONS = {
    plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹',
    jardinage:'🌿', demenagement:'📦', bricolage:'🔨', climatisation:'❄️',
    menuiserie:'🪚', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🏠',
    etancheite:'🛡', vitrerie:'🪟', soudure:'🔥', informatique:'💻'
  };
  var _UC_LABELS = {
    plomberie:'Plomberie', electricite:'Électricité', peinture:'Peinture',
    nettoyage:'Nettoyage', jardinage:'Jardinage', demenagement:'Déménagement',
    bricolage:'Bricolage', climatisation:'Climatisation', menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie', serrurerie:'Serrurerie', carrelage:'Carrelage',
    etancheite:'Étanchéité', vitrerie:'Vitrerie', soudure:'Soudure',
    informatique:'Informatique'
  };
  var _UC_PRICES = {
    plomberie:{from:80}, electricite:{from:100}, menuiserie:{from:150},
    peinture:{from:100}, nettoyage:{from:60}, climatisation:{from:150},
    maconnerie:{from:200}, carrelage:{from:120}, jardinage:{from:80},
    serrurerie:{from:60}, demenagement:{from:300}, bricolage:{from:80},
    etancheite:{from:200}, vitrerie:{from:100}, soudure:{from:150},
    informatique:{from:80}
  };
  function _ucEsc(s) {
    return String(s||'').replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function _ucInitials(name) {
    if (!name) return '??';
    var p = String(name).trim().split(/\s+/);
    return ((p[0]||'?')[0]+((p[1]||p[0]||'?')[0])).toUpperCase();
  }
  function _ucRtLabel(rt) {
    rt = parseInt(rt,10);
    if (!rt||rt>=999) return null;
    if (rt<=10) return 'Répond en 10 min';
    if (rt<=30) return 'Répond en '+rt+' min';
    if (rt<=60) return 'Répond en 1h';
    return 'Répond en '+Math.round(rt/60)+'h';
  }
  function _ucMisLabel(a) {
    var m = parseInt(a.missionsCompleted||a.missions_count||a.reviewCount||a.reviews||0,10);
    if (m>=50) return m+' missions';
    if (m>=10) return m+' missions';
    return null;
  }
  function _ucPrice(a) {
    var cat = (a.category||a.service||'').toLowerCase().trim();
    // 1. Prefer FixeoPricing — ensures consistency with displayed market range
    var _fp = window.FixeoPricing && window.FixeoPricing.getPricing && window.FixeoPricing.getPricing(cat);
    if (_fp && _fp.from) return _fp.from;
    // 2. Artisan-specific price (if set and non-default)
    if (a.priceFrom||a.price_from) {
      var pf=parseInt(a.priceFrom||a.price_from,10);
      if (!isNaN(pf)&&pf>0) return pf;
    }
    // 3. Local table fallback
    return (_UC_PRICES[cat]||{from:150}).from;
  }

  // ── fxu-card builder — fully inline-styled, zero CSS file dependency ──
  // Unique class: fxu-card (Fixeo Urgent Card). No .pvc-* or .artisan-card collision.
  // Does NOT call renderArtisans — filtering guaranteed by filterUrgentResults.
  function buildUrgentCard(artisan, idx) {
    idx = idx || 0;

    var cat       = (artisan.category||artisan.service||'').toLowerCase();
    var catIcon   = _UC_ICONS[cat]||'🔧';
    var catLbl    = _UC_LABELS[cat]||(artisan.service||artisan.category||'Service');
    var rating    = parseFloat(artisan.rating)||0;
    var reviews   = parseInt(artisan.reviewCount||artisan.reviews||0,10);
    var trust     = parseInt(artisan.trustScore||0,10);
    var rt        = parseInt(artisan.responseTime||999,10);
    var isVer     = !!(artisan.verified||artisan.certified||trust>=85);
    var avail     = (artisan.availability||'').toLowerCase();
    var isAvail   = avail==='available'||artisan.available;
    var priceFrom = _ucPrice(artisan);
    var rtLabel   = _ucRtLabel(rt);

    // ── Avatar ──────────────────────────────────────────────────
    var initials  = _ucInitials(artisan.name);
    var avatarSrc = artisan.avatar||artisan.photo||artisan.photo_url||'';
    var avatarInner = avatarSrc
      ? '<img src="'+avatarSrc+'" alt="'+_ucEsc(artisan.name)+'" loading="lazy"'
          +' style="width:100%;height:100%;object-fit:cover;border-radius:50%"'
          +' onerror="this.onerror=null;this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">'
          +'<span class="fxu-initials" style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-weight:800;font-size:1rem;letter-spacing:.02em;color:#fff">'+initials+'</span>'
      : '<span class="fxu-initials" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-weight:800;font-size:1rem;letter-spacing:.02em;color:#fff">'+initials+'</span>';

    // ── Availability badge ───────────────────────────────────────
    var availColor  = isAvail ? 'rgba(46,204,113,.18)' : 'rgba(255,255,255,.07)';
    var availBorder = isAvail ? 'rgba(46,204,113,.45)'  : 'rgba(255,255,255,.15)';
    var availText   = isAvail ? '#2ecc71'               : 'rgba(255,255,255,.62)';
    var availLabel  = isAvail ? '🟢 Disponible'         : '⏱ Sur rendez-vous';

    // ── Rating stars ─────────────────────────────────────────────
    var starsStr = '';
    if (rating > 0) {
      var rv = Math.round(rating*2)/2;
      for (var i=1;i<=5;i++) starsStr += i<=rv ? '★' : (rv>=i-0.5 ? '½' : '☆');
    }

    // ── Verified badge ───────────────────────────────────────────
    var verBadge = isVer
      ? '<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.22rem .6rem;'
          +'border-radius:999px;font-size:.74rem;font-weight:700;'
          +'background:rgba(55,66,250,.18);border:1px solid rgba(55,66,250,.35);color:#7c8ff5">'
          +'✔ Vérifié Fixeo</span>'
      : '';

    // ── Response chip ────────────────────────────────────────────
    var rtChip = rtLabel
      ? '<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.22rem .6rem;'
          +'border-radius:999px;font-size:.74rem;font-weight:600;'
          +'background:rgba(255,209,0,.1);border:1px solid rgba(255,209,0,.2);color:#ffd54f">'
          +'⚡ '+rtLabel+'</span>'
      : '';

    return ''
    // ── Card wrapper ─────────────────────────────────────────────
    +'<article class="fxu-card"'
      +' data-artisan-id="'+artisan.id+'"'
      +' tabindex="0" role="button"'
      +' aria-label="'+_ucEsc(artisan.name)+', '+_ucEsc(catLbl)+'"'
      +' style="'
        +'display:flex;flex-direction:column;gap:0;'
        +'background:linear-gradient(160deg,rgba(28,28,52,.96) 0%,rgba(18,18,38,.99) 100%);'
        +'border:1px solid rgba(255,255,255,.1);'
        +'border-radius:20px;'
        +'overflow:hidden;'
        +'cursor:pointer;'
        +'transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;'
        +'box-shadow:0 4px 28px rgba(0,0,0,.38);'
        +(isVer ? 'border-left:3px solid rgba(55,66,250,.55);' : '')
      +'"'
      +' onmouseenter="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 12px 40px rgba(0,0,0,.45)\';this.style.borderColor=\'rgba(225,48,108,.4)\'"'
      +' onmouseleave="this.style.transform=\'\';this.style.boxShadow=\'0 4px 28px rgba(0,0,0,.35)\';this.style.borderColor=\''+(isVer?'rgba(55,66,250,.55)':'rgba(255,255,255,.1)')+'\'"'
    +'>'

    // ── Header band ──────────────────────────────────────────────
    +'<div style="display:flex;align-items:flex-start;gap:.9rem;padding:1.1rem 1.1rem .8rem">'
      // Avatar
      +'<div style="'
        +'width:52px;height:52px;border-radius:50%;flex-shrink:0;'
        +'background:linear-gradient(135deg,#e1306c,#833ab4);'
        +'overflow:hidden;position:relative;'
        +(isVer?'box-shadow:0 0 0 2px rgba(55,66,250,.55)':'')+'">'
        +avatarInner
      +'</div>'
      // Identity
      +'<div style="min-width:0;flex:1">'
        +'<h3 style="margin:0 0 .3rem;font-size:1.05rem;font-weight:800;line-height:1.2;'
          +'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff">'
          +_ucEsc(artisan.name||'—')
        +'</h3>'
        +'<div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">'
          +'<span style="display:inline-flex;align-items:center;gap:.25rem;padding:.2rem .55rem;'
            +'border-radius:999px;font-size:.78rem;font-weight:700;'
            +'background:rgba(225,48,108,.14);border:1px solid rgba(225,48,108,.28);color:#ffb8cf">'
            +catIcon+' '+_ucEsc(catLbl)
          +'</span>'
          +'<span style="display:inline-flex;align-items:center;gap:.25rem;'
            +'font-size:.78rem;color:rgba(255,255,255,.58)">'
            +'📍 '+_ucEsc(artisan.city||'Maroc')
          +'</span>'
        +'</div>'
      +'</div>'
      // Availability badge — right-aligned
      +'<span style="'
        +'flex-shrink:0;display:inline-flex;align-items:center;'
        +'padding:.22rem .6rem;border-radius:999px;'
        +'font-size:.74rem;font-weight:700;white-space:nowrap;'
        +'background:'+availColor+';border:1px solid '+availBorder+';color:'+availText+'">'
        +availLabel
      +'</span>'
    +'</div>'

    // ── Divider ──────────────────────────────────────────────────
    +'<div style="height:1px;background:rgba(255,255,255,.07);margin:0 1.1rem"></div>'

    // ── Stats row (rating + badges) ──────────────────────────────
    +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.75rem 1.1rem">'
      +(rating>0
        ? '<span style="color:#ffd166;font-weight:800;font-size:.95rem;letter-spacing:.02em">'+starsStr+'</span>'
          +'<span style="color:#ffd166;font-weight:800">'+rating.toFixed(1)+'</span>'
          +(reviews>0?'<span style="color:rgba(255,255,255,.52);font-size:.82rem">('+reviews+' avis)</span>':'')
        : '<span style="color:rgba(255,255,255,.5);font-size:.82rem">✨ Nouveau</span>'
      )
      +(trust>0?'<span style="margin-left:auto;font-size:.76rem;color:rgba(255,255,255,.38)">Score '+trust+'/100</span>':'')
    +'</div>'

    // ── Chips row (verified + response) ─────────────────────────
    +((verBadge||rtChip)
      ? '<div style="display:flex;flex-wrap:wrap;gap:.45rem;padding:0 1.1rem .75rem">'+verBadge+rtChip+'</div>'
      : ''
    )

    // ── Price row ────────────────────────────────────────────────
    +'<div style="padding:.55rem 1.1rem .4rem;display:flex;align-items:center;gap:.4rem">'
      +'<span style="font-size:.8rem;color:rgba(255,255,255,.48)">À partir de</span>'
      +'<span style="font-size:1.08rem;font-weight:800;color:#fff">'+priceFrom+'<span style="font-size:.75rem;font-weight:600;color:rgba(255,255,255,.55);margin-left:.2rem">MAD</span></span>'
    +'</div>'

    // ── Fixeo pricing hint ────────────────────────────────────────
    +(function(){
      var _fp = window.FixeoPricing && window.FixeoPricing.getPricing
        && window.FixeoPricing.getPricing(artisan.category);
      if (!_fp || !_fp.range) return '';
      var _rec = Math.round((_fp.from + _fp.to) / 2);
      return '<div style="padding:0 1.1rem .7rem;line-height:1.35">'
        + '<div style="font-size:.74rem;color:rgba(255,255,255,.32)">'
          + 'March\u00e9\u00a0: ' + _fp.range
        + '</div>'
        + '<div style="font-size:.78rem;color:rgba(255,255,255,.55);margin-top:1px">'
          + '\ud83d\udca1 Prix recommand\u00e9 Fixeo\u00a0: '
          + '<strong style="color:rgba(255,255,255,.82)">~' + _rec + '\u00a0MAD</strong>'
        + '</div>'
      + '</div>';
    })()

    // ── CTA row ──────────────────────────────────────────────────
    +'<div style="display:flex;flex-direction:row;gap:.6rem;padding:.7rem 1.1rem 1rem;flex-wrap:wrap">'
      // Primary — dominant, full-width on mobile via flex-basis
      +'<button class="fxu-btn-reserve" type="button"'
        +' style="'
          +'flex:1 1 100%;'
          +'min-width:0;'
          +'height:52px;'
          +'padding:0 1.2rem;'
          +'border:none;border-radius:14px;'
          +'background:linear-gradient(135deg,#ff416c,#ff4b2b);'
          +'color:#fff;'
          +'font-weight:600;font-size:1rem;letter-spacing:.01em;'
          +'text-shadow:none;filter:none;'
          +'cursor:pointer;'
          +'box-shadow:0 4px 12px rgba(255,65,108,.25);'
          +'transition:opacity .15s,box-shadow .15s"'
        +' onmouseenter="this.style.opacity=\'.88\';this.style.boxShadow=\'0 8px 20px rgba(255,65,108,.38)\'"'
        +' onmouseleave="this.style.opacity=\'1\';this.style.boxShadow=\'0 4px 12px rgba(255,65,108,.25)\'">'
        +'📅 Réserver maintenant'
      +'</button>'
      // Secondary — smaller, subdued, same row on desktop (shrinks to fit)
      +'<button class="fxu-btn-profile" type="button"'
        +' style="'
          +'flex:0 0 auto;'
          +'height:44px;'
          +'padding:0 .9rem;'
          +'border-radius:12px;'
          +'background:rgba(255,255,255,.06);'
          +'border:1px solid rgba(255,255,255,.12);'
          +'color:rgba(255,255,255,.65);'
          +'font-weight:500;font-size:.88rem;'
          +'cursor:pointer;'
          +'transition:background .15s"'
        +' onmouseenter="this.style.background=\'rgba(255,255,255,.11)\'" onmouseleave="this.style.background=\'rgba(255,255,255,.06)\'">'
        +'Voir profil'
      +'</button>'
    +'</div>'

    +'</article>';
  }

  // CTA handlers — wired via event delegation after render
  function _ucDoProfile(artisan) {
    if (!artisan) return;
    if (window.FixeoPublicProfileLinks && typeof window.FixeoPublicProfileLinks.openBySourceId === 'function') {
      window.FixeoPublicProfileLinks.openBySourceId(String(artisan.id));
    } else {
      window.location.href = 'artisan-profile.html?id=' + encodeURIComponent(String(artisan.id));
    }
  }
  function _ucDoReserve(artisan, state) {
    if (!artisan) return;
    if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
      // Pass urgent context so reservation modal prefills query, service, slot
      var urgentCtx = {
        urgent: true,
        query:    (state && state.query)    || '',
        city:     (state && state.city)     || artisan.city    || '',
        category: (state && state.category) || artisan.category || '',
        source: 'urgent-results'
      };
      window.FixeoReservation.open(artisan, false, urgentCtx);
    } else if (typeof window.openBookingModal === 'function') {
      window.openBookingModal(artisan.id);
    } else {
      _ucDoProfile(artisan);
    }
  }
  function _bindUrgentCardClicks(container, results, state) {
    if (!container) return;
    container.addEventListener('click', function(e) {
      var card = e.target.closest('[data-artisan-id]');
      if (!card) return;
      var id = String(card.dataset.artisanId);
      var artisan = (Array.isArray(results)?results:[]).find(function(a){ return String(a.id)===id; });
      if (e.target.closest('.fxu-btn-reserve')) {
        e.stopPropagation();
        _ucDoReserve(artisan, state);
      } else if (e.target.closest('.fxu-btn-profile')) {
        e.stopPropagation();
        _ucDoProfile(artisan);
      } else {
        _ucDoReserve(artisan, state);
      }
    });
  }

  // Keep buildFallbackCard as alias for backward compatibility (not called in urgent flow)
  function buildFallbackCard(artisan) { return buildUrgentCard(artisan, 0); }

  function updateSummary(state, results) {
    $('#urgent-city').textContent = state.city || 'Toutes les villes';
    $('#urgent-query').textContent = state.query || 'Besoin urgent';
    $('#results-main-meta').textContent = `${results.length} artisan${results.length > 1 ? 's' : ''} disponible${results.length > 1 ? 's' : ''} • Priorité aux réponses rapides`;
    $('#results-context-line').textContent = state.city
      ? `Ville sélectionnée : ${state.city} · besoin : ${state.query || 'urgence'}`
      : `Besoin : ${state.query || 'urgence'} · résultats classés par rapidité`;
    $('#results-count').textContent = `${results.length} résultat${results.length > 1 ? 's' : ''}`;
    $('#other-artisans-count-badge').textContent = `👷 ${results.length} profil${results.length > 1 ? 's' : ''}`;

    const editLink = $('#empty-edit-link');
    if (editLink) {
      editLink.href = `index.html#services`;
    }
  }

  function populateCities(baseList, selectedCity) {
    const citySelect = $('#results-filter-city');
    if (!citySelect) return;

    const cities = Array.from(new Set((Array.isArray(baseList) ? baseList : []).map((artisan) => artisan.city).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
    citySelect.innerHTML = '<option value="">Toutes les villes</option>' + cities.map((city) => `<option value="${city}">${city}</option>`).join('');
    if (selectedCity && cities.includes(selectedCity)) {
      citySelect.value = selectedCity;
    }
  }

  function openUrgentBooking(artisan, state) {
    if (!artisan) return;

    const payload = {
      artisanId: artisan.id,
      artisanName: artisan.name || 'Artisan',
      city: state.city || artisan.city || '',
      query: state.query || '',
      source: 'urgent_results_page'
    };

    trackUrgentEvent('artisan_click', payload);

    if (typeof window.openBookingModal === 'function') {
      trackUrgentEvent('conversion', payload);
      window.openBookingModal(artisan.id);
    }
  }

  function enhanceUrgentResultButtons(results, state) {
    const container = $('#artisans-container');
    if (!container) return;

    const artisanMap = new Map((Array.isArray(results) ? results : []).map((artisan) => [String(artisan.id), artisan]));

    $$('.btn-other-reserve, .fixeo-reserve-btn', container).forEach((button) => {
      const card = button.closest('.artisan-card[data-id], .result-card[data-id], article[data-id]');
      const artisanId = String(button.dataset.artisanId || card?.dataset.id || '');
      const artisan = artisanMap.get(artisanId);
      button.type = 'button';
      button.removeAttribute('onclick');
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openUrgentBooking(artisan, state);
      };
    });
  }

  function renderResults(results, state) {
    const container = $('#artisans-container');
    const loading = $('#loading-artisans');
    const empty = $('#no-artisan');

    if (loading) loading.style.display = 'none';

    if (!container) return;

    if (!results.length) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    // Always use the dedicated urgent card renderer — never delegating to
    // window.renderArtisans which re-sorts by global trust_score/missions and
    // could clobber the city+category-filtered list with wrong artisans.
    container.innerHTML = results.map(function(a,i){ return buildUrgentCard(a,i); }).join('');
    _bindUrgentCardClicks(container, results, state);
    enhanceUrgentResultButtons(results, state); // keep for .fixeo-reserve-btn wiring
  }

  function initUrgentResultsPage() {
    const state = getUrlState();
    const baseList = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];

    populateCities(baseList, state.city);

    const uiState = {
      city: state.city,
      category: state.category,
      availability: 'available',
      sortBy: 'response'
    };

    const apply = () => {
      uiState.city = $('#results-filter-city')?.value || state.city;
      uiState.availability = $('#results-filter-availability')?.value || 'available';
      uiState.sortBy = $('#results-sort-select')?.value || 'response';

      const results = filterUrgentResults(baseList, state, uiState);
      updateSummary(state, results);
      renderResults(results, state);
    };

    $('#results-filter-city')?.addEventListener('change', apply);
    $('#results-filter-availability')?.addEventListener('change', apply);
    $('#results-sort-select')?.addEventListener('change', apply);
    $('#results-reset-btn')?.addEventListener('click', () => {
      const citySelect = $('#results-filter-city');
      const availabilitySelect = $('#results-filter-availability');
      const sortSelect = $('#results-sort-select');
      if (citySelect) citySelect.value = state.city || '';
      if (availabilitySelect) availabilitySelect.value = 'available';
      if (sortSelect) sortSelect.value = 'response';
      apply();
    });

    apply();

    // ── CLOBBER GUARD ────────────────────────────────────────────────────────
    // main.js refreshMarketplaceFromCurrentFilters() fires a requestAnimationFrame
    // callback (applyMarketplaceFilters → renderArtisans) AFTER DOMContentLoaded —
    // which overwrites fxu-card output back to old .artisan-card markup.
    // Neutralize window.renderArtisans so any pending rAF from main.js is a no-op.
    // This ONLY affects the urgent results page (guarded by __FIXEO_URGENT_PAGE__).
    window.renderArtisans = function urgentPageGuard() {
      // no-op — urgent results page owns #artisans-container exclusively
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUrgentResultsPage, { once: true });
  } else {
    initUrgentResultsPage();
  }
})();
