'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createTransport } = require('../../api/diagnostic/transport');

test('transport records request milestones and never retries uncertain quota mutations', async () => {
  let calls = 0;
  const server = createServer((req) => { calls++; req.resume(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const transport = createTransport({ env: { SUPABASE_URL: 'http://127.0.0.1:' + server.address().port, SUPABASE_SERVICE_ROLE_KEY: 'sensitive-test-key' }, requestTimeout: 80 });
    await assert.rejects(transport.rpc('diagnostic_quota_v1', { secret_payload: 'private-payload' }), error => {
      assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
      assert.equal(error.diagnosticTransport.operation, 'quota');
      assert.ok(error.diagnosticTransport.events.some(e => e.phase === 'body_sent'));
      assert.ok(!/sensitive|private|127\.0|Authorization/i.test(JSON.stringify(error.diagnosticTransport)));
      return true;
    });
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('raw error messages, headers, causes and arbitrary codes never reach trace logs', async () => {
  const transport = createTransport({ env: { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'private-key' }, fetchImpl: async () => {
    const cause = Object.assign(new Error('Bearer private-value'), { code: 'PRIVATE_TOKEN' });
    throw new TypeError('private-url?token=private', { cause });
  } });
  await assert.rejects(transport.rpc('diagnostic_quota_v1', {}), error => {
    assert.equal(error.diagnosticTransport.errors.length, 2);
    assert.ok(!/private|bearer|token/i.test(JSON.stringify(error.diagnosticTransport)));
    return true;
  });
});
