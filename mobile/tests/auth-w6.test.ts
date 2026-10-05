import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { assertCallbackUrl, parseAuthCallback, authIssue, createAuthState, routeAllowed } from '../lib/authContract';
const callback = 'https://fixeo-w6-preview.vercel.app/auth-callback';
test('remote callback fails closed without a canonical HTTPS destination', () => {
  for (const bad of [undefined, 'null', 'http://localhost:3000', 'https://127.0.0.1/auth-callback', 'https://10.0.0.1/auth-callback', 'https://fixeo.ma/auth-callback', 'https://staging.fixeo.ma/auth-callback', callback + '#recovery', callback + '?x=1', 'https://user:pass@host.test/auth-callback']) assert.throws(() => assertCallbackUrl(bad));
  assert.equal(assertCallbackUrl(callback), callback);
});
test('callback binds web origin, rejects bearer fragments and accepts only authorization codes', () => {
  assert.equal(parseAuthCallback(callback + '?code=code-for-local-contract', callback).error, null);
  assert.equal(parseAuthCallback('fixeo://auth-callback?code=code-for-local-contract', callback).error, null);
  assert.equal(parseAuthCallback('https://unrelated.test/auth-callback?code=code-for-local-contract', callback).error, 'callback');
  for (const key of ['access_token', 'refresh_token']) {
    const parsed = parseAuthCallback(callback + '#' + key + '=synthetic-test-value');
    assert.equal(parsed.legacyTokenRejected, true); assert.equal(parsed.code, '');
  }
});
test('pre-router callback scrubs the URL and discards legacy tokens before any SDK', () => {
  const script = readFileSync('public/auth-return.js', 'utf8');
  for (const legacy of [true, false]) {
    const location = new URL(callback + (legacy ? '#access_token=synthetic-test-value&refresh_token=synthetic-test-value' : '?code=code-for-local-contract'));
    let replaced = ''; const window: Record<string, unknown> = {};
    vm.runInNewContext(script, { location, URLSearchParams, window, history: { replaceState: (_: unknown, _title: string, path: string) => { replaced = path; } } });
    assert.equal(replaced, '/auth-callback');
    assert.doesNotMatch(JSON.stringify(window), /synthetic-test-value|access_token|refresh_token/);
    assert.equal(parseAuthCallback(String(window.__FIXEO_AUTH_CALLBACK)).error, legacy ? 'callback' : null);
  }
});
test('late Artisan bootstrap cannot publish after logout or replace a Client identity', async () => {
  const state = createAuthState(); const artisanEpoch = state.invalidate();
  state.invalidate('signed_out');
  assert.equal(routeAllowed('/artisan', state.snapshot()), false);
  const clientEpoch = state.invalidate();
  state.publish(clientEpoch, { phase: 'ready', userId: 'synthetic-client', role: 'client', issue: null });
  assert.equal(state.publish(artisanEpoch, { phase: 'ready', userId: 'synthetic-artisan', role: 'artisan', issue: null }), false);
  assert.equal(state.snapshot().userId, 'synthetic-client');
  assert.equal(routeAllowed('/client-mission/test', state.snapshot()), true);
  assert.equal(routeAllowed('/mission/test', state.snapshot()), false);
  state.invalidate('signed_out', 'revoked');
  assert.equal(state.snapshot().userId, null); assert.equal(routeAllowed('/', state.snapshot()), false);
});
test('unknown, resolving, offline, recovery and invalid-role states mount no private universe', () => {
  const state = createAuthState();
  for (const phase of ['unknown', 'resolving', 'blocked', 'recovery', 'signed_out'] as const) {
    state.invalidate(phase);
    for (const path of ['/', '/artisan', '/mission/a', '/client-workspace/account', '/artisan-workspace/finance']) assert.equal(routeAllowed(path, state.snapshot()), false);
  }
  const epoch = state.invalidate(); state.publish(epoch, { phase: 'ready', userId: 'synthetic', role: 'admin', issue: null });
  assert.equal(routeAllowed('/', state.snapshot()), false);
});
test('Auth failure categories remain actionable without exposing backend messages', () => {
  for (const [code, issue] of [['over_email_send_rate_limit', 'rate_limit'], ['email_not_confirmed', 'unconfirmed'], ['session_not_found', 'revoked'], ['otp_expired', 'expired'], ['bad_code_verifier', 'callback'], ['INVALID_CREDENTIALS', 'credentials'], ['USER_BANNED', 'disabled'], ['ROLE_INVALID', 'role'], ['MOBILE_UI_TIMEOUT', 'network']]) assert.equal(authIssue({ code }), issue);
});
