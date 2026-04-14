(function () {
  'use strict';

  const path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isDashboardClient = path === 'dashboard-client.html';
  const isDashboardArtisan = path === 'dashboard-artisan.html';
  const isDashboard = isDashboardClient || isDashboardArtisan;

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAuthUser() {
    let user = null;
    try {
      const raw = localStorage.getItem('user');
      if (raw) user = JSON.parse(raw);
    } catch (error) {}

    const name = localStorage.getItem('fixeo_user_name') || user?.name || '';
    const role = localStorage.getItem('fixeo_role') || localStorage.getItem('role') || user?.role || '';
    const email = localStorage.getItem('fixeo_user') || user?.email || '';
    const avatar = localStorage.getItem('fixeo_avatar') || user?.avatar || '';

    if (!name && !email && !localStorage.getItem('fixeo_user')) return null;

    return {
      name: name || (email ? email.split('@')[0] : 'Utilisateur'),
      role: role || 'client',
      avatar: avatar || ''
    };
  }

  function getAvatarInitial(user) {
    return (user?.name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }

  function resolveCoreHref(href) {
    if (window.FixeoGlobalNav && typeof window.FixeoGlobalNav.resolveHref === 'function') {
      return window.FixeoGlobalNav.resolveHref(href);
    }
    return href;
  }

  function getAvatarHref(user) {
    if (!user) return resolveCoreHref('auth.html');
    if (user.role === 'artisan') return resolveCoreHref('dashboard-artisan.html');
    if (user.role === 'admin') return resolveCoreHref('admin.html');
    return resolveCoreHref('dashboard-client.html');
  }

  function getDashboardLinks() {
    if (isDashboardClient) {
      return [
        { href: '#overview', label: '📊 Vue d’ensemble', onclick: "showSection('overview')" },
        { href: '#bookings', label: '📅 Réservations', onclick: "showSection('bookings')" },
        { href: '#messages', label: '💬 Messages', onclick: "showSection('messages')" },
        { href: '#reviews', label: '⭐ Avis', onclick: "showSection('reviews')" },
        { href: '#settings', label: '⚙️ Paramètres', onclick: "showSection('settings')" }
      ];
    }
    if (isDashboardArtisan) {
      return [
        { href: '#overview', label: '📊 Vue d’ensemble', onclick: "showSection('overview')" },
        { href: '#requests', label: '📬 Demandes', onclick: "showSection('requests')" },
        { href: '#missions', label: '🎯 Missions', onclick: "showSection('missions')" },
        { href: '#earnings', label: '💰 Revenus', onclick: "showSection('earnings')" },
        { href: '#settings', label: '⚙️ Paramètres', onclick: "showSection('settings')" }
      ];
    }
    return [];
  }

  function buildDrawerMarkup() {
    const dashboardLinks = getDashboardLinks();
    const commonLinks = [
      { href: 'index.html', label: '🏠 Accueil' },
      { href: 'index.html#services', label: '🛠 Services' },
      { href: 'index.html#artisans-section', label: '👷 Artisans' },
      { href: 'pricing.html', label: '💎 Tarifs' },
      { href: 'artisan.html', label: '👤 Profil artisan' },
      { href: 'onboarding-artisan.html', label: '🧰 Je suis artisan' }
    ];

    const dashboardMarkup = dashboardLinks.length
      ? `
        <div class="fixeo-gh-drawer-group">
          <div class="fixeo-gh-drawer-label">Dashboard</div>
          ${dashboardLinks.map(link => `<a class="fixeo-gh-drawer-link" href="${link.href}" ${link.onclick ? `onclick="${link.onclick}"` : ''}>${link.label}</a>`).join('')}
        </div>`
      : '';

    return `
      <div class="fixeo-gh-drawer" aria-hidden="true">
        <div class="fixeo-gh-drawer-group">
          <div class="fixeo-gh-drawer-label">Navigation</div>
          ${commonLinks.map(link => `<a class="fixeo-gh-drawer-link" href="${link.href}">${link.label}</a>`).join('')}
        </div>
        ${dashboardMarkup}
        <div class="fixeo-gh-drawer-group">
          <div class="fixeo-gh-drawer-label">Actions</div>
          <a class="fixeo-gh-drawer-cta is-primary" href="index.html#artisans-section">Publier une demande</a>
          <a class="fixeo-gh-drawer-cta" href="auth.html">Connexion / compte</a>
        </div>
      </div>
      <button class="fixeo-gh-backdrop" type="button" aria-label="Fermer le menu"></button>`;
  }

  function buildMarkup() {
    return `
      <div class="fixeo-gh-mobile" data-page="${esc(path)}">
        <div class="fixeo-gh-mobile-bar">
          <a class="fixeo-gh-brand" href="index.html" aria-label="Fixeo — Accueil">
            <img src="img/logo-horizontal.png" alt="Fixeo" class="fixeo-logo-img" width="auto" height="28" loading="eager">
          </a>
          <div class="fixeo-gh-actions">
            <button class="fixeo-gh-icon-btn fixeo-gh-search" type="button" aria-label="Recherche">
              <span class="fixeo-gh-icon">🔍</span>
            </button>
            <button class="fixeo-gh-icon-btn fixeo-gh-notif notif-btn" type="button" aria-label="Notifications">
              <span class="fixeo-gh-icon">🔔</span>
              <span class="notif-badge fixeo-gh-badge" aria-live="polite"></span>
            </button>
            <a class="fixeo-gh-avatar-link" href="auth.html" aria-label="Mon compte">
              <span class="fixeo-gh-avatar">U</span>
            </a>
            <button class="fixeo-gh-icon-btn fixeo-gh-menu" type="button" aria-label="Ouvrir le menu" aria-expanded="false">
              <span class="fixeo-gh-menu-line"></span>
              <span class="fixeo-gh-menu-line"></span>
              <span class="fixeo-gh-menu-line"></span>
            </button>
          </div>
        </div>
        <div class="fixeo-gh-notif-panel" aria-hidden="true"></div>
        ${isDashboard ? '' : buildDrawerMarkup()}
      </div>`;
  }

  function findHost() {
    const navbar = document.querySelector('nav.navbar');
    if (navbar) {
      return { host: navbar, type: 'navbar', shell: navbar };
    }
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
      const inner = siteHeader.querySelector('.container') || siteHeader;
      return { host: inner, type: 'site', shell: siteHeader };
    }
    return null;
  }

  function ensureSyntheticHost() {
    const shell = document.createElement('header');
    shell.className = 'site-header fixeo-gh-shell fixeo-gh-shell--synthetic';
    shell.innerHTML = '<div class="container fixeo-gh-shell-inner"></div>';
    document.body.insertAdjacentElement('afterbegin', shell);
    return { host: shell.querySelector('.fixeo-gh-shell-inner'), type: 'synthetic', shell };
  }

  function ensureDrawerPortal(root) {
    if (!root || isDashboard) return;
    const drawer = root.querySelector('.fixeo-gh-drawer');
    const backdrop = root.querySelector('.fixeo-gh-backdrop');
    if (!drawer || !backdrop || drawer.dataset.fixeoGhPortal === '1') return;

    let portal = document.getElementById('fixeo-gh-menu-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'fixeo-gh-menu-portal';
      document.body.appendChild(portal);
    }

    portal.appendChild(drawer);
    portal.appendChild(backdrop);
    drawer.dataset.fixeoGhPortal = '1';
    backdrop.dataset.fixeoGhPortal = '1';
  }

  function getDrawerParts(root) {
    return {
      drawer: root?.querySelector('.fixeo-gh-drawer') || document.querySelector('.fixeo-gh-drawer'),
      backdrop: root?.querySelector('.fixeo-gh-backdrop') || document.querySelector('.fixeo-gh-backdrop'),
      menuBtn: root?.querySelector('.fixeo-gh-menu') || document.querySelector('.fixeo-gh-menu')
    };
  }

  function mount() {
    document.body.classList.add('fixeo-gh-enabled');
    const found = findHost() || ensureSyntheticHost();
    const host = found.host;
    const shell = found.shell;
    if (!host || host.querySelector('.fixeo-gh-mobile')) return;

    shell.classList.add('fixeo-gh-shell');
    if (found.type !== 'navbar') host.classList.add('fixeo-gh-shell-inner-host');
    if (host.tagName && host.tagName.toLowerCase() === 'nav') host.classList.add('fixeo-gh-host');

    Array.from(host.children).forEach(child => {
      if (!child.classList.contains('fixeo-gh-mobile')) child.classList.add('fixeo-gh-original-node');
    });

    host.insertAdjacentHTML('afterbegin', buildMarkup());

    document.querySelectorAll('.mobile-nav').forEach(node => node.classList.add('fixeo-gh-legacy-drawer'));
    document.querySelectorAll('.mobile-nav-backdrop').forEach(node => node.classList.add('fixeo-gh-legacy-backdrop'));

    const mobileRoot = host.querySelector('.fixeo-gh-mobile');
    setupInteractions(mobileRoot);
    ensureDrawerPortal(mobileRoot);
    if (window.FixeoGlobalNav && typeof window.FixeoGlobalNav.normalizeLinks === 'function') {
      window.FixeoGlobalNav.normalizeLinks(document.body);
    }
  }

  function closeDrawer(root) {
    const { drawer, backdrop, menuBtn } = getDrawerParts(root);
    if (drawer) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.classList.remove('is-open');
    if (menuBtn) {
      menuBtn.classList.remove('is-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    document.body.classList.remove('fixeo-gh-menu-open');
    document.body.style.overflow = '';
  }

  function openDrawer(root) {
    const { drawer, backdrop, menuBtn } = getDrawerParts(root);
    if (drawer) {
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.classList.add('is-open');
    if (menuBtn) {
      menuBtn.classList.add('is-open');
      menuBtn.setAttribute('aria-expanded', 'true');
    }
    document.body.classList.add('fixeo-gh-menu-open');
    document.body.style.overflow = 'hidden';
  }

  function toggleDrawer(root) {
    const { drawer } = getDrawerParts(root);
    if (!drawer) return;
    if (drawer.classList.contains('is-open')) closeDrawer(root);
    else openDrawer(root);
  }

  function toggleNotifPanel(root) {
    const panel = root?.querySelector('.fixeo-gh-notif-panel');
    if (!panel) return;
    const next = !panel.classList.contains('is-open');
    root.querySelectorAll('.fixeo-gh-notif-panel').forEach(node => node.classList.remove('is-open'));
    if (next) panel.classList.add('is-open');
  }

  function closeNotifPanel(root) {
    const panel = root?.querySelector('.fixeo-gh-notif-panel');
    if (panel) panel.classList.remove('is-open');
  }

  function openSearch() {
    if (window.QuickSearchModal?.focusInline) {
      window.QuickSearchModal.focusInline();
      return;
    }
    if (window.QuickSearchModal?.open) {
      window.QuickSearchModal.open();
      return;
    }
    const candidate = document.getElementById('hero-search-input') || document.getElementById('ssb-input-nlp') || document.getElementById('search-input');
    if (candidate && typeof candidate.focus === 'function') {
      try { candidate.focus(); return; } catch (error) {}
    }
    window.location.href = resolveCoreHref('index.html#services');
  }

  function getNotifCount() {
    const raw = parseInt(localStorage.getItem('fixeo_notif_count') || '0', 10);
    return Number.isFinite(raw) ? raw : 0;
  }

  function updateNotif(root) {
    const count = getNotifCount();
    const badge = root?.querySelector('.fixeo-gh-badge');
    const panel = root?.querySelector('.fixeo-gh-notif-panel');
    if (badge) badge.textContent = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    if (panel) {
      panel.innerHTML = count > 0
        ? `
          <div class="fixeo-gh-notif-title">Notifications</div>
          <div class="fixeo-gh-notif-item"><span class="fixeo-gh-notif-dot"></span><div>Vous avez <strong>${count}</strong> notification${count > 1 ? 's' : ''} en attente.</div></div>
          <div class="fixeo-gh-notif-item"><span class="fixeo-gh-notif-dot"></span><div>Vos demandes et messages restent accessibles sans changer la navigation existante.</div></div>`
        : `
          <div class="fixeo-gh-notif-title">Notifications</div>
          <div class="fixeo-gh-notif-empty">Aucune notification pour le moment.</div>`;
    }
  }

  function updateAvatar(root) {
    const user = getAuthUser();
    const avatar = root?.querySelector('.fixeo-gh-avatar');
    const link = root?.querySelector('.fixeo-gh-avatar-link');
    if (!avatar || !link) return;
    avatar.textContent = getAvatarInitial(user);
    link.href = getAvatarHref(user);
    link.setAttribute('title', user ? user.name : 'Mon compte');
    link.setAttribute('aria-label', user ? `Mon compte ${user.name}` : 'Mon compte');
  }

  function toggleDashboardSidebar(root) {
    const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
    const btn = root?.querySelector('.fixeo-gh-menu');
    if (!sidebar || !btn) return;
    sidebar.classList.toggle('open');
    btn.classList.toggle('is-open', sidebar.classList.contains('open'));
    btn.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    let overlay = document.querySelector('.sidebar-mobile-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-mobile-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1240;display:none;backdrop-filter:blur(4px)';
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('open');
        btn.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        overlay.style.display = 'none';
      });
      document.body.appendChild(overlay);
    }
    overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
  }

  function setupInteractions(root) {
    if (!root) return;

    updateNotif(root);
    updateAvatar(root);

    root.querySelector('.fixeo-gh-search')?.addEventListener('click', function (event) {
      event.preventDefault();
      openSearch();
    });

    root.querySelector('.fixeo-gh-notif')?.addEventListener('click', function (event) {
      event.preventDefault();
      if (window.notifSystem?.togglePanel) {
        try {
          window.notifSystem.togglePanel();
          return;
        } catch (error) {}
      }
      toggleNotifPanel(root);
    });

    root.querySelector('.fixeo-gh-menu')?.addEventListener('click', function (event) {
      event.preventDefault();
      if (isDashboard) {
        toggleDashboardSidebar(root);
        return;
      }
      closeNotifPanel(root);
      toggleDrawer(root);
    });

    root.querySelectorAll('.fixeo-gh-drawer-link, .fixeo-gh-drawer-cta').forEach(link => {
      link.addEventListener('click', function () {
        closeDrawer(root);
      });
    });

    root.querySelector('.fixeo-gh-backdrop')?.addEventListener('click', function () {
      closeDrawer(root);
    });

    document.addEventListener('click', function (event) {
      const { drawer, backdrop } = getDrawerParts(root);
      const clickInsideRoot = root.contains(event.target);
      const clickInsideDrawer = !!(drawer && drawer.contains(event.target));
      const clickOnBackdrop = !!(backdrop && backdrop.contains(event.target));

      if (!clickInsideRoot) {
        closeNotifPanel(root);
      }
      if (drawer && drawer.classList.contains('is-open') && !clickInsideRoot && !clickInsideDrawer && !clickOnBackdrop) {
        closeDrawer(root);
      }
    });

    window.addEventListener('storage', function () {
      updateNotif(root);
      updateAvatar(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
