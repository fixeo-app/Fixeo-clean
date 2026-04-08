(function () {
  'use strict';

  const SESSION_KEYS = [
    'user_logged',
    'user_role',
    'user_name',
    'user_job',
    'user_city',
    'user_phone',
    'user_avatar',
    'user_status',
    'fixeo_user',
    'fixeo_user_name',
    'fixeo_role',
    'fixeo_avatar',
    'user'
  ];

  function safeTrim(value) {
    return String(value || '').trim();
  }

  function isLogged() {
    return localStorage.getItem('user_logged') === 'true' || Boolean(localStorage.getItem('fixeo_user'));
  }

  function getUser() {
    let jsonUser = null;
    try {
      const raw = localStorage.getItem('user');
      if (raw) jsonUser = JSON.parse(raw);
    } catch (error) {}

    const name = safeTrim(localStorage.getItem('user_name') || localStorage.getItem('fixeo_user_name') || jsonUser?.name);
    const role = safeTrim(localStorage.getItem('user_role') || localStorage.getItem('fixeo_role') || jsonUser?.role || 'client');
    const job = safeTrim(localStorage.getItem('user_job') || jsonUser?.job);
    const city = safeTrim(localStorage.getItem('user_city') || jsonUser?.city);
    const phone = safeTrim(localStorage.getItem('user_phone') || jsonUser?.phone || localStorage.getItem('fixeo_user'));
    const avatar = safeTrim(localStorage.getItem('user_avatar') || localStorage.getItem('fixeo_avatar') || jsonUser?.avatar);
    const status = safeTrim(localStorage.getItem('user_status') || jsonUser?.status || 'online');

    if (!name && !phone && !isLogged()) return null;

    return {
      name: name || 'Utilisateur',
      role: role || 'client',
      job,
      city,
      phone,
      avatar,
      status: status || 'online'
    };
  }

  function syncSessionToFixeo() {
    const user = getUser();
    if (!user || !isLogged()) return null;

    if (window.FixeoAuthSession?.setActiveUser) {
      return window.FixeoAuthSession.setActiveUser({
        name: user.name,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        job: user.job,
        city: user.city,
        status: user.status || 'online'
      });
    }

    localStorage.setItem('user_logged', 'true');
    localStorage.setItem('user_role', user.role);
    localStorage.setItem('user_name', user.name);
    if (user.job) localStorage.setItem('user_job', user.job);
    if (user.city) localStorage.setItem('user_city', user.city);
    if (user.phone) localStorage.setItem('user_phone', user.phone);
    if (user.avatar) localStorage.setItem('user_avatar', user.avatar);
    localStorage.setItem('user_status', user.status || 'online');

    localStorage.setItem('fixeo_user_name', user.name);
    localStorage.setItem('fixeo_role', user.role);
    localStorage.setItem('fixeo_user', user.phone || `${user.name.toLowerCase().replace(/\s+/g, '.')}@fixeo.local`);
    if (user.avatar) localStorage.setItem('fixeo_avatar', user.avatar);

    localStorage.setItem('user', JSON.stringify({
      name: user.name,
      role: user.role,
      job: user.job,
      city: user.city,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status || 'online'
    }));

    return user;
  }

  function clearSession(options) {
    options = options || {};
    try { sessionStorage.removeItem('fixeo_artisan_onboarding_notice_v1'); } catch (error) {}

    if (window.FixeoAuthSession?.clearActiveUser) {
      window.FixeoAuthSession.clearActiveUser({
        redirectTo: options.redirectTo || '',
        reload: options.reload === true,
        resetAuthPage: options.resetAuthPage !== false
      });
      return;
    }

    SESSION_KEYS.forEach(key => {
      try { localStorage.removeItem(key); } catch (error) {}
    });
    if (!options || options.reload !== false) {
      window.location.reload();
    }
  }

  function dashboardHref(user) {
    if (!user) return 'auth.html';
    if (user.role === 'artisan') return 'dashboard-artisan.html';
    if (user.role === 'admin') return 'admin.html';
    return 'dashboard-client.html';
  }

  function injectStyles() {
    if (document.getElementById('fixeo-session-mobile-style')) return;
    const style = document.createElement('style');
    style.id = 'fixeo-session-mobile-style';
    style.textContent = `
      @media (max-width: 768px) {
        .fixeo-session-avatar-menu {
          position: absolute;
          top: calc(100% + 10px);
          right: calc(12px + env(safe-area-inset-right, 0px));
          min-width: 196px;
          padding: 10px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(10,15,27,0.98), rgba(10,15,27,0.94));
          box-shadow: 0 20px 40px rgba(0,0,0,0.28);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 1265;
          opacity: 0;
          transform: translateY(-8px);
          pointer-events: none;
          transition: opacity .22s ease, transform .22s ease;
        }
        .fixeo-session-avatar-menu.is-open {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .fixeo-session-avatar-menu-head {
          padding: 8px 10px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 8px;
        }
        .fixeo-session-avatar-menu-head strong,
        .fixeo-session-avatar-menu-head span {
          display: block;
        }
        .fixeo-session-avatar-menu-head strong {
          color: #fff;
          font-size: .92rem;
          font-weight: 800;
        }
        .fixeo-session-avatar-menu-head span {
          margin-top: 4px;
          color: rgba(255,255,255,0.62);
          font-size: .76rem;
        }
        .fixeo-session-avatar-menu a,
        .fixeo-session-avatar-menu button {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 42px;
          padding: 10px 12px;
          border: 0;
          background: transparent;
          color: #fff;
          text-decoration: none;
          font-size: .9rem;
          font-weight: 600;
          border-radius: 14px;
        }
        .fixeo-session-avatar-menu button {
          cursor: pointer;
        }
        .fixeo-session-avatar-menu a:hover,
        .fixeo-session-avatar-menu button:hover {
          background: rgba(255,255,255,0.06);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceHeaderSession() {
    injectStyles();
    const root = document.querySelector('.fixeo-gh-mobile');
    if (!root) return;

    const user = syncSessionToFixeo();
    const avatarLink = root.querySelector('.fixeo-gh-avatar-link');
    if (!avatarLink) return;

    let menu = root.querySelector('.fixeo-session-avatar-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'fixeo-session-avatar-menu';
      root.appendChild(menu);
    }

    if (!user || !isLogged()) {
      avatarLink.setAttribute('href', 'auth.html');
      menu.classList.remove('is-open');
      menu.innerHTML = '';
      return;
    }

    avatarLink.setAttribute('href', dashboardHref(user));
    avatarLink.setAttribute('title', user.name);
    avatarLink.setAttribute('aria-label', `Compte ${user.name}`);

    menu.innerHTML = `
      <div class="fixeo-session-avatar-menu-head">
        <strong>${user.name}</strong>
        <span>${user.job || 'Artisan Fixeo'}${user.city ? ' · ' + user.city : ''}</span>
      </div>
      <a href="${dashboardHref(user)}">📊 Mon espace</a>
      <button type="button" data-fixeo-logout>🚪 Se déconnecter</button>`;

    const logoutBtn = menu.querySelector('[data-fixeo-logout]');
    logoutBtn?.addEventListener('click', function (event) {
      event.preventDefault();
      clearSession();
    });

    avatarLink.addEventListener('click', function (event) {
      event.preventDefault();
      menu.classList.toggle('is-open');
    });

    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) {
        menu.classList.remove('is-open');
      }
    });
  }

  function loginArtisan(payload) {
    const name = safeTrim(payload?.name || 'Artisan Fixeo');
    const role = 'artisan';
    const job = safeTrim(payload?.job || payload?.categoryLabel || 'Artisan');
    const city = safeTrim(payload?.city || 'Maroc');
    const phone = safeTrim(payload?.phone || '');
    const avatar = safeTrim(payload?.avatar || name.charAt(0).toUpperCase());

    if (window.FixeoAuthSession?.setActiveUser) {
      window.FixeoAuthSession.setActiveUser({
        name,
        role,
        job,
        city,
        phone,
        avatar,
        status: 'online'
      });
      return;
    }

    localStorage.setItem('user_logged', 'true');
    localStorage.setItem('user_role', role);
    localStorage.setItem('user_name', name);
    localStorage.setItem('user_job', job);
    localStorage.setItem('user_city', city);
    localStorage.setItem('user_phone', phone);
    localStorage.setItem('user_avatar', avatar);
    localStorage.setItem('user_status', 'online');
    syncSessionToFixeo();
  }

  window.FixeoSessionMobile = {
    isLogged,
    getUser,
    syncSessionToFixeo,
    loginArtisan,
    clearSession
  };

  syncSessionToFixeo();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(enhanceHeaderSession, 0);
    }, { once: true });
  } else {
    setTimeout(enhanceHeaderSession, 0);
  }
})();
