# FIXEO Climatisation — Fair Price Policy
## Phase 7B.6.1 — Research Draft

**Status:** RESEARCH_DRAFT — NOT PRODUCTION — HUMAN DECISION REQUIRED  
**Date:** 2026-08-09  
**All prices:** Daytime base only  
**Night/weekend/urgency modifiers:** null (not approved)  
**City multipliers:** null

---

## 1. Core Pricing Architecture

### 1.1 Dual-Fairness Principle

All FIXEO climatisation prices are calibrated to simultaneously:
1. Protect the **client** from arbitrary overpricing, undefined scope, and hidden costs
2. Protect the **artisan** from economically unsustainable underpricing that incentivizes unsafe shortcuts

Neither side alone determines the price. An artisan who cannot sustain 100 MAD net minimum per intervention at 20% commission + high fuel must not be expected to perform a FIXEO service at that price.

### 1.2 Provenance

```
FIXEO_HUMAN_CALIBRATED_PILOT
Maturity: LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

These are not AI-generated prices. They are not official Moroccan tariffs. They are not regulated prices. They are not statistically proven transaction medians. They are human-calibrated reference prices based on Moroccan market research and dual-fairness economic analysis.

### 1.3 Client Disclaimer (mandatory on all price displays)

```
"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."
```

---

## 2. FIXEO Climatisation Pricing Structure (Phase 7B.6.1 Pilot)

### 2.1 The 8 Pilot Services

| Service Code | Label | Architecture | FIXEO Proposed Price | Unit |
|---|---|---|---|---|
| CLIM-002 | Diagnostic climatisation + déplacement | FIXED | 250 MAD | Par intervention |
| CLIM-003 | Entretien annuel standard | FIXED | 300 MAD | Par unité intérieure |
| CLIM-004 | Nettoyage profond (int + ext) | FIXED | 450 MAD | Par système (unité int + unité ext) |
| CLIM-009 | Débouchage évacuation condensats | FIXED | 220 MAD | Par intervention |
| CLIM-013 | Réparation fuite accessible — labour seul | CONDITIONAL_FIXED | 600 MAD | Par intervention (conditionnel) |
| CLIM-020 | Installation mono-split ≤3m cuivre | CONDITIONAL_FIXED | 900 MAD | Par installation |
| CLIM-021 | Installation mono-split ≤5m cuivre | CONDITIONAL_FIXED | 1 100 MAD | Par installation |
| CLIM-030 | Démontage split (pump-down + dépose) | FIXED | 550 MAD | Par système |

All `human_decision = PENDING`. No price is active.

### 2.2 What Every FIXEO Climatisation Price Includes

**Included in ALL standardized prices:**
- Labour specific to the defined intervention
- Artisan travel/déplacement
- Standard small consumables where applicable (cleaning products, brazing rods, nitrogen test, wall plugs)

**NEVER silently included:**
- The AC unit/climatiseur (always client-supplied)
- Refrigerant (always separately billed — never bundled)
- Replacement parts (capacitor, PCB, motor, compressor — always separately quoted and approved)
- Extended copper beyond included length (CLIM-025 per metre)
- Access equipment for difficult access (ladder, scaffolding — DEVIS)
- Electrical panel connection (CLIM-029 or separate electrician)

### 2.3 Hardware Disclosure Protocol

Whenever a replacement part is required (beyond the standardized service scope):

```
1. IDENTIFY   → exact part needed (type, reference, compatibility)
2. PROPOSE    → part source and price estimate before touching it
3. STATE      → price explicitly before installation
4. OBTAIN     → explicit client approval (verbal minimum, written preferred for parts > 200 MAD)
5. INSTALL    → only after approval
6. RECEIPT    → provide purchase receipt or description of part to client
```

---

## 3. Installation Scope Contracts

### 3.1 CLIM-020 — Installation Mono-Split ≤3m (Canonical Scope)

**Price: 900 MAD (pending human approval)**

**INCLUDED:**
| Element | Specification |
|---|---|
| Labour | Indoor unit wall mounting, outdoor unit placement |
| Wall bracket (support mural) | 1× standard galvanized console included |
| Copper line set | Up to 3 linear metres (1/4" + 3/8" or 3/8" + 5/8" depending on BTU) |
| Copper insulation | Armaflex or equivalent sleeve included |
| Inter-unit electrical cable | Standard H05RN-F or equivalent, up to 3m |
| Condensate drain pipe | Up to 3m, to accessible drain point |
| Wall drilling (perçage) | 1× standard passage through concrete/brick ≤25cm |
| Vacuum procedure | Full vacuum pump-down minimum 30 min (MANDATORY — not optional) |
| Commissioning | Functional test: cooling cycle 10 min, temperature check |
| Consumables | Screws, wall anchors, pipe glands, sealing compound |

**EXPLICITLY EXCLUDED:**
| Element | Note |
|---|---|
| AC unit (climatiseur) | Always client-supplied — price never includes equipment |
| Copper beyond 3m | Billed at CLIM-025 (110 MAD/m proposed) |
| Second wall drilling | Additional drilling billed at CLIM-027 (150 MAD proposed) |
| Thick reinforced concrete > 25cm | DEVIS — requires specialist drill |
| Electrical panel connection / breaker | CLIM-029 or separate electrician |
| Outdoor unit on facade needing ladder | DEVIS — accès difficile CLIM-028 |
| Height > 2.5m for indoor unit | DEVIS — accès difficile |
| False ceiling routing / concealed conduit | DEVIS |
| Decorative trunking (goulotte) | Separate item if requested |
| Condensate pump (pompe de relevage) | Separate item if gravity drain not available |
| Removal of existing unit | CLIM-030 — separate service |
| Multi-split, cassette, or ducted | Different service category |

### 3.2 CLIM-021 — Installation Mono-Split ≤5m (Canonical Scope)

**Price: 1 100 MAD (pending human approval) — 200 MAD delta over CLIM-020**

**IDENTICAL to CLIM-020 in all aspects EXCEPT:**
| Element | CLIM-020 | CLIM-021 |
|---|---|---|
| Copper run included | Up to 3 linear metres | Up to 5 linear metres |
| Price | 900 MAD | 1 100 MAD |
| Price delta | — | +200 MAD (for 2 extra metres copper + insulation + time) |

**The 200 MAD delta corresponds to real cost:**
- 2 extra metres copper + insulation: approximately 120–160 MAD material
- 20–30 min additional labour: approximately 50–80 MAD labour equivalent
- Total justified delta: 170–240 MAD → 200 MAD is the midpoint

**Why two SKUs (3m and 5m) instead of per-metre pricing:**  
Per-metre pricing creates client confusion and negotiation friction. Two defined scope tiers with a clear price each is more transparent for clients and simpler for artisans to quote. Mètres beyond 5m are then billed at the CLIM-025 unit rate.

### 3.3 Installation Decision Tree

```
INSTALLATION REQUEST RECEIVED
        │
        ▼
Client supplies their own AC unit?
   YES → Continue
   NO  → HORS PÉRIMÈTRE CLIM-020/021 — Separate equipment quote required
        │
        ▼
Distance indoor→outdoor: how many metres?
   ≤3m  → CLIM-020 (900 MAD)
   4–5m → CLIM-021 (1 100 MAD)
   >5m  → CLIM-021 + CLIM-025 × additional metres
        │
        ▼
Outdoor unit access: standard balcony/terrace/ground?
   YES → Continue
   NO (ladder/scaffold needed) → HORS PÉRIMÈTRE standard → DEVIS
        │
        ▼
Indoor unit height ≤2.5m from floor?
   YES → Continue
   NO  → HORS PÉRIMÈTRE standard → DEVIS
        │
        ▼
Concrete wall ≤25cm for drilling?
   YES → 1 drilling included
   NO  → Additional drilling or DEVIS for thick concrete
        │
        ▼
Electrical supply ≤2m from proposed indoor unit location?
   YES → Electrical connection included in scope
   NO (breaker/panel work needed) → Recommend electrician for panel work
        │
        ▼
Confirm fixed price and scope with client → PROCEED
```

---

## 4. Diagnostic Policy

### 4.1 FIXEO Climatisation Diagnostic Policy

**Recommended policy (FIXEO decision — not universal Moroccan market standard):**

```
Diagnostic fee: 250 MAD (CLIM-002)
Deductible from same-visit standardized repair: YES
Conditions: Client must accept a FIXEO standardized repair service on the same visit

Examples:
- Diagnostic 250 MAD → client accepts CLIM-003 entretien 300 MAD → total due: 300 MAD (250 absorbed)
- Diagnostic 250 MAD → client accepts CLIM-016 condensateur labour 250 MAD → total due: 250 MAD (diagnostic absorbed, repair at 250 MAD)
- Diagnostic 250 MAD → no repair accepted → total due: 250 MAD
- Diagnostic 250 MAD → repair quote provided but client declines → total due: 250 MAD
```

This model:
- Protects the client from "double-paying" when repair is straightforward
- Ensures the artisan is always compensated for diagnostic work
- Incentivizes the client to accept repairs (economic benefit)
- Is consistent with formal Moroccan platform practice (fixandgo.ma)
- Is labeled as FIXEO policy — not presented as a universal Moroccan market standard

### 4.2 Services Requiring DIAGNOSIS_FIRST (cannot offer fixed repair price without diagnosis)

| Service | Reason |
|---|---|
| CLIM-006 Panne quelconque | Root cause unknown without diagnosis |
| CLIM-008 Détection fuite | Fuite location must be confirmed before repair or recharge |
| CLIM-012 R22 recharge | System age/condition must be assessed |
| CLIM-019 Compresseur | Part cost and viability must be confirmed |

---

## 5. Refrigeration Integrity Policy

### 5.1 Core Doctrine (Frozen as FIXEO Technical Policy)

**FIXEO prohibits blind refrigerant top-up.**

No FIXEO-endorsed artisan may offer or perform a refrigerant recharge without:
1. Prior confirmation that refrigerant loss is due to a diagnosable cause
2. Completion of CLIM-008 (leak detection) or equivalent diagnostic step
3. Repair of identified leak (CLIM-013) or explicit client acknowledgment of leak persistence
4. CLIM-014 vacuum procedure before recharge
5. Recharge of the correct refrigerant type and manufacturer-specified quantity
6. Pressure and temperature verification post-recharge

### 5.2 The Required Refrigerant Sequence

```
SYMPTOM: Climatiseur refroidit moins bien / perte progressive d'efficacité
    ↓
STEP 1: CLIM-006/CLIM-002 — Diagnostic général
    ↓
STEP 2: CLIM-007 — Contrôle pression réfrigérant (manomètre)
    ↓ If low pressure:
STEP 3: CLIM-008 — Détection fuite (OBLIGATOIRE avant toute recharge)
    ↓ If leak found and accessible:
STEP 4: CLIM-013 — Réparation fuite (brasure) — client approval required
    ↓
STEP 5: CLIM-014 — Tirage au vide (OBLIGATOIRE avant recharge)
    ↓
STEP 6: CLIM-010/011/012 — Recharge réfrigérant adapté (type + quantité) — client approval + separate billing
    ↓
STEP 7: Test température + pression — confirmer bon fonctionnement
```

### 5.3 Prohibited Practices

The following are explicitly prohibited for FIXEO-endorsed artisans:

| Practice | Reason |
|---|---|
| Blind top-up without leak detection | Temporary fix, commercially dishonest, repeat billing |
| Recharge without vacuum | Moisture ingress damages compressor |
| Adding R32 to an R410A system | Incompatible — dangerous pressure/temperature behavior |
| Venting refrigerant to atmosphere | Environmental harm, incompatible with Morocco's international obligations |
| Recommending repeated R22 recharge without replacement advisory | Commercially inappropriate for phase-out refrigerant |

### 5.4 R22 Client Advisory (Mandatory for R22 services)

When servicing an R22 system, the artisan must communicate:

```
"Votre climatiseur utilise le réfrigérant R22, qui est en cours de suppression progressive
au niveau international dans le cadre du Protocole de Montréal. Le R22 devient de plus en plus
rare et coûteux. La recharge R22 est une solution temporaire uniquement. Nous vous recommandons
de prévoir le remplacement de votre système lors de votre prochaine décision d'investissement."
```

*Note: This advisory is based on Morocco's phase-out obligations under the Montreal Protocol. FIXEO makes no specific claims about enforcement mechanisms or certification requirements without a verified regulatory source.*

### 5.5 R32 Safety Note (Mandatory for R32 services)

When working on R32 systems:

```
"Le réfrigérant R32 est classifié A2L (légèrement inflammable).
Les travaux sur ce type de système nécessitent un équipement adapté
et doivent être réalisés loin de toute source d'ignition."
```

---

## 6. What FIXEO Does NOT Claim

| Claim | Status |
|---|---|
| These are AI-generated prices | FALSE — human calibrated |
| These are statistically proven market medians | FALSE — research-based ranges, no statistical sample |
| These are official Moroccan tariffs | FALSE — no regulatory framework exists |
| These are guaranteed prices | FALSE — indicative, confirmed with artisan before intervention |
| These are prices for R22 compliant licensed operators specifically | UNVERIFIED — no specific Moroccan R22 licensing data available |
| These prices are definitively final | FALSE — pending human calibration approval |

---

## 7. Deferred Services

The following services are deferred from Phase 7B.6.1 calibration pending separate doctrine:

| Category | Reason for Deferral |
|---|---|
| CLIM-007 Pressure check | Typically bundled with diagnostic — standalone pricing utility low |
| CLIM-008 Leak detection | Refrigerant doctrine must be fully approved before pricing this gate service |
| CLIM-010/011/012 Recharge | Refrigerant billing rules (per-kg pricing, type segregation) require separate approval |
| CLIM-014 Vacuum standalone | Usually bundled — standalone rare |
| CLIM-015 Full recharge after repair | Requires CLIM-010/011 refrigerant billing doctrine first |
| CLIM-016/017/018 Component labour | Labour-fixed-part-separate architecture requires parts catalog approval |
| CLIM-019 Compressor | Always QUOTE_REQUIRED — no fixed price possible |
| CLIM-022/023/024 Special install | Non-standard architecture — requires separate scope definition |
| CLIM-025 Extra copper | Unit price add-on — linked to CLIM-020/021 approval |
| CLIM-026/027 Support/Drilling | Add-on services — linked to installation approval |
| CLIM-028/029 Access/Electrical | Always DEVIS or cross-métier — not for fixed pricing |
| CLIM-031 Relocation | Complex service — requires CLIM-030 approval first |
| CLIM-032 Maintenance contract | Commercial model — separate B2B pricing framework |
| CLIM-033 Urgency | Policy frozen — modifier = null |
| CLIM-034/035 Generic fault/leak | Subsumed by CLIM-006 + specific repair services |

---

*This document is a research draft for human calibration purposes only. No prices are active. No production files have been modified. All values require explicit human approval before any deployment.*
