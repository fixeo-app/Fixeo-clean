/**
 * FIXEO Enterprise Contact — api/enterprise-contact-fn/index.js
 * Version: fec-v2b — 2026-08-03
 *
 * Receives Enterprise lead submissions from /entreprises (V1 + V2 form).
 * Validates fields, stores lead in Supabase (enterprise_leads table),
 * returns JSON {ok, ref}.
 *
 * BACKWARD COMPATIBILITY:
 *   Accepts both V1 payload (nom/prenom/fonction/org_type/needs) and
 *   V2 payload (adds entry_intent, source_cta, secteur, idempotency, referrer).
 *   All new fields are optional from the table's perspective — stored in
 *   the existing columns or the message/needs catch-all columns.
 *
 * SECURITY MODEL (unchanged from fec-v1b):
 *   - SERVICE ROLE key only, server-side env var, never exposed to browser
 *   - Bypasses Supabase RLS — INSERT via service role
 *   - CORS: same-origin only (www.fixeo.ma)
 *   - Rate limit: 5 submissions per IP per hour (in-memory, per-instance)
 *
 * Environment variables required (set in Vercel dashboard):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret)
 */
'use strict';

/* ── In-memory rate limiter ── */
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

/* ── Required fields (V1+V2 intersection) ── */
var REQUIRED = ['nom', 'prenom', 'entreprise', 'telephone', 'email'];

/* ── Sanitize string ── */
function _sanitize(v, maxLen) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, maxLen || 500);
}

/* ── Email validation ── */
function _validEmail(e) {
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(String(e || '').trim());
}

/* ── Phone normalization (basic) ── */
function _normalizePhone(p) {
  if (!p) return '';
  var s = String(p).trim().replace(/\s+/g, '').slice(0, 30);
  /* Accept +212XXXXXXXXX or 06XXXXXXXX or 07XXXXXXXX */
  return s;
}

/* ── Supabase insert (service role — server-side only) ── */
async function _insertLead(payload) {
  var url = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url)        throw new Error('SUPABASE_URL env var not configured');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var not configured');

  var res = await fetch(url + '/rest/v1/enterprise_leads', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
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

/* ── Build enriched needs string ── */
/* Accepts already-resolved needsRaw string (pre-resolved from selected_needs or needs alias) */
function _buildNeeds(needsRaw, entryIntent) {
  var needs = needsRaw || '';
  /* For demo intent: ensure 'demonstration' is present in the needs record */
  if (entryIntent === 'demo' && needs && needs.indexOf('demonstration') < 0) {
    needs = needs + ', demonstration';
  }
  return needs;
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

  /* Honeypot check */
  if (body.fxlf_confirm || body._hp) {
    /* Silently return ok — bot, not a real lead */
    return res.status(200).json({ ok: true, ref: 'submitted' });
  }

  /* Validate required fields */
  for (var i = 0; i < REQUIRED.length; i++) {
    var f = REQUIRED[i];
    if (!body[f] || !String(body[f]).trim()) {
      return res.status(422).json({ ok: false, error: 'Missing required field: ' + f });
    }
  }

  /* Validate email format */
  if (!_validEmail(body.email)) {
    return res.status(422).json({ ok: false, error: 'Invalid email format' });
  }

  /* fonction / role — both optional in V2.
   * V1 table column is NOT NULL, so fall back to 'Non précisé' if empty.
   * Accept: body.role (V2 canonical) or body.fonction (V1/V2 alias). */
  var fonction = _sanitize(body.role, 200) || _sanitize(body.fonction, 200) || '';

  /* org_type: accept V2 canonical (organisation_type) or V1 alias (org_type) */
  var orgType = _sanitize(body.organisation_type, 100) || _sanitize(body.org_type, 100);

  /* secteur: accept V2 canonical (business_sector) or V1 alias (secteur) */
  var secteur = _sanitize(body.business_sector, 100) || _sanitize(body.secteur, 100);

  /* ville: accept V2 canonical (city) or V1 alias (ville) */
  var ville = _sanitize(body.city, 100) || _sanitize(body.ville, 100);

  /* batiments: accept V2 canonical (building_or_site_count) or V1 alias */
  var batiments = _sanitize(body.building_or_site_count, 50) || _sanitize(body.batiments, 50);

  /* needs: accept V2 canonical (selected_needs) or V1 alias (needs) */
  var needsRaw = _sanitize(body.selected_needs, 1000) || _sanitize(body.needs, 1000);

  /* Entry intent (V2 only, fallback to 'demo') */
  var entryIntent = ['demo','contact'].includes(String(body.entry_intent || 'demo').toLowerCase())
    ? String(body.entry_intent).toLowerCase() : 'demo';

  /* Build enriched message prefix: entry_intent + secteur + CTA tag */
  var messagePrefix = '';
  if (entryIntent) messagePrefix += '[Intention: ' + entryIntent + '] ';
  if (secteur)     messagePrefix += '[Secteur: ' + secteur + '] ';
  var sourceCta = _sanitize(body.source_cta, 100);
  if (sourceCta)   messagePrefix += '[CTA: ' + sourceCta + '] ';
  var rawMessage = _sanitize(body.message, 2000);
  var finalMessage = (messagePrefix + rawMessage).trim().slice(0, 2000);

  /* Build payload — all fields sanitized server-side.
   * Maps V2 canonical keys → existing enterprise_leads table columns.
   * No schema change required.
   */
  var payload = {
    nom:          _sanitize(body.nom, 500),
    prenom:       _sanitize(body.prenom, 500),
    entreprise:   _sanitize(body.entreprise, 500),
    fonction:     fonction || 'Non précisé',  /* NOT NULL col — fallback preserved */
    telephone:    _normalizePhone(body.telephone),
    email:        _sanitize(body.email, 254).toLowerCase(),
    ville:        ville,                       /* resolved from city or ville alias */
    org_type:     orgType || 'autre',          /* resolved from organisation_type or org_type */
    needs:        _buildNeeds(needsRaw, entryIntent), /* resolved from selected_needs or needs */
    batiments:    batiments,                   /* resolved from building_or_site_count or batiments */
    message:      finalMessage,
    source:       'enterprise',
    page:         _sanitize(body.page, 200),
    submitted_at: new Date().toISOString()
  };

  /* Insert into Supabase via service role */
  var leadId = null;
  try {
    leadId = await _insertLead(payload);
  } catch (err) {
    console.error('[enterprise-contact-v2] Supabase insert failed:', err.message);
    return res.status(200).json({
      ok:       false,
      fallback: true,
      error:    'Storage unavailable — please use the email fallback'
    });
  }

  return res.status(200).json({
    ok:  true,
    ref: leadId || 'submitted'
  });
};
