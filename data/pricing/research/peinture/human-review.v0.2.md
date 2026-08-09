# FIXEO Peinture — Human Calibration Review Sheet
## Phase 7B.9.1

**Status**: HUMAN PRICE DECISION REQUIRED  
**Date**: 2026-08-09  
**Based on research commit**: db7fe39  
**Calibration file**: calibration.v0.2.json

---

> ⚠️ **All prices below are CANDIDATES for human review only.**  
> No price is approved. All entries: `human_decision = PENDING` | `production_ready = false`

---

## Painted-Surface Doctrine (Mandatory Read)

**The canonical pricing unit for wall painting is PAINTED WALL SURFACE (m²), not floor area.**

| Client says | System sees | Do NOT confuse |
|------------|-------------|----------------|
| "Mon appartement fait 80m²" | Floor area: 80m² | Painted walls ≠ 80m² |
| "Ma pièce fait 20m²" | Floor area: 20m² | Painted walls ≈ 45–55m² |

**Formula for estimator (FOR REVIEW — not approved):**
```
painted_wall_surface = (room_perimeter × ceiling_height) − openings
ceiling_surface = floor_area
```

Standard conversion factors used in calibration:
- Ceiling height: 2.70m (standard Moroccan apartment)
- Door deduction: 1.5m² per door
- Window deduction: 0.5m² per window

---

## Floor-Area to Painted-Surface Conversion Table

| Apartment | Floor Area | Painted Walls | Ceiling | Total Painted |
|-----------|-----------|--------------|---------|--------------|
| Studio | 40m² | ~65m² | 40m² | ~105m² |
| F2 | 60m² | ~153m² | 60m² | ~213m² |
| F3 | 80m² | ~204m² | 80m² | ~284m² |
| F4 | 110m² | ~267m² | 110m² | ~377m² |
| Villa 200m² | 200m² | ~476m² | 200m² | ~676m² |

*All estimates are indicative. Actual painted surface varies ±15–20% based on room layout.*

---

## Human Decision Table — 7 Calibration Candidates

---

### PEIN-001 — Minimum Painting Project

| Field | Value |
|-------|-------|
| **Market range** | 600–1,200 MAD |
| **Recommended candidate** | **800 MAD** |
| **Candidate options** | 600 / 800 / 1,000 / 1,200 MAD |
| **Architecture** | `max(MINIMUM, painted_m2 × rate)` |
| **Unit** | Flat minimum |
| **Paint policy** | Client supplies |
| **Scope** | Travel + protection + masking + up to ~10m² retouche + cleanup |
| **Coat policy** | As required for small retouche |
| **Confidence** | MEDIUM |
| **Client fairness** | ✅ Transparent upfront cost |
| **Artisan fairness** | ✅ Covers 2h minimum setup |
| **Worst-case economics** | At 800 MAD / 15% commission = 680 MAD net for 2h: sustainable |
| **Key risk** | Scope creep: client expects full room at minimum price |
| **Recommended escape** | If painted surface >10m², convert to per-m² service |

**➡ Human decision: _______**  
**➡ Approved minimum price: _______  MAD**

---

### PEIN-002 — Interior Wall Labour Only (client supplies paint)

| Field | Value |
|-------|-------|
| **Market range** | 25–50 MAD/m² painted surface |
| **Recommended candidate** | **35 MAD/m²** |
| **Candidate options** | 30 / 35 / 40 / 45 MAD/m² |
| **Architecture** | Per painted m², labour only |
| **Unit** | MAD/painted m² |
| **Paint policy** | CLIENT_SUPPLIED |
| **Measurement** | PAINTED_SURFACE_M2 |
| **Scope** | Protection + minor prep (nail holes, fine cracks ≤5 per wall, light sanding) + primer where required + 2 coats client paint |
| **Coat policy** | Primer where required + 2 finish coats |
| **Confidence** | HIGH |
| **Client fairness** | ✅ Full transparency. Client controls paint quality. No hidden material markup. |
| **Artisan fairness** | ✅ At 35 MAD/m² × 60m²/day = 2,100 MAD/day gross. After 15% commission: 1,785 MAD/day. Sustainable. |
| **Worst-case economics** | 20m² at 35 = 700 MAD → minimum 800 applies → OK |
| **Key risk** | Client buys wrong paint quantity or bad-quality paint causing artisan complaints |
| **Mitigation** | Provide paint quantity calculator in estimator |

**READY_TO_PAINT contract:**
- ✅ Nail holes (up to 5 per wall), tiny filler, light sanding
- ❌ Cracks >2mm, peeling >0.25m², active moisture, unstable coating

**➡ Human decision: _______**  
**➡ Approved rate: _______ MAD/m²**

---

### PEIN-003 — Interior Wall Labour + Standard Paint

| Field | Value |
|-------|-------|
| **Market range** | 45–80 MAD/m² painted surface |
| **Recommended candidate** | **60 MAD/m²** |
| **Candidate options** | 50 / 55 / 60 / 65 / 70 MAD/m² |
| **Architecture** | Per painted m², labour + artisan-supplied standard paint |
| **Unit** | MAD/painted m² |
| **Paint policy** | ARTISAN_SUPPLIED_STANDARD |
| **Paint specification** | Standard acrylic vinyl lavable: Colorado / Astral / Atlas equivalent |
| **Excluded paint** | Generic unlabelled / economy non-washable / expired |
| **Measurement** | PAINTED_SURFACE_M2 |
| **Scope** | Same as PEIN-002 + paint material included |
| **Coat policy** | Primer where required + 2 coats |
| **Confidence** | HIGH |
| **Material economics** | Paint + primer + consumables: ~15 MAD/m². Labour: 35 MAD/m². Total cost: ~50 MAD/m². At 60 MAD: 10 MAD gross margin before commission. |
| **Client fairness** | ✅ Good if paint brand class is explicit in booking |
| **Artisan fairness** | ✅ Sustainable if using standard-grade paint |
| **Key risk** | Artisan uses cheap paint to increase margin |
| **Mitigation** | Require named brand class in artisan confirmation |

**Paint supply model recommendation for human:**
> ✅ **Recommended primary V1 architecture: PEIN-002 (client supplies paint)**  
> Reason: maximum transparency, no brand disputes, price is honest  
> PEIN-003 as a secondary "full service" option for clients who want artisan to handle everything  
> Price premium: 60 − 35 = 25 MAD/m² over PEIN-002 — broadly consistent with ~15 MAD/m² material + 10 MAD/m² artisan procurement service

**➡ Human decision: _______**  
**➡ Approved rate: _______ MAD/m²**  
**➡ Paint model decision: PRIMARY = PEIN-002 / PEIN-003 / BOTH?  _______**

---

### PEIN-004 — Ceiling Standard Repaint

| Field | Value |
|-------|-------|
| **Market range** | 20–80 MAD/m² (ambiguity resolved below) |
| **Recommended candidate** | **45 MAD/m² all-in (with minor prep)** |
| **Candidate options** | 30 / 35 / 40 / 45 / 50 MAD/m² |
| **Architecture** | Per ceiling m² |
| **Unit** | MAD/ceiling m² = MAD/floor m² |
| **Measurement** | PAINTED_SURFACE_M2 (ceiling = floor area of room) |

**Two possible contracts:**

| | Contract A: READY_CEILING | Contract B: STANDARD_MOROCCAN_CEILING |
|--|---------------------------|---------------------------------------|
| Scope | No enduit, stable surface, repaint only | Local enduit lissage + repaint |
| Candidate price (MO only) | 25–35 MAD/m² | 35–50 MAD/m² |
| Candidate price (all-in) | 30–40 MAD/m² | 45–60 MAD/m² |
| Honesty | For already-finished ceilings | For typical Moroccan béton brut |
| Recommendation | Secondary use case | **PRIMARY for V1** |

**Evidence conflict resolution:**
- Mano.ma general guide: 20–35 MAD/m² MO (minimal scope)
- Mano.ma ceiling-specific guide: 40–80 MAD/m² MO (professional scope with enduit)
- Resolution: 40–80 MO professional scope = what a real Moroccan ceiling job costs honestly

**➡ Human decision: _______**  
**➡ Approved rate: _______ MAD/m²**  
**➡ Contract: A (ready only) / B (with minor prep) / BOTH? _______**

---

### PEIN-005 — Interior Walls + Minor Preparation

| Field | Value |
|-------|-------|
| **Market range** | 60–110 MAD/m² all-in |
| **Recommended candidate** | **45 MAD/m² labour** / **75 MAD/m² all-in** |
| **Candidate options (labour)** | 40 / 45 / 50 / 55 MAD/m² |
| **Architecture** | Per painted m², labour + paint + minor prep included |
| **Unit** | MAD/painted m² |
| **Paint policy** | ARTISAN_SUPPLIED_STANDARD |
| **Measurement** | PAINTED_SURFACE_M2 |
| **Confidence** | MEDIUM |

**Minor preparation contract — INCLUDED at no extra charge:**
- ✅ Rebouchage: holes up to 3cm diameter
- ✅ Local filler: cracks up to 3mm width, ≤50cm length
- ✅ Light sanding of entire surface
- ✅ Local enduit on ≤20% of wall surface
- ✅ Primer + 2 coats standard paint

**Escape to quote if:**
- ❌ >20% of surface requires enduit
- ❌ Cracks needing V-cut or structural filler
- ❌ Peeling >25% of surface
- ❌ Active moisture or mold

| Artisan economics | 45 MAD/m² × 40m²/day = 1,800 MAD/day gross | After 15% commission: 1,530 MAD/day |
|---|---|---|

**➡ Human decision: _______**  
**➡ Approved labour rate: _______ MAD/m²**  
**➡ Approved all-in rate: _______ MAD/m²**

---

### PEIN-006 — Full Standard Room (walls + ceiling)

| Field | Value |
|-------|-------|
| **Market range** | 1,200–2,800 MAD per room |
| **Recommended candidate** | **1,800 MAD** |
| **Candidate options** | 1,500 / 1,800 / 2,000 / 2,200 / 2,500 MAD |
| **Architecture** | CONDITIONAL_FIXED per room |
| **Unit** | MAD/room |
| **Condition** | Room 15–25m² floor area, READY_TO_PAINT, standard paint |
| **Paint policy** | ARTISAN_SUPPLIED_STANDARD |
| **Ceiling included** | YES |
| **Confidence** | MEDIUM |

**Standard room definition:**
- Floor area: 15–25m²
- Ceiling height: 2.70m
- Painted walls: ~45–65m²
- Ceiling: 15–25m²
- Total painted: ~60–90m²
- Condition: READY_TO_PAINT
- Property: EMPTY or LIGHT_FURNITURE

**Architecture recommendation:**
- CONDITIONAL_FIXED: room must be 15–25m² floor. Outside this range → per-m² pricing applies.

**Calibration cross-check:**
- At 1,800 MAD / 75m² total painted ≈ 24 MAD/m² effective
- At 60 MAD/m² all-in standard: 75m² × 60 = 4,500 MAD
- **Gap**: room package at 1,800 MAD is significantly below per-m² equivalent
- **Risk**: Room package may be underpriced vs artisan time (1.5+ painter-days typically)
- **Recommendation**: Consider raising to 2,200–2,500 MAD or recalibrate against per-m² rates

| Artisan economics (1,800 MAD) | After 15% commission: 1,530 MAD / ~1.5 days = 1,020 MAD/day | Borderline sustainable |
|---|---|---|
| Artisan economics (2,200 MAD) | After 15%: 1,870 MAD / ~1.5 days = 1,247 MAD/day | Acceptable |

**➡ Human decision: _______**  
**➡ Approved room price: _______ MAD**  
**➡ Room size condition (floor area min/max): _______m²**

---

### PEIN-008 — Enduit de Lissage (preparation only)

| Field | Value |
|-------|-------|
| **Market range** | 20–40 MAD/m² |
| **Recommended candidate** | **25 MAD/m²** |
| **Candidate options** | 20 / 25 / 30 / 35 / 40 MAD/m² |
| **Architecture** | Per painted m², add-on service |
| **Unit** | MAD/painted m² |
| **Includes material** | YES — enduit poudre/prêt à l'emploi included |
| **Passes** | 2 passes + sanding |
| **Max repair depth** | 5mm — beyond this → Maçonnerie |
| **Confidence** | MEDIUM |

**Note**: Enduit is normally bundled into PEIN-003/005 pricing. As a standalone service, it applies when:
- Client wants preparation done now, painting later
- Surface requires preparation but not painting (e.g. new construction prep)
- Add-on to labour-only PEIN-002

**Economic note**: As standalone, 25 MAD/m² × 35m²/day = 875 MAD/day gross. After commission: 744 MAD/day. Below economic threshold for standalone work. Best used as a bundled add-on.

**➡ Human decision: _______**  
**➡ Approved rate: _______ MAD/m²**  
**➡ Include material in rate: YES / NO?  _______**

---

## Paint Supply Model — Human Decision Required

| Model | Architecture | Price tier | Transparency | Risk |
|-------|-------------|------------|--------------|------|
| A: CLIENT_SUPPLIED | PEIN-002 | 30–45 MAD/m² | ⭐⭐⭐ Maximum | Client buys wrong paint |
| B: ARTISAN_SUPPLIED_STANDARD | PEIN-003 | 55–70 MAD/m² | ⭐⭐ Good if brand named | Hidden markup risk |
| C: ARTISAN_DISCLOSED_COST | PEIN-002 + separate material invoice | Labour + disclosed | ⭐⭐⭐ Maximum | Complex flow |

**➡ Recommended primary V1 model: _______**

---

## Number of Coats — Policy Decision Required

| Scenario | Standard scope | Escape |
|----------|---------------|--------|
| Normal repaint (same colour) | Primer where required + 2 coats | None |
| Dark → light colour change | Primer + 3 coats | Artisan declares at start, price adjustment required |
| Very light touch-up (PEIN-001) | As required | N/A |
| One coat only | NOT STANDARD — insufficient result | Client must explicitly accept |

**➡ Coat policy approved: _______**

---

## Services — Recommended Disposition

| Service | Recommendation | Rationale |
|---------|---------------|-----------|
| PEIN-001 Minimum project | **CALIBRATE_NOW** | Essential floor — prevents artisan underpricing small jobs |
| PEIN-002 Labour only /m² | **CALIBRATE_NOW** | Primary V1 architecture — maximum transparency |
| PEIN-003 Labour + paint /m² | **CALIBRATE_NOW** | Secondary V1 option for full-service clients |
| PEIN-004 Ceiling /m² | **CALIBRATE_NOW** | Required — ceiling commonly requested separately |
| PEIN-005 Walls + minor prep /m² | **CALIBRATE_NOW** | Required — most real walls need some prep |
| PEIN-006 Full room | **CALIBRATE_NOW** | Client-friendly package — calibrate with caution on economics |
| PEIN-008 Enduit de lissage | **CALIBRATE_NOW** | Add-on service — important for transparency |
| PEIN-007 Full apartment | DEFER | Too many variables |
| PEIN-009 Door painting | DEFER | Insufficient evidence |
| PEIN-010 Decorative | QUOTE_REQUIRED | Always |
| PEIN-011 Façade | QUOTE_REQUIRED | Always |
| PEIN-012 Heavy repair | QUOTE_REQUIRED | Always |

---

## Occupied vs Empty Policy

**Recommended policy (for human approval):**
- EMPTY_PROPERTY: standard eligible
- OCCUPIED_LIGHT: conditional — acceptable, standard rates
- OCCUPIED_HEAVY (large furniture, restricted rooms): escape to quote or same-day logistics discussion

**Surcharge**: None approved. Handle via scope qualification.

---

## Moisture/Mold Doctrine

**Mandatory escape — not negotiable:**

If client reports: humidity stains / recurring mold / active peeling from moisture:
1. STOP
2. Do not book Peinture
3. Route to Plomberie / Toiture / Maçonnerie
4. Confirm source resolved + wall dry ≥2 weeks
5. Return to Peinture

Anti-humidity paint = preventive only. Not a treatment for active water infiltration.

---

## Client Pre-Screening Questions (for estimator — not yet implemented)

1. What surface(s) to paint? (walls / ceiling / both / doors)
2. Floor area in m²?
3. Number of rooms?
4. Ceiling height? (standard 2.70m or other)
5. Wall condition: Good / Minor damage (small holes, fine cracks) / Major damage?
6. Any humidity stains, mold, or recurring peeling?
7. Same colour or colour change? Dark → light?
8. Paint already purchased?
9. Paint quality: Economy / Standard washable / Premium?
10. Property: Empty / Occupied?
11. If occupied: light furniture or heavy/difficult to move?

**Minimum questions to safely output a standardized price: Q1, Q2, Q3, Q5, Q6, Q7, Q8**

---

*All decisions remain PENDING. Human approval required before any production implementation.*
