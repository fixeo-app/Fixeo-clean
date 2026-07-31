/* ═══════════════════════════════════════════════════════════════════
   FIXEO — FXCONFIRM-FLAGSHIP-V1
   Additive presentation enhancer for confirmation.html
   Namespace : fxcf-*
   Version   : ?v=fxcf-v1
   Strategy  : Runs after existing injectOrderDetails() completes.
               Patches display strings only. Zero operational changes.
               All existing scripts, IDs, localStorage reads, Supabase
               calls, timeline state logic, and WA message builder
               remain 100% untouched.
   Safety    : IIFE + idempotency guard + all patches in _try()
   ═══════════════════════════════════════════════════════════════════ */
(function (window, document) {
  'use strict';

  /* ── Idempotency guard ─────────────────────────────────────────── */
  if (window._fxcfLoaded) return;
  window._fxcfLoaded = true;

  /* ── Fail-safe wrapper ─────────────────────────────────────────── */
  function _try(label, fn) {
    try { fn(); } catch (e) {
      /* Silent — never break existing flow */
    }
  }

  /* ════════════════════════════════════════════════════════════════
     A. TOPBAR — sticky brand + "Coordination en cours" status pill
     Inserted as first child of <body> so it appears above everything.
  ════════════════════════════════════════════════════════════════════ */
  function _injectTopbar() {
    _try('topbar', function () {
      if (document.querySelector('.fxcf-topbar')) return; /* idempotent */
      var bar = document.createElement('header');
      bar.className = 'fxcf-topbar';
      bar.setAttribute('role', 'banner');
      bar.innerHTML =
        '<a href="index.html" class="fxcf-brand" aria-label="Fixeo — Retour à l\'accueil">' +
          'FIX<em>EO</em>' +
          '<div class="fxcf-brand-sub">Artisans de confiance</div>' +
        '</a>' +
        '<div class="fxcf-status-pill" role="status" aria-live="polite">' +
          'Coordination en cours' +
        '</div>';
      document.body.insertBefore(bar, document.body.firstChild);
      document.body.classList.add('fxcf-active');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     B. TITLE PATCH
     "Intervention coordonnée" → "Demande <span>enregistrée</span>"
     We patch the textContent only if it still contains the original string.
  ════════════════════════════════════════════════════════════════════ */
  function _patchTitle() {
    _try('title', function () {
      var el = document.querySelector('.conf-title');
      if (!el) return;
      if (el.getAttribute('data-fxcf-patched')) return;
      el.innerHTML = 'Demande <span class="fxcf-title-accent">enregistrée</span>';
      el.setAttribute('data-fxcf-patched', '1');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     C. ICON PATCH
     ✅ green → 📡 teal (coordination framing, not completion)
  ════════════════════════════════════════════════════════════════════ */
  function _patchIcon() {
    _try('icon', function () {
      var el = document.querySelector('.conf-icon-wrap');
      if (!el || el.getAttribute('data-fxcf-patched')) return;
      el.textContent = '📡';
      el.setAttribute('data-fxcf-patched', '1');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     D. PAYMENT METHOD BADGE
     Original .conf-method-badge is hidden by CSS.
     We inject a corrected .fxcf-payment-pill after the subtitle.
  ════════════════════════════════════════════════════════════════════ */
  function _injectPaymentPill() {
    _try('payment-pill', function () {
      if (document.querySelector('.fxcf-payment-pill')) return; /* idempotent */
      var subtitle = document.querySelector('.conf-subtitle');
      if (!subtitle) return;
      var pill = document.createElement('div');
      pill.className = 'fxcf-payment-pill';
      pill.setAttribute('role', 'note');
      pill.textContent = 'Règlement en espèces après intervention';
      subtitle.insertAdjacentElement('afterend', pill);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     E. TOTAL ROW LABEL PATCH
     injectOrderDetails() sets innerHTML = '<span class="conf-total-label">💰 Total à payer à la livraison</span>...'
     We replace the label text + add a "Montant indicatif" sub-note.
     The amount value (.conf-total-val) is left completely untouched.
  ════════════════════════════════════════════════════════════════════ */
  function _patchTotalRow() {
    _try('total-row', function () {
      var row = document.getElementById('conf-total-row');
      if (!row || row.style.display === 'none') return;
      if (row.getAttribute('data-fxcf-patched')) return;

      var labelEl = row.querySelector('.conf-total-label');
      if (labelEl) {
        /* Replace the label span with a wrapped version */
        var wrap = document.createElement('div');
        wrap.className = 'fxcf-total-label-wrap';
        var lbl = document.createElement('div');
        lbl.className = 'fxcf-total-label';
        lbl.textContent = 'Montant indicatif';
        var note = document.createElement('div');
        note.className = 'fxcf-total-note';
        note.textContent = "Tarif définitif confirmé avec l'artisan avant l'intervention";
        wrap.appendChild(lbl);
        wrap.appendChild(note);
        labelEl.parentNode.replaceChild(wrap, labelEl);
      }
      row.setAttribute('data-fxcf-patched', '1');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     F. PHONE MASKING IN INJECTED GRID
     injectOrderDetails() renders phone raw in .conf-info-val.
     We find it by scanning grid items for the '📞 Téléphone' label.
  ════════════════════════════════════════════════════════════════════ */
  function _maskPhone(raw) {
    if (!raw) return raw;
    var s = String(raw).replace(/[\s\-\.]/g, '');
    if (s.length < 4) return s;
    return s.slice(0, 2) + 'X'.repeat(Math.max(0, s.length - 4)) + s.slice(-2);
  }

  function _patchPhoneInGrid() {
    _try('phone-mask', function () {
      var grid = document.getElementById('conf-details-grid');
      if (!grid || grid.style.display === 'none') return;

      var items = grid.querySelectorAll('.conf-info-item');
      items.forEach(function (item) {
        var label = item.querySelector('.conf-info-label');
        var val   = item.querySelector('.conf-info-val');
        if (!label || !val) return;
        if (label.textContent.indexOf('Téléphone') === -1) return;
        if (val.getAttribute('data-fxcf-masked')) return;
        val.textContent = _maskPhone(val.textContent.trim());
        val.setAttribute('data-fxcf-masked', '1');
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════
     G. TRUST FOOTER — replaces hidden .conf-security
     Inserts factual trust signals at the bottom of .conf-card.
  ════════════════════════════════════════════════════════════════════ */
  function _injectTrustFooter() {
    _try('trust-footer', function () {
      if (document.querySelector('.fxcf-trust-footer')) return; /* idempotent */
      var security = document.querySelector('.conf-security');
      if (!security) return;

      var footer = document.createElement('div');
      footer.className = 'fxcf-trust-footer';
      footer.setAttribute('role', 'contentinfo');
      footer.innerHTML =
        '<div class="fxcf-trust-item"><span aria-hidden="true">💵</span><span>Paiement après intervention</span></div>' +
        '<div class="fxcf-trust-item"><span aria-hidden="true">📋</span><span>Demande référencée par FIXEO</span></div>';
      /* Insert where .conf-security was (now hidden) */
      security.insertAdjacentElement('afterend', footer);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     H. REVIEW NOTICE — future-state placeholder
     Inserted just before .conf-actions.
  ════════════════════════════════════════════════════════════════════ */
  function _injectReviewNotice() {
    _try('review-notice', function () {
      if (document.querySelector('.fxcf-review-notice')) return; /* idempotent */
      var actions = document.querySelector('.conf-actions');
      if (!actions) return;

      var notice = document.createElement('div');
      notice.className = 'fxcf-review-notice';
      notice.setAttribute('aria-label', 'Évaluation disponible après l\'intervention');
      notice.innerHTML =
        '<span class="fxcf-review-icon" aria-hidden="true">⭐</span>' +
        '<div class="fxcf-review-text">' +
          '<strong>Évaluation disponible après l\'intervention</strong><br>' +
          'Vous pourrez noter l\'artisan une fois la mission terminée.' +
        '</div>';
      actions.insertAdjacentElement('beforebegin', notice);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     I. COORDINATE ALL PATCHES
     Called once after injectOrderDetails() has completed.
  ════════════════════════════════════════════════════════════════════ */
  function _enhance() {
    _injectTopbar();
    _patchTitle();
    _patchIcon();
    _injectPaymentPill();
    _patchTotalRow();
    _patchPhoneInGrid();
    _injectTrustFooter();
    _injectReviewNotice();
  }

  /* ════════════════════════════════════════════════════════════════
     J. INIT — two-tier boot strategy
     Tier 1: MutationObserver on #conf-total-row — fires the moment
             injectOrderDetails() reveals it (style.display = 'flex').
             This is the cleanest hook: it runs exactly when the
             existing JS finishes injecting dynamic content.
     Tier 2: DOMContentLoaded + 120ms safety delay as fallback
             (covers the case where total is absent / payload empty).
  ════════════════════════════════════════════════════════════════════ */
  var _enhanced = false;

  function _runOnce() {
    if (_enhanced) return;
    _enhanced = true;
    _enhance();
  }

  function _boot() {
    /* Tier 1: watch #conf-total-row for display change */
    var totalRow = document.getElementById('conf-total-row');
    if (totalRow) {
      var obs = new MutationObserver(function (mutations, o) {
        /* injectOrderDetails() sets style.display = 'flex' */
        if (totalRow.style.display !== 'none' && totalRow.style.display !== '') {
          o.disconnect();
          _runOnce();
        }
      });
      obs.observe(totalRow, { attributes: true, attributeFilter: ['style'] });
    }

    /* Tier 2: safety net — runs 120ms after DOMContentLoaded */
    /* If injectOrderDetails() fires fast, _runOnce() is already done (no-op). */
    /* If localStorage has no order, _runOnce() still runs to patch static copy. */
    setTimeout(_runOnce, 120);
  }

  /* Bootstrap */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

})(window, document);
