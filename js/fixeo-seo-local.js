/*!
 * fixeo-seo-local.js — v seo2
 * Local SEO Content Differentiation + Internal Linking Mesh
 *
 * Reads the current page URL to extract service + city,
 * then injects:
 *   1. City-specific lead paragraph (replaces generic template text)
 *   2. Localized stat blocks (neighborhoods, demand context, pricing)
 *   3. Correct cross-service + cross-city internal link grid (4+ links)
 *   4. LocalBusiness JSON-LD per city
 *   5. BreadcrumbList JSON-LD
 *   6. Fixes seo-kicker to user-facing copy
 *   7. Removes dev-facing captions from hero card
 *
 * Runs once at DCL. No polling. No setInterval. ~12KB.
 *
 * DO NOT: modify reservation, auth/session, Supabase, homepage, artisan-profile.
 */
(function (window, document) {
  'use strict';
  var VERSION = 'seo2';

  /* ─────────────────────────────────────────────────────────
     CITY DATA: neighborhoods + demand context + pricing note
  ───────────────────────────────────────────────────────── */
  var CITIES = {
    casablanca: {
      label: 'Casablanca',
      neighborhoods: 'Maarif, Aïn Diab, Hay Hassani, Bourgogne, Sidi Bernoussi',
      context: 'Grande ville commerciale, forte densité résidentielle et industrielle.',
      demand_note: 'Forte demande en appartements et immeubles anciens.',
      pricing: 'Les tarifs varient selon l\'urgence, le quartier et la complexité.',
      lat: 33.5731, lng: -7.5898
    },
    rabat: {
      label: 'Rabat',
      neighborhoods: 'Agdal, Hay Riad, Souissi, Hassan, Les Orangers',
      context: 'Capitale administrative, quartiers résidentiels haut de gamme et zones institutionnelles.',
      demand_note: 'Demandes fréquentes dans les villas et appartements institutionnels.',
      pricing: 'Tarifs adaptés selon le secteur (Agdal, Hay Riad ou médina).',
      lat: 34.0209, lng: -6.8416
    },
    marrakech: {
      label: 'Marrakech',
      neighborhoods: 'Guéliz, Hivernage, Médina, Targa, Massira',
      context: 'Forte activité touristique et riad, avec un parc immobilier mixte.',
      demand_note: 'Riads, villas touristiques et résidences privées constituent l\'essentiel des demandes.',
      pricing: 'Les interventions dans les riads peuvent nécessiter des équipements spécifiques.',
      lat: 31.6295, lng: -7.9811
    },
    fes: {
      label: 'Fès',
      neighborhoods: 'Médina, Ville Nouvelle, Aïn Chkef, Jnane el-Ouard',
      context: 'Ville impériale avec un patrimoine architectural dense et un habitat ancien.',
      demand_note: 'L\'habitat ancien de la médina génère une forte demande en rénovation et dépannage.',
      pricing: 'Interventions dans la médina peuvent inclure des frais de déplacement spécifiques.',
      lat: 34.0181, lng: -5.0078
    },
    tanger: {
      label: 'Tanger',
      neighborhoods: 'Malabata, Ibéria, Marchan, Branes, Tanger Med',
      context: 'Ville portuaire en expansion rapide, forte urbanisation.',
      demand_note: 'Nouveaux immeubles et zones industrielles en développement continu.',
      pricing: 'Tarifs compétitifs, zones résidentielles et zones logistiques.',
      lat: 35.7595, lng: -5.8340
    },
    agadir: {
      label: 'Agadir',
      neighborhoods: 'Founty, Tilila, Sonaba, Talborjt, Dcheira',
      context: 'Station balnéaire modernisée avec habitat pavillonnaire et résidences touristiques.',
      demand_note: 'Résidences secondaires et hôtels génèrent des demandes récurrentes.',
      pricing: 'Tarifs influencés par la saisonnalité touristique et la zone.',
      lat: 30.4278, lng: -9.5981
    },
    meknes: {
      label: 'Meknès',
      neighborhoods: 'Ville Nouvelle, Médina, Hamria, Zitoune',
      context: 'Ville impériale à caractère résidentiel calme, parc immobilier diversifié.',
      demand_note: 'Demandes régulières dans l\'habitat collectif de la Ville Nouvelle.',
      pricing: 'Tarifs généralement inférieurs à Casablanca pour des interventions équivalentes.',
      lat: 33.8935, lng: -5.5473
    },
    oujda: {
      label: 'Oujda',
      neighborhoods: 'Centre-ville, Sidi Maâfa, Lazaret, Hay Qods',
      context: 'Carrefour commercial de l\'Oriental, forte densité résidentielle.',
      demand_note: 'Demandes concentrées dans les quartiers résidentiels centraux.',
      pricing: 'Marché local avec tarifs adaptés au coût de la vie régional.',
      lat: 34.6867, lng: -1.9114
    },
    kenitra: {
      label: 'Kénitra',
      neighborhoods: 'Centre-ville, Hay Salam, Quartier des Ministères, Biranzarane',
      context: 'Ville côtière industrielle et résidentielle, en forte croissance.',
      demand_note: 'Nouveaux programmes immobiliers et habitat collectif dense.',
      pricing: 'Tarifs proches de Rabat pour les zones résidentielles premium.',
      lat: 34.2610, lng: -6.5802
    },
    temara: {
      label: 'Témara',
      neighborhoods: 'Hay Nahda, Harhoura, Plage Sables d\'Or, Cité OLM',
      context: 'Zone résidentielle satellite de Rabat, forte densité pavillonnaire.',
      demand_note: 'Villas et maisons individuelles constituent l\'essentiel du parc.',
      pricing: 'Tarifs comparables à Rabat, déplacements depuis Rabat possibles.',
      lat: 33.9265, lng: -6.9071
    },
    sale: {
      label: 'Salé',
      neighborhoods: 'Tabriquet, Bettana, Hay Karima, Médina',
      context: 'Ville résidentielle jumelle de Rabat, forte population active.',
      demand_note: 'Demandes en habitat collectif et maisons individuelles.',
      pricing: 'Tarifs légèrement inférieurs à Rabat, accessibles.',
      lat: 34.0531, lng: -6.7985
    },
    mohammedia: {
      label: 'Mohammedia',
      neighborhoods: 'Centre-ville, Hay Salmia, Cité des Fleurs, Fdala',
      context: 'Zone industrielle et résidentielle entre Casablanca et Rabat.',
      demand_note: 'Industrie pétrolière et chimique génèrent des demandes en maintenance technique.',
      pricing: 'Tarifs standards, proximité avec Casablanca facilite le choix.',
      lat: 33.6841, lng: -7.3833
    },
    'el-jadida': {
      label: 'El Jadida',
      neighborhoods: 'Mazagan, Hay Hassani, Azemmour, Haouzia',
      context: 'Ville côtière à vocation résidentielle et touristique.',
      demand_note: 'Résidences secondaires et appartements de plage fréquents.',
      pricing: 'Tarifs modérés, saisonnalité touristique en été.',
      lat: 33.2549, lng: -8.5054
    },
    'beni-mellal': {
      label: 'Beni Mellal',
      neighborhoods: 'Centre-ville, Hay Essalam, Oulad Yacoub, Afourer',
      context: 'Capitale de la région Béni Mellal-Khénifra, ville universitaire.',
      demand_note: 'Résidences étudiantes et logements collectifs en forte croissance.',
      pricing: 'Tarifs compétitifs, bon rapport qualité-prix.',
      lat: 32.3372, lng: -6.3498
    },
    khouribga: {
      label: 'Khouribga',
      neighborhoods: 'Centre-ville, Hay Moulay Ismail, Dcheira',
      context: 'Ville minière phosphatière, habitat ouvrier et immeubles collectifs.',
      demand_note: 'Fort parc de logements collectifs liés aux industries OCP.',
      pricing: 'Tarifs modérés, bonne disponibilité d\'artisans locaux.',
      lat: 32.8811, lng: -6.9063
    },
    safi: {
      label: 'Safi',
      neighborhoods: 'Centre-ville, Hay El Andalous, Zone Industrielle',
      context: 'Port industriel important, habitat dense.',
      demand_note: 'Demandes dans le secteur industriel et résidentiel central.',
      pricing: 'Tarifs inférieurs aux grandes villes côtières.',
      lat: 32.2994, lng: -9.2372
    },
    nador: {
      label: 'Nador',
      neighborhoods: 'Centre-ville, Hay Nakhil, Marchica',
      context: 'Ville frontalière en développement, forte diaspora.',
      demand_note: 'Rénovations de maisons familiales fréquentes, saisonnalité estivale.',
      pricing: 'Tarifs régionaux, forte demande en saison.',
      lat: 35.1681, lng: -2.9335
    },
    taza: {
      label: 'Taza',
      neighborhoods: 'Ville Haute, Ville Basse, Andalous',
      context: 'Ville de transit stratégique, habitat dense et traditionnel.',
      demand_note: 'Maisons anciennes et immeubles collectifs.',
      pricing: 'Tarifs locaux compétitifs.',
      lat: 34.2133, lng: -4.0100
    },
    ouarzazate: {
      label: 'Ouarzazate',
      neighborhoods: 'Centre-ville, Hay El Hommar, Tabount',
      context: 'Ville désertique touristique, maisons en pisé et villas modernes.',
      demand_note: 'Climatisation et installations solaires en forte demande.',
      pricing: 'Artisans locaux disponibles, tarifs adaptés au secteur.',
      lat: 30.9335, lng: -6.8978
    },
    tetouan: {
      label: 'Tétouan',
      neighborhoods: 'Médina, Martil, Malalyine, Hay Jamaa',
      context: 'Ville de la région du Nord, architecture andalouse et habitat traditionnel.',
      demand_note: 'Médina dense génère une demande spécifique en rénovation.',
      pricing: 'Tarifs accessibles, forte disponibilité d\'artisans locaux.',
      lat: 35.5889, lng: -5.3626
    }
  };

  /* ─────────────────────────────────────────────────────────
     SERVICE DATA: differentiated content per service
  ───────────────────────────────────────────────────────── */
  var SERVICES = {
    plombier: {
      label: 'Plombier',
      icon: '🚿',
      lead_prefix: 'Besoin d\'un plombier',
      lead_suffix: 'Fixeo vous aide à trouver rapidement un artisan disponible pour une fuite d\'eau, un débouchage, une installation sanitaire ou une panne de chauffe-eau.',
      stat1_title: 'Interventions fréquentes',
      stat1_body: 'Fuite d\'eau, siphon bouché, robinetterie, chauffe-eau ou canalisation bouchée.',
      stat2_title: 'Sans déplacement inutile',
      stat2_body: 'L\'artisan intervient directement chez vous après confirmation de la demande.',
      stat3_title: 'Tarification honnête',
      stat3_body: 'Paiement après intervention, sans avance ni frais cachés.',
      related_services: ['electricien', 'serrurier'],
      context_text: 'En plomberie, les interventions les plus courantes concernent les fuites, le débouchage de canalisations et l\'entretien des chauffe-eau. Un diagnostic rapide évite souvent des dégâts plus importants.',
      urgency_text: 'Pour une fuite ou une coupure d\'eau urgente, signalez votre besoin sur Fixeo — nous vous mettons en contact avec un plombier disponible.'
    },
    electricien: {
      label: 'Électricien',
      icon: '⚡',
      lead_prefix: 'Besoin d\'un électricien',
      lead_suffix: 'Fixeo vous aide à trouver un électricien qualifié pour un dépannage électrique, une installation, une mise aux normes ou une panne.',
      stat1_title: 'Interventions courantes',
      stat1_body: 'Panne électrique, disjoncteur, court-circuit, installation de tableau, prise ou éclairage.',
      stat2_title: 'Artisan certifié',
      stat2_body: 'Les électriciens Fixeo sont qualifiés et interviennent en sécurité.',
      stat3_title: 'Devis transparent',
      stat3_body: 'Paiement après intervention, tarification claire sans surprise.',
      related_services: ['plombier', 'climatisation'],
      context_text: 'Les pannes électriques les plus fréquentes concernent les disjoncteurs, les courts-circuits et les problèmes de tableau. Une intervention rapide évite les risques.',
      urgency_text: 'Pour une panne électrique ou un court-circuit urgent, contactez un électricien via Fixeo — disponible dans votre ville.'
    },
    serrurier: {
      label: 'Serrurier',
      icon: '🔑',
      lead_prefix: 'Besoin d\'un serrurier',
      lead_suffix: 'Fixeo vous aide à trouver rapidement un serrurier pour une ouverture de porte, un remplacement de serrure ou une urgence.',
      stat1_title: 'Ouverture de porte',
      stat1_body: 'Porte claquée, clé perdue ou cassée, serrure bloquée — intervention rapide.',
      stat2_title: 'Sécurisation',
      stat2_body: 'Remplacement de serrures, pose de cylindres blindés, portes renforcées.',
      stat3_title: 'Urgence 24h',
      stat3_body: 'Besoin urgent ? Fixeo vous met en contact avec un serrurier disponible.',
      related_services: ['electricien', 'plombier'],
      context_text: 'Les demandes de serrurerie les plus fréquentes concernent les ouvertures de porte bloquée, les remplacements de serrures et la sécurisation après effraction.',
      urgency_text: 'Porte claquée ou serrure cassée ? Trouvez un serrurier disponible rapidement via Fixeo.'
    },
    climatisation: {
      label: 'Climatisation',
      icon: '❄️',
      lead_prefix: 'Besoin d\'un technicien en climatisation',
      lead_suffix: 'Fixeo vous aide à trouver un spécialiste pour l\'installation, l\'entretien, la recharge gaz ou la réparation de votre climatiseur.',
      stat1_title: 'Installation',
      stat1_body: 'Pose de split, climatiseur central, gainable ou multi-split.',
      stat2_title: 'Entretien & nettoyage',
      stat2_body: 'Nettoyage des filtres, recharge gaz, diagnostic annuel recommandé.',
      stat3_title: 'Dépannage rapide',
      stat3_body: 'Climatiseur en panne, mauvais refroidissement ou bruit anormal.',
      related_services: ['electricien', 'plombier'],
      context_text: 'L\'entretien régulier d\'un climatiseur améliore ses performances et prolonge sa durée de vie. Un nettoyage annuel des filtres est fortement conseillé.',
      urgency_text: 'Climatiseur en panne en plein été ? Trouvez un technicien disponible rapidement via Fixeo.'
    },
    peinture: {
      label: 'Peinture',
      icon: '🎨',
      lead_prefix: 'Besoin d\'un peintre',
      lead_suffix: 'Fixeo vous aide à trouver un artisan peintre pour vos travaux intérieurs, extérieurs, finitions ou remise en état.',
      stat1_title: 'Travaux courants',
      stat1_body: 'Peinture intérieure, revêtements, finitions et remise en état.',
      stat2_title: 'Artisan de confiance',
      stat2_body: 'Peintres vérifiés Fixeo, disponibles dans votre ville.',
      stat3_title: 'Devis rapide',
      stat3_body: 'Paiement après réalisation, tarification claire.',
      related_services: ['electricien', 'plombier'],
      context_text: 'Les travaux de peinture les plus demandés concernent la rénovation intérieure, les finitions et la remise en état après travaux.',
      urgency_text: 'Besoin d\'un peintre disponible rapidement ? Trouvez un artisan via Fixeo.'
    }
  };

  /* ─────────────────────────────────────────────────────────
     NEARBY CITIES: each city maps to nearest alternatives
  ───────────────────────────────────────────────────────── */
  var NEARBY = {
    casablanca: ['mohammedia', 'sale', 'rabat'],
    rabat: ['sale', 'temara', 'kenitra'],
    marrakech: ['agadir', 'casablanca', 'fes'],
    fes: ['meknes', 'taza', 'rabat'],
    tanger: ['tetouan', 'kenitra', 'rabat'],
    agadir: ['safi', 'ouarzazate', 'marrakech'],
    meknes: ['fes', 'rabat', 'khouribga'],
    oujda: ['nador', 'taza', 'fes'],
    kenitra: ['rabat', 'sale', 'temara'],
    temara: ['rabat', 'sale', 'kenitra'],
    sale: ['rabat', 'temara', 'kenitra'],
    mohammedia: ['casablanca', 'sale', 'rabat'],
    'el-jadida': ['casablanca', 'safi', 'mohammedia'],
    'beni-mellal': ['khouribga', 'marrakech', 'fes'],
    khouribga: ['beni-mellal', 'casablanca', 'meknes'],
    safi: ['el-jadida', 'marrakech', 'agadir'],
    nador: ['oujda', 'taza', 'fes'],
    taza: ['fes', 'oujda', 'meknes'],
    ouarzazate: ['agadir', 'marrakech', 'safi'],
    tetouan: ['tanger', 'kenitra', 'rabat']
  };

  /* ─────────────────────────────────────────────────────────
     PARSE: Extract service + city from URL
  ───────────────────────────────────────────────────────── */
  function parsePageContext() {
    var path = (window.location.pathname || '').split('/').pop().replace('.html', '');
    if (!path) return null;
    var parts = path.split('-');
    if (parts.length < 2) return null;

    var svc = parts[0];
    if (!SERVICES[svc]) return null;

    var citySlug = parts.slice(1).join('-');
    var city = CITIES[citySlug];
    if (!city) return null;

    return { service: svc, citySlug: citySlug, city: city, svcData: SERVICES[svc] };
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Update lead paragraph
  ───────────────────────────────────────────────────────── */
  function injectLead(ctx) {
    var lead = document.querySelector('.seo-lead');
    if (!lead) return;
    var svc = ctx.svcData;
    var city = ctx.city;
    lead.textContent =
      svc.lead_prefix + ' à ' + city.label + ' ? ' + svc.lead_suffix +
      ' ' + city.demand_note +
      ' ' + city.pricing;
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Update seo-kicker (remove dev-facing text)
  ───────────────────────────────────────────────────────── */
  function injectKicker(ctx) {
    var kicker = document.querySelector('.seo-kicker');
    if (!kicker) return;
    kicker.textContent = ctx.svcData.icon + ' Service disponible à ' + ctx.city.label;
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Update stat blocks with local context
  ───────────────────────────────────────────────────────── */
  function injectStats(ctx) {
    var stats = document.querySelectorAll('.seo-hero-stats .seo-stat');
    if (stats.length < 3) return;

    var svc = ctx.svcData;
    var city = ctx.city;

    stats[0].querySelector('strong').textContent = svc.stat1_title;
    stats[0].querySelector('span').textContent = svc.stat1_body;

    stats[1].querySelector('strong').textContent = '📍 ' + city.label;
    stats[1].querySelector('span').textContent = city.neighborhoods;

    stats[2].querySelector('strong').textContent = svc.stat3_title;
    stats[2].querySelector('span').textContent = svc.stat3_body;
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Remove dev-facing hero card caption
  ───────────────────────────────────────────────────────── */
  function fixHeroCaption(ctx) {
    var caption = document.querySelector('.seo-hero-card .caption');
    if (!caption) return;
    caption.textContent = ctx.svcData.urgency_text;
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Fix the "Pourquoi Fixeo" section with service context
  ───────────────────────────────────────────────────────── */
  function injectBenefits(ctx) {
    var cards = document.querySelectorAll('.seo-info-card');
    if (cards.length < 3) return;
    var svc = ctx.svcData;
    var city = ctx.city;

    // Card 1: local service context
    var h3_1 = cards[0].querySelector('h3');
    var p_1 = cards[0].querySelector('p');
    if (h3_1) h3_1.textContent = svc.label + ' à ' + city.label;
    if (p_1) p_1.textContent = svc.context_text;

    // Card 2: local neighborhoods
    var h3_2 = cards[1].querySelector('h3');
    var p_2 = cards[1].querySelector('p');
    if (h3_2) h3_2.textContent = 'Zones d\'intervention';
    if (p_2) p_2.textContent = 'Interventions à ' + city.label + ' : ' + city.neighborhoods + '. ' + city.context;

    // Card 3: marketplace value
    var h3_3 = cards[2].querySelector('h3');
    var p_3 = cards[2].querySelector('p');
    if (h3_3) h3_3.textContent = 'Paiement après intervention';
    if (p_3) p_3.textContent = city.pricing + ' Fixeo ne prélève aucun frais sur les clients.';
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Rebuild internal linking section with correct links
  ───────────────────────────────────────────────────────── */
  function injectLinks(ctx) {
    var linksGrid = document.querySelector('.seo-links-grid');
    if (!linksGrid) return;

    var svc = ctx.service;
    var citySlug = ctx.citySlug;
    var city = ctx.city;
    var svcData = ctx.svcData;
    var nearby = NEARBY[citySlug] || [];
    var relatedSvcs = svcData.related_services || [];

    var links = [];

    // Same city, other services (2 links)
    relatedSvcs.slice(0, 2).forEach(function (rs) {
      var rsd = SERVICES[rs];
      if (!rsd) return;
      links.push({
        href: rs + '-' + citySlug + '.html',
        city: city.label,
        title: rsd.label + ' à ' + city.label,
        desc: rsd.context_text.slice(0, 80) + '…'
      });
    });

    // Same service, nearby cities (2 links)
    nearby.slice(0, 2).forEach(function (nc) {
      var ncd = CITIES[nc];
      if (!ncd) return;
      links.push({
        href: svc + '-' + nc + '.html',
        city: ncd.label,
        title: svcData.label + ' à ' + ncd.label,
        desc: ncd.demand_note
      });
    });

    // Render
    linksGrid.innerHTML = links.map(function (l) {
      return '<a class="service-link seo-link-card" href="' + l.href + '">' +
        '<span>' + l.city + '</span>' +
        '<h3>' + l.title + '</h3>' +
        '<p>' + l.desc + '</p>' +
        '</a>';
    }).join('');
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: LocalBusiness + BreadcrumbList JSON-LD
  ───────────────────────────────────────────────────────── */
  function injectSchema(ctx) {
    var city = ctx.city;
    var svc = ctx.svcData;
    var citySlug = ctx.citySlug;
    var serviceName = ctx.service;
    var pageUrl = 'https://fixeo.ma/' + serviceName + '-' + citySlug + '.html';

    var ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Service',
          'name': svc.label + ' à ' + city.label,
          'url': pageUrl,
          'provider': {
            '@type': 'Organization',
            'name': 'Fixeo',
            'url': 'https://fixeo.ma/'
          },
          'areaServed': {
            '@type': 'City',
            'name': city.label
          },
          'serviceType': svc.label,
          'description': svc.lead_prefix + ' à ' + city.label + ' ? ' + svc.lead_suffix
        },
        {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Fixeo', 'item': 'https://fixeo.ma/' },
            { '@type': 'ListItem', 'position': 2, 'name': svc.label, 'item': 'https://fixeo.ma/services.html' },
            { '@type': 'ListItem', 'position': 3, 'name': svc.label + ' à ' + city.label, 'item': pageUrl }
          ]
        }
      ]
    };

    // Update existing JSON-LD or inject new
    var existing = document.querySelector('script[type="application/ld+json"]:not(#fixeo-profile-jsonld)');
    if (existing) {
      existing.textContent = JSON.stringify(ld);
    } else {
      var el = document.createElement('script');
      el.type = 'application/ld+json';
      el.textContent = JSON.stringify(ld);
      document.head.appendChild(el);
    }
  }

  /* ─────────────────────────────────────────────────────────
     MAIN: Run all injections
  ───────────────────────────────────────────────────────── */
  function run() {
    if (document.body.getAttribute('data-fixeo-seo-static') !== 'true') return;
    var ctx = parsePageContext();
    if (!ctx) return;

    try { injectLead(ctx); } catch(e) {}
    try { injectKicker(ctx); } catch(e) {}
    try { injectStats(ctx); } catch(e) {}
    try { fixHeroCaption(ctx); } catch(e) {}
    try { injectBenefits(ctx); } catch(e) {}
    try { injectLinks(ctx); } catch(e) {}
    try { injectSchema(ctx); } catch(e) {}

    document.body.setAttribute('data-seo-local', 'v' + VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.FixeoSEOLocal = { version: VERSION };

}(window, document));
