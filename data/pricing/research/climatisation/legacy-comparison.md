# Legacy FIXEO Climatisation Price Comparison
## Phase 7B.6 — Morocco Market Research

**Prepared:** 2026-08-09  
**Provenance:** T0 — Internal FIXEO legacy only  
**Status:** Comparison only — no production values modified  
**Doctrine:** T0 sources are never used to calibrate market truth. External market research was completed before this T0 comparison.

---

## Sources Audited

| Source File | Location | Clim Entries Found |
|---|---|---|
| `fixeo-estimation-engine-v1.js` | `js/fixeo-estimation-engine-v1.js` | 4 (category buckets) |
| `fixeo-estimation-v2-hero.js` | `js/fixeo-estimation-v2-hero.js` | 4 (category buckets, identical) |
| `fixeo-pricing-marocain.js` | `js/fixeo-pricing-marocain.js` | 1 (generic range) |
| `fixeo-profile-v2a.js` | `js/fixeo-profile-v2a.js` | 4 (service-level entries) |

---

## Source 1: `fixeo-estimation-engine-v1.js` and `fixeo-estimation-v2-hero.js`

Both files contain identical climatisation buckets:

```javascript
climatisation: {
  simple:  { from: 200, to: 400, label: 'Simple' },
  medium:  { from: 300, to: 700, label: 'Intermédiaire' },
  heavy:   { from: 500, to: 1200, label: 'Complexe' },
  urgent:  { from: 350, to: 750, label: 'Urgent' }
}
```

### Assessment

| Legacy Entry | Legacy Range (MAD) | Market Research Range | Assessment | Notes |
|---|---|---|---|---|
| Simple | 200–400 | Entretien: 200–400 / Diagnostic: 150–350 | **PLAUSIBLE** for entretien. LOW for any repair. | 'Simple' maps to maintenance/diagnostic range. Acceptable as customer-facing estimation bracket, not as service price. |
| Intermédiaire | 300–700 | Minor repair (condensateur): 250–450 all-in. Recharge R410A labour: 300–500. | **LOW–PLAUSIBLE** | Captures minor electrical repair + basic recharge labour. Misses part costs entirely. Scope undefined. |
| Complexe | 500–1,200 | Installation split: 600–1200. Multi-split: 1500–3000. Compresseur: QUOTE_REQUIRED. | **LOW for complex work** | 1,200 MAD ceiling fails for any installation or major repair with parts. |
| Urgent | 350–750 | Policy freeze: urgency_modifier = null | **NOT_APPLICABLE** | Urgency modifier frozen per Phase 7B.6 policy. |

**Overall assessment of estimation engine climatisation category:** The category-level buckets serve as rough order-of-magnitude estimates for the homepage estimator. They are not dishonest per se but are significantly undercooked for any real service scoping. The 500–1,200 MAD "complexe" range is particularly problematic — it implies complex climatisation work (installation, major repair) is capped at 1,200 MAD when multi-split installation labour alone can reach 3,000 MAD and full compressor replacement can exceed 7,000 MAD all-in.

**Urgency bucket:** FROZEN per policy. Not evaluated for activation.

---

## Source 2: `fixeo-pricing-marocain.js`

```javascript
climatisation: { from: 200, to: 900, label: 'À partir de 200 MAD', range: '200–900 MAD' }
```

### Assessment

| Legacy Entry | Legacy Range | Market Research Range | Assessment | Notes |
|---|---|---|---|---|
| Climatisation générique | 200–900 MAD | Services range 150–3,000+ MAD | **UNIT_CONFLICT + SCOPE_CONFLICT** | A single range for an entire métier covering maintenance (200 MAD), installation (900–1500 MAD), and compressor replacement (QUOTE_REQUIRED) is commercially meaningless. The 900 MAD ceiling is also falsely low — it excludes all installation and most multi-component repair scenarios. |

**Overall assessment:** This entry is too coarse to be evaluated against any specific service. It may survive as a homepage headline ("à partir de 200 MAD") but must not be used for any service-level price display.

---

## Source 3: `fixeo-profile-v2a.js` PRICE_MAP Climatisation

```javascript
climatisation: [
  { label: 'Panne climatiseur',       from: 200, to: 500  },
  { label: 'Entretien climatiseur',   from: 200, to: 350  },
  { label: 'Installation climatiseur',from: 500, to: 900  },
  { label: 'Réparation climatiseur',  from: 250, to: 600  }
]
```

### Assessment

| Legacy Entry | Legacy Range (MAD) | Normalized Service | Market Research Range (MAD) | Assessment | Notes |
|---|---|---|---|---|---|
| Panne climatiseur | 200–500 | CLIM-006 Diagnostic panne | 200–450 | **PLAUSIBLE** for diagnostic/labour only | 200–500 is reasonable as diagnostic + minor fix labour. Fails entirely for panne with major part (PCB, compressor). SCOPE_CONFLICT if presented as "repair price". |
| Entretien climatiseur | 200–350 | CLIM-003 Entretien standard | 200–400 | **PLAUSIBLE** | Within market research range for entretien standard per unit. Slightly narrow — market anchor is 300 MAD. Acceptable but low end slightly compressed. |
| Installation climatiseur | 500–900 | CLIM-020 Installation mono split ≤3m | 600–1,200 | **LOW** | 900 MAD ceiling misses the market. Platform and contractor sources show 700–1,500 MAD for standard mono split. FIXEO legacy undersells the intervention, potentially attracting artisans who cut scope to hit the price. SCOPE_CONFLICT: no copper length, support, drilling, or vacuum scope defined. |
| Réparation climatiseur | 250–600 | Multiple (CLIM-016/017/018) | Condensateur: 250–550 all-in / PCB: 700–3,000 all-in / Moteur: 600–1,400 all-in | **SCOPE_CONFLICT + TOO_LOW for major repair** | 250–600 MAD is plausible only for capacitor replacement (labour + part). It is entirely wrong for PCB or motor replacement once part costs are included. The generic "réparation" label creates false client expectations. |

---

## Summary: Legacy Climatisation Price Assessment

| Legacy File | Service | Assessment | Priority for Recalibration |
|---|---|---|---|
| estimation-engine-v1/v2 | Simple 200–400 | PLAUSIBLE (estimate only) | LOW — estimation tool, not service price |
| estimation-engine-v1/v2 | Intermédiaire 300–700 | LOW (misses parts) | MEDIUM |
| estimation-engine-v1/v2 | Complexe 500–1,200 | LOW (ceiling too low for installation/compressor) | HIGH |
| pricing-marocain.js | Generic 200–900 | SCOPE_CONFLICT + UNIT_CONFLICT | HIGH |
| profile-v2a.js | Panne 200–500 | PLAUSIBLE (diagnostic only) / TOO_LOW (with major part) | HIGH |
| profile-v2a.js | Entretien 200–350 | PLAUSIBLE | LOW |
| profile-v2a.js | Installation 500–900 | LOW (ceiling) + SCOPE_CONFLICT | HIGH |
| profile-v2a.js | Réparation 250–600 | SCOPE_CONFLICT + TOO_LOW (major repair) | HIGH |

---

## Key Legacy Gaps

1. **No refrigerant-type differentiation** — all legacy sources treat refrigerant as a single implicit item, conflating R22/R410A/R32 and partial/complete recharge.
2. **No copper-length scope for installation** — "installation 500–900 MAD" is undefined without specifying included copper metres.
3. **No part/labour separation** — all legacy sources show all-in ranges that silently bundle or omit parts depending on interpretation.
4. **No leak detection / vacuum as distinct services** — these critical technical steps are invisible in legacy.
5. **Urgency buckets frozen** — not evaluated for activation per Phase 7B.6 policy.

---

*No production files were modified. This comparison is for research purposes only.*
*All legacy values remain active in production as-is. Modification requires Phase 7B.7 human calibration approval.*
