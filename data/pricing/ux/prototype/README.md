# FIXEO Estimator Dormant Visual Prototype — Phase 7C.8B

## Status: PROTOTYPE INTERNE — NON PRODUCTION — DORMANT

**DO NOT integrate into production. DO NOT deploy. DO NOT activate engine or orchestrator.**

---

## What This Is

A fully functional visual prototype of the FIXEO Estimator V1, built to the frozen Phase 7C.8A UX contract.

This prototype:
- Uses the **real dormant Estimator Orchestrator V1** (via adapter)
- Uses the **real dormant Pricing Engine Core V1** (through orchestrator)
- Renders **all 8 canonical outcome types**
- Implements **all 16 annotated screen states**
- Demonstrates **all 8 demo flows** (A–H)
- Performs **zero price calculation** in the UI layer

---

## Files

| File | Description |
|------|-------------|
| `estimator-prototype.html` | Main prototype with demo launcher + modal/sheet |
| `estimation-page-prototype.html` | `/estimation` page prototype (PAGE_REQUIRED/PAGE_RECOMMENDED) |
| `estimator-prototype.css` | Visual styles — full design language from 7C.8A contract |
| `estimator-prototype.js` | Component renderers + flow controller (23 components) |
| `estimator-prototype-adapter.js` | Orchestrator bridge (Node.js) |
| `estimator-prototype-fixtures.js` | 8 demo flow fixtures (A–H) |
| `validate-7c8b.js` | Phase 7C.8B validator |
| `tests/prototype-tests-v1.js` | 155 test assertions |
| `prototype-test-report.v1.json` | Test results |
| `README.md` | This file |

---

## How to Open the Prototype

**Option A — file:// (browser, demo mode):**
Open `estimator-prototype.html` directly in a browser. Uses pre-computed outcomes. All 8 scenario buttons work without Node.

**Option B — Node.js (full orchestrator integration):**
```bash
node data/pricing/ux/prototype/estimator-prototype-adapter.js
# Or run a simple server:
cd data/pricing/ux/prototype && npx serve .
```

---

## Running Tests + Validator

```bash
# From repo root:
node data/pricing/ux/prototype/tests/prototype-tests-v1.js
node data/pricing/ux/prototype/validate-7c8b.js
```

---

## Demo Flows

| Flow | Métier | Scenario | Expected Outcome |
|------|--------|----------|-----------------|
| A | Menuiserie | Réglage porte intérieure | PRICE_READY (300 MAD) |
| B | Plomberie | Remplacement robinet | LABOUR_PLUS_PART_READY (250 MAD MOE) |
| C | Électricité | Diagnostic général | DIAGNOSTIC_READY (200 MAD) |
| D | Nettoyage | Ménage standard 2×3h | PRICE_READY calculated (390 MAD) |
| E | Peinture | Mur intérieur | PAGE_REQUIRED → /estimation |
| F | Serrurerie | Porte blindée | QUOTE_REQUIRED |
| G | Électricité | Odeur brûlé (safety) | SAFETY_STOP (no price) |
| H | Serrurerie | Cylindre (RAFI) | PRICE_READY or LABOUR_PLUS_PART |

---

## Architecture

```
UI (prototype.html)
  → estimator-prototype.js (components, no price calc)
  → estimator-prototype-adapter.js
  → estimator-orchestrator-v1.js (dormant)
  → pricing-engine-core-v1.js (dormant, sole price calculator)
```

**UI data boundary (enforced):**
- UI may: render, collect answers, submit answers, request next step
- UI must NOT: calculate price, apply multiplier, apply surcharge, derive painted_m2 from floor

---

## Key Doctrine (from Phase 7C.8A contract)

| Rule | Status |
|------|--------|
| city_affects_price = false | ✅ Enforced |
| urgency_affects_price = false | ✅ Enforced |
| rounding_policy = EXACT_INTEGER_MAD | ✅ From engine |
| painted_m2 direct only | ✅ No floor conversion |
| PER_CLEANER_HOUR ≠ PER_HOUR | ✅ Distinct |
| Labour + part never summed | ✅ Two separate cards |
| QUOTE_REQUIRED = valid outcome | ✅ No error framing |
| SAFETY_STOP = no price | ✅ Enforced |
| RAFI = intelligence indicator | ✅ No chat bubbles |

---

## Production Status

| Component | Status |
|-----------|--------|
| Pricing Engine Core V1 | DORMANT |
| Estimator Orchestrator V1 | DORMANT |
| Production Estimator UI | NOT IMPLEMENTED |
| This Prototype | DORMANT — for human review only |
| Deployments performed | **ZERO** |
