/* ============================================================
   FIXEO ADMIN — ARTISAN MODERATION PHASE 2
   js/admin-artisan-moderation-p2.js

   OBJECTIVE: Additive moderation layer for the artisan queue.
   admin-artisans.js is the SOLE artisan renderer — this file
   never re-renders the artisan table independently.

   STRATEGY: Post-render enhancement pass on #artisans-admin-tbody
   triggered after each renderArtisansAdminTable() call via
   function wrap (same pattern as commission P1B).

   What this file adds:
   1. Moderation status model (derives moderation_status from
      existing fields, persists via FixeoDB.updateArtisan when needed)
   2. Moderation KPI strip (#fxamp2-mod-kpis) — real counts
   3. Filter pill bar (#fxamp2-filter-bar) — replaces old status dropdown
   4. Per-row enhancement pass:
      a. moderation_status badge
      b. Profile completeness bar
      c. Moderation action buttons
         - Validate (→ active + validated_at)
         - Mark pending review (→ pending_validation)
         - Approve claim (→ claimed_approved + active)
         - Suspend / Hide / Restore
         - WhatsApp CTA (only if valid Moroccan phone)
      d. data-label for mobile card transform
   5. Artisan dashboard visibility bridge (dispatches event)
   6. Event sync on all relevant events + storage

   Guard: window._fxAmp2Loaded (idempotent)
   Never: re-renders table, touches Supabase, creates fake artisans,
          deletes profiles, modifies claim-system.js or fixeo-db.js
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAmp2Loaded) return;
  window._fxAmp2Loaded = true;

  /* ── Admin page only ─────────────────────────────────────── */
  function _isAdminPage() {
    return document.body && document.body.dataset.dashType === 'admin';
  }
  if (!_isAdminPage()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        if (_isAdminPage()) init();
      });
    }
    return;
  }

  /* ── Constants ───────────────────────────────────────────── */
  var MODERATION_KEY     = 'fixeo_artisan_moderation';   /* own lightweight patch store */
  var DB_KEY             = 'fixeo_artisans_db';          /* FixeoDB primary store */
  var LEGACY_KEY         = 'fixeo_admin_artisans_v21';   /* fallback for admin-artisans.js */
  var CLAIMS_KEY         = 'fixeo_claim_requests';

  /* Column labels matching renderArtisansAdminTable thead (10 cols) */
  var COL_LABELS = ['Artisan', 'Sp\u00e9cialit\u00e9', 'T\u00e9l\u00e9phone', 'Ville', 'Plan', 'Note', 'Missions', 'Statut', 'Certifi\u00e9', ''];

  /* Moderation statuses */
  var STATUS_LABELS = {
    'pending_validation' : { label: 'En v\u00e9rification', badge: 'badge-pending',        icon: '\u23f3' },
    'active'             : { label: 'Profil actif',          badge: 'badge-active',          icon: '\u2713' },
    'incomplete'         : { label: 'Incomplet',             badge: 'badge-incomplete',      icon: '\u26a0' },
    'claimed_pending'    : { label: 'Revendication',         badge: 'badge-claimed-pending', icon: '\u29d7' },
    'claimed_approved'   : { label: 'Revendiqu\u00e9',       badge: 'badge-claimed-approved',icon: '\u2713' },
    'suspended'          : { label: 'Suspendu',              badge: 'badge-suspended',       icon: '\u26d4' },
    'hidden'             : { label: 'Masqu\u00e9',           badge: 'badge-hidden',          icon: '\u25cf' }
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  function el(id)       { return document.getElementById(id); }
  function esc(s)       { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function nowISO()     { return new Date().toISOString(); }
  function formatDate(s){ try { return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); } catch(e){ return ''; } }

  function buildWALink(phone, name) {
    var digits = String(phone||'').replace(/\D/g,'');
    if (digits.length < 9) return '';
    if (digits.charAt(0) === '0') digits = '212' + digits.slice(1);
    else if (!digits.startsWith('212')) digits = '212' + digits;
    var msg = encodeURIComponent('Bonjour ' + (name||'') + ', c\u2019est l\u2019\u00e9quipe Fixeo. Nous souhaitons vous contacter au sujet de votre profil.');
    return 'https://wa.me/' + digits + '?text=' + msg;
  }

  /* ── Read artisans ───────────────────────────────────────── */
  function readArtisans() {
    if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
      return window.FixeoDB.getAllArtisans();
    }
    try {
      var db = JSON.parse(localStorage.getItem(DB_KEY)||'[]');
      if (Array.isArray(db) && db.length) return db;
      return JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');
    } catch(e) { return []; }
  }

  /* Build id → artisan lookup */
  function buildArtisanLookup() {
    var map = {};
    readArtisans().forEach(function(a) {
      if (a.id) map[String(a.id)] = a;
    });
    return map;
  }

  function readClaims() {
    try { return JSON.parse(localStorage.getItem(CLAIMS_KEY)||'[]'); } catch(e){ return []; }
  }

  /* ── Moderation patch store ──────────────────────────────── */
  /* Light secondary store: id → { moderation_status, validated_at, validated_by, ... }
     Falls back to FixeoDB when available. */
  function readModPatches() {
    try { return JSON.parse(localStorage.getItem(MODERATION_KEY)||'{}'); } catch(e){ return {}; }
  }
  function writeModPatches(obj) {
    try { localStorage.setItem(MODERATION_KEY, JSON.stringify(obj)); } catch(e){}
  }

  /* ── Derive moderation status from existing artisan fields ── */
  function deriveModerationStatus(a) {
    /* If already persisted, use it */
    var patches = readModPatches();
    var patch = patches[String(a.id)];
    if (patch && patch.moderation_status) return patch.moderation_status;

    /* Derive from existing fields */
    if (a.moderation_status) return a.moderation_status;

    /* Suspended / hidden from legacy toggle */
    if (a.status === 'suspended') return 'suspended';
    if (a.status === 'hidden')    return 'hidden';

    /* Claim pending */
    if (a.claim_status === 'pending' || a.verification_status === 'pending') return 'claimed_pending';

    /* Claim approved */
    if (a.claim_status === 'approved' || a.claimed === true) return 'claimed_approved';

    /* Active with real verification */
    if (a.status === 'active' && (a.verification_status === 'verified' || a.verified === true)) return 'active';

    /* Check completeness — if active but missing key fields */
    var completeness = computeCompleteness(a);
    if (a.status === 'active' && completeness.score >= 70) return 'active';
    if (a.status === 'active' && completeness.score < 40)  return 'incomplete';
    if (a.status === 'active' && completeness.score < 70)  return 'pending_validation';

    /* Inactive treated as pending */
    if (a.status === 'inactive' || !a.status) return 'pending_validation';

    return 'pending_validation';
  }

  /* ── Profile completeness (reuses readiness logic) ──────── */
  function computeCompleteness(a) {
    var items = [
      { key: 'nom',          ok: !!(a.name && a.name.trim().length > 1) },
      { key: 'm\u00e9tier',  ok: !!(a.service || a.category) },
      { key: 'ville',        ok: !!(a.city) },
      { key: 't\u00e9l\u00e9phone',   ok: !!(a.phone && String(a.phone).replace(/\D/g,'').length >= 9) },
      { key: 'description',  ok: !!(a.description && a.description.trim().length > 10) },
      { key: 'disponibilit\u00e9',    ok: !!(a.availability && a.availability !== 'unknown') },
      { key: 'photo',        ok: !!(a.avatar || a.photo) }
    ];
    var done = items.filter(function(i){ return i.ok; }).length;
    return { score: Math.round((done / items.length) * 100), done: done, total: items.length, items: items };
  }

  /* Persist moderation_status via FixeoDB or patch store */
  function persistModerationStatus(id, status, extras) {
    var patch = Object.assign({ moderation_status: status, moderation_updated_at: nowISO() }, extras||{});

    /* Try FixeoDB first */
    if (window.FixeoDB && typeof window.FixeoDB.updateArtisan === 'function') {
      window.FixeoDB.updateArtisan(String(id), patch);
    }

    /* Always write to lightweight patch store as reliable fallback */
    var patches = readModPatches();
    patches[String(id)] = Object.assign({}, patches[String(id)]||{}, patch);
    writeModPatches(patches);

    /* Dispatch events */
    try { window.dispatchEvent(new CustomEvent('fixeo:artisan-status-updated', { detail: { artisanId: id, status: status } })); } catch(er){}
    try { window.dispatchEvent(new CustomEvent('fixeo:profile:updated',        { detail: { artisanId: id } })); } catch(er){}
    try { window.dispatchEvent(new CustomEvent('fixeo:state:updated',          { detail: { source: 'moderation-p2' } })); } catch(er){}
  }

  /* ── Active filter state ─────────────────────────────────── */
  var _activeFilter = 'all';
  var _searchQuery  = '';

  /* ════════════════════════════════════════════════════════
     1. MODERATION KPI STRIP
     ════════════════════════════════════════════════════════ */

  function _computeKpis() {
    var artisans = readArtisans();
    var counts = { total:0, active:0, pending:0, incomplete:0, claimed:0, suspended:0, hidden:0 };
    artisans.forEach(function(a) {
      counts.total++;
      var st = deriveModerationStatus(a);
      if (st === 'active' || st === 'claimed_approved')  counts.active++;
      else if (st === 'pending_validation')               counts.pending++;
      else if (st === 'incomplete')                       counts.incomplete++;
      else if (st === 'claimed_pending')                  counts.claimed++;
      else if (st === 'suspended')                        counts.suspended++;
      else if (st === 'hidden')                           counts.hidden++;
    });
    return counts;
  }

  function renderKpis() {
    var section = el('admin-section-artisans');
    if (!section) return;

    var existing = el('fxamp2-mod-kpis');
    if (!existing) {
      /* Inject before existing KPI grid (first child) */
      var target = section.firstElementChild;
      if (!target) return;
      var div = document.createElement('div');
      section.insertBefore(div, target);
      existing = div;
    }
    var k = _computeKpis();
    existing.id = 'fxamp2-mod-kpis';
    existing.innerHTML = [
      '<div class="fxamp2-kpi-item col-default">'
        + '<div class="fxamp2-kpi-value">' + k.total + '</div>'
        + '<div class="fxamp2-kpi-label">Total</div>'
      + '</div>',
      '<div class="fxamp2-kpi-divider"></div>',
      '<div class="fxamp2-kpi-item col-green">'
        + '<div class="fxamp2-kpi-value">' + k.active + '</div>'
        + '<div class="fxamp2-kpi-label">Actifs</div>'
      + '</div>',
      '<div class="fxamp2-kpi-divider"></div>',
      '<div class="fxamp2-kpi-item col-amber">'
        + '<div class="fxamp2-kpi-value">' + k.pending + '</div>'
        + '<div class="fxamp2-kpi-label">En v\u00e9rification</div>'
      + '</div>',
      '<div class="fxamp2-kpi-divider"></div>',
      '<div class="fxamp2-kpi-item col-muted">'
        + '<div class="fxamp2-kpi-value">' + k.incomplete + '</div>'
        + '<div class="fxamp2-kpi-label">Incomplets</div>'
      + '</div>',
      '<div class="fxamp2-kpi-divider"></div>',
      '<div class="fxamp2-kpi-item col-blue">'
        + '<div class="fxamp2-kpi-value">' + k.claimed + '</div>'
        + '<div class="fxamp2-kpi-label">Revendications</div>'
      + '</div>',
      k.suspended > 0 ? '<div class="fxamp2-kpi-divider"></div><div class="fxamp2-kpi-item col-pink"><div class="fxamp2-kpi-value">' + k.suspended + '</div><div class="fxamp2-kpi-label">Suspendus</div></div>' : ''
    ].join('');
  }

  /* ════════════════════════════════════════════════════════
     2. FILTER PILL BAR
     ════════════════════════════════════════════════════════ */

  function _countForFilter(filter) {
    var artisans = readArtisans();
    if (filter === 'all') return artisans.length;
    return artisans.filter(function(a) {
      var st = deriveModerationStatus(a);
      if (filter === 'active')     return st === 'active' || st === 'claimed_approved';
      if (filter === 'pending')    return st === 'pending_validation';
      if (filter === 'incomplete') return st === 'incomplete';
      if (filter === 'claimed')    return st === 'claimed_pending';
      if (filter === 'suspended')  return st === 'suspended' || st === 'hidden';
      return true;
    }).length;
  }

  function renderFilterBar() {
    var section = el('admin-section-artisans');
    if (!section) return;

    var existing = el('fxamp2-filter-bar');
    if (existing) { _updateFilterCounts(); return; }

    /* Find old filter row (contains #artisan-search) and inject after it */
    var artisanSearch = el('artisan-search');
    if (!artisanSearch) return;
    var oldFilterRow = artisanSearch.closest('div');
    if (!oldFilterRow) return;

    /* Mark old row as hidden */
    if (!oldFilterRow.id) oldFilterRow.id = 'fxamp2-old-filters-hidden';

    var filters = [
      { key: 'all',       label: 'Tous',              activeCls: 'active'        },
      { key: 'active',    label: 'Actifs',             activeCls: 'active-green'  },
      { key: 'pending',   label: 'En v\u00e9rification', activeCls: 'active-amber'  },
      { key: 'incomplete',label: 'Incomplets',         activeCls: 'active'        },
      { key: 'claimed',   label: 'Revendications',     activeCls: 'active-blue'   },
      { key: 'suspended', label: 'Suspendus',          activeCls: 'active-pink'   }
    ];

    var barHtml = '<div id="fxamp2-filter-bar">'
      + '<div id="fxamp2-search-wrap">'
      + '<input id="fxamp2-search" type="text" placeholder="Nom, t\u00e9l\u00e9phone, ville, m\u00e9tier\u2026" autocomplete="off">'
      + '</div>'
      + filters.map(function(f) {
          var count     = _countForFilter(f.key);
          var activeCls = _activeFilter === f.key ? ' ' + f.activeCls : '';
          return '<button class="fxamp2-filter-pill' + activeCls + '" data-filter="' + f.key + '" data-active-cls="' + f.activeCls + '">'
            + esc(f.label)
            + '<span class="fxamp2-filter-count" id="fxamp2-cnt-' + f.key + '">' + count + '</span>'
            + '</button>';
        }).join('')
      + '</div>';

    var wrapper = document.createElement('div');
    wrapper.innerHTML = barHtml;
    oldFilterRow.insertAdjacentElement('afterend', wrapper.firstChild);

    /* Wire events */
    var searchEl = el('fxamp2-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        _searchQuery = searchEl.value.toLowerCase().trim();
        _applyFilter();
      });
    }

    document.querySelectorAll('.fxamp2-filter-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeFilter = btn.dataset.filter;
        _applyFilter();
      });
    });
  }

  function _updateFilterCounts() {
    ['all','active','pending','incomplete','claimed','suspended'].forEach(function(f) {
      var cnt = el('fxamp2-cnt-' + f);
      if (cnt) cnt.textContent = _countForFilter(f);
    });
    document.querySelectorAll('.fxamp2-filter-pill').forEach(function(btn) {
      var isActive  = btn.dataset.filter === _activeFilter;
      var activeCls = btn.dataset.activeCls || 'active';
      btn.classList.toggle(activeCls, isActive);
      ['active','active-green','active-amber','active-blue','active-pink'].forEach(function(c) {
        if (c !== activeCls) btn.classList.remove(c);
      });
    });
  }

  /* Filter rows by moderation status and search (no re-render) */
  function _applyFilter() {
    _updateFilterCounts();
    var lookup = buildArtisanLookup();
    var tbody  = el('artisans-admin-tbody');
    if (!tbody) return;

    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function(row) {
      var id  = row.dataset.artisanId;
      var art = id ? lookup[id] : null;
      if (!art) { row.style.display = ''; return; }

      var st   = deriveModerationStatus(art);
      var show = true;

      if (_activeFilter !== 'all') {
        if (_activeFilter === 'active')     show = (st === 'active' || st === 'claimed_approved');
        if (_activeFilter === 'pending')    show = (st === 'pending_validation');
        if (_activeFilter === 'incomplete') show = (st === 'incomplete');
        if (_activeFilter === 'claimed')    show = (st === 'claimed_pending');
        if (_activeFilter === 'suspended')  show = (st === 'suspended' || st === 'hidden');
      }

      if (show && _searchQuery) {
        var hay = [art.name||'', art.phone||'', art.city||'', art.service||'', art.category||'', art.email||''].join(' ').toLowerCase();
        show = hay.includes(_searchQuery);
      }

      row.style.display = show ? '' : 'none';
    });
  }

  /* ════════════════════════════════════════════════════════
     3. PER-ROW ENHANCEMENT PASS
     ════════════════════════════════════════════════════════ */

  function enhanceRows() {
    var tbody = el('artisans-admin-tbody');
    if (!tbody) return;

    var lookup = buildArtisanLookup();
    var claims = readClaims();

    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function(row) {
      /* Skip empty / loading rows */
      if (row.cells.length <= 1) return;
      /* Skip already-enhanced */
      if (row.dataset.amp2Enhanced === '1') return;
      row.dataset.amp2Enhanced = '1';

      /* ── 3a. data-label for mobile card transform ─────── */
      Array.prototype.forEach.call(row.cells, function(td, i) {
        td.setAttribute('data-label', COL_LABELS[i] || '');
      });

      /* ── 3b. Identify artisan ────────────────────────── */
      /* admin-artisans.js sets <tr id="artisan-row-{id}"> */
      var id = '';
      var rowId = row.id || '';
      if (rowId.startsWith('artisan-row-')) id = rowId.replace('artisan-row-','');
      /* fallback: look for edit button data */
      if (!id) {
        var editBtn = row.querySelector('[onclick*="openEditArtisanModal"]');
        if (editBtn) {
          var m = (editBtn.getAttribute('onclick')||'').match(/openEditArtisanModal\(['"]([^'"]+)['"]\)/);
          if (m) id = m[1];
        }
      }
      row.dataset.artisanId = id;

      var art = id ? lookup[id] : null;
      if (!art) return;

      /* ── 3c. Derive moderation status ────────────────── */
      var modStatus = deriveModerationStatus(art);
      var statusMeta = STATUS_LABELS[modStatus] || STATUS_LABELS['pending_validation'];

      /* ── 3d. Row visual class ────────────────────────── */
      row.classList.remove('row-suspended','row-hidden');
      if (modStatus === 'suspended') row.classList.add('row-suspended');
      if (modStatus === 'hidden')    row.classList.add('row-hidden');

      /* ── 3e. Replace status cell (col 7) with moderation badge ── */
      var statusCell = row.cells[7];
      if (statusCell) {
        var validatedAt = '';
        var patches = readModPatches();
        var p = patches[String(id)];
        if (p && p.validated_at) validatedAt = '<div class="fxamp2-validated-at">' + esc(formatDate(p.validated_at)) + '</div>';
        else if (art.validated_at) validatedAt = '<div class="fxamp2-validated-at">' + esc(formatDate(art.validated_at)) + '</div>';

        statusCell.innerHTML = '<div class="fxamp2-validated-cell">'
          + '<span class="fxamp2-mod-badge ' + statusMeta.badge + '">' + esc(statusMeta.icon) + ' ' + esc(statusMeta.label) + '</span>'
          + validatedAt
          + '</div>';
      }

      /* ── 3f. Profile completeness bar (replace plan cell, col 4) ── */
      var planCell = row.cells[4];
      if (planCell) {
        var comp = computeCompleteness(art);
        var pct  = comp.score;
        var tier = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
        /* Keep existing plan badge html, append completeness below */
        var existingPlan = planCell.innerHTML;
        planCell.innerHTML = existingPlan
          + '<div class="fxamp2-completeness-bar" style="margin-top:5px">'
          + '<div class="fxamp2-completeness-track">'
          + '<div class="fxamp2-completeness-fill ' + tier + '" style="width:' + pct + '%"></div>'
          + '</div>'
          + '<div class="fxamp2-completeness-pct ' + tier + '">' + pct + '%</div>'
          + '</div>';
      }

      /* ── 3g. Inject moderation actions into actions cell (last col) ── */
      var actionsCell = row.cells[row.cells.length - 1];
      if (actionsCell && !actionsCell.querySelector('.fxamp2-mod-actions')) {
        var phone  = String(art.phone||'').trim();
        var waUrl  = buildWALink(phone, art.name||'');
        var waHtml = waUrl
          ? '<button class="fxamp2-action-btn btn-wa" data-amp2-action="whatsapp" data-artisan-id="' + esc(id) + '" data-wa-url="' + esc(waUrl) + '">WhatsApp</button>'
          : '';

        var modActionsHtml = '<div class="fxamp2-mod-actions">';

        /* Validate → active */
        if (modStatus !== 'active' && modStatus !== 'claimed_approved' && modStatus !== 'suspended' && modStatus !== 'hidden') {
          modActionsHtml += '<button class="fxamp2-action-btn btn-validate" data-amp2-action="validate" data-artisan-id="' + esc(id) + '">\u2713 Valider</button>';
        }

        /* Mark pending review */
        if (modStatus === 'active' || modStatus === 'claimed_approved' || modStatus === 'incomplete') {
          modActionsHtml += '<button class="fxamp2-action-btn btn-pending" data-amp2-action="pending" data-artisan-id="' + esc(id) + '">\u23f3 En v\u00e9rif.</button>';
        }

        /* Approve claim — only if claimed_pending */
        if (modStatus === 'claimed_pending') {
          /* Find pending claim id */
          var artClaims = claims.filter(function(c){ return String(c.artisan_id) === String(id) && c.status === 'pending'; });
          var claimId = artClaims.length > 0 ? artClaims[0].id : '';
          if (claimId) {
            modActionsHtml += '<button class="fxamp2-action-btn btn-approve-claim" data-amp2-action="approve-claim" data-artisan-id="' + esc(id) + '" data-claim-id="' + esc(claimId) + '">\u29d7 Approuver</button>';
          }
        }

        /* Suspend / Hide — only if not already suspended/hidden */
        if (modStatus !== 'suspended' && modStatus !== 'hidden') {
          modActionsHtml += '<button class="fxamp2-action-btn btn-suspend" data-amp2-action="suspend" data-artisan-id="' + esc(id) + '">\u26d4 Suspendre</button>';
        }

        /* Restore — only if suspended/hidden */
        if (modStatus === 'suspended' || modStatus === 'hidden') {
          modActionsHtml += '<button class="fxamp2-action-btn btn-restore" data-amp2-action="restore" data-artisan-id="' + esc(id) + '">\u21a9 Restaurer</button>';
        }

        /* WhatsApp contact */
        if (waHtml) modActionsHtml += waHtml;

        modActionsHtml += '</div>';

        actionsCell.insertAdjacentHTML('beforeend', modActionsHtml);
      }
    });

    /* Re-apply current filter */
    _applyFilter();
  }

  /* ════════════════════════════════════════════════════════
     4. ACTION HANDLERS
     ════════════════════════════════════════════════════════ */

  function bindActions() {
    document.body.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-amp2-action]');
      if (!btn) return;

      var action    = btn.dataset.amp2Action;
      var artisanId = btn.dataset.artisanId;
      var claimId   = btn.dataset.claimId;
      var waUrl     = btn.dataset.waUrl;

      if (!artisanId && action !== 'whatsapp') return;

      switch (action) {
        case 'validate':     _actionValidate(artisanId);      break;
        case 'pending':      _actionMarkPending(artisanId);   break;
        case 'approve-claim':_actionApproveClaim(artisanId, claimId); break;
        case 'suspend':      _actionSuspend(artisanId);       break;
        case 'restore':      _actionRestore(artisanId);       break;
        case 'whatsapp':     if (waUrl) window.open(waUrl, '_blank', 'noopener'); break;
      }
    });
  }

  /* ── ACTION 1: Validate ──────────────────────────────────── */
  function _actionValidate(id) {
    persistModerationStatus(id, 'active', {
      validated_at: nowISO(),
      validated_by: 'admin'
    });
    /* Also update legacy status field so admin-artisans.js toggle stays in sync */
    _patchLegacyStatus(id, 'active');
    _triggerTableRefresh();
    _showToast('\u2713 Artisan valid\u00e9 — profil actif', 'success');
  }

  /* ── ACTION 2: Mark pending review ──────────────────────── */
  function _actionMarkPending(id) {
    persistModerationStatus(id, 'pending_validation', {
      pending_at: nowISO(),
      pending_by: 'admin'
    });
    _triggerTableRefresh();
    _showToast('\u23f3 Profil marqu\u00e9 en v\u00e9rification', 'info');
  }

  /* ── ACTION 3: Approve claim ─────────────────────────────── */
  function _actionApproveClaim(artisanId, claimId) {
    /* Use FixeoClaimSystem if available */
    if (window.FixeoClaimSystem && typeof window.FixeoClaimSystem.adminApproveClaim === 'function') {
      window.FixeoClaimSystem.adminApproveClaim(claimId, 'Approuv\u00e9 depuis le panneau de mod\u00e9ration');
    } else if (window.FixeoRepository && typeof window.FixeoRepository.approveClaimRequest === 'function') {
      window.FixeoRepository.approveClaimRequest(claimId, 'Approuv\u00e9');
    } else {
      /* Direct patch */
      try {
        var claims = JSON.parse(localStorage.getItem(CLAIMS_KEY)||'[]');
        var idx = claims.findIndex(function(c){ return c.id === claimId; });
        if (idx >= 0) {
          claims[idx].status = 'approved';
          claims[idx].processed_at = nowISO();
          localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
        }
      } catch(er){}
    }
    persistModerationStatus(artisanId, 'claimed_approved', {
      validated_at: nowISO(),
      validated_by: 'admin'
    });
    _patchLegacyStatus(artisanId, 'active');
    _triggerTableRefresh();
    _showToast('\u2713 Revendication approuv\u00e9e — profil activ\u00e9', 'success');
    try { window.dispatchEvent(new CustomEvent('fixeo:claim-approved', { detail: { artisanId: artisanId, claimId: claimId } })); } catch(er){}
  }

  /* ── ACTION 4: Suspend ───────────────────────────────────── */
  function _actionSuspend(id) {
    persistModerationStatus(id, 'suspended', {
      suspended_at: nowISO(),
      suspended_by: 'admin'
    });
    _patchLegacyStatus(id, 'inactive');
    _triggerTableRefresh();
    _showToast('\u26d4 Profil suspendu', 'warning');
  }

  /* ── ACTION 5: Restore ───────────────────────────────────── */
  function _actionRestore(id) {
    persistModerationStatus(id, 'pending_validation', {
      restored_at: nowISO(),
      restored_by: 'admin'
    });
    _patchLegacyStatus(id, 'active');
    _triggerTableRefresh();
    _showToast('\u21a9 Profil restaur\u00e9 — en v\u00e9rification', 'info');
  }

  /* ── Patch legacy status in FixeoDB / localStorage ────────── */
  function _patchLegacyStatus(id, status) {
    if (window.FixeoDB && typeof window.FixeoDB.updateArtisan === 'function') {
      window.FixeoDB.updateArtisan(String(id), { status: status, updated_at: nowISO() });
      return;
    }
    /* Fallback: patch in LEGACY_KEY store */
    _patchInStore(DB_KEY, id, { status: status });
    _patchInStore(LEGACY_KEY, id, { status: status });
  }

  function _patchInStore(key, id, patch) {
    try {
      var arr = JSON.parse(localStorage.getItem(key)||'[]');
      if (!Array.isArray(arr)) return;
      var changed = false;
      var next = arr.map(function(a) {
        if (String(a.id||'') !== String(id)) return a;
        changed = true;
        return Object.assign({}, a, patch, { updated_at: nowISO() });
      });
      if (changed) localStorage.setItem(key, JSON.stringify(next));
    } catch(er){}
  }

  /* ── Trigger admin-artisans.js table refresh ─────────────── */
  function _triggerTableRefresh() {
    /* Invalidate enhancement stamps so enhanceRows re-processes */
    var tbody = el('artisans-admin-tbody');
    if (tbody) {
      Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function(row) {
        row.dataset.amp2Enhanced = '0';
      });
    }

    /* Use existing loadArtisans() if available */
    if (typeof window.loadArtisans === 'function') {
      window.loadArtisans();
    } else if (typeof window.initArtisansAdmin === 'function') {
      window.initArtisansAdmin();
    }

    /* Safety: re-enhance after render settles */
    setTimeout(function() {
      enhanceRows();
      renderKpis();
      _updateFilterCounts();
    }, 250);
  }

  function _showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type||'success');
    }
  }

  /* ════════════════════════════════════════════════════════
     5. WRAP renderArtisansAdminTable
     ════════════════════════════════════════════════════════ */

  function _hookRenderArtisansTable() {
    if (!window.renderArtisansAdminTable) {
      /* Poll for late-loading admin-artisans.js */
      var attempts = 0;
      var poll = setInterval(function() {
        if (window.renderArtisansAdminTable || ++attempts > 60) {
          clearInterval(poll);
          if (window.renderArtisansAdminTable) _doHookRender();
        }
      }, 100);
      return;
    }
    _doHookRender();
  }

  function _doHookRender() {
    if (window.renderArtisansAdminTable._amp2Hooked) return;
    var orig = window.renderArtisansAdminTable;
    window.renderArtisansAdminTable = function() {
      orig.apply(this, arguments);
      setTimeout(function() {
        enhanceRows();
        renderKpis();
        renderFilterBar();
        _updateFilterCounts();
      }, 80);
    };
    window.renderArtisansAdminTable._amp2Hooked = true;
    /* Run enhancement pass immediately on existing content */
    setTimeout(function() {
      enhanceRows();
      renderKpis();
      renderFilterBar();
    }, 80);
  }

  /* ════════════════════════════════════════════════════════
     6. ARTISAN DASHBOARD VISIBILITY BRIDGE
     When moderation status changes, the artisan dashboard
     can pick it up via event + localStorage patch.
     The artisan dashboard P3 LiveVisibilityEngine already
     listens to `fixeo:artisan-status-updated` and re-derives
     its display status. persistModerationStatus() dispatches
     this event, so the bridge is inherent.
     ════════════════════════════════════════════════════════ */
  /* No extra code needed — handled by persistModerationStatus() dispatch chain */

  /* ════════════════════════════════════════════════════════
     7. ADD MODERATION COLUMN HEADER
     Replaces "Statut" header label with "Modération"
     ════════════════════════════════════════════════════════ */

  function patchTableHeader() {
    var thead = document.querySelector('#artisans-admin-table thead tr');
    if (!thead) return;
    var headers = thead.querySelectorAll('th');
    /* Col 7 = Statut — replace with moderation label */
    if (headers[7] && !headers[7].id) {
      headers[7].id = 'fxamp2-mod-col-header';
      headers[7].textContent = 'Mod\u00e9ration';
    }
  }

  /* ════════════════════════════════════════════════════════
     8. SIDEBAR COUNT UPDATE
     ════════════════════════════════════════════════════════ */

  function updateSidebarCount() {
    var scEl = el('sc-artisans');
    if (!scEl) return;
    var artisans = readArtisans();
    scEl.textContent = artisans.length;
    /* pending badge */
    var pending = artisans.filter(function(a) { return deriveModerationStatus(a) === 'pending_validation'; }).length;
    if (pending > 0) {
      scEl.classList.add('pending');
      scEl.title = pending + ' profil(s) en v\u00e9rification';
    } else {
      scEl.classList.remove('pending');
      scEl.title = '';
    }
  }

  /* ════════════════════════════════════════════════════════
     9. EVENTS
     ════════════════════════════════════════════════════════ */

  function bindEvents() {
    var events = ['fixeo:artisan-status-updated','fixeo:profile:updated','fixeo:state:updated','fixeo:claim-approved','fixeo:claim-rejected'];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() {
        setTimeout(function() {
          renderKpis();
          _updateFilterCounts();
          updateSidebarCount();
        }, 200);
      });
    });

    window.addEventListener('storage', function(e) {
      if (e.key === DB_KEY || e.key === LEGACY_KEY || e.key === CLAIMS_KEY || e.key === MODERATION_KEY) {
        setTimeout(function() {
          renderKpis();
          _updateFilterCounts();
          updateSidebarCount();
        }, 150);
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════ */

  function init() {
    if (!_isAdminPage()) return;

    /* 700ms: after admin-artisans.js DOMContentLoaded + initArtisansAdmin at 50ms */
    setTimeout(function() {
      patchTableHeader();
      renderKpis();
      renderFilterBar();
      enhanceRows();
      bindActions();
      _hookRenderArtisansTable();
      bindEvents();
      updateSidebarCount();
    }, 700);

    /* Safety pass */
    setTimeout(function() {
      patchTableHeader();
      renderKpis();
      renderFilterBar();
      enhanceRows();
      updateSidebarCount();
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

  /* Expose for external trigger (e.g. adminSection hook) */
  window._fxAmp2Refresh = function() {
    setTimeout(function() {
      enhanceRows();
      renderKpis();
      renderFilterBar();
      _updateFilterCounts();
      updateSidebarCount();
    }, 80);
  };

})();
