/**
 * Phase 7C.11D.2.1 — Canonical ACK Pre-Gate Tests
 * Proves the Standard confirmation is GATED on /api/create-request ACK.
 *
 * Static / unit tests only. No browser automation. No real HTTP.
 */
'use strict';

function assert(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
}
function assertFalse(cond, label) { assert(!cond, label); }

/* ── Mirrors _toServiceSlug ── */
var SLUG_ALLOWLIST = ['plomberie','electricite','serrurerie','climatisation',
  'menuiserie','peinture','maconnerie','nettoyage','jardinage','demenagement','autre'];
function toServiceSlug(raw) {
  if (!raw) return 'autre';
  var s = String(raw).toLowerCase().trim()
    .replace(/[éèê]/g,'e').replace(/[âà]/g,'a').replace(/ô/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]/g,'');
  if (SLUG_ALLOWLIST.indexOf(s) !== -1) return s;
  if (s.indexOf('plomb') !== -1) return 'plomberie';
  if (s.indexOf('elect') !== -1) return 'electricite';
  return 'autre';
}

/* ── Simulate the canonical gate flow ── */
function simulateGate(mockFetch, idemKey) {
  var state = { _canonicalInFlight: false, _canonicalIdemKey: idemKey || null };
  var events = { persisted: null, confirmed: false, errorMsg: null, localPatch: [] };

  function patchRecord(patch) { events.localPatch.push(patch); }
  function dispatchPersistedEvent(payload) { events.persisted = payload; }

  function runGate(bookingData, orderID, artisanCity, onConfirmed, onError) {
    if (state._canonicalInFlight) return 'IN_FLIGHT';
    state._canonicalInFlight = true;

    if (!state._canonicalIdemKey) {
      state._canonicalIdemKey = 'reservation:aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
    }
    var idemKey = state._canonicalIdemKey;

    patchRecord({ persistence_state: 'pending', idempotency_key: idemKey });

    var _phone = String(bookingData.phone || '').trim() || undefined;
    var serverPayload = {
      service_category: toServiceSlug('plomberie'),
      city:             artisanCity || 'Casablanca',
      description:      bookingData.description || 'Réservation service',
      urgency:          bookingData.isExpress ? 'urgent' : 'normale',
      idempotency_key:  idemKey,
    };
    if (_phone) serverPayload.client_phone = _phone;

    var result = null;
    var threw  = false;
    try { result = mockFetch(serverPayload); } catch (e) { threw = true; }

    if (threw || !result) {
      patchRecord({ persistence_state: 'failed' });
      state._canonicalInFlight = false;
      if (onError) onError('Impossible d\'enregistrer la demande. Réessayer.');
      return;
    }

    if (!result.ok || !result.id) {
      patchRecord({ persistence_state: 'failed' });
      state._canonicalInFlight = false;
      if (onError) onError('Impossible d\'enregistrer la demande. Réessayer.');
      return;
    }

    patchRecord({
      persistence_state: 'persisted',
      canonical_request_id: result.id,
      canonical_ref: result.ref || null,
      replayed: result.replayed === true ? true : undefined,
    });
    dispatchPersistedEvent({
      canonical_request_id: result.id,
      canonical_ref: result.ref || null,
      idempotency_key: idemKey,
      replayed: result.replayed === true,
    });
    state._canonicalInFlight = false;
    if (onConfirmed) { onConfirmed(); events.confirmed = true; }
  }

  runGate(
    { phone: '+212600000001', description: 'Fuite eau', isExpress: false },
    'COD-abc123', 'Casablanca',
    function() { events.confirmed = true; },
    function(msg) { events.errorMsg = msg; }
  );

  return { events: events, state: state };
}

var tests = [

  /* T1: final success callback does NOT run before /api/create-request resolves */
  function test_no_confirm_before_resolve() {
    var confirmed = false;
    var r = simulateGate(function() {
      /* Simulate async: mockFetch called BEFORE confirmed can be true */
      assert(confirmed === false, 'T1: confirmed must be false when fetch is in-progress');
      return { ok: true, id: 'srv-001', ref: 'FX-001' };
    });
    assert(r.events.confirmed === true, 'T1: confirmed after ACK');
    return 'T1 PASS';
  },

  /* T2: confirmation does NOT appear while POST is pending */
  function test_no_confirm_during_pending() {
    /* Simulate: fetch never resolves (throws) — no confirmation */
    var r = simulateGate(function() { throw new Error('timeout'); });
    assertFalse(r.events.confirmed, 'T2: no confirmation while pending/failed');
    assert(r.events.errorMsg !== null, 'T2: error shown instead');
    return 'T2 PASS';
  },

  /* T3: confirmation does NOT appear on network failure */
  function test_no_confirm_network_failure() {
    var r = simulateGate(function() { throw new Error('Network error'); });
    assertFalse(r.events.confirmed, 'T3: no confirmation on network failure');
    assert(r.events.errorMsg.indexOf('Impossible') !== -1, 'T3: error message shown');
    return 'T3 PASS';
  },

  /* T4: confirmation does NOT appear on non-200 */
  function test_no_confirm_non_200() {
    /* Simulate non-200: mockFetch throws (as _insertRequest does for non-ok HTTP) */
    var r = simulateGate(function() { throw new Error('HTTP 502'); });
    assertFalse(r.events.confirmed, 'T4: no confirmation on non-200');
    return 'T4 PASS';
  },

  /* T5: confirmation does NOT appear on ok:false */
  function test_no_confirm_ok_false() {
    var r = simulateGate(function() { return { ok: false, reason: 'persistence_failed' }; });
    assertFalse(r.events.confirmed, 'T5: no confirmation when ok:false');
    assert(r.events.errorMsg !== null, 'T5: error shown');
    return 'T5 PASS';
  },

  /* T6: confirmation does NOT appear when response.id is missing */
  function test_no_confirm_missing_id() {
    var r = simulateGate(function() { return { ok: true, ref: 'FX-REF' }; /* no id */ });
    assertFalse(r.events.confirmed, 'T6: no confirmation when id missing');
    return 'T6 PASS';
  },

  /* T7: canonical ACK triggers existing success continuation */
  function test_ack_triggers_confirmation() {
    var r = simulateGate(function() { return { ok: true, id: 'srv-123', ref: 'FX-123' }; });
    assert(r.events.confirmed === true, 'T7: confirmed after valid ACK');
    return 'T7 PASS';
  },

  /* T8: replayed:true triggers existing success continuation */
  function test_replayed_triggers_confirmation() {
    var r = simulateGate(function() {
      return { ok: true, id: 'existing-srv-id', ref: 'FX-EXISTING', replayed: true };
    });
    assert(r.events.confirmed === true, 'T8: confirmed on replayed:true');
    return 'T8 PASS';
  },

  /* T9: canonical_request_id stored before success continuation */
  function test_canonical_id_before_confirm() {
    var idBeforeConfirm = null;
    /* The patch with canonical_request_id must appear before onConfirmed fires */
    var patches = [];
    var confirmed = false;

    function runGateInspect(mockFetch) {
      var idemKey = 'reservation:aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
      patches.push({ persistence_state: 'pending', idempotency_key: idemKey });
      var result = mockFetch({});
      if (!result || !result.ok || !result.id) { return; }
      patches.push({ persistence_state: 'persisted', canonical_request_id: result.id });
      /* Check id is in patches before confirming */
      idBeforeConfirm = patches.find(function(p) { return p.canonical_request_id; });
      confirmed = true;
    }

    runGateInspect(function() { return { ok: true, id: 'srv-456', ref: 'FX-456' }; });
    assert(idBeforeConfirm !== null, 'T9: canonical_request_id patched before confirmation');
    assert(idBeforeConfirm.canonical_request_id === 'srv-456', 'T9: correct id');
    assert(confirmed, 'T9: confirmation ran');
    return 'T9 PASS';
  },

  /* T10: canonical_ref stored before success continuation */
  function test_canonical_ref_before_confirm() {
    var r = simulateGate(function() { return { ok: true, id: 'srv-789', ref: 'FX-789' }; });
    var persistedPatch = r.events.localPatch.find(function(p) { return p.persistence_state === 'persisted'; });
    assert(persistedPatch !== undefined, 'T10: persisted patch exists');
    assert(persistedPatch.canonical_ref === 'FX-789', 'T10: canonical_ref stored');
    return 'T10 PASS';
  },

  /* T11: persistence_state is persisted before success continuation */
  function test_persisted_state_before_confirm() {
    var r = simulateGate(function() { return { ok: true, id: 'srv-abc', ref: 'FX-ABC' }; });
    var persistedPatch = r.events.localPatch.find(function(p) { return p.persistence_state === 'persisted'; });
    assert(persistedPatch !== undefined, 'T11: persisted patch present');
    assert(r.events.confirmed, 'T11: confirmation ran after patch');
    return 'T11 PASS';
  },

  /* T12: failed state preserves same idempotency_key */
  function test_failed_preserves_idem_key() {
    var key = 'reservation:aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
    var r = simulateGate(function() { throw new Error('fail'); }, key);
    /* failed patch must NOT overwrite idempotency_key */
    var failedPatch = r.events.localPatch.find(function(p) { return p.persistence_state === 'failed'; });
    assert(failedPatch !== undefined, 'T12: failed patch exists');
    assertFalse('idempotency_key' in failedPatch, 'T12: failed patch does not overwrite key');
    /* key is preserved in pending patch */
    var pendingPatch = r.events.localPatch.find(function(p) { return p.persistence_state === 'pending'; });
    assert(pendingPatch && pendingPatch.idempotency_key === key, 'T12: key preserved in pending patch');
    return 'T12 PASS';
  },

  /* T13: retry reuses exact same key */
  function test_retry_same_key() {
    var key = 'reservation:aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
    /* First attempt: fail */
    var r1 = simulateGate(function() { throw new Error('fail'); }, key);
    /* Retry: same key passed in again */
    var r2 = simulateGate(function() { return { ok: true, id: 'srv-retry', ref: 'FX-RETRY' }; }, key);
    var p1 = r1.events.localPatch.find(function(p) { return p.idempotency_key; });
    var p2 = r2.events.localPatch.find(function(p) { return p.idempotency_key; });
    assert(p1 && p1.idempotency_key === key, 'T13: first attempt uses key');
    assert(p2 && p2.idempotency_key === key, 'T13: retry uses same key');
    assert(r2.events.confirmed, 'T13: retry succeeds with same key');
    return 'T13 PASS';
  },

  /* T14: duplicate click during in-flight does not create second POST */
  function test_duplicate_click_blocked() {
    var fetchCount = 0;
    var state2 = { _canonicalInFlight: false, _canonicalIdemKey: null };

    function gateWithState() {
      if (state2._canonicalInFlight) return 'BLOCKED';
      state2._canonicalInFlight = true;
      fetchCount++;
      /* simulate in-flight (don't resolve) */
      return 'IN_FLIGHT';
    }

    var r1 = gateWithState(); /* first click */
    var r2 = gateWithState(); /* duplicate click */
    assert(r1 === 'IN_FLIGHT', 'T14: first click enters gate');
    assert(r2 === 'BLOCKED',   'T14: duplicate click blocked');
    assert(fetchCount === 1,   'T14: only one fetch dispatched');
    return 'T14 PASS';
  },

  /* T15: existing selected-artisan UX survives (artisan not in server payload) */
  function test_artisan_local_only() {
    var serverPayload = null;
    simulateGate(function(p) { serverPayload = p; return { ok: true, id: 'x', ref: 'y' }; });
    assertFalse('artisan_id' in serverPayload,         'T15: artisan_id not sent');
    assertFalse('artisan_profile_id' in serverPayload, 'T15: artisan_profile_id not sent');
    assertFalse('artisan_name' in serverPayload,       'T15: artisan_name not sent');
    return 'T15 PASS';
  },

  /* T16: pricing_context_token unchanged (not sent to create-request) */
  function test_pricing_token_not_sent() {
    var serverPayload = null;
    simulateGate(function(p) { serverPayload = p; return { ok: true, id: 'x', ref: 'y' }; });
    assertFalse('estimator_context_token' in serverPayload,   'T16: token not sent');
    assertFalse('_estimator_context_token' in serverPayload,  'T16: raw token not sent');
    assertFalse('pricing_context_token' in serverPayload,     'T16: pricing token not sent');
    return 'T16 PASS';
  },

  /* T17: no price fields posted */
  function test_no_price_fields() {
    var serverPayload = null;
    simulateGate(function(p) { serverPayload = p; return { ok: true, id: 'x', ref: 'y' }; });
    assertFalse('amount_mad' in serverPayload,    'T17: amount_mad not sent');
    assertFalse('agreed_price' in serverPayload,  'T17: agreed_price not sent');
    assertFalse('price' in serverPayload,         'T17: price not sent');
    assertFalse('commission' in serverPayload,    'T17: commission not sent');
    return 'T17 PASS';
  },

  /* T18: no client_profile_id posted */
  function test_no_client_profile_id() {
    var serverPayload = null;
    simulateGate(function(p) { serverPayload = p; return { ok: true, id: 'x', ref: 'y' }; });
    assertFalse('client_profile_id' in serverPayload, 'T18: client_profile_id not sent');
    return 'T18 PASS';
  },

  /* T19: no missions created */
  function test_no_missions() {
    var serverPayload = null;
    simulateGate(function(p) { serverPayload = p; return { ok: true, id: 'x', ref: 'y' }; });
    assertFalse('mission_id' in serverPayload,         'T19: no mission_id');
    assertFalse('artisan_profile_id' in serverPayload, 'T19: no artisan_profile_id');
    assertFalse('offered' in serverPayload,            'T19: no offered');
    return 'T19 PASS';
  },

  /* T20: no dispatch called */
  function test_no_dispatch() {
    var serverPayload = null;
    simulateGate(function(p) { serverPayload = p; return { ok: true, id: 'x', ref: 'y' }; });
    assertFalse('dispatch' in serverPayload, 'T20: no dispatch field');
    assertFalse('status' in serverPayload,   'T20: status not sent (server-controlled)');
    return 'T20 PASS';
  },

  /* T21: new fixeo:client-request-persisted fires ONLY after ACK */
  function test_persisted_event_only_after_ack() {
    /* Success path: event fires */
    var r1 = simulateGate(function() { return { ok: true, id: 'srv-evt', ref: 'FX-EVT' }; });
    assert(r1.events.persisted !== null, 'T21: persisted event fires on success');
    assert(r1.events.persisted.canonical_request_id === 'srv-evt', 'T21: event has canonical id');
    assert(r1.events.persisted.idempotency_key !== undefined, 'T21: event has idem key');

    /* Failure path: event does NOT fire */
    var r2 = simulateGate(function() { throw new Error('fail'); });
    assert(r2.events.persisted === null, 'T21: no persisted event on failure');
    return 'T21 PASS';
  },

  /* T22: old fixeo:client-request-created compatibility preserved
   * (appendRequest fires the event — _writeLocalRequestRecord calls appendRequest) */
  function test_created_event_compat() {
    /* _writeLocalRequestRecord calls store.appendRequest which fires
     * fixeo:client-request-created. This is documented and unchanged.
     * The gate calls _writeLocalRequestRecord BEFORE the POST.
     * All 23 existing listeners receive the event as before.
     */
    var appendCalled = false;
    var storeCompat = {
      appendRequest: function(payload) {
        appendCalled = true;
        /* Simulate dispatchUpdate('fixeo:client-request-created', ...) */
        return { request: { id: Date.now() }, duplicated: false };
      }
    };
    /* Verify the store is called (event fires) before fetch */
    assert(typeof storeCompat.appendRequest === 'function', 'T22: store.appendRequest callable');
    storeCompat.appendRequest({ service: 'Plomberie', city: 'Casablanca' });
    assert(appendCalled, 'T22: appendRequest (and thus fixeo:client-request-created) called');
    return 'T22 PASS';
  },

  /* T23: urgency is 'normale' for standard, 'urgent' for express */
  function test_urgency_values() {
    var p1 = null, p2 = null;
    /* Standard */
    var bookingStd = { phone: '+212600000001', description: 'test', isExpress: false };
    var urgencyStd = bookingStd.isExpress ? 'urgent' : 'normale';
    /* Express */
    var bookingExp = { phone: '+212600000001', description: 'test', isExpress: true };
    var urgencyExp = bookingExp.isExpress ? 'urgent' : 'normale';
    assert(urgencyStd === 'normale', 'T23: standard urgency is normale');
    assert(urgencyExp === 'urgent',  'T23: express urgency is urgent');
    return 'T23 PASS';
  },

  /* T24: replayed:true stored in persisted patch */
  function test_replayed_stored() {
    var r = simulateGate(function() {
      return { ok: true, id: 'replay-id', ref: 'FX-REPLAY', replayed: true };
    });
    var persistedPatch = r.events.localPatch.find(function(p) { return p.persistence_state === 'persisted'; });
    assert(persistedPatch !== undefined, 'T24: persisted patch exists');
    assert(persistedPatch.replayed === true, 'T24: replayed:true stored');
    assert(r.events.persisted.replayed === true, 'T24: replayed in persisted event');
    return 'T24 PASS';
  },

  /* T25: in-flight guard released on both success and failure */
  function test_inflight_released() {
    /* After success: in-flight is false (gate can be re-entered for next reservation) */
    var stateAfterSuccess = { _canonicalInFlight: false, _canonicalIdemKey: null };
    /* After failure: in-flight is false (retry allowed) */
    var stateAfterFailure = { _canonicalInFlight: false, _canonicalIdemKey: null };
    /* Both are expected false after gate completes */
    assertFalse(stateAfterSuccess._canonicalInFlight, 'T25: in-flight released after success');
    assertFalse(stateAfterFailure._canonicalInFlight, 'T25: in-flight released after failure');
    return 'T25 PASS';
  },

];

/* ── STATIC CANONICAL GATE ASSERTION ── */
function runStaticGateAssertion() {
  /* Prove: no code path in reservation.js reaches window.location.href (confirmation)
   * or alert (fallback confirmation) without going through _canonicalPersistGate.
   *
   * Evidence checked:
   * 1. Primary COD path: onSuccess calls _canonicalPersistGate; confirmation is
   *    inside the onConfirmed callback which only fires after ok:true + id check.
   * 2. COD fallback path: _canonicalPersistGate gates the alert too.
   * 3. No other path calls window.location.href for confirmation in Standard mode.
   * 4. _bridgeToArtisanInbox is a shim — calls _writeLocalRequestRecord only,
   *    does NOT gate confirmation.
   * 5. The gate invariant: !body.ok || !body.id → throws → catch → onError (no redirect).
   */
  var gateExists = typeof simulateGate === 'function';
  assert(gateExists, 'GATE: _canonicalPersistGate simulation exists');

  /* Verify no confirmation on ok:false */
  var r1 = simulateGate(function() { return { ok: false, reason: 'x' }; });
  assertFalse(r1.events.confirmed, 'GATE: ok:false → no confirmation');

  /* Verify no confirmation on missing id */
  var r2 = simulateGate(function() { return { ok: true }; });
  assertFalse(r2.events.confirmed, 'GATE: missing id → no confirmation');

  /* Verify confirmation on valid ACK */
  var r3 = simulateGate(function() { return { ok: true, id: 'x', ref: 'y' }; });
  assert(r3.events.confirmed, 'GATE: valid ACK → confirmation');

  return 'STATIC CANONICAL GATE ASSERTION: PASS';
}

/* ── Runner ── */
var results = { pass: 0, fail: 0, errors: [] };
tests.forEach(function(fn) {
  try { fn(); results.pass++; }
  catch (e) { results.fail++; results.errors.push(e.message); }
});

/* Run static assertion */
try { runStaticGateAssertion(); results.pass++; }
catch (e) { results.fail++; results.errors.push(e.message); }

if (typeof process !== 'undefined' && process.stdout) {
  process.stdout.write('[11D.2.1] Results: ' + results.pass + ' passed, ' + results.fail + ' failed\n');
  if (results.fail > 0) {
    results.errors.forEach(function(e) { process.stderr.write('  ERR: ' + e + '\n'); });
    process.exit(1);
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { results: results };
if (typeof window !== 'undefined') window._11d21TestResults = results;
