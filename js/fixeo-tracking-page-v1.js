/**
 * FIXEO Client Tracking Page V1 — fixeo-tracking-page-v1.js
 * Version: ftp-v1a — 2026-06-12
 * ─────────────────────────────────────────────────────────────────
 * /suivi — Tracking page for guest + auth clients.
 *
 * DATA LOOKUP STRATEGY (priority order):
 *  1. localStorage 'fixeo_client_requests' — by tracking_ref field
 *  2. Supabase service_requests — description ILIKE '%Track: fxtrk-XXX%'
 *  3. Supabase service_requests — WHERE client_profile_id = auth.uid() (auth mode)
 *  4. Demo/fallback: show empty state
 *
 * NEVER TOUCHES:
 *  fixeo-client-requests-store.js, fixeo-mission-system.js,
 *  fixeo-supabase-core.js, fixeo-dispatch-engine*.js,
 *  fixeo-notification-engine.js, auth-global.js, admin*, SEO pages
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var VERSION = 'ftp-v1a';

  /* ── Canonical DB status labels ── */
  var STATUS_LABELS = {
    'new':         { label: 'Demande reçue',      cls: 'ftp-badge-new',         dot: true  },
    'assigned':    { label: 'Artisan assigné',     cls: 'ftp-badge-assigned',    dot: true  },
    'in_progress': { label: 'En cours',            cls: 'ftp-badge-in_progress', dot: false },
    'completed':   { label: 'Terminée',            cls: 'ftp-badge-completed',   dot: false },
    'validated':   { label: 'Validée ✓',           cls: 'ftp-badge-validated',   dot: false },
    'cancelled':   { label: 'Annulée',             cls: 'ftp-badge-cancelled',   dot: false }
  };

  /* Client-side localStorage status labels */
  var LOCAL_STATUS_MAP = {
    'nouvelle':    'new',
    'assigned':    'assigned',
    'en_cours':    'in_progress',
    'terminee':    'completed',
    'validated':   'validated',
    'cancelled':   'cancelled'
  };

  /* ── Timeline steps ── */
  var TIMELINE_STEPS = [
    { icon: '📨', title: 'Demande reçue',         sub: 'Votre demande a été enregistrée',      trigger: ['new','assigned','in_progress','completed','validated'] },
    { icon: '🔍', title: 'Analyse FIXEO',          sub: 'Analyse et qualification de la demande', trigger: ['new','assigned','in_progress','completed','validated'] },
    { icon: '⚡', title: 'Artisan sélectionné',   sub: 'Meilleur artisan identifié',            trigger: ['assigned','in_progress','completed','validated'] },
    { icon: '🚀', title: 'Artisan en route',       sub: 'Artisan se déplace vers vous',          trigger: ['in_progress','completed','validated'] },
    { icon: '🔧', title: 'Intervention en cours', sub: 'Mission démarrée',                      trigger: ['in_progress','completed','validated'] },
    { icon: '✅', title: 'Mission terminée',       sub: 'Service complété avec succès',          trigger: ['completed','validated'] }
  ];

  /* ── Service icons ── */
  var SERVICE_ICONS = {
    plomberie: '💧', electricite: '⚡', serrurerie: '🔒',
    climatisation: '❄️', peinture: '🎨', menuiserie: '🪚',
    nettoyage: '🧹', jardinage: '🌿'
  };

  /* ── WhatsApp support number ── */
  var WA_SUPPORT = 'https://wa.me/212660484415';

  /* ══════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════ */
  function $(sel) { return document.querySelector(sel); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function show(el) { if (el) el.classList.remove('ftp-hidden'); }
  function hide(el) { if (el) el.classList.add('ftp-hidden'); }
  function safeJSON(s, fb) { try { return JSON.parse(s); } catch(_) { return fb; } }

  function _timeAgo(iso) {
    if (!iso) return '';
    var diff = Math.max(0, Date.now() - new Date(iso).getTime());
    var m = Math.floor(diff / 60000);
    if (m < 1)   return 'à l\'instant';
    if (m < 60)  return 'il y a ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24)  return 'il y a ' + h + 'h';
    return 'il y a ' + Math.floor(h/24) + 'j';
  }

  function _formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('fr-MA', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch(_) { return iso; }
  }

  function _normalizeStatus(raw) {
    if (!raw) return 'new';
    var s = String(raw).toLowerCase().trim();
    return LOCAL_STATUS_MAP[s] || s;
  }

  function _extractRef(description) {
    if (!description) return null;
    var m = String(description).match(/Track:\s*(fxtrk-[a-z0-9]{6,12})/i);
    return m ? m[1].toLowerCase() : null;
  }

  function _extractPhone(description) {
    if (!description) return null;
    var m = String(description).match(/T[eé]l[:\s]+([0-9+\s\-]{8,15})/i);
    return m ? m[1].trim() : null;
  }

  function _serviceIcon(category) {
    return SERVICE_ICONS[String(category||'').toLowerCase().trim()] || '🔧';
  }

  /* ══════════════════════════════════════════════════════
     DATA LOOKUP — LAYER 1: localStorage
  ══════════════════════════════════════════════════════ */
  function _findInLocalStorage(ref) {
    try {
      var raw = localStorage.getItem('fixeo_client_requests');
      if (!raw) return null;
      var requests = safeJSON(raw, []);
      if (!Array.isArray(requests)) return null;

      ref = String(ref || '').toLowerCase().trim();

      /* Search by tracking_ref field */
      var found = null;
      for (var i = 0; i < requests.length; i++) {
        var r = requests[i];
        if (r && r.tracking_ref && r.tracking_ref.toLowerCase() === ref) {
          found = r; break;
        }
        /* Also check in description blob */
        var descRef = _extractRef(r.description || r.problem || '');
        if (descRef && descRef === ref) { found = r; break; }
      }
      return found ? _normalizeLocalRequest(found) : null;
    } catch (_) { return null; }
  }

  function _normalizeLocalRequest(r) {
    return {
      _source:       'localStorage',
      id:            r.id || r.supabase_id || null,
      ref:           r.tracking_ref || _extractRef(r.description || '') || '—',
      service:       r.service || r.service_category || r.category || 'Service',
      city:          r.city || r.ville || '—',
      description:   r.problem || r.description || '',
      status:        _normalizeStatus(r.status || r.statut || 'new'),
      created_at:    r.created_at || r.timestamp || r.date || null,
      phone:         r.phone || _extractPhone(r.description || '') || null,
      artisan_name:  r.artisan_name || null,
      artisan_city:  r.artisan_city || null,
      score:         r.score || null
    };
  }

  /* ══════════════════════════════════════════════════════
     DATA LOOKUP — LAYER 2: Supabase by description blob
  ══════════════════════════════════════════════════════ */
  async function _findInSupabase(ref) {
    try {
      var FS = window.FixeoSupabase;
      if (!FS || !FS.getClient) return null;
      var sb = await FS.getClient();
      if (!sb) return null;

      var res = await sb
        .from('service_requests')
        .select('id,service_category,city,description,status,created_at,client_profile_id')
        .ilike('description', '%Track: ' + ref + '%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (res.error || !res.data || !res.data.length) return null;
      return _normalizeSupabaseRequest(res.data[0]);
    } catch (_) { return null; }
  }

  /* ══════════════════════════════════════════════════════
     DATA LOOKUP — LAYER 3: Supabase auth session (latest request)
  ══════════════════════════════════════════════════════ */
  async function _findAuthRequests() {
    try {
      var FS = window.FixeoSupabase;
      if (!FS || !FS.getClient) return null;
      var sb = await FS.getClient();
      if (!sb) return null;

      var sess = await sb.auth.getSession();
      if (!sess || !sess.data || !sess.data.session) return null;
      var uid = sess.data.session.user.id;

      var res = await sb
        .from('service_requests')
        .select('id,service_category,city,description,status,created_at,client_profile_id')
        .eq('client_profile_id', uid)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(5);

      if (res.error || !res.data || !res.data.length) return null;
      return res.data.map(_normalizeSupabaseRequest);
    } catch (_) { return null; }
  }

  function _normalizeSupabaseRequest(r) {
    return {
      _source:       'supabase',
      id:            r.id,
      ref:           _extractRef(r.description || '') || ('fixeo-' + String(r.id||'').slice(0,8)),
      service:       r.service_category || 'Service',
      city:          r.city || '—',
      description:   (r.description || '').split(' [')[0],
      status:        _normalizeStatus(r.status || 'new'),
      created_at:    r.created_at || null,
      phone:         _extractPhone(r.description || '') || null,
      artisan_name:  null,
      artisan_city:  null,
      score:         null
    };
  }

  /* ══════════════════════════════════════════════════════
     RENDER — STATUS BADGE
  ══════════════════════════════════════════════════════ */
  function _renderBadge(status) {
    var s = STATUS_LABELS[status] || { label: status, cls: 'ftp-badge-unknown', dot: false };
    return '<span class="ftp-status-badge ' + s.cls + '">' +
      (s.dot ? '<span class="ftp-status-badge-dot" aria-hidden="true"></span>' : '') +
      esc(s.label) +
      '</span>';
  }

  /* ══════════════════════════════════════════════════════
     RENDER — SECTION 2: STATUS CARD
  ══════════════════════════════════════════════════════ */
  function _renderStatusCard(req) {
    var el = document.getElementById('ftp-status-card');
    if (!el) return;

    el.innerHTML =
      '<div class="ftp-status-top">' +
        '<div class="ftp-ref-block">' +
          '<div class="ftp-ref-label">Référence</div>' +
          '<div class="ftp-ref-value">' + esc(req.ref) + '</div>' +
        '</div>' +
        _renderBadge(req.status) +
      '</div>' +
      '<div class="ftp-meta-grid">' +
        '<div class="ftp-meta-item">' +
          '<div class="ftp-meta-key">Service</div>' +
          '<div class="ftp-meta-val">' + esc(_capitalize(req.service)) + '</div>' +
        '</div>' +
        '<div class="ftp-meta-item">' +
          '<div class="ftp-meta-key">Ville</div>' +
          '<div class="ftp-meta-val">' + esc(req.city) + '</div>' +
        '</div>' +
        '<div class="ftp-meta-item">' +
          '<div class="ftp-meta-key">Créé</div>' +
          '<div class="ftp-meta-val">' + esc(_formatDate(req.created_at)) + '</div>' +
        '</div>' +
        '<div class="ftp-meta-item">' +
          '<div class="ftp-meta-key">Problème</div>' +
          '<div class="ftp-meta-val" style="font-size:.78rem">' + esc((req.description || '—').slice(0, 48)) + '</div>' +
        '</div>' +
      '</div>';
  }

  function _capitalize(s) {
    return String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1);
  }

  /* ══════════════════════════════════════════════════════
     RENDER — SECTION 3: TIMELINE
  ══════════════════════════════════════════════════════ */
  function _renderTimeline(status) {
    var el = document.getElementById('ftp-timeline');
    if (!el) return;

    el.innerHTML = '';
    var activeSet = false;

    TIMELINE_STEPS.forEach(function (step, i) {
      var isDone   = step.trigger.indexOf(status) !== -1 && !activeSet;
      var isActive = false;

      /* The last matching step is "active" (current step) */
      var maxMatch = -1;
      for (var t = 0; t < TIMELINE_STEPS.length; t++) {
        if (TIMELINE_STEPS[t].trigger.indexOf(status) !== -1) maxMatch = t;
      }
      if (i === maxMatch) { isDone = false; isActive = true; activeSet = true; }
      else if (i < maxMatch) { isDone = true; }
      else { isDone = false; isActive = false; }

      var cls = isActive ? 'active' : (isDone ? 'done' : '');
      var dotContent = isDone ? '✓' : step.icon;

      var li = document.createElement('li');
      li.className = 'ftp-tl-item ' + cls;
      li.innerHTML =
        '<div class="ftp-tl-dot-wrap"><div class="ftp-tl-dot">' + dotContent + '</div></div>' +
        '<div class="ftp-tl-body">' +
          '<p class="ftp-tl-title">' + esc(step.title) + '</p>' +
          '<p class="ftp-tl-sub">' + (isActive ? '● En cours' : esc(step.sub)) + '</p>' +
        '</div>';
      el.appendChild(li);
    });
  }

  /* ══════════════════════════════════════════════════════
     RENDER — SECTION 4: ARTISAN CARD
  ══════════════════════════════════════════════════════ */
  function _renderArtisan(req) {
    var el = document.getElementById('ftp-artisan-inner');
    if (!el) return;

    var hasArtisan = req.artisan_name || ['assigned','in_progress','completed','validated'].indexOf(req.status) !== -1;

    if (req.artisan_name) {
      el.innerHTML =
        '<div class="ftp-artisan-card">' +
          '<div class="ftp-artisan-avatar">' + esc(_serviceIcon(req.service)) + '</div>' +
          '<div class="ftp-artisan-info">' +
            '<div class="ftp-artisan-name">' + esc(req.artisan_name) + '</div>' +
            '<div class="ftp-artisan-service">' + esc(_capitalize(req.service)) + '</div>' +
            '<div class="ftp-artisan-badges">' +
              (req.artisan_city ? '<span class="ftp-artisan-badge ftp-badge-city">📍 ' + esc(req.artisan_city) + '</span>' : '') +
              (req.score ? '<span class="ftp-artisan-badge ftp-badge-score">Score ' + req.score + '/100</span>' : '') +
              '<span class="ftp-artisan-badge ftp-badge-ver">✓ Vérifié</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    } else if (['assigned','in_progress'].indexOf(req.status) !== -1) {
      el.innerHTML =
        '<div class="ftp-artisan-card">' +
          '<div class="ftp-artisan-avatar">⚡</div>' +
          '<div class="ftp-artisan-info">' +
            '<div class="ftp-artisan-name">Artisan assigné</div>' +
            '<div class="ftp-artisan-service">Contactez-nous pour les coordonnées</div>' +
          '</div>' +
        '</div>';
    } else if (req.status === 'new') {
      el.innerHTML =
        '<div class="ftp-artisan-pending">' +
          '<span class="ftp-artisan-pending-ico">🔍</span>' +
          '<span>Recherche du meilleur artisan disponible…</span>' +
        '</div>';
    } else {
      el.innerHTML = '';
      var section = document.getElementById('ftp-artisan-section');
      if (section) hide(section);
    }
  }

  /* ══════════════════════════════════════════════════════
     RENDER — SECTION 5: LIVE UPDATES
  ══════════════════════════════════════════════════════ */
  function _renderUpdates(req) {
    var el = document.getElementById('ftp-updates-list');
    if (!el) return;

    var updates = [];
    var status = req.status;
    var ago = req.created_at;

    /* Build update log from status (derived — no real notification data available without auth) */
    updates.push({ ico: '📨', text: 'Demande reçue et enregistrée', time: ago });

    if (['assigned','in_progress','completed','validated'].indexOf(status) !== -1) {
      updates.push({ ico: '🔍', text: 'Analyse complétée — artisan sélectionné', time: null });
    }
    if (['in_progress','completed','validated'].indexOf(status) !== -1) {
      updates.push({ ico: '🚀', text: 'Artisan en déplacement vers vous', time: null });
      updates.push({ ico: '🔧', text: 'Intervention démarrée', time: null });
    }
    if (['completed','validated'].indexOf(status) !== -1) {
      updates.push({ ico: '✅', text: 'Mission terminée avec succès', time: null });
    }
    if (status === 'validated') {
      updates.push({ ico: '⭐', text: 'Mission validée — merci pour votre confiance', time: null });
    }

    /* Reverse so latest is first */
    updates = updates.reverse();

    el.innerHTML = '';
    updates.forEach(function (u) {
      var li = document.createElement('li');
      li.className = 'ftp-update-item';
      li.innerHTML =
        '<span class="ftp-update-ico">' + u.ico + '</span>' +
        '<div class="ftp-update-body">' +
          '<p class="ftp-update-text">' + esc(u.text) + '</p>' +
          (u.time ? '<p class="ftp-update-time">' + esc(_timeAgo(u.time)) + '</p>' : '') +
        '</div>';
      el.appendChild(li);
    });
  }

  /* ══════════════════════════════════════════════════════
     RENDER — SECTION 6: CTA
  ══════════════════════════════════════════════════════ */
  function _renderCTA(req, isAuth) {
    var el = document.getElementById('ftp-cta-inner');
    if (!el) return;

    var waMsg = encodeURIComponent(
      'Bonjour Fixeo, j\'ai une question sur ma demande ' +
      (req.ref ? '(' + req.ref + ')' : '') + ' — ' +
      _capitalize(req.service) + ' à ' + req.city
    );
    var waUrl = WA_SUPPORT + '?text=' + waMsg;

    var html = '<div class="ftp-cta-grid">';

    if (isAuth) {
      html +=
        '<a class="ftp-btn ftp-btn-dash" href="dashboard-client.html">📋 Mon espace client</a>';
    }

    html +=
      '<a class="ftp-btn ftp-btn-wa" href="' + waUrl + '" target="_blank" rel="noopener">' +
        '💬 Contacter Fixeo WhatsApp' +
      '</a>';

    if (!isAuth && req.ref && req.ref.startsWith('fxtrk-')) {
      html +=
        '<button class="ftp-btn ftp-btn-save" id="ftp-copy-ref">' +
          '📋 Copier la référence' +
        '</button>' +
        '<p class="ftp-copy-confirm" id="ftp-copy-confirm">Référence copiée ✓</p>';
    }

    html += '</div>';
    el.innerHTML = html;

    /* Copy button handler */
    var copyBtn = document.getElementById('ftp-copy-ref');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        try {
          navigator.clipboard.writeText(req.ref).then(function () {
            var confirm = document.getElementById('ftp-copy-confirm');
            if (confirm) {
              confirm.classList.add('visible');
              setTimeout(function () { confirm.classList.remove('visible'); }, 2000);
            }
          });
        } catch (_) {}
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     AUTH REQUEST SELECTOR (auth mode, multiple requests)
  ══════════════════════════════════════════════════════ */
  function _renderAuthSelector(requests) {
    var el = document.getElementById('ftp-auth-selector');
    if (!el) return;
    show(el);

    var html = '<div class="ftp-section-label"><span class="ftp-section-label-dot"></span>VOS DEMANDES RÉCENTES</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';

    requests.forEach(function (req, i) {
      var badge = STATUS_LABELS[req.status] || { label: req.status, cls: 'ftp-badge-unknown' };
      html +=
        '<button class="ftp-card" style="text-align:left;cursor:pointer;width:100%;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;color:#fff;font-family:inherit;" data-idx="' + i + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<span style="font-weight:800;font-size:.84rem">' + esc(_capitalize(req.service)) + ' — ' + esc(req.city) + '</span>' +
            _renderBadge(req.status) +
          '</div>' +
          '<div style="font-size:.72rem;color:rgba(255,255,255,.4)">' + esc(_formatDate(req.created_at)) + '</div>' +
        '</button>';
    });
    html += '</div>';
    el.innerHTML = html;

    /* Click on a request → display it */
    el.querySelectorAll('button[data-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        _showRequest(requests[idx], true);
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     SHOW REQUEST (renders all 5 sections)
  ══════════════════════════════════════════════════════ */
  function _showRequest(req, isAuth) {
    isAuth = !!isAuth;

    /* Fill search input with the found ref */
    var inp = document.getElementById('ftp-ref-input');
    if (inp && req.ref && req.ref.startsWith('fxtrk-')) inp.value = req.ref;

    /* Show results wrapper */
    hide(document.getElementById('ftp-state-loading'));
    hide(document.getElementById('ftp-state-empty'));
    hide(document.getElementById('ftp-state-error'));
    show(document.getElementById('ftp-results'));

    _renderStatusCard(req);
    _renderTimeline(req.status);
    _renderArtisan(req);
    _renderUpdates(req);
    _renderCTA(req, isAuth);
  }

  /* ══════════════════════════════════════════════════════
     SHOW STATE HELPERS
  ══════════════════════════════════════════════════════ */
  function _showLoading() {
    hide(document.getElementById('ftp-state-empty'));
    hide(document.getElementById('ftp-state-error'));
    hide(document.getElementById('ftp-results'));
    show(document.getElementById('ftp-state-loading'));
  }

  function _showEmpty(ref) {
    hide(document.getElementById('ftp-state-loading'));
    hide(document.getElementById('ftp-state-error'));
    hide(document.getElementById('ftp-results'));
    var el = document.getElementById('ftp-state-empty');
    show(el);
    var msg = document.getElementById('ftp-empty-msg');
    if (msg && ref) {
      msg.textContent = 'Aucune demande trouvée pour la référence "' + ref + '". Vérifiez la saisie ou contactez notre support.';
    }
  }

  function _showError(msg) {
    hide(document.getElementById('ftp-state-loading'));
    hide(document.getElementById('ftp-state-empty'));
    hide(document.getElementById('ftp-results'));
    var el = document.getElementById('ftp-state-error');
    show(el);
    var msgEl = document.getElementById('ftp-error-msg');
    if (msgEl && msg) msgEl.textContent = msg;
  }

  /* ══════════════════════════════════════════════════════
     MAIN SEARCH FLOW
  ══════════════════════════════════════════════════════ */
  async function _search(ref) {
    ref = String(ref || '').toLowerCase().trim();
    if (!ref) return;

    _showLoading();

    /* L1: localStorage */
    var localReq = _findInLocalStorage(ref);
    if (localReq) {
      _showRequest(localReq, false);
      return;
    }

    /* L2: Supabase description search */
    var sbReq = await _findInSupabase(ref);
    if (sbReq) {
      _showRequest(sbReq, false);
      return;
    }

    /* Nothing found */
    _showEmpty(ref);
  }

  /* ══════════════════════════════════════════════════════
     AUTH AUTO-LOAD
  ══════════════════════════════════════════════════════ */
  async function _tryAuthLoad() {
    var requests = await _findAuthRequests();
    if (!requests || !requests.length) return false;

    if (requests.length === 1) {
      _showRequest(requests[0], true);
    } else {
      /* Multiple requests: show selector */
      hide(document.getElementById('ftp-state-loading'));
      hide(document.getElementById('ftp-state-empty'));
      hide(document.getElementById('ftp-state-error'));
      show(document.getElementById('ftp-results'));
      _renderAuthSelector(requests);
    }
    return true;
  }

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', async function () {

    /* Wire up search button + enter key */
    var inp    = document.getElementById('ftp-ref-input');
    var btn    = document.getElementById('ftp-search-btn');

    function _doSearch() {
      var val = (inp && inp.value || '').trim();
      if (!val) return;
      _search(val);
    }

    if (btn) btn.addEventListener('click', _doSearch);
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _doSearch();
    });

    /* Read URL param */
    var urlRef = null;
    try {
      var params = new URLSearchParams(window.location.search);
      urlRef = params.get('ref');
    } catch (_) {}

    if (urlRef) {
      /* URL ref: fill input + auto-search */
      if (inp) inp.value = urlRef;
      _search(urlRef);
    } else {
      /* No URL ref: try auth auto-load, else show idle state */
      _showLoading();
      var authLoaded = await _tryAuthLoad();
      if (!authLoaded) {
        /* Show idle (no loading, no empty — just the search bar) */
        hide(document.getElementById('ftp-state-loading'));
        hide(document.getElementById('ftp-state-empty'));
        hide(document.getElementById('ftp-state-error'));
        hide(document.getElementById('ftp-results'));
      }
    }
  });

  /* ── Public API ── */
  window.FixeoTrackingPage = { VERSION: VERSION, search: _search };

})();
