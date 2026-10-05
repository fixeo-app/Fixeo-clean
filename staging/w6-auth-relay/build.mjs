import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

if (process.env.VERCEL_ENV === 'production') throw new Error('RELAY_PRODUCTION_BUILD_REFUSED');
if (process.env.VERCEL_PROJECT_ID === 'prj_U909VA6lAGunWRVCoSQ37uEOcz5c') throw new Error('RELAY_EXISTING_PROJECT_REFUSED');
const branch = process.env.VERCEL_GIT_COMMIT_REF;
if (branch && branch !== 'feat/fixeo-mobile-w6-entry-auth-trust') throw new Error('RELAY_UNAUTHORIZED_BRANCH');

const root = fileURLToPath(new URL('.', import.meta.url));
const output = join(root, '.vercel/output');
const script = readFileSync(join(root, 'src/relay.js'), 'utf8');
const style = 'html{color-scheme:light;background:#f6f4ef;color:#191918;font:18px/1.6 system-ui,sans-serif}body{margin:0;padding:24px}main{max-width:420px;margin:12vh auto}.eyebrow{font-size:12px;letter-spacing:.14em;color:#645c4a}h1{font-size:30px;line-height:1.2;font-weight:600}button{font:inherit;background:#191918;color:#fff;border:0;border-radius:14px;padding:14px 22px;min-height:52px;cursor:pointer}button:focus-visible{outline:3px solid #9f8043;outline-offset:4px}button:disabled{opacity:.6}';
const hash = value => createHash('sha256').update(value).digest('base64');
const html = readFileSync(join(root, 'src/callback.html'), 'utf8').replace('/* RELAY_SCRIPT */', script).replace('/* RELAY_STYLE */', style);
const headers = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Fixeo-Relay': 'w6-phase-1',
  'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(style)}'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
};
const config = {
  version: 3,
  routes: [
    { src: '^/.*$', headers, continue: true },
    { src: '^/auth-callback$', methods: ['GET'], caseSensitive: true, dest: '/callback.html', headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    { src: '^/auth-callback$', caseSensitive: true, status: 405, headers: { Allow: 'GET' } },
    { src: '^/.*$', status: 404 }
  ]
};
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'static'), { recursive: true });
writeFileSync(join(output, 'static/callback.html'), html);
writeFileSync(join(output, 'config.json'), JSON.stringify(config, null, 2) + '\n');
console.log('Relay artifact built: one static document, explicit routes, zero functions.');
