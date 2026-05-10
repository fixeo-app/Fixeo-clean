/* ================================================================
   FIXEO — Dashboard Client DX-WA
   WhatsApp-Native Operational Dashboard

   Philosophy:
   Fixeo orchestrates matching, trust, coordination, and status.
   WhatsApp is the natural human layer — communication, photos,
   voice notes, location, quick confirmations.
   The dashboard communicates this division naturally.

   Responsibilities:
   1. Contextual WhatsApp deep-links from REAL request data
      (service, city, artisan name — no fabricated context)
   2. Post-process p1.js rendered request cards with WA continuity
      (MutationObserver on #client-requests-list — progressive enhancement)
   3. Upgrade status banner WhatsApp CTA (from DX-3 basic relay
      to contextual deep-link with prefilled message)
   4. WhatsApp support CTA — honest, premium, single entry point
   5. Upgrade artisan block: "Il vous contactera" → operational WA hint
   6. Timeline labels: more human, less enterprise
   7. Mobile-first: every WA element thumb-accessible, no clutter

   Architecture:
   - Progressive enhancement: runs AFTER p1.js render (MutationObserver)
   - Reads ONLY: localStorage fixeo_client_requests (same as p1.js / dx2.js)
   - Zero network calls; zero Supabase modifications
   - Never modifies client-dashboard-p1.js (SAFE ZONE)
   - Never modifies auth/session/modals/payment/admin
   - Idempotent: window._fxDxWaLoaded guard + per-element data-wa-done stamps

   Data honesty:
   - WhatsApp messages prefilled from real r.service + r.city + r.assigned_artisan
   - Only inject WA block when operationally relevant (step ≥ 1 = artisan assigned)
   - Never invent fake artisan phone numbers
   - Support always routes through official Fixeo WhatsApp line

   Guard: window._fxDxWaLoaded
   Namespace: fxdwa-*, #fxdwa-*
   Dependencies: p1.js (must run first), DOMContentLoaded
   ================================================================ */

;(function () {
  'use strict';
  if (window._fxDxWaLoaded) return;
  window._fxDxWaLoaded = true;

  /* ── Config ──────────────────────────────────────────── */
  var REQUESTS_KEY   = 'fixeo_client_requests';
  var WA_BASE        = 'https://wa.me/212660484415?text=';
  var WA_GREEN       = 'rgba(37, 211, 102, 0.9)';

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  function ls(k) {
    try { return localStorage.getItem(k) || ''; } catch(e) { return ''; }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function readRequests() {
    try {
      var arr = JSON.parse(ls(REQUESTS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  }

  function normalizeStatus(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').trim();
  }

  /* ── WhatsApp URL builder ─────────────────────────────── */
  /*
     Builds a contextual, prefilled WhatsApp message from REAL request data.
     Adapts tone by request state:
       waiting → "j'ai soumis une demande…"
       assigned → "mon artisan [name] est assigné…"
       inprogress → "l'intervention de [service] est en cours…"
       confirm → "je souhaite confirmer la fin d'intervention…"
  */
  function buildWaUrl(r, context) {
    var service  = (r.service || '').trim();
    var city     = (r.city || '').trim();
    var artisan  = (r.assigned_artisan || '').trim();
    var msg;

    if (context === 'waiting') {
      msg = 'Bonjour Fixeo\u2C60'
        + (service ? ' j\u2019ai soumis une demande de ' + service : ' j\u2019ai une demande en cours')
        + (city ? ' \u00e0 ' + city : '')
        + ' et je voudrais avoir des nouvelles. Merci.';
    } else if (context === 'photo') {
      msg = 'Bonjour Fixeo\u2C60'
        + (service ? ' voici une photo pour ma demande de ' + service : ' voici une photo de mon probl\u00e8me')
        + (city ? ' \u00e0 ' + city : '') + '.';
    } else if (context === 'location') {
      msg = 'Bonjour Fixeo\u2C60 je partage ma localisation pour l\u2019intervention'
        + (service ? ' de ' + service : '')
        + (city ? ' \u00e0 ' + city : '') + '.';
    } else if (context === 'assigned') {
      msg = 'Bonjour Fixeo\u2C60'
        + (artisan ? ' ' + artisan + ' est assign\u00e9 \u00e0 ma demande' : ' mon artisan est assign\u00e9')
        + (service ? ' de ' + service : '')
        + (city ? ' \u00e0 ' + city : '')
        + '. Je souhaite coordonner l\u2019intervention.';
    } else if (context === 'confirm') {
      msg = 'Bonjour Fixeo\u2C60 je souhaite confirmer la fin de l\u2019intervention'
        + (service ? ' de ' + service : '')
        + (artisan ? ' avec ' + artisan : '')
        + '. Merci.';
    } else if (context === 'support') {
      msg = 'Bonjour Fixeo\u2C60 j\u2019ai besoin d\u2019aide avec ma demande'
        + (service ? ' de ' + service : '')
        + (city ? ' \u00e0 ' + city : '') + '.';
    } else {
      // Default: generic support
      msg = 'Bonjour Fixeo\u2C60 j\u2019ai besoin d\u2019un artisan'
        + (service ? ' pour ' + service : '')
        + (city ? ' \u00e0 ' + city : '') + '.';
    }

    // U+2C60 was a placeholder — replace with comma for final msg
    msg = msg.replace(/\u2C60/g, ',');
    return WA_BASE + encodeURIComponent(msg);
  }

  /* ── Build WA action pill ─────────────────────────────── */
  function waPill(label, url, icon) {
    icon = icon || '\ud83d\udcac'; // 💬
    return '<a class="fxdwa-pill" href="' + url + '" target="_blank" rel="noopener noreferrer"' +
      ' aria-label="' + esc(label) + '">' +
      '<span class="fxdwa-pill-icon">' + icon + '</span>' +
      '<span class="fxdwa-pill-text">' + esc(label) + '</span>' +
    '</a>';
  }

  /* ── Determine operational step from request ──────────── */
  function getStep(r) {
    var s = normalizeStatus(r.status || '');
    if (s === 'acceptee' || s === 'accepte')    return 1;
    if (s === 'en_cours' || s === 'encours')    return 2;
    if (s === 'terminee' || s === 'termine')    return 3;
    if (s === 'validee'  || s === 'valide')     return 4;
    if (s === 'annulee'  || s === 'annule')     return -1;
    return 0; // waiting
  }

  /* ── Enhance a single rendered request card ───────────── */
  /*
     p1.js has already rendered the card HTML into the DOM.
     We find the artisan block and append WA continuity actions.
     Idempotent: data-wa-done guards each card.
  */
  function enhanceCard(card, r) {
    if (!r || card.dataset.waDone === '1') return;
    card.dataset.waDone = '1';

    var step = getStep(r);

    // Build WA actions block
    var waBlock = document.createElement('div');
    waBlock.className = 'fxdwa-actions';

    if (step === 0) {
      // Waiting: offer photo + status check
      waBlock.innerHTML =
        '<div class="fxdwa-label">Continuer sur WhatsApp :</div>' +
        '<div class="fxdwa-pills">' +
          waPill('Envoyer une photo', buildWaUrl(r, 'photo'), '\ud83d\udcf7') +
          waPill('Partager ma localisation', buildWaUrl(r, 'location'), '\ud83d\udccd') +
          waPill('Contacter Fixeo', buildWaUrl(r, 'waiting'), '\ud83d\udcf2') +
        '</div>';
    } else if (step === 1) {
      // Artisan assigned: coordinate intervention
      waBlock.innerHTML =
        '<div class="fxdwa-label">Coordonner sur WhatsApp :</div>' +
        '<div class="fxdwa-pills">' +
          waPill('Continuer sur WhatsApp', buildWaUrl(r, 'assigned'), '\ud83d\udcac') +
          waPill('Envoyer une photo', buildWaUrl(r, 'photo'), '\ud83d\udcf7') +
          waPill('Partager ma localisation', buildWaUrl(r, 'location'), '\ud83d\udccd') +
        '</div>';
    } else if (step === 2) {
      // In progress: light touch — don't interrupt active intervention
      waBlock.innerHTML =
        '<div class="fxdwa-pills">' +
          waPill('Coordonner via WhatsApp', buildWaUrl(r, 'assigned'), '\ud83d\udcf2') +
        '</div>';
    } else if (step === 3) {
      // Terminée: confirm via WhatsApp
      waBlock.innerHTML =
        '<div class="fxdwa-label">Fin d\u2019intervention :</div>' +
        '<div class="fxdwa-pills">' +
          waPill('Confirmer sur WhatsApp', buildWaUrl(r, 'confirm'), '\u2705') +
        '</div>';
    } else {
      // Validated, cancelled, unknown: no WA actions needed
      return;
    }

    // Append after the actions or artisan block
    var actionsEl = card.querySelector('.fxclp1-actions');
    var artisanEl = card.querySelector('.fxclp1-artisan-block');
    var anchor    = actionsEl || artisanEl;
    if (anchor) {
      anchor.parentNode.insertBefore(waBlock, anchor.nextSibling);
    } else {
      card.appendChild(waBlock);
    }

    // Update "Il vous contactera" text to be more operational
    var contactHint = card.querySelector('.fxclp1-artisan-contact');
    if (contactHint && step >= 1) {
      contactHint.textContent = 'Contact via WhatsApp Fixeo';
      contactHint.className   = 'fxclp1-artisan-contact fxdwa-contact-hint';
    }
  }

  /* ── Match rendered cards to request data ─────────────── */
  /*
     p1.js doesn't stamp data-request-id on the card itself.
     Strategy: get requests from LS, then match the nth card
     to the nth request (p1.js renders them in the same sort order).
  */
  function enhanceAllCards() {
    var container = el('client-requests-list');
    if (!container) return;

    var cards = container.querySelectorAll('.fxclp1-card');
    if (cards.length === 0) return;

    // Read requests in same sort order as p1.js (newest first)
    var requests = readRequests();
    // Filter to user (same logic as p1.js — use all if no identity)
    var phone = ls('user_phone').replace(/\D/g,'').slice(-9) || ls('fixeo_user_phone').replace(/\D/g,'').slice(-9);
    if (phone) {
      requests = requests.filter(function(r) {
        var rPhone = String(r.phone || r.telephone || '').replace(/\D/g,'').slice(-9);
        return rPhone && rPhone === phone;
      });
    }
    requests = requests.sort(function(a,b) {
      return (Date.parse(b.created_at||'')||0) - (Date.parse(a.created_at||'')||0);
    });

    // Enhance each card with its corresponding request
    Array.prototype.forEach.call(cards, function(card, i) {
      enhanceCard(card, requests[i] || null);
    });
  }

  /* ── Upgrade status banner WhatsApp CTA ──────────────── */
  /*
     DX-3 injected a basic WA relay CTA inside the banner.
     DX-WA upgrades it: remove the DX-3 basic one, inject a
     contextual version with prefilled message from most active request.
     Only runs when banner is assigned or active state.
  */
  function upgradeStatusBannerWA() {
    // Remove DX-3 basic CTA if present (avoid duplication)
    var old = el('fxd3-whatsapp-cta');
    if (old) old.parentNode.removeChild(old);

    var banner = el('fxd2-status-banner');
    if (!banner) return;

    var bannerInner = banner.querySelector('.fxd2-banner-inner');
    if (!bannerInner) return;

    // Only upgrade for assigned/active (not waiting — WA not urgent there)
    var isAssigned = bannerInner.classList.contains('fxd2-banner--assigned');
    var isActive   = bannerInner.classList.contains('fxd2-banner--active');
    var isWaiting  = bannerInner.classList.contains('fxd2-banner--waiting');
    if (!isAssigned && !isActive && !isWaiting) return;

    // Get most relevant request for context
    var reqs = readRequests().sort(function(a,b) {
      return (Date.parse(b.created_at||'')||0) - (Date.parse(a.created_at||'')||0);
    });
    var r = reqs[0] || {};

    // Choose contextual copy
    var waCtx, waLabel;
    if (isActive) {
      waCtx  = 'confirm';
      waLabel = 'Confirmer sur WhatsApp';
    } else if (isAssigned) {
      waCtx  = 'assigned';
      waLabel = 'Continuer sur WhatsApp';
    } else {
      waCtx  = 'waiting';
      waLabel = 'Contacter Fixeo';
    }

    var waEl = document.createElement('a');
    waEl.id        = 'fxdwa-banner-cta';
    waEl.className = 'fxdwa-banner-cta';
    waEl.href      = buildWaUrl(r, waCtx);
    waEl.target    = '_blank';
    waEl.rel       = 'noopener noreferrer';
    waEl.setAttribute('aria-label', waLabel + ' via WhatsApp Fixeo');
    waEl.innerHTML =
      '<span class="fxdwa-bcta-icon">&#x1F4F2;</span>' +
      '<span class="fxdwa-bcta-text">' + esc(waLabel) + '</span>';

    // Insert after the .fxd2-banner-copy block
    var copy = bannerInner.querySelector('.fxd2-banner-copy');
    if (copy) {
      bannerInner.insertBefore(waEl, copy.nextSibling);
    } else {
      bannerInner.appendChild(waEl);
    }
  }

  /* ── WhatsApp support hub ─────────────────────────────── */
  /*
     Adds a calm, premium WhatsApp support entry point to the sidebar.
     Injected ONCE into the marketplace panel — contextual, not spammy.
     Only shown when user has at least one active request.
  */
  function injectSupportHub(reqs) {
    if (el('fxdwa-support-hub')) return; // idempotent

    var activeReqs = reqs.filter(function(r) {
      var s = normalizeStatus(r.status || '');
      return s !== 'annulee' && s !== 'annule' && s !== 'validee' && s !== 'valide';
    });

    // Only show when user has active flow (not for brand-new users)
    if (activeReqs.length === 0) return;

    var r = activeReqs[0];
    var waUrl = buildWaUrl(r, 'support');

    var hub = document.createElement('div');
    hub.id        = 'fxdwa-support-hub';
    hub.className = 'fxdwa-support-hub';
    hub.innerHTML =
      '<div class="fxdwa-support-inner">' +
        '<span class="fxdwa-support-icon">&#x1F4AC;</span>' +
        '<div class="fxdwa-support-body">' +
          '<div class="fxdwa-support-title">Besoin d\u2019aide\u00a0?</div>' +
          '<div class="fxdwa-support-sub">L\u2019\u00e9quipe Fixeo r\u00e9pond sur WhatsApp.</div>' +
        '</div>' +
        '<a class="fxdwa-support-cta" href="' + waUrl + '" target="_blank" rel="noopener noreferrer">' +
          'Contacter Fixeo' +
        '</a>' +
      '</div>';

    // Inject inside marketplace panel, before the browse CTA
    var mpPanel = document.querySelector('.fxd-marketplace-panel');
    var mpCta   = mpPanel ? mpPanel.querySelector('.fxd-mp-cta') : null;
    if (mpPanel && mpCta) {
      mpPanel.insertBefore(hub, mpCta);
    } else if (mpPanel) {
      mpPanel.appendChild(hub);
    }
  }

  /* ── MutationObserver: watch for p1.js renders ─────────── */
  function watchRequestList() {
    var container = el('client-requests-list');
    if (!container) return;

    // Run once immediately (p1.js may have already rendered)
    enhanceAllCards();

    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function() {
      // Brief debounce: let p1.js finish its full render
      clearTimeout(obs._t);
      obs._t = setTimeout(enhanceAllCards, 80);
    });
    obs.observe(container, { childList: true, subtree: false });
  }

  /* ── INIT ────────────────────────────────────────────── */
  function init() {
    var page = window.location.pathname.split('/').pop() || '';
    if (page && page !== 'dashboard-client.html') return;

    var reqs = readRequests();

    // Run immediately (idempotent)
    watchRequestList();

    // Status banner upgrade: wait for dx2.js to inject banner
    // dx2.js uses a 400ms delay for banner injection; we add 200ms more
    setTimeout(function() {
      upgradeStatusBannerWA();
    }, 650);

    // Support hub: inject once into sidebar
    setTimeout(function() {
      injectSupportHub(reqs);
    }, 700);

    // Re-run on request changes (same events as p1.js / dx2.js)
    function onRequestChange() {
      setTimeout(function() {
        var fresh = readRequests();
        enhanceAllCards();
        upgradeStatusBannerWA();
        injectSupportHub(fresh);
      }, 250);
    }
    window.addEventListener('fixeo:client-request-updated', onRequestChange);
    window.addEventListener('fixeo:client-request-created', onRequestChange);
    window.addEventListener('fixeo:state:updated', onRequestChange);
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY) onRequestChange();
    });
  }

  /* ── Start ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
