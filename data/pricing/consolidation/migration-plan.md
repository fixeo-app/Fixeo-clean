# FIXEO Canonical Registry — Migration Plan
## Phase 7C.1 — Audit Output

**Status:** PLAN ONLY — no implementation in this phase

---

## Recommended Migration Sequence

### Stage 0 — Pre-Conditions (must complete before anything)

**0.1 Human Decisions Required**
- [ ] Resolve CONT-06: Fixed-price vs "indicative" disclaimer (recommend Option C Hybrid)
- [ ] Confirm canonical service code convention (recommend Option B dot-notation)
- [ ] Confirm canonical architecture enum (see architecture-map.json proposal)
- [ ] Confirm painted-surface conversion model status (RESEARCH_ESTIMATION_ONLY → decide whether to upgrade before estimator V1)
- [ ] Decide PEIN-001 treatment: policy-ref (not a service) vs standalone minimum-charge service

**0.2 Technical Pre-Conditions**
- [ ] All 8 métier V0.3 files confirmed intact (verify before every stage)
- [ ] Production diff = 0 before any migration stage begins

---

### Stage 1 — Build Canonical Registry (offline, no production touch)

- Create `data/pricing/canonical-registry.v1.json` from service-matrix.json + policy-map.json
- Apply canonical service codes (dot-notation mapping from frozen codes)
- Validate with new validate.js (canonical schema + all 44 services + policy refs)
- **Production files: 0 diff**

---

### Stage 2 — Shadow Engine (offline validation)

- Build `js/fixeo-pricing-canon.js` (read-only export; no UI binding)
- Shadow engine reads canonical registry and computes same outputs as faee-v1/v2
- Run comparison: canonical output vs legacy faee output for the same service/complexity
- Log all divergences (expected: 30-50% of cases will differ — canonical is more precise)
- **Production UI: no change yet**

---

### Stage 3 — Estimator V1 UI (new surface only)

- Build new estimation widget reading `fixeo-pricing-canon.js`
- Deploy to `/estimation-v1.html` (new page, no replacement)
- Run telemetry: actual usage vs canonical price assumptions
- Capture `service_sub_code` in missions if possible
- **Existing reservation/homepage: no change yet**

---

### Stage 4 — Homepage Migration

- Replace `fixeo-estimation-engine-v1.js` in homepage with canonical engine
- Replace `fixeo-pricing-marocain.js` SERVICE_PRICING with canonical category floors
- Canonical floor = min(all approved services in métier)
- **Existing reservation: no change yet**

---

### Stage 5 — Reservation Migration (most critical)

- Replace `reservation.js` SERVICE_PRICING with canonical service-keyed prices
- Resolve `window.SERVICE_PRICING` namespace collision (rename to `FIXEO_CANONICAL_PRICING`)
- Align `reservation-v2.js` SVC_PRICING_FB with canonical values
- **P0 fix: Peinture per-room vs per-m² — resolve CONT-01 before going live**

---

### Stage 6 — Profile Pages Migration

- Replace `fixeo-profile-flagship-v1.js` MAR_PRICES with canonical category floors
- Replace `fixeo-profile-v3.js` PRICING with canonical service prices
- **artisan real Supabase prices take priority; canonical is fallback only**

---

### Stage 7 — pSEO Regeneration

- Update `generate-pseo-v2.js` and `generate-lps.js` with canonical price data
- Regenerate pSEO pages (do NOT regenerate before Stage 5 resolves CONT-01)
- **Requires human approval before regeneration trigger**

---

### Stage 8 — Retire Legacy Files (only after all above complete)

- `fixeo-estimation-v2-hero.js` → archive (reference only), then delete
- `fixeo-estimation-engine-v1.js` → delete after canonical replaces all surfaces
- `fixeo-pricing-marocain.js` → merge canonical floors into canonical-registry.v1.json, delete JS file

---

## Risk Registry

### P0 — Immediate Action Required Before Migration

| Risk | Description | Mitigation |
|------|-------------|-----------|
| P0-01 | Active peinture unit contradiction (per-room vs per-m²) — CONT-01 — affects live booking | **Resolve BEFORE Stage 5**. Can freeze CONT-01 by showing "request a quote" for peinture until canonical engine deploys. |
| P0-02 | Electricite floor 100 MAD live on homepage — below artisan floor | **Resolve in Stage 4** by replacing LEGACY-01 floor with canonical 200 MAD minimum. |
| P0-03 | Menuiserie 150 MAD live floor — below canonical 300 MAD | **Resolve in Stage 4**. |
| P0-04 | window.SERVICE_PRICING race condition (LEGACY-04 vs LEGACY-01) | **Resolve in Stage 5** by renaming namespace before reservation migration. |
| P0-05 | "AI estimation" label on faee-v1 outputs — could be misleading on pricing basis | **Resolve in Stage 3** by adding correct provenance label on new estimator widget. |

### P1 — Resolve Before Estimator V1

| Risk | Description | Mitigation |
|------|-------------|-----------|
| P1-01 | Fixed-price vs indicative contradiction (CONT-06) | Human decision required before client-facing copy is finalised |
| P1-02 | pSEO Peinture/plomberie floor discrepancy — public SEO pages show wrong prices | pSEO freeze pending — do not regenerate until Stage 7 |
| P1-03 | Bricolage floor 100 MAD live vs 200 MAD canonical | Stage 4 fix |
| P1-04 | Serrurerie live floor 150 MAD vs 220 MAD canonical | Stage 4 fix |

### P2 — Manage Pre-Production

| Risk | Description | Mitigation |
|------|-------------|-----------|
| P2-01 | Peinture conversion model (floor m² → painted m²) NOT approved | Block PEIN-002/003/004/005 in estimator V1 until conversion model is human-approved |
| P2-02 | 12-city price data in generate-lps.js inconsistent with null city_adjustment | Remove in Stage 7 pSEO regeneration |
| P2-03 | faee-v1 urgency tier semantics pollute future modifier logic | Stage 2 shadow engine must explicitly exclude urgency tier from canonical mapping |
| P2-04 | MENU_002/003 batch rules EXPERIMENTAL — not universal law | Estimator V1 must flag these as pilot rules, not guaranteed prices |
| P2-05 | CLIM-013 recharge gaz: labour + gas included — gas price variability risk | Cap gas cost in canonical definition; escape to QUOTE if gas volume exceeds cap |

---

## Key Decision Gate Summary

| Decision | Required Before | Owner |
|---------|----------------|-------|
| Fixed-price vs indicative | Stage 3 | HUMAN |
| Canonical code convention | Stage 1 | HUMAN |
| Peinture conversion model upgrade | Stage 3 | HUMAN |
| PEIN-001 policy vs service | Stage 1 | HUMAN |
| CLIM gas cost cap | Stage 1 | HUMAN |

**NO MIGRATION BEGINS until all Stage 0 human decisions are made.**
