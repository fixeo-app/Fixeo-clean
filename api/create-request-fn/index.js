/**
 * FIXEO Create Request — api/create-request-fn/index.js
 * Version: cr-v1a — 7C.11D.1
 *
 * Canonical server-side persistence for Standard / Reservation requests.
 * Receives structured request payload, inserts into Supabase service_requests,
 * returns JSON { ok, id, ref, replayed }.
 *
 * DESIGN:
 *   - Server-side SERVICE_ROLE key → bypasses RLS → reliable for unauthenticated users
 *   - service_requests is the canonical parent for all dispatch flows
 *   - Idempotency key REQUIRED (namespaced: 'reservation:<uuid>')
 *   - client_phone stored ONLY in dedicated column (never in description)
 *   - urgency stored in dedicated column
 *   - status always server-authoritative 'new'
 *   - No dispatch triggered. No missions created.
 *   - No price authority added (price is frozen in booking authority)
 *
 * IDEMPOTENCY:
 *   1. INSERT with idempotency_key
 *   2. On PostgreSQL 23505 unique violation → SELECT by exact key → return same id
 *   3. replayed: true on dedup path
 *   4. No ON CONFLICT DO NOTHING as sole path (spec requirement)
 *
 * SECURITY:
 *   - SERVICE_ROLE key: server env var only, never in browser JS
 *   - client_profile_id: never trusted from caller (always NULL in V1)
 *   - No artisan identity accepted from caller
 *   - No price fields accepted or written
 *   - No missions table touched
 *
 * 7C.11F.2: dispatch_request_v1 is called server-side after every
 * successful INSERT. Dispatch runs fire-and-forget style — a dispatch
 * failure does NOT roll back the request (request persists regardless).
 * Dispatch result is included in the response for observability.
 *
 * Environment variables required (Vercel dashboard):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret, server-side only)
 */
'use strict';

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

var VALID_URGENCY = ['normale', 'urgent', 'now'];

/* idempotency_key must be namespaced: reservation:<uuid> */
var IDEM_KEY_RE = /^reservation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

var PHONE_RE = /^[+\d\s\-().]{6,20}$/;

/* PostgreSQL unique violation error code */
var PG_UNIQUE_VIOLATION = '23505';

/* ── Input sanitizer ── */
function _str(v, max) {
  return String(v || '').trim().slice(0, max || 500);
}

/* ── Normalize phone ── */
function _normalizePhone(raw) {
  if (!raw) return null;
  var s = String(raw).replace(/\s+/g, ' ').trim();
  return s || null;
}

/* ── Supabase INSERT (service role — server-side only) ── */
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

    /* Detect 23505 unique violation (idempotency key conflict) */
    if (res.status === 409 || (res.status === 400 && errText.indexOf(PG_UNIQUE_VIOLATION) !== -1)) {
      var conflictErr = new Error('Idempotency key conflict');
      conflictErr.code = 'UNIQUE_VIOLATION';
      conflictErr.detail = errText.slice(0, 300);
      throw conflictErr;
    }

    /* Supabase may also return 409 via PostgREST for constraint violations;
     * additionally check the body for the exact code string to be safe. */
    var sbErr = new Error('Supabase HTTP ' + res.status + ': ' + errText.slice(0, 300));
    sbErr.code = res.status >= 500 ? 'SUPABASE_5xx' : 'SUPABASE_4xx';
    sbErr.httpStatus = res.status;
    sbErr.detail = errText.slice(0, 300);
    throw sbErr;
  }

  var rows = await res.json().catch(function() { return []; });
  if (!rows[0] || !rows[0].id) {
    var noIdErr = new Error('Insert returned no id');
    noIdErr.code = 'SUPABASE_4xx';
    throw noIdErr;
  }
  return { id: rows[0].id };
}

/* ── Supabase SELECT by idempotency_key (replay path) ── */
async function _selectByKey(idemKey) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /* env already confirmed before INSERT — safe to use directly */
  var params = new URLSearchParams({ idempotency_key: 'eq.' + idemKey, select: 'id' });
  var res;
  try {
    res = await fetch(url + '/rest/v1/service_requests?' + params.toString(), {
      method: 'GET',
      headers: {
        'apikey':        serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
      },
    });
  } catch (fetchErr) {
    var netErr = new Error('Supabase SELECT network error: ' + fetchErr.message);
    netErr.code = 'NETWORK';
    throw netErr;
  }

  if (!res.ok) {
    var sbErr = new Error('Supabase SELECT HTTP ' + res.status);
    sbErr.code = 'SUPABASE_4xx';
    throw sbErr;
  }

  var rows = await res.json().catch(function() { return []; });
  return (rows[0] && rows[0].id) ? rows[0].id : null;
}

/* ── Resolve artisan routing id → canonical Supabase UUID ──
 * Accepts either:
 *   - canonical artisans.id UUID
 *   - legacy artisans.legacy_id (ex: FB-20260622-029)
 * Returns canonical artisans.id UUID or null.
 */
async function _resolveTargetArtisanId(rawTargetId) {
  if (!rawTargetId) return null;

  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    var envErr = new Error('Supabase env missing');
    envErr.code = 'ENV_MISSING';
    throw envErr;
  }

  var target = String(rawTargetId).trim();

  var uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var params = new URLSearchParams({
    select: 'id,legacy_id',
    limit: '1'
  });

  if (uuidRe.test(target)) {
    params.set('id', 'eq.' + target);
  } else {
    params.set('legacy_id', 'eq.' + target);
  }

  var res;

  try {
    res = await fetch(
      url + '/rest/v1/artisans?' + params.toString(),
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        }
      }
    );
  } catch (fetchErr) {
    var netErr = new Error(
      'Artisan resolve network error: ' + fetchErr.message
    );
    netErr.code = 'NETWORK';
    throw netErr;
  }

  if (!res.ok) {
    var sbErr = new Error(
      'Artisan resolve HTTP ' + res.status
    );
    sbErr.code = 'SUPABASE_4xx';
    throw sbErr;
  }

  var rows = await res.json().catch(function() {
    return [];
  });

  return rows[0] && rows[0].id
    ? String(rows[0].id)
    : null;
}

/* ── dispatch_request_v1 — server-side only, service_role ── */
/*
 * Calls public.dispatch_request_v1(p_request_id) via Supabase REST RPC.
 * SERVICE_ROLE key is used — this function MUST remain server-side only.
 * Returns: { ok, dispatched, dispatch_result, dispatch_error }
 *
 * Design:
 *   - Called only after a confirmed INSERT success (insertedId is set)
 *   - dispatch_request_v1 is SECURITY DEFINER, service_role ONLY in DB
 *   - Fire-and-forget semantics: dispatch failure does NOT fail the request
 *   - idempotent: dispatch_request_v1 has its own 23505 guard (no duplicate missions)
 */

async function _callDispatch(requestId) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return { ok: false, dispatch_error: 'ENV_MISSING' };
  }

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
  } catch (fetchErr) {
    return { ok: false, dispatch_error: 'NETWORK: ' + fetchErr.message };
  }

  /* Parse response — dispatch_request_v1 returns jsonb */
  var dispatchBody = null;
  try {
    dispatchBody = await res.json();
  } catch (_) {
    return { ok: false, dispatch_error: 'PARSE_ERROR' };
  }

  if (!res.ok) {
    return {
      ok:             false,
      dispatch_error: 'HTTP_' + res.status,
      dispatch_result: dispatchBody,
    };
  }

  /* Supabase wraps RPC return value directly — dispatchBody IS the jsonb result */
  var result = dispatchBody;
  return {
    ok:             !!(result && result.ok),
    dispatched:     !!(result && result.ok),
    dispatch_result: result,
  };
}

/* ── Generate human-readable FIXEO ref from UUID ── */
function _makeRef(uuid) {
  /* Same convention as urgent-request: 6-char uppercase hex suffix */
  if (!uuid) return null;
  return 'FX-' + uuid.replace(/-/g, '').slice(0, 6).toUpperCase();
}

/* ── In-memory rate limiter (per Vercel instance) ── */
var _rateMap = {};
var RATE_LIMIT  = 20;  /* standard requests may be higher volume */
var RATE_WINDOW = 5 * 60 * 1000;

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

/* ── Main handler ── */
module.exports = async function handler(req, res) {
  /* Preflight */
  Object.entries(CORS_HEADERS).forEach(function([k, v]) { res.setHeader(k, v); });
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'invalid_method' });
    return;
  }

  /* Rate limit */
  var ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!_rateCheck(ip)) {
    res.status(429).json({ ok: false, reason: 'rate_limited' });
    return;
  }

  /* Parse body */
  var body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  /* Extract fields */
  var serviceCategory = _str(body.service_category, 64);
  var city            = _str(body.city,             128);
  var description     = _str(body.description,      1000);
  var clientPhoneRaw  = _str(body.client_phone,     32);
  var urgency         = _str(body.urgency,          16) || 'normale';
  var idempotencyKey  = _str(body.idempotency_key,  64);
  var targetArtisanId = _str(body.target_artisan_id, 64);
  
  /* Validate service_category */
  if (!serviceCategory || VALID_SLUGS.indexOf(serviceCategory) < 0) {
    res.status(400).json({ ok: false, reason: 'invalid_service_category' });
    return;
  }

  /* Validate city */
  if (!city || ALL_CITIES.indexOf(city) < 0) {
    res.status(400).json({ ok: false, reason: 'invalid_city' });
    return;
  }

  /* Validate description */
  if (!description) {
    res.status(400).json({ ok: false, reason: 'invalid_payload', detail: 'description required' });
    return;
  }

  /* Validate urgency */
  if (VALID_URGENCY.indexOf(urgency) < 0) {
    res.status(400).json({ ok: false, reason: 'invalid_payload', detail: 'urgency must be normale|urgent|now' });
    return;
  }

  /* Validate idempotency_key — REQUIRED, must be namespaced */
  if (!idempotencyKey || !IDEM_KEY_RE.test(idempotencyKey)) {
    res.status(400).json({ ok: false, reason: 'invalid_idempotency_key' });
    return;
  }

 /* Validate target_artisan_id if provided.
 * Accept either:
 * - canonical Supabase UUID
 * - trusted legacy artisan ref such as FB-20260622-029
 * The legacy ref will be resolved server-side to the canonical UUID
 * before writing service_requests.
 */
var TARGET_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

var TARGET_LEGACY_RE =
  /^[A-Za-z0-9._:-]{1,64}$/;

if (
  targetArtisanId &&
  !TARGET_UUID_RE.test(targetArtisanId) &&
  !TARGET_LEGACY_RE.test(targetArtisanId)
) {
  res.status(400).json({
    ok: false,
    reason: 'invalid_target_artisan_id'
  });
  return;
}
  /* Validate phone if provided */
  var clientPhone = null;
  if (clientPhoneRaw) {
    if (!PHONE_RE.test(clientPhoneRaw)) {
      res.status(400).json({ ok: false, reason: 'invalid_payload', detail: 'client_phone format invalid' });
      return;
    }
    clientPhone = _normalizePhone(clientPhoneRaw);
  }

  /* Security:
 * client_profile_id is NEVER accepted from caller.
 * target_artisan_id is accepted only as an explicit routing choice.
 * Dispatch remains authoritative and re-validates artisan eligibility.
 * Price fields are NEVER accepted or written.
 */
  
/* Resolve optional artisan routing ref → canonical Supabase UUID */
var resolvedTargetArtisanId = null;

if (targetArtisanId) {
  try {
    resolvedTargetArtisanId = await _resolveTargetArtisanId(targetArtisanId);
  } catch (resolveErr) {
    console.error('[create-request-v1a] target artisan resolve failed:', resolveErr.message);
    res.status(502).json({
      ok: false,
      reason: 'target_artisan_resolution_failed'
    });
    return;
  }

  if (!resolvedTargetArtisanId) {
    res.status(400).json({
      ok: false,
      reason: 'target_artisan_not_found'
    });
    return;
  }
}
  /* Build canonical service_requests row */
  var row = {
    service_category: serviceCategory,
    city:             city,
    description:      description,   /* operational content ONLY — no phone in description */
    urgency:          urgency,        /* 7C.11C dedicated column */
    status:           'new',          /* server-authoritative — never caller-controlled */
    idempotency_key:  idempotencyKey, /* 7C.11C partial unique index enforces uniqueness */
    target_artisan_id: resolvedTargetArtisanId || null,
    created_at:       new Date().toISOString(),
    /* client_phone: written only when provided */
    /* client_profile_id: intentionally omitted (NULL) */
    /* No amount_mad / agreed_price / price fields */
    /* Optional target_artisan_id only; dispatch re-validates eligibility */
    /* No missions fields */
  };

  /* Conditionally add client_phone */
  if (clientPhone !== null) {
    row.client_phone = clientPhone;   /* 7C.11C dedicated column */
  }

  /* Step 1: Attempt INSERT */
  var insertedId = null;
  var replayed   = false;

  try {
    var insertResult = await _insertRequest(row);
    insertedId = insertResult.id;
  } catch (insertErr) {
    var code = insertErr.code || 'UNKNOWN';

    /* Step 2: 23505 unique violation → replay path */
    if (code === 'UNIQUE_VIOLATION') {
      /* Step 3: SELECT by EXACT same idempotency_key */
      var existingId = null;
      try {
        existingId = await _selectByKey(idempotencyKey);
      } catch (selErr) {
        console.error('[create-request-v1a] replay SELECT failed:', selErr.message);
        res.status(502).json({ ok: false, reason: 'persistence_failed' });
        return;
      }

      if (!existingId) {
        /* Unique violation but row not found — race or corruption */
        console.error('[create-request-v1a] replay: no row found for key:', idempotencyKey);
        res.status(502).json({ ok: false, reason: 'persistence_failed' });
        return;
      }

      /* Step 4: Return SAME canonical id — replayed: true */
      res.status(200).json({
        ok:       true,
        id:       existingId,
        ref:      _makeRef(existingId),
        replayed: true,
      });
      return;
    }

    /* ENV_MISSING */
    if (code === 'ENV_MISSING') {
      console.error('[create-request-v1a] ENV_MISSING:', insertErr.message);
      res.status(503).json({ ok: false, reason: 'persistence_failed' });
      return;
    }

    /* All other DB errors */
    console.error('[create-request-v1a] persist error:', code, insertErr.message);
    res.status(502).json({ ok: false, reason: 'persistence_failed' });
    return;
  }

  /* Step 5: New insert success — call dispatch server-side */
  /* dispatch_request_v1 is service_role only and runs entirely server-side.
   * Dispatch failure does NOT fail the request (fire-and-forget).
   * dispatch_request_v1 has its own 23505 idempotency guard — retries are safe. */
  var dispatchOutcome = null;
  try {
    dispatchOutcome = await _callDispatch(insertedId);
  } catch (dispatchErr) {
    /* Unexpected throw from _callDispatch — log and continue */
    console.error('[create-request-v1a] dispatch unexpected error:', dispatchErr.message);
    dispatchOutcome = { ok: false, dispatch_error: 'UNEXPECTED: ' + dispatchErr.message };
  }

  if (dispatchOutcome && !dispatchOutcome.ok) {
    /* Log dispatch failure but do NOT fail the response —
     * the request is already persisted and canonical. */
    console.warn('[create-request-v1a] dispatch failed for', insertedId,
      '— reason:', JSON.stringify(dispatchOutcome.dispatch_result || dispatchOutcome.dispatch_error));
  } else {
    console.info('[create-request-v1a] dispatch ok for', insertedId,
      '— result:', JSON.stringify(dispatchOutcome && dispatchOutcome.dispatch_result));
  }

  res.status(200).json({
    ok:              true,
    id:              insertedId,
    ref:             _makeRef(insertedId),
    replayed:        false,
    dispatch_attempted: true,
    dispatch_ok:     !!(dispatchOutcome && dispatchOutcome.ok),
    dispatch_reason: (dispatchOutcome && dispatchOutcome.dispatch_result && dispatchOutcome.dispatch_result.reason) || null,
  });
};
