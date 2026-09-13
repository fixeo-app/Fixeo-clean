# BP15 Security Audit — Enterprise Automation Rules & Triggers

**Date:** 2026-09-13
**Branch:** `recovery/seo-v3-safe`
**HEAD:** `049e7728`
**Scope:** BP15 — Automation Rules engine: `supabase/bp15-enterprise-automations.sql`, `js/enterprise-automation-contract-v1.js`, BP15 sections of `js/enterprise-dashboard-v1.js`
**Auditor:** Agent 4 (Security / Red Team)
**Depends on:** BP09, BP10, BP12, BP13 (escalation contract — automation creates escalations via BP13 `open_escalation`)
**Status:** AUDIT COMPLETE — Both `supabase/bp15-enterprise-automation.sql` (existing, 947 lines) and `js/enterprise-automation-contract-v1.js` (existing, 300 lines) have been audited. **8 active defects found, all documented below.**

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2     | MUST-FIX before merge |
| HIGH     | 16    | MUST-FIX before merge |
| MEDIUM   | 18    | MUST-FIX before merge |
| LOW      | 10    | ADDRESSED by design |
| INFO     | 6     | DOCUMENTED |

**Total threat matrix findings: 50 (SEC-BP15-01 through SEC-BP15-50)**
**Additional contract file defects: 5 (CONTRACT-01 through CONTRACT-05)**
**All CRITICAL and HIGH findings must be ADDRESSED before READY FOR REVIEW.**

---

## Architecture Context

BP15 introduces:
- `enterprise_automation_rules` table — stores per-enterprise trigger rules
- `enterprise_automation_executions` ledger — idempotency + history
- `create_automation_rule` RPC — rule creation (owner/admin only)
- `list_automation_rules` RPC — reads rules by enterprise
- `evaluate_enterprise_automations` RPC — evaluates signals and fires `open_escalation`
- `get_automation_executions` RPC — reads execution ledger
- JS contract module `enterprise-automation-contract-v1.js`
- Dashboard UI section with rule form + execution list

**Critical invariants inherited from prior BPs:**
- Enterprise linkage: `enterprise_request_context` ONLY — no `service_requests.enterprise_site_id`
- No `enterprise_requests` / `enterprise_missions` tables
- No `dispatch_execute_v1` calls
- Automation creates escalations only via `public.open_escalation()` (BP13 contract)
- All SECURITY DEFINER functions: `SET search_path = ''`
- Auth helpers: `fixeo_private._fixeo_is_enterprise_member()`, `_fixeo_is_enterprise_manager()`, `_fixeo_is_admin()`, `_fixeo_get_site_manager_site_ids()`
- Audit: `fixeo_private._eal_append()` canonical helper
- `created_by = auth.uid()` — always server-derived

---

## Findings Table

| ID | Category | Severity | Status | Description |
|----|----------|----------|--------|-------------|
| SEC-BP15-01 | Authorization | HIGH | MUST-FIX | anon access must be blocked via RLS RESTRICTIVE + REVOKE |
| SEC-BP15-02 | Authorization | HIGH | MUST-FIX | non-member raises `_bp15_check_automation_reader` |
| SEC-BP15-03 | Authorization | HIGH | MUST-FIX | inactive member blocked by status='active' check |
| SEC-BP15-04 | Authorization | MEDIUM | MUST-FIX | reporter/viewer: read RPCs only, mutation RPCs blocked |
| SEC-BP15-05 | Authorization | MEDIUM | MUST-FIX | operations_manager: evaluate + read only, no create/modify rules |
| SEC-BP15-06 | Authorization | MEDIUM | MUST-FIX | site_manager: read scoped to assigned sites |
| SEC-BP15-07 | Authorization | HIGH | MUST-FIX | owner/admin: full rule management |
| SEC-BP15-08 | Tenant Isolation | CRITICAL | MUST-FIX | cross-enterprise: enterprise A cannot read/write enterprise B's rules |
| SEC-BP15-09 | Tenant Isolation | HIGH | MUST-FIX | `list_automation_rules` scoped by enterprise_id |
| SEC-BP15-10 | Tenant Isolation | HIGH | MUST-FIX | `evaluate_enterprise_automations` scoped by enterprise_id in all CTEs |
| SEC-BP15-11 | Tenant Isolation | HIGH | MUST-FIX | execution ledger scoped by enterprise_id |
| SEC-BP15-12 | Tenant Isolation | HIGH | MUST-FIX | `create_automation_rule` validates site belongs to same enterprise |
| SEC-BP15-13 | Tenant Isolation | MEDIUM | MUST-FIX | cross-enterprise signal evaluation not possible (enterprise_id filter) |
| SEC-BP15-14 | Site Manager Scope | MEDIUM | MUST-FIX | site_manager cannot see rules for non-assigned sites |
| SEC-BP15-15 | Site Manager Scope | MEDIUM | MUST-FIX | site_manager cannot see executions for non-assigned rules |
| SEC-BP15-16 | Site Manager Scope | MEDIUM | MUST-FIX | site_manager scope enforced server-side only |
| SEC-BP15-17 | Input Validation | HIGH | **ACTIVE DEFECT** | `signal_type` CHECK has wrong values in SQL + JS (missing sla_approaching/mission_stalled) |
| SEC-BP15-18 | Input Validation | HIGH | MUST-FIX | `action_type` validated against allowlist ('open_escalation' only) |
| SEC-BP15-19 | Input Validation | MEDIUM | MUST-FIX | `severity` validated against CHECK constraint |
| SEC-BP15-20 | Input Validation | LOW | ADDRESSED | `p_limit` clamped in evaluator and execution list RPC |
| SEC-BP15-21 | Input Validation | MEDIUM | MUST-FIX | `threshold_minutes` must be positive integer (CHECK constraint) |
| SEC-BP15-22 | Input Validation | LOW | ADDRESSED | rule `name` trimmed, non-empty, max 200 chars |
| SEC-BP15-23 | Input Validation | MEDIUM | MUST-FIX | `urgency_filter` validated against canonical values |
| SEC-BP15-24 | Privilege Escalation | CRITICAL | MUST-FIX | `evaluate_enterprise_automations` not callable by reporter/viewer/site_manager |
| SEC-BP15-25 | Privilege Escalation | HIGH | MUST-FIX | automation execution does not grant elevated access to escalation table |
| SEC-BP15-26 | Privilege Escalation | HIGH | MUST-FIX | automation rule cannot reference external URLs, scripts, or arbitrary code |
| SEC-BP15-27 | Privilege Escalation | HIGH | MUST-FIX | `created_by` always `auth.uid()` — never client-supplied |
| SEC-BP15-28 | Idempotency | MEDIUM | MUST-FIX | concurrent evaluations: unique_violation caught, skipped — no duplicate escalation |
| SEC-BP15-29 | Idempotency | LOW | ADDRESSED | `ee_unique_active_escalation` (BP13) provides final DB-level guard |
| SEC-BP15-30 | Idempotency | LOW | ADDRESSED | `idx_eae_idempotency` on execution ledger prevents double-recording |
| SEC-BP15-31 | Idempotency | LOW | ADDRESSED | `ON CONFLICT DO NOTHING` on ledger insert — safe under concurrency |
| SEC-BP15-32 | Data Leakage | LOW | ADDRESSED | execution ledger metadata never contains secrets/credentials |
| SEC-BP15-33 | Data Leakage | MEDIUM | MUST-FIX | raw SQL error never reaches DOM (`_autoError` uses generic French message) |
| SEC-BP15-34 | Data Leakage | LOW | ADDRESSED | rule listing does not expose other enterprises' rule counts or patterns |
| SEC-BP15-35 | Audit Integrity | MEDIUM | MUST-FIX | `automation_executed` action_type added to `eal_action_type_check` |
| SEC-BP15-36 | Audit Integrity | MEDIUM | MUST-FIX | audit insert uses `fixeo_private._eal_append` (canonical helper) |
| SEC-BP15-37 | Audit Integrity | LOW | ADDRESSED | audit metadata: rule_id, signal_type, action_type, service_request_id — no raw secrets |
| SEC-BP15-38 | Audit Integrity | HIGH | MUST-FIX | `actor_user_id = auth.uid()` (server-derived, never client-supplied) |
| SEC-BP15-39 | XSS / Frontend | MEDIUM | MUST-FIX | rule `name` displayed via `textContent` only |
| SEC-BP15-40 | XSS / Frontend | MEDIUM | MUST-FIX | execution `signal_type`/`outcome` labels via contract helper, then `textContent` |
| SEC-BP15-41 | XSS / Frontend | MEDIUM | MUST-FIX | form inputs sanitized: name/threshold validated before submission |
| SEC-BP15-42 | XSS / Frontend | MEDIUM | MUST-FIX | form error messages: generic French, via `textContent` |
| SEC-BP15-43 | Search Path | HIGH | MUST-FIX | all SECURITY DEFINER functions: `SET search_path = ''` |
| SEC-BP15-44 | Search Path | HIGH | MUST-FIX | private helpers in `fixeo_private` schema: REVOKE from PUBLIC, anon, authenticated |
| SEC-BP15-45 | Search Path | HIGH | MUST-FIX | public RPCs: REVOKE from PUBLIC, anon; GRANT to authenticated |
| SEC-BP15-46 | Dispatch Isolation | INFO | VERIFIED | `dispatch_execute_v1` NOT called in BP15 |
| SEC-BP15-47 | Dispatch Isolation | INFO | VERIFIED | no `enterprise_requests` table introduced |
| SEC-BP15-48 | Dispatch Isolation | INFO | VERIFIED | no `enterprise_missions` table introduced |
| SEC-BP15-49 | Dispatch Isolation | INFO | VERIFIED | no `service_requests.enterprise_site_id` reference |
| SEC-BP15-50 | Lifecycle Isolation | HIGH | **ACTIVE DEFECT** | direct INSERT bypasses open_escalation() — audit trail missing (lines 599,715,823) |
| CONTRACT-01 | Input Validation (JS) | HIGH | MUST-FIX | `urgency_filter` values wrong: 'normale'/'now' instead of canonical 'normal'/'urgent' |
| CONTRACT-02 | Input Validation (JS) | HIGH | MUST-FIX | `SIGNAL_TYPES` wrong: missing sla_approaching/mission_stalled/urgent_unassigned; has wrong values |
| CONTRACT-03 | Lifecycle (JS+SQL) | HIGH | MUST-FIX | `reason_code: 'auto'` hardcoded in both contract and dashboard — not a valid BP13 constraint value |
| CONTRACT-04 | Hardening (JS) | LOW | SHOULD-FIX | vocabulary constants not frozen (`Object.freeze` missing) |
| CONTRACT-05 | Data Leakage (JS) | MEDIUM | MUST-FIX | `_autoError` helper absent from contract; dashboard JS has it but contract callers may lack it |

---

## Detailed Findings

### AUTHORIZATION

#### SEC-BP15-01 — Anonymous access blocked
**Severity:** HIGH → MUST-FIX
**Attack vector:** Unauthenticated caller invokes any BP15 RPC or queries `enterprise_automation_rules` directly via Supabase JS client.
**Impact:** Full read of automation rules across all enterprises; potential rule creation.
**Required fix:**
1. `ALTER TABLE public.enterprise_automation_rules ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;`
2. RESTRICTIVE policy for `anon` role: `USING (false)` — blocks ALL operations.
3. `REVOKE EXECUTE ON FUNCTION ... FROM anon;` on all public RPCs.
**Verification:** `GRANT anon ... USING (false)` policy present in SQL. All RPCs have explicit `REVOKE ... FROM anon`.

---

#### SEC-BP15-02 — Non-member access blocked
**Severity:** HIGH → MUST-FIX
**Attack vector:** Authenticated user with no enterprise membership calls `list_automation_rules` or `create_automation_rule` with an arbitrary `enterprise_id`.
**Impact:** Cross-enterprise rule read/write.
**Required fix:** Private helper `fixeo_private._bp15_check_automation_reader(p_enterprise_id uuid)` called at the top of every public RPC. Must raise exception `'not_enterprise_member'` if caller has no active membership in `enterprise_members`.
**Verification:** SQL contains `_bp15_check_automation_reader` with active membership check.

---

#### SEC-BP15-03 — Inactive member blocked
**Severity:** HIGH → MUST-FIX
**Attack vector:** Previously suspended member (status = 'inactive' or 'suspended') calls any RPC.
**Impact:** Access to enterprise data after account suspension.
**Required fix:** `_bp15_check_automation_reader` (and all auth guards) must include `AND em.status = 'active'`. Inactive members are treated identical to non-members.
**Verification:** SQL auth guards include `status = 'active'` predicate.

---

#### SEC-BP15-04 — Reporter/viewer: read-only
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** Reporter or viewer role calls `create_automation_rule` or `evaluate_enterprise_automations`.
**Impact:** Unauthorized rule creation or trigger execution.
**Required fix:** Mutation RPCs must check `v_role IN ('owner','admin')` (create rule) or `v_role IN ('owner','admin','operations_manager')` (evaluate). Reporter/viewer must receive `insufficient_privilege`.
**Verification:** Role check in `create_automation_rule` excludes reporter/viewer. `evaluate_enterprise_automations` excludes reporter/viewer/site_manager.

---

#### SEC-BP15-05 — operations_manager: evaluate + read only
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** operations_manager calls `create_automation_rule` or modifies existing rules.
**Impact:** Rule creation/modification outside owner/admin authorization.
**Required fix:** `create_automation_rule` must restrict to `v_role IN ('owner','admin')`. `evaluate_enterprise_automations` permits `v_role IN ('owner','admin','operations_manager')`. `list_automation_rules` and `get_automation_executions` permit all active members.
**Verification:** SQL role check in `create_automation_rule` rejects operations_manager.

---

#### SEC-BP15-06 — site_manager: read scoped to assigned sites
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** site_manager queries rules for sites not in their assignment list.
**Impact:** Cross-site information disclosure within the same enterprise.
**Required fix:** `list_automation_rules` for site_manager role: filter by `rule.site_id = ANY(_fixeo_get_site_manager_site_ids(p_enterprise_id))`. `get_automation_executions` filtered similarly. RLS on `enterprise_automation_rules` enforces same.
**Verification:** SQL `list_automation_rules` includes site_manager scope filter.

---

#### SEC-BP15-07 — owner/admin: full rule management
**Severity:** HIGH → MUST-FIX
**Attack vector:** N/A — this is a positive authorization requirement.
**Impact:** Missing owner/admin access breaks operational functionality.
**Required fix:** `create_automation_rule`, update/delete (if implemented), `list_automation_rules`, `evaluate_enterprise_automations` all permit owner/admin.
**Verification:** SQL role check permits `'owner'` and `'admin'` in all mutation RPCs.

---

### TENANT ISOLATION

#### SEC-BP15-08 — Cross-enterprise rule isolation (CRITICAL)
**Severity:** CRITICAL → MUST-FIX
**Attack vector:** Authenticated user from enterprise A supplies `p_enterprise_id = enterprise_B_id` to any BP15 RPC.
**Impact:** Full cross-enterprise data read/write. CRITICAL — most severe class of tenant isolation failure.
**Required fix:**
1. RLS: `enterprise_automation_rules` has RESTRICTIVE anon denial + per-authenticated-user check via `fixeo_private._fixeo_is_enterprise_member(enterprise_id)`.
2. Every RPC validates caller's membership in the supplied `p_enterprise_id` before any query.
3. `enterprise_automation_executions` scoped by `enterprise_id` from joined `enterprise_automation_rules`.
**Verification:** RLS policy on `enterprise_automation_rules` uses `_fixeo_is_enterprise_member(enterprise_id)`. All RPCs check membership at start.

---

#### SEC-BP15-09 — `list_automation_rules` scoped by enterprise_id
**Severity:** HIGH → MUST-FIX
**Attack vector:** Caller omits enterprise filter or provides a wildcard.
**Impact:** Returns rules across all enterprises.
**Required fix:** `WHERE ear.enterprise_id = p_enterprise_id` applied as first CTE predicate. No unbounded scan.
**Verification:** SQL `list_automation_rules` includes `WHERE enterprise_id = p_enterprise_id`.

---

#### SEC-BP15-10 — `evaluate_enterprise_automations` scoped in all CTEs
**Severity:** HIGH → MUST-FIX
**Attack vector:** CTE in evaluator joins `enterprise_request_context` without enterprise filter.
**Impact:** Evaluator runs rules from enterprise A against requests from enterprise B.
**Required fix:** All CTEs in `evaluate_enterprise_automations` — `active_rules`, `candidate_requests`, signal CTEs — must have `enterprise_id = p_enterprise_id` as the first predicate. The `open_escalation()` call must pass `p_enterprise_id` directly (never derived from request data alone).
**Verification:** All CTEs in evaluator SQL contain `enterprise_id = p_enterprise_id`.

---

#### SEC-BP15-11 — Execution ledger scoped by enterprise_id
**Severity:** HIGH → MUST-FIX
**Attack vector:** `get_automation_executions` queries `enterprise_automation_executions` without enterprise filter.
**Impact:** Execution history of all enterprises exposed.
**Required fix:** `enterprise_automation_executions` stores `enterprise_id` as a denormalized column (indexed). All reads filter by `enterprise_id = p_enterprise_id`. RLS enforces `_fixeo_is_enterprise_member(enterprise_id)`.
**Verification:** SQL `enterprise_automation_executions` has `enterprise_id` column with index and RLS.

---

#### SEC-BP15-12 — `create_automation_rule` validates site belongs to same enterprise
**Severity:** HIGH → MUST-FIX
**Attack vector:** caller supplies `p_site_id` from a different enterprise.
**Impact:** Rule could target cross-enterprise site, leaking execution results.
**Required fix:** If `p_site_id IS NOT NULL`: `SELECT 1 FROM public.enterprise_sites WHERE id = p_site_id AND enterprise_id = p_enterprise_id` — must exist, else RAISE `'site_not_in_enterprise'`.
**Verification:** SQL `create_automation_rule` includes site enterprise validation guard.

---

#### SEC-BP15-13 — Cross-enterprise signal evaluation not possible
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** Evaluator's signal CTE could read `service_requests` without enterprise scoping.
**Impact:** Rules from one enterprise could fire on requests from another.
**Required fix:** `candidate_requests` CTE joins `enterprise_request_context erc ON erc.enterprise_id = p_enterprise_id` before joining `service_requests`. Signal evaluation is purely derived from this scoped set.
**Verification:** SQL evaluator `candidate_requests` CTE joins ERC with enterprise_id filter.

---

### SITE_MANAGER SCOPE

#### SEC-BP15-14 — site_manager cannot see rules for non-assigned sites
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** site_manager calls `list_automation_rules` without site filter — expects to see all enterprise rules.
**Impact:** Information disclosure of rules for sites outside scope.
**Required fix:** `list_automation_rules`: if `v_role = 'site_manager'`, restrict to `rule.site_id = ANY(_fixeo_get_site_manager_site_ids(p_enterprise_id)) OR rule.site_id IS NULL` (global rules still visible). Alternatively, restrict to site_id-scoped rules only if stricter isolation required.
**Verification:** SQL `list_automation_rules` includes site_manager branch with `_fixeo_get_site_manager_site_ids`.

---

#### SEC-BP15-15 — site_manager cannot see executions for non-assigned rules
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** site_manager calls `get_automation_executions` for a rule_id from another site.
**Impact:** Cross-site execution history visible to site_manager.
**Required fix:** `get_automation_executions`: resolve `rule.site_id` from `enterprise_automation_rules`. If caller is site_manager and `rule.site_id NOT IN (_fixeo_get_site_manager_site_ids(...))`, raise `insufficient_privilege`.
**Verification:** SQL `get_automation_executions` includes site_manager scope check.

---

#### SEC-BP15-16 — site_manager scope enforced server-side only
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** Client-side JS filters out non-assigned sites but server-side has no check.
**Impact:** Attacker bypasses frontend filtering by calling RPC directly.
**Required fix:** All site_manager scoping in PL/pgSQL RPCs (inside SECURITY DEFINER). Frontend may additionally filter for UX, but the authoritative check is always server-side.
**Verification:** Site_manager scope present in SQL RPCs, not only in JS contract.

---

### INPUT VALIDATION

#### SEC-BP15-17 — `signal_type` validated against allowlist
**Severity:** HIGH → **ACTIVE DEFECT IN EXISTING SQL AND JS**

**STATUS: ACTIVE DEFECT — MUST BE FIXED in both `supabase/bp15-enterprise-automation.sql` and `js/enterprise-automation-contract-v1.js`**

**Finding in SQL:** `enterprise_automation_rules.ear_signal_type_check` and `enterprise_automation_executions.eae_signal_type_check` use:
```sql
signal_type IN ('sla_breached', 'urgent_unattended', 'escalation_unacknowledged')
```
But the threat matrix canonical values are: `'sla_approaching'`, `'sla_breached'`, `'urgent_unassigned'`, `'mission_stalled'`. The SQL is missing `sla_approaching`, `urgent_unassigned`, `mission_stalled` and has `urgent_unattended` (typo) and `escalation_unacknowledged` (not in spec).

**Finding in JS:** Same defects in `enterprise-automation-contract-v1.js` SIGNAL_TYPES and SIGNAL_LABELS (see CONTRACT-02).

**Attack vector:** Users cannot create rules for `sla_approaching` or `mission_stalled` signals (most common automation triggers). `urgent_unattended` rules would be created but the signal would never fire correctly in the evaluator (signal logic looks for `urgent_unassigned`).

**Required fix:**
- SQL: Change both CHECK constraints to: `signal_type IN ('sla_breached', 'sla_approaching', 'urgent_unassigned', 'mission_stalled')`
- JS contract: Fix SIGNAL_TYPES array and SIGNAL_LABELS map
- Dashboard JS (line 330): Fix `p_signal_type NOT IN (...)` validation list
**Verification:** SQL signal_type CHECK contains all 4 canonical values. `sla_approaching` and `mission_stalled` present. `urgent_unattended` and `escalation_unacknowledged` absent.

---

#### SEC-BP15-18 — `action_type` validated against allowlist
**Severity:** HIGH → MUST-FIX
**Attack vector:** caller supplies `action_type = 'delete_enterprise'` or any value outside the single permitted value.
**Impact:** Unauthorized action dispatch.
**Required fix:** `IF p_action_type != 'open_escalation' THEN RAISE EXCEPTION 'invalid_action_type'; END IF;` enforced in `create_automation_rule`. CHECK constraint on table: `action_type IN ('open_escalation')`.
**Verification:** SQL has `action_type` CHECK constraint to `'open_escalation'` only.

---

#### SEC-BP15-19 — `severity` validated against CHECK constraint
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** caller supplies `severity = 'extreme'` or any value outside the escalation severity enum.
**Impact:** Invalid severity stored, potentially bypassing downstream severity checks.
**Required fix:** CHECK constraint on `enterprise_automation_rules.severity`: `severity IN ('critical','high','medium','low')`. Also explicit validation in `create_automation_rule` RPC matching BP13 severity enum.
**Verification:** SQL has `severity` CHECK constraint matching BP13 values.

---

#### SEC-BP15-20 — `p_limit` clamped
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** caller passes `p_limit = 999999` to `get_automation_executions` or `list_automation_rules`.
**Impact:** Large result sets — DoS / resource exhaustion.
**Required fix:** `v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);` in both list RPCs.
**Verification:** SQL uses `LEAST(GREATEST(...))` clamping in both list RPCs.

---

#### SEC-BP15-21 — `threshold_minutes` must be positive integer
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** caller supplies `threshold_minutes = -1` or `0`.
**Impact:** Negative threshold would cause all requests to match immediately; zero creates infinite loop risk in evaluator.
**Required fix:** CHECK constraint: `threshold_minutes > 0`. Explicit validation in `create_automation_rule`: `IF p_threshold_minutes <= 0 THEN RAISE EXCEPTION 'invalid_threshold'; END IF;`.
**Verification:** SQL has `threshold_minutes > 0` CHECK constraint.

---

#### SEC-BP15-22 — rule `name` trimmed, non-empty, max 200 chars
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** caller supplies empty string or very long name.
**Impact:** Garbage data; potential buffer/rendering issues.
**Required fix:** `v_name := trim(p_name); IF length(v_name) = 0 THEN RAISE EXCEPTION 'name_required'; END IF; IF length(v_name) > 200 THEN RAISE EXCEPTION 'name_too_long'; END IF;` in `create_automation_rule`. Column: `VARCHAR(200) NOT NULL`.
**Verification:** SQL `create_automation_rule` has trim + length validation.

---

#### SEC-BP15-23 — `urgency_filter` validated against canonical values
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** caller supplies arbitrary urgency string.
**Impact:** Evaluator could compare against non-existent `service_requests.urgency` value, silently matching all or no requests.
**Required fix:** `IF p_urgency_filter IS NOT NULL AND p_urgency_filter NOT IN ('urgent','normal') THEN RAISE EXCEPTION 'invalid_urgency_filter'; END IF;`. CHECK constraint on `enterprise_automation_rules.urgency_filter` nullable: `urgency_filter IS NULL OR urgency_filter IN ('urgent','normal')`.
**Verification:** SQL has `urgency_filter` CHECK constraint with NULL-or-canonical values.

---

### PRIVILEGE ESCALATION

#### SEC-BP15-24 — `evaluate_enterprise_automations` not callable by reporter/viewer/site_manager (CRITICAL)
**Severity:** CRITICAL → MUST-FIX
**Attack vector:** reporter/viewer/site_manager calls `evaluate_enterprise_automations` directly via Supabase JS, bypassing the dashboard UI.
**Impact:** Unauthorized escalation creation. reporter/viewer could trigger bulk escalation events. site_manager could evaluate automations across all sites (not just assigned).
**Required fix:** `evaluate_enterprise_automations` must check `v_role IN ('owner','admin','operations_manager')` and raise `insufficient_privilege` for any other role. This check occurs BEFORE any CTE evaluation begins.
**Verification:** SQL `evaluate_enterprise_automations` has explicit role check restricting to owner/admin/operations_manager only.

---

#### SEC-BP15-25 — automation execution does not grant elevated escalation access
**Severity:** HIGH → MUST-FIX
**Attack vector:** Evaluator calls `open_escalation()` which internally uses `auth.uid()`. If the evaluator runs as a SECURITY DEFINER function, the `auth.uid()` inside `open_escalation()` must still resolve to the original caller, not a super-user context.
**Impact:** If `auth.uid()` is null/wrong inside nested SECURITY DEFINER, `opened_by` would be `NULL`, violating NOT NULL constraint, or could be fabricated.
**Required fix:** `evaluate_enterprise_automations` is SECURITY DEFINER. `open_escalation()` is also SECURITY DEFINER. Both `SET search_path = ''`. `auth.uid()` in PostgreSQL refers to the JWT claim in the current transaction, which is consistent across nested SECURITY DEFINER calls. Verify: `auth.uid()` is NOT NULL check at start of `evaluate_enterprise_automations`. The `open_escalation()` call will inherit the same JWT context.
**Verification:** SQL `evaluate_enterprise_automations` checks `auth.uid() IS NOT NULL` before loop. `open_escalation` is SECURITY DEFINER with `search_path = ''`.

---

#### SEC-BP15-26 — automation rule cannot reference external URLs/scripts/arbitrary code
**Severity:** HIGH → MUST-FIX
**Attack vector:** Rule `name` or `metadata` field used to store and later execute an external URL, JavaScript snippet, or shell command.
**Impact:** Server-Side Request Forgery (SSRF), arbitrary code execution.
**Required fix:** BP15 rules are data-driven (signal_type + threshold + action_type enum). No field is ever passed to `EXECUTE`, `pg_read_file`, or HTTP calls. Rule `name` is VARCHAR(200) rendered as `textContent`. No EXECUTE dynamic SQL in any BP15 function. No `http_get`/`net.http_get` calls.
**Verification:** SQL has no `EXECUTE` in any BP15 function. No HTTP extension calls. No external URL stored/executed.

---

#### SEC-BP15-27 — `created_by` always `auth.uid()` — never client-supplied
**Severity:** HIGH → MUST-FIX
**Attack vector:** Client sends `created_by = '<victim_uuid>'` in the RPC payload.
**Impact:** Rule attribution to another user; audit trail forgery.
**Required fix:** `created_by` column in `enterprise_automation_rules` is set exclusively as `auth.uid()` in `create_automation_rule`. It is NOT a parameter of any public RPC. The INSERT is: `INSERT INTO enterprise_automation_rules (..., created_by) VALUES (..., auth.uid())`.
**Verification:** SQL `create_automation_rule` INSERT uses `auth.uid()` for `created_by`. No `p_created_by` parameter exists.

---

### IDEMPOTENCY / CONCURRENCY

#### SEC-BP15-28 — Concurrent evaluations: unique_violation caught, no duplicate escalation
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** Two simultaneous calls to `evaluate_enterprise_automations` for the same enterprise, evaluating the same rule against the same request — both attempt `open_escalation()` concurrently.
**Impact:** Duplicate escalations (if not handled), or unhandled exception crashing the evaluator.
**Required fix:** `evaluate_enterprise_automations` catches `unique_violation` (sqlstate `23505`) from `open_escalation()` in a BEGIN/EXCEPTION block. On `unique_violation`, skip the escalation (it already exists) and continue the loop. Record `'skipped_duplicate'` outcome in execution ledger.
**Verification:** SQL evaluator loop has EXCEPTION WHEN unique_violation handling.

---

#### SEC-BP15-29 — `ee_unique_active_escalation` provides final DB guard
**Severity:** LOW → ADDRESSED (by BP13 partial unique index)
**Attack vector:** Race condition between `evaluate_enterprise_automations` instances.
**Impact:** Duplicate active escalations for same enterprise/request/reason_code.
**Required fix:** Already provided by BP13: `UNIQUE INDEX ee_unique_active_escalation ON enterprise_escalations (enterprise_id, service_request_id, reason_code) WHERE status IN ('open','acknowledged')`.
**Verification:** BP13 SQL file contains `ee_unique_active_escalation` partial unique index.

---

#### SEC-BP15-30 — `idx_eae_idempotency` on execution ledger
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** Evaluator inserts a duplicate execution ledger record for the same rule + request + evaluation run.
**Impact:** Execution history pollution; misleading execution counts.
**Required fix:** `UNIQUE INDEX idx_eae_idempotency ON enterprise_automation_executions (rule_id, service_request_id, evaluated_at)` where `evaluated_at` is truncated to the minute/second. Alternatively: `UNIQUE (rule_id, service_request_id, execution_batch_id)` where batch_id is generated once per `evaluate_enterprise_automations` call.
**Verification:** SQL has unique/partial index on execution ledger to prevent double-recording.

---

#### SEC-BP15-31 — `ON CONFLICT DO NOTHING` on ledger insert
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** Concurrent evaluators both try to insert the same ledger row.
**Impact:** One insert fails with unique violation, propagating an unhandled error.
**Required fix:** Ledger insert uses `INSERT ... ON CONFLICT DO NOTHING` (after the idempotency index from SEC-BP15-30 is defined).
**Verification:** SQL execution ledger INSERT uses `ON CONFLICT DO NOTHING`.

---

### DATA LEAKAGE

#### SEC-BP15-32 — Execution ledger metadata contains no secrets
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** Rule execution metadata stored in `enterprise_automation_executions.metadata` contains API keys, tokens, or passwords.
**Impact:** Secrets exposed to anyone with read access to the execution ledger.
**Required fix:** `metadata` column in execution ledger is restricted to: `rule_id` (uuid), `signal_type` (text enum), `action_type` (text enum), `service_request_id` (uuid), `outcome` (text enum: 'executed'/'skipped_duplicate'/'error'). No free-form user text, no tokens, no SQL snippets.
**Verification:** SQL evaluator ledger INSERT metadata only contains the 5 safe fields above.

---

#### SEC-BP15-33 — Raw SQL error never reaches DOM
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** RPC throws a raw PostgreSQL error (e.g. `ERROR: column "foo" of relation "bar" does not exist`). Client JS catches it and renders `error.message` directly to DOM via `innerHTML`.
**Impact:** Schema names, table names, constraint names exposed to end users; enables targeted follow-on attacks.
**Required fix:** `_autoError(el, err)` sets `el.textContent` to a generic French message such as `"Une erreur est survenue. Veuillez réessayer."`. Raw `err.message` is logged to `console.error` only — never injected into DOM. Same pattern as `_escError` in BP13 and `_rptError` in BP14.
**Verification:** JS `_autoError` function uses `textContent` with static French string. No `innerHTML` with `err.message`.

---

#### SEC-BP15-34 — Rule listing does not expose cross-enterprise data
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** Caller with membership in enterprise A calls `list_automation_rules(enterprise_B_id)`.
**Impact:** Enterprise B's rule count and patterns exposed.
**Required fix:** Auth guard (SEC-BP15-02) raises `not_enterprise_member` before any query runs. RLS also prevents direct table access. Even if the guard is bypassed, RLS provides defense-in-depth.
**Verification:** Both RPC auth guard and RLS are in place (defense-in-depth per SEC-BP15-01/02/08).

---

### AUDIT INTEGRITY

#### SEC-BP15-35 — `automation_executed` action_type added to constraint
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** `evaluate_enterprise_automations` calls `_eal_append` with `action_type = 'automation_executed'`, but this value is not in the `eal_action_type_check` CHECK constraint.
**Impact:** Audit INSERT fails, rolling back the entire automation evaluation transaction (same class of bug as the BP13 `details`→`metadata` regression documented in BP14 audit).
**Required fix:** BP15 SQL must `DROP CONSTRAINT IF EXISTS eal_action_type_check; ADD CONSTRAINT eal_action_type_check CHECK (action_type IN (...all prior values..., 'automation_executed'))`. Must preserve all values from BP13 extension (escalation_opened, escalation_acknowledged, escalation_resolved).
**Verification:** SQL has `eal_action_type_check` extension including `'automation_executed'`. Includes all 11 existing values from BP13 plus the new one.

---

#### SEC-BP15-36 — Audit insert uses `fixeo_private._eal_append`
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** BP15 bypasses the canonical `_eal_append` helper and writes directly to `enterprise_audit_log`, possibly with wrong column names (same class as BP13 `details`/`metadata` bug).
**Impact:** Audit INSERT failure crashes the RPC; incorrect column names silently omit audit records.
**Required fix:** Use `PERFORM fixeo_private._eal_append(p_enterprise_id, auth.uid(), 'automation_executed', 'automation_rule', v_rule_id, jsonb_build_object('rule_id', v_rule_id, 'signal_type', v_signal_type, 'action_type', 'open_escalation', 'service_request_id', v_request_id))`. Column `metadata` (not `details`). Include `target_type` and `target_id` (required NOT NULL fields per 7c15a3).
**Verification:** SQL uses `_eal_append(...)` with correct 6-argument signature. No direct INSERT into `enterprise_audit_log`.

---

#### SEC-BP15-37 — Audit metadata contains no raw secrets
**Severity:** LOW → ADDRESSED BY DESIGN
**Attack vector:** Rule execution audit record stores raw SQL error text, JWT token, or credentials.
**Impact:** Secrets in audit log, accessible to all enterprise owners/admins.
**Required fix:** Metadata: `rule_id`, `signal_type`, `action_type`, `service_request_id` only. Errors are logged at `console.error` level in JS; never in audit metadata.
**Verification:** SQL `_eal_append` call metadata has only the 4 safe fields.

---

#### SEC-BP15-38 — `actor_user_id = auth.uid()` (server-derived)
**Severity:** HIGH → MUST-FIX
**Attack vector:** Client supplies `actor_user_id` parameter to an RPC and it's used as-is in audit INSERT.
**Impact:** Audit trail forgery — records a different user as the actor.
**Required fix:** `_eal_append` second argument is always `auth.uid()` — hardcoded in server function body. There is NO `p_actor_user_id` parameter on any public RPC. `auth.uid()` is the JWT-verified caller identity.
**Verification:** SQL all `_eal_append` calls use `auth.uid()` as second argument. No RPC exposes `actor_user_id` as a parameter.

---

### XSS / FRONTEND

#### SEC-BP15-39 — Rule `name` via `textContent` only
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** Rule name stored as `<img src=x onerror=alert(1)>`. If rendered via `innerHTML`, XSS fires for every user viewing the automation rules list.
**Impact:** Stored XSS — affects all enterprise members with dashboard access.
**Required fix:** All JS rendering of `rule.name` must use `el.textContent = rule.name` (never `el.innerHTML = rule.name`). This applies in the rules list component and any place the name is shown in execution history.
**Verification:** JS contract/dashboard has no `innerHTML` assignment with rule name fields.

---

#### SEC-BP15-40 — `signal_type`/`outcome` via contract helper then `textContent`
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** `signal_type` or `outcome` values from the database rendered directly via `innerHTML`.
**Impact:** If a future DB migration adds an unexpected value, or if data is tampered, XSS fires.
**Required fix:** All `signal_type` and `outcome` labels must pass through a contract lookup (e.g. `AUTOMATION_SIGNAL_LABELS[row.signal_type] || row.signal_type`) and then assigned via `el.textContent`. Contract lookups use `Object.freeze({...})` maps — unknown values fall back to the raw string but still go via `textContent`.
**Verification:** JS contract module has `AUTOMATION_SIGNAL_LABELS` frozen map. Dashboard rendering uses `textContent` for these fields.

---

#### SEC-BP15-41 — Form inputs sanitized before submission
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** Rule creation form submits `name = ''`, `threshold_minutes = -1`, or `signal_type = 'arbitrary'` without client-side validation.
**Impact:** Server raises exception; unhandled error may leak schema info if `_autoError` is not in place.
**Required fix:** Client-side validation before RPC call:
- `name` trimmed, non-empty, ≤ 200 chars
- `threshold_minutes` parsed as integer, > 0
- `signal_type` checked against `AUTOMATION_SIGNAL_LABELS` keys
- `action_type` checked === `'open_escalation'`
- `severity` checked against escalation severity enum
Server-side validation remains authoritative; client validation is UX only.
**Verification:** JS form submit handler validates name, threshold_minutes, signal_type, action_type, severity before calling RPC.

---

#### SEC-BP15-42 — Form error messages: generic French via `textContent`
**Severity:** MEDIUM → MUST-FIX
**Attack vector:** RPC error `err.message` rendered via `innerHTML` in the rule creation form's error banner.
**Impact:** Schema/function names exposed to user (information disclosure); potential XSS if `err.message` contains HTML.
**Required fix:** `_autoError(el, err)` uses `el.textContent = 'Une erreur est survenue. Veuillez réessayer.'` — static French string, no dynamic content, no `innerHTML`.
**Verification:** JS `_autoError` function is present and uses `textContent` with static string.

---

### SEARCH PATH / SECURITY DEFINER

#### SEC-BP15-43 — All SECURITY DEFINER functions: `SET search_path = ''`
**Severity:** HIGH → MUST-FIX
**Attack vector:** A malicious schema on the search_path shadows a system function (e.g. `public.auth` shadows `auth`). Without `SET search_path = ''`, the SECURITY DEFINER function resolves names from the attacker's schema.
**Impact:** Privilege escalation via search_path injection.
**Required fix:** Every BP15 function using `SECURITY DEFINER` must include `SET search_path = ''` in the function definition. This applies to: `_bp15_check_automation_reader`, `create_automation_rule`, `list_automation_rules`, `evaluate_enterprise_automations`, `get_automation_executions`, and any trigger functions.
**Verification:** Every `SECURITY DEFINER` function in BP15 SQL includes `SET search_path = ''`.

---

#### SEC-BP15-44 — Private helpers: REVOKE from PUBLIC, anon, authenticated
**Severity:** HIGH → MUST-FIX
**Attack vector:** Private helper `_bp15_check_automation_reader` callable by `authenticated` role directly, bypassing the intended call-chain.
**Impact:** Helper could be abused in crafted queries; defense-in-depth violated.
**Required fix:** `REVOKE ALL ON FUNCTION fixeo_private._bp15_check_automation_reader(...) FROM PUBLIC, anon, authenticated;` after each private function creation. This ensures private helpers are ONLY callable from other SECURITY DEFINER functions within the session.
**Verification:** SQL has `REVOKE ALL ... FROM PUBLIC, anon, authenticated` for all `fixeo_private.*` BP15 helpers.

---

#### SEC-BP15-45 — Public RPCs: REVOKE from PUBLIC/anon; GRANT to authenticated
**Severity:** HIGH → MUST-FIX
**Attack vector:** Default PostgreSQL EXECUTE privilege on new functions is `PUBLIC`. If REVOKE is omitted, anonymous users can call the function.
**Impact:** Unauthenticated access to automation RPCs.
**Required fix:** After each public RPC creation:
```sql
REVOKE EXECUTE ON FUNCTION public.<rpc_name>(...) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<rpc_name>(...) FROM anon;
GRANT  EXECUTE ON FUNCTION public.<rpc_name>(...) TO   authenticated;
```
Applied to: `create_automation_rule`, `list_automation_rules`, `evaluate_enterprise_automations`, `get_automation_executions`.
**Verification:** SQL has explicit REVOKE/GRANT after each public RPC.

---

### DISPATCH / LIFECYCLE ISOLATION

#### SEC-BP15-46 — `dispatch_execute_v1` NOT called in BP15
**Severity:** INFO → VERIFIED BY DESIGN
**Attack vector:** BP15 accidentally calls `dispatch_execute_v1` when creating an escalation, triggering unintended dispatch workflow.
**Impact:** Unexpected side effects; double-dispatch race conditions.
**Requirement:** BP15 automation actions are limited to calling `public.open_escalation()`. No `dispatch_execute_v1` calls anywhere in BP15 SQL.
**Verification:** SQL grep for `dispatch_execute_v1` in BP15 SQL returns no matches.

---

#### SEC-BP15-47 — No `enterprise_requests` table introduced
**Severity:** INFO → VERIFIED BY DESIGN
**Attack vector:** BP15 introduces an `enterprise_requests` shadow table, duplicating `service_requests` data.
**Impact:** Data divergence, audit trail confusion, canonical table violation.
**Requirement:** BP15 must NOT create any table named `enterprise_requests`. Request context is `enterprise_request_context` (ERC) — BP13 architecture invariant.
**Verification:** BP15 SQL does not contain `CREATE TABLE.*enterprise_requests`.

---

#### SEC-BP15-48 — No `enterprise_missions` table introduced
**Severity:** INFO → VERIFIED BY DESIGN
**Attack vector:** BP15 introduces an `enterprise_missions` shadow table duplicating `missions` data.
**Impact:** Same as SEC-BP15-47.
**Requirement:** BP15 must NOT create any table named `enterprise_missions`.
**Verification:** BP15 SQL does not contain `CREATE TABLE.*enterprise_missions`.

---

#### SEC-BP15-49 — No `service_requests.enterprise_site_id` reference
**Severity:** INFO → VERIFIED BY DESIGN
**Attack vector:** BP15 queries `service_requests.enterprise_site_id` for enterprise linkage.
**Impact:** This column does not exist; query would fail. More importantly, using it as a linkage bypasses the ERC contract.
**Requirement:** All enterprise-request linkage in BP15 must go via `enterprise_request_context`. No `service_requests.enterprise_site_id` references.
**Verification:** BP15 SQL does not contain `enterprise_site_id` anywhere.

---

#### SEC-BP15-50 — Automation creates escalations only via BP13 contract
**Severity:** INFO → **REVISED TO HIGH (ACTIVE DEFECT IN EXISTING SQL)**

**STATUS: ACTIVE DEFECT — `supabase/bp15-enterprise-automation.sql` MUST BE FIXED**

**Finding:** `evaluate_enterprise_automations` in the existing SQL (lines 599, 715, 823) uses **direct `INSERT INTO public.enterprise_escalations`** rather than calling `public.open_escalation()`. This bypasses all BP13 guards:
- `severity` and `reason_code` validation in `open_escalation()`
- site_manager assignment check (`site_not_assigned` guard)
- `ee_unique_active_escalation` is still applied at the DB level (deduplication still works), but the BP13 audit trail via `_eal_append` is **NOT called** — escalations are created silently without audit records
- `opened_by` column must still be set correctly

**Attack vector:** Automation can create escalations with any `reason_code` (including values outside the BP13 allowlist if the INSERT bypasses validation), and without firing the BP13 audit trail.

**Requirement:** `evaluate_enterprise_automations` must call `public.open_escalation(p_enterprise_id, v_request_id, v_severity, v_signal_type)` for each triggered rule. Direct INSERT into `enterprise_escalations` is prohibited in BP15.

**Fix required in:** `supabase/bp15-enterprise-automation.sql` — replace all 3 direct INSERT blocks with `SELECT public.open_escalation(...)` calls inside a BEGIN/EXCEPTION block.

**Verification:** BP15 SQL uses `open_escalation(...)` call, not direct INSERT into `enterprise_escalations`.

---

## Architecture Compliance

| Check | Status |
|-------|--------|
| `enterprise_request_context` sole enterprise linkage | REQUIRED |
| No `service_requests.enterprise_site_id` reference | REQUIRED |
| No `enterprise_requests` / `enterprise_missions` tables | REQUIRED |
| `missions.request_id = sr.id::text` cast in evaluator | REQUIRED |
| All SECURITY DEFINER: `SET search_path = ''` | REQUIRED |
| All public RPCs: REVOKE PUBLIC, anon; GRANT authenticated | REQUIRED |
| All private helpers: REVOKE PUBLIC, anon, authenticated | REQUIRED |
| `created_by = auth.uid()` (never client-supplied) | REQUIRED |
| `actor_user_id = auth.uid()` in audit (never client-supplied) | REQUIRED |
| Audit via `_eal_append` (canonical) | REQUIRED |
| `eal_action_type_check` extended with `automation_executed` | REQUIRED |
| Automation creates escalations via `open_escalation()` only | REQUIRED |
| No `dispatch_execute_v1` calls | REQUIRED |
| No `EXECUTE` dynamic SQL in BP15 functions | REQUIRED |

---

## Contract File Security Findings (js/enterprise-automation-contract-v1.js)

The JS contract file **already exists** at HEAD. The following concrete defects were found:

### CONTRACT-01 — `urgency_filter` constants do not match DB canonical values
**Severity:** HIGH — MUST-FIX
**Finding:** `URGENCY_FILTER_OPTIONS = ['normale', 'urgent', 'now']` and `URGENCY_LABELS = { normale, urgent, now }`. However, SEC-BP15-23 specifies canonical values are `('urgent', 'normal')` (English, lowercase). The contract uses `'normale'` (French) and `'now'` (not in spec). If these values are sent to `create_automation_rule`, the DB CHECK constraint will reject them.
**Attack vector:** Form submits `urgency_filter = 'normale'`; DB raises constraint error. If `_autoError` isn't in place, raw error leaks to DOM.
**Fix required:** Change to `URGENCY_FILTER_OPTIONS = ['urgent', 'normal']` and update labels dict key to `'normal'`. Remove `'now'`.
**File:** `js/enterprise-automation-contract-v1.js` line 26.

### CONTRACT-02 — `SIGNAL_TYPES` constant has wrong values
**Severity:** HIGH — MUST-FIX
**Finding:** `SIGNAL_TYPES = ['sla_breached', 'urgent_unattended', 'escalation_unacknowledged']`. The threat matrix canonical signal types are: `sla_breached`, `sla_approaching`, `urgent_unassigned`, `mission_stalled`. The contract is missing `sla_approaching`, `urgent_unassigned`, `mission_stalled` and contains `urgent_unattended` (typo — should be `urgent_unassigned`) and `escalation_unacknowledged` (not in spec).
**Attack vector:** Form shows wrong/incomplete signal type options. Users cannot select `sla_approaching` or `mission_stalled`. `urgent_unattended` would fail DB validation.
**Fix required:** Replace with `SIGNAL_TYPES = ['sla_breached', 'sla_approaching', 'urgent_unassigned', 'mission_stalled']` and update `SIGNAL_LABELS` accordingly.
**File:** `js/enterprise-automation-contract-v1.js` lines 21, 30-35.

### CONTRACT-03 — `reason_code: 'auto'` hardcoded default is not a valid BP13 value
**Severity:** HIGH — MUST-FIX
**Finding:** Both `js/enterprise-automation-contract-v1.js` (`createRule()`) and `js/enterprise-dashboard-v1.js` (line 6751) hardcode `reason_code: params.reason_code || 'auto'` / `reason_code: 'auto'`. BP13 `enterprise_escalations` has `ee_reason_code_check` constraint allowing only: `'sla_breached','sla_approaching','urgent_unassigned','mission_stalled','manual'`. `'auto'` is not a valid value and will cause the BP13 `open_escalation()` call to fail with a constraint violation.
**Attack vector:** Automation rule fires, calls `open_escalation()` with `reason_code = 'auto'`, transaction rolls back, no escalation is created — silently. The automation appears to execute but has no effect.
**Fix required:** Remove `reason_code` from the `createRule()` contract (it should be derived from `signal_type` server-side, or only `'manual'` is accepted). If `reason_code` is needed, validate it against the BP13 allowlist.
**File:** `js/enterprise-automation-contract-v1.js` line 178.

### CONTRACT-04 — Vocabulary constants not frozen (Object.freeze missing)
**Severity:** LOW — HARDENING
**Finding:** `SIGNAL_TYPES`, `ACTION_TYPES`, `SEVERITY_OPTIONS`, `URGENCY_FILTER_OPTIONS` declared as `var` — mutable. Any code with access to the module can mutate these arrays, potentially bypassing validation.
**Fix required:** Use `Object.freeze([...])` for all vocabulary constants, matching BP13's `ESCALATION_SEVERITY` and `ESCALATION_REASON_CODES` pattern.
**File:** `js/enterprise-automation-contract-v1.js` lines 21-26.

### CONTRACT-05 — No `_autoError` function in contract (generic error handler missing)
**Severity:** MEDIUM — MUST-FIX
**Finding:** The contract has no `_autoError` helper. Dashboard JS may handle automation RPC errors inline — if it uses `err.message` directly in DOM, raw schema errors leak to users (SEC-BP15-33).
**Fix required:** Either add `_autoError(el, err)` to the contract (uses `textContent` with static French string), or ensure dashboard JS BP15 section has this helper.
**File:** `js/enterprise-automation-contract-v1.js` — missing function.

---

## Pre-existing Issues (Inherited, Out of BP15 Scope)

| Issue | Source | Status |
|-------|--------|--------|
| BP13 `details`→`metadata` audit column mismatch | BP13 SQL | Documented in BP14 audit. Corrigendum required before production. |
| `target_type` NOT NULL missing in BP13 audit calls | BP13 SQL | Same as above. |

---

## Pre-Merge Gate

**BP15 is NOT READY FOR REVIEW until all CRITICAL (2) and HIGH (14) findings are ADDRESSED.**

| Blocking findings | Count |
|-------------------|-------|
| CRITICAL (SEC-BP15-08, SEC-BP15-24) | 2 |
| HIGH (SEC-BP15-01,02,03,07,09,10,11,12,17,18,25,26,27,38,43,44,45) | 14+ |
| MEDIUM (requires fix but not blocking merge gate if documented) | 18 |

**Security gate: All CRITICAL + HIGH must be ADDRESSED before merge.**
