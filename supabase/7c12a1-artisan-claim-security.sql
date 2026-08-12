-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Foundation (Final Hardened)
-- supabase/7c12a1-artisan-claim-security.sql
--
-- FORENSIC DECISION: sync_artisan_claim() trigger DROPPED
-- ─────────────────────────────────────────────────────────
-- The existing trigger (claim_approval_sync on claim_requests,
-- AFTER UPDATE, executing sync_artisan_claim()) has three defects:
--
--   DEFECT 1 (CRITICAL):
--     onboarding_completed = (NEW.onboarding_data IS NOT NULL AND onboarding_data <> '{}')
--     Any non-empty onboarding_data JSONB marks artisan as dispatch-eligible.
--     CONTRACT VIOLATION: claim approval ≠ onboarding complete ≠ dispatch eligible.
--
--   DEFECT 2 (HIGH):
--     verified = TRUE set automatically at claim approval — premature.
--
--   DEFECT 3 (DOUBLE-WRITE):
--     approve_artisan_claim() RPC now owns the atomic approval path.
--     The trigger firing on the same UPDATE creates a race/double-write.
--
-- RETENTION ANALYSIS:
--   The trigger's only legitimate work (rejected branch → artisan claim_status reset)
--   is absorbed into reject_artisan_claim() RPC.
--
-- RESULT: DROP claim_approval_sync trigger + sync_artisan_claim() function.
--   approve_artisan_claim() = SINGLE server-authoritative ownership path.
--   reject_artisan_claim() = SINGLE server-authoritative rejection path.
--
-- ─────────────────────────────────────────────────────────
-- CONCURRENCY MODEL (7C.12A.1 hardened):
--
--   1. CLAIM ROW LOCK: SELECT claim_requests FOR UPDATE — serializes concurrent
--      approval attempts on the same claim row.
--
--   2. ARTISAN ROW LOCK: After resolving v_artisan_id, SELECT artisans FOR UPDATE
--      — serializes concurrent approvals on the same artisan, even from different
--      claim rows. This prevents the race where Tx A and Tx B both read
--      owner_user_id=NULL before either commits.
--
--   3. CONDITIONAL UPDATE: UPDATE artisans WHERE owner_user_id IS NULL — even if
--      FOR UPDATE fails to block (e.g., advisory vs row-level semantics), the
--      WHERE clause is a final defensive guard. ROW_COUNT checked post-UPDATE.
--
--   4. MULTI-CLAIM FIRST-WINS: After successful approval, all OTHER pending claims
--      for the same artisan are auto-rejected (status='superseded_by_approval').
--      Prevents future approval of competing claims.
--
-- ─────────────────────────────────────────────────────────
-- CANONICAL APPROVAL OUTCOME:
--   artisans.owner_user_id        = requester_user_id  (from claim row)
--   artisans.claimed              = true
--   artisans.claim_status         = 'approved'
--   artisans.updated_at           = now()
--   artisans.onboarding_completed → UNCHANGED (NOT set by approval)
--   artisans.availability         → UNCHANGED (NOT set by approval)
--   artisans.verified             → UNCHANGED (NOT set by approval)
--   claim_requests.status         = 'approved'
--   claim_requests.reviewed_at    = now()
--   competing pending claims       → status='superseded_by_approval'
--   users.role                    = 'artisan'  (if not admin)
--   profiles.role                 = 'artisan'  (if not admin)
--
-- DISPATCH ELIGIBILITY (unchanged from 7C.11F.1C contract):
--   owner_user_id IS NOT NULL
--   AND claim_status = 'approved'
--   AND onboarding_completed = true    ← only set by future 7C.12A.3 RPC
--   AND availability = 'available'     ← only set by artisan post-onboarding
--   Claim approval alone NEVER makes an artisan dispatch-eligible.
--
-- ─────────────────────────────────────────────────────────
-- RLS TARGET STATE (all known historical policy names dropped):
--   anon:          NO INSERT, NO UPDATE, NO SELECT (deny_anon explicit)
--   authenticated: INSERT with requester_user_id=auth.uid() only
--                  SELECT own claims + admin-read-all
--                  NO direct UPDATE/DELETE (RPC-only path)
--   admin:         Full access via RPC + admin_read_all SELECT
--                  Direct UPDATE/DELETE browser path REMOVED
--
-- ─────────────────────────────────────────────────────────
-- TRANSACTION ATOMICITY: wrapped in BEGIN/COMMIT.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- STEP 0: Ensure reviewed_at column exists on claim_requests
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='claim_requests' AND column_name='reviewed_at'
  ) THEN
    ALTER TABLE public.claim_requests ADD COLUMN reviewed_at timestamptz;
    RAISE NOTICE 'Step 0: reviewed_at column added to claim_requests';
  ELSE
    RAISE NOTICE 'Step 0: reviewed_at already exists — no change';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- STEP 1: DROP defective trigger and trigger function
-- ════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS claim_approval_sync ON public.claim_requests;
DROP FUNCTION IF EXISTS public.sync_artisan_claim();

-- ════════════════════════════════════════════════════════════
-- STEP 2: approve_artisan_claim(p_claim_id uuid)
--
-- CONCURRENCY INVARIANTS:
--   A. Claim row locked FOR UPDATE before any read of claim fields.
--   B. Artisan row locked FOR UPDATE (by resolved UUID) before owner check.
--      This serializes concurrent approvals of different claims for the same artisan.
--   C. UPDATE artisans WHERE owner_user_id IS NULL — conditional defensive write.
--      ROW_COUNT checked: if 0, re-read artisan under lock and return truthful state.
--   D. Multi-claim first-wins: after approval, all OTHER pending claims for this
--      artisan auto-rejected to status='superseded_by_approval'.
--
-- OWNERSHIP INVARIANTS:
--   owner_user_id:        written ONLY by this RPC (server-side identity only)
--   onboarding_completed: NEVER set by this RPC
--   verified:             NEVER set by this RPC
--   availability:         NEVER set by this RPC
--
-- SAFE-FAIL paths:
--   unauthenticated          — auth.uid() IS NULL
--   not_admin                — caller users.role != 'admin'
--   claim_not_found          — p_claim_id row missing
--   claim_not_pending        — status != 'pending'
--   requester_missing        — claim.requester_user_id IS NULL
--   artisan_not_found        — all resolution paths exhausted
--   artisan_has_owner        — artisan.owner_user_id IS NOT NULL, != requester
--   already_owned_consistent — artisan already owned by this requester (idempotent PASS)
--   conditional_update_miss  — UPDATE WHERE owner_user_id IS NULL returned 0 rows
--                              (re-read state and return truthful artisan_has_owner or already_owned)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.approve_artisan_claim(
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid     uuid;
  v_caller_role    text;
  v_claim          record;
  v_artisan_id     uuid;
  v_artisan_owner  uuid;
  v_requester_id   uuid;
  v_rows_updated   integer;
  v_reread_owner   uuid;
BEGIN

  -- ── STEP 1: Identify caller from Supabase auth ─────────────
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── STEP 2: Verify admin role from DB — never from caller payload ──
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = v_caller_uid;

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  -- ── STEP 3: Lock and read claim row ────────────────────────
  -- FOR UPDATE on claim row: serializes concurrent approvals of THIS claim.
  SELECT * INTO v_claim
  FROM public.claim_requests
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found');
  END IF;

  -- ── STEP 4: Claim must be pending ──────────────────────────
  IF v_claim.status != 'pending' THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'claim_not_pending',
      'status', v_claim.status
    );
  END IF;

  -- ── STEP 5: Requester must exist in claim row ───────────────
  v_requester_id := v_claim.requester_user_id;
  IF v_requester_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'requester_missing');
  END IF;

  -- ── STEP 6: Resolve artisan UUID from claim_requests ────────
  -- Primary:  artisan_id UUID FK (direct, preferred — populated by current claim UI)
  -- Fallback: artisan_legacy_id cast to UUID (legacy/migrated claims)
  -- Final:    artisan_legacy_id text match on artisans.legacy_id
  -- Never accepts artisan identity from caller payload.
  IF v_claim.artisan_id IS NOT NULL THEN
    SELECT a.id INTO v_artisan_id
    FROM public.artisans a
    WHERE a.id = v_claim.artisan_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL AND v_claim.artisan_legacy_id IS NOT NULL THEN
    SELECT a.id INTO v_artisan_id
    FROM public.artisans a
    WHERE a.id::text = v_claim.artisan_legacy_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL AND v_claim.artisan_legacy_id IS NOT NULL THEN
    SELECT a.id INTO v_artisan_id
    FROM public.artisans a
    WHERE a.legacy_id = v_claim.artisan_legacy_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok',                false,
      'reason',            'artisan_not_found',
      'artisan_id',        v_claim.artisan_id,
      'artisan_legacy_id', v_claim.artisan_legacy_id
    );
  END IF;

  -- ── STEP 7: Lock artisan row FOR UPDATE ────────────────────
  -- CRITICAL CONCURRENCY INVARIANT:
  -- This lock serializes ALL concurrent approvals targeting the same artisan,
  -- even when they arrive via different claim rows (different p_claim_id).
  -- Without this lock: Tx A and Tx B can both read owner_user_id=NULL
  -- from Step 6 above (which does NOT lock the artisan row), then both
  -- proceed to the UPDATE, with the second writer silently overwriting
  -- the first. This FOR UPDATE prevents that race.
  -- Owner check MUST happen AFTER this lock is acquired.
  SELECT a.owner_user_id INTO v_artisan_owner
  FROM public.artisans a
  WHERE a.id = v_artisan_id
  FOR UPDATE;

  -- ── STEP 8: Ownership checks (under artisan lock) ──────────

  -- Case A: artisan already owned by a DIFFERENT user → hard business failure
  IF v_artisan_owner IS NOT NULL AND v_artisan_owner != v_requester_id THEN
    RETURN jsonb_build_object(
      'ok',         false,
      'reason',     'artisan_has_owner',
      'artisan_id', v_artisan_id
    );
  END IF;

  -- Case B: artisan already owned by THIS same requester → idempotent
  IF v_artisan_owner IS NOT NULL AND v_artisan_owner = v_requester_id THEN
    -- Artisan ownership is already consistent. Mark claim approved idempotently.
    -- Do NOT rewrite owner_user_id, onboarding_completed, verified, availability.
    UPDATE public.claim_requests
    SET status      = 'approved',
        reviewed_at = now()
    WHERE id = p_claim_id;
    -- Supersede any other pending claims for this artisan (multi-claim safety)
    UPDATE public.claim_requests
    SET status      = 'superseded_by_approval',
        reviewed_at = now()
    WHERE artisan_id = v_artisan_id
      AND id        != p_claim_id
      AND status     = 'pending';
    -- Also match by artisan_legacy_id for legacy claims
    UPDATE public.claim_requests
    SET status      = 'superseded_by_approval',
        reviewed_at = now()
    WHERE artisan_legacy_id = v_claim.artisan_legacy_id
      AND id                != p_claim_id
      AND status             = 'pending'
      AND v_claim.artisan_legacy_id IS NOT NULL;
    RETURN jsonb_build_object(
      'ok',           true,
      'reason',       'already_owned_consistent',
      'artisan_id',   v_artisan_id,
      'requester_id', v_requester_id
    );
  END IF;

  -- Case C: owner_user_id IS NULL → proceed with ownership transfer

  -- ── STEP 9: Conditional atomic ownership transfer ───────────
  --
  -- WHERE owner_user_id IS NULL is the final defensive guard:
  -- even if the FOR UPDATE lock above somehow allowed two transactions
  -- through (impossible under standard PostgreSQL serialization, but
  -- defensive-in-depth), only ONE will match the IS NULL predicate.
  --
  -- INVARIANTS (7C.12A.1 contract):
  --   onboarding_completed: NOT SET — remains false until 7C.12A.3 RPC
  --   verified:             NOT SET — separate admin judgment
  --   availability:         NOT SET — artisan sets post-onboarding
  --
  -- Claim approval DOES NOT make artisan dispatch-eligible.
  -- dispatch_request_v1 requires onboarding_completed=true AND availability='available'.
  UPDATE public.artisans
  SET owner_user_id  = v_requester_id,
      claimed        = true,
      claim_status   = 'approved',
      updated_at     = now()
      -- onboarding_completed: intentionally NOT SET (7C.12A.1)
      -- verified:             intentionally NOT SET (7C.12A.1)
      -- availability:         intentionally NOT SET (7C.12A.1)
  WHERE id             = v_artisan_id
    AND owner_user_id IS NULL;  -- defensive guard: never overwrite a non-null owner

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- ── STEP 10: ROW_COUNT check ────────────────────────────────
  -- If 0 rows updated, another transaction won the race despite the lock.
  -- Re-read the current owner under the still-held lock and return truthful state.
  IF v_rows_updated = 0 THEN
    SELECT a.owner_user_id INTO v_reread_owner
    FROM public.artisans a
    WHERE a.id = v_artisan_id;

    IF v_reread_owner IS NULL THEN
      -- Unexpected: owner still NULL but UPDATE matched 0 rows.
      -- This should be unreachable under normal PostgreSQL semantics.
      RAISE WARNING '[approve_artisan_claim] conditional_update_miss: artisan % owner still NULL after 0-row update', v_artisan_id;
      RETURN jsonb_build_object(
        'ok',         false,
        'reason',     'conditional_update_miss',
        'artisan_id', v_artisan_id
      );
    ELSIF v_reread_owner = v_requester_id THEN
      -- Another transaction with the same requester just approved — idempotent
      RETURN jsonb_build_object(
        'ok',           true,
        'reason',       'already_owned_consistent',
        'artisan_id',   v_artisan_id,
        'requester_id', v_requester_id
      );
    ELSE
      -- A different requester won the race
      RETURN jsonb_build_object(
        'ok',         false,
        'reason',     'artisan_has_owner',
        'artisan_id', v_artisan_id
      );
    END IF;
  END IF;

  -- ── STEP 11: Mark claim approved ────────────────────────────
  UPDATE public.claim_requests
  SET status      = 'approved',
      reviewed_at = now()
  WHERE id = p_claim_id;

  -- ── STEP 12: Multi-claim first-wins — supersede competing pending claims ──
  -- After successful ownership transfer, no other pending claim for this artisan
  -- may later be approved. Mark them superseded atomically here.
  -- Does NOT touch requester accounts. Does NOT change artisan ownership again.
  UPDATE public.claim_requests
  SET status      = 'superseded_by_approval',
      reviewed_at = now()
  WHERE artisan_id = v_artisan_id
    AND id        != p_claim_id
    AND status     = 'pending';

  -- Also supersede by artisan_legacy_id for legacy claim rows
  IF v_claim.artisan_legacy_id IS NOT NULL THEN
    UPDATE public.claim_requests
    SET status      = 'superseded_by_approval',
        reviewed_at = now()
    WHERE artisan_legacy_id = v_claim.artisan_legacy_id
      AND id               != p_claim_id
      AND status            = 'pending';
  END IF;

  -- ── STEP 13: Promote user role ──────────────────────────────
  UPDATE public.users
  SET role = 'artisan'
  WHERE id = v_requester_id
    AND role != 'admin';

  UPDATE public.profiles
  SET role = 'artisan'
  WHERE id = v_requester_id
    AND (role IS NULL OR role NOT IN ('admin'));

  -- ── STEP 14: Return success ─────────────────────────────────
  RETURN jsonb_build_object(
    'ok',           true,
    'reason',       'approved',
    'artisan_id',   v_artisan_id,
    'requester_id', v_requester_id,
    'claim_id',     p_claim_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[approve_artisan_claim] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- STEP 3: reject_artisan_claim(p_claim_id uuid, p_note text)
--
-- Extended to absorb trigger rejected-branch work:
--   resets artisan.claim_status='unclaimed' WHERE owner_user_id IS NULL
--
-- REJECTION NEVER TOUCHES:
--   artisans.owner_user_id
--   artisans.onboarding_completed
--   artisans.verified
--   artisans.availability
--
-- IDEMPOTENCY:
--   already_rejected → PASS
--   claim_already_approved → FAIL (cannot reject post-approval)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reject_artisan_claim(
  p_claim_id uuid,
  p_note     text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid   uuid;
  v_caller_role  text;
  v_claim        record;
  v_artisan_id   uuid;
BEGIN

  -- ── STEP 1: Identify caller ────────────────────────────────
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── STEP 2: Verify admin role from DB ─────────────────────
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = v_caller_uid;

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  -- ── STEP 3: Lock and read claim row ───────────────────────
  SELECT * INTO v_claim
  FROM public.claim_requests
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found');
  END IF;

  -- ── STEP 4: Already rejected — idempotent ─────────────────
  IF v_claim.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok',      true,
      'reason',  'already_rejected',
      'claim_id', p_claim_id
    );
  END IF;

  -- ── STEP 5: Already approved — cannot reject post-approval ─
  IF v_claim.status = 'approved' THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'claim_already_approved',
      'claim_id', p_claim_id
    );
  END IF;

  -- ── STEP 6: Resolve artisan to reset claim_status ─────────
  -- Absorbed from removed sync_artisan_claim trigger.
  -- artisans.claim_status reset to 'unclaimed' so artisan is re-claimable.
  -- artisans.owner_user_id is NEVER touched by rejection.
  IF v_claim.artisan_id IS NOT NULL THEN
    SELECT id INTO v_artisan_id FROM public.artisans
    WHERE id = v_claim.artisan_id LIMIT 1;
  END IF;
  IF v_artisan_id IS NULL AND v_claim.artisan_legacy_id IS NOT NULL THEN
    SELECT id INTO v_artisan_id FROM public.artisans
    WHERE id::text = v_claim.artisan_legacy_id LIMIT 1;
  END IF;
  IF v_artisan_id IS NULL AND v_claim.artisan_legacy_id IS NOT NULL THEN
    SELECT id INTO v_artisan_id FROM public.artisans
    WHERE legacy_id = v_claim.artisan_legacy_id LIMIT 1;
  END IF;

  -- ── STEP 7: Reset artisan claim state (if resolved) ────────
  -- Only touches claim_status.
  -- WHERE owner_user_id IS NULL: never reset a claimed artisan.
  IF v_artisan_id IS NOT NULL THEN
    UPDATE public.artisans
    SET claim_status = 'unclaimed',
        updated_at   = now()
    WHERE id = v_artisan_id
      AND owner_user_id IS NULL;
  END IF;

  -- ── STEP 8: Mark claim rejected ───────────────────────────
  UPDATE public.claim_requests
  SET status      = 'rejected',
      reviewed_at = now(),
      notes       = CASE
                      WHEN p_note IS NOT NULL AND p_note != '' THEN p_note
                      ELSE COALESCE(notes, '')
                    END
  WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'reason',    'rejected',
    'claim_id',  p_claim_id,
    'artisan_id', v_artisan_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[reject_artisan_claim] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- STEP 4: Permissions
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)         FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)         TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)    FROM anon;
GRANT  EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)    TO service_role;

-- ════════════════════════════════════════════════════════════
-- STEP 5: RLS — complete policy replacement on claim_requests
--
-- EXHAUSTIVE DROP: all 16 known historical policy names across the
-- entire repo are dropped idempotently before creating canonical policies.
-- This ensures no stale permissive policy survives regardless of which
-- migration was applied last.
--
-- TARGET STATE:
--   anon:                  ALL blocked (explicit USING false / WITH CHECK false)
--   authenticated (non-admin): INSERT own claim only
--                              SELECT own claims only
--                              NO direct UPDATE / DELETE
--   admin (authenticated): SELECT all claims (for review UI)
--                          NO direct UPDATE/DELETE — approval/rejection via RPC only
--
-- NOTE on admin UPDATE/DELETE removal:
--   The historical 'admin_all_claim_requests' and 'claims_admin_all' policies
--   granted admin FOR ALL (including direct UPDATE). This allowed browser-direct
--   status writes bypassing the RPC. These are intentionally NOT restored.
--   Admins use approve_artisan_claim() / reject_artisan_claim() RPCs only.
-- ════════════════════════════════════════════════════════════

-- Ensure RLS is active
ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

-- ── DROP all known historical policy names (idempotent) ────
DROP POLICY IF EXISTS "claims_insert"                        ON public.claim_requests;
DROP POLICY IF EXISTS "claims_public_insert"                 ON public.claim_requests;
DROP POLICY IF EXISTS "claims_self_read"                     ON public.claim_requests;
DROP POLICY IF EXISTS "claims_admin_all"                     ON public.claim_requests;
DROP POLICY IF EXISTS "claims_requester_read"                ON public.claim_requests;
DROP POLICY IF EXISTS "deny_anon_claim_requests"             ON public.claim_requests;
DROP POLICY IF EXISTS "authenticated_claim_insert"           ON public.claim_requests;
DROP POLICY IF EXISTS "authenticated_own_claim_read"         ON public.claim_requests;
DROP POLICY IF EXISTS "admin_all_claim_requests"             ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_anon_deny"             ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_insert"                ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_read"                  ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_insert_any"            ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_public_insert"         ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_authenticated_insert"  ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_own_select"            ON public.claim_requests;

-- ── POLICY 1: anon — deny everything ───────────────────────
-- Explicit USING false / WITH CHECK false so no anon operation
-- can match even if table-level grants exist.
CREATE POLICY "7c12a1_deny_anon_all" ON public.claim_requests
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ── POLICY 2: authenticated — self-INSERT only ─────────────
-- requester_user_id must equal auth.uid() at INSERT time.
-- Prevents submitting a claim on behalf of another user.
CREATE POLICY "7c12a1_auth_insert_own" ON public.claim_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
  );

-- ── POLICY 3: authenticated — SELECT own claims ────────────
-- Non-admin: own claims only.
-- Admin: all claims (for review dashboard).
-- Admins identified via DB users.role only (not profiles, to avoid dual-table confusion).
CREATE POLICY "7c12a1_auth_select" ON public.claim_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ── NO UPDATE / DELETE policies for authenticated ──────────
-- Authenticated users (including admins) cannot directly UPDATE or DELETE
-- claim_requests rows via the REST/PostgREST API.
-- All status mutations (approve/reject) go through the RPCs.

COMMIT;
