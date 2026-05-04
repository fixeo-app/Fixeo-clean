(function () {
  'use strict';

  const path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isDashboardClient = path === 'dashboard-client.html';
  const isDashboardArtisan = path === 'dashboard-artisan.html';
  const isDashboard = isDashboardClient || isDashboardArtisan;
  /* Homepage = index.html or root path — used to decide modal vs navigation for CTA */
  const isHomepage = (path === 'index.html' || path === '');

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
    const user = getAuthUser();

    /* ── Section 1 — Navigation ──────────────────────────────── */
    const navSection = `
      <div class="fixeo-gh-drawer-group">
        <div class="fixeo-gh-drawer-label">Navigation</div>
        <a class="fixeo-gh-drawer-link" href="index.html">\uD83C\uDFE0 Accueil</a>
        <a class="fixeo-gh-drawer-link" href="index.html#services">\uD83D\uDD27 Services</a>
        <a class="fixeo-gh-drawer-link" href="index.html#artisans-section">\uD83D\uDC77 Artisans</a>
        <a class="fixeo-gh-drawer-link" href="index.html#how-it-works">\u2139\uFE0F Comment \u00e7a marche</a>
        <a class="fixeo-gh-drawer-link" href="pricing.html">\uD83D\uDC8E Tarifs</a>
      </div>`;

    /* ── Section 2 — Besoin d'un artisan ─────────────────────── */
    const clientSection = `
      <div class="fixeo-gh-drawer-group">
        <div class="fixeo-gh-drawer-label">Besoin d\u2019un artisan</div>
        <a class="fixeo-gh-drawer-link" href="index.html#artisans-section">\uD83D\uDD0D Trouver un artisan</a>
        ${isHomepage
          ? '<button type="button" class="fixeo-gh-drawer-link fixeo-gh-drawer-cta is-primary" data-open-request-form="true" data-request-mode="marketplace">\uD83D\uDCDD Publier une demande</button>'
          : '<a class="fixeo-gh-drawer-link fixeo-gh-drawer-cta is-primary" href="index.html">\uD83D\uDCDD Publier une demande</a>'
        }
      </div>`;

    /* ── Section 3 — Pour les artisans ───────────────────────── */
    const artisanSection = `
      <div class="fixeo-gh-drawer-group">
        <div class="fixeo-gh-drawer-label">Pour les artisans</div>
        <a class="fixeo-gh-drawer-link" href="onboarding-artisan.html">\uD83E\uDDF0 Je suis artisan</a>
        <a class="fixeo-gh-drawer-link" href="artisan.html">\uD83D\uDC64 Revendiquer mon profil</a>
        <a class="fixeo-gh-drawer-link" href="dashboard-artisan.html">\uD83D\uDCCA Espace artisan</a>
      </div>`;

    /* ── Section 4 — Compte (auth-aware) ─────────────────────── */
    const compteSection = user
      ? `<div class="fixeo-gh-drawer-group fixeo-gh-drawer-compte">
          <div class="fixeo-gh-drawer-label">Mon compte</div>
          <a class="fixeo-gh-drawer-link fixeo-gh-drawer-compte-user" href="${user.role === 'artisan' ? 'dashboard-artisan.html' : 'dashboard-client.html'}">
            <span class="fixeo-gh-drawer-avatar">${esc(user.name.charAt(0).toUpperCase())}</span>
            <span>${esc(user.name)}</span>
          </a>
          <a class="fixeo-gh-drawer-link" href="${user.role === 'artisan' ? 'dashboard-artisan.html' : 'dashboard-client.html'}">\uD83D\uDCCA Mon dashboard</a>
          <a class="fixeo-gh-drawer-link" id="fixeo-gh-drawer-logout" href="#">\uD83D\uDEAA D\u00e9connexion</a>
        </div>`
      : `<div class="fixeo-gh-drawer-group">
          <div class="fixeo-gh-drawer-label">Compte</div>
          <a class="fixeo-gh-drawer-cta is-primary fixeo-gh-drawer-link" href="auth.html?mode=login">\uD83D\uDD13 Connexion</a>
          <a class="fixeo-gh-drawer-link" href="auth.html?mode=register">\u2728 Inscription</a>
        </div>`;

    /* ── Language selector ───────────────────────────────────── */
    const langSection = `
      <div class="fixeo-gh-drawer-group fixeo-gh-drawer-lang">
        <div class="fixeo-gh-drawer-label">Langue</div>
        <div class="fixeo-gh-drawer-lang-row">
          <button class="fixeo-gh-drawer-lang-btn" data-lang="fr">FR</button>
          <button class="fixeo-gh-drawer-lang-btn" data-lang="ar">AR</button>
          <button class="fixeo-gh-drawer-lang-btn" data-lang="en">EN</button>
        </div>
      </div>`;

    /* ── Dashboard section (only on dashboard pages) ─────────── */
    const dashboardMarkup = dashboardLinks.length
      ? `<div class="fixeo-gh-drawer-group">
          <div class="fixeo-gh-drawer-label">Dashboard</div>
          ${dashboardLinks.map(link => `<a class="fixeo-gh-drawer-link" href="${link.href}" ${link.onclick ? `onclick="${link.onclick}"` : ''}>${link.label}</a>`).join('')}
        </div>`
      : '';

    return `
      <div class="fixeo-gh-drawer" aria-hidden="true">
        ${navSection}
        ${dashboardMarkup}
        ${clientSection}
        ${artisanSection}
        ${compteSection}
        ${langSection}
      </div>
      <button class="fixeo-gh-backdrop" type="button" aria-label="Fermer le menu"></button>`;
  }

  function buildMarkup() {
    return `
      <div class="fixeo-gh-mobile" data-page="${esc(path)}">
        <div class="fixeo-gh-mobile-bar">
          <a class="fixeo-gh-brand" href="index.html" aria-label="Fixeo — Accueil">
            <img src="img/logo.png" alt="Fixeo" class="fixeo-logo-img" height="26" loading="eager">
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

    /* ── T1: Single-owner declaration ───────────────────────────
       Marks this file as the canonical mobile menu controller.
       Other files (header-unified.js, homepage-v13.js, main.js,
       fixeo_v5_fixes.js) check this flag before attaching
       hamburger/drawer listeners and skip if already owned.
    ─────────────────────────────────────────────────────────── */
    window.FixeoMobileMenu = window.FixeoMobileMenu || {};
    window.FixeoMobileMenu.initialized = true;
    window.FixeoMobileMenu.owner = 'fixeo-header-global';
    window.FixeoMobileMenu.open   = function () { openDrawer(mobileRoot); };
    window.FixeoMobileMenu.close  = function () { closeDrawer(mobileRoot); };
    window.FixeoMobileMenu.toggle = function () { toggleDrawer(mobileRoot); };
    window.FixeoMobileMenu.isOpen = function () {
      var d = mobileRoot && mobileRoot.querySelector('.fixeo-gh-drawer');
      return !!(d && d.classList.contains('is-open'));
    };

    /* ESC key closes drawer */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && window.FixeoMobileMenu.isOpen()) {
        closeDrawer(mobileRoot);
      }
    });
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
      link.addEventListener('click', function (e) {
        /* If this is a request-form trigger, close drawer then open modal */
        if (link.hasAttribute('data-open-request-form')) {
          e.preventDefault();
          e.stopPropagation();
          closeDrawer(root);
          setTimeout(function () {
            if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
              window.FixeoClientRequest.open(link);
            } else if (typeof window.openModal === 'function') {
              window.openModal('request-modal');
            } else {
              var m = document.getElementById('request-modal');
              if (m) { m.style.display = 'block'; m.classList.add('open', 'active'); document.body.classList.add('modal-open'); }
            }
          }, 80);
          return;
        }
        closeDrawer(root);
      });
    });

    root.querySelector('.fixeo-gh-backdrop')?.addEventListener('click', function () {
      closeDrawer(root);
    });

    /* Logout link wired here so it works even after DOM rebuild */
    root.addEventListener('click', function (e) {
      const logout = e.target.closest('#fixeo-gh-drawer-logout');
      if (!logout) return;
      e.preventDefault();
      try {
        localStorage.removeItem('user');
        localStorage.removeItem('fixeo_user_name');
        localStorage.removeItem('fixeo_user');
        localStorage.removeItem('fixeo_role');
        localStorage.removeItem('fixeo_avatar');
        if (window.supabase && typeof window.supabase.auth?.signOut === 'function') {
          window.supabase.auth.signOut();
        }
      } catch (_) {}
      window.location.href = 'index.html';
    });

    /* Language buttons in drawer */
    root.addEventListener('click', function (e) {
      const btn = e.target.closest('.fixeo-gh-drawer-lang-btn');
      if (!btn) return;
      const lang = btn.dataset.lang;
      if (!lang) return;
      const sel = document.getElementById('lang-select');
      if (sel) { sel.value = lang; sel.dispatchEvent(new Event('change')); }
      else if (window.i18n && typeof window.i18n.setLang === 'function') {
        window.i18n.setLang(lang);
      }
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
