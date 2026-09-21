'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Outcome Mapper
 * Phase 7C.7 | DORMANT — No production integration
 *
 * Maps engine result → orchestrator outcome object.
 * NEVER recalculates monetary values.
 * NEVER applies city/urgency modifiers.
 */

var VALID_NEXT_ACTIONS = [
  'CONTINUE_TO_RESERVATION',
  'CHOOSE_ARTISAN',
  'REQUEST_QUOTE',
  'BOOK_DIAGNOSTIC',
  'CHANGE_SERVICE',
  'CHANGE_METIER',
  'PROVIDE_MORE_INFORMATION',
  'CONTACT_SUPPORT',
  'STOP_FOR_SAFETY',
];

/**
 * Map engine result to orchestrator outcome.
 * engineResult is the output from evaluateFixeoPrice().
 */
function mapEngineResultToOutcome(engineResult, serviceCode, session) {
  if (!engineResult || !engineResult.ok) {
    return mapErrorToOutcome(engineResult, serviceCode);
  }

  var pricing = Object.assign({},engineResult.pricing);
  var svc=require('./estimator-service-resolver-v1').getService(serviceCode);
  if(svc){
    var scope=[svc.label_fr];
    var excluded=[];
    var material=svc.materials||{};
    if(material.major_parts==='CLIENT_SUPPLIED')excluded.push('Pièces ou appareil à fournir par le client.');
    if(material.major_parts==='ARTISAN_DISCLOSED_SEPARATE'||svc.price_model.commercial_output_type==='FIXEO_LABOUR_PRICE_PLUS_PART')excluded.push('Pièces de remplacement facturées séparément, après votre accord.');
    if(material.major_parts==='ARTISAN_SUPPLIED_INCLUDED')scope.push('Pièce prévue par cette prestation incluse.');
    if(material.consumables==='ARTISAN_SUPPLIED_INCLUDED')scope.push('Consommables courants inclus dans le périmètre défini.');
    if(svc.price_model.calculation_model==='DIAGNOSTIC')excluded.push('Les réparations et pièces éventuelles ne sont pas comprises dans le diagnostic.');
    if(serviceCode==='nettoyage.grand_menage')scope.push('Appartement F2/F3 de 60 à 100 m².');
    if(svc.metier==='jardinage'){scope.push(serviceCode==='jardinage.entretien_courant'?'Jardin entretenu de 1 à 100 m² : tonte si pelouse, désherbage léger, ramassage.':'Haie : longueur ≤ 10 m, hauteur ≤ 1,80 m, largeur ≤ 0,80 m ; dessus et deux faces accessibles.');scope.push('Outils, déplacement dans la ville sélectionnée et regroupement des déchets sur place inclus.');excluded.push('Évacuation hors site, jardin envahi, arbres, grosses branches, plantation, traitement et arrosage.');}
    if(svc.metier==='carrelage'){scope.push('Main-d’œuvre, outillage et déplacement dans la ville sélectionnée inclus. Pose et joints standards, retour nécessaire pour les joints inclus, nettoyage et petits gravats regroupés sur place.');excluded.push('Carreaux, colle et joints à fournir par le client. Support à réparer, humidité, étanchéité, plinthes, murs, escaliers, motifs et évacuation hors site exclus.');}
    if(svc.metier==='maconnerie'){scope.push(serviceCode==='maconnerie.rebouchage_local'?'1 à 5 trous de mur intérieur, chacun ≤ 10 cm de diamètre et ≤ 3 cm de profondeur, dans une même pièce.':'Reprise superficielle d’enduit de 1 à 3 m², épaisseur ≤ 1 cm, sur mur intérieur sain et sec.');scope.push('Main-d’œuvre, outillage, déplacement en ville, finition locale, retour nécessaire et nettoyage inclus. Accès dégagé jusqu’à 2 m de hauteur.');excluded.push('Fournitures compatibles à fournir par le client. Peinture, évacuation, fissures, humidité, reconstruction, travaux structurels et travaux supplémentaires exclus.');}
    if(svc.metier==='demenagement'){scope.push('Équipe de 2 intervenants pendant 2 heures sur un même site. Déplacement de l’équipe dans la ville sélectionnée inclus. Disponibilité à confirmer.');scope.push('Forfait de temps, sans garantie de terminer tout le déménagement. Début du temps au commencement sur place ; aucune prolongation automatique.');excluded.push('Camion, transport, emballage et protections à fournir, démontage/remontage, portage en escalier, objets exceptionnellement lourds ou fragiles et levage exclus. Toute prestation supplémentaire nécessite un accord préalable distinct.');}
    if(serviceCode==='peinture.mur_interieur.labour_only' && svc.price_model.pricing_version==='vap-bp33-v1'){scope.push('Deux couches standard sur 20 à 100 m² de murs intérieurs secs, sains et prêts à peindre, teinte identique ou proche, hauteur ≤ 2,80 m. Surface comptée une seule fois, ouvertures déduites.');scope.push('Protection, outillage, déplacement en ville, retours nécessaires au séchage et nettoyage inclus.');excluded.push('Peinture compatible en quantité suffisante à fournir par le client. Préparation, fissures, humidité, plafonds, façades, changement marqué de couleur et effets décoratifs exclus.');}
    if(serviceCode==='peinture.plafond.labour_only' && svc.price_model.pricing_version==='vap-bp33-v1'){scope.push('Deux couches standard sur 20 à 100 m² de plafond plat, déjà peint, sec, sain et prêt à repeindre, teinte identique ou proche, hauteur ≤ 2,80 m. Surface réelle du plafond comptée une seule fois. Sol plat et stable, zone dégagée.');scope.push('Protection, outillage, déplacement en ville, retours nécessaires au séchage et nettoyage inclus.');excluded.push('Peinture compatible en quantité suffisante à fournir par le client. Préparation, sous-couche, fissures, humidité, moisissures, murs, moulures, corniches, reliefs, accès spéciaux, changement marqué de couleur et effets décoratifs exclus.');}
    if(serviceCode==='peinture.mur_interieur.all_in' && svc.price_model.pricing_version==='vap-bp33-v1'){
      scope.push('Deux couches de Colorado Colovinyl 900 blanc mat, peinture fournie par l’artisan, sur 20 à 100 m² de murs intérieurs déjà peints blancs ou blanc cassé très clair, mats, lisses, secs et prêts à repeindre. Hauteur ≤ 2,80 m, sol stable et accès dégagé. Surface comptée une seule fois, portes et fenêtres déduites.');
      scope.push('Peinture en quantité suffisante, achat et acheminement inclus. Pots identifiables ; reliquat laissé au client. Protection, outils, déplacement en ville, retours de séchage et nettoyage inclus.');
      scope.push('Fournitures : forfait de 15 MAD/m² avec minimum de 450 MAD par intervention, déjà compris dans le total. Les frais FIXEO portent uniquement sur la prestation artisan.');
      excluded.push('Préparation, lessivage, sous-couche, fissures, taches, humidité, moisissures, plafonds, façades, teintes, changement marqué de couleur, satin, effets décoratifs et exigence de peinture lessivable. Autre produit ou indisponibilité : devis, sans remplacement ni supplément automatique.');
    }
    var units={masonry_hole_count:'trou(s) à reboucher',masonry_area_m2:'m² d’enduit à reprendre',tile_count:'carreau(x) de sol à remplacer',tile_area_m2:'m² de sol à carreler',surface_m2:'m² à nettoyer',painted_m2:'m² de murs à peindre',ceiling_m2:'m² de plafond',item_count:'élément(s)',ac_count:'climatiseur(s)',hours:'heure(s)',worker_count:'intervenant(s)'};
    Object.keys(units).forEach(function(key){var value=session&&session.known_inputs&&session.known_inputs[key];if(typeof value==='number'&&Number.isFinite(value))scope.push(value+' '+units[key]);});
    excluded.push('Travaux supplémentaires hors du périmètre confirmé.');
    pricing.scope_summary=scope;pricing.exclusions_summary=excluded;
  }
  var outputType = pricing.commercial_output_type;

  switch (outputType) {
    case 'FIXEO_PRICE':
    case 'FIXEO_CALCULATED_PRICE':
      return {
        outcome_type: 'PRICE_READY',
        service_code: serviceCode,
        commercial_output_type: outputType,
        price: {
          amount_mad: pricing.final_amount_mad,
          labour_amount_mad: null,
          currency: 'MAD',
        },
        scope_summary: pricing.scope_summary || [],
        exclusions_summary: pricing.exclusions_summary || [],
        parts_notice_required: false,
        diagnostic_notice_required: false,
        route: null,
        next_action: 'CONTINUE_TO_RESERVATION',
        engine_result_ref: pricing.formula_id || null,
      };

    case 'FIXEO_LABOUR_PRICE_PLUS_PART':
      return {
        outcome_type: 'LABOUR_PLUS_PART_READY',
        service_code: serviceCode,
        commercial_output_type: outputType,
        price: {
          amount_mad: null,
          labour_amount_mad: pricing.labour_amount_mad,
          currency: 'MAD',
        },
        variable_part_separate: true,
        scope_summary: pricing.scope_summary || [],
        exclusions_summary: pricing.exclusions_summary || [],
        parts_notice_required: true,
        diagnostic_notice_required: false,
        route: null,
        next_action: 'CONTINUE_TO_RESERVATION',
        engine_result_ref: pricing.formula_id || null,
      };

    case 'FIXEO_DIAGNOSTIC':
      return {
        outcome_type: 'DIAGNOSTIC_READY',
        service_code: serviceCode,
        commercial_output_type: outputType,
        price: {
          amount_mad: pricing.final_amount_mad,
          labour_amount_mad: null,
          currency: 'MAD',
        },
        diagnostic_price_mad: pricing.final_amount_mad,
        absorption_possible: pricing.absorption_possible || false,
        absorption_policy_ref: pricing.absorption_policy_ref || null,
        qualifying_service_codes: pricing.qualifying_service_codes || [],
        scope_summary: pricing.scope_summary || [],
        exclusions_summary: pricing.exclusions_summary || [],
        parts_notice_required: false,
        diagnostic_notice_required: true,
        route: null,
        next_action: 'BOOK_DIAGNOSTIC',
        engine_result_ref: pricing.formula_id || null,
      };

    case 'FIXEO_ADD_ON':
      return {
        outcome_type: 'ADD_ON_READY',
        service_code: serviceCode,
        commercial_output_type: outputType,
        price: {
          amount_mad: pricing.final_amount_mad,
          labour_amount_mad: null,
          currency: 'MAD',
        },
        primary_service_required: true,
        scope_summary: pricing.scope_summary || [],
        exclusions_summary: pricing.exclusions_summary || [],
        parts_notice_required: false,
        diagnostic_notice_required: false,
        route: null,
        next_action: 'CONTINUE_TO_RESERVATION',
        engine_result_ref: pricing.formula_id || null,
      };

    case 'QUOTE_REQUIRED':
      return mapQuoteRequired(serviceCode, pricing.reason_code || 'SCOPE_EXCEEDS_STANDARD');

    default:
      return mapQuoteRequired(serviceCode, 'UNKNOWN_OUTPUT_TYPE');
  }
}

/**
 * Map engine error to outcome.
 */
function mapErrorToOutcome(engineResult, serviceCode) {
  if(engineResult && !engineResult.error && engineResult.qualification){
    var q=engineResult.qualification;
    var codes={STOP_SAFETY:'STOP_SAFETY',SAFETY_STOP:'STOP_SAFETY',REQUALIFY:'REQUALIFY',ROUTE:'ROUTE_REQUIRED',QUOTE_REQUIRED:'EXCLUSION_TRIGGERED',INELIGIBLE:'EXCLUSION_TRIGGERED'};
    engineResult=Object.assign({},engineResult,{error:{code:codes[q.status]||'UNKNOWN',message:q.reason||'Périmètre à préciser'}});
  }
  var code = engineResult && engineResult.error ? engineResult.error.code : 'UNKNOWN';

  // Safety stop codes
  if (code === 'STOP_SAFETY') {
    return {
      outcome_type: 'SAFETY_STOP',
      service_code: serviceCode,
      commercial_output_type: null,
      price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
      scope_summary: [],
      exclusions_summary: [],
      parts_notice_required: false,
      diagnostic_notice_required: false,
      safety_reason: engineResult.error.message || 'Safety exclusion triggered',
      route: null,
      next_action: 'STOP_FOR_SAFETY',
      engine_result_ref: null,
    };
  }

  // Route required codes
  if (code === 'ROUTE_REQUIRED' || code === 'OUTSIDE_SCOPE') {
    return {
      outcome_type: 'ROUTE_REQUIRED',
      service_code: serviceCode,
      commercial_output_type: null,
      price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
      scope_summary: [],
      exclusions_summary: [],
      parts_notice_required: false,
      diagnostic_notice_required: false,
      route: engineResult.error.message || 'Service outside standardized scope',
      next_action: 'CHANGE_SERVICE',
      engine_result_ref: null,
    };
  }

  // Requalify
  if (code === 'REQUALIFY' || code === 'NEGATIVE_QUANTITY' || code === 'INVALID_INPUT_TYPE' || code === 'MISSING_REQUIRED_INPUT') {
    return {
      outcome_type: 'REQUALIFY',
      service_code: serviceCode,
      commercial_output_type: null,
      price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
      scope_summary: [],
      exclusions_summary: [],
      parts_notice_required: false,
      diagnostic_notice_required: false,
      requalify_reason: code,
      requalify_message: engineResult.error.message || 'Input requires clarification',
      next_action: 'PROVIDE_MORE_INFORMATION',
      engine_result_ref: null,
    };
  }

  // Quote required (engine-level exclusion)
  if (code === 'EXCLUSION_TRIGGERED') {
    return {
      outcome_type: 'QUOTE_REQUIRED',
      service_code: serviceCode,
      commercial_output_type: null,
      price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
      scope_summary: [],
      exclusions_summary: [],
      parts_notice_required: false,
      diagnostic_notice_required: false,
      quote_reason: engineResult.error.message || 'Hard exclusion triggered',
      route: null,
      next_action: 'REQUEST_QUOTE',
      engine_result_ref: null,
    };
  }

  // Unknown
  return mapQuoteRequired(serviceCode, code || 'ENGINE_ERROR');
}

/**
 * Build QUOTE_REQUIRED outcome.
 */
function mapQuoteRequired(serviceCode, reason) {
  return {
    outcome_type: 'QUOTE_REQUIRED',
    service_code: serviceCode,
    commercial_output_type: 'QUOTE_REQUIRED',
    price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
    scope_summary: [],
    exclusions_summary: [],
    parts_notice_required: false,
    diagnostic_notice_required: false,
    quote_reason: reason,
    route: null,
    next_action: 'REQUEST_QUOTE',
    engine_result_ref: null,
  };
}

/**
 * Build SAFETY_STOP outcome from orchestrator-level trigger (before engine).
 */
function buildSafetyStop(serviceCode, inputId, value) {
  return {
    outcome_type: 'SAFETY_STOP',
    service_code: serviceCode,
    commercial_output_type: null,
    price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
    scope_summary: [],
    exclusions_summary: [],
    parts_notice_required: false,
    diagnostic_notice_required: false,
    safety_reason: 'Safety input triggered: ' + inputId + ' = ' + value,
    route: null,
    next_action: 'STOP_FOR_SAFETY',
    engine_result_ref: null,
  };
}

/**
 * Build ROUTE_REQUIRED outcome from orchestrator-level trigger (before engine).
 */
function buildRouteRequired(serviceCode, inputId, value) {
  return {
    outcome_type: 'ROUTE_REQUIRED',
    service_code: serviceCode,
    commercial_output_type: null,
    price: { amount_mad: null, labour_amount_mad: null, currency: 'MAD' },
    scope_summary: [],
    exclusions_summary: [],
    parts_notice_required: false,
    diagnostic_notice_required: false,
    route: 'Routing boundary triggered: ' + inputId + ' = ' + value,
    next_action: 'CHANGE_SERVICE',
    engine_result_ref: null,
  };
}

/**
 * Map outcome_type to canonical state name.
 */
function outcomeTypeToState(outcomeType) {
  var map = {
    PRICE_READY: 'PRICE_READY',
    DIAGNOSTIC_READY: 'DIAGNOSTIC_READY',
    LABOUR_PLUS_PART_READY: 'LABOUR_PLUS_PART_READY',
    ADD_ON_READY: 'ADD_ON_READY',
    QUOTE_REQUIRED: 'QUOTE_REQUIRED',
    ROUTE_REQUIRED: 'ROUTE_REQUIRED',
    SAFETY_STOP: 'SAFETY_STOP',
    REQUALIFY: 'REQUALIFY',
  };
  return map[outcomeType] || null;
}

module.exports = {
  VALID_NEXT_ACTIONS: VALID_NEXT_ACTIONS,
  mapEngineResultToOutcome: mapEngineResultToOutcome,
  mapErrorToOutcome: mapErrorToOutcome,
  mapQuoteRequired: mapQuoteRequired,
  buildSafetyStop: buildSafetyStop,
  buildRouteRequired: buildRouteRequired,
  outcomeTypeToState: outcomeTypeToState,
};
