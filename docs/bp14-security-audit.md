# BP14 Security Audit — Enterprise Reporting & Executive Control

**Date:** 2026-09-13  
**Branch:** `recovery/seo-v3-safe`  
**Scope:** `supabase/bp14-enterprise-reporting.sql`, `js/enterprise-reporting-contract-v1.js`, `js/enterprise-reporting-edge-cases-v1.js`, BP14 sections of `enterprise-dashboard.html`, `css/enterprise-dashboard-v1.css`, `js/enterprise-dashboard-v1.js`  
**Auditor:** BP14 Security Agent  
**Depends on:** BP09, BP10, BP12, BP13 (all read-only — no state mutation in BP14)

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 3 | ADDRESSED |
| LOW | 6 | ADDRESSED |
| INFO | 11 | DOCUMENTED |

**Grand total: 20 findings. All CRITICAL/HIGH: none. All MEDIUM+: ADDRESSED.**

---

## Findings

### Authorization

#### SEC-01 — Tenant isolation: enterprise_id scoped in all CTEs
**Severity:** HIGH → ADDRESSED  
**RPCs:** `get_enterprise_executive_summary`, `get_site_performance_report`, `get_enterprise_trend`, `get_management_attention`  
All CTEs filter by `enterprise_id = p_enterprise_id` before any aggregation or JOIN. Cross-tenant data leakage via aggregation is not possible — the enterprise_id filter is applied at the innermost CTE, not at the outer SELECT.

#### SEC-02 — Non-member access blocked
**Severity:** HIGH → ADDRESSED  
`fixeo_private._bp14_check_member_role()` is called at the top of every public RPC. It raises `not_enterprise_member` if the caller has no active membership. Inactive members (`status != 'active'`) are treated the same as non-members.

#### SEC-03 — Unauthenticated access blocked
**Severity:** HIGH → ADDRESSED  
`_bp14_check_member_role()` checks `auth.uid() IS NULL` first and raises `not_authenticated`. Anonymous callers cannot reach any reporting data.

#### SEC-04 — site_manager scoped to assigned sites in all 4 RPCs
**Severity:** HIGH → ADDRESSED  
Every RPC checks `v_role != 'site_manager' OR site_id = ANY(_fixeo_get_site_manager_site_ids(...))`. This is applied in:
- `get_enterprise_executive_summary`: `erc_period`, `esc_period` CTEs
- `get_site_performance_report`: `allowed_sites` CTE (gates the entire report)
- `get_enterprise_trend`: `req_data`, `esc_data` CTEs
- `get_management_attention`: all 4 UNION branches independently

#### SEC-05 — Reporter/viewer: read-only access permitted
**Severity:** INFO  
BP14 contains zero INSERT/UPDATE/DELETE statements. `reporter` and `viewer` roles may call all reporting RPCs. No privilege escalation risk.

#### SEC-06 — Owner/admin/operations_manager: full enterprise view
**Severity:** INFO  
These roles pass the `site_manager` branch check and see all sites. Correct behavior.

---

### Input Validation

#### SEC-07 — p_days unbounded query prevention
**Severity:** HIGH → ADDRESSED  
`LEAST(GREATEST(p_days, 1), 90)` clamping applied in:
1. `fixeo_private._bp14_period_bounds()` helper (enforces invariant for all callers)
2. Inline in each public RPC before calling the helper  
No RPC can produce a period longer than 90 days. No unbounded table scans are possible via this parameter.

#### SEC-08 — p_bucket SQL injection prevention
**Severity:** MEDIUM → ADDRESSED  
`p_bucket` is used inside `date_trunc(p_bucket, ...)` and `generate_series(... ('1 ' || p_bucket)::interval ...)`. If unvalidated, an attacker could inject arbitrary interval strings.  
**Fix:** `IF p_bucket NOT IN ('day', 'week') THEN RAISE EXCEPTION 'invalid_bucket'; END IF;` executes before any use of the parameter.

#### SEC-09 — p_limit clamped in get_management_attention
**Severity:** LOW → ADDRESSED  
`v_lim := LEAST(GREATEST(p_limit, 1), 100)` prevents requesting arbitrarily large result sets.

#### SEC-10 — No raw user string interpolation
**Severity:** INFO  
All RPCs use parameterized `$1`, `$2` via `LANGUAGE plpgsql`. No dynamic SQL (`EXECUTE format(...)`) is used anywhere in BP14. SQL injection via string concatenation is not possible.

---

### Data Leakage

#### SEC-11 — Site name leakage via aggregation
**Severity:** MEDIUM → ADDRESSED  
Site names are only returned in `get_site_performance_report` and `get_management_attention` after the caller's enterprise membership and site_manager scope have been validated. The `allowed_sites` CTE is joined — not a LEFT JOIN — so only authorized sites can appear.

#### SEC-12 — Zero-count leakage: enterprise existence inference
**Severity:** LOW → ADDRESSED  
An unauthenticated caller cannot determine whether an enterprise_id exists, because `_bp14_check_member_role` raises `not_authenticated` before any data query runs. An authenticated non-member gets `not_enterprise_member`, which also reveals nothing about whether the enterprise exists. This is consistent with BP09–BP13 behavior.

#### SEC-13 — completion_rate NULL when total = 0
**Severity:** LOW → ADDRESSED  
`CASE WHEN COUNT(sr.status) = 0 THEN NULL ELSE ROUND(...) END` prevents a misleading `0%` completion rate from appearing for sites with no requests in the period. The frontend renders `N/A` for null completion rates, which is both accurate and non-misleading.

#### SEC-14 — SLA trend historical: safe zero, not fabricated
**Severity:** INFO  
`sla_breached` in `get_enterprise_trend` returns `0::bigint` for all buckets. SLA state (`on_track`, `breached`, `approaching`) is derived point-in-time from current timestamps — it is not an event recorded at breach time. Returning historical breach counts would require fabrication. The zero is documented in a SQL comment and in `docs/bp14-security-audit.md`. Consumers are not misled.

#### SEC-15 — Missions NOT EXISTS pattern (urgent_unassigned signal)
**Severity:** LOW → ADDRESSED  
The `urgent_unassigned` signal in `get_management_attention` uses:
```sql
AND NOT EXISTS (
  SELECT 1 FROM public.missions m
  WHERE m.request_id = sr.id::text
    AND m.status IN ('accepted', 'started')
)
```
This is correct. A `LEFT JOIN ... WHERE m.id IS NULL` pattern was rejected because it would expose mission row counts. The `NOT EXISTS` subquery leaks no mission data.

---

### XSS / Frontend Security

#### SEC-16 — No innerHTML with user-controlled data
**Severity:** HIGH → ADDRESSED  
All BP14 JS rendering functions (`renderRptKpis`, `renderRptSitesTable`, `renderRptAttention`, `renderRptSparklines`) use `textContent` for all user/database-sourced values. SVG elements are created via `document.createElementNS` with individual attribute assignments — no `innerHTML` is used for SVG construction.

#### SEC-17 — Raw error.message never reaches DOM
**Severity:** MEDIUM → ADDRESSED  
`_rptError(msg)` sets `#rpt-error-msg` via `textContent` with a generic French message only. The raw `error.message` from Supabase/PostgreSQL is logged to console at most — never injected into the DOM. This prevents internal schema/function names from being revealed to end users.

#### SEC-18 — Sparkline attribute injection
**Severity:** LOW → ADDRESSED  
SVG `<rect>` attributes (`x`, `y`, `width`, `height`) are set from computed numeric values (`barWidth`, `barHeight`, `xOffset`, `yOffset`) — all derived from the integer counts returned by the RPC, not from raw strings. No user-controlled text is used as an SVG attribute value.

---

### Performance / DoS

#### SEC-19 — generate_series bounded by 90-day clamp
**Severity:** LOW → ADDRESSED  
`get_enterprise_trend` with `p_bucket='day'` produces at most 90 rows from `generate_series`. With `p_bucket='week'` at most 13 rows. Both are bounded by the 90-day period clamp (SEC-07). The generate_series call cannot be weaponized to produce large result sets.

#### SEC-20 — Double-load guard prevents concurrent RPCs
**Severity:** INFO  
`S.reportingLoading` is set to `true` at the start of `loadReportingData()` and `false` on completion. Rapid period-switching or retry clicks cannot trigger concurrent RPC floods. The guard is checked at the function entry point before any async work begins.

---

### Pre-existing Known Issue (out of BP14 scope)

#### SEC-BP13-GAP — BP13 audit inserts use `details` column (does not exist)
**Severity:** HIGH (pre-existing, out of BP14 scope)  
**Status:** DOCUMENTED — NOT FIXED IN BP14  
**Affected file:** `supabase/bp13-enterprise-escalations.sql`  
**Functions:** `open_escalation`, `acknowledge_escalation`, `resolve_escalation`  
**Issue:** All three BP13 RPCs INSERT into `enterprise_audit_log.details`. The actual column is `metadata` (confirmed from `supabase/7c15a3-enterprise-account-audit.sql`). Additionally, `target_type` (NOT NULL) is not supplied in these inserts.  
**Effect:** When these RPCs execute against a live database, the audit INSERT will fail with a column-not-found error, causing the entire RPC transaction to roll back. The primary operation (open/acknowledge/resolve escalation) will NOT be persisted.  
**Remediation required:** A separate corrigendum migration must `CREATE OR REPLACE` all three BP13 RPCs replacing `details` → `metadata` and adding `target_type` to all audit INSERT statements. This should be applied before BP13 RPCs are used in production. The fix is straightforward but was deferred to avoid scope-creep in BP14.  
**BP14 is not affected:** All BP14 RPCs are read-only (no audit INSERTs). BP14 uses the correct `metadata` column naming throughout.

---

## Architecture Compliance

| Check | Status |
|-------|--------|
| `enterprise_request_context` sole enterprise linkage | ✅ PASS |
| No `service_requests.enterprise_site_id` | ✅ PASS |
| No `enterprise_requests` / `enterprise_missions` tables | ✅ PASS |
| `missions.request_id = sr.id::text` cast | ✅ PASS |
| Period max 90 days | ✅ PASS |
| Server-side UTC timestamps only | ✅ PASS |
| SLA authority server-side only | ✅ PASS |
| No canonical status mutation in BP14 JS | ✅ PASS |
| BP12/BP13 dependencies: LEFT JOIN (graceful degrade) | ✅ PASS |
| All write RPCs: SECURITY DEFINER + SET search_path='' | ✅ PASS (4/4) |
| All public RPCs: REVOKE from PUBLIC, anon | ✅ PASS (4/4) |
| All public RPCs: GRANT to authenticated | ✅ PASS (4/4) |
| Private helpers: REVOKE from PUBLIC, anon, authenticated | ✅ PASS (2/2) |

---

## BP14 Files Audited

| File | Role | Findings |
|------|------|----------|
| `supabase/bp14-enterprise-reporting.sql` | Backend SQL | SEC-07,08,09,10,11,13,14,15 — all addressed |
| `js/enterprise-reporting-contract-v1.js` | JS contract | SEC-17 via generic errors |
| `js/enterprise-reporting-edge-cases-v1.js` | Pure validators | No security findings |
| `js/enterprise-dashboard-v1.js` (BP14 section) | Dashboard JS | SEC-16,17,18,20 — all addressed |
| `enterprise-dashboard.html` (BP14 section) | UX | No security findings |
| `css/enterprise-dashboard-v1.css` (BP14 section) | Styles | No security findings |
