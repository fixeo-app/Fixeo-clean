# FIXEO Menuiserie — Human Calibration Review
## Phase 7B.10.1 — Human Price Decision Required

**Date:** 2026-08-09  
**Based on:** Research commit 184e154 (Phase 7B.10)  
**Status:** ALL DECISIONS PENDING — no price approved

---

## HOW TO READ THIS DOCUMENT

Each candidate service is presented with:
- **Market anchor** — what external evidence implies
- **Candidate prices** — 3-4 options tested with economic analysis
- **Recommended anchor** — research team's best-supported candidate
- **Architecture** — how the price works (flat, labour+part, incremental)
- **Decision required** — exactly what the human must choose

**All prices below are CANDIDATE prices. None are activated. All require explicit human approval before any production use.**

---

## GLOBAL POLICY DECISIONS REQUIRED

Before reviewing individual services, the human must confirm these global policies:

### GP-1: Menuiserie Minimum Intervention Floor

| Option | Amount | Verdict |
|--------|--------|---------|
| 250 MAD | Very tight at 20% commission + high travel | TOO_LOW for specialist |
| **300 MAD** | **Recommended** — viable at all commission levels, mid-travel | **CANDIDATE** |
| 350 MAD | Comfortable; may price out small adjustments | CONSERVATIVE |
| 400 MAD | Market ceiling for minor repair; risks client pushback | HIGH |

**Architecture**: Embedded in service prices (not a separate charge). All standard services priced ≥ minimum, so no double-charge risk.

**Rationale vs Bricolage (200 MAD)**: Menuiserie requires precision tools (drill, chisel, rabot, level), specialist diagnosis, hardware sourcing knowledge. Daily rate 300-500 MAD/day (Grade B source) vs handyman.

> **Human decision required:** ☐ 250 MAD ☐ **300 MAD (recommended)** ☐ 350 MAD ☐ 400 MAD

---

### GP-2: Hardware Policy Confirmation

**Proposed:** LABOUR_FIXED_PART_SEPARATE for all variable hardware.

Protocol:
1. IDENTIFY broken hardware
2. SPECIFY type (standard / soft-close / brand)
3. STATE unit price to client
4. GET CLIENT APPROVAL before purchase
5. INSTALL
6. RETURN old part where appropriate

**No silent hardware bundling. No silent markup.**

Part-supply model: **MODEL B (Artisan supplies at disclosed price)** — recommended over MODEL A (client supplies, no warranty) and MODEL C (bundled, rejected due to 3× cost variation between standard and soft-close).

> **Human decision required:** ☐ Confirm MODEL B ☐ Prefer MODEL A ☐ Other

---

### GP-3: Anti-Double-Charge Rule

```
FINAL_PRICE = max(MENUISERIE_MINIMUM, STANDARD_SERVICE_PRICE)
NOT: minimum + service_price
```

> **Human decision required:** ☐ Confirm ☐ Modify

---

## CANDIDATE SERVICE DECISIONS

---

### MENU_001 — Réglage porte intérieure

**Service:** Adjustment of one interior wooden/MDF door — hinges, alignment, lubrication, minor planing.

**External market anchor:** Implied 150-300 MAD from menuisier daily rate (Grade B). No direct Moroccan published price found. Confidence: **LOW**.

**Economic analysis at 20% commission, mid-travel (100 MAD), tool burden (30 MAD):**

| Candidate | Artisan Gross | Artisan Net | Assessment |
|-----------|--------------|-------------|-----------|
| 250 MAD | 200 MAD | ~70 MAD | Too tight — below net floor at mid-travel |
| **300 MAD** | **240 MAD** | **~110 MAD** | **Viable — borderline at high travel** |
| 350 MAD | 280 MAD | ~150 MAD | Comfortable — justified for planing |
| 400 MAD | 320 MAD | ~190 MAD | High for pure adjustment |

**Recommended architecture: Two-tier within service**

| Scope | Candidate Price |
|-------|----------------|
| Simple adjustment (hinges, screws, lube) | **300 MAD** |
| With rabotage léger (minor planing) | **350 MAD** |

**Scope includes:**
- ONE door, hinge tightening, alignment, lubrication, screw replacement, minor planing

**Scope excludes (hard boundaries):**
- Lock/cylinder → SERRURERIE
- Security door
- Rotten/structural frame
- Full door replacement
- Major wood reconstruction

**Complexity escape:**
- Frame structurally damaged → stop, quote or route MAÇONNERIE
- Wood rot discovered → stop, quote
- Door warp requires full rehang → escalate to MENU_007

> **Human decision required:**
> - Simple adjustment: ☐ 250 ☐ **300 (recommended)** ☐ 350 ☐ 400 MAD
> - With planing: ☐ 300 ☐ **350 (recommended)** ☐ 400 MAD
> - Architecture: ☐ Single flat price ☐ **Two-tier (recommended)**

---

### MENU_002 — Remplacement charnière meuble/placard (labour + pièce séparée)

**Service:** Replace hinge(s) on cabinet/wardrobe door. Labour fixed; hardware separate and client-approved.

**Hardware confirmed (Grade C retail sources):**
- Standard hinge: 20-40 MAD/unit
- Soft-close hinge: 59-120 MAD/unit

**Batch architecture recommendation:** BASE visit (1 hinge) + incremental per extra hinge same door.

**Economic analysis (base labour, 20% commission, mid-travel 100 MAD, tools 20 MAD):**

| Base Labour | Artisan Gross | Artisan Net | Assessment |
|-------------|--------------|-------------|-----------|
| 250 MAD | 200 MAD | ~80 MAD | Very tight — barely viable |
| **300 MAD** | **240 MAD** | **~120 MAD** | **Viable** |
| 350 MAD | 280 MAD | ~160 MAD | Comfortable — for complex hinge mounting |

**Batch simulation (at 300 MAD base, +50 MAD each extra hinge same door):**

| Scenario | Labour | Hardware (est.) | Total (est.) |
|----------|--------|-----------------|--------------|
| 1 standard hinge | 300 | 30 | 330 MAD |
| 2 hinges same door, standard | 350 | 60 | 410 MAD |
| 4 hinges same door, soft-close | 450 | 280 | 730 MAD |
| 4 hinges 2 cabinets | 600 | 120 | 720 MAD |

**All totals are reasonable** — no distorted outcomes found.

**Scope includes:**
- ONE cabinet door, accessible mounting
- Remove old hinge(s), fit new hinge(s), rehang door, align

**Scope excludes:**
- Stripped/rotten hinge hole requiring dowel repair → QUOTE
- Frame damage, door fabrication
- Non-standard hinge requiring special order → QUOTE for return visit

**Hardware sourcing scenarios:**
- Client has compatible part → artisan installs, no sourcing charge
- Artisan brings stock standard/soft-close → discloses cost, installs
- Non-standard hinge must be sourced → second visit pricing or separate quote

> **Human decision required:**
> - Base labour (1 hinge): ☐ 250 ☐ **300 (recommended)** ☐ 350 MAD
> - Incremental per extra hinge same door: ☐ +50 ☐ +75 ☐ other MAD
> - Architecture: ☐ **Base + incremental (recommended)** ☐ Flat fee all hinges ☐ Per-hinge flat

---

### MENU_003 — Remplacement coulisse tiroir (labour + pièce séparée)

**Service:** Replace drawer runner pair on one accessible drawer. Labour fixed; hardware separate and client-approved.

**Hardware confirmed (Grade C retail sources):**
- Standard runner pair: 20-26 MAD (Mr. Bricolage)
- Quality runner pair: 55-99 MAD (Jumia range)

**Economic analysis (base labour, 20% commission, mid-travel 100 MAD, tools 20 MAD):**

| Base Labour | Artisan Gross | Artisan Net | Assessment |
|-------------|--------------|-------------|-----------|
| 250 MAD | 200 MAD | ~80 MAD | Tight for 40-50 min work |
| **300 MAD** | **240 MAD** | **~120 MAD** | **Viable** |
| 350 MAD | 280 MAD | ~160 MAD | Comfortable — for difficult access |

**Batch simulation (at 300 MAD base, +100 MAD per extra drawer same cabinet):**

| Scenario | Labour | Hardware (est.) | Total (est.) |
|----------|--------|-----------------|--------------|
| 1 drawer, standard runners | 300 | 45 | 345 MAD |
| 2 drawers same cabinet, standard | 400 | 90 | 490 MAD |
| 3 drawers same cabinet | 500 | 135 | 635 MAD |
| 1 drawer, soft-close runners | 300 | 80 | 380 MAD |

**Scope includes:**
- ONE drawer, accessible cabinet, remove old runner pair, mount new pair, reinstall drawer, test

**Scope excludes:**
- Broken drawer box → QUOTE
- Non-standard dimensions requiring machining
- Fully integrated/proprietary systems requiring specialist tools

> **Human decision required:**
> - Base labour (1 drawer): ☐ 250 ☐ **300 (recommended)** ☐ 350 MAD
> - Incremental per extra drawer same cabinet: ☐ **+100 (recommended)** ☐ +75 ☐ other MAD
> - Quality tier (standard vs soft-close): ☐ Confirm hardware-separate model ☐ Bundle average

---

### MENU_004 — Ajustement porte coulissante placard

**Service:** Alignment and adjustment of sliding wardrobe/closet door system — no hardware replacement.

**External market anchor:** Implied 150-300 MAD from daily rate. No direct Moroccan published price. Confidence: **LOW**.

**Critical distinction — must pre-screen:**
- Adjustment only (CONDITIONAL_FIXED, this service)
- Roller replacement (LABOUR_FIXED_PART_SEPARATE, separate variant)
- Track replacement (QUOTE_REQUIRED, different service)

**Economic analysis (20% commission, mid-travel 100 MAD, tools 20 MAD):**

| Candidate | Artisan Gross | Artisan Net | Assessment |
|-----------|--------------|-------------|-----------|
| 300 MAD | 240 MAD | ~120 MAD | Viable for 20-40 min adjustment |
| **350 MAD** | **280 MAD** | **~160 MAD** | **Viable — for 2-panel systems** |
| 400 MAD | 320 MAD | ~200 MAD | Comfortable |
| 450 MAD | 360 MAD | ~240 MAD | High — escape to QUOTE more appropriate |

**Recommended:**
- Single panel system: 300 MAD
- Two+ panel system: 350 MAD

**Scope includes:** alignment, track cleaning, roller adjustment (if adjustable), lubrication
**Scope excludes:** roller replacement, track replacement, panel damage, structural deformation

> **Human decision required:**
> - Single panel: ☐ **300 (recommended)** ☐ 350 ☐ 400 MAD
> - Two+ panels: ☐ 300 ☐ **350 (recommended)** ☐ 400 MAD
> - Roller replacement variant: ☐ Confirm LABOUR_FIXED_PART_SEPARATE ☐ Merge into this service

---

### MENU_006 — Pose porte intérieure (main d'œuvre seule)

**Service:** Install one interior door (client provides door leaf). Labour only. Best-evidenced service in this phase.

**External market anchor:** **300-700 MAD** — corroborated by TWO C/C+ Moroccan sources (allo-maison.ma, fixeo.ma). Confidence: **MEDIUM** — strongest evidence in this phase.

**Eligibility conditions:**
- Client provides door leaf
- Existing frame/bâti compatible
- Standard dimensions (73/83/93 cm width)
- No masonry modification required
- Standard residential access

**Scope (recommended inclusions):**
- Remove old door leaf
- Hang new leaf on existing bâti
- Fit 2-3 standard hinges
- Alignment and adjustment
- Minor planing (rabotage léger) if needed
- Handle hole preparation + basic strike plate
- Cleanup
- Old door disposal: client's responsibility

**Scope excludes:** door supply, frame/bâti supply/replacement, lock mechanism (→ SERRURERIE), non-standard dimensions, security door, masonry work

**Economic analysis (20% commission, mid-travel 100 MAD, tool burden 40 MAD):**

| Candidate | Artisan Gross | Artisan Net | Assessment |
|-----------|--------------|-------------|-----------|
| 400 MAD | 320 MAD | ~180 MAD | Viable, lower anchor — no removal, easy fit |
| **500 MAD** | **400 MAD** | **~260 MAD** | **Recommended — standard conditions including removal** |
| 600 MAD | 480 MAD | ~340 MAD | Comfortable — heavy door or significant planing |
| 700 MAD | 560 MAD | ~420 MAD | High — consider QUOTE above this |

**Recommendation: 500 MAD (single price, all-in including old door removal)**

Rationale: A single clean price avoids client confusion. Old door removal is 10-15 min; separating it creates unnecessary friction. At 500 MAD: all commission scenarios yield artisan net >200 MAD — economically solid.

> **Human decision required:**
> - Price: ☐ 400 ☐ **500 (recommended)** ☐ 600 MAD
> - Old door removal: ☐ **Included (recommended)** ☐ Excluded
> - Handle prep: ☐ **Included (recommended, stops at cylinder — SERRURERIE boundary)** ☐ Excluded

---

### MENU_005 — Petite réparation meuble bois

**Status: DEFER**

Insufficient external evidence to anchor any price. AllohRayfi confirms demand; no Moroccan platform publishes a price. Calibrating without market evidence would produce a guess, not a calibrated price. Recommend revisiting after artisan interviews or platform data collection.

> **Human decision:** ☐ **Confirm DEFER** ☐ Provide artisan-interview anchor to override

---

## CUSTOM FABRICATION DOCTRINE — CONFIRMATION REQUIRED

The following services remain **QUOTE_REQUIRED** and must NOT receive canonical flat prices in V1:

| Service | Code | Reason |
|---------|------|--------|
| Pose porte intérieure complète (all-in) | MENU_007 | 5× material variation |
| Placard sur mesure | MENU_008 | Dimension + material required |
| Dressing sur mesure | MENU_009 | Config + interior required |
| Cuisine sur mesure | MENU_010 | CuisinAffaires confirms QUOTE only |
| Bibliothèque sur mesure | MENU_011 | Depth + thickness variable |
| Menuiserie aluminium | MENU_012 | Separate specialist métier |

Per-linear-metre ranges in evidence (2,000-9,000 MAD/ml) are **REFERENCE_EVIDENCE_ONLY** for future context. They are not FIXEO standard prices.

> **Human confirmation required:** ☐ Confirm all above remain QUOTE_REQUIRED / DEFERRED

---

## CROSS-MÉTIER BOUNDARIES — CONFIRMATION REQUIRED

| Work Type | Routes to |
|-----------|-----------|
| Lock / cylinder / security mechanism | SERRURERIE |
| Simple flat-pack furniture assembly | BRICOLAGE |
| Custom fabrication (any) | MENUISERIE QUOTE |
| Painting / varnishing / finishing | PEINTURE |
| Glass / mirror panel replacement | VITRERIE |
| Aluminium fabrication | DEFERRED / FUTURE SPECIALIST |
| Structural wall / frame damage | MAÇONNERIE |
| Motorized cabinet / electrical systems | ELECTRICITE |

> **Human confirmation required:** ☐ Confirm all boundaries ☐ Modify [specify]

---

## SUMMARY DECISION TABLE

| Code | Service | External Range | Recommended Price | Architecture | Hardware | Confidence | Human Decision |
|------|---------|---------------|------------------|-------------|---------|-----------|----------------|
| MENU_001 | Réglage porte | ~150-300 MAD implied | 300/350 MAD (two-tier) | CONDITIONAL_FIXED | NA | LOW | **PENDING** |
| MENU_002 | Charnière labour | ~150-250 MAD implied | 300 base + 50/hinge | LABOUR_FIXED_PART_SEPARATE | Standard 20-40/Soft-close 59-120 MAD | LOW | **PENDING** |
| MENU_003 | Coulisse tiroir labour | ~225-300 MAD implied | 300 base + 100/drawer | LABOUR_FIXED_PART_SEPARATE | Standard 20-26/Quality 55-99 MAD/pair | LOW | **PENDING** |
| MENU_004 | Sliding door adjust | ~150-300 MAD implied | 300/350 MAD (1/2+ panels) | CONDITIONAL_FIXED | PART_SEPARATE if roller replaced | LOW | **PENDING** |
| MENU_005 | Petite réparation meuble | No anchor | DEFER | — | — | INSUFFICIENT | **DEFER** |
| MENU_006 | Pose porte (labour) | 300-700 MAD (MEDIUM) | 500 MAD | CONDITIONAL_FIXED | NA (hinges bundled in labour) | MEDIUM | **PENDING** |
| MENU_007 | Pose porte all-in | 800-8,000+ MAD | QUOTE_REQUIRED | QUOTE | — | MEDIUM | QUOTE_REQUIRED |
| MENU_008 | Placard sur mesure | 2,000-6,000 MAD/ml | QUOTE_REQUIRED | QUOTE | — | MEDIUM | QUOTE_REQUIRED |
| MENU_009 | Dressing sur mesure | 2,500-7,000 MAD/ml | QUOTE_REQUIRED | QUOTE | — | MEDIUM | QUOTE_REQUIRED |
| MENU_010 | Cuisine sur mesure | 3,500-9,000 MAD/ml | QUOTE_REQUIRED | QUOTE | — | MEDIUM | QUOTE_REQUIRED |
| MENU_011 | Bibliothèque | 1,500-4,000 MAD/ml | QUOTE_REQUIRED | QUOTE | — | LOW | QUOTE_REQUIRED |
| MENU_012 | Aluminium | 700-2,500 MAD/m² | DEFERRED | SPECIALIST | — | MEDIUM | DEFERRED |

---

## WHAT HAPPENS NEXT

1. Human reviews this document and calibration.v0.2.json
2. Human provides explicit price decisions (accept/modify each candidate)
3. Research team creates V0.3 with human-frozen decisions marked `human_decision = APPROVED`
4. V0.3 undergoes final validation
5. FIXEO Estimation V1 consolidation/design begins (new phase)

**No production implementation until all of the above steps are complete.**

---

*All values are candidates only. No prices are approved. No estimator has been modified.*  
*Production runtime diff = 0. No deployment performed.*
