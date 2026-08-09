# FIXEO Serrurerie — Human Price Decision
## Phase 7B.5.2 — Frozen Pilot Prices

**Status:** HUMAN_APPROVED — NOT PRODUCTION  
**Date:** 2026-08-09  
**Production ready:** NO  
**Night/weekend modifiers:** null — not approved  
**City multipliers:** null  

---

## Frozen Human-Approved Prices

### 1. serrurerie.porte_claquee_ouverture
```
Approved price:     220 MAD
Architecture:       FIXED
Price includes:     Labour (non-destructive opening) + travel
Price excludes:     All hardware replacement
```

### 2. serrurerie.porte_claquee_blindee_ouverture
```
Approved price:     350 MAD
Architecture:       CONDITIONAL_FIXED
Condition:          Armoured/security door confirmed on-site. CLAQUÉE only (not key-locked).
Price includes:     Labour (specialist opening) + travel
Price excludes:     All hardware replacement
```

### 3. serrurerie.porte_verrouillee_ouverture
```
Approved price:     380 MAD
Architecture:       CONDITIONAL_FIXED
Condition:          Standard non-armoured residential door. Keys genuinely lost or locked inside.
Price includes:     Labour (opening: picking or controlled drilling) + travel
Price excludes:     Cylinder replacement — always separate, always disclosed + approved first
```

### 4. serrurerie.cle_cassee_extraction
```
Approved price:     220 MAD
Architecture:       CONDITIONAL_FIXED
Condition:          Key fragment in standard cylinder. Cylinder not pre-damaged by DIY attempt.
Price includes:     Labour (extraction) + travel
Price excludes:     Cylinder replacement if damaged — always separate, always disclosed first
```

### 5. serrurerie.cylindre_remplacement_standard
```
Approved price:     280 MAD  ← LABOUR + TRAVEL ONLY
Architecture:       LABOUR_FIXED_PART_SEPARATE
Price includes:     Labour (cylinder removal + installation + test) + travel + standard screws
Price excludes:     Cylinder — always separate with full disclosure protocol
Client total:       280 MAD (labour) + disclosed cylinder price
```

### 6. serrurerie.serrure_remplacement_standard
```
Approved price:     400 MAD  ← LABOUR + TRAVEL ONLY
Architecture:       LABOUR_FIXED_PART_SEPARATE
Price includes:     Labour (full lock removal + installation + test + adjustment) + travel + standard screws
Price excludes:     Lock body — always separate with full disclosure protocol
Client total:       400 MAD (labour) + disclosed lock price
```

---

## Deferred Service

### 7. serrurerie.serrure_grippee_deblocage
```
Human decision:     DEFERRED
Approved price:     null
Architecture:       DIAGNOSIS_FIRST (current guidance)
```

**Reason for deferral:**
1. LOW evidence confidence — single source mention, not in either C+ source's main price table
2. Worst-case economics at 200 MAD research price: artisan net = 100 MAD exactly at floor (20%+HIGH), with zero buffer
3. Scope boundary (gripped vs. requires replacement) is too soft to enforce reliably without artisan training data

**Evidence required before reconsideration:**
- Minimum 3 independent credible Moroccan sources with stated price methodology, OR
- Minimum 10 normalized FIXEO completed missions from ≥3 distinct artisans, with artisan-confirmed service codes

**Current guidance for artisans:** If the lock is simply gripped (mechanism intact), quote the client directly before work — no FIXEO standardized price exists. If a cylinder replacement is ultimately needed, use `serrurerie.cylindre_remplacement_standard`.

---

## Hardware Doctrine — Frozen

```
FIXEO standardized serrurerie price =
LABOUR + TRAVEL + explicitly listed minor consumables only.

Major hardware is ALWAYS:
  1. Separate transaction
  2. Disclosed (brand, spec, price) before installation
  3. Client-approved before installation
  4. Old part returned to client where technically possible
```

No silent bundling. No undisclosed markup recovery. No moral hazard architecture.

---

## HORS PÉRIMÈTRE Protocol — Frozen

When scope exceeds the standardized intervention:

```
1. STOP work immediately
2. IDENTIFY the objective escape condition
3. EXPLAIN clearly: "Ce problème sort du cadre du tarif FIXEO standard"
4. DECLARE: "Cette intervention est HORS PÉRIMÈTRE PRIX FIXEO"
5. STATE any additional labour or hardware cost
6. OBTAIN explicit client approval
7. CONTINUE only after approval is confirmed
```

The original FIXEO price NEVER silently increases.

---

## Economic Floor — Confirmed

All 6 approved prices verified across 12 commission×fuel combinations (0%/10%/15%/20% × LOW/MID/HIGH):

| Service | Approved Price | Worst Net @20%+HIGH | Grade | Pass |
|---------|---------------|--------------------|----|------|
| porte_claquee | 220 MAD | 116 MAD | ACCEPTABLE | ✓ |
| porte_claquee_blindee | 350 MAD | 220 MAD | STRONG | ✓ |
| porte_verrouillee | 380 MAD | 244 MAD | STRONG | ✓ |
| cle_cassee | 220 MAD | 116 MAD | ACCEPTABLE | ✓ |
| cylindre (labour) | 280 MAD | 164 MAD | STRONG | ✓ |
| serrure (labour) | 400 MAD | 260 MAD | STRONG | ✓ |

**72 scenarios checked. 0 floor breaches.**

---

## Modifiers Status — All Frozen Null

| Modifier | Status | Evidence |
|----------|--------|----------|
| night_modifier | null — not approved | 30–50% (mano.ma) / 50–100% (allo-maison) — documented, deferred |
| weekend_modifier | null — not approved | Same as night per evidence |
| holiday_modifier | null — not approved | Same bracket |
| urgency_modifier | null — not approved | Implicit in night/weekend |
| city_multiplier | null — not approved | Geographic evidence documented; national scope maintained |

---

## Provenance — Frozen

```
price_provenance = FIXEO_HUMAN_CALIBRATED_PILOT
maturity         = LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
```

These prices are NOT:
- AI generated
- machine learning predictions  
- regulated Moroccan tariffs
- official prices
- artisan-declared prices
- FIXEO transaction medians

Required future client-facing disclaimer:
```
"Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention."
```

---

## What Is NOT Decided in This Phase

The following require separate future decisions:

| Topic | Status |
|-------|--------|
| Night/weekend canonical surcharge | Evidence documented — decision deferred |
| serrure_grippee | DEFERRED — evidence threshold defined |
| porte_blindee_ouverture pricing | DIAGNOSIS_FIRST confirmed — no fixed price |
| Vehicle locksmith | Separate calibration phase |
| Coffre-fort | Specialist authorization-first service — separate phase |
| Diagnostic/déplacement fee for DIAGNOSIS_FIRST | Deferred |
| Multipoints, haute sécurité, porte blindée installation | QUOTE_REQUIRED confirmed |
| pSEO price content update | Awaits production deployment decision |
| RAFI serrurerie integration | Awaits production deployment decision |
| reservation.js serrurerie update | Awaits production deployment decision |
| artisan profile cards serrurerie | Awaits production deployment decision |

---

*Phase 7B.5.2 — Frozen. All prices pending production deployment decision.*
