'use strict';

const STAGING_URL = 'https://kqyhusnbybsukbcaoqtu.supabase.co';
const STAGING_PUBLIC_KEY = 'sb_publishable_sV-PYAY5zgir1UTJ6LNl6Q_ObK78uMo';

class MobileRafiError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function assertPreview(env = process.env) {
  if (env.NODE_ENV === 'test') return;
  if (env.VERCEL_ENV !== 'preview') {
    throw new MobileRafiError('STAGING_PREVIEW_REQUIRED', 503);
  }
}

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/i);
  if (!match) throw new MobileRafiError('AUTH_REQUIRED', 401);
  return match[1];
}

async function authenticate(token, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(STAGING_URL + '/auth/v1/user', {
      headers: {
        apikey: STAGING_PUBLIC_KEY,
        Authorization: 'Bearer ' + token,
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
  } catch (_) {
    throw new MobileRafiError('AUTH_UNAVAILABLE', 503);
  }

  if (!response.ok) {
    throw new MobileRafiError('AUTH_REQUIRED', 401);
  }

  const data = await response.json().catch(() => null);
  if (!data || !/^[0-9a-f-]{36}$/i.test(String(data.id || ''))) {
    throw new MobileRafiError('AUTH_REQUIRED', 401);
  }
  return String(data.id);
}

async function consumeQuota(
  token,
  kind,
  bytes,
  fetchImpl = globalThis.fetch,
) {
  let response;
  try {
    response = await fetchImpl(
      STAGING_URL + '/rest/v1/rpc/mobile_rafi_quota_v1',
      {
        method: 'POST',
        headers: {
          apikey: STAGING_PUBLIC_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_kind: kind,
          p_bytes: bytes,
        }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      },
    );
  } catch (_) {
    throw new MobileRafiError('QUOTA_UNAVAILABLE', 503);
  }

  const raw = await response.text();
  if (!response.ok) {
    let message = '';
    try {
      message = String(JSON.parse(raw)?.message || '');
    } catch (_) {}

    if (/DIAGNOSTIC_QUOTA_EXCEEDED/.test(message)) {
      throw new MobileRafiError('DIAGNOSTIC_QUOTA_EXCEEDED', 429);
    }
    if (/MOBILE_RAFI_BYTES_INVALID/.test(message)) {
      throw new MobileRafiError('MEDIA_INVALID', 413);
    }
    throw new MobileRafiError(
      response.status === 401 || response.status === 403
        ? 'AUTH_REQUIRED'
        : 'QUOTA_REJECTED',
      response.status === 401 || response.status === 403 ? 401 : 502,
    );
  }

  return raw ? JSON.parse(raw) : { ok: true };
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.status(status).json(body);
}

module.exports = {
  STAGING_URL,
  STAGING_PUBLIC_KEY,
  MobileRafiError,
  assertPreview,
  bearer,
  authenticate,
  consumeQuota,
  send,
};
