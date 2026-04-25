/* ================================================================
   FIXEO V10 — JS HEADER UNIFIED (js/header-unified.js)
   • Sticky scroll + hero-visible transparency
   • Auth state → visibilité Dashboard / Admin
   • Hamburger toggle + fermeture intelligente
   • Dropdown hover/click (desktop + touch)
   • Active nav-link par page courante
   • Quick-search shortcut (/)
   ================================================================ */

(function () {
  'use strict';

  /* ── UTILS ─────────────────────────────────────────────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const FILE_PROTOCOL = 'file:';
  const GLOBAL_LINK_SELECTOR = [
    '.navbar a[href]',
    '.mobile-nav a[href]',
    '.site-header a[href]',
    '.fixeo-gh-mobile a[href]',
    'a[data-role="dashboard"][href]',
    '#login-btn[href]',
    '#register-btn[href]',
    '#auth-container a[href]',
    '.sidebar a[href]',
    '.sidebar-link[href]',
    '.demandes-back-link[href]',
    '.demandes-header-link[href]'
  ].join(', ');
  const CORE_PAGES = new Set([
    'index.html', 'auth.html', 'pricing.html', 'dashboard-client.html', 'dashboard-artisan.html',
    'admin.html', 'artisan.html', 'artisan-profile.html', 'onboarding-artisan.html',
    'results.html', 'confirmation.html', 'payment-success.html', 'payment-cancel.html',
    'service-seo.html', 'plombier-casablanca.html', 'electricien-rabat.html',
    'peinture-fes.html', 'serrurier-marrakech.html'
  ]);
  let projectRootURLCache = null;
  let localNavObserver = null;

  function isLocalFileEnvironment() {
    return String(window.location.protocol || '').toLowerCase() === FILE_PROTOCOL;
  }

  function getProjectRootURL() {
    if (projectRootURLCache) return projectRootURLCache;

    let scriptUrl = '';
    try {
      scriptUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
    } catch (error) {}

    if (!scriptUrl) {
      const scriptNode = Array.from(document.scripts || []).find((node) => /(?:^|\/)js\/header-unified\.js(?:[?#].*)?$/i.test(node.getAttribute('src') || ''));
      scriptUrl = scriptNode && scriptNode.src ? scriptNode.src : '';
    }

    try {
      projectRootURLCache = scriptUrl ? new URL('../', scriptUrl).href : new URL('./', window.location.href).href;
    } catch (error) {
      projectRootURLCache = window.location.href;
    }
    return projectRootURLCache;
  }

  function isSpecialHref(href) {
    return !href || href.startsWith('#') || /^(?:javascript:|mailto:|tel:|sms:|data:)/i.test(href);
  }

  function splitHrefParts(href) {
    const match = String(href || '').match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    return {
      path: match && match[1] ? match[1] : '',
      query: match && match[2] ? match[2] : '',
      hash: match && match[3] ? match[3] : ''
    };
  }

  function normalizeCorePath(rawPath) {
    const path = String(rawPath || '').trim();
    if (!path) return '';
    if (path === '/') return 'index.html';

    const withoutOrigin = path.replace(/^[a-z]+:\/\/[^/]+/i, '');
    const normalized = withoutOrigin.replace(/^\/+/, '').replace(/^\.\//, '');
    const target = normalized.split('/').pop();
    return CORE_PAGES.has(target) ? target : '';
  }

  function resolveProjectHref(rawHref) {
    const href = String(rawHref || '').trim();
    if (!isLocalFileEnvironment() || isSpecialHref(href)) return href;

    const parts = splitHrefParts(href);
    const normalizedPath = normalizeCorePath(parts.path);
    if (!normalizedPath) return href;

    try {
      const url = new URL(normalizedPath, getProjectRootURL());
      url.search = parts.query || '';
      url.hash = parts.hash || '';
      return url.href;
    } catch (error) {
      return href;
    }
  }

  function normalizeLinkHref(node) {
    if (!node || typeof node.getAttribute !== 'function') return;
    const rawHref = node.getAttribute('href') || '';
    const resolvedHref = resolveProjectHref(rawHref);
    if (resolvedHref && resolvedHref !== rawHref) {
      node.setAttribute('href', resolvedHref);
    }
  }

  function normalizeGlobalLinks(ctx = document) {
    if (!isLocalFileEnvironment() || !ctx) return;
    const roots = [];
    if (ctx.nodeType === 1 || ctx.nodeType === 9) roots.push(ctx);
    if (!roots.length) roots.push(document);

    roots.forEach((root) => {
      if (root.matches && root.matches(GLOBAL_LINK_SELECTOR)) normalizeLinkHref(root);
      $$(GLOBAL_LINK_SELECTOR, root).forEach(normalizeLinkHref);
    });
  }

  function initLocalNavigationResolver() {
    window.FixeoGlobalNav = window.FixeoGlobalNav || {};
    window.FixeoGlobalNav.isLocalFile = isLocalFileEnvironment;
    window.FixeoGlobalNav.getProjectRootURL = getProjectRootURL;
    window.FixeoGlobalNav.resolveHref = resolveProjectHref;
    window.FixeoGlobalNav.normalizeLinks = normalizeGlobalLinks;

    normalizeGlobalLinks(document);

    if (!isLocalFileEnvironment() || localNavObserver || !window.MutationObserver) return;

    localNavObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          normalizeLinkHref(mutation.target);
          return;
        }
        mutation.addedNodes.forEach((node) => {
          if (node && (node.nodeType === 1 || node.nodeType === 9)) {
            normalizeGlobalLinks(node);
          }
        });
      });
    });

    localNavObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  }

  /* ── AUTH STATE ────────────────────────────────────────────── */
  /**
   * Détecte si l'utilisateur est connecté ou admin
   * à partir du localStorage (clés standard Fixeo).
   * Étend le body avec les classes .is-logged-in / .is-admin.
   */
  function getSessionUser() {
    if (window.FixeoAuthSession && typeof window.FixeoAuthSession.getUser === 'function') {
      return window.FixeoAuthSession.getUser();
    }

    const fixeoUser = localStorage.getItem('fixeo_user') || '';
    let userObj = null;
    try {
      const userJSON = localStorage.getItem('user');
      if (userJSON) userObj = JSON.parse(userJSON);
    } catch (e) {}

    const name = localStorage.getItem('fixeo_user_name') || localStorage.getItem('user_name') || userObj?.name || '';
    const role = localStorage.getItem('fixeo_role') || localStorage.getItem('user_role') || localStorage.getItem('role') || userObj?.role || '';
    const avatar = localStorage.getItem('fixeo_avatar') || localStorage.getItem('user_avatar') || userObj?.avatar || '';

    if (!name && !fixeoUser && localStorage.getItem('user_logged') !== 'true') return null;
    return {
      name: name || (fixeoUser && fixeoUser.includes('@') ? fixeoUser.split('@')[0] : 'Utilisateur'),
      role: ['admin', 'artisan', 'client'].includes(String(role).toLowerCase()) ? String(role).toLowerCase() : 'client',
      avatar: avatar || ''
    };
  }

  function applyAuthState() {
    const user = getSessionUser();
    const loggedIn = !!user;
    const adminMode = !!(user && user.role === 'admin' && (
      localStorage.getItem('fixeo_admin') === '1' ||
      sessionStorage.getItem('fixeo_admin_auth') === '1'
    ));

    document.body.classList.toggle('is-logged-in', loggedIn);
    document.body.classList.toggle('is-admin', adminMode);

    const nameEl = document.getElementById('global-username') || document.getElementById('header-username') || $('.nav-user-name');
    if (nameEl) {
      if (loggedIn) {
        const roleLabel = user.role === 'artisan' ? '🔧 Artisan'
                          : user.role === 'admin' ? '🛡 Admin'
                          : '👤 Client';
        nameEl.textContent = `${user.name} (${roleLabel})`;
      } else {
        nameEl.textContent = 'Connexion';
      }
    }

    const avatarEl = document.getElementById('global-avatar') || document.getElementById('header-avatar') || document.getElementById('nav-avatar-initials');
    if (avatarEl) {
      avatarEl.innerHTML = '';
      avatarEl.textContent = loggedIn ? (user.name || 'U').charAt(0).toUpperCase() : 'U';
      if (loggedIn && user.avatar && /^https?:|^data:|^\//i.test(user.avatar)) {
        const img = document.createElement('img');
        img.src = user.avatar;
        img.alt = user.name;
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        avatarEl.innerHTML = '';
        avatarEl.appendChild(img);
      }
    }

    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
      if (loggedIn) {
        const roleLabel = user.role === 'artisan' ? '🔧 Artisan'
                          : user.role === 'admin' ? '🛡 Admin'
                          : '👤 Client';
        userInfoEl.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:.82rem;
            background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
            padding:4px 10px;border-radius:20px;color:rgba(255,255,255,0.85);">
            ${roleLabel} <strong>${user.name}</strong>
          </span>
        `;
        userInfoEl.style.display = 'inline-block';
      } else {
        userInfoEl.innerHTML = '';
        userInfoEl.style.display = 'none';
      }
    }

    const syncNotifBadges = () => {
      if (window.notifSystem?.syncExternalBadges) {
        window.notifSystem.syncExternalBadges();
        return;
      }
      const notifCount = parseInt(localStorage.getItem('fixeo_notif_count') || '0', 10);
      $$('.notif-badge, .fixeo-gh-badge').forEach(badge => {
        if (notifCount > 0 && loggedIn) {
          badge.classList.add('has-notif');
          badge.textContent = notifCount > 99 ? '99+' : notifCount;
        } else {
          badge.classList.remove('has-notif');
          badge.textContent = '';
        }
      });
    };
    syncNotifBadges();
    normalizeGlobalLinks(document);
    window.removeEventListener('fixeo:notifications:updated', syncNotifBadges);
    window.addEventListener('fixeo:notifications:updated', syncNotifBadges);
  }

  /* ── STICKY + HERO VISIBILITY ──────────────────────────────── */
  function initSticky() {
    const navbar = $('.navbar');
    if (!navbar) return;

    const hero = $('section.hero, #home, .hero');

    function onScroll() {
      const scrolled = window.scrollY > 50;
      navbar.classList.toggle('scrolled', scrolled);

      /* hero-visible: hero section partially in view */
      if (hero) {
        const heroBottom = hero.getBoundingClientRect().bottom;
        navbar.classList.toggle('hero-visible', heroBottom > 0 && !scrolled);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); /* run once on load */
  }

  /* ── ACTIVE NAV LINK ───────────────────────────────────────── */
  function setActiveLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const currentHash = window.location.hash;

    $$('.navbar-nav .nav-link, .mobile-nav .nav-link').forEach(link => {
      const href = link.getAttribute('href') || '';
      const linkPage = href.split('#')[0].split('/').pop();
      const linkHash = href.includes('#') ? '#' + href.split('#')[1] : '';

      link.classList.remove('active');

      /* Exact page match */
      if (linkPage === currentPage && linkPage !== '') {
        if (!linkHash || linkHash === currentHash) {
          link.classList.add('active');
        }
      }
      /* index.html + Accueil */
      if ((currentPage === '' || currentPage === 'index.html') &&
          (href === '#home' || href === 'index.html' || href === './')) {
        link.classList.add('active');
      }
    });

    /* Scroll-spy for index page hash links */
    if (currentPage === '' || currentPage === 'index.html') {
      const sections = $$('section[id]');
      if (!sections.length) return;

      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = '#' + entry.target.id;
            $$('.navbar-nav .nav-link[href="' + id + '"], .mobile-nav .nav-link[href="' + id + '"]').forEach(l => {
              $$('.navbar-nav .nav-link, .mobile-nav .nav-link').forEach(x => x.classList.remove('active'));
              l.classList.add('active');
            });
          }
        });
      }, { rootMargin: '-40% 0px -55% 0px' });

      sections.forEach(s => observer.observe(s));
    }
  }

  /* ── HAMBURGER ─────────────────────────────────────────────── */
  function initHamburger() {
    if (window.FixeoMobileMenu && window.FixeoMobileMenu.initialized) return;
    const hamburgers = $$('.hamburger');
    const mobileNav = $('.mobile-nav');
    if (!mobileNav) return;

    function toggleMenu(forceClose = false) {
      const isOpen = mobileNav.classList.contains('open');
      const nextState = forceClose ? false : !isOpen;

      mobileNav.classList.toggle('open', nextState);
      hamburgers.forEach(h => {
        h.classList.toggle('open', nextState);
        h.setAttribute('aria-expanded', String(nextState));
      });

      document.body.classList.toggle('mobile-menu-open', nextState);

      /* Prevent body scroll when menu open */
      document.body.style.overflow = nextState ? 'hidden' : '';
    }

    hamburgers.forEach(h => {
      h.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
      });
    });

    /* Close on mobile nav link click */
    /* Close on mobile nav link click — FIX MODAL */
$$('.mobile-nav .nav-link, .mobile-nav [data-open-request-form], .mobile-nav [data-open-express-request]').forEach(link => {
  link.addEventListener('click', (e) => {

    const isRequestTrigger =
      link.matches('[data-open-request-form]') ||
      link.matches('[data-open-express-request]') ||
      link.classList.contains('mobile-nav-action-link-request') ||
      link.classList.contains('mobile-nav-action-link-urgent');

    // ✅ IMPORTANT : ne pas casser les modals
    if (isRequestTrigger) return;

    toggleMenu(true);
  });
});

/* =========================
   FIX BOUTON PUBLIER DEMANDE
   ========================= */
const mobileRequestTrigger = document.querySelector('.mobile-nav [data-open-request-form], .mobile-nav .mobile-nav-action-link-request');

if (mobileRequestTrigger) {
  mobileRequestTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    toggleMenu(true);

    requestAnimationFrame(() => {
      if (window.FixeoClientRequest?.open) {
        window.FixeoClientRequest.open(mobileRequestTrigger);
        return;
      }

      if (window.openModal) {
        window.openModal('request-modal');
        return;
      }

      const modal = document.getElementById('request-modal');
      if (modal) {
        modal.style.display = 'block';
        modal.classList.add('open', 'active');
        document.body.classList.add('modal-open');
      }
    });
  }, true);
}

/* =========================
   FIX BOUTON URGENT
   ========================= */
const mobileUrgentTrigger = document.querySelector('.mobile-nav [data-open-express-request], .mobile-nav .mobile-nav-action-link-urgent');

if (mobileUrgentTrigger) {
  mobileUrgentTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    toggleMenu(true);

    requestAnimationFrame(() => {
      if (window.FixeoClientRequest?.openExpress) {
        window.FixeoClientRequest.openExpress(mobileUrgentTrigger);
        return;
      }

      if (window.FixeoClientRequest?.open) {
        window.FixeoClientRequest.open(mobileUrgentTrigger);
        return;
      }

      if (window.openModal) {
        window.openModal('request-modal');
        return;
      }

      const modal = document.getElementById('request-modal');
      if (modal) {
        modal.style.display = 'block';
        modal.classList.add('open', 'active');
        document.body.classList.add('modal-open');
      }
    });
  }, true);
}

    /* Close on outside click */
    document.addEventListener('click', (e) => {
      if (
        mobileNav.classList.contains('open') &&
        !mobileNav.contains(e.target) &&
        !hamburgers.some(h => h.contains(e.target))
      ) {
        toggleMenu(true);
      }
    });

    /* Close on Escape */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) {
        toggleMenu(true);
      }
    });

    /* Close on resize to desktop */
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) toggleMenu(true);
    });
  }

  /* ── DROPDOWN MENUS ────────────────────────────────────────── */
  function initDropdowns() {
    const dropdownParents = $$('.nav-has-dropdown');

    dropdownParents.forEach(parent => {
      const dropdown = $('.nav-dropdown', parent);
      if (!dropdown) return;

      /* Desktop: hover already handled by CSS,
         but also support keyboard and touch */
      parent.addEventListener('focusin', () => parent.classList.add('open'));
      parent.addEventListener('focusout', (e) => {
        if (!parent.contains(e.relatedTarget)) parent.classList.remove('open');
      });

      /* Touch devices: toggle on tap */
      parent.addEventListener('click', (e) => {
        /* Only toggle if the click is on the parent link (not a dropdown item) */
        if (!dropdown.contains(e.target)) {
          e.preventDefault();
          const isOpen = parent.classList.contains('open');
          /* Close all other dropdowns */
          dropdownParents.forEach(p => p.classList.remove('open'));
          if (!isOpen) parent.classList.add('open');
        }
      });

      /* Close on outside click */
      document.addEventListener('click', (e) => {
        if (!parent.contains(e.target)) parent.classList.remove('open');
      });
    });
  }

  /* ── QUICK-SEARCH KEYBOARD SHORTCUT ────────────────────────── */
  function initQuickSearchShortcut() {
    document.addEventListener('keydown', (e) => {
      /* Press "/" to open Quick Search (when not focused in input) */
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        if (window.QuickSearchModal?.open) {
          window.QuickSearchModal.open();
        }
      }
    });
  }

  /* ── AUTH FORMS — persist on login ────────────────────────── */
  /**
   * Listen for auth.html form submissions to set localStorage flags.
   * Only active on auth.html.
   */
  function listenAuthForms() {
    window.removeEventListener('fixeo:auth-changed', applyAuthState);
    window.addEventListener('fixeo:auth-changed', applyAuthState);
    window.removeEventListener('storage', applyAuthState);
    window.addEventListener('storage', applyAuthState);
  }

  /* ── LOGOUT helper (exposed globally) ─────────────────────── */
  window.fixeoLogout = function () {
    if (window.fixeoGlobalLogout) {
      return window.fixeoGlobalLogout();
    }
    ['fixeo_user', 'fixeo_token', 'fixeo_session', 'fixeo_logged', 'fixeo_logged_in',
     'fixeo_role', 'fixeo_admin', 'fixeo_user_name', 'fixeo_notif_count', 'fixeo_avatar',
     'user', 'role', 'user_logged', 'user_role', 'user_name', 'user_job', 'user_city', 'user_phone', 'user_avatar', 'user_status'
    ].forEach(k => {
      localStorage.removeItem(k);
    });
    ['fixeo_admin_auth', 'fixeo_session'].forEach(k => {
      sessionStorage.removeItem(k);
    });
    document.body.classList.remove('is-logged-in', 'is-admin');
    applyAuthState();
    window.location.href = resolveProjectHref('index.html');
  };

  /* ── INIT ───────────────────────────────────────────────────── */
  function init() {
    initLocalNavigationResolver();
    applyAuthState();
    initSticky();
    setActiveLink();
    initHamburger();
    initDropdowns();
    initQuickSearchShortcut();
    listenAuthForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
