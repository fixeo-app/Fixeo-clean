# FIXEO Estimator V1 — Orchestration Design

```
phase:         PHASE_7C6_ESTIMATOR_ORCHESTRATION_DESIGN
status:        DESIGN COMPLETE — DORMANT
production:    NOT ACTIVE
```

## ⚠️ DESIGN ONLY — No runtime implementation. No production modification.

## Files

| File | Purpose |
|------|---------|
| `estimator-orchestration-contract.v1.draft.json` | Master contract: roles, doctrine, all UX domain contracts |
| `estimator-state-machine.v1.draft.json` | 16 states, all transitions |
| `estimator-entrypoints.v1.draft.json` | 6 entry modes, normalized payload schema |
| `estimator-question-planner.v1.draft.json` | 7-priority question order, service flow examples |
| `estimator-outcomes.v1.draft.json` | 8 outcome types, 9 next actions |
| `estimator-handoff-contract.v1.draft.json` | pricing_context_token, session schema, state persistence |
| `orchestrator-api.v1.draft.json` | 5 pure function contracts, analytics, accessibility, mobile |
| `estimator-flow-scenarios.v1.json` | 35 realistic orchestration test flows |
| `estimator-ux-architecture.v1.md` | Architecture comparison, explicit UX answers, diagrams |
| `phase-7c6-report.md` | Phase summary |
| `validate-7c6.js` | Full validation suite |

## Running the Validator

```bash
node data/pricing/orchestration/validate-7c6.js
```

## Key Design Decisions

### Architecture: HYBRID (Modal + /estimation Page)
- **Simple/medium** (≤3 questions): complete in compact modal / bottom sheet
- **Complex** (>3 questions, painting assistant, quote): expand to `/estimation` page
- **Deep links**: `/estimation?metier=...`, `/estimation?service=...`

### State Machine: 16 States
START → METIER_SELECTION → SERVICE_SELECTION → QUALIFICATION ⟷ QUESTION_REQUIRED → READY_FOR_ENGINE → ENGINE_EVALUATION → {PRICE_READY | DIAGNOSTIC_READY | LABOUR_PLUS_PART_READY | ADD_ON_READY | QUOTE_REQUIRED | ROUTE_REQUIRED | SAFETY_STOP | REQUALIFY} → CONFIRMATION_READY

### Question Priority: 7 Levels
1. SAFETY → 2. ROUTING_BOUNDARY → 3. SERVICE_IDENTITY → 4. ELIGIBILITY → 5. QUANTITY_MEASUREMENT → 6. PARTS_MATERIAL → 7. COMMERCIAL_CLARIFICATION

### Core Doctrine
- Engine (`evaluateFixeoPrice`) is **sole price calculator**
- No legacy pricing fallback (reservation.js, reservation-v2.js, etc. all forbidden)
- city_adjustment = null (city is context, not price)
- All modifiers = null (urgency has zero price effect)
- QUOTE_REQUIRED is a valid successful outcome
- pricing_context_token = sole reservation price input

### Production Activation: BLOCKED
See UX architecture document Section 9 for all 7 production gates.
