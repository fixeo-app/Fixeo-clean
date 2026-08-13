/*!
 * api/admin-settle-mission-fn/index.js — Vercel Serverless Function
 * Phase 7C.11F.6 — Admin Mission Settlement
 * Route: POST /api/admin/missions/settle
 *
 * ⚠️  DEPLOYMENT GATE: Do NOT deploy until
 *     supabase/7c11f6-financial-settlement-precheck.sql confirms SCENARIO A,
 *     or supabase/7c11f6-financial-settlement.sql migration has been applied.
 *
 * WHAT THIS DOES
 * ──────────────
 * Sets the canonical financial settlement for a mission:
 *   missions.final_price       = caller-supplied amount (> 0)
 *   missions.commission_amount = round(final_price * COMMISSION_RATE, 2)
 *
 * artisan_net is NOT persisted. It is returned in the response as
 *   final_price - commission_amount for display only.
 *   No stored derived column. Single source of truth.
 *
 * COMMISSION RATE
 * ───────────────
 * 0.15 (15%) — canonical across FIXEO admin codebase
 * (admin-mission-supervision-p3.js, admin-control-center-p1.js,
 *  fixeo-client-requests-store.js, admin.js, admin-analytics-real-v1.js)
 *
 * SETTLEMENT IDEMPOTENCY
 * ──────────────────────
 * Same amount → 200 idempotent (no write)
 * Different amount → 409 conflict (explicit re-settlement rejected)
 *   Re-settlement requires force:true flag (admin-acknowledged override)
 *
 * ELIGIBLE MISSION STATUSES
 * ─────────────────────────
 * 'terminée', 'validée'
 * All other statuses → 422 ineligible
 *
 * AUTH MODEL (identical to admin-add-artisan-fn / admin-verify-artisan-fn)
 * ──────────────────────────────────────────────────────────────────────────
 * Authorization: Bearer <supabase_access_token>
 * → /auth/v1/user → resolve user id
 * → public.users role='admin' via service-role
 * → only then perform settlement PATCH
 *
 * ACCEPTED PAYLOAD
 * ────────────────
 * { mission_id: <uuid>, final_price: <number>, force?: <boolean> }
 *
 * REJECTED FIELDS (silently ignored)
 * ────────────────────────────────────
 * artisan_net, commission_amount, commission_rate,
 * status, artisan_id, request_id, owner_user_id
 *
 * HTTP STATUS
 * ───────────
 * 200  — settled (or idempotent same value)
 * 400  — validation failure (missing/invalid fields)
 * 401  — missing or invalid token
 * 403  — not admin
 * 404  — mission not found
 * 405  — non-POST method
 * 409  — conflicting re-settlement (different final_price already set)
 * 422  — mission status ineligible for settlement
 * 500  — server error
 *
 * ENV
 * ───
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — server-only
 */

'use strict';

/* ── Constants ─────────────────────────────────────────────── */
var COMMISSION_RATE    = 0.15;  /* 15% — canonical FIXEO commission */
var MAX_FINAL_PRICE    = 500000; /* reasonable upper bound — 500k MAD */
var UUID_RE            = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var ELIGIBLE_STATUSES  = ['terminée', 'validée'];

/* ── Helpers ───────────────────────────────────────────────── */
function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/* ── Admin session verification (same model as all admin fns) ── */
async function _verifyAdminSession(req) {
  var authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return { status: 'missing' };
  var token = authHeader.slice(7).trim();
  if (!token) return { status: 'missing' };

  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { status: 'error', detail: 'Missing env vars' };

  var userRes;
  try {
    userRes = await fetch(url + '/auth/v1/user', {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + token }
    });
  } catch (e) { return { status: 'error', detail: 'Network error: ' + e.message }; }

  if (!userRes.ok) return { status: 'invalid', detail: 'Token invalid or expired' };

  var userData;
  try { userData = await userRes.json(); } catch (_) { return { status: 'invalid', detail: 'Malformed auth response' }; }

  var userId = userData && userData.id;
  if (!userId) return { status: 'invalid', detail: 'Could not resolve user id' };

  var roleRes;
  try {
    roleRes = await fetch(
      url + '/rest/v1/users?select=role&id=eq.' + encodeURIComponent(userId) + '&limit=1',
      { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
  } catch (e) { return { status: 'error', detail: 'Network error checking role: ' + e.message }; }

  var roleBody;
  try { roleBody = await roleRes.json(); } catch (_) { roleBody = []; }
  var row  = Array.isArray(roleBody) ? roleBody[0] : null;
  var role = row && row.role ? String(row.role) : '';
  if (role !== 'admin') return { status: 'not_admin' };
  return { status: 'ok', userId: userId };
}

/* ── Fetch mission ─────────────────────────────────────────── */
async function _fetchMission(missionId) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  var res;
  try {
    res = await fetch(
      url + '/rest/v1/missions?select=id,status,final_price,commission_amount,agreed_price&id=eq.'
        + encodeURIComponent(missionId) + '&limit=1',
      { headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey } }
    );
  } catch (e) {
    var err = new Error('NETWORK: ' + e.message); err.code = 'NETWORK'; throw err;
  }

  var body;
  try { body = await res.json(); } catch (_) { body = []; }
  if (!res.ok) {
    var err2 = new Error('SUPABASE_ERROR: HTTP ' + res.status); err2.code = 'SUPABASE'; throw err2;
  }
  return Array.isArray(body) ? body[0] || null : null;
}

/* ── PATCH settlement ──────────────────────────────────────── */
async function _patchSettlement(missionId, finalPrice) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /* Patch ONLY final_price.
   * The DB trigger set_commission_amount() (BEFORE INSERT OR UPDATE) will
   * automatically compute commission_amount = round(final_price * 0.15, 2)
   * when final_price IS NOT NULL. Sending commission_amount here would be
   * redundant and was previously overwritten by the trigger anyway. */
  var patch = {
    final_price: finalPrice,
  };

  var res;
  try {
    res = await fetch(
      url + '/rest/v1/missions?id=eq.' + encodeURIComponent(missionId),
      {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         serviceKey,
          'Authorization':  'Bearer ' + serviceKey,
          'Prefer':         'return=representation',
        },
        body: JSON.stringify(patch),
      }
    );
  } catch (e) {
    var err = new Error('NETWORK: ' + e.message); err.code = 'NETWORK'; throw err;
  }

  var body;
  try { body = await res.json(); } catch (_) { body = null; }
  if (!res.ok) {
    var err2 = new Error('SUPABASE_ERROR: ' + (body && body.message ? body.message : 'HTTP ' + res.status));
    err2.code = 'SUPABASE'; throw err2;
  }
  /* Return the DB-computed row — commission_amount is set by the trigger,
   * so we read it back from the response rather than using our local calc. */
  var updated = Array.isArray(body) ? body[0] : body;
  return updated;
}

/* ── Main handler ──────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  /* Auth */
  var auth = await _verifyAdminSession(req);
  if (auth.status === 'missing') {
    return res.status(401).json({ ok: false, reason: 'unauthorized', detail: 'Authorization: Bearer <token> required' });
  }
  if (auth.status === 'invalid') {
    return res.status(401).json({ ok: false, reason: 'unauthorized', detail: auth.detail });
  }
  if (auth.status === 'not_admin') {
    return res.status(403).json({ ok: false, reason: 'forbidden', detail: 'Admin role required' });
  }
  if (auth.status === 'error') {
    console.error('[admin-settle-mission] Auth error:', auth.detail);
    return res.status(500).json({ ok: false, reason: 'server_error', detail: auth.detail });
  }
  /* auth.status === 'ok' — proceed */

  /* Parse input */
  var body       = req.body || {};
  var missionId  = String(body.mission_id || '').trim();
  var finalPrice = parseFloat(body.final_price);
  var force      = body.force === true || body.force === 'true';

  /* Validate mission_id */
  if (!missionId) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'mission_id is required' });
  }
  if (!UUID_RE.test(missionId)) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'mission_id must be a valid UUID' });
  }

  /* Validate final_price */
  if (!body.hasOwnProperty('final_price') || body.final_price === null || body.final_price === '') {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'final_price is required' });
  }
  if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'final_price must be a positive number' });
  }
  if (finalPrice > MAX_FINAL_PRICE) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'final_price exceeds maximum allowed value (' + MAX_FINAL_PRICE + ' MAD)' });
  }

  /* Fetch mission */
  var mission;
  try {
    mission = await _fetchMission(missionId);
  } catch (e) {
    console.error('[admin-settle-mission] fetchMission error:', e.message);
    return res.status(500).json({ ok: false, reason: 'fetch_error', detail: e.message });
  }

  if (!mission) {
    return res.status(404).json({ ok: false, reason: 'not_found', detail: 'Mission not found' });
  }

  /* Lifecycle eligibility */
  var status = String(mission.status || '');
  if (!ELIGIBLE_STATUSES.includes(status)) {
    return res.status(422).json({
      ok:     false,
      reason: 'ineligible',
      detail: 'Mission status "' + status + '" is not eligible for settlement. Eligible: ' + ELIGIBLE_STATUSES.join(', ')
    });
  }

  /* Idempotency / conflict */
  var existingFinal = mission.final_price !== null && mission.final_price !== undefined
    ? parseFloat(mission.final_price) : null;

  if (existingFinal !== null) {
    if (Math.abs(existingFinal - finalPrice) < 0.01) {
      /* Same value — idempotent */
      var commission = roundMoney(existingFinal * COMMISSION_RATE);
      console.info('[admin-settle-mission] Idempotent same-value settle:', missionId, '(admin:', auth.userId + ')');
      return res.status(200).json({
        ok:            true,
        idempotent:    true,
        mission_id:    missionId,
        final_price:   existingFinal,
        commission_amount: commission,
        artisan_net:   roundMoney(existingFinal - commission),
        detail:        'Settlement already set to same value'
      });
    }

    /* Different value — conflict unless forced */
    if (!force) {
      return res.status(409).json({
        ok:                 false,
        reason:             'conflict',
        existing_price:     existingFinal,
        new_price:          finalPrice,
        detail:             'Mission already has final_price=' + existingFinal + '. Send force:true to override.',
      });
    }
    /* force=true: admin acknowledged override — log and proceed */
    console.warn('[admin-settle-mission] FORCED re-settlement:', missionId,
      'old:', existingFinal, '→ new:', finalPrice, '(admin:', auth.userId + ')');
  }

  /* Settle — PATCH final_price only.
   * DB trigger set_commission_amount() computes commission_amount server-side.
   * We do NOT send commission_amount in the PATCH body. */
  var updated;
  try {
    updated = await _patchSettlement(missionId, finalPrice);
  } catch (e) {
    if (e.code === 'NETWORK') {
      console.error('[admin-settle-mission] NETWORK error:', e.message);
      return res.status(500).json({ ok: false, reason: 'network_error', detail: 'Could not reach database' });
    }
    console.error('[admin-settle-mission] PATCH error:', e.message);
    return res.status(500).json({ ok: false, reason: 'update_error', detail: e.message });
  }

  /* Read trigger-computed commission from DB response.
   * Fallback to local calculation only if Prefer:return=representation
   * did not echo the row (should not happen with service_role). */
  var commissionAmount = updated && updated.commission_amount != null
    ? roundMoney(Number(updated.commission_amount))
    : roundMoney(finalPrice * COMMISSION_RATE);
  var artisanNet = roundMoney(finalPrice - commissionAmount);

  console.info('[admin-settle-mission] Settled:', missionId,
    'final_price:', finalPrice, 'commission:', commissionAmount,
    'artisan_net:', artisanNet, '(admin:', auth.userId + ')');

  return res.status(200).json({
    ok:                true,
    mission_id:        missionId,
    final_price:       finalPrice,
    commission_amount: commissionAmount,
    artisan_net:       artisanNet,   /* derived, not stored — for display only */
    commission_rate:   COMMISSION_RATE,
  });
};
