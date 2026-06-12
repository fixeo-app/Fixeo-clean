/**
 * FIXEO Artisan Dashboard V3 — fxadv3-v1a
 * =====================================================
 * Pure additive enhancement layer over V2 dashboard.
 * Reads window.FixeoArtisanV2._state (read-only).
 * Zero modifications to V2 action handlers.
 * Zero DB writes. Zero fake data.
 *
 * INJECTS:
 *   Block 1 — Mission Control Hero (#fxadv3-hero-wrap)
 *   Block 2 — Quick Actions bar (#fxadv3-qa)
 *   Block 3 — Earnings card (#fxadv3-earnings)
 *   Block 4 — Trust/Performance card (#fxadv3-perf)
 *   Block 5 — Smart Tips (#fxadv3-tips)
 *   Block 6 — Notification Bell (replaces header placeholder)
 *   Block 7 — Mission card enrichment (urgency + price + commission)
 *
 * NEVER MODIFIES:
 *   fixeo-artisan-dashboard-v2.js, commission-lifecycle-p3a.js,
 *   fixeo-supabase-core.js, auth-global.js, fixeo-auth-guard.js,
 *   supabase-client.js, fixeo-notification-engine.js,
 *   fixeo-notifications-real-v1.js
 *
 * Version: fxadv3-v1a
 */

(function (window, document) {
  'use strict';

  if (window._fxAdV3Loaded) return;
  window._fxAdV3Loaded = true;

  var VERSION = 'fxadv3-v1a';

  /* ══════════════════════════════════════════════════════════
     PRICING MAP — mirrors fxrv3 (no import, inline)
  ══════════════════════════════════════════════════════════ */

  var CAT_PRICE_RANGE = {
    plomberie:    '150–350 MAD',
    electricite:  '100–400 MAD',
    serrurerie:   '150–400 MAD',
    climatisation:'200–900 MAD',
    menuiserie:   '150–900 MAD',
    peinture:     '800–2500 MAD',
    maconnerie:   '200–800 MAD',
    nettoyage:    '200–600 MAD',
    carrelage:    '150–600 MAD',
    jardinage:    '150–500 MAD',
    bricolage:    '100–400 MAD',
    demenagement: '500–2000 MAD',
  };

  /* Urgent keywords for NLP on description */
  var URGENT_KW = ['urgent', 'urgence', 'fuite', 'panne', 'bloqué', 'bloque',
                   'court-circuit', 'gaz', 'inondation', 'cassé', 'casse',
                   'débouche', 'debouche', 'explosion'];
  var URGENT_CATS = ['plomberie', 'serrurerie', 'electricite', 'electricité'];

  /* Session storage key for dismissed tips */
  var TIPS_SEEN_KEY = 'fxadv3_tips_seen';

  /* ══════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════ */

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s || '')));
    return d.innerHTML;
  }

  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function firstWord(s) {
    return String(s || '').trim().split(' ')[0] || 'Artisan';
  }

  function plural(n, singular, pluralStr) {
    return n + ' ' + (n <= 1 ? singular : (pluralStr || singular + 's'));
  }

  function _isUrgent(req) {
    if (!req) return false;
    var cat  = norm(req.service_category || req.category || '');
    var desc = norm(req.description || '');
    if (URGENT_CATS.some(function(k) { return cat.includes(k); })) {
      return URGENT_KW.some(function(k) { return desc.includes(k); }) || false;
    }
    return URGENT_KW.some(function(k) { return desc.includes(k) || cat.includes(k); });
  }

  function _getCatPrice(cat) {
    var k = norm(cat || '');
    for (var key in CAT_PRICE_RANGE) {
      if (k.includes(norm(key))) return CAT_PRICE_RANGE[key];
    }
    return null;
  }

  function _getV2State() {
    try {
      var api = window.FixeoArtisanV2;
      if (!api || !api._state) return null;
      return api._state;
    } catch(e) { return null; }
  }

  /* Revenue calculation from state.myMissions */
  function _computeEarnings(missions) {
    var now = Date.now();
    var dayStart  = now - 24  * 60 * 60 * 1000;
    var weekStart = now - 7   * 24 * 60 * 60 * 1000;

    var today = 0, week = 0, totalDone = 0, commissionDue = 0, pendingRevenue = 0;

    (missions || []).forEach(function(m) {
      var sr  = m._request;
      var st  = String((sr && sr.status) || m.status || '').toLowerCase();
      var price = Math.max(
        Number((sr && sr.final_price) || 0),
        Number(m.agreed_price || 0)
      );
      var ts = new Date((sr && sr.created_at) || m.created_at || 0).getTime();

      if (st === 'validated' && price > 0) {
        var net = Math.round(price * 0.85);
        var comm = Math.round(price * 0.15);
        totalDone++;
        commissionDue += comm;   /* commission already settled on validated */
        week += net;
        if (ts >= dayStart) today += net;
      } else if ((st === 'completed' || st === 'done') && price > 0) {
        /* Completed but not yet validated — pending revenue */
        pendingRevenue += Math.round(price * 0.85);
        totalDone++;
      }
    });

    return { today: today, week: week, totalDone: totalDone,
             commissionDue: commissionDue, pendingRevenue: pendingRevenue };
  }

  /* Derive trust score honestly when DB value is 0 */
  function _deriveTrust(ap) {
    if (!ap) return 0;
    var t = parseFloat(ap.trust_score) || 0;
    if (t > 0) return Math.min(100, Math.round(t));
    var s = 40;
    if (ap.verified || ap.is_verified)   s += 20;
    var done = Number(ap.completed_missions || 0);
    s += Math.min(20, Math.round(done * 0.2));
    if (ap.description) s += 10;
    var rating = parseFloat(ap.rating || 0);
    if (rating >= 4.5) s += 10;
    else if (rating >= 4.0) s += 5;
    return Math.min(100, s);
  }

  /* Stars string */
  function _stars(rating) {
    var r = Math.round(Number(rating || 0) * 2) / 2;
    var s = '';
    for (var i = 1; i <= 5; i++) {
      if (r >= i) s += '★';
      else if (r >= i - 0.5) s += '½';
      else s += '☆';
    }
    return s;
  }

  /* Smart tips: returns array of {type, icon, title, sub, id} */
  function _computeTips(ap, state) {
    if (!ap) return [];
    var tips = [];
    var openCount = (state.openRequests || []).length;

    /* T1 — response time */
    var rt = parseInt(ap.response_time_min || 0, 10);
    if (rt > 30) {
      tips.push({
        id: 'response-time', type: 'urgent', icon: '⚡',
        title: 'Répondez plus vite',
        sub: 'Votre temps de réponse est de ~' + rt + ' min. Répondre sous 10 min améliore votre classement.'
      });
    }

    /* T2 — incomplete profile */
    if (!ap.description) {
      tips.push({
        id: 'no-description', type: 'warn', icon: '✏️',
        title: 'Profil incomplet',
        sub: 'Ajoutez une description pour apparaître dans plus de résultats de recherche.'
      });
    }

    /* T3 — not verified */
    if (!ap.verified && !ap.is_verified) {
      tips.push({
        id: 'not-verified', type: 'warn', icon: '🛡️',
        title: 'Profil non vérifié',
        sub: 'Vérifiez votre profil pour accéder aux missions prioritaires Fixeo.'
      });
    }

    /* T4 — available requests */
    if (openCount > 0) {
      tips.push({
        id: 'open-requests', type: 'success', icon: '📬',
        title: plural(openCount, 'demande disponible', 'demandes disponibles') + ' dans votre ville',
        sub: 'Répondez rapidement pour augmenter vos chances d\'être sélectionné.'
      });
    }

    /* T5 — low rating */
    var rating = parseFloat(ap.rating || 0);
    if (rating > 0 && rating < 3.5) {
      tips.push({
        id: 'low-rating', type: 'urgent', icon: '⭐',
        title: 'Note en dessous de la moyenne',
        sub: 'Assurez un bon suivi client et terminez les missions à temps pour améliorer votre note.'
      });
    }

    /* T6 — top artisan encouragement */
    var done = Number(ap.completed_missions || 0);
    if (done >= 10 && rating >= 4.5) {
      tips.push({
        id: 'top-artisan', type: 'success', icon: '🏆',
        title: 'Vous faites partie des meilleurs artisans Fixeo',
        sub: 'Continuez comme ça — les clients vous recommandent activement.'
      });
    }

    /* Filter dismissed tips */
    var seen = [];
    try { seen = JSON.parse(sessionStorage.getItem(TIPS_SEEN_KEY) || '[]'); } catch(e) {}
    tips = tips.filter(function(t) { return seen.indexOf(t.id) === -1; });

    /* Max 2 tips shown */
    return tips.slice(0, 2);
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 6 — NOTIFICATION BELL
  ══════════════════════════════════════════════════════════ */

  function _injectBell() {
    /* The header right div currently has: <!-- notification bell placeholder --> */
    var header = document.querySelector('.fxa-header');
    if (!header) return;

    /* Find the rightmost div (3rd child: hamburger / logo / right-div) */
    var rightDiv = header.children[2];
    if (!rightDiv || el('fxadv3-bell')) return; /* already injected */

    /* Create bell button */
    var bell = document.createElement('button');
    bell.id = 'fxadv3-bell';
    bell.className = 'notif-btn notif-bell'; /* matches existing notification system */
    bell.setAttribute('aria-label', 'Notifications');
    bell.innerHTML = '🔔<span class="fxadv3-badge notif-badge" aria-label="notifications non lues"></span>';

    rightDiv.innerHTML = '';
    rightDiv.appendChild(bell);

    /* Refresh badge from window.FixeoNotificationsV1 if available */
    _refreshBell();

    /* Listen for notification store updates */
    window.addEventListener('fixeo:notifications:updated', _refreshBell);
  }

  function _refreshBell() {
    var badge = document.querySelector('#fxadv3-bell .fxadv3-badge');
    if (!badge) return;
    try {
      var sys = window.FixeoNotificationsV1;
      if (sys && typeof sys.getUnreadCount === 'function') {
        var cnt = sys.getUnreadCount();
        badge.textContent = cnt > 99 ? '99+' : (cnt > 0 ? String(cnt) : '');
        badge.classList.toggle('visible', cnt > 0);
      }
    } catch(e) {}
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 1 — MISSION CONTROL HERO
  ══════════════════════════════════════════════════════════ */

  function _buildHero(state) {
    var ap      = state.artisanProfile || {};
    var name    = firstWord(ap.full_name || ap.name || state.profile && state.profile.full_name || '');
    var avail   = norm(ap.availability || '');
    var openReqs = state.openRequests || [];
    var missions = state.myMissions  || [];

    /* Availability pill */
    var availClass = 'offline', availLabel = 'Hors ligne', availDot = '';
    if (avail === 'available')  { availClass = 'available'; availLabel = 'Disponible'; }
    else if (avail === 'busy')  { availClass = 'busy';      availLabel = 'Occupé'; }
    availDot = '<span class="fxadv3-avail-dot" aria-hidden="true"></span>';

    var pillHtml = '<span class="fxadv3-avail-pill ' + availClass + '">'
      + availDot + esc(availLabel) + '</span>';

    /* Active missions */
    var activeMissions = missions.filter(function(m) {
      var st = norm((m._request && m._request.status) || m.status || '');
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours';
    });
    var inProgressMissions = missions.filter(function(m) {
      var st = norm((m._request && m._request.status) || m.status || '');
      return st === 'in_progress' || st === 'en_cours';
    });

    /* Situation pills */
    var urgentOpen = openReqs.filter(function(r) { return _isUrgent(r); });
    var sitHtml = '<div class="fxadv3-situation">'
      + '<div class="fxadv3-sit-pill">'
      + '<span class="fxadv3-sit-num">' + openReqs.length + '</span>'
      + '<span class="fxadv3-sit-label">Disponibles</span>'
      + '</div>'
      + '<div class="fxadv3-sit-pill">'
      + '<span class="fxadv3-sit-num">' + activeMissions.length + '</span>'
      + '<span class="fxadv3-sit-label">En cours</span>'
      + '</div>';
    if (urgentOpen.length > 0) {
      sitHtml += '<div class="fxadv3-sit-pill urgent-pill">'
        + '<span class="fxadv3-sit-num urgent-num">' + urgentOpen.length + '</span>'
        + '<span class="fxadv3-sit-label">Urgentes</span>'
        + '</div>';
    }
    sitHtml += '</div>';

    /* Spotlight: show active in_progress > pending > best open request */
    var spotHtml = '';
    var primaryBtn = '';

    if (inProgressMissions.length > 0) {
      var m = inProgressMissions[0];
      var sr = m._request || {};
      var cat = esc(sr.service_category || m.service_category || 'Mission');
      var city = sr.city ? '📍 ' + esc(sr.city) : '';
      var isUrgentMission = _isUrgent(sr);
      spotHtml = '<div class="fxadv3-spotlight' + (isUrgentMission ? ' urgent-spot' : '') + '">'
        + '<div class="fxadv3-spot-head">'
        + '<span class="fxadv3-spot-service">⚡ ' + cat + '</span>'
        + (city ? '<span class="fxadv3-spot-city">' + city + '</span>' : '')
        + (isUrgentMission ? '<span class="fxadv3-urgent-badge">🚨 Urgent</span>' : '')
        + '</div>'
        + (sr.description ? '<div class="fxadv3-spot-desc">' + esc(sr.description.slice(0, 120)) + '</div>' : '')
        + '</div>';
      var reqId = (m._request && m._request.id) || m.request_id || '';
      primaryBtn = '<button class="fxadv3-hero-btn success" id="fxadv3-primary-btn" '
        + 'data-v3-action="complete" data-req-id="' + esc(reqId) + '">'
        + '✓ Marquer terminée</button>';

    } else if (activeMissions.length > 0) {
      var m2 = activeMissions[0];
      var sr2 = m2._request || {};
      var cat2 = esc(sr2.service_category || m2.service_category || 'Mission');
      var city2 = sr2.city ? '📍 ' + esc(sr2.city) : '';
      spotHtml = '<div class="fxadv3-spotlight">'
        + '<div class="fxadv3-spot-head">'
        + '<span class="fxadv3-spot-service">⚡ ' + cat2 + '</span>'
        + (city2 ? '<span class="fxadv3-spot-city">' + city2 + '</span>' : '')
        + '</div>'
        + '</div>';
      var reqId2 = (m2._request && m2._request.id) || m2.request_id || '';
      primaryBtn = '<button class="fxadv3-hero-btn primary" id="fxadv3-primary-btn" '
        + 'data-v3-action="start" data-req-id="' + esc(reqId2) + '">'
        + '▶ Démarrer l\'intervention</button>';

    } else if (urgentOpen.length > 0) {
      var uReq = urgentOpen[0];
      var uCat = esc(uReq.service_category || 'Urgence');
      var uCity = uReq.city ? '📍 ' + esc(uReq.city) : '';
      spotHtml = '<div class="fxadv3-spotlight urgent-spot">'
        + '<div class="fxadv3-spot-head">'
        + '<span class="fxadv3-spot-service">' + uCat + '</span>'
        + (uCity ? '<span class="fxadv3-spot-city">' + uCity + '</span>' : '')
        + '<span class="fxadv3-urgent-badge">🚨 Urgent</span>'
        + '</div>'
        + (uReq.description ? '<div class="fxadv3-spot-desc">' + esc(uReq.description.slice(0, 100)) + '</div>' : '')
        + '</div>';
      primaryBtn = '<button class="fxadv3-hero-btn primary" id="fxadv3-primary-btn" '
        + 'data-v3-action="accept" data-req-id="' + esc(uReq.id) + '">'
        + '✅ Accepter cette mission</button>';

    } else if (openReqs.length > 0) {
      var bReq = openReqs[0];
      var bCat = esc(bReq.service_category || 'Demande');
      var bCity = bReq.city ? '📍 ' + esc(bReq.city) : '';
      spotHtml = '<div class="fxadv3-spotlight">'
        + '<div class="fxadv3-spot-head">'
        + '<span class="fxadv3-spot-service">' + bCat + '</span>'
        + (bCity ? '<span class="fxadv3-spot-city">' + bCity + '</span>' : '')
        + '</div>'
        + (bReq.description ? '<div class="fxadv3-spot-desc">' + esc(bReq.description.slice(0, 100)) + '</div>' : '')
        + '</div>';
      primaryBtn = '<button class="fxadv3-hero-btn primary" id="fxadv3-primary-btn" '
        + 'data-v3-action="accept" data-req-id="' + esc(bReq.id) + '">'
        + '✅ Accepter cette mission</button>';
    } else {
      primaryBtn = '<button class="fxadv3-hero-btn ghost" id="fxadv3-primary-btn" '
        + 'data-v3-action="nav-available">'
        + '📬 Voir les demandes disponibles</button>';
    }

    var wrap = document.createElement('div');
    wrap.id = 'fxadv3-hero-wrap';
    wrap.innerHTML = '<div class="fxadv3-hero">'
      + '<div class="fxadv3-hero-top">'
      + '<span class="fxadv3-greeting">Bonjour ' + esc(name) + ' 👋</span>'
      + pillHtml
      + '</div>'
      + sitHtml
      + spotHtml
      + primaryBtn
      + '</div>';

    return wrap;
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 2 — QUICK ACTIONS
  ══════════════════════════════════════════════════════════ */

  function _buildQuickActions(state) {
    var open   = (state.openRequests || []).length;
    var active = (state.myMissions  || []).filter(function(m) {
      var st = norm((m._request && m._request.status) || m.status || '');
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours';
    }).length;

    function qaBtn(section, icon, label, count) {
      var badge = count > 0
        ? '<span class="fxadv3-qa-count show">' + count + '</span>' : '';
      return '<button class="fxadv3-qa-btn" data-v3-nav="' + section + '">'
        + badge
        + '<span class="fxadv3-qa-icon">' + icon + '</span>'
        + '<span class="fxadv3-qa-label">' + label + '</span>'
        + '</button>';
    }

    var div = document.createElement('div');
    div.id = 'fxadv3-qa';
    div.className = 'fxadv3-quick-actions';
    div.innerHTML = qaBtn('available', '📬', 'Disponibles', open)
      + qaBtn('missions',  '⚡', 'En cours',   active)
      + qaBtn('history',   '💰', 'Revenus',    0)
      + qaBtn('profile',   '👤', 'Profil',     0);
    return div;
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 3 — EARNINGS CARD
  ══════════════════════════════════════════════════════════ */

  function _buildEarnings(state) {
    var e = _computeEarnings(state.myMissions || []);

    function fmt(n) {
      return n > 0 ? n.toLocaleString('fr-FR') + ' MAD' : '0 MAD';
    }

    var div = document.createElement('div');
    div.id = 'fxadv3-earnings';
    div.className = 'fxadv3-card';
    div.innerHTML = '<div class="fxadv3-card-head">'
      + '<span class="fxadv3-card-title">💰 Mes revenus</span>'
      + '<button class="fxadv3-card-link" data-v3-nav="history">Historique →</button>'
      + '</div>'
      + '<div class="fxadv3-earnings-grid">'
      + '<div class="fxadv3-earn-cell">'
      + '<span class="fxadv3-earn-val green">' + fmt(e.today) + '</span>'
      + '<span class="fxadv3-earn-label">Aujourd\'hui</span>'
      + '</div>'
      + '<div class="fxadv3-earn-cell">'
      + '<span class="fxadv3-earn-val green">' + fmt(e.week) + '</span>'
      + '<span class="fxadv3-earn-label">Cette semaine</span>'
      + '</div>'
      + '<div class="fxadv3-earn-cell">'
      + '<span class="fxadv3-earn-val">' + e.totalDone + '</span>'
      + '<span class="fxadv3-earn-label">Missions termin\u00e9es</span>'
      + '</div>'
      + '<div class="fxadv3-earn-cell">'
      + '<span class="fxadv3-earn-val orange">' + fmt(e.pendingRevenue) + '</span>'
      + '<span class="fxadv3-earn-label">En attente</span>'
      + '</div>'
      + '</div>'
      + (e.commissionDue > 0
         ? '<div class="fxadv3-earn-divider"></div>'
           + '<div class="fxadv3-commission-row">'
           + '<span class="fxadv3-commission-label">Commission Fixeo r\u00e8gl\u00e9e (15 %)</span>'
           + '<span class="fxadv3-commission-val">' + fmt(e.commissionDue) + '</span>'
           + '</div>'
         : '');
    return div;
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 4 — TRUST / PERFORMANCE CARD
  ══════════════════════════════════════════════════════════ */

  function _buildPerformance(state) {
    var ap = state.artisanProfile || {};
    var rating  = parseFloat(ap.rating || 0);
    var done    = Number(ap.completed_missions || 0);
    var reviews = Number(ap.review_count || 0);
    var rt      = parseInt(ap.response_time_min || 0, 10);
    var trust   = _deriveTrust(ap);
    var verified= ap.verified || ap.is_verified;

    var trustClass = trust >= 75 ? '' : (trust >= 50 ? 'mid' : 'low');

    var div = document.createElement('div');
    div.id = 'fxadv3-perf';
    div.className = 'fxadv3-card';
    div.innerHTML = '<div class="fxadv3-card-head">'
      + '<span class="fxadv3-card-title">⭐ Performance</span>'
      + '</div>'
      + '<div class="fxadv3-perf-grid">'
      + '<div class="fxadv3-perf-cell">'
      + '<span class="fxadv3-perf-val">'
        + (rating >= 1 ? rating.toFixed(1) + ' ' + _stars(rating) : '—') + '</span>'
      + '<span class="fxadv3-perf-sub">' + (reviews > 0 ? reviews + ' avis' : 'Aucun avis') + '</span>'
      + '</div>'
      + '<div class="fxadv3-perf-cell">'
      + '<span class="fxadv3-perf-val">' + done + '</span>'
      + '<span class="fxadv3-perf-sub">Missions</span>'
      + '</div>'
      + '<div class="fxadv3-perf-cell">'
      + '<span class="fxadv3-perf-val">' + (rt > 0 ? '~' + rt + ' min' : '—') + '</span>'
      + '<span class="fxadv3-perf-sub">R\u00e9ponse</span>'
      + '</div>'
      + '<div class="fxadv3-perf-cell">'
      + '<span class="fxadv3-perf-val">' + trust + '/100</span>'
      + '<span class="fxadv3-perf-sub">Score Fixeo</span>'
      + '</div>'
      + '</div>'
      /* Trust meter */
      + '<div class="fxadv3-trust-label">'
      + '<span class="fxadv3-trust-label-text">Score de confiance</span>'
      + '<span class="fxadv3-trust-score-num" id="fxadv3-trust-num">' + trust + ' / 100</span>'
      + '</div>'
      + '<div class="fxadv3-trust-track">'
      + '<div class="fxadv3-trust-fill ' + trustClass + '" id="fxadv3-trust-fill" style="width:0%"></div>'
      + '</div>'
      /* Badges */
      + '<div class="fxadv3-badges-row">'
      + (verified ? '<span class="fxadv3-badge-chip verified">✓ V\u00e9rifi\u00e9</span>' : '')
      + (done >= 10 ? '<span class="fxadv3-badge-chip">🏅 ' + done + ' missions</span>' : '')
      + (rating >= 4.5 ? '<span class="fxadv3-badge-chip top">⭐ Top not\u00e9</span>' : '')
      + '</div>';

    return div;
  }

  function _animateTrustFill(trust) {
    /* rAF double-frame to ensure the element is painted before transition */
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var fill = el('fxadv3-trust-fill');
        if (fill) fill.style.width = Math.min(100, trust) + '%';
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 5 — SMART TIPS
  ══════════════════════════════════════════════════════════ */

  function _buildTips(state) {
    var tips = _computeTips(state.artisanProfile, state);
    if (!tips.length) return null;

    var div = document.createElement('div');
    div.id = 'fxadv3-tips';
    div.className = 'fxadv3-card';
    div.innerHTML = '<div class="fxadv3-card-head">'
      + '<span class="fxadv3-card-title">💡 Conseil Fixeo</span>'
      + '</div>'
      + '<div class="fxadv3-tips-list">'
      + tips.map(function(t) {
          return '<div class="fxadv3-tip tip-' + esc(t.type) + '" data-tip-id="' + esc(t.id) + '">'
            + '<span class="fxadv3-tip-icon">' + t.icon + '</span>'
            + '<div class="fxadv3-tip-body">'
            + '<div class="fxadv3-tip-title">' + esc(t.title) + '</div>'
            + '<div class="fxadv3-tip-sub">' + esc(t.sub) + '</div>'
            + '</div>'
            + '<button class="fxadv3-tip-dismiss" data-tip-dismiss="' + esc(t.id) + '" '
            + 'aria-label="Ignorer ce conseil">\u00d7</button>'
            + '</div>';
        }).join('')
      + '</div>';
    return div;
  }

  /* ══════════════════════════════════════════════════════════
     BLOCK 7 — MISSION CARD ENRICHMENT
     Adds urgency badge + estimated price chip + commission
     to cards already rendered by V2 in .fxa-card-list
  ══════════════════════════════════════════════════════════ */

  function _enrichMissionCards() {
    var cards = document.querySelectorAll('.fxa-card:not([data-fxadv3-enriched])');
    cards.forEach(function(card) {
      card.setAttribute('data-fxadv3-enriched', '1');

      /* Read request-id from child accept button or from card data */
      var catEl = card.querySelector('.fxa-card-service');
      var cat   = catEl ? norm(catEl.textContent) : '';

      /* Estimate price from category */
      var priceRange = _getCatPrice(cat);

      /* Urgency: check description text */
      var descEl = card.querySelector('.fxa-card-desc');
      var descText = descEl ? norm(descEl.textContent) : '';
      var isUrgent = URGENT_KW.some(function(k) { return descText.includes(k); })
        || (URGENT_CATS.some(function(k) { return cat.includes(k); })
            && descText.length > 0);

      if (!priceRange && !isUrgent) return; /* nothing to add */

      /* Find or build enrichment row — insert before .fxa-actions */
      var actionsEl = card.querySelector('.fxa-actions');
      if (!actionsEl) return;

      var enrich = document.createElement('div');
      enrich.className = 'fxadv3-card-enrichment';

      if (isUrgent) {
        enrich.innerHTML += '<span class="fxadv3-urgency-chip">🚨 Urgent</span>';
      }
      if (priceRange) {
        /* Rough commission estimate: ~15% of midpoint */
        var parts = priceRange.match(/(\d+)[–-](\d+)/);
        var commStr = '';
        if (parts) {
          var mid = Math.round((parseInt(parts[1], 10) + parseInt(parts[2], 10)) / 2);
          commStr = '~' + Math.round(mid * 0.85).toLocaleString('fr-FR') + ' MAD pour vous';
        }
        enrich.innerHTML += '<span class="fxadv3-price-chip">💰 ' + esc(priceRange) + '</span>';
        if (commStr) {
          enrich.innerHTML += '<span class="fxadv3-commission-chip">' + esc(commStr) + '</span>';
        }
      }

      card.insertBefore(enrich, actionsEl);
    });
  }

  /* ══════════════════════════════════════════════════════════
     INJECT — build and insert blocks into V2 DOM
  ══════════════════════════════════════════════════════════ */

  function _inject(state) {
    var sec = el('fxav2-sec-dashboard');
    if (!sec || !sec.classList.contains('active')) return; /* only enrich visible section */

    /* Block 1 — Hero: insert before .fxa-kpi-bar */
    var kpiBar = el('fxav2-kpi-bar');
    if (kpiBar && !el('fxadv3-hero-wrap')) {
      var hero = _buildHero(state);
      kpiBar.parentNode.insertBefore(hero, kpiBar);
    } else if (el('fxadv3-hero-wrap')) {
      /* Refresh: replace existing hero */
      var oldHero = el('fxadv3-hero-wrap');
      var newHero = _buildHero(state);
      oldHero.parentNode.replaceChild(newHero, oldHero);
    }

    /* Block 2 — Quick actions: insert after kpi-bar */
    if (kpiBar && !el('fxadv3-qa')) {
      var qa = _buildQuickActions(state);
      kpiBar.parentNode.insertBefore(qa, kpiBar.nextSibling);
    } else if (el('fxadv3-qa')) {
      var oldQa = el('fxadv3-qa');
      var newQa = _buildQuickActions(state);
      oldQa.parentNode.replaceChild(newQa, oldQa);
    }

    /* Blocks 3–5 inject into dashboard section content — after fxa-content div */
    var content = sec.querySelector('.fxa-card-list') || sec;

    if (!el('fxadv3-earnings')) {
      var earningsEl = _buildEarnings(state);
      sec.appendChild(earningsEl);
    } else {
      var oldEarn = el('fxadv3-earnings');
      var newEarn = _buildEarnings(state);
      oldEarn.parentNode.replaceChild(newEarn, oldEarn);
    }

    if (!el('fxadv3-perf')) {
      var perfEl = _buildPerformance(state);
      sec.appendChild(perfEl);
      /* Animate trust fill after paint */
      var trust = _deriveTrust(state.artisanProfile || {});
      _animateTrustFill(trust);
    } else {
      /* Refresh performance block */
      var oldPerf = el('fxadv3-perf');
      var newPerf = _buildPerformance(state);
      oldPerf.parentNode.replaceChild(newPerf, oldPerf);
      _animateTrustFill(_deriveTrust(state.artisanProfile || {}));
    }

    if (!el('fxadv3-tips')) {
      var tipsEl = _buildTips(state);
      if (tipsEl) sec.appendChild(tipsEl);
    }

    /* Block 7 — enrich cards across all visible sections */
    _enrichMissionCards();
  }

  /* ══════════════════════════════════════════════════════════
     EVENT BINDING
  ══════════════════════════════════════════════════════════ */

  function _bindV3Events() {
    document.addEventListener('click', function(e) {

      /* Quick action navigation */
      var qaBtn = e.target.closest('[data-v3-nav]');
      if (qaBtn) {
        var section = qaBtn.getAttribute('data-v3-nav');
        /* Trigger V2 nav — click the matching bottom nav button */
        var navBtn = document.querySelector('.fxa-bottom-btn[data-section="' + section + '"], '
          + '.fxa-nav-link[data-section="' + section + '"]');
        if (navBtn) navBtn.click();
        return;
      }

      /* Hero primary button actions */
      var heroBtn = e.target.closest('#fxadv3-primary-btn');
      if (heroBtn) {
        var action = heroBtn.getAttribute('data-v3-action');
        var reqId  = heroBtn.getAttribute('data-req-id');

        if (action === 'nav-available') {
          var availNav = document.querySelector('.fxa-nav-link[data-section="available"], '
            + '.fxa-bottom-btn[data-section="available"]');
          if (availNav) availNav.click();
          return;
        }

        /* Delegate to V2 via existing action dispatch mechanism */
        if (action === 'accept' && reqId) {
          /* Find the accept button for this request in V2 DOM and click it */
          var acceptBtn = document.querySelector('[data-action="accept-mission"][data-req-id="' + reqId + '"]');
          if (acceptBtn) { acceptBtn.click(); return; }
        }
        if (action === 'start' && reqId) {
          var startBtn = document.querySelector('[data-action="start-mission"][data-req-id="' + reqId + '"]');
          if (startBtn) { startBtn.click(); return; }
        }
        if (action === 'complete' && reqId) {
          var completeBtn = document.querySelector('[data-action="complete-mission"][data-req-id="' + reqId + '"]');
          if (completeBtn) { completeBtn.click(); return; }
        }

        /* Fallback: use FixeoArtisanV2 public API */
        if (window.FixeoArtisanV2 && reqId) {
          if (action === 'accept')   window.FixeoArtisanV2.acceptMission(reqId, heroBtn);
          if (action === 'start')    window.FixeoArtisanV2.startMission(reqId, heroBtn);
          if (action === 'complete') window.FixeoArtisanV2.completeMission(reqId, heroBtn);
        }
        return;
      }

      /* Card link navigation */
      var cardLink = e.target.closest('[data-v3-nav]');
      if (cardLink) {
        var sec2 = cardLink.getAttribute('data-v3-nav');
        var nb = document.querySelector('.fxa-nav-link[data-section="' + sec2 + '"]');
        if (nb) nb.click();
        return;
      }

      /* Tip dismiss */
      var dismissBtn = e.target.closest('[data-tip-dismiss]');
      if (dismissBtn) {
        var tipId = dismissBtn.getAttribute('data-tip-dismiss');
        /* Save to sessionStorage */
        try {
          var seen = JSON.parse(sessionStorage.getItem(TIPS_SEEN_KEY) || '[]');
          if (seen.indexOf(tipId) === -1) seen.push(tipId);
          sessionStorage.setItem(TIPS_SEEN_KEY, JSON.stringify(seen));
        } catch(e2) {}
        /* Hide the tip */
        var tipEl = document.querySelector('.fxadv3-tip[data-tip-id="' + tipId + '"]');
        if (tipEl) {
          tipEl.style.opacity = '0';
          tipEl.style.transition = 'opacity 0.2s';
          setTimeout(function() {
            if (tipEl.parentNode) {
              tipEl.parentNode.removeChild(tipEl);
              /* If no more tips, remove tips card */
              var tipsCard = el('fxadv3-tips');
              if (tipsCard && !tipsCard.querySelectorAll('.fxadv3-tip').length) {
                tipsCard.parentNode.removeChild(tipsCard);
              }
            }
          }, 200);
        }
        return;
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     OBSERVE V2 SECTION RENDERS
     V2 calls _render() which sets innerHTML on sections.
     MutationObserver catches the re-renders and re-enriches.
  ══════════════════════════════════════════════════════════ */

  function _watchV2Renders() {
    /* Watch the main content area — V2 sets innerHTML on sections */
    var main = el('fxav2-main');
    if (!main) return;

    var observer = new MutationObserver(function() {
      /* Re-enrich cards whenever V2 renders */
      setTimeout(function() {
        var state = _getV2State();
        if (state) _inject(state);
        _enrichMissionCards();
        _refreshBell();
      }, 80); /* 80ms after V2 render settles */
    });

    observer.observe(main, { childList: true, subtree: true, characterData: false });
  }

  /* ══════════════════════════════════════════════════════════
     INIT — wait for FixeoArtisanV2 to be ready
  ══════════════════════════════════════════════════════════ */

  function _tryInit() {
    var state = _getV2State();
    /* V2 state is populated after _fetch() + _render() complete.
     * We need artisanProfile loaded (or at least session) to render. */
    if (!state || !state.session) return false;

    /* Inject bell immediately (doesn't need artisanProfile) */
    _injectBell();

    /* Only inject content blocks once artisanProfile is set
     * (may be null for unclaimed accounts — still inject earnings/tips) */
    _inject(state);
    return true;
  }

  function _boot() {
    /* Wire events once */
    _bindV3Events();
    _watchV2Renders();

    /* Try immediately */
    if (_tryInit()) return;

    /* Poll until V2 state has session — 300ms × 30 = 9s cap */
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      if (_tryInit() || attempts >= 30) {
        clearInterval(poll);
        /* Wire bell regardless */
        _injectBell();
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    /* V2 script is deferred — give it a tick to register its DOMContentLoaded handler */
    setTimeout(_boot, 0);
  }

  /* Public API */
  window.FixeoArtisanV3 = {
    VERSION: VERSION,
    refresh: function() {
      var state = _getV2State();
      if (state) _inject(state);
    }
  };

  console.log('[FixeoArtisanV3] ' + VERSION + ' loaded');

})(window, document);
