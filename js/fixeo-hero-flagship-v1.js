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

  /* ── Init ──────────────────────────────────────────────────── */
  function _init() {
    mount();
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
