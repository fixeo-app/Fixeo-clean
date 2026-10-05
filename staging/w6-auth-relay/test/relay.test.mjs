import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/relay.js', import.meta.url), 'utf8');
const code = 'phase1-synthetic-code-12345'; // Not issued by any Auth provider.
function run(suffix, options = {}) {
  const url = new URL('https://w6-auth-staging.fixeo.ma/auth-callback' + suffix);
  const events = [], nodes = [], transfers = [], navigation = {};
  const node = tag => {
    const n = { tag, children: [], handlers: {}, append(...v) { this.children.push(...v); }, addEventListener(k, f) { this.handlers[k] = f; } };
    nodes.push(n); return n;
  };
  const location = { origin: options.origin || url.origin, pathname: url.pathname, search: url.search, hash: url.hash, assign: x => transfers.push(x) };
  const document = { readyState: 'complete', createElement(tag) { events.push('render'); return node(tag); }, body: { replaceChildren() {} } };
  const history = { replaceState(_, __, path) { if (options.failClean) throw new Error('blocked'); events.push('clean'); location.search = ''; location.hash = ''; location.pathname = path; } };
  const reject = () => { throw new Error('FORBIDDEN_SIDE_EFFECT'); };
  vm.runInNewContext(source, { URLSearchParams, Set, location, history, document, window: { addEventListener(key, fn) { navigation[key] = fn; } }, console: { log: reject, error: reject, warn: reject }, fetch: reject, localStorage: new Proxy({}, { get: reject }), sessionStorage: new Proxy({}, { get: reject }) });
  return { events, nodes, location, transfers, navigation, button: nodes.find(n => n.tag === 'button') };
}
function refused(suffix) {
  const r = run(suffix);
  assert.equal(r.events[0], 'clean');
  assert.equal(r.location.search + r.location.hash, '');
  assert.equal(r.button, undefined);
  assert.deepEqual(r.transfers, []);
  return r;
}
test('valid code: clean before render, fixed handoff only on interaction, one use', () => {
  const r = run('?code=' + code);
  assert.equal(r.events[0], 'clean');
  assert.deepEqual(r.transfers, []);
  assert.ok(r.nodes.every(n => !(n.textContent || '').includes(code)));
  r.button.handlers.click(); r.button.handlers.click();
  assert.deepEqual(r.transfers, ['fixeo://auth-callback?code=' + code]);
});
test('missing and malformed codes fail closed', () => {
  for (const suffix of ['', '?code=', '?code=x', '?code=a%20b', '?code=' + 'x'.repeat(513), '?code=%3Cscript%3E', '#code=' + code]) refused(suffix);
});
for (const key of ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token']) {
  test(key + ': query, fragment, empty, case and encoded names always refuse', () => {
    for (const suffix of ['?code=' + code + '&' + key + '=synthetic-forbidden', '?code=' + code + '#' + key + '=synthetic-forbidden', '?' + key + '=', '?' + key.toUpperCase() + '=synthetic-forbidden', '?' + '%' + key.charCodeAt(0).toString(16) + key.slice(1) + '=synthetic-forbidden']) refused(suffix);
  });
}
test('redirects and unexpected parameters refuse', () => {
  for (const key of ['redirect', 'redirectTo', 'next', 'returnUrl', 'callbackUrl', 'role', 'type', 'unexpected']) refused('?code=' + code + '&' + key + '=https%3A%2F%2Fexample.invalid');
});
test('duplicates, success/error ambiguity and query/fragment collisions refuse', () => {
  for (const suffix of ['?code=' + code + '&code=' + code, '?code=' + code + '&error=access_denied', '?code=' + code + '#error=access_denied', '?error=access_denied#error=access_denied', '?error_description=raw']) refused(suffix);
});
test('errors map to a closed non-sensitive vocabulary', () => {
  for (const [suffix, expected] of [['#error=access_denied&error_code=otp_expired', 'expired'], ['?error=bad&error_code=validation_failed', 'invalid'], ['?error=access_denied', 'denied'], ['?error=unrecognized', 'unknown']]) {
    const r = run(suffix + '&error_description=synthetic-private-description');
    assert.equal(r.events[0], 'clean');
    assert.ok(r.nodes.every(n => !(n.textContent || '').includes('synthetic-private-description')));
    r.button.handlers.click();
    assert.deepEqual(r.transfers, ['fixeo://auth-callback?error=' + expected]);
  }
});
test('an error combined with a forbidden token never transfers even an error', () => refused('?error=access_denied#provider_token=synthetic-forbidden'));
test('unapproved origin refuses', () => assert.equal(run('?code=' + code, { origin: 'https://example.invalid' }).button, undefined));
test('sanitation failure renders nothing and never transfers', () => {
  const r = run('?code=' + code, { failClean: true });
  assert.deepEqual(r.events, []); assert.deepEqual(r.transfers, []);
});
test('same-document fragment and history navigation are also scrubbed', () => {
  const r = run('');
  for (const event of ['hashchange', 'popstate']) {
    r.location.hash = '#provider_token=synthetic-forbidden';
    r.navigation[event]();
    assert.equal(r.location.hash, '');
    assert.deepEqual(r.transfers, []);
  }
});
