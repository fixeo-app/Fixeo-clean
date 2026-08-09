# FIXEO Serrurerie — Fair Price Policy
## Phase 7B.5.1 — Research Draft

**Status:** RESEARCH_DRAFT — NOT PRODUCTION — HUMAN DECISION REQUIRED  
**Date:** 2026-08-09  
**All prices:** Daytime base only  
**Night/weekend modifiers:** null

---

## 1. Core Pricing Architecture

### 1.1 Dual-Fairness Principle

All FIXEO serrurerie prices are calibrated to simultaneously:
1. Protect the client from arbitrary overpricing and post-opening price inflation
2. Protect the artisan from economically unsustainable underpricing

Neither side alone determines the price.

### 1.2 Provenance

```
FIXEO_HUMAN_CALIBRATED_PILOT
Maturity: LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

These are not AI-generated prices. They are not official Moroccan tariffs. They are not regulated prices. They are not statistically proven transaction medians. They are human-calibrated reference prices based on Moroccan market research.

### 1.3 Client Disclaimer

```
"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."
```

---

## 2. FIXEO Serrurerie Pricing Structure

### 2.1 Service Architecture Map

| Service | Architecture | FIXEO Price (Proposed) | Hardware |
|---------|-------------|----------------------|----------|
| Porte claquée ouverture | FIXED | 220 MAD | None |
| Porte claquée blindée | CONDITIONAL_FIXED | 350 MAD | None |
| Porte verrouillée ouverture | CONDITIONAL_FIXED | 380 MAD | Cylinder: SEPARATE |
| Clé cassée extraction | CONDITIONAL_FIXED | 220 MAD | Cylinder if damaged: SEPARATE |
| Cylindre remplacement standard | LABOUR_FIXED_PART_SEPARATE | 280 MAD (labour) | Cylinder: SEPARATE |
| Serrure remplacement standard | LABOUR_FIXED_PART_SEPARATE | 400 MAD (labour) | Lock body: SEPARATE |
| Serrure grippée déblocage | CONDITIONAL_FIXED | 200 MAD | Consumables included |
| Porte blindée ouverture (verrouillée) | DIAGNOSIS_FIRST | Quote required | Variable |
| Serrure multipoints | QUOTE_REQUIRED | — | Variable |
| Coffre-fort ouverture | QUOTE_REQUIRED | — | — |
| Porte blindée installation | QUOTE_REQUIRED | — | Door included in quote |

### 2.2 What Every FIXEO Locksmith Price Includes

**Included in all standardized prices:**
- Labour (specific to the defined intervention)
- Artisan travel to the site (déplacement)
- Standard small consumables where applicable (lubricant for serrure_grippee)

**NEVER silently included:**
- Replacement cylinders
- Replacement lock bodies
- Replacement mechanisms
- Specialty hardware

### 2.3 Hardware Disclosure Protocol

Whenever a replacement part is required:

```
1. IDENTIFY the exact part needed (type, dimensions, standard)
2. PROPOSE a specific part: brand + security grade/class
3. STATE the part price before touching it
4. OBTAIN explicit client approval (verbal minimum, written preferred)
5. INSTALL only after approval
6. RETURN the old part to the client (cylinder, lock body)
```

No silent markup. No undisclosed substitutions. The client has the right to supply their own compatible part.

---

## 3. HORS PÉRIMÈTRE Protocol

When scope changes mid-intervention:

```
1. STOP work immediately
2. IDENTIFY the objective escape condition
3. EXPLAIN clearly to the client: "Ce problème sort du cadre du tarif FIXEO standard"
4. DECLARE: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE any additional cost (labour, parts, or both)
6. OBTAIN explicit client approval
7. CONTINUE only after approval is confirmed
```

A FIXEO standardized price NEVER silently increases.

### 3.1 Service-Specific Escape Triggers

**Porte claquée → HORS PÉRIMÈTRE when:**
- Porte is locked (tourner la clé) → quote porte_verrouillee or devis
- Porte blindée identified → quote porte_claquee_blindee or devis
- Barillet endommagé → non-destructive opening impossible → drilling quote

**Porte claquée blindée → HORS PÉRIMÈTRE when:**
- Porte is locked → DIAGNOSIS_FIRST porte_blindee_ouverture
- Destructive opening required → quote drilling + mechanism replacement

**Porte verrouillée → HORS PÉRIMÈTRE when:**
- Porte blindée or multipoints → DIAGNOSIS_FIRST
- Cylinder to be drilled and replaced → disclose cylinder price separately before proceeding
- Non-standard mechanism → quote required

**Clé cassée extraction → HORS PÉRIMÈTRE when:**
- Fragment cannot be extracted without drilling → quote drilling + cylinder replacement
- Porte blindée → different tariff

**Cylindre remplacement → HORS PÉRIMÈTRE when:**
- High-security patented cylinder requested → QUOTE_REQUIRED
- Porte blindée mechanism → QUOTE_REQUIRED
- Additional framework damage → devis

**Serrure remplacement → HORS PÉRIMÈTRE when:**
- Multipoints mechanism → QUOTE_REQUIRED
- Frame or door structural damage → devis menuiserie
- High-end security lock → QUOTE_REQUIRED

**Serrure grippée → HORS PÉRIMÈTRE when:**
- Mechanism cannot be freed by lubrication alone → cylindre or serrure replacement (separate accord)
- Effraction damage detected → DIAGNOSIS_FIRST apres_effraction workflow

---

## 4. Authorization / Security Matrix

### 4.1 Important Disclaimer

This matrix reflects:
- **Market professional practice** (observed from Moroccan locksmith sources)
- **FIXEO platform policy** (defined here)
- Where cited as Moroccan law: this is NOT verified legal advice — it is a representation of what market sources describe as professional obligation

When in doubt, artisans should refuse and advise the client to seek appropriate legal or official assistance.

### 4.2 Canonical Authorization Matrix

---

#### Scenario A — Porte claquée résidentielle
**Risk level:** MEDIUM  
**Description:** Client locked out of own home, door shut without key

**Market practice:** Artisan may proceed with basic identity confirmation  
**FIXEO policy:**  
Artisan must obtain at least ONE of:
- CIN matching the address
- Bail (rental contract) with name + address
- Facture eau / électricité at address in client's name
- Attestation from on-site gardien or building syndic

If documents are inside (standard for claquée): artisan may begin work, presents documents for verification immediately after door opens.

**May artisan proceed without ANY proof?**  
FIXEO policy: NO. If no proof is possible and no gardien can confirm: refuse, advise client to contact police or landlord for assistance.

---

#### Scenario B — Porte verrouillée / clés perdues
**Risk level:** HIGH  
**Description:** Door locked, keys genuinely lost or stolen

**FIXEO policy:**  
Same proof requirements as Scenario A, applied BEFORE work begins (door is locked — no "present after opening" option).

Additionally:
- If keys may have been stolen (not merely lost): artisan should note this and recommend cylinder replacement as a security measure.
- If client cannot prove occupancy: REFUSE. The risk of opening a stranger's property is materially higher when the door is locked.

**Post-opening recommendation:** If keys were lost in public, recommend cylinder replacement immediately (security, not upselling — see cylindre_remplacement_standard).

---

#### Scenario C — Entrée d'immeuble / porte commune copropriété
**Risk level:** HIGH  
**Description:** Shared building entrance, hallway door, or copropriété access point

**FIXEO policy:**  
Individual occupant authorization is insufficient.  
Required: **Syndic authorization** or **gardien confirmation** before opening/replacing shared access hardware.

Rationale: A shared entrance serves all residents. One resident does not have the right to authorize a locksmith to modify or bypass shared security equipment.

---

#### Scenario D — Propriété en location (locataire appelle)
**Risk level:** HIGH  
**Description:** Tenant locked out of rented property

**Market practice:** Locksmith may open for a tenant with proof of tenancy  
**FIXEO policy:**  
- Tenant locked out (claquée / clés perdues): proof of tenancy (bail) + CIN = acceptable to open
- Tenant requesting lock REPLACEMENT: **landlord authorization required** — changing a rental property's locks without owner consent may constitute contract breach
- FIXEO artisans must not perform cylinder or lock replacement on rental property without explicit owner consent or written tenant authorization from the owner

---

#### Scenario E — Après effraction / tentative de cambriolage
**Risk level:** HIGH — security and insurance implications  
**Description:** Break-in occurred or was attempted

**FIXEO policy:**  
1. **Police PV (procès-verbal) MUST be obtained before locksmith work begins** — this is required for insurance claims and preserves evidence
2. Do NOT replace locks or cylinders before police documentation
3. Artisan may perform emergency temporary securing (blocking the door) while waiting for police
4. Full cylinder/lock replacement only after PV established

**Source:** allo-maison.ma explicitly confirms this is the correct professional sequence in Morocco.

---

#### Scenario F — Véhicule
**Risk level:** HIGH  
**Description:** Vehicle locked, keys inside

**FIXEO policy:**  
Required proof: Carte grise (vehicle registration) in client's name, OR:
- Insurance certificate matching client identity
- If company vehicle: written employer authorization

For older (mechanical) vehicles: CONDITIONAL_FIXED intervention feasible  
For modern vehicles (electronic/smart key): DIAGNOSIS_FIRST, specialist equipment required

**FIXEO does NOT set a standardized fixed price for vehicle opening in Phase 7B.5.1.** This service requires human calibration of a separate vehicle-locksmith service category.

---

#### Scenario G — Coffre-fort / Safe
**Risk level:** CRITICAL  
**Description:** Safe locked, combination lost, malfunction

**FIXEO policy:**  
Mandatory before any work:
- Written ownership documentation (purchase receipt, invoice)
- For hotel/office embedded safe: property manager written authorization
- For personal safe in rented premises: both tenant and property owner documentation

No artisan should open a safe for a person who cannot demonstrate ownership or authorized access. The risk of being used to steal from a safe is highest in this service category.

No FIXEO standardized price. QUOTE_REQUIRED always. Police involvement may be appropriate in disputed cases.

---

#### Scenario H — Accès contesté (litige propriétaire/locataire, séparation, dispute)
**Risk level:** MAXIMUM  
**Description:** Access dispute between parties (landlord vs tenant, separating spouses, co-owners in conflict)

**FIXEO policy:**  
**REFUSE the intervention.**  
A locksmith opening a property in an active access dispute may be facilitating an unlawful act, regardless of which party calls.

Advise the requesting party to:
1. Seek legal advice
2. Obtain a police escort (commissariat de police can assist in legitimate access situations)
3. Pursue civil resolution if needed

FIXEO artisans are not arbiters of disputed property access.

---

### 4.3 Authorization Summary Table

| Scenario | Required Proof | May Proceed | Police/Legal Required |
|----------|---------------|-------------|----------------------|
| A: Porte claquée | CIN/bail/facture/gardien | YES with proof | NO (standard) |
| B: Porte verrouillée | Same + confirmed BEFORE work | YES with proof | NO (unless theft) |
| C: Common building | Syndic authorization | Only with syndic | NO (standard) |
| D: Rental — opening | Tenant bail + CIN | YES | NO |
| D: Rental — lock change | Owner authorization | Only with owner consent | NO |
| E: Post-effraction | Occupant proof + Police PV first | After PV only | YES — PV required |
| F: Vehicle | Carte grise or equivalent | YES with proof | NO (standard) |
| G: Coffre-fort | Ownership documentation | Only with documentation | Possible if disputed |
| H: Contested access | N/A | REFUSE | Advise parties |

---

## 5. Services Requiring DIAGNOSIS_FIRST

These services cannot be reliably standardized and require on-site assessment before any price commitment:

- **porte_blindee_ouverture** (verrouillée): Mechanism variability, tools required, destruction likelihood unknown before inspection
- **apres_effraction_securisation**: Damage extent unknown; police PV must be established first
- **voiture_ouverture (véhicule moderne)**: Electronic programming varies by vehicle model

For DIAGNOSIS_FIRST services:
- Artisan travels, assesses, then quotes
- No FIXEO standardized price for the intervention itself
- HORS PÉRIMÈTRE does not apply (price was never fixed)
- Artisan issues explicit quote before any work

---

## 6. Services Requiring QUOTE_REQUIRED

These services have too much variation for reliable standardization:

- **serrure_multipoints**: Mechanism brands, point counts, and prices vary too widely
- **cylindre_haute_securite**: Patented cylinders, security classes, and card systems vary widely
- **porte_blindee_installation**: Door product, security class, brand = total price variation 2500–12000 MAD
- **coffre_fort_ouverture**: Specialist service, mandatory authorization, total complexity unknown
- **voiture_ouverture (moderne/électronique)**: Programming equipment and fees vary
- **digicode_installation**: Product cost dominates; too much variation

---

## 7. Night / Weekend Policy (Evidence Only — Not Canonical)

**Phase 7B.5.1 preserves night/weekend evidence but does NOT set a canonical modifier.**

Evidence summary:
- Night window: **22h–7h** (consistent across sources)
- Surcharge range: **30–50%** (mano.ma) to **50–100%** (allo-maison)
- Conservative anchor: **50%**

Illustrative impact of 50% modifier (for analysis, not production):

| Service | Day Price | Night @50% |
|---------|-----------|-----------|
| porte_claquee | 220 MAD | 330 MAD |
| porte_claquee_blindee | 350 MAD | 525 MAD |
| porte_verrouillee | 380 MAD | 570 MAD |
| cle_cassee | 220 MAD | 330 MAD |

These fall within the market evidence ranges. **But the modifier is null until explicit human calibration decision.**

---

## 8. What This Policy Does NOT Address

The following require separate future decisions:

1. Night/weekend canonical modifier (evidence strong, human decision required)
2. Serrurerie automobile as a separate FIXEO service category
3. Coffre-fort as a managed FIXEO service (too high risk for open marketplace)
4. Digicode/smart lock installation (product landscape evolving)
5. Diagnostic/déplacement fee for DIAGNOSIS_FIRST services
6. Post-effraction damage repair pricing
7. Porte blindée installation pricing (supply chain and installer certification needed)

---

## 9. Relationship to Plumbing and Electricity Pricing

**Serrurerie is structurally different from plombing/electricity in two key ways:**

1. **No standalone diagnostic** — locksmith pricing is event-based, not inspection-based. The service type is stated by the client before the artisan travels. (Plumbing: diagnosis required before knowing if it's a simple vs. complex leak.)

2. **No diagnostic absorption doctrine** — since there is no separate diagnostic fee, the absorption question does not arise. Each FIXEO locksmith service is its own standalone billable event.

**Shared principles:**
- Parts always separate with disclosure protocol
- HORS PÉRIMÈTRE escalation applies
- Dual-fairness principle applies
- Artisan floor applies

---

*This document is a research draft. All prices are pending human approval. No production deployment.*
