#!/usr/bin/env node
/**
 * FIXEO Programmatic SEO Engine V2 — generate-pseo-v2.js
 * Version: pseo-v2a — 2026-06-12
 * ─────────────────────────────────────────────────────────
 * Generates 3 types of transactional SEO pages:
 *   1A. Problem pages:  8 problems × 20 cities = 160 pages
 *   1B. Price pages:    6 services × 20 cities = 120 pages
 *   1C. Quartier pages: 3 services × ~38 quartiers × 6 cities = ~114 pages
 *
 * Total: ~394 pages
 * ─────────────────────────────────────────────────────────
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════════════════════════
   CITIES
══════════════════════════════════════════════════════════ */
const CITIES = {
  casablanca:  { label: 'Casablanca',   slug: 'casablanca',   lat: 33.5731, lng: -7.5898,  pop: '3,7 millions', region: 'Grand Casablanca-Settat' },
  rabat:       { label: 'Rabat',        slug: 'rabat',        lat: 34.0209, lng: -6.8416,  pop: '580 000',      region: 'Rabat-Salé-Kénitra' },
  marrakech:   { label: 'Marrakech',    slug: 'marrakech',    lat: 31.6295, lng: -7.9811,  pop: '1 million',    region: 'Marrakech-Safi' },
  fes:         { label: 'Fès',          slug: 'fes',          lat: 34.0181, lng: -5.0078,  pop: '1,2 million',  region: 'Fès-Meknès' },
  tanger:      { label: 'Tanger',       slug: 'tanger',       lat: 35.7595, lng: -5.8340,  pop: '1 million',    region: 'Tanger-Tétouan-Al Hoceïma' },
  agadir:      { label: 'Agadir',       slug: 'agadir',       lat: 30.4278, lng: -9.5981,  pop: '420 000',      region: 'Souss-Massa' },
  meknes:      { label: 'Meknès',       slug: 'meknes',       lat: 33.8731, lng: -5.5407,  pop: '520 000',      region: 'Fès-Meknès' },
  oujda:       { label: 'Oujda',        slug: 'oujda',        lat: 34.6805, lng: -1.9006,  pop: '490 000',      region: 'Oriental' },
  kenitra:     { label: 'Kénitra',      slug: 'kenitra',      lat: 34.2541, lng: -6.5891,  pop: '430 000',      region: 'Rabat-Salé-Kénitra' },
  tetouan:     { label: 'Tétouan',      slug: 'tetouan',      lat: 35.5785, lng: -5.3684,  pop: '380 000',      region: 'Tanger-Tétouan-Al Hoceïma' },
  sale:        { label: 'Salé',         slug: 'sale',         lat: 34.0372, lng: -6.7982,  pop: '900 000',      region: 'Rabat-Salé-Kénitra' },
  temara:      { label: 'Temara',       slug: 'temara',       lat: 33.9228, lng: -6.9076,  pop: '310 000',      region: 'Rabat-Salé-Kénitra' },
  'el-jadida': { label: 'El Jadida',    slug: 'el-jadida',    lat: 33.2549, lng: -8.5078,  pop: '200 000',      region: 'Casablanca-Settat' },
  'beni-mellal':{ label: 'Béni Mellal', slug: 'beni-mellal',  lat: 32.3373, lng: -6.3498,  pop: '220 000',      region: 'Béni Mellal-Khénifra' },
  nador:       { label: 'Nador',        slug: 'nador',        lat: 35.1681, lng: -2.9287,  pop: '180 000',      region: 'Oriental' },
  khouribga:   { label: 'Khouribga',    slug: 'khouribga',    lat: 32.8833, lng: -6.9167,  pop: '170 000',      region: 'Béni Mellal-Khénifra' },
  safi:        { label: 'Safi',         slug: 'safi',         lat: 32.2994, lng: -9.2372,  pop: '310 000',      region: 'Marrakech-Safi' },
  taza:        { label: 'Taza',         slug: 'taza',         lat: 34.2133, lng: -3.9989,  pop: '150 000',      region: 'Fès-Meknès' },
  ouarzazate:  { label: 'Ouarzazate',   slug: 'ouarzazate',   lat: 30.9189, lng: -6.8934,  pop: '90 000',       region: 'Drâa-Tafilalet' },
  mohammedia:  { label: 'Mohammedia',   slug: 'mohammedia',   lat: 33.6862, lng: -7.3835,  pop: '200 000',      region: 'Grand Casablanca-Settat' },
};

/* ═══════════════════════════════════════════════════════════
   PROBLEMS (1A)
══════════════════════════════════════════════════════════ */
const PROBLEMS = {
  'fuite-eau': {
    label: 'Fuite d\'eau',
    service_key: 'plombier',
    icon: '💧',
    meta_desc: (city) => `Fuite d'eau à ${city.label} ? Fixeo vous met en contact avec un plombier disponible immédiatement. Intervention rapide 24h/7, devis gratuit.`,
    h1: (city) => `Fuite d'eau à ${city.label} : intervention rapide`,
    intro_variants: [
      (city) => `Vous rentrez chez vous et découvrez une flaque d'eau dans le couloir — c'est une urgence. À ${city.label}, les fuites d'eau non traitées peuvent causer des dégâts considérables sur les structures et engendrer des litiges de copropriété coûteux. Fixeo vous connecte instantanément avec un plombier qualifié dans votre secteur de ${city.label}, disponible pour intervenir dans l'heure. Que la fuite provienne d'un joint défaillant, d'un tuyau fissuré ou d'un raccord endommagé, nos artisans vérifiés arrivent équipés pour diagnostiquer et réparer sur place.`,
      (city) => `Chaque année au Maroc, les fuites d'eau non détectées représentent des milliers de mètres cubes d'eau perdus — et des factures d'eau qui s'envolent. À ${city.label}, où le réseau de distribution présente parfois des variations de pression importantes, les canalisations intérieures sont particulièrement sollicitées. Fixeo met en relation les habitants de ${city.label} avec des plombiers locaux expérimentés, disponibles 24h/24. Décrivez votre problème en quelques secondes et un artisan vérifié vous contacte pour organiser l'intervention.`,
    ],
    blog_links: ['fuite-eau-mur', 'detection-fuite-eau-cachee', 'fuite-sous-evier'],
  },
  'wc-bouche': {
    label: 'WC bouché',
    service_key: 'plombier',
    icon: '🚽',
    meta_desc: (city) => `WC bouché à ${city.label} ? Plombier disponible maintenant via Fixeo. Débouchage rapide, intervention 24h/7. Appelez un artisan qualifié.`,
    h1: (city) => `WC bouché à ${city.label} : débouchage d'urgence`,
    intro_variants: [
      (city) => `Un WC bouché dans l'appartement, c'est invivable — surtout si vous habitez avec famille ou colocataires. À ${city.label}, Fixeo vous met en contact avec un plombier spécialisé en débouchage disponible dès maintenant. La plupart des obstructions (corps étranger, accumulation de calcaire, papier) se règlent en une visite grâce aux équipements de débouchage haute pression. Nos artisans couvrent tous les secteurs de ${city.label} et interviennent en priorité pour les urgences sanitaires.`,
      (city) => `Le débouchage de WC est l'une des interventions plomberie les plus fréquentes à ${city.label}. La qualité de l'eau locale et les canalisations dans certains immeubles anciens favorisent l'accumulation de tartre et le colmatage. Fixeo sélectionne des plombiers locaux équipés de furets électriques et de nettoyeurs haute pression pour résoudre même les obstructions tenaces. Service disponible 7j/7, y compris les jours fériés et en soirée.`,
    ],
    blog_links: ['wc-bouche-comment-deboucher', 'canalisation-bouchee'],
  },
  'chauffe-eau-en-panne': {
    label: 'Chauffe-eau en panne',
    service_key: 'plombier',
    icon: '🚿',
    meta_desc: (city) => `Chauffe-eau en panne à ${city.label} ? Dépannage urgent par un plombier Fixeo. Diagnostic, réparation ou remplacement. Disponible 24h/7.`,
    h1: (city) => `Chauffe-eau en panne à ${city.label} : dépannage urgent`,
    intro_variants: [
      (city) => `Plus d'eau chaude le matin à ${city.label} — une situation inconfortable qui mérite une intervention rapide. Les pannes de chauffe-eau peuvent avoir plusieurs origines : résistance grillée, thermostat défaillant, anode épuisée ou fuite interne. Fixeo vous connecte avec un technicien plomberie qualifié à ${city.label} capable de diagnostiquer votre appareil sur place. Selon le diagnostic, l'artisan pourra réparer votre chauffe-eau existant ou vous conseiller sur un remplacement adapté à votre logement.`,
      (city) => `À ${city.label}, les chauffe-eau électriques et à gaz subissent les effets du calcaire présent dans l'eau du robinet. Un entretien régulier prologe leur durée de vie de plusieurs années. Mais quand la panne survient, c'est une urgence du quotidien. Fixeo met en relation les habitants de ${city.label} avec des plombiers-chauffagistes locaux expérimentés dans tous les types d'appareils : Atlantic, Ariston, Chaffoteaux, et les modèles courants au Maroc.`,
    ],
    blog_links: ['chauffe-eau-fuit', 'installation-chauffe-eau-electrique', 'remplacement-cumulus-maroc'],
  },
  'porte-bloquee': {
    label: 'Porte bloquée',
    service_key: 'serrurier',
    icon: '🚪',
    meta_desc: (city) => `Porte bloquée à ${city.label} ? Serrurier disponible immédiatement via Fixeo. Ouverture sans dégât, intervention 24h/7. Appelez maintenant.`,
    h1: (city) => `Porte bloquée à ${city.label} : ouverture rapide`,
    intro_variants: [
      (city) => `Vous êtes bloqué devant votre porte à ${city.label} — une situation stressante, surtout la nuit ou avec des enfants. Fixeo vous met en contact avec un serrurier professionnel dans votre secteur de ${city.label} pour une ouverture de porte sans casse dans la grande majorité des cas. Nos artisans utilisent des techniques non destructives (crochetage, carte, décodage) avant d'envisager tout perçage. Disponibles 24h/24, 7j/7, ils interviennent en urgence dans tous les arrondissements.`,
      (city) => `Une porte qui claque, un mécanisme qui se bloque, une serrure multipoints qui refuse de s'ouvrir — ces situations surviennent à tout moment. À ${city.label}, Fixeo référence des serruriers locaux expérimentés dans l'ouverture de tous types de portes : appartements, villas, commerces, parkings souterrains. Nos artisans vérifiés signent un devis avant toute intervention et ne pratiquent pas de tarifs abusifs.`,
    ],
    blog_links: ['porte-claquee-comment-entrer', 'serrure-multipoints-bloquee'],
  },
  'serrure-cassee': {
    label: 'Serrure cassée',
    service_key: 'serrurier',
    icon: '🔐',
    meta_desc: (city) => `Serrure cassée à ${city.label} ? Serrurier professionnel disponible via Fixeo. Remplacement rapide, artisan vérifié. Intervention 24h/7.`,
    h1: (city) => `Serrure cassée à ${city.label} : remplacement urgent`,
    intro_variants: [
      (city) => `Une serrure cassée ou détériorée à ${city.label} compromet immédiatement la sécurité de votre logement ou local professionnel. Que le canon soit fracturé, le mécanisme endommagé ou la poignée arrachée — Fixeo vous met en relation avec un serrurier qualifié disponible maintenant. Nos artisans se déplacent avec un large stock de cylindres et mécanismes pour procéder au remplacement en une seule visite, sans deuxième rendez-vous.`,
      (city) => `Le remplacement d'une serrure à ${city.label} prend généralement 30 à 60 minutes pour un serrurier expérimenté. Mais choisir le bon artisan fait toute la différence : qualité du matériel installé, niveau de sécurité adapté, tarification transparente. Fixeo sélectionne des serruriers locaux qui travaillent avec des marques reconnues (ISEO, Yale, Vachette) et qui proposent des cylindres avec certification anti-effraction.`,
    ],
    blog_links: ['canon-serrure-casse', 'changer-serrure-appartement', 'cylindre-europeen-changer'],
  },
  'panne-electrique': {
    label: 'Panne électrique',
    service_key: 'electricien',
    icon: '⚡',
    meta_desc: (city) => `Panne électrique à ${city.label} ? Électricien disponible maintenant via Fixeo. Diagnostic rapide, intervention sûre. Service 24h/7.`,
    h1: (city) => `Panne électrique à ${city.label} : électricien disponible`,
    intro_variants: [
      (city) => `Une panne électrique à ${city.label} peut aller d'un simple disjoncteur déclenché à un court-circuit sérieux nécessitant une intervention d'urgence. Ne prenez pas de risques : l'électricité demande des interventions réalisées par des professionnels qualifiés. Fixeo vous connecte avec un électricien certifié dans votre secteur de ${city.label}, disponible 24h/24. Le technicien établit un diagnostic complet avant toute intervention pour identifier l'origine exacte de la panne.`,
      (city) => `Dans les immeubles et villas de ${city.label}, les pannes électriques surviennent souvent en soirée ou en période de forte chaleur (utilisation intensive des climatiseurs). Fixeo référence des électriciens locaux habitués aux installations en vigueur au Maroc, capables d'intervenir sur les tableaux ONE, les compteurs RADEEF et les systèmes domestiques standard.`,
    ],
    blog_links: ['disjoncteur-saute-souvent', 'court-circuit-maison', 'panne-tableau-electrique'],
  },
  'disjoncteur-saute': {
    label: 'Disjoncteur qui saute',
    service_key: 'electricien',
    icon: '🔌',
    meta_desc: (city) => `Disjoncteur qui saute à ${city.label} ? Électricien disponible via Fixeo pour diagnostic et réparation. Intervention rapide 24h/7.`,
    h1: (city) => `Disjoncteur qui saute à ${city.label} : diagnostic rapide`,
    intro_variants: [
      (city) => `Le disjoncteur saute dès que vous branchez un appareil à ${city.label} — c'est l'un des problèmes électriques les plus courants. Les causes sont multiples : surcharge de circuit, court-circuit, défaut d'isolement ou appareil défectueux. Un électricien qualifié peut identifier la cause en quelques minutes avec les bons instruments de mesure. Fixeo vous met en contact avec un technicien disponible dans votre quartier de ${city.label} pour résoudre le problème durablement, pas juste le remettre.`,
      (city) => `Un disjoncteur qui saute régulièrement à ${city.label} est souvent le symptôme d'une installation électrique sous-dimensionnée par rapport aux besoins actuels du foyer (climatiseurs, chauffe-eau, appareils électroménagers modernes). Fixeo connecte les habitants de ${city.label} avec des électriciens locaux qui peuvent évaluer la capacité de votre tableau et proposer des solutions adaptées : renforcement de circuit, ajout de disjoncteur différentiel, mise à la terre.`,
    ],
    blog_links: ['disjoncteur-saute-souvent', 'tableau-electrique-upgrade', 'court-circuit-maison'],
  },
  'climatisation-en-panne': {
    label: 'Climatisation en panne',
    service_key: 'climatisation',
    icon: '❄️',
    meta_desc: (city) => `Climatisation en panne à ${city.label} ? Technicien disponible maintenant via Fixeo. Diagnostic et réparation rapide. Service 24h/7.`,
    h1: (city) => `Climatisation en panne à ${city.label} : réparation urgente`,
    intro_variants: [
      (city) => `En plein été à ${city.label}, une climatisation en panne n'est pas un simple désagrément — c'est une urgence, surtout avec des enfants ou des personnes âgées. Fixeo vous met en contact avec un technicien climatisation disponible dans votre secteur pour diagnostiquer et réparer votre appareil rapidement. Les pannes courantes (manque de gaz, compresseur défaillant, carte électronique) sont prises en charge par nos artisans équipés des outils de diagnostic adaptés.`,
      (city) => `À ${city.label}, la chaleur estivale pousse les climatiseurs à leur limite et c'est souvent en juillet-août que les pannes surviennent. Les techniciens Fixeo connaissent les marques les plus répandues au Maroc : Chigo, Carrier, Daikin, Gree, Midea. Que ce soit pour une recharge en gaz réfrigérant, une réparation du circuit frigorifique ou un remplacement complet, trouvez un artisan disponible maintenant.`,
    ],
    blog_links: ['clim-ne-refroidit-plus', 'compresseur-clim-en-panne', 'recharge-gaz-climatisation'],
  },
};

/* ═══════════════════════════════════════════════════════════
   PRICE SERVICES (1B)
══════════════════════════════════════════════════════════ */
const PRICE_SERVICES = {
  plomberie: {
    label: 'Plomberie',
    label_adj: 'de plomberie',
    icon: '🔧',
    slug: 'plomberie',
    service_link: 'plombier',
    metier_label: 'plombier', article_genre: 'un', article_genre_long: 'un',
    factors: [
      { icon: '\u23F1\uFE0F', title: 'Type d\'intervention', desc: 'Un d\u00e9pannage simple est moins co\u00fbteux qu\'un remplacement de chauffe-eau.' },
      { icon: '\uD83C\uDF05', title: 'Horaire (urgence, nuit, week-end)', desc: 'Les interventions hors horaires normaux peuvent entra\u00eener une majoration. Son montant est communiqu\u00e9 par l\'artisan avant l\'intervention.' },
      { icon: '\uD83D\uDCCD', title: 'Distance et secteur', desc: 'Le d\u00e9placement peut \u00eatre inclus ou factur\u00e9 s\u00e9par\u00e9ment selon l\'artisan, la distance et le secteur. Le d\u00e9tail est confirm\u00e9 avant l\'intervention.' },
      { icon: '\u2699\uFE0F', title: 'Complexit\u00e9 technique', desc: 'L\'acc\u00e8s difficile ou les anciens conduits augmentent le co\u00fbt.' },
      { icon: '\uD83E\uDDF0', title: 'Fournitures', desc: 'Certaines interventions incluent les fournitures, d\'autres non. Le d\u00e9tail est confirm\u00e9 avant l\'intervention.' },
    ],
    tiers: [
      { label: 'Déplacement + diagnostic', range: '150 – 250 MAD' },
      { label: 'Intervention simple (joint, robinet)', range: '300 – 600 MAD' },
      { label: 'Débouchage canalisation', range: '350 – 700 MAD' },
      { label: 'Dépannage urgence (fuite active)', range: '500 – 900 MAD' },
      { label: 'Remplacement chauffe-eau', range: '600 – 1 500 MAD (main-d\'œuvre)' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif indicatif d\'un plombier à ${city.label} ?`, a: `Le tarif d\'un plombier à ${city.label} varie selon la nature de l\'intervention. Une réparation courante (joint, robinet) se situe entre 300 et 600 MAD. Pour une urgence (fuite active), les tarifs sont généralement plus élevés. Le tarif définitif est confirmé par l\'artisan avant toute intervention.` },
      { q: `Comment est confirmé le tarif définitif à ${city.label} ?`, a: `Le tarif définitif est établi par l\'artisan après évaluation de votre situation. Il vous est communiqué avant toute intervention. Vous n\'avez aucune obligation d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.` },
      { q: 'Le déplacement est-il facturé en plus ?', a: 'Le déplacement peut être inclus ou facturé séparément selon l\'artisan, la distance et le secteur. Le détail est confirmé avant l\'intervention dans le devis communiqué par l\'artisan.' },
      { q: 'Y a-t-il une majoration pour une intervention urgente, de nuit ou le week-end ?', a: 'Une intervention urgente, de nuit ou le week-end peut entraîner une majoration. Son montant est communiqué par l\'artisan avant l\'intervention.' },
      { q: 'Quand s\'effectue le paiement ?', a: 'Le paiement s\'effectue après l\'intervention, jamais en avance complète. Aucun paiement anticipé n\'est demandé. Le montant définitif est confirmé par l\'artisan avant le début des travaux.' },
    ]
  },
  electricite: {
    label: 'Électricité',
    label_adj: 'd\'électricité',
    icon: '⚡',
    slug: 'electricite',
    service_link: 'electricien',
    metier_label: '\u00e9lectricien', article_genre: 'un', article_genre_long: 'un',
    factors: [
      { icon: '\uD83D\uDD0C', title: 'Type de travaux', desc: 'Un remplacement de prise co\u00fbte bien moins qu\'une mise \u00e0 niveau du tableau \u00e9lectrique.' },
      { icon: '\uD83C\uDF05', title: 'Urgence et horaire', desc: 'Les pannes nocturnes ou en week-end peuvent entra\u00eener une majoration. Son montant est communiqu\u00e9 par l\'artisan avant l\'intervention.' },
      { icon: '\uD83D\uDCCD', title: 'Complexit\u00e9 de l\'installation', desc: 'Un logement ancien n\u00e9cessite souvent plus de travail et de mat\u00e9riel.' },
      { icon: '\u2699\uFE0F', title: 'Fournitures', desc: 'Prises, disjoncteurs et c\u00e2bles sont souvent factur\u00e9s en sus.' },
      { icon: '\uD83D\uDCCB', title: 'Diagnostic pr\u00e9alable', desc: 'Le co\u00fbt du diagnostic est g\u00e9n\u00e9ralement d\u00e9ductible si les travaux sont confi\u00e9s.' },
    ],
    tiers: [
      { label: 'Déplacement + diagnostic', range: '200 – 300 MAD' },
      { label: 'Installation prise électrique', range: '250 – 450 MAD' },
      { label: 'Remplacement interrupteur/prise', range: '150 – 350 MAD' },
      { label: 'Diagnostic tableau électrique', range: '300 – 600 MAD' },
      { label: 'Mise à niveau tableau (câblage)', range: '800 – 2 000 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif indicatif d\'un électricien à ${city.label} ?`, a: `Le tarif d\'un électricien à ${city.label} varie selon la nature des travaux. Le remplacement d\'une prise ou d\'un interrupteur est généralement moins coûteux qu\'une mise à niveau du tableau électrique. Le tarif définitif est confirmé par l\'artisan avant toute intervention.` },
      { q: `Comment est confirmé le tarif définitif à ${city.label} ?`, a: `Le tarif définitif est établi par l\'artisan après évaluation de votre situation. Il vous est communiqué avant toute intervention. Vous n\'avez aucune obligation d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.` },
      { q: 'Le déplacement est-il facturé en plus ?', a: 'Le déplacement peut être inclus ou facturé séparément selon l\'artisan, la distance et le secteur. Le détail est confirmé avant l\'intervention dans le devis communiqué par l\'artisan.' },
      { q: 'Y a-t-il une majoration pour une intervention urgente, de nuit ou le week-end ?', a: 'Une intervention urgente, de nuit ou le week-end peut entraîner une majoration. Son montant est communiqué par l\'artisan avant l\'intervention.' },
      { q: 'Quand s\'effectue le paiement ?', a: 'Le paiement s\'effectue après l\'intervention, jamais en avance complète. Aucun paiement anticipé n\'est demandé. Le montant définitif est confirmé par l\'artisan avant le début des travaux.' },
    ]
  },
  serrurerie: {
    label: 'Serrurerie',
    label_adj: 'de serrurerie',
    icon: '🔐',
    slug: 'serrurerie',
    service_link: 'serrurier',
    metier_label: 'serrurier', article_genre: 'un', article_genre_long: 'un',
    factors: [
      { icon: '\uD83D\uDD11', title: 'Type d\'intervention', desc: 'L\'ouverture sans casse est moins on\u00e9reuse que le remplacement d\'une serrure multipoints.' },
      { icon: '\u23F0', title: 'Urgence', desc: 'Une porte claqu\u00e9e en urgence nocturne entra\u00eene une majoration significative.' },
      { icon: '\uD83D\uDEAA', title: 'Type de serrure', desc: 'Une serrure 3 points ou blind\u00e9e est plus co\u00fbteuse \u00e0 installer.' },
      { icon: '\uD83D\uDCCD', title: 'D\u00e9placement', desc: 'Les serruriers proches facturent moins de frais de d\u00e9placement.' },
      { icon: '\uD83D\uDCB0', title: 'Fourniture', desc: 'Le cylindre ou la serrure remplac\u00e9(e) est souvent factur\u00e9(e) en plus.' },
    ],
    tiers: [
      { label: 'Ouverture de porte (sans casse)', range: '300 – 600 MAD' },
      { label: 'Ouverture de porte (avec perçage)', range: '500 – 900 MAD' },
      { label: 'Remplacement cylindre simple', range: '400 – 800 MAD' },
      { label: 'Serrure 3 points / multipoints', range: '800 – 2 000 MAD' },
      { label: 'Blindage / sécurisation porte', range: '1 500 – 5 000 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif indicatif d\'un serrurier à ${city.label} ?`, a: `Le tarif d\'un serrurier à ${city.label} dépend du type d\'intervention. Une ouverture de porte sans casse coûte généralement entre 300 et 600 MAD. Le remplacement d\'un cylindre ou d\'une serrure multipoints est plus onéreux. Le tarif définitif est confirmé par l\'artisan avant toute intervention.` },
      { q: `Comment est confirmé le tarif définitif à ${city.label} ?`, a: `Le tarif définitif est établi par l\'artisan après évaluation de votre situation. Il vous est communiqué avant toute intervention. Vous n\'avez aucune obligation d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.` },
      { q: 'Le déplacement est-il facturé en plus ?', a: 'Le déplacement peut être inclus ou facturé séparément selon l\'artisan, la distance et le secteur. Le détail est confirmé avant l\'intervention dans le devis communiqué par l\'artisan.' },
      { q: 'Y a-t-il une majoration pour une intervention urgente, de nuit ou le week-end ?', a: 'Une intervention urgente, de nuit ou le week-end peut entraîner une majoration. Son montant est communiqué par l\'artisan avant l\'intervention.' },
      { q: 'Quand s\'effectue le paiement ?', a: 'Le paiement s\'effectue après l\'intervention, jamais en avance complète. Aucun paiement anticipé n\'est demandé. Le montant définitif est confirmé par l\'artisan avant le début des travaux.' },
    ]
  },
  climatisation: {
    label: 'Climatisation',
    label_adj: 'de climatisation',
    icon: '❄️',
    slug: 'climatisation',
    service_link: 'climatisation',
    metier_label: 'technicien climatisation', article_genre: 'un', article_genre_long: 'un',
    factors: [
      { icon: '\uD83D\uDCE6', title: 'Puissance de l\'appareil', desc: 'Un split 9\u202F000 BTU co\u00fbte moins \u00e0 installer qu\'un 24\u202F000 BTU.' },
      { icon: '\uD83C\uDFE0', title: 'Type d\'installation', desc: 'La longueur de la liaison frigorifique et la difficult\u00e9 de passage influencent le co\u00fbt.' },
      { icon: '\uD83E\uDDFB', title: 'Gaz r\u00e9frig\u00e9rant', desc: 'Le gaz R32 est plus courant que le R410A. Le prix varie selon la r\u00e9serve disponible.' },
      { icon: '\uD83D\uDCC5', title: 'Entretien vs remplacement', desc: 'Un entretien annuel est bien moins on\u00e9reux qu\'un remplacement de compresseur.' },
      { icon: '\uD83C\uDF05', title: 'Saisonnalit\u00e9', desc: 'La demande en \u00e9t\u00e9 peut allonger les d\u00e9lais et augmenter les tarifs.' },
    ],
    tiers: [
      { label: 'Installation split (1 unité)', range: '2 000 – 6 000 MAD' },
      { label: 'Entretien annuel (nettoyage + vérification)', range: '400 – 800 MAD' },
      { label: 'Recharge gaz réfrigérant', range: '600 – 1 200 MAD' },
      { label: 'Diagnostic panne (déplacement inclus)', range: '300 – 500 MAD' },
      { label: 'Remplacement compresseur', range: '1 500 – 4 000 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif indicatif d\'un technicien climatisation à ${city.label} ?`, a: `Le coût d\'une installation ou d\'un entretien de climatisation à ${city.label} dépend de la puissance de l\'appareil et de la complexité de l\'installation. Un entretien courant est généralement moins coûteux qu\'une installation complète. Le tarif définitif est confirmé par l\'artisan avant toute intervention.` },
      { q: `Comment est confirmé le tarif définitif à ${city.label} ?`, a: `Le tarif définitif est établi par l\'artisan après évaluation de votre situation. Il vous est communiqué avant toute intervention. Vous n\'avez aucune obligation d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.` },
      { q: 'Le déplacement est-il facturé en plus ?', a: 'Le déplacement peut être inclus ou facturé séparément selon l\'artisan, la distance et le secteur. Le détail est confirmé avant l\'intervention dans le devis communiqué par l\'artisan.' },
      { q: 'Y a-t-il une majoration pour une intervention urgente, de nuit ou le week-end ?', a: 'Une intervention urgente, de nuit ou le week-end peut entraîner une majoration. Son montant est communiqué par l\'artisan avant l\'intervention.' },
      { q: 'Quand s\'effectue le paiement ?', a: 'Le paiement s\'effectue après l\'intervention, jamais en avance complète. Aucun paiement anticipé n\'est demandé. Le montant définitif est confirmé par l\'artisan avant le début des travaux.' },
    ]
  },
  peinture: {
    label: 'Peinture',
    label_adj: 'de peinture',
    icon: '🎨',
    slug: 'peinture',
    service_link: 'peintre',
    metier_label: 'peintre', article_genre: 'un', article_genre_long: 'un',
    factors: [
      { icon: '\uD83D\uDCCF', title: 'Surface (m\u00b2)', desc: 'Le co\u00fbt total est proportionnel \u00e0 la surface. Le prix au m\u00b2 peut diminuer sur les grands chantiers.' },
      { icon: '\uD83D\uDEE0\uFE0F', title: 'Pr\u00e9paration des surfaces', desc: 'Rebouchage, pon\u00e7age et sous-couche augmentent le temps et le co\u00fbt.' },
      { icon: '\uD83C\uDFA8', title: 'Type de peinture', desc: 'Standard, lessivable, anti-humidit\u00e9, d\u00e9corative\u00a0: chaque type a un co\u00fbt diff\u00e9rent.' },
      { icon: '\uD83C\uDFE1', title: 'Fa\u00e7ade ou int\u00e9rieur', desc: 'La peinture ext\u00e9rieure (\u00e9chafaudage, UV) co\u00fbte plus cher au m\u00b2.' },
      { icon: '\uD83D\uDCC5', title: 'Saisonnalit\u00e9 et d\u00e9lais', desc: 'En haute saison, les d\u00e9lais peuvent \u00eatre plus longs.' },
    ],
    tiers: [
      { label: 'Mur intérieur (par m²)', range: '35 – 70 MAD/m²' },
      { label: 'Façade extérieure (par m²)', range: '50 – 100 MAD/m²' },
      { label: 'Plafond (par m²)', range: '40 – 80 MAD/m²' },
      { label: 'Finitions et retouches (par m²)', range: '25 – 50 MAD/m²' },
      { label: 'Pièce complète (20 m²)', range: '1 400 – 2 800 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif indicatif d\'un peintre à ${city.label} ?`, a: `Le tarif d\'un peintre à ${city.label} varie selon la surface, le type de peinture et l\'état des murs. La préparation des surfaces (rebouchage, ponçage) peut augmenter le coût. Le tarif définitif au m² est confirmé par l\'artisan avant toute intervention.` },
      { q: `Comment est confirmé le tarif définitif à ${city.label} ?`, a: `Le tarif définitif est établi par l\'artisan après évaluation de votre situation. Il vous est communiqué avant toute intervention. Vous n\'avez aucune obligation d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.` },
      { q: 'Le déplacement est-il facturé en plus ?', a: 'Le déplacement peut être inclus ou facturé séparément selon l\'artisan, la distance et le secteur. Le détail est confirmé avant l\'intervention dans le devis communiqué par l\'artisan.' },
      { q: 'Y a-t-il une majoration pour une intervention urgente, de nuit ou le week-end ?', a: 'Une intervention urgente, de nuit ou le week-end peut entraîner une majoration. Son montant est communiqué par l\'artisan avant l\'intervention.' },
      { q: 'Quand s\'effectue le paiement ?', a: 'Le paiement s\'effectue après l\'intervention, jamais en avance complète. Aucun paiement anticipé n\'est demandé. Le montant définitif est confirmé par l\'artisan avant le début des travaux.' },
    ]
  },
  menuiserie: {
    label: 'Menuiserie',
    label_adj: 'de menuiserie',
    icon: '🪵',
    slug: 'menuiserie',
    service_link: null,
    metier_label: 'menuisier', article_genre: 'un', article_genre_long: 'un',
    factors: [
      { icon: '\uD83E\uDEB5', title: 'Mat\u00e9riau', desc: 'Aluminium, bois massif et MDF ont des co\u00fbts tr\u00e8s diff\u00e9rents.' },
      { icon: '\uD83D\uDCCF', title: 'Dimensions et sur-mesure', desc: 'Un \u00e9l\u00e9ment sur mesure co\u00fbte plus qu\'un standard.' },
      { icon: '\uD83D\uDD12', title: 'Type de fermeture', desc: 'Serrure simple, multipoints ou \u00e9lectrique\u00a0: le niveau de s\u00e9curit\u00e9 influe sur le prix.' },
      { icon: '\uD83D\uDEE0\uFE0F', title: 'Complexit\u00e9 de pose', desc: 'D\u00e9montage, ajustement, reprise de peinture augmentent le co\u00fbt.' },
      { icon: '\uD83D\uDCB0', title: 'Fourniture incluse', desc: 'Certains menuisiers fournissent le mat\u00e9riau\u00a0; d\'autres posent uniquement.' },
    ],
    tiers: [
      { label: 'Porte intérieure (pose)', range: '800 – 2 500 MAD' },
      { label: 'Fenêtre aluminium (pose + fourniture)', range: '1 500 – 4 000 MAD' },
      { label: 'Placard sur mesure (par mètre linéaire)', range: '2 000 – 5 000 MAD' },
      { label: 'Cuisine sur mesure (main-d\'œuvre)', range: '8 000 – 25 000 MAD' },
      { label: 'Réparation porte/fenêtre', range: '300 – 800 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif indicatif d\'un menuisier à ${city.label} ?`, a: `Le tarif d\'un menuisier à ${city.label} varie selon le matériau (aluminium, bois, MDF), les dimensions et la complexité de la pose. Le sur-mesure est plus onéreux qu\'un élément standard. Le tarif définitif est confirmé par l\'artisan avant toute intervention.` },
      { q: `Comment est confirmé le tarif définitif à ${city.label} ?`, a: `Le tarif définitif est établi par l\'artisan après évaluation de votre situation. Il vous est communiqué avant toute intervention. Vous n\'avez aucune obligation d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.` },
      { q: 'Le déplacement est-il facturé en plus ?', a: 'Le déplacement peut être inclus ou facturé séparément selon l\'artisan, la distance et le secteur. Le détail est confirmé avant l\'intervention dans le devis communiqué par l\'artisan.' },
      { q: 'Y a-t-il une majoration pour une intervention urgente, de nuit ou le week-end ?', a: 'Une intervention urgente, de nuit ou le week-end peut entraîner une majoration. Son montant est communiqué par l\'artisan avant l\'intervention.' },
      { q: 'Quand s\'effectue le paiement ?', a: 'Le paiement s\'effectue après l\'intervention, jamais en avance complète. Aucun paiement anticipé n\'est demandé. Le montant définitif est confirmé par l\'artisan avant le début des travaux.' },
    ]
  },
};
const _SVC_CATS = { plomberie:'Plomberie', electricite:'\u00c9lectricit\u00e9', serrurerie:'Serrurerie', climatisation:'Climatisation', peinture:'Peinture', menuiserie:'Menuiserie' };


/* ═══════════════════════════════════════════════════════════
   QUARTIERS (1C)
══════════════════════════════════════════════════════════ */
var QUARTIERS = {
  casablanca: ['maarif','ain-diab','hay-hassani','sidi-maarouf','bourgogne','ain-sebaa','hay-mohammadi','bouskoura'],
  rabat:      ['agdal','hay-riad','souissi','ocean','hassan','akkari','youssoufia'],
  fes:        ['saiss','narjiss','ville-nouvelle','medina','les-orangers','bensouda'],
  marrakech:  ['gueliz','hivernage','menara','amelkis','targa','sidi-ghanem'],
  tanger:     ['malabata','iberia','beni-makada','merkala','val-fleuri'],
  agadir:     ['talborjt','hay-mohammadi','dakhla','secteur-balneare','founty'],
};

const QUARTIER_LABELS = {
  'maarif': 'Maarif', 'ain-diab': 'Aïn Diab', 'hay-hassani': 'Hay Hassani',
  'sidi-maarouf': 'Sidi Maarouf', 'bourgogne': 'Bourgogne', 'ain-sebaa': 'Aïn Sebaâ',
  'hay-mohammadi': 'Hay Mohammadi', 'bouskoura': 'Bouskoura',
  'agdal': 'Agdal', 'hay-riad': 'Hay Riad', 'souissi': 'Souissi',
  'ocean': 'Océan', 'hassan': 'Hassan', 'akkari': 'Akkari', 'youssoufia': 'Youssoufia',
  'saiss': 'Saïss', 'narjiss': 'Narjiss', 'ville-nouvelle': 'Ville Nouvelle',
  'medina': 'Médina', 'les-orangers': 'Les Orangers', 'bensouda': 'Bensouda',
  'gueliz': 'Guéliz', 'hivernage': 'Hivernage', 'menara': 'Menara',
  'amelkis': 'Amelkis', 'targa': 'Targa', 'sidi-ghanem': 'Sidi Ghanem',
  'malabata': 'Malabata', 'iberia': 'Ibéria', 'beni-makada': 'Béni Makada',
  'merkala': 'Merkala', 'val-fleuri': 'Val Fleuri',
  'talborjt': 'Talborjt', 'dakhla': 'Dakhla',
  'secteur-balneare': 'Secteur Balnéaire', 'founty': 'Founty',
};

const QUARTIER_SERVICES = {
  plombier: {
    label: 'Plombier', label_lower: 'plombier',
    url_prefix: 'plombier',
    file_prefix: 'plombier',
    service_link_key: 'plombier',
    desc: (q, city) => `plomberie — fuite d'eau, débouchage, chauffe-eau — dans le quartier ${q} à ${city}`,
  },
  electricite: {
    label: 'Électricien', label_lower: 'électricien',
    url_prefix: 'electricien',
    file_prefix: 'electricite',
    service_link_key: 'electricien',
    desc: (q, city) => `électricité — panne, disjoncteur, installation — dans le quartier ${q} à ${city}`,
  },
  serrurerie: {
    label: 'Serrurier', label_lower: 'serrurier',
    url_prefix: 'serrurier',
    file_prefix: 'serrurerie',
    service_link_key: 'serrurier',
    desc: (q, city) => `serrurerie — ouverture de porte, serrure, sécurité — dans le quartier ${q} à ${city}`,
  },
};

/* ═══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function navHTML() {
  return `<nav class="navbar" role="navigation" aria-label="Navigation principale">
    <a href="/index.html" class="navbar-brand logo-wrap" aria-label="Fixeo — Accueil">
      <img src="/img/logo.png" alt="Fixeo" class="fixeo-logo-img" width="120" height="32">
    </a>
    <div class="nav-links">
      <a href="/index.html" class="nav-link">Accueil</a>
      <a href="/services.html" class="nav-link">Services</a>
      <a href="/blog-index.html" class="nav-link">Blog</a>
      <a href="/auth.html" class="btn-nav btn-nav-outline" data-auth="guest">Connexion</a>
    </div>
  </nav>`;
}

function footerHTML() {
  return `<footer class="seo-footer">
    <div class="seo-footer-inner">
      <div class="footer-brand">
        <a href="/index.html"><img src="/img/logo.png" alt="Fixeo" height="28"></a>
        <p>La plateforme de mise en relation avec des artisans vérifiés au Maroc.</p>
      </div>
      <div class="footer-links">
        <h4>Services</h4>
        <a href="/plombier/casablanca">Plombier Casablanca</a>
        <a href="/electricien/rabat">Électricien Rabat</a>
        <a href="/serrurier/marrakech">Serrurier Marrakech</a>
        <a href="/climatisation/agadir">Climatisation Agadir</a>
      </div>
      <div class="footer-links">
        <h4>Fixeo</h4>
        <a href="/a-propos">À propos</a>
        <a href="/comment-ca-marche">Comment ça marche</a>
        <a href="/nos-garanties">Nos garanties</a>
        <a href="/verification-artisans">Vérification artisans</a>
        <a href="/suivi">Suivi de mission</a>
        <a href="/blog-index.html">Blog</a>
      </div>
      <div class="footer-links">
        <h4>Légal</h4>
        <a href="/cgu.html">CGU</a>
        <a href="/confidentialite.html">Confidentialité</a>
        <a href="/contact.html">Contact</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 Fixeo — Tous droits réservés · <a href="https://fixeo.ma">fixeo.ma</a></p>
    </div>
  </footer>`;
}

/* ═══════════════════════════════════════════════════════════
   1A — PROBLEM PAGES
══════════════════════════════════════════════════════════ */
function generateProblemPages() {
  let count = 0;
  const urls = [];

  for (const [probKey, prob] of Object.entries(PROBLEMS)) {
    for (const [cityKey, city] of Object.entries(CITIES)) {
      const filename = `problem-${probKey}-${city.slug}.html`;
      const canonicalPath = `/${probKey}/${city.slug}`;
      const canonicalUrl = `https://www.fixeo.ma${canonicalPath}`;
      const title = esc(`${prob.label} à ${city.label} — Artisan disponible maintenant | Fixeo`);
      const metaDesc = esc(prob.meta_desc(city));
      const h1 = esc(prob.h1(city));
      const varIdx = count % prob.intro_variants.length;
      const intro = esc(prob.intro_variants[varIdx](city));

      // Service LP link
      const serviceLink = `/${prob.service_key}/${city.slug}`;
      const serviceLinkLabel = prob.service_key === 'plombier' ? `Plombier à ${city.label}` :
                               prob.service_key === 'electricien' ? `Électricien à ${city.label}` :
                               prob.service_key === 'serrurier' ? `Serrurier à ${city.label}` :
                               `Climatisation à ${city.label}`;

      // Blog internal links
      const blogLinksHtml = (prob.blog_links || []).slice(0,2).map(slug =>
        `<a href="/blog/${slug}" class="internal-link">→ Lire l'article : ${slug.replace(/-/g,' ')}</a>`
      ).join('\n              ');

      const localBusinessLD = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "Fixeo",
        "url": "https://www.fixeo.ma",
        "logo": "https://www.fixeo.ma/img/logo.png",
        "description": `Artisans disponibles pour ${prob.label} à ${city.label}`,
        "areaServed": { "@type": "City", "name": city.label },
        "address": { "@type": "PostalAddress", "addressLocality": city.label, "addressCountry": "MA" },
        "geo": { "@type": "GeoCoordinates", "latitude": city.lat, "longitude": city.lng }
      };

      const breadcrumbLD = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Fixeo", "item": "https://www.fixeo.ma" },
          { "@type": "ListItem", "position": 2, "name": prob.label, "item": `https://www.fixeo.ma/${probKey}` },
          { "@type": "ListItem", "position": 3, "name": city.label, "item": canonicalUrl }
        ]
      };

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-pseo-v2a">
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${canonicalUrl}">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <!-- Twitter -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDesc}">
  <!-- Schema.org -->
  <script type="application/ld+json">${JSON.stringify(localBusinessLD)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/seo-lp-v1.css">
  <link rel="stylesheet" href="/css/seo-pages-fixeo-ui.css">
  <link rel="icon" href="/img/favicon.png" type="image/png">
  <style>
    .problem-steps{display:flex;gap:1.5rem;flex-wrap:wrap;margin:2rem 0}
    .problem-step{flex:1;min-width:180px;background:rgba(255,255,255,.06);border-radius:12px;padding:1.5rem;text-align:center}
    .problem-step .step-num{font-size:2rem;margin-bottom:.5rem}
    .urgency-box{background:linear-gradient(135deg,rgba(239,68,68,.15),rgba(234,179,8,.1));border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:1.5rem 2rem;margin:2rem 0}
    .service-link-box{background:rgba(255,255,255,.05);border-left:3px solid #f59e0b;padding:1rem 1.5rem;margin:1.5rem 0;border-radius:0 8px 8px 0}
    .internal-link{display:block;color:#93c5fd;margin:.3rem 0;font-size:.9rem}
    .problem-icon{font-size:3rem;margin-bottom:1rem;display:block}
  </style>
</head>
<body class="seo-service-page" data-theme="dark">
  <div class="bg-animated seo-bg"></div>
  <a href="#main-content" class="skip-link">Aller au contenu</a>
  ${navHTML()}
  <main id="main-content">
    <div class="seo-page-wrap">
      <section class="seo-hero seo-city-hero">
        <nav class="seo-breadcrumbs" aria-label="Fil d'Ariane">
          <a href="/">Accueil</a> <span>›</span>
          <a href="/${probKey}">${esc(prob.label)}</a> <span>›</span>
          <span>${esc(city.label)}</span>
        </nav>
        <span class="problem-icon">${prob.icon}</span>
        <h1>${h1}</h1>
        <p class="seo-lead">${intro}</p>
        <div class="seo-actions">
          <a class="seo-btn-link primary" href="/index.html#services" onclick="window.localStorage.setItem('fixeo_open_modal','1')">
            Trouver un artisan maintenant
          </a>
        </div>
      </section>

      <section class="seo-section">
        <h2>Comment ça marche ?</h2>
        <div class="problem-steps">
          <div class="problem-step">
            <div class="step-num">1️⃣</div>
            <h3>Décrivez</h3>
            <p>Décrivez votre problème en quelques mots — type de panne, adresse à ${esc(city.label)}, urgence ou non.</p>
          </div>
          <div class="problem-step">
            <div class="step-num">2️⃣</div>
            <h3>Fixeo dispatch</h3>
            <p>Notre moteur de dispatch identifie l'artisan disponible le plus proche de votre adresse à ${esc(city.label)}.</p>
          </div>
          <div class="problem-step">
            <div class="step-num">3️⃣</div>
            <h3>Artisan arrive</h3>
            <p>L'artisan vous contacte, confirme le devis et intervient. Paiement après intervention uniquement.</p>
          </div>
        </div>
      </section>

      <section class="seo-section">
        <div class="urgency-box">
          <h2>🕐 Disponible 24h/7 à ${esc(city.label)}</h2>
          <p>Nos artisans couvrent ${esc(city.label)} et ses environs 7 jours sur 7, 24 heures sur 24, y compris les jours fériés. Le délai d'intervention dépend de la disponibilité de l'artisan et du secteur.</p>
          <a class="seo-btn-link primary" href="/index.html#services" onclick="window.localStorage.setItem('fixeo_open_modal','1')">
            Demander une intervention maintenant →
          </a>
        </div>
      </section>

      <section class="seo-section">
        <h2>Service lié à votre problème</h2>
        <div class="service-link-box">
          <p>Pour ce type d'intervention, consultez notre page dédiée :</p>
          <a href="${serviceLink}" class="seo-btn-link secondary" style="display:inline-block;margin-top:.5rem">${esc(serviceLinkLabel)} →</a>
        </div>
        ${blogLinksHtml ? `<div style="margin-top:1rem"><h3 style="font-size:1rem;color:#94a3b8;margin-bottom:.5rem">Articles utiles :</h3>${blogLinksHtml}</div>` : ''}
      </section>

      <section class="seo-section">
        <h2>Pourquoi Fixeo ?</h2>
        <div class="problem-steps">
          <div class="problem-step">
            <div class="step-num">✅</div>
            <h3>Artisans vérifiés</h3>
            <p>Les artisans sont référencés et évalués sur FIXEO.</p>
          </div>
          <div class="problem-step">
            <div class="step-num">💰</div>
            <h3>Devis avant intervention</h3>
            <p>Vous recevez un devis clair avant le début des travaux. Pas de surprise sur la facture.</p>
          </div>
          <div class="problem-step">
            <div class="step-num">🛡️</div>
            <h3>Paiement sécurisé</h3>
            <p>Paiement après intervention.</p>
          </div>
        </div>
      </section>
    </div>
  </main>
  ${footerHTML()}
</body>
</html>`;

      const filepath = path.join(ROOT, filename);
      fs.writeFileSync(filepath, html, 'utf8');
      urls.push(canonicalPath);
      count++;
    }
  }
  console.log(`✅ 1A Problem pages: ${count} generated`);
  return urls;
}

/* ═══════════════════════════════════════════════════════════
   1B — PRICE PAGES (FLAGSHIP — fxprice-v1)
   Template: prix-plomberie-oujda.html (canonical golden reference)
══════════════════════════════════════════════════════════ */
function generatePricePages() {
  let count = 0;
  const urls = [];

  for (const [svcKey, svc] of Object.entries(PRICE_SERVICES)) {
    for (const [cityKey, city] of Object.entries(CITIES)) {
      const filename      = `prix-${svcKey}-${city.slug}.html`;
      const canonicalPath = `/prix/${svcKey}/${city.slug}`;
      const canonicalUrl  = `https://www.fixeo.ma${canonicalPath}`;
      const title    = esc(`Combien co\u00fbte un ${svc.metier_label} \u00e0 ${city.label} ? Tarifs 2026 | Fixeo`);
      const metaDesc = esc(`Tarifs ${svc.label_adj} \u00e0 ${city.label} en 2026 : fourchettes indicatives et facteurs de co\u00fbt. Paiement apr\u00e8s intervention. Tarif confirm\u00e9 avec l'artisan.`);
      const h1       = esc(`Combien co\u00fbte un ${svc.metier_label} \u00e0 ${city.label}\u00a0?`);
      const faqItems = svc.faq(city);
      const svcCat   = _SVC_CATS[svcKey] || svcKey.slice(0,6);

      const priceCardsHtml = svc.tiers.map((t, i) => {
        const isUrgent = !!t.urgent;
        const isWide   = !isUrgent && svc.tiers.length % 2 !== 0 && i === svc.tiers.length - 1;
        return `
          <div class="fxlp-price-card${isUrgent ? ' fxlp-price-card--urgent' : ''}${isWide ? ' fxlp-price-card--wide' : ''}">
            ${isUrgent ? '<span class="fxlp-urgent-chip">\u26a1 Urgence</span>' : ''}
            <span class="fxlp-pc-icon" aria-hidden="true">${t.icon || svc.icon}</span>
            <div class="fxlp-pc-name">${esc(t.label)}</div>
            <div class="fxlp-pc-price">${esc(t.range)}</div>
            ${t.note ? `<div class="fxlp-pc-note">${esc(t.note)}</div>` : ''}
          </div>`;
      }).join('\n');

      const factorsHtml = svc.factors.map(f => `
          <div class="fxlp-factor-row">
            <span class="fxlp-factor-icon" aria-hidden="true">${f.icon}</span>
            <div>
              <span class="fxlp-factor-title">${esc(f.title)}</span>
              <p class="fxlp-factor-desc">${esc(f.desc)}</p>
            </div>
          </div>`).join('\n');

      const faqHtml = faqItems.map(f => `
          <details class="fxlp-faq-item">
            <summary class="fxlp-faq-summary">
              ${esc(f.q)}
              <span class="fxlp-faq-chevron" aria-hidden="true">\u203a</span>
            </summary>
            <div class="fxlp-faq-answer">${esc(f.a)}</div>
          </details>`).join('\n');

      const faqLD = { "@context":"https://schema.org","@type":"FAQPage",
        "mainEntity": faqItems.map(f=>({ "@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a} })) };
      const breadcrumbLD = { "@context":"https://schema.org","@type":"BreadcrumbList",
        "itemListElement":[
          {"@type":"ListItem","position":1,"name":"Accueil","item":"https://www.fixeo.ma/"},
          {"@type":"ListItem","position":2,"name":"Tarifs","item":"https://www.fixeo.ma/prix"},
          {"@type":"ListItem","position":3,"name":svc.label,"item":`https://www.fixeo.ma/prix/${svcKey}`},
          {"@type":"ListItem","position":4,"name":city.label,"item":canonicalUrl}
        ] };
      const localBusinessLD = { "@context":"https://schema.org","@type":"LocalBusiness",
        "@id":`${canonicalUrl}#localbusiness`,
        "name":`Fixeo \u2014 ${svc.label} \u00e0 ${city.label}`,
        "description":`Tarifs ${svc.label_adj} \u00e0 ${city.label}. Paiement apr\u00e8s intervention.`,
        "url":canonicalUrl,"image":"https://www.fixeo.ma/img/logo.png",
        "areaServed":{"@type":"City","name":city.label,"containedInPlace":{"@type":"Country","name":"Maroc"}},
        "address":{"@type":"PostalAddress","addressLocality":city.label,"addressCountry":"MA"},
        "geo":{"@type":"GeoCoordinates","latitude":city.lat,"longitude":city.lng},
        "provider":{"@type":"Organization","name":"Fixeo","url":"https://www.fixeo.ma/"} };

      const serviceLinkHtml = svc.service_link
        ? `<a href="/${svc.service_link}/${city.slug}">${esc(svc.metier_label)} \u00e0 ${esc(city.label)}</a><span aria-hidden="true">\u00b7</span>`
        : '';

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-pseo-v2b-flagship">
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDesc}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  <script type="application/ld+json">${JSON.stringify(localBusinessLD)}</script>
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
  <link rel="stylesheet" href="/css/fixeo-local-flagship-v1.css?v=fxlp-v14">
  <link rel="stylesheet" href="/css/fixeo-reservation-flagship-v1.css?v=fxresf-v11a">
  <link rel="stylesheet" href="/css/fx-request-flow-v4.css?v=fxrf4-v5z">
  <link rel="icon" href="/img/favicon.png" type="image/png">
</head>
<body class="seo-service-page" data-theme="dark" data-svc="${svcKey}" data-city="${city.slug}">
  <div class="bg-animated seo-bg" aria-hidden="true"></div>
  <a href="#main-content" class="fxlp-skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#ff6b3d;color:#fff;padding:6px 14px;border-radius:8px;font-size:.85rem;text-decoration:none">Aller au contenu</a>
  <nav class="navbar" role="navigation" aria-label="Navigation principale"></nav>
  <select id="qsm-select-city" style="display:none" aria-hidden="true">
    <option value="${esc(city.label)}" selected>${esc(city.label)}</option>
  </select>
  <input id="qsm-input-nlp" type="hidden" value="${esc(svc.label)}">
  <main id="main-content" role="main">
    <div class="fxlp-wrap">
      <nav class="fxlp-breadcrumbs" aria-label="Fil d'Ariane">
        <a href="/index.html">Accueil</a>
        <span aria-hidden="true">\u203a</span>
        <a href="/prix">Prix</a>
        <span aria-hidden="true">\u203a</span>
        <span>${esc(svc.label)}</span>
        <span aria-hidden="true">\u203a</span>
        <span aria-current="page">${esc(city.label)}</span>
      </nav>
    </div>
    <section class="fxlp-hero" aria-labelledby="fxlp-h1">
      <div class="fxlp-wrap">
        <div class="fxlp-hero-copy">
          <div class="fxlp-eyebrow"><span class="fxlp-eyebrow-dot" aria-hidden="true"></span>
            TARIFS ${svc.label.toUpperCase()} \u00b7 ${city.label.toUpperCase()} \u00b7 2026
          </div>
          <h1 id="fxlp-h1" class="fxlp-h1">${h1}</h1>
          <p class="fxlp-lead">Fourchettes indicatives pour les interventions ${esc(svc.label_adj)} \u00e0 ${esc(city.label)} en 2026. Le tarif d\u00e9finitif est confirm\u00e9 avec l'artisan avant l'intervention.</p>
          <div class="fxlp-chips" role="list">
            <span class="fxlp-chip fxlp-chip--city" role="listitem">\uD83D\uDCCD ${esc(city.label)}</span>
            <span class="fxlp-chip fxlp-chip--svc"  role="listitem">${svc.icon} ${esc(svc.label)}</span>
            <span class="fxlp-chip fxlp-chip--pay"  role="listitem">\u2713 Paiement apr\u00e8s intervention</span>
          </div>
          <p class="fxlp-note-price">Le tarif d\u00e9finitif est confirm\u00e9 avec l'artisan avant l'intervention.</p>
          <div class="fxlp-cta-group">
            <button class="fxlp-btn-primary" type="button" data-open-request-form="true" data-request-mode="default">
              D\u00e9crire mon besoin \u00e0 ${esc(city.label)}
            </button>
            <a href="#fxlp-artisans" id="fxlp-scroll-artisans" class="fxlp-btn-secondary">
              Voir les artisans \u00e0 ${esc(city.label)} \u2193
            </a>
          </div>
        </div>
      </div>
    </section>
    <hr class="fxlp-divider">
    <section class="fxlp-section fxlp-section--tinted" aria-labelledby="fxlp-price-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">TARIFS INDICATIFS 2026</span>
        <h2 id="fxlp-price-title" class="fxlp-section-title">Fourchettes de prix \u2014 ${esc(svc.label)} \u00e0 ${esc(city.label)}</h2>
        <p class="fxlp-section-sub">R\u00e9gion de ${esc(city.region)}. Fournitures non incluses, sauf mention contraire.</p>
        <div class="fxlp-price-grid" role="list">${priceCardsHtml}
        </div>
        <p class="fxlp-price-disclaimer">Fourchettes indicatives \u2014 le tarif d\u00e9finitif est \u00e9tabli par l'artisan selon l'\u00e9tat des lieux. <a href="#fxlp-faq" class="fxlp-inline-link">En savoir plus</a></p>
      </div>
    </section>
    <hr class="fxlp-divider">
    <section class="fxlp-section" aria-labelledby="fxlp-factors-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">CE QUI INFLUENCE LE PRIX</span>
        <h2 id="fxlp-factors-title" class="fxlp-section-title">Facteurs qui influencent le co\u00fbt</h2>
        <div class="fxlp-factors-list">${factorsHtml}
        </div>
      </div>
    </section>
    <hr class="fxlp-divider">
    <section id="fxlp-artisans" class="fxlp-section" aria-labelledby="fxlp-art-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">ARTISANS R\u00c9F\u00c9RENC\u00c9S</span>
        <h2 id="fxlp-art-title" class="fxlp-section-title">Artisans ${esc(svc.label_adj)} r\u00e9f\u00e9renc\u00e9s \u00e0 ${esc(city.label)}</h2>
        <p class="fxlp-section-sub">Profils r\u00e9f\u00e9renc\u00e9s sur FIXEO. Paiement apr\u00e8s intervention.</p>
        <div class="fxlp-artisan-grid">
          <div id="fxlp-artisan-grid" class="fxlp-artisan-loading" role="list"
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
    <section class="fxlp-how" aria-labelledby="fxlp-steps-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">EN 3 \u00c9TAPES</span>
        <h2 id="fxlp-steps-title" class="fxlp-section-title">Trouver un artisan \u00e0 ${esc(city.label)} en 3 \u00e9tapes</h2>
        <div class="fxlp-steps" role="list">
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">1</div>
            <h3 class="fxlp-step-title">D\u00e9crivez votre besoin</h3>
            <p class="fxlp-step-desc">Votre ville et le service sont d\u00e9j\u00e0 s\u00e9lectionn\u00e9s \u2014 d\u00e9crivez simplement votre situation.</p>
          </div>
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">2</div>
            <h3 class="fxlp-step-title">FIXEO recherche la solution adapt\u00e9e</h3>
            <p class="fxlp-step-desc">Votre demande est enregistr\u00e9e et transmise aux artisans r\u00e9f\u00e9renc\u00e9s correspondant \u00e0 votre secteur.</p>
          </div>
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">3</div>
            <h3 class="fxlp-step-title">Confirmez le tarif avec l'artisan</h3>
            <p class="fxlp-step-desc">L'artisan vous communique le tarif d\u00e9finitif avant de commencer. Paiement apr\u00e8s intervention.</p>
          </div>
        </div>
      </div>
    </section>
    <div class="fxlp-wrap">
      <div class="fxlp-cta-banner" role="complementary">
        <p class="fxlp-cta-eyebrow">BESOIN D'UN ARTISAN\u00a0?</p>
        <h2 class="fxlp-cta-title">Votre demande \u00e0 ${esc(city.label)}, en quelques secondes.</h2>
        <p class="fxlp-cta-lead">Votre ville et le service sont d\u00e9j\u00e0 s\u00e9lectionn\u00e9s. D\u00e9crivez votre probl\u00e8me \u2014 c'est tout.</p>
        <button class="fxlp-btn-primary" type="button" data-open-request-form="true" data-request-mode="default">
          Continuer avec ${esc(svc.label)} \u00b7 ${esc(city.label)}
        </button>
        <p class="fxlp-cta-note">Aucun paiement maintenant \u00b7 Tarif confirm\u00e9 avant l'intervention</p>
      </div>
    </div>
    <section id="fxlp-faq" class="fxlp-faq-section" aria-labelledby="fxlp-faq-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">FAQ</span>
        <h2 id="fxlp-faq-title" class="fxlp-section-title">Questions fr\u00e9quentes \u2014 ${esc(svc.label)} \u00e0 ${esc(city.label)}</h2>
        <div class="fxlp-faq-list" role="list">${faqHtml}
        </div>
      </div>
    </section>
    <div class="fxlp-wrap">
      <nav class="seo-authority-links" aria-label="Pages li\u00e9es">
        ${serviceLinkHtml}
        <a href="/prix/${svcKey}/casablanca">Prix ${esc(svc.label)} Casablanca</a>
        <span aria-hidden="true">\u00b7</span>
        <a href="/prix/${svcKey}/marrakech">Prix ${esc(svc.label)} Marrakech</a>
        <span aria-hidden="true">\u00b7</span>
        <a href="/prix/${svcKey}/fes">Prix ${esc(svc.label)} F\u00e8s</a>
      </nav>
    </div>
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

      const filepath = path.join(ROOT, filename);
      fs.writeFileSync(filepath, html, 'utf8');
      urls.push(canonicalPath);
      count++;
    }
  }
  console.log(`\u2705 1B Price pages: ${count} generated`);
  return urls;
}

/* ═══════════════════════════════════════════════════════════
   1C — QUARTIER PAGES
══════════════════════════════════════════════════════════ */
function generateQuartierPages() {
  let count = 0;
  const urls = [];

  // Service-specific flagship data
  const Q_SUPABASE_CAT = {
    plombier:    'Plomberie',
    electricite: 'Électricité',
    serrurerie:  'Serrurerie',
  };
  const Q_RAFI_NLP = {
    plombier:    'Plomberie',
    electricite: 'Électricité',
    serrurerie:  'Serrurerie',
  };
  const Q_ICON = {
    plombier:    '🔧',
    electricite: '⚡',
    serrurerie:  '🔑',
  };
  const Q_PROFESSION = {
    plombier:    'plombier',
    electricite: 'électricien',
    serrurerie:  'serrurier',
  };
  const Q_PROFESSION_UC = {
    plombier:    'Plombier',
    electricite: 'Électricien',
    serrurerie:  'Serrurier',
  };
  const Q_LABEL_ADJ = {
    plombier:    'plomberie',
    electricite: 'électricité',
    serrurerie:  'serrurerie',
  };
  const Q_PRIX_SLUG = {
    plombier:    'plomberie',
    electricite: 'electricite',
    serrurerie:  'serrurerie',
  };
  const Q_SVC_LINK = {
    plombier:    'plombier',
    electricite: 'electricien',
    serrurerie:  'serrurier',
  };
  const Q_EYEBROW_SVC = {
    plombier:    'PLOMBERIE',
    electricite: 'ÉLECTRICITÉ',
    serrurerie:  'SERRURERIE',
  };
  const Q_SITUATIONS = {
    plombier: [
      { icon: '💧', label: "Fuite d\'eau" },
      { icon: '🚿', label: "Robinet ou chasse d\'eau" },
      { icon: '🚧', label: 'Canalisation bouchée' },
      { icon: '🔩', label: 'Installation sanitaire' },
      { icon: '🔥', label: 'Chauffe-eau' },
      { icon: '🔍', label: 'Recherche et diagnostic de panne' },
    ],
    electricite: [
      { icon: '⚡', label: 'Panne électrique' },
      { icon: '🔌', label: 'Prise ou interrupteur défectueux' },
      { icon: '💡', label: "Problème d\'éclairage" },
      { icon: '🔲', label: 'Tableau électrique' },
      { icon: '🔗', label: 'Câblage et installation' },
      { icon: '🔍', label: 'Diagnostic électrique' },
    ],
    serrurerie: [
      { icon: '🚪', label: 'Porte claquée ou bloquée' },
      { icon: '🔐', label: 'Remplacement de serrure' },
      { icon: '🗝️', label: 'Clé cassée ou perdue' },
      { icon: '🛡️', label: 'Sécurisation de porte' },
      { icon: '🔩', label: 'Cylindre blindé' },
      { icon: '🔍', label: 'Diagnostic et expertise' },
    ],
  };
  const Q_FAQ = {
    plombier: (qLabel, cityLabel) => [
      { q: `Comment demander un plombier à ${qLabel},\u00a0${cityLabel}\u00a0?`, a: `Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux plombiers référencés correspondant à votre secteur à ${cityLabel}. L'artisan vous contacte et confirme le tarif définitif avant d'intervenir.` },
      { q: 'Quels problèmes de plomberie peuvent être décrits\u00a0?', a: "Les artisans référencés sur FIXEO peuvent intervenir pour des fuites d'eau, des canalisations bouchées, des problèmes de chauffe-eau, des robinets défectueux, des installations sanitaires et des diagnostics de panne. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé\u00a0?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix\u00a0?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué\u00a0?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
    electricite: (qLabel, cityLabel) => [
      { q: `Comment demander un électricien à ${qLabel},\u00a0${cityLabel}\u00a0?`, a: `Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux électriciens référencés correspondant à votre secteur à ${cityLabel}. L'artisan vous contacte et confirme le tarif définitif avant d'intervenir.` },
      { q: "Quels problèmes d'électricité peuvent être décrits\u00a0?", a: "Les artisans référencés sur FIXEO peuvent intervenir pour des pannes électriques, des problèmes de tableau, des prises ou interrupteurs défectueux, des travaux de câblage, des éclairages et des diagnostics. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé\u00a0?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix\u00a0?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué\u00a0?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
    serrurerie: (qLabel, cityLabel) => [
      { q: `Comment demander un serrurier à ${qLabel},\u00a0${cityLabel}\u00a0?`, a: `Décrivez votre problème sur FIXEO. Votre demande est enregistrée et transmise aux serruriers référencés correspondant à votre secteur à ${cityLabel}. L'artisan vous contacte et confirme le tarif définitif avant d'intervenir.` },
      { q: 'Quels problèmes de serrurerie peuvent être décrits\u00a0?', a: "Les artisans référencés sur FIXEO peuvent intervenir pour des portes claquées ou bloquées, des remplacements de serrure, des clés cassées ou perdues, des cylindres blindés, la sécurisation de porte et des diagnostics. Les prestations dépendent du diagnostic et des compétences de l'artisan sélectionné." },
      { q: 'Comment le tarif définitif est-il confirmé\u00a0?', a: "Après évaluation de votre situation, l'artisan vous communique le tarif définitif avant de commencer. Vous n'êtes pas obligé d'accepter. En cas d'accord, le paiement s'effectue après la fin de l'intervention." },
      { q: 'Le déplacement est-il inclus dans le prix\u00a0?', a: "Le déplacement peut être inclus ou facturé séparément selon l'artisan, la distance et le secteur. Le détail est précisé dans le devis communiqué avant l'intervention." },
      { q: 'Quand le paiement est-il effectué\u00a0?', a: "Le paiement s'effectue après l'intervention, jamais en avance complète. Aucun paiement anticipé n'est demandé." },
    ],
  };

  for (const [svcKey, svc] of Object.entries(QUARTIER_SERVICES)) {
    const supabaseCat = Q_SUPABASE_CAT[svcKey] || svc.label;
    const rafiNlp     = Q_RAFI_NLP[svcKey]     || svc.label;
    const svcIcon     = Q_ICON[svcKey]          || '🔧';
    const profession  = Q_PROFESSION[svcKey]    || svc.label_lower;
    const professionUC= Q_PROFESSION_UC[svcKey] || svc.label;
    const labelAdj    = Q_LABEL_ADJ[svcKey]     || svc.label_lower;
    const prixSlug    = Q_PRIX_SLUG[svcKey]     || svcKey;
    const svcLinkKey  = Q_SVC_LINK[svcKey]      || svc.url_prefix;
    const eyebrowSvc  = Q_EYEBROW_SVC[svcKey]   || svc.label.toUpperCase();
    const situations  = Q_SITUATIONS[svcKey]    || [];
    const faqFn       = Q_FAQ[svcKey]           || (() => []);

    for (const [cityKey, quartiers] of Object.entries(QUARTIERS)) {
      const city = CITIES[cityKey];
      if (!city) continue;

      for (const quartierSlug of quartiers) {
        const quartierLabel = QUARTIER_LABELS[quartierSlug] || quartierSlug;
        const filename      = `quartier-${svc.file_prefix}-${city.slug}-${quartierSlug}.html`;
        const canonicalPath = `/${svc.url_prefix}/${city.slug}/${quartierSlug}`;
        const canonicalUrl  = `https://www.fixeo.ma${canonicalPath}`;
        const selfHref      = filename;

        const title    = esc(`${professionUC} à ${quartierLabel}, ${city.label} | Fixeo`);
        const metaDesc = esc(`Décrivez votre problème de ${labelAdj} à ${quartierLabel}, ${city.label}. FIXEO enregistre votre demande et recherche une solution correspondant à votre secteur. Paiement après intervention.`);

        const breadcrumbLD = {
          '@context': 'https://schema.org', '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://www.fixeo.ma/' },
            { '@type': 'ListItem', position: 2, name: `${professionUC} à ${city.label}`, item: `https://www.fixeo.ma/${svcLinkKey}-${city.slug}.html` },
            { '@type': 'ListItem', position: 3, name: quartierLabel, item: canonicalUrl },
          ]
        };

        const faqItems  = faqFn(quartierLabel, city.label);
        const faqLD     = {
          '@context': 'https://schema.org', '@type': 'FAQPage',
          mainEntity: faqItems.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
        };

        const situationsHtml = situations.map(s =>
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

        // Explorer aussi: 4 cards, no self-link, no dup, all existing pages
        const seen = new Set([selfHref]);
        const explorerCards = [];
        const pushCard = (href, icon, cityName, title) => {
          if (seen.has(href)) return;
          seen.add(href);
          explorerCards.push({ href, icon, cityName, title });
        };

        // 1. Parent service-city page
        pushCard(`${svcLinkKey}-${city.slug}.html`, svcIcon, city.label, `${professionUC} à ${city.label}`);
        // 2. Price page
        pushCard(`prix-${prixSlug}-${city.slug}.html`, '💰', city.label, `Prix ${labelAdj} à ${city.label}`);
        // 3. Another quartier in same city/service (first non-self)
        for (const otherQ of quartiers) {
          if (otherQ === quartierSlug) continue;
          const otherLabel = QUARTIER_LABELS[otherQ] || otherQ;
          const otherHref  = `quartier-${svc.file_prefix}-${city.slug}-${otherQ}.html`;
          pushCard(otherHref, svcIcon, otherLabel, `${professionUC} à ${otherLabel}`);
          break;
        }
        // 4. Another service on same city
        for (const [otherSvcKey, otherSvc] of Object.entries(QUARTIER_SERVICES)) {
          if (otherSvcKey === svcKey) continue;
          const otherSvcLink = Q_SVC_LINK[otherSvcKey] || otherSvc.url_prefix;
          const otherHref    = `${otherSvcLink}-${city.slug}.html`;
          const otherProfUC  = Q_PROFESSION_UC[otherSvcKey] || otherSvc.label;
          const otherIcon    = Q_ICON[otherSvcKey] || '🔧';
          pushCard(otherHref, otherIcon, city.label, `${otherProfUC} à ${city.label}`);
          break;
        }

        const explorerHtml = explorerCards.slice(0, 4).map(card =>
          `<a class="fxlp-explorer-card" href="${card.href}">
            <span class="fxlp-explorer-icon" aria-hidden="true">${card.icon}</span>
            <span class="fxlp-explorer-city">${esc(card.cityName)}</span>
            <span class="fxlp-explorer-title">${esc(card.title)}</span>
          </a>`
        ).join('\n          ');

        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-quartier-flagship-v1">
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDesc}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
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
<body class="seo-service-page" data-theme="dark" data-svc="${svcKey}" data-city="${city.slug}" data-quartier="${quartierSlug}">
  <div class="bg-animated seo-bg" aria-hidden="true"></div>
  <a href="#main-content" class="fxlp-skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#ff6b3d;color:#fff;padding:6px 14px;border-radius:8px;font-size:.85rem;text-decoration:none">Aller au contenu</a>
  <nav class="navbar" role="navigation" aria-label="Navigation principale"></nav>
  <select id="qsm-select-city" style="display:none" aria-hidden="true">
    <option value="${esc(city.label)}" selected>${esc(city.label)}</option>
  </select>
  <input id="qsm-input-nlp" type="hidden" value="${esc(rafiNlp)}">
  <main id="main-content" role="main">
    <div class="fxlp-wrap">

      <!-- §0 BREADCRUMBS -->
      <nav class="fxlp-breadcrumbs" aria-label="Fil d'Ariane">
        <a href="/index.html">Accueil</a>
        <span aria-hidden="true">›</span>
        <a href="/${svcLinkKey}-${city.slug}.html">${esc(professionUC)} à ${esc(city.label)}</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">${esc(quartierLabel)}</span>
      </nav>
    </div>

    <!-- §1 HERO -->
    <section class="fxlp-hero" aria-labelledby="fxlp-h1">
      <div class="fxlp-wrap">
        <div class="fxlp-hero-copy">
          <div class="fxlp-eyebrow">
            <span class="fxlp-eyebrow-dot" aria-hidden="true"></span>
            QUARTIER · ${eyebrowSvc} · ${esc(city.label.toUpperCase())} · 2026
          </div>
          <h1 id="fxlp-h1" class="fxlp-h1">${esc(professionUC)} à <em class="fxlp-h1-em">${esc(quartierLabel)}</em>, ${esc(city.label)}</h1>
          <p class="fxlp-lead">Décrivez votre problème de ${labelAdj} à ${esc(quartierLabel)}. FIXEO enregistre votre demande et recherche une solution correspondant à votre secteur à ${esc(city.label)}. Le tarif définitif est confirmé avec l'artisan avant l'intervention.</p>
          <div class="fxlp-chips" role="list">
            <span class="fxlp-chip fxlp-chip--city" role="listitem">📍 ${esc(quartierLabel)}</span>
            <span class="fxlp-chip fxlp-chip--city" role="listitem">📍 ${esc(city.label)}</span>
            <span class="fxlp-chip fxlp-chip--svc"  role="listitem">${svcIcon} ${esc(svc.label)}</span>
            <span class="fxlp-chip fxlp-chip--pay"  role="listitem">✓ Paiement après intervention</span>
          </div>
          <p class="fxlp-note-price">Le tarif définitif est confirmé avec l'artisan avant l'intervention.</p>
          <div class="fxlp-cta-group">
            <button class="fxlp-btn-primary" type="button" data-open-request-form="true" data-request-mode="default">
              Décrire mon besoin à ${esc(quartierLabel)}
            </button>
            <a href="#fxlp-artisans" class="fxlp-btn-secondary">
              Voir les artisans à ${esc(city.label)} ↓
            </a>
          </div>
        </div>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §2 SITUATIONS -->
    <section class="fxlp-section fxlp-section--tinted" aria-labelledby="fxlp-sit-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">BESOINS FRÉQUENTS</span>
        <h2 id="fxlp-sit-title" class="fxlp-section-title">Pour quels besoins contacter ${esc('un')} ${profession} à ${esc(quartierLabel)}&nbsp;?</h2>
        <p class="fxlp-section-sub">Les prestations proposées dépendent du diagnostic et des compétences de l'artisan sélectionné.</p>
        <ul class="fxlp-sit-grid" role="list">
          ${situationsHtml}
        </ul>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §3 HOW IT WORKS -->
    <section class="fxlp-how" aria-labelledby="fxlp-steps-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">EN 3 ÉTAPES</span>
        <h2 id="fxlp-steps-title" class="fxlp-section-title">Trouver ${esc('un')} ${profession} à ${esc(quartierLabel)} en 3 étapes</h2>
        <div class="fxlp-steps" role="list">
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">1</div>
            <h3 class="fxlp-step-title">Décrivez votre besoin</h3>
            <p class="fxlp-step-desc">Votre ville et le service sont déjà sélectionnés — décrivez simplement votre situation à ${esc(quartierLabel)}.</p>
          </div>
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">2</div>
            <h3 class="fxlp-step-title">FIXEO recherche une solution adaptée à votre secteur</h3>
            <p class="fxlp-step-desc">Votre demande est enregistrée et transmise aux artisans référencés correspondant à votre secteur.</p>
          </div>
          <div class="fxlp-step" role="listitem">
            <div class="fxlp-step-num" aria-hidden="true">3</div>
            <h3 class="fxlp-step-title">Confirmez le tarif et le créneau avec l'artisan</h3>
            <p class="fxlp-step-desc">L'artisan vous communique le tarif définitif avant de commencer. Paiement après intervention.</p>
          </div>
        </div>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §4 ARTISAN SECTION -->
    <section id="fxlp-artisans" class="fxlp-section" aria-labelledby="fxlp-art-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">ARTISANS RÉFÉRENCÉS</span>
        <h2 id="fxlp-art-title" class="fxlp-section-title">${esc(professionUC)}s référencés à ${esc(city.label)}</h2>
        <p class="fxlp-section-sub">Profils référencés sur FIXEO. Paiement après intervention.</p>
        <div id="fxlp-artisan-grid" class="fxlp-artisan-loading" role="list"
             aria-label="${esc(professionUC + 's à ' + city.label)}"
             data-fxlp-city="${esc(city.label)}"
             data-fxlp-service="${svcKey}"
             data-fxlp-category="${esc(supabaseCat)}">
          <div class="fxlp-skeleton" aria-hidden="true"></div>
          <div class="fxlp-skeleton" aria-hidden="true"></div>
          <div class="fxlp-skeleton" aria-hidden="true"></div>
        </div>
      </div>
    </section>

    <hr class="fxlp-divider">

    <!-- §5 FINAL CTA BANNER -->
    <div class="fxlp-wrap">
      <div class="fxlp-cta-banner" role="complementary">
        <p class="fxlp-cta-eyebrow">BESOIN D'UN ARTISAN&nbsp;?</p>
        <h2 class="fxlp-cta-title">Votre demande à ${esc(quartierLabel)}, en quelques secondes.</h2>
        <p class="fxlp-cta-lead">Votre ville et le service sont déjà sélectionnés. Décrivez votre problème — c'est tout.</p>
        <button class="fxlp-btn-primary" type="button" data-open-request-form="true" data-request-mode="default">
          Continuer avec ${esc(svc.label)} · ${esc(city.label)}
        </button>
        <p class="fxlp-cta-note">Aucun paiement maintenant · Tarif confirmé avant l'intervention</p>
      </div>
    </div>

    <!-- §6 FAQ -->
    <section id="fxlp-faq" class="fxlp-faq-section" aria-labelledby="fxlp-faq-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">FAQ</span>
        <h2 id="fxlp-faq-title" class="fxlp-section-title">Questions fréquentes — ${esc(professionUC)} à ${esc(quartierLabel)}</h2>
        <div class="fxlp-faq-list" role="list">

          ${faqHtml}

        </div>
      </div>
    </section>

    <!-- §7 EXPLORER AUSSI -->
    <section class="fxlp-explorer" aria-labelledby="fxlp-explorer-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">EXPLORER AUSSI</span>
        <h2 id="fxlp-explorer-title" class="fxlp-explorer-heading">Explorer aussi</h2>
        <nav class="fxlp-explorer-grid" aria-label="Pages liées">
          ${explorerHtml}
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

        const filepath = path.join(ROOT, filename);
        fs.writeFileSync(filepath, html, 'utf8');
        urls.push(canonicalPath);
        count++;
      }
    }
  }
  console.log(`✅ 1C Quartier pages: ${count} generated`);
  return urls;
}


/* ═══════════════════════════════════════════════════════════
   SITEMAPS
══════════════════════════════════════════════════════════ */
function generateSitemapPseo(problemUrls, priceUrls, quartierUrls) {
  const today = new Date().toISOString().slice(0,10);
  const allUrls = [...problemUrls, ...priceUrls, ...quartierUrls];
  const urlEntries = allUrls.map(u =>
    `  <url>\n    <loc>https://www.fixeo.ma${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  fs.writeFileSync(path.join(ROOT, 'sitemap-pseo.xml'), xml, 'utf8');
  console.log(`✅ sitemap-pseo.xml: ${allUrls.length} URLs`);
}

function updateSitemapIndex() {
  const sitemapIndexPath = path.join(ROOT, 'sitemap-index.xml');
  let content = fs.readFileSync(sitemapIndexPath, 'utf8');
  const today = new Date().toISOString().slice(0,10);

  if (!content.includes('sitemap-pseo.xml')) {
    const entry = `
  <!-- Programmatic SEO V2 pages (problems/prices/quartiers) -->
  <sitemap>
    <loc>https://www.fixeo.ma/sitemap-pseo.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`;
    content = content.replace('</sitemapindex>', entry + '\n</sitemapindex>');
    fs.writeFileSync(sitemapIndexPath, content, 'utf8');
    console.log('✅ sitemap-index.xml updated with sitemap-pseo.xml');
  } else {
    console.log('ℹ️  sitemap-pseo.xml already in sitemap-index.xml');
  }
}

/* ═══════════════════════════════════════════════════════════
   VERCEL ROUTES UPDATE
══════════════════════════════════════════════════════════ */
function updateVercelRoutes() {
  const vercelPath = path.join(ROOT, 'vercel.json');
  const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

  // New routes to add
  const problemRoutes = Object.keys(PROBLEMS).map(p => ({
    "src": `^/${p}/([a-z][a-z-]*)$`,
    "dest": `/problem-${p}-$1.html`
  }));

  const priceRoute = {
    "src": "^/prix/([a-z][a-z-]*)/([a-z][a-z-]*)$",
    "dest": "/prix-$1-$2.html"
  };

  // Trust page routes (for Phase 3)
  const trustRoutes = [
    { "src": "^/a-propos$", "dest": "/a-propos.html" },
    { "src": "^/comment-ca-marche$", "dest": "/comment-ca-marche.html" },
    { "src": "^/nos-garanties$", "dest": "/nos-garanties.html" },
    { "src": "^/verification-artisans$", "dest": "/verification-artisans.html" },
    { "src": "^/charte-qualite$", "dest": "/charte-qualite.html" },
    { "src": "^/engagement-fixeo$", "dest": "/engagement-fixeo.html" },
  ];

  // Quartier routes (3-segment, MUST come before 2-segment LP routes)
  const quartierRoutes = [
    { "src": "^/plombier/([a-z][a-z-]*)/([a-z][a-z-]*)$", "dest": "/quartier-plombier-$1-$2.html" },
    { "src": "^/electricien/([a-z][a-z-]*)/([a-z][a-z-]*)$", "dest": "/quartier-electricite-$1-$2.html" },
    { "src": "^/serrurier/([a-z][a-z-]*)/([a-z][a-z-]*)$", "dest": "/quartier-serrurerie-$1-$2.html" },
  ];

  // Get existing routes
  const existingRoutes = vercel.routes || [];

  // Identify LP 2-segment routes (the ones quartier routes must precede)
  const lpRoutePatterns = [
    '^/plombier/([a-z][a-z-]*)$',
    '^/electricien/([a-z][a-z-]*)$',
    '^/serrurier/([a-z][a-z-]*)$',
  ];

  // Remove routes we're replacing (de-dup check)
  const existingSrcs = new Set(existingRoutes.map(r => r.src));

  // Filter out any already-added routes
  const allNewRoutes = [...problemRoutes, priceRoute, ...trustRoutes, ...quartierRoutes];
  const newRoutesToAdd = allNewRoutes.filter(r => !existingSrcs.has(r.src));

  if (newRoutesToAdd.length === 0) {
    console.log('ℹ️  All vercel.json routes already present');
    return;
  }

  // Find the index of the first LP 2-segment route
  let insertBeforeIdx = existingRoutes.findIndex(r => lpRoutePatterns.includes(r.src));
  if (insertBeforeIdx === -1) insertBeforeIdx = existingRoutes.length;

  // Split into: before LP routes, LP routes + rest
  const before = existingRoutes.slice(0, insertBeforeIdx);
  const after  = existingRoutes.slice(insertBeforeIdx);

  // Quartier routes go before LP routes; others can go at the beginning
  const quartierOnly = newRoutesToAdd.filter(r =>
    quartierRoutes.some(qr => qr.src === r.src)
  );
  const others = newRoutesToAdd.filter(r =>
    !quartierRoutes.some(qr => qr.src === r.src)
  );

  vercel.routes = [...before, ...others, ...quartierOnly, ...after];

  fs.writeFileSync(vercelPath, JSON.stringify(vercel, null, 2), 'utf8');
  console.log(`✅ vercel.json: added ${newRoutesToAdd.length} new routes`);
}

/* ═══════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════ */
const problemUrls  = generateProblemPages();
const priceUrls    = generatePricePages();
const quartierUrls = generateQuartierPages();
generateSitemapPseo(problemUrls, priceUrls, quartierUrls);
updateSitemapIndex();
updateVercelRoutes();

console.log(`\n🎯 Total pages generated: ${problemUrls.length + priceUrls.length + quartierUrls.length}`);
console.log(`   - Problem pages: ${problemUrls.length}`);
console.log(`   - Price pages:   ${priceUrls.length}`);
console.log(`   - Quartier pages: ${quartierUrls.length}`);
