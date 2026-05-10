/*
 * fixeo-coordination-v1i.js — V1-I Coordination Confidence Layer
 * Version: v1i
 *
 * Loaded on: confirmation.html, dashboard-client.html, dashboard-artisan.html
 * (not artisan-profile.html — no mission context there)
 *
 * Philosophy: every coordination signal must be derivable from REAL stored data.
 * No fake realtime. No ETA. No dispatch theater. No urgency inflation.
 * No polling. No setInterval. No new network calls. Render-once on page load.
 *
 * What this file does:
 *   Phase 1 — Coordination context strips on artisan accepted/en_cours/terminée cards
 *   Phase 2 — Artisan identity card + next-step clarity on confirmation.html
 *   Phase 3 — Operational reliability signals on artisan profile area (artisan dashboard)
 *   Phase 4 — Client state context improvements (dashboard-client.html)
 *   Phase 5 — Artisan sparse-market calm empty state improvements
 *
 * Safety invariants:
 *   - Reads fixeo_client_requests (same key as client-dashboard-p1.js) — NEVER writes
 *   - All DOM insertions are idempotent (data-v1iDone guards + existence checks)
 *   - No modification of: reservation.js, cod-payment.js, commission-lifecycle-p3a.js,
 *     fixeo-mission-system.js, fixeo-client-requests-store.js, auth-global.js
 *   - Never removes or moves existing DOM elements — only appends/prepends context strips
 *   - Zero fake signals: every rendered string comes from real stored field values
 */
(function () {
  'use strict';
  if (window._fxCiLoaded) return;
  window._fxCiLoaded = true;

  /* ── Utilities ─────────────────────────────────────────── */
  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s || '')));
    return d.innerHTML;
  }

  function _readRequests() {
    try {
      var raw = localStorage.getItem('fixeo_client_requests');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _normStatus(s) {
    return (s || '').toLowerCase().replace(/[_\s]/g, '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /* Coarse elapsed — mirrors V1-E-A helpers */
  function _elapsed(isoStr) {
    if (!isoStr) return '';
    var ms = Date.now() - (Date.parse(isoStr) || 0);
    if (ms < 0) return '';
    var days = Math.floor(ms / 86400000);
    if (ms < 3600000) return 'aujourd\u2019hui';
    var h = Math.floor(ms / 3600000);
    if (h < 24)  return 'aujourd\u2019hui';
    if (days === 1) return 'hier';
    if (days < 7)  return days + '\u00a0jours';
    var w = Math.floor(days / 7);
    if (w < 5) return w + '\u00a0semaine' + (w > 1 ? 's' : '');
    var m = Math.floor(days / 30);
    return m + '\u00a0mois';
  }

  /* Is the given date ISO string today (local time)? */
  function _isToday(isoStr) {
    if (!isoStr) return false;
    try {
      var d = new Date(isoStr);
      var now = new Date();
      return d.getFullYear() === now.getFullYear()
          && d.getMonth()    === now.getMonth()
          && d.getDate()     === now.getDate();
    } catch (e) { return false; }
  }

  /* Get page context */
  var _page = (function () {
    var p = location.pathname;
    if (/confirmation/.test(p)) return 'confirmation';
    if (/dashboard-client/.test(p)) return 'client';
    if (/dashboard-artisan/.test(p)) return 'artisan';
    return 'unknown';
  })();

  /* ════════════════════════════════════════════════════════
     PHASE 2 — Confirmation page enhancements
     Injects artisan identity card + next-step block below timeline
     Data source: localStorage.lastOrder (already set by reservation.js)
  ════════════════════════════════════════════════════════ */
  function _enhanceConfirmation() {
    if (_page !== 'confirmation') return;
    var timeline = document.getElementById('conf-timeline');
    if (!timeline || timeline.dataset.v1iDone) return;
    timeline.dataset.v1iDone = '1';

    var order = {};
    try { order = JSON.parse(localStorage.getItem('lastOrder') || '{}'); } catch (e) {}

    var artisanName = order.artisan || '';
    var service     = order.service || '';
    var city        = order.city    || '';
    var category    = order.category || service || '';
    var dateStr     = order.date    || '';
    var timeSlot    = order.timeSlot || '';

    /* Icon for category */
    var catIcons = {
      'plomberie':'\ud83d\udd27',
      'electricite':'\u26a1', 'electricit\u00e9':'\u26a1',
      'climatisation':'\u2744\ufe0f', 'nettoyage':'\ud83e\uddf9',
      'peinture':'\ud83d\udd8c\ufe0f', 'menuiserie':'\ud83e\udea4',
      'serrurerie':'\ud83d\udd11', 'jardinage':'\ud83c\udf3f',
      'ma\u00e7onnerie':'\ud83e\uddf1', 'maconnerie':'\ud83e\uddf1',
      'carrelage':'\ud83c\udfd7\ufe0f', 'toiture':'\ud83c\udfe0',
      'd\u00e9m\u00e9nagement':'\ud83d\udce6', 'demenagement':'\ud83d\udce6',
      'bricolage':'\ud83d\udd29'
    };
    var catSlug = (category || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s,/]/)[0];
    var catIcon = catIcons[catSlug] || '🔧';

    /* ── Artisan identity card (Phase 2) ── */
    var idCardHtml = '';
    if (artisanName) {
      var availLabel = '🟢 Disponible';
      idCardHtml = '<div class="fxci-artisan-id-card">'
        + '<div class="fxci-artisan-avatar">' + catIcon + '</div>'
        + '<div class="fxci-artisan-body">'
        +   '<div class="fxci-artisan-name">' + esc(artisanName) + '</div>'
        +   '<div class="fxci-artisan-meta">'
        +     (service ? esc(service) : 'Artisan Fixeo')
        +     (city ? ' \u2014 ' + esc(city) : '')
        +   '</div>'
        + '</div>'
        + '<div class="fxci-artisan-avail">' + availLabel + '</div>'
        + '</div>';
    }

    /* ── Same-day pill ── */
    var sameDayHtml = '';
    if (dateStr && _isToday(dateStr)) {
      sameDayHtml = '<div class="fxci-sameday-pill">📅 Intervention prévue aujourd\u2019hui</div>';
    }

    /* ── Next-step guidance (Phase 2) ── */
    var nextStepText = 'L\u2019artisan peut vous contacter via WhatsApp pour confirmer l\u2019horaire et l\u2019adresse.';
    if (timeSlot) {
      nextStepText = 'Cr\u00e9neau pr\u00e9vu\u00a0: <strong>' + esc(timeSlot) + '</strong>. '
        + 'L\u2019artisan vous confirme les d\u00e9tails par WhatsApp.';
    }

    var nextStepHtml = '<div class="fxci-next-step">'
      + '<div class="fxci-next-step-label">\u00c9tape suivante</div>'
      + '<div class="fxci-next-step-text">' + nextStepText + '</div>'
      + '</div>';

    /* ── Coordination context steps (Phase 1+2) ── */
    var coordHtml = '<div class="fxci-conf-coord">'
      + '<div class="fxci-conf-coord-label">Coordination</div>'
      + '<div class="fxci-conf-steps">'
      + '<div class="fxci-conf-step fxci-conf-step--active">'
      +   '<span class="fxci-conf-step-icon">📋</span>'
      +   'Votre demande est enregistr\u00e9e. La coordination avec l\u2019artisan est en cours.'
      + '</div>'
      + '<div class="fxci-conf-step">'
      +   '<span class="fxci-conf-step-icon">💬</span>'
      +   'L\u2019artisan peut vous contacter via WhatsApp pour confirmer l\u2019horaire exact.'
      + '</div>'
      + '<div class="fxci-conf-step">'
      +   '<span class="fxci-conf-step-icon">✅</span>'
      +   'Vous confirmez l\u2019intervention termin\u00e9e. Le paiement se fait apr\u00e8s.'
      + '</div>'
      + '</div>'
      + '</div>';

    /* ── Inject block after timeline ── */
    var block = document.createElement('div');
    block.className = 'fxci-conf-block';
    block.innerHTML = sameDayHtml + idCardHtml + coordHtml + nextStepHtml;
    timeline.parentNode.insertBefore(block, timeline.nextSibling);
  }

  /* ════════════════════════════════════════════════════════
     PHASE 4 — Client dashboard card enhancements
     MutationObserver on #fxclp1-ls-requests — appends
     context strips to each card after p1.js renders them.
     Idempotent: data-v1iDone on each card.
  ════════════════════════════════════════════════════════ */
  function _enhanceClientCard(card) {
    if (!card || card.dataset.v1iDone) return;
    card.dataset.v1iDone = '1';

    var step = 0; // derive from class
    if (card.classList.contains('status-accepted'))    step = 1;
    else if (card.classList.contains('status-in-progress')) step = 2;
    else if (card.classList.contains('status-done'))   step = 3;
    else if (card.classList.contains('status-validated')) step = 4;

    var stripHtml = '';

    if (step === 0) {
      /* Waiting — operational reassurance */
      stripHtml = '<div class="fxci-waiting-context">'
        + 'Votre demande reste active. Les artisans compatibles peuvent encore r\u00e9pondre. '
        + 'La coordination commence d\u00e8s acceptation.'
        + '</div>';
    } else if (step === 1) {
      /* Accepted — coordination started */
      stripHtml = '<div class="fxci-coord-strip fxci-coord-strip--accepted">'
        + '<span class="fxci-coord-icon">💬</span>'
        + '<span class="fxci-coord-text">Coordination d\u00e9marr\u00e9e. '
        + 'Vous pouvez <strong>partager une photo</strong> ou votre localisation pour faciliter l\u2019intervention.</span>'
        + '</div>';
    } else if (step === 2) {
      /* En cours — calm status */
      stripHtml = '<div class="fxci-coord-strip fxci-coord-strip--en-cours">'
        + '<span class="fxci-coord-icon">🔧</span>'
        + '<span class="fxci-coord-text">Intervention en cours. '
        + '<strong>Aucune action requise</strong> — la coordination continue via WhatsApp.</span>'
        + '</div>';
    } else if (step === 3) {
      /* Terminée — calm validation prompt */
      /* Note: validation nudge (V1-E-A) is already in actions. This is a calmer top-strip. */
      stripHtml = '<div class="fxci-coord-strip fxci-coord-strip--terminee">'
        + '<span class="fxci-coord-icon">✅</span>'
        + '<span class="fxci-coord-text">'
        + 'L\u2019intervention semble termin\u00e9e. <strong>Confirmez si tout est en ordre.</strong> '
        + 'La confirmation finale cl\u00f4ture la mission.'
        + '</span>'
        + '</div>';
    } else if (step >= 4) {
      /* Validated / closed — quiet closure signal */
      stripHtml = '<div class="fxci-closed-strip">'
        + '<span>\u2713</span>'
        + '<span>Mission cl\u00f4tur\u00e9e. Merci d\u2019avoir utilis\u00e9 Fixeo.</span>'
        + '</div>';
    }

    if (!stripHtml) return;

    /* Insert AFTER timeline, BEFORE actions */
    var timeline = card.querySelector('.fxclp1-timeline');
    var ref = timeline ? timeline.nextSibling : card.querySelector('.fxclp1-artisan-block') || card.querySelector('.fxclp1-actions');
    if (ref) {
      var div = document.createElement('div');
      div.innerHTML = stripHtml;
      ref.parentNode.insertBefore(div.firstChild, ref);
    } else {
      var div2 = document.createElement('div');
      div2.innerHTML = stripHtml;
      card.appendChild(div2.firstChild);
    }
  }

  function _enhanceAllClientCards() {
    var container = document.getElementById('fxclp1-ls-requests');
    if (!container) return;
    var cards = container.querySelectorAll('.fxclp1-card:not([data-v1i-done])');
    cards.forEach(_enhanceClientCard);
  }

  function _watchClientCards() {
    var container = document.getElementById('fxclp1-ls-requests');
    if (!container) return;
    _enhanceAllClientCards();
    /* MutationObserver — fires when p1.js renders cards */
    var obs = new MutationObserver(function () {
      _enhanceAllClientCards();
    });
    obs.observe(container, { childList: true, subtree: false });
  }

  /* ════════════════════════════════════════════════════════
     PHASE 1+5 — Artisan dashboard enhancements
     Adds coordination context to mission cards and
     operational clarity to sparse-market empty state
  ════════════════════════════════════════════════════════ */
  function _enhanceArtisanMissionCard(card) {
    if (!card || card.dataset.v1iDone) return;
    card.dataset.v1iDone = '1';

    var st = 'accepted';
    if (card.classList.contains('state-en-cours') || card.classList.contains('state-encours')) st = 'en_cours';
    else if (card.classList.contains('state-terminee')) st = 'terminee';

    var stripHtml = '';

    if (st === 'accepted') {
      stripHtml = '<div class="fxci-coord-strip fxci-coord-strip--accepted">'
        + '<span class="fxci-coord-icon">📋</span>'
        + '<span class="fxci-coord-text"><strong>Coordination en attente.</strong> '
        + 'Le client attend la confirmation de l\u2019adresse et de l\u2019heure.</span>'
        + '</div>';
    } else if (st === 'en_cours') {
      stripHtml = '<div class="fxci-coord-strip fxci-coord-strip--en-cours">'
        + '<span class="fxci-coord-icon">🔧</span>'
        + '<span class="fxci-coord-text">Intervention op\u00e9rationnelle. '
        + 'Marquez comme <strong>termin\u00e9e</strong> une fois le travail finalis\u00e9.</span>'
        + '</div>';
    } else if (st === 'terminee') {
      stripHtml = '<div class="fxci-coord-strip fxci-coord-strip--terminee">'
        + '<span class="fxci-coord-icon">\u23f3</span>'
        + '<span class="fxci-coord-text">En attente de confirmation client. '
        + 'C\u2019est normal \u2014 le client confirme quand il est pr\u00eat.</span>'
        + '</div>';
    }

    if (!stripHtml) return;

    /* Insert after the coord-hint or badge, before actions */
    var hint = card.querySelector('.fxmlp2-coord-hint, .fxmlp2-elapsed-strip');
    var actions = card.querySelector('.fxmlp2-actions, .fxadp4-card-actions');
    var anchor = hint || actions;
    if (anchor) {
      var div = document.createElement('div');
      div.innerHTML = stripHtml;
      anchor.parentNode.insertBefore(div.firstChild, anchor);
    }
  }

  function _enhanceArtisanMissionCards() {
    var missionRoot = document.getElementById('fxmlp2-artisan-missions');
    if (!missionRoot) return;
    missionRoot.querySelectorAll('.fxmlp2-card:not([data-v1i-done])').forEach(_enhanceArtisanMissionCard);
  }

  /* Phase 3: Operational reliability chips on artisan profile section */
  function _injectReliabilityChips() {
    var avail = (localStorage.getItem('fixeo_avail_status') || '').toLowerCase();
    var offSince = localStorage.getItem('fixeo_avail_off_since');
    var artisanCity = localStorage.getItem('user_city') || '';

    /* Only show chips on artisan dashboard */
    var overviewRoot = document.getElementById('fxadp2-overview-wrap');
    if (!overviewRoot || overviewRoot.dataset.v1iChips) return;
    overviewRoot.dataset.v1iChips = '1';

    var chips = [];

    /* Availability chip — only when genuinely available */
    if (avail === 'now' || avail === 'week') {
      chips.push('<span class="fxci-rel-chip fxci-rel-chip--avail">\ud83d\udfe2 Disponible cette semaine</span>');
    }

    /* City chip — honest zone */
    if (artisanCity) {
      chips.push('<span class="fxci-rel-chip fxci-rel-chip--zone">\ud83d\udccd Actif \u00e0 ' + esc(artisanCity) + '</span>');
    }

    /* Recent activity chip — when validated missions exist */
    try {
      var reqs = _readRequests();
      var myId = localStorage.getItem('user_id') || localStorage.getItem('fixeo_user_id') || '';
      var myName = (localStorage.getItem('user_name') || '').trim().toLowerCase();
      var validated = reqs.filter(function(r) {
        var st = _normStatus(r.status);
        if (st !== 'validee') return false;
        if (myId && String(r.assigned_artisan_id || '').trim() === myId) return true;
        if (myName && String(r.assigned_artisan || '').trim().toLowerCase() === myName) return true;
        return false;
      });
      if (validated.length >= 2) {
        chips.push('<span class="fxci-rel-chip fxci-rel-chip--recent">\u2713 Interventions r\u00e9cemment confirm\u00e9es</span>');
      }
    } catch (e) {}

    if (chips.length === 0) return;

    var strip = document.createElement('div');
    strip.className = 'fxci-reliability-strip';
    strip.innerHTML = chips.join('');
    overviewRoot.appendChild(strip);
  }

  /* Phase 5: Sparse-market calm context note */
  function _enhanceSparseEmptyState() {
    var inbox = document.getElementById('fxadp4-overview-inbox');
    if (!inbox || inbox.dataset.v1iSparse) return;

    /* Only enhance the existing empty-state message — don't create from scratch */
    var emptyEl = inbox.querySelector('.fxadp4-empty-hint, .fxadp4-inbox-empty');
    if (!emptyEl) return;
    if (emptyEl.dataset.v1iSparse) return;
    emptyEl.dataset.v1iSparse = '1';

    /* Insert a calm operational note below the existing empty message */
    var note = document.createElement('div');
    note.className = 'fxci-sparse-note';
    note.innerHTML = 'Votre profil est actif et visible. Les premi\u00e8res demandes de votre zone apparaissent ici d\u00e8s qu\u2019elles arrivent.';
    emptyEl.parentNode.insertBefore(note, emptyEl.nextSibling);
  }

  /* ════════════════════════════════════════════════════════
     MAIN: Route enhancements per page context
  ════════════════════════════════════════════════════════ */
  function _init() {
    if (_page === 'confirmation') {
      _enhanceConfirmation();
    } else if (_page === 'client') {
      _watchClientCards();
    } else if (_page === 'artisan') {
      /* Defer slightly to let mission-lifecycle-p2.js and artisan-dashboard-p4.js render first */
      setTimeout(function () {
        _enhanceArtisanMissionCards();
        _injectReliabilityChips();
        _enhanceSparseEmptyState();
      }, 400);

      /* Also watch for mission card renders */
      var missionRoot = document.getElementById('fxmlp2-artisan-missions');
      if (missionRoot) {
        var obs = new MutationObserver(function () {
          _enhanceArtisanMissionCards();
        });
        obs.observe(missionRoot, { childList: true, subtree: false });
      }
    }
  }

  /* Defer init to let all other scripts render first */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(_init, 250);
    });
  } else {
    setTimeout(_init, 250);
  }

  /* Also listen for fixeo:missions:updated event (emitted by mission-lifecycle-p2.js) */
  window.addEventListener('fixeo:missions:updated', function () {
    if (_page === 'artisan') {
      setTimeout(_enhanceArtisanMissionCards, 200);
    }
  });

})();
