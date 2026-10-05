const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feat/fixeo-mobile-w6-entry-auth-trust') throw new Error('W6_PREVIEW_ONLY');
if (!/^sb_publishable_/.test(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '')) throw new Error('W6_PUBLISHABLE_KEY_REQUIRED');
const env = { ...process.env,
  EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_SUPABASE_URL: 'https://kqyhusnbybsukbcaoqtu.supabase.co',
  EXPO_PUBLIC_AUTH_CALLBACK_URL: 'https://w6-auth-staging.fixeo.ma/auth-callback',
  EXPO_PUBLIC_AUTH_CALLBACK_APPROVED: 'true',
  EXPO_PUBLIC_FIXEO_API_BASE_URL: 'https://kqyhusnbybsukbcaoqtu.supabase.co/functions/v1/mobile-rafi-preview-proxy',
};
const result = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', 'dist'], { env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
let html = fs.readFileSync('dist/index.html', 'utf8');
html = html.replace('<head>', '<head><meta name="referrer" content="no-referrer"><script src="/auth-return.js"></script>');
fs.writeFileSync('dist/index.html', html);
