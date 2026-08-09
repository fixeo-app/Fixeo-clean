# FIXEO Pricing Engine Core V1 — Type Contracts

**Engine Version:** 1.0.0-dormant  
**Engine Type:** RULE_BASED_CANONICAL_PRICING_ENGINE  
**Production Active:** false  

---

## Input

```
evaluateFixeoPrice({
  service_code: string,          // canonical service code (required)
  inputs: {                      // registered canonical inputs only
    [inputId: string]: any
  }
})
```

## Success Result (ok = true)

```
{
  ok: true,
  service_code: string,
  service_version: string,
  qualification: {
    status: "ELIGIBLE",
    conditions_checked: ConditionResult[],
    warnings: string[]
  },
  pricing: {
    calculation_model: string,
    commercial_output_type: string,
    currency: "MAD",
    base_amount_mad: integer | null,
    calculated_amount_mad: integer | null,
    minimum_floor_mad: integer | null,
    final_amount_mad: integer | null,
    labour_amount_mad: integer | null,
    variable_part_separate: boolean,
    diagnostic_price_mad: integer | null,
    absorption_eligible_if_followup: boolean | null,
    qualifying_service_codes: string[] | null,
    add_on_amount_mad: integer | null
  },
  calculation_trace: {
    formula_id: string,
    inputs: object,
    steps: string[],
    result_mad: integer
  },
  materials: {
    principal_part: string | null,
    parts_policy: string | null,
    approval_required: boolean | null,
    client_may_supply: boolean | null
  },
  policies_applied: string[],
  safety_policy_refs: string[],
  routing: null,
  scope: {
    eligible: true,
    scope_change_required: false
  },
  provenance: {
    price_provenance: string,
    maturity: string,
    production_ready: false
  }
}
```

## Non-Eligible Result (ok = false)

```
{
  ok: false,
  service_code: string,
  qualification: {
    status: "INELIGIBLE" | "REQUALIFY" | "QUOTE_REQUIRED" | "ROUTE" | "STOP_SAFETY",
    failed_condition: string | null,
    reason_code: string,
    reason: string
  },
  routing: {
    route_ref: string | null,
    target_metier: string | null,
    target_service: string | null,
    target_external: string | null,
    action: string | null
  } | null,
  pricing: null
}
```

## Error Result (ok = false, error)

```
{
  ok: false,
  error: {
    code: string,
    message: string,
    field: string | null
  },
  pricing: null
}
```

## Error Codes

- `SERVICE_NOT_FOUND`
- `MISSING_REQUIRED_INPUT`
- `INVALID_INPUT_TYPE`
- `INVALID_ENUM_VALUE`
- `NEGATIVE_QUANTITY`
- `UNKNOWN_INPUT_KEY`
- `UNSUPPORTED_FRACTIONAL_HOURS`
- `NON_INTEGER_MAD_RESULT`
- `ADD_ON_PRIMARY_REQUIRED`
- `ADD_ON_PRIMARY_NOT_ELIGIBLE`
- `FORMULA_NOT_FOUND`
- `POLICY_NOT_FOUND`
- `ROUTE_NOT_FOUND`
- `UNKNOWN_CALCULATION_MODEL`

## Calculation Models

FIXED | CONDITIONAL_FIXED | UNIT_MULTIPLICATION | UNIT_MULTIPLICATION_WITH_FLOOR |
TIME_BASED_SINGLE | TIME_BASED_TEAM | MINIMUM_FLOOR | LABOUR_FIXED_PART_SEPARATE |
ADD_ON | DIAGNOSTIC | QUOTE_ONLY (parse only)

## Commercial Output Types

FIXEO_PRICE | FIXEO_CALCULATED_PRICE | FIXEO_LABOUR_PRICE_PLUS_PART |
FIXEO_DIAGNOSTIC | FIXEO_ADD_ON

FIXEO_ESTIMATE and QUOTE_REQUIRED: zero approved standardized services.
Engine will not return FIXEO_ESTIMATE for any approved service.

## Provenance

All engine results carry:
- price_provenance: FIXEO_HUMAN_CALIBRATED_PILOT
- maturity: LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
- production_ready: false (ALWAYS)
