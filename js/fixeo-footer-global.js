/*!
 * fixeo-footer-global.js — v gf5a
 * Canonical Public Footer Authority
 *
 * Single source of truth for all Fixeo public-facing pages.
 *
 * Behaviour:
 *  1. REPLACE in place any legacy footer variant found in the DOM:
 *       footer.fixeo-footer-v1, .seo-footer, .seo-footer-card,
 *       .blog-index-footer  →  replaced by canonical footer
 *     The first matching element is used as the insertion anchor; any
 *     remaining duplicates are removed.
 *  2. If no existing footer/mount is found, append before </body>.
 *  3. Idempotent — skips if canonical footer already present
 *     (.fxf-canonical sentinel class).
 *  4. SKIP — auth footer: inject minimal copyright footer only.
 *  5. SKIP — dashboard / admin pages: no public footer.
 *
 * IMPORTANT:
 *  Generic client request CTA removed from footer.
 *  Canonical request entry now lives in the homepage Flagship Hero.
 *
 * CSS: fixeo-footer-global.css must be loaded in <head>.
 * DO NOT touch: reservation modal, auth/session, Supabase, analytics.
 */
(function () {
  'use strict';

  /* ── Idempotent guard ─────────────────────────────────── */
  if (document.querySelector('.fxf-canonical')) return;

  /* ── Dashboard / admin skip ───────────────────────────── */
  var isDashboard = !!(
    document.querySelector(
      '[data-page="dashboard-artisan"], [data-page="dashboard-client"]'
    ) ||
    document.body.classList.contains('artisan-dashboard') ||
    document.body.classList.contains('client-dashboard') ||
    /\bdashboard-artisan\b/.test(
      document.body.getAttribute('id') || ''
    ) ||
    /\bdashboard-client\b/.test(
      document.body.getAttribute('id') || ''
    ) ||
    window.location.pathname.indexOf('dashboard-artisan') !== -1 ||
    window.location.pathname.indexOf('dashboard-client') !== -1 ||
    window.location.pathname.indexOf('admin') !== -1 ||
    window.location.pathname.indexOf('confirmation') !== -1
  );

  if (isDashboard) return;

  /* ── Auth page: minimal footer ─────────────────────────── */
  var isAuth = !!(
    document.querySelector(
      '[data-page="auth"], #auth-modal, #auth-container, .auth-container, .auth-card'
    ) ||
    window.location.pathname.indexOf('auth.html') !== -1
  );

  if (isAuth) {
    if (document.querySelector('.fixeo-footer-auth')) return;

    var yr = new Date().getFullYear();
    var authFooter = document.createElement('footer');

    authFooter.className = 'fixeo-footer-auth';
    authFooter.setAttribute('role', 'contentinfo');

    authFooter.innerHTML =
      '\u00a9 ' + yr + ' Fixeo \u2014 ' +
      '<a href="cgu.html">CGU</a> \u00b7 ' +
      '<a href="confidentialite.html">Confidentialit\u00e9</a> \u00b7 ' +
      '<a href="contact.html">Contact</a> \u00b7 ' +
      '<button type="button" class="footer-cookie-btn" ' +
      'onclick="window.FixeoConsent && window.FixeoConsent.open()" ' +
      'aria-label="G\u00e9rer vos pr\u00e9f\u00e9rences cookies">' +
      'Pr\u00e9f\u00e9rences cookies' +
      '</button>';

    document.body.appendChild(authFooter);
    return;
  }

  /* Existing application footers keep their current presentation. */
  var isApplication = /\/(?:onboarding-artisan|payment-cancel|payment-success)(?:\.html)?\/?$/.test(window.location.pathname);
  var legacyFooters = Array.from(document.querySelectorAll(
    'footer.fixeo-footer-v1, footer.fixeo-footer, .seo-footer, .seo-footer-card, .blog-index-footer, footer.ssp-footer'
  ));
  var localSources = Array.from(document.querySelectorAll('nav.seo-authority-links'));
  var legacyLinks = legacyFooters.flatMap(function (el) { return Array.from(el.querySelectorAll('a[href]')); });

  /* ── Build canonical footer HTML ─────────────────────── */
  var yr = new Date().getFullYear();

  var html =
    '<footer class="fixeo-footer-v1 fxf-canonical" ' +
    'role="contentinfo" ' +
    'aria-label="Pied de page Fixeo">' +

      '<div class="container">' +

        /* Trust signals row — factual only */
        '<div class="fxf-trust-row" aria-label="Engagements Fixeo">' +

          '<span class="fxf-trust-badge">' +
            '\uD83D\uDCCB Profils r\u00e9f\u00e9renc\u00e9s sur FIXEO' +
          '</span>' +

          '<span class="fxf-trust-badge">' +
            '\uD83D\uDCB3 Paiement apr\u00e8s intervention' +
          '</span>' +

        '</div>' +

        /* Main grid — Brand / Nav / Artisans / Support */
        '<div class="footer-grid fxf-grid">' +

          /* Brand column */
          '<div class="footer-brand fxf-brand">' +

            '<div class="fxf-logo-wrap">' +
              '<img ' +
                'src="/img/logo.png" ' +
                'alt="Fixeo" ' +
                'class="fxf-logo" ' +
                'onerror="this.onerror=null;this.alt=\'Fixeo\';">' +
            '</div>' +

            '<p class="footer-desc fxf-desc">' +
              'La plateforme qui met en relation particuliers, ' +
              'professionnels et artisans au Maroc.' +
            '</p>' +

          '</div>' +

           /* Navigation group */
          '<div class="footer-links fxf-links">' +

            '<details class="fxf-group">' +

              '<summary class="fxf-group-heading">' +
                '<h4>Navigation</h4>' +
              '</summary>' +

              '<ul>' +
                '<li><a href="/index.html">Accueil</a></li>' +
                '<li><a href="/services.html">Services</a></li>' +
                '<li><a href="/artisans.html">Artisans</a></li>' +
                '<li><a href="/comment-ca-marche.html">Comment \u00e7a marche</a></li>' +
                '<li><a href="/pricing.html">Tarifs</a></li>' +
                '<li><a href="/entreprises.html">Entreprises</a></li>' +
                '<li><a href="/a-propos.html">\u00c0 propos</a></li>' +
              '</ul>' +

            '</details>' +

          '</div>' +
    

          /* Artisans group */
          '<div class="footer-links fxf-links">' +

            '<details class="fxf-group">' +

              '<summary class="fxf-group-heading">' +
                '<h4>Artisans</h4>' +
              '</summary>' +

              '<ul>' +
                '<li>' +
                  '<a href="/rejoindre-fixeo.html">' +
                    'Rejoindre Fixeo' +
                  '</a>' +
                '</li>' +

                '<li>' +
                  '<a href="/rejoindre-fixeo.html#revendiquer">' +
                    'Revendiquer mon profil' +
                  '</a>' +
                '</li>' +

                '<li>' +
                  '<a href="/dashboard-artisan-v2.html">' +
                    'Espace artisan' +
                  '</a>' +
                '</li>' +
              '</ul>' +

            '</details>' +

          '</div>' +

          /* Support group */
          '<div class="footer-links fxf-links">' +

            '<details class="fxf-group">' +

              '<summary class="fxf-group-heading">' +
                '<h4>Support</h4>' +
              '</summary>' +

              '<ul>' +
                '<li><a href="/contact.html">Contact</a></li>' +
                '<li><a href="/faq.html">FAQ</a></li>' +
                '<li><a href="/equipe.html">\u00c9quipe \u00e9ditoriale</a></li>' +
                '<li><a href="/whatsapp.html">WhatsApp Fixeo</a></li>' +
                '<li>' +
                  '<a href="/presse-partenariats.html">' +
                    'Presse &amp; Partenariats' +
                  '</a>' +
                '</li>' +
              '</ul>' +

            '</details>' +

          '</div>' +

        '</div>' +

        /* Legal bottom row */
        '<div class="footer-bottom fxf-bottom">' +

          '<span>' +
            '\u00a9 ' + yr + ' Fixeo. Tous droits r\u00e9serv\u00e9s.' +
          '</span>' +

         '<div class="fxf-legal-links">' +
  '<a href="/cgu.html">CGU</a>' +
  '<span aria-hidden="true">\u00b7</span>' +
  '<a href="/confidentialite.html">Confidentialit\u00e9</a>' +
  '<span aria-hidden="true">\u00b7</span>' +
  '<a href="/mentions-legales.html">Mentions l\u00e9gales</a>' +
  '<span aria-hidden="true">\u00b7</span>' +
  '<button type="button" class="footer-cookie-btn" onclick="window.FixeoConsent && window.FixeoConsent.open()" aria-label="G\u00e9rer vos pr\u00e9f\u00e9rences cookies">Pr\u00e9f\u00e9rences cookies</button>' +
'</div>' +

        '</div>' +

      '</div>' +

    '</footer>';

  /* ── Mount / legacy detection & replacement ─────────── */

  /* Priority 1: canonical mount placeholder (#fxf-mount) */
  var mount = document.getElementById('fxf-mount');

  if (mount) {

    /*
     * Replace the mount div in place —
     * footer lands exactly here.
     */
    mount.insertAdjacentHTML('afterend', html);
    mount.parentNode.removeChild(mount);

  } else {

    /*
     * Priority 2:
     * replace the first detected legacy footer in place.
     */
    var legacySelectors = [
      'footer.fixeo-footer-v1',
      'footer.fixeo-footer',
      'footer.ssp-footer',
      '.seo-footer',
      '.seo-footer-card',
      '.blog-index-footer'
    ];

    var anchor = null;

    for (var i = 0; i < legacySelectors.length; i++) {
      var el = document.querySelector(legacySelectors[i]);

      if (el) {
        anchor = el;
        break;
      }
    }

    if (anchor) {

      /* The server-rendered public profile owns a narrow main, not the site footer. */
      var insertionAnchor = anchor.matches('footer.ssp-footer') ? anchor.closest('main') || anchor : anchor;
      insertionAnchor.insertAdjacentHTML('afterend', html);
      anchor.parentNode.removeChild(anchor);

    } else {

      /*
       * Priority 3:
       * no mount or legacy footer —
       * append before </body>.
       */
      document.body.insertAdjacentHTML(
        'beforeend',
        html
      );
    }
  }

  /* ── Remove remaining legacy duplicates ──────────────── */

  var remaining = document.querySelectorAll(
    'footer.fixeo-footer-v1:not(.fxf-canonical), ' +
    'footer.fixeo-footer, footer.ssp-footer, ' +
    '.seo-footer, ' +
    '.seo-footer-card, ' +
    '.blog-index-footer'
  );

  for (var j = 0; j < remaining.length; j++) {
    remaining[j].parentNode.removeChild(
      remaining[j]
    );
  }

  /* ── Desktop: force all groups open ──────────────────── */

  /*
   * <details> ships without [open] so mobile starts collapsed.
   * On desktop (>768px), add [open] so all nav links remain
   * visible without depending on CSS display overrides alone.
   */
  if (window.innerWidth > 768) {

    var groups =
      document.querySelectorAll('.fxf-group');

    for (var k = 0; k < groups.length; k++) {
      groups[k].setAttribute('open', '');
    }
  }


  if (isApplication) return;

  /* Presentation is scoped to this public footer, away from page/application CSS. */
  var footer = document.querySelector('footer.fxf-canonical');
  footer.id = 'fixeo-public-footer';
  footer.setAttribute('data-footer-version', 'gf5a');
  var shell = footer.querySelector('.container');
  shell.className = 'fxf-shell';
  footer.querySelector('.fxf-trust-row').remove();
  footer.querySelectorAll('.footer-grid, .footer-brand, .footer-desc, .footer-links, .footer-bottom').forEach(function (el) {
    ['footer-grid', 'footer-brand', 'footer-desc', 'footer-links', 'footer-bottom'].forEach(function (name) { el.classList.remove(name); });
  });
  var logoWrap = footer.querySelector('.fxf-logo-wrap');
  var logoLink = document.createElement('a');
  logoLink.className = 'fxf-logo-wrap';
  logoLink.href = '/index.html';
  logoLink.setAttribute('aria-label', 'Fixeo — Accueil');
  while (logoWrap.firstChild) logoLink.appendChild(logoWrap.firstChild);
  logoWrap.replaceWith(logoLink);
  footer.querySelector('.fxf-logo').setAttribute('decoding', 'async');

  /* Keep all existing contextual links, including static SEO links, without duplicates. */
  function linkKey(href) {
    var url = new URL(href, window.location.href);
    var host = url.hostname.replace(/^www\./, '');
    var path = url.pathname.replace(/\.html$/, '').replace(/\/$/, '').replace(/^\/index$/, '');
    return host + path + url.search + url.hash;
  }
  var seen = new Set(Array.from(footer.querySelectorAll('a[href]')).map(function (a) { return linkKey(a.href); }));
  var local = [], related = [];
  function remember(a, collection) {
    var key = linkKey(a.href);
    if (seen.has(key)) return;
    seen.add(key);
    collection.push({ href: a.getAttribute('href'), text: a.textContent.trim() });
  }
  localSources.forEach(function (nav) { nav.querySelectorAll('a[href]').forEach(function (a) { remember(a, local); }); });
  legacyLinks.forEach(function (a) {
    var path = new URL(a.href, window.location.href).pathname;
    remember(a, /^\/(?:plombier|electricien|serrurier|climatisation|peintre|menuisier|macon|nettoyage)\//.test(path) ? local : related);
  });
  if (!local.length) {
    [
      ['/plombier/casablanca', 'Plombier Casablanca'],
      ['/electricien/casablanca', 'Électricien Casablanca'],
      ['/serrurier/rabat', 'Serrurier Rabat'],
      ['/climatisation/marrakech', 'Climatisation Marrakech'],
      ['/plombier/fes', 'Plombier Fès'],
      ['/electricien/tanger', 'Électricien Tanger']
    ].forEach(function (entry) { local.push({ href: entry[0], text: entry[1] }); });
  }
  function linkStrip(links, className, label) {
    if (!links.length) return;
    var nav = document.createElement('nav'), list = document.createElement('ul');
    nav.className = className;
    nav.setAttribute('aria-label', label);
    links.forEach(function (item) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.setAttribute('href', item.href);
      a.textContent = item.text;
      li.appendChild(a);
      list.appendChild(li);
    });
    nav.appendChild(list);
    shell.appendChild(nav);
  }
  linkStrip(related, 'fxf-related', 'Autres liens utiles');
  linkStrip(local, 'fxf-local', 'Services par ville');
  localSources.forEach(function (nav) { nav.remove(); });

  /* Native details: accessible mobile accordions, visible links on desktop. */
  var publicGroups = Array.from(footer.querySelectorAll('.fxf-group'));
  var desktop = window.matchMedia('(min-width: 769px)');
  function syncGroups() {
    publicGroups.forEach(function (group) {
      group.open = desktop.matches;
      var summary = group.querySelector('summary');
      summary.tabIndex = desktop.matches ? -1 : 0;
      summary.setAttribute('aria-expanded', String(group.open));
      if (desktop.matches) summary.setAttribute('aria-disabled', 'true');
      else summary.removeAttribute('aria-disabled');
    });
  }
  publicGroups.forEach(function (group) {
    group.addEventListener('toggle', function () {
      group.querySelector('summary').setAttribute('aria-expanded', String(group.open));
    });
  });
  syncGroups();
  if (desktop.addEventListener) desktop.addEventListener('change', syncGroups);
  else if (desktop.addListener) desktop.addListener(syncGroups);

  /* Use the existing consent UI; load it only on demand on pages without it. */
  var cookieButton = footer.querySelector('.footer-cookie-btn');
  cookieButton.removeAttribute('onclick');
  var consentLoading = false;
  cookieButton.addEventListener('click', function () {
    if (window.FixeoConsent) { window.FixeoConsent.open(); return; }
    if (consentLoading) return;
    consentLoading = true;
    cookieButton.setAttribute('aria-busy', 'true');
    var message = footer.querySelector('.fxf-cookie-status');
    if (!message) {
      message = document.createElement('p');
      message.className = 'fxf-cookie-status';
      message.setAttribute('role', 'status');
      footer.querySelector('.fxf-bottom').appendChild(message);
    }
    message.textContent = '';
    if (!document.querySelector('link[href*="fixeo-consent-v1.css"]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/css/fixeo-consent-v1.css?v=fcv1b';
      document.head.appendChild(css);
    }
    var script = document.createElement('script');
    script.src = '/js/fixeo-consent-v1.js?v=fcv1c';
    script.onload = function () {
      consentLoading = false;
      cookieButton.removeAttribute('aria-busy');
      if (window.FixeoConsent) window.FixeoConsent.open();
      else message.textContent = 'Préférences indisponibles. Réessayez.';
    };
    script.onerror = function () {
      consentLoading = false;
      cookieButton.removeAttribute('aria-busy');
      script.remove();
      message.textContent = 'Préférences indisponibles. Réessayez.';
    };
    document.head.appendChild(script);
  });

}());
