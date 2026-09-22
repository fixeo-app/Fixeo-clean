'use strict';
const crypto = require('node:crypto');
const { DiagnosticError } = require('./transport');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function sameOrigin(req, cfg) {
  if (
    req.headers?.origin !== cfg.origin ||
    req.headers?.['x-fixeo-diagnostic'] !== '1' ||
    (req.headers?.['sec-fetch-site'] &&
      req.headers['sec-fetch-site'] !== 'same-origin')
  ) {
    throw new DiagnosticError('ORIGIN_REJECTED', 403);
  }
}
function ipHash(req, cfg) {
  // On Vercel this platform-owned header is overwritten by its trusted proxy.
  // Missing production provenance fails closed instead of trusting an arbitrary XFF.
  const address = cfg.local
    ? req.socket?.remoteAddress || 'local-test'
    : req.headers?.['x-vercel-forwarded-for'];
  if (!address || typeof address !== 'string' || address.length > 200)
    throw new DiagnosticError('CLIENT_CONTEXT_UNAVAILABLE', 503);
  return crypto
    .createHmac('sha256', cfg.secret)
    .update(address.split(',')[0].trim())
    .digest('hex');
}
async function principal(req, res, cfg, transport, allowCreate = false) {
  const authorization = req.headers?.authorization;
  if (authorization !== undefined) {
    if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization))
      throw new DiagnosticError('AUTH_REQUIRED', 401);
    return 'u:' + (await transport.user(authorization.slice(7)));
  }
  const cookie = (req.headers?.cookie || '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(cfg.cookie + '='));
  let secret = cookie?.slice(cfg.cookie.length + 1);
  if (secret !== undefined && !/^[0-9a-f]{64}$/.test(secret))
    throw new DiagnosticError('AUTH_REQUIRED', 401);
  if (!secret) {
    if (!allowCreate) throw new DiagnosticError('AUTH_REQUIRED', 401);
    secret = crypto.randomBytes(32).toString('hex');
  }
  if (allowCreate) {
    res.setHeader(
      'Set-Cookie',
      `${cfg.cookie}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${cfg.local ? '' : '; Secure'}`,
    );
  }
  return 'g:' + hash(secret);
}
module.exports = { hash, sameOrigin, ipHash, principal };
