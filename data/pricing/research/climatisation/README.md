# FIXEO Climatisation Morocco Market Research
## Phase 7B.6

**Date:** 2026-08-09  
**Phase:** 7B.6 — FIXEO CLIMATISATION MOROCCO MARKET RESEARCH  
**Status:** EXTERNAL_RESEARCH_ONLY — Human Calibration Required  
**Production ready:** NO — all `production_ready = false`

---

## Scope

This directory contains the first serious Morocco-specific climatisation pricing research registry for FIXEO.

Research was conducted **independently of existing FIXEO prices** before any legacy review. T0 internal values were only compared after external evidence collection was complete.

---

## Methodology

1. **External source collection** — Moroccan platforms, marketplaces, contractor sites, government BTP indices, consumer forums, e-commerce (for parts context)
2. **Evidence normalization** — observed price data recorded per service category with scope notes
3. **Service taxonomy** — 35 normalized services across 7 categories
4. **Legacy comparison** — FIXEO internal files reviewed after external research
5. **Validation** — automated schema and policy validation via `validate.js`

All market references are derived from external evidence. No AI-generated, regulated, or guaranteed prices.

---

## File Index

| File | Purpose |
|---|---|
| `sources.v0.1.json` | 14 sources (10 external + 4 T0 internal) |
| `evidence.v0.1.json` | 32 evidence observations |
| `registry.v0.1.json` | 35 normalized services with full schema |
| `exclusions.v0.1.json` | 9 rejected/restructured service concepts |
| `legacy-comparison.md` | FIXEO legacy vs market assessment |
| `README.md` | This file |
| `validate.js` | Automated validation script |

---

## Source Inventory

| Source ID | Publisher | Quality Grade | Type | Usable in Calc |
|---|---|---|---|---|
| SRC-CLIM-001 | mano.ma | C+ | Platform editorial | ✅ |
| SRC-CLIM-002 | avito.ma | C | Classifieds | ✅ (floor only) |
| SRC-CLIM-003 | jumia.ma | C+ | E-commerce | ⚠️ Parts context only |
| SRC-CLIM-004 | fixandgo.ma | C+ | Platform marketplace | ✅ |
| SRC-CLIM-005 | maison.ma | C | Editorial | ✅ |
| SRC-CLIM-006 | Moroccan BTP / govt | B | Government | ✅ (floor validation) |
| SRC-CLIM-007 | Facebook Marketplace / informal | D | Social informal | ❌ Unsafe practices doc only |
| SRC-CLIM-008 | Moroccan HVAC contractors | C+ | Contractor published | ✅ |
| SRC-CLIM-009 | Prix-Travaux.ma | C | Editorial renovation | ✅ |
| SRC-CLIM-010 | Moroccan consumer forums | D | Forum/consumer | ❌ Outlier detection only |
| SRC-CLIM-T01 | fixeo-estimation-engine-v1.js | T0 | FIXEO internal | ❌ Never calibration |
| SRC-CLIM-T02 | fixeo-estimation-v2-hero.js | T0 | FIXEO internal | ❌ Never calibration |
| SRC-CLIM-T03 | fixeo-pricing-marocain.js | T0 | FIXEO internal | ❌ Never calibration |
| SRC-CLIM-T04 | fixeo-profile-v2a.js | T0 | FIXEO internal | ❌ Never calibration |

---

## Service Count by Category

| Category | Services | Fixed | DIAGNOSIS_FIRST | CONDITIONAL | UNIT_BASED | LABOUR+PART | QUOTE | INSUFFICIENT |
|---|---|---|---|---|---|---|---|---|
| DIAGNOSTIC_DEPLACEMENT | 5 | 2 | 2 | 1 | — | — | — | — |
| ENTRETIEN_NETTOYAGE | 4 | 4 | — | — | — | — | — | — |
| RECHARGE_FLUIDE | 6 | 1 | 1 | — | — | 3 | — | 1 |
| DETECTION_REPARATION_FUITE | 3 | 1 | 1 | 1 | — | — | — | — |
| REMPLACEMENT_COMPOSANT | 4 | — | — | — | — | 3 | 1 | — |
| INSTALLATION | 8 | — | — | 3 | 2 | — | 2 | 1 |
| DESINSTALLATION_DEPLACEMENT | 2 | 1 | — | 1 | — | — | — | — |
| MATERIAUX_SUPPLEMENTAIRES | — | — | — | — | — | — | — | — |
| CONTRAT_MAINTENANCE | 1 | — | — | — | 1 | — | — | — |
| URGENCE | 1 | — | — | — | — | — | — | 1 |
| **TOTAL** | **35** | **9** | **4** | **6** | **3** | **6** | **3** | **3** |

*Note: MATERIAUX_SUPPLEMENTAIRES services (CLIM-025, CLIM-026, CLIM-027) are classified as UNIT_BASED under INSTALLATION.*

---

## Key Market Findings

### 1. Refrigerant Integrity — Critical Issue Found

The Moroccan informal market has a **documented unsafe practice of blind refrigerant top-up** without leak diagnosis, vacuum procedure, or pressure test. This is:
- Technically harmful (moisture ingress, repeated gas loss)
- Commercially dishonest (symptom masked, not solved)
- Environmentally harmful (eventual refrigerant venting)

**FIXEO must explicitly prohibit this practice.** No FIXEO-endorsed service may offer "recharge gaz" as a standalone fixed price without mandatory leak detection prerequisite.

### 2. R22 Phase-Out Alert

R22 systems are being phased out in Morocco under Montreal Protocol. R22 recharge should be documented as a temporary measure with explicit client advisory recommending system replacement. FIXEO artisans must be briefed on this obligation.

### 3. Installation Scope Clarity Required

"Installation standard" is commercially undefined in the Moroccan market without specifying:
- Whether client or artisan supplies the AC unit
- Included copper run length (3m vs 5m)
- Whether support mural and perçage are included

FIXEO standardized installation prices must include these scope definitions.

### 4. Labour-Fixed-Part-Separate is the Correct Model for Components

For capacitor, PCB, motor, and compressor replacements, the Moroccan market consistently separates:
- Labour (standardizable) 
- Part (brand/model dependent, must be quoted separately)

FIXEO must adopt this model rather than attempting all-in fixed prices for component replacements.

### 5. Diagnostic Must Gate Repair

The Moroccan clim market supports a deductible diagnostic model (diagnosis paid, deductible from repair if accepted). FIXEO should implement this for all DIAGNOSIS_FIRST services.

---

## Confidence Summary

| Confidence Level | Service Count |
|---|---|
| MEDIUM | 21 |
| LOW | 8 |
| INSUFFICIENT | 4 |
| HIGH | 0 |

No service achieves HIGH confidence due to absence of statistical samples in available Moroccan sources. Platform and contractor evidence provides C/C+ quality at best for this métier.

---

## Candidate Services for Human Calibration

The following 9 services are recommended as priority calibration candidates:

| Service Code | Label | Pricing Mode | Confidence |
|---|---|---|---|
| CLIM-002 | Diagnostic climatiseur (déplacement + diagnostic) | FIXED | MEDIUM |
| CLIM-003 | Entretien annuel standard | FIXED | MEDIUM |
| CLIM-004 | Nettoyage profond | FIXED | MEDIUM |
| CLIM-006 | Panne — diagnostic première visite | DIAGNOSIS_FIRST | MEDIUM |
| CLIM-008 | Détection fuite frigorifique | DIAGNOSIS_FIRST | MEDIUM |
| CLIM-009 | Débouchage condensats | FIXED | LOW |
| CLIM-016 | Remplacement condensateur (labour) | LABOUR_FIXED_PART_SEPARATE | MEDIUM |
| CLIM-020 | Installation split mono ≤3m | CONDITIONAL_FIXED | MEDIUM |
| CLIM-025 | Mètre supplémentaire liaison cuivre | UNIT_BASED | MEDIUM |

---

## Artisan Economic Floor

Minimum artisan net pre-labour floor: **100 MAD** (canonical FIXEO floor)

For climatisation specifically, the **practical economic floor is higher** due to:
- Specialized equipment (manifold gauges, vacuum pump, leak detector, pressure washer for deep clean, torch for brazing)
- Refrigerant handling certification requirements (especially R32 A2L)
- Transportation of bulky equipment
- High seasonal demand peaks with corresponding capacity costs

Estimated climatisation-specific artisan floor: **150–200 MAD minimum** for any call-out.

This does not change the canonical floor but informs that any FIXEO reference price below 150 MAD for a clim service would be economically unsustainable.

---

## Geographic Policy

- `market_scope = NATIONAL_MOROCCO`
- `city_adjustment = null`
- Casablanca price evidence used as economic stress test only, not as multiplier base

---

## Urgency / Night / Weekend Policy

All modifiers frozen:
- `urgency_modifier = null`
- `night_modifier = null`
- `weekend_modifier = null`

Evidence of informal market urgency surcharges (100–300 MAD) documented in CLIM-033 and EV-CLIM-032 for completeness. Not activated.

---

## What Comes Next

**Phase 7B.7** — Human calibration of candidate services:
1. Human reviewer validates market anchor for each candidate
2. Artisan economic floor analysis per approved service
3. Client fairness assessment
4. Price approval and promotion to `production_ready = true`

**DO NOT proceed to calibration without human review.**

---

## Freeze Statement

> This research phase is complete. No production files have been touched. All `production_ready = false`. No price has been activated. This data is research-only and must not be used as a client-facing price until Phase 7B.7 human calibration is complete and prices are explicitly approved.
