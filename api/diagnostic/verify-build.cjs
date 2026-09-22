'use strict';
// Production release gate. Uses disposable Diagnostic dossiers only, never bookings.
// Credentials, cookies and signed URLs stay in memory and are never logged.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { config } = require('./config');
const { createHandler } = require('./index');
const { createMaintenance } = require('./maintenance');
const { createTransport } = require('./transport');
const { createMedia } = require('./media');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

function response() {
  return {
    headers: {}, code: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; },
    json(v) { this.body = v; return this; },
  };
}
async function verify({ runtime = false } = {}) {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('Diagnostic release gate: local/preview build, no production access.');
    return;
  }
  assert.equal(process.env.VERCEL_ENV, 'production');
  // Several legacy entrypoints share this package. Validate once per build,
  // and let every sibling await the same result. Marker contains no user data.
  const buildKey = createHash('sha256').update([
    process.env.VERCEL_URL, process.env.VERCEL_GIT_COMMIT_SHA,
  ].join(':')).digest('hex');
  const lock = path.join(os.tmpdir(), 'fixeo-diagnostic-build-' + buildKey);
  try { if (!runtime) await fs.mkdir(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    for (let i = 0; i < 550; i++) {
      if (await fs.readFile(path.join(lock, 'result'), 'utf8').catch(() => '') === 'PASS') {
        console.log('DIAGNOSTIC_RELEASE_GATE_PASS: already verified in this build.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('VERIFY_BUILD_LOCK_TIMEOUT');
  }
  const cfg = config();
  assert.ok(cfg.secret.length >= 32 && cfg.maintenanceSecret.length >= 32);
  assert.ok(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.OPENAI_API_KEY && cfg.model);
  if (process.env.FIXEO_DIAGNOSTIC_ENABLED === '1') assert.equal(cfg.enabled, true);
  const cron = require('../../vercel.json').crons;
  assert.ok(cron.some(c => c.path === '/api/diagnostic-maintenance' && c.schedule === '0 * * * *'));
  const quiet = runtime ? console : { info() {}, warn() {} };
  // Test-only dependency injection. The deployed public handler still reads its
  // unchanged OFF flag; this script is never routed as an HTTP endpoint.
  const handler = createHandler({ logger: quiet, cfg: { ...cfg, enabled: true } });
  const maintenance = createMaintenance({ logger: quiet });
  const transport = createTransport();
  const storage = createMedia(transport, cfg);
  const id = randomUUID();
  let cookie = '', session, mediaId, ticket;
  async function request(body, ownCookie = cookie) {
    const res = response();
    await handler({ method: 'POST', body: { session_id: id, ...body }, headers: {
      origin: cfg.origin, 'x-fixeo-diagnostic': '1',
      'content-type': 'application/json', 'x-vercel-forwarded-for': '127.0.0.1',
      cookie: ownCookie,
    } }, res);
    if (res.headers['Set-Cookie']) cookie = res.headers['Set-Cookie'].split(';')[0];
    if (res.body?.session) session = res.body.session;
    return res;
  }
  function ok(res) {
    if (res.code !== 200 || !res.body?.ok) throw new Error(res.body?.error || 'VERIFY_REQUEST_FAILED');
    return res.body;
  }
  async function clean() {
    const res = response();
    await maintenance({ method: 'GET', headers: { authorization: 'Bearer ' + cfg.maintenanceSecret } }, res);
    return ok(res);
  }
  const paths = [];
  try {
    ok(await request({ action: 'create', city_slug: 'rabat', consent_version: 'diagnostic-privacy-v1',
      input: { description: 'Test technique FIXEO sans intervention réelle. Une petite fuite au raccord sous le lavabo apparaît lorsque le robinet coule. La photo synthétique ne montre pas l’installation.', answers: {}, safety_signals: [] } }));
    const other = await request({ action: 'get' }, cfg.cookie + '=' + 'b'.repeat(64));
    assert.equal(other.code, 404);
    const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#427896' } })
      .jpeg().withMetadata().toBuffer();
    ticket = ok(await request({ action: 'media_reserve', revision: session.revision,
      kind: 'photo', mime: 'image/jpeg', bytes: photo.length })).upload;
    mediaId = ticket.media_id;
    paths.push('raw/' + id + '/' + mediaId, 'safe/' + id + '/' + mediaId + '.webp');
    const put = () => fetch(ticket.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' },
      body: photo, signal: AbortSignal.timeout(15000), redirect: 'error' });
    assert.ok((await put()).ok);
    ok(await request({ action: 'media_validate', revision: session.revision, media_id: mediaId }));
    assert.equal(session.media[0].state, 'ready');
    const cleanPhoto = await storage.download(paths[1]);
    const meta = await sharp(cleanPhoto).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined);
    assert.equal(meta.xmp, undefined);
    const privateURL = transport.root + '/storage/v1/object/public/' + cfg.bucket + '/' + paths[1];
    assert.equal((await fetch(privateURL, { signal: AbortSignal.timeout(10000), redirect: 'error' })).ok, false);
    ok(await request({ action: 'analyze', revision: session.revision, run_id: randomUUID() }));
    assert.ok(session.result?.problem);
    assert.ok(['ready', 'questions'].includes(session.state));
    assert.equal(session.request_id, null);
    // Remove our media, then replay its still-valid upload ticket to prove maintenance
    // deletes actual Storage bytes as well as maintaining persistent tombstones.
    ok(await request({ action: 'media_remove', revision: session.revision, media_id: mediaId }));
    assert.ok((await put()).ok);
    const deleted = await clean();
    assert.ok(deleted.deleted >= 1);
    await assert.rejects(storage.download(paths[0]));
    await assert.rejects(storage.download(paths[1]));
    if (!runtime) await fs.writeFile(path.join(lock, 'result'), 'PASS', { mode: 0o600 });
    console.log('DIAGNOSTIC_RELEASE_GATE_PASS: private upload, WebP metadata removal, real OpenAI analysis, owner isolation, authenticated cleanup.');
  } finally {
    if (mediaId && session) {
      await request({ action: 'media_remove', revision: session.revision, media_id: mediaId }).catch(() => {});
      await storage.remove(paths).catch(() => {});
    }
  }
}
if (require.main === module) {
const timer = setTimeout(() => { console.error('DIAGNOSTIC_RELEASE_GATE_FAILED: TIMEOUT'); process.exit(1); }, 120000);
verify().then(() => clearTimeout(timer)).catch(error => {
  clearTimeout(timer);
  const code = /^[A-Z_]{3,80}$/.test(error?.message || '') ? error.message : 'CHECK_FAILED';
  console.error('DIAGNOSTIC_RELEASE_GATE_FAILED: ' + code);
  process.exitCode = 1;
});
}
module.exports = { verify };
