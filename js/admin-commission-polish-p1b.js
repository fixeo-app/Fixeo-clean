/* ============================================================
   FIXEO ADMIN — COMMISSION QUEUE POLISH PHASE 1B
   js/admin-commission-polish-p1b.js

   OBJECTIVE: Additive UX polish layer for the commission queue.
   fixeo-admin-cod.js is the SOLE real renderer — this file
   never re-renders the table independently.

   STRATEGY: Post-render enhancement pass triggered after each
   window.refreshCODOrders() call via function wrap.

   What this file adds:
   1. Commission summary header (#fxcp1b-summary) — real totals
   2. Premium filter pill bar (#fxcp1b-filter-bar) — replaces stale dropdown
   3. Post-render enhancement pass on each <tr>:
      a. "À évaluer" badge for commission_pending_review rows
      b. Artisan phone/WA column injection
      c. data-label attributes for mobile card transform
      d. Row class (row-paid) for visually de-emphasising paid rows
   4. "Marquer à vérifier" secondary action button
   5. Paid timestamp formatting upgrade

   Guard: window._fxCp1bLoaded (idempotent)
   Never: calls renderTable(), touches localStorage directly for commission calc,
          creates its own commission engine, adds fake data
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxCp1bLoaded) return;
  window._fxCp1bLoaded = true;

  /* ── Admin page only ─────────────────────────────────────── */
  if (!document.body || document.body.dataset.dashType !== 'admin') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        if (document.body && document.body.dataset.dashType === 'admin') init();
      });
    }
    return;
  }

  /* ── Constants ───────────────────────────────────────────── */
  var STORAGE_KEY     = 'fixeo_client_requests';
  var COMMISSION_RATE = 0.15;
  var ACTIVE_STATUSES = ['valid\u00e9e', 'intervention_confirm\u00e9e'];

  /* Column labels for mobile data-label attributes (matches fixeo-admin-cod.js thead order) */
  var COL_LABELS = ['R\u00e9f.', 'Artisan', 'Service', 'Prix final', 'Commission', 'Statut mission', 'Statut paiement', 'Date paiement', 'Avis', 'Commentaire', 'Date avis', ''];

  /* ── Helpers ─────────────────────────────────────────────── */
  function el(id)    { return document.getElementById(id); }
  function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function roundMoney(n) { return Math.round(Number(n||0)); }
  function formatMoney(n) {
    var v = roundMoney(n);
    return v > 0 ? v.toLocaleString('fr-FR') + ' MAD' : '—';
  }
  function formatDateShort(s) {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
    catch(e) { return ''; }
  }

  function parseMoney(v) {
    if (typeof v === 'number' && isFinite(v) && v > 0) return roundMoney(v);
    var nums = String(v||'').match(/\d+(?:[\s.,]\d+)*/g)||[];
    var arr = nums.map(function(m){ return parseFloat(m.replace(/[\s,]/g,'.')); }).filter(function(x){ return isFinite(x)&&x>0; });
    if (!arr.length) return 0;
    return roundMoney(arr.reduce(function(a,b){return a+b;},0)/arr.length);
  }

  function deriveFinalPrice(r) {
    var ex = roundMoney(r.final_price||r.price||r.agreed_price||r.budget_value||0);
    return ex > 0 ? ex : parseMoney(r.budget||'');
  }

  function normalizeStatus(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if (n==='validee'||n==='valide') return 'valid\u00e9e';
    if (n==='intervention confirmee'||n==='intervention_confirmee') return 'intervention_confirm\u00e9e';
    return s || '';
  }

  function buildWALink(phone, artisanName) {
    var digits = String(phone||'').replace(/\D/g,'');
    if (digits.length < 9) return '';
    /* Moroccan: strip leading 0, prepend 212 */
    if (digits.charAt(0) === '0') digits = '212' + digits.slice(1);
    else if (!digits.startsWith('212')) digits = '212' + digits;
    var msg = encodeURIComponent('Bonjour ' + (artisanName || '') + ', c\u2019est Fixeo admin. Concernant votre commission due.');
    return 'https://wa.me/' + digits + '?text=' + msg;
  }

  /* ── Read requests ───────────────────────────────────────── */
   
function readRaw() {
  try {
    if (Array.isArray(window._fxAccSbCache) && window._fxAccSbCache.length) {
      return window.__fxAccSbCache;
    }

    if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
      var storeRows = window.FixeoClientRequestsStore.list();
      if (Array.isArray(storeRows) && storeRows.length) return storeRows;
    }

    var arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch(e) {
    return [];
  }
}

   /* Build a lookup map: id -> raw request */
function buildLookup() {
  var map = {};
  try {
    readRaw().forEach(function(r) {
      if (r && r.id) map[String(r.id)] = r;
    });
  } catch(e) {}
  return map;
}

  /* ── Active filter state ─────────────────────────────────── */
  var _activeFilter = 'all';
  var _searchQuery  = '';

  /* ════════════════════════════════════════════════════════
     1. COMMISSION SUMMARY HEADER
     ════════════════════════════════════════════════════════ */

  function _computeSummary() {
    var reqs = readRaw();
    var due = 0, paid = 0, review = 0, validated = 0, total = 0;
    reqs.forEach(function(r) {
      var st = normalizeStatus(r.status);
      if (!ACTIVE_STATUSES.includes(st)) return;
      validated++;
      total++;
      var ca = roundMoney(
 Number(r.commission_amount) ||
roundMoney(deriveFinalPrice(r) * 0.15)
);
      if (r.commission_paid === true || String(r.commission_status||'').trim() === 'pay\u00e9e') {
        paid += ca > 0 ? ca : roundMoney(deriveFinalPrice(r) * COMMISSION_RATE);
      } else if (r.commission_pending_review === true) {
        review++;
      } else {
        var fp = deriveFinalPrice(r);
        due += ca > 0 ? ca : roundMoney(fp * COMMISSION_RATE);
      }
    });
    return { due: due, paid: paid, review: review, validated: validated };
  }

  function renderSummary() {
    var existing = el('fxcp1b-summary');
    if (!existing) {
      /* Inject after fxacc-commission-header OR directly after h2 */
      var anchor = el('fxacc-commission-header') || document.querySelector('#admin-section-cod-orders > h2');
      if (!anchor) return;
      var div = document.createElement('div');
      div.id = 'fxcp1b-summary';
      anchor.insertAdjacentElement('afterend', div);
      existing = div;
    }
    var s = _computeSummary();
    existing.innerHTML = [
      '<div class="fxcp1b-sum-item col-amber">'
        + '<div class="fxcp1b-sum-value">' + esc(formatMoney(s.due)) + '</div>'
        + '<div class="fxcp1b-sum-label">Commissions \u00e0 r\u00e9gler</div>'
      + '</div>',
      s.due > 0 || s.paid > 0 ? '<div class="fxcp1b-sum-divider"></div>' : '',
      '<div class="fxcp1b-sum-item col-green">'
        + '<div class="fxcp1b-sum-value">' + esc(formatMoney(s.paid)) + '</div>'
        + '<div class="fxcp1b-sum-label">Commissions pay\u00e9es</div>'
      + '</div>',
      '<div class="fxcp1b-sum-divider"></div>',
      '<div class="fxcp1b-sum-item col-blue">'
        + '<div class="fxcp1b-sum-value">' + (s.review > 0 ? s.review : '—') + '</div>'
        + '<div class="fxcp1b-sum-label">\u00c0 \u00e9valuer manuellement</div>'
      + '</div>',
      '<div class="fxcp1b-sum-divider"></div>',
      '<div class="fxcp1b-sum-item col-default">'
        + '<div class="fxcp1b-sum-value">' + s.validated + '</div>'
        + '<div class="fxcp1b-sum-label">Missions valid\u00e9es</div>'
      + '</div>'
    ].join('');
  }

  /* ════════════════════════════════════════════════════════
     2. FILTER PILL BAR
     ════════════════════════════════════════════════════════ */

  function _countByFilter(filter) {
    var reqs = readRaw().filter(function(r) {
      var st = normalizeStatus(r.status);
      if (!ACTIVE_STATUSES.includes(st)) {
        /* also count non-validated assigned missions */
        return !!r.assigned_artisan && r.status !== 'nouvelle' && r.status !== 'disponible';
      }
      return true;
    });
    if (filter === 'all')     return reqs.length;
    if (filter === 'a_payer') return reqs.filter(function(r) {
var ca = roundMoney(
Number(r.commission_amount) ||
roundMoney(deriveFinalPrice(r) * 0.15)
);
       return ACTIVE_STATUSES.includes(normalizeStatus(r.status))
        && !r.commission_paid && String(r.commission_status||'').trim() !== 'pay\u00e9e'
        && r.commission_pending_review !== true
        && (ca > 0 || deriveFinalPrice(r) > 0);
    }).length;
    if (filter === 'payee')   return reqs.filter(function(r) { return r.commission_paid === true || String(r.commission_status||'').trim() === 'pay\u00e9e'; }).length;
    if (filter === 'review')  return reqs.filter(function(r) { return r.commission_pending_review === true; }).length;
    return reqs.length;
  }

  function renderFilterBar() {
    var existing = el('fxcp1b-filter-bar');
    if (existing) { _updateFilterCounts(); return; }

    var summary = el('fxcp1b-summary');
    if (!summary) return;

    var filters = [
      { key: 'all',     label: 'Toutes',       activeCls: 'active'       },
      { key: 'a_payer', label: '\u00c0 r\u00e9gler',   activeCls: 'active-amber' },
      { key: 'payee',   label: 'Pay\u00e9es',          activeCls: 'active-green' },
      { key: 'review',  label: '\u00c0 \u00e9valuer',  activeCls: 'active-blue'  }
    ];

    var barHtml = '<div id="fxcp1b-filter-bar">'
      + '<div id="fxcp1b-search-wrap">'
      + '<input id="fxcp1b-search" type="text" placeholder="Rechercher artisan, service, ville\u2026" autocomplete="off">'
      + '</div>'
      + filters.map(function(f) {
          var count = _countByFilter(f.key);
          var activeCls = _activeFilter === f.key ? ' ' + f.activeCls : '';
          return '<button class="fxcp1b-filter-pill' + activeCls + '" data-filter="' + f.key + '" data-active-cls="' + f.activeCls + '">'
            + esc(f.label)
            + '<span class="fxcp1b-filter-count" id="fxcp1b-cnt-' + f.key + '">' + count + '</span>'
            + '</button>';
        }).join('')
      + '</div>';

    var div = document.createElement('div');
    div.innerHTML = barHtml;
    summary.insertAdjacentElement('afterend', div.firstChild);

    /* Wire events */
    var searchEl = el('fxcp1b-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        _searchQuery = searchEl.value.toLowerCase().trim();
        _applyFilter();
      });
    }

    document.querySelectorAll('.fxcp1b-filter-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeFilter = btn.dataset.filter;
        _applyFilter();
      });
    });
  }

  function _updateFilterCounts() {
    ['all','a_payer','payee','review'].forEach(function(f) {
      var cnt = el('fxcp1b-cnt-' + f);
      if (cnt) cnt.textContent = _countByFilter(f);
    });
    /* Update active class */
    document.querySelectorAll('.fxcp1b-filter-pill').forEach(function(btn) {
      var isActive = btn.dataset.filter === _activeFilter;
      var activeCls = btn.dataset.activeCls || 'active';
      btn.classList.toggle(activeCls, isActive);
      /* Remove any other active class just in case */
      ['active','active-amber','active-green','active-blue'].forEach(function(c) {
        if (c !== activeCls) btn.classList.remove(c);
      });
    });
  }

  /* Apply filter to existing table rows WITHOUT re-rendering */
  function _applyFilter() {
    _updateFilterCounts();
    var tbody = el('cod-admin-tbody');
    if (!tbody) return;

    var lookup = buildLookup();

    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function(row) {
      var id = row.dataset.missionId || _extractRowId(row);
      var raw = id ? lookup[id] : null;
      if (!raw) { row.style.display = ''; return; }

      var st  = normalizeStatus(raw.status);
      var fp  = deriveFinalPrice(raw);
      var ca  = roundMoney(raw.commission_amount||0);
      var pr  = raw.commission_pending_review === true;
      var isPaid = raw.commission_paid === true || String(raw.commission_status||'').trim() === 'pay\u00e9e';
      var isDue  = ACTIVE_STATUSES.includes(st) && !isPaid && !pr && (ca > 0 || fp > 0);

      var show = true;
      if (_activeFilter === 'a_payer') show = isDue;
      if (_activeFilter === 'payee')   show = isPaid;
      if (_activeFilter === 'review')  show = pr;

      /* Search filter */
      if (show && _searchQuery) {
        var hay = [raw.service||'', raw.city||'', raw.assigned_artisan||'', raw.phone||''].join(' ').toLowerCase();
        show = hay.includes(_searchQuery);
      }

      row.style.display = show ? '' : 'none';
    });
  }

  /* Extract mission id from a rendered row (first td content, strips '#') */
  function _extractRowId(row) {
    var first = row.cells && row.cells[0];
    if (!first) return '';
    return (first.textContent || '').replace('#','').trim().slice(-8);
  }

  /* ════════════════════════════════════════════════════════
     3. POST-RENDER ENHANCEMENT PASS
     Runs after each refreshCODOrders() call
     ════════════════════════════════════════════════════════ */

  function enhanceRows() {
    var tbody = el('cod-admin-tbody');
    if (!tbody) return;

    var lookup = buildLookup();

    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function(row, rowIdx) {
      /* Skip empty-state rows */
      if (row.cells.length <= 1) return;
      /* Skip already-enhanced rows */
      if (row.dataset.p1bEnhanced === '1') return;
      row.dataset.p1bEnhanced = '1';

      /* ── 3a. data-label for mobile card transform ───────── */
      Array.prototype.forEach.call(row.cells, function(td, i) {
        td.setAttribute('data-label', COL_LABELS[i] || '');
      });

      /* ── 3b. Identify this row's request ────────────────── */
      var markPaidBtn = row.querySelector('[data-admin-action="mark-commission-paid"]');
      var id = markPaidBtn ? markPaidBtn.getAttribute('data-mission-id') : '';
      /* Fallback: try row ref text */
      if (!id && row.cells[0]) id = row.cells[0].textContent.replace('#','').trim();
      /* Try lookup by partial id */
      var raw = null;
      if (id) {
        raw = lookup[id];
        /* Lookup may use full id — try prefix search */
        if (!raw) {
          var keys = Object.keys(lookup);
          for (var ki = 0; ki < keys.length; ki++) {
            if (keys[ki].endsWith(id) || keys[ki].includes(id)) { raw = lookup[keys[ki]]; break; }
          }
        }
      }
      row.dataset.missionId = id;

      if (!raw) return;

      var fp  = deriveFinalPrice(raw);
     var ca = roundMoney(
  Number(raw.commission_amount) ||
  roundMoney(deriveFinalPrice(raw) * 0.15)
);
      var pr  = raw.commission_pending_review === true;
      var st  = normalizeStatus(raw.status);
      var isPaid = raw.commission_paid === true || String(raw.commission_status||'').trim() === 'pay\u00e9e';

      /* ── 3c. "À évaluer" badge in commission column ─────── */
      var commCell = row.cells[4]; /* Commission column */
      if (commCell && pr && !isPaid) {
        commCell.innerHTML = '<span class="fxcp1b-badge-review">\u29d7 \u00c0 \u00e9valuer</span>'
          + '<div style="font-size:.67rem;opacity:.32;margin-top:3px">Montant \u00e0 v\u00e9rifier manuellement</div>';
      } else if (commCell && ca > 0 && !isPaid && ACTIVE_STATUSES.includes(st)) {
        /* Replace raw "— MAD" format with nicer badge for due commissions */
        commCell.innerHTML = '<span class="fxcp1b-badge-due">' + esc(ca.toLocaleString('fr-FR') + ' MAD') + '</span>';
      } else if (commCell && isPaid && ca > 0) {
        commCell.innerHTML = '<span class="fxcp1b-badge-paid">\u2713 ' + esc(ca.toLocaleString('fr-FR') + ' MAD') + '</span>';
      }

      /* ── 3d. Artisan cell — inject phone/WA ─────────────── */
      var artisanCell = row.cells[1];
      if (artisanCell) {
        var name = esc(raw.assigned_artisan || 'Non attribu\u00e9e');
        var city = esc(raw.city || '');
        var phone = String(raw.phone || '').trim();
        var waUrl = buildWALink(phone, raw.assigned_artisan || '');
        var phoneHtml = '';
        if (waUrl) {
          phoneHtml = '<a href="' + esc(waUrl) + '" target="_blank" rel="noopener" class="fxcp1b-wa-link">WhatsApp</a>';
        } else if (phone) {
          phoneHtml = '<div class="fxcp1b-no-phone">' + esc(phone) + '</div>';
        } else {
          phoneHtml = '<div class="fxcp1b-no-phone">T\u00e9l\u00e9phone non disponible</div>';
        }
        artisanCell.innerHTML = '<div class="fxcp1b-artisan-cell">'
          + '<div class="fxcp1b-artisan-name">' + name + '</div>'
          + (city ? '<div class="fxcp1b-artisan-city">\ud83d\udccd ' + city + '</div>' : '')
          + phoneHtml
          + '</div>';
      }

      /* ── 3e. Paid timestamp upgrade ─────────────────────── */
      var paidTsCell = row.cells[7]; /* Date paiement column */
      if (paidTsCell && isPaid && raw.commission_paid_at) {
        var dt = formatDateShort(raw.commission_paid_at);
        paidTsCell.innerHTML = '<div class="fxcp1b-paid-ts"><strong>\u2713 Pay\u00e9e</strong>' + (dt ? esc(dt) : '') + '</div>';
      }

      /* ── 3f. Row class for paid rows ─────────────────────── */
      if (isPaid) row.classList.add('row-paid');

      /* ── 3g. Secondary "Marquer à vérifier" action ──────── */
      var actionsCell = row.cells[row.cells.length - 1];
      if (actionsCell && !pr && !isPaid && fp === 0 && ca === 0) {
        /* Zero-price validated mission: add review action */
        var existing = actionsCell.querySelector('[data-admin-action="mark-needs-review"]');
        if (!existing) {
          var btn = document.createElement('button');
          btn.className = 'btn btn-sm';
          btn.dataset.adminAction = 'mark-needs-review';
          btn.dataset.missionId = id;
          btn.textContent = '\u29d7 \u00c0 \u00e9valuer';
          btn.style.marginTop = '5px';
          btn.style.display = 'block';
          actionsCell.appendChild(btn);
        }
      }
      /* "Retirer vérification" when pending_review AND price is now known */
      if (actionsCell && pr && fp > 0 && ca > 0 && !isPaid) {
        var existingR = actionsCell.querySelector('[data-admin-action="remove-review"]');
        if (!existingR) {
          var btnR = document.createElement('button');
          btnR.className = 'btn btn-sm';
          btnR.dataset.adminAction = 'remove-review';
          btnR.dataset.missionId = id;
          btnR.textContent = 'Retirer v\u00e9rification';
          btnR.style.marginTop = '5px';
          btnR.style.display = 'block';
          btnR.style.background = 'rgba(255,165,2,0.10)';
          btnR.style.border = '1px solid rgba(255,165,2,0.22)';
          btnR.style.color = '#ffa502';
          btnR.style.borderRadius = '8px';
          btnR.style.padding = '5px 11px';
          btnR.style.fontSize = '0.70rem';
          actionsCell.appendChild(btnR);
        }
      }
    });

    /* Re-apply current filter (don't change visibility of newly set rows) */
    _applyFilter();
  }

  /* ════════════════════════════════════════════════════════
     4. "MARK NEEDS REVIEW" + "REMOVE REVIEW" ACTIONS
     ════════════════════════════════════════════════════════ */

  function bindSecondaryActions() {
    document.body.addEventListener('click', function(e) {
      /* Mark needs review */
      var needsReviewBtn = e.target.closest('[data-admin-action="mark-needs-review"]');
      if (needsReviewBtn) {
        var id = needsReviewBtn.dataset.missionId;
        _writeFlag(id, { commission_pending_review: true });
        window.showToast && window.showToast('\u29d7 Commission marqu\u00e9e \u00e0 \u00e9valuer', 'info');
        _triggerRefresh();
        return;
      }
      /* Remove review flag */
      var removeReviewBtn = e.target.closest('[data-admin-action="remove-review"]');
      if (removeReviewBtn) {
        var rid = removeReviewBtn.dataset.missionId;
        _writeFlag(rid, { commission_pending_review: false });
        window.showToast && window.showToast('\u2713 Marque \u00e0 v\u00e9rifier retir\u00e9e', 'success');
        _triggerRefresh();
        return;
      }
    });
  }

  /* Write a field patch to fixeo_client_requests by id */
  function _writeFlag(id, patch) {
    if (!id) return;
    try {
      var arr = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      if (!Array.isArray(arr)) return;
      var changed = false;
      var next = arr.map(function(r) {
        if (String(r.id||'') !== String(id)) return r;
        changed = true;
        return Object.assign({}, r, patch);
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        try { window.dispatchEvent(new CustomEvent('fixeo:commission-updated', { detail: { id: id } })); } catch(er){}
        try { window.dispatchEvent(new CustomEvent('fixeo:client-request-updated', { detail: { id: id } })); } catch(er){}
      }
    } catch(er) {}
  }

  /* ════════════════════════════════════════════════════════
     5. HIDE OLD STALE TOOLBAR
     The old #cod-search + #cod-filter-status toolbar is now
     replaced visually by fxcp1b-filter-bar. We don't remove
     the DOM (fixeo-admin-cod.js reads those IDs) but we
     hide the wrapping .admin-toolbar div.
     ════════════════════════════════════════════════════════ */

  function hideOldToolbar() {
    /* The old toolbar contains #cod-search — find its parent */
    var codSearch = el('cod-search');
    if (!codSearch) return;
    var toolbar = codSearch.closest('.admin-toolbar');
    if (toolbar && !toolbar.id) {
      toolbar.id = 'fxcp1b-old-toolbar-hidden'; /* CSS hides it */
    }
  }

  /* ════════════════════════════════════════════════════════
     6. WRAP window.refreshCODOrders
     ════════════════════════════════════════════════════════ */

  function _triggerRefresh() {
    if (typeof window.refreshCODOrders === 'function') {
      window.refreshCODOrders();
    }
  }

  function _hookRefreshCODOrders() {
    /* Poll until fixeo-admin-cod.js exports it */
    if (!window.refreshCODOrders) {
      var attempts = 0;
      var poll = setInterval(function() {
        if (window.refreshCODOrders || ++attempts > 40) {
          clearInterval(poll);
          if (window.refreshCODOrders) _doHook();
        }
      }, 100);
      return;
    }
    _doHook();
  }

  function _doHook() {
    if (window.refreshCODOrders._p1bHooked) return;
    var orig = window.refreshCODOrders;
    window.refreshCODOrders = function() {
      orig.apply(this, arguments);
      /* Run enhancement pass after DOM settles */
      setTimeout(function() {
        enhanceRows();
        renderSummary();
        renderFilterBar();
        _updateFilterCounts();
      }, 80);
    };
    window.refreshCODOrders._p1bHooked = true;
  }

  /* ════════════════════════════════════════════════════════
     7. EVENTS
     ════════════════════════════════════════════════════════ */

  function bindEvents() {
    var events = ['fixeo:commission-updated','fixeo:commission-paid','fixeo:client-request-updated','fixeo:missions:updated'];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() {
        setTimeout(function() {
          enhanceRows();
          renderSummary();
          _updateFilterCounts();
        }, 150);
      });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === STORAGE_KEY) {
        setTimeout(function() {
          enhanceRows();
          renderSummary();
          _updateFilterCounts();
        }, 100);
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════ */

  function init() {
    if (!document.body || document.body.dataset.dashType !== 'admin') return;

    setTimeout(function() {
      hideOldToolbar();
      renderSummary();
      renderFilterBar();
      enhanceRows();
      bindSecondaryActions();
      _hookRefreshCODOrders();
      bindEvents();
    }, 600); /* after fixeo-admin-cod.js DOMContentLoaded handler at ~0ms */

    /* Safety pass if section opens late */
    setTimeout(function() {
      hideOldToolbar();
      renderSummary();
      renderFilterBar();
      enhanceRows();
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

})();
