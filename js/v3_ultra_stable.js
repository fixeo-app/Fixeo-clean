// ============================================================
//  FIXEO V3 ULTRA STABLE — JavaScript Patch
//  Fix 2: Revenue chart demo data
//  Fix 3: Notification dedup + single display
//  Fix 6: Service artisan cards
//  Fix 7: Featured artisans under map
// ============================================================

(function() {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // FIX 3 — NOTIFICATION DEDUP: prevent multiple identical toasts
  // ══════════════════════════════════════════════════════════
  const _shownToastKeys = new Set();
  const _originalRunDemo = window.NotificationSystem
    ? window.NotificationSystem.prototype.runDemoNotifications
    : null;

  // Patch after DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    if (window.notifSystem) {
      const ns = window.notifSystem;

      // Patch push() to dedup
      if (typeof ns.push === 'function') {
        const _origPush = ns.push.bind(ns);
        ns.push = function(notif) {
          const key = (notif.type || '') + '|' + (notif.title || '') + '|' + (notif.body || notif.message || '');
          if (_shownToastKeys.has(key)) return; // skip duplicate
          _shownToastKeys.add(key);
          setTimeout(() => _shownToastKeys.delete(key), 8000); // allow re-show after 8s
          return _origPush(notif);
        };
      }

      // Patch toast()/showToast() to ensure max 5 toasts visible
      const toastMethod = typeof ns.toast === 'function'
        ? 'toast'
        : (typeof ns.showToast === 'function' ? 'showToast' : '');
      if (toastMethod) {
        const _origToast = ns[toastMethod].bind(ns);
        ns[toastMethod] = function(opts) {
          if (ns.container) {
            const existing = ns.container.querySelectorAll('.toast');
            if (existing.length >= 5) {
              existing[0].remove(); // remove oldest
            }
          }
          return _origToast(opts);
        };
      }
    }
  });

  // ══════════════════════════════════════════════════════════
  // FIX 2 — REVENUE CHART: ensure visible demo data on artisan dashboard
  // ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', function() {
    // Force chart render after a short delay to ensure canvas is sized
    function ensureRevenueChart() {
      if (!window.dashboard) return;
      const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      const revenueData = [5200, 6800, 7400, 5900, 8100, 7200, 9300, 8400, 7800, 10200, 9500, 8400];

      // canvas chart-revenue
      const canvas1 = document.getElementById('chart-revenue');
      if (canvas1 && canvas1.offsetWidth > 0) {
        window.dashboard.drawLineChart('chart-revenue', months, revenueData, '#20c997', 'Revenus MAD');
      }
      // canvas chart-revenue-full
      const canvas2 = document.getElementById('chart-revenue-full');
      if (canvas2 && canvas2.offsetWidth > 0) {
        window.dashboard.drawLineChart('chart-revenue-full', months, revenueData, '#20c997', 'Revenus MAD');
      }
    }

    // Try multiple times to handle lazy rendering
    setTimeout(ensureRevenueChart, 200);
    setTimeout(ensureRevenueChart, 600);
    setTimeout(ensureRevenueChart, 1200);
    window.addEventListener('resize', ensureRevenueChart);
  });

  // ══════════════════════════════════════════════════════════
  // FIX 6 — SERVICE ARTISAN CARDS
  // ══════════════════════════════════════════════════════════

  function normalizeMarketplacePreviewArtisan(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || '').trim();
    var name = String(raw.name || '').trim();
    var category = String(raw.category || raw.service || '').trim().toLowerCase();
    if (!id || !name || !category || raw.status === 'inactive') return null;
    var rating = Number(raw.rating || 0);
    var reviews = Number(raw.reviewCount || raw.total_reviews || 0);
    var unit = String(raw.priceUnit || raw.price_unit || 'h').trim() || 'h';
    var amount = Number(raw.priceFrom || raw.price_from || 0);
    return {
      id: id,
      initials: String(raw.initials || name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'FX'),
      name: name,
      category: category,
      city: String(raw.city || 'Maroc').trim() || 'Maroc',
      rating: (Number.isFinite(rating) ? rating : 0).toFixed(1),
      reviews: Number.isFinite(reviews) ? reviews : 0,
      price: Number.isFinite(amount) && amount > 0 ? amount + ' MAD' : 'Prix sur demande',
      unit: unit,
      availability: String(raw.availability || (raw.status === 'active' ? 'available' : 'offline')).trim() || 'available',
      badge: Array.isArray(raw.badges) && raw.badges.includes('verified') ? '✅ Vérifié' : '⭐ Disponible',
      trustScore: String(raw.trustScore || raw.trust_score || raw.rating || '0'),
      responseTime: Number(raw.responseTime || 0) > 0 ? 'Répond en ' + Number(raw.responseTime) + ' min' : 'Réponse rapide'
    };
  }

  function getMarketplacePreviewArtisans() {
    var source = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];
    return source.map(normalizeMarketplacePreviewArtisan).filter(Boolean);
  }

  function buildServiceArtisansData() {
    return getMarketplacePreviewArtisans().reduce(function (acc, artisan) {
      if (!acc[artisan.category]) acc[artisan.category] = [];
      acc[artisan.category].push({
        id: artisan.id,
        initials: artisan.initials,
        name: artisan.name,
        city: artisan.city,
        rating: artisan.rating,
        reviews: artisan.reviews,
        price: artisan.price + '/' + artisan.unit,
        badge: artisan.badge
      });
      return acc;
    }, {});
  }

  const SERVICE_LABELS = {
    plomberie:'Plomberie 🔧', electricite:'Électricité ⚡', peinture:'Peinture 🎨',
    climatisation:'Climatisation ❄️', menuiserie:'Menuiserie 🪚', serrurerie:'Serrurerie 🔑',
    nettoyage:'Nettoyage 🧹', demenagement:'Déménagement 📦', jardinage:'Jardinage 🌿',
    bricolage:'Bricolage 🔨', maconnerie:'Maçonnerie 🧱',
  };

  const COVER_GRADIENTS = [
    'linear-gradient(135deg,#E1306C,#833AB4)',
    'linear-gradient(135deg,#405DE6,#5B51D8)',
    'linear-gradient(135deg,#FCAF45,#F77737)',
    'linear-gradient(135deg,#20c997,#405DE6)',
    'linear-gradient(135deg,#833AB4,#C13584)',
    'linear-gradient(135deg,#fd1d1d,#E1306C)',
  ];

  // ── Résolution dynamique des IDs artisan ───────────────────────
  function resolveMarketplaceArtisanId(name, category, city) {
    var match = getMarketplacePreviewArtisans().find(function (artisan) {
      return artisan.name === name
        && (!category || artisan.category === String(category || '').trim().toLowerCase())
        && (!city || artisan.city === city);
    });
    return match ? match.id : null;
  }

  function buildServiceMiniCard(a, idx, categoryLabel) {
    const grad = COVER_GRADIENTS[idx % COVER_GRADIENTS.length];
    const artisanId = resolveMarketplaceArtisanId(a.name, categoryLabel, a.city);
    const serializedArtisanId = artisanId ? JSON.stringify(String(artisanId)) : '';
    const clickHandler = artisanId
      ? `onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({id:${serializedArtisanId},name:'${a.name}',category:'${categoryLabel}',city:'${a.city}'});}else if(typeof openArtisanModal==='function'){openArtisanModal(${serializedArtisanId});}else{window.location.href='artisan-profile.html?id=${encodeURIComponent(String(artisanId))}';}" tabindex="0" role="button" aria-label="Voir le profil de ${a.name}"`
      : `onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({name:'${a.name}',category:'${categoryLabel}',city:'${a.city}'});}else{window.location.href='artisan-profile.html';}" tabindex="0" role="button" aria-label="Voir le profil de ${a.name}"`;
    return `
      <article class="service-mini-card artisan-card service-preview-card" ${clickHandler}>
        <div class="artisan-header smc-top">
          <div class="smc-avatar" style="background:${grad}">${a.initials}</div>
          <div class="artisan-info smc-identity">
            <div class="artisan-name smc-name">${a.name}</div>
            <div class="artisan-location smc-city">📍 ${a.city} · ${categoryLabel}</div>
          </div>
        </div>
        <div class="artisan-meta-row smc-footer-row">
          <div class="artisan-rating smc-rating">⭐ ${a.rating} <span style="color:rgba(255,255,255,.45);font-size:.7rem">(${a.reviews} avis)</span></div>
          <div class="artisan-price smc-price">Dès ${a.price}</div>
        </div>
        <div class="artisan-badge smc-badge">${a.badge}</div>
      </article>`;
  }

  function renderServiceArtisans(category) {
    const container = document.getElementById('service-artisans-section');
    const cityFilter = document.getElementById('services-city-filter');
    const selectedCity = (cityFilter?.value || '').trim();
    if (!container) return;
    var serviceArtisans = buildServiceArtisansData();
    if (!category || category === 'all' || !serviceArtisans[category]) {
      container.innerHTML = '';
      return;
    }
    const label = SERVICE_LABELS[category] || category;
    const sourceArtisans = serviceArtisans[category] || [];
    const artisans = selectedCity
      ? sourceArtisans.filter(a => (a.city || '').toLowerCase() === selectedCity.toLowerCase())
      : sourceArtisans;

    container.innerHTML = `
      <div class="service-artisans-container active">
        <div class="service-artisans-heading">
          <div class="service-artisans-title">
            <span>👷</span>
            Artisans spécialisés en <strong style="color:#ff4ecd;margin-left:4px">${label}</strong>
          </div>
          ${selectedCity ? `<p class="service-artisans-subtitle">Résultats disponibles à ${selectedCity}</p>` : ''}
        </div>
        ${artisans.length ? `
          <div class="service-mini-grid">
            ${artisans.map((a, i) => buildServiceMiniCard(a, i, label)).join('')}
          </div>
        ` : `
          <div class="services-empty-state">
            Aucun artisan mis en avant pour <strong>${label}</strong>${selectedCity ? ` à ${selectedCity}` : ''} pour le moment.
          </div>
        `}
        <div class="services-cta">
          <button class="btn-primary services-cta-btn" type="button" onclick="window.showAllServiceArtisans && window.showAllServiceArtisans('${category}')">
            Voir tous les artisans disponibles
          </button>
        </div>
      </div>`;
  }

  window.renderServiceArtisans = renderServiceArtisans;
  window.showAllServiceArtisans = function(category) {
    const city = document.getElementById('services-city-filter')?.value || '';
    const catFilter = document.getElementById('filter-category');
    const cityFilter = document.getElementById('filter-city');
    if (catFilter) catFilter.value = category === 'all' ? '' : category;
    if (cityFilter) cityFilter.value = city;
    const results = window.searchEngine?.filter({ category: category === 'all' ? '' : category, city }) || [];
    if (typeof renderArtisans === 'function') {
      renderArtisans(results);
    }
    const count = document.getElementById('results-count');
    if (count) {
      count.textContent = `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`;
    }
    document.getElementById('artisans-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Hook into chip clicks
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.chip[data-category]').forEach(chip => {
      chip.addEventListener('click', function() {
        renderServiceArtisans(this.dataset.category);
      });
    });
    // Show plomberie by default after a short delay
    setTimeout(() => renderServiceArtisans('plomberie'), 800);
  });

  // ══════════════════════════════════════════════════════════
  // FIX 7 — FEATURED ARTISANS UNDER MAP
  //   • 2 rows × 5 = 10 visible initially
  //   • Remaining hidden, revealed 5 at a time via "See More"
  //   • Uniform card design for all profiles
  // ══════════════════════════════════════════════════════════

  function getFeaturedArtisans() {
    return getMarketplacePreviewArtisans()
      .slice()
      .sort(function (left, right) {
        return (Number(right.trustScore || 0) + Number(right.reviews || 0) * 0.05 + Number(right.rating || 0) * 10)
          - (Number(left.trustScore || 0) + Number(left.reviews || 0) * 0.05 + Number(left.rating || 0) * 10);
      })
      .slice(0, 20)
      .map(function (artisan, idx) {
        return Object.assign({}, artisan, { coverIdx: idx % COVER_GRADIENTS.length });
      });
  }

  // ── Pagination state ─────────────────────────────────────
  const FEATURED_INITIAL   = 10; // 2 rows × 5 = 10 visible on load
  const FEATURED_STEP      = 5;  // reveal 5 at a time
  var   _featuredShownCount = FEATURED_INITIAL;

  // ── Build a single featured card HTML string ─────────────
  function buildFeaturedCard(a) {
    const grad         = COVER_GRADIENTS[a.coverIdx % COVER_GRADIENTS.length];
    const availClass   = a.availability || 'available';
    const trustScore   = a.trustScore   || a.rating || '4.8';
    const responseTime = a.responseTime || 'Répond en 15 min';
    const artisanId = resolveMarketplaceArtisanId(a.name, a.category, a.city);
    const safeArtisanId = artisanId ? JSON.stringify(String(artisanId)) : '';
    const cardClick = artisanId
      ? 'onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({id:' + safeArtisanId + ',name:\'' + a.name + '\',category:\'' + a.category + '\',city:\'' + a.city + '\'});}else if(typeof openArtisanModal===\'function\'){openArtisanModal(' + safeArtisanId + ');}else{window.location.href=\'artisan-profile.html?id=' + encodeURIComponent(String(artisanId)) + '\';}"'
      : 'onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({name:\'' + a.name + '\',category:\'' + a.category + '\',city:\'' + a.city + '\'});}else{window.location.href=\'artisan-profile.html\';}"';
    return (
      '<div class="featured-card" ' + cardClick + ' style="cursor:pointer" role="button" tabindex="0" aria-label="Voir le profil de ' + a.name + '">' +
        '<div class="featured-card-cover" style="background:' + grad + ';">' +
          '<div style="position:absolute;inset:0;background:rgba(0,0,0,.18);"></div>' +
        '</div>' +
        '<div class="featured-card-body">' +
          '<div class="featured-avatar-wrap">' +
            '<div class="featured-avatar" style="background:' + grad + '">' + a.initials + '</div>' +
            '<div class="featured-avail-dot ' + availClass + '"></div>' +
          '</div>' +
          '<div class="featured-name">' + a.name + '</div>' +
          '<div class="featured-category">🔧 ' + a.category + ' &nbsp;·&nbsp; 📍 ' + a.city + '</div>' +
          '<div class="featured-trust-row">' +
            '<div class="featured-trust-score">⭐ ' + trustScore + ' Score de confiance</div>' +
            '<div class="featured-response-time">⏱ ' + responseTime + '</div>' +
          '</div>' +
          '<div class="featured-rating">' +
            '<span class="stars">⭐⭐⭐⭐⭐</span>' +
            ' ' + a.rating + ' <span style="color:rgba(255,255,255,.4)">(' + a.reviews + ' avis)</span>' +
          '</div>' +
          '<div class="featured-footer">' +
            '<div class="featured-price">' + a.price + '<span>/' + a.unit + '</span></div>' +
            '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
              '<button class="btn-featured-reserve" onclick="event.stopPropagation();(function(){var aid=' + (artisanId||'null') + ';if(aid&&typeof openBookingModal===\'function\'){openBookingModal(aid);}else{if(typeof openModal===\'function\'){var n=document.getElementById(\'booking-artisan-name\');if(n)n.textContent=\'' + a.name + '\';openModal(\'booking-modal\');}}})()" >Réserver</button>' +
              '<button class="btn-featured-express" onclick="event.stopPropagation();typeof openModal===\'function\'?openModal(\'express-modal\'):(window.notifSystem&&window.notifSystem.info(\'Urgent ⚡\',\'Demande express envoyée à ' + a.name + '.\'))">⚡ Urgent</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Update the "See More" button label & visibility ──────
  function updateSeeMoreBtn() {
    var btn  = document.getElementById('featured-see-more-btn');
    var wrap = document.getElementById('featured-see-more-wrap');
    if (!btn || !wrap) return;
    var remaining = getFeaturedArtisans().length - _featuredShownCount;
    if (remaining <= 0) {
      // All profiles shown — hide button with smooth fade
      wrap.style.opacity  = '0';
      wrap.style.transform = 'translateY(-8px)';
      setTimeout(function() { wrap.style.display = 'none'; }, 280);
    } else {
      wrap.style.display   = 'flex';
      wrap.style.opacity   = '1';
      wrap.style.transform = 'translateY(0)';
      btn.innerHTML = '👁 Voir plus <span class="featured-see-more-count">+' + Math.min(remaining, FEATURED_STEP) + '</span> artisans <span class="see-more-arrow">→</span>';
    }
  }

  // ── Reveal next FEATURED_STEP hidden cards ───────────────
  function featuredSeeMore() {
    var grid  = document.getElementById('featured-artisans-grid');
    var cards = grid ? grid.querySelectorAll('.featured-card') : [];
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].classList.contains('featured-card--hidden') && shown < FEATURED_STEP) {
        var card = cards[i];
        card.classList.remove('featured-card--hidden');
        card.classList.add('featured-card--reveal');
        // Remove animation class after it plays
        (function(c) {
          setTimeout(function() { c.classList.remove('featured-card--reveal'); }, 500);
        })(card);
        shown++;
      }
    }
    _featuredShownCount = Math.min(_featuredShownCount + FEATURED_STEP, getFeaturedArtisans().length);
    updateSeeMoreBtn();
    // Wire newly revealed cards' buttons
    if (window._wireFeaturedButtons && grid) window._wireFeaturedButtons(grid);
  }

  // ── Main render: inject all cards, hide cards after index 10
  function renderFeaturedArtisans() {
    var grid = document.getElementById('featured-artisans-grid');
    if (!grid) return;

    var featuredArtisans = getFeaturedArtisans();

    // Reset pagination state on each render
    _featuredShownCount = FEATURED_INITIAL;

    // Build ALL cards, mark those beyond initial limit as hidden
    grid.innerHTML = featuredArtisans.map(function(a, idx) {
      var html = buildFeaturedCard(a);
      if (idx >= FEATURED_INITIAL) {
        // Inject hidden class into the outer div
        html = html.replace('<div class="featured-card"', '<div class="featured-card featured-card--hidden"');
      }
      return html;
    }).join('');

    // Inject "See More" wrapper below section if not already present
    var section = document.getElementById('featured-artisans-section');
    if (section) {
      var existingWrap = document.getElementById('featured-see-more-wrap');
      if (existingWrap) existingWrap.parentNode.removeChild(existingWrap);
      var wrap = document.createElement('div');
      wrap.id = 'featured-see-more-wrap';
      var remaining = featuredArtisans.length - FEATURED_INITIAL;
      wrap.innerHTML =
        '<button id="featured-see-more-btn" class="btn-featured-see-more" onclick="typeof featuredSeeMore===\'function\'?featuredSeeMore():(function(){})()">' +
          '👁 Voir plus <span class="featured-see-more-count">+' + Math.min(remaining, FEATURED_STEP) + '</span> artisans ' +
          '<span class="see-more-arrow">→</span>' +
        '</button>';
      section.appendChild(wrap);

      // Show/hide the button based on whether there are hidden cards
      if (remaining <= 0) {
        wrap.style.display = 'none';
      }
    }
  }

  // Expose featuredSeeMore globally so the inline onclick can reach it
  window.featuredSeeMore = featuredSeeMore;

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(renderFeaturedArtisans, 300);
  });

})();
