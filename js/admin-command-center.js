/**
 * FIXEO ADMIN COMMAND CENTER — acc-v1a
 * ======================================
 * Mobile-first operational layer for the admin dashboard.
 *
 * ADDS (append-only, no existing code modified):
 *   1. Mobile bottom tab navigation (5 tabs)
 *   2. Sidebar auto-close on mobile when section switches
 *   3. Inbox section — actionable request cards (#admin-section-inbox)
 *   4. Commission Tracker section (#admin-section-commissions)
 *   5. Quick Contact bottom sheet
 *   6. Floating Action Button (refresh on mobile)
 *   7. Badge auto-sync on all tabs
 *
 * READS (non-destructive):
 *   window.__fxAccSbCache          — Supabase service_requests
 *   window.FixeoClientRequestsStore — localStorage requests
 *   window.FixeoDB.getAllArtisans()  — artisan pool (for dispatch link)
 *
 * DEPENDS ON:
 *   admin-control-center-p1.js     — readRequests() / __fxAccSbCache
 *   admin-mission-supervision-p3.js — adminSection(), fxams3 cards
 *   fixeo-dispatch-engine.js        — FixeoDispatch
 *   admin.js                        — adminSection() (second definition)
 *
 * DOES NOT TOUCH:
 *   Auth, RLS, Supabase schema, reservation core, commission engine,
 *   existing adminSection(), mission lifecycle, any V1/V2 dashboard files
 * ─────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window._fxAccCcLoaded) return; // idempotent
  window._fxAccCcLoaded = true;

  var VERSION = 'acc-v2a';

  /* ── Helpers ──────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function normSt(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      .replace(/é/g,'e').replace(/è/g,'e').replace(/ê/g,'e')
      .replace(/à/g,'a').replace(/â/g,'a')
      .replace(/î/g,'i').replace(/ô/g,'o').replace(/û/g,'u');
  }
  function timeAgo(iso) {
    try {
      var ms = Date.now() - new Date(iso).getTime();
      if (ms < 60000)    return 'À l\'instant';
      if (ms < 3600000)  return Math.floor(ms/60000) + 'min';
      if (ms < 86400000) return Math.floor(ms/3600000) + 'h';
      return Math.floor(ms/86400000) + 'j';
    } catch(e) { return ''; }
  }
  function buildWA(phone, name, msg) {
    var p = String(phone||'').replace(/\s/g,'');
    if (!p) return '';
    if (!p.startsWith('+')) p = p.startsWith('0') ? '+212' + p.slice(1) : '+' + p;
    return 'https://wa.me/' + p.replace('+','') + '?text=' + encodeURIComponent('Fixeo — ' + msg + (name?' ('+name+')':''));
  }
  function isMobile() { return window.innerWidth <= 768; }

  /* ── Read requests from all sources (same as p3 engine) ──── */
  function _readReqs() {
    try {
      /* Source A: admin-control-center-p1.js (exposed as cached merged set) */
      if (Array.isArray(window.__fxAccSbCache) && window.__fxAccSbCache.length) {
        /* Also merge localStorage rows */
        var lsRows = [];
        try {
          if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
            lsRows = window.FixeoClientRequestsStore.list();
          } else {
            var raw = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
            lsRows = Array.isArray(raw) ? raw : [];
          }
        } catch(_) {}
        var sbIds = new Set(window.__fxAccSbCache.map(function(r){ return String(r.id||''); }));
        var lsOnly = lsRows.filter(function(r){ return !sbIds.has(String(r.id||'')); });
        return window.__fxAccSbCache.concat(lsOnly);
      }
      /* Source B: localStorage only */
      if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
        return window.FixeoClientRequestsStore.list();
      }
      var raw2 = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
      return Array.isArray(raw2) ? raw2 : [];
    } catch(e) { return []; }
  }

  /* ── Map status → canonical key ─────────────────────────── */
  function _stKey(r) {
    var st = normSt(r.status || '');
    if (st === 'new' || st === 'nouvelle' || st === '') return 'new';
    if (st === 'assigned' || st === 'acceptee' || st === 'acceptée') return 'assigned';
    if (st === 'in_progress' || st === 'en_cours') return 'progress';
    if (st === 'completed' || st === 'terminee' || st === 'terminée') return 'completed';
    if (st === 'validated' || st === 'validee' || st === 'validée') return 'validated';
    if (st === 'cancelled' || st === 'annulee' || st === 'annulée') return 'cancelled';
    return 'new'; // default unrecognised → treat as new
  }

  /* ── Status display config ───────────────────────────────── */
  var ST_CONFIG = {
    'new':       { label: 'Nouvelle',    css: 'fxacc-status-new',       dot: '●', cardCls: 'unassigned' },
    'assigned':  { label: 'Assignée',    css: 'fxacc-status-assigned',   dot: '●', cardCls: 'assigned'   },
    'progress':  { label: 'En cours',    css: 'fxacc-status-progress',   dot: '●', cardCls: 'in-progress'},
    'completed': { label: 'Terminée',    css: 'fxacc-status-completed',  dot: '●', cardCls: 'completed'  },
    'validated': { label: 'Validée',     css: 'fxacc-status-validated',  dot: '✓', cardCls: 'validated'  },
    'cancelled': { label: 'Annulée',     css: 'fxacc-status-cancelled',  dot: '●', cardCls: 'cancelled'  }
  };

  /* ════════════════════════════════════════════════════════════
     1. INBOX SECTION — HTML + data
     ════════════════════════════════════════════════════════════ */

  var _inboxFilter = 'all';
  var _inboxSearch = '';

  function _ensureInboxSection() {
    if (el('admin-section-inbox')) return;
    var main = el('main-content');
    if (!main) return;
    var div = document.createElement('div');
    div.id = 'admin-section-inbox';
    div.style.display = 'none';
    div.innerHTML = [
      '<div class="fxacc-section-head">',
        '<div>',
          '<h2 class="fxacc-section-title">📥 Boîte de réception</h2>',
          '<p class="fxacc-section-sub">Toutes les demandes clients — triées par urgence</p>',
        '</div>',
        '<button class="fxacc-btn-refresh" onclick="window.FixeoAccCC.refreshInbox()">',
          '🔄 Actualiser',
        '</button>',
      '</div>',

      /* P7: Inline search */
      '<div class="fxacc-search-bar">',
        '<span class="fxacc-search-icon">🔍</span>',
        '<input class="fxacc-search-input" id="fxacc-inbox-search" type="text" placeholder="Rechercher client, ville, service…" autocomplete="off" autocorrect="off">',
        '<button class="fxacc-search-clear" id="fxacc-inbox-search-clear" aria-label="Effacer">✕</button>',
      '</div>',

      '<div class="fxacc-filters" id="fxacc-inbox-filters">',
        '<button class="fxacc-filter-pill active" data-filter="all">',
          'Tout <span class="fxacc-pill-count" id="fxacc-fc-all">0</span>',
        '</button>',
        '<button class="fxacc-filter-pill" data-filter="new">',
          '🔴 À assigner <span class="fxacc-pill-count" id="fxacc-fc-new">0</span>',
        '</button>',
        '<button class="fxacc-filter-pill" data-filter="assigned">',
          '🔵 Assignées <span class="fxacc-pill-count" id="fxacc-fc-assigned">0</span>',
        '</button>',
        '<button class="fxacc-filter-pill" data-filter="progress">',
          '🟢 En cours <span class="fxacc-pill-count" id="fxacc-fc-progress">0</span>',
        '</button>',
        '<button class="fxacc-filter-pill" data-filter="completed">',
          '🟣 Terminées <span class="fxacc-pill-count" id="fxacc-fc-completed">0</span>',
        '</button>',
      '</div>',

      '<div class="fxacc-cards" id="fxacc-inbox-cards"></div>',
    ].join('');

    /* Insert before first section */
    var firstSection = main.querySelector('[id^="admin-section-"]');
    if (firstSection) main.insertBefore(div, firstSection);
    else main.appendChild(div);

    /* Filter pill delegation */
    div.querySelector('#fxacc-inbox-filters').addEventListener('click', function(e) {
      var pill = e.target.closest('.fxacc-filter-pill');
      if (!pill) return;
      div.querySelectorAll('.fxacc-filter-pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      _inboxFilter = pill.dataset.filter || 'all';
      _renderInboxCards();
    });

    /* P7: Search input */
    var searchInput = div.querySelector('#fxacc-inbox-search');
    var searchClear = div.querySelector('#fxacc-inbox-search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        _inboxSearch = this.value.toLowerCase().trim();
        if (searchClear) searchClear.classList.toggle('show', _inboxSearch.length > 0);
        _renderInboxCards();
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', function() {
        if (searchInput) { searchInput.value = ''; }
        _inboxSearch = '';
        searchClear.classList.remove('show');
        _renderInboxCards();
      });
    }

    /* Card action delegation */
    div.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-acc-act]');
      if (!btn) return;
      var act = btn.dataset.accAct;
      var reqId = btn.dataset.reqId || '';
      var phone = btn.dataset.phone || '';
      var name  = btn.dataset.name  || '';
      var waUrl = btn.dataset.waUrl || '';

      if (act === 'assign') {
        /* Delegate to mission supervision engine */
        if (typeof window.adminSection === 'function') adminSection('missions');
        setTimeout(function() {
          /* Try to open the assign picker for this request in p3 engine */
          var assignBtn = document.querySelector('.fxams3-act-btn.btn-assign[data-req-id="' + reqId + '"]');
          if (assignBtn) assignBtn.click();
        }, 600);
        return;
      }
      if (act === 'wa') {
        if (waUrl) window.open(waUrl, '_blank', 'noopener');
        return;
      }
      if (act === 'contact-sheet') {
        _openContactSheet(name, phone, reqId);
        return;
      }
      if (act === 'missions') {
        if (typeof window.adminSection === 'function') adminSection('missions');
        _setActiveTab('missions');
        return;
      }
    });
  }

  function _renderInboxCards() {
    var container = el('fxacc-inbox-cards');
    if (!container) return;

    var reqs = _readReqs();

    /* Sort: urgent first, then by created_at desc */
    reqs = reqs.slice().sort(function(a, b) {
      var aUrg = String(a.urgency||'').toLowerCase().includes('urgent') ? 1 : 0;
      var bUrg = String(b.urgency||'').toLowerCase().includes('urgent') ? 1 : 0;
      if (bUrg !== aUrg) return bUrg - aUrg;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    /* Counts */
    var counts = { all: 0, new: 0, assigned: 0, progress: 0, completed: 0, validated: 0, cancelled: 0 };
    reqs.forEach(function(r) {
      var k = _stKey(r);
      counts[k] = (counts[k] || 0) + 1;
      counts.all++;
    });

    /* Update pill counts */
    ['all','new','assigned','progress','completed'].forEach(function(k) {
      var el2 = el('fxacc-fc-' + k);
      if (el2) el2.textContent = counts[k] || 0;
    });

    /* Filter by tab */
    var filtered = _inboxFilter === 'all' ? reqs : reqs.filter(function(r) { return _stKey(r) === _inboxFilter; });

    /* Filter by search */
    if (_inboxSearch) {
      var q = _inboxSearch;
      filtered = filtered.filter(function(r) {
        return [
          r.service_category, r.service, r.serviceType,
          r.city, r.location,
          r.client_name, r.name, r.fullName,
          r.phone, r.clientPhone,
          r.assigned_artisan, r.artisanName,
          r.description,
          String(r.id||'').slice(-6)
        ].some(function(v){ return v && String(v).toLowerCase().includes(q); });
      });
    }

    /* Non-terminal requests for tab badge (new + assigned + progress) */
    var actionable = counts.new + counts.assigned + counts.progress;
    _setBadge('inbox', actionable > 0 ? actionable : null);

    if (filtered.length === 0) {
      container.innerHTML = [
        '<div class="fxacc-empty">',
          '<div class="fxacc-empty-icon">📭</div>',
          '<div class="fxacc-empty-title">Aucune demande</div>',
          '<div class="fxacc-empty-sub">',
            _inboxFilter === 'all'
              ? 'Aucune demande client reçue pour le moment.'
              : 'Aucune demande dans cette catégorie.',
          '</div>',
        '</div>'
      ].join('');
      return;
    }

    var html = '';
    filtered.forEach(function(r) {
      html += _renderInboxCard(r);
    });
    container.innerHTML = html;
    container.classList.add('fxacc-section-fade');
  }

  function _renderInboxCard(r, forceEmergency) {
    var stKey  = _stKey(r);
    var stConf = ST_CONFIG[stKey] || ST_CONFIG['new'];
    var isUrg  = String(r.urgency||'').toLowerCase().includes('urgent');
    var refId  = String(r.id||'').slice(-6).toUpperCase();
    var svc    = esc(r.service_category || r.service || r.serviceType || '—');
    var city   = esc(r.city || r.location || '');
    var desc   = esc(r.description || r.notes || '');
    var phone  = String(r.phone || r.clientPhone || r.client_phone || '').trim();
    var clientName = esc(r.client_name || r.name || r.fullName || '');
    var artisan    = esc(r.assigned_artisan || r.artisanName || '');
    var waUrl  = phone ? buildWA(phone, clientName || 'le client', 'Votre demande #' + refId + ' sur Fixeo.') : '';
    var ago    = timeAgo(r.created_at);

    var urgBadge = isUrg
      ? '<span class="fxacc-urgency-badge">⚡ Urgent</span>'
      : '';

    var statusBadge = '<span class="fxacc-status ' + stConf.css + '">'
      + stConf.dot + ' ' + stConf.label
      + '</span>';

    /* Action buttons */
    var actions = '';
    if (stKey === 'new') {
      actions += '<button class="fxacc-act fxacc-act-assign" data-acc-act="assign" data-req-id="' + esc(String(r.id||'')) + '">'
        + '👤 Assigner artisan'
        + '</button>';
    }
    if (phone) {
      if (isMobile()) {
        /* On mobile: show contact sheet with WA + Call options */
        actions += '<button class="fxacc-act fxacc-act-wa" data-acc-act="contact-sheet"'
          + ' data-name="' + esc(clientName || 'Client') + '"'
          + ' data-phone="' + esc(phone) + '"'
          + ' data-req-id="' + esc(String(r.id||'')) + '">'
          + '📞 Contacter'
          + '</button>';
      } else {
        /* Desktop: direct WA link */
        if (waUrl) {
          actions += '<a class="fxacc-act fxacc-act-wa" href="' + esc(waUrl) + '" target="_blank" rel="noopener">'
            + '💬 WhatsApp'
            + '</a>';
        }
      }
    }
    if (stKey !== 'validated' && stKey !== 'cancelled') {
      actions += '<button class="fxacc-act fxacc-act-view" data-acc-act="missions">'
        + '🔍 Voir missions'
        + '</button>';
    }

    var isEmg = forceEmergency || _isEmergency(r);
    return [
      '<div class="fxacc-card ' + stConf.cardCls + (isUrg ? ' urgent' : '') + (isEmg && forceEmergency ? ' emergency' : '') + '">',
        '<div class="fxacc-card-top">',
          '<div class="fxacc-card-left">',
            '<div class="fxacc-card-ref">#' + refId + ' · ' + ago + (urgBadge ? ' &nbsp;' + urgBadge : '') + '</div>',
            '<div class="fxacc-card-service">' + svc + '</div>',
            city ? '<div class="fxacc-card-city">📍 ' + city + '</div>' : '',
          '</div>',
          '<div>' + statusBadge + '</div>',
        '</div>',

        '<div class="fxacc-card-meta">',
          clientName ? '<span class="fxacc-card-meta-item">👤 <strong>' + clientName + '</strong></span>' : '',
          artisan    ? '<span class="fxacc-card-meta-item">🔧 <strong>' + artisan + '</strong></span>'    : '',
          phone      ? '<span class="fxacc-card-meta-item">📱 <strong>' + esc(phone) + '</strong></span>' : '',
        '</div>',

        desc ? '<div class="fxacc-card-desc">' + desc + '</div>' : '',

        actions ? '<div class="fxacc-card-actions">' + actions + '</div>' : '',
      '</div>',
    ].join('');
  }

  function refreshInbox() {
    _renderInboxCards();
  }

  /* ════════════════════════════════════════════════════════════
     2. COMMISSION TRACKER SECTION
     ════════════════════════════════════════════════════════════ */

  function _ensureCommissionsSection() {
    if (el('admin-section-commissions')) return;
    var main = el('main-content');
    if (!main) return;
    var div = document.createElement('div');
    div.id = 'admin-section-commissions';
    div.style.display = 'none';
    div.innerHTML = [
      '<div class="fxacc-section-head">',
        '<div>',
          '<h2 class="fxacc-section-title">💰 Suivi commissions</h2>',
          '<p class="fxacc-section-sub">Missions terminées — commissions à percevoir</p>',
        '</div>',
        '<button class="fxacc-btn-refresh" onclick="window.FixeoAccCC.refreshCommissions()">',
          '🔄 Actualiser',
        '</button>',
      '</div>',
      '<div class="fxacc-comm-summary" id="fxacc-comm-summary"></div>',
      '<div class="fxacc-cards" id="fxacc-comm-cards"></div>',
    ].join('');
    /* P6: mark-collected delegation */
    div.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-acc-act="mark-collected"]');
      if (!btn) return;
      var reqId = btn.dataset.reqId || '';
      if (!reqId) return;
      btn.disabled = true;
      btn.textContent = '…';
      _markCommissionCollected(reqId, btn);
    });

    main.appendChild(div);
  }

  /* P6: Mark commission as collected — localStorage update (Supabase write-back is a future step) */
  function _markCommissionCollected(reqId, btn) {
    try {
      var STORAGE_KEY = 'fixeo_client_requests';
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      var found = false;
      if (Array.isArray(raw)) {
        raw = raw.map(function(r) {
          if (String(r.id||'') === String(reqId)) {
            found = true;
            return Object.assign({}, r, { commission_paid: true, commission_status: 'payée' });
          }
          return r;
        });
        if (found) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
        }
      }
      /* Visual feedback */
      var card = document.getElementById('fxacc-comm-' + reqId);
      if (card) {
        card.classList.remove('pending-comm');
        card.classList.add('paid-comm');
        if (btn) {
          btn.className = 'fxacc-act fxacc-act-collected';
          btn.disabled = true;
          btn.textContent = '✓ Perçue';
        }
        var statusEl = card.querySelector('.fxacc-comm-status-pending');
        if (statusEl) {
          statusEl.className = 'fxacc-comm-status-paid';
          statusEl.textContent = '✓ Perçue';
        }
      }
      _syncBadges();
    } catch(e) {
      console.warn('[FixeoAccCC] markCommissionCollected error:', e && e.message);
      if (btn) { btn.disabled = false; btn.textContent = '💰 Marquer perçue'; }
    }
  }

  function _renderCommissions() {
    var summary  = el('fxacc-comm-summary');
    var cards    = el('fxacc-comm-cards');
    if (!summary || !cards) return;

    var reqs = _readReqs();
    /* Only terminal/commission-relevant statuses */
    var relevant = reqs.filter(function(r) {
      var k = _stKey(r);
      return k === 'completed' || k === 'validated';
    }).sort(function(a,b) {
      return new Date(b.created_at||0) - new Date(a.created_at||0);
    });

    /* Totals */
    var totalCommission = 0;
    var paidCount = 0;
    var pendingCount = 0;

    relevant.forEach(function(r) {
      var fp = parseFloat(r.final_price || r.price || r.servicePrice || 0);
      var comm = r.commission_amount ? parseFloat(r.commission_amount) : Math.round(fp * 0.15);
      totalCommission += comm;
      var isPaid = r.commission_paid === true || String(r.commission_status||'').trim() === 'payée';
      if (isPaid) paidCount++;
      else pendingCount++;
    });

    /* Summary strip */
    summary.innerHTML = [
      '<div class="fxacc-comm-kpi">',
        '<div class="fxacc-comm-kpi-value">' + relevant.length + '</div>',
        '<div class="fxacc-comm-kpi-label">Missions</div>',
      '</div>',
      '<div class="fxacc-comm-kpi" style="border-color:rgba(252,167,53,0.25)">',
        '<div class="fxacc-comm-kpi-value" style="color:var(--acc-amber)">' + totalCommission.toLocaleString('fr-FR') + ' MAD</div>',
        '<div class="fxacc-comm-kpi-label">Total commissions</div>',
      '</div>',
      '<div class="fxacc-comm-kpi" style="border-color:rgba(225,48,108,0.25)">',
        '<div class="fxacc-comm-kpi-value" style="color:var(--acc-pink)">' + pendingCount + '</div>',
        '<div class="fxacc-comm-kpi-label">À percevoir</div>',
      '</div>',
      '<div class="fxacc-comm-kpi" style="border-color:rgba(32,201,151,0.25)">',
        '<div class="fxacc-comm-kpi-value" style="color:var(--acc-green)">' + paidCount + '</div>',
        '<div class="fxacc-comm-kpi-label">Perçues</div>',
      '</div>',
    ].join('');

    /* Update commission tab badge — pending count */
    _setBadge('commissions', pendingCount > 0 ? pendingCount : null);

    if (relevant.length === 0) {
      cards.innerHTML = [
        '<div class="fxacc-empty">',
          '<div class="fxacc-empty-icon">💰</div>',
          '<div class="fxacc-empty-title">Aucune commission</div>',
          '<div class="fxacc-empty-sub">Les missions terminées et validées apparaîtront ici.</div>',
        '</div>'
      ].join('');
      return;
    }

    var html = '';
    relevant.forEach(function(r) {
      var fp      = parseFloat(r.final_price || r.price || r.servicePrice || 0);
      var comm    = r.commission_amount ? parseFloat(r.commission_amount) : Math.round(fp * 0.15);
      var isPaid  = r.commission_paid === true || String(r.commission_status||'').trim() === 'payée';
      var refId   = String(r.id||'').slice(-6).toUpperCase();
      var svc     = esc(r.service_category || r.service || '—');
      var artisan = esc(r.assigned_artisan || r.artisanName || '—');
      var city    = esc(r.city || '');
      var ago     = timeAgo(r.created_at);

      /* P6: collect button */
      var collectBtn = isPaid
        ? '<button class="fxacc-act fxacc-act-collected" disabled>✓ Perçue</button>'
        : '<button class="fxacc-act fxacc-act-collect" data-acc-act="mark-collected" data-req-id="' + esc(String(r.id||'')) + '">💰 Marquer perçue</button>';

      html += [
        '<div class="fxacc-comm-card ' + (isPaid ? 'paid-comm' : 'pending-comm') + '" id="fxacc-comm-' + esc(String(r.id||'')) + '">',
          '<div class="fxacc-comm-left">',
            '<div class="fxacc-comm-ref">#' + refId + ' · ' + ago + '</div>',
            '<div class="fxacc-comm-service">' + svc + (city ? ' — ' + city : '') + '</div>',
            '<div class="fxacc-comm-artisan">🔧 ' + artisan + '</div>',
            '<div style="margin-top:8px">' + collectBtn + '</div>',
          '</div>',
          '<div class="fxacc-comm-right">',
            '<div class="fxacc-comm-amount">' + comm.toLocaleString('fr-FR') + ' MAD</div>',
            '<div class="fxacc-comm-status-' + (isPaid ? 'paid">✓ Perçue' : 'pending">⏳ À percevoir') + '</div>',
          '</div>',
        '</div>',
      ].join('');
    });
    cards.innerHTML = html;
  }

  function refreshCommissions() {
    _renderCommissions();
  }

  /* ════════════════════════════════════════════════════════════
     P5. EMERGENCY QUEUE SECTION
     ════════════════════════════════════════════════════════════ */

  /* Emergency service categories */
  var EMERGENCY_CATS = ['serrurerie','plomberie','electricite','électricité','urgence','fuite','panne','debouchage','débouchage','chauffage'];

  function _isEmergency(r) {
    if (String(r.urgency||'').toLowerCase().includes('urgent')) return true;
    var svc = String(r.service_category||r.service||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return EMERGENCY_CATS.some(function(cat) { return svc.includes(cat); });
  }

  function _ensureEmergencySection() {
    if (el('admin-section-emergency')) return;
    var main = el('main-content');
    if (!main) return;
    var div = document.createElement('div');
    div.id = 'admin-section-emergency';
    div.style.display = 'none';
    div.innerHTML = [
      '<div class="fxacc-emergency-header">',
        '<div class="fxacc-emergency-pulse"></div>',
        '<span class="fxacc-emergency-title">🚨 File d\'urgence</span>',
        '<span class="fxacc-emergency-count" id="fxacc-emg-count">0 demande(s)</span>',
        '<button class="fxacc-btn-refresh" style="margin-left:auto;padding:6px 10px;font-size:.75rem" onclick="window.FixeoAccCC.refreshEmergency()">🔄</button>',
      '</div>',
      '<div class="fxacc-section-head" style="margin-bottom:12px">',
        '<div>',
          '<h2 class="fxacc-section-title">Demandes urgentes</h2>',
          '<p class="fxacc-section-sub">Serrurerie · Plomberie · Électricité · Urgences</p>',
        '</div>',
      '</div>',
      '<div class="fxacc-cards" id="fxacc-emg-cards"></div>',
    ].join('');
    /* Insert after inbox section */
    var inboxSec = el('admin-section-inbox');
    if (inboxSec && inboxSec.nextSibling) main.insertBefore(div, inboxSec.nextSibling);
    else main.appendChild(div);

    /* Same card action delegation as inbox */
    div.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-acc-act]');
      if (!btn) return;
      var act = btn.dataset.accAct;
      var reqId = btn.dataset.reqId || '';
      var phone = btn.dataset.phone || '';
      var name  = btn.dataset.name  || '';
      if (act === 'assign') {
        if (typeof window.adminSection === 'function') adminSection('missions');
        setTimeout(function() {
          var assignBtn = document.querySelector('.fxams3-act-btn.btn-assign[data-req-id="' + reqId + '"]');
          if (assignBtn) assignBtn.click();
        }, 600);
        return;
      }
      if (act === 'contact-sheet') { _openContactSheet(name, phone, reqId); return; }
      if (act === 'wa') { window.open(btn.dataset.waUrl, '_blank', 'noopener'); return; }
    });
  }

  function _renderEmergencyCards() {
    var countEl   = el('fxacc-emg-count');
    var container = el('fxacc-emg-cards');
    if (!container) return;

    var reqs = _readReqs().filter(function(r) {
      var k = _stKey(r);
      return _isEmergency(r) && k !== 'validated' && k !== 'cancelled';
    }).sort(function(a,b) {
      /* Sort: new first, then by created_at desc */
      var ak = _stKey(a) === 'new' ? 0 : 1;
      var bk = _stKey(b) === 'new' ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return new Date(b.created_at||0) - new Date(a.created_at||0);
    });

    if (countEl) countEl.textContent = reqs.length + ' demande' + (reqs.length !== 1 ? 's' : '');
    _setBadge('emergency', reqs.length > 0 ? reqs.length : null);

    if (reqs.length === 0) {
      container.innerHTML = [
        '<div class="fxacc-empty">',
          '<div class="fxacc-empty-icon">✅</div>',
          '<div class="fxacc-empty-title">Aucune urgence en cours</div>',
          '<div class="fxacc-empty-sub">La file d\'urgence est vide.</div>',
        '</div>'
      ].join('');
      return;
    }
    container.innerHTML = reqs.map(function(r) {
      /* Reuse inbox card but force emergency class */
      return _renderInboxCard(r, true);
    }).join('');
  }

  function refreshEmergency() { _renderEmergencyCards(); }

  /* ════════════════════════════════════════════════════════════
     P4. DISPATCH CARD ENHANCEMENT
     Adds last activity, acceptance hint, trust visual to
     existing dispatch engine artisan cards via MutationObserver.
     Non-invasive: only adds content after dispatch renders.
     ════════════════════════════════════════════════════════════ */
  function _enhanceDispatchCards() {
    /* Observe #admin-section-dispatch for DOM changes */
    var dispatchSection = null;
    var observerAttached = false;

    function _doEnhance() {
      var cards = document.querySelectorAll('.fxdisp-artisan-card:not([data-acc-enhanced])');
      cards.forEach(function(card) {
        card.setAttribute('data-acc-enhanced', '1');
        /* Get artisan name from card text — first bold div */
        var nameEl = card.querySelector('div[style*="font-weight:700"]');
        var cardName = nameEl ? nameEl.textContent.trim() : '';
        if (!cardName) return;

        /* Look up artisan in pool */
        var artisans = [];
        try {
          if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
            artisans = window.FixeoDB.getAllArtisans() || [];
          }
        } catch(e) {}
        var artisan = artisans.find(function(a) {
          return a.name && a.name.toLowerCase() === cardName.toLowerCase();
        });
        if (!artisan) return;

        /* Compute activity recency */
        var daysSince = 999;
        try {
          var d = new Date(artisan.updated_at || artisan.created_at);
          daysSince = (Date.now() - d.getTime()) / 86400000;
        } catch(e) {}
        var dotCls = daysSince <= 1 ? 'recent' : daysSince <= 14 ? 'moderate' : 'inactive';
        var actLabel = daysSince <= 1 ? 'Actif aujourd\'hui'
                     : daysSince <= 7  ? 'Actif il y a ' + Math.round(daysSince) + 'j'
                     : daysSince <= 30  ? 'Actif il y a ' + Math.round(daysSince) + 'j'
                     : 'Inactif ' + Math.round(daysSince) + 'j';

        /* Build extra info strip */
        var reviewCount = Number(artisan.reviewCount || artisan.review_count || 0);
        var extraHtml = [
          '<div style="font-size:.72rem;color:rgba(255,255,255,.4);display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.06);margin-top:6px;padding-top:6px">',
            '<span><span class="fxacc-activity-dot ' + dotCls + '"></span>' + actLabel + '</span>',
            reviewCount > 0 ? '<span>📝 ' + reviewCount + ' avis</span>' : '',
            artisan.phone || artisan.phone_public ? '<span>📱 Contactable</span>' : '',
            artisan.onboarding_completed ? '<span>✓ Profil complet</span>' : '',
          '</div>',
        ].join('');

        /* Inject before the assign button */
        var assignBtn = card.querySelector('.fxdisp-assign-btn');
        if (assignBtn) {
          var extra = document.createElement('div');
          extra.innerHTML = extraHtml;
          card.insertBefore(extra.firstChild, assignBtn);
        }
      });
    }

    function _attachObserver() {
      if (observerAttached) return;
      dispatchSection = el('admin-section-dispatch');
      if (!dispatchSection) return;
      observerAttached = true;
      var obs = new MutationObserver(function() { _doEnhance(); });
      obs.observe(dispatchSection, { childList: true, subtree: true });
      /* Also run immediately in case content already exists */
      _doEnhance();
    }

    /* Attach observer when dispatch section is first shown */
    document.addEventListener('click', function(e) {
      var link = e.target.closest('[onclick*="dispatch"], .fxacc-tab[id="fxacc-tab-dispatch"]');
      if (link) setTimeout(_attachObserver, 300);
    });
    /* Also try after a delay in case dispatch renders on load */
    setTimeout(_attachObserver, 2000);
  }

  /* ════════════════════════════════════════════════════════════
     P2. ADMIN OPS HAMBURGER MENU
     Replaces public .mobile-nav links with admin operations links
     Injected once; hides public nav links on admin page.
     ════════════════════════════════════════════════════════════ */

  var OPS_LINKS = [
    { icon: '📥', label: 'Boîte de réception', section: 'inbox',       badge: 'inbox'       },
    { icon: '🚨', label: 'File d\'urgence',     section: 'emergency',  badge: 'emergency'   },
    { icon: '🔧', label: 'Missions actives',    section: 'missions',   badge: 'missions'    },
    { icon: '🤖', label: 'Dispatch IA',          section: 'dispatch',  badge: 'dispatch'    },
    { icon: '💰', label: 'Commissions',          section: 'commissions',badge: 'commissions' },
    null, /* divider */
    { icon: '📊', label: 'Vue d\'ensemble',     section: 'overview',   badge: null          },
    { icon: '👷', label: 'Artisans',             section: 'artisans',  badge: null          },
    { icon: '👥', label: 'Clients',              section: 'clients',   badge: null          },
    { icon: '📅', label: 'Réservations',         section: 'reservations',badge: null        },
    null, /* divider */
    { icon: '⚙️', label: 'Paramètres',          section: 'settings',  badge: null          },
    { icon: '🚪', label: 'Déconnexion',          section: 'logout',    badge: null          },
  ];

  function _ensureAdminOpsMenu() {
    if (el('fxacc-ops-menu')) return;
    var mobileNav = document.querySelector('.mobile-nav');
    if (!mobileNav) return;

    /* Hide public nav links — they're irrelevant for admin */
    mobileNav.querySelectorAll('a[href="index.html"], a[href="index.html#services"], a[href="index.html#artisans-section"], a[href="pricing.html"]').forEach(function(a) {
      a.style.display = 'none';
    });

    /* Build ops menu */
    var opsDiv = document.createElement('div');
    opsDiv.id = 'fxacc-ops-menu';
    opsDiv.className = 'fxacc-ops-menu visible';

    var html = '';
    OPS_LINKS.forEach(function(link) {
      if (!link) {
        html += '<div class="fxacc-ops-divider"></div>';
        return;
      }
      html += '<button class="fxacc-ops-link" data-ops-section="' + esc(link.section) + '">'
        + '<span class="fxacc-ops-link-icon">' + link.icon + '</span>'
        + esc(link.label)
        + (link.badge ? '<span class="fxacc-ops-badge" id="fxacc-ops-badge-' + esc(link.badge) + '"></span>' : '')
        + '</button>';
    });
    opsDiv.innerHTML = html;

    /* Insert at top of mobile nav */
    mobileNav.insertBefore(opsDiv, mobileNav.firstChild);

    /* Click delegation */
    opsDiv.addEventListener('click', function(e) {
      var btn = e.target.closest('.fxacc-ops-link');
      if (!btn) return;
      var section = btn.dataset.opsSection || '';
      /* Close hamburger */
      var hamburgers = document.querySelectorAll('.hamburger');
      var mNav = document.querySelector('.mobile-nav');
      hamburgers.forEach(function(h) { h.setAttribute('aria-expanded','false'); h.classList.remove('active'); });
      if (mNav) mNav.classList.remove('open');
      document.body.classList.remove('mobile-menu-open');

      if (section === 'logout') {
        if (typeof window.fixeoLogout === 'function') window.fixeoLogout();
        return;
      }
      setTimeout(function() { _navToSection(section, section); }, 80);
    });
  }

  function _syncOpsBadges() {
    /* Mirror bottom-nav badges to ops menu badges */
    ['inbox','emergency','missions','dispatch','commissions'].forEach(function(id) {
      var bottomBadge = el('fxacc-badge-' + id);
      var opsBadge    = el('fxacc-ops-badge-' + id);
      if (!bottomBadge || !opsBadge) return;
      opsBadge.textContent = bottomBadge.textContent;
      opsBadge.classList.toggle('show', bottomBadge.classList.contains('visible'));
    });
  }

  /* ════════════════════════════════════════════════════════════
     3. BOTTOM TAB NAVIGATION
     ════════════════════════════════════════════════════════════ */

  var _activeTab = 'inbox';

  /* Tab config: id → { label, icon, section } */
  var TABS = [
    { id: 'inbox',       icon: '📥', label: 'Inbox',      section: 'inbox'       },
    { id: 'emergency',   icon: '🚨', label: 'Urgences',   section: 'emergency'   },
    { id: 'missions',    icon: '🔧', label: 'Missions',   section: 'missions'    },
    { id: 'commissions', icon: '💰', label: 'Commissions',section: 'commissions' },
    { id: 'more',        icon: '☰',  label: 'Plus',       section: null          }
  ];

  function _ensureBottomNav() {
    if (el('fxacc-bottom-nav')) return;
    var nav = document.createElement('div');
    nav.id = 'fxacc-bottom-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navigation admin');

    var html = '';
    TABS.forEach(function(tab) {
      html += '<button class="fxacc-tab" id="fxacc-tab-' + tab.id + '" aria-label="' + tab.label + '">'
        + '<span class="fxacc-tab-icon">'
          + tab.icon
          + '<span class="fxacc-tab-badge" id="fxacc-badge-' + tab.id + '"></span>'
        + '</span>'
        + '<span class="fxacc-tab-label">' + tab.label + '</span>'
        + '</button>';
    });
    nav.innerHTML = html;
    document.body.appendChild(nav);

    /* Click delegation */
    nav.addEventListener('click', function(e) {
      var btn = e.target.closest('.fxacc-tab');
      if (!btn) return;
      var tabId = btn.id.replace('fxacc-tab-','');
      if (tabId === 'more') {
        _openMoreSheet();
        return;
      }
      var tab = TABS.find(function(t){ return t.id === tabId; });
      if (tab && tab.section) {
        _navToSection(tab.section, tabId);
      }
    });
  }

  function _setActiveTab(tabId) {
    _activeTab = tabId;
    document.querySelectorAll('.fxacc-tab').forEach(function(btn) {
      btn.classList.remove('active');
    });
    var active = el('fxacc-tab-' + tabId);
    if (active) active.classList.add('active');
  }

  function _setBadge(tabId, count) {
    var badge = el('fxacc-badge-' + tabId);
    if (!badge) return;
    if (count && count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  function _navToSection(section, tabId) {
    /* Close sidebar on mobile */
    var sidebar = el('admin-sidebar');
    if (sidebar && isMobile()) {
      sidebar.classList.remove('open');
    }

    /* Switch section via existing adminSection() */
    if (typeof window.adminSection === 'function') {
      window.adminSection(section);
    } else {
      /* Fallback: direct show/hide */
      document.querySelectorAll('[id^="admin-section-"]').forEach(function(s) {
        s.style.display = 'none';
      });
      var target = el('admin-section-' + section);
      if (target) target.style.display = 'block';
    }

    /* Refresh section-specific data */
    if (section === 'inbox')       { _ensureInboxSection(); _renderInboxCards(); }
    if (section === 'commissions') { _ensureCommissionsSection(); _renderCommissions(); }

    /* Update sidebar active link to match */
    document.querySelectorAll('.sidebar-link').forEach(function(l) { l.classList.remove('active'); });
    document.querySelectorAll('.sidebar-link').forEach(function(l) {
      var oc = (l.getAttribute('onclick') || '');
      if (oc.includes("'" + section + "'") || oc.includes('"' + section + '"')) {
        l.classList.add('active');
      }
    });

    _setActiveTab(tabId || section);

    /* Smooth scroll to top of main content */
    var main = el('main-content');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });

    /* Fade animation */
    var sectionEl = el('admin-section-' + section);
    if (sectionEl) {
      sectionEl.classList.remove('fxacc-section-fade');
      void sectionEl.offsetWidth; // reflow
      sectionEl.classList.add('fxacc-section-fade');
    }
  }

  /* ════════════════════════════════════════════════════════════
     4. SIDEBAR AUTO-CLOSE on mobile when any section switches
     We patch the global adminSection() calls (existing function
     calls sidebar-link active class already — we add mobile close)
     ════════════════════════════════════════════════════════════ */
  function _patchAdminSectionForMobileClose() {
    /* Hook: intercept clicks on all .sidebar-link elements */
    document.addEventListener('click', function(e) {
      if (!isMobile()) return;
      var link = e.target.closest('.sidebar-link');
      if (!link) return;
      var sidebar = el('admin-sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        setTimeout(function() { sidebar.classList.remove('open'); }, 120);
      }
    });

    /* Also close sidebar when hamburger opens mobile-nav (not admin sidebar) */
    document.addEventListener('click', function(e) {
      if (!isMobile()) return;
      /* If clicking outside sidebar while open, close it */
      var sidebar = el('admin-sidebar');
      if (!sidebar || !sidebar.classList.contains('open')) return;
      if (!sidebar.contains(e.target) && !e.target.closest('.hamburger')) {
        sidebar.classList.remove('open');
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     5. QUICK CONTACT BOTTOM SHEET
     ════════════════════════════════════════════════════════════ */

  var _contactSheetData = null;

  function _ensureContactSheet() {
    if (el('fxacc-contact-sheet')) return;
    var sheet = document.createElement('div');
    sheet.id = 'fxacc-contact-sheet';
    sheet.innerHTML = [
      '<div id="fxacc-contact-overlay"></div>',
      '<div id="fxacc-contact-body">',
        '<div class="fxacc-sheet-handle"></div>',
        '<div class="fxacc-sheet-title" id="fxacc-sheet-title">Contacter</div>',
        '<div class="fxacc-sheet-sub" id="fxacc-sheet-sub"></div>',
        '<div class="fxacc-contact-btns" id="fxacc-contact-btns"></div>',
      '</div>',
    ].join('');
    document.body.appendChild(sheet);

    el('fxacc-contact-overlay').addEventListener('click', _closeContactSheet);
  }

  function _openContactSheet(name, phone, reqId) {
    _ensureContactSheet();
    _contactSheetData = { name: name, phone: phone, reqId: reqId };

    var displayName = name || 'Contact';
    el('fxacc-sheet-title').textContent = 'Contacter ' + displayName;
    el('fxacc-sheet-sub').textContent = phone ? phone : 'Aucun numéro disponible';

    var waUrl = phone ? buildWA(phone, name, 'Votre demande #' + String(reqId||'').slice(-6).toUpperCase() + ' sur Fixeo.') : '';
    var callUrl = phone ? 'tel:' + phone.replace(/\s/g,'') : '';

    var btnsHtml = '';
    if (waUrl) {
      btnsHtml += [
        '<a class="fxacc-contact-btn" href="' + esc(waUrl) + '" target="_blank" rel="noopener">',
          '<span class="fxacc-contact-btn-icon">💬</span>',
          '<div>',
            '<div>Message WhatsApp</div>',
            '<div class="fxacc-contact-btn-desc">Ouvrir la conversation WhatsApp</div>',
          '</div>',
        '</a>',
      ].join('');
    }
    if (callUrl && isMobile()) {
      btnsHtml += [
        '<a class="fxacc-contact-btn" href="' + esc(callUrl) + '">',
          '<span class="fxacc-contact-btn-icon">📞</span>',
          '<div>',
            '<div>Appeler ' + esc(displayName) + '</div>',
            '<div class="fxacc-contact-btn-desc">' + esc(phone) + '</div>',
          '</div>',
        '</a>',
      ].join('');
    }
    if (!btnsHtml) {
      btnsHtml = '<div class="fxacc-empty-sub" style="padding:20px 0">Aucune option de contact disponible pour cette demande.</div>';
    }
    el('fxacc-contact-btns').innerHTML = btnsHtml;

    el('fxacc-contact-sheet').classList.add('open');
  }

  function _closeContactSheet() {
    var sheet = el('fxacc-contact-sheet');
    if (sheet) sheet.classList.remove('open');
  }

  /* ════════════════════════════════════════════════════════════
     6. "MORE" BOTTOM SHEET — additional sections
     ════════════════════════════════════════════════════════════ */

  function _openMoreSheet() {
    _ensureContactSheet(); // reuse sheet structure
    el('fxacc-sheet-title').textContent = '☰ Plus de sections';
    el('fxacc-sheet-sub').textContent = 'Navigation vers les sections administratives';

    var MORE_LINKS = [
      { icon: '📊', label: 'Vue d\'ensemble',   sub: 'Tableau de bord principal',  section: 'overview'       },
      { icon: '📅', label: 'Réservations',       sub: 'Toutes les réservations',    section: 'reservations'   },
      { icon: '👷', label: 'Artisans',            sub: 'Gestion des artisans',       section: 'artisans'       },
      { icon: '👥', label: 'Clients',             sub: 'Liste des clients',          section: 'clients'        },
      { icon: '📝', label: 'Inscriptions',        sub: 'Nouvelles inscriptions',     section: 'registrations'  },
      { icon: '💵', label: 'Missions & COD',      sub: 'Cash on Delivery',           section: 'cod-orders'     },
      { icon: '⚙️', label: 'Paramètres',          sub: 'Configuration plateforme',   section: 'settings'       },
    ];

    var html = '';
    MORE_LINKS.forEach(function(link) {
      html += [
        '<button class="fxacc-contact-btn" onclick="window.FixeoAccCC.goSection(\'' + link.section + '\'); window.FixeoAccCC.closeMoreSheet();">',
          '<span class="fxacc-contact-btn-icon">' + link.icon + '</span>',
          '<div>',
            '<div>' + esc(link.label) + '</div>',
            '<div class="fxacc-contact-btn-desc">' + esc(link.sub) + '</div>',
          '</div>',
        '</button>',
      ].join('');
    });
    el('fxacc-contact-btns').innerHTML = html;
    el('fxacc-contact-sheet').classList.add('open');
  }

  function closeMoreSheet() { _closeContactSheet(); }

  function goSection(section) {
    _navToSection(section, 'more');
    _setActiveTab('more');
  }

  /* ════════════════════════════════════════════════════════════
     7. FLOATING ACTION BUTTON
     ════════════════════════════════════════════════════════════ */

  function _ensureFAB() {
    if (el('fxacc-fab')) return;
    var fab = document.createElement('button');
    fab.id = 'fxacc-fab';
    fab.setAttribute('aria-label', 'Actualiser');
    fab.title = 'Actualiser les données';
    fab.innerHTML = '🔄';
    fab.addEventListener('click', function() {
      fab.innerHTML = '<span class="fxacc-spinner"></span>';
      /* Trigger refresh on whichever engine is active */
      if (typeof window.refreshAdminData === 'function') {
        try { window.refreshAdminData(); } catch(e){}
      }
      if (_activeTab === 'inbox')       refreshInbox();
      if (_activeTab === 'commissions') refreshCommissions();
      if (_activeTab === 'missions' && typeof window._fxAms3Refresh === 'function') {
        try { window._fxAms3Refresh(); } catch(e){}
      }
      if (_activeTab === 'dispatch' && window.FixeoDispatch && typeof window.FixeoDispatch.refresh === 'function') {
        try { window.FixeoDispatch.refresh(); } catch(e){}
      }
      setTimeout(function() { fab.innerHTML = '🔄'; }, 1200);
    });
    document.body.appendChild(fab);
  }

  /* ════════════════════════════════════════════════════════════
     8. BADGE AUTO-SYNC
     ════════════════════════════════════════════════════════════ */

  function _syncBadges() {
    var reqs = _readReqs();
    var newCount = reqs.filter(function(r) { return _stKey(r) === 'new'; }).length;
    var actCount = reqs.filter(function(r) {
      var k = _stKey(r); return k === 'new' || k === 'assigned' || k === 'progress';
    }).length;
    var doneCount = reqs.filter(function(r) { return _stKey(r) === 'completed'; }).length;

    _setBadge('inbox', actCount > 0 ? actCount : null);
    _setBadge('missions', doneCount > 0 ? doneCount : null);

    /* Emergency badge: urgent + emergency-category requests that need action */
    var emergencyCount = reqs.filter(function(r) {
      var k = _stKey(r);
      return _isEmergency(r) && k !== 'validated' && k !== 'cancelled';
    }).length;
    _setBadge('emergency', emergencyCount > 0 ? emergencyCount : null);

    /* Commission badge: count missions needing commission collection */
    var commPending = reqs.filter(function(r) {
      var k = _stKey(r);
      return (k === 'completed' || k === 'validated')
        && r.commission_paid !== true
        && String(r.commission_status||'').trim() !== 'payée';
    }).length;
    _setBadge('commissions', commPending > 0 ? commPending : null);

    /* Dispatch badge: unassigned requests */
    _setBadge('dispatch', newCount > 0 ? newCount : null);

    /* Sync sidebar counts too */
    var scReservations = el('sc-reservations');
    if (scReservations) {
      var pending = reqs.filter(function(r){ return _stKey(r) === 'new'; }).length;
      scReservations.textContent = pending;
      scReservations.style.display = pending > 0 ? '' : 'none';
    }
  }

  /* ════════════════════════════════════════════════════════════
     9. INIT
     ════════════════════════════════════════════════════════════ */

  function _init() {
    _ensureInboxSection();
    _ensureEmergencySection();
    _ensureCommissionsSection();
    _ensureBottomNav();
    _ensureFAB();
    _patchAdminSectionForMobileClose();
    _ensureAdminOpsMenu();
    _enhanceDispatchCards();

    /* Initial data render */
    setTimeout(function() {
      _syncBadges();
      _syncOpsBadges();
      /* P1: Mobile default landing = Inbox */
      if (isMobile()) {
        _navToSection('inbox', 'inbox');
      }
    }, 1000); /* Wait for adminSection(overview) from admin.js to complete first */

    /* Re-sync badges when requests update */
    function _onUpdate() {
      _syncBadges();
      _syncOpsBadges();
      /* Re-render visible sections */
      var inboxSection = el('admin-section-inbox');
      if (inboxSection && inboxSection.style.display !== 'none') _renderInboxCards();
      var emergSection = el('admin-section-emergency');
      if (emergSection && emergSection.style.display !== 'none') _renderEmergencyCards();
      var commSection  = el('admin-section-commissions');
      if (commSection  && commSection.style.display  !== 'none') _renderCommissions();
    }
    window.addEventListener('fixeo:admin:refresh',           _onUpdate);
    window.addEventListener('fixeo:client-request-updated', _onUpdate);
    window.addEventListener('fixeo:data:changed', function() { _syncBadges(); _syncOpsBadges(); });

    /* Periodic badge refresh every 60s */
    setInterval(function() { _syncBadges(); _syncOpsBadges(); }, 60000);

    console.log('[FixeoAccCC] Admin Command Center ' + VERSION + ' ready');
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.FixeoAccCC = {
    VERSION:            VERSION,
    refreshInbox:       refreshInbox,
    refreshCommissions: refreshCommissions,
    refreshEmergency:   refreshEmergency,
    goSection:          goSection,
    closeMoreSheet:     closeMoreSheet,
    syncBadges:         _syncBadges
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
