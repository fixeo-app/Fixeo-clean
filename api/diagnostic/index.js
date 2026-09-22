'use strict';
const { randomUUID } = require('node:crypto');
const { config, quotaLimits } = require('./config');
const { CITIES, HAZARDS, QUESTIONS, MEDIA, VERSION } = require('./contract');
const { createTransport, DiagnosticError } = require('./transport');
const { sameOrigin, principal, ipHash, hash } = require('./auth');
const { createMedia, sanitizePhoto } = require('./media');
const { createOpenAIAdapter } = require('./providers/openai');
const { analyze } = require('./engine');
const { groundingLogDetails, groundingNormalizationDetails } = require('./grounding-errors');
const { confirmCritical } = require('./critical-request');
const { confirmationContext, confirmIntervention, interventionStatus } = require('./intervention');
const { sealToken } = require('../estimator-v1/fixeo-estimator-token-v1');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTIONS = new Set([
  'create',
  'get',
  'update',
  'media_reserve',
  'media_validate',
  'media_remove',
  'media_url',
  'analyze',
  'handoff',
  'confirm_critical',
  'confirmation_context',
  'confirm_intervention',
  'intervention_status',
  'mission_context',
]);
function validatedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DiagnosticError('INVALID_INPUT');
  if (
    typeof value.description !== 'string' ||
    value.description.trim().length > 2000
  )
    throw new DiagnosticError('INVALID_DESCRIPTION');
  const answers = {};
  if (
    value.answers &&
    (typeof value.answers !== 'object' || Array.isArray(value.answers))
  )
    throw new DiagnosticError('INVALID_ANSWERS');
  for (const [key, answer] of Object.entries(value.answers || {})) {
    if (
      !QUESTIONS[key] ||
      typeof answer !== 'string' ||
      !answer.trim() ||
      answer.length > 500 ||
      (QUESTIONS[key].type === 'choice' &&
        !['yes', 'no', 'unknown'].includes(answer))
    )
      throw new DiagnosticError('INVALID_ANSWERS');
    answers[key] = answer.trim();
  }
  if (
    !Array.isArray(value.safety_signals) ||
    value.safety_signals.some((s) => !HAZARDS.includes(s))
  )
    throw new DiagnosticError('INVALID_SAFETY');
  return {
    description: value.description.trim(),
    answers,
    safety_signals: [...new Set(value.safety_signals)],
  };
}
function publicView(data) {
  const s = data.session;
  return {
    id: s.id,
    revision: s.revision,
    state: s.state,
    city_slug: s.city_slug,
    input: s.input,
    expires_at: s.expires_at,
    request_id: s.service_request_id,
    request_ref: s.booking_context?.kind === 'critical' ? s.booking_context.tracking_ref : null,
    result_run_id: data.run?.state === 'complete' ? data.run.id : null,
    analysis_retry_after:
      data.run?.state === 'running' ? data.run.lease_until : null,
    media: (data.media || []).map((m) => ({
      id: m.id,
      kind: m.kind,
      state: m.state,
      bytes: m.actual_bytes || m.declared_bytes,
    })),
    result:
      data.run?.state === 'complete' && data.run.revision === s.revision
        ? data.run.result
        : null,
  };
}
function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.status(status).json(body);
}
function createHandler({
  env = process.env,
  transport: injectedTransport,
  provider: injectedProvider,
  mediaStore: injectedMedia,
  logger = console,
  cfg: injectedConfig,
} = {}) {
  return async function diagnosticHandler(req, res) {
    const started = Date.now();
    const requestId = randomUUID();
    let action = 'unknown';
    try {
      const cfg = injectedConfig || config(env);
      if (req.method === 'GET')
        return send(res, 200, {
          ok: true,
          enabled: cfg.enabled,
          context_enabled: !!cfg.contextEnabled,
          contract: VERSION,
          media: { photo: MEDIA.photo, video: { enabled: false } },
        });
      if (req.method !== 'POST')
        return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
      sameOrigin(req, cfg);
      if (
        !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')
      )
        throw new DiagnosticError('JSON_REQUIRED', 415);
      const body = req.body;
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Buffer.byteLength(JSON.stringify(body)) > 32768
      )
        throw new DiagnosticError('INVALID_BODY', 413);
      action = body.action;
      if (!ACTIONS.has(action)) throw new DiagnosticError('INVALID_ACTION');
      if (
        !cfg.enabled &&
        ![
          'get',
          'media_url',
          'media_remove',
          'mission_context',
          'handoff',
          'intervention_status',
        ].includes(action)
      )
        throw new DiagnosticError('DIAGNOSTIC_UNAVAILABLE', 503);
      const transport =
        injectedTransport ||
        createTransport({ env, deadline: started + 50000 });
      const mediaStore = injectedMedia || createMedia(transport, cfg);
      const ip = ipHash(req, cfg);
      // Persisted IP/global gate precedes expensive authentication and any provider call.
      await transport.rpc('diagnostic_quota_v1', {
        p_limits: quotaLimits(null, ip, cfg),
        p_delta: { requests: 1 },
      });
      const actor = await principal(
        req,
        res,
        cfg,
        transport,
        action === 'create',
      );
      const limits = quotaLimits(actor, ip, cfg);
      await transport.rpc('diagnostic_quota_v1', {
        p_limits: [limits[2]],
        p_delta: { requests: 1 },
      });
      if (action === 'mission_context') {
        if (!actor.startsWith('u:') || !UUID.test(body.mission_id || ''))
          throw new DiagnosticError('AUTH_REQUIRED', 401);
        const context = await transport.rpc('diagnostic_mission_context_v1', {
          p_user_id: actor.slice(2),
          p_mission_id: body.mission_id,
        });
        const photos = [];
        for (const item of context.media || [])
          photos.push({
            id: item.id,
            url: await mediaStore.readUrl(item.clean_path),
          });
        return send(res, 200, {
          ok: true,
          context: {
            result: context.result,
            input: context.input,
            booking: context.booking,
            pricing: context.pricing,
            photos,
          },
        });
      }
      const id = body.session_id;
      if (!UUID.test(id || '')) throw new DiagnosticError('INVALID_SESSION');
      const call = (op, payload) =>
        transport.rpc('diagnostic_state_v1', {
          p_action: op,
          p_actor: actor,
          p_session_id: id,
          p_payload: payload || {},
        });
      let data;
      if (action === 'create' || action === 'update') {
        if (!CITIES.includes(body.city_slug))
          throw new DiagnosticError('INVALID_CITY');
        const input = validatedInput(body.input);
        if (
          action === 'create' &&
          body.consent_version !== 'diagnostic-privacy-v1'
        )
          throw new DiagnosticError('CONSENT_REQUIRED');
        data = await call(action, {
          revision: body.revision,
          city_slug: body.city_slug,
          input,
          source: 'homepage',
          consent_version: body.consent_version,
          limits,
        });
      } else if (action === 'media_reserve') {
        if (body.kind !== 'photo')
          throw new DiagnosticError('VIDEO_DISABLED', 422);
        if (
          !MEDIA.photo.mime_types.includes(body.mime) ||
          !Number.isSafeInteger(body.bytes) ||
          body.bytes < 1 ||
          body.bytes > MEDIA.photo.max_bytes
        )
          throw new DiagnosticError('INVALID_MEDIA', 422);
        data = await call('media_reserve', {
          revision: body.revision,
          kind: 'photo',
          mime: body.mime,
          bytes: body.bytes,
          limits,
        });
        const uploadUrl = await mediaStore.uploadTicket(data.item);
        return send(res, 200, {
          ok: true,
          session: publicView(data),
          upload: { media_id: data.item.id, url: uploadUrl },
        });
      } else if (action === 'media_validate') {
        if (!UUID.test(body.media_id || ''))
          throw new DiagnosticError('INVALID_MEDIA');
        data = await call('media_claim', {
          revision: body.revision,
          media_id: body.media_id,
        });
        const item = data.item;
        if (item.state !== 'ready') {
          try {
            const photo = await sanitizePhoto(
              await mediaStore.download(item.raw_path),
              item.declared_mime,
              item.declared_bytes,
            );
            try {
              await mediaStore.store(item.clean_path, photo.bytes);
            } catch (error) {
              // A lost response may have left the same immutable sanitized object.
              // Reuse only after verifying every byte, never by trusting its filename.
              if (
                hash(await mediaStore.download(item.clean_path)) !==
                photo.sha256
              )
                throw error;
            }
            data = await call('media_finish', {
              revision: body.revision,
              media_id: item.id,
              lease: item.validation_lease,
              mime: photo.mime,
              bytes: photo.bytes.length,
              width: photo.width,
              height: photo.height,
              sha256: photo.sha256,
            });
          } catch (error) {
            await call('media_reject', {
              revision: body.revision,
              media_id: item.id,
              lease: item.validation_lease,
            }).catch(() => {});
            throw error;
          } finally {
            // The persistent media row also schedules repeated cleanup after ticket expiry.
            await mediaStore.remove([item.raw_path]).catch(() => {});
          }
        }
      } else if (action === 'media_remove') {
        if (!UUID.test(body.media_id || ''))
          throw new DiagnosticError('INVALID_MEDIA');
        data = await call('media_remove', {
          revision: body.revision,
          media_id: body.media_id,
        });
        await mediaStore
          .remove([data.item.raw_path, data.item.clean_path])
          .catch(() => {});
      } else if (action === 'media_url') {
        data = await call('get');
        const item = data.media.find(
          (m) =>
            m.id === body.media_id &&
            m.state === 'ready' &&
            Date.parse(m.expires_at) > Date.now(),
        );
        if (!item) throw new DiagnosticError('MEDIA_NOT_FOUND', 404);
        return send(res, 200, {
          ok: true,
          url: await mediaStore.readUrl(item.clean_path),
          expires_in: 60,
        });
      } else if (action === 'analyze') {
        if (!UUID.test(body.run_id || ''))
          throw new DiagnosticError('INVALID_RUN');
        data = await call('run_start', {
          revision: body.revision,
          run_id: body.run_id,
          limits,
          provider: cfg.provider,
          model: cfg.model,
          reserved_micro_usd: cfg.reserve,
        });
        if (data.replayed) {
          if (data.run.state === 'failed')
            throw new DiagnosticError('ANALYSIS_FAILED', 422);
          if (data.run.state === 'running')
            return send(res, 202, { ok: true, pending: true });
          data = await call('get');
        } else {
          try {
            const remaining = started + 45000 - Date.now();
            if (remaining < 2000)
              throw new DiagnosticError('DEPENDENCY_TIMEOUT', 504);
            const provider =
              injectedProvider ||
              createOpenAIAdapter({
                env,
                timeout: Math.min(cfg.providerTimeout, remaining),
                deadline: started + 45000,
              });
            const output = await analyze(data.run.input_snapshot, {
              provider,
              mediaStore,
            });
            const grounding = groundingNormalizationDetails(output.usage?.grounding_normalized_fields);
            if (grounding) logger.info?.(JSON.stringify({
              event: 'diagnostic_grounding_normalized', request_id: requestId,
              action: 'analyze', grounding,
            }));
            data = await call('run_finish', {
              revision: body.revision,
              run_id: body.run_id,
              result: output.result,
              usage: {
                ...output.usage,
                provider_called: output.providerCalled,
              },
              latency_ms: Date.now() - started,
            });
          } catch (error) {
            await call('run_fail', {
              revision: body.revision,
              run_id: body.run_id,
              error_code: /^[A-Z_]+$/.test(error.code || error.message)
                ? error.code || error.message
                : 'ANALYSIS_FAILED',
              latency_ms: Date.now() - started,
            }).catch(() => {});
            throw error;
          }
        }
      } else if (['confirmation_context', 'confirm_intervention', 'intervention_status'].includes(action)) {
        data = await call('get');
        if (action === 'intervention_status')
          return send(res, 200, { ok: true, progress: await interventionStatus(data, transport) });
        if (action === 'confirmation_context')
          return send(res, 200, await confirmationContext({ data, body, transport }));
        return send(res, 200, await confirmIntervention({ body, data, actor, transport, env }));
      } else if (action === 'confirm_critical') {
        data = await call('get');
        const confirmation = await confirmCritical({ body, data, actor, transport, env });
        return send(res, 200, confirmation);
      } else if (action === 'handoff') {
        data = await call('get');
        if (
          data.session.revision !== body.revision ||
          data.session.state !== 'ready' ||
          !data.run?.result ||
          data.run.result.safety.stop ||
          data.run.revision !== data.session.revision
        )
          throw new DiagnosticError('DIAGNOSTIC_NOT_QUALIFIED', 409);
        const token = sealToken(
          {
            kind: 'diagnostic-handoff',
            session_id: id,
            run_id: data.run.id,
            revision: data.session.revision,
            actor,
            issued_at: Date.now(),
            expires_at: Date.now() + 15 * 60 * 1000,
          },
          env.FIXEO_ESTIMATOR_SECRET,
        );
        return send(res, 200, {
          ok: true,
          entry_context: {
            source: 'diagnostic',
            city_slug: data.session.city_slug,
            description: data.session.input.description,
            metier_hint: data.run.result.trade.value,
            known_inputs: {},
            diagnostic_token: token,
          },
        });
      } else data = await call('get');
      return send(res, 200, { ok: true, session: publicView(data) });
    } catch (error) {
      const code =
        error instanceof DiagnosticError ? error.code : 'DIAGNOSTIC_FAILED';
      logger.warn?.(
        JSON.stringify({
          event: 'diagnostic_error',
          request_id: requestId,
          action: ACTIONS.has(action) ? action : 'unknown',
          code,
          latency_ms: Date.now() - started,
          ...(error.diagnosticTransport ? { transport: error.diagnosticTransport } : {}),
          ...(groundingLogDetails(error) ? { grounding: groundingLogDetails(error) } : {}),
        }),
      );
      return send(res, error instanceof DiagnosticError ? error.status : 502, {
        ok: false,
        error: code,
        request_id: requestId,
      });
    }
  };
}
module.exports = { createHandler, validatedInput, publicView };
