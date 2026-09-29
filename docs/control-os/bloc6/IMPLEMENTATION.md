# Bloc 6 — Marketplace & Growth Intelligence

Baseline: `8a83d1209fb3e9f67d9f6f8b3ac1eca9c6297100` (PR55, B5), Production READY reconciled 2026-09-29. The 26 tracked table fingerprints match the B5 checkpoint: 22 missions, 13 requests, 19 missing request relations. No Production data writes.

## Canonical scope

Source: **FIXEO-Control-OS-Master-Blueprint-Bloc-0.md**, 2026-09-28, lines 585–595 and execution table 632–634; metric contracts H.1/H.3/H.4/H.5. The only documented subblocks are:

1. **6.1 Cube opérationnel**: normalized dimensions, distinct grain, time, rights and completeness.
2. **6.2 Signaux d’activation/recrutement**: actionable cell/profile populations, no campaign by default.
3. **6.3 Cohortes et tendances**: conversion, delays, denominators and uncertainty.

Next documented block: **7 — RAFI ADMIN DECISION CENTER V3**, first **7.1 signals/evidence**. No Bloc7 implementation belongs to this mandate.

## 6.1 Cube

Three independent aggregate sources (`operations`, `network`, `commerce`) behind the existing user-JWT Admin transport. Each source uses the same normalized cell/cursor contract; concurrent population changes are detected before mixing pages. One request per base row; missions never multiply denominators. Current open stock is distinct from the selected request-creation cohort. Windows are half-open business dates in `Africa/Casablanca`, at most 90 days, with UTC boundaries. Scope excludes private Artisan Business data and reuses tenant visibility.

The service resolver/normalizer remains canonical. City case/diacritics/outer whitespace are normalized for grouping, not to redefine Dispatch eligibility. Raw dimensions remain in population evidence. Unknown dimensions have explicit null buckets; unsupported filter trades are refused rather than broadening the query. Classification comes only from persisted canonical classification.

Network facts count distinct declared profiles per cell, including secondary cities/services. They distinguish ownership, verification, claimability (including pending claims), declared availability and missing freshness. Totals across cells must not be added to produce global artisan capacity. Eligibility, residual capacity and global coverage remain UNKNOWN until independently evidenced.

Coverage is an explicit bounded operator read (five requests per call), reusing `control_rafi_dispatch_read_v1` / `dispatch_preview_v22` and `control_hybrid_read_v1`. No N dispatch previews on refresh. A bounded candidate list proves existence, not total capacity. Enterprise observation grants no tenant action permission. No business action or audit event is produced by reading.

Public readers: `control_marketplace_cube_v1`, `control_marketplace_population_v1`, `control_marketplace_coverage_v1`. Private scope/dimension/request/network helpers are sealed. Admin check, STABLE, empty search_path, postgres owner, authenticated EXECUTE only. SECURITY DEFINER is limited to these cross-universe Admin projections; no table grants, RLS/policy changes or new mutation authority.

API timeout/source errors remain explicit, with null source facts. UI reuses the Universal Dossier, pages exact populations, escapes source values, and rejects late responses to obsolete filters. The previous bounded browser-array Marketplace screen is replaced, not patched in parallel.

Gate 6.1: 13 isolated DB tests + 5 API tests + 4 DOM interaction tests PASS (0 fail/skip). Browser rendering and final remote CI remain candidate gates.

Additional gate evidence: 45 targeted B3/B5/RAFI API/UI/cross-universe tests PASS. A 2,000-request / 40-cell isolated population returned 25 cells in 102 ms and 11,193 bytes; no index/materialization added. This is a local measurement, not a Production latency claim. Normalized RAFI evidence and the exact population/Dossier navigation are covered by the 6.2 integration tests.

## 6.2 Activation / recruitment

The same Cube facts drive deterministic recommendations: no locally referenced profile, declared unavailability (only when none are unknown), profiles ready for verification, and genuinely claimable profiles without pending claims. A missing declared network is a fact; a structural gap or improvement after activation remains an inference. No staffing target, future revenue or marketing causality is generated. Priorities reuse RAFI's P1/P2/P3 network rules; no artificial P0 is introduced.

`control_marketplace_signals_v1` replaces the network observation read in the existing five-source RAFI API without changing the old RPC or other source authorities. It uses the same sealed request/network facts, retains a bounded observation window with explicit completeness, and opens the exact normalized Cube context. Recommendations navigate to paginated real populations and Universal Dossier; claims/verification/dispatch still require their existing server-authorized workflows. No campaign, claim or business command runs from the Cube.

Gate 6.2: 30 relevant API/UI/engine/DB/performance checks PASS after correcting the isolated audit assertion to compare before/after reads (fixture insertion itself is audited). No product guard was weakened. Native browser rendering remains the final candidate gate.
