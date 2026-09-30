'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const worker = require('../../api/dispatch-whatsapp-worker-fn/index.js');
const webhook = require('../../api/whatsapp-webhook-fn/index.js');

function response() {
  return {
    code: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; },
    send(v) { this.body = v; return this; }
  };
}

function baseWorkerEnv() {
  process.env = {
    ...process.env,
    VERCEL_ENV: 'production',
    DISPATCH_WHATSAPP_WORKER_SECRET: 'w'.repeat(40),
    SUPABASE_URL: 'https://ztwtbgoqanqzvwiibtuh.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    WHATSAPP_SEND_ENABLED: 'false',
    WHATSAPP_WABA_ID: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_GRAPH_API_VERSION: '',
    WHATSAPP_DISPATCH_TEMPLATE_NAME: '',
    WHATSAPP_DISPATCH_TEMPLATE_LANGUAGE: '',
    WHATSAPP_CUTOVER_NOT_BEFORE: ''
  };
}

function enableMetaEnv() {
  Object.assign(process.env, {
    WHATSAPP_SEND_ENABLED: 'true',
    WHATSAPP_WABA_ID: '1392741816131859',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_ACCESS_TOKEN: 'meta-token',
    WHATSAPP_GRAPH_API_VERSION: 'v99.0',
    WHATSAPP_DISPATCH_TEMPLATE_NAME: 'fixeo_nouvelle_mission_v1',
    WHATSAPP_DISPATCH_TEMPLATE_LANGUAGE: 'fr',
    WHATSAPP_CUTOVER_NOT_BEFORE: '2026-10-01T00:00:00Z'
  });
}

test('worker PRE_CUTOVER peeks only and never calls Meta', async () => {
  baseWorkerEnv();
  const seen = [];
  const oldFetch = global.fetch;
  global.fetch = async (url) => {
    seen.push(String(url));
    assert.match(String(url), /dispatch_notification_worker_peek_v1$/);
    return { ok: true, status: 200, text: async () => JSON.stringify([{
      notification_id: '11111111-1111-1111-1111-111111111111',
      request_id: '22222222-2222-2222-2222-222222222222',
      artisan_id: '33333333-3333-3333-3333-333333333333',
      notification_type: 'DISPATCH_REQUEST',
      attempt_count: 0,
      contact_phone: '+212600000000'
    }]) };
  };
  try {
    const res = response();
    await worker({
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.DISPATCH_WHATSAPP_WORKER_SECRET },
      query: {},
      body: {}
    }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.mode, 'PRE_CUTOVER');
    assert.equal(res.body.send_enabled, false);
    assert.equal(res.body.state, 'READY_TO_SEND');
    assert.equal(seen.length, 1);
    assert.equal(JSON.stringify(res.body).includes('212600000000'), false);
  } finally {
    global.fetch = oldFetch;
  }
});

test('worker live success claims, calls Meta template API and finalizes SENT', async () => {
  baseWorkerEnv();
  enableMetaEnv();
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => {
    const u = String(url);
    calls.push({ url: u, body: options?.body });
    if (u.endsWith('/dispatch_notification_worker_next_v2')) {
      const claimBody = JSON.parse(options.body);
      assert.equal(claimBody.p_channel, 'WHATSAPP');
      assert.equal(claimBody.p_not_before, '2026-10-01T00:00:00.000Z');
      return { ok: true, status: 200, text: async () => JSON.stringify([{
        notification_id: '11111111-1111-1111-1111-111111111111',
        request_id: '22222222-2222-2222-2222-222222222222',
        artisan_id: '33333333-3333-3333-3333-333333333333',
        notification_type: 'DISPATCH_REQUEST',
        attempt_count: 1,
        contact_phone: '06 12 34 56 78'
      }]) };
    }
    if (u.includes('graph.facebook.com/')) {
      const body = JSON.parse(options.body);
      assert.equal(body.messaging_product, 'whatsapp');
      assert.equal(body.to, '212612345678');
      assert.equal(body.type, 'template');
      assert.equal(body.template.name, 'fixeo_nouvelle_mission_v1');
      return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: 'wamid.test' }] }) };
    }
    if (u.endsWith('/dispatch_finalize_notification_v1')) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_final_status, 'SENT');
      assert.equal(body.p_provider_message_id, 'wamid.test');
      return { ok: true, status: 200, text: async () => JSON.stringify([{ ok: true }]) };
    }
    throw new Error('unexpected fetch ' + u);
  };
  try {
    const res = response();
    await worker({
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.DISPATCH_WHATSAPP_WORKER_SECRET },
      query: {},
      body: {}
    }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.state, 'SENT');
    assert.equal(res.body.provider_message_id, 'wamid.test');
    assert.equal(calls.length, 3);
  } finally {
    global.fetch = oldFetch;
  }
});

test('worker retries explicit provider 5xx without exceeding attempt guard', async () => {
  baseWorkerEnv();
  enableMetaEnv();
  const oldFetch = global.fetch;
  let retryCalled = false;
  global.fetch = async (url, options) => {
    const u = String(url);
    if (u.endsWith('/dispatch_notification_worker_next_v2')) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{
        notification_id: '11111111-1111-1111-1111-111111111111',
        attempt_count: 1,
        contact_phone: '+212612345678'
      }]) };
    }
    if (u.includes('graph.facebook.com/')) {
      return { ok: false, status: 503, text: async () => JSON.stringify({ error: { code: 2 } }) };
    }
    if (u.endsWith('/dispatch_retry_notification_v1')) {
      retryCalled = true;
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, reason: 'RETRY_SCHEDULED' }) };
    }
    throw new Error('unexpected fetch ' + u);
  };
  try {
    const res = response();
    await worker({
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.DISPATCH_WHATSAPP_WORKER_SECRET },
      query: {},
      body: {}
    }, res);
    assert.equal(res.code, 502);
    assert.equal(res.body.state, 'RETRY_SCHEDULED');
    assert.equal(retryCalled, true);
  } finally {
    global.fetch = oldFetch;
  }
});

test('worker treats network ambiguity as terminal DELIVERY_UNKNOWN, never blind-retries', async () => {
  baseWorkerEnv();
  enableMetaEnv();
  const oldFetch = global.fetch;
  let retryCalled = false;
  let failedCalled = false;
  global.fetch = async (url, options) => {
    const u = String(url);
    if (u.endsWith('/dispatch_notification_worker_next_v2')) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{
        notification_id: '11111111-1111-1111-1111-111111111111',
        attempt_count: 1,
        contact_phone: '+212612345678'
      }]) };
    }
    if (u.includes('graph.facebook.com/')) throw new Error('network');
    if (u.endsWith('/dispatch_retry_notification_v1')) {
      retryCalled = true;
      return { ok: true, status: 200, text: async () => '{}' };
    }
    if (u.endsWith('/dispatch_finalize_notification_v1')) {
      failedCalled = true;
      const body = JSON.parse(options.body);
      assert.equal(body.p_final_status, 'FAILED');
      assert.match(body.p_last_error, /DELIVERY_UNKNOWN/);
      return { ok: true, status: 200, text: async () => '[]' };
    }
    throw new Error('unexpected fetch ' + u);
  };
  try {
    const res = response();
    await worker({
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.DISPATCH_WHATSAPP_WORKER_SECRET },
      query: {},
      body: {}
    }, res);
    assert.equal(res.code, 502);
    assert.equal(res.body.state, 'DELIVERY_UNKNOWN');
    assert.equal(retryCalled, false);
    assert.equal(failedCalled, true);
  } finally {
    global.fetch = oldFetch;
  }
});

test('worker requires explicit Meta config before claiming a live notification', async () => {
  baseWorkerEnv();
  process.env.WHATSAPP_SEND_ENABLED = 'true';
  const oldFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('should not call'); };
  try {
    const res = response();
    await worker({
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.DISPATCH_WHATSAPP_WORKER_SECRET },
      query: {},
      body: {}
    }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.error, 'META_CONFIGURATION_MISSING');
    assert.equal(calls, 0);
  } finally {
    global.fetch = oldFetch;
  }
});

test('webhook GET verification returns Meta challenge only for correct token', async () => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-secret';
  const ok = response();
  await webhook({
    method: 'GET',
    headers: { host: 'www.fixeo.ma' },
    url: '/api/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=12345'
  }, ok);
  assert.equal(ok.code, 200);
  assert.equal(ok.body, '12345');

  const bad = response();
  await webhook({
    method: 'GET',
    headers: { host: 'www.fixeo.ma' },
    url: '/api/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'
  }, bad);
  assert.equal(bad.code, 403);
});

test('webhook PRE_CUTOVER acknowledges POST with zero side effects', async () => {
  process.env.WHATSAPP_WEBHOOK_PROCESS_ENABLED = 'false';
  const oldFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('should not call'); };
  try {
    const res = response();
    await webhook({
      method: 'POST',
      headers: {},
      body: { object: 'whatsapp_business_account' }
    }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.mode, 'PRE_CUTOVER');
    assert.equal(calls, 0);
  } finally {
    global.fetch = oldFetch;
  }
});

test('webhook validates signature and persists canonical status + inbound message once', async () => {
  process.env = {
    ...process.env,
    VERCEL_ENV: 'production',
    WHATSAPP_WEBHOOK_PROCESS_ENABLED: 'true',
    WHATSAPP_APP_SECRET: 'app-secret',
    WHATSAPP_WABA_ID: '1392741816131859',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    SUPABASE_URL: 'https://ztwtbgoqanqzvwiibtuh.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role'
  };

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '1392741816131859',
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: '123456789' },
          statuses: [{
            id: 'wamid.out',
            status: 'delivered',
            timestamp: '1790760000'
          }],
          messages: [{
            id: 'wamid.in',
            from: '212612345678',
            timestamp: '1790760001',
            type: 'text',
            text: { body: 'Bonjour Fixeo' }
          }]
        }
      }]
    }]
  });
  const signature = 'sha256=' + createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(Buffer.from(payload)).digest('hex');

  const oldFetch = global.fetch;
  const rpcNames = [];
  global.fetch = async (url, options) => {
    const u = String(url);
    rpcNames.push(u.split('/').pop());
    const body = JSON.parse(options.body);
    if (u.endsWith('/dispatch_record_whatsapp_status_v1')) {
      assert.equal(body.p_provider_message_id, 'wamid.out');
      assert.equal(body.p_provider_status, 'delivered');
    } else if (u.endsWith('/whatsapp_ingest_inbound_message_v1')) {
      assert.equal(body.p_provider_message_id, 'wamid.in');
      assert.equal(body.p_message_text, 'Bonjour Fixeo');
    } else {
      throw new Error('unexpected fetch ' + u);
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  try {
    const res = response();
    await webhook({
      method: 'POST',
      headers: { 'x-hub-signature-256': signature },
      body: payload
    }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.state, 'EVENT_PROCESSED');
    assert.equal(res.body.statuses_recorded, 1);
    assert.equal(res.body.inbound_recorded, 1);
    assert.deepEqual(rpcNames.sort(), ['dispatch_record_whatsapp_status_v1', 'whatsapp_ingest_inbound_message_v1'].sort());
  } finally {
    global.fetch = oldFetch;
  }
});

test('webhook rejects invalid signature when processing is enabled', async () => {
  process.env = {
    ...process.env,
    VERCEL_ENV: 'production',
    WHATSAPP_WEBHOOK_PROCESS_ENABLED: 'true',
    WHATSAPP_APP_SECRET: 'app-secret',
    WHATSAPP_WABA_ID: '1392741816131859',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    SUPABASE_URL: 'https://ztwtbgoqanqzvwiibtuh.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role'
  };
  const res = response();
  await webhook({
    method: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
    body: JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  }, res);
  assert.equal(res.code, 401);
  assert.equal(res.body.error, 'INVALID_SIGNATURE');
});
