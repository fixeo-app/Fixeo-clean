import legacy from './vercel.legacy.json';

const branch = 'feat/fixeo-mobile-w4-1-intelligence-gateway';
const isolated = process.env.VERCEL_GIT_COMMIT_REF === branch ||
  process.env.FIXEO_STAGING_PROJECT_REF === 'kqyhusnbybsukbcaoqtu';

// W4.1 builds only the JWT gateway and existing mobile media endpoints.
// Legacy server entrypoints cannot execute with inherited project credentials.
// Other branches retain the exact W4 configuration until integration review.
export const config = isolated ? {
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
