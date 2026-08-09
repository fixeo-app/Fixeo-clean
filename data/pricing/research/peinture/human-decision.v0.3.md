# FIXEO Peinture — Human Price Decision Record
## Phase 7B.9.2 — Human Price Decision Freeze
**Date**: 2026-08-09  
**Based on calibration commit**: 173ebc3 (Phase 7B.9.1)  
**This commit**: Phase 7B.9.2

---

> This document records the human price decisions for FIXEO Peinture V1.  
> All prices are `human_decision = APPROVED` and `production_ready = false`.  
> These are pilot prices. They are indicative only. The actual price is confirmed with the artisan before any intervention.

---

## Six Approved Prices

### PEIN-001 — Minimum Painting Project

| Field | Value |
|-------|-------|
| **Human decision** | ✅ APPROVED |
| **Approved price** | **800 MAD** |
| **Unit** | Flat minimum |
| **Architecture** | `FINAL = max(800, 35 × painted_m²)` |
| **Anti-double-charge** | 800 MAD is a FLOOR, not additive. Never: 800 + (35 × m²) |
| **V0.2 recommendation** | 800 MAD |
| **Human adjustment** | None — confirmed |
| **production_ready** | false |

---

### PEIN-002 — Interior Wall — Labour Only

| Field | Value |
|-------|-------|
| **Human decision** | ✅ APPROVED |
| **Approved price** | **35 MAD / painted m²** |
| **Architecture** | `FINAL = max(800, 35 × painted_m²)` |
| **Paint** | CLIENT_SUPPLIED |
| **Coats** | Primer where required + 2 finish coats |
| **Scope** | Labour + basic consumables/tools + protection + light prep (READY_TO_PAINT) + cleanup |
| **V0.2 recommendation** | 35 MAD/m² |
| **Human adjustment** | None — confirmed |
| **production_ready** | false |

**READY_TO_PAINT contract applies**: dry surface, stable coating, no active moisture, no mold, no unstable plaster, no structural crack, no major peeling. Minor included prep: small nail holes, fine cracks ≤2mm, light sanding.

**Artisan economics**: 35 MAD/m² × 60m²/day = 2,100 MAD/day gross → 1,785 MAD net after 15% commission. ✅ Sustainable. (FIXEO_POLICY_ESTIMATE)

---

### PEIN-003 — Interior Wall — Labour + Standard Paint

| Field | Value |
|-------|-------|
| **Human decision** | ✅ APPROVED |
| **Approved price** | **65 MAD / painted m²** |
| **Architecture** | `FINAL = max(800, 65 × painted_m²)` |
| **Paint** | ARTISAN_SUPPLIED_STANDARD (acrylic vinyl lavable — Colorado/Astral/Atlas class) |
| **Coats** | Primer where required + 2 finish coats |
| **V0.2 recommendation** | 60 MAD/m² |
| **Human adjustment** | **+5 MAD/m²** |
| **Adjustment reason** | V0.2 economic model showed only ~9.8 MAD/m² gross margin at 60 MAD before commission. Human raised to 65 MAD to protect artisan economics. 65 MAD remains within the 45–80 MAD/m² external market range. |
| **production_ready** | false |

**Economic recheck at 65 MAD/m²**:
- Gross margin/m²: 49.8 MAD (76.6% vs 74.7% at 60)
- Day gross (60m²): 3,900 MAD
- After 15% commission: 3,315 MAD
- Minus material (60m² × 15.2): 912 MAD
- Artisan net labour/day: **2,403 MAD** — improvement of +255 MAD/day vs 60 MAD candidate ✅

**Paint quality requirement**: Standard residential washable acrylic vinyl. Brands: Colorado, Astral, Atlas equivalent. Economy unlabelled paint NOT permitted. Premium upgrade = separate disclosed material cost.

---

### PEIN-004 — Ceiling Standard Repaint

| Field | Value |
|-------|-------|
| **Human decision** | ✅ APPROVED |
| **Approved price** | **45 MAD / ceiling m²** |
| **Architecture** | `FINAL = max(800, 45 × ceiling_m²)` |
| **Measurement** | `CEILING_M2 = floor area of room` |
| **Paint** | ARTISAN_SUPPLIED_STANDARD |
| **Coats** | Primer where required + 2 finish coats |
| **Scope** | Standard residential ceiling, local minor prep, light sanding, local enduit where minor, primer, 2 coats, protection, cleanup |
| **Escapes** | Active moisture → HORS PÉRIMÈTRE. Large cracks → HORS PÉRIMÈTRE. Unstable plaster → QUOTE. |
| **V0.2 recommendation** | 45 MAD/m² |
| **Human adjustment** | None — confirmed |
| **production_ready** | false |

**Artisan economics**: 45 MAD/m² × 50m²/day = 2,250 MAD/day gross → 1,912 MAD net. ✅ (FIXEO_POLICY_ESTIMATE)

---

### PEIN-005 — Interior Wall + Minor Preparation

| Field | Value |
|-------|-------|
| **Human decision** | ✅ APPROVED |
| **Approved price** | **75 MAD / painted m²** |
| **Architecture** | `FINAL = max(800, 75 × painted_m²)` |
| **Paint** | ARTISAN_SUPPLIED_STANDARD |
| **Coats** | Primer + 2 finish coats |
| **Minor prep included** | Holes ≤3cm, cracks ≤3mm/50cm, light-to-moderate sanding, local enduit ≤20% of surface, local peeling treatment |
| **Escape threshold** | >20% enduit required → STOP → notify FIXEO → quote |
| **V0.2 recommendation** | 75 MAD/m² (all-in) |
| **Human adjustment** | None — confirmed |
| **production_ready** | false |

**Artisan economics**: 75 MAD/m² × 40m²/day (slower due to prep) = 3,000 MAD/day gross → 2,550 MAD net after 15%. Minus material ~608 MAD. Artisan net labour: **1,942 MAD/day**. ✅ (FIXEO_POLICY_ESTIMATE)

---

### PEIN-008 — Enduit de Lissage (Preparation Add-On)

| Field | Value |
|-------|-------|
| **Human decision** | ✅ APPROVED |
| **Approved price** | **25 MAD / painted m²** |
| **Canonical role** | **PREPARATION_ADD_ON** — not a standalone headline service |
| **Architecture** | `ADD_ON = 25 × painted_m²` |
| **Includes** | Enduit material + 2 passes + sanding |
| **Excludes** | Paint, primer, structural repair (>5mm depth) |
| **Max repair depth** | 5mm — beyond this → Maçonnerie |
| **V0.2 recommendation** | 25 MAD/m² |
| **Human adjustment** | None — confirmed |
| **production_ready** | false |

---

## One Deferred Service

### PEIN-006 — Full Standard Room ❌ DEFERRED

| Field | Value |
|-------|-------|
| **Human decision** | ❌ DEFERRED |
| **Approved price** | null |
| **V0.2 candidate** | 1,800 MAD |

**Reason for deferral**: The 1,800 MAD room package creates a material economic inconsistency. A standard room (15–25m² floor) with ~75m² painted surface, billed at 75 MAD/m² all-in, would generate ~4,500 MAD. A fixed 1,800 MAD room package would be ~60% below the equivalent per-m² price — creating incentives to underperform (rush, fewer coats, skip prep) and client/artisan arbitrage risk.

**For V1**: Use PEIN-002 + PEIN-004 (per painted m² + per ceiling m²) as the calculation model.

**Future room package requires**: explicit room-size taxonomy, measured FIXEO missions, clear painted-surface ceiling, minimum transaction sample.

---

## Doctrine Freezes

### Painted-Surface Doctrine
`measurement_basis = PAINTED_SURFACE_M2` for PEIN-002/003/005/008  
`measurement_basis = CEILING_M2` for PEIN-004  
Floor area of property ≠ painted surface. Never.

### Coat Doctrine
Standard: **2 finish coats**. Primer where objectively required.  
Dark-to-light: possible 3rd coat — identify before, explain, client approval before proceeding.

### Paint-Supply Doctrine
Primary: PEIN-002 — CLIENT_SUPPLIED (maximum transparency)  
Secondary: PEIN-003/004/005 — ARTISAN_SUPPLIED_STANDARD (named brand class)  
Premium upgrade: SEPARATE_DISCLOSED only.

### Minimum Anti-Double-Charge
`FINAL = max(800, rate × m²)` — never `800 + (rate × m²)`.

### Moisture/Mold
HORS PÉRIMÈTRE PEINTURE if active. Route → Plomberie / Toiture / Maçonnerie. Return to Peinture only after source confirmed resolved.

### Complexity
No arbitrary % multiplier. Objective thresholds only.

### Geography
`city_adjustment = null` — national scope.

### Time modifiers
All null: urgency / night / weekend / holiday / express.

### Price Provenance
`FIXEO_HUMAN_CALIBRATED_PILOT`  
`LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION`  
Not official, not regulated, not statistical. Disclaimer: *"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."*

---

## Summary Table

| Code | Service | Price | Unit | Paint | Decision |
|------|---------|-------|------|-------|---------|
| PEIN-001 | Minimum project | 800 MAD | flat minimum | Client | ✅ APPROVED |
| PEIN-002 | Wall — labour only | 35 MAD | /painted m² | Client | ✅ APPROVED |
| PEIN-003 | Wall — labour + paint | 65 MAD | /painted m² | Artisan std | ✅ APPROVED |
| PEIN-004 | Ceiling | 45 MAD | /ceiling m² | Artisan std | ✅ APPROVED |
| PEIN-005 | Wall + minor prep | 75 MAD | /painted m² | Artisan std | ✅ APPROVED |
| PEIN-006 | Full room | — | — | — | ❌ DEFERRED |
| PEIN-008 | Enduit de lissage | 25 MAD | /painted m² | N/A | ✅ APPROVED (add-on only) |

All: `production_ready = false`
