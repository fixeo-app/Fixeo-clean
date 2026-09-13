# BP13 Security Audit — Enterprise Escalation Lifecycle

**Date:** 2026-09-13  
**Scope:** BP13 Enterprise Escalation Lifecycle — SQL schema + RPCs (`open_escalation`, `acknowledge_escalation`, `resolve_escalation`) + enterprise-dashboard-v1.js BP13 section  
**Out of scope:** BP09/BP10/BP12 files, pricing files, 7c15a4 (HOLD), production access  
**Agent:** Agent 3 (Security / Adversarial Audit)

---

## Context

BP13 introduces the `enterprise_escalations` table and three lifecycle RPCs.  
It is the escalation management layer for enterprise requests: operators open, acknowledge, and resolve escalations on service requests linked to their enterprise via `enterprise_request_context`.

**Confirmed architecture invariants (from task brief + code inspection):**
- Enterprise linkage is `enterprise_request_context` (ERC) exclusively — no `service_requests.enterprise_site_id` column
- `missions.request_id` is TEXT — UUID side must always be cast: `sr.id::text`
- Auth helpers: `fixeo_private._fixeo_is_enterprise_member()`, `_fixeo_is_enterprise_manager()`, `_fixeo_is_admin()`, `_fixeo_get_site_manager_site_ids()`
- SECURITY DEFINER pattern: `SET search_path = ''`, `REVOKE PUBLIC/anon`, `GRANT authenticated`
- Escalation states: `open`, `acknowledged`, `resolved`
- Severity: `critical`, `high`, `medium`, `low`
- Reason codes: `sla_breached`, `sla_approaching`, `urgent_unassigned`, `mission_stalled`, `manual`
- Partial unique index `ee_unique_active_escalation` prevents duplicate `(enterprise_id, request_id, reason_code)` WHERE `status IN ('open','acknowledged')`
- No reopen feature — new escalation must be opened after resolution
- Audit constraint `eal_action_type_check` currently has 8 values (from 7c15a9); BP13 must extend to 11

**Note:** The BP13 SQL migration and JS section have not yet been written by Agents 1/2 at the time of this audit. All findings are against the pending implementation. Each finding states what **must** be enforced.

---

## Findings Summary

| ID | Severity | Status | Category | Description |
|----|----------|--------|----------|-------------|
| SEC-01 | HIGH | MUST-FIX | Authorization | owner/admin/operations_manager — can open/ack/resolve |
| SEC-02 | HIGH | MUST-FIX | Authorization | site_manager — own assigned sites only |
| SEC-03 | MEDIUM | MUST-FIX | Authorization | reporter — blocked from open/ack/resolve |
| SEC-04 | MEDIUM | MUST-FIX | Authorization | viewer — blocked from open/ack/resolve |
| SEC-05 | HIGH | MUST-FIX | Authorization | inactive member — completely blocked |
| SEC-06 | HIGH | MUST-FIX | Authorization | non-member — completely blocked at RLS + RPC |
| SEC-07 | CRITICAL | MUST-FIX | Tenant Isolation | wrong-enterprise caller: `request_not_in_enterprise` guard in `open_escalation` |
| SEC-08 | HIGH | MUST-FIX | Tenant Isolation | cross-enterprise RLS SELECT scoping on `enterprise_escalations` |
| SEC-09 | HIGH | MUST-FIX | Tenant Isolation | cross-enterprise acknowledge blocked by RLS + enterprise_id re-check |
| SEC-10 | HIGH | MUST-FIX | Tenant Isolation | cross-enterprise resolve blocked by RLS + enterprise_id re-check |
| SEC-11 | HIGH | MUST-FIX | Canonical Linkage | `open_escalation` validates through ERC, not `service_requests.enterprise_site_id` |
| SEC-12 | MEDIUM | MUST-FIX | Canonical Linkage | no parallel lifecycle tables created |
| SEC-13 | MEDIUM | MUST-FIX | Canonical Linkage | `site_id` in escalation denormalized from ERC only |
| SEC-14 | MEDIUM | MUST-FIX | Concurrency | duplicate escalation race — `ee_unique_active_escalation` partial index |
| SEC-15 | MEDIUM | MUST-FIX | Concurrency | acknowledge race — `WHERE status = 'open'` predicate lock in UPDATE |
| SEC-16 | MEDIUM | MUST-FIX | Concurrency | resolve race — `WHERE status IN ('open','acknowledged')` predicate lock |
| SEC-17 | LOW | ADDRESSED | Concurrency | stale UI mutation — server returns error; client must handle gracefully |
| SEC-18 | MEDIUM | MUST-FIX | Concurrency | double-click guards: `S.escOpenSubmitting`, `S.escAckSubmitting`, `S.escResolveSubmitting` |
| SEC-19 | HIGH | MUST-FIX | Data Leakage | raw Postgres error to DOM blocked |
| SEC-20 | MEDIUM | MUST-FIX | Data Leakage | unauthorized request metadata filtered by RLS scoping |
| SEC-21 | LOW | INFO | Data Leakage | user UUID in opened_by/resolved_by acceptable if member |
| SEC-22 | MEDIUM | MUST-FIX | Data Leakage | site metadata for wrong-site site_manager blocked |
| SEC-23 | MEDIUM | MUST-FIX | XSS | `resolution_note` rendered via `textContent` only |
| SEC-24 | MEDIUM | MUST-FIX | XSS | `reason_code`/`severity` rendered via `textContent` or badge-class only |
| SEC-25 | MEDIUM | MUST-FIX | XSS | site/category/description in escalation context — `textContent` |
| SEC-26 | HIGH | MUST-FIX | Audit | `actor_user_id = auth.uid()` — server-set, not client-supplied |
| SEC-27 | HIGH | MUST-FIX | Audit | `enterprise_id` in audit row from server-side variable |
| SEC-28 | HIGH | MUST-FIX | Audit | `opened_at`/`acknowledged_at`/`resolved_at` — `now()` server-generated |
| SEC-29 | HIGH | MUST-FIX | Constraint | `ee_resolution_requires_note` CHECK enforced |
| SEC-30 | MEDIUM | MUST-FIX | Constraint | `ee_ack_timestamps_consistent` CHECK |
| SEC-31 | MEDIUM | MUST-FIX | Constraint | `ee_resolved_timestamps_consistent` CHECK |
| SEC-32 | HIGH | MUST-FIX | Constraint | `eal_action_type_check` extended to all 11 values |
| SEC-33 | LOW | ADDRESSED | RLS | `ee_members_select` RLS no infinite recursion risk |
| SEC-34 | LOW | ADDRESSED | RLS | `_fixeo_get_site_manager_site_ids` is SECURITY DEFINER — safe |

---

## Detailed Findings

### SEC-01 — owner/admin/operations_manager authorization (HIGH → MUST-FIX)

**Expected:** `owner`, `admin`, `operations_manager` can open, acknowledge, and resolve escalations on any request belonging to their enterprise.

**Required RPC guard (shared by all three lifecycle RPCs):**
```sql
SELECT em.role
INTO   v_caller_role
FROM   public.enterprise_members em
WHERE  em.enterprise_id = v_enterprise_id
  AND  em.user_id       = auth.uid()
  AND  em.status        = 'active';

IF NOT FOUND THEN
  RAISE EXCEPTION 'forbidden';
END IF;

IF v_caller_role NOT IN ('owner', 'admin', 'operations_manager', 'site_manager') THEN
  RAISE EXCEPTION 'forbidden';
END IF;
```

**Note:** `reporter` and `viewer` are excluded from mutation roles. `site_manager` is included but scoped per SEC-02. `_fixeo_is_enterprise_member()` is not sufficient for mutation authorization since it includes reporter/viewer — the RPC must check role explicitly.

**Status:** Must be implemented in all three RPCs (`open_escalation`, `acknowledge_escalation`, `resolve_escalation`).

---

### SEC-02 — site_manager scoping (HIGH → MUST-FIX)

**Risk:** A `site_manager` assigned only to site A should not be able to escalate on requests for site B, even within the same enterprise.

**Required additional guard in `open_escalation` for site_manager callers:**
```sql
IF v_caller_role = 'site_manager' THEN
  -- Validate caller is assigned to the request's site
  IF NOT EXISTS (
    SELECT 1
    FROM   public.enterprise_member_sites ems
    JOIN   public.enterprise_members em
             ON em.id = ems.member_id
    WHERE  em.user_id        = auth.uid()
      AND  em.enterprise_id  = v_enterprise_id
      AND  ems.site_id       = v_site_id    -- site_id from ERC
      AND  ems.enterprise_id = v_enterprise_id
  ) THEN
    RAISE EXCEPTION 'site_not_assigned';
  END IF;
END IF;
```

**Same guard** must apply in `acknowledge_escalation` and `resolve_escalation` — fetch the escalation's `site_id` and verify assignment.

**RLS layer:** The `ee_members_select` SELECT policy must scope site_manager reads to their assigned sites only (same pattern as BP09 `enterprise_sm_requests_read`):
```sql
-- Non-site_manager: see all enterprise escalations
-- site_manager: only escalations whose site_id is in their assigned sites
CREATE POLICY ee_sm_select ON public.enterprise_escalations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_members em
      JOIN public.enterprise_member_sites ems ON ems.member_id = em.id
      WHERE em.enterprise_id = enterprise_escalations.enterprise_id
        AND em.user_id       = auth.uid()
        AND em.status        = 'active'
        AND em.role          = 'site_manager'
        AND ems.site_id      = enterprise_escalations.site_id
    )
  );
```

**Status:** Must be implemented. site_manager isolation is the same pattern proven in BP09.

---

### SEC-03 — reporter blocked from mutation (MEDIUM → MUST-FIX)

**Risk:** A reporter calling `open_escalation`, `acknowledge_escalation`, or `resolve_escalation` must be blocked.

**Required:** The role check in all three RPCs (see SEC-01) must use `NOT IN ('owner', 'admin', 'operations_manager', 'site_manager')` as the rejection condition. Role `'reporter'` does not appear in this allowlist.

**JS layer (belt-and-suspenders):**
```js
const CAN_ESCALATE_ROLES = ['owner', 'admin', 'operations_manager', 'site_manager'];
function canEscalate(role) { return CAN_ESCALATE_ROLES.includes(role); }
```
Gate all three escalation action buttons with `canEscalate(S.userRole)` before calling RPCs. Server is the authoritative enforcement layer.

---

### SEC-04 — viewer blocked from mutation (MEDIUM → MUST-FIX)

**Same as SEC-03.** `viewer` is not in the mutation allowlist. The same role check and JS gate applies.

---

### SEC-05 — inactive member completely blocked (HIGH → MUST-FIX)

**Risk:** A member whose `status` has been set to `'suspended'` or `'removed'` must not be able to open/ack/resolve escalations.

**Required:** All three RPCs check `em.status = 'active'` in the membership lookup. If `NOT FOUND` (or status ≠ active), raise `'forbidden'`.

**RLS layer:** All SELECT/DML RLS policies must also filter `em.status = 'active'` in the EXISTS subquery. This is consistent with the established pattern across BP06/BP08/BP09/BP12.

**JWT window:** A suspended member retains a valid JWT for up to 1 hour (Supabase default). During that window their session is technically valid, but every query will be denied by RLS + RPC guard. No additional client mitigation is required — this behavior is by design.

---

### SEC-06 — non-member completely blocked (HIGH → MUST-FIX)

**Risk:** An authenticated Supabase user who is not a member of the enterprise must see zero escalation rows and receive a `'forbidden'` error from all mutation RPCs.

**Required (RLS — SELECT):** The `EXISTS` subquery in `ee_members_select` must join through `enterprise_members`. A user with no row in `enterprise_members` for this `enterprise_id` will find no matching rows and the policy evaluates to `false` — the row is invisible.

**Required (RPCs):** The membership lookup (`SELECT em.role … WHERE em.enterprise_id = v_enterprise_id AND em.user_id = auth.uid()`) returns `NOT FOUND` for non-members. All three RPCs must `RAISE EXCEPTION 'forbidden'` on `NOT FOUND`.

**Note:** `anon` role access is denied by a RESTRICTIVE deny policy:
```sql
CREATE POLICY ee_deny_anon ON public.enterprise_escalations
  AS RESTRICTIVE TO anon USING (false);
```

---

### SEC-07 — wrong-enterprise `request_not_in_enterprise` guard (CRITICAL → MUST-FIX)

**Risk:** A manager of enterprise A who knows a `service_request.id` belonging to enterprise B could call `open_escalation(request_id => B_request_uuid, enterprise_id => A_uuid)` and create an escalation row linked to enterprise A for a request that belongs to B. This breaks tenant isolation at data level.

**Required guard in `open_escalation` (AFTER role check, BEFORE INSERT):**
```sql
-- Validate request belongs to this enterprise via ERC (not service_requests.enterprise_site_id)
SELECT erc.enterprise_id, erc.site_id
INTO   v_erc_enterprise_id, v_site_id
FROM   public.enterprise_request_context erc
WHERE  erc.service_request_id = p_request_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'request_not_found';
END IF;

IF v_erc_enterprise_id <> p_enterprise_id THEN
  RAISE EXCEPTION 'request_not_in_enterprise';
END IF;
```

**This is the canonical "cross-enterprise request ownership" guard** used in `create_enterprise_request` (7c13a3). The same ERC lookup must be used here. Using `service_requests.enterprise_site_id` is incorrect and would fail because that column does not exist in the schema.

**Severity CRITICAL** because this guard is the primary tenant isolation check for the open_escalation path. Without it, a manager can create escalation data for any request in the system.

---

### SEC-08 — cross-enterprise RLS SELECT scoping (HIGH → MUST-FIX)

**Risk:** Without proper RLS, a member of enterprise A can query `enterprise_escalations` and see rows belonging to enterprise B.

**Required RLS (SELECT — non-site_manager):**
```sql
DROP POLICY IF EXISTS "ee_members_select" ON public.enterprise_escalations;
CREATE POLICY "ee_members_select"
  ON public.enterprise_escalations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enterprise_members em
      WHERE  em.enterprise_id = enterprise_escalations.enterprise_id
        AND  em.user_id       = auth.uid()
        AND  em.status        = 'active'
        AND  em.role IN ('owner','admin','operations_manager','reporter','viewer')
    )
  );
```

**Architecture proof:** `em.enterprise_id = enterprise_escalations.enterprise_id` scopes the check to the specific enterprise of each row. A member of enterprise A cannot satisfy this predicate for enterprise B's rows.

**No infinite recursion risk** (see SEC-33): `enterprise_members` is a separate table from `enterprise_escalations`. The EXISTS subquery on `enterprise_members` does not cause recursion in the policy on `enterprise_escalations`.

---

### SEC-09 — cross-enterprise acknowledge blocked (HIGH → MUST-FIX)

**Risk:** Caller of `acknowledge_escalation(p_escalation_id => X)` could try to acknowledge an escalation row belonging to a different enterprise.

**Required in `acknowledge_escalation` RPC:**
```sql
-- Fetch the escalation; verify enterprise membership
SELECT ee.enterprise_id, ee.status, ee.site_id
INTO   v_enterprise_id, v_current_status, v_site_id
FROM   public.enterprise_escalations ee
WHERE  ee.id = p_escalation_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'escalation_not_found';
END IF;

-- Re-check caller membership in the escalation's enterprise
SELECT em.role INTO v_caller_role
FROM   public.enterprise_members em
WHERE  em.enterprise_id = v_enterprise_id
  AND  em.user_id       = auth.uid()
  AND  em.status        = 'active';

IF NOT FOUND OR v_caller_role NOT IN ('owner', 'admin', 'operations_manager', 'site_manager') THEN
  RAISE EXCEPTION 'forbidden';
END IF;
```

**RLS layer provides defense-in-depth:** An `authenticated` user with no policy-matching row cannot even see the escalation row, so the `SELECT … INTO v_enterprise_id` above returns `NOT FOUND`.

---

### SEC-10 — cross-enterprise resolve blocked (HIGH → MUST-FIX)

**Same pattern as SEC-09.** `resolve_escalation` must fetch the escalation by `p_escalation_id`, check enterprise membership, and reject non-members / wrong-enterprise callers.

Additionally: if `p_resolution_note` is empty or NULL, the RPC must raise `'resolution_note_required'` — enforced server-side, not just by the CHECK constraint (CHECK alone only fires at the DML layer; raising a clean error in the RPC gives a better UX).

---

### SEC-11 — canonical linkage: `open_escalation` uses ERC only (HIGH → MUST-FIX)

**Risk:** If `open_escalation` validates the request–enterprise link by any path other than `enterprise_request_context`, it may silently fail or accept invalid data.

**Required:** The enterprise_id and site_id used in the escalation INSERT must be derived from the ERC row, not from the client-supplied `p_enterprise_id` alone, and definitely not from a non-existent `service_requests.enterprise_site_id` column.

**Correct pattern:**
```sql
SELECT erc.enterprise_id, erc.site_id
INTO   v_erc_enterprise_id, v_site_id
FROM   public.enterprise_request_context erc
WHERE  erc.service_request_id = p_request_id;
-- Then: INSERT ... VALUES (v_erc_enterprise_id, v_site_id, ...)
-- NOT: INSERT ... VALUES (p_enterprise_id, p_site_id, ...)
```

The `enterprise_id` in the INSERT must come from `erc.enterprise_id` (cross-checked with the client-supplied `p_enterprise_id`). The `site_id` must come from `erc.site_id` exclusively.

---

### SEC-12 — no parallel lifecycle tables (MEDIUM → MUST-FIX)

**Constraint:** BP13 must not create any new tables that duplicate the escalation lifecycle. Only `enterprise_escalations` and the new entries in `enterprise_audit_log` should be created.

**Verification:** The BP13 migration file should contain exactly:
1. `CREATE TABLE IF NOT EXISTS public.enterprise_escalations (…)`
2. `ALTER TABLE public.enterprise_audit_log DROP CONSTRAINT / ADD CONSTRAINT` to extend `eal_action_type_check`
3. The three RPC functions (`open_escalation`, `acknowledge_escalation`, `resolve_escalation`)
4. RLS policies on `enterprise_escalations`
5. No new lookup tables, no new enum types, no new triggers

Any deviation from this minimal surface constitutes scope creep and introduces new attack surface.

---

### SEC-13 — `site_id` denormalized from ERC (MEDIUM → MUST-FIX)

**Risk:** If the client supplies `p_site_id` and `open_escalation` trusts it, a caller could create an escalation row with an incorrect `site_id`, poisoning site-scoped queries.

**Required:** The `site_id` column in `enterprise_escalations` must be populated from `erc.site_id` (the authoritative ERC lookup), never from a client-supplied parameter. The RPC signature may accept `p_site_id` as a hint for display purposes, but the INSERT must use the server-derived value.

```sql
-- WRONG:
INSERT INTO enterprise_escalations (site_id) VALUES (p_site_id);

-- CORRECT:
SELECT erc.site_id INTO v_site_id FROM enterprise_request_context WHERE ...;
INSERT INTO enterprise_escalations (site_id) VALUES (v_site_id);
```

---

### SEC-14 — duplicate escalation race (MEDIUM → MUST-FIX)

**Risk:** Two concurrent `open_escalation` calls for the same `(enterprise_id, request_id, reason_code)` could create two active escalation rows, causing confusion in the ops queue.

**Required partial unique index:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS ee_unique_active_escalation
  ON public.enterprise_escalations (enterprise_id, request_id, reason_code)
  WHERE status IN ('open', 'acknowledged');
```

**Note:** `request_id` in `enterprise_escalations` is text (populated from `sr.id::text`). The unique index must match this type.

The `open_escalation` RPC should handle the `unique_violation` Postgres exception code (`23505`) and return a clean `'duplicate_active_escalation'` error rather than leaking the constraint name to the client.

```sql
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_active_escalation';
```

---

### SEC-15 — acknowledge race (MEDIUM → MUST-FIX)

**Risk:** Two concurrent `acknowledge_escalation` calls on the same escalation ID could both attempt to UPDATE.

**Required:** The UPDATE statement must include a predicate lock:
```sql
UPDATE public.enterprise_escalations
SET    status           = 'acknowledged',
       acknowledged_by  = auth.uid(),
       acknowledged_at  = now()
WHERE  id     = p_escalation_id
  AND  status = 'open';         -- predicate lock: only acts on 'open' rows

GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
IF v_rows_updated = 0 THEN
  RAISE EXCEPTION 'escalation_not_open';
END IF;
```

If `GET DIAGNOSTICS` returns 0 rows, the escalation was already acknowledged (or resolved) — return a clean error. The second concurrent caller gets `'escalation_not_open'` rather than silently succeeding.

---

### SEC-16 — resolve race (MEDIUM → MUST-FIX)

**Same pattern as SEC-15.** The UPDATE must filter `WHERE status IN ('open', 'acknowledged')` — resolution is valid from either open or acknowledged state.

```sql
UPDATE public.enterprise_escalations
SET    status           = 'resolved',
       resolved_by      = auth.uid(),
       resolved_at      = now(),
       resolution_note  = p_resolution_note
WHERE  id     = p_escalation_id
  AND  status IN ('open', 'acknowledged');    -- predicate lock

GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
IF v_rows_updated = 0 THEN
  RAISE EXCEPTION 'escalation_already_resolved';
END IF;
```

---

### SEC-17 — stale UI mutation (LOW → ADDRESSED)

**Behavior:** If the UI sends `acknowledge_escalation` on an escalation that was already resolved by another operator (concurrent session), the server returns an error (`'escalation_not_open'` or `'escalation_already_resolved'`). The client must handle this error gracefully.

**Required JS handling:**
```js
if (err._reason === 'escalation_not_open' || err._reason === 'escalation_already_resolved') {
  showEscalationMsg('Cette escalation a déjà été traitée. Rechargement de la liste…');
  await loadEscalationList();   // refresh to reflect current state
  return;
}
```

This is a UX concern, not a security concern. The server predicate lock (SEC-15/SEC-16) is the authoritative guard. The client refresh prevents stale display.

---

### SEC-18 — double-click guards (MEDIUM → MUST-FIX)

**Risk:** A user double-clicking "Escalader", "Prendre en charge", or "Résoudre" could fire two concurrent RPC calls before the button disables.

**Required state flags in `S`:**
```js
Object.assign(S, {
  escOpenSubmitting:    false,
  escAckSubmitting:     false,
  escResolveSubmitting: false,
});
```

**Pattern for each action:**
```js
async function openEscalation(params) {
  if (S.escOpenSubmitting) return;
  if (!canEscalate(S.userRole)) return;
  S.escOpenSubmitting = true;
  // disable button
  try {
    // ... RPC call ...
  } finally {
    S.escOpenSubmitting = false;
    // re-enable button
  }
}
```

**Server-side backstop:** The partial unique index `ee_unique_active_escalation` (SEC-14) ensures at most one active escalation per `(enterprise, request, reason_code)` even if two concurrent calls slip through. The predicate lock in acknowledge/resolve (SEC-15/SEC-16) ensures idempotency.

---

### SEC-19 — raw Postgres error to DOM (HIGH → MUST-FIX)

**Risk:** Supabase error objects may contain table names, constraint names (`ee_unique_active_escalation`), column names, or schema details. Rendering `error.message` directly to DOM leaks implementation details.

**Required:** All escalation error handlers must use `_safeMsg(err, 'Erreur lors de l\'opération.')` (the existing BP09 helper). The `_safeMsg` function already blocks messages matching `/PGRST|column|relation|violates|constraint|syntax|unexpected/i`.

**New reason codes** that must be added to `_REASON_MSG` in `enterprise-dashboard-v1.js`:
```js
escalation_not_found:         'Escalation introuvable.',
escalation_already_resolved:  'Cette escalation est déjà résolue.',
escalation_not_open:          'Cette escalation n\'est plus en état ouvert.',
duplicate_active_escalation:  'Une escalation active existe déjà pour cette demande.',
request_not_in_enterprise:    'Cette demande n\'appartient pas à ce compte.',
resolution_note_required:     'Une note de résolution est requise.',
```

**Note:** `request_not_found_or_not_owned` already exists in `_REASON_MSG` for the general case.

---

### SEC-20 — unauthorized request metadata in escalation list (MEDIUM → MUST-FIX)

**Risk:** The escalation list may JOIN to `service_requests` to show request title/category/description. If RLS on `service_requests` is not properly scoped, an escalation list query could return metadata for requests the user should not see.

**Required:** The escalation list query should JOIN through the escalation's `request_id` field, and the `service_requests` SELECT RLS must cover enterprise members (BP09 migrations cover this). Alternatively, the escalation table itself should denormalize only the minimum needed fields (category, urgency) at INSERT time, avoiding the JOIN entirely for the list view.

**Recommended:** Store `category`, `urgency`, and `site_id` as denormalized columns on `enterprise_escalations` (populated from ERC/service_request at open time, server-side). This eliminates the JOIN and the associated RLS surface.

---

### SEC-21 — user UUID leakage in opened_by/resolved_by (LOW → INFO)

**Assessment:** `opened_by` and `resolved_by` columns in `enterprise_escalations` store `auth.uid()` (user UUID). These UUIDs are visible to enterprise members reading the escalation list. This is acceptable: enterprise members can see that another member took an action; UUIDs within the same enterprise are not a secret identifier.

**Risk boundary:** UUIDs must not appear in error messages or be exposed to non-members. RLS ensures non-members cannot see any escalation rows. The in-band UUID disclosure to members is intentional and equivalent to showing "acknowledged by [member]".

**Status:** No fix required. This is INFO-level documented behavior.

---

### SEC-22 — site metadata leakage for wrong-site site_manager (MEDIUM → MUST-FIX)

**Risk:** If the RLS SELECT policy for `enterprise_escalations` does not properly scope `site_manager` to their assigned sites, a site_manager could read escalation rows (and the embedded site/category metadata) for sites they are not assigned to.

**Required (RLS — site_manager path):** The SELECT policy for `site_manager` must JOIN through `enterprise_member_sites`:
```sql
CREATE POLICY "ee_sm_select"
  ON public.enterprise_escalations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enterprise_members em
      JOIN   public.enterprise_member_sites ems ON ems.member_id = em.id
      WHERE  em.enterprise_id  = enterprise_escalations.enterprise_id
        AND  em.user_id        = auth.uid()
        AND  em.status         = 'active'
        AND  em.role           = 'site_manager'
        AND  ems.site_id       = enterprise_escalations.site_id
        AND  ems.enterprise_id = enterprise_escalations.enterprise_id
    )
  );
```

Site metadata (site name, site address) in the escalation context is protected by this scoping.

---

### SEC-23 — `resolution_note` XSS (MEDIUM → MUST-FIX)

**Risk:** `resolution_note` is a free-text field entered by the operator and stored in `enterprise_escalations`. If rendered via `innerHTML`, a note containing `<script>` or `"><img src=x onerror=alert(1)>` could execute in another operator's browser.

**Required:** The `resolution_note` field must be rendered exclusively with `textContent`:
```js
// WRONG:
noteEl.innerHTML = escalation.resolution_note;

// CORRECT:
noteEl.textContent = escalation.resolution_note || '';
```

If the design requires rich text (e.g., line breaks), use:
```js
noteEl.textContent = '';
(escalation.resolution_note || '').split('\n').forEach((line, i) => {
  if (i > 0) noteEl.appendChild(document.createElement('br'));
  noteEl.appendChild(document.createTextNode(line));
});
```

Never use `safeHtml()` on `resolution_note` unless the output is treated as text-only (the function escapes HTML entities — safe, but `textContent` is clearer for prose content).

---

### SEC-24 — `reason_code`/`severity` XSS (MEDIUM → MUST-FIX)

**Risk:** `reason_code` and `severity` are server-validated enum values, but if rendered into HTML via `innerHTML` or used as CSS class names without sanitization, they could be exploited if the validation is ever bypassed.

**Required:**
1. Never use `reason_code` or `severity` directly in `innerHTML` string concatenation.
2. For badge classes: build a whitelist mapping and use it — never interpolate raw values:
```js
var SEVERITY_CLASS = {
  critical: 'esc-severity-critical',
  high:     'esc-severity-high',
  medium:   'esc-severity-medium',
  low:      'esc-severity-low',
};
var REASON_LABEL = {
  sla_breached:      'SLA dépassé',
  sla_approaching:   'SLA imminent',
  urgent_unassigned: 'Urgent non assigné',
  mission_stalled:   'Mission en attente',
  manual:            'Manuel',
};
// Use SEVERITY_CLASS[severity] || 'esc-severity-unknown' for class names
// Use REASON_LABEL[reason_code] || safeHtml(reason_code) for text
```

Render text content via `textContent`, never `innerHTML`.

---

### SEC-25 — site/category/description XSS in escalation context (MEDIUM → MUST-FIX)

**Risk:** Site names, category names, and request descriptions are user-controlled strings rendered in the escalation detail view. They must not be rendered via raw `innerHTML`.

**Required:** All user-data fields rendered in escalation context blocks must use `textContent` or the existing `safeHtml()` wrapper (consistent with BP11/BP12 established pattern):

```js
// Any of these are acceptable:
el.textContent = siteName;                    // safest
el.innerHTML = safeHtml(siteName);            // acceptable
// This is NEVER acceptable:
el.innerHTML = '<span>' + siteName + '</span>';
```

---

### SEC-26 — `actor_user_id` server-set in audit (HIGH → MUST-FIX)

**Risk:** If the audit INSERT includes a client-supplied `actor_user_id`, a malicious caller could attribute their actions to a different user.

**Required:** In `open_escalation`, `acknowledge_escalation`, and `resolve_escalation`, the `_eal_append` call must use `auth.uid()` for `actor_user_id`:
```sql
PERFORM fixeo_private._eal_append(
  v_enterprise_id,   -- enterprise_id (server-derived from ERC)
  auth.uid(),        -- actor_user_id (server-set — NOT a client param)
  'escalation_opened',
  'service_request',
  p_request_id::uuid,
  jsonb_build_object(
    'escalation_id', v_escalation_id,
    'reason_code',   p_reason_code,
    'severity',      p_severity
  )
);
```

The `fixeo_private._eal_append` function is SECURITY DEFINER with `SET search_path = ''`. Its signature is `(enterprise_id uuid, actor_user_id uuid, action_type text, target_type text, target_id uuid, metadata jsonb)`. The caller must not be able to inject a different `actor_user_id`.

---

### SEC-27 — `enterprise_id` in audit row server-derived (HIGH → MUST-FIX)

**Risk:** If the audit row's `enterprise_id` comes from a client-supplied parameter rather than the server-derived ERC lookup, a caller can poison the audit log to attribute actions to a different enterprise.

**Required:** The `enterprise_id` passed to `_eal_append` must come from `v_enterprise_id` — the variable populated from the ERC lookup (SEC-07/SEC-11) — never directly from `p_enterprise_id`:
```sql
-- After ERC lookup:
-- v_enterprise_id := erc.enterprise_id  (server-derived)

PERFORM fixeo_private._eal_append(
  v_enterprise_id,   -- from ERC, not p_enterprise_id
  auth.uid(),
  'escalation_opened',
  ...
);
```

---

### SEC-28 — timestamps server-generated (HIGH → MUST-FIX)

**Risk:** If `opened_at`, `acknowledged_at`, or `resolved_at` are accepted from the client (as RPC parameters), a caller can backdate or postdate escalation timestamps, corrupting SLA metrics.

**Required:** All three timestamp columns must use `now()` in the SQL DML — never a client parameter:
```sql
-- In open_escalation INSERT:
INSERT INTO enterprise_escalations (opened_at, ...) VALUES (now(), ...);

-- In acknowledge_escalation UPDATE:
UPDATE enterprise_escalations SET acknowledged_at = now() WHERE ...;

-- In resolve_escalation UPDATE:
UPDATE enterprise_escalations SET resolved_at = now() WHERE ...;
```

None of the three RPC signatures should accept timestamp parameters. If the client passes a timestamp parameter, it must be silently ignored.

---

### SEC-29 — `ee_resolution_requires_note` CHECK constraint (HIGH → MUST-FIX)

**Risk:** If a resolution note is not required at the SQL level, an operator could resolve an escalation without explanation, losing accountability.

**Required CHECK constraint:**
```sql
CONSTRAINT ee_resolution_requires_note
  CHECK (
    status <> 'resolved'
    OR (resolution_note IS NOT NULL AND length(trim(resolution_note)) > 0)
  )
```

**This is a critical business constraint** (not just a UX validation). The `resolve_escalation` RPC should also pre-validate and raise `'resolution_note_required'` before attempting the UPDATE, for better error UX.

**Client-side validation (belt-and-suspenders):**
```js
if (!resolutionNote || resolutionNote.trim().length === 0) {
  showEscalationError('Une note de résolution est requise.');
  return;
}
```

---

### SEC-30 — `ee_ack_timestamps_consistent` CHECK (MEDIUM → MUST-FIX)

**Risk:** Inconsistent state where `acknowledged_by IS NULL AND acknowledged_at IS NOT NULL` (or vice versa) could corrupt SLA timing queries that JOIN on these fields.

**Required CHECK constraint:**
```sql
CONSTRAINT ee_ack_timestamps_consistent
  CHECK (
    (acknowledged_by IS NULL AND acknowledged_at IS NULL)
    OR
    (acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)
  )
```

This constraint is automatically satisfied by the `acknowledge_escalation` RPC since it sets both fields atomically in a single UPDATE. The constraint is a defensive backstop against direct table writes or bugs in future RPCs.

---

### SEC-31 — `ee_resolved_timestamps_consistent` CHECK (MEDIUM → MUST-FIX)

**Same as SEC-30** but for the resolve lifecycle:
```sql
CONSTRAINT ee_resolved_timestamps_consistent
  CHECK (
    (resolved_by IS NULL AND resolved_at IS NULL)
    OR
    (resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
```

---

### SEC-32 — `eal_action_type_check` extended to 11 values (HIGH → MUST-FIX)

**Risk:** If the audit constraint is not extended to include the 3 new BP13 action types, the `_eal_append` calls in the escalation RPCs will fail with a `check_violation` error (`23514`), causing the entire RPC transaction to roll back and leaving audit records unwritten.

**Current state (8 values — from 7c15a9):**
```sql
action_type IN (
  'member_role_changed',       -- 7c15a3
  'member_status_changed',     -- 7c15a3
  'site_updated',              -- 7c15a3
  'site_status_changed',       -- 7c15a3
  'account_profile_updated',   -- 7c15a3
  'invitation_created',        -- 7c15a9
  'invitation_revoked',        -- 7c15a9
  'invitation_accepted'        -- 7c15a9
)
```

**Required (11 values — BP13 extends):**
```sql
ALTER TABLE public.enterprise_audit_log
  DROP CONSTRAINT IF EXISTS eal_action_type_check;

ALTER TABLE public.enterprise_audit_log
  ADD CONSTRAINT eal_action_type_check CHECK (
    action_type IN (
      'member_role_changed',
      'member_status_changed',
      'site_updated',
      'site_status_changed',
      'account_profile_updated',
      'invitation_created',
      'invitation_revoked',
      'invitation_accepted',
      'escalation_opened',        -- BP13 new
      'escalation_acknowledged',  -- BP13 new
      'escalation_resolved'       -- BP13 new
    )
  );
```

**This ALTER must appear in the BP13 migration BEFORE any RPC that calls `_eal_append` with the new action types.**

**Verification:** The task spec confirms there are exactly 8 existing values and 3 new BP13 values = 11 total. The SQL above matches this.

---

### SEC-33 — RLS SELECT policy no infinite recursion risk (LOW → ADDRESSED)

**Verification:** The `ee_members_select` policy on `enterprise_escalations` uses an EXISTS subquery on `public.enterprise_members` — a different table. There is no self-referential subquery on `enterprise_escalations` itself. No infinite recursion risk.

**Comparison:** The pattern is identical to `esp_members_select` on `enterprise_sla_policies` (BP12) and `enterprise_non_sm_requests_read` on `service_requests` (BP09), both of which have proven safe.

**Status:** No fix required. Documented for completeness.

---

### SEC-34 — `_fixeo_get_site_manager_site_ids` is SECURITY DEFINER (LOW → ADDRESSED)

**Verification (from 7c15a6/7c15a8):** `fixeo_private._fixeo_get_site_manager_site_ids()` is a SECURITY DEFINER function with `SET search_path = ''`. It reads `enterprise_member_sites` with elevated privileges.

**Risk in RLS context:** A SECURITY DEFINER function called from an RLS policy bypasses the RLS of the tables it reads internally. For `_fixeo_get_site_manager_site_ids`, it reads `enterprise_member_sites` (no RLS concern — it's a control table) — this is correct behavior.

**No bypass issue:** The function only returns site IDs for the calling user (`auth.uid()`), not for all users. An RLS policy using `_fixeo_get_site_manager_site_ids()` does not grant access to other users' site assignments.

**Status:** No fix required. Documented for completeness.

---

## Implementation Requirements for BP13 (Agents 1 + 2)

### SQL (Agent 1) — Ordered list

1. **Extend `eal_action_type_check`** to 11 values FIRST (SEC-32) — otherwise RPC audit calls fail
2. **Create `enterprise_escalations` table** with:
   - `status` CHECK: `IN ('open', 'acknowledged', 'resolved')`
   - `severity` CHECK: `IN ('critical', 'high', 'medium', 'low')`
   - `reason_code` CHECK: `IN ('sla_breached', 'sla_approaching', 'urgent_unassigned', 'mission_stalled', 'manual')`
   - `request_id TEXT` (populated from `sr.id::text` — matches `missions.request_id` type contract)
   - `ee_resolution_requires_note` CHECK (SEC-29)
   - `ee_ack_timestamps_consistent` CHECK (SEC-30)
   - `ee_resolved_timestamps_consistent` CHECK (SEC-31)
   - `ee_unique_active_escalation` partial unique index WHERE `status IN ('open','acknowledged')` (SEC-14)
3. **RLS on `enterprise_escalations`:**
   - `ee_deny_anon` RESTRICTIVE (SEC-06)
   - `ee_members_select` for non-site_manager (SEC-08)
   - `ee_sm_select` for site_manager with site assignment scope (SEC-02, SEC-22)
   - `ee_admin_all` for `_fixeo_is_admin()` (SEC-01)
   - No direct INSERT/UPDATE/DELETE for `authenticated` — all mutations through SECURITY DEFINER RPCs
4. **`open_escalation` RPC** (SEC-01 through SEC-14, SEC-26, SEC-27, SEC-28):
   - ERC validation: verify `service_request_id = p_request_id` exists in ERC and `erc.enterprise_id = p_enterprise_id` (SEC-07, SEC-11)
   - Role check: `role IN ('owner','admin','operations_manager','site_manager')` (SEC-01)
   - site_manager scope check via `enterprise_member_sites` (SEC-02)
   - `site_id` from `erc.site_id`, not client param (SEC-13)
   - `opened_at = now()` (SEC-28)
   - Catch `unique_violation` → `raise exception 'duplicate_active_escalation'` (SEC-14)
   - `_eal_append(v_enterprise_id, auth.uid(), 'escalation_opened', ...)` (SEC-26, SEC-27)
5. **`acknowledge_escalation` RPC** (SEC-09, SEC-15, SEC-26, SEC-27, SEC-28):
   - Fetch escalation + enterprise membership re-check (SEC-09)
   - `WHERE status = 'open'` predicate (SEC-15)
   - `acknowledged_by = auth.uid(), acknowledged_at = now()` (SEC-26, SEC-28)
   - `_eal_append(v_enterprise_id, auth.uid(), 'escalation_acknowledged', ...)`
6. **`resolve_escalation` RPC** (SEC-10, SEC-16, SEC-26, SEC-27, SEC-28, SEC-29):
   - Fetch escalation + enterprise membership re-check (SEC-10)
   - Pre-validate `p_resolution_note IS NOT NULL AND length(trim(p_resolution_note)) > 0` (SEC-29)
   - `WHERE status IN ('open','acknowledged')` predicate (SEC-16)
   - `resolved_by = auth.uid(), resolved_at = now()` (SEC-26, SEC-28)
   - `_eal_append(v_enterprise_id, auth.uid(), 'escalation_resolved', ...)`
7. All three RPCs: `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE PUBLIC/anon`, `GRANT authenticated`

### JS (Agent 2)

1. State flags: `S.escOpenSubmitting`, `S.escAckSubmitting`, `S.escResolveSubmitting` (SEC-18)
2. Role gate: `canEscalate(role)` checking `['owner','admin','operations_manager','site_manager']` (SEC-01, SEC-03, SEC-04)
3. site_manager UI: hide/show escalation actions based on site assignment (belt-and-suspenders; server enforces) (SEC-02)
4. New `_REASON_MSG` entries for all 6 new reason codes (SEC-19)
5. All user-controlled fields via `textContent` / `safeHtml()`:
   - `resolution_note` → `textContent` (SEC-23)
   - `reason_code`/`severity` → whitelist mapping (SEC-24)
   - site name / category / description → `textContent` or `safeHtml()` (SEC-25)
6. Error handler: on `escalation_not_open` or `escalation_already_resolved`, refresh list (SEC-17)
7. Stale-response guard: `S.escDetailId` set before async, checked after each await (consistent with BP11 `S.opsDetailRequestId` pattern)
8. `_safeMsg()` used for ALL escalation error paths — no raw `error.message` to DOM (SEC-19)

---

## Code Changes Made by Agent 3

**No changes to existing SQL or JS files** — BP13 SQL and JS have not yet been written by Agents 1 and 2.

**New files written:**

1. `/home/work/fixeo-clean/docs/bp13-security-audit.md` — this document
2. `/home/work/fixeo-clean/js/enterprise-escalation-edge-cases-v1.js` — pure-JS edge-case validators (verified with `node --check`)

---

## SEC Finding Summary Table (for Agent Report)

| SEC-ID | Severity | Status | Category |
|--------|----------|--------|----------|
| SEC-01 | HIGH | MUST-FIX | Authorization |
| SEC-02 | HIGH | MUST-FIX | Authorization |
| SEC-03 | MEDIUM | MUST-FIX | Authorization |
| SEC-04 | MEDIUM | MUST-FIX | Authorization |
| SEC-05 | HIGH | MUST-FIX | Authorization |
| SEC-06 | HIGH | MUST-FIX | Authorization |
| SEC-07 | CRITICAL | MUST-FIX | Tenant Isolation |
| SEC-08 | HIGH | MUST-FIX | Tenant Isolation |
| SEC-09 | HIGH | MUST-FIX | Tenant Isolation |
| SEC-10 | HIGH | MUST-FIX | Tenant Isolation |
| SEC-11 | HIGH | MUST-FIX | Canonical Linkage |
| SEC-12 | MEDIUM | MUST-FIX | Canonical Linkage |
| SEC-13 | MEDIUM | MUST-FIX | Canonical Linkage |
| SEC-14 | MEDIUM | MUST-FIX | Concurrency |
| SEC-15 | MEDIUM | MUST-FIX | Concurrency |
| SEC-16 | MEDIUM | MUST-FIX | Concurrency |
| SEC-17 | LOW | ADDRESSED | Concurrency |
| SEC-18 | MEDIUM | MUST-FIX | Concurrency |
| SEC-19 | HIGH | MUST-FIX | Data Leakage |
| SEC-20 | MEDIUM | MUST-FIX | Data Leakage |
| SEC-21 | LOW | INFO | Data Leakage |
| SEC-22 | MEDIUM | MUST-FIX | Data Leakage |
| SEC-23 | MEDIUM | MUST-FIX | XSS |
| SEC-24 | MEDIUM | MUST-FIX | XSS |
| SEC-25 | MEDIUM | MUST-FIX | XSS |
| SEC-26 | HIGH | MUST-FIX | Audit |
| SEC-27 | HIGH | MUST-FIX | Audit |
| SEC-28 | HIGH | MUST-FIX | Audit |
| SEC-29 | HIGH | MUST-FIX | Constraint |
| SEC-30 | MEDIUM | MUST-FIX | Constraint |
| SEC-31 | MEDIUM | MUST-FIX | Constraint |
| SEC-32 | HIGH | MUST-FIX | Constraint |
| SEC-33 | LOW | ADDRESSED | RLS Safety |
| SEC-34 | LOW | ADDRESSED | RLS Safety |
