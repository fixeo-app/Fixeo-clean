'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Session Model
 * Phase 7C.7 | DORMANT — No production integration
 *
 * Pure session factory and cloner. No DOM, no network, no side effects.
 */

const VALID_STATES = [
  'START',
  'METIER_SELECTION',
  'SERVICE_SELECTION',
  'QUALIFICATION',
  'QUESTION_REQUIRED',
  'READY_FOR_ENGINE',
  'ENGINE_EVALUATION',
  'PRICE_READY',
  'DIAGNOSTIC_READY',
  'LABOUR_PLUS_PART_READY',
  'ADD_ON_READY',
  'QUOTE_REQUIRED',
  'ROUTE_REQUIRED',
  'SAFETY_STOP',
  'REQUALIFY',
  'CONFIRMATION_READY',
];

// Valid transitions: FROM → [allowed TO states]
const VALID_TRANSITIONS = {
  START: ['METIER_SELECTION', 'SERVICE_SELECTION', 'QUALIFICATION', 'READY_FOR_ENGINE'],
  METIER_SELECTION: ['SERVICE_SELECTION'],
  SERVICE_SELECTION: ['QUALIFICATION', 'QUESTION_REQUIRED', 'READY_FOR_ENGINE'],
  QUALIFICATION: ['QUESTION_REQUIRED', 'READY_FOR_ENGINE', 'ROUTE_REQUIRED', 'SAFETY_STOP', 'QUOTE_REQUIRED'],
  QUESTION_REQUIRED: ['QUALIFICATION', 'READY_FOR_ENGINE', 'ROUTE_REQUIRED', 'SAFETY_STOP', 'QUOTE_REQUIRED', 'SERVICE_SELECTION', 'METIER_SELECTION'],
  READY_FOR_ENGINE: ['ENGINE_EVALUATION'],
  ENGINE_EVALUATION: ['PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY', 'ADD_ON_READY', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED', 'SAFETY_STOP', 'REQUALIFY'],
  PRICE_READY: ['CONFIRMATION_READY', 'SERVICE_SELECTION'],
  DIAGNOSTIC_READY: ['CONFIRMATION_READY', 'SERVICE_SELECTION'],
  LABOUR_PLUS_PART_READY: ['CONFIRMATION_READY', 'SERVICE_SELECTION'],
  ADD_ON_READY: ['CONFIRMATION_READY', 'SERVICE_SELECTION'],
  QUOTE_REQUIRED: ['SERVICE_SELECTION', 'METIER_SELECTION'],
  ROUTE_REQUIRED: ['SERVICE_SELECTION', 'METIER_SELECTION'],
  SAFETY_STOP: [],
  REQUALIFY: ['QUALIFICATION', 'SERVICE_SELECTION', 'QUESTION_REQUIRED'],
  CONFIRMATION_READY: [],
};

/**
 * Create a new session.
 * @param {object} opts - optional overrides for testing (session_id, timestamps)
 */
function createSession(opts) {
  opts = opts || {};
  var now = opts.now || new Date().toISOString();
  return {
    session_id: opts.session_id || generateId(),
    entry_context: opts.entry_context || {},
    metier: opts.metier || null,
    service_code: opts.service_code || null,
    known_inputs: opts.known_inputs || {},
    question_history: [],
    pending_questions: [],
    qualification_status: null,
    engine_result: null,
    outcome: null,
    state: 'START',
    ui_recommendation: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Clone session (immutable-style update).
 * Returns new session object with updated fields.
 */
function cloneSession(session, updates, now) {
  var next = Object.assign({}, session);
  next.known_inputs = Object.assign({}, session.known_inputs);
  next.question_history = session.question_history.slice();
  next.pending_questions = session.pending_questions.slice();
  next.entry_context = Object.assign({}, session.entry_context);
  if (updates) {
    Object.assign(next, updates);
    if (updates.known_inputs) next.known_inputs = Object.assign({}, session.known_inputs, updates.known_inputs);
  }
  next.updated_at = now || new Date().toISOString();
  return next;
}

/**
 * Transition state — validates transition is legal.
 * Returns { ok: true, session } or { ok: false, error }
 */
function transitionState(session, toState, now) {
  var fromState = session.state;
  if (!VALID_STATES.includes(toState)) {
    return { ok: false, error: { code: 'INVALID_STATE', message: 'Unknown state: ' + toState } };
  }
  var allowed = VALID_TRANSITIONS[fromState] || [];
  if (!allowed.includes(toState)) {
    return { ok: false, error: { code: 'ILLEGAL_TRANSITION', message: 'Cannot transition from ' + fromState + ' to ' + toState } };
  }
  var next = cloneSession(session, { state: toState }, now);
  return { ok: true, session: next };
}

function generateId() {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var id = 'sess_';
  for (var i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

module.exports = {
  VALID_STATES: VALID_STATES,
  VALID_TRANSITIONS: VALID_TRANSITIONS,
  createSession: createSession,
  cloneSession: cloneSession,
  transitionState: transitionState,
};
