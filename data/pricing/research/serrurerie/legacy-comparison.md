# FIXEO Serrurerie — Legacy Price Comparison
## Phase 7B.5 — Research Only

**Status:** RESEARCH_V0_NOT_PRODUCTION  
**Date:** 2026-08-09  
**Do not modify production prices based on this document.**

---

## Legacy FIXEO Serrurerie Prices — Audit

The following prices were found in FIXEO production files before external research was conducted.

### Source: `js/fixeo-pricing-marocain.js`

```javascript
serrurerie: { from: 150, to: 400, label: 'À partir de 150 MAD', range: '150–400 MAD' }
```

**Classification:** SCOPE_MISMATCH  
**Verdict:** This is a single aggregate range for the entire serrurerie category. It does NOT reflect per-intervention pricing. It blends porte claquée (150 MAD floor) with serrure change (400+ MAD). Acceptable as a category summary, but misleading as a FIXEO price reference. Lower bound (150) is supported by evidence. Upper bound (400) is too low — multipoint locks reach 2000 MAD.

---

### Source: `js/reservation.js`

| Label | From | To | Classification |
|-------|------|----|---------------|
| Porte ou fenêtre bloquée | 150 | 350 | ACCEPTABLE — consistent with porte claquée evidence (150–300) |
| Porte bloquée | 150 | 350 | ACCEPTABLE |
| Ouverture de porte | 150 | 300 | ACCEPTABLE |
| Changement serrure | 200 | 450 | TOO_LOW — market evidence: 400–700 for standard lock replacement including part. 200–450 is cylinder-only range. Label is ambiguous. |
| Sécurisation porte | 300 | 700 | ACCEPTABLE as lower-end range for basic securing |
| Urgence serrurerie | 200 | 450 | TOO_LOW — urgency at night is 300–800 MAD range. This appears to be day-rate porte claquée range relabelled as urgence. |

---

### Source: `js/fixeo-profile-v2a.js`

| Label | From | To | Classification |
|-------|------|----|---------------|
| Porte ou fenêtre bloquée | 150 | 350 | ACCEPTABLE |
| Ouverture de porte | 150 | 300 | ACCEPTABLE |
| Porte bloquée | 150 | 350 | ACCEPTABLE |
| Changement serrure | 200 | 450 | TOO_LOW (same as reservation.js above) |
| Sécurisation porte | 300 | 700 | ACCEPTABLE |

**Note:** Profile card "Serrurerie: Dès 150 MAD" — acceptable as floor label only.

---

### Source: `scripts/generate-pseo-v2.js` — SEO pricing content

| Label | Range | Classification |
|-------|-------|---------------|
| Ouverture de porte (sans casse) | 300–600 MAD | ACCEPTABLE — this is the total possible range including various door types. Consistent with evidence. |
| Ouverture de porte (avec perçage) | 500–900 MAD | ACCEPTABLE — destructive opening + cylinder replacement scenario. Consistent. |
| Remplacement cylindre simple | 400–800 MAD | SLIGHTLY_HIGH — market shows 200–500. At 400–800 the upper is too high for a standard cylinder. Acceptable if read as high-quality cylinder. |
| Serrure 3 points / multipoints | 800–2000 MAD | ACCEPTABLE — evidence shows 700–2000. Close. |
| Blindage / sécurisation porte | 1500–5000 MAD | TOO_LOW at lower end — porte blindée installation is 2500–12000 MAD. 1500 MAD for full blindage is unrealistically low. May refer to partial reinforcement only. |

**Note:** SEO FAQ text states "ouverture de porte sans casse coûte généralement entre 300 et 600 MAD" — this is too high for porte claquée standard (evidence: 150–300 MAD). This appears to blend claquée + verrouillée scenarios. Needs label clarification.

---

### Source: `fixeo-local-oujda-price-flagship-v1.html`
Not analyzed for specific price values — this is a city SEO page, not a pricing source.

---

## Summary Classification Table

| Source | Service | Legacy Value | Classification | Market Evidence | Verdict |
|--------|---------|-------------|---------------|-----------------|---------|
| pricing-marocain.js | serrurerie (aggregate) | 150–400 MAD | SCOPE_MISMATCH | Category too wide | Replace with per-service after calibration |
| reservation.js | Ouverture de porte | 150–300 MAD | ACCEPTABLE | 150–300 ✓ | Keep |
| reservation.js | Changement serrure | 200–450 MAD | TOO_LOW | 400–700 for full lock | Clarify scope (cylindre vs serrure) |
| reservation.js | Urgence serrurerie | 200–450 MAD | TOO_LOW | Night = 300–800 | Needs night surcharge awareness |
| reservation.js | Sécurisation porte | 300–700 MAD | ACCEPTABLE | Partial reinforcement range | Keep with scope note |
| profile.js | Changement serrure | 200–450 MAD | TOO_LOW | Same as above | Same fix |
| pSEO | Ouverture sans casse | 300–600 MAD | ACCEPTABLE_BROAD | Porte verrouillée range, not claquée | Add label clarity |
| pSEO | Ouverture avec perçage | 500–900 MAD | ACCEPTABLE | ✓ | Keep |
| pSEO | Cylindre simple | 400–800 MAD | SLIGHTLY_HIGH | Evidence: 200–500 | Lower floor to 200 |
| pSEO | Multipoints | 800–2000 MAD | ACCEPTABLE | 700–2000 ✓ | Minor floor adjustment |
| pSEO | Blindage | 1500–5000 MAD | TOO_LOW | Full blindée: 2500–12000 | Add scope note (partial vs full) |

---

## Key Conclusions

1. **Core openings (porte claquée, extraction clé cassée)** legacy values are broadly consistent with evidence — 150–300 MAD range is solid.
2. **"Changement serrure" 200–450 MAD** is systematically too low across all sources. Market evidence shows 400–700 for standard lock + labour. The 200–450 range may be valid for **cylindre only** (not full serrure). This is a label/scope mismatch, not a gross error.
3. **Urgence serrurerie at 200–450 MAD** is wrong framing — urgency at night should be 300–800 MAD (50% surcharge on baseline).
4. **SEO text mixing claquée and verrouillée** under "ouverture sans casse 300–600" is misleading. Should be split: claquée 150–300, verrouillée 300–450.
5. **Blindage partial/full distinction** missing — needs scope clarification.

---

## Action for Human Calibration Phase

- Separate "changement cylindre" from "changement serrure complète" everywhere
- Fix urgence label and range to reflect night/day distinction
- Update SEO opening text to distinguish porte claquée vs verrouillée
- Clarify "sécurisation porte" scope (partial reinforcement vs full blindée)
- All changes: HUMAN CALIBRATION REQUIRED before production deployment

**PRODUCTION RUNTIME = 0 DIFF (this document is research only)**
