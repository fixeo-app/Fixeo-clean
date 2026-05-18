/**
 * fixeo-profile-provision.js  — v1
 * ==========================================================
 * Silent background profile provisioning.
 *
 * WHY THIS EXISTS
 * ---------------
 * service_requests.client_profile_id is a FK referencing
 * profiles.id. When an authenticated user visits artisan-profile.html
 * and books a service, fixeo-reservation-supabase-bridge.js attempts
 * to INSERT into service_requests. If the user has a valid Supabase
 * JWT but NO corresponding row in the profiles table the FK is
 * violated and the INSERT fails silently — the reservation stays
 * localStorage-only and is never visible cross-device.
 *
 * This file guarantees a profiles row exists for every authenticated
 * user, regardless of whether they signed up through the Fixeo form
 * (which creates the row) or arrived via OAuth / admin creation / test
 * account (which do not).
 *
 * WHAT IT DOES
 * ------------
 * 1. On DOMContentLoaded: checks for an existing Supabase session and
 *    provisions a profiles row if one is missing.
 * 2. Registers sb.auth.onAuthStateChange: fires _ensureProfileRow on
 *    every SIGNED_IN event (login, token refresh, tab restore).
 * 3. _ensureProfileRow:
 *    a. SELECT profiles WHERE id = auth.uid  (maybeSingle)
 *    b. If row exists → done (truly idempotent, zero writes)
 *    c. If row missing → INSERT minimal safe row
 *       { id, full_name, role, phone:'', city:'', created_at }
 *    d. On any error → single console.warn, no throw
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * • Does NOT overwrite any existing profile fields
 * • Does NOT block, delay, or affect booking UX
 * • Does NOT touch auth flow, auth UI, or localStorage
 * • Does NOT run for unauthenticated users
 * • Does NOT import, call, or depend on any other Fixeo module
 *   (uses FixeoSupabaseClient directly — already loaded on page)
 *
 * CONSTRAINTS RESPECTED
 * ----------------------
 * • fixeo-auth-supabase.js NOT touched
 * • auth-global.js NOT touched
 * • supabase-client.js NOT touched
 * • reservation.js NOT touched
 * • New standalone file only
 *
 * @version v1
 */
(function (window) {
  'use strict';

  var LOG = '[FixeoProfileProvision]';

  /* ── Guard: run only once ──────────────────────────────── */
  if (window.__fixeoProfileProvisionLoaded) return;
  window.__fixeoProfileProvisionLoaded = true;

  /* ── Helpers ───────────────────────────────────────────── */

  /**
   * Derive the best available display name from a Supabase user object.
   * Priority: user_metadata.full_name → user_metadata.name → email prefix
   */
  function _displayName(user) {
    var meta = (user && user.user_metadata) || {};
    return String(
      meta.full_name || meta.name ||
      (user && user.email ? user.email.split('@')[0] : '')
    ).trim() || 'Utilisateur';
  }

  /**
   * Derive the role from user_metadata. Falls back to 'client'.
   * Only 'client' and 'artisan' are valid data roles.
   */
  function _role(user) {
    var meta = (user && user.user_metadata) || {};
    var r = String(meta.role || '').toLowerCase().trim();
    return (r === 'artisan' || r === 'admin') ? r : 'client';
  }

  /**
   * Core async provision. Checks if a profiles row exists for userId;
   * if not, inserts one with minimal safe fields.
   *
   * @param {object} sb    — raw Supabase client
   * @param {object} user  — Supabase auth user object
   */
  async function _ensureProfileRow(sb, user) {
    if (!sb || !user || !user.id) return;
    var userId = user.id;

    try {
      /* ── Step 1: Check if row already exists ─────────────── */
      var checkRes = await sb
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (checkRes.error) {
        /* RLS may block the SELECT — this is non-fatal; attempt INSERT
         * anyway (upsert will be a no-op if row exists) */
        console.warn(LOG, 'profile check error:', checkRes.error.message || checkRes.error.code);
      }

      if (checkRes.data && checkRes.data.id) {
        /* Row exists — nothing to do */
        return;
      }

      /* ── Step 2: Row missing — INSERT minimal safe defaults ── */
      var insertRes = await sb
        .from('profiles')
        .insert({
          id         : userId,
          full_name  : _displayName(user),
          role       : _role(user),
          phone      : '',
          city       : '',
          created_at : new Date().toISOString()
        });

      if (insertRes.error) {
        /* 23505 = unique violation → row was inserted concurrently, safe */
        if (insertRes.error.code === '23505') return;
        console.warn(LOG, 'profile insert error:', insertRes.error.message || insertRes.error.code);
        return;
      }

      /* Silently succeeded — profile row now exists */

    } catch (err) {
      console.warn(LOG, 'unexpected error:', err && err.message);
    }
  }

  /**
   * Main entry point. Called after FixeoSupabaseClient is ready.
   */
  async function _init(sb) {
    if (!sb) return;

    /* ── A: Current session (page load / tab restore) ─────── */
    try {
      var sessionRes = await sb.auth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      if (session && session.user) {
        await _ensureProfileRow(sb, session.user);
      }
    } catch (e) {
      /* getSession failure is non-fatal */
      console.warn(LOG, 'getSession error:', e && e.message);
    }

    /* ── B: Future auth state changes (login / token refresh) ─
     * Fires on: SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED.
     * Using onAuthStateChange directly on raw client to avoid
     * dependencies on fixeo-auth-supabase.js (constrained file).
     */
    try {
      sb.auth.onAuthStateChange(function (event, session) {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
            session && session.user) {
          /* Fire-and-forget — never block auth flow */
          _ensureProfileRow(sb, session.user).catch(function (err) {
            console.warn(LOG, 'onAuthStateChange provision error:', err && err.message);
          });
        }
      });
    } catch (e) {
      console.warn(LOG, 'onAuthStateChange setup error:', e && e.message);
    }
  }

  /* ── Boot ──────────────────────────────────────────────── */
  /* Wait for FixeoSupabaseClient to be ready (async SDK load).
   * Uses the same ready() pattern as all other Fixeo files. */
  function _boot() {
    var fsc = window.FixeoSupabaseClient;
    if (!fsc || !fsc.CONFIGURED) {
      /* Supabase not configured (offline mode) — silent no-op */
      return;
    }
    fsc.ready().then(function () {
      var sb = fsc.client;
      _init(sb).catch(function (err) {
        console.warn(LOG, 'init error:', err && err.message);
      });
    }).catch(function (err) {
      console.warn(LOG, 'ready() error:', err && err.message);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    /* DOMContentLoaded already fired (deferred script) */
    _boot();
  }

})(window);
