# FIXEO Bricolage — Legacy Pricing Comparison
## Phase 7B.7 — T0 Comparison Only

> **Critical note**: External Moroccan market research was completed FIRST (see `evidence.v0.1.json` and `sources.v0.1.json`). This comparison was performed ONLY AFTER independent evidence collection. Legacy values are classified as `LEGACY_T0` — comparison references only. They must NOT anchor pricing decisions.

---

## Sources Inspected

### 1. `js/secondary-search.js` — MAR_PRICES object

```javascript
bricolage: { from: 80 }
```

| Field | Value | Classification |
|-------|-------|---------------|
| bricolage.from | 80 MAD | LEGACY_T0 |
| Status | TOO_LOW | — |
| External evidence | 100–200 MAD minimum visit | — |

**Assessment: TOO_LOW**

The `from: 80 MAD` appears as a generic starting floor in a UI filter. This is below:
- Allo-Maison minimum start price of 100 MAD/h
- Adom.ma minimum 150 DH per visit
- Tanger/Casablanca minimum task price of 150–200 DH

80 MAD may have been a historically low estimate. It does not reflect current market evidence (2025–2026). It creates a false client expectation.

---

### 2. `js/artisan-onboarding-store.js` — artisan onboarding meta

```javascript
bricolage: { priceFrom: 130, portfolio: ['🔨', '🪛', '🔩'], skills: ['Montage', 'Réparation', 'Fixations'] }
```

| Field | Value | Classification |
|-------|-------|---------------|
| bricolage.priceFrom | 130 MAD | LEGACY_T0 |
| Status | LOW–PLAUSIBLE | — |

**Assessment: LOW–PLAUSIBLE**

130 MAD/h is within the lower range of external evidence (100–180 MAD/h). However:
- Used as artisan onboarding "starting from" price — likely hourly
- Not a visit forfait price
- External evidence suggests 130 MAD/h is realistic for smaller cities but potentially low for Casablanca/Rabat
- If interpreted as per-visit minimum → too low

---

### 3. `js/fixeo-profile-v2a.js` — profile pricing ranges

```javascript
bricolage: [
  { label: 'Petites réparations',  from: 100, to: 300 },
  { label: 'Montage meubles',      from: 100, to: 250 },
  { label: 'Fixations murales',    from: 80,  to: 200 },
  { label: 'Intervention rapide',  from: 100, to: 300 }
]
```

| Legacy Label | Legacy Range (MAD) | External Evidence | Classification |
|---|---|---|---|
| Petites réparations | 100–300 | 150–300 MAD (visit floor 150–200) | PLAUSIBLE–LOW |
| Montage meubles | 100–250 | 150–300 MAD (Kitea anchor: 200) | LOW–PLAUSIBLE |
| Fixations murales | 80–200 | 150–300 MAD (TV mount: 200–400) | TOO_LOW at 80; HIGH at 200 for simple fixing |
| Intervention rapide | 100–300 | 150–300 MAD | PLAUSIBLE |

**Assessment details:**

- **Petites réparations 100–300 MAD**: Lower bound 100 MAD is below 150 MAD market floor. Upper 300 MAD plausible. → LOW at floor
- **Montage meubles 100–250 MAD**: Kitea anchor is 200 MAD/item. Independent artisan should price 150–300 MAD. 100 MAD floor is aggressive/low. 250 MAD ceiling may be low for medium furniture. → LOW at floor
- **Fixations murales 80–200 MAD**: 80 MAD for wall fixing is almost certainly too low (TV mount alone = 200–400 MAD; shelf mounting = 150–300 MAD). Confusingly, the `to: 200` is also low for TV mounting. → SCOPE_CONFLICT and TOO_LOW
- **Intervention rapide 100–300 MAD**: Reasonable range if interpreted as general visit. Floor 100 MAD still below 150 MAD market visit floor. → LOW at floor

---

### 4. Architecture Assessment

Legacy FIXEO bricolage pricing uses a per-service-range architecture displayed on artisan profiles. This is not a standardized-price architecture.

Key observations:
- No minimum visit concept defined
- No batch/multi-task architecture
- No per-item architecture (Kitea-style)
- No half-day option
- No complexity escape triggers documented

The legacy architecture is incomplete for a trustworthy FIXEO pricing system.

---

## Summary Classification Table

| Legacy Source | Legacy Value | Market Evidence | Verdict |
|---|---|---|---|
| secondary-search.js `from: 80` | 80 MAD | 100–200 MAD minimum | TOO_LOW |
| artisan-onboarding `priceFrom: 130` | 130 MAD/h | 100–180 MAD/h | PLAUSIBLE |
| profile-v2a Petites réparations | 100–300 MAD | 150–300 MAD | LOW at floor |
| profile-v2a Montage meubles | 100–250 MAD | 150–300 MAD | LOW at floor, LOW at ceiling |
| profile-v2a Fixations murales | 80–200 MAD | 150–400 MAD (scope-dependent) | TOO_LOW at floor, SCOPE_CONFLICT |
| profile-v2a Intervention rapide | 100–300 MAD | 150–300 MAD | LOW at floor |

---

## Values That Should NOT Survive Future Estimator Migration

1. `bricolage.from = 80 MAD` (secondary-search.js) — creates false client expectation of sub-100 MAD bricolage
2. `Fixations murales from: 80 MAD` — does not reflect TV mounting (200–400 MAD) or shelf work (150–300 MAD)
3. Absence of minimum visit architecture — batch visit will be mispriced without it
4. Absence of per-item pricing — missing Kitea-competing architecture (200 MAD/item)
5. Single flat range for "Montage meubles" — does not differentiate small vs large furniture

---

## Modification Status

> ⚠️ NONE of the above legacy files were modified.
> All are inspected for comparison only.
> Production runtime remains unchanged.

---

*Generated: Phase 7B.7 — FIXEO Bricolage Market Research*  
*Status: RESEARCH_ONLY — human_decision = PENDING*
