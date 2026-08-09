# FIXEO Pricing Engine — Phase 7C.5.1
## Post-Shadow Freeze & Legacy Runtime Conflict Audit

**Date:** 2026-08-09 | **Status:** COMPLETE

---

## PHASE_7C5_1_READY = true

---

## 1. Git History Anomaly Resolution

**Reported anomaly:** Delivery report listed "Starting HEAD = b715bec = Final commit = b715bec" yet described multiple new/modified files.

**Resolution: REPORTING_ONLY_ANOMALY**

The delivery report's "Starting HEAD" field referred to the HEAD *at the moment the final delivery report was written*, not the HEAD at the start of Phase 7C.5. The actual Phase 7C.5 series committed four commits:

| Commit | Message |
|--------|---------|
| `6f90b49` | Phase 7C.5 — FIXEO Pricing Engine Shadow Validation (interim: bug fixes + scenarios) |
| `f4d0b4a` | Phase 7C.5 — Fix validator ref filter to include data/pricing/shadow/ |
| `91eb109` | Phase 7C.5 — FIXEO Pricing Engine Shadow Validation — COMPLETE |
| `b715bec` | Phase 7C.5 — Update test reports (final run) |

**True Phase 7C.4 starting commit:** `49faa5c19feb6162c1908048ea16b88128752510`
**True Phase 7C.5 first commit:** `6f90b49da6ba9085b1d3d87d6ab447933245a47f`
**True Phase 7C.5 final commit:** `b715bec1ad853af02eb70a5e25c4621f98f63061`
**Current HEAD:** `b715bec1ad853af02eb70a5e25c4621f98f63061`

Repository history is healthy. No history rewrite needed or performed.

---

## 2. Full Validator Re-Run from Final Corrected State

All validators re-run from HEAD `b715bec`. All pass.

| Validator | Result |
|-----------|--------|
| Phase 7C.1.1 | **91/91 PASS** ✅ |
| Phase 7C.2 | **130/130 PASS** ✅ |
| Phase 7C.3 | **92/92 PASS** ✅ |
| Phase 7C.3.1 | **77/77 PASS** ✅ |
| Engine schema (53 svc) | **664/664 PASS** ✅ |
| Engine test suite | **209/209 PASS** ✅ |
| Golden fixtures | **37/37 PASS** ✅ |
| Shadow runner | **195 scenarios: 176 PASS_EXACT + 19 PASS_SEMANTIC, 0 FAIL** ✅ |
| Shadow validator | **24/24 PASS** ✅ |
| Regression 7C.5 (new) | **49/49 PASS** ✅ |

Zero failures. Zero production changes.

---

## 3. Post-Fix Regression Lock

New file: `data/pricing/engine/tests/regression-7c5-v1.js` — **49 regression tests, 49/49 PASS**

### A. BRIC-010 (bricolage.montage_meuble) — PROTECTED

- `item_count=1` → 200 MAD ✅
- `item_count=2` → 400 MAD (was 200 with FIXED model — regression caught) ✅
- `item_count=3` → 600 MAD ✅
- `item_count=5` → 1000 MAD (floor 200 non-additive, 1000 > 200) ✅
- Missing item_count → MISSING_REQUIRED_INPUT ✅
- `item_count=0` → NEGATIVE_QUANTITY ✅
- `item_count=-1` → NEGATIVE_QUANTITY ✅
- calculation_model = UNIT_MULTIPLICATION confirmed ✅

### B. BRIC-020 (bricolage.fixation_accrochage) — PROTECTED

- `item_count=1` → 200 MAD ✅
- `item_count=2` → 400 MAD (was 200 — regression caught) ✅
- `item_count=4` → 800 MAD ✅
- `item_count=0` → NEGATIVE_QUANTITY ✅
- Missing → MISSING_REQUIRED_INPUT ✅
- calculation_model = UNIT_MULTIPLICATION confirmed ✅

### C. Hard Exclusion Trigger — PROTECTED

**Safety exclusion (STOP_SAFETY):**
- `electricite.disjoncteur_remplacement` + `burning_smell=true` → STOP_SAFETY (was phantom price before parseTrigger fix) ✅
- `electricite.disjoncteur_remplacement` + `scorch_marks=true` → STOP_SAFETY ✅
- No false positive: `burning_smell=false` + `scorch_marks=false` → 250 MAD ✅

**Requalify/Quote exclusion:**
- `climatisation.installation.standard` + `multi_split=true` → QUOTE_REQUIRED (was phantom price before fix) ✅
- No false positive: `multi_split=false` + height ≤ 2.5 → 1000 MAD ✅

### D. Zero-Quantity Rejection — PROTECTED

- `climatisation.entretien_annuel` `ac_count=0` → NEGATIVE_QUANTITY ✅
- `bricolage.horaire` `hours=0` → NEGATIVE_QUANTITY ✅
- `nettoyage.menage_standard` `worker_count=0` → NEGATIVE_QUANTITY ✅
- `peinture.mur_interieur.labour_only` `painted_m2=0` → NEGATIVE_QUANTITY ✅
- Positive quantities confirmed still working (no regression in valid path) ✅

### E. mcb_defect_confirmed Type — PROTECTED

- `mcb_defect_confirmed=true` (boolean) → INVALID_INPUT_TYPE ✅
- `mcb_defect_confirmed=false` (boolean) → INVALID_INPUT_TYPE ✅
- `mcb_defect_confirmed='physically_broken'` (string) → no type error ✅
- `mcb_defect_confirmed='trips_repeatedly'` (string) → INELIGIBLE (not INVALID_INPUT_TYPE — correct type, wrong condition value) ✅

---

## 4. Shadow Freeze

Freeze manifest written: `data/pricing/shadow/shadow-freeze-manifest.v1.json`

Key hashes (SHA-256):
- canonical_registry: `c32515f8...`
- canonical_inputs: (see manifest)
- shadow_scenarios: `3f13a3bf...`
- golden_fixtures: (see manifest)

Git commit frozen: `b715bec1ad853af02eb70a5e25c4621f98f63061`

---

## 5. Active Legacy Pricing Runtime Audit

### Files Audited

1. **`js/fixeo-estimation-engine-v1.js`** — ACTIVE_EXECUTED
2. **`js/fixeo-pricing-marocain.js`** — ACTIVE_EXECUTED
3. **`js/reservation.js`** — ACTIVE_EXECUTED
4. **`js/reservation-v2.js`** — ACTIVE_EXECUTED

### Key Findings

**Both `reservation.js` AND `reservation-v2.js` are loaded on 353 of the same pages**, simultaneously, in that order (reservation.js → line 314, reservation-v2.js → line 316, both `defer`).

**`reservation.js`** wraps itself in `(function(window){…})(window)` IIFE. Its `SERVICE_PRICING` const is IIFE-local — NOT exposed as `window.SERVICE_PRICING`. It exposes only `window.FixeoReservation`.

**`reservation-v2.js`** calls `_getSvcPrice(svcName)` which tries `window.SERVICE_PRICING` (undefined) → falls to its own `SVC_PRICING_FB` fallback map.

**`fixeo-pricing-marocain.js`** exposes `window.FixeoPricing.SERVICE_PRICING` but this is métier-level ranges, not the per-service price. `reservation-v2.js` does NOT read `window.FixeoPricing.SERVICE_PRICING`.

---

## 6. P0 Peinture Contradiction Audit

### Exact Source

**reservation.js line 110:**
```javascript
const SERVICE_PRICING = {
  'Peinture intérieure': { from: 800, to: 1500 },
```
**Semantic:** Absolute project range in MAD. Used in Step 1 pills and Step 2 summary total.

**reservation-v2.js lines 203:**
```javascript
var SVC_PRICING_FB = {
  'Peinture intérieure': { from: 20, to: 60 },
```
**Semantic:** AMBIGUOUS. Could be per-m² (consistent with regional painting labor markets) or a severely wrong absolute range. NOT confirmed by code comments. Legacy comment only says "mirrors reservation.js SERVICE_PRICING map" — this is factually incorrect (values differ).

### Which values reach the client?

**Both simultaneously on 353+ pages:**

| Block | Source | Value shown | Client impact |
|-------|--------|-------------|--------------|
| Step 1 service pill label | `reservation.js` `SERVICE_PRICING` | `800–1500 MAD` | Shown when user selects Peinture intérieure in booking step 1 |
| Step 2 summary base | `reservation.js` `SERVICE_PRICING[service].from` | `800 MAD` | Used as `serviceTotal` base in booking confirmation |
| V2 estimation block | `reservation-v2.js` `SVC_PRICING_FB` (fallback) | `20–60 MAD — estimation indicative` | Shown in separate estimation card above or alongside booking modal |

**Result:** A client booking Peinture intérieure sees `20–60 MAD` in the estimation block, then `800–1500 MAD` in the booking step — a 40× discrepancy, presented simultaneously on the same page.

### Severity: P0 — Active client-facing contradiction on 353+ production pages.

### Canonical Position

Canonical approved peinture models (all per-m² with 800 MAD floor):
- `peinture.mur_interieur.all_in`: 65 MAD/m² (minimum 800 MAD project)
- `peinture.mur_interieur.labour_only`: 35 MAD/m²
- `peinture.mur_interieur.all_in_avec_prep`: 75 MAD/m²
- `peinture.plafond.labour_only`: 45 MAD/m²

Neither the `800–1500 MAD` absolute range NOR the `20–60 MAD` range directly corresponds to the canonical per-m² model.

---

## 7. Legacy Runtime Conflict Matrix

See: `data/pricing/shadow/legacy-runtime-conflict-matrix.v1.json`

### Summary by Priority

| Priority | Count | Key Items |
|----------|-------|-----------|
| P0 | 2 | Peinture booking contradiction; reservation.js booking total must be replaced |
| P1 | 4 | City multipliers; urgency/night/weekend modifiers; diagnostic floors; labour/all-in ambiguity |
| P2 | 2 | Métier-level range cleanup; minimum floor additive risk cleanup |

---

## 8. Estimator Design Preconditions

| Gate | Status | Notes |
|------|--------|-------|
| `estimator_design_blocked` | **false** | Legacy conflicts do NOT block design work |
| `dormant_orchestration_blocked` | **false** | Legacy conflicts do NOT block dormant implementation |
| `production_activation_blocked` | **true** | P0 legacy conflicts + 5 open HRQ production blockers |

**Doctrine:** Legacy conflicts do NOT block estimator design or dormant orchestration. They MUST be resolved before production activation. No dual-authority pricing ever.

---

## 9. Canonical Source-of-Truth Doctrine (Reaffirmed)

The canonical registry + FIXEO_PRICING_ENGINE_CORE_V1 are the future source of truth.

**Forbidden in future Estimator V1:**
- Calling legacy pricing as fallback
- Merging legacy ranges with canonical prices
- Applying city multipliers
- Applying urgency/night/weekend surcharges
- Dual-authority pricing (two systems pricing the same service)

**Required in future Estimator V1:**
- Single `evaluateFixeoPrice()` call per service
- Exact canonical approved price
- city_adjustment = null
- All modifiers = null
- EXACT_INTEGER_MAD rounding
- `production_ready=false` gate enforced before any activation

---

## 10. Files Created

```
data/pricing/shadow/
├── shadow-freeze-manifest.v1.json
├── legacy-runtime-conflict-matrix.v1.json
├── phase-7c5-1-post-shadow-audit.md  ← this file
└── validate-7c5-1.js                 ← (created separately)

data/pricing/engine/tests/
└── regression-7c5-v1.js              ← 49/49 PASS
```

---

*Phase 7C.5.1 audit only. No production files modified. No deployment. Engine dormant.*
