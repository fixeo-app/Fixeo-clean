'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  confirmCritical,
  ACK_VERSION,
} = require('../../api/diagnostic/critical-request');
const { RISK_VERSION } = require('../../api/diagnostic/safety');
const { createHandler } = require('../../api/diagnostic');
const { config } = require('../../api/diagnostic/config');
const id = 'dc986e10-b315-4000-8000-2d458b457704',
  runId = 'ed986e10-b315-4000-8000-2d458b457705';
const env = {
  NODE_ENV: 'test',
  FIXEO_ESTIMATOR_SECRET: 'test-only-estimator-key'.repeat(2),
  FIXEO_DIAGNOSTIC_SECRET: 'test-only-diagnostic-key'.repeat(2),
};
const data = () => ({
  session: {
    id,
    revision: 2,
    selected_run_id: runId,
    state: 'ready',
    input: { description: 'Odeur de gaz.', safety_signals: ['gas'] },
  },
  run: {
    id: runId,
    revision: 2,
    state: 'complete',
    result: {
      safety: { version: RISK_VERSION, level: 'CRITICAL', stop: true },
      trade: { value: 'plomberie' },
    },
  },
});
const body = () => ({
  action: 'confirm_critical',
  session_id: id,
  revision: 2,
  client_phone: '06 00 00 00 00',
  acknowledgement: { version: ACK_VERSION, accepted: true, run_id: runId },
});

test('critical registration requires explicit acknowledgement of the exact immutable result', async () => {
  for (const change of [
    (b) => delete b.acknowledgement,
    (b) => (b.acknowledgement.accepted = false),
    (b) => (b.acknowledgement.accepted = 'true'),
    (b) => (b.acknowledgement.version = 'other'),
    (b) => (b.acknowledgement.run_id = id),
  ]) {
    const b = body();
    change(b);
    await assert.rejects(
      confirmCritical({
        body: b,
        data: data(),
        actor: 'fixture',
        env,
        transport: {
          rpc() {
            assert.fail('No registration without acknowledgement');
          },
        },
      }),
      /SAFETY_ACKNOWLEDGEMENT_REQUIRED/,
    );
  }
});

test('old dossiers, noncritical results, stale revisions and invalid phone cannot use critical registration', async () => {
  for (const change of [
    (d) => (d.run.result.safety.version = 'fixeo-safety-v1'),
    (d) => (d.run.result.safety.level = 'URGENT'),
    (d) => (d.run.result.safety.stop = false),
    (d) => (d.run.state = 'running'),
    (d) => d.session.revision++,
    (d) => (d.session.selected_run_id = id),
  ]) {
    const d = data();
    change(d);
    await assert.rejects(
      confirmCritical({
        body: body(),
        data: d,
        actor: 'fixture',
        env,
        transport: {
          rpc() {
            assert.fail();
          },
        },
      }),
      /DIAGNOSTIC_NOT_QUALIFIED/,
    );
  }
  await assert.rejects(
    confirmCritical({
      body: { ...body(), client_phone: 'bad' },
      data: data(),
      actor: 'fixture',
      env,
      transport: {},
    }),
    /INVALID_PHONE/,
  );
});

test('acknowledged critical API uses existing quota gates and one atomic registration RPC; never calls pricing, AI or direct dispatch', async () => {
  const calls = [],
    cfg = { ...config(env), enabled: true },
    original = data();
  const handler = createHandler({
    env,
    cfg,
    logger: { warn() {} },
    mediaStore: {},
    transport: {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'diagnostic_quota_v1') return {};
        if (name === 'diagnostic_state_v1') {
          assert.equal(args.p_action, 'get');
          return original;
        }
        assert.equal(name, 'create_diagnostic_critical_request_v1');
        assert.equal(args.p_diagnostic.acknowledged, true);
        assert.equal(args.p_ack_version, ACK_VERSION);
        assert.equal(args.p_client_phone, '0600000000');
        assert.match(args.p_guest_token_hash, /^[0-9a-f]{64}$/);
        return {
          ok: true,
          request_id: 'fixture-request',
          tracking_ref: args.p_tracking_ref,
        };
      },
    },
  });
  const req = {
    method: 'POST',
    headers: {
      origin: cfg.origin,
      'content-type': 'application/json',
      'x-fixeo-diagnostic': '1',
      cookie: cfg.cookie + '=' + 'a'.repeat(64),
    },
    body: body(),
  };
  const res = {
    setHeader() {},
    status(status) {
      this.code = status;
      return this;
    },
    json(value) {
      this.value = value;
      return this;
    },
  };
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.value.risk_level, 'CRITICAL');
  assert.equal(res.value.urgency, 'now');
  assert.equal(
    original.run.result.safety.stop,
    true,
    'Acknowledgement never clears danger',
  );
  assert.deepEqual(
    calls.map((c) => c.name),
    [
      'diagnostic_quota_v1',
      'diagnostic_quota_v1',
      'diagnostic_state_v1',
      'create_diagnostic_critical_request_v1',
    ],
  );
  const token = res.value.guest_token;
  await handler(req, res);
  assert.equal(
    res.value.guest_token,
    token,
    'Stable ownership on a lost-response retry',
  );
});
