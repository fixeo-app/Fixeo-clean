'use strict';
/**
 * FIXEO Estimator Prototype Demo Fixtures — Phase 7C.8B
 * Status: PROTOTYPE INTERNE — NON PRODUCTION
 *
 * Provides pre-seeded orchestrator contexts for the 8 demo flows (A–H).
 * Fixtures reference service codes — they do NOT hardcode canonical prices.
 * All monetary values come from orchestrator outcome after engine evaluation.
 *
 * Flow A: Menuiserie door adjustment    → PRICE_READY
 * Flow B: Plomberie robinet             → LABOUR_PLUS_PART_READY
 * Flow C: Électricité diagnostic        → DIAGNOSTIC_READY
 * Flow D: Nettoyage standard            → PRICE_READY (FIXEO_CALCULATED_PRICE)
 * Flow E: Peinture intérieure           → QUALIFICATION (PAGE_REQUIRED)
 * Flow F: Serrurerie porte blindée      → QUOTE_REQUIRED
 * Flow G: Électricité (safety trigger)  → SAFETY_STOP
 * Flow H: Serrurerie (RAFI prefilled)   → PRICE_READY
 */

var FIXTURES = [
  {
    id: 'A',
    label: 'Menuiserie — Porte',
    description: 'Réglage porte intérieure sans rabotage',
    metier: 'Menuiserie',
    service_label: 'Réglage porte intérieure',
    context: {
      entry_point: 'SERVICE_CARD',
      service_hint: 'menuiserie.reglage_porte.sans_rabotage',
      city_slug: 'casablanca',       // city_slug — context only, zero price effect
    },
    // Default question answers (none are safety triggers)
    question_defaults: {
      boolean: false,   // security_door → false
      integer: 1,
    },
    expected_outcome: 'PRICE_READY',
    expected_surface: 'modal',
    rafi_mode: false,
  },
  {
    id: 'B',
    label: 'Plomberie — Robinet',
    description: 'Remplacement robinet — main-d\'oeuvre + pièce séparée',
    metier: 'Plomberie',
    service_label: 'Remplacement robinet',
    context: {
      entry_point: 'SERVICE_CARD',
      service_hint: 'plomberie.robinet_remplacement',
    },
    question_defaults: {
      boolean: false,  // part_replacement_required → false (will update below)
      integer: 1,
    },
    // Specific answers: part replacement is NOT needed by client but orchestrator
    // will return LABOUR_PLUS_PART_READY based on service definition
    question_answers: {
      'part_replacement_required@plomberie.robinet_remplacement': false,
    },
    expected_outcome: 'LABOUR_PLUS_PART_READY',
    expected_surface: 'modal',
    rafi_mode: false,
  },
  {
    id: 'C',
    label: 'Électricité — Diagnostic',
    description: 'Diagnostic général électricité (200 MAD)',
    metier: 'Électricité',
    service_label: 'Diagnostic électricité',
    context: {
      entry_point: 'DIRECT_CTA',
      service_hint: 'electricite.diagnostic',
    },
    // Safety question: burning_smell → false (no safety stop)
    question_answers: {
      'burning_smell@electricite.diagnostic': false,
    },
    question_defaults: { boolean: false, integer: 1 },
    expected_outcome: 'DIAGNOSTIC_READY',
    expected_surface: 'modal',
    rafi_mode: false,
  },
  {
    id: 'D',
    label: 'Nettoyage — Calculé',
    description: 'Ménage standard — 2 prestataires × 3h',
    metier: 'Nettoyage',
    service_label: 'Ménage à domicile',
    context: {
      entry_point: 'SERVICE_CARD',
      service_hint: 'nettoyage.menage_standard',
    },
    question_answers: {
      'worker_count@nettoyage.menage_standard': 2,
      'hours@nettoyage.menage_standard': 3,
    },
    question_defaults: { boolean: false, integer: 2 },
    expected_outcome: 'PRICE_READY',
    expected_commercial_output: 'FIXEO_CALCULATED_PRICE',
    expected_surface: 'modal',
    rafi_mode: false,
  },
  {
    id: 'E',
    label: 'Peinture — Page requise',
    description: 'Peinture intérieure — surface à mesurer (PAGE_REQUIRED)',
    metier: 'Peinture',
    service_label: 'Peinture mur intérieur',
    context: {
      entry_point: 'SERVICE_CARD',
      service_hint: 'peinture.mur_interieur.all_in',
    },
    // Run in PAGE_REQUIRED mode — will stop at measurement question
    stop_at_page_required: true,
    question_defaults: { boolean: false, integer: 1 },
    expected_outcome: null,  // PAGE_REQUIRED — no price until painted_m2 known
    expected_surface: 'page',
    expected_ui_recommendation: 'PAGE_REQUIRED',
    rafi_mode: false,
  },
  {
    id: 'F',
    label: 'Serrurerie — Devis',
    description: 'Porte blindée claquée — intervention complexe → QUOTE_REQUIRED',
    metier: 'Serrurerie',
    service_label: 'Porte blindée claquée',
    context: {
      entry_point: 'DIRECT_CTA',
      service_hint: 'serrurerie.porte_claquee_blindee.ouverture',
    },
    question_answers: {
      // ROUTING_BOUNDARY question → true triggers QUOTE_REQUIRED eventually
    },
    question_defaults: { boolean: false, integer: 1 },
    expected_outcome: 'QUOTE_REQUIRED',
    expected_surface: 'modal',
    rafi_mode: false,
  },
  {
    id: 'G',
    label: 'Sécurité — Stop',
    description: 'Électricité — odeur de brûlé → SAFETY_STOP',
    metier: 'Électricité',
    service_label: 'Diagnostic électricité',
    context: {
      entry_point: 'DIRECT_CTA',
      service_hint: 'electricite.diagnostic',
    },
    // Safety trigger: answer burning_smell TRUE → SAFETY_STOP
    question_answers: {
      'burning_smell@electricite.diagnostic': true,
    },
    question_defaults: { boolean: true, integer: 1 },
    expected_outcome: 'SAFETY_STOP',
    expected_surface: 'modal',
    rafi_mode: false,
  },
  {
    id: 'H',
    label: 'RAFI — Serrurerie',
    description: 'Remplacement cylindre — contexte pré-rempli par RAFI',
    metier: 'Serrurerie',
    service_label: 'Remplacement cylindre',
    context: {
      entry_point: 'RAFI',
      service_hint: 'serrurerie.cylindre_remplacement.standard',
      metier_hint: 'serrurerie',
    },
    question_answers: {},
    question_defaults: { boolean: false, integer: 1 },
    expected_outcome: 'PRICE_READY',
    expected_surface: 'modal',
    rafi_mode: true,
  },
];

module.exports = { FIXTURES };
