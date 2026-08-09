# FIXEO Menuiserie — Human Price Decision Record
## Phase 7B.10.2 — Human Price Decision Freeze

**Date:** 2026-08-09  
**Status:** FROZEN — all decisions recorded  
**Based on:** Phase 7B.10 research (commit 184e154) + Phase 7B.10.1 calibration (commit 39282e9)

---

## PART 1 — PROVENANCE CHAIN

| Layer | Reference |
|-------|-----------|
| External research | Phase 7B.10 (commit 184e154) — 18 sources, 22 evidence rows |
| Calibration prep | Phase 7B.10.1 (commit 39282e9) — 5 candidate analyses, economic modelling |
| Human decision input | Phase 7B.10.2 — explicit human price decisions documented here |
| Price provenance | FIXEO_HUMAN_CALIBRATED_PILOT |
| Maturity | LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION |

**These prices are NOT:**
- Official Moroccan tariffs
- Regulated prices
- AI-generated
- ML predictions
- Statistical transaction medians
- Artisan-declared canonical prices

---

## PART 2 — APPROVED PRICE DECISIONS

### MENU_001 — Réglage porte intérieure simple

**HUMAN DECISION: APPROVED**  
**APPROVED PRICE: 300 MAD**  
**Architecture: CONDITIONAL_FIXED / PER_DOOR**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 300 MAD | 170 MAD | ✅ |
| 10% | 270 MAD | 140 MAD | ✅ |
| 15% | 255 MAD | 125 MAD | ✅ |
| 20% | 240 MAD | 110 MAD | ⚠️ Borderline at high travel |

*Tool burden: 30 MAD. Travel: low 60 / mid 100 / high 150 MAD.*

**Scope confirmed:**
- ONE interior wooden/MDF door
- Hinge adjustment, screw tightening, alignment, lubrication, minor correction
- No material reconstruction
- Travel included, basic consumables included

**Hard exclusions confirmed:**
- Lock/cylinder → SERRURERIE
- Security door, rotten wood, frame reconstruction, structural wall, full replacement

---

### MENU_001B — Réglage porte intérieure + rabotage léger

**HUMAN DECISION: APPROVED**  
**APPROVED PRICE: 350 MAD**  
**Architecture: CONDITIONAL_FIXED / PER_DOOR**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 350 MAD | 215 MAD | ✅ |
| 10% | 315 MAD | 180 MAD | ✅ |
| 15% | 297.5 MAD | 162.5 MAD | ✅ |
| 20% | 280 MAD | 145 MAD | ✅ |

**Applies only when:**
- Door structurally sound, minor rubbing correctable with limited planing
- No frame reconstruction, no major warp, no custom fabrication

---

### MENU_002 — Remplacement charnière — main d'œuvre

**HUMAN DECISION: APPROVED**  
**APPROVED LABOUR PRICE: 300 MAD (base, 1 hinge)**  
**Architecture: LABOUR_FIXED_PART_SEPARATE**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 300 MAD | 180 MAD | ✅ |
| 10% | 270 MAD | 150 MAD | ✅ |
| 15% | 255 MAD | 135 MAD | ✅ |
| 20% | 240 MAD | 120 MAD | ✅ |

*Tool burden: 20 MAD. Hardware revenue (20-120 MAD/hinge) significantly improves total job economics.*

**Hardware: SEPARATE — mandatory disclosure and client approval before purchase**

| Hardware type | Retail range | Status |
|--------------|-------------|--------|
| Standard hinge | 20-40 MAD/unit | SEPARATE |
| Soft-close hinge | 59-120 MAD/unit | SEPARATE |

**Batch rule (EXPERIMENTAL_BATCH_RULE):**
- Base: 300 MAD (1 hinge, same door)
- Each additional hinge, SAME DOOR, SAME VISIT: +50 MAD labour
- Different cabinet = new base visit

---

### MENU_003 — Remplacement coulisse tiroir — main d'œuvre

**HUMAN DECISION: APPROVED**  
**APPROVED LABOUR PRICE: 300 MAD (base, 1 drawer)**  
**Architecture: LABOUR_FIXED_PART_SEPARATE**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 300 MAD | 180 MAD | ✅ |
| 10% | 270 MAD | 150 MAD | ✅ |
| 15% | 255 MAD | 135 MAD | ✅ |
| 20% | 240 MAD | 120 MAD | ✅ |

*Tool burden: 20 MAD. Runner hardware revenue (20-99 MAD/pair) improves total job economics.*

**Hardware: SEPARATE — mandatory disclosure and client approval before purchase**

| Hardware type | Retail range | Status |
|--------------|-------------|--------|
| Standard runner pair | 20-26 MAD/pair | SEPARATE |
| Quality runner pair | 55-99 MAD/pair | SEPARATE |

**Batch rule (EXPERIMENTAL_BATCH_RULE):**
- Base: 300 MAD (1 drawer, same cabinet)
- Each additional drawer, SAME CABINET, SAME VISIT: +100 MAD labour
- Different cabinet = new base visit

---

### MENU_004A — Ajustement porte coulissante — 1 panneau

**HUMAN DECISION: APPROVED**  
**APPROVED PRICE: 300 MAD**  
**Architecture: CONDITIONAL_FIXED / FLAT_INTERVENTION**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 300 MAD | 180 MAD | ✅ |
| 10% | 270 MAD | 150 MAD | ✅ |
| 15% | 255 MAD | 135 MAD | ✅ |
| 20% | 240 MAD | 120 MAD | ✅ |

**Hardware: PART_SEPARATE if compatible roller or small component required**

**Track replacement: QUOTE_REQUIRED**

---

### MENU_004B — Ajustement système coulissant — 2+ panneaux

**HUMAN DECISION: APPROVED**  
**APPROVED PRICE: 350 MAD**  
**Architecture: CONDITIONAL_FIXED / FLAT_INTERVENTION**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 350 MAD | 230 MAD | ✅ |
| 10% | 315 MAD | 195 MAD | ✅ |
| 15% | 297.5 MAD | 177.5 MAD | ✅ |
| 20% | 280 MAD | 160 MAD | ✅ |

**Track replacement: QUOTE_REQUIRED**  
**Custom/unavailable hardware: QUOTE_REQUIRED**

---

### MENU_005 — Petite réparation meuble bois

**HUMAN DECISION: DEFERRED**  
**APPROVED PRICE: null**

**Reason:** Insufficient Moroccan external evidence + overly broad scope definition.  
Cannot anchor any price without artisan-interview ground-truth or FIXEO mission data.

**Future reopening requires:**
- Narrower taxonomy definition
- FIXEO mission data with service_sub_code
- Stronger external evidence (minimum Grade C+ with observed prices)

---

### MENU_006 — Pose porte intérieure — main d'œuvre seule

**HUMAN DECISION: APPROVED**  
**APPROVED PRICE: 500 MAD**  
**Architecture: CONDITIONAL_FIXED / PER_DOOR**

| Commission Rate | Artisan Gross | Net @mid-travel | Viable? |
|----------------|--------------|-----------------|---------|
| 0% | 500 MAD | 360 MAD | ✅ |
| 10% | 450 MAD | 310 MAD | ✅ |
| 15% | 425 MAD | 285 MAD | ✅ |
| 20% | 400 MAD | 260 MAD | ✅ |

*Tool burden: 40 MAD. All scenarios produce net ≥ 200 MAD — no floor breach at any commission rate or travel distance.*

**External evidence:** 300-700 MAD range corroborated by 2 C/C+ Moroccan sources. MEDIUM confidence — strongest evidence in this phase.

**Eligibility confirmed:**
- Client supplies door leaf
- Standard dimensions (73/83/93 cm width)
- Existing frame compatible
- No masonry modification
- Normal residential access
- No security door

**Scope includes:**
- Old door removal, hang new leaf, 2-3 hinges, alignment, minor planing, handle prep, basic strike plate, cleanup

**Hard exclusions confirmed:**
- Door supply, frame/bâti, masonry, lock/cylinder (→ SERRURERIE), non-standard dimensions, custom fabrication

---

## PART 3 — GLOBAL POLICY DECISIONS

### Menuiserie Minimum Floor

**FROZEN: 300 MAD — FIXEO_POLICY**

```
FINAL_PRICE = max(300 MAD, STANDARD_SERVICE_PRICE)
```

- NOT additive (never 300 + service price)
- NOT a separate call-out fee
- NOT a legal Moroccan tariff
- NOT a market statistic
- All 7 approved services satisfy the floor without special treatment

### Hardware Doctrine

**FROZEN: ARTISAN_SUPPLIED_PART_AT_DISCLOSED_PRICE (MODEL B)**

Mandatory sequence:
1. IDENTIFY → 2. SPECIFY → 3. STATE PRICE → 4. CLIENT APPROVAL → 5. ACQUIRE → 6. INSTALL → 7. RETURN OLD PART

No silent bundling. No silent markup.

MODEL C (bundled) = REJECTED: hardware prices vary 3× between standard and soft-close.

### Batch Rules

**STATUS: EXPERIMENTAL_BATCH_RULE — NOT universal law**

- MENU_002: +50 MAD per extra hinge, SAME DOOR, SAME VISIT only
- MENU_003: +100 MAD per extra drawer, SAME CABINET, SAME VISIT only
- Do not extrapolate to other hardware or different-system scenarios

### Geographic Policy

**FROZEN: market_scope = NATIONAL_MOROCCO, city_adjustment = null**

No city multiplier. Casablanca/Rabat differences remain evidence only.

### Time Modifiers

**FROZEN: ALL null**

urgency_modifier = null / night_modifier = null / weekend_modifier = null / holiday_modifier = null / express_modifier = null

### Target Artisan Net

**FROZEN: 150 MAD — FIXEO_POLICY**

Universal hard floor: 100 MAD. Not a legal wage. Not a market statistic.

---

## PART 4 — CUSTOM FABRICATION DOCTRINE

**FROZEN: All custom fabrication remains QUOTE_REQUIRED**

| Code | Service | Per-ml evidence | Status |
|------|---------|----------------|--------|
| MENU_007 | Porte all-in | — | QUOTE_REQUIRED |
| MENU_008 | Placard sur mesure | 2,000-6,000 MAD/ml | QUOTE_REQUIRED |
| MENU_009 | Dressing sur mesure | 2,500-7,000 MAD/ml | QUOTE_REQUIRED |
| MENU_010 | Cuisine sur mesure | 3,500-9,000 MAD/ml | QUOTE_REQUIRED |
| MENU_011 | Bibliothèque | 1,500-4,000 MAD/ml | QUOTE_REQUIRED |
| MENU_012 | Aluminium | 700-2,500 MAD/m² | DEFERRED_SPECIALIST |

Per-ml ranges = REFERENCE_EVIDENCE_ONLY. Do NOT create canonical FIXEO per-ml prices for any of the above in this phase.

---

## PART 5 — PRICE PROVENANCE DECLARATION

All approved Menuiserie prices:

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

Batch rules:

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT_BATCH_RULE
```

These are NOT: official tariffs / regulated prices / AI-generated / ML predictions / statistical medians / artisan-declared canonical prices.

---

## PART 6 — REQUIRED UI DISCLAIMER (documented only — not deployed)

```
Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.
```

Status: **DOCUMENTED_ONLY — not deployed in this phase**

---

## PART 7 — CROSS-MÉTIER BOUNDARY RECORD

| Work Type | Routes to |
|-----------|----------|
| Lock/cylinder/security mechanism | SERRURERIE |
| Flat-pack furniture assembly | BRICOLAGE |
| Paint/varnish/finish | PEINTURE |
| Glass/mirror panel | VITRERIE |
| Structural wall/frame | MAÇONNERIE |
| Aluminium fabrication | DEFERRED SPECIALIST |
| Custom wood fabrication | MENUISERIE QUOTE_REQUIRED |
| Electrical (motorized systems) | ELECTRICITE |

Rule: **No standardized repair may absorb specialist work.**

---

## PART 8 — PHASE STATUS

**V0.1 research:** IMMUTABLE — not modified  
**V0.2 calibration:** IMMUTABLE — retains original PENDING candidate recommendations  
**V0.3 freeze:** This document + registry.v0.3.json + calibration.v0.3.json + fair-price-policy.v0.3.md

**Next steps:**
1. Human approval of artisan interview data (future V0.4 if needed)
2. FIXEO Estimation V1 consolidation/design across all 8 métiers — awaiting all métier human freezes
3. No new métier in this phase
4. No estimator implementation
5. No deployment
