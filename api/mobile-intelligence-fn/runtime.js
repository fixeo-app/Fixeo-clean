'use strict';
const BRANCH = 'fix/rafi-v2-certification-20261018';
const RELEASE_BRANCH = 'fix/rafi-v2-certification-20261018';
const REF = 'akeyuruypurmendksusc';
const URL = 'https://' + REF + '.supabase.co';
const KEYS = ['SUPABASE_URL','FIXEO_CERTIFICATION_PROJECT_REF','SUPABASE_ANON_KEY','FIXEO_ESTIMATOR_SECRET',
  'FIXEO_DIAGNOSTIC_SECRET','FIXEO_W41_ATTESTATION_SECRET','FIXEO_DIAGNOSTIC_MODEL','OPENAI_API_KEY',
  'NODE_ENV','VERCEL_ENV','VERCEL_URL','VERCEL_GIT_COMMIT_REF',
  'FIXEO_STORE_MEDIA_ENABLED','FIXEO_STORE_MEDIA_REVIEW_SHA256'];
function runtime(source = process.env) {
  // Deliberate allowlist: never read or forward inherited privileged credentials.
  const env = Object.fromEntries(KEYS.map(key => [key,source[key]]));
  const local = false;
  const reviewedRelease=env.VERCEL_GIT_COMMIT_REF===RELEASE_BRANCH && env.FIXEO_STORE_MEDIA_ENABLED==='true' &&
    /^[a-f0-9]{64}$/.test(env.FIXEO_STORE_MEDIA_REVIEW_SHA256||'');
  if ((!local && (env.VERCEL_ENV !== 'preview' || (env.VERCEL_GIT_COMMIT_REF !== BRANCH && !reviewedRelease))) ||
      env.SUPABASE_URL !== URL || env.FIXEO_CERTIFICATION_PROJECT_REF !== REF ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_ANON_KEY || '') ||
      ['FIXEO_ESTIMATOR_SECRET','FIXEO_DIAGNOSTIC_SECRET','FIXEO_W41_ATTESTATION_SECRET'].some(k => typeof env[k] !== 'string' || env[k].length < 64) ||
      !/^[a-zA-Z0-9.-]+\.vercel\.app$/.test(env.VERCEL_URL || '')) {
    const e = new Error('GATEWAY_UNAVAILABLE'); e.code=e.message; e.status=503; throw e;
  }
  env.FIXEO_DIAGNOSTIC_ORIGIN = 'https://' + env.VERCEL_URL;
  return Object.freeze(env);
}
module.exports = {runtime,BRANCH,RELEASE_BRANCH,REF,URL};

