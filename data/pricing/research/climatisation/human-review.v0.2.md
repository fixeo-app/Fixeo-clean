# FIXEO Climatisation — Human Calibration Review
## Phase 7B.6.1

**Status:** HUMAN_CALIBRATION_PREPARATION — HUMAN PRICE DECISION REQUIRED  
**Date:** 2026-08-09  
**Production ready:** NO — all `production_ready = false`  
**All prices:** Daytime base only (analysis reference)  
**Night/weekend/urgency modifiers:** null (not approved)  
**City multipliers:** null  
**All human_decision:** PENDING  

---

## Master Decision Table

| # | Service Code | Label | Market Range (MAD) | Research Anchor | Architecture | Proposed FIXEO Price | Net @15%+MID | Net @20%+HIGH | Client Fairness | Artisan Fairness | Confidence | HUMAN DECISION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CLIM-002 | Diagnostic + déplacement | 150–350 | 250 | FIXED | **250 MAD** | 173 | 140 | ✓ Midmarket | ✓ ACCEPTABLE all scenarios | MEDIUM | **PENDING** |
| 2 | CLIM-003 | Entretien standard / unité | 200–400 | 300 | FIXED per unit | **300 MAD/unité** | 215 | 180 | ✓ Midmarket | ✓ ACCEPTABLE–STRONG | MEDIUM | **PENDING** |
| 3 | CLIM-004 | Nettoyage profond / unité | 350–600 | 450 | FIXED per unit | **450 MAD/unité** | 343 | 300 | ✓ Anchor = midmarket | ✓ STRONG all scenarios | MEDIUM | **PENDING** |
| 4 | CLIM-009 | Débouchage condensats | 150–300 | 200 | FIXED | **220 MAD** | 147 | 116 | ✓ Lower market | ✓ ACCEPTABLE | LOW | **PENDING** |
| 5 | CLIM-013 | Réparation fuite accessible (labour) | 400–800 | 600 | CONDITIONAL_FIXED | **600 MAD** | 470 | 420 | ✓ Anchor = midmarket | ✓ STRONG | MEDIUM | **PENDING** |
| 6 | CLIM-020 | Installation mono-split ≤3m | 600–1200 | 900 | CONDITIONAL_FIXED | **900 MAD** | 725 | 660 | ✓ Below formal market | ✓ STRONG | MEDIUM | **PENDING** |
| 7 | CLIM-021 | Installation mono-split ≤5m | 800–1500 | 1100 | CONDITIONAL_FIXED | **1 100 MAD** | 895 | 820 | ✓ Below anchor | ✓ STRONG | MEDIUM | **PENDING** |
| 8 | CLIM-030 | Démontage split (pump-down) | 400–700 | 550 | FIXED | **550 MAD** | 428 | 380 | ✓ Anchor = midmarket | ✓ STRONG | MEDIUM | **PENDING** |

---

## Service-by-Service Review Notes

---

### 1 — CLIM-002 Diagnostic climatisation (250 MAD proposed)

**Why 250, not 220 or 200:**  
Climatisation diagnostic is a specialist intervention requiring manifold gauges and technical expertise meaningfully exceeding a plumbing visual check. 250 MAD matches the research anchor (cross of mano.ma, fixandgo.ma, HVAC contractors). Minimum net at 20% commission + 60 MAD fuel = 140 MAD — ACCEPTABLE and above the practical clim floor (150 MAD). At 200 MAD the worst case hits exactly at the canonical floor with zero buffer. At 220 MAD (serrurerie-equivalent approach) the buffer exists but undersells specialist expertise.

**Diagnostic absorption policy:**  
The diagnostic fee is **DEDUCTIBLE from the same-visit standardized repair** if the client accepts. This mirrors formal Moroccan platform practice (fixandgo.ma) and prevents the client from feeling "double-charged" for diagnosis + repair. If no repair is accepted, 250 MAD diagnostic is always due.

**Scope reminder:**  
Pressure gauge check (manomètre) is included in the diagnostic — this is a basic measurement tool, not a separate service. Electronic leak detector is NOT included (that is CLIM-008 — a specialist step requiring dedicated equipment).

**Human calibrator question:** Is 250 MAD appropriate for your target market (mass-market Moroccan residential) or does it price out price-sensitive clients? If the latter, 220 MAD is the defensible alternative.

---

### 2 — CLIM-003 Entretien annuel standard (300 MAD/unité proposé)

**Why 300 per unit:**  
300 MAD is the research anchor with strong platform convergence (fixandgo.ma 250–350, mano.ma 200–400). At 45–60 min per unit, this represents a professional, honest price that includes cleaning solution, proper technique, and a functional test post-cleaning. Minimum net at 20% + 60 MAD fuel = 180 MAD — ACCEPTABLE for a 45–60 min single-unit call-out.

**Multi-unit visits:**  
When 2+ units are serviced at the same address in one visit, travel cost is amortized. Second unit net at 300 MAD (20% commission, no additional fuel): 240 MAD net. Very good for 45–60 min additional work. FIXEO may optionally introduce a 2nd-unit discount (e.g. 280 MAD from 2nd unit) as a client incentive — economics fully support this.

**Critical scope distinction (vs CLIM-004):**  
CLIM-003 covers **indoor unit only** (filter + evaporator accessible cleaning). The outdoor condenseur is **explicitly excluded**. This is the primary differentiator from CLIM-004. Artisan and client must both understand this distinction before service commences. If client expects outdoor unit cleaning, artisan must redirect to CLIM-004 before quoting CLIM-003.

**Human calibrator question:** Is the outdoor unit exclusion clearly communicable to a Moroccan residential client? What client language best describes "unité intérieure seulement"?

---

### 3 — CLIM-004 Nettoyage profond (450 MAD/unité proposé)

**Why 450:**  
450 MAD is the research anchor. The 150 MAD premium over CLIM-003 is fully justified: 90–120 min work (vs 45–60), pressure washing equipment, cleaning chemicals (full foam treatment), outdoor condenseur cleaning. Minimum net at 20% + 60 MAD fuel = 300 MAD — STRONG for 90–120 min specialist work with equipment.

**Service contract precision — outdoor unit access:**  
The outdoor condenseur is included in CLIM-004. If the condenseur is genuinely inaccessible (balcon fermé, cage technique, upper floor with no access), the service must escape to DEVIS. Artisan must verify outdoor unit access before committing to the CLIM-004 fixed price. If inaccessible: propose CLIM-003 (indoor only) + DEVIS for outdoor access.

**Chemical products:**  
Cleaning foam and disinfectant are included in the 450 MAD price. The artisan must not charge separately for standard cleaning products. High-cost specialist chemical treatments (acid descaling of heavily fouled evaporators) are explicitly excluded and require a separate quote.

**Human calibrator question:** Should CLIM-004 specify a minimum BTU threshold below/above which price may differ? Evidence does not support BTU-based pricing at this stage, but very large (36000 BTU+) units take significantly longer. Current recommendation: escape rule for units > 24000 BTU or cassette format.

---

### 4 — CLIM-009 Débouchage condensats (220 MAD proposé)

**Why 220 over the 200 MAD anchor:**  
200 MAD hits the canonical floor exactly at worst case (20% commission + 60 MAD fuel). 220 MAD provides 116 MAD net minimum — above the practical clim floor (150 MAD) in all scenarios. The service is genuinely simple (20–35 min, minimal equipment) and does not warrant a high price, but the 20 MAD delta over anchor prevents worst-case floor-touch.

**Evidence caveat:**  
CLIM-009 has LOW confidence — the 200 MAD anchor is derived from scope exclusion analysis, not direct primary evidence. Human calibrator should consider whether 220 MAD is consistent with what Moroccan clients expect to pay for a drain unblock.

**Scope boundary with CLIM-003:**  
If condensate blockage is discovered during a CLIM-003 entretien standard visit, the artisan should clear it as part of the entretien scope if it is a minor obstruction (light debris, easy access). CLIM-009 applies only when the blockage is the primary complaint (standalone call-out for water dripping from indoor unit).

**Pump failure escape:**  
If the condensate pump (pompe de relevage) is found to be faulty, the artisan must immediately declare HORS PÉRIMÈTRE CLIM-009 and recommend CLIM-006 (panne diagnostic). The 220 MAD covers drain clearing only — pump replacement is an entirely separate service.

**Human calibrator question:** Is 220 MAD too high or too low for a 25-minute drain unblock in your artisan network's experience? This is the service with the lowest evidence quality in this batch.

---

### 5 — CLIM-013 Réparation fuite accessible — labour seul (600 MAD proposé)

**Architecture note:**  
CONDITIONAL_FIXED applies because the 600 MAD price is valid ONLY when the leak location is confirmed accessible before work begins. The artisan must inspect and confirm accessibility before committing to the fixed price. If inaccessible on inspection: declare HORS PÉRIMÈTRE, provide DEVIS.

**Refrigerant is always excluded:**  
600 MAD is labour-only. Brazing rods, flux, nitrogen for pressure test are consumables included. Refrigerant (R410A, R32, R22) is **never included**. After a successful repair, the client must explicitly approve and pay separately for:
1. CLIM-014 — Tirage au vide (vacuum procedure)
2. CLIM-010/011/012 — Refrigerant recharge (appropriate type + quantity)

The artisan must not recharge without client approval and separate billing. This is a core FIXEO refrigerant integrity rule.

**Why 600, not 450:**  
Brazing is a highly skilled intervention (torch, specialist technique, nitrogen test). 450 MAD undersells 60–90 min of specialist work. Minimum net at 600 MAD / 20% commission / 60 MAD fuel = 420 MAD — STRONG, appropriate for specialist brazing labour.

**R32 safety note:**  
On R32 systems, the artisan must have appropriate A2L equipment. If the artisan is not equipped for R32 → declare HORS PÉRIMÈTRE and recommend a certified specialist. FIXEO should not list artisans for R32 brazing work without verifying their equipment capability.

**Human calibrator question:** Is 600 MAD the right price for accessible brazing in your artisan network? Is the "accessible" condition well-understood and enforced? What is the typical escape rate (inaccessible leaks sent to DEVIS vs. repaired at fixed price)?

---

### 6 — CLIM-020 Installation mono-split ≤3m (900 MAD proposé)

**Scope is everything here.**  
"Installation standard" means nothing in the Moroccan market without defining included copper length. FIXEO's 900 MAD must come with an explicit scope declaration (see calibration.v0.2.json scope_contract for full detail).

**What is included at 900 MAD:**
- Labour: indoor unit mounting, outdoor unit mounting on standard wall bracket
- Wall bracket / console (standard galvanized, included in price)
- Copper run up to 3m (tube + insulation)
- Inter-unit electrical cable
- Condensate drain pipe
- 1 standard wall passage drilling
- Vacuum procedure (mandatory — must not be skipped)
- Commissioning + functional test

**What is NEVER included (and must be communicated clearly):**
- The AC unit itself — ALWAYS client-supplied
- Electrical connection to the electrical panel/breaker — separate service (CLIM-029 or electrician)
- Additional copper beyond 3m — CLIM-025 per metre
- Difficult access (ladder, scaffolding) — DEVIS

**Legacy price note:**  
FIXEO legacy profile-v2a shows installation at 500–900 MAD. The proposed 900 MAD is at the legacy ceiling — but with fully defined scope. A 900 MAD installation with vacuum, bracket, drilling, and commissioning is a better client deal than a vague 500 MAD that may omit vacuum and bracket.

**Material cost note for human calibrator:**  
At 900 MAD / 20% commission / 40 MAD fuel: artisan net = 680 MAD. Estimated material cost: wall bracket ~80–100 MAD, copper kit 3m ~200–250 MAD, inter-unit cable ~30–50 MAD, condensate pipe ~20–30 MAD, consumables ~20–30 MAD = total materials ~350–460 MAD. Artisan net after materials: 220–330 MAD for 3–5h work = 44–110 MAD/hour. The lower bound (44 MAD/h) is marginal. **Human calibrator must validate material cost assumptions with actual artisan inputs** — if material cost is 350–460 MAD, a 1000 MAD price may be more appropriate.

**Human calibrator question (critical):** What is the actual material cost for a standard 3m mono-split installation in your artisan network? Wall bracket, 3m copper kit, cable? This will determine whether 900 MAD or 1000 MAD is the right price.

---

### 7 — CLIM-021 Installation mono-split ≤5m (1 100 MAD proposé)

**Relationship with CLIM-020:**  
CLIM-021 must be materially different from CLIM-020 in scope — it includes 2 extra metres of copper (and insulation). The proposed 200 MAD delta (900 → 1100 MAD) corresponds to:
- 2 extra metres copper tube + insulation: ~120–160 MAD material
- 20–30 min additional installation time: ~50–80 MAD labour equivalent
- Total justified delta: 170–240 MAD → 200 MAD is the midpoint

This delta must be communicated clearly to clients: the extra 200 MAD covers the additional copper piping already included in the price.

**Why 5m scope matters for Morocco:**  
In Moroccan residential construction, the indoor unit is often installed in a room interior, with the outdoor unit on a balcony or external wall. A room 4–5m from the exterior wall is extremely common. The 5m scope covers the majority of standard Moroccan apartment configurations. The 3m scope primarily covers cases where the indoor unit is on an exterior-facing wall.

**If 3m and 5m are priced identically:**  
This would be economically incoherent — the artisan would always offer the shorter scope to save time and material, leaving the 5m client underserved. The price delta is essential to correctly incentivize artisans to deliver the scope the client needs.

**Human calibrator question:** Is the 200 MAD delta between 3m and 5m consistent with how artisans in your network price the scope difference? Should FIXEO consider a 4m option as well?

---

### 8 — CLIM-030 Démontage split — pump-down (550 MAD proposé)

**Pump-down is non-negotiable:**  
FIXEO prohibits refrigerant venting. Every FIXEO dismantling must include the pump-down procedure. At 450 MAD (informal market floor), there is economic pressure to vent instead of pump-down (saves 10–15 min). At 550 MAD, the artisan is economically compensated for the correct procedure. This is a quality enforcement mechanism embedded in the price.

**What the client gets:**  
Professional dismantling with safe refrigerant handling, both units safely removed and placed, wall passage sealed. The client does NOT get: unit transport to disposal, wall repair, reinstallation.

**Scope for units that will be reinstalled (CLIM-031):**  
If the client plans to reinstall the unit later (same property or different address), the artisan should confirm whether the refrigerant is safely retained in the outdoor unit for transport. This is standard pump-down outcome — outdoor unit can be transported with refrigerant inside if valves are closed correctly.

**Human calibrator question:** Is 550 MAD vs 500 MAD worth the distinction to you for dismantling? Is pump-down universally practised among your clim artisans or is it something that needs explicit training/enforcement?

---

## Diagnostic Absorption Policy Analysis

### Three Models Evaluated

**Model A — Standalone always charged (no absorption)**  
- Diagnostic always billed at 250 MAD regardless of repair outcome
- Pro: simple, artisan always paid
- Con: client feels penalized for requesting diagnosis — may avoid it (worse outcome)
- Con: does not match formal Moroccan platform practice
- Verdict: NOT RECOMMENDED

**Model B — Fully absorbed same-visit repair**  
- Diagnostic 0 MAD if any repair accepted same visit
- Pro: client never "double-pays"
- Con: artisan loses 250 MAD if repair accepted — incentivizes rushing to repair without proper diagnosis
- Con: economically bad for artisan
- Verdict: NOT RECOMMENDED

**Model C — Deductible from standardized same-visit repair (RECOMMENDED)**  
- Diagnostic 250 MAD charged
- If client accepts a standardized FIXEO repair on same visit: 250 MAD deducted from repair price
- If no repair accepted: 250 MAD diagnostic fully due
- Pro: client understands the logic (diagnosis paid, applied against repair)
- Pro: artisan always compensated for diagnosis work
- Pro: matches formal Moroccan platform practice (fixandgo.ma)
- Pro: doesn't incentivize skipping diagnosis to "save" it for the client
- Verdict: RECOMMENDED — label as FIXEO POLICY (not observed universal market practice)

**Label appropriately:**  
The deductible model is a **FIXEO policy decision** based on formal Moroccan market practice observation. It is not a universal Moroccan market standard — informal artisans rarely offer this. FIXEO should communicate it as a guarantee/differentiator.

---

## Standard Maintenance Contract (CLIM-003)

### Scope Definition

| Element | CLIM-003 (Entretien Standard) | CLIM-004 (Nettoyage Profond) |
|---|---|---|
| Filtre | ✅ Nettoyage + réinstallation | ✅ Nettoyage + réinstallation |
| Serpentin évaporateur | ✅ Accessible, mousse basique | ✅ Haute pression, complet |
| Turbine/ventilateur intérieur | ❌ Non inclus | ✅ Inclus |
| Bac condensation | ✅ Vérification + débouchage léger | ✅ Nettoyage complet |
| Tuyau condensats | ✅ Vérification écoulement | ✅ Nettoyage complet |
| Unité extérieure (condenseur) | ❌ EXCLUE | ✅ Haute pression incluse |
| Traitement désinfectant | ❌ Non inclus | ✅ Inclus |
| Test performance post-nettoyage | ✅ Inclus | ✅ Inclus |
| Durée estimée | 45–60 min/unité | 90–120 min/unité |
| Prix proposé | 300 MAD/unité | 450 MAD/unité |
| Produits spéciaux | ❌ Non requis | ✅ Inclus |
| Équipement HP | ❌ Non requis | ✅ Requis |

**Key distinction for clients:**  
CLIM-003 est le service de routine annuelle. CLIM-004 est le service de remise à niveau recommandé tous les 2–3 ans ou lorsque le climatiseur présente des signes d'encrassement profond (mauvaise efficacité, odeurs, bruit anormal).

---

## Refrigeration Integrity Doctrine (Frozen)

The following doctrine is frozen as FIXEO technical policy. It is not subject to price calibration — it is a non-negotiable service standard.

### The FIXEO Refrigerant Sequence

```
1. CLIENT SYMPTOM  → Climatiseur ne refroidit plus / perd en efficacité
2. DIAGNOSTIC      → CLIM-006 / CLIM-002 : inspection complète
3. PRESSURE CHECK  → CLIM-007 : contrôle manomètre
4. IF LOW PRESSURE → CLIM-008 : détection de fuite frigorifique OBLIGATOIRE
5. IF LEAK FOUND   → CLIM-013 : réparation fuite accessible (ou DEVIS si non accessible)
6. POST-REPAIR     → CLIM-014 : tirage au vide (obligatoire avant recharge)
7. RECHARGE        → CLIM-010 / CLIM-011 / CLIM-012 selon type réfrigérant, avec approbation client
8. TEST            → Vérification températures et fonctionnement
```

### Prohibited Practice

**Blind top-up** (recharge sans diagnostic ni recherche de fuite) is explicitly prohibited for FIXEO-endorsed artisans.  
This practice:
- Provides temporary cooling masking the underlying leak
- Results in repeated service calls (financially harmful to client)
- Eventually leads to complete refrigerant venting to atmosphere
- Does not meet FIXEO professional standards

No FIXEO price or service listing may offer "recharge gaz" as a standalone commodity with no diagnostic prerequisite.

### R22 Advisory (Research-Based)

R22 refrigerant is being phased out in Morocco under the country's Montreal Protocol obligations (Morocco ratified the Kigali Amendment). R22 is increasingly scarce, expensive, and is no longer manufactured for new equipment. FIXEO artisans servicing R22 systems must:
- Inform the client that R22 is a legacy refrigerant in the phase-out process
- Not recommend repeated R22 recharges as normal maintenance
- Advise the client to plan system replacement on their next major repair decision

*Note: FIXEO makes no specific claims about R22 handling certification requirements in Morocco without a verified regulatory source. The above is based on phase-out schedule research, not specific regulatory enforcement data.*

### R32 Advisory (Research-Based)

R32 (difluorométhane) is an A2L class refrigerant — mildly flammable. Artisans handling R32 should:
- Use appropriate equipment rated for A2L refrigerants
- Be aware of the mild flammability risk
- Not work near ignition sources during recharge

*Note: FIXEO makes no unsupported claims about mandatory Moroccan certification for R32 handling. The above reflects professional best practice based on refrigerant classification.*

---

## Parts / Material / Refrigerant Policy Summary

| Service | Labour | Travel | Consumables | Standard Materials | Major Part | Refrigerant |
|---|---|---|---|---|---|---|
| CLIM-002 Diagnostic | ✅ Included | ✅ Included | — | — | — | — |
| CLIM-003 Entretien | ✅ Included | ✅ Included | ✅ Included | — | ❌ Separate | — |
| CLIM-004 Nettoyage | ✅ Included | ✅ Included | ✅ Included | — | ❌ Separate | — |
| CLIM-009 Condensats | ✅ Included | ✅ Included | ✅ Included | — | — | — |
| CLIM-013 Fuite | ✅ Included | ✅ Included | ✅ Included (brazing rods, N₂) | — | — | ❌ ALWAYS SEPARATE |
| CLIM-020 Install 3m | ✅ Included | ✅ Included | ✅ Included | ✅ Included (copper 3m, support, cable, drain) | — | — (pre-charged) |
| CLIM-021 Install 5m | ✅ Included | ✅ Included | ✅ Included | ✅ Included (copper 5m, support, cable, drain) | — | — (pre-charged) |
| CLIM-030 Démontage | ✅ Included | ✅ Included | ✅ Included (wall plugs) | — | — | — (pump-down to outdoor unit) |

---

## Complexity Escape Rules Summary

| Service | Trigger → Escape |
|---|---|
| CLIM-002 | Démontage requis pour diagnostic → DEVIS |
| CLIM-003 | Accès > 2,5m → DEVIS accès; Filtre abîmé → pièce séparée; Problème frigo → CLIM-006 |
| CLIM-004 | Condenseur inaccessible → CLIM-003 + DEVIS; Serpentin corrodé → DEVIS; Accès > 2,5m → DEVIS |
| CLIM-009 | Pompe de relevage défaillante → CLIM-006; Encastré dans dalle → DEVIS |
| CLIM-013 | Fuite inaccessible → DEVIS; Fuite compresseur → CLIM-019/DEVIS; R32 sans équipement → HORS PÉRIMÈTRE |
| CLIM-020 | Liaison > 3m → CLIM-025/m; Façade inaccessible → DEVIS; Béton armé épais → DEVIS; Tableau éloigné → électricien |
| CLIM-021 | Liaison > 5m → CLIM-025/m; Même triggers que CLIM-020 |
| CLIM-030 | Accès difficile → DEVIS supplément; Multi-split → DEVIS démontage multi-split |

---

## Commission Sensitivity Summary

All scenarios calculated as: `price × (1 - commission) - fuel_cost`

| Service | Price | @0%/LOW | @15%/MID | @20%/HIGH | Worst Case | Grade |
|---|---|---|---|---|---|---|
| CLIM-002 | 250 | 225 | 173 | 140 | 140 | ACCEPTABLE |
| CLIM-003 | 300 | 275 | 215 | 180 | 180 | ACCEPTABLE |
| CLIM-004 | 450 | 425 | 343 | 300 | 300 | STRONG |
| CLIM-009 | 220 | 195 | 147 | 116 | 116 | ACCEPTABLE |
| CLIM-013 | 600 | 575 | 470 | 420 | 420 | STRONG |
| CLIM-020 | 900 | 875 | 725 | 660 | 660* | STRONG |
| CLIM-021 | 1100 | 1075 | 895 | 820 | 820* | STRONG |
| CLIM-030 | 550 | 525 | 428 | 380 | 380 | STRONG |

*CLIM-020/021 net before materials. Material cost must be deducted for real artisan net calculation — see calibration.v0.2.json material_cost_note.

**Grade thresholds (climatisation-specific):**
- STRONG: ≥ 200 MAD
- ACCEPTABLE: ≥ 150 MAD  
- MARGINAL: ≥ 100 MAD
- FAIL: < 100 MAD

---

## Key Human Calibrator Decisions Required

1. **Confirm or adjust proposed prices** for all 8 candidates
2. **Validate material cost estimate** for CLIM-020/021 — actual copper + support cost in artisan network
3. **Adopt or modify diagnostic absorption policy** (recommended: deductible same-visit)
4. **Define 3m vs 5m copper scope** as the canonical split-point (vs alternative 4m/6m cut-points)
5. **Confirm pump-down requirement** for CLIM-030 and that artisan network supports it
6. **Confirm CLIM-013 conditionality** — what percentage of reported accessible leaks actually escape to DEVIS in artisan experience?
7. **Confirm outdoor unit inclusion/exclusion** boundary between CLIM-003 and CLIM-004
8. **Sign off on refrigeration integrity doctrine** as FIXEO technical policy

---

*All prices are research proposals. No price is active. Human approval required before any production use.*  
*All prior V0.1 Phase 7B.6 artifacts are preserved unchanged.*
