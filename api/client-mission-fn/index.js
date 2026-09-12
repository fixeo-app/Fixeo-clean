/*!
 * api/client-mission-fn/index.js — Vercel Serverless Function
 * Phase BP02 — Mission Lifecycle: Client Validation
 * Route: POST /api/client/missions/confirm
 *
 * WHAT THIS DOES
 * ──────────────
 * Authenticated client endpoint for confirming completed missions:
 *   Calls confirm_completed_mission(p_request_id) RPC
 *   → missions.status:         done      → terminée
 *   → service_requests.status: completed → validated
 *
 * DESIGN DECISION: THIN WRAPPER
 * ──────────────────────────────
 * The DB RPC (confirm_completed_mission) already enforces:
 *   - authenticated caller
 *   - client ownership (B2C: client_profile_id; Enterprise: ERC.created_by)
 *   - current state validation (SR must be 'completed')
 *   - atomicity (RAISE EXCEPTION on partial failure)
 *   - idempotency (already_confirmed:true if already terminée/validated)
 *
 * This API layer adds:
 *   - CORS + method validation
 *   - Input validation (UUID format)
 *   - Auth token forwarded with anon key
 *   - Error normalization
 *
 * AUTH MODEL
 * ──────────
 * Bearer <client_jwt> → confirm_completed_mission via anon key + JWT
 * The DB RPC resolves client identity via auth.uid() + ownership query.
 * NO service_role exposure.
 *
 * PAYLOAD
 * ───────
 * { request_id: <uuid> }
 *
 * RESPONSE
 * ────────
 * 200: { ok: true, mission_id: <uuid> } | { ok: true, already_confirmed: true }
 * 400: { ok: false, reason: 'validation', detail: '...' }
 * 401: { ok: false, reason: 'unauthenticated' }
 * 403: { ok: false, reason: 'request_not_found_or_not_owned' }
 * 409: { ok: false, reason: 'request_not_completed', current: '...' }
 *      { ok: false, reason: 'completed_mission_not_found' }
 *      { ok: false, reason: 'atomicity_error' }
 * 405: { ok: false, reason: 'method_not_allowed' }
 * 500: { ok: false, reason: 'internal_error' }
 *
 * CORS
 * ────
 * Default: 'https://www.fixeo.ma'
 * Override: FIXEO_CORS_ORIGIN env var
 *
 * ENTERPRISE NOTE
 * ───────────────
 * Enterprise requests have client_profile_id = NULL.
 * confirm_completed_mission checks both client_profile_id AND
 * enterprise_request_context.created_by. Enterprise members can
 * confirm completion through this endpoint as long as they are
 * the original submitter of the request (ERC.created_by = auth.uid()).
 */

'use strict';

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Map RPC reason to HTTP status */
function reasonToStatus(reason) {
  if (!reason) return 500;
  if (reason === 'unauthenticated')               return 401;
  if (reason === 'request_not_found_or_not_owned') return 403;
  if (reason === 'request_not_completed')          return 409;
  if (reason === 'completed_mission_not_found')    return 409;
  if (reason === 'atomicity_error')                return 409;
  if (reason === 'mission_not_found')              return 409;
  if (reason === 'internal_error')                 return 500;
  return 400;
}

module.exports = async function handler(req, res) {
  var corsOrigin = process.env.FIXEO_CORS_ORIGIN || 'https://www.fixeo.ma';

  res.setHeader('Access-Control-Allow-Origin',  corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  /* ── Auth ──────────────────────────────────────────────── */
  var authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, reason: 'unauthenticated' });
  }
  var jwtToken = authHeader.slice(7).trim();
  if (!jwtToken) {
    return res.status(401).json({ ok: false, reason: 'unauthenticated' });
  }

  /* ── Parse body ────────────────────────────────────────── */
  var body;
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch (_) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'Invalid JSON body' });
  }

  var requestId = String(body.request_id || '').trim();

  if (!requestId || !UUID_RE.test(requestId)) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'request_id must be a valid UUID' });
  }

  /* ── Env ───────────────────────────────────────────────── */
  var supabaseUrl     = process.env.SUPABASE_URL;
  var supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[client-mission-fn] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return res.status(500).json({ ok: false, reason: 'internal_error' });
  }

  /* ── Call confirm_completed_mission RPC ─────────────────── */
  var rpcRes;
  try {
    rpcRes = await fetch(
      supabaseUrl + '/rest/v1/rpc/confirm_completed_mission',
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         supabaseAnonKey,
          'Authorization':  'Bearer ' + jwtToken
        },
        body: JSON.stringify({ p_request_id: requestId })
      }
    );
  } catch (e) {
    console.error('[client-mission-fn] Network error:', e && e.message);
    return res.status(500).json({ ok: false, reason: 'internal_error' });
  }

  var rpcData;
  try {
    rpcData = await rpcRes.json();
  } catch (_) {
    return res.status(500).json({ ok: false, reason: 'internal_error' });
  }

  /* ── PostgREST HTTP-level error ─────────────────────────── */
  if (!rpcRes.ok) {
    var pgCode = rpcData && rpcData.code;
    if (pgCode === 'PGRST301' || rpcRes.status === 401) {
      return res.status(401).json({ ok: false, reason: 'unauthenticated' });
    }
    console.error('[client-mission-fn] PostgREST error:', rpcData);
    return res.status(500).json({ ok: false, reason: 'internal_error' });
  }

  /* ── Parse RPC result ───────────────────────────────────── */
  var result = rpcData;
  if (Array.isArray(result)) result = result[0] || {};

  if (!result || result.ok !== true) {
    var reason = String(result && result.reason ? result.reason : 'internal_error');
    var httpStatus = reasonToStatus(reason);
    var out = { ok: false, reason: reason };
    if (result && result.current) out.current = result.current;
    return res.status(httpStatus).json(out);
  }

  return res.status(200).json(result);
};
