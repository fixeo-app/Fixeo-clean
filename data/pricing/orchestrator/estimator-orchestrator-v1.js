'use strict';

/**
 * FIXEO Estimator Orchestrator V1 — Core
 *
 * Canonical orchestration layer between:
 *   - Estimator entry context
 *   - service resolver
 *   - qualification planner
 *   - FIXEO pricing engine
 *   - outcome mapper
 *
 * API:
 *   startEstimator(context)
 *   selectService(session, serviceCode)
 *   answerEstimatorQuestion(session, question_id, answer)
 *   getNextEstimatorStep(session)
 *   evaluateEstimator(session)
 *   buildPricingContextToken(session)
 *   parseDeepLinkParams(params)
 *
 * IMPORTANT:
 *   - This module does NOT classify arbitrary free text with AI.
 *   - Free text without a structured métier hint leads to METIER_SELECTION.
 *   - The UI may present this as the "Comprendre" stage, but must never
 *     invent a métier or service that the resolver has not validated.
 *
 * NEVER:
 *   - calculates monetary values
 *   - imports legacy pricing files
 *   - accesses DOM / network / localStorage / Supabase
 *   - applies city or urgency price modifiers
 */

var path = require('path');

var sessionModule = require('./estimator-session-v1');
var resolver      = require('./estimator-service-resolver-v1');
var discovery = require('./estimator-discovery-routing-v1');
var planner       = require('./estimator-question-planner-v1');
var mapper        = require('./estimator-outcome-mapper-v1');
var handoff       = require('./estimator-handoff-v1');

// Engine — sole price calculator.
var engine = require(
  path.join(__dirname, '../engine/pricing-engine-core-v1')
);

var INPUTS = null;

function getInputs() {
  if (!INPUTS) {
    INPUTS = require(
      path.join(
        __dirname,
        '../consolidation/canonical-inputs.v1.draft.json'
      )
    );
  }

  return INPUTS;
}


// ─────────────────────────────────────────────────────────────────────────────
// Entry-context normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Existing public UIs do not all use the same field names.
 *
 * Canonical orchestrator fields:
 *   entry_point
 *   metier_hint
 *   service_hint
 *   free_text
 *   city_slug
 *   artisan_id
 *   urgency_context
 *
 * Browser aliases accepted:
 *   source      -> entry_point
 *   description -> free_text
 *   city         -> city_slug
 *   urgency      -> urgency_context
 *
 * No alias has pricing authority.
 */

var VALID_ENTRY_POINTS = new Set([
  'DIRECT_CTA',
  'SERVICE_CARD',
  'ARTISAN_PROFILE',
  'RAFI',
  'RESERVATION_FLOW',
  'DEEP_LINK',
]);

function cleanString(value, maxLength) {
  if (value === null || value === undefined) return null;

  var s = String(value).trim();

  if (!s) return null;

  if (maxLength && s.length > maxLength) {
    s = s.slice(0, maxLength);
  }

  return s;
}

function toSimpleSlug(value, maxLength) {
  var s = cleanString(value, maxLength);

  if (!s) return null;

  s = s.toLowerCase();

  try {
    if (typeof s.normalize === 'function') {
      s = s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    }
  } catch (_) {
    // Keep original normalized string if Unicode normalization is unavailable.
  }

  s = s
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return s || null;
}

function normalizeEntryPoint(ctx) {
  var explicit = cleanString(ctx.entry_point, 64);

  if (explicit) {
    explicit = explicit.toUpperCase();

    if (VALID_ENTRY_POINTS.has(explicit)) {
      return explicit;
    }
  }

  var source = cleanString(ctx.source, 120);

  if (!source) return 'DIRECT_CTA';

  source = source.toLowerCase();

  if (
    source.indexOf('artisan') !== -1 ||
    source.indexOf('profile') !== -1
  ) {
    return 'ARTISAN_PROFILE';
  }

  if (source.indexOf('service') !== -1) {
    return 'SERVICE_CARD';
  }

  if (
    source.indexOf('reservation') !== -1 ||
    source.indexOf('booking') !== -1
  ) {
    return 'RESERVATION_FLOW';
  }

  if (
    source.indexOf('deep') !== -1 ||
    source.indexOf('link') !== -1
  ) {
    return 'DEEP_LINK';
  }

  if (
    source.indexOf('rafi') !== -1 ||
    source.indexOf('hero') !== -1 ||
    source.indexOf('homepage_estimation') !== -1 ||
    source.indexOf('homepage-estimation') !== -1 ||
    source.indexOf('estimation_homepage') !== -1
  ) {
    return 'RAFI';
  }

  return 'DIRECT_CTA';
}

function normalizeKnownInputs(raw) {
  var out = {};

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }

  var registry = getInputs();
  var defs = registry && registry.inputs
    ? registry.inputs
    : {};

  Object.keys(raw).forEach(function(key) {
    if (!Object.prototype.hasOwnProperty.call(defs, key)) {
      return;
    }

    if (raw[key] === undefined) {
      return;
    }

    out[key] = raw[key];
  });

  return out;
}

function normalizeEntryContext(entryContext) {
  var ctx = (
    entryContext &&
    typeof entryContext === 'object' &&
    !Array.isArray(entryContext)
  )
    ? entryContext
    : {};

  var freeText = cleanString(
    ctx.free_text !== undefined
      ? ctx.free_text
      : ctx.description,
    2000
  );

  var cityValue = (
    ctx.city_slug !== undefined
      ? ctx.city_slug
      : ctx.city
  );

  var urgencyValue = (
    ctx.urgency_context !== undefined
      ? ctx.urgency_context
      : ctx.urgency
  );

  return {
    // Internal/test-compatible fields.
    session_id: cleanString(ctx.session_id, 160),
    _now: cleanString(ctx._now, 80),

    // Canonical public context.
    entry_point: normalizeEntryPoint(ctx),

    metier_hint: toSimpleSlug(
      ctx.metier_hint,
      120
    ),

    service_hint: cleanString(
      ctx.service_hint,
      200
    ),

    situation_id: cleanString(ctx.situation_id, 200),
    free_text: freeText,

    city_slug: toSimpleSlug(
      cityValue,
      120
    ),

    artisan_id: cleanString(
      ctx.artisan_id,
      160
    ),

    urgency_context: toSimpleSlug(
      urgencyValue,
      80
    ),

    known_inputs: normalizeKnownInputs(
      ctx.known_inputs
    ),
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Safety and routing trigger rules
// Applied by orchestrator BEFORE engine evaluation.
// ─────────────────────────────────────────────────────────────────────────────

// Inputs that, when true, immediately trigger SAFETY_STOP.
var ORCHESTRATOR_SAFETY_TRIGGERS = {
  burning_smell:   true,
  scorch_marks:    true,
  active_moisture: true,
};

// Inputs that, when true, immediately trigger ROUTE_REQUIRED.
var ORCHESTRATOR_ROUTE_TRIGGERS = {
  distributor_equipment_involved: true,
  multi_split:                     true,
  ddr_rcd_involved:                true,
};

// Menuiserie: batch > 1 → QUOTE_REQUIRED.
var MENUISERIE_BATCH_QUOTE_FIELDS = {
  hinge_count:  { max_standard: 1 },
  drawer_count: { max_standard: 1 },
};


// ─────────────────────────────────────────────────────────────────────────────
// 1. startEstimator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a new estimator session from an entry context.
 *
 * Canonical entryContext fields:
 *
 *   entry_point:
 *     DIRECT_CTA
 *     SERVICE_CARD
 *     ARTISAN_PROFILE
 *     RAFI
 *     RESERVATION_FLOW
 *     DEEP_LINK
 *
 *   metier_hint:
 *     optional canonical métier slug
 *
 *   service_hint:
 *     optional canonical service code
 *
 *   free_text:
 *     optional user text
 *     V1 deliberately contains NO AI free-text classifier
 *
 *   city_slug:
 *     optional context only — no price effect
 *
 *   artisan_id:
 *     optional context only — no price effect
 *
 *   urgency_context:
 *     optional context only — no price effect
 *
 *   known_inputs:
 *     optional pre-known canonical qualification inputs
 *
 * Browser aliases are normalized before orchestration:
 *   source       -> entry_point
 *   description  -> free_text
 *   city         -> city_slug
 *   urgency      -> urgency_context
 *
 * @returns {{ ok: true, session } | { ok: false, error }}
 */
function startEstimator(entryContext) {
  var ctx = normalizeEntryContext(entryContext);
  var situation = discovery.getSituation(ctx.situation_id);
  if(ctx.situation_id && !situation)return {ok:false,error:{code:'UNKNOWN_SITUATION'}};
  if(situation){
    ctx.metier_hint=situation.metier;
    // A situation must be qualified through its server-owned candidate list.
    ctx.service_hint=null;
  }

  var now = ctx._now || new Date().toISOString();

  // Create base session.
  var session = sessionModule.createSession({
    session_id: ctx.session_id,

    entry_context: {
      situation_id: ctx.situation_id || null,
      entry_point: ctx.entry_point || 'DIRECT_CTA',
      metier_hint: ctx.metier_hint || null,
      service_hint: ctx.service_hint || null,
      free_text: ctx.free_text || null,

      // Context only — NEVER modifies price.
      city_slug: ctx.city_slug || null,
      artisan_id: ctx.artisan_id || null,
      urgency_context: ctx.urgency_context || null,
    },

    known_inputs: ctx.known_inputs || {},
    now: now,
  });

  // Resolve métier using structured hints and canonical resolver rules.
  var metierResult = resolver.resolveMetier(ctx);

  if (!metierResult.ok) {
    return {
      ok: false,
      error: metierResult.error,
    };
  }

  /**
   * No fake AI classification.
   *
   * If free text exists but no structured métier can be resolved,
   * the user goes to METIER_SELECTION.
   *
   * The future UI may label this visual stage "Comprendre",
   * but the orchestrator remains deterministic and explicit.
   */
  if (metierResult.needs_classifier) {
    session = sessionModule.cloneSession(
      session,
      {
        state: 'METIER_SELECTION',
      },
      now
    );

    return {
      ok: true,
      session: session,
      needs_classifier: true,
      message:
        'CLASSIFIER_REQUIRED: free_text present but no structured metier_hint. User must select métier.',
    };
  }

  session = sessionModule.cloneSession(
    session,
    {
      metier: metierResult.metier || null,
    },
    now
  );

  // Canonical service already known.
  if (metierResult.service_code) {
    var resolvedSvc = resolver.resolveServiceCode(
      metierResult.service_code,
      metierResult.metier
    );

    if (!resolvedSvc.ok) {
      return {
        ok: false,
        error: resolvedSvc.error,
      };
    }

    session = sessionModule.cloneSession(
      session,
      {
        service_code: resolvedSvc.service_code,
      },
      now
    );

    return qualifyOrAdvance(session, now);
  }

  // Métier known, service still unknown.
  if (metierResult.metier) {
    var t = sessionModule.transitionState(
      session,
      'SERVICE_SELECTION',
      now
    );

    if (!t.ok) {
      return {
        ok: false,
        error: t.error,
      };
    }

    var candidates = discovery.candidates(t.session);

    return {
      ok: true,
      session: t.session,
      candidate_services: candidates,
    };
  }

  // No métier resolved.
  var t2 = sessionModule.transitionState(
    session,
    'METIER_SELECTION',
    now
  );

  if (!t2.ok) {
    return {
      ok: false,
      error: t2.error,
    };
  }

  return {
    ok: true,
    session: t2.session,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Internal — qualify session once service is known
// ─────────────────────────────────────────────────────────────────────────────

function electricalBoundarySession(session, inputs, now) {
  var boundary=require('../engine/climatisation-pilot-v1').guard(session.service_code,inputs,true)||require('../engine/electricity-pilot-v1').guard(session.service_code,inputs,true);
  if(!boundary)return null;
  var outcome=mapper.mapEngineResultToOutcome({ok:false,qualification:boundary,pricing:null},session.service_code,session);
  return {ok:true,session:sessionModule.cloneSession(session,{known_inputs:inputs,pending_questions:[],outcome:outcome,qualification_status:outcome.outcome_type,state:mapper.outcomeTypeToState(outcome.outcome_type)},now)};
}

function qualifyOrAdvance(session, now) {
  var electrical=electricalBoundarySession(session,session.known_inputs,now);
  if(electrical)return electrical;
  var pending = planner.planQuestions(
    session.service_code,
    session.known_inputs
  );

  var uiRec = planner.computeUIRecommendation(
    pending
  );

  session = sessionModule.cloneSession(
    session,
    {
      pending_questions: pending,
      ui_recommendation: uiRec,
    },
    now
  );

  if (pending.length === 0) {
    var ready = sessionModule.transitionState(
      session,
      'READY_FOR_ENGINE',
      now
    );

    if (!ready.ok) {
      return {
        ok: false,
        error: ready.error,
      };
    }

    return {
      ok: true,
      session: ready.session,
    };
  }

  var qualification = sessionModule.transitionState(
    session,
    'QUALIFICATION',
    now
  );

  if (!qualification.ok) {
    return {
      ok: false,
      error: qualification.error,
    };
  }

  return {
    ok: true,
    session: qualification.session,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. getNextEstimatorStep
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the next canonical UI step.
 *
 * Returns one of:
 *
 *   METIER_SELECTION
 *   SERVICE_SELECTION
 *   QUESTION
 *   READY
 *   OUTCOME
 *   CONFIRMATION
 *   EVALUATING
 */
function getNextEstimatorStep(session) {
  if (!session) {
    return {
      ok: false,
      error: {
        code: 'NO_SESSION',
      },
    };
  }

  var state = session.state;

  if (state === 'METIER_SELECTION') {
    return {
      ok: true,
      step: {
        type: 'METIER_SELECTION',
        candidate_metiers: resolver.VALID_METIERS,
      },
    };
  }

  if (state === 'SERVICE_SELECTION') {
    if (!session.metier) {
      return {
        ok: false,
        error: {
          code: 'NO_METIER_FOR_SERVICE_SELECTION',
        },
      };
    }

    return {
      ok: true,
      step: {
        type: 'SERVICE_SELECTION',
        metier: session.metier,
        candidate_services:
          discovery.candidates(session),
      },
    };
  }

  if (
    state === 'QUALIFICATION' ||
    state === 'QUESTION_REQUIRED'
  ) {
    var pending = session.pending_questions || [];

    if (pending.length === 0) {
      return {
        ok: true,
        step: {
          type: 'READY',
          message:
            'All questions answered. Call evaluateEstimator().',
        },
      };
    }

    var q = pending[0];

    return {
      ok: true,
      step: {
        type: 'QUESTION',
        question_id: q.question_id,
        input_id: q.input_id,
        prompt_key: q.prompt_key,
        prompt_fr: q.prompt_fr || (getInputs().inputs[q.input_id]||{}).client_question_fr || null,
        answer_type: q.answer_type,
        options: q.options || null,
        priority: q.priority,
        blocking: q.blocking,
        measurement_note:
          q.measurement_note || null,
        ui_recommendation:
          session.ui_recommendation || 'MODAL_OK',
        questions_remaining:
          pending.length,
      },
    };
  }

  if (state === 'READY_FOR_ENGINE') {
    return {
      ok: true,
      step: {
        type: 'READY',
        message:
          'Session ready. Call evaluateEstimator().',
      },
    };
  }

  var outcomeStates = [
    'PRICE_READY',
    'DIAGNOSTIC_READY',
    'LABOUR_PLUS_PART_READY',
    'ADD_ON_READY',
    'QUOTE_REQUIRED',
    'ROUTE_REQUIRED',
    'SAFETY_STOP',
    'REQUALIFY',
  ];

  if (outcomeStates.includes(state)) {
    return {
      ok: true,
      step: {
        type: 'OUTCOME',
        outcome: session.outcome,
        ui_recommendation:
          session.ui_recommendation,
        state: state,
      },
    };
  }

  if (state === 'CONFIRMATION_READY') {
    return {
      ok: true,
      step: {
        type: 'CONFIRMATION',
        outcome: session.outcome,
      },
    };
  }

  if (state === 'ENGINE_EVALUATION') {
    return {
      ok: true,
      step: {
        type: 'EVALUATING',
        message:
          'Engine evaluation in progress.',
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNEXPECTED_STATE',
      message: state,
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. answerEstimatorQuestion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record one qualification answer.
 *
 * Validates:
 *   - session state
 *   - question identity
 *   - answer type
 *   - safety boundaries
 *   - routing boundaries
 *   - dormant batch constraints
 *
 * Then replans remaining questions.
 */
function answerEstimatorQuestion(
  session,
  question_id,
  answer
) {
  if (!session) {
    return {
      ok: false,
      error: {
        code: 'NO_SESSION',
      },
    };
  }

  var now = new Date().toISOString();

  var pending =
    session.pending_questions || [];

  var qIdx = pending.findIndex(
    function(q) {
      return q.question_id === question_id;
    }
  );

  if (qIdx === -1) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_QUESTION',
        message:
          'Question not in pending list: ' +
          question_id,
      },
    };
  }

  var q = pending[qIdx];

  // Fractional time values are not supported by V1.
  if (
    (
      q.input_id === 'hours' ||
      q.input_id === 'hours_per_worker'
    ) &&
    typeof answer === 'number' &&
    Number.isFinite(answer) &&
    !Number.isInteger(answer)
  ) {
    return {
      ok: false,
      error: {
        code: 'FRACTIONAL_HOURS_NOT_SUPPORTED',
        message:
          'Integer hours only in V1. Got: ' +
          answer +
          '. Use PROVIDE_MORE_INFORMATION flow.',
      },
    };
  }

  var validation =
    validateAnswer(q, answer);

  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
    };
  }

  var newKnownInputs =
    Object.assign(
      {},
      session.known_inputs || {}
    );

  newKnownInputs[q.input_id] = answer;

  var historyEntry = {
    question_id: question_id,
    input_id: q.input_id,
    answer: answer,
    priority: q.priority,
    answered_at: now,
  };

  var previousHistory =
    Array.isArray(session.question_history)
      ? session.question_history
      : [];

  var electrical=electricalBoundarySession(sessionModule.cloneSession(session,{question_history:previousHistory.concat([historyEntry])},now),newKnownInputs,now);
  if(electrical)return electrical;

  // Safety boundaries.
  if (q.priority === 'SAFETY') {
    var safetyTrigger =
      ORCHESTRATOR_SAFETY_TRIGGERS[
        q.input_id
      ];

    if (
      safetyTrigger !== undefined &&
      answer === true
    ) {
      var safetyOutcome =
        mapper.buildSafetyStop(
          session.service_code,
          q.input_id,
          answer
        );

      var safetySession =
        sessionModule.cloneSession(
          session,
          {
            known_inputs:
              newKnownInputs,

            question_history:
              previousHistory.concat(
                [historyEntry]
              ),

            pending_questions: [],

            qualification_status:
              'SAFETY_STOP',

            outcome:
              safetyOutcome,

            state:
              'SAFETY_STOP',
          },
          now
        );

      return {
        ok: true,
        session: safetySession,
      };
    }
  }

  // Routing boundaries.
  if (q.priority === 'ROUTING_BOUNDARY') {
    var routeTrigger =
      ORCHESTRATOR_ROUTE_TRIGGERS[
        q.input_id
      ];

    if (
      routeTrigger !== undefined &&
      answer === true
    ) {
      var routeOutcome =
        mapper.buildRouteRequired(
          session.service_code,
          q.input_id,
          answer
        );

      var routeSession =
        sessionModule.cloneSession(
          session,
          {
            known_inputs:
              newKnownInputs,

            question_history:
              previousHistory.concat(
                [historyEntry]
              ),

            pending_questions: [],

            qualification_status:
              'ROUTE_REQUIRED',

            outcome:
              routeOutcome,

            state:
              'ROUTE_REQUIRED',
          },
          now
        );

      return {
        ok: true,
        session: routeSession,
      };
    }
  }

  // Menuiserie batch boundaries.
  if (
    session.metier === 'menuiserie' &&
    Object.prototype.hasOwnProperty.call(
      MENUISERIE_BATCH_QUOTE_FIELDS,
      q.input_id
    )
  ) {
    var rule =
      MENUISERIE_BATCH_QUOTE_FIELDS[
        q.input_id
      ];

    if (
      typeof answer === 'number' &&
      Number.isFinite(answer) &&
      answer > rule.max_standard
    ) {
      var batchOutcome =
        mapper.mapQuoteRequired(
          session.service_code,
          'MENUISERIE_BATCH_EXCEEDS_STANDARD'
        );

      var batchSession =
        sessionModule.cloneSession(
          session,
          {
            known_inputs:
              newKnownInputs,

            question_history:
              previousHistory.concat(
                [historyEntry]
              ),

            pending_questions: [],

            qualification_status:
              'QUOTE_REQUIRED',

            outcome:
              batchOutcome,

            state:
              'QUOTE_REQUIRED',
          },
          now
        );

      return {
        ok: true,
        session: batchSession,
      };
    }
  }

  // Canonical positive measurement / quantity fields.
  var measurementFields = [
    'painted_m2',
    'ceiling_m2',
    'surface_m2',

    'hours',
    'hours_per_worker',

    'worker_count',
    'workers_count',

    'ac_count',
    'item_count',
    'cylinder_count',
    'lock_count',
    'door_count',
    'hinge_count',
    'drawer_count',
  ];

  if (
    measurementFields.includes(q.input_id) &&
    typeof answer === 'number' &&
    Number.isFinite(answer) &&
    answer <= 0
  ) {
    return {
      ok: false,
      error: {
        code: 'NEGATIVE_QUANTITY',
        message:
          q.input_id +
          ' must be > 0, got: ' +
          answer,
      },
    };
  }

  var newPending =
    planner.planQuestions(
      session.service_code,
      newKnownInputs
    );

  var newUIRec =
    planner.computeUIRecommendation(
      newPending
    );

  var nextState =
    newPending.length > 0
      ? 'QUESTION_REQUIRED'
      : 'READY_FOR_ENGINE';

  var allowedFrom = [
    'QUALIFICATION',
    'QUESTION_REQUIRED',
  ];

  if (!allowedFrom.includes(session.state)) {
    return {
      ok: false,
      error: {
        code: 'ILLEGAL_TRANSITION',
        message:
          'Cannot answer question in state: ' +
          session.state,
      },
    };
  }

  var updatedSession =
    sessionModule.cloneSession(
      session,
      {
        known_inputs:
          newKnownInputs,

        question_history:
          previousHistory.concat(
            [historyEntry]
          ),

        pending_questions:
          newPending,

        state:
          nextState,

        ui_recommendation:
          newUIRec,
      },
      now
    );

  return {
    ok: true,
    session: updatedSession,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Answer validation
// ─────────────────────────────────────────────────────────────────────────────

function validateAnswer(
  question,
  answer
) {
  if (
    answer === null ||
    answer === undefined
  ) {
    return {
      ok: false,
      error: {
        code: 'NULL_ANSWER',
        message:
          'Answer cannot be null for: ' +
          question.input_id,
      },
    };
  }

  if (
    question.answer_type === 'boolean'
  ) {
    if (typeof answer !== 'boolean') {
      return {
        ok: false,
        error: {
          code:
            'INVALID_INPUT_TYPE',

          message:
            question.input_id +
            ' requires boolean. Got: ' +
            typeof answer +
            ' (' +
            answer +
            ')',
        },
      };
    }
  }

  if (
    question.answer_type === 'integer'
  ) {
    if (
      typeof answer !== 'number' ||
      !Number.isFinite(answer) ||
      !Number.isInteger(answer)
    ) {
      return {
        ok: false,
        error: {
          code:
            'INVALID_INPUT_TYPE',

          message:
            question.input_id +
            ' requires integer. Got: ' +
            answer,
        },
      };
    }
  }

  if (
    question.answer_type === 'number'
  ) {
    if (
      typeof answer !== 'number' ||
      !Number.isFinite(answer)
    ) {
      return {
        ok: false,
        error: {
          code:
            'INVALID_INPUT_TYPE',

          message:
            question.input_id +
            ' requires finite number. Got: ' +
            answer,
        },
      };
    }
  }

  if (
    question.answer_type === 'enum' &&
    question.options
  ) {
    if (
      !question.options.includes(answer)
    ) {
      return {
        ok: false,
        error: {
          code:
            'INVALID_ENUM_VALUE',

          message:
            question.input_id +
            ' must be one of: ' +
            question.options.join(', ') +
            '. Got: ' +
            answer,
        },
      };
    }
  }

  return {
    ok: true,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. evaluateEstimator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invoke the canonical FIXEO pricing engine.
 *
 * The orchestrator never calculates monetary values.
 * Session must already be READY_FOR_ENGINE.
 */
function evaluateEstimator(session) {
  if (!session) {
    return {
      ok: false,
      error: {
        code: 'NO_SESSION',
      },
    };
  }

  var now =
    new Date().toISOString();

  if (
    session.state !==
    'READY_FOR_ENGINE'
  ) {
    return {
      ok: false,
      error: {
        code:
          'NOT_READY_FOR_ENGINE',

        message:
          'Session must be in READY_FOR_ENGINE state. Current: ' +
          session.state,
      },
    };
  }

  if (!session.service_code) {
    return {
      ok: false,
      error: {
        code: 'NO_SERVICE_CODE',
        message:
          'service_code required before engine evaluation',
      },
    };
  }

  var t1 =
    sessionModule.transitionState(
      session,
      'ENGINE_EVALUATION',
      now
    );

  if (!t1.ok) {
    return {
      ok: false,
      error: t1.error,
    };
  }

  var evaluatingSession =
    t1.session;

  var enginePayload = {
    service_code:
      session.service_code,

    inputs:
      buildEngineInputs(
        session
      ),
  };

  /**
   * SOLE PRICE CALCULATOR.
   *
   * No city modifier.
   * No urgency modifier.
   * No UI price.
   * No browser price.
   */
  var engineResult =
    engine.evaluateFixeoPrice(
      enginePayload
    );

  var outcome =
    mapper.mapEngineResultToOutcome(
      engineResult,
      session.service_code,
      session
    );

  var targetState =
    mapper.outcomeTypeToState(
      outcome.outcome_type
    );

  if (!targetState) {
    return {
      ok: false,
      error: {
        code:
          'UNMAPPABLE_OUTCOME',

        message:
          outcome.outcome_type,
      },
    };
  }

  var t2 =
    sessionModule.transitionState(
      evaluatingSession,
      targetState,
      now
    );

  if (!t2.ok) {
    return {
      ok: false,
      error:
        t2.error,
    };
  }

  var finalSession =
    sessionModule.cloneSession(
      t2.session,
      {
        engine_result:
          engineResult,

        outcome:
          outcome,

        qualification_status:
          outcome.outcome_type,
      },
      now
    );

  return {
    ok: true,
    session:
      finalSession,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Engine-input boundary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Only canonical qualification inputs may enter the price engine.
 *
 * Context fields remain non-authoritative for price.
 */
var NON_ENGINE_KEYS = new Set([
  'entry_point',
  'metier_hint',
  'service_hint',
  'free_text',
  'description',
  'source',
  'city',
  'city_slug',
  'artisan_id',
  'urgency',
  'urgency_context',
  '_now',
  'session_id',
]);

function buildEngineInputs(session) {
  var knownInputs =
    session.known_inputs || {};

  var inputs = {};

  var registry =
    getInputs();

  var inputDefs =
    registry &&
    registry.inputs
      ? registry.inputs
      : {};

  Object.keys(
    knownInputs
  ).forEach(
    function(key) {
      if (
        NON_ENGINE_KEYS.has(key)
      ) {
        return;
      }

      if (
        !Object.prototype.hasOwnProperty.call(
          inputDefs,
          key
        )
      ) {
        return;
      }

      inputs[key] =
        knownInputs[key];
    }
  );

  return inputs;
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. buildPricingContextToken
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delegate pricing-context construction to the canonical handoff module.
 */
function buildPricingContextToken(
  session
) {
  return handoff.buildPricingContextToken(
    session
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. parseDeepLinkParams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse:
 *
 *   /estimation?metier=...&service=...&city=...
 *
 * into canonical estimator entry context.
 *
 * Pure function — no browser URL access.
 */
function parseDeepLinkParams(
  params
) {
  params = params || {};

  return {
    entry_point:
      'DEEP_LINK',

    metier_hint:
      toSimpleSlug(
        params.metier,
        120
      ),

    service_hint:
      cleanString(
        params.service,
        200
      ),

    city_slug:
      toSimpleSlug(
        params.city,
        120
      ),

    urgency_context:
      null,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. selectService
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advance a SERVICE_SELECTION session.
 *
 * Guarantees:
 *   - session exists
 *   - state is SERVICE_SELECTION
 *   - métier is known
 *   - chosen service belongs to that métier
 *   - canonical resolver approves the service
 *
 * Never computes or exposes prices.
 */
function selectService(
  session,
  serviceCode,
  now
) {
  if (!session) {
    return {
      ok: false,
      error: {
        code: 'NO_SESSION',
        message:
          'Session required',
      },
    };
  }

  if (
    session.state !==
    'SERVICE_SELECTION'
  ) {
    return {
      ok: false,
      error: {
        code:
          'ILLEGAL_STATE',

        message:
          'selectService requires SERVICE_SELECTION state. Current: ' +
          session.state,
      },
    };
  }

  if (!session.metier) {
    return {
      ok: false,
      error: {
        code:
          'NO_METIER',

        message:
          'session.metier required for selectService',
      },
    };
  }

  if (
    !serviceCode ||
    typeof serviceCode !== 'string' ||
    !serviceCode.trim()
  ) {
    return {
      ok: false,
      error: {
        code:
          'MISSING_SERVICE_CODE',

        message:
          'serviceCode is required',
      },
    };
  }

  var canonicalServiceCode =
    serviceCode.trim();

  if (
    canonicalServiceCode.length >
    200
  ) {
    return {
      ok: false,
      error: {
        code:
          'INVALID_SERVICE_CODE',

        message:
          'serviceCode is too long',
      },
    };
  }

  var candidates =
    discovery.candidates(session);

  var isCandidate =
    candidates.some(
      function(candidate) {
        return (
          candidate.service_code ===
          canonicalServiceCode
        );
      }
    );

  if (!isCandidate) {
    return {
      ok: false,
      error: {
        code:
          'UNKNOWN_SERVICE_CODE',

        message:
          'service_code not in candidate list for metier ' +
          session.metier +
          ': ' +
          canonicalServiceCode,
      },
    };
  }

  if(canonicalServiceCode===discovery.quoteCode(session)){
    return {ok:true,session:sessionModule.cloneSession(session,{state:'QUOTE_REQUIRED',service_code:canonicalServiceCode,outcome:discovery.quoteOutcome(session),pending_questions:[]},now)};
  }

  var resolvedSvc =
    resolver.resolveServiceCode(
      canonicalServiceCode,
      session.metier
    );

  if (!resolvedSvc.ok) {
    return {
      ok: false,
      error:
        resolvedSvc.error,
    };
  }

  var ts =
    now ||
    new Date().toISOString();

  var updated =
    sessionModule.cloneSession(
      session,
      {
        service_code:
          resolvedSvc.service_code,
      },
      ts
    );

  return qualifyOrAdvance(
    updated,
    ts
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Public contract
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  startEstimator:
    startEstimator,

  selectService:
    selectService,

  answerEstimatorQuestion:
    answerEstimatorQuestion,

  getNextEstimatorStep:
    getNextEstimatorStep,

  evaluateEstimator:
    evaluateEstimator,

  buildPricingContextToken:
    buildPricingContextToken,

  parseDeepLinkParams:
    parseDeepLinkParams,

  // Explicitly exposed for tests.
  _qualifyOrAdvance:
    qualifyOrAdvance,

  _buildEngineInputs:
    buildEngineInputs,

  _normalizeEntryContext:
    normalizeEntryContext,
};
