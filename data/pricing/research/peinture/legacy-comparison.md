# FIXEO Peinture — Legacy T0 Comparison
Phase 7B.9 | Research date: 2026-08-09
Status: T0_INTERNAL_LEGACY — NOT external evidence

---

> **CRITICAL**: All values below are FIXEO-internal legacy (T0). They were NOT used to build the market model. External evidence was collected first (Steps A–D). T0 values are compared against external findings only after external research was substantially complete.

---

## Source files audited

- `js/fixeo-pricing-marocain.js`
- `js/fixeo-estimation-engine-v1.js`
- `js/fixeo-estimation-v2-hero.js`

**No modifications were made to any production file.**

---

## Legacy Value 1 — fixeo-pricing-marocain.js

**Legacy description**: `peinture: { from: 800, to: 2500, label: 'À partir de 800 MAD', range: '800–2500 MAD' }`

**Legacy code context**: `Peinture: 800-1500 MAD (chambre), 1200-2500 (salon)` (comment in file header)

- **Legacy value**: 800–2500 MAD
- **Inferred unit**: Per room (chambre or salon) — NOT per m²
- **External evidence range for full room repaint**: 1200–2800 MAD (PEIN-006, MEDIUM confidence)
- **Classification**: **LEGACY_SUPPORTED** (lower bound slightly low, upper bound plausible)
- **Notes**: The 800 MAD figure is below what evidence supports for a full room repaint including materials. For labour-only on a small room it could be plausible. The comment "chambre: 800–1500" aligns with the lower end of the external evidence range for a small room labour-only. "Salon: 1200–2500" is more aligned with all-in standard paint. The unit (PER_ROOM) is reasonable but the scope inclusions are UNDEFINED — no source states what the FIXEO price covers (paint included? primer? enduit?). This ambiguity is the main problem.
- **Risk**: Client confusion if scope is not explicit.

---

## Legacy Value 2 — fixeo-estimation-engine-v1.js (and v2-hero.js — identical ranges)

**Legacy code**: 
```js
peinture: {
  simple:  { from: 150, to: 350, label: 'Pièce simple' },
  medium:  { from: 300, to: 800, label: 'Appartement' },
  heavy:   { from: 700, to: 2000, label: 'Grand chantier' },
  urgent:  { from: 250, to: 600, label: 'Urgent' }
}
```

### 2a — "simple: 150–350 MAD" (Pièce simple)

- **Legacy value**: 150–350 MAD
- **Inferred unit**: Unknown — likely per intervention/room estimate
- **External evidence**: For a minimum painting intervention (small retouche), PEIN-001 estimates 600–1200 MAD minimum. Even labour-only for 10m² painted surface is 250–500 MAD (10 × 25–50).
- **Classification**: **LEGACY_LOW**
- **Notes**: 150–350 MAD is structurally below any realistic minimum painting project in Morocco in 2026. May reflect an old minimal intervention or a labour-only very small retouche without travel. Not appropriate as a standard service price.

### 2b — "medium: 300–800 MAD" (Appartement)

- **Legacy value**: 300–800 MAD
- **Inferred unit**: Unknown — per apartment estimate?
- **External evidence**: A full F2/F3 apartment all-in is 5,000–12,000 MAD (PEIN-007). Even labour-only for 200m² painted surface is 5,000–10,000 MAD. 300–800 MAD is far below any realistic apartment painting cost.
- **Classification**: **LEGACY_LOW**
- **Notes**: This value appears to be a UI estimate tier for "contact range" rather than a realistic painting price. May have been calibrated for a fundamentally different scope (e.g. one small room, labour-only retouche). Severely underprices any meaningful apartment painting scope.

### 2c — "heavy: 700–2000 MAD" (Grand chantier)

- **Legacy value**: 700–2000 MAD
- **Inferred unit**: Unknown — per "grand chantier" level
- **External evidence**: A full apartment (F2/F3) MO-only is 5,000–9,000 MAD. Grand chantier should be higher.
- **Classification**: **LEGACY_LOW**
- **Notes**: 2000 MAD maximum for a "grand chantier" painting is below realistic market rates even for a single large room with full scope.

### 2d — "urgent: 250–600 MAD"

- **Legacy value**: 250–600 MAD
- **External evidence**: No evidence exists for an urgent painting service in Morocco. Painting is not an emergency trade. 250–600 MAD is below any meaningful scope.
- **Classification**: **LEGACY_AMBIGUOUS_UNIT**
- **Notes**: An "urgent painting" service is not well-defined in the Moroccan market. Painting requires dry time, preparation, and cannot be meaningfully rushed in the same way as plumbing or locksmithing.

---

## Summary Table

| Legacy Entry | Value | External Evidence | Classification |
|---|---|---|---|
| Chambre: 800–1500 MAD | per room | 1200–2800 MAD per room | LEGACY_SUPPORTED (lower bound marginal) |
| Salon: 1200–2500 MAD | per room | 1200–2800 MAD per room | LEGACY_SUPPORTED |
| Simple: 150–350 MAD | unknown unit | 600–1200 MAD minimum project | LEGACY_LOW |
| Medium: 300–800 MAD | unknown unit | 5000–12000 MAD full apartment | LEGACY_LOW |
| Heavy: 700–2000 MAD | unknown unit | >5000 MAD for significant scope | LEGACY_LOW |
| Urgent: 250–600 MAD | unknown unit | Service category not market-supported | LEGACY_AMBIGUOUS_UNIT |

---

## Key Findings

1. The legacy per-room ranges (800–2500 MAD) are directionally in range with evidence for **small room, basic scope**, but scope is undefined and lower bound is marginal.

2. The legacy estimation engine ranges (150–2000 MAD) are significantly **LEGACY_LOW** for any meaningful painting project. These appear to be legacy UI tier markers rather than real market prices.

3. The legacy system has **no m² pricing** — it uses complexity tiers without physical units. The Moroccan market primarily prices painting by m² (painted surface).

4. The legacy system has **no material/labour policy** — it is unclear whether any price includes paint.

5. The legacy "urgent" category has **no market basis** — painting is not an emergency trade.

---

*All legacy values remain T0_INTERNAL_LEGACY. Production files unchanged.*
