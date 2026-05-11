/**
 * FIXEO — Global Logout v1.1  (fixeo-logout-global.js)
 * =====================================================
 * Single canonical logout path for all surfaces:
 *   mobile drawer · mobile avatar · desktop header ·
 *   dashboard · admin · auth container button
 *
 * LOAD ORDER: must be loaded AFTER supabase-client.js
 *             and BEFORE fixeo-session-mobile.js,
 *             fixeo-header-global.js, auth-global.js
 *
 * KEY CONTRACT:
 *   window.fixeoGlobalLogout(opts)  — primary entry point
 *   window.fixeoLogout(opts)        — alias
 *   window.logout(opts)             — alias
 *   opts.redirectTo  — override redirect target (default: 'index.html')
 *   opts.skipRedirect — boolean, skip redirect (for admin in-page logout)
 *
 * GHOST REHYDRATION GUARD:
 *   Sets fixeo_last_logout_at (timestamp ms) in sessionStorage.
 *   fixeo-session-mobile.js reads this and skips syncSessionToFixeo
 *   if the key is recent (< LOGOUT_GUARD_TTL_MS).
 *
 * PRESERVED operational keys (never cleared):
 *   fixeo_client_requests, fixeo_notifications_v1,
 *   fixeo_artisan_moderation, fixeo_missions_v2,
 *   fixeo_artisans_db, fixeo_reservations,
 *   fixeo_claim_requests, fixeo_avail_status,
 *   fixeo_notif_dedup_v1, fixeo_bridge_notifications,
 *   fixeo_artisan_moderation (admin work)
 */
;(function (window) {
  'use strict';

  if (window._fxLogoutV1Loaded) return;
  window._fxLogoutV1Loaded = true;

  /* ── Ghost-rehydration guard TTL (5 minutes) ────────────── */
  var LOGOUT_GUARD_KEY = 'fixeo_last_logout_at';
  var LOGOUT_GUARD_TTL_MS = 5 * 60 * 1000;

  /* ── ALL auth/session localStorage keys to clear ─────────── */
  var AUTH_LS_KEYS = [
    /* fixeo namespace */
    'fixeo_user',
    'fixeo_user_name',
    'fixeo_user_id',
    'fixeo_role',
    'fixeo_avatar',
    'fixeo_admin',
    'fixeo_logged',
    'fixeo_logged_in',
    'fixeo_token',
    'fixeo_session',
    'fixeo_profile',
    'fixeo_profile_status',
    'fixeo_notif_count',
    /* legacy user namespace */
    'user',
    'user_id',
    'user_name',
    'user_role',
    'user_status',
    'user_logged',
    'user_avatar',
    'user_city',
    'user_job',
    'user_phone',
    /* role shortcuts */
    'role',
    /* Supabase SDK custom storage key (supabase-client.js) */
    'fixeo_supabase_session',
    /* V2-C4A: artisan-specific profile/state keys (postdate original spec) */
    'sb_user_id',           /* legacy Supabase UUID — mission-mirror priority chain (sb_user_id > fixeo_user_id > user_id) */
    'user_description',     /* artisan service bio — dashboard profile form pre-fill; PII on shared device */
    'fixeo_portfolio',      /* artisan portfolio photos (base64 + server URLs) — shown on artisan dashboard */
    'fixeo_avail_status',   /* artisan availability choice — re-fetched from Supabase on next login (V1-C) */
    'fixeo_avail_off_since' /* artisan availability-off timestamp */
  ];

  /* ── sessionStorage keys to clear ───────────────────────── */
  var AUTH_SS_KEYS = [
    'fixeo_admin_auth',
    'fixeo_session',
    'fixeo_artisan_onboarding_notice_v1'
  ];

  /* ── Operational keys — NEVER touched ────────────────────── */
  /* (listed for documentation only, not used in code)
     fixeo_client_requests, fixeo_notifications_v1,
     fixeo_artisan_moderation, fixeo_missions_v2,
     fixeo_artisans_db, fixeo_reservations,
     fixeo_claim_requests,
     fixeo_notif_dedup_v1, fixeo_bridge_notifications  */

  /* ── Helpers ─────────────────────────────────────────────── */
  function _dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function _clearSbStarKeys() {
    /* Sweep localStorage for any sb-*-auth-token keys */
    try {
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k)) toRemove.push(k);
      }
      toRemove.forEach(function(k) { localStorage.removeItem(k); });
    } catch (_) {}
  }

  function _clearLocalStorage() {
    AUTH_LS_KEYS.forEach(function(k) {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    _clearSbStarKeys();
  }

  function _clearSessionStorage() {
    AUTH_SS_KEYS.forEach(function(k) {
      try { sessionStorage.removeItem(k); } catch (_) {}
    });
  }

  function _stampLogoutGuard() {
    try {
      sessionStorage.setItem(LOGOUT_GUARD_KEY, String(Date.now()));
    } catch (_) {}
  }

  function _dispatchAllEvents() {
    _dispatch('fixeo:auth-changed',  { user: null });
    _dispatch('fixeo:auth:changed',  { user: null });
    _dispatch('fixeo:auth:updated',  { user: null, profile: null });
    _dispatch('fixeo:session:cleared', {});
    _dispatch('fixeo:user:logout',   {});
  }

  function _updateBodyClasses() {
    try {
      document.body.classList.remove('is-logged-in', 'is-admin');
    } catch (_) {}
  }

  /* ── Supabase signOut ────────────────────────────────────── */
  async function _supabaseSignOut() {
    /* Preferred: FixeoSupabaseClient (supabase-client.js) — correct storageKey */
    if (window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED) {
      try {
        var res = await window.FixeoSupabaseClient.ready();
        var c = res && res.client ? res.client : (window.FixeoSupabaseClient.client);
        if (c && c.auth && typeof c.auth.signOut === 'function') {
          await c.auth.signOut();
          return;
        }
      } catch (e) {
        console.warn('[FixeoLogout] FixeoSupabaseClient signOut failed:', e.message || e);
      }
    }
    /* Fallback: FixeoSupabase.logout (fixeo-supabase-core.js) */
    if (window.FixeoSupabase && typeof window.FixeoSupabase.logout === 'function') {
      try {
        await window.FixeoSupabase.logout({ suppressRedirect: true });
        return;
      } catch (e) {
        console.warn('[FixeoLogout] FixeoSupabase.logout fallback failed:', e.message || e);
      }
    }
    /* Last resort: FixeoAuth.signOut (fixeo-auth-supabase.js) */
    if (window.FixeoAuth && typeof window.FixeoAuth.signOut === 'function') {
      try {
        await window.FixeoAuth.signOut();
        return;
      } catch (e) {
        console.warn('[FixeoLogout] FixeoAuth.signOut fallback failed:', e.message || e);
      }
    }
    /* Do NOT call window.supabase.auth.signOut() — wrong client instance */
  }

  /* ── Core logout function ────────────────────────────────── */
  async function _doLogout(opts) {
    opts = opts || {};
    var redirectTo = opts.redirectTo || 'index.html';
    var skipRedirect = opts.skipRedirect === true;

    /* 1. Stamp guard FIRST — stop rehydration before any async work */
    _stampLogoutGuard();

    /* 2. Supabase signOut (non-fatal) */
    try {
      await _supabaseSignOut();
    } catch (_) {}

    /* 3. Clear localStorage auth keys */
    _clearLocalStorage();

    /* 4. Clear sessionStorage auth keys */
    _clearSessionStorage();

    /* 5. Update body classes */
    _updateBodyClasses();

    /* 6. Dispatch events — let header/mobile/dashboard update */
    _dispatchAllEvents();

    /* 7. Notify auth-global to re-render (if loaded) */
    if (window.FixeoAuthSession && typeof window.FixeoAuthSession.apply === 'function') {
      try { window.FixeoAuthSession.apply(); } catch (_) {}
    }

    /* 8. Redirect */
    if (!skipRedirect) {
      var currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase();
      /* Avoid redirect loops */
      if (currentPage !== redirectTo.replace(/^.*\//, '')) {
        window.location.href = redirectTo;
      } else {
        window.location.reload();
      }
    }
  }

  /* ── Public API ──────────────────────────────────────────── */

  /**
   * Check if a recent logout happened (guard for rehydration).
   * Returns true if logout occurred within LOGOUT_GUARD_TTL_MS.
   */
  function isRecentLogout() {
    try {
      var ts = parseInt(sessionStorage.getItem(LOGOUT_GUARD_KEY) || '0', 10);
      return ts > 0 && (Date.now() - ts) < LOGOUT_GUARD_TTL_MS;
    } catch (_) { return false; }
  }

  /**
   * Canonical global logout.
   * Called from: mobile drawer, mobile avatar, header, dashboard, admin.
   */
  function fixeoGlobalLogout(opts) {
    /* Fire-and-forget async — caller does not need to await */
    _doLogout(opts || {}).catch(function(e) {
      console.warn('[FixeoLogout] Unexpected error:', e);
      /* Safety net: clear sync + redirect even if async failed */
      _clearLocalStorage();
      _clearSessionStorage();
      _updateBodyClasses();
      _dispatchAllEvents();
      if (!(opts && opts.skipRedirect)) {
        window.location.href = (opts && opts.redirectTo) || 'index.html';
      }
    });
  }

  /* Expose on window — three aliases */
  window.fixeoGlobalLogout = fixeoGlobalLogout;
  window.fixeoLogout        = fixeoGlobalLogout;
  window.logout             = fixeoGlobalLogout;

  /* Expose guard checker for fixeo-session-mobile.js */
  window.fixeoIsRecentLogout = isRecentLogout;
  window.FIXEO_LOGOUT_GUARD_KEY = LOGOUT_GUARD_KEY;

  /* Expose full key lists for external reference */
  window._fixeoAuthLsKeys = AUTH_LS_KEYS;

  console.info('[FixeoLogout v1.1] Ready');

})(window);
