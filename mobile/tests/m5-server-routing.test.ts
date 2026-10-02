import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '..');
const mobileRoot = process.cwd();

test('Vercel routes both authenticated M5 native RAFI endpoints through server.js', () => {
  const vercel = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'),
  );

  const routeMap = new Map(
    (vercel.routes || []).map((route: any) => [route.src, route.dest]),
  );

  assert.equal(
    routeMap.get('^/api/mobile-diagnostic-v1$'),
    '/api/server.js',
  );
  assert.equal(
    routeMap.get('^/api/mobile-rafi-transcribe$'),
    '/api/server.js',
  );
});

test('mobile bundle never embeds privileged provider or Supabase server credentials', () => {
  const files = [
    'lib/rafiGateway.ts',
    'lib/mobileDiagnostic.ts',
    'lib/supabase.ts',
  ];

  const joined = files
    .map(file => fs.readFileSync(path.join(mobileRoot, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(joined, /api\.openai\.com/i);
  assert.doesNotMatch(joined, /OPENAI_API_KEY/);
  assert.doesNotMatch(joined, /service_role/i);
  assert.doesNotMatch(joined, /sb_secret_/i);
});

test('native RAFI gateways require the authenticated Supabase session token', () => {
  const gateway = fs.readFileSync(
    path.join(mobileRoot, 'lib/rafiGateway.ts'),
    'utf8',
  );
  const diagnostic = fs.readFileSync(
    path.join(mobileRoot, 'lib/mobileDiagnostic.ts'),
    'utf8',
  );

  for (const source of [gateway, diagnostic]) {
    assert.match(source, /getSession\(\)/);
    assert.match(source, /Authorization:\s*'Bearer '/);
  }
});
