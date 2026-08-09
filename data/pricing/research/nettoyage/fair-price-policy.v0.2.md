# NETTOYAGE — Fair Price Policy Framework
## Phase 7B.8.1 — Policy Preparation Only — All Decisions PENDING

---

## 1. Worker Fairness Policy

### 1.1 The PER_CLEANER_HOUR Doctrine

**Principle**: Every cleaner who performs work is paid for their labour. A team of 2 cleaners working 3 hours delivers 6 cleaner-hours of value — not 3.

**Rule**: FIXEO commission is applied to the total invoice (which reflects total cleaner-hours). The artisan/team receives the net after commission.

**Anti-exploitation rule**: FIXEO must never create a pricing model where adding a second cleaner increases the work delivered but concentrates the revenue such that per-cleaner income falls below the floor.

### 1.2 Proposed Net Cleaner-Hour Floor

**Recommended**: **40 MAD / cleaner-hour net** (FIXEO_POLICY — not a statistical fact)

**Derivation**:
- 40 MAD/ch net requires ~60 MAD/ch gross at 20% commission over a 3h minimum visit with 25 MAD travel
- Below 35 MAD/ch net, a Moroccan urban cleaner covering their own transport cannot economically justify the intervention
- 40 MAD/ch is achievable at the recommended 60 MAD/ch rate for 3h+ jobs

**Commission scenarios for 60 MAD/ch rate**:

| Duration | Commission | Gross | Net (after travel) | Net/ch | Floor pass? |
|---|---|---|---|---|---|
| 3h × 1 cleaner | 0% | 180 MAD | 155 MAD | 51.7 MAD/ch | ✅ |
| 3h × 1 cleaner | 10% | 180 MAD | 137 MAD | 45.7 MAD/ch | ✅ |
| 3h × 1 cleaner | 15% | 180 MAD | 128 MAD | 42.7 MAD/ch | ✅ |
| 3h × 1 cleaner | 20% | 180 MAD | 119 MAD | 39.7 MAD/ch | ⚠️ Marginal |
| 4h × 1 cleaner | 20% | 240 MAD | 167 MAD | 41.8 MAD/ch | ✅ |
| 6h × 1 cleaner | 20% | 360 MAD | 263 MAD | 43.8 MAD/ch | ✅ |
| 7ch (2×3.5h) deep | 20% | 420 MAD | 287 MAD | 41.0 MAD/ch | ✅ |

**Policy implication**: The minimum visit (NET-001: 200 MAD minimum) protects the 3h scenario at 20% commission — the artisan receives 135 MAD net (45 MAD/ch), clearing the floor.

### 1.3 Multi-Worker Team Economics

For a team of 2 cleaners:
- Total artisan pool = gross price × (1 − commission) − travel − consumables
- This pool is split between the 2 cleaners
- FIXEO does not dictate how the lead artisan pays their team member — but the economics must allow equitable split

**Example (NET-004, 600 MAD, 2 cleaners × 3.5h)**:
- Gross: 600 MAD
- After 20% commission: 480 MAD
- After 50 MAD consumables + 25 MAD travel: 405 MAD artisan pool
- Per cleaner: 202.50 MAD / 3.5h = **57.9 MAD/ch per cleaner**
- ✅ Above floor — both cleaners viable

---

## 2. Client Fairness Policy

### 2.1 Transparency Before Booking

Every booking must display before confirmation:
- Number of cleaners (worker count)
- Expected duration
- Total cleaner-hours
- Total price
- What is included
- What is NOT included
- Who supplies products/equipment

**No surprise pricing after service delivery.**

### 2.2 Anti-Double-Charge Rule

`CLIENT_PAYS = max(NET-001_minimum, NET-002_rate × total_cleaner_hours)`

The minimum visit is a **floor**, never an additive charge on top of hourly billing.

### 2.3 Scope Dispute Prevention

**Standard cleaning contract**: Explicitly written list of included tasks. Client acknowledges before booking. Artisan cannot add scope or charges on-site without client consent and a new price agreement.

**Post-construction complexity escape**: If heavy residue is found on-site that was NOT disclosed at booking, the artisan must STOP and contact FIXEO/client for scope revision before proceeding. No unilateral surcharge.

### 2.4 Product/Equipment Clarity

For standard cleaning (NET-001/002): Client must be notified that **products and equipment are client-supplied**. If client lacks them, booking should either redirect to a premium package or allow artisan to bring basics at disclosed surcharge.

### 2.5 Bait-Price Prevention

FIXEO prices are **all-in** (travel included). No "à partir de" (starting from) pricing without explicit disclosure of what triggers a higher price.

Complexity surcharges require pre-qualification at booking, not artisan discretion at delivery.

### 2.6 Mattress Face Clarity

Consumer-facing price covers **both faces** of the mattress. No ambiguity about whether the mattress was cleaned "properly". Internal economics remain face-based.

---

## 3. Complexity Policy

### 3.1 Approved Complexity Levels

| Level | Definition | FIXEO Action |
|---|---|---|
| STANDARD | Normal residential soiling, regularly maintained | Standard price applies |
| HEAVY | Visible heavy grease, weeks of neglect, pet hair, post-party — declared at booking | Artisan may request quote or apply pre-agreed surcharge with client consent |
| POST_CONSTRUCTION | Construction dust, paint/cement residue, chantier — NET-030 scope | Separate NET-030 service, per-m² pricing |
| SPECIALIST | Mold (structural), biohazard, sewage, infestation, smoke/fire damage | ROUTE_TO_SPECIALIST — no FIXEO artisan |

### 3.2 No Artisan Discretion Multipliers

FIXEO does not allow artisans to unilaterally apply 1.2×, 1.5×, or 2× multipliers on-site.

**Rule**: If the job is more complex than declared at booking:
1. Artisan documents the additional condition
2. Client is contacted for consent
3. A new price is agreed before additional work proceeds
4. If client declines → artisan completes original scope only

### 3.3 Complexity Qualification at Booking

Estimator must ask the complexity questions listed in `calibration.v0.2.json → client_prescreening_questions` to pre-qualify the complexity level. If "HEAVY" is declared, price is adjusted upfront.

---

## 4. Métier Boundary Policy

| Situation | Correct Route | Never |
|---|---|---|
| Broken glass | VITRERIE | Do not route to Nettoyage |
| Painted wall needs repainting | PEINTURE | Do not route to Nettoyage |
| Water leak / plumbing | PLOMBERIE | Do not route to Nettoyage |
| Moving furniture | DEMENAGEMENT | Nettoyage handles property cleaning only |
| Active pest infestation | SPECIALIST PEST | Not Nettoyage |
| Structural mold (> surface) | SPECIALIST REMEDIATION | Not Nettoyage |
| Biohazard | SPECIALIST | Absolute exclusion |
| Industrial/HACCP | EXCLUDED from FIXEO entirely | — |

---

## 5. Post-Construction Special Policy

Post-construction cleaning **is not** an extension of standard residential cleaning. It is a different economic category:
- Different equipment (industrial)
- Different consumables (professional)
- Different worker count (teams)
- Different duration formula (per m² not per hour)
- Different minimum job size

**The legacy FIXEO price (300–700 MAD) for nettoyage après travaux is LEGACY_TOO_LOW and must not be used.**

Recommended minimum project price: **1000 MAD** (prevents uneconomic micro-jobs).

---

## 6. Upholstery/Textile Special Policy

Sofa and mattress cleaning is a specialist service:
- Injection-extraction machine required — not available to untrained cleaners
- Products must be appropriate for fabric type
- A standard ménage artisan who does not have an injection-extraction machine must NOT be matched to NET-010/011/013/014 jobs

**FIXEO artisan specialization**: Upholstery cleaning is a separate service category requiring separate artisan qualification.

---

*All policies in this document are PENDING human approval. No policy takes effect until Phase 7B.8.2 freeze.*
