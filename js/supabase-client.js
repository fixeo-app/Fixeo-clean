/**
 * FIXEO — Supabase Client Layer v1.0
 * ====================================
 * Usage: paste your project credentials at the top of this file.
 *
 * MANUAL STEP REQUIRED (once only):
 *   Replace FIXEO_SUPABASE_URL  with your project URL  (e.g. https://xxxx.supabase.co)
 *   Replace FIXEO_SUPABASE_ANON with your anon/public key
 *
 * Everything else is wired automatically.
 */

(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
   *  ❶  PASTE YOUR CREDENTIALS HERE
   * ══════════════════════════════════════════════════════════ */
  var SUPABASE_URL  = 'https://ztwtbgoqanqzwiiibtuh.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';
  /* ══════════════════════════════════════════════════════════ */

  var CONFIGURED = (
    SUPABASE_URL  !== 'FIXEO_SUPABASE_URL'  && SUPABASE_URL  !== '' &&
    SUPABASE_ANON !== 'FIXEO_SUPABASE_ANON' && SUPABASE_ANON !== ''
  );

  /* ── CDN loader ─────────────────────────────────────────── */
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  function _loadSDK(cb) {
    if (window.supabase && window.supabase.createClient) { cb(null); return; }
    var s = document.createElement('script');
    s.src = SUPABASE_CDN;
    s.onload  = function () { cb(null); };
    s.onerror = function () { cb(new Error('Failed to load Supabase SDK from CDN')); };
    document.head.appendChild(s);
  }

  /* ── Singleton client ───────────────────────────────────── */
  var _client = null;

  function _getClient() {
    if (_client) return _client;
    if (!window.supabase || !window.supabase.createClient) {
      console.error('[FixeoSupabaseClient] SDK not loaded yet. Use FixeoSupabaseClient.ready().');
      return null;
    }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'fixeo_supabase_session'
      }
    });
    return _client;
  }

  /* ── ready() promise — use for all async operations ─────── */
  var _readyPromise = null;

  function ready() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise(function (resolve, reject) {
      if (!CONFIGURED) {
        // Return a no-op stub so the rest of the app still works
        console.info('[FixeoSupabaseClient] Not configured — running in offline/localStorage mode.');
        resolve({ configured: false, client: null });
        return;
      }
      _loadSDK(function (err) {
        if (err) { console.error('[FixeoSupabaseClient] SDK load error:', err); reject(err); return; }
        var c = _getClient();
        if (!c) { reject(new Error('createClient failed')); return; }
        console.info('[FixeoSupabaseClient] ✅ Connected to', SUPABASE_URL);
        resolve({ configured: true, client: c });
      });
    });
    return _readyPromise;
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.FixeoSupabaseClient = {
    version:    '1.0',
    CONFIGURED: CONFIGURED,
    URL:        SUPABASE_URL,
    ready:      ready,
    get client() { return _getClient(); }
  };

  // Auto-init if configured
  if (CONFIGURED) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { ready(); });
    } else {
      ready();
    }
  }

})(window);
