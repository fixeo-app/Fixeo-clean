# FIXEO Plumbing Human Review Matrix — V0.2

**Status: HUMAN_REVIEW_REQUIRED — ALL DECISIONS PENDING**
**Version:** 0.2.0
**Phase:** 7B.3.2 — Human Calibration & Fair-Price Policy
**Date:** 2026-08-09
**Production-ready:** NO — Not connected to any FIXEO production system

---

## ⚠️ Instructions for Reviewer

This document contains the six plumbing candidate services ready for human price decision.

For each service, review all rows carefully. Then fill in **HUMAN DECISION** with one of:
- `APPROVED_FIXED — [price] MAD` — approve the proposed fixed price
- `APPROVED_RANGE — [low]–[high] MAD` — approve the proposed range
- `MODIFY — [specify]` — approve a different price/range
- `REJECT — [reason]` — do not proceed with this service
- `DEFER — [reason]` — not enough information to decide yet

**Do not modify any other row in this table.**

---

## Decision Matrix

---

### SERVICE 1 — plomberie.diagnostic

| Field | Value |
|-------|-------|
| **Service code** | `plomberie.diagnostic` |
| **Label** | Déplacement et diagnostic plomberie |
| **CONSENSUS_LOW** | 100 MAD |
| **WEIGHTED_MARKET_ANCHOR** | 150 MAD |
| **CONSENSUS_HIGH** | 200 MAD |
| **Confidence** | MEDIUM |
| **Sources** | mano.ma (editorial), bnidari.ma × 2 (C+), inworky.com (C) |
| **Proposed architecture** | OPTION B — NARROW RANGE |
| **Proposed pilot price** | **100–180 MAD** |
| **Proposed rationale** | Range covers geographic travel variation; floor 100 MAD = evidence minimum; ceiling 180 MAD = commission-robust anchor at 15% commission |
| **Inclusions** | Travel, on-site inspection, verbal diagnosis, verbal quote |
| **Exclusions** | Any repair, any parts, written report, second visit, specialist diagnostic equipment |
| **Diagnostic policy** | PENDING HUMAN DECISION — see 3 options in fair-price-policy.v0.2.md §14 |
| **Materials included** | NONE |
| **Part included** | NONE |
| **Labour** | Included |
| **Travel** | IS the service |
| **Complexity escape** | Address outside zone; intermittent fault; access specialist equipment; immeuble authorization required |
| **CLIENT_FAIRNESS** | ACCEPTABLE — requires disclosure that fee is owed even without repair |
| **ARTISAN_FAIRNESS** | WEAK_TO_ACCEPTABLE — tight at 15%+ commission with long urban travel |
| **Net artisan @ 10% commission** | 95 MAD (less 40 fuel) |
| **Net artisan @ 15% commission** | 87.50 MAD (less 40 fuel) |
| **Net artisan @ 20% commission** | 80 MAD (less 40 fuel) |
| **COMMISSION_RISK @ 10%** | ACCEPTABLE |
| **COMMISSION_RISK @ 15%** | MEDIUM |
| **COMMISSION_RISK @ 20%** | WEAK |
| **Candidate status** | READY_FOR_NARROW_RANGE_PILOT (conditional on diagnostic policy decision) |
| **Diagnostic policy decision** | **PENDING** |
| **HUMAN DECISION** | **PENDING** |

---

### SERVICE 2 — plomberie.fuite_simple

| Field | Value |
|-------|-------|
| **Service code** | `plomberie.fuite_simple` |
| **Label** | Réparation fuite simple — visible et accessible |
| **CONSENSUS_LOW** | 150 MAD |
| **WEIGHTED_MARKET_ANCHOR** | 220 MAD |
| **CONSENSUS_HIGH** | 350 MAD |
| **Confidence** | MEDIUM |
| **Sources** | mano.ma, bnidari.ma × 2, inworky.com, allo-maison.ma Casablanca |
| **Proposed architecture** | OPTION B — NARROW RANGE |
| **Proposed pilot price** | **180–280 MAD** |
| **Proposed rationale** | Floor raised to 180 from 150 to maintain artisan viability after materials (20–40 MAD). Anchor 220 is sound. Ceiling 280 reflects scope variation. Evidence CONSENSUS_HIGH 350 = out-of-scope boundary. |
| **Inclusions** | Travel, visual ID, 1 accessible leak point, standard repair, sealing consumables ≤50 MAD |
| **Exclusions** | Leak inside wall/floor, pipe replacement >20 cm, >1 leak point, any part >50 MAD, water damage, masonry |
| **Pre-arrival questions** | See fair-price-policy.v0.2.md §4.2 — 4 classification questions required |
| **Materials included** | Basic consumables: joint, téflon, pâte — TOTAL ≤50 MAD |
| **Part included** | EXCLUDED — any part >50 MAD quoted separately before installation |
| **Labour** | Included |
| **Travel** | Included |
| **Complexity escape** | Hidden leak, >1 point, tile/wall removal, part >50 MAD, >20 cm pipe replacement |
| **CLIENT_FAIRNESS** | ACCEPTABLE — must disclose parts >50 MAD not included |
| **ARTISAN_FAIRNESS** | ACCEPTABLE at anchor — tight at CONSENSUS_LOW (150 MAD with 15% = ~67 MAD net) |
| **Net artisan @ 10% commission** | 128 MAD (less 40 fuel, 30 materials) |
| **Net artisan @ 15% commission** | 117 MAD (less 40 fuel, 30 materials) |
| **Net artisan @ 20% commission** | 106 MAD (less 40 fuel, 30 materials) |
| **COMMISSION_RISK @ 10%** | ACCEPTABLE |
| **COMMISSION_RISK @ 15%** | ACCEPTABLE |
| **COMMISSION_RISK @ 20%** | ACCEPTABLE (at anchor 220; not at floor 150) |
| **Candidate status** | READY_FOR_NARROW_RANGE_PILOT |
| **HUMAN DECISION** | **PENDING** |

---

### SERVICE 3 — plomberie.debouchage_evier

| Field | Value |
|-------|-------|
| **Service code** | `plomberie.debouchage_evier` |
| **Label** | Débouchage évier ou lavabo — méthode manuelle |
| **CONSENSUS_LOW** | 150 MAD |
| **WEIGHTED_MARKET_ANCHOR** | 220 MAD |
| **CONSENSUS_HIGH** | 300 MAD |
| **Confidence** | MEDIUM |
| **Sources** | mano.ma, bnidari.ma, afous.ma (B+), inworky.com |
| **Proposed architecture** | OPTION A (fixed) OR OPTION B (narrow range) |
| **Proposed pilot price — Option A** | **220 MAD** (fixed, if pre-screening implemented) |
| **Proposed pilot price — Option B** | **180–250 MAD** (range, if pre-screening cannot be guaranteed) |
| **Proposed rationale** | Best-standardized débouchage service. No materials, no parts. Pre-arrival questions can classify effectively. Fixed 220 MAD defensible. Narrow range 180–250 safer without pre-screening guarantee. |
| **Inclusions** | Travel, 1 fixture (évier or lavabo), manual method (ventouse + furet ≤5m), siphon cleaning/inspection |
| **Exclusions** | Multiple fixtures, motorized method, siphon replacement, colonne access, external drain |
| **Pre-arrival questions** | 5 classification questions — see fair-price-policy.v0.2.md §4.3 |
| **Materials included** | NONE |
| **Part included** | EXCLUDED |
| **Labour** | Included |
| **Travel** | Included |
| **Complexity escape** | Manual fails on-site, multiple fixtures on arrival, siphon cracked, access obstructed |
| **CLIENT_FAIRNESS** | STRONG — no ambiguity, no parts, obvious scope |
| **ARTISAN_FAIRNESS** | ACCEPTABLE — 147 MAD net at 15% for 20–30 min, clean economics |
| **Net artisan @ 10% commission** | 158 MAD (less 40 fuel) |
| **Net artisan @ 15% commission** | 147 MAD (less 40 fuel) |
| **Net artisan @ 20% commission** | 136 MAD (less 40 fuel) |
| **COMMISSION_RISK @ 10%** | ACCEPTABLE |
| **COMMISSION_RISK @ 15%** | ACCEPTABLE |
| **COMMISSION_RISK @ 20%** | ACCEPTABLE |
| **Candidate status** | READY_FOR_FIXED_PRICE_PILOT |
| **Architecture choice** | **PENDING — Option A (fixed 220) or Option B (range 180–250)?** |
| **HUMAN DECISION** | **PENDING** |

---

### SERVICE 4 — plomberie.debouchage_wc_simple

| Field | Value |
|-------|-------|
| **Service code** | `plomberie.debouchage_wc_simple` |
| **Label** | Débouchage WC — méthode manuelle |
| **CONSENSUS_LOW** | 200 MAD |
| **WEIGHTED_MARKET_ANCHOR** | 280 MAD |
| **CONSENSUS_HIGH** | 450 MAD |
| **Confidence** | MEDIUM |
| **Sources** | mano.ma, allo-maison.ma × 2 (Casablanca + Marrakech), bnidari.ma, inworky.com |
| **Proposed architecture** | OPTION B — NARROW RANGE |
| **Proposed pilot price** | **220–320 MAD** |
| **Proposed rationale** | Best artisan economics (198 MAD net at 15%). Floor 220 provides viability margin over CONSENSUS_LOW 200. Ceiling 320 reflects upper market evidence band for manual method. CONSENSUS_HIGH 450 = motorized method territory. |
| **Inclusions** | Travel, 1 WC fixture, manual method (ventouse à cloche + furet ≤5m), 1 intervention attempt |
| **Exclusions** | Motorized method, WC dismantling, pipe replacement, colonne, non-standard WC, foreign body extraction |
| **Pre-arrival questions** | 6 classification questions — see fair-price-policy.v0.2.md §4.4 |
| **Materials included** | NONE |
| **Part included** | EXCLUDED |
| **Labour** | Included |
| **Travel** | Included |
| **Complexity escape** | Manual fails on-site, foreign body confirmed, multiple fixtures affected on arrival |
| **CLIENT_FAIRNESS** | STRONG — universally understood in Morocco; no parts, no materials |
| **ARTISAN_FAIRNESS** | STRONG — 198 MAD net at 15% for 30–45 min; best economics of the six |
| **Net artisan @ 10% commission** | 212 MAD (less 40 fuel) |
| **Net artisan @ 15% commission** | 198 MAD (less 40 fuel) |
| **Net artisan @ 20% commission** | 184 MAD (less 40 fuel) |
| **COMMISSION_RISK @ 10%** | ACCEPTABLE |
| **COMMISSION_RISK @ 15%** | ACCEPTABLE |
| **COMMISSION_RISK @ 20%** | ACCEPTABLE |
| **Candidate status** | READY_FOR_NARROW_RANGE_PILOT |
| **HUMAN DECISION** | **PENDING** |

---

### SERVICE 5 — plomberie.robinet_remplacement

| Field | Value |
|-------|-------|
| **Service code** | `plomberie.robinet_remplacement` |
| **Label** | Remplacement robinet / mitigeur — main-d'œuvre seule |
| **CONSENSUS_LOW** | 150 MAD |
| **WEIGHTED_MARKET_ANCHOR** | 200 MAD |
| **CONSENSUS_HIGH** | 300 MAD |
| **Confidence** | MEDIUM |
| **Sources** | mano.ma, bnidari.ma × 2, afous.ma (B+), inworky.com |
| **Proposed architecture** | OPTION A — FIXED PRICE |
| **Proposed pilot price** | **200 MAD** |
| **Alternative if commission rises >15%** | 220–230 MAD |
| **Proposed rationale** | BEST OVERALL CANDIDATE for fixed-price. Most tightly defined scope. Client supplies part. Artisan task identical every time. ~30 min. Commission risk at 20% = watch threshold. |
| **Inclusions** | Travel, isolation, remove old robinet/mitigeur, install new (client-supplied), connection with existing flexibles, sealing consumables ≤50 MAD, test |
| **Exclusions** | The robinet/mitigeur itself, new flexible hoses, robinet d'arrêt replacement, pipe modification, wall-mounted spout, thermostatic mixer, masonry |
| **Client-facing label** | "Main-d'œuvre + déplacement — robinet / mitigeur fourni par le client" |
| **Materials included** | Basic: téflon, joint de raccord ≤50 MAD |
| **Part included** | EXCLUDED — client supplies new robinet/mitigeur |
| **Labour** | Included |
| **Travel** | Included |
| **Complexity escape** | Non-standard thread, corroded/seized old robinet, robinet d'arrêt defective, pipe re-routing, wall-mounted |
| **CLIENT_FAIRNESS** | ACCEPTABLE — prominent "main-d'œuvre seule" label required; upgrades to STRONG with good disclosure |
| **ARTISAN_FAIRNESS** | ACCEPTABLE — 110 MAD net at 15%; tightest of six candidates at 20% (100 MAD = floor threshold) |
| **Net artisan @ 10% commission** | 120 MAD (less 40 fuel, 20 materials) |
| **Net artisan @ 15% commission** | 110 MAD (less 40 fuel, 20 materials) |
| **Net artisan @ 20% commission** | 100 MAD (less 40 fuel, 20 materials) — AT FLOOR |
| **COMMISSION_RISK @ 10%** | ACCEPTABLE |
| **COMMISSION_RISK @ 15%** | ACCEPTABLE |
| **COMMISSION_RISK @ 20%** | MEDIUM — exactly at artisan floor (100 MAD); raise price if commission rises |
| **Candidate status** | READY_FOR_FIXED_PRICE_PILOT |
| **HUMAN DECISION** | **PENDING** |

---

### SERVICE 6 — plomberie.chasse_eau

| Field | Value |
|-------|-------|
| **Service code** | `plomberie.chasse_eau` |
| **Label** | Remplacement mécanisme chasse d'eau — main-d'œuvre seule |
| **CONSENSUS_LOW** | 200 MAD |
| **WEIGHTED_MARKET_ANCHOR** | 280 MAD |
| **CONSENSUS_HIGH** | 400 MAD |
| **Confidence** | MEDIUM |
| **Sources** | mano.ma, bnidari.ma conseils |
| **Evidence note** | 2 sources only (vs 4–5 for top candidates). Lower source diversity = retain MEDIUM confidence but note. |
| **Proposed architecture** | OPTION A — FIXED PRICE (preferred) or OPTION B — NARROW RANGE |
| **Proposed pilot price — Option A** | **250 MAD** (fixed, if suspended-WC pre-screening implemented) |
| **Proposed pilot price — Option B** | **220–300 MAD** (narrow range, if pre-screening not guaranteed) |
| **Proposed rationale** | Second-best standardization candidate. Strong economics. Universal mono-bloc mechanism is commodity. Main complexity risk = suspended WC — filterable by 1 pre-booking question. |
| **Inclusions** | Travel, isolation, remove old mechanism, install new mono-bloc (client-supplied), adjustment, test; joint ≤30 MAD |
| **Exclusions** | Mécanisme de chasse itself, WC cistern replacement, bâti-support work, push-button replacement, suspended WC |
| **Client-facing label** | "Main-d'œuvre + déplacement — mécanisme fourni par le client" |
| **Client guidance required** | "Achetez un mécanisme mono-bloc universel avant l'intervention (60–120 MAD en droguerie)" |
| **Materials included** | Basic: joint d'étanchéité ≤30 MAD |
| **Part included** | EXCLUDED — client supplies mécanisme de chasse |
| **Labour** | Included |
| **Travel** | Included |
| **Critical pre-arrival question** | "Standard WC (réservoir visible) ou WC suspendu (bâti-support intégré) ?" |
| **Complexity escape** | Suspended WC, cracked cistern, defective robinet d'arrêt, corroded old mechanism |
| **CLIENT_FAIRNESS** | ACCEPTABLE — requires clear disclosure + client guidance on what to buy; upgrades to STRONG with guidance |
| **ARTISAN_FAIRNESS** | ACCEPTABLE — 183 MAD net at 15% for 45–60 min; solid economics |
| **Net artisan @ 10% commission** | 197 MAD (less 40 fuel, 15 materials) |
| **Net artisan @ 15% commission** | 183 MAD (less 40 fuel, 15 materials) |
| **Net artisan @ 20% commission** | 169 MAD (less 40 fuel, 15 materials) |
| **COMMISSION_RISK @ 10%** | ACCEPTABLE |
| **COMMISSION_RISK @ 15%** | ACCEPTABLE |
| **COMMISSION_RISK @ 20%** | ACCEPTABLE |
| **Candidate status** | READY_FOR_FIXED_PRICE_PILOT |
| **Architecture choice** | **PENDING — Option A (fixed 250) or Option B (range 220–300)?** |
| **HUMAN DECISION** | **PENDING** |

---

## Cross-Service Summary

| Service | Anchor | Pilot price | Architecture | Client ✓ | Artisan ✓ | Risk @15% | Risk @20% | Status | Decision |
|---------|--------|-------------|-------------|---------|-----------|-----------|-----------|--------|----------|
| plomberie.diagnostic | 150 | 100–180 | Narrow range | ACCEPTABLE | WEAK→ACCEPT | MEDIUM | WEAK | READY_NARROW | **PENDING** |
| plomberie.fuite_simple | 220 | 180–280 | Narrow range | ACCEPTABLE | ACCEPTABLE | ACCEPTABLE | ACCEPTABLE | READY_NARROW | **PENDING** |
| plomberie.debouchage_evier | 220 | 220 or 180–250 | Fixed or Narrow | STRONG | ACCEPTABLE | ACCEPTABLE | ACCEPTABLE | READY_FIXED | **PENDING** |
| plomberie.debouchage_wc_simple | 280 | 220–320 | Narrow range | STRONG | STRONG | ACCEPTABLE | ACCEPTABLE | READY_NARROW | **PENDING** |
| plomberie.robinet_remplacement | 200 | 200 | Fixed | ACCEPTABLE | ACCEPTABLE | ACCEPTABLE | MEDIUM | READY_FIXED | **PENDING** |
| plomberie.chasse_eau | 280 | 250 or 220–300 | Fixed or Narrow | ACCEPTABLE | ACCEPTABLE | ACCEPTABLE | ACCEPTABLE | READY_FIXED | **PENDING** |

---

## Diagnostic Policy Decision (Required Before Any Production Use)

| Option | Description | Best for | Pros | Cons | Decision |
|--------|-------------|---------|------|------|---------|
| D1 — Always standalone | 100–180 MAD; never deductible | Complex/hidden services | Artisan certainty; market evidence | May feel punitive for 2-min diagnosis | **PENDING** |
| D2 — Deductible if same-day repair | Fee waived if repair proceeds same visit | — | Client-friendly | No Morocco precedent; upsell risk | **PENDING** |
| D3 — Hybrid (recommended) | Absorbed for 5 standardized services; standalone for diagnosis-first services | Mixed portfolio | Matches actual market behavior | Requires client disclosure of fee trigger | **PENDING** |

---

## Replacement-Part Policy Decision

For `plomberie.robinet_remplacement` and `plomberie.chasse_eau`:

| Question | Options | Decision |
|----------|---------|---------|
| Who supplies the part by default? | A: Always client / B: Client or artisan (artisan invoices separately) | **PENDING** |
| If artisan supplies: how is it disclosed? | Pre-booking disclosure required vs. post-intervention disclosure | **PENDING** |
| Client guidance: pre-booking or post-booking? | Show "what to buy" before booking confirmation | **PENDING** |
| Client right to purchase separately? | Always / Only if client requests | **PENDING** |

---

## Pre-Arrival Classification Decision

For all débouchage and fuite services, pre-arrival classification questions are recommended. These require a product decision about where they appear in the RAFI flow.

| Question | Services | Where to implement | Decision |
|----------|---------|-------------------|---------|
| "Is the pipe behind a wall or floor?" | fuite_simple | RAFI — problem description field | **PENDING** |
| "Multiple fixtures blocked?" | debouchage_evier, debouchage_wc_simple | RAFI | **PENDING** |
| "Water backing up to other fixtures?" | debouchage_evier, debouchage_wc_simple | RAFI | **PENDING** |
| "Prior manual attempt failed?" | debouchage_wc_simple | RAFI | **PENDING** |
| "Standard or suspended WC?" | chasse_eau | RAFI | **PENDING** |
| "Client has the part?" | robinet_remplacement, chasse_eau | Pre-booking confirmation | **PENDING** |

---

## Approved Pricing Doctrines (No Human Decision Required — Established)

These doctrines are established as part of Phase 7B.3.2 and do not require further human decision:

1. **FIXEO_DUAL_FAIRNESS_PRINCIPLE** — established ✅
2. **Statistical terminology** — P30/P75 replaced by CONSENSUS_LOW/CONSENSUS_HIGH ✅
3. **Geographic semantics** — NATIONAL_MOROCCO scope; Casablanca = stress-test only; no city multipliers in V0.2 ✅
4. **Materials doctrine** — labour + travel only; consumables ≤50 MAD absorbed; any part >50 MAD quoted separately ✅
5. **Urgency modifier = null** — no standardized surcharge; FIXEO must not display as contractually guaranteed ✅
6. **AI terminology** — current system = RULE_BASED_LOOKUP only; "AI-powered" label requires trained model on FIXEO data ✅
7. **Artisan economic floor** — ≥150 MAD for Casablanca standard hours; ≥100 MAD net pre-labour after commission + fuel ✅

---

*This document awaits formal human review. No production code will be modified until all PENDING decisions are resolved.*
