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

    /* Location */
    var location = document.createElement('button');
    location.type = 'button';
    location.id = 'fxhf-location';
    location.className = 'fxhf-location';
    location.setAttribute('aria-label', 'Choisir ou modifier la ville');
    location.textContent = '📍 Choisir la ville';

    /* Main CTA */
    var cta = document.createElement('button');
    cta.type = 'button';
    cta.id = 'fxhf-submit';
    cta.className = 'fxhf-submit';
    cta.textContent = 'Trouver une solution →';

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
