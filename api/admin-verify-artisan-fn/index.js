/*!
 * api/admin-verify-artisan-fn/index.js — Vercel Serverless Function
 * Phase 7C.11F.4 — Admin Artisan Verification Workflow
 * Route: POST /api/admin/artisans/verify
 *
 * Sets artisans.verified = true for a given artisan_id.
 * This is the ONLY mutation performed — no other field is touched.
 * Idempotent: already-verified artisans return success.
 *
 * SECURITY MODEL (identical to admin-add-artisan-fn)
 * ──────────────────────────────────────────────────
 * Authorization: Bearer <supabase_access_token>
 *
 * 1. Extract Bearer token from Authorization header.
 * 2. Validate token via Supabase /auth/v1/user → resolve user id.
 * 3. Fetch role from public.users using service-role key.
 * 4. Require role = 'admin'. Otherwise → 403.
 * 5. Fetch artisan by artisan_id to confirm existence.
 * 6. If not found → 404.
 * 7. If already verified → 200 idempotent.
 * 8. PATCH artisans SET verified = true WHERE id = artisan_id.
 *
 * ACCEPTED PAYLOAD
 * ────────────────
 * { artisan_id: <uuid> }
 *
 * REJECTED FIELDS (silently ignored even if sent)
 * ────────────────────────────────────────────────
 * verified, owner_user_id, claimed, claim_status,
 * onboarding_completed, availability
 *
 * HTTP STATUS
 * ───────────
 * 200  — verified (or already was verified — idempotent)
 * 400  — artisan_id missing or invalid format
 * 401  — missing or invalid token
 * 403  — authenticated but not admin
 * 404  — artisan not found
 * 405  — non-POST method
 * 500  — internal / Supabase error
 *
 * ENVIRONMENT VARIABLES (Vercel dashboard)
 * ─────────────────────────────────────────
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (secret, server-side only)
 */

'use strict';

/* ── UUID format guard ─────────────────────────────────────── */
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Admin session verification (same model as admin-add-artisan-fn) ── */
async function _verifyAdminSession(req) {
  var authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 'missing' };
  }

  var token = authHeader.slice(7).trim();
  if (!token) return { status: 'missing' };

  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return { status: 'error', detail: 'Server configuration error: missing env vars' };
  }

  /* Step 1: Validate token → resolve authenticated user */
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

  /* Step 2: Verify admin role in public.users (service-role) */
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

  var row  = Array.isArray(roleBody) ? roleBody[0] : null;
  var role = row && row.role ? String(row.role) : '';

  if (role !== 'admin') return { status: 'not_admin' };
  return { status: 'ok', userId: userId };
}

/* ── Fetch artisan existence check (service-role) ──────────── */
async function _fetchArtisan(artisanId) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  var res;
  try {
    res = await fetch(
      url + '/rest/v1/artisans?select=id,verified&id=eq.' + encodeURIComponent(artisanId) + '&limit=1',
      {
        headers: {
          'apikey':        serviceKey,
          'Authorization': 'Bearer ' + serviceKey,
        }
      }
    );
  } catch (e) {
    var err = new Error('NETWORK: ' + e.message); err.code = 'NETWORK'; throw err;
  }

  var body;
  try { body = await res.json(); } catch (_) { body = []; }

  if (!res.ok) {
    var err2 = new Error('SUPABASE_ERROR: ' + (body && body.message ? body.message : 'HTTP ' + res.status));
    err2.code = 'SUPABASE_' + res.status;
    throw err2;
  }

  return Array.isArray(body) ? body[0] || null : null;
}

/* ── Set verified = true (service-role, only verified field) ── */
async function _setVerified(artisanId) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  var res;
  try {
    res = await fetch(
      url + '/rest/v1/artisans?id=eq.' + encodeURIComponent(artisanId),
      {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         serviceKey,
          'Authorization':  'Bearer ' + serviceKey,
          'Prefer':         'return=representation',
        },
        /* Only verified=true — all other fields untouched */
        body: JSON.stringify({ verified: true }),
      }
    );
  } catch (e) {
    var err = new Error('NETWORK: ' + e.message); err.code = 'NETWORK'; throw err;
  }

  var body;
  try { body = await res.json(); } catch (_) { body = null; }

  if (!res.ok) {
    var err2 = new Error('SUPABASE_ERROR: ' + (body && body.message ? body.message : 'HTTP ' + res.status));
    err2.code = 'SUPABASE_' + res.status;
    throw err2;
  }

  var updated = Array.isArray(body) ? body[0] : body;
  return updated;
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
    console.error('[admin-verify-artisan] Auth error:', auth.detail);
    return res.status(500).json({ ok: false, reason: 'server_error', detail: auth.detail });
  }
  /* auth.status === 'ok' — proceed with verified mutation */

  /* Parse body */
  var body      = req.body || {};

  /* Extract artisan_id only — all lifecycle fields ignored */
  var artisanId = String(body.artisan_id || '').trim();

  /* Validate artisan_id */
  if (!artisanId) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'artisan_id is required' });
  }
  if (!UUID_RE.test(artisanId)) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'artisan_id must be a valid UUID' });
  }

  /* Fetch artisan — confirm existence */
  var artisan;
  try {
    artisan = await _fetchArtisan(artisanId);
  } catch (e) {
    console.error('[admin-verify-artisan] fetchArtisan error:', e.code, e.message);
    return res.status(500).json({ ok: false, reason: 'fetch_error', detail: e.message });
  }

  if (!artisan) {
    return res.status(404).json({ ok: false, reason: 'not_found', detail: 'Artisan not found' });
  }

  /* Idempotent: already verified */
  if (artisan.verified === true) {
    console.info('[admin-verify-artisan] Already verified:', artisanId, '(idempotent — admin:', auth.userId + ')');
    return res.status(200).json({
      ok:        true,
      idempotent: true,
      artisan_id: artisanId,
      verified:  true,
      detail:    'Artisan already verified'
    });
  }

  /* Set verified = true */
  var updated;
  try {
    updated = await _setVerified(artisanId);
  } catch (e) {
    if (e.code === 'NETWORK') {
      console.error('[admin-verify-artisan] NETWORK error:', e.message);
      return res.status(500).json({ ok: false, reason: 'network_error', detail: 'Could not reach database' });
    }
    console.error('[admin-verify-artisan] PATCH error:', e.code, e.message);
    return res.status(500).json({ ok: false, reason: 'update_error', detail: e.message });
  }

  console.info('[admin-verify-artisan] Verified artisan:', artisanId, '(admin:', auth.userId + ')');

  return res.status(200).json({
    ok:        true,
    artisan_id: artisanId,
    verified:  true
  });
};
