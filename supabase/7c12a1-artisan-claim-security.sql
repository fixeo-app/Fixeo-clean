-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Foundation (Final Hardened v2)
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
-- DEADLOCK-FREE CONCURRENCY MODEL (7C.12A.1 v2):
--
-- PREVIOUS ORDER (c8e40e9) — DEADLOCK RISK:
--   Tx A: lock claim_A → lock artisan → UPDATE claim_B (blocked by Tx B)
--   Tx B: lock claim_B → wait for artisan (blocked by Tx A)
--   => Circular wait: A holds artisan, waits for B's claim_B; B holds claim_B,
--      waits for A's artisan. => DEADLOCK.
--
-- NEW ORDER (v2) — PROVABLY DEADLOCK-FREE:
--   All concurrent approvals for the same artisan acquire locks in
--   the same deterministic order:
--     1. NON-LOCKING claim read — resolve artisan_id only (no FOR UPDATE yet)
--     2. ARTISAN FOR UPDATE — first and only mandatory lock ordering point
--     3. TARGET CLAIM FOR UPDATE — after artisan lock is held
--     4. Re-validate claim status under claim lock (may have changed)
--     5. Supersede competing pending claims (Tx B is blocked on step 2,
--        so it cannot hold any competing claim lock at this point)
--
--   Why deadlock is impossible:
--   - All transactions contending for the same artisan block at step 2.
--   - Exactly one transaction acquires the artisan lock first (Tx A).
--   - Tx A proceeds: locks target claim (step 3), supersedes others (step 5).
--   - Tx B is still waiting at step 2. When it acquires artisan lock, it
--     will re-read claim and find status != 'pending' → safe failure.
--   - No circular wait can form: artisan lock is always acquired before
--     any claim row is locked under locking semantics.
--
-- CLAIM PRE-READ (step 1) — non-locking, safe:
--   We need artisan_id to acquire the artisan lock. We read the claim
--   without FOR UPDATE to get artisan identity, then re-lock with
--   FOR UPDATE after artisan is held. All critical business logic
--   (status check, requester check) is performed ONLY on the re-locked
--   claim read — never on the pre-read snapshot.
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
-- STATUS CHECK CONSTRAINT (Blocker 2):
--   BEFORE migration: ('pending', 'approved', 'rejected')
--   AFTER migration:  ('pending', 'approved', 'rejected', 'superseded_by_approval')
--
--   The existing constraint named 'claims_status_check' is dropped and
--   recreated with the extended set. The DROP+ADD is wrapped in a DO block
--   that HARDs-STOPs if the current constraint definition does not exactly
--   match the known baseline — preventing silent destruction of a constraint
--   that was modified outside this migration chain.
--
-- ─────────────────────────────────────────────────────────
-- CROSS-REPRESENTATION SUPERSESSION:
--   Competing claims are matched by canonical v_artisan_id (resolved UUID)
--   via artisan_id FK, AND by artisan_legacy_id for claims where artisan_id
--   IS NULL. This covers all representations:
--     winner has artisan_id populated   → v_artisan_id = claim.artisan_id
--     winner resolved via legacy_id     → v_artisan_id = resolved UUID
--     competitor has artisan_id         → matched by artisan_id = v_artisan_id
--     competitor has only legacy_id     → matched by canonical lookup join
--   No unrelated artisan can be superseded.
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
-- STEP 0a: Ensure reviewed_at column exists on claim_requests
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='claim_requests' AND column_name='reviewed_at'
  ) THEN
    ALTER TABLE public.claim_requests ADD COLUMN reviewed_at timestamptz;
    RAISE NOTICE 'Step 0a: reviewed_at column added to claim_requests';
  ELSE
    RAISE NOTICE 'Step 0a: reviewed_at already exists — no change';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- STEP 0b: Extend claims_status_check to include superseded_by_approval
--
-- SAFETY CONTRACT:
--   - Verify the EXISTING constraint definition before modifying it.
--   - If constraint does not exist: create with full set.
--   - If constraint exists with EXACTLY the known baseline definition
--     ('pending', 'approved', 'rejected'): safe to extend.
--   - If constraint exists with an UNEXPECTED definition: HARD STOP.
--     This prevents silently dropping a constraint that was extended
--     outside this migration chain.
--
-- EXPECTED CONSTRAINT NAME: claims_status_check
-- BASELINE ALLOWED VALUES:  ('pending', 'approved', 'rejected')
-- TARGET ALLOWED VALUES:    ('pending', 'approved', 'rejected', 'superseded_by_approval')
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_con_exists    boolean;
  v_con_def       text;
  v_baseline_ok   boolean := false;
BEGIN
  -- Check if constraint exists
  SELECT EXISTS(
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'claim_requests'
      AND c.conname = 'claims_status_check'
      AND c.contype = 'c'
  ) INTO v_con_exists;

  IF v_con_exists THEN
    -- Read the current check expression
    SELECT pg_get_constraintdef(c.oid)
    INTO v_con_def
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'claim_requests'
      AND c.conname = 'claims_status_check'
    LIMIT 1;

    RAISE NOTICE 'Step 0b: existing claims_status_check definition: %', v_con_def;

    -- Verify it matches exactly the known baseline (3 values only).
    -- Accept both PostgreSQL representation variants (with/without spaces).
    -- The constraint may render as:
    --   CHECK ((status = ANY (ARRAY[...::text])))  -- pg14+
    --   CHECK ((status = ANY ('{pending,approved,rejected}'::text[])))
    --   CHECK (((status)::text = ANY (...)))
    -- Strategy: verify it contains exactly the 3 baseline values and
    -- does NOT already contain superseded_by_approval.
    IF v_con_def ILIKE '%pending%'
       AND v_con_def ILIKE '%approved%'
       AND v_con_def ILIKE '%rejected%'
       AND v_con_def NOT ILIKE '%superseded_by_approval%'
    THEN
      v_baseline_ok := true;
    ELSIF v_con_def ILIKE '%superseded_by_approval%' THEN
      -- Already extended — idempotent, nothing to do
      RAISE NOTICE 'Step 0b: claims_status_check already includes superseded_by_approval — no change';
      v_baseline_ok := false; -- prevents the ALTER below
    ELSE
      -- Unknown constraint definition — HARD STOP
      RAISE EXCEPTION 'Step 0b HARD STOP: claims_status_check has unexpected definition: [%]. Manual review required before applying this migration.', v_con_def;
    END IF;

    IF v_baseline_ok THEN
      ALTER TABLE public.claim_requests DROP CONSTRAINT claims_status_check;
      ALTER TABLE public.claim_requests ADD CONSTRAINT claims_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'superseded_by_approval'));
      RAISE NOTICE 'Step 0b: claims_status_check extended to include superseded_by_approval';
    END IF;

  ELSE
    -- Constraint does not exist: create with full target set
    ALTER TABLE public.claim_requests ADD CONSTRAINT claims_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'superseded_by_approval'));
    RAISE NOTICE 'Step 0b: claims_status_check created with full target set (was missing)';
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
-- DEADLOCK-FREE LOCK ORDER (v2):
--   PRE-READ  — read claim WITHOUT FOR UPDATE to resolve artisan_id only
--   LOCK A    — SELECT artisans FOR UPDATE (by resolved UUID)
--   LOCK B    — SELECT claim_requests FOR UPDATE (after artisan lock held)
--   REVALIDATE — re-check all claim fields from locked read
--   SUPERSEDE  — UPDATE competing claims (safe: Tx B blocked on artisan lock)
--
-- All concurrent approvals for the same artisan block at LOCK A.
-- Exactly one proceeds. No circular wait is possible.
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
--   claim_not_found          — p_claim_id row missing (pre-read)
--   claim_not_pending_preread — status != 'pending' at pre-read
--   requester_missing_preread — requester_user_id IS NULL at pre-read
--   artisan_not_found        — all resolution paths exhausted
--   claim_not_found_locked   — p_claim_id row missing after re-lock
--   claim_not_pending        — status != 'pending' after re-lock (race: superseded)
--   requester_mismatch       — requester changed between pre-read and re-lock
--   artisan_has_owner        — artisan.owner_user_id IS NOT NULL, != requester
--   already_owned_consistent — artisan already owned by this requester (idempotent PASS)
--   conditional_update_miss  — UPDATE WHERE owner_user_id IS NULL returned 0 rows
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
  v_caller_uid        uuid;
  v_caller_role       text;
  v_pre               record;   -- non-locking pre-read of claim
  v_claim             record;   -- locked re-read of claim
  v_artisan_id        uuid;     -- resolved canonical artisan UUID
  v_artisan_owner     uuid;     -- owner read under artisan lock
  v_requester_id      uuid;
  v_rows_updated      integer;
  v_reread_owner      uuid;
BEGIN

  -- ── AUTH 1: Identify caller ─────────────────────────────────
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── AUTH 2: Verify admin role from DB ───────────────────────
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = v_caller_uid;

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- PRE-READ: read claim WITHOUT FOR UPDATE — purpose: resolve
  -- artisan_id only so we can acquire the artisan lock first.
  -- DO NOT trust this snapshot for business decisions. All critical
  -- checks (status, requester) are performed on the re-locked read.
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_pre
  FROM public.claim_requests
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found');
  END IF;

  -- Early-exit on obvious pre-read invalids (avoid pointless artisan lock)
  IF v_pre.status != 'pending' THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'claim_not_pending_preread',
      'status', v_pre.status
    );
  END IF;
  IF v_pre.requester_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'requester_missing_preread');
  END IF;

  -- ── RESOLVE artisan UUID from pre-read claim fields ──────────
  -- Primary:  artisan_id UUID FK
  -- Fallback: artisan_legacy_id cast to UUID
  -- Final:    artisan_legacy_id text match on artisans.legacy_id
  IF v_pre.artisan_id IS NOT NULL THEN
    SELECT a.id INTO v_artisan_id
    FROM public.artisans a
    WHERE a.id = v_pre.artisan_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL AND v_pre.artisan_legacy_id IS NOT NULL THEN
    SELECT a.id INTO v_artisan_id
    FROM public.artisans a
    WHERE a.id::text = v_pre.artisan_legacy_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL AND v_pre.artisan_legacy_id IS NOT NULL THEN
    SELECT a.id INTO v_artisan_id
    FROM public.artisans a
    WHERE a.legacy_id = v_pre.artisan_legacy_id
    LIMIT 1;
  END IF;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok',                false,
      'reason',            'artisan_not_found',
      'artisan_id',        v_pre.artisan_id,
      'artisan_legacy_id', v_pre.artisan_legacy_id
    );
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- LOCK A: Acquire ARTISAN row FOR UPDATE — THE GLOBAL ORDERING POINT.
  --
  -- All concurrent approvals targeting the same artisan (regardless of
  -- which claim row they arrived from) will contend here. Exactly one
  -- transaction acquires this lock. The loser blocks here and will later
  -- re-read a non-pending claim status.
  --
  -- Owner read happens AFTER this lock — never before.
  -- ══════════════════════════════════════════════════════════════
  SELECT a.owner_user_id INTO v_artisan_owner
  FROM public.artisans a
  WHERE a.id = v_artisan_id
  FOR UPDATE;

  -- ══════════════════════════════════════════════════════════════
  -- LOCK B: Acquire TARGET CLAIM row FOR UPDATE — after artisan lock.
  --
  -- The claim may have been superseded between the pre-read and here
  -- (if a concurrent approval for this artisan won the artisan lock
  -- first, it would have updated this claim to superseded_by_approval).
  -- Re-read and re-validate all critical fields.
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_claim
  FROM public.claim_requests
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found_locked');
  END IF;

  -- Re-validate claim status (may now be superseded_by_approval if we lost a race)
  IF v_claim.status != 'pending' THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'claim_not_pending',
      'status', v_claim.status
    );
  END IF;

  -- Extract requester from locked claim
  v_requester_id := v_claim.requester_user_id;
  IF v_requester_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'requester_missing');
  END IF;

  -- Detect requester mismatch between pre-read and locked read (paranoid guard)
  IF v_requester_id != v_pre.requester_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'requester_mismatch');
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- OWNERSHIP CHECKS (under both artisan lock and claim lock)
  -- ══════════════════════════════════════════════════════════════

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

    -- Supersede competing pending claims using canonical artisan UUID.
    -- See SUPERSESSION LOGIC below for cross-representation coverage.
    PERFORM public._supersede_competing_claims(v_artisan_id, p_claim_id, v_claim.artisan_legacy_id);

    RETURN jsonb_build_object(
      'ok',           true,
      'reason',       'already_owned_consistent',
      'artisan_id',   v_artisan_id,
      'requester_id', v_requester_id
    );
  END IF;

  -- Case C: owner_user_id IS NULL → proceed with ownership transfer

  -- ══════════════════════════════════════════════════════════════
  -- CONDITIONAL ATOMIC OWNERSHIP TRANSFER
  --
  -- WHERE owner_user_id IS NULL is the final defensive guard.
  -- Even if the FOR UPDATE lock above somehow allowed two transactions
  -- through (impossible under standard PostgreSQL serialization, but
  -- defensive-in-depth), only ONE will match the IS NULL predicate.
  --
  -- INVARIANTS (7C.12A.1 contract):
  --   onboarding_completed: NOT SET — remains false until 7C.12A.3 RPC
  --   verified:             NOT SET — separate admin judgment
  --   availability:         NOT SET — artisan sets post-onboarding
  -- ══════════════════════════════════════════════════════════════
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

  -- ROW_COUNT check — re-read if conditional UPDATE matched 0 rows
  IF v_rows_updated = 0 THEN
    SELECT a.owner_user_id INTO v_reread_owner
    FROM public.artisans a
    WHERE a.id = v_artisan_id;

    IF v_reread_owner IS NULL THEN
      RAISE WARNING '[approve_artisan_claim] conditional_update_miss: artisan % owner still NULL after 0-row update', v_artisan_id;
      RETURN jsonb_build_object(
        'ok',         false,
        'reason',     'conditional_update_miss',
        'artisan_id', v_artisan_id
      );
    ELSIF v_reread_owner = v_requester_id THEN
      RETURN jsonb_build_object(
        'ok',           true,
        'reason',       'already_owned_consistent',
        'artisan_id',   v_artisan_id,
        'requester_id', v_requester_id
      );
    ELSE
      RETURN jsonb_build_object(
        'ok',         false,
        'reason',     'artisan_has_owner',
        'artisan_id', v_artisan_id
      );
    END IF;
  END IF;

  -- Mark THIS claim approved
  UPDATE public.claim_requests
  SET status      = 'approved',
      reviewed_at = now()
  WHERE id = p_claim_id;

  -- Supersede competing pending claims (canonical cross-representation)
  PERFORM public._supersede_competing_claims(v_artisan_id, p_claim_id, v_claim.artisan_legacy_id);

  -- Promote user role
  UPDATE public.users
  SET role = 'artisan'
  WHERE id = v_requester_id
    AND role != 'admin';

  UPDATE public.profiles
  SET role = 'artisan'
  WHERE id = v_requester_id
    AND (role IS NULL OR role NOT IN ('admin'));

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
-- STEP 2b: _supersede_competing_claims(artisan_id, winner_claim_id, winner_legacy_id)
--
-- CANONICAL CROSS-REPRESENTATION SUPERSESSION:
--
--   A claim refers to an artisan via one or both of:
--     claim_requests.artisan_id        = UUID FK (preferred, populated by current UI)
--     claim_requests.artisan_legacy_id = TEXT (legacy / migrated claims)
--
--   The canonical artisan identity is always v_artisan_id (resolved UUID).
--   Supersession matches ALL competing pending claims that refer to the
--   same artisan regardless of which column they use:
--
--   BRANCH 1: artisan_id = v_artisan_id (covers all claims that have the UUID FK)
--     - winner resolved via artisan_id → competitor with artisan_id → MATCH
--     - winner resolved via legacy_id  → competitor with same artisan_id → MATCH
--
--   BRANCH 2: artisan_id IS NULL AND artisan_legacy_id is related to v_artisan_id
--     For claims that have NO artisan_id populated (old claim rows), we must
--     match via artisan_legacy_id. We join against artisans to confirm the
--     legacy_id truly refers to the same canonical v_artisan_id.
--     This prevents unrelated legacy_id strings from ever matching.
--
--   COMBINED: claims matching branch 1 OR branch 2 are superseded.
--
-- SAFETY: winner_claim_id is always excluded (id != winner_claim_id).
-- SAFETY: only status='pending' claims are superseded.
-- SAFETY: no unrelated artisan can be superseded (branch 2 joins artisans).
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._supersede_competing_claims(
  p_artisan_id     uuid,
  p_winner_claim   uuid,
  p_winner_legacy  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- BRANCH 1: Claims with artisan_id FK populated → match by canonical UUID
  UPDATE public.claim_requests
  SET status      = 'superseded_by_approval',
      reviewed_at = now()
  WHERE artisan_id = p_artisan_id
    AND id        != p_winner_claim
    AND status     = 'pending';

  -- BRANCH 2: Claims with artisan_id IS NULL but artisan_legacy_id set.
  -- Join artisans to verify the legacy_id actually maps to p_artisan_id.
  -- This prevents collateral supersession of unrelated legacy claims.
  UPDATE public.claim_requests cr
  SET status      = 'superseded_by_approval',
      reviewed_at = now()
  FROM public.artisans a
  WHERE cr.artisan_id       IS NULL
    AND cr.artisan_legacy_id IS NOT NULL
    AND cr.status            = 'pending'
    AND cr.id               != p_winner_claim
    AND (
      -- legacy_id matches artisan UUID string representation
      a.id::text      = cr.artisan_legacy_id
      OR
      -- legacy_id matches artisans.legacy_id column
      a.legacy_id     = cr.artisan_legacy_id
    )
    AND a.id = p_artisan_id;

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
      'ok',       true,
      'reason',   'already_rejected',
      'claim_id', p_claim_id
    );
  END IF;

  -- ── STEP 5: Already approved — cannot reject post-approval ─
  IF v_claim.status = 'approved' THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'reason',   'claim_already_approved',
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
    'ok',         true,
    'reason',     'rejected',
    'claim_id',   p_claim_id,
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

REVOKE EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)              FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)              TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)         FROM anon;
GRANT  EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)         TO service_role;

-- _supersede_competing_claims is an internal helper — no external EXECUTE
REVOKE EXECUTE ON FUNCTION public._supersede_competing_claims(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._supersede_competing_claims(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._supersede_competing_claims(uuid, uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public._supersede_competing_claims(uuid, uuid, text) TO service_role;

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
CREATE POLICY "7c12a1_deny_anon_all" ON public.claim_requests
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ── POLICY 2: authenticated — self-INSERT only ─────────────
CREATE POLICY "7c12a1_auth_insert_own" ON public.claim_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
  );

-- ── POLICY 3: authenticated — SELECT own claims + admin-all ─
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
-- All status mutations go through approve_artisan_claim() / reject_artisan_claim().

COMMIT;
