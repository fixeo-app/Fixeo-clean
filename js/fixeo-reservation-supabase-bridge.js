/**
 * fixeo-reservation-supabase-bridge.js  — v1
 * ==========================================================
 * Transitional Supabase-first persistence bridge for the
 * public artisan-profile reservation flow (System A → B).
 *
 * WHY THIS EXISTS
 * ---------------
 * The main public booking flow (artisan-profile.html → reservation.js)
 * writes to localStorage (System A). The artisan/client dashboards and
 * all cross-device data queries run on Supabase (System B:
 * service_requests table). Without this bridge, a reservation made on
 * the public profile page is NEVER visible to an artisan on a second
 * device — the two systems are fully isolated.
 *
 * WHAT IT DOES
 * ------------
 * Listens to 'fixeo:client-request-created' — already dispatched by
 * fixeo-client-requests-store.js after every successful localStorage
 * write. For authenticated users it then:
 *   1. Reads the current Supabase session (non-blocking, via
 *      FixeoSupabaseClient which is already loaded on the page)
 *   2. Inserts a matching row into service_requests
 *   3. Patches `supabase_request_id` back onto the localStorage record
 *      so System A analytics, mission-mirror, and admin can cross-ref
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * • Does NOT write to localStorage first — that already happened
 * • Does NOT block, delay, or affect the booking UX in any way
 * • Does NOT throw to the user on failure
 * • Does NOT require fixeo-supabase-core.js to be loaded
 * • Does NOT write to service_requests for guest (unauthenticated) users
 *   (RLS blocks anon inserts — graceful no-op for guests)
 * • Does NOT remove, replace, or alter System A behaviour
 *
 * FAILURE SAFETY
 * --------------
 * Every async step is wrapped in try/catch. Failures log a single
 * console.warn. The System A localStorage record is unaffected.
 *
 * CONSTRAINTS RESPECTED
 * ----------------------
 * • reservation.js NOT touched
 * • fixeo-client-requests-store.js NOT touched
 * • COD pipeline NOT touched
 * • Homepage / hero / search NOT touched
 * • Version: v1 (bump on any change)
 *
 * @version v1
 */
(function (window) {
  'use strict';

  var LOG = '[FixeoResBridge]';
  var TABLE = 'service_requests';
  var LS_KEY = 'fixeo_client_requests';

  /* ── Guard: run only once ──────────────────────────────── */
  if (window.__fixeoResBridgeLoaded) return;
  window.__fixeoResBridgeLoaded = true;

  /* ── Helpers ───────────────────────────────────────────── */
  function safeJSON(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch (_) { return fallback; }
  }

  /**
   * Patch `supabase_request_id` back onto the localStorage record so
   * System A analytics / mission-mirror can cross-reference.
   * Silent — never throws.
   */
  function _patchSupabaseId(localId, supabaseId) {
    try {
      var raw = safeJSON(localStorage.getItem(LS_KEY), []);
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
   * Core async write. Gets the Supabase client from the already-loaded
   * FixeoSupabaseClient (supabase-client.js), checks for an active
   * session, then inserts into service_requests.
   *
   * @param {object} req — normalised request from fixeo-client-requests-store
   */
  async function _mirrorToSupabase(req) {
    /* ── 1. Require FixeoSupabaseClient (loaded by supabase-client.js) ── */
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

    /* ── 2. Check for authenticated session ─────────────────── */
    var sessionRes;
    try {
      sessionRes = await sb.auth.getSession();
    } catch (e) {
      console.warn(LOG, 'getSession failed:', e && e.message);
      return;
    }
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session || !session.user) {
      /* Guest booking — RLS blocks anon insert, graceful no-op */
      return;
    }
    var userId = session.user.id; /* Supabase UUID */

    /* ── 3. Resolve client_profile_id from profiles table ───── */
    /* We need the profiles.id (UUID) for the FK, not just auth.uid */
    var profileId = userId; /* fallback: auth UUID directly */
    try {
      var profRes = await sb
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (profRes.data && profRes.data.id) {
        profileId = profRes.data.id;
      }
      /* If no profiles row yet, we still use userId — Supabase will
       * reject with FK error which we catch below silently */
    } catch (_) { /* use userId fallback */ }

    /* ── 4. Build the service_requests payload ──────────────── */
    /* Map System A fields → System B schema (5 known columns).
     * service_category ← req.service (e.g. "Plombier")
     * city             ← req.city
     * description      ← req.description
     * status           ← 'new'
     * client_profile_id ← profileId
     * Extra metadata stored in description to preserve richness.
     */
    var serviceCategory = String(req.service || '').trim() || 'Service';
    var city = String(req.city || '').trim() || 'Maroc';
    var description = String(req.description || '').trim();

    /* Enrich description with reservation metadata if available */
    var metaParts = [];
    if (req.urgency && req.urgency !== 'Normale') metaParts.push('Urgence: ' + req.urgency);
    if (req.budget) metaParts.push('Budget: ' + req.budget);
    if (req.phone) metaParts.push('Tél: ' + req.phone);
    /* Artisan target (from metadata patch written by _bridgeToArtisanInbox) */
    var artisanTarget = String(req.artisan_name || '').trim();
    if (artisanTarget) metaParts.push('Artisan: ' + artisanTarget);
    if (req.reservation_ref) metaParts.push('Réf: ' + req.reservation_ref);

    if (metaParts.length) {
      description = description
        ? description + ' [' + metaParts.join(' · ') + ']'
        : metaParts.join(' · ');
    }
    description = description || 'Réservation Fixeo';

    /* ── 5. Insert into service_requests ─────────────────────── */
    var insertRes;
    try {
      insertRes = await sb
        .from(TABLE)
        .insert({
          client_profile_id : profileId,
          service_category  : serviceCategory,
          city              : city,
          description       : description,
          status            : 'new'
        })
        .select('id')
        .single();
    } catch (e) {
      console.warn(LOG, 'Insert threw:', e && e.message);
      return;
    }

    if (insertRes.error) {
      console.warn(LOG, 'Insert error:', insertRes.error.message || insertRes.error.code);
      return;
    }

    var newId = insertRes.data && insertRes.data.id;
    if (!newId) return;

    /* ── 6. Patch supabase_request_id back onto localStorage record ── */
    _patchSupabaseId(req.id, newId);

    /* Dispatch for any System B listeners (e.g. dashboards with
     * storage events) — mirrors fixeo-supabase-core dispatch pattern */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:data:changed', {
        detail: { type: 'service_request_created', supabase_id: newId, local_id: req.id }
      }));
    } catch (_) {}
  }

  /* ── Attach to System A event ──────────────────────────── */
  /* fixeo:client-request-created fires AFTER localStorage write succeeds,
   * so System A data is already durable before we attempt Supabase. */
  window.addEventListener('fixeo:client-request-created', function (e) {
    var req = e && e.detail;
    if (!req || !req.id) return;
    /* Fire-and-forget — never blocks UI */
    _mirrorToSupabase(req).catch(function (err) {
      console.warn(LOG, 'Unhandled async error:', err && err.message);
    });
  });

})(window);
