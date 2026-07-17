/**
 * FIXEO Enterprise Contact — api/enterprise-contact-fn/index.js
 * Version: fec-v1a — 2026-07-17
 *
 * Receives Enterprise demo/contact form submissions from /entreprises.
 * Validates fields, stores lead in Supabase (enterprise_leads table),
 * returns JSON {ok, ref}.
 *
 * CORS: same-origin only (www.fixeo.ma).
 * Rate limit: 5 submissions per IP per hour (in-memory, per-instance).
 *
 * Environment variables required (set in Vercel dashboard):
 *   SUPABASE_URL      — e.g. https://ztwtbgoqanqzvwiibtuh.supabase.co
 *   SUPABASE_ANON_KEY — publishable anon key
 *
 * Table: enterprise_leads
 *   id uuid default gen_random_uuid() primary key,
 *   nom text, prenom text, entreprise text, fonction text,
 *   telephone text, email text, ville text, org_type text,
 *   needs text, batiments text, message text,
 *   source text default 'enterprise',
 *   page text,
 *   submitted_at timestamptz default now(),
 *   created_at   timestamptz default now()
 */
'use strict';

/* ── In-memory rate limiter (per cold-start instance) ── */
var _rateMap = {};
var RATE_LIMIT = 5;
var RATE_WINDOW_MS = 60 * 60 * 1000; /* 1 hour */

function _rateCheck(ip) {
  var now = Date.now();
  var key = ip || 'unknown';
  var entry = _rateMap[key];
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    _rateMap[key] = { start: now, count: 1 };
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
  'Vary': 'Origin'
};

/* ── Required fields ── */
var REQUIRED = ['nom', 'prenom', 'entreprise', 'fonction', 'telephone', 'email', 'org_type'];

/* ── Sanitize string ── */
function _sanitize(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, 500);
}

/* ── Email validation ── */
function _validEmail(e) {
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(String(e || '').trim());
}

/* ── Supabase insert ── */
async function _insertLead(payload) {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');

  var res = await fetch(url + '/rest/v1/enterprise_leads', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        key,
      'Authorization': 'Bearer ' + key,
      'Prefer':        'return=representation'
    },
    body: JSON.stringify([payload])
  });

  if (!res.ok) {
    var errText = await res.text().catch(function () { return ''; });
    throw new Error('Supabase error ' + res.status + ': ' + errText.slice(0, 200));
  }

  var rows = await res.json().catch(function () { return []; });
  return (rows[0] && rows[0].id) ? rows[0].id : null;
}

/* ── Main handler ── */
module.exports = async function handler(req, res) {
  /* OPTIONS preflight */
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(function (kv) { res.setHeader(kv[0], kv[1]); });
    return res.status(204).end();
  }

  /* CORS headers on all responses */
  Object.entries(CORS_HEADERS).forEach(function (kv) { res.setHeader(kv[0], kv[1]); });
  res.setHeader('Content-Type', 'application/json');

  /* Method guard */
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  /* Rate limit */
  var ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           (req.socket && req.socket.remoteAddress) || 'unknown';
  if (!_rateCheck(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  /* Parse body */
  var body;
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
  catch (_) { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

  /* Validate required fields */
  for (var i = 0; i < REQUIRED.length; i++) {
    var f = REQUIRED[i];
    if (!body[f] || !String(body[f]).trim()) {
      return res.status(422).json({ ok: false, error: 'Missing required field: ' + f });
    }
  }

  /* Validate email */
  if (!_validEmail(body.email)) {
    return res.status(422).json({ ok: false, error: 'Invalid email format' });
  }

  /* Build payload */
  var payload = {
    nom:          _sanitize(body.nom),
    prenom:       _sanitize(body.prenom),
    entreprise:   _sanitize(body.entreprise),
    fonction:     _sanitize(body.fonction),
    telephone:    _sanitize(body.telephone),
    email:        _sanitize(body.email).toLowerCase(),
    ville:        _sanitize(body.ville),
    org_type:     _sanitize(body.org_type),
    needs:        _sanitize(body.needs),
    batiments:    _sanitize(body.batiments),
    message:      _sanitize(body.message).slice(0, 2000),
    source:       'enterprise',
    page:         _sanitize(body.page).slice(0, 200),
    submitted_at: new Date().toISOString()
  };

  /* Insert into Supabase */
  var leadId = null;
  try {
    leadId = await _insertLead(payload);
  } catch (err) {
    /* Log error but return 200 — client fallback (mailto:) handles it */
    console.error('[enterprise-contact] Supabase insert failed:', err.message);
    return res.status(200).json({
      ok: false,
      fallback: true,
      error: 'Storage unavailable — please use the email fallback'
    });
  }

  return res.status(200).json({
    ok:  true,
    ref: leadId || 'submitted'
  });
};
