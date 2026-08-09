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

  var pricing = engineResult.pricing;
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
