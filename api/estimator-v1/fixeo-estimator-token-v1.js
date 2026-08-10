/*!
 * api/estimator-v1/fixeo-estimator-token-v1.js
 * FIXEO Estimator Token Utilities — Phase 7C.9B
 *
 * AES-256-GCM encrypted session tokens using Node.js crypto only.
 * NO external dependencies.
 *
 * Security contract:
 *   - Missing secret → throws (FAIL CLOSED — NEVER returns data)
 *   - Expired → throws
 *   - Tampered → GCM auth tag rejection throws automatically
 *   - Unknown version → throws
 */
'use strict';

const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * sealToken(payload, secret) → opaque base64url string
 * payload must include expires_at (ms timestamp)
 */
function sealToken(payload, secret) {
  if (!secret) throw new Error('FIXEO_ESTIMATOR_SECRET not configured');
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    v: 'fxt-v1',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  })).toString('base64url');
}

/**
 * unsealToken(token, secret) → decrypted payload object
 * throws on: missing secret, unknown version, tamper, expiry
 */
function unsealToken(token, secret) {
  if (!secret) throw new Error('FIXEO_ESTIMATOR_SECRET not configured');
  const key = deriveKey(secret);
  let env;
  try {
    env = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch (e) {
    throw new Error('Token parse error');
  }
  if (env.v !== 'fxt-v1') throw new Error('Unknown token version');
  const dec = crypto.createDecipheriv(ALGO, key, Buffer.from(env.iv, 'base64'));
  dec.setAuthTag(Buffer.from(env.tag, 'base64'));
  // GCM auth failure throws automatically here if tampered
  const plaintext = JSON.parse(
    Buffer.concat([dec.update(Buffer.from(env.ct, 'base64')), dec.final()]).toString('utf8')
  );
  if (plaintext.expires_at && Date.now() > plaintext.expires_at) {
    throw new Error('Token expired');
  }
  return plaintext;
}

module.exports = { sealToken, unsealToken };
