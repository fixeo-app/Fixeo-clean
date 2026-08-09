# FIXEO Estimator Orchestrator V1

```
phase:         PHASE_7C7_ESTIMATOR_ORCHESTRATOR_V1
status:        DORMANT — Implemented, not activated
production:    NOT ACTIVE
```

## ⚠️ DORMANT — No production integration. No deployment. No UI activation.

---

## Files

| File | Purpose |
|------|---------|
| `estimator-orchestrator-v1.js` | **Main orchestrator** — 5 API functions |
| `estimator-session-v1.js` | Session model, state machine, clone/transition |
| `estimator-question-planner-v1.js` | Minimum-question planner, 53 service plans |
| `estimator-service-resolver-v1.js` | Métier/service resolution, candidate filtering |
| `estimator-outcome-mapper-v1.js` | Engine result → orchestrator outcome mapping |
| `estimator-handoff-v1.js` | pricing_context_token builder |
| `validate-orchestrator-v1.js` | Full validation suite |
| `orchestrator-test-report.v1.json` | Test execution summary |
| `tests/orchestrator-tests-v1.js` | 225 flow tests |
| `tests/golden-fixtures-test-v1.js` | 24 golden fixture tests |
| `fixtures/golden-orchestration-fixtures.v1.json` | 24 golden orchestration fixtures |

---

## API

```js
var orc = require('./estimator-orchestrator-v1');

// 1. Start a session
var r1 = orc.startEstimator({
  entry_point: 'DIRECT_CTA',         // or RAFI, ARTISAN_PROFILE, DEEP_LINK, ...
  service_hint: 'plomberie.debouchage_evier',
  city_slug: 'casablanca',           // context only — no price effect
  urgency_context: 'urgent',         // context only — no price effect
});

// 2. Get next step
var step = orc.getNextEstimatorStep(r1.session);
// → { type: 'QUESTION', input_id, prompt_key, answer_type, priority, ... }
// → { type: 'READY', ... }
// → { type: 'OUTCOME', outcome, ... }

// 3. Answer a question
var r2 = orc.answerEstimatorQuestion(session, step.step.question_id, false);

// 4. Evaluate (when state = READY_FOR_ENGINE)
var r3 = orc.evaluateEstimator(session);
// → calls evaluateFixeoPrice() — SOLE PRICE CALCULATOR

// 5. Build pricing context token (for reservation handoff)
var token = orc.buildPricingContextToken(session);
// → { production_valid: false, signature: null, ... }

// Deep link helper
var ctx = orc.parseDeepLinkParams({ metier: 'peinture', service: 'peinture.mur_interieur.all_in' });
```

---

## State Machine (16 states)

```
START
→ METIER_SELECTION | SERVICE_SELECTION | QUALIFICATION | READY_FOR_ENGINE

QUALIFICATION ⟷ QUESTION_REQUIRED
→ READY_FOR_ENGINE | ROUTE_REQUIRED | SAFETY_STOP | QUOTE_REQUIRED

READY_FOR_ENGINE
→ ENGINE_EVALUATION

ENGINE_EVALUATION
→ PRICE_READY | DIAGNOSTIC_READY | LABOUR_PLUS_PART_READY | ADD_ON_READY
  | QUOTE_REQUIRED | ROUTE_REQUIRED | SAFETY_STOP | REQUALIFY

{terminal outcome states}
→ CONFIRMATION_READY
```

---

## Question Priority Order

1. SAFETY (burning_smell, active_moisture, ...)
2. ROUTING_BOUNDARY (distributor, multi_split, ...)
3. SERVICE_IDENTITY (security_door, refrigerant_type, ...)
4. ELIGIBILITY (mcb_defect_confirmed, surface_condition, ...)
5. QUANTITY_MEASUREMENT (painted_m2, worker_count, hours, ...)
6. PARTS_MATERIAL (part_replacement_required, ...)
7. COMMERCIAL_CLARIFICATION

---

## Key Doctrine

- **Engine is sole price calculator** (`evaluateFixeoPrice` from `pricing-engine-core-v1.js`)
- **No city price effect** — `city_slug` stored in entry_context only
- **No urgency price effect** — `urgency_context` stored in entry_context only
- **No legacy pricing imports** — reservation.js, fixeo-estimation-engine-v1.js etc. forbidden
- **QUOTE_REQUIRED = valid successful outcome** (not a failure)
- **painted_m2 = direct canonical measurement** (no floor area conversion)
- **Integer hours only** (fractional → FRACTIONAL_HOURS_NOT_SUPPORTED)
- **Menuiserie batch > 1** → QUOTE_REQUIRED (dormant rules)
- **pricing_context_token** = sole reservation price input (dormant, unsigned in V1)

---

## Running Tests

```bash
node data/pricing/orchestrator/tests/orchestrator-tests-v1.js
node data/pricing/orchestrator/tests/golden-fixtures-test-v1.js
node data/pricing/orchestrator/validate-orchestrator-v1.js
```

---

## Production Activation: BLOCKED

See `data/pricing/shadow/phase-7c5-1-post-shadow-audit.md` for full blocker list.
P0: Peinture contradiction (reservation.js vs reservation-v2.js) must be resolved first.
