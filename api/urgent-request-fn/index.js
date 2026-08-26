/**
 * FIXEO Urgent Request — api/urgent-request-fn/index.js
 * Version: fur-v2a — 7C.11D.1
 *
 * Receives urgent-flow submissions from fx-request-flow-v4.js (emergency mode).
 * Validates fields, inserts into Supabase service_requests (canonical table),
 * returns JSON { ok, ref, id }.
 *
 * DESIGN:
 *   - Server-side SERVICE_ROLE key → bypasses RLS → reliable for unauthenticated users
 *   - service_requests is the canonical parent for all dispatch flows
 *   - client_phone stored in dedicated column (7C.11C column; NOT in description)
 *   - urgency stored in dedicated column (7C.11C column)
 *   - description contains operational problem description ONLY
 *   - No phone/email/identity data in description
 *
 * SECURITY MODEL:
 *   - SERVICE ROLE key: server-side env var only, NEVER exposed to browser JS
 *   - Bypasses Supabase RLS — INSERT via service role
 *   - CORS: same-origin only (www.fixeo.ma)
 *   - Rate limit: 10 submissions per IP per 5 minutes (in-memory, per-instance)
 *   - Input validation: required fields, length caps, city allowlist, phone format
 *
 * PAYLOAD accepted (from fxrf4 emergency mode):
 *   service      — métier slug (e.g. 'plomberie')
 *   problem      — human-readable situation label (e.g. 'Fuite d\'eau')
 *   description  — free text from "Autre urgence" expand (optional)
 *   city         — city name from ALL_CITIES
 *   phone        — validated phone number → stored in client_phone column
 *   tracking_ref — client-generated ref (e.g. 'FX-3A7B2C')
 *   urgency      — always 'now' in emergency mode
 *   mode         — always 'emergency'
 *   source       — version tag (e.g. 'fxrf4-v5e')
 *
 * Response: { ok: true, ref, id }
 * On error: { ok: false, error, code }
 *
 * 7C.11D.1 CHANGES vs fur-v1a:
 *   - client_phone stored in dedicated SR column (was concatenated into description)
 *   - urgency stored in dedicated SR column (was implied / lost)
 *   - description = problem label + optional free-text + tracking_ref + source ONLY
 *   - fullDescription never includes 'Tel: ' + phone again
 *   - Row shape updated to use 7C.11C columns
 *
 * Environment variables required (Vercel dashboard):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret, server-side only)
 */
'use strict';
var crypto = require('crypto');

/* ── In-memory rate limiter (per Vercel instance) ── */
var _rateMap = {};
var RATE_LIMIT  = 10;
var RATE_WINDOW = 5 * 60 * 1000; /* 5 minutes */

function _rateCheck(ip) {
  var now = Date.now();
  var entry = _rateMap[ip];
  if (!entry || now - entry.ts > RATE_WINDOW) {
    _rateMap[ip] = { ts: now, count: 1 };
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/* ── CORS headers ── */
var CORS_HEADERS = {
  'Access-Control-Allow-Origin':  'https://www.fixeo.ma',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Fxauth-Token',
  'Access-Control-Max-Age':       '86400',
};

/* ── Validation constants ── */
var ALL_CITIES = [
  'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
  'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
  'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
  'Taza','Ouarzazate','Mohammedia'
];

var VALID_SLUGS = [
  'plomberie','electricite','serrurerie','climatisation',
  'menuiserie','peinture','maconnerie','nettoyage','jardinage',
  'demenagement','autre'
];

var VALID_MODES   = ['emergency'];
var VALID_URGENCY = ['now'];

var PHONE_RE = /^[+\d\s\-().]{6,20}$/;
var REF_RE   = /^[A-Z0-9\-]{3,32}$/;

/* ── _resolveClientProfileId — optional authenticated client resolution ──
 * Reads X-Fxauth-Token header (injected by fixeo-dashboard-v2.js fetch
 * interceptor for authenticated dashboard sessions only).
 * Validates the token via /auth/v1/user, then looks up profiles.id.
 * Returns the profile UUID string, or null on any failure.
 * NEVER throws — anonymous path (no header, bad token) returns null.
 * Called only when the header is present; result is used to set
 * client_profile_id in the service_requests INSERT.
 */
async function _resolveClientProfileId(authToken) {
  if (!authToken || typeof authToken !== 'string' || authToken.length < 10) return null;

  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  /* Step 1: Validate token — resolve authenticated user */
  try {
    var userRes = await fetch(url + '/auth/v1/user', {
      headers: {
        'apikey':        serviceKey,
        'Authorization': 'Bearer ' + authToken,
      }
    });
    if (!userRes.ok) return null;

    var userData = await userRes.json().catch(function() { return null; });
    if (!userData || !userData.id) return null;
    var userId = String(userData.id);

    /* Step 2: Look up profile id (= same as auth user id in Supabase) */
    /* profiles.id = auth.users.id by convention — no extra query needed */
    return userId;

  } catch (e) {
    console.warn('[urgent-request-v2b] _resolveClientProfileId failed:', e.message);
    return null;
  }
}

/* ── dispatch_request_v1 — server-side only, service_role ── */
/* Identical to create-request-fn helper. Calls public.dispatch_request_v1
 * via Supabase REST RPC after a confirmed INSERT success.
 * Fire-and-forget: dispatch failure does NOT fail the request. */
async function _callDispatch(requestId) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, dispatch_error: 'ENV_MISSING' };
  var res;
  try {
    res = await fetch(url + '/rest/v1/rpc/dispatch_request_v1', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
      },
      body: JSON.stringify({ p_request_id: requestId }),
    });
  } catch (fetchErr) { return { ok: false, dispatch_error: 'NETWORK: ' + fetchErr.message }; }
  var dispatchBody = null;
  try { dispatchBody = await res.json(); } catch (_) { return { ok: false, dispatch_error: 'PARSE_ERROR' }; }
  if (!res.ok) return { ok: false, dispatch_error: 'HTTP_' + res.status, dispatch_result: dispatchBody };
  var result = dispatchBody;
  return { ok: !!(result && result.ok), dispatched: !!(result && result.ok), dispatch_result: result };
}

/* ── Supabase insert (service role — server-side only) ── */
async function _insertRequest(payload) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    var missing = !url ? 'SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY';
    var envErr = new Error('Vercel env var not configured: ' + missing);
    envErr.code = 'ENV_MISSING';
    throw envErr;
  }

  var res;
  try {
    res = await fetch(url + '/rest/v1/service_requests', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify([payload]),
    });
  } catch (fetchErr) {
    var netErr = new Error('Supabase network error: ' + fetchErr.message);
    netErr.code = 'NETWORK';
    throw netErr;
  }

  if (!res.ok) {
    var errText = await res.text().catch(function() { return ''; });
    var sbErr = new Error('Supabase HTTP ' + res.status + ': ' + errText.slice(0, 300));
    sbErr.code = res.status >= 500 ? 'SUPABASE_5xx' : 'SUPABASE_4xx';
    sbErr.httpStatus = res.status;
    sbErr.detail = errText.slice(0, 300);
    throw sbErr;
  }

  var rows = await res.json().catch(function() { return []; });
  return (rows[0] && rows[0].id) ? rows[0].id : null;
}

/* ── Input sanitizer ── */
function _str(v, max) {
  return String(v || '').trim().slice(0, max || 500);
}

/* ── Normalize phone: collapse whitespace, keep digits/+/- ── */
function _normalizePhone(raw) {
  return raw.replace(/\s+/g, ' ').trim();
}
function _generateGuestToken() {
  return crypto.randomBytes(32).toString('hex');
}

(token) {
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
/* ── Main handler ── */
module.exports = async function handler(req, res) {
  /* Preflight */
  Object.entries(CORS_HEADERS).forEach(function([k, v]) { res.setHeader(k, v); });
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  /* Rate limit */
  var ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!_rateCheck(ip)) {
    res.status(429).json({ ok: false, error: 'Trop de demandes. Réessayez dans quelques minutes.', code: 'RATE_LIMITED' });
    return;
  }

  /* Parse body */
  var body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  /* ── Secure anonymous guest lookup ── */
if (body.action === 'guest_lookup') {
  var lookupTrackingRef = _str(body.tracking_ref, 32).toUpperCase();
  var lookupGuestToken = _str(body.guest_token, 128);

  if (
    !REF_RE.test(lookupTrackingRef) ||
    !/^[a-f0-9]{64}$/i.test(lookupGuestToken)
  ) {
    res.status(400).json({
      ok: false,
      error: 'Invalid credentials',
      code: 'INVALID_INPUT'
    });
    return;
  }

  try {
    var lookupUrl = process.env.SUPABASE_URL;
    var lookupServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!lookupUrl || !lookupServiceKey) {
      res.status(503).json({
        ok: false,
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
      return;
    }

    var lookupRes = await fetch(
      lookupUrl +
        '/rest/v1/service_requests' +
        '?tracking_ref=eq.' + encodeURIComponent(lookupTrackingRef) +
        '&select=id,tracking_ref,guest_token_hash,service_category,city,description,status,created_at' +
        '&limit=1',
      {
        method: 'GET',
        headers: {
          'apikey': lookupServiceKey,
          'Authorization': 'Bearer ' + lookupServiceKey
        }
      }
    );

    if (!lookupRes.ok) {
      res.status(500).json({
        ok: false,
        error: 'Service temporarily unavailable',
        code: 'INTERNAL_ERROR'
      });
      return;
    }

    var lookupRows = await lookupRes.json().catch(function() {
      return [];
    });

    var lookupRequest =
      lookupRows && lookupRows.length ? lookupRows[0] : null;

    if (!lookupRequest || !lookupRequest.guest_token_hash) {
      res.status(404).json({
        ok: false,
        error: 'Request not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    var suppliedHash = _hashGuestToken(lookupGuestToken);

    if (!_safeEqualHex(suppliedHash, lookupRequest.guest_token_hash)) {
      res.status(404).json({
        ok: false,
        error: 'Request not found',
        code: 'NOT_FOUND'
      });
      return;
    }

    res.status(200).json({
      ok: true,
      request: {
        id: lookupRequest.id,
        tracking_ref: lookupRequest.tracking_ref,
        service_category: lookupRequest.service_category || null,
        city: lookupRequest.city || null,
        description: lookupRequest.description || null,
        status: lookupRequest.status || null,
        created_at: lookupRequest.created_at || null
      }
    });
    return;

  } catch (err) {
    console.error(
      '[urgent-request-v2b] guest_lookup error:',
      err && err.message
    );

    res.status(500).json({
      ok: false,
      error: 'Service temporarily unavailable',
      code: 'INTERNAL_ERROR'
    });
    return;
  }
}
  /* Extract and sanitize fields */
  var service     = _str(body.service,     64);
  var problem     = _str(body.problem,     128);
  var city        = _str(body.city,        128);
  var phone       = _str(body.phone,       32);
  var trackingRef = _str(body.tracking_ref, 32);
  var freeText    = _str(body.description, 500); /* optional Autre urgence free text */
  var urgency     = _str(body.urgency,     16) || 'now';
  var mode        = _str(body.mode,        32) || 'emergency';
  var source      = _str(body.source,      64) || 'fxrf4';

  /* Field validation */
  var errors = [];
  if (!service || VALID_SLUGS.indexOf(service) < 0) errors.push('service: invalid slug');
  if (!problem)  errors.push('problem: required');
  if (!city || ALL_CITIES.indexOf(city) < 0)        errors.push('city: not in allowlist');
  if (!phone || !PHONE_RE.test(phone))               errors.push('phone: invalid format');
  if (VALID_MODES.indexOf(mode) < 0)                 errors.push('mode: must be emergency');
  if (VALID_URGENCY.indexOf(urgency) < 0)            errors.push('urgency: must be now');
  if (trackingRef && !REF_RE.test(trackingRef))      errors.push('tracking_ref: invalid format');

  if (errors.length) {
    res.status(400).json({ ok: false, error: 'Validation failed', code: 'VALIDATION', details: errors });
    return;
  }

  /* Build description — operational content ONLY.
   * MUST NOT contain phone, email, or client identity.
   * client_phone goes to its dedicated column below.
   */
  var descParts = [
    'URGENCE ' + problem.toUpperCase(),
    freeText   ? freeText : '',
    trackingRef ? 'Ref: ' + trackingRef : '',
    'Source: ' + source,
  ].filter(Boolean);
  var operationalDescription = descParts.join(' | ');

  /* P1.1: Optionally resolve authenticated client_profile_id.
   * fixeo-dashboard-v2.js fetch interceptor injects X-Fxauth-Token for
   * authenticated dashboard sessions. Anonymous public submissions omit it.
   * _resolveClientProfileId validates the token server-side (never trusts caller).
   * client_profile_id set only when resolution succeeds; NULL otherwise (anonymous). */
  var authToken = String(req.headers['x-fxauth-token'] || '').trim();
  var clientProfileId = null;
  if (authToken) {
    clientProfileId = await _resolveClientProfileId(authToken);
    if (clientProfileId) {
      console.info('[urgent-request-v2b] authenticated client_profile_id resolved');
    } else {
      console.warn('[urgent-request-v2b] X-Fxauth-Token present but resolution failed — inserting with NULL');
    }
  }
  var guestToken = null;
var guestTokenHash = null;

if (!clientProfileId) {
  guestToken = _generateGuestToken();
  guestTokenHash = _hashGuestToken(guestToken);
}

  /* Build service_requests row.
   * All 7C.11C columns used:
   *   client_phone      — dedicated column (NOT in description)
   *   urgency           — dedicated column
   *   status            — server-authoritative 'new'
   *   client_profile_id — resolved from X-Fxauth-Token when present (P1.1)
   *   idempotency_key   — omitted for urgent (no reliable client UUID)
   */
  var row = {
    service_category:  service,
    city:              city,
    description:       operationalDescription,
    client_phone:      _normalizePhone(phone),   /* 7C.11C column — phone isolated here */
    urgency:           urgency,                   /* 7C.11C column — always 'now' for emergency */
    status:            'new',                     /* server-authoritative */
    created_at:        new Date().toISOString(),
    tracking_ref:      trackingRef || null,
     guest_token_hash:  guestTokenHash,
    
    /* idempotency_key intentionally omitted — urgent V1 (trackingRef is client-only) */
  };

  /* Set client_profile_id only when authenticated resolution succeeded */
  if (clientProfileId) {
    row.client_profile_id = clientProfileId;
  }

  /* Attempt durable Supabase insert */
  var serverId = null;
  try {
    serverId = await _insertRequest(row);
  } catch (err) {
    var code = err.code || 'UNKNOWN';

    if (code === 'ENV_MISSING') {
      console.error('[urgent-request-v2b] ENV_MISSING:', err.message);
      res.status(503).json({
        ok: false,
        error: 'Service temporairement indisponible.',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    if (code === 'SUPABASE_4xx') {
      console.error('[urgent-request-v2b] Supabase 4xx:', err.detail);
      res.status(502).json({
        ok: false,
        error: 'Enregistrement impossible. Réessayez.',
        code: 'PERSIST_FAILED',
        detail: err.detail,
      });
      return;
    }

    console.error('[urgent-request-v2b] persist error:', code, err.message);
    res.status(502).json({
      ok: false,
      error: 'Impossible d\'enregistrer la demande pour le moment.',
      code: 'PERSIST_FAILED',
    });
    return;
  }

  /* 7C.11F.2: dispatch_request_v1 server-side after INSERT success.
   * serverId is the canonical service_requests UUID.
   * Fire-and-forget — dispatch failure does NOT fail the request. */
  var dispatchOutcome = null;
  if (serverId) {
    try {
      dispatchOutcome = await _callDispatch(serverId);
    } catch (dispatchErr) {
      console.error('[urgent-request-v2b] dispatch unexpected error:', dispatchErr.message);
      dispatchOutcome = { ok: false, dispatch_error: 'UNEXPECTED: ' + dispatchErr.message };
    }
    if (dispatchOutcome && !dispatchOutcome.ok) {
      console.warn('[urgent-request-v2b] dispatch failed for', serverId,
        '— reason:', JSON.stringify(dispatchOutcome.dispatch_result || dispatchOutcome.dispatch_error));
    } else {
      console.info('[urgent-request-v2b] dispatch ok for', serverId);
    }
  }

  /* Success — response contract: ok, ref, id (backward compat) + dispatch fields */
  res.status(200).json({
    ok:              true,
    ref:             trackingRef || null,
    id:              serverId    || null,
    guest_token: guestToken,
    dispatch_attempted: !!serverId,
    dispatch_ok:     !!(dispatchOutcome && dispatchOutcome.ok),
    dispatch_reason: (dispatchOutcome && dispatchOutcome.dispatch_result && dispatchOutcome.dispatch_result.reason) || null,
  });
};
