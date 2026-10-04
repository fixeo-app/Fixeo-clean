# W4.1 — JWT intelligence gateway, staging only

Target: `fixeo-diagnostic-staging`, `kqyhusnbybsukbcaoqtu`. Vercel project `fixeo-clean`, Preview branch `feat/fixeo-mobile-w4-1-intelligence-gateway` only. Base W4: `31df5b08cfb62a4e8841bbb18055826bf87ef62a`. No merge, Production change or physical build.

## Authority

Client JWT → gateway → attested RPC → existing canonical SQL transaction. No service-role credential is read by the new transport. Runtime receives a strict environment allowlist. Vercel programmatic configuration builds only the three mobile endpoints for W4.1; `vercel.legacy.json` preserves the exact W4 configuration for other branches. Do not merge or enable W4 integration before independent review.

Gateway verifies Auth remotely and `public.users.role=client`. SQL derives `auth.uid()` and rechecks Client role, profile, active account and `auth.sessions` membership. Body-supplied user IDs, prices, trusted headers and known-input shortcuts are rejected. Authenticated mobile tokens wrap canonical tokens with purpose, user and expiry. The gateway uses the existing Estimator engine, catalogue and financial rules; Mobile performs no pricing calculation.

## RPC contract

All new functions set empty `search_path`, qualify objects and contain no dynamic SQL. Public wrappers are SECURITY INVOKER; guarded implementations are SECURITY DEFINER in `fixeo_private`. EXECUTE is granted only to authenticated, excluding owner privileges; PUBLIC, anon and service_role grants are revoked. Private tables retain RLS and no client SELECT/INSERT/UPDATE/DELETE privileges. No canonical table policy is widened.

| RPC | Accepted parameters | Authority |
| --- | --- | --- |
| `mobile_diagnostic_state_v1` | `p_envelope text, p_mac text` | Attested allowlist of create/get/media lifecycle/run lifecycle; owner derived from JWT |
| `mobile_estimator_offer_v1` | Same | Immutable canonical offer with user-bound scope; diagnostic context checked when present |
| `confirm_mobile_estimator_request_v2` | Same | Pricing or diagnostic quote confirmation; no client identity parameter |
| `mobile_intelligence_quota_v1` | `p_kind text` | Fixed SQL quotas, authenticated Client only |
| `dispatch_my_estimator_request_v1` | `p_request_id uuid` | Own request and committed W4.1 confirmation receipt required |

Attestation HMAC-SHA256 covers the exact serialized envelope and payload. Scope includes version, key ID, audience, user, staging project, W4.1 branch, operation, operation UUID and issued/expiry seconds. Validity is at most 60 seconds, at most 5 seconds future clock skew. MAC comparison is constant length. Vault supplies only the dedicated W4.1 key internally. No client can read the key or mint attestations.

A per-user/operation/UUID lock serializes receipt creation. PostgreSQL canonical JSONB payload hashing rejects changed-payload retries; identical retries return the first committed result. A second context for one Estimator session is serialized separately and cannot create another request or change service, amount, outcome or city. Read operations always revalidate current diagnostic state. Configuration disablement and Vault key revocation stop new attestations, including receipt replay.

## Atomic confirmation

Canonical pricing/offer validation, ownership checks, optional diagnostic binding, request creation/attachment, `client_profile_id` derivation, context redemption and W4.1 receipt commit in one transaction. Any exception rolls all of them back. Dispatch is an idempotent post-commit operation, with a separate guarded retry RPC; it is not part of the financial transaction. AI and Storage operations precede confirmation and are not claimed to be SQL-atomic.

## Product and Safety

`create_my_service_request_v1` and the W4 simple-request UI remain unchanged. Diagnostic and Estimator are optional transports awaiting W4 integration review. No Safety questionnaire is shown in normal Estimator qualification. At most one useful trade clarification (including service selection) is accepted; insufficient data yields canonical QUOTE_REQUIRED without inventing answers or calculating a price locally. A true server STOP yields no diagnostic reference or pricing handoff and cannot be cleared through a new RPC or local continuation. No new STOP re-evaluation UI is introduced.

## Storage policies

Two staging policies on existing private bucket `diagnostic-private-v1`:

- `w41_diagnostic_safe_insert`: INSERT authenticated only, exact DB-reserved sanitized path, owned unexpired Client session, W4.1 receipt, validating media and active lease.
- `w41_diagnostic_safe_select`: SELECT authenticated only, same ownership/path/expiry proof; ready media or active validation lease.

No UPDATE, overwrite, DELETE, raw-upload or public-read permission. Server sanitizes the source photo, uploads with upsert=false, reads it back and checks SHA256 and byte length before attested media_finish. No raw photo is retained. The attested persisted run preserves observed/user_declared/ai_inferred/user_confirmed provenance.

## Remaining activation gates

Read final certification evidence before activation. In particular, the existing shared Edge proxy needs reviewed upstream/bypass configuration and route extension; its candidate source is not a deployed integration. Media cleanup must be certified independently: expiry denies access but does not prove physical Storage deletion. No service-role workaround is authorized. The previous minimization document is historical preflight, not the current deployment verdict.

Rollback: first disable `fixeo_private.mobile_intelligence_config_v1.enabled`, then follow `ROLLBACK.sql`. Keep committed business rows and receipts for review. Never remove global Vercel variables or alter other branches.
