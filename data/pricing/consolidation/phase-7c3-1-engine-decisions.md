# FIXEO Phase 7C.3.1 — Engine-Blocking Decisions & Contract Finalization
## Status: COMPLETE — PRICING ENGINE CORE V1 READY FOR IMPLEMENTATION
**Date:** 2026-08-09  
**Phase:** 7C.3.1  
**Starting HEAD:** `d3f4cbf37bbae400d89405e987f2a11ec84c808e` (Phase 7C.3)  
**Production diff:** 0  

---

## 1. Baseline Verification

| Check | Result |
|-------|--------|
| HEAD | `d3f4cbf` — Phase 7C.3 |
| 7C.1.1 validator | 91/91 PASS |
| 7C.2 validator | 130/130 PASS |
| 7C.3 validator | 92/92 PASS |
| Services | 53 |
| All approved prices | Unchanged |
| Production diff | 0 |

---

## 2. HRQ-001 — Plomberie Semantics Confirmation

**Status: RESOLVED**

### Human Decision
`plomberie.robinet_remplacement` and `plomberie.chasse_eau` are canonically:

```
calculation_model = LABOUR_FIXED_PART_SEPARATE
commercial_output_type = FIXEO_LABOUR_PRICE_PLUS_PART
```

### Reason
V0.3 human decisions explicitly exclude the principal replacement hardware:
- `robinet_remplacement`: robinet/mitigeur excluded
- `chasse_eau`: mécanisme de chasse excluded

The approved FIXEO amount represents **LABOUR + TRAVEL + FROZEN SMALL CONSUMABLES** only.

### Classification
`CANONICAL_SEMANTIC_CONFIRMATION` — NOT a price change, NOT a scope change, NOT a new human price decision.

### Effect on Engine
Both services remain fully engine-executable at their approved prices (250 MAD and 300 MAD respectively). The `FIXEO_LABOUR_PRICE_PLUS_PART` commercial output type governs the artisan-disclosed separate parts protocol.

---

## 3. HRQ-002 — Painted M² Engine Strategy

**Status: RESOLVED_FOR_ENGINE / PRODUCTION_UX_REVIEW_REMAINS**

### Human Decision: Engine V1 Measurement Doctrine

```
engine_measurement_strategy = DIRECT_CANONICAL_MEASUREMENT
```

**Engine receives:** `painted_m2` directly as a required input.

**Engine validates:** painted_m2 (non-zero positive number, reasonable range)

**Engine applies:** approved unit formula (35/65/45/75/25 MAD × painted_m2)

**Engine does NOT:**
- Derive painted_m2 from floor_area_m2
- Infer wall perimeter from room dimensions
- Apply 1.6x / 2.0x multipliers
- Guess room geometry

**Applies to:** PEIN-002, PEIN-003, PEIN-005, PEIN-008

### Existing Conversion — Status Unchanged

```
floor_to_painted_UNVALIDATED:
  conversion_status = RESEARCH_ESTIMATION_ONLY
  production_allowed = false
  engine_v1_use = false
```

No 1.6x/2.0x factor is canonical. Peinture ceiling→floor conversion remains RESEARCH_ESTIMATION_ONLY.

### Future UX Doctrine

A future estimator UI **MAY** provide a `GUIDED_PAINTED_SURFACE_CALCULATOR`.

This is:
- NOT part of Pricing Engine Core V1
- NOT a canonical price formula
- Requires separate design + validation
- Client must see and confirm the resulting painted_m2 before price execution
- Engine still receives only `painted_m2` — never floor_area_m2

**ENGINE CONTRACT ≠ UX MEASUREMENT ASSISTANT**

This separation is explicit and frozen.

---

## 4. HRQ-003 — Menuiserie Batch Rules

**Status: RESOLVED_FOR_ENGINE / EXPERIMENTAL_RULE_REMAINS_DORMANT**

### Human Decision: Engine V1 Scope

```
MENU_002: engine_v1_base_quantity = 1
MENU_003: engine_v1_base_quantity = 1
engine_v1_executes_batch = false
```

**Engine V1 pricing scope:**
- `MENU_002`: exactly ONE qualifying hinge replacement labour scope → 300 MAD
- `MENU_003`: exactly ONE qualifying drawer runner replacement labour scope → 300 MAD

**If hinge_count > 1 or drawer_count > 1:**
Engine V1 returns canonical qualification result: `REQUALIFY` with pricing disposition `QUOTE_REQUIRED`.

**Base approved prices UNCHANGED:**
- MENU_002 = 300 MAD (labour, 1 hinge)
- MENU_003 = 300 MAD (labour, 1 drawer runner)

### Experimental Values

Experimental batch increments are **preserved as research history** — NOT deleted:
- MENU_002: +50 MAD / additional hinge
- MENU_003: +100 MAD / additional drawer

Status: `EXPERIMENTAL_BATCH_RULE` / `NOT_PROMOTED_TO_UNIVERSAL_CANONICAL` / **DORMANT**

### Future Promotion Path

Experimental batch rules may only be promoted after:
1. Explicit human approval
2. (Preferably) normalized FIXEO field mission evidence

---

## 5. Updated Human Review Queue

After all three decisions above:

| ID | Status | Engine Block | Prod Block |
|----|--------|-------------|-----------|
| HRQ-001 | RESOLVED | ❌ | ❌ |
| HRQ-002 | RESOLVED_FOR_ENGINE | ❌ | ✅ UX review |
| HRQ-003 | RESOLVED_FOR_ENGINE | ❌ | ❌ |
| HRQ-004 | OPEN | ❌ | ✅ NET-030 field data |
| HRQ-005 | OPEN | ❌ | ✅ Pilot missions |
| HRQ-006 | OPEN | ❌ | ✅ CLIM-025 calibration |
| HRQ-007 | OPEN | ❌ | ❌ |
| HRQ-008 | OPEN | ❌ | ✅ Legal + Darija copy |
| HRQ-009 | OPEN | ❌ | ❌ UNRESOLVED_NON_BLOCKING |
| HRQ-010 | OPEN | ❌ | ❌ Correct by design |

**ENGINE_BLOCKING = 0 ✅**  
**PRODUCTION_BLOCKING = 5**  
**NON_BLOCKING / RESOLVED = 5**

---

## 6. Fractional Hour Safety

No fractional-hour billing doctrine silently invented.

```
net_002_engine_v1 = INTEGER_HOURS_ONLY
bric_002_engine_v1 = INTEGER_HOURS_ONLY
non_integer_behavior = UNRESOLVED_NON_BLOCKING
nearest_30min_invented = false
```

`EXACT_INTEGER_MAD` rounding remains frozen and unchanged.

If Engine Core can accept integer hours only in V1, that is explicitly documented. Decimal handling remains UNRESOLVED_NON_BLOCKING until explicit billing increments are frozen.

---

## 7. Engine Readiness Gates

| Gate | Required | Result |
|------|----------|--------|
| 0 engine-blocking HRQ items | ✅ | ✅ 0 |
| All required canonical inputs defined | ✅ | ✅ 34 inputs |
| No engine use of unvalidated conversion | ✅ | ✅ RESEARCH_ESTIMATION_ONLY |
| No engine execution of experimental batch | ✅ | ✅ DORMANT |
| No price changed | ✅ | ✅ 53/53 unchanged |
| No runtime integration exists | ✅ | ✅ 0 runtime refs |

**ENGINE_CORE_V1_READY = true**

This does NOT mean:
- `production_ready = true`
- Any service is activated
- Deployment is approved

All 53 services: `production_ready = false`  
All activation flags: `false`

---

## 8. Artifacts Created

| File | Content |
|------|---------|
| `engine-readiness.v1.draft.json` | Full engine V1 readiness contract |
| `phase-7c3-1-engine-decisions.md` | This document |
| `validate-7c3-1.js` | 25-check validator |

## Artifacts Modified

| File | Change |
|------|--------|
| `canonical-registry.v1.draft.json` | CANONICAL_SEMANTIC_CONFIRMATION on robinet/chasse_eau; DIRECT_CANONICAL_MEASUREMENT on PEIN-002/003/005/008; engine_v1_base_quantity=1 + REQUALIFY behavior on MENU_002/003; engine_contract block in _meta |
| `human-review-queue.v1.draft.json` | All 10 items reclassified; ENGINE_BLOCKING → 0 |

---

## 9. Production Runtime Diff = 0

Confirmed. Only `data/pricing/canonical/` and `data/pricing/consolidation/` modified.

---

## 10. Final Status

```
PHASE 7C.3.1 — FIXEO ENGINE-BLOCKING DECISIONS & CONTRACT FINALIZATION
— COMPLETE — PRICING ENGINE CORE V1 READY FOR IMPLEMENTATION
```
