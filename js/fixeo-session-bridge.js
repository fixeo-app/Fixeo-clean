/**
 * FIXEO — Session Bridge v1.0
 * ============================
 * Bridges fixeo-supabase-core.js ↔ auth-global.js so that
 * Supabase session state drives the UI correctly on every page.
 *
 * Problems solved:
 *   1. Event name mismatch:
 *        fixeo-supabase-core dispatches 'fixeo:auth:updated'
 *        auth-global listens to           'fixeo:auth-changed'
 *        → this bridge re-dispatches 'fixeo:auth-changed' when
 *          'fixeo:auth:updated' fires, connecting the two systems.
 *
 *   2. Logout does not call Supabase signOut():
 *        fixeoGlobalLogout only clears localStorage — the Supabase
 *        JWT stays valid. This bridge wraps fixeoGlobalLogout to
 *        call FixeoSupabase.logout() first (which calls signOut).
 *
 *   3. Pages without fixeo-supabase-core.js (index.html):
 *        The bridge hydrates auth state from the Supabase SDK
 *        localStorage token if present, so auth-global.js can
 *        read the right user on first load.
 *
 * Load order (must be AFTER auth-global.js and fixeo-supabase-core.js):
 *   <script src="js/auth-global.js"></script>
 *   <script src="js/fixeo-supabase-core.js"></script>   (if present)
 *   <script src="js/fixeo-session-bridge.js"></script>  ← this file
 *
 * Safe on pages without fixeo-supabase-core.js — all calls guarded.
 */
;(function (window) {
  'use strict';

  /* ── 1. Event bridge: fixeo:auth:updated → fixeo:auth-changed ── */
  window.addEventListener('fixeo:auth:updated', function (e) {
    var detail = (e && e.detail) || {};
    var user    = detail.user   || null;
    var profile = detail.profile || null;

    /* If auth-global has the user already (e.g. from localStorage hydration),
       just trigger its render loop. */
    if (window.FixeoAuthSession && typeof window.FixeoAuthSession.apply === 'function') {
      window.FixeoAuthSession.apply();
    }

    /* Re-dispatch the event name that auth-global.js is actually listening to */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:auth-changed', {
        detail: { user: user, profile: profile }
      }));
    } catch (_) {}
  });

  /* ── 2. Logout bridge: wrap fixeoGlobalLogout to call Supabase signOut ── */
  function _patchLogout() {
    var original = window.fixeoGlobalLogout;

    window.fixeoGlobalLogout = async function (options) {
      options = options || {};

      /* Call real Supabase signOut first */
      if (window.FixeoSupabase && typeof window.FixeoSupabase.logout === 'function') {
        try {
          await window.FixeoSupabase.logout({ suppressRedirect: true });
        } catch (_) {}
      } else if (window.FixeoAuth && typeof window.FixeoAuth.signOut === 'function') {
        /* Fallback: FixeoAuth.signOut from fixeo-auth-supabase.js */
        try { await window.FixeoAuth.signOut(); } catch (_) {}
      }

      /* Then run original auth-global logout (clears localStorage + renders) */
      if (typeof original === 'function') {
        try {
          original({ redirectTo: options.redirectTo || 'index.html' });
        } catch (_) {
          window.location.href = options.redirectTo || 'index.html';
        }
      } else {
        window.location.href = options.redirectTo || 'index.html';
      }
    };

    /* Keep aliases in sync */
    window.fixeoLogout = window.fixeoGlobalLogout;
    window.logout      = window.fixeoGlobalLogout;
  }

  /* ── 3. Hydrate UI from live Supabase session on page load ── */
  async function _hydrateLiveSession() {
    if (!window.FixeoSupabase) return;       // not loaded on this page
    try {
      var session = await window.FixeoSupabase.getSession();
      if (session && session.user) {
        /* Session is live — ensure localStorage is in sync */
        await window.FixeoSupabase.syncUserFromSession(session);
        /* Trigger auth-global render */
        if (window.FixeoAuthSession && typeof window.FixeoAuthSession.apply === 'function') {
          window.FixeoAuthSession.apply();
        }
      } else if (session === null) {
        /* No Supabase session — if localStorage still has stale auth, clear it */
        var storedUser = window.FixeoAuthSession && typeof window.FixeoAuthSession.getUser === 'function'
          ? window.FixeoAuthSession.getUser()
          : null;
        var storedId = storedUser && storedUser.id;
        /* Only clear if the stored ID looks like a real UUID (Supabase user),
           not a local admin-001 or local-xxx entry */
        if (storedId && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(storedId)) {
          if (window.FixeoSupabase && typeof window.FixeoSupabase.clearLocalAuthCache === 'function') {
            window.FixeoSupabase.clearLocalAuthCache();
          }
          if (window.FixeoAuthSession && typeof window.FixeoAuthSession.apply === 'function') {
            window.FixeoAuthSession.apply();
          }
        }
      }
    } catch (_) {}
  }

  /* ── 4. onAuthStateChange: react to live Supabase events ── */
  async function _bindAuthStateChange() {
    if (!window.FixeoSupabase) return;
    try {
      var sb = await window.FixeoSupabase.getClient();
      if (!sb) return;
      sb.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT') {
          /* Supabase has signed out — ensure localStorage is also cleared */
          if (window.FixeoSupabase && typeof window.FixeoSupabase.clearLocalAuthCache === 'function') {
            window.FixeoSupabase.clearLocalAuthCache();
          }
          if (window.FixeoAuthSession && typeof window.FixeoAuthSession.apply === 'function') {
            window.FixeoAuthSession.apply();
          }
          /* Redirect to homepage if on a protected page */
          var page = (window.location.pathname.split('/').pop() || '').toLowerCase();
          var protected_ = ['dashboard-client.html', 'dashboard-artisan.html', 'admin.html'];
          if (protected_.indexOf(page) !== -1) {
            window.location.href = 'index.html';
          }
        }
      });
    } catch (_) {}
  }

  /* ── Init ── */
  function _init() {
    _patchLogout();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        _hydrateLiveSession();
        _bindAuthStateChange();
      });
    } else {
      _hydrateLiveSession();
      _bindAuthStateChange();
    }
  }

  /* Wait one microtask to ensure fixeoGlobalLogout is defined by auth-global.js first */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    /* Already past DOMContentLoaded — run after current call stack */
    setTimeout(_init, 0);
  }

  console.info('[FixeoSessionBridge] Ready');

})(window);
