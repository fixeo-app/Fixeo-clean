'use strict';
const { MEDIA } = require('./contract');
function integer(value, fallback, minimum, maximum) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum)
    throw new Error('DIAGNOSTIC_CONFIG_INVALID');
  return n;
}
function config(env = process.env) {
  const origin = env.FIXEO_DIAGNOSTIC_ORIGIN || 'https://www.fixeo.ma';
  const parsed = new URL(origin);
  const local =
    env.NODE_ENV === 'test' ||
    (env.NODE_ENV === 'development' &&
      ['localhost', '127.0.0.1'].includes(parsed.hostname));
  if (parsed.origin !== origin || (!local && parsed.protocol !== 'https:'))
    throw new Error('DIAGNOSTIC_CONFIG_INVALID');
  const reserve = integer(
    env.FIXEO_DIAGNOSTIC_RESERVE_MICRO_USD,
    100000,
    1000,
    10000000,
  );
  const dailyBudget = integer(
    env.FIXEO_DIAGNOSTIC_DAILY_MICRO_USD,
    10000000,
    reserve,
    1000000000,
  );
  const ready = !!(
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.FIXEO_ESTIMATOR_SECRET?.length >= 32 &&
    env.FIXEO_DIAGNOSTIC_SECRET?.length >= 32 &&
    env.CRON_SECRET?.length >= 32 &&
    env.OPENAI_API_KEY &&
    env.FIXEO_DIAGNOSTIC_MODEL &&
    env.FIXEO_DIAGNOSTIC_COST_REVIEWED === '1' &&
    env.FIXEO_DIAGNOSTIC_MAINTENANCE_READY === '1' &&
    env.FIXEO_DIAGNOSTIC_STORAGE_READY === '1' &&
    env.FIXEO_DIAGNOSTIC_RUNTIME_READY === '1' &&
    env.FIXEO_DIAGNOSTIC_PRIVACY_REVIEWED === '1'
  );
  return {
    contextEnabled: !!(
      env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      env.FIXEO_DIAGNOSTIC_SECRET?.length >= 32 &&
      env.FIXEO_DIAGNOSTIC_STORAGE_READY === '1'
    ),
    enabled: env.FIXEO_DIAGNOSTIC_ENABLED === '1' && ready,
    ready,
    origin,
    local,
    provider: 'openai',
    model: env.FIXEO_DIAGNOSTIC_MODEL || '',
    reserve,
    dailyBudget,
    bucket: 'diagnostic-private-v1',
    media: MEDIA,
    providerTimeout: 25000,
    cookie: local ? 'fixeo_diagnostic_dev' : '__Host-fixeo_diagnostic',
    secret: env.FIXEO_DIAGNOSTIC_SECRET || '',
    maintenanceSecret: env.CRON_SECRET || '',
  };
}
function quotaLimits(actor, ipHash, cfg) {
  const user = actor?.startsWith('u:');
  const limits = [
    {
      key: 'global',
      requests: 10000,
      sessions: 300,
      analyses: 1000,
      bytes: 512 * 1024 * 1024,
      reserved_micro_usd: cfg.dailyBudget,
    },
    {
      key: 'ip:' + ipHash,
      requests: 600,
      sessions: 20,
      analyses: 20,
      bytes: 192 * 1024 * 1024,
      reserved_micro_usd: cfg.reserve * 20,
    },
  ];
  if (actor)
    limits.push({
      key: actor,
      requests: 300,
      sessions: user ? 10 : 5,
      analyses: user ? 10 : 5,
      bytes: (user ? 96 : 48) * 1024 * 1024,
      reserved_micro_usd: cfg.reserve * (user ? 10 : 5),
    });
  return limits;
}
module.exports = { config, quotaLimits };
