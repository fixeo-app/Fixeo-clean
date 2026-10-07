import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';

test('W2 real Drawer/Dock/controls render accessible states with React Native Web', () => {
  // Ionicons ships JSX in .js files. Bundle the real Web adapters, as Metro does,
  // instead of asking Node/tsx to interpret native package source.
  const directory = mkdtempSync(path.resolve('node_modules/.w2-render-'));
  const outfile = path.join(directory, 'render.cjs');
  try {
    buildSync({ entryPoints: ['tests/fixtures/render-shell.tsx'], outfile, bundle: true, platform: 'node',
      jsx: 'automatic', loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' },
      resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
      alias: { 'react-native': 'react-native-web', 'expo-gl': path.resolve('tests/fixtures/gl-no-context.tsx') },
      external: ['react', 'react-dom', 'react-dom/server', 'react-native-web'],
      define: { __DEV__: 'false' }, logLevel: 'silent',
    });
    const result = execFileSync(process.execPath, [outfile], { encoding: 'utf8' });
    assert.match(result, /W2_SHELL_RENDER_PASS/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
