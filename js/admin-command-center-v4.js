/**
 * FIXEO Admin Command Center V4 — admin-command-center-v4.js
 * Version: acc-v4b — 2026-06-12 (P0-1: robust Supabase resolver)
 * ─────────────────────────────────────────────────────────────────
 * Operational war room — CEO / ops command cockpit.
 * 8 modules injected ADDITIVELY above V3 sections in admin.html.
 *
 * MODULE 1 — Live Request Feed       (service_requests, auto-refresh 5s)
 * MODULE 2 — SLA Monitor             (request age buckets, 0–5/5–15/15–30/30+ min)
 * MODULE 3 — City Heatmap            (demand per city, saturation ratio)
 * MODULE 4 — Artisan Availability    (online/busy/offline + category breakdown)
 * MODULE 5 — Revenue Engine          (missions GMV + commissions, today/week/month)
 * MODULE 6 — Conversion Funnel       (new→assigned→in_progress→completed→validated)
 * MODULE 7 — Incident Center         (blocked/timeout/unassigned alerts, severity-sorted)
 * MODULE 8 — CEO AI Insights         (derived intelligence from live data)
 *
 * DATA SOURCES (READ ONLY — zero writes):
 *   service_requests  → Modules 1,2,3,5,6,7,8
 *   missions          → Modules 5,6,7,8
 *   artisans          → Modules 3,4,7,8
 *
 * NEVER TOUCHES:
 *   V3 sections, V2 sections, V1 dispatch engine, notification engine,
 *   missions write path, RLS policies, auth, client/artisan dashboards
 *
 * ADDITIVE RULE:
 *   #fxv4-warroom injected at top of #admin-section-overview.
 *   V3 sections continue to function below.
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';
  if (window.FixeoAccV4) return;

  var VERSION = 'acc-v4b';
  var LOG     = '[FixeoAccV4]';

  /* ── CITY LIST (canonical) ── */
  var CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi','Taza',
    'Ouarzazate','Mohammedia'
  ];

  var SERVICES = ['plomberie','electricite','serrurerie','climatisation','peinture','menuiserie','nettoyage'];
  var SERVICE_ICONS = { plomberie:'💧', electricite:'⚡', serrurerie:'🔒', climatisation:'❄️', peinture:'🎨', menuiserie:'🪚', nettoyage:'🧹' };
  var SLA_THRESHOLD_URGENT_MIN = 15; /* minutes before alert */

  /* ── State cache ── */
  var _requests   = [];  /* service_requests (recent, non-cancelled) */
  var _missions   = [];  /* missions */
  var _artisans   = [];  /* artisans pool */
  var _lastFetch  = 0;
  var _refreshing = false;
  var _revTab     = 'today'; /* today | week | month | all */
  var _timers     = [];

  /* ── Helpers ── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function _ago(iso) {
    if (!iso) return '—';
    var d = Math.max(0, Date.now() - new Date(iso).getTime());
    var s = Math.floor(d / 1000);
    if (s < 60)  return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60)  return m + 'min';
    return Math.floor(m / 60) + 'h';
  }

  function _minAgo(iso) {
    if (!iso) return 9999;
    return Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  }

  function _norm(s) { return String(s||'').toLowerCase().trim(); }

  function _capitalize(s) {
    return String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1);
  }

  function _svcIcon(cat) {
    return SERVICE_ICONS[_norm(cat)] || '🔧';
  }

  function _isUrgent(r) {
    var d = _norm(r.description || '') + ' ' + _norm(r.service_category || '');
    return /urgence|urgent|fuite|panne|bloquée|bloque|gaz|inondation/.test(d)
      || _minAgo(r.created_at) > SLA_THRESHOLD_URGENT_MIN && _norm(r.status) === 'new';
  }

  /* ── Supabase data fetch ── */
  async function _fetchAll() {
    if (_refreshing) return;
    _refreshing = true;
    try {
      /* P0-1 fix (acc-v4b): robust resolver — mirrors acc-v3 pattern.
         admin.html does NOT load fixeo-supabase-core.js, so window.FixeoSupabase
         is never set. Use FixeoSupabaseClient.client (supabase-client.js) as
         primary, fall back to FixeoSupabase.getClient() for dashboard pages. */
      var sb = null;
      var _fsc = window.FixeoSupabaseClient;
      if (_fsc && _fsc.CONFIGURED) {
        try { await _fsc.ready(); } catch(_) {}
        if (_fsc.client) sb = _fsc.client;
      }
      if (!sb) {
        var _fs = window.FixeoSupabase;
        if (_fs && typeof _fs.getClient === 'function') {
          try { sb = await _fs.getClient(); } catch(_) {}
        }
      }
      if (!sb) { _refreshing = false; return; }

      /* service_requests — last 200, all non-cancelled */
      var [rRes, mRes] = await Promise.all([
        sb.from('service_requests')
          .select('id,service_category,city,description,status,created_at,client_profile_id')
          .not('status','eq','cancelled')
          .order('created_at', { ascending: false })
          .limit(200),
        sb.from('missions')
          .select('id,request_id,artisan_profile_id,status,agreed_price,commission_amount,created_at')
          .not('status','eq','cancelled')
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

      if (!rRes.error && rRes.data) _requests = rRes.data;
      if (!mRes.error && mRes.data) _missions  = mRes.data;

      /* artisans — from existing V1 loader or FixeoDB */
      try {
        if (window.FixeoDB && window.FixeoDB.getAllArtisans) {
          var arts = window.FixeoDB.getAllArtisans();
          if (arts && arts.length) _artisans = arts;
        } else if (window.__fxLoadedArtisans && window.__fxLoadedArtisans.length) {
          _artisans = window.__fxLoadedArtisans;
        } else {
          /* Fetch minimal artisan pool for availability stats */
          var aRes = await sb.from('artisans')
            .select('id,category,city,availability,verified,claimed,rating,response_time_min')
            .limit(900);
          if (!aRes.error && aRes.data) _artisans = aRes.data;
        }
      } catch (_) {}

    } catch (e) {
      console.warn(LOG, 'fetch error:', e && e.message);
    }
    _refreshing = false;
    _lastFetch  = Date.now();
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 1 — LIVE REQUEST FEED
  ═══════════════════════════════════════════════════════════════ */
  var _feedRendered = [];

  function _renderFeed() {
    var el = $('fxv4-feed-list');
    if (!el) return;

    var latest = _requests.slice(0, 20);
    /* Deduplicate by id */
    var seen = {};
    latest = latest.filter(function(r) { if (seen[r.id]) return false; seen[r.id]=1; return true; });

    if (!latest.length) {
      el.innerHTML = '<div class="fxv4-empty">Aucune demande récente</div>';
      if ($('fxv4-feed-count')) $('fxv4-feed-count').textContent = '0';
      return;
    }

    if ($('fxv4-feed-count')) $('fxv4-feed-count').textContent = latest.length;

    /* Only re-render if top item changed (avoid flicker) */
    var topId = latest[0] && latest[0].id;
    if (_feedRendered[0] === topId) {
      /* Just update time stamps */
      el.querySelectorAll('.fxv4-fi-ago').forEach(function(span, i) {
        if (latest[i]) span.textContent = _ago(latest[i].created_at);
      });
      return;
    }
    _feedRendered = latest.map(function(r) { return r.id; });

    el.innerHTML = '';
    latest.forEach(function(r, i) {
      var li = document.createElement('li');
      var urg = _isUrgent(r);
      li.className = 'fxv4-feed-item' + (urg ? ' urgent' : '') + (i < 3 ? ' entering' : '');
      var desc = (r.description || '').split(' [')[0].slice(0, 45);
      var svc  = _capitalize(r.service_category || 'Service');
      li.innerHTML =
        '<span class="fxv4-fi-ico">' + _svcIcon(r.service_category) + '</span>' +
        '<div class="fxv4-fi-body">' +
          '<div class="fxv4-fi-title">' + esc(desc || svc) + '</div>' +
          '<div class="fxv4-fi-meta">' +
            '<span class="fxv4-fi-city">' + esc(r.city || '—') + '</span>' +
            '<span class="fxv4-fi-svc">· ' + esc(svc) + '</span>' +
            '<span class="fxv4-fi-ago">' + esc(_ago(r.created_at)) + '</span>' +
          '</div>' +
        '</div>';
      el.appendChild(li);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 2 — SLA MONITOR
  ═══════════════════════════════════════════════════════════════ */
  function _renderSLA() {
    var newReqs = _requests.filter(function(r) { return _norm(r.status) === 'new'; });
    var buckets = { g:0, y:0, o:0, r:0 };
    newReqs.forEach(function(r) {
      var m = _minAgo(r.created_at);
      if      (m <= 5)  buckets.g++;
      else if (m <= 15) buckets.y++;
      else if (m <= 30) buckets.o++;
      else              buckets.r++;
    });
    var total = newReqs.length || 1;

    function setBar(id, count, cls) {
      var pct = Math.round(count / total * 100);
      var countEl = $(id + '-count');
      var fillEl  = $(id + '-fill');
      if (countEl) countEl.textContent = count;
      if (fillEl)  fillEl.style.width  = pct + '%';
    }
    setBar('fxv4-sla-g', buckets.g, 'green');
    setBar('fxv4-sla-y', buckets.y, 'yellow');
    setBar('fxv4-sla-o', buckets.o, 'orange');
    setBar('fxv4-sla-r', buckets.r, 'red');
    if ($('fxv4-sla-total')) $('fxv4-sla-total').textContent = newReqs.length + ' non assignées';
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 3 — CITY HEATMAP
  ═══════════════════════════════════════════════════════════════ */
  function _renderCityMap() {
    var el = $('fxv4-city-list');
    if (!el) return;

    /* Count requests per city */
    var cityReq = {};
    _requests.forEach(function(r) {
      var c = _capitalize(r.city || 'Autre');
      cityReq[c] = (cityReq[c] || 0) + 1;
    });

    /* Count available artisans per city */
    var cityArt = {};
    _artisans.forEach(function(a) {
      var c = _capitalize(a.city || 'Autre');
      if (_norm(a.availability || '') !== 'offline') {
        cityArt[c] = (cityArt[c] || 0) + 1;
      }
    });

    /* Build sorted list */
    var rows = Object.keys(cityReq).map(function(c) {
      return { city: c, req: cityReq[c], art: cityArt[c] || 0 };
    }).sort(function(a, b) { return b.req - a.req; }).slice(0, 10);

    if (!rows.length) {
      el.innerHTML = '<div class="fxv4-empty">Aucune donnée de ville</div>';
      return;
    }

    var maxReq = rows[0].req || 1;
    var colors = ['#E1306C','#E1306C','#FB923C','#FB923C','#FCD34D','#FCD34D','#20C997','#20C997','#405DE6','#405DE6'];

    el.innerHTML = '';
    rows.forEach(function(row, i) {
      var pct    = Math.round(row.req / maxReq * 100);
      var ratio  = row.art > 0 ? (row.req / row.art).toFixed(1) : '—';
      var satCls = row.art === 0 ? 'fxv4-sat-crit' : (parseFloat(ratio) > 2 ? 'fxv4-sat-warn' : 'fxv4-sat-ok');
      var satLbl = row.art === 0 ? 'Saturé' : (parseFloat(ratio) > 2 ? 'Tension' : 'OK');
      var color  = colors[i] || '#405DE6';

      var div = document.createElement('div');
      div.className = 'fxv4-city-row';
      div.innerHTML =
        '<span class="fxv4-city-name">' + esc(row.city) + '</span>' +
        '<div class="fxv4-city-bar-wrap">' +
          '<div class="fxv4-city-bar-track">' +
            '<div class="fxv4-city-bar-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
          '</div>' +
        '</div>' +
        '<div class="fxv4-city-stats">' +
          '<span class="fxv4-city-req">' + row.req + '</span>' +
          '<span class="fxv4-city-sat ' + satCls + '">' + satLbl + '</span>' +
        '</div>';
      el.appendChild(div);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 4 — ARTISAN AVAILABILITY
  ═══════════════════════════════════════════════════════════════ */
  function _renderAvailability() {
    var online=0, busy=0, offline=0;
    var catCount = {};
    _artisans.forEach(function(a) {
      var av = _norm(a.availability || 'offline');
      if      (av === 'available')  online++;
      else if (av === 'busy')       busy++;
      else                           offline++;

      /* Category counts (online only) */
      if (av !== 'offline') {
        var cat = _norm(a.category || a.service_category || 'autre');
        catCount[cat] = (catCount[cat]||0) + 1;
      }
    });

    if ($('fxv4-avail-online'))  $('fxv4-avail-online').textContent  = online;
    if ($('fxv4-avail-busy'))    $('fxv4-avail-busy').textContent    = busy;
    if ($('fxv4-avail-offline')) $('fxv4-avail-offline').textContent = offline;

    /* Category chips */
    var el = $('fxv4-cat-chips');
    if (!el) return;

    /* Count requests per category (last hour) */
    var catReq = {};
    _requests.forEach(function(r) {
      var cat = _norm(r.service_category || '');
      if (cat) catReq[cat] = (catReq[cat]||0) + 1;
    });

    var chips = SERVICES.map(function(s) {
      var avail = catCount[s] || 0;
      var demand = catReq[s] || 0;
      var stressed = demand > 0 && avail < demand;
      return { name: s, avail: avail, demand: demand, stressed: stressed };
    }).sort(function(a,b) { return b.demand - a.demand; });

    el.innerHTML = '';
    chips.forEach(function(c) {
      var span = document.createElement('span');
      span.className = 'fxv4-cat-chip' + (c.stressed ? ' stress' : (c.avail > 0 ? ' ok' : ''));
      span.textContent = _svcIcon(c.name) + ' ' + _capitalize(c.name) + ' (' + c.avail + ')';
      el.appendChild(span);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 5 — REVENUE ENGINE
  ═══════════════════════════════════════════════════════════════ */
  function _revenueFilter(missions, tab) {
    var now   = Date.now();
    var cutoff = {
      today: now - 86400000,
      week:  now - 604800000,
      month: now - 2592000000,
      all:   0
    }[tab] || 0;
    return missions.filter(function(m) {
      return new Date(m.created_at||0).getTime() >= cutoff
        && ['done','completed','validated'].indexOf(_norm(m.status)) !== -1;
    });
  }

  function _renderRevenue(tab) {
    tab = tab || _revTab;
    _revTab = tab;

    /* Highlight active tab */
    ['today','week','month','all'].forEach(function(t) {
      var btn = $('fxv4-rev-tab-' + t);
      if (btn) btn.className = 'fxv4-rev-tab' + (t === tab ? ' active' : '');
    });

    var filtered = _revenueFilter(_missions, tab);
    var gmv = 0, commission = 0;
    filtered.forEach(function(m) {
      var ap = parseFloat(m.agreed_price || 0);
      var cm = parseFloat(m.commission_amount || 0) || ap * 0.1;
      gmv        += ap;
      commission += cm;
    });
    var count  = filtered.length;
    var avg    = count > 0 ? Math.round(gmv / count) : 0;
    var avgCom = count > 0 ? Math.round(commission / count) : 0;

    function _fmt(n) {
      if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
      if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
      return Math.round(n).toString();
    }

    if ($('fxv4-rev-gmv'))      $('fxv4-rev-gmv').textContent      = _fmt(gmv) + ' MAD';
    if ($('fxv4-rev-com'))      $('fxv4-rev-com').textContent      = _fmt(commission) + ' MAD';
    if ($('fxv4-rev-missions')) $('fxv4-rev-missions').textContent = count;
    if ($('fxv4-rev-avg'))      $('fxv4-rev-avg').textContent      = avg + ' MAD';
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 6 — CONVERSION FUNNEL
  ═══════════════════════════════════════════════════════════════ */
  var FUNNEL_STEPS = [
    { key: 'all',         label: 'Demandes reçues',  color: '#405DE6' },
    { key: 'assigned',    label: 'Assignées',         color: '#833AB4' },
    { key: 'in_progress', label: 'Démarrées',         color: '#E1306C' },
    { key: 'completed',   label: 'Terminées',         color: '#FB923C' },
    { key: 'validated',   label: 'Validées',          color: '#20C997' }
  ];

  function _renderFunnel() {
    var el = $('fxv4-funnel');
    if (!el) return;

    /* Count by status */
    var counts = { all: _requests.length };
    ['assigned','in_progress','completed','validated'].forEach(function(st) {
      counts[st] = _requests.filter(function(r) { return _norm(r.status) === st; }).length;
    });

    var top = counts.all || 1;
    el.innerHTML = '';

    FUNNEL_STEPS.forEach(function(step, i) {
      var cnt  = counts[step.key] || 0;
      var pct  = Math.round(cnt / top * 100);
      var drop = i > 0 ? Math.round((1 - cnt / (counts[FUNNEL_STEPS[i-1].key] || 1)) * 100) : 0;

      var div = document.createElement('div');
      div.className = 'fxv4-funnel-step';
      div.innerHTML =
        '<div class="fxv4-funnel-bar-wrap">' +
          '<div class="fxv4-funnel-bar" style="width:' + pct + '%;background:' + step.color + '22;border-left:3px solid ' + step.color + '">' +
            '<span class="fxv4-funnel-label">' + esc(step.label) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="fxv4-funnel-stat">' + cnt + '</span>' +
        '<span class="fxv4-funnel-pct">' + (i > 0 ? '-' + drop + '%' : '') + '</span>';
      el.appendChild(div);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 7 — INCIDENT CENTER
  ═══════════════════════════════════════════════════════════════ */
  function _buildIncidents() {
    var incidents = [];

    /* I-1: Urgent requests unassigned >10 min */
    var urgUnassigned = _requests.filter(function(r) {
      return _norm(r.status) === 'new' && _isUrgent(r) && _minAgo(r.created_at) > 10;
    });
    urgUnassigned.forEach(function(r) {
      incidents.push({
        sev:   'crit',
        ico:   '🔴',
        title: 'Urgent non assigné — ' + esc(r.city || '?') + ' ' + esc(r.service_category || ''),
        sub:   'En attente depuis ' + Math.round(_minAgo(r.created_at)) + ' min',
        id:    r.id
      });
    });

    /* I-2: Any request unassigned > 30 min */
    var stale = _requests.filter(function(r) {
      return _norm(r.status) === 'new' && _minAgo(r.created_at) > 30;
    });
    if (stale.length > 0) {
      incidents.push({
        sev:   'crit',
        ico:   '⏰',
        title: stale.length + ' demande(s) sans artisan depuis >30 min',
        sub:   'SLA breach — action immédiate requise'
      });
    }

    /* I-3: Cities with zero available artisans but active demand */
    var cityDemand = {};
    _requests.filter(function(r) { return _norm(r.status) === 'new'; })
      .forEach(function(r) { var c = r.city||'?'; cityDemand[c] = (cityDemand[c]||0)+1; });
    var cityAvail = {};
    _artisans.forEach(function(a) {
      if (_norm(a.availability||'') === 'available') {
        var c = _capitalize(a.city||'?'); cityAvail[c] = (cityAvail[c]||0)+1;
      }
    });
    Object.keys(cityDemand).forEach(function(c) {
      if (!cityAvail[_capitalize(c)] && cityDemand[c] >= 2) {
        incidents.push({
          sev: 'warn', ico: '📍',
          title: 'Aucun artisan disponible à ' + esc(_capitalize(c)),
          sub:   cityDemand[c] + ' demande(s) active(s) sans couverture'
        });
      }
    });

    /* I-4: Missions in_progress for > 6 hours */
    var longMissions = _missions.filter(function(m) {
      return _norm(m.status) === 'in_progress' && _minAgo(m.created_at) > 360;
    });
    if (longMissions.length) {
      incidents.push({
        sev: 'warn', ico: '🔧',
        title: longMissions.length + ' mission(s) en cours depuis >6h',
        sub:   'Vérifier statut artisan'
      });
    }

    /* I-5: No missions at all (possible Supabase issue) */
    if (_requests.length > 10 && _missions.length === 0) {
      incidents.push({
        sev: 'warn', ico: '⚠️',
        title: 'Aucune mission créée',
        sub:   'Le pipeline mission peut être bloqué'
      });
    }

    /* Sort: crit first */
    incidents.sort(function(a,b) { return a.sev === 'crit' ? -1 : 1; });
    return incidents;
  }

  function _renderIncidents() {
    var el = $('fxv4-incident-list');
    if (!el) return;

    var incidents = _buildIncidents();
    if ($('fxv4-incident-count')) $('fxv4-incident-count').textContent = incidents.length || '0';

    if (!incidents.length) {
      el.innerHTML = '<div class="fxv4-incident-empty">✅ Aucun incident actif</div>';
      return;
    }

    el.innerHTML = '';
    incidents.slice(0, 8).forEach(function(inc) {
      var div = document.createElement('div');
      div.className = 'fxv4-incident sev-' + inc.sev;
      div.innerHTML =
        '<span class="fxv4-inc-ico">' + inc.ico + '</span>' +
        '<div class="fxv4-inc-body">' +
          '<div class="fxv4-inc-title">' + inc.title + '</div>' +
          '<div class="fxv4-inc-sub">' + esc(inc.sub) + '</div>' +
        '</div>' +
        '<span class="fxv4-inc-sev fxv4-sev-' + inc.sev + '">' +
          (inc.sev === 'crit' ? 'CRITIQUE' : inc.sev === 'warn' ? 'ATTENTION' : 'INFO') +
        '</span>';
      el.appendChild(div);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE 8 — CEO AI INSIGHTS
  ═══════════════════════════════════════════════════════════════ */
  function _buildInsights() {
    var insights = [];
    var now = Date.now();

    /* I-1: Peak city demand */
    var cityCount = {};
    _requests.forEach(function(r) {
      if (_minAgo(r.created_at) < 120) { // last 2h
        var c = _capitalize(r.city||'?');
        cityCount[c] = (cityCount[c]||0)+1;
      }
    });
    var topCity = Object.keys(cityCount).sort(function(a,b) { return cityCount[b]-cityCount[a]; })[0];
    if (topCity && cityCount[topCity] >= 3) {
      insights.push({
        cls: 'insight-alert', ico: '🔥',
        text: topCity + ' concentre ' + cityCount[topCity] + ' demandes dans les 2 dernières heures — forte activité détectée'
      });
    }

    /* I-2: SLA breach count */
    var slaBreached = _requests.filter(function(r) { return _norm(r.status) === 'new' && _minAgo(r.created_at) > 15; }).length;
    if (slaBreached > 0) {
      insights.push({
        cls: 'insight-alert', ico: '⚠️',
        text: slaBreached + ' demande' + (slaBreached > 1 ? 's' : '') + ' en attente depuis >15 min — risque de perte client'
      });
    }

    /* I-3: Top performing service */
    var svcCount = {};
    _requests.forEach(function(r) {
      var s = _norm(r.service_category||'');
      if (s) svcCount[s] = (svcCount[s]||0)+1;
    });
    var topSvc = Object.keys(svcCount).sort(function(a,b) { return svcCount[b]-svcCount[a]; })[0];
    if (topSvc) {
      insights.push({
        cls: 'insight-ok', ico: '📈',
        text: _capitalize(topSvc) + ' est le service le plus demandé (' + svcCount[topSvc] + ' demandes) — prioriser l\'acquisition artisans'
      });
    }

    /* I-4: Conversion rate */
    var total = _requests.length;
    var validated = _requests.filter(function(r) { return _norm(r.status) === 'validated'; }).length;
    if (total >= 5) {
      var convRate = Math.round(validated / total * 100);
      var cls = convRate >= 70 ? 'insight-ok' : (convRate >= 40 ? 'insight-warn' : 'insight-alert');
      insights.push({
        cls: cls, ico: '🎯',
        text: 'Taux de conversion global : ' + convRate + '% (' + validated + '/' + total + ' missions validées)'
      });
    }

    /* I-5: Artisan pool stress */
    var totalArt    = _artisans.length;
    var onlineArt   = _artisans.filter(function(a) { return _norm(a.availability||'') === 'available'; }).length;
    var poolRatio   = totalArt > 0 ? Math.round(onlineArt / totalArt * 100) : 0;
    if (totalArt > 0 && poolRatio < 10) {
      insights.push({
        cls: 'insight-alert', ico: '👷',
        text: 'Seulement ' + onlineArt + '/' + totalArt + ' artisans disponibles (' + poolRatio + '%) — pool sous pression critique'
      });
    }

    /* I-6: Revenue trend */
    var todayMissions  = _revenueFilter(_missions, 'today').length;
    var weekMissions   = _revenueFilter(_missions, 'week').length;
    var avgPerDay = weekMissions > 0 ? (weekMissions / 7).toFixed(1) : 0;
    if (weekMissions >= 3) {
      insights.push({
        cls: todayMissions >= parseFloat(avgPerDay) ? 'insight-ok' : 'insight-warn',
        ico: '💰',
        text: 'Missions aujourd\'hui : ' + todayMissions + ' (moyenne semaine : ' + avgPerDay + '/jour)'
      });
    }

    /* I-7: City saturation */
    var saturatedCities = [];
    var cityReqNow = {};
    _requests.filter(function(r) { return _norm(r.status) === 'new'; })
      .forEach(function(r) { var c = r.city||'?'; cityReqNow[c] = (cityReqNow[c]||0)+1; });
    var cityArtNow = {};
    _artisans.forEach(function(a) {
      if (_norm(a.availability||'') === 'available') {
        var c = _capitalize(a.city||'?'); cityArtNow[c] = (cityArtNow[c]||0)+1;
      }
    });
    Object.keys(cityReqNow).forEach(function(c) {
      var avail = cityArtNow[_capitalize(c)] || 0;
      if (cityReqNow[c] >= 3 && avail < cityReqNow[c]) saturatedCities.push(c);
    });
    if (saturatedCities.length > 0) {
      insights.push({
        cls: 'insight-alert', ico: '📍',
        text: saturatedCities.slice(0,3).join(', ') + ' : demande > offre artisans — recruter urgemment dans ces villes'
      });
    }

    return insights.slice(0, 6);
  }

  function _renderInsights() {
    var el = $('fxv4-insights-list');
    if (!el) return;

    /* Show thinking animation briefly */
    el.innerHTML =
      '<div class="fxv4-ai-thinking">' +
        '<div class="fxv4-ai-dot"></div>' +
        '<div class="fxv4-ai-dot"></div>' +
        '<div class="fxv4-ai-dot"></div>' +
        '<span>Analyse des données…</span>' +
      '</div>';

    setTimeout(function () {
      var insights = _buildInsights();
      el.innerHTML = '';
      if (!insights.length) {
        el.innerHTML = '<div class="fxv4-empty">Données insuffisantes pour les insights</div>';
        return;
      }
      insights.forEach(function(ins) {
        var div = document.createElement('div');
        div.className = 'fxv4-insight ' + ins.cls;
        div.innerHTML =
          '<span class="fxv4-ins-ico">' + ins.ico + '</span>' +
          '<div class="fxv4-ins-body">' +
            '<div class="fxv4-ins-text">' + esc(ins.text) + '</div>' +
            '<div class="fxv4-ins-time">Maintenant · IA Fixeo</div>' +
          '</div>';
        el.appendChild(div);
      });
    }, 800);
  }

  /* ═══════════════════════════════════════════════════════════════
     HTML BUILDER — 8-module war room
  ═══════════════════════════════════════════════════════════════ */
  function _buildWarRoom() {
    var div = document.createElement('div');
    div.id = 'fxv4-warroom';

    div.innerHTML = [
      /* Header */
      '<div class="fxv4-wr-head">',
        '<div class="fxv4-wr-brand">',
          '<span class="fxv4-wr-badge"><span class="fxv4-pulse-dot"></span>WAR ROOM</span>',
          '<span class="fxv4-wr-title">FIXEO COMMAND CENTER V4</span>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:10px">',
          '<span class="fxv4-wr-meta" id="fxv4-last-update">—</span>',
          '<button class="fxv4-wr-refresh" onclick="window.FixeoAccV4.refresh()">🔄 Actualiser</button>',
        '</div>',
      '</div>',

      '<div class="fxv4-modules">',

        /* ROW 1 — Feed + SLA (2 cols) */
        '<div class="fxv4-row-2">',

          /* M1 — LIVE FEED */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot red"></span>DEMANDES EN DIRECT</span>',
              '<span class="fxv4-card-count" id="fxv4-feed-count">—</span>',
            '</div>',
            '<ul id="fxv4-feed-list" class="fxv4-feed-list" aria-live="polite"></ul>',
          '</div>',

          /* M2 — SLA */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot amber"></span>MONITEUR SLA</span>',
              '<span class="fxv4-card-count" id="fxv4-sla-total">0 non assignées</span>',
            '</div>',
            '<div class="fxv4-sla-grid">',
              '<div class="fxv4-sla-bucket green">',
                '<div class="fxv4-sla-range">0–5 min</div>',
                '<div class="fxv4-sla-count" id="fxv4-sla-g-count">0</div>',
                '<div class="fxv4-sla-label">Vert ✓</div>',
              '</div>',
              '<div class="fxv4-sla-bucket yellow">',
                '<div class="fxv4-sla-range">5–15 min</div>',
                '<div class="fxv4-sla-count" id="fxv4-sla-y-count">0</div>',
                '<div class="fxv4-sla-label">Surveiller</div>',
              '</div>',
              '<div class="fxv4-sla-bucket orange">',
                '<div class="fxv4-sla-range">15–30 min</div>',
                '<div class="fxv4-sla-count" id="fxv4-sla-o-count">0</div>',
                '<div class="fxv4-sla-label">Alerte</div>',
              '</div>',
              '<div class="fxv4-sla-bucket red">',
                '<div class="fxv4-sla-range">30+ min</div>',
                '<div class="fxv4-sla-count" id="fxv4-sla-r-count">0</div>',
                '<div class="fxv4-sla-label">Critique !</div>',
              '</div>',
            '</div>',
            '<div class="fxv4-sla-bar-wrap" style="margin-top:8px">',
              '<div class="fxv4-sla-bar-label"><span>Répartition SLA</span></div>',
              '<div style="display:flex;flex-direction:column;gap:4px">',
                ['g:green:0–5','y:yellow:5–15','o:orange:15–30','r:red:30+'].map(function(x) {
                  var p = x.split(':'); return '' +
                  '<div style="display:flex;align-items:center;gap:6px">' +
                    '<span style="font-size:.58rem;color:rgba(255,255,255,.3);width:30px">' + p[2] + '</span>' +
                    '<div class="fxv4-sla-bar-track" style="flex:1">' +
                      '<div class="fxv4-sla-bar-fill fxv4-bar-' + p[1] + '" id="fxv4-sla-' + p[0] + '-fill" style="width:0%"></div>' +
                    '</div>' +
                  '</div>';
                }).join(''),
              '</div>',
            '</div>',
          '</div>',

        '</div>',/* /row-2 */

        /* ROW 2 — City + Artisan + Revenue (3 cols) */
        '<div class="fxv4-row-3">',

          /* M3 — CITY HEATMAP */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot violet"></span>HEATMAP VILLES</span>',
            '</div>',
            '<div id="fxv4-city-list" class="fxv4-city-list"></div>',
          '</div>',

          /* M4 — ARTISAN AVAILABILITY */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot green"></span>ARTISANS POOL</span>',
            '</div>',
            '<div class="fxv4-avail-grid">',
              '<div class="fxv4-avail-stat online"><div class="fxv4-avail-num" id="fxv4-avail-online">—</div><div class="fxv4-avail-lbl">Disponibles</div></div>',
              '<div class="fxv4-avail-stat busy"><div class="fxv4-avail-num" id="fxv4-avail-busy">—</div><div class="fxv4-avail-lbl">Occupés</div></div>',
              '<div class="fxv4-avail-stat offline"><div class="fxv4-avail-num" id="fxv4-avail-offline">—</div><div class="fxv4-avail-lbl">Hors ligne</div></div>',
            '</div>',
            '<div id="fxv4-cat-chips" class="fxv4-cat-chips" style="margin-top:8px"></div>',
          '</div>',

          /* M5 — REVENUE ENGINE */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot amber"></span>MOTEUR REVENUS</span>',
            '</div>',
            '<div class="fxv4-rev-tabs">',
              ['today:Auj.','week:Sem.','month:Mois','all:Tout'].map(function(x) {
                var p = x.split(':');
                return '<button class="fxv4-rev-tab' + (p[0]==='today'?' active':'') + '" ' +
                  'id="fxv4-rev-tab-' + p[0] + '" ' +
                  'onclick="window.FixeoAccV4.revTab(\'' + p[0] + '\')">' + p[1] + '</button>';
              }).join(''),
            '</div>',
            '<div class="fxv4-rev-kpis">',
              '<div class="fxv4-rev-kpi"><div class="fxv4-rev-num accent" id="fxv4-rev-gmv">—</div><div class="fxv4-rev-lbl">GMV</div></div>',
              '<div class="fxv4-rev-kpi"><div class="fxv4-rev-num accent" id="fxv4-rev-com">—</div><div class="fxv4-rev-lbl">Commissions</div></div>',
              '<div class="fxv4-rev-kpi"><div class="fxv4-rev-num" id="fxv4-rev-missions">—</div><div class="fxv4-rev-lbl">Missions</div></div>',
              '<div class="fxv4-rev-kpi"><div class="fxv4-rev-num" id="fxv4-rev-avg">—</div><div class="fxv4-rev-lbl">Ticket moyen</div></div>',
            '</div>',
          '</div>',

        '</div>',/* /row-3 */

        /* ROW 3 — Funnel + Incidents + AI (3 cols) */
        '<div class="fxv4-row-3b">',

          /* M6 — FUNNEL */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot blue"></span>FUNNEL OPÉRATIONNEL</span>',
            '</div>',
            '<div id="fxv4-funnel" class="fxv4-funnel"></div>',
          '</div>',

          /* M7 — INCIDENTS */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot red"></span>INCIDENTS</span>',
              '<span class="fxv4-card-count" id="fxv4-incident-count">0</span>',
            '</div>',
            '<div id="fxv4-incident-list" class="fxv4-incident-list"></div>',
          '</div>',

          /* M8 — AI INSIGHTS */
          '<div class="fxv4-card">',
            '<div class="fxv4-card-head">',
              '<span class="fxv4-card-title"><span class="fxv4-card-dot violet"></span>CEO AI INSIGHTS</span>',
            '</div>',
            '<div id="fxv4-insights-list" class="fxv4-insights-list"></div>',
          '</div>',

        '</div>',/* /row-3b */

      '</div>',/* /modules */
    ].join('');

    return div;
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER ALL MODULES
  ═══════════════════════════════════════════════════════════════ */
  function _renderAll() {
    _renderFeed();
    _renderSLA();
    _renderCityMap();
    _renderAvailability();
    _renderRevenue(_revTab);
    _renderFunnel();
    _renderIncidents();
    _renderInsights();

    /* Last update timestamp */
    var el = $('fxv4-last-update');
    if (el) {
      var d = new Date();
      el.textContent = 'Mis à jour : ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     FULL REFRESH (fetch + render)
  ═══════════════════════════════════════════════════════════════ */
  async function _refresh() {
    await _fetchAll();
    _renderAll();
  }

  /* ═══════════════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════════════ */
  function _init() {
    /* Inject war room ABOVE V3 sections in overview */
    var overview = document.getElementById('admin-section-overview');
    if (!overview) {
      console.warn(LOG, 'admin-section-overview not found — abort');
      return;
    }
    if (document.getElementById('fxv4-warroom')) return; /* idempotent */

    var warRoom = _buildWarRoom();
    overview.insertBefore(warRoom, overview.firstChild);

    /* Initial fetch + render */
    _refresh();

    /* Auto-refresh every 30s (faster than V3's 60s) */
    _timers.push(setInterval(function () {
      _refresh();
    }, 30000));

    /* Fast feed update every 5s (timestamps only if no new data) */
    _timers.push(setInterval(function () {
      _renderFeed();
    }, 5000));

    /* React to admin events */
    ['fixeo:client-request-updated','fixeo:state:updated','fixeo:admin:refresh',
     'fixeo:client-request-created'].forEach(function(ev) {
      window.addEventListener(ev, function () { setTimeout(_refresh, 200); });
    });

    console.log(LOG, VERSION + ' ready — 8 war room modules loaded');
  }

  /* ── Public API ── */
  window.FixeoAccV4 = {
    VERSION:  VERSION,
    refresh:  _refresh,
    revTab:   function(tab) { _revTab = tab; _renderRevenue(tab); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
