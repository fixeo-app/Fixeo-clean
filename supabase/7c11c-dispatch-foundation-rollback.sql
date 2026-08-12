-- ============================================================
-- FIXEO — 7C.11C Dispatch Data Foundation
-- File: supabase/7c11c-dispatch-foundation-rollback.sql
-- Purpose: Roll back 7C.11C forward migration
--
-- ROLLBACK BOUNDARIES
-- ============================================================
--
-- BOUNDARY 1 — FOUNDATION ROLLBACK (safe window)
--   Condition: 7C.11D writers have NOT yet run.
--   All new columns (idempotency_key, client_phone, urgency,
--   accepted_at) are still NULL for every row.
--   No missions with status 'offered' exist.
--   Column DROPs are non-destructive.
--   USE: Section A below. Run all steps.
--
-- BOUNDARY 2 — INGESTION ROLLBACK
--   Condition: 7C.11D writers have run.
--   urgency and idempotency_key may be populated.
--   client_phone is still NULL (write deferred to post-11E).
--   Column DROPs for urgency/idempotency_key are DESTRUCTIVE.
--   USE: Section B below. Run guard SELECTs first.
--   Do not blindly DROP populated columns.
--
-- BOUNDARY 3 — RLS/DASHBOARD ROLLBACK
--   Condition: 7C.11E has shipped (client_phone writes enabled,
--   RLS was re-tightened, artisan dashboard migrated to RPCs).
--   client_phone may be populated.
--   USE: Section C (not automated — requires ops sign-off).
--   Export client_phone data first. Then proceed manually.
--
-- BOUNDARY 4 — DISPATCH ROLLBACK
--   Condition: 7C.11F has shipped and created missions.offered rows.
--   USE: Section D (not automated — requires ops sign-off).
--   Stop dispatch server. Expire/cancel offered missions.
--   Verify zero pending missions before proceeding.
--
-- INVARIANT: No rollback step silently deletes production
-- request, contact, or mission data.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — FOUNDATION ROLLBACK
-- Safe before any 7C.11D writer has run.
-- Run guard SELECTs before each column DROP as a final check.
-- ════════════════════════════════════════════════════════════

-- A-1: Drop RPCs (always safe — no data stored in functions)
DROP FUNCTION IF EXISTS public.get_accepted_mission_detail(uuid);
DROP FUNCTION IF EXISTS public.get_my_mission_offers();
DROP FUNCTION IF EXISTS public.claim_mission(uuid);


-- A-2: Restore artisan_read_own_linked_requests to pre-11C form
--      (any-status, owner_user_id OR phone_public fallback)
DROP POLICY IF EXISTS "artisan_read_new_requests"        ON public.service_requests;
DROP POLICY IF EXISTS "artisan_read_active_requests"     ON public.service_requests;
DROP POLICY IF EXISTS "artisan_read_own_linked_requests" ON public.service_requests;

CREATE POLICY "artisan_read_own_linked_requests"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    -- missions.request_id is TEXT; service_requests.id is UUID.
    -- Explicit cast to avoid operator does not exist: uuid = text.
    EXISTS (
      SELECT 1
      FROM   public.missions m
      WHERE  m.request_id = service_requests.id::text
        AND  m.artisan_profile_id IN (
          SELECT a.id
          FROM   public.artisans a
          WHERE  a.owner_user_id = auth.uid()
          OR     a.phone_public  = (
            SELECT p.phone
            FROM   public.profiles p
            WHERE  p.id = auth.uid()
            LIMIT  1
          )
        )
    )
  );


-- A-3: Drop missions partial unique indexes (always safe)
DROP INDEX IF EXISTS public.missions_one_pending_per_request;
DROP INDEX IF EXISTS public.missions_unique_artisan_per_request;
DROP INDEX IF EXISTS public.missions_one_offer_per_request;
DROP INDEX IF EXISTS public.service_requests_idempotency_key_unique;


-- A-4: Guard — missions.accepted_at (verify NULL before DROP)
SELECT COUNT(*) AS accepted_at_rows_written
FROM   public.missions WHERE accepted_at IS NOT NULL;
-- If 0: safe to proceed. If > 0: STOP — 7C.11F may have written data.

ALTER TABLE public.missions DROP COLUMN IF EXISTS accepted_at;


-- A-5: Guard — missions new status values
SELECT COUNT(*) AS new_status_rows
FROM   public.missions
WHERE  status IN ('offered','declined','expired');
-- If 0: safe to restore CHECK. If > 0: STOP — resolve rows first.

-- Restore missions status CHECK (original 4 values)
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_status_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_status_check
  CHECK (status IN ('pending','done','cancelled','validated'));


-- A-6: Guard — service_requests new status value
SELECT COUNT(*) AS no_match_rows
FROM   public.service_requests WHERE status = 'no_match';
-- If 0: safe. If > 0: STOP — resolve rows first.

-- Restore service_requests status CHECK (original 6 values)
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'new','assigned','in_progress','completed','validated','cancelled'
  ));


-- A-7: Drop urgency CHECK constraint
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_urgency_check;


-- A-8: Column DROPs — guard each before executing

-- Guard urgency:
SELECT COUNT(*) AS urgency_rows FROM public.service_requests WHERE urgency IS NOT NULL;
-- If 0: safe. If > 0: STOP.
ALTER TABLE public.service_requests DROP COLUMN IF EXISTS urgency;

-- Guard client_phone:
SELECT COUNT(*) AS phone_rows FROM public.service_requests WHERE client_phone IS NOT NULL;
-- If 0: safe. If > 0: STOP.
ALTER TABLE public.service_requests DROP COLUMN IF EXISTS client_phone;

-- Guard idempotency_key:
SELECT COUNT(*) AS idem_rows FROM public.service_requests WHERE idempotency_key IS NOT NULL;
-- If 0: safe. If > 0: STOP.
ALTER TABLE public.service_requests DROP COLUMN IF EXISTS idempotency_key;


-- ════════════════════════════════════════════════════════════
-- SECTION B — INGESTION ROLLBACK (after 7C.11D writers ran)
-- urgency and idempotency_key may be populated.
-- client_phone is still NULL (write deferred to post-11E).
-- DO NOT blindly DROP urgency or idempotency_key columns
-- without exporting their data first.
-- RPCs, indexes, RLS restore steps: run A-1 through A-3 above.
-- Then for column DROPs:
-- ════════════════════════════════════════════════════════════

-- B-1: Check what is populated
SELECT COUNT(*) AS urgency_rows    FROM public.service_requests WHERE urgency         IS NOT NULL;
SELECT COUNT(*) AS idem_rows       FROM public.service_requests WHERE idempotency_key IS NOT NULL;
SELECT COUNT(*) AS phone_rows      FROM public.service_requests WHERE client_phone    IS NOT NULL;
-- phone_rows expected: 0 (write not yet enabled in 7C.11D)
-- If phone_rows > 0: 7C.11E has shipped — use Section C path.
-- If urgency_rows or idem_rows > 0: export before DROP.

-- B-2: Export populated columns before DROP (run as separate query,
--      save results to a file or staging table before executing DROPs)
-- SELECT id, idempotency_key, urgency, created_at
-- FROM   public.service_requests
-- WHERE  idempotency_key IS NOT NULL OR urgency IS NOT NULL
-- ORDER  BY created_at DESC;

-- B-3: After exporting, proceed with DROP (consult ops first if row counts > 0)
-- See A-5 through A-8 guards above.


-- ════════════════════════════════════════════════════════════
-- SECTION C — RLS/DASHBOARD ROLLBACK (after 7C.11E shipped)
-- client_phone is populated.
-- NOT AUTOMATED. Requires ops sign-off.
-- Steps (human-executed):
--   1. Export client_phone data from service_requests.
--   2. Revert /api/create-request to not write client_phone.
--   3. Run A-1 (DROP RPCs).
--   4. Run A-2 (restore old RLS policy — re-enables phone reads
--      but client_phone column is separate from description;
--      description-based phone leak is the legacy pre-11D state).
--   5. Run A-3 (DROP indexes).
--   6. Guard-check all columns. Export as needed.
--   7. DROP columns only after verifying no active writers.
-- ════════════════════════════════════════════════════════════
-- (No automated SQL — human-only path after 7C.11E ships)


-- ════════════════════════════════════════════════════════════
-- SECTION D — DISPATCH ROLLBACK (after 7C.11F shipped)
-- missions.offered rows exist. client_phone is populated.
-- NOT AUTOMATED. Requires ops sign-off.
-- Steps:
--   1. Halt dispatch server (stop new missions.offered inserts).
--   2. For each open offered mission: UPDATE status='expired'.
--   3. Verify no pending missions exist from the new flow.
--   4. Proceed with Section C steps above.
--   5. Restore original missions status CHECK (A-5).
-- ════════════════════════════════════════════════════════════
-- (No automated SQL — human-only path after 7C.11F ships)
