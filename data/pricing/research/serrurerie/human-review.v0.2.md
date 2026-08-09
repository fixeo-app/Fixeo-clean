# FIXEO Serrurerie — Human Calibration Review
## Phase 7B.5.1

**Status:** HUMAN_CALIBRATION_PREPARATION — HUMAN DECISION REQUIRED  
**Date:** 2026-08-09  
**Production ready:** NO  
**All prices:** Daytime base only (08h–20h)  
**Night/weekend modifiers:** null (not approved)  
**City multipliers:** null  

---

## Master Decision Table

| # | Service | Market Range (MAD) | Research Anchor | Proposed Architecture | Proposed FIXEO Price | Hardware Policy | Net @15%+MID | Net @20%+HIGH | Client Fairness | Artisan Fairness | Security Risk | Confidence | HUMAN DECISION |
|---|---------|-------------------|-----------------|----------------------|---------------------|-----------------|-------------|--------------|----------------|-----------------|---------------|------------|----------------|
| 1 | porte_claquee_ouverture | 150–300 | 200 | FIXED | **220 MAD** | None | 147 MAD | 116 MAD | ✓ Lower third | ✓ Acceptable all scenarios | STANDARD | HIGH | **PENDING** |
| 2 | porte_claquee_blindee | 250–400 | 350 | CONDITIONAL_FIXED | **350 MAD** | None | 258 MAD | 220 MAD | ✓ Midmarket | ✓ Strong all scenarios | STANDARD | MEDIUM | **PENDING** |
| 3 | porte_verrouillee | 300–450 | 380 | CONDITIONAL_FIXED | **380 MAD** | Cylinder separate | 283 MAD | 244 MAD | ✓ Below midpoint | ✓ Strong all scenarios | ELEVATED | HIGH | **PENDING** |
| 4 | cle_cassee_extraction | 150–300 | 200 | CONDITIONAL_FIXED | **220 MAD** | Cylinder separate if damaged | 147 MAD | 116 MAD | ✓ Lower third | ✓ Acceptable all scenarios | STANDARD | HIGH | **PENDING** |
| 5 | cylindre_remplacement | 200–500 (incl. part) | 350 all-in | LABOUR_FIXED_PART_SEPARATE | **280 MAD labour** | Excluded, disclosed | 198 MAD | 164 MAD | ✓ Transparent | ✓ Strong all scenarios | ELEVATED | HIGH | **PENDING** |
| 6 | serrure_remplacement | 400–700 (incl. part) | 500 all-in | LABOUR_FIXED_PART_SEPARATE | **400 MAD labour** | Excluded, disclosed | 300 MAD | 260 MAD | ✓ Transparent | ✓ Strong all scenarios | ELEVATED | MEDIUM | **PENDING** |
| 7 | serrure_grippee | 100–250 | 170 | CONDITIONAL_FIXED | **200 MAD** | Consumables only | 130 MAD | 100 MAD | ✓ Lower market | ✓ At floor (acceptable) | STANDARD | LOW | **PENDING** |

---

## Service-by-Service Review Notes

### 1 — Porte claquée ouverture (FIXED — 220 MAD proposed)

**Why 220, not 200:**  
200 MAD is the Phase 7B.5 research anchor. At 20% commission + 60 MAD fuel, artisan net = 100 MAD — exactly at the floor, no buffer. Any slight variation (longer travel, traffic) pushes below floor. 220 MAD adds a 20 MAD safety margin while remaining deep in the client-protective lower third of the 150–300 MAD market range.

**Why not 250:**  
250 MAD is also defensible (STRONG in all scenarios) but positions FIXEO at the market midpoint rather than the lower third. 220 MAD is more consistent with FIXEO's trust-building market entry positioning.

**Architecture decision:**  
FIXED is appropriate. No parts involved. Duration predictable. Client situation fully describable by phone.

**Candidate status:** RECOMMENDED FOR PILOT

---

### 2 — Porte claquée blindée (CONDITIONAL_FIXED — 350 MAD proposed)

**Rationale:**  
The 150 MAD premium over standard claquée (220→350) reflects specialist tooling and longer duration (5–20 min → 15–45 min). STRONG economics in all scenarios — minimum artisan net 220 MAD.

**Why CONDITIONAL, not FIXED:**  
The "claquée" (non-verrouillée) condition must be verified on-site. If locked → escape to porte_blindee_ouverture (DIAGNOSIS_FIRST).

**Key escape risk:**  
Clients may describe a blindée as "claquée" when it is in fact locked. Artisan must confirm before committing to the fixed price. If locked: HORS PÉRIMÈTRE, DIAGNOSIS_FIRST applies.

**Candidate status:** RECOMMENDED FOR PILOT (subject to human comfort with MEDIUM confidence)

---

### 3 — Porte verrouillée ouverture (CONDITIONAL_FIXED — 380 MAD proposed)

**Critical note on cylinder separation:**  
This service covers the labour of opening only. The cylinder, if destroyed by drilling, is a separate event requiring explicit client approval. This is the most consumer-protective decision in the entire calibration — preventing the classic Moroccan locksmith scam (announce 200 MAD opening, then add 600 MAD cylinder without asking).

**Why 380, not 400:**  
380 MAD maintains clear differentiation from the round 400 MAD number while being well within the STRONG economics zone. Human calibrator may prefer 400 MAD for communication simplicity — both are defensible.

**Candidate status:** RECOMMENDED FOR PILOT

---

### 4 — Clé cassée extraction (CONDITIONAL_FIXED — 220 MAD proposed)

**Parity with porte_claquee:**  
The 220 MAD price mirrors porte_claquee_ouverture. Both are ~15–20 minute specialist interventions with no parts in the standard case. This symmetry helps artisans understand the FIXEO pricing logic.

**Conditional element:**  
If extraction destroys the cylinder → cylinder replacement is a separate event. This is a critical HORS PÉRIMÈTRE trigger to communicate clearly to both artisans and clients.

**Candidate status:** RECOMMENDED FOR PILOT

---

### 5 — Cylindre remplacement standard (LABOUR_FIXED_PART_SEPARATE — 280 MAD labour proposed)

**This is the most important architectural decision in Phase 7B.5.1.**

**Option A rejected at 350 MAD all-in:**  
350 MAD all-in (including ~150 MAD cylinder) produces MARGINAL economics at 20%+HIGH fuel (net 70 MAD). Below floor. Architecturally unsound.

**Option B rejected (all-in):**  
All-in pricing creates moral hazard: artisan maximizes net by using cheapest possible cylinder without client knowing. Violates FIXEO transparency principle.

**Option A preferred at 280 MAD labour-only:**  
Client sees: 280 MAD (labour) + X MAD (cylinder, disclosed before installation).  
Artisan economics: STRONG in all scenarios (min net 164 MAD).  
Client total with standard cylinder (80–150 MAD): 360–430 MAD — honest market price.  
Client total with quality cylinder (200–300 MAD): 480–580 MAD — still honest market price.

**The 280 MAD labour price itself is the FIXEO anchored service cost. The cylinder price is market-transparent.**

**Candidate status:** RECOMMENDED FOR PILOT (with disclosure protocol)

---

### 6 — Serrure remplacement standard (LABOUR_FIXED_PART_SEPARATE — 400 MAD labour proposed)

**Same architecture as cylinder:**  
Labour + travel = 400 MAD fixed.  
Lock body = client-disclosed, client-approved extra.

**Why 400, not 350:**  
Full lock replacement takes 30–60 min vs 15–30 min for cylinder. The additional complexity (door frame fitting, pêne alignment, multi-component installation) justifies the premium.

**Client total with standard lock (150–250 MAD): 550–650 MAD** — consistent with market range (400–700 MAD combined).

**Note on service frequency:**  
Full lock replacement is less common than cylinder replacement. Clients with lost keys should be guided to cylinder replacement (280 MAD labour) rather than full lock replacement. This distinction helps artisans recommend the right service.

**Candidate status:** RECOMMENDED FOR PILOT

---

### 7 — Serrure grippée déblocage (CONDITIONAL_FIXED — 200 MAD proposed)

**Evidence concern:**  
This service has only LOW evidence confidence (single source mention in allo-maison Tanger context). It is NOT included in either C+ source's main price table.

**Floor concern resolved:**  
Phase 7B.5 proposed 170 MAD which fails at 20%+HIGH. Revised to 200 MAD which passes all scenarios (worst case: exactly 100 MAD floor).

**Human calibrator options:**  
- A. Include at 200 MAD — simple, defensible, client-protective for a fast intervention
- B. Defer to Phase 7B.6 after FIXEO transaction data confirms the service exists in practice
- C. Absorb into porte_verrouillee or claquée workflows as a "preliminary step" with no separate tariff

**Recommendation:** Include at 200 MAD with a clear note that the artisan must confirm "mécanism intact" before committing. If the lock needs replacement → HORS PÉRIMÈTRE.

**Candidate status:** CONDITIONAL PILOT — low evidence, but 200 MAD is economically sound

---

## Porte Claquée Deep Comparison (200 / 220 / 250 MAD)

| Price | Net @15%+MID | Net @15%+HIGH | Net @20%+MID | Net @20%+HIGH | Client Position | Grade Summary |
|-------|-------------|--------------|-------------|--------------|-----------------|---------------|
| 200 MAD | 130 | 110 | 120 | **100 — AT FLOOR** | Lower third | ACCEPTABLE but no buffer |
| **220 MAD** | **147** | **127** | **136** | **116** | Lower third | ACCEPTABLE all — **RECOMMENDED** |
| 250 MAD | 172 | 152 | 160 | 140 | Midmarket | STRONG all |

**Decision basis:** 220 MAD is the optimal dual-fairness price. Protects the client (lower third), gives the artisan a safe buffer above the floor in all realistic scenarios. 200 MAD is viable but structurally risky at worst-case commission+fuel. 250 MAD is conservative but positions FIXEO at midmarket rather than as the transparent reference.

---

## Cylinder Architecture Deep Comparison

| Architecture | Client sees | Artisan net @15%+MID | Artisan net @20%+HIGH | Transparency | Moral hazard |
|-------------|------------|---------------------|----------------------|-------------|-------------|
| A: 280 MAD labour + cylinder disclosed | 280 + actual cylinder price | 198 MAD | 164 MAD | MAXIMUM | NONE |
| B: 350 MAD all-in (basic cylinder) | 350 MAD | 108 MAD | 70 MAD (MARGINAL) | LOW | HIGH — cheapest cylinder maximizes net |
| B: 400 MAD all-in (basic cylinder) | 400 MAD | 150 MAD | 110 MAD | LOW | HIGH |
| C: Range 250–400 MAD | Unclear | Unclear | Unclear | NONE | HIGH |

**Architecture A is unambiguously superior.** It is more transparent, better for the artisan, and doesn't incentivize cheap cylinder selection.

---

## Standard Lock Architecture Deep Comparison

| Architecture | Client sees | Net @15%+MID | Net @20%+HIGH | Transparency |
|-------------|------------|-------------|--------------|-------------|
| A: 400 MAD labour + lock disclosed | 400 + actual lock price | 300 MAD | 260 MAD | MAXIMUM |
| B: 500 MAD all-in (200 MAD lock) | 500 MAD | 185 MAD | 140 MAD | LOW |

**Architecture A preferred for same reasons as cylinder.**

---

## Night / Weekend Surcharge — Evidence Preserved (Not Canonical)

| Source | Stated Surcharge | Window |
|--------|-----------------|--------|
| mano.ma | 30–50% | Night (undeclared precise window) |
| allo-maison.ma | 50–100% | 22h–7h + weekends + holidays |
| allo-maison Casablanca | 50–100% | 22h–7h explicitly |

**Conservative anchor: 50% on daytime base price.**

Evidence is strong but the range (30–100%) is wide. A 50% night modifier would be:
- porte_claquee night: 220 × 1.5 = 330 MAD (within market 250–500 range ✓)
- porte_verrouillee night: 380 × 1.5 = 570 MAD (within market 450–650 range ✓)

This is **documented evidence only**. Night modifier = null until separate human decision.

---

## Diagnostic / Call-out Doctrine

**Finding confirmed:** No standalone diagnostic fee is structurally appropriate for standard Moroccan locksmith services. The artisan quotes the intervention price by phone before travel.

**For DIAGNOSIS_FIRST services** (porte blindée verrouillée, coffre fort, after break-in): A déplacement fee before issuing a quote is commercially reasonable but has insufficient evidence to standardize in Phase 7B.5.1. Defer to human calibration of complex services in a later phase.

**Confirmed:** Do NOT copy plomberie.diagnostic = 180 MAD into serrurerie.

---

## Authorization / Security Matrix

See `fair-price-policy.v0.2.md` for the full canonical matrix.

---

## Unresolved Human Decisions Required

1. **Approve or adjust** each of the 7 proposed prices
2. **Confirm LABOUR_FIXED_PART_SEPARATE architecture** for cylindre and serrure
3. **Decide on serrure_grippee** — include at 200 MAD or defer
4. **Night surcharge** — evidence documented, decision deferred to separate phase
5. **Diagnostic/déplacement fee** for DIAGNOSIS_FIRST services — deferred
6. **serrure_multipoints minimum call-out** — QUOTE_REQUIRED confirmed, no price set
7. **porte_blindee_ouverture déplacement fee** — DIAGNOSIS_FIRST confirmed, no price set
