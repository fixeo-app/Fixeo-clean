/*!
 * api/admin-targeted-dispatch-fn/index.js
 * FIXEO — Admin Targeted Dispatch V1
 *
 * Route:
 *   POST /api/admin/requests/assign
 *
 * Payload:
 *   {
 *     request_id: <uuid>,
 *     artisan_id: <uuid>
 *   }
 *
 * SECURITY
 * ────────────────────────────────────────────────────────────
 * 1. Browser sends Supabase access token:
 *      Authorization: Bearer <token>
 *
 * 2. Server validates token through Supabase Auth.
 *
 * 3. Server resolves public.users.role and requires:
 *      role === 'admin'
 *
 * 4. Browser NEVER receives or uses service_role.
 *
 * 5. Server calls:
 *      public.admin_targeted_dispatch_v1(request_id, artisan_id)
 *    using SUPABASE_SERVICE_ROLE_KEY.
 *
 * No direct service_requests / missions writes are performed here.
 */

'use strict';


/* ── UUID guard ────────────────────────────────────────────── */

var UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/* ── Admin session verification ────────────────────────────── */
/*
 * Same security model as:
 *   api/admin-verify-artisan-fn/index.js
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
    return {
      status: 'error',
      detail: 'Server configuration error: missing env vars'
    };
  }


  /* Step 1 — validate Supabase access token */

  var userRes;

  try {
    userRes = await fetch(url + '/auth/v1/user', {
      headers: {
        'apikey':        serviceKey,
        'Authorization': 'Bearer ' + token
      }
    });
  } catch (e) {
    return {
      status: 'error',
      detail: 'Network error validating token: ' + e.message
    };
  }


  if (!userRes.ok) {
    return {
      status: 'invalid',
      detail: 'Token invalid or expired'
    };
  }


  var userData;

  try {
    userData = await userRes.json();
  } catch (_) {
    return {
      status: 'invalid',
      detail: 'Malformed auth response'
    };
  }


  var userId = userData && userData.id;

  if (!userId) {
    return {
      status: 'invalid',
      detail: 'Could not resolve user id from token'
    };
  }


  /* Step 2 — canonical admin role check */

  var roleRes;

  try {
    roleRes = await fetch(
      url +
        '/rest/v1/users?select=role&id=eq.' +
        encodeURIComponent(userId) +
        '&limit=1',
      {
        headers: {
          'apikey':        serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        }
      }
    );
  } catch (e) {
    return {
      status: 'error',
      detail: 'Network error checking role: ' + e.message
    };
  }


  if (!roleRes.ok) {
    return {
      status: 'error',
      detail: 'Could not verify admin role'
    };
  }


  var roleBody;

  try {
    roleBody = await roleRes.json();
  } catch (_) {
    roleBody = [];
  }


  var row =
    Array.isArray(roleBody)
      ? roleBody[0]
      : null;

  var role =
    row && row.role
      ? String(row.role)
      : '';


  if (role !== 'admin') {
    return { status: 'not_admin' };
  }


  return {
    status: 'ok',
    userId: userId
  };
}


/* ── Call canonical targeted-dispatch RPC ──────────────────── */

async function _targetedDispatch(requestId, artisanId) {
  var url        = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


  var rpcRes;

  try {
    rpcRes = await fetch(
      url + '/rest/v1/rpc/admin_targeted_dispatch_v1',
      {
        method: 'POST',

        headers: {
          'Content-Type':  'application/json',
          'apikey':         serviceKey,
          'Authorization':  'Bearer ' + serviceKey
        },

        body: JSON.stringify({
          p_request_id: requestId,
          p_artisan_id: artisanId
        })
      }
    );
  } catch (e) {
    var networkErr =
      new Error('NETWORK: ' + e.message);

    networkErr.code = 'NETWORK';

    throw networkErr;
  }


  var result = null;

  try {
    result = await rpcRes.json();
  } catch (_) {
    result = null;
  }


  if (!rpcRes.ok) {
    var detail =
      result && result.message
        ? result.message
        : 'HTTP ' + rpcRes.status;

    var rpcErr =
      new Error('SUPABASE_RPC_ERROR: ' + detail);

    rpcErr.code =
      'SUPABASE_' + rpcRes.status;

    rpcErr.status =
      rpcRes.status;

    rpcErr.body =
      result;

    throw rpcErr;
  }


  return result;
}


/* ── Business result → HTTP status ─────────────────────────── */

function _statusForReason(reason) {
  switch (reason) {

    case 'request_not_found':
    case 'artisan_not_found':
      return 404;


    case 'already_claimed':
    case 'request_not_dispatchable':
    case 'offer_conflict':
    case 'request_conflict':
      return 409;


    case 'request_id_required':
    case 'artisan_id_required':
      return 400;


    case 'no_candidate':
    case 'target_verification_failed':
    case 'invalid_dispatch_result':
    case 'dispatch_failed':
      return 422;


    case 'internal_error':
      return 500;


    default:
      return 400;
  }
}


/* ── Main handler ──────────────────────────────────────────── */

module.exports = async function handler(req, res) {

  /* Method guard */

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      reason: 'method_not_allowed'
    });
  }


  /* Admin authentication */

  var auth =
    await _verifyAdminSession(req);


  if (auth.status === 'missing') {
    return res.status(401).json({
      ok: false,
      reason: 'unauthorized',
      detail: 'Authorization: Bearer <token> required'
    });
  }


  if (auth.status === 'invalid') {
    return res.status(401).json({
      ok: false,
      reason: 'unauthorized',
      detail:
        auth.detail ||
        'Invalid or expired token'
    });
  }


  if (auth.status === 'not_admin') {
    return res.status(403).json({
      ok: false,
      reason: 'forbidden',
      detail: 'Admin role required'
    });
  }


  if (auth.status === 'error') {
    console.error(
      '[admin-targeted-dispatch] Auth error:',
      auth.detail
    );

    return res.status(500).json({
      ok: false,
      reason: 'server_error',
      detail: auth.detail
    });
  }


  /* Parse canonical input only */

  var body =
    req.body || {};

  var requestId =
    String(body.request_id || '').trim();

  var artisanId =
    String(body.artisan_id || '').trim();


  /* request_id validation */

  if (!requestId) {
    return res.status(400).json({
      ok: false,
      reason: 'validation',
      detail: 'request_id is required'
    });
  }


  if (!UUID_RE.test(requestId)) {
    return res.status(400).json({
      ok: false,
      reason: 'validation',
      detail: 'request_id must be a valid UUID'
    });
  }


  /* artisan_id validation */

  if (!artisanId) {
    return res.status(400).json({
      ok: false,
      reason: 'validation',
      detail: 'artisan_id is required'
    });
  }


  if (!UUID_RE.test(artisanId)) {
    return res.status(400).json({
      ok: false,
      reason: 'validation',
      detail: 'artisan_id must be a valid UUID'
    });
  }


  /* Canonical server-side RPC */

  var result;

  try {
    result =
      await _targetedDispatch(
        requestId,
        artisanId
      );

  } catch (e) {

    if (e.code === 'NETWORK') {
      console.error(
        '[admin-targeted-dispatch] Network error:',
        e.message
      );

      return res.status(500).json({
        ok: false,
        reason: 'network_error',
        detail: 'Could not reach database'
      });
    }


    console.error(
      '[admin-targeted-dispatch] RPC error:',
      e.code,
      e.message
    );


    return res.status(500).json({
      ok: false,
      reason: 'rpc_error',
      detail: e.message
    });
  }


  /* Defensive response check */

  if (!result || typeof result !== 'object') {
    console.error(
      '[admin-targeted-dispatch] Invalid RPC response:',
      result
    );

    return res.status(500).json({
      ok: false,
      reason: 'invalid_rpc_response'
    });
  }


  /* Canonical business rejection */

  if (result.ok !== true) {
    var reason =
      String(
        result.reason ||
        'dispatch_failed'
      );

    console.warn(
      '[admin-targeted-dispatch] Rejected:',
      reason,
      'request:',
      requestId,
      'artisan:',
      artisanId,
      'admin:',
      auth.userId
    );


    return res
      .status(_statusForReason(reason))
      .json(result);
  }


  /* Success */

  console.info(
    '[admin-targeted-dispatch] Success:',
    'request:',
    requestId,
    'artisan:',
    artisanId,
    'mission:',
    result.mission_id,
    'admin:',
    auth.userId
  );


  return res.status(200).json(result);
};
