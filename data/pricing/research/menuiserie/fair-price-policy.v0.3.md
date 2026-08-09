# FIXEO Menuiserie — Fair Price Policy
## Phase 7B.10.2 — FROZEN CANONICAL POLICY

**Date:** 2026-08-09  
**Status:** FROZEN — human decisions recorded  
**Classification:** FIXEO_POLICY throughout unless explicitly stated otherwise

---

## 1. FIXEO_DUAL_FAIRNESS_PRINCIPLE

> A FIXEO Menuiserie price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing. FIXEO must NOT target the cheapest market price. The objective is CLIENT_FAIRNESS + ARTISAN_VIABILITY + PRICE_PREDICTABILITY + CLEAR_SCOPE — not lowest-price competition.

**Corollary 1:** An artisan who cannot cover fuel, tool amortization, and minimum viable labour on a FIXEO intervention will not sustainably serve FIXEO clients. Artisan economic floor is therefore a client-quality guarantee.

**Corollary 2:** A client who receives a hidden hardware charge after accepting a quoted price has been deceived. Hardware must be disclosed and approved before any purchase.

**Corollary 3:** A client who books a simple door adjustment and discovers a fabrication project on-site must be informed, quoted separately, and given the right to decline before any additional work begins.

---

## 2. CANONICAL PRICE FORMULA

```
FIXEO_MENUISERIE_STANDARD_PRICE =
  LABOUR (skilled intervention time)
+ TRAVEL (included in service price — not a separate charge)
+ BASIC_CONSUMABLES (screws, lubricant, minor items totalling < 10 MAD)

VARIABLE_HARDWARE = SEPARATE
(identified → specified → priced → client-approved → acquired → installed → old part returned)
```

---

## 3. MENUISERIE MINIMUM INTERVENTION FLOOR — FROZEN

| Parameter | Value |
|-----------|-------|
| Universal hard floor | 100 MAD |
| Menuiserie practical floor | **300 MAD — FIXEO_POLICY** |
| Architecture | EMBEDDED — not a separate charge |
| Canonical rule | `FINAL_PRICE = max(300 MAD, STANDARD_SERVICE_PRICE)` |
| Additive rule | **PROHIBITED: never `300 MAD + service_price`** |

**Menuiserie minimum is higher than Bricolage (200 MAD) because:**
- Precision specialist tools: drill/driver, chisels, level, rabot, hand saw
- Hardware diagnosis and compatibility assessment
- Hardware sourcing knowledge (hinge types, runner dimensions, proprietary systems)
- Higher skill qualification
- Greater setup burden (measuring, testing, adjusting)
- Sourcing risk on non-standard hardware

**All 7 approved standard services satisfy 300 MAD floor without special treatment.**

**Target artisan net per standardized intervention: 150 MAD — FIXEO_POLICY**  
Universal hard floor remains: 100 MAD

---

## 4. HARDWARE DOCTRINE — FROZEN

### 4.1 Core Principle

Hardware is a variable cost that varies 3× to 6× depending on quality tier (standard vs soft-close hinges: 20-40 MAD vs 59-120 MAD). Bundling hardware in a flat price is therefore unfair to either the artisan or the client depending on the actual hardware selected. Full transparency is the only fair solution.

### 4.2 Mandatory Disclosure Sequence

```
STEP 1  IDENTIFY   → What hardware is needed? Type, dimensions, brand
STEP 2  SPECIFY    → Confirm exact specification with client
STEP 3  STATE      → Communicate unit cost clearly before any action
STEP 4  APPROVE    → Wait for explicit client confirmation — do not proceed without it
STEP 5  ACQUIRE    → Purchase or use approved artisan stock
STEP 6  INSTALL    → With care; artisan warranty applies only to labour
STEP 7  RETURN     → Return removed hardware to client where appropriate
```

**Silent bundling: PROHIBITED**  
**Silent markup: PROHIBITED**

### 4.3 Part-Supply Policy

| Model | Description | Status |
|-------|-------------|--------|
| **MODEL B** | **Artisan-supplied at disclosed price** | **PREFERRED** |
| MODEL A | Client-supplied part | Acceptable fallback; no warranty on client part |
| MODEL C | Bundled in fixed price | **REJECTED** — creates opacity on variable-cost hardware |

### 4.4 Artisan Stock Recommendation

Artisans should carry at minimum:
- Standard hinges (pack of 4-6, most common sizes)
- Soft-close hinges (pack of 2-4)
- Standard runner pairs (35 cm, 45 cm, 50 cm)
- Basic screws and rawlplugs

This minimises return-visit frequency and improves client experience.

### 4.5 Return-Visit Policy

When artisan must leave to source a non-standard part:
- First visit: diagnostic charge (300 MAD minimum floor applied)
- Return visit: service price
- **Do not silently absorb sourcing trip into first-visit labour**
- Quote for return visit must be issued before artisan departs
- Client must approve before artisan returns

---

## 5. APPROVED PRICES — FROZEN

| Code | Service | Approved Price | Architecture | Hardware |
|------|---------|---------------|-------------|---------|
| MENU_001 | Réglage porte simple | **300 MAD** | CONDITIONAL_FIXED | NA |
| MENU_001B | Réglage porte + rabotage | **350 MAD** | CONDITIONAL_FIXED | NA |
| MENU_002 | Charnière labour | **300 MAD base** | LABOUR_FIXED_PART_SEPARATE | SEPARATE |
| MENU_003 | Coulisse tiroir labour | **300 MAD base** | LABOUR_FIXED_PART_SEPARATE | SEPARATE |
| MENU_004A | Sliding adjust 1 panel | **300 MAD** | CONDITIONAL_FIXED | PART_SEPARATE if needed |
| MENU_004B | Sliding adjust 2+ panels | **350 MAD** | CONDITIONAL_FIXED | PART_SEPARATE if compatible |
| MENU_005 | Petite réparation meuble | null | DEFERRED | — |
| MENU_006 | Pose porte labour only | **500 MAD** | CONDITIONAL_FIXED | Hinges included in labour |

**All prices: production_ready = false**  
**All prices: human_decision = APPROVED (except MENU_005 = DEFERRED)**

---

## 6. BATCH RULES — EXPERIMENTAL FREEZE

**Status: EXPERIMENTAL_BATCH_RULE — NOT universal pricing law**

These rules apply only to the narrowly defined same-item/same-system scope:

### MENU_002 — Hinge batch

```
Base: 300 MAD (1 hinge, same door visit)
Additional hinge, SAME DOOR, SAME VISIT: +50 MAD labour each
Different cabinet → new base visit
```

| Scenario | Labour | Hardware est. | Total est. |
|----------|--------|--------------|------------|
| 1 standard hinge | 300 | 30 | 330 MAD |
| 2 hinges same door, standard | 350 | 60 | 410 MAD |
| 4 hinges same door, standard | 450 | 120 | 570 MAD |
| 4 hinges same door, soft-close | 450 | 280 | 730 MAD |

### MENU_003 — Runner batch

```
Base: 300 MAD (1 drawer, same cabinet visit)
Additional drawer, SAME CABINET, SAME VISIT: +100 MAD labour each
Different cabinet → new base visit
```

| Scenario | Labour | Hardware est. | Total est. |
|----------|--------|--------------|------------|
| 1 drawer, standard | 300 | 45 | 345 MAD |
| 2 drawers same cabinet | 400 | 90 | 490 MAD |
| 3 drawers same cabinet | 500 | 135 | 635 MAD |

**Do not extrapolate increments to unrelated hardware or different-system scenarios.**

---

## 7. HORS PÉRIMÈTRE PRIX FIXEO — ESCAPE WORKFLOW

When scope exceeds the approved standardized service:

```
STEP 1  STOP        → Do not proceed with additional work
STEP 2  IDENTIFY    → Determine what is actually needed
STEP 3  EXPLAIN     → Inform client clearly and professionally
STEP 4  DECLARE     → "Cette intervention dépasse le périmètre du tarif FIXEO"
STEP 5  QUOTE       → Provide a separate estimate for the additional scope
STEP 6  APPROVE     → Wait for explicit client approval
STEP 7  CONTINUE    → Proceed only if client approves new scope
```

**Rule: No silent price increase. No scope absorption without client knowledge.**

### MENU_001 / MENU_001B — Escape triggers

- Frame rotten or structurally deformed
- Wall/frame unstable
- Major door warp requiring full rehang or rebuild
- Security mechanism involved
- Lock/cylinder work involved
- Full replacement required
- Planing required exceeds minor correction

### MENU_004A / MENU_004B — Escape triggers

- Track bent, broken, or must be replaced → QUOTE_REQUIRED
- Panel itself warped or structurally deformed → QUOTE
- Custom roller unavailable → QUOTE
- Custom/proprietary panel cannot be re-engaged → QUOTE

### MENU_006 — Escape triggers

- Frame not compatible with supplied door
- Masonry opening modification required
- Non-standard dimension (>2cm trim required)
- Structural frame repair needed
- Custom trimming/fabrication required
- Security door
- Major hardware modification
- Wall damage discovered
- Door too heavy for single artisan (>40 kg solid wood)

---

## 8. ANTI-DOUBLE-CHARGE RULE — FROZEN

```
FINAL_PRICE = max(MENUISERIE_MINIMUM_300, STANDARD_SERVICE_PRICE)
```

**Never:** `300 MAD minimum + service_price`

**Examples:**
- MENU_001 @ 300 MAD: 300 MAD total (floor = service price, no addition)
- MENU_006 @ 500 MAD: 500 MAD total (service price > floor, no addition)

**"While you're here" extras:** New quote required. Never silently stacked.

---

## 9. CUSTOM FABRICATION DOCTRINE — FROZEN

**All custom fabrication is QUOTE_REQUIRED for Estimator V1 — immutable**

```
Do NOT create:
- FIXEO placard MAD/ml canonical price
- FIXEO dressing MAD/ml canonical price
- FIXEO kitchen MAD/ml canonical price
- FIXEO bibliothèque MAD/ml canonical price
```

**Why per-ml pricing is inappropriate:**
- Material choice alone (mélaminé vs MDF laqué vs bois massif) creates 3-5× price variation
- Scope definitions (upper+lower units; worktop included or not; hardware brand; finish) add 30-50% variation
- CuisinAffaires (25,000+ kitchens delivered): *"Annoncer un prix au mètre serait malhonnête"*

Per-linear-metre reference ranges in evidence files = **REFERENCE_EVIDENCE_ONLY** — not FIXEO prices.

---

## 10. CROSS-MÉTIER BOUNDARIES — FROZEN

| Work Type | Routes to | Rule |
|-----------|----------|------|
| Lock/cylinder/security mechanism | SERRURERIE | Hard boundary — never MENUISERIE |
| Flat-pack furniture assembly | BRICOLAGE | No custom wood involved |
| Paint/varnish/finish | PEINTURE | Surface treatment specialist |
| Glass/mirror panel replacement | VITRERIE | Glass handling specialist |
| Structural wall/frame damage | MAÇONNERIE | Load-bearing requires specialist |
| Aluminium fabrication | DEFERRED SPECIALIST | Different tools, profilés, suppliers |
| Custom wood fabrication | MENUISERIE QUOTE | Requires design, brief, workshop |
| Motorized/electrical systems | ELECTRICITE | Electrical certification required |

**Rule: No standardized Menuiserie repair may absorb specialist-métier work.**

---

## 11. CLIENT FAIRNESS

| Risk | FIXEO Protection |
|------|-----------------|
| Hidden hardware costs | Mandatory disclosure + client approval before any hardware purchase |
| Scope creep to fabrication | HORS PÉRIMÈTRE workflow — stop, explain, quote, approve |
| Repair vs replacement confusion | Pre-screening questions triage before price is stated |
| Return-visit charge surprise | Disclosed upfront when non-standard sourcing required |
| Batch overcharge | Incremental pricing (not exponential multiplication) |
| Double-charge (minimum + service) | Anti-stack formula: max(minimum, service_price) |
| SERRURERIE work absorbed | Lock/cylinder hard-excluded and rerouted in every service definition |
| Misleading per-ml pricing | Custom fabrication always QUOTE — no canonical per-ml price |

---

## 12. ARTISAN FAIRNESS

| Risk | FIXEO Protection |
|------|-----------------|
| Hardware sourcing time uncompensated | Return visit for non-standard part = separate billable event |
| Custom work scope risk | Fabrication always QUOTE — artisan never carries material risk under fixed price |
| Tool burden unpriced | 300 MAD minimum floor absorbs tool overhead (30-40 MAD amortized) |
| Commission sensitivity | All prices viable at 20% commission at mid-travel |
| Rushed work | 300-500 MAD allows 30-90 min skilled work without time pressure |
| Measurement/fabrication risk | Repair services scoped to exclude custom dimensions |
| Non-standard hardware risk | Sourcing obligation disclosed before job accepted |

---

## 13. GEOGRAPHIC POLICY — FROZEN

```
market_scope = NATIONAL_MOROCCO
city_adjustment = null
```

City-level evidence (Casablanca daily rate 300-500 MAD/day) is used only as an economic stress-test reference. No multiplier is adopted.

---

## 14. TIME MODIFIER POLICY — FROZEN

```
urgency_modifier = null
night_modifier = null
weekend_modifier = null
holiday_modifier = null
express_modifier = null
```

AllohRayfi explicitly states same price evenings and weekends for menuiserie. No Moroccan menuiserie urgency surcharge documented.

---

## 15. PRICE PROVENANCE — FROZEN

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
batch_rule_provenance = FIXEO_HUMAN_CALIBRATED_PILOT_BATCH_RULE
```

---

## 16. REQUIRED UI DISCLAIMER — DOCUMENTED ONLY

```
Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.
```

**Status: DOCUMENTED — not deployed in this phase**

---

## 17. POLICY INTEGRITY

- V0.1 research artifacts: IMMUTABLE
- V0.2 calibration artifacts: IMMUTABLE (retains original PENDING recommendations)
- V0.3 freeze artifacts: this file + registry.v0.3.json + calibration.v0.3.json + human-decision.v0.3.md
- production_ready = false on ALL services
- No production file modified
- No deployment performed
