# FIXEO Canonical Pricing Registry V1 — Design Draft
## NOT PRODUCTION — Phase 7C.2 Architecture Document

**Status:** DRAFT  
**Phase:** 7C.2  
**Date:** 2026-08-09  
**Production ready:** false  
**Runtime import:** false  
**HTML script reference:** false  

---

## Purpose

This directory contains the canonical pricing registry design for FIXEO's future pricing engine (Estimation V1). It defines:

- **The single source of truth** for all approved standardized FIXEO service prices
- **The schema contract** that all future pricing surfaces must implement
- **The calculation formulas** for each service pricing model
- **The commercial output types** that determine what clients see
- **The policy references** that govern artisan behavior
- **The routing rules** for out-of-scope detection

This is a **design/freeze layer only**. It does not connect to any production surface.

---

## Source of Truth Chain

```
External Moroccan market research (Phase 7B.x)
    ↓
Human calibration (Phase 7B.x.1)
    ↓
Human price decision freeze (Phase 7B.x.2 — V0.3 artifacts)
    ↓ IMMUTABLE — these are frozen historical records
Consolidation audit (Phase 7C.1)
    ↓
Doctrine correction (Phase 7C.1.1 — canonical-concepts.v0.1.json)
    ↓
THIS LAYER — Canonical Registry Design (Phase 7C.2)
    ↓ NOT YET CONNECTED
Future: Shadow engine → Estimator V1 → Production
```

The 8 métier V0.3 registries under `data/pricing/research/` are immutable. This registry derives from them but does not replace them.

---

## Directory Contents

| File | Purpose |
|------|---------|
| `canonical-registry.v1.draft.json` | 53 approved services in canonical schema |
| `canonical-registry.schema.v1.json` | JSON Schema validation contract |
| `formula-registry.v1.draft.json` | 10 calculation formulas with expressions and examples |
| `policy-registry.v1.draft.json` | 13 canonical policies (referenced by service entries) |
| `routing-registry.v1.draft.json` | 17 canonical routing rules (cross-métier + external) |
| `legacy-code-map.v1.draft.json` | Full traceability from legacy → canonical codes |
| `service-migration-matrix.v1.md` | Human-readable migration table for all 53 services |
| `validate-canonical-v1.js` | Automated validation (run from repo root) |
| `README.v1-draft.md` | This file |

---

## Commercial Model — Hybrid Model C

Every service maps to exactly one `commercial_output_type`:

| Type | Meaning | Services |
|------|---------|---------|
| `FIXEO_PRICE` | Fixed contractual price for eligible scope | 28 services |
| `FIXEO_CALCULATED_PRICE` | Deterministic price from inputs+formula | 12 services |
| `FIXEO_LABOUR_PRICE_PLUS_PART` | Fixed labour + separately disclosed hardware | 6 services |
| `FIXEO_DIAGNOSTIC` | Standardized diagnostic, may absorb | 3 services |
| `FIXEO_ADD_ON` | Add-on to primary service, not standalone | 1 service |
| `FIXEO_ESTIMATE` | Genuinely non-binding estimate | **0 services** |
| `QUOTE_REQUIRED` | No standardized price | 0 in this draft (deferred services not included) |

**FIXEO_ESTIMATE is intentionally 0.** Approved standardized services are contractual, not indicative.

---

## Calculation Models

Each service has a `calculation_model` that drives the formula engine:

| Model | Formula | Count |
|-------|---------|-------|
| `FIXED` | `price = fixed_amount` | 13 |
| `CONDITIONAL_FIXED` | `if eligible: price = fixed; else: scope change` | 14 |
| `UNIT_MULTIPLICATION` | `price = rate × quantity` | 2 |
| `UNIT_MULTIPLICATION_WITH_FLOOR` | `price = max(floor, rate × quantity)` | 6 |
| `TIME_BASED_SINGLE` | `price = max(min_payable, rate × hours)` — 1 artisan | 1 |
| `TIME_BASED_TEAM` | `price = max(floor, rate × workers × hours)` — N workers | 1 |
| `MINIMUM_FLOOR` | `price = floor_amount` (service IS the floor) | 3 |
| `LABOUR_FIXED_PART_SEPARATE` | Fixed labour + disclosed hardware | 6 |
| `ADD_ON` | `add_on_rate × quantity`, attached to primary | 1 |
| `DIAGNOSTIC` | `diagnostic_price`, may absorb | 3 |
| `QUOTE_ONLY` | No calculation | 0 |

**Total: 53**

---

## Pricing Units

11 canonical units. Two critical distinctions must never be collapsed:

- `PER_HOUR` (bricolage — 1 artisan) ≠ `PER_CLEANER_HOUR` (nettoyage — N workers)
- `PER_M2` (floor area) ≠ `PER_PAINTED_M2` (painted walls) ≠ `PER_CEILING_M2` (ceiling)

---

## Minimum Floors

Four métiers have minimum floors (NON_ADDITIVE — never added to service price):

| Métier | Floor | Formula |
|--------|-------|---------|
| Bricolage | 200 MAD | `max(200, calculated)` |
| Nettoyage | 200 MAD | `max(200, 65 × workers × hours)` |
| Peinture | 800 MAD | `max(800, rate × m²)` |
| Menuiserie | 300 MAD | `max(300, service_price)` |

**Serrurerie: floor = null.** 220 MAD is a service price, not a floor policy.  
**Plomberie, Electricite, Climatisation: floor = null.** Diagnostic fees are NOT minimum floors.

---

## Diagnostic Services

Three métiers have diagnostic services that may be absorbed against a same-visit qualifying repair:

| Métier | Price | Policy |
|--------|-------|--------|
| Plomberie | 180 MAD | `POL-DIAGNOSTIC-ABSORPTION-PLOMBERIE-V1` |
| Electricite | 200 MAD | `POL-DIAGNOSTIC-ABSORPTION-ELECTRICITE-V1` |
| Climatisation | 250 MAD | `POL-DIAGNOSTIC-ABSORPTION-CLIM-V1` |

Absorption rules are independently frozen per métier. They are NOT interchangeable.

---

## Policies

13 canonical policies. Services reference policies by stable ID — policy text is not duplicated in service entries.

Key policies:
- `POL-HORS-PERIMETRE-V1` — universal scope-change protocol (all métiers)
- `POL-MINIMUM-NON-ADDITIVE-V1` — floor is never additive
- `POL-PART-DISCLOSURE-V1` — 7-step hardware disclosure for LABOUR_FIXED_PART_SEPARATE
- `POL-ELECTRICAL-SAFETY-V1` — MAKE_SAFE pre-step
- `POL-SERRURERIE-AUTHORIZATION-V1` — occupancy authorization
- `POL-REFRIGERATION-INTEGRITY-V1` — no blind refrigerant top-up
- `POL-PAINTED-SURFACE-V1` — measurement basis + active moisture exclusion

---

## Formulas

10 formula definitions. Implemented in `formula-registry.v1.draft.json`. **Not executable production code.**

---

## Routing

17 canonical routes. Services with conditional eligibility reference routes. Includes:
- Cross-métier routes (e.g., menuiserie → serrurerie, peinture → plomberie)
- External routes (electricite → ONEE)
- Specialist routes (climatisation → R32 specialist)
- First documented: `serrurerie → menuiserie` (door frame damage after opening — gap from V0.3)

---

## Eligibility

All `CONDITIONAL_FIXED` services have eligibility conditions. Currently represented as:
- Structured conditions where safe (field/operator/value)
- `supporting_prose` for cases where structured precision would be unsafe

Full structured eligibility will be completed in Phase 7C.3 (shadow engine design) when UX requirements are known.

---

## Versioning

Three semver levels:
- **PATCH** — Editorial corrections, copy updates, no price/schema change
- **MINOR** — New service approved, deferred approved — no schema break
- **MAJOR** — Calculation model change, schema field added/removed, commercial doctrine change

Each service has independent `service_version`. No price change without `human_approval_ref`.

---

## Provenance

All 53 services carry:
- `price_provenance: "FIXEO_HUMAN_CALIBRATED_PILOT"`
- `maturity: "LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION"`
- `transaction_backed: false`
- `production_ready: false`

Human approval ≠ evidence quality. `LOW` confidence services (NET-030, MENU_002/003/004A/004B) retain their evidence confidence even after human approval.

---

## Rounding Policy

**Decision: PENDING HUMAN APPROVAL**

Recommended: Option A — nearest integer MAD.

Analysis: Fixed/conditional-fixed services (31) are always integer. Minimum floors dominate small calculated jobs. For large jobs, integer MAD precision is sufficient.

---

## What This Is NOT

- ❌ Not connected to any runtime JS/HTML
- ❌ Not imported by any production code
- ❌ Not referenced by estimator, reservation, pSEO, profiles, or Supabase
- ❌ Not the implementation of the pricing engine
- ❌ Not a Supabase migration
- ❌ Not deployed

---

## Production Promotion Gate

Before any service can be promoted to `production_ready = true`:

1. Schema validation passes (`validate-canonical-v1.js` PASS)
2. All 53 decisions validated
3. Human review flags resolved (2 flags: plomberie.robinet/chasse_eau)
4. Rounding policy approved by human
5. Shadow engine validates formulas against test cases
6. Legacy output comparison — P0/P1 contradictions resolved
7. UI copy strings approved
8. Telemetry schema ready (`service_sub_code` in missions)
9. Regression QA on staging
10. Explicit human production approval

**No automatic promotion.**

---

## Next Phase

**Phase 7C.3 — Shadow Engine Design:** Define formula engine interface contract, test case suite, legacy comparison methodology. Still no production deployment.
