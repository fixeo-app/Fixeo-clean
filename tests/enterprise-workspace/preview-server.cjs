// LOOPBACK ONLY. Synthetic SDK replaces the SDK loader; CSP forbids external calls.
// Used to inspect the real page/guard/resolver/logout without any Production login.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, uuid, member, account } = require('../auth-resolver/fixture.cjs');
const root = path.join(__dirname, '../..');
const allowed = new Set(['dashboard-enterprise.html', 'css/fixeo-enterprise-workspace.css',
  'js/fixeo-enterprise-workspace.js', 'js/fixeo-enterprise-guard.js', 'js/fixeo-auth-resolver.js',
  'js/fixeo-logout-global.js', 'img/logo-fixeo-header.png', 'img/logo-fixeo-icon.png']);
const sdk = `(() => {
  const assert = { equal(a,b) { if (a !== b) throw Error('fixture equality'); }, ok(v) { if (!v) throw Error('fixture assertion'); } };
  const uuid = ${uuid.toString()}; const USER = uuid(1);
  const member = ${member.toString()}; const account = ${account.toString()};
  const fixture = ${fixture.toString()};
  const mode = new URLSearchParams(location.search).get('fixture') || 'active';
  const options = { enterprise_members: [member(1, 'operations_manager')], enterprise_accounts: [account(1, 'active', 'Atlas Résidences')] };
  if (mode === 'long') options.enterprise_accounts = [account(1, 'active', 'Compagnie marocaine de gestion des résidences et des établissements professionnels — Casablanca, Rabat et Marrakech • ' + 'NomSansEspace'.repeat(6))];
  if (mode === 'denied') options.enterprise_members = [];
  if (mode === 'error') options.errorTable = 'enterprise_members';
  if (mode === 'guest') options.session = null;
  const f = fixture(options); let listener;
  f.client.auth.onAuthStateChange = fn => { listener = fn; return { data: { subscription: { unsubscribe() { listener = null; } } } }; };
  f.client.auth.signOut = async () => {
    if (mode === 'logout-error') return { error: { message: 'fixture offline' } };
    f.state.session = null; listener('SIGNED_OUT', null); return { error: null };
  };
  window.FixeoSupabaseClient = { CONFIGURED: true, ready: () => mode === 'loading' ? new Promise(() => {}) : Promise.resolve({ client: f.client }) };
})();`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname.slice(1);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'");
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (pathname === 'js/supabase-client.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(sdk); return; }
  if (['index.html', 'auth.html'].includes(pathname)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="fr"><title>Destination locale de test</title><h1>Destination locale de test</h1></html>'); return;
  }
  if (!allowed.has(pathname)) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(pathname);
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[ext] + (ext === '.png' ? '' : '; charset=utf-8'));
  res.end(fs.readFileSync(path.join(root, pathname)));
});
server.listen(4322, '127.0.0.1', () => console.log('Phase 2B fixture preview: http://127.0.0.1:4322/dashboard-enterprise.html?enterprise_id=' + uuid(101)));
