/*!
 * api/artisan-mission-fn/index.js — Vercel Serverless Function
 * Phase BP02 — Mission Lifecycle: Artisan Start / Complete
 * Route: POST /api/artisan/missions/action
 *
 * WHAT THIS DOES
 * ──────────────
 * Authenticated artisan endpoint for mission lifecycle transitions:
 *   action=start    → start_mission(p_mission_id)   → SR: assigned→in_progress
 *   action=complete → complete_mission(p_mission_id) → mission: pending→done, SR: in_progress→completed
 *
 * DESIGN DECISION: THIN WRAPPER
 * ──────────────────────────────
 * The DB RPCs (start_mission, complete_mission) already enforce:
 *   - authenticated caller
 *   - artisan identity (owner_user_id → artisans.id)
 *   - mission ownership
 *   - current state validation
 *   - atomicity
 *   - idempotency
 *
 * This API layer adds:
 *   - CORS + method validation
 *   - Input validation (UUID format, action enum)
 *   - Auth token forwarded to DB call (anon key + artisan JWT)
 *   - Error normalization
 *
 * AUTH MODEL
 * ──────────
 * Bearer <artisan_jwt> → supabase.rpc(action, {p_mission_id}) with anon key
 * The DB RPC runs SECURITY DEFINER and resolves artisan identity via auth.uid()
 * NO service_role exposure to browser.
 *
 * PAYLOAD
 * ───────
 * { mission_id: <uuid>, action: 'start' | 'complete' }
 *
 * RESPONSE
 * ────────
 * 200: { ok: true, mission_id: <uuid>, already_started?: bool, already_completed?: bool }
 * 400: { ok: false, reason: 'validation', detail: '...' }
 * 401: { ok: false, reason: 'unauthenticated' }
 * 403: { ok: false, reason: '...' }   // not_your_mission, artisan_not_found
 * 404: { ok: false, reason: 'mission_not_found' }
 * 409: { ok: false, reason: 'invalid_transition', current: '...' }
 * 405: { ok: false, reason: 'method_not_allowed' }
 * 500: { ok: false, reason: 'internal_error' }
 *
 * CORS
 * ────
 * Default: 'https://www.fixeo.ma'
 * Override: FIXEO_CORS_ORIGIN env var
 */

'use strict';

var UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var VALID_ACTIONS = ['start', 'complete'];

/* Map RPC action name to DB function name */
var RPC_MAP = {
  start:    'start_mission',
  complete: 'complete_mission'
};

/* Map RPC reason to HTTP status */
function reasonToStatus(reason) {
  if (!reason) return 500;
  if (reason === 'unauthenticated')      return 401;
  if (reason === 'not_your_mission')     return 403;
  if (reason === 'artisan_not_found')    return 403;
  if (reason === 'mission_not_found')    return 404;
  if (reason === 'not_accepted')         return 409;  // start: mission not pending
  if (reason === 'not_started')          return 409;  // complete: mission not started
  if (reason === 'invalid_request_state') return 409;
  if (reason === 'inconsistent_state')   return 409;
  if (reason === 'atomicity_error')      return 500;
  if (reason === 'internal_error')       return 500;
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

  var missionId = String(body.mission_id || '').trim();
  var action    = String(body.action    || '').trim().toLowerCase();

  if (!missionId || !UUID_RE.test(missionId)) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'mission_id must be a valid UUID' });
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ ok: false, reason: 'validation', detail: 'action must be "start" or "complete"' });
  }

  var rpcName = RPC_MAP[action];

  /* ── Env ───────────────────────────────────────────────── */
  var supabaseUrl     = process.env.SUPABASE_URL;
  var supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[artisan-mission-fn] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return res.status(500).json({ ok: false, reason: 'internal_error' });
  }

  /* ── Call DB RPC with artisan JWT ──────────────────────── */
  /* The RPC runs SECURITY DEFINER and resolves artisan via auth.uid().
   * We pass the artisan's JWT as Authorization header so auth.uid() resolves. */
  var rpcRes;
  try {
    rpcRes = await fetch(
      supabaseUrl + '/rest/v1/rpc/' + rpcName,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         supabaseAnonKey,
          'Authorization':  'Bearer ' + jwtToken
        },
        body: JSON.stringify({ p_mission_id: missionId })
      }
    );
  } catch (e) {
    console.error('[artisan-mission-fn] Network error calling ' + rpcName + ':', e && e.message);
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
    console.error('[artisan-mission-fn] PostgREST error for ' + rpcName + ':', rpcData);
    return res.status(500).json({ ok: false, reason: 'internal_error' });
  }

  /* ── Parse RPC result ───────────────────────────────────── */
  var result = rpcData;

  /* PostgREST wraps RETURNS jsonb in an array when using /rpc/ endpoint */
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
