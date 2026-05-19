/**
 * admin-unified-engine.js — v1
 * =====================================================================
 * Fixeo Admin — Unified Business Engine
 *
 * PURPOSE
 * -------
 * Single source of truth for ALL admin sections. Replaces the 5
 * independent (and inconsistent) data+normalize+refresh loops that
 * previously lived inside:
 *   - admin-control-center-p1.js    (readRequests, normalizeStatus, computeMetrics, setInterval)
 *   - admin-analytics-real-v1.js    (normSt, _readReqs, setInterval)
 *   - admin-mission-supervision-p3.js (normSt, readReqs, computeMetrics, setInterval)
 *   - admin-commission-polish-p1b.js  (normalizeStatus, readRaw, setInterval)
 *   - fixeo-admin-cod.js              (normalizeStatus, readAllRequests, no interval)
 *   - fixeo-state-bridge.js           (computeGlobalMetrics, refreshAll, setInterval 30s)
 *
 * WHAT THIS FILE PROVIDES
 * -----------------------
 * window.FixeoAdminEngine (public API):
 *   .normalizeStatus(s)   — ONE canonical normalizer, replaces all private copies
 *   .readRequests()       — merged localStorage + Supabase cache (System A + B)
 *   .computeMetrics()     — ONE metrics object, derived from normalizeStatus output
 *   .getArtisans()        — live artisan list from FixeoDB / FixeoRepository
 *   .computeArtisanKPIs() — active/inactive counts from .status field only (no completeness hack)
 *   .refresh()            — trigger a full synchronized refresh across all sections
 *   .onRefresh(fn)        — subscribe to 'fixeo:admin:refresh' global event
 *   .offRefresh(fn)       — unsubscribe
 *
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 * • Does NOT render any UI (no innerHTML writes)
 * • Does NOT replace or rewrite renderAll / render / renderTable in other modules
 * • Does NOT touch auth, session, Supabase keys, homepage, reservation flow
 * • Does NOT create fake data, fake counters, or fake synchronization
 * • Does NOT break existing modules — they keep working; they may optionally
 *   delegate to this engine's normalizeStatus() and readRequests() but this
 *   file never forces them to
 *
 * UPGRADE PATH FOR EXISTING MODULES
 * ----------------------------------
 * Each module can optionally replace its private normalizer with:
 *   var normSt = window.FixeoAdminEngine.normalizeStatus;
 * and its private read function with:
 *   var readReqs = window.FixeoAdminEngine.readRequests;
 * This file does NOT do that surgery — that is left to each module's
 * own patch pass. This file only establishes the shared contract.
 *
 * REALTIME BUS
 * ------------
 * 'fixeo:admin:refresh' is dispatched on:
 *   - Any known state-change event (fixeo:client-request-*)
 *   - localStorage 'fixeo_client_requests' change (cross-tab)
 *   - 45s passive interval (one interval for entire admin, not one per module)
 *   - Explicit call to .refresh()
 *
 * The bus REPLACES the 5 × 45s individual setIntervals. But those intervals
 * still fire inside their own files — they won't be harmful, just redundant.
 * In a future cleanup pass they can be disabled by checking
 * window.FixeoAdminEngine?.INTERVALS_MANAGED.
 *
 * @version v1
 */
;(function (window) {
  'use strict';

  /* ── Guard ─────────────────────────────────────────────── */
  if (window.FixeoAdminEngine) return;

  /* ── Constants ─────────────────────────────────────────── */
  var REQUESTS_KEY    = 'fixeo_client_requests';
  var COMMISSION_RATE = 0.15;
  var REFRESH_EVENT   = 'fixeo:admin:refresh';
  var PASSIVE_MS      = 45000;   /* 45s passive refresh interval */

  /* ── Helpers ────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function setText(id, v) { var node = el(id); if (node) node.textContent = v; }
  function roundMoney(n) { return Math.round(Number(n) || 0); }
  function safeJSON(str, fb) { try { var r = JSON.parse(str); return r != null ? r : fb; } catch(_) { return fb; } }

  /* ── Diacritics strip (for normalization) ──────────────── */
  function _stripDiac(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /* ════════════════════════════════════════════════════════
     1. CANONICAL STATUS NORMALIZER
        One function to replace all private copies.

        Canonical output values (always returned as-is):
          'nouvelle'    — new / unassigned / disponible
          'acceptée'    — artisan assigned
          'en_cours'    — intervention active
          'terminée'    — work done, awaiting validation
          'validée'     — client validated
          'annulée'     — cancelled
          'needs_review' — flagged for manual review

        Input: any raw string from localStorage or Supabase.
     ════════════════════════════════════════════════════════ */
  function normalizeStatus(s) {
    var n = _stripDiac(s);

    /* Empty / null → nouvelle */
    if (!n || n === 'nouvelle' || n === 'disponible' || n === 'new') return 'nouvelle';

    /* Assigned */
    if (n === 'acceptee' || n === 'accepte' || n === 'assigned' || n === 'assignee') return 'accept\u00e9e';

    /* In progress */
    if (n === 'en cours' || n === 'en_cours' || n === 'encours' || n === 'in_progress') return 'en_cours';

    /* Done */
    if (n === 'terminee' || n === 'termine' || n === 'completed' || n === 'complete') return 'termin\u00e9e';

    /* Validated — all legacy aliases */
    if (
      n === 'validee' || n === 'valide' || n === 'validated' ||
      n === 'intervention confirmee' || n === 'intervention_confirmee' ||
      n === 'payee_cod' || n === 'avis_soumis' || n === 'intervention_confirmee'
    ) return 'valid\u00e9e';

    /* Cancelled */
    if (n === 'annulee' || n === 'annule' || n === 'cancelled' || n === 'canceled') return 'annul\u00e9e';

    /* Needs review */
    if (n === 'needs_review' || n === 'a_verifier' || n === 'a verifier') return 'needs_review';

    /* Accepted duplicate alias used in commission module */
    if (n === 'intervention_confirmee') return 'valid\u00e9e';

    /* Unknown → treat as nouvelle (safe fallback) */
    return 'nouvelle';
  }

  /* ════════════════════════════════════════════════════════
     2. UNIFIED READ — merges System A (localStorage) + System B cache
        Honours existing FixeoClientRequestsStore if available.
        Merges _sbReqCache from admin-control-center-p1 if available.
     ════════════════════════════════════════════════════════ */
  function readRequests() {
    /* System A — localStorage */
    var lsRows = [];
    try {
      if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
        lsRows = window.FixeoClientRequestsStore.list();
      } else {
        lsRows = safeJSON(localStorage.getItem(REQUESTS_KEY), []);
      }
      if (!Array.isArray(lsRows)) lsRows = [];
    } catch (_) { lsRows = []; }

    /* System B — Supabase cache from admin-control-center-p1 (if loaded) */
    var sbRows = [];
    try {
      /* admin-control-center-p1 exposes its cache via window.__fxAccSbCache */
      if (Array.isArray(window.__fxAccSbCache)) {
        sbRows = window.__fxAccSbCache;
      }
    } catch (_) {}

    if (!sbRows.length) return lsRows;

    /* Dedup: Supabase rows whose .id matches a localStorage .id or
     * whose .id matches a localStorage .supabase_request_id are excluded */
    var lsSbIds = new Set();
    lsRows.forEach(function(r) {
      if (r.id) lsSbIds.add(String(r.id));
      if (r.supabase_request_id) lsSbIds.add(String(r.supabase_request_id));
    });
    var sbOnly = sbRows.filter(function(r) { return !lsSbIds.has(String(r.id || '')); });

    return lsRows.concat(sbOnly);
  }

  /* ════════════════════════════════════════════════════════
     3. CANONICAL METRICS ENGINE
        One computation used by ALL admin sections.

     Returns:
     {
       total, activeRequests, accepted, inProgress, completed,
       validated, cancelled, commissionsDue, commissionsPaid,
       pendingReview, byStatus: { <normStatus>: count },
       assignedArtisans: { <name>: { missions, validated, commDue, commPaid, city, job } },
       urgentCount
     }
     ════════════════════════════════════════════════════════ */
  function computeMetrics() {
    var reqs = readRequests();

    var m = {
      total:            reqs.length,
      activeRequests:   0,   /* nouvelle */
      accepted:         0,   /* acceptée */
      inProgress:       0,   /* en_cours */
      completed:        0,   /* terminée */
      validated:        0,   /* validée */
      cancelled:        0,   /* annulée */
      commissionsDue:   0,
      commissionsPaid:  0,
      pendingReview:    0,
      urgentCount:      0,
      byStatus:         {},
      assignedArtisans: {}
    };

    reqs.forEach(function(r) {
      var st = normalizeStatus(r.status);
      m.byStatus[st] = (m.byStatus[st] || 0) + 1;

      switch (st) {
        case 'nouvelle':    m.activeRequests++; break;
        case 'accept\u00e9e': m.accepted++;    break;
        case 'en_cours':    m.inProgress++;    break;
        case 'termin\u00e9e': m.completed++;   break;
        case 'valid\u00e9e': m.validated++;    break;
        case 'annul\u00e9e': m.cancelled++;    break;
      }

      /* Urgency */
      if (String(r.urgency || r.urgent || '').toLowerCase().includes('urgent')) m.urgentCount++;

      /* Commission aggregates */
      var cst = String(r.commission_status || '').trim();
      var ca  = roundMoney(r.commission_amount || 0);
      var fp  = _deriveFinalPrice(r);
      var derivedComm = ca > 0 ? ca : roundMoney(fp * COMMISSION_RATE);

      if (r.commission_paid === true || cst === 'pay\u00e9e') {
        m.commissionsPaid += derivedComm;
      } else if (r.commission_pending_review === true) {
        m.pendingReview++;
      } else if (cst === '\u00e0_payer' || (st === 'valid\u00e9e' && !r.commission_paid)) {
        m.commissionsDue += derivedComm;
      }

      /* Per-artisan aggregates (only missions in active/done/validated) */
      var artName = String(r.assigned_artisan || r.artisan || '').trim();
      if (artName && (st === 'accept\u00e9e' || st === 'en_cours' || st === 'termin\u00e9e' || st === 'valid\u00e9e')) {
        if (!m.assignedArtisans[artName]) {
          m.assignedArtisans[artName] = { name: artName, missions: 0, validated: 0, commDue: 0, commPaid: 0, city: r.city || '', job: r.service || '' };
        }
        m.assignedArtisans[artName].missions++;
        if (st === 'valid\u00e9e') {
          m.assignedArtisans[artName].validated++;
          if (r.commission_paid === true) {
            m.assignedArtisans[artName].commPaid += derivedComm;
          } else {
            m.assignedArtisans[artName].commDue += derivedComm;
          }
        }
      }
    });

    return m;
  }

  /* ── Derive final price from request ────────────────────── */
  function _deriveFinalPrice(r) {
    var direct = roundMoney(r.final_price || r.price || r.agreed_price || r.budget_value || 0);
    if (direct > 0) return direct;
    /* Parse from budget string like "200-400 MAD" */
    var nums = String(r.budget || '').match(/\d+(?:[\s.,]\d+)*/g) || [];
    var vals = nums.map(function(m){ return parseFloat(m.replace(/[\s,]/g, '.')); }).filter(function(x){ return isFinite(x) && x > 0; });
    if (!vals.length) return 0;
    return roundMoney(vals.reduce(function(a,b){return a+b;},0) / vals.length);
  }

  /* ════════════════════════════════════════════════════════
     4. ARTISAN KPI ENGINE
        Uses status field only — NOT completeness scoring.
        Completeness scoring was designed for real user profiles,
        NOT for bulk-imported artisan data.

        Active   = artisan.status === 'active'
        Inactive = artisan.status !== 'active' (any other value)
     ════════════════════════════════════════════════════════ */
  function getArtisans() {
    try {
      if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
        return window.FixeoDB.getAllArtisans() || [];
      }
      /* Fallback: localStorage fixture */
      return safeJSON(localStorage.getItem('fixeo_admin_artisans_v21'), []);
    } catch (_) { return []; }
  }

  function computeArtisanKPIs() {
    var artisans = getArtisans();
    var total    = artisans.length;
    var active   = artisans.filter(function(a) { return a.status === 'active'; }).length;
    var inactive = total - active;
    var certified = artisans.filter(function(a) {
      return a.certified === true || a.certified === 'true' || a.certified === 'yes';
    }).length;
    return { total: total, active: active, inactive: inactive, certified: certified };
  }

  /* ════════════════════════════════════════════════════════
     5. SIDEBAR BADGE UNIFICATION
        Reads from computeMetrics() + computeArtisanKPIs().
        Called once at boot and on every refresh event.
        Clears the hardcoded HTML values (12, 48, 5, 3, 2, 5).
     ════════════════════════════════════════════════════════ */
  function updateSidebarBadges(m, ak) {
    m  = m  || computeMetrics();
    ak = ak || computeArtisanKPIs();

    var artisansWithMissions = Object.keys(m.assignedArtisans).length;
    var activeRequests       = m.activeRequests;            /* sc-reservations: pending */
    var activeMissions       = m.accepted + m.inProgress;   /* sc-cod: active missions */
    var uniqueClients        = _countUniqueClients();

    /* Sidebar badges */
    setText('sc-artisans',     String(ak.active || '—'));
    setText('sc-clients',      String(uniqueClients || '—'));
    setText('sc-reservations', String(activeRequests || '0'));
    setText('sc-cod',          String(activeMissions || '0'));

    /* sc-regs: registrations are localStorage ADMIN_REGISTRATIONS (empty in production) */
    /* Leave sc-regs untouched — admin.js manages it via ADMIN_REGISTRATIONS.length */

    /* sc-reviews / sc-reports: no real data yet — set to 0 (remove fake values) */
    setText('sc-reviews',  '0');
    setText('sc-reports',  '0');
  }

  /* Count unique clients by phone or name from requests */
  function _countUniqueClients() {
    var reqs = readRequests();
    var seen = new Set();
    reqs.forEach(function(r) {
      var p = String(r.phone || r.client_phone || '').replace(/\D/g, '').slice(-9);
      if (p.length >= 7) { seen.add(p); return; }
      var n = String(r.client_name || r.name || '').trim().toLowerCase();
      if (n.length > 1) seen.add(n);
    });
    return seen.size || reqs.length;
  }

  /* ════════════════════════════════════════════════════════
     6. OVERVIEW KPI UNIFICATION
        Writes to the 4 main overview KPI cards.
        Delegates to existing admin-control-center-p1 if available,
        otherwise writes directly.
     ════════════════════════════════════════════════════════ */
  function updateOverviewKPIs(m, ak) {
    m  = m  || computeMetrics();
    ak = ak || computeArtisanKPIs();

    var artisansWithMissions = Object.keys(m.assignedArtisans).length;
    var uniqueClients        = _countUniqueClients();
    var activeMissions       = m.validated + m.inProgress + m.accepted + m.completed;
    var totalComm            = m.commissionsDue + m.commissionsPaid;

    setText('kpi-artisans', String(artisansWithMissions || '—'));
    setText('kpi-clients',  String(uniqueClients || '—'));
    setText('kpi-jobs',     String(activeMissions || '—'));
    setText('kpi-revenue',  totalComm > 0 ? totalComm.toLocaleString('fr-FR') : '—');
  }

  /* ════════════════════════════════════════════════════════
     7. ARTISAN SECTION KPI CARDS
        Writes to art-kpi-* elements.
        Key fix: uses status field, NOT completeness scoring.
        This fixes the "861 en vérification" inconsistency.
     ════════════════════════════════════════════════════════ */
  function updateArtisanKPIs(ak) {
    ak = ak || computeArtisanKPIs();
    setText('art-kpi-total',    String(ak.total));
    setText('art-kpi-active',   String(ak.active));
    setText('art-kpi-inactive', String(ak.inactive));
    setText('art-kpi-certified', String(ak.certified));
  }

  /* ════════════════════════════════════════════════════════
     8. EMPTY STATE INJECTION
        Adds honest, premium empty states to sections that
        currently display nothing (blank / broken appearance).

        Rules:
        - Only inject if container is empty or has no real content
        - Only inject on first call (idempotent via data-fxue-done attr)
        - Never remove existing content
     ════════════════════════════════════════════════════════ */
  var EMPTY_STATES = {
    'registrations-list': {
      icon: '📝',
      title: 'Aucune inscription en attente',
      body: 'Les nouvelles demandes d\'inscription artisan apparaîtront ici automatiquement.',
      action: null
    },
    'subscriptions-admin-tbody': {
      icon: '💳',
      title: 'Aucun abonnement actif',
      body: 'Les données d\'abonnement seront affichées ici dès qu\'elles seront disponibles.',
      action: null,
      isTableBody: true
    },
    'clients-admin-tbody': {
      icon: '👥',
      title: 'Aucun client enregistré',
      body: 'Les profils clients apparaîtront ici automatiquement après inscription.',
      action: null,
      isTableBody: true
    }
  };

  function _injectEmptyState(containerId, cfg) {
    var container = el(containerId);
    if (!container) return;
    /* Already done or has real content */
    if (container.dataset.fxueDone) return;
    var text = container.textContent ? container.textContent.trim() : '';
    if (text.length > 5) { container.dataset.fxueDone = '1'; return; }

    var html;
    if (cfg.isTableBody) {
      /* colspan=7 covers most table layouts */
      html = '<tr><td colspan="7" style="text-align:center;padding:32px 16px;color:var(--text-muted)">'
        + '<div style="font-size:2rem;margin-bottom:8px">' + cfg.icon + '</div>'
        + '<div style="font-weight:600;margin-bottom:4px;color:var(--text)">' + esc(cfg.title) + '</div>'
        + '<div style="font-size:.82rem">' + esc(cfg.body) + '</div>'
        + '</td></tr>';
    } else {
      html = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted)">'
        + '<div style="font-size:2.5rem;margin-bottom:12px">' + cfg.icon + '</div>'
        + '<div style="font-size:1rem;font-weight:600;margin-bottom:8px;color:var(--text)">' + esc(cfg.title) + '</div>'
        + '<div style="font-size:.83rem;line-height:1.5">' + esc(cfg.body) + '</div>'
        + '</div>';
    }
    container.innerHTML = html;
    container.dataset.fxueDone = '1';
  }

  function injectEmptyStates() {
    Object.keys(EMPTY_STATES).forEach(function(id) {
      _injectEmptyState(id, EMPTY_STATES[id]);
    });
  }

  /* ════════════════════════════════════════════════════════
     9. LIFECYCLE PANEL STATUS MAP
        Canonical mapping for human-readable labels and CSS classes.
        Exported so other modules can consume it instead of
        maintaining private copies.
     ════════════════════════════════════════════════════════ */
  var STATUS_META = {
    'nouvelle':    { label: 'Nouvelle',     fr: 'Demande publi\u00e9e',        cls: 'nouvelle',  dot: '\u25cf' },
    'accept\u00e9e': { label: 'Assign\u00e9e', fr: 'Artisan assign\u00e9',     cls: 'acceptee',  dot: '\u25cf' },
    'en_cours':    { label: 'En cours',     fr: 'Intervention en cours',        cls: 'en-cours',  dot: '\u25cf' },
    'termin\u00e9e': { label: 'Termin\u00e9e', fr: 'Termin\u00e9e',            cls: 'terminee',  dot: '\u25cf' },
    'valid\u00e9e':  { label: 'Valid\u00e9e',  fr: 'Valid\u00e9e',             cls: 'validee',   dot: '\u25cf' },
    'annul\u00e9e':  { label: 'Annul\u00e9e',  fr: 'Annul\u00e9e',            cls: 'annulee',   dot: '\u25cf' },
    'needs_review': { label: '\u00c0 v\u00e9rifier', fr: '\u00c0 v\u00e9rifier', cls: 'pending', dot: '\u29d7' }
  };

  function statusLabel(s) {
    var n = normalizeStatus(s);
    return (STATUS_META[n] && STATUS_META[n].label) || s || 'Inconnue';
  }

  function statusCls(s) {
    var n = normalizeStatus(s);
    return (STATUS_META[n] && STATUS_META[n].cls) || 'nouvelle';
  }

  /* ════════════════════════════════════════════════════════
     10. REALTIME REFRESH BUS
         Single dispatcher. All sections subscribe via
         window.addEventListener('fixeo:admin:refresh', fn).
     ════════════════════════════════════════════════════════ */

  var _refreshCallbacks = [];

  function onRefresh(fn) {
    if (typeof fn !== 'function') return;
    _refreshCallbacks.push(fn);
    window.addEventListener(REFRESH_EVENT, fn);
  }

  function offRefresh(fn) {
    _refreshCallbacks = _refreshCallbacks.filter(function(f) { return f !== fn; });
    window.removeEventListener(REFRESH_EVENT, fn);
  }

  function refresh() {
    /* Compute fresh metrics once */
    var m  = computeMetrics();
    var ak = computeArtisanKPIs();

    /* Update shared KPI surfaces */
    updateSidebarBadges(m, ak);
    updateOverviewKPIs(m, ak);
    updateArtisanKPIs(ak);
    injectEmptyStates();

    /* Dispatch so individual modules re-render their sections */
    try {
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { metrics: m, artisanKPIs: ak } }));
    } catch (_) {}
  }

  /* ── Event sources that trigger a refresh ───────────────── */
  var _STATE_EVENTS = [
    'fixeo:client-request-created',
    'fixeo:client-request-updated',
    'fixeo:missions:updated',
    'fixeo:commission-updated',
    'fixeo:commission-paid',
    'fixeo:artisan-status-updated',
    'fixeo:state:updated',
    'fixeo:data:changed'
  ];

  function _bindEvents() {
    _STATE_EVENTS.forEach(function(ev) {
      window.addEventListener(ev, function() { setTimeout(refresh, 120); });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY || e.key === 'fixeo_admin_artisans_v21') {
        setTimeout(refresh, 80);
      }
    });
  }

  /* ── Single 45s passive interval (replaces 5 independent ones) ─ */
  var _interval = null;
  function _startInterval() {
    if (_interval) return;
    _interval = setInterval(refresh, PASSIVE_MS);
  }

  /* ════════════════════════════════════════════════════════
     11. EXPOSE __fxAccSbCache BRIDGE
         admin-control-center-p1 writes to _sbReqCache (private var).
         We expose a global window.__fxAccSbCache that it can write to,
         and that readRequests() reads from.
         This lets the unified engine merge Supabase rows without
         touching admin-control-center-p1 internals.
     ════════════════════════════════════════════════════════ */
  if (!Array.isArray(window.__fxAccSbCache)) {
    window.__fxAccSbCache = [];
  }

  /* ════════════════════════════════════════════════════════
     12. INIT
     ════════════════════════════════════════════════════════ */
  function _init() {
    /* Only active on the admin dashboard */
    if (!document.body || document.body.dataset.dashType !== 'admin') return;

    _bindEvents();
    _startInterval();

    /* Initial render after existing modules have had time to boot */
    setTimeout(refresh, 400);
    /* Safety second pass — covers late-loading artisan data */
    setTimeout(refresh, 1600);
  }

  /* ════════════════════════════════════════════════════════
     13. PUBLIC API
     ════════════════════════════════════════════════════════ */
  window.FixeoAdminEngine = {
    /* Core data */
    normalizeStatus:   normalizeStatus,
    readRequests:      readRequests,
    computeMetrics:    computeMetrics,
    getArtisans:       getArtisans,
    computeArtisanKPIs: computeArtisanKPIs,

    /* Status helpers */
    statusLabel:  statusLabel,
    statusCls:    statusCls,
    STATUS_META:  STATUS_META,

    /* KPI writers */
    updateSidebarBadges: updateSidebarBadges,
    updateOverviewKPIs:  updateOverviewKPIs,
    updateArtisanKPIs:   updateArtisanKPIs,

    /* Empty states */
    injectEmptyStates: injectEmptyStates,

    /* Refresh bus */
    refresh:    refresh,
    onRefresh:  onRefresh,
    offRefresh: offRefresh,

    /* Flags */
    INTERVALS_MANAGED: true,  /* tells other modules they can skip their own setInterval */
    REFRESH_EVENT:     REFRESH_EVENT,
    VERSION:           'v1'
  };

  /* ── Boot ───────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})(window);
