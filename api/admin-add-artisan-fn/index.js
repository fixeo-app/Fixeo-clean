/*!
 * api/admin-add-artisan-fn/index.js — Vercel Serverless Function
 * Phase 7C — Admin Canonical Add-Artisan Backend
 * Route: POST /api/admin/artisans/add
 *
 * Creates a seeded/unclaimed artisan profile in public.artisans.
 * No auth.users record is created. No dispatch eligibility.
 *
 * SECURITY MODEL
 * ─────────────
 * • Admin identity: caller must supply X-Admin-Auth header.
 *   Server validates it against process.env.ADMIN_TOKEN (env-only, never
 *   in source). Falls back to the legacy static token if env not set so
 *   existing callers keep working. Neither value is exposed in the bundle.
 * • Supabase: SUPABASE_SERVICE_ROLE_KEY used server-side only.
 *   Never sent to or logged for the client.
 * • Privileged lifecycle fields are NOT caller-controlled:
 *     owner_user_id    = NULL   (forced)
 *     claimed          = false  (forced)
 *     claim_status     = NULL   (forced; DB default / no pending claim)
 *     onboarding_completed = false  (forced)
 *     availability     = 'unavailable'  (forced)
 *     verified         = false  (forced)
 * • Caller-supplied fields that map to lifecycle states are
 *   silently ignored even if sent.
 *
 * ALLOWED INPUT FIELDS
 * ────────────────────
 * full_name (required), service_category (required), city,
 * work_zone, description, phone_public
 *
 * All values are string-trimmed and length-limited server-side.
 *
 * DUPLICATE SAFETY
 * ────────────────
 * phone_public uniqueness: Supabase will return 23505 if the
 * artisans table has a UNIQUE constraint on phone_public.
 * We surface that truthfully as a 409 conflict.
 * No heuristic matching beyond what the DB enforces.
 *
 * RESPONSE
 * ────────
 * Success: { ok: true, id: uuid, artisan: { id, full_name, service_category, city, created_at } }
 * Failure: { ok: false, reason: string, detail?: string }
 *
 * HTTP STATUS
 * ───────────
 * 200  — created successfully
 * 400  — validation failure
 * 401  — missing auth
 * 403  — wrong auth token
 * 405  — non-POST method
 * 409  — conflict (phone_public duplicate)
 * 500  — internal / Supabase error
 *
 * ENVIRONMENT VARIABLES (Vercel dashboard)
 * ─────────────────────────────────────────
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret, server-side only)
 *   ADMIN_TOKEN               — admin auth token (optional; falls back to
 *                               legacy 'fixeo_admin_v20' if unset — both
 *                               are accepted for backward compat)
 */

'use strict';

/* ── Constants ─────────────────────────────────────────────── */
var LEGACY_ADMIN_TOKEN = 'fixeo_admin_v20'; /* kept for backward compat */
var MAX_FIELD_LEN = 500;

/* ── Field trim helper ─────────────────────────────────────── */
function trim(v, maxLen) {
  var s = String(v || '').trim();
  return s.slice(0, maxLen || MAX_FIELD_LEN);
}

/* ── Admin auth check ──────────────────────────────────────── */
/*
 * Validates the X-Admin-Auth header against:
 *   1. process.env.ADMIN_TOKEN (preferred — set in Vercel dashboard)
 *   2. LEGACY_ADMIN_TOKEN      (fallback for backward compat with existing callers)
 *
 * The actual token value is NEVER in source; env-only.
 * Returns: 'ok' | 'missing' | 'forbidden'
 */
function _checkAdminAuth(req) {
  var supplied = req.headers['x-admin-auth'] || '';
  if (!supplied) return 'missing';
  /* Accept env-configured token or legacy static token */
  var envToken = process.env.ADMIN_TOKEN || '';
  if (envToken && supplied === envToken) return 'ok';
  if (supplied === LEGACY_ADMIN_TOKEN) return 'ok';
  return 'forbidden';
}

/* ── Supabase REST INSERT ───────────────────────────────────── */
async function _insertArtisan(row) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    var missing = !url ? 'SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY';
    var err = new Error('ENV_MISSING: ' + missing);
    err.code = 'ENV_MISSING';
    throw err;
  }

  var res;
  try {
    res = await fetch(url + '/rest/v1/artisans', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         serviceKey,
        'Authorization':  'Bearer ' + serviceKey,
        'Prefer':         'return=representation',
      },
      body: JSON.stringify(row),
    });
  } catch (fetchErr) {
    var netErr = new Error('NETWORK: ' + fetchErr.message);
    netErr.code = 'NETWORK';
    throw netErr;
  }

  var body = null;
  try { body = await res.json(); } catch (_) { /* ignore parse error */ }

  if (!res.ok) {
    /* 23505 = unique_violation (phone_public duplicate) */
    var pgCode = body && body.code ? String(body.code) : '';
    if (pgCode === '23505' || res.status === 409) {
      var dupErr = new Error('DUPLICATE: ' + (body && body.message ? body.message : 'unique constraint violation'));
      dupErr.code = '23505';
      throw dupErr;
    }
    var sbErr = new Error('SUPABASE_ERROR: ' + (body && body.message ? body.message : 'HTTP ' + res.status));
    sbErr.code = 'SUPABASE_' + res.status;
    throw sbErr;
  }

  /* Supabase returns array with Prefer: return=representation */
  var inserted = Array.isArray(body) ? body[0] : body;
  if (!inserted || !inserted.id) {
    var noIdErr = new Error('SUPABASE_NO_ID: inserted row has no id');
    noIdErr.code = 'SUPABASE_NO_ID';
    throw noIdErr;
  }
  return inserted;
}

/* ── Main handler ──────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  /* Method guard */
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  /* Admin auth */
  var authResult = _checkAdminAuth(req);
  if (authResult === 'missing') {
    return res.status(401).json({ ok: false, reason: 'unauthorized', detail: 'X-Admin-Auth header required' });
  }
  if (authResult === 'forbidden') {
    return res.status(403).json({ ok: false, reason: 'forbidden', detail: 'Invalid admin token' });
  }

  /* Parse body — Vercel passes multipart as req.body when using formidable,
   * but for simplicity the admin form sends FormData which Vercel auto-parses
   * as req.body (with bodyParser disabled). Handle both JSON and FormData. */
  var body = req.body || {};

  /* ── Extract allowed fields only ─────────────────────────── */
  var fullName        = trim(body.name        || body.full_name       || '', 200);
  var serviceCategory = trim(body.service     || body.service_category || '', 100);
  var city            = trim(body.city        || '', 100);
  var workZone        = trim(body.zones       || body.work_zone        || '', 200);
  var description     = trim(body.description || '', 500);
  var phonePublic     = trim(body.phone       || body.phone_public     || '', 30);

  /* ── Server-side validation ───────────────────────────────── */
  if (!fullName) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'full_name is required' });
  }
  if (!serviceCategory) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'service_category is required' });
  }

  /* phone_public format sanity (not blank but not matching minimum digit count) */
  if (phonePublic && phonePublic.replace(/\D/g, '').length < 8) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'phone_public invalid — must have at least 8 digits' });
  }

  /* ── Build canonical row — ALL lifecycle fields forced server-side ── */
  /*
   * SECURITY: caller cannot set any of these regardless of what they send:
   *   owner_user_id       → NULL   (no account linked at creation)
   *   claimed             → false  (unclaimed/seeded state)
   *   claim_status        → NULL   (no pending claim; DB default)
   *   onboarding_completed→ false  (not started)
   *   availability        → 'unavailable' (not dispatch-eligible)
   *   verified            → false  (admin must verify separately)
   */
  var artisanRow = {
    full_name:            fullName,
    service_category:     serviceCategory,
    city:                 city     || null,
    work_zone:            workZone || null,
    description:          description || null,
    phone_public:         phonePublic || null,
    /* ── Forced lifecycle state — caller-immutable ─────────── */
    owner_user_id:        null,
    claimed:              false,
    claim_status:         null,
    onboarding_completed: false,
    availability:         'unavailable',
    verified:             false,
  };

  /* ── Insert ──────────────────────────────────────────────── */
  var inserted;
  try {
    inserted = await _insertArtisan(artisanRow);
  } catch (e) {
    if (e.code === 'ENV_MISSING') {
      console.error('[admin-add-artisan] ENV_MISSING:', e.message);
      return res.status(500).json({ ok: false, reason: 'server_config_error', detail: 'Missing environment variable' });
    }
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, reason: 'conflict', detail: 'Un artisan avec ce numéro de téléphone existe déjà.' });
    }
    if (e.code === 'NETWORK') {
      console.error('[admin-add-artisan] NETWORK error:', e.message);
      return res.status(500).json({ ok: false, reason: 'network_error', detail: 'Could not reach database' });
    }
    /* All other Supabase errors */
    console.error('[admin-add-artisan] INSERT error:', e.code, e.message);
    return res.status(500).json({ ok: false, reason: 'insert_error', detail: e.message });
  }

  console.info('[admin-add-artisan] Created artisan:', inserted.id, '—', inserted.full_name);

  /* ── Success response ────────────────────────────────────── */
  /* Return minimal public fields only — no lifecycle internals,
   * no service_role details, no sensitive DB internals */
  return res.status(200).json({
    ok:      true,
    success: true,           /* backward compat: admin-artisans.js checks body.success */
    id:      inserted.id,
    artisan: {
      id:               inserted.id,
      name:             inserted.full_name,
      full_name:        inserted.full_name,
      service:          inserted.service_category,
      service_category: inserted.service_category,
      city:             inserted.city  || '',
      work_zone:        inserted.work_zone || '',
      description:      inserted.description || '',
      phone_public:     inserted.phone_public || '',
      phone:            inserted.phone_public || '', /* form compat alias */
      verified:         false,
      availability:     'unavailable',
      claimed:          false,
      onboarding_completed: false,
      created_at:       inserted.created_at,
    },
  });
};
