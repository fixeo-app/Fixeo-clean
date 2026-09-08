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
    /* Logged-in: always show ⚡ as workspace shortcut icon */
    return user ? '\u26A1' : 'U';
  }

  function resolveCoreHref(href) {
    if (window.FixeoGlobalNav && typeof window.FixeoGlobalNav.resolveHref === 'function') {
      return window.FixeoGlobalNav.resolveHref(href);
    }
    return href;
  }

  function getAvatarHref(user) {
    if (!user) return resolveCoreHref('auth.html');
    if (user.role === 'artisan') return resolveCoreHref('dashboard-artisan-v2.html');
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
  const user = getAuthUser();

  /* ── Active page detection ───────────────────────────────── */
  function _activeClass(href) {
    const target = (href.split('/').pop() || 'index.html')
      .split('#')[0]
      .toLowerCase();

    const current = path
      .split('#')[0]
      .toLowerCase();

    return (
      current === target ||
      (target === 'index.html' && isHomepage)
    )
      ? ' fixeo-gh-drawer-link--active'
      : '';
  }


  /* ════════════════════════════════════════════════════════════
     1. SHORT NAVIGATION
     ════════════════════════════════════════════════════════════ */

  const navSection = `
    <div class="fixeo-gh-drawer-group">

      <div class="fixeo-gh-drawer-label">
        Navigation
      </div>

      <div class="fixeo-gh-gateway-nav-grid">

        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-nav-item${_activeClass('index.html')}"
          href="${isHomepage ? '#home' : 'index.html'}">

          <span class="fixeo-gh-di" aria-hidden="true">
            ⌂
          </span>

          <span>Accueil</span>

        </a>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-nav-item${_activeClass('services.html')}"
          href="services.html">

          <span class="fixeo-gh-di" aria-hidden="true">
            ◇
          </span>

          <span>Services</span>

        </a>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-nav-item${_activeClass('artisans.html')}"
          href="artisans.html">

          <span class="fixeo-gh-di" aria-hidden="true">
            ◎
          </span>

          <span>Artisans</span>

        </a>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-nav-item${_activeClass('estimation.html')}"
          href="estimation.html">

          <span class="fixeo-gh-di" aria-hidden="true">
            ✦
          </span>

          <span>Estimation</span>

        </a>

      </div>

    </div>`;


  /* ════════════════════════════════════════════════════════════
     2. PLATFORM GATEWAYS
     CLIENT → ARTISAN → ENTERPRISE
     ════════════════════════════════════════════════════════════ */

  const gatewaySection = `
    <div class="fixeo-gh-drawer-group">

      <div class="fixeo-gh-drawer-label">
        Plateforme FIXEO
      </div>


      <div class="fixeo-gh-gateway-stack">


        <!-- CLIENT -->
        <div
          class="fixeo-gh-gateway-card
                 fixeo-gh-gateway-card--client">

          <div class="fixeo-gh-gateway-card-head">

            <span
              class="fixeo-gh-gateway-symbol"
              aria-hidden="true">
              ↗️
            </span>

            <div class="fixeo-gh-gateway-card-copy">

              <span class="fixeo-gh-gateway-kicker">
                BESOIN D’UN ARTISAN
              </span>

              <h3 class="fixeo-gh-gateway-title">
                Trouvez le professionnel adapté
              </h3>

              <p class="fixeo-gh-gateway-desc">
                Décrivez votre besoin ou explorez le réseau FIXEO.
              </p>

            </div>

          </div>

<a
  class="fixeo-gh-drawer-link
         fixeo-gh-gateway-action
         fixeo-gh-gateway-action--client"
  href="${isHomepage ? '#home' : 'index.html#home'}"
  data-fixeo-hero-entry="request">

  <span>Décrire mon besoin</span>

</a>
         
          <div class="fixeo-gh-gateway-sublinks">

            <a
              class="fixeo-gh-drawer-link
                     fixeo-gh-gateway-sublink"
              href="artisans.html">

              Explorer les artisans

            </a>

          </div>

        </div>


        <!-- ARTISAN -->
        <div
          class="fixeo-gh-gateway-card
                 fixeo-gh-gateway-card--artisan">

          <div class="fixeo-gh-gateway-card-head">

            <span
              class="fixeo-gh-gateway-symbol"
              aria-hidden="true">
              ◇
            </span>

            <div class="fixeo-gh-gateway-card-copy">

              <span class="fixeo-gh-gateway-kicker">
                POUR LES ARTISANS
              </span>

              <h3 class="fixeo-gh-gateway-title">
                Développez votre présence sur FIXEO
              </h3>

              <p class="fixeo-gh-gateway-desc">
                Rejoignez le réseau et structurez votre activité professionnelle.
              </p>

            </div>

          </div>


          <a
            class="fixeo-gh-drawer-link
                   fixeo-gh-gateway-action
                   fixeo-gh-gateway-action--artisan"
            href="rejoindre-fixeo.html">

            <span>Rejoindre FIXEO</span>

          </a>


          <div class="fixeo-gh-gateway-sublinks">

            <a
              class="fixeo-gh-drawer-link
                     fixeo-gh-gateway-sublink"
              href="rejoindre-fixeo.html#revendiquer">

              Revendiquer mon profil

            </a>

            <a
              class="fixeo-gh-drawer-link
                     fixeo-gh-gateway-sublink"
              href="dashboard-artisan-v2.html">

              Espace artisan

            </a>

          </div>

        </div>


        <!-- ENTERPRISE -->
        <div
          class="fixeo-gh-gateway-card
                 fixeo-gh-gateway-card--enterprise">

          <div class="fixeo-gh-gateway-card-head">

            <span
              class="fixeo-gh-gateway-symbol"
              aria-hidden="true">
              ▦
            </span>

            <div class="fixeo-gh-gateway-card-copy">

              <span class="fixeo-gh-gateway-kicker">
                FIXEO ENTREPRISES
              </span>

              <h3 class="fixeo-gh-gateway-title">
                Une porte dédiée aux professionnels
              </h3>

              <p class="fixeo-gh-gateway-desc">
                Découvrez l’univers FIXEO destiné aux besoins des entreprises.
              </p>

            </div>

          </div>


          <a
            class="fixeo-gh-drawer-link
                   fixeo-gh-gateway-action
                   fixeo-gh-gateway-action--enterprise"
            href="entreprises.html">

            <span>Découvrir FIXEO Entreprises</span>

          </a>

        </div>

      </div>

    </div>`;


  /* ════════════════════════════════════════════════════════════
     3. DISCOVER
     ════════════════════════════════════════════════════════════ */

  const discoverSection = `
    <div class="fixeo-gh-drawer-group">

      <div class="fixeo-gh-drawer-label">
        Découvrir FIXEO
      </div>


      <div class="fixeo-gh-gateway-discover">

        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-discover-link${_activeClass('comment-ca-marche.html')}"
          href="comment-ca-marche.html">

          <span>Comment ça marche</span>

        </a>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-discover-link${_activeClass('pricing.html')}"
          href="pricing.html">

          <span>Tarifs</span>

        </a>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-gateway-discover-link${_activeClass('presse-partenariats.html')}"
          href="presse-partenariats.html">

          <span>Presse &amp; Partenariats</span>

        </a>

      </div>

    </div>`;


  /* ════════════════════════════════════════════════════════════
     4. ACCOUNT
     ════════════════════════════════════════════════════════════ */

  const dashDest =
    user && user.role === 'artisan'
      ? 'dashboard-artisan-v2.html'
      : user && user.role === 'admin'
        ? 'admin.html'
        : 'dashboard-client.html';


  const accountSection = user
    ? `
      <div
        class="fixeo-gh-drawer-group
               fixeo-gh-drawer-compte">

        <div class="fixeo-gh-drawer-label">
          Mon compte
        </div>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-drawer-compte-user"
          href="${dashDest}">

          <span class="fixeo-gh-drawer-avatar">
            ${esc(user.name.charAt(0).toUpperCase())}
          </span>

          <span>
            ${esc(user.name)}
          </span>

        </a>


        <a
          class="fixeo-gh-drawer-link
                 fixeo-gh-drawer-espace"
          href="${dashDest}">

          <span
            class="fixeo-gh-di"
            aria-hidden="true">
            ⚡
          </span>

          <span>
            Mon Espace FIXEO
          </span>

        </a>


        <a
          class="fixeo-gh-drawer-link"
          id="fixeo-gh-drawer-logout"
          href="#">

          <span
            class="fixeo-gh-di"
            aria-hidden="true">
            ↪️
          </span>

          <span>
            Déconnexion
          </span>

        </a>

      </div>
    `
    : `
      <div class="fixeo-gh-drawer-group">

        <div class="fixeo-gh-drawer-label">
          Compte
        </div>


        <div class="fixeo-gh-gateway-account-actions">

          <a
            class="fixeo-gh-drawer-link
                   fixeo-gh-gateway-account-link"
            href="auth.html">

            <span aria-hidden="true">
              ↳
            </span>

            <span>
              Connexion
            </span>

          </a>


          <a
            class="fixeo-gh-drawer-link
                   fixeo-gh-gateway-account-link"
            href="auth.html#signup">

            <span aria-hidden="true">
              +
            </span>

            <span>
              Inscription
            </span>

          </a>

        </div>

      </div>
    `;


  /* ════════════════════════════════════════════════════════════
     FINAL DRAWER
     No FR / AR / EN selector until multilingual UX is ready.
     ════════════════════════════════════════════════════════════ */

  return `
  <div
    class="fixeo-gh-drawer
           fixeo-gh-drawer--gateway"
    aria-hidden="true">

    <!-- FIXEO Mobile Menu V5B — persistent drawer control -->
    <div class="fixeo-gh-drawer-control">

      <div class="fixeo-gh-drawer-control-brand">
        <span class="fixeo-gh-drawer-control-dot" aria-hidden="true"></span>

        <span class="fixeo-gh-drawer-control-title">
          Menu FIXEO
        </span>
      </div>

      <button
        type="button"
        class="fixeo-gh-drawer-link
               fixeo-gh-drawer-close"
        aria-label="Fermer le menu">

        <span
          class="fixeo-gh-drawer-close-icon"
          aria-hidden="true">
          ×
        </span>

        <span class="fixeo-gh-drawer-close-label">
          Fermer
        </span>

      </button>

    </div>

    ${navSection}
    ${gatewaySection}
    ${discoverSection}
    ${accountSection}

  </div>

  <button
    class="fixeo-gh-backdrop"
    type="button"
    aria-label="Fermer le menu">
  </button>
`;
    
}

  function buildMarkup() {
    return `
      <div class="fixeo-gh-mobile" data-page="${esc(path)}">
        <div class="fixeo-gh-mobile-bar">
          <a class="fixeo-gh-brand" href="/index.html" aria-label="Fixeo — Accueil">
            <img src="/img/logo.png" alt="Fixeo" class="fixeo-logo-img" height="26" loading="eager">
          </a>
          <div class="fixeo-gh-actions">

<button
  class="fixeo-gh-icon-btn fixeo-gh-search"
  type="button"
  aria-label="Parler à RAFI"
  title="RAFI — Assistant FIXEO">

  <span class="fixeo-gh-icon" aria-hidden="true">
    <svg
      class="fixeo-gh-icon-svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">

      <rect
        x="8"
        y="3"
        width="8"
        height="12"
        rx="4"
        stroke="currentColor"
        stroke-width="1.7"/>

      <path
        d="M5.8 11.5C5.8 15 8.55 17.7 12 17.7C15.45 17.7 18.2 15 18.2 11.5"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"/>

      <path
        d="M12 17.7V21"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"/>

      <path
        d="M9.5 21H14.5"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"/>

    </svg>
  </span>
</button>

<button
  class="fixeo-gh-icon-btn fixeo-gh-notif notif-btn"
  type="button"
  aria-label="Notifications"
  title="Notifications">

  <span class="fixeo-gh-icon" aria-hidden="true">
    <svg
      class="fixeo-gh-icon-svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">

      <path
        d="M6.8 10.2C6.8 7.1 9 5 12 5C15 5 17.2 7.1 17.2 10.2V13.3C17.2 14.9 17.8 16 19 17.2H5C6.2 16 6.8 14.9 6.8 13.3V10.2Z"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"/>

      <path
        d="M10 19C10.45 19.65 11.15 20 12 20C12.85 20 13.55 19.65 14 19"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"/>

      <path
        d="M12 3.2V5"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"/>

    </svg>
  </span>

  <span
    class="notif-badge fixeo-gh-badge"
    aria-live="polite">
  </span>
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

  /* ══════════════════════════════════════════════════════════════
   FIXEO GLOBAL HEADER V5A — UNIVERSAL MOBILE HOST
   One mobile shell for every FIXEO page.
   Legacy page headers remain untouched for desktop.
   ══════════════════════════════════════════════════════════════ */

function ensureUniversalMobileHost() {

  /* Reuse if already mounted */
  const existing =
    document.querySelector(
      '.fixeo-gh-universal-shell[data-fixeo-gh-universal="1"]'
    );

  if (existing) {
    return {
      host:
        existing.querySelector('.fixeo-gh-shell-inner') ||
        existing,
      type: 'universal',
      shell: existing
    };
  }


  /*
   * Mark historical page headers as mobile sources.
   * They stay in DOM and remain available on desktop,
   * but V5A will hide them on mobile.
   */
  document
    .querySelectorAll(
      'nav.navbar, header.site-header'
    )
    .forEach(function (node) {

      if (
        !node.classList.contains(
          'fixeo-gh-universal-shell'
        )
      ) {
        node.classList.add(
          'fixeo-gh-source-shell'
        );
      }

    });


  /*
   * Dedicated FIXEO mobile shell.
   *
   * IMPORTANT:
   * Do NOT add .site-header or .navbar here.
   * This prevents page-specific legacy CSS from
   * influencing the global mobile header.
   */
  const shell =
    document.createElement('header');

  shell.className =
    'fixeo-gh-shell ' +
    'fixeo-gh-shell--synthetic ' +
    'fixeo-gh-universal-shell';

  shell.setAttribute(
    'data-fixeo-gh-universal',
    '1'
  );

  shell.innerHTML =
    '<div class="' +
      'fixeo-gh-shell-inner ' +
      'fixeo-gh-universal-inner' +
    '"></div>';


  /*
   * Always first interface element in body.
   * Same DOM position on every FIXEO page.
   */
  document.body.insertAdjacentElement(
    'afterbegin',
    shell
  );


  return {
    host:
      shell.querySelector(
        '.fixeo-gh-shell-inner'
      ),
    type: 'universal',
    shell: shell
  };
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
    const found = ensureUniversalMobileHost();
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
    /* Toggle premium workspace class — adds glow/gradient when logged in */
    avatar.classList.toggle('fixeo-gh-avatar--espace', !!user);
    link.href = getAvatarHref(user);
    link.setAttribute('title', user ? 'Mon Espace Fixeo' : 'Mon compte');
    link.setAttribute('aria-label', user ? 'Mon Espace Fixeo' : 'Mon compte');

    /* Role-based visibility: show [data-role-show="artisan"] only to artisans */
    const isArtisan = !!(user && user.role === 'artisan');
    document.querySelectorAll('[data-role-show="artisan"]').forEach(function (el) {
      el.style.display = isArtisan ? '' : 'none';
    });
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

  var heroMic = document.querySelector('.fxhf-mic');

  if (heroMic) {
    heroMic.click();
  }
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
      /* Use canonical global logout — clears ALL keys, calls Supabase signOut */
      if (typeof window.fixeoGlobalLogout === 'function') {
        window.fixeoGlobalLogout({ redirectTo: 'index.html' });
      } else {
        /* Fallback: belt-and-suspenders if module not loaded */
        try {
          ['user','fixeo_user_name','fixeo_user','fixeo_role','fixeo_avatar',
           'user_logged','user_role','user_name','role','fixeo_admin',
           'fixeo_logged','fixeo_token','fixeo_supabase_session'
          ].forEach(function(k){ localStorage.removeItem(k); });
          sessionStorage.removeItem('fixeo_admin_auth');
        } catch (_) {}
        window.location.href = 'index.html';
      }
    });

    /* ── Avatar workspace shortcut — delegated, works regardless of href timing ── */
    root.addEventListener('click', function (e) {
      const avatarLink = e.target.closest('.fixeo-gh-avatar-link');
      if (!avatarLink) return;
      e.preventDefault();
      e.stopPropagation();
      const u = getAuthUser();
      const dest = (u && u.role === 'artisan')
        ? 'dashboard-artisan-v2.html'
        : (u ? 'dashboard-client.html' : 'auth.html');
      console.warn('[fixeo-gh] avatar workspace click →', dest);
      window.location.href = dest;
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
