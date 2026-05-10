/*
 * fixeo-mission-rehydration.js — V2-A2: Mission Rehydration & Server Trust Fallback
 * Version: v2a2
 *
 * ROLE:
 *   The read-side durability layer.
 *   V2-A1 writes localStorage state to Supabase.
 *   V2-A2 reads Supabase back into localStorage when local is sparse.
 *
 * ARCHITECTURE:
 *   localStorage  →  PRIMARY (always checked first, always wins for active sessions)
 *   Supabase      →  FALLBACK (only used when localStorage is sparse or missing)
 *
 * READ PRIORITY (invariant):
 *   1. localStorage validated missions
 *   2. if sparse/empty → Supabase mirrored missions
 *   3. normalize into SAME shape as fixeo_client_requests entries
 *
 * THREE HYDRATION PATHS:
 *   A. Dashboard restore     — runs at login when localStorage.count < 3
 *   B. Profile trust fallback — artisan-scoped query for validated missions
 *                               used by V1-H/J operational memory on profile page
 *   C. Explicit force         — window.FixeoMissionRehydration.forceHydrate()
 *
 * NORMALIZATION GUARANTEE:
 *   All Supabase rows are normalized to the SAME shape as fixeo_client_requests.
 *   V1-H/J rendering functions receive identical data structure regardless of source.
 *   Zero rendering code branching.
 *
 * NEVER TOUCHES:
 *   fixeo-client-requests-store.js (read via localStorage directly)
 *   fixeo-mission-system.js
 *   commission-lifecycle-p3a.js
 *   fixeo-supabase-core.js
 *   auth-global.js
 *   cod-payment.js
 *   slot-lock.js
 *   mission-lifecycle-p2.js
 *   Dashboards rendering
 *   V1-H/J rendering functions (data SOURCE changed, rendering unchanged)
 *   V2-A1 mirror system (complementary, not competing)
 */

(function (window) {
  'use strict';

  if (window._fxRehydrationLoaded) return;
  window._fxRehydrationLoaded = true;

  var LOG_PREFIX     = '[FixeoRehydration]';
  var STORE_KEY      = 'fixeo_client_requests';
  var SESSION_DASHBOARD_DONE = 'fxrh_dashboard_done';
  var ARTISAN_CACHE_KEY = 'fxrh_artisan_';  /* prefix for sessionStorage cache */
  var CACHE_TTL_MS   = 4 * 60 * 1000;       /* 4-minute in-memory cache per artisan */
  var DASHBOARD_SPARSE_THRESHOLD = 3;        /* hydrate only when count < this */
  var MAX_ROWS       = 30;                   /* max Supabase rows per query */
  var MIRROR_TABLE   = 'missions';

  /* ════════════════════════════════════════════════════════════
     SUPABASE CLIENT
  ════════════════════════════════════════════════════════════ */
  async function _clientReady() {
    try {
      var fsc = window.FixeoSupabaseClient;
      if (!fsc || !fsc.CONFIGURED) return null;
      var r = await fsc.ready();
      return (r && r.client) ? r.client : null;
    } catch (e) { return null; }
  }

  /* ════════════════════════════════════════════════════════════
     IDENTITY
  ════════════════════════════════════════════════════════════ */
  function _userId() {
    try {
      return (
        localStorage.getItem('sb_user_id') ||
        localStorage.getItem('fixeo_user_id') ||
        localStorage.getItem('user_id') || ''
      ).trim();
    } catch (e) { return ''; }
  }

  function _userRole() {
    try { return (localStorage.getItem('fixeo_role') || '').trim().toLowerCase(); }
    catch (e) { return ''; }
  }

  /* ════════════════════════════════════════════════════════════
     STATUS NORMALIZATION (mirrors fixeo-mission-mirror.js)
     Ensures Supabase status strings map to the same values
     FixeoClientRequestsStore uses — critical for V1-H/J filtering.
  ════════════════════════════════════════════════════════════ */
  function _normalizeStatus(raw) {
    var s = String(raw || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_]/g, '');
    if (!s || s === 'nouvelle' || s === 'disponible') return 'nouvelle';
    if (s === 'acceptee' || s === 'accepte') return 'acceptée';
    if (s === 'encours' || s === 'en_cours') return 'en_cours';
    if (s === 'terminee' || s === 'termine') return 'terminée';
    /* Both 'validée' and 'validated' (legacy) → 'validée' */
    if (s === 'validee' || s === 'valide' || s === 'validated') return 'validée';
    if (s === 'interventionconfirmee') return 'validée';
    return 'nouvelle';
  }

  /* ════════════════════════════════════════════════════════════
     NORMALIZATION — Supabase row → fixeo_client_requests shape
     This is the CRITICAL function that enables zero-regression
     rendering: V1-H/J receive the same object shape regardless
     of whether data came from localStorage or Supabase.

     Fields mapped to match normalizeRequest() in fixeo-client-requests-store.js.
  ════════════════════════════════════════════════════════════ */
  function _normalizeRow(row) {
    if (!row || !row.request_id) return null;
    var status = _normalizeStatus(row.status);

    return {
      /* Identity */
      id:                   String(row.request_id).trim(),
      reservation_ref:      String(row.reservation_ref || '').trim(),
      source:               String(row.source || 'hydrated').trim(),

      /* Service data */
      service:              String(row.service || 'Service Fixeo').trim(),
      city:                 String(row.city || '').trim(),
      description:          String(row.description || 'Restauré depuis Fixeo').trim(),
      budget:               String(row.budget || (row.agreed_price ? String(row.agreed_price) + ' MAD' : '')).trim(),
      urgency:              'Normale',
      phone:                String(row.client_phone || '').trim(),

      /* Status */
      status:               status,
      client_confirmation:  (status === 'validée') ? 'confirmée' : (status === 'terminée') ? 'en_attente' : '',
      locked:               status !== 'nouvelle',
      locked_at:            '',
      viewed:               false,

      /* Timestamps */
      created_at:           row.created_at  || new Date().toISOString(),
      accepted_at:          row.accepted_at  || '',
      completed_at:         row.completed_at || '',
      validated_at:         row.validated_at || '',

      /* Artisan */
      assigned_artisan:     String(row.artisan_name || '').trim() || null,
      assigned_artisan_id:  String(row.artisan_profile_id || '').trim() || null,

      /* IDs for hydration merge identity */
      client_profile_id:    String(row.client_profile_id || '').trim() || null,
      artisan_profile_id:   String(row.artisan_profile_id || '').trim() || null,

      /* Financial */
      final_price:          Number(row.agreed_price || 0),
      commission_amount:    0,
      commission_status:    '',
      commission_paid_at:   '',
      commission_paid_by:   '',
      artisan_net:          Number(row.agreed_price || 0),
      commission_paid:      false,

      /* Reviews */
      review_rating:        0,
      review_comment:       '',
      review_submitted:     false,
      review_date:          ''
    };
  }

  /* ════════════════════════════════════════════════════════════
     READ LOCAL — reads fixeo_client_requests directly
     (does NOT use FixeoClientRequestsStore.list() to avoid
     coupling to that NEVER-TOUCH file)
  ════════════════════════════════════════════════════════════ */
  function _readLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function _readLocalIds() {
    return new Set(_readLocal().map(function(r) { return String(r.id || '').trim(); }).filter(Boolean));
  }

  /* ════════════════════════════════════════════════════════════
     MERGE — safe additive merge into localStorage
     Rules:
       - existing local row → KEEP (never overwrite)
       - server row missing locally → ADD
       - dedup by id (request_id) OR reservation_ref
     Returns count of added rows.
  ════════════════════════════════════════════════════════════ */
  function _mergeIntoLocal(normalizedRows) {
    if (!normalizedRows || !normalizedRows.length) return 0;

    var rawLocal;
    try {
      rawLocal = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(rawLocal)) rawLocal = [];
    } catch (e) { rawLocal = []; }

    /* Build dedup sets: by id AND by reservation_ref (both are stable keys) */
    var localIds  = new Set(rawLocal.map(function(r) { return String(r.id  || '').trim(); }).filter(Boolean));
    var localRefs = new Set(rawLocal.map(function(r) { return String(r.reservation_ref || '').trim(); }).filter(Boolean));
    var added = 0;

    normalizedRows.forEach(function(row) {
      var rid = String(row.id || '').trim();
      var ref = String(row.reservation_ref || '').trim();

      /* Skip if already present by either key */
      if (rid && localIds.has(rid)) return;
      if (ref && localRefs.has(ref)) return;

      rawLocal.push(row);
      if (rid) localIds.add(rid);
      if (ref) localRefs.add(ref);
      added++;
    });

    if (added > 0) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(rawLocal));
      } catch (e) {
        console.warn(LOG_PREFIX, 'localStorage write failed:', e && e.message);
        return 0;
      }
    }
    return added;
  }

  /* ════════════════════════════════════════════════════════════
     PATH A — DASHBOARD HYDRATION
     Enhanced version of V2-A1 basic hydration.
     Runs once per browser session. Non-blocking.
     Sparse check: < DASHBOARD_SPARSE_THRESHOLD items in localStorage.
     Both client + artisan query paths.
  ════════════════════════════════════════════════════════════ */

  async function _dashboardHydrate() {
    /* Session guard */
    if (sessionStorage.getItem(SESSION_DASHBOARD_DONE)) return;

    /* Sparse check */
    var localCount = _readLocal().length;
    if (localCount >= DASHBOARD_SPARSE_THRESHOLD) {
      sessionStorage.setItem(SESSION_DASHBOARD_DONE, '1');
      return;
    }

    var client = await _clientReady();
    if (!client) return;

    /* Resolve user ID */
    var userId = _userId();
    if (!userId) {
      try {
        var s = await client.auth.getSession();
        userId = (s.data && s.data.session && s.data.session.user && s.data.session.user.id) || '';
      } catch (e) { /* noop */ }
    }
    if (!userId) return;

    var role   = _userRole();
    var column = (role === 'artisan') ? 'artisan_profile_id' : 'client_profile_id';

    try {
      var result = await client
        .from(MIRROR_TABLE)
        .select('request_id,service,city,budget,status,created_at,accepted_at,completed_at,validated_at,artisan_name,artisan_profile_id,client_profile_id,agreed_price,source,reservation_ref,description,client_phone')
        .eq(column, userId)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS);

      if (result.error) {
        var code = String(result.error.code || '');
        if (code !== '42501' && code !== '42503') {
          console.warn(LOG_PREFIX, 'dashboard hydrate query error:', result.error.message);
        }
        sessionStorage.setItem(SESSION_DASHBOARD_DONE, '1');
        return;
      }

      var rows = (result.data || []).map(_normalizeRow).filter(Boolean);
      var added = _mergeIntoLocal(rows);

      if (added > 0) {
        console.info(LOG_PREFIX, 'dashboard: restored', added, 'mission(s) from Supabase');
        /* Notify dashboards to re-render with restored data */
        try {
          window.dispatchEvent(new CustomEvent('fixeo:missions:updated', {
            detail: { hydrated: added, source: 'v2a2-dashboard' }
          }));
        } catch (evErr) { /* noop */ }
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'dashboard hydrate error:', e && e.message);
    }

    sessionStorage.setItem(SESSION_DASHBOARD_DONE, '1');
  }

  /* ════════════════════════════════════════════════════════════
     PATH B — PROFILE TRUST FALLBACK
     Artisan-scoped query: fetches validated missions for a specific
     artisan_profile_id from Supabase.

     Used by: fixeo-profile-v2a.js _v1jGetValidated() + injectOperationalMemory()
     when localStorage is sparse for that artisan (new client viewer).

     KEY DIFFERENCE from dashboard hydration:
       - Dashboard hydrates the VIEWER's own missions (their client_profile_id)
       - Profile trust queries missions FOR the ARTISAN (artisan_profile_id)
       These are completely separate queries.

     In-memory cache per artisan (4 min TTL) prevents re-fetching on
     multiple V1-H/J function calls in the same render pass.
  ════════════════════════════════════════════════════════════ */

  /* In-memory cache: artisanId → { data: [...], ts: Date.now() } */
  var _artisanCache = {};

  async function _fetchArtisanValidated(artisanId) {
    var aid = String(artisanId || '').trim();
    if (!aid) return [];

    /* In-memory cache hit */
    var cached = _artisanCache[aid];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return cached.data;
    }

    /* sessionStorage cache (survives multiple JS module instances) */
    var ssKey = ARTISAN_CACHE_KEY + aid;
    try {
      var ssRaw = sessionStorage.getItem(ssKey);
      if (ssRaw) {
        var ssParsed = JSON.parse(ssRaw);
        if (ssParsed && Array.isArray(ssParsed.data) && (Date.now() - (ssParsed.ts || 0)) < CACHE_TTL_MS) {
          _artisanCache[aid] = ssParsed;
          return ssParsed.data;
        }
      }
    } catch (e) { /* noop */ }

    var client = await _clientReady();
    if (!client) return [];

    try {
      var result = await client
        .from(MIRROR_TABLE)
        .select('request_id,service,city,status,created_at,accepted_at,completed_at,validated_at,artisan_name,artisan_profile_id,client_profile_id,agreed_price,source,reservation_ref,budget')
        .eq('artisan_profile_id', aid)
        .in('status', ['validée', 'validated', 'intervention_confirmée'])
        .order('validated_at', { ascending: false })
        .limit(MAX_ROWS);

      if (result.error) {
        var code = String(result.error.code || '');
        if (code !== '42501' && code !== '42503') {
          console.warn(LOG_PREFIX, 'artisan trust query error:', result.error.message);
        }
        return [];
      }

      var normalized = (result.data || []).map(_normalizeRow).filter(Boolean);
      /* Cache result */
      var cacheEntry = { data: normalized, ts: Date.now() };
      _artisanCache[aid] = cacheEntry;
      try { sessionStorage.setItem(ssKey, JSON.stringify(cacheEntry)); } catch (e) { /* noop */ }

      return normalized;
    } catch (e) {
      console.warn(LOG_PREFIX, 'artisan trust fetch error:', e && e.message);
      return [];
    }
  }

  /* ════════════════════════════════════════════════════════════
     getValidatedForArtisan (the PUBLIC trust API)
     Used by fixeo-profile-v2a.js to hydrate V1-H/J functions.

     LOGIC:
       1. Read localStorage for validated missions matching this artisan
       2. If count >= 2 → return local data (sufficient for rendering)
       3. If count < 2  → fetch from Supabase (new device / sparse)
       4. Merge server results into localStorage (additive only)
       5. Return merged set

     The 2-mission threshold is the minimum for V1-J rendering.
     Below it, we try Supabase; above it, localStorage is authoritative.
  ════════════════════════════════════════════════════════════ */

  function _localValidatedForArtisan(artisanId) {
    var aid     = String(artisanId || '').trim();
    var local   = _readLocal();
    var artName = '';
    try {
      var h1 = document.querySelector('#public-artisan-root h1, .public-hero-main h1');
      artName = h1 ? h1.textContent.trim().toLowerCase() : '';
    } catch (e) { /* noop */ }

    return local.filter(function(r) {
      /* Status check: validée (various normalizations) */
      var st = String(r.status || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_]/g, '');
      if (st !== 'validee' && st !== 'validated') return false;

      /* Artisan match: by ID or by name */
      if (aid && String(r.assigned_artisan_id || '').trim() === aid) return true;
      if (artName && String(r.assigned_artisan || r.artisan_name || '').trim().toLowerCase() === artName) return true;
      if (aid && String(r.artisan_profile_id || '').trim() === aid) return true;
      return false;
    });
  }

  async function getValidatedForArtisan(artisanId) {
    var localValidated = _localValidatedForArtisan(artisanId);

    /* Sufficient local data — return immediately */
    if (localValidated.length >= 2) return localValidated;

    /* Sparse → try Supabase */
    var serverRows = await _fetchArtisanValidated(artisanId);
    if (!serverRows.length) return localValidated;

    /* Merge into localStorage (future calls will find them locally) */
    var added = _mergeIntoLocal(serverRows);
    if (added > 0) {
      console.info(LOG_PREFIX, 'profile: restored', added, 'validated mission(s) for artisan', artisanId);
    }

    /* Return merged set: local + server (de-duplicated by id) */
    var localIds = new Set(localValidated.map(function(r) { return String(r.id || '').trim(); }));
    var merged   = localValidated.slice();
    serverRows.forEach(function(r) {
      if (!localIds.has(String(r.id || '').trim())) merged.push(r);
    });

    return merged;
  }

  /* ════════════════════════════════════════════════════════════
     INIT — page-type aware
     Dashboard pages: run PATH A (dashboard hydration)
     Profile pages: PATH B runs on-demand via getValidatedForArtisan()
     Both: deferred to allow auth to settle
  ════════════════════════════════════════════════════════════ */

  function _isDashboard() {
    try {
      var path = window.location.pathname;
      return path.includes('dashboard-client') || path.includes('dashboard-artisan');
    } catch (e) { return false; }
  }

  function _init() {
    if (_isDashboard()) {
      /* Dashboard: PATH A — hydrate after auth settles */
      setTimeout(function() {
        _dashboardHydrate().catch(function(e) {
          console.warn(LOG_PREFIX, 'dashboard init error:', e && e.message);
        });
      }, 2000);
    }
    /* Profile page: PATH B fires on-demand from fixeo-profile-v2a.js */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC API — window.FixeoMissionRehydration
  ════════════════════════════════════════════════════════════ */
  window.FixeoMissionRehydration = {
    version: 'v2a2',

    /* Primary trust API: used by fixeo-profile-v2a.js V1-H/J functions */
    getValidatedForArtisan: getValidatedForArtisan,

    /* Dashboard hydration — callable from dashboard pages directly */
    hydrateDashboard: function() {
      return _dashboardHydrate().catch(function(e) {
        console.warn(LOG_PREFIX, 'hydrateDashboard error:', e && e.message);
        return 0;
      });
    },

    /* Force a full hydration (bypasses session guards) */
    forceHydrate: function(artisanId) {
      sessionStorage.removeItem(SESSION_DASHBOARD_DONE);
      if (artisanId) {
        var aid = String(artisanId).trim();
        delete _artisanCache[aid];
        try { sessionStorage.removeItem(ARTISAN_CACHE_KEY + aid); } catch(e) {}
      }
      return _dashboardHydrate().catch(function(e) {
        console.warn(LOG_PREFIX, 'forceHydrate error:', e && e.message);
      });
    },

    /* Diagnostic: what's in local validated for an artisan */
    localValidated: _localValidatedForArtisan,

    /* Normalize utility (for testing) */
    normalizeRow: _normalizeRow
  };

})(window);
