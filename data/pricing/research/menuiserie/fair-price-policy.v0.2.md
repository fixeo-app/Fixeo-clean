# FIXEO Menuiserie — Fair Price Policy
## Phase 7B.10.1 — Calibration Preparation

**Date:** 2026-08-09  
**Status:** DRAFT — pending human approval  
**Label:** FIXEO_POLICY throughout — not market fact

---

## 1. Core Price Formula

```
FIXEO_MENUISERIE_STANDARD_PRICE =
  LABOUR (skilled intervention time)
+ TRAVEL (included in service price — not a separate charge)
+ BASIC_CONSUMABLES (screws, wood glue, minor items < 10 MAD total)
```

**Separate always:**
```
VARIABLE_HARDWARE =
  client-identified + artisan-specified + client-approved
  BEFORE purchase
```

---

## 2. Minimum Intervention Floor

| Metric | Value | Label |
|--------|-------|-------|
| Universal hard floor (all métiers) | 100 MAD | FIXEO_UNIVERSAL |
| Menuiserie practical minimum (candidate) | 300 MAD | FIXEO_POLICY |
| Architecture | Embedded in service prices | — |

**Menuiserie minimum is higher than Bricolage (200 MAD) because:**
- Precision tools: drill/driver, chisels, level, rabot, hand saw
- Specialist hardware diagnosis (hinge type, runner size, compatibility)
- Hardware sourcing knowledge
- Greater setup/cleanup burden
- Higher skill qualification than handyman

**Anti-double-charge rule:**
```
FINAL_PRICE = max(300 MAD, STANDARD_SERVICE_PRICE)
```
Never: `300 MAD + service_price`. The minimum is a floor, not an additional charge.

---

## 3. Hardware Doctrine

### 3.1 Mandatory Disclosure Sequence

```
STEP 1: IDENTIFY → What hardware is needed?
STEP 2: SPECIFY → Type, quality tier, brand if relevant
STEP 3: PRICE → Communicate unit cost to client
STEP 4: APPROVE → Wait for explicit client confirmation
STEP 5: ACQUIRE → Purchase or supply from artisan stock
STEP 6: INSTALL → With care and warranty
STEP 7: RETURN → Return old part to client where appropriate
```

### 3.2 Part-Supply Model

**Adopted model: MODEL B — Artisan-Supplied at Disclosed Price**

| Model | Description | Adopted? |
|-------|-------------|----------|
| A — Client supplies | Client provides part; artisan installs; no warranty on client part | Acceptable fallback |
| **B — Artisan supplies at disclosed price** | Artisan stocks common parts; discloses unit cost; client approves | **PREFERRED** |
| C — Bundled in fixed price | Part cost hidden in flat price | **REJECTED** |

**Reason for rejecting MODEL C:**
Standard hinge: 20-40 MAD. Soft-close hinge: 59-120 MAD. Bundling at any mid-point either overcharges clients on simple jobs or undercompensates artisans on soft-close jobs. Transparency is the only fair solution.

### 3.3 Hardware Covered

| Hardware | Type | Retail Range (MAD) | Billed |
|----------|------|-------------------|--------|
| Standard hinge | Cabinet/wardrobe | 20-40 MAD/unit | SEPARATE |
| Soft-close hinge | Cabinet/wardrobe | 59-120 MAD/unit | SEPARATE |
| Standard drawer runner | Runner pair | 20-26 MAD/pair | SEPARATE |
| Quality drawer runner | Runner pair | 55-99 MAD/pair | SEPARATE |
| Sliding door roller | Roller | ~30-80 MAD est. | SEPARATE |
| Standard screws/consumables | Consumables | <10 MAD total | INCLUDED |

### 3.4 Hardware Sourcing Policy

| Scenario | Policy |
|----------|--------|
| Client has compatible part | Artisan verifies compatibility → installs → no sourcing charge |
| Artisan carries stock part | Discloses cost → client approves → installs |
| Non-standard part: must source after diagnosis | Separate second-visit quote — do not hide sourcing trip in first-visit labour |

**Artisans should carry at minimum:**
- Standard hinges (pack of 4-6, most common sizes)
- Soft-close hinges (pack of 2-4)
- Standard runner pairs (35cm, 45cm, 50cm)
- Basic screws and rawlplugs

This minimizes return-visit frequency and improves client experience.

---

## 4. Repair vs Fabrication Doctrine

| Service Class | Architecture | Example |
|---------------|-------------|---------|
| STANDARD_ADJUSTMENT | CONDITIONAL_FIXED | Door adjustment, sliding door alignment |
| STANDARD_HARDWARE_REPLACEMENT | LABOUR_FIXED_PART_SEPARATE | Hinge replacement, runner replacement |
| MINOR_WOOD_REPAIR | CONDITIONAL_FIXED (if scope assessable) | Re-gluing, consolidation |
| MODERATE_REPAIR | QUOTE | Multiple damaged elements |
| CUSTOM_FABRICATION | QUOTE_REQUIRED | Any placard, dressing, kitchen |
| STRUCTURAL_DAMAGE | QUOTE / SPECIALIST | Frame damage, load-bearing issues |

**Hard rule:** A repair must stop and quote if scope expands beyond assessment-level assumption. Artisan does not proceed once fabrication scope is discovered.

---

## 5. Anti-Double-Charge and Batch Rules

### 5.1 Minimum Anti-Stack

```
FINAL_PRICE = max(MINIMUM, SERVICE_PRICE)  ← correct
FINAL_PRICE = MINIMUM + SERVICE_PRICE       ← PROHIBITED
```

### 5.2 Batch Labour Rules

| Service | Incremental Rule |
|---------|-----------------|
| Hinge replacement | Base visit (1 hinge) + 50 MAD per extra hinge, same door |
| Drawer runner | Base visit (1 drawer) + 100 MAD per extra drawer, same cabinet |
| Different cabinet/door | New base visit charge |
| Multiple doors (door adjustment) | Per-door price × number of doors |
| Multiple doors (door installation) | Per-door price × number of doors |

**Principle:** Same-visit same-cabinet work shares the fixed travel/setup cost. Different cabinet or different room = new visit economics.

### 5.3 Second-Visit Policy

When artisan must leave to source a non-standard part:
- First visit: diagnostic charge only (assessed at minimum intervention floor 300 MAD candidate)
- Return visit: service price (hardware replacement, installation)
- Never: fold sourcing trip into first visit labour silently

---

## 6. Client Fairness Commitments

| Risk | FIXEO Policy |
|------|-------------|
| Hidden hardware costs | Hardware always disclosed and approved before purchase |
| Scope creep to fabrication | Stop and quote before proceeding if scope expands |
| Unclear repair-vs-replacement | Pre-screening questions diagnose before price given |
| Double-visit hidden charges | Return visit for sourcing is disclosed upfront |
| Batch overcharge | Incremental pricing, not exponential multiplication |
| SERRURERIE scope absorbed | Lock/cylinder always explicitly excluded and rerouted |

---

## 7. Artisan Fairness Commitments

| Risk | FIXEO Policy |
|------|-------------|
| Hardware sourcing time uncompensated | Sourcing return visit = separate billable event |
| Measurement risk on custom work | Custom fabrication always QUOTE — artisan does not carry scope risk |
| Tool burden not priced | Minimum floor (300 MAD candidate) absorbs tool overhead |
| Return visits not priced | Second visit for non-standard part = separate charge |
| Rushed work incentivized by low prices | Prices calibrated to allow adequate intervention time (30-90 min) |
| Commission sensitivity | All candidate prices viable at 20% commission with reasonable travel |

---

## 8. Custom Fabrication Doctrine

All of the following **must remain QUOTE_REQUIRED** in Estimator V1:

- Custom wardrobe / placard sur mesure (MENU_008)
- Dressing sur mesure (MENU_009)
- Cuisine sur mesure (MENU_010)
- Bibliothèque sur mesure (MENU_011)
- Porte intérieure all-in with supply (MENU_007) — due to 5× material variation
- Aluminium fabrication (MENU_012) — deferred as separate specialist

**Per-linear-metre reference ranges** (2,000-9,000 MAD/ml) are **REFERENCE_EVIDENCE_ONLY**. They are not FIXEO standard prices.

**Why no per-ml standard price:**
- Material choice (mélaminé vs MDF laqué vs bois massif) creates 3-5× variation
- Scope definitions vary: upper+lower vs lower only; worktop included or not; hardware brand
- CuisinAffaires (25,000+ kitchens delivered): *"Annoncer un prix au mètre serait malhonnête"*
- allo-maison.ma: *"La première source d'erreur n'est pas le prix, c'est l'unité"*

---

## 9. Cross-Métier Boundaries

| Work Type | Routes to | Reason |
|-----------|-----------|--------|
| Lock, cylinder, security mechanism | SERRURERIE | Specialist security skill |
| Flat-pack furniture assembly | BRICOLAGE | Non-structural, no custom wood |
| Custom fabrication | MENUISERIE QUOTE | Requires design + workshop |
| Painting, varnishing, refinishing | PEINTURE | Surface treatment specialist |
| Glass or mirror panel | VITRERIE | Glass handling specialist |
| Aluminium windows/doors/bays | DEFERRED (future ALUMINIUM) | Separate tools, profilés, suppliers |
| Structural wall/frame issues | MAÇONNERIE | Load-bearing specialist |
| Motorized/electrical systems | ELECTRICITE | Electrical certification required |

**Hard rule:** No standardized menuiserie repair absorbs specialist work. When boundary is reached → stop, inform client, route correctly.

---

## 10. Client Pre-Screening Questions

### For Repair Services (MENU_001–004)

```
1. Quelle pièce : porte intérieure / placard / tiroir / porte coulissante ?
2. Quel est le problème exact ?
   (frotte / ne ferme pas / charnière cassée / tiroir bloqué / déraille)
3. La charnière/coulisse/roulette est-elle :
   (a) juste désaxée/mal réglée → ADJUSTMENT
   (b) endommagée/cassée → REPLACEMENT (+ hardware)
4. Le bois autour est-il endommagé (arraché, pourri, fendu) ?
   → OUI : QUOTE (reconstruction scope)
5. La pièce est-elle standard ou sur mesure ?
6. Avez-vous déjà la pièce de remplacement ?
7. Photos disponibles ?
```

### For Door Installation (MENU_006)

```
1. Avez-vous déjà la nouvelle porte (vantail) ?
2. Quelles dimensions ? (largeur standard : 73/83/93 cm)
3. Le cadre (bâti) existant est-il en bon état ?
4. Y a-t-il une ancienne porte à retirer ?
5. La porte a-t-elle une serrure ? (cylindre → SERRURERIE)
6. Y a-t-il des travaux de maçonnerie nécessaires ? → QUOTE si oui
```

---

*This policy is FIXEO_POLICY throughout. No policy element is derived from market evidence without explicit labelling.*  
*All candidate prices require explicit human approval before any production activation.*
