# FIXEO Pricing Engine Core V1

```
engine_name:    FIXEO_PRICING_ENGINE_CORE
engine_version: 1.0.0-dormant
engine_type:    RULE_BASED_CANONICAL_PRICING_ENGINE
production_active: false
```

## ⚠️ DORMANT — NOT CONNECTED TO PRODUCTION

This engine is **not imported by any production runtime**. It exists solely for:
- Shadow validation
- QA and audit
- Test harness execution
- Future production integration (after all 10 production gates pass)

Do NOT import from: homepage, RAFI, reservation, artisan profiles, pSEO, API routes, Supabase.

---

## Architecture

```
data/pricing/engine/
├── pricing-engine-core-v1.js        Main evaluator — pure, deterministic
├── pricing-engine-loader-v1.js      Reads canonical draft contracts → in-memory bundle
├── pricing-engine-validator-v1.js   53-service schema compatibility checker
├── pricing-engine-cli-v1.js         Developer CLI (test-only)
├── pricing-engine-types-v1.md       Type contracts
├── fixtures/
│   └── golden-fixtures.v1.json      37 golden expected-output fixtures
├── tests/
│   └── engine-tests-v1.js           209-check test suite
├── engine-test-report.v1.json       Latest test run report
└── README.md                        This file
```

Reads from (read-only):
```
data/pricing/canonical/
  canonical-registry.v1.draft.json   53 approved services
  formula-registry.v1.draft.json     10 calculation formulas
  policy-registry.v1.draft.json      13 policies
  routing-registry.v1.draft.json     18 routes
  legacy-code-map.v1.draft.json      53 legacy code mappings

data/pricing/consolidation/
  canonical-inputs.v1.draft.json     35 canonical inputs
  engine-readiness.v1.draft.json     V1 readiness contract
  human-review-queue.v1.draft.json   HRQ status
```

---

## API

```js
const { evaluateFixeoPrice } = require('./pricing-engine-core-v1');

const result = evaluateFixeoPrice({
  service_code: 'plomberie.fuite_simple',  // canonical or legacy code
  inputs: {}
});
// result.ok = true
// result.pricing.final_amount_mad = 250
// result.provenance.production_ready = false (ALWAYS)
```

---

## Calculation Models Implemented (10/10)

| Model | Example |
|-------|---------|
| FIXED | plomberie.fuite_simple → 250 MAD |
| CONDITIONAL_FIXED | nettoyage.grand_menage (APARTMENT) → 600 MAD |
| UNIT_MULTIPLICATION | climatisation.entretien_annuel × ac_count |
| UNIT_MULTIPLICATION_WITH_FLOOR | PEIN-002 × painted_m2, floor 800 MAD |
| TIME_BASED_SINGLE | BRIC-002 × hours, min_billing=2 |
| TIME_BASED_TEAM | NET-002 × workers × hours, floor 200 MAD |
| MINIMUM_FLOOR | BRIC-001=200, PEIN-001=800 |
| LABOUR_FIXED_PART_SEPARATE | plomberie.robinet_remplacement, serrurerie.cylindre |
| ADD_ON | PEIN-008 × painted_m2, requires primary service |
| DIAGNOSTIC | plomberie.diagnostic=180, with absorption metadata |

---

## Key Engine Contracts

**Rounding:** `EXACT_INTEGER_MAD` — no nearest-5, no nearest-10. Non-integer → error.

**Painted m²:** `DIRECT_CANONICAL_MEASUREMENT` — engine receives `painted_m2` directly. Never derives from `floor_area_m2`.

**Menuiserie batch:** Engine V1 handles exactly 1 hinge (MENU_002) and 1 drawer runner (MENU_003). Quantity > 1 → `REQUALIFY / QUOTE_REQUIRED`. Experimental +50/+100 MAD increments are NOT executed.

**Fractional hours:** `UNSUPPORTED_FRACTIONAL_HOURS` — Engine V1 integer hours only. No nearest-30-min.

**Minimum floor:** `NON_ADDITIVE` — `final = max(floor, calculated)`. Never `floor + calculated`.

**Provenance:** All results carry `production_ready = false`. Always.

---

## Running Tests

```bash
# Full test suite (209 checks)
node data/pricing/engine/tests/engine-tests-v1.js

# Schema compatibility (664 checks across all 53 services)
node data/pricing/engine/pricing-engine-validator-v1.js

# CLI usage
node data/pricing/engine/pricing-engine-cli-v1.js plomberie.fuite_simple '{}'
node data/pricing/engine/pricing-engine-cli-v1.js PEIN-002 '{"painted_m2":25}'
node data/pricing/engine/pricing-engine-cli-v1.js --validate
node data/pricing/engine/pricing-engine-cli-v1.js --bench
node data/pricing/engine/pricing-engine-cli-v1.js --list
```

---

## Performance

| Operation | Time |
|-----------|------|
| Registry load (cold) | ~5 ms |
| Single evaluation | ~0.007 ms |
| 1000 evaluations | ~7 ms total |

---

## Security

- No `eval()`
- No `new Function()`
- No network access
- No DOM/browser/localStorage
- No environment secret access
- No SQL / Supabase
- Inputs treated as untrusted structured data
- Canonical registry loaded read-only from disk
