/* ================================================================
   FIXEO — Dashboard Client DX-2
   Living Dashboard / Context-Aware Experience

   Responsibilities:
   1. Context-aware hero headline + sub (time-of-day + name)
   2. Active request status banner (status-first when pending activity)
   3. Stats grid: fully hide when all zeros (complement to DX-1 CSS)
   4. Operational empty state: marketplace counter text
   5. Marketplace continuity strip: honest ambient signal

   Architecture:
   - Pure DOM manipulation — reads existing IDs, never creates new ones
     that collide with FixeoDashboardModals, fixeoOpenRequest, or Supabase
   - Idempotent: _fxDx2Loaded guard; safe to call multiple times
   - Reads: #client-hero-name (Supabase-hydrated), localStorage fixeo_client_requests
   - Writes: #fxd-hero-headline, #fxd-hero-sub, injects #fxd2-status-banner
   - Zero network calls; zero auth changes; zero Supabase modifications

   Guard: window._fxDx2Loaded
   Namespace: fxd2-*, #fxd2-*
   Dependencies: DOMContentLoaded only — no external deps
   ================================================================ */

;(function () {
  'use strict';
  if (window._fxDx2Loaded) return;
  window._fxDx2Loaded = true;

  /* ── Config ──────────────────────────────────────────── */
  var REQUESTS_KEY = 'fixeo_client_requests';
  var BANNER_ID    = 'fxd2-status-banner';
  var STRIP_ID     = 'fxd2-continuity-strip';

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  function ls(k) {
    try { return localStorage.getItem(k) || ''; } catch(e) { return ''; }
  }

  function readRequests() {
    try {
      var raw = localStorage.getItem(REQUESTS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  }

  function normalizeText(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Get current user identity ───────────────────────── */
  function getIdentity() {
    return {
      phone: ls('user_phone').replace(/\D/g, '').slice(-9) ||
             ls('fixeo_user_phone').replace(/\D/g, '').slice(-9),
      name:  normalizeText(ls('user_name') || ls('fixeo_user_name'))
    };
  }

  /* ── Filter requests to current user ────────────────── */
  function getMyRequests() {
    var all      = readRequests();
    var identity = getIdentity();
    if (!identity.phone && !identity.name) return all; // fallback: show all
    return all.filter(function (r) {
      var rPhone = String(r.phone || r.telephone || '').replace(/\D/g, '').slice(-9);
      var rName  = normalizeText(r.client_name || r.client || '');
      var byPhone = identity.phone && rPhone && rPhone === identity.phone;
      var byName  = identity.name.length >= 2 && rName && rName === identity.name;
      return byPhone || byName;
    }).sort(function (a, b) {
      return (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0);
    });
  }

  /* ── Classify most recent active request ────────────── */
  function classifyRequests(list) {
    var active = list.filter(function (r) {
      var s = normalizeText(r.status || '');
      return s !== 'annulee' && s !== 'annule' && s !== 'validee' && s !== 'valide';
    });
    var hasArtisan  = active.filter(function (r) { return r.assigned_artisan; });
    var inProgress  = active.filter(function (r) {
      var s = normalizeText(r.status || '');
      return s === 'en cours' || s === 'en_cours' || s === 'encours';
    });
    var waiting     = active.filter(function (r) {
      var s = normalizeText(r.status || '');
      return !r.assigned_artisan && s !== 'en cours' && s !== 'en_cours' && s !== 'encours';
    });
    return { active: active, hasArtisan: hasArtisan, inProgress: inProgress, waiting: waiting };
  }

  /* ── 1. Context-aware hero ───────────────────────────── */
  function _buildGreeting(firstName, hour) {
    var period = hour < 12 ? 'Bonjour' : (hour < 18 ? 'Bon apr\u00e8s-midi' : 'Bonsoir');
    if (firstName) return period + '\u00a0' + esc(firstName);
    return period;
  }

  function updateHero(reqs) {
    var heroH1  = document.querySelector('.fxd-hero-headline');
    var heroSub = document.querySelector('.fxd-hero-sub');
    if (!heroH1 || !heroSub) return;

    var nameSpan  = el('client-hero-name');
    var fullName  = nameSpan ? nameSpan.textContent.trim() : '';
    var firstName = fullName ? fullName.split(' ')[0] : '';
    var hour      = new Date().getHours();
    var clf       = classifyRequests(reqs);

    var headline, sub;

    if (clf.inProgress.length > 0) {
      // Most engaged state: intervention in progress
      var r = clf.inProgress[0];
      headline = 'Intervention en cours \u2014 ' + esc(r.service || 'votre demande');
      sub      = 'Votre artisan est en route ou sur place. Confirmez la fin d\u2019intervention ici.';
    } else if (clf.hasArtisan.length > 0) {
      // Artisan assigned
      var r2 = clf.hasArtisan[0];
      headline = esc(r2.assigned_artisan || 'Artisan') + ' prend en charge votre demande';
      sub      = 'Il vous contactera directement pour planifier l\u2019intervention.';
    } else if (clf.waiting.length > 0) {
      // Waiting for match
      headline = clf.waiting.length === 1
        ? 'Votre demande est en cours de traitement'
        : clf.waiting.length + ' demandes en attente de r\u00e9ponse';
      sub = 'Les artisans disponibles dans votre ville seront alert\u00e9s imm\u00e9diatement.';
    } else if (reqs.length > 0) {
      // Has history but no active requests
      var greeting = _buildGreeting(firstName, hour);
      headline = greeting + (firstName ? '\u00a0\u2014 tout est \u00e0 jour' : '\u00a0\u2014 votre espace est \u00e0 jour');
      sub      = 'Publiez une nouvelle demande pour trouver un artisan qualifi\u00e9.';
    } else {
      // New user — no requests
      var greeting2 = _buildGreeting(firstName, hour);
      headline = greeting2 + (firstName ? '\u00a0\u2014 bienvenue sur Fixeo' : '\u00a0\u2014 votre r\u00e9seau est pr\u00eat');
      sub      = '861\u00a0artisans v\u00e9rifi\u00e9s disponibles au Maroc. Publiez votre premi\u00e8re demande en 30\u00a0secondes.';
    }

    // Inject with soft fade
    heroH1.classList.add('fxd2-hero-fade');
    heroSub.classList.add('fxd2-hero-fade');
    setTimeout(function () {
      heroH1.innerHTML = headline;
      heroSub.innerHTML = sub;
      heroH1.classList.remove('fxd2-hero-fade');
      heroSub.classList.remove('fxd2-hero-fade');
    }, 180);
  }

  /* ── 2. Active request status banner ────────────────── */
  function injectStatusBanner(reqs) {
    // Remove existing banner (idempotent re-render)
    var old = el(BANNER_ID);
    if (old) old.parentNode.removeChild(old);

    var clf = classifyRequests(reqs);
    if (clf.active.length === 0) return; // no banner when no activity

    var banner = document.createElement('div');
    banner.id  = BANNER_ID;
    banner.className = 'fxd2-status-banner';

    var icon, title, sub, ctaLabel, ctaAction, accent;

    if (clf.inProgress.length > 0) {
      var r = clf.inProgress[0];
      icon      = '&#x1F527;'; // 🔧
      title     = 'Intervention en cours\u00a0: ' + esc(r.service || 'votre demande');
      sub       = 'Confirmez la fin d\u2019intervention d\u00e8s que l\u2019artisan a termin\u00e9.';
      ctaLabel  = 'Voir les d\u00e9tails';
      ctaAction = 'showSection(\'bookings\')';
      accent    = 'fxd2-banner--active';
    } else if (clf.hasArtisan.length > 0) {
      var r2 = clf.hasArtisan[0];
      icon      = '&#x1F477;'; // 👷
      title     = esc(r2.assigned_artisan || 'Votre artisan') + ' est assign\u00e9';
      sub       = 'Il vous contactera directement pour fixer le rendez-vous.';
      ctaLabel  = 'Voir la mission';
      ctaAction = 'showSection(\'bookings\')';
      accent    = 'fxd2-banner--assigned';
    } else if (clf.waiting.length > 0) {
      var n = clf.waiting.length;
      icon      = '&#x23F3;'; // ⏳
      title     = n === 1
        ? 'Votre demande est en cours de traitement'
        : n + '\u00a0demandes en attente d\u2019artisan';
      sub       = 'R\u00e9ponse attendue sous 30\u00a0min. Les artisans disponibles ont \u00e9t\u00e9 alert\u00e9s.';
      ctaLabel  = 'Voir mes demandes';
      ctaAction = 'showSection(\'bookings\')';
      accent    = 'fxd2-banner--waiting';
    } else {
      return; // nothing to show
    }

    banner.innerHTML =
      '<div class="fxd2-banner-inner ' + accent + '">' +
        '<span class="fxd2-banner-icon">' + icon + '</span>' +
        '<div class="fxd2-banner-copy">' +
          '<div class="fxd2-banner-title">' + title + '</div>' +
          '<div class="fxd2-banner-sub">' + sub + '</div>' +
        '</div>' +
        '<button class="fxd2-banner-cta" onclick="' + ctaAction + '">' + ctaLabel + '</button>' +
      '</div>';

    // Insert at the top of #section-overview, BEFORE the hero
    var overview = el('section-overview');
    var codOverview = el('client-cod-overview');
    var hero     = overview ? overview.querySelector('.client-dashboard-hero') : null;
    if (overview && hero) {
      overview.insertBefore(banner, hero);
    } else if (codOverview) {
      codOverview.parentNode.insertBefore(banner, codOverview.nextSibling);
    }
  }

  /* ── 3. Stats grid: fully hide when all-zero ─────────── */
  function updateStatsVisibility() {
    var statsEl = el('client-stats-grid');
    if (!statsEl) return;

    // Already has real data — leave visible
    if (statsEl.dataset.real === '1' && statsEl.classList.contains('fxd-has-data')) return;

    // Has real data but all zeros — hide
    if (statsEl.dataset.real === '1' && !statsEl.classList.contains('fxd-has-data')) {
      statsEl.classList.add('fxd2-stats-hidden');
      return;
    }

    // No real data yet (initial load) — hide until Supabase resolves
    statsEl.classList.add('fxd2-stats-hidden');

    // Observer: unhide when data-real is set and fxd-has-data added
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      if (statsEl.dataset.real === '1') {
        if (statsEl.classList.contains('fxd-has-data')) {
          statsEl.classList.remove('fxd2-stats-hidden');
        }
        // All-zero case: stays hidden — no change
        obs.disconnect();
      }
    });
    obs.observe(statsEl, { attributes: true, attributeFilter: ['data-real', 'class'] });
  }

  /* ── 4. Marketplace continuity strip ────────────────── */
  function injectContinuityStrip(reqs) {
    if (el(STRIP_ID)) return; // idempotent

    // Only inject for users with NO requests (new user flow)
    if (reqs.length > 0) return;

    var overviewEl = el('section-overview');
    if (!overviewEl) return;

    // Insert after the stats grid
    var statsEl = el('client-stats-grid');
    if (!statsEl) return;

    var strip = document.createElement('div');
    strip.id = STRIP_ID;
    strip.className = 'fxd2-continuity-strip';
    strip.innerHTML =
      '<span class="fxd2-cs-pill">&#x1F4CD; 12\u00a0villes couvertes</span>' +
      '<span class="fxd2-cs-pill">&#x1F91D; 861\u00a0artisans v\u00e9rifi\u00e9s</span>' +
      '<span class="fxd2-cs-pill">&#x23F1; R\u00e9ponse sous 30\u00a0min</span>' +
      '<span class="fxd2-cs-pill">&#x1F4B3; Paiement apr\u00e8s intervention</span>';

    statsEl.parentNode.insertBefore(strip, statsEl.nextSibling);
  }

  /* ── 5. Smart empty state: update marketplace text ───── */
  function updateEmptyState(reqs) {
    var smartCta = el('fixeo-smart-cta');
    if (!smartCta || reqs.length > 0) return;

    // User has no requests: the empty state should already be visible
    // Just make sure the marketplace CTA sub text is operational
    var sub = smartCta.querySelector('.fxd-empty-sub');
    if (sub && !sub.dataset.dx2Updated) {
      sub.textContent = '861 artisans v\u00e9rifi\u00e9s dans 12 villes. R\u00e9ponse sous 30\u00a0min. Paiement apr\u00e8s intervention.';
      sub.dataset.dx2Updated = '1';
    }
  }

  /* ── 6. Listen for request changes ──────────────────── */
  function bindUpdates() {
    function refresh() {
      var reqs = getMyRequests();
      updateHero(reqs);
      injectStatusBanner(reqs);
    }
    window.addEventListener('fixeo:client-request-created', function () {
      setTimeout(refresh, 200);
    });
    window.addEventListener('fixeo:client-request-updated', function () {
      setTimeout(refresh, 200);
    });
    window.addEventListener('fixeo:state:updated', function () {
      setTimeout(refresh, 250);
    });
    window.addEventListener('storage', function (e) {
      if (e.key === REQUESTS_KEY) setTimeout(refresh, 200);
    });
  }

  /* ── 7. Hero name observer — run when name is hydrated ─ */
  function watchHeroName(reqs) {
    var nameSpan = el('client-hero-name');
    if (!nameSpan) return;

    // If name already loaded (fast path), run immediately
    var currentName = nameSpan.textContent.trim();
    if (currentName && currentName !== '...') {
      updateHero(reqs);
      return;
    }

    // Otherwise observe for Supabase hydration
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      var n = nameSpan.textContent.trim();
      if (n && n !== '...') {
        updateHero(reqs);
        obs.disconnect();
      }
    });
    obs.observe(nameSpan, { childList: true, characterData: true, subtree: true });

    // Safety timeout: run even if name never loads (anonymous session)
    setTimeout(function () {
      obs.disconnect();
      updateHero(reqs);
    }, 3000);
  }

  /* ── INIT ────────────────────────────────────────────── */
  function init() {
    // Only run on dashboard-client.html
    var page = window.location.pathname.split('/').pop() || '';
    if (page && page !== 'dashboard-client.html') return;

    var reqs = getMyRequests();

    // Run immediately
    updateStatsVisibility();
    updateEmptyState(reqs);
    injectContinuityStrip(reqs);

    // Status banner: run after p1.js has had a chance to read localStorage
    setTimeout(function () {
      var fresh = getMyRequests();
      injectStatusBanner(fresh);
      watchHeroName(fresh);
    }, 400);

    // Wire live updates
    bindUpdates();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
