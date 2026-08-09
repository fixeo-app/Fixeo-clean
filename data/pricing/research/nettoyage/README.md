# NETTOYAGE — Phase 7B.8 Morocco Market Research

## Status

**PHASE 7B.8 — RESEARCH COMPLETE — HUMAN CALIBRATION REQUIRED**

- `production_ready = false` for all services
- `human_decision = PENDING` for all candidates
- No prices approved
- No estimator modified
- No production files modified

---

## Files

| File | Description |
|---|---|
| `README.md` | This file — phase overview |
| `sources.v0.1.json` | Graded source inventory (13 external + 3 T0 internal) |
| `evidence.v0.1.json` | Evidence matrix by topic (labour, property types, post-construction, textiles, windows, geography) |
| `registry.v0.1.json` | Normalized service registry with research anchors |
| `exclusions.v0.1.json` | Métier boundaries, QUOTE_REQUIRED, SPECIALIST routing, DEFERRED services |
| `legacy-comparison.md` | FIXEO legacy T0 value analysis |
| `validate.js` | Validation script |

---

## Key Research Findings

### Pricing Architecture — The Worker-Count Problem

Nettoyage has a fundamental pricing ambiguity absent from other métiers:

> 2 hours × 1 cleaner ≠ 2 hours × 2 cleaners

**Market finding**: The dominant residential pricing model in Morocco is **PER_CLEANER_HOUR** or **PER_DAY_PER_CLEANER**. A "150 MAD/h" quote that doesn't specify per-cleaner vs per-team is ambiguous and creates disputes.

**FIXEO recommendation**: All hourly pricing must be stated as PER_CLEANER_HOUR. Additional cleaners are additional line items.

### Materials & Equipment

For standard residential ménage: **products usually CLIENT_SUPPLIED** (confirmed by O2 Maroc explicitly).

For deep-clean, post-construction, and textile services: **equipment and products ARTISAN_SUPPLIED_INCLUDED**.

This is a critical onboarding and estimator disclosure requirement.

### Minimum Duration

Market norm: **3h minimum per residential visit** (professional providers). Below this, artisans typically decline or charge a minimum-visit rate.

### Post-Construction Pricing

Post-construction is **structurally distinct** from standard residential cleaning:
- Requires specialist equipment
- Per-m² pricing (12–25 MAD/m²)
- Minimum project price (800–1000 MAD)
- Worker teams of 2–4
- Must NEVER be merged with standard cleaning

### Upholstery Services

Sofa/mattress/rug cleaning is well-evidenced and standardizable with HIGH confidence:
- Canapé 2 places: 300 MAD anchor (3 sources converge)
- Matelas simple: 200 MAD anchor
- Strong platform pricing evidence (O2 Maroc, Hany.ma)

---

## Candidate Shortlist for Human Calibration

| Code | Service | Confidence | Anchor MAD | Architecture |
|---|---|---|---|---|
| NET-002 | Tarif horaire/agent | MEDIUM | 55 MAD/h | HOURLY |
| NET-001 | Visite minimum | MEDIUM | 200 MAD | MINIMUM_VISIT |
| NET-003 | Journée complète | MEDIUM | 220 MAD | FULL_DAY |
| NET-004 | Grand nettoyage | MEDIUM | 600 MAD | CONDITIONAL_FIXED |
| NET-010 | Canapé 2 places | HIGH | 300 MAD | FIXED |
| NET-011 | Canapé 3 places | HIGH | 450 MAD | FIXED |
| NET-012 | Canapé angle | MEDIUM | 700 MAD | FIXED |
| NET-013 | Matelas simple | HIGH | 200 MAD | FIXED |
| NET-021 | Tapis grand m² | MEDIUM | 55 MAD/m² | PER_M2 |
| NET-030 | Après travaux m² | LOW | 15 MAD/m² | PER_M2 |

Services requiring more evidence: NET-005 (move-out), NET-031 (post-construction forfait), NET-014 (matelas double).

---

## Geographic Scope

`market_scope = NATIONAL_MOROCCO`
`city_adjustment = null`

City differences documented in evidence.v0.1.json but no multipliers created.

---

## Doctrine Compliance

| Rule | Status |
|---|---|
| External research before legacy review | ✅ COMPLIED |
| Legacy values classified T0 only | ✅ COMPLIED |
| No human_decision = APPROVED | ✅ COMPLIED |
| No production_ready = true | ✅ COMPLIED |
| No city modifiers | ✅ COMPLIED |
| No urgency/night/weekend/holiday modifiers | ✅ COMPLIED |
| Post-construction separated | ✅ COMPLIED |
| Worker-count semantics documented | ✅ COMPLIED |
| Specialist exclusions routed | ✅ COMPLIED |
| Production runtime diff = 0 | ✅ COMPLIED |
