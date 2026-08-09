# FIXEO Canonical Pricing Registry — Design Proposal
## Phase 7C.1 — Audit Output

**Date:** 2026-08-09  
**Status:** DESIGN PROPOSAL — not implemented  
**Do not create canonical-registry.v1.json in this phase**

---

## 1. Top-Level Architecture

```json
{
  "meta": { ... },
  "policies": { ... },         // policy_id → policy object
  "services": [ ... ],         // all approved standardized services
  "formula_definitions": {},   // named formula types with parameters
  "service_code_mapping": {},  // frozen codes → canonical codes
  "versioning": { ... }
}
```

---

## 2. Meta Block

```json
{
  "meta": {
    "schema_version": "v1.0",
    "registry_version": "1.0.0",
    "generated_at": "...",
    "effective_from": "...",
    "status": "DRAFT|ACTIVE|FROZEN",
    "production_ready": false,
    "total_approved_services": 44,
    "metiers_covered": ["plomberie","electricite","serrurerie","climatisation","bricolage","nettoyage","peinture","menuiserie"]
  }
}
```

---

## 3. Policy Registry

Policies are referenced by `policy_id` from service entries. Not duplicated in each service.

```json
{
  "policies": {
    "POL-ANTI-DOUBLE-CHARGE": { ... },
    "POL-HORS-PERIMETRE": { ... },
    "POL-HARDWARE-DISCLOSURE": { ... },
    "POL-DIAGNOSTIC-ABSORPTION": { ... },
    "POL-ELECTRICAL-SAFETY": { ... },
    "POL-REFRIGERATION-INTEGRITY": { ... },
    "POL-SERRURERIE-AUTHORIZATION": { ... },
    "POL-PAINTED-SURFACE-CONVERSION": { ... },
    "POL-CLEANER-HOUR-TEAM": { ... },
    "POL-FIXEO-DUAL-FAIRNESS": { ... },
    "POL-CITY-NULL": { ... },
    "POL-MODIFIERS-NULL": { ... },
    "POL-DISCLAIMER": { ... }
  }
}
```

---

## 4. Canonical Service Entry Schema

```json
{
  "canonical_service_code": "plomberie.fuite_simple",
  "legacy_code_mapping": ["plomberie.fuite_simple"],
  "metier": "plomberie",
  "label_fr": "Fuite simple accessible",
  "label_ar": null,
  "status": {
    "human_decision": "APPROVED",
    "production_ready": false,
    "availability": "STANDARDIZED"
  },
  "price_model": {
    "type": "CONDITIONAL_FIXED",
    "currency": "MAD",
    "fixed_amount": 250,
    "unit": "FLAT_INTERVENTION",
    "formula": "FIXED",
    "min_amount": null
  },
  "materials": {
    "consumables_policy": "CONSUMABLES_UP_TO_50_MAD_INCLUDED",
    "parts_policy": "PARTS_OVER_50_MAD_SEPARATE_DISCLOSED",
    "equipment_policy": "ARTISAN_SUPPLIED"
  },
  "hardware": {
    "policy": "NA"
  },
  "diagnostic": {
    "required": false,
    "mode": "NONE",
    "fee": null,
    "absorption_rule": null
  },
  "batch": {
    "has_batch_rule": false
  },
  "measurement": {
    "required_inputs": ["service_selection", "access_description"],
    "optional_inputs": [],
    "quantity_input": null
  },
  "eligibility": {
    "conditions": ["accessible visible leak", "no wall/slab opening required"],
    "hard_exclusions": ["hidden leak requiring excavation → QUOTE", "pipe replacement → QUOTE"],
    "escape_policy_ref": "POL-HORS-PERIMETRE"
  },
  "routing": [
    {"trigger": "leak inside wall or slab", "target": "plomberie.fuite_localisation", "type": "HARD"},
    {"trigger": "sanitaire installation needed", "target": "plomberie.sanitaire QUOTE", "type": "HARD"}
  ],
  "safety": {
    "policy_refs": []
  },
  "provenance": {
    "price_provenance": "FIXEO_HUMAN_CALIBRATED_PILOT",
    "maturity": "LEVEL_0_EXTERNAL_RESEARCH_HUMAN_CALIBRATION",
    "research_phase": "7B.3.3",
    "confidence": "MEDIUM",
    "research_commit": "de55eba"
  },
  "city_adjustment": null,
  "urgency_modifier": null,
  "night_modifier": null,
  "weekend_modifier": null,
  "holiday_modifier": null,
  "express_modifier": null,
  "client_disclaimer_ref": "POL-DISCLAIMER"
}
```

---

## 5. Service Code Convention — Recommended: OPTION B

**Proposal: canonical dot-notation with metier prefix**

```
{metier}.{service_slug}
{metier}.{service_slug}.{variant}    (for sub-variants like interrupteur.simple)
```

Examples:
```
plomberie.diagnostic
plomberie.fuite_simple
electricite.prise_remplacement
electricite.interrupteur_remplacement.simple
electricite.interrupteur_remplacement.va_et_vient
serrurerie.porte_claquee_ouverture
climatisation.entretien_annuel
bricolage.minimum_visit
bricolage.montage_meuble
nettoyage.grand_menage
peinture.mur_interieur_labour_only
menuiserie.reglage_porte
menuiserie.reglage_porte.avec_rabotage
menuiserie.charniere_remplacement
```

**Why Option B:**
- Human-readable in code and logs
- Self-documenting (metier + service obvious from code)
- No brittle BRIC-001 / NET-030 numeric codes requiring lookup tables
- Supports variants via sub-key without breaking existing codes
- Existing frozen codes become `legacy_code_mapping[]` reference

**Rejected: Option A (verbatim)** — inconsistent: plomberie uses dot.notation, bricolage/nettoyage/peinture use PREFIX-NNN. Cannot coexist in one canonical schema.

**Rejected: Option C (numeric)** — no readability; requires lookup tables; maintenance burden.

---

## 6. Formula Engine Requirements

| Formula ID | Inputs | Formula | Used By |
|-----------|--------|---------|---------|
| FIXED | approved_fixed_price | price = approved_fixed_price | plomberie, electricite, serrurerie, climatisation, bricolage, nettoyage (items), menuiserie |
| MAX_FLOOR | service_price, min_amount | price = max(min_amount, service_price) | bricolage BRIC-001, nettoyage NET-001, peinture PEIN-001, menuiserie floor |
| UNIT_MULTIPLICATION | unit_rate, quantity | price = unit_rate × quantity | bricolage (hourly, per-item), nettoyage (m²), climatisation (per-AC) |
| WORKER_HOUR | rate_per_worker, worker_count, hours | price = rate × workers × hours | nettoyage NET-002 only |
| MAX_OF_MIN_OR_UNIT | unit_rate, quantity, min_amount | price = max(min_amount, unit_rate × quantity) | peinture all m² services, nettoyage NET-030 |
| ADD_ON | unit_rate, quantity, primary_service_price | price = primary_price + (unit_rate × quantity) | peinture PEIN-008 preparation |
| BATCH_INCREMENT | base_price, increment, extra_item_count | price = base + (increment × extra_count) | menuiserie MENU_002/003 (EXPERIMENTAL) |
| FIXED_LABOUR_PART_SEPARATE | fixed_labour, hardware_price | total = fixed_labour + disclosed_hardware | serrurerie cylindre, menuiserie charnière/coulisse |
| DIAGNOSTIC_ABSORPTION | diag_fee, service_price, absorbed_if_same_visit | price = max(diag_fee, service_price) if absorbed; diag_fee + service_price if not | plomberie, electricite, climatisation |
| CONDITIONAL_FIXED | base_price, eligibility_check | if eligible: base_price; else: QUOTE | all métiers with CONDITIONAL_FIXED architecture |

---

## 7. Price Value Schema (per service)

```json
{
  "price_model": {
    "type": "FIXED|CONDITIONAL_FIXED|VARIABLE_UNIT|TIME_BASED_SINGLE|TIME_BASED_TEAM|LABOUR_FIXED_PART_SEPARATE|MINIMUM_FLOOR|ADD_ON|DIAGNOSTIC_FIRST|QUOTE_REQUIRED",
    "currency": "MAD",
    "fixed_amount": 250,
    "unit_rate": null,
    "unit": "FLAT_INTERVENTION",
    "min_amount": null,
    "formula_id": "FIXED",
    "formula_params": {}
  }
}
```

All numeric values are in MAD. No other currency in scope.

---

## 8. Versioning / Governance Model

```
registry_version: semver e.g. "1.0.0"
  - PATCH: editorial fixes, label changes, scope clarification
  - MINOR: new services added, batch rules refined
  - MAJOR: architecture changes, pricing model changes, schema changes

Per-service versioning:
  service.version: "1.0.0"
  service.effective_from: ISO date
  service.supersedes: prior service code or version
  service.human_approval_record: {approved_by, approved_date, phase}
  service.research_phase: e.g. "7B.3.3"
  service.research_commit: git SHA
```

Governance rules:
- No price change without explicit human approval record
- No architecture change without schema version bump
- All changes traceable to research phase + commit
- `production_ready = false` until promotion checklist complete (see section 9)

---

## 9. Production-Ready Promotion Checklist

Before any service can be set `production_ready = true`:

```
☐ canonical service schema validated (validate.js passes)
☐ legacy collision resolved for this service (no contradicting active source)
☐ estimator engine supports service's formula_id
☐ eligibility conditions are machine-readable (not prose-only)
☐ escape conditions are machine-readable
☐ client-facing disclaimer resolved (fixed-price vs indicative decision made)
☐ UX disclosure present in booking flow
☐ QA on staging (not production)
☐ telemetry/logging ready (service_sub_code in missions)
☐ transaction_learning schema migration complete (missions.service_sub_code, final_price_DH)
```

No services are production_ready in this phase.

---

## 10. Transaction Learning Schema (proposed — no Supabase changes)

```sql
-- Additional fields on missions table (or new missions_pricing table)
service_code          TEXT,        -- canonical service code
service_sub_code      TEXT,        -- e.g. interrupteur.simple vs va_et_vient
city_slug             TEXT,
district              TEXT,
artisan_id            UUID,
diagnostic_fee_DH     INTEGER,
fixeo_estimate_low    INTEGER,
fixeo_estimate_high   INTEGER,
fixed_price_applied   BOOLEAN,
quote_price_DH        INTEGER,
final_price_DH        INTEGER,     -- actual agreed price
materials_amount_DH   INTEGER,
parts_cost_DH         INTEGER,
labour_duration_min   INTEGER,
worker_count          INTEGER,
complexity            TEXT,
out_of_scope_trigger  TEXT,
scope_changed         BOOLEAN,
urgency_flag          BOOLEAN,
time_of_day           TEXT,
client_acceptance     TEXT,
final_status          TEXT,
created_at            TIMESTAMP
```

Missing today: `service_sub_code`, `final_price_DH`, `fixed_price_applied`, `parts_cost_DH`, `labour_duration_min`, `scope_changed`, `out_of_scope_trigger`. These are the minimum required to train a Level 1+ pricing maturity model.
