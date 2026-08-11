/*!
 * api/estimator-v1/index.js — FIXEO Estimator V1 Serverless Function
 * Phase 7C.9B — Production Dormant Integration
 *
 * Route: POST /api/estimator-v1
 * Actions: start | answer | evaluate | verify_pricing_context
 *
 * Security:
 *   - POST only; all others → 405
 *   - FIXEO_ESTIMATOR_SECRET required; absent → 503 FAIL CLOSED
 *   - AES-256-GCM encrypted session tokens (fixeo-estimator-token-v1)
 *   - SAFETY_STOP / QUOTE_REQUIRED / ROUTE_REQUIRED → no pricing_context_token
 *   - Browser-safe normalized views only (no raw session internals)
 *   - CORS: same-origin only (no wildcard)
 *   - Max body: 32KB
 *
 * HARD BLOCKER (documented, not blocking dormant infra):
 *   The reservation boundary (/api/booking/cod) currently accepts
 *   browser-supplied totalAmount WITHOUT server-side canonical price
 *   verification. This MUST be fixed before production activation (Phase 7C.9D).
 */
'use strict';

const orchestrator = require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const resolver     = require('../../data/pricing/orchestrator/estimator-service-resolver-v1');
const { sealToken, unsealToken }  = require('./fixeo-estimator-token-v1');
const {
  normalizeSessionView,
  normalizeOutcomeView,
  buildPricingContextPayload,
  shouldIssuePricingContextToken,
} = require('./fixeo-estimator-runtime-v1');

const MAX_BODY_BYTES    = 32 * 1024; // 32KB
const VALID_ACTIONS     = new Set(['start', 'answer', 'evaluate', 'verify_pricing_context', 'select_service']);
const QUESTION_ID_RE    = /^[a-z0-9_@.\-]{3,120}$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  // Same-origin CORS — no wildcard
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(body);
}

function getSecret() {
  return process.env.FIXEO_ESTIMATOR_SECRET || null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      raw += chunk.toString();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Action: start
 * Body: { action:'start', entry_context }
 */
function handleStart(body, secret) {
  const ctx = body.entry_context || {};
  const result = orchestrator.startEstimator(ctx);
  if (!result.ok) {
    return { status: 422, body: { ok: false, error: result.error || 'start_failed' } };
  }
  const session = result.session;
  const view = normalizeSessionView(session, secret);

  // Get the first step
  const stepResult = orchestrator.getNextEstimatorStep(session);
  let next_step = null;
  if (stepResult.ok && stepResult.step) {
    next_step = sanitizeStep(stepResult.step);
  }

  return {
    status: 200,
    body: {
      ok: true,
      session: view,
      next_step,
    },
  };
}

/**
 * Action: answer
 * Body: { action:'answer', session_token, question_id, answer }
 */
function handleAnswer(body, secret) {
  const { session_token, question_id, answer } = body;
  if (!session_token) return { status: 400, body: { ok: false, error: 'missing_session_token' } };
  if (!question_id)   return { status: 400, body: { ok: false, error: 'missing_question_id' } };
  if (!QUESTION_ID_RE.test(question_id)) return { status: 400, body: { ok: false, error: 'invalid_question_id' } };
  if (answer === undefined || answer === null) return { status: 400, body: { ok: false, error: 'missing_answer' } };

  // Validate answer type
  const answerType = typeof answer;
  if (!['boolean', 'number', 'string'].includes(answerType)) {
    return { status: 400, body: { ok: false, error: 'invalid_answer_type' } };
  }

  let sessionPayload;
  try { sessionPayload = unsealToken(session_token, secret); }
  catch (e) {
    if (e.message === 'Token expired') return { status: 401, body: { ok: false, error: 'session_expired' } };
    return { status: 401, body: { ok: false, error: 'invalid_session_token' } };
  }

  // Reconstruct session from sealed payload
  const session = reconstructSession(sessionPayload);
  const result = orchestrator.answerEstimatorQuestion(session, question_id, answer);
  if (!result.ok) {
    return { status: 422, body: { ok: false, error: result.error || 'answer_failed' } };
  }

  const updatedSession = result.session;
  const view = normalizeSessionView(updatedSession, secret);

  const stepResult = orchestrator.getNextEstimatorStep(updatedSession);
  let next_step = null;
  if (stepResult.ok && stepResult.step) {
    next_step = sanitizeStep(stepResult.step);
  }

  return {
    status: 200,
    body: { ok: true, session: view, next_step },
  };
}

/**
 * Action: evaluate
 * Body: { action:'evaluate', session_token }
 */
function handleEvaluate(body, secret) {
  const { session_token } = body;
  if (!session_token) return { status: 400, body: { ok: false, error: 'missing_session_token' } };

  let sessionPayload;
  try { sessionPayload = unsealToken(session_token, secret); }
  catch (e) {
    if (e.message === 'Token expired') return { status: 401, body: { ok: false, error: 'session_expired' } };
    return { status: 401, body: { ok: false, error: 'invalid_session_token' } };
  }

  const session = reconstructSession(sessionPayload);
  const result = orchestrator.evaluateEstimator(session);
  if (!result.ok) {
    return { status: 422, body: { ok: false, error: result.error || 'evaluate_failed' } };
  }

  const evaluated = result.session;
  const view = normalizeSessionView(evaluated, secret);
  const outcome = normalizeOutcomeView(evaluated);

  let pricing_context_token = null;
  if (outcome && shouldIssuePricingContextToken(evaluated)) {
    try {
      const pricingPayload = buildPricingContextPayload(evaluated);
      pricing_context_token = sealToken(pricingPayload, secret);
    } catch (e) {
      // Should not happen given the shouldIssue check, but fail closed
      pricing_context_token = null;
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      session: view,
      outcome,
      pricing_context_token, // null for SAFETY_STOP / QUOTE_REQUIRED / ROUTE_REQUIRED
    },
  };
}

/**
 * Action: verify_pricing_context
 * Body: { action:'verify_pricing_context', pricing_context_token }
 */
function handleVerifyPricingContext(body, secret) {
  const { pricing_context_token } = body;
  if (!pricing_context_token) return { status: 400, body: { ok: false, error: 'missing_pricing_context_token' } };

  let payload;
  try { payload = unsealToken(pricing_context_token, secret); }
  catch (e) {
    if (e.message === 'Token expired') return { status: 200, body: { valid: false, reason: 'expired' } };
    return { status: 200, body: { valid: false, reason: 'invalid' } };
  }

  // Validate it's a pricing context (not a session token)
  if (!payload.outcome_type || !payload.service_code) {
    return { status: 200, body: { valid: false, reason: 'not_pricing_context' } };
  }

  // Resolve canonical human-facing label from the already-loaded service registry.
  // Uses the same resolver that populates SERVICE_SELECTION candidate labels.
  // Safe fallback: if lookup fails for any reason, service_label is null (never invent a label).
  let service_label = null;
  try {
    const svcDef = resolver.getService(payload.service_code);
    if (svcDef && svcDef.label_fr) service_label = svcDef.label_fr;
  } catch (_) { /* defensive — service_label stays null */ }

  return {
    status: 200,
    body: {
      valid:               true,
      outcome_type:        payload.outcome_type,
      service_code:        payload.service_code,
      service_label:       service_label,
      // 7C.9L.3H: city_slug — matching context sealed in token, non-authoritative for price.
      // null when no trusted city was present at Estimator session start.
      city_slug:           payload.city_slug || null,
      amount_mad:          payload.amount_mad,
      labour_amount_mad:   payload.labour_amount_mad,
      parts_separate:      payload.parts_separate,
      is_diagnostic:       payload.is_diagnostic,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session reconstruction (from sealed payload back to orchestrator session shape)
// ─────────────────────────────────────────────────────────────────────────────

function reconstructSession(payload) {
  return {
    session_id:          payload.session_id,
    entry_context:       payload.entry_context || {},
    metier:              payload.metier,
    service_code:        payload.service_code,
    known_inputs:        payload.known_inputs || {},
    question_history:    payload.question_history || [],
    pending_questions:   payload.pending_questions || [],
    qualification_status: payload.qualification_status || null,
    engine_result:       payload.engine_result || null,
    outcome:             payload.outcome || null,
    state:               payload.state,
    ui_recommendation:   payload.ui_recommendation || null,
    created_at:          payload.created_at,
    updated_at:          payload.updated_at || payload.created_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: select_service  (Phase 7C.9K.5)
// Body: { action:'select_service', session_token, service_code }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transitions a SERVICE_SELECTION session to QUALIFICATION or READY_FOR_ENGINE
 * by recording the user's chosen service_code.
 *
 * Security contract identical to handleAnswer:
 *   - session unsealed from opaque token (never from client plaintext)
 *   - orchestrator validates serviceCode against getCandidateServices(metier)
 *   - new opaque token issued for the updated session
 *   - no raw session, secret, or pricing internals ever returned
 */
function handleSelectService(body, secret) {
  const { session_token, service_code } = body;
  if (!session_token) return { status: 400, body: { ok: false, error: 'missing_session_token' } };
  if (!service_code || typeof service_code !== 'string' || !service_code.trim()) {
    return { status: 400, body: { ok: false, error: 'missing_service_code' } };
  }

  let sessionPayload;
  try { sessionPayload = unsealToken(session_token, secret); }
  catch (e) {
    if (e.message === 'Token expired') return { status: 401, body: { ok: false, error: 'session_expired' } };
    return { status: 401, body: { ok: false, error: 'invalid_session_token' } };
  }

  const session = reconstructSession(sessionPayload);
  const result = orchestrator.selectService(session, service_code.trim());
  if (!result.ok) {
    const errCode = result.error && result.error.code;
    const status = (errCode === 'ILLEGAL_STATE' || errCode === 'UNKNOWN_SERVICE_CODE') ? 422 : 400;
    return { status, body: { ok: false, error: result.error || 'select_service_failed' } };
  }

  const updatedSession = result.session;
  const view = normalizeSessionView(updatedSession, secret);

  const stepResult = orchestrator.getNextEstimatorStep(updatedSession);
  let next_step = null;
  if (stepResult.ok && stepResult.step) {
    next_step = sanitizeStep(stepResult.step);
  }

  return {
    status: 200,
    body: { ok: true, session: view, next_step },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitize step — only expose browser-safe question fields
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeStep(step) {
  if (!step) return null;
  if (step.type === 'QUESTION') {
    return {
      type:          'QUESTION',
      question_id:   step.question_id,
      input_id:      step.input_id,
      prompt_key:    step.prompt_key,
      answer_type:   step.answer_type,
      options:       step.options || null,
      priority:      step.priority,
      blocking:      step.blocking,
      measurement_note: step.measurement_note || null,
      ui_recommendation: step.ui_recommendation || null,
    };
  }
  if (step.type === 'READY') {
    return { type: 'READY' };
  }
  // 7C.9K.5: expose candidate services for SERVICE_SELECTION step.
  // Only UI-safe fields: service_code + labels. No pricing internals.
  if (step.type === 'SERVICE_SELECTION') {
    var sanitizedCandidates = (step.candidate_services || []).map(function(s) {
      return {
        service_code:    s.service_code,
        label_fr:        s.label_fr,
        short_label_fr:  s.short_label_fr,
      };
    });
    return {
      type:               'SERVICE_SELECTION',
      candidate_services: sanitizedCandidates,
    };
  }
  return { type: step.type };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Reject non-POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return jsonResponse(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  // FAIL CLOSED: require secret
  const secret = getSecret();
  if (!secret) {
    return jsonResponse(res, 503, { ok: false, error: 'config_error', message: 'Estimator service not configured' });
  }

  // Parse body
  let body;
  try { body = await parseBody(req); }
  catch (e) {
    if (e.message === 'Request body too large') {
      return jsonResponse(res, 413, { ok: false, error: 'request_too_large' });
    }
    return jsonResponse(res, 400, { ok: false, error: 'invalid_body' });
  }

  // Validate action
  const action = body && body.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    return jsonResponse(res, 400, { ok: false, error: 'invalid_action', valid_actions: [...VALID_ACTIONS] });
  }

  // Dispatch
  let result;
  try {
    switch (action) {
      case 'start':                   result = handleStart(body, secret); break;
      case 'answer':                  result = handleAnswer(body, secret); break;
      case 'select_service':          result = handleSelectService(body, secret); break;
      case 'evaluate':                result = handleEvaluate(body, secret); break;
      case 'verify_pricing_context':  result = handleVerifyPricingContext(body, secret); break;
      default:
        return jsonResponse(res, 400, { ok: false, error: 'invalid_action' });
    }
  } catch (e) {
    console.error('[estimator-v1] Internal error:', e.message);
    return jsonResponse(res, 500, { ok: false, error: 'internal_error' });
  }

  return jsonResponse(res, result.status, result.body);
};
