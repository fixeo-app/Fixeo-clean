# FIXEO Electricité Pricing Research — V0

**Phase:** 7B.4 — FIXEO Fair Price Research — Electricity Morocco
**Version:** 0.1.0
**Date:** 2026-08-09
**Status:** RESEARCH ARTIFACT — NOT PRODUCTION
**Author:** FIXEO Pricing Research System

---

## Purpose

Establish the best possible evidence-based understanding of the real Moroccan residential/small-business electricity service market, as a foundation for future FIXEO canonical electricity pricing.

This is a READ-ONLY research phase. No production files were modified.

---

## Files in This Directory

| File | Description |
|---|---|
| `sources.v0.json` | 13 sources evaluated, 5 usable, 4 rejected. Grade, methodology, raw data per source. |
| `evidence.v0.json` | 28 observations total: 24 included, 4 excluded. Normalized from usable sources. |
| `exclusions.v0.json` | 4 source-level exclusions with reason codes. |
| `registry.v0.json` | 17 service entries: 5 candidates, 7 quote-required, 3 diagnosis-first, 2 insufficient. |
| `legacy-comparison.md` | FIXEO internal values vs market findings. 7 legacy sources classified. |
| `validate.js` | Validation script — run with `node validate.js` |
| `README.md` | This file |

---

## Key Research Findings

### 1. Electricity is structurally more complex than plumbing

- Materials cost (hardware) is a MAJOR pricing variable: a disjoncteur alone costs 40–350 DH retail
- Per-unit pricing (per prise/interrupteur/spot) is architecturally separate from flat-intervention pricing
- More services are in the QUOTE_REQUIRED or DIAGNOSIS_FIRST architecture than in plumbing
- The ratio of standardizable services to total services is lower

### 2. Best market data source: afous.ma (B grade)

2,197 relevés, 8-city coverage, stated P30–P70 methodology, quarterly update.
Only 3 electricity service types covered:
- Dépannage urgence (1h): 150–180 DH/h (480 relevés)
- Installation prise/interrupteur: 70–80 DH/unit (480 relevés)
- Remplacement disjoncteur: 170–200 DH forfait (480 relevés)

### 3. Artisan economic floor: ≥200 MAD per intervention

Hourly rate reference (afous.ma): 150–180 DH/h national P30-P70.
30-min intervention labour value: ~75–90 DH.
Add travel (40 DH mid-Casablanca) + commission (15%): minimum viable intervention ≥200 MAD.
Any FIXEO reference price below 200 MAD for a genuine residential call-out risks artisan viability.

### 4. afous.ma City Coefficients (for documentation)

| City | Coefficient | Effective price if national ref = 200 MAD |
|---|---|---|
| Casablanca | 1.00 | 200 MAD |
| Rabat | 0.95 | 190 MAD |
| Marrakech | 0.95 | 190 MAD |
| Agadir | 0.90 | 180 MAD |
| Tanger | 0.90 | 180 MAD |
| Fès | 0.85 | 170 MAD |
| Meknès | 0.85 | 170 MAD |
| Salé | 0.85 | 170 MAD |

**FIXEO cannot adopt these multipliers without own transaction data.**

### 5. Urgency surcharges: materially higher than legacy FIXEO values

| Time | Market evidence (mano.ma editorial) | Legacy FIXEO |
|---|---|---|
| Soir 18h–22h | +30% to +50% | +15% (express) |
| Nuit 22h–7h | +50% to +100% | +25% (night) |
| Weekend | +40% to +60% | +20% (weekend) |
| Jours fériés | +60% to +100% | +40% (emergency) |

Electricity urgency commands larger premium than plumbing — safety/risk factor.
All modifiers remain NON-CANONICAL. Must label: "indicatif — tarif artisan prévalent".

### 6. Legacy FIXEO values: systematically TOO_LOW

- 100 DH floor appears across 4 legacy sources — below any viable intervention
- Mise aux normes shown as 400–1200 DH — real market: 8,000–40,000 DH (×10–×30 error)
- Urgency surcharges 25–40% — real market evidence supports 50–100% for night

---

## Evidence Source Quality

| Grade | Count | Publishers |
|---|---|---|
| B | 1 | afous.ma (price observatory, 2197 relevés, stated P30-P70 methodology) |
| C+ | 1 | mano.ma (platform editorial, 2026, city-level, no sample size) |
| C | 2 | bnidari.ma (partial — technical scope only; scope-context page) |
| D | 4 | Directory pages, 404 errors, empty pages, classified ads |
| T0 | 4 | FIXEO internal legacy — used for legacy comparison only |

---

## Standardization Candidates

| Service | Candidate | Architecture | Evidence | Condition |
|---|---|---|---|---|
| electricite.diagnostic | ✅ YES | FLAT_DIAGNOSTIC | LOW | Similar to plumbing diagnostic model |
| electricite.prise_remplacement | ✅ YES | FLAT_INTERVENTION | MEDIUM | Single accessible outlet; client-supplied part recommended |
| electricite.interrupteur_remplacement | ✅ YES | FLAT_INTERVENTION | MEDIUM | Single accessible switch; client-supplied part |
| electricite.luminaire_installation | ✅ YES | FLAT_INTERVENTION | MEDIUM | Client-supplied fixture; simple plafonnier/applique only |
| electricite.disjoncteur_remplacement | ✅ YES (conditional) | FLAT_INTERVENTION | MEDIUM | Single MCB only; cause confirmed as defective breaker |

All other services: DIAGNOSIS_FIRST, QUOTE_REQUIRED, or INSUFFICIENT_EVIDENCE.

---

## Safety Classification Summary

| Classification | Services |
|---|---|
| STANDARD | prise_remplacement, interrupteur_remplacement, luminaire_installation, point_electrique, sonnette |
| SAFETY_SENSITIVE | diagnostic, disjoncteur_remplacement, tableau_diagnostic, differentiel_installation, circuit_ajout, cable_remplacement, court_circuit (investigation phase), urgence |
| SAFETY_CRITICAL | court_circuit (repair), panne_totale, tableau_remplacement, installation_complete, mise_aux_normes |

---

## Quote-Required Services (Must NEVER receive a simple fixed price)

1. `electricite.tableau_remplacement` — major project, part cost alone ×4 variable
2. `electricite.installation_complete` — labour + all materials, per m², project scope unknown
3. `electricite.mise_aux_normes` — every installation unique; range 8000–40000 DH
4. `electricite.circuit_ajout` — cable length unknown; routing and accessibility unknown
5. `electricite.cable_remplacement` — length, section, routing all variable
6. `electricite.panne_totale` — root cause unknown; diagnostic first
7. `electricite.court_circuit` — root cause unknown; may indicate burnt wiring

---

## Next Steps for Human Calibration

1. **Human review of 5 candidate services** — same process as plumbing V0.3
2. **Material policy decision per service** — who supplies parts (client vs artisan)
3. **Diagnostic model decision** — consistent with plumbing (absorption rule) or separate?
4. **Urgency research** — dedicated phase for electricity-specific surcharge norms
5. **afous.ma city coefficient adoption** — conditional on FIXEO transaction data

---

## Production Impact

**ZERO.** No HTML, JS, CSS, or runtime files modified in this phase.

---

*Research conducted: 2026-08-09. External sources researched first. Internal FIXEO values captured after external research completed.*
