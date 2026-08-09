# FIXEO Bricolage — Research Phase 7B.7

## Status

```
PHASE: 7B.7
METIER: BRICOLAGE
STATUS: RESEARCH_ONLY
MATURITY: LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION
production_ready: false
human_decision: PENDING
```

---

## What This Directory Contains

Independent Moroccan market research for the BRICOLAGE / handyman métier.

These artifacts prepare evidence for a later human calibration phase (7B.7.1).

No price is approved. No price is production-ready.

---

## Files

| File | Purpose |
|------|---------|
| `registry.v0.1.json` | Normalized service taxonomy, pricing architecture candidates, service codes |
| `sources.v0.1.json` | Source inventory with quality grades |
| `evidence.v0.1.json` | Observed price evidence per service family |
| `exclusions.v0.1.json` | Métier boundary doctrine, substrate matrix, pre-screening questions |
| `legacy-comparison.md` | Comparison of legacy FIXEO bricolage values vs external evidence |
| `README.md` | This file |
| `validate.js` | Deterministic validator — run with `node validate.js` |

---

## Key Findings Summary

### Pricing Architecture

Bricolage cannot use a single pricing architecture. Evidence identifies:

| Architecture | Use Case | Evidence |
|---|---|---|
| MINIMUM_VISIT_PRICE | Any standalone visit | 150–200 MAD anchor |
| PER_ITEM_FORFAIT | Shelf, mirror, curtain rod, small furniture | Kitea 200 MAD anchor |
| FIRST_ITEM + ADDITIONAL | Multi-task with shared travel | Half-day model evidence |
| HALF_DAY | Batched task lists (5+ tasks, 3–4h) | 300–550 MAD range |
| HOURLY | Open-ended/heterogeneous work | 100–180 MAD/h, 2h min |
| CONDITIONAL_FIXED | TV mounting, large furniture, adjustments | 200–400 MAD base |
| LABOUR_FIXED_PART_SEPARATE | Hardware always client-supplied | Market standard |
| QUOTE_REQUIRED | Complex TV install, riad, IKEA kitchen | Always |

### Key Market Anchors

| Service | Market Anchor (MAD) | Source | Confidence |
|---------|---------------------|--------|-----------|
| Minimum visit / call-out | 150–200 | Allo-Maison / Adom.ma | MEDIUM |
| Hourly rate | 100–180 (anchor 130) | Allo-Maison | MEDIUM |
| Half-day (3–4h) | 300–550 (anchor 400) | Allo-Maison | MEDIUM |
| Meuble assembly (small) | 150–300 (anchor 200) | Kitea + Allo-Maison | MEDIUM |
| TV wall mount standard | 200–400 (anchor 300) | m3allempro (89 reviews) | MEDIUM |

### Métier Boundaries (Summary)

- **ELECTRICITE**: Any electrical outlet/switch/luminaire wiring work
- **PLOMBERIE**: Any pipe work, hot water, drainage modification
- **SERRURERIE**: Any lock cylinder, security mechanism
- **MENUISERIE**: Custom fabrication, structural carpentry
- **MAÇONNERIE**: Load-bearing walls, structural drilling
- **PEINTURE**: Any wall painting
- **CARRELAGE**: Tile laying, grouting

### Critical Economics

A 20-minute task still consumes an artisan's full slot (travel + setup + work + return). At 3–4 slots/day, a minimum billable of 150–200 MAD is economically necessary, not abusive.

Multi-task visits batched into a half-day are 50% cheaper than 4–5 separate visits.

---

## Prior Métier Integrity

Prior frozen métier research is NOT modified by this phase:

- `data/pricing/research/plomberie/` — INTACT
- `data/pricing/research/electricite/` — INTACT
- `data/pricing/research/serrurerie/` — INTACT
- `data/pricing/research/climatisation/` — INTACT

---

## Validation

```bash
node data/pricing/research/bricolage/validate.js
```

Expected: all PASS, 0 FAIL.

---

## Next Step

**Phase 7B.7.1** — Human Calibration

Services recommended for human calibration (good candidates):
- BRIC-001 Minimum visit price
- BRIC-002 Hourly rate
- BRIC-003 Half-day rate
- BRIC-010 Small furniture assembly
- BRIC-030 TV wall mounting standard
- BRIC-020 Shelf installation
- BRIC-070 Multi-task visit architecture decision

Services NOT recommended for fixed pricing (batch/hourly instead):
- BRIC-021 Curtain rod (insufficient evidence; group in multi-task)
- BRIC-022 Mirror (insufficient evidence; group in multi-task)
- BRIC-023 Frame hanging (too small; add-on only)
- BRIC-060 Silicone (too variable; add-on only)

Services that must remain QUOTE_REQUIRED:
- BRIC-031 Complex TV install
- BRIC-X012 IKEA kitchen
- Any riad-context work

---

*Created: Phase 7B.7 — 2026-08-09*  
*Disclaimer: Prix indicatif FIXEO — tarif réel confirmé avec l'artisan avant intervention.*
