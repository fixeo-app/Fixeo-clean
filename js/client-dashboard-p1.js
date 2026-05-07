/* ============================================================
   FIXEO — CLIENT DASHBOARD PHASE 1 — REAL REQUEST SYNC
   js/client-dashboard-p1.js

   Reads real client requests from fixeo_client_requests
   and renders them into #fxclp1-ls-requests below
   the existing #client-requests-list (Supabase section).

   - Owns a dedicated container — never touches Supabase renderer
   - Matches requests to current user via phone or name
   - Shows 4-step timeline: published → assigned → in progress → done
   - Shows artisan assignment block when status='acceptée'
   - 'Confirmer la fin' CTA: dispatches data-bridge-action='client-validate'
   - Listens for fixeo:client-request-updated + storage events
   - Hides Supabase empty-state when real LS cards exist
   - Zero fake data, zero Supabase calls, zero auth changes

   Guard: window._fxClP1Loaded (idempotent)
   Namespace: .fxclp1-*
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxClP1Loaded) return;
  window._fxClP1Loaded = true;

  /* ── Constants ───────────────────────────────────────── */
  var REQUESTS_KEY = 'fixeo_client_requests';
  var CONTAINER_ID = 'fxclp1-ls-requests';

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id)       { return document.getElementById(id); }
  function ls(k, fb)    { try { return localStorage.getItem(k) || fb || ''; } catch(e){ return fb || ''; } }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail||{} })); } catch(e){}
  }

  function relativeTime(isoStr) {
    var ms = Date.now() - (Date.parse(isoStr||'')||0);
    var s = ms/1000;
    if (s < 60)    return 'Il y a quelques secondes';
    if (s < 3600)  return 'Il y a ' + Math.round(s/60) + ' min';
    if (s < 86400) return 'Il y a ' + Math.round(s/3600) + ' h';
    return 'Il y a ' + Math.round(s/86400) + ' j';
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    } catch(e){ return ''; }
  }

  function normalizeText(s) {
    return String(s||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }

  /* ── Read current user identity ─────────────────────── */
  function getIdentity() {
    return {
      phone: ls('user_phone', ls('fixeo_user_phone', '')).replace(/\D/g,'').slice(-9),
      name:  normalizeText(ls('user_name', ls('fixeo_user_name', '')))
    };
  }

  /* ── Read requests ───────────────────────────────────── */
  function readRequests() {
    try {
      var arr = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch(e){ return []; }
  }

  /* ── Write requests ──────────────────────────────────── */
  function writeRequests(list) {
    try { localStorage.setItem(REQUESTS_KEY, JSON.stringify(list)); } catch(e){}
  }

  /* ── Match requests to current user ─────────────────── */
  function getMyRequests(identity) {
    var all = readRequests();
    // If no identity, show all (first-time user may not have profile yet)
    var hasIdentity = identity.phone.length >= 7 || identity.name.length >= 2;
    if (!hasIdentity) return all.slice().sort(_sortNewestFirst);

    return all.filter(function(r) {
      var rPhone = String(r.phone||r.telephone||'').replace(/\D/g,'').slice(-9);
      var rName  = normalizeText(r.client_name || r.client || '');
      var phoneMatch = identity.phone && rPhone && rPhone === identity.phone;
      var nameMatch  = identity.name.length >= 2 && rName && rName === identity.name;
      return phoneMatch || nameMatch;
    }).sort(_sortNewestFirst);
  }

  function _sortNewestFirst(a, b) {
    return (Date.parse(b.created_at||'')||0) - (Date.parse(a.created_at||'')||0);
  }

  /* ── Status → display config ─────────────────────────── */
  function statusConfig(status) {
    var n = normalizeText(status || 'nouvelle');
    if (n === 'acceptee' || n === 'accepte')
      return { label: 'Artisan assign\u00e9',  cls: 'accepted',    cardCls: 'status-accepted',     step: 1 };
    if (n === 'en cours' || n === 'en_cours' || n === 'encours')
      return { label: 'En cours',               cls: 'in-progress', cardCls: 'status-in-progress',  step: 2 };
    if (n === 'terminee' || n === 'termine')
      return { label: 'Intervention termin\u00e9e', cls: 'done',   cardCls: 'status-done',          step: 3 };
    if (n === 'validee' || n === 'valide' || n === 'intervention confirmee' || n === 'intervention_confirmee')
      return { label: 'Mission cl\u00f4tur\u00e9e', cls: 'validated', cardCls: 'status-validated',  step: 4 };
    if (n === 'annulee' || n === 'annule')
      return { label: 'Annul\u00e9e',          cls: 'cancelled',   cardCls: '',                     step: -1 };
    // nouvelle / disponible / default
    return   { label: 'En attente d\u2019artisan', cls: 'waiting', cardCls: '',                     step: 0 };
  }

  /* ── 4-step timeline ─────────────────────────────────── */
  function renderTimeline(step) {
    var steps = [
      { label: 'Publi\u00e9e', icon: '\u2713' },
      { label: 'Artisan assign\u00e9', icon: '\u{1f477}' },
      { label: 'Intervention', icon: '\u{1f527}' },
      { label: 'Confirm\u00e9e', icon: '\u2713' }
    ];

    return '<div class="fxclp1-timeline">'
      + steps.map(function(s, i) {
          var state = i < step ? 'ts-done' :
                      i === step ? 'ts-active' : '';
          var extraCls = '';
          if (i === 1 && step >= 1) extraCls = ' step-accepted';
          if (i === 3 && step >= 3) extraCls = ' step-done';
          var icon = i < step ? '\u2713' : (i + 1);
          return '<div class="fxclp1-tstep ' + state + extraCls + '">'
            + '<div class="fxclp1-tdot">' + icon + '</div>'
            + '<div class="fxclp1-tlabel">' + esc(s.label) + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  /* ── Artisan assigned block ──────────────────────────── */
  function renderArtisanBlock(r) {
    if (!r.assigned_artisan) return '';
    var name = esc(r.assigned_artisan);
    var since = r.accepted_at ? formatDate(r.accepted_at) : '';
    return '<div class="fxclp1-artisan-block">'
      + '<div class="fxclp1-artisan-avatar">\ud83d\udc77</div>'
      + '<div class="fxclp1-artisan-body">'
      + '<div class="fxclp1-artisan-name">' + name + '</div>'
      + '<div class="fxclp1-artisan-sub">' + (since ? 'Assign\u00e9 le ' + esc(since) : 'Artisan confirm\u00e9') + '</div>'
      + '</div>'
      + '<div class="fxclp1-artisan-contact">Il vous contactera</div>'
      + '</div>';
  }

  /* ── Contact hint (no phone available) ──────────────── */
  function renderContactHint(step) {
    if (step < 1) return '';
    return '<div class="fxclp1-contact-hint">'
      + '\u2139\ufe0f L\u2019artisan vous contactera directement pour planifier l\u2019intervention.'
      + '</div>';
  }

  /* ── Action row ──────────────────────────────────────── */
  function renderActions(r, step) {
    var id = esc(String(r.id));
    var artisanName = esc(r.assigned_artisan || '');

    // Validated — no more actions
    if (step >= 4) {
      return '<div class="fxclp1-actions">'
        + '<span class="fxclp1-validated-label">\u2713 Mission cl\u00f4tur\u00e9e</span>'
        + '</div>';
    }

    // Terminée — client must confirm
    if (step === 3) {
      return '<div class="fxclp1-actions">'
        + '<button class="fxclp1-btn-validate" '
        + 'data-bridge-action="client-validate" '
        + 'data-request-id="' + id + '" '
        + 'data-mission-id="' + id + '" '
        + 'data-artisan-name="' + artisanName + '">'
        + '\u2713 Confirmer la fin de mission'
        + '</button>'
        + '</div>';
    }

    // No primary action while pending/in progress
    return '';
  }

  /* ── Full request card ───────────────────────────────── */
  function renderCard(r) {
    var sc       = statusConfig(r.status);
    var isUrgent = /urgent/i.test(r.urgency||'');
    var cardCls  = 'fxclp1-card ' + sc.cardCls + (isUrgent && sc.step === 0 ? ' status-urgent' : '');

    var urgentBadge = isUrgent
      ? '<span class="fxclp1-badge urgent">\u26a1 Urgent</span>'
      : '';

    var html = '<div class="' + cardCls + '">'
      // Top row
      + '<div class="fxclp1-card-top">'
      + '<div class="fxclp1-card-left">'
      + '<div class="fxclp1-card-service">' + esc(r.service || 'Demande client') + '</div>'
      + '<div class="fxclp1-card-meta">'
      + '<span>\ud83d\udccd ' + esc(r.city || 'Maroc') + '</span>'
      + (r.budget ? '<span>\ud83d\udcb0 ' + esc(r.budget) + '</span>' : '')
      + urgentBadge
      + '</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">'
      + '<span class="fxclp1-badge ' + sc.cls + '">' + sc.label + '</span>'
      + '<span class="fxclp1-card-time">' + esc(relativeTime(r.created_at)) + '</span>'
      + '</div>'
      + '</div>';

    // Description
    if (r.description && r.description !== 'Description \u00e0 pr\u00e9ciser') {
      html += '<div class="fxclp1-card-desc">' + esc(r.description) + '</div>';
    }

    // Timeline
    html += renderTimeline(sc.step);

    // Artisan block (if assigned)
    if (r.assigned_artisan) {
      html += renderArtisanBlock(r);
    } else if (sc.step === 0) {
      html += renderContactHint(-1); // nothing while waiting
    }

    // Contact hint for accepted/in-progress
    if (sc.step >= 1 && sc.step < 4 && !r.assigned_artisan) {
      html += renderContactHint(sc.step);
    }

    // Actions
    html += renderActions(r, sc.step);

    html += '</div>';
    return html;
  }

  /* ── Show/hide Supabase empty block ──────────────────── */
  function syncEmptyState(hasRequests) {
    var smartCta = el('fixeo-smart-cta');
    if (!smartCta) return;
    if (hasRequests) {
      smartCta.style.display = 'none';
      document.body.classList.add('fxclp1-has-requests');
    } else {
      // Only restore if Supabase #client-requests-list is also empty
      var supabaseList = el('client-requests-list');
      var supabaseHasContent = supabaseList && supabaseList.dataset.real === '1'
        && supabaseList.children.length > 0
        && !supabaseList.querySelector('[style*="Aucune demande"]')
        && !supabaseList.querySelector('[style*="Chargement"]');
      if (!supabaseHasContent) {
        smartCta.style.display = '';
      }
      document.body.classList.remove('fxclp1-has-requests');
    }
  }

  /* ── Main render ─────────────────────────────────────── */
  function render() {
    var container = el(CONTAINER_ID);
    if (!container) return;

    var identity = getIdentity();
    var requests = getMyRequests(identity);

    if (requests.length === 0) {
      container.innerHTML = '';
      syncEmptyState(false);
      return;
    }

    var html = '<div class="fxclp1-header">'
      + '<h3 class="fxclp1-header-title">Mes demandes <span class="fxclp1-count">' + requests.length + '</span></h3>'
      + '</div>';

    requests.forEach(function(r) {
      html += renderCard(r);
    });

    container.innerHTML = html;
    syncEmptyState(true);
  }

  /* ── 'Confirmer la fin' button listener ──────────────── */
  function bindConfirm() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-bridge-action="client-validate"]');
      if (!btn) return;
      var reqId       = btn.dataset.requestId || btn.dataset.missionId;
      var artisanName = btn.dataset.artisanName || '';
      if (!reqId) return;

      // Use state bridge if available
      if (window.FixeoStateBridge && typeof window.FixeoStateBridge.clientValidateMission === 'function') {
        var artisanId = ls('user_id', ls('fixeo_user_id', ''));
        window.FixeoStateBridge.clientValidateMission(reqId, artisanName, artisanId);
      } else {
        // Fallback: write directly
        var list = readRequests();
        list.forEach(function(r, i) {
          if (String(r.id) !== String(reqId)) return;
          list[i] = Object.assign({}, r, {
            status: 'valid\u00e9e',
            client_confirmation: 'confirm\u00e9e',
            validated_at: new Date().toISOString()
          });
        });
        writeRequests(list);
        dispatch('fixeo:client-request-updated', { id: reqId });
        dispatch('fixeo:state:updated', { event: 'client-validated' });
      }

      if (window.notifications && window.notifications.success) {
        window.notifications.success('Mission valid\u00e9e !', 'Merci. La mission est maintenant cl\u00f4tur\u00e9e.');
      }
      setTimeout(render, 150);
    });
  }

  /* ── Event listeners ─────────────────────────────────── */
  function bindListeners() {
    // Re-render when artisan accepts (from P4) or any request changes
    window.addEventListener('fixeo:client-request-updated', function() {
      setTimeout(render, 100);
    });
    window.addEventListener('fixeo:client-request-created', function() {
      setTimeout(render, 100);
    });
    window.addEventListener('fixeo:state:updated', function() {
      setTimeout(render, 150);
    });
    // Cross-tab: artisan accepted on another tab/page
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY) setTimeout(render, 100);
    });
    // Auto-refresh every 30s (catch cross-device accept)
    setInterval(render, 30000);
  }

  /* ── Create container ────────────────────────────────── */
  function createContainer() {
    if (el(CONTAINER_ID)) return; // already exists
    var afterEl = el('client-requests-list');
    if (!afterEl) return;
    var wrap = document.createElement('div');
    wrap.id = CONTAINER_ID;
    afterEl.parentNode.insertBefore(wrap, afterEl.nextSibling);
  }

  /* ── INIT ────────────────────────────────────────────── */
  function init() {
    createContainer();
    // Defer to let fixeo-mvp-supabase.js finish Phase 0 first
    setTimeout(function() {
      render();
      bindListeners();
      bindConfirm();
    }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
