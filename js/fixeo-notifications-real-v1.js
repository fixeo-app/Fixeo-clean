/* ============================================================
   FIXEO — REAL NOTIFICATION LAYER V1
   js/fixeo-notifications-real-v1.js

   Storage key: fixeo_notifications_v1
   Audiences:   client | artisan | admin

   OBJECTIVE:
     Map REAL marketplace events → audience-specific notifications.
     Deduplicate aggressively. Zero fake data.
     Bridge to existing window.notifications for toast/panel display.

   NEVER:
     - Fake notifications / fake unread counts
     - Duplicate spam on page reload
     - Fork lifecycle systems
     - Create polling loops
     - Call Supabase directly
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxNrV1Loaded) return;
  window._fxNrV1Loaded = true;

  /* ── Constants ───────────────────────────────────────────── */
  var STORAGE_KEY        = 'fixeo_notifications_v1';
  var DEDUP_KEY          = 'fixeo_notif_dedup_v1';
  var MAX_NOTIFICATIONS  = 150;
  var DEDUP_TTL_MS       = 4 * 60 * 60 * 1000;  /* 4 hours — same event cannot repeat */
  var REQUESTS_KEY       = 'fixeo_client_requests';

  /* ── Helpers ─────────────────────────────────────────────── */
  function safeJSON(str, fb) {
    try { var p=JSON.parse(str); return p==null?fb:p; } catch(e){ return fb; }
  }
  function uid() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
  }
  function nowISO() { return new Date().toISOString(); }
  function esc(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ── Type catalogue ──────────────────────────────────────── */
  var TYPES = {
    /* client audience */
    C_REQUEST_CREATED   : 'c_request_created',
    C_ARTISAN_ASSIGNED  : 'c_artisan_assigned',
    C_MISSION_STARTED   : 'c_mission_started',
    C_MISSION_COMPLETED : 'c_mission_completed',
    C_CONFIRM_PENDING   : 'c_confirm_pending',
    C_MISSION_VALIDATED : 'c_mission_validated',
    /* artisan audience */
    A_NEW_REQUEST       : 'a_new_request',
    A_MISSION_ACCEPTED  : 'a_mission_accepted',
    A_MISSION_STARTED   : 'a_mission_started',
    A_MISSION_COMPLETED : 'a_mission_completed',
    A_MISSION_VALIDATED : 'a_mission_validated',
    A_COMMISSION_DUE    : 'a_commission_due',
    A_COMMISSION_PAID   : 'a_commission_paid',
    A_PROFILE_VALIDATED : 'a_profile_validated',
    A_PROFILE_SUSPENDED : 'a_profile_suspended',
    A_PROFILE_REVIEW    : 'a_profile_review',
    A_CLAIM_APPROVED    : 'a_claim_approved',
    /* admin audience */
    ADM_NEW_REQUEST     : 'adm_new_request',
    ADM_MISSION_BLOCKED : 'adm_mission_blocked',
    ADM_MISSION_VALIDATED: 'adm_mission_validated',
    ADM_COMMISSION_DUE  : 'adm_commission_due',
    ADM_COMMISSION_REVIEW: 'adm_commission_review',
    ADM_ARTISAN_VALIDATE: 'adm_artisan_validate',
    ADM_CLAIM_REQUEST   : 'adm_claim_request',
    ADM_ARTISAN_SUSPENDED_ACTIVE: 'adm_artisan_suspended_active'
  };

  var TYPE_META = {};
  /* client */
  TYPE_META[TYPES.C_REQUEST_CREATED]   = { label:'Demande publi\u00e9e',      icon:'\ud83d\udce4', severity:'info'    };
  TYPE_META[TYPES.C_ARTISAN_ASSIGNED]  = { label:'Artisan assign\u00e9',       icon:'\ud83e\udd1d', severity:'success' };
  TYPE_META[TYPES.C_MISSION_STARTED]   = { label:'Intervention d\u00e9marr\u00e9e', icon:'\ud83d\ude80', severity:'info'    };
  TYPE_META[TYPES.C_MISSION_COMPLETED] = { label:'Intervention termin\u00e9e', icon:'\u2714\ufe0f', severity:'success' };
  TYPE_META[TYPES.C_CONFIRM_PENDING]   = { label:'Confirmation requise',        icon:'\u23f3',       severity:'warning' };
  TYPE_META[TYPES.C_MISSION_VALIDATED] = { label:'Mission valid\u00e9e',        icon:'\ud83c\udf89', severity:'success' };
  /* artisan */
  TYPE_META[TYPES.A_NEW_REQUEST]       = { label:'Nouvelle demande compatible', icon:'\ud83d\udccc', severity:'info'    };
  TYPE_META[TYPES.A_MISSION_ACCEPTED]  = { label:'Mission accept\u00e9e',       icon:'\ud83e\udd1d', severity:'success' };
  TYPE_META[TYPES.A_MISSION_STARTED]   = { label:'Intervention d\u00e9marr\u00e9e', icon:'\ud83d\ude80', severity:'info'    };
  TYPE_META[TYPES.A_MISSION_COMPLETED] = { label:'Intervention termin\u00e9e',  icon:'\u2714\ufe0f', severity:'success' };
  TYPE_META[TYPES.A_MISSION_VALIDATED] = { label:'Mission valid\u00e9e par client', icon:'\ud83c\udf89', severity:'success' };
  TYPE_META[TYPES.A_COMMISSION_DUE]    = { label:'Commission \u00e0 r\u00e9gler', icon:'\ud83d\udcb8', severity:'warning' };
  TYPE_META[TYPES.A_COMMISSION_PAID]   = { label:'Commission r\u00e9gl\u00e9e',  icon:'\ud83d\udcb0', severity:'success' };
  TYPE_META[TYPES.A_PROFILE_VALIDATED] = { label:'Profil valid\u00e9',           icon:'\u2705',       severity:'success' };
  TYPE_META[TYPES.A_PROFILE_SUSPENDED] = { label:'Profil suspendu',              icon:'\u26d4',       severity:'danger'  };
  TYPE_META[TYPES.A_PROFILE_REVIEW]    = { label:'Profil en v\u00e9rification',  icon:'\ud83d\udd0d', severity:'info'    };
  TYPE_META[TYPES.A_CLAIM_APPROVED]    = { label:'Revendication approuv\u00e9e', icon:'\ud83c\udfc6', severity:'success' };
  /* admin */
  TYPE_META[TYPES.ADM_NEW_REQUEST]              = { label:'Nouvelle demande',              icon:'\ud83d\udce5', severity:'info'    };
  TYPE_META[TYPES.ADM_MISSION_BLOCKED]          = { label:'Mission bloqu\u00e9e',           icon:'\u26d4',       severity:'danger'  };
  TYPE_META[TYPES.ADM_MISSION_VALIDATED]        = { label:'Mission valid\u00e9e',            icon:'\u2714\ufe0f', severity:'success' };
  TYPE_META[TYPES.ADM_COMMISSION_DUE]           = { label:'Commission \u00e0 r\u00e9gler',  icon:'\ud83d\udcb8', severity:'warning' };
  TYPE_META[TYPES.ADM_COMMISSION_REVIEW]        = { label:'Commission \u00e0 \u00e9valuer', icon:'\u29d7',       severity:'warning' };
  TYPE_META[TYPES.ADM_ARTISAN_VALIDATE]         = { label:'Artisan \u00e0 valider',          icon:'\ud83d\udc77', severity:'info'    };
  TYPE_META[TYPES.ADM_CLAIM_REQUEST]            = { label:'Revendication profil',            icon:'\ud83d\udcce', severity:'info'    };
  TYPE_META[TYPES.ADM_ARTISAN_SUSPENDED_ACTIVE] = { label:'Artisan suspendu \u2014 mission active', icon:'\u26a0\ufe0f', severity:'danger'  };

  /* ── Read/write storage ──────────────────────────────────── */
  function readAll() {
    return safeJSON(localStorage.getItem(STORAGE_KEY), []).filter(Boolean);
  }
  function writeAll(arr) {
    /* Keep max 150, newest first */
    var trimmed = arr.slice().sort(function(a,b){ return new Date(b.created_at||0)-new Date(a.created_at||0); }).slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    localStorage.setItem('fixeo_notif_v1_unread_' + _audience(), String(_countUnread(trimmed)));
    _dispatch('fixeo:notifications:updated', { count: _countUnread(trimmed) });
    _updateBadges(trimmed);
  }

  /* ── Dedup store ─────────────────────────────────────────── */
  function readDedup() {
    return safeJSON(localStorage.getItem(DEDUP_KEY), {});
  }
  function writeDedup(map) {
    localStorage.setItem(DEDUP_KEY, JSON.stringify(map));
  }
  function isDuplicate(dedupKey) {
    if (!dedupKey) return false;
    var map = readDedup();
    var ts  = map[dedupKey];
    if (!ts) return false;
    return (Date.now() - new Date(ts).getTime()) < DEDUP_TTL_MS;
  }
  function stampDedup(dedupKey) {
    if (!dedupKey) return;
    var map = readDedup();
    map[dedupKey] = nowISO();
    /* Prune old keys (>24h) */
    var now = Date.now();
    Object.keys(map).forEach(function(k) {
      if (now - new Date(map[k]).getTime() > 86400000) delete map[k];
    });
    writeDedup(map);
  }

  /* ── Audience detection ──────────────────────────────────── */
  function _audience() {
    var bt = String(document.body ? (document.body.dataset.dashType||'') : '').toLowerCase();
    if (bt === 'admin')   return 'admin';
    if (bt === 'artisan') return 'artisan';
    if (bt === 'client')  return 'client';
    var role = String(localStorage.getItem('fixeo_role')||localStorage.getItem('user_role')||'').toLowerCase();
    if (role === 'admin'  || sessionStorage.getItem('fixeo_admin_auth')==='1') return 'admin';
    if (role === 'artisan') return 'artisan';
    if (role === 'client')  return 'client';
    return '';
  }
  function _currentUserId() {
    var aud = _audience();
    if (aud === 'admin')   return 'admin';
    if (aud === 'artisan') return String(localStorage.getItem('fixeo_user_id')||localStorage.getItem('user_id')||_normName(localStorage.getItem('user_name')||'')||'artisan');
    return String(localStorage.getItem('fixeo_user_id')||localStorage.getItem('user_id')||localStorage.getItem('fixeo_user')||'client');
  }
  function _artisanId() {
    return String(localStorage.getItem('fixeo_user_id')||localStorage.getItem('user_id')||_normName(localStorage.getItem('user_name')||'')||'artisan');
  }
  function _normName(n) {
    return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');
  }

  /* ── Build notification object ───────────────────────────── */
  function _build(type, audience, audienceId, title, message, opts) {
    opts = opts || {};
    var meta = TYPE_META[type] || { label:type, icon:'\ud83d\udd14', severity:'info' };
    return {
      id         : uid(),
      audience   : audience,
      audience_id: audienceId,
      type       : type,
      title      : title || meta.label,
      message    : message || '',
      ref_type   : opts.ref_type || '',
      ref_id     : String(opts.ref_id || ''),
      severity   : opts.severity || meta.severity || 'info',
      created_at : nowISO(),
      read       : false,
      dedupe_key : opts.dedupe_key || ''
    };
  }

  /* ── Push notification ───────────────────────────────────── */
  function push(notif) {
    if (!notif || !notif.audience || !notif.audience_id) return;
    /* Dedup guard */
    if (notif.dedupe_key && isDuplicate(notif.dedupe_key)) return;
    /* Already exists check (same type + ref_id + audience_id within 4h) */
    var arr = readAll();
    var now = Date.now();
    var exists = arr.some(function(n) {
      return n.type === notif.type
        && n.audience_id === notif.audience_id
        && n.ref_id === notif.ref_id
        && (now - new Date(n.created_at||0).getTime()) < DEDUP_TTL_MS;
    });
    if (exists) return;
    /* Stamp dedup key */
    if (notif.dedupe_key) stampDedup(notif.dedupe_key);
    arr.push(notif);
    writeAll(arr);
    /* Bridge to window.notifications toast — only for current audience */
    var aud = _audience();
    if (aud && aud === notif.audience && _currentUserId() === notif.audience_id) {
      _showToast(notif);
    }
  }

  /* ── Toast bridge ────────────────────────────────────────── */
  function _showToast(notif) {
    var meta = TYPE_META[notif.type] || { label:notif.title, icon:'\ud83d\udd14', severity:'info' };
    /* Map severity to existing window.notifications methods */
    var sys = window.notifications || window.notifSystem || window.FixeoNotificationSystem;
    if (sys) {
      var toastType = notif.severity === 'danger' ? 'error' : (notif.severity || 'info');
      if (typeof sys.showToast === 'function') {
        sys.showToast({ type:toastType, title:notif.title, message:notif.message, icon:meta.icon, tone:toastType, silent:false });
      } else if (typeof sys[toastType] === 'function') {
        sys[toastType](notif.title, notif.message);
      }
      return;
    }
    /* Fallback: own minimal toast if no existing system */
    _fallbackToast(notif, meta);
  }
  function _fallbackToast(notif, meta) {
    var existing = document.querySelector('.fxnrv1-toast-wrap');
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'fxnrv1-toast-wrap';
      document.body.appendChild(existing);
    }
    var t = document.createElement('div');
    t.className = 'fxnrv1-toast fxnrv1-sev-' + (notif.severity||'info');
    t.innerHTML = '<span class="fxnrv1-toast-icon">' + esc(meta.icon) + '</span>'
      + '<div class="fxnrv1-toast-body">'
      + '<div class="fxnrv1-toast-title">' + esc(notif.title) + '</div>'
      + (notif.message ? '<div class="fxnrv1-toast-msg">' + esc(notif.message) + '</div>' : '')
      + '</div>'
      + '<button class="fxnrv1-toast-close" aria-label="Fermer">\u00d7</button>';
    t.querySelector('.fxnrv1-toast-close').onclick = function(){ t.remove(); };
    existing.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 4500);
  }

  /* ── Unread count helpers ────────────────────────────────── */
  function _countUnread(arr) {
    var aud = _audience();
    var uid2 = _currentUserId();
    if (!aud || !uid2) return 0;
    return arr.filter(function(n){ return n.audience===aud && n.audience_id===uid2 && !n.read; }).length;
  }

  /* ── Badge updates ───────────────────────────────────────── */
  function _updateBadges(arr) {
    var count = _countUnread(arr||readAll());
    /* Existing notif-badge / notif-count / fixeo-gh-badge (notifications.js targets) */
    document.querySelectorAll('.notif-badge, .notif-count, .fixeo-gh-badge, .fxnrv1-badge').forEach(function(b) {
      b.textContent = count > 99 ? '99+' : (count > 0 ? String(count) : '');
      b.classList.toggle('has-notif', count > 0);
      b.style.display = count > 0 ? 'flex' : 'none';
    });
    /* fxnrv1-specific unread label inside panels */
    document.querySelectorAll('.fxnrv1-unread-count').forEach(function(el) {
      el.textContent = count > 0 ? String(count) : '';
      el.style.display = count > 0 ? 'inline-flex' : 'none';
    });
    /* Update existing notifications.js system if running (so it stays in sync) */
    var sys = window.notifications || window.notifSystem || window.FixeoNotificationSystem;
    if (sys && typeof sys.updateBadge === 'function') {
      /* Let it do its own calculation via its own store — no interference */
    }
  }

  /* ── Dispatch helper ─────────────────────────────────────── */
  function _dispatch(ev, detail) {
    try { window.dispatchEvent(new CustomEvent(ev, { detail: detail||{} })); } catch(e){}
  }

  /* ── Status normalization ────────────────────────────────── */
  function normSt(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if (!n||n==='nouvelle'||n==='disponible') return 'nouvelle';
    if (n==='acceptee'||n==='accepte')         return 'accept\u00e9e';
    if (n==='en cours'||n==='en_cours'||n==='encours') return 'en_cours';
    if (n==='terminee'||n==='termine')         return 'termin\u00e9e';
    if (n==='validee'||n==='valide'||n==='intervention confirmee'||n==='intervention_confirmee') return 'valid\u00e9e';
    return s||'nouvelle';
  }

  /* ── Read requests ───────────────────────────────────────── */
  function _readRequests() {
    try {
      if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list==='function') return window.FixeoClientRequestsStore.list();
      return safeJSON(localStorage.getItem(REQUESTS_KEY), []);
    } catch(e){ return []; }
  }

  /* ── Snapshot tracking (for diff-based detection) ────────── */
  var _snapshot = {}; /* id → { status, assigned_artisan_id, commission_paid, commission_pending_review } */
  function _buildSnapshot() {
    var snap = {};
    _readRequests().forEach(function(r) {
      if (!r.id) return;
      snap[r.id] = {
        status               : normSt(r.status),
        assigned_artisan_id  : String(r.assigned_artisan_id||'').trim(),
        assigned_artisan     : String(r.assigned_artisan||'').trim(),
        commission_paid      : r.commission_paid===true,
        commission_pending_review: r.commission_pending_review===true,
        client_confirmation  : String(r.client_confirmation||'').trim()
      };
    });
    return snap;
  }
  /* Init snapshot on load — prevents replay spam */
  _snapshot = _buildSnapshot();

  /* ── Dedupe key helpers ──────────────────────────────────── */
  function dk(type, refId, audienceId) {
    return [type, String(refId||''), String(audienceId||'')].join('|');
  }

  /* ═══════════════════════════════════════════════════════
     EVENT MAPPERS
     ═══════════════════════════════════════════════════════ */

  /* ── 1. New request created ──────────────────────────────── */
  function _onRequestCreated(evt) {
    var r = (evt && evt.detail) || {};
    var refId = String(r.id||r.request_id||'').trim();
    if (!refId) {
      /* Try reading latest request */
      var all = _readRequests();
      if (all.length) r = all[all.length-1];
      refId = String(r.id||'').trim();
    }
    if (!refId) return;
    var svc = String(r.service||r.probleme||'').trim() || 'Service';
    var city = String(r.city||r.ville||'').trim() || '';

    /* CLIENT notification */
    var cId = String(r.client_id||r.user_id||localStorage.getItem('fixeo_user_id')||localStorage.getItem('user_id')||'client').trim();
    push(_build(
      TYPES.C_REQUEST_CREATED, 'client', cId,
      'Demande publi\u00e9e',
      'Votre demande pour \u00ab ' + svc + ' \u00bb' + (city?' \u00e0 '+city:'') + ' a bien \u00e9t\u00e9 envoy\u00e9e.',
      { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.C_REQUEST_CREATED, refId, cId) }
    ));

    /* ADMIN notification */
    push(_build(
      TYPES.ADM_NEW_REQUEST, 'admin', 'admin',
      'Nouvelle demande',
      'Nouvelle demande : ' + svc + (city?' \u00e0 '+city:'') + '. R\u00e9f #' + refId.slice(-6).toUpperCase(),
      { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.ADM_NEW_REQUEST, refId, 'admin') }
    ));
  }

  /* ── 2. Request updated (lifecycle diff) ─────────────────── */
  function _onRequestUpdated(evt) {
    var r = (evt && evt.detail) || {};
    var refId = String(r.id||r.request_id||'').trim();
    if (!refId) return;

    var prev = _snapshot[refId] || {};
    var cur = {
      status               : normSt(r.status),
      assigned_artisan_id  : String(r.assigned_artisan_id||'').trim(),
      assigned_artisan     : String(r.assigned_artisan||'').trim(),
      commission_paid      : r.commission_paid===true,
      commission_pending_review: r.commission_pending_review===true,
      client_confirmation  : String(r.client_confirmation||'').trim()
    };
    /* Persist new snapshot state */
    _snapshot[refId] = cur;

    var svc  = String(r.service||r.probleme||'').trim() || 'votre service';
    var ref  = '#' + refId.slice(-6).toUpperCase();
    var cId  = String(r.client_id||r.user_id||'client').trim() || 'client';
    var artId= cur.assigned_artisan_id || _normName(cur.assigned_artisan) || 'artisan';
    var artName = cur.assigned_artisan || 'L\u2019artisan';

    /* Artisan assigned */
    if (!prev.assigned_artisan_id && cur.assigned_artisan_id && cur.status==='accept\u00e9e') {
      push(_build(TYPES.C_ARTISAN_ASSIGNED, 'client', cId,
        'Artisan assign\u00e9',
        artName + ' a \u00e9t\u00e9 assign\u00e9 \u00e0 votre demande ' + ref + ' pour ' + svc + '.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.C_ARTISAN_ASSIGNED,refId,cId) }
      ));
      push(_build(TYPES.A_MISSION_ACCEPTED, 'artisan', artId,
        'Mission accept\u00e9e',
        'Vous avez \u00e9t\u00e9 assign\u00e9 \u00e0 la mission ' + ref + ' pour ' + svc + '.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.A_MISSION_ACCEPTED,refId,artId) }
      ));
    }

    /* Mission started */
    if (prev.status!=='en_cours' && cur.status==='en_cours') {
      push(_build(TYPES.C_MISSION_STARTED, 'client', cId,
        'Intervention d\u00e9marr\u00e9e',
        artName + ' a d\u00e9marr\u00e9 l\u2019intervention ' + ref + ' pour ' + svc + '.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.C_MISSION_STARTED,refId,cId) }
      ));
      if (artId) push(_build(TYPES.A_MISSION_STARTED, 'artisan', artId,
        'Intervention d\u00e9marr\u00e9e',
        'Intervention en cours pour ' + ref + ' \u2014 ' + svc + '.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.A_MISSION_STARTED,refId,artId) }
      ));
    }

    /* Mission completed (waiting client confirm) */
    if (prev.status!=='termin\u00e9e' && cur.status==='termin\u00e9e') {
      push(_build(TYPES.C_MISSION_COMPLETED, 'client', cId,
        'Intervention termin\u00e9e',
        artName + ' a marqu\u00e9 l\u2019intervention ' + ref + ' comme termin\u00e9e. Confirmez pour valider la mission.',
        { ref_type:'request', ref_id:refId, severity:'warning', dedupe_key:dk(TYPES.C_MISSION_COMPLETED,refId,cId) }
      ));
      push(_build(TYPES.C_CONFIRM_PENDING, 'client', cId,
        'Confirmation requise',
        'Confirmez l\u2019intervention ' + ref + ' pour lib\u00e9rer le paiement.',
        { ref_type:'request', ref_id:refId, severity:'warning', dedupe_key:dk(TYPES.C_CONFIRM_PENDING,refId,cId) }
      ));
      if (artId) push(_build(TYPES.A_MISSION_COMPLETED, 'artisan', artId,
        'Intervention marqu\u00e9e termin\u00e9e',
        'La mission ' + ref + ' est en attente de confirmation client.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.A_MISSION_COMPLETED,refId,artId) }
      ));
    }

    /* Mission validated by client */
    if (prev.status!=='valid\u00e9e' && cur.status==='valid\u00e9e') {
      push(_build(TYPES.C_MISSION_VALIDATED, 'client', cId,
        'Mission valid\u00e9e',
        'Mission ' + ref + ' valid\u00e9e. Merci de faire confiance \u00e0 Fixeo.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.C_MISSION_VALIDATED,refId,cId) }
      ));
      if (artId) push(_build(TYPES.A_MISSION_VALIDATED, 'artisan', artId,
        'Mission valid\u00e9e par le client',
        'Le client a valid\u00e9 la mission ' + ref + '. Votre commission sera r\u00e9gl\u00e9e par Fixeo.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.A_MISSION_VALIDATED,refId,artId) }
      ));
      push(_build(TYPES.ADM_MISSION_VALIDATED, 'admin', 'admin',
        'Mission valid\u00e9e',
        'Mission ' + ref + ' valid\u00e9e \u2014 commission \u00e0 v\u00e9rifier.',
        { ref_type:'request', ref_id:refId, dedupe_key:dk(TYPES.ADM_MISSION_VALIDATED,refId,'admin') }
      ));
    }

    /* Commission pending review */
    if (!prev.commission_pending_review && cur.commission_pending_review) {
      push(_build(TYPES.ADM_COMMISSION_REVIEW, 'admin', 'admin',
        'Commission \u00e0 \u00e9valuer',
        'Mission ' + ref + ' flaggu\u00e9e \u2014 montant commission \u00e0 confirmer.',
        { ref_type:'request', ref_id:refId, severity:'warning', dedupe_key:dk(TYPES.ADM_COMMISSION_REVIEW,refId,'admin') }
      ));
    }
  }

  /* ── 3. Mission validated event ──────────────────────────── */
  function _onMissionValidated(evt) {
    var d = (evt && evt.detail) || {};
    var reqId = String(d.requestId||d.missionId||d.id||'').trim();
    if (!reqId) return;
    var artisanName = String(d.artisanName||'Artisan').trim();
    var artId = String(d.artisanId||_normName(artisanName)||'artisan').trim();
    var price = d.price ? (' \u2014 ' + Math.round(d.price).toLocaleString('fr-FR') + ' MAD') : '';
    push(_build(TYPES.A_COMMISSION_DUE, 'artisan', artId,
      'Commission \u00e0 r\u00e9gler',
      'Mission #' + reqId.slice(-6).toUpperCase() + ' valid\u00e9e' + price + '. Commission Fixeo 15% \u00e0 r\u00e9gler.',
      { ref_type:'request', ref_id:reqId, severity:'warning', dedupe_key:dk(TYPES.A_COMMISSION_DUE,reqId,artId) }
    ));
    push(_build(TYPES.ADM_COMMISSION_DUE, 'admin', 'admin',
      'Commission \u00e0 r\u00e9gler',
      'Mission #' + reqId.slice(-6).toUpperCase() + ' valid\u00e9e \u2014 commission \u00e0 encaisser.',
      { ref_type:'request', ref_id:reqId, severity:'warning', dedupe_key:dk(TYPES.ADM_COMMISSION_DUE,reqId,'admin') }
    ));
  }

  /* ── 4. Commission paid ──────────────────────────────────── */
  function _onCommissionPaid(evt) {
    var d = (evt && evt.detail) || {};
    var reqId = String(d.requestId||d.id||'').trim();
    if (!reqId) return;
    var artId = String(d.artisanId||'artisan').trim();
    push(_build(TYPES.A_COMMISSION_PAID, 'artisan', artId,
      'Commission r\u00e9gl\u00e9e',
      'Votre commission pour la mission #' + reqId.slice(-6).toUpperCase() + ' a \u00e9t\u00e9 r\u00e9gl\u00e9e par Fixeo.',
      { ref_type:'request', ref_id:reqId, dedupe_key:dk(TYPES.A_COMMISSION_PAID,reqId,artId) }
    ));
  }

  /* ── 5. Artisan status updated (moderation) ──────────────── */
  function _onArtisanStatusUpdated(evt) {
    var d = (evt && evt.detail) || {};
    var artId = String(d.artisanId||d.id||'').trim();
    var status = String(d.status||d.moderation_status||'').toLowerCase();
    if (!artId) return;

    if (status === 'active' || status === 'validated') {
      push(_build(TYPES.A_PROFILE_VALIDATED, 'artisan', artId,
        'Profil valid\u00e9',
        'Votre profil Fixeo a \u00e9t\u00e9 valid\u00e9. Vous \u00eates maintenant visible sur le marketplace.',
        { ref_type:'artisan', ref_id:artId, dedupe_key:dk(TYPES.A_PROFILE_VALIDATED,artId,artId) }
      ));
    } else if (status === 'suspended' || status === 'hidden') {
      push(_build(TYPES.A_PROFILE_SUSPENDED, 'artisan', artId,
        'Profil suspendu',
        'Votre profil a \u00e9t\u00e9 temporairement suspendu. Contactez Fixeo pour plus d\u2019informations.',
        { ref_type:'artisan', ref_id:artId, severity:'danger', dedupe_key:dk(TYPES.A_PROFILE_SUSPENDED,artId,artId) }
      ));
    } else if (status === 'pending_validation' || status === 'incomplete') {
      push(_build(TYPES.A_PROFILE_REVIEW, 'artisan', artId,
        'Profil en v\u00e9rification',
        'Votre profil est en cours de v\u00e9rification par l\u2019\u00e9quipe Fixeo.',
        { ref_type:'artisan', ref_id:artId, dedupe_key:dk(TYPES.A_PROFILE_REVIEW,artId,artId) }
      ));
      push(_build(TYPES.ADM_ARTISAN_VALIDATE, 'admin', 'admin',
        'Artisan \u00e0 valider',
        'Un profil artisan attend validation (ID: ' + artId + ').',
        { ref_type:'artisan', ref_id:artId, dedupe_key:dk(TYPES.ADM_ARTISAN_VALIDATE,artId,'admin') }
      ));
    }
  }

  /* ── 6. Claim approved ───────────────────────────────────── */
  function _onClaimApproved(evt) {
    var d = (evt && evt.detail) || {};
    var artId = String(d.artisanId||d.id||'').trim();
    var claimId = String(d.claimId||'').trim();
    if (!artId) return;
    push(_build(TYPES.A_CLAIM_APPROVED, 'artisan', artId,
      'Revendication approuv\u00e9e',
      'Votre revendication de profil a \u00e9t\u00e9 approuv\u00e9e. Bienvenue sur Fixeo Pro.',
      { ref_type:'claim', ref_id:claimId||artId, dedupe_key:dk(TYPES.A_CLAIM_APPROVED,artId,artId) }
    ));
  }

  /* ── 7. Missions updated (broad event) ───────────────────── */
  function _onMissionsUpdated() {
    /* Process snapshot diff — catch any transition not caught by specific events */
    var reqs = _readRequests();
    reqs.forEach(function(r) {
      if (!r.id) return;
      var prev = _snapshot[r.id];
      if (!prev) {
        _snapshot[r.id] = {
          status: normSt(r.status),
          assigned_artisan_id: String(r.assigned_artisan_id||'').trim(),
          assigned_artisan: String(r.assigned_artisan||'').trim(),
          commission_paid: r.commission_paid===true,
          commission_pending_review: r.commission_pending_review===true,
          client_confirmation: String(r.client_confirmation||'').trim()
        };
        return;
      }
      /* Reuse the request-updated logic via synthetic event */
      var fakeEvt = { detail: r };
      _onRequestUpdated(fakeEvt);
    });
  }

  /* ── 8. Commission updated (check pending review state) ───── */
  function _onCommissionUpdated(evt) {
    var d = (evt && evt.detail) || {};
    var reqId = String(d.id||d.requestId||'').trim();
    if (!reqId) return;
    var reqs = _readRequests();
    var r = reqs.find(function(x){ return String(x.id||'')=== reqId; });
    if (!r) return;
    var fakeEvt = { detail: r };
    _onRequestUpdated(fakeEvt);
  }

  /* ═══════════════════════════════════════════════════════
     MARK AS READ / MARK ALL READ
     ═══════════════════════════════════════════════════════ */

  function markRead(id) {
    var arr = readAll();
    var changed = false;
    arr = arr.map(function(n) {
      if (String(n.id||'') !== String(id)) return n;
      changed = true;
      return Object.assign({}, n, { read: true });
    });
    if (changed) writeAll(arr);
  }

  function markAllRead() {
    var aud  = _audience();
    var uid2 = _currentUserId();
    var arr  = readAll().map(function(n) {
      if (n.audience===aud && n.audience_id===uid2) return Object.assign({},n,{read:true});
      return n;
    });
    writeAll(arr);
  }

  /* ── Current audience notifications ─────────────────────── */
  function getForCurrentUser() {
    var aud  = _audience();
    var uid2 = _currentUserId();
    if (!aud || !uid2) return [];
    return readAll()
      .filter(function(n){ return n.audience===aud && n.audience_id===uid2; })
      .sort(function(a,b){ return new Date(b.created_at||0)-new Date(a.created_at||0); });
  }
  function getUnreadCount() {
    return getForCurrentUser().filter(function(n){ return !n.read; }).length;
  }

  /* ═══════════════════════════════════════════════════════
     LIGHTWEIGHT PANEL (fallback when notifications.js panel not present)
     Injected ONLY if no .notif-panel exists on the page
     ═══════════════════════════════════════════════════════ */

  function _maybeInjectPanel() {
    /* If existing panel exists (notifications.js), don't inject another */
    if (document.querySelector('.notif-panel')) return;
    /* Inject small floating panel anchored to .notif-btn click */
    _injectMinimalPanel();
  }

  function _injectMinimalPanel() {
    var panel = document.createElement('div');
    panel.id = 'fxnrv1-panel';
    panel.className = 'fxnrv1-panel';
    panel.innerHTML = '<div class="fxnrv1-panel-head">'
      + '<span class="fxnrv1-panel-title">\ud83d\udd14 Notifications</span>'
      + '<div style="display:flex;gap:8px">'
        + '<button class="fxnrv1-btn-text" data-act="mark-all">Tout lire</button>'
        + '<button class="fxnrv1-btn-icon" data-act="close">\u00d7</button>'
      + '</div></div>'
      + '<div class="fxnrv1-panel-body" id="fxnrv1-panel-body"></div>';
    document.body.appendChild(panel);

    panel.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-act]');
      if (btn) {
        if (btn.dataset.act==='close')    { panel.classList.remove('open'); return; }
        if (btn.dataset.act==='mark-all') { markAllRead(); _renderPanel(); return; }
        if (btn.dataset.act==='mark')     { markRead(btn.dataset.id||''); _renderPanel(); return; }
      }
    });

    /* Bell click */
    document.addEventListener('click', function(e) {
      var bell = e.target.closest('.notif-btn, .notif-bell, .fixeo-gh-notif');
      if (bell) {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) _renderPanel();
      } else if (panel.classList.contains('open') && !panel.contains(e.target)) {
        panel.classList.remove('open');
      }
    }, true);
  }

  function _renderPanel() {
    var body = document.getElementById('fxnrv1-panel-body');
    if (!body) return;
    var notifs = getForCurrentUser();
    if (!notifs.length) {
      body.innerHTML = '<div class="fxnrv1-empty">'
        + '<div style="font-size:2rem;margin-bottom:8px">\ud83d\udd14</div>'
        + '<strong>Aucune notification</strong>'
        + '<span>Les \u00e9v\u00e9nements importants appara\u00eetront ici.</span></div>';
      return;
    }
    body.innerHTML = notifs.map(function(n) {
      var meta = TYPE_META[n.type] || { icon:'\ud83d\udd14', severity:'info' };
      return '<div class="fxnrv1-item' + (n.read?'':' unread') + '" data-act="mark" data-id="' + esc(n.id||'') + '">'
        + '<span class="fxnrv1-item-icon">' + esc(meta.icon) + '</span>'
        + '<div class="fxnrv1-item-body">'
          + '<div class="fxnrv1-item-title">' + esc(n.title||'') + '</div>'
          + (n.message ? '<div class="fxnrv1-item-msg">' + esc(n.message) + '</div>' : '')
        + '</div>'
        + '<span class="fxnrv1-item-time">' + _relTime(n.created_at) + '</span>'
        + '</div>';
    }).join('');
  }

  function _relTime(iso) {
    if (!iso) return '';
    try {
      var diff = Date.now() - new Date(iso).getTime();
      var m = Math.round(diff/60000);
      if (m < 1)  return '\u00e0 l\u2019instant';
      if (m < 60) return 'il y a ' + m + ' min';
      var h = Math.round(diff/3600000);
      if (h < 24) return 'il y a ' + h + 'h';
      return new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
    } catch(e){ return ''; }
  }

  /* ═══════════════════════════════════════════════════════
     BIND ALL EVENTS
     ═══════════════════════════════════════════════════════ */

  function bindEvents() {
    /* Request lifecycle */
    window.addEventListener('fixeo:client-request-created',  _onRequestCreated);
    window.addEventListener('fixeo:client-request-updated',  _onRequestUpdated);
    window.addEventListener('fixeo:missions:updated',        _onMissionsUpdated);
    window.addEventListener('fixeo:mission-validated',       _onMissionValidated);
    window.addEventListener('fixeo:commission-paid',         _onCommissionPaid);
    window.addEventListener('fixeo:commission-updated',      _onCommissionUpdated);
    window.addEventListener('fixeo:artisan-status-updated',  _onArtisanStatusUpdated);
    window.addEventListener('fixeo:claim-approved',          _onClaimApproved);

    /* State broad event — refresh badges */
    window.addEventListener('fixeo:state:updated', function() {
      _updateBadges();
    });
    /* Profile updated */
    window.addEventListener('fixeo:profile:updated', function(evt) {
      if (evt && evt.detail && evt.detail.artisanId) {
        _onArtisanStatusUpdated(evt);
      }
    });

    /* Storage cross-tab sync */
    window.addEventListener('storage', function(e) {
      if (e.key === STORAGE_KEY) {
        _updateBadges();
        /* Re-render if open */
        var body = document.getElementById('fxnrv1-panel-body');
        if (body) _renderPanel();
      }
      if (e.key === REQUESTS_KEY) {
        _onMissionsUpdated();
      }
    });

    /* External refresh request */
    window.addEventListener('fixeo:notifications:refresh', function() {
      _updateBadges();
    });

    /* Mission-started / completed as state:updated sub-events */
    window.addEventListener('fixeo:mission-started', function(evt) {
      var d = (evt && evt.detail) || {};
      var mId = String(d.missionId||d.id||'').trim();
      if (!mId) return;
      var reqs = _readRequests();
      var r = reqs.find(function(x){ return String(x.id||'')===mId; });
      if (r) _onRequestUpdated({ detail: r });
    });
    window.addEventListener('fixeo:mission-completed', function(evt) {
      var d = (evt && evt.detail) || {};
      var mId = String(d.missionId||d.id||'').trim();
      if (!mId) return;
      var reqs = _readRequests();
      var r = reqs.find(function(x){ return String(x.id||'')===mId; });
      if (r) _onRequestUpdated({ detail: r });
    });
  }

  /* ═══════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════ */

  function init() {
    bindEvents();
    /* Initial badge sync */
    _updateBadges();
    /* Panel injection (only if no existing panel) */
    setTimeout(function() {
      _maybeInjectPanel();
      _updateBadges();
    }, 600);
    /* Safety badge re-sync */
    setTimeout(_updateBadges, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.FixeoNotificationsV1 = {
    push          : push,
    markRead      : markRead,
    markAllRead   : markAllRead,
    getForUser    : getForCurrentUser,
    getUnreadCount: getUnreadCount,
    updateBadges  : function() { _updateBadges(); },
    renderPanel   : _renderPanel,
    storageKey    : STORAGE_KEY,
    /* Expose internals for admin dashboard */
    readAll       : readAll
  };

})();
