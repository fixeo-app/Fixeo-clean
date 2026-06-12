/**
 * FIXEO Smart Dispatch Engine V2
 * File: js/fixeo-dispatch-engine-v2.js
 * Version: v2a — 2026-06-12
 * ─────────────────────────────────────────────────────────────
 * ADDITIVE upgrade over V1 (fixeo-dispatch-engine.js?v=v1b).
 * Reads V1 scoring functions via window.FixeoDispatch.
 *
 * NEW IN V2:
 *   S1  Response-time dimension in scoring
 *   S2  Urgency mode (weight re-balance for urgent categories)
 *   S3  Negative modifiers (offline filter, low rating, unclaimed)
 *   S4  Human-readable ranking reason per artisan
 *   S5  Auto-redispatch monitor (30-min timeout → admin alert)
 *   S6  Enhanced suggestions UI (urgency banner, reason tags, V2 badge)
 *
 * GUARD: window.FixeoDispatchV2 (idempotent)
 * ZERO modifications to: fixeo-dispatch-engine.js, admin V3, notifications
 * NO Supabase schema changes required
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoDispatchV2) return;

  var VERSION = 'v2a';
  var LOG     = '[FixeoDispatchV2]';

  /* ─── Wait for V1 before extending ─────────────────────────── */
  var _v1WaitAttempts = 0;
  var _v1WaitTimer = setInterval(function () {
    _v1WaitAttempts++;
    if (window.FixeoDispatch) {
      clearInterval(_v1WaitTimer);
      _boot();
    }
    if (_v1WaitAttempts > 40) { /* 10s give-up */
      clearInterval(_v1WaitTimer);
      console.warn(LOG, 'V1 not found — V2 init aborted');
    }
  }, 250);

  /* ═══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */

  /* URGENT categories — matches Admin Command Center V3 URGENT_CATS */
  var URGENT_CATS = ['serrurerie', 'plomberie', 'electricite', 'electrique',
    'chauffage', 'urgence', 'fuite', 'panne', 'gaz', 'debouchage'];

  /* Auto-redispatch timeout (ms) — 30 min */
  var REDISPATCH_TIMEOUT_MS = 30 * 60 * 1000;

  /* Normal scoring weights (must sum to 100) */
  var W_NORMAL = {
    service:      30,
    city:         30,
    availability: 15,
    trust:        10,
    responseTime:  8,
    performance:   4,
    activity:      3
  };

  /* Urgency scoring weights (must sum to 100) */
  var W_URGENT = {
    service:      25,
    city:         25,
    availability: 30,
    trust:         5,
    responseTime: 12,
    performance:   2,
    activity:      1
  };

  /* ═══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').trim();
  }

  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _isUrgentRequest(r) {
    var text = _norm((r.service_category || '') + ' ' + (r.description || '') + ' ' + (r.urgency || ''));
    if (r.urgency && String(r.urgency).toLowerCase().includes('urgent')) return true;
    return URGENT_CATS.some(function (k) { return text.includes(k); });
  }

  function _reqSummary(r) {
    return (r.service_category || r.service || 'Demande') + ' — ' + (r.city || '');
  }

  /* ═══════════════════════════════════════════════════════════
     S1: RESPONSE-TIME SCORING
     Maps response_time_min → 0–100 score.
     Faster = better. Default = 30 min (neutral ~70).
  ══════════════════════════════════════════════════════════ */

  function scoreResponseTime(a) {
    var rt = parseInt(a.responseTime || a.response_time_min || 30, 10);
    if (rt <= 10)  return 100;
    if (rt <= 20)  return 85;
    if (rt <= 30)  return 70;
    if (rt <= 45)  return 50;
    if (rt <= 60)  return 30;
    return 10;
  }

  /* ═══════════════════════════════════════════════════════════
     S3: NEGATIVE MODIFIERS
     Applied as penalty points AFTER weighted sum.
     Returns signed integer (≤ 0).
  ══════════════════════════════════════════════════════════ */

  function negativeModifiers(a, isUrgent) {
    var penalty = 0;
    var rating = Number(a.rating || 0);
    var avail  = _norm(a.availability || '');

    /* Low rating penalty */
    if (rating > 0 && rating < 3.0) penalty -= 12;
    else if (rating > 0 && rating < 3.5) penalty -= 5;

    /* Unverified AND unclaimed profile — slight penalty */
    if (!a.verified && !a.is_verified && !a.claimed && !a.owner_user_id) {
      penalty -= 5;
    }

    /* Urgent: offline artisans are hard-filtered before scoring,
       but if they slip through (availability not 'offline' but 'busy'),
       add extra penalty */
    if (isUrgent && (avail === 'busy' || avail === 'occupe')) {
      penalty -= 8;
    }

    return penalty;
  }

  /* ═══════════════════════════════════════════════════════════
     S2: MAIN SCORING ENGINE (replaces V1 scoreArtisan)
     Returns { overall, breakdown, urgent, reasons, label }
  ══════════════════════════════════════════════════════════ */

  function scoreArtisanV2(artisan, request) {
    var v1 = window.FixeoDispatch;
    var isUrgent = _isUrgentRequest(request);
    var W = isUrgent ? W_URGENT : W_NORMAL;

    /* Reuse V1 dimension scores */
    var s = {
      service:      v1.scoreServiceMatch(artisan, request),
      city:         v1.scoreCityMatch(artisan, request),
      availability: v1.scoreAvailability(artisan),
      trust:        v1.scoreTrust(artisan),
      responseTime: scoreResponseTime(artisan),
      performance:  v1.scorePerformance(artisan),
      activity:     v1.scoreActivity(artisan)
    };

    /* Weighted sum */
    var raw = Math.round(
      s.service      * W.service      / 100 +
      s.city         * W.city         / 100 +
      s.availability * W.availability / 100 +
      s.trust        * W.trust        / 100 +
      s.responseTime * W.responseTime / 100 +
      s.performance  * W.performance  / 100 +
      s.activity     * W.activity     / 100
    );

    /* Negative modifiers */
    var neg = negativeModifiers(artisan, isUrgent);
    var overall = _clamp(raw + neg, 0, 100);

    /* City-match floor: if city score = 0, cap total at 35 */
    if (s.city === 0) overall = Math.min(overall, 35);

    /* S4: Ranking reason label */
    var reasons = _buildReasons(artisan, s, isUrgent);
    var label   = _buildLabel(artisan, s, overall, isUrgent);

    return {
      overall:   overall,
      breakdown: s,
      urgent:    isUrgent,
      reasons:   reasons,
      label:     label,
      penalty:   neg
    };
  }

  /* ═══════════════════════════════════════════════════════════
     S4: HUMAN-READABLE REASON + LABEL
  ══════════════════════════════════════════════════════════ */

  function _buildReasons(a, s, isUrgent) {
    var tags = [];

    /* Service match */
    if (s.service >= 95) tags.push('Correspondance exacte');
    else if (s.service >= 70) tags.push('Service compatible');
    else if (s.service >= 30) tags.push('Service partiel');

    /* City match */
    if (s.city >= 95) tags.push('Même ville');
    else if (s.city >= 55) tags.push('Ville proche');
    else if (s.city >= 25) tags.push('Même région');
    else tags.push('Hors zone');

    /* Availability */
    if (s.availability === 100) tags.push(isUrgent ? '🟢 Disponible maintenant' : '● Disponible');
    else if (s.availability <= 20) tags.push('⚠️ Occupé');

    /* Trust */
    if (a.verified || a.is_verified) tags.push('✅ Vérifié');

    /* Response time */
    var rt = parseInt(a.responseTime || a.response_time_min || 30, 10);
    if (rt <= 15) tags.push('⚡ Très rapide (' + rt + 'min)');
    else if (rt <= 30 && isUrgent) tags.push('⚡ Réponse ' + rt + 'min');

    /* Completed missions */
    var cm = Number(a.completed_missions || 0);
    if (cm >= 50) tags.push(cm + ' missions');
    else if (cm >= 10) tags.push(cm + ' missions');

    /* Negative */
    var rating = Number(a.rating || 0);
    if (rating > 0 && rating < 3.0) tags.push('⚠️ Note faible');

    if (isUrgent) tags.unshift('🚨 Mode urgent');

    return tags.slice(0, 5); /* max 5 tags per card */
  }

  function _buildLabel(a, s, overall, isUrgent) {
    var name = (a.name || a.full_name || '?').split(' ')[0];
    var city = a.city || '?';
    var rt   = parseInt(a.responseTime || a.response_time_min || 30, 10);
    var tier = overall >= 85 ? 'Excellent' : overall >= 70 ? 'Bon choix' : overall >= 50 ? 'Compatible' : 'Faible';

    var parts = [name, city];
    if (s.service >= 90) parts.push('match exact');
    if (a.verified || a.is_verified) parts.push('vérifié');
    if (rt <= 20) parts.push(rt + 'min');
    if (isUrgent && s.availability === 100) parts.push('disponible');

    return tier + ' — ' + parts.join(' / ');
  }

  /* ═══════════════════════════════════════════════════════════
     RANKING ENGINE (Phases 2+3)
     Combines V2 scoring + hard filters for urgency
  ══════════════════════════════════════════════════════════ */

  function rankArtisansV2(request, limit) {
    limit = limit || 7; /* show more candidates in V2 */
    var all = [];
    try {
      if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
        all = window.FixeoDB.getAllArtisans() || [];
      }
    } catch(e) { return []; }
    if (!all.length) return [];

    var isUrgent = _isUrgentRequest(request);

    /* Hard filter: for urgent, exclude offline artisans entirely */
    if (isUrgent) {
      all = all.filter(function(a) {
        return _norm(a.availability || '') !== 'offline';
      });
    }

    var scored = all.map(function(a) {
      var result = scoreArtisanV2(a, request);
      return { artisan: a, score: result.overall, breakdown: result.breakdown,
               reasons: result.reasons, label: result.label, urgent: result.urgent,
               penalty: result.penalty };
    });

    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, limit);
  }

  /* ═══════════════════════════════════════════════════════════
     S5: AUTO-REDISPATCH MONITOR
     Watches assigned requests. If no mission accepted within
     REDISPATCH_TIMEOUT_MS, fires admin alert + suggests next artisan.
     State is localStorage-only (no Supabase writes).
  ══════════════════════════════════════════════════════════ */

  var REDISPATCH_STORAGE_KEY = 'fixeo_redispatch_watch_v2';
  var _redispatchTimer = null;

  function _readWatch() {
    try { return JSON.parse(localStorage.getItem(REDISPATCH_STORAGE_KEY) || '{}'); }
    catch(e) { return {}; }
  }
  function _writeWatch(obj) {
    try { localStorage.setItem(REDISPATCH_STORAGE_KEY, JSON.stringify(obj)); }
    catch(e) { /* silent */ }
  }

  /* Register a new assignment for monitoring */
  function watchAssignment(reqId, artisanId, artisanName, assignedAt) {
    if (!reqId) return;
    var watch = _readWatch();
    watch[reqId] = {
      artisanId:   artisanId,
      artisanName: artisanName,
      assignedAt:  assignedAt || new Date().toISOString(),
      alerted:     false
    };
    _writeWatch(watch);
  }

  /* Clear a watch entry (artisan accepted / cancelled / reassigned) */
  function clearWatch(reqId) {
    if (!reqId) return;
    var watch = _readWatch();
    delete watch[reqId];
    _writeWatch(watch);
  }

  /* Poll: check watched entries every 5 minutes */
  function _startRedispatchMonitor() {
    if (_redispatchTimer) return;
    _redispatchTimer = setInterval(_pollRedispatch, 5 * 60 * 1000);
    /* Also run once immediately after 30s */
    setTimeout(_pollRedispatch, 30000);
  }

  function _pollRedispatch() {
    var watch = _readWatch();
    var now   = Date.now();
    var updated = false;

    Object.keys(watch).forEach(function(reqId) {
      var entry = watch[reqId];
      if (entry.alerted) return; /* already notified */

      var assignedAt = new Date(entry.assignedAt).getTime();
      var elapsed    = now - assignedAt;

      if (elapsed >= REDISPATCH_TIMEOUT_MS) {
        /* Timeout: fire admin alert */
        _fireRedispatchAlert(reqId, entry);
        entry.alerted = true;
        updated = true;
      }
    });

    if (updated) _writeWatch(watch);
  }

  function _fireRedispatchAlert(reqId, entry) {
    /* In-app admin notification */
    var sys = window.FixeoNotificationsV1;
    if (sys && typeof sys.push === 'function') {
      sys.push({
        id:         'fdv2_timeout_' + reqId,
        type:       'adm_mission_blocked',
        audience:   'admin',
        title:      '⏱ Artisan ne répond pas',
        message:    (entry.artisanName || 'L\'artisan') + ' n\'a pas accepté la mission #'
          + String(reqId).slice(-6).toUpperCase() + ' depuis 30 min.',
        ref_type:   'mission',
        ref_id:     String(reqId),
        severity:   'warning',
        created_at: new Date().toISOString(),
        read:       false,
        dedupe_key: 'adm_timeout|' + reqId
      });
    }

    /* Supabase persist (best-effort) */
    var NE = window.FixeoNotifEngine;
    if (NE && typeof NE.sbPersist === 'function') {
      NE.sbPersist(
        'adm_mission_blocked', null, 'admin',
        '⏱ Artisan ne répond pas',
        (entry.artisanName || 'L\'artisan') + ' — mission #' + String(reqId).slice(-6).toUpperCase() + ' depuis 30 min.',
        'mission', reqId, { artisan_id: entry.artisanId, timeout_ms: REDISPATCH_TIMEOUT_MS }
      );
    }

    /* Dispatch admin refresh so V3 urgences section updates */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:admin:refresh', {
        detail: { source: 'redispatch', reqId: reqId }
      }));
    } catch(e) { /* silent */ }

    console.warn(LOG, 'redispatch timeout for reqId:', reqId, 'artisan:', entry.artisanName);
  }

  /* ═══════════════════════════════════════════════════════════
     S6: ENHANCED SUGGESTIONS UI
     Replaces V1 refresh loop with V2 scoring + new card layout.
     Injects into existing #admin-section-dispatch (V1's container).
  ══════════════════════════════════════════════════════════ */

  function _getPendingRequestsV2() {
    var v1 = window.FixeoDispatch;
    /* Reuse V1's _getPendingRequests via public API */
    if (typeof v1.getPendingRequests === 'function') {
      return v1.getPendingRequests();
    }
    /* Fallback: read from cache */
    var cache = window.__fxAccSbCache || [];
    var local = [];
    try { local = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]'); }
    catch(e) { local = []; }
    var all = cache.length ? cache : local;
    return all.filter(function(r) { return (r.status || '') === 'new'; });
  }

  function _renderUrgencyBanner(requestsCount) {
    if (requestsCount === 0) return '';
    return [
      '<div id="fxdv2-urgency-bar" style="',
        'background:linear-gradient(90deg,rgba(225,48,108,.15),rgba(64,93,230,.1));',
        'border:1px solid rgba(225,48,108,.3);border-radius:10px;',
        'padding:10px 14px;margin-bottom:16px;',
        'display:flex;align-items:center;gap:10px;',
        'font-size:.82rem;color:rgba(255,255,255,.8)">',
        '<span style="font-size:1.1rem;animation:fxdv2-pulse 1.5s ease-in-out infinite">⚡</span>',
        '<strong>Dispatch V2 actif</strong>',
        '<span style="color:rgba(255,255,255,.5)">—</span>',
        '<span>' + requestsCount + ' demande' + (requestsCount > 1 ? 's' : '') + ' à traiter</span>',
        '<span style="margin-left:auto;font-size:.7rem;',
          'background:linear-gradient(135deg,#E1306C22,#405DE622);',
          'border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:2px 8px;">',
          'Scoring V2</span>',
      '</div>'
    ].join('');
  }

  function _renderRequestBlockV2(req, rank, index) {
    if (!rank.length) {
      return [
        '<div class="fxdisp-request-block" style="',
          'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);',
          'border-radius:14px;padding:20px;margin-bottom:20px;">',
          '<div style="font-size:.82rem;font-weight:700;margin-bottom:8px">',
            (req.service_category || 'Demande') + ' — ' + (req.city || ''),
            _isUrgentRequest(req) ? '<span class="fxdv2-urgent-badge">🚨 URGENT</span>' : '',
          '</div>',
          '<div style="color:rgba(255,255,255,.35);font-size:.78rem">',
            'Aucun artisan compatible trouvé dans cette zone.',
          '</div>',
        '</div>'
      ].join('');
    }

    var artisanCards = rank.map(function(r, i) {
      return _renderArtisanCardV2(req, r, i);
    }).join('');

    var isUrgent = _isUrgentRequest(req);
    var urgentBadge = isUrgent
      ? '<span class="fxdv2-urgent-badge">🚨 URGENT</span>' : '';
    var refId = String(req.id || '').slice(-6).toUpperCase();
    var date  = req.created_at ? new Date(req.created_at).toLocaleDateString('fr-FR') : '';

    return [
      '<div class="fxdisp-request-block fxdv2-block" style="',
        'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);',
        'border-radius:14px;padding:20px;margin-bottom:24px;',
        isUrgent ? 'border-color:rgba(225,48,108,.4);' : '">',
        '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:14px;flex-wrap:wrap">',
          '<div>',
            '<div style="font-size:.88rem;font-weight:700">',
              _esc(req.service_category || req.description || 'Demande') + ' — ',
              '<span style="color:rgba(255,255,255,.7)">' + _esc(req.city || '') + '</span>',
              urgentBadge,
            '</div>',
            '<div style="font-size:.72rem;color:rgba(255,255,255,.35);margin-top:3px">',
              '#' + refId + (date ? ' · ' + date : ''),
              req.description ? ' · ' + _esc(String(req.description).slice(0, 60)) : '',
            '</div>',
          '</div>',
          '<span style="margin-left:auto;font-size:.7rem;',
            'background:rgba(255,255,255,.05);border-radius:6px;padding:2px 8px;',
            'color:rgba(255,255,255,.4)">' + rank.length + ' candidats</span>',
        '</div>',
        '<div class="fxdv2-card-grid">' + artisanCards + '</div>',
      '</div>'
    ].join('');
  }

  function _renderArtisanCardV2(req, r, rankIndex) {
    var a   = r.artisan;
    var sc  = r.score;
    var bd  = r.breakdown;
    var lbl = r.label;
    var tags = r.reasons || [];

    var scoreColor = sc >= 80 ? '#20C997' : sc >= 60 ? '#FCAF45' : '#ff5d73';
    var isTop = rankIndex === 0;

    var artId   = _esc(String(a.id || a._supabase_id || ''));
    var artName = _esc(String(a.name || a.full_name || '—'));
    var artCity = _esc(String(a.city || '—'));
    var artCat  = _esc(String(a.service_category || a.category || '—'));
    var artRt   = parseInt(a.responseTime || a.response_time_min || 30, 10);
    var artCm   = Number(a.completed_missions || 0);
    var artRat  = Number(a.rating || 0);
    var artPhone = _esc(String(a.phone || a.phone_public || ''));
    var availNorm = _norm(a.availability || '');
    var availDot  = availNorm === 'available' || availNorm === 'disponible'
      ? '<span style="color:#20C997">●</span>'
      : availNorm === 'busy' || availNorm === 'occupe'
        ? '<span style="color:#FCAF45">●</span>'
        : '<span style="color:rgba(255,255,255,.2)">●</span>';

    var tagHtml = tags.map(function(t) {
      var color = t.includes('exact') ? '#20C997' :
                  t.includes('rapide') || t.includes('min') ? '#FCAF45' :
                  t.includes('urgent') ? '#E1306C' :
                  t.includes('Hors zone') || t.includes('faible') ? '#ff5d73' :
                  'rgba(255,255,255,.4)';
      return '<span class="fxdv2-reason-tag" style="color:' + color + '">'
        + _esc(t) + '</span>';
    }).join('');

    var topIndicator = isTop
      ? '<div class="fxdv2-top-indicator">⭐ #1</div>' : '';

    var rank_label = '#' + (rankIndex + 1) + ' · ' + _esc(lbl.split('—')[0].trim());

    return [
      '<div class="fxdv2-artisan-card" style="',
        isTop ? 'border-color:rgba(32,201,151,.5);' : '',
        '">',
        topIndicator,

        /* Score badge */
        '<div class="fxdv2-score-badge" style="background:' + scoreColor + '22;',
          'border:1px solid ' + scoreColor + '55;color:' + scoreColor + '">',
          sc,
        '</div>',

        /* Rank label */
        '<div class="fxdv2-rank-label">' + _esc(rank_label) + '</div>',

        /* Identity */
        '<div class="fxdv2-name">' + artName + '</div>',
        '<div class="fxdv2-meta">',
          '<span>📍 ' + artCity + '</span>',
          '<span>🔧 ' + artCat + '</span>',
          '<span>' + availDot + ' </span>',
          '<span>⚡ ' + artRt + 'min</span>',
        '</div>',

        /* Stats */
        '<div class="fxdv2-stats">',
          artCm > 0 ? '<span>✅ ' + artCm + '</span>' : '',
          artRat > 0 ? '<span>⭐ ' + artRat.toFixed(1) + '</span>' : '',
          (a.verified || a.is_verified) ? '<span class="fxdv2-verified">Vérifié</span>' : '',
        '</div>',

        /* Reason tags */
        '<div class="fxdv2-reason-tags">' + tagHtml + '</div>',

        /* Score breakdown */
        '<div class="fxdv2-breakdown">',
          '<span>Service ' + bd.service + '</span>',
          '<span>Ville ' + bd.city + '</span>',
          '<span>Dispo ' + bd.availability + '</span>',
          '<span>Temps ' + bd.responseTime + '</span>',
          r.penalty < 0 ? '<span class="fxdv2-penalty">−' + Math.abs(r.penalty) + '</span>' : '',
        '</div>',

        /* Actions */
        '<div class="fxdv2-actions">',
          '<button class="fxdisp-assign-btn fxdv2-assign-btn"',
            ' data-req-id="' + _esc(String(req.id || '')) + '"',
            ' data-artisan-id="' + artId + '"',
            ' data-artisan-name="' + artName + '"',
            ' data-artisan-phone="' + artPhone + '"',
            ' data-artisan-cat="' + artCat + '">',
            '⚡ Assigner',
          '</button>',
          artPhone ? [
            '<a class="fxdv2-wa-btn" ',
              'href="https://wa.me/' + artPhone.replace(/\D/g, '') + '?text=',
              encodeURIComponent('Bonjour, mission #' + String(req.id || '').slice(-6).toUpperCase() + ' disponible. Disponible ?'),
              '" target="_blank" rel="noopener">📱</a>'
          ].join('') : '',
        '</div>',

      '</div>'
    ].join('');
  }

  /* Main V2 suggestions refresh */
  function refreshSuggestionsV2() {
    /* Ensure V1 section container exists */
    var section = document.getElementById('admin-section-dispatch');
    if (!section) {
      if (window.FixeoDispatch && typeof window.FixeoDispatch.refreshSuggestions === 'function') {
        window.FixeoDispatch.refreshSuggestions();
      }
      return;
    }

    var pending = _getPendingRequestsV2();

    /* Find or create V2 content area inside V1 section */
    var v2Area = document.getElementById('fxdv2-content');
    if (!v2Area) {
      v2Area = document.createElement('div');
      v2Area.id = 'fxdv2-content';
      /* Insert before V1's first .fxdisp-request-block */
      var firstBlock = section.querySelector('.fxdisp-request-block, #fxdisp-kpi-strip');
      if (firstBlock) {
        section.insertBefore(v2Area, firstBlock.nextSibling);
      } else {
        section.appendChild(v2Area);
      }
    }

    if (!pending.length) {
      v2Area.innerHTML = _renderUrgencyBanner(0);
      return;
    }

    /* Sort: urgent first, then newest */
    pending.sort(function(a, b) {
      var au = _isUrgentRequest(a) ? 1 : 0;
      var bu = _isUrgentRequest(b) ? 1 : 0;
      if (au !== bu) return bu - au;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    var html = _renderUrgencyBanner(pending.length);

    /* Score and render each pending request */
    pending.slice(0, 8).forEach(function(req) {
      var rank = rankArtisansV2(req, 5);
      html += _renderRequestBlockV2(req, rank, 0);
    });

    v2Area.innerHTML = html;

    /* Update V1 KPIs too */
    if (window.FixeoDispatch && typeof window.FixeoDispatch.updateKPIs === 'function') {
      window.FixeoDispatch.updateKPIs();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PATCH V1 ASSIGN to register watch
  ══════════════════════════════════════════════════════════ */

  function _patchV1Assign() {
    var v1 = window.FixeoDispatch;
    if (!v1 || v1._v2AssignPatched) return;
    v1._v2AssignPatched = true;

    var origAssign = v1.assignArtisan.bind(v1);
    v1.assignArtisan = async function(reqId, artisanId, artisanName, artisanPhone, artisanCat) {
      var result = await origAssign(reqId, artisanId, artisanName, artisanPhone, artisanCat);
      if (result && result.ok) {
        /* Start monitoring this assignment for timeout */
        watchAssignment(reqId, artisanId, artisanName, new Date().toISOString());
        /* Refresh V2 UI */
        setTimeout(refreshSuggestionsV2, 700);
      }
      return result;
    };
  }

  /* ═══════════════════════════════════════════════════════════
     PATCH adminSection('dispatch') to use V2 renderer
  ══════════════════════════════════════════════════════════ */

  function _patchAdminSection() {
    var orig = window.adminSection;
    if (typeof orig !== 'function' || orig._v2Patched) return;

    window.adminSection = function(section) {
      orig(section);
      if (section === 'dispatch') {
        setTimeout(refreshSuggestionsV2, 150);
      }
    };
    window.adminSection._v2Patched = true;
  }

  /* ═══════════════════════════════════════════════════════════
     LISTEN to events that should trigger V2 refresh
  ══════════════════════════════════════════════════════════ */

  function _listenEvents() {
    var _debounce = null;
    var REFRESH_EVENTS = [
      'fixeo:admin:refresh',
      'fixeo:client-request-created',
      'fixeo:client-request-updated',
      'fixeo:state:updated'
    ];
    REFRESH_EVENTS.forEach(function(ev) {
      window.addEventListener(ev, function(e) {
        var detail = (e && e.detail) || {};
        /* Avoid self-loop from redispatch alert */
        if (detail.source === 'redispatch') return;
        clearTimeout(_debounce);
        _debounce = setTimeout(function() {
          var section = document.getElementById('admin-section-dispatch');
          if (section && section.style.display !== 'none') {
            refreshSuggestionsV2();
          }
        }, 1200);
      });
    });

    /* Clear watch when artisan accepts (mission created) */
    window.addEventListener('fixeo:missions:updated', function() {
      /* Re-check all watched entries against live __fxAccSbCache */
      var cache = window.__fxAccSbCache || [];
      var watch = _readWatch();
      var updated = false;
      Object.keys(watch).forEach(function(reqId) {
        var req = cache.find(function(r) { return String(r.id) === reqId; });
        if (req && req.status === 'in_progress') {
          delete watch[reqId];
          updated = true;
        }
      });
      if (updated) _writeWatch(watch);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════ */

  function _boot() {
    _patchV1Assign();
    _patchAdminSection();
    _listenEvents();
    _startRedispatchMonitor();

    /* Inject V2 into dispatch section if already open on load */
    setTimeout(function() {
      var section = document.getElementById('admin-section-dispatch');
      if (section && section.style.display !== 'none') {
        refreshSuggestionsV2();
      }
    }, 1500);

    console.log(LOG, VERSION, 'booted');
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */

  window.FixeoDispatchV2 = {
    VERSION:              VERSION,
    scoreArtisanV2:       scoreArtisanV2,
    scoreResponseTime:    scoreResponseTime,
    rankArtisansV2:       rankArtisansV2,
    refreshSuggestions:   refreshSuggestionsV2,
    watchAssignment:      watchAssignment,
    clearWatch:           clearWatch,
    isUrgentRequest:      _isUrgentRequest,
    negativeModifiers:    negativeModifiers
  };

})();
