/**
 * fixeo-confirmation-sync.js — v1
 * ==========================================================
 * Loaded exclusively on confirmation.html.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The COD booking flow on artisan-profile.html works like this:
 *
 *   1. processCOD() succeeds
 *   2. _bridgeToArtisanInbox() writes to fixeo_client_requests (localStorage)
 *   3. fixeo:client-request-created event fires
 *   4. window.location.href = 'confirmation.html'  ← navigation kills page
 *
 * Step 4 fires synchronously right after step 2. Any pending async
 * work — including the bridge's _mirrorToSupabase() — is destroyed
 * by the page unload before it can reach Supabase.
 *
 * confirmation.html is the safe landing zone: it loads AFTER the
 * navigation completes, localStorage is fully written and patched
 * (artisan_name, date, timeSlot, address, reservation_ref are all there),
 * and there is no further navigation to interrupt async work.
 *
 * WHAT THIS DOES
 * --------------
 * On DOMContentLoaded:
 *   1. Read fixeo_client_requests from localStorage
 *   2. Find records with no supabase_request_id (not yet synced)
 *      that were created in the last 10 minutes (new booking)
 *   3. Insert each unsynced record into public.service_requests
 *   4. Patch supabase_request_id back to localStorage for dedup
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * • Does NOT touch any UI on confirmation.html
 * • Does NOT block or delay page render (runs after DOMContentLoaded)
 * • Does NOT throw to the user on failure (all errors are console.warn)
 * • Does NOT modify reservation.js, cod-payment.js, or any pipeline
 * • Does NOT create duplicate rows (supabase_request_id dedup guard)
 * • Does NOT load fixeo-client-requests-store.js (reads LS directly)
 *
 * CONSTRAINTS
 * -----------
 * • reservation.js NOT touched
 * • cod-payment.js NOT touched
 * • fixeo-client-requests-store.js NOT touched
 * • confirmation.html UI NOT touched
 * • Requires supabase-client.js to be loaded on confirmation.html
 *
 * @version v1
 */
(function (window) {
  'use strict';

  var LOG    = '[FixeoConfirmSync v1]';
  var TABLE  = 'service_requests';
  var LS_KEY = 'fixeo_client_requests';

  /* Run only once per page load */
  if (window.__fixeoConfirmSyncLoaded) return;
  window.__fixeoConfirmSyncLoaded = true;

  /* ── Helpers ───────────────────────────────────────────── */
  function safeJSON(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch (_) { return fallback; }
  }

  function safeStr(v) { return String(v || '').trim(); }

  /**
   * Build the service_requests description field.
   * Encodes all rich booking metadata so admin supervision shows context.
   */
  function _buildDescription(req) {
    var base  = safeStr(req.description) || 'Demande Fixeo';
    var parts = [];

    var artisan = safeStr(req.artisan_name);
    var ref     = safeStr(req.reservation_ref);
    var phone   = safeStr(req.phone);
    var budget  = safeStr(req.budget);
    var urgency = safeStr(req.urgency);
    var address = safeStr(req.address);
    var date    = safeStr(req.date);
    var slot    = safeStr(req.timeSlot || req.time);

    if (artisan)                          parts.push('Artisan: ' + artisan);
    if (date)                             parts.push('Date: ' + date);
    if (slot)                             parts.push('Créneau: ' + slot);
    if (address)                          parts.push('Adresse: ' + address);
    if (phone)                            parts.push('Tél: ' + phone);
    if (budget)                           parts.push('Budget: ' + budget);
    if (urgency && urgency !== 'Normale') parts.push('Urgence: ' + urgency);
    if (ref)                              parts.push('Réf: ' + ref);

    return parts.length ? base + ' [' + parts.join(' · ') + ']' : base;
  }

  /**
   * Patch supabase_request_id back onto the localStorage record.
   * This prevents re-insertion on future page loads.
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
   * Insert one localStorage request record into Supabase service_requests.
   * Returns the new Supabase row id, or null on failure.
   */
  async function _insertOne(sb, req, clientProfileId) {
    var payload = {
      service_category : safeStr(req.service) || 'Service',
      city             : safeStr(req.city)    || 'Maroc',
      description      : _buildDescription(req),
      status           : 'new'
    };
    if (clientProfileId) payload.client_profile_id = clientProfileId;

    try {
      var res = await sb
        .from(TABLE)
        .insert(payload)
        .select('id')
        .single();

      if (res && res.error) {
        console.warn(LOG, 'Insert failed for', req.id, '—', res.error.code, res.error.message);
        return null;
      }
      return res && res.data && res.data.id ? res.data.id : null;
    } catch (e) {
      console.warn(LOG, 'Insert threw for', req.id, '—', e && e.message);
      return null;
    }
  }

  /**
   * Main sync function. Runs once on DOMContentLoaded.
   * Finds all fixeo_client_requests records created in the last 10 min
   * that have no supabase_request_id, and inserts them.
   */
  async function _sync() {
    /* ── 1. Require FixeoSupabaseClient ────────────────────── */
    var fsc = window.FixeoSupabaseClient;
    if (!fsc || !fsc.CONFIGURED) return; /* offline mode — no-op */

    var sb;
    try {
      var r = await fsc.ready();
      sb = (r && r.client) || fsc.client;
    } catch (e) {
      console.warn(LOG, 'Supabase not ready:', e && e.message);
      return;
    }
    if (!sb) return;

    /* ── 2. Resolve auth identity ───────────────────────────── */
    var clientProfileId = null;
    try {
      var sessionRes = await sb.auth.getSession();
      var session    = sessionRes && sessionRes.data && sessionRes.data.session;
      if (session && session.user && session.user.id) {
        var uid = session.user.id;
        try {
          var profRes = await sb.from('profiles').select('id').eq('id', uid).maybeSingle();
          clientProfileId = (profRes.data && profRes.data.id) ? profRes.data.id : uid;
        } catch (_) { clientProfileId = uid; }
      }
    } catch (_) { clientProfileId = null; }

    /* ── 3. Find unsynced records created in last 10 minutes ── */
    var raw = safeJSON(localStorage.getItem(LS_KEY), []);
    if (!Array.isArray(raw) || raw.length === 0) return;

    var tenMinAgo = Date.now() - 10 * 60 * 1000;
    var unsynced  = raw.filter(function (r) {
      if (r.supabase_request_id) return false; /* already synced */
      /* Check created_at timestamp */
      var ts = r.created_at ? new Date(r.created_at).getTime() : 0;
      return ts >= tenMinAgo;
    });

    if (unsynced.length === 0) {
      return; /* nothing to sync */
    }

    /* ── 4. Insert each unsynced record ─────────────────────── */
    for (var i = 0; i < unsynced.length; i++) {
      var req    = unsynced[i];
      var newId  = await _insertOne(sb, req, clientProfileId);
      if (newId) {
        _patchSupabaseId(req.id, newId);
        /* Notify listeners */
        try {
          window.dispatchEvent(new CustomEvent('fixeo:data:changed', {
            detail: { type: 'service_request_created', supabase_id: newId, local_id: req.id }
          }));
        } catch (_) {}
      }
    }
  }

  /* ── Boot ──────────────────────────────────────────────────
     Fire after DOMContentLoaded so page renders first.
     Use requestIdleCallback when available for zero render impact.
     ─────────────────────────────────────────────────────── */
  function _boot() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(function () { _sync().catch(function(e){ console.warn(LOG, e && e.message); }); }, { timeout: 4000 });
    } else {
      setTimeout(function () { _sync().catch(function(e){ console.warn(LOG, e && e.message); }); }, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

})(window);
