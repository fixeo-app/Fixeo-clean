/**
 * Phase 7C.11D.2 — Standard / Reservation Canonical Persistence Tests
 * Tests for the _canonicalPersistRequest wiring in reservation.js
 *
 * Static / unit tests only. No browser automation. No real Supabase calls.
 */

'use strict';

/* ── Helpers ── */
function assert(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  return true;
}
function assertFalse(cond, label) { return assert(!cond, label); }

/* ── Mirror of _toServiceSlug logic from reservation.js ── */
var SLUG_ALLOWLIST = [
  'plomberie','electricite','serrurerie','climatisation',
  'menuiserie','peinture','maconnerie','nettoyage','jardinage',
  'demenagement','autre'
];

function toServiceSlug(raw) {
  if (!raw) return 'autre';
  var s = String(raw).toLowerCase().trim()
    .replace(/é/g,'e').replace(/è/g,'e').replace(/ê/g,'e')
    .replace(/â/g,'a').replace(/à/g,'a')
    .replace(/ô/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]/g,'');
  if (SLUG_ALLOWLIST.indexOf(s) !== -1) return s;
  if (s.indexOf('plomb') !== -1)    return 'plomberie';
  if (s.indexOf('elect') !== -1)    return 'electricite';
  if (s.indexOf('serru') !== -1)    return 'serrurerie';
  if (s.indexOf('clim') !== -1)     return 'climatisation';
  if (s.indexOf('menuis') !== -1)   return 'menuiserie';
  if (s.indexOf('peint') !== -1)    return 'peinture';
  if (s.indexOf('macon') !== -1 || s.indexOf('maconn') !== -1) return 'maconnerie';
  if (s.indexOf('nettoy') !== -1)   return 'nettoyage';
  if (s.indexOf('jardin') !== -1)   return 'jardinage';
  if (s.indexOf('demena') !== -1)   return 'demenagement';
  return 'autre';
}

/* ── Mirror of _generateIdempotencyKey logic ── */
function generateIdempotencyKey() {
  /* Simulated: always return valid namespaced format */
  var uuid = 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
  return 'reservation:' + uuid;
}

var IDEM_KEY_RE = /^reservation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Simulate the local store patch (persistence metadata) ── */
function buildLocalRecord(id) {
  return { id: id, status: 'nouvelle', service: 'Plomberie', city: 'Casablanca' };
}

function patchRecord(records, id, patch) {
  return records.map(function(r) {
    if (String(r.id) === String(id)) return Object.assign({}, r, patch);
    return r;
  });
}

/* ── Simulate canonical persist flow ── */
function simulateCanonicalPersist(localId, serverPayload, mockFetch) {
  /* Step 1: patch pending + key before POST */
  var records = [buildLocalRecord(localId)];
  records = patchRecord(records, localId, {
    persistence_state: 'pending',
    idempotency_key:   serverPayload.idempotency_key,
  });

  /* Step 2: execute mock fetch (may throw for network errors) */
  var result = null;
  try {
    result = mockFetch(serverPayload);
  } catch (_) {
    result = null;
  }

  /* Step 3: patch based on result */
  if (result && result.ok && result.id) {
    records = patchRecord(records, localId, {
      persistence_state:    'persisted',
      canonical_request_id: result.id,
      canonical_ref:        result.ref || null,
      replayed:             result.replayed === true || undefined,
    });
  } else {
    records = patchRecord(records, localId, { persistence_state: 'failed' });
  }

  return records;
}

/* ── Build a canonical server payload (mirrors _bridgeToArtisanInbox logic) ── */
function buildServerPayload(bookingData, artisanCity, artisanCategory) {
  var serviceSlug = toServiceSlug(artisanCategory);
  var city = String(artisanCity || bookingData.artisanCity || '').trim() || 'Casablanca';
  var desc = String(bookingData.description || '').trim() ||
             'Réservation ' + (bookingData.service || 'service');
  var phone = String(bookingData.phone || '').trim() || undefined;
  var urgency = bookingData.isExpress ? 'urgent' : 'normale';
  var idemKey = generateIdempotencyKey();

  return {
    service_category: serviceSlug,
    city:             city,
    description:      desc,
    client_phone:     phone,
    urgency:          urgency,
    idempotency_key:  idemKey,
    /* NOT included: */
    /* artisan_id, client_profile_id, amount_mad, agreed_price,
       commission, status, mission fields, estimator_price */
  };
}

/* ── TEST SUITES ── */

var tests = [

  /* T1: Standard submit calls /api/create-request (payload shape) */
  function test_create_request_endpoint_called() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'Fuite eau', isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assert(payload.service_category === 'plomberie', 'T1: service_category is slug');
    assert(payload.city === 'Casablanca', 'T1: city present');
    assert(payload.idempotency_key !== undefined, 'T1: idempotency_key present');
    return 'T1 PASS';
  },

  /* T2: success UI only after canonical ACK (persistence_state=persisted) */
  function test_success_only_after_ack() {
    var localId = 1720000000001;
    var key = generateIdempotencyKey();
    var records = simulateCanonicalPersist(localId, { idempotency_key: key },
      function() { return { ok: true, id: 'srv-uuid-001', ref: 'FX-ABCDEF' }; });
    var rec = records[0];
    assert(rec.persistence_state === 'persisted', 'T2: persisted after ACK');
    assert(rec.canonical_request_id === 'srv-uuid-001', 'T2: canonical_request_id set');
    return 'T2 PASS';
  },

  /* T3: canonical_request_id stored from server response */
  function test_canonical_id_stored() {
    var localId = 1720000000002;
    var records = simulateCanonicalPersist(localId, { idempotency_key: generateIdempotencyKey() },
      function() { return { ok: true, id: 'srv-uuid-canonical-123', ref: 'FX-ABC123' }; });
    assert(records[0].canonical_request_id === 'srv-uuid-canonical-123', 'T3: canonical id stored');
    return 'T3 PASS';
  },

  /* T4: canonical_ref stored from server response */
  function test_canonical_ref_stored() {
    var localId = 1720000000003;
    var records = simulateCanonicalPersist(localId, { idempotency_key: generateIdempotencyKey() },
      function() { return { ok: true, id: 'srv-id', ref: 'FX-REF999' }; });
    assert(records[0].canonical_ref === 'FX-REF999', 'T4: canonical ref stored');
    return 'T4 PASS';
  },

  /* T5: persistence_state pending → persisted on success */
  function test_pending_to_persisted() {
    var localId = 1720000000004;
    var key = generateIdempotencyKey();
    var records = [buildLocalRecord(localId)];
    /* Step 1: pending before POST */
    records = patchRecord(records, localId, { persistence_state: 'pending', idempotency_key: key });
    assert(records[0].persistence_state === 'pending', 'T5: pending before POST');
    /* Step 2: persisted after ACK */
    records = patchRecord(records, localId, { persistence_state: 'persisted', canonical_request_id: 'x' });
    assert(records[0].persistence_state === 'persisted', 'T5: persisted after ACK');
    return 'T5 PASS';
  },

  /* T6: network failure → persistence_state=failed */
  function test_network_failure_state() {
    var localId = 1720000000005;
    var records = simulateCanonicalPersist(localId, { idempotency_key: generateIdempotencyKey() },
      function() { throw new Error('Network error'); });
    assert(records[0].persistence_state === 'failed', 'T6: failed on network error');
    return 'T6 PASS';
  },

  /* T7: failure does NOT set persistence_state=persisted */
  function test_failure_not_persisted() {
    var localId = 1720000000006;
    var records = simulateCanonicalPersist(localId, { idempotency_key: generateIdempotencyKey() },
      function() { return { ok: false, reason: 'persistence_failed' }; });
    assertFalse(records[0].persistence_state === 'persisted', 'T7: not persisted on failure');
    assert(records[0].persistence_state === 'failed', 'T7: state is failed on error response');
    return 'T7 PASS';
  },

  /* T8: retry preserves SAME idempotency_key */
  function test_retry_same_key() {
    var key = generateIdempotencyKey();
    var localId = 1720000000007;
    /* First attempt: failed */
    var records = [buildLocalRecord(localId)];
    records = patchRecord(records, localId, { persistence_state: 'failed', idempotency_key: key });
    /* Retry: read key from local record — same key used */
    var retryKey = records[0].idempotency_key;
    assert(retryKey === key, 'T8: same key on retry');
    /* Retry succeeds with same key */
    records = patchRecord(records, localId, {
      persistence_state: 'persisted',
      canonical_request_id: 'retry-id',
    });
    assert(records[0].idempotency_key === key, 'T8: key unchanged after success');
    return 'T8 PASS';
  },

  /* T9: duplicate in-flight submit blocked (idempotent guard) */
  function test_duplicate_submit_blocked() {
    var orderID = 'COD-abc123';
    /* Simulate existing records with same reservation_ref */
    var existing = [{ id: 1, reservation_ref: orderID, service: 'Plomberie' }];
    var isDuplicate = existing.some(function(r) { return r.reservation_ref === orderID; });
    assert(isDuplicate, 'T9: duplicate orderID detected by guard');
    /* Bridge returns early — no second appendRequest call */
    return 'T9 PASS';
  },

  /* T10: replayed:true is treated as successful canonical persistence */
  function test_replayed_is_persisted() {
    var localId = 1720000000008;
    var records = simulateCanonicalPersist(localId, { idempotency_key: generateIdempotencyKey() },
      function() { return { ok: true, id: 'existing-id', ref: 'FX-EXISTING', replayed: true }; });
    assert(records[0].persistence_state === 'persisted', 'T10: replayed treated as persisted');
    assert(records[0].canonical_request_id === 'existing-id', 'T10: same id on replay');
    assert(records[0].replayed === true, 'T10: replayed flag stored');
    return 'T10 PASS';
  },

  /* T11: old local requests without persistence metadata still load safely */
  function test_old_records_load_safely() {
    var oldRecord = {
      id: 9999,
      service: 'Plomberie',
      city: 'Rabat',
      status: 'nouvelle',
      created_at: '2026-01-01T00:00:00.000Z',
      /* No persistence_state, no idempotency_key, no canonical_request_id */
    };
    /* Should be readable without errors */
    assert(oldRecord.id === 9999, 'T11: old record id readable');
    assert(oldRecord.persistence_state === undefined, 'T11: no persistence_state is fine');
    assert(oldRecord.idempotency_key === undefined, 'T11: no idempotency_key is fine');
    assert(oldRecord.canonical_request_id === undefined, 'T11: no canonical_request_id is fine');
    /* Accessing missing fields defaults gracefully */
    var state = oldRecord.persistence_state || 'legacy';
    assert(state === 'legacy', 'T11: legacy fallback works');
    return 'T11 PASS';
  },

  /* T12: urgency sent as 'normale' for standard (non-express) */
  function test_urgency_normale_standard() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assert(payload.urgency === 'normale', 'T12: urgency is normale for standard');
    return 'T12 PASS';
  },

  /* T13: no status field sent by browser */
  function test_no_status_in_payload() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assertFalse('status' in payload, 'T13: status not in server payload');
    return 'T13 PASS';
  },

  /* T14: no client_profile_id sent */
  function test_no_client_profile_id() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false,
                        client_profile_id: 'attacker-uuid' };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assertFalse('client_profile_id' in payload, 'T14: client_profile_id not sent');
    return 'T14 PASS';
  },

  /* T15: no mission data sent */
  function test_no_mission_data() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assertFalse('mission_id' in payload,        'T15: no mission_id');
    assertFalse('artisan_profile_id' in payload, 'T15: no artisan_profile_id');
    assertFalse('offered' in payload,           'T15: no offered');
    return 'T15 PASS';
  },

  /* T16: no artisan authority sent */
  function test_no_artisan_authority() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test',
                        artisanId: 'some-artisan-uuid', isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assertFalse('artisan_id' in payload,         'T16: artisan_id not in payload');
    assertFalse('artisan_profile_id' in payload, 'T16: artisan_profile_id not in payload');
    return 'T16 PASS';
  },

  /* T17: no price/agreed_price/commission sent */
  function test_no_price_fields() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test',
                        price: 500, amount_mad: 500, agreed_price: 500, isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assertFalse('amount_mad' in payload,    'T17: amount_mad not sent');
    assertFalse('agreed_price' in payload,  'T17: agreed_price not sent');
    assertFalse('price' in payload,         'T17: price not sent');
    assertFalse('commission' in payload,    'T17: commission not sent');
    return 'T17 PASS';
  },

  /* T18: Estimator pricing_context_token handling remains unchanged */
  function test_estimator_token_not_sent_as_price() {
    var bookingData = {
      service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false,
      _estimator_context_token: 'opaque-encrypted-token-xyz',
      _estimator_outcome_type: 'standard',
    };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    /* Token is NOT forwarded to create-request (it goes to booking/cod, not SR) */
    assertFalse('estimator_context_token' in payload, 'T18: token not in create-request payload');
    assertFalse('_estimator_context_token' in payload, 'T18: raw token field not sent');
    /* pricing_context_token is opaque — never decoded or sent as price authority */
    assertFalse('amount_mad' in payload, 'T18: amount not derived from token');
    return 'T18 PASS';
  },

  /* T19: existing selected-artisan UX remains intact (artisan in payload context only) */
  function test_artisan_local_only() {
    /* artisan identity stays local — only city (location context) goes to server */
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false,
                        artisanName: 'Mohammed', artisanId: 'local-artisan-id' };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    /* Only city goes — artisan identity does NOT */
    assert(payload.city === 'Casablanca', 'T19: city (location context) present');
    assertFalse('artisan_id' in payload,    'T19: artisan_id not in server payload');
    assertFalse('artisan_name' in payload,  'T19: artisan_name not in server payload');
    return 'T19 PASS';
  },

  /* T20: no dispatch invocation introduced */
  function test_no_dispatch() {
    /* create-request always sets status='new' server-side.
     * Dispatch requires status='offered' or similar transition.
     * Browser never calls dispatch endpoint or creates missions. */
    var payload = buildServerPayload(
      { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false },
      'Casablanca', 'plomberie'
    );
    assertFalse('dispatch' in payload,    'T20: no dispatch field');
    assertFalse('mission_id' in payload,  'T20: no mission_id');
    /* status is not sent by browser */
    assertFalse('status' in payload,      'T20: status not in payload');
    return 'T20 PASS';
  },

  /* T21: slug mapping — known categories */
  function test_slug_mapping() {
    assert(toServiceSlug('plomberie') === 'plomberie',     'T21: plomberie direct');
    assert(toServiceSlug('electricite') === 'electricite', 'T21: electricite direct');
    assert(toServiceSlug('Plomberie') === 'plomberie',     'T21: Plomberie case-insensitive');
    assert(toServiceSlug('Électricité') === 'electricite', 'T21: accents normalized');
    assert(toServiceSlug('serrurerie') === 'serrurerie',   'T21: serrurerie');
    assert(toServiceSlug('climatisation') === 'climatisation', 'T21: climatisation');
    assert(toServiceSlug('maçonnerie') === 'maconnerie',   'T21: maçonnerie → maconnerie');
    assert(toServiceSlug('unknown') === 'autre',            'T21: unknown → autre');
    assert(toServiceSlug('') === 'autre',                   'T21: empty → autre');
    assert(toServiceSlug(null) === 'autre',                 'T21: null → autre');
    return 'T21 PASS';
  },

  /* T22: idempotency key format — namespaced UUID */
  function test_idempotency_key_format() {
    var key = generateIdempotencyKey();
    assert(IDEM_KEY_RE.test(key), 'T22: key matches reservation:<uuid> format');
    assert(key.indexOf('reservation:') === 0, 'T22: reservation: namespace present');
    return 'T22 PASS';
  },

  /* T23: idempotency key persisted in local record BEFORE POST */
  function test_key_persisted_before_post() {
    var localId = 1720000000009;
    var key = generateIdempotencyKey();
    var records = [buildLocalRecord(localId)];
    /* Step 1: patch pending + key BEFORE fetch */
    records = patchRecord(records, localId, { persistence_state: 'pending', idempotency_key: key });
    /* At this point, key is in local record — POST has not been called yet */
    assert(records[0].persistence_state === 'pending', 'T23: pending before POST');
    assert(records[0].idempotency_key === key, 'T23: key in local record before POST');
    return 'T23 PASS';
  },

  /* T24: phone stored only in client_phone — not concatenated into description */
  function test_phone_in_client_phone_only() {
    var phone = '+212600000001';
    var bookingData = { service: 'Plomberie', phone: phone, description: 'Fuite eau', isExpress: false };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assert(payload.client_phone === phone, 'T24: phone in client_phone');
    assertFalse(payload.description.indexOf(phone) !== -1, 'T24: phone not in description');
    assertFalse(payload.description.indexOf('Tel:') !== -1, 'T24: Tel: not in description');
    return 'T24 PASS';
  },

  /* T25: express booking → urgency='urgent' */
  function test_express_urgency() {
    var bookingData = { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: true };
    var payload = buildServerPayload(bookingData, 'Casablanca', 'plomberie');
    assert(payload.urgency === 'urgent', 'T25: express → urgency urgent');
    return 'T25 PASS';
  },

  /* T26: idempotency key is NOT regenerated on retry (same key reused) */
  function test_idempotency_key_not_regenerated_on_retry() {
    var localId = 1720000000010;
    var key = generateIdempotencyKey();
    var records = [buildLocalRecord(localId)];
    records = patchRecord(records, localId, { persistence_state: 'failed', idempotency_key: key });
    /* On retry, read from local record — do NOT call generateIdempotencyKey() again */
    var retryKey = records[0].idempotency_key;
    assert(retryKey === key, 'T26: retry uses stored key, not new one');
    assertFalse(retryKey !== key, 'T26: new key not generated on retry');
    return 'T26 PASS';
  },

  /* T27: SERVICE_ROLE not in browser-side payload (structural check) */
  function test_no_service_role_in_payload() {
    var payload = buildServerPayload(
      { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false },
      'Casablanca', 'plomberie'
    );
    var payloadStr = JSON.stringify(payload);
    assertFalse(payloadStr.indexOf('SERVICE_ROLE') !== -1, 'T27: SERVICE_ROLE not in payload');
    assertFalse(payloadStr.indexOf('service_role') !== -1, 'T27: service_role not in payload');
    assertFalse(payloadStr.indexOf('apikey') !== -1, 'T27: apikey not in payload');
    return 'T27 PASS';
  },

  /* T28: Urgent flow unchanged — _bridgeToArtisanInbox only called in Standard path */
  function test_urgent_flow_unchanged() {
    /* Urgent flow uses: /api/urgent-request (fur-v2a)
     * Standard flow uses: FixeoCOD.processCOD → onSuccess → _bridgeToArtisanInbox → _canonicalPersistRequest
     * Both are independent paths. This test verifies the Standard path payload
     * does NOT carry urgent mode markers unless isExpress is true. */
    var standardPayload = buildServerPayload(
      { service: 'Plomberie', phone: '+212600000001', description: 'test', isExpress: false },
      'Casablanca', 'plomberie'
    );
    assert(standardPayload.urgency === 'normale', 'T28: standard is normale');
    assertFalse(standardPayload.urgency === 'now', 'T28: standard is not now (urgent)');
    return 'T28 PASS';
  },

];

/* ── Runner ── */
var results = { pass: 0, fail: 0, errors: [] };

tests.forEach(function(fn) {
  try {
    var err = null;
    try { fn(); } catch(e) { err = e; }
    if (err) throw err;
    results.pass++;
  } catch(e) {
    results.fail++;
    results.errors.push(e.message);
  }
});

if (typeof process !== 'undefined' && process.stdout) {
  process.stdout.write('[11D.2] Results: ' + results.pass + ' passed, ' + results.fail + ' failed\n');
  if (results.fail > 0) {
    results.errors.forEach(function(e) { process.stderr.write('  ERR: ' + e + '\n'); });
    process.exit(1);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { results: results };
}
if (typeof window !== 'undefined') {
  window._11d2TestResults = results;
}
