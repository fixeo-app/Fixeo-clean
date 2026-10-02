'use strict';

const multer = require('multer');
const {
  MobileRafiError,
  assertPreview,
  bearer,
  authenticate,
  consumeQuota,
  send,
} = require('../mobile-rafi-common');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024,
  },
  fileFilter(req, file, cb) {
    const allowed = new Set([
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('INVALID_AUDIO_TYPE'));
    }
    cb(null, true);
  },
}).single('audio');

async function transcribe(req, res) {
  const started = Date.now();
  try {
    assertPreview(process.env);

    if (req.method !== 'POST') {
      return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_voice_unavailable',
          has_openai_key: false,
        }),
      );
      return send(res, 503, { ok: false, error: 'transcription_unavailable' });
    }

    const token = bearer(req);
    await authenticate(token);

    if (!req.file?.buffer?.length) {
      return send(res, 400, { ok: false, error: 'audio_required' });
    }

    await consumeQuota(token, 'voice', req.file.size);

    const form = new globalThis.FormData();
    form.append(
      'file',
      new globalThis.Blob(
        [req.file.buffer],
        { type: req.file.mimetype || 'audio/mp4' },
      ),
      req.file.originalname || 'fixeo-mobile-voice.m4a',
    );
    form.append('model', 'gpt-transcribe');

    const language = String(req.body?.language || '');
    if (language === 'fr-FR') form.append('language', 'fr');
    else if (language === 'ar-MA') form.append('language', 'ar');

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
      response = await globalThis.fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
          },
          body: form,
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    if (!response.ok) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_voice_provider_error',
          provider_status: response.status,
          latency_ms: Date.now() - started,
        }),
      );
      return send(res, 502, { ok: false, error: 'transcription_failed' });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return send(res, 502, {
        ok: false,
        error: 'transcription_invalid_response',
      });
    }

    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) {
      return send(res, 422, { ok: false, error: 'transcription_empty' });
    }

    console.info(
      JSON.stringify({
        event: 'mobile_rafi_voice_ok',
        bytes: req.file.size,
        latency_ms: Date.now() - started,
      }),
    );

    return send(res, 200, { ok: true, text });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return send(res, 504, { ok: false, error: 'transcription_timeout' });
    }
    if (error instanceof MobileRafiError) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_voice_gateway_error',
          code: error.code,
          status: error.status,
          latency_ms: Date.now() - started,
        }),
      );
      return send(res, error.status, { ok: false, error: error.code });
    }
    console.warn(
      JSON.stringify({
        event: 'mobile_rafi_voice_failed',
        code: String(error?.message || 'unknown').slice(0, 80),
        latency_ms: Date.now() - started,
      }),
    );
    return send(res, 502, { ok: false, error: 'transcription_failed' });
  }
}

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  upload(req, res, function onUpload(error) {
    if (error) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return send(res, tooLarge ? 413 : 415, {
        ok: false,
        error: tooLarge ? 'audio_too_large' : 'audio_upload_invalid',
      });
    }
    return void transcribe(req, res);
  });
};
