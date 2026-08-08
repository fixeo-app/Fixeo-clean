/**
 * fxnj-journey-v1.js
 * Phase 3C — Need Journey Continuity
 * ─────────────────────────────────────────────────────────────────────────────
 * Observes three existing DOM state signals and toggles visual classes on
 * #fxnj-spine stage wrappers. Zero business logic. Zero duplication.
 *
 * State sources (read-only — NEVER written to by this script):
 *   BESOIN:    #fxnb-result.fxnb-result-visible   ← set by fxnb-need-builder.js
 *   ZONE:      #services[data-fc3-city-known]       ← set by inline city JS
 *   SITUATION: .fxsit-card[aria-pressed="true"]     ← set by main.js chip handler
 *
 * DOM mutations performed by this script:
 *   - Wraps existing elements in #fxnj-spine (one-time, on DOMContentLoaded)
 *   - Injects .fxnj-label before each wrapped block (one-time)
 *   - Adds/removes .fxnj-confirmed / .fxnj-active on .fxnj-stage divs
 *   - Sets --fxnj-fill CSS custom property on #fxnj-spine
 *
 * Namespace: fxnj-* (FIXEO Need Journey)
 *
 * Invariants:
 *   - NEVER modifies filter/scroll logic
 *   - NEVER modifies RAFI (fx-request-flow-v4.js, fixeo-rafi-os-v1.js)
 *   - NEVER modifies Phase 3A cards (fxsit-card active state untouched)
 *   - NEVER modifies Phase 3B bridge (fx-situation-results-bridge-v1.js)
 *   - No setInterval, no rAF loops, no globals beyond window.FxnjJourney
 *   - Safe to load defer — works after DOMContentLoaded
 */
(function (window, document) {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
     §1  STAGE DEFINITIONS
     Each entry maps a stage name to:
       - label:   micro-label text shown above the block
       - el:      function returning the DOM element to wrap
  ───────────────────────────────────────────────────────────────────────── */
  var STAGES = [
    {
      key:   'besoin',
      label: 'Besoin',
      getEl: function () { return document.querySelector('#services .fxnb-wrap'); }
    },
    {
      key:   'zone',
      label: 'Zone',
      getEl: function () { return document.getElementById('fxsit-city-row'); }
    },
    {
      key:   'situation',
      label: 'Situation',
      getEl: function () {
        /* Wrap reset-wrap + primary-grid + disclosure + additional together */
        return document.querySelector('#services .fxsit-reset-wrap');
      }
    }
  ];

  /* Fill heights per confirmed stage count (0, 1, 2, 3 confirmed) */
  var FILL = ['0%', '28%', '60%', '92%'];

  /* ─────────────────────────────────────────────────────────────────────────
     §2  BUILD SPINE WRAPPER
     Wraps the three target elements with .fxnj-stage divs inside #fxnj-spine.
     Runs once on DOMContentLoaded.
  ───────────────────────────────────────────────────────────────────────── */
  function _buildSpine() {
    var container = document.querySelector('#services .container');
    if (!container) return;

    /* Locate the three anchor elements */
    var needWrap   = STAGES[0].getEl();
    var cityRow    = STAGES[1].getEl();
    var resetWrap  = STAGES[2].getEl();

    if (!needWrap || !cityRow || !resetWrap) return;

    /* Verify they share the same parent (container) */
    if (needWrap.parentNode !== container ||
        cityRow.parentNode  !== container ||
        resetWrap.parentNode !== container) return;

    /* Create spine wrapper */
    var spine = document.createElement('div');
    spine.id = 'fxnj-spine';

    /* Insert spine before the first element (needWrap) */
    container.insertBefore(spine, needWrap);

    /* Move the three stage elements into the spine */
    var stageEls = [needWrap, cityRow, resetWrap];

    /* We also need to capture the primary-grid, disclosure-wrap,
       additional-grid, and services-link-wrap that come after resetWrap.
       They belong to the SITUATION stage visually. */
    var primaryGrid    = container.querySelector('.fxsit-primary-grid');
    var disclosureWrap = container.querySelector('.fxsit-disclosure-wrap');
    var additionalGrid = container.getElementById
      ? document.getElementById('fxsit-additional')
      : container.querySelector('#fxsit-additional');
    var servicesLink   = container.querySelector('.fxsit-services-link-wrap');

    /* Wrap BESOIN stage */
    var stageB = _makeStage('besoin', 'BESOIN');
    spine.appendChild(stageB);
    stageB.appendChild(needWrap);

    /* Wrap ZONE stage */
    var stageZ = _makeStage('zone', 'ZONE');
    spine.appendChild(stageZ);
    stageZ.appendChild(cityRow);

    /* Wrap SITUATION stage — includes reset + grid + disclosure + more */
    var stageS = _makeStage('situation', 'SITUATION');
    stageS.classList.add('fxnj-stage-situation');
    spine.appendChild(stageS);
    stageS.appendChild(resetWrap);
    if (primaryGrid)    stageS.appendChild(primaryGrid);
    if (disclosureWrap) stageS.appendChild(disclosureWrap);
    if (additionalGrid) stageS.appendChild(additionalGrid);
    if (servicesLink)   stageS.appendChild(servicesLink);

    /* Store stage references for observer */
    _state.stages = {
      besoin:    stageB,
      zone:      stageZ,
      situation: stageS
    };
    _state.spine  = spine;
    _state.built  = true;
  }

  function _makeStage(key, labelText) {
    var div = document.createElement('div');
    div.className = 'fxnj-stage';
    div.dataset.fxnjStage = key;

    /* Micro-label — purely decorative, hidden from SR */
    var label = document.createElement('div');
    label.className = 'fxnj-label';
    label.setAttribute('aria-hidden', 'true');
    label.setAttribute('role', 'presentation');

    var dot = document.createElement('span');
    dot.className = 'fxnj-label-dot';

    var text = document.createElement('span');
    text.className = 'fxnj-label-text';
    text.textContent = labelText;

    label.appendChild(dot);
    label.appendChild(text);
    div.appendChild(label);

    return div;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §3  STATE READING
     Pure reads — never writes to the source elements.
  ───────────────────────────────────────────────────────────────────────── */
  function _isBesoinConfirmed() {
    var el = document.getElementById('fxnb-result');
    return !!(el && el.classList.contains('fxnb-result-visible'));
  }

  function _isZoneConfirmed() {
    var section = document.getElementById('services');
    return !!(section && section.hasAttribute('data-fc3-city-known'));
  }

  function _isSituationConfirmed() {
    return !!document.querySelector(
      '#services .fxsit-card[aria-pressed="true"], ' +
      '#services .fxsit-card.active'
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §4  STATE APPLICATION
     Adds/removes .fxnj-confirmed / .fxnj-active on stage wrappers.
     Sets --fxnj-fill on spine for the progressive line.
  ───────────────────────────────────────────────────────────────────────── */
  function _applyState() {
    if (!_state.built) return;

    var bConf = _isBesoinConfirmed();
    var zConf = _isZoneConfirmed();
    var sConf = _isSituationConfirmed();

    var stages = _state.stages;

    _setStage(stages.besoin,    bConf, !zConf && bConf);
    _setStage(stages.zone,      zConf, bConf && !sConf && zConf);
    _setStage(stages.situation, sConf, sConf);

    /* Progressive fill: count confirmed stages */
    var count = (bConf ? 1 : 0) + (zConf ? 1 : 0) + (sConf ? 1 : 0);
    _state.spine.style.setProperty('--fxnj-fill', FILL[count]);
  }

  function _setStage(el, confirmed, active) {
    if (!el) return;
    el.classList.toggle('fxnj-confirmed', !!confirmed);
    el.classList.toggle('fxnj-active',    !!active);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §5  MUTATION OBSERVERS
     Three lightweight observers — one per state signal.
     Each calls _applyState() on relevant mutations.
  ───────────────────────────────────────────────────────────────────────── */
  var _state = {
    built:  false,
    stages: null,
    spine:  null,
    obs:    []
  };

  function _observe() {
    /* Observer A: watch #fxnb-result classList for fxnb-result-visible */
    var resultEl = document.getElementById('fxnb-result');
    if (resultEl) {
      var obsA = new MutationObserver(_applyState);
      obsA.observe(resultEl, { attributes: true, attributeFilter: ['class'] });
      _state.obs.push(obsA);
    }

    /* Observer B: watch #services for data-fc3-city-known attribute */
    var section = document.getElementById('services');
    if (section) {
      var obsB = new MutationObserver(_applyState);
      obsB.observe(section, { attributes: true, attributeFilter: ['data-fc3-city-known'] });
      _state.obs.push(obsB);
    }

    /* Observer C: watch card grid for aria-pressed changes */
    var primaryGrid = document.querySelector('#services .fxsit-primary-grid');
    var additionalGrid = document.getElementById('fxsit-additional');

    function _observeGrid(grid) {
      if (!grid) return;
      var obs = new MutationObserver(_applyState);
      obs.observe(grid, {
        attributes: true,
        attributeFilter: ['aria-pressed', 'class'],
        subtree: true
      });
      _state.obs.push(obs);
    }

    _observeGrid(primaryGrid);
    _observeGrid(additionalGrid);

    /* Observer D: watch reset button (Tous les artisans) aria-pressed */
    var resetBtn = document.querySelector('#services .fxsit-reset-btn');
    if (resetBtn) {
      var obsD = new MutationObserver(_applyState);
      obsD.observe(resetBtn, { attributes: true, attributeFilter: ['aria-pressed', 'class'] });
      _state.obs.push(obsD);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §6  INIT
  ───────────────────────────────────────────────────────────────────────── */
  function _init() {
    try {
      _buildSpine();
      if (!_state.built) return; /* DOM not ready or elements missing */
      _observe();
      _applyState(); /* initial pass */
    } catch (e) {
      /* Silent fail — Phase 3C is decorative; never block page function */
      if (window.console && console.warn) {
        console.warn('[fxnj-v1] init error:', e);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    /* Already interactive/complete */
    _init();
  }

  /* Public API — for debugging only */
  window.FxnjJourney = { applyState: _applyState, state: _state };

}(window, document));
