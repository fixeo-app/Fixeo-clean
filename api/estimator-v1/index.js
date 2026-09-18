/*!
 * api/estimator-v1/index.js — FIXEO Estimator V1 Serverless Function
 * Phase 7C.9B — Production Dormant Integration
 *
 * Route: POST /api/estimator-v1
 *
 * Actions:
 *   start
 *   answer
 *   select_service
 *   evaluate
 *   verify_pricing_context
 *
 * Security:
 *   - POST only; all other methods → 405
 *   - FIXEO_ESTIMATOR_SECRET required; absent → 503 FAIL CLOSED
 *   - AES-256-GCM encrypted session tokens (fixeo-estimator-token-v1)
 *   - SAFETY_STOP / QUOTE_REQUIRED / ROUTE_REQUIRED → no pricing_context_token
 *   - Browser-safe normalized views only
 *   - Browser Origin, when supplied, must match the request origin
 *   - No wildcard CORS
 *   - Max request body: 32 KB
 *
 * IMPORTANT:
 *   - This API does NOT calculate prices.
 *   - The canonical pricing engine remains behind the orchestrator.
 *   - Browser-provided city / urgency context never modifies price here.
 *
 * HARD BLOCKER BEFORE FINAL PRODUCTION ACTIVATION:
 *   The reservation boundary (/api/booking/cod) must verify the canonical
 *   server-side pricing context instead of trusting a browser-supplied amount.
 */
'use strict';

const orchestrator = require(
  '../../data/pricing/orchestrator/estimator-orchestrator-v1'
);

const resolver = require(
  '../../data/pricing/orchestrator/estimator-service-resolver-v1'
);

const {
  sealToken,
  unsealToken,
} = require('./fixeo-estimator-token-v1');

const {
  normalizeSessionView,
  normalizeOutcomeView,
  buildPricingContextPayload,
  shouldIssuePricingContextToken,
} = require('./fixeo-estimator-runtime-v1');


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 32 * 1024; // 32 KB

const VALID_ACTIONS = new Set([
  'start',
  'answer',
  'select_service',
  'evaluate',
  'verify_pricing_context',
]);

const QUESTION_ID_RE =
  /^[a-z0-9_@.\-]{3,120}$/i;


// ─────────────────────────────────────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(res, status, body) {
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  return res
    .status(status)
    .json(body);
}


function getSecret() {
  return (
    process.env.FIXEO_ESTIMATOR_SECRET ||
    null
  );
}


/**
 * Browser-origin defence.
 *
 * Same-origin browser requests are accepted.
 * Requests without Origin are also accepted because:
 *   - server-to-server requests may legitimately omit Origin
 *   - Origin is not an authentication boundary
 *
 * Preview deployments remain supported because the expected origin is built
 * dynamically from the actual request host rather than hardcoding fixeo.ma.
 */
function isAllowedBrowserOrigin(req) {
  const origin =
    req.headers &&
    req.headers.origin
      ? String(req.headers.origin)
      : null;

  if (!origin) {
    return true;
  }

  const forwardedHost =
    req.headers &&
    req.headers['x-forwarded-host'];

  const host =
    forwardedHost ||
    (
      req.headers &&
      req.headers.host
    );

  if (!host) {
    return false;
  }

  const forwardedProto =
    req.headers &&
    req.headers['x-forwarded-proto'];

  const proto =
    forwardedProto
      ? String(forwardedProto)
          .split(',')[0]
          .trim()
      : 'https';

  const expectedOrigin =
    proto + '://' + String(host);

  return origin === expectedOrigin;
}


/**
 * Return the byte length of a UTF-8 string.
 */
function utf8ByteLength(value) {
  return Buffer.byteLength(
    String(value),
    'utf8'
  );
}


/**
 * Parse a raw JSON string and enforce a top-level object.
 */
function parseJsonObject(raw) {
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    throw new Error('Invalid JSON body');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error('Invalid JSON body');
  }

  return parsed;
}


/**
 * Robust body parser.
 *
 * Supports:
 *   1. Vercel/runtime pre-parsed req.body
 *   2. string / Buffer req.body
 *   3. raw Node request stream
 *
 * MAX_BODY_BYTES remains enforced in every path.
 */
function parseBody(req) {
  return new Promise(
    (resolve, reject) => {
      // ── Runtime already parsed the body ─────────────────────────────
      if (
        req.body !== undefined &&
        req.body !== null
      ) {
        try {
          // Buffer body
          if (Buffer.isBuffer(req.body)) {
            if (
              req.body.length >
              MAX_BODY_BYTES
            ) {
              reject(
                new Error(
                  'Request body too large'
                )
              );
              return;
            }

            resolve(
              parseJsonObject(
                req.body.toString('utf8')
              )
            );
            return;
          }

          // Raw JSON string
          if (
            typeof req.body ===
            'string'
          ) {
            if (
              utf8ByteLength(
                req.body
              ) >
              MAX_BODY_BYTES
            ) {
              reject(
                new Error(
                  'Request body too large'
                )
              );
              return;
            }

            resolve(
              parseJsonObject(
                req.body
              )
            );
            return;
          }

          // Already-parsed JSON object
          if (
            typeof req.body ===
              'object' &&
            !Array.isArray(req.body)
          ) {
            let serialized;

            try {
              serialized =
                JSON.stringify(req.body);
            } catch (_) {
              reject(
                new Error(
                  'Invalid JSON body'
                )
              );
              return;
            }

            if (
              utf8ByteLength(
                serialized
              ) >
              MAX_BODY_BYTES
            ) {
              reject(
                new Error(
                  'Request body too large'
                )
              );
              return;
            }

            resolve(req.body);
            return;
          }

          reject(
            new Error(
              'Invalid JSON body'
            )
          );
          return;

        } catch (e) {
          reject(e);
          return;
        }
      }

      // ── Raw request-stream fallback ─────────────────────────────────
      let raw = '';
      let bytes = 0;
      let settled = false;

      function fail(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }

      function succeed(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      req.on(
        'data',
        (chunk) => {
          if (settled) return;

          bytes += chunk.length;

          if (
            bytes >
            MAX_BODY_BYTES
          ) {
            fail(
              new Error(
                'Request body too large'
              )
            );
            return;
          }

          raw +=
            chunk.toString('utf8');
        }
      );

      req.on(
        'end',
        () => {
          if (settled) return;

          if (!raw) {
            fail(
              new Error(
                'Invalid JSON body'
              )
            );
            return;
          }

          try {
            succeed(
              parseJsonObject(raw)
            );
          } catch (e) {
            fail(e);
          }
        }
      );

      req.on(
        'error',
        fail
      );
    }
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Browser-safe sanitizers
// ─────────────────────────────────────────────────────────────────────────────

function safeString(
  value,
  maxLength
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (
    maxLength &&
    normalized.length >
      maxLength
  ) {
    return normalized.slice(
      0,
      maxLength
    );
  }

  return normalized;
}


function sanitizeMetierCandidates(
  candidates
) {
  if (
    !Array.isArray(candidates)
  ) {
    return [];
  }

  const seen =
    new Set();

  return candidates
    .map((metier) => {
      return safeString(
        metier,
        120
      );
    })
    .filter((metier) => {
      if (!metier) {
        return false;
      }

      if (seen.has(metier)) {
        return false;
      }

      seen.add(metier);
      return true;
    });
}


function sanitizeServiceCandidates(
  candidates
) {
  if (
    !Array.isArray(candidates)
  ) {
    return [];
  }

  const seen =
    new Set();

  return candidates
    .map((service) => {
      if (
        !service ||
        typeof service !==
          'object'
      ) {
        return null;
      }

      const serviceCode =
        safeString(
          service.service_code,
          200
        );

      if (!serviceCode) {
        return null;
      }

      if (
        seen.has(serviceCode)
      ) {
        return null;
      }

      seen.add(serviceCode);

      return {
        service_code:
          serviceCode,

        label_fr:
          safeString(
            service.label_fr,
            300
          ),

        short_label_fr:
          safeString(
            service.short_label_fr,
            200
          ),
      };
    })
    .filter(Boolean);
}


// ─────────────────────────────────────────────────────────────────────────────
// Action: start
// Body: { action:'start', entry_context }
// ─────────────────────────────────────────────────────────────────────────────

function handleStart(
  body,
  secret
) {
  const ctx =
    (
      body.entry_context &&
      typeof body.entry_context ===
        'object' &&
      !Array.isArray(
        body.entry_context
      )
    )
      ? body.entry_context
      : {};

  const result =
    orchestrator.startEstimator(
      ctx
    );

  if (!result.ok) {
    return {
      status: 422,
      body: {
        ok: false,
        error:
          result.error ||
          'start_failed',
      },
    };
  }

  const session =
    result.session;

  const view =
    normalizeSessionView(
      session,
      secret
    );

  const stepResult =
    orchestrator
      .getNextEstimatorStep(
        session
      );

  let next_step = null;

  if (
    stepResult.ok &&
    stepResult.step
  ) {
    next_step =
      sanitizeStep(
        stepResult.step
      );
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


// ─────────────────────────────────────────────────────────────────────────────
// Action: answer
// Body: { action:'answer', session_token, question_id, answer }
// ─────────────────────────────────────────────────────────────────────────────

function handleAnswer(
  body,
  secret
) {
  const {
    session_token,
    question_id,
    answer,
  } = body;

  if (!session_token) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_session_token',
      },
    };
  }

  if (!question_id) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_question_id',
      },
    };
  }

  if (
    typeof question_id !==
      'string' ||
    !QUESTION_ID_RE.test(
      question_id
    )
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'invalid_question_id',
      },
    };
  }

  /**
   * Null is deliberately rejected.
   *
   * The current canonical orchestrator does not define null as a qualification
   * answer. The UI must therefore not translate "Je ne sais pas" into null.
   */
  if (
    answer === undefined ||
    answer === null
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_answer',
      },
    };
  }

  const answerType =
    typeof answer;

  if (
    ![
      'boolean',
      'number',
      'string',
    ].includes(answerType)
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'invalid_answer_type',
      },
    };
  }

  if (
    answerType === 'number' &&
    !Number.isFinite(answer)
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'invalid_answer_value',
      },
    };
  }

  let sessionPayload;

  try {
    sessionPayload =
      unsealToken(
        session_token,
        secret
      );
  } catch (e) {
    if (
      e &&
      e.message ===
        'Token expired'
    ) {
      return {
        status: 401,
        body: {
          ok: false,
          error:
            'session_expired',
        },
      };
    }

    return {
      status: 401,
      body: {
        ok: false,
        error:
          'invalid_session_token',
      },
    };
  }

  const session =
    reconstructSession(
      sessionPayload
    );

  const result =
    orchestrator
      .answerEstimatorQuestion(
        session,
        question_id,
        answer
      );

  if (!result.ok) {
    return {
      status: 422,
      body: {
        ok: false,
        error:
          result.error ||
          'answer_failed',
      },
    };
  }

  const updatedSession =
    result.session;

  const view =
    normalizeSessionView(
      updatedSession,
      secret
    );

  const stepResult =
    orchestrator
      .getNextEstimatorStep(
        updatedSession
      );

  let next_step = null;

  if (
    stepResult.ok &&
    stepResult.step
  ) {
    next_step =
      sanitizeStep(
        stepResult.step
      );
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


// ─────────────────────────────────────────────────────────────────────────────
// Action: select_service
// Body: { action:'select_service', session_token, service_code }
// ─────────────────────────────────────────────────────────────────────────────

function handleSelectService(
  body,
  secret
) {
  const {
    session_token,
    service_code,
  } = body;

  if (!session_token) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_session_token',
      },
    };
  }

  if (
    !service_code ||
    typeof service_code !==
      'string' ||
    !service_code.trim()
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_service_code',
      },
    };
  }

  if (
    service_code.trim()
      .length > 200
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'invalid_service_code',
      },
    };
  }

  let sessionPayload;

  try {
    sessionPayload =
      unsealToken(
        session_token,
        secret
      );
  } catch (e) {
    if (
      e &&
      e.message ===
        'Token expired'
    ) {
      return {
        status: 401,
        body: {
          ok: false,
          error:
            'session_expired',
        },
      };
    }

    return {
      status: 401,
      body: {
        ok: false,
        error:
          'invalid_session_token',
      },
    };
  }

  const session =
    reconstructSession(
      sessionPayload
    );

  const result =
    orchestrator.selectService(
      session,
      service_code.trim()
    );

  if (!result.ok) {
    const errCode =
      result.error &&
      result.error.code;

    const status =
      (
        errCode ===
          'ILLEGAL_STATE' ||
        errCode ===
          'UNKNOWN_SERVICE_CODE'
      )
        ? 422
        : 400;

    return {
      status: status,

      body: {
        ok: false,
        error:
          result.error ||
          'select_service_failed',
      },
    };
  }

  const updatedSession =
    result.session;

  const view =
    normalizeSessionView(
      updatedSession,
      secret
    );

  const stepResult =
    orchestrator
      .getNextEstimatorStep(
        updatedSession
      );

  let next_step = null;

  if (
    stepResult.ok &&
    stepResult.step
  ) {
    next_step =
      sanitizeStep(
        stepResult.step
      );
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


// ─────────────────────────────────────────────────────────────────────────────
// Action: evaluate
// Body: { action:'evaluate', session_token }
// ─────────────────────────────────────────────────────────────────────────────

function handleEvaluate(
  body,
  secret
) {
  const {
    session_token,
  } = body;

  if (!session_token) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_session_token',
      },
    };
  }

  let sessionPayload;

  try {
    sessionPayload =
      unsealToken(
        session_token,
        secret
      );
  } catch (e) {
    if (
      e &&
      e.message ===
        'Token expired'
    ) {
      return {
        status: 401,
        body: {
          ok: false,
          error:
            'session_expired',
        },
      };
    }

    return {
      status: 401,
      body: {
        ok: false,
        error:
          'invalid_session_token',
      },
    };
  }

  const session =
    reconstructSession(
      sessionPayload
    );

  const result =
    orchestrator
      .evaluateEstimator(
        session
      );

  if (!result.ok) {
    return {
      status: 422,
      body: {
        ok: false,
        error:
          result.error ||
          'evaluate_failed',
      },
    };
  }

  const evaluated =
    result.session;

  const view =
    normalizeSessionView(
      evaluated,
      secret
    );

  const outcome =
    normalizeOutcomeView(
      evaluated
    );

  let pricing_context_token =
    null;

  if (
    outcome &&
    shouldIssuePricingContextToken(
      evaluated
    )
  ) {
    try {
      const pricingPayload =
        buildPricingContextPayload(
          evaluated
        );

      pricing_context_token =
        sealToken(
          pricingPayload,
          secret
        );

    } catch (_) {
      // Fail closed.
      pricing_context_token =
        null;
    }
  }

  return {
    status: 200,

    body: {
      ok: true,
      session: view,
      outcome: outcome,

      // Null for non-price-bearing / blocked outcomes.
      pricing_context_token:
        pricing_context_token,
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Action: verify_pricing_context
// Body: { action:'verify_pricing_context', pricing_context_token }
// ─────────────────────────────────────────────────────────────────────────────

function handleVerifyPricingContext(
  body,
  secret
) {
  const {
    pricing_context_token,
  } = body;

  if (!pricing_context_token) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'missing_pricing_context_token',
      },
    };
  }

  let payload;

  try {
    payload =
      unsealToken(
        pricing_context_token,
        secret
      );
  } catch (e) {
    if (
      e &&
      e.message ===
        'Token expired'
    ) {
      return {
        status: 200,
        body: {
          valid: false,
          reason: 'expired',
        },
      };
    }

    return {
      status: 200,
      body: {
        valid: false,
        reason: 'invalid',
      },
    };
  }

  // Session tokens must never be accepted as pricing-context tokens.
  if (
    !payload ||
    typeof payload !== 'object' ||
    !payload.outcome_type ||
    !payload.service_code
  ) {
    return {
      status: 200,
      body: {
        valid: false,
        reason:
          'not_pricing_context',
      },
    };
  }

  let service_label =
    null;

  try {
    const svcDef =
      resolver.getService(
        payload.service_code
      );

    if (
      svcDef &&
      svcDef.label_fr
    ) {
      service_label =
        svcDef.label_fr;
    }

  } catch (_) {
    // Defensive:
    // never invent a human-facing label.
    service_label = null;
  }

  return {
    status: 200,

    body: {
      valid: true,

      outcome_type:
        payload.outcome_type,

      service_code:
        payload.service_code,

      service_label:
        service_label,

      /**
       * Matching context only.
       * Non-authoritative for pricing.
       */
      city_slug:
        payload.city_slug ||
        null,

      amount_mad:
        payload.amount_mad,

      labour_amount_mad:
        payload.labour_amount_mad,

      parts_separate:
        payload.parts_separate,

      is_diagnostic:
        payload.is_diagnostic,
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Session reconstruction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconstruct the internal orchestrator session from the server-sealed payload.
 *
 * Nothing in this function is sourced independently from browser plaintext.
 */
function reconstructSession(
  payload
) {
  return {
    session_id:
      payload.session_id,

    entry_context:
      payload.entry_context ||
      {},

    metier:
      payload.metier,

    service_code:
      payload.service_code,

    known_inputs:
      payload.known_inputs ||
      {},

    question_history:
      payload.question_history ||
      [],

    pending_questions:
      payload.pending_questions ||
      [],

    qualification_status:
      payload.qualification_status ||
      null,

    engine_result:
      payload.engine_result ||
      null,

    outcome:
      payload.outcome ||
      null,

    state:
      payload.state,

    ui_recommendation:
      payload.ui_recommendation ||
      null,

    created_at:
      payload.created_at,

    updated_at:
      payload.updated_at ||
      payload.created_at,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Browser-safe next-step normalization
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeStep(step) {
  if (
    !step ||
    typeof step !==
      'object'
  ) {
    return null;
  }

  // ── Qualification question ─────────────────────────────────────────
  if (
    step.type ===
    'QUESTION'
  ) {
    return {
      type:
        'QUESTION',

      question_id:
        step.question_id,

      input_id:
        step.input_id,

      prompt_key:
        step.prompt_key,

      answer_type:
        step.answer_type,

      options:
        Array.isArray(
          step.options
        )
          ? step.options.slice(
              0,
              100
            )
          : null,

      priority:
        step.priority,

      blocking:
        step.blocking,

      measurement_note:
        step.measurement_note ||
        null,

      ui_recommendation:
        step.ui_recommendation ||
        null,
    };
  }

  // ── Ready for pricing engine ────────────────────────────────────────
  if (
    step.type ===
    'READY'
  ) {
    return {
      type: 'READY',
    };
  }

  // ── Métier selection ────────────────────────────────────────────────
  /**
   * Critical for the new RAFI "Comprendre" state.
   *
   * V1 intentionally does not invent a métier from arbitrary free text.
   * When structured classification is unavailable, the browser receives
   * ONLY the canonical métier slugs supplied by the resolver.
   */
  if (
    step.type ===
    'METIER_SELECTION'
  ) {
    return {
      type:
        'METIER_SELECTION',

      candidate_metiers:
        sanitizeMetierCandidates(
          step.candidate_metiers
        ),
    };
  }

  // ── Service selection ───────────────────────────────────────────────
  if (
    step.type ===
    'SERVICE_SELECTION'
  ) {
    return {
      type:
        'SERVICE_SELECTION',

      candidate_services:
        sanitizeServiceCandidates(
          step.candidate_services
        ),
    };
  }

  // ── Other server-controlled step types ─────────────────────────────
  return {
    type:
      safeString(
        step.type,
        80
      ) ||
      'UNKNOWN',
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Main serverless handler
// ─────────────────────────────────────────────────────────────────────────────

module.exports =
async function handler(
  req,
  res
) {
  // POST only.
  if (
    req.method !==
    'POST'
  ) {
    res.setHeader(
      'Allow',
      'POST'
    );

    return jsonResponse(
      res,
      405,
      {
        ok: false,
        error:
          'method_not_allowed',
      }
    );
  }

  /**
   * Browser same-origin defence.
   *
   * This is defence-in-depth, not authentication.
   * Server-to-server callers without Origin remain supported.
   */
  if (
    !isAllowedBrowserOrigin(
      req
    )
  ) {
    return jsonResponse(
      res,
      403,
      {
        ok: false,
        error:
          'origin_not_allowed',
      }
    );
  }

  // FAIL CLOSED when secret is absent.
  const secret =
    getSecret();

  if (!secret) {
    return jsonResponse(
      res,
      503,
      {
        ok: false,
        error:
          'config_error',

        message:
          'Estimator service not configured',
      }
    );
  }

  // Parse and validate body.
  let body;

  try {
    body =
      await parseBody(req);

  } catch (e) {
    if (
      e &&
      e.message ===
        'Request body too large'
    ) {
      return jsonResponse(
        res,
        413,
        {
          ok: false,
          error:
            'request_too_large',
        }
      );
    }

    return jsonResponse(
      res,
      400,
      {
        ok: false,
        error:
          'invalid_body',
      }
    );
  }

  if (
    !body ||
    typeof body !==
      'object' ||
    Array.isArray(body)
  ) {
    return jsonResponse(
      res,
      400,
      {
        ok: false,
        error:
          'invalid_body',
      }
    );
  }

  const action =
    body.action;

  if (
    typeof action !==
      'string' ||
    !VALID_ACTIONS.has(
      action
    )
  ) {
    return jsonResponse(
      res,
      400,
      {
        ok: false,
        error:
          'invalid_action',

        valid_actions:
          Array.from(
            VALID_ACTIONS
          ),
      }
    );
  }

  let result;

  try {
    switch (action) {
      case 'start':
        result =
          handleStart(
            body,
            secret
          );
        break;

      case 'answer':
        result =
          handleAnswer(
            body,
            secret
          );
        break;

      case 'select_service':
        result =
          handleSelectService(
            body,
            secret
          );
        break;

      case 'evaluate':
        result =
          handleEvaluate(
            body,
            secret
          );
        break;

      case 'verify_pricing_context':
        result =
          handleVerifyPricingContext(
            body,
            secret
          );
        break;

      default:
        return jsonResponse(
          res,
          400,
          {
            ok: false,
            error:
              'invalid_action',
          }
        );
    }

  } catch (e) {
    console.error(
      '[estimator-v1] Internal error:',
      e &&
      e.message
        ? e.message
        : 'unknown'
    );

    return jsonResponse(
      res,
      500,
      {
        ok: false,
        error:
          'internal_error',
      }
    );
  }

  return jsonResponse(
    res,
    result.status,
    result.body
  );
};
