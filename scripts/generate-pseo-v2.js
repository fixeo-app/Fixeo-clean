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
    tiers: [
      { label: 'Déplacement + diagnostic', range: '150 – 250 MAD' },
      { label: 'Intervention simple (joint, robinet)', range: '300 – 600 MAD' },
      { label: 'Débouchage canalisation', range: '350 – 700 MAD' },
      { label: 'Dépannage urgence (fuite active)', range: '500 – 900 MAD' },
      { label: 'Remplacement chauffe-eau', range: '600 – 1 500 MAD (main-d\'œuvre)' },
    ],
    faq: (city) => [
      { q: `Quel est le tarif moyen d'un plombier à ${city.label} ?`, a: `Le tarif moyen d'un plombier à ${city.label} varie entre 150 et 900 MAD selon la nature de l'intervention. Le déplacement seul coûte 150 à 250 MAD. Une réparation simple (joint, robinet) se situe entre 300 et 600 MAD. Pour une urgence (fuite active), comptez 500 à 900 MAD. Ces tarifs peuvent varier la nuit ou le week-end.` },
      { q: 'Comment éviter les mauvaises surprises sur la facture ?', a: 'Avec Fixeo, vous recevez un devis avant le début des travaux. L\'artisan évalue le problème et vous communique le coût estimé. Vous n\'êtes pas obligé d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention — jamais en avance complète.' },
      { q: 'Les tarifs sont-ils plus élevés le week-end ou la nuit ?', a: 'Oui, comme dans la plupart des pays, les interventions d\'urgence hors horaires normaux (nuit, week-end, jours fériés) appliquent une majoration de 30 à 60%. Les artisans Fixeo sont tenus d\'annoncer ces majorations dans leur devis initial.' },
    ],
  },
  electricite: {
    label: 'Électricité',
    label_adj: 'd\'électricité',
    icon: '⚡',
    slug: 'electricite',
    service_link: 'electricien',
    tiers: [
      { label: 'Déplacement + diagnostic', range: '200 – 300 MAD' },
      { label: 'Installation prise électrique', range: '250 – 450 MAD' },
      { label: 'Remplacement interrupteur/prise', range: '150 – 350 MAD' },
      { label: 'Diagnostic tableau électrique', range: '300 – 600 MAD' },
      { label: 'Mise à niveau tableau (câblage)', range: '800 – 2 000 MAD' },
    ],
    faq: (city) => [
      { q: `Combien coûte un électricien à ${city.label} ?`, a: `Le coût d'un électricien à ${city.label} dépend du type d'intervention. Le déplacement et diagnostic commence à 200–300 MAD. L'installation d'une prise ou d'un interrupteur varie entre 150 et 450 MAD. Pour un tableau électrique complet, prévoyez 800 à 2 000 MAD selon la complexité. Les urgences nocturnes appliquent une majoration de 40 à 60%.` },
      { q: 'Faut-il un permis pour des travaux électriques au Maroc ?', a: 'Pour les travaux courants (remplacement de prises, installation d\'éclairage), aucun permis n\'est nécessaire. Mais pour des travaux importants (nouveau tableau, modification du réseau principal), un devis signé par un électricien agréé est recommandé, surtout en copropriété. Fixeo vérifie les qualifications de tous ses artisans.' },
      { q: 'Comment savoir si mon installation électrique est aux normes ?', a: 'Un électricien qualifié peut effectuer un diagnostic complet de votre installation en 1 à 2 heures. Il vérifie les protections différentielles, la mise à la terre, l\'état des câbles et la conformité du tableau. Ce type d\'audit coûte généralement 300 à 500 MAD à Casablanca et dans les grandes villes.' },
    ],
  },
  serrurerie: {
    label: 'Serrurerie',
    label_adj: 'de serrurerie',
    icon: '🔐',
    slug: 'serrurerie',
    service_link: 'serrurier',
    tiers: [
      { label: 'Ouverture de porte (sans casse)', range: '300 – 600 MAD' },
      { label: 'Ouverture de porte (avec perçage)', range: '500 – 900 MAD' },
      { label: 'Remplacement cylindre simple', range: '400 – 800 MAD' },
      { label: 'Serrure 3 points / multipoints', range: '800 – 2 000 MAD' },
      { label: 'Blindage / sécurisation porte', range: '1 500 – 5 000 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le prix d'un serrurier à ${city.label} ?`, a: `À ${city.label}, le prix d'un serrurier dépend du type d'intervention. Une ouverture de porte sans casse coûte 300 à 600 MAD. Avec perçage, comptez 500 à 900 MAD. Le remplacement d'un cylindre simple revient à 400 à 800 MAD. Pour une serrure multipoints ou blindée, les tarifs vont de 800 à 2 000 MAD et plus selon le modèle choisi.` },
      { q: 'Comment éviter les serruriers abusifs lors d\'une urgence ?', a: 'Passez par Fixeo : nos artisans sont vérifiés et évaluent votre situation pour vous communiquer un devis avant d\'intervenir. Refusez toute intervention sans devis préalable. Méfiez-vous des prix annoncés par téléphone qui doublent à l\'arrivée — c\'est une pratique courante chez les serruriers non référencés.' },
      { q: 'Vaut-il mieux réparer ou remplacer une vieille serrure ?', a: 'Si votre serrure a plus de 10 ans, si elle a subi une tentative d\'effraction, ou si vous venez d\'emménager, le remplacement est généralement recommandé. Le coût d\'un nouveau cylindre de qualité (200–500 MAD) est faible comparé au risque sécuritaire. Un serrurier Fixeo peut vous conseiller sur le niveau de sécurité adapté à votre porte.' },
    ],
  },
  climatisation: {
    label: 'Climatisation',
    label_adj: 'de climatisation',
    icon: '❄️',
    slug: 'climatisation',
    service_link: 'climatisation',
    tiers: [
      { label: 'Installation split (1 unité)', range: '2 000 – 6 000 MAD' },
      { label: 'Entretien annuel (nettoyage + vérification)', range: '400 – 800 MAD' },
      { label: 'Recharge gaz réfrigérant', range: '600 – 1 200 MAD' },
      { label: 'Diagnostic panne (déplacement inclus)', range: '300 – 500 MAD' },
      { label: 'Remplacement compresseur', range: '1 500 – 4 000 MAD' },
    ],
    faq: (city) => [
      { q: `Combien coûte l'installation d'une climatisation à ${city.label} ?`, a: `L'installation d'un split (unité intérieure + extérieure) à ${city.label} coûte entre 2 000 et 6 000 MAD selon la puissance (9 000 à 24 000 BTU), la marque et la complexité de pose. Cette somme inclut la fourniture de l'appareil et la main-d'œuvre. Un entretien annuel revient à 400–800 MAD. Les techniciens Fixeo installent toutes les marques courantes au Maroc.` },
      { q: 'Quand faut-il recharger le gaz de sa climatisation ?', a: 'La recharge en gaz (R32 ou R410A) est nécessaire quand votre climatiseur refroidit mal malgré des filtres propres. Ce n\'est pas un entretien annuel automatique — c\'est symptomatique d\'une fuite. Un technicien doit d\'abord localiser et réparer la fuite avant de recharger. Comptez 600 à 1 200 MAD pour la recharge à Casablanca.' },
      { q: 'Quelle est la durée de vie d\'une climatisation au Maroc ?', a: 'Avec un entretien annuel régulier, un climatiseur de qualité dure 10 à 15 ans au Maroc. La chaleur intense en été et la poussière sont les principaux facteurs d\'usure. Les filtres doivent être nettoyés tous les 1 à 2 mois en période d\'utilisation intensive. Un contrat d\'entretien Fixeo peut prolonger significativement la durée de vie de votre appareil.' },
    ],
  },
  peinture: {
    label: 'Peinture',
    label_adj: 'de peinture',
    icon: '🎨',
    slug: 'peinture',
    service_link: 'peinture',
    tiers: [
      { label: 'Mur intérieur (par m²)', range: '35 – 70 MAD/m²' },
      { label: 'Façade extérieure (par m²)', range: '50 – 100 MAD/m²' },
      { label: 'Plafond (par m²)', range: '40 – 80 MAD/m²' },
      { label: 'Finitions et retouches (par m²)', range: '25 – 50 MAD/m²' },
      { label: 'Pièce complète (20 m²)', range: '1 400 – 2 800 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le prix de la peinture au m² à ${city.label} ?`, a: `À ${city.label}, le prix de la peinture intérieure se situe entre 35 et 70 MAD par m² de mur (peinture fournie incluse pour les travaux standard). La peinture de façade revient plus cher : 50 à 100 MAD/m² en raison des contraintes d'accès et de la résistance aux UV requise. Ces tarifs incluent la main-d'œuvre et les deux couches standard.` },
      { q: 'Combien de temps prend la peinture d\'une pièce ?', a: 'Un peintre professionnel met généralement 1 à 2 jours pour peindre une pièce de 15 à 20 m² (préparation des surfaces, protection des meubles, deux couches). Les grandes rénovations avec préparation approfondie (rebouchage, ponçage, sous-couche) peuvent prendre 3 à 5 jours. Fixeo vous connecte avec des peintres qui respectent les délais annoncés.' },
      { q: 'Quelle peinture choisir pour les murs intérieurs au Maroc ?', a: 'Pour les pièces à vivre, une peinture acrylique mate ou satinée est idéale. Dans les salles de bain et cuisines, optez pour une peinture lessivable résistante à l\'humidité (satin ou semi-brillant). Les peintres Fixeo travaillent avec des marques disponibles localement : Zolpan, Valentine, Tollens, ou les marques locales comme Mapei Maroc.' },
    ],
  },
  menuiserie: {
    label: 'Menuiserie',
    label_adj: 'de menuiserie',
    icon: '🪵',
    slug: 'menuiserie',
    service_link: null,
    tiers: [
      { label: 'Porte intérieure (pose)', range: '800 – 2 500 MAD' },
      { label: 'Fenêtre aluminium (pose + fourniture)', range: '1 500 – 4 000 MAD' },
      { label: 'Placard sur mesure (par mètre linéaire)', range: '2 000 – 5 000 MAD' },
      { label: 'Cuisine sur mesure (main-d\'œuvre)', range: '8 000 – 25 000 MAD' },
      { label: 'Réparation porte/fenêtre', range: '300 – 800 MAD' },
    ],
    faq: (city) => [
      { q: `Quel est le prix d'un menuisier à ${city.label} ?`, a: `À ${city.label}, le prix d'une intervention menuiserie varie selon la nature des travaux. La pose d'une porte intérieure (main-d'œuvre seule) coûte 800 à 2 500 MAD. Une fenêtre aluminium fourniture incluse revient à 1 500 à 4 000 MAD. Pour une cuisine sur mesure, prévoyez 8 000 à 25 000 MAD selon le nombre de modules et les matériaux choisis.` },
      { q: 'Bois ou aluminium pour les menuiseries au Maroc ?', a: 'L\'aluminium domine le marché marocain pour les fenêtres et portes extérieures grâce à sa résistance à la chaleur, à l\'humidité et sa faible maintenance. Pour l\'intérieur (portes, placards), le bois reste très répandu, en médium (MDF) ou en bois massif selon le budget. Les menuisiers Fixeo travaillent les deux matériaux.' },
      { q: 'Comment obtenir un devis menuiserie fiable ?', a: 'Pour un devis précis, le menuisier doit se déplacer pour prendre les mesures exactes. Méfiez-vous des devis téléphoniques approximatifs. Avec Fixeo, l\'artisan vient mesurer et vous remet un devis détaillé avant tout engagement. La visite de mesure est généralement gratuite chez nos artisans référencés.' },
    ],
  },
};

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
      <img src="/img/fixeo-logo.webp" alt="Fixeo" class="fixeo-logo-img" width="120" height="32">
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
        <a href="/index.html"><img src="/img/fixeo-logo.webp" alt="Fixeo" height="28"></a>
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
      <p>© 2025 Fixeo — Tous droits réservés · <a href="https://www.fixeo.ma">fixeo.ma</a></p>
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
        "logo": "https://www.fixeo.ma/img/fixeo-logo.webp",
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
  <link rel="stylesheet" href="/css/seo-lp-v1.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">
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
          <p>Nos artisans couvrent ${esc(city.label)} et ses environs 7 jours sur 7, 24 heures sur 24, y compris les jours fériés. Les urgences sont prises en charge en priorité avec un temps de réponse moyen inférieur à 60 minutes dans les zones centrales.</p>
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
            <p>Chaque artisan est vérifié : identité, qualifications, références clients. Aucun inconnu.</p>
          </div>
          <div class="problem-step">
            <div class="step-num">💰</div>
            <h3>Devis avant intervention</h3>
            <p>Vous recevez un devis clair avant le début des travaux. Pas de surprise sur la facture.</p>
          </div>
          <div class="problem-step">
            <div class="step-num">🛡️</div>
            <h3>Paiement sécurisé</h3>
            <p>Paiement uniquement après intervention réalisée. Votre argent n'est débité qu'en cas de satisfaction.</p>
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
   1B — PRICE PAGES
══════════════════════════════════════════════════════════ */
function generatePricePages() {
  let count = 0;
  const urls = [];

  for (const [svcKey, svc] of Object.entries(PRICE_SERVICES)) {
    for (const [cityKey, city] of Object.entries(CITIES)) {
      const filename = `prix-${svcKey}-${city.slug}.html`;
      const canonicalPath = `/prix/${svcKey}/${city.slug}`;
      const canonicalUrl = `https://www.fixeo.ma${canonicalPath}`;
      const title = esc(`Prix ${svc.label} à ${city.label} 2025 : tarifs et devis | Fixeo`);
      const metaDesc = esc(`Tarifs ${svc.label_adj} à ${city.label} en 2025 : fourchettes de prix réelles, tableau comparatif et devis gratuit via Fixeo. Artisans vérifiés disponibles maintenant.`);
      const h1 = esc(`Prix ${svc.label} à ${city.label} 2025`);
      const faqItems = svc.faq(city);

      const pricingRows = svc.tiers.map(t =>
        `<tr><td>${esc(t.label)}</td><td class="price-cell"><strong>${esc(t.range)}</strong></td></tr>`
      ).join('\n              ');

      const faqHtml = faqItems.map(f =>
        `<details class="seo-faq-item">
              <summary><strong>${esc(f.q)}</strong></summary>
              <p style="padding:1rem">${esc(f.a)}</p>
            </details>`
      ).join('\n            ');

      const localBusinessLD = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "Fixeo",
        "url": "https://www.fixeo.ma",
        "description": `Tarifs ${svc.label} à ${city.label}`,
        "areaServed": { "@type": "City", "name": city.label },
        "address": { "@type": "PostalAddress", "addressLocality": city.label, "addressCountry": "MA" },
        "geo": { "@type": "GeoCoordinates", "latitude": city.lat, "longitude": city.lng }
      };

      const faqLD = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqItems.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      };

      const breadcrumbLD = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Fixeo", "item": "https://www.fixeo.ma" },
          { "@type": "ListItem", "position": 2, "name": "Prix", "item": "https://www.fixeo.ma/prix" },
          { "@type": "ListItem", "position": 3, "name": svc.label, "item": `https://www.fixeo.ma/prix/${svcKey}` },
          { "@type": "ListItem", "position": 4, "name": city.label, "item": canonicalUrl }
        ]
      };

      const serviceLinkHtml = svc.service_link
        ? `<p>→ Voir notre page dédiée : <a href="/${svc.service_link}/${city.slug}">${esc(svc.label)} à ${esc(city.label)}</a></p>`
        : '';

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-pseo-v2a">
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${canonicalUrl}">
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
  <script type="application/ld+json">${JSON.stringify(localBusinessLD)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLD)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  <link rel="stylesheet" href="/css/seo-lp-v1.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">
  <style>
    .price-table{width:100%;border-collapse:collapse;margin:1.5rem 0;border-radius:10px;overflow:hidden}
    .price-table th{background:rgba(245,158,11,.15);color:#f59e0b;padding:.85rem 1rem;text-align:left;font-size:.9rem;text-transform:uppercase;letter-spacing:.05em}
    .price-table td{padding:.85rem 1rem;border-bottom:1px solid rgba(255,255,255,.07);color:#e2e8f0}
    .price-table tr:last-child td{border-bottom:none}
    .price-table tr:hover td{background:rgba(255,255,255,.04)}
    .price-cell{color:#4ade80;font-weight:600}
    .surcharge-table{width:100%;border-collapse:collapse;margin:1rem 0}
    .surcharge-table th{background:rgba(239,68,68,.12);color:#f87171;padding:.75rem 1rem;text-align:left;font-size:.85rem}
    .surcharge-table td{padding:.75rem 1rem;border-bottom:1px solid rgba(255,255,255,.06);color:#cbd5e1}
    .disclaimer-note{font-size:.82rem;color:#64748b;margin-top:.75rem;font-style:italic}
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
          <a href="/prix">Prix</a> <span>›</span>
          <a href="/prix/${svcKey}">${esc(svc.label)}</a> <span>›</span>
          <span>${esc(city.label)}</span>
        </nav>
        <span style="font-size:3rem;display:block;margin-bottom:1rem">${svc.icon}</span>
        <h1>${h1}</h1>
        <p class="seo-lead">Découvrez les fourchettes de prix réelles pour les interventions ${esc(svc.label_adj)} à ${esc(city.label)} en 2025. Tarifs indicatifs basés sur les missions Fixeo dans la région de ${esc(city.region)}.</p>
      </section>

      <section class="seo-section">
        <h2>Tableau des tarifs — ${esc(svc.label)} à ${esc(city.label)}</h2>
        <table class="price-table">
          <thead><tr><th>Type d'intervention</th><th>Fourchette de prix</th></tr></thead>
          <tbody>${pricingRows}</tbody>
        </table>
        <p class="disclaimer-note">* Tarifs indicatifs basés sur les missions Fixeo à ${esc(city.label)}. Prix fourniture non incluse sauf mention contraire. Devis gratuit avant engagement.</p>
        ${serviceLinkHtml}
      </section>

      <section class="seo-section">
        <h2>Majorations applicables</h2>
        <table class="surcharge-table">
          <thead><tr><th>Condition</th><th>Majoration</th></tr></thead>
          <tbody>
            <tr><td>Urgence (intervention dans l'heure)</td><td style="color:#f87171;font-weight:600">+30 à 50%</td></tr>
            <tr><td>Nuit (20h–7h) et week-end</td><td style="color:#f87171;font-weight:600">+40 à 60%</td></tr>
            <tr><td>Jours fériés</td><td style="color:#f87171;font-weight:600">+50 à 70%</td></tr>
          </tbody>
        </table>
        <p class="disclaimer-note">Ces majorations doivent être annoncées dans le devis initial. Avec Fixeo, les artisans sont tenus de mentionner les majorations avant toute intervention.</p>
      </section>

      <section class="seo-section">
        <h2>Obtenez un devis gratuit à ${esc(city.label)}</h2>
        <p>Décrivez votre projet ou problème en quelques mots — Fixeo vous met en contact avec un artisan ${esc(svc.label_adj)} disponible à ${esc(city.label)} qui vous communique un devis avant de commencer. Pas de mauvaise surprise.</p>
        <div style="margin:1.5rem 0">
          <a class="seo-btn-link primary" href="/index.html#services" onclick="window.localStorage.setItem('fixeo_open_modal','1')">
            Demander un devis gratuit →
          </a>
        </div>
      </section>

      <section class="seo-section">
        <h2>Questions fréquentes — Prix ${esc(svc.label)} à ${esc(city.label)}</h2>
        ${faqHtml}
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
  console.log(`✅ 1B Price pages: ${count} generated`);
  return urls;
}

/* ═══════════════════════════════════════════════════════════
   1C — QUARTIER PAGES
══════════════════════════════════════════════════════════ */
function generateQuartierPages() {
  let count = 0;
  const urls = [];

  for (const [svcKey, svc] of Object.entries(QUARTIER_SERVICES)) {
    for (const [cityKey, quartiers] of Object.entries(QUARTIERS)) {
      const city = CITIES[cityKey];
      if (!city) continue;
      for (const quartierSlug of quartiers) {
        const quartierLabel = QUARTIER_LABELS[quartierSlug] || quartierSlug;
        const filename = `quartier-${svc.file_prefix}-${city.slug}-${quartierSlug}.html`;
        const canonicalPath = `/${svc.url_prefix}/${city.slug}/${quartierSlug}`;
        const canonicalUrl = `https://www.fixeo.ma${canonicalPath}`;
        const h1Label = `${svc.label} ${quartierLabel} ${city.label}`;
        const title = esc(`${h1Label} — Intervention rapide | Fixeo`);
        const metaDesc = esc(`${svc.label} disponible à ${quartierLabel}, ${city.label}. Fixeo vous connecte avec un artisan qualifié pour votre intervention ${svc.label_lower}. Devis gratuit, paiement après service.`);

        const localBusinessLD = {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": `Fixeo — ${svc.label} ${quartierLabel}`,
          "url": "https://www.fixeo.ma",
          "description": `${svc.label} disponible à ${quartierLabel}, ${city.label}`,
          "areaServed": [
            { "@type": "Place", "name": quartierLabel },
            { "@type": "City", "name": city.label }
          ],
          "address": { "@type": "PostalAddress", "addressLocality": city.label, "addressCountry": "MA" },
          "geo": { "@type": "GeoCoordinates", "latitude": city.lat, "longitude": city.lng }
        };

        const breadcrumbLD = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Fixeo", "item": "https://www.fixeo.ma" },
            { "@type": "ListItem", "position": 2, "name": svc.label, "item": `https://www.fixeo.ma/${svc.url_prefix}` },
            { "@type": "ListItem", "position": 3, "name": city.label, "item": `https://www.fixeo.ma/${svc.url_prefix}/${city.slug}` },
            { "@type": "ListItem", "position": 4, "name": quartierLabel, "item": canonicalUrl }
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
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">${JSON.stringify(localBusinessLD)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  <link rel="stylesheet" href="/css/seo-lp-v1.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">
  <style>
    .quartier-hero{padding:3rem 0 2rem}
    .quartier-cta-box{background:rgba(255,255,255,.05);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:2rem;margin:2rem 0;text-align:center}
  </style>
</head>
<body class="seo-service-page" data-theme="dark">
  <div class="bg-animated seo-bg"></div>
  <a href="#main-content" class="skip-link">Aller au contenu</a>
  ${navHTML()}
  <main id="main-content">
    <div class="seo-page-wrap">
      <section class="seo-hero quartier-hero">
        <nav class="seo-breadcrumbs" aria-label="Fil d'Ariane">
          <a href="/">Accueil</a> <span>›</span>
          <a href="/${svc.url_prefix}/${city.slug}">${esc(svc.label)} ${esc(city.label)}</a> <span>›</span>
          <span>${esc(quartierLabel)}</span>
        </nav>
        <h1>${esc(h1Label)} — Intervention rapide</h1>
        <p class="seo-lead">Vous cherchez un ${esc(svc.label_lower)} dans le quartier ${esc(quartierLabel)} à ${esc(city.label)} ? Fixeo vous connecte en quelques secondes avec un artisan disponible pour ${svc.desc(quartierLabel, city.label)}. Nos artisans vérifiés interviennent dans tous les secteurs de ${esc(city.label)}, y compris ${esc(quartierLabel)}, avec un temps de réponse optimal.</p>
        <div class="seo-actions">
          <a class="seo-btn-link primary" href="/index.html#services" onclick="window.localStorage.setItem('fixeo_open_modal','1')">
            Trouver un ${esc(svc.label_lower)} à ${esc(quartierLabel)} →
          </a>
        </div>
      </section>

      <section class="seo-section">
        <h2>${esc(svc.label)} à ${esc(quartierLabel)} : pourquoi Fixeo ?</h2>
        <p>Le quartier ${esc(quartierLabel)} fait partie des zones couvertes en priorité par le réseau Fixeo à ${esc(city.label)}. Nos artisans ${esc(svc.label_lower.toLowerCase())} connaissent les particularités des logements locaux — immeubles anciens, villas récentes, appartements en copropriété — et adaptent leurs interventions en conséquence.</p>
        <p>Chaque artisan Fixeo actif à ${esc(quartierLabel)} a été vérifié : identité, qualifications professionnelles, historique d'interventions et évaluations clients. Vous ne prenez aucun risque en passant par Fixeo.</p>
        <div class="quartier-cta-box">
          <h3>Besoin d'un ${esc(svc.label_lower)} à ${esc(quartierLabel)} maintenant ?</h3>
          <p>Disponible 7j/7, 24h/24. Devis gratuit avant intervention. Paiement après service.</p>
          <a class="seo-btn-link primary" href="/index.html#services" style="margin-top:1rem;display:inline-block" onclick="window.localStorage.setItem('fixeo_open_modal','1')">
            Demander une intervention →
          </a>
        </div>
      </section>

      <section class="seo-section">
        <h2>Zone couverte : ${esc(quartierLabel)} et alentours</h2>
        <p>En plus de ${esc(quartierLabel)}, nos artisans interviennent dans tous les quartiers adjacents de ${esc(city.label)}. Consultez notre page principale pour voir toutes les zones couvertes :</p>
        <p>→ <a href="/${svc.url_prefix}/${city.slug}">${esc(svc.label)} à ${esc(city.label)} — toutes les zones</a></p>
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
