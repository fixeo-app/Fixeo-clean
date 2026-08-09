# FIXEO Pricing Engine — Shadow Validation V1

```
phase:         PHASE_7C5_SHADOW_VALIDATION
status:        SHADOW_VALIDATION_READY = true
production:    DORMANT / NOT ACTIVE
```

## ⚠️ DORMANT — NOT CONNECTED TO PRODUCTION

## Files

| File | Purpose |
|------|---------|
| `shadow-scenarios.v1.json` | 195 shadow scenarios (independently built expectations) |
| `shadow-runner-v1.js` | Runs scenarios, classifies results |
| `shadow-results.v1.json` | Latest run results (auto-generated) |
| `shadow-validator-v1.js` | Full validation suite (prior validators + shadow + gate) |
| `legacy-shadow-comparison.v1.json` | Legacy T0 price collision analysis |
| `shadow-human-review.v1.md` | Human review report |

## Running

```bash
# Shadow runner only
node data/pricing/shadow/shadow-runner-v1.js

# Full validation (all validators + shadow + gate)
node data/pricing/shadow/shadow-validator-v1.js
```

## Results (Phase 7C.5)

| Metric | Result |
|--------|--------|
| Total scenarios | 195 |
| PASS_EXACT | 176 |
| PASS_SEMANTIC | 19 |
| FAIL | 0 |
| Critical failures | 0 |
| Shadow gate | ✅ READY |

## Coverage

| Métier | Scenarios |
|--------|-----------|
| Plomberie | 20 |
| Electricite | 21 |
| Serrurerie | 24 |
| Climatisation | 29 |
| Bricolage | 21 |
| Nettoyage | 28 |
| Peinture | 29 |
| Menuiserie | 23 |

- 53/53 canonical services covered
- All 8 métiers ≥ 15 scenarios

## Bugs Found in Shadow Validation (all fixed)

1. **BRIC-010/020 model**: FIXED → UNIT_MULTIPLICATION (PER_ITEM_FORFAIT unambiguous from V0.3)
2. **33 inputs missing**: All exclusion triggers + modifier inputs added to canonical-inputs registry
3. **Exclusion prose triggers not evaluated**: parseTrigger() implemented in engine core
4. **Zero-quantity not rejected**: NEGATIVE_QUANTITY now fires for val ≤ 0 on quantity inputs
5. **mcb_defect_confirmed type**: boolean → string (was inconsistent with condition enum values)

No approved prices changed. No doctrine changed. ENGINE_CORE_V1_READY = still true.
