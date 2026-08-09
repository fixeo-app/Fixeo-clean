# PHASE 7C.1 — FIXEO Canonical Pricing Consolidation Audit
## READ-ONLY AUDIT — No Production Implementation

**Date:** 2026-08-09  
**Repository HEAD at start:** `6b9ada3469bcf5dabadf856e789cac1aae674f53`  
**All 8 métier directories:** CONFIRMED PRESENT AND INTACT  
**Production runtime diff:** 0 (confirmed before and after this phase)

---

## Section 1 — Repository State

**Path:** `/home/work/fixeo-clean`  
**HEAD:** `6b9ada3469bcf5dabadf856e789cac1aae674f53`  
**Git status:** Clean (untracked files only — screenshots, backups, test files)  
**Production diff:** 0  

All 8 frozen V0.3 layers confirmed:
```
plomberie/registry.v0.3.json     ✅
electricite/registry.v0.3.json   ✅
serrurerie/registry.v0.3.json    ✅
climatisation/registry.v0.3.json ✅
bricolage/registry.v0.3.json     ✅
nettoyage/registry.v0.3.json     ✅
peinture/registry.v0.3.json      ✅
menuiserie/registry.v0.3.json    ✅
```

---

## Section 2 — Approved Service Counts

| Métier | Approved | Approved Variants | Deferred | Quote Required | Specialist/Deferred-Specialist |
|--------|----------|-------------------|---------|----------------|-------------------------------|
| Plomberie | 6 | 0 | 0 | 0 | 0 |
| Electricite | 5 (6 incl. sub-variants) | 1 (interrupteur.simple + .va_et_vient = 2 decisions, 1 service code) | 0 | 0 | 0 |
| Serrurerie | 6 | 0 | 1 (derrière-porte blindée custom) | 0 | 0 |
| Climatisation | 8 | 0 | 0 | 0 | 0 |
| Bricolage | 6 | 0 | 10 | 1 | 0 |
| Nettoyage | 9 | 0 | 5 | 0 | 0 |
| Peinture | 6 | 0 | 0 | 0 | 0 |
| Menuiserie | 7 | 1 (MENU_001B is variant of MENU_001) | 2 | 5 | 1 (MENU_012 aluminium) |
| **TOTAL** | **53** | **2** | **18** | **6** | **1** |

**Total distinct approved price decisions:** 53 (counting each sub-variant as its own decision)  
**Total standardized approved services (unique service codes):** 44 (service codes, not sub-variants)  
**Total deferred across all métiers:** 18  
**Total QUOTE_REQUIRED across all métiers:** 6 (minimum — each métier has many more implicitly via scope exclusions)

---

## Section 3 — Service Code Inconsistency Audit

**Current frozen code conventions:**

| Métier | Code Format | Example |
|--------|------------|---------|
| Plomberie | dot.notation | `plomberie.diagnostic` |
| Electricite | dot.notation | `electricite.prise_remplacement` |
| Serrurerie | dot.notation | `serrurerie.porte_claquee_ouverture` |
| Climatisation | ALPHA-NNN | `CLIM-002` |
| Bricolage | ALPHA-NNN | `BRIC-001` |
| Nettoyage | ALPHA-NNN | `NET-001` |
| Peinture | ALPHA-NNN | `PEIN-001` |
| Menuiserie | ALPHA_NNN | `MENU_001` (underscore, not dash) |

**Inconsistencies found:**
- 3 formats in use: dot.notation, ALPHA-NNN, ALPHA_NNN
- Climatisation, Bricolage, Nettoyage, Peinture use numeric IDs (CLIM-002 etc.)
- Menuiserie uses underscore separator vs dash in other numeric-code métiers
- Plomberie, Electricite, Serrurerie use descriptive dot-notation

**Proposed canonical:** Option B — descriptive dot-notation (see canonical-registry-proposal.md §5)

---

## Section 4 — Architecture Inventory

**19 distinct frozen architecture strings → 10 canonical**

See architecture-map.json for full mapping. Critical findings:

1. `FIXEO_FIXED_PRICE` (plomberie) = `FIXED` (all others) — **HIGH severity collision**
2. `FIXED_PER_AC_UNIT` (climatisation) — unit qualifier belongs in `pricing_unit`, not `architecture`
3. `MINIMUM_VISIT_PRICE / FORFAIT_MINIMUM / MINIMUM_PROJECT_FLOOR` — three strings, one concept: `MINIMUM_FLOOR`
4. `HOURLY` (bricolage, 1 worker) vs `PER_CLEANER_HOUR` (nettoyage, N workers) — **MUST NOT be collapsed** — different semantics
5. `PER_M2_WITH_MINIMUM` + `MINIMUM_PROJECT_FLOOR` — same pattern: `max(min, rate × m²)` = `VARIABLE_UNIT`
6. `LABOUR_ONLY_PER_PAINTED_M2 / ALL_IN_STANDARD_PER_PAINTED_M2 / ALL_IN_WITH_MINOR_PREP_PER_PAINTED_M2` — all `VARIABLE_UNIT`; distinction goes into `materials` field
7. `PREPARATION_ADD_ON_PER_PAINTED_M2` — unique `ADD_ON` architecture; standalone booking not possible

---

## Section 5 — Pricing Unit Inventory

**24 distinct frozen unit strings → 11 canonical**

See unit-map.json for full mapping. Critical findings:

1. `FLAT_INTERVENTION / par intervention / PER_INTERVENTION / UNIT_FLAT_INTERVENTION / FORFAIT_MINIMUM` — same concept
2. `PER_M2 (nettoyage) ≠ PER_PAINTED_M2 (peinture) ≠ PER_CEILING_M2 (peinture)` — **CRITICAL: MUST NOT collapse**
3. `PER_HOUR (bricolage) ≠ PER_CLEANER_HOUR (nettoyage)` — **CRITICAL: MUST NOT collapse**
4. `PER_SOFA_2_SEAT / PER_SOFA_3_SEAT / PER_MATTRESS_BOTH_FACES` → all `PER_ITEM` with `item_spec` field
5. Plomberie has no `pricing_unit` field in frozen V0.3 — must be inferred/backfilled from human-decision docs

---

## Section 6 — Price Value Model Requirements

Minimum canonical price_model shape needed (from all 8 métiers):

```json
{
  "type": "FIXED|CONDITIONAL_FIXED|VARIABLE_UNIT|TIME_BASED_SINGLE|TIME_BASED_TEAM|LABOUR_FIXED_PART_SEPARATE|MINIMUM_FLOOR|ADD_ON|DIAGNOSTIC_FIRST|QUOTE_REQUIRED",
  "currency": "MAD",
  "fixed_amount": null,
  "unit_rate": null,
  "unit": null,
  "min_amount": null,
  "formula_id": null,
  "formula_params": {}
}
```

Additional fields needed for specific métiers:
- `minimum_billing_hours` (bricolage hourly)
- `minimum_payable_MAD` (bricolage hourly)
- `worker_count_input` (nettoyage)
- `minimum_project_MAD` (peinture + nettoyage après-chantier)
- `measurement_basis` (peinture — floor_m2 vs painted_m2 vs ceiling_m2)
- `conversion_required` (peinture — floor to painted)
- `batch_increment` (menuiserie EXPERIMENTAL)
- `batch_scope` (menuiserie EXPERIMENTAL)
- `hardware_price_range` (serrurerie, menuiserie — reference for client disclosure)
- `diagnostic_fee` + `absorption_policy` (plomberie, electricite, climatisation)

---

## Section 7 — Minimum / Floor Semantics Audit

| Métier | Minimum | Visible? | Additive? | Formula | Architecture |
|--------|---------|---------|-----------|---------|-------------|
| Bricolage | 200 MAD | Standalone service BRIC-001 | **NOT ADDITIVE** | max(200, service_price) | MINIMUM_FLOOR |
| Nettoyage | 200 MAD | Embedded NET-001 | **NOT ADDITIVE** | max(200, calculated) | MINIMUM_FLOOR |
| Peinture | 800 MAD | PEIN-001 (policy anchor) | **NOT ADDITIVE** | max(800, rate×m²) | MINIMUM_FLOOR |
| Menuiserie | 300 MAD | Embedded — NOT standalone | **NOT ADDITIVE** | max(300, service_price) | MINIMUM_FLOOR (embedded) |
| Plomberie | 180 MAD (diag) | via diagnostic service | **ABSORBED** if repair follows | diag absorbed | DIAGNOSTIC_FIRST |
| Electricite | 200 MAD (diag) | via diagnostic service | **ABSORBED** if repair follows | diag absorbed | DIAGNOSTIC_FIRST |
| Climatisation | 250 MAD (diag) | via diagnostic service | **ABSORBED** if repair follows | diag absorbed | DIAGNOSTIC_FIRST |
| Serrurerie | 220 MAD (porte claquée) | Lowest approved service | Implicit — no explicit floor | N/A | Lowest service price is de facto floor |
| Bricolage | 150 MAD/h × 2h minimum | Embedded in BRIC-002 | **NOT ADDITIVE** with BRIC-001 | max(200, 150×h) | Minimum billing period |

**Universal canonical rule across all métiers:** `MINIMUM_IS_FLOOR_NOT_ADDITIVE`  
No exception found. All 8 métiers apply anti-additive rule consistently.

---

## Section 8 — Diagnostic Policy Comparison

| Métier | Diagnostic Exists? | Mode | Price | Absorption Rule |
|--------|------------------|------|-------|----------------|
| Plomberie | YES | STANDALONE_OR_ABSORBED | 180 MAD | Absorbed same-visit qualifying repair |
| Electricite | YES | STANDALONE_OR_ABSORBED | 200 MAD | D3: absorbed for standardized qualifying services |
| Climatisation | YES | STANDALONE_OR_ABSORBED | 250 MAD | Absorbed if CLIM-003/004/013 follows same visit |
| Serrurerie | NO | N/A | N/A | Assessment part of opening service |
| Bricolage | NO | N/A | N/A | Pre-screened via booking questions |
| Nettoyage | NO | N/A | N/A | Pre-screened via m² + property type |
| Peinture | NO | N/A | N/A | Pre-screened via m² + surface condition |
| Menuiserie | NO explicit diag | Implicit | 300 MAD minimum covers assessment | Minimum = assessment floor |

**Canonical fields needed:** `diagnostic_mode`, `diagnostic_price_MAD`, `diagnostic_absorption_rule`, `diagnostic_required_before_service`

---

## Section 9 — Materials / Hardware Policy Comparison

| Métier | Consumables | Parts / Hardware | Client Supplies | Equipment |
|--------|------------|-----------------|----------------|----------|
| Plomberie | Included (seals, tape) | >50 MAD separate or client-supplied | Robinet, chasse-eau mechanism | Artisan tools |
| Electricite | Connectors/wires ≤ 15 MAD included | Outlet/switch/MCB: client-supplied | Same | Artisan tools |
| Serrurerie | NA | Cylinder/lock: client-supplied OR artisan-disclosed | Both models valid | Artisan tools |
| Climatisation | Cleaning products included; gas included in CLIM-013 | AC unit: client-supplied | Yes | Artisan tools + vacuum |
| Bricolage | Standard fixings (8 screws/rawlplugs) included | Furniture, brackets, TVs: client-supplied | Yes | Artisan tools |
| Nettoyage | Products included in grand ménage/sofa/mattress; CLIENT supplies for ménage régulier | NA | Yes (for NET-002 régulier) | Artisan equipment (hoover, steam) |
| Peinture | Labour-only: paint client-supplied. All-in: paint included. | NA | Paint (for labour-only) | Artisan tools + scaffolding |
| Menuiserie | Basic consumables (screws, lubricant) included | Hinges, runners, rollers: SEPARATE, artisan-disclosed, client-approved | Door leaf for MENU_006 | Artisan tools |

**Canonical materials fields needed:**
- `consumables_policy` (enum: INCLUDED/CLIENT_SUPPLIED/PARTIAL_INCLUDED)
- `parts_policy` (enum: NA/CLIENT_SUPPLIED/ARTISAN_DISCLOSED_SEPARATE/ARTISAN_SUPPLIED_INCLUDED)
- `paint_policy` (peinture-specific: CLIENT_SUPPLIED/INCLUDED/ALL_IN)
- `equipment_policy` (ARTISAN_SUPPLIED implied for all — may not need explicit field)

---

## Section 10 — Batch Rule Comparison

| Métier | Batch Rule | Type | Status |
|--------|-----------|------|--------|
| Bricolage | BRIC-003 half-day optimal for 4+ tasks; BRIC-002 2h minimum billing | TIME_SCALING | APPROVED |
| Bricolage | Per-item: first item standard, additional items same visit at ~65% discount | UNIT_MULTIPLICATION_WITH_DISCOUNT | APPROVED (BRIC-010/020) |
| Nettoyage | NET-002 worker count × hours | TEAM_SCALING | APPROVED |
| Climatisation | Per-AC-unit: CLIM-003/004 scale linearly | UNIT_MULTIPLICATION | APPROVED |
| Menuiserie | +50 MAD per extra hinge same door/visit (MENU_002) | BATCH_INCREMENT | EXPERIMENTAL |
| Menuiserie | +100 MAD per extra drawer same cabinet/visit (MENU_003) | BATCH_INCREMENT | EXPERIMENTAL |
| All others | No batch rule | N/A | N/A |

**No universal batch percentage exists or should be created.**  
Batch rules are métier-specific and scope-limited.

---

## Section 11 — Worker-Count Semantics

Only nettoyage has explicit `worker_count` as an input.

| Métier | Worker Count | Notes |
|--------|-------------|-------|
| Nettoyage | EXPLICIT INPUT from client | NET-002: total = 65 × workers × hours. Workers ∈ {1,2,3}. |
| All others | 1 (implicit) | No worker-count input needed |

**Canonical fields:** `worker_count_required: boolean`, `worker_count_semantics: "SINGLE_IMPLICIT"|"EXPLICIT_TEAM"`, `team_multiplier_allowed: boolean`

**Warning:** Do NOT reuse nettoyage's team-multiplier logic in bricolage hourly pricing. Semantically different.

---

## Section 12 — Measurement / Input Requirements

| Service | Required Inputs | Optional | Derived | Quantity Input |
|---------|----------------|---------|---------|----------------|
| plomberie.fuite_simple | service_selection, access_description | photos | — | None |
| electricite.prise | service_selection, is_standard_outlet | photos | — | None |
| serrurerie.cylindre | service_selection, cylinder_type | — | — | count (1+) |
| climatisation.nettoyage | service_selection, ac_count, ac_capacity | — | — | ac_count |
| bricolage.hourly | service_selection, task_description, est_hours | photos | — | hours |
| bricolage.montage_meuble | service_selection, item_count, furniture_type | photos | — | item_count |
| nettoyage.ménage | service_selection, surface_m2, worker_count, hours | property_type | — | surface_m2, workers, hours |
| peinture.mur_labour | service_selection, painted_m2 OR floor_m2 | room_count | painted_m2 if floor input | painted_m2 |
| peinture.plafond | service_selection, ceiling_m2 | room_height | — | ceiling_m2 |
| menuiserie.reglage | service_selection, door_type, problem | photos | — | None (1 door) |
| menuiserie.charniere | service_selection, hinge_count, hinge_type, cabinet_count | photos | — | hinge_count |

**Critical hard-stop inputs (booking must block if negative):**
- Peinture: `surface_condition = STRUCTURAL_DAMAGE` → HORS PÉRIMÈTRE
- Electricite: `is_onee_equipment = true` → REDIRECT TO ONEE
- Serrurerie: `has_occupancy_proof = false` (ambiguous case) → AUTHORIZATION_CHECK
- Climatisation: `system_type = R32 AND artisan_not_r32_certified` → SPECIALIST
- Menuiserie: `is_security_door = true` → SERRURERIE

---

## Section 13 — Painted-Surface Conversion Status

**Status: RESEARCH_ESTIMATION_ONLY — do NOT use in production estimator V1 yet**

Frozen doctrine:
- Floor area (m²) ≠ Painted surface area (m²)
- Conversion required for wall services (PEIN-002/003/005)
- Ceiling m² measured directly (PEIN-004) — no conversion
- Current conversion model: unvalidated estimate (1.6-2.0× factor depending on room count, ceiling height)
- Conversion requires human approval before deployment

**Risk:** If estimator accepts floor_m2 input and applies unvalidated conversion, client may receive estimate with ±30% inaccuracy from actual painted surface.

**Recommendation:** Estimator V1 for peinture should ask for painted_m2 directly, with an explanatory tooltip ("La surface peinte inclut tous les murs — environ 3-4× la surface du sol"). Commission an expert validation of conversion factor before automated conversion is enabled.

---

## Section 14 — Conditional Eligibility Model

All CONDITIONAL_FIXED services have eligibility conditions. Currently stored as:
- Prose text in scope_inclusions / scope_exclusions arrays (all métiers)
- Some have structured arrays (menuiserie, serrurerie), some have prose strings (plomberie)

**Recommended canonical structure:**
```json
{
  "eligibility": {
    "conditions": [
      {"id": "E1", "field": "door_type", "value": ["bois", "MDF"], "comparison": "IN"},
      {"id": "E2", "field": "lock_mechanism_present", "value": false, "comparison": "EQUALS"}
    ],
    "hard_exclusions": [
      {"id": "X1", "trigger": "lock_cylinder_present", "route_to": "serrurerie", "type": "HARD"},
      {"id": "X2", "trigger": "frame_structural_damage", "route_to": "QUOTE", "type": "HARD"}
    ],
    "escape_policy_ref": "POL-HORS-PERIMETRE"
  }
}
```

This enables machine-readable pre-screening and estimator routing. Prose-only conditions cannot drive UX logic.

---

## Section 15 — HORS PÉRIMÈTRE Normalization

**Base workflow (identical across all 8 métiers):**
```
STOP → IDENTIFY → EXPLAIN → DECLARE_OUT_OF_SCOPE → QUOTE_OR_ROUTE → OBTAIN_APPROVAL → CONTINUE
```

**Métier-specific extra steps (confirmed):**
- **Electricite:** MAKE_SAFE (cut power) MUST precede all other steps — safety overrides workflow order
- **Serrurerie:** AUTHORIZATION_CHECK — verify occupancy right before any opening
- **Climatisation:** REFRIGERATION_INTEGRITY — if leak found, stop recharge

**Recommendation:** Canonical `escape_policy_ref` → `POL-HORS-PERIMETRE`. Each métier's extra steps added as `safety_pre_steps[]` — evaluated BEFORE the base workflow.

---

## Section 16 — Cross-Métier Routing Graph

| Source Métier | Trigger | Target | Type |
|--------------|---------|--------|------|
| Peinture | Humidity / water damage on wall | Plomberie | HARD |
| Peinture | Structural crack | Maçonnerie | HARD |
| Menuiserie | Lock/cylinder mechanism | Serrurerie | HARD |
| Menuiserie | Structural frame damage | Maçonnerie | HARD |
| Menuiserie | Paint/finish | Peinture | SOFT |
| Menuiserie | Glass/mirror panel | Vitrerie (external) | HARD |
| Menuiserie | Aluminium fabrication | Deferred specialist | HARD |
| Bricolage | Electrical modification | Electricite | HARD |
| Bricolage | Plumbing work | Plomberie | HARD |
| Bricolage | Lock mechanism | Serrurerie | HARD |
| Climatisation | Electrical panel work | Electricite | HARD |
| Climatisation | R32 specialist needed | External R32 specialist | HARD |
| Serrurerie | Structural door damage | Menuiserie/Maçonnerie | SOFT |
| Nettoyage | Broken glass found | Vitrerie (external) | HARD |
| Nettoyage | Biohazard/mold | External specialist | HARD |
| Electricite | ONEE limiteur de puissance | ONEE 0801 00 20 20 | HARD |
| All | Work requiring permis | External licensed contractor | HARD |

**Missing route:** Menuiserie → Serrurerie is documented. Serrurerie → Menuiserie (door frame damage after opening) is NOT explicitly documented in serrurerie frozen artifacts. Flag for human review.

---

## Section 17 — Safety / Authorization Layers

| Policy | Applies To | Canonical ID |
|--------|-----------|-------------|
| Electrical MAKE_SAFE | Electricite | POL-ELECTRICAL-SAFETY |
| Occupancy authorization | Serrurerie | POL-SERRURERIE-AUTHORIZATION |
| Refrigeration integrity (no blind top-up) | Climatisation | POL-REFRIGERATION-INTEGRITY |
| Painted surface (active moisture = stop) | Peinture | POL-PAINTED-SURFACE-CONVERSION |
| No specialty contamination (mold, biohazard) | Nettoyage | (implicit — explicit policy needed) |

**Gap:** Nettoyage does not have an explicit safety policy for biohazard / severe mold. Recommend adding `POL-NETTOYAGE-BIOHAZARD` in next review cycle.

---

## Section 18 — Provenance Normalization

**Current strings in use:**
- `FIXEO_HUMAN_CALIBRATED_PILOT` (all approved services)
- `FIXEO_HUMAN_CALIBRATED_PILOT_BATCH_RULE` (menuiserie EXPERIMENTAL batch rules)
- `LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION` (all approved maturity)
- `T0_INTERNAL_LEGACY` (legacy FIXEO values in comparison docs — not in V0.3)

**Proposed canonical provenance model:**
```json
{
  "provenance": {
    "source_type": "EXTERNAL_RESEARCH_HUMAN_CALIBRATED",
    "research_level": "LEVEL_0",
    "human_approved": true,
    "transaction_backed": false,
    "production_ready": false,
    "confidence": "MEDIUM|LOW|HIGH|INSUFFICIENT",
    "research_phase": "7B.3.3",
    "research_commit": "de55eba",
    "approved_date": "2026-08-09",
    "batch_rule_experimental": false
  }
}
```

**Current batch rule distinction:** `FIXEO_HUMAN_CALIBRATED_PILOT_BATCH_RULE` appropriately signals "experimental" status. Preserve this semantic in canonical model via `batch_rule_experimental: true` flag.

---

## Section 19 — Confidence Normalization

**Current values:** HIGH / MEDIUM / LOW / INSUFFICIENT  
**Applied to:** service price evidence

**Proposed canonical:** Confidence should attach to:
- `price_confidence` — confidence in the price anchor itself
- `architecture_confidence` — confidence that architecture is correct
- `evidence_confidence` — confidence in the external evidence base

Currently all frozen artifacts attach confidence only to the service-level price. This is sufficient for Level 0. For Level 1 (transaction-backed), confidence should be upgraded per service based on actual transaction data.

**Retain current enum:** HIGH / MEDIUM / LOW / INSUFFICIENT — sufficient and consistent.

---

## Section 20 — Human Decision / Status Normalization

**Current mixing of concerns:**

| String | Appears in | Actual concept |
|--------|-----------|---------------|
| APPROVED | human_decision | Decision state |
| DEFERRED | human_decision | Decision state |
| PENDING | human_decision (some V0.2) | Decision state |
| QUOTE_REQUIRED | human_decision | Availability state (not a human decision) |
| DEFERRED_SPECIALIST | architecture (some) | Availability state |

**Proposed separation:**

```json
{
  "status": {
    "human_decision": "APPROVED|DEFERRED|REJECTED|PENDING",
    "availability": "STANDARDIZED|QUOTE_REQUIRED|SPECIALIST|UNAVAILABLE",
    "production_ready": false
  }
}
```

`QUOTE_REQUIRED` belongs in `availability`, not `human_decision`. The human's decision was to route it to quote — that's a routing decision, not a price decision.

---

## Section 21 — Disclaimer Audit

**Frozen disclaimer string (consistent across all 8 métiers):**
> *Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.*

**Status in frozen artifacts:** DOCUMENTED_ONLY — not deployed to any production surface.

**Active production disclaimers:** None found in active JS. Some marketing copy says "À partir de X MAD" which implies indicative.

**Critical contradiction (CONT-06):** Frozen artifacts simultaneously assert:
- Human-approved fixed prices (e.g. 500 MAD for door installation — not a range)
- Disclaimer "prix indicatif" + "tarif réel confirmé avec l'artisan"

**This contradiction must be resolved before any client-facing deployment.**

**Options for human decision:**
- **A:** All prices remain indicative — artisan sets actual price. Current disclaimer correct. Simple, safe, lower trust.
- **B:** FIXEO guarantees the price for eligible services. "Prix standard FIXEO de X MAD garanti pour les interventions éligibles." Higher trust, requires artisan contract enforcement.
- **C (RECOMMENDED):** Hybrid. For eligible standardized services: "Ce service est au prix fixe FIXEO de X MAD si les conditions d'éligibilité sont satisfaites." For uncertain/custom: "Estimation indicative — devis artisan requis." For QUOTE: "Sur devis artisan."

Option C is most honest, most consistent with frozen doctrine (eligibility-gated fixed prices are already the pattern), and requires the least policy change.

---

## Section 22 — City Policy Audit

**Canonical frozen doctrine:** `city_adjustment = null` across all 8 métiers.

**Legacy production city data:**
- `fixeo-pricing-marocain.js`: no city multipliers (category-level ranges only)
- `generate-lps.js`: Casablanca-specific plomberie prices (hardcoded, not multiplier)
- `fixeo-estimation-engine-v1.js`: no city filtering
- Artisan Supabase records: city field present but no price-by-city calculation

**Migration risk:** LOW for runtime. MEDIUM for pSEO (lps.js has city-specific pricing that contradicts null city_adjustment doctrine).

**Recommendation:** LPS-generated pages should use canonical national prices, not city-specific overrides, until city adjustment research reaches Level 1 (transaction-backed).

---

## Section 23 — Urgency / Time Modifier Audit

**Canonical frozen doctrine:** All five modifiers null across all 8 métiers.

**Legacy conflicts:**
- `fixeo-estimation-engine-v1.js`: "urgent" is a 4th complexity tier (not a time modifier) — semantic collision
- `reservation.js`: urgency labels in service names ("Urgence plomberie: 200-500 MAD")

**Migration risk:** MEDIUM. Legacy urgency must be retired as a pricing concept in the canonical system. Urgency can remain as a booking attribute (availability, response time) but MUST NOT affect canonical service price.

---

## Section 24 — Active Legacy Pricing Collision Map

See `legacy-collision-map.json` for full detail.

**Summary:**

| Risk | Source | Canonical | Status |
|------|--------|-----------|--------|
| Electricite floor 100 MAD | LEGACY-01 | 200 MAD | P0 |
| Menuiserie floor 150 MAD | LEGACY-01 | 300 MAD | P0 |
| Peinture per-room vs per-m² | LEGACY-04 vs LEGACY-05 | per m² | P0 |
| Bricolage floor 100 MAD | LEGACY-01 | 200 MAD | P1 |
| Serrurerie floor 150 MAD | LEGACY-01 | 220 MAD | P1 |
| Urgency as pricing tier | LEGACY-02 | null modifier | P1 |
| pSEO plomberie "300-600 MAD simple" | LEGACY-08 | 250 MAD for fuite simple | P1 |

---

## Section 25 — Proposed Canonical Registry Architecture

See `canonical-registry-proposal.md` for full schema.

**Top-level structure:**
```
meta → schema version, registry version, effective date, total services
policies → POL-* entries (13 currently identified)
services → canonical service array (44 services, 53 decisions)
formula_definitions → 10 formula types with params
service_code_mapping → frozen codes → canonical codes
versioning → governance rules
```

---

## Section 26 — Proposed Policy Registry

13 policies identified. Services reference by `policy_id`. Key policies:
- POL-ANTI-DOUBLE-CHARGE
- POL-HORS-PERIMETRE (+ métier safety pre-steps)
- POL-HARDWARE-DISCLOSURE
- POL-DIAGNOSTIC-ABSORPTION
- POL-ELECTRICAL-SAFETY
- POL-REFRIGERATION-INTEGRITY
- POL-SERRURERIE-AUTHORIZATION
- POL-PAINTED-SURFACE-CONVERSION
- POL-CLEANER-HOUR-TEAM
- POL-FIXEO-DUAL-FAIRNESS
- POL-CITY-NULL
- POL-MODIFIERS-NULL
- POL-DISCLAIMER (pending CONT-06 resolution)

---

## Section 27 — Formula Engine Requirements

10 formula types. See canonical-registry-proposal.md §6.

Most complex: `WORKER_HOUR` (nettoyage only), `MAX_OF_MIN_OR_UNIT` (peinture + nettoyage), `DIAGNOSTIC_ABSORPTION` (3 métiers), `BATCH_INCREMENT` (menuiserie experimental).

---

## Section 28 — Estimator User-Input Ontology

**Common inputs (all métiers):**
```
service_selection: enum
city_slug: string (optional — no price effect)
property_type: residential|commercial|other
access_description: text|enum
photos_attached: boolean
```

**Métier-specific:**
```
surface_m2: float (nettoyage, peinture)
painted_m2: float (peinture wall services)
ceiling_m2: float (peinture plafond)
worker_count: int 1-5 (nettoyage only)
duration_hours: float 1-8 (bricolage, nettoyage)
ac_count: int 1-10 (climatisation)
ac_capacity_btu: enum 9000|12000|18000|24000 (climatisation)
item_count: int (bricolage, serrurerie)
item_type: enum (bricolage)
hinge_count: int (menuiserie)
hinge_type: standard|soft_close (menuiserie)
drawer_count: int (menuiserie)
runner_type: standard|soft_close (menuiserie)
door_dimension_width_cm: int (menuiserie MENU_006)
client_supplies_part: boolean (multiple métiers)
surface_condition: normal|damaged|structural (peinture hard-stop)
panel_count: int 1|2+ (menuiserie)
lock_type: simple|blindée (serrurerie)
switch_type: simple|va_et_vient (electricite)
```

**Hard-stop inputs (booking must block):**
```
is_security_door → menuiserie → SERRURERIE
is_onee_equipment → electricite → ONEE redirect
surface_condition = STRUCTURAL → peinture → STOP
has_occupancy_proof = false (ambiguous) → serrurerie → AUTH CHECK
refrigerant_type = R32 AND artisan_not_r32_certified → climatisation → SPECIALIST
```

---

## Section 29 — Estimator Output Types

| Output Type | Description | Services |
|-------------|-------------|---------|
| FIXED_PRICE | One price, no inputs beyond eligibility | plomberie.*, serrurerie.porte_*, clim.*, many others |
| FIXED_LABOUR_PLUS_PART | Labour fixed; hardware disclosed separately | serrurerie.cylindre, menuiserie.charniere, electricite.prise |
| UNIT_RATE | price = rate × quantity | peinture, nettoyage.apres_chantier, clim cleaning, bricolage items |
| WORKER_HOUR_RATE | price = rate × workers × hours | nettoyage.ménage_régulier (NET-002) |
| ESTIMATED_RANGE | Not a fixed price — range based on complexity/m² | peinture (with conversion uncertainty), nettoyage m² |
| DIAGNOSTIC_PRICE | Standalone diagnostic fee | plomberie.diag, electricite.diag, clim.diag |
| QUOTE_REQUIRED | No standardized price | Custom fabrication, complex cases |
| OUT_OF_SCOPE | Service not in FIXEO scope | Distributor electrical, biohazard cleaning, aluminium |
| SPECIALIST_ROUTE | Needs different specialist | ONEE, R32 certified, aluminium specialist |

---

## Section 30 — Transaction Learning Schema

See canonical-registry-proposal.md §10 for SQL proposal.

Missing today from Supabase: `service_sub_code`, `final_price_DH`, `fixed_price_applied`, `parts_cost_DH`, `labour_duration_min`, `scope_changed`, `out_of_scope_trigger`.

---

## Section 31 — Migration Order

See migration-plan.md for full sequence.

**Summary:**
1. Stage 0: Human decisions (disclaimer, code convention, peinture conversion)
2. Stage 1: Build canonical registry (offline)
3. Stage 2: Shadow engine (offline validation)
4. Stage 3: Estimator V1 UI (new surface)
5. Stage 4: Homepage migration
6. Stage 5: Reservation migration (resolve CONT-01 first)
7. Stage 6: Profile pages
8. Stage 7: pSEO regeneration
9. Stage 8: Retire legacy files

---

## Audit Files Created

```
data/pricing/consolidation/
├── 7c1-audit.md                    (this file)
├── service-matrix.json             (44 services normalized)
├── architecture-map.json           (19→10 architecture normalization)
├── unit-map.json                   (24→11 unit normalization)
├── policy-map.json                 (13 canonical policies)
├── legacy-collision-map.json       (8 legacy sources, 6 active contradictions)
├── canonical-registry-proposal.md  (top-level architecture proposal)
├── migration-plan.md               (8-stage migration + risk register)
└── validate.js                     (automated audit validation)
```

**NOT created:** `canonical-registry.v1.json` — per phase spec, do not create in this phase.
