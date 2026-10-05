'use strict';
const BRANCH = 'feat/fixeo-mobile-w4-1-intelligence-gateway';
const REF = 'kqyhusnbybsukbcaoqtu';
const URL = 'https://' + REF + '.supabase.co';
const KEYS = ['SUPABASE_URL','FIXEO_STAGING_PROJECT_REF','SUPABASE_ANON_KEY','FIXEO_ESTIMATOR_SECRET',
  'FIXEO_DIAGNOSTIC_SECRET','FIXEO_W41_ATTESTATION_SECRET','FIXEO_DIAGNOSTIC_MODEL','OPENAI_API_KEY',
  'NODE_ENV','VERCEL_ENV','VERCEL_URL','VERCEL_GIT_COMMIT_REF'];
function runtime(source = process.env) {
  // Deliberate allowlist: never read or forward inherited privileged credentials.
  const env = Object.fromEntries(KEYS.map(key => [key,source[key]]));
  const local = env.NODE_ENV === 'test';
  if ((!local && (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== BRANCH)) ||
      env.SUPABASE_URL !== URL || env.FIXEO_STAGING_PROJECT_REF !== REF ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_ANON_KEY || '') ||
      ['FIXEO_ESTIMATOR_SECRET','FIXEO_DIAGNOSTIC_SECRET','FIXEO_W41_ATTESTATION_SECRET'].some(k => typeof env[k] !== 'string' || env[k].length < 64) ||
      !/^[a-zA-Z0-9.-]+\.vercel\.app$/.test(env.VERCEL_URL || '')) {
    const e = new Error('GATEWAY_UNAVAILABLE'); e.code=e.message; e.status=503; throw e;
  }
  env.FIXEO_DIAGNOSTIC_ORIGIN = 'https://' + env.VERCEL_URL;
  return Object.freeze(env);
}
module.exports = {runtime,BRANCH,REF,URL};
