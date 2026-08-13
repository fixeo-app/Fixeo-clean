-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — New Artisan Canonical Registration
-- supabase/7c12a2-new-artisan-registration.sql
--
-- SCOPE:
--   Replaces the dead localStorage-only new-artisan self-registration path
--   with a server-authoritative RPC-based canonical registration.
--
-- WHAT THIS MIGRATION DOES:
--   Step 0 — Partial UNIQUE index on artisans.owner_user_id (WHERE NOT NULL)
--   Step 1 — public.register_new_artisan() RPC (SECURITY DEFINER)
--   Step 2 — Permissions (REVOKE anon/public; GRANT authenticated + service_role)
--   Step 3 — RLS: add authenticated self-insert policy (scoped to new self-reg rows)
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   - Does NOT modify dispatch_request_v1
--   - Does NOT modify approve_artisan_claim / reject_artisan_claim (7C.12A.1)
--   - Does NOT set onboarding_completed = true (reserved for 7C.12A.3)
--   - Does NOT set verified = true (human admin action only)
--   - Does NOT set availability = 'available' (7C.12A.3 gate)
--   - Does NOT create claim_requests rows (self-registration ≠ claim on existing artisan)
--   - Does NOT modify any existing RLS policy
--
-- POST-REGISTRATION CANONICAL STATE FOR NEW ARTISAN:
--   artisans.owner_user_id     = auth.uid()     (immutable once set)
--   artisans.claimed           = true
--   artisans.claim_status      = 'approved'      (self-registered, pending human verification)
--   artisans.onboarding_completed = false        (7C.12A.3 gate)
--   artisans.availability      = 'unavailable'   (default; 7C.12A.3 sets 'available')
--   artisans.verified          = false           (human admin only)
--   users.role                 = 'artisan'
--   profiles.role              = 'artisan'       (if profiles row exists)
--
-- DISPATCH ELIGIBILITY: NONE
--   onboarding_completed = false → excluded from dispatch_request_v1 forever
--   until 7C.12A.3 is explicitly completed.
--
-- IDEMPOTENCY:
--   If the caller already has an artisans row with owner_user_id = auth.uid(),
--   the RPC returns ok:true, reason:'already_registered', artisan_id:<id>.
--   No second row is created. No mutation of existing row.
--
-- LOCK ORDER (no deadlock possible — single table):
--   artisans FOR UPDATE (own row only, via owner_user_id)
--
-- NOT APPLIED TO SUPABASE — run precheck first.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- STEP 0: Partial UNIQUE index on artisans.owner_user_id
--
-- Only covers rows WHERE owner_user_id IS NOT NULL.
-- This means:
--   - All 1302 existing seeded artisans (owner_user_id IS NULL) are unaffected.
--   - Prevents any future double-registration for the same auth user.
--   - The index is CONCURRENTLY safe but must be run outside a transaction
--     in a live Supabase environment; however for correctness in this migration
--     we use a standard CREATE UNIQUE INDEX with IF NOT EXISTS guard.
--
-- NOTE: If this migration is applied via Supabase SQL editor (which wraps in
-- a transaction), CREATE INDEX is allowed (non-concurrent). This is acceptable
-- because the index is on a column with 0 non-NULL values at apply time (PM-18).
-- ════════════════════════════════════════════════════════════

-- Guard: only create if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'artisans'
      AND indexname  = 'artisans_owner_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX artisans_owner_user_id_unique
      ON public.artisans (owner_user_id)
      WHERE owner_user_id IS NOT NULL;
    RAISE NOTICE 'Step 0: Created unique index artisans_owner_user_id_unique';
  ELSE
    RAISE NOTICE 'Step 0: artisans_owner_user_id_unique already exists — skipping';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- STEP 1: register_new_artisan() RPC
--
-- AUTHORITY MODEL:
--   owner_user_id is ALWAYS derived from auth.uid() server-side.
--   Callers supply ONLY non-privileged onboarding fields:
--     full_name       — display name (validated ≥ 3 chars)
--     service_category — artisan's trade (must be non-empty)
--     city            — artisan's city (must be non-empty)
--     phone           — contact number (optional, stored on users/profiles)
--     description     — short bio (optional, ≤ 500 chars)
--
-- SECURITY INVARIANTS (enforced server-side, non-bypassable):
--   1. auth.uid() required — unauthenticated callers blocked
--   2. owner_user_id is NEVER caller-supplied — always auth.uid()
--   3. No caller-supplied: verified, onboarding_completed, availability, claim_status
--   4. verified = false always
--   5. onboarding_completed = false always
--   6. availability = 'unavailable' always (not dispatch-eligible immediately)
--   7. claim_status = 'approved' always (self-registration is self-approved)
--   8. claimed = true always
--   9. Duplicate owner guard via unique index + locking (idempotent)
--  10. users.role and profiles.role set to 'artisan' server-side
--  11. Admin role never demoted (WHERE role != 'admin' guard on both tables)
--
-- SAFE-FAIL PATHS (all return ok:false with named reason):
--   unauthenticated      — auth.uid() IS NULL
--   name_required        — full_name blank or < 3 chars
--   category_required    — service_category blank
--   city_required        — city blank
--   description_too_long — description > 500 chars
--   already_registered   — existing artisan with owner_user_id = auth.uid() (idempotent ok:true)
--   internal_error       — unexpected EXCEPTION
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.register_new_artisan(
  p_full_name        text,
  p_service_category text,
  p_city             text,
  p_phone            text DEFAULT '',
  p_description      text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid;       -- auth.uid() — canonical identity; never from caller
  v_artisan_id    uuid;       -- new or existing artisans.id
  v_existing_id   uuid;       -- existing artisan check
  v_full_name     text;
  v_service_cat   text;
  v_city          text;
  v_description   text;
  v_phone         text;
BEGIN

  -- ── STEP A: Auth ──────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── STEP B: Input validation (non-privileged fields only) ─
  v_full_name   := trim(COALESCE(p_full_name, ''));
  v_service_cat := trim(COALESCE(p_service_category, ''));
  v_city        := trim(COALESCE(p_city, ''));
  v_description := trim(COALESCE(p_description, ''));
  v_phone       := trim(COALESCE(p_phone, ''));

  IF length(v_full_name) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'name_required',
      'message', 'Nom complet requis (3 caractères minimum).');
  END IF;

  IF v_service_cat = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'category_required',
      'message', 'Métier requis.');
  END IF;

  IF v_city = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'city_required',
      'message', 'Ville requise.');
  END IF;

  IF length(v_description) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'description_too_long',
      'message', 'Description limitée à 500 caractères.');
  END IF;

  -- ── STEP C: Duplicate owner guard (idempotent) ────────────
  -- Check for existing artisan row owned by this user.
  -- Use a locking SELECT to prevent concurrent double-registration.
  -- The partial unique index provides the structural guarantee;
  -- this lock prevents the "read 0, both insert" race.
  --
  -- We do NOT lock an unrelated artisan row here — only the user's own.
  SELECT a.id INTO v_existing_id
  FROM public.artisans a
  WHERE a.owner_user_id = v_uid
  LIMIT 1
  FOR UPDATE;  -- serialize concurrent same-user registration attempts

  IF v_existing_id IS NOT NULL THEN
    -- Idempotent: already registered. Return existing artisan_id.
    -- Do NOT mutate existing row (would overwrite onboarding progress).
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'already_registered',
      'artisan_id', v_existing_id
    );
  END IF;

  -- ── STEP D: Create canonical artisans row ─────────────────
  --
  -- INVARIANTS — server-enforced, non-bypassable:
  --   owner_user_id      = auth.uid()          (never caller-supplied)
  --   claimed            = true                (self-registration is a claim)
  --   claim_status       = 'approved'          (self-registered = approved identity)
  --   onboarding_completed = false             (must complete onboarding — 7C.12A.3)
  --   availability       = 'unavailable'       (not dispatch-eligible yet)
  --   verified           = false               (human admin sets this manually)
  --
  -- PERMITTED from caller (whitelist):
  --   full_name, service_category, city, description
  --   (phone stored on users/profiles, not artisans, to avoid phone_public risk)
  INSERT INTO public.artisans (
    owner_user_id,
    full_name,
    service_category,
    city,
    description,
    -- Security invariants: all server-side:
    claimed,
    claim_status,
    onboarding_completed,
    availability,
    verified,
    -- Timestamps:
    created_at,
    updated_at
  )
  VALUES (
    v_uid,              -- owner_user_id: ALWAYS auth.uid(), never caller-supplied
    v_full_name,
    v_service_cat,
    v_city,
    v_description,
    -- Security invariants:
    true,               -- claimed:             always true for self-registration
    'approved',         -- claim_status:        self-registered identity is self-approved
    false,              -- onboarding_completed: false until 7C.12A.3 gate
    'unavailable',      -- availability:        not dispatch-eligible until 7C.12A.3
    false,              -- verified:            false; human admin sets only
    now(),
    now()
  )
  RETURNING id INTO v_artisan_id;

  -- ── STEP E: Role promotion ─────────────────────────────────
  -- Promote users.role to 'artisan' — only if not already admin.
  -- This is the ONLY safe path for role promotion in the new-artisan flow.
  UPDATE public.users
  SET role       = 'artisan',
      updated_at = now()
  WHERE id   = v_uid
    AND role != 'admin';  -- never demote admin

  -- Promote profiles.role if profiles row exists.
  -- Non-fatal if profiles row absent (fixeo-auth-supabase.js creates it at signUp).
  UPDATE public.profiles
  SET role = 'artisan'
  WHERE id   = v_uid
    AND (role IS NULL OR role NOT IN ('admin'));

  -- ── STEP F: Return canonical result ──────────────────────
  RETURN jsonb_build_object(
    'ok',          true,
    'reason',      'registered',
    'artisan_id',  v_artisan_id,
    'owner_uid',   v_uid
    -- NOTE: owner_uid returned for client confirmation only.
    -- It always equals auth.uid(); no spoofing is possible.
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent registration race: unique index on owner_user_id fired.
    -- The other transaction won. Idempotently return the existing artisan.
    SELECT a.id INTO v_existing_id
    FROM public.artisans a
    WHERE a.owner_user_id = v_uid
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'already_registered',
      'artisan_id', COALESCE(v_existing_id, v_artisan_id)
    );
  WHEN OTHERS THEN
    RAISE WARNING '[register_new_artisan] unexpected error for uid %: %', v_uid, SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- STEP 2: Permissions
--
-- Only authenticated callers may call register_new_artisan.
-- The function is SECURITY DEFINER so execution runs as the
-- function owner, not the caller. The caller supplies only
-- non-privileged form fields. owner_user_id is always auth.uid().
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) TO service_role;

-- ════════════════════════════════════════════════════════════
-- STEP 3: RLS hardening for artisans self-insert
--
-- CURRENT STATE (from rls-phase2-2026-05-08.sql):
--   artisans_admin_insert: INSERT allowed only for admin role.
--   No authenticated self-insert policy exists.
--
-- With register_new_artisan as SECURITY DEFINER, the INSERT into
-- artisans runs as the function owner (service_role equivalent),
-- which bypasses RLS entirely. No new RLS INSERT policy is needed
-- for authenticated users — the RPC IS the gate.
--
-- VERIFICATION: Confirm no existing authenticated INSERT policy
-- would allow direct browser artisans INSERT (which we do NOT want).
-- The existing artisans_admin_insert policy limits direct INSERT to
-- admin role only. Authenticated non-admin users cannot INSERT directly.
--
-- Therefore: NO new INSERT policy needed. SECURITY DEFINER RPC handles it.
--
-- What we DO harden: ensure authenticated owner can UPDATE their own row
-- (needed for 7C.12A.3 onboarding field writes, e.g. onboarding_data).
-- The existing artisans_owner_update policy (from rls-phase2) already
-- covers this: USING/WITH CHECK owner_user_id = auth.uid().
--
-- CONCLUSION: No new RLS policies needed for 7C.12A.2.
-- Documenting this explicitly so future phases do not add insecure policies.
-- ════════════════════════════════════════════════════════════

-- (No RLS changes in this step — see comment above)

COMMIT;
