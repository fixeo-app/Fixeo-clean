/* ══════════════════════════════════════════════════════════════════════
   FIXEO NAVIGATION SYSTEM v1 — fns-v1a
   js/fixeo-navigation-v1.js

   Single canonical JS engine for the FIXEO Navigation System.

   MUTUAL EXCLUSION GUARD:
     window._FIXEO_NAVIGATION_INITIALIZED_ is set on first run.
     Re-entry is blocked. Legacy engines (header-unified.js,
     fixeo-header-global.js) must NOT be loaded alongside this file
     on FNS v1 pilot pages.

   AUTH CONTRACT:
     Reads from localStorage keys established by auth-global.js:
       fixeo_user_name  → display name
       fixeo_role       → 'client' | 'artisan' | 'admin'
       fixeo_user       → email (fallback)
       fixeo_avatar     → avatar URL (currently unused)
       user             → JSON blob fallback
     Listens to: 'fixeo:auth-changed' CustomEvent
     Reads:      'storage' events (cross-tab sync)
     Body classes used: body.is-logged-in (set by auth-global.js)

   SEARCH CONTRACT:
     Calls window.QuickSearchModal.focusInline() or .open()
     Falls back to focusing #hero-search-input / #ssb-input-nlp
     Falls back to navigating to index.html#services

   NOTIFICATIONS CONTRACT:
     Reads localStorage.fixeo_notif_count
     Listens to 'fixeo:notifications:updated' CustomEvent
     Never fabricates counts.

   Z-INDEX (FNS v1 canonical):
     Header:     400 (CSS --fns-z)
     Dropdown:   420 (CSS --fns-z-dropdown)
     NotifPanel: 440 (CSS --fns-z-notif)
     Backdrop:   490 (CSS --fns-z-backdrop)
     Drawer:     500 (CSS --fns-z-drawer)
     [unchanged] urgent-fab: 1350
     [unchanged] quick-search: 9200
     [unchanged] consent: 99900

   PILOT PAGES: index.html, artisan-profile.html, artisans.html,
                results.html, a-propos.html, pricing.html
══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── 0. MUTUAL EXCLUSION GUARD ──────────────────────────────────── */
  if (window._FIXEO_NAVIGATION_INITIALIZED_) {
    if (window._FNS_DEBUG_) console.warn('[FNS] Already initialized — skipping duplicate load.');
    return;
  }
  window._FIXEO_NAVIGATION_INITIALIZED_ = true;
  window._FIXEO_NAVIGATION_VERSION_ = 'fns-v1a';

  /* ── 1. CONSTANTS & HELPERS ─────────────────────────────────────── */
  var LOGO_SRC = 'img/fixeo-logo.webp';
  var LOGO_SRC_ALT = 'img/logo.png';

  var isHomepage = /^\/?(index\.html)?$/.test(window.location.pathname) ||
                   window.location.pathname === '/';

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resolvePath(href) {
    /* On non-root paths (e.g. /artisan-profile.html), relative hrefs need
       to resolve to site root. We detect depth and prefix ../ if needed.
       For simplicity on static sites: always use absolute-style root paths. */
    if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) return href;
    /* If on a sub-path (e.g. inside /blog/), prefix with / */
    var depth = window.location.pathname.split('/').filter(Boolean).length;
    if (depth > 1) return '/' + href;
    return href;
  }

  /* ── 2. AUTH STATE ──────────────────────────────────────────────── */
  function getAuthUser() {
    var blob = null;
    try {
      var raw = localStorage.getItem('user');
      if (raw) blob = JSON.parse(raw);
    } catch (e) {}

    var name = localStorage.getItem('fixeo_user_name') || (blob && blob.name) || '';
    var role = localStorage.getItem('fixeo_role') || localStorage.getItem('role') ||
               (blob && blob.role) || '';
    var email = localStorage.getItem('fixeo_user') || (blob && blob.email) || '';

    if (!name && !email && !localStorage.getItem('fixeo_user')) return null;

    return {
      name: name || (email ? email.split('@')[0] : 'Utilisateur'),
      role: role || 'client',
      initial: (name ? name.trim().charAt(0) : (email ? email.charAt(0) : 'U')).toUpperCase()
    };
  }

  function getDashboardHref(user) {
    if (!user) return resolvePath('auth.html');
    if (user.role === 'artisan') return resolvePath('dashboard-artisan-v2.html');
    if (user.role === 'admin')   return resolvePath('admin.html');
    return resolvePath('dashboard-client.html');
  }

  /* ── 3. SEARCH ──────────────────────────────────────────────────── */
  function openSearch() {
    if (window.QuickSearchModal && typeof window.QuickSearchModal.focusInline === 'function') {
      window.QuickSearchModal.focusInline();
      return;
    }
    if (window.QuickSearchModal && typeof window.QuickSearchModal.open === 'function') {
      window.QuickSearchModal.open();
      return;
    }
    var candidate =
      document.getElementById('hero-search-input') ||
      document.getElementById('ssb-input-nlp') ||
      document.getElementById('search-input');
    if (candidate) {
      try { candidate.focus(); return; } catch (e) {}
    }
    window.location.href = resolvePath('index.html') + '#services';
  }

  /* ── 4. NOTIFICATIONS ───────────────────────────────────────────── */
  function getNotifCount() {
    var raw = parseInt(localStorage.getItem('fixeo_notif_count') || '0', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  /* ── 5. BUILD DRAWER MARKUP ─────────────────────────────────────── */
  function buildDrawerHTML(user) {
    var dashDest = getDashboardHref(user);

    /* NAVIGATION section */
    var homeHref = isHomepage ? '#home' : resolvePath('index.html');
    var navSection = '<div class="fns-drawer-group">' +
      '<div class="fns-drawer-label">Navigation</div>' +
      '<a class="fns-drawer-link" href="' + homeHref + '">\uD83C\uDFE0 Accueil</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('artisans.html') + '">\uD83D\uDD0D Trouver un artisan</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('services.html') + '">\uD83D\uDD27 Services</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('comment-ca-marche.html') + '">\u2139\uFE0F Comment \u00e7a marche</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('pricing.html') + '">\uD83D\uDC8E Tarifs</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('presse-partenariats.html') + '">\uD83D\uDCF0 Presse &amp; Partenariats</a>' +
      '</div>';

    /* BESOIN D'UN ARTISAN section */
    var demandHref = isHomepage ? 'javascript:void(0)' : resolvePath('index.html');
    var demandAttr = isHomepage ? ' data-fns-open-request="true"' : '';
    var clientSection = '<div class="fns-drawer-group">' +
      '<div class="fns-drawer-label">Besoin d\u2019un artisan</div>' +
      '<a class="fns-drawer-link" href="' + resolvePath('artisans.html') + '">\uD83D\uDD0D Trouver un artisan</a>' +
      '<a class="fns-drawer-link fns-drawer-cta" href="' + esc(demandHref) + '"' + demandAttr + '>\uD83D\uDCDD Publier une demande</a>' +
      '</div>';

    /* POUR LES ARTISANS section */
    var artisanSection = '<div class="fns-drawer-group">' +
      '<div class="fns-drawer-label">Pour les artisans</div>' +
      '<a class="fns-drawer-link" href="' + resolvePath('rejoindre-fixeo.html') + '">\uD83E\uDDF0 Je suis artisan</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('rejoindre-fixeo.html') + '#revendiquer">\uD83D\uDC64 Revendiquer mon profil</a>' +
      '</div>';

    /* COMPTE section — auth-aware */
    var compteSection;
    if (user) {
      compteSection = '<div class="fns-drawer-group">' +
        '<div class="fns-drawer-label">Mon compte</div>' +
        '<a class="fns-drawer-link fns-drawer-user-row" href="' + esc(dashDest) + '">' +
          '<span class="fns-drawer-avatar-initial">' + esc(user.initial) + '</span>' +
          '<span>' + esc(user.name) + '</span>' +
        '</a>' +
        '<a class="fns-drawer-link" href="' + esc(dashDest) + '">\u26A1 Mon Espace Fixeo</a>' +
        '<button type="button" class="fns-drawer-link fns-drawer-logout" id="fns-drawer-logout">\uD83D\uDEAA D\u00e9connexion</button>' +
        '</div>';
    } else {
      compteSection = '<div class="fns-drawer-group">' +
        '<div class="fns-drawer-label">Compte</div>' +
        '<a class="fns-drawer-link fns-drawer-cta" href="' + resolvePath('auth.html') + '">\uD83D\uDD13 Connexion</a>' +
        '<a class="fns-drawer-link fns-drawer-cta--secondary" href="' + resolvePath('auth.html') + '#signup">\u2728 Inscription</a>' +
        '</div>';
    }

    /* LEGAL section */
    var legalSection = '<div class="fns-drawer-group">' +
      '<div class="fns-drawer-label">Légal &amp; Support</div>' +
      '<a class="fns-drawer-link" href="' + resolvePath('confidentialite.html') + '">\uD83D\uDD12 Confidentialit\u00e9</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('cgu.html') + '">\uD83D\uDCCB Conditions</a>' +
      '<a class="fns-drawer-link" href="' + resolvePath('contact.html') + '">\uD83D\uDCAC Support</a>' +
      '</div>';

    /* Language row */
    var langSection = '<div class="fns-drawer-group">' +
      '<div class="fns-drawer-label">Langue</div>' +
      '<div class="fns-drawer-lang-row">' +
        '<button class="fns-drawer-lang-btn" data-fns-lang="fr">FR</button>' +
        '<button class="fns-drawer-lang-btn" data-fns-lang="ar">AR</button>' +
        '<button class="fns-drawer-lang-btn" data-fns-lang="en">EN</button>' +
      '</div>' +
      '</div>';

    return navSection + clientSection + artisanSection + compteSection + legalSection + langSection;
  }

  /* ── 6. BUILD FULL HEADER HTML ──────────────────────────────────── */
  function buildHeaderHTML() {
    var logoFallback = 'this.onerror=null;this.src=\'' + LOGO_SRC_ALT + '\';';
    return (
      '<a href="#fns-main" class="fns-skip">Aller au contenu</a>' +
      '<div class="fns-bar">' +
        /* 1. Logo */
        '<a class="fns-brand" href="' + resolvePath('index.html') + '" aria-label="Fixeo \u2014 Retour \u00e0 l\u2019accueil">' +
          '<img src="' + LOGO_SRC + '" alt="Fixeo" class="fns-logo" width="120" height="30" loading="eager" onerror="' + logoFallback + '">' +
        '</a>' +
        /* 2. Spacer */
        '<div class="fns-spacer" aria-hidden="true"></div>' +
        /* Desktop links (hidden mobile) */
        '<nav class="fns-links" aria-label="Navigation principale">' +
          '<a class="fns-link" href="' + resolvePath('artisans.html') + '">Trouver un artisan</a>' +
          '<a class="fns-link" href="' + resolvePath('services.html') + '">Services</a>' +
          '<a class="fns-link" href="' + resolvePath('comment-ca-marche.html') + '">Comment \u00e7a marche</a>' +
          '<a class="fns-link" href="' + resolvePath('pricing.html') + '">Tarifs</a>' +
        '</nav>' +
        /* 3. Actions */
        '<div class="fns-actions" aria-label="Actions">' +
          /* Search */
          '<button class="fns-icon-btn" id="fns-search-btn" type="button" aria-label="Recherche">' +
            '<span class="fns-icon" aria-hidden="true">\uD83D\uDD0D</span>' +
          '</button>' +
          /* Notifications */
          '<button class="fns-icon-btn" id="fns-notif-btn" type="button" aria-label="Notifications" aria-expanded="false">' +
            '<span class="fns-icon" aria-hidden="true">\uD83D\uDD14</span>' +
            '<span class="fns-badge" id="fns-notif-badge" hidden aria-live="polite"></span>' +
          '</button>' +
          /* Account — guest (default) */
          '<div class="fns-guest" id="fns-guest-actions">' +
            '<a class="fns-btn fns-btn--outline" href="' + resolvePath('auth.html') + '">Connexion</a>' +
            '<a class="fns-btn fns-btn--primary" href="' + resolvePath('index.html') + '#services">Publier une demande</a>' +
          '</div>' +
          /* Account — logged in (hidden until auth confirmed) */
          '<div class="fns-user" id="fns-user-actions" hidden>' +
            '<a class="fns-avatar-btn" id="fns-avatar-btn" href="' + resolvePath('auth.html') + '" aria-label="Mon compte">' +
              '<span class="fns-avatar" id="fns-avatar-initial" aria-hidden="true">?</span>' +
            '</a>' +
          '</div>' +
        '</div>' +
        /* 4. Mobile toggle */
        '<button class="fns-toggle" id="fns-toggle" type="button" ' +
               'aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="fns-drawer">' +
          '<span class="fns-toggle-line"></span>' +
          '<span class="fns-toggle-line"></span>' +
          '<span class="fns-toggle-line"></span>' +
        '</button>' +
      '</div>' +
      /* Notification panel (desktop) */
      '<div class="fns-notif-panel" id="fns-notif-panel" role="region" aria-label="Notifications" aria-live="polite"></div>'
    );
  }

  /* ── 7. INJECT INTO DOM ─────────────────────────────────────────── */
  function inject() {
    /* Find or create the header element */
    var header = document.getElementById('fns-header') ||
                 document.querySelector('header.fns-header');

    if (!header) {
      /* FNS header element not found — create and prepend */
      header = document.createElement('header');
      header.className = 'fns-header';
      header.id = 'fns-header';
      header.setAttribute('role', 'banner');
      document.body.insertAdjacentElement('afterbegin', header);
    }

    /* Prevent double-injection */
    if (header.dataset.fnsReady === '1') return;
    header.dataset.fnsReady = '1';

    /* Insert bar content */
    header.innerHTML = buildHeaderHTML();

    /* Build and append drawer + backdrop to body (portal pattern — avoids stacking context issues) */
    var user = getAuthUser();
    var drawer = document.createElement('div');
    drawer.className = 'fns-drawer';
    drawer.id = 'fns-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'false');
    drawer.setAttribute('aria-label', 'Menu de navigation');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = buildDrawerHTML(user);

    var backdrop = document.createElement('button');
    backdrop.className = 'fns-backdrop';
    backdrop.id = 'fns-backdrop';
    backdrop.setAttribute('type', 'button');
    backdrop.setAttribute('aria-label', 'Fermer le menu');
    backdrop.setAttribute('tabindex', '-1');

    document.body.appendChild(drawer);
    document.body.appendChild(backdrop);

    /* Add id to main content for skip link (if not already present) */
    var mainEl = document.querySelector('main') ||
                 document.querySelector('[role="main"]') ||
                 document.getElementById('main-content');
    if (mainEl && !mainEl.id) mainEl.id = 'fns-main';
    else if (mainEl && mainEl.id !== 'fns-main') {
      mainEl.setAttribute('tabindex', '-1');
      if (!document.getElementById('fns-main')) mainEl.id = 'fns-main';
    }

    return { header: header, drawer: drawer, backdrop: backdrop };
  }

  /* ── 8. ACTIVE LINK ─────────────────────────────────────────────── */
  function setActiveLinks(header) {
    var path = window.location.pathname.replace(/\/$/, '') || '/index.html';
    var filename = path.split('/').pop() || 'index.html';
    header.querySelectorAll('.fns-link').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkFile = href.split('/').pop().split('?')[0].split('#')[0] || 'index.html';
      var isActive = linkFile === filename ||
                     (filename === '' && linkFile === 'index.html');
      link.classList.toggle('fns-active', isActive);
      link.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  /* ── 9. SCROLL BEHAVIOR ─────────────────────────────────────────── */
  function initScroll(header) {
    var ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
          header.classList.toggle('fns-scrolled', window.scrollY > 8);
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); /* apply immediately on load */
  }

  /* ── 10. NOTIFICATION BADGE ─────────────────────────────────────── */
  function updateBadge() {
    var count = getNotifCount();
    var badge = document.getElementById('fns-notif-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.removeAttribute('hidden');
    } else {
      badge.textContent = '';
      badge.setAttribute('hidden', '');
    }
  }

  function renderNotifPanel(panel) {
    if (!panel) return;
    var count = getNotifCount();
    if (count > 0) {
      panel.innerHTML =
        '<div class="fns-notif-title">Notifications</div>' +
        '<div class="fns-notif-item"><span class="fns-notif-dot"></span>' +
          '<div>Vous avez <strong>' + count + '</strong> notification' + (count > 1 ? 's' : '') + ' en attente.</div>' +
        '</div>';
    } else {
      panel.innerHTML =
        '<div class="fns-notif-title">Notifications</div>' +
        '<div class="fns-notif-empty">Aucune notification pour le moment.</div>';
    }
  }

  /* ── 11. AUTH STATE RENDERING ───────────────────────────────────── */
  function updateAuthUI() {
    var user = getAuthUser();
    var guestEl  = document.getElementById('fns-guest-actions');
    var userEl   = document.getElementById('fns-user-actions');
    var avatarEl = document.getElementById('fns-avatar-initial');
    var avatarBtn = document.getElementById('fns-avatar-btn');

    if (!guestEl || !userEl) return;

    if (user) {
      guestEl.setAttribute('hidden', '');
      userEl.removeAttribute('hidden');
      if (avatarEl) avatarEl.textContent = user.initial;
      if (avatarBtn) {
        var dest = getDashboardHref(user);
        avatarBtn.setAttribute('href', dest);
        avatarBtn.setAttribute('aria-label', 'Mon Espace Fixeo (' + esc(user.name) + ')');
      }
    } else {
      guestEl.removeAttribute('hidden');
      userEl.setAttribute('hidden', '');
    }

    /* Re-render drawer account section in-place */
    var drawer = document.getElementById('fns-drawer');
    if (drawer) {
      drawer.innerHTML = buildDrawerHTML(user);
      bindDrawerLinks(drawer);
    }
  }

  /* ── 12. DRAWER OPEN / CLOSE ────────────────────────────────────── */
  var _lastFocused = null;
  var _focusTrapHandler = null;

  function openDrawer() {
    var drawer   = document.getElementById('fns-drawer');
    var backdrop = document.getElementById('fns-backdrop');
    var toggle   = document.getElementById('fns-toggle');
    if (!drawer || !backdrop || !toggle) return;

    _lastFocused = document.activeElement;

    drawer.classList.add('fns-open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('fns-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('fns-open');
    document.body.classList.add('fns-menu-open');

    /* Focus trap */
    var focusables = drawer.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length) focusables[0].focus();

    _focusTrapHandler = function (e) {
      if (e.key !== 'Tab' || !drawer.classList.contains('fns-open')) return;
      var all = Array.from(drawer.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!all.length) return;
      var first = all[0];
      var last  = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', _focusTrapHandler);
  }

  function closeDrawer() {
    var drawer   = document.getElementById('fns-drawer');
    var backdrop = document.getElementById('fns-backdrop');
    var toggle   = document.getElementById('fns-toggle');
    if (!drawer) return;

    drawer.classList.remove('fns-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.classList.remove('fns-open');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.classList.remove('fns-open');
    }
    document.body.classList.remove('fns-menu-open');

    if (_focusTrapHandler) {
      document.removeEventListener('keydown', _focusTrapHandler);
      _focusTrapHandler = null;
    }

    /* Restore focus */
    if (_lastFocused && typeof _lastFocused.focus === 'function') {
      try { _lastFocused.focus(); } catch (e) {}
      _lastFocused = null;
    }
  }

  function toggleDrawer() {
    var drawer = document.getElementById('fns-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('fns-open')) closeDrawer();
    else openDrawer();
  }

  /* ── 13. NOTIF PANEL OPEN / CLOSE ───────────────────────────────── */
  function toggleNotifPanel() {
    var panel = document.getElementById('fns-notif-panel');
    var btn   = document.getElementById('fns-notif-btn');
    if (!panel) return;
    var isOpen = panel.classList.contains('fns-open');
    panel.classList.toggle('fns-open', !isOpen);
    if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
  }

  function closeNotifPanel() {
    var panel = document.getElementById('fns-notif-panel');
    var btn   = document.getElementById('fns-notif-btn');
    if (panel) {
      panel.classList.remove('fns-open');
    }
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /* ── 14. BIND DRAWER LINKS ──────────────────────────────────────── */
  function bindDrawerLinks(drawer) {
    if (!drawer) return;

    /* All nav links close drawer on click */
    drawer.querySelectorAll('.fns-drawer-link, .fns-drawer-cta, .fns-drawer-cta--secondary').forEach(function (el) {
      el.addEventListener('click', function (e) {
        /* Special: request form trigger on homepage */
        if (el.hasAttribute('data-fns-open-request')) {
          e.preventDefault();
          e.stopPropagation();
          closeDrawer();
          setTimeout(function () {
            if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
              window.FixeoClientRequest.open(el);
            } else if (typeof window.openModal === 'function') {
              window.openModal('request-modal');
            } else {
              var m = document.getElementById('request-modal');
              if (m) { m.style.display = 'block'; m.classList.add('open', 'active'); }
            }
          }, 60);
          return;
        }
        /* Logout */
        if (el.id === 'fns-drawer-logout') {
          e.preventDefault();
          closeDrawer();
          if (typeof window.fixeoGlobalLogout === 'function') {
            window.fixeoGlobalLogout({ redirectTo: 'index.html' });
          } else {
            ['user','fixeo_user_name','fixeo_user','fixeo_role','fixeo_avatar',
             'user_logged','user_role','user_name','role','fixeo_admin',
             'fixeo_logged','fixeo_token','fixeo_supabase_session'
            ].forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
            try { sessionStorage.removeItem('fixeo_admin_auth'); } catch (_) {}
            window.location.href = resolvePath('index.html');
          }
          return;
        }
        closeDrawer();
      });
    });

    /* Language buttons */
    drawer.querySelectorAll('.fns-drawer-lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-fns-lang');
        if (!lang) return;
        var sel = document.getElementById('lang-select');
        if (sel) { sel.value = lang; sel.dispatchEvent(new Event('change')); }
        else if (window.i18n && typeof window.i18n.setLang === 'function') {
          window.i18n.setLang(lang);
        }
        closeDrawer();
      });
    });
  }

  /* ── 15. BIND HEADER INTERACTIONS ──────────────────────────────── */
  function bindHeader(header) {
    /* Toggle button */
    var toggle = header.querySelector('#fns-toggle');
    if (toggle) {
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        closeNotifPanel();
        toggleDrawer();
      });
    }

    /* Search */
    var searchBtn = header.querySelector('#fns-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeDrawer();
        openSearch();
      });
    }

    /* Notifications */
    var notifBtn = header.querySelector('#fns-notif-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', function (e) {
        e.preventDefault();
        /* If FixeoNotificationSystem has its own panel, delegate */
        if (window.notifSystem && typeof window.notifSystem.togglePanel === 'function') {
          try { window.notifSystem.togglePanel(); return; } catch (ex) {}
        }
        var panel = document.getElementById('fns-notif-panel');
        renderNotifPanel(panel);
        toggleNotifPanel();
      });
    }

    /* Avatar button (desktop logged-in) */
    var avatarBtn = header.querySelector('#fns-avatar-btn');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var user = getAuthUser();
        window.location.href = getDashboardHref(user);
      });
    }
  }

  /* ── 16. GLOBAL EVENT LISTENERS ────────────────────────────────── */
  function bindGlobal() {
    /* Escape closes drawer and notif panel */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var drawer = document.getElementById('fns-drawer');
      if (drawer && drawer.classList.contains('fns-open')) {
        closeDrawer();
        return;
      }
      closeNotifPanel();
    });

    /* Backdrop click closes drawer */
    var backdrop = document.getElementById('fns-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeDrawer);
    }

    /* Click outside notif panel closes it */
    document.addEventListener('click', function (e) {
      var panel = document.getElementById('fns-notif-panel');
      var btn   = document.getElementById('fns-notif-btn');
      if (!panel || !panel.classList.contains('fns-open')) return;
      if (btn && btn.contains(e.target)) return;
      if (panel && panel.contains(e.target)) return;
      closeNotifPanel();
    });

    /* Auth state changes */
    document.addEventListener('fixeo:auth-changed', function () {
      updateAuthUI();
      updateBadge();
    });

    /* Cross-tab storage sync */
    window.addEventListener('storage', function () {
      updateAuthUI();
      updateBadge();
    });

    /* Notification system updates */
    document.addEventListener('fixeo:notifications:updated', function (e) {
      if (e.detail && typeof e.detail.unread === 'number') {
        localStorage.setItem('fixeo_notif_count', String(e.detail.unread));
      }
      updateBadge();
    });
  }

  /* ── 17. MAIN INIT ──────────────────────────────────────────────── */
  function init() {
    var parts = inject();
    if (!parts) return;

    var header = parts.header;
    var drawer = parts.drawer;

    setActiveLinks(header);
    initScroll(header);
    updateAuthUI();
    updateBadge();
    bindHeader(header);
    bindDrawerLinks(drawer);
    bindGlobal();

    /* Expose public API */
    window.FixeoNavigation = {
      version: 'fns-v1a',
      openDrawer: openDrawer,
      closeDrawer: closeDrawer,
      openSearch: openSearch,
      updateAuthUI: updateAuthUI,
      updateBadge: updateBadge
    };

    /* Backward-compat alias so any existing code calling
       window.FixeoMobileMenu.open / .close still works */
    window.FixeoMobileMenu = window.FixeoMobileMenu || {};
    window.FixeoMobileMenu.initialized = true;
    window.FixeoMobileMenu.owner = 'fixeo-navigation-v1';
    window.FixeoMobileMenu.open   = openDrawer;
    window.FixeoMobileMenu.close  = closeDrawer;
    window.FixeoMobileMenu.toggle = toggleDrawer;
    window.FixeoMobileMenu.isOpen = function () {
      var d = document.getElementById('fns-drawer');
      return !!(d && d.classList.contains('fns-open'));
    };
  }

  /* ── 18. BOOT ───────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
