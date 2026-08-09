# FIXEO Fair-Price Policy — V0.3

**Status: HUMAN_APPROVED_PILOT_POLICY — NOT PRODUCTION**
**Version:** 0.3.0
**Phase:** 7B.3.3 — Human Price Decision Freeze
**Supersedes:** fair-price-policy.v0.2.md (V0.2 preserved unchanged)
**Date:** 2026-08-09

---

## ⚠️ Non-Production Notice

This document records approved pilot pricing policy for FIXEO plumbing services. It is a research and planning artifact. No production code references this file. No FIXEO user-facing surface has been modified.

---

## 1. Approved Pilot Prices

```
plomberie.diagnostic           = 180 MAD FIXED
plomberie.fuite_simple         = 250 MAD FIXED
plomberie.debouchage_evier     = 250 MAD FIXED
plomberie.debouchage_wc_simple = 300 MAD FIXED
plomberie.robinet_remplacement = 250 MAD FIXED
plomberie.chasse_eau           = 300 MAD FIXED

human_approved   = true (all six)
pilot_status     = HUMAN_APPROVED_PILOT (all six)
production_ready = false (all six)
```

---

## 2. FIXEO_DUAL_FAIRNESS_PRINCIPLE

This is the canonical FIXEO pricing doctrine. It is established and frozen.

> **A FIXEO price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing.**
>
> FIXEO must NOT target the cheapest market price.
> FIXEO should target a defensible central fair price.
> The objective is:
>   CLIENT_FAIRNESS + ARTISAN_VIABILITY + PRICE_PREDICTABILITY + CLEAR_SCOPE
> — not lowest-price competition.

**Corollary 1 — Viability Floor:**
No FIXEO reference price should be set at a level where a professional artisan cannot cover fuel, materials, and FIXEO commission while earning a respectable wage.

**Corollary 2 — Credibility Ceiling:**
No FIXEO reference price should be set at a level that a well-informed Moroccan client would perceive as exploitative for the clearly-defined scope.

**Corollary 3 — Transparency Over Precision:**
A clearly-scoped reference estimate with honest inclusions/exclusions is more valuable than a precise number that misrepresents what it covers.

---

## 3. Diagnostic Absorption Rule

**Frozen as canonical policy.**

```
plomberie.diagnostic = 180 MAD FIXED

Absorption condition:
  If client accepts a qualifying standardized FIXEO repair
  completable during the SAME visit,
  the 180 MAD diagnostic fee is ABSORBED into the intervention price.

The client must NOT pay:
  180 MAD diagnostic + full FIXEO intervention price
for a simple same-visit standardized repair.

The 180 MAD diagnostic remains payable when:
  - No repair is performed
  - Repair requires a new quote (out-of-scope complexity)
  - Diagnosis is inconclusive (problem requires return visit)
  - Specialized detection equipment is required

Morocco market note:
  Charging a diagnostic fee regardless of repair outcome is
  confirmed Moroccan market practice (bnidari.ma, professional consensus).
  The absorption rule is a FIXEO policy innovation.
  The French-market deductible model (fee subtracted from repair)
  has no Morocco evidence and is NOT adopted.
```

---

## 4. HORS PÉRIMÈTRE PRIX FIXEO — Complexity Escape Doctrine

**Frozen as canonical policy.**

> A FIXEO fixed price must NEVER silently increase.

```
Required workflow when an escape condition is discovered:

STEP 1: STOP
  Do not perform additional out-of-scope work without client approval.

STEP 2: IDENTIFY
  Name the specific, objective escape condition that was encountered.

STEP 3: EXPLAIN
  Inform the client clearly, factually, and without pressure.

STEP 4: DECLARE
  State explicitly: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO."

STEP 5: QUOTE
  Provide the required additional quote or revised price in writing.

STEP 6: APPROVE
  Obtain explicit client approval before continuing.

STEP 7: CONTINUE
  Only then proceed with the additional or revised work.
```

The client retains the right to decline additional work and pay only the diagnostic fee (180 MAD) where applicable.

---

## 5. Material Separation Rule

**Frozen as canonical policy.**

```
A replacement part is NEVER silently bundled into a FIXEO fixed price.

If an artisan supplies a part at the client's request:
  1. Part must be declared separately — named, described.
  2. Part price must be stated explicitly.
  3. Client must approve the part price BEFORE installation begins.
  4. The part cost must NEVER be absorbed into the FIXEO standard labour price.

Client right to self-supply:
  The client has the right to purchase any replacement part themselves
  from Bricoma, droguerie, Aswak Assalam, or any supplier of their choice.
  The artisan may provide pre-visit guidance on the correct part to purchase.
```

**Material inclusion by service:**

| Service | Consumables included | Part excluded |
|---------|---------------------|--------------|
| diagnostic | None | None |
| fuite_simple | Joint, téflon, pâte ≤50 MAD | Any part >50 MAD |
| debouchage_evier | None | Siphon replacement if needed |
| debouchage_wc_simple | None | None normally required |
| robinet_remplacement | Joint de raccord, téflon ≤50 MAD | THE TAP/MIXER |
| chasse_eau | Joint d'étanchéité ≤30 MAD | THE FLUSH MECHANISM |

---

## 6. Price Provenance Doctrine

**Frozen as canonical policy.**

These prices are NOT:
- Artisan-declared prices
- Statistically proven transaction medians
- AI-generated prices
- Machine-learning predictions
- Official regulated Moroccan tariffs
- Automatically computed output of any algorithm

These prices ARE:
```
FIXEO_HUMAN_CALIBRATED_PILOT
```
> "FIXEO human-calibrated pilot price based on aggregated Moroccan market research and dual-fairness economic review."

**Required display disclaimer (future UI):**
> "Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."

---

## 7. Geographic Policy

**Frozen as canonical policy.**

```
city_adjustment  = null
urgency_modifier = null
```

- Six prices are national pilot reference prices.
- Casablanca = `ECONOMIC_STRESS_TEST_ONLY` — not a universal price multiplier.
- No Casablanca ×1.15, Fès ×1.05, or equivalent city multipliers.
- City-specific pricing requires:
  ≥10 normalized FIXEO completed missions per service per city
  from distinct artisans over distinct time periods.
- Until that threshold is met, national pilot prices apply uniformly.

---

## 8. Urgency / Night / Weekend Policy

**Frozen as canonical policy.**

```
urgency_modifier = null
```

- No urgency/night/weekend modifiers approved in this phase.
- Legacy FIXEO values (+40%/+25%/+20%) remain NON-CANONICAL.
- FIXEO must NOT display urgency surcharges as contractually guaranteed values.
- Required client disclosure (future): "Interventions en soirée et week-end : majoration possible — tarif artisan prévalent."
- Dedicated urgency research phase required before any modifier is approved.

---

## 9. AI Terminology Doctrine

**Frozen as canonical policy.**

```
Current maturity level: LEVEL_0
  EXTERNAL_RESEARCH / HUMAN_CALIBRATION

Current system type: RULE_BASED_LOOKUP
  → deterministic table lookup
  → NOT AI
  → NOT machine learning
  → NOT statistical model
  → NOT data-driven estimation
```

**Prohibited terminology (current system):**
- "FIXEO AI Price"
- "AI-powered pricing"
- "Prix calculé par IA"
- "Estimation intelligente"
- Any equivalent claim

**"AI-powered" label is only legitimate when ALL of:**
1. Trained model on FIXEO-owned transaction data
2. Validated on held-out data
3. Minimum sample thresholds met (see Maturity Roadmap)
4. Quarterly or more frequent retraining
5. Confidence intervals output alongside estimates

---

## 10. Pricing Maturity Roadmap

| Level | Name | Threshold | Data source | Capability unlocked |
|-------|------|-----------|-------------|---------------------|
| LEVEL_0 | External Research + Human Calibration | 0 FIXEO transactions | This registry | "Estimation indicative FIXEO" |
| LEVEL_1 | Field Validated | ≥5 obs/service, ≥3 artisans | Manual review | Narrower ranges; "Estimation FIXEO" |
| LEVEL_2 | Data-Driven | ≥30 obs/service, ≥3 artisans, ≥6-month span | missions table | Weighted median; "Données FIXEO" |
| LEVEL_3 | City-Segmented | ≥20 obs/service/city, ≥3 artisans/cluster | missions + city | City-specific ranges |
| LEVEL_4 | Dynamic Intelligence | ≥100 obs/service, trained+validated model, quarterly retrain | Trained model | "FIXEO Estimation IA" legitimately usable |

**Current level: LEVEL_0**

Anti-patterns (permanently prohibited):
- Calculate city-specific prices from <10 observations per city
- Train model from <50 observations per service
- Call the system "AI" at Level 0–2
- Remove Level 0 values before Level 2 is validated
- Use training data as validation data

---

## 11. Canonical Pricing Architecture Enum

```
FIXEO_FIXED_PRICE        → Single approved price; client knows exact amount
FIXEO_NARROW_RANGE       → 2-price range; for services with legitimate small variability
FIXEO_REFERENCE_ESTIMATE → Wider range; for services where scope variation is significant
FIXEO_QUOTE_REQUIRED     → No reference price; artisan quote mandatory (salle_de_bain, etc.)
FIXEO_DIAGNOSIS_FIRST    → Diagnostic visit required before any price can be given
```

The six pilot services use `FIXEO_FIXED_PRICE`.

---

## 12. Version Provenance Chain

```
V0.1 (Phase 7B.3.1)  Raw normalized market research
  ↓
V0.2 (Phase 7B.3.2)  Human calibration — scope contracts, economic model, candidacy assessment
  ↓
V0.3 (Phase 7B.3.3)  Human-approved pilot prices — FROZEN DECISION (this document)
  ↓
V1.0 (Future)        First production-ready version — requires formal FIXEO product + legal review
```

**Rules for future versions:**
1. Never overwrite a prior version; always create a new version file.
2. `production_ready` remains `false` until formal FIXEO product sign-off.
3. Prices may only be changed through a new human calibration cycle.
4. Any price change requires a new evidence review (not just a new human decision).

---

## 13. Required Future Schema Additions

To enable LEVEL_2+ pricing, these Supabase fields must be added (not in scope for this phase):

```sql
ALTER TABLE missions ADD COLUMN service_code         text;         -- e.g. 'plomberie.robinet_remplacement'
ALTER TABLE missions ADD COLUMN final_price_DH        numeric;      -- actual amount paid
ALTER TABLE missions ADD COLUMN materials_amount_DH   numeric;      -- parts separately invoiced
ALTER TABLE missions ADD COLUMN scope_changed         boolean;      -- escape rule triggered
ALTER TABLE missions ADD COLUMN scope_change_reason   text;
ALTER TABLE missions ADD COLUMN complexity            text;         -- 'standard'/'complex'
ALTER TABLE missions ADD COLUMN urgency_context       text;
ALTER TABLE missions ADD COLUMN artisan_arrived_at    timestamptz;
ALTER TABLE missions ADD COLUMN intervention_completed_at timestamptz;
ALTER TABLE missions ADD COLUMN callback_required     boolean;
```

**Priority 1:** `service_code` — without this, transaction data cannot be aggregated by specific intervention type.
**Priority 2:** `final_price_DH` — PayPal capture amounts are currently lost permanently after payment.

---

*This document is a research and policy artifact. No production code references this file. The six pilot prices are frozen for human review and future implementation planning only.*
