/* ============================================================
   FIXEO — COMMISSION LIFECYCLE PHASE 3A
   js/commission-lifecycle-p3a.js

   OBJECTIVE: Persist commission fields on validation + show
   artisan a clean commission due/paid/review card.

   SCOPE:
   1. On fixeo:mission-validated / fixeo:client-request-updated /
      page load → persist final_price + commission_amount +
      commission_status + commission_rate + artisan_net +
      commission_calculated_at + commission_pending_review
      for all validée/intervention_confirmée requests.

   2. Render .fxcl3a-* commission cards in #fxcl3a-commission-wrap
      (inside #fxmlp2-artisan-missions, injected by mission-lifecycle-p2.js).

   3. Render compact overview pill in #fxcl3a-overview-pill
      (injected after fxadp2-readiness in overview section).

   RULES:
   - NEVER overwrite commission_status if already 'payée'
   - NEVER overwrite commission_paid_at if already set
   - NEVER invent prices
   - commission_rate = 0.15 always
   - budget string → parseMoney → final_price if not already set
   - commission_pending_review = true when final_price still 0

   Guard: window._fxCl3aLoaded (idempotent)
   Namespace: .fxcl3a-*
   Storage key: fixeo_client_requests
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxCl3aLoaded) return;
  window._fxCl3aLoaded = true;

  /* ── Only run on artisan dashboard ─────────────────────── */
  if (!window.location.pathname.toLowerCase().includes('dashboard-artisan')) return;

  /* ── Constants ───────────────────────────────────────────── */
  var STORAGE_KEY     = 'fixeo_client_requests';
  var COMMISSION_RATE = 0.15;
  var ACTIVE_STATUSES = ['valid\u00e9e', 'intervention_confirm\u00e9e'];

  /* ── Helpers ─────────────────────────────────────────────── */
  function el(id)    { return document.getElementById(id); }
  function ls(k,fb)  { try { return localStorage.getItem(k) || fb || ''; } catch(e){ return fb||''; } }
  function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function roundMoney(n) { return Math.round(Number(n||0)); }

  function dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch(e) {}
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try { return new Date(isoStr).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); }
    catch(e) { return ''; }
  }

  function formatMAD(n) {
    var v = roundMoney(n);
    return v > 0 ? v.toLocaleString('fr-FR') + ' MAD' : '—';
  }

  /* ── parseMoney (mirrors store logic) ────────────────────── */
  function parseMoney(value) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return roundMoney(value);
    var matches = String(value || '').match(/\d+[\d\s.,]*/g) || [];
    if (!matches.length) return 0;
    var numbers = matches
      .map(function(m){ return parseFloat(m.replace(/\s/g,'').replace(',','.')); })
      .filter(function(n){ return isFinite(n) && n > 0; });
    if (!numbers.length) return 0;
    var avg = numbers.reduce(function(s,n){ return s+n; }, 0) / numbers.length;
    return roundMoney(avg);
  }

  function deriveFinalPrice(raw) {
    var explicit = roundMoney(raw.final_price || raw.price || raw.agreed_price || raw.budget_value || 0);
    if (explicit > 0) return explicit;
    return parseMoney(raw.budget || raw.price_label || '');
  }

  function normalizeStatus(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    if (n === 'validee' || n === 'valide') return 'valid\u00e9e';
    if (n === 'intervention confirmee' || n === 'intervention_confirmee' || n === 'intervention confirmee') return 'intervention_confirm\u00e9e';
    return s || '';
  }

  /* ── Read / write raw localStorage ──────────────────────── */
  function readRaw() {
    try { var a = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); return Array.isArray(a)?a:[]; }
    catch(e){ return []; }
  }
  function writeRaw(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch(e){}
  }

  /* ── Get artisan identity (same logic as P4 / P2 lifecycle) ── */
  function artisanIdFromProfile() {
    var id = ls('user_id', ls('fixeo_user_id', '')).trim();
    if (id) return id;
    var city = ls('user_city','').toLowerCase().replace(/\s+/g,'_');
    var job  = ls('user_job','').toLowerCase().replace(/\s+/g,'_');
    return (city && job) ? (job + '|' + city) : '';
  }

  function artisanNameFromProfile() {
    return ls('user_name', ls('fixeo_user_name', '')).trim();
  }

  /* ════════════════════════════════════════════════════════
     PERSIST COMMISSION FIELDS
     ════════════════════════════════════════════════════════ */

  /* Check if a raw request needs commission fields persisted */
  function needsPersist(raw) {
    var st = normalizeStatus(raw.status);
    if (!ACTIVE_STATUSES.includes(st)) return false;
    // Already fully persisted with paid commission — never overwrite
    if (raw.commission_paid === true || raw.commission_status === 'pay\u00e9e') return false;
    // Needs persist if commission fields are missing/stale
    return !(raw.commission_calculated_at && Number(raw.commission_amount||0) > 0)
        && !(raw.commission_pending_review === true && raw.commission_calculated_at);
  }

  /* Persist commission fields for one raw request object */
  function applyCommissionFields(raw) {
    var finalPrice = deriveFinalPrice(raw);
    var hasFinalPrice = finalPrice > 0;
    var commissionAmount = hasFinalPrice ? roundMoney(finalPrice * COMMISSION_RATE) : 0;
    var artisanNet = hasFinalPrice ? (finalPrice - commissionAmount) : 0;
    var commissionStatus = hasFinalPrice ? '\u00e0_payer' : '';
    var pendingReview = !hasFinalPrice;

    // Merge: only write fields that are truly missing/stale
    // Never touch paid fields
    var patch = {
      final_price:             finalPrice,
      commission_amount:       commissionAmount,
      commission_status:       commissionStatus,
      commission_rate:         COMMISSION_RATE,
      commission_paid:         false,
      commission_paid_at:      '',
      commission_paid_by:      '',
      artisan_net:             artisanNet,
      commission_pending_review: pendingReview,
      commission_calculated_at: new Date().toISOString()
    };

    // Safety: if paid fields already exist in raw, never overwrite them
    if (raw.commission_status === 'pay\u00e9e' || raw.commission_paid === true) {
      delete patch.commission_status;
      delete patch.commission_paid;
      delete patch.commission_paid_at;
      delete patch.commission_paid_by;
      return raw; // fully paid — never touch
    }

    return Object.assign({}, raw, patch);
  }

  /* Main backfill/persist runner */
  function persistCommissionFields() {
    var list = readRaw();
    var changed = false;
    var next = list.map(function(raw) {
      if (!needsPersist(raw)) return raw;
      var updated = applyCommissionFields(raw);
      changed = true;
      return updated;
    });
    if (changed) {
      writeRaw(next);
      dispatch('fixeo:commission-updated', { source: 'p3a-backfill' });
      dispatch('fixeo:state:updated', { event: 'commission-persisted' });
    }
    return changed;
  }

  /* ════════════════════════════════════════════════════════
     READ ARTISAN'S COMMISSION MISSIONS
     ════════════════════════════════════════════════════════ */

  function getArtisanCommissionMissions() {
    var myId   = artisanIdFromProfile();
    var myName = artisanNameFromProfile().toLowerCase();

    return readRaw().filter(function(r) {
      // Must be a completed/validated mission
      var st = normalizeStatus(r.status);
      if (!ACTIVE_STATUSES.includes(st)) return false;
      // Must be assigned to this artisan
      var rId   = String(r.assigned_artisan_id||'').trim();
      var rName = String(r.assigned_artisan||'').trim().toLowerCase();
      return (myId && rId && rId === myId) || (myName && rName && rName === myName);
    }).sort(function(a,b){
      return (Date.parse(b.validated_at||b.created_at||'')||0) - (Date.parse(a.validated_at||a.created_at||'')||0);
    });
  }

  /* ════════════════════════════════════════════════════════
     RENDER — COMMISSION CARD
     ════════════════════════════════════════════════════════ */

  function _renderCard(r) {
    var fp   = roundMoney(r.final_price || 0);
    var ca   = roundMoney(r.commission_amount || 0);
    var net  = roundMoney(r.artisan_net || (fp > 0 ? fp - ca : 0));
    var st   = String(r.commission_status || '').trim();
    var pr   = r.commission_pending_review === true;
    var svc  = esc(r.service || 'Intervention');
    var city = esc(r.city || 'Maroc');
    var date = esc(formatDate(r.validated_at || r.completed_at || r.created_at));
    var id   = esc(String(r.id));

    /* Determine state */
    var isPaid   = (st === 'pay\u00e9e' || r.commission_paid === true);
    var isReview = (pr && !isPaid && ca === 0);
    var isDue    = (!isPaid && !isReview && ca > 0);

    var stateCls = isPaid ? 'state-paid' : isReview ? 'state-review' : 'state-due';

    var badgeHtml = isPaid
      ? '<span class="fxcl3a-badge paid">\u2713 Commission r\u00e9gl\u00e9e</span>'
      : isReview
      ? '<span class="fxcl3a-badge review">\u29d7 \u00c0 \u00e9valuer</span>'
      : '<span class="fxcl3a-badge due">\u25cf Commission \u00e0 r\u00e9gler</span>';

    /* Price breakdown */
    var breakdownHtml = '';
    if (fp > 0) {
      var highlightCls = isPaid ? 'highlight paid-chip' : 'highlight';
      breakdownHtml = '<div class="fxcl3a-breakdown">'
        + '<div class="fxcl3a-price-chip"><span>Prix final</span><strong>' + esc(formatMAD(fp)) + '</strong></div>'
        + '<div class="fxcl3a-price-chip ' + highlightCls + '"><span>Commission Fixeo\u00a0(15%)</span><strong>' + esc(formatMAD(ca)) + '</strong></div>'
        + '<div class="fxcl3a-price-chip"><span>Gain artisan</span><strong>' + esc(formatMAD(net)) + '</strong></div>'
        + '</div>';
    }

    /* Explanation / status note */
    var noteHtml = '';
    if (isDue) {
      noteHtml = '<div class="fxcl3a-explanation">Le client vous paie directement apr\u00e8s l\u2019intervention. La commission Fixeo est \u00e0 r\u00e9gler s\u00e9par\u00e9ment \u00e0 Fixeo.</div>';
    } else if (isPaid) {
      var paidDate = r.commission_paid_at ? esc(formatDate(r.commission_paid_at)) : '';
      noteHtml = paidDate
        ? '<div class="fxcl3a-paid-date">\u2713 R\u00e9gl\u00e9e le ' + paidDate + '</div>'
        : '<div class="fxcl3a-paid-date">\u2713 Commission r\u00e9gl\u00e9e</div>';
    } else if (isReview) {
      noteHtml = '<div class="fxcl3a-review-note">Le prix final n\u2019a pas \u00e9t\u00e9 renseign\u00e9. L\u2019\u00e9quipe Fixeo contactera l\u2019artisan pour convenir du montant.</div>';
    }

    return '<div class="fxcl3a-card ' + stateCls + '" data-mission-id="' + id + '">'
      + '<div class="fxcl3a-card-head">'
      + '<div>'
      + '<div class="fxcl3a-card-service">' + svc + '</div>'
      + '<div class="fxcl3a-card-meta">'
      + '<span>\ud83d\udccd ' + city + '</span>'
      + (date ? '<span>\u00b7 Valid\u00e9e le ' + date + '</span>' : '')
      + '</div>'
      + '</div>'
      + badgeHtml
      + '</div>'
      + breakdownHtml
      + noteHtml
      + '</div>';
  }

  /* ════════════════════════════════════════════════════════
     RENDER — MAIN COMMISSION SECTION
     ════════════════════════════════════════════════════════ */

  function _renderCommissionSection() {
    var wrap = el('fxcl3a-commission-wrap');
    if (!wrap) return;

    var missions = getArtisanCommissionMissions();
    if (!missions.length) {
      wrap.innerHTML = ''; // nothing — don't clutter
      return;
    }

    var cardsHtml = missions.map(_renderCard).join('');

    wrap.innerHTML = '<div class="fxcl3a-section-title">Commissions Fixeo</div>'
      + cardsHtml;
  }

  /* ════════════════════════════════════════════════════════
     RENDER — OVERVIEW PILL
     ════════════════════════════════════════════════════════ */

  function _renderOverviewPill() {
    var pill = el('fxcl3a-overview-pill');
    if (!pill) return;

    var missions = getArtisanCommissionMissions();
    if (!missions.length) {
      pill.className = 'state-empty';
      return;
    }

    /* Compute totals */
    var due     = 0;
    var paid    = 0;
    var review  = 0;
    missions.forEach(function(r) {
      var ca = roundMoney(r.commission_amount || 0);
      if (r.commission_paid === true || r.commission_status === 'pay\u00e9e') {
        paid += ca;
      } else if (r.commission_pending_review === true && ca === 0) {
        review++;
      } else {
        due += ca;
      }
    });

    if (due > 0) {
      pill.className = 'state-due';
      pill.innerHTML = '<div class="fxcl3a-pill-icon">\ud83d\udcb8</div>'
        + '<div class="fxcl3a-pill-body">'
        + '<div class="fxcl3a-pill-label">Commission \u00e0 r\u00e9gler</div>'
        + '<div class="fxcl3a-pill-sub">' + missions.length + ' mission' + (missions.length > 1 ? 's' : '') + ' valid\u00e9e' + (missions.length > 1 ? 's' : '') + '</div>'
        + '</div>'
        + '<div class="fxcl3a-pill-amount">' + esc(formatMAD(due)) + '</div>';
    } else if (review > 0) {
      pill.className = 'state-review';
      pill.innerHTML = '<div class="fxcl3a-pill-icon">\u29d7</div>'
        + '<div class="fxcl3a-pill-body">'
        + '<div class="fxcl3a-pill-label" style="color:#6c8ff5">' + review + ' commission' + (review > 1 ? 's' : '') + ' \u00e0 \u00e9valuer</div>'
        + '<div class="fxcl3a-pill-sub">L\u2019\u00e9quipe Fixeo vous contactera</div>'
        + '</div>';
    } else {
      pill.className = 'state-all-paid';
      pill.innerHTML = '<div class="fxcl3a-pill-icon">\u2713</div>'
        + '<div class="fxcl3a-pill-body">'
        + '<div class="fxcl3a-pill-label">Toutes les commissions r\u00e9gl\u00e9es</div>'
        + '<div class="fxcl3a-pill-sub">' + missions.length + ' mission' + (missions.length > 1 ? 's' : '') + ' valid\u00e9e' + (missions.length > 1 ? 's' : '') + '</div>'
        + '</div>'
        + '<div class="fxcl3a-pill-amount" style="color:#20c997">' + esc(formatMAD(paid)) + '</div>';
    }
  }

  /* ════════════════════════════════════════════════════════
     DOM INJECTION
     ════════════════════════════════════════════════════════ */

  /* Create #fxcl3a-commission-wrap inside #fxmlp2-artisan-missions
     (rendered by mission-lifecycle-p2.js) */
  function _createCommissionWrap() {
    if (el('fxcl3a-commission-wrap')) return;
    var missions = el('fxmlp2-artisan-missions');
    if (!missions) return;
    var wrap = document.createElement('div');
    wrap.id = 'fxcl3a-commission-wrap';
    missions.appendChild(wrap);
  }

  /* Create #fxcl3a-overview-pill in overview section
     Injected after #fxadp2-readiness if it exists, otherwise after any P2 block */
  function _createOverviewPill() {
    if (el('fxcl3a-overview-pill')) return;
    var wrap = el('fxadp2-overview-wrap');
    if (!wrap) return;
    var pill = document.createElement('div');
    pill.id = 'fxcl3a-overview-pill';
    pill.className = 'state-empty'; // hidden until render decides
    // Insert after fxadp2-readiness if it exists
    var readiness = el('fxadp2-readiness');
    if (readiness && readiness.parentNode === wrap) {
      readiness.insertAdjacentElement('afterend', pill);
    } else {
      wrap.appendChild(pill);
    }
  }

  /* ════════════════════════════════════════════════════════
     MAIN RENDER
     ════════════════════════════════════════════════════════ */

  function render() {
    _createCommissionWrap();
    _createOverviewPill();
    _renderCommissionSection();
    _renderOverviewPill();
  }

  /* ════════════════════════════════════════════════════════
     EVENT WIRING + INIT
     ════════════════════════════════════════════════════════ */

  function _bindEvents() {
    var events = [
      'fixeo:mission-validated',
      'fixeo:client-request-updated',
      'fixeo:state:updated',
      'fixeo:commission-paid',
      'fixeo:commission-updated',
      'fixeo:missions:updated'
    ];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() {
        persistCommissionFields();
        setTimeout(render, 150);
      });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === STORAGE_KEY) {
        persistCommissionFields();
        setTimeout(render, 100);
      }
    });
    setInterval(function() {
      persistCommissionFields();
      render();
    }, 60000);
  }

  function init() {
    // 1. Backfill existing validée missions immediately
    persistCommissionFields();

    // 2. Wait for P2 lifecycle module to inject #fxmlp2-artisan-missions
    //    P2 runs at 250ms; we run at 400ms to be safe
    setTimeout(function() {
      render();
      _bindEvents();
    }, 400);

    // 3. Re-render at 1200ms in case P2 had async content
    setTimeout(render, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
