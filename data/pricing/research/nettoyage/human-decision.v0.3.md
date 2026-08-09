# NETTOYAGE — Human Price Decision Freeze
## Phase 7B.8.2 — CANONICAL — All 8 Decisions APPROVED

**Date**: 2026-08-09  
**Phase**: 7B.8.2  
**Status**: HUMAN PRICE DECISION FREEZE  
**Production ready**: FALSE — Research/calibration only  
**Price provenance**: FIXEO_HUMAN_CALIBRATED_PILOT  
**Maturity**: LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION  

---

## Version History

| Version | Status | Key event |
|---|---|---|
| V0.1 | IMMUTABLE | External Moroccan market research — all PENDING |
| V0.2 | IMMUTABLE | Human calibration preparation — economic modelling, candidate prices — all PENDING |
| **V0.3** | **CANONICAL** | **Human price decision freeze — 8 APPROVED** |

### V0.2 → V0.3 Human Changes

| Code | V0.2 Recommended | V0.3 Approved | Changed | Human Note |
|---|---|---|---|---|
| NET-001 | 200 MAD | **200 MAD** | No | — |
| NET-002 | 60 MAD/ch | **65 MAD/ch** | **Yes** | Raised for better F2/F3 market alignment |
| NET-004 | 600 MAD | **600 MAD** | No | — |
| NET-010 | 300 MAD | **300 MAD** | No | — |
| NET-011 | 450 MAD | **450 MAD** | No | — |
| NET-013 | 200 MAD | **250 MAD** | **Yes** | Raised to reflect both-faces scope |
| NET-014 | 280 MAD | **300 MAD** | **Yes** | Raised for both-faces and market positioning |
| NET-030 rate | 18 MAD/m² | **18 MAD/m²** | No | — |
| NET-030 min | 1000 MAD | **1000 MAD** | No | — |

---

## The Eight Approved Decisions

---

### NET-001 — Visite Minimum Nettoyage

| Field | Value |
|---|---|
| **Approved price** | **200 MAD** |
| Architecture | MINIMUM_VISIT |
| Formula | `FINAL = max(200, 65 × total_cleaner_hours)` |
| Minimum semantics | FLOOR — never additive |
| Minimum cleaner-hours | 3 |
| Travel | INCLUDED |
| Products | CLIENT_SUPPLIED |
| Equipment | CLIENT_SUPPLIED |
| City adjustment | null |
| Urgency modifier | null |
| Night modifier | null |
| Weekend modifier | null |
| Holiday modifier | null |
| Express modifier | null |
| Recurring modifier | null |
| human_decision | **APPROVED** |
| production_ready | false |

**Anti-double-charge rule**: `max(200, 65 × cleaner-hours)`. Never `200 + (65 × cleaner-hours)`.

---

### NET-002 — Ménage Standard (Tarif Horaire par Agent)

| Field | Value |
|---|---|
| **Approved price** | **65 MAD / cleaner-hour** |
| Architecture | HOURLY |
| Unit | **PER_CLEANER_HOUR** |
| Formula | `FINAL = max(200, 65 × number_of_cleaners × hours)` |
| Travel | INCLUDED |
| Products | CLIENT_SUPPLIED |
| Equipment | CLIENT_SUPPLIED |
| City adjustment | null |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

**Canonical examples** (these must validate exactly):

| Cleaners | Hours | Cleaner-hours | Calculated | Final |
|---|---|---|---|---|
| 1 | 3h | 3 ch | 195 MAD | **200 MAD** (minimum) |
| 1 | 4h | 4 ch | 260 MAD | **260 MAD** |
| 2 | 3h | 6 ch | 390 MAD | **390 MAD** |
| 2 | 4h | 8 ch | 520 MAD | **520 MAD** |

**Forbidden wording**: "65 MAD/heure" without explicit per-cleaner qualifier.  
**Disclosure**: Client must see worker count before booking.

---

### NET-004 — Grand Nettoyage Appartement F2/F3

| Field | Value |
|---|---|
| **Approved price** | **600 MAD** |
| Reference property | F2/F3 (60–100 m²) |
| Architecture | CONDITIONAL_FIXED |
| Unit | Per intervention |
| Travel | INCLUDED |
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Equipment | ARTISAN_SUPPLIED_INCLUDED |
| Operating model | Typically 2 cleaners, professional scope |
| Villa | QUOTE_REQUIRED — 600 MAD does NOT extend to villas |
| Studio/F4/F5 | Future size tiers — NOT approved in this phase |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

**Scope distinction**: Deep-clean is DISTINCT from standard cleaning (NET-001/002). Includes professional products, specialist equipment, deeper kitchen/bathroom/floor scope, accessible windows within contract. See scope contract in calibration.v0.3.json.

---

### NET-010 — Nettoyage Canapé 2 Places

| Field | Value |
|---|---|
| **Approved price** | **300 MAD** |
| Unit | Per 2-seat sofa |
| Architecture | FIXED_PER_ITEM |
| Method | Injection/extraction or equivalent professional textile-cleaning process |
| Travel | INCLUDED |
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Equipment | ARTISAN_SUPPLIED_INCLUDED |
| Source confidence | HIGH — 3 sources converge |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

---

### NET-011 — Nettoyage Canapé 3 Places

| Field | Value |
|---|---|
| **Approved price** | **450 MAD** |
| Unit | Per 3-seat sofa |
| Architecture | FIXED_PER_ITEM |
| Method | Injection/extraction or equivalent professional textile-cleaning process |
| Travel | INCLUDED |
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Equipment | ARTISAN_SUPPLIED_INCLUDED |
| Source confidence | HIGH — 2 sources converge |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

---

### NET-013 — Nettoyage Matelas Simple (les 2 faces)

| Field | Value |
|---|---|
| **Approved price** | **250 MAD** |
| Unit | **PER_MATTRESS_BOTH_FACES** — one single mattress, both faces cleaned |
| Architecture | FIXED_PER_ITEM |
| Method | Injection/extraction or steam as appropriate for fabric |
| Travel | INCLUDED |
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Equipment | ARTISAN_SUPPLIED_INCLUDED |
| Source confidence | HIGH — 3 sources; face ambiguity resolved |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

**Face semantics**: V0.2 identified that external sources used differing per-face vs per-mattress pricing conventions. This freeze resolves the ambiguity: 250 MAD = one single mattress / both faces. Historical V0.1 evidence is NOT rewritten — sources documented as-is with their original conventions.

---

### NET-014 — Nettoyage Matelas Double (les 2 faces)

| Field | Value |
|---|---|
| **Approved price** | **300 MAD** |
| Unit | **PER_MATTRESS_BOTH_FACES** — one double mattress, both faces cleaned |
| Architecture | FIXED_PER_ITEM |
| Method | Injection/extraction or steam as appropriate for fabric |
| Travel | INCLUDED |
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Equipment | ARTISAN_SUPPLIED_INCLUDED |
| Source confidence | MEDIUM — 2 sources |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

---

### NET-030 — Nettoyage Après Travaux Standard (au m²)

| Field | Value |
|---|---|
| **Approved rate** | **18 MAD / m²** |
| **Approved minimum** | **1,000 MAD** |
| Architecture | CONDITIONAL_PER_M2_WITH_MINIMUM |
| Formula | `FINAL = max(1000, area_m2 × 18)` |
| Travel | INCLUDED |
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Equipment (industrial) | ARTISAN_SUPPLIED_INCLUDED |
| Source confidence | LOW — 2 sources only |
| All modifiers | null |
| human_decision | **APPROVED** |
| production_ready | false |

**Canonical price points** (must validate exactly):

| Area | Calculated | Final |
|---|---|---|
| 40 m² | 720 MAD | **1,000 MAD** (minimum) |
| 60 m² | 1,080 MAD | **1,080 MAD** |
| 80 m² | 1,440 MAD | **1,440 MAD** |
| 100 m² | 1,800 MAD | **1,800 MAD** |
| 150 m² | 2,700 MAD | **2,700 MAD** |

**Scope**: Standard/light post-construction only. Mandatory escape to QUOTE_REQUIRED or ROUTE_TO_SPECIALIST for: hardened cement, heavy paint scraping, rubble/debris, façade work, height > 2m, industrial contamination, sewage, mold remediation, biohazard, hazardous waste, extreme site conditions.

**Important**: Escape conditions must NOT silently increase the 18 MAD/m² rate. Artisan must STOP, declare, and obtain client approval.

---

## Deferred / Non-Approved Services

| Code | Service | Status | Next action |
|---|---|---|---|
| NET-003 | Journée complète | DEFERRED | Covered by NET-002 hourly |
| NET-005 | Avant/après déménagement | DEFERRED | LOW confidence, needs research |
| NET-012 | Canapé angle/salon marocain | CALIBRATE_LATER | MEDIUM confidence, 700 MAD anchor |
| NET-020 | Tapis petit | CALIBRATE_LATER | LOW confidence |
| NET-021 | Tapis grand m² | CALIBRATE_LATER | MEDIUM confidence |
| NET-031 | Post-construction forfait | MERGED into NET-030 | — |

**No new services approved in this phase. The list above is not extended.**

---

## Architecture Doctrines (Canonical)

### Worker-Count Doctrine
- Canonical unit: **PER_CLEANER_HOUR**
- Formula: `TOTAL_CH = number_of_cleaners × hours`
- Final price: `max(200, 65 × TOTAL_CH)`
- "65 MAD/heure" without per-cleaner qualifier = **FORBIDDEN**

### Anti-Double-Charge
- `FINAL = max(200, 65 × total_cleaner_hours)` — minimum is a floor, never additive

### Products/Equipment Split
- **MODEL A** (NET-001/002): CLIENT_SUPPLIED both — must be disclosed before booking
- **MODEL C** (NET-004/010/011/013/014/030): ARTISAN_SUPPLIED_INCLUDED both

### Complexity Policy
- No artisan-controlled multipliers without separate research + human approval
- On-site complexity discovery → STOP → declare → client consent → proceed or not

### Geographic Policy
- NATIONAL_MOROCCO — no city multipliers

### Modifier Policy
- ALL NULL: urgency, night, weekend, holiday, express, recurring

---

## Price Provenance

These prices are NOT:
- Official Moroccan tariffs
- Regulated prices
- AI-generated canonical values
- ML predictions
- Statistically proven national medians
- FIXEO transaction medians
- Artisan-declared canonical values

They result from: **external Moroccan market research + economic analysis + explicit human calibration**

**Client-facing disclaimer** (document only — not deployed):  
> *Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.*

---

## Phase 7B.8.2 — COMPLETE

All 8 human decisions recorded. V0.1 and V0.2 artifacts preserved and immutable. production_ready = false on all. No deployment performed.
