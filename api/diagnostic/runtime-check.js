'use strict';
// Temporary candidate verification. Public key only; expires automatically.
const { verify } = require('node:crypto');
const PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9k0WQOefFkHBxbVJ+bMnzRz2Nw4nmGvDh0d24vTHpnY=\n-----END PUBLIC KEY-----\n";
const EXPIRES = 1790050300362;
function authorized(req, env = process.env, now = Date.now()) {
  const body = req.body;
  if (env.VERCEL_ENV !== 'production' || !env.VERCEL_URL || req.headers?.host !== env.VERCEL_URL ||
      req.method !== 'POST' || body?.action !== 'verify_runtime' || now > EXPIRES ||
      !Number.isSafeInteger(body.timestamp) || Math.abs(now - body.timestamp) > 120000 ||
      typeof body.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(body.signature)) return false;
  const message = Buffer.from('fixeo-diagnostic-verify-v1\n' + env.VERCEL_URL + '\n' + body.timestamp);
  try { return verify(null, message, PUBLIC_KEY, Buffer.from(body.signature, 'base64url')); }
  catch (_) { return false; }
}
module.exports = { authorized };
