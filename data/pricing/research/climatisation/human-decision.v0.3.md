# FIXEO Climatisation — Human Price Decision Record
## Phase 7B.6.2

**Status:** HUMAN_PRICE_DECISION_FREEZE — RESEARCH ARTIFACTS ONLY — NOT PRODUCTION  
**Date:** 2026-08-09  
**Phase:** 7B.6.2  
**Preceding phases:** 7B.6 (Morocco market research) → 7B.6.1 (Human calibration preparation) → **7B.6.2 (Human price decision freeze)**  
**Production ready:** NO — `production_ready = false` on all services  
**Deployment performed:** NO  

---

## Human Price Decision Table

| # | Service Code | Label | Architecture | APPROVED PRICE (MAD) | V0.2 Proposed | Decision Note |
|---|---|---|---|---|---|---|
| 1 | CLIM-002 | Diagnostic climatisation + déplacement | FIXED | **250** | 250 | Confirmed — research anchor |
| 2 | CLIM-003 | Entretien annuel standard / unité | FIXED_PER_AC_UNIT | **300** | 300 | Confirmed — research anchor |
| 3 | CLIM-004 | Nettoyage profond int+ext / unité | FIXED_PER_AC_UNIT | **450** | 450 | Confirmed — research anchor |
| 4 | CLIM-009 | Débouchage condensats | FIXED | **250** | 220 | **Revised upward** — better technician viability, remains in market range (150–300 MAD) |
| 5 | CLIM-013 | Réparation fuite accessible (labour) | CONDITIONAL_FIXED | **600** | 600 | Confirmed — research anchor, labour-only price |
| 6 | CLIM-020 | Installation mono-split ≤3m | CONDITIONAL_FIXED | **1 000** | 900 | **Revised upward** — economic buffer for included materials + vacuum/commissioning procedure |
| 7 | CLIM-021 | Installation mono-split ≤5m | CONDITIONAL_FIXED | **1 200** | 1 100 | **Revised upward** — maintains exactly 200 MAD delta vs CLIM-020 |
| 8 | CLIM-030 | Démontage split (pump-down) | FIXED | **550** | 550 | Confirmed — research anchor |

**Human decision status:** ALL EIGHT = `human_decision: APPROVED`  
**Production status:** ALL EIGHT = `production_ready: false`

---

## Revision Notes

### CLIM-009: 220 → 250 MAD

V0.2 proposed 220 MAD to avoid worst-case floor-touch at 200 MAD. Human decision: 250 MAD.

**Rationale:** A 250 MAD price for a specialist climatisation call-out (travel + equipment + drain clearing) better reflects the economic reality of a technical call-out while remaining firmly within the researched market range (150–300 MAD). At 250 MAD the worst-case net is 140 MAD — ACCEPTABLE, comfortably above both the universal hard floor (100 MAD) and the climatisation target floor (150 MAD).

### CLIM-020: 900 → 1 000 MAD

**Rationale:** The standardized installation includes significant materials (wall support bracket, 3m copper kit with insulation, inter-unit cable, condensate drain pipe, consumables) estimated at 320–460 MAD. At 900 MAD / 20% commission / 60 MAD fuel the net-before-materials was 740 MAD — strong. But after deducting materials (320–460 MAD), the artisan net labour ranged from 280–420 MAD for a 3–5h intervention (56–140 MAD/hour). The lower bound was tight. At 1 000 MAD the worst-case net after materials improves to 280 MAD (with 460 MAD material cost) — a meaningfully stronger position. The 1 000 MAD price remains below the formal market mid-range for this scope.

### CLIM-021: 1 100 → 1 200 MAD

**Rationale:** Maintaining exactly 200 MAD delta over CLIM-020. With CLIM-020 approved at 1 000 MAD, CLIM-021 must be 1 200 MAD to preserve the delta that reflects 2 extra metres of copper + insulation (≈120–160 MAD additional material cost) and additional labour time.

---

## Summary: What Was Approved and What Was Not

### ✅ APPROVED (8 services)

| Code | Price | Architecture |
|---|---|---|
| CLIM-002 | 250 MAD | FIXED |
| CLIM-003 | 300 MAD/unité | FIXED_PER_AC_UNIT |
| CLIM-004 | 450 MAD/unité | FIXED_PER_AC_UNIT |
| CLIM-009 | 250 MAD | FIXED |
| CLIM-013 | 600 MAD labour seul | CONDITIONAL_FIXED |
| CLIM-020 | 1 000 MAD | CONDITIONAL_FIXED |
| CLIM-021 | 1 200 MAD | CONDITIONAL_FIXED |
| CLIM-030 | 550 MAD | FIXED |

### ❌ NOT APPROVED — Deferred to future calibration

- All refrigerant pricing (R410A, R32, R22, partial/complete recharge, vacuum standalone)
- All component pricing (capacitor, PCB, fan motor, compressor, condensate pump)
- Extra copper beyond installation scope (CLIM-025)
- Support/drilling add-ons (CLIM-026/027/028)
- Electrical connection (CLIM-029)
- Relocation (CLIM-031)
- Maintenance contracts (CLIM-032)
- Urgency/night/weekend/holiday modifiers (ALL null)
- City multipliers (ALL null)

---

## Policy Decisions Frozen

### 1. Diagnostic Absorption Policy

**Classification:** FIXEO_POLICY (not universal Moroccan market practice)

The 250 MAD diagnostic fee (CLIM-002) is **deductible from the same-visit standardized repair** if the client accepts a qualifying standardized FIXEO intervention on the same visit.

The 250 MAD remains fully due when:
- No repair is performed
- Client declines the repair
- Intervention is outside standardized scope
- Specialist investigation required
- Diagnosis inconclusive
- Return visit necessary
- Required parts/refrigerant unavailable, no qualifying repair completed same visit

A client must never be charged 250 MAD diagnostic + full standardized repair price when the same-visit absorption rule applies.

### 2. Economic Floors

**Universal Hard Floor:** 100 MAD  
→ Absolute FIXEO viability floor. No artisan net may fall below this under any scenario.

**Climatisation Target Floor:** 150 MAD  
→ FIXEO human-calibrated economic policy target. Reflects specialist equipment burden, tool transport, skill level, longer interventions, refrigeration procedure requirements, and environmental responsibility.  
→ This is **FIXEO_TECHNICAL_POLICY**, NOT a statistically proven Moroccan artisan cost floor.

### 3. Refrigeration Integrity Doctrine

Frozen as FIXEO_TECHNICAL_POLICY. Non-negotiable standards:

```
DIAGNOSE → PRESSURE CHECK → LEAK DETECTION → REPAIR → VACUUM → RECHARGE → TEST
```

Prohibited:
- Blind top-up (recharge sans diagnostic)
- Recharge without vacuum
- Refrigerant mixing
- Intentional venting
- Repeated R22 recharge without replacement advisory

### 4. AC Unit Supply

The client always supplies the AC unit. The FIXEO price for CLIM-020 and CLIM-021 never includes the equipment. This must be communicated explicitly before every installation.

### 5. Pump-Down Mandatory

All CLIM-030 dismantlings must use the pump-down procedure. Refrigerant venting is prohibited as normal FIXEO practice.

### 6. CLIM-013 Refrigerant Exclusion

The 600 MAD is labour-only. Refrigerant is always excluded and separately billed. This price must never be presented as "leak repair + gas recharge all-inclusive."

### 7. Geographic Policy

```
market_scope = NATIONAL_MOROCCO
city_adjustment = null
```

No city multipliers approved. Casablanca / Fès / Rabat / Marrakech / Tanger / Agadir multipliers remain null.

### 8. Time/Urgency Modifiers

All null. No urgency, night, weekend, or holiday modifiers approved in this phase.

### 9. Price Provenance

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

These prices are NOT AI-generated, not ML predictions, not official tariffs, not regulated prices, not artisan-declared prices, not FIXEO transaction medians, not statistically proven national medians.

Surface disclaimer: *"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."*

---

## Commission & Artisan Viability Summary (At Approved Prices)

| Code | Price | 15%/MID net | 20%/HIGH net | Worst Case | Grade |
|---|---|---|---|---|---|
| CLIM-002 | 250 | 173 | 140 | 140 | ACCEPTABLE |
| CLIM-003 | 300 | 215 | 180 | 180 | ACCEPTABLE |
| CLIM-004 | 450 | 343 | 300 | 300 | STRONG |
| CLIM-009 | 250 | 173 | 140 | 140 | ACCEPTABLE |
| CLIM-013 | 600 | 470 | 420 | 420 | STRONG |
| CLIM-020 | 1000 | 810* | 740* | 740* | STRONG (before materials) |
| CLIM-021 | 1200 | 980* | 900* | 900* | STRONG (before materials) |
| CLIM-030 | 550 | 428 | 380 | 380 | STRONG |

*Before material deduction. See material stress test below.

**Grade thresholds (climatisation-specific):**
- STRONG: ≥ 200 MAD
- ACCEPTABLE: ≥ 150 MAD
- MARGINAL: ≥ 100 MAD
- FAIL: < 100 MAD

---

## Material Cost Stress Test — Installation Services

### CLIM-020 (1 000 MAD, ≤3m)

Estimated included material cost: 320–460 MAD

| Scenario | Net before mat. | Net after mat. | Grade |
|---|---|---|---|
| 15% comm / 40 MAD fuel / 320 MAD mat | 810 | 490 | STRONG |
| 15% comm / 40 MAD fuel / 460 MAD mat | 810 | 350 | STRONG |
| 20% comm / 60 MAD fuel / 320 MAD mat | 740 | 420 | STRONG |
| 20% comm / 60 MAD fuel / 460 MAD mat | 740 | 280 | STRONG |

**Worst case net after materials: 280 MAD — STRONG**

Note: Material estimates must be validated with actual artisan procurement costs. If real material costs exceed 460 MAD, price may need revision to 1 100–1 200 MAD.

### CLIM-021 (1 200 MAD, ≤5m)

Estimated included material cost: 440–620 MAD (CLIM-020 base + 2m copper extra ≈ 120–160 MAD additional)

| Scenario | Net before mat. | Net after mat. | Grade |
|---|---|---|---|
| 15% comm / 40 MAD fuel / 440 MAD mat | 980 | 540 | STRONG |
| 15% comm / 40 MAD fuel / 620 MAD mat | 980 | 360 | STRONG |
| 20% comm / 60 MAD fuel / 440 MAD mat | 900 | 460 | STRONG |
| 20% comm / 60 MAD fuel / 620 MAD mat | 900 | 280 | STRONG |

**Worst case net after materials: 280 MAD — STRONG**

CLIM-021 at 1 200 MAD performs equally or better than CLIM-020 at 1 000 MAD in material stress tests, because the additional 200 MAD price delta more than covers the additional material cost.

---

## Standard Maintenance Contract — Scope Summary

| Scope Element | CLIM-003 (300 MAD) | CLIM-004 (450 MAD) |
|---|---|---|
| Travel | ✅ | ✅ |
| Filter cleaning | ✅ | ✅ |
| Accessible evaporator clean | ✅ | ✅ (haute pression) |
| Turbine/blower interior | ❌ | ✅ |
| Condensate pan | ✅ verify + light | ✅ full clean |
| Condensate drain | ✅ verify + light | ✅ full clean |
| Outdoor condenseur | **❌ EXCLU** | ✅ haute pression |
| Disinfectant treatment | ❌ | ✅ |
| Performance test | ✅ | ✅ |
| Typical duration | 45–60 min/unité | 90–120 min/unité |
| Specialist equipment | ❌ | ✅ (pressure washer) |
| Cleaning chemicals | Standard | Technical foam + disinfectant |

**Key distinction:** CLIM-003 = indoor unit only. CLIM-004 = full system including outdoor condenseur.

---

## HORS PÉRIMÈTRE Workflow (Frozen)

```
1. STOP
2. IDENTIFY the objective escape condition
3. EXPLAIN clearly to client
4. DECLARE: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE the additional scope or cost required
6. OBTAIN explicit client approval
7. CONTINUE only after approval
   → Original standardized FIXEO price must NEVER silently increase
```

---

## Files Created in Phase 7B.6.2

```
data/pricing/research/climatisation/
├── registry.v0.3.json          — 8 approved services with full scope
├── calibration.v0.3.json       — Approved prices + commission sensitivity recalculated
├── human-decision.v0.3.md      — This file: decision record
├── fair-price-policy.v0.3.md   — Consolidated policy document
└── validate.js                 — Extended with V0.3 checks
```

---

## V0.1/V0.2 Integrity

All prior research artifacts are preserved and unchanged:

- `registry.v0.1.json` — Phase 7B.6 market research ✅
- `sources.v0.1.json` — Phase 7B.6 ✅
- `evidence.v0.1.json` — Phase 7B.6 ✅
- `exclusions.v0.1.json` — Phase 7B.6 ✅
- `legacy-comparison.md` — Phase 7B.6 ✅
- `README.md` — Phase 7B.6 ✅
- `calibration.v0.2.json` — Phase 7B.6.1 ✅
- `human-review.v0.2.md` — Phase 7B.6.1 ✅
- `fair-price-policy.v0.2.md` — Phase 7B.6.1 ✅

---

## Production Safety

**PRODUCTION RUNTIME = 0 DIFF**  
**NO DEPLOYMENT PERFORMED**

No modifications to: `index.html`, `services.html`, `artisans.html`, `artisan-profile.html`, reservation flows, RAFI, production JS pricing engines, CSS, pSEO generators, Supabase schema/data, Vercel configuration.

---

*This is a research freeze record. No price is active in any production system. All values are indicative pending full FIXEO platform integration, which requires a separate and explicit production activation decision.*
