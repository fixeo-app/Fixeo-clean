/**
 * fixeo-reservation-supabase-bridge.js  — v2
 * ==========================================================
 * Persistence bridge: System A (localStorage) → System B (Supabase).
 * Every confirmed request or booking is written to service_requests
 * immediately, regardless of whether the client is authenticated.
 *
 * WHY v2 EXISTS
 * -------------
 * v1 skipped guest (unauthenticated) users because the RLS policy
 * blocked anon INSERTs. This meant bookings only reached the admin
 * if the client happened to be logged in — which is almost never
 * the case for first-time visitors.
 *
 * v2 removes the auth gate for INSERT:
 *   - Authenticated users: insert with client_profile_id = auth UUID
 *   - Guest users:         insert with client_profile_id = NULL
 *
 * Prerequisite: apply supabase/guest_requests_rls.sql in Supabase
 * SQL Editor before deploying this file. That SQL:
 *   1. Drops NOT NULL on service_requests.client_profile_id
 *   2. Adds an anon INSERT policy (write-only, cannot SELECT/UPDATE/DELETE)
 *
 * WHAT THIS DOES
 * --------------
 * 1. Listens to 'fixeo:client-request-created' (dispatched by
 *    fixeo-client-requests-store.js after every localStorage write)
 * 2. Inserts a service_requests row with all available booking metadata
 *    encoded in the description field (no schema changes needed)
 * 3. Patches supabase_request_id back onto the localStorage record
 *    for cross-ref by admin-sb1 dedup and analytics
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * • Does NOT write to localStorage — that already happened
 * • Does NOT block, delay, or affect UX in any way
 * • Does NOT throw to the user on failure
 * • Does NOT require fixeo-supabase-core.js
 * • Does NOT touch reservation.js, cod-payment.js, or the COD pipeline
 * • Does NOT remove or alter System A behaviour
 *
 * FAILURE SAFETY
 * --------------
 * Every async step is try/catch. Failures log a single console.warn.
 * The localStorage record is unaffected by any Supabase failure.
 *
 * CONSTRAINTS
 * -----------
 * • reservation.js NOT touched
 * • fixeo-client-requests-store.js NOT touched
 * • COD pipeline NOT touched
 * • Homepage / hero / search NOT touched
 * • Version: v2 (bumped from v1 — guest insert support)
 *
 * @version v2
 */
(function (window) {
  'use strict';

  var LOG    = '[FixeoResBridge v2]';
  var TABLE  = 'service_requests';
  var LS_KEY = 'fixeo_client_requests';

  /* ── Guard: run only once per page ─────────────────────── */
  if (window.__fixeoResBridgeLoaded) return;
  window.__fixeoResBridgeLoaded = true;

  /* ── Helpers ───────────────────────────────────────────── */
  function safeJSON(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch (_) { return fallback; }
  }

  function safeStr(v) { return String(v || '').trim(); }

  /**
   * Patch `supabase_request_id` back onto the localStorage record so
   * admin-sb1 dedup and System A analytics can cross-reference.
   * Silent — never throws.
   */
  function _patchSupabaseId(localId, supabaseId) {
    try {
      var raw     = safeJSON(localStorage.getItem(LS_KEY), []);
      var patched = false;
      for (var i = raw.length - 1; i >= 0; i--) {
        if (String(raw[i].id) === String(localId)) {
          raw[i].supabase_request_id = supabaseId;
          patched = true;
          break;
        }
      }
      if (patched) localStorage.setItem(LS_KEY, JSON.stringify(raw));
    } catch (_) { /* non-critical */ }
  }

  /**
   * Build the description string that encodes all rich booking data.
   * No extra columns needed — admin-control-center-p1 maps description
   * back for display in the supervision panel.
   *
   * Format: "<human description> [key: val · key: val · ...]"
   */
  function _buildDescription(req) {
    var base  = safeStr(req.description) || 'Demande Fixeo';
    var parts = [];

    /* Rich booking metadata (from _bridgeToArtisanInbox patch) */
    var artisan = safeStr(req.artisan_name);
    var ref     = safeStr(req.reservation_ref);
    var phone   = safeStr(req.phone);
    var budget  = safeStr(req.budget);
    var urgency = safeStr(req.urgency);
    var address = safeStr(req.address);
    var date    = safeStr(req.date);
    var slot    = safeStr(req.timeSlot || req.time);

    if (artisan)                   parts.push('Artisan: ' + artisan);
    if (date)                      parts.push('Date: ' + date);
    if (slot)                      parts.push('Créneau: ' + slot);
    if (address)                   parts.push('Adresse: ' + address);
    if (phone)                     parts.push('Tél: ' + phone);
    if (budget)                    parts.push('Budget: ' + budget);
    if (urgency && urgency !== 'Normale') parts.push('Urgence: ' + urgency);
    if (ref)                       parts.push('Réf: ' + ref);

    return parts.length
      ? base + ' [' + parts.join(' · ') + ']'
      : base;
  }

  /**
   * Core async write. Works for both authenticated and guest clients.
   * For guests: client_profile_id = null (requires RLS patch applied).
   * For auth:   client_profile_id = Supabase auth UID.
   *
   * @param {object} req — normalised request from fixeo-client-requests-store
   */
  async function _mirrorToSupabase(req) {
    /* ── 1. Require FixeoSupabaseClient ────────────────────── */
    var fsc = window.FixeoSupabaseClient;
    if (!fsc || !fsc.CONFIGURED) {
      /* Supabase not configured (offline/local mode) — silent no-op */
      return;
    }

    var sb;
    try {
      await fsc.ready();
      sb = fsc.client;
    } catch (e) {
      console.warn(LOG, 'Supabase client not ready:', e && e.message);
      return;
    }
    if (!sb) return;

    /* ── 2. Resolve identity — guests get null, auth users get UUID ── */
    var clientProfileId = null; /* safe default for guests */
    try {
      var sessionRes = await sb.auth.getSession();
      var session    = sessionRes && sessionRes.data && sessionRes.data.session;
      if (session && session.user && session.user.id) {
        var userId = session.user.id;
        /* Try to resolve exact profiles.id (FK target) */
        try {
          var profRes = await sb
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
          clientProfileId = (profRes.data && profRes.data.id) ? profRes.data.id : userId;
        } catch (_) {
          clientProfileId = userId; /* fallback: auth UUID */
        }
      }
      /* For guests: clientProfileId stays null — allowed after RLS patch */
    } catch (e) {
      console.warn(LOG, 'Session check failed, proceeding as guest:', e && e.message);
      clientProfileId = null;
    }

    /* ── 3. Build payload ───────────────────────────────────── */
    var serviceCategory = safeStr(req.service)  || 'Service';
    var city            = safeStr(req.city)      || 'Maroc';
    var description     = _buildDescription(req);

    var payload = {
      service_category : serviceCategory,
      city             : city,
      description      : description,
      status           : 'new'
    };
    /* Only include FK column when we have a real profile UUID */
    if (clientProfileId) {
      payload.client_profile_id = clientProfileId;
    }

    /* ── 4. Insert ──────────────────────────────────────────── */
    var insertRes;
    try {
      insertRes = await sb
        .from(TABLE)
        .insert(payload)
        .select('id')
        .single();
    } catch (e) {
      console.warn(LOG, 'Insert threw:', e && e.message);
      return;
    }

    if (insertRes && insertRes.error) {
      console.warn(LOG, 'Insert error:', insertRes.error.message || insertRes.error.code);
      return;
    }

    var newId = insertRes && insertRes.data && insertRes.data.id;
    if (!newId) return;

    /* ── 5. Patch supabase_request_id back onto localStorage ── */
    _patchSupabaseId(req.id, newId);

    /* ── 6. Notify listeners (mission-mirror, dashboards) ───── */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:data:changed', {
        detail: {
          type        : 'service_request_created',
          supabase_id : newId,
          local_id    : req.id
        }
      }));
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════
     EVENT LISTENER — for non-navigating flows (index.html, dashboard)
     Fires AFTER localStorage write — System A is already durable.
     Fire-and-forget: never blocks or delays booking UX.

     NOTE: The COD artisan-profile booking flow redirects to
     confirmation.html immediately after dispatching this event.
     Page navigation kills any pending async work here.
     For that flow, fixeo-confirmation-sync.js handles the insert
     on the destination page, where the LS record is fully patched.

     This listener handles: urgent requests (index.html),
     dashboard-client requests — any flow without navigation.
     ═══════════════════════════════════════════════════════════ */
  window.addEventListener('fixeo:client-request-created', function (e) {
    var req = e && e.detail;
    if (!req || !req.id) return;
    _mirrorToSupabase(req).catch(function (err) {
      console.warn(LOG, 'Unhandled async error:', err && err.message);
    });
  });

})(window);
