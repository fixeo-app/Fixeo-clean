# FIXEO Bricolage — Fair Price Policy
## Phase 7B.7.1 — Human Calibration Preparation

> Status: DRAFT — pending human approval. No prices activated.

---

## 1. Core Doctrine

### 1.1 FIXEO Dual Fairness Principle

Every FIXEO bricolage price must be simultaneously:

**Fair to the client:**
- Known before the artisan arrives
- Priced for the task, not the trip (beyond minimum visit)
- Free from hidden material charges
- Immune to scope creep without client consent
- Clearly escaped when a task exceeds the defined contract

**Fair to the artisan:**
- Covers travel, tools, and setup — not just on-site time
- Maintains 100 MAD minimum net after commission and fuel
- Does not incentivize rushed or unsafe work
- Compensates complexity appropriately
- Does not force artisan to absorb scope overrun at fixed price

### 1.2 Anti-Double-Charge Rule

A client must never pay:
- Minimum visit fee **AND** full standalone task price simultaneously
- Travel charge **AND** per-task charge that already embeds travel

When a standardized task (BRIC-010, BRIC-020, BRIC-030) is booked:
→ Travel is embedded in the task price
→ Minimum visit fee (BRIC-001) does NOT additionally apply
→ BRIC-001 applies ONLY when no standardized task applies (micro-tasks below our standardized threshold)

### 1.3 Anti-Quantity-Multiplication Rule

For multi-task visits, task prices must NOT be multiplied by quantity as if each task were a standalone visit.

Correct approach:
- **Single task**: full price (includes travel)
- **Additional tasks same visit**: incremental rate (travel already paid)
- **5+ tasks**: half-day rate applies — most economical and transparent

---

## 2. Pricing Architecture Map

```
CLIENT SITUATION → FIXEO ARCHITECTURE
─────────────────────────────────────────────────────────────
1 micro-task (hook, tiny fix)     → MINIMUM VISIT (BRIC-001)
                                     ~200 MAD | 30 min included

1 small furniture item             → PER ITEM (BRIC-010)
                                     ~200 MAD | labour only

1 wall shelf                       → PER ITEM (BRIC-020)
                                     ~200 MAD | bracket client-supplied

1 TV mounting                      → CONDITIONAL FIXED (BRIC-030)
                                     ~300 MAD | bracket client-supplied

2–3 homogeneous items              → FIRST + ADDITIONAL (BRIC-070)
 (e.g. 3 shelves)                   ~330–460 MAD | 65% incremental

4–6+ mixed tasks                   → HALF-DAY (BRIC-003)
 (TV + shelves + mirror + etc.)     ~400 MAD | 3–4h included

Open-ended / unknown scope         → HOURLY (BRIC-002)
 (large furniture / long list)      ~150 MAD/h | 2h minimum

Specialist task                    → ESCAPE → specialist métier
 (electrical/plumbing/lock)

Very complex / large               → QUOTE REQUIRED
 (IKEA kitchen / riad / >40kg TV)
```

---

## 3. Minimum Visit Contract

**BRIC-001 — Forfait visite minimale**

| Element | Policy |
|---|---|
| Price | [PENDING HUMAN APPROVAL — candidate: 200 MAD] |
| Travel | INCLUDED (one round trip) |
| On-site time | Up to 30 minutes |
| Tasks included | One micro-task (single fixing point, hook, minor adjustment) |
| Standard consumables | INCLUDED (standard plugs/screws for up to 2 fixing points) |
| Hardware | CLIENT_SUPPLIED |
| After 30 min | Transition to hourly rate (BRIC-002), agreed before starting |
| Stacking | NEVER charge minimum visit on top of a standardized task price |
| Batching incentive | Client encouraged to list all tasks before booking — reduces effective per-task cost |

---

## 4. Per-Item Task Contracts

### BRIC-010 — Small Furniture Assembly

| Element | Policy |
|---|---|
| Price | [PENDING — candidate: 200 MAD] |
| Qualifies | 1 package, ≤45 min assembly time, no doors/drawers, no wall anchoring |
| Examples | Bedside table, simple chair, small table, simple shoe rack |
| Furniture | CLIENT_SUPPLIED |
| Wall anchoring | NOT INCLUDED — client decides (safety: artisan recommends anchoring tall furniture) |
| Escape | Missing parts → STOP → notify client → document |
| Escape | 2+ packages → re-classify as MEDIUM → re-quote |

### BRIC-020 — Shelf Installation

| Element | Policy |
|---|---|
| Price | [PENDING — candidate: 200 MAD] |
| Qualifies | 1 shelf, client-supplied + brackets, standard masonry, ≤20kg, ≤4 fixing points, ≤2.5m height |
| Shelf + brackets | CLIENT_SUPPLIED |
| Consumables | Standard plugs + screws for up to 4 points INCLUDED |
| Escape | Reinforced concrete → surcharge + client approval |
| Escape | Tile wall → declare crack risk → surcharge + client approval |
| Escape | Plasterboard without stud → conditional → client approval required |
| Escape | Heavy shelf >20kg → conditional quote |
| Additional shelves | Incremental rate (65% of first shelf price) — same visit |

### BRIC-030 — TV Wall Mounting (Standard)

| Element | Policy |
|---|---|
| Price | [PENDING — candidate: 300 MAD] |
| TV | CLIENT_SUPPLIED |
| Bracket | CLIENT_SUPPLIED (client must supply compatible bracket for TV weight/VESA) |
| Qualifies | Fixed or simple tilt bracket, masonry/parpaing wall, ≤65", ≤40kg, ≤2.5m, no cable concealment in wall |
| Artisan supplies | Labour + drill + standard expansion anchors (4× M8) + level |
| Standard anchors | INCLUDED |
| Escape — Reinforced concrete | DECLARE_CONDITIONAL → specialty anchors → surcharge + client approval |
| Escape — Plasterboard | DECLARE_CONDITIONAL → stud finder + confirm structural → conditional |
| Escape — Tile wall | DECLARE_CONDITIONAL → diamond bit + crack risk disclosure + surcharge |
| Escape — Full-motion bracket | DECLARE_CONDITIONAL → additional time complexity surcharge |
| Escape — TV >65" or >40kg | DECLARE_HORS_PÉRIMÈTRE → 2-person job → quote |
| Escape — Cable in wall | DECLARE_HORS_PÉRIMÈTRE_BRICOLAGE → electrical socket relocation → ELECTRICITE |
| Escape — Height >2.5m | DECLARE_HORS_PÉRIMÈTRE → scaffolding → quote |

---

## 5. Multi-Task Visit Contracts

### BRIC-003 — Half-Day (Demi-journée)

| Element | Policy |
|---|---|
| Price | [PENDING — candidate: 400 MAD] |
| Duration | 3–4 hours on-site |
| Travel | INCLUDED (single round trip) |
| Tasks | All achievable within 3–4h. Client prepares list before booking. |
| Consumables | Standard plugs/screws INCLUDED for all tasks |
| Hardware | ALL CLIENT_SUPPLIED |
| Specialist tasks | NOT COVERED — any electrical/plumbing/lock task escapes |
| Overtime | If tasks require >4h: artisan notifies → hourly rate for additional time → client approval before continuing |
| Pre-booking | Client must provide task list + confirm hardware available |

### BRIC-002 — Hourly Rate

| Element | Policy |
|---|---|
| Rate | [PENDING — candidate: 150 MAD/h] |
| Minimum billing | 2 hours |
| Travel | INCLUDED in 2h minimum |
| Consumables | Standard plugs/screws INCLUDED |
| Use case | Open-ended task list, large furniture assembly, unknown-duration work |
| Billing | Actual time rounded to nearest 30 min after 2h minimum |
| Time estimate | Artisan provides estimate range before starting. Client agrees. No surprise billing. |

---

## 6. Materials and Hardware Protocol

### Included in all standardized prices
- Standard expansion plugs (6–10mm) for normal masonry — up to 8 per intervention
- Standard screws matching standard fixings
- Surface cable ties (TV mount only)

### Separate — must be disclosed before purchase
- Specialty hollow-wall anchors (Molly / toggle) for hollow block / plasterboard
- Chemical anchors M10 for reinforced concrete heavy mounts
- Diamond drill bits (if artisan must purchase for tile work)
- Any artisan-sourced replacement part not client-supplied

**Disclosure protocol:**
1. IDENTIFY required specialty item
2. STATE exact specification and quantity
3. STATE cost to client
4. OBTAIN verbal or written client approval
5. PROCEED

**Never:** buy specialty items and charge back without prior approval.

### Always client-supplied
- All shelves and brackets
- All curtain rods and fixings
- All TV brackets
- All mirrors
- All furniture (flat-pack)
- All bathroom accessories
- All decorative items (frames, pictures, patères)
- All handles and hinges for repair

---

## 7. Complexity Escape Protocol

**Trigger:** Any on-site condition that falls outside the standardized contract scope.

**Protocol:**
```
STOP work immediately
↓
IDENTIFY the escape condition
↓
EXPLAIN to client in plain language
↓
DECLARE: "Ce travail dépasse le périmètre du prix FIXEO standard"
↓
STATE: new required scope and estimated additional cost
↓
OBTAIN: explicit client approval before continuing
↓
CONTINUE or ROUTE to specialist
```

**Key principle:** Client must never arrive at a surprise charge. The escape is visible and approved before any additional cost is incurred.

---

## 8. Métier Handoff Protocol

When a task during a bricolage visit is identified as requiring a specialist:

1. STOP the specialist task
2. EXPLAIN to client: "Ce travail nécessite un [électricien / plombier / serrurier] certifié FIXEO pour votre sécurité."
3. COMPLETE the non-specialist tasks in the visit
4. Charge only for the bricolage work completed
5. FIXEO platform: flag specialist booking needed for client

---

## 9. Client Pre-Screening Checklist

Before any bricolage booking is confirmed:

**For furniture assembly:**
- [ ] Type of furniture?
- [ ] Number of packages?
- [ ] New flat-pack (instructions available)?
- [ ] Number of items total?

**For TV mounting:**
- [ ] Screen size (inches)?
- [ ] Approximate weight?
- [ ] Wall type (parpaing / béton / placo / carrelage)?
- [ ] Fixed or articulating bracket?
- [ ] Bracket already purchased and compatible?
- [ ] Cable concealment required?

**For shelf/wall fixing:**
- [ ] Number of shelves/items?
- [ ] Wall material?
- [ ] Approximate shelf weight load?
- [ ] All hardware (shelf + brackets) already purchased?

**For multi-task visits:**
- [ ] Complete task list from client
- [ ] Hardware availability confirmed for each task
- [ ] Any electrical/plumbing/lock tasks on list? → route

---

## 10. Future Estimator Integration Notes

> These notes are for the future FIXEO estimator UI design. They do not implement anything.

The bricolage pricing model should present clients with:

1. **Task selector** — choose task type
2. **Qualifier questions** — wall type, item size, quantity
3. **Instant price** — for standardized eligible scope
4. **OR: Complexity flag** — "This job requires an assessment" → artisan confirms on-site

For multi-task:
- Present half-day as primary option for 4+ tasks
- Present itemized incremental for 2–3 tasks
- Present hourly for unknown scope

The estimator must enforce the anti-double-charge rule algorithmically: if a standardized task is selected, minimum visit fee must not appear as separate line item.

---

*Status: DRAFT — Human Calibration Preparation*  
*Phase: 7B.7.1*  
*human_decision: PENDING*  
*production_ready: false*  
*Disclaimer: Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.*
