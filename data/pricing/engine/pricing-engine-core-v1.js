'use strict';
/**
 * FIXEO Pricing Engine Core V1
 *
 * engine_name:    FIXEO_PRICING_ENGINE_CORE
 * engine_version: 1.0.0-dormant
 * engine_type:    RULE_BASED_CANONICAL_PRICING_ENGINE
 * production_active: false
 *
 * DORMANT — not imported by any production runtime.
 * No DOM. No network. No eval(). No Function(). Pure deterministic.
 *
 * Entry point: evaluateFixeoPrice({ service_code, inputs })
 */

const { getEngineData } = require('./pricing-engine-loader-v1');

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_MODELS = new Set([
  'FIXED', 'CONDITIONAL_FIXED', 'UNIT_MULTIPLICATION', 'UNIT_MULTIPLICATION_WITH_FLOOR',
  'TIME_BASED_SINGLE', 'TIME_BASED_TEAM', 'MINIMUM_FLOOR', 'LABOUR_FIXED_PART_SEPARATE',
  'ADD_ON', 'DIAGNOSTIC', 'QUOTE_ONLY'
]);

const SUPPORTED_OUTPUT_TYPES = new Set([
  'FIXEO_PRICE', 'FIXEO_CALCULATED_PRICE', 'FIXEO_LABOUR_PRICE_PLUS_PART',
  'FIXEO_DIAGNOSTIC', 'FIXEO_ADD_ON', 'FIXEO_ESTIMATE', 'QUOTE_REQUIRED'
]);

const PREDICATE_OPERATORS = new Set(['EQ','NEQ','IN','NOT_IN','GT','GTE','LT','LTE','EXISTS','NOT_EXISTS']);
const PROVENANCE = {
  price_provenance: 'FIXEO_HUMAN_CALIBRATED_PILOT',
  maturity: 'LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION',
  production_ready: false
};

// ─── Error helpers ────────────────────────────────────────────────────────────

function errorResult(code, message, field = null, service_code = null) {
  return { ok: false, service_code, error: { code, message, field }, pricing: null };
}

function ineligibleResult(service_code, status, reason_code, reason, failed_condition = null, routing = null) {
  return {
    ok: false,
    service_code,
    qualification: { status, failed_condition, reason_code, reason },
    routing: routing || null,
    pricing: null
  };
}

// ─── Integer MAD enforcement ──────────────────────────────────────────────────

function assertIntegerMad(value, context) {
  if (typeof value !== 'number' || !isFinite(value)) {
    return { error: `NON_INTEGER_MAD_RESULT: ${context} produced non-finite value` };
  }
  if (!Number.isInteger(value)) {
    return { error: `NON_INTEGER_MAD_RESULT: ${context} produced ${value} — EXACT_INTEGER_MAD policy forbids non-integer` };
  }
  return { value };
}

// ─── Input validation ─────────────────────────────────────────────────────────

function validateInputs(inputs, requiredInputIds, inputIndex) {
  const errors = [];

  // Check for unknown keys
  for (const key of Object.keys(inputs)) {
    if (!inputIndex[key]) {
      errors.push({ code: 'UNKNOWN_INPUT_KEY', message: `Input '${key}' is not in canonical input registry`, field: key });
    }
  }

  // Check required inputs present and typed
  for (const inputId of requiredInputIds) {
    const def = inputIndex[inputId];
    if (!def) continue; // definition missing — loader should have caught this

    const val = inputs[inputId];

    // Check presence
    if (val === undefined || val === null) {
      errors.push({ code: 'MISSING_REQUIRED_INPUT', message: `Required input '${inputId}' is missing`, field: inputId });
      continue;
    }

    // Type check
    const dtype = def.data_type;
    if (dtype === 'integer') {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push({ code: 'INVALID_INPUT_TYPE', message: `Input '${inputId}' must be integer, got ${typeof val} (${val})`, field: inputId });
      } else {
        // Quantity inputs must be strictly positive (> 0)
        const QUANTITY_INPUTS = new Set(['item_count','ac_count','hours','worker_count',
          'surface_m2','painted_m2','ceiling_m2','hinge_count','drawer_count',
          'ac_capacity_btu','door_width_cm','tv_inches']);
        if (QUANTITY_INPUTS.has(inputId) && val <= 0) {
          errors.push({ code: 'NEGATIVE_QUANTITY', message: `Input '${inputId}' must be > 0`, field: inputId });
        } else if (!QUANTITY_INPUTS.has(inputId) && inputId !== 'installation_height_m' && val < 0) {
          errors.push({ code: 'NEGATIVE_QUANTITY', message: `Input '${inputId}' must be non-negative`, field: inputId });
        }
      }
    } else if (dtype === 'number') {
      if (typeof val !== 'number' || !isFinite(val)) {
        errors.push({ code: 'INVALID_INPUT_TYPE', message: `Input '${inputId}' must be a finite number`, field: inputId });
      } else {
        const NUMBER_QUANTITY_INPUTS = new Set(['hours','surface_m2','painted_m2','ceiling_m2','tv_weight_kg']);
        if (NUMBER_QUANTITY_INPUTS.has(inputId) && val <= 0) {
          errors.push({ code: 'NEGATIVE_QUANTITY', message: `Input '${inputId}' must be > 0`, field: inputId });
        } else if (!NUMBER_QUANTITY_INPUTS.has(inputId) && val < 0) {
          errors.push({ code: 'NEGATIVE_QUANTITY', message: `Input '${inputId}' must be non-negative`, field: inputId });
        }
      }
    } else if (dtype === 'boolean') {
      if (typeof val !== 'boolean') {
        errors.push({ code: 'INVALID_INPUT_TYPE', message: `Input '${inputId}' must be boolean`, field: inputId });
      }
    } else if (dtype === 'string') {
      if (typeof val !== 'string') {
        errors.push({ code: 'INVALID_INPUT_TYPE', message: `Input '${inputId}' must be string`, field: inputId });
      } else if (def.allowed_values && def.allowed_values.length > 0 && !def.allowed_values.includes(val)) {
        errors.push({ code: 'INVALID_ENUM_VALUE', message: `Input '${inputId}' value '${val}' not in allowed values: ${def.allowed_values.join(', ')}`, field: inputId });
      }
    }
  }

  return errors;
}

// ─── Predicate evaluator ──────────────────────────────────────────────────────

function evaluatePredicate(cond, inputs) {
  const op  = cond.operator;
  const val = inputs[cond.field];

  if (!PREDICATE_OPERATORS.has(op)) {
    return { result: false, error: `Unknown operator: ${op}` };
  }

  // No eval(), no Function() — pure switch
  switch (op) {
    case 'EXISTS':     return { result: val !== undefined && val !== null };
    case 'NOT_EXISTS': return { result: val === undefined || val === null };
    case 'EQ':         return { result: val === cond.value };
    case 'NEQ':        return { result: val !== cond.value };
    case 'IN': {
      // Support both cond.values (array) and cond.value (array) — canonical registry uses either
      const haystack = Array.isArray(cond.values) ? cond.values : (Array.isArray(cond.value) ? cond.value : [cond.value]);
      return { result: haystack.includes(val) };
    }
    case 'NOT_IN': {
      const haystack2 = Array.isArray(cond.values) ? cond.values : (Array.isArray(cond.value) ? cond.value : [cond.value]);
      return { result: !haystack2.includes(val) };
    }
    case 'GT':         return { result: typeof val === 'number' && val > cond.value };
    case 'GTE':        return { result: typeof val === 'number' && val >= cond.value };
    case 'LT':         return { result: typeof val === 'number' && val < cond.value };
    case 'LTE':        return { result: typeof val === 'number' && val <= cond.value };
    default:           return { result: false, error: `Unimplemented operator: ${op}` };
  }
}

// ─── Eligibility evaluator ────────────────────────────────────────────────────

function evaluateEligibility(svc, inputs) {
  const elig = svc.eligibility || {};
  const conditionsChecked = [];

  // ADD_ON_ONLY: standalone gate is already enforced by evaluateAddOn() before this runs.
  // If we reach here, add-on validation has already passed (primary_service_code validated).
  // Treat as OPEN for purposes of condition evaluation.
  if (elig.qualification_status === 'ADD_ON_ONLY') {
    return { eligible: true, conditionsChecked };
  }

  // OPEN: no conditions to check, always eligible
  if (elig.qualification_status === 'OPEN') {
    return { eligible: true, conditionsChecked };
  }

  // CONDITIONAL: evaluate required_conditions (all must pass)
  if (elig.qualification_status === 'CONDITIONAL') {
    for (const cond of (elig.required_conditions || [])) {
      const { result, error } = evaluatePredicate(cond, inputs);
      const expected = cond.effect === 'ELIGIBLE';
      const passed = error ? false : (expected ? result : !result);
      conditionsChecked.push({ field: cond.field, operator: cond.operator, effect: cond.effect, passed });
      if (!passed) {
        return {
          eligible: false, status: 'INELIGIBLE',
          reason_code: cond.reason_code || 'CONDITION_NOT_MET',
          reason: cond.reason || `Condition '${cond.field} ${cond.operator}' not satisfied`,
          failed_condition: `${cond.field} ${cond.operator} ${JSON.stringify(cond.value || cond.values || '')}`,
          conditionsChecked
        };
      }
    }
    return { eligible: true, conditionsChecked };
  }

  // Unknown status — pass through as OPEN
  return { eligible: true, conditionsChecked };
}

// ─── Hard exclusion evaluator ─────────────────────────────────────────────────

/**
 * Parse and evaluate a canonical trigger prose string against inputs.
 *
 * Supported patterns:
 *   field = True / False
 *   field = VALUE
 *   field IN [A, B, C]
 *   field NOT_IN [A, B, C]
 *   field GT number
 *   field LT number
 *   cond1 AND cond2
 *   cond1 OR cond2
 *
 * No eval. No dynamic Function. Pure string parsing.
 */
function parseTrigger(trigStr, inputs) {
  if (!trigStr) return false;
  const s = trigStr.trim();

  // AND (split on ' AND ', left-to-right)
  const andIdx = s.indexOf(' AND ');
  if (andIdx !== -1) {
    return parseTrigger(s.slice(0, andIdx), inputs) && parseTrigger(s.slice(andIdx + 5), inputs);
  }

  // OR (split on ' OR ', left-to-right)
  const orIdx = s.indexOf(' OR ');
  if (orIdx !== -1) {
    return parseTrigger(s.slice(0, orIdx), inputs) || parseTrigger(s.slice(orIdx + 4), inputs);
  }

  // field IN [A, B, C]
  const inMatch = s.match(/^(\w+)\s+IN\s+\[([^\]]+)\]$/);
  if (inMatch) {
    const field = inMatch[1];
    const vals = inMatch[2].split(',').map(v => v.trim());
    const fv = inputs[field];
    return fv !== undefined && vals.includes(String(fv));
  }

  // field NOT_IN [A, B, C]
  const notInMatch = s.match(/^(\w+)\s+NOT_IN\s+\[([^\]]+)\]$/);
  if (notInMatch) {
    const field = notInMatch[1];
    const vals = notInMatch[2].split(',').map(v => v.trim());
    const fv = inputs[field];
    return fv === undefined || !vals.includes(String(fv));
  }

  // field GT number
  const gtMatch = s.match(/^(\w+)\s+GT\s+(-?\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    const fv = inputs[gtMatch[1]];
    return fv !== undefined && Number(fv) > Number(gtMatch[2]);
  }

  // field LT number
  const ltMatch = s.match(/^(\w+)\s+LT\s+(-?\d+(?:\.\d+)?)$/);
  if (ltMatch) {
    const fv = inputs[ltMatch[1]];
    return fv !== undefined && Number(fv) < Number(ltMatch[2]);
  }

  // field = True
  const trueMatch = s.match(/^(\w+)\s*=\s*True$/);
  if (trueMatch) {
    const fv = inputs[trueMatch[1]];
    return fv === true || fv === 'True' || fv === 'true';
  }

  // field = False
  const falseMatch = s.match(/^(\w+)\s*=\s*False$/);
  if (falseMatch) {
    const fv = inputs[falseMatch[1]];
    return fv === false || fv === 'False' || fv === 'false';
  }

  // field = VALUE (string/enum)
  const eqMatch = s.match(/^(\w+)\s*=\s*(\S+)$/);
  if (eqMatch) {
    const fv = inputs[eqMatch[1]];
    if (fv === undefined) return false;
    return String(fv) === eqMatch[2];
  }

  // Bare field name (no operator) — treat as boolean-truthy check: field === true
  const bareMatch = s.match(/^(\w+)$/);
  if (bareMatch) {
    const fv = inputs[bareMatch[1]];
    return fv === true || fv === 'True' || fv === 'true';
  }

  // Unrecognized trigger pattern — treat as not fired (safe: never fires false positive)
  return false;
}

function evaluateHardExclusions(svc, inputs, routeIndex) {
  const elig = svc.eligibility || {};

  for (const excl of (elig.hard_exclusions || [])) {
    // Check if trigger fires
    let fired = false;
    if (excl.trigger_condition) {
      const { result } = evaluatePredicate(excl.trigger_condition, inputs);
      fired = result;
    } else if (excl.trigger) {
      // Parse canonical trigger prose string
      fired = parseTrigger(excl.trigger, inputs);
    }

    if (!fired) continue;

    const action = excl.action;
    let routing = null;

    if (action === 'ROUTE' && excl.route_ref) {
      const route = routeIndex[excl.route_ref];
      routing = route ? {
        route_ref:      excl.route_ref,
        target_metier:  route.target_metier || null,
        target_service: route.target_service || null,
        target_external: route.target_external || null,
        action:         route.action || 'ROUTE'
      } : { route_ref: excl.route_ref, target_metier: null, target_service: null, target_external: null, action: 'ROUTE' };
    }

    return {
      fired: true,
      action,
      reason_code: excl.id || excl.reason_code || action,
      reason: excl.reason || excl.description || `Hard exclusion: ${action}`,
      routing
    };
  }

  return { fired: false };
}

// ─── Calculation models ───────────────────────────────────────────────────────

function calculate(svc, inputs, formulaIndex) {
  const pm    = svc.price_model || {};
  const model = pm.calculation_model;
  const trace = { formula_id: pm.formula_id || `FORMULA-${model}-V1`, inputs: {}, steps: [], result_mad: null };

  // Helper
  const intCheck = (v, ctx) => {
    const r = assertIntegerMad(v, ctx);
    if (r.error) throw { code: 'NON_INTEGER_MAD_RESULT', message: r.error };
    return r.value;
  };

  switch (model) {

    // ─ FIXED ─────────────────────────────────────────────────────────────────
    case 'FIXED': {
      const amt = pm.fixed_amount_mad;
      trace.inputs = { fixed_amount_mad: amt };
      trace.steps  = [`final = ${amt}`];
      const final  = intCheck(amt, 'FIXED');
      trace.result_mad = final;
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ CONDITIONAL_FIXED ─────────────────────────────────────────────────────
    case 'CONDITIONAL_FIXED': {
      const amt = pm.fixed_amount_mad;
      trace.inputs = { fixed_amount_mad: amt };
      trace.steps  = [`final = ${amt} (conditional eligibility confirmed)`];
      const final  = intCheck(amt, 'CONDITIONAL_FIXED');
      trace.result_mad = final;
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ UNIT_MULTIPLICATION ───────────────────────────────────────────────────
    case 'UNIT_MULTIPLICATION': {
      const rate = pm.unit_rate_mad;
      // Resolve quantity from explicit quantity_input, or from unit type
      let qty;
      const qKey = pm.quantity_input;
      const unit = pm.unit;
      if (qKey) {
        qty = inputs[qKey];
      } else if (unit === 'PER_AC_UNIT') { qty = inputs['ac_count']; }
      else if (unit === 'PER_ITEM')      { qty = inputs['item_count']; }
      else if (unit === 'PER_M2')        { qty = inputs['surface_m2']; }
      else if (unit === 'PER_PAINTED_M2'){ qty = inputs['painted_m2']; }
      else if (unit === 'PER_CEILING_M2'){ qty = inputs['ceiling_m2']; }
      else { qty = inputs['item_count'] || inputs['ac_count']; }
      if (qty === undefined || qty === null) throw { code: 'MISSING_REQUIRED_INPUT', message: `quantity input missing for UNIT_MULTIPLICATION (unit: ${unit})` };
      const calc = rate * qty;
      trace.inputs = { unit_rate_mad: rate, quantity: qty };
      trace.steps  = [`${qty} × ${rate} = ${calc}`];
      const final  = intCheck(calc, 'UNIT_MULTIPLICATION');
      trace.result_mad = final;
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ UNIT_MULTIPLICATION_WITH_FLOOR ─────────────────────────────────────────
    case 'UNIT_MULTIPLICATION_WITH_FLOOR': {
      const rate  = pm.unit_rate_mad;
      const floor = pm.formula_params && pm.formula_params.minimum_floor_mad !== undefined
                    ? pm.formula_params.minimum_floor_mad
                    : (pm.formula_params && pm.formula_params.project_minimum_mad)
                    || (svc.minimum_floor && svc.minimum_floor.enabled ? svc.minimum_floor.amount_mad : 0);
      // Determine quantity input — explicit key beats unit-type inference
      let qty;
      const qKey2 = pm.quantity_input;
      const unit2 = pm.unit;
      if (qKey2) {
        qty = inputs[qKey2];
      } else if (unit2 === 'PER_AC_UNIT')    { qty = inputs['ac_count']; }
      else if (unit2 === 'PER_ITEM')         { qty = inputs['item_count']; }
      else if (unit2 === 'PER_M2')           { qty = inputs['surface_m2']; }
      else if (unit2 === 'PER_PAINTED_M2')   { qty = inputs['painted_m2']; }
      else if (unit2 === 'PER_CEILING_M2')   { qty = inputs['ceiling_m2']; }
      else if (unit2 === 'PER_DOOR')         { qty = 1; }
      else if (unit2 === 'PER_INSTALLATION') { qty = 1; }
      else { qty = inputs['item_count'] || inputs['surface_m2'] || inputs['painted_m2'] || inputs['ac_count']; }

      if (qty === undefined || qty === null) throw { code: 'MISSING_REQUIRED_INPUT', message: `quantity input missing for UNIT_MULTIPLICATION_WITH_FLOOR` };
      const calc  = rate * qty;
      const final_raw = Math.max(floor, calc);
      trace.inputs = { unit_rate_mad: rate, quantity: qty, minimum_floor_mad: floor };
      trace.steps  = [`${qty} × ${rate} = ${calc}`, `max(${floor}, ${calc}) = ${final_raw}`];
      const final  = intCheck(final_raw, 'UNIT_MULTIPLICATION_WITH_FLOOR');
      trace.result_mad = final;
      return {
        base_amount_mad:       intCheck(calc, 'UNIT_MULTIPLICATION_WITH_FLOOR calc'),
        calculated_amount_mad: intCheck(calc, 'UNIT_MULTIPLICATION_WITH_FLOOR calc'),
        minimum_floor_mad:     floor > 0 ? floor : null,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ TIME_BASED_SINGLE ─────────────────────────────────────────────────────
    case 'TIME_BASED_SINGLE': {
      const hours = inputs['hours'];
      if (hours === undefined || hours === null) throw { code: 'MISSING_REQUIRED_INPUT', message: `'hours' input required for TIME_BASED_SINGLE` };
      if (!Number.isInteger(hours)) throw { code: 'UNSUPPORTED_FRACTIONAL_HOURS', message: `Engine V1 accepts integer hours only. Received: ${hours}` };
      const rate    = pm.unit_rate_mad;
      // Read minimum_billing_hours from pm directly OR formula_params
      const minBill = pm.minimum_billing_hours
                    || (pm.formula_params && pm.formula_params.minimum_billing_hours)
                    || 1;
      const billable = Math.max(minBill, hours);
      const calc     = rate * billable;
      trace.inputs = { hours, unit_rate_mad: rate, minimum_billing_hours: minBill };
      trace.steps  = [`billable = max(${minBill}, ${hours}) = ${billable}`, `${billable} × ${rate} = ${calc}`];
      const final  = intCheck(calc, 'TIME_BASED_SINGLE');
      trace.result_mad = final;
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ TIME_BASED_TEAM ───────────────────────────────────────────────────────
    case 'TIME_BASED_TEAM': {
      const hours   = inputs['hours'];
      const workers = inputs['worker_count'];
      if (hours   === undefined || hours   === null) throw { code: 'MISSING_REQUIRED_INPUT', message: `'hours' required for TIME_BASED_TEAM` };
      if (workers === undefined || workers === null) throw { code: 'MISSING_REQUIRED_INPUT', message: `'worker_count' required for TIME_BASED_TEAM` };
      if (!Number.isInteger(hours))   throw { code: 'UNSUPPORTED_FRACTIONAL_HOURS', message: `Engine V1: integer hours only. Got: ${hours}` };
      if (!Number.isInteger(workers)) throw { code: 'INVALID_INPUT_TYPE', message: `worker_count must be integer. Got: ${workers}` };
      if (workers < 1) throw { code: 'NEGATIVE_QUANTITY', message: `worker_count must be >= 1` };
      const rate         = pm.unit_rate_mad;
      const totalHours   = workers * hours;
      const calc         = rate * totalHours;
      const floor        = (svc.minimum_floor && svc.minimum_floor.enabled) ? svc.minimum_floor.amount_mad : 0;
      const final_raw    = floor > 0 ? Math.max(floor, calc) : calc;
      trace.inputs = { hours, worker_count: workers, unit_rate_mad: rate, minimum_floor_mad: floor || null };
      trace.steps  = [
        `total_cleaner_hours = ${workers} × ${hours} = ${totalHours}`,
        `${totalHours} × ${rate} = ${calc}`,
        ...(floor > 0 ? [`max(${floor}, ${calc}) = ${final_raw}`] : [])
      ];
      const final = intCheck(final_raw, 'TIME_BASED_TEAM');
      trace.result_mad = final;
      return {
        base_amount_mad:       intCheck(calc, 'TIME_BASED_TEAM calc'),
        calculated_amount_mad: intCheck(calc, 'TIME_BASED_TEAM calc'),
        minimum_floor_mad:     floor > 0 ? floor : null,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ MINIMUM_FLOOR ─────────────────────────────────────────────────────────
    case 'MINIMUM_FLOOR': {
      const floor = pm.fixed_amount_mad || (svc.minimum_floor && svc.minimum_floor.amount_mad);
      trace.inputs = { minimum_floor_mad: floor };
      trace.steps  = [`final = minimum_floor = ${floor}`];
      const final  = intCheck(floor, 'MINIMUM_FLOOR');
      trace.result_mad = final;
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     final,
        final_amount_mad:      final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ LABOUR_FIXED_PART_SEPARATE ────────────────────────────────────────────
    case 'LABOUR_FIXED_PART_SEPARATE': {
      const labour = pm.labour_amount_mad;
      trace.inputs = { labour_amount_mad: labour };
      trace.steps  = [`labour = ${labour}`, `parts: separately disclosed and approved`];
      const final  = intCheck(labour, 'LABOUR_FIXED_PART_SEPARATE');
      trace.result_mad = final;
      // Gather material info
      const mat = svc.material_responsibility || {};
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        labour_amount_mad:     final,
        variable_part_separate: true,
        materials_note: mat.disclosure || 'Parts separately supplied and disclosed per policy.',
        trace
      };
    }

    // ─ ADD_ON ────────────────────────────────────────────────────────────────
    case 'ADD_ON': {
      const rate  = pm.unit_rate_mad;
      const qty   = inputs['painted_m2'] || inputs['item_count'] || inputs['ceiling_m2'] || 1;
      const calc  = rate * qty;
      trace.inputs = { unit_rate_mad: rate, quantity: qty };
      trace.steps  = [`${qty} × ${rate} = ${calc}`, `add-on amount (primary service priced separately)`];
      const final  = intCheck(calc, 'ADD_ON');
      trace.result_mad = final;
      return {
        base_amount_mad:       null,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        add_on_amount_mad:     final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        trace
      };
    }

    // ─ DIAGNOSTIC ────────────────────────────────────────────────────────────
    case 'DIAGNOSTIC': {
      const dPrice = pm.diagnostic_price_mad || pm.fixed_amount_mad;
      const diag   = svc.diagnostic || {};
      trace.inputs = { diagnostic_price_mad: dPrice };
      trace.steps  = [`diagnostic = ${dPrice} MAD`, `absorption eligible if qualifying follow-up service booked same visit`];
      const final  = intCheck(dPrice, 'DIAGNOSTIC');
      trace.result_mad = final;
      return {
        base_amount_mad:       final,
        calculated_amount_mad: final,
        minimum_floor_mad:     null,
        final_amount_mad:      final,
        diagnostic_price_mad:  final,
        labour_amount_mad:     null,
        variable_part_separate: false,
        absorption_eligible_if_followup: diag.enabled === true,
        qualifying_service_codes: diag.qualifying_service_codes || null,
        trace
      };
    }

    // ─ QUOTE_ONLY ────────────────────────────────────────────────────────────
    case 'QUOTE_ONLY': {
      return null; // signals QUOTE_REQUIRED upstream
    }

    default:
      throw { code: 'UNKNOWN_CALCULATION_MODEL', message: `Unknown calculation model: ${model}` };
  }
}

// ─── Material info builder ────────────────────────────────────────────────────

function buildMaterials(svc) {
  const mat = svc.material_responsibility || {};
  return {
    principal_part:      mat.principal_part || null,
    parts_policy:        mat.parts_policy   || mat.responsibility || null,
    approval_required:   mat.approval_required   !== undefined ? mat.approval_required   : null,
    client_may_supply:   mat.client_may_supply    !== undefined ? mat.client_may_supply   : null,
  };
}

// ─── Add-On evaluation ───────────────────────────────────────────────────────

function evaluateAddOn(svc, inputs, allServices, routeIndex) {
  const elig = svc.eligibility || {};

  if (elig.qualification_status !== 'ADD_ON_ONLY') return null;

  const primaryCode = inputs['primary_service_code'];
  if (!primaryCode) {
    return ineligibleResult(svc.canonical_service_code, 'INELIGIBLE', 'ADD_ON_PRIMARY_REQUIRED',
      'ADD_ON service requires primary_service_code input. Cannot execute standalone.');
  }

  const allowed = elig.allowed_primary_service_codes || [];
  if (!allowed.includes(primaryCode)) {
    return ineligibleResult(svc.canonical_service_code, 'INELIGIBLE', 'ADD_ON_PRIMARY_NOT_ELIGIBLE',
      `primary_service_code '${primaryCode}' is not in allowed_primary_service_codes: ${allowed.join(', ')}`);
  }

  // Primary is valid — proceed to calculate add-on amount
  return null; // null = continue normally
}

// ─── Menuiserie batch guard ───────────────────────────────────────────────────

function checkMenuiserieBatch(svc, inputs) {
  const lc = (svc.legacy_codes || []);
  const bp = svc.batch_policy || {};

  if (lc.includes('MENU_002') && bp.engine_v1_base_quantity === 1) {
    const hc = inputs['hinge_count'];
    if (hc !== undefined && hc !== null && hc > 1) {
      return ineligibleResult(svc.canonical_service_code, 'REQUALIFY', 'BATCH_QUANTITY_EXCEEDS_ENGINE_V1_SCOPE',
        `MENU_002 Engine V1 handles exactly 1 hinge. hinge_count=${hc} requires QUOTE_REQUIRED. Experimental batch rules are not activated.`);
    }
  }

  if (lc.includes('MENU_003') && bp.engine_v1_base_quantity === 1) {
    const dc = inputs['drawer_count'];
    if (dc !== undefined && dc !== null && dc > 1) {
      return ineligibleResult(svc.canonical_service_code, 'REQUALIFY', 'BATCH_QUANTITY_EXCEEDS_ENGINE_V1_SCOPE',
        `MENU_003 Engine V1 handles exactly 1 drawer runner. drawer_count=${dc} requires QUOTE_REQUIRED. Experimental batch rules are not activated.`);
    }
  }

  return null;
}

// ─── Painting input guard ─────────────────────────────────────────────────────

function checkPaintingInputs(svc, inputs) {
  const m = svc.measurement || {};
  const strategy = m.engine_measurement_strategy;
  if (strategy !== 'DIRECT_CANONICAL_MEASUREMENT') return null;

  const required = m.engine_required_input;
  const mustNotUse = m.engine_must_not_derive_from;

  // Reject floor_area_m2 being used as a substitute
  if (mustNotUse && inputs[mustNotUse] !== undefined && inputs[required] === undefined) {
    return errorResult('MISSING_REQUIRED_INPUT',
      `'${required}' is required (DIRECT_CANONICAL_MEASUREMENT). '${mustNotUse}' cannot substitute — floor→painted conversion is RESEARCH_ESTIMATION_ONLY and not approved for Engine V1.`,
      required, svc.canonical_service_code);
  }

  if (inputs[required] === undefined || inputs[required] === null) {
    return errorResult('MISSING_REQUIRED_INPUT',
      `'${required}' is required for ${svc.canonical_service_code}. Supply painted surface area directly.`,
      required, svc.canonical_service_code);
  }

  return null;
}

// ─── Policy and route validation ──────────────────────────────────────────────

function collectPolicies(svc, policyIndex) {
  const refs = svc.policy_refs || [];
  const applied = [];
  const safety  = [];
  const missing = [];

  for (const ref of refs) {
    if (!policyIndex[ref]) { missing.push(ref); continue; }
    const pol = policyIndex[ref];
    applied.push(ref);
    if (pol.safety_critical || ref.includes('SAFETY') || ref.includes('AUTHORIZATION') || ref.includes('REFRIGERATION')) {
      safety.push(ref);
    }
  }

  return { applied, safety, missing };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Evaluate the FIXEO canonical price for a given service + inputs.
 *
 * @param {object} params
 * @param {string} params.service_code  - canonical service code (required)
 * @param {object} params.inputs        - registered canonical inputs
 * @returns {object} Structured evaluation result
 */
function evaluateFixeoPrice({ service_code, inputs = {} } = {}) {
  // ── Security: no network, no eval, no DOM, no env secrets ──────────────────
  // Pure in-memory data access only from here.

  // ── Load data ──────────────────────────────────────────────────────────────
  let data;
  try {
    data = getEngineData();
  } catch (e) {
    return errorResult('ENGINE_LOAD_FAILED', e.message, null, service_code);
  }

  const { services, legacyCodes, formulas: formulaIndex, policies: policyIndex,
          routes: routeIndex, inputs: inputIndex } = data;

  // ── Service lookup ─────────────────────────────────────────────────────────
  if (!service_code || typeof service_code !== 'string') {
    return errorResult('SERVICE_NOT_FOUND', 'service_code is required and must be a string');
  }

  let canonicalCode = service_code;
  // Legacy code resolution (optional helper)
  if (!services[canonicalCode] && legacyCodes[service_code]) {
    canonicalCode = legacyCodes[service_code];
  }

  const svc = services[canonicalCode];
  if (!svc) {
    return errorResult('SERVICE_NOT_FOUND', `Service '${service_code}' not found in canonical registry. Do not guess closest service.`, 'service_code', service_code);
  }

  const pm = svc.price_model || {};
  const model = pm.calculation_model;

  // ── Model support check ────────────────────────────────────────────────────
  if (!SUPPORTED_MODELS.has(model)) {
    return errorResult('UNKNOWN_CALCULATION_MODEL', `Calculation model '${model}' is not supported.`, null, canonicalCode);
  }

  // ── Add-on guard ──────────────────────────────────────────────────────────
  const addOnCheck = evaluateAddOn(svc, inputs, services, routeIndex);
  if (addOnCheck) return addOnCheck;

  // ── Painting input guard ───────────────────────────────────────────────────
  const paintCheck = checkPaintingInputs(svc, inputs);
  if (paintCheck) return paintCheck;

  // ── Menuiserie batch guard ─────────────────────────────────────────────────
  const batchCheck = checkMenuiserieBatch(svc, inputs);
  if (batchCheck) return batchCheck;

  // ── Input validation ───────────────────────────────────────────────────────
  // Collect all inputs referenced by conditions
  const referencedInputs = new Set();
  const elig = svc.eligibility || {};
  for (const cond of (elig.required_conditions || [])) {
    if (cond.field) referencedInputs.add(cond.field);
  }
  // Also add measurement-specific required inputs
  if (svc.measurement && svc.measurement.engine_required_input) {
    referencedInputs.add(svc.measurement.engine_required_input);
  }
  // Add model-specific inputs
  const modelInputMap = {
    TIME_BASED_SINGLE:              ['hours'],
    TIME_BASED_TEAM:                ['hours', 'worker_count'],
    UNIT_MULTIPLICATION:            [pm.quantity_input || (pm.unit === 'PER_AC_UNIT' ? 'ac_count' : pm.unit === 'PER_M2' ? 'surface_m2' : pm.unit === 'PER_PAINTED_M2' ? 'painted_m2' : pm.unit === 'PER_CEILING_M2' ? 'ceiling_m2' : 'item_count')],
    UNIT_MULTIPLICATION_WITH_FLOOR: [pm.quantity_input || (pm.unit === 'PER_AC_UNIT' ? 'ac_count' : pm.unit === 'PER_M2' ? 'surface_m2' : pm.unit === 'PER_PAINTED_M2' ? 'painted_m2' : pm.unit === 'PER_CEILING_M2' ? 'ceiling_m2' : 'item_count')],
  };
  for (const inp of (modelInputMap[model] || [])) { if (inp) referencedInputs.add(inp); }
  // Add batch guard inputs for menuiserie services (validated before batch guard fires)
  if (canonicalCode === 'menuiserie.remplacement_charniere') referencedInputs.add('hinge_count');
  if (canonicalCode === 'menuiserie.remplacement_coulisse_tiroir') referencedInputs.add('drawer_count');

  const validationErrors = validateInputs(inputs, [...referencedInputs], inputIndex);
  if (validationErrors.length > 0) {
    const first = validationErrors[0];
    return errorResult(first.code, first.message, first.field, canonicalCode);
  }

  // ── Eligibility evaluation ─────────────────────────────────────────────────
  const eligResult = evaluateEligibility(svc, inputs);
  if (!eligResult.eligible) {
    return ineligibleResult(canonicalCode, eligResult.status, eligResult.reason_code,
      eligResult.reason, eligResult.failed_condition, null);
  }

  // ── Hard exclusion evaluation ──────────────────────────────────────────────
  const exclResult = evaluateHardExclusions(svc, inputs, routeIndex);
  if (exclResult.fired) {
    return ineligibleResult(canonicalCode, exclResult.action, exclResult.reason_code,
      exclResult.reason, null, exclResult.routing);
  }

  // ── QUOTE_ONLY check ───────────────────────────────────────────────────────
  if (model === 'QUOTE_ONLY') {
    return ineligibleResult(canonicalCode, 'QUOTE_REQUIRED', 'QUOTE_ONLY_SERVICE',
      'This service requires on-site assessment and artisan quote. No standardized price available.');
  }

  // ── Calculation ────────────────────────────────────────────────────────────
  let calcResult;
  try {
    calcResult = calculate(svc, inputs, formulaIndex);
  } catch (e) {
    if (e.code) return errorResult(e.code, e.message, null, canonicalCode);
    return errorResult('CALCULATION_ERROR', e.message || String(e), null, canonicalCode);
  }

  if (calcResult === null) {
    // QUOTE_ONLY returned null
    return ineligibleResult(canonicalCode, 'QUOTE_REQUIRED', 'QUOTE_ONLY_SERVICE',
      'No standardized price. Artisan quote required.');
  }

  // ── Métier-level minimum floor (NON_ADDITIVE) ──────────────────────────────
  // Apply only if the calculated result was not already subject to a service-level floor
  const mf = svc.minimum_floor;
  let finalAmountMad = calcResult.final_amount_mad;
  let floorApplied   = calcResult.minimum_floor_mad;
  if (mf && mf.enabled && mf.mode === 'NON_ADDITIVE' && !calcResult.minimum_floor_mad) {
    const floorAmt = mf.amount_mad;
    if (finalAmountMad < floorAmt) {
      calcResult.trace.steps.push(`métier floor: max(${floorAmt}, ${finalAmountMad}) = ${floorAmt}`);
      finalAmountMad = floorAmt;
      floorApplied   = floorAmt;
    }
  }

  // ── Non-integer MAD final check ────────────────────────────────────────────
  if (!Number.isInteger(finalAmountMad)) {
    return errorResult('NON_INTEGER_MAD_RESULT',
      `EXACT_INTEGER_MAD policy violated: final_amount_mad = ${finalAmountMad}. Non-integer MAD result is not contractual.`,
      null, canonicalCode);
  }

  // ── Policy collection ──────────────────────────────────────────────────────
  const { applied: policiesApplied, safety: safetyRefs, missing: missingPolicies } = collectPolicies(svc, policyIndex);

  // ── Build success result ───────────────────────────────────────────────────
  return {
    ok:              true,
    service_code:    canonicalCode,
    service_version: svc.decision_version || 'v0.3',

    qualification: {
      status:             'ELIGIBLE',
      conditions_checked: eligResult.conditionsChecked,
      warnings:           missingPolicies.length > 0
                          ? [`Policy refs not found in registry: ${missingPolicies.join(', ')}`]
                          : []
    },

    pricing: {
      calculation_model:     model,
      commercial_output_type: pm.commercial_output_type,
      currency:              'MAD',
      base_amount_mad:       calcResult.base_amount_mad   !== undefined ? calcResult.base_amount_mad   : null,
      calculated_amount_mad: calcResult.calculated_amount_mad !== undefined ? calcResult.calculated_amount_mad : null,
      minimum_floor_mad:     floorApplied || null,
      final_amount_mad:      finalAmountMad,
      labour_amount_mad:     calcResult.labour_amount_mad !== undefined ? calcResult.labour_amount_mad : null,
      variable_part_separate: calcResult.variable_part_separate || false,
      diagnostic_price_mad:  calcResult.diagnostic_price_mad  || null,
      absorption_eligible_if_followup: calcResult.absorption_eligible_if_followup !== undefined ? calcResult.absorption_eligible_if_followup : null,
      qualifying_service_codes: calcResult.qualifying_service_codes || null,
      add_on_amount_mad:     calcResult.add_on_amount_mad || null,
    },

    calculation_trace: calcResult.trace,

    materials:         buildMaterials(svc),
    policies_applied:  policiesApplied,
    safety_policy_refs: safetyRefs,

    routing: null,

    scope: {
      eligible:              true,
      scope_change_required: false
    },

    provenance: { ...PROVENANCE }
  };
}

module.exports = {
  evaluateFixeoPrice,
  // Export internals for testing
  _internal: {
    evaluateEligibility,
    evaluateHardExclusions,
    evaluatePredicate,
    validateInputs,
    calculate,
    assertIntegerMad,
    checkMenuiserieBatch,
    checkPaintingInputs,
    collectPolicies
  }
};
