import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');

const shellSubpages = [
  'app/client-workspace/account.tsx',
  'app/client-workspace/history.tsx',
  'app/client-workspace/notifications.tsx',
  'app/artisan-workspace/clients.tsx',
  'app/artisan-workspace/quotes.tsx',
  'app/artisan-workspace/agenda.tsx',
  'app/artisan-workspace/finance.tsx',
];

test('Shell subpages do not render legacy duplicate back rows', async () => {
  for (const relative of shellSubpages) {
    const source = await readFile(path.join(mobileRoot, relative), 'utf8');
    assert.equal(source.includes('‹ Mon espace'), false, relative);
    assert.equal(source.includes('‹ Artisan OS'), false, relative);
    assert.equal(source.includes('styles.back'), false, relative);
  }
});

test('Client workspace detail pages use bounded loading and foreground refresh', async () => {
  for (const relative of [
    'app/client-workspace/account.tsx',
    'app/client-workspace/history.tsx',
    'app/client-workspace/notifications.tsx',
  ]) {
    const source = await readFile(path.join(mobileRoot, relative), 'utf8');
    assert.equal(source.includes('withMobileDeadline'), true, relative);
    assert.equal(source.includes('useForegroundRefresh'), true, relative);
  }
});
