/*!
 * js/fixeo-hero-flagship-v1.js
 * FIXEO Hero Flagship V1
 *
 * State-driven client experience.
 *
 * States:
 *   need
 *   analysis
 *   dispatching
 *   mission_active
 *   in_progress
 *   completed
 *
 * IMPORTANT:
 *   - presentation/orchestration layer only
 *   - does not implement matching
 *   - does not implement dispatch
 *   - does not modify mission lifecycle
 *   - does not infer backend state from DOM
 *   - does not modify RAFI OS / Estimator / Reservation
 *
 * Namespace:
 *   JS  : window.FixeoHeroFlagship
 *   DOM : fxhf-*
 */
(function () {
  'use strict';

  /* ── Idempotency guard ─────────────────────────────────────── */
  if (window.FixeoHeroFlagship) return;

  /* ── Constants ─────────────────────────────────────────────── */
  var ROOT_ID = 'fxhf-root';

  var STATES = Object.freeze({
    NEED:           'need',
    ANALYSIS:       'analysis',
    DISPATCHING:    'dispatching',
    MISSION_ACTIVE: 'mission_active',
    IN_PROGRESS:    'in_progress',
    COMPLETED:      'completed'
  });

  var VALID_STATES = Object.freeze([
    STATES.NEED,
    STATES.ANALYSIS,
    STATES.DISPATCHING,
    STATES.MISSION_ACTIVE,
    STATES.IN_PROGRESS,
    STATES.COMPLETED
  ]);

  /* ── Internal state ────────────────────────────────────────── */
  var _root = null;
  var _mounted = false;
  var _state = STATES.NEED;

  /* ── Helpers ───────────────────────────────────────────────── */
  function _el(id) {
    return document.getElementById(id);
  }

  function _isValidState(state) {
    return VALID_STATES.indexOf(state) !== -1;
  }

  /* ── Mount ───────────────────────────────────────────────────
   * Passive in this first implementation.
   * It only binds the JS controller to #fxhf-root.
   * No visual takeover yet.
   */
  function mount() {
    if (_mounted) return true;

    _root = _el(ROOT_ID);
    if (!_root) return false;

    var initialState = _root.getAttribute('data-fxhf-state');

    if (_isValidState(initialState)) {
      _state = initialState;
    } else {
      _state = STATES.NEED;
    }

    _mounted = true;
    return true;
  }

  /* ── Read-only state API for now ───────────────────────────── */
  function getState() {
    return _state;
  }

  function isMounted() {
    return _mounted;
  }
  /* ── State 1 renderer — NEED ───────────────────────────────── */
  function renderNeed() {
    if (!_mounted || !_root) return false;

    _state = STATES.NEED;
    _root.setAttribute('data-fxhf-state', STATES.NEED);

    /* Clear only Flagship-owned content. */
    _root.replaceChildren();

    /* ── Main layout ─────────────────────────────────────────── */
    var shell = document.createElement('div');
    shell.className = 'fxhf-shell fxhf-shell--need';

    /* ── Client interaction side ─────────────────────────────── */
    var content = document.createElement('div');
    content.className = 'fxhf-content';

    var eyebrow = document.createElement('div');
    eyebrow.className = 'fxhf-eyebrow';
    eyebrow.textContent = 'RAFI · Assistant FIXEO';

    var title = document.createElement('h2');
    title.className = 'fxhf-title';
    title.textContent = 'Que se passe-t-il ?';

    var subtitle = document.createElement('p');
    subtitle.className = 'fxhf-subtitle';
    subtitle.textContent =
      'Décrivez votre besoin. FIXEO s’occupe de trouver qui peut intervenir.';

    /* Need field */
    var field = document.createElement('div');
    field.className = 'fxhf-need-field';

    var textarea = document.createElement('textarea');
    textarea.id = 'fxhf-need-input';
    textarea.className = 'fxhf-need-input';
    textarea.rows = 4;
    textarea.placeholder = 'Décrivez votre problème…';
    textarea.setAttribute(
      'aria-label',
      'Décrivez votre problème ou votre besoin'
    );

    var fieldFooter = document.createElement('div');
    fieldFooter.className = 'fxhf-field-footer';

    var example = document.createElement('span');
    example.className = 'fxhf-example';
    example.textContent =
      'Ex. : J’ai une fuite sous l’évier depuis ce matin';

    var mic = document.createElement('button');
    mic.type = 'button';
    mic.id = 'fxhf-mic';
    mic.className = 'fxhf-mic';
    mic.setAttribute('aria-label', 'Parler à RAFI');
    mic.textContent = '🎙️ Parler à RAFI';

    fieldFooter.appendChild(example);
    fieldFooter.appendChild(mic);

    field.appendChild(textarea);
    field.appendChild(fieldFooter);

   /* Location — Flagship-owned picker.
   Reads existing city options as data only.
   Never focuses/clicks/changes the legacy QSM select. */
var location = document.createElement('select');
location.id = 'fxhf-location';
location.className = 'fxhf-location';
location.setAttribute('aria-label', 'Choisir ou modifier la ville');

var defaultCity = document.createElement('option');
defaultCity.value = '';
defaultCity.textContent = '📍 Choisir la ville';
location.appendChild(defaultCity);

function populateFlagshipCities(attempt) {
  var legacyCitySelect = document.getElementById('qsm-select-city');

  if (
    legacyCitySelect &&
    legacyCitySelect.options &&
    legacyCitySelect.options.length > 1
  ) {
    /* Keep only the Flagship placeholder before rebuilding. */
    while (location.options.length > 1) {
      location.remove(1);
    }

    Array.from(legacyCitySelect.options).forEach(function (option) {
      if (!option.value) return;

      var cityOption = document.createElement('option');
      cityOption.value = option.value;
      cityOption.textContent = option.textContent.trim();

      location.appendChild(cityOption);
    });

    return;
  }

  /* QSM may populate asynchronously after Flagship renders. */
  if (attempt < 20) {
    setTimeout(function () {
      populateFlagshipCities(attempt + 1);
    }, 150);
  }
}

populateFlagshipCities(0);

    /* Main CTA */
    var cta = document.createElement('button');
    cta.type = 'button';
    cta.id = 'fxhf-submit';
    cta.className = 'fxhf-submit';
    cta.textContent = 'Trouver une solution →';
  cta.addEventListener('click', async function () {
  var need = (textarea.value || '').trim();
  var city = location.value || '';

  textarea.setCustomValidity('');

  if (need.length < 3) {
    textarea.focus();
    return;
  }

  if (!city) {
    location.focus();
    return;
  }

  /* RAFI must understand the need before starting matching. */
  if (
    !window.FixeoAIRE ||
    typeof window.FixeoAIRE.detect !== 'function'
  ) {
    console.warn('[FXHF] RAFI detection engine unavailable');
    return;
  }

  var detected = window.FixeoAIRE.detect(need);

  if (!detected || !detected.cat) {
    textarea.setCustomValidity(
      'Pouvez-vous préciser un peu votre besoin pour que RAFI identifie le bon métier ?'
    );
    textarea.reportValidity();
    textarea.focus();
    return;
  }

  var isUrgent = false;

  if (typeof window.FixeoAIRE.detectUrgency === 'function') {
    isUrgent = !!window.FixeoAIRE.detectUrgency(
      need,
      detected
    );
  }

  cta.disabled = true;
  cta.textContent = 'RAFI prépare votre demande…';

  try {
    var response = await fetch('/api/urgent-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service: detected.cat,
        problem: need,
        description: '',
        city: city,
        phone: '',
        urgency: isUrgent ? 'urgent' : 'normal',
        mode: 'flagship',
        source: 'hero-flagship-v1'
      })
    });

    var data = await response.json().catch(function () {
      return null;
    });

    if (
      !response.ok ||
      !data ||
      data.ok !== true ||
      !data.ref ||
      !data.id ||
      !data.guest_token
    ) {
      throw new Error(
        (data && (data.error || data.code)) ||
        'FLAGSHIP_CREATE_FAILED'
      );
    }

    if (
      !window.FixeoClientRequestsStore ||
      typeof window.FixeoClientRequestsStore.saveGuestAccess !== 'function'
    ) {
      throw new Error('GUEST_ACCESS_STORE_UNAVAILABLE');
    }

    var guestSaved =
      window.FixeoClientRequestsStore.saveGuestAccess(
        data.ref,
        data.id,
        data.guest_token
      );

    if (!guestSaved) {
      throw new Error('GUEST_ACCESS_SAVE_FAILED');
    }

    /* State 2 begins only after canonical server creation succeeded. */
    renderAnalysis({
      need: need,
      categoryLabel: detected.label || detected.cat,
      city: city,
      urgencyLabel: isUrgent ? 'Urgent' : null,
      trackingRef: data.ref,
      serverRequestId: data.id
    });

  } catch (err) {
    console.error(
      '[FXHF] Flagship request creation failed:',
      err && err.message
    );

    cta.disabled = false;
    cta.textContent = 'Trouver une solution →';
  }
});

    /* Truthful reassurance */
    var trust = document.createElement('p');
    trust.className = 'fxhf-trust';
    trust.textContent =
      'Gratuit pour le client · Paiement après intervention';

    /* Secondary directory path */
    var directory = document.createElement('button');
    directory.type = 'button';
    directory.id = 'fxhf-directory-link';
    directory.className = 'fxhf-directory-link';
    directory.textContent =
      'Vous préférez choisir vous-même ? Voir les artisans';

    content.appendChild(eyebrow);
    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(field);
    content.appendChild(location);
    content.appendChild(cta);
    content.appendChild(trust);
    content.appendChild(directory);

    /* ── RAFI visual side ────────────────────────────────────── */
    var visual = document.createElement('div');
    visual.className = 'fxhf-visual';
    visual.setAttribute('aria-hidden', 'true');

    var sphere = document.createElement('div');
    sphere.className = 'fxhf-rafi-sphere';

    var halo = document.createElement('div');
    halo.className = 'fxhf-rafi-halo';

    var core = document.createElement('div');
    core.className = 'fxhf-rafi-core';

    var rafiImg = document.createElement('img');
    rafiImg.className = 'fxhf-rafi-image';
    rafiImg.src = 'rafi/RAFI_V2_HeadCollar_Core.webp';
    rafiImg.alt = '';
    rafiImg.width = 150;
    rafiImg.height = 150;
    rafiImg.loading = 'eager';

    core.appendChild(rafiImg);
    sphere.appendChild(halo);
    sphere.appendChild(core);

    var visualLabel = document.createElement('div');
    visualLabel.className = 'fxhf-visual-label';
    visualLabel.textContent = 'RAFI';

    visual.appendChild(sphere);
    visual.appendChild(visualLabel);

    shell.appendChild(content);
    shell.appendChild(visual);

    _root.appendChild(shell);

    return true;
  }
/* ── State 2 renderer — ANALYSIS ───────────────────────────── */
  function renderAnalysis(data) {
    if (!_mounted || !_root) return false;

    data = data || {};

    _state = STATES.ANALYSIS;
    _root.setAttribute('data-fxhf-state', STATES.ANALYSIS);

    _root.replaceChildren();

    var shell = document.createElement('div');
    shell.className = 'fxhf-shell fxhf-shell--analysis';

    var content = document.createElement('div');
    content.className = 'fxhf-content';

    var eyebrow = document.createElement('div');
    eyebrow.className = 'fxhf-eyebrow';
    eyebrow.textContent = 'RAFI · Assistant FIXEO';

    var title = document.createElement('h2');
    title.className = 'fxhf-title';
    title.textContent = 'RAFI analyse votre demande';

    var subtitle = document.createElement('p');
    subtitle.className = 'fxhf-subtitle';
    subtitle.textContent =
      'Je prépare le matching avec les artisans les plus adaptés.';

    var summary = document.createElement('div');
    summary.className = 'fxhf-analysis-summary';

    if (data.need) {
      var quote = document.createElement('p');
      quote.className = 'fxhf-analysis-quote';
      quote.textContent = '“' + String(data.need) + '”';
      summary.appendChild(quote);
    }

    var facts = document.createElement('div');
    facts.className = 'fxhf-analysis-facts';

    if (data.categoryLabel) {
      var category = document.createElement('div');
      category.className = 'fxhf-analysis-fact';
      category.textContent =
        'Besoin identifié · ' + String(data.categoryLabel) + ' ✓';
      facts.appendChild(category);
    }

    if (data.city) {
      var city = document.createElement('div');
      city.className = 'fxhf-analysis-fact';
      city.textContent =
        'Zone · ' + String(data.city) + ' ✓';
      facts.appendChild(city);
    }

    if (data.urgencyLabel) {
      var urgency = document.createElement('div');
      urgency.className = 'fxhf-analysis-fact';
      urgency.textContent =
        'Urgence · ' + String(data.urgencyLabel) + ' ✓';
      facts.appendChild(urgency);
    }

    summary.appendChild(facts);

    var status = document.createElement('div');
    status.className = 'fxhf-analysis-status';
    status.textContent = 'Préparation du matching…';

    content.appendChild(eyebrow);
    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(summary);
    content.appendChild(status);

    /* RAFI visual — active analysis state */
    var visual = document.createElement('div');
    visual.className = 'fxhf-visual fxhf-visual--analysis';
    visual.setAttribute('aria-hidden', 'true');

    var sphere = document.createElement('div');
    sphere.className =
      'fxhf-rafi-sphere fxhf-rafi-sphere--analysis';

    var halo = document.createElement('div');
    halo.className = 'fxhf-rafi-halo';

    var core = document.createElement('div');
    core.className = 'fxhf-rafi-core';

    var rafiImg = document.createElement('img');
    rafiImg.className = 'fxhf-rafi-image';
    rafiImg.src = 'rafi/RAFI_V2_HeadCollar_Core.webp';
    rafiImg.alt = '';
    rafiImg.width = 150;
    rafiImg.height = 150;
    rafiImg.loading = 'eager';

    core.appendChild(rafiImg);
    sphere.appendChild(halo);
    sphere.appendChild(core);
    visual.appendChild(sphere);

    shell.appendChild(content);
    shell.appendChild(visual);

    _root.appendChild(shell);

    return true;
  }
  
  /* ── Init ──────────────────────────────────────────────────── */
 function _init() {
  if (!mount()) return;
  renderNeed();
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  /* ── Public API ────────────────────────────────────────────── */
  window.FixeoHeroFlagship = {
    VERSION: 'fxhf-v1a',
    STATES: STATES,
    mount: mount,
    getState: getState,
    isMounted: isMounted
  };

})();
