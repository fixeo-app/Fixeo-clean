'use strict';
require('../certification-egress.cjs')();

const multer = require('multer');
const { runtimeBoundary } = require('../mobile-media-privacy.cjs');
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
    files: 1, fields: 8, parts: 9, fieldSize: 4096,
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

async function transcribe(req, res, privacy) {
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

    await privacy.approve(req.body);
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
      response = await privacy.providerFetch(
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

    return send(res, 200, { ok: true, text, enterprise_context: await privacy.currentContext() });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return send(res, 504, { ok: false, error: 'transcription_timeout' });
    }
    if (['AUTH_REQUIRED','FORBIDDEN','INVALID_INPUT','POLICY_VERSION_OUTDATED','CONTRACT_REQUIRED','FEATURE_UNAVAILABLE','RATE_LIMITED','DEPENDENCY_UNAVAILABLE'].includes(error?.code)) return send(res, error.status || 503, { ok:false,error:error.code });
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
        code: 'UNEXPECTED_FAILURE',
        latency_ms: Date.now() - started,
      }),
    );
    return send(res, 502, { ok: false, error: 'transcription_failed' });
  }
}

async function handler(req, res) {
  let privacy;
  try {
    if(!process.env.OPENAI_API_KEY) throw new MobileRafiError('FEATURE_UNAVAILABLE',503);
    privacy=await runtimeBoundary().preflight(req,'voice_transcription');
  }
  catch(error) { return send(res,error.status||503,{ok:false,error:error.code||'DEPENDENCY_UNAVAILABLE'}); }
  return new Promise(resolve=>upload(req,res,async error=>{
    try {
      if(error) return send(res,error.code==='LIMIT_FILE_SIZE'?413:415,{ok:false,error:'media_upload_invalid'});
      return await transcribe(req,res,privacy);
    } finally { if(req.file?.buffer)req.file.buffer.fill(0);resolve(); }
  }));
};

module.exports = async (req,res)=>{
 try{return await require('../enterprise-context.cjs').run(req,()=>handler(req,res));}
 catch(error){return send(res,error.status||503,{ok:false,error:error.code||'DEPENDENCY_UNAVAILABLE'});}
};
