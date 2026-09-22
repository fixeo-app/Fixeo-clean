'use strict';
const crypto = require('node:crypto');
const { unsealToken } = require('../estimator-v1/fixeo-estimator-token-v1');
const { config, quotaLimits } = require('./config');
const { sameOrigin, principal, ipHash, hash } = require('./auth');
const { createTransport, DiagnosticError } = require('./transport');

async function authorizeReference(
  req,
  res,
  reference,
  { env = process.env, transport: supplied } = {},
) {
  const cfg = config(env);
  sameOrigin(req, cfg);
  const transport = supplied || createTransport({ env });
  const ip = ipHash(req, cfg);
  await transport.rpc('diagnostic_quota_v1', {
    p_limits: quotaLimits(null, ip, cfg),
    p_delta: { requests: 1 },
  });
  const actor = await principal(req, res, cfg, transport, false);
  if (!reference || reference.actor !== actor)
    throw new DiagnosticError('DIAGNOSTIC_NOT_FOUND', 404);
  const data = await transport.rpc('diagnostic_state_v1', {
    p_action: 'get',
    p_actor: actor,
    p_session_id: reference.session_id,
    p_payload: {},
  });
  if (
    data.session.revision !== reference.revision ||
    data.session.selected_run_id !== reference.run_id ||
    !['ready', 'bound'].includes(data.session.state) ||
    data.run?.result?.safety?.stop !== false
  )
    throw new DiagnosticError('DIAGNOSTIC_REVISION_CONFLICT', 409);
  return { data, actor, transport };
}
async function beforeAction(req, res, body, secret, dependencies = {}) {
  let reference, payload;
  if (body.action === 'start') {
    const token = body.entry_context?.diagnostic_token;
    if (!token) return null;
    try {
      payload = unsealToken(token, secret);
    } catch (_) {
      throw new DiagnosticError('DIAGNOSTIC_LINK_EXPIRED', 410);
    }
    if (payload.kind !== 'diagnostic-handoff')
      throw new DiagnosticError('INVALID_DIAGNOSTIC_LINK');
    reference = {
      session_id: payload.session_id,
      run_id: payload.run_id,
      revision: payload.revision,
      actor: payload.actor,
    };
  } else {
    const token = body.session_token || body.pricing_context_token;
    if (!token) return null;
    try {
      payload = unsealToken(token, secret);
    } catch (_) {
      return null;
    } // canonical handler keeps its existing error semantics
    reference = payload.entry_context?.diagnostic || payload.diagnostic;
    if (!reference) return null;
  }
  const authorized = await authorizeReference(
    req,
    res,
    reference,
    dependencies,
  );
  if (body.action === 'start') {
    if (authorized.data.session.state === 'bound')
      throw new DiagnosticError('DIAGNOSTIC_ALREADY_BOOKED', 409);
    const s = authorized.data.session;
    const requestedService = body.entry_context?.service_hint;
    const trade = authorized.data.run.result.trade.value;
    const onSiteService =
      typeof requestedService === 'string' &&
      requestedService === trade + '.diagnostic'
        ? requestedService
        : undefined;
    const questions = require('./contract').QUESTIONS;
    const answers = Object.entries(s.input.answers || {})
      .map(
        ([key, value]) =>
          (questions[key]?.label || key) +
          ' : ' +
          ({ yes: 'Oui', no: 'Non', unknown: 'Je ne sais pas' }[value] ||
            value),
      )
      .join(' ; ');
    // No browser known_inputs or model inference is promoted to a confirmed price input.
    body.entry_context = {
      source: 'diagnostic',
      city_slug: s.city_slug,
      ...(onSiteService ? { service_hint: onSiteService } : {}),
      description: (
        s.input.description +
        (answers ? ' — Précisions client : ' + answers : '')
      ).slice(0, 1000),
      metier_hint: authorized.data.run.result.trade.value,
      known_inputs: {},
      urgency: authorized.data.run.result.safety.urgency,
    };
  }
  return reference;
}
async function confirmQuote(
  req,
  res,
  body,
  { env = process.env, transport: supplied, dispatch } = {},
) {
  try {
    if (Buffer.byteLength(JSON.stringify(body)) > 32768)
      throw new DiagnosticError('INVALID_BODY', 413);
    let payload;
    try {
      payload = unsealToken(
        body.diagnostic_estimator_token,
        env.FIXEO_ESTIMATOR_SECRET,
      );
    } catch (_) {
      throw new DiagnosticError('DIAGNOSTIC_LINK_EXPIRED', 410);
    }
    const reference = payload.entry_context?.diagnostic;
    if (!reference || payload.outcome?.outcome_type !== 'QUOTE_REQUIRED')
      throw new DiagnosticError('QUOTE_NOT_QUALIFIED', 409);
    const auth = await authorizeReference(req, res, reference, {
      env,
      transport: supplied,
    });
    const phone = String(body.client_phone || '').replace(/[\s().-]+/g, '');
    if (!/^(\+212|0)[5-7][0-9]{8}$/.test(phone))
      throw new DiagnosticError('INVALID_PHONE');
    const token = crypto
      .createHmac('sha256', env.FIXEO_ESTIMATOR_SECRET)
      .update('fixeo-diagnostic-quote-guest:' + reference.session_id)
      .digest('hex');
    const tracking =
      'FX-' +
      crypto
        .createHmac('sha256', env.FIXEO_ESTIMATOR_SECRET)
        .update('fixeo-diagnostic-quote-tracking:' + reference.session_id)
        .digest('hex')
        .slice(0, 16)
        .toUpperCase();
    const confirmation = await auth.transport.rpc(
      'create_diagnostic_quote_request_v1',
      {
        p_diagnostic: {
          ...reference,
          qualification_answers: (payload.question_history || []).map((q) => ({
            ...q,
            provenance: 'user_confirmed',
          })),
        },
        p_client_phone: phone,
        p_tracking_ref: tracking,
        p_guest_token_hash: hash(token),
        p_description: (
          'Demande de devis — aucun prix confirmé. ' +
          payload.entry_context.free_text
        ).slice(0, 1000),
        p_service_category: payload.metier,
        p_city_slug: auth.data.session.city_slug,
      },
    );
    if (!confirmation.ok)
      throw new DiagnosticError('CONFIRMATION_REJECTED', 409);
    const dispatched = dispatch ? await dispatch(confirmation.id) : null;
    res.setHeader('Cache-Control', 'no-store');
    return res
      .status(200)
      .json({ ...confirmation, guest_token: token, dispatch: dispatched });
  } catch (error) {
    return res
      .status(error instanceof DiagnosticError ? error.status : 502)
      .json({
        ok: false,
        reason:
          error instanceof DiagnosticError ? error.code : 'CONFIRMATION_FAILED',
      });
  }
}
module.exports = { beforeAction, authorizeReference, confirmQuote };
