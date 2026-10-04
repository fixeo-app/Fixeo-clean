'use strict';
const { STAGING_URL, STAGING_PUBLIC_KEY, MobileRafiError, bearer, authenticate } = require('../mobile-rafi-common');
const { sealToken, unsealToken } = require('../estimator-v1/fixeo-estimator-token-v1');
const {runtime} = require('./runtime');
const { CITIES } = require('../diagnostic/contract');
const fail = (code, status = 400) => { throw new MobileRafiError(code, status); };
function staging(env = process.env) {
  return runtime(env);
}
async function client(req, fetchImpl = fetch) {
  const token = bearer(req);
  const userId = await authenticate(token, fetchImpl);
  let response;
  try {
    response = await fetchImpl(STAGING_URL + '/rest/v1/users?id=eq.' + encodeURIComponent(userId) + '&select=id,role', {
      headers: { apikey: STAGING_PUBLIC_KEY, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
  } catch (_) { fail('AUTH_UNAVAILABLE', 503); }
  const rows = await response.json().catch(() => null);
  if (!response.ok) fail('AUTH_UNAVAILABLE', 503);
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== userId || rows[0].role !== 'client') fail('ROLE_FORBIDDEN', 403);
  return { token, userId };
}
function envelopeSecret(env) { return env.FIXEO_ESTIMATOR_SECRET + ':mobile-intelligence-v1'; }
function wrap(token, kind, userId, env = process.env, qualificationCount = 0) {
  const payload = unsealToken(token, env.FIXEO_ESTIMATOR_SECRET);
  if (!Number.isFinite(payload.expires_at)) fail('ESTIMATOR_UNAVAILABLE', 503);
  return sealToken({ version: 1, kind, userId, token, qualificationCount, expires_at: payload.expires_at }, envelopeSecret(env));
}
function qualificationCount(token, userId, env) {
  unwrap(token,'session',userId,env);
  const value=unsealToken(token,envelopeSecret(env)).qualificationCount;
  if(!Number.isInteger(value)||value<0||value>1)fail('ESTIMATOR_SESSION_INVALID');
  return value;
}
function unwrap(token, kind, userId, env = process.env) {
  const prefix = kind === 'pricing' ? 'PRICING_CONTEXT' : kind === 'diagnostic' ? 'DIAGNOSTIC' : 'ESTIMATOR_SESSION';
  if (typeof token !== 'string' || token.length > 70000) fail(prefix + '_INVALID');
  let data;
  try { data = unsealToken(token, envelopeSecret(env)); }
  catch (e) { fail(prefix + (e.message === 'Token expired' ? '_EXPIRED' : '_INVALID'), e.message === 'Token expired' ? 410 : 400); }
  if (data.version !== 1 || data.kind !== kind || data.userId !== userId || !data.token || !Number.isFinite(data.expires_at)) fail(prefix + '_INVALID', 403);
  return data.token;
}
function trustedRequest(req, token, body, env = process.env) {
  const origin = env.FIXEO_DIAGNOSTIC_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:') fail('GATEWAY_UNAVAILABLE', 503);
  // Reconstructed after bearer validation. No caller Origin/Host or user_id is authority.
  return { method: 'POST', body, socket: req.socket, headers: {
    authorization: 'Bearer ' + token, 'content-type': 'application/json',
    origin, host: new URL(origin).host, 'x-fixeo-diagnostic': '1',
    'x-vercel-forwarded-for': req.headers?.['x-vercel-forwarded-for'],
  }};
}
async function invoke(handler, req) {
  let status = 200, body;
  await handler(req, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return this; } });
  if (!body || typeof body !== 'object') fail('ESTIMATOR_UNAVAILABLE', 502);
  return { status, body };
}
async function quota(transport, kind='estimator') {
  await transport.rpc('mobile_intelligence_quota_v1', { p_kind:kind });
}
function city(value) { if (!CITIES.includes(value)) fail('CITY_NOT_SUPPORTED', 422); return value; }
module.exports = { staging, client, wrap, unwrap, qualificationCount, trustedRequest, invoke, quota, city, fail };
