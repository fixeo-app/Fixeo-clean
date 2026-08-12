/**
 * FIXEO Urgent Request — api/urgent-request-fn/index.js
 * Version: fur-v1a — 2026-08-12
 *
 * Receives urgent-flow submissions from fx-request-flow-v4.js (emergency mode).
 * Validates fields, inserts into Supabase service_requests (existing canonical table),
 * returns JSON { ok, ref, id }.
 *
 * DESIGN:
 *   - Server-side SERVICE_ROLE key → bypasses RLS → reliable for unauthenticated users
 *   - Same table (service_requests) already read by all admin dashboards
 *   - No new table created
 *   - Returns the server-assigned row UUID for idempotency
 *
 * SECURITY MODEL:
 *   - SERVICE ROLE key: server-side env var only, never exposed to browser
 *   - Bypasses Supabase RLS — INSERT via service role
 *   - CORS: same-origin only (www.fixeo.ma)
 *   - Rate limit: 10 submissions per IP per 5 minutes (in-memory, per-instance)
 *   - Input validation: required fields, length caps, city allowlist, phone format
 *
 * PAYLOAD accepted (from fxrf4 emergency mode):
 *   service    — métier slug (e.g. 'plomberie')
 *   problem    — human-readable situation label (e.g. 'Plomberie')
 *   description — free text (optional, from "Autre urgence" expand)
 *   city       — city name from ALL_CITIES
 *   phone      — validated phone number
 *   tracking_ref — client-generated ref (e.g. 'FX-3A7B2C')
 *   urgency    — always 'now' in emergency mode
 *   mode       — always 'emergency'
 *   source     — always 'fxrf4-v5a1' (or later versions)
 *
 * Response: { ok: true, ref, id }
 * On error: { ok: false, error, code }
 *
 * Environment variables required (Vercel dashboard):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret)
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
/*
 * Inserts into service_requests (existing canonical table).
 * Returns the server-assigned UUID on success.
 * Throws structured Error with .code for caller classification:
 *   ENV_MISSING  — env vars not configured in Vercel
 *   SUPABASE_4xx — Supabase rejected the insert
 *   SUPABASE_5xx — Supabase server-side error
 *   NETWORK      — fetch failed
 */
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

  /* Validate required fields */
  var service     = _str(body.service,     64);
  var problem     = _str(body.problem,     128);
  var city        = _str(body.city,        128);
  var phone       = _str(body.phone,       32);
  var trackingRef = _str(body.tracking_ref, 32);
  var description = _str(body.description, 500);
  var urgency     = _str(body.urgency,     16) || 'now';
  var mode        = _str(body.mode,        32) || 'emergency';
  var source      = _str(body.source,      64) || 'fxrf4-v5b';

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

  /* Build service_requests payload.
   * Maps fxrf4 fields → canonical service_requests columns.
   * description column carries: phone, situation label, free-text, tracking_ref, source.
   * This is the safest approach without altering the schema.
   * Columns confirmed present: service_category, city, description, status, created_at.
   * client_profile_id: null (unauthenticated urgent submission).
   */
  var fullDescription = [
    'URGENCE ' + problem.toUpperCase(),
    phone ? 'Tel: ' + phone : '',
    description ? description : '',
    trackingRef ? 'Ref: ' + trackingRef : '',
    'Source: ' + source,
    'Mode: ' + mode,
  ].filter(Boolean).join(' | ');

  var row = {
    service_category: service,
    city:             city,
    description:      fullDescription,
    status:           'new',
    created_at:       new Date().toISOString(),
    /* client_profile_id intentionally omitted — anonymous urgent submission */
  };

  /* Attempt durable Supabase insert */
  var serverId = null;
  try {
    serverId = await _insertRequest(row);
  } catch (err) {
    var code = err.code || 'UNKNOWN';

    /* ENV_MISSING: Vercel not configured → 503 */
    if (code === 'ENV_MISSING') {
      console.error('[urgent-request-v1a] ENV_MISSING:', err.message);
      res.status(503).json({
        ok: false,
        error: 'Service temporairement indisponible.',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    /* SUPABASE schema / constraint error → likely column missing */
    if (code === 'SUPABASE_4xx') {
      console.error('[urgent-request-v1a] Supabase 4xx:', err.detail);
      res.status(502).json({
        ok: false,
        error: 'Enregistrement impossible. Réessayez.',
        code: 'PERSIST_FAILED',
        detail: err.detail,
      });
      return;
    }

    /* Network or 5xx → retriable */
    console.error('[urgent-request-v1a] persist error:', code, err.message);
    res.status(502).json({
      ok: false,
      error: 'Impossible d\'enregistrer la demande pour le moment.',
      code: 'PERSIST_FAILED',
    });
    return;
  }

  /* Success */
  res.status(200).json({
    ok:  true,
    ref: trackingRef || null,
    id:  serverId    || null,
  });
};
