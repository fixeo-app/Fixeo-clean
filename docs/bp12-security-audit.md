# BP12 Security Audit — Enterprise SLA Policies

**Date:** 2026-09-13  
**Scope:** BP12 Enterprise SLA Policies (SQL schema + upsert_sla_policy RPC + enterprise-dashboard-v1.js BP12 section)  
**Out of scope:** repo-wide audit, 7c15a4 (HOLD), pricing files, BP10, production access  
**Agent:** Agent 3 (Security / Edge Cases)

---

## Context

BP12 introduces `enterprise_sla_policies` — a tenant-scoped configuration table allowing enterprise owners and admins to define response-time SLAs per (enterprise, site, urgency) tuple. The SLA state (`on_track`, `approaching`, `breached`, `completed`, `not_applicable`) is derived server-side from `sr.created_at` + the best-matching policy interval and is never computed from the browser clock.

**Key architecture invariants confirmed from existing migrations:**
- Enterprise tenant isolation uses `enterprise_request_context.enterprise_id` (no `service_requests.enterprise_site_id` column exists)
- `missions.request_id` is TEXT in production — UUID side must always be cast: `sr.id::text`
- Auth helpers: `fixeo_private._fixeo_is_enterprise_member(p_enterprise_id)`, `_fixeo_is_enterprise_manager(p_enterprise_id)`, `_fixeo_is_admin()`
- SECURITY DEFINER pattern: `SET search_path = ''`, REVOKE PUBLIC/anon, GRANT authenticated
- `_fixeo_is_enterprise_manager` requires `role IN ('owner', 'admin')` — site_manager and operations_manager are **excluded** from this helper

**Note:** `supabase/bp12-enterprise-sla-policies.sql` has not yet been written (Agent 1 pending). This audit is written against the spec plus existing architecture. The JS section (Agent 2 pending) is also not yet in `enterprise-dashboard-v1.js`. Findings apply to the pending implementation and reflect what **must** be enforced.

---

## Findings Summary

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| SEC-01 | HIGH | MUST-FIX | Cross-tenant SLA policy read — RLS must scope SELECT to `_fixeo_is_enterprise_member` |
| SEC-02 | CRITICAL | MUST-FIX | Cross-tenant SLA policy write — upsert RPC must verify manager role in the target enterprise |
| SEC-03 | HIGH | MUST-FIX | site_manager scope — must be blocked from INSERT/UPDATE/DELETE on SLA policies |
| SEC-04 | MEDIUM | MUST-FIX | operations_manager scope — must be read-only; write must be blocked |
| SEC-05 | HIGH | MUST-FIX | Wrong-site override — site_id must be validated as belonging to p_enterprise_id in upsert RPC |
| SEC-06 | MEDIUM | NOTED | Inactive member access — RLS `em.status = 'active'` check via helper handles this |
| SEC-07 | HIGH | MUST-FIX | Reporter/viewer mutation — viewer/reporter must not call upsert_sla_policy |
| SEC-08 | MEDIUM | MUST-FIX | Negative/zero SLA values — CHECK constraint required; NULL bypass path documented |
| SEC-09 | MEDIUM | MUST-FIX | Duplicate policy race — partial unique index must exist on (enterprise_id, site_id, urgency) WHERE active |
| SEC-10 | MEDIUM | MUST-FIX | Stale policy — SLA view/RPC must filter `WHERE esp.active = true` |
| SEC-11 | MEDIUM | MUST-FIX | Missing timestamps — NULL `accepted_at`/`started_at`/`completed_at` must mark dimension unavailable, not default to epoch |
| SEC-12 | HIGH | MUST-FIX | Completed/validated status — SLA state must be `'completed'`, not `'breached'`, for resolved requests |
| SEC-13 | MEDIUM | MUST-FIX | Cancelled/no_match requests — SLA state must be `'not_applicable'` |
| SEC-14 | MEDIUM | NOTED | Multiple missions — most-recent-row pattern required (same as BP11 SEC-14) |
| SEC-15 | LOW | NOTED | Timezone correctness — deadlines computed in PostgreSQL UTC; browser displays in local timezone |
| SEC-16 | LOW | NOTED | Client-side clock dependence — browser clock used only for display labels, not for auth or breach determination |
| SEC-17 | HIGH | MUST-FIX | XSS in SLA policy form — site names and urgency values must use textContent, not innerHTML |
| SEC-18 | MEDIUM | MUST-FIX | Double-submit in upsertSLAPolicy — client-side `S.slaFormSubmitting` guard required |
| SEC-19 | MEDIUM | MUST-FIX | Integer overflow in SLA minutes — CHECK constraint must bound minutes to a safe maximum |
| SEC-20 | LOW | NOTED | SLA filter client-side authority — SLA state filter is display-only; server RLS enforces tenant scope |

---

## Detailed Findings

### SEC-01 — Cross-tenant SLA policy read (HIGH → MUST-FIX)
**Risk:** Without a tenant-scoped SELECT policy, an authenticated enterprise member of enterprise A could query `enterprise_sla_policies` and read rows belonging to enterprise B.

**Required RLS (SELECT):**
```sql
CREATE POLICY "esp_members_select"
  ON public.enterprise_sla_policies
  FOR SELECT
  TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));
```

**Architecture proof:** `_fixeo_is_enterprise_member(p_enterprise_id)` checks `em.enterprise_id = p_enterprise_id AND em.user_id = auth.uid() AND em.status = 'active'`. A member of enterprise A cannot satisfy this predicate for enterprise B's rows. Cross-tenant read is structurally blocked.

**Fix required:** The migration for BP12 must include this SELECT policy. Without it, every authenticated user can read every SLA policy.

---

### SEC-02 — Cross-tenant SLA policy write (CRITICAL → MUST-FIX)
**Risk:** An enterprise manager of enterprise A who supplies `p_enterprise_id = B_uuid` in a call to `upsert_sla_policy` could configure SLA policies for enterprise B.

**Required guard in `upsert_sla_policy` RPC:**
```sql
-- Guard: caller must be active manager (owner/admin) in the target enterprise
SELECT EXISTS (
  SELECT 1
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = p_enterprise_id
    AND  em.user_id       = auth.uid()
    AND  em.status        = 'active'
    AND  em.role          IN ('owner', 'admin')
) INTO v_authorized;
IF NOT v_authorized THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
END IF;
```

**Note:** Using `_fixeo_is_enterprise_manager(p_enterprise_id)` is acceptable if that helper checks the same role set. Verify the helper definition (from 7c13a1): it checks `role IN ('owner', 'admin')` — correct.

**The RPC must be SECURITY DEFINER** with `SET search_path = ''`. Direct `authenticated` INSERT/UPDATE/DELETE on `enterprise_sla_policies` must be revoked.

---

### SEC-03 — site_manager scope (HIGH → MUST-FIX)
**Risk:** A `site_manager` is a site-scoped operational role. Allowing them to configure enterprise-wide or even site-specific SLA policies violates the principle of least privilege. They may read SLA thresholds (needed to understand their KPIs) but must never write policies.

**Required block:** The `upsert_sla_policy` RPC must check that the caller's role is `IN ('owner', 'admin')` only. The existing `_fixeo_is_enterprise_manager` helper already enforces this (it requires `owner` or `admin`). The RPC must use this helper or the equivalent inline check.

**RLS layer:** No INSERT/UPDATE/DELETE policy for `authenticated` on `enterprise_sla_policies`. All writes through the SECURITY DEFINER RPC only — site_manager blocked at Guard 2 in the RPC.

---

### SEC-04 — operations_manager scope (MEDIUM → MUST-FIX)
**Risk:** `operations_manager` oversees operations but does not set enterprise-level configuration. Allowing them to configure SLA policies would violate the role hierarchy.

**Read:** Allowed — `_fixeo_is_enterprise_member` includes `operations_manager` in active member check.  
**Write:** Blocked — `_fixeo_is_enterprise_manager` requires `role IN ('owner', 'admin')` which excludes `operations_manager`.

**Fix:** The `upsert_sla_policy` RPC guard must call `_fixeo_is_enterprise_manager` (not `_fixeo_is_enterprise_member`) to enforce write restriction. Any JS UI for the SLA configuration section must also be hidden from `operations_manager` (belt-and-suspenders; server is authoritative).

---

### SEC-05 — Wrong-site override (HIGH → MUST-FIX)
**Risk:** A manager of enterprise A who knows a `site_id` belonging to enterprise B (e.g., guessed UUID) could pass that `site_id` to `upsert_sla_policy`, creating a policy row that references a site they don't own.

**Required guard in `upsert_sla_policy` RPC (when site_id is not NULL):**
```sql
-- Guard: site_id must belong to p_enterprise_id
IF p_site_id IS NOT NULL THEN
  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_sites es
    WHERE  es.id            = p_site_id
      AND  es.enterprise_id = p_enterprise_id
      AND  es.status        = 'active'
  ) INTO v_site_valid;
  IF NOT v_site_valid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;
END IF;
```

**This is the same guard pattern used in `create_enterprise_request` (7c13a3 Guard 7).** Site-enterprise mismatch is the most common tenant confusion vector in multi-tenant SaaS.

---

### SEC-06 — Inactive member access (MEDIUM → NOTED)
**Architecture:** All enterprise RLS policies rely on `_fixeo_is_enterprise_member(p_enterprise_id)` which checks `em.status = 'active'`. Suspended/removed members have their status set to `'suspended'` or `'removed'` in `enterprise_members` — the next query from their session will return empty/denied results.

**JWT window:** A session cookie remains valid until token expiry (Supabase default: 1 hour). During that window, the JWT is valid but all queries are RLS-denied. No additional client-side check required.

**Status:** No fix required. Handled by the helper's `status = 'active'` predicate.

---

### SEC-07 — Reporter/viewer mutation (HIGH → MUST-FIX)
**Risk:** A reporter or viewer calling `upsert_sla_policy` (directly via PostgREST or by manipulating the JS client) must be blocked server-side.

**Required:** The `upsert_sla_policy` RPC's authorization guard uses `_fixeo_is_enterprise_manager` (requires `owner` or `admin`). Reporter and viewer do not satisfy this.

**JS layer:** The SLA policy configuration UI must only render for `owner`/`admin` roles. Define a constant:
```js
const CAN_CONFIG_SLA_ROLES = ['owner', 'admin'];
function canConfigSLA(role) { return CAN_CONFIG_SLA_ROLES.includes(role); }
```
Gate the SLA policy form and upsert call:
```js
async function upsertSLAPolicy(formData) {
  if (S.slaFormSubmitting) return;          // double-submit guard
  if (!canConfigSLA(S.userRole)) return;    // role gate (belt-and-suspenders)
  // ...
}
```
Server RLS is the authoritative enforcement; client gate is defense-in-depth.

---

### SEC-08 — Negative/zero SLA values (MEDIUM → MUST-FIX)
**Risk:** A manager submitting `response_minutes = 0` or a negative value would create an SLA with an already-breached deadline for every request. `response_minutes = NULL` would silently skip the deadline calculation.

**Required CHECK constraint on `enterprise_sla_policies`:**
```sql
CONSTRAINT esp_response_minutes_positive
  CHECK (response_minutes > 0),

CONSTRAINT esp_response_minutes_not_null
  CHECK (response_minutes IS NOT NULL),
```

**NULL bypass:** If `response_minutes` is nullable and no NULL check exists, a row with `response_minutes IS NULL` would pass the `> 0` check (NULL comparisons return NULL, not FALSE, in SQL). The `IS NOT NULL` constraint must be a separate explicit constraint or the column must be declared `NOT NULL`.

**Recommended column definition:**
```sql
response_minutes integer NOT NULL,
CONSTRAINT esp_response_minutes_range CHECK (response_minutes BETWEEN 1 AND 10080)
```

See also SEC-19 for the upper bound.

---

### SEC-09 — Duplicate policy race (MEDIUM → MUST-FIX)
**Risk:** Two concurrent `upsert_sla_policy` calls for the same `(enterprise_id, site_id, urgency)` tuple could create two active rows, causing policy precedence ambiguity.

**Required partial unique index:**
```sql
CREATE UNIQUE INDEX idx_esp_active_tuple
  ON public.enterprise_sla_policies (enterprise_id, site_id, urgency)
  WHERE active = true;
```

For enterprise-default policies (no site, no urgency), `site_id IS NULL` and/or `urgency IS NULL`. PostgreSQL unique indexes do not enforce uniqueness across NULL values by default. A separate constraint or a sentinel value (e.g., `site_id = '00000000-0000-0000-0000-000000000000'`) may be needed, or use `COALESCE` in a unique expression index:

```sql
-- Covers NULL site and NULL urgency as distinct match dimensions
CREATE UNIQUE INDEX idx_esp_active_enterprise_default
  ON public.enterprise_sla_policies (enterprise_id)
  WHERE active = true AND site_id IS NULL AND urgency IS NULL;

CREATE UNIQUE INDEX idx_esp_active_site_only
  ON public.enterprise_sla_policies (enterprise_id, site_id)
  WHERE active = true AND site_id IS NOT NULL AND urgency IS NULL;

CREATE UNIQUE INDEX idx_esp_active_urgency_only
  ON public.enterprise_sla_policies (enterprise_id, urgency)
  WHERE active = true AND site_id IS NULL AND urgency IS NOT NULL;

CREATE UNIQUE INDEX idx_esp_active_site_urgency
  ON public.enterprise_sla_policies (enterprise_id, site_id, urgency)
  WHERE active = true AND site_id IS NOT NULL AND urgency IS NOT NULL;
```

The `upsert_sla_policy` RPC should use an `INSERT ... ON CONFLICT DO UPDATE` (upsert) strategy targeting each of these constraints rather than a SELECT-then-INSERT pattern.

---

### SEC-10 — Stale policy (MEDIUM → MUST-FIX)
**Risk:** When a policy is deactivated (set `active = false`), any SLA view or RPC that does not filter `WHERE active = true` will still pick up the stale row.

**Required in all SLA computation paths:**
```sql
-- In view get_enterprise_sla_status or RPC compute_sla_state:
SELECT esp.*
FROM   public.enterprise_sla_policies esp
WHERE  esp.enterprise_id = <eid>
  AND  esp.active        = true  -- MUST filter; stale rows are invisible
ORDER BY
  (esp.site_id    IS NOT NULL)::int DESC,  -- site+urgency > site-only > urgency-only > default
  (esp.urgency    IS NOT NULL)::int DESC
LIMIT 1;
```

The policy precedence order (most-specific-wins: site+urgency > site-only > urgency-only > enterprise-default) must be encoded in the ORDER BY or CASE expression, not resolved in JavaScript.

---

### SEC-11 — Missing timestamps (MEDIUM → MUST-FIX)
**Risk:** `missions.accepted_at`, `started_at`, `completed_at` may be NULL. SLA dimensions that depend on these timestamps (e.g., "time to start") must not default to `epoch` or `now()` when NULL — they must mark the dimension as unavailable.

**Required in SQL SLA computation:**
```sql
-- For "time to accept" dimension:
CASE
  WHEN m.accepted_at IS NULL THEN 'unavailable'   -- artisan not yet accepted
  WHEN now() > m.accepted_at + esp.response_minutes * interval '1 minute'
                              THEN 'breached'
  WHEN now() > m.accepted_at + esp.response_minutes * 0.8 * interval '1 minute'
                              THEN 'approaching'
  ELSE 'on_track'
END

-- sr.created_at is confirmed NOT NULL — safe to use as base for response deadline
```

**Required in JS `deriveSLAStateLocal` test helper:** Return `'not_applicable'` when the row lacks a required timestamp rather than calculating a spurious state.

---

### SEC-12 — Completed/validated requests (HIGH → MUST-FIX)
**Risk:** A request with `status = 'validated'` or `status = 'completed'` that was resolved after its SLA deadline would show as `'breached'` rather than `'completed'` if the terminal status check is absent.

**Required gate in SLA state computation (must be first):**
```sql
-- Terminal status check BEFORE any deadline comparison
CASE
  WHEN sr.status IN ('validated', 'completed') THEN 'completed'
  WHEN sr.status IN ('cancelled', 'no_match')  THEN 'not_applicable'
  WHEN <deadline logic> ...
```

**Rationale:** A resolved request that happened to exceed its response deadline is historically a breach, but the operational SLA state to display is `'completed'` — the work is done. Displaying `'breached'` for resolved requests misleads operators and inflates breach metrics.

---

### SEC-13 — Cancelled/no_match requests (MEDIUM → MUST-FIX)
**Risk:** Requests with `status = 'cancelled'` or `status = 'no_match'` have no valid SLA outcome. Computing a deadline-based state for them is misleading.

**Required:** Map these statuses to `'not_applicable'` (same gate as SEC-12 above). The `isSLATerminalStatus` helper in `enterprise-sla-edge-cases-v1.js` documents this.

---

### SEC-14 — Multiple missions (MEDIUM → NOTED)
**Behavior:** A request may have multiple mission rows. The most-recent mission row (by `created_at DESC LIMIT 1`) must be used for SLA timestamp derivation — identical to the pattern established in BP11 SEC-14.

**Required in SQL:**
```sql
LEFT JOIN LATERAL (
  SELECT m.accepted_at, m.started_at, m.completed_at
  FROM   public.missions m
  WHERE  m.request_id = sr.id::text   -- UUID cast, not missions.request_id cast
  ORDER BY m.created_at DESC
  LIMIT  1
) m ON true
```

**Status:** No new issue; pattern inherited from BP11. Document in migration.

---

### SEC-15 — Timezone correctness (LOW → NOTED)
**Architecture:** All SLA deadlines are computed as `sr.created_at + response_minutes * interval '1 minute'` in PostgreSQL. Both `sr.created_at` and `now()` are UTC timestamptz. No timezone ambiguity exists at the computation layer.

**Browser layer:** The JavaScript `formatSLARemainingTest` and `formatSLARemaining` helpers only format for display (human-readable countdown). The browser's local timezone affects display labels only, not breach determination. No authority issue.

---

### SEC-16 — Client-side clock dependence (LOW → NOTED)
**Architecture:** The client receives `sla_state` (enum string) and `sla_response_deadline` (ISO 8601 UTC timestamp) from the server. The browser uses `Date.now()` only to compute display labels (e.g., "47 minutes restants") for the countdown. Breach determination is performed server-side; the client never makes authorization or access-control decisions based on clock values.

**Risk:** If the server `sla_state` is stale (cached), the client might display incorrect countdown labels. This is a UX issue, not a security issue — RLS enforcement is on the server.

**Mitigation already in place:** `S.activeEnterprise` guard fires before any load; stale responses are discarded via `S.opsDetailRequestId` check pattern (from BP11). The SLA state polling should use the same anti-stale-response pattern.

---

### SEC-17 — XSS in SLA policy form (HIGH → MUST-FIX)
**Risk:** The SLA policy list renders site names (from `enterprise_sites.name`, user-controlled) and urgency labels. If rendered via `innerHTML` without sanitization, a site name containing `<script>` or `" onload="evil()` could execute in the manager's browser.

**Required:** All user-controlled data in the SLA policy list and form must use `textContent` or the existing `safeHtml()` wrapper when concatenating HTML:

```js
// WRONG:
policyRow.innerHTML = '<td>' + siteName + '</td>';

// CORRECT:
const td = document.createElement('td');
td.textContent = siteName;
policyRow.appendChild(td);

// OR with innerHTML (acceptable — safeHtml encodes all HTML special chars):
policyRow.innerHTML = '<td>' + safeHtml(siteName) + '</td>';
```

**Verified pattern from existing code:** The existing `safeHtml()` function at line 143 of `enterprise-dashboard-v1.js` correctly HTML-encodes `&`, `<`, `>`, `"`. Its use is consistent throughout the existing BP11 section. The BP12 section must follow this pattern.

---

### SEC-18 — Double-submit in upsertSLAPolicy (MEDIUM → MUST-FIX)
**Risk:** A user double-clicking "Enregistrer la politique SLA" could fire two concurrent `upsert_sla_policy` RPC calls. Without a client-side guard, the second call races the first.

**Required client-side guard:**
```js
async function upsertSLAPolicy(formData) {
  if (S.slaFormSubmitting) return;       // guard
  if (!canConfigSLA(S.userRole)) return; // role gate
  S.slaFormSubmitting = true;
  // ... disable submit button ...
  try {
    // ... RPC call ...
  } finally {
    S.slaFormSubmitting = false;
    // ... re-enable button ...
  }
}
```

**Server-side backstop:** The partial unique index from SEC-09 provides the definitive conflict guard. The client guard is defense-in-depth UX.

---

### SEC-19 — Integer overflow in SLA minutes (MEDIUM → MUST-FIX)
**Risk:** Without an upper bound, a manager could enter `response_minutes = 2147483647` (INT max), producing SLA deadlines centuries in the future. Every request would show `'on_track'` permanently, defeating the purpose of SLA monitoring.

**Required CHECK constraint:**
```sql
CONSTRAINT esp_response_minutes_range
  CHECK (response_minutes BETWEEN 1 AND 10080)
  -- 10080 = 7 days × 24 hours × 60 minutes
  -- Covers the realistic max SLA for enterprise facility management
  -- Adjust upper bound if business requirements exceed 7 days
```

**Client-side validation (defense-in-depth):**
```js
function validateSLAMinutes(val) {
  const n = Number(val);
  if (!Number.isInteger(n))  return { valid: false, reason: 'Doit être un entier' };
  if (n <= 0)               return { valid: false, reason: 'Doit être supérieur à 0' };
  if (n > 10080)            return { valid: false, reason: 'Maximum 10080 minutes (7 jours)' };
  return { valid: true, reason: '' };
}
```

---

### SEC-20 — SLA filter client-side authority (LOW → NOTED)
**Architecture:** The SLA state filter in the enterprise dashboard (e.g., "Afficher uniquement les SLA en dépassement") is a client-side display filter applied to rows already returned by the server. It does not affect what rows the server returns — RLS enforces tenant scope on every query.

**Risk:** A user manipulating client-side JavaScript to bypass the filter would only see their already-authorized data. No new data is revealed; filter manipulation only affects display grouping.

**Status:** No fix required. Client-side filters are a UX convenience, not a security boundary.

---

## Code Changes Made by Agent 3

No changes to existing SQL migration files or `enterprise-dashboard-v1.js` — BP12 SQL and JS have not yet been written by Agents 1 and 2.

**New file written:** `/home/work/fixeo-clean/js/enterprise-sla-edge-cases-v1.js`  
— Pure-JS edge-case validators for the test suite (no DOM, no Supabase dependencies).  
— Verified with `node --check`.

---

## Implementation Requirements for BP12 (Agents 1 + 2)

### SQL (Agent 1)
1. `enterprise_sla_policies` table: `response_minutes NOT NULL CHECK (BETWEEN 1 AND 10080)` — SEC-08, SEC-19
2. SELECT RLS via `_fixeo_is_enterprise_member` — SEC-01
3. No direct INSERT/UPDATE/DELETE for `authenticated` — SEC-02, SEC-03, SEC-04
4. Four partial unique indexes for NULL-safe policy uniqueness — SEC-09
5. `upsert_sla_policy` RPC: Guard uses `_fixeo_is_enterprise_manager` (owner/admin only) — SEC-02, SEC-03, SEC-04, SEC-07
6. `upsert_sla_policy` RPC: Site-enterprise validation guard — SEC-05
7. SLA state derivation: terminal status check FIRST (`validated`/`completed` → `'completed'`, `cancelled`/`no_match` → `'not_applicable'`) — SEC-12, SEC-13
8. SLA state derivation: NULL timestamp guard (unavailable dimension) — SEC-11
9. SLA state derivation: `WHERE esp.active = true` filter — SEC-10
10. Most-recent mission via LATERAL JOIN with `ORDER BY created_at DESC LIMIT 1` — SEC-14

### JS (Agent 2)
1. `canConfigSLA(role)` gate before any SLA policy mutation — SEC-03, SEC-04, SEC-07
2. `S.slaFormSubmitting` double-submit guard — SEC-18
3. All user data via `safeHtml()` or `textContent`, never raw `innerHTML` — SEC-17
4. `validateSLAMinutes()` client-side validation — SEC-19
5. Error messages via `_safeMsg()` — never raw `error.message` to DOM — (inherited from BP11 SEC-11)
6. SLA state filter is display-only; never used for access control decisions — SEC-20
7. Browser clock (`Date.now()`) used only for countdown display labels, never for breach determination — SEC-16
