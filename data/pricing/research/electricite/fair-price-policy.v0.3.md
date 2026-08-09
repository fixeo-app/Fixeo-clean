# FIXEO Fair Price Policy — Electricity V0.3
## Frozen Canonical Policy Document
**Decision Version:** ELECTRICITY_FIXEO_PRICE_PILOT_V0.3
**Phase:** Phase 7B.4.2 — FIXEO Electricity Human Price Decision Freeze
**Date:** 2026-08-09
**Status:** HUMAN_APPROVED — PILOT — NOT PRODUCTION
**production_ready:** false

---

## 1. FIXEO_DUAL_FAIRNESS_PRINCIPLE (Electricity Extension)

> A FIXEO price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing.

**Electricity corollary (CRITICAL):**

> A FIXEO electricity fixed price must additionally NEVER create an economic incentive for the artisan to bypass a safety defect in order to remain inside the fixed-price scope.

A FIXEO fixed electricity price that causes an artisan to silence a safety concern to preserve their income is a dangerous pricing failure. Safety always overrides standardized pricing.

**Three corollaries of the dual fairness principle:**
1. FIXEO must NOT target the cheapest available market price
2. FIXEO must NOT set prices that are economically unsustainable for artisans in normal Casablanca operating conditions
3. FIXEO must NOT set electricity prices that silently incentivize safety shortcuts

---

## 2. FIXEO_ELECTRICAL_SAFETY_OVERRIDE (Canonical — 8 Steps)

When an unsafe or materially different condition is discovered during a standardized intervention:

```
1. STOP
   Do not continue the standardized intervention.

2. MAKE SAFE
   Where reasonably possible, isolate or make the condition safe
   before proceeding further. This step is unique to electricity
   and is not present in plumbing scope.

3. EXPLAIN
   Inform the client factually about the discovered condition.

4. DECLARE
   "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
   The client must hear this clearly before any new pricing is discussed.

5. DO NOT INCREASE SILENTLY
   The standardized price does not automatically increase.
   A new scope requires a new explicit quote.

6. QUOTE
   Provide a clear quote for the new scope or diagnostic path.

7. APPROVE
   Obtain explicit client approval before continuing.

8. CONTINUE
   Only proceed when technically safe and client has authorized.
```

**Safety-override right:** The client retains the right to decline any scope beyond the original standardized service. The 200 MAD diagnostic fee applies when no repair is completed.

---

## 3. HORS PÉRIMÈTRE PRIX FIXEO — Canonical Exit Workflow

The HORS PÉRIMÈTRE workflow applies whenever the artisan determines the intervention falls outside the defined standardized scope.

```
STOP
  ↓
MAKE SAFE (electricity-specific — mandatory first step)
  ↓
IDENTIFY the specific escape condition
  ↓
EXPLAIN clearly to client
  ↓
DECLARE "Hors périmètre FIXEO"
  ↓
QUOTE the new scope
  ↓
APPROVE — explicit client authorization
  ↓
CONTINUE
```

Client has the right to decline and pay only the 200 MAD diagnostic fee.

---

## 4. Diagnostic Fee Policy — Electricity

**Approved fee:** 200 MAD FIXED

**Why 200 MAD (not 180 MAD like plumbing):**
- Electrician carries measurement tools (multimeter, testeur, voltmètre) — higher tool capital than plumbing equivalent
- Electrical safety verification protocol (isolation confirmation, dead-testing) adds systematic time vs plumbing diagnostic
- Artisan economic floor for electricity is ≥200 MAD/intervention — diagnostic fee must be consistent with this floor

**DIAGNOSTIC ABSORPTION RULE (frozen):**
If the client accepts a qualifying standardized FIXEO electrical repair and that repair is completed during the SAME visit, the 200 MAD diagnostic fee is ABSORBED into the standardized intervention price.

The client must NOT pay:
- 200 MAD diagnostic
- + full standardized FIXEO intervention price

for the same qualifying same-visit standard repair.

**The 200 MAD remains payable when:**
- No repair is performed
- Intervention is outside standardized FIXEO scope
- Client declines the new quote after HORS PÉRIMÈTRE declaration
- Diagnosis is inconclusive
- Specialist investigation is required
- Distributor-controlled equipment is identified as the fault source
- A return visit is necessary

---

## 5. Parts and Materials Policy (Canonical)

```
FIXEO STANDARD ELECTRICAL PRICE =
  LABOUR
  + TRAVEL
  + DEFINED SMALL CONSUMABLES (listed per service)
```

**Major electrical hardware is NOT silently included.** Examples:
- Prise (outlet)
- Interrupteur (switch)
- Luminaire
- MCB / disjoncteur

**Default position: CLIENT_SUPPLIED_PART**

The client is responsible for purchasing the correct replacement hardware.

**Alternative: ARTISAN_SUPPLIED_SEPARATELY_DISCLOSED_PART**
If the artisan supplies the part, the following protocol is mandatory:
1. Identify the part (type, specification, brand where relevant)
2. State the price clearly before installation
3. Obtain explicit client approval
4. Install only after approval
5. Never silently recover margin through undisclosed hardware pricing

**Consumables included by service:**
| Service | Included consumables |
|---|---|
| diagnostic | None |
| prise_remplacement | Domino/Wago connectors up to 20 MAD |
| interrupteur (simple) | Minor connectors up to 10 MAD |
| interrupteur (va-et-vient) | Connectors up to 15 MAD |
| luminaire_installation | Wire connectors up to 15 MAD |
| disjoncteur_remplacement | None |

---

## 6. Earth / Ground Wire Policy (6-Condition Matrix)

| Earth condition | Required action |
|---|---|
| Present and properly connected | Proceed. Verify continuity. |
| Disconnected at terminal, otherwise safe | Reconnect. Inform client. Proceed if safe. |
| Absent from required cable run | **SAFETY_OVERRIDE** → HORS PÉRIMÈTRE → remediation quote |
| Conductor damaged or melted | **SAFETY_OVERRIDE** → HORS PÉRIMÈTRE → cable replacement quote |
| Legacy two-wire installation where earth is required | **SAFETY_OVERRIDE** — Do NOT represent the intervention as compliant → remediation path |
| Neutral improperly used as earth or other unsafe improvised bonding | **SAFETY_OVERRIDE** — Never normalize this condition inside a standardized fixed-price intervention |

**Core principle:**
> FIXEO must never represent an installation as compliant merely because the requested visible component was replaced.

Earth safety conditions must be evaluated before proceeding with any standardized electrical intervention.

---

## 7. Distributor / Utility Equipment Boundary

**Canonical concept: DISTRIBUTOR_CONTROLLED_EQUIPMENT**

FIXEO operates across Morocco. Electricity distribution responsibility varies by city, territory, and operator. The canonical concept is generic — never encode a single operator name as universal Morocco doctrine.

**Out of scope (DISTRIBUTOR_CONTROLLED_EQUIPMENT):**
- Electricity meter
- Sealed utility equipment upstream of the client's private installation
- Distributor-controlled service breaker / disjoncteur de branchement
- Any sealed upstream equipment bearing operator markings

**In scope (private downstream equipment):**
- Client's private distribution board
- Private DIN-rail MCBs
- Private downstream circuits
- Outlets, switches, luminaires

**Identification guidance:**
Distributor-controlled equipment is typically separately housed, operator-branded, has a utility seal that must not be broken, and is located adjacent to or preceding the electricity meter. Private MCBs are DIN-rail mounted, in the client's own tableau, and have no utility seal.

**If distributor-controlled equipment is the identified fault source:**
- Artisan declares HORS PÉRIMÈTRE
- 200 MAD diagnostic fee applies (artisan traveled and diagnosed)
- Client is directed to the appropriate distribution operator for their territory
- FIXEO cannot resolve this fault

**Note on operator-specific information:**
Any specific operator contact details (e.g. ONEE, LYDEC, RADEEF, regional operators) are research evidence only, documented in the evidence files for the specific city/territory. They are NOT frozen as universal canonical policy.

---

## 8. Multiple-Item Policy (Frozen)

**Approved pilot prices apply to ONE standardized item per intervention.**

- 1 prise replacement = 220 MAD
- 5 prise replacements ≠ 5 × 220 MAD

Batch work has fundamentally different economics because:
- Travel and setup costs are shared across all items
- Labour per item reduces with quantity
- Materials volume may vary

**MULTI_ITEM_BATCH_PRICING = NOT_YET_DEFINED**

Future dedicated batch-price research and calibration is required before any batch pricing is published.

FIXEO must not display single-item prices in a context that implies linear multiplication for batch work.

---

## 9. Urgency, Night, Weekend, and Holiday Modifiers

```
urgency_modifier  = null
night_modifier    = null
weekend_modifier  = null
holiday_modifier  = null
express_modifier  = null
```

Legacy FIXEO urgency/time percentages are NON-CANONICAL. No surcharge percentage is approved in this phase.

**Permitted future disclaimer (when time-sensitive booking is displayed):**
> "Interventions en soirée, week-end et jours fériés : majoration possible — tarif artisan prévalent."

This disclaimer must appear as informational context only, never as a contractually guaranteed FIXEO price.

---

## 10. Geographic Policy

```
market_scope      = NATIONAL_MOROCCO
city_adjustment   = null
```

Casablanca is used as `ECONOMIC_STRESS_TEST_ONLY` — it represents a demanding urban operating context for commission sensitivity testing. It is NOT a universal price multiplier applied to other cities.

External city coefficients (e.g. afous.ma: Casa 1.00, Rabat/Marra 0.95, etc.) are documented as research evidence only. FIXEO cannot adopt city multipliers without its own verified transaction data by city.

---

## 11. AI Terminology Policy (Frozen — LEVEL_0)

**Current system classification:** `RULE_BASED_LOOKUP` at `LEVEL_0`

The following labels are PERMANENTLY PROHIBITED until LEVEL_4:
- "FIXEO AI Price" / "Prix IA FIXEO"
- "AI-powered pricing"
- "Prix calculé par IA"
- "Intelligence artificielle" as a pricing basis
- Any implication that prices are ML-generated

**Required labels at LEVEL_0:**
- "Estimation marché FIXEO"
- "Prix indicatif FIXEO"
- "Prix FIXEO (tarif pilote)"

**LEVEL_4 requirements** (minimum before any "AI" label):
- ≥100 verified observations per service
- Trained model on FIXEO-owned transaction data
- Model validated on held-out test set
- Quarterly retraining minimum
- Confidence interval output per prediction
- Formal model card and methodology documentation

---

## 12. Price Provenance (Frozen)

**Canonical enum value:** `FIXEO_HUMAN_CALIBRATED_PILOT`

**Canonical meaning:**
> "Human-calibrated FIXEO pilot price derived from Moroccan market research, standardized scope definition, safety review, and client/artisan dual-fairness analysis."

**These prices are NOT:**
- AI-generated
- Machine-learning predictions
- Artisan-declared prices
- Official Moroccan tariffs
- Regulated prices
- FIXEO transaction medians
- Statistically proven market medians

**Required UI disclaimer (mandatory on all surfaces displaying FIXEO prices):**
> "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."

---

## 13. Artisan Economic Floor (Electricity)

**Minimum viability floor:** 100 MAD net pre-labour (Casablanca urban)

This is the absolute viability guard, not the target. Electricity work carries higher tool capital costs and safety liability than plumbing. Target economics should materially exceed this floor.

**Artisan economic floor for electricity:** ≥200 MAD/intervention (Casablanca)

**Formula:**
```
ART_NET_BEFORE_LABOUR = (FIXEO_PRICE × (1 - commission_rate)) - FUEL - CONSUMABLES
```

Fuel reference costs (Casablanca urban):
- LOW: 25 MAD round trip
- MID: 40 MAD round trip
- HIGH: 60 MAD round trip

All six approved prices at V0.3 have zero floor breaches across all commission rate and fuel cost scenarios.

---

## 14. Production Status

**production_ready = false for all six approved prices**

Human approval in this phase authorizes:
- The FIXEO pilot price values as frozen research artifacts
- The scope contracts per service
- The safety policies and escape doctrines

Human approval in this phase does NOT authorize:
- Any display of these prices on live FIXEO surfaces
- Any changes to production JS, CSS, or HTML
- Any Supabase writes
- Any artisan-facing communication of these prices as FIXEO commitments

A separate explicit production deployment decision is required from the FIXEO product team before any V0.3 price reaches a live surface.

---

## 15. Version History

| Version | Date | Status |
|---|---|---|
| V0.1 | 2026-08-09 | Electricity Morocco market research — registry.v0.json |
| V0.2 | 2026-08-09 | Human calibration phase — proposed prices, all PENDING — registry.v0.2.json |
| **V0.3** | **2026-08-09** | **Human price decision freeze — all APPROVED — registry.v0.3.json** |

V0.1 and V0.2 are preserved unchanged. V0.3 supersedes V0.2 for all production pipeline purposes while V0.1 and V0.2 remain as historical research evidence.
