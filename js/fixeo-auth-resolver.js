/* FIXEO Auth Phase 2A: read-only resolution, deliberately not loaded by any page.
 * Browser: await FixeoAuthResolver.resolve(existingSupabaseClient)
 * Node:    require('./fixeo-auth-resolver.js').resolve(client)
 * A result describes accessible spaces; it never navigates or grants DB access.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoAuthResolver = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GLOBAL_DESTINATIONS = Object.freeze({
    admin: 'admin.html',
    artisan: 'dashboard-artisan-v2.html',
    client: 'dashboard-client.html'
  });
  var GLOBAL_ROLES = ['admin', 'artisan', 'client'];
  var MEMBER_ROLES = ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer'];
  var MEMBER_STATUSES = ['active', 'invited', 'suspended', 'removed'];
  var ACCOUNT_STATUSES = ['active', 'suspended', 'closed'];
  var PAGE_SIZE = 200;
  var ACCOUNT_BATCH_SIZE = 100;
  var AUTH_VERIFY_TIMEOUT_MS = 8000;
  function boundedAuth(promise) {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function(){ reject(new Error('AUTH_VERIFY_TIMEOUT')); }, AUTH_VERIFY_TIMEOUT_MS);
      Promise.resolve(promise).then(function(v){ clearTimeout(timer); resolve(v); }, function(e){ clearTimeout(timer); reject(e); });
    });
  }

  function isUuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  function result(status, identity, enterpriseSpaces) {
    var globalSpace = identity ? {
      type: identity.global_role,
      destination: GLOBAL_DESTINATIONS[identity.global_role]
    } : null;
    var enterprise = enterpriseSpaces || [];
    var spaces = globalSpace ? [globalSpace].concat(enterprise) : [];
    return {
      ok: status === 'OK',
      status: status,
      identity: identity || null,
      global_space: globalSpace,
      enterprise_spaces: enterprise,
      spaces: spaces,
      has_multiple_spaces: spaces.length > 1
    };
  }

  async function readEnterprise(db, userId) {
    var stage = 'ENTERPRISE_MEMBERSHIP_READ_ERROR';
    try {
      var memberships = new Map();
      var offset = 0;
      var expectedCount = null;
      do {
        // Admin RLS can see other users: the explicit user_id filter is mandatory.
        var page = await db.from('enterprise_members')
          .select('enterprise_id,user_id,role,status', { count: 'exact' })
          .eq('user_id', userId).eq('status', 'active')
          .order('enterprise_id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (!page || page.error || !Array.isArray(page.data) ||
            !Number.isSafeInteger(page.count) || page.count < 0 ||
            (expectedCount !== null && page.count !== expectedCount) ||
            (page.data.length === 0 && offset < page.count) ||
            offset + page.data.length > page.count) return { status: stage };
        expectedCount = page.count;
        for (var member of page.data) {
          if (!member || member.user_id !== userId || !isUuid(member.enterprise_id) ||
              MEMBER_STATUSES.indexOf(member.status) === -1) {
            return { status: 'INVALID_ENTERPRISE_MEMBERSHIP' };
          }
          if (member.status !== 'active') continue;
          if (MEMBER_ROLES.indexOf(member.role) === -1 || memberships.has(member.enterprise_id)) {
            return { status: 'INVALID_ENTERPRISE_MEMBERSHIP' };
          }
          memberships.set(member.enterprise_id, member);
        }
        offset += page.data.length;
      } while (offset < expectedCount);

      // UUID lexical order is stable across browsers/locales and duplicate names.
      var ids = Array.from(memberships.keys()).sort();
      var spaces = [];
      stage = 'ENTERPRISE_ACCOUNT_READ_ERROR';
      for (var start = 0; start < ids.length; start += ACCOUNT_BATCH_SIZE) {
        var batch = ids.slice(start, start + ACCOUNT_BATCH_SIZE);
        var response = await db.from('enterprise_accounts')
          .select('id,name,status').in('id', batch);
        if (!response || response.error || !Array.isArray(response.data)) return { status: stage };
        var accounts = new Map();
        for (var account of response.data) {
          if (!account || batch.indexOf(account.id) === -1 || accounts.has(account.id) ||
              typeof account.name !== 'string' || account.name.length === 0 ||
              ACCOUNT_STATUSES.indexOf(account.status) === -1) {
            return { status: 'INVALID_ENTERPRISE_ACCOUNT' };
          }
          accounts.set(account.id, account);
        }
        for (var id of batch) {
          var row = accounts.get(id);
          // Missing/RLS-hidden accounts are not silently treated as a complete list.
          if (!row) return { status: 'ENTERPRISE_ACCOUNT_UNAVAILABLE' };
          if (row.status !== 'active') continue;
          spaces.push({
            type: 'enterprise',
            enterprise_id: id,
            enterprise_name: row.name,
            member_role: memberships.get(id).role,
            membership_status: 'active',
            account_status: 'active',
            destination: null,
            destination_status: 'NOT_IMPLEMENTED'
          });
        }
      }
      return { status: 'OK', spaces: spaces };
    } catch (_) {
      return { status: stage };
    }
  }

  async function resolve(client) {
    if (!client || !client.auth || typeof client.auth.getSession !== 'function' ||
        typeof client.auth.getUser !== 'function' || typeof client.schema !== 'function') {
      return result('CLIENT_UNAVAILABLE');
    }
    var stage = 'SESSION_READ_ERROR';
    try {
      var sessionResponse = await client.auth.getSession();
      if (!sessionResponse || sessionResponse.error) return result(stage);
      var session = sessionResponse.data && sessionResponse.data.session;
      if (!session) return result('NO_SESSION');
      if (!session.user || !isUuid(session.user.id) ||
          typeof session.access_token !== 'string' || !session.access_token) return result('INVALID_SESSION');
      var userId = session.user.id;
      var token = session.access_token;

      // getSession alone reads SDK storage. Verify the token with Auth before DB reads.
      stage = 'SESSION_VALIDATION_ERROR';
      var verified;
      try {
        verified = await boundedAuth(client.auth.getUser(token));
      } catch (_) {
        /* Auth service can transiently 504 while the JWT remains locally valid.
           Never grant access from storage alone: continue only to RLS-protected
           identity reads using the existing token; any DB/RLS failure remains fail-closed. */
        verified = null;
      }
      if (verified && verified.error) verified = null;
      if (verified && (!verified.data || !verified.data.user)) return result(stage);
      if (verified && verified.data.user.id !== userId) return result('SESSION_IDENTITY_MISMATCH');

      stage = 'PUBLIC_USER_READ_ERROR';
      var db = client.schema('public');
      var userResponse = await db.from('users').select('id,role').eq('id', userId).maybeSingle();
      if (!userResponse || userResponse.error) return result(stage);
      if (!userResponse.data) return result('MISSING_PUBLIC_USER');
      if (userResponse.data.id !== userId) return result('PUBLIC_USER_IDENTITY_MISMATCH');
      var role = userResponse.data.role;
      if (GLOBAL_ROLES.indexOf(role) === -1) return result('INVALID_GLOBAL_ROLE');
      var identity = { user_id: userId, global_role: role };

      var enterprise = await readEnterprise(db, userId);

      // Do not return stale spaces after logout, identity switch or token rotation.
      stage = 'SESSION_READ_ERROR';
      var current = await client.auth.getSession();
      if (!current || current.error) return result(stage);
      var currentSession = current.data && current.data.session;
      if (!currentSession || !currentSession.user || currentSession.user.id !== userId ||
          currentSession.access_token !== token) return result('SESSION_CHANGED');

      // An Enterprise failure preserves only the verified global space; ok stays false.
      return result(enterprise.status, identity, enterprise.status === 'OK' ? enterprise.spaces : []);
    } catch (_) {
      // No SDK errors, tokens or personal details are returned or logged.
      return result(stage);
    }
  }

  return Object.freeze({ resolve: resolve });
});
