# NETTOYAGE — Human Calibration Review
## Phase 7B.8.1 — All Decisions Pending

**Status**: HUMAN PRICE DECISION REQUIRED  
**Date prepared**: 2026-08-09  
**Research base**: commit `858d27ad3cfe2be79a0056ab916528633ebbcf86`

---

## Before You Decide — Critical Architecture Principles

### 1. The Worker-Count Doctrine (Mandatory)

All Nettoyage hourly pricing uses **PER CLEANER-HOUR**, not "per hour".

> **2 cleaners × 3 hours = 6 cleaner-hours billed**
> Not 3 hours billed.

This must be disclosed to clients before booking. An artisan who sends 2 people for 3 hours is paid for 6 cleaner-hours.

### 2. Anti-Double-Charge Rule

The minimum visit fee is a **floor**, not an additive charge.

> **Client pays**: `max(minimum_visit_price, hourly_rate × total_cleaner_hours)`

A client who books 3 cleaner-hours at 60 MAD/ch (= 180 MAD) with a 200 MAD minimum pays **200 MAD**. They do **NOT** pay 200 + 180 = 380 MAD.

### 3. Products & Equipment Split

| Service | Products | Equipment |
|---|---|---|
| Standard cleaning (NET-001/002) | **CLIENT_SUPPLIED** | **CLIENT_SUPPLIED** |
| Deep clean (NET-004) | **ARTISAN_SUPPLIED** | **ARTISAN_SUPPLIED** |
| Sofa/Mattress (NET-010/011/013/014) | **ARTISAN_SUPPLIED** | **ARTISAN_SUPPLIED** |
| Post-construction (NET-030) | **ARTISAN_SUPPLIED** | **ARTISAN_SUPPLIED** |

---

## Master Decision Table — 8 Candidates

All values are **PENDING** human approval.

| Code | Service | Market Range | Research Anchor | Recommended for Review | Architecture | Unit | Confidence |
|---|---|---|---|---|---|---|---|
| NET-001 | Visite minimum | 150–280 MAD | 200 MAD | **200 MAD** | MINIMUM_VISIT | Forfait | MEDIUM |
| NET-002 | Tarif horaire/agent | 50–80 MAD/ch | 55 MAD/ch | **60 MAD/ch** | HOURLY | PER_CLEANER_HOUR | MEDIUM |
| NET-004 | Grand nettoyage (F2/F3) | 500–900 MAD | 600 MAD | **600 MAD** | CONDITIONAL_FIXED | Per intervention | MEDIUM |
| NET-010 | Canapé 2 places | 250–400 MAD | 300 MAD | **300 MAD** | FIXED | Per item | **HIGH** |
| NET-011 | Canapé 3 places | 350–550 MAD | 450 MAD | **450 MAD** | FIXED | Per item | **HIGH** |
| NET-013 | Matelas simple | 200–400 MAD | 200 MAD | **200 MAD** | FIXED | Per mattress (2 faces) | **HIGH** |
| NET-014 | Matelas double | 250–400 MAD | 280 MAD | **280 MAD** | FIXED | Per mattress (2 faces) | MEDIUM |
| NET-030 | Après travaux m² | 12–25 MAD/m² | 15 MAD/m² | **18 MAD/m² + 1000 MAD min** | PER_M2_WITH_MINIMUM | Per m² | LOW |

---

## Candidate-by-Candidate Analysis

---

### NET-001 — Visite Minimum

**What this is**: The minimum charge for any residential cleaning visit. Covers travel + minimum 3 cleaner-hours.  
**Products/equipment**: CLIENT_SUPPLIED  
**Scope**: Standard cleaning scope (see scope contract)

| Candidate | Client Pays | Net after 20% + 25 MAD travel | Net/cleaner-hour | Verdict |
|---|---|---|---|---|
| 180 MAD | 180 MAD | 119 MAD | 39.7 MAD/ch | Marginal |
| **200 MAD** | **200 MAD** | **135 MAD** | **45 MAD/ch** | **Recommended** |
| 220 MAD | 220 MAD | 151 MAD | 50.3 MAD/ch | Good |
| 250 MAD | 250 MAD | 175 MAD | 58.3 MAD/ch | Strong |

**Proposed architecture**: `max(200 MAD, 60 MAD/ch × cleaner-hours)`  
**Implied rate**: 200 MAD ÷ 3h = 66.7 MAD/ch for the minimum — this is intentionally above the standard rate to compensate for fixed travel cost on short visits.

**Human decision required**: ☐ Approve 200 MAD | ☐ Approve other: ______

---

### NET-002 — Tarif Horaire / Agent

**What this is**: The per-cleaner-hour rate for standard residential cleaning.  
**Unit**: PER CLEANER. Client must see worker count before booking.  
**Products/equipment**: CLIENT_SUPPLIED

| Rate | 3 ch gross | 3 ch net @20% | 4 ch net @20% | 6 ch net @20% | Net/ch @3h/20% | Verdict |
|---|---|---|---|---|---|---|
| 50 MAD/ch | 150 MAD | 95 MAD | 135 MAD | 215 MAD | 31.7 MAD/ch | Below floor |
| 55 MAD/ch | 165 MAD | 107 MAD | 151 MAD | 239 MAD | 35.7 MAD/ch | Marginal |
| **60 MAD/ch** | **180 MAD** | **119 MAD** | **167 MAD** | **263 MAD** | **39.7 MAD/ch** | **Recommended** |
| 65 MAD/ch | 195 MAD | 131 MAD | 183 MAD | 287 MAD | 43.7 MAD/ch | Good |
| 70 MAD/ch | 210 MAD | 143 MAD | 199 MAD | 311 MAD | 47.7 MAD/ch | Premium |

**Note on market position**: 60 MAD/ch aligns with Adom.ma Casablanca average (60 DH/h verified professionals). National average is ~50 MAD/h including informal. FIXEO targets the professional segment.

**Note on F2/F3 gap**: At 60 MAD/ch, a standard F2/F3 clean (3.5h) = 210 MAD — slightly below market floor (250–500 MAD). The minimum visit at 200 MAD closes some of this gap, but the human should consider whether 65 MAD/ch better aligns FIXEO pricing with the F2/F3+ market reality.

**Human decision required**: ☐ 55 | ☐ **60 (recommended)** | ☐ 65 | ☐ 70 MAD/cleaner-hour

---

### NET-004 — Grand Nettoyage (Deep Clean)

**Reference**: F2/F3 apartment (60–100m²)  
**Workers**: 2 cleaners × 3.5h = 7 cleaner-hours  
**Products/equipment**: ARTISAN_SUPPLIED_INCLUDED (~50 MAD consumables)

| Candidate | Client Pays | Net pool @20% | Net/cleaner-hour | Market Position | Verdict |
|---|---|---|---|---|---|
| 550 MAD | 550 MAD | 365 MAD | 52.1 MAD/ch | Below anchor | Viable |
| **600 MAD** | **600 MAD** | **405 MAD** | **57.9 MAD/ch** | **Market anchor** | **Recommended** |
| 650 MAD | 650 MAD | 445 MAD | 63.6 MAD/ch | Mid-upper market | Good |
| 700 MAD | 700 MAD | 485 MAD | 69.3 MAD/ch | Upper market | Premium |

**Recommended size architecture** — for later human design review:

| Property | Proposed range |
|---|---|
| Studio | 350–450 MAD |
| F2/F3 (60–100m²) | **600 MAD anchor** |
| F4/F5 (110–150m²) | 800–950 MAD (devis or premium) |
| Villa | Devis |

**Scope includes**: Vitres intérieures, placards intérieurs, dégraissage cuisine, SDB désinfection approfondie, murs/plinthes, produits et équipement professionnels fournis.

**Human decision required**: ☐ 550 | ☐ **600 (recommended)** | ☐ 650 | ☐ 700 MAD

---

### NET-010 — Canapé 2 Places

**Architecture**: Fixed per item. Seat count is correct unit (market confirmed).  
**Method**: Injection-extraction. Travel, détachage, désodorisation, désinfection included.  
**Products/equipment**: ARTISAN_SUPPLIED_INCLUDED

| Candidate | Net @20% | Net/h equiv (45min) | Market position | Verdict |
|---|---|---|---|---|
| 250 MAD | 155 MAD | 207 MAD/h | Below anchor | Viable |
| 280 MAD | 179 MAD | 239 MAD/h | Lower range | Reasonable |
| **300 MAD** | **195 MAD** | **260 MAD/h** | **Anchor — 3 sources** | **Recommended** |
| 320 MAD | 211 MAD | 281 MAD/h | Upper range | Good |
| 350 MAD | 235 MAD | 313 MAD/h | Market ceiling | Premium |

**Source convergence**: O2 Maroc = 300 MAD | Hany.ma = 250–400 MAD | Doulle = from 300 MAD. **HIGH confidence**.

**Human decision required**: ☐ 250 | ☐ 280 | ☐ **300 (recommended)** | ☐ 320 | ☐ 350 MAD

---

### NET-011 — Canapé 3 Places

| Candidate | Net @20% | Market position | Verdict |
|---|---|---|---|
| 400 MAD | 270 MAD | Below anchor | Viable |
| 420 MAD | 286 MAD | Lower range | Reasonable |
| **450 MAD** | **310 MAD** | **Anchor — 2 sources** | **Recommended** |
| 480 MAD | 334 MAD | Upper range | Good |
| 500 MAD | 350 MAD | Market ceiling | Premium |

**Source convergence**: O2 Maroc = 450 MAD | Hany.ma = 350–550 MAD (midpoint 450). **HIGH confidence**.

**Human decision required**: ☐ 400 | ☐ 420 | ☐ **450 (recommended)** | ☐ 480 | ☐ 500 MAD

---

### NET-013 — Matelas Simple (1 place)

**Unit**: Per full mattress (both faces cleaned as standard — eliminates per-face ambiguity).  
**Method**: Injection-extraction or vapeur. Products included.

| Candidate | Net @20% | Net/h equiv (40min) | Verdict |
|---|---|---|---|
| 180 MAD | 104 MAD | 156 MAD/h | Marginal |
| **200 MAD** | **120 MAD** | **180 MAD/h** | **Recommended** |
| 220 MAD | 136 MAD | 204 MAD/h | Good |
| 250 MAD | 160 MAD | 240 MAD/h | Premium |

**Note on face semantics**: Consumer-facing unit = full mattress (both faces). O2 Maroc offers 200 MAD/face or 400 MAD/both-faces. Hany.ma: 200–300 MAD for single mattress (both faces implied). **Recommended FIXEO unit = full mattress (both faces)** at 200 MAD — not per-face.

**Human decision required**: ☐ 180 | ☐ **200 (recommended)** | ☐ 220 | ☐ 250 MAD

---

### NET-014 — Matelas Double (2 places)

| Candidate | Net @20% | Verdict |
|---|---|---|
| 250 MAD | 160 MAD | Viable |
| **280 MAD** | **184 MAD** | **Recommended** |
| 300 MAD | 200 MAD | Good |
| 320 MAD | 216 MAD | Premium |

**Source convergence**: Hany.ma: 250–350 MAD. O2 Maroc: 400 MAD (both faces). **MEDIUM confidence**.

**Human decision required**: ☐ 250 | ☐ **280 (recommended)** | ☐ 300 | ☐ 320 MAD

---

### NET-030 — Nettoyage Après Travaux (m²)

**⚠️ LOW CONFIDENCE — Human verification against artisan field data strongly recommended.**

**Architecture**: `final_price = max(minimum_project, area_m2 × rate_per_m2)`

| Rate | 40m² | 60m² | 80m² | 100m² | 150m² | 60m² net/ch @20% | Verdict |
|---|---|---|---|---|---|---|---|
| 15 MAD/m² | 1000* | 1000* | 1200 | 1500 | 2250 | 37.5 MAD/ch | Low for mid-size |
| **18 MAD/m²** | **1000*** | **1080** | **1440** | **1800** | **2700** | **45 MAD/ch** | **Recommended** |
| 20 MAD/m² | 1000* | 1200 | 1600 | 2000 | 3000 | 50.8 MAD/ch | Good |
| 22 MAD/m² | 1000* | 1320 | 1760 | 2200 | 3300 | 55 MAD/ch | Strong |

*Minimum project floor (1000 MAD) applies.

**Note**: At 15 MAD/m², the 60m² scenario yields only 37.5 MAD/ch net — below the proposed 40 MAD floor. 18 MAD/m² is the minimum defensible rate at 20% commission for medium projects.

**Human decision required**:  
Rate: ☐ 15 | ☐ **18 (recommended)** | ☐ 20 | ☐ 22 MAD/m²  
Minimum: ☐ 800 | ☐ 900 | ☐ **1000 (recommended)** | ☐ 1200 MAD

---

## Worker Economic Floor — Policy Decision

| Floor | Gross rate needed @ 20% commission, 3h, 25 MAD travel |
|---|---|
| 35 MAD/ch net | 54.2 MAD/ch gross |
| **40 MAD/ch net** | **60.4 MAD/ch gross** |
| 45 MAD/ch net | 66.7 MAD/ch gross |
| 50 MAD/ch net | 72.9 MAD/ch gross |

**Recommended floor**: **40 MAD/ch net** — achievable at 60 MAD/ch gross with 20% commission on 3h+ jobs.  
**Classification**: FIXEO_POLICY (not market fact).

**Human decision required**: ☐ 35 | ☐ **40 (recommended)** | ☐ 45 | ☐ 50 MAD/ch net floor

---

## Services Deferred from This Round

| Code | Service | Status | Reason |
|---|---|---|---|
| NET-003 | Journée complète | DEFERRED | Covered by NET-002 hourly |
| NET-005 | Avant/après déménagement | DEFERRED | LOW confidence, devis-only market |
| NET-012 | Canapé angle 5–6 places | CALIBRATE_LATER | MEDIUM confidence |
| NET-020 | Tapis petit | CALIBRATE_LATER | Insufficient evidence |
| NET-021 | Tapis grand m² | CALIBRATE_LATER | Further evidence needed |
| NET-031 | Post-construction forfait | MERGED | Covered by NET-030 minimum |

---

## Sign-Off Section

Human decision date: _______________

| Code | Decision | Approved Price | Notes |
|---|---|---|---|
| NET-001 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD | |
| NET-002 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD/ch | |
| NET-004 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD | |
| NET-010 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD | |
| NET-011 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD | |
| NET-013 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD | |
| NET-014 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD | |
| NET-030 | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD/m² + _______ min | |
| Worker floor | ☐ APPROVED ☐ REJECTED ☐ MODIFIED | _______ MAD/ch net | |

**All fields above must be completed before Phase 7B.8.2 may begin.**

---

*This document is CALIBRATION PREPARATION only. No price is approved until the human sign-off section is completed and a Phase 7B.8.2 freeze artifact is committed.*
