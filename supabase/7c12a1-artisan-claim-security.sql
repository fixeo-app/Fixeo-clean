-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Foundation
-- supabase/7c12a1-artisan-claim-security.sql
--
-- FORENSIC DECISION: sync_artisan_claim() trigger DROPPED
-- ─────────────────────────────────────────────────────────
-- The existing trigger (claim_approval_sync on claim_requests,
-- AFTER UPDATE, executing sync_artisan_claim()) has three defects:
--
--   DEFECT 1 (CRITICAL):
--     onboarding_completed = (NEW.onboarding_data IS NOT NULL AND NEW.onboarding_data <> '{}')
--     Any non-empty onboarding_data JSONB in the claim row marks the artisan
--     as onboarding-complete at approval time. This is trivially exploitable:
--     any claim with non-empty JSONB activates the artisan for dispatch.
--     CONTRACT VIOLATION: claim approval ≠ onboarding complete ≠ dispatch eligible.
--
--   DEFECT 2 (HIGH):
--     verified = TRUE is set automatically at claim approval.
--     Verification is a separate admin judgment — not implied by claim approval.
--     This is premature and misleading to artisans browsing public profiles.
--
--   DEFECT 3 (DOUBLE-WRITE):
--     approve_artisan_claim() RPC (7C.12A.1) now owns the atomic approval path.
--     It executes: UPDATE claim_requests SET status='approved'.
--     The trigger fires on that same UPDATE → duplicate ownership mutation:
--     both RPC and trigger write artisans.owner_user_id concurrently.
--     This creates a race condition and an unverifiable ownership audit trail.
--
-- RETENTION ANALYSIS:
--   The trigger also handles rejected transitions:
--     UPDATE artisans SET claim_status='rejected' WHERE artisan_id OR legacy_id
--   This is the ONLY legitimate work the trigger performs.
--   It is absorbed into reject_artisan_claim() RPC in this migration.
--
-- RESULT: DROP claim_approval_sync trigger + sync_artisan_claim() function.
--   approve_artisan_claim() is the SINGLE server-authoritative ownership path.
--   reject_artisan_claim() is extended to cover artisan claim_status='rejected'.
--   ONE unambiguous ownership authority. Zero trigger interference.
--
-- ─────────────────────────────────────────────────────────
-- CANONICAL APPROVAL OUTCOME:
--   artisans.owner_user_id       = requester_user_id  (from claim row)
--   artisans.claimed             = true
--   artisans.claim_status        = 'approved'
--   artisans.onboarding_completed = false  (unchanged — NOT set by approval)
--   artisans.availability         = unchanged (NOT set by approval)
--   artisans.verified             = unchanged (NOT set by approval)
--   claim_requests.status        = 'approved'
--   claim_requests.reviewed_at   = now()
--   users.role                   = 'artisan'  (if not admin)
--   profiles.role                = 'artisan'  (if not admin)
--
-- DISPATCH ELIGIBILITY (unchanged from 7C.11F.1C contract):
--   owner_user_id IS NOT NULL
--   AND claim_status = 'approved'
--   AND onboarding_completed = true    ← only set by future 7C.12A.3 RPC
--   AND availability = 'available'     ← only set by artisan themselves post-onboarding
--
--   Claim approval alone NEVER makes an artisan dispatch-eligible.
--
-- ─────────────────────────────────────────────────────────
-- TRANSACTION ATOMICITY: wrapped in BEGIN/COMMIT.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- STEP 0: Ensure reviewed_at column exists on claim_requests
--         (nullable — may not have been in original schema)
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
-- STEP 1: DROP the defective trigger and trigger function
--
-- Rationale: forensic audit proves sync_artisan_claim() has three
-- critical defects (see header). All legitimate work is now owned
-- by the approve/reject RPCs. No legitimate code depends on the
-- trigger firing — approve_artisan_claim() RPC is the only approval
-- path (browser no longer calls UPDATE claim_requests directly).
-- ════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS claim_approval_sync ON public.claim_requests;
DROP FUNCTION IF EXISTS public.sync_artisan_claim();

-- ════════════════════════════════════════════════════════════
-- STEP 2: approve_artisan_claim(p_claim_id uuid)
--
-- SECURITY DEFINER — runs with elevated DB privileges.
-- SET search_path = '' — no schema injection.
-- Only authenticated users may call it; admin role verified from DB.
-- All identity (artisan UUID, requester UUID) read from claim_requests row.
-- No identity accepted from caller payload.
--
-- APPROVAL SETS:
--   artisans.owner_user_id = requester_user_id (from claim row)
--   artisans.claimed = true
--   artisans.claim_status = 'approved'
--   artisans.updated_at = now()
--   artisans.onboarding_completed → UNCHANGED (NEVER set here)
--   artisans.availability → UNCHANGED (NEVER set here)
--   artisans.verified → UNCHANGED (NEVER set here)
--   claim_requests.status = 'approved'
--   claim_requests.reviewed_at = now()
--   users.role = 'artisan' (if not already admin)
--   profiles.role = 'artisan' (if not already admin)
--
-- SAFE-FAIL paths:
--   unauthenticated    — auth.uid() IS NULL
--   not_admin          — caller's users.role != 'admin'
--   claim_not_found    — p_claim_id doesn't exist
--   claim_not_pending  — status != 'pending'
--   requester_missing  — claim.requester_user_id IS NULL
--   artisan_not_found  — artisan_legacy_id + artisan_id resolve to nothing
--   artisan_has_owner  — artisan.owner_user_id IS NOT NULL (different user)
--   already_owned      — artisan.owner_user_id = requester_id (idempotent PASS)
--
-- CONCURRENCY:
--   SELECT FOR UPDATE on claim_requests row serializes concurrent calls.
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
  SELECT * INTO v_claim
  FROM public.claim_requests
  WHERE id = p_claim_id
  FOR UPDATE;  -- serialize concurrent approval attempts

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
  -- Primary: artisan_id UUID FK (direct, preferred)
  -- Fallback: artisan_legacy_id text (for legacy/migrated claims)
  -- Never accepts artisan identity from caller payload.
  IF v_claim.artisan_id IS NOT NULL THEN
    SELECT a.id, a.owner_user_id INTO v_artisan_id, v_artisan_owner
    FROM public.artisans a
    WHERE a.id = v_claim.artisan_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL AND v_claim.artisan_legacy_id IS NOT NULL THEN
    -- Try UUID cast first (most artisans: artisan_legacy_id stores the UUID string)
    SELECT a.id, a.owner_user_id INTO v_artisan_id, v_artisan_owner
    FROM public.artisans a
    WHERE a.id::text = v_claim.artisan_legacy_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL AND v_claim.artisan_legacy_id IS NOT NULL THEN
    -- Final fallback: legacy_id text match (populated on some migrated artisans)
    SELECT a.id, a.owner_user_id INTO v_artisan_id, v_artisan_owner
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

  -- ── STEP 7: Artisan must not already belong to a different owner ──
  IF v_artisan_owner IS NOT NULL AND v_artisan_owner != v_requester_id THEN
    RETURN jsonb_build_object(
      'ok',         false,
      'reason',     'artisan_has_owner',
      'artisan_id', v_artisan_id
    );
  END IF;

  -- ── STEP 8: If artisan already owned by this same requester, idempotent ──
  IF v_artisan_owner IS NOT NULL AND v_artisan_owner = v_requester_id THEN
    -- Still update claim row to approved (idempotent)
    UPDATE public.claim_requests
    SET status      = 'approved',
        reviewed_at = now()
    WHERE id = p_claim_id;
    RETURN jsonb_build_object(
      'ok',           true,
      'reason',       'already_owned',
      'artisan_id',   v_artisan_id,
      'requester_id', v_requester_id
    );
  END IF;

  -- ── STEP 9: Atomic ownership transfer ──────────────────────
  --
  -- 9a. Update artisans row — server-side identity only.
  --
  --     INVARIANTS (7C.12A.1 contract):
  --     onboarding_completed: NOT SET — remains false until 7C.12A.3 RPC
  --     availability:         NOT SET — artisan sets this post-onboarding
  --     verified:             NOT SET — separate admin judgment, not implied by claim
  --
  --     Approval alone DOES NOT make artisan dispatch-eligible.
  --     dispatch_request_v1 requires onboarding_completed=true AND availability='available'.
  --     Neither is set here.
  UPDATE public.artisans
  SET owner_user_id  = v_requester_id,
      claimed        = true,
      claim_status   = 'approved',
      updated_at     = now()
      -- onboarding_completed: intentionally NOT SET (7C.12A.1)
      -- verified:             intentionally NOT SET (7C.12A.1)
      -- availability:         intentionally NOT SET (7C.12A.1)
  WHERE id = v_artisan_id;

  -- 9b. Update claim_requests row
  UPDATE public.claim_requests
  SET status      = 'approved',
      reviewed_at = now()
  WHERE id = p_claim_id;

  -- 9c. Promote user role in users table
  UPDATE public.users
  SET role = 'artisan'
  WHERE id = v_requester_id
    AND role != 'admin';  -- never demote an admin

  -- 9d. Promote user role in profiles table
  UPDATE public.profiles
  SET role = 'artisan'
  WHERE id = v_requester_id
    AND (role IS NULL OR role NOT IN ('admin'));

  -- ── STEP 10: Return success with resolved identities ────────
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
-- Extended from prior version to include artisan claim_status update.
-- The now-removed trigger was the only thing setting artisans.claim_status='rejected'
-- on rejection. This RPC now absorbs that work to ensure no regression.
--
-- REJECTION SETS:
--   claim_requests.status = 'rejected'
--   claim_requests.reviewed_at = now()
--   claim_requests.notes = p_note (if provided)
--   artisans.claim_status = 'pending' (reset to searchable state, not 'rejected')
--     NOTE: artisans.claim_status='pending' means "has a pending claim" — the claim
--     being rejected means the artisan is back to claimable state (claim_status='unclaimed'
--     OR 'pending' depending on whether other pending claims exist). We reset to
--     'unclaimed' to allow a fresh claim.
--   artisans.owner_user_id: NEVER TOUCHED by rejection
--   artisans.onboarding_completed: NEVER TOUCHED by rejection
--   artisans.availability: NEVER TOUCHED by rejection
--
-- IDEMPOTENCY:
--   already_rejected → PASS (idempotent)
--   claim_already_approved → FAIL (cannot reject after approval)
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
  -- artisans.claim_status is reset to 'unclaimed' so the artisan
  -- remains visible/claimable after rejection.
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
  -- Only touches claim_status — never touches owner_user_id,
  -- onboarding_completed, availability, or verified.
  IF v_artisan_id IS NOT NULL THEN
    UPDATE public.artisans
    SET claim_status = 'unclaimed',
        updated_at   = now()
    WHERE id = v_artisan_id
      AND owner_user_id IS NULL;  -- safety: never reset a claimed artisan
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
-- STEP 4: Permissions — admin/service_role only
--
-- authenticated is granted EXECUTE so admin users can call via
-- Supabase client RPC. Admin verification happens inside the function.
-- anon is explicitly revoked.
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
-- STEP 5: RLS — tighten claim_requests INSERT
--
-- Target policy state:
--   anon:          NO INSERT (table privilege still blocked by default)
--   authenticated: INSERT only with requester_user_id = auth.uid()
--   service_role:  INSERT (for server-side paths, bypasses RLS)
--   UPDATE/DELETE: no authenticated/anon policy — RPC-only path
-- ════════════════════════════════════════════════════════════

-- Drop stale open-insert policy from rls-policies.sql
DROP POLICY IF EXISTS "claims_insert"                        ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_insert_any"            ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_public_insert"         ON public.claim_requests;

-- Ensure RLS is enabled
ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated can only INSERT their own claim
DROP POLICY IF EXISTS "claim_requests_authenticated_insert"  ON public.claim_requests;
CREATE POLICY "claim_requests_authenticated_insert" ON public.claim_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
  );

-- SELECT: authenticated can read their own claims or admins read all
DROP POLICY IF EXISTS "claim_requests_own_select"            ON public.claim_requests;
CREATE POLICY "claim_requests_own_select" ON public.claim_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMIT;
