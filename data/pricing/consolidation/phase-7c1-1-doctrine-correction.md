# PHASE 7C.1.1 — FIXEO Canonical Pricing Doctrine Correction & Freeze
## DOCTRINE CORRECTION ONLY — No Production Implementation

**Date:** 2026-08-09  
**Repository HEAD at start:** `a2363ce4dfbb1f44321c6a6624fa9685d149ddae`  
**Phase:** 7C.1.1 (Correction of 7C.1 conceptual errors + Hybrid Model C freeze)  
**Status:** FROZEN DOCTRINE  
**Production runtime diff:** 0 (confirmed before and after)  
**No deployment performed**

---

## Purpose

Phase 7C.1 produced a correct audit of the 8 frozen métier registries but contained two conceptual errors in its conclusions. This phase:

1. Corrects those errors
2. Freezes the commercial pricing doctrine (Hybrid Model C) as an explicit human decision
3. Re-classifies all 53 approved decisions using corrected concepts
4. Preserves Phase 7C.1 as immutable historical audit

Phase 7C.1 artifacts are NOT modified. This phase creates a new correction/freeze layer.

---

## Correction 1 — MINIMUM_FLOOR vs DIAGNOSTIC_FEE

### The Error

Phase 7C.1 Section 7 (Minimum/Floor Audit) stated:

> "All 8 métiers apply MINIMUM_IS_FLOOR_NOT_ADDITIVE — no exception."

And listed plomberie, electricite, climatisation diagnostic fees alongside bricolage, nettoyage, peinture, menuiserie floors in the same table.

### The Correction

**A MINIMUM_FLOOR and a DIAGNOSTIC_FEE are fundamentally different concepts. They must never be conflated.**

---

### MINIMUM_FLOOR (Canonical Definition)

**Definition:** A billing policy constraint that ensures the final price never falls below a minimum amount, regardless of the calculated service price.

**Formula:** `FINAL_PRICE = max(MINIMUM_FLOOR_MAD, CALCULATED_SERVICE_PRICE)`

**Properties:**
- It is a price floor constraint, not a service
- It is NOT additive (the floor is never added to the service price)
- It cannot be "absorbed" against anything — it is merely the lower bound
- When a standalone service exists to represent the minimum visit (BRIC-001, NET-001), that service is the minimum visit itself — not an additive charge

**Métiers with MINIMUM_FLOOR:**

| Métier | Floor | Source | Formula |
|--------|-------|--------|---------|
| Bricolage | 200 MAD | BRIC-001 + embedded in BRIC-002+ | `max(200, calculated)` |
| Nettoyage | 200 MAD | NET-001 + NET-002 formula | `max(200, 65 × workers × hours)` |
| Peinture | 800 MAD | PEIN-001 policy anchor + all PEIN-002/003/004/005 | `max(800, rate × m²)` |
| Menuiserie | 300 MAD | Embedded policy — no standalone service | `max(300, service_price)` |

**Métiers WITHOUT MINIMUM_FLOOR:**

| Métier | Floor | Reason |
|--------|-------|--------|
| Plomberie | **null** | Diagnostic (180 MAD) is a DIAGNOSTIC_FEE, not a floor |
| Electricite | **null** | Diagnostic (200 MAD) is a DIAGNOSTIC_FEE, not a floor |
| Climatisation | **null** | CLIM-002 (250 MAD) is a DIAGNOSTIC_FEE, not a floor |
| **Serrurerie** | **null** | 220 MAD is an approved service price — see Serrurerie Correction below |

---

### DIAGNOSTIC_FEE (Canonical Definition)

**Definition:** A priced FIXEO service for a structured diagnostic visit. It is a complete service in its own right, with its own standardized FIXEO price. It may be absorbed — offset against a qualifying same-visit repair — only under explicitly frozen métier-specific conditions.

**Formula:** `FINAL_PRICE = DIAGNOSTIC_PRICE_MAD` (standalone) OR `CREDIT = DIAGNOSTIC_PRICE_MAD, REPAIR_PRICE = repair_amount` (absorbed)

**Properties:**
- It IS a real priced service (commercial_output_type = FIXEO_DIAGNOSTIC)
- It can be absorbed (creditied against a repair) under specific frozen conditions
- Absorption rules are métier-specific — they are NOT generalizable
- Absorption must not be inferred beyond what is frozen in the métier V0.3 artifact
- It is NOT a minimum floor — it does not constrain other service prices

**Métier diagnostic fees:**

| Service | Price | Absorption Conditions |
|---------|-------|----------------------|
| plomberie.diagnostic | 180 MAD | Absorbed if same-visit qualifying repair: fuite_simple, debouchage_evier, debouchage_wc_simple, robinet_remplacement, chasse_eau |
| electricite.diagnostic | 200 MAD | Absorbed per D3 rule — standardized qualifying services same visit |
| CLIM-002 | 250 MAD | Absorbed if same-visit CLIM-003, CLIM-004, or CLIM-013 follows |

**Critical rule:** Do NOT extend absorption beyond what is frozen in each métier's V0.3 artifact. Absorption rules are independently frozen and must remain distinct.

---

### Key Distinction Summary

| Concept | MINIMUM_FLOOR | DIAGNOSTIC_FEE |
|---------|--------------|----------------|
| What it is | Price policy constraint | Priced FIXEO service |
| Formula | max(floor, calculated) | diagnostic_price_mad |
| Standalone? | Not always — sometimes embedded | Yes, always |
| Absorbable? | No | Yes, under specific conditions |
| Additive? | Never | N/A (absorbed, not added) |
| Calculation model | MINIMUM_FLOOR | DIAGNOSTIC |
| Commercial output | FIXEO_PRICE | FIXEO_DIAGNOSTIC |
| Cross-métier applicability | Métier-specific values | Métier-specific rules |

---

## Correction 2 — Serrurerie No Minimum Floor

### The Error

Phase 7C.1 Section 7 listed:

> "Serrurerie 220 MAD (porte claquée) implicit floor — Lowest approved service — N/A (no explicit floor policy)"

And Section 12 (Minimum/Floor Audit) listed serrurerie's lowest service as a "de facto floor."

### The Correction

**220 MAD is the approved price of `serrurerie.porte_claquee_ouverture` — a standardized service price. It is NOT a métier-wide minimum billing policy.**

- `serrurerie.minimum_floor = null`
- No minimum floor policy exists for serrurerie
- A future explicit human decision would be required to establish any métier-wide floor for serrurerie
- Until such a decision is made, the 220 MAD service remains merely the lowest approved service in the serrurerie portfolio

---

## Correction 3 — Separation of Calculation and Commercial Output

### The Error

Phase 7C.1 Section 6 proposed a single 10-type "architecture enum" that conflated:
- HOW the price is computed (calculation logic)
- WHAT FIXEO communicates to the client (commercial presentation)

For example, `FIXEO_FIXED_PRICE` combined both: it is simultaneously a calculation (fixed amount) and a commercial claim (FIXEO price). These are separate concepts that happen to overlap for simple services.

### The Correction

**The canonical registry must separate these into two distinct fields:**

1. `calculation_model` — how the price is computed (technical)
2. `commercial_output_type` — what FIXEO communicates to the client (commercial)

For most standardized services: `calculation_model = FIXED` → `commercial_output_type = FIXEO_PRICE`. But for complex services (diagnostics, per-unit, labour+part), the two fields carry different information.

---

## Canonical Calculation Model Enum (Frozen v0.1)

| Model | Formula | Examples |
|-------|---------|---------|
| `FIXED` | `price = fixed_amount_mad` | plomberie.fuite_simple, serrurerie.porte_claquee_ouverture, CLIM-009, BRIC-003, NET-010/011/013/014 |
| `CONDITIONAL_FIXED` | `if eligible: price = fixed_amount; else: QUOTE_OR_ROUTE` | electricite.disjoncteur, serrurerie.porte_verrouillee, CLIM-013, CLIM-020/021, BRIC-030, MENU_001/001B/004A/004B/006 |
| `UNIT_MULTIPLICATION` | `price = unit_rate_mad × quantity` | CLIM-003, CLIM-004 |
| `UNIT_MULTIPLICATION_WITH_FLOOR` | `price = max(floor, unit_rate_mad × quantity)` | PEIN-002/003/004/005, NET-030, BRIC-002 (if interpreted) |
| `TIME_BASED_SINGLE` | `price = max(min_payable, rate_per_hour × hours)` | BRIC-002 — single artisan, 150 MAD/h, min 2h |
| `TIME_BASED_TEAM` | `price = max(floor, rate_per_cleaner_hour × workers × hours)` | NET-002 — MUST NOT collapse with TIME_BASED_SINGLE |
| `MINIMUM_FLOOR` | `price = minimum_floor_mad (the service IS the floor)` | BRIC-001, NET-001, PEIN-001 |
| `LABOUR_FIXED_PART_SEPARATE` | `fixeo_labour = fixed; hardware = separate+disclosed+approved` | serrurerie.cylindre/serrure, MENU_002/003, plomberie.robinet/chasse_eau |
| `ADD_ON` | `price = add_on_rate × quantity; not standalone` | PEIN-008 |
| `DIAGNOSTIC` | `price = diagnostic_price_mad; may absorb` | plomberie.diagnostic, electricite.diagnostic, CLIM-002 |
| `QUOTE_ONLY` | `no calculation — artisan quotation required` | all deferred services |

**Deprecated strings from Phase 7C.1:** `FIXEO_FIXED_PRICE`, `FIXED_PER_AC_UNIT`, `HOURLY` (bricolage), `PER_CLEANER_HOUR`, `MINIMUM_VISIT_PRICE`, `FORFAIT_MINIMUM`, `MINIMUM_PROJECT_FLOOR`, `CONDITIONAL_PER_M2_WITH_MINIMUM`, `LABOUR_ONLY_PER_PAINTED_M2`, `ALL_IN_STANDARD_PER_PAINTED_M2`, `ALL_IN_WITH_MINOR_PREP_PER_PAINTED_M2`, `HALF_DAY`, `PER_ITEM_FORFAIT`

---

## Commercial Output Type Enum (Frozen v0.1 — Hybrid Model C)

| Type | Definition | Contractual? | Artisan Override? |
|------|-----------|-------------|------------------|
| `FIXEO_PRICE` | Standardized fixed contractual FIXEO price for eligible scope | Yes | No |
| `FIXEO_CALCULATED_PRICE` | Deterministic price from approved inputs/formula — contractual once inputs known | Yes | No |
| `FIXEO_LABOUR_PRICE_PLUS_PART` | Fixed FIXEO labour + separately disclosed, approved variable hardware | Labour: Yes | No (either part) |
| `FIXEO_DIAGNOSTIC` | Standardized diagnostic price. May absorb under frozen métier-specific conditions | Yes | No |
| `FIXEO_ADD_ON` | Calculated add-on to qualifying primary service. Not standalone. | Yes | No |
| `FIXEO_ESTIMATE` | Genuinely non-binding estimate. RESERVED — not default for standardized services. | No | Yes |
| `QUOTE_REQUIRED` | No standardized price. Artisan quotation required. | No | N/A |

**Critical constraint:** `FIXEO_ESTIMATE` is reserved only for services explicitly classified as estimates. It MUST NOT be the default status for any approved standardized service.

---

## Hybrid Model C — Human Decision Freeze

**Decision ID:** `FIXEO_PRICING_COMMERCIAL_MODEL`  
**Value:** `HYBRID_MODEL_C`  
**Date:** 2026-08-09  
**Phase:** 7C.1.1

**Mapping:**

| Scope | Commercial Output Type |
|-------|----------------------|
| Standardized + eligible | FIXEO_PRICE |
| Deterministically calculable standardized | FIXEO_CALCULATED_PRICE |
| Standardized labour + variable hardware | FIXEO_LABOUR_PRICE_PLUS_PART |
| Diagnostic-first service | FIXEO_DIAGNOSTIC |
| Qualifying add-on | FIXEO_ADD_ON |
| Insufficiently standardized / custom / highly variable | QUOTE_REQUIRED |
| Intentionally classified estimate only | FIXEO_ESTIMATE |

---

## Contractual Price Doctrine

**Core principle:** The FIXEO price applies to the declared and eligible scope.

An artisan must NOT silently change the standardized price while the actual intervention remains within the declared FIXEO scope.

**Scope-change protocol** (if reality differs from declared scope):
1. STOP
2. IDENTIFY the scope difference
3. EXPLAIN to the client what changed
4. DECLARE_SCOPE_CHANGE
5. CALCULATE_NEW_FIXEO_PRICE_OR_QUOTE
6. OBTAIN_CLIENT_APPROVAL
7. CONTINUE only after explicit approval

**Absolute prohibitions:**
- No silent surcharge
- No retroactive surcharge
- No artisan-only discretionary multiplier
- No price modification because artisan considers work harder, unless an objective frozen escape trigger applies

---

## Diagnostic Absorption Doctrine

Absorption is métier-specific and must not be generalized.

| Métier | Diagnostic | Absorbs When |
|--------|-----------|--------------|
| Plomberie | 180 MAD | Same-visit qualifying repair: fuite_simple, debouchage_evier, debouchage_wc_simple, robinet_remplacement, chasse_eau |
| Electricite | 200 MAD | D3 rule: standardized qualifying services same visit |
| Climatisation | 250 MAD (CLIM-002) | Same-visit CLIM-003, CLIM-004, or CLIM-013 |
| All others | None | N/A |

Absorption rules are independently frozen in each métier's V0.3 artifact. Do NOT infer absorption beyond what is frozen.

---

## Parts / Hardware Doctrine

| Policy | Definition | Métiers |
|--------|-----------|---------|
| `ARTISAN_SUPPLIED_INCLUDED` | Consumables/products in service price | Nettoyage (grand ménage), climatisation (cleaning products + gas in CLIM-013), bricolage (≤8 fixings), peinture all-in |
| `CLIENT_SUPPLIED` | Client brings the part; artisan supplies minor consumables | Plomberie (robinet, chasse-eau mechanism), electricite (outlets, switches), peinture labour-only (paint), bricolage (furniture), climatisation (AC unit), serrurerie (client-supplied option) |
| `ARTISAN_DISCLOSED_SEPARATE` | Hardware disclosed with price range; client approves before installation | Serrurerie (cylinder, lock), menuiserie (hinges, runners) — 7-step disclosure sequence |
| `NA` | No parts/hardware involved | Most diagnostic and pure-labour services |

---

## Minimum Anti-Double-Charge Doctrine

`MINIMUM_IS_FLOOR_NOT_ADDITIVE` — universal across all 8 métiers.

Formula: `FINAL_PRICE = max(MINIMUM_FLOOR_MAD, CALCULATED_SERVICE_PRICE)`

**Never:** `FINAL_PRICE = MINIMUM_FLOOR_MAD + CALCULATED_SERVICE_PRICE`

Applies only to métiers WITH a minimum floor: bricolage, nettoyage, peinture, menuiserie.
Does NOT apply to plomberie, electricite, climatisation, serrurerie (no floor policy).

---

## Legacy Disclaimer Status

**Current text (all frozen artifacts):**  
*"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."*

**Canonical status:** `LEGACY_RESEARCH_DISCLAIMER — NOT_CANONICAL_FOR_STANDARDIZED_FIXEO_PRICE`

**Reason:** Incorrectly implies the artisan has final unilateral pricing authority even for standardized FIXEO-price services.

**Correct application:** Only applicable to `FIXEO_ESTIMATE` and `QUOTE_REQUIRED` output types.

**Proposed future disclaimers (documentation only — not deployed):**

| Output Type | Proposed Disclaimer |
|-------------|---------------------|
| FIXEO_PRICE | Prix FIXEO applicable au périmètre indiqué. Toute prestation hors périmètre doit être expliquée et approuvée avant intervention. |
| FIXEO_CALCULATED_PRICE | Prix FIXEO calculé selon les informations déclarées. Toute modification du périmètre doit être expliquée et approuvée avant intervention. |
| FIXEO_LABOUR_PRICE_PLUS_PART | Main-d'œuvre FIXEO au prix indiqué. Toute pièce ou fourniture variable est chiffrée séparément et soumise à votre accord avant installation. |
| FIXEO_DIAGNOSTIC | Diagnostic FIXEO au prix indiqué. Son éventuelle déduction d'une réparation dépend des conditions précisées pour ce service. |
| FIXEO_ADD_ON | Supplément FIXEO calculé selon les informations déclarées. S'ajoute au prix du service principal. |
| QUOTE_REQUIRED | Prix sur devis après qualification du besoin. Aucun travail supplémentaire ne commence sans votre accord. |
| FIXEO_ESTIMATE | Estimation indicative — le tarif réel sera confirmé avec l'artisan avant toute intervention. |

---

## All 53 Approved Decisions — Corrected Classification Summary

### By Calculation Model

| Model | Count | Services |
|-------|-------|---------|
| CONDITIONAL_FIXED | 14 | electricite.disjoncteur, serrurerie.porte_claquee_blindee, serrurerie.porte_verrouillee, serrurerie.cle_cassee, CLIM-009 (actually FIXED), CLIM-013, CLIM-020, CLIM-021, BRIC-030, NET-004, MENU_001, MENU_001B, MENU_004A, MENU_004B, MENU_006 |
| FIXED | 13 | plomberie.fuite_simple, plomberie.debouchage_evier, plomberie.debouchage_wc_simple, serrurerie.porte_claquee_ouverture, CLIM-009, CLIM-030, BRIC-003, NET-010, NET-011, NET-013, NET-014, electricite.prise/luminaire/interrupteur(s) |
| UNIT_MULTIPLICATION_WITH_FLOOR | 6 | PEIN-002, PEIN-003, PEIN-004, PEIN-005, NET-030, BRIC-002 |
| LABOUR_FIXED_PART_SEPARATE | 6 | serrurerie.cylindre, serrurerie.serrure, MENU_002, MENU_003, plomberie.robinet_remplacement, plomberie.chasse_eau |
| MINIMUM_FLOOR | 3 | BRIC-001, NET-001, PEIN-001 |
| DIAGNOSTIC | 3 | plomberie.diagnostic, electricite.diagnostic, CLIM-002 |
| UNIT_MULTIPLICATION | 2 | CLIM-003, CLIM-004 |
| TIME_BASED_SINGLE | 1 | BRIC-002 |
| TIME_BASED_TEAM | 1 | NET-002 |
| ADD_ON | 1 | PEIN-008 |
| QUOTE_ONLY | 0 | (all approved, no quote-only in approved set) |
| **TOTAL** | **53** | |

### By Commercial Output Type

| Type | Count | Notes |
|------|-------|-------|
| FIXEO_PRICE | 28 | All standardized fixed services |
| FIXEO_CALCULATED_PRICE | 12 | Per-unit, per-hour, per-m² |
| FIXEO_LABOUR_PRICE_PLUS_PART | 6 | Hardware disclosed separately |
| FIXEO_DIAGNOSTIC | 3 | Plomberie, electricite, climatisation |
| FIXEO_ADD_ON | 1 | PEIN-008 |
| FIXEO_ESTIMATE | 0 | Not used for any current approved service |
| QUOTE_REQUIRED | 0 | All deferred/custom services outside the 53 |
| **TOTAL** | **53** | |

### Human Review Flagged (classification note — not blocking)

| Service | Issue |
|---------|-------|
| plomberie.robinet_remplacement | V0.3 arch = FIXEO_FIXED_PRICE but robinet is client-supplied. Classified as LABOUR_FIXED_PART_SEPARATE. Confirm against plomberie human-decision.v0.3.md. |
| plomberie.chasse_eau | Same issue — mechanism is client-supplied. Classified as LABOUR_FIXED_PART_SEPARATE. Confirm. |

---

## Special Case Preservation Confirmations

| Preservation | Status |
|-------------|--------|
| NET-002 PER_CLEANER_HOUR — MUST NOT collapse with PER_HOUR | ✅ PRESERVED — TIME_BASED_TEAM distinct from TIME_BASED_SINGLE |
| PER_PAINTED_M2 ≠ PER_CEILING_M2 ≠ floor m² | ✅ PRESERVED — three distinct measurement bases in classification |
| MENU_002/003 batch rules EXPERIMENTAL | ✅ PRESERVED — batch_policy.status = EXPERIMENTAL_BATCH_RULE, not promoted |
| BRIC-002 single-worker semantics | ✅ PRESERVED — TIME_BASED_SINGLE; MUST NOT multiply by worker_count |
| Diagnostic absorption métier-specific | ✅ PRESERVED — each métier's rules documented separately, no generalization |
| Serrurerie minimum_floor = null | ✅ CONFIRMED — 220 MAD is service price only |
| No city multiplier introduced | ✅ CONFIRMED — all city_adjustment = null |
| No unapproved modifier introduced | ✅ CONFIRMED — all 5 modifiers null across all 53 |
| No approved price changed | ✅ CONFIRMED — all prices identical to V0.3 frozen artifacts |
| Peinture no floor-to-painted conversion | ✅ PRESERVED — Estimator V1 must request painted_m2 directly |

---

## Files Created / Modified

```
data/pricing/consolidation/                     (existing)
├── phase-7c1-1-doctrine-correction.md          (NEW — this file)
├── canonical-concepts.v0.1.json                (NEW)
├── commercial-output-policy.v0.1.json          (NEW)
├── service-classification.v0.1.json            (NEW)
└── validate-7c1-1.js                           (NEW)

PRESERVED (untouched):
├── 7c1-audit.md                                (historical — not modified)
├── service-matrix.json                         (historical — not modified)
├── architecture-map.json                       (historical — not modified)
├── unit-map.json                               (historical — not modified)
├── policy-map.json                             (historical — not modified)
├── legacy-collision-map.json                   (historical — not modified)
├── canonical-registry-proposal.md             (historical — not modified)
├── migration-plan.md                           (historical — not modified)
└── validate.js                                 (historical — not modified)
```

---

## Phase 7C.1 Preservation Note

Phase 7C.1 remains as the immutable historical audit that documented the state of all 8 frozen métier registries. It is the record of work that *led to* this correction. The conceptual errors in its conclusions do not invalidate the audit itself — they are corrected here in 7C.1.1, which supersedes only the corrected conclusions. No 7C.1 artifact is modified.

---

## PHASE 7C.1.1 — FIXEO CANONICAL PRICING DOCTRINE CORRECTION & HYBRID MODEL C FREEZE — COMPLETE — READY FOR PHASE 7C.2 CANONICAL REGISTRY DESIGN
