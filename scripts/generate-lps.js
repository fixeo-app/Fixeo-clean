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
    profession: 'plombier', profession_pl: 'plombiers',
    article: 'un', supabase_category: 'Plomberie',
    situations: [
      { icon: '\uD83D\uDCA7', label: "Fuite d'eau" },
      { icon: '\uD83D\uDEBF', label: "Robinet ou chasse d'eau" },
      { icon: '\uD83D\uDD29', label: 'Canalisation boucHée' },
      { icon: '\uD83C\uDFE0', label: 'Installation sanitaire' },
      { icon: '\uD83D\uDD25', label: 'Chauffe-eau' },
      { icon: '\uD83D\uDD0D', label: 'Recherche et diagnostic de panne' },
    ],
    faq_flagship: (city) => [
      { q: 'Comment trouver un plombier à ' + city.label + ' ?', a: "Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux artisans plombiers référencés correspondant à votre secteur à " + city.label + ". L'artisan vous contacte et confirme le tarif définitif avant d'intervenir." },
      { q: 'Quels types de problèmes de plomberie peuvent être pris en charge ?', a: "Les artisans référencés sur FIXEO peuvent intervenir pour des fuites d'eau, des robinets ou chasses d'eau défectueux, des canalisations boucHées, des installations sanitaires, des chauffe-eau et des diagnostics de panne. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé ?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix ?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué ?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
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
    profession: 'électricien', profession_pl: 'électriciens',
    article: 'un', supabase_category: 'Électricité',
    situations: [
      { icon: '⚡', label: 'Panne électrique' },
      { icon: '\uD83D\uDD0C', label: 'Prise ou interrupteur' },
      { icon: '\uD83D\uDCA1', label: 'Éclairage' },
      { icon: '\uD83D\uDD27', label: 'Tableau électrique' },
      { icon: '\uD83D\uDCE6', label: 'Câblage et installation' },
      { icon: '\uD83D\uDD0D', label: 'Diagnostic et mise aux normes' },
    ],
    faq_flagship: (city) => [
      { q: 'Comment trouver un électricien à ' + city.label + ' ?', a: "Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux artisans électriciens référencés correspondant à votre secteur à " + city.label + ". L'artisan vous contacte et confirme le tarif définitif avant d'intervenir." },
      { q: 'Quels types de travaux électriques peuvent être pris en charge ?', a: "Les artisans référencés sur FIXEO peuvent intervenir pour des pannes électriques, des prises ou interrupteurs, de l'éclairage, des tableaux électriques et du câblage. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé ?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix ?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué ?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
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
    profession: 'serrurier', profession_pl: 'serruriers',
    article: 'un', supabase_category: 'Serrurerie',
    situations: [
      { icon: '\uD83D\uDEAA', label: 'Porte claquée ou bloquée' },
      { icon: '\uD83D\uDD11', label: 'Remplacement de serrure' },
      { icon: '\uD83D\uDD10', label: 'Clé cassée ou perdue' },
      { icon: '\uD83D\uDEE1\uFE0F', label: 'Sécurisation après effraction' },
      { icon: '\uD83D\uDEAA', label: 'Cylindre blindé' },
      { icon: '\uD83D\uDD0D', label: 'Diagnostic et conseil sécurité' },
    ],
    faq_flagship: (city) => [
      { q: 'Comment trouver un serrurier à ' + city.label + ' ?', a: "Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux artisans serruriers référencés correspondant à votre secteur à " + city.label + ". L'artisan vous contacte et confirme le tarif définitif avant d'intervenir." },
      { q: 'Quels types de problèmes de serrurerie peuvent être pris en charge ?', a: "Les artisans référencés sur FIXEO peuvent intervenir pour des portes claquées ou bloquées, des remplacements de serrure, des clés cassées ou perdues, des sécurisations après effraction et des diagnostics. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé ?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix ?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué ?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
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
    profession: 'technicien climatisation', profession_pl: 'techniciens climatisation',
    article: 'un', supabase_category: 'Climatisation',
    situations: [
      { icon: '❄️', label: 'Climatiseur en panne' },
      { icon: '\uD83C\uDFE0', label: 'Installation climatiseur' },
      { icon: '\uD83E\uDDF9', label: 'Nettoyage et entretien' },
      { icon: '\uD83E\uDDFB', label: 'Recharge gaz réfrigérant' },
      { icon: '\uD83D\uDD0A', label: 'Bruit anormal ou fuite' },
      { icon: '\uD83D\uDD0D', label: 'Diagnostic de panne' },
    ],
    faq_flagship: (city) => [
      { q: 'Comment trouver un technicien climatisation à ' + city.label + ' ?', a: "Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux artisans spécialisés correspondant à votre secteur à " + city.label + ". L'artisan vous contacte et confirme le tarif définitif avant d'intervenir." },
      { q: "Quels types d'interventions climatisation peuvent être pris en charge ?", a: "Les artisans référencés sur FIXEO peuvent intervenir pour des pannes, des installations, le nettoyage, la recharge de gaz réfrigérant, les bruits anormaux et les diagnostics. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé ?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix ?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué ?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
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
    profession: 'peintre', profession_pl: 'peintres',
    article: 'un', supabase_category: 'Peinture',
    situations: [
      { icon: '\uD83C\uDFA8', label: 'Peinture int\u00e9rieure' },
      { icon: '\uD83C\uDFE0', label: 'R\u00e9novation compl\u00e8te' },
      { icon: '\uD83D\uDCCF', label: 'Enduit et pl\u00e2tre' },
      { icon: '\uD83D\uDD28', label: 'Rev\u00eatement mural' },
      { icon: '\uD83C\uDFD7\uFE0F', label: 'Peinture fa\u00e7ade' },
      { icon: '\uD83D\uDD0D', label: 'Diagnostic et conseil' },
    ],
    faq_flagship: (city) => [
      { q: 'Comment trouver un peintre \u00e0 ' + city.label + '\u00a0?', a: "D\u00e9crivez votre projet sur FIXEO. Votre demande est enregistr\u00e9e et transmise aux artisans peintres r\u00e9f\u00e9renc\u00e9s correspondant \u00e0 votre secteur \u00e0 " + city.label + ". L\'artisan vous contacte et confirme le tarif d\u00e9finitif avant de commencer." },
      { q: 'Quels types de travaux de peinture peuvent \u00eatre pris en charge\u00a0?', a: "Les artisans r\u00e9f\u00e9renc\u00e9s sur FIXEO peuvent intervenir pour la peinture int\u00e9rieure, les enduits, les rev\u00eatements muraux, la peinture de fa\u00e7ade et les remises en \u00e9tat. Les prestations d\u00e9pendent du diagnostic et des comp\u00e9tences de l\'artisan s\u00e9lectionn\u00e9." },
      { q: 'Comment le tarif d\u00e9finitif est-il confirm\u00e9\u00a0?', a: "Apr\u00e8s \u00e9valuation de votre situation, l\'artisan vous communique le tarif d\u00e9finitif avant de commencer. Vous n\'\u00eates pas oblig\u00e9 d\'accepter. En cas d\'accord, le paiement s\'effectue apr\u00e8s la fin de l\'intervention." },
      { q: 'Le d\u00e9placement est-il inclus dans le prix\u00a0?', a: "Le d\u00e9placement peut \u00eatre inclus ou factur\u00e9 s\u00e9par\u00e9ment selon l\'artisan, la distance et le secteur. Le d\u00e9tail est pr\u00e9cis\u00e9 dans le devis communiqu\u00e9 avant l\'intervention." },
      { q: 'Quand le paiement est-il effectu\u00e9\u00a0?', a: "Le paiement s\'effectue apr\u00e8s l\'intervention, jamais en avance compl\u00e8te. Aucun paiement anticip\u00e9 n\'est demand\u00e9." },
    ],
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
  tetouan: ['tanger', 'kenitra', 'rabat'],
  'beni-mellal': {
    label: 'Béni Mellal', label_de: 'de Béni Mellal',
    neighborhoods: 'Centre-ville, Hay Al Massira, Hay Chemi, Hay El Majd',
    context: 'Ville agricole en expansion au cœur de la région Béni Mellal-Khénifra, avec un tissu résidentiel dense et croissant.',
    demand: 'Demandes en plomberie et électricité portées par les nouvelles constructions et le parc résidentiel existant.',
    pricing_low: '100', pricing_high: '380',
    pricing_note: 'Marché local avec tarifs adaptés à la région.',
    nearby: ['khouribga', 'marrakech', 'fes']
  },
  'el-jadida': {
    label: 'El Jadida', label_de: "d'El Jadida",
    neighborhoods: 'Centre-ville, Hay Hassani, Cité Portugaise, Plateau',
    context: 'Ville côtière de la région Casablanca-Settat, El Jadida combine un habitat résidentiel dense et un tourisme balnéaire soutenu.',
    demand: 'Demandes régulières en plomberie et électricité dans les immeubles résidentiels et maisons individuelles.',
    pricing_low: '100', pricing_high: '380',
    pricing_note: 'Marché local avec tarifs adaptés à la région côtière.',
    nearby: ['casablanca', 'safi', 'casablanca']
  },
  'beni-mellal': ['khouribga', 'marrakech', 'fes'],
  'el-jadida': ['casablanca', 'safi', 'marrakech']
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
  const seen = new Set();
  const selfHref = `${svcKey}-${cityKey}.html`;
  seen.add(selfHref);
  const cards = [];

  // Sibling services same city (up to 2)
  relSvcs.slice(0, 2).forEach(rs => {
    const s2 = SERVICES[rs];
    if (!s2) return;
    const city = CITIES[cityKey];
    const href = `${rs}-${cityKey}.html`;
    if (seen.has(href)) return;
    seen.add(href);
    cards.push({ href, city: city.label, title: `${esc(s2.label)} à ${esc(city.label)}`, icon: s2.icon || '🔧' });
  });

  // Same service, nearby cities (up to 2)
  nearbyCities.forEach(nc => {
    const city2 = CITIES[nc];
    if (!city2) return;
    const href = `${svcKey}-${nc}.html`;
    if (seen.has(href)) return;
    seen.add(href);
    cards.push({ href, city: city2.label, title: `${esc(svc.label)} à ${esc(city2.label)}`, icon: svc.icon || '🔧' });
  });

  return cards.slice(0, 4).map(card =>
    `<a class="fxlp-explorer-card" href="${card.href}">
            <span class="fxlp-explorer-icon" aria-hidden="true">${card.icon}</span>
            <span class="fxlp-explorer-city">${esc(card.city)}</span>
            <span class="fxlp-explorer-title">${card.title}</span>
          </a>`
  ).join('\n          ');
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

  const filename     = `${svcKey}-${cityKey}.html`;
  const canonicalUrl = `https://www.fixeo.ma/${svcKey}/${cityKey}`;

  const h1        = `${esc(svc.h1_prefix + ' ' + city.label)}`;
  const title     = `${svc.h1_prefix} ${city.label} | ${svc.title_suffix}`;
  const metaDesc  = svc.meta_desc(city.label);
  const faqItems  = svc.faq_flagship(city);
  const profession  = svc.profession;
  const professionU = profession.charAt(0).toUpperCase() + profession.slice(1);
  const profPl    = svc.profession_pl;
  const svcCat    = svc.supabase_category;

  const breadcrumbLD = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://www.fixeo.ma/' },
      { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://www.fixeo.ma/services.html' },
      { '@type': 'ListItem', position: 3, name: svc.label, item: `https://www.fixeo.ma/${svcKey}` },
      { '@type': 'ListItem', position: 4, name: city.label, item: canonicalUrl },
    ]
  };
  const localBizLD = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness',
    '@id': canonicalUrl + '#localbusiness',
    name: `Fixeo — ${svc.label} à ${city.label}`,
    description: `${svc.label} à ${city.label}. Paiement après intervention.`,
    url: canonicalUrl, image: 'https://www.fixeo.ma/img/logo.png',
    areaServed: { '@type': 'City', name: city.label, containedInPlace: { '@type': 'Country', name: 'Maroc' } },
    address: { '@type': 'PostalAddress', addressLocality: city.label, addressCountry: 'MA' },
    geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lng },
    provider: { '@type': 'Organization', name: 'Fixeo', url: 'https://www.fixeo.ma/' }
  };
  const article = svc.article;
    const faqLD = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };

  const situationsHtml = svc.situations.map(s =>
    `<li class="fxlp-sit-item" role="listitem">
            <span class="fxlp-sit-icon" aria-hidden="true">${s.icon}</span>
            <span class="fxlp-sit-label">${esc(s.label)}</span>
          </li>`
  ).join('\n          ');

  const faqHtml = faqItems.map(f =>
    `<details class="fxlp-faq-item" role="listitem">
            <summary class="fxlp-faq-summary">
              ${esc(f.q)}
              <span class="fxlp-faq-chevron" aria-hidden="true">›</span>
            </summary>
            <div class="fxlp-faq-answer">
              ${esc(f.a)}
            </div>
          </details>`
  ).join('\n\n          ');

  const relLinks = buildRelatedLinks(svcKey, cityKey, svc);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-lpgen-flagship-v1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  <script type="application/ld+json">${JSON.stringify(localBizLD)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLD)}</script>
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/header-unified.css">
  <link rel="stylesheet" href="/css/fixeo-header-global.css">
  <link rel="stylesheet" href="/css/fixeo-footer-global.css?v=gf4a">
  <link rel="stylesheet" href="/css/artisan-card-conversion-v1.css?v=fxhome-artisan-card-v3b2">
  <link rel="stylesheet" href="/css/fixeo-artisan-card-premium-v2.css?v=facp-v2c">
  <link rel="stylesheet" href="/css/fixeo-artisan-section-v1.css?v=fxhome-artisan-section-v1a2-int11">
  <link rel="stylesheet" href="/css/fixeo-consent-v1.css?v=fcv1b">
  <link rel="stylesheet" href="/css/reservation.css?v=fxlp-res-v1">
  <link rel="stylesheet" href="/css/reservation-v2.css?v=fxlp-res-v1">
  <link rel="stylesheet" href="/css/reservation-v2a.css?v=fxlp-res-v1">
  <link rel="stylesheet" href="/css/fixeo-local-flagship-v1.css?v=fxlp-v15">
  <link rel="stylesheet" href="/css/fixeo-reservation-flagship-v1.css?v=fxresf-v11a">
  <link rel="stylesheet" href="/css/fx-request-flow-v4.css?v=fxrf4-v5z">
  <link rel="icon" href="/img/favicon.png" type="image/png">
</head>
<body class="seo-service-page" data-theme="dark" data-svc="${svcKey}" data-city="${cityKey}">
  <div class="bg-animated seo-bg" aria-hidden="true"></div>
  <a href="#main-content" class="fxlp-skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#ff6b3d;color:#fff;padding:6px 14px;border-radius:8px;font-size:.85rem;text-decoration:none">Aller au contenu</a>
  <nav class="navbar" role="navigation" aria-label="Navigation principale"></nav>
  <select id="qsm-select-city" style="display:none" aria-hidden="true">
    <option value="${esc(city.label)}" selected>${esc(city.label)}</option>
  </select>
  <input id="qsm-input-nlp" type="hidden" value="${esc(svc.label)}">
  <main id="main-content" role="main">
    <div class="fxlp-wrap">

      <!-- §§0 BREADCRUMBS -->
      <nav class="fxlp-breadcrumbs" aria-label="Fil d'Ariane">
        <a href="/index.html">Accueil</a>
        <span aria-hidden="true">›</span>
        <a href="/services.html">Services</a>
        <span aria-hidden="true">›</span>
        <span>${esc(svc.label)}</span>
        <span aria-hidden="true">›</span>
        <span aria-current="page">${esc(city.label)}</span>
      </nav>
    </div>

    <!-- §§1 HERO -->
    <section class="fxlp-hero" aria-labelledby="fxlp-h1">
      <div class="fxlp-wrap">
        <div class="fxlp-hero-copy">
          <div class="fxlp-eyebrow">
            <span class="fxlp-eyebrow-dot" aria-hidden="true"></span>
            ${esc(svc.label.toUpperCase())} · ${esc(city.label.toUpperCase())} · 2026
          </div>
          <h1 id="fxlp-h1" class="fxlp-h1">${esc(svc.h1_prefix)}&nbsp;<em class="fxlp-h1-em">${esc(city.label)}</em></h1>
          <p class="fxlp-lead">${esc(svc.meta_desc(city.label))}</p>
          <div class="fxlp-chips" role="list">
            <span class="fxlp-chip fxlp-chip--city" role="listitem">📍 ${esc(city.label)}</span>
            <span class="fxlp-chip fxlp-chip--svc"  role="listitem">${svc.icon} ${esc(svc.label)}</span>
            <span class="fxlp-chip fxlp-chip--pay"  role="listitem">✓ Paiement après intervention</span>
          </div>
          <p class="fxlp-note-price">Le tarif définitif est confirmé avec l’artisan avant l’intervention.</p>
          <div class="fxlp-cta-group">
            <button class="fxlp-btn-primary" type="button" data-open-request-form="true" data-request-mode="default">
              Décrire mon besoin à ${esc(city.label)}
            </button>
            <a href="#fxlp-artisans" id="fxlp-scroll-artisans" class="fxlp-btn-secondary">
              Voir les artisans à ${esc(city.label)} ↓
            </a>
          </div>
        </div>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §§2 SITUATIONS -->
    <section class="fxlp-section fxlp-section--tinted" aria-labelledby="fxlp-sit-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">BESOINS FRÉQUENTS</span>
        <h2 id="fxlp-sit-title" class="fxlp-section-title">Pour quels besoins contacter ${esc(article + ' ' + profession)} à ${esc(city.label)} ?</h2>
        <p class="fxlp-section-sub">Les prestations proposées dépendent du diagnostic et des compétences de l’artisan sélectionné.</p>
        <ul class="fxlp-sit-grid" role="list">
          ${situationsHtml}
        </ul>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §§3 LOCAL SERVICE EXPLANATION -->
    <section class="fxlp-section" aria-labelledby="fxlp-how-local-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">COMMENT ÇA MARCHE</span>
        <h2 id="fxlp-how-local-title" class="fxlp-section-title">Trouver une solution ${esc(svc.label_adj)} à ${esc(city.label)}</h2>
        <div class="fxlp-expl-grid">
          <div class="fxlp-expl-item">
            <span class="fxlp-expl-icon" aria-hidden="true">✏️</span>
            <p class="fxlp-expl-text">Vous décrivez votre problème — panne, installation ou diagnostic.</p>
          </div>
          <div class="fxlp-expl-item">
            <span class="fxlp-expl-icon" aria-hidden="true">📋</span>
            <p class="fxlp-expl-text">FIXEO enregistre votre demande et la transmet aux artisans référencés correspondant à votre secteur à ${esc(city.label)}.</p>
          </div>
          <div class="fxlp-expl-item">
            <span class="fxlp-expl-icon" aria-hidden="true">📞</span>
            <p class="fxlp-expl-text">Un artisan vous contacte et confirme le tarif définitif et le créneau avant de commencer. Paiement après intervention.</p>
          </div>
        </div>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §§4 REAL ARTISAN SECTION -->
    <section id="fxlp-artisans" class="fxlp-section" aria-labelledby="fxlp-art-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">ARTISANS RÉFÉRENCÉS</span>
        <h2 id="fxlp-art-title" class="fxlp-section-title">${esc(professionU + 's')} référencés à ${esc(city.label)}</h2>
        <p class="fxlp-section-sub">Profils référencés sur FIXEO. Paiement après intervention.</p>
        <div class="fxlp-artisan-grid" role="list" aria-label="${esc(professionU + 's référencés à ' + city.label)}" aria-live="polite">
          <div id="fxlp-artisan-grid" class="fxlp-artisan-loading" role="list"
               aria-label="${esc(professionU + 's à ' + city.label)}"
               data-fxlp-city="${esc(city.label)}"
               data-fxlp-service="${svcKey}"
               data-fxlp-category="${esc(svcCat)}">
            <div class="fxlp-skeleton" aria-hidden="true"></div>
            <div class="fxlp-skeleton" aria-hidden="true"></div>
            <div class="fxlp-skeleton" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §§5 HOW-IT-WORKS STEPS -->
    <section class="fxlp-how" aria-labelledby="fxlp-steps-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">EN 3 ÉTAPES</span>
        <h2 id="fxlp-steps-title" class="fxlp-section-title">Trouver ${esc(article + ' ' + profession)} à ${esc(city.label)} en 3 étapes</h2>
        <div class="fxlp-steps" role="list">
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">1</div>
            <h3 class="fxlp-step-title">Décrivez votre besoin</h3>
            <p class="fxlp-step-desc">Votre ville et le service sont déjà sélectionnés — décrivez simplement votre situation.</p>
          </div>
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">2</div>
            <h3 class="fxlp-step-title">FIXEO recherche la solution adaptée</h3>
            <p class="fxlp-step-desc">Votre demande est enregistrée et transmise aux artisans référencés correspondant à votre secteur.</p>
          </div>
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">3</div>
            <h3 class="fxlp-step-title">Confirmez le tarif avec l’artisan</h3>
            <p class="fxlp-step-desc">L’artisan vous communique le tarif définitif avant de commencer. Paiement après intervention.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- §§6 FINAL CTA BANNER -->
    <div class="fxlp-wrap">
      <div class="fxlp-cta-banner" role="complementary">
        <p class="fxlp-cta-eyebrow">BESOIN D’UN ARTISAN ?</p>
        <h2 class="fxlp-cta-title">Votre demande à ${esc(city.label)}, en quelques secondes.</h2>
        <p class="fxlp-cta-lead">Votre ville et le service sont déjà sélectionnés. Décrivez votre problème — c’est tout.</p>
        <button class="fxlp-btn-primary" type="button" data-open-request-form="true" data-request-mode="default">
          Continuer avec ${esc(svc.label)} · ${esc(city.label)}
        </button>
        <p class="fxlp-cta-note">Aucun paiement maintenant · Tarif confirmé avant l’intervention</p>
      </div>
    </div>

    <!-- §§7 FAQ -->
    <section id="fxlp-faq" class="fxlp-faq-section" aria-labelledby="fxlp-faq-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">FAQ</span>
        <h2 id="fxlp-faq-title" class="fxlp-section-title">Questions fréquentes — ${esc(professionU)} à ${esc(city.label)}</h2>
        <div class="fxlp-faq-list" role="list">

          ${faqHtml}

        </div>
      </div>
    </section>

    <!-- §§8 EXPLORER AUSSI -->
    <section class="fxlp-explorer" aria-labelledby="fxlp-explorer-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">EXPLORER AUSSI</span>
        <h2 id="fxlp-explorer-title" class="fxlp-explorer-heading">Explorer aussi</h2>
        <nav class="fxlp-explorer-grid" aria-label="Pages liées">
          ${relLinks}
        </nav>
      </div>
    </section>

  </main>
  <div id="fxf-mount"></div>

  <script src="/js/fixeo-consent-v1.js?v=fcv1c"></script>
  <script src="/js/fixeo-analytics-config.js?v=fac1b" defer></script>
  <script src="/js/fixeo-analytics-bootstrap.js?v=fab1c" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="/js/supabase-client.js?v=sc2"></script>
  <script src="/js/fixeo-heroes.js?v=fh3" defer></script>
  <script src="/js/reservation.js?v=fxlp-res-v1" defer></script>
  <script src="/js/cod-payment.js?v=fxlp-cod-v1" defer></script>
  <script src="/js/reservation-v2.js?v=fxlp-res-v1" defer></script>
  <script src="/js/fixeo-reservation-flagship-v1.js?v=fxresf-v11a" defer></script>
  <script src="/js/fixeo-reservation-supabase-bridge.js?v=fxlp-sb-v1" defer></script>
  <script src="/js/fx-request-flow-v4.js?v=fxrf4-v5a1" defer></script>
  <script src="/js/fixeo-header-global.js?v=gfnav5"></script>
  <script src="/js/header-unified.js?v=modalfix3"></script>
  <script src="/js/fixeo-footer-global.js?v=gf4a" defer></script>
  <script src="/js/fixeo-local-flagship-v1.js?v=fxlp-v12" defer></script>
</body>
</html>`;

  return {
    filename,
    canonicalUrl,
    wordCount: (metaDesc + faqItems.map(f => f.q + f.a).join(' ')).split(/\s+/).length,
    html,
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
