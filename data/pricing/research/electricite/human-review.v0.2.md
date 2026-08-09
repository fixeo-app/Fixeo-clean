# FIXEO Electricity Human Calibration — V0.2
# Human Review & Decision Matrix

**Status: HUMAN_CALIBRATION_CANDIDATE — ALL DECISIONS PENDING**
**Version:** 0.2.0
**Phase:** Phase 7B.4.1 — FIXEO Electricity Human Calibration & Fair-Price Policy
**Date:** 2026-08-09
**Based on:** registry.v0.json (Phase 7B.4) + external market research

---

## ⚠️ Pre-Decision Checklist

Before approving any price, confirm:

- [ ] The scope contract is precise enough to prevent artisan scope-creep
- [ ] The parts policy is clearly communicated to clients pre-booking
- [ ] The safety escape conditions are operationally enforceable
- [ ] The ONEE boundary is clear (for disjoncteur service)
- [ ] The earth/ground policy is clear (for prise service)
- [ ] The artisan economic floor is satisfied at the intended commission rate
- [ ] The diagnostic absorption rule is correctly defined

---

## Summary Decision Table

| Service | Market anchor | Proposed FIXEO price | Architecture | Client ✓ | Artisan ✓ | Net @15% MID | Net @20% MID | Human Decision |
|---|---|---|---|---|---|---|---|---|
| electricite.diagnostic | 200–350 MAD | **200 MAD** | FIXED | ACCEPTABLE | ACCEPTABLE | 130 MAD | 120 MAD | **PENDING** |
| electricite.prise_remplacement | 150–300 MAD | **220 MAD** | FIXED | ACCEPTABLE | ACCEPTABLE | 132 MAD | 121 MAD | **PENDING** |
| electricite.interrupteur_remplacement | 150–250 MAD | **200 MAD simple / 250 MAD va-et-vient** | FIXED (two variants) | STRONG | ACCEPTABLE* | 120 MAD / 157 MAD | 110 MAD / 145 MAD | **PENDING** |
| electricite.luminaire_installation | 150–300 MAD | **220 MAD** | FIXED | STRONG | ACCEPTABLE | 132 MAD | 121 MAD | **PENDING** |
| electricite.disjoncteur_remplacement | 200–400 MAD | **250 MAD** | FIXED (conditional) | ACCEPTABLE | **STRONG** | 172.5 MAD | 160 MAD | **PENDING** |

*Interrupteur simple at 200 MAD: floor breach at 20% commission + HIGH fuel scenario. See Section 3.

---

## Service 1: electricite.diagnostic — 200 MAD

### External Market Evidence
- afous.ma urgency hourly: 150–180 DH/h (480 relevés, P30–P70, national)
- mano.ma diagnostic+research: 200–500 DH forfait (includes repair in upper range)
- Market anchor for diagnostic-only: 200–300 DH (Casablanca reference)

### Proposed FIXEO Price: 200 MAD FIXED

### Rationale
200 MAD is the artisan economic floor for any viable Casablanca residential call-out (derived from afous.ma P30–P70 hourly rate × 1h travel+inspection). Slightly above plumbing diagnostic (180 MAD) to reflect: electrician carries more test equipment (multimeter, testeur, potentially clamp meter), electrical measurements take marginally longer, safety verification protocol adds time.

### Exact Scope

**INCLUDED:**
- Standard travel within normal urban zone
- Initial on-site electrical inspection (visual + basic measurements)
- Voltage verification, continuity check, circuit identification with standard tools
- Fault identification attempt without invasive work
- Verbal explanation of findings
- Verbal repair quote if applicable
- Safety observation communicated (earth wire status)

**EXCLUDED:**
- Any repair work
- Invasive wall opening or dismantling
- Extensive circuit tracing
- Specialist equipment (thermal camera, megohmmeter, power analyser)
- Full tableau audit or compliance assessment
- Written certification or report
- Second visit
- Any part
- ONEE-controlled equipment work

### Diagnostic Policy
Fee charged when no repair occurs. Absorbed if same-visit standardized repair (prise, interrupteur, luminaire, confirmed single MCB) accepted and completed. Client does not pay diagnostic + full intervention price for same-visit standard repair. ONEE-controlled faults → diagnostic fee charged, client redirected to ONEE.

### Commission Sensitivity

| Commission | Fuel | Artisan net | Floor? |
|---|---|---|---|
| 0% | MID 40 | 160 MAD | ✅ ABOVE |
| 10% | MID 40 | 140 MAD | ✅ ABOVE |
| 15% | MID 40 | 130 MAD | ✅ ABOVE |
| 20% | MID 40 | 120 MAD | ✅ ABOVE |
| 20% | HIGH 60 | 100 MAD | ✅ AT FLOOR |

**Floor breach: NONE.** Worst case (20% + HIGH fuel) = 100 MAD exactly at floor. Acceptable for diagnostic-only service where artisan travels, inspects, leaves — no tools consumed, no parts used.

### Human-Review Issues

**Issue D1:** Should the diagnostic fee match the plumbing rate (180 MAD) for consistency?
- PRO 180: Consistency across categories; one memorable price.
- PRO 200: Electrician carries more equipment; electrical safety check takes longer. 200 is the artisan economic floor.
- **Recommendation:** 200 MAD. Floor alignment more important than cross-category consistency.

**Issue D2:** Should the diagnostic fee include written safety report for non-compliant installations?
- Written reports are a compliance/certification service — beyond scope of a standard 200 MAD call-out.
- **Recommendation:** No written report at 200 MAD. Written safety report = separate service.

> **HUMAN DECISION D1:** Approve 200 MAD? Or adjust? _____________
> **HUMAN DECISION D2:** Diagnostic absorption rule: confirm as described? _____________

---

## Service 2: electricite.prise_remplacement — 220 MAD

### External Market Evidence
- afous.ma per-unit: 70–80 DH/unit (labour only, 480 relevés) + travel 50–100 DH = 120–180 DH effective
- mano.ma forfait: 150–300 DH (mid 225 DH) — likely includes part or is labour+travel
- Market anchor: 150–300 DH. FIXEO standard: 220 MAD (labour + travel + ≤20 MAD consumable)

### Proposed FIXEO Price: 220 MAD FIXED

### Exact Scope

**INCLUDED:**
- Standard travel
- Labour: remove existing outlet, prepare conductors, install client-supplied outlet
- Domino/Wago connector if needed — ≤20 MAD
- Basic functional test + polarity + earth verification

**EXCLUDED:**
- Outlet hardware — **CLIENT SUPPLIES**
- Wall box replacement
- Cable replacement
- New circuit
- Multiple outlets on separate circuits
- Specialized outlets (32A, CEE, USB, clim)
- Work on burnt, melted, or dangerous wiring

**Client-facing label:** "Main-d'œuvre + déplacement — prise fournie par le client"

### Earth / Ground Policy (CRITICAL)

| Earth condition | Action |
|---|---|
| Earth present and connected | Proceed normally |
| Earth disconnected at terminal (loose screw) | Reconnect + inform client |
| Earth absent from cable run | SAFETY_OVERRIDE → HORS PÉRIMÈTRE. Cannot install earthed outlet on non-earthed circuit |
| Earth conductor damaged | SAFETY_OVERRIDE → HORS PÉRIMÈTRE → cable quote |
| Legacy 2-wire zone requiring earth | SAFETY_OVERRIDE → Mandatory. Quote remediation. Do not install and represent as compliant |

### Commission Sensitivity

| Commission | Fuel | Net (after 15 MAD consumables) | Floor? |
|---|---|---|---|
| 0% | MID 40 | 165 MAD | ✅ STRONG |
| 10% | MID 40 | 143 MAD | ✅ ACCEPTABLE |
| 15% | MID 40 | 132 MAD | ✅ ACCEPTABLE |
| 20% | MID 40 | 121 MAD | ✅ ACCEPTABLE |
| 20% | HIGH 60 | 101 MAD | ✅ ACCEPTABLE (barely) |

**Floor breach: NONE.**

### Human-Review Issues

**Issue P1:** Should prise be 220 MAD or 200 MAD?
- 200 MAD: matches diagnostic floor, consistent simplicity.
- 220 MAD: marginally better economics; clearer separation from diagnostic price; absorbs the ≤20 MAD connector consumable comfortably.
- **Recommendation:** 220 MAD.

**Issue P2:** Client-supplied vs artisan-supplied outlet: should FIXEO offer an "all-inclusive" version?
- Keeping labour-only cleaner for pilot. "All-inclusive" adds material variability risk.
- **Recommendation:** Client-supplied as default for pilot. Artisan-supplied = disclosed+approved separately.

> **HUMAN DECISION P1:** Approve 220 MAD? _____________
> **HUMAN DECISION P2:** Client-supply policy confirmed? _____________

---

## Service 3: electricite.interrupteur_remplacement — 200 MAD (simple) / 250 MAD (va-et-vient)

### External Market Evidence
- afous.ma per-unit: 70–80 DH (same table as prise, 480 relevés)
- mano.ma simple switch: 80–150 DH per unit (labour only)
- mano.ma va-et-vient: 150–250 DH forfait
- Market anchor: simple 150–220 DH; va-et-vient 200–280 DH

### Proposed FIXEO Prices
- **Simple interrupteur: 200 MAD FIXED**
- **Va-et-vient: 250 MAD FIXED**

### Exact Scope

**Simple interrupteur INCLUDED:**
- Standard travel + circuit isolation
- Remove existing switch, reconnect conductors, install client-supplied switch
- Minor connectors ≤10 MAD
- Functional test

**EXCLUDED:**
- Switch hardware — client-supplied
- Dimmer switch
- Smart/connected switch
- Va-et-vient (separate scope)
- Damaged wiring
- Wall repair

**Va-et-vient INCLUDED:**
- Same as simple × 2 switching positions
- Connectors ≤15 MAD
- Verify correct live/loop/switch conductor assignment

**EXCLUDED:** Everything in simple exclusions + 3-way or more complex systems.

### Commission Sensitivity — Simple (200 MAD, consumables 10 MAD)

| Commission | Fuel | Net | Floor? |
|---|---|---|---|
| 0% | MID 40 | 150 MAD | ✅ STRONG |
| 10% | MID 40 | 130 MAD | ✅ ACCEPTABLE |
| 15% | MID 40 | 120 MAD | ✅ ACCEPTABLE |
| 20% | MID 40 | 110 MAD | ✅ ACCEPTABLE |
| **20%** | **HIGH 60** | **90 MAD** | **⚠️ FLOOR BREACH** |

**Floor breach: YES** — simple interrupteur at 200 MAD fails at 20% commission + HIGH fuel (90 MAD < 100 MAD). This is the only floor breach across all five services.

**Mitigation options:**
- (A) Raise simple interrupteur to 220 MAD → all scenarios pass
- (B) Cap commission at 15% for this service
- (C) Accept the breach as an extreme edge case (20% commission + HIGH fuel simultaneously)

**Recommendation:** Option A — raise to 220 MAD to eliminate floor breach. Difference from 200 MAD is only 20 DH to client; margin improvement is material.

### Commission Sensitivity — Va-et-vient (250 MAD, consumables 15 MAD)

| Commission | Fuel | Net | Floor? |
|---|---|---|---|
| 0% | MID 40 | 195 MAD | ✅ STRONG |
| 10% | MID 40 | 170 MAD | ✅ STRONG |
| 15% | MID 40 | 157.5 MAD | ✅ STRONG |
| 20% | MID 40 | 145 MAD | ✅ ACCEPTABLE |
| 20% | HIGH 60 | 125 MAD | ✅ ACCEPTABLE |

**Floor breach: NONE.**

### Human-Review Issues

**Issue I1:** Simple interrupteur: 200 MAD (floor breach at 20%+HIGH) or 220 MAD (all scenarios clear)?
- **Recommendation:** 220 MAD. Eliminates floor breach. Identical to prise price for same complexity. Simple and consistent.

**Issue I2:** Single price for both simple + va-et-vient, or two separate prices?
- Single price at 220 MAD for both: simpler UX. Va-et-vient artisan gets same pay for more work.
- Two prices (220/250 or 220/270): more precise. Va-et-vient takes ~2× longer.
- **Recommendation:** Two prices. Va-et-vient is a materially different scope (2 positions, 45–60 min vs 25–30 min).

> **HUMAN DECISION I1:** Simple price: 200 or 220 MAD? _____________
> **HUMAN DECISION I2:** Va-et-vient separate at 250 MAD or unified? _____________

---

## Service 4: electricite.luminaire_installation — 220 MAD

### External Market Evidence
- mano.ma plafonnier simple: 150–300 DH (mid 225 DH)
- mano.ma lustre décoratif: 300–600 DH (EXCLUDED from standard)
- Market anchor for simple fixture: 200–250 DH

### Proposed FIXEO Price: 220 MAD FIXED

### Exact Scope

**INCLUDED (standard plafonnier/applique):**
- Standard travel
- Voltage verification at existing point
- Disconnect/remove existing fixture if present
- Prepare conductors, mount and connect client-supplied fixture
- Wire connectors ≤15 MAD
- Functional test + earth verification if applicable

**EXCLUDED:**
- Fixture — **CLIENT SUPPLIES**
- New circuit or wiring
- New ceiling rose or back-box
- Heavy fixture (>10 kg) requiring structural mount
- Chandelier / lustre with complex wiring
- High ceiling >2.5m
- Recessed spot installation
- Multiple fixtures on same visit
- LED driver troubleshooting
- Smart lighting with programming
- Outdoor/weatherproof installation

**Client-facing label:** "Main-d'œuvre + déplacement — luminaire fourni par le client"

### Commission Sensitivity (220 MAD, consumables 15 MAD)

| Commission | Fuel | Net | Floor? |
|---|---|---|---|
| 0% | MID 40 | 165 MAD | ✅ STRONG |
| 10% | MID 40 | 143 MAD | ✅ ACCEPTABLE |
| 15% | MID 40 | 132 MAD | ✅ ACCEPTABLE |
| 20% | MID 40 | 121 MAD | ✅ ACCEPTABLE |
| 20% | HIGH 60 | 101 MAD | ✅ ACCEPTABLE (barely) |

**Floor breach: NONE.**

### Human-Review Issues

**Issue L1:** Spot installation — should it be a separate service at per-unit pricing?
- Recessed spots require: hole cutting, housing installation, LED driver, connection per spot.
- Completely different scope from plafonnier. Cannot be included at 220 MAD.
- **Recommendation:** Separate per-spot service defined in future phase. Current scope: plafonnier/applique only.

**Issue L2:** What about a "semi-heavy" fixture (5–10 kg) that fits on standard ceiling rose?
- Standard ceiling rose designed for up to ~5 kg. Anything above requires structural mount.
- **Recommendation:** Use 5 kg as threshold for standard scope. >5 kg → complexity escape → quote.

> **HUMAN DECISION L1:** Confirm 220 MAD for plafonnier/applique, spot = future? _____________
> **HUMAN DECISION L2:** Weight threshold: 5 kg? 10 kg? _____________

---

## Service 5: electricite.disjoncteur_remplacement — 250 MAD

### External Market Evidence
- afous.ma forfait: 170–200 DH (480 relevés, P30–P70, includes likely basic part, national)
- mano.ma: 400–800 DH (likely includes premium brand part, Casablanca)
- Labour-only + travel FIXEO standard: 200–350 DH range

### Proposed FIXEO Price: 250 MAD FIXED (CONDITIONAL — see safety gate)

### SAFETY GATE — MANDATORY

This service is ONLY valid when:
- Artisan confirms on arrival that the MCB is physically defective
- No repeated tripping without identified cause
- Tableau is accessible and standard residential
- No ONEE equipment involved
- Replacement MCB specification is verified as appropriate

If ANY of these conditions is not met → DIAGNOSTIC_FIRST → quote after investigation.

### ONEE Boundary — CRITICAL

The disjoncteur de branchement (limiteur de puissance, sealed utility breaker) is ONEE property. NEVER included. Client must open ONEE service request if this is the faulty component. Artisan must be able to identify the boundary on arrival.

### Exact Scope

**INCLUDED:**
- Standard travel
- Visual tableau inspection on arrival
- Confirmation that MCB replacement is warranted
- Circuit isolation (turn off downstream breakers, verify dead)
- Remove defective MCB from DIN rail
- Install client-supplied replacement MCB (correct specification)
- Reconnect load conductors
- Functional test
- Post-installation check for visible tableau anomalies

**EXCLUDED:**
- The MCB itself — **CLIENT SUPPLIES**
- Multiple MCBs
- DDR/RCD replacement
- ONEE disjoncteur de branchement (NEVER)
- Tableau repair or replacement
- Busbar work
- Wiring behind tableau
- Investigation of tripping cause
- Three-phase systems
- Earthing system work

**Client-facing label:** "Main-d'œuvre + déplacement — disjoncteur fourni par le client"

### Commission Sensitivity (250 MAD, no consumables)

| Commission | Fuel | Net | Floor? |
|---|---|---|---|
| 0% | MID 40 | 210 MAD | ✅ STRONG |
| 10% | MID 40 | 185 MAD | ✅ STRONG |
| 15% | MID 40 | 172.5 MAD | ✅ STRONG |
| 20% | MID 40 | 160 MAD | ✅ STRONG |
| 20% | HIGH 60 | 140 MAD | ✅ ACCEPTABLE |

**Floor breach: NONE. Strongest economics of the five services.**

### Human-Review Issues

**Issue MCB1:** Should FIXEO pre-booking ask a classification question to gate this service?
- Suggested pre-booking question: "Le disjoncteur est-il physiquement endommagé (cassé, qui ne se remet pas en marche après avoir tout éteint) ?"
- Answer YES → proceed with standard price.
- Answer NO (keeps tripping) → book diagnostic service instead.
- **Recommendation:** Yes — implement classification question at booking.

**Issue MCB2:** Client-supplied MCB safety — should FIXEO recommend a specific brand?
- Generic MCBs from unknown sources are safety risks.
- **Recommendation:** FIXEO should recommend certified brands in pre-booking guidance (Schneider Acti9/iC60, Legrand DX3, ABB SH200, Hager MBN).

**Issue MCB3:** Should artisan supply the MCB as an option?
- If artisan supplies: must be certified brand, declared separately, client approval before installation.
- Risk: artisan may upsell unnecessary premium product.
- **Recommendation:** Client-supplied default, artisan-supplied = disclosed + approved protocol.

> **HUMAN DECISION MCB1:** Pre-booking classification question: approve? _____________
> **HUMAN DECISION MCB2:** Brand guidance in client pre-booking: approve? _____________
> **HUMAN DECISION MCB3:** Artisan-supply protocol: confirm as described? _____________
> **HUMAN DECISION MCB4:** Price: 250 MAD confirmed? Or adjust? _____________

---

## Cross-Service Canonical Policy Decisions

### Decision CP1: Diagnostic Absorption Rule
All five candidate services qualify for diagnostic absorption (same-visit simplified repair).
Client MUST NOT pay 200 MAD diagnostic + full intervention price for same-visit standard repair.
**HUMAN DECISION CP1:** Confirm absorption rule as described? _____________

### Decision CP2: Urgency/Night/Weekend Modifiers
Remain `null` — NON-CANONICAL. No modifiers approved in this phase.
Legacy FIXEO values (+40%/+25%/+20%/+15%) not propagated.
**HUMAN DECISION CP2:** Confirm no modifiers in this phase? _____________

### Decision CP3: City Multipliers
Remain `null`. National prices only. afous.ma coefficients documented but not adopted.
**HUMAN DECISION CP3:** Confirm no city multipliers? _____________

### Decision CP4: AI Claim
`LEVEL_0 — RULE_BASED_LOOKUP`. No AI claim. Required disclaimer: "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."
**HUMAN DECISION CP4:** Confirm disclaimer requirement? _____________

---

## Proposed Final Price Summary (subject to human approval)

| Service | Architecture | Proposed price |
|---|---|---|
| electricite.diagnostic | FLAT_DIAGNOSTIC | 200 MAD |
| electricite.prise_remplacement | FLAT_INTERVENTION | 220 MAD |
| electricite.interrupteur_remplacement (simple) | FLAT_INTERVENTION | 200 or 220 MAD (see Issue I1) |
| electricite.interrupteur_remplacement (va-et-vient) | FLAT_INTERVENTION | 250 MAD |
| electricite.luminaire_installation | FLAT_INTERVENTION | 220 MAD |
| electricite.disjoncteur_remplacement | FLAT_INTERVENTION (conditional) | 250 MAD |

**All prices: human_approved = false. production_ready = false.**

---

## Economic Floor Summary

All proposed prices pass the 100 MAD artisan economic floor at 15% commission + MID fuel.
Only exception: **simple interrupteur at 200 MAD fails at 20% commission + HIGH fuel** (90 MAD net). Recommend raising to 220 MAD.

At 15% commission + MID fuel:
- diagnostic: 130 MAD net ✅
- prise_remplacement: 132 MAD net ✅
- interrupteur_simple (200 MAD): 120 MAD net ✅ (but floor breach at 20%+HIGH)
- interrupteur_simple (220 MAD alternative): 132 MAD net ✅ (no breach)
- va_et_vient: 157.5 MAD net ✅
- luminaire: 132 MAD net ✅
- disjoncteur: 172.5 MAD net ✅ (STRONG)

---

## Backward Traceability

| Version | File | Status |
|---|---|---|
| V0.1 | `registry.v0.json` | ✅ PRESERVED UNCHANGED |
| V0.1 | `sources.v0.json` | ✅ PRESERVED UNCHANGED |
| V0.1 | `evidence.v0.json` | ✅ PRESERVED UNCHANGED |
| V0.1 | `exclusions.v0.json` | ✅ PRESERVED UNCHANGED |
| V0.2 | `calibration.v0.2.json` | NEW — this phase |
| V0.2 | `fair-price-policy.v0.2.md` | NEW — this phase |
| V0.2 | `human-review.v0.2.md` | NEW — this phase (this document) |
| V0.2 | `registry.v0.2.json` | NEW — this phase |

---

*This document is a research/calibration artifact. No production code has been modified. No deployment has been performed.*
