'use strict';
/**
 * FIXEO Estimator Prototype Adapter — Phase 7C.8B
 * Status: PROTOTYPE INTERNE — NON PRODUCTION
 *
 * Bridges the UI prototype to the dormant Estimator Orchestrator V1.
 * The UI calls ONLY these adapter methods — never the engine directly.
 *
 * Monetary values always come from orchestrator outcome. The adapter
 * passes through data without computing prices.
 */

var orch = require('../../orchestrator/estimator-orchestrator-v1');

/**
 * Start a new estimator session.
 * @param {object} context - { entry_point, service_hint, metier_hint, ... }
 * @returns {object} - orchestrator result { ok, session, ... }
 */
function startSession(context) {
  return orch.startEstimator(context || {});
}

/**
 * Get the next step for the current session.
 * @param {object} session
 * @returns {object} - { ok, step }
 */
function getNextStep(session) {
  return orch.getNextEstimatorStep(session);
}

/**
 * Answer a pending question.
 * @param {object} session
 * @param {string} question_id
 * @param {*} answer
 * @returns {object} - { ok, session }
 */
function answerQuestion(session, question_id, answer) {
  return orch.answerEstimatorQuestion(session, question_id, answer);
}

/**
 * Evaluate the session (call engine through orchestrator).
 * @param {object} session
 * @returns {object} - { ok, session }
 */
function evaluate(session) {
  return orch.evaluateEstimator(session);
}

/**
 * Build the dormant pricing context token.
 * @param {object} session
 * @returns {object}
 */
function buildToken(session) {
  return orch.buildPricingContextToken(session);
}

/**
 * Resolve a complete flow automatically (for fixture demos).
 * Answers all pending questions with provided answers map or defaults.
 * @param {object} session
 * @param {object} answersMap - { question_id: answer }
 * @param {object} defaults - default answers by answer_type
 * @returns {object} - { ok, session, outcome }
 */
function resolveFlow(session, answersMap, defaults) {
  answersMap = answersMap || {};
  defaults = defaults || { boolean: false, integer: 2, string: null };
  var s = session;
  var MAX = 20;
  var iter = 0;

  while ((s.pending_questions || []).length > 0 && iter++ < MAX) {
    var q = s.pending_questions[0];
    var answer;
    if (answersMap.hasOwnProperty(q.question_id)) {
      answer = answersMap[q.question_id];
    } else if (q.answer_type === 'boolean') {
      answer = defaults.boolean;
    } else if (q.answer_type === 'integer') {
      answer = defaults.integer;
    } else if (q.options && q.options.length > 0) {
      answer = q.options[0];
    } else {
      answer = defaults.string;
    }
    var ar = orch.answerEstimatorQuestion(s, q.question_id, answer);
    if (!ar.ok) return { ok: false, error: ar.error };
    s = ar.session;
  }

  // Terminal states that don't need engine call
  var noEngineStates = ['SAFETY_STOP', 'ROUTE_REQUIRED', 'QUOTE_REQUIRED', 'REQUALIFY'];
  if (noEngineStates.includes(s.state)) {
    return { ok: true, session: s, outcome: s.outcome };
  }

  if (s.state === 'READY_FOR_ENGINE') {
    var ev = orch.evaluateEstimator(s);
    if (!ev.ok) return { ok: false, error: ev.error };
    return { ok: true, session: ev.session, outcome: ev.session.outcome };
  }

  return { ok: false, error: { code: 'UNRESOLVED_FLOW', state: s.state } };
}

/**
 * Select a métier (in METIER_SELECTION state).
 * @param {object} session
 * @param {string} metier
 * @returns {object}
 */
function selectMetier(session, metier) {
  return orch.answerEstimatorQuestion(session, 'metier_selection', metier);
}

/**
 * Select a service (in SERVICE_SELECTION state).
 * @param {object} session
 * @param {string} service_code
 * @returns {object}
 */
function selectService(session, service_code) {
  return orch.answerEstimatorQuestion(session, 'service_selection', service_code);
}

module.exports = {
  startSession,
  getNextStep,
  answerQuestion,
  evaluate,
  buildToken,
  resolveFlow,
  selectMetier,
  selectService,
};
