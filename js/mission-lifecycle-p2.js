/* ============================================================
   FIXEO — MISSION LIFECYCLE PHASE 2
   js/mission-lifecycle-p2.js

   Works on BOTH dashboards:
     dashboard-artisan.html  → artisan CTAs (Start / Complete)
     dashboard-client.html   → client confirmation + history

   ARTISAN SIDE:
   - Reads fixeo_client_requests, filters accepted/en_cours/terminée
     for this artisan
   - Injects #fxmlp2-artisan-missions into #section-missions
   - CTAs: "Démarrer l'intervention" → en_cours
            "Marquer comme terminée" → terminée
   - Uses FixeoStateBridge.artisanStartMission() /
         FixeoStateBridge.artisanCompleteMission() if available
   - Direct store fallback via FixeoClientRequestsStore

   CLIENT SIDE:
   - Upgrades fxclp1 cards for en_cours: live dot + progress hint
   - Upgrades fxclp1 cards for terminée: premium confirm block
   - History view (#fxmlp2-history-client) for validée/annulée
   - Confirm action delegates to FixeoStateBridge.clientValidateMission
   - Direct store fallback via FixeoClientRequestsStore

   SHARED:
   - Mission history — validée + annulée requests
   - Cross-dashboard events + storage sync
   - No fake data, no Supabase calls

   Guard: window._fxMlP2Loaded (idempotent)
   Namespace: .fxmlp2-*
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxMlP2Loaded) return;
  window._fxMlP2Loaded = true;

  /* ── Page detection ──────────────────────────────────── */
  var PAGE = (function() {
    var p = window.location.pathname.toLowerCase();
    if (p.includes('dashboard-artisan')) return 'artisan';
    if (p.includes('dashboard-client'))  return 'client';
    return 'other';
  })();

  if (PAGE === 'other') return;

  /* ── Constants ───────────────────────────────────────── */
  var REQUESTS_KEY = 'fixeo_client_requests';
  var ACTIVE_STATUSES   = ['accept\u00e9e', 'en_cours', 'termin\u00e9e'];
  var COMPLETE_STATUSES = ['valid\u00e9e', 'intervention_confirm\u00e9e', 'annul\u00e9e'];

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id)    { return document.getElementById(id); }
  function ls(k,fb)  { try { return localStorage.getItem(k) || fb || ''; } catch(e){ return fb||''; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail:detail||{} })); } catch(e){}
  }
  function normalizeStatus(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    if (!n || n === 'nouvelle' || n === 'disponible') return 'nouvelle';
    if (n === 'acceptee' || n === 'accepte') return 'accept\u00e9e';
    if (n === 'en cours' || n === 'en_cours' || n === 'encours') return 'en_cours';
    if (n === 'terminee' || n === 'termine') return 'termin\u00e9e';
    if (n === 'validee' || n === 'valide' || n === 'intervention confirmee' || n === 'intervention_confirmee') return 'valid\u00e9e';
    if (n === 'annulee' || n === 'annule') return 'annul\u00e9e';
    return 'nouvelle';
  }
  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
    } catch(e){ return ''; }
  }
  function relativeTime(isoStr) {
    var ms = Date.now() - (Date.parse(isoStr||'')||0);
    var s = ms/1000;
    if (s < 60)    return 'Il y a quelques secondes';
    if (s < 3600)  return 'Il y a ' + Math.round(s/60) + ' min';
    if (s < 86400) return 'Il y a ' + Math.round(s/3600) + ' h';
    return formatDate(isoStr);
  }

  /* ── Read requests ───────────────────────────────────── */
  function readRequests() {
    try {
      var arr = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch(e){ return []; }
  }
  function writeRequests(list) {
    lsSet(REQUESTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  }

  /* ── Get artisan identity ────────────────────────────── */
  function getArtisan() {
    return {
      name: ls('user_name', ls('fixeo_user_name', '')),
      id:   ls('user_id',   ls('fixeo_user_id',   ''))
    };
  }

  /* ── Derive artisanId (same logic as P4) ─────────────── */
  function artisanIdFromProfile() {
    var id = ls('user_id', ls('fixeo_user_id', '')).trim();
    if (id) return id;
    var city = ls('user_city','').toLowerCase().replace(/\s+/g,'_');
    var job  = ls('user_job','').toLowerCase().replace(/\s+/g,'_');
    return (city && job) ? (job + '|' + city) : 'artisan-fixeo';
  }

  /* ── Get requests for THIS artisan ──────────────────── */
  function getArtisanMissions(artisan) {
    var myId = artisanIdFromProfile();
    var myName = String(artisan.name||'').trim().toLowerCase();
    return readRequests().filter(function(r) {
      var st = normalizeStatus(r.status);
      if (!ACTIVE_STATUSES.concat(COMPLETE_STATUSES).includes(st)) return false;
      var rId   = String(r.assigned_artisan_id||'').trim();
      var rName = String(r.assigned_artisan||'').trim().toLowerCase();
      return (myId && rId && rId === myId) || (myName && rName && rName === myName);
    }).sort(function(a,b){
      return (Date.parse(b.created_at||'')||0) - (Date.parse(a.created_at||'')||0);
    });
  }

  /* ── Get client own requests (Phase 2 client side) ───── */
  function getClientMissions() {
    var phone = ls('user_phone','').replace(/\D/g,'').slice(-9);
    var name  = String(ls('user_name',ls('fixeo_user_name',''))||'').trim().toLowerCase()
                  .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var all = readRequests();
    var hasId = phone.length >= 7 || name.length >= 2;
    return all.filter(function(r) {
      var st = normalizeStatus(r.status);
      if (!ACTIVE_STATUSES.concat(COMPLETE_STATUSES).includes(st)) return false;
      if (!hasId) return true;
      var rPhone = String(r.phone||r.telephone||'').replace(/\D/g,'').slice(-9);
      var rName  = String(r.client_name||r.client||'').trim().toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return (phone && rPhone && rPhone === phone) || (name.length >= 2 && rName && rName === name);
    });
  }

  /* ════════════════════════════════════════════════════════
     ── ARTISAN SIDE ─────────────────────────────────────
     ════════════════════════════════════════════════════════ */

  /* ── Start mission action ────────────────────────────── */
  window._fxMlP2Start = function(reqId) {
    var artisan = getArtisan();
    var artisanId = artisanIdFromProfile();

    // Prefer FixeoStateBridge
    if (window.FixeoStateBridge && typeof window.FixeoStateBridge.artisanStartMission === 'function') {
      window.FixeoStateBridge.artisanStartMission(reqId);
    } else if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.updateMissionStatus === 'function') {
      window.FixeoClientRequestsStore.updateMissionStatus(reqId, 'en_cours', artisan.name, artisanId);
    } else {
      // Direct fallback
      var list = readRequests();
      list.forEach(function(r, i) {
        if (String(r.id) !== String(reqId)) return;
        if (normalizeStatus(r.status) !== 'accept\u00e9e') return;
        list[i] = Object.assign({}, r, {
          status: 'en_cours',
          started_at: new Date().toISOString()
        });
      });
      writeRequests(list);
    }

    dispatch('fixeo:client-request-updated', { id: reqId, status: 'en_cours' });
    dispatch('fixeo:missions:updated', {});
    dispatch('fixeo:state:updated', { event: 'mission-started' });

    if (window.notifications && window.notifications.info) {
      window.notifications.info('Intervention d\u00e9marr\u00e9e', 'Le client voit l\u2019intervention en cours.');
    }
    setTimeout(_renderArtisan, 150);
  };

  /* ── Complete mission action ─────────────────────────── */
  window._fxMlP2Complete = function(reqId) {
    var artisan = getArtisan();
    var artisanId = artisanIdFromProfile();

    if (window.FixeoStateBridge && typeof window.FixeoStateBridge.artisanCompleteMission === 'function') {
      window.FixeoStateBridge.artisanCompleteMission(reqId);
    } else if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.updateMissionStatus === 'function') {
      // Store requires en_cours before terminée
      var current = readRequests().find(function(r){ return String(r.id) === String(reqId); });
      var st = current ? normalizeStatus(current.status) : '';
      if (st === 'accept\u00e9e') {
        window.FixeoClientRequestsStore.updateMissionStatus(reqId, 'en_cours', artisan.name, artisanId);
      }
      window.FixeoClientRequestsStore.updateMissionStatus(reqId, 'termin\u00e9e', artisan.name, artisanId);
    } else {
      var list2 = readRequests();
      list2.forEach(function(r, i) {
        if (String(r.id) !== String(reqId)) return;
        var st2 = normalizeStatus(r.status);
        if (!['accept\u00e9e','en_cours'].includes(st2)) return;
        list2[i] = Object.assign({}, r, {
          status: 'termin\u00e9e',
          client_confirmation: 'en_attente',
          completed_at: new Date().toISOString()
        });
      });
      writeRequests(list2);
    }

    dispatch('fixeo:client-request-updated', { id: reqId, status: 'termin\u00e9e' });
    dispatch('fixeo:missions:updated', {});
    dispatch('fixeo:state:updated', { event: 'mission-completed' });

    if (window.notifications && window.notifications.success) {
      window.notifications.success('Intervention termin\u00e9e', 'En attente de confirmation client.');
    }
    setTimeout(_renderArtisan, 150);
  };

  /* ── Render artisan mission card ─────────────────────── */
  function _renderArtisanCard(r) {
    var st   = normalizeStatus(r.status);
    var id   = esc(String(r.id));
    var svc  = esc(r.service || 'Intervention');
    var city = esc(r.city || r.ville || 'Maroc');
    var time = esc(relativeTime(r.accepted_at || r.created_at));

    var stateCls = st === 'accept\u00e9e' ? 'state-accepted' :
                   st === 'en_cours'      ? 'state-en-cours' :
                   st === 'termin\u00e9e' ? 'state-terminee' : '';

    var badgeHtml = st === 'accept\u00e9e'
      ? '<span class="fxmlp2-state-badge accepted">Artisan assign\u00e9</span>'
      : st === 'en_cours'
      ? '<span class="fxmlp2-state-badge en-cours">Intervention en cours</span>'
      : '<span class="fxmlp2-state-badge terminee waiting-confirm">En attente de confirmation</span>';

    // Client info (anonymous until accepted — phone already known to artisan)
    var clientHtml = '<div class="fxmlp2-client-block">'
      + '<div class="fxmlp2-client-avatar">\ud83d\udc64</div>'
      + '<div class="fxmlp2-client-label">Demande client'
      + '<div class="fxmlp2-client-sub">' + svc + ' \u00b7 ' + city + ' \u00b7 ' + time + '</div></div>'
      + '</div>';

    // Waiting hint for terminée
    var waitHtml = st === 'termin\u00e9e'
      ? '<div class="fxmlp2-waiting-hint">\u23f3 En attente de confirmation client pour cl\u00f4turer la mission.</div>'
      : '';

    // Action button
    var actionHtml = '';
    if (st === 'accept\u00e9e') {
      actionHtml = '<div class="fxmlp2-actions">'
        + '<button class="fxmlp2-btn-start" onclick="_fxMlP2Start(\'' + id + '\')">'
        + '\u25b6 D\u00e9marrer l\u2019intervention'
        + '</button>'
        + '</div>';
    } else if (st === 'en_cours') {
      actionHtml = '<div class="fxmlp2-actions">'
        + '<button class="fxmlp2-btn-complete" onclick="_fxMlP2Complete(\'' + id + '\')">'
        + '\u2713 Marquer comme termin\u00e9e'
        + '</button>'
        + '</div>';
    } else if (st === 'termin\u00e9e') {
      actionHtml = '<div class="fxmlp2-actions">'
        + '<span class="fxmlp2-done-label">\u23f3 En attente client</span>'
        + '</div>';
    }

    return '<div class="fxmlp2-mission-card ' + stateCls + '">'
      + '<div class="fxmlp2-card-head">'
      + '<div>'
      + '<div class="fxmlp2-card-service">' + svc + '</div>'
      + '<div class="fxmlp2-card-meta"><span>\ud83d\udccd ' + city + '</span></div>'
      + '</div>'
      + badgeHtml
      + '</div>'
      + clientHtml
      + waitHtml
      + actionHtml
      + '</div>';
  }

  /* ── Render artisan mission history ─────────────────── */
  function _renderArtisanHistory(missions) {
    var hist = missions.filter(function(r) { return COMPLETE_STATUSES.includes(normalizeStatus(r.status)); });
    if (!hist.length) return '';
    var itemsHtml = hist.map(function(r) {
      var st = normalizeStatus(r.status);
      var isCancelled = st === 'annul\u00e9e';
      return '<div class="fxmlp2-history-item">'
        + '<div class="fxmlp2-history-icon">' + (isCancelled ? '\u274c' : '\u2713') + '</div>'
        + '<div class="fxmlp2-history-body">'
        + '<div class="fxmlp2-history-service">' + esc(r.service||'Intervention') + ' \u2014 ' + esc(r.city||'Maroc') + '</div>'
        + '<div class="fxmlp2-history-meta">' + esc(formatDate(r.validated_at||r.completed_at||r.created_at)) + '</div>'
        + '</div>'
        + '<span class="fxmlp2-history-status' + (isCancelled ? ' cancelled' : '') + '">'
        + (isCancelled ? 'Annul\u00e9e' : 'Cl\u00f4tur\u00e9e')
        + '</span>'
        + '</div>';
    }).join('');

    return '<div class="fxmlp2-history-wrap">'
      + '<div class="fxmlp2-history-title">\u23f3 Historique (' + hist.length + ')</div>'
      + itemsHtml
      + '</div>';
  }

  /* ── Main artisan render ─────────────────────────────── */
  function _renderArtisan() {
    var container = el('fxmlp2-artisan-missions');
    if (!container) return;

    var artisan  = getArtisan();
    var missions = getArtisanMissions(artisan);
    var active   = missions.filter(function(r){ return ACTIVE_STATUSES.includes(normalizeStatus(r.status)); });

    if (!missions.length) {
      container.innerHTML = '<div class="fxmlp2-history-empty">Aucune mission en cours pour le moment.</div>';
      return;
    }

    var countBadge = active.length
      ? '<span class="fxmlp2-section-badge">' + active.length + '</span>'
      : '<span class="fxmlp2-section-badge zero">0</span>';

    var html = '<div class="fxmlp2-section-header">'
      + '<h2 class="fxmlp2-section-title">Mes interventions ' + countBadge + '</h2>'
      + '</div>';

    active.forEach(function(r) { html += _renderArtisanCard(r); });
    html += _renderArtisanHistory(missions);

    container.innerHTML = html;
  }

  /* ── Create artisan container in #section-missions ───── */
  function _createArtisanContainer() {
    if (el('fxmlp2-artisan-missions')) return;
    var section = el('section-missions');
    if (!section) return;
    var wrap = document.createElement('div');
    wrap.id = 'fxmlp2-artisan-missions';
    // Insert before the COD container
    var codMissions = el('artisan-cod-missions');
    if (codMissions && codMissions.parentNode === section) {
      section.insertBefore(wrap, codMissions);
    } else {
      section.insertBefore(wrap, section.firstChild.nextSibling || null);
    }
  }

  /* ════════════════════════════════════════════════════════
     ── CLIENT SIDE ──────────────────────────────────────
     ════════════════════════════════════════════════════════ */

  /* ── Confirm action (client) ─────────────────────────── */
  window._fxMlP2Confirm = function(reqId) {
    var artisanName = '';
    var artisanId   = '';
    // Get artisan details from the request
    var all = readRequests();
    var req = all.filter(function(r){ return String(r.id) === String(reqId); })[0];
    if (req) {
      artisanName = req.assigned_artisan || '';
      artisanId   = req.assigned_artisan_id || '';
    }

    if (window.FixeoStateBridge && typeof window.FixeoStateBridge.clientValidateMission === 'function') {
      window.FixeoStateBridge.clientValidateMission(reqId, artisanName, artisanId);
    } else if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.confirmClientCompletion === 'function') {
      window.FixeoClientRequestsStore.confirmClientCompletion(reqId, artisanName, artisanId);
    } else {
      // Direct fallback
      var list3 = readRequests();
      list3.forEach(function(r, i) {
        if (String(r.id) !== String(reqId)) return;
        list3[i] = Object.assign({}, r, {
          status: 'valid\u00e9e',
          client_confirmation: 'confirm\u00e9e',
          validated_at: new Date().toISOString()
        });
      });
      writeRequests(list3);
    }

    dispatch('fixeo:client-request-updated', { id: reqId, status: 'valid\u00e9e' });
    dispatch('fixeo:state:updated', { event: 'client-confirmed' });

    if (window.notifications && window.notifications.success) {
      window.notifications.success('Mission cl\u00f4tur\u00e9e !', 'Merci. L\u2019intervention est confirm\u00e9e.');
    }
    setTimeout(_renderClient, 150);
  };

  /* ── Upgrade existing P1 cards with P2 elements ─────── */
  function _upgradeClientCards() {
    // P1 cards are rendered by client-dashboard-p1.js into #fxclp1-ls-requests
    // We inject upgrades into them post-render (CSS additions + confirm block)
    var container = el('fxclp1-ls-requests');
    if (!container) return;

    var cards = container.querySelectorAll('.fxclp1-card');
    cards.forEach(function(card) {
      var reqId = _cardReqId(card);
      if (!reqId) return;
      var req = readRequests().filter(function(r){ return String(r.id) === String(reqId); })[0];
      if (!req) return;
      var st = normalizeStatus(req.status);

      // en_cours: inject live dot after timeline
      if (st === 'en_cours' && !card.querySelector('.fxmlp2-live-dot')) {
        var tl = card.querySelector('.fxclp1-timeline');
        var liveDot = document.createElement('div');
        liveDot.className = 'fxmlp2-live-dot';
        liveDot.textContent = 'Intervention en cours';
        liveDot.style.marginBottom = '10px';
        if (tl) tl.insertAdjacentElement('afterend', liveDot);
      }

      // terminée: inject confirm block if not already present
      if (st === 'termin\u00e9e' && !card.querySelector('.fxmlp2-confirm-block')) {
        var existing = card.querySelector('.fxclp1-actions');
        var confirmBlock = document.createElement('div');
        confirmBlock.className = 'fxmlp2-confirm-block';
        confirmBlock.innerHTML = '<div class="fxmlp2-confirm-title">\u2728 L\u2019intervention est termin\u00e9e\u00a0?</div>'
          + '<div class="fxmlp2-confirm-sub">Confirmez pour cl\u00f4turer la mission et lib\u00e9rer l\u2019artisan.</div>'
          + '<button class="fxmlp2-btn-confirm" onclick="_fxMlP2Confirm(\'' + esc(String(reqId)) + '\')">'
          + '\u2713 Confirmer la fin de l\u2019intervention</button>';
        if (existing) {
          existing.parentNode.insertBefore(confirmBlock, existing);
          // Hide P1's own confirm button (P2 replaces it with richer block)
          existing.style.display = 'none';
        } else {
          card.appendChild(confirmBlock);
        }
      }
    });
  }

  /* ── Extract req ID from P1 card (by id attr pattern) ── */
  function _cardReqId(card) {
    // P1 cards don't have id attrs — we need to match via service+city combo
    // Instead, we pass reqId via data attributes on confirm buttons
    var btn = card.querySelector('[data-bridge-action="client-validate"]');
    if (btn) return btn.dataset.requestId || btn.dataset.missionId;
    var p2btn = card.querySelector('[onclick*="_fxMlP2Confirm"]');
    if (p2btn) {
      var match = (p2btn.getAttribute('onclick')||'').match(/'([^']+)'/);
      return match ? match[1] : null;
    }
    return null;
  }

  /* ── Render client history ───────────────────────────── */
  function _renderClientHistory() {
    var histContainer = el('fxmlp2-history-client');
    if (!histContainer) return;
    var missions = getClientMissions();
    var hist = missions.filter(function(r){ return COMPLETE_STATUSES.includes(normalizeStatus(r.status)); });

    if (!hist.length) {
      histContainer.innerHTML = '<div class="fxmlp2-history-empty">Aucune mission cl\u00f4tur\u00e9e pour le moment.</div>';
      return;
    }

    histContainer.innerHTML = hist.map(function(r) {
      var st = normalizeStatus(r.status);
      var isCancelled = st === 'annul\u00e9e';
      return '<div class="fxmlp2-history-item">'
        + '<div class="fxmlp2-history-icon">' + (isCancelled ? '\u274c' : '\u2713') + '</div>'
        + '<div class="fxmlp2-history-body">'
        + '<div class="fxmlp2-history-service">' + esc(r.service||'Intervention') + ' \u2014 ' + esc(r.city||'Maroc') + '</div>'
        + '<div class="fxmlp2-history-meta">'
        + esc(r.assigned_artisan ? 'Artisan : ' + r.assigned_artisan + ' \u00b7 ' : '')
        + esc(formatDate(r.validated_at || r.completed_at || r.created_at))
        + '</div>'
        + '</div>'
        + '<span class="fxmlp2-history-status' + (isCancelled ? ' cancelled' : '') + '">'
        + (isCancelled ? 'Annul\u00e9e' : 'Cl\u00f4tur\u00e9e')
        + '</span>'
        + '</div>';
    }).join('');
  }

  /* ── Create client history container ─────────────────── */
  function _createClientHistory() {
    if (el('fxmlp2-history-client')) return;
    var lsReq = el('fxclp1-ls-requests');
    if (!lsReq) return;
    var wrap = document.createElement('div');
    wrap.id = 'fxmlp2-history-client';
    wrap.className = 'fxmlp2-history-wrap';
    var titleDiv = document.createElement('div');
    titleDiv.className = 'fxmlp2-history-title';
    titleDiv.textContent = '\u23f3 Historique';
    wrap.insertBefore(titleDiv, wrap.firstChild);
    lsReq.parentNode.insertBefore(wrap, lsReq.nextSibling);
  }

  /* ── Main client render ──────────────────────────────── */
  function _renderClient() {
    // Wait for P1 to finish its render, then upgrade
    setTimeout(_upgradeClientCards, 100);
    _createClientHistory();
    _renderClientHistory();
  }

  /* ════════════════════════════════════════════════════════
     ── SHARED: EVENT LISTENERS + INIT ───────────────────
     ════════════════════════════════════════════════════════ */

  function _render() {
    if (PAGE === 'artisan') _renderArtisan();
    if (PAGE === 'client')  _renderClient();
  }

  function _bindListeners() {
    var events = [
      'fixeo:client-request-updated',
      'fixeo:client-request-created',
      'fixeo:missions:updated',
      'fixeo:state:updated',
      'fixeo:mission-started',
      'fixeo:mission-completed',
      'fixeo:mission-validated'
    ];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() { setTimeout(_render, 150); });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY) setTimeout(_render, 100);
    });
    setInterval(_render, 30000);
  }

  function init() {
    if (PAGE === 'artisan') {
      _createArtisanContainer();
      setTimeout(function() {
        _renderArtisan();
        _bindListeners();
      }, 250);
    }
    if (PAGE === 'client') {
      setTimeout(function() {
        _renderClient();
        _bindListeners();
      }, 500); // after P1's 350ms init
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
