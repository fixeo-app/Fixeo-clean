/**
 * FIXEO Guest Request Secure Read
 * File: api/guest-request-fn/index.js
 *
 * Purpose:
 *   Allow an anonymous client to read ONE service_request only when
 *   both tracking_ref and guest_token are valid.
 *
 * Security:
 *   - tracking_ref alone is NOT sufficient
 *   - raw guest_token is never stored in DB
 *   - SHA-256(token) is compared to service_requests.guest_token_hash
 *   - service_role is used server-side only
 *   - response is intentionally minimal
 */

'use strict';

var crypto = require('crypto');

var CORS_HEADERS = {
  'Access-Control-Allow-Origin':  'https://www.fixeo.ma',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400'
};

var REF_RE   = /^[A-Z0-9\-]{3,32}$/;
var TOKEN_RE = /^[a-f0-9]{64}$/i;

function _str(v, max) {
  return String(v || '').trim().slice(0, max || 500);
}

function _hashGuestToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex');
}

function _safeEqualHex(a, b) {
  try {
    var ba = Buffer.from(String(a || ''), 'hex');
    var bb = Buffer.from(String(b || ''), 'hex');

    if (ba.length !== 32 || bb.length !== 32) return false;

    return crypto.timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}

async function _findRequestByTrackingRef(trackingRef) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    var err = new Error('Supabase environment missing');
    err.code = 'ENV_MISSING';
    throw err;
  }

  var endpoint =
    url +
    '/rest/v1/service_requests' +
    '?tracking_ref=eq.' + encodeURIComponent(trackingRef) +
    '&select=id,tracking_ref,guest_token_hash,service_category,city,description,status,created_at,client_profile_id' +
    '&limit=1';

  var response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey
    }
  });

  if (!response.ok) {
    var txt = await response.text().catch(function() { return ''; });
    var sbErr = new Error(
      'Supabase HTTP ' + response.status + ': ' + txt.slice(0, 200)
    );
    sbErr.code = 'SUPABASE_ERROR';
    throw sbErr;
  }

  var rows = await response.json().catch(function() { return []; });
  return rows && rows.length ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(function(entry) {
    res.setHeader(entry[0], entry[1]);
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      ok: false,
      error: 'Method Not Allowed',
      code: 'METHOD_NOT_ALLOWED'
    });
    return;
  }

  var body = req.body || {};

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }

  var trackingRef = _str(body.tracking_ref, 32).toUpperCase();
  var guestToken  = _str(body.guest_token, 128);

  if (!REF_RE.test(trackingRef) || !TOKEN_RE.test(guestToken)) {
    res.status(400).json({
      ok: false,
      error: 'Invalid credentials',
      code: 'INVALID_INPUT'
    });
    return;
  }

  try {
    var request = await _findRequestByTrackingRef(trackingRef);

    /*
     * Same public response for:
     * - unknown tracking_ref
     * - missing hash
     * - wrong token
     *
     * This avoids leaking whether a reservation exists.
     */
    if (!request || !request.guest_token_hash) {
      res.status(404).json({
        ok: false,
        error: 'Request not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    var suppliedHash = _hashGuestToken(guestToken);

    if (!_safeEqualHex(suppliedHash, request.guest_token_hash)) {
      res.status(404).json({
        ok: false,
        error: 'Request not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    /*
     * Once attached to an authenticated account, guest access should
     * no longer remain authoritative.
     */
    if (request.client_profile_id) {
      res.status(409).json({
        ok: false,
        error: 'Authentication required',
        code: 'ACCOUNT_OWNED'
      });
      return;
    }

    /*
     * Minimal safe guest response.
     * NEVER return:
     *   guest_token_hash
     *   client_profile_id
     *   internal dispatch data
     */
    res.status(200).json({
      ok: true,
      request: {
        id:               request.id,
        tracking_ref:     request.tracking_ref,
        service_category: request.service_category || null,
        city:             request.city || null,
        description:      request.description || null,
        status:           request.status || null,
        created_at:       request.created_at || null
      }
    });

  } catch (err) {
    console.error(
      '[guest-request-fn] error:',
      err && err.message ? err.message : err
    );

    res.status(err && err.code === 'ENV_MISSING' ? 503 : 500).json({
      ok: false,
      error: 'Service temporarily unavailable',
      code: err && err.code === 'ENV_MISSING'
        ? 'SERVICE_UNAVAILABLE'
        : 'INTERNAL_ERROR'
    });
  }
};
