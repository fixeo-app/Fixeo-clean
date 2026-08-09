# FIXEO Peinture — Morocco Market Research
## Phase 7B.9

**Status**: RESEARCH COMPLETE — HUMAN CALIBRATION REQUIRED  
**Date**: 2026-08-09  
**Previous phase**: Phase 7B.8.2 — Nettoyage Human Price Decision Freeze (f9675e7)

---

## Purpose

External market research for Moroccan residential painting services. This phase establishes an evidence-based foundation for a future human calibration phase. No prices have been approved. No production files have been modified.

## Safety Confirmation

- ✅ PRODUCTION RUNTIME DIFF = 0
- ✅ No deployment performed
- ✅ All services: `production_ready = false`
- ✅ All services: `human_decision = PENDING | QUOTE_REQUIRED`
- ✅ All modifiers: `null`
- ✅ No city adjustments activated
- ✅ T0 legacy values isolated and labelled — not used as market evidence

---

## Files

| File | Description |
|------|-------------|
| `sources.v0.1.json` | 14 sources (11 external + 3 T0 legacy) with grade classification |
| `evidence.v0.1.json` | 32 evidence observations with measurement basis, labour policy, and price ranges |
| `registry.v0.1.json` | 12 service candidates for future human calibration |
| `exclusions.v0.1.json` | 14 excluded/deferred services with classification and cross-métier boundaries |
| `legacy-comparison.md` | T0 legacy audit vs external evidence |
| `validate.js` | Validation script (run: `node validate.js`) |
| `README.md` | This file |

---

## Key Market Findings

### How Moroccan Painters Price Work

The Moroccan residential painting market prices primarily by **m² of painted wall surface** (not floor area). The most common quoting unit is DH/m² for wall surface.

**Critical distinction**: When a source says "X MAD/m²", it can mean:
- **Painted surface m²** (walls × height, minus openings) — the correct interpretation for professional quotes
- **Floor area m²** — sometimes used by clients colloquially
- **Unknown** — many online sources are ambiguous

### National Price Ranges (2026)

| Service | Unit | Labour Only | All-In Standard |
|---------|------|-------------|-----------------|
| Interior wall | /m² painted | 25–50 DH | 45–80 DH |
| Ceiling | /m² painted | 20–45 DH | 60–100 DH |
| Ceiling + enduit lissage | /m² painted | — | 80–180 DH |
| Exterior facade | /m² painted | 35–70 DH | 80–130 DH |
| Tadelakt | /m² painted | — | 300–600 DH |
| F2/F3 apartment full repaint | per project | 5,000–9,000 DH | 8,000–16,000 DH |

### Labour vs Material

- Labour typically represents **55–60% of all-in price**
- Standard paint material (Colorado, Astral) costs only **~2–4 DH/m²** at retail
- **Client-supplied paint** (labour-only model) is a viable FIXEO architecture — removes paint brand disputes
- Most professional artisans in Morocco supply and invoice paint themselves

### Number of Coats

Standard Moroccan professional scope: **Primer + 2 finish coats**
- 1 coat is insufficient for most applications
- 3 coats required for dark-to-light colour changes
- Enduit de lissage is often needed before primer (especially on béton brut)

### Wall Preparation

Moroccan market recognizes these preparation levels:
1. **READY_TO_PAINT** — clean, no cracks, previous paint stable
2. **MINOR_PREPARATION** — small holes, minor cracks, light sanding
3. **MODERATE_REPAIR** — peeling paint (stripping: 20–40 DH/m² extra), multiple cracks, local enduit
4. **HEAVY_REPAIR** — extensive plaster damage (QUOTE_REQUIRED)
5. **MOISTURE_OR_MOLD** — HORS PÉRIMÈTRE until moisture source treated

### Paint Brands Available in Morocco

| Tier | Brands | Typical use |
|------|--------|-------------|
| Economy | Oméga, generic | Ceilings, secondary spaces |
| Standard | Colorado, Astral, Atlas, Zolux | Main rooms |
| Premium | Tollens, Seigneurie, Valentine, Caparol | High-end apartments |
| Specialty | Coloflex (anti-humidity), tadelakt products | Specific applications |

### Geographic Variation

| City | Interior MO premium |
|------|---------------------|
| Casablanca | +15–30% vs national average |
| Rabat/Salé | +10–20% |
| Marrakech, Tanger | National average |
| Fès, Meknès | -10–20% |
| Oujda, Béni Mellal | -25–35% |

**City adjustment freeze confirmed**: `city_adjustment = null` for all services.

---

## Apartment Size Simulations

Estimates using standard formula: painted wall surface ≈ perimeter × ceiling height (2.7m) − openings. Ceiling surface ≈ floor area.

| Case | Floor Area | Painted Walls (est.) | Ceiling | Total Painted | MO Only | All-In Standard |
|------|-----------|---------------------|---------|--------------|---------|-----------------|
| Studio 35m² | 35m² | ~60m² | 35m² | ~95m² | 2,375–4,750 | 4,275–7,600 |
| F2 60m² | 60m² | ~105m² | 60m² | ~165m² | 4,125–8,250 | 7,425–13,200 |
| F3 80m² | 80m² | ~140m² | 80m² | ~220m² | 5,500–11,000 | 9,900–17,600 |
| F4 110m² | 110m² | ~190m² | 110m² | ~300m² | 7,500–15,000 | 13,500–24,000 |
| Villa 200m² | 200m² | ~350m² | 200m² | ~550m² | 13,750–27,500 | 24,750–44,000 |

*All estimates are indicative. Actual painted surface depends on room count and layout.*

---

## Service Candidates for Human Calibration

| Code | Service | Unit | Range (MAD) | Confidence |
|------|---------|------|-------------|------------|
| PEIN-001 | Minimum project / retouche | flat | 600–1200 | MEDIUM |
| PEIN-002 | Interior wall — labour only | /m² painted | 25–50 | HIGH |
| PEIN-003 | Interior wall — all-in standard | /m² painted | 45–80 | HIGH |
| PEIN-004 | Ceiling — all-in standard | /m² ceiling | 40–80 | MEDIUM |
| PEIN-005 | Interior wall + minor prep | /m² painted | 60–110 | MEDIUM |
| PEIN-006 | Full room — walls + ceiling | per room | 1200–2800 | MEDIUM |
| PEIN-007 | Full F2/F3 apartment | per project | 5000–12000 | MEDIUM |
| PEIN-008 | Enduit de lissage only | /m² painted | 20–40 | MEDIUM |
| PEIN-009 | Interior wood door | per door | 150–400 | LOW |

### QUOTE_REQUIRED
- PEIN-010: Decorative (tadelakt, stucco, béton ciré)
- PEIN-011: Exterior facade
- PEIN-012: Heavy wall repair

---

## Cross-Métier Boundaries

| Trigger | Route to |
|---------|----------|
| Active moisture source | Plomberie or Toiture first |
| Structural cracks | Maçonnerie |
| Active mold | Maçonnerie/specialist |
| Wood repair before painting | Menuiserie |
| Electrical modifications | Electricité |
| Facade enduit (render) | Maçonnerie |

---

## Source Quality Summary

- **Grade A**: 1 (Ministry of Equipment — index data, no unit prices)
- **Grade B**: 2 (prix-construction.info Moroccan database — structured public procurement)
- **Grade C+**: 4 (mano.ma platform × 2, bnidari.ma × 2)
- **Grade C**: 2 (travauxpeinture.ma contractor, mondevis.ma real devis)
- **Grade D**: 1 (Reddit community — anecdotal confirmation)
- **T0**: 3 (FIXEO internal legacy — excluded from market model)

**No Grade A or B sources publish retail residential painting labour rates**. The Moroccan Ministry of Equipment publishes cost indices but not unit labour prices for finishing trades. The Grade B sources (prix-construction.info) cover specialized/structural painting rather than residential interior painting. Grade C+ sources (mano.ma, bnidari.ma) provide the strongest corroborated residential market data.

---

## Humidity / Mold Doctrine

FIXEO must NOT create a service that encourages artisans to paint over unresolved water damage.

**Escape rule**: If client describes moisture stains, recurring mold, peeling caused by humidity, or infiltration stains → STOP → IDENTIFY CAUSE → DECLARE HORS PÉRIMÈTRE → ROUTE TO PLOMBERIE or TOITURE → Quote for painting ONLY after moisture source confirmed resolved.

---

*Phase 7B.9 complete. Human calibration required before any price activation.*
