-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Foundation (Final Hardened v4)
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
-- DEADLOCK-FREE CONCURRENCY MODEL (7C.12A.1 v4 — CROSS-RPC):
--
-- PREVIOUS ORDER (c8e40e9) — INTRA-RPC DEADLOCK RISK:
--   Tx A: lock claim_A → lock artisan → UPDATE claim_B (blocked by Tx B)
--   Tx B: lock claim_B → wait for artisan (blocked by Tx A)
--   => Circular wait: A holds artisan, waits for B's claim_B; B holds claim_B,
--      waits for A's artisan. => DEADLOCK.
--
-- PREVIOUS ORDER (4f6e5fa) — CROSS-RPC DEADLOCK RISK:
--   approve_artisan_claim: pre-read → ARTISAN FOR UPDATE → CLAIM FOR UPDATE
--   reject_artisan_claim:  CLAIM FOR UPDATE → UPDATE ARTISAN (no artisan lock)
--
--   Tx A (approve): pre-read → locks ARTISAN → waits for CLAIM
--   Tx B (reject):  locks CLAIM → attempts UPDATE ARTISAN
--   => Tx A holds artisan, waits for claim. Tx B holds claim, waits for artisan.
--   => CROSS-RPC DEADLOCK.
--
-- NEW ORDER (v4) — PROVABLY DEADLOCK-FREE ACROSS ALL RPCs:
--   ALL RPCs touching both artisans and claim_requests use the same global order:
--     1. NON-LOCKING claim pre-read — resolve artisan_id only (no FOR UPDATE yet)
--     2. ARTISAN FOR UPDATE — global ordering point (both approve AND reject)
--     3. TARGET CLAIM FOR UPDATE — after artisan lock held (both approve AND reject)
--     4. Re-validate claim status under claim lock
--     5. Mutate — only under both locks
--
--   Why cross-RPC deadlock is impossible:
--   - ALL transactions touching both tables (approve or reject) contend at
--     the artisan FOR UPDATE (step 2). This is the single global ordering point.
--   - No transaction can hold a claim lock before acquiring the artisan lock.
--   - No circular wait can form: artisan always precedes claim in ALL code paths.
--
--   REJECT UNRESOLVED ARTISAN: If the claim does not resolve to any artisan UUID,
--   reject acquires NO artisan lock (nothing to lock) and proceeds with claim-only
--   mutation. Since no artisan row is involved, no cross-lock conflict is possible.
--   This is documented explicitly at the lock-acquisition point in the RPC.
--
-- CLAIM PRE-READ (step 1) — non-locking, safe (BOTH RPCs):
--   We need artisan_id to acquire the artisan lock. We read the claim
--   without FOR UPDATE to get artisan identity, then re-lock with
--   FOR UPDATE after artisan is held. All critical business logic
--   (status check, requester check, terminal-state checks) is performed
--   ONLY on the re-locked claim read — never on the pre-read snapshot.
--   Both approve_artisan_claim and reject_artisan_claim follow this model.
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

    -- EXACT BASELINE VERIFICATION (v4 hardening):
    --
    -- Substring presence alone is NOT sufficient. A constraint containing
    -- ('pending','approved','rejected','unexpected_value') would pass a
    -- substring check yet silently drop a legitimate unexpected status contract.
    --
    -- Strategy: extract all quoted string literals from the constraint definition
    -- and compare the exact set against the two known-good sets:
    --   BASELINE_3:  {'pending','approved','rejected'}
    --   TARGET_4:    {'pending','approved','rejected','superseded_by_approval'}
    --
    -- Any other set → HARD STOP. No silent destruction of unknown contracts.
    --
    -- Implementation: use regexp_matches to pull all single-quoted string values
    -- from the pg_get_constraintdef() output, then count exact matches.
    DECLARE
      v_vals          text[];
      v_val_count     integer;
      v_has_pending   boolean := false;
      v_has_approved  boolean := false;
      v_has_rejected  boolean := false;
      v_has_supersede boolean := false;
      v_has_other     boolean := false;
      v_val           text;
    BEGIN
      -- Extract all 'value' literals from the constraint definition
      SELECT array_agg(m[1]) INTO v_vals
      FROM regexp_matches(v_con_def, '''([^'']+)''', 'g') AS m;

      v_val_count := COALESCE(array_length(v_vals, 1), 0);

      -- Categorize each extracted value
      FOREACH v_val IN ARRAY COALESCE(v_vals, ARRAY[]::text[])
      LOOP
        CASE v_val
          WHEN 'pending'               THEN v_has_pending   := true;
          WHEN 'approved'              THEN v_has_approved  := true;
          WHEN 'rejected'              THEN v_has_rejected  := true;
          WHEN 'superseded_by_approval' THEN v_has_supersede := true;
          ELSE v_has_other := true;
        END CASE;
      END LOOP;

      IF v_has_other THEN
        -- Unexpected value present — HARD STOP. Do not silently destroy contract.
        RAISE EXCEPTION 'Step 0b HARD STOP: claims_status_check contains unexpected allowed value(s) beyond the known set. Definition: [%]. Values found: [%]. Manual review required before applying this migration.', v_con_def, v_vals;
      ELSIF v_has_pending AND v_has_approved AND v_has_rejected AND v_has_supersede AND v_val_count = 4 THEN
        -- Already exactly the 4-value target set — idempotent, nothing to do
        RAISE NOTICE 'Step 0b: claims_status_check already exactly matches 4-value target set — no change';
        v_baseline_ok := false; -- prevents the ALTER below
      ELSIF v_has_pending AND v_has_approved AND v_has_rejected AND NOT v_has_supersede AND v_val_count = 3 THEN
        -- Exactly the 3-value baseline — safe to extend
        v_baseline_ok := true;
      ELSE
        -- Some other combination (missing values, extra values, partial set) — HARD STOP
        RAISE EXCEPTION 'Step 0b HARD STOP: claims_status_check does not match any known-good baseline. Definition: [%]. Values found: [%] (count=%). Manual review required.', v_con_def, v_vals, v_val_count;
      END IF;
    END;

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
-- LOCK ORDER (v4 — matches approve_artisan_claim):
--   PRE-READ  — non-locking claim read to resolve artisan_id only
--   LOCK A    — ARTISAN FOR UPDATE (global ordering point; same as approve)
--   LOCK B    — CLAIM FOR UPDATE (after artisan lock held)
--   REVALIDATE — all terminal-state checks on re-locked claim
--   MUTATE    — only under both locks
--
-- WHY ARTISAN LOCK FIRST:
--   approve_artisan_claim acquires ARTISAN then CLAIM.
--   A concurrent reject that acquired CLAIM first (old order) could hold
--   claim while waiting for artisan that approve holds → cross-RPC deadlock.
--   With the new order, ALL RPCs touching both tables block at ARTISAN.
--   Only one proceeds. No circular wait is possible.
--
-- UNRESOLVED ARTISAN (no artisan FK and no legacy_id match):
--   If the claim references no artisan, there is no artisan row to lock.
--   In this case:
--   - No LOCK A is acquired (nothing to lock).
--   - No cross-table conflict is possible (no artisan row involved).
--   - Claim-only mutation (LOCK B only) is safe and correct.
--   - This path is explicitly documented at the lock-acquisition point.
--
-- REJECTION NEVER TOUCHES:
--   artisans.owner_user_id
--   artisans.onboarding_completed
--   artisans.verified
--   artisans.availability
--
-- IDEMPOTENCY:
--   already_rejected → PASS (ok:true, no mutation)
--
-- TERMINAL STATE GUARDS (no mutation on any terminal state):
--   claim_already_approved    → FAIL ok:false (approved is terminal)
--   claim_superseded          → FAIL ok:false (superseded_by_approval is terminal)
--
-- CANONICAL TERMINAL STATES (none may be converted to another):
--   approved               → terminal
--   rejected               → terminal
--   superseded_by_approval → terminal
--
-- SAFE-FAIL paths:
--   unauthenticated          — auth.uid() IS NULL
--   not_admin                — caller users.role != 'admin'
--   claim_not_found_preread  — p_claim_id missing at pre-read
--   artisan_not_found        — artisan resolution exhausted; no lock; claim-only path
--   claim_not_found_locked   — p_claim_id missing after re-lock
--   already_rejected         — idempotent ok:true
--   claim_already_approved   — approved is terminal, ok:false
--   claim_superseded         — superseded_by_approval is terminal, ok:false
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
  v_pre          record;   -- non-locking pre-read of claim
  v_claim        record;   -- locked re-read of claim
  v_artisan_id   uuid;     -- resolved canonical artisan UUID (may be NULL)
BEGIN

  -- ── AUTH 1: Identify caller ────────────────────────────────
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── AUTH 2: Verify admin role from DB ─────────────────────
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = v_caller_uid;

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- PRE-READ: read claim WITHOUT FOR UPDATE — purpose: resolve
  -- artisan_id only so we can acquire the artisan lock FIRST.
  -- DO NOT make terminal-state decisions from this snapshot.
  -- All business logic (status checks) run on the re-locked v_claim.
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_pre
  FROM public.claim_requests
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found_preread');
  END IF;

  -- ── RESOLVE artisan UUID from pre-read (no lock yet) ──────
  -- Purpose: identify the artisan row to lock BEFORE acquiring claim lock.
  -- Mirrors approve_artisan_claim resolution logic exactly.
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

  -- ══════════════════════════════════════════════════════════════
  -- LOCK A: Acquire ARTISAN row FOR UPDATE — GLOBAL ORDERING POINT.
  --
  -- This is the same ordering point used by approve_artisan_claim.
  -- All RPCs touching both artisans and claim_requests must acquire
  -- the artisan lock FIRST. This prevents cross-RPC circular waits.
  --
  -- UNRESOLVED ARTISAN: If v_artisan_id IS NULL, the claim does not
  -- reference a known artisan. There is no artisan row to lock.
  -- Rationale: no artisan row involved → no cross-table conflict possible.
  -- We proceed without LOCK A and acquire LOCK B (claim) only.
  -- This is the only safe exception to the artisan-first rule.
  -- ══════════════════════════════════════════════════════════════
  IF v_artisan_id IS NOT NULL THEN
    -- LOCK A: artisan FOR UPDATE (deadlock-safe global ordering point)
    PERFORM a.id
    FROM public.artisans a
    WHERE a.id = v_artisan_id
    FOR UPDATE;
  ELSE
    -- No artisan resolved: no LOCK A needed or possible.
    -- Claim-only mutation path: LOCK B will be the only lock acquired.
    -- No circular wait risk since no artisan row is involved.
    RAISE NOTICE '[reject_artisan_claim] artisan_not_found: claim % references no resolvable artisan — proceeding with claim-only lock path', p_claim_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- LOCK B: Acquire TARGET CLAIM row FOR UPDATE — after artisan lock.
  --
  -- Re-read and re-validate all critical fields under lock.
  -- The claim status may have changed between pre-read and here
  -- (e.g. concurrent approve won the artisan lock first, superseded
  -- this claim, then released). Re-validate before any mutation.
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_claim
  FROM public.claim_requests
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found_locked');
  END IF;

  -- ── TERMINAL STATE GUARDS (all checked on locked v_claim) ──

  -- STEP 4: Already rejected — idempotent ok:true
  IF v_claim.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok',       true,
      'reason',   'already_rejected',
      'claim_id', p_claim_id
    );
  END IF;

  -- STEP 5: Already approved — approved is terminal, cannot reject
  IF v_claim.status = 'approved' THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'reason',   'claim_already_approved',
      'claim_id', p_claim_id
    );
  END IF;

  -- STEP 5b: Superseded — superseded_by_approval is terminal, immutable.
  -- Written by approve_artisan_claim(). Must never be converted to 'rejected'.
  -- No mutation to claim row, artisan row, reviewed_at, or notes.
  IF v_claim.status = 'superseded_by_approval' THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'reason',   'claim_superseded',
      'claim_id', p_claim_id
    );
  END IF;

  -- ── STEP 6 (only path remaining: status = 'pending') ───────
  -- Mutate artisan — reset claim_status if artisan was resolved.
  -- Absorbed from removed sync_artisan_claim trigger.
  -- artisans.claim_status reset to 'unclaimed' so artisan is re-claimable.
  -- artisans.owner_user_id is NEVER touched by rejection.
  -- WHERE owner_user_id IS NULL: never reset a claimed artisan.
  IF v_artisan_id IS NOT NULL THEN
    UPDATE public.artisans
    SET claim_status = 'unclaimed',
        updated_at   = now()
        -- owner_user_id:        intentionally NOT SET (7C.12A.1)
        -- onboarding_completed: intentionally NOT SET (7C.12A.1)
        -- verified:             intentionally NOT SET (7C.12A.1)
        -- availability:         intentionally NOT SET (7C.12A.1)
    WHERE id = v_artisan_id
      AND owner_user_id IS NULL;
  END IF;

  -- ── STEP 7: Mark claim rejected (under LOCK B) ────────────
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
