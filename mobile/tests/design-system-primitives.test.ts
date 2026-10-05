import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('DS2 real primitives render their accessible states with the installed React Native Web adapter', () => {
  // Separate module graph: RN native source needs Metro; use the same Web adapter
  // as Expo for DOM rendering, without mocking the components or adding a renderer.
  const result = execFileSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/render-primitives.tsx'], {
    cwd: process.cwd(),
    env: { ...process.env, TSX_TSCONFIG_PATH: path.resolve('tests/fixtures/tsconfig.web.json') },
    encoding: 'utf8',
  });
  assert.match(result, /DS2_PRIMITIVES_RENDER_PASS/);
});
