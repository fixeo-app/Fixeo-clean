# FIXEO Bricolage — Fair Price Policy
## Phase 7B.7.2 — Frozen Canonical Policy (V0.3)

> Status: FROZEN — human price decision recorded 2026-08-09
> production_ready: false
> This policy governs all six approved bricolage pilot prices.

---

## 1. FIXEO DUAL FAIRNESS PRINCIPLE (CANONICAL — FROZEN)

> A FIXEO price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing.
>
> FIXEO must NOT target the cheapest market price.
>
> The objective is: CLIENT_FAIRNESS + ARTISAN_VIABILITY + PRICE_PREDICTABILITY + CLEAR_SCOPE — not lowest-price competition.

### Corollaries for Bricolage

**Corollary 1 — Travel is always included.** No separate displacement fee may be added on top of any standardized FIXEO bricolage task price. Travel cost is embedded. The minimum visit (BRIC-001) applies only when no standardized task qualifies.

**Corollary 2 — Multi-task visits must not multiply travel.** A client booking several tasks in one visit must not be charged as if the artisan made multiple separate journeys. Batch and half-day architectures (BRIC-003) exist precisely to prevent this.

**Corollary 3 — Hardware is client responsibility.** FIXEO bricolage prices are LABOUR + TRAVEL + STANDARD CONSUMABLES. Shelves, brackets, furniture, TV mounts, curtain rods, mirrors, decorative items, and replacement parts are client-supplied. This is the Moroccan market standard — confirmed across 15 independent sources.

---

## 2. APPROVED PRICES (FROZEN)

| Code | Service | Approved Price | Architecture |
|---|---|---|---|
| BRIC-001 | Minimum visit | **200 MAD** | MINIMUM_VISIT_PRICE |
| BRIC-002 | Hourly rate | **150 MAD/h, 2h min** | HOURLY |
| BRIC-003 | Half-day | **400 MAD** | HALF_DAY |
| BRIC-010 | Small furniture assembly | **200 MAD** | PER_ITEM_FORFAIT |
| BRIC-020 | Standard shelf installation | **200 MAD** | PER_ITEM_FORFAIT |
| BRIC-030 | Standard TV wall mounting | **300 MAD** | CONDITIONAL_FIXED |

All: `human_decision = APPROVED` | `production_ready = false` | `price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT`

---

## 3. PRICING ARCHITECTURE MAP (FROZEN)

```
CLIENT SITUATION → FIXEO ARCHITECTURE
──────────────────────────────────────────────────────────────
Single micro-task (hook, small nail, minor adjustment)
  → MINIMUM VISIT (BRIC-001): 200 MAD

One small furniture item (flat-pack, ≤45 min)
  → PER ITEM (BRIC-010): 200 MAD

One wall shelf (standard substrate, client-supplied)
  → PER ITEM (BRIC-020): 200 MAD

One standard TV wall mount (≤65", ≤40kg, standard wall)
  → CONDITIONAL FIXED (BRIC-030): 300 MAD

Open-ended work, uncertain duration, large furniture
  → HOURLY (BRIC-002): 150 MAD/h, 2h minimum

Multiple mixed tasks expected to fit ~3–4 hours
  → HALF-DAY (BRIC-003): 400 MAD

Multiple homogeneous items (batch)
  → NO UNIVERSAL PERCENTAGE APPROVED
  → Use HALF-DAY (BRIC-003) or HOURLY (BRIC-002) as interim

Specialist task (electrical / plumbing / lock / etc.)
  → ESCAPE → route to appropriate specialist métier

Complex, very large, uncertain scope
  → QUOTE REQUIRED
```

**Critical rule:** Never stack BRIC-001 minimum visit on top of a standardized task price. They are mutually exclusive.

---

## 4. ANTI-DOUBLE-CHARGE DOCTRINE (FROZEN)

When a standardized FIXEO task (BRIC-010, BRIC-020, BRIC-030) is booked:

- Travel is **embedded** in the task price
- BRIC-001 minimum visit is **NOT** additionally charged
- Artisan receives full task price including travel

BRIC-001 applies **only** when:
- No standardized task qualifies
- The job is truly a micro-task below the standardized scope threshold
- The artisan is called for a single minor adjustment with no associated standardized service

---

## 5. MULTI-TASK VISIT POLICY (FROZEN)

**Canonical scenarios (A–E):**

| Scenario | Situation | Architecture | Price |
|---|---|---|---|
| A | Micro-task only | MINIMUM_VISIT_PRICE | 200 MAD |
| B | One standardized task | PER_ITEM_FORFAIT | Task price (no BRIC-001) |
| C | Open-ended / variable | HOURLY | 150 MAD/h, 2h min |
| D | Multiple mixed tasks, ~3–4h | HALF_DAY | 400 MAD |
| E | Multiple homogeneous items | **DEFERRED** | Requires batch-calibration phase |

**The 65% additional-item rate is RESEARCH_EXPERIMENTAL_ONLY.** It is not canonical FIXEO pricing and must not be applied to any client-facing surface.

**Reason:** A universal percentage creates false precision and can produce unfair outcomes across different task families with different labour intensities.

---

## 6. MINIMUM VISIT CONTRACT (FROZEN)

**BRIC-001 — 200 MAD**

| Element | Policy |
|---|---|
| Travel | INCLUDED — one round trip |
| On-site time | Up to 30 minutes |
| Tasks | One micro-task or small group fitting included duration |
| Standard consumables | INCLUDED (normal screws/plugs for standard masonry) |
| Hardware | CLIENT_SUPPLIED or PART_SEPARATE_WITH_DISCLOSURE |
| Anti-stacking | NEVER added on top of standardized task price |
| After 30 min | Client notified → transition to BRIC-002 hourly → approval required |

---

## 7. HOURLY RATE CONTRACT (FROZEN)

**BRIC-002 — 150 MAD/h, 2 hours minimum, 300 MAD minimum payable**

| Element | Policy |
|---|---|
| Rate | 150 MAD per hour |
| Minimum billing | 2 hours |
| Minimum payable | 300 MAD |
| Travel | INCLUDED in 2-hour minimum |
| Consumables | Standard plugs/screws included |
| Hardware | CLIENT_SUPPLIED |
| Duration estimate | Artisan must provide estimated range before work begins |
| Silent extension | PROHIBITED — client notified before any additional hour |
| Billing rounding | Nearest 30 minutes after 2h minimum |

---

## 8. HALF-DAY CONTRACT (FROZEN)

**BRIC-003 — 400 MAD**

| Element | Policy |
|---|---|
| Duration | Approximately 3–4 hours on-site |
| Travel | INCLUDED — one journey |
| Tasks | Mixed small handyman jobs |
| Hardware | Major hardware CLIENT_SUPPLIED |
| Specialist tasks | EXCLUDED — routes to appropriate specialist |
| Overtime trigger | Expected work exceeds 4 hours |
| Overtime protocol | STOP → explain → provide estimate → obtain approval → continue |

---

## 9. SMALL FURNITURE CONTRACT (FROZEN)

**BRIC-010 — 200 MAD**

| Element | Policy |
|---|---|
| Scope | One small flat-pack item, typically one package, ≤45 min |
| Furniture | CLIENT_SUPPLIED |
| Travel | INCLUDED |
| Escape | Complexity materially exceeds scope → HOURLY or DEVIS |
| Anti-stacking | BRIC-001 not additionally charged |

Excluded from this price: complex wardrobe systems, structural carpentry, items requiring more than ~45 minutes of assembly, multiple packages for a single item.

---

## 10. SHELF INSTALLATION CONTRACT (FROZEN)

**BRIC-020 — 200 MAD**

| Element | Policy |
|---|---|
| Scope | One shelf, standard substrate, normal height, drilling + levelling + fixing |
| Shelf + brackets | CLIENT_SUPPLIED |
| Travel | INCLUDED |
| Consumables | Standard compatible anchors + screws INCLUDED for normal masonry |
| Anti-stacking | BRIC-001 not additionally charged |

**Substrate policy:**

| Substrate | Action |
|---|---|
| Standard masonry, brick, plain concrete | Proceed — standard price |
| Reinforced concrete, hollow brick, plasterboard, tile | HORS PÉRIMÈTRE → disclose → surcharge + approval |
| Marble, stone, tadelakt/pisé | QUOTE_REQUIRED |
| Unknown structural wall / load-bearing uncertainty | STOP → MAÇONNERIE / specialist |

**Specialty anchors** (Molly, toggle, chemical): PART_SEPARATE_WITH_DISCLOSURE — disclose specification, quantity, cost, and obtain client approval before proceeding.

---

## 11. TV WALL MOUNTING CONTRACT (FROZEN)

**BRIC-030 — 300 MAD**

**Client supplies:** TV + compatible wall bracket.

**FIXEO price includes:** Travel, drilling, standard compatible fixing hardware, bracket mounting, TV installation, levelling, basic stability check, simple surface cable tidy only.

**Standard eligibility:** Residential TV ≤65", ≤40 kg. Fixed or simple tilt bracket. Compatible standard substrate. Normal safe working height.

**Explicit exclusions:**
- Electrical socket relocation → **ELECTRICITE**
- Electrical wiring modification → **ELECTRICITE**
- In-wall cable concealment
- Full-motion or complex bracket when substantially more work required
- TV > 65" or > 40 kg (second worker required → quote)
- Marble or fragile stone substrate
- Uncertain structural wall
- Specialist chemical anchoring unless separately disclosed
- Bracket (client-supplied)

**Escape conditions:**

| Condition | Action |
|---|---|
| Reinforced concrete wall | HORS PÉRIMÈTRE → specialty anchors → disclose + approve |
| Plasterboard without confirmed stud | HORS PÉRIMÈTRE → stud confirmation → conditional |
| Tile / fragile stone | HORS PÉRIMÈTRE → diamond bit + crack risk disclosure + approve |
| Full-motion bracket adding substantial complexity | HORS PÉRIMÈTRE → revised quote |
| TV > 65" or > 40 kg | HORS PÉRIMÈTRE → two-person job → quote |
| Cable concealment requiring wiring work | STOP → ELECTRICITE — NOT bricolage |
| Marble / fragile stone / structural uncertainty | HORS PÉRIMÈTRE → quote required |

**ABSOLUTE BOUNDARY:** Any electrical modification — socket relocation, rewiring, circuit work — routes to ELECTRICITE. This boundary is not negotiable and cannot be relaxed under any bricolage price.

---

## 12. MATERIAL / HARDWARE POLICY (FROZEN)

**Included in all standardized prices:**
- Normal screws compatible with fixing requirements
- Normal wall plugs for standard masonry
- Small basic fixing consumables required to complete the standard scope

**Always client-supplied:**
- Shelves and shelf brackets
- Curtain rods and all associated hardware
- TV wall brackets (support mural)
- Mirrors
- All furniture (flat-pack)
- Bathroom accessories (porte-serviettes, patère, etc.)
- Decorative items (frames, pictures)
- Replacement handles and hinges

**Part-separate with disclosure required:**
- Molly / toggle anchors for hollow block or plasterboard
- Chemical anchors for reinforced concrete heavy mounts
- Specialty heavy-load anchors
- Diamond drill bits for tile (if artisan must purchase)

**Disclosure protocol:** IDENTIFY specification → STATE quantity and unit cost → OBTAIN client approval → PROCEED. No silent hardware markup ever.

---

## 13. HORS PÉRIMÈTRE WORKFLOW (FROZEN)

For all six approved services, the canonical workflow when scope is exceeded:

```
1. STOP — immediately, before proceeding
2. IDENTIFY — state the specific objective escape condition
3. EXPLAIN — plain language to client: what was found and why it exceeds the contract
4. DECLARE — "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE — revised scope and expected price or price range
6. OBTAIN — explicit client approval (verbal or written)
7. CONTINUE — only after approval received
```

The original standardized FIXEO price **never silently increases.** If client does not approve, the artisan completes only the original in-scope work (if any) at the standardized price, or charges only the minimum visit/diagnostic fee if no in-scope work was possible.

---

## 14. MÉTIER BOUNDARY POLICY (FROZEN)

Bricolage must never become a cheap substitute for specialist work.

| Route to | When |
|---|---|
| **ELECTRICITE** | Any wiring, electrical circuit, socket or switch modification — ABSOLUTE |
| **PLOMBERIE** | Any pipe, drain, or water-system modification |
| **SERRURERIE** | Lock cylinder, security door, porte palière, porte blindée |
| **MENUISERIE** | Custom wood fabrication, structural carpentry |
| **MAÇONNERIE** | Structural wall work, load-bearing uncertainty |
| **CARRELAGE** | Tile installation or repair of any kind |
| **PEINTURE** | Any wall or surface painting |
| **VITRERIE** | Glass modification or replacement |
| BRICOLAGE allowed | Interior non-security minor hardware clearly outside all above specialist scopes |

---

## 15. GEOGRAPHIC POLICY (FROZEN)

```
market_scope  = NATIONAL_MOROCCO
city_adjustment = null
```

No city price multipliers are approved. External evidence of city price differences exists (Casablanca vs smaller cities) but cannot be adopted without FIXEO's own transaction data by city. Use scope disclosure and HORS PÉRIMÈTRE workflow to handle genuine local complexity — not price multipliers.

---

## 16. URGENCY / TIME MODIFIER POLICY (FROZEN)

```
urgency_modifier  = null
night_modifier    = null
weekend_modifier  = null
holiday_modifier  = null
express_modifier  = null
```

No surcharge is approved for any time context. External market evidence shows surcharges exist (artisan discretion) but no standardized FIXEO surcharge is canonical at this maturity level.

---

## 17. ECONOMIC FLOOR POLICY (FROZEN)

```
artisan_net_hard_floor_MAD        = 100
artisan_net_practical_target_MAD  = 120
classification                     = FIXEO_POLICY
```

This is a FIXEO business policy, not a statistically proven Moroccan market fact.

Purpose: ensures artisan net income after platform commission and urban travel costs remains economically viable. Covers: travel time, tool transport, parking, access, setup and cleanup time.

All six approved prices verified against this floor at 20% commission + 40 MAD fuel (MID scenario). **Zero floor breaches.**

---

## 18. PRICE PROVENANCE DOCTRINE (FROZEN)

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity         = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

These prices are based on:
- Aggregated Moroccan market research from 15 independent external sources
- Dual-fairness economic review by FIXEO
- Explicit human decision by FIXEO product owner

These prices are NOT:
- AI-generated or ML predictions
- Regulated or official Moroccan government tariffs
- Artisan-declared canonical values from verified artisan data
- FIXEO transaction medians derived from observed quotes or missions
- Statistically proven national price medians

**Required disclaimer on all future client-facing surfaces:**
> "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."

---

## 19. FUTURE PRICE EVOLUTION PATHWAY

| Maturity Level | Trigger | Price Change |
|---|---|---|
| LEVEL_0 (current) | External research + human calibration | Pilot prices above |
| LEVEL_1 | ≥5 FIXEO transaction observations per service | Update with observed data |
| LEVEL_2 | ≥30 observations across ≥3 artisans, 6-month span | Weighted median update |
| LEVEL_3 | ≥20 observations per service per city | City-specific ranges |
| LEVEL_4 | ≥100 observations, validated model, quarterly retrain | FIXEO Estimation model |

At LEVEL_1+, the term "FIXEO transaction-informed estimate" may replace "indicatif" in the disclaimer. The term "AI" requires LEVEL_4 and a validated trained model on FIXEO-owned data.

---

*Policy version: V0.3 — FROZEN*
*Phase: 7B.7.2*
*Approved date: 2026-08-09*
*production_ready: false*
*Required disclaimer: "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."*
