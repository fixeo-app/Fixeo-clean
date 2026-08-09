# FIXEO Estimator — Phase 7C.6 Report
## Estimator Orchestration Design & Flow Contract

**Date:** 2026-08-09 | **Status:** DESIGN COMPLETE — Dormant

---

## PHASE_7C6_ORCHESTRATION_DESIGN_READY = true

All validators pass. No production files modified. Engine dormant.

---

## Baseline

- **Starting HEAD:** `04e880a0e2b3131f2dad0873f8dacc03f9050579` ✅
- **All prior validators:** 91/91, 130/130, 92/92, 77/77, 664/664, 209/209, 37/37, 24/24, 49/49, 66/66 — ALL PASS ✅
- **Production diff:** 0 ✅
- **Engine:** DORMANT ✅

---

## Artifacts Created

| File | Purpose |
|------|---------|
| `estimator-orchestration-contract.v1.draft.json` | Master contract — roles, doctrine, UX contracts by domain |
| `estimator-state-machine.v1.draft.json` | 16 states, all transitions, no hidden state |
| `estimator-entrypoints.v1.draft.json` | 6 entry modes, normalized payload schema |
| `estimator-question-planner.v1.draft.json` | 7-priority question order, minimization rules, service examples |
| `estimator-outcomes.v1.draft.json` | 8 outcome types, next action enum (9 values), client outcome schema |
| `estimator-handoff-contract.v1.draft.json` | pricing_context_token, session contract, state persistence |
| `estimator-flow-scenarios.v1.json` | 35 realistic orchestration flows |
| `orchestrator-api.v1.draft.json` | 5 pure functions, analytics events, accessibility + mobile contract |
| `estimator-ux-architecture.v1.md` | Architecture comparison, 10 explicit UX answers, section diagrams |
| `phase-7c6-report.md` | This document |
| `validate-7c6.js` | Validator (see below) |
| `README.md` | Index |

---

## Key Design Decisions

### State Machine (16 states)
START → METIER_SELECTION → SERVICE_SELECTION → QUALIFICATION ⟷ QUESTION_REQUIRED → READY_FOR_ENGINE → ENGINE_EVALUATION → {PRICE_READY, DIAGNOSTIC_READY, LABOUR_PLUS_PART_READY, ADD_ON_READY, QUOTE_REQUIRED, ROUTE_REQUIRED, SAFETY_STOP, REQUALIFY} → CONFIRMATION_READY

### Entry Modes (6)
A. DIRECT_CTA | B. SERVICE_CARD | C. ARTISAN_PROFILE | D. RAFI | E. RESERVATION_FLOW | F. DEEP_LINK

### Question Priority Order (7 levels)
1. SAFETY → 2. ROUTING_BOUNDARY → 3. SERVICE_IDENTITY → 4. ELIGIBILITY → 5. QUANTITY_MEASUREMENT → 6. PARTS_MATERIAL → 7. COMMERCIAL_CLARIFICATION

### Outcome Types (8)
PRICE_READY, DIAGNOSTIC_READY, LABOUR_PLUS_PART_READY, ADD_ON_READY, QUOTE_REQUIRED, ROUTE_REQUIRED, SAFETY_STOP, REQUALIFY

### Next Actions (9)
CONTINUE_TO_RESERVATION, CHOOSE_ARTISAN, REQUEST_QUOTE, BOOK_DIAGNOSTIC, CHANGE_SERVICE, CHANGE_METIER, PROVIDE_MORE_INFORMATION, CONTACT_SUPPORT, STOP_FOR_SAFETY

### UX Architecture: HYBRID
- Modal: simple/medium services (≤3 questions)
- /estimation page: complex flows, deep-links, measurement assistant, quote forms
- Mobile: bottom sheet → full page

### Flow Scenarios: 35
Covering all 8 métiers, all outcome types, safety stops, routing, city neutrality, urgency neutrality, RAFI, artisan profile, fractional hours, peinture measurement, menuiserie batch, quote required.

---

## Critical Doctrine (Frozen)

1. **Engine is sole price calculator.** Orchestrator never calculates prices.
2. **No legacy pricing authority.** reservation.js, reservation-v2.js, fixeo-estimation-engine-v1.js, fixeo-pricing-marocain.js — all forbidden as pricing sources in Estimator V1.
3. **City = context, not price input.** city_adjustment = null.
4. **Urgency = dispatch priority, not price input.** All modifiers = null.
5. **Safety questions first.** Safety exclusion can stop estimation before any price shown.
6. **QUOTE_REQUIRED is a valid successful outcome.** Not a failure.
7. **Painted_m² = direct canonical measurement.** No floor_area_m2 conversion.
8. **Menuiserie batch rules = DORMANT.** hinge_count/drawer_count >1 → REQUALIFY.
9. **Diagnostic absorption = métier-specific.** No universal absorption rule.
10. **pricing_context_token = sole reservation price input.** Reservation must not recalculate.
