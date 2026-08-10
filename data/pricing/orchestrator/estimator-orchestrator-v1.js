'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Core
 * Phase 7C.7 | DORMANT — No production integration
 *
 * Implements the frozen Phase 7C.6 orchestration contract.
 *
 * API:
 *   startEstimator(context)
 *   answerEstimatorQuestion(session, question_id, answer)
 *   getNextEstimatorStep(session)
 *   evaluateEstimator(session)
 *   buildPricingContextToken(session)
 *
 * NEVER:
 *   - calculates monetary values
 *   - imports legacy pricing files
 *   - accesses DOM / network / localStorage / Supabase
 *   - applies city or urgency price modifiers
 */

var path = require('path');
var sessionModule   = require('./estimator-session-v1');
var resolver        = require('./estimator-service-resolver-v1');
var planner         = require('./estimator-question-planner-v1');
var mapper          = require('./estimator-outcome-mapper-v1');
var handoff         = require('./estimator-handoff-v1');
// Engine — sole price calculator
var engine          = require(path.join(__dirname, '../engine/pricing-engine-core-v1'));

var INPUTS = null;
function getInputs() {
  if (!INPUTS) INPUTS = require(path.join(__dirname, '../consolidation/canonical-inputs.v1.draft.json'));
  return INPUTS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety and routing trigger rules (applied by orchestrator BEFORE engine)
// ─────────────────────────────────────────────────────────────────────────────

// Inputs that, when truthy, immediately trigger SAFETY_STOP (before engine)
var ORCHESTRATOR_SAFETY_TRIGGERS = {
  burning_smell:    true,
  scorch_marks:     true,
  active_moisture:  true,
};

// Inputs that, when truthy, immediately trigger ROUTE_REQUIRED (before engine)
var ORCHESTRATOR_ROUTE_TRIGGERS = {
  distributor_equipment_involved: true,
  multi_split:                    true,
  ddr_rcd_involved:               true,
};

// Menuiserie: batch >1 → QUOTE_REQUIRED (dormant batch rules)
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
 * entryContext fields:
 *   entry_point: DIRECT_CTA | SERVICE_CARD | ARTISAN_PROFILE | RAFI | RESERVATION_FLOW | DEEP_LINK
 *   metier_hint: optional canonical métier slug
 *   service_hint: optional canonical service code
 *   free_text: optional user text (no AI classifier in V1)
 *   city_slug: optional — stored only, no price effect
 *   artisan_id: optional — stored only, no price effect
 *   urgency_context: optional — stored only, no price effect
 *   known_inputs: optional — pre-known inputs (e.g. from deep link)
 *
 * @returns {{ ok: true, session } | { ok: false, error }}
 */
function startEstimator(entryContext) {
  var ctx = entryContext || {};
  var now = ctx._now || new Date().toISOString();

  // Create base session
  var session = sessionModule.createSession({
    session_id: ctx.session_id,
    entry_context: {
      entry_point: ctx.entry_point || 'DIRECT_CTA',
      metier_hint: ctx.metier_hint || null,
      service_hint: ctx.service_hint || null,
      free_text: ctx.free_text || null,
      city_slug: ctx.city_slug || null,       // context only — no price effect
      artisan_id: ctx.artisan_id || null,     // context only — no price effect
      urgency_context: ctx.urgency_context || null, // context only — no price effect
    },
    known_inputs: ctx.known_inputs || {},
    now: now,
  });

  // Resolve métier
  var metierResult = resolver.resolveMetier(ctx);

  if (!metierResult.ok) {
    return { ok: false, error: metierResult.error };
  }

  // Classifier dependency — no AI classifier in V1
  if (metierResult.needs_classifier) {
    session = sessionModule.cloneSession(session, { state: 'METIER_SELECTION' }, now);
    return {
      ok: true,
      session: session,
      needs_classifier: true,
      message: 'CLASSIFIER_REQUIRED: free_text present but no structured metier_hint. User must select métier.',
    };
  }

  session = sessionModule.cloneSession(session, { metier: metierResult.metier }, now);

  // If we have a canonical service hint
  if (metierResult.service_code) {
    var resolvedSvc = resolver.resolveServiceCode(metierResult.service_code, metierResult.metier);
    if (!resolvedSvc.ok) {
      return { ok: false, error: resolvedSvc.error };
    }
    session = sessionModule.cloneSession(session, { service_code: resolvedSvc.service_code }, now);
    return qualifyOrAdvance(session, now);
  }

  // Have métier, no service — go to service selection
  if (metierResult.metier) {
    var t = sessionModule.transitionState(session, 'SERVICE_SELECTION', now);
    if (!t.ok) return { ok: false, error: t.error };
    var candidates = resolver.getCandidateServices(metierResult.metier);
    return { ok: true, session: t.session, candidate_services: candidates };
  }

  // No métier — user must select
  var t2 = sessionModule.transitionState(session, 'METIER_SELECTION', now);
  if (!t2.ok) return { ok: false, error: t2.error };
  return { ok: true, session: t2.session };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: qualify session after service is known
// ─────────────────────────────────────────────────────────────────────────────
function qualifyOrAdvance(session, now) {
  var pending = planner.planQuestions(session.service_code, session.known_inputs);
  var uiRec = planner.computeUIRecommendation(pending);

  session = sessionModule.cloneSession(session, {
    pending_questions: pending,
    ui_recommendation: uiRec,
  }, now);

  if (pending.length === 0) {
    // No questions — ready for engine directly
    var t = sessionModule.transitionState(session, 'READY_FOR_ENGINE', now);
    if (!t.ok) return { ok: false, error: t.error };
    return { ok: true, session: t.session };
  }

  // Has questions — go to QUALIFICATION
  var t = sessionModule.transitionState(session, 'QUALIFICATION', now);
  if (!t.ok) return { ok: false, error: t.error };
  return { ok: true, session: t.session };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getNextEstimatorStep
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the next step for the given session.
 *
 * Returns one of:
 *   { type: 'METIER_SELECTION', candidate_metiers: [] }
 *   { type: 'SERVICE_SELECTION', candidate_services: [] }
 *   { type: 'QUESTION', ...question }
 *   { type: 'READY', message: 'evaluateEstimator()' }
 *   { type: 'OUTCOME', outcome, ui_recommendation }
 *   { type: 'CONFIRMATION', outcome }
 *
 * @returns {{ ok: true, step } | { ok: false, error }}
 */
function getNextEstimatorStep(session) {
  if (!session) return { ok: false, error: { code: 'NO_SESSION' } };
  var state = session.state;

  if (state === 'METIER_SELECTION') {
    return { ok: true, step: { type: 'METIER_SELECTION', candidate_metiers: resolver.VALID_METIERS } };
  }

  if (state === 'SERVICE_SELECTION') {
    if (!session.metier) return { ok: false, error: { code: 'NO_METIER_FOR_SERVICE_SELECTION' } };
    return { ok: true, step: { type: 'SERVICE_SELECTION', metier: session.metier, candidate_services: resolver.getCandidateServices(session.metier) } };
  }

  if (state === 'QUALIFICATION' || state === 'QUESTION_REQUIRED') {
    var pending = session.pending_questions || [];
    if (pending.length === 0) {
      return { ok: true, step: { type: 'READY', message: 'All questions answered. Call evaluateEstimator().' } };
    }
    var q = pending[0];
    return {
      ok: true,
      step: {
        type: 'QUESTION',
        question_id: q.question_id,
        input_id: q.input_id,
        prompt_key: q.prompt_key,
        answer_type: q.answer_type,
        options: q.options || null,
        priority: q.priority,
        blocking: q.blocking,
        measurement_note: q.measurement_note || null,
        ui_recommendation: session.ui_recommendation || 'MODAL_OK',
        questions_remaining: pending.length,
      },
    };
  }

  if (state === 'READY_FOR_ENGINE') {
    return { ok: true, step: { type: 'READY', message: 'Session ready. Call evaluateEstimator().' } };
  }

  // Terminal / outcome states
  var outcomeStates = ['PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY', 'ADD_ON_READY', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED', 'SAFETY_STOP', 'REQUALIFY'];
  if (outcomeStates.includes(state)) {
    return { ok: true, step: { type: 'OUTCOME', outcome: session.outcome, ui_recommendation: session.ui_recommendation, state: state } };
  }

  if (state === 'CONFIRMATION_READY') {
    return { ok: true, step: { type: 'CONFIRMATION', outcome: session.outcome } };
  }

  if (state === 'ENGINE_EVALUATION') {
    return { ok: true, step: { type: 'EVALUATING', message: 'Engine evaluation in progress.' } };
  }

  return { ok: false, error: { code: 'UNEXPECTED_STATE', message: state } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. answerEstimatorQuestion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record an answer to a question.
 * Validates question_id is pending, validates answer type, checks for
 * immediate safety/routing triggers, replans pending questions.
 *
 * @param {object} session
 * @param {string} question_id — must match pending question
 * @param {*} answer
 * @returns {{ ok: true, session } | { ok: false, error }}
 */
function answerEstimatorQuestion(session, question_id, answer) {
  if (!session) return { ok: false, error: { code: 'NO_SESSION' } };
  var now = new Date().toISOString();

  var pending = session.pending_questions || [];
  var qIdx = pending.findIndex(function(q) { return q.question_id === question_id; });

  if (qIdx === -1) {
    return { ok: false, error: { code: 'UNKNOWN_QUESTION', message: 'Question not in pending list: ' + question_id } };
  }

  var q = pending[qIdx];

  // Fractional hours check — before generic type validation (produces specific error code)
  if (q.input_id === 'hours' && typeof answer === 'number' && !Number.isInteger(answer)) {
    return {
      ok: false,
      error: { code: 'FRACTIONAL_HOURS_NOT_SUPPORTED', message: 'Integer hours only in V1. Got: ' + answer + '. Use PROVIDE_MORE_INFORMATION flow.' },
    };
  }

  // Validate answer type
  var validation = validateAnswer(q, answer);
  if (!validation.ok) return { ok: false, error: validation.error };

  // Record answer
  var newKnownInputs = Object.assign({}, session.known_inputs);
  newKnownInputs[q.input_id] = answer;

  var historyEntry = { question_id: question_id, input_id: q.input_id, answer: answer, priority: q.priority, answered_at: now };

  // Check orchestrator-level safety triggers BEFORE adding to known_inputs
  if (q.priority === 'SAFETY') {
    var safetyTrigger = ORCHESTRATOR_SAFETY_TRIGGERS[q.input_id];
    if (safetyTrigger !== undefined && answer === true) {
      // Safety stop — immediate
      var safetyOutcome = mapper.buildSafetyStop(session.service_code, q.input_id, answer);
      var safetySession = sessionModule.cloneSession(session, {
        known_inputs: newKnownInputs,
        question_history: session.question_history.concat([historyEntry]),
        pending_questions: [],
        qualification_status: 'SAFETY_STOP',
        outcome: safetyOutcome,
        state: 'SAFETY_STOP',
      }, now);
      return { ok: true, session: safetySession };
    }
  }

  // Check orchestrator-level routing triggers
  if (q.priority === 'ROUTING_BOUNDARY') {
    var routeTrigger = ORCHESTRATOR_ROUTE_TRIGGERS[q.input_id];
    if (routeTrigger !== undefined && answer === true) {
      var routeOutcome = mapper.buildRouteRequired(session.service_code, q.input_id, answer);
      var routeSession = sessionModule.cloneSession(session, {
        known_inputs: newKnownInputs,
        question_history: session.question_history.concat([historyEntry]),
        pending_questions: [],
        qualification_status: 'ROUTE_REQUIRED',
        outcome: routeOutcome,
        state: 'ROUTE_REQUIRED',
      }, now);
      return { ok: true, session: routeSession };
    }
  }

  // Check menuiserie batch rules
  if (session.metier === 'menuiserie' && q.input_id in MENUISERIE_BATCH_QUOTE_FIELDS) {
    var rule = MENUISERIE_BATCH_QUOTE_FIELDS[q.input_id];
    if (typeof answer === 'number' && answer > rule.max_standard) {
      var batchOutcome = mapper.mapQuoteRequired(session.service_code, 'MENUISERIE_BATCH_EXCEEDS_STANDARD');
      var batchSession = sessionModule.cloneSession(session, {
        known_inputs: newKnownInputs,
        question_history: session.question_history.concat([historyEntry]),
        pending_questions: [],
        qualification_status: 'QUOTE_REQUIRED',
        outcome: batchOutcome,
        state: 'QUOTE_REQUIRED',
      }, now);
      return { ok: true, session: batchSession };
    }
  }

  // Peinture: painted_m2 = 0 or negative → NEGATIVE_QUANTITY
  var measurementFields = ['painted_m2', 'ceiling_m2', 'surface_m2', 'hours', 'worker_count', 'ac_count', 'item_count', 'cylinder_count', 'lock_count', 'door_count', 'hinge_count', 'drawer_count'];
  if (measurementFields.includes(q.input_id) && typeof answer === 'number' && answer <= 0) {
    return { ok: false, error: { code: 'NEGATIVE_QUANTITY', message: q.input_id + ' must be > 0, got: ' + answer } };
  }


  // Update known_inputs and replan
  var newPending = planner.planQuestions(session.service_code, newKnownInputs);
  var newUIRec = planner.computeUIRecommendation(newPending);

  var nextState = newPending.length > 0 ? 'QUESTION_REQUIRED' : 'READY_FOR_ENGINE';
  // Validate transition
  var allowedFrom = ['QUALIFICATION', 'QUESTION_REQUIRED'];
  if (!allowedFrom.includes(session.state)) {
    return { ok: false, error: { code: 'ILLEGAL_TRANSITION', message: 'Cannot answer question in state: ' + session.state } };
  }

  var updatedSession = sessionModule.cloneSession(session, {
    known_inputs: newKnownInputs,
    question_history: session.question_history.concat([historyEntry]),
    pending_questions: newPending,
    state: nextState,
    ui_recommendation: newUIRec,
  }, now);

  return { ok: true, session: updatedSession };
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer validation
// ─────────────────────────────────────────────────────────────────────────────
function validateAnswer(question, answer) {
  if (answer === null || answer === undefined) {
    return { ok: false, error: { code: 'NULL_ANSWER', message: 'Answer cannot be null for: ' + question.input_id } };
  }

  if (question.answer_type === 'boolean') {
    if (typeof answer !== 'boolean') {
      return { ok: false, error: { code: 'INVALID_INPUT_TYPE', message: question.input_id + ' requires boolean. Got: ' + typeof answer + ' (' + answer + ')' } };
    }
  }

  if (question.answer_type === 'integer') {
    if (!Number.isInteger(answer)) {
      return { ok: false, error: { code: 'INVALID_INPUT_TYPE', message: question.input_id + ' requires integer. Got: ' + answer } };
    }
  }

  if (question.answer_type === 'number') {
    if (typeof answer !== 'number' || isNaN(answer)) {
      return { ok: false, error: { code: 'INVALID_INPUT_TYPE', message: question.input_id + ' requires number. Got: ' + answer } };
    }
  }

  if (question.answer_type === 'enum' && question.options) {
    if (!question.options.includes(answer)) {
      return { ok: false, error: { code: 'INVALID_ENUM_VALUE', message: question.input_id + ' must be one of: ' + question.options.join(', ') + '. Got: ' + answer } };
    }
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. evaluateEstimator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invoke the pricing engine and map result to outcome.
 * Session must be in READY_FOR_ENGINE state.
 *
 * @returns {{ ok: true, session } | { ok: false, error }}
 */
function evaluateEstimator(session) {
  if (!session) return { ok: false, error: { code: 'NO_SESSION' } };
  var now = new Date().toISOString();

  if (session.state !== 'READY_FOR_ENGINE') {
    return { ok: false, error: { code: 'NOT_READY_FOR_ENGINE', message: 'Session must be in READY_FOR_ENGINE state. Current: ' + session.state } };
  }

  if (!session.service_code) {
    return { ok: false, error: { code: 'NO_SERVICE_CODE', message: 'service_code required before engine evaluation' } };
  }

  // Transition to ENGINE_EVALUATION
  var t1 = sessionModule.transitionState(session, 'ENGINE_EVALUATION', now);
  if (!t1.ok) return { ok: false, error: t1.error };
  var evaluatingSession = t1.session;

  // Build engine payload — only canonical inputs
  var enginePayload = {
    service_code: session.service_code,
    inputs: buildEngineInputs(session),
  };

  // SOLE PRICE CALCULATOR — evaluateFixeoPrice from dormant engine
  var engineResult = engine.evaluateFixeoPrice(enginePayload);

  // Map result to outcome
  var outcome = mapper.mapEngineResultToOutcome(engineResult, session.service_code, session);
  var targetState = mapper.outcomeTypeToState(outcome.outcome_type);

  if (!targetState) {
    return { ok: false, error: { code: 'UNMAPPABLE_OUTCOME', message: outcome.outcome_type } };
  }

  // Validate transition from ENGINE_EVALUATION
  var t2 = sessionModule.transitionState(evaluatingSession, targetState, now);
  if (!t2.ok) return { ok: false, error: t2.error };

  var finalSession = sessionModule.cloneSession(t2.session, {
    engine_result: engineResult,
    outcome: outcome,
    qualification_status: outcome.outcome_type,
  }, now);

  return { ok: true, session: finalSession };
}

/**
 * Build engine inputs from session known_inputs.
 * Only pass canonical input fields (must exist in canonical-inputs registry).
 * Excludes UI-only metadata keys that are not canonical inputs.
 */
var NON_ENGINE_KEYS = new Set(['entry_point', 'metier_hint', 'service_hint', 'free_text', 'city_slug', 'artisan_id', 'urgency_context', '_now', 'session_id']);

function buildEngineInputs(session) {
  var knownInputs = session.known_inputs || {};
  var inputs = {};
  var inputDefs = getInputs().inputs;
  Object.keys(knownInputs).forEach(function(k) {
    if (!NON_ENGINE_KEYS.has(k) && inputDefs[k]) {
      inputs[k] = knownInputs[k];
    }
  });
  return inputs;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. buildPricingContextToken — delegated to handoff module
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build pricing context token from completed session.
 * @returns {{ ok: true, token } | { ok: false, error }}
 */
function buildPricingContextToken(session) {
  return handoff.buildPricingContextToken(session);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: parse deep link query parameters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse /estimation?metier=...&service=... into entry context.
 * Pure function — no browser URL access.
 *
 * @param {object} params — { metier, service, city }
 * @returns {object} entry context
 */
function parseDeepLinkParams(params) {
  return {
    entry_point: 'DEEP_LINK',
    metier_hint: params.metier || null,
    service_hint: params.service || null,
    city_slug: params.city || null,
    urgency_context: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. selectService
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Phase 7C.9K.5 — Public contract for advancing from SERVICE_SELECTION.
 *
 * Validates that:
 *   - session exists and is in SERVICE_SELECTION state
 *   - session.metier is set
 *   - serviceCode is a known candidate for session.metier (no cross-métier)
 *
 * Then resolves the canonical service_code, clones the session with it,
 * and advances via qualifyOrAdvance → QUALIFICATION or READY_FOR_ENGINE.
 *
 * Never computes or exposes prices.
 *
 * @param {object} session — reconstructed session object (from unsealToken)
 * @param {string} serviceCode — canonical service_code chosen by the user
 * @param {string} [now] — ISO timestamp (injectable for tests)
 * @returns {{ ok: true, session } | { ok: false, error }}
 */
function selectService(session, serviceCode, now) {
  if (!session) {
    return { ok: false, error: { code: 'NO_SESSION', message: 'Session required' } };
  }

  if (session.state !== 'SERVICE_SELECTION') {
    return { ok: false, error: {
      code: 'ILLEGAL_STATE',
      message: 'selectService requires SERVICE_SELECTION state. Current: ' + session.state,
    } };
  }

  if (!session.metier) {
    return { ok: false, error: { code: 'NO_METIER', message: 'session.metier required for selectService' } };
  }

  if (!serviceCode || typeof serviceCode !== 'string' || !serviceCode.trim()) {
    return { ok: false, error: { code: 'MISSING_SERVICE_CODE', message: 'serviceCode is required' } };
  }

  // Validate serviceCode is a known candidate for THIS session's métier.
  // This prevents cross-métier injections (e.g. electricite code on plomberie session).
  var candidates = resolver.getCandidateServices(session.metier);
  var isCandidate = candidates.some(function(c) { return c.service_code === serviceCode; });
  if (!isCandidate) {
    return { ok: false, error: {
      code: 'UNKNOWN_SERVICE_CODE',
      message: 'service_code not in candidate list for metier ' + session.metier + ': ' + serviceCode,
    } };
  }

  // Resolve canonical service_code through existing resolver (validates against registry).
  var resolvedSvc = resolver.resolveServiceCode(serviceCode, session.metier);
  if (!resolvedSvc.ok) {
    return { ok: false, error: resolvedSvc.error };
  }

  var ts = now || new Date().toISOString();

  // Clone session with the chosen service_code (preserves all other fields).
  var updated = sessionModule.cloneSession(session, { service_code: resolvedSvc.service_code }, ts);

  // Advance: QUALIFICATION (has questions) or READY_FOR_ENGINE (no questions).
  return qualifyOrAdvance(updated, ts);
}

module.exports = {
  startEstimator: startEstimator,
  selectService: selectService,
  answerEstimatorQuestion: answerEstimatorQuestion,
  getNextEstimatorStep: getNextEstimatorStep,
  evaluateEstimator: evaluateEstimator,
  buildPricingContextToken: buildPricingContextToken,
  parseDeepLinkParams: parseDeepLinkParams,
  // Expose for testing
  _qualifyOrAdvance: qualifyOrAdvance,
  _buildEngineInputs: buildEngineInputs,
};
