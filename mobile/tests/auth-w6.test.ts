import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { assertCallbackUrl, parseAuthCallback, authIssue, createAuthState, routeAllowed } from '../lib/authContract';
const callback = 'https://w6-auth-staging.fixeo.ma/auth-callback';
test('callback configuration accepts only the exact certified staging URL', () => {
  for (const bad of [
    undefined, '', 'null', 'http://localhost:3000', 'https://localhost/auth-callback',
    'https://127.0.0.1/auth-callback', 'https://10.0.0.1/auth-callback',
    'https://192.168.1.1/auth-callback', 'https://172.16.0.1/auth-callback',
    'https://[::1]/auth-callback', 'https://fixeo.ma/auth-callback',
    'https://www.fixeo.ma/auth-callback', 'https://staging.fixeo.ma/auth-callback',
    'https://fixeo-w6-preview.vercel.app/auth-callback', 'https://unrelated.test/auth-callback',
    callback.replace('https:', 'http:'), callback.replace('https://', 'https://user:pass@'),
    callback + '#recovery', callback + '?x=1', callback + '?', callback + '#',
    callback + '/', callback.replace('/auth-callback', '/entry'), ' ' + callback,
    callback.replace('.ma/', '.ma:443/'), callback.replace('/auth-callback', '/%61uth-callback'),
  ]) assert.throws(() => assertCallbackUrl(bad), `Must reject ${bad}`);
  assert.equal(assertCallbackUrl(callback), callback);
});
test('unapproved callback blocks both signup and recovery before any Auth request', async () => {
  const source = ts.transpileModule(readFileSync('lib/authFlows.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const approved of [undefined, '', 'false', 'TRUE']) {
    let requests = 0;
    const exports: Record<string, any> = {};
    vm.runInNewContext(source, { exports, process: { env: {
      EXPO_PUBLIC_AUTH_CALLBACK_URL: callback, EXPO_PUBLIC_AUTH_CALLBACK_APPROVED: approved,
    } }, require: (name: string) => name === './authContract' ? { assertCallbackUrl, parseAuthCallback }
      : name === './supabase' ? { supabase: { auth: new Proxy({}, { get: () => () => { requests++; throw new Error('UNEXPECTED_AUTH_REQUEST'); } }) } } : {} });
    await assert.rejects(exports.requestRecovery('fixture@example.invalid'), /AUTH_CALLBACK_NOT_APPROVED/);
    await assert.rejects(exports.createAccount({ role: 'client', name: 'Synthetic', email: 'fixture@example.invalid', password: 'synthetic-test-only' }), /AUTH_CALLBACK_NOT_APPROVED/);
    assert.equal(requests, 0);
  }
});
test('export activates the exact callback only for the W6 Preview branch', () => {
  const script = readFileSync('scripts/w6-web-export.cjs', 'utf8');
  const branch = 'feat/fixeo-mobile-w6-entry-auth-trust';
  for (const [environment, ref, allowed] of [
    ['preview', branch, true], ['production', branch, false], ['development', branch, false],
    ['preview', 'main', false], ['preview', branch + '-other', false], [undefined, branch, false],
  ] as const) {
    let spawned = 0;
    const env = { VERCEL_ENV: environment, VERCEL_GIT_COMMIT_REF: ref,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_contract_only',
      VERCEL_BRANCH_URL: 'old-protected-preview.vercel.app',
      EXPO_PUBLIC_AUTH_CALLBACK_URL: 'http://localhost:3000', EXPO_PUBLIC_AUTH_CALLBACK_APPROVED: 'false' };
    const run = () => vm.runInNewContext(script, { process: { env, execPath: 'node' }, require: (name: string) =>
      name === 'node:child_process' ? { spawnSync: (_: string, args: string[], options: { env: Record<string, string> }) => {
        spawned++; assert.equal(options.env.EXPO_PUBLIC_AUTH_CALLBACK_URL, callback);
        assert.equal(options.env.EXPO_PUBLIC_AUTH_CALLBACK_APPROVED, 'true');
        assert.equal(options.env.EXPO_PUBLIC_SUPABASE_URL, 'https://kqyhusnbybsukbcaoqtu.supabase.co');
        assert.ok(args.includes('web')); return { status: 0 };
      } } : { readFileSync: () => '<head></head>', writeFileSync: () => undefined } });
    if (allowed) { run(); assert.equal(spawned, 1); }
    else { assert.throws(run, /W6_PREVIEW_ONLY/); assert.equal(spawned, 0); }
    assert.equal(env.EXPO_PUBLIC_AUTH_CALLBACK_APPROVED, 'false');
  }
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
test('W6 deployment maps Expo root URLs to nested build output without changing other branches', () => {
  const source = ts.transpileModule(readFileSync('../vercel.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const legacy = JSON.parse(readFileSync('../vercel.legacy.json', 'utf8'));
  function config(branch: string) {
    const exports: Record<string, any> = {};
    vm.runInNewContext(source, { exports, process: { env: { VERCEL_GIT_COMMIT_REF: branch } }, require: () => legacy });
    return exports.config;
  }
  for (const branch of ['main','unrelated-branch','']) {
    const actual=config(branch);
    assert.deepEqual(JSON.parse(JSON.stringify({...actual,git:legacy.git})), legacy);
    assert.equal(actual.git.deploymentEnabled['feat/fixeo-mobile-w6-entry-auth-trust'],false);
  }
  const w6 = config('feat/fixeo-mobile-w6-entry-auth-trust');
  function target(path: string) {
    const route = w6.routes.find((r: { src?: string; dest?: string }) => r.dest && new RegExp('^' + r.src + '$').test(path));
    return path.replace(new RegExp('^' + route.src + '$'), route.dest);
  }
  assert.equal(w6.builds[0].src, 'mobile/package.json');
  assert.equal(target('/_expo/static/js/web/entry.js'), '/mobile/_expo/static/js/web/entry.js');
  assert.equal(target('/assets/rafi.png'), '/mobile/assets/rafi.png');
  assert.equal(target('/auth-return.js'), '/mobile/auth-return.js');
  for (const path of ['/entry', '/sign-in', '/forgot-password', '/auth-callback']) assert.equal(target(path), '/mobile/index.html');
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
