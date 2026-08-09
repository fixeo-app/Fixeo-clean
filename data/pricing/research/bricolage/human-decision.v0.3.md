# FIXEO Bricolage — Human Price Decision Record
## Phase 7B.7.2 — Human Price Decision Freeze

> This document is the permanent provenance record for the six approved FIXEO Bricolage pilot prices.
> All decisions were made explicitly by the FIXEO product owner on 2026-08-09.
> No AI, no ML, no statistical model determined these prices.
> All prices: `production_ready: false`. Required disclaimer applies to all.

---

## STATUS

```
human_decision:   APPROVED (6 services)
production_ready: false
price_provenance: FIXEO_HUMAN_CALIBRATED_PILOT
maturity:         LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
approved_date:    2026-08-09
phase:            7B.7.2
```

---

## PART 1 — RESEARCH LINEAGE

| Artifact Version | Commit | Contents |
|---|---|---|
| V0.1 — Research | `41583c1` | 15 external sources, 17 service codes, market anchors, exclusions |
| V0.2 — Calibration | `8bd5498` | 6 candidates × 4 scenarios, 8 basket simulations, 3 architecture models |
| **V0.3 — Decision** | *(this commit)* | **6 approved prices, final scope contracts, frozen policy** |

V0.1 and V0.2 artifacts are **immutable**. This version extends; it does not overwrite.

---

## PART 2 — SIX APPROVED PRICES

### 2.1 BRIC-001 — Minimum Visit / Forfait Déplacement Bricolage

| Field | Value |
|---|---|
| **APPROVED PRICE** | **200 MAD** |
| Architecture | MINIMUM_VISIT_PRICE |
| Unit | UNIT_FLAT_INTERVENTION |
| Human decision | APPROVED |
| Date | 2026-08-09 |

**Approved scope contract:**
- One round-trip travel included
- Up to 30 minutes on-site
- One micro-task or a small group of micro-tasks fitting inside included duration
- Standard basic screws/plugs included where compatible with standard fixing
- Major hardware client-supplied or separately disclosed
- Never stacked on top of a standardized task price (anti-double-charge rule)

**Anti-double-charge rule (FROZEN):**
> If a standardized FIXEO task (BRIC-010, BRIC-020, BRIC-030) is booked, BRIC-001 is NOT additionally charged. The standardized task price embeds travel.

**Commission verification:**

| Commission | Artisan gross | Net before fuel | Net after MID (40 MAD) | Above 100 floor | Above 120 target |
|---|---|---|---|---|---|
| 0% | 200 | 200 | 160 | ✅ | ✅ |
| 10% | 180 | 180 | 140 | ✅ | ✅ |
| 15% | 170 | 170 | 130 | ✅ | ✅ |
| **20%** | **160** | **160** | **120** | **✅** | **✅** |

**Worst case:** 120 MAD net @ 20% commission + MID 40 MAD fuel. **ABOVE 100 MAD hard floor ✅**

---

### 2.2 BRIC-002 — Bricolage Hourly Labour

| Field | Value |
|---|---|
| **APPROVED RATE** | **150 MAD / hour** |
| **MINIMUM BILLING** | **2 hours** |
| **MINIMUM PAYABLE** | **300 MAD** |
| Architecture | HOURLY |
| Unit | UNIT_PER_HOUR |
| Human decision | APPROVED |
| Date | 2026-08-09 |

**Approved use cases:**
- Open-ended work where duration is uncertain
- Heterogeneous tasks not fitting a single standardized service
- Medium or large furniture assembly where fixed scope is unreliable
- Work expected to materially exceed the minimum-visit contract

**Client protections:**
- Artisan must provide estimated duration range before work begins
- No silent time extension — client notified before any additional hour is billed
- Billing after 2h minimum: actual time rounded to nearest 30 minutes

**Commission verification (2h minimum = 300 MAD):**

| Commission | Artisan gross | Net before fuel | Net after MID (40 MAD) | Above 100 floor | Above 120 target |
|---|---|---|---|---|---|
| 0% | 300 | 300 | 260 | ✅ | ✅ |
| 10% | 270 | 270 | 230 | ✅ | ✅ |
| 15% | 255 | 255 | 215 | ✅ | ✅ |
| **20%** | **240** | **240** | **200** | **✅** | **✅** |

**Worst case:** 200 MAD net @ 20% commission + MID 40 MAD fuel for 2h minimum. **ABOVE 100 MAD hard floor ✅**

---

### 2.3 BRIC-003 — Bricolage Half-Day (Demi-journée)

| Field | Value |
|---|---|
| **APPROVED PRICE** | **400 MAD** |
| Architecture | HALF_DAY |
| Unit | UNIT_FLAT_HALF_DAY |
| Human decision | APPROVED |
| Date | 2026-08-09 |

**Approved scope contract:**
- Approximately 3–4 hours on-site
- One journey included (travel)
- Mixed small handyman jobs allowed
- Major hardware client-supplied
- Specialist métier tasks excluded — routes to specialist (ELECTRICITE, PLOMBERIE, etc.)
- If expected work exceeds 4 hours: STOP → explain → provide continuation estimate → obtain client approval → continue only after approval

**Primary use case:** Multiple heterogeneous tasks where individual task pricing would create unreasonable repeated travel-inclusive charges.

**Commission verification:**

| Commission | Artisan gross | Net before fuel | Net after MID (40 MAD) | Above 100 floor | Above 120 target |
|---|---|---|---|---|---|
| 0% | 400 | 400 | 360 | ✅ | ✅ |
| 10% | 360 | 360 | 320 | ✅ | ✅ |
| 15% | 340 | 340 | 300 | ✅ | ✅ |
| **20%** | **320** | **320** | **280** | **✅** | **✅** |

**Worst case:** 280 MAD net @ 20% commission + MID 40 MAD fuel for 3–4h slot. **ABOVE 100 MAD hard floor ✅**

---

### 2.4 BRIC-010 — Small Furniture Assembly

| Field | Value |
|---|---|
| **APPROVED PRICE** | **200 MAD** |
| Architecture | PER_ITEM_FORFAIT |
| Unit | UNIT_PER_ITEM |
| Human decision | APPROVED |
| Date | 2026-08-09 |

**Approved scope contract:**
- One small flat-pack furniture item
- Typically one package
- No complex wardrobe system
- No structural or custom carpentry
- Expected assembly duration approximately ≤45 minutes
- Furniture client-supplied
- Travel included
- Escape to HOURLY or DEVIS when actual complexity materially exceeds this contract

**Coherence check:** 200 MAD (BRIC-010) ≥ 200 MAD (BRIC-001 minimum visit) → COHERENT. BRIC-001 is NOT additionally charged.

**Commission verification:**

| Commission | Artisan gross | Net before fuel | Net after MID (40 MAD) | Above 100 floor | Above 120 target |
|---|---|---|---|---|---|
| 0% | 200 | 200 | 160 | ✅ | ✅ |
| 10% | 180 | 180 | 140 | ✅ | ✅ |
| 15% | 170 | 170 | 130 | ✅ | ✅ |
| **20%** | **160** | **160** | **120** | **✅** | **✅** |

**Worst case:** 120 MAD net @ 20% commission + MID 40 MAD fuel. **ABOVE 100 MAD hard floor ✅**

---

### 2.5 BRIC-020 — Standard Shelf Installation

| Field | Value |
|---|---|
| **APPROVED PRICE** | **200 MAD** |
| Architecture | PER_ITEM_FORFAIT |
| Unit | UNIT_PER_ITEM |
| Human decision | APPROVED |
| Date | 2026-08-09 |
| Evidence note | LOW confidence (2 sources) — price research-informed, requires future transaction validation |

**Approved scope contract:**
- One shelf
- Shelf and brackets client-supplied
- Standard eligible substrate
- Normal accessible working height
- Drilling, levelling, fixing
- Standard compatible anchors/screws included for normal masonry fixing
- Travel included
- BRIC-001 minimum visit is NOT additionally charged

**Substrate policy:**
- Standard eligible: standard masonry, brick, ordinary compatible concrete
- Conditional (HORS PÉRIMÈTRE workflow): reinforced concrete, hollow brick, plasterboard/drywall, tile
- Quote required: marble, stone, tadelakt/pisé
- Specialist required: structural wall, load-bearing uncertainty

**Specialty fixing hardware** (Molly/toggle/chemical anchors): PART_SEPARATE_WITH_DISCLOSURE when required. No silent markup.

**Coherence check:** 200 MAD (BRIC-020) ≥ 200 MAD (BRIC-001 minimum visit) → COHERENT.

**Commission verification:**

| Commission | Artisan gross | Net before fuel | Net after MID (40 MAD) | Above 100 floor | Above 120 target |
|---|---|---|---|---|---|
| 0% | 200 | 200 | 160 | ✅ | ✅ |
| 10% | 180 | 180 | 140 | ✅ | ✅ |
| 15% | 170 | 170 | 130 | ✅ | ✅ |
| **20%** | **160** | **160** | **120** | **✅** | **✅** |

**Worst case:** 120 MAD net @ 20% commission + MID 40 MAD fuel. **ABOVE 100 MAD hard floor ✅**

---

### 2.6 BRIC-030 — Standard TV Wall Mounting

| Field | Value |
|---|---|
| **APPROVED PRICE** | **300 MAD** |
| Architecture | CONDITIONAL_FIXED |
| Unit | UNIT_FLAT_INTERVENTION |
| Human decision | APPROVED |
| Date | 2026-08-09 |
| Strongest evidence | m3allempro.com Casablanca: 300 MAD, 89 reviews, 412 missions, bracket excluded |

**Client supplies:** TV + compatible wall bracket.

**FIXEO price includes:** Travel, drilling, standard compatible fixing hardware, bracket mounting, TV installation, levelling, basic stability check, simple surface cable tidy only.

**Standard eligibility:** Residential TV ≤65 inches, ≤40 kg. Fixed or simple tilt bracket. Compatible standard wall/substrate. Normal safe working height.

**Explicit exclusions:**
- Electrical socket relocation → ELECTRICITE
- Electrical wiring modification → ELECTRICITE
- In-wall cable concealment
- Full-motion/complex bracket when substantially more work required
- TV >65" or >40kg (second worker needed)
- Marble or fragile stone substrate
- Uncertain structural wall
- Specialist chemical anchoring unless separately disclosed
- Bracket supply (client-supplied)

**Métier boundary — ABSOLUTE:** Any electrical modification routes to ELECTRICITE without exception.

**Commission verification:**

| Commission | Artisan gross | Net before fuel | Net after MID (40 MAD) | Above 100 floor | Above 120 target |
|---|---|---|---|---|---|
| 0% | 300 | 300 | 260 | ✅ | ✅ |
| 10% | 270 | 270 | 230 | ✅ | ✅ |
| 15% | 255 | 255 | 215 | ✅ | ✅ |
| **20%** | **240** | **240** | **200** | **✅** | **✅** |

**Worst case:** 200 MAD net @ 20% commission + MID 40 MAD fuel for ~1h precision job. **ABOVE 100 MAD hard floor ✅**

---

## PART 3 — MULTI-TASK ARCHITECTURE DECISION

**Approved canonical architecture (FROZEN):**

| Scenario | Situation | Architecture | Price |
|---|---|---|---|
| A | Micro-task only | MINIMUM_VISIT_PRICE | 200 MAD (BRIC-001) |
| B | One standardized task | PER_ITEM_FORFAIT | Standardized price — no BRIC-001 on top |
| C | Open-ended / variable scope | HOURLY | 150 MAD/h, 2h min (BRIC-002) |
| D | Multiple mixed tasks, ~3–4h | HALF_DAY | 400 MAD (BRIC-003) |
| E | Multiple homogeneous items | **DEFERRED** | No universal percentage approved |

**65% additional-item rate from V0.2:** RESEARCH_EXPERIMENTAL_ONLY. NOT canonical FIXEO pricing. Requires transaction data or dedicated batch-calibration phase before any approval.

---

## PART 4 — DEFERRED SERVICES

| Code | Service | Status |
|---|---|---|
| BRIC-011 | Medium furniture assembly | DEFERRED_FOR_MORE_EVIDENCE — use HOURLY interim |
| BRIC-012 | Large furniture / wardrobe | DEFERRED — HOURLY or QUOTE_REQUIRED |
| BRIC-021 | Curtain rod installation | DEFERRED — insufficient evidence |
| BRIC-022 | Mirror mounting | DEFERRED — insufficient evidence / substrate risk |
| BRIC-023 | Frame / picture mounting | NO_STANDALONE_PRICE — falls under BRIC-001 for small hooks |
| BRIC-031 | Complex TV mounting | QUOTE_REQUIRED permanently |
| BRIC-040 | Bathroom accessories | DEFERRED |
| BRIC-050 | Door adjustment | DEFERRED |
| BRIC-051 | Interior handle replacement | DEFERRED |
| BRIC-060 | Small finishes / silicone | DEFERRED |
| BRIC-070 | Multi-task visit | DEFERRED — multi-task architecture defined via scenarios A–E above |

---

## PART 5 — FROZEN POLICIES

### Material / Hardware Policy
- Normal screws and wall plugs for compatible standard fixing: INCLUDED
- All major hardware: CLIENT_SUPPLIED
- Specialty anchors (Molly, toggle, chemical): PART_SEPARATE_WITH_DISCLOSURE
- No silent hardware markup

### Geographic Policy
- `market_scope = NATIONAL_MOROCCO`
- `city_adjustment = null`
- No city multipliers approved

### Urgency / Time Modifiers
- `urgency_modifier = null`
- `night_modifier = null`
- `weekend_modifier = null`
- `holiday_modifier = null`
- `express_modifier = null`

### Economic Floor Policy
- Hard floor: 100 MAD (FIXEO_POLICY, not statistically proven market fact)
- Practical target: 120 MAD
- Purpose: covers travel, tool transport, setup/cleanup, parking/access economics

### HORS PÉRIMÈTRE Workflow (all services)
1. STOP
2. IDENTIFY objective scope escape
3. EXPLAIN to client in plain language
4. DECLARE: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE revised scope and price
6. OBTAIN explicit client approval
7. CONTINUE only after approval
Original standardized price never silently increases.

### Métier Boundaries
| Métier | Rule |
|---|---|
| ELECTRICITE | Any wiring, circuit, socket modification — ABSOLUTE |
| PLOMBERIE | Any pipe, drain, water-system modification |
| SERRURERIE | Lock cylinder, security door work |
| MENUISERIE | Custom wood fabrication, structural carpentry |
| MAÇONNERIE | Structural wall, load-bearing uncertainty |
| CARRELAGE | Tile installation or repair |
| PEINTURE | Any painting |
| VITRERIE | Glass modification |
| BRICOLAGE_ALLOWED | Interior non-security minor hardware clearly outside specialist scope |

---

## PART 6 — PRICE PROVENANCE

```
price_provenance:     FIXEO_HUMAN_CALIBRATED_PILOT
maturity:             LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

These prices are NOT:
- AI-generated or ML predictions
- Regulated or official Moroccan tariffs
- Artisan-declared canonical values
- FIXEO transaction medians
- Statistically proven national medians

**Required disclaimer on all client-facing surfaces:**
> "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."

---

## PART 7 — FLOOR BREACH SUMMARY

| Code | Approved | Worst case net (20% + MID fuel) | Above 100 MAD floor | Above 120 MAD target |
|---|---|---|---|---|
| BRIC-001 | 200 MAD | 120 MAD | ✅ | ✅ |
| BRIC-002 | 300 MAD (2h min) | 200 MAD | ✅ | ✅ |
| BRIC-003 | 400 MAD | 280 MAD | ✅ | ✅ |
| BRIC-010 | 200 MAD | 120 MAD | ✅ | ✅ |
| BRIC-020 | 200 MAD | 120 MAD | ✅ | ✅ |
| BRIC-030 | 300 MAD | 200 MAD | ✅ | ✅ |

**Floor breaches: 0 / 6 ✅**

---

*Document: FIXEO Bricolage Human Price Decision Record*
*Phase: 7B.7.2*
*Status: APPROVED — human_decision recorded*
*production_ready: false*
*Required disclaimer: "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."*
