/**
 * FIXEO NOTIFICATION ENGINE — v1a
 * =====================================
 * Bridge layer that sits on top of fixeo-notifications-real-v1.js.
 * Connects Supabase DB events → in-app notifications.
 *
 * RESPONSIBILITIES:
 *   1. Bridge fixeo:data:changed → fixeo:client-request-created (name mismatch fix)
 *   2. Bridge artisan V2 action events → notification events
 *   3. Bridge dispatch engine assignment → ADM_NEW_REQUEST notification
 *   4. Bridge claim events (submitted / rejected — approved already handled)
 *   5. Supabase persistence layer — mirror notifications to DB (non-blocking)
 *   6. Inject notification bells on client/artisan dashboards
 *   7. Wire admin bell to panel (belt-and-suspenders over onclick no-op)
 *
 * DEPENDS ON (must load after):
 *   fixeo-supabase-core.js     (window.FixeoSupabase, window.FixeoSupabaseClient)
 *   fixeo-notifications-real-v1.js  (window.FixeoNotificationsV1)
 *
 * DOES NOT TOUCH:
 *   Auth, RLS, mission lifecycle logic, claim engine, dispatch scoring,
 *   fixeo-supabase-core.js internals, admin business logic
 *
 * SAFE:
 *   All Supabase writes are fire-and-forget (non-blocking, console.warn on error).
 *   All DOM injections are guarded with existence checks.
 *   Idempotent: window.FixeoNotifEngine guard prevents double-init.
 * ────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoNotifEngine) return; // idempotent

  var VERSION = 'v1b';

  /* ── Helpers ──────────────────────────────────────────────── */
  function _dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch(e) {}
  }

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _nowISO() { return new Date().toISOString(); }

  /* ── Page context ─────────────────────────────────────────── */
  function _page() {
    var p = _norm(window.location.pathname);
    if (p.includes('admin'))                   return 'admin';
    if (p.includes('dashboard-artisan-v2'))    return 'artisan';
    if (p.includes('dashboard-artisan'))       return 'artisan';
    if (p.includes('dashboard-client'))        return 'client';
    return 'other';
  }

  /* ── FixeoNotificationsV1 proxy (safe if not loaded yet) ─── */
  function _push(notif) {
    var sys = window.FixeoNotificationsV1;
    if (sys && typeof sys.push === 'function') sys.push(notif);
  }

  function _buildNotif(type, audience, audienceId, title, message, opts) {
    opts = opts || {};
    return {
      id:          'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      audience:    audience,
      audience_id: String(audienceId || ''),
      type:        type,
      title:       title || '',
      message:     message || '',
      ref_type:    opts.ref_type || '',
      ref_id:      String(opts.ref_id || ''),
      severity:    opts.severity || 'info',
      created_at:  _nowISO(),
      read:        false,
      dedupe_key:  opts.dedupe_key || ''
    };
  }

  /* ── Supabase persistence (non-blocking mirror) ────────────── */
  /* Writes a notification row to the DB.
   * Failures are console.warn only — never throws, never blocks UI. */
  async function _sbPersist(type, recipientUserId, recipientRole, title, message, entityType, entityId, metadata) {
    try {
      var fsc = window.FixeoSupabaseClient;
      if (!fsc || !fsc.CONFIGURED) return;
      await fsc.ready();
      var sb = fsc.client;
      if (!sb) return;

      var row = {
        recipient_user_id:   recipientUserId || null,
        recipient_role:      recipientRole   || 'client',
        type:                type,
        title:               title           || '',
        message:             message         || '',
        related_entity_type: entityType      || '',
        related_entity_id:   String(entityId || ''),
        read:                false,
        metadata:            metadata        || {}
      };

      var res = await sb.from('notifications').insert([row]);
      if (res.error) {
        console.warn('[FixeoNotifEngine] DB persist error:', res.error.message);
      }
    } catch (e) {
      console.warn('[FixeoNotifEngine] DB persist exception:', e && e.message);
    }
  }

  /* ── Get current auth uid (non-blocking) ───────────────────── */
  function _getAuthUid() {
    try {
      var sb_key_match = Object.keys(localStorage).find(function(k) {
        return /^sb-.*-auth-token$/.test(k);
      });
      if (!sb_key_match) return null;
      var raw = JSON.parse(localStorage.getItem(sb_key_match) || 'null');
      var session = raw && (raw.user ? raw : (raw.currentSession || null));
      return session && session.user ? session.user.id : null;
    } catch(e) { return null; }
  }

  /* ═══════════════════════════════════════════════════════════
     BRIDGE 1 — fixeo:data:changed → translate to named events
     fixeo-supabase-core.js fires fixeo:data:changed with {type, request}
     fixeo-notifications-real-v1.js listens to fixeo:client-request-created
     ═══════════════════════════════════════════════════════════ */
  function _onDataChanged(evt) {
    var d = (evt && evt.detail) || {};

    if (d.type === 'service_request_created' && d.request) {
      /* Translate to the event name that fixeo-notifications-real-v1.js expects */
      _dispatch('fixeo:client-request-created', d.request);

      /* Also persist to DB */
      var r = d.request;
      var uid = _getAuthUid() || (r && r.client_profile_id) || null;
      _sbPersist(
        'c_request_created', uid, 'client',
        'Demande publiée',
        'Votre demande pour « ' + String(r.service_category || r.service || '') + ' » a été envoyée.',
        'service_request', r.id || '', {}
      );
      /* Admin DB notification */
      _sbPersist(
        'adm_new_request', null, 'admin',
        'Nouvelle demande',
        'Nouvelle demande : ' + String(r.service_category || r.service || '') + ' — #' + String(r.id || '').slice(-6).toUpperCase(),
        'service_request', r.id || '', {}
      );
    }
  }

  /* ═══════════════════════════════════════════════════════════
     BRIDGE 2 — Artisan V2 action events
     fixeo-artisan-dashboard-v2.js does NOT dispatch events after actions.
     We hook by listening to fixeo:admin:refresh + fixeo:client-request-updated
     and also inject event dispatches via the artisan dashboard's callback hooks.
     ═══════════════════════════════════════════════════════════ */

  /* Called after artisan accepts a mission (from artisan dashboard) */
  function notifyMissionAccepted(requestId, artisanProfileId, artisanName, clientProfileId) {
    var page = _page();

    /* In-app for artisan (current page) */
    _push(_buildNotif(
      'a_mission_accepted', 'artisan',
      artisanProfileId || _getAuthUid() || 'artisan',
      'Mission acceptée',
      'Vous avez accepté la mission #' + String(requestId || '').slice(-6).toUpperCase() + '.',
      { ref_type: 'mission', ref_id: requestId || '', dedupe_key: 'a_mission_accepted|' + requestId + '|' + artisanProfileId }
    ));

    /* In-app for client */
    if (clientProfileId) {
      _push(_buildNotif(
        'c_artisan_assigned', 'client', clientProfileId,
        'Artisan assigné',
        (artisanName || 'Un artisan') + ' a accepté votre mission #' + String(requestId || '').slice(-6).toUpperCase() + '.',
        { ref_type: 'mission', ref_id: requestId || '', severity: 'success', dedupe_key: 'c_artisan_assigned|' + requestId + '|' + clientProfileId }
      ));
    }

    /* DB persist */
    _sbPersist('a_mission_accepted', artisanProfileId || null, 'artisan',
      'Mission acceptée', 'Mission #' + String(requestId || '').slice(-6).toUpperCase() + ' acceptée.',
      'mission', requestId || '', {});
  }

  /* Called after artisan starts a mission */
  function notifyMissionStarted(requestId, artisanProfileId, artisanName, clientProfileId) {
    _push(_buildNotif(
      'a_mission_started', 'artisan',
      artisanProfileId || _getAuthUid() || 'artisan',
      'Intervention démarrée',
      'Vous avez démarré la mission #' + String(requestId || '').slice(-6).toUpperCase() + '.',
      { ref_type: 'mission', ref_id: requestId || '', dedupe_key: 'a_mission_started|' + requestId }
    ));

    if (clientProfileId) {
      _push(_buildNotif(
        'c_mission_started', 'client', clientProfileId,
        'Intervention démarrée',
        (artisanName || 'Votre artisan') + ' a démarré l\'intervention.',
        { ref_type: 'mission', ref_id: requestId || '', dedupe_key: 'c_mission_started|' + requestId + '|' + clientProfileId }
      ));
    }

    _sbPersist('a_mission_started', artisanProfileId || null, 'artisan',
      'Intervention démarrée', 'Mission #' + String(requestId || '').slice(-6).toUpperCase() + ' démarrée.',
      'mission', requestId || '', {});
  }

  /* Called after artisan marks mission complete */
  function notifyMissionCompleted(requestId, artisanProfileId, artisanName, clientProfileId) {
    _push(_buildNotif(
      'a_mission_completed', 'artisan',
      artisanProfileId || _getAuthUid() || 'artisan',
      'Mission marquée terminée',
      'La mission #' + String(requestId || '').slice(-6).toUpperCase() + ' attend la confirmation du client.',
      { ref_type: 'mission', ref_id: requestId || '', dedupe_key: 'a_mission_completed|' + requestId }
    ));

    if (clientProfileId) {
      _push(_buildNotif(
        'c_mission_completed', 'client', clientProfileId,
        'Intervention terminée',
        (artisanName || 'Votre artisan') + ' a terminé. Confirmez pour valider la mission.',
        { ref_type: 'mission', ref_id: requestId || '', severity: 'warning', dedupe_key: 'c_mission_completed|' + requestId + '|' + clientProfileId }
      ));
      _push(_buildNotif(
        'c_confirm_pending', 'client', clientProfileId,
        'Confirmation requise',
        'Confirmez la mission #' + String(requestId || '').slice(-6).toUpperCase() + ' pour clôturer.',
        { ref_type: 'mission', ref_id: requestId || '', severity: 'warning', dedupe_key: 'c_confirm_pending|' + requestId + '|' + clientProfileId }
      ));
    }

    _sbPersist('a_mission_completed', artisanProfileId || null, 'artisan',
      'Mission terminée', 'Mission #' + String(requestId || '').slice(-6).toUpperCase() + ' en attente confirmation.',
      'mission', requestId || '', {});
  }

  /* Called after client validates (from client dashboard) */
  function notifyMissionValidated(requestId, clientUserId, artisanProfileId) {
    if (clientUserId) {
      _push(_buildNotif(
        'c_mission_validated', 'client', clientUserId,
        'Mission validée',
        'Mission #' + String(requestId || '').slice(-6).toUpperCase() + ' validée. Merci pour votre confiance.',
        { ref_type: 'mission', ref_id: requestId || '', severity: 'success', dedupe_key: 'c_mission_validated|' + requestId + '|' + clientUserId }
      ));
    }
    if (artisanProfileId) {
      _push(_buildNotif(
        'a_mission_validated', 'artisan', artisanProfileId,
        'Mission validée par le client',
        'Le client a validé la mission #' + String(requestId || '').slice(-6).toUpperCase() + '.',
        { ref_type: 'mission', ref_id: requestId || '', severity: 'success', dedupe_key: 'a_mission_validated|' + requestId + '|' + artisanProfileId }
      ));
    }
    _push(_buildNotif(
      'adm_mission_validated', 'admin', 'admin',
      'Mission validée',
      'Mission #' + String(requestId || '').slice(-6).toUpperCase() + ' validée — commission à vérifier.',
      { ref_type: 'mission', ref_id: requestId || '', dedupe_key: 'adm_mission_validated|' + requestId }
    ));

    _sbPersist('c_mission_validated', clientUserId || null, 'client',
      'Mission validée', 'Mission #' + String(requestId || '').slice(-6).toUpperCase() + ' validée.',
      'mission', requestId || '', {});
  }

  /* ═══════════════════════════════════════════════════════════
     BRIDGE 3 — Dispatch engine assignment
     fixeo:client-request-updated fired after assignment
     ═══════════════════════════════════════════════════════════ */
  function _onClientRequestUpdated(evt) {
    var d = (evt && evt.detail) || {};
    var reqId = String(d.id || d.request_id || '').trim();
    if (!reqId) return;

    /* Admin notification: a new assignment was just made */
    _push(_buildNotif(
      'adm_new_request', 'admin', 'admin',
      'Demande assignée',
      'Demande #' + reqId.slice(-6).toUpperCase() + ' assignée à un artisan.',
      { ref_type: 'service_request', ref_id: reqId, dedupe_key: 'adm_assigned|' + reqId }
    ));
  }

  /* ═══════════════════════════════════════════════════════════
     BRIDGE 4 — Claim events
     fixeo-claim-system.js fires:
       fixeo:claim-submitted { claimId, artisanId }
       fixeo:claim-approved  { claimId, artisanId, userId }
       fixeo:claim-rejected  { claimId }
     fixeo-notifications-real-v1.js handles claim-approved already.
     We add: claim-submitted + claim-rejected
     ═══════════════════════════════════════════════════════════ */
  function _onClaimSubmitted(evt) {
    var d = (evt && evt.detail) || {};
    var claimId   = String(d.claimId   || '').trim();
    var artisanId = String(d.artisanId || '').trim();

    /* Admin notification */
    _push(_buildNotif(
      'adm_claim_request', 'admin', 'admin',
      'Nouvelle revendication de profil',
      'Un artisan a soumis une revendication' + (artisanId ? ' (profil ID …' + artisanId.slice(-6) + ')' : '') + '.',
      { ref_type: 'claim', ref_id: claimId || artisanId, dedupe_key: 'adm_claim_request|' + claimId }
    ));

    _sbPersist('adm_claim_request', null, 'admin',
      'Nouvelle revendication', 'Revendication artisan soumise — ID claim: ' + claimId,
      'claim_request', claimId || '', {});
  }

  function _onClaimRejected(evt) {
    var d = (evt && evt.detail) || {};
    var claimId   = String(d.claimId   || '').trim();

    /* No specific artisanId on rejected event — general notification */
    _push(_buildNotif(
      'a_profile_suspended', 'artisan', _getAuthUid() || 'artisan',
      'Revendication refusée',
      'Votre revendication de profil n\'a pas été approuvée. Contactez le support Fixeo.',
      { ref_type: 'claim', ref_id: claimId, severity: 'danger', dedupe_key: 'a_claim_rejected|' + claimId }
    ));
  }

  /* ═══════════════════════════════════════════════════════════
     BRIDGE 5 — Client dashboard: validated event
     After _doConfirmDone succeeds, fixeo:client-request-updated fires.
     We listen and fire the mission-validated path.
     ═══════════════════════════════════════════════════════════ */
  function _onMissionValidatedViaClient(evt) {
    var d = (evt && evt.detail) || {};
    /* Only act if status = validated */
    if (d.status !== 'validated' && d.status !== 'validée') return;
    var reqId  = String(d.id || d.request_id || '').trim();
    if (!reqId) return;
    var uid = _getAuthUid() || null;
    notifyMissionValidated(reqId, uid, null);
  }

  /* ═══════════════════════════════════════════════════════════
     DOM — Notification bell injection
     ═══════════════════════════════════════════════════════════ */

  /* Shared bell HTML — works on any dark header */
  function _bellHTML() {
    return '<button class="fxne-bell notif-btn" aria-label="Notifications" title="Notifications">'
      + '🔔'
      + '<span class="notif-badge fxne-badge" aria-live="polite" style="'
        + 'position:absolute;top:-4px;right:-4px;'
        + 'min-width:16px;height:16px;border-radius:9999px;'
        + 'background:#E1306C;color:#fff;'
        + 'font-size:.6rem;font-weight:800;'
        + 'display:none;align-items:center;justify-content:center;'
        + 'padding:0 3px;pointer-events:none;'
      + '"></span>'
      + '</button>';
  }

  /* Inject bell into client dashboard header */
  function _injectClientBell() {
    /* Target: <div><!-- reserved for future notification bell --></div> */
    var placeholder = document.querySelector('.fxv2-header > div');
    if (!placeholder || placeholder.querySelector('.fxne-bell')) return;
    placeholder.style.position = 'relative';
    placeholder.innerHTML = _bellHTML();
  }

  /* Inject bell into artisan V2 dashboard header */
  function _injectArtisanBell() {
    /* Target: <div><!-- notification bell placeholder --></div> */
    var placeholder = document.querySelector('.fxa-header > div:last-child');
    if (!placeholder || placeholder.querySelector('.fxne-bell')) return;
    placeholder.style.position = 'relative';
    placeholder.innerHTML = _bellHTML();
  }

  /* Wire admin bell: remove the broken no-op onclick attribute.
   *
   * ROOT CAUSE (v1a bug — double toggle):
   *   fixeo-notifications-real-v1.js _injectMinimalPanel() registers a
   *   document-level CAPTURE-phase listener (addEventListener(..., true)).
   *   Capture fires top-down BEFORE element listeners — so v1.js toggles
   *   the panel open first, then our element click handler toggled it
   *   closed again. Net result: nothing visible happens.
   *
   * FIX: do NOT add any toggle logic here. Remove onclick only.
   *   v1.js's document capture listener handles all click-to-open logic.
   *   We are purely cleaning up the invalid onclick attribute so it doesn't
   *   throw in strict contexts when notifSystem is undefined.
   */
  function _wireAdminBell() {
    /* Selector matches the original admin.html markup:
     *   <button class="notif-btn" onclick="window.notifSystem?.togglePanel()"> */
    var bell = document.querySelector('.notif-btn[onclick]');
    if (!bell) return;
    if (bell._fxneWired) return;
    bell._fxneWired = true;
    /* Remove the broken onclick — v1.js document capture listener takes over */
    bell.removeAttribute('onclick');
  }

  /* Badge CSS injection for client/artisan (where fixeo-notifications-real-v1.css
   * is NOT yet loaded) — minimal scoped styles only */
  function _injectBellCSS() {
    if (document.getElementById('fxne-bell-css')) return;
    var style = document.createElement('style');
    style.id = 'fxne-bell-css';
    style.textContent = [
      '.fxne-bell{',
        'position:relative;',
        'background:none;border:none;cursor:pointer;',
        'width:40px;height:40px;',
        'display:flex;align-items:center;justify-content:center;',
        'border-radius:10px;font-size:1.2rem;',
        'transition:background .15s;',
      '}',
      '.fxne-bell:hover{background:rgba(255,255,255,.08);}',
      '.fxne-badge{',
        'position:absolute!important;',
        'top:-4px!important;right:-4px!important;',
        'display:none!important;',
      '}',
      '.fxne-badge.has-notif{display:flex!important;}',
      /* Minimal panel positioning for client/artisan — fxnrv1-panel styles
         are only in fixeo-notifications-real-v1.css (loaded on admin only).
         We provide the same panel styles scoped to prevent FOUC. */
      '#fxnrv1-panel{',
        'position:fixed;top:64px;right:16px;',
        'width:min(360px,calc(100vw - 32px));',
        'max-height:min(78vh,600px);',
        'background:rgba(12,12,22,.98);',
        'border:1px solid rgba(255,255,255,.10);',
        'border-radius:18px;',
        'box-shadow:0 24px 60px rgba(0,0,0,.50);',
        'backdrop-filter:blur(20px);',
        '-webkit-backdrop-filter:blur(20px);',
        'display:none;flex-direction:column;overflow:hidden;z-index:1250;',
      '}',
      '#fxnrv1-panel.open{display:flex;}',
      '.fxnrv1-panel-head{',
        'display:flex;align-items:center;justify-content:space-between;',
        'gap:12px;padding:16px 16px 12px;',
        'border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;',
      '}',
      '.fxnrv1-panel-title{font-weight:800;font-size:.95rem;color:#fff;}',
      '.fxnrv1-btn-text{',
        'background:none;border:none;color:rgba(255,255,255,.55);',
        'font-size:.75rem;cursor:pointer;padding:4px 8px;border-radius:6px;',
      '}',
      '.fxnrv1-btn-text:hover{background:rgba(255,255,255,.08);color:#fff;}',
      '.fxnrv1-btn-icon{',
        'background:none;border:none;color:rgba(255,255,255,.5);',
        'font-size:1.1rem;cursor:pointer;width:28px;height:28px;',
        'border-radius:6px;display:flex;align-items:center;justify-content:center;',
      '}',
      '.fxnrv1-btn-icon:hover{background:rgba(255,255,255,.08);color:#fff;}',
      '.fxnrv1-panel-body{',
        'flex:1;overflow-y:auto;padding:8px;',
        'display:flex;flex-direction:column;gap:6px;',
        'min-height:0;',
      '}',
      '.fxnrv1-panel-body::-webkit-scrollbar{width:4px;}',
      '.fxnrv1-panel-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px;}',
      '.fxnrv1-item{',
        'display:flex;align-items:flex-start;gap:10px;',
        'padding:10px 12px;border-radius:10px;cursor:pointer;',
        'border:1px solid transparent;',
        'transition:background .12s;',
      '}',
      '.fxnrv1-item:hover{background:rgba(255,255,255,.06);}',
      '.fxnrv1-item.unread{',
        'background:rgba(225,48,108,.07);',
        'border-color:rgba(225,48,108,.18);',
      '}',
      '.fxnrv1-item-icon{font-size:1.1rem;flex-shrink:0;margin-top:1px;}',
      '.fxnrv1-item-body{flex:1;min-width:0;}',
      '.fxnrv1-item-title{',
        'font-size:.82rem;font-weight:700;color:#fff;',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
      '}',
      '.fxnrv1-item-msg{',
        'font-size:.75rem;color:rgba(255,255,255,.55);',
        'margin-top:2px;line-height:1.4;',
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
      '}',
      '.fxnrv1-item-time{font-size:.68rem;color:rgba(255,255,255,.3);white-space:nowrap;flex-shrink:0;margin-top:2px;}',
      '.fxnrv1-empty{',
        'display:flex;flex-direction:column;align-items:center;',
        'justify-content:center;padding:40px 20px;',
        'color:rgba(255,255,255,.4);text-align:center;gap:8px;font-size:.82rem;',
      '}',
    ].join('');
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════════════════
     HOOKS INTO EXISTING ENGINES (non-invasive)
     We expose window.FixeoNotifEngine.notify* functions that
     artisan dashboard V2 and client dashboard can call directly.
     No modification to those files — they optionally call us.
     ═══════════════════════════════════════════════════════════ */

  /* Artisan V2 hooks: called by the dashboard engine after successful Supabase writes.
   * The artisan dashboard V2 exposes no callbacks today — we listen to
   * generic window events instead and re-map them. */

  function _listenArtisanActions() {
    /* fixeo:admin:refresh fires after any assignment (dispatch engine).
     * We look for a richer event that carries artisan/client IDs.
     * Currently none — so we use fixeo:client-request-updated which
     * carries {id: reqId} after artisan accept + dispatch assign. */
    window.addEventListener('fixeo:client-request-updated', function(evt) {
      var d = (evt && evt.detail) || {};
      var reqId = String(d.id || '').trim();
      if (!reqId) return;
      /* We don't know the action type from this event alone.
       * We rely on fixeo-notifications-real-v1.js diff-based detection
       * which already handles this via _onRequestUpdated.
       * This bridge only adds the admin notification for assignment. */
      _onClientRequestUpdated(evt);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════ */

  function _bindEvents() {
    /* Bridge 1: supabase-core data:changed → notifications */
    window.addEventListener('fixeo:data:changed', _onDataChanged);

    /* Bridge 4: claim events */
    window.addEventListener('fixeo:claim-submitted', _onClaimSubmitted);
    window.addEventListener('fixeo:claim-rejected',  _onClaimRejected);

    /* Bridge 5: client validation */
    window.addEventListener('fixeo:client-request-updated', _onMissionValidatedViaClient);

    /* Artisan action listener */
    _listenArtisanActions();
  }

  function _injectBells() {
    var page = _page();
    _injectBellCSS();

    if (page === 'client') {
      _injectClientBell();
    } else if (page === 'artisan') {
      _injectArtisanBell();
    } else if (page === 'admin') {
      _wireAdminBell();
    }

    /* Trigger initial badge update */
    var sys = window.FixeoNotificationsV1;
    if (sys && typeof sys.updateBadges === 'function') {
      setTimeout(sys.updateBadges, 100);
    }
  }

  function _init() {
    _bindEvents();
    /* Bell injection deferred to ensure page layout is complete */
    setTimeout(_injectBells, 300);
    /* Re-inject bells after dynamic section changes */
    window.addEventListener('fixeo:auth:updated', function() {
      setTimeout(_injectBells, 400);
    });
  }

  /* ── Public API ─────────────────────────────────────────────── */
  window.FixeoNotifEngine = {
    VERSION:                VERSION,
    /* Callable by artisan dashboard V2 after successful actions */
    notifyMissionAccepted:  notifyMissionAccepted,
    notifyMissionStarted:   notifyMissionStarted,
    notifyMissionCompleted: notifyMissionCompleted,
    notifyMissionValidated: notifyMissionValidated,
    /* Callable by anyone */
    sbPersist:              _sbPersist,
    push:                   _push
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

  console.log('[FixeoNotifEngine] Notification Engine ' + VERSION + ' loaded');

})();
