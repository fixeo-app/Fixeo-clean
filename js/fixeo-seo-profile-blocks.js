/*!
 * fixeo-seo-profile-blocks.js — v seo3
 * Profile Authority Visible Blocks
 *
 * Injects below-fold trust + SEO blocks into artisan profile pages.
 * All injections are deferred via requestIdleCallback — ZERO render impact.
 *
 * Blocks injected (in order, after .fpv2-sections-ready fires):
 *   1. Visible breadcrumb (lightweight, above hero)
 *   2. FAQ section (4 contextual Q&A per service type, glass premium style)
 *   3. "Voir aussi" internal links (related city pages + related service pages)
 *
 * Constraints:
 *   - NEVER fake reviews, ratings, or mission counts
 *   - NEVER add blocking JS or setInterval
 *   - NEVER modify renderProfile(), enhance(), reservation modal, auth/session
 *   - Guard: only runs on artisan-profile.html with _fixeoCurrentArtisan available
 *   - Idempotent: checks for existing blocks before injecting
 *   - Mobile-first: all blocks responsive, no overflow
 */
(function (window, document) {
  'use strict';

  var VERSION = 'seo3';

  /* ── City slug → display label map ── */
  var CITY_LABELS = {
    casablanca: 'Casablanca', rabat: 'Rabat', marrakech: 'Marrakech', fes: 'F\u00e8s',
    tanger: 'Tanger', agadir: 'Agadir', meknes: 'Mekn\u00e8s', oujda: 'Oujda',
    kenitra: 'K\u00e9nitra', temara: 'T\u00e9mara', sale: 'Sal\u00e9', mohammedia: 'Mohammedia',
    'el-jadida': 'El Jadida', 'beni-mellal': 'Beni Mellal', khouribga: 'Khouribga',
    safi: 'Safi', nador: 'Nador', taza: 'Taza', ouarzazate: 'Ouarzazate', tetouan: 'T\u00e9touan'
  };

  /* ── Service FAQ content ── */
  var FAQ_SVC = {
    plombier: [
      { q: 'Quels types de travaux de plomberie prenez-vous en charge ?', a: 'D\u00e9pannage de fuite, d\u00e9bouchage de canalisations, remplacement de robinetterie, entretien de chauffe-eau et installation sanitaire.' },
      { q: 'Intervenez-vous en urgence pour une fuite d\u2019eau ?', a: 'Oui. Signalez l\u2019urgence dans votre demande et l\u2019artisan confirmera sa disponibilit\u00e9 le plus rapidement possible.' },
      { q: 'Quelles sont les zones d\u2019intervention couvertes ?', a: 'Les zones d\u2019intervention sont pr\u00e9cis\u00e9es sur le profil de l\u2019artisan. La plupart interviennent dans leur ville et les quartiers proches.' },
      { q: 'Comment se passe le paiement apr\u00e8s l\u2019intervention ?', a: 'Le paiement se r\u00e8gle directement avec l\u2019artisan apr\u00e8s l\u2019intervention. Fixeo ne pr\u00e9l\u00e8ve aucun frais sur les clients.' }
    ],
    electricien: [
      { q: 'Quels types d\u2019interventions \u00e9lectriques r\u00e9alisez-vous ?', a: 'D\u00e9pannage de tableau \u00e9lectrique, remplacement de disjoncteur, installation de prises, mise aux normes et diagnostic complet.' },
      { q: 'Intervenez-vous en cas de panne totale d\u2019\u00e9lectricit\u00e9 ?', a: 'Oui, pour les pannes urgentes. Signalez l\u2019urgence dans votre demande et v\u00e9rifiez la disponibilit\u00e9 sur le profil.' },
      { q: 'Les travaux n\u00e9cessitent-ils une attestation ?', a: 'Certains travaux lourds peuvent n\u00e9cessiter une validation. L\u2019artisan peut vous conseiller lors du diagnostic sur site.' },
      { q: 'Comment se passe le paiement ?', a: 'Paiement directement avec l\u2019\u00e9lectricien apr\u00e8s r\u00e9alisation. Fixeo ne pr\u00e9l\u00e8ve aucun frais sur les clients.' }
    ],
    serrurier: [
      { q: 'Que faire si je suis bloqu\u00e9 \u00e0 l\u2019ext\u00e9rieur de mon domicile ?', a: 'Contactez un serrurier Fixeo pour une ouverture d\u2019urgence. Indiquez la situation dans votre demande pour acc\u00e9l\u00e9rer l\u2019intervention.' },
      { q: 'Proposez-vous le remplacement de serrures et de cylindres ?', a: 'Oui, remplacement de cylindres standards, multipoints et blind\u00e9s. Sécurisation apr\u00e8s effraction \u00e9galement possible.' },
      { q: 'Intervenez-vous le week-end ou les jours f\u00e9ri\u00e9s ?', a: 'Certains artisans sont disponibles le week-end. V\u00e9rifiez la disponibilit\u00e9 indiqu\u00e9e sur le profil avant de soumettre votre demande.' },
      { q: 'Quel est le co\u00fbt d\u2019une ouverture de porte ?', a: 'Le tarif d\u00e9pend du type de serrure et du cr\u00e9neau (semaine, week-end, nuit). Demandez une estimation avant confirmation.' }
    ],
    climatisation: [
      { q: 'Proposez-vous l\u2019installation de nouveaux climatiseurs ?', a: 'Oui, installation de splits muraux, multi-splits et gainables. Avec ou sans fourniture du mat\u00e9riel selon l\u2019artisan.' },
      { q: 'Comment entretenir son climatiseur pour \u00e9viter les pannes ?', a: 'Un nettoyage annuel des filtres et une v\u00e9rification du niveau de gaz r\u00e9frig\u00e9rant prolongent la dur\u00e9e de vie et optimisent les performances.' },
      { q: 'Mon climatiseur ne refroidit plus. Quelle est la cause ?', a: 'Les causes les plus fr\u00e9quentes : filtre encr\u00e0ss\u00e9, fuite de gaz r\u00e9frig\u00e9rant ou probl\u00e8me de compresseur. Un technicien peut diagnostiquer en moins d\u2019une heure.' },
      { q: 'Comment se passe le paiement apr\u00e8s l\u2019intervention ?', a: 'Paiement directement avec le technicien apr\u00e8s l\u2019intervention. Fixeo ne pr\u00e9l\u00e8ve aucun frais sur les clients.' }
    ]
  };

  var FAQ_DEFAULT = [
    { q: 'Comment contacter cet artisan ?', a: 'Cliquez sur \u00ab R\u00e9server l\u2019intervention \u00bb pour envoyer votre demande via Fixeo. L\u2019artisan confirmera selon sa disponibilit\u00e9.' },
    { q: 'Peut-on demander un devis avant l\u2019intervention ?', a: 'Oui, vous pouvez demander une estimation lors de votre demande. Les tarifs varient selon la complexit\u00e9 de l\u2019intervention et le d\u00e9placement.' },
    { q: 'Comment se passe le paiement ?', a: 'Le paiement se r\u00e8gle directement avec l\u2019artisan apr\u00e8s l\u2019intervention. Fixeo ne pr\u00e9l\u00e8ve aucun frais sur les clients.' },
    { q: 'L\u2019artisan intervient-il en urgence ?', a: 'Certains artisans proposent des interventions rapides. Signalez votre urgence dans la demande et v\u00e9rifiez la disponibilit\u00e9 sur le profil.' }
  ];

  var NEARBY = {
    casablanca: ['mohammedia','sale','rabat'], rabat: ['sale','temara','kenitra'],
    marrakech: ['agadir','casablanca'], fes: ['meknes','taza','rabat'],
    tanger: ['tetouan','kenitra'], agadir: ['safi','ouarzazate','marrakech'],
    meknes: ['fes','rabat'], oujda: ['nador','taza'], kenitra: ['rabat','sale'],
    temara: ['rabat','sale'], sale: ['rabat','temara'], mohammedia: ['casablanca','sale'],
    'el-jadida': ['casablanca','safi'], 'beni-mellal': ['khouribga','marrakech'],
    khouribga: ['beni-mellal','casablanca'], safi: ['el-jadida','marrakech'],
    nador: ['oujda','taza'], taza: ['fes','oujda'], ouarzazate: ['agadir','marrakech'],
    tetouan: ['tanger','kenitra']
  };

  var SVC_SLUGS = {
    plombier: 'plombier', plomberie: 'plombier',
    electricien: 'electricien', electricite: 'electricien', electricite_generale: 'electricien',
    serrurier: 'serrurier', serrurerie: 'serrurier',
    climatisation: 'climatisation', clim: 'climatisation',
    peinture: 'peinture', peintre: 'peinture',
    carrelage: 'carrelage', carreleur: 'carrelage',
    maconnerie: 'maconnerie', macon: 'maconnerie',
    menuiserie: 'menuiserie', menuisier: 'menuiserie',
    jardinage: 'jardinage', jardinier: 'jardinage',
    nettoyage: 'nettoyage', demenagement: 'demenagement'
  };

  var SVC_RELATED = {
    plombier: ['electricien', 'serrurier'],
    electricien: ['plombier', 'climatisation'],
    serrurier: ['electricien', 'plombier'],
    climatisation: ['electricien', 'plombier'],
    peinture: ['electricien', 'plombier'],
    /* Extended categories — unknown svcSlug still gets nearby city links */
    carrelage: ['plombier', 'peinture'],
    maconnerie: ['plombier', 'electricien'],
    menuiserie: ['serrurier', 'electricien'],
    jardinage: ['plombier', 'electricien'],
    nettoyage: ['plombier', 'electricien'],
    demenagement: ['electricien', 'plombier']
  };

  var SVC_DISPLAY = {
    plombier: 'Plombier', electricien: '\u00c9lectricien', serrurier: 'Serrurier',
    climatisation: 'Climatisation', peinture: 'Peinture'
  };

  /* ── Helpers ── */
  function _esc(s) { return !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function _citySlug(cityName) {
    if (!cityName) return '';
    return cityName.toLowerCase()
      .replace(/\u00e0/g,'a').replace(/\u00e9/g,'e').replace(/\u00e8/g,'e').replace(/\u00ea/g,'e')
      .replace(/\u00ee/g,'i').replace(/\u00f4/g,'o').replace(/\u00f9/g,'u').replace(/\u00fb/g,'u')
      .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  }

  function _svcSlug(category) {
    if (!category) return '';
    var key = category.toLowerCase().replace(/[^a-z0-9_]/g,'_');
    return SVC_SLUGS[key] || SVC_SLUGS[category.toLowerCase()] || '';
  }

  function _faqItems(category) {
    if (!category) return FAQ_DEFAULT;
    var key = category.toLowerCase();
    for (var k in FAQ_SVC) {
      if (key.indexOf(k) !== -1) return FAQ_SVC[k];
    }
    return FAQ_DEFAULT;
  }

  /* ── 1. BREADCRUMB (visible, lightweight, above hero) ── */
  function injectBreadcrumb(artisan) {
    if (document.getElementById('fpv2-seo-breadcrumb')) return;

    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    var svcLabel = SVC_DISPLAY[_svcSlug(artisan.category)] || artisan.category || 'Artisan';
    var citySlug = _citySlug(artisan.city);
    var svcSlug = _svcSlug(artisan.category);
    var cityLabel = CITY_LABELS[citySlug] || artisan.city || '';

    var localPageHref = (svcSlug && citySlug) ? (svcSlug + '-' + citySlug + '.html') : null;

    var crumbHTML =
      '<nav id="fpv2-seo-breadcrumb" class="fpv2-seo-breadcrumb" aria-label="Fil d\'ariane">' +
        '<ol class="fpv2-seo-crumbs">' +
          '<li><a href="index.html">Fixeo</a></li>' +
          '<li><a href="services.html">' + _esc(svcLabel) + '</a></li>' +
          (localPageHref && cityLabel
            ? '<li><a href="' + _esc(localPageHref) + '">' + _esc(svcLabel) + ' \u00e0 ' + _esc(cityLabel) + '</a></li>'
            : '') +
          '<li aria-current="page">' + _esc(artisan.name) + '</li>' +
        '</ol>' +
      '</nav>';

    root.insertAdjacentHTML('beforebegin', crumbHTML);
  }

  /* ── 2. FAQ SECTION ── */
  function injectFAQ(artisan) {
    if (document.getElementById('fpv2-seo-faq')) return;

    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    var faqs = _faqItems(artisan.category);
    var svcLabel = SVC_DISPLAY[_svcSlug(artisan.category)] || artisan.category || 'Artisan';
    var cityLabel = CITY_LABELS[_citySlug(artisan.city)] || artisan.city || '';

    var faqTitle = svcLabel && cityLabel
      ? 'Questions fr\u00e9quentes — ' + svcLabel + ' \u00e0 ' + cityLabel
      : 'Questions fr\u00e9quentes';

    var itemsHTML = faqs.map(function(f, i) {
      return (
        '<div class="fpv2-faq-item" id="fpv2-faq-' + i + '">' +
          '<button class="fpv2-faq-q" type="button" aria-expanded="false" ' +
            'aria-controls="fpv2-faq-a-' + i + '" ' +
            'onclick="(function(btn){' +
              'var item=btn.closest(\'.fpv2-faq-item\');' +
              'var open=item.classList.toggle(\'fpv2-faq-open\');' +
              'btn.setAttribute(\'aria-expanded\',open);' +
            '}(this))">' +
            '<span>' + _esc(f.q) + '</span>' +
            '<span class="fpv2-faq-arrow" aria-hidden="true">\u203a</span>' +
          '</button>' +
          '<div class="fpv2-faq-a" id="fpv2-faq-a-' + i + '" role="region" aria-labelledby="fpv2-faq-' + i + '">' +
            '<p>' + _esc(f.a) + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var faqHTML =
      '<section id="fpv2-seo-faq" class="fpv2-seo-section fpv2-faq-section" aria-labelledby="fpv2-faq-title">' +
        '<div class="fpv2-section-label">Questions fr\u00e9quentes</div>' +
        '<h2 id="fpv2-faq-title">' + _esc(faqTitle) + '</h2>' +
        '<div class="fpv2-faq-list">' + itemsHTML + '</div>' +
      '</section>';

    root.insertAdjacentHTML('beforeend', faqHTML);
  }

  /* ── 3. VOIR AUSSI — Related links ── */
  function injectVoirAussi(artisan) {
    if (document.getElementById('fpv2-seo-links')) return;

    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    var citySlug = _citySlug(artisan.city);
    var svcSlug = _svcSlug(artisan.category);
    var cityLabel = CITY_LABELS[citySlug] || artisan.city || '';
    var svcLabel = SVC_DISPLAY[svcSlug] || artisan.category || '';

    var links = [];

    /* Same city, other services (2 links) — only for known service pages */
    var knownSvcs = ['plombier','electricien','serrurier','climatisation','peinture'];
    var relSvcs = SVC_RELATED[svcSlug] || [];
    relSvcs.filter(function(rs){ return knownSvcs.indexOf(rs) !== -1; }).slice(0, 2).forEach(function(rs) {
      if (!citySlug) return;
      links.push({
        href: rs + '-' + citySlug + '.html',
        label: SVC_DISPLAY[rs] + ' \u00e0 ' + cityLabel,
        desc: 'Trouver un ' + SVC_DISPLAY[rs].toLowerCase() + ' disponible \u00e0 ' + cityLabel + '.'
      });
    });

    /* Same service, nearby cities (2 links) — only if svcSlug maps to a known page */
    var nearby = NEARBY[citySlug] || [];
    var nearbyLimit = links.length >= 2 ? 2 : 3; /* show more nearby if no related-service links */
    nearby.slice(0, nearbyLimit).forEach(function(nc) {
      var svcForLink = knownSvcs.indexOf(svcSlug) !== -1 ? svcSlug : 'plombier'; /* safe fallback */
      var ncLabel = CITY_LABELS[nc] || nc;
      links.push({
        href: svcForLink + '-' + nc + '.html',
        label: SVC_DISPLAY[svcForLink] + ' \u00e0 ' + ncLabel,
        desc: 'Artisans disponibles \u00e0 ' + ncLabel + '.'
      });
    });

    if (!links.length) return;

    var linksHTML = links.map(function(l) {
      return (
        '<a class="fpv2-seo-link-card" href="' + _esc(l.href) + '">' +
          '<strong>' + _esc(l.label) + '</strong>' +
          '<span>' + _esc(l.desc) + '</span>' +
        '</a>'
      );
    }).join('');

    var sectionHTML =
      '<section id="fpv2-seo-links" class="fpv2-seo-section fpv2-links-section" aria-labelledby="fpv2-links-title">' +
        '<div class="fpv2-section-label">Services li\u00e9s</div>' +
        '<h2 id="fpv2-links-title">Voir aussi</h2>' +
        '<div class="fpv2-seo-links-grid">' + linksHTML + '</div>' +
      '</section>';

    root.insertAdjacentHTML('beforeend', sectionHTML);
  }

  /* ── MAIN: listen for artisan resolved, then idle-inject ── */
  function _injectAll(artisan) {
    if (!artisan || !artisan.name) return;

    var rIC = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : function(fn) { setTimeout(fn, 120); };

    rIC(function() {
      try { injectBreadcrumb(artisan); } catch(e) {}
      rIC(function() {
        try { injectFAQ(artisan); } catch(e) {}
        rIC(function() {
          try { injectVoirAussi(artisan); } catch(e) {}
        });
      });
    }, { timeout: 4000 });
  }

  document.addEventListener('fixeo:artisan:resolved', function(e) {
    try {
      var artisan = e && e.detail && e.detail.artisan ? e.detail.artisan : null;
      if (artisan) _injectAll(artisan);
    } catch(err) { /* silent */ }
  }, { once: true });

  /* Fallback */
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(function() {
      if (window._fixeoCurrentArtisan && !document.getElementById('fpv2-seo-faq')) {
        _injectAll(window._fixeoCurrentArtisan);
      }
    }, { timeout: 6000 });
  }

  window.FixeoSEOProfileBlocks = { version: VERSION };

}(window, document));
