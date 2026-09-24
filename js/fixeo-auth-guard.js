/* ================================================================
   FIXEO V15 — CANONICAL AUTH GUARD
   public.users.role = single source of truth
   ================================================================ */
(function () {
  'use strict';

  var ROLE_HOME = {
    admin:   'admin.html',
    artisan: 'dashboard-artisan-v2.html',
    client:  'dashboard-client.html'
  };

  var PROTECTED = [
  'admin.html',
  'dashboard-client.html',
  'dashboard-client-v1.html',
  'dashboard-client-v2.html',
  'dashboard-artisan.html',
  'dashboard-artisan-v2.html',
  'onboarding-artisan.html'
];

  function pageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function validRole(role) {
    role = String(role || '').toLowerCase();
    return ['admin', 'artisan', 'client'].indexOf(role) !== -1
      ? role
      : '';
  }

  var workspaceEntryLoader = null;

  function loadWorkspaceEntry() {
    if (window.FixeoWorkspaceEntry) return Promise.resolve(window.FixeoWorkspaceEntry);
    if (workspaceEntryLoader) return workspaceEntryLoader;

    workspaceEntryLoader = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/js/fixeo-workspace-entry.js?v=2c2-1';
      script.async = true;
      script.onload = function () {
        if (window.FixeoWorkspaceEntry) resolve(window.FixeoWorkspaceEntry);
        else reject(new Error('WORKSPACE_ENTRY_UNAVAILABLE'));
      };
      script.onerror = function () { reject(new Error('WORKSPACE_ENTRY_LOAD_FAILED')); };
      document.head.appendChild(script);
    });

    return workspaceEntryLoader;
  }

  async function replaceWorkspaceAware(fallbackHref) {
    try {
      var api = await loadWorkspaceEntry();
      if (!api || typeof api.resolveDestination !== 'function') {
        throw new Error('WORKSPACE_ENTRY_INVALID');
      }
      var destination = await api.resolveDestination(fallbackHref);
      window.location.replace(destination);
    } catch (_) {
      window.location.replace(fallbackHref);
    }
  }

  function clearLocalIdentity() {
    [
      'user_id',
      'fixeo_user',
      'fixeo_role',
      'fixeo_user_name',
      'user_name',
      'role',
      'user'
    ].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (_) {}
    });

    try {
      sessionStorage.removeItem('fixeo_admin_auth');
    } catch (_) {}
  }

  function persistCanonicalUser(authUser, row) {
    var role = validRole(row.role);
    var name = row.full_name || 'Utilisateur';

    var rawEmail = authUser.email || '';
    var pu = window.FixeoPhoneUtils || window._fxPhone;

    var identifier = rawEmail;

    if (pu && pu.isSyntheticEmail && pu.isSyntheticEmail(rawEmail)) {
      identifier =
        row.phone ||
        (pu.syntheticEmailToPhone
          ? pu.syntheticEmailToPhone(rawEmail)
          : rawEmail);
    }

    localStorage.setItem('user_id', authUser.id);
    localStorage.setItem('fixeo_user', identifier || authUser.id);
    localStorage.setItem('fixeo_user_name', name);
    localStorage.setItem('user_name', name);

    localStorage.setItem('fixeo_role', role);
    localStorage.setItem('role', role);

    localStorage.setItem('user', JSON.stringify({
      id: authUser.id,
      name: name,
      role: role
    }));

    if (row.phone) {
      localStorage.setItem('user_phone', row.phone);
    }

    if (role === 'admin') {
      sessionStorage.setItem('fixeo_admin_auth', '1');
    } else {
      sessionStorage.removeItem('fixeo_admin_auth');
    }

    localStorage.removeItem('fixeo_admin');

    return role;
  }

  async function runGuard() {
    var page = pageName();

    /* Public pages do not need dashboard routing */
    if (PROTECTED.indexOf(page) === -1) return;

    var clientWrapper = window.FixeoSupabaseClient;

    if (
  !clientWrapper ||
  typeof clientWrapper.ready !== 'function'
) {
  window.location.replace('auth.html');
  return;
}

try {
  var readyResult = await clientWrapper.ready();

  var sb =
    (readyResult && readyResult.client) ||
    clientWrapper.client;

  if (!sb) {
    console.error('[FixeoGuard V15] Supabase client unavailable after ready()');
    window.location.replace('auth.html');
    return;
  }

      /* 1. Supabase session is the authentication authority */
      var sessionResult = await sb.auth.getSession();
      var session =
        sessionResult &&
        sessionResult.data &&
        sessionResult.data.session;

      if (!session || !session.user) {
        clearLocalIdentity();
        window.location.replace('auth.html');
        return;
      }

      /* 2. public.users.role is the ROLE authority */
      var profileResult = await sb
        .from('users')
        .select('role, full_name, email, phone')
        .eq('id', session.user.id)
        .maybeSingle();

      if (
        profileResult.error ||
        !profileResult.data
      ) {
        console.error(
          '[FixeoGuard V15] canonical user lookup failed',
          profileResult.error
        );
        window.location.replace('auth.html');
        return;
      }

      var canonicalRole = validRole(profileResult.data.role);

      /*
       * Never silently convert an invalid/missing role to client.
       * Database integrity must decide the role.
       */
      if (!canonicalRole) {
        console.error(
          '[FixeoGuard V15] invalid canonical role',
          profileResult.data.role
        );
        window.location.replace('auth.html');
        return;
      }

      /* 3. Replace any stale localStorage identity */
      persistCanonicalUser(
        session.user,
        profileResult.data
      );
    /*
       * 3B. Artisan account must own a canonical public.artisans row
       * before accessing the artisan dashboard.
       */
      if (canonicalRole === 'artisan') {
        var artisanResult = await sb
          .from('artisans')
          .select('id')
          .eq('owner_user_id', session.user.id)
          .maybeSingle();

        if (artisanResult.error) {
          console.error(
            '[FixeoGuard V15] artisan ownership lookup failed',
            artisanResult.error
          );
          window.location.replace('auth.html');
          return;
        }

        if (!artisanResult.data) {
  console.info(
    '[FixeoGuard V15] artisan onboarding required',
    session.user.id
  );

  if (page === 'onboarding-artisan.html') {
    return;
  }

  window.location.replace('onboarding-artisan.html');
  return;
}

if (page === 'onboarding-artisan.html') {
  window.location.replace('dashboard-artisan-v2.html');
  return;
}
      }

      /* 4. Legacy dashboard URLs converge on canonical destinations. */
      if (page === 'dashboard-artisan.html') {
        if (canonicalRole === 'artisan') {
          window.location.replace('dashboard-artisan-v2.html');
        } else {
          await replaceWorkspaceAware(ROLE_HOME[canonicalRole]);
        }
        return;
      }

      if (page === 'dashboard-client-v1.html' || page === 'dashboard-client-v2.html') {
        if (canonicalRole === 'client') {
          window.location.replace('dashboard-client.html');
        } else {
          await replaceWorkspaceAware(ROLE_HOME[canonicalRole]);
        }
        return;
      }

      /* 5. Correct global dashboard stays direct; mismatches resolve available spaces. */
      var expectedPage = ROLE_HOME[canonicalRole];

      if (page !== expectedPage) {
        await replaceWorkspaceAware(expectedPage);
        return;
      }

      console.info(
        '[FixeoGuard V15] authorized:',
        canonicalRole,
        session.user.id
      );

    } catch (err) {
      console.error('[FixeoGuard V15] fatal:', err);
      window.location.replace('auth.html');
    }
  }

  runGuard();

})();
