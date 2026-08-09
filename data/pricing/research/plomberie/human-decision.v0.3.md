# FIXEO Plumbing Human Price Decision — V0.3

**Status: HUMAN_APPROVED_PILOT — NOT PRODUCTION**
**Version:** 0.3.0
**Phase:** 7B.3.3 — Human Price Decision Freeze
**Approval date:** 2026-08-09
**Production-ready:** NO

---

## Provenance Chain

```
V0.1 (Phase 7B.3.1)  →  Raw normalized market research — 20 services
V0.2 (Phase 7B.3.2)  →  Human calibration — scope contracts, economic model, candidacy
V0.3 (Phase 7B.3.3)  →  Human-approved pilot prices — FROZEN DECISION
```

All versions preserved. No prior version overwritten.

---

## Human-Approved Pilot Prices — Six Services Frozen

| Service | Approved FIXEO Fixed Price | Currency | Architecture |
|---------|--------------------------|----------|-------------|
| plomberie.diagnostic | **180 MAD** | MAD | FIXEO_FIXED_PRICE |
| plomberie.fuite_simple | **250 MAD** | MAD | FIXEO_FIXED_PRICE |
| plomberie.debouchage_evier | **250 MAD** | MAD | FIXEO_FIXED_PRICE |
| plomberie.debouchage_wc_simple | **300 MAD** | MAD | FIXEO_FIXED_PRICE |
| plomberie.robinet_remplacement | **250 MAD** | MAD | FIXEO_FIXED_PRICE |
| plomberie.chasse_eau | **300 MAD** | MAD | FIXEO_FIXED_PRICE |

```
human_approved     = true (all six)
pilot_status       = HUMAN_APPROVED_PILOT (all six)
production_ready   = false (all six)
price_provenance   = FIXEO_HUMAN_CALIBRATED_PILOT
```

---

## Price Provenance

These prices are **NOT**:
- artisan-declared prices
- statistically proven transaction medians
- AI-generated prices
- machine-learning predictions
- official regulated Moroccan tariffs
- automatically computed outputs

These prices **ARE**:
> "FIXEO human-calibrated pilot prices based on aggregated Moroccan market research and dual-fairness economic review."

Internal provenance enum: `FIXEO_HUMAN_CALIBRATED_PILOT`

---

## FIXEO_DUAL_FAIRNESS_PRINCIPLE — Frozen

> A FIXEO price is acceptable only if it simultaneously protects the client from arbitrary overpricing AND the artisan from economically unsustainable underpricing. FIXEO must NOT target the cheapest market price. FIXEO should target a defensible central fair price. The objective is CLIENT_FAIRNESS + ARTISAN_VIABILITY + PRICE_PREDICTABILITY + CLEAR_SCOPE — not lowest-price competition.

**Corollaries:**
1. **Viability Floor** — No FIXEO reference price forces a professional artisan into loss-making work
2. **Credibility Ceiling** — No FIXEO reference price is unjustifiable to a well-informed client
3. **Transparency Over Precision** — A clearly-scoped reference estimate beats a precise number that misrepresents inclusions

---

## Diagnostic Absorption Rule — Frozen

> If the client immediately accepts a qualifying standardized FIXEO repair that can be completed during the **SAME visit**, the diagnostic fee (180 MAD) is **ABSORBED** into the intervention price.

**The client must NOT pay:**
```
180 MAD diagnostic fee
+
full standardized FIXEO intervention price
```
for a simple same-visit standardized repair.

**The 180 MAD diagnostic remains payable when:**
- No repair is performed
- The repair requires a quote (intervention outside standardized scope)
- The diagnosis is inconclusive and requires a return visit
- Specialized detection equipment not carried as standard is required

**Morocco market note:** Diagnostic fee charged even without repair is confirmed Moroccan market practice. The absorption rule is a FIXEO policy innovation. The French-market deductible model (fee deducted from repair price) has no Morocco market evidence and is NOT adopted.

---

## HORS PÉRIMÈTRE PRIX FIXEO — Complexity Escape Doctrine — Frozen

> A FIXEO fixed price must **NEVER silently increase**.

**Required workflow when escape condition is discovered:**

```
1. STOP — do not perform additional work without approval
2. IDENTIFY — name the objective escape condition
3. EXPLAIN — inform the client clearly and factually
4. DECLARE — "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. QUOTE — provide the additional quote or revised price
6. APPROVE — obtain explicit client approval
7. CONTINUE — only then proceed with the additional work
```

The original FIXEO fixed price is not automatically replaced or silently increased. The client retains the right to decline additional work and pay only the diagnostic fee.

---

## Scope Contracts — All Six Services

### 1. plomberie.diagnostic — 180 MAD

**Included:**
- Standard artisan travel within normal intervention zone
- Initial on-site diagnosis
- Identification of likely cause where possible
- Verbal findings explanation to client
- Verbal quote for repair if applicable

**Excluded:**
- Any repair work
- Heavy dismantling
- Specialized leak-detection equipment (thermal camera, pressure test, endoscope)
- Second visit
- Written diagnostic report or certification
- Collective plumbing / building common systems

**Diagnostic absorption:** Active — fee absorbed if same-visit standardized repair proceeds
**Materials:** None applicable
**Parts:** None applicable

**Escape triggers:** Address outside zone; intermittent fault; specialist equipment required; immeuble authorization required

---

### 2. plomberie.fuite_simple — 250 MAD

**Included:**
- Travel + labour
- One visible, accessible simple leak
- Standard repair (tightening, joint replacement, raccord sealing)
- Basic consumables: joint, téflon, pâte — total ≤50 MAD

**Excluded:**
- Concealed leak (wall/floor/ceiling) → fuite_encastree
- Pipe replacement >20 cm
- Specialized detection equipment
- Any replacement part >50 MAD (quoted separately before installation)
- Multiple unrelated leak points
- Water damage assessment, masonry, tiling

**Diagnostic:** Included in 250 MAD
**Materials:** Basic consumables ≤50 MAD included
**Parts:** Excluded — any part >50 MAD requires client approval before installation

**Escape triggers:** Leak not visible; pipe access requires dismantling; >1 leak point; required part >50 MAD; concealed pipe discovered; replacement >20 cm

---

### 3. plomberie.debouchage_evier — 250 MAD

**Included:**
- Travel + labour
- One évier (kitchen sink) or lavabo (bathroom basin)
- Standard manual unclogging: déboucheur, ventouse, furet ≤5m
- Siphon inspection and cleaning (no replacement)

**Excluded:**
- Multiple fixtures backing up simultaneously
- Building drainage column → debouchage_colonne
- Recurring deep blockage requiring motorized equipment
- Siphon replacement (quoted separately if >50 MAD)
- Major dismantling

**Diagnostic:** Included in 250 MAD
**Materials:** None consumed
**Parts:** None normally required; siphon replacement quoted separately if needed

**Escape triggers:** Manual method fails; multiple fixtures affected on arrival; siphon cracked; access obstructed; blockage deeper than furet reach

---

### 4. plomberie.debouchage_wc_simple — 300 MAD

**Included:**
- Travel + labour
- One WC fixture
- Simple isolated blockage
- Standard manual intervention: ventouse à cloche WC, furet manuel ≤5m
- One intervention attempt

**Excluded:**
- Foreign object requiring complex/specialized extraction
- Multiple fixtures backing up
- Building drainage column
- Previous failed professional intervention
- Motorized or professional equipment requirement
- WC dismantling or removal

**Diagnostic:** Included in 300 MAD
**Materials:** None consumed
**Parts:** None normally required

**Escape triggers:** Manual method fails; foreign body confirmed; multiple fixtures affected; WC dismantling required

---

### 5. plomberie.robinet_remplacement — 250 MAD

**Included:**
- Travel + labour
- Removal of standard existing tap or mixer
- Installation of standard replacement tap or mixer (client-supplied)
- Standard connection using existing flexibles
- Basic consumables: joint de raccord, téflon ≤50 MAD

**Excluded:**
- The tap or mixer itself — **NOT included**
- Modification of plumbing network
- Inaccessible/corroded connections requiring major additional work
- Wall opening or masonry
- Non-standard thread requiring adapter >50 MAD
- Wall-mounted spout or thermostatic mixer
- New flexible hoses if required (quoted separately)

**Diagnostic:** Included in 250 MAD
**Materials:** Basic consumables ≤50 MAD included
**Parts:** THE TAP/MIXER IS NOT INCLUDED. Client supplies by default. If artisan supplies at client request: disclosed + approved separately before installation.

**Client-facing label:** "Main-d'œuvre + déplacement — robinet / mitigeur fourni par le client"

**Escape triggers:** Non-standard thread requiring adapter; old tap corroded/seized; robinet d'arrêt also defective; pipe re-routing required; wall-mounted installation

---

### 6. plomberie.chasse_eau — 300 MAD

**Included:**
- Travel + labour
- Standard accessible WC cistern (réservoir apparent, non encastré)
- Diagnosis and standard mechanism repair or replacement labour
- Minor seal/basic consumable ≤30 MAD

**Excluded:**
- Replacement flushing mechanism / significant replacement part — **NOT included**
- Concealed cistern requiring wall or tile access
- Wall-hung WC (WC suspendu) → sanitaire_wc_suspendu
- Structural plumbing modification
- Non-standard or premium flush system
- Cracked or broken cistern (requires full replacement)

**Diagnostic:** Included in 300 MAD
**Materials:** Basic seal ≤30 MAD included
**Parts:** REPLACEMENT MECHANISM NOT INCLUDED. Client supplies universal mono-bloc (60–120 MAD from droguerie/Bricoma). If artisan supplies: disclosed + approved separately.

**Client-facing label:** "Main-d'œuvre + déplacement — mécanisme fourni par le client"

**Critical pre-booking question:** "Standard WC avec réservoir apparent, ou WC suspendu (bâti-support encastré) ?"

**Escape triggers:** WC suspendu discovered; cistern cracked; robinet d'arrêt defective; mechanism seized; non-standard proprietary system

---

## Materials Policy — All Six Services

| Service | Labour | Travel | Basic Consumables | Replacement Part |
|---------|--------|--------|-------------------|-----------------|
| diagnostic | included | included (IS service) | NOT APPLICABLE | NOT APPLICABLE |
| fuite_simple | included | included | ≤50 MAD included | EXCLUDED (>50 MAD → quoted) |
| debouchage_evier | included | included | NONE | EXCLUDED |
| debouchage_wc_simple | included | included | NONE | EXCLUDED |
| robinet_remplacement | included | included | ≤50 MAD included | EXCLUDED — client supplies tap |
| chasse_eau | included | included | ≤30 MAD included | EXCLUDED — client supplies mechanism |

**Canonical rule:** A replacement part is NEVER silently bundled into a FIXEO fixed price. If an artisan supplies a part at client request, it must be declared separately, priced at cost, and approved by the client before installation.

---

## Commission Sensitivity — Approved Prices

All calculations at MID fuel scenario (40 MAD round trip). `above_floor` = net pre-labour > 100 MAD.

### plomberie.diagnostic — 180 MAD

| Commission | FIXEO takes | Artisan gross | Less fuel | Net pre-labour | ≥ Floor? |
|-----------|------------|--------------|-----------|---------------|---------|
| 0% | 0 | 180 | 140 | 140 | ✅ YES |
| 10% | 18 | 162 | 122 | 122 | ✅ YES |
| 15% | 27 | 153 | 113 | 113 | ✅ YES |
| 20% | 36 | 144 | 104 | 104 | ✅ YES |

**Floor breach:** NONE. Improvement from V0.2 anchor (150 → 180 MAD).

### plomberie.fuite_simple — 250 MAD (materials 30 MAD)

| Commission | FIXEO takes | Artisan gross | Less fuel | Less mat | Net pre-labour | ≥ Floor? |
|-----------|------------|--------------|-----------|---------|---------------|---------|
| 0% | 0 | 250 | 210 | 180 | 180 | ✅ YES |
| 10% | 25 | 225 | 185 | 155 | 155 | ✅ YES |
| 15% | 37.5 | 212.5 | 172.5 | 142.5 | 142.5 | ✅ YES |
| 20% | 50 | 200 | 160 | 130 | 130 | ✅ YES |

**Floor breach:** NONE.

### plomberie.debouchage_evier — 250 MAD (no materials)

| Commission | FIXEO takes | Artisan gross | Less fuel | Net pre-labour | ≥ Floor? |
|-----------|------------|--------------|-----------|---------------|---------|
| 0% | 0 | 250 | 210 | 210 | ✅ YES |
| 10% | 25 | 225 | 185 | 185 | ✅ YES |
| 15% | 37.5 | 212.5 | 172.5 | 172.5 | ✅ YES |
| 20% | 50 | 200 | 160 | 160 | ✅ YES |

**Floor breach:** NONE.

### plomberie.debouchage_wc_simple — 300 MAD (no materials)

| Commission | FIXEO takes | Artisan gross | Less fuel | Net pre-labour | ≥ Floor? |
|-----------|------------|--------------|-----------|---------------|---------|
| 0% | 0 | 300 | 260 | 260 | ✅ YES |
| 10% | 30 | 270 | 230 | 230 | ✅ YES |
| 15% | 45 | 255 | 215 | 215 | ✅ YES |
| 20% | 60 | 240 | 200 | 200 | ✅ YES |

**Floor breach:** NONE. Strongest economics of all six services.

### plomberie.robinet_remplacement — 250 MAD (materials 20 MAD)

| Commission | FIXEO takes | Artisan gross | Less fuel | Less mat | Net pre-labour | ≥ Floor? |
|-----------|------------|--------------|-----------|---------|---------------|---------|
| 0% | 0 | 250 | 210 | 190 | 190 | ✅ YES |
| 10% | 25 | 225 | 185 | 165 | 165 | ✅ YES |
| 15% | 37.5 | 212.5 | 172.5 | 152.5 | 152.5 | ✅ YES |
| 20% | 50 | 200 | 160 | 140 | 140 | ✅ YES |

**Floor breach:** NONE. V0.2 commission-sensitivity concern (200 MAD anchor at 20% = 100 MAD net, at floor) **fully resolved** by 250 MAD approved price (20% = 140 MAD net).

### plomberie.chasse_eau — 300 MAD (materials 15 MAD)

| Commission | FIXEO takes | Artisan gross | Less fuel | Less mat | Net pre-labour | ≥ Floor? |
|-----------|------------|--------------|-----------|---------|---------------|---------|
| 0% | 0 | 300 | 260 | 245 | 245 | ✅ YES |
| 10% | 30 | 270 | 230 | 215 | 215 | ✅ YES |
| 15% | 45 | 255 | 215 | 200 | 200 | ✅ YES |
| 20% | 60 | 240 | 200 | 185 | 185 | ✅ YES |

**Floor breach:** NONE.

### Summary — Economic Floor Check

| Service | Approved price | Net @15% | Net @20% | Floor breach? |
|---------|---------------|---------|---------|--------------|
| diagnostic | 180 MAD | 113 | 104 | ❌ NONE |
| fuite_simple | 250 MAD | 142.5 | 130 | ❌ NONE |
| debouchage_evier | 250 MAD | 172.5 | 160 | ❌ NONE |
| debouchage_wc_simple | 300 MAD | 215 | 200 | ❌ NONE |
| robinet_remplacement | 250 MAD | 152.5 | 140 | ❌ NONE |
| chasse_eau | 300 MAD | 200 | 185 | ❌ NONE |

**All six approved prices pass the artisan economic floor check at all commission rates tested (0/10/15/20%).**

Note: Prices approved by human reviewer exceed V0.2 anchors in all cases — this was the primary driver of improved economics across the board.

---

## Artisan Fairness — Post-Approval Assessment

| Service | ARTISAN_FAIRNESS | Basis |
|---------|-----------------|-------|
| diagnostic | ACCEPTABLE | 113 MAD net at 15%; marginal for very long travel but above floor |
| fuite_simple | ACCEPTABLE | 142.5 MAD net at 15% for 30–45 min; scope escape must be enforced |
| debouchage_evier | ACCEPTABLE | 172.5 MAD net at 15% for 20–30 min; cleanest economics (no materials) |
| debouchage_wc_simple | **STRONG** | 215 MAD net at 15%; best economics of the six |
| robinet_remplacement | ACCEPTABLE | 152.5 MAD net at 15% for 30 min; V0.2 concern fully resolved |
| chasse_eau | ACCEPTABLE | 200 MAD net at 15% for 45–60 min; good per-hour rate |

---

## Client Fairness — Post-Approval Assessment

| Service | CLIENT_FAIRNESS | Key disclosure required |
|---------|----------------|------------------------|
| diagnostic | ACCEPTABLE | Fee owed even without repair; absorption rule must be visible pre-booking |
| fuite_simple | ACCEPTABLE | Parts >50 MAD not included; requires pre-booking disclosure |
| debouchage_evier | **STRONG** | No ambiguity; no parts; obvious scope |
| debouchage_wc_simple | **STRONG** | No ambiguity; widely understood in Morocco |
| robinet_remplacement | ACCEPTABLE | "Main-d'œuvre seule" must be prominent; tap not included |
| chasse_eau | ACCEPTABLE | Mechanism not included; client guidance to buy mono-bloc required |

---

## Canonical Policies — Frozen

### Geographic
- `city_adjustment = null` — no multipliers
- National pilot reference prices
- Casablanca = economic stress-test only, not a universal price anchor
- No Casablanca ×1.15 / Fès ×1.05 etc.
- City-specific pricing requires FIXEO transaction data (minimum: ≥10 normalized missions per service per city from distinct artisans)

### Urgency / Night / Weekend
- `urgency_modifier = null` — no automatic modifiers approved
- Legacy +40%/+25%/+20% values remain NON-CANONICAL
- Dedicated urgency research phase required before any modifier is approved
- FIXEO must NOT encode urgency surcharges as contractually guaranteed values

### AI Terminology
- Current maturity: `LEVEL_0 — EXTERNAL_RESEARCH / HUMAN_CALIBRATION`
- System is `RULE_BASED` — not AI, not ML, not statistical
- "FIXEO AI Price", "AI-powered pricing", "Prix calculé par IA" = PROHIBITED
- "AI-powered" label requires trained model on FIXEO-owned data, validated, quarterly retrained

---

## Backward Traceability

| Version | File | Date | Status | Description |
|---------|------|------|--------|-------------|
| V0.1 | `registry.v0.json` | 2026-08-09 | ✅ PRESERVED UNCHANGED | Raw normalized research |
| V0.2 | `registry.v0.2.json`, `calibration.v0.2.json`, `fair-price-policy.v0.2.md`, `human-review.v0.2.md` | 2026-08-09 | ✅ PRESERVED UNCHANGED | Human calibration candidates |
| V0.3 | `registry.v0.3.json`, `calibration.v0.3.json`, `human-decision.v0.3.md`, `fair-price-policy.v0.3.md` | 2026-08-09 | ✅ THIS VERSION | Human-approved pilot decision |

---

*This document is a research/data artifact. No production code has been modified. No deployment has been performed.*
