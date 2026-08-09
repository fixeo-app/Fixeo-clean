# FIXEO Menuiserie — Phase 7B.10 Research
## Morocco Market Research — V0.1

**Phase:** 7B.10  
**Status:** RESEARCH_COMPLETE_HUMAN_CALIBRATION_REQUIRED  
**Date:** 2026-08-09  
**Preceding phase:** 7B.9.2 (Peinture Human Price Decision Freeze, commit 8a29257)

---

## 1. Executive Market Diagnosis

Menuiserie in Morocco is a **heterogeneous métier** spanning a 200:1 price ratio — from a 150 MAD hinge replacement to an 80,000+ MAD custom kitchen. It cannot be treated as a single métier with simple/medium/heavy buckets.

The critical structural finding is that **menuiserie divides into two fundamentally different economic models:**

**A. REPAIR / ADJUSTMENT / HARDWARE REPLACEMENT**
- Labour-intensive, time-bounded, tool-dependent
- Economics: 300-500 MAD/day labour (standard menuisier, Casablanca)
- Small repairs: ~30-90 min interventions → 150-400 MAD labour equivalent
- Hardware is **variable and must be quoted separately**
- These are potentially standardizable in a FIXEO estimator

**B. CUSTOM FABRICATION**
- Material-cost-driven (MDF, mélaminé, bois massif differ by 3-5×)
- Per-linear-metre pricing (placard 2,000-9,000 MAD/ml; cuisine 3,500-18,000 MAD/ml)
- Always requires site visit, measurement, and detailed quote
- **QUOTE_REQUIRED** for all custom fabrication in estimator V1

This distinction is the **most important architectural decision** for the FIXEO estimator.

---

## 2. Research Methodology

**Sources consulted:** 18 sources across grades B, C+, C, D, T0
**Searches executed:** 18+ searches in French/Moroccan terminology
**Pages crawled:** 10+ pages including lechantier.ma, allo-maison.ma, artmood.ma, cuisinaffaires.ma, fixeo.ma blog, mrbricolage.ma, jumia.ma, avito.ma, allohrayfi.ma
**Languages:** French (primary), some Arabic context terms

**Research sequence followed:** External research → evidence extraction → taxonomy → unit analysis → legacy audit → artifacts

**Legacy values inspected after external research in:**
- `js/fixeo-pricing-marocain.js`
- `js/fixeo-estimation-engine-v1.js`
- `js/fixeo-estimation-v2-hero.js`

---

## 3. Key Findings

### Repair vs Fabrication
- **Repair/adjustment**: flat intervention economics apply; travel + tools amortized over visit
- **Fabrication**: always quote — material variation alone creates 3-5× price difference; scope definition (what's included per linear metre) is the primary source of client confusion and disputes

### Minimum Intervention Economics
- Standard menuisier daily rate: 300-500 MAD/day (Casablanca/Rabat reference, lechantier.ma B source)
- Implied 30-60 min intervention: 150-250 MAD labour equivalent
- **Menuiserie practical minimum is higher than Bricolage (200 MAD)** due to: specialist tools (drills, saws, chisels), precision adjustment skill, travel with equipment
- Suggested human calibration range: 250-400 MAD for minimum visit/intervention

### Interior Door Adjustment (MENU_001)
- No direct Moroccan external price found for door adjustment as standalone service
- Service confirmed to exist (allohrayfi.ma lists it)
- Implied range: 150-300 MAD from daily rates
- **Confidence: LOW** — cannot anchor without direct market evidence
- Scope critical: excludes locks (→ SERRURERIE), structural frame damage, full replacement

### Hinge Replacement (MENU_002)
- Hardware cost: 20-40 MAD (standard) to 59-120 MAD (soft-close/amortisseur)
- Labour implied: 150-250 MAD for 30-45 min work
- **Architecture: LABOUR_FIXED_PART_SEPARATE** — hardware cost is variable and significant relative to labour; must be quoted separately
- Batch of 2-4 hinges same cabinet: same visit economics, marginal additional labour

### Drawer Runner Replacement (MENU_003)
- Hardware cost (pair): 20-25 MAD (standard Mr. Bricolage) to 54-99 MAD (Jumia range)
- Labour implied: 225-300 MAD for 45-60 min work
- **Architecture: LABOUR_FIXED_PART_SEPARATE**
- Standard vs soft-close is critical quality distinction → client must approve hardware type

### Wardrobe/Sliding Door Adjustment (MENU_004)
- Adjustment only: 150-250 MAD implied
- Roller replacement: LABOUR_FIXED_PART_SEPARATE
- **Confidence: LOW** — insufficient direct evidence

### Interior Door Installation Labour-Only (MENU_006)
- **Best-evidenced service in this phase**
- 300-700 MAD for pose only (labour + standard hardware)
- Conditions: standard dimensions, existing frame suitable, client supplies door
- **Confidence: MEDIUM** — corroborated by SRC_MENU_004 and SRC_MENU_005

### Interior Door Full Supply + Install (MENU_007)
- All-in: 800-8,000+ MAD depending on material
- MDF mélaminé: 800-1,500 MAD. MDF laqué: 1,200-2,200. Bois massif pin: 1,800-3,500. Cèdre: 2,500-5,000+
- **QUOTE_REQUIRED** — 5× variation by material makes standardization impossible without pre-screening

### Custom Wardrobe/Placard (MENU_008)
- 2,000-6,000 MAD/ml (mélaminé to MDF laqué with brand hardware, all-in, pose incluse)
- Bois massif: 5,000-9,000 MAD/ml
- **Per-linear-metre scope:** full height facade, standard interior fittings, hardware, installation
- **QUOTE_REQUIRED** — dimensions, material, interior config all required

### Dressing (MENU_009)
- 2,500-7,000 MAD/ml (allo-maison)
- HomeDeco: 1,699 MAD/m² (different unit — scope-explicit)
- **QUOTE_REQUIRED**

### Kitchen Cabinetry (MENU_010)
- 3,500-9,000 MAD/ml (hors électroménager, hors plan de travail) — allo-maison network
- 4,000-18,000 MAD/ml by gamme — artmood
- CuisinAffaires entry: 17,900 DH for 2.4 ml implantation (pose incluse, garantie 25 ans)
- **Critical finding:** CuisinAffaires explicitly refuses to publish prix au mètre; states scope variability makes it misleading
- **QUOTE_REQUIRED** — confirmed by major market operator

### Linear-Metre Doctrine
- Per-ml pricing widely used in Morocco for placards, dressings, cuisines, bibliothèques
- **Scope varies significantly** between quotes — must specify: upper + lower cabinets vs lower only; worktop included or not; appliances included or not; hardware brand
- ABS chant edge treatment (ABS 1mm vs papier) is key quality differentiator
- 40-50% of all-in price is labour (allo-maison)

### Material Types
- **Mélaminé (panneaux particules revêtu):** most common, economic, gonfle au contact eau, tient mal vis sur tranche. 18mm with ABS chant is acceptable quality.
- **MDF:** superior surface for laquée finishes. Dense, heavy. Hydrofuge variant for humid areas.
- **Contreplaqué:** underused but better for humid areas (sous évier, salle de bain)
- **Bois massif (pin, hêtre, chêne):** premium. Pins 400-1,500 MAD/door. Oak/beech for durability. Sensitive to humidity.
- **Cèdre de l'Atlas:** specialty artisan product, 12,000-25,000 MAD/m³. Protected species.

### Aluminium Scope
- **Separate specialist trade** confirmed by multiple sources
- BTP labour table lists aluminium installation separately at 120-240 MAD/m²
- Different tools, skills, suppliers from wood menuiserie
- Moroccan market: aluminium dominates all exterior applications (windows, balcony doors, entrance)
- **Recommendation: Create separate ALUMINIUM métier. Exclude from MENUISERIE BOIS scope in estimator V1.**

### Geographic Variation
- Small but measurable city differences in per-ml pricing (allo-maison network)
- Casablanca/Rabat = highest (reference)
- Marrakech/Tanger ≈ same as Casablanca
- Fès/Agadir: -5 to -10% on labour (lechantier.ma BTP)
- **Conclusion: city variation exists but within normal market variance. No city multipliers warranted for V1.**

### Urgency/Night/Weekend
- AllohRayfi explicitly states: same price evening/weekend for petits travaux
- No Moroccan menuiserie-specific urgency premium documented
- All modifiers remain null

---

## 4. Standardized-Price Candidates

Services recommended for human calibration:

| Code | Service | Architecture | Evidence |
|------|---------|-------------|---------|
| MENU_001 | Réglage porte intérieure | CONDITIONAL_FIXED | LOW — human price needed |
| MENU_002 | Remplacement charnière (labour) | LABOUR_FIXED_PART_SEPARATE | LOW — hardware rates confirmed |
| MENU_003 | Remplacement coulisse tiroir (labour) | LABOUR_FIXED_PART_SEPARATE | LOW — hardware rates confirmed |
| MENU_004 | Ajustement porte coulissante placard | CONDITIONAL_FIXED | LOW |
| MENU_006 | Pose porte intérieure (labour only) | CONDITIONAL_FIXED | MEDIUM |

## 5. Quote-Required Services

| Code | Service | Reason |
|------|---------|--------|
| MENU_007 | Pose porte intérieure complète | 5× material variation |
| MENU_008 | Placard sur mesure | Dimensions + material required |
| MENU_009 | Dressing sur mesure | Dimensions + config required |
| MENU_010 | Cuisine sur mesure | Scope too variable, confirmed by operator |
| MENU_011 | Bibliothèque sur mesure | Variable |
| MENU_012 | Aluminium (deferred) | Separate specialist |

## 6. Artisan Economic Model — Small Repairs

Using standard menuisier rate 300-500 MAD/day (Casablanca):
- Hourly equivalent: 37.50-62.50 MAD/h (8h day)
- 30-min job: ~19-31 MAD labour pure
- **But:** travel, tools, setup, diagnosis = effectively 1-2h burdened time per visit
- Realistic minimum: 150-250 MAD labour equivalent per visit
- + travel (50-100 MAD estimated)
- + hardware (separately billed)
- + tool amortization

**Commission stress test at minimum viable client price 300 MAD:**
- 0%: artisan 300 MAD → viable with travel included
- 10%: artisan 270 MAD → still viable
- 15%: artisan 255 MAD → viable
- 20%: artisan 240 MAD → borderline with travel cost

**Commission stress test at 250 MAD:**
- 20%: artisan 200 MAD → below practical minimum once travel factored
- Conclusion: minimum client price for menuiserie intervention ≥ 300-350 MAD for FIXEO dual-fairness compliance

**Suggested Menuiserie minimum intervention target: 300-400 MAD** (FIXEO_POLICY label, not market fact)

## 7. Client Fairness Issues Identified

1. **Per-linear-metre ambiguity:** Two quotes at same MAD/ml may include very different scope (worktop, appliances, interior config). CuisinAffaires warns this is the primary source of disputes.
2. **Hidden hardware costs:** Standard quotes often bundle hardware without specifying brand/quality. Soft-close vs standard = 3× hardware cost difference.
3. **ABS edge band quality:** Not specified in informal quotes — determines whether meuble holds up after 2 years.
4. **Panel thickness:** 15mm vs 18mm caisson looks identical on delivery, fails differently.
5. **Repair that becomes fabrication:** "Small repair" can scope-creep into full replacement if damage is more extensive than expected. Must escape to QUOTE before work begins.
6. **Scope inflation:** Additional items added on-site ("while you're here...") at non-agreed rates.

## 8. Artisan Fairness Issues Identified

1. **Hardware sourcing time:** Sourcing correct hinge or runner type may require store trip — this time is often uncompensated.
2. **Measurement errors on custom work:** 1cm error on a 3m placard wastes full day's material; artisan bears risk.
3. **Return visits:** Custom fabrication often requires 2 visits (measure + install). Not always priced.
4. **Workshop time vs on-site:** Custom fabrication requires workshop prep that client doesn't see but must be priced.
5. **Tool burden for repairs:** Even a simple door adjustment requires drill, chisels, level, saw (for rabotage). Tool depreciation is real.

## 9. Métier Boundaries

| Adjacent Métier | Clear Boundary |
|----------------|----------------|
| SERRURERIE | Lock, cylinder, security mechanism → always SERRURERIE |
| BRICOLAGE | Simple furniture assembly (flat-pack), non-structural shelf mounting → BRICOLAGE |
| PEINTURE | Finishing/varnishing after wood repair → PEINTURE |
| VITRERIE | Glass/mirror panel replacement in furniture → VITRERIE |
| ALUMINIUM (future) | All aluminium fabrication (windows, baies, portes extérieures) |
| MACONNERIE | Structural wall/frame issues preventing door installation |
| ELECTRICITE | Motorized cabinet/door electrical systems |

---

## 10. Files in This Directory

| File | Contents |
|------|---------|
| `registry.v0.1.json` | 12 normalized service entries (candidates + quote-required + deferred) |
| `sources.v0.1.json` | 18 sources, grades A-D and T0 |
| `evidence.v0.1.json` | 22 evidence rows |
| `exclusions.v0.1.json` | 15 excluded services with routing |
| `legacy-comparison.md` | T0 legacy audit vs external evidence |
| `README.md` | This document |
| `validate.js` | Validator (run with `node validate.js`) |

---

## 11. Phase Status

**PHASE 7B.10 — FIXEO MENUISERIE MOROCCO MARKET RESEARCH — COMPLETE — HUMAN CALIBRATION REQUIRED**

No production files were modified. No prices were approved. No estimator changes made.
