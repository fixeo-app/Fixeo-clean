'use strict';

const { randomUUID } = require('node:crypto');
const multer = require('multer');
const { CITIES } = require('../diagnostic/contract');
const { sanitizePhoto } = require('../diagnostic/media');
const { createOpenAIAdapter } = require('../diagnostic/providers/openai');
const { analyze } = require('../diagnostic/engine');
const { DiagnosticError } = require('../diagnostic/transport');
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
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter(req, file, cb) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('INVALID_IMAGE_TYPE'));
    }
    cb(null, true);
  },
}).single('image');

function normalizeCity(value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!CITIES.includes(slug)) {
    throw new MobileRafiError('CITY_NOT_SUPPORTED', 422);
  }
  return slug;
}

async function inspect(req, res) {
  const started = Date.now();

  try {
    assertPreview(process.env);

    const {runtime,BRANCH}=require('../mobile-intelligence-fn/runtime');
    const providerEnv=process.env.VERCEL_GIT_COMMIT_REF===BRANCH?runtime(process.env):process.env;

    const diagnosticModel =
      providerEnv.FIXEO_DIAGNOSTIC_MODEL || 'gpt-4.1-mini-2025-04-14';

    if (!providerEnv.OPENAI_API_KEY) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_photo_unavailable',
          has_openai_key: false,
          model: diagnosticModel,
        }),
      );
      return send(res, 503, { ok: false, error: 'diagnostic_unavailable' });
    }

    const token = bearer(req);
    await authenticate(token);

    if (!req.file?.buffer?.length) {
      return send(res, 400, { ok: false, error: 'photo_required' });
    }

    const city = normalizeCity(req.body?.city);

    const description = String(req.body?.description || '').trim();
    if (description.length > 2000) {
      return send(res, 422, { ok: false, error: 'description_too_long' });
    }

    const sanitized = await sanitizePhoto(
      req.file.buffer,
      req.file.mimetype,
      req.file.size,
    );

    if (req.body?.persist === 'true') {
      const persisted = await require('../mobile-intelligence-fn/diagnostic').persistPhoto(req, sanitized, description, city);
      return send(res, 200, persisted);
    }

    await consumeQuota(token, 'photo', sanitized.bytes.length);

    const mediaId = randomUUID();
    const mediaStore = {
      async download(path) {
        if (path !== 'memory:' + mediaId) {
          throw new DiagnosticError('MEDIA_NOT_FOUND', 404);
        }
        return sanitized.bytes;
      },
    };

    const snapshot = {
      input: {
        description,
        answers: {},
        safety_signals: [],
      },
      previous_safety_signals: [],
      media: [
        {
          id: mediaId,
          path: 'memory:' + mediaId,
          sha256: sanitized.sha256,
        },
      ],
    };

    const provider = createOpenAIAdapter({
      env: {
        ...providerEnv,
        FIXEO_DIAGNOSTIC_MODEL: diagnosticModel,
      },
      photoPolicy: 'descriptive',
      timeout: 25000,
      deadline: started + 28000,
    });

    const output = await analyze(snapshot, {
      provider,
      mediaStore,
    });

    console.info(
      JSON.stringify({
        event: 'mobile_rafi_photo_ok',
        input_bytes: req.file.size,
        safe_bytes: sanitized.bytes.length,
        latency_ms: Date.now() - started,
        provider_called: output.providerCalled,
      }),
    );

    return send(res, 200, {
      ok: true,
      result: output.result,
      privacy: {
        persisted: false,
        raw_photo_retained: false,
        sanitized_photo_retained: false,
      },
    });
  } catch (error) {
    if (error instanceof MobileRafiError) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_photo_gateway_error',
          code: error.code,
          status: error.status,
          latency_ms: Date.now() - started,
        }),
      );
      return send(res, error.status, { ok: false, error: error.code });
    }

    if (error instanceof DiagnosticError) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_photo_diagnostic_error',
          code: error.code || 'diagnostic_failed',
          status: error.status || 422,
          latency_ms: Date.now() - started,
        }),
      );
      return send(res, error.status || 422, {
        ok: false,
        error: error.code || 'diagnostic_failed',
      });
    }

    const code = String(error?.message || '');
    if (/INVALID_(?:MEDIA|PHOTO)|MEDIA_TOO_LARGE|UNSUPPORTED_IMAGE/i.test(code)) {
      return send(res, 422, { ok: false, error: 'photo_invalid' });
    }

    console.warn(
      JSON.stringify({
        event: 'mobile_rafi_photo_failed',
        code: code.slice(0, 100) || 'unknown',
        latency_ms: Date.now() - started,
      }),
    );

    return send(res, 502, { ok: false, error: 'diagnostic_failed' });
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
        error: tooLarge ? 'photo_too_large' : 'photo_upload_invalid',
      });
    }

    return void inspect(req, res);
  });
};
