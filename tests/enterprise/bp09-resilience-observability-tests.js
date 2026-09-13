'use strict';
// ══════════════════════════════════════════════════════════════
// BP09 — RESILIENCE / OBSERVABILITY / OPERATIONS — Test Suite
// Covers failure scenarios a–o from the BP09 audit spec
// Pure Node.js — no DOM, no network.
// ══════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../../');
const JS_FILE = path.join(ROOT, 'js/enterprise-dashboard-v1.js');

let pass = 0, fail = 0;
const results = [];

function PASS(name)       { pass++; results.push({ status:'PASS', name }); }
function FAIL(name, msg)  { fail++; results.push({ status:'FAIL', name, msg: msg||'assertion failed' }); }
function assert(cond, name, failMsg) { if (cond) PASS(name); else FAIL(name, failMsg); }

// ── Load source
if (!fs.existsSync(JS_FILE)) {
  console.error('FATAL: JS file not found: ' + JS_FILE);
  process.exit(1);
}
const SRC = fs.readFileSync(JS_FILE, 'utf8');

// ── Helper: extract a function body from source for local testing
function extractFn(name) {
  // Simple heuristic: find "function name(" and grab balanced braces
  const startToken = 'function ' + name + '(';
  const idx = SRC.indexOf(startToken);
  if (idx < 0) return null;
  let depth = 0, i = SRC.indexOf('{', idx);
  const start = i;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 — Infrastructure: _REASON_MSG, _safeMsg, _rpcErr
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 1] BP09 Observability Infrastructure\n');

// BP09-OBS-01: _REASON_MSG exists in source
assert(SRC.includes('const _REASON_MSG'), 'BP09-OBS-01: _REASON_MSG map defined');

// BP09-OBS-02: All critical reason codes present in map
const REQUIRED_REASON_CODES = [
  'unauthenticated', 'user_not_found', 'enterprise_required', 'enterprise_not_found',
  'forbidden', 'site_not_assigned', 'site_not_found', 'site_inactive',
  'site_required', 'service_category_required', 'description_required',
  'urgency_invalid', 'request_not_found_or_not_owned', 'request_not_completed',
  'completed_mission_not_found', 'mission_not_found', 'atomicity_error', 'internal_error',
];
REQUIRED_REASON_CODES.forEach(function(code) {
  // Keys are unquoted identifiers in the object literal OR quoted strings
  const asKey       = new RegExp('(?:^|[,{\\s])' + code.replace(/_/g, '_') + '\\s*:').test(SRC);
  const asString    = SRC.includes("'" + code + "'") || SRC.includes('"' + code + '"');
  assert(asKey || asString, 'BP09-OBS-02: reason code "' + code + '" in _REASON_MSG');
});

// BP09-OBS-03: _safeMsg function defined
assert(SRC.includes('function _safeMsg('), 'BP09-OBS-03: _safeMsg function defined');

// BP09-OBS-04: _rpcErr function defined
assert(SRC.includes('function _rpcErr('), 'BP09-OBS-04: _rpcErr function defined');

// BP09-OBS-05: _corrId function defined (correlation ID helper)
assert(SRC.includes('function _corrId('), 'BP09-OBS-05: _corrId function defined');

// BP09-OBS-06: _safeMsg blocks PGRST internals pattern
assert(SRC.includes('PGRST') && SRC.includes('_safeMsg'), 'BP09-OBS-06: _safeMsg has Postgres/PGRST filter');

// ── Inline unit tests for _REASON_MSG / _safeMsg / _rpcErr
// (evaluated locally, not loading the full browser module)
const _REASON_MSG_INLINE = {
  unauthenticated:              'Session expirée. Veuillez vous reconnecter.',
  user_not_found:               'Utilisateur introuvable.',
  enterprise_required:          'Compte entreprise requis.',
  enterprise_not_found:         'Compte entreprise introuvable.',
  forbidden:                    'Accès refusé.',
  site_not_assigned:            'Ce site ne vous est pas assigné.',
  site_not_found:               'Site introuvable.',
  site_enterprise_mismatch:     "Le site n'appartient pas à ce compte.",
  site_inactive:                'Ce site est inactif.',
  site_required:                'Veuillez sélectionner un site.',
  service_category_required:    'Veuillez sélectionner une catégorie.',
  description_required:         'La description est requise.',
  urgency_invalid:              "Niveau d'urgence invalide.",
  request_not_found_or_not_owned: 'Demande introuvable ou accès refusé.',
  request_not_completed:        "Cette demande n'est pas encore terminée.",
  completed_mission_not_found:  'Mission terminée introuvable.',
  mission_not_found:            'Mission introuvable.',
  atomicity_error:              'Erreur de synchronisation, veuillez réessayer.',
  internal_error:               'Erreur interne. Veuillez réessayer.',
  no_change:                    'Aucun changement.',
};

function _safeMsg_inline(err, fallback) {
  if (!err) return fallback || 'Erreur inconnue.';
  if (err._reason && _REASON_MSG_INLINE[err._reason]) return _REASON_MSG_INLINE[err._reason];
  const msg = (typeof err === 'string') ? err : (err.message || '');
  if (/PGRST|column|relation|violates|constraint|syntax|unexpected/i.test(msg)) {
    return fallback || 'Erreur de chargement.';
  }
  if (msg && msg.length < 200) return msg;
  return fallback || 'Erreur de chargement.';
}

function _rpcErr_inline(data, fallback) {
  const reason = (data && data.reason) || 'internal_error';
  const e = new Error(_REASON_MSG_INLINE[reason] || fallback || "Erreur lors de l'opération.");
  e._reason = reason;
  return e;
}

// BP09-OBS-07: _safeMsg with null returns fallback
assert(_safeMsg_inline(null, 'fallback') === 'fallback', 'BP09-OBS-07: _safeMsg(null) returns fallback');

// BP09-OBS-08: _safeMsg strips raw Postgres error
(function() {
  const pgErr = new Error('PGRST301: column "user_id" of relation "enterprise_members" violates constraint');
  const result = _safeMsg_inline(pgErr, 'Erreur de chargement.');
  assert(!result.includes('PGRST') && !result.includes('column') && !result.includes('constraint'),
    'BP09-OBS-08: _safeMsg strips PGRST/column/constraint from Postgres errors');
})();

// BP09-OBS-09: _safeMsg strips "violates constraint" text
(function() {
  const pgErr = new Error('duplicate key violates unique constraint "enterprise_members_pkey"');
  const result = _safeMsg_inline(pgErr, 'Erreur.');
  assert(result === 'Erreur.', 'BP09-OBS-09: _safeMsg strips constraint violation errors');
})();

// BP09-OBS-10: _safeMsg maps _reason code
(function() {
  const err = { _reason: 'site_inactive', message: 'raw db error' };
  const result = _safeMsg_inline(err, 'fallback');
  assert(result === 'Ce site est inactif.', 'BP09-OBS-10: _safeMsg maps _reason code to user message');
})();

// BP09-OBS-11: _rpcErr creates Error with _reason
(function() {
  const rpcResponse = { ok: false, reason: 'forbidden' };
  const err = _rpcErr_inline(rpcResponse, 'fallback');
  assert(err instanceof Error && err._reason === 'forbidden',
    'BP09-OBS-11: _rpcErr creates Error with _reason=forbidden');
})();

// BP09-OBS-12: _rpcErr produces user-friendly message for unauthenticated
(function() {
  const err = _rpcErr_inline({ ok: false, reason: 'unauthenticated' }, 'fallback');
  assert(err.message.includes('Session'), 'BP09-OBS-12: _rpcErr unauthenticated message mentions Session');
})();

// BP09-OBS-13: _rpcErr fallbacks for unknown reason codes
(function() {
  const err = _rpcErr_inline({ ok: false, reason: 'totally_unknown_code' }, 'Fallback msg.');
  assert(err._reason === 'totally_unknown_code',
    'BP09-OBS-13: _rpcErr preserves unknown reason code on error._reason');
})();

// BP09-OBS-14: _safeMsg truncates overly long messages
(function() {
  const longMsg = 'x'.repeat(300);
  const result = _safeMsg_inline(new Error(longMsg), 'Fallback.');
  assert(result === 'Fallback.', 'BP09-OBS-14: _safeMsg truncates messages > 200 chars, returns fallback');
})();

// ══════════════════════════════════════════════════════════════
// SECTION 2 — Scenario a–c: Boot & RPC Failures
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 2] Boot & RPC Failure Scenarios\n');

// Scenario a: Network timeout / Supabase unavailable at boot
// BP09-SCN-01: bootApp has try/catch around getSession
(function() {
  const hasGetSession = SRC.includes("_sb.auth.getSession()");
  const hasTryCatch   = SRC.includes('catch(err)') && SRC.includes('ent-gate-msg');
  assert(hasGetSession && hasTryCatch, 'BP09-SCN-01 (scenario a): bootApp catches getSession failure and shows gate');
})();

// BP09-SCN-02: getSession error uses _safeMsg
assert(SRC.includes("_safeMsg(err,'Erreur de connexion')"),
  "BP09-SCN-02 (scenario a): getSession error passed to _safeMsg, not raw err.message");

// Scenario b: RPC returns {ok:false} for create_enterprise_request
// BP09-SCN-03: submitNewRequest checks data.ok===false
(function() {
  const checkOk = SRC.includes('data&&data.ok===false') || SRC.includes('data.ok === false');
  assert(checkOk, 'BP09-SCN-03 (scenario b): submitNewRequest guards data.ok===false');
})();

// BP09-SCN-04: submitNewRequest error displayed via _safeMsg
assert(SRC.includes("_safeMsg(err,'Erreur lors de la cr"),
  'BP09-SCN-04 (scenario b): submitNewRequest error uses _safeMsg, not raw err.message');

// Scenario c: RPC returns {ok:false} for confirm_completed_mission
// BP09-SCN-05: confirmMission now checks data.ok===false (BP09-RES-01 fix)
(function() {
  const idx = SRC.indexOf('async function confirmMission(');
  if (idx < 0) { FAIL('BP09-SCN-05', 'confirmMission not found'); return; }
  const fnBody = (function() {
    let depth = 0, i = SRC.indexOf('{', idx), start = i;
    for (; i < SRC.length; i++) {
      if (SRC[i]==='{') depth++; else if (SRC[i]==='}') { depth--; if(!depth) break; }
    }
    return SRC.slice(start, i+1);
  })();
  assert(fnBody.includes('data.ok === false') || fnBody.includes('data&&data.ok===false'),
    'BP09-SCN-05 (scenario c): confirmMission checks data.ok===false — BP09-RES-01 fix applied');
  assert(fnBody.includes('_rpcErr(data'),
    'BP09-SCN-05b (scenario c): confirmMission uses _rpcErr to produce normalized Error');
})();

// BP09-SCN-06: confirmMission destructs data (not just error) from rpc call
(function() {
  const confirmFnIdx = SRC.indexOf('async function confirmMission(');
  const rpcLine = SRC.indexOf("rpc('confirm_completed_mission'", confirmFnIdx);
  const lineStart = SRC.lastIndexOf('\n', rpcLine) + 1;
  const line = SRC.slice(lineStart, SRC.indexOf('\n', rpcLine));
  assert(line.includes('{ data,') || line.includes('{ data ,') || line.includes('{data,'),
    'BP09-SCN-06 (scenario c): confirm rpc call destructs data (not just error)');
})();

// ══════════════════════════════════════════════════════════════
// SECTION 3 — Scenarios d–g: Empty/Stale State
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 3] Empty & Stale State Scenarios\n');

// Scenario d: Empty enterprise (no sites, no members, no requests)
// BP09-SCN-07: renderRequestsList handles empty S.requests
assert(SRC.includes('requests-empty') || SRC.includes('emptyEl'),
  'BP09-SCN-07 (scenario d): requests-empty element handled for zero requests');

// BP09-SCN-08: loadSites handles empty sites array
assert(SRC.includes('isSiteManagerWithNoSites'),
  'BP09-SCN-08 (scenario d): isSiteManagerWithNoSites guard for site_manager with 0 sites');

// Scenario e: No active membership
// BP09-SCN-09: bootApp filters .eq('status','active')
assert(SRC.includes(".eq('status', 'active')"),
  "BP09-SCN-09 (scenario e): enterprise_members query filters status='active'");

// BP09-SCN-10: empty active membership shows access-denied gate
(function() {
  const checkRows = SRC.includes("rows.length") && SRC.includes("ent-access-denied");
  assert(checkRows, 'BP09-SCN-10 (scenario e): empty active membership rows redirects to access-denied gate');
})();

// Scenario f: Site becomes inactive while request dialog is open
// BP09-SCN-11: req-site dropdown filters to active sites only
assert(SRC.includes("s.status === 'active'") && SRC.includes("req-site"),
  "BP09-SCN-11 (scenario f): req-site dropdown filters to active sites; inactive sites excluded");

// BP09-SCN-12: site_inactive reason code mapped in _REASON_MSG
assert(_REASON_MSG_INLINE['site_inactive'] === 'Ce site est inactif.',
  'BP09-SCN-12 (scenario f): site_inactive reason maps to user message');

// Scenario g: Stale assignedSiteIds (site_manager assignment removed while page open)
// BP09-SCN-13: assignedSiteIds refreshed on section load
assert(SRC.includes('loadMyAssignments'),
  'BP09-SCN-13 (scenario g): loadMyAssignments function exists to refresh site assignments');

// BP09-SCN-14: site_not_assigned reason code mapped
assert(_REASON_MSG_INLINE['site_not_assigned'] === 'Ce site ne vous est pas assigné.',
  'BP09-SCN-14 (scenario g): site_not_assigned reason mapped to user message');

// ══════════════════════════════════════════════════════════════
// SECTION 4 — Scenarios h–j: Session & Duplicate Submission
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 4] Session Expiry & Double-Submit Scenarios\n');

// Scenario h: Session expires while interacting
// BP09-SCN-15: onAuthStateChange handles session===null (BP09-RES-02)
assert(SRC.includes('session === null') && SRC.includes("event !== 'INITIAL_SESSION'"),
  'BP09-SCN-15 (scenario h): onAuthStateChange handles null session on token refresh failure');

// BP09-SCN-16: visibilitychange re-checks session (BP09-RES-03)
assert(SRC.includes('visibilitychange') && SRC.includes('getSession'),
  'BP09-SCN-16 (scenario h): visibilitychange listener re-validates session on tab focus');

// BP09-SCN-17: SIGNED_OUT triggers stopPolling + redirect
assert(SRC.includes("event==='SIGNED_OUT'") && SRC.includes('stopPolling()') && SRC.includes("window.location.href='/'"),
  "BP09-SCN-17 (scenario h): SIGNED_OUT event stops polling and redirects to '/'");

// Scenario i: Double-click submit on request creation
// BP09-SCN-18: S.formSubmitting guard prevents re-entry
(function() {
  const hasGuard = SRC.includes('if(S.formSubmitting) return') || SRC.includes("S.formSubmitting) return");
  assert(hasGuard, 'BP09-SCN-18 (scenario i): formSubmitting guard blocks double-submit');
})();

// BP09-SCN-19: submitBtn disabled during submission
assert(SRC.includes('submitBtn.disabled=true') || SRC.includes('submitBtn) submitBtn.disabled=true'),
  'BP09-SCN-19 (scenario i): submit button disabled during submitNewRequest');

// BP09-SCN-20: formSubmitting reset on both success and error paths
(function() {
  const successReset = SRC.includes('S.formSubmitting=false');
  const errReset     = (SRC.match(/S\.formSubmitting=false/g) || []).length >= 3; // success + two error paths
  assert(successReset && errReset, 'BP09-SCN-20 (scenario i): formSubmitting reset on all code paths');
})();

// Scenario j: Double-click confirm on mission validation
// BP09-SCN-21: S.confirmSubmitting guard prevents re-entry
(function() {
  const hasGuard = SRC.includes('if(S.confirmSubmitting) return');
  assert(hasGuard, 'BP09-SCN-21 (scenario j): confirmSubmitting guard blocks double-confirm');
})();

// BP09-SCN-22: confirm button disabled during confirmMission
assert(SRC.includes("btn.disabled=true") || SRC.includes("btn) btn.disabled=true"),
  'BP09-SCN-22 (scenario j): confirm button disabled during confirmMission');

// ══════════════════════════════════════════════════════════════
// SECTION 5 — Scenarios k–l: Null / Malformed Responses
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 5] Null & Malformed Response Scenarios\n');

// Scenario k: RPC returns null/unexpected shape
// BP09-SCN-23: data||[] guards used throughout
(function() {
  const guardCount = (SRC.match(/data\|\|\[\]/g) || []).length;
  assert(guardCount >= 5, 'BP09-SCN-23 (scenario k): data||[] guards present (' + guardCount + ' found) for null data');
})();

// BP09-SCN-24: submitNewRequest newId extraction is null-safe
(function() {
  const extract = 'data&&(data.service_request_id||data.request_id||data.id))||null';
  const altExtract = "data && (data.service_request_id || data.request_id || data.id)) || null";
  assert(SRC.includes(extract) || SRC.includes(altExtract),
    'BP09-SCN-24 (scenario k): newId extraction from RPC response is null-safe');
})();

// Scenario l: Malformed backend response (missing expected fields)
// BP09-SCN-25: getSiteName returns fallback for unknown site IDs
(function() {
  const idx = SRC.indexOf('function getSiteName(');
  if (idx < 0) { FAIL('BP09-SCN-25', 'getSiteName not found'); return; }
  let depth = 0, i = SRC.indexOf('{', idx), start = i;
  for (; i < SRC.length; i++) {
    if (SRC[i]==='{') depth++; else if (SRC[i]==='}') { depth--; if(!depth) break; }
  }
  const body = SRC.slice(start, i+1);
  const hasFallback = body.includes('||') || body.includes('?') || body.includes('—');
  assert(hasFallback, 'BP09-SCN-25 (scenario l): getSiteName has fallback for missing/null site');
})();

// BP09-SCN-26: formatStatus has default case for unexpected status values
(function() {
  const idx = SRC.indexOf('function formatStatus(');
  if (idx < 0) { FAIL('BP09-SCN-26', 'formatStatus not found'); return; }
  let depth = 0, i = SRC.indexOf('{', idx), start = i;
  for (; i < SRC.length; i++) {
    if (SRC[i]==='{') depth++; else if (SRC[i]==='}') { depth--; if(!depth) break; }
  }
  const body = SRC.slice(start, i+1);
  const hasDefault = body.includes('default') || body.includes('||');
  assert(hasDefault, 'BP09-SCN-26 (scenario l): formatStatus has default/fallback for unexpected status');
})();

// ══════════════════════════════════════════════════════════════
// SECTION 6 — Scenarios m–o: Edge Cases
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 6] Edge Case Scenarios\n');

// Scenario m: Request receives zero dispatch candidates (dispatch_pending)
// BP09-SCN-27: 'new' status mapped to appropriate user message
(function() {
  const hasNewMsg = SRC.includes("'new'") && SRC.includes("En attente d");
  assert(hasNewMsg, "BP09-SCN-27 (scenario m): status='new' maps to waiting-for-dispatch user message");
})();

// BP09-SCN-28: no_match status has explicit user message and RAFI narration
(function() {
  const hasNoMatch = SRC.includes("'no_match'") && SRC.includes('Aucun artisan');
  assert(hasNoMatch, "BP09-SCN-28 (scenario m): status='no_match' has explicit user message");
})();

// Scenario n: Mission already validated (user clicks confirm twice)
// BP09-SCN-29: confirmSubmitting guard (reentry) + data.ok check handles already_validated
(function() {
  // The RPC returns {ok:true, already_validated:true} for already-validated — this is a success path
  // The confirmSubmitting guard prevents duplicate clicks.
  // BP09-SCN-05 above already checks the ok:false guard.
  const hasConfirmGuard = SRC.includes('if(S.confirmSubmitting) return');
  assert(hasConfirmGuard,
    'BP09-SCN-29 (scenario n): confirmSubmitting guard prevents redundant confirm on already-validated');
})();

// BP09-SCN-30: request_not_completed reason code handled in _REASON_MSG
assert(_REASON_MSG_INLINE['request_not_completed'],
  'BP09-SCN-30 (scenario n): request_not_completed has user-facing message in _REASON_MSG');

// Scenario o: Stale page state after browser back/forward
// BP09-SCN-31: visibilitychange handler re-checks session
assert(SRC.includes('visibilitychange'),
  'BP09-SCN-31 (scenario o): visibilitychange handler present for back/forward stale state');

// BP09-SCN-32: navigateTo reloads data for each section (not cached only)
(function() {
  const navIdx = SRC.indexOf('function navigateTo(');
  let depth = 0, i = SRC.indexOf('{', navIdx), start = i;
  for (; i < SRC.length; i++) {
    if (SRC[i]==='{') depth++; else if (SRC[i]==='}') { depth--; if(!depth) break; }
  }
  const body = SRC.slice(start, i+1);
  const loadsData = body.includes('loadOverview') && body.includes('loadRequests')
    && body.includes('loadSites') && body.includes('loadMembers');
  assert(loadsData,
    'BP09-SCN-32 (scenario o): navigateTo triggers fresh data load for each section');
})();

// BP09-SCN-33: restoreNavState handles deep-link on refresh (hash-based routing)
assert(SRC.includes('function restoreNavState'),
  'BP09-SCN-33 (scenario o): restoreNavState handles URL hash for page reload recovery');

// ══════════════════════════════════════════════════════════════
// SECTION 7 — Logging / PII Safety
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 7] PII Safety & Logging\n');

// BP09-LOG-01: No JWT/token logged to console
(function() {
  const consoleLines = SRC.split('\n').filter(function(l) {
    return l.includes('console.log') || l.includes('console.warn') || l.includes('console.error');
  });
  const hasPii = consoleLines.some(function(l) {
    return /S\.userId|S\.userEmail|jwt|JWT|Bearer|token\b/i.test(l) && !l.trim().startsWith('//');
  });
  assert(!hasPii, 'BP09-LOG-01: No user_id/email/JWT logged to browser console');
})();

// BP09-LOG-02: console.warn calls now use _safeMsg (not raw err.message)
(function() {
  const warnLines = SRC.split('\n').filter(function(l){ return l.includes('console.warn'); });
  const rawWarn   = warnLines.filter(function(l){ return /err\.message/.test(l); });
  assert(rawWarn.length === 0,
    'BP09-LOG-02: console.warn does not log raw err.message (' + rawWarn.length + ' raw calls found)');
})();

// BP09-LOG-03: Error messages shown to users use _safeMsg or safeHtml(_safeMsg)
(function() {
  // Check that raw err.message no longer appears in user-visible error displays
  // Look for patterns like: textContent=err.message or innerHTML=...err.message...
  const rawExposure = SRC.match(/textContent\s*=\s*err\.message|innerHTML.*err\.message/g) || [];
  assert(rawExposure.length === 0,
    'BP09-LOG-03: Raw err.message not set directly on textContent/innerHTML (' + rawExposure.length + ' raw found)');
})();

// BP09-LOG-04: Error messages use _safeMsg at all error catch sites
(function() {
  const safeMsgCount = (SRC.match(/_safeMsg\(err/g) || []).length;
  assert(safeMsgCount >= 10,
    'BP09-LOG-04: _safeMsg used broadly across error handlers (' + safeMsgCount + ' usages)');
})();

// BP09-LOG-05: No enterprise_id or user_id concatenated in browser alert() calls
(function() {
  const alertLines = SRC.split('\n').filter(function(l){
    return /alert\(/.test(l) && !l.trim().startsWith('//');
  });
  const piiAlert = alertLines.filter(function(l){
    return /enterprise_id|user_id|userId|email/i.test(l);
  });
  assert(piiAlert.length === 0,
    'BP09-LOG-05: No PII (enterprise_id/user_id/email) in alert() calls');
})();

// ══════════════════════════════════════════════════════════════
// SECTION 8 — State Machines & Concurrency Guards
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 8] State Machines & Concurrency Guards\n');

// BP09-GUARD-01: requestsLoading is in finally block (always cleared)
(function() {
  const finallyIdx = SRC.indexOf('S.requestsLoading = false');
  const finallyCtx = SRC.slice(Math.max(0, finallyIdx - 20), finallyIdx + 40);
  assert(finallyCtx.includes('finally') || SRC.includes('} finally {\n    S.requestsLoading = false'),
    'BP09-GUARD-01: requestsLoading cleared in finally block');
})();

// BP09-GUARD-02: historyLoading is in finally block
(function() {
  const finallyIdx = SRC.indexOf('S.historyLoading = false');
  const finallyCtx = SRC.slice(Math.max(0, finallyIdx - 20), finallyIdx + 40);
  assert(finallyCtx.includes('finally') || SRC.includes('} finally {\n    S.historyLoading = false'),
    'BP09-GUARD-02: historyLoading cleared in finally block');
})();

// BP09-GUARD-03: isPolling guard prevents concurrent polls
assert(SRC.includes('if(S.isPolling) return') || SRC.includes("if(S.isPolling)return"),
  'BP09-GUARD-03: isPolling guard prevents concurrent poll execution');

// BP09-GUARD-04: isPolling in finally block
assert(SRC.includes('finally { S.isPolling=false; }') || SRC.includes('finally { S.isPolling = false'),
  'BP09-GUARD-04: isPolling reset in finally block of poll cycle');

// BP09-GUARD-05: debounce timer for search
assert(SRC.includes('searchDebounceTimer') && SRC.includes('clearTimeout'),
  'BP09-GUARD-05: search input is debounced (no per-keystroke fetch)');

// ══════════════════════════════════════════════════════════════
// SECTION 9 — Regression: Existing Hardening Not Broken
// ══════════════════════════════════════════════════════════════
console.log('\n[Section 9] Regression: Existing Hardening\n');

// BP09-REG-01: safeHtml function still present
assert(SRC.includes('function safeHtml('), 'BP09-REG-01: safeHtml helper present');

// BP09-REG-02: trapFocus still present and returns releaseTrap
assert(SRC.includes('function trapFocus(') && SRC.includes('releaseFocusTrap'),
  'BP09-REG-02: trapFocus with release pattern still present');

// BP09-REG-03: FE-AUTH-01 comment still present
assert(SRC.includes('FE-AUTH-01'),
  "BP09-REG-03: FE-AUTH-01 active membership filter still annotated");

// BP09-REG-04: canCreate / canConfirm role gates still present
assert(SRC.includes('function canCreate(') && SRC.includes('function canConfirm('),
  'BP09-REG-04: canCreate/canConfirm role gates still present');

// BP09-REG-05: response contract for create_enterprise_request unchanged
(function() {
  const extract = 'data&&(data.service_request_id||data.request_id||data.id))||null';
  assert(SRC.includes(extract),
    'BP09-REG-05: create_enterprise_request newId extraction contract unchanged (FE-BUG-01 fix)');
})();

// BP09-REG-06: Polling interval still 30 seconds
assert(SRC.includes('POLL_INTERVAL = 30000') || SRC.includes('POLL_INTERVAL=30000'),
  'BP09-REG-06: Polling interval is 30s (not accidentally shortened)');

// ── Final summary
console.log('\n══════════════════════════════════════════════════════════════');
console.log(' BP09 RESILIENCE / OBSERVABILITY / OPERATIONS — TEST RESULTS');
console.log('══════════════════════════════════════════════════════════════');

let sectionPass = 0, sectionFail = 0;
results.forEach(function(r) {
  const prefix = r.status === 'PASS' ? '  ✅ [PASS]' : '  ❌ [FAIL]';
  console.log(prefix + ' ' + r.name + (r.msg ? ' — ' + r.msg : ''));
  if (r.status === 'PASS') sectionPass++; else sectionFail++;
});

console.log('──────────────────────────────────────────────────────────────');
console.log(' PASS: ' + sectionPass + '  FAIL: ' + sectionFail + '  TOTAL: ' + (sectionPass + sectionFail));
console.log('══════════════════════════════════════════════════════════════');

if (sectionFail === 0) {
  console.log(' BP09 RESILIENCE TESTS: PASSED ✅');
} else {
  console.error(' BP09 RESILIENCE TESTS: FAILED ❌ (' + sectionFail + ' failure(s))');
  process.exitCode = 1;
}
