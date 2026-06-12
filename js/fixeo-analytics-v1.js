/* ============================================================
   FIXEO ANALYTICS & GROWTH COMMAND CENTER V1
   js/fixeo-analytics-v1.js   Version: fagc-v1b
   Guard: window._fxAgcV1Loaded

   ┌─ DATA SOURCES ──────────────────────────────────────────┐
   │  Supabase:                                               │
   │    service_requests  — all (no cancelled limit)          │
   │    missions          — all (no cancelled limit)          │
   │    artisans          — count + category/city/avail       │
   │  Live DOM tracking (non-Supabase):                       │
   │    Session micro-events via MutationObserver +           │
   │    event listeners → stored in sessionStorage           │
   └─────────────────────────────────────────────────────────┘

   INJECTION: Appends #fagc-panel AFTER existing overview
   content in #admin-section-overview — fully additive.
   Zero changes to V3, V4, or existing analytics.

   Namespace: .fagc-* / #fagc-* / window.FixeoAnalytics
   NEVER touches: reservation.js, request-form.js,
     fixeo-request-modal-v2.js, dispatch engines,
     notification engine, mission system, auth
   ============================================================ */
(function () {
  'use strict';
  if (window._fxAgcV1Loaded) return;
  window._fxAgcV1Loaded = true;

  var VERSION = 'fagc-v1b';
  var LOG     = '[fagc]';

  /* ── Page guard: admin only ─────────────────────────────── */
  function _isAdminPage() {
    return !!(
      document.getElementById('admin-section-overview') ||
      (document.body && document.body.dataset.dashType === 'admin')
    );
  }
  if (!_isAdminPage()) {
    /* May be called before DOM ready — defer check */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        if (_isAdminPage()) _init();
      });
    }
    return;
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function qs(sel, ctx)   { return (ctx || document).querySelector(sel); }
  function esc(s)         { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function _norm(s)       { return String(s||'').toLowerCase().trim(); }
  function _fmt(n) {
    n = Math.round(n);
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1) + 'k';
    return n.toString();
  }
  function _pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }

  /* ── Supabase ────────────────────────────────────────────── */
  /* P0-2 fix (fagc-v1b): mirrors acc-v3 resolver.
     FixeoSupabaseClient is a wrapper — must return .client (raw supabase obj).
     Returning the wrapper caused sb.from() is not a function → silent zero data. */
  async function _sb() {
    /* Primary: FixeoSupabaseClient.client (always present on admin.html) */
    try {
      var FC = window.FixeoSupabaseClient;
      if (FC && FC.CONFIGURED) {
        try { await FC.ready(); } catch(_) {}
        if (FC.client) return FC.client;
      }
    } catch(_) {}
    /* Fallback: FixeoSupabase.getClient() (fixeo-supabase-core.js on dashboards) */
    try {
      var FS = window.FixeoSupabase;
      if (FS && typeof FS.getClient === 'function') return await FS.getClient();
    } catch(_) {}
    return null;
  }

  /* ── Session micro-event tracker (DOM → sessionStorage) ─── */
  /* Tracks modal open/close/submit without modifying request-form.js */
  var SESSION_KEY = 'fagc_session_v1';

  function _sessionGet() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); } catch(_) { return {}; }
  }
  function _sessionSet(obj) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch(_) {}
  }
  function _sessionInc(key) {
    var s = _sessionGet(); s[key] = (s[key] || 0) + 1; _sessionSet(s);
  }

  /* Attach abandonment + open tracking after DOM ready */
  function _attachSessionTracking() {
    /* Track #request-modal open → attempt, submit → success, close-without-submit → abandon */
    var rm = document.getElementById('request-modal');
    if (!rm) return;

    var _openTime  = null;
    var _submitted = false;

    var obs = new MutationObserver(function(muts) {
      muts.forEach(function(mu) {
        if (mu.attributeName === 'class') {
          var isOpen = rm.classList.contains('open');
          if (isOpen && !_openTime) {
            _openTime  = Date.now();
            _submitted = false;
            _sessionInc('modal_opens');
          } else if (!isOpen && _openTime) {
            if (!_submitted) _sessionInc('modal_abandons');
            _openTime = null;
          }
        }
      });
    });
    obs.observe(rm, { attributes: true, attributeFilter: ['class'] });

    /* Detect form submit */
    var form = document.getElementById('request-form');
    if (form) {
      form.addEventListener('submit', function() {
        _submitted = true;
        _sessionInc('modal_submits');
      });
    }

    /* Also track reservation modal opens */
    var resModal = document.getElementById('fixeo-reservation-modal');
    if (resModal) {
      var resObs = new MutationObserver(function(muts) {
        muts.forEach(function(mu) {
          if (mu.attributeName === 'class' && resModal.classList.contains('open')) {
            _sessionInc('reservation_opens');
          }
        });
      });
      resObs.observe(resModal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* ── DATA LAYER ─────────────────────────────────────────── */

  var _state = {
    requests:    [],
    missions:    [],
    artisanCount: 0,
    lastFetch:   0
  };

  var URGENCY_REGEX = /urgence|urgent|fuite|panne|bloqu|gaz|inondation|cassé|bloqué/i;

  async function _fetch() {
    var sb = await _sb();
    if (!sb) { console.warn(LOG, 'No Supabase client'); return; }

    try {
      /* 1. Fetch ALL service_requests (no cancelled filter — need full funnel) */
      var [rRes, mRes, acntRes] = await Promise.all([
        sb.from('service_requests')
          .select('id,service_category,city,description,status,created_at,client_profile_id')
          .order('created_at', { ascending: false })
          .limit(500),  /* wider window for trend accuracy */
        sb.from('missions')
          .select('id,request_id,artisan_profile_id,status,agreed_price,commission_amount,created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        sb.from('artisans').select('id', { count: 'exact', head: true })
      ]);

      if (!rRes.error  && rRes.data)   _state.requests     = rRes.data;
      if (!mRes.error  && mRes.data)   _state.missions     = mRes.data;
      if (!acntRes.error)              _state.artisanCount = acntRes.count || 0;

      _state.lastFetch = Date.now();
    } catch(e) {
      console.warn(LOG, 'fetch error:', e && e.message);
    }
  }

  /* ── COMPUTE ENGINE ─────────────────────────────────────── */

  function _compute() {
    var reqs     = _state.requests;
    var missions = _state.missions;
    var now      = Date.now();

    /* ── A. Core counters ─────────────────────── */
    var total        = reqs.length;
    var urgent       = reqs.filter(function(r) {
      return URGENCY_REGEX.test(r.description || '') ||
             URGENCY_REGEX.test(r.service_category || '');
    }).length;
    var uniqueClients= _countUnique(reqs, 'client_profile_id');

    var byStatus = { new:0, assigned:0, in_progress:0, completed:0, validated:0, cancelled:0 };
    reqs.forEach(function(r) {
      var s = _norm(r.status || 'new');
      if (byStatus.hasOwnProperty(s)) byStatus[s]++;
      else if (s === 'done') byStatus.completed++;
    });

    /* ── B. Conversion funnel ─────────────────── */
    var funnel = [
      { label: 'Demandes reçues',   count: total,               color: '#405DE6', key: 'all' },
      { label: 'Assignées',          count: byStatus.assigned + byStatus.in_progress + byStatus.completed + byStatus.validated, color: '#833AB4', key: 'assigned' },
      { label: 'En cours',           count: byStatus.in_progress + byStatus.completed + byStatus.validated,                      color: '#E1306C', key: 'in_progress' },
      { label: 'Terminées',          count: byStatus.completed + byStatus.validated,                                             color: '#FB923C', key: 'completed' },
      { label: 'Validées ✓',         count: byStatus.validated,                                                                   color: '#20C997', key: 'validated' }
    ];
    var convRate = _pct(byStatus.validated, total);

    /* ── C. Revenue & commissions ─────────────── */
    var completedMissions = missions.filter(function(m) {
      return ['done','completed','validated'].indexOf(_norm(m.status||'')) !== -1;
    });
    var gmv        = 0, commission = 0;
    completedMissions.forEach(function(m) {
      var ap = parseFloat(m.agreed_price || 0);
      var cm = parseFloat(m.commission_amount || 0) || ap * 0.10;
      gmv        += ap;
      commission += cm;
    });
    var avgTicket = completedMissions.length > 0 ? Math.round(gmv / completedMissions.length) : 0;

    /* ── D. Top cities ────────────────────────── */
    var cityMap = {};
    reqs.forEach(function(r) {
      var c = (r.city || '').trim();
      if (!c) return;
      var k = _norm(c);
      if (!cityMap[k]) cityMap[k] = { label: c, count: 0, validated: 0 };
      cityMap[k].count++;
      if (_norm(r.status) === 'validated') cityMap[k].validated++;
    });
    var topCities = Object.values(cityMap)
      .sort(function(a,b) { return b.count - a.count; })
      .slice(0, 8);

    /* ── E. Top services ──────────────────────── */
    var svcMap = {};
    var SVC_ICONS = { plomberie:'🔧', electricite:'⚡', serrurerie:'🔐', climatisation:'❄️',
                      peinture:'🎨', menuiserie:'🪚', nettoyage:'🧹', maconnerie:'🧱', carrelage:'⬜' };
    reqs.forEach(function(r) {
      var s = _norm(r.service_category || '');
      if (!s) return;
      if (!svcMap[s]) svcMap[s] = { label: r.service_category, count: 0, validated: 0,
                                     icon: SVC_ICONS[s] || '🔨' };
      svcMap[s].count++;
      if (_norm(r.status) === 'validated') svcMap[s].validated++;
    });
    var topServices = Object.values(svcMap)
      .sort(function(a,b) { return b.count - a.count; })
      .slice(0, 8);

    /* ── F. Daily trend (last 14 days) ───────── */
    var MS_DAY = 86400000;
    var today  = new Date(); today.setHours(0,0,0,0);
    var dailyReqs = {}, dailyMissions = {};
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today.getTime() - i * MS_DAY);
      var k = d.toISOString().slice(0,10);
      dailyReqs[k]     = 0;
      dailyMissions[k] = 0;
    }
    reqs.forEach(function(r) {
      var d = (r.created_at || '').slice(0,10);
      if (dailyReqs.hasOwnProperty(d)) dailyReqs[d]++;
    });
    missions.forEach(function(m) {
      var d = (m.created_at || '').slice(0,10);
      if (dailyMissions.hasOwnProperty(d)) dailyMissions[d]++;
    });
    var trendDays = Object.keys(dailyReqs).map(function(d) {
      return { date: d, requests: dailyReqs[d], missions: dailyMissions[d] };
    });

    /* ── G. 7-day vs prior-7-day WoW ─────────── */
    var cut7  = now - 7  * MS_DAY;
    var cut14 = now - 14 * MS_DAY;
    var thisWeek = reqs.filter(function(r) { return new Date(r.created_at||0).getTime() >= cut7; }).length;
    var lastWeek = reqs.filter(function(r) {
      var t = new Date(r.created_at||0).getTime();
      return t >= cut14 && t < cut7;
    }).length;
    var wowDelta  = lastWeek > 0 ? Math.round((thisWeek - lastWeek) / lastWeek * 100) : null;

    /* ── H. Session (DOM-tracked) signals ────── */
    var sess        = _sessionGet();
    var sessOpens   = sess.modal_opens    || 0;
    var sessSubmits = sess.modal_submits  || 0;
    var sessAbandon = sess.modal_abandons || 0;
    var abandonRate = sessOpens > 0 ? _pct(sessAbandon, sessOpens) : null;

    /* ── I. Urgent ratio ─────────────────────── */
    var urgentRatio = _pct(urgent, total);

    return {
      total, urgent, urgentRatio, uniqueClients,
      byStatus, funnel, convRate,
      gmv, commission, avgTicket, completedMissions: completedMissions.length,
      topCities, topServices,
      trendDays, thisWeek, lastWeek, wowDelta,
      sessOpens, sessSubmits, sessAbandon, abandonRate,
      artisanCount: _state.artisanCount,
      lastFetch: _state.lastFetch
    };
  }

  function _countUnique(arr, key) {
    var s = {};
    arr.forEach(function(o) { if (o[key]) s[o[key]] = 1; });
    return Object.keys(s).length;
  }

  /* ── RENDER ENGINE ──────────────────────────────────────── */

  function _renderPanel(d) {
    return (
      '<div class="fagc-panel" id="fagc-panel">' +
        _renderPanelHeader(d) +
        _renderKpis(d) +
        '<div class="fagc-grid-2">' +
          _renderFunnel(d) +
          _renderRevenue(d) +
        '</div>' +
        '<div class="fagc-grid-2">' +
          _renderTopCities(d) +
          _renderTopServices(d) +
        '</div>' +
        _renderTrend(d) +
        _renderGrowthSignals(d) +
      '</div>'
    );
  }

  function _renderPanelHeader(d) {
    var freshness = d.lastFetch
      ? 'Actualisé il y a ' + Math.round((Date.now() - d.lastFetch) / 1000) + 's'
      : 'Chargement…';
    return (
      '<div class="fagc-header">' +
        '<div class="fagc-header-left">' +
          '<div class="fagc-logo-row">' +
            '<span class="fagc-logo-mark">✦</span>' +
            '<span class="fagc-title">ANALYTICS & GROWTH</span>' +
            '<span class="fagc-version">' + VERSION + '</span>' +
          '</div>' +
          '<p class="fagc-subtitle">Intelligence fondateur · Source: Supabase + session</p>' +
        '</div>' +
        '<div class="fagc-header-right">' +
          '<span class="fagc-freshness" id="fagc-freshness">' + esc(freshness) + '</span>' +
          '<button class="fagc-refresh-btn" id="fagc-refresh-btn" type="button" title="Actualiser">↻</button>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── KPI row ─────────────────────────────────────────────── */
  function _kpiCard(icon, value, label, sub, highlight) {
    return (
      '<div class="fagc-kpi' + (highlight ? ' fagc-kpi--hi' : '') + '">' +
        '<div class="fagc-kpi-icon">' + icon + '</div>' +
        '<div class="fagc-kpi-body">' +
          '<div class="fagc-kpi-val">' + esc(value) + '</div>' +
          '<div class="fagc-kpi-label">' + esc(label) + '</div>' +
          (sub ? '<div class="fagc-kpi-sub">' + esc(sub) + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function _renderKpis(d) {
    var wowLabel = d.wowDelta !== null
      ? (d.wowDelta >= 0 ? '▲' : '▼') + Math.abs(d.wowDelta) + '% vs sem. préc.'
      : '';
    return (
      '<div class="fagc-kpi-row">' +
        _kpiCard('📋', _fmt(d.total), 'Demandes totales', wowLabel, false) +
        _kpiCard('👥', _fmt(d.uniqueClients), 'Clients uniques', 'profils identifiés', false) +
        _kpiCard('🎯', d.convRate + '%', 'Taux de conversion', 'demande → validée', d.convRate >= 20) +
        _kpiCard('⚡', d.urgentRatio + '%', 'Ratio urgences', d.urgent + ' urgences / ' + d.total + ' total', d.urgentRatio > 40) +
        _kpiCard('💰', _fmt(d.gmv) + ' MAD', 'GMV (missions terminées)', d.completedMissions + ' missions · ' + _fmt(d.avgTicket) + ' MAD moy.', d.gmv > 0) +
        _kpiCard('🏗️', _fmt(d.artisanCount), 'Artisans enregistrés', 'dans la DB', false) +
      '</div>'
    );
  }

  /* ── Conversion funnel ───────────────────────────────────── */
  function _renderFunnel(d) {
    var top  = d.funnel[0].count || 1;
    var rows = d.funnel.map(function(step, i) {
      var pct  = Math.round(step.count / top * 100);
      var prev = i > 0 ? d.funnel[i-1].count : null;
      var drop = (prev && prev > 0) ? Math.round((1 - step.count / prev) * 100) : null;
      return (
        '<div class="fagc-funnel-row">' +
          '<div class="fagc-funnel-label">' + esc(step.label) + '</div>' +
          '<div class="fagc-funnel-track">' +
            '<div class="fagc-funnel-fill" style="width:' + pct + '%;background:' + step.color + '30;border-left:3px solid ' + step.color + '">' +
              '<span class="fagc-funnel-count" style="color:' + step.color + '">' + _fmt(step.count) + '</span>' +
            '</div>' +
          '</div>' +
          (drop !== null ? '<div class="fagc-funnel-drop">-' + drop + '%</div>' : '<div class="fagc-funnel-drop"></div>') +
        '</div>'
      );
    }).join('');
    return (
      '<div class="fagc-card">' +
        '<div class="fagc-card-title">🎯 Entonnoir de conversion</div>' +
        '<div class="fagc-funnel">' + rows + '</div>' +
        '<div class="fagc-card-foot">Taux final: <strong>' + d.convRate + '%</strong> (demande → validée)</div>' +
      '</div>'
    );
  }

  /* ── Revenue ─────────────────────────────────────────────── */
  function _renderRevenue(d) {
    var commRate = d.gmv > 0 ? Math.round(d.commission / d.gmv * 100) : 0;
    return (
      '<div class="fagc-card">' +
        '<div class="fagc-card-title">💰 Revenus & commissions</div>' +
        '<div class="fagc-rev-grid">' +
          '<div class="fagc-rev-item">' +
            '<div class="fagc-rev-val">' + _fmt(d.gmv) + ' MAD</div>' +
            '<div class="fagc-rev-lbl">GMV total</div>' +
          '</div>' +
          '<div class="fagc-rev-item fagc-rev-item--accent">' +
            '<div class="fagc-rev-val">' + _fmt(d.commission) + ' MAD</div>' +
            '<div class="fagc-rev-lbl">Commissions Fixeo (' + commRate + '%)</div>' +
          '</div>' +
          '<div class="fagc-rev-item">' +
            '<div class="fagc-rev-val">' + _fmt(d.avgTicket) + ' MAD</div>' +
            '<div class="fagc-rev-lbl">Ticket moyen</div>' +
          '</div>' +
          '<div class="fagc-rev-item">' +
            '<div class="fagc-rev-val">' + d.completedMissions + '</div>' +
            '<div class="fagc-rev-lbl">Missions terminées</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── Top cities ──────────────────────────────────────────── */
  function _renderTopCities(d) {
    if (!d.topCities.length) return '<div class="fagc-card"><div class="fagc-card-title">📍 Top villes</div><div class="fagc-empty">Aucune donnée</div></div>';
    var max = d.topCities[0].count || 1;
    var rows = d.topCities.map(function(c, i) {
      var pct = Math.round(c.count / max * 100);
      var cr  = _pct(c.validated, c.count);
      return (
        '<div class="fagc-bar-row">' +
          '<div class="fagc-bar-rank">' + (i+1) + '</div>' +
          '<div class="fagc-bar-label">' + esc(c.label) + '</div>' +
          '<div class="fagc-bar-track">' +
            '<div class="fagc-bar-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="fagc-bar-stat">' + c.count + '</div>' +
          '<div class="fagc-bar-conv">' + cr + '%</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="fagc-card">' +
        '<div class="fagc-card-title">📍 Top villes</div>' +
        '<div class="fagc-bar-header">' +
          '<span></span><span></span><span class="fagc-col-r">Req.</span><span class="fagc-col-r">Conv.</span>' +
        '</div>' +
        '<div class="fagc-bars">' + rows + '</div>' +
      '</div>'
    );
  }

  /* ── Top services ────────────────────────────────────────── */
  function _renderTopServices(d) {
    if (!d.topServices.length) return '<div class="fagc-card"><div class="fagc-card-title">🔨 Top services</div><div class="fagc-empty">Aucune donnée</div></div>';
    var max = d.topServices[0].count || 1;
    var rows = d.topServices.map(function(s, i) {
      var pct = Math.round(s.count / max * 100);
      var cr  = _pct(s.validated, s.count);
      return (
        '<div class="fagc-bar-row">' +
          '<div class="fagc-bar-rank">' + (i+1) + '</div>' +
          '<div class="fagc-bar-label">' + esc(s.icon) + ' ' + esc(s.label) + '</div>' +
          '<div class="fagc-bar-track">' +
            '<div class="fagc-bar-fill fagc-bar-fill--svc" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="fagc-bar-stat">' + s.count + '</div>' +
          '<div class="fagc-bar-conv">' + cr + '%</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="fagc-card">' +
        '<div class="fagc-card-title">🔨 Top services demandés</div>' +
        '<div class="fagc-bar-header">' +
          '<span></span><span></span><span class="fagc-col-r">Req.</span><span class="fagc-col-r">Conv.</span>' +
        '</div>' +
        '<div class="fagc-bars">' + rows + '</div>' +
      '</div>'
    );
  }

  /* ── Daily trend (14-day sparkline) ─────────────────────── */
  function _renderTrend(d) {
    var days = d.trendDays;
    if (!days.length) return '';

    var maxR = Math.max.apply(null, days.map(function(x) { return x.requests; })) || 1;
    var maxM = Math.max.apply(null, days.map(function(x) { return x.missions;  })) || 1;
    var maxVal = Math.max(maxR, maxM, 1);

    var H = 52; /* chart height px */

    var reqPath = _buildSparkline(days.map(function(x) { return x.requests; }), maxVal, H);
    var miPath  = _buildSparkline(days.map(function(x) { return x.missions;  }), maxVal, H);

    var bars = days.map(function(day, i) {
      var h = Math.round(day.requests / maxVal * H);
      var today = day.date === new Date().toISOString().slice(0,10);
      return (
        '<div class="fagc-trend-bar-wrap" title="' + esc(day.date) + ': ' + day.requests + ' req, ' + day.missions + ' miss">' +
          '<div class="fagc-trend-bar' + (today ? ' fagc-trend-bar--today' : '') + '" style="height:' + h + 'px"></div>' +
          '<div class="fagc-trend-label">' + esc(day.date.slice(8)) + '</div>' +
        '</div>'
      );
    }).join('');

    var avg7R = Math.round(d.trendDays.slice(-7).reduce(function(s,x) { return s+x.requests; }, 0) / 7);

    return (
      '<div class="fagc-card fagc-card--wide">' +
        '<div class="fagc-card-title-row">' +
          '<div class="fagc-card-title">📈 Tendance 14 jours (demandes)</div>' +
          '<div class="fagc-trend-meta">' +
            '<span class="fagc-trend-avg">Moy/j: ' + avg7R + '</span>' +
            (d.wowDelta !== null ? '<span class="fagc-trend-wow ' + (d.wowDelta >= 0 ? 'up' : 'down') + '">' +
              (d.wowDelta >= 0 ? '▲' : '▼') + Math.abs(d.wowDelta) + '% vs sem. préc.</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="fagc-trend-chart">' +
          '<div class="fagc-trend-bars">' + bars + '</div>' +
        '</div>' +
        '<div class="fagc-trend-legend">' +
          '<span class="fagc-leg-req">Demandes</span>' +
          '<span class="fagc-leg-dot"> · </span>' +
          '<span class="fagc-leg-lbl">Barres = demandes reçues · Couleur accentuée = aujourd\'hui</span>' +
        '</div>' +
      '</div>'
    );
  }

  function _buildSparkline(vals, maxVal, H) {
    /* Returns SVG polyline points string */
    var W = 480, n = vals.length;
    if (n < 2) return '';
    var pts = vals.map(function(v, i) {
      var x = Math.round(i / (n-1) * W);
      var y = Math.round(H - v / maxVal * H);
      return x + ',' + y;
    }).join(' ');
    return pts;
  }

  /* ── Growth signals row ──────────────────────────────────── */
  function _renderGrowthSignals(d) {
    var signals = [];

    /* Signal 1: Modal abandonment (session-tracked) */
    if (d.sessOpens > 0) {
      var aRate = d.abandonRate !== null ? d.abandonRate + '%' : '—';
      var aTone = (d.abandonRate || 0) > 60 ? 'warn' : 'ok';
      signals.push(_signal('🚪', 'Abandon modal', aRate,
        'Ouvertures: ' + d.sessOpens + ' · Envois: ' + d.sessSubmits, aTone));
    } else {
      signals.push(_signal('🚪', 'Abandon modal', 'Session courte',
        'Ouvrez le modal pour mesurer', 'muted'));
    }

    /* Signal 2: Urgent ratio */
    var uTone = d.urgentRatio > 50 ? 'warn' : d.urgentRatio > 25 ? 'ok' : 'muted';
    signals.push(_signal('⚡', 'Urgences', d.urgentRatio + '%',
      d.urgent + ' / ' + d.total + ' demandes', uTone));

    /* Signal 3: Week-over-week growth */
    if (d.wowDelta !== null) {
      var wTone = d.wowDelta > 10 ? 'ok' : d.wowDelta < -10 ? 'warn' : 'muted';
      signals.push(_signal('📊', 'Croissance hebdo',
        (d.wowDelta >= 0 ? '+' : '') + d.wowDelta + '%',
        'Cette sem: ' + d.thisWeek + ' · Préc: ' + d.lastWeek, wTone));
    }

    /* Signal 4: Conversion health */
    var cTone = d.convRate >= 25 ? 'ok' : d.convRate >= 10 ? 'muted' : 'warn';
    signals.push(_signal('🎯', 'Conversion',
      d.convRate + '%',
      d.byStatus.validated + ' validées / ' + d.total + ' total', cTone));

    /* Signal 5: GMV health */
    if (d.gmv > 0) {
      signals.push(_signal('💵', 'GMV actif', _fmt(d.gmv) + ' MAD',
        _fmt(d.commission) + ' MAD commission', 'ok'));
    }

    return (
      '<div class="fagc-card fagc-card--wide">' +
        '<div class="fagc-card-title">📡 Signaux de croissance</div>' +
        '<div class="fagc-signals">' + signals.join('') + '</div>' +
      '</div>'
    );
  }

  function _signal(icon, title, value, sub, tone) {
    return (
      '<div class="fagc-signal fagc-signal--' + tone + '">' +
        '<div class="fagc-signal-icon">' + icon + '</div>' +
        '<div class="fagc-signal-body">' +
          '<div class="fagc-signal-val">' + esc(value) + '</div>' +
          '<div class="fagc-signal-title">' + esc(title) + '</div>' +
          '<div class="fagc-signal-sub">' + esc(sub) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── INJECT into admin page ──────────────────────────────── */

  function _inject(html) {
    var existing = document.getElementById('fagc-panel');
    if (existing) { existing.outerHTML = html; return; }

    var overview = document.getElementById('admin-section-overview');
    if (!overview) return;

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    var panel = wrapper.firstChild;

    /* Append after all existing content in overview */
    overview.appendChild(panel);
  }

  function _bindRefresh() {
    var btn = document.getElementById('fagc-refresh-btn');
    if (btn && !btn._fagcBound) {
      btn._fagcBound = true;
      btn.addEventListener('click', function() {
        btn.textContent = '…';
        btn.disabled = true;
        _refresh(function() {
          btn.textContent = '↻';
          btn.disabled = false;
        });
      });
    }
  }

  /* ── REFRESH ─────────────────────────────────────────────── */
  var _refreshing = false;

  function _refresh(cb) {
    if (_refreshing) return;
    _refreshing = true;
    _fetch().then(function() {
      _refreshing = false;
      var d = _compute();
      _inject(_renderPanel(d));
      _bindRefresh();
      if (cb) cb();
    });
  }

  /* ── AUTO-REFRESH every 60s ─────────────────────────────── */
  function _startAutoRefresh() {
    setInterval(function() {
      if (document.hidden) return;
      /* Only refresh if overview section is visible */
      var ov = document.getElementById('admin-section-overview');
      if (ov && ov.style.display !== 'none') {
        _refresh();
      }
    }, 60000);
  }

  /* ── EVENT LISTENERS ─────────────────────────────────────── */
  function _bindEvents() {
    var events = [
      'fixeo:client-request-created',
      'fixeo:client-request-updated',
      'fixeo:missions:updated',
      'fixeo:state:updated'
    ];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() {
        clearTimeout(window._fagcDebounce);
        window._fagcDebounce = setTimeout(_refresh, 1500);
      });
    });
  }

  /* ── INIT ────────────────────────────────────────────────── */
  function _init() {
    if (!_isAdminPage()) return;
    _attachSessionTracking();
    _bindEvents();
    _refresh();
    _startAutoRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 100); /* brief defer — let V3/V4 inject first */
  }

  /* ── PUBLIC API ──────────────────────────────────────────── */
  window.FixeoAnalytics = {
    VERSION: VERSION,
    refresh: _refresh,
    compute: function() { return _compute(); },
    session: _sessionGet
  };

}());
