# FIXEO Plumbing Fair-Price Policy — V0.2

**Status: POLICY_DRAFT — HUMAN REVIEW REQUIRED — NOT PRODUCTION**
**Version:** 0.2.0
**Supersedes methodology from:** README.md (V0.1.0)
**Authored as part of:** Phase 7B.3.2 — Human Calibration & Fair-Price Policy
**Date:** 2026-08-09

---

## ⚠️ Non-Production Notice

This document is a research and policy artifact only.
It does NOT create FIXEO prices.
It does NOT connect to any production system.
Every human decision field remains PENDING.

---

## 1. FIXEO_DUAL_FAIRNESS_PRINCIPLE

> **A FIXEO price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing. Neither side alone determines the reference. A price that is "fair to clients" but forces artisans into loss-making work is not a fair price — it is an extraction mechanism that degrades service quality over time. A price that is "fair to artisans" but unjustifiable to clients is not a fair price — it is an opacity mechanism that FIXEO exists to eliminate.**

This principle is the foundation of all FIXEO canonical pricing decisions.

**Corollary 1 — The Viability Floor:**
No FIXEO reference price should be set at a level where a professional artisan covering a normal Casablanca service zone cannot cover fuel, tools, basic consumables, and FIXEO commission while earning a respectable wage.

**Corollary 2 — The Credibility Ceiling:**
No FIXEO reference price should be set at a level that a well-informed Moroccan client, having researched alternatives, would perceive as exploitative for the defined scope of work.

**Corollary 3 — Transparency Over Precision:**
A clearly-scoped reference estimate with honest inclusions/exclusions is more valuable than a precise number that silently misrepresents what it covers.

---

## 2. Statistical Terminology Correction (V0.1 → V0.2)

### Problem with V0.1 language

V0.1 uses "P30", "P75", and "percentile" language throughout README.md and registry derivation notes. This is statistically imprecise because:

- FIXEO does not own the underlying raw observations from external publishers
- afous.ma provides P30–P70 for 3 services — this is their internal calculation over 480+ observations each
- All other sources provide editorial or platform ranges, not raw data
- FIXEO cannot verify whether editorial ranges represent true distributional percentiles

Claiming FIXEO calculated market percentiles would be an overstatement of methodological rigor.

### Replacement terminology (V0.2 forward)

| Old term | New term | Meaning |
|----------|----------|---------|
| `fair_low` (claimed P30) | `CONSENSUS_LOW` | Lower bound of convergent published ranges, excluding scope-creep lower claims; must be ≥ artisan economic floor |
| `fair_price` (claimed median) | `WEIGHTED_MARKET_ANCHOR` | Weighted central tendency using source quality weights; NOT a true median over raw transactions |
| `fair_high` (claimed P75) | `CONSENSUS_HIGH` | Upper bound of standardized-scope published ranges; excludes anomalous upper claims |

### Methodology statement (mandatory in all future displays)

> "FIXEO price references are derived from aggregated published ranges from independent Moroccan digital platforms. They are NOT calculated from a statistical sample of individual transactions owned by FIXEO. The WEIGHTED_MARKET_ANCHOR does not represent a true market median. It represents a weighted convergence of external editorial and platform sources using a documented quality-weighting methodology. True percentile calculations (P25/P50/P75) will only be introduced when FIXEO possesses sufficient normalized transaction-level observations meeting minimum sample-size thresholds."

### Source quality weights (unchanged from V0.1, now explicitly labeled)

| Grade | Weight | Basis |
|-------|--------|-------|
| B+ | 0.50 | afous.ma: declared methodology, 480+ observations per service, 12-month period |
| C+ | 0.35 | mano.ma, bnidari.ma: named publisher, multiple services, explicit materials note |
| C | 0.15 | allo-maison.ma, inworky.com: platform editorial, narrower coverage |
| D | 0.00 | Artisan self-published, undated, incompatible scope |

### Fields to rename in registry.v0.2.json

`reference_price.fair_low` → `reference_price.consensus_low`
`reference_price.fair_price` → `reference_price.market_anchor`
`reference_price.fair_high` → `reference_price.consensus_high`
`reference_price.derivation_note` → `reference_price.anchor_derivation_note`

---

## 3. Geographic Semantics Clarification

### V0.1 issue

V0.1 uses `market_scope = NATIONAL_MOROCCO` in the registry while README.md simultaneously calls Casablanca the "reference city." This is potentially misleading — a reader might infer the values apply to all of Morocco equally.

### V0.2 clarification

**`market_scope = NATIONAL_MOROCCO`** means:
> The research was conducted using sources that cover Morocco nationally. The published ranges were not systematically adjusted for any specific city. The resulting consensus values represent the broadest aggregated view of the Moroccan plumbing market, with a natural bias toward Casablanca and Rabat where most sources concentrate their observations.

**`geographic_reference_city = Casablanca`** means:
> Casablanca is used as the economic stress-test city only — the highest-cost urban environment in the dataset. If a price is economically viable for a Casablanca artisan, it is conservatively viable for artisans in lower-cost cities. Casablanca is NOT claimed to represent all Moroccan pricing. It is the floor test for economic viability.

**City multipliers:** NOT encoded in V0.2. Will only be introduced when FIXEO has ≥10 normalized accepted quotes per service per city from distinct artisans over distinct time periods.

**V0.2 meta fields (updated):**
```json
"geographic_scope": "NATIONAL_MOROCCO",
"geographic_scope_note": "Research aggregates national Moroccan published sources. Natural bias toward Casablanca/Rabat where source concentration is highest. Values are NOT city-specific and should NOT be presented as Casablanca-only prices.",
"geographic_reference_city": "Casablanca",
"geographic_reference_city_use": "ECONOMIC_STRESS_TEST_ONLY",
"city_adjustment": null,
"city_adjustment_note": "No city multipliers encoded in V0.2. Requires minimum 10 normalized FIXEO transactions per service per city from multiple artisans before encoding."
```

---

## 4. Inclusion/Exclusion Contracts — Six Candidate Services

---

### 4.1 plomberie.diagnostic

**Label:** Déplacement et diagnostic plomberie

**Scope contract:**

```
INCLUDED:
  ✓ Artisan travel within normal service zone (typically ≤20 km urban)
  ✓ Initial visual and technical inspection at the intervention site
  ✓ Verbal explanation of problem identified to client
  ✓ Verbal quote for repair work (if applicable)
  ✓ Basic manual assessment (running taps, flush test, visible pipe inspection)

EXCLUDED:
  ✗ Any repair work
  ✗ Parts of any kind
  ✗ Second visit
  ✗ Written diagnostic report or certificate
  ✗ Hidden/embedded pipe inspection (thermal camera, pressure test)
  ✗ Collective plumbing or building common systems
  ✗ Access difficulty beyond standard apartment/house

LABOUR:    included
TRAVEL:    included (IS the service)
DIAGNOSTIC: IS the service
BASIC_CONSUMABLES: NOT applicable
MAIN_REPLACEMENT_PART: NOT applicable — diagnostic only, zero parts
```

**Complexity escape conditions:**
- Client address is outside normal urban service zone (> threshold km)
- Access requires specialist equipment (scaffolding, locked technical room)
- Collective/immeuble plumbing requiring building manager authorization
- Client cannot reproduce problem during visit (intermittent fault)

**Diagnostic policy alternatives (for human decision):**

OPTION D1 — STANDALONE FEE, NEVER DEDUCTIBLE
> Diagnostic fee: 100–200 MAD. Charged regardless of whether repair proceeds. Not deductible from repair price.
> Evidence basis: bnidari.ma FAQ, artisan professional consensus, no Morocco market evidence for deductible model.
> Client communication: "Frais de diagnostic : 100–200 MAD — même si vous ne procédez pas à la réparation."

OPTION D2 — STANDALONE FEE, DEDUCTIBLE IF SAME-DAY REPAIR
> Diagnostic fee: 100–200 MAD. Waived if client books and pays the repair on the same visit through FIXEO.
> Evidence basis: common in French market; NOT observed in Morocco; would need to be introduced as FIXEO policy innovation, not market standard.
> Risk: artisans may object; no Morocco precedent; creates perverse incentive to upsell.

OPTION D3 — ABSORBED INTO STANDARDIZED INTERVENTION PRICES
> No standalone diagnostic fee displayed. For the 5 standardized services, the diagnostic micro-step is included in the intervention price.
> For complex services (fuite_encastree, chauffe_eau_reparation), a separate diagnostic fee applies.
> Evidence basis: matches current Morocco market behavior where simple interventions don't bill separately for diagnosis.

**Recommended for human review:** OPTION D3 for the 5 standardized intervention services; OPTION D1 for diagnostic-first services (fuite_localisation, chauffe_eau_reparation).

---

### 4.2 plomberie.fuite_simple

**Label:** Réparation fuite simple — visible et accessible

**Scope contract:**

```
INCLUDED:
  ✓ Artisan travel within normal service zone
  ✓ Visual identification of the fuite
  ✓ One intervention point (single leak source)
  ✓ Accessible plumbing (no wall, floor, or ceiling opening required)
  ✓ Standard repair: tightening, joint replacement, raccord sealing
  ✓ Basic sealing consumables: joint de robinetterie, joint torique,
    téflon, pâte d'étanchéité — total value ≤ 50 MAD

EXCLUDED:
  ✗ Leak inside wall, floor, or ceiling (→ fuite_encastree)
  ✗ Leak requiring pipe replacement > 20 cm
  ✗ Multiple simultaneous leak points (> 1 = separate quote)
  ✗ Flexible hose replacement > 60 MAD (→ separate part, artisan-quoted)
  ✗ Valve replacement (robinet d'arrêt, vanne) > 50 MAD
  ✗ Raccord replacement > 50 MAD
  ✗ Shower/bathtub mixer cartridge replacement (→ robinet_remplacement sub-type)
  ✗ Water damage assessment or drying
  ✗ Masonry, tiling, or plasterwork

LABOUR:    included
TRAVEL:    included
DIAGNOSTIC: included (micro-step — visual identification before repair)
BASIC_CONSUMABLES: included — joint, joint torique, téflon, pâte ≤ 50 MAD total
MAIN_REPLACEMENT_PART: EXCLUDED — any part > 50 MAD quoted separately
```

**Observable pre-arrival classification questions:**
1. Can you see where the water is coming from?
2. Is it coming from a pipe joint, a tap connection, or a visible raccord?
3. Is the pipe behind a wall or under a floor? (→ escalate to fuite_encastree)
4. Is it one leak point or multiple?

**Complexity escape conditions:**
- Leak source not visible once artisan arrives (→ fuite_localisation)
- Pipe access requires tile or wall removal
- Leak involves > 1 point
- Required part costs > 50 MAD (artisan must quote client before installing)
- Corroded pipe section requires replacement > 20 cm

---

### 4.3 plomberie.debouchage_evier

**Label:** Débouchage évier ou lavabo — méthode manuelle

**Scope contract:**

```
INCLUDED:
  ✓ Artisan travel within normal service zone
  ✓ One blocked fixture: évier (kitchen sink) OR lavabo (bathroom basin)
  ✓ Manual method: déboucheur à pression, ventouse, furet manuel (≤ 5m)
  ✓ Siphon inspection, cleaning, or basic re-seating (NO siphon replacement)
  ✓ One intervention attempt at the fixture

EXCLUDED:
  ✗ Multiple simultaneous fixtures (each additional = separate quote)
  ✗ Motorized furet / hydro-jetting (→ professional method, separate quote)
  ✗ Siphon replacement (new part > 50 MAD = client-quoted separately)
  ✗ Colonne or shared pipe access (→ debouchage_colonne)
  ✗ Chemical treatment beyond standard plumber's agent
  ✗ External drain / garden / roof drain

LABOUR:    included
TRAVEL:    included
DIAGNOSTIC: included (minimal — symptom already known)
BASIC_CONSUMABLES: NONE (débouchage consumes no materials)
MAIN_REPLACEMENT_PART: EXCLUDED
```

**Pre-arrival classification questions:**
1. Which fixture is blocked — kitchen sink, bathroom basin, or bath/shower?
2. Is the water draining very slowly or completely stopped?
3. Do multiple fixtures seem blocked at once? (→ escalate: shared pipe or colonne)
4. Has it been recurring over weeks? (→ may indicate structural issue or colonne)
5. Is water backing up into another fixture when this one drains? (→ escalate)

**Boundary: simple/manual vs. professional/motorized:**

| Condition | Classification | Price reference |
|-----------|---------------|----------------|
| Single fixture, recent blockage, slow drain | debouchage_evier (simple) | FIXEO standard |
| Recurring blockage same fixture | debouchage_evier (may upgrade) | Artisan decides method |
| Backing up to another fixture | debouchage_colonne | Separate quote |
| Multiple fixtures affected | debouchage_colonne | Separate quote |
| Kitchen grease blockage > 1 year | debouchage_evier_pro (motor) | Separate quote |

**Complexity escape conditions:**
- Simple manual method fails on-site
- Blockage located deeper than furet reach
- Multiple fixtures found affected on arrival
- Siphon cracked or corroded (requires replacement > 50 MAD)
- Access obstructed (under-sink unit, built-in furniture)

---

### 4.4 plomberie.debouchage_wc_simple

**Label:** Débouchage WC — méthode manuelle (ventouse + furet)

**Scope contract:**

```
INCLUDED:
  ✓ Artisan travel within normal service zone
  ✓ One WC fixture
  ✓ Manual method: ventouse à cloche WC, furet manuel (≤ 5m)
  ✓ One intervention attempt

EXCLUDED:
  ✗ Motorized furet / électroportatif / hydro-jetting (→ debouchage_wc_professionnel)
  ✗ WC dismantling / removal
  ✗ Pipe replacement
  ✗ Colonne/immeuble shared pipe access (→ debouchage_colonne)
  ✗ Non-standard WC (WC chimique, collectif, assainissement non-collectif)
  ✗ Foreign body extraction requiring specialized tools

LABOUR:    included
TRAVEL:    included
DIAGNOSTIC: included (minimal — symptom known in advance)
BASIC_CONSUMABLES: NONE
MAIN_REPLACEMENT_PART: EXCLUDED
```

**Pre-arrival classification questions:**
1. Is the WC completely blocked (no water drains at all) or just slow?
2. Has there been a prior manual attempt that failed? (→ professional method)
3. Do multiple fixtures (évier, lavabo, baignoire) seem affected? (→ colonne)
4. Is water backing up into the bath/shower when you flush? (→ colonne)
5. Was a foreign object dropped in the WC (toy, phone, cloth)? (→ professional tool required)
6. Is this a recurring blockage (> 3 times in 12 months)? (→ professional inspection + scoping)

**Boundary: simple vs. professional/motorized:**

| Condition | Classification |
|-----------|---------------|
| Standard blockage, first occurrence, no backing-up | debouchage_wc_simple |
| Prior manual attempt failed | debouchage_wc_professionnel |
| Foreign body suspected | debouchage_wc_professionnel |
| Multiple fixtures affected | debouchage_colonne |
| Recurring > 3× same year | Professional inspection + CCTV scope |

**Complexity escape conditions:**
- Manual method fails on-site (→ artisan explains; new quote for professional method)
- Foreign body confirmed (professional extraction tool required)
- Backing-up to other fixtures discovered on arrival

---

### 4.5 plomberie.robinet_remplacement

**Label:** Remplacement robinet / mitigeur — main-d'œuvre seule

**Scope contract:**

```
INCLUDED:
  ✓ Artisan travel within normal service zone
  ✓ Isolation of water supply (fermeture robinet d'arrêt)
  ✓ Removal of old robinet / mitigeur
  ✓ Installation of new robinet / mitigeur supplied by client
  ✓ Connection: alimentation froide + chaude (standard flexible connections)
  ✓ Sealing: téflon, joint de raccord ≤ 50 MAD total
  ✓ Test: running test, leak check
  ✓ Standard fitting thread: 3/8" or 1/2" (most residential applications)

EXCLUDED:
  ✗ The robinet / mitigeur itself (supplied by client — NOT included)
  ✗ Flexible hoses (if new hoses required: client-quoted, typically 30–60 MAD each)
  ✗ Robinet d'arrêt under-sink replacement
  ✗ Modification to existing pipe routing
  ✗ Wall-mounted spout installation (different operation)
  ✗ Shower mixer / thermostatic mixer (more complex — separate quote)
  ✗ Non-standard thread / vintage fitting adaptation
  ✗ Masonry or tile work

LABOUR:    included
TRAVEL:    included
DIAGNOSTIC: included (minimal — job is known before arrival)
BASIC_CONSUMABLES: included — téflon, joint de raccord ≤ 50 MAD
MAIN_REPLACEMENT_PART: EXCLUDED — client supplies new robinet/mitigeur
  If client has NOT purchased the part: artisan may supply + invoice separately.
  Client has the right to purchase the part themselves from Bricoma/droguerie.
```

**Client-facing label (recommended):**
> "Main-d'œuvre + déplacement — robinet / mitigeur fourni par le client"

**Artisan policy:**
> If client provides the robinet: FIXEO standard price applies.
> If client requests artisan to supply the robinet: artisan invoices part separately at purchase receipt price + may add a supply fee. FIXEO standard price covers labour only.

**Complexity escape conditions:**
- Robinet thread size non-standard (requires adapter fitting > 50 MAD)
- Old robinet corroded or seized (requires cutting tool, > 30 min additional work)
- Robinet d'arrêt below also leaking (separate service)
- Wall-mounted installation (different complexity level)
- Pipe requires re-routing
- Hot/cold supply reversal correction required simultaneously

---

### 4.6 plomberie.chasse_eau

**Label:** Remplacement mécanisme chasse d'eau — main-d'œuvre seule

**Scope contract:**

```
INCLUDED:
  ✓ Artisan travel within normal service zone
  ✓ Isolation of water supply to WC cistern (robinet d'arrêt or general)
  ✓ Removal of old mécanisme de chasse (flotteur + clapet or mono-bloc)
  ✓ Installation of standard mono-bloc fill+flush mechanism (universal fit)
  ✓ Test: refill, flush test, leak check
  ✓ Adjustment of float/fill level

EXCLUDED:
  ✗ The mécanisme de chasse d'eau itself (supplied by client — NOT included)
    (Universal mono-bloc mechanism: typically 60–120 MAD at droguerie/Bricoma)
  ✗ WC cistern replacement (cracked/broken cistern = separate service)
  ✗ WC chassis or bâti-support (→ sanitaire_wc_suspendu)
  ✗ WC bowl replacement
  ✗ Push-button or dual-flush button replacement (usually separate 15-min task)
    (If requested simultaneously: artisan may include at discretion)
  ✗ Suspended WC / wall-hung WC with access panel (different complexity)
  ✗ Pipe work beyond cistern connection

LABOUR:    included
TRAVEL:    included
DIAGNOSTIC: included (minimal — symptom known: WC running, not flushing, leak at base)
BASIC_CONSUMABLES: included — joint d'étanchéité de raccord ≤ 30 MAD
MAIN_REPLACEMENT_PART: EXCLUDED — client supplies new mécanisme de chasse
  Typical cost: 60–120 MAD (universal mono-bloc at Bricoma, Aswak Assalam, droguerie)
```

**Client-facing label (recommended):**
> "Main-d'œuvre + déplacement — mécanisme fourni par le client"

**Important client guidance (for FIXEO pre-booking information):**
> "Avant l'intervention, achetez le mécanisme de chasse universel (type mono-bloc, 60–120 MAD en droguerie ou Bricoma). Si vous n'êtes pas sûr du modèle, l'artisan peut vous conseiller par téléphone avant de vous déplacer."

**Complexity escape conditions:**
- WC cistern is wall-hung/suspended (bâti-support installation required → sanitaire_wc_suspendu)
- Cistern cracked or broken (cistern replacement, not mechanism replacement)
- Robinet d'arrêt feeding cistern is also defective (additional service)
- Old mechanism corroded/seized requiring special extraction
- Double-flush button frame requires cistern re-access (sometimes additional 20 min)

---

## 5. Artisan Economic Model

**Purpose:** Establish whether each candidate price leaves artisans with a viable net income before labour time valuation. This is a conceptual model — exact costs require artisan cost survey data that does not currently exist. Variables are defined; plausible scenarios are used.

### Variable definitions

```
P       = Client price (MAD, what FIXEO displays)
C%      = FIXEO commission rate (%)
COMM    = P × C%       = FIXEO commission amount
G_ART   = P × (1 - C%) = Artisan gross after commission

T_FUEL  = fuel cost per round trip (estimated)
T_TIME  = travel time opportunity cost (qualitative)
MAT     = materials/consumables absorbed into forfait
TOOL    = tool amortization per job (qualitative)
RISK    = callback/unsuccessful-visit risk factor (qualitative)

ART_NET_BEFORE_LABOUR = G_ART - T_FUEL - MAT

Labour_time = time spent at the intervention site (minutes)
```

### Operating-cost assumptions (Casablanca urban, 2026)

These are scenario estimates only. Not authoritative.

```
T_FUEL (round trip, urban Casablanca, 5–15 km):
  SCENARIO_LOW:    25 MAD  (moto, short distance)
  SCENARIO_MID:    40 MAD  (voiture utilitaire, medium distance)
  SCENARIO_HIGH:   60 MAD  (voiture, traffic, > 15 km)

T_TIME (travel time × opportunity cost):
  Qualitative only — 30–60 min travel time at artisan's hourly rate
  Not monetized due to lack of reference hourly rate data

MAT (consumables absorbed per intervention):
  plomberie.diagnostic:     0 MAD
  plomberie.fuite_simple:   20–40 MAD (joint, téflon, pâte)
  plomberie.debouchage_evier: 0 MAD
  plomberie.debouchage_wc_simple: 0 MAD
  plomberie.robinet_remplacement: 15–30 MAD (téflon, joint de raccord)
  plomberie.chasse_eau:     10–20 MAD (joint d'étanchéité)

TOOL amortization: qualitative — ventouse, furet manuel < 500 MAD total
  Not monetized per job — tools shared across many interventions

RISK factor: qualitative — estimated 5–15% of jobs require callback or
  uncompensated return visit
  Not monetized in V0.2 — no data
```

### Commission sensitivity table

All values in MAD. Commission calculated on gross client price.

**plomberie.diagnostic — Client price: 150 MAD (anchor)**

| Commission | FIXEO takes | Artisan gross | Less fuel (mid) | Less materials | Artisan net pre-labour |
|-----------|-------------|--------------|----------------|---------------|----------------------|
| 0% | 0 | 150 | 110 | 110 | 110 |
| 10% | 15 | 135 | 95 | 95 | 95 |
| 15% | 22.50 | 127.50 | 87.50 | 87.50 | **87.50** |
| 20% | 30 | 120 | 80 | 80 | 80 |

*Notes: ARTISAN FAIRNESS CONCERN at 20% + high fuel scenario: 60 MAD → net 60 MAD for a 30-min visit. Marginal.*

---

**plomberie.fuite_simple — Client price: 220 MAD (anchor)**

| Commission | FIXEO takes | Artisan gross | Less fuel (mid) | Less materials (30) | Artisan net pre-labour |
|-----------|-------------|--------------|----------------|---------------------|----------------------|
| 0% | 0 | 220 | 180 | 150 | 150 |
| 10% | 22 | 198 | 158 | 128 | 128 |
| 15% | 33 | 187 | 147 | 117 | **117** |
| 20% | 44 | 176 | 136 | 106 | 106 |

*Notes: At 15% commission, 117 MAD net before labour for a 30–45 min intervention. Acceptable at anchor price. At CONSENSUS_LOW (150 MAD) with 15%: artisan net ~67 MAD pre-labour — WEAK. Low-end price must not be presented as viable.*

---

**plomberie.debouchage_evier — Client price: 220 MAD (anchor)**

| Commission | FIXEO takes | Artisan gross | Less fuel (mid) | Less materials | Artisan net pre-labour |
|-----------|-------------|--------------|----------------|---------------|----------------------|
| 0% | 0 | 220 | 180 | 180 | 180 |
| 10% | 22 | 198 | 158 | 158 | 158 |
| 15% | 33 | 187 | 147 | 147 | **147** |
| 20% | 44 | 176 | 136 | 136 | 136 |

*Notes: No materials cost — clean commission calculation. At 15%, 147 MAD net before labour for a 20–30 min job. ACCEPTABLE at anchor.*

---

**plomberie.debouchage_wc_simple — Client price: 280 MAD (anchor)**

| Commission | FIXEO takes | Artisan gross | Less fuel (mid) | Less materials | Artisan net pre-labour |
|-----------|-------------|--------------|----------------|---------------|----------------------|
| 0% | 0 | 280 | 240 | 240 | 240 |
| 10% | 28 | 252 | 212 | 212 | 212 |
| 15% | 42 | 238 | 198 | 198 | **198** |
| 20% | 56 | 224 | 184 | 184 | 184 |

*Notes: At 15%, 198 MAD net before labour for a 30–45 min job. STRONG at anchor. Better economics than debouchage_evier due to higher anchor price.*

---

**plomberie.robinet_remplacement — Client price: 200 MAD (anchor)**

| Commission | FIXEO takes | Artisan gross | Less fuel (mid) | Less materials (20) | Artisan net pre-labour |
|-----------|-------------|--------------|----------------|---------------------|----------------------|
| 0% | 0 | 200 | 160 | 140 | 140 |
| 10% | 20 | 180 | 140 | 120 | 120 |
| 15% | 30 | 170 | 130 | 110 | **110** |
| 20% | 40 | 160 | 120 | 100 | 100 |

*Notes: At 15%, 110 MAD net before labour for a 30 min job. ACCEPTABLE. At 20% + high fuel (60): net 80 MAD — WEAK margin. Most sensitive to commission escalation of the six candidates.*

---

**plomberie.chasse_eau — Client price: 280 MAD (anchor)**

| Commission | FIXEO takes | Artisan gross | Less fuel (mid) | Less materials (15) | Artisan net pre-labour |
|-----------|-------------|--------------|----------------|---------------------|----------------------|
| 0% | 0 | 280 | 240 | 225 | 225 |
| 10% | 28 | 252 | 212 | 197 | 197 |
| 15% | 42 | 238 | 198 | 183 | **183** |
| 20% | 56 | 224 | 184 | 169 | 169 |

*Notes: At 15%, 183 MAD net before labour for a 45-60 min job. ACCEPTABLE. Second-best economics after debouchage_wc_simple at anchor.*

---

## 6. Commission Risk Summary

**COMMISSION_RISK_THRESHOLD:** The point at which artisan net pre-labour falls below 100 MAD — below which the intervention likely becomes economically unattractive for a professional artisan covering Casablanca distances.

| Service | Anchor price | 15% net | 20% net | Risk signal |
|---------|-------------|---------|---------|-------------|
| plomberie.diagnostic | 150 | 87.50 | 80 | ⚠️ MEDIUM — only acceptable if job takes < 20 min total |
| plomberie.fuite_simple | 220 | 117 | 106 | ✅ ACCEPTABLE at anchor |
| plomberie.debouchage_evier | 220 | 147 | 136 | ✅ ACCEPTABLE at anchor |
| plomberie.debouchage_wc_simple | 280 | 198 | 184 | ✅ STRONG at anchor |
| plomberie.robinet_remplacement | 200 | 110 | 100 | ⚠️ MEDIUM — tight at 20% |
| plomberie.chasse_eau | 280 | 183 | 169 | ✅ ACCEPTABLE at anchor |

**Key finding:** The diagnostic fee (150 MAD) has the tightest economics at any commission rate. At 20% commission + mid fuel cost, artisan net before labour is 80 MAD for a visit that may take 30–45 min total. This validates OPTION D3 (absorb diagnostic into standardized interventions) OR requires setting the diagnostic floor higher (≥ 180 MAD if commission eventually rises to 20%).

---

## 7. Price Architecture Options Per Service

### OPTION A — FIXED_PRICE
"Prix FIXEO : X MAD"
Use only when scope is tightly defined, artisan economics are viable at all tested commission rates, and unexpected complexity can be objectively pre-screened.

### OPTION B — NARROW_RANGE
"Prix FIXEO : X–Y MAD"
Use when scope is standardized but small legitimate variability remains (e.g., travel distance variation, minor complexity differences within scope).
Range width: ≤ 40% above floor.

### OPTION C — REFERENCE_ESTIMATE
"Estimation FIXEO : X–Y MAD"
Use when market evidence is sound but scope variation is structurally significant. Protects FIXEO and artisan from disputes; sets honest expectations.

---

### Architecture recommendation per service

**plomberie.diagnostic**
→ OPTION B — NARROW_RANGE (100–180 MAD)
Rationale: Scope is fully standardized. But commission sensitivity at 15%+ makes a fixed 150 MAD floor risky if commission ever rises. A 100–180 MAD narrow range acknowledges geographic variation (shorter vs. longer travel) while keeping the concept simple for clients. Fixed price alternative: 150 MAD if commission is capped at 15%.

**plomberie.fuite_simple**
→ OPTION B — NARROW_RANGE (180–280 MAD)
Rationale: Scope is definable but small variability exists (minor vs. moderate fuite, materials variation 0–50 MAD). A fixed price would create disputes when the job is slightly more involved. Narrow range is honest and manageable. The market CONSENSUS_HIGH of 350 MAD is retained as the scope-creep boundary, not as a displayed price ceiling.

**plomberie.debouchage_evier**
→ OPTION A — FIXED_PRICE (220 MAD) OR OPTION B (180–250 MAD)
Rationale: Best-standardized débouchage service. No materials. Pre-arrival questions can classify effectively. Fixed price is defensible if pre-screening is implemented. If FIXEO cannot guarantee pre-screening quality, narrow range is safer.

**plomberie.debouchage_wc_simple**
→ OPTION B — NARROW_RANGE (220–320 MAD)
Rationale: Scope is defined but WC blockages have more severity variation than évier blockages. Anchor of 280 MAD is strong. A floor of 220 MAD acknowledges simpler cases; a ceiling of 320 MAD captures the upper market evidence band (allo-maison.ma Casablanca 300–450). Upper bound keeps FIXEO competitive against direct artisan contact.

**plomberie.robinet_remplacement**
→ OPTION A — FIXED_PRICE (200 MAD) — BEST CANDIDATE
Rationale: Scope is the most tightly defined of all six services. Client supplies the part. Artisan's task is identical every time. Duration ~30 min, no materials ambiguity. Commission sensitivity is the only risk — mitigated by clear scope exclusions and pre-screening. If commission rises to 20%, evaluate raising to 220–230 MAD.

**plomberie.chasse_eau**
→ OPTION A — FIXED_PRICE (250 MAD) OR OPTION B (220–300 MAD)
Rationale: Scope is well-defined. Economics are strong at anchor. But duration is 45–60 min (longer than robinet_remplacement), and occasional complexity escape (suspended WC, corroded cistern) is possible. A fixed 250 MAD is defensible with good pre-screening; narrow range 220–300 MAD is safer if pre-screening cannot filter suspended WC.

---

## 8. Client Fairness Assessment

**STRONG:** Client clearly understands the price and scope. No plausible misunderstanding about inclusions. Price aligns with expectations from alternative sources.
**ACCEPTABLE:** Minor potential for misunderstanding; clear disclosure resolves it.
**WEAK:** Structural ambiguity; risk of dispute even with good disclosure.

| Service | CLIENT_FAIRNESS | Key issue |
|---------|----------------|-----------|
| plomberie.diagnostic | ACCEPTABLE | Client must understand fee is owed even if no repair. Requires clear pre-booking disclosure. "Frais de déplacement/diagnostic : 100–180 MAD même sans réparation." |
| plomberie.fuite_simple | ACCEPTABLE | Client must understand major parts not included. Risk: client assumes their leaking flexible is replaced for free → disappointment. Disclosure must clarify. |
| plomberie.debouchage_evier | STRONG | No materials. No parts. Scope is obvious. Price range is at or below market awareness. Strong. |
| plomberie.debouchage_wc_simple | STRONG | Same as above. WC débouchage price is universally understood in Morocco. Range 220–320 MAD matches consumer expectations. |
| plomberie.robinet_remplacement | ACCEPTABLE | Key risk: client assumes new robinet is included. Label "main-d'œuvre seule" must be prominent and explained. If managed well: STRONG. |
| plomberie.chasse_eau | ACCEPTABLE | Same as robinet — client must understand mécanisme is not included. Requires "fourni par le client" label + explanation of what to buy (60–120 MAD universal mécanisme). |

---

## 9. Artisan Fairness Assessment

**STRONG:** Economically viable at all commission scenarios tested; scope is clear enough to avoid callback risk.
**ACCEPTABLE:** Viable at current commission levels; becomes tight if commission rises.
**WEAK:** Marginal economics even at 15%; artisans likely to decline or inflate scope.
**UNKNOWN:** Insufficient economic data to assess.

| Service | ARTISAN_FAIRNESS | Key issue |
|---------|-----------------|-----------|
| plomberie.diagnostic | WEAK → ACCEPTABLE | At 15% comm + mid fuel: 87.50 MAD net before any labour time attribution. Only acceptable if diagnostic visit < 20 min total (5 min travel, 10 min inspection, 5 min explanation). Long urban travel makes this WEAK. |
| plomberie.fuite_simple | ACCEPTABLE | 117 MAD net at 15% for 30–45 min. Acceptable if fuite is genuinely simple. Scope escape rules must be rigidly followed. |
| plomberie.debouchage_evier | ACCEPTABLE | 147 MAD net at 15% for 20–30 min. Clean economics — no materials. Comparable to robinet_remplacement but faster job. |
| plomberie.debouchage_wc_simple | STRONG | 198 MAD net at 15% for 30–45 min. Best artisan economics of the six candidates. |
| plomberie.robinet_remplacement | ACCEPTABLE | 110 MAD net at 15% for 30 min. Acceptable. Tightest of the six at 20% (100 MAD). Monitor if commission escalates. |
| plomberie.chasse_eau | ACCEPTABLE | 183 MAD net at 15% for 45–60 min. Good. Better economics than robinet due to higher anchor price vs similar duration. |

---

## 10. AI Terminology Doctrine

### Current FIXEO language (inaccurate)

The current FIXEO homepage uses "FIXEO AI estimation" and similar phrases. The current estimation system is:

1. A hardcoded price table (`fixeo-estimation-engine-v1.js`) — 9 categories × 4 complexity tiers
2. A static pricing map (`fixeo-pricing-marocain.js`) — category-to-range lookup
3. A hardcoded ETA string `'2–4 heures'` — zero algorithmic computation
4. A deterministic complexity selector — no machine learning

**This is a RULE_BASED_LOOKUP. It is not AI, not machine learning, not statistical modeling.**

### Correct terminology hierarchy

| Term | Technical definition | When FIXEO can use it |
|------|---------------------|----------------------|
| RULE_BASED_ESTIMATION | Deterministic lookup in a static price table | ✅ NOW (honest description of current system) |
| DATA_DRIVEN_ESTIMATION | Calculation from aggregated real transaction data | When FIXEO has sufficient T2/T3 data per service/city |
| STATISTICAL_MODEL | Regression, percentile calculation, or model fit on FIXEO-owned data | When minimum sample thresholds are met (see Maturity Roadmap) |
| ML_POWERED | Trained model with weights learned from data | Only when a model is actually trained and deployed |
| AI_POWERED | Any AI system | Only when a genuine ML/AI inference system is in production |

### Minimum requirements before "AI" is legitimate

FIXEO can call its pricing system AI-powered only when ALL of the following are true:
1. A statistical or machine-learning model is trained on FIXEO-owned transaction data
2. That model has been validated against held-out data
3. Minimum sample sizes are met (see Maturity Roadmap Level 3)
4. The model is actively retrained at a defined cadence
5. The system outputs a confidence interval alongside its estimate

**No UI change in this phase. No production code change. This doctrine applies to all future pricing surface copy.**

---

## 11. Future Transaction Observation Schema

The following schema defines what FIXEO must capture per completed mission to enable data-driven pricing. This is a PROPOSAL only. No Supabase modification in this phase.

```sql
-- Proposed addition to missions table (or new missions_pricing_obs table)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS service_code         text;    -- e.g. 'plomberie.robinet_remplacement'
ALTER TABLE missions ADD COLUMN IF NOT EXISTS service_sub_code     text;    -- finer granularity
ALTER TABLE missions ADD COLUMN IF NOT EXISTS city_slug            text;    -- nfd slug e.g. 'casablanca'
ALTER TABLE missions ADD COLUMN IF NOT EXISTS district             text;    -- arrondissement/quartier (optional)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS request_created_at   timestamptz; -- already exists
ALTER TABLE missions ADD COLUMN IF NOT EXISTS artisan_arrived_at   timestamptz;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS intervention_started_at timestamptz;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS intervention_completed_at timestamptz;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS diagnostic_fee_DH    numeric; -- 0 if absorbed
ALTER TABLE missions ADD COLUMN IF NOT EXISTS fixeo_estimate_low   numeric; -- what FIXEO showed client
ALTER TABLE missions ADD COLUMN IF NOT EXISTS fixeo_estimate_high  numeric;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS artisan_quote_DH     numeric; -- quotes.proposed_price (already exists)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS agreed_price_DH      numeric; -- already exists as agreed_price
ALTER TABLE missions ADD COLUMN IF NOT EXISTS final_price_DH       numeric; -- DOES NOT YET EXIST
ALTER TABLE missions ADD COLUMN IF NOT EXISTS materials_amount_DH  numeric; -- parts invoiced separately
ALTER TABLE missions ADD COLUMN IF NOT EXISTS materials_included    boolean; -- were materials in scope?
ALTER TABLE missions ADD COLUMN IF NOT EXISTS travel_fee_DH        numeric; -- 0 if absorbed
ALTER TABLE missions ADD COLUMN IF NOT EXISTS urgency               boolean;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS night_time            boolean; -- after 22h
ALTER TABLE missions ADD COLUMN IF NOT EXISTS weekend               boolean;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS scope_changed         boolean; -- complexity escape triggered
ALTER TABLE missions ADD COLUMN IF NOT EXISTS scope_change_reason   text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS artisan_id            uuid;    -- already exists
ALTER TABLE missions ADD COLUMN IF NOT EXISTS client_accepted_scope boolean;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS mission_completed     boolean;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS callback_required     boolean;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS rating_client         smallint; -- 1–5
ALTER TABLE missions ADD COLUMN IF NOT EXISTS complexity            text;    -- 'standard'/'moderate'/'complex'
ALTER TABLE missions ADD COLUMN IF NOT EXISTS material_policy       text;    -- 'labour_only'/'client_supplied'/etc
ALTER TABLE missions ADD COLUMN IF NOT EXISTS urgency_surcharge_pct numeric; -- actual % applied by artisan
```

**Observation quality rules:**
- Only count observations where `mission_completed = true`
- Only count observations where `final_price_DH IS NOT NULL`
- Only count observations where `scope_changed = false` OR scope change reason is documented
- Exclude observations > 24 months old from price calculations; weight at 0.5× if 12–24 months old

---

## 12. Pricing Maturity Roadmap

| Level | Name | Definition | Minimum threshold | Data source | Capability unlocked |
|-------|------|-----------|-------------------|-------------|---------------------|
| LEVEL_0 | External Research | External Moroccan published ranges only | 0 FIXEO transactions | This registry | Honest reference estimate display: "Estimation marché" |
| LEVEL_1 | Field Validated | External research + ≥ 5 manually verified FIXEO field observations per service | 5 obs, 3+ artisans | Manual review | Slightly narrower ranges; "Estimation FIXEO" label |
| LEVEL_2 | Data-Driven | ≥ 30 normalized completed missions per service, ≥ 3 distinct artisans, ≥ 2 time periods | 30 obs/svc, 3 artisans, 6-month span | missions table | Weighted median calculation; city-national aggregation; "Données FIXEO" label |
| LEVEL_3 | City-Segmented | ≥ 20 normalized observations per service per city cluster, ≥ 3 artisans per cluster | 20 obs/city/svc | missions + city_slug | City-specific price ranges; geographic cluster multipliers validated |
| LEVEL_4 | Dynamic Intelligence | ≥ 100 observations per service, model trained and validated, retrained ≥ quarterly | 100 obs/svc, model validated on hold-out | Trained model | Dynamic range adjustment, confidence intervals, "FIXEO Estimation IA" label legitimately usable |

**Anti-patterns to prevent:**
- Never calculate city-specific prices from < 10 observations per city
- Never train a model from fewer than 50 observations per service
- Never call the system "AI" at Level 0–2
- Never remove LEVEL_0 values before LEVEL_2 is validated for the same service
- Never use the same data for training and for validating the model

---

## 13. Diagnostic Policy Recommendation

Three alternatives are presented for human review. One must be selected before any production pricing surface is modified.

**POLICY D1 — DIAGNOSTIC AS STANDALONE FEE (ALWAYS)**
> Diagnostic fee: 100–180 MAD. Charged at all times. Not deductible from repair. Applied to all complex/hidden services.
> Pros: Artisan certainty; matches Moroccan market evidence; client knows up front.
> Cons: May feel punitive for simple jobs where diagnosis takes 2 minutes.
> Best for: fuite_localisation, chauffe_eau_reparation, debouchage_colonne.

**POLICY D2 — DIAGNOSTIC ABSORBED INTO STANDARDIZED SERVICES**
> For the 5 standardized candidates: diagnostic micro-step is included in intervention price. No separate diagnostic line.
> Pros: Simpler client experience for obvious jobs. Matches actual market behavior.
> Cons: Artisan not compensated if job turns out to be outside scope (must activate complexity escape).
> Best for: fuite_simple, debouchage_evier, debouchage_wc_simple, robinet_remplacement, chasse_eau.

**POLICY D3 — HYBRID (RECOMMENDED)**
> Diagnostic fee applies as a separate visible line only for:
>   - Any job where artisan cannot proceed to repair on first visit
>   - Services classified as DIAGNOSIS_FIRST (fuite_localisation, chauffe_eau_reparation)
> Diagnostic fee absorbed into intervention price for the 5 standardized services when repair proceeds.
> Client disclosure: "Si notre artisan ne peut pas réparer lors de sa visite, des frais de déplacement de 100–180 MAD s'appliquent."
> This is a FIXEO policy innovation (no Morocco precedent for deductible model), not a market standard.

**HUMAN DECISION REQUIRED:** PENDING

---

## 14. Replacement-Part Policy Statement

### Client-facing wording (recommended)

For robinet_remplacement:
> "**Main-d'œuvre + déplacement — robinet / mitigeur fourni par le client.**
> Prix comprend : dépose de l'ancien robinet, pose du nouveau, raccordement, test d'étanchéité.
> Prix ne comprend pas : le robinet ou mitigeur (à acheter par le client).
> Si l'artisan fournit la pièce, elle est facturée séparément au prix d'achat."

For chasse_eau:
> "**Main-d'œuvre + déplacement — mécanisme de chasse fourni par le client.**
> Prix comprend : dépose de l'ancien mécanisme, pose du nouveau, réglage, test.
> Prix ne comprend pas : le mécanisme de chasse (disponible en droguerie : 60–120 MAD).
> Conseil : achetez un mécanisme mono-bloc universel avant l'intervention."

### Policy rule (canonical)

> A FIXEO price for `robinet_remplacement` or `chasse_eau` MUST NEVER display a price that implicitly includes the cost of the fixture. If FIXEO ever offers a "fourni + posé" option (artisan supplies the part), it must be a separate SKU with a separate explicit price that includes both the part and the labour.

---

## Files in This V0.2 Package

| File | Type | Content |
|------|------|---------|
| `fair-price-policy.v0.2.md` | This file | Policy framework, economic model, doctrines |
| `calibration.v0.2.json` | Machine-readable | Per-service calibration data |
| `human-review.v0.2.md` | Decision matrix | Human review table with PENDING decisions |
| `registry.v0.2.json` | Updated registry | Corrected terminology (consensus_low, market_anchor, consensus_high); V0.2 schema |

---

*All human decisions remain PENDING. This document requires formal FIXEO product review before any production price surface is modified.*
