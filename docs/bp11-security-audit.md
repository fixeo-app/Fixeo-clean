# BP11 Security Audit

**Date:** 2026-09-13  
**Scope:** BP11 Operations Command Center (enterprise-ops-contract-v1.js + enterprise-dashboard-v1.js BP11 section)  
**Out of scope:** repo-wide audit, BLOCKER-01, 7c15a4, BP10, pricing files, supabase migrations

---

## Findings Summary

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| SEC-01 | HIGH | FIXED | Tenant isolation — null activeEnterprise guard missing in ops query paths |
| SEC-02 | MEDIUM | NOTED | site_manager scoping — enforced by server-side RLS (BP09), not client-side |
| SEC-03 | MEDIUM | NOTED | Inactive member access — re-checked by RLS on every query, not just login |
| SEC-04 | HIGH | FIXED | Reporter/viewer mutation — canConfirm() gate enforced before confirmOpsValidation |
| SEC-05 | MEDIUM | NOTED | Stale session — onAuthStateChange handles token expiry; RLS denies all expired requests |
| SEC-06 | MEDIUM | FIXED | Concurrent refresh — opsQueueLoading flag prevents concurrent loadOpsQueue calls |
| SEC-07 | HIGH | FIXED | Double-submit — opsConfirmSubmitting flag guards confirmOpsValidation |
| SEC-08 | LOW | FIXED | Loading race — opsDetailRequestId staleness check discards stale responses |
| SEC-09 | HIGH | FIXED | Request-detail race — S.opsDetailRequestId set before async; stale response discarded |
| SEC-10 | LOW | NOTED | Raw UUID leakage — UUIDs in data-rid attributes only; no UUID in error messages |
| SEC-11 | HIGH | FIXED | Unsafe DB error messages — all error paths show generic French UI messages only |
| SEC-12 | HIGH | FIXED | XSS — all user data via textContent; safeHtml() for badge class names only |
| SEC-13 | MEDIUM | FIXED | Null mission — fetchOpsMission returns null; renderOpsDetail handles null mission gracefully |
| SEC-14 | LOW | NOTED | Multiple missions — limit(1) + order(created_at DESC) returns most recent; correct behavior |
| SEC-15 | CRITICAL | FIXED | missions.request_id TEXT cast — fetchOpsMission uses String(srId); no UUID cast |

---

## Detailed Findings

### SEC-01 — Tenant isolation (HIGH → FIXED)
**Risk:** If `S.activeEnterprise` is null when ops query fires, `enterpriseId` would be undefined, potentially returning all visible rows across tenants (server RLS would still block, but the query should never fire).  
**Fix:** Both `loadOpsQueue` and `refreshOpsKpis` have `if (!S.activeEnterprise) return;` as their first statement.  
**Residual:** Server-side RLS (`enterprise_request_context.enterprise_id = em.enterprise_id`) is the authoritative enforcement layer. Client-side guard is defense-in-depth.

### SEC-02 — site_manager scoping (MEDIUM → NOTED)
**Architecture:** The BP09 migration (`supabase/bp09-enterprise-rls-and-schema.sql`) implements `enterprise_sm_requests_read` and `enterprise_sm_missions_read` policies with `enterprise_member_sites` scope enforcement.  
**JS layer:** `opsFilters.site` is a UX convenience filter only — it never replaces or duplicates RLS enforcement. A site_manager cannot see requests outside their assigned sites regardless of what filter value the client sends.  
**Residual:** Until BP09 is applied to production, enterprise members cannot read service_requests or missions. The ops queue will return empty for all enterprise roles until migrations are applied.

### SEC-03 — Inactive member access (MEDIUM → NOTED)
**Architecture:** All enterprise RLS policies check `em.status = 'active'`. If a member's status is set to inactive in the DB, the next query from their session will return empty/denied results — no client-side check required.  
**Residual:** A session cookie remains valid until token expiry (default Supabase: 1 hour). During that window, an inactive member retains a valid JWT but all queries will be denied by RLS. Acceptable.

### SEC-04 — Reporter/viewer mutation blocking (HIGH → FIXED)
**Risk:** A reporter or viewer triggering `confirmOpsValidation` would call `confirm_completed_mission` RPC.  
**Fix:** `confirmOpsValidation` begins with `if (!canConfirm(S.userRole)) return;`. `CAN_CONFIRM_ROLES = ['owner','admin','operations_manager','site_manager']` does NOT include `reporter` or `viewer`.  
**UI:** The confirm button is hidden in `renderOpsDetail` unless `canConfirm(S.userRole) && sr.status === 'completed'`. Belt-and-suspenders: even if button HTML were manipulated, the JS gate blocks execution.  
**Server:** `confirm_completed_mission` RPC has its own SECURITY DEFINER authz — see BP08/BP09 contracts.

### SEC-05 — Stale session (MEDIUM → NOTED)
**Architecture:** The dashboard uses `_sb.auth.onAuthStateChange`. On `SIGNED_OUT` or token expiry, the existing `handleAuthChange` logic navigates to login. All subsequent Supabase queries return 401 and are caught in error handlers.  
**Residual:** No additional handling needed in BP11 ops functions; the existing global auth flow covers this.

### SEC-06 — Concurrent refresh (MEDIUM → FIXED)
**Risk:** A rapid filter change + auto-refresh could fire two `loadOpsQueue` calls concurrently, causing list duplication.  
**Fix:** `if (S.opsQueueLoading) return;` at the top of `loadOpsQueue`. The existing `isPolling` flag covers the overview/requests polling path (separate). The ops section has its own independent guard.

### SEC-07 — Double-submit (HIGH → FIXED)
**Risk:** A user double-clicking the "Valider la mission" button could fire two `confirm_completed_mission` RPC calls.  
**Fix:** `S.opsConfirmSubmitting` flag: set to `true` on entry, checked as first statement. Button is disabled during inflight. Reset on success or error.

### SEC-08 — Loading race (LOW → FIXED)
**Risk:** User clicks a row while `loadOpsQueue` is still fetching. `loadOpsDetail` fires; the list then re-renders with stale data.  
**Fix:** Detail panel and queue section are independent UI regions. `loadOpsDetail` does not depend on queue completion. The queue guard (`opsQueueLoading`) prevents list corruption. Acceptable.

### SEC-09 — Request-detail race (HIGH → FIXED)
**Risk:** User clicks row A, then quickly row B. Both `loadOpsDetail(A)` and `loadOpsDetail(B)` fire. If A returns last, it overwrites B's panel.  
**Fix:** `S.opsDetailRequestId` is set to `requestId` at function entry. After each `await`, the function checks `if (S.opsDetailRequestId !== myRequestId) return;`. Stale responses are silently discarded.

### SEC-10 — Raw UUID leakage (LOW → NOTED)
**Assessment:** UUIDs appear in `data-rid` attributes on queue rows and in `confirm-btn` data attributes. This is intentional and acceptable — UUIDs are not secret identifiers; access is controlled by RLS. No UUID appears in user-visible error messages or in `console.error` calls that expose schema structure.

### SEC-11 — Unsafe DB error messages (HIGH → FIXED)
**Risk:** Supabase error objects may contain table names, constraint names, or column names.  
**Fix:** All error catch blocks in ops JS set UI text to static French strings:
- Queue error: `'Erreur de chargement. Veuillez réessayer.'`
- Confirm error: `'Erreur lors de la validation. Veuillez réessayer.'`
- Detail load errors: silent (panel left in loading state)
Raw `error.message` is never written to any DOM element.

### SEC-12 — XSS (HIGH → FIXED)
**Risk:** User-controlled data (site name, category, description) rendered in HTML could inject scripts.  
**Fix audit:**
- `siteName`, `category`, `description`, `city` — all set via `.textContent`
- Badge class names use `safeHtml()` wrapper (HTML-encodes `<`, `>`, `"`, `&`) before use in class strings
- `innerHTML = ''` used only for clearing empty lists — no user data
- `renderOpsDetail` uses `_setOpsDetailText` (sets `.textContent`) for all field values
**Result:** Zero innerHTML assignments with user-controlled data in ops functions.

### SEC-13 — Null mission (MEDIUM → FIXED)
**Risk:** `fetchOpsMission` returns null when RLS blocks (pre-BP09) or when no mission exists.  
**Fix:** `renderOpsDetail(sr, mission, site)` — if `mission` is falsy, the mission status badge is set to class `ops-mission-none` with text `'Aucune mission'`. No throw, no undefined access. The mission block is rendered in all cases.

### SEC-14 — Multiple missions (LOW → NOTED)
**Behavior:** A request may have multiple mission rows (e.g., one `offered` and one `pending`). Query uses `.order('created_at', { ascending: false }).limit(1)` — returns the most recently created mission.  
**Rationale:** The most recent mission represents the current operational state. Older missions may be superseded (e.g., reassignment). Showing the most recent is the correct behavior for operator visibility. `confirm_completed_mission` operates on the canonical SR status, not a specific mission row.

### SEC-15 — missions.request_id TEXT cast (CRITICAL → FIXED)
**Root cause:** `missions.request_id` is TEXT in production (not UUID). Legacy non-UUID values may exist. Any UUID→missions join must cast the UUID side: `String(srId)` in JS, `::text` in SQL.  
**Pre-existing bug (now fixed):** The old `loadDetailMission` used `.eq('service_request_id', requestId)` — wrong column name AND no string cast. Fixed in a prior session: now uses `.eq('request_id', String(requestId))` with correct column `artisan_profile_id`.  
**BP11 new code:** `fetchOpsMission` uses `.eq('request_id', String(srId))` throughout. The contract module documents this in GAP-3.  
**Never do:** `.eq('request_id', srId)` where `srId` is a UUID object, or any cast of `missions.request_id` to UUID in SQL.

---

## enterprise_members_rls_note

> The BP09 migration (`supabase/bp09-enterprise-rls-and-schema.sql`) adds enterprise member read policies to both `service_requests` (`enterprise_non_sm_requests_read`, `enterprise_sm_requests_read`) and `missions` (`enterprise_non_sm_missions_read`, `enterprise_sm_missions_read`).
>
> **Until BP09 is applied to production, enterprise members cannot read `service_requests` or `missions` directly.** The ops command center JS must treat mission data as optional (null-safe) throughout. The queue will return empty rows (not an error) for enterprise members on production until BP09 is applied. This is by design — the code is production-safe but inert until the migration runs.

---

## Code Changes Made by Agent 3

None — all CRITICAL/HIGH findings were pre-addressed by the BP11 JS implementation in this session. No additional patches required.
