# FIXEO Serrurerie — Market Research
## Phase 7B.5

**Status:** RESEARCH_V0 — NOT PRODUCTION  
**Date:** 2026-08-09  
**Maturity:** LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION  
**Provenance:** FIXEO_HUMAN_CALIBRATED_PILOT (pending)

---

## What This Is

This directory contains the complete market research artifacts for FIXEO serrurerie pricing.  
It is the output of Phase 7B.5 of the FIXEO Fair Price Program.

**Nothing in this directory is deployed to production. Do not import these files.**

---

## Files

| File | Description |
|------|-------------|
| `sources.v0.1.json` | Source registry — all external sources with quality grades |
| `evidence.v0.1.json` | Per-service evidence matrix — price ranges, sources, confidence |
| `exclusions.v0.1.json` | Scope exclusions, HORS PÉRIMÈTRE triggers, authorization doctrine |
| `registry.v0.1.json` | Research-only price registry (NOT for production) |
| `legacy-comparison.md` | Comparison of research evidence vs. existing FIXEO prices |
| `validate.js` | Validation script — run `node validate.js` to check artifacts |
| `README.md` | This file |

---

## Key Findings Summary

### Market Structure
- Moroccan locksmith market is intervention-based, not diagnostic-fee-based
- Night surcharge (22h–7h) is real, expected, and market-normalized at ~50%
- Parts always billed separately from labour+travel in honest market practice
- No official certification system for locksmiths in Morocco

### Confirmed Price Ranges (research, not canonical)

| Service | Day Range (MAD) | Night Range (MAD) | Mode |
|---------|----------------|------------------|------|
| Porte claquée ouverture | 150–300 | 250–500 | FIXED |
| Porte claquée blindée | 250–400 | 350–600 | CONDITIONAL_FIXED |
| Porte verrouillée ouverture | 300–450 | 450–650 | CONDITIONAL_FIXED |
| Clé cassée extraction | 150–300 | 250–450 | CONDITIONAL_FIXED |
| Cylindre remplacement standard | 200–500 | — | UNIT_BASED |
| Serrure monopoint remplacement | 400–700 | — | CONDITIONAL_FIXED |
| Serrure multipoints | 700–2000 | — | QUOTE_REQUIRED |
| Porte blindée ouverture | 400–1500 | — | DIAGNOSIS_FIRST |
| Porte blindée installation | 2500–12000 | — | QUOTE_REQUIRED |

### Services That Must Remain DIAGNOSIS_FIRST or QUOTE_REQUIRED
- Porte blindée verrouillée
- Serrure multipoints replacement
- Cylindre haute sécurité
- Coffre-fort ouverture (+ mandatory ownership proof)
- Voiture moderne (electronic key)
- Post-effraction securisation
- Digicode / smart lock installation
- Porte blindée installation

### Authorization Doctrine (Research Draft)
Authorization verification before opening ANY property is mandatory.  
Full doctrine in `exclusions.v0.1.json` → `authorization_doctrine`.

### Legacy Price Issues Identified
1. "Changement serrure 200–450 MAD" is too low — likely confuses cylindre with full lock
2. "Urgence serrurerie 200–450 MAD" is too low for night rates
3. SEO text blends porte claquée + verrouillée without label distinction
4. Blindage lower bound (1500 MAD) is unrealistic for full porte blindée installation

---

## What Happens Next

This research requires **human calibration** before any price can be frozen.

The next phase will:
1. Human reviews evidence matrix and research reference prices
2. Decides which services become FIXEO fixed-price pilots
3. Decides night surcharge canonical modifier (if any)
4. Decides diagnostic/call-out doctrine for locksmith
5. Freezes approved prices in `calibration.v0.x.json` and `human-decision.v0.x.md`

**Do not deploy. Do not modify production files. Do not run data migrations.**

---

## Running the Validator

```bash
cd /path/to/fixeo-clean
node data/pricing/research/serrurerie/validate.js
```

Expected output: `✓ VALIDATION PASSED`

---

## FIXEO Dual Fairness Principle

All research is conducted under the canonical principle:

> A FIXEO price is acceptable only if it simultaneously protects:
> 1. the client from arbitrary overpricing
> 2. the artisan from economically unsustainable underpricing

Artisan floor analyses are in `registry.v0.1.json` → `artisan_floor_analysis`.
