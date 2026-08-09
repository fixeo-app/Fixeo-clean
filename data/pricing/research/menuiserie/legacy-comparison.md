# FIXEO Menuiserie — Legacy Internal Values vs. External Evidence
## Phase 7B.10 — T0 Internal Legacy Audit

**Date:** 2026-08-09
**Status:** T0 classification only — no production files modified

---

## Legacy Sources Inspected

| File | Finding |
|------|---------|
| `js/fixeo-pricing-marocain.js` | Menuiserie range: `{ from: 150, to: 900 }`. Label: "À partir de 150 MAD". |
| `js/fixeo-estimation-engine-v1.js` | `simple: { from: 150, to: 350 }`, `medium: { from: 400, to: 1000 }`, `heavy: { from: 800, to: 3000 }`, `urgent: { from: 200, to: 500 }` |
| `js/fixeo-estimation-v2-hero.js` | Identical structure: `simple:{from:150,to:350}`, `medium:{from:400,to:1000}`, `heavy:{from:800,to:3000}`, `urgent:{from:200,to:500}` |
| `js/fixeo-profile-v2a.js` | Not yet searched in detail (not a primary pricing file) |

---

## T0 Classification Table

All values below are classified `T0_INTERNAL_LEGACY`. They were NOT used as external evidence during research.

| T0 Value | Source File(s) | Legacy Category | T0 Range (MAD) | External Evidence Range (MAD) | Classification | Notes |
|----------|---------------|-----------------|----------------|-------------------------------|----------------|-------|
| Menuiserie — range | fixeo-pricing-marocain.js | Global display | 150–900 | See below by service | **LEGACY_SCOPE_AMBIGUOUS** | Single range for an entire métier covering repair → custom fabrication. Scope undefined. Cannot evaluate fairly. |
| `simple` — réparation | estimation-engine-v1.js, v2-hero.js | Small repairs | 150–350 | No direct anchor found for standardized repair. Daily rate implies 150-250 MAD for 30-60 min work. | **LEGACY_TOO_LOW / LEGACY_SCOPE_AMBIGUOUS** | 150-350 may capture labour component of small repair, but no external Moroccan source confirms this range for menuiserie repairs specifically. Menuiserie tool burden is higher than simple handyman work. 150 MAD is likely too low once travel + tools considered. |
| `medium` — installation | estimation-engine-v1.js, v2-hero.js | Installation | 400–1000 | Labour-only door install: 300-700 MAD (2 C/C+ sources). All-in door 800-2,200 MAD depending on material. | **LEGACY_SCOPE_AMBIGUOUS** | Range of 400-1,000 could apply to labour-only install, but upper end (1,000) is well below all-in door installation for any door except cheapest mélaminé. Scope between labour-only and all-in is not specified. |
| `heavy` — sur mesure | estimation-engine-v1.js, v2-hero.js | Custom fabrication | 800–3000 | Custom fabrication: placard 2,000-9,000 MAD/ml, cuisine 3,500-18,000 MAD/ml, porte bois massif 1,800-8,000+ MAD. | **LEGACY_TOO_LOW / LEGACY_ARCHITECTURE_WRONG** | Heavy max of 3,000 MAD is deeply insufficient for custom placard (min 2,000/ml) or cuisine (min 3,500/ml). Architecture applies a single heavy bucket to what should be QUOTE_REQUIRED for all custom fabrication. |
| `urgent` — menuiserie | estimation-engine-v1.js, v2-hero.js | Urgency | 200–500 | External evidence: AllohRayfi states same price evening/weekend. No Moroccan menuiserie urgency premium documented. | **LEGACY_NO_EXTERNAL_SUPPORT** | No external evidence supports an urgency modifier for menuiserie repairs. AllohRayfi explicitly states same price. Research policy: all urgency/time modifiers remain null. |

---

## Summary Assessment

| Assessment Dimension | Verdict |
|----------------------|---------|
| Architecture correctness | **WRONG** — single simple/medium/heavy bucket cannot accommodate menuiserie's range from 5-minute screw tightening to 80,000+ MAD kitchen |
| Lower bound (150 MAD) | **TOO LOW** — menuiserie minimum visit warrants higher floor than handyman (tool burden, skill premium, specialist equipment) |
| Upper bound (3,000 MAD heavy) | **CRITICALLY TOO LOW** — leaves all custom fabrication unbounded; a placard at 2,000-6,000 MAD/ml would overflow this cap on first unit |
| Urgency modifier | **NO EXTERNAL SUPPORT** — platform evidence contradicts it for petits travaux context |
| Scope definition | **ABSENT** — no distinction between repair, labour-only installation, and custom fabrication |
| Repair vs fabrication separation | **ABSENT** — mixed into undifferentiated complexity buckets |
| Hardware policy | **ABSENT** — no LABOUR_FIXED_PART_SEPARATE architecture |
| Material type | **ABSENT** — no differentiation between mélaminé, MDF laqué, bois massif |

---

## Conclusion

The legacy FIXEO Menuiserie pricing architecture is **LEGACY_ARCHITECTURE_WRONG** for all custom fabrication and **LEGACY_SCOPE_AMBIGUOUS** for all repair services. The T0 values are retained as historical context only. They are not used in V0.1 research anchors.

The research phase recommends a complete architecture rebuild for menuiserie, separating:
1. Minimum intervention (FLAT_INTERVENTION)
2. Standardized small repairs (CONDITIONAL_FIXED, LABOUR_FIXED_PART_SEPARATE)
3. Labour-only installation (CONDITIONAL_FIXED by door type)
4. Custom fabrication (QUOTE_REQUIRED, with per-ml reference ranges documented for future calibration)
