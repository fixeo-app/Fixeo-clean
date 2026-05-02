/**
 * ================================================================
 *  FIXEO v8 - SECONDARY SMART SEARCH ENGINE
 *  Mirrors HERO bar behaviour - identical filters, same search pipe
 *  Key difference: results rendered INLINE below bar (no modal)
 *
 *  Dependencies (must load BEFORE this file):
 *    - smart-search.js   → SSB_DATA, SSBNLPMapper, ssbApplyFilters
 *    - main.js           → ARTISANS, window.searchEngine
 *    - reservation.js    → window.FixeoReservation
 * ================================================================
 */

'use strict';

(function (window) {

  /* ── Config ── */
  const VEDETTE_VISIBLE_ROWS = 2;

  function getResponsiveVedetteColumns() {
    const width = window.innerWidth || document.documentElement.clientWidth || 1440;
    if (width <= 720) return 1;
    return 2; /* 2-col desktop grid */
  }

  function getResponsiveVedetteInitialCount() {
    return getResponsiveVedetteColumns() * VEDETTE_VISIBLE_ROWS;
  }

  function getResponsiveVedetteStep() {
    return getResponsiveVedetteColumns();
  }

  /* ── Category maps (mirrors smart-search.js + hero-search-modal.js) ── */
  const CAT_ICONS = {
    plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹',
    jardinage:'🌿', demenagement:'🚛', bricolage:'🔨', climatisation:'❄️',
    menuiserie:'🪚', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🏠',
  };
  const CAT_LABELS = {
    plomberie:'Plomberie', electricite:'Électricité', peinture:'Peinture',
    nettoyage:'Nettoyage', jardinage:'Jardinage', demenagement:'Déménagement',
    bricolage:'Bricolage', climatisation:'Climatisation', menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie', serrurerie:'Serrurerie', carrelage:'Carrelage',
  };

  /* ── State ── */
  const s = {
    query: '', cat: '', city: '',
    filters: { availableNow: false, topScore: false, fastResponse: false },
    results: [],
    vedetteAll: [],
    vedetteVisibleCount: 0,
    vedetteExpanded: false,
    nlpMapper: null,   // resolved after smart-search.js loads
  };

  /* ════════════════════════════════════════════════════════
     UTILS
  ════════════════════════════════════════════════════════ */

  function _norm(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _initials(name) {
    return (name || '?').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  }

  function _stars(r) {
    const f = Math.round(parseFloat(r) || 4);
    return '★'.repeat(Math.max(0, f)) + '☆'.repeat(Math.max(0, 5 - f));
  }

  function _artisans() {
    return window.ARTISANS || (typeof ARTISANS !== 'undefined' ? ARTISANS : []);
  }

  /* Resolve NLP mapper: prefer SmartSearch._suggestor._nlp (global from smart-search.js) */
  function _nlpMapper() {
    if (s.nlpMapper) return s.nlpMapper;
    if (window.SmartSearch && window.SmartSearch._suggestor && window.SmartSearch._suggestor._nlp) {
      s.nlpMapper = window.SmartSearch._suggestor._nlp;
      return s.nlpMapper;
    }
    // Fallback: instantiate SSBNLPMapper if available globally
    if (typeof SSBNLPMapper !== 'undefined') {
      s.nlpMapper = new SSBNLPMapper();
      return s.nlpMapper;
    }
    return null;
  }

  /* ════════════════════════════════════════════════════════
     FILTER ENGINE
  ════════════════════════════════════════════════════════ */

  function filterArtisans(q, cat, city, filters) {
    let list = [..._artisans()];
    const n = _norm(q);

    /* ── NLP category detection (when no manual cat) ── */
    if (n.length >= 2 && !cat) {
      const mapper = _nlpMapper();
      if (mapper) {
        const cats = mapper.detectMulti ? mapper.detectMulti(q) : [];
        if (cats.length > 0) {
          list = list.filter(a => cats.includes(a.category));
        }
      }
    }

    /* ── Free-text filter (name / bio / skills) when no NLP cat ── */
    if (n.length >= 2 && !cat) {
      const mapper = _nlpMapper();
      const hasCatMatch = mapper ? (mapper.detectMulti(q) || []).length > 0 : false;
      if (!hasCatMatch) {
        list = list.filter(a =>
          _norm(a.name).includes(n) ||
          _norm(a.category).includes(n) ||
          (a.skills || []).some(sk => _norm(sk).includes(n)) ||
          _norm((a.bio && a.bio.fr) || '').includes(n)
        );
      }
    }

    /* ── Category filter ── */
    if (cat) list = list.filter(a => a.category === cat);

    /* ── City filter (accent-tolerant) ── */
    if (city) {
      const ck = _norm(city);
      list = list.filter(a => _norm(a.city || '') === ck);
    }

    /* ── Quick filters ── */
    if (filters.availableNow) list = list.filter(a => a.availability === 'available');
    if (filters.topScore)     list = list.filter(a => (a.trustScore || 0) >= 85);
    if (filters.fastResponse) list = list.filter(a => (a.responseTime || 999) <= 30);

    /* ── Smart ranking ── */
    list.sort((a, b) => {
      const sa = (a.trustScore || 0) + (a.availability === 'available' ? 15 : 0)
               - (a.responseTime || 60) * 0.2 + (a.rating || 0) * 2;
      const sb = (b.trustScore || 0) + (b.availability === 'available' ? 15 : 0)
               - (b.responseTime || 60) * 0.2 + (b.rating || 0) * 2;
      return sb - sa;
    });

    return list;
  }

  /* ════════════════════════════════════════════════════════
     CARD RENDERER  (.ssb2-card)
  ════════════════════════════════════════════════════════ */

  function renderCard(a, idx) {
    const avail   = (a.availability || '').toLowerCase();
    const isAvail = avail === 'available';
    const catLbl  = CAT_LABELS[a.category] || (a.category || 'Service');
    const rating  = parseFloat(a.rating) || 4.8;
    const avatar  = a.avatar || a.photo || a.image || 'default-avatar.jpg';
    const badgeHtml = [
      (a.badges || []).includes('verified') ? '<span class="ssb2-badge">✅ Vérifié</span>' : '',
      (a.trustScore || 0) >= 85 ? `<span class="ssb2-badge trust">🛡 ${a.trustScore}%</span>` : '',
      (a.responseTime || 999) <= 15 ? '<span class="ssb2-badge fast">⚡ Réponse rapide</span>' : ''
    ].filter(Boolean).join('');

    return `
<div class="ssb2-card" data-artisan-id="${a.id}" onclick="window.SecondarySearch.book(${a.id}, false)" role="button" tabindex="0" aria-label="Réserver ${a.name}">
  <div class="ssb2-card-topline">
    <img class="avatar ssb2-card-photo" src="${avatar}" alt="${a.name}" onerror="this.onerror=null;this.src='default-avatar.jpg';"/>
    <div class="ssb2-card-title-wrap">
      <h3 class="ssb2-card-name">${a.name || ''}</h3>
      <p class="ssb2-card-service">${catLbl}</p>
    </div>
    <span class="ssb2-badge-available">${isAvail ? 'Disponible' : 'Réservation'}</span>
  </div>
  <div class="ssb2-card-info">
    <div class="ssb2-card-rating">
      <span class="ssb2-stars">${_stars(rating)}</span>
      <span class="score">${rating.toFixed(1)}</span>
      <span class="reviews">(${a.reviewCount || 0})</span>
    </div>
    <div class="ssb2-card-badges">${badgeHtml}</div>
    <div class="ssb2-card-meta">📍 ${a.city || 'Maroc'} · 💰 ${a.priceFrom || 150} ${a.priceLabel || ('\u00c0 partir de ' + (a.priceFrom||150) + ' MAD')}</div>
  </div>
  <div class="ssb2-card-actions card-buttons">
    <button class="ssb2-btn-reserve" onclick="window.SecondarySearch.book(${a.id}, false); event.stopPropagation();" aria-label="Réserver ${a.name} maintenant">📅 Réserver</button>
    <button class="ssb2-btn-profile" onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId(${JSON.stringify(String(a.id))}, event);}else if(window.openArtisanModal){window.openArtisanModal(${a.id});}else{window.SecondarySearch.book(${a.id}, false);} event.stopPropagation();" aria-label="Voir le profil de ${a.name}">👁 Voir profil</button>
  </div>
</div>`;
  }

  
  /* ─── Moroccan pricing ──────────────────────────────────────── */
  const MAR_PRICES = {
    plomberie:    { from: 80  }, electricite:  { from: 100 }, menuiserie:   { from: 150 },
    peinture:     { from: 100 }, nettoyage:    { from: 60  }, climatisation:{ from: 150 },
    maconnerie:   { from: 200 }, carrelage:    { from: 120 }, jardinage:    { from: 80  },
    serrurerie:   { from: 60  }, demenagement: { from: 300 }, bricolage:    { from: 80  },
    etancheite:   { from: 200 }, vitrerie:     { from: 100 }, soudure:      { from: 150 },
    informatique: { from: 80  }
  };

  function _getPriceFrom(a) {
    const pf = parseInt(a.price_from || a.priceFrom || 0, 10);
    if (pf > 0) return pf;
    const cat = (a.category || a.service || '').toLowerCase();
    return (MAR_PRICES[cat] && MAR_PRICES[cat].from) || 150;
  }

  function _rtLabel(rt) {
    rt = parseInt(rt, 10);
    if (!rt || rt >= 999) return null;
    if (rt <= 10) return 'Répond en 10 min';
    if (rt <= 30) return 'Répond en ' + rt + ' min';
    return 'Répond en 1h';
  }

  function _missLabel(a) {
    const m = parseInt(a.missionsCompleted || a.missions_count || a.reviewCount || a.reviews || 0, 10);
    if (m >= 10) return m + (m >= 200 ? '+ missions' : ' missions');
    return null;
  }

  function _esc2(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  /* ─── Premium card v2 ────────────────────────────────────────── */
  function renderVedetteCard(a, idx) {
    idx = idx || 0;
    const cat     = (a.category || a.service || '').toLowerCase();
    const catIcon = CAT_ICONS[a.category] || CAT_ICONS[cat] || '🔧';
    const catLbl  = CAT_LABELS[a.category] || CAT_LABELS[cat] || (a.service || 'Service');
    const rating  = parseFloat(a.rating) || 0;
    const reviews = parseInt(a.reviewCount || a.reviews || a.review_count || 0, 10);
    const trust   = parseInt(a.trustScore || 0, 10);
    const rt      = parseInt(a.responseTime || 999, 10);
    const isReal  = !a.claimable && !a._isSeed;
    const isVer   = !!(a.verified || a.certified || trust >= 85);
    const avail   = (a.availability || '').toLowerCase();
    const isAvail = avail === 'available' || a.available;
    const isToday = avail === 'available_today';
    const priceFrom = _getPriceFrom(a);
    const rtLbl   = _rtLabel(rt);
    const misLbl  = _missLabel(a);

    /* Avatar — large service icon + small badge overlay (Task 1) */
    const avatarSrc = a.avatar || a.photo || a.photo_url || '';
    const _iconBadge = '<span class="pvc-avatar-badge" aria-hidden="true">' + catIcon + '</span>';
    const avatarHtml = avatarSrc
      ? '<img class="pvc-avatar-img" src="' + avatarSrc + '" alt="' + _esc2(a.name) + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';this.nextSibling&&(this.nextSibling.style.display=\'flex\');"/><span class="pvc-avatar-icon" style="display:none">' + catIcon + '</span>'
      : '<span class="pvc-avatar-icon">' + catIcon + '</span>';

    /* Avail */
    const availHtml = isAvail
      ? `<span class="pvc-avail-badge pvc-avail-badge--on">🟢 Disponible</span>`
      : isToday
        ? `<span class="pvc-avail-badge pvc-avail-badge--today">🟡 Aujourd'hui</span>`
        : `<span class="pvc-avail-badge pvc-avail-badge--off">Sur RDV</span>`;

    /* Stars */
    let starsHtml;
    if (rating > 0) {
      const rv = Math.round(rating * 2) / 2;
      const s  = [1,2,3,4,5].map(i => i <= rv ? '★' : rv >= i - 0.5 ? '½' : '☆').join('');
      starsHtml = `<span class="pvc-stars-v2">${s}</span><span class="pvc-rating-num">${rating.toFixed(1)}</span>${reviews > 0 ? `<span class="pvc-reviews-count">(${reviews} avis)</span>` : ''}`;
    } else {
      starsHtml = `<span class="pvc-new-label">✨ Nouveau</span>`;
    }

    /* Info chips */
    let chips = '';
    if (rtLbl)  chips += `<span class="pvc-info-chip chip-fast">⚡ ${rtLbl}</span>`;
    if (misLbl) chips += `<span class="pvc-info-chip chip-missions">✅ ${misLbl}</span>`;
    if (!rtLbl && !misLbl && isAvail) chips += `<span class="pvc-info-chip chip-urgent">🚀 Intervention rapide</span>`;

    /* Badges — verified/premium only; claim badges removed */
    let badges = '';
    if (isVer)       badges += '<span class="pvc-badge-v2 pvc-badge-v2--verified">✔ Vérifié Fixeo</span>';
    if (trust >= 90) badges += '<span class="pvc-badge-v2 pvc-badge-v2--premium">🏅 Premium</span>';

/* FOMO line — uses reviewCount as social-proof proxy */
    const fomoCount = reviews > 0 ? Math.min(reviews, 30) : 0;
    const fomoHtml  = fomoCount >= 3
      ? `<div class="pvc-fomo-line">\uD83D\uDD25 R\u00e9serv\u00e9 ${fomoCount >= 30 ? '30+' : fomoCount} fois cette semaine</div>`
      : '';

    return `
<article class="pvc-card${isReal ? ' pvc-card--real' : ''}" data-artisan-id="${a.id}" tabindex="0" role="button" aria-label="${_esc2(a.name)}, ${catLbl}" style="--anim-delay:${idx}" onclick="window.SecondarySearch&&window.SecondarySearch._handleReserve&&window.SecondarySearch._handleReserve('${a.id}');event.stopPropagation&&event.stopPropagation();">
  <div class="pvc-card-header">
    <div class="pvc-avatar${isVer ? ' pvc-avatar--verified' : ''}">${avatarHtml}</div>
    <div class="pvc-identity">
      <h3 class="pvc-name">${_esc2(a.name || '—')}</h3>
      <div class="pvc-meta-row">
        <span class="pvc-cat-pill">${catIcon} ${catLbl}</span>
        <span class="pvc-city-pill">📍 ${_esc2(a.city || 'Maroc')}</span>
        ${availHtml}
      </div>
    </div>
  </div>
  <div class="pvc-stats">
    <div class="pvc-rating-block">${starsHtml}</div>
  </div>
  ${fomoHtml}
  ${chips ? `<div class="pvc-info-bar">${chips}</div>` : ''}
  <div class="pvc-footer">
    <div class="pvc-price-block">
      <span class="pvc-price-amount">${priceFrom}<span class="price-currency">MAD</span></span>
      <span class="pvc-price-from">💡 Prix conseillé Fixeo</span>
    </div>
    <div class="pvc-cta-col">
      <button class="pvc-btn-reserve-v2" type="button" onclick="window.SecondarySearch&&window.SecondarySearch._handleReserve&&window.SecondarySearch._handleReserve('${a.id}');event.stopPropagation();">R\u00e9server maintenant</button>
      <span class="pvc-profile-link" onclick="event.stopPropagation();if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId('${a.id}',event);}else if(window.openArtisanModal){window.openArtisanModal('${a.id}');}else{window.SecondarySearch&&window.SecondarySearch._handleReserve&&window.SecondarySearch._handleReserve('${a.id}');}">Voir profil ›</span>
    </div>
  </div>
</article>`;
  }

  /* ════════════════════════════════════════════════════════
     RESULTS - RENDER INLINE
  ════════════════════════════════════════════════════════ */

  function renderResults(results) {
    const grid    = document.getElementById('ssb2-results-grid');
    const header  = document.getElementById('ssb2-results-header');
    const section = document.getElementById('ssb2-results-section');
    if (!grid) return;

    if (!results.length) {
      grid.innerHTML = `
<div class="ssb2-empty">
  <div class="ssb2-empty-icon">🔎</div>
  <div class="ssb2-empty-title">Aucun artisan trouvé</div>
  <div class="ssb2-empty-sub">Essayez d'autres critères ou élargissez votre zone.</div>
</div>`;
    } else {
      grid.innerHTML = results.map((a, i) => renderCard(a, i)).join('');
    }

    if (header) {
      header.textContent = results.length
        ? `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`
        : 'Aucun résultat';
    }

    if (section) {
      section.style.display = 'block';
      /* Smooth scroll to results */
      requestAnimationFrame(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     VEDETTE - RENDER (reset=true → first load, false → load more)
  ════════════════════════════════════════════════════════ */

  function updateVedetteMoreButton() {
    const moreBtn = document.getElementById('ssb2-vedette-more');
    if (!moreBtn) return;

    const remaining = s.vedetteAll.length - s.vedetteVisibleCount;
    if (remaining <= 0) {
      moreBtn.style.display = 'none';
      return;
    }

    const nextBatch = Math.min(remaining, getResponsiveVedetteStep());
    moreBtn.style.display = 'inline-flex';
    moreBtn.innerHTML = `👁 Voir plus <span class="other-see-more-count">+${nextBatch}</span> artisans <span class="see-more-arrow">→</span>`;
  }

  /* ── Priority sort: real artisans first, seeds as fallback ── */
  function _sortVedetteList(list) {
    const real  = list.filter(a => !a.claimable && !a._isSeed);
    const seeds = list.filter(a =>  a.claimable ||  a._isSeed);

    const score = a =>
      (a.trustScore || 0) * 1.2 +
      (a.rating || 0) * 8 +
      (a.availability === 'available' ? 18 : 0) +
      ((a.reviewCount || 0) > 10 ? 5 : 0) +
      (a.verified || a.certified ? 10 : 0);

    real.sort((a, b)  => score(b) - score(a));
    seeds.sort((a, b) => score(b) - score(a));

    /* Vrais artisans en tête, seeds uniquement en fallback */
    return [...real, ...seeds];
  }

  function renderVedette(reset) {
    const list = _artisans();
    if (!list.length) { setTimeout(() => renderVedette(reset), 400); return; }

    if (reset) {
      s.vedetteAll = _sortVedetteList(list);
      s.vedetteExpanded = false;
      s.vedetteVisibleCount = Math.min(getResponsiveVedetteInitialCount(), s.vedetteAll.length);
    } else {
      s.vedetteExpanded = true;
      s.vedetteVisibleCount = Math.min(s.vedetteVisibleCount + getResponsiveVedetteStep(), s.vedetteAll.length);
    }

    const grid = document.getElementById('ssb2-vedette-grid');
    if (!grid) return;

    grid.innerHTML = s.vedetteAll
      .slice(0, s.vedetteVisibleCount)
      .map(a => renderVedetteCard(a))
      .join('');

    _updatePvcCounter();
    updateVedetteMoreButton();
  }

  function syncResponsiveVedette() {
    const grid = document.getElementById('ssb2-vedette-grid');
    if (!grid || !s.vedetteAll.length) return;

    if (!s.vedetteExpanded) {
      s.vedetteVisibleCount = Math.min(getResponsiveVedetteInitialCount(), s.vedetteAll.length);
    } else {
      s.vedetteVisibleCount = Math.min(Math.max(s.vedetteVisibleCount, getResponsiveVedetteInitialCount()), s.vedetteAll.length);
    }

    grid.innerHTML = s.vedetteAll
      .slice(0, s.vedetteVisibleCount)
      .map(a => renderVedetteCard(a))
      .join('');

    _updatePvcCounter();
    updateVedetteMoreButton();
  }

  /* ── Counter strip helper ── */
  function _updatePvcCounter() {
    const el = document.getElementById('pvc-grid-counter');
    if (!el || !s.vedetteAll) return;
    const total = s.vedetteAll.length;
    if (!total) { el.textContent = ''; return; }
    const avail = s.vedetteAll.filter(function(a) {
      return a.availability === 'available' || a.available;
    }).length;
    el.textContent = avail > 0
      ? avail + ' artisan' + (avail > 1 ? 's' : '') + ' disponible' + (avail > 1 ? 's' : '') + ' →'
      : total + ' artisan' + (total > 1 ? 's' : '') + ' →';
  }

  /* ════════════════════════════════════════════════════════
     SEARCH - EXECUTE
  ════════════════════════════════════════════════════════ */

  function doSearch() {
    const inputEl  = document.getElementById('ssb2-input-nlp');
    const catEl    = document.getElementById('ssb2-select-cat');
    const cityEl   = document.getElementById('ssb2-select-city');

    s.query = (inputEl?.value || '').trim();
    s.city  = cityEl?.value  || '';

    /* NLP auto-detect category when none manually selected */
    let cat = catEl?.value || '';
    if (!cat && s.query) {
      const mapper = _nlpMapper();
      if (mapper) {
        const detected = mapper.detect ? mapper.detect(s.query) : null;
        if (detected) {
          cat = detected;
          if (catEl) catEl.value = cat;   /* reflect in UI */
        }
      }
    }
    s.cat = cat;

    /* ── Run filter ── */
    const results = filterArtisans(s.query, s.cat, s.city, s.filters);
    s.results = results;

    /* ── Render inline ── */
    renderResults(results);

    /* ── Silently sync background artisan section + SearchEngine ── */
    _syncBackground(results);
  }

  function _syncBackground(results) {
    /* Sync section filters */
    const catF  = document.getElementById('filter-category');
    const cityF = document.getElementById('filter-city');
    if (catF)  catF.value  = s.cat;
    if (cityF) cityF.value = s.city;

    /* Render main artisan grid */
    if (typeof window.renderArtisans === 'function')  window.renderArtisans(results);
    else if (typeof renderArtisans === 'function')     renderArtisans(results);

    /* Update results count badge */
    const cnt = document.getElementById('results-count');
    if (cnt) cnt.textContent = `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`;
  }

  /* ════════════════════════════════════════════════════════
     BOOK - delegate to FixeoReservation
  ════════════════════════════════════════════════════════ */

  function book(id, isExpress) {
    const pool    = _artisans();
    const artisan = pool.find(a => a.id === id || a.id === parseInt(id, 10)) || id;

    if (window.FixeoReservation) {
      isExpress
        ? window.FixeoReservation.openExpress(artisan)
        : window.FixeoReservation.open(artisan, false);
    } else if (typeof openBookingModal === 'function') {
      openBookingModal(typeof id === 'number' ? id : parseInt(id, 10));
    } else {
      console.warn('[SecondarySearch] FixeoReservation not ready. Artisan:', id);
    }
  }

  /* ════════════════════════════════════════════════════════
     BUILD HTML - Bar + Dropdowns (deduped, same as HERO)
  ════════════════════════════════════════════════════════ */

  function buildBarHTML() {
    /* ── Categories: dedup + use SSB_DATA if available ── */
    let catOptions = '';
    const ssbd = (typeof SSB_DATA !== 'undefined') ? SSB_DATA : null;

    if (ssbd) {
      const seen = new Set();
      Object.entries(ssbd.categories).forEach(([k, d]) => {
        const key = (d.label || '').toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          catOptions += `<option value="${k}">${d.icon} ${d.label}</option>`;
        }
      });
    } else {
      /* Fallback hardcoded list */
      const fallbackCats = [
        ['plomberie','🔧 Plomberie'], ['electricite','⚡ Électricité'], ['peinture','🎨 Peinture'],
        ['nettoyage','🧹 Nettoyage'], ['jardinage','🌿 Jardinage'], ['demenagement','📦 Déménagement'],
        ['bricolage','🔨 Bricolage'], ['climatisation','❄️ Climatisation'],
        ['menuiserie','🪚 Menuiserie'], ['maconnerie','🧱 Maçonnerie'],
        ['serrurerie','🔑 Serrurerie'], ['carrelage','🏠 Carrelage'],
      ];
      catOptions = fallbackCats.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    }

    /* ── Cities: use SSB_DATA.cities (already deduped + title-cased) ── */
    let cityOptions = '';
    const cities = ssbd
      ? ssbd.cities
      : ['Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir','Meknès','Oujda',
         'Kénitra','Tétouan','Safi','El Jadida','Béni Mellal','Nador','Settat'];

    cityOptions = cities.map(c => `<option value="${c}">📍 ${c}</option>`).join('');

    return `
<div class="ssb2-bar-wrap" role="search" aria-label="Barre de recherche secondaire - Artisans">

  <!-- ── Main search card ── -->
  <div class="ssb2-bar-card" id="ssb2-card">

    <!-- Segment 1: NLP Free-text (Service / Besoin) -->
    <div class="ssb2-segment ssb2-seg-nlp" id="ssb2-seg-nlp">
      <span class="ssb2-seg-icon" aria-hidden="true">🔍</span>
      <div class="ssb2-seg-body">
        <span class="ssb2-seg-label">🛠 Service ou besoin</span>
        <input
          type="text"
          id="ssb2-input-nlp"
          class="ssb2-seg-input"
          placeholder="Ex: Plombier, Fuite d'eau, Peinture..."
          autocomplete="off"
          spellcheck="false"
          maxlength="80"
          aria-label="Décrire le service ou besoin"
        />
      </div>
      <button class="ssb2-clear-btn" id="ssb2-clear" aria-label="Effacer la saisie" style="display:none">✕</button>
    </div>

    <div class="ssb2-seg-divider" aria-hidden="true"></div>

    <!-- Segment 2: Specialty / Category -->
    <div class="ssb2-segment" id="ssb2-seg-cat">
      <span class="ssb2-seg-icon" aria-hidden="true">📌</span>
      <div class="ssb2-seg-body">
        <span class="ssb2-seg-label">📌 Spécialité</span>
        <select id="ssb2-select-cat" class="ssb2-seg-select" aria-label="Spécialité / Catégorie de service">
          <option value="">Toutes spécialités</option>
          ${catOptions}
        </select>
      </div>
    </div>

    <div class="ssb2-seg-divider" aria-hidden="true"></div>

    <!-- Segment 3: City -->
    <div class="ssb2-segment" id="ssb2-seg-city">
      <span class="ssb2-seg-icon" aria-hidden="true">🌆</span>
      <div class="ssb2-seg-body">
        <span class="ssb2-seg-label">🌆 Ville</span>
        <select id="ssb2-select-city" class="ssb2-seg-select" aria-label="Ville">
          <option value="">Toutes les villes</option>
          ${cityOptions}
        </select>
      </div>
    </div>

    <!-- CTA Button -->
    <button class="ssb2-btn-search" id="ssb2-btn-search" aria-label="Lancer la recherche d'artisans">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      Trouver
    </button>

  </div><!-- /.ssb2-bar-card -->

  <!-- ── Quick filters row ── -->
  <div class="ssb2-filters-row" role="group" aria-label="Filtres rapides">
    <span class="ssb2-filters-label">Filtres rapides :</span>
    <button class="ssb2-qfilter" data-filter="availableNow" aria-pressed="false">
      <span class="ssb2-qdot" aria-hidden="true"></span>🟢 Disponible maintenant
    </button>
    <button class="ssb2-qfilter" data-filter="topScore" aria-pressed="false">
      <span class="ssb2-qdot" aria-hidden="true"></span>⭐ Score &gt; 85%
    </button>
    <button class="ssb2-qfilter" data-filter="fastResponse" aria-pressed="false">
      <span class="ssb2-qdot" aria-hidden="true"></span>⚡ Réponse &lt; 30 min
    </button>
  </div>

</div><!-- /.ssb2-bar-wrap -->`;
  }

  /* ════════════════════════════════════════════════════════
     WIRE EVENTS
  ════════════════════════════════════════════════════════ */

  let vedetteResizeTimer = null;

  function wireEvents() {
    const inputEl   = document.getElementById('ssb2-input-nlp');
    const catEl     = document.getElementById('ssb2-select-cat');
    const cityEl    = document.getElementById('ssb2-select-city');
    const searchBtn = document.getElementById('ssb2-btn-search');
    const clearBtn  = document.getElementById('ssb2-clear');
    const qfilters  = document.querySelectorAll('.ssb2-qfilter');
    const moreBtn   = document.getElementById('ssb2-vedette-more');
    const closeBtn  = document.getElementById('ssb2-results-close-btn');
    let lastVedetteColumns = getResponsiveVedetteColumns();

    /* NLP input: show/hide clear button */
    inputEl?.addEventListener('input', () => {
      if (clearBtn) clearBtn.style.display = inputEl.value.length ? 'flex' : 'none';
    });

    /* Enter key triggers search */
    inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });

    /* Clear button */
    clearBtn?.addEventListener('click', () => {
      if (inputEl) inputEl.value = '';
      clearBtn.style.display = 'none';
      inputEl?.focus();
    });

    /* Search button */
    searchBtn?.addEventListener('click', doSearch);

    /* Select changes: NLP auto-select reflect */
    catEl?.addEventListener('change',  () => { s.cat  = catEl.value; });
    cityEl?.addEventListener('change', () => { s.city = cityEl.value; });

    /* Quick filter chips (toggle, no auto-search → press button to apply) */
    qfilters.forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.filter;
        if (key in s.filters) {
          s.filters[key] = !s.filters[key];
          chip.classList.toggle('active', s.filters[key]);
          chip.setAttribute('aria-pressed', String(s.filters[key]));
          /* If results are already visible, live-update */
          const section = document.getElementById('ssb2-results-section');
          if (section && section.style.display !== 'none') doSearch();
        }
      });
    });

    /* Vedette "Voir plus" */
    moreBtn?.addEventListener('click', () => renderVedette(false));

    /* Close results panel */
    closeBtn?.addEventListener('click', () => {
      const section = document.getElementById('ssb2-results-section');
      if (section) section.style.display = 'none';
    });

    window.addEventListener('resize', () => {
      clearTimeout(vedetteResizeTimer);
      vedetteResizeTimer = setTimeout(() => {
        const nextColumns = getResponsiveVedetteColumns();
        if (nextColumns === lastVedetteColumns) return;
        lastVedetteColumns = nextColumns;
        syncResponsiveVedette();
      }, 120);
    });
  }

  /* ════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════ */

  function init() {
    const inject = document.getElementById('ssb2-bar-inject');

    if (inject) {
      /* Bar injection mode (retained for compatibility) */
      inject.innerHTML = buildBarHTML();
    }

    wireEvents();

    /* Always init vedette (works even without the secondary search bar) */
    renderVedette(true);

    console.log('✅ Fixeo Vedette v8 initialized');
  }

  /* ── Bootstrap: wait until DOM + main scripts are ready ── */
  function bootstrap() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(init, 350));
    } else {
      setTimeout(init, 350);
    }
  }
  bootstrap();

  /* ── Expose public API ── */
  /* ── Conversion handlers ─────────────────────────────────── */
  function _handleReserve(id) { book(id, false); }
  function _handleProfile(id) {
    const e = null;
    if (window.FixeoPublicProfileLinks) {
      window.FixeoPublicProfileLinks.openBySourceId(String(id), e);
    } else if (typeof openArtisanModal === 'function') {
      openArtisanModal(id);
    } else {
      book(id, false);
    }
  }

  window.SecondarySearch = { doSearch, book, renderVedette, syncResponsiveVedette, _handleReserve, _handleProfile };

}(window));
