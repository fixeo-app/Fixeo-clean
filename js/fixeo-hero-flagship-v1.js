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
  var _activeTrackingRef = null;
  var _activeGuestToken = null;
  var _pollTimer = null;
  
  /* ── Helpers ───────────────────────────────────────────────── */
  function _el(id) {
    return document.getElementById(id);
  }

  function _isValidState(state) {
    return VALID_STATES.indexOf(state) !== -1;
  }
async function _fetchGuestState() {
  if (!_activeTrackingRef || !_activeGuestToken) {
    return null;
  }

  try {
    var response = await fetch('/api/guest-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'guest_lookup',
        tracking_ref: _activeTrackingRef,
        guest_token: _activeGuestToken
      })
    });

    var data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok || !data || data.ok !== true) {
      console.warn(
        '[FXHF] guest lookup failed',
        data && (data.code || data.error)
      );
      return null;
    }

    return data;
  } catch (err) {
    console.warn(
      '[FXHF] guest lookup error:',
      err && err.message
    );
    return null;
  }
}
function _startGuestPolling() {
  if (_pollTimer) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }

  var analysisStartedAt = Date.now();
  var MIN_ANALYSIS_MS = 5000;

  async function poll() {
    if (!_activeTrackingRef || !_activeGuestToken) {
      return;
    }

    var data = await _fetchGuestState();

    if (data && data.ui_state) {
      if (data.ui_state === STATES.DISPATCHING) {
        var elapsed = Date.now() - analysisStartedAt;

        if (elapsed < MIN_ANALYSIS_MS) {
          _pollTimer = setTimeout(
            poll,
            MIN_ANALYSIS_MS - elapsed
          );
          return;
        }

        renderDispatching(data);
      }

      /*
       * States mission_active / in_progress / completed
       * will be connected only after their dedicated renderers exist.
       * Until then, keep polling the real backend state.
       */
    }

    _pollTimer = setTimeout(poll, 2500);
  }

  poll();
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
    var SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {
  var recognition = new SpeechRecognition();

  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.continuous = false;

  mic.addEventListener('click', function () {
    try {
      mic.disabled = true;
      mic.textContent = '🎙️ Écoute…';
      recognition.start();
    } catch (_) {
      mic.disabled = false;
      mic.textContent = '🎙️ Parler à RAFI';
    }
  });

  recognition.addEventListener('result', function (event) {
    var transcript =
      event.results &&
      event.results[0] &&
      event.results[0][0] &&
      event.results[0][0].transcript
        ? event.results[0][0].transcript.trim()
        : '';

    if (transcript) {
      textarea.value = transcript;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  recognition.addEventListener('end', function () {
    mic.disabled = false;
    mic.textContent = '🎙️ Parler à RAFI';
  });

  recognition.addEventListener('error', function () {
    mic.disabled = false;
    mic.textContent = '🎙️ Parler à RAFI';
  });
} else {
  mic.disabled = true;
  mic.textContent = '🎙️ Micro non disponible';
}

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

    var locationRow = document.createElement('div');
locationRow.className = 'fxhf-location-row';

var detectedBadge = document.createElement('span');
detectedBadge.className = 'fxhf-location-detected-badge';
detectedBadge.textContent = 'Détectée';
detectedBadge.hidden = true;

locationRow.appendChild(location);
locationRow.appendChild(detectedBadge);
    
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
    /* Sync trusted city detected by the existing FIXEO geo flow.
   No new geolocation request is made here. */
function syncFlagshipDetectedCity(attempt) {
  var detectedCity = '';

  try {
    detectedCity = window.FIXEO_DETECTED_CITY || '';
  } catch (_) {}

  if (!detectedCity) {
    var legacyCitySelect = document.getElementById('qsm-select-city');

    if (legacyCitySelect && legacyCitySelect.value) {
      detectedCity = legacyCitySelect.value;
    }
  }

  if (detectedCity && location.options.length > 1) {
    var normalized = detectedCity.toLowerCase().trim();

    for (var i = 0; i < location.options.length; i++) {
      if (
        location.options[i].value &&
        location.options[i].value.toLowerCase().trim() === normalized
      ) {
        location.value = location.options[i].value;

/* Mark city as geo-detected without adding vertical space. */
location.classList.add('fxhf-location--detected');
detectedBadge.hidden = false;

return;
        
      }
    }
  }

  /* Existing geo flow can resolve asynchronously (timeout up to 5s). */
  if (attempt < 40) {
    setTimeout(function () {
      syncFlagshipDetectedCity(attempt + 1);
    }, 150);
  }
}

syncFlagshipDetectedCity(0);

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
        urgency: isUrgent ? 'urgent' : 'normale',
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
    _activeTrackingRef = data.ref;
    _activeGuestToken = data.guest_token;

    /* State 2 begins only after canonical server creation succeeded. */
    renderAnalysis({
      need: need,
      categoryLabel: detected.label || detected.cat,
      city: city,
      urgencyLabel: isUrgent ? 'Urgent' : null,
      trackingRef: data.ref,
      serverRequestId: data.id
    });
   _startGuestPolling();
    
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
   content.appendChild(locationRow);
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
    /* RAFI ambient conversation — NEED state */
var rafiMessage = document.createElement('p');
rafiMessage.className = 'fxhf-rafi-message';
rafiMessage.setAttribute('aria-live', 'polite');

var rafiMessages = [
  'Décrivez-moi ce qui se passe.',
  'Même quelques mots me suffisent.',
  'Je peux identifier le bon métier.',
  'Vous pouvez aussi simplement me parler.',
  'Je tiens compte de votre ville.',
  'Je cherche les artisans les plus adaptés.',
  'Besoin urgent ? Dites-le-moi.',
  'Prêt ? Je m’occupe de la suite.'
];

var rafiMessageIndex = 0;

rafiMessage.textContent = rafiMessages[rafiMessageIndex];

var rafiMessageTimer = setInterval(function () {
  /* Ambient conversation only belongs to NEED state. */
  
  if (
  !_root ||
  _root.getAttribute('data-fxhf-state') !== 'need'
) {
  return;
}

  rafiMessageIndex =
    (rafiMessageIndex + 1) % rafiMessages.length;

  rafiMessage.textContent =
    rafiMessages[rafiMessageIndex];
}, 2500);

    visual.appendChild(sphere);
    visual.appendChild(visualLabel);
    visual.appendChild(rafiMessage);

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
/* ── State 3 renderer — DISPATCHING ───────────────────────── */
/* ── State 3 renderer — DISPATCHING ───────────────────────── */
function renderDispatching(data) {
  if (!_mounted || !_root) return false;

  data = data || {};

  _state = STATES.DISPATCHING;
  _root.setAttribute('data-fxhf-state', STATES.DISPATCHING);
  _root.replaceChildren();

  var shell = document.createElement('div');
  shell.className = 'fxhf-shell fxhf-shell--dispatching';

  /* ── LEFT — live dispatch narrative ─────────────────────── */

  var content = document.createElement('div');
  content.className = 'fxhf-content fxhf-content--dispatching';

  var eyebrow = document.createElement('div');
  eyebrow.className = 'fxhf-eyebrow';
  eyebrow.textContent = 'RAFI · Assistant FIXEO';

  var title = document.createElement('h2');
  title.className = 'fxhf-title';
  title.textContent =
    'RAFI a trouvé les artisans les plus adaptés.';

  var subtitle = document.createElement('p');
  subtitle.className = 'fxhf-subtitle';
  subtitle.textContent =
    'FIXEO contacte le premier groupe pour vous.';

  var progress = document.createElement('div');
  progress.className = 'fxhf-dispatch-progress';

  var stepNeed = document.createElement('span');
  stepNeed.className =
    'fxhf-dispatch-step fxhf-dispatch-step--done';
  stepNeed.textContent = 'Besoin ✓';

  var arrow1 = document.createElement('span');
  arrow1.className = 'fxhf-dispatch-arrow';
  arrow1.textContent = '→';

  var stepMatching = document.createElement('span');
  stepMatching.className =
    'fxhf-dispatch-step fxhf-dispatch-step--done';
  stepMatching.textContent = 'Matching ✓';

  var arrow2 = document.createElement('span');
  arrow2.className = 'fxhf-dispatch-arrow';
  arrow2.textContent = '→';

  var stepDispatch = document.createElement('span');
  stepDispatch.className =
    'fxhf-dispatch-step fxhf-dispatch-step--active';
  stepDispatch.textContent = 'Dispatch';

  var dispatchPulse = document.createElement('span');
  dispatchPulse.className = 'fxhf-dispatch-live-dot';
  dispatchPulse.setAttribute('aria-hidden', 'true');

  stepDispatch.appendChild(dispatchPulse);

  progress.appendChild(stepNeed);
  progress.appendChild(arrow1);
  progress.appendChild(stepMatching);
  progress.appendChild(arrow2);
  progress.appendChild(stepDispatch);

  var contactedCount =
    data.dispatch &&
    Number.isFinite(Number(data.dispatch.contacted_count))
      ? Number(data.dispatch.contacted_count)
      : 0;

  var count = document.createElement('div');
  count.className = 'fxhf-dispatch-count';

  var countNumber = document.createElement('strong');
  countNumber.className = 'fxhf-dispatch-count-number';
  countNumber.textContent = String(contactedCount);

  var countLabel = document.createElement('span');
  countLabel.className = 'fxhf-dispatch-count-label';
  countLabel.textContent =
    ' artisan' +
    (contactedCount > 1 ? 's' : '') +
    ' contacté' +
    (contactedCount > 1 ? 's' : '');

  count.appendChild(countNumber);
  count.appendChild(countLabel);

  var continuation = document.createElement('p');
  continuation.className = 'fxhf-dispatch-continuation';
  continuation.textContent =
    'Si aucun artisan n’accepte, FIXEO poursuit automatiquement la recherche.';

  content.appendChild(eyebrow);
  content.appendChild(title);
  content.appendChild(subtitle);
  content.appendChild(progress);
  content.appendChild(count);
  content.appendChild(continuation);

  /* ── RIGHT — RAFI + REAL CANDIDATE NETWORK ──────────────── */

  var visual = document.createElement('div');
  visual.className = 'fxhf-visual fxhf-visual--dispatching';

  var network = document.createElement('div');
  network.className = 'fxhf-dispatch-network';

  var sphere = document.createElement('div');
  sphere.className =
    'fxhf-rafi-sphere fxhf-rafi-sphere--dispatching';

  var halo = document.createElement('div');
  halo.className = 'fxhf-rafi-halo';

  var core = document.createElement('div');
  core.className = 'fxhf-rafi-core';

  var rafiImg = document.createElement('img');
  rafiImg.className = 'fxhf-rafi-image';
  rafiImg.src = 'rafi/RAFI_V2_HeadCollar_Core.webp';
  rafiImg.alt = 'RAFI';
  rafiImg.width = 150;
  rafiImg.height = 150;
  rafiImg.loading = 'eager';

  core.appendChild(rafiImg);
  sphere.appendChild(halo);
  sphere.appendChild(core);

  network.appendChild(sphere);

  var rows =
    data.dispatch &&
    Array.isArray(data.dispatch.candidates)
      ? data.dispatch.candidates.slice(0, 3)
      : [];

  rows.forEach(function(candidate, index) {
    if (!candidate) return;

    var position = index + 1;

    /*
     * Connection exists only because this artisan is really present
     * in the backend dispatch candidate response.
     */
    var connection = document.createElement('div');
    connection.className =
      'fxhf-dispatch-connection ' +
      'fxhf-dispatch-connection--' + position;
    connection.setAttribute('aria-hidden', 'true');

    var connectionFlow = document.createElement('span');
    connectionFlow.className = 'fxhf-dispatch-connection-flow';

    connection.appendChild(connectionFlow);
    network.appendChild(connection);

    var node = document.createElement('div');
    node.className =
      'fxhf-dispatch-node ' +
      'fxhf-dispatch-node--' + position;

    var avatar = document.createElement('div');
    avatar.className = 'fxhf-dispatch-node-avatar';

    if (candidate.photo_url) {
      var img = document.createElement('img');
      img.className = 'fxhf-dispatch-node-photo';
      img.src = candidate.photo_url;
      img.alt = '';
      img.loading = 'eager';

      avatar.appendChild(img);
    } else {
      var fallback = document.createElement('span');
      fallback.className = 'fxhf-dispatch-node-fallback';

      var displayName =
        candidate.display_name || 'Artisan FIXEO';

      fallback.textContent =
        displayName.trim().charAt(0).toUpperCase() || 'F';

      avatar.appendChild(fallback);
    }

    var identity = document.createElement('div');
    identity.className = 'fxhf-dispatch-node-identity';

    var name = document.createElement('strong');
    name.className = 'fxhf-dispatch-node-name';
    name.textContent =
      candidate.display_name || 'Artisan FIXEO';

    var waiting = document.createElement('span');
    waiting.className = 'fxhf-dispatch-node-status';

    var waitingDot = document.createElement('span');
    waitingDot.className = 'fxhf-dispatch-node-status-dot';
    waitingDot.setAttribute('aria-hidden', 'true');

    var waitingText = document.createElement('span');
    waitingText.textContent = 'En attente';

    waiting.appendChild(waitingDot);
    waiting.appendChild(waitingText);

    identity.appendChild(name);
    identity.appendChild(waiting);

    node.appendChild(avatar);
    node.appendChild(identity);

    network.appendChild(node);
  });

  var networkLabel = document.createElement('div');
  networkLabel.className = 'fxhf-dispatch-network-label';
  networkLabel.textContent = 'DISPATCH EN COURS';

  network.appendChild(networkLabel);
  visual.appendChild(network);

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
