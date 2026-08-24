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
    'dashboard-artisan.html',
    'dashboard-artisan-v2.html'
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
          window.location.replace('onboarding-artisan.html');
          return;
        }
      }

      /* 4. V1 artisan URL always upgrades to V2 */
      if (page === 'dashboard-artisan.html') {
        window.location.replace(
          canonicalRole === 'artisan'
            ? 'dashboard-artisan-v2.html'
            : ROLE_HOME[canonicalRole]
        );
        return;
      }

      /* 5. Every authenticated role has exactly ONE canonical dashboard */
      var expectedPage = ROLE_HOME[canonicalRole];

      if (page !== expectedPage) {
        window.location.replace(expectedPage);
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
