/*!
 * js/fixeo-hero-resume-v1.js — fxhro-v1a
 * Phase 7C.9L.3Z.2C — Stateful Hero Verified Price Resume
 *
 * Responsibility: verify an opaque estimator pricing context token,
 * display a compact server-authoritative verified-price Hero card, and
 * delegate continuation/reset to existing proven modules.
 *
 * AUTHORITY CHAIN:
 *   opaque token → FixeoEstimatorReservationBridge.verifyContext() (server)
 *   → service_label, amount_mad, city_slug displayed AS-IS from server response
 *   → NO client arithmetic, NO raw price storage, NO token mint
 *
 * DOES NOT:
 *   - calculate or derive price
 *   - parse price from DOM
 *   - store amount_mad in any persistent storage
 *   - duplicate AIRE/RFOS detection logic
 *   - alter booking authority
 *   - modify Supabase schema
 *   - change canonical pricing
 *
 * Deferred until after: FixeoEstimatorReservationBridge, FixeoEstimatorConfig,
 *   FixeoEstimatorV2 (optionally), quick-search-modal.js (for #qsm-input-nlp).
 *
 * Version: fxhro-v1b-reset
 */
(function () {
  'use strict';

  /* ── Idempotency guard ───────────────────────────────── */
  if (window._fxhroLoaded) return;
  window._fxhroLoaded = true;

  /* ── Constants ───────────────────────────────────────── */
  var CARD_ID       = 'fxhro-card';
  var HOME_ID       = 'home';
  var CLASS_READY   = 'fxhro-price-ready-state';
  var CLASS_CITY    = 'fxhro-has-city';
  /* Profile-return markers — if either is present, _maybeRestoreEstimatorPicker
     has ownership; we must not compete. */
  var RETURN_MARKER_KEY = 'fx_estimator_return_v1';
  var RETURN_CITY_KEY   = 'fx_estimator_return_city_v1';

  /* ── Async generation counter ────────────────────────────
   * Incremented on every new verifyContext() call.
   * Each callback checks _gen === its captured gen before rendering.
   * Prevents stale async result from overwriting a newer UI state.
   */
  var _gen = 0;

  /* Track whether we have rendered a PRICE_READY card this session */
  var _priceReadyActive = false;

  /* ── Helpers ─────────────────────────────────────────── */
  function _el(id)  { return document.getElementById(id); }
  function _qs(sel) { return document.querySelector(sel); }

  /* Safe city display — slugs arrive as server-side city identifiers
     like "Casablanca", "Marrakech", "Fes". Title-case only if needed.
     City MUST NOT affect price — display only. */
  function _cityDisplay(slug) {
    if (!slug || typeof slug !== 'string') return '';
    /* Already title-cased in practice; strip hyphens only for safety */
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  /* Safe escaping for text content (no innerHTML injection) */
  function _setText(el, text) {
    if (el) el.textContent = String(text || '');
  }

  /* ── Profile-return ownership check ─────────────────────
   * If BOTH profile-return markers exist, _maybeRestoreEstimatorPicker()
   * will handle restoration. We must not compete.
   */
  function _profileReturnActive() {
    try {
      return !!(sessionStorage.getItem(RETURN_MARKER_KEY) &&
                sessionStorage.getItem(RETURN_CITY_KEY));
    } catch (_) { return false; }
  }

  /* ── Estimator currently active check ───────────────────
   * If Estimator V2 is open or tunnel class is set, a live session owns Hero.
   * Do not render PRICE_READY over a live Estimator.
   */
  function _estimatorTunnelActive() {
    return document.body.classList.contains('fx-estimator-tunnel-active') ||
           !!(window.FixeoEstimatorV2 &&
              typeof window.FixeoEstimatorV2.isOpen === 'function' &&
              window.FixeoEstimatorV2.isOpen());
  }

  /* ── QSM input value snapshot for stale-result guard ─── */
  function _inputSnapshot() {
    var inp = _el('qsm-input-nlp');
    return inp ? (inp.value || '').trim() : '';
  }

  /* ── Build verified price card DOM ──────────────────────
   * Uses ONLY server-returned display fields.
   * amount_mad displayed AS-IS from ctx — never stored.
   */
  function _buildCard(ctx) {
    var existing = _el(CARD_ID);
    if (existing) existing.parentNode.removeChild(existing);

    var card = document.createElement('div');
    card.id = CARD_ID;
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-label', 'Prix FIXEO vérifié pour votre demande');

    /* Eyebrow */
    var eyebrow = document.createElement('div');
    eyebrow.className = 'fxhro-eyebrow';
    eyebrow.textContent = 'Prix FIXEO vérifié';

    /* Service label */
    var service = document.createElement('div');
    service.className = 'fxhro-service';
    service.title = ctx.service_label; /* full text on hover if truncated */
    service.textContent = ctx.service_label;

    /* Price — from server only */
    var price = document.createElement('div');
    price.className = 'fxhro-price';
    var priceNum = document.createElement('span');
    priceNum.className = 'fxhro-price-amount';
    priceNum.textContent = String(ctx.amount_mad);
    var priceUnit = document.createElement('span');
    priceUnit.className = 'fxhro-price-unit';
    priceUnit.textContent = '\u00a0MAD'; /* non-breaking space */
    price.appendChild(priceNum);
    price.appendChild(priceUnit);

    card.appendChild(eyebrow);
    card.appendChild(service);
    card.appendChild(price);

    /* City — only when server-provided */
    if (ctx.city_slug) {
      var cityEl = document.createElement('div');
      cityEl.className = 'fxhro-city';
      cityEl.textContent = '\ud83d\udccd\u00a0' + _cityDisplay(ctx.city_slug);
      card.appendChild(cityEl);
    }

    /* Actions */
    var actions = document.createElement('div');
    actions.className = 'fxhro-actions';

    var btnContinue = document.createElement('button');
    btnContinue.id = 'fxhro-btn-continue';
    btnContinue.type = 'button';
    btnContinue.textContent = 'Continuer avec ce prix';
    btnContinue.addEventListener('click', _onContinue);

    var btnNew = document.createElement('button');
    btnNew.id = 'fxhro-btn-new';
    btnNew.type = 'button';
    btnNew.textContent = 'Nouvelle demande';
    btnNew.addEventListener('click', _onNewRequest);

    actions.appendChild(btnContinue);
    actions.appendChild(btnNew);
    card.appendChild(actions);

    return card;
  }

  /* ── Render PRICE_READY state ────────────────────────── */
  function _renderPriceReady(ctx) {
    var homeEl = _el(HOME_ID);
    if (!homeEl) return;

    /* Find insertion point: after .rfos-stage-wrap, before #fxhcs-line / #hero-quick-search.
       Wait for RFOS to inject .rfos-stage-wrap (it uses a 120ms poll). */
    var stage = homeEl.querySelector('.rfos-stage-wrap');
    var search = _el('hero-quick-search');

    /* Build and insert card */
    var card = _buildCard(ctx);

    if (stage && stage.parentNode) {
      /* Insert after .rfos-stage-wrap: gives DOM order stage→card→search */
      stage.parentNode.insertBefore(card, stage.nextSibling);
    } else if (search && search.parentNode) {
      /* Fallback: insert before search */
      search.parentNode.insertBefore(card, search);
    } else {
      /* Last fallback: append to .hero-content */
      var heroContent = homeEl.querySelector('.hero-content');
      if (heroContent) heroContent.appendChild(card);
      else return; /* no insertion point — stay FRESH */
    }

    /* Activate hero state */
    homeEl.classList.add(CLASS_READY);
    if (ctx.city_slug) homeEl.classList.add(CLASS_CITY);
    else homeEl.classList.remove(CLASS_CITY);

    /* Wire input watcher: if user types a materially new request, discard old card */
    _watchInputForNewRequest(ctx);

    _priceReadyActive = true;
  }

  /* ── Dismiss PRICE_READY state without clearing token ───
   * Used when user interaction supersedes async verification.
   * Token is deliberately NOT cleared (may still be valid on next load).
   */
  function _dismissPriceReady() {
    var homeEl = _el(HOME_ID);
    if (homeEl) {
      homeEl.classList.remove(CLASS_READY, CLASS_CITY);
    }
    var card = _el(CARD_ID);
    if (card && card.parentNode) card.parentNode.removeChild(card);
    _priceReadyActive = false;
  }

  /* ── Reset to FRESH Hero state ───────────────────────────
   * Called by "Nouvelle demande" and expired/invalid token path.
   * Clears request-specific state only. Preserves city context.
   */
  function _resetToFresh(clearToken) {
    _gen++; /* invalidate any in-flight verifyContext() */

    if (clearToken !== false && window.FixeoEstimatorReservationBridge) {
      window.FixeoEstimatorReservationBridge.clearContext();
    }

    /* ── RFOS must be cleared BEFORE _dismissPriceReady() ──────────
     * During fxhro-price-ready-state, CSS hides .rfos-badge and
     * .rfos-greeting (display:none) while their DOM content is stale
     * (old category + "Compris — Plombier" greeting).
     * _dismissPriceReady() removes fxhro-price-ready-state — which
     * lifts the CSS hide and immediately reveals the old DOM content.
     * By running RFOS resets first, badge.visible and greeting.innerHTML
     * are already overwritten with neutral idle state before the CSS
     * hide lifts. No visible flash of old category state.
     */

    /* 1. Memory reset: clears category + urgency; preserves city */
    try {
      if (window.FixeoRAFI && window.FixeoRAFI.memory &&
          typeof window.FixeoRAFI.memory.reset === 'function') {
        window.FixeoRAFI.memory.reset();
      }
    } catch (_) {}

    /* 2. Entry visual reset: sets greeting → idle, badge → null,
          state → 'idle', _visitorActive → false, restarts wait loop.
          MUST run after memory.reset() so _mem.category is null when
          entry.reset() reads city for the idle greeting. */
    try {
      if (window.FixeoRAFI && window.FixeoRAFI.entry &&
          typeof window.FixeoRAFI.entry.reset === 'function') {
        window.FixeoRAFI.entry.reset();
      }
    } catch (_) {}

    /* 3. NOW remove verified price card + state class.
          RFOS DOM is already neutral — no flash of old state. */
    _dismissPriceReady();

    /* 4. Clear input text.
          Do NOT dispatch a synthetic input event — programmatic value
          clear does not fire the native input listener, so RFOS
          onInput() is never called and _qsmEstimatorLaunched is not
          reset. The guard remains correctly eligible for the next
          genuine user keystroke. */
    var inp = _el('qsm-input-nlp');
    if (inp) inp.value = '';

    /* 5. Focus input to invite new request */
    try { if (inp) inp.focus(); } catch (_) {}
  }

  /* ── New request input watcher ───────────────────────────
   * Watches #qsm-input-nlp for deliberate new text after card renders.
   * On material change (≥2 chars different): dismiss card + clear token.
   * On focus alone: do nothing.
   * One listener per card render cycle; removed on card removal.
   */
  var _inputWatcherRemover = null;

  function _watchInputForNewRequest(ctx) {
    /* Remove any previous watcher */
    if (_inputWatcherRemover) { try { _inputWatcherRemover(); } catch (_) {} }
    _inputWatcherRemover = null;

    var inp = _el('qsm-input-nlp');
    if (!inp) return;

    /* Snapshot at card render time */
    var baseValue = inp.value.trim();

    function _onInputChange() {
      if (!_priceReadyActive) { _cleanup(); return; }
      var current = inp.value.trim();
      /* Material change: user typed enough new content to show different intent */
      if (current.length >= 2 && current !== baseValue) {
        _cleanup();
        /* Clear token: old price is no longer relevant to new request */
        _resetToFresh(true);
      }
    }

    function _cleanup() {
      try { inp.removeEventListener('input', _onInputChange); } catch (_) {}
      _inputWatcherRemover = null;
    }

    inp.addEventListener('input', _onInputChange);
    _inputWatcherRemover = _cleanup;
  }

  /* ── CTA handlers ────────────────────────────────────────
   * Continue: delegate to existing reservation stack, no price re-calculation.
   * New request: clear token, reset Hero.
   */
  function _onContinue() {
    /* Disable button to prevent double-tap */
    var btn = _el('fxhro-btn-continue');
    if (btn) { btn.disabled = true; btn.textContent = 'Chargement…'; }

    if (!window._loadReservationStack) {
      /* Stack not available — restore button and stay */
      if (btn) { btn.disabled = false; btn.textContent = 'Continuer avec ce prix'; }
      return;
    }

    window._loadReservationStack(function () {
      try {
        if (!window.FixeoReservation ||
            typeof window.FixeoReservation.open !== 'function') {
          if (btn) { btn.disabled = false; btn.textContent = 'Continuer avec ce prix'; }
          return;
        }
        /* Token already in sessionStorage from 3Z.2B early persist.
           Reservation.open(null) → verifyContext() server call → artisan or city picker. */
        window.FixeoReservation.open(null, false, null);
        /* Hide card while reservation is open (not destroyed — user may close reservation) */
        _dismissPriceReady();
      } catch (_e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Continuer avec ce prix'; }
      }
    });
  }

  function _onNewRequest() {
    _resetToFresh(true); /* clear token + reset Hero */
  }

  /* ── Core verification flow ─────────────────────────────── */
  function _runVerification() {
    /* Guard: profile-return flow owns restoration — do not compete */
    if (_profileReturnActive()) return;

    /* Guard: Estimator tunnel active — live session owns Hero */
    if (_estimatorTunnelActive()) return;

    /* Guard: bridge and config must be available */
    if (!window.FixeoEstimatorConfig ||
        !window.FixeoEstimatorConfig.estimatorV2Enabled) return;
    if (!window.FixeoEstimatorReservationBridge) return;

    /* Guard: token must exist */
    if (!window.FixeoEstimatorReservationBridge.getContext()) return;

    /* Capture input state at verification start (stale-result guard) */
    var capturedInput  = _inputSnapshot();
    var capturedGen    = ++_gen;

    /* verifyContext() — single HTTP round-trip, server-authoritative */
    window.FixeoEstimatorReservationBridge.verifyContext()
      .then(function (ctx) {
        /* Stale-result guards — discard if session superseded */
        if (capturedGen !== _gen) return;          /* newer call in flight */
        if (_estimatorTunnelActive()) return;       /* Estimator opened after we started */
        if (_profileReturnActive()) return;         /* profile-return took over */

        /* Input materially changed since verification started — user has new intent */
        var currentInput = _inputSnapshot();
        if (currentInput.length >= 2 && currentInput !== capturedInput) return;

        if (!ctx || !ctx.valid || !ctx.amount_mad || !ctx.service_label) {
          /* INVALID TOKEN: clear canonical context, stay FRESH.
             Distinguished from network failure because server returned a response. */
          if (ctx === null) {
            /* null specifically = server said invalid/expired */
            if (window.FixeoEstimatorReservationBridge) {
              window.FixeoEstimatorReservationBridge.clearContext();
            }
          }
          return; /* stay FRESH */
        }

        /* Wait for RFOS to inject its stage (needed for correct insertion point).
           RFOS polls at 120ms intervals; we poll up to 10 times at 80ms. */
        _waitForRfosStage(capturedGen, function () {
          if (capturedGen !== _gen) return; /* superseded while waiting */
          _renderPriceReady(ctx);
        });
      })
      .catch(function () {
        /* NETWORK FAILURE: do NOT clear token (may be transient).
           Hero stays FRESH. Token remains for next reload attempt. */
      });
  }

  /* ── Wait for RFOS stage injection ───────────────────────
   * RFOS uses a 120ms poll; we need its .rfos-stage-wrap in DOM
   * before inserting our card for correct visual ordering.
   */
  function _waitForRfosStage(gen, callback) {
    var attempts = 0;
    var max = 25; /* 25 × 80ms = 2s max wait */

    function _check() {
      if (gen !== _gen) return; /* superseded */
      var homeEl = _el(HOME_ID);
      var stage = homeEl && homeEl.querySelector('.rfos-stage-wrap');
      if (stage) {
        callback();
        return;
      }
      if (++attempts < max) {
        setTimeout(_check, 80);
      } else {
        /* RFOS didn't inject in time — still render using fallback insertion */
        callback();
      }
    }
    _check();
  }

  /* ── estimator-closed listener ───────────────────────────
   * When Estimator closes with × after reaching PRICE_READY,
   * 3Z.2B has already persisted the token. Re-run verification
   * so Hero upgrades to PRICE_READY card.
   * Debounced: 80ms to let _destroyContainer() finish fully.
   */
  var _closedTimer = null;
  document.addEventListener('fixeo:estimator-closed', function () {
    clearTimeout(_closedTimer);
    _closedTimer = setTimeout(function () {
      /* Only try if we don't already have a price card */
      if (!_priceReadyActive) {
        _runVerification();
      }
    }, 80);
  });

  /* ── Reservation closed listener ─────────────────────────
   * When reservation modal closes (e.g. user tapped ✕ on reservation),
   * re-display the price card if token still valid (user may want to continue).
   * Only re-check if we were previously in PRICE_READY state.
   */
  var _wasReadyBeforeReservation = false;
  document.addEventListener('fixeo:estimator-reserve', function () {
    /* Estimator→Reservation handoff: track that we were in PRICE_READY */
    _wasReadyBeforeReservation = _priceReadyActive;
  });

  /* ── Init ─────────────────────────────────────────────── */
  function _init() {
    /* Run on pageshow covers fresh load + bfcache restore */
    window.addEventListener('pageshow', function () {
      /* Small delay: let RFOS init start, let QSM inject, let bridge load */
      setTimeout(_runVerification, 350);
    });

    /* DOMContentLoaded safety net for deferred-script non-bfcache path */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(_runVerification, 350);
      }, { once: true });
    } else {
      /* Script already deferred — DOM ready */
      setTimeout(_runVerification, 350);
    }
  }

  _init();

  /* ── Public API (minimal — testing + integration only) ── */
  window.FixeoHeroResume = {
    VERSION:   'fxhro-v1b-reset',
    /* Re-run verification on demand (e.g. after token is written) */
    refresh:   function () { _runVerification(); },
    /* Manual reset (e.g. from test harness) */
    reset:     function () { _resetToFresh(true); },
    /* Read state (for tests) */
    isActive:  function () { return _priceReadyActive; },
    /* Expose gen counter for stale-result tests */
    _getGen:   function () { return _gen; },
  };

}());
