/* ============================================================
   FIXEO ADMIN — CONTROL CENTER PHASE 1
   js/admin-control-center-p1.js

   OBJECTIVE: Real operational visibility for admin.
   - Replaces 4 fake overview KPIs with real counters
   - Injects mission lifecycle tracker in overview
   - Injects request visibility table in overview
   - Injects artisan operational summary in overview
   - Injects commission queue header in cod-orders section
   - Suppresses any remaining legacy fake renderer calls

   DATA SOURCE: fixeo_client_requests (localStorage)
   COMMISSION RATE: 15% (COMMISSION_RATE = 0.15)
   STORE DEPENDENCY: FixeoClientRequestsStore if available; direct parse fallback

   Guard: window._fxAccP1Loaded (idempotent)
   Namespace: .fxacc-*
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAccP1Loaded) return;
  window._fxAccP1Loaded = true;

  /* ── Only run on admin dashboard ────────────────────────── */
  if (!document.body || document.body.dataset.dashType !== 'admin') {
    /* Retry once after DOM ready */
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
  var ARTISANS_KEY    = 'fixeo_artisans';

  /* ── Supabase service_requests cache (admin-sb1) ─────────────
   * In-memory store for Supabase-sourced requests, refreshed
   * asynchronously. localStorage write always happens first;
   * this only adds cross-device Supabase rows to the admin view.
   * Never blocks render — stale cache is fine on first paint.
   * ─────────────────────────────────────────────────────────── */
  var _sbReqCache = []; /* rows mapped to System A shape */
  var _sbFetchBusy = false; /* prevent overlapping fetches */

  var LIFECYCLE_STEPS = [
    { key: 'nouvelle',     label: 'Demande\npubli\u00e9e' },
    { key: 'accept\u00e9e', label: 'Artisan\nassign\u00e9' },
    { key: 'en_cours',     label: 'Intervention\nen cours' },
    { key: 'termin\u00e9e', label: 'Termin\u00e9e' },
    { key: 'valid\u00e9e',  label: 'Valid\u00e9e' }
  ];

  /* ── Helpers ─────────────────────────────────────────────── */
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function el(id) { return document.getElementById(id); }
  function roundMoney(n) { return Math.round(Number(n || 0)); }
  function formatMoney(n) { return roundMoney(n).toLocaleString('fr-FR') + ' MAD'; }
  function formatDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
    catch(e) { return '—'; }
  }

  /* ── Read fixeo_client_requests ──────────────────────────────
   * admin-sb1: merges localStorage (System A) with cached Supabase
   * service_requests (System B). Deduplication via supabase_request_id
   * cross-ref written by fixeo-reservation-supabase-bridge.js.
   * If both caches are empty the existing empty-state renders as before.
   * ─────────────────────────────────────────────────────────── */
  function readRequests() {
    var lsRows = [];
    try {
      if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') {
        lsRows = window.FixeoClientRequestsStore.list();
      } else {
        var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        lsRows = Array.isArray(raw) ? raw : [];
      }
    } catch(_) { lsRows = []; }

    /* Build dedup set from localStorage rows.
     * Keys: (a) supabase_request_id already patched by bridge,
     *       (b) the Supabase id stored as id when row came from Supabase.
     * Any Supabase row whose id is already represented is skipped. */
    var seen = new Set();
    lsRows.forEach(function(r) {
      if (r.supabase_request_id) seen.add(String(r.supabase_request_id));
      if (r.id) seen.add(String(r.id));
    });

    /* Append non-duplicate Supabase rows */
    var sbOnly = _sbReqCache.filter(function(r) {
      return !seen.has(String(r.id));
    });

    return lsRows.concat(sbOnly);
  }

  /* ── Fetch service_requests from Supabase (admin-sb1) ────────
   * Async, fire-and-forget. Uses FixeoSupabaseClient which is already
   * loaded on admin.html via supabase-client.js.
   * Maps Supabase row shape → System A shape expected by renderAll().
   * On any failure: leaves _sbReqCache unchanged, single console.warn.
   * ─────────────────────────────────────────────────────────── */
  function _fetchSupabaseRequests() {
    var fsc = window.FixeoSupabaseClient;
    if (!fsc || !fsc.CONFIGURED) return; /* Supabase not set up — graceful no-op */
    if (_sbFetchBusy) return;
    _sbFetchBusy = true;

    fsc.ready().then(function() {
      var sb = fsc.client;
      if (!sb) { _sbFetchBusy = false; return; }

      /* Must have an authenticated session — admin is always authed */
      return sb.auth.getSession().then(function(res) {
        var session = res && res.data && res.data.session;
        if (!session) { _sbFetchBusy = false; return; }

        /* Read all service_requests ordered newest-first, cap at 200 */
        return sb
          .from('service_requests')
          .select('id, client_profile_id, service_category, city, description, status, created_at')
          .order('created_at', { ascending: false })
          .limit(200)
          .then(function(result) {
            _sbFetchBusy = false;
            if (result.error) {
              console.warn('[Admin-sb1] service_requests fetch error:', result.error.message || result.error.code);
              return;
            }
            var rows = Array.isArray(result.data) ? result.data : [];
            /* Map Supabase row → System A shape.
             * Unmapped fields (commission, artisan, price) default to
             * zero/empty — the existing empty-pill CSS handles them. */
            _sbReqCache = rows.map(function(r) {
              /* status mapping: Supabase 'new' → System A 'nouvelle' */
              var st = String(r.status || 'new').toLowerCase();
              if (st === 'new') st = 'nouvelle';
              return {
                id              : String(r.id || ''),
                service         : String(r.service_category || '').trim() || 'Service',
                city            : String(r.city || '').trim() || '—',
                description     : String(r.description || '').trim(),
                status          : st,
                assigned_artisan: '',
                assigned_artisan_id: '',
                budget          : '',
                final_price     : 0,
                commission_amount: 0,
                commission_status: '',
                commission_paid : false,
                created_at      : String(r.created_at || new Date().toISOString()),
                validated_at    : '',
                /* cross-ref marker so readRequests() dedup recognises it */
                _source         : 'supabase'
              };
            });
            /* Trigger a re-render so newly fetched rows appear promptly */
            setTimeout(renderAll, 0);
          });
      });
    }).catch(function(err) {
      _sbFetchBusy = false;
      console.warn('[Admin-sb1] Supabase fetch failed:', err && err.message);
    });
  }

  function normalizeStatus(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if (n === 'validee' || n === 'valide') return 'valid\u00e9e';
    if (n === 'terminee' || n === 'termine') return 'termin\u00e9e';
    if (n === 'en cours' || n === 'en_cours') return 'en_cours';
    if (n === 'acceptee' || n === 'accepte') return 'accept\u00e9e';
    if (n === 'annulee' || n === 'annule') return 'annul\u00e9e';
    return s || 'nouvelle';
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

  /* ════════════════════════════════════════════════════════
     METRICS ENGINE
     ════════════════════════════════════════════════════════ */

  function computeMetrics() {
    var reqs = readRequests();
    var m = {
      total:              reqs.length,
      activeRequests:     0,   // nouvelle + disponible
      accepted:           0,
      inProgress:         0,
      completed:          0,   // terminée
      validated:          0,   // validée
      cancelled:          0,
      commissionsDue:     0,   // sum commission_amount where status='à_payer'
      commissionsPaid:    0,   // sum commission_amount where commission_paid=true
      pendingReview:      0,   // commission_pending_review=true
      assignedArtisans:   {},  // artisan → {missions, commDue, commPaid}
      byStatus:           {}
    };

    reqs.forEach(function(r) {
      var st = normalizeStatus(r.status);
      m.byStatus[st] = (m.byStatus[st] || 0) + 1;

      if (st === 'nouvelle' || st === 'disponible') m.activeRequests++;
      else if (st === 'accept\u00e9e') m.accepted++;
      else if (st === 'en_cours') m.inProgress++;
      else if (st === 'termin\u00e9e') m.completed++;
      else if (st === 'valid\u00e9e' || st === 'intervention_confirm\u00e9e') m.validated++;
      else if (st === 'annul\u00e9e') m.cancelled++;

      /* Commission aggregates */
      var cst = String(r.commission_status || '').trim();
      var ca  = roundMoney(r.commission_amount || 0);
      if (r.commission_paid === true || cst === 'pay\u00e9e') {
        m.commissionsPaid += ca > 0 ? ca : roundMoney(deriveFinalPrice(r) * COMMISSION_RATE);
      } else if (r.commission_pending_review === true) {
        m.pendingReview++;
      } else if (cst === '\u00e0_payer' || (st === 'valid\u00e9e' && !r.commission_paid)) {
        var fp = deriveFinalPrice(r);
        m.commissionsDue += ca > 0 ? ca : roundMoney(fp * COMMISSION_RATE);
      }

      /* Per-artisan aggregates */
      var artName = String(r.assigned_artisan || '').trim();
      if (artName && (st === 'accept\u00e9e' || st === 'en_cours' || st === 'termin\u00e9e' || st === 'valid\u00e9e')) {
        if (!m.assignedArtisans[artName]) m.assignedArtisans[artName] = { name: artName, missions: 0, validated: 0, commDue: 0, commPaid: 0, city: r.city||'', job: r.service||'' };
        m.assignedArtisans[artName].missions++;
        if (st === 'valid\u00e9e') {
          m.assignedArtisans[artName].validated++;
          if (r.commission_paid === true) {
            m.assignedArtisans[artName].commPaid += roundMoney(r.commission_amount || roundMoney(deriveFinalPrice(r)*COMMISSION_RATE));
          } else {
            m.assignedArtisans[artName].commDue += roundMoney(r.commission_amount || roundMoney(deriveFinalPrice(r)*COMMISSION_RATE));
          }
        }
      }
    });

    return m;
  }

  /* ════════════════════════════════════════════════════════
     1. REAL OVERVIEW KPIs (replace fake 12/48/87/28450)
     ════════════════════════════════════════════════════════ */

  function updateOverviewKPIs(m) {
    /* artisans → active missions assigned */
    var artCount = Object.keys(m.assignedArtisans).length;
    _setKpiEl('kpi-artisans', String(artCount || '—'), 'Artisans avec missions');

    /* clients → unique phones/names who submitted */
    var reqs = readRequests();
    var clientSet = new Set();
    reqs.forEach(function(r) {
      var p = String(r.phone||'').replace(/\D/g,'').slice(-9);
      if (p.length >= 7) clientSet.add(p);
      else {
        var n = String(r.client_name||r.name||'').trim().toLowerCase();
        if (n.length > 1) clientSet.add(n);
      }
    });
    _setKpiEl('kpi-clients', String(clientSet.size || reqs.length || '—'), 'Demandes soumises');

    /* jobs → validated + in-progress + accepted */
    var activeMissions = m.validated + m.inProgress + m.accepted + m.completed;
    _setKpiEl('kpi-jobs', String(activeMissions || '—'), 'Missions actives');

    /* revenue → commissions due (NOT fake monthly revenue) */
    var totalComm = m.commissionsDue + m.commissionsPaid;
    _setKpiEl('kpi-revenue',
      totalComm > 0 ? totalComm.toLocaleString('fr-FR') : '—',
      'Commissions totales MAD');
  }

  function _setKpiEl(id, value, noteText) {
    var v = el(id);
    if (!v) return;
    v.textContent = value;
    /* Remove fake trend badge in the same card */
    var card = v.closest('.kpi-card');
    if (card) {
      card.classList.add('fxacc-kpi-real');
      var trend = card.querySelector('.kpi-trend');
      if (trend) trend.style.display = 'none';
      /* Add or update note */
      var note = card.querySelector('.fxacc-kpi-note');
      if (!note) {
        note = document.createElement('div');
        note.className = 'fxacc-kpi-note';
        v.parentNode.insertBefore(note, v.nextSibling.nextSibling || null);
      }
      note.textContent = noteText;
    }
  }

  /* ════════════════════════════════════════════════════════
     2. LIFECYCLE TRACKER
     ════════════════════════════════════════════════════════ */

  function renderLifecyclePanel(m) {
    var existing = el('fxacc-lifecycle-panel');
    if (existing) existing.remove();

    var opsPanel = el('fxacc-ops-panel');
    var insertAfter = opsPanel || document.querySelector('.admin-kpi-grid');
    if (!insertAfter) return;

    var html = '<div id="fxacc-lifecycle-panel">'
      + '<div class="fxacc-panel-title">Cycle de vie des missions</div>'
      + '<div class="fxacc-lifecycle-track">';

    LIFECYCLE_STEPS.forEach(function(step, i) {
      var count = m.byStatus[step.key] || 0;
      var hasCls = count > 0 ? ' has-count' : '';
      var activeCls = count > 0 ? ' step-active' : '';
      html += '<div class="fxacc-lc-step' + hasCls + activeCls + '">'
        + '<div class="fxacc-lc-dot">' + (count > 0 ? count : '·') + '</div>'
        + '<div class="fxacc-lc-label">' + esc(step.label.replace('\n',' ')) + '</div>'
        + (count > 0 ? '<div class="fxacc-lc-count">' + count + '</div>' : '')
        + '</div>';
    });

    html += '</div></div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    insertAfter.insertAdjacentElement('afterend', div.firstChild);
  }

  /* ════════════════════════════════════════════════════════
     3. OPERATIONS REAL KPI GRID
     ════════════════════════════════════════════════════════ */

  function renderOpsPanel(m) {
    var existing = el('fxacc-ops-panel');
    if (existing) existing.remove();

    var lifecycle = el('fxacc-lifecycle-panel');
    var insertAfter = lifecycle;
    if (!insertAfter) return;

    var items = [
      { label: 'Demandes actives',     value: m.activeRequests,   sub: 'En attente d\u2019artisan',   accent: 'blue'   },
      { label: 'Missions en cours',     value: m.inProgress,       sub: 'Interventions actives',       accent: 'teal'   },
      { label: 'Missions valid\u00e9es', value: m.validated,       sub: 'Client a confirm\u00e9',      accent: 'green'  },
      { label: 'Commissions dues',      value: m.commissionsDue > 0 ? formatMoney(m.commissionsDue) : '—',   sub: '\u00c0 r\u00e9gler aux commissions',  accent: 'amber'  },
      { label: 'Commissions pay\u00e9es', value: m.commissionsPaid > 0 ? formatMoney(m.commissionsPaid) : '—', sub: 'R\u00e9gl\u00e9es par admin',      accent: 'green'  },
      { label: '\u00c0 \u00e9valuer',    value: m.pendingReview,    sub: 'Prix manquant \u2014 rev. manuelle', accent: 'purple' }
    ];

    var html = '<div id="fxacc-ops-panel">'
      + '<div class="fxacc-panel-title">Indicateurs op\u00e9rationnels (temps r\u00e9el)</div>'
      + '<div class="fxacc-ops-grid">';

    items.forEach(function(item) {
      html += '<div class="fxacc-ops-card accent-' + item.accent + '">'
        + '<div class="fxacc-ops-value">' + esc(String(item.value || '—')) + '</div>'
        + '<div class="fxacc-ops-label">' + esc(item.label) + '</div>'
        + '<div class="fxacc-ops-sub">' + esc(item.sub) + '</div>'
        + '</div>';
    });

    html += '</div></div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    insertAfter.insertAdjacentElement('afterend', div.firstChild);
  }

  /* ════════════════════════════════════════════════════════
     4. REQUEST VISIBILITY TABLE
     ════════════════════════════════════════════════════════ */

  /* Status label for table pill */
  function _statusPillCls(st) {
    var n = normalizeStatus(st);
    if (n === 'nouvelle' || n === 'disponible') return 'nouvelle';
    if (n === 'accept\u00e9e') return 'acceptee';
    if (n === 'en_cours') return 'en-cours';
    if (n === 'termin\u00e9e') return 'terminee';
    if (n === 'valid\u00e9e' || n === 'intervention_confirm\u00e9e') return 'validee';
    if (n === 'annul\u00e9e') return 'annulee';
    return 'nouvelle';
  }
  function _statusLabel(st) {
    var n = normalizeStatus(st);
    var map = {
      'nouvelle': 'Nouvelle', 'disponible': 'Disponible',
      'accept\u00e9e': 'Accept\u00e9e', 'en_cours': 'En cours',
      'termin\u00e9e': 'Termin\u00e9e',
      'valid\u00e9e': 'Valid\u00e9e', 'intervention_confirm\u00e9e': 'Valid\u00e9e',
      'annul\u00e9e': 'Annul\u00e9e'
    };
    return map[n] || st || 'Inconnue';
  }
  function _commPill(r) {
    var cst = String(r.commission_status||'').trim();
    if (r.commission_paid === true || cst === 'pay\u00e9e') return '<span class="fxacc-pill payee">\u2713 Pay\u00e9e</span>';
    if (r.commission_pending_review === true) return '<span class="fxacc-pill a-verifier">\u29d7 \u00c0 \u00e9valuer</span>';
    if (cst === '\u00e0_payer') {
      var ca = roundMoney(r.commission_amount || roundMoney(deriveFinalPrice(r)*COMMISSION_RATE));
      return '<span class="fxacc-pill a-payer">' + (ca > 0 ? ca.toLocaleString('fr-FR') + ' MAD' : '\u00c0 payer') + '</span>';
    }
    return '<span style="opacity:.30;font-size:.68rem">—</span>';
  }

  var _reqFilter = { q: '', status: '', city: '' };

  function _renderRequestsTable(reqs) {
    var tbody = el('fxacc-req-tbody');
    if (!tbody) return;

    /* Apply filters */
    var q    = _reqFilter.q.toLowerCase().trim();
    var fst  = _reqFilter.status;
    var fcity = _reqFilter.city.toLowerCase().trim();

    var filtered = reqs.filter(function(r) {
      if (q) {
        var hay = [r.service, r.city, r.assigned_artisan, r.client_name||r.name||r.phone].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fst) {
        if (normalizeStatus(r.status) !== normalizeStatus(fst)) return false;
      }
      if (fcity && !(r.city||'').toLowerCase().includes(fcity)) return false;
      return true;
    }).slice(0, 60); /* cap at 60 rows for perf */

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="fxacc-empty">Aucune demande correspondante</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function(r) {
      var fp = deriveFinalPrice(r);
      return '<tr>'
        + '<td>' + esc(String(r.id||'').slice(-6) || '—') + '</td>'
        + '<td>' + esc(r.service||'—') + '</td>'
        + '<td>' + esc(r.city||'—') + '</td>'
        + '<td>' + esc(r.assigned_artisan||'—') + '</td>'
        + '<td><span class="fxacc-pill ' + _statusPillCls(r.status) + '">' + esc(_statusLabel(r.status)) + '</span></td>'
        + '<td>' + (fp > 0 ? esc(fp.toLocaleString('fr-FR') + ' MAD') : '<span style="opacity:.30">—</span>') + '</td>'
        + '<td>' + _commPill(r) + '</td>'
        + '<td>' + esc(formatDate(r.validated_at||r.created_at)) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderRequestsPanel() {
    var existing = el('fxacc-requests-panel');
    if (existing) {
      /* admin-sb1: keep title count accurate as Supabase cache populates */
      var allReqs = readRequests();
      var titleEl = existing.querySelector('.fxacc-panel-title');
      if (titleEl) titleEl.textContent = 'Toutes les demandes (' + allReqs.length + ')';
      _renderRequestsTable(allReqs);
      return;
    }

    var opsPanel = el('fxacc-ops-panel');
    if (!opsPanel) return;

    var reqs = readRequests();

    var html = '<div id="fxacc-requests-panel">'
      + '<div class="fxacc-panel-title">Toutes les demandes (' + reqs.length + ')</div>'
      + '<div class="fxacc-table-toolbar">'
      + '<input class="fxacc-filter" id="fxacc-req-search" type="text" placeholder="Rechercher service, ville, artisan\u2026" style="flex:1;min-width:160px">'
      + '<select class="fxacc-filter fxacc-filter-select" id="fxacc-req-status">'
      + '<option value="">Tous statuts</option>'
      + '<option value="nouvelle">Nouvelles</option>'
      + '<option value="accept\u00e9e">Accept\u00e9es</option>'
      + '<option value="en_cours">En cours</option>'
      + '<option value="termin\u00e9e">Termin\u00e9es</option>'
      + '<option value="valid\u00e9e">Valid\u00e9es</option>'
      + '<option value="annul\u00e9e">Annul\u00e9es</option>'
      + '</select>'
      + '</div>'
      + '<div class="fxacc-table-wrap">'
      + '<table class="fxacc-table">'
      + '<thead><tr>'
      + '<th>R\u00e9f.</th><th>Service</th><th>Ville</th><th>Artisan</th>'
      + '<th>Statut mission</th><th>Prix</th><th>Commission</th><th>Date</th>'
      + '</tr></thead>'
      + '<tbody id="fxacc-req-tbody"></tbody>'
      + '</table></div></div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    opsPanel.insertAdjacentElement('afterend', div.firstChild);

    _renderRequestsTable(reqs);

    /* Bind filters */
    var searchEl = el('fxacc-req-search');
    var statusEl = el('fxacc-req-status');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        _reqFilter.q = searchEl.value;
        _renderRequestsTable(readRequests());
      });
    }
    if (statusEl) {
      statusEl.addEventListener('change', function() {
        _reqFilter.status = statusEl.value;
        _renderRequestsTable(readRequests());
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     5. ARTISAN OPERATIONAL VISIBILITY
     ════════════════════════════════════════════════════════ */

  function renderArtisansPanel(m) {
    var existing = el('fxacc-artisans-panel');
    if (existing) {
      _rebuildArtisanGrid(m);
      return;
    }

    var reqsPanel = el('fxacc-requests-panel');
    if (!reqsPanel) return;

    var html = '<div id="fxacc-artisans-panel">'
      + '<div class="fxacc-panel-title">Artisans avec missions actives</div>'
      + '<div class="fxacc-artisan-grid" id="fxacc-artisan-grid"></div>'
      + '</div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    reqsPanel.insertAdjacentElement('afterend', div.firstChild);

    _rebuildArtisanGrid(m);
  }

  function _rebuildArtisanGrid(m) {
    var grid = el('fxacc-artisan-grid');
    if (!grid) return;

    var arts = Object.values(m.assignedArtisans);
    if (!arts.length) {
      grid.innerHTML = '<div class="fxacc-empty">Aucun artisan avec mission assign\u00e9e</div>';
      return;
    }

    /* Sort: commDue desc */
    arts.sort(function(a,b){ return (b.commDue - a.commDue) || (b.missions - a.missions); });

    grid.innerHTML = arts.map(function(a) {
      return '<div class="fxacc-artisan-row">'
        + '<div class="fxacc-artisan-name">' + esc(a.name) + '</div>'
        + '<div class="fxacc-artisan-meta">'
        + (a.job  ? '<span>' + esc(a.job)  + '</span>' : '')
        + (a.city ? '<span>\ud83d\udccd ' + esc(a.city) + '</span>' : '')
        + '</div>'
        + '<div class="fxacc-artisan-stats">'
        + '<span class="fxacc-artisan-stat">' + a.missions + ' mission' + (a.missions>1?'s':'') + '</span>'
        + (a.validated > 0 ? '<span class="fxacc-artisan-stat green">' + a.validated + ' valid\u00e9e' + (a.validated>1?'s':'') + '</span>' : '')
        + (a.commDue > 0 ? '<span class="fxacc-artisan-stat amber">Commission due : ' + a.commDue.toLocaleString('fr-FR') + ' MAD</span>' : '')
        + (a.commPaid > 0 ? '<span class="fxacc-artisan-stat green">Pay\u00e9 : ' + a.commPaid.toLocaleString('fr-FR') + ' MAD</span>' : '')
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ════════════════════════════════════════════════════════
     6. COMMISSION HEADER BANNER (cod-orders section)
     ════════════════════════════════════════════════════════ */

  function renderCommissionHeader(m) {
    var section = el('admin-section-cod-orders');
    if (!section) return;

    var existing = el('fxacc-commission-header');
    if (existing) {
      _updateCommissionHeader(existing, m);
      return;
    }

    var h2 = section.querySelector('h2');
    if (!h2) return;

    var div = document.createElement('div');
    div.id = 'fxacc-commission-header';
    _updateCommissionHeader(div, m);
    h2.insertAdjacentElement('afterend', div);
  }

  function _updateCommissionHeader(div, m) {
    var allPaid = m.commissionsDue === 0 && m.pendingReview === 0 && m.commissionsPaid > 0;
    div.className = allPaid ? 'all-paid' : '';

    var leftHtml = '';
    var amountHtml = '';

    if (allPaid) {
      leftHtml = '<div class="fxacc-ch-left">'
        + '<div><div class="fxacc-ch-label">\u2713 Toutes les commissions r\u00e9gl\u00e9es</div>'
        + '<div class="fxacc-ch-sub">' + m.validated + ' mission' + (m.validated>1?'s':'') + ' valid\u00e9e' + (m.validated>1?'s':'') + '</div></div>'
        + '</div>';
      amountHtml = '<div class="fxacc-ch-amount" style="color:#20c997">' + esc(formatMoney(m.commissionsPaid)) + '</div>';
    } else if (m.commissionsDue > 0) {
      leftHtml = '<div class="fxacc-ch-left">'
        + '<div><div class="fxacc-ch-label">Commissions \u00e0 r\u00e9gler</div>'
        + '<div class="fxacc-ch-sub">' + m.validated + ' mission' + (m.validated>1?'s':'') + ' valid\u00e9e' + (m.validated>1?'s':'')
        + (m.pendingReview > 0 ? ' &middot; ' + m.pendingReview + ' \u00e0 \u00e9valuer' : '')
        + '</div></div>'
        + '</div>';
      amountHtml = '<div class="fxacc-ch-amount">' + esc(formatMoney(m.commissionsDue)) + '</div>';
    } else if (m.pendingReview > 0) {
      leftHtml = '<div class="fxacc-ch-left">'
        + '<div><div class="fxacc-ch-label" style="color:#6c8ff5">' + m.pendingReview + ' commission' + (m.pendingReview>1?'s':'') + ' \u00e0 \u00e9valuer</div>'
        + '<div class="fxacc-ch-sub">Prix manquant \u2014 requ\u00e8rent \u00e9valuation manuelle</div></div>'
        + '</div>';
      amountHtml = '';
    } else {
      /* No commissions at all yet */
      leftHtml = '<div class="fxacc-ch-left">'
        + '<div><div class="fxacc-ch-label" style="opacity:.45">Aucune commission en attente</div>'
        + '<div class="fxacc-ch-sub">Les commissions appara\u00eetront d\u00e8s qu\u2019une mission sera valid\u00e9e par un client</div></div>'
        + '</div>';
      amountHtml = '';
    }

    div.innerHTML = leftHtml + amountHtml;
  }

  /* ════════════════════════════════════════════════════════
     MAIN RENDER
     ════════════════════════════════════════════════════════ */

  function renderAll() {
    var m = computeMetrics();
    updateOverviewKPIs(m);
    renderLifecyclePanel(m);
    renderOpsPanel(m);
    renderRequestsPanel();   /* creates once, then just re-renders table */
    renderArtisansPanel(m);
    renderCommissionHeader(m);
  }

  /* ════════════════════════════════════════════════════════
     EVENTS + INIT
     ════════════════════════════════════════════════════════ */

  function bindEvents() {
    var events = [
      'fixeo:client-request-updated',
      'fixeo:client-request-created',
      'fixeo:missions:updated',
      'fixeo:commission-updated',
      'fixeo:commission-paid',
      'fixeo:state:updated'
    ];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() { setTimeout(renderAll, 120); });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === STORAGE_KEY) setTimeout(renderAll, 80);
    });
    /* admin-sb1: refresh Supabase cache in parallel with the 45s renderAll cycle */
    setInterval(function() { _fetchSupabaseRequests(); renderAll(); }, 45000);
  }

  function init() {
    if (!document.body || document.body.dataset.dashType !== 'admin') return;
    setTimeout(function() {
      renderAll();
      bindEvents();
      /* admin-sb1: first Supabase fetch — delayed 800ms so auth session
       * has time to hydrate (fixeo-auth-supabase.js runs async on load) */
      setTimeout(_fetchSupabaseRequests, 800);
    }, 350);
    /* Safety re-render at 1.5s for late-loading admin data */
    setTimeout(renderAll, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

})();
