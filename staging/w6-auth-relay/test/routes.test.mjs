import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, ['build.mjs'], { cwd: root });
const config = JSON.parse(readFileSync(root + '.vercel/output/config.json', 'utf8'));
const html = readFileSync(root + '.vercel/output/static/callback.html', 'utf8');
function route(path, method = 'GET') {
  const headers = {};
  for (const r of config.routes) {
    if (!new RegExp(r.src, r.caseSensitive === false ? 'i' : '').test(path) || (r.methods && !r.methods.includes(method))) continue;
    Object.assign(headers, r.headers);
    if (!r.continue) return { status: r.status || 200, dest: r.dest, headers };
  }
  return { status: 404, headers };
}
test('only exact GET callback has a document; no filesystem or SPA fallback', () => {
  assert.equal(route('/auth-callback').dest, '/callback.html');
  for (const path of ['/', '/entry', '/sign-in', '/artisan', '/client', '/api/test', '/random-test', '/callback.html', '/src/relay.js', '/auth-callback/', '/AUTH-CALLBACK', '/auth-callback/nested']) assert.equal(route(path).status, 404);
  for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) assert.equal(route('/auth-callback', method).status, 405);
  assert.ok(!config.routes.some(r => r.handle));
});
test('privacy headers also cover refusals; CSP pins all inline executable content', () => {
  for (const path of ['/auth-callback', '/', '/entry']) {
    const h = route(path).headers;
    assert.equal(h['Cache-Control'], 'no-store'); assert.equal(h['Referrer-Policy'], 'no-referrer'); assert.equal(h['X-Content-Type-Options'], 'nosniff');
  }
  const csp = route('/auth-callback').headers['Content-Security-Policy'];
  for (const tag of ['script', 'style']) {
    const body = html.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))[1];
    assert.ok(csp.includes('sha256-' + createHash('sha256').update(body).digest('base64')));
  }
  assert.ok(csp.includes("connect-src 'none'"));
});
test('output contains one static document and zero functions, SDKs or external assets', () => {
  assert.deepEqual(readdirSync(root + '.vercel/output').sort(), ['config.json', 'static']);
  assert.deepEqual(readdirSync(root + '.vercel/output/static'), ['callback.html']);
  assert.ok(!/<(?:script|link|img|iframe)[^>]+(?:src|href)=/i.test(html));
  assert.ok(!/supabase-js|service_role|\.supabase\.co|expo-router|sourceMappingURL/.test(html));
  assert.deepEqual(JSON.parse(readFileSync(root + 'package.json')).dependencies, {});
});
test('production, original project and unrelated branch builds are refused', () => {
  for (const guard of [{ VERCEL_ENV: 'production' }, { VERCEL_PROJECT_ID: 'prj_U909VA6lAGunWRVCoSQ37uEOcz5c' }, { VERCEL_GIT_COMMIT_REF: 'main' }]) {
    const r = spawnSync(process.execPath, ['build.mjs'], { cwd: root, env: { ...process.env, ...guard }, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
  }
});
