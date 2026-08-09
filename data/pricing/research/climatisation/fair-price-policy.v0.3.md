# FIXEO Climatisation — Fair Price Policy
## Phase 7B.6.2 — Human Price Decision Freeze

**Status:** HUMAN_PRICE_DECISION_FREEZE — RESEARCH ARTIFACT ONLY — NOT PRODUCTION  
**Date:** 2026-08-09  
**All prices:** Daytime base only  
**Night/weekend/urgency modifiers:** null (not approved)  
**City multipliers:** null  
**production_ready:** false on all services

---

## 1. Core Pricing Architecture

### 1.1 Dual-Fairness Principle

All FIXEO climatisation prices are calibrated to simultaneously protect:

1. **The client** — from arbitrary overpricing, undefined scope, hidden costs, and unsafe practices (blind gas recharge, skipped vacuum, refrigerant venting)
2. **The artisan** — from economically unsustainable underpricing that incentivizes cutting corners on technical procedures

The dual-fairness test is applied at each price point: minimum artisan net must meet or exceed the climatisation target economic floor across all standard commission and fuel scenarios.

### 1.2 Price Provenance

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

**These prices are:**
- Human-calibrated reference prices
- Based on Moroccan market research (documented in sources.v0.1.json, evidence.v0.1.json)
- Standardized scope definitions reviewed and approved by human
- Dual-fairness economic analysis (client + artisan)

**These prices are NOT:**
- AI-generated prices
- ML predictions
- Official Moroccan tariffs
- Regulated prices
- Artisan-declared prices
- FIXEO transaction medians
- Statistically proven national medians

### 1.3 Mandatory Client Disclaimer

```
Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.
```

---

## 2. Approved Price Schedule (Phase 7B.6.2)

| Service Code | Service | Architecture | Approved Price | Unit |
|---|---|---|---|---|
| CLIM-002 | Diagnostic climatisation + déplacement | FIXED | **250 MAD** | Par intervention |
| CLIM-003 | Entretien annuel standard | FIXED_PER_AC_UNIT | **300 MAD** | Par unité intérieure |
| CLIM-004 | Nettoyage profond intérieur + extérieur | FIXED_PER_AC_UNIT | **450 MAD** | Par système (int + ext) |
| CLIM-009 | Débouchage évacuation condensats | FIXED | **250 MAD** | Par intervention |
| CLIM-013 | Réparation fuite frigorifique accessible | CONDITIONAL_FIXED | **600 MAD** | Par intervention — main d'œuvre uniquement |
| CLIM-020 | Installation mono-split ≤3m cuivre incluse | CONDITIONAL_FIXED | **1 000 MAD** | Par installation |
| CLIM-021 | Installation mono-split ≤5m cuivre incluse | CONDITIONAL_FIXED | **1 200 MAD** | Par installation |
| CLIM-030 | Démontage split (pump-down + dépose) | FIXED | **550 MAD** | Par système |

All: `human_decision = APPROVED`, `production_ready = false`

---

## 3. Universal Price Inclusions

**Included in ALL approved prices:**
- Labour specific to the defined scope
- Artisan travel (déplacement) — first unit or first intervention
- Standard consumables where applicable

**NEVER silently included in any price:**
- The AC unit / climatiseur — always client-supplied
- Refrigerant — always separately billed, never bundled
- Replacement parts (capacitor, PCB, motor, compressor) — always separately quoted and client-approved
- Extra copper beyond included length
- Difficult access equipment (ladder, scaffolding)
- Electrical panel / breaker work

---

## 4. Diagnostic Policy

### 4.1 CLIM-002 — 250 MAD

### 4.2 Diagnostic Absorption Rule

**Classification:** FIXEO_POLICY (not universal Moroccan market practice)

```
Diagnostic fee: 250 MAD

If client accepts a qualifying standardized FIXEO repair SAME VISIT:
→ Diagnostic fee is deducted from the standardized repair price.
→ Client pays: [repair price] only (diagnostic absorbed).

If no qualifying repair is accepted or completed same visit:
→ 250 MAD diagnostic is due in full.
```

**The 250 MAD remains payable when:**

| Condition | Diagnostic due? |
|---|---|
| No repair performed | ✅ 250 MAD due |
| Client declines repair | ✅ 250 MAD due |
| Repair is out-of-scope | ✅ 250 MAD due |
| Specialist investigation required | ✅ 250 MAD due |
| Diagnosis inconclusive | ✅ 250 MAD due |
| Return visit necessary | ✅ 250 MAD due |
| Parts unavailable, no qualifying repair same visit | ✅ 250 MAD due |
| Qualifying standardized repair accepted + completed same visit | ❌ 250 MAD absorbed |

**Client protection:** A client must never be charged 250 MAD diagnostic + full standardized repair price when the same-visit absorption rule applies.

### 4.3 Services Requiring Prior Diagnosis (DIAGNOSIS_FIRST)

These services cannot offer a fixed price without prior diagnostic confirmation:

| Service | Why |
|---|---|
| CLIM-006 Panne quelconque | Root cause unknown |
| CLIM-008 Détection fuite | Fuite location must be confirmed |
| CLIM-013 Réparation fuite | Leak must be confirmed accessible before commencing |
| CLIM-019 Compresseur | Part viability must be confirmed |

---

## 5. Standard Maintenance vs Deep Clean

### 5.1 CLIM-003 Standard Maintenance — 300 MAD/unité

**Scope: Indoor unit only**

| Element | Included |
|---|---|
| Travel | ✅ |
| Filter cleaning (remove, clean, dry, reinstall) | ✅ |
| Accessible evaporator cleaning | ✅ |
| Condensate pan check + light clearing | ✅ |
| Condensate drain check | ✅ |
| Functional test post-clean | ✅ |
| Standard cleaning consumables | ✅ |
| Outdoor condenseur | **❌ EXCLUDED** |
| High-pressure cleaning | ❌ |
| Turbine/blower | ❌ |
| Disinfectant treatment | ❌ |
| Refrigerant, repairs, parts | ❌ |

*Typical duration: 45–60 min per indoor unit. Travel included for first unit.*

### 5.2 CLIM-004 Deep Clean — 450 MAD/unité

**Scope: Complete system (indoor + outdoor unit)**

| Element | Included |
|---|---|
| Travel | ✅ |
| Partial indoor unit disassembly for access | ✅ |
| Turbine/blower cleaning | ✅ |
| Full evaporator high-pressure cleaning | ✅ |
| Disinfectant foam treatment | ✅ |
| Full condensate pan clean | ✅ |
| Condensate drain cleaning | ✅ |
| **Outdoor condenseur high-pressure cleaning** | **✅** |
| Outdoor ventilation verification | ✅ |
| Performance test (≥10 min cooling cycle) | ✅ |
| Technical foam + disinfectant products | ✅ |
| Refrigerant, repairs, parts | ❌ |
| Outdoor unit inaccessible → | HORS PÉRIMÈTRE |

*Typical duration: 90–120 min per system. Travel included for first unit.*

### 5.3 The Distinction

**CLIM-003 = indoor unit only** (filter, accessible evaporator, drain check)  
**CLIM-004 = full system** (turbine, evaporator deep, outdoor condenseur, disinfectant)

This distinction must be communicated explicitly before commencing either service. If client expects outdoor cleaning → CLIM-004 only.

---

## 6. Condensate Blockage — CLIM-009 (250 MAD)

Standard scope:
- One residential split
- Accessible condensate drain
- Simple blockage (debris, mould, kink)
- No pump replacement
- No concealed structural drainage work

If blockage reveals failed condensate pump, inaccessible concealed drain, or structural drainage issue → HORS PÉRIMÈTRE → new quote required.

---

## 7. Accessible Leak Repair — CLIM-013 (600 MAD Labour Only)

### 7.1 Architecture

CONDITIONAL_FIXED. The fixed price applies only when the leak is confirmed accessible before work commences. Artisan must inspect and confirm accessibility before quoting 600 MAD.

### 7.2 Scope

**Included:** Travel, labour (brazing), brazing consumables (rods, flux), nitrogen for pressure test, protection materials.

**Excluded:**
- Refrigerant — ALWAYS separately billed
- Vacuum procedure — ALWAYS separately billed (CLIM-014)
- Inaccessible piping
- Copper section replacement
- Compressor / evaporator / condenser leaks
- Structural opening

### 7.3 Critical Price Semantics

**600 MAD = LABOUR ONLY**

This price must NEVER be presented as:
- "Leak repair + gas recharge"
- "All-inclusive refrigerant service"
- "Full repair"

After a successful accessible leak repair:
1. Artisan informs client: system is now leak-tight
2. Artisan informs client: vacuum procedure + refrigerant recharge required to restart the system
3. These are separate services, separately quoted, requiring explicit client approval
4. Artisan must not recharge without client approval and separate billing

---

## 8. Installation Contracts

### 8.1 CLIM-020 — Installation Mono-Split ≤3m (1 000 MAD)

**The AC unit is ALWAYS client-supplied and NEVER included in this price.**

#### Required Conditions (all must be true for fixed price to apply)

1. Standard residential mono-split 7,000–24,000 BTU — client-supplied
2. Indoor unit at standard height ≤2.5m from floor
3. Outdoor unit on standard wall bracket on accessible balcony/terrace/ground
4. Copper run distance: ≤3 linear metres
5. One standard wall drilling (≤25cm thickness)
6. No ladder or scaffolding required
7. Electrical supply ≤2m available — panel/breaker work excluded

#### What is Included at 1 000 MAD

| Element | Specification |
|---|---|
| Labour | Indoor + outdoor unit mounting |
| Travel | Included |
| Wall bracket | 1× standard galvanized console |
| Copper line set | ≤3 linear metres (tube + armaflex insulation) |
| Inter-unit cable | Standard, ≤3m |
| Condensate drain | ≤3m to accessible drain |
| Wall drilling | 1× standard |
| Vacuum procedure | Minimum 30 min — MANDATORY |
| Commissioning | Functional test cooling cycle + temperature check |
| Consumables | Screws, anchors, glands, sealant |

#### What is Never Included

| Element | Note |
|---|---|
| **AC unit** | **ALWAYS CLIENT — NEVER IN THIS PRICE** |
| Extra copper > 3m | CLIM-025 per metre (pending calibration) |
| Second drilling | Additional item |
| Thick reinforced concrete | DEVIS |
| Electrical panel work | CLIM-029 or electrician |
| Scaffold/ladder access | DEVIS |
| Height > 2.5m indoor | DEVIS |
| False ceiling routing | DEVIS |
| Decorative trunking | Additional item |
| Condensate pump | Additional item |
| Old AC removal | CLIM-030 separate |
| Multi-split, cassette, ducted | Different service category |

#### Installation Decision Tree

```
INSTALLATION REQUEST
        │
        ▼
Client supplies AC unit?
   YES → Continue    NO → HORS PÉRIMÈTRE → equipment quote required
        │
        ▼
Copper run ≤3m?
   YES → CLIM-020 (1,000 MAD)
   3–5m → CLIM-021 (1,200 MAD)
   >5m → CLIM-021 + CLIM-025 per extra metre
        │
        ▼
All standard conditions met?
   YES → Proceed at fixed price
   NO → Identify escape condition → HORS PÉRIMÈTRE → quote
```

### 8.2 CLIM-021 — Installation Mono-Split ≤5m (1 200 MAD)

Identical to CLIM-020 in every aspect except: copper line set included is extended to **≤5 linear metres**.

**The 200 MAD delta (1 000 → 1 200) reflects:**
- 2 extra metres of copper tube + insulation: approximately 120–160 MAD material
- Additional 20–30 min labour: approximately 50–80 MAD equivalent
- Total justified delta: 170–240 MAD → 200 MAD approved

**The AC unit is ALWAYS client-supplied — never included.**

**No per-metre formula is created in this phase.** Copper beyond 5m remains outside standardized pilot scope until CLIM-025 receives dedicated human calibration.

### 8.3 Vacuum Procedure (Mandatory for All Installations)

The vacuum procedure (tirage au vide) is not optional. It is:
- Required before commissioning every installation
- A minimum 30-minute procedure at -1 bar
- Included in both CLIM-020 and CLIM-021 at no extra charge

An installation without vacuum procedure does not meet FIXEO standards. Any artisan skipping the vacuum to save time is not eligible for the standardized fixed price.

---

## 9. Dismantling — CLIM-030 (550 MAD)

### 9.1 Pump-Down Mandatory

The pump-down procedure is mandatory for all CLIM-030 dismantlings:
1. Connect manifold gauge set
2. Close liquid service valve (low-pressure side)
3. Run compressor in cooling mode — refrigerant forced into outdoor unit
4. When suction pressure approaches atmospheric, close gas service valve
5. Stop compressor immediately
6. Refrigerant trapped in outdoor unit — can be safely transported

### 9.2 Refrigerant Venting Prohibition

Intentional refrigerant venting is prohibited as a FIXEO standard practice. It is:
- Contrary to Morocco's international obligations under the Montreal Protocol
- Commercially irresponsible
- An immediate disqualification from FIXEO network membership

If the compressor is inoperable (preventing standard pump-down), the artisan must:
1. Inform the client of the situation
2. Document the state of the system
3. Handle via a separate specialist refrigerant recovery procedure
4. Not proceed with normal venting

### 9.3 Scope

**Included:** Travel, pump-down, valve isolation, refrigerant line disconnection, indoor unit removal, outdoor unit removal, wall passage sealing, minor consumables.

**Excluded:** Unit transport/disposal, reinstallation, wall repair, difficult height access, multi-split full dismantling (DEVIS).

---

## 10. Refrigeration Integrity Doctrine

### 10.1 The Mandatory Sequence

```
1. DIAGNOSE
   ↓
2. PRESSURE / SYSTEM CHECK
   ↓
3. LEAK DETECTION (when indicated by low pressure)
   ↓
4. REPAIR LEAK (accessible → CLIM-013 | inaccessible → DEVIS)
   ↓
5. VACUUM (OBLIGATOIRE avant toute recharge — CLIM-014)
   ↓
6. CORRECT REFRIGERANT CHARGE (type + quantity per manufacturer spec)
   Approbation client requise + facturation séparée (CLIM-010/011/012)
   ↓
7. FUNCTIONAL TEST
```

### 10.2 Prohibited Practices

| Practice | Prohibition Level |
|---|---|
| Blind top-up without diagnosis | ABSOLUTE — immediate disqualification |
| Repeated recharge without fixing known leak | ABSOLUTE |
| Recharge without vacuum | ABSOLUTE |
| Mixing incompatible refrigerants | ABSOLUTE |
| Intentional refrigerant venting | ABSOLUTE |
| R22 recharge without replacement advisory | PROHIBITED — advisory is mandatory |

### 10.3 R22 Advisory (Mandatory for R22 Services)

When servicing any R22 system, the artisan must communicate:

> *"Votre climatiseur utilise le réfrigérant R22, en cours de suppression progressive au titre du Protocole de Montréal. La recharge R22 est une solution temporaire uniquement. Nous vous recommandons de planifier le remplacement de votre système lors de votre prochaine décision d'investissement."*

*Note: This advisory is based on Morocco's phase-out schedule under the Montreal Protocol. FIXEO makes no specific legal claims about enforcement mechanisms or mandatory certification requirements without a verified regulatory source.*

### 10.4 R32 Safety Note (Mandatory for R32 Services)

> *"Le réfrigérant R32 est classifié A2L (légèrement inflammable). Les interventions sur ce système doivent être réalisées avec un équipement adapté et à l'écart de toute source d'ignition."*

*Note: FIXEO makes no unsupported claims about mandatory Moroccan certification requirements for R32 handling without a verified regulatory source.*

### 10.5 Refrigerant Pricing Status

**Not approved in Phase 7B.6.2.** The following remain future calibration subjects:

- R410A recharge (complete / partial)
- R32 recharge (complete / partial)
- R22 recharge (complete / partial)
- Vacuum standalone service
- Leak detection standalone service
- Combined leak-repair + recharge bundles

No refrigerant price may be silently bundled into the eight approved pilot prices.

---

## 11. Component / Hardware Policy

The following services remain PART_SEPARATE or QUOTE_REQUIRED until separately calibrated:

| Component | Policy |
|---|---|
| Condensateur | LABOUR_FIXED_PART_SEPARATE — part price too variable |
| PCB / carte électronique | LABOUR_FIXED_PART_SEPARATE |
| Moteur ventilateur | LABOUR_FIXED_PART_SEPARATE |
| Compresseur | QUOTE_REQUIRED — always |
| Pompe de relevage condensats | QUOTE_REQUIRED or PART_SEPARATE |
| Filtre de remplacement | PART_SEPARATE — charged separately if needed during CLIM-003/004 |

For all part replacements: identify part → state price explicitly → obtain client approval → install → provide receipt.

---

## 12. HORS PÉRIMÈTRE Workflow

```
1. STOP immediately when escape condition is identified
2. IDENTIFY the objective condition precisely
3. EXPLAIN clearly to the client in understandable terms
4. DECLARE explicitly: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE what additional scope or cost is needed
6. OBTAIN explicit client approval before continuing
7. CONTINUE only after approval

RULE: The original standardized FIXEO price must NEVER silently increase.
Only the additional approved scope may be added.
```

**Common escape conditions by service:**

| Service | Common Escapes |
|---|---|
| CLIM-002 | Dismantling for diagnostic access; multi-split; cassette/gainable |
| CLIM-003 | Height > 2.5m; filter replacement needed; refrigerant issue found |
| CLIM-004 | Condenseur inaccessible; corroded evaporator; cassette/gainable |
| CLIM-009 | Pump failure; concealed drain; structural drainage issue |
| CLIM-013 | Leak inaccessible; compressor leak; R32 without proper equipment |
| CLIM-020/021 | Run > scope length; scaffold needed; thick concrete; panel work |
| CLIM-030 | Scaffold needed; multi-split full dismantling |

---

## 13. Economic Floor Doctrine

### Universal Hard Floor: 100 MAD

No FIXEO artisan net income may fall below 100 MAD under any combination of standard commission rate and standard fuel cost scenario. This is the absolute FIXEO viability floor across all métiers.

### Climatisation Target Floor: 150 MAD

FIXEO human-calibrated economic policy target specific to the climatisation métier.

**Basis for higher target:**
- Specialist tool investment (manifold gauge set, vacuum pump, pressure washer, brazing torch)
- Tool transport burden (heavy equipment per call-out)
- Higher technical skill and certification requirements
- Longer average intervention duration
- Refrigeration procedure compliance (vacuum, pressure test)
- Safety and environmental responsibility

**Semantic precision:**
This 150 MAD target is **FIXEO_TECHNICAL_POLICY**, not a statistically established Moroccan artisan cost floor. No specific Moroccan artisan cost data was used to derive this figure. It is a human-calibrated judgment of appropriate minimum compensation for specialist technical work in this métier.

---

## 14. Geographic and Time Policy

```
market_scope = NATIONAL_MOROCCO
city_adjustment = null
urgency_modifier = null
night_modifier = null
weekend_modifier = null
holiday_modifier = null
express_modifier = null
```

No city multipliers. No time-based modifiers. All prices are daytime base, national Morocco reference. These settings require separate human approval before any activation.

---

## 15. What FIXEO Does NOT Claim

| Claim | Status |
|---|---|
| These are AI-generated prices | FALSE |
| These are statistically proven market medians | FALSE |
| These are official Moroccan tariffs | FALSE |
| These are regulated tariffs | FALSE |
| These are guaranteed final prices | FALSE — indicative, confirmed with artisan before intervention |
| R22 handling requires specific Moroccan certification | UNVERIFIED — FIXEO makes no specific legal claims without verified source |
| R32 handling requires specific Moroccan certification | UNVERIFIED — FIXEO makes no specific legal claims without verified source |
| These prices are production-ready | FALSE — pending production activation decision |

---

## 16. Deferred Services (Not in Phase 7B.6.2)

| Category | Services | Status |
|---|---|---|
| Refrigerant pricing | CLIM-010/011/012/014/015 | Future calibration |
| Leak detection | CLIM-008 | Future calibration |
| Component replacement | CLIM-016/017/018/019 | Future calibration |
| Special installation | CLIM-022/023/024 | Future calibration |
| Add-ons | CLIM-025/026/027/028/029 | Linked to installation approval |
| Relocation | CLIM-031 | Requires CLIM-030 approval first |
| Maintenance contract | CLIM-032 | B2B pricing framework |
| Urgency pricing | CLIM-033 | Policy frozen, modifier = null |
| Generic fault/leak | CLIM-034/035 | Subsumed by CLIM-006 + specific repairs |

---

*This document is a Phase 7B.6.2 policy freeze for research purposes. No prices are active in any production system. All values require a separate explicit production activation decision with appropriate technical integration and testing.*
