# FIXEO Bricolage — Human Review Document
## Phase 7B.7.1 — Human Calibration Preparation

> **Instructions for human reviewer**: Each section below presents research evidence and candidate prices. You must select or modify prices in the DECISION column. All prices remain PENDING until you explicitly approve them. No production change occurs from this document.

---

## STATUS

```
human_decision: PENDING
production_ready: false
price_provenance: FIXEO_HUMAN_CALIBRATED_PILOT (when approved)
```

---

## SECTION 1 — ARCHITECTURAL DECISIONS

### Decision 1.1 — Adopt Minimum Visit Price?

| Question | Options | Human Decision |
|---|---|---|
| Should FIXEO adopt a minimum visit price (BRIC-001)? | YES / NO / CONDITIONAL | **[ ]** |
| If YES, candidate value | 180 / **200** / 220 / 250 MAD | **[ ]** |
| Included on-site time | 20 min / **30 min** / 45 min | **[ ]** |
| Travel included? | **YES** / NO | **[ ]** |

**Research basis**: Market floor 150–200 MAD. Tanger/Casablanca economics confirm: a 20-minute task consumes a full artisan slot. 200 MAD anchor from Allo-Maison (1,342 devis Q1 2026).

**Recommended candidate**: **200 MAD** (30 minutes on-site, travel included, standard consumables included)

**Economic check at 200 MAD**:
- Commission 20%: artisan net = 160 MAD
- Minus 40 MAD fuel: 120 MAD
- Above 100 MAD hard floor: ✅

---

### Decision 1.2 — Primary Multi-Task Architecture

| Architecture | Candidate | Pros | Cons | Human Choice |
|---|---|---|---|---|
| Half-Day | **400 MAD** | Simple, client-clear, economical for 5+ tasks | Less flexible for 2–3 tasks | **[ ]** |
| Hourly | **150 MAD/h** (2h min) | Flexible, accurate | Client uncertainty, incentive risk | **[ ]** |
| First + Additional (65%) | 200 + 65% per add | Works for homogeneous lists | Complex for mixed tasks | **[ ]** |
| Combination | Both half-day AND hourly options | Maximum flexibility | Two systems to explain | **[ ]** |

**Recommendation**: Adopt HALF-DAY (400 MAD) as primary for batched visits. Offer HOURLY (150 MAD/h, 2h minimum) as alternative for unknown/open-ended scope. Use FIRST+ADDITIONAL only for 2–3 homogeneous items where client requests itemized billing.

---

## SECTION 2 — CANDIDATE PRICE DECISIONS

### BRIC-001 — Minimum Visit Price

| | |
|---|---|
| **Evidence confidence** | MEDIUM |
| **Research range** | 150–250 MAD |
| **Market anchor** | 200 MAD |
| **Scope** | Travel + up to 30 min on-site + 1 micro-task + standard consumables |
| **NOT included** | Hardware, extended time, specialist work |

| Candidate | Client cost | Artisan net @20% comm. | After 40 MAD fuel | Viable? |
|---|---|---|---|---|
| 180 MAD | 180 | 144 | 104 | ⚠️ Thin |
| **200 MAD** | 200 | 160 | 120 | ✅ |
| 220 MAD | 220 | 176 | 136 | ✅ |
| 250 MAD | 250 | 200 | 160 | ✅ (too high for micro) |

**HUMAN DECISION**: ☐ 180 MAD ☐ **200 MAD** ☐ 220 MAD ☐ 250 MAD ☐ Other: _____

---

### BRIC-010 — Small Furniture Assembly

| | |
|---|---|
| **Evidence confidence** | MEDIUM |
| **Research range** | 150–300 MAD |
| **Market anchor** | 200 MAD (Kitea official service = 200 MAD/item) |
| **Qualifies** | Bedside table, simple chair, small table, small shelving kit (1 package, est. 20–45 min) |
| **Does NOT qualify** | Items with doors/drawers, 2+ packages, requires wall anchoring |
| **Scope** | Assembly labour only. Furniture client-supplied. Wall anchoring NOT included. |

| Candidate | Client cost | Artisan net @20% | After fuel | Time check (40 min job) | Viable? |
|---|---|---|---|---|---|
| 180 MAD | 180 | 144 | 104 | 260 MAD/h effective | ⚠️ Tight but viable |
| **200 MAD** | 200 | 160 | 120 | 200 MAD/h effective | ✅ |
| 220 MAD | 220 | 176 | 136 | 220 MAD/h effective | ✅ |
| 250 MAD | 250 | 200 | 160 | 250 MAD/h effective | ✅ |

**Coherence check**: At 200 MAD, single furniture = minimum visit ✅ No double charge.

**HUMAN DECISION**: ☐ 180 MAD ☐ **200 MAD** ☐ 220 MAD ☐ 250 MAD ☐ Other: _____

---

### BRIC-020 — Shelf Installation (Pose Étagère Murale)

| | |
|---|---|
| **Evidence confidence** | LOW |
| **Research range** | 150–300 MAD |
| **Market anchor** | 200 MAD (inferred from Allo-Maison) |
| **Qualifies** | 1 shelf, client-supplied with brackets, standard masonry wall, ≤20kg, ≤2.5m height, ≤4 fixing points |
| **Does NOT qualify** | Concrete wall, tile wall, heavy shelf, height >2.5m |
| **Scope** | Drilling + standard anchors + alignment. Shelf + brackets client-supplied. |
| **Consumables included** | Standard plugs/screws up to 4 points |

| Candidate | Notes |
|---|---|
| 180 MAD | Below minimum visit — INCOHERENT for standalone ❌ |
| **200 MAD** | = minimum visit. Coherent ✅ |
| 220 MAD | Slightly above minimum. Justified given drilling skill. ✅ |
| 250 MAD | Upper range evidence. ✅ |

**Low evidence warning**: Only 2 sources. Price is inferred. Human calibrator should verify against local knowledge.

**HUMAN DECISION**: ☐ 180 MAD ☐ **200 MAD** ☐ 220 MAD ☐ 250 MAD ☐ Defer ☐ Other: _____

---

### BRIC-030 — TV Wall Mounting (Standard)

| | |
|---|---|
| **Evidence confidence** | MEDIUM (strongest specific evidence in this métier) |
| **Research range** | 200–400 MAD |
| **Market anchor** | 300 MAD (m3allempro Casablanca: 89 reviews, 412 missions, bracket excluded) |
| **Standard contract** | Client supplies TV + bracket. Fixed bracket only. Masonry/parpaing wall. ≤65". ≤40kg. ≤2.5m height. No cable concealment in wall. |
| **Artisan supplies** | Drill + standard anchors + labour + level |
| **Complexity escapes** | Reinforced concrete → conditional; Tile → conditional; Full-motion bracket → surcharge; Cable in wall → ELECTRICITE; TV >65" or >40kg → quote; Placo without stud → conditional |

| Candidate | Artisan net @20% | After fuel | Time (50–60 min) | Effective hourly | Viable? |
|---|---|---|---|---|---|
| 250 MAD | 200 | 160 | ~55 min | 175 MAD/h | ✅ Tight |
| 280 MAD | 224 | 184 | ~55 min | 200 MAD/h | ✅ |
| **300 MAD** | 240 | 200 | ~55 min | 218 MAD/h | ✅ Strong |
| 350 MAD | 280 | 240 | ~55 min | 262 MAD/h | ✅ Upper |

**HUMAN DECISION**: ☐ 250 MAD ☐ 280 MAD ☐ **300 MAD** ☐ 350 MAD ☐ Other: _____

---

### BRIC-002 — Hourly Rate

| | |
|---|---|
| **Evidence confidence** | MEDIUM |
| **Research range** | 100–180 MAD/h |
| **Market anchor** | 130 MAD/h (Allo-Maison) |
| **Minimum billing** | Market practice = 2 hours |
| **Best use** | Open-ended task lists, large furniture, unknown scope |

| Candidate rate | 2h minimum charge | Artisan net @20% | After fuel | Viable? |
|---|---|---|---|---|
| 130 MAD/h | 260 MAD | 208 MAD | 168 MAD | ✅ |
| **150 MAD/h** | 300 MAD | 240 MAD | 200 MAD | ✅ Strong |
| 160 MAD/h | 320 MAD | 256 MAD | 216 MAD | ✅ |

**HUMAN DECISION — Rate**: ☐ 130 MAD/h ☐ **150 MAD/h** ☐ 160 MAD/h ☐ Other: _____  
**HUMAN DECISION — Minimum**: ☐ 1h ☐ **2h** ☐ Other: _____

---

### BRIC-003 — Half-Day (Demi-journée)

| | |
|---|---|
| **Evidence confidence** | MEDIUM |
| **Research range** | 300–550 MAD |
| **Market anchor** | 400 MAD |
| **Duration** | 3–4 hours on-site |
| **Travel** | Included |
| **Scope** | All tasks artisan can complete in slot. All hardware client-supplied. No specialist work. |

| Candidate | Effective hourly (3–4h) | Artisan net @20% | After fuel | Viable? |
|---|---|---|---|---|
| 350 MAD | 88–117 MAD/h | 280 MAD | 240 MAD | ⚠️ Low |
| **400 MAD** | 100–133 MAD/h | 320 MAD | 280 MAD | ✅ |
| 450 MAD | 112–150 MAD/h | 360 MAD | 320 MAD | ✅ |
| 500 MAD | 125–167 MAD/h | 400 MAD | 360 MAD | ✅ |

**HUMAN DECISION**: ☐ 350 MAD ☐ **400 MAD** ☐ 450 MAD ☐ 500 MAD ☐ Other: _____

---

### BRIC-070 — Multi-Task Visit Architecture

| Question | Options | Human Decision |
|---|---|---|
| Primary batch architecture | Half-Day / First+Additional / Both | **[ ]** |
| Additional item rate (if First+Additional) | 50% / 60% / **65%** / 70% / 75% | **[ ]** |
| Max items in minimum visit | 1 micro-task / **2 micro-tasks** / 3 | **[ ]** |

---

## SECTION 3 — SERVICES TO DEFER

The following services are recommended for DEFERRAL. Human confirms or overrides:

| Code | Service | Research Confidence | Recommendation | Human Decision |
|---|---|---|---|---|
| BRIC-011 | Medium furniture | LOW | DEFER → use HOURLY | ☐ Approve Defer ☐ Override |
| BRIC-012 | Large wardrobe | LOW | DEFER → QUOTE_REQUIRED | ☐ Approve Defer ☐ Override |
| BRIC-021 | Curtain rod | INSUFFICIENT | DEFER → multi-task add-on | ☐ Approve Defer ☐ Override |
| BRIC-022 | Mirror | INSUFFICIENT | DEFER → multi-task add-on | ☐ Approve Defer ☐ Override |
| BRIC-023 | Frame/cadre | INSUFFICIENT | Never standalone | ☐ Approve Defer ☐ Override |
| BRIC-040 | Bathroom accessories | INSUFFICIENT | DEFER | ☐ Approve Defer ☐ Override |
| BRIC-050 | Door adjustment | LOW | DEFER | ☐ Approve Defer ☐ Override |
| BRIC-051 | Handle replacement | LOW | DEFER | ☐ Approve Defer ☐ Override |
| BRIC-060 | Silicone/finitions | LOW | Add-on only | ☐ Approve Defer ☐ Override |

---

## SECTION 4 — MÉTIER BOUNDARY CONFIRMATION

Human confirms the following boundaries:

| Boundary | Rule | Human Confirms |
|---|---|---|
| Electrical work | Always ELECTRICITE | ☐ Confirmed |
| Cable relocation (TV) | Always ELECTRICITE | ☐ Confirmed |
| Plumbing modification | Always PLOMBERIE | ☐ Confirmed |
| Lock/cylinder | Always SERRURERIE | ☐ Confirmed |
| Interior door handle | BRICOLAGE_ALLOWED | ☐ Confirmed |
| Standard anchor drilling | BRICOLAGE_ALLOWED | ☐ Confirmed |
| Load-bearing wall | MAÇONNERIE / Refuse | ☐ Confirmed |
| Custom woodwork | MENUISERIE | ☐ Confirmed |
| Tile | CARRELAGE | ☐ Confirmed |
| Painting | PEINTURE | ☐ Confirmed |

---

## SECTION 5 — MATERIAL POLICY CONFIRMATION

| Policy Item | Rule | Human Confirms |
|---|---|---|
| Standard plugs/screws (≤8 pts masonry) | INCLUDED | ☐ Confirmed |
| Specialty anchors (Molly, chemical) | PART_SEPARATE_WITH_DISCLOSURE | ☐ Confirmed |
| TV bracket | CLIENT_SUPPLIED | ☐ Confirmed |
| Shelf + brackets | CLIENT_SUPPLIED | ☐ Confirmed |
| Furniture | CLIENT_SUPPLIED | ☐ Confirmed |
| All major hardware | CLIENT_SUPPLIED | ☐ Confirmed |

---

## HUMAN SIGN-OFF

When all decisions above are made, this document should be returned with:

- All checkboxes filled
- Prices selected or overridden
- Signed/initialled: ________________
- Date: ________________

After sign-off → Phase 7B.7.2 (Price Decision Freeze) will record final approved prices in a new V0.2 approved artifact.

---

*Document status: PENDING HUMAN DECISIONS*  
*Version: 0.2 — Human Calibration Preparation*  
*Phase: 7B.7.1*  
*Disclaimer: Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.*
