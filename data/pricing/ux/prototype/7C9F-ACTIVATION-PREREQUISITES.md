# FIXEO Estimator — Activation Prerequisites
## Phase 7C.9F — Human Action Pack

**Status: CODE COMPLETE — HUMAN ENV ACTIONS REQUIRED**

This document contains the exact human actions required before Phase 7C.9G
(Preview Deployment & QA) can begin.

No code changes are needed. No files need to be edited.
All actions in this document are performed in external systems:
- Supabase SQL Editor (online)
- Vercel Dashboard (online)
- Terminal (Vercel CLI login)

---

## Prerequisites Status

| Item | Status | Owner |
|------|--------|-------|
| **A. Supabase migration** | ⚠️ PENDING HUMAN | Human → Supabase SQL Editor |
| **B. Vercel secret** | ⚠️ PENDING HUMAN | Human → Vercel Dashboard |
| **C. Vercel CLI login** | ⚠️ PENDING HUMAN | Human → Terminal |
| Code complete | ✅ DONE | Agent |
| Idempotency module | ✅ DONE | `api/fixeo-estimator-idempotency-v1.js` |
| Schema migration file | ✅ DONE | `supabase/estimator-context-redemptions-v1.sql` |
| All tests passing | ✅ DONE | 487/487 across all suites |

---

## ACTION A — Supabase Migration

### Why it's required
The idempotency module (`api/fixeo-estimator-idempotency-v1.js`) uses Supabase
to guarantee one-booking-per-pricing-context atomicity.
The table `estimator_context_redemptions` must exist before any estimator-backed
booking can be accepted. Without it, the API returns HTTP 503 (fail-closed) —
which is correct behavior but prevents booking completion.

### Where to execute
1. Open your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **+ New query**
4. Paste the SQL below
5. Click **Run** (or ⌘+Enter)

### What to execute

**Option 1 (recommended):** Copy the entire file content:

```
supabase/estimator-context-redemptions-v1.sql
```

The file is safe to run in full. Sections 1-7 create the table and security.
Section 8 contains verification queries and a test INSERT/DELETE cycle.

> **Important about Section 8:** The file includes a test INSERT (8-H) that
> inserts a row with `context_id = 'fxctx-00000000000000000000000000000000'`
> and then an intentional-failure INSERT (8-I) to verify the UNIQUE constraint.
> Both are followed by a DELETE (8-L) that removes the test row.
> If you only want the schema without the test cycle, run Sections 1–7 only.

**Option 2 (schema only — no tests):**

Copy and run the following SQL block:

```sql
-- ============================================================
-- FIXEO — estimator_context_redemptions
-- Phase 7C.9F — Idempotency table for estimator-backed bookings
-- Safe to re-run (all statements are IF NOT EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.estimator_context_redemptions (
  id                bigserial     PRIMARY KEY,
  context_id        text          NOT NULL,
  outcome_type      text          NOT NULL,
  service_code      text          NOT NULL,
  session_id        text          NOT NULL,
  amount_mad        integer       NOT NULL,
  state             text          NOT NULL DEFAULT 'acquired'
                                  CHECK (state IN ('acquired', 'committed', 'failed')),
  booking_ref       text,
  order_id          text,
  failure_reason    text          CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 500),
  acquired_at       timestamptz   NOT NULL DEFAULT now(),
  committed_at      timestamptz,
  failed_at         timestamptz
);

-- Atomic idempotency guarantee (drop+add = idempotent)
ALTER TABLE public.estimator_context_redemptions
  DROP CONSTRAINT IF EXISTS estimator_context_redemptions_context_id_unique;
ALTER TABLE public.estimator_context_redemptions
  ADD CONSTRAINT estimator_context_redemptions_context_id_unique
  UNIQUE (context_id);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_context_id
  ON public.estimator_context_redemptions (context_id);
CREATE INDEX IF NOT EXISTS idx_ecr_acquired_at
  ON public.estimator_context_redemptions (acquired_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecr_state
  ON public.estimator_context_redemptions (state);
CREATE INDEX IF NOT EXISTS idx_ecr_service_code
  ON public.estimator_context_redemptions (service_code);

-- RLS (defence-in-depth — service_role bypasses; anon/auth blocked)
ALTER TABLE public.estimator_context_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimator_context_redemptions FORCE ROW LEVEL SECURITY;

-- Revoke all anon access
REVOKE ALL ON public.estimator_context_redemptions FROM anon;
DROP POLICY IF EXISTS "ecr_anon_insert"  ON public.estimator_context_redemptions;
DROP POLICY IF EXISTS "ecr_anon_select"  ON public.estimator_context_redemptions;
DROP POLICY IF EXISTS "ecr_anon_update"  ON public.estimator_context_redemptions;
DROP POLICY IF EXISTS "ecr_anon_delete"  ON public.estimator_context_redemptions;
DROP POLICY IF EXISTS "ecr_auth_insert"  ON public.estimator_context_redemptions;
DROP POLICY IF EXISTS "ecr_auth_update"  ON public.estimator_context_redemptions;

-- Admin SELECT only (no write access for any authenticated user)
DROP POLICY IF EXISTS "ecr_admin_select" ON public.estimator_context_redemptions;
CREATE POLICY "ecr_admin_select"
  ON public.estimator_context_redemptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Grants: authenticated = SELECT only; service_role = unrestricted (implicit)
REVOKE ALL ON public.estimator_context_redemptions FROM anon;
GRANT SELECT ON public.estimator_context_redemptions TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.estimator_context_redemptions_id_seq TO authenticated;
```

---

### Verification queries — run AFTER the migration

Copy and run each query to confirm the migration was applied correctly:

#### VQ-1: Table exists and has all columns
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'estimator_context_redemptions'
ORDER BY ordinal_position;
```
**Expected:** 12 rows:
`id, context_id, outcome_type, service_code, session_id, amount_mad, state, booking_ref, order_id, failure_reason, acquired_at, committed_at, failed_at`

Wait — 13 rows with `failed_at`. Count: id(1) + context_id(2) + outcome_type(3) + service_code(4) + session_id(5) + amount_mad(6) + state(7) + booking_ref(8) + order_id(9) + failure_reason(10) + acquired_at(11) + committed_at(12) + failed_at(13) = **13 rows**.

#### VQ-2: RLS enabled and forced
```sql
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'estimator_context_redemptions';
```
**Expected:** `rls_enabled = true`, `rls_forced = true`

#### VQ-3: UNIQUE constraint exists
```sql
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.estimator_context_redemptions'::regclass
  AND contype  = 'u';
```
**Expected:** 1 row — `estimator_context_redemptions_context_id_unique | u | UNIQUE (context_id)`

#### VQ-4: Indexes (expected: 4 named + primary key)
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'estimator_context_redemptions'
ORDER BY indexname;
```
**Expected indexes:** `estimator_context_redemptions_pkey`, `idx_ecr_acquired_at`, `idx_ecr_context_id` (UNIQUE), `idx_ecr_service_code`, `idx_ecr_state`

#### VQ-5: anon has zero privileges
```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'estimator_context_redemptions'
  AND grantee    = 'anon';
```
**Expected:** zero rows

#### VQ-6: Policies (expected: exactly 1)
```sql
SELECT policyname, roles, cmd AS command
FROM pg_policies
WHERE tablename = 'estimator_context_redemptions'
ORDER BY policyname;
```
**Expected:** `ecr_admin_select | {authenticated} | SELECT`

#### VQ-7: Baseline empty
```sql
SELECT COUNT(*) AS baseline_row_count FROM public.estimator_context_redemptions;
```
**Expected:** `0`

---

## ACTION B — Vercel Secret

### Why it's required
`FIXEO_ESTIMATOR_SECRET` is the key used to:
- Seal encrypted pricing context tokens (`api/estimator-v1/fixeo-estimator-runtime-v1.js`)
- Unseal and verify them in `api/fixeo-booking-authority-v1.js`

Without this secret set in Vercel, any call to `/api/estimator-v1` returns
`HTTP 503 { error: 'config_error' }` (fail-closed behavior — this is correct).

### Security requirements
- Minimum 32 random bytes of entropy
- Never committed to the repository
- Never pasted in any code or config file
- Server-side only (Vercel environment variable)

### How to generate a secure value
Run this command in your local terminal:
```bash
node -e "console.log(require('crypto').randomBytes(40).toString('base64url'))"
```
This produces ~54 characters of URL-safe base64 from 40 random bytes.
Example output format (never use this exact value):
`Sx3k_example-only-NOT-REAL-lm9QwpV7rBzYnAoHdEFiJuCMKTXU`

### Where to set it

1. Go to your Vercel project dashboard
2. Click **Settings** (top navigation)
3. Click **Environment Variables** (left sidebar)
4. Click **+ Add New**
5. Set:
   - **Name:** `FIXEO_ESTIMATOR_SECRET`
   - **Value:** _(paste the generated value)_
   - **Environment:** Check **Preview** only (NOT Production — not yet)
   - **Git Branch:** Leave blank (applies to all preview branches)
6. Click **Save**

> **Do not check Production yet.** Production activation is Phase 7C.9G+
> and requires preview QA to pass first.

### Verify (after setting)
In your Vercel project → Settings → Environment Variables, confirm:
- `FIXEO_ESTIMATOR_SECRET` appears with Environment = `Preview`
- The value is masked (shown as `••••••••`)
- Production is NOT checked

---

## ACTION C — Vercel CLI Authentication

### Why it's required
Preview deployment (`vercel` command) requires an authenticated CLI session.

### Steps
In your terminal, in the `/home/work/fixeo-clean` directory:

```bash
vercel login
```

This opens a browser to complete Vercel OAuth authentication.
After completing:

```bash
vercel whoami
```

Should show your Vercel username/email.

Then to create the preview deployment:

```bash
cd /home/work/fixeo-clean
vercel
```

_(NOT `vercel --prod` — preview only)_

---

## After all three actions are complete

Notify the agent. The agent will then execute Phase 7C.9G:
1. Deploy a Vercel Preview (`vercel`)
2. Run API QA against the preview URL:
   - `POST /api/estimator-v1` with actions start/answer/evaluate
   - Verify pricing context token is issued
   - `POST /api/booking/cod` with estimator_context_token
   - Verify idempotency (repeat request → same bookingRef)
   - Verify BUNDLE-VERIFY (Supabase table reachable from Vercel fn)
3. Run UX QA with preview override flag
4. Close remaining blockers

---

## Summary: What the agent will verify in 7C.9G

| Verification | What it proves |
|---|---|
| `POST /api/estimator-v1 { action: 'start', ... }` | Bundled engine/orchestrator resolve correctly |
| `POST /api/estimator-v1 { action: 'evaluate' }` | AES-256-GCM token issued with context_id |
| `POST /api/booking/cod` first time | Authority resolves; idempotency consumes context_id in Supabase |
| `POST /api/booking/cod` second time | Returns same bookingRef (idempotent_retry: true) |
| `POST /api/booking/cod` with SAFETY_STOP token | Returns HTTP 422 |
| `POST /api/booking/cod` with no token | Legacy path unchanged |
| Browser flag OFF verification | No estimator modal appears anywhere on production pages |
| Browser preview override | `window._FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_ = true` activates estimator on preview |

---

*Generated by Phase 7C.9F — FIXEO Estimator Activation Prerequisites Closure*
*Commit: see Phase 7C.9F commit SHA in git log*
