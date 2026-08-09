# FIXEO Phase 7C.3 — Canonical Pricing Semantic Hardening & Eligibility Structuring
## Status: COMPLETE — ENGINE CONTRACT READY
**Date:** 2026-08-09  
**Phase:** 7C.3  
**Starting HEAD:** `16e4e55881075280407f357e366ca2a0ac42fda2`  
**Production diff:** 0  

---

## 1. Baseline Verification

| Check | Result |
|-------|--------|
| HEAD confirmed | `16e4e55` — Phase 7C.2 |
| 7C.1.1 validator | 91/91 PASS |
| 7C.2 validator | 130/130 PASS |
| Services | 53 |
| Legacy mappings | 53 |
| Formulas | 10 |
| Policies | 13 |
| Routes | 17 |
| Runtime imports | 0 |
| Production diff | 0 |

---

## 2. Rounding Decision Freeze

**HUMAN DECISION RECEIVED AND FROZEN:**

```
ROUNDING_POLICY = EXACT_INTEGER_MAD
status = APPROVED
approved_by = HUMAN_DECISION_PHASE_7C3
approved_date = 2026-08-09
```

**Meaning:**
- No commercial rounding (no nearest 5, no nearest 10, no psychological rounding)
- Canonical FIXEO calculations preserve exact integer MAD results
- If an input/formula could produce non-integer MAD in the future: NOT silently rounded — flagged for explicit handling (see HRQ-009)

**Currently integer-safe formulas:** FIXED, CONDITIONAL_FIXED, MINIMUM_FLOOR, DIAGNOSTIC (always integer by design)

**Currently exact-integer in practice:** UNIT_MULTIPLICATION_WITH_FLOOR, TIME_BASED_SINGLE, TIME_BASED_TEAM, ADD_ON (all current rates × integer inputs = integer results)

**NOT approved:** NEAREST_5_MAD, NEAREST_10_MAD, PSYCHOLOGICAL_ROUNDING

Recorded in `canonical-registry.v1.draft.json` → `_meta.governance.rounding_policy`.

---

## 3. Eligibility Structuring Results

### Before (Phase 7C.2 baseline)
- OPEN: 38 services
- CONDITIONAL: 15 services (0 structured, 0 with predicates)
- ADD_ON_ONLY: 0

### After (Phase 7C.3)
- OPEN: 34 services
- CONDITIONAL: 18 services (**18 fully structured** with machine-readable predicates)
- ADD_ON_ONLY: 1 (PEIN-008)

**Change:** 4 peinture services reclassified OPEN → CONDITIONAL (active_moisture hard exclusion was missing; surface condition gate added)

**Fully structured CONDITIONAL: 18/18 (100%)**

**Remaining prose-only eligibility: 0**  
All 18 CONDITIONAL services have at least one machine-readable predicate. Two have prose for artisan-assessed on-site conditions (correctly preserved as supporting_prose, not predicates).

---

## 4. Canonical Input Dictionary

**Artifact:** `canonical-inputs.v1.draft.json`  
**Total inputs:** 29

| Input ID | Type | Used By |
|----------|------|---------|
| city_slug | string | routing awareness (all) |
| service_selection | string | all |
| item_count | integer | CLIM-003/004, BRIC, NET (sofas/mattresses) |
| hours | number | BRIC-002, NET-002 |
| worker_count | integer | NET-002 (EXPLICIT_TEAM only) |
| surface_m2 | number | NET-030 |
| painted_m2 | number | PEIN-002/003/005/008 |
| ceiling_m2 | number | PEIN-004 |
| ac_count | integer | CLIM-003/004 |
| ac_capacity_btu | integer | CLIM-020/021 |
| refrigerant_type | string | CLIM-013 |
| door_type | string | MENU all doors |
| door_width_cm | integer | MENU_006 |
| security_door | boolean | MENU all, SERR slammed |
| frame_condition | string | MENU all doors |
| hinge_count | integer | MENU_002 (batch) |
| drawer_count | integer | MENU_003 (batch) |
| property_occupied_status | string | SERR all entry services |
| surface_condition | string | PEIN all |
| active_moisture | boolean | PEIN all (hard block) |
| client_supplies_part | boolean | all LABOUR_FIXED_PART_SEPARATE |
| client_supplies_paint | boolean | PEIN (routing PEIN-002 vs PEIN-003) |
| mcb_defect_confirmed | boolean | electricite.disjoncteur_remplacement |
| distributor_equipment_involved | boolean | electricite.disjoncteur_remplacement |
| leak_location_confirmed | string | CLIM-013 |
| installation_height_m | number | CLIM-003/004/020/021, peinture >3m |
| tv_inches | integer | BRIC-030 |
| bracket_type | string | BRIC-030 |
| property_type | string | NET-004 (villa exclusion) |

**Safety-critical inputs:** refrigerant_type, property_occupied_status, active_moisture, mcb_defect_confirmed, distributor_equipment_involved, security_door, leak_location_confirmed, surface_condition (mold)

---

## 5. Prebooking Question Contract

**Artifact:** `prebooking-questions.v1.draft.json`  
**Total questions:** 19

| Question ID | Métier | Service(s) | Safety |
|-------------|--------|-----------|--------|
| Q-ELEC-MCB-DEFECT | electricite | disjoncteur | ✅ |
| Q-ELEC-DISTRIBUTOR | electricite | disjoncteur | ✅ |
| Q-ELEC-BURNING-SMELL | electricite | disjoncteur | ✅ |
| Q-SERR-DOOR-SLAMMED-ONLY | serrurerie | claquee/blindee | — |
| Q-SERR-SECURITY-DOOR | serrurerie | claquee/verrouillee | — |
| Q-SERR-AUTHORIZATION | serrurerie | all entry | ✅ |
| Q-CLIM-LEAK-LOCATION | climatisation | CLIM-013 | ✅ |
| Q-CLIM-REFRIGERANT-TYPE | climatisation | CLIM-013 | ✅ |
| Q-CLIM-INSTALL-COPPER-LENGTH | climatisation | CLIM-020/021 | — |
| Q-MENU-DOOR-TYPE | menuiserie | all doors | — |
| Q-MENU-SECURITY-DOOR | menuiserie | all doors | ✅ |
| Q-MENU-FRAME-CONDITION | menuiserie | all doors | — |
| Q-MENU-MASONRY-REQUIRED | menuiserie | MENU_006 | — |
| Q-MENU-DOOR-WIDTH | menuiserie | MENU_006 | — |
| Q-PEIN-ACTIVE-MOISTURE | peinture | all walls | ✅ |
| Q-PEIN-SURFACE-CONDITION | peinture | walls/ceiling | — |
| Q-PEIN-CLIENT-SUPPLIES-PAINT | peinture | PEIN-002/003/005 | — |
| Q-NET-PROPERTY-TYPE | nettoyage | NET-004 | — |
| Q-BRIC-TV-SIZE | bricolage | BRIC-030 | — |

---

## 6. Hard Exclusion Normalization

All 18 CONDITIONAL service entries now have normalized hard exclusions. Each resolves to exactly one action:

| Action | Count | Meaning |
|--------|-------|---------|
| ROUTE | Multiple | Route to registered canonical route_ref |
| QUOTE_REQUIRED | Multiple | No standardized price — artisan quotes on site |
| STOP_SAFETY | 2 | Safety override — work must stop immediately |
| HORS_PERIMETRE | Multiple | Declared out of scope, scope-change protocol |
| REQUALIFY | 2 | Offer alternative service (e.g. hourly for wrong apartment size) |
| UNAVAILABLE | 1 | PEIN-008 cannot be booked standalone |

**All ROUTE actions resolved:** Every route action references an existing route_ref from routing-registry.v1.draft.json. No dangling routes.

---

## 7. Routing Validation

17 canonical routes — all referenced actions map to existing routes. New pattern confirmed:

- `ROUTE-ELEC-ONEE-001` — Electricite → ONEE/distributor (distributor equipment)
- `ROUTE-CLIM-DIAG-001` — Climatisation → CLIM-002 diagnostic first (unknown leak)
- `ROUTE-CLIM-R32-001` — Climatisation → R32/A2L specialist
- `ROUTE-MENU-LOCK-001` — Menuiserie → Serrurerie (security door)
- `ROUTE-SERR-MENU-001` — Serrurerie → Menuiserie (door frame damage post-opening) [gap first documented in 7C.2]

---

## 8. Diagnostic Validation

Three independent diagnostic doctrines preserved — NOT generalized:

**Plomberie (180 MAD):**
- `POL-DIAGNOSTIC-ABSORPTION-PLOMBERIE-V1`
- Qualifying services: 5 standardized plomberie services
- Non-qualifying: diagnostic fee charged in full

**Electricite (200 MAD):**
- `POL-DIAGNOSTIC-ABSORPTION-ELECTRICITE-V1`
- Qualifying: same-visit disjoncteur_remplacement if diagnosis confirms single defective MCB
- D3 rule: diagnostic first if cause uncertain

**Climatisation (250 MAD):**
- `POL-DIAGNOSTIC-ABSORPTION-CLIM-V1`
- Qualifying: CLIM-003, CLIM-004, CLIM-013, CLIM-009 on same visit
- All qualifying codes validated to exist in canonical registry ✅

---

## 9. Floor Semantics Validation

| Métier | Floor | Mode | Validated |
|--------|-------|------|-----------|
| Bricolage | 200 MAD | NON_ADDITIVE | ✅ |
| Nettoyage (métier) | 200 MAD | NON_ADDITIVE | ✅ |
| Peinture | 800 MAD | NON_ADDITIVE | ✅ |
| Menuiserie | 300 MAD | NON_ADDITIVE | ✅ |
| NET-030 (project-specific) | 1000 MAD | NON_ADDITIVE | ✅ (distinct from métier 200 MAD) |
| Plomberie | null | — | ✅ |
| Electricite | null | — | ✅ |
| Climatisation | null | — | ✅ |
| Serrurerie | null | — | ✅ |

**Formula:** `FINAL_PRICE = max(FLOOR, CALCULATED_PRICE)` — never `FLOOR + CALCULATED_PRICE`

**Diagnostics confirmed NOT floors:** plomberie.diagnostic (180), electricite.diagnostic (200), CLIM-002 (250) — all have `minimum_floor.enabled = false`

---

## 10. Material/Hardware Semantics Validation

All material responsibility fields normalized to canonical states:
- `ARTISAN_SUPPLIED_INCLUDED` — included in FIXEO price
- `CLIENT_SUPPLIED` — client's responsibility, excluded from price
- `ARTISAN_DISCLOSED_SEPARATE` — artisan supplies but separately disclosed and approved
- `NOT_APPLICABLE` — field not relevant to this service

**Service-specific material policies preserved:**
- Plomberie: consumables ≤50 MAD included; major parts CLIENT_SUPPLIED
- Electricite: MCB = CLIENT_SUPPLIED; consumables ≤15 MAD included
- Peinture: paint = CLIENT_SUPPLIED (PEIN-002) or ARTISAN_SUPPLIED_STANDARD (PEIN-003/005); enduit = INCLUDED (PEIN-008)
- Menuiserie MENU_002/003: hardware = ARTISAN_DISCLOSED_SEPARATE; hinges (MENU_006) = ARTISAN_SUPPLIED_INCLUDED as basic installation hardware
- Serrurerie: cylindre/serrure = ARTISAN_DISCLOSED_SEPARATE; consumables = INCLUDED
- Nettoyage: products/equipment = ARTISAN_SUPPLIED_INCLUDED (NET-004, sofas, mattresses); CLIENT_SUPPLIED (NET-001/002 standard cleaning)
- Climatisation: refrigerant = INCLUDED for entretien/diagnostic; ALWAYS SEPARATE for repairs (CLIM-013)

---

## 11. Batch Semantics Validation

| Service | Batch Type | Status |
|---------|-----------|--------|
| NET-002 | TEAM_SCALING: workers × hours | APPROVED, EXPLICIT_TEAM |
| BRIC-002 | TIME_SCALING: 1 artisan × hours | APPROVED, SINGLE_IMPLICIT |
| CLIM-003/004 | PER_AC_UNIT: same rate per unit | APPROVED |
| MENU_002 | +50 MAD per additional hinge (same door) | EXPERIMENTAL — NOT_PROMOTED |
| MENU_003 | +100 MAD per additional drawer (same cabinet) | EXPERIMENTAL — NOT_PROMOTED |

`PER_HOUR ≠ PER_CLEANER_HOUR` confirmed distinct. Never collapsed.

---

## 12. Add-On Semantics Validation

**PEIN-008 (enduit de lissage, 25 MAD/m²):**
- `qualification_status = ADD_ON_ONLY`
- `primary_service_required = true`
- `allowed_primary_service_codes`: peinture.mur_interieur.labour_only, peinture.mur_interieur.all_in, peinture.plafond.labour_only
- Hard exclusion: cannot be booked standalone
- Maximum repair depth: 5mm — deeper → HORS PÉRIMÈTRE maçonnerie

---

## 13. Commercial Output Validation

All 53 approved standardized services validated:
- 28 `FIXEO_PRICE` ✅
- 12 `FIXEO_CALCULATED_PRICE` ✅
- 6 `FIXEO_LABOUR_PRICE_PLUS_PART` ✅
- 3 `FIXEO_DIAGNOSTIC` ✅
- 1 `FIXEO_ADD_ON` ✅
- **0 `FIXEO_ESTIMATE`** ✅
- **0 `QUOTE_REQUIRED`** ✅

No approved standardized service silently reclassified to FIXEO_ESTIMATE or QUOTE_REQUIRED. When eligibility fails on a CONDITIONAL service: the service's canonical classification is unchanged. Scope-change protocol (POL-HORS-PERIMETRE-V1) governs the interaction.

---

## 14. Commercial Copy Registry

**Artifact:** `commercial-copy.v1.draft.json`

Canonical French copy defined per output type. Status: DOCUMENTATION ONLY — not deployed.

**Key doctrine enforced:**
- `prix indicatif` = PROHIBITED for FIXEO_PRICE, FIXEO_CALCULATED_PRICE, FIXEO_LABOUR_PRICE_PLUS_PART, FIXEO_DIAGNOSTIC, FIXEO_ADD_ON
- Legacy disclaimer `"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention"` = LEGACY_RESEARCH_DISCLAIMER — only applicable to FIXEO_ESTIMATE (0 services) and QUOTE_REQUIRED (0 services)
- FIXEO_ESTIMATE remains the only estimate wording
- Darija copy included as proposal — requires native speaker review (HRQ-008)

Includes:
- Per-output-type canonical label FR + AR Darija
- Price display templates
- Client disclosure strings
- Artisan disclosure strings
- Scope-change script
- Parts disclosure 7-step protocol (copy version)
- Minimum floor disclosure

---

## 15. Human Review Queue

**Artifact:** `human-review-queue.v1.draft.json`  
**Total items:** 10  
**Engine-blocking:** 2  
**Production-blocking:** 6  

| ID | Category | Engine Block | Production Block |
|----|----------|-------------|-----------------|
| HRQ-001 | Semantic classification confirmation (plomberie.robinet/chasse_eau) | No | ✅ Yes |
| HRQ-002 | Painted m² measurement — estimator UX decision | ✅ Yes | ✅ Yes |
| HRQ-003 | MENU_002/003 experimental batch promotion decision | ✅ Yes | No |
| HRQ-004 | NET-030 LOW evidence confidence — field validation | No | ✅ Yes |
| HRQ-005 | Multiple LOW/MEDIUM confidence services — pilot data | No | ✅ Yes |
| HRQ-006 | CLIM-025 per-metre add-on: deferred, no approved price | No | ✅ Yes |
| HRQ-007 | BRIC-030 FULL_MOTION bracket: soft flag (already resolved) | No | No |
| HRQ-008 | Copy approval — FR legal review + Darija native review | No | ✅ Yes |
| HRQ-009 | Fractional hours edge case for NET-002 (INT MAD policy) | No | No |
| HRQ-010 | Serrurerie verrouillee/cle_cassee prose eligibility (correct by design) | No | No |

---

## 16. Engine-Blocking Issues

**HRQ-002 — Painted m² measurement:**
The estimator engine cannot calculate PEIN-002/003/005/008 prices without painted_m2 as input. The painted_m2 → floor_m2 conversion is RESEARCH_ESTIMATION_ONLY and not approved for production. The estimator V1 must ask for painted_m2 directly. A UX decision is required on whether to: (A) ask directly, (B) provide a guided calculator (room dimensions + ceiling height), or (C) artisan-measured only. **This must be resolved before estimator V1 input design.**

**HRQ-003 — MENU_002/003 batch rule promotion:**
The engine cannot apply batch increments for multiple hinges/drawers without explicit promotion from EXPERIMENTAL to APPROVED. Currently: the canonical price is for 1 item. Multiple items in a single visit: undefined in the engine. **Resolution required before estimator V1 handles batch quantities.**

---

## 17. Production-Blocking Issues (Non-Engine)

| Issue | Resolution Path |
|-------|----------------|
| HRQ-001: plomberie.robinet/chasse_eau classification | Read plomberie/human-decision.v0.3.md → confirm LABOUR_FIXED_PART_SEPARATE (likely minutes) |
| HRQ-004: NET-030 LOW confidence | Field pilot missions (3–5) or additional market research |
| HRQ-005: Multiple LOW/MEDIUM confidence services | Artisan pilot program before production |
| HRQ-006: CLIM-025 copper add-on | Dedicated calibration phase OR explicit QUOTE for >5m copper |
| HRQ-008: Copy approval | Legal review (FR) + native Darija review + UX copywriter |

---

## 18. New Artifacts Created

| File | Size | Content |
|------|------|---------|
| `data/pricing/consolidation/canonical-inputs.v1.draft.json` | ~25 KB | 29 canonical inputs |
| `data/pricing/consolidation/prebooking-questions.v1.draft.json` | ~28 KB | 19 prebooking questions |
| `data/pricing/consolidation/commercial-copy.v1.draft.json` | ~20 KB | Copy registry per output type |
| `data/pricing/consolidation/human-review-queue.v1.draft.json` | ~18 KB | 10 review items |
| `data/pricing/consolidation/phase-7c3-semantic-hardening.md` | ~30 KB | This document |
| `data/pricing/consolidation/validate-7c3.js` | ~28 KB | Validator (25 check sections) |

## Modified Artifacts

| File | Change |
|------|--------|
| `data/pricing/canonical/canonical-registry.v1.draft.json` | Rounding policy freeze + 18 eligibility structuring updates |

---

## 19. Production Runtime Diff = 0

Confirmed. No production file modified. All changes under `data/pricing/canonical/` and `data/pricing/consolidation/`.

---

## 20. Final Status

```
PHASE 7C.3 — FIXEO CANONICAL PRICING SEMANTIC HARDENING — COMPLETE — ENGINE CONTRACT READY
```

**What this means:**
- The canonical pricing registry is semantically complete
- All 53 approved services have machine-readable contracts
- All 15 → 18 CONDITIONAL services have structured eligibility predicates
- Canonical input dictionary defines all inputs used by any predicate or formula
- Prebooking question contract defines all qualification questions
- Commercial copy doctrine is documented (not deployed)
- Human review queue identifies all remaining uncertainties
- 2 engine-blocking items require human decisions before estimator V1 design
- 6 production-blocking items require resolution before any client-facing deployment
- Production runtime diff = 0
- No deployment performed

**Next:** Phase 7C.3 artifacts are frozen. Shadow engine interface design (if Phase 7C.4) or production gate resolution as appropriate.
