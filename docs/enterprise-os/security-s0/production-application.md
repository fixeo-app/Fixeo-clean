# Phase 3A-S0 — Production application

Applied on 2026-09-24 after explicit user authorization. This record supersedes the historical NOT APPLIED status in the frozen review artifacts, which remain unchanged.

- Repository / Production baseline: `cb55e54cafb3792ed561b21b0da6bc104599d2e7`; Vercel READY.
- Frozen patch: `docs/enterprise-os/security-s0/patch-proposed.sql`.
- Canonical migration: `supabase/migrations/20260924015116_enterprise_dispatch_security_gate_s0.sql`.
- Both SHA256: `39246a11debb90b70970cab29d7ae4573d5b182e0748453c03a9c11684d6e2d6`.
- Migration was materialized before application as `20260924014925_enterprise_dispatch_security_gate_s0.sql`, then renamed to match the successful Supabase migration-history version. Its bytes never changed.
- Preflight: 11/11 fingerprints PASS; ALL_CHECKS true; 52/52 targeted privileges present on nine tables.
- Exact migration applied through Supabase apply_migration; success returned. The frozen SQL retains BEGIN/COMMIT, lock_timeout 5s and statement_timeout 30s.
- Immediate postflight: 11/11 fingerprints PASS; ALL_CHECKS true. Full live catalogue equals `contract-after-expected.json`.

## Verified after application

All five targeted functions now deny EXECUTE to PUBLIC, anon and authenticated, and retain EXECUTE for service_role and postgres. No function was removed or rewritten.

Exactly 52 targeted table privileges are now false across nine tables; no other effective table privilege in the audited contract changed. CRUD and SELECT grants remain identical. Column ACLs, service_role and postgres privileges remain identical.

All 86 policies, 21 triggers, 155 constraints and 134 public/fixeo_private function definitions match the pre-application contract. Both dispatch triggers remain enabled O. auto_dispatch_service_request_v1() still has zero attached triggers.

The five authenticated missions INSERT columns and UPDATE(status) remain allowed. The 14 permitted enterprise_invitations SELECT columns remain allowed; token_hash remains denied.

Both Artisan RPCs retain authenticated EXECUTE and their reviewed definition MD5s. Auth P0 policies, canonical profile trigger and is_admin() MD5 remain intact.

The worker source remains unchanged (Git blob `463ce6202cdf01ee987ddb5b9477111abca498ea`), continues to call dispatch_notification_worker_peek_v1 with SUPABASE_SERVICE_ROLE_KEY and retains DRY_RUN behavior. No worker invocation was performed.

Production validation used read-only catalogue queries only. No business data was changed by this operation, and no real dispatch, mission, service request, notification, SMS or WhatsApp test was performed. The 31/31 local scenarios remain the previously reviewed results; they were not rerun against Production.

Evidence: `preflight-apply-production.json` and `postapply-production-results.json`. Publication includes only S0 documentation/tests and the canonical migration; no existing application file is changed.

## Rollback and remaining scope

The reference rollback was not executed. It would reopen the five function exposures and restore the 52 excessive table privileges. Any SQL rollback requires new explicit authorization.

External consumers not observable in this audit, permissive default ACLs, inherited CRUD policies, authenticated INSERT notifications, anon INSERT service_requests and legacy identity transitions/fallbacks remain outside this change. No B1 work was started.

## Resume verification — 2026-09-24

After the conversation interruption, live Production was identified as exact POST-S0. No migration was reapplied. GitHub main and the active fixeo.ma Production deployment were still at the baseline SHA, with Vercel READY; only repository publication remained.

Fresh read-only catalogue checks passed all 11 postflight fingerprints, all five function ACLs and all 52 revoked privileges on nine tables. Both Artisan RPCs retain authenticated EXECUTE and their original definitions. Auth P0 passes its six canonical Admin policies, all 48 identity privilege cells, the canonical profile trigger and unchanged authority definition. Local P0 tests were rerun in memory: 22/22 PASS; no Production business tests were performed.

Evidence: `resume-production-verification.json` and `resume-p0-tests.tap`. The frozen patch, migration and historical review artifacts remain byte-identical. This publication contains only S0 evidence/tests and the canonical migration.
