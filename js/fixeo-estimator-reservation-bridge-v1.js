/*!
 * js/fixeo-estimator-reservation-bridge-v1.js — FIXEO Estimator Reservation Bridge
 * Phase 7C.9B — Production Dormant Integration
 *
 * Stores ONLY the opaque pricing context token in sessionStorage.
 * NEVER stores raw price amounts.
 * Active only when FixeoEstimatorConfig.estimatorV2Enabled === true.
 */
(function() {
  'use strict';
  if (window._fxEstBridgeLoaded) return;
  window._fxEstBridgeLoaded = true;

  var CTX_KEY = 'fixeo_estimator_ctx_v1';
  var DONE_KEY = 'fixeo_estimator_completed_v1';

  window.FixeoEstimatorReservationBridge = {
    /**
     * Store an opaque pricing context token before opening the reservation modal.
     * ONLY stores the opaque token — never raw amounts.
     */
    prepareContext: function(pricingContextToken) {
      if (!pricingContextToken) return;
      try {
        sessionStorage.setItem(CTX_KEY, pricingContextToken);
      } catch (_) {}
    },

    /**
     * Retrieve the stored opaque token.
     */
    getContext: function() {
      try {
        return sessionStorage.getItem(CTX_KEY);
      } catch (_) {
        return null;
      }
    },

    /**
     * Clear the stored token (e.g., after reservation completes).
     */
    getCompletion: function(token) {
      try {
        var done = JSON.parse(sessionStorage.getItem(DONE_KEY) || 'null');
        return done && done.token === (token || this.getContext()) && done.tracking_ref ? done : null;
      } catch (_) { return null; }
    },
    completeContext: function(token, result) {
      try {
        sessionStorage.setItem(DONE_KEY, JSON.stringify({token: token, tracking_ref: result.tracking_ref}));
      } catch (_) {}
    },
    clearContext: function() {
      try {
        sessionStorage.removeItem(CTX_KEY);
        sessionStorage.removeItem(DONE_KEY);
      } catch (_) {}
    },

    /**
     * Verify the stored token via the server and return a verified context.
     * Returns Promise<{valid, outcome_type, amount_mad, labour_amount_mad, parts_separate, is_diagnostic, _token} | null>
     */
    verifyContext: function() {
      var token = this.getContext();
      if (!token) return Promise.resolve(null);
      if (!window.FixeoEstimatorAPI) return Promise.resolve(null);
      return window.FixeoEstimatorAPI.verifyPricingContext(token)
        .then(function(r) {
          if (!r || !r.valid) return null;
          return {
            valid:             true,
            outcome_type:      r.outcome_type,
            service_code:      r.service_code,        // machine identity — métier filter + booking record
            service_label:     r.service_label || null, // 7C.9L.3E: canonical human label ("Débouchage évier standard")
            city_slug:         r.city_slug     || null, // 7C.9L.3H: verified matching city (non-price)
            amount_mad:        r.amount_mad,
            labour_amount_mad: r.labour_amount_mad,
            parts_separate:    r.parts_separate,
            is_diagnostic:     r.is_diagnostic,
            _token:            token,
          };
        })
        .catch(function() { return null; });
    },
  };
}());


/* 7C.9M.4 — Shared verified confirmation UI (homepage + estimation page).
 * No request is created on open. Only confirmRequest(token, phone) can submit.
 * Attempts stay in memory: closing/reopening cannot change an uncertain payload.
 * Guest access uses the existing tracking registry, never URL parameters.
 */
(function () {
  'use strict';
  if (window._fxEstimatorConfirmationLoaded) return;
  window._fxEstimatorConfirmationLoaded = true;

  var bridge = window.FixeoEstimatorReservationBridge;
  var attempts = new Map();
  var active = null;
  var payable = ['PRICE_READY', 'LABOUR_PLUS_PART_READY', 'DIAGNOSTIC_READY'];

  function node(tag, text, className) {
    var n = document.createElement(tag);
    if (text) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  function enabled() {
    return window.FixeoEstimatorConfig &&
      window.FixeoEstimatorConfig.estimatorV2Enabled === true;
  }

  function normalizePhone(value) {
    var phone = value.trim().replace(/[\s().-]+/g, '');
    return /^(\+212|0)[5-7][0-9]{8}$/.test(phone) ? phone : null;
  }

  function saveAccess(result) {
    if (!/^[a-f0-9]{64}$/i.test(String(result.guest_token || ''))) return false;
    try {
      // Same schema as FixeoClientRequestsStore.saveGuestAccess. Do not append
      // a local request or emit a persistence event: the server already owns it.
      var registry = JSON.parse(localStorage.getItem('fixeo_guest_access_v1') || '{}');
      if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return false;
      registry[result.tracking_ref] = {
        tracking_ref: result.tracking_ref,
        server_request_id: result.request_id,
        guest_token: result.guest_token,
        saved_at: new Date().toISOString()
      };
      localStorage.setItem('fixeo_guest_access_v1', JSON.stringify(registry));
      return true;
    } catch (_) {
      return false;
    }
  }

  function showSuccess(view) {
    var result = view.attempt.result;
    view.form.hidden = true;
    view.back.hidden = true;
    view.title.textContent = 'Votre demande est enregistrée';
    view.message.textContent = result.dispatch_ok === true
      ? 'FIXEO a lancé la recherche d’un artisan. Son acceptation reste à confirmer.'
      : 'Votre demande est enregistrée. La recherche d’un artisan reste à confirmer. Ne créez pas une nouvelle demande.';
    view.summary.textContent = 'Référence : ' + result.tracking_ref;
    view.success.hidden = false;
    view.success.replaceChildren();
    if (view.attempt.restored || saveAccess(result)) {
      bridge.completeContext(view.attempt.token, result);
      var link = node('a', 'Suivre ma demande', 'fx-est-confirm-primary');
      link.href = '/suivi-demande.html';
      view.success.appendChild(link);
    } else {
      view.success.appendChild(node('p', 'Le suivi n’a pas pu être conservé sur cet appareil. Gardez cette fenêtre ouverte et réessayez.'));
      var retry = node('button', 'Réessayer d’ouvrir le suivi', 'fx-est-confirm-primary');
      retry.type = 'button';
      retry.addEventListener('click', function () { showSuccess(view); });
      view.success.appendChild(retry);
    }
    if (window.FixeoHeroResume) window.FixeoHeroResume.refresh();
    // Keep the token/context for an explicit reopen of this successful attempt.
    // No new request is sent when rendering a cached result.
    view.title.focus();
  }

  function updateBusy(view) {
    view.submit.disabled = view.attempt.pending || !view.verified;
    view.phone.readOnly = !!view.attempt.phone;
    view.back.disabled = view.attempt.pending;
    view.form.setAttribute('aria-busy', view.attempt.pending ? 'true' : 'false');
    view.submit.textContent = view.attempt.pending ? 'Confirmation en cours…'
      : view.attempt.phone ? 'Réessayer la confirmation' : 'Confirmer mon intervention';
  }

  function submit(view) {
    var attempt = view.attempt;
    if (attempt.pending || attempt.result || !view.verified) return;
    var phone = attempt.phone || normalizePhone(view.phone.value);
    if (!phone) {
      view.message.textContent = 'Saisissez un numéro marocain valide (05, 06, 07 ou +212).';
      view.phone.focus();
      return;
    }
    if (!window.FixeoEstimatorAPI || typeof window.FixeoEstimatorAPI.confirmRequest !== 'function') {
      view.message.textContent = 'La confirmation est indisponible. Réessayez dans un instant.';
      return;
    }
    attempt.phone = phone;
    attempt.pending = true;
    view.message.textContent = 'Enregistrement de votre demande. Gardez cette fenêtre ouverte.';
    updateBusy(view);
    // Start in a promise so synchronous errors release the guard as well.
    Promise.resolve().then(function () {
      return window.FixeoEstimatorAPI.confirmRequest(attempt.token, attempt.phone);
    }).then(function (result) {
      if (result && result.ok === true && result.request_id && result.tracking_ref) {
        attempt.result = result;
        showSuccess(view);
        return;
      }
      if (result && result.error === 'invalid_client_phone') {
        attempt.phone = null; // Explicit pre-persistence validation rejection.
        view.message.textContent = 'Ce numéro n’est pas accepté. Vérifiez-le avant de confirmer.';
        return;
      }
      view.message.textContent = 'La confirmation n’a pas pu être vérifiée. Réessayez ici avec les mêmes informations. Si le problème persiste, contactez FIXEO avant de créer une nouvelle demande.';
    }).catch(function () {
      view.message.textContent = 'La réponse n’a pas été reçue. Votre demande a peut-être été enregistrée. Réessayez ici : les mêmes informations seront renvoyées.';
    }).then(function () {
      attempt.pending = false;
      updateBusy(view);
    });
  }

  // Display labels only: the verified city slug and submission payload stay untouched.
  function cityLabel(value) {
    var text = String(value || '').replace(/-/g, ' ');
    var accents = {fes: 'Fès', 'fès': 'Fès', meknes: 'Meknès', sale: 'Salé', tetouan: 'Tétouan'};
    return accents[text.toLowerCase()] || text.replace(/(^|\s)\S/g, function(letter) { return letter.toUpperCase(); });
  }

  // Keep the native focus trap, but reserve the actual FIXEO header and the
  // visual viewport. Phone and CTA share one natural scroll surface.
  function fitConfirmation(dialog, shade) {
    var viewport = window.visualViewport;
    var frame = null;
    function measure() {
      frame = null;
      var headerBottom = 0;
      document.querySelectorAll('.fixeo-gh-mobile-bar, nav.navbar, header.site-header').forEach(function(header) {
        var box = header.getBoundingClientRect();
        if (box.height > 0 && box.bottom > 0) headerBottom = Math.max(headerBottom, box.bottom);
      });
      var offset = viewport ? viewport.offsetTop : 0;
      var height = viewport ? viewport.height : window.innerHeight;
      var top = Math.max(headerBottom, offset);
      dialog.style.setProperty('--fx-confirm-top', top + 'px');
      dialog.style.setProperty('--fx-confirm-height', Math.max(0, height + offset - top) + 'px');
      shade.style.top = top + 'px';
      var field = document.activeElement;
      if (dialog.contains(field) && field.tagName === 'INPUT') {
        var box = field.getBoundingClientRect();
        if (box.bottom > offset + height - 16) dialog.scrollTop += box.bottom - (offset + height - 16);
        else if (box.top < top + 16) dialog.scrollTop -= top + 16 - box.top;
      }
    }
    function schedule() { if (frame === null) frame = window.requestAnimationFrame(measure); }
    window.addEventListener('resize', schedule);
    if (viewport) { viewport.addEventListener('resize', schedule); viewport.addEventListener('scroll', schedule); }
    var observer = window.ResizeObserver ? new window.ResizeObserver(schedule) : null;
    if (observer) document.querySelectorAll('.fixeo-gh-mobile-bar, nav.navbar, header.site-header').forEach(function(header) { observer.observe(header); });
    dialog.addEventListener('focusin', schedule);
    measure();
    return function () {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      if (viewport) { viewport.removeEventListener('resize', schedule); viewport.removeEventListener('scroll', schedule); }
      if (observer) observer.disconnect();
      shade.remove();
    };
  }

  function verify(view) {
    view.message.textContent = 'Vérification de votre estimation…';
    view.retryVerify.hidden = true;
    Promise.resolve().then(function () {
      return window.FixeoEstimatorAPI.verifyPricingContext(view.attempt.token);
    }).then(function (context) {
      if (active !== view) return;
      var amount = context && (context.outcome_type === 'LABOUR_PLUS_PART_READY'
        ? context.labour_amount_mad : context.amount_mad);
      if (!context || context.valid !== true || payable.indexOf(context.outcome_type) === -1 ||
          typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new Error('unverified');
      }
      view.verified = true;
      view.summary.textContent = (context.service_label || 'Intervention FIXEO') +
        (context.city_slug ? ' · ' + cityLabel(context.city_slug) : '') + ' — ' + amount + ' MAD' +
        (context.outcome_type === 'LABOUR_PLUS_PART_READY' ? ' de main-d’œuvre (pièces en supplément)' : '') +
        (context.outcome_type === 'DIAGNOSTIC_READY' ? ' pour le diagnostic' : '');
      // Retain this verified display in memory for an uncertain attempt's reopen.
      // No amount is persisted or sent back as pricing authority.
      view.attempt.summary = view.summary.textContent;
      view.message.textContent = '';
      updateBusy(view);
      view.phone.focus();
    }).catch(function () {
      if (active !== view) return;
      view.message.textContent = 'Cette estimation n’a pas pu être vérifiée ou a expiré. Aucune confirmation n’a été envoyée depuis cette fenêtre.';
      view.retryVerify.hidden = false;
    });
  }

  bridge.openConfirmation = function (token) {
    if (!enabled() || typeof token !== 'string' || !token || active) return;
    var attempt = attempts.get(token);
    if (!attempt) {
      attempt = { token: token, phone: null, pending: false, result: null, verified: false };
      attempts.set(token, attempt);
    }
    var completed = bridge.getCompletion(token);
    if (!attempt.result && completed) {
      attempt.result = {tracking_ref: completed.tracking_ref};
      attempt.restored = true;
    }
    var previousFocus = document.activeElement;
    var dialog = node('dialog', '', 'fx-est-confirm');
    if (typeof dialog.showModal !== 'function') return; // Fail closed: never use artisan picker.
    dialog.setAttribute('aria-labelledby', 'fx-est-confirm-title');
    var title = node('h2', 'Confirmer votre intervention');
    title.id = 'fx-est-confirm-title';
    title.tabIndex = -1;
    var summary = node('p', attempt.summary || '', 'fx-est-confirm-summary');
    var message = node('p', '', 'fx-est-confirm-message');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    var form = node('form');
    var label = node('label', 'Téléphone pour organiser l’intervention');
    label.htmlFor = 'fx-est-confirm-phone';
    var phone = node('input');
    phone.id = 'fx-est-confirm-phone';
    phone.type = 'tel';
    phone.autocomplete = 'tel';
    phone.inputMode = 'tel';
    phone.maxLength = 32;
    phone.required = true;
    phone.placeholder = '06 XX XX XX XX';
    phone.value = attempt.phone || '';
    var button = node('button', 'Confirmer mon intervention', 'fx-est-confirm-primary');
    button.type = 'submit';
    button.disabled = true;
    var reassurance = node('p', 'Paiement après intervention · Aucun supplément sans votre accord', 'fx-est-confirm-reassurance');
    form.append(label, phone, reassurance, button);
    var retryVerify = node('button', 'Réessayer la vérification');
    retryVerify.type = 'button';
    retryVerify.hidden = true;
    var success = node('div');
    success.hidden = true;
    var back = node('button', 'Retour à mon estimation', 'fx-est-confirm-back');
    back.type = 'button';
    var eyebrow = node('p', 'RAFI · VOTRE INTERVENTION', 'fx-est-confirm-eyebrow');
    dialog.append(eyebrow, title, summary, message, form, retryVerify, success, back);
    var view = { dialog: dialog, title: title, summary: summary, message: message,
      form: form, phone: phone, submit: button, back: back, success: success,
      retryVerify: retryVerify, attempt: attempt, verified: attempt.verified };
    active = view;
    var disposeLayout = function () {};
    function close() {
      if (attempt.pending) return;
      attempt.verified = view.verified;
      disposeLayout();
      dialog.close();
      dialog.remove();
      active = null;
      var estimator = window.FixeoEstimatorV2;
      if (attempt.result && estimator && typeof estimator.close === 'function') estimator.close();
      else if (estimator && typeof estimator.reveal === 'function') estimator.reveal();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    back.addEventListener('click', close);
    form.addEventListener('submit', function (event) { event.preventDefault(); submit(view); });
    retryVerify.addEventListener('click', function () { verify(view); });
    var shade = node('div', '', 'fx-est-confirm-shade');
    shade.setAttribute('aria-hidden', 'true');
    document.body.appendChild(shade);
    document.body.appendChild(dialog);
    disposeLayout = fitConfirmation(dialog, shade);
    dialog.showModal();
    var estimator = window.FixeoEstimatorV2;
    if (estimator && typeof estimator.hide === 'function') estimator.hide();
    if (attempt.result) showSuccess(view);
    else if (attempt.phone && view.verified) {
      // Never verify/re-evaluate into a new context after an uncertain submission.
      message.textContent = 'Reprenez la confirmation avec les mêmes informations. Ne créez pas une nouvelle demande.';
      updateBusy(view);
    } else verify(view);
  };

  document.addEventListener('fixeo:estimator-reserve', function (event) {
    bridge.openConfirmation(event.detail && event.detail.pricing_context_token);
  });
}());
