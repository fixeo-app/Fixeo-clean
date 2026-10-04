'use strict';
const { randomUUID } = require('node:crypto');
const security = require('./security');
const { config, quotaLimits } = require('../diagnostic/config');
const { ipHash } = require('../diagnostic/auth');
const { createClientTransport } = require('./transport');
const { hash } = require('../diagnostic/auth');
const { createMedia } = require('../diagnostic/media');
const { analyze } = require('../diagnostic/engine');
const { createOpenAIAdapter } = require('../diagnostic/providers/openai');
const { sealToken } = require('../estimator-v1/fixeo-estimator-token-v1');

async function persistPhoto(req, sanitized, description, city, dependencies = {}) {
  const env = security.staging(dependencies.env || process.env);
  const auth = await security.client(req, dependencies.fetchImpl);
  if (req.body?.consent_version !== 'diagnostic-privacy-v1') security.fail('DIAGNOSTIC_CONSENT_REQUIRED', 422);
  const cfg = config(env), actor = 'u:' + auth.userId;
  const transport = dependencies.transport || createClientTransport({ auth, env, fetchImpl: dependencies.fetchImpl });
  const media = dependencies.media || createMedia(transport, cfg);
  const limits = quotaLimits(actor, ipHash(req, cfg), cfg);
  await transport.rpc('diagnostic_quota_v1', { p_limits: limits, p_delta: { requests: 1 } });
  const sessionId = randomUUID(), runId = randomUUID();
  let revision = 1, running = false;
  const call = (action, payload = {}) => transport.rpc('diagnostic_state_v1', {
    p_action: action, p_actor: actor, p_session_id: sessionId, p_payload: { ...payload, revision },
  });
  try {
    await call('create', { city_slug: city, source: 'client', consent_version: 'diagnostic-privacy-v1', input: { description, answers: {}, safety_signals: [] }, limits });
    let data = await call('media_reserve', { kind: 'photo', mime: 'image/webp', bytes: sanitized.bytes.length, limits });
    revision = data.session.revision;
    data = await call('media_claim', { media_id: data.item.id });
    const item = data.item;
    await media.store(item.clean_path, sanitized.bytes);
    // INSERT rights do not establish provenance. Verify the immutable stored bytes.
    const stored = await media.download(item.clean_path);
    if (stored.length !== sanitized.bytes.length || hash(stored) !== sanitized.sha256)
      security.fail('DIAGNOSTIC_MEDIA_HASH_MISMATCH',409);
    await call('media_finish', { media_id: item.id, lease: item.validation_lease, mime: sanitized.mime,
      bytes: sanitized.bytes.length, width: sanitized.width, height: sanitized.height, sha256: sanitized.sha256 });
    data = await call('run_start', { run_id: runId, limits, provider: cfg.provider,
      model: env.FIXEO_DIAGNOSTIC_MODEL || 'gpt-4.1-mini-2025-04-14', reserved_micro_usd: cfg.reserve });
    running = true;
    const started = Date.now();
    const output = await analyze(data.run.input_snapshot, {
      provider: dependencies.provider || createOpenAIAdapter({ env, timeout: 25000, deadline: Date.now() + 28000 }),
      mediaStore: media, qualificationMode: 'estimator',
    });
    data = await call('run_finish', { run_id: runId, result: output.result, usage: { ...output.usage, provider_called: output.providerCalled }, latency_ms: Date.now() - started });
    running = false;
    let reference = null;
    if (data.session.state === 'ready' && data.run?.result?.safety?.stop === false && data.run.id === runId) {
      const token = sealToken({ kind: 'diagnostic-handoff', session_id: sessionId, run_id: runId,
        revision, actor, issued_at: Date.now(), expires_at: Date.now() + 15 * 60 * 1000 }, env.FIXEO_ESTIMATOR_SECRET);
      reference = security.wrap(token, 'diagnostic', auth.userId, env);
    }
    return { ok: true, result: data.run.result, diagnostic_reference: reference,
      privacy: { persisted: true, raw_photo_retained: false, sanitized_photo_retained: true },
      diagnostic_reference_expires_in: reference ? 900 : null };
  } catch (error) {
    if (running) await call('run_fail', { run_id: runId, error_code: 'ANALYSIS_FAILED', latency_ms: 0 }).catch(() => {});
    throw error;
  }
}
module.exports = { persistPhoto };
