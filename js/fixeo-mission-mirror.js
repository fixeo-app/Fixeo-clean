/*
 * fixeo-mission-mirror.js — V2-A1: Mission Persistence Mirror
 * Version: v2c1
 * Role: Durable Supabase mirror of the localStorage mission lifecycle.
 *
 * ARCHITECTURE:
 *   localStorage  →  PRIMARY (instant, always wins for UX)
 *   Supabase      →  DURABLE MEMORY (async, silent failure)
 *
 * INVARIANTS:
 *   - UI NEVER waits for Supabase
 *   - localStorage NEVER blocked by network
 *   - Any Supabase failure → console.warn only, UX continues
 *   - No polling. No setInterval. No recursion. No storage event listeners.
 *   - All writes idempotent (upsert on request_id)
 *   - No new Supabase tables created
 *
 * HOOK STRATEGY (zero coupling to NEVER-TOUCH files):
 *   Listens to events already dispatched by FixeoClientRequestsStore:
 *     fixeo:client-request-created  → mirror as 'nouvelle'
 *     fixeo:client-request-updated  → mirror status transition
 *   Listens to events dispatched by mission-lifecycle-p2.js:
 *     fixeo:mission-started         → mirror as 'en_cours'
 *     fixeo:mission-completed       → mirror as 'terminée'
 *     fixeo:mission-validated       → mirror as 'validée'
 *
 * SUPABASE TARGET: missions table
 *   Upsert keyed on: request_id (stable across refreshes)
 *   Conflict resolution: ON CONFLICT (request_id) DO UPDATE
 *
 * NEVER TOUCHES:
 *   fixeo-client-requests-store.js
 *   fixeo-mission-system.js
 *   commission-lifecycle-p3a.js
 *   fixeo-supabase-core.js
 *   auth-global.js
 *   cod-payment.js
 *   payment.js
 *   slot-lock.js
 *   reservation.js lifecycle
 *   V1-A through V1-J pipeline
 *   Dashboards rendering logic
 */

(function (window) {
  'use strict';

  if (window._fxMirrorLoaded) return;
  window._fxMirrorLoaded = true;

  var LOG_PREFIX = '[FixeoMirror]';
  var STORE_KEY = 'fixeo_client_requests';
  var HYDRATE_KEY = 'fxmirror_hydrated';   /* set after first hydration per session */
  var MIRROR_TABLE = 'missions';

  /* ════════════════════════════════════════════════════════════
     SUPABASE CLIENT ACCESSOR
     Returns the Supabase JS client or null (non-blocking).
     Never throws. Uses the same FixeoSupabaseClient singleton
     already loaded on every page.
  ════════════════════════════════════════════════════════════ */
  function _getClient() {
    try {
      var fsc = window.FixeoSupabaseClient;
      if (!fsc || !fsc.CONFIGURED) return null;
      return fsc.client;
    } catch (e) { return null; }
  }

  async function _clientReady() {
    try {
      var fsc = window.FixeoSupabaseClient;
      if (!fsc || !fsc.CONFIGURED) return null;
      var r = await fsc.ready();
      return (r && r.client) ? r.client : null;
    } catch (e) { return null; }
  }

  /* ════════════════════════════════════════════════════════════
     IDENTITY — resolve current user IDs from localStorage
     Used to populate client_profile_id / artisan_profile_id
     without making extra Supabase auth calls.
     Priority: sb_user_id > fixeo_user_id > user_id
  ════════════════════════════════════════════════════════════ */
  function _userId() {
    try {
      return (
        localStorage.getItem('sb_user_id') ||
        localStorage.getItem('fixeo_user_id') ||
        localStorage.getItem('user_id') ||
        ''
      ).trim();
    } catch (e) { return ''; }
  }

  function _userRole() {
    try {
      return (localStorage.getItem('fixeo_role') || '').trim().toLowerCase();
    } catch (e) { return ''; }
  }

  /* ════════════════════════════════════════════════════════════
     STATUS NORMALIZATION
     Maps localStorage status strings → Supabase column values.
     Supabase column is text with no enum constraint (based on
     existing inserts using 'validated', 'nouvelle', etc).
     We use the same values the rest of the app expects.
  ════════════════════════════════════════════════════════════ */
  function _normalizeStatus(raw) {
    var s = String(raw || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_]/g, '');
    if (!s || s === 'nouvelle' || s === 'disponible') return 'nouvelle';
    if (s === 'acceptee' || s === 'accepte') return 'acceptée';
    if (s === 'encours' || s === 'en_cours') return 'en_cours';
    if (s === 'terminee' || s === 'termine') return 'terminée';
    if (s === 'validee' || s === 'valide' || s === 'validated') return 'validée';
    if (s === 'interventionconfirmee') return 'validée'; /* treat as validée for mirror */
    return 'nouvelle';
  }

  /* ════════════════════════════════════════════════════════════
     READ REQUEST FROM LOCALSTORAGE BY ID
     Used to get the full request object when an event fires
     with only a partial payload (id + status only).
  ════════════════════════════════════════════════════════════ */
  function _readRequestById(requestId) {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(raw)) return null;
      var rid = String(requestId).trim();
      return raw.find(function(r) { return String(r.id || '').trim() === rid; }) || null;
    } catch (e) { return null; }
  }

  /* ════════════════════════════════════════════════════════════
     BUILD MIRROR ROW
     Constructs the missions table payload from a localStorage request.
     Only maps fields that exist in the missions table schema.
     Fields not present in the schema are silently omitted —
     Supabase will ignore unknown columns on upsert.
  ════════════════════════════════════════════════════════════ */
  function _buildMirrorRow(req) {
    if (!req || !req.id) return null;

    var userId = _userId();
    var role   = _userRole();

    /* V2-A3: Resolve canonical artisan ID for Supabase write.
     * Priority: artisan_id_canonical (set by FixeoArtisanIdentity.attachCanonicalIdToRequest)
     *   → artisan_profile_id (may already be canonical from V2-A3 enrichment)
     *   → assigned_artisan_id (may be normalized name slug — kept as fallback)
     *   → artisanIdFromContext (authenticated user ID when role=artisan)
     * The canonical ID is the key that V2-A2 queries use to match against
     * the public profile URL param — they must agree on the same value.
     */
    var clientProfileId  = String(req.client_profile_id  || (role === 'client'  ? userId : '') || '').trim() || null;
    var artisanCanonical = '';
    if (window.FixeoArtisanIdentity) {
      artisanCanonical = String(
        req.artisan_id_canonical ||
        req.artisan_profile_id   ||
        req.assigned_artisan_id  ||
        (role === 'artisan' ? userId : '')
        || ''
      ).trim();
      /* If we only have a name slug (no hyphens, short, no digits beyond basic) but userId is real,
       * prefer userId (the authenticated artisan's own UUID is the strongest canonical value). */
      var hasOnlySlug = artisanCanonical
        && !/[0-9]{3,}/.test(artisanCanonical)           /* not a long numeric ID */
        && !artisanCanonical.includes('-')                /* not a UUID */
        && artisanCanonical.replace(/[^a-z_]/g,'').length > 4;
      if (hasOnlySlug && role === 'artisan' && userId) {
        artisanCanonical = userId;
      }
    } else {
      artisanCanonical = String(
        req.artisan_id_canonical || req.artisan_profile_id || req.assigned_artisan_id ||
        (role === 'artisan' ? userId : '')
        || ''
      ).trim();
    }
    var artisanProfileId = artisanCanonical || null;

    var status  = _normalizeStatus(req.status);
    var now     = new Date().toISOString();

    /* V2-C1: Supabase missions table has EXACTLY 7 columns:
     *   id, request_id, status, artisan_profile_id, client_profile_id,
     *   agreed_price, created_at
     * DO NOT write any other field — Supabase rejects unknown columns.
     *
     * UUID guard: artisan_profile_id is a UUID column. Non-UUID values
     * (name slugs, numeric IDs) cause 22P02 error. Filter strictly.
     */
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (artisanProfileId && !UUID_RE.test(artisanProfileId)) {
      /* Not a UUID — cannot write to UUID column. Silently drop. */
      console.warn(LOG_PREFIX, 'artisan_profile_id is not a UUID, skipping write:', artisanProfileId);
      artisanProfileId = null;
    }
    if (clientProfileId && !UUID_RE.test(clientProfileId)) {
      clientProfileId = null;
    }

    /* Extract numeric agreed_price (strip ' MAD' suffix if present) */
    var agreedPrice = null;
    var priceRaw = req.final_price || req.agreed_price || req.budget || '';
    var priceNum = parseFloat(String(priceRaw).replace(/[^0-9.]/g, ''));
    if (!isNaN(priceNum) && priceNum > 0) agreedPrice = priceNum;

    var row = {
      /* Stable identity — upsert key */
      request_id:         String(req.id).trim(),

      /* Status */
      status:             status,

      /* Participants — UUID only or null */
      artisan_profile_id: artisanProfileId,
      client_profile_id:  clientProfileId,

      /* Financial */
      agreed_price:       agreedPrice,

      /* Timestamp */
      created_at:         req.created_at || now,
    };

    /* Remove null / undefined values — keep payload minimal */
    Object.keys(row).forEach(function(k) {
      if (row[k] === null || row[k] === undefined) {
        delete row[k];
      }
    });

    return row;
  }

  /* ════════════════════════════════════════════════════════════
     CORE MIRROR WRITE — the single upsert function
     Called after every lifecycle transition.
     Non-blocking: micro-task via Promise chain.
     Silent failure: console.warn only.
  ════════════════════════════════════════════════════════════ */
  var _inFlight = {};  /* dedup guard: requestId → true */

  function _mirrorWrite(requestId) {
    /* Dedup: if already writing this request, skip */
    if (_inFlight[requestId]) return;
    _inFlight[requestId] = true;

    /* Kick off async write in micro-task */
    Promise.resolve().then(function() {
      return _doMirrorWrite(requestId);
    }).finally(function() {
      delete _inFlight[requestId];
    }).catch(function(e) {
      console.warn(LOG_PREFIX, 'unhandled error for', requestId, e);
      delete _inFlight[requestId];
    });
  }

  async function _doMirrorWrite(requestId) {
    var client = await _clientReady();
    if (!client) {
      /* Supabase not configured or offline — graceful noop */
      return;
    }

    /* Read the full request from localStorage at write-time
     * (not at event-time, which may have stale data from the event payload) */
    var req = _readRequestById(requestId);
    if (!req) {
      console.warn(LOG_PREFIX, 'request not found in localStorage:', requestId);
      return;
    }

    var row = _buildMirrorRow(req);
    if (!row || !row.request_id) {
      console.warn(LOG_PREFIX, 'could not build mirror row for:', requestId);
      return;
    }

    try {
      /* Upsert: INSERT if new request_id, UPDATE if existing.
       * onConflict('request_id') requires the column to have a unique constraint.
       * If the constraint doesn't exist, this falls back to INSERT with 23505 handling. */
      var result = await client
        .from(MIRROR_TABLE)
        .upsert(row, {
          onConflict: 'request_id',
          ignoreDuplicates: false /* always update on conflict */
        });

      if (result.error) {
        var code = String(result.error.code || '');
        if (code === '42501' || code === '42503') {
          /* RLS rejection — expected for unauthenticated or mismatched user */
          console.warn(LOG_PREFIX, 'RLS rejected write for', requestId, '— normal if not auth\'d as artisan/client');
        } else if (code === '23505') {
          /* Unique conflict not handled by upsert — attempt plain update */
          await _doUpdateWrite(client, row);
        } else {
          console.warn(LOG_PREFIX, 'upsert error for', requestId, result.error.message || result.error);
        }
      }
      /* Success: no log (keep console clean in production) */
    } catch (e) {
      console.warn(LOG_PREFIX, 'network/SDK error for', requestId, e && e.message);
    }
  }

  /* Fallback for when upsert conflicts and needs explicit update */
  async function _doUpdateWrite(client, row) {
    try {
      var updateRow = Object.assign({}, row);
      delete updateRow.request_id;  /* don't update the key column */
      delete updateRow.created_at;  /* preserve original creation time */

      await client
        .from(MIRROR_TABLE)
        .update(updateRow)
        .eq('request_id', row.request_id);
    } catch (e) {
      console.warn(LOG_PREFIX, 'fallback update error:', e && e.message);
    }
  }

  /* ════════════════════════════════════════════════════════════
     EVENT LISTENERS — zero-coupling hook strategy
     Attaches to events already dispatched by the lifecycle.
     Each listener is idempotent (guarded by _inFlight dedup).
     No modification of FixeoClientRequestsStore.
  ════════════════════════════════════════════════════════════ */

  function _getRequestId(detail) {
    /* Events may carry full request object or just {id, status} */
    if (!detail) return null;
    return String(detail.id || detail.request_id || '').trim() || null;
  }

  function _attachListeners() {
    /* ── Created: reservation.js → _bridgeToArtisanInbox → appendRequest ── */
    window.addEventListener('fixeo:client-request-created', function(e) {
      var rid = _getRequestId(e && e.detail);
      if (rid) _mirrorWrite(rid);
    });

    /* ── Updated: any status change via mutateRequest / acceptRequest ── */
    window.addEventListener('fixeo:client-request-updated', function(e) {
      var rid = _getRequestId(e && e.detail);
      if (rid) _mirrorWrite(rid);
    });

    /* ── mission-lifecycle-p2.js specific events (dispatch format: {id, status}) ── */
    window.addEventListener('fixeo:mission-started', function(e) {
      var rid = _getRequestId(e && e.detail);
      if (rid) _mirrorWrite(rid);
    });

    window.addEventListener('fixeo:mission-completed', function(e) {
      var rid = _getRequestId(e && e.detail);
      if (rid) _mirrorWrite(rid);
    });

    window.addEventListener('fixeo:mission-validated', function(e) {
      var rid = _getRequestId(e && e.detail);
      if (rid) _mirrorWrite(rid);
    });

    /* ── fixeo:missions:updated: batch signal from lifecycle-p2 ──
     * This fires after accept/start/complete. We re-mirror all active missions
     * in localStorage that have changed recently (within last 30s).
     * Throttled: max once per 2 seconds.
     */
    var _missionsBatchThrottle = null;
    window.addEventListener('fixeo:missions:updated', function() {
      if (_missionsBatchThrottle) return;
      _missionsBatchThrottle = setTimeout(function() {
        _missionsBatchThrottle = null;
        _mirrorAllActive();
      }, 2000);
    });
  }

  /* Mirror all active (non-completed) missions from localStorage.
   * Called after batch lifecycle events. Bounded by ACTIVE_LIMIT to
   * avoid writing stale historical data on every load.
   */
  var ACTIVE_LIMIT = 10;
  function _mirrorAllActive() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(raw)) return;
      var active = raw.filter(function(r) {
        var s = String(r.status || '').toLowerCase();
        return s === 'nouvelle' || s === 'acceptée' || s.includes('cours');
      });
      active.slice(0, ACTIVE_LIMIT).forEach(function(r) {
        if (r && r.id) _mirrorWrite(String(r.id));
      });
    } catch (e) { /* noop */ }
  }

  /* ════════════════════════════════════════════════════════════
     PHASE 5 — HYDRATION (light restore on new device / cleared storage)
     Trigger: dashboard load with empty localStorage + authenticated user.
     Reads from missions table → writes to fixeo_client_requests.
     Runs at most once per browser session (HYDRATE_KEY guard).
     Non-blocking. Non-aggressive. Merges only — never overwrites
     items already present in localStorage.
  ════════════════════════════════════════════════════════════ */

  async function _attemptHydration() {
    /* Only hydrate once per browser session */
    if (sessionStorage.getItem(HYDRATE_KEY)) return;

    /* Only hydrate when localStorage is actually sparse */
    var existingCount = 0;
    try {
      var existing = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      existingCount = Array.isArray(existing) ? existing.length : 0;
    } catch (e) { return; }

    if (existingCount >= 3) {
      /* localStorage is healthy — no hydration needed */
      sessionStorage.setItem(HYDRATE_KEY, '1');
      return;
    }

    var client = await _clientReady();
    if (!client) return;

    /* Verify user is authenticated */
    var userId = _userId();
    if (!userId) {
      try {
        var sessionResult = await client.auth.getSession();
        if (!sessionResult.data || !sessionResult.data.session) return;
        userId = sessionResult.data.session.user.id;
      } catch (e) { return; }
    }
    if (!userId) return;

    try {
      /* Query missions for this user (as client or artisan) */
      var role   = _userRole();
      var column = (role === 'artisan') ? 'artisan_profile_id' : 'client_profile_id';

      /* V2-C1: SELECT narrowed to confirmed-existing columns only.
       * missions table has 7 columns: id, request_id, status,
       * artisan_profile_id, client_profile_id, agreed_price, created_at.
       * All other columns have been removed to prevent 400 errors. */
      var UUID_RE_H = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE_H.test(userId)) {
        /* userId is not a UUID — cannot query UUID column safely */
        sessionStorage.setItem(HYDRATE_KEY, '1');
        return;
      }

      var result = await client
        .from(MIRROR_TABLE)
        .select('id,request_id,status,artisan_profile_id,client_profile_id,agreed_price,created_at')
        .eq(column, userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (result.error || !result.data || !result.data.length) {
        sessionStorage.setItem(HYDRATE_KEY, '1');
        return;
      }

      /* Merge into localStorage — only add items not already present */
      var rawLocal;
      try {
        rawLocal = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        if (!Array.isArray(rawLocal)) rawLocal = [];
      } catch (e) { rawLocal = []; }

      var localIds = new Set(rawLocal.map(function(r) { return String(r.id || '').trim(); }));
      var addedCount = 0;

      result.data.forEach(function(row) {
        var rid = String(row.request_id || row.id || '').trim();
        if (!rid || localIds.has(rid)) return; /* already present — skip */

        var rowStatus = _normalizeStatus(row.status);
        var ts = row.created_at || new Date().toISOString();
        /* Convert Supabase row → localStorage request format.
         * Fields absent from the narrow SELECT default to safe values. */
        rawLocal.push({
          id:              rid,
          service:         '',                /* not in schema */
          city:            '',                /* not in schema */
          budget:          row.agreed_price ? String(row.agreed_price) + ' MAD' : '',
          status:          rowStatus,
          created_at:      ts,
          accepted_at:     '',
          completed_at:    '',
          validated_at:    rowStatus === 'validée' ? ts : '',
          assigned_artisan: '',
          assigned_artisan_id: String(row.artisan_profile_id || '').trim(),
          client_profile_id:  String(row.client_profile_id  || '').trim(),
          reservation_ref: '',               /* not in schema */
          source:          'hydrated',
          final_price:     Number(row.agreed_price || 0),
          description:     'Restauré depuis Fixeo',
          phone:           '',
          urgency:         'Normale',
          locked:          rowStatus !== 'nouvelle',
          locked_at:       '',
          viewed:          false,
          commission_amount: 0,
          commission_status: '',
          commission_paid_at: '',
          commission_paid_by: '',
          artisan_net: 0,
          commission_paid: false,
          review_rating: 0,
          review_comment: '',
          review_submitted: false,
          review_date: ''
        });
        localIds.add(rid);
        addedCount++;
      });

      if (addedCount > 0) {
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(rawLocal));
          /* Notify dashboards that new data is available */
          try {
            window.dispatchEvent(new CustomEvent('fixeo:missions:updated', { detail: { hydrated: addedCount } }));
          } catch (evErr) { /* noop */ }
          console.info(LOG_PREFIX, 'hydrated', addedCount, 'mission(s) from Supabase');
        } catch (e) {
          console.warn(LOG_PREFIX, 'localStorage write failed during hydration:', e);
        }
      }

      sessionStorage.setItem(HYDRATE_KEY, '1');
    } catch (e) {
      console.warn(LOG_PREFIX, 'hydration error:', e && e.message);
      /* Do not set HYDRATE_KEY — allow retry on next load */
    }
  }

  /* ════════════════════════════════════════════════════════════
     INIT
     Deferred until DOMContentLoaded to avoid race with Supabase SDK.
     Hydration attempt runs after a brief delay (let auth settle first).
  ════════════════════════════════════════════════════════════ */
  function _init() {
    _attachListeners();

    /* Hydration: 2.5s delay allows auth-global.js + FixeoSupabaseClient to
     * fully initialize. Non-critical path — does not affect visible UX. */
    setTimeout(function() {
      _attemptHydration().catch(function(e) {
        console.warn(LOG_PREFIX, 'hydration setup error:', e && e.message);
      });
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC API — window.FixeoMissionMirror
     Exposed for manual writes from page-specific scripts and
     for future phases (V2-A2, etc) to trigger explicit syncs.
  ════════════════════════════════════════════════════════════ */
  window.FixeoMissionMirror = {
    version: 'v2c1',

    /* Explicit single-request mirror (e.g. after COD payment completion) */
    mirror: function(requestId) {
      var rid = String(requestId || '').trim();
      if (rid) _mirrorWrite(rid);
    },

    /* Mirror all requests currently in localStorage */
    mirrorAll: function() {
      try {
        var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        if (!Array.isArray(raw)) return;
        raw.slice(0, 20).forEach(function(r) {
          if (r && r.id) _mirrorWrite(String(r.id));
        });
      } catch (e) { /* noop */ }
    },

    /* Force a fresh hydration attempt (bypasses session guard) */
    forceHydrate: function() {
      sessionStorage.removeItem(HYDRATE_KEY);
      _attemptHydration().catch(function(e) {
        console.warn(LOG_PREFIX, 'forceHydrate error:', e && e.message);
      });
    }
  };

})(window);
