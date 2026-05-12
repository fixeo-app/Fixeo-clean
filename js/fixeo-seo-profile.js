/*!
 * fixeo-seo-profile.js — v seo3
 * Dynamic SEO enrichment for artisan-profile.html
 *
 * Listens for fixeo:artisan:resolved (dispatched by fixeo-profile-v2a.js
 * after Supabase data arrives) and updates:
 *   - <title>
 *   - <meta name="description">
 *   - og:title / og:description / og:url / og:image
 *   - twitter:title / twitter:description
 *   - <link rel="canonical">
 *   - JSON-LD ProfessionalService + AggregateRating + BreadcrumbList + FAQPage
 *
 * Lightweight: no DOM thrash, no polling, no setInterval.
 * Fires ONCE per page load via event listener.
 *
 * DO NOT: modify reservation logic, profile render, auth/session.
 */
(function (window, document) {
  'use strict';

  var VERSION = 'seo3';

  /* ── Service label map (category slug → display label) ── */
  var SVC_LABELS = {
    plombier: 'Plombier', plomberie: 'Plombier',
    electricien: '\u00c9lectricien', electricite: '\u00c9lectricien', electricite_generale: '\u00c9lectricien',
    serrurier: 'Serrurier', serrurerie: 'Serrurier',
    climatisation: 'Technicien climatisation', clim: 'Technicien climatisation',
    peinture: 'Peintre', peintre: 'Peintre',
    carrelage: 'Carreleur', maconnerie: 'Ma\u00e7on', menuiserie: 'Menuisier',
    jardinage: 'Jardinier', nettoyage: 'Agent de nettoyage',
    demenagement: 'D\u00e9m\u00e9nageur'
  };

  /* ── Per-service FAQ templates ── */
  var FAQ_BY_SERVICE = {
    plombier: [
      { q: 'Quels types de pannes de plomberie prenez-vous en charge ?', a: 'Fuites d\u2019eau, débouchage de canalisations, remplacement de robinetterie, entretien de chauffe-eau et toute intervention urgente de plomberie.' },
      { q: 'Intervenez-vous en urgence ?', a: 'Oui, les artisans Fixeo proposent des interventions rapides selon leur disponibilité. Indiquez l\u2019urgence dans votre demande.' },
      { q: 'Comment se passe le paiement ?', a: 'Le paiement se fait directement avec l\u2019artisan après l\u2019intervention. Fixeo ne prélève aucun frais sur les clients.' },
      { q: 'Peut-on obtenir un devis avant l\u2019intervention ?', a: 'Oui, vous pouvez demander une estimation avant confirmation. Les tarifs varient selon la complexité et le déplacement.' }
    ],
    electricien: [
      { q: 'Quelles interventions électriques réalisez-vous ?', a: 'Dépannage de tableau, remplacement de disjoncteur, installation de prises, mise aux normes et diagnostic électrique complet.' },
      { q: 'Intervenez-vous en cas de panne totale ?', a: 'Oui, les électriciens Fixeo interviennent pour les pannes électriques urgentes selon leur disponibilité.' },
      { q: 'Les travaux électriques nécessitent-ils un permis ?', a: 'Certains travaux lourds requièrent une validation technique. L\u2019artisan peut vous conseiller lors du diagnostic.' },
      { q: 'Comment se passe le paiement ?', a: 'Paiement directement avec l\u2019artisan après l\u2019intervention. Aucun frais prélevé par Fixeo sur les clients.' }
    ],
    serrurier: [
      { q: 'Que faire si je suis bloqué dehors ?', a: 'Contactez un serrurier Fixeo pour une ouverture de porte d\u2019urgence. Indiquez votre situation dans la demande.' },
      { q: 'Proposez-vous le remplacement de serrures ?', a: 'Oui, pose et remplacement de cylindres, serrures multipoints et serrures blindées.' },
      { q: 'Intervenez-vous le week-end ?', a: 'Certains artisans sont disponibles le week-end. Vérifiez la disponibilité dans le profil.' },
      { q: 'Comment se passe le paiement ?', a: 'Paiement directement avec le serrurier après l\u2019intervention. Fixeo ne prélève aucun frais sur les clients.' }
    ],
    climatisation: [
      { q: 'Proposez-vous l\u2019installation de climatiseurs ?', a: 'Oui, installation de splits, multi-splits et climatiseurs gainables, avec ou sans fourniture de matériel.' },
      { q: 'Comment entretenir son climatiseur ?', a: 'Un nettoyage annuel des filtres et une recharge gaz si nécessaire prolongent la durée de vie et améliorent les performances.' },
      { q: 'Mon climatiseur ne refroidit plus, que faire ?', a: 'Contactez un technicien Fixeo pour un diagnostic : fuite de gaz, filtre encrassé ou problème de compresseur sont les causes les plus fréquentes.' },
      { q: 'Comment se passe le paiement ?', a: 'Paiement directement avec le technicien après l\u2019intervention. Aucun frais prélevé par Fixeo.' }
    ]
  };

  var FAQ_DEFAULT = [
    { q: 'Comment contacter cet artisan ?', a: 'Cliquez sur \u00ab\u00a0R\u00e9server l\u2019intervention\u00a0\u00bb pour envoyer votre demande directement via Fixeo.' },
    { q: 'Le paiement est-il sécurisé ?', a: 'Le paiement se fait directement avec l\u2019artisan après l\u2019intervention. Fixeo ne prélève aucun frais sur les clients.' },
    { q: 'Peut-on obtenir un devis avant l\u2019intervention ?', a: 'Oui, vous pouvez demander une estimation lors de votre demande. Les tarifs varient selon la complexité et le déplacement.' },
    { q: 'L\u2019artisan intervient-il en urgence ?', a: 'Certains artisans proposent des interventions rapides. Vérifiez leur disponibilité sur le profil et signalez votre urgence.' }
  ];

  function _svcLabel(category) {
    if (!category) return 'Artisan';
    var key = String(category).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return SVC_LABELS[key] || SVC_LABELS[category.toLowerCase()] || category;
  }

  function _faqForService(category) {
    if (!category) return FAQ_DEFAULT;
    var key = String(category).toLowerCase();
    for (var k in FAQ_BY_SERVICE) {
      if (key.indexOf(k) !== -1) return FAQ_BY_SERVICE[k];
    }
    return FAQ_DEFAULT;
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _setMeta(sel, attr, val) {
    if (!val) return;
    var el = document.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  }

  function _updateSEO(artisan) {
    if (!artisan || !artisan.name) return;

    var name     = artisan.name || '';
    var category = artisan.category || artisan.specialty || '';
    var svcLabel = _svcLabel(category);
    var city     = artisan.city || '';
    var rating   = artisan.rating ? parseFloat(artisan.rating).toFixed(1) : null;
    var reviews  = artisan.review_count || artisan.reviewCount || 0;
    var id       = artisan.id || artisan._supabase_id || '';
    var photo    = artisan.photo_url || artisan.avatar || '';
    var avail    = artisan.availability || '';
    var isAvail  = avail === 'available' || avail === 'disponible';

    /* ── Title ── */
    var title;
    if (svcLabel !== 'Artisan' && city) {
      title = name + ' \u2014 ' + svcLabel + ' \u00e0 ' + city + ' | Fixeo';
    } else if (svcLabel !== 'Artisan') {
      title = name + ' \u2014 ' + svcLabel + ' v\u00e9rifi\u00e9 | Fixeo';
    } else {
      title = name + ' | Artisan v\u00e9rifi\u00e9 Fixeo';
    }
    document.title = title;

    /* ── Description ── */
    var desc;
    if (svcLabel !== 'Artisan' && city) {
      desc = svcLabel + ' \u00e0 ' + city + ' — ' + name + '.';
      if (rating && reviews >= 3) {
        desc += ' Note ' + rating + '/5 (' + reviews + ' avis clients).';
      }
      if (isAvail) desc += ' Disponible rapidement.';
      desc += ' Intervention rapide, profil v\u00e9rifi\u00e9 Fixeo.';
    } else {
      desc = 'Profil de ' + name + (city ? ' \u00e0 ' + city : '') + '. Artisan v\u00e9rifi\u00e9 Fixeo. Intervention rapide.';
    }
    _setMeta('meta[name="description"]', 'content', desc);

    /* ── Canonical ── */
    var canonicalUrl = 'https://fixeo.ma/artisan-profile.html' + (id ? '?id=' + encodeURIComponent(id) : '');
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', canonicalUrl);
    else {
      var lc = document.createElement('link');
      lc.rel = 'canonical'; lc.href = canonicalUrl;
      document.head.appendChild(lc);
    }

    /* ── OpenGraph ── */
    _setMeta('meta[property="og:title"]', 'content', title);
    _setMeta('meta[property="og:description"]', 'content', desc);
    _setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    if (photo) _setMeta('meta[property="og:image"]', 'content', photo);
    _setMeta('meta[property="og:type"]', 'content', 'profile');

    /* ── Twitter ── */
    _setMeta('meta[name="twitter:title"]', 'content', title);
    _setMeta('meta[name="twitter:description"]', 'content', desc);
    if (photo) _setMeta('meta[name="twitter:image"]', 'content', photo);

    /* ── JSON-LD ── */
    var ld = { '@context': 'https://schema.org', '@graph': [] };

    /* ProfessionalService */
    var svc = {
      '@type': 'ProfessionalService',
      'name': _esc(name),
      'url': canonicalUrl,
      'provider': { '@type': 'Organization', 'name': 'Fixeo', 'url': 'https://fixeo.ma/' }
    };
    if (category) svc.serviceType = _esc(svcLabel);
    if (city) svc.areaServed = { '@type': 'City', 'name': _esc(city) };
    if (photo) svc.image = photo;
    if (rating && reviews >= 3) {
      svc.aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': parseFloat(rating),
        'reviewCount': parseInt(reviews, 10),
        'bestRating': 5,
        'worstRating': 1
      };
    }
    ld['@graph'].push(svc);

    /* BreadcrumbList */
    var crumbs = [
      { '@type': 'ListItem', 'position': 1, 'name': 'Fixeo', 'item': 'https://fixeo.ma/' }
    ];
    if (svcLabel !== 'Artisan') {
      crumbs.push({ '@type': 'ListItem', 'position': 2, 'name': svcLabel, 'item': 'https://fixeo.ma/services.html' });
    }
    if (city) {
      crumbs.push({ '@type': 'ListItem', 'position': crumbs.length + 1, 'name': svcLabel + ' \u00e0 ' + _esc(city), 'item': canonicalUrl });
    }
    crumbs.push({ '@type': 'ListItem', 'position': crumbs.length + 1, 'name': _esc(name), 'item': canonicalUrl });
    ld['@graph'].push({ '@type': 'BreadcrumbList', 'itemListElement': crumbs });

    /* FAQPage */
    var faqs = _faqForService(category);
    if (faqs && faqs.length) {
      ld['@graph'].push({
        '@type': 'FAQPage',
        'mainEntity': faqs.map(function(f) {
          return {
            '@type': 'Question',
            'name': f.q,
            'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
          };
        })
      });
    }

    /* Inject/update JSON-LD element */
    var el = document.getElementById('fixeo-profile-jsonld');
    if (el) {
      el.textContent = JSON.stringify(ld);
    } else {
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'fixeo-profile-jsonld';
      s.textContent = JSON.stringify(ld);
      document.head.appendChild(s);
    }
  }

  /* Listen for V2 artisan resolved event */
  document.addEventListener('fixeo:artisan:resolved', function (e) {
    try {
      var artisan = e && e.detail && e.detail.artisan ? e.detail.artisan : null;
      if (artisan) _updateSEO(artisan);
    } catch (err) { /* silent */ }
  }, { once: true });

  /* Fallback: try from window._fixeoCurrentArtisan at idle */
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(function () {
      if (window._fixeoCurrentArtisan) _updateSEO(window._fixeoCurrentArtisan);
    }, { timeout: 5000 });
  }

  window.FixeoSEOProfile = { version: VERSION, updateSEO: _updateSEO };

}(window, document));
