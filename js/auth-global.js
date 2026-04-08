/* ================================================================
   FIXEO — AUTH GLOBAL (central session sync)
   ----------------------------------------------------------------
   RÔLE :
     • source unique de session locale
     • synchronisation header / auth container / dashboards
     • logout fiable + reset UI auth
     • compatibilité artisan auto-login / admin / legacy keys
   ================================================================ */
(function (window) {
  'use strict';

  var LOCAL_KEYS = [
    'fixeo_user', 'fixeo_token', 'fixeo_session', 'fixeo_logged', 'fixeo_logged_in',
    'fixeo_role', 'fixeo_admin', 'fixeo_user_name', 'fixeo_notif_count', 'fixeo_avatar',
    'fixeo_profile', 'fixeo_profile_status', 'user', 'role',
    'user_logged', 'user_role', 'user_name', 'user_job', 'user_city', 'user_phone', 'user_avatar', 'user_status'
  ];
  var SESSION_KEYS = ['fixeo_admin_auth', 'fixeo_session'];
  var VALID_ROLES = ['admin', 'artisan', 'client'];
  var AUTH_EVENT = 'fixeo:auth-changed';
  var isApplying = false;

  function safeTrim(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (error) { return fallback; }
  }

  function normalizeRole(value) {
    value = safeTrim(value).toLowerCase();
    return VALID_ROLES.indexOf(value) >= 0 ? value : 'client';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getRoleLabel(role) {
    if (role === 'artisan') return '🔧 Artisan';
    if (role === 'admin') return '🛡 Admin';
    return '👤 Client';
  }

  function resolveCoreHref(href) {
    if (window.FixeoGlobalNav && typeof window.FixeoGlobalNav.resolveHref === 'function') {
      return window.FixeoGlobalNav.resolveHref(href);
    }
    return href;
  }

  function readStoredUser() {
    var jsonUser = safeParse(localStorage.getItem('user'), null) || {};
    var fixeoUser = safeTrim(localStorage.getItem('fixeo_user'));
    var fixeoName = safeTrim(localStorage.getItem('fixeo_user_name'));
    var fixeoRole = safeTrim(localStorage.getItem('fixeo_role') || localStorage.getItem('role'));
    var fixeoAvatar = safeTrim(localStorage.getItem('fixeo_avatar'));

    var legacyLogged = safeTrim(localStorage.getItem('user_logged')).toLowerCase() === 'true';
    var legacyName = safeTrim(localStorage.getItem('user_name'));
    var legacyRole = safeTrim(localStorage.getItem('user_role'));
    var legacyJob = safeTrim(localStorage.getItem('user_job'));
    var legacyCity = safeTrim(localStorage.getItem('user_city'));
    var legacyPhone = safeTrim(localStorage.getItem('user_phone'));
    var legacyAvatar = safeTrim(localStorage.getItem('user_avatar'));
    var legacyStatus = safeTrim(localStorage.getItem('user_status')) || 'online';

    var name = fixeoName || legacyName || safeTrim(jsonUser.name);
    var email = fixeoUser || safeTrim(jsonUser.email) || legacyPhone;
    var role = normalizeRole(fixeoRole || legacyRole || jsonUser.role || 'client');
    var avatar = fixeoAvatar || legacyAvatar || safeTrim(jsonUser.avatar);
    var job = legacyJob || safeTrim(jsonUser.job);
    var city = legacyCity || safeTrim(jsonUser.city);
    var phone = legacyPhone || safeTrim(jsonUser.phone);
    var status = legacyStatus || safeTrim(jsonUser.status) || 'online';
    var id = safeTrim(jsonUser.id) || email || name;

    if (!name && email && email.indexOf('@') > -1) name = email.split('@')[0];
    if (!name && !email && !legacyLogged) return null;
    if (!name) name = 'Utilisateur';

    return {
      id: id || ('fixeo-' + role),
      name: name,
      role: role,
      email: email,
      avatar: avatar,
      job: job,
      city: city,
      phone: phone,
      status: status
    };
  }

  function syncDataAuthVisibility(user) {
    var isLoggedIn = !!user;
    var isAdmin = !!(user && user.role === 'admin');
    Array.prototype.forEach.call(document.querySelectorAll('[data-auth]'), function (node) {
      var rule = safeTrim(node.getAttribute('data-auth'));
      var visible = rule === 'guest' ? !isLoggedIn : rule === 'admin' ? isAdmin : isLoggedIn;
      node.style.display = visible ? '' : 'none';
    });
  }

  function updateAuthContainer(user) {
    var container = document.getElementById('auth-container');
    if (!container) return;
    if (user) {
      container.innerHTML =
        '<div class="fixeo-user-box">' +
          '<div class="fixeo-avatar">' + escapeHtml((user.name || 'U').charAt(0).toUpperCase()) + '</div>' +
          '<div class="fixeo-user-info">' +
            '<span class="fixeo-user-name">' + escapeHtml(user.name) + '</span>' +
            '<small class="fixeo-user-role">' + getRoleLabel(user.role) + '</small>' +
          '</div>' +
          '<button class="fixeo-logout-btn" type="button" onclick="window.fixeoGlobalLogout && window.fixeoGlobalLogout()">🚪 Déconnexion</button>' +
        '</div>';
    } else {
      container.innerHTML =
        '<a href="' + escapeHtml(resolveCoreHref('auth.html')) + '" class="btn-nav btn-nav-outline">Connexion</a>' +
        '<a href="' + escapeHtml(resolveCoreHref('auth.html#signup')) + '" class="btn-nav btn-nav-primary">Inscription</a>';
    }
  }

  function updateNavChip(user) {
    var avatarEl = document.getElementById('global-avatar') || document.getElementById('header-avatar') || document.getElementById('nav-avatar-initials');
    var nameEl = document.getElementById('global-username') || document.getElementById('header-username') || document.querySelector('.nav-user-name');
    var roleEl = document.getElementById('global-role');
    var userInfoEl = document.getElementById('user-info');
    var logoutBtn = document.getElementById('logout-btn');
    var loginBtn = document.getElementById('login-btn');
    var registerBtn = document.getElementById('register-btn');

    if (avatarEl) {
      avatarEl.innerHTML = '';
      avatarEl.textContent = user ? (user.name || 'U').charAt(0).toUpperCase() : 'U';
      if (user && user.avatar && /^https?:|^data:|^\//i.test(user.avatar)) {
        var img = document.createElement('img');
        img.src = user.avatar;
        img.alt = user.name || 'Utilisateur';
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        avatarEl.innerHTML = '';
        avatarEl.appendChild(img);
      }
    }

    if (nameEl) nameEl.textContent = user ? (user.name + ' (' + getRoleLabel(user.role) + ')') : 'Connexion';
    if (roleEl) roleEl.textContent = user ? getRoleLabel(user.role) : '';

    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
    if (loginBtn) loginBtn.style.display = user ? 'none' : '';
    if (registerBtn) registerBtn.style.display = user ? 'none' : '';

    if (userInfoEl) {
      if (user) {
        userInfoEl.innerHTML =
          '<span style="display:inline-flex;align-items:center;gap:6px;font-size:.82rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);padding:4px 10px;border-radius:20px;color:rgba(255,255,255,0.85);">' +
          getRoleLabel(user.role) + ' <strong>' + escapeHtml(user.name) + '</strong></span>';
        userInfoEl.style.display = 'inline-block';
      } else {
        userInfoEl.innerHTML = '';
        userInfoEl.style.display = 'none';
      }
    }
  }

  function updateSidebarProfile(user) {
    var sidebarAvatar = document.getElementById('sidebar-avatar');
    var sidebarUsername = document.getElementById('sidebar-username');
    var sidebarRole = document.getElementById('sidebar-role');

    if (sidebarAvatar) {
      if (user && user.avatar && /^https?:|^data:|^\//i.test(user.avatar)) {
        sidebarAvatar.innerHTML = '<img src="' + escapeHtml(user.avatar) + '" alt="' + escapeHtml(user.name) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
      } else {
        sidebarAvatar.innerHTML = '';
        sidebarAvatar.textContent = user ? (user.name || 'U').charAt(0).toUpperCase() : 'U';
      }
    }
    if (sidebarUsername) sidebarUsername.textContent = user ? user.name : 'Invité';
    if (sidebarRole) sidebarRole.textContent = user ? getRoleLabel(user.role) : '👤 Visiteur';
  }

  function updateDashboardLinks(user) {
    var dashLink = resolveCoreHref('auth.html');
    if (user) {
      dashLink = user.role === 'artisan' ? resolveCoreHref('dashboard-artisan.html') : (user.role === 'admin' ? resolveCoreHref('admin.html') : resolveCoreHref('dashboard-client.html'));
    }
    Array.prototype.forEach.call(document.querySelectorAll('a[data-role="dashboard"]'), function (link) {
      link.setAttribute('href', dashLink);
    });
  }

  function applyBodyClasses(user) {
    var isLoggedIn = !!user;
    var isAdmin = !!(user && user.role === 'admin' && (localStorage.getItem('fixeo_admin') === '1' || sessionStorage.getItem('fixeo_admin_auth') === '1'));
    document.body.classList.toggle('is-logged-in', isLoggedIn);
    document.body.classList.toggle('is-admin', isAdmin);
  }

  function resetAuthPageState() {
    var page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (page !== 'auth.html') return;

    var loginForm = document.getElementById('login-form');
    var signupForm = document.getElementById('signup-form');
    var loginError = document.getElementById('login-error');
    var signupError = document.getElementById('signup-error');
    var loginBtn = document.getElementById('login-btn');
    var signupBtn = document.getElementById('signup-btn');

    if (typeof window.switchTab === 'function') {
      try { window.switchTab('login'); } catch (error) {}
    }
    if (loginForm) loginForm.reset();
    if (signupForm) signupForm.reset();
    if (loginError) { loginError.textContent = ''; loginError.style.display = 'none'; }
    if (signupError) { signupError.textContent = ''; signupError.style.display = 'none'; }
    if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = '<span>Se connecter</span>'; }
    if (signupBtn) { signupBtn.disabled = false; signupBtn.innerHTML = '<span>Créer mon compte</span>'; }
    if (typeof window.setLoginMethod === 'function') {
      try { window.setLoginMethod('email'); } catch (error) {}
    }
  }

  function renderAll() {
    if (!document.body || isApplying) return;
    isApplying = true;
    try {
      var user = readStoredUser();
      applyBodyClasses(user);
      syncDataAuthVisibility(user);
      updateAuthContainer(user);
      updateNavChip(user);
      updateSidebarProfile(user);
      updateDashboardLinks(user);
      if (window.FixeoGlobalNav && typeof window.FixeoGlobalNav.normalizeLinks === 'function') {
        window.FixeoGlobalNav.normalizeLinks(document);
      }
      if (!user) resetAuthPageState();
    } finally {
      isApplying = false;
    }
  }

  function clearStoredSession() {
    LOCAL_KEYS.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (error) {}
    });
    SESSION_KEYS.forEach(function (key) {
      try { sessionStorage.removeItem(key); } catch (error) {}
    });
  }

  function broadcast(user) {
    renderAll();
    try {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { user: user || null } }));
    } catch (error) {}
  }

  function setActiveUser(payload) {
    payload = payload || {};
    var role = normalizeRole(payload.role || payload.user_role || payload.userRole || 'client');
    var name = safeTrim(payload.name || payload.full_name || payload.display_name);
    var email = safeTrim(payload.email || payload.phone || payload.user || payload.id);
    var avatar = safeTrim(payload.avatar);
    var job = safeTrim(payload.job || payload.categoryLabel || payload.category);
    var city = safeTrim(payload.city);
    var phone = safeTrim(payload.phone);
    var status = safeTrim(payload.status || 'online');
    var id = safeTrim(payload.id || email || name || ('fixeo-' + role));

    if (!name && email && email.indexOf('@') > -1) name = email.split('@')[0];
    if (!name) name = 'Utilisateur';
    if (!email) email = phone || (role + '-' + id);

    clearStoredSession();

    localStorage.setItem('fixeo_user', email);
    localStorage.setItem('fixeo_user_name', name);
    localStorage.setItem('fixeo_role', role);
    localStorage.setItem('role', role);
    localStorage.setItem('fixeo_logged', '1');
    if (avatar) localStorage.setItem('fixeo_avatar', avatar);

    localStorage.setItem('user_logged', 'true');
    localStorage.setItem('user_role', role);
    localStorage.setItem('user_name', name);
    if (job) localStorage.setItem('user_job', job);
    if (city) localStorage.setItem('user_city', city);
    if (phone) localStorage.setItem('user_phone', phone);
    if (avatar) localStorage.setItem('user_avatar', avatar);
    if (status) localStorage.setItem('user_status', status);

    var normalizedUser = {
      id: id,
      name: name,
      role: role,
      email: email,
      avatar: avatar,
      job: job,
      city: city,
      phone: phone,
      status: status
    };
    localStorage.setItem('user', JSON.stringify(normalizedUser));

    if (role === 'admin') {
      localStorage.setItem('fixeo_admin', '1');
      sessionStorage.setItem('fixeo_admin_auth', '1');
    }

    broadcast(normalizedUser);
    return normalizedUser;
  }

  function clearActiveUser(options) {
    options = options || {};
    clearStoredSession();
    broadcast(null);

    if (options.resetAuthPage !== false) resetAuthPageState();
    if (options.redirectTo) {
      window.location.href = resolveCoreHref(options.redirectTo);
    } else if (options.reload) {
      window.location.reload();
    }
  }

  var sessionApi = {
    keys: { local: LOCAL_KEYS.slice(), session: SESSION_KEYS.slice() },
    getUser: readStoredUser,
    setActiveUser: setActiveUser,
    clearActiveUser: clearActiveUser,
    apply: renderAll,
    resetAuthPageState: resetAuthPageState
  };
  window.FixeoAuthSession = sessionApi;

  window.fixeoGlobalLogout = function (options) {
    options = options || {};
    clearActiveUser({ redirectTo: resolveCoreHref(options.redirectTo || 'index.html') });
  };
  window.fixeoLogout = window.fixeoGlobalLogout;
  window.logout = window.fixeoGlobalLogout;

  window.addEventListener('storage', renderAll);
  window.addEventListener(AUTH_EVENT, function () { renderAll(); });

  renderAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll, { once: true });
  } else {
    renderAll();
  }
})(window);
