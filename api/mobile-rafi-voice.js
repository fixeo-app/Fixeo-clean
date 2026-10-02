'use strict';

const { createTransport, DiagnosticError } = require('./diagnostic/transport');

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) throw new DiagnosticError('AUTH_REQUIRED', 401);
  return match[1];
}

function voiceLimits(userId) {
  return [
    {
      key: 'mobile-voice:global',
      requests: 3000,
      sessions: 0,
      analyses: 0,
      bytes: 2 * 1024 * 1024 * 1024,
      reserved_micro_usd: 0,
    },
    {
      key: 'mobile-voice:u:' + userId,
      requests: 30,
      sessions: 0,
      analyses: 0,
      bytes: 96 * 1024 * 1024,
      reserved_micro_usd: 0,
    },
  ];
}

function createMobileVoiceHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  return async function mobileVoice(req, res) {
    const started = Date.now();
    try {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
      }

      if (!env.OPENAI_API_KEY) {
        return send(res, 503, { ok: false, error: 'transcription_unavailable' });
      }

      const token = bearer(req);
      const transport = createTransport({ env, fetchImpl, deadline: started + 30000 });
      const userId = await transport.user(token);

      if (!req.file || !req.file.buffer || !req.file.size) {
        return send(res, 400, { ok: false, error: 'audio_required' });
      }

      await transport.rpc('diagnostic_quota_v1', {
        p_limits: voiceLimits(userId),
        p_delta: {
          requests: 1,
          sessions: 0,
          analyses: 0,
          bytes: req.file.size,
          reserved_micro_usd: 0,
        },
      });

      const form = new globalThis.FormData();
      const audioBlob = new globalThis.Blob(
        [req.file.buffer],
        { type: req.file.mimetype || 'audio/webm' },
      );

      form.append(
        'file',
        audioBlob,
        req.file.originalname || 'fixeo-mobile-voice.webm',
      );
      form.append('model', 'gpt-transcribe');

      const requestedLanguage =
        req.body && typeof req.body.language === 'string'
          ? req.body.language
          : '';

      if (requestedLanguage === 'fr-FR') {
        form.append('language', 'fr');
      } else if (requestedLanguage === 'ar-MA') {
        form.append('language', 'ar');
      }

      form.append(
        'prompt',
        [
          'Le locuteur est au Maroc.',
          'Il peut parler en darija marocaine, arabe ou français,',
          'et peut mélanger plusieurs langues dans la même phrase.',
          'Le contexte concerne des interventions à domicile.',
          'Transcrire fidèlement ce qui est prononcé.',
          'Ne pas traduire et ne pas reformuler.',
        ].join(' '),
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;

      try {
        response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + env.OPENAI_API_KEY,
          },
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const rawText = await response.text();

      if (!response.ok) {
        logger.warn?.(
          '[FIXEO Mobile Voice] provider failure',
          response.status,
          'user',
          userId.slice(0, 8),
        );
        return send(res, 502, { ok: false, error: 'transcription_failed' });
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (_) {
        return send(res, 502, { ok: false, error: 'transcription_invalid_response' });
      }

      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) {
        return send(res, 422, { ok: false, error: 'transcription_empty' });
      }

      logger.info?.(
        '[FIXEO Mobile Voice] transcription ok',
        'bytes',
        req.file.size,
        'latency_ms',
        Date.now() - started,
      );

      return send(res, 200, { ok: true, text });
    } catch (error) {
      if (error?.name === 'AbortError') {
        return send(res, 504, { ok: false, error: 'transcription_timeout' });
      }

      if (error instanceof DiagnosticError) {
        return send(res, error.status || 400, {
          ok: false,
          error: error.code || 'mobile_voice_failed',
        });
      }

      logger.warn?.('[FIXEO Mobile Voice] failed', error?.message || 'unknown');
      return send(res, 502, { ok: false, error: 'mobile_voice_failed' });
    }
  };
}

module.exports = { createMobileVoiceHandler, voiceLimits };
