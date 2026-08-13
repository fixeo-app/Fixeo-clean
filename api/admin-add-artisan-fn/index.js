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
 * • Admin identity: caller must supply Authorization: Bearer <access_token>
 *   Server validates the token against Supabase auth (getUser), then
 *   verifies the authenticated user has role='admin' in public.users.
 *   NO shared/static token fallback. NO X-Admin-Auth. NO legacy token.
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
 * AUTH FLOW
 * ─────────
 * 1. Extract Bearer token from Authorization header.
 * 2. POST /auth/v1/user with the token → Supabase resolves authenticated user.
 * 3. SELECT role FROM public.users WHERE id = <user_id> (service-role query).
 * 4. If role != 'admin' → 403 Forbidden.
 * 5. Perform service-role artisan INSERT.
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
 * 401  — missing or invalid token
 * 403  — authenticated but not admin
 * 405  — non-POST method
 * 409  — conflict (phone_public duplicate)
 * 500  — internal / Supabase error
 *
 * ENVIRONMENT VARIABLES (Vercel dashboard)
 * ─────────────────────────────────────────
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret, server-side only)
 */

'use strict';

/* ── Constants ─────────────────────────────────────────────── */
var MAX_FIELD_LEN = 500;

/* ── Field trim helper ─────────────────────────────────────── */
function trim(v, maxLen) {
  var s = String(v || '').trim();
  return s.slice(0, maxLen || MAX_FIELD_LEN);
}

/* ── Verify Bearer token + admin role ──────────────────────── */
/*
 * Extracts Bearer token from Authorization header, validates it server-side
 * via Supabase auth, then checks public.users for role='admin'.
 *
 * Returns:
 *   { status: 'ok', userId: string }
 *   { status: 'missing' }
 *   { status: 'invalid', detail: string }
 *   { status: 'not_admin' }
 *   { status: 'error', detail: string }
 */
async function _verifyAdminSession(req) {
  var authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 'missing' };
  }

  var token = authHeader.slice(7).trim();
  if (!token) {
    return { status: 'missing' };
  }

  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return { status: 'error', detail: 'Server configuration error: missing env vars' };
  }

  /* Step 1: Validate token — resolve authenticated user */
  var userRes;
  try {
    userRes = await fetch(url + '/auth/v1/user', {
      headers: {
        'apikey':        serviceKey,
        'Authorization': 'Bearer ' + token,
      }
    });
  } catch (e) {
    return { status: 'error', detail: 'Network error validating token: ' + e.message };
  }

  if (!userRes.ok) {
    /* 401 from Supabase = invalid/expired token */
    return { status: 'invalid', detail: 'Token invalid or expired' };
  }

  var userData;
  try { userData = await userRes.json(); } catch (_) {
    return { status: 'invalid', detail: 'Malformed auth response' };
  }

  var userId = userData && userData.id;
  if (!userId) {
    return { status: 'invalid', detail: 'Could not resolve user id from token' };
  }

  /* Step 2: Verify admin role in public.users (server-side, service-role) */
  var roleRes;
  try {
    roleRes = await fetch(
      url + '/rest/v1/users?select=role&id=eq.' + encodeURIComponent(userId) + '&limit=1',
      {
        headers: {
          'apikey':        serviceKey,
          'Authorization': 'Bearer ' + serviceKey,
        }
      }
    );
  } catch (e) {
    return { status: 'error', detail: 'Network error checking role: ' + e.message };
  }

  var roleBody;
  try { roleBody = await roleRes.json(); } catch (_) { roleBody = []; }

  var row = Array.isArray(roleBody) ? roleBody[0] : null;
  var role = row && row.role ? String(row.role) : '';

  if (role !== 'admin') {
    return { status: 'not_admin' };
  }

  return { status: 'ok', userId: userId };
}

/* ── Supabase REST INSERT ───────────────────────────────────── */
async function _insertArtisan(row) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    var err = new Error('ENV_MISSING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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

  /* Admin auth — Supabase session + server-side role check */
  var auth = await _verifyAdminSession(req);

  if (auth.status === 'missing') {
    return res.status(401).json({ ok: false, reason: 'unauthorized', detail: 'Authorization: Bearer <token> required' });
  }
  if (auth.status === 'invalid') {
    return res.status(401).json({ ok: false, reason: 'unauthorized', detail: auth.detail || 'Invalid or expired token' });
  }
  if (auth.status === 'not_admin') {
    return res.status(403).json({ ok: false, reason: 'forbidden', detail: 'Admin role required' });
  }
  if (auth.status === 'error') {
    console.error('[admin-add-artisan] Auth error:', auth.detail);
    return res.status(500).json({ ok: false, reason: 'server_error', detail: auth.detail });
  }
  /* auth.status === 'ok' — proceed */

  /* Parse body */
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

  if (phonePublic && phonePublic.replace(/\D/g, '').length < 8) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'phone_public invalid — must have at least 8 digits' });
  }

  /* ── Build canonical row — ALL lifecycle fields forced server-side ── */
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
    console.error('[admin-add-artisan] INSERT error:', e.code, e.message);
    return res.status(500).json({ ok: false, reason: 'insert_error', detail: e.message });
  }

  console.info('[admin-add-artisan] Created artisan:', inserted.id, '—', inserted.full_name, '(by admin:', auth.userId + ')');

  /* ── Success response ────────────────────────────────────── */
  return res.status(200).json({
    ok:      true,
    success: true,
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
      phone:            inserted.phone_public || '',
      verified:         false,
      availability:     'unavailable',
      claimed:          false,
      onboarding_completed: false,
      created_at:       inserted.created_at,
    },
  });
};
