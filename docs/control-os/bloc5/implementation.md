# Bloc 5 — People / Enterprise / Trust / Finance Command

## Canonical scope and starting checkpoint

Source: `FIXEO-Control-OS-Master-Blueprint-Bloc-0.md`, authored 2026-09-28; Library ID `libfile_e4bb72e9956481919b9594fe5427022b`, sections H.4/H.5, Bloc 5 and L. Exact order:

1. **5.1 People/Enterprise**: network, Marketplace profiles, enterprises/sites/minimal workforce; no private Artisan Business data.
2. **5.2 Trust/claims**: claims, reviews, verified and completeness remain separate; reasons and evidence.
3. **5.3 Réservations/devis**: canonical Artisan → FIXEO review → Client pipeline; proven QUOTE_REQUIRED; existing version/expiry authority.
4. **5.4 Finance/rapprochement**: final price, expected/due/reconciled commission, remittance evidence and immutable history.

Next documented step (outside this mandate): **Bloc 6 — Marketplace & Growth Intelligence / 6.1 Cube opérationnel**.

Observed initial MAIN/Production: `d907d2e237a6a2c1288e903ba15e42925d0c5030`; PR #54 merged; Vercel `dpl_BUgBpA2r9C1oK3xtEeF9NkHtJuFY` READY. Both B3+B4/P0 migrations present. All 26 tracked table fingerprints match the prior checkpoint: 13 requests, 22 missions, including 19 missing-request relations. No business rows changed. Private evidence retains the exact IDs and full fingerprints; no production row data is committed.

## 5.1 internal gate

20 targeted tests PASS (DB 10, API 4, UI 6); no failures/skips at this checkpoint. Test fixture schema mistakes were corrected in isolation. Production has not been modified.

- `control_people_page_v1`: closed filters, exact filtered total, keyset pagination and canonical `control_row_v1` projections.
- `control_people_context_v1`: minimal memberships/explicit site assignments; members and workers remain distinct.
- Both reads: Admin checked server-side, STABLE, SECURITY DEFINER justified by restricted cross-universe Admin projection, owner postgres, empty search_path, authenticated EXECUTE only; sealed private helper. No new business authority/table/policy.
- Read-only register reuses the Universal Dossier, Enterprise tenant permission helper and Operations Hybrid context. No workforce private names/contact, no Artisan Business objects.
- Canonical `verified` is distinct from legacy flag; ownership inconsistencies stay explicit; completeness is the existing six-field presence checklist. Availability is declared, not eligibility.
- A source failure remains ERROR/STALE; Auth failure clears cached rows. Pagination never supplies a population total from a browser slice.

## 5.2 internal gate

21 targeted tests PASS (Trust DB 8, shared API 4, shared/UI 9). Review commands are unchanged; tests prove reason, durable audit, idempotent replay, stale rejection and no implicit artisan verification after claim approval.

- Distinct Claims / verification-ready / incomplete / conflicting flags / reviews registers. Legacy unresolved references remain explicit; no guessed ownership or contact verification.
- Claim context excludes raw onboarding payload and phone. Reviews expose canonical rating/flag and mission/request relation, not private client contact.
- `control_review_history_v1` exposes only executed command reason, actor, time, result, audit and correlation; never whole preview payload or financial proof reference. This augments the existing Universal Dossier, not a second dossier.
- Canonical `approve_artisan_claim`, `reject_artisan_claim`, `admin_verify_artisan_v1`, `control_action_preview_v1` and `control_action_execute_v1` are reused without rewriting.

## 5.3 internal gate

Quote DB 8 and API 4 tests PASS; shared UI exercised with the new pipeline. Versioned review and acceptance reuse existing RPCs. No notification/dispatch was sent outside the isolated database.

- Exact paginated canonical quote pipeline; review, presentation, acceptance, expiry and unresolved historical acceptance remain distinct.
- QUOTE_REQUIRED is proved only by the existing diagnostic quote authority's persisted `bound` session, `booking_context.kind=quote`, matching canonical request/idempotency binding, and absence of a pricing offer. Raw diagnostic input, booking payload, media and secrets are excluded. Other unquoted requests retain UNKNOWN.
- Dossier shows proposed service/supplies/duration, exact review version, reviewer/reason, expiry and linked accepted missions. Version and optional expiry go through the existing confirmation workflow.
- Existing `submit_artisan_quote_v2`, `review_marketplace_quote_v1`, `accept_quote_v2`, `reject_quote_v2` remain unchanged. Legacy accepted quotes do not synthesize missions.

## 5.4 internal gate and targeted integrity correction

Finance DB: 10 PASS. Additive/security/rollback: 2 PASS. Shared API/UI: 17 PASS. Native concurrency and final candidate CI remain pending at this checkpoint.

Reproduction in an isolated database showed the preexisting Finance authority and preview accepted a missing request when the mission already had a final price. SQL three-valued logic made the old `NOT (... request.status ...)` predicate NULL, skipping rejection. The reproduction rolled back; no Production business action was called.

`20260929161248_control_os_b5_finance_integrity.sql` changes only `admin_commission_remittance_v1` and the Finance branch of `control_action_preview_v1`: canonical parent existence first, NULL-safe eligibility, parent SHARE lock through transaction end. Missing-parent declare/confirm/correct fail REQUEST_NOT_FOUND. Existing cancellation semantics remain compatible. Owner/SD/search_path/grants unchanged. The complete `admin_settle_mission_v1` definition and its P0 preview branch remain intact.

The UI exposes declaration, proof review, confirmation, cancellation and appended correction solely through existing typed commands. No action is executed by opening a dossier. Financial facts separate final price, expected, due, ledger-confirmed and outstanding commission. Unknown/missing request prevents a fabricated global zero. `payments` nature remains UNKNOWN; amounts are not summed as commission. Proof references are only returned in the guarded Finance dossier, escaped as text; no private Business fields/media are read.

## Final verification checkpoints

- Native PostgreSQL 17.6 CI: 218 PASS / 0 FAIL / 0 SKIP; cross-universe 3 PASS; inherited B3+B4 browser 7 PASS (run 36599714186).
- The first Bloc 5 browser traversal reached every scenario; its final assertion incorrectly rejected the expected missing-parent NOT_FOUND. The assertion now requires that exact RPC, target and error, and checks the visible absent context. No error filtering was introduced.
- Visual review of the resulting desktop/mobile captures found a persistent loading placeholder. The context loader now clears it and exposes aria-busy until all independent sections resolve. Targeted UI tests PASS; final browser CI must still confirm the candidate.
- Staging: nine readers under real Admin JWT, anon and four non-admin roles (including two tenants), closed filters, cursors and API mapping: 10 groups PASS. Separate rolled-back SQL: 16 missing-parent refusals, unchanged mission/ledger/preview/audit on refusal, P0 preserved, UNKNOWN/NOT_FOUND, zero residual fixture.
- Work network relay: the first standard 5s API harness attempt timed out. Direct SQL measured 16.182ms; the staging integration harness explicitly allows 20s relay time. Application deadline remains 5s and its timeout/error semantics are unit-tested. This is not a claim of a successful authenticated Production browser session.
- Two migrations applied in staging only so far, ledger versions 20260929162931 / 20260929162942. Public read functions: 9; sealed helpers: 3. Existing policies/table ACLs unchanged; P0 definition hash c65636d6c39bc43e91818dc10f9f00fd.
