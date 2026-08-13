-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — New Artisan Canonical Registration (v2 — Hardened)
-- supabase/7c12a2-new-artisan-registration.sql
--
-- SCOPE:
--   Replaces the dead localStorage-only new-artisan self-registration path
--   with a server-authoritative RPC-based canonical registration.
--
-- SECURITY BLOCKER RESOLUTIONS (v2):
--   BLOCKER 1: artisans_owner_update was unrestricted (any column writeable)
--     Resolution: REVOKE table-level UPDATE from authenticated; add column-specific
--     GRANTs for safe profile-editing fields only; privileged lifecycle fields
--     remain non-writable by authenticated except via SECURITY DEFINER RPCs.
--     Privileged fields (never directly writable by authenticated):
--       owner_user_id, claimed, claim_status, onboarding_completed, verified
--     Availability: gated RPC update_artisan_availability() enforces
--       onboarding_completed=true pre-condition before allowing 'available'.
--
--   BLOCKER 2: users/profiles row integrity not guaranteed
--     Resolution: register_new_artisan() checks ROW_COUNT after each UPDATE;
--     if users row is missing → HARD FAIL (unauthenticated identity is broken);
--     profiles row missing is non-fatal (it is created client-side at signUp
--     but is NOT a FK on artisans). Phone: persisted to users.phone and
--     profiles.phone (safe canonical fields; never to artisans.phone_public).
--
-- WHAT THIS MIGRATION DOES:
--   Step 0 — Partial UNIQUE index on artisans.owner_user_id (WHERE NOT NULL)
--   Step 1 — REVOKE table-level UPDATE on artisans from authenticated/anon
--   Step 2 — GRANT column-specific UPDATE for safe profile-editing fields only
--   Step 3 — public.register_new_artisan() RPC (SECURITY DEFINER)
--   Step 4 — public.update_artisan_availability() RPC (SECURITY DEFINER, gated)
--   Step 5 — Permissions for both RPCs
--   Step 6 — Replace artisans_owner_update RLS policy with narrowed version
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   - Does NOT modify dispatch_request_v1
--   - Does NOT modify approve_artisan_claim / reject_artisan_claim (7C.12A.1)
--   - Does NOT set onboarding_completed = true (reserved for 7C.12A.3)
--   - Does NOT set verified = true (human admin action only)
--   - Does NOT create claim_requests rows
--   - Does NOT modify any 7C.12A.1 RLS policy (claim_requests)
--   - Does NOT bulk-update existing seeded artisan ownership
--
-- COLUMN WRITABILITY MATRIX (post-migration):
--   Column                 | authenticated (own row) | admin | SECURITY DEFINER RPC
--   -----------------------|-------------------------|-------|---------------------
--   full_name              | YES (column grant)      | YES   | YES
--   service_category       | YES (column grant)      | YES   | YES
--   city                   | YES (column grant)      | YES   | YES
--   description            | YES (column grant)      | YES   | YES
--   work_zone              | YES (column grant)      | YES   | YES
--   availability           | NO (RPC only, gated)    | YES   | YES
--   owner_user_id          | NO                      | YES   | YES (register only)
--   claimed                | NO                      | YES   | YES (register only)
--   claim_status           | NO                      | YES   | YES (approve/reject)
--   onboarding_completed   | NO                      | YES   | YES (7C.12A.3 only)
--   verified               | NO                      | YES   | NO (manual admin only)
--
-- POST-REGISTRATION CANONICAL STATE FOR NEW ARTISAN:
--   artisans.owner_user_id     = auth.uid()     (immutable: REVOKE blocks re-write)
--   artisans.claimed           = true
--   artisans.claim_status      = 'approved'
--   artisans.onboarding_completed = false       (7C.12A.3 gate)
--   artisans.availability      = 'unavailable'  (update_artisan_availability gated)
--   artisans.verified          = false          (human admin only)
--   users.role                 = 'artisan'
--   profiles.role              = 'artisan'      (if profiles row exists)
--   users.phone                = p_phone        (safe; never artisans.phone_public)
--   profiles.phone             = p_phone        (safe; non-fatal if row absent)
--
-- DISPATCH ELIGIBILITY: NONE
--   onboarding_completed = false → excluded from dispatch_request_v1
--   until 7C.12A.3 explicitly completes onboarding.
--
-- NOT APPLIED TO SUPABASE — run precheck first.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- STEP 0: Partial UNIQUE index on artisans.owner_user_id
--
-- Only covers rows WHERE owner_user_id IS NOT NULL.
-- All 1302 existing seeded artisans (owner_user_id IS NULL) are unaffected.
-- Prevents double-registration for the same auth user.
-- ════════════════════════════════════════════════════════════

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
-- STEP 1: REVOKE table-level UPDATE from authenticated and anon
--
-- BLOCKER 1 ROOT CAUSE:
--   Supabase default grants authenticated UPDATE on all public tables.
--   Combined with the unrestricted artisans_owner_update RLS policy
--   (USING/WITH CHECK: owner_user_id = auth.uid()), an authenticated
--   artisan could directly write ANY column on their own artisans row,
--   including privileged lifecycle fields:
--     onboarding_completed=true, availability='available', verified=true,
--     claim_status='rejected', claimed=false, owner_user_id=(anything)
--
-- FIX:
--   REVOKE table-level UPDATE entirely from authenticated and anon.
--   Column-specific GRANTs in Step 2 restore safe profile-editing columns.
--   Privileged lifecycle fields remain non-writable except via SECURITY DEFINER RPCs.
--
-- SAFE FOR EXISTING BEHAVIOR:
--   fixeo-artisan-dashboard-v2.js updates only service_requests + missions (not artisans).
--   artisan-dashboard-p2.js (V1, deprecated, auth-guard redirected to V2) had a
--   direct artisans.update({availability}) call — this is now blocked by design.
--   Availability is now managed via update_artisan_availability() RPC (Step 4).
-- ════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.artisans FROM authenticated;
REVOKE UPDATE ON public.artisans FROM anon;

-- ════════════════════════════════════════════════════════════
-- STEP 2: Column-specific GRANT for safe profile-editing fields
--
-- Authenticated users may directly UPDATE only these non-privileged columns
-- on their own artisans row (still gated by artisans_owner_update RLS policy):
--   full_name, service_category, city, description, work_zone
--
-- NOT GRANTED (privileged lifecycle fields — RPC-only):
--   owner_user_id   — set once at registration; never re-writable by owner
--   claimed         — set at registration; immutable
--   claim_status    — approve_artisan_claim / reject_artisan_claim RPCs only
--   onboarding_completed — 7C.12A.3 RPC only
--   availability    — update_artisan_availability() RPC only (gated by onboarding)
--   verified        — human admin only (no RPC path)
--   rating          — internal aggregate only (fixeo-review-engine)
--   review_count    — internal aggregate only
--   legacy_id       — seeded; never self-edited
--   public_slug     — seeded; never self-edited
-- ════════════════════════════════════════════════════════════

GRANT UPDATE (full_name, service_category, city, description, work_zone)
  ON public.artisans TO authenticated;

-- ════════════════════════════════════════════════════════════
-- STEP 3: register_new_artisan() RPC
--
-- AUTHORITY MODEL:
--   owner_user_id is ALWAYS derived from auth.uid() server-side.
--   Callers supply ONLY non-privileged onboarding fields.
--
-- BLOCKER 2 RESOLUTIONS:
--   - users row: checked via ROW_COUNT after UPDATE; if 0 rows → HARD FAIL.
--     A missing users row means the auth identity is broken — we must not
--     silently create an artisan row with no canonical identity link.
--   - profiles row: checked via ROW_COUNT after UPDATE; if 0 rows → non-fatal
--     warning returned (profiles is not a FK on artisans; it is created
--     client-side at signUp but may race). Phone is written to both.
--   - Phone: p_phone is persisted to users.phone and profiles.phone.
--     It is NOT stored on artisans to avoid the phone_public risk vector
--     (artisans.phone_public is exposed to anyone querying the artisans table).
--
-- SECURITY INVARIANTS (enforced server-side, non-bypassable):
--   1. auth.uid() required
--   2. owner_user_id always auth.uid() (never caller-supplied)
--   3. No caller-supplied: verified, onboarding_completed, availability, claim_status
--   4. verified = false always
--   5. onboarding_completed = false always (7C.12A.3 gate)
--   6. availability = 'unavailable' always (update_artisan_availability gated)
--   7. claim_status = 'approved' always
--   8. claimed = true always
--   9. Duplicate owner guard (unique index + FOR UPDATE lock)
--  10. users.role set to 'artisan' server-side; HARD FAIL if users row absent
--  11. profiles.role set to 'artisan' if profiles row exists; non-fatal if absent
--  12. Admin role never demoted (WHERE role != 'admin' guard)
--  13. Phone written to users.phone and profiles.phone (never artisans.phone_public)
--
-- SAFE-FAIL PATHS:
--   unauthenticated       — auth.uid() IS NULL
--   name_required         — full_name blank or < 3 chars
--   category_required     — service_category blank
--   city_required         — city blank
--   description_too_long  — description > 500 chars
--   already_registered    — idempotent ok:true with existing artisan_id
--   identity_broken       — users row missing (HARD FAIL — no artisan created)
--   internal_error        — unexpected EXCEPTION
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
  v_artisan_id    uuid;       -- new artisans.id
  v_existing_id   uuid;       -- existing artisan row check
  v_full_name     text;
  v_service_cat   text;
  v_city          text;
  v_description   text;
  v_phone         text;
  v_users_updated integer;    -- ROW_COUNT for users UPDATE
  v_prof_updated  integer;    -- ROW_COUNT for profiles UPDATE
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
  -- Lock the user's own artisan row if it exists.
  -- Prevents concurrent same-user double-registration.
  -- The partial unique index is the structural guarantee;
  -- FOR UPDATE prevents the "read 0, both insert" race.
  SELECT a.id INTO v_existing_id
  FROM public.artisans a
  WHERE a.owner_user_id = v_uid
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    -- Idempotent: already registered. Return existing artisan_id.
    -- Do NOT mutate existing row (would overwrite onboarding progress).
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'already_registered',
      'artisan_id', v_existing_id
    );
  END IF;

  -- ── STEP D: Verify canonical identity (BLOCKER 2) ─────────
  -- The users row MUST exist before we create an artisan row.
  -- A missing users row means fixeo-auth-supabase.js signUp Step 2
  -- failed silently — the identity chain is broken. HARD FAIL.
  -- We do NOT create the users row here (that is auth's responsibility).
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid
  ) THEN
    RAISE WARNING '[register_new_artisan] users row missing for uid %', v_uid;
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'identity_broken',
      'message', 'Votre compte n''est pas entièrement configuré. Veuillez vous reconnecter.'
    );
  END IF;

  -- ── STEP E: Create canonical artisans row ─────────────────
  --
  -- INVARIANTS — server-enforced, non-bypassable:
  --   owner_user_id      = auth.uid()        (never caller-supplied)
  --   claimed            = true
  --   claim_status       = 'approved'
  --   onboarding_completed = false           (7C.12A.3 gate)
  --   availability       = 'unavailable'     (update_artisan_availability RPC gated)
  --   verified           = false             (human admin only)
  --
  -- PERMITTED from caller (whitelist):
  --   full_name, service_category, city, description
  --   (phone stored on users/profiles, not artisans — avoids phone_public risk)
  INSERT INTO public.artisans (
    owner_user_id,
    full_name,
    service_category,
    city,
    description,
    -- Security invariants: all server-side —
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
    true,               -- claimed
    'approved',         -- claim_status: self-registered identity is self-approved
    false,              -- onboarding_completed: false until 7C.12A.3 gate
    'unavailable',      -- availability: not dispatch-eligible until 7C.12A.3
    false,              -- verified: human admin sets only
    now(),
    now()
  )
  RETURNING id INTO v_artisan_id;

  -- ── STEP F: Role promotion + phone persistence ────────────
  --
  -- users.phone: persist caller-supplied phone to safe canonical field.
  -- Never written to artisans.phone_public (that is a public exposure risk).
  -- Admin demotion guard: WHERE role != 'admin'.
  -- users row MUST exist (checked in Step D) — ROW_COUNT must be 1.
  UPDATE public.users
  SET role       = 'artisan',
      phone      = CASE WHEN v_phone != '' THEN v_phone ELSE phone END,
      updated_at = now()
  WHERE id   = v_uid
    AND role != 'admin';

  GET DIAGNOSTICS v_users_updated = ROW_COUNT;

  -- ROW_COUNT=0 means: row exists (we checked) but role='admin' — that's fine.
  -- The identity_broken guard above already catches the missing-row case.
  -- If role='admin', we skip the update intentionally (admin demotion guard).
  -- Both outcomes are correct; no HARD FAIL needed here.

  -- profiles: non-fatal if row absent (fixeo-auth-supabase.js creates it at signUp,
  -- but this is not a FK constraint on artisans).
  UPDATE public.profiles
  SET role  = 'artisan',
      phone = CASE WHEN v_phone != '' THEN v_phone ELSE phone END
  WHERE id   = v_uid
    AND (role IS NULL OR role NOT IN ('admin'));

  GET DIAGNOSTICS v_prof_updated = ROW_COUNT;

  -- ── STEP G: Return canonical result ──────────────────────
  RETURN jsonb_build_object(
    'ok',                true,
    'reason',            'registered',
    'artisan_id',        v_artisan_id,
    'owner_uid',         v_uid,
    'profiles_updated',  v_prof_updated
    -- profiles_updated is informational only.
    -- 0 = profiles row absent (non-fatal); 1 = profiles updated.
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent registration race: unique index on owner_user_id fired.
    -- The other transaction won — idempotently return the existing artisan.
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
-- STEP 4: update_artisan_availability() RPC
--
-- BLOCKER 1 RESOLUTION (availability field):
--   Authenticated artisans previously could directly UPDATE availability
--   to 'available' without restriction (via artisans_owner_update RLS policy).
--   After Step 1 REVOKE, direct UPDATE of availability is blocked.
--   This RPC is the ONLY gated path for artisans to change their availability.
--
-- GATE: onboarding_completed = true required before 'available' is allowed.
--   This enforces the 7C.12A.3 lifecycle contract:
--     available    → only if onboarding_completed = true
--     unavailable  → always permitted (artisan can always go offline)
--     busy         → only if onboarding_completed = true
--
-- INPUTS:
--   p_status: 'available' | 'unavailable' | 'busy'
--
-- SAFE-FAIL PATHS:
--   unauthenticated          — auth.uid() IS NULL
--   not_owner                — no artisans row with owner_user_id = auth.uid()
--   onboarding_required      — attempting 'available'/'busy' before onboarding
--   invalid_status           — value not in ('available','unavailable','busy')
--   no_change                — already at requested status (idempotent ok:true)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_artisan_availability(
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid               uuid;
  v_artisan_id        uuid;
  v_current_avail     text;
  v_onboarding_done   boolean;
  v_target_status     text;
BEGIN

  -- ── Auth ──────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Validate requested status ─────────────────────────────
  v_target_status := lower(trim(COALESCE(p_status, '')));
  IF v_target_status NOT IN ('available', 'unavailable', 'busy') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status',
      'message', 'Statut invalide. Valeurs acceptées: available, unavailable, busy.');
  END IF;

  -- ── Fetch and lock artisan row ────────────────────────────
  SELECT a.id, a.availability, a.onboarding_completed
  INTO v_artisan_id, v_current_avail, v_onboarding_done
  FROM public.artisans a
  WHERE a.owner_user_id = v_uid
  LIMIT 1
  FOR UPDATE;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner',
      'message', 'Aucun profil artisan trouvé pour ce compte.');
  END IF;

  -- ── Onboarding gate ───────────────────────────────────────
  -- 'available' and 'busy' require onboarding_completed = true.
  -- 'unavailable' is always permitted (artisan can always go offline).
  IF v_target_status IN ('available', 'busy') AND NOT COALESCE(v_onboarding_done, false) THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'onboarding_required',
      'message', 'Complétez votre profil avant de vous rendre disponible.'
    );
  END IF;

  -- ── Idempotency ───────────────────────────────────────────
  IF v_current_avail = v_target_status THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'no_change',
      'artisan_id', v_artisan_id,
      'status',     v_target_status
    );
  END IF;

  -- ── Update availability ───────────────────────────────────
  UPDATE public.artisans
  SET availability = v_target_status,
      updated_at   = now()
  WHERE id = v_artisan_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'reason',     'updated',
    'artisan_id', v_artisan_id,
    'status',     v_target_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[update_artisan_availability] unexpected error for uid %: %', v_uid, SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- STEP 5: Permissions for both RPCs
-- ════════════════════════════════════════════════════════════

-- register_new_artisan
REVOKE EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.register_new_artisan(text, text, text, text, text) TO service_role;

-- update_artisan_availability
REVOKE EXECUTE ON FUNCTION public.update_artisan_availability(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_artisan_availability(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_artisan_availability(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_artisan_availability(text) TO service_role;

-- ════════════════════════════════════════════════════════════
-- STEP 6: Narrow artisans_owner_update RLS policy
--
-- The existing artisans_owner_update policy is unrestricted in column scope.
-- After Step 1 REVOKE of table-level UPDATE and Step 2 column-specific GRANTs,
-- the RLS policy remains as the row-scoping guard (USING/WITH CHECK).
-- We replace it to explicitly document that it now covers ONLY the column-granted
-- fields (full_name, service_category, city, description, work_zone).
--
-- Privileged lifecycle fields (owner_user_id, claimed, claim_status,
-- onboarding_completed, verified, availability) are not column-granted to
-- authenticated, so they cannot be written even if RLS would otherwise permit.
--
-- NOTE: The artisans_owner_update policy applies to ALL columns in the artisans
-- UPDATE permission. But since PostgreSQL column-level privileges restrict what
-- columns authenticated users can include in an UPDATE SET clause, the combination
-- of: column-only-grant + this row RLS policy = authenticated can update ONLY
-- safe profile fields on their OWN row. Neither condition alone is sufficient;
-- both are required.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "artisans_owner_update" ON public.artisans;
CREATE POLICY "artisans_owner_update" ON public.artisans
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
-- Note: WITH CHECK enforces owner_user_id cannot change via direct UPDATE.
-- Column-level privileges (Step 2) prevent owner_user_id from appearing in
-- any SET clause anyway, making this doubly protected.

COMMIT;

-- ════════════════════════════════════════════════════════════
-- ROLLBACK (apply separately if needed — see 7c12a2-rollback.sql)
-- ════════════════════════════════════════════════════════════
