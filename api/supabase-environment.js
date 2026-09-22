'use strict';

const PRODUCTION_REF = 'ztwtbgoqanqzvwiibtuh';
const RESTORE_REF = 'avzawlissxfdjgxfeaxu';
const PRODUCTION_URL = 'https://' + PRODUCTION_REF + '.supabase.co';
const PRODUCTION_PUBLIC_KEY = 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';

function projectRef(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('SUPABASE_TARGET_INVALID');
  }
  const match = url.hostname.match(/^([a-z]{20})\.supabase\.co$/);
  if (!match) throw new Error('SUPABASE_TARGET_INVALID');
  return match[1];
}

function assertServerTarget(env = process.env) {
  // A Preview must explicitly identify its isolated backend. Never infer one
  // from the production project, a restore project, or a browser request header.
  if (env.VERCEL_ENV !== 'preview' && !env.FIXEO_STAGING_PROJECT_REF) return;
  let ref;
  try { ref = projectRef(env.SUPABASE_URL); } catch (_) {
    throw new Error('SUPABASE_STAGING_TARGET_REQUIRED');
  }
  if (!env.FIXEO_STAGING_PROJECT_REF || ref !== env.FIXEO_STAGING_PROJECT_REF ||
      [PRODUCTION_REF, RESTORE_REF].includes(ref) || env.VERCEL_ENV === 'production') {
    throw new Error('SUPABASE_STAGING_TARGET_REJECTED');
  }
}

function publicConfig(env = process.env) {
  assertServerTarget(env);
  const production = env.VERCEL_ENV === 'production';
  const url = (env.SUPABASE_URL || (production ? PRODUCTION_URL : '')).replace(/\/$/, '');
  const ref = projectRef(url);
  const key = env.SUPABASE_ANON_KEY ||
    (production && url === PRODUCTION_URL ? PRODUCTION_PUBLIC_KEY : '');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    let claims;
    try {
      const parts = key.split('.');
      if (parts.length !== 3) throw new Error('Invalid public key');
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch (_) { throw new Error('SUPABASE_PUBLIC_KEY_REQUIRED'); }
    if (claims.role !== 'anon' || claims.ref !== ref) {
      throw new Error('SUPABASE_PUBLIC_KEY_REQUIRED');
    }
  }
  return {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key,
    FIXEO_DEPLOYMENT_ENV: env.VERCEL_ENV || 'development',
  };
}

module.exports = { assertServerTarget, publicConfig, projectRef };
