# FIXEO Plumbing Pricing — Legacy vs. Market Research Comparison

**Status: DIAGNOSTIC ONLY — values in this file are NOT production targets**  
**Date:** 2026-08-09  
**Purpose:** Compare canonical market-derived values (Phase 7B.3) against existing FIXEO pricing sources to identify gaps, inflation, and under-pricing.

---

## ⚠️ Disclaimer

Legacy values listed here are **NEVER** used as market evidence for the canonical registry. They are listed for comparison only. Circular validation (using FIXEO's own prices to calibrate FIXEO's prices) is strictly forbidden.

---

## Comparison Table

All values in MAD. Labour + travel only (where interpretable).

| Service | Market Fair Low | Market Fair Price | Market Fair High | Market Confidence | faee-v1 | faee-v2 (dead) | pricing-marocain | reservation.js | AIRE PRICE_MAP | pSEO |
|---------|----------------|-------------------|-----------------|-------------------|---------|----------------|-----------------|----------------|----------------|------|
| plomberie.diagnostic | **100** | **150** | **200** | MEDIUM | — | — | — | — | — | 150–250 ✓ |
| plomberie.fuite_simple | **150** | **220** | **350** | MEDIUM | 120–250 ⚠️ LOW FLOOR | 120–350 ⚠️ | 150–350 ✓ | 150–300 ✓ | 150–500 ✓ (too wide) | 300–600 ❌ INFLATED |
| plomberie.fuite_localisation | **350** | **600** | **1,000** | LOW | — | — | — | — | — | — |
| plomberie.fuite_encastree | **800** | **1,300** | **2,500** | LOW | — heavy 400–900 ❌ | — | — | — | — | — |
| plomberie.debouchage_evier | **150** | **220** | **300** | MEDIUM | 120–250 ⚠️ | 120–300 ⚠️ | 150–350 ✓ | — | — | 350–700 ❌ INFLATED |
| plomberie.debouchage_wc_simple | **200** | **280** | **450** | MEDIUM | 120–250 ❌ TOO LOW | — | 150–350 ⚠️ | — | — | — |
| plomberie.robinet_remplacement | **150** | **200** | **300** | MEDIUM | 120–250 ⚠️ | — | 150–350 ✓ | — | — | — |
| plomberie.chasse_eau | **200** | **280** | **400** | MEDIUM | — | — | — | — | — | — |
| plomberie.chauffe_eau_reparation | **300** | **400** | **600** | LOW | 200–450 ❌ LOW | 200–500 ❌ LOW | 200–500 ❌ LOW | 200–500 ❌ LOW | — | 600–1,500 ❌ INFLATED |
| plomberie.chauffe_eau_installation (électrique, MO) | **300** | **400** | **600** | LOW | 300–700 ✓ | — | 300–900 ⚠️ HIGH CEIL | 200–500 ⚠️ LOW | — | 600–1,500 ❌ INFLATED |
| plomberie.sanitaire_lavabo | **200** | **300** | **500** | LOW | — | — | — | — | — | — |
| plomberie.sanitaire_wc_standard | **300** | **380** | **500** | LOW | — | — | — | — | — | — |
| plomberie.salle_de_bain (MO only) | **QUOTE REQUIRED** | **—** | **—** | INSUFFICIENT | 800–2,000 ❌ | — | 1,500–5,000 ❌ TOO LOW | 1,500–5,000 ❌ TOO LOW | — | — |
| plomberie (generic category) | 150–350 (simple) | — | — | MEDIUM | 120–250 ⚠️ | 120–350 ⚠️ | 150–500 ✓ | 150–400 ✓ | 150–500 ✓ | 300–900 ⚠️ |

**Legend:**
- ✓ = Within acceptable range of market evidence
- ⚠️ = Partially acceptable but with issues (floor too low, ceiling too high, or too wide)
- ❌ = Significantly misaligned with market evidence
- — = Not present in this source

---

## Diagnosis by Source

### faee-v1 (active, lazy-loaded on index.html)

| Issue | Severity | Detail |
|-------|----------|--------|
| Floor of 120 DH | HIGH | Below artisan economic floor (150 DH minimum for Casablanca). Displays prices that are not economically viable for a quality artisan. |
| Heavy complexity tier conflates urgency | HIGH | faee-v1 "urgent" tier prices (plomberie urgent 250–550) are LOWER than "heavy" complexity (400–900). Urgency should be a condition modifier, not a complexity tier. |
| Coverage gap | MEDIUM | faee-v1 misses: chasse_eau, fuite_encastree, fuite_localisation, débouchage_colonne, all sanitaire sub-services |
| Category normalization coupled | MEDIUM | `_normalizeArtisanCategory()` is coupled to filtering — cannot be changed without regression risk |

### faee-v2-hero (dead — never loaded)

| Issue | Severity | Detail |
|-------|----------|--------|
| Dead code | HIGH | `fixeo-estimation-v2-hero.js` contains the most complete pricing matrix (17 categories) but is never referenced. Should NOT be deleted. Should be used as a migration source in Phase 7B.5. |
| Floor of 120 DH | HIGH | Same floor issue as faee-v1. |
| Best available FIXEO matrix | MEDIUM | faee-v2 has better category coverage than faee-v1. Migration should prefer faee-v2's category structure over faee-v1's. |

### fixeo-pricing-marocain.js (active, post-7B.1 hotfix)

| Issue | Severity | Detail |
|-------|----------|--------|
| Post-7B.1: dual-field architecture | RESOLVED | Real artisan prices now preserved. Market-reference values stored under `marketPrice*` namespace. |
| `_toFixeo()` priceType | LOW (open) | Still sets `priceType: 'fixed_estimate'` for declared-price artisans. Deferred to 7B.4. |
| SERVICE_PRICING category keying | OPEN | Race condition with reservation.js (service-name keyed) still unresolved. No regression since reservation.js uses its own getters. |

### reservation.js (active)

| Issue | Severity | Detail |
|-------|----------|--------|
| "Urgence plomberie" 200–400 DH | HIGH | Market evidence supports +50–100% for night urgence, making true urgent plumbing night intervention 300–700 DH. 200 DH floor is too low for a genuine emergency. |
| "Salle de bain" 1,500–5,000 DH | HIGH | Market evidence shows 5,000–15,000+ DH (MO only) for complete renovation. The 1,500 DH floor significantly understates the actual scope. |
| "Fuite d'eau" 150–300 DH | OK | Aligns with market evidence for fuite_simple. |
| "Installation sanitaire" 250–600 DH | REASONABLE | Covers individual element installation. Consistent with market evidence for lavabo+WC range. |

### AIRE PRICE_MAP (active, fallback)

| Issue | Severity | Detail |
|-------|----------|--------|
| 150–500 DH for all plomberie | MEDIUM | Catch-all range. Reasonable as an absolute fallback but too coarse to be helpful. No service distinction. |

### pSEO (generate-pseo-v2.js — active, generates live pages)

| Issue | Severity | Detail |
|-------|----------|--------|
| "Intervention simple" 300–600 DH | HIGH | Displayed on public SEO pages. Market evidence: 150–350 DH for simple fuite/débouchage. pSEO inflates by approximately 2×. |
| "Dépannage urgence" 500–900 DH | MEDIUM | Reasonable for true night+complex emergency. Acceptable if properly labeled as urgence. |
| "Remplacement chauffe-eau" 600–1,500 DH | HIGH | If MO only: inflated vs. market evidence (300–600 DH). If includes equipment: understated for 80L units (1,200–2,000 DH equipment only). |
| "Déplacement + diagnostic" 150–250 DH | OK | Slightly high but defensible for Casablanca context. Acceptable. |

---

## Priority Action Items (for Phase 7B.5 migration)

Ranked by user impact:

1. **pSEO "Intervention simple" 300–600 DH** — currently displayed on ~30+ public pages. Should be corrected to 150–350 DH (or removed pending 7B.8 full SEO migration).

2. **faee-v1/faee-v2 floor of 120 DH** — shown in estimator. Should be raised to 150 DH minimum.

3. **Urgence conflation** — faee-v1 treats urgency as complexity tier. Should be separated into condition modifier.

4. **reservation.js "Salle de bain" floor 1,500 DH** — shown in booking flow. Should be corrected or replaced with "Devis sur mesure" for salle_de_bain scope.

5. **Diagnostic fee absent** — no current FIXEO surface shows the call-out/diagnostic fee as a separate line. All legacy sources embed it in the intervention price. The canonical model separates it — this is a product change.

---

## What This Comparison Tells Us

The FIXEO pricing sources are internally inconsistent across 10 different maps (see Phase 7B audit). However, the order of magnitude for simple plumbing interventions is approximately correct in most sources (150–400 DH range). The primary failure modes are:

1. **Under-floored** — 120 DH is not economically viable for a professional Casablanca artisan
2. **pSEO inflated** — simple services priced at 2× market reality on public pages
3. **Salle de bain understated** — renovation minimum is 5× higher than current display
4. **Urgency mispriced** — surcharges are 2–3× below market evidence
5. **Diagnostic fee invisible** — no surface separates the call-out fee from the repair price

The canonical V0 registry provides the first evidence-based foundation to address all five failure modes in sequence during Phase 7B.5–7B.8.
