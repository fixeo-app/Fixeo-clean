/**
 * FIXEO Admin Command Center V3 — Operational Cockpit
 * File: js/admin-command-center-v3.js
 * Version: acc-v3a — 2026-06-11
 * ─────────────────────────────────────────────────────────────
 * ADDITIVE ONLY — zero modifications to acc-v2a / p1 / p3.
 *
 * Adds 5 operational modules + ops summary bar to admin.html:
 *   1. 🚨 Urgences        — urgent unassigned requests, action-first
 *   2. 📥 À Assigner      — new requests, no artisan, dispatch CTA
 *   3. ⏳ En Attente      — assigned SR where artisan hasn't started
 *   4. 🔧 En Cours        — in_progress missions
 *   5. ✅ À Valider       — completed, awaiting client/admin validation
 *   (💰 Commissions already in V2 — ops bar links to it)
 *   + Ops Summary Bar at top of overview section
 *
 * DATA SOURCES (read-only):
 *   window.__fxAccSbCache / FixeoClientRequestsStore — service_requests (from acc-v2a)
 *   window.FixeoSupabase.getClient()                 — missions (own fetch, pending only)
 *
 * REUSED FROM V2:
 *   window.FixeoAccCC.goSection()     — tab navigation
 *   window.__fxAccSbCache             — request data
 *   window.FixeoAccCC.refreshCommissions() — commission tab
 *   V2 normSt / _stKey / buildWA patterns — re-implemented locally (no coupling)
 *
 * GUARD: window.FixeoAccV3 (idempotent)
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoAccV3) return;
  var VERSION = 'acc-v3a';

  /* ═══════════════════════════════════════════════════════════
     TINY UTILITIES (re-implemented — no dependency on V2 internals)
  ══════════════════════════════════════════════════════════ */
  function _el(id)  { return document.getElementById(id); }
  function _esc(s)  { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /* Canonical status key */
  function _stKey(r) {
    var st = _norm(r.status || '');
    if (st === 'new' || st === 'nouvelle' || st === '')            return 'new';
    if (st === 'assigned' || st === 'acceptee' || st === 'acceptée') return 'assigned';
    if (st === 'in_progress' || st === 'en_cours')                 return 'progress';
    if (st === 'completed'   || st === 'terminee' || st === 'terminée') return 'completed';
    if (st === 'validated'   || st === 'validee'  || st === 'validée')  return 'validated';
    if (st === 'cancelled'   || st === 'annulee'  || st === 'annulée')  return 'cancelled';
    return 'new';
  }

  /* Time ago */
  function _ago(iso) {
    try {
      var ms = Date.now() - new Date(iso).getTime();
      if (ms < 60000)    return 'À l\'instant';
      if (ms < 3600000)  return Math.floor(ms / 60000) + 'min';
      if (ms < 86400000) return Math.floor(ms / 3600000) + 'h';
      return Math.floor(ms / 86400000) + 'j';
    } catch(e) { return ''; }
  }

  /* WhatsApp URL */
  function _waUrl(phone, name, msg) {
    var p = String(phone || '').replace(/\s/g, '');
    if (!p) return '';
    if (!p.startsWith('+')) p = p.startsWith('0') ? '+212' + p.slice(1) : '+' + p;
    return 'https://wa.me/' + p.replace('+', '') + '?text=' + encodeURIComponent('Fixeo — ' + (msg || '') + (name ? ' (' + name + ')' : ''));
  }

  /* Short ref */
  function _ref(r) {
    return '#' + String(r.id || '').slice(-6).toUpperCase();
  }

  /* Is urgent */
  var URGENT_CATS = ['serrurerie','plomberie','electricite','electrique','urgence','fuite','panne','debouchage','chauffage','gaz'];
  function _isUrgent(r) {
    if (_norm(r.urgency || '').includes('urgent')) return true;
    var svc = _norm(r.service_category || r.service || r.serviceType || '');
    return URGENT_CATS.some(function(c) { return svc.includes(c); });
  }

  /* Commission amount for a request */
  function _comm(r) {
    if (r.commission_amount && parseFloat(r.commission_amount) > 0) return parseFloat(r.commission_amount);
    var fp = parseFloat(r.final_price || r.agreed_price || r.price || r.servicePrice || 0);
    return fp > 0 ? Math.round(fp * 0.15) : 0;
  }

  function _isPaid(r) {
    return r.commission_paid === true || _norm(r.commission_status || '') === 'payee';
  }

  /* ═══════════════════════════════════════════════════════════
     DATA LAYER
  ══════════════════════════════════════════════════════════ */

  /* Read all service requests (same merge logic as V2) */
  function _readReqs() {
    try {
      if (Array.isArray(window.__fxAccSbCache) && window.__fxAccSbCache.length) {
        var lsRows = [];
        try {
          if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
            lsRows = window.FixeoClientRequestsStore.list();
          } else {
            var raw = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
            lsRows = Array.isArray(raw) ? raw : [];
          }
        } catch(_) {}
        var sbIds = new Set(window.__fxAccSbCache.map(function(r) { return String(r.id || ''); }));
        return window.__fxAccSbCache.concat(lsRows.filter(function(r) { return !sbIds.has(String(r.id || '')); }));
      }
      if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
        return window.FixeoClientRequestsStore.list();
      }
      var raw2 = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
      return Array.isArray(raw2) ? raw2 : [];
    } catch(e) { return []; }
  }

  /* Missions cache (fetched once on init, refreshed every 90s) */
  var _missionsCache = [];
  var _missionsFetchedAt = 0;

  async function _fetchMissions() {
    try {
      var FS = window.FixeoSupabase;
      if (!FS || typeof FS.getClient !== 'function') return [];
      var sb = await FS.getClient();
      var res = await sb.from('missions')
        .select('id,request_id,artisan_profile_id,client_profile_id,status,agreed_price,commission_amount,created_at')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(200);
      if (res.error) { console.warn('[FixeoAccV3] missions fetch error:', res.error.message); return []; }
      return res.data || [];
    } catch(e) {
      console.warn('[FixeoAccV3] missions fetch exception:', e && e.message);
      return [];
    }
  }

  async function _ensureMissions() {
    var now = Date.now();
    if (!_missionsCache.length || (now - _missionsFetchedAt) > 90000) {
      _missionsCache = await _fetchMissions();
      _missionsFetchedAt = now;
    }
    return _missionsCache;
  }

  /* Admin validate service request → status='validated' */
  async function _adminValidate(reqId, btn) {
    if (!reqId) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
    try {
      var FS = window.FixeoSupabase;
      if (!FS) throw new Error('FixeoSupabase not available');
      var sb = await FS.getClient();
      var res = await sb.from('service_requests')
        .update({ status: 'validated' })
        .eq('id', reqId)
        .select('id, status')
        .maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Demande introuvable ou droits insuffisants.');

      /* Optimistic update: patch __fxAccSbCache */
      if (Array.isArray(window.__fxAccSbCache)) {
        window.__fxAccSbCache = window.__fxAccSbCache.map(function(r) {
          return String(r.id) === String(reqId) ? Object.assign({}, r, { status: 'validated' }) : r;
        });
      }

      _toast('✅ Prestation validée.', 'success');
      _refreshAll();
    } catch(e) {
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur validation.'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Valider'; }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════ */
  var _toastTimer = null;
  function _toast(msg, type) {
    var t = _el('fxv3-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'fxv3-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'show';
    if (type === 'success') t.style.borderColor = 'rgba(32,201,151,.4)';
    else if (type === 'error') t.style.borderColor = 'rgba(225,48,108,.4)';
    else t.style.borderColor = '';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2800);
  }

  /* ═══════════════════════════════════════════════════════════
     OPS SUMMARY BAR
     Injected at top of #admin-section-overview
  ══════════════════════════════════════════════════════════ */

  var OPS_TILES = [
    { id: 'urgences',  icon: '🚨', label: 'Urgences',  section: 'v3-urgences',  dotClass: '' },
    { id: 'assigner',  icon: '📥', label: 'À Assigner', section: 'v3-assigner', dotClass: 'amber' },
    { id: 'attente',   icon: '⏳', label: 'En Attente', section: 'v3-attente',  dotClass: 'amber' },
    { id: 'encours',   icon: '🔧', label: 'En Cours',   section: 'v3-encours',  dotClass: '' },
    { id: 'valider',   icon: '✅', label: 'À Valider',  section: 'v3-valider',  dotClass: 'green' },
    { id: 'commissions',icon:'💰', label: 'Commissions',section: 'commissions', dotClass: 'amber' }
  ];

  function _ensureOpsBar() {
    if (_el('fxv3-ops-bar')) return;
    var overview = _el('admin-section-overview');
    if (!overview) return;

    var bar = document.createElement('div');
    bar.id = 'fxv3-ops-bar';
    bar.setAttribute('aria-label', 'Résumé opérationnel');

    bar.innerHTML = OPS_TILES.map(function(t) {
      return '<button class="fxv3-kpi-tile" id="fxv3-kpi-' + _esc(t.id) + '" '
        + 'title="' + _esc(t.label) + '" '
        + 'onclick="window.FixeoAccV3.goOpsSection(\'' + _esc(t.section) + '\')" '
        + 'aria-label="' + _esc(t.label) + '">'
        + '<span class="fxv3-kpi-icon">' + t.icon + '</span>'
        + '<span class="fxv3-kpi-count zero" id="fxv3-kpi-count-' + _esc(t.id) + '">—</span>'
        + '<span class="fxv3-kpi-label">' + _esc(t.label) + '</span>'
        + '</button>';
    }).join('');

    /* Insert as first child of overview section */
    overview.insertBefore(bar, overview.firstChild);
  }

  function _updateOpsBar(counts) {
    OPS_TILES.forEach(function(tile) {
      var count  = counts[tile.id] || 0;
      var countEl = _el('fxv3-kpi-count-' + tile.id);
      var tileEl  = _el('fxv3-kpi-' + tile.id);
      if (!countEl || !tileEl) return;

      countEl.textContent = count;
      countEl.className = 'fxv3-kpi-count' + (count === 0 ? ' zero' : '');

      /* Alert styling */
      tileEl.classList.toggle('has-alert', count > 0);
      if (count > 0) {
        tileEl.classList.remove('amber', 'green');
        if (tile.dotClass) tileEl.classList.add(tile.dotClass);

        /* Add dot if not present */
        if (!tileEl.querySelector('.fxv3-kpi-dot')) {
          var dot = document.createElement('span');
          dot.className = 'fxv3-kpi-dot' + (tile.dotClass ? ' ' + tile.dotClass : '');
          dot.setAttribute('aria-hidden', 'true');
          tileEl.appendChild(dot);
        }
      } else {
        tileEl.classList.remove('has-alert', 'amber', 'green');
        var dot = tileEl.querySelector('.fxv3-kpi-dot');
        if (dot) dot.remove();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     SECTION FACTORY
     Injects a collapsible V3 section into main-content.
  ══════════════════════════════════════════════════════════ */
  function _ensureSection(id, title, subTitle, refreshFn) {
    if (_el('admin-section-' + id)) return;
    var main = _el('main-content');
    if (!main) return;

    var div = document.createElement('div');
    div.id = 'admin-section-' + id;
    div.style.display = 'none';
    div.innerHTML = [
      '<div class="fxv3-section-head">',
        '<span class="fxv3-section-title">' + title + '</span>',
        '<div style="display:flex;align-items:center;gap:8px">',
          '<span class="fxv3-section-count" id="fxv3-count-' + _esc(id) + '">—</span>',
          '<button class="fxv3-refresh-btn" id="fxv3-refresh-' + _esc(id) + '" ',
            'onclick="window.FixeoAccV3.refresh(\'' + _esc(id) + '\')">🔄</button>',
        '</div>',
      '</div>',
      '<div id="fxv3-cards-' + _esc(id) + '"></div>',
    ].join('');

    /* Wire action delegation */
    div.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-v3-act]');
      if (!btn) return;
      _handleAction(btn.dataset.v3Act, btn.dataset, btn);
    });

    /* Append near other ACC sections */
    var inboxSec = _el('admin-section-inbox');
    if (inboxSec && inboxSec.parentNode === main) {
      main.insertBefore(div, inboxSec.nextSibling);
    } else {
      main.appendChild(div);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ACTION HANDLER — all card button actions
  ══════════════════════════════════════════════════════════ */
  function _handleAction(act, data, btn) {
    var reqId   = data.reqId   || data.reqid   || '';
    var phone   = data.phone   || '';
    var name    = data.name    || '';
    var waUrl   = data.waUrl   || data.waurl   || '';

    switch (act) {
      case 'open-dispatch':
        /* Navigate to dispatch section + missions for this request */
        if (typeof window.adminSection === 'function') window.adminSection('missions');
        if (window.FixeoAccCC && typeof window.FixeoAccCC.goSection === 'function') {
          window.FixeoAccCC.goSection('dispatch');
        }
        setTimeout(function() {
          var assignBtn = document.querySelector('.fxams3-act-btn.btn-assign[data-req-id="' + reqId + '"]');
          if (assignBtn) assignBtn.click();
        }, 600);
        break;

      case 'wa-client':
        if (waUrl) window.open(waUrl, '_blank', 'noopener');
        else if (phone) window.open(_waUrl(phone, name, 'Concernant votre demande de service'), '_blank', 'noopener');
        break;

      case 'wa-artisan':
        if (waUrl) window.open(waUrl, '_blank', 'noopener');
        break;

      case 'view-missions':
        if (typeof window.adminSection === 'function') window.adminSection('missions');
        if (window.FixeoAccCC) window.FixeoAccCC.goSection('missions');
        break;

      case 'admin-validate':
        if (reqId) _adminValidate(reqId, btn);
        break;

      case 'mark-collected':
        /* Delegate to V2's markCommissionCollected if available */
        if (window.FixeoAccCC && typeof window.FixeoAccCC.markCollected === 'function') {
          window.FixeoAccCC.markCollected(reqId, btn);
        } else {
          /* Fallback: local optimistic update */
          _localMarkCollected(reqId, btn);
        }
        break;
    }
  }

  function _localMarkCollected(reqId, btn) {
    try {
      var KEY = 'fixeo_commissions_collected';
      var collected = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!collected.includes(reqId)) {
        collected.push(reqId);
        localStorage.setItem(KEY, JSON.stringify(collected));
      }
      if (btn) {
        btn.disabled = true;
        btn.className = 'fxv3-act fxv3-act-collected';
        btn.textContent = '✓ Perçue';
      }
      _toast('💰 Commission marquée perçue.', 'success');
    } catch(e) {}
  }

  function _isCollected(reqId) {
    try {
      var KEY = 'fixeo_commissions_collected';
      var collected = JSON.parse(localStorage.getItem(KEY) || '[]');
      return collected.includes(String(reqId));
    } catch(e) { return false; }
  }

  /* ═══════════════════════════════════════════════════════════
     CARD BUILDERS
  ══════════════════════════════════════════════════════════ */

  function _cardMeta(r) {
    var isUrg = _isUrgent(r);
    return '<div class="fxv3-card-meta">'
      + '<span class="fxv3-card-ref">' + _ref(r) + '</span>'
      + (isUrg ? '<span class="fxv3-card-urgent-badge">🚨 Urgent</span>' : '')
      + '<span class="fxv3-card-ago">' + _ago(r.created_at) + '</span>'
      + '</div>';
  }

  function _cardBody(r) {
    var svc  = _esc(r.service_category || r.service || r.serviceType || '—');
    var city = _esc(r.city || r.location || '');
    var desc = _esc(r.description || r.problem || r.serviceDescription || '');
    return '<div class="fxv3-card-svc">' + svc + '</div>'
      + (city ? '<div class="fxv3-card-city">📍 ' + city + '</div>' : '')
      + (desc ? '<div class="fxv3-card-desc">' + desc + '</div>' : '');
  }

  function _artisanChip(r) {
    var a = _esc(r.assigned_artisan || r.artisanName || '');
    if (!a || a === '—') return '';
    return '<div class="fxv3-card-artisan">👨‍🔧 ' + a + '</div>';
  }

  /* Build WA data attrs for client */
  function _waClientData(r) {
    var phone = r.phone || r.clientPhone || r.contact_phone || '';
    var name  = r.client_name || r.name || r.fullName || 'client';
    var url   = _waUrl(phone, name, 'Concernant votre demande de service');
    return url ? ' data-v3-act="wa-client" data-wa-url="' + _esc(url) + '" data-phone="' + _esc(phone) + '" data-name="' + _esc(name) + '"' : '';
  }

  function _waArtisanData(r) {
    var phone = r.artisan_phone || r.assigned_artisan_phone || '';
    var name  = r.assigned_artisan || r.artisanName || 'l\'artisan';
    var url   = _waUrl(phone, name, 'Concernant votre mission sur Fixeo');
    return url ? ' data-v3-act="wa-artisan" data-wa-url="' + _esc(url) + '"' : '';
  }

  /* ═══════════════════════════════════════════════════════════
     1. URGENCES SECTION
  ══════════════════════════════════════════════════════════ */

  function _renderUrgences() {
    var cards = _el('fxv3-cards-v3-urgences');
    var cnt   = _el('fxv3-count-v3-urgences');
    if (!cards) return 0;

    cards.innerHTML = '<div class="fxv3-loading"><span class="fxv3-loading-dot"></span><span class="fxv3-loading-dot"></span><span class="fxv3-loading-dot"></span></div>';

    var reqs = _readReqs().filter(function(r) {
      var k = _stKey(r);
      return _isUrgent(r) && k !== 'validated' && k !== 'cancelled';
    }).sort(function(a, b) {
      /* Unassigned first, then newest */
      var ak = _stKey(a) === 'new' ? 0 : 1;
      var bk = _stKey(b) === 'new' ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    if (cnt) cnt.textContent = reqs.length;

    if (!reqs.length) {
      cards.innerHTML = '<div class="fxv3-empty"><div class="fxv3-empty-icon">🟢</div><div class="fxv3-empty-title">Aucune urgence</div><div class="fxv3-empty-sub">Toutes les urgences sont traitées.</div></div>';
      return 0;
    }

    var html = '';
    reqs.forEach(function(r) {
      var stKey      = _stKey(r);
      var clientData = _waClientData(r);
      var reqId      = _esc(String(r.id || ''));
      html += '<div class="fxv3-op-card urgent">'
        + _cardMeta(r)
        + _cardBody(r)
        + (stKey !== 'new' ? _artisanChip(r) : '')
        + '<div class="fxv3-card-actions">'
        + (stKey === 'new'
           ? '<button class="fxv3-act fxv3-act-dispatch" data-v3-act="open-dispatch" data-req-id="' + reqId + '">⚡ Assigner</button>'
           : '<button class="fxv3-act fxv3-act-reassign" data-v3-act="view-missions" data-req-id="' + reqId + '">🔄 Missions</button>')
        + (clientData
           ? '<button class="fxv3-act fxv3-act-wa"' + clientData + '>📱 Client</button>'
           : '')
        + '</div>'
        + '</div>';
    });
    cards.innerHTML = html;
    return reqs.length;
  }

  /* ═══════════════════════════════════════════════════════════
     2. À ASSIGNER SECTION
  ══════════════════════════════════════════════════════════ */

  function _renderAssigner() {
    var cards = _el('fxv3-cards-v3-assigner');
    var cnt   = _el('fxv3-count-v3-assigner');
    if (!cards) return 0;

    var reqs = _readReqs().filter(function(r) {
      return _stKey(r) === 'new';
    }).sort(function(a, b) {
      /* Urgent first, then newest */
      var au = _isUrgent(a) ? 0 : 1, bu = _isUrgent(b) ? 0 : 1;
      if (au !== bu) return au - bu;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    if (cnt) cnt.textContent = reqs.length;

    if (!reqs.length) {
      cards.innerHTML = '<div class="fxv3-empty"><div class="fxv3-empty-icon">📭</div><div class="fxv3-empty-title">Aucune demande à assigner</div><div class="fxv3-empty-sub">Toutes les demandes ont un artisan assigné.</div></div>';
      return 0;
    }

    var html = '';
    reqs.forEach(function(r) {
      var clientData = _waClientData(r);
      var reqId      = _esc(String(r.id || ''));
      html += '<div class="fxv3-op-card' + (_isUrgent(r) ? ' urgent' : '') + '">'
        + _cardMeta(r)
        + _cardBody(r)
        + '<div class="fxv3-card-actions">'
        + '<button class="fxv3-act fxv3-act-dispatch" data-v3-act="open-dispatch" data-req-id="' + reqId + '">🔍 Dispatch</button>'
        + (clientData
           ? '<button class="fxv3-act fxv3-act-wa"' + clientData + '>📱 Client</button>'
           : '')
        + '</div>'
        + '</div>';
    });
    cards.innerHTML = html;
    return reqs.length;
  }

  /* ═══════════════════════════════════════════════════════════
     3. EN ATTENTE ARTISAN SECTION
     SR.status = 'assigned' → artisan assigned but intervention not started
  ══════════════════════════════════════════════════════════ */

  function _renderAttente() {
    var cards = _el('fxv3-cards-v3-attente');
    var cnt   = _el('fxv3-count-v3-attente');
    if (!cards) return 0;

    var reqs = _readReqs().filter(function(r) {
      return _stKey(r) === 'assigned';
    }).sort(function(a, b) {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0); /* oldest first = most waiting */
    });

    if (cnt) cnt.textContent = reqs.length;

    if (!reqs.length) {
      cards.innerHTML = '<div class="fxv3-empty"><div class="fxv3-empty-icon">⏳</div><div class="fxv3-empty-title">Aucune attente artisan</div><div class="fxv3-empty-sub">Tous les artisans ont confirmé.</div></div>';
      return 0;
    }

    var html = '';
    reqs.forEach(function(r) {
      var clientData  = _waClientData(r);
      var artisanData = _waArtisanData(r);
      var reqId       = _esc(String(r.id || ''));
      html += '<div class="fxv3-op-card waiting">'
        + _cardMeta(r)
        + _cardBody(r)
        + _artisanChip(r)
        + '<div class="fxv3-card-actions">'
        + (artisanData
           ? '<button class="fxv3-act fxv3-act-wa"' + artisanData + '>👨‍🔧 Artisan</button>'
           : '<button class="fxv3-act fxv3-act-dispatch" data-v3-act="view-missions" data-req-id="' + reqId + '">🔧 Missions</button>')
        + '<button class="fxv3-act fxv3-act-reassign" data-v3-act="open-dispatch" data-req-id="' + reqId + '">🔄 Réassigner</button>'
        + (clientData
           ? '<button class="fxv3-act fxv3-act-wa"' + clientData + '>📱 Client</button>'
           : '')
        + '</div>'
        + '</div>';
    });
    cards.innerHTML = html;
    return reqs.length;
  }

  /* ═══════════════════════════════════════════════════════════
     4. EN COURS SECTION
  ══════════════════════════════════════════════════════════ */

  function _renderEnCours() {
    var cards = _el('fxv3-cards-v3-encours');
    var cnt   = _el('fxv3-count-v3-encours');
    if (!cards) return 0;

    var reqs = _readReqs().filter(function(r) {
      return _stKey(r) === 'progress';
    }).sort(function(a, b) {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });

    if (cnt) cnt.textContent = reqs.length;

    if (!reqs.length) {
      cards.innerHTML = '<div class="fxv3-empty"><div class="fxv3-empty-icon">🟢</div><div class="fxv3-empty-title">Aucune intervention en cours</div><div class="fxv3-empty-sub">Aucune mission active pour le moment.</div></div>';
      return 0;
    }

    var html = '';
    reqs.forEach(function(r) {
      var clientData  = _waClientData(r);
      var artisanData = _waArtisanData(r);
      var reqId       = _esc(String(r.id || ''));
      html += '<div class="fxv3-op-card active">'
        + _cardMeta(r)
        + _cardBody(r)
        + _artisanChip(r)
        + '<div class="fxv3-card-actions">'
        + (artisanData
           ? '<button class="fxv3-act fxv3-act-wa"' + artisanData + '>👨‍🔧 Artisan</button>'
           : '')
        + (clientData
           ? '<button class="fxv3-act fxv3-act-wa"' + clientData + '>📱 Client</button>'
           : '')
        + '<button class="fxv3-act fxv3-act-validate" data-v3-act="admin-validate" data-req-id="' + reqId + '">✅ Forcer validé</button>'
        + '</div>'
        + '</div>';
    });
    cards.innerHTML = html;
    return reqs.length;
  }

  /* ═══════════════════════════════════════════════════════════
     5. À VALIDER SECTION
     SR.status = 'completed' → artisan done, awaiting client/admin validation
  ══════════════════════════════════════════════════════════ */

  function _renderValider() {
    var cards = _el('fxv3-cards-v3-valider');
    var cnt   = _el('fxv3-count-v3-valider');
    if (!cards) return 0;

    var reqs = _readReqs().filter(function(r) {
      return _stKey(r) === 'completed';
    }).sort(function(a, b) {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });

    if (cnt) cnt.textContent = reqs.length;

    if (!reqs.length) {
      cards.innerHTML = '<div class="fxv3-empty"><div class="fxv3-empty-icon">✅</div><div class="fxv3-empty-title">Aucune validation en attente</div><div class="fxv3-empty-sub">Tout est validé.</div></div>';
      return 0;
    }

    var html = '';
    reqs.forEach(function(r) {
      var clientData = _waClientData(r);
      var reqId      = _esc(String(r.id || ''));
      var fp         = parseFloat(r.final_price || r.agreed_price || r.price || 0);
      html += '<div class="fxv3-op-card done">'
        + _cardMeta(r)
        + _cardBody(r)
        + _artisanChip(r)
        + (fp > 0 ? '<div class="fxv3-card-amount">' + fp.toLocaleString('fr-FR') + ' MAD</div>' : '')
        + '<div class="fxv3-card-actions">'
        + '<button class="fxv3-act fxv3-act-validate" data-v3-act="admin-validate" data-req-id="' + reqId + '">✅ Valider</button>'
        + (clientData
           ? '<button class="fxv3-act fxv3-act-wa"' + clientData + '>📱 Relancer client</button>'
           : '')
        + '</div>'
        + '</div>';
    });
    cards.innerHTML = html;
    return reqs.length;
  }

  /* ═══════════════════════════════════════════════════════════
     6. COMMISSIONS V3 VIEW
     Re-uses V2 commission data; shows only pending (not collected)
  ══════════════════════════════════════════════════════════ */

  function _countCommissions() {
    var reqs = _readReqs().filter(function(r) {
      var k = _stKey(r);
      return (k === 'completed' || k === 'validated')
        && !_isPaid(r)
        && !_isCollected(String(r.id || ''));
    });
    return reqs.length;
  }

  /* ═══════════════════════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════════════════════ */

  function _goOpsSection(sectionId) {
    /* Sections defined in V2 acc (commissions, emergency, etc.) */
    var v2Sections = ['inbox', 'emergency', 'missions', 'dispatch', 'commissions'];
    if (v2Sections.includes(sectionId)) {
      if (window.FixeoAccCC && typeof window.FixeoAccCC.goSection === 'function') {
        window.FixeoAccCC.goSection(sectionId);
      }
      return;
    }

    /* V3 own sections */
    var v3Id = 'admin-section-' + sectionId;
    var secEl = _el(v3Id);
    if (!secEl) return;

    /* Hide all other sections */
    document.querySelectorAll('[id^="admin-section-"]').forEach(function(el) {
      el.style.display = 'none';
    });
    secEl.style.display = 'block';
    secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    /* Trigger render for the activated section */
    var renderMap = {
      'v3-urgences': _renderUrgences,
      'v3-assigner': _renderAssigner,
      'v3-attente':  _renderAttente,
      'v3-encours':  _renderEnCours,
      'v3-valider':  _renderValider
    };
    if (renderMap[sectionId]) renderMap[sectionId]();
  }

  /* ═══════════════════════════════════════════════════════════
     REFRESH ALL + OPS BAR UPDATE
  ══════════════════════════════════════════════════════════ */

  function _refreshAll() {
    var counts = {
      urgences:    0,
      assigner:    0,
      attente:     0,
      encours:     0,
      valider:     0,
      commissions: 0
    };

    var reqs = _readReqs();

    reqs.forEach(function(r) {
      var k = _stKey(r);
      if ((k !== 'validated' && k !== 'cancelled') && _isUrgent(r)) counts.urgences++;
      if (k === 'new')       counts.assigner++;
      if (k === 'assigned')  counts.attente++;
      if (k === 'progress')  counts.encours++;
      if (k === 'completed') counts.valider++;
    });
    counts.commissions = _countCommissions();

    _updateOpsBar(counts);

    /* Re-render whichever V3 section is currently visible */
    ['v3-urgences','v3-assigner','v3-attente','v3-encours','v3-valider'].forEach(function(id) {
      var sec = _el('admin-section-' + id);
      if (sec && sec.style.display !== 'none') {
        _goOpsSection(id);
      }
    });

    /* Mirror to V2 emergency badge (same data) */
    if (window.FixeoAccCC && typeof window.FixeoAccCC.syncBadges === 'function') {
      window.FixeoAccCC.syncBadges();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     REFRESH (manual, per section)
  ══════════════════════════════════════════════════════════ */

  function _refresh(sectionId) {
    var btn = _el('fxv3-refresh-' + sectionId);
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    _goOpsSection(sectionId);
    _refreshAll();
    if (btn) setTimeout(function() { btn.disabled = false; btn.textContent = '🔄'; }, 500);
  }

  /* ═══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function _init() {
    /* Ensure all 5 V3 sections exist in DOM */
    _ensureSection('v3-urgences', '🚨 Urgences',             'Demandes urgentes à traiter en priorité');
    _ensureSection('v3-assigner', '📥 À Assigner',           'Nouvelles demandes sans artisan');
    _ensureSection('v3-attente',  '⏳ En Attente Artisan',   'Artisan assigné mais pas encore démarré');
    _ensureSection('v3-encours',  '🔧 Interventions En Cours','Missions actuellement en cours');
    _ensureSection('v3-valider',  '✅ À Valider',             'Interventions terminées en attente de validation');

    /* Ensure ops summary bar */
    _ensureOpsBar();

    /* Initial data load */
    _refreshAll();

    /* Auto-refresh every 60s */
    setInterval(_refreshAll, 60000);

    /* React to request updates from admin engine */
    ['fixeo:client-request-updated', 'fixeo:state:updated', 'fixeo:admin:refresh'].forEach(function(ev) {
      window.addEventListener(ev, function() { setTimeout(_refreshAll, 150); });
    });

    console.log('[FixeoAccV3] ' + VERSION + ' ready — 5 operational modules loaded');
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.FixeoAccV3 = {
    VERSION:        VERSION,
    refresh:        _refresh,
    refreshAll:     _refreshAll,
    goOpsSection:   _goOpsSection
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
