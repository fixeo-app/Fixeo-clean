/**
 * FIXEO Admin — Real-Time Operational Feed  v1a
 * js/admin-realtime-v1.js
 * ─────────────────────────────────────────────────────────────────
 * Subscribes to Supabase Realtime for canonical admin operational tables.
 * On relevant events, debounces and triggers existing canonical sync.
 * Falls back silently to 60s polling if Realtime is unavailable.
 *
 * TABLES SUBSCRIBED (authenticated client — respects RLS):
 *   public.service_requests  INSERT / UPDATE
 *   public.missions          INSERT / UPDATE
 *   public.claim_requests    INSERT / UPDATE
 *
 * SECURITY:
 *   Uses the existing authenticated Supabase browser client only.
 *   No privileged server key. No private channel secrets.
 *   Realtime access is bound by the same RLS policies as REST reads.
 *
 * IDEMPOTENT GUARD:
 *   window._fxAdminRtV1Loaded — safe to script-tag include multiple times.
 *
 * PUBLIC API:
 *   window.FixeoAdminRealtime.status()  — 'active' | 'error' | 'inactive'
 *   window.FixeoAdminRealtime.restart() — force channel reconnect
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';
  if (window._fxAdminRtV1Loaded) return;
  window._fxAdminRtV1Loaded = true;

  var VERSION = 'v1a';
  var LOG     = '[FxAdminRT]';

  /* ── Logging helpers ─────────────────────────────────────── */
  function log()  { var a = Array.prototype.slice.call(arguments); a.unshift(LOG); console.log.apply(console, a); }
  function warn() { var a = Array.prototype.slice.call(arguments); a.unshift(LOG); console.warn.apply(console, a); }

  /* ── Config ──────────────────────────────────────────────── */
  var DEBOUNCE_MS    = 1200;  /* debounce window — aggregate burst events */
  var RECONNECT_MS   = 8000;  /* wait before reconnect on channel error */
  var TABLES         = ['service_requests', 'missions', 'claim_requests'];
  var CHANNEL_NAME   = 'fxadmin-ops-v1';

  /* ── State ───────────────────────────────────────────────── */
  var _channel      = null;
  var _debounceTimer = null;
  var _status       = 'inactive'; /* inactive | active | error */
  var _lastEventAt  = 0;
  var _reconnectTimer = null;

  /* ── Get authenticated Supabase client ───────────────────── */
  function _getSb() {
    if (window.FixeoSupabaseClient && typeof window.FixeoSupabaseClient.getClient === 'function') {
      return window.FixeoSupabaseClient.getClient();
    }
    if (window.FixeoSupabaseCore && typeof window.FixeoSupabaseCore.getClient === 'function') {
      return window.FixeoSupabaseCore.getClient();
    }
    if (window._fixeoSupabaseClient) return Promise.resolve(window._fixeoSupabaseClient);
    return Promise.reject(new Error('No Supabase client available'));
  }

  /* ── Debounced canonical refresh ─────────────────────────── */
  function _scheduleRefresh(table, eventType) {
    _lastEventAt = Date.now();
    log('Event:', eventType, 'on', table, '— refresh scheduled');

    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      _triggerCanonicalSync(table);
    }, DEBOUNCE_MS);
  }

  function _triggerCanonicalSync(table) {
    /* 1. Canonical sync (admin-canonical-sync-v1.js) */
    if (window.FixeoAdminCanonicalSync && typeof window.FixeoAdminCanonicalSync.sync === 'function') {
      window.FixeoAdminCanonicalSync.sync();
    }

    /* 2. V4 command center refresh if present */
    if (window.FixeoAccV4 && typeof window.FixeoAccV4.refresh === 'function') {
      window.FixeoAccV4.refresh();
    }

    /* 3. Admin engine if present */
    if (window.FixeoAdminEngine && typeof window.FixeoAdminEngine.refresh === 'function') {
      window.FixeoAdminEngine.refresh();
    }

    /* 4. Freshness indicator */
    _updateFreshnessIndicator();

    /* 5. Pulse highlight if service_requests INSERT (urgent new request) */
    if (table === 'service_requests') {
      _pulseUrgentIndicator();
    }
  }

  /* ── Freshness indicator ─────────────────────────────────── */
  function _updateFreshnessIndicator() {
    /* Try to update the existing last-sync label in admin-canonical-sync-v1.js */
    var el = document.getElementById('fxacs-last-sync');
    if (el) {
      el.textContent = 'Mis à jour à l\'instant';
      /* Fade back to timestamp after 4s */
      setTimeout(function () {
        var now = new Date();
        el.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }, 4000);
    }
  }

  /* ── Subtle pulse on urgent new request ─────────────────── */
  function _pulseUrgentIndicator() {
    /* Add a brief CSS pulse to the priority queue container if visible */
    var panel = document.getElementById('fxacs-home-panel') ||
                document.getElementById('fxv4-warroom');
    if (!panel) return;

    panel.style.transition = 'box-shadow 0.3s ease';
    panel.style.boxShadow  = '0 0 0 2px rgba(225,48,108,0.5)';
    setTimeout(function () {
      panel.style.boxShadow = '';
    }, 1200);
  }

  /* ── Subscribe to Realtime ───────────────────────────────── */
  function _subscribe(sb) {
    /* Clean up any previous channel */
    _cleanup(sb);

    try {
      var channel = sb.channel(CHANNEL_NAME, {
        config: { broadcast: { self: false } }
      });

      TABLES.forEach(function (table) {
        channel
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: table },
            function (payload) { _scheduleRefresh(table, 'INSERT'); }
          )
          .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: table },
            function (payload) { _scheduleRefresh(table, 'UPDATE'); }
          );
      });

      channel.subscribe(function (status, err) {
        if (status === 'SUBSCRIBED') {
          _status = 'active';
          log('Realtime channel subscribed (' + TABLES.join(', ') + ')');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _status = 'error';
          warn('Channel', status, err || '');
          /* Reconnect after delay — polling fallback continues in the meantime */
          clearTimeout(_reconnectTimer);
          _reconnectTimer = setTimeout(function () {
            log('Attempting reconnect…');
            _getSb().then(_subscribe).catch(function (e) {
              warn('Reconnect failed:', e.message);
            });
          }, RECONNECT_MS);
        } else if (status === 'CLOSED') {
          _status = 'inactive';
          log('Channel closed');
        }
      });

      _channel = channel;
    } catch (e) {
      _status = 'error';
      warn('subscribe() threw:', e.message);
    }
  }

  /* ── Cleanup old channel ─────────────────────────────────── */
  function _cleanup(sb) {
    if (_channel) {
      try {
        if (sb && typeof sb.removeChannel === 'function') {
          sb.removeChannel(_channel);
        } else if (typeof _channel.unsubscribe === 'function') {
          _channel.unsubscribe();
        }
      } catch (e) {
        warn('cleanup error:', e.message);
      }
      _channel = null;
    }
    clearTimeout(_debounceTimer);
    clearTimeout(_reconnectTimer);
    _debounceTimer = null;
    _reconnectTimer = null;
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    if (!document.body || document.body.dataset.dashType !== 'admin') return;

    _getSb().then(function (sb) {
      if (!sb || typeof sb.channel !== 'function') {
        warn('Supabase client does not support Realtime — polling fallback active');
        _status = 'error';
        return;
      }
      _subscribe(sb);
    }).catch(function (e) {
      warn('No Supabase client — polling fallback active:', e.message);
      _status = 'error';
    });

    /* Cleanup on page unload to prevent memory leaks */
    window.addEventListener('beforeunload', function () {
      _getSb().then(_cleanup).catch(function () {});
      clearTimeout(_debounceTimer);
      clearTimeout(_reconnectTimer);
    });

    log('Admin Realtime V1 initialized (' + VERSION + ') — 60s poll fallback active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.FixeoAdminRealtime = {
    version: VERSION,
    status: function ()  { return _status; },
    restart: function () {
      _getSb().then(_subscribe).catch(function (e) {
        warn('restart failed:', e.message);
      });
    },
    /* Exposed for tests */
    _scheduleRefresh:    _scheduleRefresh,
    _DEBOUNCE_MS:        DEBOUNCE_MS,
    _TABLES:             TABLES,
    _CHANNEL_NAME:       CHANNEL_NAME
  };

})();
