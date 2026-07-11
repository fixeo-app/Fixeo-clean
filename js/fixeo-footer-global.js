/*!
 * fixeo-footer-global.js — v gf3a
 * Global Footer Injection Authority
 *
 * Injects the canonical Fixeo premium footer HTML on public-facing pages
 * that do not have a native footer (artisan-profile, results, etc.).
 *
 * Guards:
 *  1. Idempotent — skips if footer.fixeo-footer-v1 already in DOM (homepage)
 *  2. Dashboard skip — no footer on authenticated app-shell pages
 *  3. Auth page — injects minimal copyright footer only
 *
 * Usage: add as deferred script at end of <body>.
 * CSS: fixeo-footer-global.css must be loaded in <head>.
 *
 * DO NOT touch: reservation modal, auth/session, Supabase, matching engine.
 */
(function () {
  'use strict';

  /* ── Guards ──────────────────────────────────────────── */
  // Already has a footer → homepage or already injected
  if (document.querySelector('footer.fixeo-footer-v1, footer.fixeo-footer-auth')) return;

  // Dashboard pages: no footer (app shells)
  var isDashboard = !!(
    document.querySelector('[data-page="dashboard-artisan"], [data-page="dashboard-client"]') ||
    document.body.classList.contains('artisan-dashboard') ||
    document.body.classList.contains('client-dashboard') ||
    /\bdashboard-artisan\b/.test(document.body.getAttribute('id') || '') ||
    /\bdashboard-client\b/.test(document.body.getAttribute('id') || '') ||
    window.location.pathname.indexOf('dashboard-artisan') !== -1 ||
    window.location.pathname.indexOf('dashboard-client') !== -1
  );
  if (isDashboard) return;

  /* ── Auth page: minimal footer ───────────────────────── */
  var isAuth = !!(
    document.querySelector('[data-page="auth"], #auth-modal, #auth-container, .auth-container, .auth-card') ||
    window.location.pathname.indexOf('auth.html') !== -1
  );
  if (isAuth) {
    var authFooter = document.createElement('footer');
    authFooter.className = 'fixeo-footer-auth';
    authFooter.setAttribute('role', 'contentinfo');
    authFooter.innerHTML =
      '\u00a9 2026 Fixeo \u2014 ' +
      '<a href="cgu.html">CGU</a> \u00b7 ' +
      '<a href="confidentialite.html">Confidentialit\u00e9</a> \u00b7 ' +
      '<a href="contact.html">Contact</a> \u00b7 ' +
      '<button type="button" class="footer-cookie-btn" onclick="window.FixeoConsent && window.FixeoConsent.open()" aria-label="G\u00e9rer vos pr\u00e9f\u00e9rences cookies">Pr\u00e9f\u00e9rences cookies</button>';
    document.body.appendChild(authFooter);
    return;
  }

  /* ── Full premium footer HTML ────────────────────────── */
  var html = [
    '<footer class="fixeo-footer-v1" role="contentinfo">',
    '  <div class="container">',

    '    <!-- Trust badges row -->',
    '    <div class="v13-partners-row" aria-label="Garanties Fixeo">',
    '      <span class="v13-partner-badge fpb-verified">&#10003;&#65039; Artisans qualifi\u00e9s</span>',
    '      <span class="v13-partner-badge fpb-payment">&#128179; Paiement apr\u00e8s intervention</span>',
    '      <span class="v13-partner-badge fpb-available">&#9889; Disponible maintenant</span>',
    '      <span class="v13-partner-badge fpb-coverage">&#128205; Actif dans tout le Maroc</span>',
    '      <span class="v13-partner-badge fpb-secure">&#128274; Donn\u00e9es prot\u00e9g\u00e9es</span>',
    '    </div>',

    '    <div class="footer-grid">',

    '      <!-- Brand -->',
    '      <div class="footer-brand">',
    '        <div class="logo-wrap" style="margin-bottom:14px">',
    '          <img src="img/logo.png" alt="Fixeo" style="height:38px;width:auto;object-fit:contain;background:transparent" onerror="this.onerror=null;this.alt=\'Fixeo\';">',
    '        </div>',
    '        <p class="footer-desc">La plateforme de r\u00e9f\u00e9rence pour trouver des artisans qualifi\u00e9s au Maroc. Rapide, s\u00e9curis\u00e9, v\u00e9rifi\u00e9.</p>',
    '        <a href="rejoindre-fixeo.html" class="footer-artisan-cta">&#128736; Rejoindre Fixeo en tant qu\u2019artisan</a>',
    '      </div>',

    '      <!-- Navigation -->',
    '      <div class="footer-links">',
    '        <h4>Navigation</h4>',
    '        <ul>',
    '          <li><a href="index.html">Accueil</a></li>',
    '          <li><a href="services.html">Services</a></li>',
    '          <li><a href="artisans.html">Artisans</a></li>',
    '          <li><a href="comment-ca-marche.html">Comment \u00e7a marche</a></li>',
    '          <li><a href="pricing.html">Tarifs</a></li>',
    '        </ul>',
    '      </div>',

    '      <!-- Artisans -->',
    '      <div class="footer-links">',
    '        <h4>Artisans</h4>',
    '        <ul>',
    '          <li><a href="rejoindre-fixeo.html">Rejoindre Fixeo</a></li>',
    '          <li><a href="rejoindre-fixeo.html#revendiquer">Revendiquer mon profil</a></li>',
    '          <li><a href="dashboard-artisan.html">Espace artisan</a></li>',
    '        </ul>',
    '      </div>',

    '      <!-- Support -->',
    '      <div class="footer-links">',
    '        <h4>Support</h4>',
    '        <ul>',
    '          <li><a href="contact.html">Contact</a></li>',
    '          <li><a href="faq.html">FAQ</a></li>',
    '          <li><a href="cgu.html">CGU</a></li>',
    '          <li><a href="confidentialite.html">Confidentialit\u00e9</a></li>',
    '          <li><a href="whatsapp.html">WhatsApp Fixeo</a></li>',
    '          <li><a href="presse-partenariats.html">Presse &amp; Partenariats</a></li>',
    '        </ul>',
    '      </div>',
    '    </div>',

    '    <!-- Footer bottom bar -->',
    '    <div class="footer-bottom">',
    '      <span>\u00a9 2026 Fixeo. Tous droits r\u00e9serv\u00e9s.</span>',
    '      <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">',
    '        <a href="auth.html">Connexion</a>',
    '        <span style="color:rgba(255,255,255,.18)">\u00b7</span>',
    '        <a href="rejoindre-fixeo.html">Je suis artisan</a>',
    '        <span style="color:rgba(255,255,255,.18)">\u00b7</span>',
    '        <a href="dashboard-client.html">Dashboard</a>',
    '        <span style="color:rgba(255,255,255,.18)">\u00b7</span>',
    '        <button type="button" class="footer-cookie-btn" onclick="window.FixeoConsent && window.FixeoConsent.open()" aria-label="G\u00e9rer vos pr\u00e9f\u00e9rences cookies">',
    '          \ud83c\udf6a Pr\u00e9f\u00e9rences cookies',
    '        </button>',
    '      </div>',
    '    </div>',

    '  </div>',
    '</footer>'
  ].join('\n');

  /* ── Inject at end of <body> ─────────────────────────── */
  document.body.insertAdjacentHTML('beforeend', html);

}());
