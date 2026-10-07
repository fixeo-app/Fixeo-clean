import legacy from './vercel.legacy.json';

const branch = 'feat/fixeo-mobile-w4-1-intelligence-gateway';
const isolated = process.env.VERCEL_GIT_COMMIT_REF === branch ||
  process.env.FIXEO_STAGING_PROJECT_REF === 'kqyhusnbybsukbcaoqtu';

// W4.1 builds only the JWT gateway and existing mobile media endpoints.
// Legacy server entrypoints cannot execute with inherited project credentials.
// Other branches retain the exact W4 configuration until integration review.
const w6Branch = 'feat/fixeo-mobile-w6-entry-auth-trust';
const w6 = process.env.VERCEL_GIT_COMMIT_REF === w6Branch;
const runtimeConfig = w6 ? {
  version: 2,
  builds: [{ src: 'mobile/package.json', use: '@vercel/static-build', config: { distDir: 'dist' } }],
  routes: [
    { src: '/(.*)', headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, continue: true },
    // A nested static-build emits resources under /mobile, while Expo URLs use /.
    { src: '/(_expo|assets)/(.*)', dest: '/mobile/$1/$2' },
    { src: '/auth-return\\.js', dest: '/mobile/auth-return.js' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/mobile/index.html' },
  ],
  git: { deploymentEnabled: { [w6Branch]: false } },
} : isolated ? {
  version: 2,
  builds: [
    {src: 'api/mobile-intelligence-fn/index.js', use: '@vercel/node'},
    {src: 'api/mobile-rafi-photo-fn/index.js', use: '@vercel/node'},
    {src: 'api/mobile-rafi-voice-fn/index.js', use: '@vercel/node'},
  ],
  routes: [
    {src: '^/api/mobile-estimator-v1$', dest: '/api/mobile-intelligence-fn/index.js'},
    {src: '^/api/mobile-rafi-photo$', dest: '/api/mobile-rafi-photo-fn/index.js'},
    {src: '^/api/mobile-rafi-transcribe$', dest: '/api/mobile-rafi-voice-fn/index.js'},
    {src: '/(.*)', status: 404},
  ],
  git: {deploymentEnabled: {[branch]: true}},
} : legacy;

// Git webhook evaluation may not expose VERCEL_GIT_COMMIT_REF. The branch deny rule must be unconditional.
export const config = {
  ...runtimeConfig,
  // Vercel reads git rules statically before it evaluates runtimeConfig.
  git: { deploymentEnabled: {
    'feat/diagnostic-v1': false,
    'feat/fixeo-mobile-w6-entry-auth-trust': false,
  } },
};
