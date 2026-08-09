# FIXEO Peinture — Fair Price Policy Framework
## Phase 7B.9.1 | FOR HUMAN REVIEW — NOT APPROVED

---

## 1. Core Fair Price Principles for Peinture

### 1.1 Measurement Transparency

The unit "m²" in painting can mean three different things. FIXEO must be explicit:

| Term | Meaning | When used |
|------|---------|-----------|
| `painted_wall_surface_m2` | Actual painted area of walls | Wall pricing |
| `ceiling_m2` | Ceiling area = floor area of room | Ceiling pricing |
| `floor_area_m2` | Client-familiar floor area | Input only — converted internally |

**Rule**: The estimator receives `floor_area_m2` from the client. It must convert to `painted_surface_m2` internally. It must never present floor area as painted surface in a price output.

### 1.2 Paint Responsibility

The quote must explicitly state:

```
Paint supplied by: CLIENT / ARTISAN (standard brand)
Paint brand class: [specific]
Number of coats: [specific]
```

Silent assumptions about paint are a primary source of client-artisan disputes.

### 1.3 Coat Count Transparency

The scope must state: "2 finish coats + primer where required."

Never advertise a "peinture" service that could deliver only 1 coat as a standard result.

Exception: PEIN-001 minimum project (retouche) where 1 coat over same colour is acceptable.

### 1.4 Preparation Transparency

The scope must distinguish:

- **INCLUDED**: small holes, fine cracks ≤2mm, light sanding
- **QUOTED SEPARATELY**: larger preparation (PEIN-005 or PEIN-008)
- **HORS PÉRIMÈTRE**: active moisture, structural cracks, heavy plaster damage

This prevents the "mur mauvais donc supplément" surprise after work begins.

### 1.5 Minimum Project Transparency

Client must be informed at booking:

> "The minimum charge for a painting intervention is [MINIMUM] MAD.  
> For surfaces larger than [X]m², pricing is [RATE] MAD/m²."

Never apply a minimum silently after the client expects a per-m² rate.

---

## 2. Artisan Fairness Framework

### 2.1 Painter Economic Floor

| Scenario | Painter daily gross | After 15% commission | Assessment |
|----------|-------------------|----------------------|------------|
| PEIN-002 at 35 MAD × 60m²/day | 2,100 MAD | 1,785 MAD | ✅ Sustainable |
| PEIN-004 at 45 MAD × 50m²/day | 2,250 MAD | 1,912 MAD | ✅ Sustainable |
| PEIN-005 at 45 MO × 40m²/day | 1,800 MAD | 1,530 MAD | ✅ Acceptable |
| PEIN-006 room at 1,800 / 1.5 days | 1,200 MAD/day | 1,020 MAD/day | ⚠️ Borderline |
| PEIN-008 enduit at 25 × 35m²/day | 875 MAD | 744 MAD | ⚠️ Only as add-on |

**FIXEO_POLICY target**: Artisan net after commission should not fall below 800–900 MAD/day for standard residential painting work.

### 2.2 Incentive Alignment

The per-m² pricing model (PEIN-002, PEIN-003, PEIN-005) correctly aligns artisan incentives:
- More painted surface = more revenue
- Proper preparation is in-scope — no incentive to skip it
- Material quality (PEIN-003) should be verified via brand disclosure

**Risk of PEIN-006 room package**: Fixed price incentivizes artisan to rush. Monitor and calibrate above the minimum sustainable rate.

### 2.3 Multi-Coat Compliance

At 35 MAD/m² labour for 2 coats, effective labour per coat = ~17.5 MAD/m². This is economically plausible only at reasonable productivity (30 m²/coat/hour). Below this, artisans may be incentivized to apply thinner or fewer coats.

**Mitigation**: FIXEO booking contract should state coat count explicitly. Client inspection right before final payment.

---

## 3. Complexity Escape Protocol

### 3.1 Surface Condition Triggers

```
READY_TO_PAINT
  → Standard PEIN-002/003/004/006 eligible

MINOR_PREPARATION (small holes, fine cracks, <20% needs enduit)
  → PEIN-005 eligible

MODERATE_REPAIR (peeling >25%, extensive cracks, old unstable coating)
  → QUOTE_REQUIRED
  → Add PEIN-008 enduit as explicit add-on
  → Or refer to full assessment

HEAVY_REPAIR (major plaster damage, deep cracks)
  → QUOTE_REQUIRED
  → May require Maçonnerie involvement

MOISTURE_OR_MOLD (active or recent)
  → HORS PÉRIMÈTRE PEINTURE
  → MANDATORY ROUTING: Plomberie / Toiture / Maçonnerie
  → Return to Peinture only after resolution confirmed

STRUCTURAL_DAMAGE
  → HORS PÉRIMÈTRE PEINTURE
  → MANDATORY ROUTING: Maçonnerie + engineering assessment
```

### 3.2 Artisan Stop-Work Conditions

The artisan contract must require artisan to STOP and contact FIXEO if they discover on-site:

1. Active moisture seeping through walls or ceiling
2. Black mold (significant surface area)
3. Structural cracks (width >5mm, horizontal, or active)
4. Unstable plaster with high risk of collapse
5. Suspected asbestos or lead (older buildings, pre-1990)
6. Scope substantially different from client description

---

## 4. Cross-Métier Boundaries

| Trigger found during painting | FIXEO action |
|-------------------------------|-------------|
| Active pipe leak | STOP → Plomberie |
| Roof infiltration | STOP → Toiture |
| Structural crack | STOP → Maçonnerie |
| Wood rot before painting | STOP → Menuiserie |
| Electrical work needed | STOP → Electricité |
| Mold requiring specialist treatment | STOP → Maçonnerie or specialist |

---

## 5. Anti-Fraud Protections

| Risk | Protection |
|------|-----------|
| Artisan uses cheap unlabelled paint | Require named brand class in confirmation |
| Artisan applies only 1 coat | Client inspection before final payment |
| Artisan declares "bad wall" on-site to inflate price | Defined READY_TO_PAINT contract with objective criteria |
| Artisan measures floor area as painted area | FIXEO estimator controls measurement — client never supplies painted m² directly |
| Paint billed separately after all-in quote | Clear contract: PEIN-003 includes standard paint. Upgrade requires prior approval. |

---

## 6. Client Communication Standards

### 6.1 Estimator Output Requirements

Every Peinture quote must display:

```
Surface à peindre: [X]m² surface peinte
(Calculé depuis votre surface plancher de [Y]m²)

Peinture: [FOURNIE PAR VOUS / PAR ARTISAN — marque standard]
Nombre de couches: [PRIMAIRE SELON BESOIN + 2 COUCHES DE FINITION]
Préparation incluse: [PETITS TROUS, FISSURES FINES, PONÇAGE LÉGER]
Ce qui n'est PAS inclus: [ENDUIT COMPLET, RÉPARATION MAJEURE, ETC]
```

### 6.2 Price Confirmation Before Work

Before artisan starts:
1. Client and artisan confirm surface measurement together
2. Artisan confirms surface condition matches booking description
3. If surface condition worse → STOP → inform FIXEO → updated quote required
4. No unilateral price changes by artisan on-site

---

## 7. Services Summary — Final Disposition

| Code | Service | Status | Architecture |
|------|---------|--------|-------------|
| PEIN-001 | Minimum project | CALIBRATE_NOW | min(800, m²×rate) |
| PEIN-002 | Walls labour-only /m² | CALIBRATE_NOW | PER_PAINTED_M2, CLIENT_PAINT |
| PEIN-003 | Walls labour+paint /m² | CALIBRATE_NOW | PER_PAINTED_M2, ARTISAN_PAINT |
| PEIN-004 | Ceiling /m² | CALIBRATE_NOW | PER_CEILING_M2 |
| PEIN-005 | Walls + minor prep /m² | CALIBRATE_NOW | PER_PAINTED_M2_WITH_PREP |
| PEIN-006 | Full room | CALIBRATE_NOW ⚠️ | CONDITIONAL_FIXED (verify economics) |
| PEIN-007 | Full apartment | DEFER | — |
| PEIN-008 | Enduit de lissage /m² | CALIBRATE_NOW | PER_PAINTED_M2_PREP_ONLY |
| PEIN-009 | Door painting | DEFER | — |
| PEIN-010 | Decorative/tadelakt | QUOTE_REQUIRED | — |
| PEIN-011 | Façade | QUOTE_REQUIRED | — |
| PEIN-012 | Heavy repair | QUOTE_REQUIRED | — |

---

*This document is for human calibration review only. No prices are approved.*  
*Status: PENDING HUMAN DECISION*
