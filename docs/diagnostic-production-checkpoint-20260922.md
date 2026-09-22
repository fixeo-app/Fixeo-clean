# Diagnostic production checkpoint — 22 September 2026

## Actual state

Production application remains commit `22fe473773aea96bdb2b24a9a3e1f9b6e6beefe1`,
deployment `dpl_9s8fgr2ZmpZQt2ARC7pVQG1o7EC5`. Diagnostic is OFF.
This checkpoint records infrastructure installation, not a successful activation.

The owner authorized Diagnostic-only technical changes. No Hero or Estimation
frontend files were changed. No existing business data or secrets were changed.

## Supabase production changes applied

Project: `fixeo-mvp / ztwtbgoqanqzvwiibtuh`.

| Source migration | Recorded production version |
|---|---|
| `20260921174505_scope_portfolio_public_read.sql` | `20260922012841` |
| `20260921174531_diagnostic_foundation_v1.sql` | `20260922012909` |
| `20260921180706_diagnostic_retention_and_mission_context_v1.sql` | `20260922012926` |

These migrations were applied individually after the existing read-only preflight
passed. Do not replay them or run a global migration push. Source filenames and
the remote migration ledger have different timestamps.

- Four private tables: `diagnostic_sessions_v1`, `diagnostic_media_v1`,
  `diagnostic_runs_v1`, `diagnostic_usage_windows_v1` in `fixeo_private`.
- RLS enabled; no direct table access for anon, authenticated or service_role.
- Four public server-only RPCs: state, quota, cleanup and accepted-artisan context.
  EXECUTE is denied to PUBLIC/anon/authenticated and granted to service_role.
- `storage.objects.portfolio_public_read` now restricts reads to `portfolio`.
  The existing post-storage guard passed; other Storage policies are unchanged.
- Private `diagnostic-private-v1` bucket created in production and Diagnostic
  staging. Limit: 8,388,608 bytes, JPEG/PNG/WebP only. No object or photo uploaded.
  Used Supabase's documented SQL bucket-creation route; no direct object writes.

The Diagnostic booking bridge migration was NOT applied because it replaces the
existing Estimation confirmation function. That function's original definition
MD5 remains `8385d4401513eed11fe50300b1277933`. No legacy view migration applied.
The UI and existing Estimation reservation path therefore remain unchanged.

## Verification

- 18 targeted local tests passed: Diagnostic API, ownership, RPC ACLs, quotas,
  Storage policy isolation, real JPEG decoding/WebP sanitization, retention and
  provider contract. Storage HTTP and OpenAI transports in these tests are mocks.
- Vercel CLI 59.24.0 standalone local build rerun: exit 0, build status OK.
  Relevant application sources match the validated candidate. No environment
  files or remote secrets were pulled. This build was not deployed.
- Production post-apply checks passed for bucket, RLS and function privileges.
- Production server-role RPC create/read isolation was exercised in a transaction
  ending in ROLLBACK. Cross-owner access was rejected. No request/mission created.
- Afterwards: 0 Diagnostic sessions and 0 objects in the Diagnostic bucket.
- Supabase advisors report INFO RLS-without-policy for the four private tables.
  This is intentional deny-by-default with server-only RPC access; do not add
  permissive browser policies to remove the informational notice.
  Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Activation blockers — not completed

Vercel Project and Shared variable lists were inspected without revealing values.
`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`FIXEO_ESTIMATOR_SECRET` are present. No shared variables are linked.

Absent: `FIXEO_DIAGNOSTIC_SECRET`, `CRON_SECRET`, `FIXEO_DIAGNOSTIC_MODEL`, and the
Diagnostic enable/readiness settings. The owner explicitly prohibited secret
changes, so none were created, read back, replaced or rotated. Two new independent
server secrets are required by the current implementation.

Remaining after secure configuration is authorized:

1. Provision the two missing secrets without modifying any existing secret.
2. Select and verify the vision/structured-output model using the existing key;
   validate bounded cost and the actual provider privacy/retention settings.
3. Validate real signed photo upload, private access, sanitization, analysis and
   cleanup. Use Diagnostic test dossiers only; never create an artisan mission.
4. Configure and verify the hourly maintenance scheduler and server runtime limit.
5. Resolve the reservation bridge separately without changing the existing
   Estimation flow. Do not claim complete reservation integration today.
6. Set readiness flags only on evidence, enable Diagnostic, deploy the verified
   SHA and smoke-test the Diagnostic section/modal on the production domain.

Never flip the flags simply to make the section visible while these prerequisites
are missing. Do not use another feature's secret as an undocumented substitute.
