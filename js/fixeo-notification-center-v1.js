/**
 * FIXEO Notification Center V1 — Real-Time Layer
 * File: js/fixeo-notification-center-v1.js
 * Version: fnc-v1a — 2026-06-11
 * ─────────────────────────────────────────────────────────────
 * ADDITIVE layer on top of:
 *   fixeo-notifications-real-v1.js  (localStorage store + panel UI)
 *   fixeo-notification-engine.js     (bridge + _sbPersist)
 *
 * FILLS 6 GAPS:
 *   G-1  Supabase polling (30s) — fetch own notifications from DB
 *   G-2  Artisan V2 action hooks — fire FixeoNotifEngine.notify* after
 *        _doAcceptMission / _doStartMission / _doCompleteMission
 *   G-3  Admin V3 validate → ADM_COMMISSION_DUE notification
 *   G-4  Notification click → Admin V3 / Dashboard section routing
 *   G-5  Realtime strategy: 30s polling + event-bus refresh
 *   G-6  Enhanced _renderPanel: nav-action on item click
 *
 * CONSTRAINTS:
 *   - Never modifies fixeo-notifications-real-v1.js or fixeo-notification-engine.js
 *   - Never creates fake/guest notifications (null recipient_user_id → skip)
 *   - Never breaks existing bell behavior
 *   - Dedupe by: type + related_entity_type + related_entity_id + recipient_user_id
 *   - All Supabase calls: console.warn only on failure
 *   - FixeoSupabaseClient used on admin.html; FixeoSupabase used elsewhere
 *
 * GUARD: window.FixeoNotifCenter (idempotent)
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoNotifCenter) return;

  var VERSION    = 'fnc-v1b';
  var POLL_MS    = 30000;    /* 30-second polling interval */
  var MAX_FETCH  = 50;       /* max rows per poll */
  var LOG        = '[FixeoNotifCenter]';

  /* ═══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */

  function _page() {
    var p = window.location.pathname.replace(/.*\//, '').toLowerCase();
    if (p === 'admin.html')                  return 'admin';
    if (p === 'dashboard-artisan-v2.html')   return 'artisan';
    if (p === 'dashboard-client.html')       return 'client';
    return 'other';
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _ago(iso) {
    try {
      var ms = Date.now() - new Date(iso).getTime();
      if (ms < 60000)    return 'À l\'instant';
      if (ms < 3600000)  return 'il y a ' + Math.floor(ms/60000) + ' min';
      if (ms < 86400000) return 'il y a ' + Math.floor(ms/3600000) + 'h';
      return new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
    } catch(e) { return ''; }
  }

  /* ── Supabase client resolver (works on all pages) ───────── */
  async function _getSbClient() {
    var fsc = window.FixeoSupabaseClient;
    if (fsc && fsc.CONFIGURED) {
      await fsc.ready();
      if (fsc.client) return fsc.client;
    }
    var FS = window.FixeoSupabase;
    if (FS && typeof FS.getClient === 'function') {
      return await FS.getClient();
    }
    return null;
  }

  /* ── Get current auth uid from Supabase JWT in localStorage ─ */
  function _getAuthUid() {
    try {
      var key = Object.keys(localStorage).find(function(k) { return /^sb-.*-auth-token$/.test(k); });
      if (!key) return null;
      var raw = JSON.parse(localStorage.getItem(key) || 'null');
      var session = raw && (raw.user ? raw : (raw.currentSession || null));
      return session && session.user ? session.user.id : null;
    } catch(e) { return null; }
  }

  function _getRole() {
    return localStorage.getItem('fixeo_role') || localStorage.getItem('role') || 'client';
  }

  /* ═══════════════════════════════════════════════════════════
     G-1: SUPABASE POLLING
     Fetch own notifications from public.notifications.
     Merges DB rows into fixeo-notifications-real-v1.js store.
  ══════════════════════════════════════════════════════════ */

  var _lastPollAt = 0;
  var _pollTimer  = null;

  async function _poll() {
    try {
      var uid  = _getAuthUid();
      var role = _getRole();
      var sb   = await _getSbClient();
      if (!sb) return;

      /* Admin reads by recipient_role='admin'; others read by own uid */
      var q = sb.from('notifications')
        .select('id, recipient_user_id, recipient_role, type, title, message, related_entity_type, related_entity_id, read, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_FETCH);

      if (role === 'admin') {
        q = q.eq('recipient_role', 'admin');
      } else if (uid) {
        q = q.eq('recipient_user_id', uid);
      } else {
        /* Guest: no uid, no poll */
        return;
      }

      /* Only fetch since last poll (incremental) */
      if (_lastPollAt > 0) {
        q = q.gte('created_at', new Date(_lastPollAt - 5000).toISOString());
      }

      var res = await q;
      if (res.error) {
        console.warn(LOG, 'poll error:', res.error.message);
        return;
      }

      _lastPollAt = Date.now();

      if (!res.data || !res.data.length) return;

      /* Merge into v1 store */
      _mergeDBNotifications(res.data);

      /* Flash poll dot */
      _flashPollDot();

    } catch(e) {
      console.warn(LOG, 'poll exception:', e && e.message);
    }
  }

  function _mergeDBNotifications(rows) {
    var sys = window.FixeoNotificationsV1;
    if (!sys || typeof sys.readAll !== 'function') return;

    var existing = sys.readAll();
    var existingIds = new Set(existing.map(function(n) { return n.id; }));
    var newNotifs   = [];

    rows.forEach(function(row) {
      var dbId = 'db_' + String(row.id || '');
      if (existingIds.has(dbId)) return; /* already in store */

      /* Dedupe by type+entity+recipient combo */
      var dedupeKey = String(row.type||'') + '|' + String(row.related_entity_type||'') + '|'
        + String(row.related_entity_id||'') + '|' + String(row.recipient_user_id||row.recipient_role||'');
      var alreadyKnown = existing.some(function(n) {
        return (n.dedupe_key && n.dedupe_key === dedupeKey) ||
               (n.type === row.type &&
                n.ref_id === String(row.related_entity_id||'') &&
                Math.abs(new Date(n.created_at||0) - new Date(row.created_at||0)) < 60000);
      });
      if (alreadyKnown) return;

      newNotifs.push({
        id:         dbId,
        type:       row.type || 'adm_new_request',
        audience:   row.recipient_role || 'admin',
        user_id:    row.recipient_user_id || null,
        title:      row.title || '',
        message:    row.message || '',
        ref_type:   row.related_entity_type || '',
        ref_id:     String(row.related_entity_id || ''),
        severity:   _severityFromType(row.type),
        created_at: row.created_at || new Date().toISOString(),
        read:       row.read || false,
        dedupe_key: dedupeKey,
        _db_id:     row.id  /* keep original DB id for mark-read writes */
      });
    });

    if (!newNotifs.length) return;

    /* Push into store via FixeoNotificationsV1.push() if available */
    if (typeof sys.push === 'function') {
      newNotifs.forEach(function(n) { sys.push(n); });
    } else {
      /* Fallback: writeAll merge */
      var merged = newNotifs.concat(existing).slice(0, 150);
      if (typeof sys.writeAll === 'function') sys.writeAll(merged);
    }

    /* Refresh panel if open */
    _tryRenderPanel();

    /* Update badge */
    if (typeof sys.updateBadges === 'function') sys.updateBadges();
  }

  function _severityFromType(type) {
    var t = String(type || '');
    if (t.includes('mission_completed') || t.includes('confirm_pending') || t.includes('commission'))
      return 'warning';
    if (t.includes('validated') || t.includes('accepted') || t.includes('started'))
      return 'success';
    if (t.includes('suspended') || t.includes('blocked') || t.includes('rejected') || t.includes('danger'))
      return 'danger';
    return 'info';
  }

  /* Mark notification read in Supabase DB (best-effort) */
  async function _dbMarkRead(dbId) {
    if (!dbId) return;
    try {
      var sb = await _getSbClient();
      if (!sb) return;
      await sb.from('notifications').update({ read: true }).eq('id', dbId);
    } catch(e) { /* silent */ }
  }

  function _schedulePoll() {
    if (_pollTimer) clearInterval(_pollTimer);
    _poll(); /* immediate first poll */
    _pollTimer = setInterval(_poll, POLL_MS);
  }

  /* Flash poll dot on bell button */
  function _flashPollDot() {
    var bell = document.querySelector('.notif-btn, .fxne-bell');
    if (!bell) return;
    bell.style.position = 'relative';
    var dot = document.getElementById('fnc-poll-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'fnc-poll-dot';
      bell.appendChild(dot);
    }
    dot.classList.remove('active');
    void dot.offsetWidth; /* force reflow */
    dot.classList.add('active');
    setTimeout(function() { dot.classList.remove('active'); }, 2500);
  }

  /* ═══════════════════════════════════════════════════════════
     G-4 + G-6: NOTIFICATION CLICK → NAV ROUTING
     Intercepts panel item clicks and routes to the right section.
  ══════════════════════════════════════════════════════════ */

  /* Type → Admin V3 section mapping */
  var TYPE_NAV = {
    /* Admin */
    'adm_new_request'       : 'v3-assigner',
    'adm_assigned'          : 'v3-attente',
    'adm_mission_validated' : 'commissions',
    'adm_commission_due'    : 'commissions',
    'adm_commission_review' : 'commissions',
    'adm_mission_blocked'   : 'v3-urgences',
    'adm_claim_request'     : 'inbox',
    'adm_artisan_validate'  : 'inbox',
    /* Client */
    'c_artisan_assigned'    : null,   /* client dashboard — no nav needed */
    'c_mission_started'     : null,
    'c_mission_completed'   : null,
    'c_confirm_pending'     : null,
    'c_mission_validated'   : null,
    /* Artisan */
    'a_mission_accepted'    : null,
    'a_mission_started'     : null,
    'a_mission_completed'   : null,
    'a_mission_validated'   : null,
    'a_profile_suspended'   : null
  };

  /* Override for urgent types */
  function _navSectionForType(type, refId) {
    /* Emergency types bump to urgences */
    if (type === 'adm_new_request') {
      var sys = window.FixeoNotificationsV1;
      if (sys) {
        var notifs = sys.readAll();
        var n = notifs.find(function(x) { return (x.type === type && x.ref_id === refId); });
        if (n && n.message && /urgent|serrur|plomb|fuite|electr|panne|gaz/i.test(n.message)) {
          return 'v3-urgences';
        }
      }
    }
    return TYPE_NAV[type] || null;
  }

  function _navigateToSection(section) {
    var page = _page();
    if (page !== 'admin') return;
    /* V3 section */
    if (section.startsWith('v3-')) {
      if (window.FixeoAccV3 && typeof window.FixeoAccV3.goOpsSection === 'function') {
        window.FixeoAccV3.goOpsSection(section);
        return;
      }
    }
    /* V2 section */
    if (window.FixeoAccCC && typeof window.FixeoAccCC.goSection === 'function') {
      window.FixeoAccCC.goSection(section);
      return;
    }
    /* Fallback */
    if (typeof window.adminSection === 'function') {
      window.adminSection(section);
    }
  }

  /* Patch _renderPanel to inject nav-section data-attr on each item */
  function _patchRenderPanel() {
    var sys = window.FixeoNotificationsV1;
    if (!sys || typeof sys.renderPanel !== 'function') return;
    if (sys._fncPatched) return; /* idempotent */

    var _origRender = sys.renderPanel;

    sys.renderPanel = function() {
      _origRender.call(this);
      _annotateNavItems();
    };
    sys._fncPatched = true;
  }

  function _annotateNavItems() {
    var body = document.getElementById('fxnrv1-panel-body');
    if (!body) return;

    var sys = window.FixeoNotificationsV1;
    if (!sys || typeof sys.getForCurrentUser !== 'function') return;
    var notifs = sys.getForCurrentUser();

    /* Add data-nav-section to each item matching its type */
    body.querySelectorAll('.fxnrv1-item[data-id]').forEach(function(item) {
      var id = item.getAttribute('data-id') || '';
      var n  = notifs.find(function(x) { return String(x.id||'') === id; });
      if (!n) return;

      var section = _navSectionForType(n.type, n.ref_id);
      if (section) {
        item.setAttribute('data-nav-section', section);
        item.title = 'Voir dans : ' + section.replace('v3-','');
      }

      /* Severity class */
      var sev = n.severity || _severityFromType(n.type);
      if (sev && sev !== 'info') {
        item.classList.add('fnc-sev-' + sev);
      }

      /* Entity tag */
      var refId = String(n.ref_id || '').slice(-6).toUpperCase();
      if (refId && !item.querySelector('.fnc-entity-tag')) {
        var msgEl = item.querySelector('.fxnrv1-item-msg');
        if (msgEl) {
          var tag = document.createElement('span');
          tag.className = 'fnc-entity-tag';
          tag.textContent = '#' + refId;
          msgEl.appendChild(tag);
        }
      }
    });
  }

  /* Intercept panel click at document level for nav routing */
  function _wireNavClick() {
    document.addEventListener('click', function(e) {
      var item = e.target.closest('.fxnrv1-item[data-nav-section]');
      if (!item) return;

      var section = item.getAttribute('data-nav-section');
      if (!section) return;

      /* Close panel */
      var panel = document.getElementById('fxnrv1-panel');
      if (panel) panel.classList.remove('open');

      /* Navigate */
      _navigateToSection(section);

      /* Mark read */
      var id = item.getAttribute('data-id') || '';
      var sys = window.FixeoNotificationsV1;
      if (sys && typeof sys.markRead === 'function') {
        sys.markRead(id);
        _tryRenderPanel();
      }
      /* DB mark-read if it's a DB-sourced notification */
      var notifs = sys && typeof sys.readAll === 'function' ? sys.readAll() : [];
      var n = notifs.find(function(x) { return String(x.id||'') === id; });
      if (n && n._db_id) _dbMarkRead(n._db_id);

    }, true /* capture */);
  }

  function _tryRenderPanel() {
    var sys = window.FixeoNotificationsV1;
    if (!sys) return;
    /* Call patched renderPanel */
    if (typeof sys.renderPanel === 'function') {
      sys.renderPanel();
    }
    /* Annotate items regardless */
    setTimeout(_annotateNavItems, 50);
  }

  /* ═══════════════════════════════════════════════════════════
     G-2: ARTISAN V2 ACTION HOOKS
     Intercepts artisan V2 Supabase writes via event bus injection.
     Fires FixeoNotifEngine.notify* after successful DB updates.
     Strategy: monkey-patch the artisan dashboard's internal event
     dispatch points by listening to fixeo:state:updated with action context.
     We also wrap _doAcceptMission/_doStartMission/_doCompleteMission
     by patching the global FixeoArtisanV2 object if it exists.
  ══════════════════════════════════════════════════════════ */

  function _hookArtisanV2() {
    /* Wait for FixeoArtisanV2 to be available */
    var attempts = 0;
    var timer = setInterval(function() {
      attempts++;
      var av2 = window.FixeoArtisanV2;
      if (av2 && !av2._fncHooked) {
        _patchArtisanActions(av2);
        clearInterval(timer);
      }
      if (attempts > 20) clearInterval(timer); /* give up after 10s */
    }, 500);
  }

  function _patchArtisanActions(av2) {
    if (av2._fncHooked) return;
    av2._fncHooked = true;

    var origAccept   = av2.acceptMission   && av2.acceptMission.bind(av2);
    var origStart    = av2.startMission    && av2.startMission.bind(av2);
    var origComplete = av2.completeMission && av2.completeMission.bind(av2);

    if (origAccept) {
      av2.acceptMission = async function(requestId, btn) {
        var result = await origAccept(requestId, btn);
        _onArtisanAccepted(requestId);
        return result;
      };
    }
    if (origStart) {
      av2.startMission = async function(requestId, btn) {
        var result = await origStart(requestId, btn);
        _onArtisanStarted(requestId);
        return result;
      };
    }
    if (origComplete) {
      av2.completeMission = async function(requestId, btn) {
        var result = await origComplete(requestId, btn);
        _onArtisanCompleted(requestId);
        return result;
      };
    }
  }

  /* Fallback: listen to fixeo:artisan:mission-* events.
     These are dispatched by the public wrappers in window.FixeoArtisanV2.
     DEDUP GUARD: if _patchArtisanActions() already attached (av2._fncHooked = true),
     the patch calls _onArtisan*() directly AND the wrapper dispatches the event.
     To prevent double-fire, we skip event-listener callbacks when hooked.
     Result: only one notification path fires per action, regardless of timing. */
  function _listenArtisanEvents() {
    window.addEventListener('fixeo:artisan:mission-accepted', function(e) {
      var av2 = window.FixeoArtisanV2;
      if (av2 && av2._fncHooked) return; /* direct patch path handles this */
      var d = (e && e.detail) || {};
      var reqId = String(d.requestId || d.id || '').trim();
      if (reqId) _onArtisanAccepted(reqId);
    });

    window.addEventListener('fixeo:artisan:mission-started', function(e) {
      var av2 = window.FixeoArtisanV2;
      if (av2 && av2._fncHooked) return;
      var d = (e && e.detail) || {};
      var reqId = String(d.requestId || d.id || '').trim();
      if (reqId) _onArtisanStarted(reqId);
    });

    window.addEventListener('fixeo:artisan:mission-completed', function(e) {
      var av2 = window.FixeoArtisanV2;
      if (av2 && av2._fncHooked) return;
      var d = (e && e.detail) || {};
      var reqId = String(d.requestId || d.id || '').trim();
      if (reqId) _onArtisanCompleted(reqId);
    });
  }

  function _getArtisanContext() {
    var state = window.FixeoArtisanV2 && window.FixeoArtisanV2._state;
    if (!state) return {};
    var ap = state.artisanProfile || {};
    return {
      artisanProfileId: ap.id || ap.artisanId || '',
      artisanName:      ap.name || ap.full_name || 'L\'artisan'
    };
  }

  function _onArtisanAccepted(requestId) {
    var NE = window.FixeoNotifEngine;
    if (!NE || typeof NE.notifyMissionAccepted !== 'function') return;
    var ctx = _getArtisanContext();
    NE.notifyMissionAccepted(requestId, ctx.artisanProfileId, ctx.artisanName, null);
  }

  function _onArtisanStarted(requestId) {
    var NE = window.FixeoNotifEngine;
    if (!NE || typeof NE.notifyMissionStarted !== 'function') return;
    var ctx = _getArtisanContext();
    NE.notifyMissionStarted(requestId, ctx.artisanProfileId, ctx.artisanName, null);

    /* Admin notification */
    var sys = window.FixeoNotificationsV1;
    if (sys && typeof sys.push === 'function') {
      sys.push({
        id:         'fnc_started_' + requestId,
        type:       'adm_new_request',
        audience:   'admin',
        title:      'Intervention démarrée',
        message:    'Mission #' + String(requestId).slice(-6).toUpperCase() + ' en cours.',
        ref_type:   'mission',
        ref_id:     String(requestId),
        severity:   'info',
        created_at: new Date().toISOString(),
        read:       false,
        dedupe_key: 'adm_started|' + requestId
      });
    }

    /* Supabase admin notification */
    if (window.FixeoNotifEngine && typeof window.FixeoNotifEngine.sbPersist === 'function') {
      window.FixeoNotifEngine.sbPersist(
        'adm_new_request', null, 'admin',
        'Intervention démarrée',
        'Mission #' + String(requestId).slice(-6).toUpperCase() + ' en cours.',
        'mission', requestId, {}
      );
    }
  }

  function _onArtisanCompleted(requestId) {
    var NE = window.FixeoNotifEngine;
    if (!NE || typeof NE.notifyMissionCompleted !== 'function') return;
    var ctx = _getArtisanContext();
    NE.notifyMissionCompleted(requestId, ctx.artisanProfileId, ctx.artisanName, null);

    /* Admin notification: À Valider */
    var sys = window.FixeoNotificationsV1;
    if (sys && typeof sys.push === 'function') {
      sys.push({
        id:         'fnc_completed_' + requestId,
        type:       'adm_mission_validated',
        audience:   'admin',
        title:      'Intervention terminée',
        message:    'Mission #' + String(requestId).slice(-6).toUpperCase() + ' attend validation.',
        ref_type:   'mission',
        ref_id:     String(requestId),
        severity:   'warning',
        created_at: new Date().toISOString(),
        read:       false,
        dedupe_key: 'adm_completed|' + requestId
      });
    }

    /* Supabase admin notification */
    if (window.FixeoNotifEngine && typeof window.FixeoNotifEngine.sbPersist === 'function') {
      window.FixeoNotifEngine.sbPersist(
        'adm_mission_validated', null, 'admin',
        'Intervention terminée',
        'Mission #' + String(requestId).slice(-6).toUpperCase() + ' — À valider.',
        'mission', requestId, {}
      );
    }
  }

  /* ═══════════════════════════════════════════════════════════
     G-3: ADMIN V3 VALIDATE → COMMISSION NOTIFICATION
     Listen to fixeo:admin:refresh after admin validate action.
     Also hook FixeoAccV3 if available.
  ══════════════════════════════════════════════════════════ */

  function _listenAdminValidate() {
    /* fixeo:client-request-updated with status=validated fired by V3 via _refreshAll */
    window.addEventListener('fixeo:client-request-updated', function(e) {
      var d = (e && e.detail) || {};
      if (!d || !d.id) return;

      /* Check if the update was a validation (check __fxAccSbCache optimistic update) */
      var cache = window.__fxAccSbCache;
      if (!Array.isArray(cache)) return;
      var req = cache.find(function(r) { return String(r.id || '') === String(d.id); });
      if (!req || req.status !== 'validated') return;

      var reqId = String(d.id);
      var commAmount = req.commission_amount || req.final_price ? Math.round(parseFloat(req.final_price || req.agreed_price || 0) * 0.15) : 0;

      /* Push commission_due notification for admin */
      var sys = window.FixeoNotificationsV1;
      if (sys && typeof sys.push === 'function') {
        sys.push({
          id:         'fnc_comm_' + reqId,
          type:       'adm_commission_due',
          audience:   'admin',
          title:      'Commission à percevoir',
          message:    'Mission #' + reqId.slice(-6).toUpperCase()
            + (commAmount > 0 ? ' — ' + commAmount + ' MAD' : '') + ' validée.',
          ref_type:   'mission',
          ref_id:     reqId,
          severity:   'warning',
          created_at: new Date().toISOString(),
          read:       false,
          dedupe_key: 'adm_commission_due|' + reqId
        });
        _tryRenderPanel();
      }

      /* Supabase persist */
      if (window.FixeoNotifEngine && typeof window.FixeoNotifEngine.sbPersist === 'function') {
        window.FixeoNotifEngine.sbPersist(
          'adm_commission_due', null, 'admin',
          'Commission à percevoir',
          'Mission #' + reqId.slice(-6).toUpperCase() + (commAmount > 0 ? ' — ' + commAmount + ' MAD' : ''),
          'mission', reqId, { commission_amount: commAmount }
        );
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     G-5: EVENT-BUS REFRESH
     Triggers repoll on known state-change events.
  ══════════════════════════════════════════════════════════ */

  function _listenBusEvents() {
    var REFRESH_EVENTS = [
      'fixeo:data:changed',
      'fixeo:client-request-created',
      'fixeo:client-request-updated',
      'fixeo:missions:updated',
      'fixeo:admin:refresh',
      'fixeo:state:updated'
    ];
    REFRESH_EVENTS.forEach(function(ev) {
      window.addEventListener(ev, function() {
        /* Short debounce — don't hammer on rapid events */
        clearTimeout(_busDebounce);
        _busDebounce = setTimeout(_poll, 1500);
      });
    });
  }
  var _busDebounce = null;

  /* ═══════════════════════════════════════════════════════════
     BELL SYNCED LABEL
     Adds a small "synced" indicator below the panel after first poll.
  ══════════════════════════════════════════════════════════ */

  function _addSyncedLabel() {
    var panel = document.getElementById('fxnrv1-panel');
    if (!panel || panel.querySelector('.fnc-synced-label')) return;
    var label = document.createElement('span');
    label.className = 'fnc-synced-label';
    label.textContent = '↻ Sync en temps réel';
    panel.appendChild(label);
  }

  /* ═══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function _init() {
    var page = _page();

    /* G-4 + G-6: nav click routing (all pages) */
    _wireNavClick();

    /* G-6: patch renderPanel to annotate items */
    /* Wait for v1.js to be ready */
    var patchAttempts = 0;
    var patchTimer = setInterval(function() {
      patchAttempts++;
      if (window.FixeoNotificationsV1) {
        _patchRenderPanel();
        _addSyncedLabel();
        clearInterval(patchTimer);
      }
      if (patchAttempts > 20) clearInterval(patchTimer);
    }, 250);

    /* G-1: Supabase polling — only for authenticated pages */
    if (page === 'admin' || page === 'artisan' || page === 'client') {
      _schedulePoll();
    }

    /* G-2: Artisan V2 action hooks */
    if (page === 'artisan') {
      _hookArtisanV2();
      _listenArtisanEvents();
    }

    /* G-3: Admin validate → commission notification */
    if (page === 'admin') {
      _listenAdminValidate();
    }

    /* G-5: Event-bus refresh */
    _listenBusEvents();

    console.log(LOG, VERSION, 'ready — page:', page);
  }

  /* ── Public API ────────────────────────────────────────── */
  window.FixeoNotifCenter = {
    VERSION:          VERSION,
    poll:             _poll,
    mergeDB:          _mergeDBNotifications,
    annotateNavItems: _annotateNavItems,
    navigateTo:       _navigateToSection
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
