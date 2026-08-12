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
  'Access-Control-Allow-Headers': 'Content-Type',
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

  /* Build service_requests row.
   * All 7C.11C columns used:
   *   client_phone — dedicated column (NOT in description)
   *   urgency      — dedicated column
   *   status       — server-authoritative 'new'
   *   client_profile_id — omitted (anonymous urgent submission)
   *   idempotency_key   — omitted for urgent V1 (no reliable client UUID)
   */
  var row = {
    service_category:  service,
    city:              city,
    description:       operationalDescription,
    client_phone:      _normalizePhone(phone),   /* 7C.11C column — phone isolated here */
    urgency:           urgency,                   /* 7C.11C column — always 'now' for emergency */
    status:            'new',                     /* server-authoritative */
    created_at:        new Date().toISOString(),
    /* client_profile_id intentionally omitted — anonymous urgent submission */
    /* idempotency_key intentionally omitted — urgent V1 (trackingRef is client-only) */
  };

  /* Attempt durable Supabase insert */
  var serverId = null;
  try {
    serverId = await _insertRequest(row);
  } catch (err) {
    var code = err.code || 'UNKNOWN';

    if (code === 'ENV_MISSING') {
      console.error('[urgent-request-v2a] ENV_MISSING:', err.message);
      res.status(503).json({
        ok: false,
        error: 'Service temporairement indisponible.',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    if (code === 'SUPABASE_4xx') {
      console.error('[urgent-request-v2a] Supabase 4xx:', err.detail);
      res.status(502).json({
        ok: false,
        error: 'Enregistrement impossible. Réessayez.',
        code: 'PERSIST_FAILED',
        detail: err.detail,
      });
      return;
    }

    console.error('[urgent-request-v2a] persist error:', code, err.message);
    res.status(502).json({
      ok: false,
      error: 'Impossible d\'enregistrer la demande pour le moment.',
      code: 'PERSIST_FAILED',
    });
    return;
  }

  /* Success — response contract unchanged from fur-v1a */
  res.status(200).json({
    ok:  true,
    ref: trackingRef || null,
    id:  serverId    || null,
  });
};
