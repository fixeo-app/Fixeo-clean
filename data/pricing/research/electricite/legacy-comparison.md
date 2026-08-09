# FIXEO Electricité — Legacy Pricing Comparison

**Version:** 0.1.0
**Phase:** 7B.4 — FIXEO Fair Price Research — Electricity Morocco
**Date:** 2026-08-09
**Status:** READ-ONLY AUDIT — no production changes

---

## Purpose

Compare external market research findings against existing FIXEO internal electricity pricing values.
External research was conducted first and is completely independent of these legacy values.
Legacy values are captured for classification only — they do NOT influence the research registry.

---

## Legacy Source Inventory — Electricity

### Source L1: `fixeo-estimation-engine-v1.js` (faee-v1)

**Status:** Active (lazy-loaded in reservation stack on index.html)

```javascript
electricite: {
  simple:  { from: 100, to: 200, label: 'Simple' },
  medium:  { from: 200, to: 500, label: 'Intermédiaire' },
  heavy:   { from: 400, to: 1200, label: 'Complexe' },
  urgent:  { from: 250, to: 600, label: 'Urgent' }
}
```

**Classification per tier:**

| Tier | Legacy range | Market finding | Assessment |
|---|---|---|---|
| simple (100–200) | `from: 100, to: 200` | Prise réparation: 150–300 MAD; interrupteur: 150–250 MAD | **TOO_LOW** — 100 DH floor is below artisan economic viability for any urban Casablanca intervention |
| medium (200–500) | `from: 200, to: 500` | Diagnostic+repair: 300–600 MAD; court-circuit: 300–600 MAD | **PLAUSIBLE_LOW** — range acceptable but lower bound 200 DH may understate typical intervention |
| heavy (400–1200) | `from: 400, to: 1200` | Tableau: 800–3500+ MAD; installation: 8000–40000 MAD | **TOO_LOW** — 'heavy' 400–1200 is wildly insufficient for anything beyond disjoncteur replacement |
| urgent (250–600) | `from: 250, to: 600` | Emergency night: 600–1200 MAD; urgency hourly: 150–180 DH/h | **TOO_LOW** — electricity urgency commands larger premium than plumbing; 250 DH floor inadequate for night call-out |

**Overall:** `TOO_LOW` across all tiers. 100 DH floor is economically untenable. 'Heavy' tier does not approach tableau or renovation scope. Complexity tiers (simple/medium/heavy) do not map to real service taxonomies.

**City multipliers:**
```javascript
tier1 (Casablanca, Rabat, Marrakech): ×1.15
tier2 (Tanger, Agadir, Fès, Meknès): ×1.05
tier3 (other): ×1.00
```
**Assessment:** `UNIT_CONFLICT` with afous.ma coefficients. afous.ma: Casa/Rabat/Marra ×1.00/0.95/0.95; FIXEO adds flat ×1.15 to Casa — overcounts if already at highest national reference. Also groups Fès/Meknès same as Tanger/Agadir — afous.ma separates them (0.85 vs 0.90). Incorrect clustering.

**Urgency surcharges:**
```javascript
night: 25%, weekend: 20%, emergency: 40%, express: 15%
```
**Assessment:** `TOO_LOW` vs electricity market. mano.ma: nuit +50–100%, weekend +40–60%. Legacy night surcharge (+25%) is materially below real market. Legacy emergency (+40%) is low for true electricity emergency.

---

### Source L2: `fixeo-pricing-marocain.js`

**Status:** Active — runs on DOMContentLoaded, overwrites artisan prices

```javascript
electricite: { from: 100, to: 400, label: 'À partir de 100 MAD', range: '100–400 MAD' }
// comment in code: "Electricité: 100-200 MAD (prise), 120-250 (luminaire), 200-400 (panne)"
```

**Classification:**

| Value | Market finding | Assessment |
|---|---|---|
| from: 100 | Artisan floor: 200 DH minimum for viable urban intervention | **TOO_LOW** — 100 DH is below any economically sustainable residential call-out |
| to: 400 | Diagnostic+repair: 300–600; court-circuit: 300–600 | **TOO_LOW** — 400 DH ceiling covers only the simplest single-component interventions |
| prise 100–200 comment | Market: 150–300 DH (forfait incl travel) | **TOO_LOW** — 100 DH floor unrealistic; 200 DH ceiling is the floor not ceiling |
| luminaire 120–250 comment | Market: 150–300 DH | **TOO_LOW** — 120 DH floor below viable |
| panne 200–400 comment | Market: 350–600 DH (diagnosis+repair) | **TOO_LOW** — ceiling 400 DH insufficient for investigation+repair |

**Overall:** `TOO_LOW` — single worst-case flat range that disrespects actual market complexity.

---

### Source L3: `reservation.js`

**Status:** Active (loaded in reservation modal)

```javascript
'Urgence électrique':                { from: 200, to: 500 }
'Panne électrique':                  { from: 150, to: 350 }
'Installation électrique':           { from: 200, to: 600 }
'Prise ou interrupteur en panne':    { from: 100, to: 200 }
'Mise à niveau installation':        { from: 400, to: 1200 }
```

**Classification per service:**

| Service | Legacy | Market | Assessment |
|---|---|---|---|
| Urgence électrique (200–500) | 200–500 | Emergency night: 600–1200; base urgency: 300–600 | **TOO_LOW** — 200 DH emergency floor is below artisan minimum viable |
| Panne électrique (150–350) | 150–350 | Diagnostic+repair: 300–600 | **TOO_LOW** — 150 DH floor unrealistic; 350 DH ceiling covers only prise replacement level |
| Installation électrique (200–600) | 200–600 | New circuit: 600–1500; point: 150–450; full install: QUOTE_REQUIRED | **UNIT_CONFLICT** — "installation" ranges from adding a single prise (200–300 DH) to full rewiring (thousands). Cannot be a single range. |
| Prise ou interrupteur (100–200) | 100–200 | Market: 150–300 DH forfait | **TOO_LOW** — 100 DH is per-unit labour only, not a complete intervention forfait |
| Mise à niveau installation (400–1200) | 400–1200 | Full mise aux normes: 8000–40000 DH | **TOO_LOW** by ×10 to ×30 — catastrophically incorrect. Mise aux normes is a major project |

**Overall:** Severe underpricing. Mise aux normes 400–1200 is particularly dangerous — a client told to expect 1200 DH for mise aux normes will be shocked by real quote of 8000–40000 DH.

---

### Source L4: `fixeo-estimation-v2-hero.js` (faee-v2, dead)

**Status:** Never loaded (dead file — do NOT delete)

```javascript
electricite: { simple:{from:100,to:200}, medium:{from:200,to:500}, heavy:{from:400,to:1200}, urgent:{from:250,to:600} }
```

**Assessment:** Identical to faee-v1 — copied. Same `TOO_LOW` classification. CITY_MULT: `casablanca: 1.15` — same overcounting issue.

---

### Source L5: `fixeo-profile-flagship-v1.js`

```javascript
electricite: { from: 150, label: 'Électricité' }
// sub_services: ['Tableau électrique', 'Prises & interrupteurs', 'Éclairage', 'Dépannage urgence', 'Mise aux normes']
```

**Assessment:** `TOO_LOW` — 150 DH starting price for a category that includes tableau replacement (1500–5000 DH) and mise aux normes (8000–40000 DH). Service list is accurate (matches real market taxonomy). Price floor is not meaningful.

---

### Source L6: `scripts/generate-lps.js` (pSEO generator, electricien)

```javascript
electricien: {
  sub_services: ['Dépannage panne électrique', 'Remplacement tableau électrique', 'Installation prises et éclairage', 'Mise aux normes', 'Court-circuit'],
  // No explicit price ranges in pSEO for electricien — unlike plomberie pSEO
}
```

**Assessment:** `N/A — no prices`. pSEO for electricien does not embed price ranges in the code (unlike plomberie pSEO which had 150–600 DH etc.). Sub-services list is well-structured and taxonomically accurate. No price-related concern here.

---

### Source L7: `js/fixeo-profile-v3.js`

```javascript
// No explicit pricing ranges for electricite in profile v3 — uses category-level from reservation.js
// electricite situation chips: panne, disjoncteur, installation, prise/interrupteur, urgence
```

**Assessment:** Situation chips taxonomically accurate. Pricing inherited from reservation.js (classified above as TOO_LOW).

---

## Summary Classification Table

| Source | File | Electricite floor | Electricite ceiling | Assessment |
|---|---|---|---|---|
| L1 | fixeo-estimation-engine-v1.js | 100 DH (simple) | 1200 DH (heavy) | TOO_LOW across all tiers |
| L2 | fixeo-pricing-marocain.js | 100 DH | 400 DH | TOO_LOW — worst single range |
| L3 | reservation.js | 100 DH (prise) | 1200 DH (mise normes) | TOO_LOW — Mise normes catastrophically wrong |
| L4 | fixeo-estimation-v2-hero.js | 100 DH | 1200 DH | TOO_LOW — identical to L1 |
| L5 | fixeo-profile-flagship-v1.js | 150 DH | n/a | TOO_LOW |
| L6 | generate-lps.js | no price | no price | N/A — no price data |
| L7 | fixeo-profile-v3.js | inherited | inherited | TOO_LOW (inherited) |

---

## Priority Issues for Future Phases

### P1 — Catastrophic: Mise aux normes floor (reservation.js)
**Current:** `'Mise à niveau installation': {from: 400, to: 1200}` displayed to clients
**Market:** 8,000–40,000 DH (full project)
**Risk:** Client shown 1,200 DH maximum estimate for a service that typically costs 8,000–40,000 DH. Severe trust damage when real quote arrives. Must be removed from FIXEO fixed price surfaces entirely — replace with "Devis obligatoire" or a budget range with explicit disclaimer.

### P2 — Severe: 100 DH floor across all sources
**Current:** 100 DH appears as `from` in L1, L2, L3, L4
**Market:** Artisan economic floor for any viable urban intervention: ≥200 MAD
**Risk:** Any electrician agreeing to work for 100 DH is either below-market or will recoup through hidden charges. Creates race-to-bottom risk.

### P3 — Severe: Urgency surcharges (faee-v1)
**Current:** Night +25%, emergency +40%
**Market:** Night +50–100%, emergency varies widely
**Risk:** Electricians charging night rates of 100% above base will appear to be overcharging vs FIXEO-displayed 25% modifier.

### P4 — Moderate: Unit conflicts (reservation.js installation)
**Current:** 'Installation électrique' {from: 200, to: 600}
**Market:** "Installation" spans from single-point (150–300 DH) to full rewiring (quote required). No single range applies.
**Fix:** Split into granular services. Retire generic 'Installation électrique' from fixed-price surfaces.

### P5 — Moderate: City tier misclustering (faee-v1)
**Current:** Fès/Meknès grouped with Tanger/Agadir at ×1.05
**Market:** afous.ma separates these at ×0.85 vs ×0.90
**Risk:** Overstates prices in Fès/Meknès by ~5–6% relative to market.

---

## Confirmed Correct Taxonomy in Legacy Code

The following service names used in FIXEO match the real market taxonomy well:
- panne électrique ✓
- prise / interrupteur ✓
- disjoncteur ✓
- court-circuit ✓
- tableau électrique ✓
- installation électrique ✓
- mise aux normes ✓
- éclairage / luminaire ✓
- urgence électrique ✓

The taxonomy is correct. The **price ranges** are incorrect (too low across the board).

---

*This document is for research use only. No production files were modified.*
