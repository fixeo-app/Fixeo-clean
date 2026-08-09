# FIXEO Electricity Fair-Price Policy — V0.2

**Status: HUMAN_CALIBRATION_CANDIDATE — NOT PRODUCTION**
**Version:** 0.2.0
**Phase:** Phase 7B.4.1 — FIXEO Electricity Human Calibration & Fair-Price Policy
**Date:** 2026-08-09
**Supersedes:** registry.v0.json (V0.1 — preserved unchanged)

---

## ⚠️ Non-Production Notice

This document records calibration policy for FIXEO electricity services. It is a research and planning artifact. No production code, HTML, JS, CSS, or Supabase table has been modified. No deployment has been performed.

---

## 1. FIXEO_DUAL_FAIRNESS_PRINCIPLE — Canonical

The governing principle for all FIXEO pricing decisions:

> **A FIXEO price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing.**
>
> FIXEO must NOT target the cheapest market price.
> FIXEO should target a defensible central fair price.
> The objective is:
>   CLIENT_FAIRNESS + ARTISAN_VIABILITY + PRICE_PREDICTABILITY + CLEAR_SCOPE
> — not lowest-price competition.

**Electricity-specific corollary:**
> A FIXEO electricity price must additionally NEVER create an economic incentive for the artisan to bypass a safety issue in order to remain inside the fixed-price scope.

---

## 2. FIXEO_ELECTRICAL_SAFETY_OVERRIDE — Canonical

When the artisan discovers a condition that makes the intervention unsafe, materially different from what was presented, or outside the standardized scope:

```
Step 1: STOP
  Do not continue the standardized intervention.

Step 2: MAKE SAFE
  Make the immediate area safe where reasonably possible
  (e.g., turn off the relevant circuit at the tableau, insulate
  exposed conductors, prevent accidental re-energization).

Step 3: EXPLAIN
  Inform the client clearly of the discovered condition.
  Be factual. Do not minimize or exaggerate.

Step 4: DECLARE
  State explicitly:
  "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO."

Step 5: DO NOT INCREASE SILENTLY
  The original FIXEO fixed price is not automatically replaced.
  The client retains the right to decline additional work.

Step 6: QUOTE
  Provide a new quote for the required additional scope,
  OR refer the client to a diagnostic/investigation service.

Step 7: APPROVE
  Obtain explicit client approval before continuing.

Step 8: CONTINUE
  Only then perform the additional or revised work.
```

**The safety override takes absolute precedence over price compliance.** An artisan who bypasses a safety issue to stay within the FIXEO fixed-price scope is acting outside FIXEO service standards and assumes full personal liability.

---

## 3. Earth / Ground Wire Policy — Canonical

### 3A. General Principle

The presence, connectivity, and adequacy of the earth/ground conductor (conducteur de protection, fil vert-jaune) must be verified as part of every FIXEO electrical intervention involving live components.

### 3B. Condition → Action Matrix

| Earth Condition Discovered | Action Required |
|---|---|
| Earth present, connected, continuity confirmed | Proceed with standardized intervention. |
| Earth present but disconnected — easily reconnectable (e.g., loose screw terminal) | Reconnect if within standard scope. Document and inform client. |
| Earth wire missing at the outlet/switch only — circuit has earth at distribution | Proceed with standardized intervention at the outlet. Inform client that outlet-level earth is absent and recommend full installation audit. Cannot represent the installation as compliant. |
| Earth completely absent from the circuit (no earth conductor in the cable run) | **SAFETY_OVERRIDE** — declare HORS PÉRIMÈTRE. Cannot install an earthed outlet where no earth circuit exists. Provide diagnostic referral. Refuse to complete the requested installation as if it were compliant. |
| Earth conductor damaged, melted, or undersized | **SAFETY_OVERRIDE** — stop, make safe, declare HORS PÉRIMÈTRE, quote for cable replacement. |
| Legacy two-wire installation without earth in a zone requiring earth (bathroom, kitchen) | **SAFETY_OVERRIDE** — mandatory. Cannot install an earthed socket on a two-wire circuit and represent it as compliant. |
| Earth present but appears incorrectly connected (e.g., neutral used as earth) | **SAFETY_OVERRIDE** — stop, make safe, explain safety risk, declare HORS PÉRIMÈTRE. Never correct a bonding error under a fixed-price intervention. |

### 3C. Documentation Requirement

Whenever an earth condition triggers a client notification, the artisan must communicate this clearly before leaving. FIXEO should track `earth_issue_noted` as a future observation field.

### 3D. Non-Compliance Declaration

The artisan must NOT represent an intervention as compliant when earth continuity is absent or defective. A prise or interrupteur installed without earth in a zone requiring it is not a completed FIXEO standard service — it is an incomplete and potentially dangerous installation.

---

## 4. ONEE / Utility Boundary — Canonical

### 4A. Technical Boundary

In Morocco, the electrical installation is divided at the **disjoncteur de branchement** (main service entrance breaker), which is owned and sealed by ONEE (Office National de l'Électricité et de l'Eau Potable) or the relevant utility provider.

```
[ONEE supply]
    │
    ├── Compteur (meter) — ONEE property
    │
    ├── Disjoncteur de branchement — ONEE property, sealed
    │       This is NOT a standard modular circuit breaker.
    │       It is a utility-owned service entrance device.
    │
    ▼
[Private installation boundary]
    │
    ├── Tableau divisionnaire / tableau de distribution
    │       (private — artisan scope)
    │
    ├── Disjoncteurs de circuit — MCBs (private — artisan scope)
    │
    ├── Interrupteurs différentiels / DDRs (private — artisan scope)
    │
    └── Circuits / prises / interrupteurs / luminaires
            (private — artisan scope)
```

### 4B. Private vs ONEE — Decision Matrix

| Component | Owner | FIXEO Scope? |
|---|---|---|
| Câbles ONEE / réseau BT | ONEE | ❌ Never |
| Compteur (meter) | ONEE | ❌ Never |
| Disjoncteur de branchement (fusible de tête / limiteur) | ONEE | ❌ Never — requires ONEE authorization |
| Borne de raccordement ONEE | ONEE | ❌ Never |
| Tableau divisionnaire | Private | ✅ Artisan scope |
| Disjoncteurs de circuit (MCBs) in tableau | Private | ✅ Artisan scope |
| Interrupteurs différentiels (DDRs/RCDs) | Private | ✅ Artisan scope |
| Prises, interrupteurs, luminaires | Private | ✅ Artisan scope |
| Mise à la terre (earthing system) | Private | ✅ Artisan scope |

### 4C. Operational Rule for disjoncteur_remplacement

The standardized FIXEO `electricite.disjoncteur_remplacement` service applies EXCLUSIVELY to standard modular MCBs (disjoncteurs de circuit) in the private distribution board.

**It NEVER applies to:**
- The disjoncteur de branchement (utility service entrance breaker)
- Any ONEE-sealed or utility-sealed component
- The meter or its associated terminals
- Any component upstream of the private distribution board

If the client describes a problem that involves ONEE-controlled equipment, the artisan must:
1. Identify the equipment as ONEE-controlled.
2. Inform the client that this requires an ONEE service request (not a private electrician intervention).
3. Decline to perform the work under any FIXEO fixed-price scope.
4. Optionally assist the client in initiating an ONEE service request.

### 4D. Morocco ONEE Contact / Process

ONEE client services: 0801 00 20 20 (numéro vert). For branchement issues, the client must open an ONEE intervention request. This is NOT an artisan/FIXEO matter.

---

## 5. HORS PÉRIMÈTRE PRIX FIXEO — Workflow

> A FIXEO fixed price must **NEVER silently increase.**

```
1. STOP — do not perform additional out-of-scope work without approval
2. MAKE SAFE — insulate, isolate, prevent re-energization where needed
3. IDENTIFY — name the specific, objective escape condition
4. EXPLAIN — inform client clearly, factually, without pressure
5. DECLARE — "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
6. QUOTE — provide additional quote or diagnostic referral
7. APPROVE — obtain explicit client approval
8. CONTINUE — only then proceed
```

The client retains the right to decline and pay only the diagnostic fee (200 MAD) where applicable.

The electrical safety variant adds Step 2 (make safe) not present in the plumbing workflow.

---

## 6. Diagnostic Absorption Rule — Canonical for Electricity

Consistent with the plumbing diagnostic model (7B.3.3):

> If the client immediately accepts a qualifying standardized FIXEO electrical repair completable during the **SAME visit**, the diagnostic fee (200 MAD recommended) is **ABSORBED** into the intervention price.

**The client must NOT pay:**
```
200 MAD diagnostic fee
+
full standardized FIXEO intervention price
```
for a simple same-visit standard repair.

**The 200 MAD diagnostic remains payable when:**
- No repair is performed
- The repair requires a new quote (scope outside standardized services)
- Diagnosis is inconclusive (problem requires return visit)
- Specialist equipment is required (thermal camera, clamp meter for hidden faults)
- The fault is discovered to be in ONEE-controlled equipment

**Qualifying services for same-visit absorption:**
- `electricite.prise_remplacement`
- `electricite.interrupteur_remplacement`
- `electricite.luminaire_installation`
- `electricite.disjoncteur_remplacement` (if cause confirmed during same visit as a single defective MCB)

**Morocco market note:** Electricians in Morocco commonly include diagnosis in the intervention forfait for simple visible faults. No confirmed deductible model found (same as plumbing). Absorption rule is FIXEO policy innovation. Diagnostic-fee-only (without repair) is confirmed Moroccan standard practice.

---

## 7. Materials / Parts Policy — Canonical for Electricity

### 7A. Canonical Definition

```
FIXEO standardized electrical price =
  LABOUR + TRAVEL + SMALL CONSUMABLES ONLY

Major electrical component =
  SEPARATE ITEM (not included in FIXEO standard price)
```

### 7B. Small Consumables — Always Included

Items that are absorbed into the standard price (≤30 MAD total per intervention):

| Consumable | Examples | Max value |
|---|---|---|
| Wire connectors | Domino, Wago 221, serre-câbles | ≤30 MAD total |
| Electrical tape | For insulation during work | Included |
| Cable ties | If needed for routing | Included |

### 7C. Major Components — Always Excluded (client-supplied or separately declared)

| Component | Client-Supply Policy | Retail cost range |
|---|---|---|
| Prise électrique | Client supplies by default | 20–120 DH (generic to Legrand/Schneider) |
| Interrupteur | Client supplies by default | 15–100 DH |
| Va-et-vient (pair) | Client supplies by default | 30–150 DH (×2) |
| Luminaire/plafonnier | Client supplies (IS the service premise) | Variable |
| Disjoncteur MCB | Client supplies by default | 40–200 DH (generic to Schneider iC60) |
| Câble électrique | Separately quoted | Per metre × section |

### 7D. Artisan-Supplied Part Protocol

If the artisan supplies a major component at the client's request:
1. Part must be named and described.
2. Part price must be stated explicitly to the client.
3. Client must approve the part price BEFORE installation begins.
4. Part cost must NEVER be absorbed into the FIXEO standard labour price.
5. Artisan must supply certified parts only (Schneider, Legrand, ABB, Ingelec, or equivalent certified brand) — never uncertified generic components for safety-critical parts (breakers, DDRs).

### 7E. Client Guidance Template

> "Avant l'intervention, achetez [le composant] en droguerie ou chez un grossiste en matériel électrique. Si vous n'êtes pas sûr du modèle, l'artisan peut vous conseiller par téléphone avant la visite."

---

## 8. Multiple-Item Policy — Canonical

**The standardized FIXEO price applies to ONE item per call-out**, unless explicitly stated otherwise.

- 1 prise → standard price
- 5 prises → NOT 5× the standard single-prise price
- Multi-item work requires a separately defined batch-price model (future phase)

When a client requests multiple items during a single visit, the artisan should quote a batch price for the full job, clearly outside the FIXEO single-item standardized scope. FIXEO must not display single-item prices in a way that implies they multiply linearly.

---

## 9. Price Provenance Doctrine — Canonical

These prices are NOT:
- Artisan-declared prices
- Statistically proven transaction medians
- AI-generated prices
- Machine-learning predictions
- Official regulated Moroccan tariffs
- Automatically computed outputs

These prices ARE:
```
FIXEO_HUMAN_CALIBRATED_PILOT
```
> "FIXEO human-calibrated pilot price based on aggregated Moroccan market research and dual-fairness economic review."

**Current maturity level:** `LEVEL_0 — EXTERNAL_RESEARCH / HUMAN_CALIBRATION`

**Prohibited terminology (current system):**
- "FIXEO AI Price", "AI-powered pricing", "Prix calculé par IA"
- Any claim of statistical precision
- "Garanti" or fixed-price guarantee (FIXEO price is a reference — artisan may quote differently)

**Required future UI disclaimer:**
> "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."

---

## 10. Artisan Economic Model — Canonical

```
ART_NET_BEFORE_LABOUR = G_ART - T_FUEL - MAT

where:
  G_ART  = FIXEO_PRICE × (1 − commission_rate)
  T_FUEL = transport cost (round trip)
  MAT    = basic consumables included in FIXEO price
```

**Fuel cost scenarios (Casablanca urban):**
- LOW: 25 MAD
- MID: 40 MAD
- HIGH: 60 MAD

**Economic floor:**
```
ART_NET_BEFORE_LABOUR ≥ 100 MAD (absolute minimum viability guard)
```

100 MAD is the floor — NOT the target. A good FIXEO electricity price should leave materially more than 100 MAD.

**Electricity-specific note:** Electricians carry specialized tools and test equipment (multimeter, tournevis testeur, pince ampèremétrique) with associated capital cost. This slightly elevates the required net vs equivalent plumbing work. The ≥100 MAD floor remains the check, but STRONG economics should target ≥150 MAD net at 15% commission.

---

## 11. Urgency/Night/Weekend Policy — Canonical

```
urgency_modifier = null
night_modifier   = null
weekend_modifier = null
```

All FIXEO legacy values (+40%/+25%/+20%/+15%) remain **NON-CANONICAL**.

Market evidence (mano.ma editorial): nuit +50–100%, weekend +40–60%, soir +30–50%, jours fériés +60–100%. These are higher than plumbing equivalents due to safety/risk factor of electrical work.

FIXEO must NOT display any surcharge percentage as contractually guaranteed.
Required future disclosure: "Interventions en soirée et week-end : majoration possible — tarif artisan prévalent."

---

## 12. Geographic Policy — Canonical

```
city_adjustment = null
market_scope    = NATIONAL_MOROCCO
```

Six recommended prices are national pilot reference prices.
Casablanca = `ECONOMIC_STRESS_TEST_ONLY` — not a universal price multiplier.

afous.ma coefficients (Casa 1.00, Rabat/Marra 0.95, Agadir/Tanger 0.90, Fès/Meknès 0.85) are documented research context — FIXEO cannot adopt without own transaction data.

---

## 13. Pricing Maturity Roadmap

| Level | Threshold | Current? | Capability |
|---|---|---|---|
| LEVEL_0 | External research + human calibration | **✅ CURRENT** | "Estimation indicative FIXEO" |
| LEVEL_1 | ≥5 obs/service, ≥3 artisans | Not yet | "Estimation FIXEO" |
| LEVEL_2 | ≥30 obs/service, ≥3 artisans, ≥6 months | Not yet | Weighted median |
| LEVEL_3 | ≥20 obs/service/city | Not yet | City-specific ranges |
| LEVEL_4 | ≥100 obs/service, trained+validated model | Not yet | "FIXEO Estimation IA" legitimate |

---

## 14. Required Future Schema Additions (not in scope for this phase)

```sql
-- Priority 1: service code per mission
ALTER TABLE missions ADD COLUMN service_code text;

-- Priority 2: actual paid price
ALTER TABLE missions ADD COLUMN final_price_DH numeric;

-- Priority 3: electrical-specific
ALTER TABLE missions ADD COLUMN earth_condition text;     -- 'present'/'absent'/'defective'/'not_checked'
ALTER TABLE missions ADD COLUMN safety_override_triggered boolean;
ALTER TABLE missions ADD COLUMN scope_changed boolean;
ALTER TABLE missions ADD COLUMN part_supplied_by text;   -- 'client'/'artisan'/'none'
ALTER TABLE missions ADD COLUMN part_cost_DH numeric;    -- artisan-supplied part declared cost
```

---

## 15. Version Provenance Chain

```
V0.1 (Phase 7B.4)    External market research → sources/evidence/registry
  ↓
V0.2 (Phase 7B.4.1)  Human calibration → scope contracts, economic model, candidacy
  ↓
V0.3 (Future)        Human price decision → frozen approved pilot prices (pending human review)
  ↓
V1.0 (Future)        First production-ready version → after formal FIXEO product + legal review
```

---

*This document is a research and policy artifact. No production code references this file. No deployment has been performed.*
