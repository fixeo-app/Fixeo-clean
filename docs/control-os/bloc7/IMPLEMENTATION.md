# Bloc 7 — RAFI Admin Decision Center V3

Baseline B6: `c9bd9c6bb9846a85c807184e2a59de43269a4c4e`, Vercel READY verified before writing. Dedicated worktree/branch; checksum ownership guard checks HEAD/index/tracked and nonignored files before every edit batch. Any unexpected write stops this execution. B6 work and evidence remain intact.

Canonical source: existing `FIXEO-Control-OS-Master-Blueprint-Bloc-0.md`, lines 584–596, 636–639, section O. No new Blueprint. Exact subblocks:

| Subblock | Objective / contract | Dependencies / authority | Gate |
|---|---|---|---|
| 7.1 signals/evidence | Rule registry, EvidenceRef, deterministic deduplication, freshness, provenance | B2 observations, B6 network/cohorts; canonical sources remain authoritative | Evidence/unknown/conflict/scope/stale tests; no business mutation |
| 7.2 briefing/context | Transverse brief, dossier context, optional grounded synthesis, abstention | Existing authorized reads and Universal Dossier | Partial/error isolation, minimization, model absent/slow/injection/wrong IDs, bounded calls |
| 7.3 décision/proposition | Allowlisted actions, canonical preview, confirmation, server result/audit | Existing Control and domain authorities; no SQL/free endpoint from model | Stale/permission/tenant/race/retry/double-click/audit |
| 7.4 suivi/retour sur résultat | Explicit operator follow-up and deltas; resolution from canonical events | Operator metadata only, existing canonical audit and dossier | Owner/version/idempotence, source missing≠resolved, no hidden persistence on reads |

7.1 gate: 51 affected tests PASS (0 fail/skip). Rule priorities preserve the acquired triage thresholds, registered explicitly in `api/control/rafi-evidence.js`. Unknown first observation is not invented from object creation. Stable signal identity is separate from evidence content fingerprint. Duplicate conflicting observations preserve both proofs and suspend proposals. Source health unknown is explicit without severity invented from missing data. Minimal evidence excludes free descriptions, notes, contacts and private Business fields.

The previous partial-source test fixture had an inconsistent `has_more=false` with 400 total observations and one returned row. Corrected to `has_more=true`; the source-provenance guard remains strict.

Optional AI must not create executable content. Its constrained output can select only server-grounded sentence IDs from a maximum of five deterministic priorities. Raw notes, contacts and business objects are not sent. The model is disabled by default; missing configuration, incomplete sources, timeout or invalid IDs return the deterministic briefing. Production AI calls are not necessary for any capability.


7.2 targeted briefing/context gate: 13 PASS including affected cross-universe checks. The B4 workforce capacity rule runs only in an already authorized request dossier, using canonical capacity_full reasons and site/skill scope. No global workforce fan-out or invented total. Priority ordering is versioned `b7-lexicographic-v1`: priority, known deadline, blocking state, age, affected population, stable ID. Lists reuse the existing loaded snapshot.

7.3/7.4 DB gate: proposals and followups, private RLS/ACL, two tenants, two Admin owners, exact versions, retries, missing sources and proof-based closure pass. The acquired `control_action_execute_v1` has exactly one additional private guard call after its canonical target locks and before business execution. This also prevents bypass via the old endpoint; successful idempotent replay remains ahead of the guard. All domain authorities, including P0, retain their original bodies.

Operator metadata: three private tables, six guarded public RPCs, two sealed helpers. No direct table grants to anon/authenticated/service role. Followup reads never persist. Explicit closure supports canonical claim review, quote review, final-price resolution and actual request acceptance. Other rule types remain explicitly open/acknowledged until a compatible resolution contract exists; disappearance is UNKNOWN. No automatic business action, restoration or user message is sent. First observation remains unknown rather than invented.

Local global suite: 282 PASS, 0 FAIL, 1 SKIP (native PostgreSQL concurrency is mandatory in CI); subsequent affected tests PASS. Staging: nine grouped checks with real Auth/RPC, all six new RPCs denied to anon/client/artisan/two nonadmin tenants. No staging business mutation. Full native concurrency and real UI recipes run in CI before release.

Migration: `20260929204000_control_os_b7_rafi_governance.sql`, SHA256 `af97a5831f913b89aed49c9d2db5a5534df29ce67932d4136a3f230c9b66657b`. Staging applied exactly. Production application requires baseline/data/metadata preflight and exact candidate CI PASS.

Rollback is verified against the B6 fixture: restore B6 application, expire only unexecuted B7-linked previews, restore exact acquired Control executor, remove added functions, retain all operator metadata and canonical audits. No business row deletion or restoration. Reapplication retains historical metadata.

Performance: five bounded source reads per briefing, at most five priorities; followups keyset pages 1–50 and one source read per distinct source/classification on that page. No per-row remote calls. Source freshness is 60 seconds; model optional/disabled, 3-second timeout, max 300 tokens, grounded sentence selection only. Production true Admin visual session and model provider call are not claimed unless independently performed.

Next exact Blueprint block: BLOC 8 — COMMAND UX / SECURITY / OBSERVABILITY / CERTIFICATION; 8.1 UX/accessibilité, 8.2 sécurité/observabilité, 8.3 certification/cutover/rollback, 8.4 documentation opérateur.
