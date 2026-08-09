# FIXEO Serrurerie — Fair Price Policy
## Phase 7B.5.2 — Frozen Canonical Policy

**Status:** HUMAN_APPROVED — NOT PRODUCTION  
**Date:** 2026-08-09  
**Supersedes:** fair-price-policy.v0.2.md (research draft)  
**Production ready:** NO  

---

## 1. Dual-Fairness Principle

All FIXEO serrurerie prices are calibrated to simultaneously:

1. **Protect the client** from arbitrary overpricing and post-opening price inflation
2. **Protect the artisan** from economically unsustainable underpricing

Neither side alone determines the price. The objective is a fair, understandable, repeatable Moroccan reference price — not the cheapest marketplace price.

---

## 2. Approved Price Table

| Service | Price | Architecture | Hardware |
|---------|-------|-------------|---------|
| porte_claquee_ouverture | **220 MAD** | FIXED | None |
| porte_claquee_blindee_ouverture | **350 MAD** | CONDITIONAL_FIXED | None |
| porte_verrouillee_ouverture | **380 MAD** | CONDITIONAL_FIXED | Cylinder: SEPARATE |
| cle_cassee_extraction | **220 MAD** | CONDITIONAL_FIXED | Cylinder if damaged: SEPARATE |
| cylindre_remplacement_standard | **280 MAD** (labour) | LABOUR_FIXED_PART_SEPARATE | Cylinder: SEPARATE |
| serrure_remplacement_standard | **400 MAD** (labour) | LABOUR_FIXED_PART_SEPARATE | Lock: SEPARATE |
| serrure_grippee_deblocage | — | DEFERRED | — |

All prices: **daytime base, no modifiers, national Morocco scope.**

---

## 3. Scope Contracts

### 3.1 Porte claquée ouverture — 220 MAD FIXED

**Definition:** Residential or commercial door shut without turning the key (pêne engaged, not key-locked). Non-destructive opening by picking, card, or decoding.

**Includes:** Non-destructive opening labour + travel  
**Excludes:** All hardware replacement  
**Consumables:** None  
**Duration:** 5–20 min typical  

**Mandatory conditions:**
- Standard door (non-armoured)
- Pêne engaged but not key-locked
- No prior damage to cylinder or mechanism

**HORS PÉRIMÈTRE — escape triggers:**
- Door found to be key-locked → cite porte_verrouillee_ouverture or devis
- Armoured/blindée door identified → cite porte_claquee_blindee or porte_blindee_ouverture
- Cylinder damaged, non-destructive opening impossible → quote drilling + cylinder replacement
- Broken key in cylinder → cite cle_cassee_extraction

---

### 3.2 Porte claquée blindée — 350 MAD CONDITIONAL_FIXED

**Definition:** Armoured or reinforced door shut without turning the key. Specialist tooling. Non-destructive attempt first.

**Includes:** Specialist blind-door opening labour + travel  
**Excludes:** All hardware replacement  
**Duration:** 15–45 min typical  

**Condition to confirm on-site:**
- Armoured/reinforced door confirmed (blindage visible or declared)
- NOT key-locked

**HORS PÉRIMÈTRE:**
- Door found to be key-locked → DIAGNOSIS_FIRST porte_blindee_ouverture
- Non-destructive opening impossible → quote drilling + mechanism replacement

---

### 3.3 Porte verrouillée ouverture — 380 MAD CONDITIONAL_FIXED

**Definition:** Standard (non-armoured) residential door, locked by key. Keys genuinely lost, stolen, or locked inside. Opening by picking or controlled cylinder drilling. Cylinder replacement, if required, is a **separate transaction**.

**Includes:** Opening labour (picking or drilling) + travel  
**Excludes:** Cylinder replacement — always separate with disclosure protocol  
**Duration:** 20–45 min typical  

**Conditions to confirm:**
- Standard non-armoured door
- Genuine key loss/lockout situation

**Hardware protocol (critical):**  
If drilling becomes necessary:
1. Artisan informs client that barillet will be destroyed
2. States cylinder spec (brand, security grade) and price BEFORE drilling
3. Client explicitly approves
4. Cylinder installed only after approval
5. Old cylinder remnant returned to client

**HORS PÉRIMÈTRE:**
- Armoured/multipoints door → DIAGNOSIS_FIRST porte_blindee_ouverture
- Non-standard mechanism → quote required
- Client cannot prove occupancy → REFUSE (see authorization matrix)

---

### 3.4 Clé cassée extraction — 220 MAD CONDITIONAL_FIXED

**Definition:** Key fragment stuck in standard European cylinder. Specialist extraction tools. No cylinder replacement unless extraction damages the cylinder.

**Includes:** Extraction labour + travel  
**Excludes:** Cylinder replacement if damaged — separate with disclosure  
**Duration:** 10–30 min typical  

**Conditions:**
- Fragment in standard European cylinder
- Cylinder not pre-damaged by DIY extraction attempt

**Hardware protocol:** If cylinder damaged by extraction:
- State spec and price before any replacement
- Client approves explicitly

**HORS PÉRIMÈTRE:**
- Fragment cannot be extracted without drilling → quote drilling + cylinder replacement
- Armoured door → different service

---

### 3.5 Cylindre remplacement standard — 280 MAD LABOUR ONLY

**Definition:** Remove existing standard European cylinder, install new cylinder. **Labour and travel only. Cylinder is always a separate, disclosed, client-approved transaction.**

**Includes:** Labour (removal + installation + test) + travel + standard screws  
**Excludes:** Cylinder hardware  
**Duration:** 15–30 min typical  

**Full hardware disclosure protocol:**
1. Artisan identifies cylinder needed (size, type)
2. Proposes specific cylinder: brand + security class + price
3. Client approves, or chooses to supply their own compatible cylinder
4. Installation only after approval
5. Old cylinder returned to client

**Client total examples:**
- With basic cylinder (80–150 MAD): **360–430 MAD total**
- With quality cylinder (200–300 MAD): **480–580 MAD total**

**HORS PÉRIMÈTRE:**
- High-security patented cylinder → QUOTE_REQUIRED (cylindre_haute_securite)
- Armoured door mechanism → QUOTE_REQUIRED
- Additional frame damage → devis

---

### 3.6 Serrure remplacement standard — 400 MAD LABOUR ONLY

**Definition:** Remove existing single-point (monopoint) standard lock mechanism, install new mechanism. **Labour and travel only. Lock hardware is always a separate, disclosed, client-approved transaction.**

**Includes:** Labour (dismantling + installation + test + pêne alignment) + travel + standard screws  
**Excludes:** Lock body, cylinder, handle hardware  
**Duration:** 30–60 min typical  

**Full hardware disclosure protocol:**
1. Artisan identifies lock required (dimensions, backset, type)
2. Proposes: brand + security level + price
3. Client approves or supplies own compatible lock
4. Installation only after approval
5. Old lock returned to client

**Client total examples:**
- With standard lock (150–250 MAD): **550–650 MAD total**
- With quality lock (300–400 MAD): **700–800 MAD total**

**HORS PÉRIMÈTRE:**
- Multipoint lock detected → QUOTE_REQUIRED (serrure_multipoints)
- Armoured door → QUOTE_REQUIRED
- Frame/structural damage → devis menuiserie+serrurerie

---

## 4. HORS PÉRIMÈTRE Protocol — Canonical

When any intervention exceeds the defined scope:

```
1. STOP work immediately
2. IDENTIFY the objective escape condition (specific, not vague)
3. EXPLAIN to client: "Ce problème sort du cadre du tarif FIXEO standard"
4. DECLARE: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE any additional cost (labour and/or hardware, separately)
6. OBTAIN explicit client approval before continuing
7. CONTINUE only after approval is confirmed
```

**The original FIXEO price NEVER silently increases under any circumstance.**

---

## 5. Hardware Doctrine — Canonical

```
FIXEO standardized serrurerie price =
LABOUR + TRAVEL + explicitly listed minor consumables only.
```

**Major hardware is always:**
- A separate, independent transaction
- Disclosed with full specification before installation
- Priced transparently (no hidden markup)
- Client-approved before work proceeds
- Returned to client when technically possible (old cylinder, old lock)

**Client's right:** The client may always choose to supply their own compatible part. The artisan's FIXEO price (labour+travel) applies regardless of who supplies the hardware.

---

## 6. Authorization / Security Doctrine

### 6.1 Policy Basis Classification

Three distinct categories are used throughout this matrix:

| Basis | Meaning |
|-------|---------|
| **MARKET_PROFESSIONAL_PRACTICE** | Observed behavior described by Moroccan market sources (allo-maison.ma, mano.ma). Not legally verified. |
| **FIXEO_SECURITY_POLICY** | FIXEO platform policy adopted to protect clients, artisans, and third parties. Not claimed as Moroccan law. |
| **NOTE_ON_LEGAL_CONTEXT** | Contextual legal observation. NOT verified legal advice. Artisans with legal questions should consult appropriate counsel. |

**No claim in this document constitutes verified Moroccan legal advice.**

---

### 6.2 Authorization Matrix

#### Scenario A — Porte claquée résidentielle
**Risk level:** MEDIUM  
**policy_basis:** MARKET_PROFESSIONAL_PRACTICE + FIXEO_SECURITY_POLICY

**Required proof (at least one):**
- CIN matching the address
- Bail / contrat de location (name + address match)
- Facture eau/électricité at address in client's name
- Attestation from on-site gardien or building syndic

**Special case — documents inside:** Artisan may begin non-destructive work; presents documents immediately after door opens.

**If no proof is available:** FIXEO policy: refuse and advise client to contact gardien, landlord, or seek police assistance.

**May artisan proceed:** YES, with at least one proof. NO, without any proof.

---

#### Scenario B — Porte verrouillée / clés perdues
**Risk level:** HIGH  
**policy_basis:** MARKET_PROFESSIONAL_PRACTICE + FIXEO_SECURITY_POLICY

Same proof as Scenario A, but **must be verified BEFORE work begins** (door is locked — "show me after" is not available).

Additionally:
- If keys may have been stolen: artisan notes this and recommends cylinder replacement (security, not upselling)
- Client cannot prove occupancy: REFUSE — risk of unauthorized opening is materially higher with a locked door

**May artisan proceed:** YES, with proof before work. NO, without proof.

---

#### Scenario C — Entrée immeuble / porte commune copropriété
**Risk level:** HIGH  
**policy_basis:** FIXEO_SECURITY_POLICY

Individual occupant authorization is insufficient for shared building access points.

**Required:** Written or confirmed authorization from syndic or gardien.

**Rationale (FIXEO policy):** One resident cannot authorize modifications to shared security equipment that affects all residents.

**May artisan proceed:** Only with syndic/gardien authorization.

---

#### Scenario D — Propriété en location
**Risk level:** HIGH  
**policy_basis:** MARKET_PROFESSIONAL_PRACTICE + FIXEO_SECURITY_POLICY

**Opening (claquée / verrouillée):** Tenant bail + CIN = sufficient for opening.

**Lock/cylinder replacement:** Requires explicit landlord authorization.  
FIXEO policy rationale: changing a rental property's locks without owner consent may constitute lease breach. Artisan should request written landlord authorization or written tenant confirmation that landlord has consented.

**NOTE_ON_LEGAL_CONTEXT:** The specific legal rights of tenants vs. landlords over lock changes in Morocco are not verified in this research. FIXEO's policy defaults to requiring owner consent for hardware changes as a precautionary standard.

---

#### Scenario E — Post-effraction / tentative de cambriolage
**Risk level:** HIGH  
**policy_basis:** MARKET_PROFESSIONAL_PRACTICE + FIXEO_SECURITY_POLICY

**Sequence (critical):**
1. Client calls police FIRST
2. Police PV (procès-verbal) established
3. Locksmith called AFTER PV is initiated
4. Artisan may perform emergency temporary securing while waiting for police if client is locked out
5. Permanent lock/cylinder replacement only after PV is established

**Source for police-first sequence:** allo-maison.ma explicitly documents this as standard professional practice in Morocco.

**FIXEO policy rationale:** PV conditions insurance reimbursement. Pre-PV lock replacement may complicate evidence collection.

---

#### Scenario F — Véhicule
**Risk level:** HIGH  
**policy_basis:** FIXEO_SECURITY_POLICY

**Required proof:**
- Carte grise (vehicle registration) in client's name, OR
- Insurance certificate matching client identity, OR
- Written employer authorization (company vehicle)

**Older vehicles (mechanical lock):** CONDITIONAL_FIXED eligible — not yet price-calibrated  
**Modern vehicles (electronic/smart key):** DIAGNOSIS_FIRST — specialist required

**NOTE_ON_LEGAL_CONTEXT:** Morocco requires vehicles to be registered. Assuming the carte grise is the appropriate ownership document. Not verified against precise Moroccan vehicle law.

---

#### Scenario G — Coffre-fort / Safe
**Risk level:** CRITICAL  
**policy_basis:** FIXEO_SECURITY_POLICY

**Required proof:**
- Written ownership documentation (purchase receipt, invoice), OR
- Property manager written authorization (hotel/office safe), OR
- Both tenant and owner authorization (rented premises)

**FIXEO policy:** No artisan opens a safe for a person who cannot demonstrate ownership or authorized access. This is the highest-risk authorization scenario in locksmith services.

**Service status:** QUOTE_REQUIRED always. No FIXEO standardized price. Police involvement may be appropriate in ambiguous ownership situations.

---

#### Scenario H — Accès contesté (litige, séparation, dispute)
**Risk level:** MAXIMUM  
**policy_basis:** FIXEO_SECURITY_POLICY

**FIXEO policy: REFUSE the intervention.**

When there is an active dispute between parties over property access (landlord vs. tenant, separating spouses, co-owners in conflict), a locksmith opening the property for one party may be facilitating an act that the other party contests. The artisan cannot adjudicate this dispute.

**Advise the requesting party to:**
1. Seek legal advice
2. Obtain police escort (commissariat assistance for legitimate access situations)
3. Resolve through civil channels if needed

**NOTE_ON_LEGAL_CONTEXT:** This policy is conservative and reflects prudent professional practice. The specific legal procedures for disputed property access in Morocco have not been verified against precise Moroccan law.

---

### 6.3 Authorization Summary Table

| Scenario | Proof Required | May Proceed | Police/Legal |
|----------|---------------|-------------|-------------|
| A: Porte claquée | CIN/bail/facture/gardien | YES with proof | NO (standard) |
| B: Porte verrouillée | Same, BEFORE work | YES with proof | NO (unless theft) |
| C: Common building | Syndic authorization | Only with syndic | NO |
| D: Rental — opening | Tenant bail+CIN | YES | NO |
| D: Rental — lock change | Owner consent | Only with owner | NO |
| E: Post-effraction | Occupant proof + Police PV first | After PV only | YES — PV required |
| F: Vehicle | Carte grise equivalent | YES with proof | NO (standard) |
| G: Coffre-fort | Ownership documentation | Only with documentation | Possible if unclear |
| H: Contested access | N/A | REFUSE | Advise parties |

---

## 7. Services — Architecture Reference

| Service | Architecture | Notes |
|---------|-------------|-------|
| porte_claquee | FIXED | No parts |
| porte_claquee_blindee | CONDITIONAL_FIXED | Must confirm blindée + claquée |
| porte_verrouillee | CONDITIONAL_FIXED | Cylinder always separate |
| cle_cassee | CONDITIONAL_FIXED | Cylinder separate if damaged |
| cylindre_standard | LABOUR_FIXED_PART_SEPARATE | Labour only |
| serrure_standard | LABOUR_FIXED_PART_SEPARATE | Labour only |
| serrure_grippee | DEFERRED / DIAGNOSIS_FIRST | Pending evidence |
| porte_blindee_ouverture | DIAGNOSIS_FIRST | No fixed price |
| serrure_multipoints | QUOTE_REQUIRED | Too variable |
| cylindre_haute_securite | QUOTE_REQUIRED | Too variable |
| porte_blindee_installation | QUOTE_REQUIRED | 2500–12000 MAD range |
| coffre_fort | QUOTE_REQUIRED | Authorization critical |
| voiture | CONDITIONAL/DIAGNOSIS | Separate calibration |
| apres_effraction | DIAGNOSIS_FIRST | Police PV first |
| digicode | QUOTE_REQUIRED | Product-dependent |

---

## 8. Night / Weekend Evidence — Preserved, Not Canonical

| Source | Stated Range | Window |
|--------|-------------|--------|
| mano.ma | +30–50% | Night (undeclared window) |
| allo-maison.ma | +50–100% | 22h–7h + weekends + holidays |

Conservative anchor (for future decision): **+50%**

```
night_modifier   = null (not approved)
weekend_modifier = null (not approved)
```

This evidence is preserved and will be considered in a dedicated time-modifier calibration phase.

---

## 9. Relationship to Plumbing and Electricity

**Diagnostic absorption doctrine does not apply to serrurerie.**

Locksmith pricing is event-based: the service type is stated by the client before travel. There is no standalone diagnostic fee because there is nothing to diagnose before the artisan arrives — the situation is described by the client.

For DIAGNOSIS_FIRST services (porte blindée, coffre fort, post-effraction), a déplacement assessment fee may be appropriate — this has not been standardized and awaits a future calibration phase.

**Shared principles with plumbing/electricity:**
- Parts always separate with disclosure protocol ✓
- HORS PÉRIMÈTRE escalation applies ✓
- Dual-fairness principle applies ✓
- Artisan floor applies ✓

---

## 10. Provenance — Frozen

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity         = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

Required client-facing disclaimer (future):
```
"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."
```

---

*Phase 7B.5.2 — Frozen. Supersedes fair-price-policy.v0.2.md. No production deployment.*
