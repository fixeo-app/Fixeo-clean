# NETTOYAGE — Fair Price Policy
## Phase 7B.8.2 — CANONICAL FREEZE

**Status**: HUMAN DECISION FREEZE — CANONICAL  
**Production ready**: FALSE  
**Date**: 2026-08-09  

---

## 1. Worker Fairness

### 1.1 PER_CLEANER_HOUR Doctrine

Every individual cleaner who delivers labour is compensated proportionally. FIXEO pricing is structured so that adding workers to a job increases total client billing — team of 2 = 2× the cleaner-hours billed.

**Formula**:
```
TOTAL_CLEANER_HOURS = number_of_cleaners × hours_per_cleaner
CALCULATED_PRICE    = TOTAL_CLEANER_HOURS × 65 MAD
FINAL_PRICE         = max(200 MAD, CALCULATED_PRICE)
```

**Anti-exploitation rule**: FIXEO must never structure pricing such that adding a second cleaner increases work delivered but concentrates revenue such that per-cleaner income falls below the floor.

### 1.2 Net Cleaner-Hour Floor

**Policy floor**: 40 MAD / cleaner-hour net  
**Classification**: FIXEO_POLICY — not a Moroccan legal minimum wage, not a statistically established market floor

**Floor verification at approved rate (65 MAD/ch, 20% commission)**:

| Scenario | Billed | Net after 20% + 25 MAD travel | Net/ch | Floor pass? |
|---|---|---|---|---|
| 1 cleaner × 3h (minimum 200) | 200 MAD | 135 MAD | 45.0 MAD/ch | ✅ |
| 1 cleaner × 4h | 260 MAD | 183 MAD | 45.8 MAD/ch | ✅ |
| 1 cleaner × 6h | 390 MAD | 287 MAD | 47.8 MAD/ch | ✅ |
| 2 cleaners × 3h (6ch) | 390 MAD | 287 MAD | 47.8 MAD/ch | ✅ |
| 2 cleaners × 4h (8ch) | 520 MAD | 391 MAD | 48.9 MAD/ch | ✅ |

**All approved service economics at 20% commission clear the 40 MAD/ch floor.**

### 1.3 Multi-Worker Team Economics

For NET-004 (grand nettoyage, 600 MAD, 2 cleaners × 3.5h = 7 ch):
- After 20% commission: 480 MAD
- After 50 MAD consumables + 25 MAD travel: **405 MAD artisan pool**
- Per cleaner-hour: **57.9 MAD/ch** ✅

FIXEO does not dictate internal team payment structure, but the economics must support equitable distribution between lead artisan and team members.

### 1.4 Minimum Visit Protection

The 200 MAD minimum visit prevents artisans from being economically penalized by very short urban visits with high travel overhead. At 200 MAD minimum / 3h minimum:
- Net after 20% + 25 MAD travel = **135 MAD**
- Effective net/ch = **45 MAD/ch** — above the 40 MAD floor

### 1.5 Post-Construction Worker Economics

At 18 MAD/m², 20% commission, 350 MAD fixed costs (travel, consumables, industrial equipment amortization):

| Area | Final | Net pool | Total ch | Net/ch | Floor pass? |
|---|---|---|---|---|---|
| 40 m² | 1,000 MAD | 450 MAD | 8 ch | 56.3 MAD/ch | ✅ |
| 60 m² | 1,080 MAD | 514 MAD | 12 ch | 42.8 MAD/ch | ✅ |
| 80 m² | 1,440 MAD | 802 MAD | 16 ch | 50.1 MAD/ch | ✅ |
| 100 m² | 1,800 MAD | 1,090 MAD | 20 ch | 54.5 MAD/ch | ✅ |

**LOW confidence caveat**: These are modelled estimates only. Field verification with post-construction artisans required before production.

---

## 2. Client Fairness

### 2.1 Mandatory Pre-Booking Disclosure

Before confirming any booking, clients must see:

**Standard cleaning (NET-001/002)**:
- Number of cleaners assigned
- Estimated duration
- Total cleaner-hours
- Total calculated price
- Whether minimum floor applies
- ⚠️ Products and equipment must be supplied by the client (MODEL A)
- Included scope / what is NOT included

**Specialist services (NET-004/010/011/013/014/030)**:
- Service description and reference property (where applicable)
- Products and equipment: ARTISAN_SUPPLIED_INCLUDED
- Included scope / explicit exclusions

### 2.2 Anti-Double-Charge Rule

```
FINAL_STANDARD_CLEANING_PRICE = max(200, 65 × total_cleaner_hours)
```

The 200 MAD minimum is a **floor**, never an additive fee on top of hourly billing.

**Forbidden pattern**: `200 MAD + (65 × cleaner-hours)` — NEVER.

### 2.3 All-In Pricing

All FIXEO nettoyage prices are **all-in** — travel is included. No post-delivery surprise charges for:
- Transport / déplacement
- Produits (for MODEL C services)
- Équipement (for Model C services)
- Zone géographique (within FIXEO coverage)

### 2.4 Scope Clarity

Standard cleaning contracts are bounded by the explicit scope in `calibration.v0.3.json → scope_contracts → standard_cleaning_scope`. Excluded services (sofa extraction, mattress cleaning, post-construction) must NEVER be silently absorbed into NET-001/002 billing.

### 2.5 Mattress Transparency

Consumer-facing price covers **both faces** of the mattress. No ambiguity about single-face vs full mattress. NET-013 = 250 MAD (simple, both faces), NET-014 = 300 MAD (double, both faces).

### 2.6 Client-Facing Disclaimer

*(Document only — not deployed):*  
> *Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.*

---

## 3. Complexity and HORS PÉRIMÈTRE Policy

### 3.1 Approved Complexity Levels

| Level | Definition | Action |
|---|---|---|
| STANDARD | Normal residential soiling | Standard price applies |
| HEAVY | Materially abnormal dirt — declared at booking | Pre-agreed scope adjustment with client consent |
| POST_CONSTRUCTION | Construction dust/residue, within NET-030 standard scope | NET-030 pricing (18 MAD/m², min 1000 MAD) |
| SPECIALIST | Structural mold, biohazard, sewage, infestation, fire/smoke | ROUTE_TO_SPECIALIST — no FIXEO artisan |

### 3.2 On-Site Discovery Protocol

If a complexity condition is discovered on-site that was NOT pre-declared at booking:

1. **STOP** — do not proceed with non-contracted scope
2. **IDENTIFY** the specific objective condition
3. **EXPLAIN** clearly to the client what was found
4. **DECLARE** it is outside the FIXEO standardized price
5. **STATE** revised scope and/or quote requirement
6. **OBTAIN** explicit client consent
7. **CONTINUE** only after approval — or complete original scope only

**No standardized price may silently increase at point of delivery.**

### 3.3 No Unauthorized Multipliers

Artisan-controlled multipliers (1.2×, 1.5×, 2×, etc.) are **not permitted** without:
- Separate dedicated research phase
- Economic calibration
- Explicit human approval

This policy applies to all FIXEO nettoyage services.

---

## 4. Products and Equipment Policy

### MODEL A — Standard Residential Cleaning

**Applies to**: NET-001, NET-002

| Item | Policy |
|---|---|
| Products | CLIENT_SUPPLIED |
| Basic equipment (mop, bucket, vacuum, broom) | CLIENT_SUPPLIED |
| Travel | INCLUDED in price |

**Disclosure requirement**: Client must be informed **before booking** that products and equipment are their responsibility. If not available, booking should redirect to Model C or advise the client explicitly.

### MODEL C — Professional/Specialist Cleaning

**Applies to**: NET-004, NET-010, NET-011, NET-013, NET-014, NET-030

| Item | Policy |
|---|---|
| Products | ARTISAN_SUPPLIED_INCLUDED |
| Specialist equipment | ARTISAN_SUPPLIED_INCLUDED |
| Travel | INCLUDED in price |

No separate billing for products or equipment on MODEL C services. They are embedded in the fixed price.

---

## 5. Métier Boundary Policy

| Situation | Correct routing |
|---|---|
| Broken/cracked glass | → VITRERIE |
| Painted wall needs repainting | → PEINTURE |
| Water leak or plumbing issue | → PLOMBERIE |
| Moving furniture | → DEMENAGEMENT |
| Active pest infestation | → SPECIALIST PEST CONTROL |
| Structural mold (> surface layer) | → SPECIALIST REMEDIATION |
| Fire/smoke damage | → SPECIALIST |
| Sewage/contaminated water | → SPECIALIST |
| Biohazard of any kind | → SPECIALIST (ABSOLUTE EXCLUSION) |
| Industrial/HACCP cleaning | → EXCLUDED from FIXEO |
| Window repair (not cleaning) | → VITRERIE |
| Gardening/outdoor greenery | → JARDINAGE |

---

## 6. Geographic Policy

**Market scope**: NATIONAL_MOROCCO  
**City adjustments**: null — no city multipliers approved  
**City evidence**: Casablanca-specific data in V0.1 sources is evidence only — does not produce pricing multipliers

---

## 7. Modifier Policy

All modifiers are null and remain null for this phase:

| Modifier | Status |
|---|---|
| urgency_modifier | null |
| night_modifier | null |
| weekend_modifier | null |
| holiday_modifier | null |
| express_modifier | null |
| recurring_modifier | null |

No time-based or frequency-based modifier is approved without a separate dedicated research + calibration + human-approval cycle.

---

## 8. Post-Construction Special Policy

Post-construction cleaning is **not** an extension of residential cleaning. It is a distinct economic category requiring:
- Industrial equipment (not residential)
- Professional construction-grade products
- Team deployment (typically 2+ workers)
- Per-m² pricing with minimum project floor

**The legacy FIXEO price (300–700 MAD, classified LEGACY_TOO_LOW in V0.1)** must not be used.

**Approved**: 18 MAD/m² with 1,000 MAD minimum project price.

**Escape conditions are mandatory**. Any condition beyond standard light post-construction scope must not silently increase the 18 MAD/m² rate — it must trigger QUOTE_REQUIRED or ROUTE_TO_SPECIALIST.

---

## 9. Upholstery/Textile Artisan Qualification Policy

Sofa (NET-010/011) and mattress (NET-013/014) cleaning requires:
- Professional injection-extraction equipment or equivalent steam equipment
- Specialist textile-cleaning products
- Artisan training in upholstery cleaning

A standard ménage artisan without injection-extraction equipment must **not** be matched to textile cleaning jobs. These are distinct artisan specializations.

---

*This policy document is canonical for Phase 7B.8.2. All policies are research/calibration artifacts only — not deployed. production_ready = false.*
