/*!
 * fixeo-footer-global.js — v gf4a
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
 * CSS: fixeo-footer-global.css must be loaded in <head>.
 * DO NOT touch: reservation modal, auth/session, Supabase, analytics.
 */
(function () {
  'use strict';

  /* ── Idempotent guard ─────────────────────────────────── */
  if (document.querySelector('.fxf-canonical')) return;

  /* ── Dashboard / admin skip ───────────────────────────── */
  var isDashboard = !!(
    document.querySelector('[data-page="dashboard-artisan"], [data-page="dashboard-client"]') ||
    document.body.classList.contains('artisan-dashboard') ||
    document.body.classList.contains('client-dashboard') ||
    /\bdashboard-artisan\b/.test(document.body.getAttribute('id') || '') ||
    /\bdashboard-client\b/.test(document.body.getAttribute('id') || '') ||
    window.location.pathname.indexOf('dashboard-artisan') !== -1 ||
    window.location.pathname.indexOf('dashboard-client') !== -1 ||
    window.location.pathname.indexOf('admin') !== -1 ||
    window.location.pathname.indexOf('confirmation') !== -1
  );
  if (isDashboard) return;

  /* ── Auth page: minimal footer ───────────────────────── */
  var isAuth = !!(
    document.querySelector('[data-page="auth"], #auth-modal, #auth-container, .auth-container, .auth-card') ||
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
      '<button type="button" class="footer-cookie-btn" onclick="window.FixeoConsent && window.FixeoConsent.open()" aria-label="G\u00e9rer vos pr\u00e9f\u00e9rences cookies">Pr\u00e9f\u00e9rences cookies</button>';
    document.body.appendChild(authFooter);
    return;
  }

  /* ── Build canonical footer HTML ─────────────────────── */
  var yr = new Date().getFullYear();

  var html = '<footer class="fixeo-footer-v1 fxf-canonical" role="contentinfo" aria-label="Pied de page Fixeo">' +
    '<div class="container">' +

    /* Trust signals row — factual only */
    '<div class="fxf-trust-row" aria-label="Engagements Fixeo">' +
      '<span class="fxf-trust-badge">\uD83D\uDCCB Profils r\u00e9f\u00e9renc\u00e9s sur FIXEO</span>' +
      '<span class="fxf-trust-badge">\uD83D\uDCB3 Paiement apr\u00e8s intervention</span>' +
    '</div>' +

    /* Main grid — Brand / Nav / Artisans / Support */
    '<div class="footer-grid fxf-grid">' +

      /* Brand column */
      '<div class="footer-brand fxf-brand">' +
        '<div class="fxf-logo-wrap">' +
          '<img src="/img/logo.png" alt="Fixeo" class="fxf-logo" onerror="this.onerror=null;this.alt=\'Fixeo\';">' +
        '</div>' +
        '<p class="footer-desc fxf-desc">La plateforme qui met en relation particuliers, professionnels et artisans au Maroc.</p>' +
        '<button type="button" class="fxf-primary-cta" data-open-request-form="true">' +
          'Publier une demande' +
        '</button>' +
      '</div>' +

      /* Navigation group */
      '<div class="footer-links fxf-links">' +
        '<details class="fxf-group">' +
          '<summary class="fxf-group-heading"><h4>Navigation</h4></summary>' +
          '<ul>' +
            '<li><a href="/index.html">Accueil</a></li>' +
            '<li><a href="/services.html">Services</a></li>' +
            '<li><a href="/artisans.html">Artisans</a></li>' +
            '<li><a href="/comment-ca-marche.html">Comment \u00e7a marche</a></li>' +
            '<li><a href="/pricing.html">Tarifs</a></li>' +
            '<li><a href="/entreprises.html">Entreprises</a></li>' +
          '</ul>' +
        '</details>' +
      '</div>' +

      /* Artisans group */
      '<div class="footer-links fxf-links">' +
        '<details class="fxf-group">' +
          '<summary class="fxf-group-heading"><h4>Artisans</h4></summary>' +
          '<ul>' +
            '<li><a href="/rejoindre-fixeo.html">Rejoindre Fixeo</a></li>' +
            '<li><a href="/rejoindre-fixeo.html#revendiquer">Revendiquer mon profil</a></li>' +
            '<li><a href="/dashboard-artisan-v2.html">Espace artisan</a></li>' +
          '</ul>' +
        '</details>' +
      '</div>' +

      /* Support group */
      '<div class="footer-links fxf-links">' +
        '<details class="fxf-group">' +
          '<summary class="fxf-group-heading"><h4>Support</h4></summary>' +
          '<ul>' +
            '<li><a href="/contact.html">Contact</a></li>' +
            '<li><a href="/faq.html">FAQ</a></li>' +
            '<li><a href="/equipe.html">\u00c9quipe \u00e9ditoriale</a></li>' +
            '<li><a href="/whatsapp.html">WhatsApp Fixeo</a></li>' +
            '<li><a href="/presse-partenariats.html">Presse &amp; Partenariats</a></li>' +
          '</ul>' +
        '</details>' +
      '</div>' +

    '</div>' + /* /footer-grid */

    /* Legal bottom row */
    '<div class="footer-bottom fxf-bottom">' +
      '<span>\u00a9 ' + yr + ' Fixeo. Tous droits r\u00e9serv\u00e9s.</span>' +
      '<div class="fxf-legal-links">' +
        '<a href="/cgu.html">CGU</a>' +
        '<span aria-hidden="true">\u00b7</span>' +
        '<a href="/confidentialite.html">Confidentialit\u00e9</a>' +
        '<span aria-hidden="true">\u00b7</span>' +
        '<button type="button" class="footer-cookie-btn" onclick="window.FixeoConsent && window.FixeoConsent.open()" aria-label="G\u00e9rer vos pr\u00e9f\u00e9rences cookies">Pr\u00e9f\u00e9rences cookies</button>' +
      '</div>' +
    '</div>' +

  '</div>' + /* /container */
  '</footer>';

  /* ── Mount / legacy detection & replacement ─────────── */
  /* Priority 1: canonical mount placeholder (#fxf-mount) */
  var mount = document.getElementById('fxf-mount');

  if (mount) {
    /* Replace the mount div in place — footer lands exactly here */
    mount.insertAdjacentHTML('afterend', html);
    mount.parentNode.removeChild(mount);
  } else {
    /* Priority 2: replace the first detected legacy footer in place */
    var legacySelectors = [
      'footer.fixeo-footer-v1',
      '.seo-footer',
      '.seo-footer-card',
      '.blog-index-footer'
    ];

    var anchor = null;
    for (var i = 0; i < legacySelectors.length; i++) {
      var el = document.querySelector(legacySelectors[i]);
      if (el) { anchor = el; break; }
    }

    if (anchor) {
      anchor.insertAdjacentHTML('afterend', html);
      anchor.parentNode.removeChild(anchor);
    } else {
      /* Priority 3: no mount or legacy footer — append before </body> */
      document.body.insertAdjacentHTML('beforeend', html);
    }
  }

  /* Remove any remaining duplicate legacy footer elements */
  var remaining = document.querySelectorAll(
    'footer.fixeo-footer-v1:not(.fxf-canonical), .seo-footer, .seo-footer-card, .blog-index-footer'
  );
  for (var j = 0; j < remaining.length; j++) {
    remaining[j].parentNode.removeChild(remaining[j]);
  }

  /* ── Wire primary CTA ─────────────────────────────────── */
  /* Fires the canonical RAFI V5 open handler */
  var cta = document.querySelector('.fxf-primary-cta[data-open-request-form="true"]');
  if (cta) {
    cta.addEventListener('click', function () {
      /* Delegate to the V5 flow open mechanism */
      var trigger = document.querySelector('[data-open-request-form="true"]:not(.fxf-primary-cta)');
      if (trigger) {
        trigger.click();
        return;
      }
      /* Fallback: dispatch a custom event that V5 flow listens for */
      document.dispatchEvent(new CustomEvent('fixeo:openRequestFlow'));
    });
  }

  /* ── Desktop: force all groups open (CSS-free fallback) ── */
  /* <details> ships without [open] so mobile starts collapsed. */
  /* On desktop (>768px) add [open] so all nav links are visible */
  /* without depending on CSS display overrides alone.          */
  if (window.innerWidth > 768) {
    var groups = document.querySelectorAll('.fxf-group');
    for (var k = 0; k < groups.length; k++) {
      groups[k].setAttribute('open', '');
    }
  }

}());
