/* ================================================================
   FIXEO — Dashboard Client DX-3
   Real Operational Marketplace Connection

   Responsibilities:
   1. Fetch REAL artisans from Supabase (city-aware, ordered by rating)
   2. Render premium dashboard artisan cards in #recommended-artisans
   3. Update marketplace panel header with real city name
   4. WhatsApp continuity CTA on confirmed artisan (Fixeo relay)
   5. Graceful fallback: panel remains useful if Supabase unavailable

   Architecture:
   - Uses FixeoSupabaseClient.ready() + .client.from('artisans')
   - Reads city from: user_city LS | fixeo_profile.city LS | FIXEO_DETECTED_CITY
   - NEVER modifies Supabase schema
   - NEVER touches auth/session/modals/payment
   - Zero fake data: if artisan has no phone → WhatsApp relay via Fixeo
   - Idempotent: _fxDx3Loaded guard

   Guard: window._fxDx3Loaded
   Namespace: fxd3-*, #fxd3-*
   ================================================================ */

;(function () {
  'use strict';
  if (window._fxDx3Loaded) return;
  window._fxDx3Loaded = true;

  /* ── Config ──────────────────────────────────────────── */
  var MAX_CARDS      = 4;   // cards to show in dashboard sidebar
  var FETCH_LIMIT    = 12;  // artisans to query (take top 4 by availability)
  var WHATSAPP_URL   = 'https://wa.me/212660484415?text=Bonjour%20Fixeo%2C%20j%E2%80%99ai%20besoin%20d%E2%80%99un%20artisan';

  /* ── Category icons (matches homepage fhp.js) ─────────── */
  var CAT_ICONS = {
    'Plomberie':'🔧','Électricité':'⚡','Peinture':'🎨','Nettoyage':'🧹',
    'Jardinage':'🌿','Déménagement':'📦','Bricolage':'🔨','Climatisation':'❄️',
    'Menuiserie':'🪚','Maçonnerie':'🧱','Serrurerie':'🔑','Carrelage':'🏠',
    'Étanchéité':'🛡','Vitrerie':'🪟','Soudure':'🔥','Informatique':'💻'
  };

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  function ls(k) {
    try { return localStorage.getItem(k) || ''; } catch(e) { return ''; }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── City resolution (3-tier, same as K-1 philosophy) ── */
  function resolveCity() {
    // P1: explicit user_city localStorage (most reliable, set by profile hydration)
    var c1 = ls('user_city').trim();
    if (c1) return c1;

    // P2: fixeo_profile.city (Supabase profile written to LS)
    try {
      var prof = JSON.parse(ls('fixeo_profile') || '{}');
      if (prof && prof.city && prof.city.trim()) return prof.city.trim();
    } catch(e) {}

    // P3: settings-client-city <select> value (hydrated by fixeo-mvp-supabase.js)
    var cityEl = el('settings-client-city');
    if (cityEl && cityEl.value && cityEl.value.trim()) return cityEl.value.trim();

    // P4: geo-detected city from homepage (window global)
    if (window.FIXEO_DETECTED_CITY && window.FIXEO_DETECTED_CITY.trim()) {
      return window.FIXEO_DETECTED_CITY.trim();
    }

    return ''; // national fallback
  }

  /* ── Category icon lookup ────────────────────────────── */
  function catIcon(cat) {
    if (!cat) return '🔧';
    // Direct match
    if (CAT_ICONS[cat]) return CAT_ICONS[cat];
    // Case-insensitive partial match
    var lower = cat.toLowerCase();
    for (var key in CAT_ICONS) {
      if (key.toLowerCase() === lower) return CAT_ICONS[key];
      if (lower.indexOf(key.toLowerCase()) !== -1) return CAT_ICONS[key];
    }
    return '🔧';
  }

  /* ── Rating label (credible, no fake star counts) ─────── */
  function ratingLabel(artisan) {
    var badge = (artisan.badge_label || '').trim();
    if (badge) return badge;
    var reviews = parseInt(artisan.review_count || 0, 10);
    if (reviews >= 100) return 'Top Artisan';
    if (reviews >= 40)  return 'Artisan expérimenté';
    if (reviews >= 10)  return 'Bien noté';
    return 'Sélectionné Fixeo';
  }

  /* ── Build a single artisan card ─────────────────────── */
  function buildCard(a, idx) {
    var cat   = a.category || a.service_category || '';
    var icon  = catIcon(cat);
    var city  = a.city || 'Maroc';
    var avail = (a.availability || '').toLowerCase();
    var isAvailable = avail === 'available';
    var reviews = parseInt(a.review_count || 0, 10);
    var label = ratingLabel(a);

    // Availability chip — only honest states
    var availChip = isAvailable
      ? '<span class="fxd3-avail fxd3-avail--on">&#x1F7E2; Disponible</span>'
      : '<span class="fxd3-avail fxd3-avail--busy">Sur RDV</span>';

    // Review hint — real count if > 0, omit if zero
    var reviewHint = reviews > 0
      ? '<span class="fxd3-reviews">' + reviews + ' intervention' + (reviews > 1 ? 's' : '') + '</span>'
      : '';

    return '<div class="fxd3-card" style="--fxd3-delay:' + idx + '" data-artisan-id="' + esc(String(a.id || '')) + '">' +
      '<div class="fxd3-card-top">' +
        '<div class="fxd3-avatar" data-cat="' + esc(cat.toLowerCase()) + '">' +
          '<span class="fxd3-avatar-icon">' + icon + '</span>' +
        '</div>' +
        '<div class="fxd3-info">' +
          '<div class="fxd3-name">' + esc(a.name || 'Artisan') + '</div>' +
          '<div class="fxd3-meta">' +
            '<span class="fxd3-cat">' + esc(cat || 'Service') + '</span>' +
            '<span class="fxd3-city">&#x1F4CD; ' + esc(city) + '</span>' +
          '</div>' +
        '</div>' +
        availChip +
      '</div>' +
      '<div class="fxd3-label-row">' +
        '<span class="fxd3-label">' + esc(label) + '</span>' +
        reviewHint +
      '</div>' +
      '<button class="fxd3-cta" onclick="FixeoDashboardModals.openRequest()" ' +
        'data-artisan-id="' + esc(String(a.id || '')) + '">' +
        'Publier une demande' +
      '</button>' +
    '</div>';
  }

  /* ── Render artisan cards ────────────────────────────── */
  function renderCards(artisans, city) {
    var container = el('recommended-artisans');
    if (!container) return;

    if (!artisans || artisans.length === 0) {
      // No artisans for this city — show national fallback CTA
      container.innerHTML =
        '<div class="fxd3-empty">' +
          '<p class="fxd3-empty-msg">Artisans disponibles dans tout le Maroc.</p>' +
          '<a href="index.html#artisans-section" class="fxd3-browse-link">Explorer le r\u00e9seau &#x2192;</a>' +
        '</div>';
      return;
    }

    // Prioritise available artisans
    var available = artisans.filter(function(a) { return (a.availability||'') === 'available'; });
    var others    = artisans.filter(function(a) { return (a.availability||'') !== 'available'; });
    var sorted    = available.concat(others).slice(0, MAX_CARDS);

    container.innerHTML = '<div class="fxd3-grid">' +
      sorted.map(function(a, i) { return buildCard(a, i); }).join('') +
    '</div>';

    // Update panel header to reflect city
    updatePanelHeader(city, sorted.length);
  }

  /* ── Update marketplace panel header ─────────────────── */
  function updatePanelHeader(city, count) {
    var titleEl = document.querySelector('.fxd-mp-title');
    var subEl   = document.querySelector('.fxd-mp-sub');
    if (!titleEl || !subEl) return;

    if (city) {
      titleEl.textContent = 'Artisans disponibles \u00e0 ' + city;
    } else {
      titleEl.textContent = '861 artisans dans votre r\u00e9seau';
    }

    if (count > 0) {
      subEl.textContent = count + ' artisan' + (count > 1 ? 's' : '') +
        (city ? ' \u00e0 ' + city : ' au Maroc') +
        ' \u2014 paiement apr\u00e8s intervention.';
    }
  }

  /* ── Fetch artisans from Supabase ─────────────────────── */
  async function fetchArtisans(city) {
    if (!window.FixeoSupabaseClient || !window.FixeoSupabaseClient.CONFIGURED) {
      return []; // not configured — graceful fallback
    }

    try {
      await window.FixeoSupabaseClient.ready();
      var client = window.FixeoSupabaseClient.client;
      if (!client) return [];

      var q = client.from('artisans')
        .select('id,name,city,category,service_category,availability,rating,review_count,badge_label,verified')
        .order('rating', { ascending: false })
        .limit(FETCH_LIMIT);

      if (city) {
        q = q.ilike('city', '%' + city + '%');
      }

      var result = await q;
      if (result.error) {
        console.warn('[DX-3] Artisan fetch error:', result.error.message);
        return [];
      }
      return result.data || [];
    } catch (err) {
      console.warn('[DX-3] Artisan fetch failed:', err.message);
      return [];
    }
  }

  /* ── WhatsApp continuity on confirmed artisan ────────── */
  function injectWhatsAppContinuity() {
    // Only inject if status banner shows an assigned/in-progress artisan
    var banner = el('fxd2-status-banner');
    if (!banner) return;

    // Check if already injected
    if (el('fxd3-whatsapp-cta')) return;

    var bannerInner = banner.querySelector('.fxd2-banner-inner');
    if (!bannerInner) return;

    // Only add WhatsApp for assigned or active states (not waiting)
    var isAssigned = bannerInner.classList.contains('fxd2-banner--assigned') ||
                     bannerInner.classList.contains('fxd2-banner--active');
    if (!isAssigned) return;

    // Build WhatsApp relay CTA
    var waDiv = document.createElement('a');
    waDiv.id = 'fxd3-whatsapp-cta';
    waDiv.className = 'fxd3-wa-cta';
    waDiv.href = WHATSAPP_URL;
    waDiv.target = '_blank';
    waDiv.rel = 'noopener noreferrer';
    waDiv.setAttribute('aria-label', 'Contacter Fixeo via WhatsApp');
    waDiv.innerHTML =
      '<span class="fxd3-wa-icon">&#x1F4F2;</span>' +
      '<span class="fxd3-wa-text">Coordonner via WhatsApp Fixeo</span>';

    // Insert inside banner, after the banner copy
    var copy = bannerInner.querySelector('.fxd2-banner-copy');
    if (copy) {
      bannerInner.insertBefore(waDiv, copy.nextSibling);
    } else {
      bannerInner.appendChild(waDiv);
    }
  }

  /* ── INIT ────────────────────────────────────────────── */
  async function init() {
    // Only run on dashboard-client.html
    var page = window.location.pathname.split('/').pop() || '';
    if (page && page !== 'dashboard-client.html') return;

    // Defer: let DX-2 run first (city from settings may not be hydrated yet)
    await new Promise(function(res) { setTimeout(res, 600); });

    var city = resolveCity();
    var artisans = await fetchArtisans(city);

    // If city filter returned nothing, try national fallback
    if (artisans.length === 0 && city) {
      artisans = await fetchArtisans('');
      city = ''; // reset city label for national fallback
    }

    renderCards(artisans, city);

    // WhatsApp CTA: inject after a short delay (DX-2 banner must be in DOM)
    setTimeout(injectWhatsAppContinuity, 800);
  }

  /* ── Start ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); });
  } else {
    setTimeout(function() { init(); }, 0);
  }

})();
