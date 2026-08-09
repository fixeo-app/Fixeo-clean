# NETTOYAGE — Legacy FIXEO Price Comparison
## Phase 7B.8 — Research Only

All legacy values classified as **T0_INTERNAL_LEGACY**.
None may be preserved merely because they already exist.

---

## Legacy Values Found

### Source: `fixeo-pricing-marocain.js`
```
nettoyage: { from: 200, to: 600, label: 'À partir de 200 MAD', range: '200–600 MAD' }
```
**Classification**: T0_INTERNAL_LEGACY  
**Verdict**: LEGACY_SCOPE_AMBIGUOUS  
**Analysis**: Single undifferentiated bucket for all nettoyage. 200–600 MAD range is not wrong but masks the full taxonomy. The lower bound (200 MAD) aligns with the market for a minimum residential visit. The upper (600 MAD) is consistent with a standard F2/F3 apartment ponctuel. However, this range ignores: deep-clean (700–1500 MAD), post-construction (800–2000+ MAD), upholstery services (150–750 MAD per item), and the nettoyage après travaux band entirely.  
**Action**: Must be replaced by per-service registry. This single range is architecturally wrong for FIXEO.

---

### Source: `fixeo-estimation-v2-hero.js`
```
nettoyage: {
  simple:  { from: 150, to: 300 },
  medium:  { from: 250, to: 550 },
  heavy:   { from: 400, to: 900 },
  urgent:  { from: 250, to: 500 }
}
```
**Classification**: T0_INTERNAL_LEGACY  
**Verdict for simple tier (150–300)**: LEGACY_REASONABLE  
**Verdict for medium tier (250–550)**: LEGACY_REASONABLE  
**Verdict for heavy tier (400–900)**: LEGACY_REASONABLE (for residential deep-clean)  
**Verdict for urgent tier (250–500)**: LEGACY_ARCHITECTURE_WRONG — "urgent" is not a pricing tier; it is a modifier (currently null per program doctrine)  
**Analysis**: The simple/medium/heavy three-tier structure has merit as a complexity model. The price ranges are broadly consistent with external evidence for residential standard cleaning. However: (1) "urgent" as a price tier is architecturally wrong — urgency is a modifier, not a service type; (2) the ranges conflate worker count; (3) no service-level differentiation (post-construction vs standard vs textile).  
**Action**: Complexity tiers are useful as an estimator UX concept but must be rebuilt as service-specific complexity modifiers, not as service codes.

---

### Source: `fixeo-profile-v2a.js`
```
'Nettoyage': { from: 200, label: 'Dès 200 MAD' }
Nettoyage après travaux: { from: 300, to: 700 }
```
**Classification**: T0_INTERNAL_LEGACY  
**Verdict (Nettoyage from: 200)**: LEGACY_REASONABLE as minimum display  
**Verdict (Nettoyage après travaux 300–700)**: LEGACY_TOO_LOW  
**Analysis**: The 200 MAD "à partir de" display is reasonable and consistent with the market minimum. However, the post-construction range of 300–700 MAD is below the market evidence: Rabat provider: 800–2000 MAD; per-m² data (12–25 MAD/m²) for even a 60m² apartment yields 720–1500 MAD. A 300 MAD floor for post-construction cleaning is inadequate and risks artisan non-viability.  
**Action**: Post-construction legacy values must NOT be used as anchor. External evidence (12–25 MAD/m², minimum 800 MAD) must replace.

---

## Summary Table

| Legacy Value | Source | Classification | Verdict |
|---|---|---|---|
| Nettoyage 200–600 MAD | fixeo-pricing-marocain.js | T0_INTERNAL_LEGACY | LEGACY_SCOPE_AMBIGUOUS |
| Simple 150–300 MAD | fixeo-estimation-v2-hero.js | T0_INTERNAL_LEGACY | LEGACY_REASONABLE |
| Medium 250–550 MAD | fixeo-estimation-v2-hero.js | T0_INTERNAL_LEGACY | LEGACY_REASONABLE |
| Heavy 400–900 MAD | fixeo-estimation-v2-hero.js | T0_INTERNAL_LEGACY | LEGACY_REASONABLE |
| Urgent 250–500 MAD | fixeo-estimation-v2-hero.js | T0_INTERNAL_LEGACY | LEGACY_ARCHITECTURE_WRONG |
| Nettoyage dès 200 MAD | fixeo-profile-v2a.js | T0_INTERNAL_LEGACY | LEGACY_REASONABLE |
| Après travaux 300–700 MAD | fixeo-profile-v2a.js | T0_INTERNAL_LEGACY | LEGACY_TOO_LOW |

---

## No Legacy Value Was Silently Preserved

Legacy values informed the comparison only. All research anchors derive from external Moroccan market evidence.

**Status**: LEGACY REVIEW COMPLETE — PHASE 7B.8
