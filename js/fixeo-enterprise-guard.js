/* Phase 2B: page gate only. Supabase RLS remains the data security boundary. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fixeo-auth-resolver.js'));
  else root.FixeoEnterpriseGuard = factory(root.FixeoAuthResolver);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (resolver) {
  'use strict';
  var ROLES = ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer'];
  function uuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
  function targetFromSearch(search) {
    var values = new URLSearchParams(search).getAll('enterprise_id');
    return values.length === 1 && uuid(values[0]) ? values[0].toLowerCase() : null;
  }
  function denied(status) { return { allowed: false, status: status, enterprise: null }; }
  async function check(client, target) {
    if (!uuid(target)) return denied('INVALID_ENTERPRISE_ID');
    if (!resolver || typeof resolver.resolve !== 'function') return denied('READ_ERROR');
    try {
      var result = await resolver.resolve(client);
      if (result.status === 'NO_SESSION') return denied('NO_SESSION');
      // Enterprise errors can retain a global space: never treat it as permission.
      if (result.ok !== true || result.status !== 'OK') return denied('READ_ERROR');
      if (!result.identity || !uuid(result.identity.user_id) ||
          ['admin', 'artisan', 'client'].indexOf(result.identity.global_role) === -1 ||
          !Array.isArray(result.enterprise_spaces)) return denied('READ_ERROR');
      var matches = result.enterprise_spaces.filter(function (space) {
        return space.enterprise_id === target.toLowerCase();
      });
      if (matches.length !== 1) return denied('ACCESS_DENIED');
      var space = matches[0];
      if (space.type !== 'enterprise' || space.membership_status !== 'active' ||
          space.account_status !== 'active' || ROLES.indexOf(space.member_role) === -1 ||
          typeof space.enterprise_name !== 'string' || !space.enterprise_name.trim()) return denied('ACCESS_DENIED');
      // Return the requested company only; no list, token, global destination or Admin bypass.
      return { allowed: true, status: 'OK', enterprise: {
        id: space.enterprise_id, name: space.enterprise_name, role: space.member_role
      } };
    } catch (_) { return denied('READ_ERROR'); }
  }
  return Object.freeze({ check: check, targetFromSearch: targetFromSearch });
});
