-- ============================================================
-- FIXEO — 7C.11C Dispatch Data Foundation
-- File: supabase/7c11c-dispatch-foundation.sql
-- HEAD at preparation: b42da16
--
-- PURPOSE
--   Additive schema foundation for the real dispatch system.
--   Zero application code changes. Zero dispatch activation.
--   No offered missions created. No client_phone populated.
--
-- SCOPE
--   1. service_requests: 3 new nullable columns, extended CHECKs
--   2. missions: accepted_at column, extended status CHECK
--   3. missions: 3 partial unique indexes
--   4. RLS: tighten artisan service_requests SELECT to
--      pending-missions-only via owner_user_id (no phone fallback)
--   5. 3 SECURITY DEFINER RPCs: claim_mission,
--      get_my_mission_offers, get_accepted_mission_detail
--
-- RLS TIGHTENING RATIONALE
--   The pre-migration audit (7C.11A/11B) confirmed:
--   - artisan_read_new_requests and artisan_read_active_requests
--     were already removed by rls-artisan-read-linked-requests.sql
--     (2026-06-10). Only artisan_read_own_linked_requests is live.
--   - The current artisan-dashboard-v2.js reads missions, not
--     service_requests, for dashboard display.
--   - There is no confirmed live JS path that reads service_requests
--     directly for the artisan dashboard session.
--   - The existing policy grants SELECT for ANY mission status
--     (including future offered rows) and includes a phone_public
--     fallback for artisan identity resolution — both unsafe once
--     client_phone is populated in 7C.11D.
--   Closing the broad surface NOW (before any client_phone write)
--   eliminates any exposure window. Post-acceptance reads remain
--   available via the pending-only direct path; pre-acceptance
--   reads use get_my_mission_offers() exclusively.
--
-- SECURITY DEFINER PLACEMENT
--   Pattern: SECURITY DEFINER functions in public schema.
--   Rationale: This is the established project convention —
--   sync_artisan_claim() uses the same pattern. Supabase's
--   caution about SECURITY DEFINER in exposed schemas is
--   addressed by: (a) SET search_path = '' on every function,
--   (b) REVOKE EXECUTE FROM PUBLIC and FROM anon, (c) full
--   schema-qualification of all object references in function
--   bodies, (d) no caller-supplied artisan identity accepted.
--   A private-schema wrapper would add objects without adding
--   security given the above controls are in place.
--
-- CLIENT_PHONE WRITE TIMING
--   Column added here (nullable). NOT populated until 7C.11D.
--   7C.11D writers start populating AFTER this migration AND
--   the RLS tightening in this file are deployed. The pending-
--   only artisan SR SELECT policy deployed here ensures that
--   when 7C.11D writes real phone numbers, no pre-acceptance
--   artisan can read them directly via PostgREST.
--
-- SAFETY
--   All steps are additive. Zero row mutations. No DELETEs.
--   ADD COLUMN IF NOT EXISTS and CREATE UNIQUE INDEX IF NOT EXISTS
--   are idempotent. CHECK constraint steps use DO blocks with
--   pg_constraint existence checks for idempotency.
--   Block 5c (pending winner index) is CONDITIONAL on PM-4
--   returning 0 rows — see comment there.
--
-- PRE-MIGRATION
--   Run 7c11c-dispatch-foundation-precheck.sql first.
--   All CRITICAL STOP conditions must be clear before proceeding.
--
-- POST-MIGRATION
--   Run 7c11c-dispatch-foundation-verify.sql.
--   All V-series checks must pass before marking 7C.11C done.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- BLOCK 1 — service_requests: new nullable columns
-- ════════════════════════════════════════════════════════════

-- 1a. Idempotency key
--     Namespaced by writer in 7C.11D: 'reservation:<uuid>'
--     NULL for all existing rows.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_idempotency_key_unique
  ON public.service_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 1b. Client phone — contact isolation column
--     Written ONLY by SERVICE_ROLE writers starting in 7C.11D,
--     which deploys AFTER this RLS tightening is live.
--     NULL for all existing rows until 7C.11D writers activate.
--     Never returned pre-acceptance (get_my_mission_offers excludes it).
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS client_phone TEXT;

-- 1c. Urgency — dedicated operational field (idempotent two-step)
--     Step A: column
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS urgency TEXT;

--     Step B: CHECK constraint (independently idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE  conrelid = 'public.service_requests'::regclass
      AND  contype  = 'c'
      AND  conname  = 'service_requests_urgency_check'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_urgency_check
      CHECK (urgency IN ('normale','urgent','now') OR urgency IS NULL);
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2 — service_requests: extend status CHECK
-- Adds 'no_match' (dispatch found no eligible artisan).
-- All 6 original values preserved.
-- Replace 'service_requests_status_check' below with the
-- exact conname from PM-6 if it differs.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE  conrelid = 'public.service_requests'::regclass
      AND  contype  = 'c'
      AND  conname  = 'service_requests_status_check'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_status_check
      CHECK (status IN (
        'new','assigned','in_progress','completed',
        'validated','cancelled','no_match'
      ));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3 — missions: accepted_at column
-- Set by claim_mission() at acceptance. NULL for all existing rows.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;


-- ════════════════════════════════════════════════════════════
-- BLOCK 4 — missions: extend status CHECK
-- Adds offered, declined, expired.
-- All 4 original values preserved.
-- Replace 'missions_status_check' below with the exact conname
-- from PM-7 if it differs.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE  conrelid = 'public.missions'::regclass
      AND  contype  = 'c'
      AND  conname  = 'missions_status_check'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_status_check
      CHECK (status IN (
        'offered','pending','declined','expired',
        'done','cancelled','validated'
      ));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 5 — missions: partial unique indexes
-- All three are conditional on corresponding PM checks.
-- Historical rows (declined/expired/done/cancelled/validated)
-- are outside every WHERE clause and coexist freely.
-- ════════════════════════════════════════════════════════════

-- 5a. Single active offered mission per request (V1 sequential dispatch)
--     V2 migration: DROP this index, add WHERE status='pending' variant.
--     Block 5c (pending winner) does NOT change for V2.
CREATE UNIQUE INDEX IF NOT EXISTS missions_one_offer_per_request
  ON public.missions (request_id)
  WHERE status = 'offered';

-- 5b. No duplicate active (offered or pending) row per artisan/request pair
--     Prevents dispatch retry inserting a second offered row for the same pair.
--     V2 SAFE: each artisan has a distinct artisan_profile_id value.
CREATE UNIQUE INDEX IF NOT EXISTS missions_unique_artisan_per_request
  ON public.missions (request_id, artisan_profile_id)
  WHERE status IN ('offered','pending');

-- 5c. Single pending winner per request — DB-level winner invariant
--     CONDITIONAL: only apply if PM-4 returned 0 rows.
--     claim_mission() serializes via service_requests UPDATE WHERE status='new',
--     but this index is the final safety net against admin/legacy path bypasses.
--     V1 + V2 SAFE: remains correct in multi-offer V2 (only one winner per request).
--     If PM-4 returned > 0 rows: comment out or skip this block and resolve
--     duplicate pending rows with ops before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS missions_one_pending_per_request
  ON public.missions (request_id)
  WHERE status = 'pending';


-- ════════════════════════════════════════════════════════════
-- BLOCK 6 — RLS: tighten artisan service_requests SELECT
-- Replaces the existing artisan_read_own_linked_requests policy.
--
-- OLD POLICY problems:
--   (a) grants SELECT for ANY mission status — once 7C.11F creates
--       offered rows, artisans could read SR before acceptance
--   (b) phone_public fallback for identity resolution is a
--       privilege escalation vector in an authorization-adjacent policy
--   (c) no status restriction means client_phone is readable once
--       7C.11D populates it (exposure window before 7C.11F)
--
-- NEW POLICY:
--   SELECT allowed only when the linked mission has status='pending'
--   (post-acceptance) and identity resolves via owner_user_id only.
--   Pre-acceptance reads go through get_my_mission_offers() RPC.
--
-- Policies dropped (both were already removed in 2026-06-10 migration;
-- DROP IF EXISTS is a no-op but listed for completeness):
--   artisan_read_new_requests
--   artisan_read_active_requests
--   artisan_read_own_linked_requests  ← this is the live policy replaced below
--
-- Client and admin policies on service_requests are NOT touched.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "artisan_read_new_requests"        ON public.service_requests;
DROP POLICY IF EXISTS "artisan_read_active_requests"     ON public.service_requests;
DROP POLICY IF EXISTS "artisan_read_own_linked_requests" ON public.service_requests;

CREATE POLICY "artisan_read_own_linked_requests"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    -- missions.request_id is TEXT; service_requests.id is UUID.
    -- Cast the UUID side to text for deterministic explicit equality.
    -- DO NOT cast missions.request_id to uuid (legacy non-UUID values may exist).
    EXISTS (
      SELECT 1
      FROM   public.missions m
      JOIN   public.artisans a ON a.id = m.artisan_profile_id
      WHERE  m.request_id    = service_requests.id::text
        AND  m.status        = 'pending'
        AND  a.owner_user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════
-- BLOCK 7 — RPC: public.claim_mission(p_mission_id uuid)
--
-- Model A: transitions existing missions.offered row → pending.
-- No INSERT. No new row created.
--
-- Artisan identity: auth.uid() → public.artisans.owner_user_id only.
-- No phone fallback. No caller-supplied artisan UUID.
--
-- TYPE CONTRACT:
--   missions.request_id is TEXT (live production schema).
--   service_requests.id is UUID.
--   v_request_id is declared TEXT to match missions.request_id.
--   The SR winner UPDATE uses sr.id::text = v_request_id
--   to perform the explicit cross-type comparison safely.
--   DO NOT cast v_request_id to uuid.
--
-- Deterministic business errors (ok:false JSON, no exception):
--   unauthenticated    — auth.uid() IS NULL
--   artisan_not_found  — no artisans row for auth.uid()
--   mission_not_found  — p_mission_id not in missions
--   already_claimed    — mission.status='pending' OR SR already assigned
--   not_offered        — mission.status not in (offered, pending)
--   not_offered_to_you — mission belongs to a different artisan
--
-- Hard error (PostgreSQL exception, rolls back all DML):
--   missions UPDATE affected 0 rows after SR UPDATE succeeded.
--   ERRCODE P0001. Treat as retriable at the API layer.
--
-- Success invariant:
--   service_requests.status = 'assigned'
--   missions.status         = 'pending'
--   missions.accepted_at    IS NOT NULL
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_mission(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;   -- TEXT: matches missions.request_id live type
  v_mission_status  text;
  v_mission_artisan uuid;
  v_locked_id       uuid;
  v_rows_updated    integer;
BEGIN

  -- Guard 0: authenticated caller required
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 1: resolve canonical artisan identity via owner_user_id only
  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  -- Guard 2: mission must exist
  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  -- Guard 3: mission must be in offered state
  IF v_mission_status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;
  IF v_mission_status != 'offered' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered');
  END IF;

  -- Guard 4: mission must belong to the authenticated artisan
  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered_to_you');
  END IF;

  -- Guard 5: atomic serialization — transition SR new → assigned
  -- WHERE status='new' is the first-accept-wins predicate.
  -- Only one concurrent caller can succeed this UPDATE.
  -- sr.id is UUID; v_request_id is TEXT — cast UUID side explicitly.
  UPDATE public.service_requests sr
  SET    status = 'assigned'
  WHERE  sr.id::text = v_request_id
    AND  sr.status   = 'new'
  RETURNING sr.id INTO v_locked_id;

  IF v_locked_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Model A: transition the existing offered row — no INSERT
  UPDATE public.missions m
  SET    status      = 'pending',
         accepted_at = now()
  WHERE  m.id     = p_mission_id
    AND  m.status = 'offered';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- All-or-nothing: if missions UPDATE affected 0 rows, raise exception.
  -- PostgreSQL rolls back the service_requests UPDATE above atomically.
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION
      'claim_mission: missions transition affected 0 rows — transaction rolled back (mission_id: %)',
      p_mission_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'mission_id', p_mission_id);

END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_mission(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 8 — RPC: public.get_my_mission_offers()
--
-- Pre-acceptance safe offer list. SECURITY DEFINER.
-- Strict field whitelist — description and client_phone EXCLUDED.
-- Legacy urgent rows with phone embedded in description are safe
-- because description is never returned by this function.
-- urgency from dedicated column only (NULL for legacy rows).
--
-- Subquery ORDER BY + LIMIT select the 50 newest requests first.
-- Outer jsonb_agg ORDER BY presents the selected rows in order.
-- Both ORDER BY clauses serve distinct purposes.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_mission_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id uuid;
  v_result     jsonb;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT jsonb_build_object(
    'ok',     true,
    'offers', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mission_id',         t.mission_id,
          'request_id',         t.request_id,
          'mission_status',     t.mission_status,
          'offered_at',         t.offered_at,
          'service_category',   t.service_category,
          'city',               t.city,
          'urgency',            t.urgency,
          'request_created_at', t.request_created_at
        )
        ORDER BY t.request_created_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM (
    -- Subquery selects the 50 newest requests; outer agg orders them.
    SELECT
      m.id                AS mission_id,
      m.request_id        AS request_id,
      m.status            AS mission_status,
      m.created_at        AS offered_at,
      sr.service_category AS service_category,
      sr.city             AS city,
      sr.urgency          AS urgency,
      sr.created_at       AS request_created_at
      -- description:  EXCLUDED — may contain phone in legacy rows
      -- client_phone: EXCLUDED — post-acceptance only
    FROM   public.missions         m
    JOIN   public.service_requests sr ON m.request_id = sr.id::text
    WHERE  m.artisan_profile_id = v_artisan_id
      AND  m.status IN ('offered','pending','done')
    ORDER BY sr.created_at DESC
    LIMIT  50
  ) t;

  RETURN v_result;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_mission_offers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_mission_offers() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_mission_offers() TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 9 — RPC: public.get_accepted_mission_detail(uuid)
--
-- Post-acceptance execution detail. SECURITY DEFINER.
-- Contact and description unlocked only after claim_mission()
-- transitions the mission to status='pending'.
-- Supersedes reveal_contact() — single RPC, smaller surface.
--
-- Guard: mission.status IN ('pending','done','validated').
-- All other statuses → not_accepted_yet.
--
-- client_phone: NULL until 7C.11D writers activate (expected).
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_accepted_mission_detail(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id     uuid;
  v_mission_status text;
  v_artisan_match  uuid;
  v_result         jsonb;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.status, m.artisan_profile_id
  INTO   v_mission_status, v_artisan_match
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_artisan_match != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  -- offered / declined / expired / cancelled → blocked
  IF v_mission_status NOT IN ('pending','done','validated') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted_yet');
  END IF;

  SELECT jsonb_build_object(
    'ok',               true,
    'mission_id',       m.id,
    'mission_status',   m.status,
    'accepted_at',      m.accepted_at,
    'agreed_price',     m.agreed_price,
    'service_category', sr.service_category,
    'city',             sr.city,
    'urgency',          sr.urgency,
    'description',      sr.description,
    'client_phone',     sr.client_phone
  )
  INTO v_result
  FROM   public.missions         m
  JOIN   public.service_requests sr ON m.request_id = sr.id::text
  WHERE  m.id = p_mission_id;

  RETURN v_result;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 10 — owner_user_id dispatch eligibility audit (read-only)
-- Record results for pre-7C.11F ops planning.
-- DO NOT repair here. DO NOT bulk UPDATE. Individual human
-- verification required per artisan before dispatch activation.
-- ════════════════════════════════════════════════════════════

SELECT
  a.id, a.name, a.city, a.service_category,
  a.availability, a.phone_public, a.owner_user_id
FROM   public.artisans a
WHERE  a.claimed              = true
  AND  a.onboarding_completed = true
  AND  a.availability         IN ('available','busy')
  AND  a.owner_user_id        IS NULL
ORDER  BY a.name;
-- 0 rows: all dispatch-eligible artisans have verified owner_user_id.
-- > 0 rows: record for ops. Dispatch activation (7C.11F) blocked
--   until each artisan is individually verified and repaired.
