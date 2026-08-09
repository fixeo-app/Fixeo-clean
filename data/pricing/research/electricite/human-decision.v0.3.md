# FIXEO Electricity Pilot — Human Price Decision Record V0.3
**Decision Version:** ELECTRICITY_FIXEO_PRICE_PILOT_V0.3
**Phase:** Phase 7B.4.2 — FIXEO Electricity Human Price Decision Freeze
**Date:** 2026-08-09
**Decided by:** FIXEO Founder
**Status:** ALL DECISIONS APPROVED

---

## Price Provenance Chain

These prices are NOT derived from:
- AI or machine-learning models
- Artisan-declared prices from Supabase
- Statistical medians from transaction data
- Regulated Moroccan tariffs
- Any single market source

These prices ARE derived from:
1. **Primary market research** — Phase 7B.4 (afous.ma B-grade, 480 relevés; mano.ma C+; bnidari.ma C)
2. **Secondary market research** — V0.1 registry (18 services, 28 observations, 13 sources evaluated)
3. **Commission sensitivity analysis** — V0.2 calibration (60 scenarios, 5 services × 4 rates × 3 fuel levels)
4. **Scope definition** — standardized per-service scope contracts with explicit inclusions, exclusions, and escape rules
5. **Safety review** — FIXEO_ELECTRICAL_SAFETY_OVERRIDE, earth policy, distributor boundary doctrine
6. **Dual-fairness review** — client fairness + artisan economic viability verified at all commission scenarios
7. **Human decision** — FIXEO Founder, 2026-08-09

**Canonical provenance label:** `FIXEO_HUMAN_CALIBRATED_PILOT`
**Maturity:** `LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION`

---

## Six Approved Prices

| Service | Approved Price | Architecture | Human Decision |
|---|---|---|---|
| electricite.diagnostic | **200 MAD** | FIXED | APPROVED |
| electricite.prise_remplacement | **220 MAD** | FIXED | APPROVED |
| electricite.interrupteur_remplacement.simple | **220 MAD** | FIXED | APPROVED |
| electricite.interrupteur_remplacement.va_et_vient | **250 MAD** | FIXED | APPROVED |
| electricite.luminaire_installation | **220 MAD** | FIXED | APPROVED |
| electricite.disjoncteur_remplacement | **250 MAD** | CONDITIONAL_FIXED | APPROVED |

**production_ready = false for all six prices.**

---

## V0.2 → V0.3 Changes

| Decision | V0.2 Proposed | V0.3 Approved | Rationale |
|---|---|---|---|
| diagnostic | 200 MAD | **200 MAD** ✓ | Confirmed |
| prise | 220 MAD | **220 MAD** ✓ | Confirmed |
| interrupteur simple | 200 or 220 MAD (PENDING) | **220 MAD** | Floor breach at 200 MAD (20%+HIGH60 = 90 MAD) — resolved by 220 MAD |
| interrupteur va-et-vient | 250 MAD | **250 MAD** ✓ | Confirmed |
| luminaire | 220 MAD | **220 MAD** ✓ | Confirmed |
| disjoncteur | 250 MAD | **250 MAD** ✓ | Confirmed; CONDITIONAL_FIXED architecture retained |

**Key V0.2 issue resolved at V0.3:**
The proposed 200 MAD for interrupteur simple had one floor breach (20% commission + HIGH fuel = 90 MAD net, below 100 MAD floor). Approving 220 MAD eliminates this breach across all scenarios.

---

## Decisions Resolved at V0.3

### D1 — Diagnostic: 200 MAD
**APPROVED at 200 MAD.** Justified by electrician tool kit and safety verification protocol (vs 180 MAD for plumbing diagnostic).

### D2 — Diagnostic absorption rule
**APPROVED as specified.** Fee absorbed for same-visit qualifying standardized repair. 200 MAD payable when no repair, out-of-scope, inconclusive, specialist needed, distributor equipment, return visit.

### P1 — Prise: 220 MAD
**APPROVED at 220 MAD.** All commission scenarios clear including worst case (20%+HIGH60 = 101 MAD net).

### P2 — Prise client-supply policy
**APPROVED.** Outlet hardware = CLIENT_SUPPLIED. Artisan-supply requires explicit disclosure + approval.

### I1 — Interrupteur simple: 200 or 220 MAD
**APPROVED at 220 MAD.** 200 MAD had floor breach. 220 MAD clears all scenarios.

### I2 — Interrupteur split or unified
**APPROVED as split: 220 MAD (simple) / 250 MAD (va-et-vient).** Two clearly defined scopes warrant two distinct prices.

### L1 — Luminaire: 220 MAD
**APPROVED at 220 MAD.** Standard residential plafonnier/applique on existing functional point.

### L2 — Luminaire weight threshold
**Scope defined as "standard accessible mounting."** Heavy fixture / structural mount = HORS PÉRIMÈTRE. No specific kg value required in canonical policy — artisan judgment applies.

### MCB1 — Disjoncteur pre-booking classification
**APPROVED.** CONDITIONAL_FIXED architecture requires scope verification on arrival. Pre-booking: client guidance on symptoms (physical defect vs recurring trip) is appropriate.

### MCB2 — Brand guidance for client-supplied MCB
**APPROVED.** Certified brands (Schneider, Legrand, ABB, Hager) documented in scope contract client guidance. Available from electrical wholesalers.

### MCB3 — Artisan-supply protocol
**APPROVED.** Certified brand only, identify + state price + obtain approval before installation.

### MCB4 — Disjoncteur: 250 MAD
**APPROVED at 250 MAD.** CONDITIONAL_FIXED. Strongest economics of the five — no consumables, no parts.

### CP1 — Diagnostic absorption rule for all 5 services
**APPROVED.** 200 MAD diagnostic absorbed for same-visit qualifying standardized repair across all five services.

### CP2 — No urgency/night/weekend modifiers
**APPROVED.** All time/urgency modifiers = null for this phase. Legacy percentages remain NON-CANONICAL.

**Distributor boundary:**
**APPROVED as DISTRIBUTOR_CONTROLLED_EQUIPMENT generic concept.** FIXEO operates across Morocco with varying operators by territory. Not encoded as ONEE-specific. No operator phone numbers in canonical policy.

---

## Commission Sensitivity Summary at Approved V0.3 Prices

### Reference: 15% commission + MID fuel (40 MAD)

| Service | Price | FIXEO takes | Artisan gross | Net @15%+MID | Above floor? |
|---|---|---|---|---|---|
| diagnostic | 200 | 30 | 170 | 130 MAD | ✅ |
| prise | 220 | 33 | 187 | 132 MAD | ✅ |
| interrupteur simple | 220 | 33 | 187 | 137 MAD | ✅ |
| interrupteur va-et-vient | 250 | 37.5 | 212.5 | 157.5 MAD | ✅ |
| luminaire | 220 | 33 | 187 | 132 MAD | ✅ |
| disjoncteur | 250 | 37.5 | 212.5 | 172.5 MAD | ✅ |

### Worst case: 20% commission + HIGH fuel (60 MAD)

| Service | Price | Net | Above floor? | Rating |
|---|---|---|---|---|
| diagnostic | 200 | 100 MAD | ✅ (at floor) | WEAK_AT_FLOOR |
| prise | 220 | 101 MAD | ✅ | ACCEPTABLE |
| interrupteur simple | 220 | 106 MAD | ✅ | ACCEPTABLE |
| interrupteur va-et-vient | 250 | 125 MAD | ✅ | ACCEPTABLE |
| luminaire | 220 | 101 MAD | ✅ | ACCEPTABLE |
| disjoncteur | 250 | 140 MAD | ✅ | ACCEPTABLE |

**ZERO floor breaches at V0.3 approved prices.**
Floor = 100 MAD net pre-labour. All six approved prices clear all 36 commission×fuel scenarios (or sit exactly at floor for diagnostic worst-case, which is acceptable for a travel-only service).

---

## Dual-Fairness Assessment

| Service | Client Fairness | Artisan Fairness |
|---|---|---|
| electricite.diagnostic | ACCEPTABLE | ACCEPTABLE |
| electricite.prise_remplacement | ACCEPTABLE | ACCEPTABLE |
| electricite.interrupteur_remplacement (simple) | STRONG | ACCEPTABLE |
| electricite.interrupteur_remplacement (va-et-vient) | STRONG | STRONG |
| electricite.luminaire_installation | STRONG | ACCEPTABLE |
| electricite.disjoncteur_remplacement | ACCEPTABLE | STRONG |

**Dual-fairness principle satisfied:** All six prices protect clients from arbitrary overpricing AND artisans from economically unsustainable underpricing. No price creates an incentive for an artisan to bypass a safety concern.

---

## Key Policy Decisions Frozen at V0.3

**Policies introduced or updated in this decision version:**

1. **220 MAD for interrupteur simple** — resolves V0.2 floor breach
2. **CONDITIONAL_FIXED architecture** for disjoncteur — retained from V0.2 proposal, now formally approved
3. **DISTRIBUTOR_CONTROLLED_EQUIPMENT** concept — generic, not ONEE-specific (corrects V0.2 draft)
4. **Diagnostic absorption rule** — identical to plumbing D3, confirmed for electricity
5. **Multiple-item policy** — frozen as NOT_YET_DEFINED
6. **All urgency/time modifiers = null** — confirmed for this phase
7. **Diagnostic fee: 200 MAD** (vs plumbing 180 MAD) — confirmed with justification

**Policies inherited unchanged from V0.2:**
- FIXEO_DUAL_FAIRNESS_PRINCIPLE (electricity extension)
- FIXEO_ELECTRICAL_SAFETY_OVERRIDE (8-step with MAKE SAFE)
- Earth/ground policy (6-condition matrix)
- Parts/materials policy (CLIENT_SUPPLIED default)
- City adjustment = null
- AI terminology doctrine (LEVEL_0, RULE_BASED_LOOKUP)
- Price provenance: FIXEO_HUMAN_CALIBRATED_PILOT
- Required UI disclaimer

---

## Historical Version Integrity

| File | Registry version | Status |
|---|---|---|
| `registry.v0.json` | 0.1.0 | PRESERVED UNCHANGED |
| `evidence.v0.json` | 0.1.0 | PRESERVED UNCHANGED |
| `sources.v0.json` | 0.1.0 | PRESERVED UNCHANGED |
| `exclusions.v0.json` | 0.1.0 | PRESERVED UNCHANGED |
| `registry.v0.2.json` | 0.2.0 | PRESERVED UNCHANGED |
| `calibration.v0.2.json` | 0.2.0 | PRESERVED UNCHANGED |
| `fair-price-policy.v0.2.md` | V0.2 | PRESERVED UNCHANGED |
| `human-review.v0.2.md` | V0.2 | PRESERVED UNCHANGED |

**Plumbing V0.1/V0.2/V0.3:** PRESERVED UNCHANGED

---

## Production Scope

**THIS PHASE:** Documentation and decision freeze only.

**NOT authorized in this phase:**
- Any production deployment
- Any change to runtime JS, CSS, or HTML
- Any Supabase write
- Any display of these prices on live FIXEO surfaces
- Any artisan-facing communication of these as FIXEO commitments

**production_ready = false until explicit FIXEO product team production deployment authorization.**
