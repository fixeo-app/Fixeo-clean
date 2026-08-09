# FIXEO Peinture — Fair Price Policy (Frozen)
## Phase 7B.9.2 — Human Price Decision Freeze
**Status**: FROZEN — HUMAN APPROVED  
**Date**: 2026-08-09

---

> This is the frozen V1 fair price policy for Peinture.  
> `production_ready = false` for all approved services.  
> Prices are indicative pilots pending deployment decision.

---

## 1. Six Approved Prices — Exact Values

| Code | Service | Price | Unit |
|------|---------|-------|------|
| PEIN-001 | Minimum project | **800 MAD** | flat minimum |
| PEIN-002 | Interior wall — labour only | **35 MAD** | /painted m² |
| PEIN-003 | Interior wall — labour + standard paint | **65 MAD** | /painted m² |
| PEIN-004 | Ceiling — standard repaint | **45 MAD** | /ceiling m² |
| PEIN-005 | Interior wall + minor preparation | **75 MAD** | /painted m² |
| PEIN-008 | Enduit de lissage (add-on only) | **25 MAD** | /painted m² |

PEIN-006 (full room): **DEFERRED** — null approved price.

---

## 2. Measurement Policy

| Service | Unit | Basis |
|---------|------|-------|
| PEIN-002/003/005/008 | /painted m² | `PAINTED_SURFACE_M2` — actual painted wall area |
| PEIN-004 | /ceiling m² | `CEILING_M2` = floor area of room |
| PEIN-001 | flat | `NOT_APPLICABLE` |

**Rule**: `floor_area_of_property ≠ painted_surface`. The estimator receives floor area from the client and converts internally. The price output must state the painted surface, not floor area.

---

## 3. Pricing Formulas — Frozen

```
PEIN-001: FINAL = max(800, 35 × painted_m²)              [minimum floor]
PEIN-002: FINAL = max(800, 35 × painted_m²)              [labour only]
PEIN-003: FINAL = max(800, 65 × painted_m²)              [all-in standard]
PEIN-004: FINAL = max(800, 45 × ceiling_m²)              [ceiling]
PEIN-005: FINAL = max(800, 75 × painted_m²)              [wall + minor prep]
PEIN-008: ADD_ON = 25 × painted_m²                       [enduit add-on]
```

**Anti-double-charge rule**: The minimum is a floor. `FINAL = max(800, rate × m²)`. Never: `800 + (rate × m²)`.

---

## 4. Scope Contracts

### 4.1 READY_TO_PAINT (applies to PEIN-002, PEIN-003, PEIN-004)

**Eligible surface:**
- Dry
- Stable existing coating
- No active moisture
- No mold requiring remediation
- No unstable plaster
- No structural crack
- No major peeling
- Normal residential access and height

**Minor preparation included at no extra charge:**
- Small nail holes (up to 5 per wall)
- Fine non-structural cracks ≤2mm width
- Tiny localized filler
- Light surface sanding

**Objective escape trigger**: If prep time materially exceeds READY_TO_PAINT allowance → PEIN-005 or HORS PÉRIMÈTRE.

### 4.2 Minor Preparation Contract (PEIN-005)

**Included in 75 MAD/m²:**
- All READY_TO_PAINT prep
- Rebouchage holes ≤3cm diameter
- Local filler: cracks ≤3mm width / ≤50cm length
- Light-to-moderate sanding
- Local enduit on ≤~20% of surface
- Local peeling treatment

**Escape — artisan must STOP and notify FIXEO:**
- >~20% of surface requires enduit
- Cracks requiring V-cut or structural filler
- Peeling >~25% of surface
- Active moisture
- Mold
- Structural damage

### 4.3 Enduit Add-On Contract (PEIN-008)

- 2 standard passes of enduit de lissage
- Sanding between passes
- Enduit material included
- Max repair depth: 5mm → beyond = HORS PÉRIMÈTRE Maçonnerie
- Add-on to painting services — not a standalone headline

---

## 5. Coat Doctrine

**Standard**: 2 finish coats  
**Primer**: applied where objectively required by substrate, product compatibility, or significant colour coverage need  
**Dark-to-light colour change**: may require 3rd coat — artisan identifies before starting, explains consequence, obtains client approval before proceeding  
**1-coat result**: not acceptable as standard professional delivery under FIXEO contract

---

## 6. Paint-Supply Doctrine

### Primary Option — PEIN-002
`CLIENT_SUPPLIED_PAINT`  
Maximum transparency. Client controls brand and quality. No hidden material markup. No artisan margin on paint.

### Secondary Option — PEIN-003/004/005
`ARTISAN_SUPPLIED_STANDARD_PAINT`  
Artisan supplies standard residential acrylic vinyl lavable. Named brand class: Colorado / Astral / Atlas equivalent. Economy unlabelled paint NOT permitted.

### Premium or Specialty Paint
`SEPARATE_DISCLOSED_MATERIAL_UPGRADE`  
Client approves brand, quantity, and cost before purchase. Never silently downgraded or upgraded.

---

## 7. Material Disclosure Policy

Where artisan procures non-standard material:
1. IDENTIFY product (brand / type / quantity)
2. STATE cost
3. CLIENT approval
4. PURCHASE
5. APPLY

No undisclosed material downgrade. No undisclosed markup.

---

## 8. Complexity Escape Protocol

```
READY_TO_PAINT          → PEIN-002 / PEIN-003 / PEIN-004
MINOR_PREPARATION       → PEIN-005
MODERATE_REPAIR         → PEIN-008 add-on + reassessment
                           or QUOTE_REQUIRED
HEAVY_REPAIR            → QUOTE_REQUIRED
MOISTURE_OR_MOLD        → HORS PÉRIMÈTRE PEINTURE
STRUCTURAL_DAMAGE       → HORS PÉRIMÈTRE → Maçonnerie
```

**No arbitrary multiplier** (+20%, +50%, ×2) is approved. Complexity is handled through objective scope escalation only.

---

## 9. Moisture / Mold Doctrine — Frozen

Active moisture, recurrent mold, infiltration, or unresolved water damage is **HORS PÉRIMÈTRE PEINTURE**.

**Workflow:**
1. STOP
2. Identify active moisture cause
3. DECLARE HORS PÉRIMÈTRE
4. Route: Plomberie / Toiture / Maçonnerie
5. Confirm source resolved
6. Substrate dried and stabilized
7. Return to Peinture scope

**Anti-humidity paint** = preventive measure on resolved moisture only. Never a substitute for repairing an active water source.

**FIXEO must not create a service that encourages artisans to paint over unresolved water damage.**

---

## 10. Artisan Stop-Work Conditions

Artisan must STOP work and contact FIXEO if they discover on-site:
1. Active moisture seeping through walls or ceiling
2. Significant black mold
3. Structural cracks (>5mm width, horizontal, or active)
4. Unstable plaster at risk of collapse
5. Scope substantially different from client description at booking

---

## 11. Occupied Property Policy

| Condition | Status |
|-----------|--------|
| EMPTY | STANDARD_ELIGIBLE |
| OCCUPIED_LIGHT (movable furniture) | STANDARD_ELIGIBLE_CONDITIONAL |
| OCCUPIED_HEAVY (major furniture, restricted access) | QUOTE_REQUIRED or explicit added scope |

No percentage surcharge is approved. Complexity handled via scope qualification at booking.

---

## 12. Geographic & Time Policies — Frozen

| Policy | Value |
|--------|-------|
| Market scope | NATIONAL_MOROCCO |
| City adjustment | null |
| Urgency modifier | null |
| Night modifier | null |
| Weekend modifier | null |
| Holiday modifier | null |
| Express modifier | null |

Painting is not an emergency trade. No time-based surcharge architecture is appropriate for V1.

---

## 13. Artisan Economic Policy

**Target artisan net per day**: 800–900 MAD minimum  
**Label**: `FIXEO_POLICY` — not Moroccan legal wage, not statistical

| Service | Day gross | Net after 15% | Assessment |
|---------|-----------|--------------|------------|
| PEIN-002 (35×60m²) | 2,100 | 1,785 | ✅ |
| PEIN-003 (65×60m²) | 3,900 | 3,315 → net labour 2,403 | ✅ |
| PEIN-004 (45×50m²) | 2,250 | 1,912 | ✅ |
| PEIN-005 (75×40m²) | 3,000 | 2,550 → net labour 1,942 | ✅ |

All approved services generate sustainable artisan economics above the FIXEO_POLICY floor.

---

## 14. Cross-Métier Boundaries (Frozen)

| Trigger | FIXEO routes to |
|---------|----------------|
| Active pipe leak causing wall/ceiling damage | Plomberie |
| Roof infiltration | Toiture |
| Structural cracks | Maçonnerie |
| Active mold | Maçonnerie / specialist |
| Facade enduit/render reconstruction | Maçonnerie |
| Wood repair/fabrication before painting | Menuiserie |
| Electrical fixtures/modifications | Electricité |

---

## 15. Price Provenance & Disclaimer

**Provenance**: `FIXEO_HUMAN_CALIBRATED_PILOT`  
**Maturity**: `LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION`

These prices are NOT:
- Official Moroccan tariffs
- Regulated prices
- AI-predicted values
- ML outputs
- Transaction medians
- Statistically proven national medians
- Artisan-declared canonical rates

**Mandatory disclaimer on all client-facing price outputs**:  
*"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."*

---

## 16. Client Anti-Fraud Protections

| Risk | Protection |
|------|-----------|
| Artisan uses cheap unlabelled paint | Named brand class required in booking confirmation |
| 1 coat applied instead of 2 | Coat count explicit in contract; client inspection right before final payment |
| "Bad wall" surcharge on arrival | READY_TO_PAINT objective criteria defined; no subjective artisan-only surcharge |
| Floor area quoted as painted area | Estimator controls measurement — client supplies floor area, system converts |
| Premium paint billed without approval | Material upgrade requires prior client approval per disclosure policy |

---

## 17. Deferred / QUOTE_REQUIRED Services

| Code | Status | Reason |
|------|--------|--------|
| PEIN-006 Full room | DEFERRED | Economic inconsistency with per-m² contracts |
| PEIN-007 Full apartment | DEFERRED | Too many variables |
| PEIN-009 Door painting | DEFERRED | Insufficient evidence |
| PEIN-010 Decorative | QUOTE_REQUIRED | Artisan-skill dependent |
| PEIN-011 Façade | QUOTE_REQUIRED | Height/scaffolding variables |
| PEIN-012 Heavy repair | QUOTE_REQUIRED | Site assessment required |
| Metal/shutters/windows | DEFERRED | Insufficient evidence |

---

*Phase 7B.9.2 — Human Price Decision Freeze*  
*production_ready = false for all services*  
*Next phase: Menuiserie research — AFTER explicit phase trigger*
