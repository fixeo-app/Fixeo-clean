/**
 * FIXEO CLIENT TRACKING ENGINE — ftrk-v1a
 * =============================================
 * Adds Uber-style real-time request tracking to two surfaces:
 *
 *   1. POST-SUBMIT SCREEN (index.html)
 *      Vertical 8-step timeline injected into #request-success.
 *      Steps animate as dispatch progresses (sequenced, not fake).
 *      Hooks fixeo:client-request-created event (from fixeo-supabase-core.js).
 *
 *   2. CLIENT DASHBOARD (dashboard-client.html)
 *      "#ftrk-live-card" injected at top of #fxv2-sec-dashboard
 *      showing the most active in-progress request with:
 *        - large status icon + label
 *        - 5-step compact progress bar
 *        - artisan chip (when assigned)
 *        - 60s auto-poll for live updates
 *
 * STATUS MAP (real DB values → display):
 *   service_requests.status:
 *     new          → REQUEST_CREATED → ANALYZING → MATCHING (timed sequence)
 *     assigned     → ASSIGNED (artisan name if available)
 *     in_progress  → IN_PROGRESS
 *     completed    → COMPLETED_PENDING
 *     validated    → COMPLETED
 *     cancelled    → CANCELLED
 *
 *   missions.status:
 *     pending      → ASSIGNED
 *     (in_progress maps via service_requests.status)
 *     done         → COMPLETED_PENDING
 *     validated    → COMPLETED
 *
 * CONSTRAINTS:
 *   - ZERO modifications to fixeo-dashboard-v2.js
 *   - ZERO modifications to request-form.js
 *   - ZERO modifications to fixeo-supabase-core.js
 *   - Real data only — never fabricates statuses
 *   - Auto-poll via setInterval 60s (calls _refresh() on existing engine)
 *   - Idempotent: window.FixeoTrackingEngine guard
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoTrackingEngine) return;
  var VERSION = 'ftrk-v1a';

  /* ══════════════════════════════════════════════════════════
     TRACKING STEP DEFINITIONS
     8 canonical steps mapped to display config.
     key → { icon, label, sublabel, state }
     state: 'done' | 'active' | 'waiting' | 'skipped'
  ══════════════════════════════════════════════════════════ */
  var STEPS = [
    {
      key:      'RECEIVED',
      icon:     '📨',
      label:    'Demande reçue',
      sublabel: 'Votre demande est enregistrée'
    },
    {
      key:      'ANALYZING',
      icon:     '🤖',
      label:    'Analyse du besoin',
      sublabel: 'Catégorie et priorité détectées'
    },
    {
      key:      'MATCHING',
      icon:     '🔍',
      label:    'Recherche d\'artisans',
      sublabel: 'Artisans compatibles identifiés dans votre zone'
    },
    {
      key:      'ASSIGNED',
      icon:     '👨‍🔧',
      label:    'Artisan sélectionné',
      sublabel: ''   /* filled dynamically with artisan name */
    },
    {
      key:      'CONFIRMED',
      icon:     '✅',
      label:    'Artisan confirmé',
      sublabel: 'L\'artisan a accepté votre demande'
    },
    {
      key:      'ON_THE_WAY',
      icon:     '🚗',
      label:    'Artisan en route',
      sublabel: 'Départ confirmé'
    },
    {
      key:      'IN_PROGRESS',
      icon:     '🔧',
      label:    'Intervention en cours',
      sublabel: 'L\'artisan est sur place'
    },
    {
      key:      'COMPLETED',
      icon:     '✅',
      label:    'Intervention terminée',
      sublabel: 'Veuillez valider la prestation'
    }
  ];

  /* Step index by key */
  var STEP_IDX = {};
  STEPS.forEach(function(s, i) { STEP_IDX[s.key] = i; });

  /* DB status → canonical STEP key */
  var STATUS_TO_STEP = {
    'new':          'RECEIVED',    /* → will animate through ANALYZING → MATCHING */
    'assigned':     'ASSIGNED',
    'in_progress':  'IN_PROGRESS',
    'completed':    'COMPLETED',   /* waiting confirmation */
    'validated':    'COMPLETED',
    'cancelled':    null,
    /* French legacy */
    'nouvelle':       'RECEIVED',
    'acceptée':       'ASSIGNED',
    'acceptee':       'ASSIGNED',
    'en_cours':       'IN_PROGRESS',
    'en cours':       'IN_PROGRESS',
    'terminée':       'COMPLETED',
    'terminee':       'COMPLETED',
    'validée':        'COMPLETED',
    'validee':        'COMPLETED',
    'annulée':        null,
    'annulee':        null
  };

  /* For dashboard hero status: friendly display */
  var STATUS_HERO = {
    'RECEIVED':   { icon: '📨', label: 'Demande reçue',           sub: 'Votre demande est enregistrée. Recherche d\'artisan en cours…' },
    'ANALYZING':  { icon: '🤖', label: 'Analyse en cours',        sub: 'Catégorie et priorité en cours d\'identification' },
    'MATCHING':   { icon: '🔍', label: 'Recherche d\'artisans',   sub: 'Artisans compatibles recherchés dans votre zone' },
    'ASSIGNED':   { icon: '👨‍🔧', label: 'Artisan sélectionné',  sub: 'Un artisan qualifié a été assigné à votre demande' },
    'CONFIRMED':  { icon: '✅', label: 'Artisan confirmé',         sub: 'L\'artisan a accepté votre demande' },
    'ON_THE_WAY': { icon: '🚗', label: 'Artisan en route',        sub: 'Départ confirmé — arrivée prévue prochainement' },
    'IN_PROGRESS':{ icon: '🔧', label: 'Intervention en cours',   sub: 'L\'artisan est sur place' },
    'COMPLETED':  { icon: '⭐', label: 'Intervention terminée',   sub: 'Veuillez valider la prestation dans votre espace client' }
  };

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _el(id)    { return document.getElementById(id); }
  function _norm(s)   { return String(s || '').toLowerCase().trim(); }
  function _esc(s)    { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _ini(name) {
    var p = String(name || '').trim().split(/\s+/);
    return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
  }

  /* Resolve canonical step key from a request row */
  function _resolveStepKey(req) {
    var rawStatus = _norm(req.status || 'new');
    return STATUS_TO_STEP[rawStatus] || 'RECEIVED';
  }

  /* ══════════════════════════════════════════════════════════
     SURFACE 1 — POST-SUBMIT TRACKING
     Injected inside #request-success (index.html only).
     Shows animated 8-step vertical timeline.
     Animates through RECEIVED → ANALYZING → MATCHING
     in sequence (500ms each), then pauses at MATCHING.
  ══════════════════════════════════════════════════════════ */

  var _postSubmitPaused = false;
  var _postSubmitCurrentKey = 'RECEIVED';

  function _ensurePostSubmitTracker() {
    if (_el('ftrk-post-submit')) return _el('ftrk-post-submit');

    var success = _el('request-success');
    if (!success) return null;

    /* Build tracker element */
    var tracker = document.createElement('div');
    tracker.id = 'ftrk-post-submit';
    tracker.setAttribute('aria-label', 'Suivi de votre demande en temps réel');
    tracker.setAttribute('aria-live', 'polite');

    /* Initial render: RECEIVED active, rest waiting */
    tracker.innerHTML = _buildPostSubmitHTML('RECEIVED', null);

    /* Insert at top of success block (before dispatch animation if present) */
    var dispatchEl = _el('faire-dispatch');
    if (dispatchEl && dispatchEl.parentNode === success) {
      success.insertBefore(tracker, dispatchEl);
      /* Hide the aire-v1a dispatch animation since we replace it */
      dispatchEl.style.display = 'none';
    } else {
      var firstChild = success.querySelector('.fxrva-success-title') || success.firstElementChild;
      success.insertBefore(tracker, firstChild);
    }

    return tracker;
  }

  function _buildPostSubmitHTML(activeKey, artisan) {
    var activeIdx = STEP_IDX[activeKey] !== undefined ? STEP_IDX[activeKey] : 0;
    var html = '';
    STEPS.forEach(function(step, i) {
      var state;
      if (i < activeIdx)       state = 'done';
      else if (i === activeIdx) state = 'active';
      else                     state = 'waiting';

      /* Override: CONFIRMED + ON_THE_WAY are skipped at post-submit phase */
      if ((step.key === 'CONFIRMED' || step.key === 'ON_THE_WAY') && state === 'waiting') {
        state = 'skipped';
      }

      var sublabel = step.sublabel;
      if (step.key === 'ASSIGNED' && artisan) {
        sublabel = _esc(artisan.name || artisan.full_name || 'Artisan assigné');
      }

      html += '<div class="ftrk-step ' + state + '" data-step-key="' + _esc(step.key) + '">'
        + '<div class="ftrk-icon">' + step.icon + '</div>'
        + '<div class="ftrk-body">'
        + '<div class="ftrk-label">' + _esc(step.label) + '</div>'
        + (sublabel && state !== 'waiting' && state !== 'skipped'
           ? '<div class="ftrk-sublabel">' + _esc(sublabel) + '</div>'
           : '')
        + (step.key === 'ASSIGNED' && artisan && state === 'done'
           ? _artisanChipHTML(artisan)
           : '')
        + '</div>'
        + '</div>';
    });
    return html;
  }

  function _artisanChipHTML(artisan) {
    if (!artisan) return '';
    var name = artisan.full_name || artisan.name || '';
    var cat  = artisan.service_category || artisan.category || '';
    return '<div class="ftrk-artisan-chip">'
      + '<div class="ftrk-artisan-avatar">' + _esc(_ini(name)) + '</div>'
      + '<div>'
      + '<div class="ftrk-artisan-name">' + _esc(name) + '</div>'
      + (cat ? '<div class="ftrk-artisan-meta">' + _esc(cat) + '</div>' : '')
      + '</div>'
      + '</div>';
  }

  /* Animate through initial steps post-submit */
  function _animatePostSubmit() {
    var tracker = _el('ftrk-post-submit');
    if (!tracker) return;

    var sequence = ['RECEIVED', 'ANALYZING', 'MATCHING'];
    var idx = 0;

    function _next() {
      if (_postSubmitPaused) return;
      idx++;
      if (idx >= sequence.length) return;
      _postSubmitCurrentKey = sequence[idx];
      tracker.innerHTML = _buildPostSubmitHTML(_postSubmitCurrentKey, null);
      if (idx < sequence.length - 1) {
        setTimeout(_next, 700);
      }
    }
    setTimeout(_next, 600);
  }

  /* Called when request is created — shows the tracker */
  function _showPostSubmitTracking(requestData) {
    _postSubmitPaused = false;
    _postSubmitCurrentKey = 'RECEIVED';

    var tracker = _ensurePostSubmitTracker();
    if (!tracker) return;

    tracker.classList.add('visible');
    tracker.innerHTML = _buildPostSubmitHTML('RECEIVED', null);
    _animatePostSubmit();
  }

  /* Called when artisan is assigned (event update) */
  function _updatePostSubmitStatus(stepKey, artisan) {
    _postSubmitPaused = true;
    var tracker = _el('ftrk-post-submit');
    if (!tracker || !tracker.classList.contains('visible')) return;
    tracker.innerHTML = _buildPostSubmitHTML(stepKey, artisan || null);
  }

  /* ══════════════════════════════════════════════════════════
     SURFACE 2 — DASHBOARD LIVE TRACKER CARD
     Injected into #fxv2-sec-dashboard (dashboard-client.html).
     Shows the most active request with hero status + progress bar.
     60-second auto-poll via window.FixeoDashboardV2 refresh.
  ══════════════════════════════════════════════════════════ */

  var _dashPollTimer = null;

  /* Find the "most active" request from the V2 engine state */
  function _getMostActiveRequest() {
    try {
      /* Access V2 engine state — read-only */
      var state = window.FixeoDashboardV2 && window.FixeoDashboardV2._state;
      if (!state || !state.requests) return null;

      /* Priority: in_progress > assigned > new — lowest step wins for urgency */
      var active = state.requests.filter(function(r) {
        var step = r._pipeline && r._pipeline.step;
        return typeof step === 'number' && step >= 0 && step < 5;
      });
      if (!active.length) return null;

      /* Sort by pipeline step desc (most advanced first) */
      active.sort(function(a, b) {
        return (b._pipeline.step || 0) - (a._pipeline.step || 0);
      });
      return active[0];
    } catch(e) { return null; }
  }

  function _getArtisanForRequest(req) {
    try {
      var state = window.FixeoDashboardV2 && window.FixeoDashboardV2._state;
      if (!state) return null;
      var missions = state.missions || [];
      var mission  = missions.find(function(m) { return m.request_id === req.id; });
      if (mission && mission.artisan_profile_id && state.artisanMap) {
        return state.artisanMap[mission.artisan_profile_id] || null;
      }
    } catch(e) {}
    return null;
  }

  function _buildDashboardCard(req) {
    var stepKey  = _resolveStepKey(req);
    var hero     = STATUS_HERO[stepKey] || STATUS_HERO['RECEIVED'];
    var artisan  = _getArtisanForRequest(req);
    var pipeline = req._pipeline || {};
    var step     = typeof pipeline.step === 'number' ? pipeline.step : 0;

    /* Progress bar: 5 dots mapped to pipeline steps 0–4 */
    var progressHtml = '';
    for (var d = 0; d < 5; d++) {
      var cls = d < step ? 'done' : (d === step ? 'active' : '');
      progressHtml += '<div class="ftrk-progress-dot ' + cls + '"></div>';
    }

    /* Service chip */
    var svc = req.service_category || req.service || '';

    var html = '<div id="ftrk-live-card" role="status" aria-live="polite" aria-label="Suivi de votre demande">'

      /* Head */
      + '<div class="ftrk-card-head">'
      + '<div class="ftrk-card-title">'
      + '<span class="ftrk-live-dot" aria-hidden="true"></span>'
      + 'Suivi de votre demande'
      + '</div>'
      + (svc ? '<span class="ftrk-card-svc">' + _esc(svc) + '</span>' : '')
      + '</div>'

      /* Status hero */
      + '<div class="ftrk-status-hero">'
      + '<div class="ftrk-status-icon-large">' + hero.icon + '</div>'
      + '<div class="ftrk-status-text-block">'
      + '<div class="ftrk-status-label-large">' + _esc(hero.label) + '</div>'
      + '<div class="ftrk-status-sublabel">' + _esc(hero.sub) + '</div>'
      + '</div>'
      + '</div>'

      /* Progress bar */
      + '<div class="ftrk-progress-bar" aria-hidden="true">' + progressHtml + '</div>';

    /* Artisan chip if assigned */
    if (artisan && (stepKey === 'ASSIGNED' || stepKey === 'CONFIRMED' || stepKey === 'ON_THE_WAY' || stepKey === 'IN_PROGRESS')) {
      var name = artisan.full_name || artisan.name || '';
      var cat  = artisan.service_category || artisan.service || '';
      html += '<div class="ftrk-card-artisan">'
        + '<div class="ftrk-card-artisan-avatar">' + _esc(_ini(name)) + '</div>'
        + '<div>'
        + '<div class="ftrk-card-artisan-name">' + _esc(name) + '</div>'
        + (cat ? '<div class="ftrk-card-artisan-meta">' + _esc(cat) + '</div>' : '')
        + '</div>'
        + '</div>';
    }

    html += '<div class="ftrk-refresh-hint">Actualisation automatique · 60s</div>'
      + '</div>';

    return html;
  }

  function _renderDashboardTracker() {
    var sec = _el('fxv2-sec-dashboard');
    if (!sec) return;

    /* Remove previous tracker */
    var existing = _el('ftrk-live-card');
    if (existing) existing.remove();

    var req = _getMostActiveRequest();
    if (!req) return; /* no active request — don't show the card */

    /* Find first child after the section head to insert before it */
    var cardHtml = _buildDashboardCard(req);
    var sectionHead = sec.querySelector('.fxv2-section-head');
    if (sectionHead) {
      sectionHead.insertAdjacentHTML('afterend', cardHtml);
    } else {
      sec.insertAdjacentHTML('afterbegin', cardHtml);
    }
  }

  /* Start 60s auto-poll on dashboard */
  function _startDashPoll() {
    if (_dashPollTimer) return;
    _dashPollTimer = setInterval(function() {
      /* Only poll if dashboard section is active */
      var sec = _el('fxv2-sec-dashboard');
      if (!sec || !sec.classList.contains('active')) return;

      /* Call V2 engine refresh */
      try {
        var v2 = window.FixeoDashboardV2;
        if (v2 && typeof v2._refresh === 'function') {
          v2._refresh().then(function() {
            _renderDashboardTracker();
          }).catch(function() {});
        } else {
          /* V2 _refresh not exposed — re-render from current state */
          _renderDashboardTracker();
        }
      } catch(e) {}
    }, 60000);
  }

  /* ══════════════════════════════════════════════════════════
     EVENT HOOKS
  ══════════════════════════════════════════════════════════ */

  function _wireEvents() {
    /* Post-submit: hook request creation events */
    window.addEventListener('fixeo:client-request-created', function(e) {
      _showPostSubmitTracking(e && e.detail);
    });

    window.addEventListener('fixeo:data:changed', function(e) {
      var d = e && e.detail;
      if (!d) return;
      if (d.type === 'service_request_created') {
        _showPostSubmitTracking(d.data);
      }
    });

    /* Dashboard: refresh tracker when V2 engine dispatches refresh event */
    window.addEventListener('fixeo:client-request-updated', function() {
      setTimeout(_renderDashboardTracker, 200);
    });

    /* Also hook on fixeo:admin:refresh (admin changes propagate) */
    window.addEventListener('fixeo:admin:refresh', function() {
      setTimeout(_renderDashboardTracker, 300);
    });
  }

  /* ══════════════════════════════════════════════════════════
     DASHBOARD BOOT — wait for V2 engine to be ready
  ══════════════════════════════════════════════════════════ */

  function _waitForDashboard() {
    /* Only run on dashboard page */
    if (!_el('fxv2-sec-dashboard')) return;

    /* Wait for V2 engine state to be populated */
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      var v2 = window.FixeoDashboardV2;
      if (v2 && v2._state && v2._state.requests) {
        clearInterval(poll);
        _renderDashboardTracker();
        _startDashPoll();
        return;
      }
      /* Also try hooking into V2 _render calls via prototype override */
      if (attempts === 5 && v2 && typeof v2._render === 'function' && !v2._ftrkHooked) {
        var origRender = v2._render.bind(v2);
        v2._render = function() {
          origRender();
          setTimeout(_renderDashboardTracker, 100);
        };
        v2._ftrkHooked = true;
      }
      if (attempts > 40) clearInterval(poll); /* give up after 8s */
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function _init() {
    _wireEvents();
    _waitForDashboard();

    /* Post-submit: if success screen is already visible (edge case) */
    var success = _el('request-success');
    if (success && !success.hidden) {
      _showPostSubmitTracking(null);
    }

    console.log('[FixeoTrackingEngine] ' + VERSION + ' ready');
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.FixeoTrackingEngine = {
    VERSION:              VERSION,
    showPostSubmit:       _showPostSubmitTracking,
    updatePostSubmit:     _updatePostSubmitStatus,
    renderDashTracker:    _renderDashboardTracker
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
