# FIXEO Estimator UX Prototype Contract — Phase 7C.8A

## Status: DESIGN CONTRACT — NOT FOR PRODUCTION

This directory contains the frozen UX prototype contract for the FIXEO Estimator.

**Phase:** 7C.8A  
**Objective:** Freeze the UX architecture and contract before building the dormant visual prototype.  
**Production status:** BLOCKED — no activation performed.

---

## Artifacts

| File | Description |
|------|-------------|
| `estimator-visual-contract.v1.draft.json` | Visual language, surface targets, motion policy, loading policy, UI data boundary |
| `estimator-component-map.v1.draft.json` | 23 component definitions with roles, constraints, and mapping to orchestrator outcomes |
| `estimator-screen-states.v1.draft.json` | 16 annotated screen states with desktop + mobile notes |
| `estimator-responsive-contract.v1.draft.json` | Breakpoints, modal/sheet specs, touch targets, keyboard/accessibility rules |
| `estimator-copy.v1.draft.json` | French copy (LEGAL_REVIEW_REQUIRED). Darija: FUTURE. |
| `estimator-modal-page-handoff.v1.draft.json` | Threshold rules, transition behavior, session preservation |
| `estimator-example-flows.v1.md` | 8 annotated example flows (Flows A–H) |
| `estimator-ux-spec.v1.md` | Canonical UX spec: experience principle, doctrine, acceptance gate |
| `validate-7c8a.js` | Validator — run to verify contract completeness and integrity |
| `README.md` | This file |

---

## Running the Validator

```bash
node data/pricing/ux/validate-7c8a.js
```

---

## Key Frozen Decisions

### Surface
- **Modal** (desktop centered, 600px) / **Sheet** (mobile bottom) for MODAL_OK sessions
- **Page** (`/estimation`) for PAGE_RECOMMENDED (4+ questions) and PAGE_REQUIRED (measurement dependency)
- Transition is seamless — session always preserved, never restarted

### UX Data Boundary
The UI is a pure consumer of orchestrator output.
- **UI may:** render, collect answers, submit answers, request next step
- **UI must NOT:** calculate price, apply multipliers, apply surcharges, derive painted_m2 from floor, execute dormant batch rules, read legacy pricing tables

### Commercial Outcomes
All 8 canonical outcome types are handled:

| Outcome | UX Treatment |
|---------|-------------|
| PRICE_READY | Price dominates — 48px bold |
| DIAGNOSTIC_READY | Exact amount, métier-specific absorption copy |
| LABOUR_PLUS_PART_READY | Two separate cards — never summed |
| ADD_ON_READY | Standard price result |
| QUOTE_REQUIRED | Valid outcome — no fake price, no apology |
| ROUTE_REQUIRED | Redirect — not an error |
| SAFETY_STOP | No price — calm, factual, serious |
| REQUALIFY | Client copy hides "REQUALIFY" word |

### Pricing Doctrine Preserved
- `city_affects_price = false`
- `urgency_affects_price = false`
- `rounding_policy = EXACT_INTEGER_MAD`
- `painted_m2` is the only canonical measurement — no floor→painted conversion
- `PER_CLEANER_HOUR ≠ PER_HOUR`
- Integer hours only
- Menuiserie experimental batch rules: DORMANT, never exposed

### RAFI
Intelligence indicator only — no chat bubbles, no alternating messages.

---

## Scope Constraints

**Allowed modification scope in this phase:** `data/pricing/ux/` only.

**Forbidden:**
- Production HTML / CSS / JS
- Supabase, RAFI runtime, reservation runtime
- Homepage, artisan profile runtime
- Production activation flags
- Any deployment

---

## Production Blockers (carried forward)

- P0: Peinture reservation display contradiction
- P0: reservation.js booking total replacement / migration
- HRQ-002, HRQ-004, HRQ-005, HRQ-006, HRQ-008

These do not block the UX prototype contract. They block production activation.
