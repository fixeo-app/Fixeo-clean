/**
 * service-hub-v3.js — FIXEO SEO V3 Service Hub Generator
 * =======================================================
 * Version: hub-v1
 *
 * Generates a top-level service hub page, e.g. /plombier
 * Role: national/service intent gateway → city discovery → FIXEO product journey
 * Distinct from service×city pages (local intent, artisan cards, local FAQ).
 *
 * TASK 2.7 — PILOT: /plombier only.
 * Do NOT generate all 8 hubs yet. Architecture established here first.
 *
 * USES:
 *   - seo/generators/shared/page-template.js  (buildPage, CORE_JS)
 *   - seo/generators/shared/seo-head.js       (via page-template)
 *   - seo/generators/shared/content-guard.js  (check)
 *   - seo/generators/shared/publishability.js (decide, buildPreservedSet)
 *   - css/seo-v3.css (served publicly; source copy at seo/assets/seo-v3.css)
 *   - seo/data/cities.json, services.json, artisan-counts.json, problems.json
 *
 * DOES NOT USE:
 *   - fixeo-local-flagship-v1.js  (removed — would overwrite hub with city artisans)
 *   - artisan-card-v3.js          (hub has no city-scoped artisan data — see note below)
 *   - fx-request-flow-v4.js       (not directly; linked via handoff URL only)
 *   - any RAFI/QSM/reservation modal assets
 *   - any legacy pvc-* runtime
 *
 * ARTISAN CARDS DECISION (documented):
 *   Hub-level artisan aggregation would require either:
 *   (a) Supabase query scoped to service only (no city) — returns unscoped national list
 *       with no deterministic ordering, no geographic relevance, high noise
 *   (b) Repeating static records from artisan-counts.json — only counts, no profile data
 *   Neither is architecturally clean for a hub page. Artisan cards are OMITTED at hub level.
 *   Service×city pages carry city-scoped cards. The hub refers users to city pages.
 *
 * CTA HANDOFF:
 *   Service-only: /?fx_service={slug}&fx_source=seo#hero-quick-search
 *   No fabricated fx_city — the request flow will ask for city normally.
 *
 * FLAGSHIP JS REMOVAL:
 *   fixeo-local-flagship-v1.js is in CORE_JS (emitted by page-template.js).
 *   It would attempt to inject city-scoped artisan cards into #fxlp-artisan-grid.
 *   Since hub has no artisan grid, this is a no-op at runtime — but we still
 *   remove it via the same mechanism as service-city-v3.js to keep the page clean.
 *
 * CITY LINK POLICY (per publishability.js):
 *   preserve → link (existing SEO equity, artisans present)
 *   review   → NOT featured in city grid (0 artisans, flagged for human review)
 *   block    → NOT featured
 *   publish  → would be featured (new combinations meeting threshold)
 *   For plombier pilot: 17 preserve, 3 review (mohammedia, el-jadida, khouribga)
 *
 * API:
 *   generateServiceHubPage(opts) → { html, meta, warnings }
 *   opts.serviceSlug  — canonical V3 service slug (e.g. 'plombier')
 *   opts.robots?      — default 'index,follow'
 *   opts.ctaHref?     — override CTA href (default derived from serviceSlug)
 *
 * FILE: seo/generators/service-hub-v3.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const { buildPage, CORE_JS } = require('./shared/page-template');
const { check }              = require('./shared/content-guard');
const { decide, buildPreservedSet } = require('./shared/publishability');
const { removeFlagshipScript, FLAGSHIP_SCRIPT_TAG } = require('./shared/v3-legacy-removal');
const { buildSeoHandoffHref } = require('./shared/seo-handoff-href');

const DATA_DIR = path.join(__dirname, '..', 'data');

/* ── Lazy-loaded data ─────────────────────────────────────────── */
let _data = null;
function data() {
  if (!_data) {
    _data = {
      services:      require(path.join(DATA_DIR, 'services.json')),
      cities:        require(path.join(DATA_DIR, 'cities.json')),
      artisanCounts: require(path.join(DATA_DIR, 'artisan-counts.json')),
      problems:      require(path.join(DATA_DIR, 'problems.json')),
    };
  }
  return _data;
}

/* ── Service slug → display data ──────────────────────────────── */
// Maps V3 canonical slugs to hub-specific content config.
// Extend when generating more than plombier in future tasks.
const HUB_CONTENT = {
  plombier: {
    serviceLabel:     'Plomberie',
    serviceLabelLong: 'Plomberie et travaux sanitaires',
    icon:             '🔧',
    h1:               'Plombier référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Plombier au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Trouvez un plombier référencé sur FIXEO dans votre ville au Maroc. Décrivez votre problème — fuite, débouchage, chauffe-eau — et recevez une prise en charge structurée avant toute intervention.',
    professionPlural: 'Plombiers',
    eyebrow:          'Plomberie',
    heroSubtitle:     'Fuites, canalisations, sanitaires, chauffe-eau — trouvez un plombier référencé sur FIXEO et structurez votre demande en quelques instants.',
    /* Common plumbing needs shown in the hub */
    needs: [
      { icon: '💧', label: 'Fuite d\'eau', desc: 'Joint, tuyau fissuré, raccord défaillant' },
      { icon: '🚽', label: 'WC bouché',   desc: 'Débouchage, siphon, mécanisme de chasse' },
      { icon: '🚿', label: 'Chauffe-eau', desc: 'Panne, remplacement, mise en service' },
      { icon: '🔩', label: 'Canalisation', desc: 'Débouchage, entartrage, inspection' },
      { icon: '🛁', label: 'Sanitaire',   desc: 'Installation, remplacement, réparation' },
      { icon: '🏠', label: 'Diagnostic',  desc: 'Recherche de fuite, pression, bilan' },
    ],
    /* Plumbing problem slugs from problems.json.
     * NOTE: a slug here does NOT automatically produce a public link.
     * Only slugs in publishedProblemSlugs (below) are currently live. */
    relatedProblemSlugs: ['fuite-eau', 'wc-bouche'],
    /* Problem slugs that currently resolve to a live public canonical URL.
     * EMPTY until /probleme/* pages are created and deployed.
     * Rule: only slugs listed here will be emitted as hub links.
     * Do NOT add a slug here before its public page exists. */
    publishedProblemSlugs: [],
    /* Price guidance text — truthful, no fake national certainty */
    priceGuidance: [
      { label: 'Diagnostic et déplacement', note: 'Variable selon la distance et l\'artisan. Détail dans le devis.' },
      { label: 'Débouchage simple',          note: 'Tarif établi après diagnostic sur site.' },
      { label: 'Remplacement de joint ou robinet', note: 'Dépend de la pièce et de l\'accessibilité.' },
      { label: 'Remplacement de chauffe-eau', note: 'Varie selon la capacité, le type et la marque.' },
    ],
    /* FAQ — visible only, no FAQPage JSON-LD */
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour la plomberie ?',
        a: 'Vous décrivez votre besoin sur FIXEO — fuite, débouchage, installation. Votre demande est transmise aux plombiers référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'Comment la disponibilité de l\'artisan est-elle confirmée ?',
        a: 'FIXEO transmet votre demande aux plombiers référencés correspondant à votre secteur. La disponibilité et le délai d\'intervention sont confirmés directement par l\'artisan selon son planning. FIXEO ne garantit ni disponibilité immédiate ni délai de réponse.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre situation, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un plombier via FIXEO ?',
        a: 'Des plombiers sont référencés dans les principales villes du Maroc : Casablanca, Rabat, Marrakech, Tanger, Fès, Agadir et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les plombiers ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les plombiers référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  electricien: {
    serviceLabel:     'Électricité',
    serviceLabelLong: 'Électricité et installations électriques',
    icon:             '⚡',
    h1:               'Électricien référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Électricien au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Panne électrique, tableau à remplacer, prise ou éclairage à installer — trouvez un électricien référencé sur FIXEO. Le tarif est confirmé par l\'artisan avant toute intervention.',
    professionPlural: 'Électriciens',
    eyebrow:          'Électricité',
    heroSubtitle:     'Pannes, installations, tableau électrique, mise aux normes — trouvez un électricien référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '⚡', label: 'Panne électrique',     desc: 'Disjoncteur, court-circuit, coupure de courant' },
      { icon: '🔌', label: 'Prise ou interrupteur', desc: 'Remplacement, ajout, mise aux normes' },
      { icon: '💡', label: 'Éclairage',             desc: 'Installation, remplacement, variation' },
      { icon: '🔧', label: 'Tableau électrique',    desc: 'Remplacement, mise aux normes, disjoncteur' },
      { icon: '📦', label: 'Câblage',               desc: 'Pose de câbles, gaines, alimentations' },
      { icon: '🔍', label: 'Diagnostic',            desc: 'Bilan électrique, conformité, sécurité' },
    ],
    relatedProblemSlugs: ['panne-electrique', 'disjoncteur-saute'],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Dépannage simple (disjoncteur, prise)',   note: 'Variable selon la nature de la panne et le déplacement.' },
      { label: 'Remplacement de tableau électrique',      note: 'Dépend du nombre de disjoncteurs et de la configuration.' },
      { label: 'Installation éclairage + prises (pièce)', note: 'Tarif établi après visite et évaluation du chantier.' },
      { label: 'Mise aux normes complète',                note: 'Varie selon la surface, l\'état de l\'installation existante et les travaux requis.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour l\'électricité ?',
        a: 'Vous décrivez votre besoin sur FIXEO — panne, installation, mise aux normes. Votre demande est transmise aux électriciens référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité de l\'artisan est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par l\'électricien selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre situation, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un électricien via FIXEO ?',
        a: 'Des électriciens sont référencés dans les principales villes du Maroc : Casablanca, Marrakech, Rabat, Fès, Tanger et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les électriciens ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les électriciens référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  serrurier: {
    serviceLabel:     'Serrurerie',
    serviceLabelLong: 'Serrurerie et sécurité des accès',
    icon:             '🔑',
    h1:               'Serrurier référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Serrurier au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Porte bloquée, serrure à changer, cylindre à renforcer — trouvez un serrurier référencé sur FIXEO au Maroc. Votre demande est transmise aux profils correspondant à votre secteur.',
    professionPlural: 'Serruriers',
    eyebrow:          'Serrurerie',
    heroSubtitle:     'Porte bloquée, serrure à remplacer, cylindre blindé — trouvez un serrurier référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '🚪', label: 'Porte bloquée',       desc: 'Porte claquée, serrure coincée, accès impossible' },
      { icon: '🔑', label: 'Remplacement serrure', desc: 'Cylindre, serrure multipoints, verrou' },
      { icon: '🔐', label: 'Clé cassée ou perdue', desc: 'Extraction, double de clé, remplacement' },
      { icon: '🛡️', label: 'Sécurisation',         desc: 'Après effraction, renforcement de porte' },
      { icon: '🚪', label: 'Cylindre blindé',       desc: 'Pose, remplacement, conseil sécurité' },
      { icon: '🔍', label: 'Diagnostic sécurité',  desc: 'Évaluation du niveau de protection, recommandations' },
    ],
    relatedProblemSlugs: ['porte-bloquee', 'serrure-cassee'],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Ouverture porte (porte claquée)',  note: 'Variable selon le type de serrure et la difficulté d\'accès.' },
      { label: 'Remplacement de cylindre',         note: 'Dépend du modèle choisi et de la configuration de la porte.' },
      { label: 'Pose d\'un cylindre blindé',       note: 'Varie selon le niveau de sécurité et la marque.' },
      { label: 'Installation porte blindée',        note: 'Tarif établi après visite et évaluation du chantier.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour la serrurerie ?',
        a: 'Vous décrivez votre besoin sur FIXEO — porte bloquée, serrure à changer, sécurisation. Votre demande est transmise aux serruriers référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité de l\'artisan est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par le serrurier selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre situation, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un serrurier via FIXEO ?',
        a: 'Des serruriers sont référencés dans les principales villes du Maroc : Casablanca, Marrakech, Rabat, Tanger et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les serruriers ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les serruriers référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  climatisation: {
    serviceLabel:     'Climatisation',
    serviceLabelLong: 'Climatisation et entretien des systèmes de traitement d\'air',
    icon:             '❄️',
    h1:               'Technicien climatisation référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Climatisation au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Installation, entretien annuel ou panne de climatiseur — trouvez un technicien référencé sur FIXEO au Maroc. Le tarif est établi par l\'artisan après diagnostic, avant toute intervention.',
    professionPlural: 'Techniciens climatisation',
    eyebrow:          'Climatisation',
    heroSubtitle:     'Installation, entretien, panne, recharge gaz — trouvez un technicien climatisation référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '❄️', label: 'Climatiseur en panne',   desc: 'Diagnostic, réparation, remplacement de pièce' },
      { icon: '🏠', label: 'Installation',            desc: 'Split mural, multi-split, climatisation réversible' },
      { icon: '🧹', label: 'Nettoyage et entretien', desc: 'Filtres, évaporateur, condenseur, entretien annuel' },
      { icon: '🧊', label: 'Recharge gaz',            desc: 'Réfrigérant R32, R410A, vérification de circuit' },
      { icon: '🔊', label: 'Bruit ou fuite',          desc: 'Vibrations, fuite d\'eau, bruit anormal' },
      { icon: '🔍', label: 'Diagnostic de panne',     desc: 'Identification du problème, bilan du système' },
    ],
    relatedProblemSlugs: ['climatisation-en-panne'],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Nettoyage filtres + entretien annuel', note: 'Variable selon le modèle et le nombre d\'unités.' },
      { label: 'Recharge gaz réfrigérant',             note: 'Dépend du type de gaz et de la quantité nécessaire.' },
      { label: 'Installation split mural',             note: 'Varie selon la capacité (BTU), le modèle et la configuration du local.' },
      { label: 'Dépannage panne électronique',         note: 'Tarif établi après diagnostic et identification de la pièce défaillante.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour la climatisation ?',
        a: 'Vous décrivez votre besoin sur FIXEO — panne, installation, entretien. Votre demande est transmise aux techniciens climatisation référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité de l\'artisan est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par le technicien selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre situation, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un technicien climatisation via FIXEO ?',
        a: 'Des techniciens climatisation sont référencés dans les principales villes du Maroc : Casablanca, Salé, Tanger, Marrakech, Rabat et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les techniciens ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les techniciens référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  peintre: {
    serviceLabel:     'Peinture',
    serviceLabelLong: 'Peinture intérieure et extérieure',
    icon:             '🎨',
    h1:               'Peintre référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Peintre au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Murs, plafonds, façade ou rénovation complète — trouvez un peintre référencé sur FIXEO au Maroc. Décrivez vos surfaces, le tarif est communiqué avant le démarrage des travaux.',
    professionPlural: 'Peintres',
    eyebrow:          'Peinture',
    heroSubtitle:     'Peinture intérieure, extérieure, enduit, plafonds et boiseries — trouvez un peintre référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '🚪', label: 'Peinture intérieure',    desc: 'Murs, plafonds, couloirs, chambres' },
      { icon: '🏠', label: 'Peinture extérieure',    desc: 'Façade, murs extérieurs, clôture' },
      { icon: '🪵', label: 'Préparation des murs',   desc: 'Rebouchage, lissage, ponçage, impression' },
      { icon: '🔧', label: 'Enduit et rebouchage',   desc: 'Fissures, trous, irrégularités de surface' },
      { icon: '🪟', label: 'Plafonds et boiseries',  desc: 'Peinture en hauteur, volets, huisseries' },
      { icon: '🔍', label: 'Conseil et diagnostic',  desc: 'Choix des produits, état des surfaces, devis' },
    ],
    relatedProblemSlugs: [],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Peinture d\'une pièce (préparation incluse)', note: 'Variable selon la surface, l\'état des murs et les produits utilisés.' },
      { label: 'Appartement 3 pièces complet',                note: 'Tarif établi après visite et estimation de la surface totale.' },
      { label: 'Enduit + peinture (au m²)',                   note: 'Dépend de l\'état initial des murs et du nombre de couches requis.' },
      { label: 'Peinture façade extérieure (au m²)',          note: 'Varie selon la hauteur, l\'accessibilité et le type de support.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour la peinture ?',
        a: 'Vous décrivez votre besoin sur FIXEO — peinture d\'une pièce, d\'un appartement, d\'une façade. Votre demande est transmise aux peintres référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité de l\'artisan est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par le peintre selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre situation, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un peintre via FIXEO ?',
        a: 'Des peintres sont référencés dans les principales villes du Maroc : Casablanca, Marrakech, Kénitra, Rabat et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les peintres ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les peintres référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  menuisier: {
    serviceLabel:     'Menuiserie',
    serviceLabelLong: 'Menuiserie et travaux sur bois',
    icon:             '🪵',
    h1:               'Menuisier référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Menuisier au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Portes, placards, meubles sur mesure ou cuisine — trouvez un menuisier référencé sur FIXEO au Maroc. L\'artisan évalue votre projet et confirme le tarif avant d\'intervenir.',
    professionPlural: 'Menuisiers',
    eyebrow:          'Menuiserie',
    heroSubtitle:     'Portes, fenêtres, meubles sur mesure, cuisines et boiseries — trouvez un menuisier référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '🚪', label: 'Portes et fenêtres',     desc: 'Pose, remplacement, réglage, réparation' },
      { icon: '🪑', label: 'Meubles sur mesure',      desc: 'Dressing, bibliothèque, rangements, mobilier' },
      { icon: '🪵', label: 'Boiseries et habillages', desc: 'Lambris, parquet, revêtement mural bois' },
      { icon: '🍽️', label: 'Cuisine et placard',      desc: 'Cuisine sur mesure, placard intégré, étagères' },
      { icon: '🔧', label: 'Réparation',              desc: 'Remise en état de meuble, porte, parquet' },
      { icon: '🔍', label: 'Conseil et diagnostic',   desc: 'Faisabilité, choix des matériaux, devis' },
    ],
    relatedProblemSlugs: [],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Pose ou remplacement porte intérieure', note: 'Variable selon le modèle, la pose et la finition.' },
      { label: 'Meuble sur mesure (petite pièce)',       note: 'Dépend des matériaux choisis, des dimensions et de la complexité.' },
      { label: 'Cuisine sur mesure (au mètre linéaire)', note: 'Varie selon les matériaux, les équipements et la configuration.' },
      { label: 'Boiseries et habillage mural (au m²)',   note: 'Tarif établi après visite et estimation de la surface.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour la menuiserie ?',
        a: 'Vous décrivez votre besoin sur FIXEO — pose de porte, meuble sur mesure, cuisine, boiseries. Votre demande est transmise aux menuisiers référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité de l\'artisan est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par le menuisier selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre besoin, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un menuisier via FIXEO ?',
        a: 'Des menuisiers sont référencés dans les principales villes du Maroc : Casablanca, Marrakech, Salé, Fès, Agadir et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les menuisiers ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les menuisiers référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  macon: {
    serviceLabel:     'Maçonnerie',
    serviceLabelLong: 'Maçonnerie et travaux de gros œuvre',
    icon:             '🧱',
    h1:               'Maçon référencé au Maroc — trouver un professionnel sur FIXEO',
    metaTitle:        'Maçon au Maroc — Professionnels référencés sur FIXEO',
    metaDesc:         'Maçonnerie, carrelage, ravalement de façade ou petites reprises — trouvez un maçon référencé sur FIXEO au Maroc. Le tarif est confirmé après évaluation du chantier, avant tout démarrage.',
    professionPlural: 'Maçons',
    eyebrow:          'Maçonnerie',
    heroSubtitle:     'Maçonnerie générale, ravalement, carrelage, chape et cloisons — trouvez un maçon référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '🧱', label: 'Maçonnerie générale',    desc: 'Construction, réparation, reprise de mur' },
      { icon: '🏗️', label: 'Ravalement de façade',   desc: 'Nettoyage, enduit, rénovation de façade' },
      { icon: '🪨', label: 'Carrelage et dallage',    desc: 'Pose, remplacement, joints, terrasse' },
      { icon: '📐', label: 'Chape et béton',          desc: 'Coulage, ragréage, nivellement de sol' },
      { icon: '🧰', label: 'Cloisons et ouvertures', desc: 'Création de cloison, réservation d\'ouverture, modification d\'espace' },
      { icon: '🔍', label: 'Reprises et réparations',    desc: 'Fissures, érosion, remise en état de maçonnerie' },
    ],
    relatedProblemSlugs: [],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Maçonnerie générale (au m²)',       note: 'Variable selon la nature des travaux, les matériaux et la difficulté d\'accès.' },
      { label: 'Ravalement de façade (au m²)',      note: 'Dépend de l\'état de la façade et du type d\'enduit choisi.' },
      { label: 'Pose de carrelage (au m²)',         note: 'Varie selon le format des carreaux, le type de pose et les finitions.' },
      { label: 'Chape ou dallage (au m²)',          note: 'Tarif établi après visite et évaluation de la surface à traiter.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour la maçonnerie ?',
        a: 'Vous décrivez votre besoin sur FIXEO — maçonnerie, carrelage, ravalement, cloison. Votre demande est transmise aux maçons référencés correspondant à votre secteur. L\'artisan qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité de l\'artisan est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par le maçon selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par l\'artisan après évaluation de votre chantier, avant toute intervention. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin des travaux.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un maçon via FIXEO ?',
        a: 'Des maçons sont référencés dans les principales villes du Maroc : Marrakech, Casablanca, Rabat, Tanger et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les maçons ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les maçons référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },

  nettoyage: {
    serviceLabel:     'Nettoyage',
    serviceLabelLong: 'Services de nettoyage et entretien',
    icon:             '🧹',
    h1:               'Service de nettoyage référencé au Maroc — trouver un prestataire sur FIXEO',
    metaTitle:        'Nettoyage au Maroc — Prestataires référencés sur FIXEO',
    metaDesc:         'Logement, bureaux, fin de chantier ou entretien ponctuel — trouvez un prestataire de nettoyage référencé sur FIXEO au Maroc. Tarif communiqué avant toute prestation.',
    professionPlural: 'Prestataires de nettoyage',
    eyebrow:          'Nettoyage',
    heroSubtitle:     'Appartement, bureaux, après travaux, après déménagement, vitres — trouvez un prestataire de nettoyage référencé sur FIXEO et structurez votre demande en quelques instants.',
    needs: [
      { icon: '🏠', label: 'Maison ou appartement', desc: 'Nettoyage complet, ménage régulier ou ponctuel' },
      { icon: '🏢', label: 'Bureaux et locaux',      desc: 'Entretien de locaux professionnels, espaces communs' },
      { icon: '🧱', label: 'Après travaux',          desc: 'Déblayage, dépoussiérage, nettoyage de chantier' },
      { icon: '📦', label: 'Après déménagement',     desc: 'Remise en état, nettoyage avant ou après emménagement' },
      { icon: '🪟', label: 'Vitres et surfaces',     desc: 'Nettoyage de vitres, baies vitrées, surfaces en hauteur' },
      { icon: '🔍', label: 'Besoin spécifique',       desc: 'Grand nettoyage, désinfection, cas particulier' },
    ],
    relatedProblemSlugs: [],
    publishedProblemSlugs: [],
    priceGuidance: [
      { label: 'Nettoyage appartement (par session)', note: 'Variable selon la surface, le niveau de nettoyage et la fréquence.' },
      { label: 'Nettoyage bureaux (au m²)',           note: 'Dépend de la surface, de la configuration et de la fréquence souhaitée.' },
      { label: 'Nettoyage après travaux (au m²)',     note: 'Varie selon l\'état du chantier et la nature des résidus à traiter.' },
      { label: 'Nettoyage de vitres (par vitre)',     note: 'Tarif établi selon l\'accessibilité et la taille des surfaces vitrées.' },
    ],
    faq: [
      {
        q: 'Comment fonctionne FIXEO pour le nettoyage ?',
        a: 'Vous décrivez votre besoin sur FIXEO — appartement, bureaux, après travaux, vitres. Votre demande est transmise aux prestataires de nettoyage référencés correspondant à votre secteur. Le prestataire qui prend en charge votre demande vous contacte et confirme le tarif avant d\'intervenir.'
      },
      {
        q: 'La disponibilité du prestataire est-elle garantie ?',
        a: 'Non. FIXEO met votre demande en relation avec les professionnels référencés sur la plateforme. La disponibilité et le délai d\'intervention sont confirmés directement par le prestataire selon son planning.'
      },
      {
        q: 'Le tarif est-il fixé à l\'avance ?',
        a: 'Le tarif définitif est communiqué par le prestataire après évaluation de votre besoin, avant toute prestation. Vous n\'avez aucune obligation d\'accepter. Le paiement s\'effectue uniquement après la fin de la prestation.'
      },
      {
        q: 'Dans quelles villes puis-je trouver un service de nettoyage via FIXEO ?',
        a: 'Des prestataires de nettoyage sont référencés dans les principales villes du Maroc : Casablanca, Agadir, Tanger, Marrakech, Rabat et d\'autres villes. Chaque page de ville affiche les profils référencés disponibles dans ce secteur.'
      },
      {
        q: 'FIXEO emploie-t-il directement les prestataires ?',
        a: 'Non. FIXEO est une plateforme de mise en relation. Les prestataires référencés exercent leur activité de manière indépendante. FIXEO structure et oriente votre demande vers les profils correspondant à votre besoin.'
      },
    ],
  },
};

/* ── Flagship JS removal — delegated to shared/v3-legacy-removal.js ─
 *  Re-export for test compatibility only. All logic is in v3-legacy-removal.
 */
const _FLAGSHIP_SCRIPT_TAG = FLAGSHIP_SCRIPT_TAG;
const _removeFlagshipScript = removeFlagshipScript;

/* ── HTML escaping ────────────────────────────────────────────── */
function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── City grid builder ────────────────────────────────────────── */
function _buildCityGrid(serviceSlug, htmlFiles) {
  const d = data();
  const preserved = buildPreservedSet(d.services, htmlFiles);
  const allCities = Object.keys(d.cities).filter(k => k !== '_meta');
  const cities = d.cities;
  const counts  = d.artisanCounts;

  const linkedCities  = [];
  const reviewCities  = [];

  allCities.forEach(citySlug => {
    const count = (counts[citySlug] && counts[citySlug][serviceSlug]) || 0;
    const result = decide(citySlug, serviceSlug, count, preserved.has(citySlug + '/' + serviceSlug), cities, d.services);
    const cityObj = cities[citySlug];
    const label = cityObj ? cityObj.label : citySlug;
    if (result.status === 'preserve' || result.status === 'publish') {
      linkedCities.push({ slug: citySlug, label, count, status: result.status });
    } else if (result.status === 'review') {
      reviewCities.push({ slug: citySlug, label, count, status: result.status });
    }
    // block → silently omitted
  });

  return { linkedCities, reviewCities };
}

function _buildCityGridHtml(serviceSlug, linkedCities, serviceLabel, professionPlural) {
  if (!linkedCities.length) return '';
  const rows = linkedCities.map(c => {
    const href = `/${_esc(serviceSlug)}/${_esc(c.slug)}`;
    const count = c.count > 0
      ? `<span class="fxlp-hub-city-count">${c.count} profil${c.count > 1 ? 's' : ''}</span>`
      : '';
    return `<a href="${href}" class="fxlp-hub-city-chip">\
<span class="fxlp-hub-city-name">${_esc(c.label)}</span>${count}</a>`;
  }).join('\n        ');

  return `<section class="fxlp-section fxlp-hub-cities-section">
  <div class="fxlp-section-inner">
    <div class="fxlp-eyebrow">Villes couvertes</div>
    <h2 class="fxlp-h2">${_esc(professionPlural || serviceLabel)} référencés par ville</h2>
    <p class="fxlp-section-lead">Sélectionnez votre ville pour consulter les profils référencés sur FIXEO dans votre secteur.</p>
    <div class="fxlp-hub-city-grid">
        ${rows}
    </div>
  </div>
</section>`;
}

/* ── Needs section ─────────────────────────────────────────────── */
function _buildNeedsHtml(needs, labelAdj) {
  const cards = needs.map(n =>
    `<div class="fxlp-hub-need-card">
      <span class="fxlp-hub-need-icon" aria-hidden="true">${n.icon}</span>
      <strong class="fxlp-hub-need-label">${_esc(n.label)}</strong>
      <span class="fxlp-hub-need-desc">${_esc(n.desc)}</span>
    </div>`
  ).join('\n    ');

  return `<section class="fxlp-section fxlp-hub-needs-section">
  <div class="fxlp-section-inner">
    <div class="fxlp-eyebrow">Besoins courants</div>
    <h2 class="fxlp-h2">Quels problèmes ${_esc(labelAdj)} FIXEO peut-il vous aider à structurer&nbsp;?</h2>
    <div class="fxlp-hub-needs-grid">
    ${cards}
    </div>
  </div>
</section>`;
}

/* ── How it works section ──────────────────────────────────────── */
function _buildHowItWorksHtml(serviceLabel, profession) {
  return `<section class="fxlp-section fxlp-hub-how-section">
  <div class="fxlp-section-inner">
    <div class="fxlp-eyebrow">Comment ça marche</div>
    <h2 class="fxlp-h2">Le parcours FIXEO pour votre besoin en ${_esc(serviceLabel.toLowerCase())}</h2>
    <ol class="fxlp-steps">
      <li class="fxlp-step">
        <span class="fxlp-step-icon" aria-hidden="true">1</span>
        <div class="fxlp-step-body">
          <strong class="fxlp-step-title">Décrivez votre besoin</strong>
          <p class="fxlp-step-text">Expliquez votre besoin et votre localisation. FIXEO structure votre demande pour la transmettre aux profils correspondants.</p>
        </div>
      </li>
      <li class="fxlp-step">
        <span class="fxlp-step-icon" aria-hidden="true">2</span>
        <div class="fxlp-step-body">
          <strong class="fxlp-step-title">Votre demande est orientée</strong>
          <p class="fxlp-step-text">FIXEO transmet votre demande aux ${_esc(profession)}s référencés correspondant à votre secteur et votre type de besoin.</p>
        </div>
      </li>
      <li class="fxlp-step">
        <span class="fxlp-step-icon" aria-hidden="true">3</span>
        <div class="fxlp-step-body">
          <strong class="fxlp-step-title">L'artisan vous contacte</strong>
          <p class="fxlp-step-text">Le ${_esc(profession)} qui prend en charge votre demande vous appelle, évalue la situation et confirme le tarif avant d'intervenir.</p>
        </div>
      </li>
      <li class="fxlp-step">
        <span class="fxlp-step-icon" aria-hidden="true">4</span>
        <div class="fxlp-step-body">
          <strong class="fxlp-step-title">Paiement après intervention</strong>
          <p class="fxlp-step-text">Vous payez uniquement une fois l'intervention terminée. Les conditions sont confirmées avec l'artisan avant le démarrage.</p>
        </div>
      </li>
    </ol>
  </div>
</section>`;
}

/* ── Price guidance section ────────────────────────────────────── */
function _buildPriceHtml(priceItems, serviceLabel) {
  const rows = priceItems.map(p =>
    `<div class="fxlp-hub-price-row">
      <span class="fxlp-hub-price-label">${_esc(p.label)}</span>
      <span class="fxlp-hub-price-note">${_esc(p.note)}</span>
    </div>`
  ).join('\n    ');

  return `<section class="fxlp-section fxlp-hub-price-section">
  <div class="fxlp-section-inner">
    <div class="fxlp-eyebrow">Tarification</div>
    <h2 class="fxlp-h2">Facteurs de prix en ${_esc(serviceLabel.toLowerCase())}</h2>
    <p class="fxlp-section-lead">Les tarifs varient selon la nature de l'intervention, l'accessibilité et la localisation. L'artisan vous communique le tarif définitif avant toute intervention.</p>
    <div class="fxlp-hub-price-table">
    ${rows}
    </div>
    <p class="fxlp-hub-price-note-global">Les conditions et le tarif sont confirmés avec l'artisan avant le démarrage des travaux.</p>
  </div>
</section>`;
}

/* ── Related problems section ──────────────────────────────────── */
/**
 * Build related-problems chip section for the hub.
 *
 * TWO-LAYER GATE:
 *   (1) slugs must exist in problems.json (data existence)
 *   (2) slugs must be in publishedSlugs (URL existence / public route live)
 *
 * If no items pass both gates, returns '' (no section, no heading, no container).
 * This prevents broken links to future problem pages not yet publicly deployed.
 *
 * @param {string[]} slugs          - problem slugs from HUB_CONTENT.relatedProblemSlugs
 * @param {string}   serviceRouteKey - e.g. 'plombier' (from services.json canonicalRouteKey)
 * @param {string[]} publishedSlugs - problem slugs confirmed live (from HUB_CONTENT.publishedProblemSlugs)
 */
function _buildProblemsHtml(slugs, serviceRouteKey, publishedSlugs) {
  const d = data();
  const parentRoute = '/' + (serviceRouteKey || 'plombier');
  // Build a Set of currently-published slug names for O(1) lookup
  const published = new Set(Array.isArray(publishedSlugs) ? publishedSlugs : []);

  const items = slugs
    .map(s => d.problems[s])
    .filter(Boolean)
    // Gate 1: must belong to this service
    .filter(p => p.parent_service_route === parentRoute)
    // Gate 2: public URL must currently exist (confirmed in publishedProblemSlugs)
    .filter(p => published.has(p.slug));

  // No live problem destinations → omit section entirely (no empty heading/container)
  if (!items.length) return '';

  const links = items.map(p =>
    `<a href="/probleme/${_esc(p.slug)}" class="fxlp-hub-problem-chip">
      <span aria-hidden="true">${p.icon || '🔧'}</span>
      ${_esc(p.label)}
    </a>`
  ).join('\n    ');

  return `<section class="fxlp-section fxlp-hub-problems-section">
  <div class="fxlp-section-inner">
    <div class="fxlp-eyebrow">Problèmes courants</div>
    <h2 class="fxlp-h2">Problèmes fréquents</h2>
    <p class="fxlp-section-lead">FIXEO permet de structurer et orienter votre demande pour les situations suivantes. Chaque page détaille le diagnostic et le processus d'intervention.</p>
    <div class="fxlp-hub-problem-chips">
    ${links}
    </div>
  </div>
</section>`;
}

/* ── FAQ section ───────────────────────────────────────────────── */
function _buildFaqHtml(faqItems, serviceLabel) {
  const items = faqItems.map(f =>
    `<details class="fxlp-faq-item">
      <summary class="fxlp-faq-summary">${_esc(f.q)}</summary>
      <p class="fxlp-faq-answer">${_esc(f.a)}</p>
    </details>`
  ).join('\n    ');

  return `<section class="fxlp-section fxlp-hub-faq-section">
  <div class="fxlp-section-inner">
    <div class="fxlp-eyebrow">Questions fréquentes</div>
    <h2 class="fxlp-h2">Tout savoir sur FIXEO et la ${_esc(serviceLabel.toLowerCase())}</h2>
    <div class="fxlp-faq">
    ${items}
    </div>
  </div>
</section>`;
}

/* ── CTA section ───────────────────────────────────────────────── */
function _buildCtaHtml(serviceSlug, ctaHref, profession) {
  const href = ctaHref || `/?fx_service=${encodeURIComponent(serviceSlug)}&fx_source=seo#hero-quick-search`;
  return `<section class="fxlp-section fxlp-cta-banner">
  <div class="fxlp-section-inner fxlp-cta-inner">
    <div class="fxlp-cta-eyebrow">Votre demande</div>
    <h2 class="fxlp-cta-title">Besoin d'un ${_esc(profession)}&nbsp;? Décrivez votre situation.</h2>
    <p class="fxlp-cta-sub">Votre demande est transmise aux ${_esc(profession)}s référencés correspondant à votre secteur. L'artisan confirme le tarif avant d'intervenir.</p>
    <a href="${_esc(href)}" class="fxlp-cta-btn fxlp-cta-btn--primary">
      Décrire mon besoin
    </a>
    <p class="fxlp-cta-note">Formulaire disponible à toute heure · Paiement après intervention</p>
  </div>
</section>`;
}

/* ── Hub-specific CSS additions ────────────────────────────────── */
const HUB_CSS = `
/* ── Service Hub V3 — hub-specific layout extensions ── */
/* Scoped to body.seo-service-page (set by page-template.js) */

body.seo-service-page .fxlp-hub-needs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

body.seo-service-page .fxlp-hub-need-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--v3-surface);
  border: 1px solid var(--v3-border);
  border-radius: 12px;
  padding: 1.1rem 1rem;
  transition: border-color 0.2s;
}
body.seo-service-page .fxlp-hub-need-card:hover { border-color: rgba(255,107,61,0.4); }
body.seo-service-page .fxlp-hub-need-icon  { font-size: 1.5rem; }
body.seo-service-page .fxlp-hub-need-label { font-size: 0.92rem; font-weight: 700; color: var(--v3-text); }
body.seo-service-page .fxlp-hub-need-desc  { font-size: 0.78rem; color: var(--v3-muted); line-height: 1.4; }

/* City grid */
body.seo-service-page .fxlp-hub-city-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
body.seo-service-page .fxlp-hub-city-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--v3-surface);
  border: 1px solid var(--v3-border);
  border-radius: 24px;
  padding: 0.55rem 1.1rem;
  text-decoration: none;
  color: var(--v3-text);
  font-size: 0.88rem;
  font-weight: 600;
  transition: border-color 0.2s, background 0.2s;
}
body.seo-service-page .fxlp-hub-city-chip:hover {
  border-color: rgba(255,107,61,0.5);
  background: rgba(255,107,61,0.06);
  color: #ff6b3d;
}
body.seo-service-page .fxlp-hub-city-count {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--v3-muted);
  background: rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 0.1rem 0.45rem;
}

/* Price table */
body.seo-service-page .fxlp-hub-price-table { margin-top: 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; }
body.seo-service-page .fxlp-hub-price-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  background: var(--v3-surface);
  border: 1px solid var(--v3-border);
  border-radius: 10px;
}
body.seo-service-page .fxlp-hub-price-label { font-weight: 700; font-size: 0.9rem; color: var(--v3-text); }
body.seo-service-page .fxlp-hub-price-note  { font-size: 0.82rem; color: var(--v3-muted); text-align: right; }
body.seo-service-page .fxlp-hub-price-note-global {
  margin-top: 0.75rem;
  font-size: 0.82rem;
  color: var(--v3-muted);
  font-style: italic;
}

/* Problem chips */
body.seo-service-page .fxlp-hub-problem-chips { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
body.seo-service-page .fxlp-hub-problem-chip {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: var(--v3-surface);
  border: 1px solid var(--v3-border);
  border-radius: 24px;
  padding: 0.55rem 1.1rem;
  text-decoration: none;
  color: var(--v3-text);
  font-size: 0.88rem;
  font-weight: 600;
  transition: border-color 0.2s;
}
body.seo-service-page .fxlp-hub-problem-chip:hover { border-color: rgba(255,107,61,0.5); color: #ff6b3d; }

/* Hub hero subtitle */
body.seo-service-page .fxlp-hero-subtitle {
  font-size: clamp(1rem, 2.5vw, 1.15rem);
  color: var(--v3-muted);
  max-width: 680px;
  margin: 0.75rem auto 0;
  text-align: center;
  line-height: 1.6;
}

/* How section */
body.seo-service-page .fxlp-hub-how-section .fxlp-steps { list-style: none; padding: 0; margin: 1.5rem 0 0; }
body.seo-service-page .fxlp-hub-cities-section,
body.seo-service-page .fxlp-hub-how-section,
body.seo-service-page .fxlp-hub-needs-section,
body.seo-service-page .fxlp-hub-price-section,
body.seo-service-page .fxlp-hub-problems-section,
body.seo-service-page .fxlp-hub-faq-section { padding: 4rem 0; }

/* Section lead text */
body.seo-service-page .fxlp-section-lead {
  font-size: 1rem;
  color: var(--v3-muted);
  max-width: 640px;
  line-height: 1.65;
  margin-top: 0.5rem;
}

/* h2 inside sections */
body.seo-service-page .fxlp-h2 {
  font-size: clamp(1.25rem, 3vw, 1.65rem);
  font-weight: 800;
  color: var(--v3-text);
  margin: 0.25rem 0 0.5rem;
  line-height: 1.25;
}

/* Mobile */
@media (max-width: 640px) {
  body.seo-service-page .fxlp-hub-needs-grid { grid-template-columns: repeat(2, 1fr); }
  body.seo-service-page .fxlp-hub-price-row { flex-direction: column; gap: 0.2rem; }
  body.seo-service-page .fxlp-hub-price-note { text-align: left; }
  body.seo-service-page .fxlp-hub-city-chip { font-size: 0.83rem; padding: 0.45rem 0.9rem; }
  body.seo-service-page .fxlp-hub-how-section .fxlp-step { padding: 0.9rem; }
}

@media (max-width: 390px) {
  body.seo-service-page .fxlp-hub-needs-grid { grid-template-columns: 1fr 1fr; gap: 0.65rem; }
}
`;

/* ── Write hub CSS to a temp inline block ──────────────────────── */
// We inject hub CSS as an inline <style> block in the page rather than a
// separate file, since this is a pilot. A future task should extract to
// css/service-hub-v3.css (moved to public css/ dir in Task 2.11 hotfix)
function _buildInlineCssBlock(css) {
  return `\n<style data-hub-v3="true">\n${css}\n</style>`;
}

/* ── Main generator ────────────────────────────────────────────── */

/**
 * generateServiceHubPage(opts)
 *
 * @param {string}  opts.serviceSlug  — canonical V3 service slug
 * @param {string}  [opts.robots]     — default 'index,follow'
 * @param {string}  [opts.ctaHref]    — override CTA href
 * @returns {{ html: string, meta: object, warnings: string[] }}
 */
function generateServiceHubPage(opts) {
  if (!opts || !opts.serviceSlug) throw new Error('service-hub-v3: serviceSlug is required');

  const { serviceSlug, robots = 'index,follow', ctaHref } = opts;
  const warnings = [];

  const hubContent = HUB_CONTENT[serviceSlug];
  if (!hubContent) throw new Error(`service-hub-v3: no hub content defined for serviceSlug "${serviceSlug}"`);

  const d = data();
  const serviceData = d.services[serviceSlug];
  if (!serviceData) throw new Error(`service-hub-v3: serviceSlug "${serviceSlug}" not found in services.json`);

  /* ── Canonical CTA href (via shared builder) ── */
  const canonicalCtaHref = ctaHref || buildSeoHandoffHref({ serviceSlug });

  /* ── City link policy ── */
  let htmlFiles;
  try {
    const rootDir = path.join(__dirname, '..', '..');
    htmlFiles = require('fs').readdirSync(rootDir).filter(f => f.endsWith('.html'));
  } catch (_) {
    htmlFiles = [];
    warnings.push('Could not read root HTML files for publishability check');
  }
  const { linkedCities, reviewCities } = _buildCityGrid(serviceSlug, htmlFiles);

  if (reviewCities.length) {
    warnings.push(`${reviewCities.length} city/cities in review status (0 artisans, not featured in hub): ${reviewCities.map(c => c.slug).join(', ')}`);
  }

  /* ── Build page sections ── */
  const heroHtml = `<div class="fxlp-hero-body">
  <div class="fxlp-eyebrow">
    <span class="fxlp-eyebrow-dot" aria-hidden="true"></span>
    ${_esc(hubContent.eyebrow)}
  </div>
  <h1 class="fxlp-h1">${_esc(hubContent.h1)}</h1>
  <p class="fxlp-hero-subtitle">${_esc(hubContent.heroSubtitle)}</p>
  <div class="fxlp-hero-ctas">
    <a href="${_esc(canonicalCtaHref)}" class="fxlp-cta-btn fxlp-cta-btn--primary">
      Décrire mon besoin
    </a>
  </div>
</div>`;

  // Build HTML body manually (hub structure differs from service-city)
  const profession  = serviceData.profession  || hubContent.serviceLabel.toLowerCase();
  const labelAdj    = serviceData.label_adj   || hubContent.serviceLabel.toLowerCase();

  const bodySections = [
    _buildNeedsHtml(hubContent.needs, labelAdj),
    _buildCityGridHtml(serviceSlug, linkedCities, hubContent.serviceLabel, hubContent.professionPlural),
    _buildHowItWorksHtml(hubContent.serviceLabel, profession),
    _buildPriceHtml(hubContent.priceGuidance, hubContent.serviceLabel),
    _buildProblemsHtml(hubContent.relatedProblemSlugs, serviceData.canonicalRouteKey, hubContent.publishedProblemSlugs),
    _buildFaqHtml(hubContent.faq, hubContent.serviceLabel),
    _buildCtaHtml(serviceSlug, canonicalCtaHref, profession),
  ].join('\n\n');

  /* ── buildPage via page-template.js ── */
  // We pass sections as empty array and inject hub content via a post-processing
  // sentinel. page-template.js section types (text/list/steps/faq/cta) don't
  // cover the rich hub layout (city grid, needs cards, price table). Rather than
  // polluting page-template with hub-specific types, we use a lightweight
  // post-processing approach: insert a sentinel placeholder in the hero, then
  // replace it with the hub sections after buildPage completes.
  // The sentinel is a valid HTML comment that cannot appear in content.

  const breadcrumbs = [
    { name: 'Accueil', path: '/' },
    { name: hubContent.serviceLabel, path: null }, // current page — no href on last item
  ];

  // Build page-template compliant sections from hub content
  // page-template supports: text, list, steps, faq, cta
  // Hub-specific rich sections (city grid, needs cards, price table) are injected
  // via string post-processing after buildPage, using a safe sentinel comment.
  // This keeps page-template.js untouched while delivering hub-specific richness.

  const BODY_SENTINEL = '<!-- HUB-SECTIONS-BODY -->';

  // Use page-template FAQ for the standard FAQ section
  const sections = [
    {
      type: 'faq',
      heading: 'Questions fréquentes',
      items: hubContent.faq,
    },
  ];

  let html = buildPage({
    pageType:  'service-hub',
    generator: 'service-hub-v3/hub-v1',
    seo: {
      title:         hubContent.metaTitle,
      description:   hubContent.metaDesc,
      canonicalPath: `/${serviceSlug}`,
      robots,
      service: {
        label: hubContent.serviceLabel,
        key:   serviceSlug,
      },
      breadcrumbs,
    },
    hero: {
      eyebrow:  hubContent.eyebrow.toUpperCase() + ' — MAROC',
      h1:       hubContent.h1,
      intro:    hubContent.heroSubtitle,
      ctaPrimary: {
        label: 'Décrire mon besoin',
        href:  canonicalCtaHref,
      },
      trustLine: 'Formulaire disponible à toute heure · Paiement après intervention',
      chips: [
        { icon: hubContent.icon, text: hubContent.serviceLabel },
        { icon: '📍', text: 'Maroc' },
        { icon: '✓', text: 'Paiement après intervention' },
      ],
    },
    sections,
    extraCss: [
      '/css/seo-v3.css',
      '/css/service-hub-v3.css',
    ],
    extraJs: [
      { src: '/js/fixeo-seo-handoff-v1.js?v=fsh-v3', defer: true },
    ],
  });

  // Inject hub-specific rich sections before the FAQ section
  // Hub sections: needs, city grid, how it works, price guidance, related problems, CTA banner
  const richSections = [
    _buildNeedsHtml(hubContent.needs, labelAdj),
    _buildCityGridHtml(serviceSlug, linkedCities, hubContent.serviceLabel, hubContent.professionPlural),
    _buildHowItWorksHtml(hubContent.serviceLabel, profession),
    _buildPriceHtml(hubContent.priceGuidance, hubContent.serviceLabel),
    _buildProblemsHtml(hubContent.relatedProblemSlugs, serviceData.canonicalRouteKey, hubContent.publishedProblemSlugs),
    _buildCtaHtml(serviceSlug, canonicalCtaHref, profession),
  ].filter(Boolean).join('\n\n');

  // Find the first content section (faq) and inject hub sections before it
  const faqSectionMark = '<section id="fxlp-faq"';
  if (html.includes(faqSectionMark)) {
    html = html.replace(faqSectionMark, richSections + '\n\n    ' + faqSectionMark);
  } else {
    // Fallback: inject before closing </main>
    html = html.replace('</main>', richSections + '\n</main>');
    warnings.push('FAQ section not found in output — hub sections injected before </main>');
  }

  /* ── Remove flagship JS (hub has no artisan grid to populate) ── */
  const { html: htmlNF, removed: flagshipRemoved, warning: flagshipWarning } = _removeFlagshipScript(html);
  html = htmlNF;
  if (flagshipWarning) {
    warnings.push(flagshipWarning);
  }

  /* ── Content guard ── */
  check(html, 'full_html', `/${serviceSlug}`);

  const meta = {
    serviceSlug,
    canonicalPath:   `/${serviceSlug}`,
    robots,
    linkedCityCount: linkedCities.length,
    reviewCityCount: reviewCities.length,
    linkedCities:    linkedCities.map(c => c.slug),
    reviewCities:    reviewCities.map(c => c.slug),
    flagshipRemoved,
    ctaHref:         canonicalCtaHref,
    pageType:        'service-hub',
    generator:       'service-hub-v3/hub-v1',
  };

  return { html, meta, warnings };
}

module.exports = {
  generateServiceHubPage,
  // Exported for testing
  _esc,
  _buildCityGrid,
  _buildCityGridHtml,
  _buildNeedsHtml,
  _buildHowItWorksHtml,
  _buildPriceHtml,
  _buildProblemsHtml,
  _buildFaqHtml,
  _buildCtaHtml,
  _removeFlagshipScript,
  _FLAGSHIP_SCRIPT_TAG,
  HUB_CONTENT,
};
