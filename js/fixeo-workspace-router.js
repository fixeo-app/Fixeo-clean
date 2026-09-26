/* FIXEO Auth Phase 2C.1 — canonical post-login workspace routing.
 * Security boundary stays in Supabase RLS/RPC + Phase 2B enterprise guard.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fixeo-auth-resolver.js'));
  else root.FixeoWorkspaceRouter = factory(root.FixeoAuthResolver);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (resolver) {
  'use strict';

  var LEGACY = Object.freeze({
    admin: 'admin.html',
    artisan: 'dashboard-artisan-v2.html',
    client: 'dashboard-client.html'
  });
  var ENTERPRISE_ROLES = Object.freeze(['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer']);
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var DEFAULT_WAIT_MS = 15000;

  function legacyDestination(role) {
    return LEGACY[String(role || '').toLowerCase()] || 'index.html';
  }

  function validEnterpriseSpace(space) {
    return !!(space && space.type === 'enterprise' &&
      UUID_RE.test(String(space.enterprise_id || '')) &&
      String(space.enterprise_name || '').trim() &&
      ENTERPRISE_ROLES.indexOf(String(space.member_role || '')) !== -1);
  }

  function selectorRequired(access) {
    return !!(access && access.ok === true && access.status === 'OK' && Array.isArray(access.enterprise_spaces) && access.enterprise_spaces.some(validEnterpriseSpace));
  }

  function withTimeout(promise, waitMs) {
    var ms = Number.isFinite(waitMs) && waitMs > 0 ? waitMs : DEFAULT_WAIT_MS;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('WORKSPACE_RESOLUTION_TIMEOUT')); }, ms);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer); resolve(value);
      }, function (error) {
        clearTimeout(timer); reject(error);
      });
    });
  }

  async function resolvePostLogin(client, canonicalRole, options) {
    var fallback = legacyDestination(canonicalRole);
    if (!resolver || typeof resolver.resolve !== 'function' || !client) {
      return { mode: 'legacy', destination: fallback, reason: 'RESOLVER_UNAVAILABLE' };
    }

    var access;
    try {
      access = await withTimeout(resolver.resolve(client), options && options.waitMs);
    } catch (error) {
      return { mode: 'legacy', destination: fallback, reason: error && error.message === 'WORKSPACE_RESOLUTION_TIMEOUT' ? 'RESOLUTION_TIMEOUT' : 'RESOLVER_EXCEPTION' };
    }

    if (!access || access.ok !== true || access.status !== 'OK') {
      return { mode: 'legacy', destination: fallback, reason: access && access.status || 'RESOLUTION_FAILED' };
    }

    if (selectorRequired(access)) {
      return { mode: 'selector', destination: 'workspace-select.html', reason: 'ENTERPRISE_SPACE_AVAILABLE' };
    }

    var resolvedGlobal = access.global_space && LEGACY[access.global_space.type] === access.global_space.destination
      ? access.global_space.destination
      : fallback;
    return { mode: 'legacy', destination: resolvedGlobal, reason: 'GLOBAL_ONLY' };
  }

  async function redirectAfterLogin(canonicalRole) {
    var client = root.FixeoSupabaseClient && root.FixeoSupabaseClient.client;
    var result = await resolvePostLogin(client, canonicalRole);
    if (root.location) root.location.href = result.destination;
    return result;
  }

  return Object.freeze({
    legacyDestination: legacyDestination,
    validEnterpriseSpace: validEnterpriseSpace,
    selectorRequired: selectorRequired,
    resolvePostLogin: resolvePostLogin,
    redirectAfterLogin: redirectAfterLogin
  });
});
