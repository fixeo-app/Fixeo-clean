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
      const _origPush = ns.push.bind(ns);
      ns.push = function(notif) {
        const key = (notif.type || '') + '|' + (notif.title || '') + '|' + (notif.body || notif.message || '');
        if (_shownToastKeys.has(key)) return; // skip duplicate
        _shownToastKeys.add(key);
        setTimeout(() => _shownToastKeys.delete(key), 8000); // allow re-show after 8s
        return _origPush(notif);
      };

      // Patch toast() to ensure max 5 toasts visible
      const _origToast = ns.toast.bind(ns);
      ns.toast = function(opts) {
        if (ns.container) {
          const existing = ns.container.querySelectorAll('.toast');
          if (existing.length >= 5) {
            existing[0].remove(); // remove oldest
          }
        }
        return _origToast(opts);
      };
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

  const SERVICE_ARTISANS_DATA = {
    plomberie: [
      { initials:'KB', name:'Karim Benali',     city:'Casablanca', rating:'4.9', reviews:127, price:'150 MAD/h', badge:'⚡ Réactif' },
      { initials:'MA', name:'Mehdi Amrani',      city:'Rabat',      rating:'4.7', reviews:89,  price:'140 MAD/h', badge:'✅ Vérifié' },
      { initials:'YB', name:'Younes Bakkali',    city:'Marrakech',  rating:'4.8', reviews:63,  price:'120 MAD/h', badge:'🏆 Pro' },
    ],
    electricite: [
      { initials:'OT', name:'Omar Tahiri',       city:'Rabat',      rating:'4.7', reviews:85,  price:'180 MAD/h', badge:'⚡ Expert' },
      { initials:'SM', name:'Samir Mernissi',    city:'Casablanca', rating:'4.6', reviews:74,  price:'160 MAD/h', badge:'✅ Vérifié' },
      { initials:'AB', name:'Adil Benbrahim',    city:'Fès',        rating:'4.8', reviews:52,  price:'170 MAD/h', badge:'🏆 Pro' },
    ],
    peinture: [
      { initials:'SD', name:'Sara Doukkali',     city:'Casablanca', rating:'4.8', reviews:98,  price:'120 MAD/h', badge:'🎨 Artiste' },
      { initials:'RM', name:'Rachid Moussaoui',  city:'Tanger',     rating:'4.6', reviews:61,  price:'110 MAD/h', badge:'✅ Vérifié' },
      { initials:'LB', name:'Leila Badri',       city:'Rabat',      rating:'4.9', reviews:77,  price:'130 MAD/h', badge:'⭐ Top Noté' },
    ],
    climatisation: [
      { initials:'NR', name:'Nadia Rhouat',      city:'Casablanca', rating:'4.8', reviews:56,  price:'200 MAD/h', badge:'❄️ Certifiée' },
      { initials:'KZ', name:'Khalid Ziani',      city:'Agadir',     rating:'4.7', reviews:44,  price:'190 MAD/h', badge:'✅ Vérifié' },
    ],
    menuiserie: [
      { initials:'AE', name:'Amine El Fassi',    city:'Fès',        rating:'4.9', reviews:81,  price:'160 MAD/h', badge:'🪚 Maître' },
      { initials:'HB', name:'Hamza Benchekroun', city:'Casablanca', rating:'4.7', reviews:58,  price:'145 MAD/h', badge:'✅ Vérifié' },
    ],
    serrurerie: [
      { initials:'MT', name:'Mourad Taleb',      city:'Casablanca', rating:'4.8', reviews:72,  price:'130 MAD/h', badge:'🔑 Expert' },
      { initials:'FH', name:'Farid Hajji',       city:'Rabat',      rating:'4.7', reviews:49,  price:'120 MAD/h', badge:'✅ Vérifié' },
    ],
    nettoyage: [
      { initials:'FZ', name:'Fatima Zahra',      city:'Marrakech',  rating:'4.9', reviews:210, price:'80 MAD/h',  badge:'🌟 Légendaire' },
      { initials:'HO', name:'Houda Ouali',       city:'Casablanca', rating:'4.8', reviews:94,  price:'90 MAD/h',  badge:'✅ Vérifié' },
      { initials:'ZA', name:'Zineb Alaoui',      city:'Rabat',      rating:'4.7', reviews:66,  price:'85 MAD/h',  badge:'⭐ Top Noté' },
    ],
    demenagement: [
      { initials:'AL', name:'Aicha Lamine',      city:'Agadir',     rating:'4.6', reviews:63,  price:'200 MAD/j', badge:'🚛 Pro' },
      { initials:'BB', name:'Badr Bencherki',    city:'Casablanca', rating:'4.7', reviews:58,  price:'220 MAD/j', badge:'✅ Vérifié' },
    ],
    jardinage: [
      { initials:'HM', name:'Hassan Mrani',      city:'Fès',        rating:'4.8', reviews:72,  price:'100 MAD/h', badge:'🌿 Expert' },
      { initials:'KA', name:'Khalid Arabi',      city:'Marrakech',  rating:'4.7', reviews:54,  price:'90 MAD/h',  badge:'✅ Vérifié' },
    ],
    bricolage: [
      { initials:'YK', name:'Youssef Kadi',      city:'Tanger',     rating:'4.7', reviews:91,  price:'130 MAD/h', badge:'🔨 Polyvalent' },
      { initials:'NS', name:'Nour Slimani',      city:'Casablanca', rating:'4.6', reviews:47,  price:'120 MAD/h', badge:'✅ Vérifié' },
    ],
    maconnerie: [
      { initials:'IB', name:'Ibrahim Bennis',    city:'Casablanca', rating:'4.8', reviews:88,  price:'170 MAD/h', badge:'🧱 Expert' },
      { initials:'OR', name:'Omar Rifai',        city:'Rabat',      rating:'4.6', reviews:62,  price:'155 MAD/h', badge:'✅ Vérifié' },
    ],
  };

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

  // ── Artisan ID map: link service mini cards to main ARTISANS data ──
  const ARTISAN_ID_MAP = {
    'Karim Benali':1, 'Sara Doukkali':2, 'Omar Tahiri':3,
    'Fatima Zahra':4, 'Hassan Mrani':5, 'Aicha Lamine':6,
    'Youssef Kadi':7, 'Nadia Rhouat':8, 'Rachid Ouali':9,
    'Imane Zahiri':10, 'Samir Benhaddou':11,
  };

  function buildServiceMiniCard(a, idx, categoryLabel) {
    const grad = COVER_GRADIENTS[idx % COVER_GRADIENTS.length];
    const artisanId = ARTISAN_ID_MAP[a.name] || null;
    const profileSnapshot = encodeURIComponent(JSON.stringify({ id: artisanId || '', name: a.name, category: categoryLabel, city: a.city }));
    const clickHandler = artisanId
      ? `onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({id:${artisanId},name:'${a.name}',category:'${categoryLabel}',city:'${a.city}'});}else if(typeof openArtisanModal==='function'){openArtisanModal(${artisanId});}else{window.location.href='artisan.html';}" tabindex="0" role="button" aria-label="Voir le profil de ${a.name}"`
      : `onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({name:'${a.name}',category:'${categoryLabel}',city:'${a.city}'});}else{window.location.href='artisan.html';}" tabindex="0" role="button" aria-label="Voir le profil de ${a.name}"`;
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
    if (!category || category === 'all' || !SERVICE_ARTISANS_DATA[category]) {
      container.innerHTML = '';
      return;
    }
    const label = SERVICE_LABELS[category] || category;
    const sourceArtisans = SERVICE_ARTISANS_DATA[category] || [];
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

  // ── Full dataset: 20 featured artisans ──────────────────
  const FEATURED_ARTISANS = [
    // ── Row 1 ─────────────────────────────────────────────
    { initials:'KB', name:'Karim Benali',      category:'Plomberie',     city:'Casablanca', rating:'4.9', reviews:127, price:'150 MAD', unit:'h', availability:'available', badge:'⭐ Top Noté',    coverIdx:0, trustScore:'4.9', responseTime:'Répond en 10 min' },
    { initials:'FZ', name:'Fatima Zahra',      category:'Nettoyage',     city:'Marrakech',  rating:'4.9', reviews:210, price:'80 MAD',  unit:'h', availability:'available', badge:'🌟 Légendaire',  coverIdx:1, trustScore:'4.9', responseTime:'Répond en 5 min'  },
    { initials:'OT', name:'Omar Tahiri',       category:'Électricité',   city:'Rabat',      rating:'4.7', reviews:85,  price:'180 MAD', unit:'h', availability:'busy',      badge:'⚡ Expert',     coverIdx:2, trustScore:'4.7', responseTime:'Répond en 20 min' },
    { initials:'SD', name:'Sara Doukkali',     category:'Peinture',      city:'Casablanca', rating:'4.8', reviews:98,  price:'120 MAD', unit:'h', availability:'available', badge:'🎨 Artiste',    coverIdx:3, trustScore:'4.8', responseTime:'Répond en 15 min' },
    { initials:'NR', name:'Nadia Rhouat',      category:'Climatisation', city:'Casablanca', rating:'4.8', reviews:56,  price:'200 MAD', unit:'h', availability:'available', badge:'❄️ Certifiée',  coverIdx:4, trustScore:'4.8', responseTime:'Répond en 12 min' },
    // ── Row 2 ─────────────────────────────────────────────
    { initials:'AE', name:'Amine El Fassi',    category:'Menuiserie',    city:'Fès',        rating:'4.9', reviews:81,  price:'160 MAD', unit:'h', availability:'available', badge:'🪚 Maître',     coverIdx:5, trustScore:'4.9', responseTime:'Répond en 8 min'  },
    { initials:'RB', name:'Rachid Berrada',    category:'Maçonnerie',    city:'Casablanca', rating:'4.8', reviews:73,  price:'140 MAD', unit:'h', availability:'available', badge:'🧱 Expert',    coverIdx:0, trustScore:'4.8', responseTime:'Répond en 18 min' },
    { initials:'HA', name:'Houda Amrani',      category:'Jardinage',     city:'Rabat',      rating:'4.7', reviews:62,  price:'90 MAD',  unit:'h', availability:'available', badge:'🌿 Pro',       coverIdx:1, trustScore:'4.7', responseTime:'Répond en 25 min' },
    { initials:'SQ', name:'Samir Qassemi',     category:'Déménagement',  city:'Tanger',     rating:'4.6', reviews:44,  price:'350 MAD', unit:'j', availability:'busy',      badge:'📦 Rapide',    coverIdx:2, trustScore:'4.6', responseTime:'Répond en 30 min' },
    { initials:'AM', name:'Abdelilah Mouti',   category:'Serrurerie',    city:'Agadir',     rating:'4.9', reviews:92,  price:'130 MAD', unit:'h', availability:'available', badge:'🔑 Certifié',  coverIdx:3, trustScore:'4.9', responseTime:'Répond en 7 min'  },
    // ── Row 3 (hidden initially, +5 on first See More) ────
    { initials:'YK', name:'Youssef Kadi',      category:'Bricolage',     city:'Tanger',     rating:'4.7', reviews:91,  price:'130 MAD', unit:'h', availability:'available', badge:'🔨 Polyvalent', coverIdx:4, trustScore:'4.7', responseTime:'Répond en 14 min' },
    { initials:'LB', name:'Leila Badri',       category:'Peinture',      city:'Rabat',      rating:'4.9', reviews:77,  price:'130 MAD', unit:'h', availability:'available', badge:'⭐ Top Noté',   coverIdx:5, trustScore:'4.9', responseTime:'Répond en 11 min' },
    { initials:'HB', name:'Hamza Benchekroun', category:'Menuiserie',    city:'Casablanca', rating:'4.7', reviews:58,  price:'145 MAD', unit:'h', availability:'busy',      badge:'✅ Vérifié',   coverIdx:0, trustScore:'4.7', responseTime:'Répond en 22 min' },
    { initials:'ZA', name:'Zineb Alaoui',      category:'Nettoyage',     city:'Rabat',      rating:'4.7', reviews:66,  price:'85 MAD',  unit:'h', availability:'available', badge:'⭐ Top Noté',   coverIdx:1, trustScore:'4.7', responseTime:'Répond en 16 min' },
    { initials:'IB', name:'Ibrahim Bennis',    category:'Maçonnerie',    city:'Casablanca', rating:'4.8', reviews:88,  price:'170 MAD', unit:'h', availability:'available', badge:'🧱 Expert',    coverIdx:2, trustScore:'4.8', responseTime:'Répond en 9 min'  },
    // ── Row 4 (hidden initially, +5 on second See More) ───
    { initials:'KZ', name:'Khalid Ziani',      category:'Climatisation', city:'Agadir',     rating:'4.7', reviews:44,  price:'190 MAD', unit:'h', availability:'available', badge:'✅ Vérifié',   coverIdx:3, trustScore:'4.7', responseTime:'Répond en 17 min' },
    { initials:'MA', name:'Mehdi Amrani',      category:'Plomberie',     city:'Rabat',      rating:'4.7', reviews:89,  price:'140 MAD', unit:'h', availability:'busy',      badge:'✅ Vérifié',   coverIdx:4, trustScore:'4.7', responseTime:'Répond en 21 min' },
    { initials:'NS', name:'Nour Slimani',      category:'Bricolage',     city:'Casablanca', rating:'4.6', reviews:47,  price:'120 MAD', unit:'h', availability:'available', badge:'✅ Vérifié',   coverIdx:5, trustScore:'4.6', responseTime:'Répond en 28 min' },
    { initials:'HM', name:'Hassan Mrani',      category:'Jardinage',     city:'Fès',        rating:'4.8', reviews:72,  price:'100 MAD', unit:'h', availability:'available', badge:'🌿 Expert',    coverIdx:0, trustScore:'4.8', responseTime:'Répond en 13 min' },
    { initials:'MT', name:'Mourad Taleb',      category:'Serrurerie',    city:'Casablanca', rating:'4.8', reviews:72,  price:'130 MAD', unit:'h', availability:'available', badge:'🔑 Expert',    coverIdx:1, trustScore:'4.8', responseTime:'Répond en 19 min' },
  ];

  // ── ID map: link featured cards to ARTISANS profile data ─
  const FEATURED_ID_MAP = {
    'Karim Benali':1, 'Fatima Zahra':4, 'Omar Tahiri':3,
    'Sara Doukkali':2, 'Nadia Rhouat':8, 'Hassan Mrani':5,
    'Youssef Kadi':7, 'Aicha Lamine':6,
  };

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
    const artisanId    = FEATURED_ID_MAP[a.name] || null;
    const cardClick    = artisanId
      ? 'onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({id:' + artisanId + ',name:\'' + a.name + '\',category:\'' + a.category + '\',city:\'' + a.city + '\'});}else if(typeof openArtisanModal===\'function\'){openArtisanModal(' + artisanId + ');}else{window.location.href=\'artisan.html\';}"'
      : 'onclick="if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.open({name:\'' + a.name + '\',category:\'' + a.category + '\',city:\'' + a.city + '\'});}else{window.location.href=\'artisan.html\';}"';
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
    var remaining = FEATURED_ARTISANS.length - _featuredShownCount;
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
    _featuredShownCount = Math.min(_featuredShownCount + FEATURED_STEP, FEATURED_ARTISANS.length);
    updateSeeMoreBtn();
    // Wire newly revealed cards' buttons
    if (window._wireFeaturedButtons && grid) window._wireFeaturedButtons(grid);
  }

  // ── Main render: inject all cards, hide cards after index 10
  function renderFeaturedArtisans() {
    var grid = document.getElementById('featured-artisans-grid');
    if (!grid) return;

    // Reset pagination state on each render
    _featuredShownCount = FEATURED_INITIAL;

    // Build ALL cards, mark those beyond initial limit as hidden
    grid.innerHTML = FEATURED_ARTISANS.map(function(a, idx) {
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
      var remaining = FEATURED_ARTISANS.length - FEATURED_INITIAL;
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
