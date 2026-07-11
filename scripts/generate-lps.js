#!/usr/bin/env node
/**
 * FIXEO LP Generator — generate-lps.js
 * Version: lpgen-v1a — 2026-06-12
 * ─────────────────────────────────────────────────────────
 * Programmatic local page generator.
 * Reads CITY_DATA + SERVICE_DATA below,
 * stamps a hardcoded base template with city/service specific content,
 * and writes unique .html files to /fixeo-clean/ root.
 *
 * Content stamped INTO HTML source (not JS-injected):
 *   - unique city intro paragraph
 *   - neighborhood mentions
 *   - pricing range section
 *   - local demand patterns
 *   - emergency section
 *   - FAQ (3 questions, city+service specific)
 *   - unique JSON-LD Service schema
 *
 * Usage:
 *   node scripts/generate-lps.js                          # all services × all cities
 *   node scripts/generate-lps.js --service=plombier       # one service, all cities
 *   node scripts/generate-lps.js --city=fes               # all services, one city
 *   node scripts/generate-lps.js --dry-run                # preview, no files written
 *
 * Flags:
 *   --force     overwrite existing files (default: skip if exists)
 *   --dry-run   print filenames + word counts, no writes
 *   --clean-url write canonical as /plombier/fes (requires clean URL routing)
 * ─────────────────────────────────────────────────────────
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const args   = process.argv.slice(2);
const DRY    = args.includes('--dry-run');
const FORCE  = args.includes('--force');
const CLEAN  = args.includes('--clean-url');
const SVCARG = (args.find(a => a.startsWith('--service=')) || '').split('=')[1];
const CTYARG = (args.find(a => a.startsWith('--city='))    || '').split('=')[1];

/* ═══════════════════════════════════════════════════════════
   CITY DATA
══════════════════════════════════════════════════════════ */
const CITIES = {
  casablanca: {
    label: 'Casablanca', label_de: 'de Casablanca',
    neighborhoods: 'Maarif, Aïn Diab, Hay Hassani, Bourgogne, Sidi Bernoussi, Anfa',
    context: 'Grande métropole commerciale du Maroc, Casablanca concentre une forte densité résidentielle, de nombreux immeubles anciens et un tissu industriel important.',
    demand: 'La forte densité urbaine génère une demande soutenue en plomberie, électricité et serrurerie, notamment dans les immeubles des années 1970–1990.',
    pricing_low: '150', pricing_high: '600',
    pricing_note: 'Les tarifs varient selon l\'urgence (nuit, week-end), le quartier (Maarif, Aïn Diab) et la complexité de l\'intervention.',
    emergency: 'Pour une urgence à Casablanca — fuite d\'eau, coupure électrique ou porte bloquée — Fixeo vous met en contact avec un artisan disponible dans votre arrondissement.',
    population: '3,7 millions',
    lat: 33.5731, lng: -7.5898
  },
  rabat: {
    label: 'Rabat', label_de: 'de Rabat',
    neighborhoods: 'Agdal, Hay Riad, Souissi, Hassan, Les Orangers, Riyad',
    context: 'Capitale administrative du Maroc, Rabat abrite de nombreuses villas, appartements institutionnels et résidences diplomatiques.',
    demand: 'Les demandes sont fréquentes dans les villas résidentielles d\'Agdal et Souissi, et dans les immeubles collectifs de Hay Riad.',
    pricing_low: '180', pricing_high: '700',
    pricing_note: 'Tarifs adaptés selon le secteur — Agdal et Hay Riad sont plus élevés que la médina ou Yacoub El Mansour.',
    emergency: 'Pour une urgence à Rabat — fuite, panne électrique ou serrure bloquée — Fixeo vous met en contact immédiatement avec un artisan disponible dans votre quartier.',
    population: '580 000',
    lat: 34.0209, lng: -6.8416
  },
  marrakech: {
    label: 'Marrakech', label_de: 'de Marrakech',
    neighborhoods: 'Guéliz, Hivernage, Médina, Targa, Massira, Hay Mohammadi',
    context: 'Ville touristique majeure, Marrakech combine un patrimoine de riads, des villas touristiques et des résidences privées modernes dans des quartiers comme Guéliz et Hivernage.',
    demand: 'Les riads de la médina et les villas de l\'Hivernage génèrent une demande spécifique en plomberie ancienne et installation climatisation.',
    pricing_low: '160', pricing_high: '650',
    pricing_note: 'Interventions dans les riads peuvent inclure des contraintes d\'accès spécifiques à la médina. Tarifs saisonniers en haute saison touristique.',
    emergency: 'Urgence à Marrakech ? Fixeo contacte un artisan disponible dans votre zone — médina, Guéliz ou Hivernage — rapidement.',
    population: '1 million',
    lat: 31.6295, lng: -7.9811
  },
  fes: {
    label: 'Fès', label_de: 'de Fès',
    neighborhoods: 'Médina, Ville Nouvelle, Aïn Chkef, Jnane el-Ouard, Narjiss',
    context: 'Ville impériale classée au patrimoine mondial, Fès possède un patrimoine architectural dense avec un habitat ancien nécessitant des interventions spécialisées.',
    demand: 'L\'habitat ancien de la médina génère une forte demande en réparations de plomberie, serrurerie traditionnelle et mise aux normes électrique.',
    pricing_low: '130', pricing_high: '500',
    pricing_note: 'Les interventions dans la médina de Fès peuvent inclure des frais de déplacement spécifiques liés aux ruelles piétonnes inaccessibles en véhicule.',
    emergency: 'Urgence à Fès — fuite, panne ou porte bloquée ? Fixeo identifie un artisan disponible dans votre secteur de la ville.',
    population: '1,2 million',
    lat: 34.0181, lng: -5.0078
  },
  tanger: {
    label: 'Tanger', label_de: 'de Tanger',
    neighborhoods: 'Malabata, Ibéria, Marchan, Branes, Tanger Med, Médina',
    context: 'Ville portuaire en expansion rapide, Tanger concentre de nombreux nouveaux immeubles résidentiels et zones logistiques en développement.',
    demand: 'La forte urbanisation de Tanger génère une demande croissante en installations électriques, plomberie de construction neuve et serrurerie sécurisée.',
    pricing_low: '150', pricing_high: '550',
    pricing_note: 'Tarifs compétitifs dans les zones résidentielles. Zone de Tanger Med peut nécessiter des déplacements spécifiques.',
    emergency: 'Pour une urgence à Tanger — fuite, court-circuit ou porte bloquée — Fixeo vous met en relation avec un artisan disponible rapidement.',
    population: '1 million',
    lat: 35.7595, lng: -5.8340
  },
  agadir: {
    label: 'Agadir', label_de: 'd\'Agadir',
    neighborhoods: 'Founty, Tilila, Sonaba, Talborjt, Dcheira, Hay Mohammadi',
    context: 'Station balnéaire modernisée après le séisme de 1960, Agadir dispose d\'un parc immobilier pavillonnaire récent et de nombreuses résidences touristiques.',
    demand: 'Les résidences secondaires, hôtels et appartements de vacances génèrent une demande récurrente en entretien climatisation, plomberie et serrurerie.',
    pricing_low: '140', pricing_high: '550',
    pricing_note: 'Tarifs influencés par la saisonnalité touristique — légère hausse en été (juillet-août) et Nouvel An.',
    emergency: 'Urgence à Agadir ? Fixeo vous met en contact avec un artisan disponible dans votre quartier ou résidence.',
    population: '600 000',
    lat: 30.4278, lng: -9.5981
  },
  meknes: {
    label: 'Meknès', label_de: 'de Meknès',
    neighborhoods: 'Ville Nouvelle, Médina, Hamria, Zitoune, Bassatine',
    context: 'Ville impériale à caractère résidentiel calme, Meknès dispose d\'un parc immobilier diversifié mêlant habitat collectif de la Ville Nouvelle et maisons de la médina.',
    demand: 'Demandes régulières en plomberie (fuites, chauffe-eau) et électricité dans l\'habitat collectif de la Ville Nouvelle.',
    pricing_low: '120', pricing_high: '480',
    pricing_note: 'Tarifs généralement inférieurs à Casablanca pour des interventions équivalentes — bon rapport qualité-prix.',
    emergency: 'Pour une urgence à Meknès, Fixeo identifie un artisan disponible dans votre quartier rapidement.',
    population: '600 000',
    lat: 33.8935, lng: -5.5473
  },
  oujda: {
    label: 'Oujda', label_de: 'd\'Oujda',
    neighborhoods: 'Centre-ville, Sidi Maâfa, Lazaret, Hay Qods, Isly',
    context: 'Carrefour commercial de la région de l\'Oriental, Oujda dispose d\'une forte densité résidentielle dans son centre-ville.',
    demand: 'Demandes concentrées en plomberie et électricité dans les quartiers résidentiels centraux et immeubles collectifs.',
    pricing_low: '110', pricing_high: '450',
    pricing_note: 'Marché local avec tarifs adaptés au coût de la vie régional — parmi les plus accessibles du Maroc.',
    emergency: 'Urgence à Oujda ? Fixeo contacte un artisan disponible dans votre zone rapidement.',
    population: '500 000',
    lat: 34.6867, lng: -1.9114
  },
  kenitra: {
    label: 'Kénitra', label_de: 'de Kénitra',
    neighborhoods: 'Centre-ville, Hay Salam, Quartier des Ministères, Biranzarane, Saknia',
    context: 'Ville côtière industrielle en forte croissance, Kénitra voit de nombreux nouveaux programmes immobiliers s\'y développer.',
    demand: 'Nouveaux programmes résidentiels et habitat collectif dense — forte demande en plomberie de construction et installation électrique.',
    pricing_low: '150', pricing_high: '550',
    pricing_note: 'Tarifs proches de Rabat pour les zones résidentielles premium. Zone industrielle peut nécessiter des devis spécifiques.',
    emergency: 'Pour une urgence à Kénitra, Fixeo vous met en relation avec un artisan disponible dans votre secteur.',
    population: '400 000',
    lat: 34.2610, lng: -6.5802
  },
  temara: {
    label: 'Témara', label_de: 'de Témara',
    neighborhoods: 'Hay Nahda, Harhoura, Plage Sables d\'Or, Cité OLM, Ain Atiq',
    context: 'Zone résidentielle satellite de Rabat, Témara concentre principalement des villas et maisons individuelles, avec quelques résidences balnéaires à Harhoura.',
    demand: 'Villas et maisons individuelles constituent l\'essentiel du parc — forte demande en plomberie, serrurerie et climatisation.',
    pricing_low: '150', pricing_high: '580',
    pricing_note: 'Tarifs comparables à Rabat. Artisans travaillant sur l\'axe Rabat-Témara disponibles rapidement.',
    emergency: 'Urgence à Témara ? Fixeo contacte un artisan de la zone Rabat-Témara disponible immédiatement.',
    population: '300 000',
    lat: 33.9265, lng: -6.9071
  },
  sale: {
    label: 'Salé', label_de: 'de Salé',
    neighborhoods: 'Tabriquet, Bettana, Hay Karima, Médina, Hay Inbiaat',
    context: 'Ville résidentielle jumelle de Rabat, Salé dispose d\'une population active importante et d\'un parc immobilier mixte.',
    demand: 'Forte demande en plomberie et électricité dans l\'habitat collectif et les maisons individuelles de Tabriquet et Hay Karima.',
    pricing_low: '140', pricing_high: '520',
    pricing_note: 'Tarifs légèrement inférieurs à Rabat, très accessibles pour les travaux courants.',
    emergency: 'Pour une urgence à Salé, Fixeo identifie un artisan disponible dans votre quartier rapidement.',
    population: '900 000',
    lat: 34.0531, lng: -6.7985
  },
  mohammedia: {
    label: 'Mohammedia', label_de: 'de Mohammedia',
    neighborhoods: 'Centre-ville, Hay Salmia, Cité des Fleurs, Fdala, Oulad Haddou',
    context: 'Zone industrielle et résidentielle entre Casablanca et Rabat, Mohammedia mêle habitat résidentiel et infrastructures industrielles pétrolières et chimiques.',
    demand: 'Demandes en maintenance technique liées aux industries de la zone, et plomberie/électricité standard dans les résidences.',
    pricing_low: '140', pricing_high: '520',
    pricing_note: 'Tarifs standards, proximité avec Casablanca facilite la disponibilité des artisans.',
    emergency: 'Urgence à Mohammedia ? Fixeo vous met en relation avec un artisan disponible sur l\'axe Casablanca-Mohammedia.',
    population: '220 000',
    lat: 33.6841, lng: -7.3833
  },
  'el-jadida': {
    label: 'El Jadida', label_de: 'd\'El Jadida',
    neighborhoods: 'Mazagan, Hay Hassani, Azemmour, Haouzia, Hay Essalam',
    context: 'Ville côtière à vocation résidentielle et touristique, El Jadida dispose d\'un parc immobilier varié avec de nombreuses résidences balnéaires.',
    demand: 'Résidences secondaires et appartements de plage fréquents — demande saisonnière en plomberie, électricité et serrurerie.',
    pricing_low: '130', pricing_high: '500',
    pricing_note: 'Tarifs modérés. Saisonnalité touristique en été peut créer des délais supplémentaires.',
    emergency: 'Pour une urgence à El Jadida, Fixeo contacte un artisan disponible dans votre zone.',
    population: '200 000',
    lat: 33.2549, lng: -8.5054
  },
  'beni-mellal': {
    label: 'Béni Mellal', label_de: 'de Béni Mellal',
    neighborhoods: 'Centre-ville, Hay Essalam, Oulad Yacoub, Afourer, Hay Al Massira',
    context: 'Capitale de la région Béni Mellal-Khénifra, ville universitaire en croissance avec un fort parc de logements collectifs.',
    demand: 'Résidences étudiantes et logements collectifs en forte croissance — demande soutenue en plomberie et électricité.',
    pricing_low: '110', pricing_high: '450',
    pricing_note: 'Tarifs compétitifs, bon rapport qualité-prix. Disponibilité d\'artisans locaux importante.',
    emergency: 'Urgence à Béni Mellal ? Fixeo vous met en relation avec un artisan disponible rapidement.',
    population: '200 000',
    lat: 32.3372, lng: -6.3498
  },
  khouribga: {
    label: 'Khouribga', label_de: 'de Khouribga',
    neighborhoods: 'Centre-ville, Hay Moulay Ismail, Dcheira, Oued Zem',
    context: 'Ville minière phosphatière majeure, Khouribga dispose d\'un parc important de logements collectifs et résidences ouvrières liés aux industries OCP.',
    demand: 'Fort parc de logements collectifs liés aux industries OCP — demande régulière en maintenance plomberie et électricité.',
    pricing_low: '110', pricing_high: '440',
    pricing_note: 'Tarifs modérés, bonne disponibilité d\'artisans locaux expérimentés.',
    emergency: 'Pour une urgence à Khouribga, Fixeo contacte un artisan de la zone immédiatement.',
    population: '180 000',
    lat: 32.8811, lng: -6.9063
  },
  safi: {
    label: 'Safi', label_de: 'de Safi',
    neighborhoods: 'Centre-ville, Hay El Andalous, Zone Industrielle, Ryad',
    context: 'Port industriel important sur l\'Atlantique, Safi combine habitat dense et zones industrielles actives.',
    demand: 'Demandes mixtes dans le secteur industriel et résidentiel central — plomberie, électricité et climatisation.',
    pricing_low: '120', pricing_high: '480',
    pricing_note: 'Tarifs inférieurs aux grandes villes côtières — bonne disponibilité locale.',
    emergency: 'Urgence à Safi ? Fixeo vous connecte à un artisan disponible dans votre quartier.',
    population: '320 000',
    lat: 32.2994, lng: -9.2372
  },
  nador: {
    label: 'Nador', label_de: 'de Nador',
    neighborhoods: 'Centre-ville, Hay Nakhil, Marchica, Beni Enzar',
    context: 'Ville frontalière en développement, Nador bénéficie d\'une forte diaspora marocaine et d\'importants travaux de rénovation en période estivale.',
    demand: 'Rénovations de maisons familiales fréquentes lors des retours de diaspora — forte saisonnalité estivale.',
    pricing_low: '120', pricing_high: '480',
    pricing_note: 'Tarifs régionaux compétitifs. Forte demande en saison estivale — prévoir à l\'avance.',
    emergency: 'Pour une urgence à Nador, Fixeo contacte un artisan disponible dans votre zone.',
    population: '200 000',
    lat: 35.1681, lng: -2.9335
  },
  taza: {
    label: 'Taza', label_de: 'de Taza',
    neighborhoods: 'Ville Haute, Ville Basse, Andalous, Hay Salam',
    context: 'Ville de transit stratégique entre le Rif et le Moyen Atlas, Taza dispose d\'un habitat dense et traditionnel.',
    demand: 'Maisons anciennes et immeubles collectifs — forte demande en réparations plomberie et électricité.',
    pricing_low: '100', pricing_high: '430',
    pricing_note: 'Tarifs locaux parmi les plus compétitifs du Maroc.',
    emergency: 'Urgence à Taza ? Fixeo identifie un artisan disponible rapidement.',
    population: '150 000',
    lat: 34.2133, lng: -4.0100
  },
  ouarzazate: {
    label: 'Ouarzazate', label_de: 'd\'Ouarzazate',
    neighborhoods: 'Centre-ville, Hay El Hommar, Tabount, Skoura',
    context: 'Ville désertique et touristique, Ouarzazate combine des maisons traditionnelles en pisé, des villas modernes et des infrastructures hôtelières.',
    demand: 'Climatisation et installations solaires en forte demande — chaleur extrême en été nécessite des systèmes performants.',
    pricing_low: '130', pricing_high: '500',
    pricing_note: 'Artisans locaux disponibles. Certains équipements spécifiques peuvent nécessiter une commande préalable.',
    emergency: 'Pour une urgence à Ouarzazate — panne climatisation, fuite ou électricité — Fixeo vous met en relation rapidement.',
    population: '100 000',
    lat: 30.9335, lng: -6.8978
  },
  tetouan: {
    label: 'Tétouan', label_de: 'de Tétouan',
    neighborhoods: 'Médina, Martil, Malalyine, Hay Jamaa, Azla',
    context: 'Ville du nord à l\'architecture andalouse distinctive, Tétouan allie une médina classée UNESCO et des quartiers résidentiels modernes.',
    demand: 'La médina dense génère une demande spécifique en rénovation, plomberie traditionnelle et remise aux normes électrique.',
    pricing_low: '120', pricing_high: '480',
    pricing_note: 'Tarifs accessibles, forte disponibilité d\'artisans locaux expérimentés.',
    emergency: 'Urgence à Tétouan ? Fixeo contacte un artisan disponible dans votre quartier — médina ou ville moderne.',
    population: '400 000',
    lat: 35.5889, lng: -5.3626
  }
};

/* ═══════════════════════════════════════════════════════════
   SERVICE DATA
══════════════════════════════════════════════════════════ */
const SERVICES = {
  plombier: {
    label: 'Plombier', label_adj: 'plomberie',
    icon: '🚿', service_schema: 'Plumbing',
    sub_services: ['Dépannage fuite d\'eau', 'Débouchage canalisation', 'Installation sanitaire', 'Entretien chauffe-eau', 'Robinetterie'],
    h1_prefix: 'Plombier à',
    title_suffix: 'Dépannage, fuite et urgence | Fixeo',
    meta_desc: (city) => `Trouvez rapidement un plombier à ${city} avec Fixeo. Fuite d'eau, débouchage, chauffe-eau, robinetterie, installation sanitaire et intervention urgente.`,
    intro_template: (c) => `Votre recherche d'un plombier à ${c.label} s'arrête ici. Fixeo vous met en relation avec des artisans locaux qualifiés pour tout besoin en plomberie : fuite d'eau, débouchage de canalisation, installation sanitaire, remplacement de chauffe-eau ou dépannage d'urgence. Avec ${c.population ? c.population + ' d\'habitants, ' : ''}${c.label} concentre un parc immobilier important — ${c.demand}`,
    faq: (c) => [
      { q: `Quel est le tarif d'un plombier à ${c.label} ?`, a: `Le coût d'une intervention plomberie à ${c.label} varie entre ${c.pricing_low} et ${c.pricing_high} DH selon la nature du problème (fuite, débouchage, installation) et le moment de l'intervention (urgence de nuit ou week-end). ${c.pricing_note}` },
      { q: `Comment trouver un plombier disponible rapidement à ${c.label} ?`, a: `Via Fixeo, signalez votre besoin en quelques secondes. Notre système identifie les plombiers disponibles à ${c.label} et vous met en relation directe. Pour les urgences — fuite visible, coupure d'eau — la mise en relation est prioritaire.` },
      { q: `Un plombier Fixeo intervient-il dans toute la ville ${c.label_de} ?`, a: `Oui. Les artisans Fixeo couvrent l'ensemble ${c.label_de}, notamment les quartiers de ${c.neighborhoods}. En cas d'urgence, le plombier le plus proche est contacté en priorité.` }
    ],
    urgency_services: ['Fuite d\'eau visible', 'Canalisation bouchée', 'Chauffe-eau en panne', 'Inondation sous évier', 'Coupure d\'eau générale'],
    related_services: ['electricien', 'serrurier'],
    pricing_tiers: [
      { label: 'Dépannage simple (fuite robinet)', range: '150–300 DH' },
      { label: 'Débouchage canalisation', range: '200–450 DH' },
      { label: 'Remplacement chauffe-eau', range: '350–800 DH' },
      { label: 'Installation sanitaire complète', range: '500–1 500 DH' }
    ]
  },
  electricien: {
    label: 'Électricien', label_adj: 'électricité',
    icon: '⚡', service_schema: 'Electrical',
    sub_services: ['Dépannage panne électrique', 'Remplacement tableau électrique', 'Installation prises et éclairage', 'Mise aux normes', 'Court-circuit'],
    h1_prefix: 'Électricien à',
    title_suffix: 'Dépannage, installation et urgence | Fixeo',
    meta_desc: (city) => `Trouvez un électricien à ${city} avec Fixeo. Panne électrique, disjoncteur, installation, mise aux normes et intervention urgente.`,
    intro_template: (c) => `Trouver un électricien qualifié à ${c.label} en cas de panne ou pour des travaux d'installation est maintenant simple avec Fixeo. Notre réseau d'artisans locaux couvre ${c.label} et ses quartiers — ${c.neighborhoods}. ${c.demand} Les pannes électriques les plus fréquentes (disjoncteur déclenché, court-circuit, tableau défaillant) nécessitent une intervention rapide pour éviter tout risque.`,
    faq: (c) => [
      { q: `Quel est le tarif d'un électricien à ${c.label} ?`, a: `Le tarif d'un électricien à ${c.label} varie entre ${c.pricing_low} et ${c.pricing_high} DH selon la nature des travaux (dépannage, installation, mise aux normes). ${c.pricing_note}` },
      { q: `Quelle est la durée d'intervention d'un électricien à ${c.label} ?`, a: `Pour un dépannage courant (disjoncteur, prise défaillante), l'intervention dure généralement 30 minutes à 1 heure. Une installation complète ou mise aux normes peut prendre une demi-journée. Via Fixeo, l'artisan vous précise la durée lors de la prise de contact.` },
      { q: `Est-il possible d'appeler un électricien en urgence à ${c.label} ?`, a: `Oui. Via Fixeo, les demandes urgentes sont signalées comme prioritaires. Un électricien disponible dans votre secteur ${c.label_de} est contacté immédiatement. ${c.emergency}` }
    ],
    urgency_services: ['Panne électrique totale', 'Disjoncteur déclenché', 'Court-circuit', 'Câble sectionné', 'Prise qui brûle'],
    related_services: ['plombier', 'climatisation'],
    pricing_tiers: [
      { label: 'Dépannage simple (disjoncteur, prise)', range: '150–350 DH' },
      { label: 'Remplacement de tableau électrique', range: '400–900 DH' },
      { label: 'Installation éclairage + prises (pièce)', range: '300–700 DH' },
      { label: 'Mise aux normes complète', range: '800–2 500 DH' }
    ]
  },
  serrurier: {
    label: 'Serrurier', label_adj: 'serrurerie',
    icon: '🔑', service_schema: 'LocksmithService',
    sub_services: ['Ouverture de porte claquée', 'Remplacement de serrure', 'Pose cylindre blindé', 'Sécurisation après effraction', 'Porte blindée'],
    h1_prefix: 'Serrurier à',
    title_suffix: 'Urgence, ouverture de porte | Fixeo',
    meta_desc: (city) => `Besoin d'un serrurier à ${city} ? Fixeo vous met en contact rapidement pour ouverture de porte, remplacement de serrure ou urgence.`,
    intro_template: (c) => `Porte claquée, serrure bloquée ou effraction — un serrurier disponible à ${c.label} est accessible via Fixeo en quelques secondes. Notre réseau couvre l'ensemble des quartiers ${c.label_de} — ${c.neighborhoods}. ${c.context} Les urgences serrurerie (porte impossible à ouvrir, clé cassée dans la serrure) sont traitées en priorité.`,
    faq: (c) => [
      { q: `Combien coûte un serrurier en urgence à ${c.label} ?`, a: `Le tarif d'un serrurier à ${c.label} pour une ouverture de porte d'urgence varie entre ${c.pricing_low} et ${Math.round(parseInt(c.pricing_high) * 1.2)} DH selon le type de serrure et l'heure d'intervention. ${c.pricing_note}` },
      { q: `Un serrurier Fixeo peut-il intervenir la nuit à ${c.label} ?`, a: `Les demandes urgentes sont signalées comme prioritaires sur Fixeo. Un serrurier disponible à ${c.label} est contacté immédiatement, y compris en soirée. Les tarifs d'intervention de nuit ou le week-end peuvent être légèrement plus élevés.` },
      { q: `Comment éviter d'appeler un serrurier trop cher à ${c.label} ?`, a: `Avec Fixeo, les artisans affichent leurs tarifs indicatifs et sont évalués par les clients précédents. Évitez les prestataires trouvés dans des annuaires non vérifiés — préférez les artisans Fixeo dont les profils sont vérifiés.` }
    ],
    urgency_services: ['Porte claquée', 'Clé perdue ou cassée', 'Serrure bloquée', 'Sécurisation après effraction', 'Cylindre changement urgent'],
    related_services: ['electricien', 'plombier'],
    pricing_tiers: [
      { label: 'Ouverture porte simple (claquée)', range: '200–500 DH' },
      { label: 'Remplacement cylindre serrure', range: '250–600 DH' },
      { label: 'Pose cylindre blindé', range: '400–900 DH' },
      { label: 'Porte blindée installation', range: '1 200–3 500 DH' }
    ]
  },
  climatisation: {
    label: 'Climatisation', label_adj: 'climatisation',
    icon: '❄️', service_schema: 'HVACBusiness',
    sub_services: ['Installation climatiseur', 'Entretien et nettoyage', 'Recharge gaz réfrigérant', 'Dépannage panne', 'Nettoyage filtres'],
    h1_prefix: 'Technicien Climatisation à',
    title_suffix: 'Installation, entretien, panne | Fixeo',
    meta_desc: (city) => `Trouvez un technicien en climatisation à ${city} avec Fixeo. Installation, entretien, recharge gaz, réparation et dépannage rapide.`,
    intro_template: (c) => `L'installation ou l'entretien de votre climatiseur à ${c.label} demande un technicien qualifié. Fixeo vous connecte avec des spécialistes locaux pour tout type d'intervention : pose de split, entretien annuel, recharge en gaz réfrigérant ou réparation de panne. ${c.context} ${c.demand}`,
    faq: (c) => [
      { q: `Quel est le tarif d'installation d'une climatisation à ${c.label} ?`, a: `L'installation d'un climatiseur (split mural) à ${c.label} coûte entre ${Math.round(parseInt(c.pricing_low) * 1.2)} et ${Math.round(parseInt(c.pricing_high) * 1.5)} DH selon la puissance, la marque et les contraintes de l'installation (distance unités, passages de câbles). ${c.pricing_note}` },
      { q: `À quelle fréquence faut-il entretenir sa climatisation à ${c.label} ?`, a: `Un entretien annuel est fortement recommandé avant la saison chaude (avril-mai). Il comprend le nettoyage des filtres, la vérification du niveau de gaz et le contrôle général du système. Un technicien Fixeo peut effectuer cet entretien à domicile à ${c.label}.` },
      { q: `Mon climatiseur ne refroidit plus à ${c.label} — que faire ?`, a: `Un refroidissement insuffisant est souvent signe d'une perte de gaz réfrigérant ou d'un filtre encrassé. Via Fixeo, un technicien disponible à ${c.label} diagnostique et répare votre appareil. ${c.emergency}` }
    ],
    urgency_services: ['Climatiseur en panne', 'Plus de refroidissement', 'Fuite liquide réfrigérant', 'Bruit anormal', 'Télécommande ne répond plus'],
    related_services: ['electricien', 'plombier'],
    pricing_tiers: [
      { label: 'Nettoyage filtres + entretien annuel', range: '150–350 DH' },
      { label: 'Recharge gaz réfrigérant', range: '300–600 DH' },
      { label: 'Installation split mural (9000 BTU)', range: '800–1 800 DH' },
      { label: 'Dépannage panne électronique', range: '250–700 DH' }
    ]
  },
  peinture: {
    label: 'Peintre', label_adj: 'peinture',
    icon: '🎨', service_schema: 'ProfessionalService',
    sub_services: ['Peinture intérieure', 'Enduit et plâtre', 'Revêtement mural', 'Remise en état', 'Peinture extérieure façade'],
    h1_prefix: 'Peintre à',
    title_suffix: 'Travaux intérieurs, finitions | Fixeo',
    meta_desc: (city) => `Trouvez un peintre à ${city} avec Fixeo. Peinture intérieure, enduit, revêtement et travaux de finition par des artisans locaux vérifiés.`,
    intro_template: (c) => `Pour vos travaux de peinture à ${c.label}, Fixeo vous met en relation avec des artisans peintres locaux qualifiés. Que ce soit pour une rénovation complète, une remise en état ou de simples finitions, les peintres Fixeo interviennent dans tous les quartiers ${c.label_de} — ${c.neighborhoods}. ${c.context}`,
    faq: (c) => [
      { q: `Quel est le tarif d'un peintre à ${c.label} ?`, a: `Le tarif d'un peintre à ${c.label} varie entre ${c.pricing_low} et ${c.pricing_high} DH pour une pièce standard (15–20 m²), selon la préparation nécessaire (rebouchage, enduit) et le type de peinture utilisé. ${c.pricing_note}` },
      { q: `Combien de temps durent des travaux de peinture à ${c.label} ?`, a: `Une pièce standard prend généralement 1 à 2 jours selon l'état des murs et le nombre de couches. Un appartement complet peut nécessiter 3 à 5 jours. Via Fixeo, l'artisan évalue les délais lors du premier contact.` },
      { q: `Peut-on trouver un peintre disponible rapidement à ${c.label} ?`, a: `Oui. Via Fixeo, signalez vos besoins de peinture et notre système identifie les peintres disponibles à ${c.label}. Les artisans libres pour une intervention rapide sont mis en avant.` }
    ],
    urgency_services: ['Remise en état rapide', 'Réparation dégât des eaux (peinture)', 'Finitions avant emménagement', 'Ravalement façade urgent'],
    related_services: ['electricien', 'plombier'],
    pricing_tiers: [
      { label: 'Peinture 1 pièce (préparation incluse)', range: `${(parseInt('130')+20)}–${(parseInt('500')+100)} DH` },
      { label: 'Appartement 3 pièces complet', range: '1 200–3 500 DH' },
      { label: 'Enduit + peinture (par m²)', range: '25–60 DH/m²' },
      { label: 'Peinture façade extérieure', range: '35–80 DH/m²' }
    ]
  }
};

/* ═══════════════════════════════════════════════════════════
   NEARBY CITIES
══════════════════════════════════════════════════════════ */
const NEARBY = {
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

/* ═══════════════════════════════════════════════════════════
   HTML TEMPLATE BUILDER
══════════════════════════════════════════════════════════ */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
}

// Blog articles connexes by service
const BLOG_LINKS = {
  plombier: [
    { slug: 'prix-plombier-maroc', title: 'Prix plombier au Maroc 2025 : tarifs et devis', time: '6 min' },
    { slug: 'urgence-plombier-casablanca', title: 'Plombier urgence 24h/7 : comment réagir', time: '4 min' },
    { slug: 'comment-choisir-plombier-maroc', title: 'Comment choisir un bon plombier au Maroc', time: '5 min' }
  ],
  electricien: [
    { slug: 'prix-electricien-maroc', title: 'Prix électricien au Maroc 2025', time: '5 min' },
    { slug: 'urgence-electricien-rabat', title: 'Urgence électricien : quoi faire', time: '4 min' },
    { slug: 'artisan-verifie-maroc', title: 'Pourquoi choisir un artisan vérifié Fixeo', time: '4 min' }
  ],
  serrurier: [
    { slug: 'prix-serrurier-maroc', title: 'Prix serrurier au Maroc 2025 : tarifs et conseils', time: '5 min' },
    { slug: 'urgence-serrurier-marrakech', title: 'Urgence serrurerie : porte bloquée', time: '4 min' },
    { slug: 'artisan-verifie-maroc', title: 'Pourquoi choisir un artisan vérifié Fixeo', time: '4 min' }
  ],
  climatisation: [
    { slug: 'prix-climatisation-maroc', title: 'Prix installation climatisation Maroc 2025', time: '6 min' },
    { slug: 'climatisation-agadir', title: 'Climatisation : guide installation et entretien', time: '4 min' },
    { slug: 'artisan-verifie-maroc', title: 'Pourquoi choisir un artisan vérifié Fixeo', time: '4 min' }
  ],
  peinture: [
    { slug: 'prix-peinture-maroc', title: 'Prix peintre en bâtiment Maroc 2025', time: '5 min' },
    { slug: 'artisan-verifie-maroc', title: 'Pourquoi choisir un artisan vérifié Fixeo', time: '4 min' },
    { slug: 'garantie-intervention-fixeo', title: 'Garantie et SAV sur vos interventions Fixeo', time: '4 min' }
  ]
};

function buildBlogLinks(svcKey) {
  const articles = BLOG_LINKS[svcKey] || BLOG_LINKS.plombier;
  return articles.slice(0, 3).map(a =>
    `<a class="seo-blog-link" href="/blog/${a.slug}">
            <span class="seo-blog-time">⏱ ${a.time}</span>
            <span class="seo-blog-title">${esc(a.title)}</span>
            <span class="seo-blog-arrow">→</span>
          </a>`
  ).join('\n          ');
}

function buildRelatedLinks(svcKey, cityKey, svc) {
  const relSvcs = svc.related_services || [];
  const nearbyCities = (NEARBY[cityKey] || []).slice(0, 2);
  const links = [];

  // Sibling services same city
  relSvcs.slice(0, 2).forEach(rs => {
    const s2 = SERVICES[rs];
    if (!s2) return;
    const city = CITIES[cityKey];
    const href = CLEAN ? `/${rs}/${cityKey}` : `${rs}-${cityKey}.html`;
    links.push(`<a class="service-link seo-link-card" href="${href}">
            <span>${esc(city.label)}</span>
            <h3>${esc(s2.label)} à ${esc(city.label)}</h3>
            <p>${esc(s2.sub_services[0])} et ${esc(s2.sub_services[1]).toLowerCase()} à ${esc(city.label)}.</p>
          </a>`);
  });

  // Same service, nearby cities
  nearbyCities.forEach(nc => {
    const city2 = CITIES[nc];
    if (!city2) return;
    const href = CLEAN ? `/${svcKey}/${nc}` : `${svcKey}-${nc}.html`;
    links.push(`<a class="service-link seo-link-card" href="${href}">
            <span>${esc(city2.label)}</span>
            <h3>${esc(svc.label)} à ${esc(city2.label)}</h3>
            <p>${esc(svc.sub_services[0])} et interventions ${esc(svc.label_adj)} à ${esc(city2.label)}.</p>
          </a>`);
  });

  return links.slice(0, 4).join('\n          ');
}

function buildFAQJsonLD(faqItems) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqItems.map(f => ({
      '@type': 'Question',
      'name': f.q,
      'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
    }))
  };
}

function buildServiceJsonLD(svcKey, cityKey, svc, city, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': canonicalUrl + '#localbusiness',
    'name': `Fixeo — ${svc.label} à ${city.label}`,
    'description': svc.meta_desc(city.label),
    'url': canonicalUrl,
    'image': `https://www.fixeo.ma/img/logo.png`,
    'priceRange': `${city.pricing_low}–${city.pricing_high} DH`,
    'areaServed': { '@type': 'City', 'name': city.label, 'containedInPlace': { '@type': 'Country', 'name': 'Maroc' } },
    'address': { '@type': 'PostalAddress', 'addressLocality': city.label, 'addressCountry': 'MA' },
    'geo': { '@type': 'GeoCoordinates', 'latitude': city.lat, 'longitude': city.lng },
    'serviceType': svc.service_schema,
    'provider': { '@type': 'Organization', 'name': 'Fixeo', 'url': 'https://www.fixeo.ma/' },
    'hasOfferCatalog': {
      '@type': 'OfferCatalog',
      'name': `Services ${svc.label_adj} à ${city.label}`,
      'itemListElement': svc.pricing_tiers.map((t, i) => ({
        '@type': 'Offer', 'position': i + 1,
        'name': t.label, 'description': t.range,
        'priceSpecification': { '@type': 'PriceSpecification', 'priceCurrency': 'MAD' }
      }))
    }
  };
}

function buildBreadcrumbJsonLD(svcKey, cityKey, svc, city, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': 'https://www.fixeo.ma/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Services', 'item': 'https://www.fixeo.ma/services.html' },
      { '@type': 'ListItem', 'position': 3, 'name': svc.label, 'item': `https://www.fixeo.ma/services.html` },
      { '@type': 'ListItem', 'position': 4, 'name': `${svc.label} à ${city.label}`, 'item': canonicalUrl }
    ]
  };
}

function buildPage(svcKey, cityKey) {
  const svc  = SERVICES[svcKey];
  const city = CITIES[cityKey];
  if (!svc || !city) return null;

  const filename    = `${svcKey}-${cityKey}.html`;
  const canonicalUrl = CLEAN
    ? `https://www.fixeo.ma/${svcKey}/${cityKey}`
    : `https://www.fixeo.ma/${filename}`;

  const h1         = `${svc.h1_prefix} ${city.label}`;
  const title      = `${h1} | ${svc.title_suffix}`;
  const metaDesc   = svc.meta_desc(city.label);
  const intro      = svc.intro_template(city);
  const faqItems   = svc.faq(city);
  const relLinks   = buildRelatedLinks(svcKey, cityKey, svc);
  const blogLinks  = buildBlogLinks(svcKey);

  const serviceJsonLD    = buildServiceJsonLD(svcKey, cityKey, svc, city, canonicalUrl);
  const faqJsonLD        = buildFAQJsonLD(faqItems);
  const breadcrumbJsonLD = buildBreadcrumbJsonLD(svcKey, cityKey, svc, city, canonicalUrl);

  const pricingRows = svc.pricing_tiers.map(t =>
    `<tr><td>${esc(t.label)}</td><td><strong>${esc(t.range)}</strong></td></tr>`
  ).join('\n              ');

  const urgencyList = svc.urgency_services.map(u =>
    `<li>${esc(u)}</li>`
  ).join('\n                ');

  const faqHtml = faqItems.map(f =>
    `<details class="seo-faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
              <summary itemprop="name"><strong>${esc(f.q)}</strong></summary>
              <div class="seo-faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
                <p itemprop="text">${esc(f.a)}</p>
              </div>
            </details>`
  ).join('\n            ');

  const subServices = svc.sub_services.map((s, i) => {
    const chips = i === 0
      ? `<span class="chip">Urgence</span><span class="chip">${esc(city.label)}</span>`
      : `<span class="chip">${esc(city.label)}</span>`;
    return `<article class="artisan-card result-card seo-static-artisan-card">
            <div class="artisan-card-body seo-static-artisan-card-body">
              <div class="artisan-card-top">
                <div class="artisan-card-heading">
                  <h3>${esc(s)}</h3>
                  <div class="meta">${chips}</div>
                </div>
              </div>
              <p>Intervention ${esc(svc.label_adj)} par un artisan Fixeo disponible à ${esc(city.label)}.</p>
            </div>
          </article>`;
  }).join('\n          ');

  return {
    filename,
    canonicalUrl,
    wordCount: (intro + faqItems.map(f => f.q + f.a).join(' ')).split(/\s+/).length,
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-lpgen-v1a">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(h1)} | Fixeo">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(h1)} | Fixeo">
  <meta name="twitter:description" content="${esc(metaDesc)}">

  <!-- Structured Data: LocalBusiness -->
  <script type="application/ld+json">${JSON.stringify(serviceJsonLD)}</script>
  <!-- Structured Data: FAQPage -->
  <script type="application/ld+json">${JSON.stringify(faqJsonLD)}</script>
  <!-- Structured Data: BreadcrumbList -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLD)}</script>

  <link rel="stylesheet" href="/css/seo-lp-v1.css">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">

  <!-- Logo CSS override (production consistent) -->
  <style id="fixeo-logo-override">
    .navbar-brand .logo-icon, .logo-wrap .logo-icon, .fixeo-gh-brand .logo-icon
      { display:none !important; width:0 !important; height:0 !important; min-width:0 !important; flex:0 !important; }
    .navbar-brand .logo-text, .logo-wrap .logo-text, .fixeo-gh-brand .logo-text
      { display:none !important; }
    img.fixeo-logo-img { display:block !important; height:32px !important; width:auto !important; }
    .lp-rating-badge { text-align:center; margin: 12px 0 4px; font-size:0.82rem; color:rgba(232,234,240,0.65); padding:6px 12px; background:rgba(255,255,255,0.04); border-radius:8px; border:1px solid rgba(255,255,255,0.07); display:inline-block; }
    .lp-rating-note { font-size:0.75rem; opacity:0.7; margin-left:4px; }
  </style>
</head>
<body class="seo-service-page seo-static-city-page" data-theme="dark" data-fixeo-seo-static="true"
      data-svc="${svcKey}" data-city="${cityKey}">
  <div class="bg-animated seo-bg"></div>
  <a href="#main-content" class="skip-link">Aller au contenu</a>

  <nav class="navbar" role="navigation" aria-label="Navigation principale">
    <a href="/index.html" class="navbar-brand logo-wrap" aria-label="Fixeo — Accueil">
      <img src="/img/fixeo-logo.webp" alt="Fixeo" class="fixeo-logo-img" width="120" height="32">
    </a>
    <div class="nav-links">
      <a href="/index.html" class="nav-link">Accueil</a>
      <a href="/services.html" class="nav-link">Services</a>
      <a href="/pricing.html" class="nav-link">Tarifs</a>
      <a href="/auth.html" class="btn-nav btn-nav-outline" data-auth="guest">Connexion</a>
    </div>
  </nav>

  <main id="main-content" role="main">
    <div class="seo-page-wrap">

      <section class="seo-hero seo-city-hero" aria-labelledby="seo-city-title">
        <nav class="seo-breadcrumbs" aria-label="Fil d'Ariane">
          <a href="/index.html">Accueil</a>
          <span aria-hidden="true">›</span>
          <a href="/services.html">Services</a>
          <span aria-hidden="true">›</span>
          <span>${esc(h1)}</span>
        </nav>

        <div class="seo-hero-grid">
          <div class="seo-copy">
            <span class="seo-kicker">${esc(svc.icon)} ${esc(svc.label)} · ${esc(city.label)}</span>
            <h1 id="seo-city-title">${esc(h1)}</h1>
            <p class="seo-lead">${esc(intro)}</p>
            <div class="seo-actions">
              <a class="seo-btn-link primary" href="/index.html#services">Trouver un ${esc(svc.label.toLowerCase())} maintenant</a>
              <a class="seo-btn-link secondary" href="/services.html">Tous les services</a>
            </div>
          </div>
          <div class="seo-hero-media seo-city-media">
            <div class="hero-card seo-hero-card">
              <img src="/img/seo/${svcKey}-${cityKey}.webp"
                   onerror="this.onerror=null;this.src='/img/seo/${svcKey}-placeholder.webp'"
                   alt="${esc(h1)} intervention rapide"
                   loading="lazy" decoding="async" width="400" height="280">
            </div>
          </div>
        </div>

        <div class="seo-hero-stats seo-city-stats">
          <article class="seo-stat">
            <strong>Quartiers couverts</strong>
            <span>${esc(city.neighborhoods)}</span>
          </article>
          <article class="seo-stat">
            <strong>Tarifs indicatifs</strong>
            <span>${esc(city.pricing_low)}–${esc(city.pricing_high)} DH · ${esc(city.pricing_note.split('.')[0])}.</span>
          </article>
          <article class="seo-stat">
            <strong>Contexte local</strong>
            <span>${esc(city.context)}</span>
          </article>
        </div>
      </section>

      <!-- SERVICES SECTION -->
      <section id="artisans-section" class="seo-panel" aria-labelledby="seo-artisans-title">
        <div class="seo-toolbar">
          <div>
            <div class="seo-section-heading">Prestations disponibles</div>
            <h2 id="seo-artisans-title">Services ${esc(svc.label_adj)} à ${esc(city.label)}</h2>
          </div>
        </div>
        <p class="seo-section-intro">${esc(city.demand)}</p>
        <div id="artisans-container" class="artisans-grid results-list seo-artisans-grid" aria-live="polite">
          ${subServices}
        </div>
        <div class="seo-actions" style="margin-top:20px">
          <a class="seo-btn-link primary" href="/index.html#services">Demander un ${esc(svc.label.toLowerCase())} à ${esc(city.label)}</a>
        </div>
      </section>

      <!-- PRICING SECTION -->
      <section class="seo-panel seo-pricing-section" aria-labelledby="seo-pricing-title">
        <div class="seo-section-heading">Tarifs</div>
        <h2 id="seo-pricing-title">Tarifs ${esc(svc.label_adj)} à ${esc(city.label)}</h2>
        <p class="seo-section-intro">${esc(city.pricing_note)}</p>
        <table class="seo-pricing-table" role="table" aria-label="Grille tarifaire ${esc(svc.label_adj)}">
          <thead><tr><th scope="col">Prestation</th><th scope="col">Tarif indicatif</th></tr></thead>
          <tbody>
              ${pricingRows}
          </tbody>
        </table>
        <p class="seo-pricing-note"><small>Tarifs indicatifs — le devis final est établi par l'artisan selon l'état des lieux. Paiement après intervention sur Fixeo.</small></p>
        <div class="lp-rating-badge">⭐ 4.9/5 · 247 avis vérifiés <span class="lp-rating-note">basé sur les missions Fixeo</span></div>
      </section>

      <!-- EMERGENCY SECTION -->
      <section class="seo-panel seo-emergency-section" aria-labelledby="seo-emergency-title">
        <div class="seo-section-heading">Urgences</div>
        <h2 id="seo-emergency-title">${esc(svc.label)} urgence à ${esc(city.label)}</h2>
        <p class="seo-section-intro">${esc(city.emergency)}</p>
        <ul class="seo-urgency-list" aria-label="Cas d'urgence fréquents">
                ${urgencyList}
        </ul>
        <div class="seo-actions" style="margin-top:16px">
          <a class="seo-btn-link primary" href="/index.html#services">Déclarer une urgence maintenant</a>
        </div>
      </section>

      <!-- FAQ SECTION -->
      <section class="seo-panel seo-faq-section" aria-labelledby="seo-faq-title"
               itemscope itemtype="https://schema.org/FAQPage">
        <div class="seo-section-heading">FAQ</div>
        <h2 id="seo-faq-title">Questions fréquentes — ${esc(svc.label)} à ${esc(city.label)}</h2>
        <div class="seo-faq-list">
            ${faqHtml}
        </div>
      </section>

      <!-- INTERNAL LINKS -->
      <section class="seo-panel" aria-labelledby="seo-related-title">
        <div class="seo-section-heading">Voir aussi</div>
        <h2 id="seo-related-title">Services liés à ${esc(city.label)} et alentours</h2>
        <div class="links-grid seo-links-grid">
          ${relLinks}
        </div>
      </section>

      <!-- ARTICLES CONNEXES — fxblog-v1a -->
      <section class="seo-panel seo-blog-panel" aria-labelledby="seo-blog-title">
        <div class="seo-section-heading">Blog Fixeo</div>
        <h2 id="seo-blog-title">Articles connexes sur la ${esc(svc.label.toLowerCase())}</h2>
        <div class="seo-blog-links">
          ${blogLinks}
        </div>
      </section>

      <!-- FOOTER CTA -->
      <div class="footer seo-footer-card">
        <div class="footer-row">
          <div>
            <strong>Fixeo Maroc</strong>
            <p>Plateforme de mise en relation avec des artisans vérifiés à ${esc(city.label)} et dans toute la région.</p>
          </div>
          <div class="seo-actions">
            <a class="seo-btn-link primary" href="/index.html#services">Trouver un ${esc(svc.label.toLowerCase())} à ${esc(city.label)}</a>
          </div>
        </div>
      </div>

    </div>
  </main>

  <!-- Deferred non-critical scripts -->
  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>
  <script src="/js/fixeo-seo-local.js?v=seo2b" defer></script>
  <script src="/js/fixeo-schema-rating.js?v=rating-v1a" defer></script>

</body>
</html>`
  };
}

/* ═══════════════════════════════════════════════════════════
   MAIN: Generate pages
══════════════════════════════════════════════════════════ */
const services = SVCARG ? [SVCARG] : Object.keys(SERVICES);
const cities   = CTYARG ? [CTYARG] : Object.keys(CITIES);

let generated = 0, skipped = 0, errors = 0;

services.forEach(svcKey => {
  if (!SERVICES[svcKey]) { console.error(`Unknown service: ${svcKey}`); return; }
  cities.forEach(cityKey => {
    if (!CITIES[cityKey]) { console.error(`Unknown city: ${cityKey}`); return; }

    const page = buildPage(svcKey, cityKey);
    if (!page) { errors++; return; }

    const outPath = path.join(ROOT, page.filename);

    if (DRY) {
      console.log(`[DRY] ${page.filename}  (${page.wordCount} words)  canonical: ${page.canonicalUrl}`);
      generated++;
      return;
    }

    if (fs.existsSync(outPath) && !FORCE) {
      console.log(`[SKIP] ${page.filename}  (use --force to overwrite)`);
      skipped++;
      return;
    }

    try {
      fs.writeFileSync(outPath, page.html, 'utf8');
      console.log(`[OK]   ${page.filename}  (${page.wordCount} words)`);
      generated++;
    } catch(e) {
      console.error(`[ERR]  ${page.filename}: ${e.message}`);
      errors++;
    }
  });
});

console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${errors} errors`);
if (!DRY) console.log('Run with --dry-run to preview without writing files');
