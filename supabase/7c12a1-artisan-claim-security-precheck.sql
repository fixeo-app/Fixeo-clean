-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Precheck (Final v2)
-- supabase/7c12a1-artisan-claim-security-precheck.sql
--
-- Run BEFORE 7c12a1-artisan-claim-security.sql (HEAD be1ed2a).
-- All PM checks must RAISE NOTICE PM-xx PASS or PM-xx INFO/WARN.
-- Any RAISE EXCEPTION is a HARD STOP — do NOT apply migration.
--
-- READ ONLY. No DDL. No DML. No writes of any kind.
-- Queries pg_policies, pg_proc, pg_constraint, information_schema,
-- pg_class, pg_namespace, public.artisans, public.claim_requests,
-- public.users only.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count      integer;
  v_count2     integer;
  v_type       text;
  v_nullable   text;
  v_def        text;
  v_def2       text;
  v_policy     text;
  v_con_name   text;
  v_con_def    text;
  v_row        record;
BEGIN

  -- ════════════════════════════════════════════════════════
  -- SECTION 1: claim_requests table schema
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 1: claim_requests schema ══';

  -- PM-1: claim_requests table exists
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='claim_requests';
  IF v_count=0 THEN RAISE EXCEPTION 'PM-1 HARD STOP: claim_requests table not found'; END IF;
  RAISE NOTICE 'PM-1 PASS: claim_requests exists';

  -- PM-2: claim_requests.id is UUID
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='id';
  IF v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-2 HARD STOP: claim_requests.id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-2 PASS: claim_requests.id = uuid';

  -- PM-3: claim_requests.requester_user_id exists
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='requester_user_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-3 HARD STOP: claim_requests.requester_user_id not found'; END IF;
  RAISE NOTICE 'PM-3 PASS: claim_requests.requester_user_id exists (type=%, nullable=%)', v_type, v_nullable;

  -- PM-4: claim_requests.status column exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-4 HARD STOP: claim_requests.status not found'; END IF;
  RAISE NOTICE 'PM-4 PASS: claim_requests.status exists (type=%)', v_type;

  -- PM-5: claim_requests.artisan_id column exists (UUID FK)
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='artisan_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-5 HARD STOP: claim_requests.artisan_id not found (required for LOCK A resolution)'; END IF;
  RAISE NOTICE 'PM-5 PASS: claim_requests.artisan_id exists (type=%, nullable=%)', v_type, v_nullable;

  -- PM-6: claim_requests.artisan_legacy_id exists (TEXT, cross-representation)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='artisan_legacy_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-6 HARD STOP: claim_requests.artisan_legacy_id not found'; END IF;
  RAISE NOTICE 'PM-6 PASS: claim_requests.artisan_legacy_id exists (type=%)', v_type;

  -- PM-7: claim_requests.reviewed_at (Step 0a will add if missing — warn only)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='reviewed_at';
  IF v_type IS NULL THEN
    RAISE NOTICE 'PM-7 WARN: claim_requests.reviewed_at not found — Step 0a will add it (safe)';
  ELSE
    RAISE NOTICE 'PM-7 PASS: claim_requests.reviewed_at exists (type=%)', v_type;
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 2: claims_status_check constraint (Blocker 2)
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 2: claims_status_check constraint (Step 0b) ══';

  -- PM-8: Does claims_status_check exist?
  SELECT c.conname, pg_get_constraintdef(c.oid)
  INTO v_con_name, v_con_def
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
    AND r.relname = 'claim_requests'
    AND c.conname = 'claims_status_check'
    AND c.contype = 'c'
  LIMIT 1;

  IF v_con_name IS NULL THEN
    RAISE NOTICE 'PM-8 INFO: claims_status_check constraint does not exist yet — Step 0b will create with 4 values';
  ELSE
    RAISE NOTICE 'PM-8 PASS: claims_status_check exists, definition: %', v_con_def;
  END IF;

  -- PM-9: Verify current status constraint baseline (if exists)
  IF v_con_name IS NOT NULL THEN
    IF v_con_def ILIKE '%superseded_by_approval%' THEN
      RAISE NOTICE 'PM-9 INFO: claims_status_check already includes superseded_by_approval — Step 0b will be a no-op (idempotent)';
    ELSIF v_con_def ILIKE '%pending%' AND v_con_def ILIKE '%approved%' AND v_con_def ILIKE '%rejected%' THEN
      RAISE NOTICE 'PM-9 PASS: claims_status_check has expected 3-value baseline — Step 0b will safely extend';
    ELSE
      RAISE EXCEPTION 'PM-9 HARD STOP: claims_status_check has unexpected definition: [%]. Migration Step 0b HARD STOP would trigger. Manual review required.', v_con_def;
    END IF;
  END IF;

  -- PM-10: Check all other CHECK constraints on claim_requests.status (catch parallel constraints)
  SELECT COUNT(*) INTO v_count FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
    AND r.relname = 'claim_requests'
    AND c.contype = 'c'
    AND c.conname != 'claims_status_check'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-10 WARN: % additional CHECK constraints referencing status on claim_requests — audit required', v_count;
    FOR v_row IN
      SELECT c.conname, pg_get_constraintdef(c.oid) AS condef
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname='public' AND r.relname='claim_requests'
        AND c.contype='c' AND c.conname != 'claims_status_check'
        AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
      RAISE NOTICE 'PM-10 EXTRA CONSTRAINT: name=% def=%', v_row.conname, v_row.condef;
    END LOOP;
  ELSE
    RAISE NOTICE 'PM-10 PASS: no additional status CHECK constraints on claim_requests';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 3: Live status value audit
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 3: Live claim_requests.status values ══';

  -- PM-11: Count of each known status value
  SELECT COUNT(*) INTO v_count FROM public.claim_requests WHERE status = 'pending';
  RAISE NOTICE 'PM-11 INFO: claim_requests status=pending count=%', v_count;
  SELECT COUNT(*) INTO v_count FROM public.claim_requests WHERE status = 'approved';
  RAISE NOTICE 'PM-11b INFO: claim_requests status=approved count=%', v_count;
  SELECT COUNT(*) INTO v_count FROM public.claim_requests WHERE status = 'rejected';
  RAISE NOTICE 'PM-11c INFO: claim_requests status=rejected count=%', v_count;
  SELECT COUNT(*) INTO v_count FROM public.claim_requests WHERE status = 'superseded_by_approval';
  RAISE NOTICE 'PM-11d INFO: claim_requests status=superseded_by_approval count=% (expected 0 before first migration apply)', v_count;

  -- PM-12: HARD STOP if any row has status outside all known values
  SELECT COUNT(*) INTO v_count FROM public.claim_requests
  WHERE status NOT IN ('pending', 'approved', 'rejected', 'superseded_by_approval');
  IF v_count > 0 THEN
    FOR v_row IN
      SELECT DISTINCT status FROM public.claim_requests
      WHERE status NOT IN ('pending', 'approved', 'rejected', 'superseded_by_approval')
    LOOP
      RAISE NOTICE 'PM-12 UNKNOWN STATUS: %', v_row.status;
    END LOOP;
    RAISE EXCEPTION 'PM-12 HARD STOP: % rows have unknown status values in claim_requests — manual review required before migration', v_count;
  END IF;
  RAISE NOTICE 'PM-12 PASS: all claim_requests.status values are within known set';

  -- ════════════════════════════════════════════════════════
  -- SECTION 4: artisans schema
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 4: artisans schema ══';

  -- PM-13: artisans.id is UUID PK (required for LOCK A)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='id';
  IF v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-13 HARD STOP: artisans.id type=% (expected uuid — deadlock-free locking requires stable UUID PK)', v_type;
  END IF;
  RAISE NOTICE 'PM-13 PASS: artisans.id = uuid';

  -- PM-14: artisans PK uniqueness (SELECT FOR UPDATE requires unique key)
  SELECT COUNT(*) INTO v_count FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname='public' AND r.relname='artisans'
    AND c.contype IN ('p','u')
    AND pg_get_constraintdef(c.oid) ILIKE '%id%';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-14 HARD STOP: artisans.id has no PK/UNIQUE constraint — SELECT FOR UPDATE may not serialize correctly';
  END IF;
  RAISE NOTICE 'PM-14 PASS: artisans.id has PK or UNIQUE constraint';

  -- PM-15: artisans.owner_user_id exists and is nullable
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='owner_user_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-15 HARD STOP: artisans.owner_user_id not found'; END IF;
  IF v_nullable != 'YES' THEN
    RAISE NOTICE 'PM-15 WARN: artisans.owner_user_id is NOT NULL constrained — conditional WHERE owner_user_id IS NULL cannot match for unclaimed artisans';
  ELSE
    RAISE NOTICE 'PM-15 PASS: artisans.owner_user_id exists, nullable=YES';
  END IF;

  -- PM-16: artisans.claim_status exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='claim_status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-16 HARD STOP: artisans.claim_status not found'; END IF;
  RAISE NOTICE 'PM-16 PASS: artisans.claim_status exists';

  -- PM-17: artisans.claimed exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='claimed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-17 HARD STOP: artisans.claimed not found'; END IF;
  RAISE NOTICE 'PM-17 PASS: artisans.claimed exists (type=%)', v_type;

  -- PM-18: artisans.onboarding_completed exists
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='onboarding_completed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-18 HARD STOP: artisans.onboarding_completed not found'; END IF;
  RAISE NOTICE 'PM-18 PASS: artisans.onboarding_completed exists (type=%, nullable=%)', v_type, v_nullable;

  -- PM-19: artisans.legacy_id exists (TEXT — for cross-representation resolution)
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='legacy_id';
  IF v_type IS NULL THEN
    RAISE NOTICE 'PM-19 WARN: artisans.legacy_id not found — branch 2 of _supersede_competing_claims will match 0 rows (no legacy claims)';
  ELSE
    RAISE NOTICE 'PM-19 PASS: artisans.legacy_id exists (type=%, nullable=%)', v_type, v_nullable;
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 5: Cross-representation integrity audit
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 5: Cross-representation resolution integrity ══';

  -- PM-20: claim_requests.artisan_id FK orphans
  SELECT COUNT(*) INTO v_count FROM public.claim_requests cr
  WHERE cr.artisan_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = cr.artisan_id);
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-20 WARN: % claim_requests have artisan_id referencing missing artisans — those claims cannot resolve artisan at approval time', v_count;
  ELSE
    RAISE NOTICE 'PM-20 PASS: all artisan_id FKs resolve to existing artisans';
  END IF;

  -- PM-21: artisan_legacy_id values that resolve via UUID cast (a.id::text)
  SELECT COUNT(*) INTO v_count FROM public.claim_requests cr
  WHERE cr.artisan_id IS NULL
    AND cr.artisan_legacy_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.artisans a
      WHERE a.id::text = cr.artisan_legacy_id
    );
  RAISE NOTICE 'PM-21 INFO: claims with artisan_id IS NULL resolving via UUID-text legacy_id = %', v_count;

  -- PM-22: artisan_legacy_id values that resolve via artisans.legacy_id text match
  SELECT COUNT(*) INTO v_count FROM public.claim_requests cr
  WHERE cr.artisan_id IS NULL
    AND cr.artisan_legacy_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.artisans a WHERE a.id::text = cr.artisan_legacy_id)
    AND EXISTS (SELECT 1 FROM public.artisans a WHERE a.legacy_id = cr.artisan_legacy_id);
  RAISE NOTICE 'PM-22 INFO: claims resolving via artisans.legacy_id text match only = %', v_count;

  -- PM-23: artisan_legacy_id values that resolve via NEITHER path
  SELECT COUNT(*) INTO v_count FROM public.claim_requests cr
  WHERE cr.artisan_id IS NULL
    AND cr.artisan_legacy_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.artisans a WHERE a.id::text = cr.artisan_legacy_id)
    AND NOT EXISTS (SELECT 1 FROM public.artisans a WHERE a.legacy_id = cr.artisan_legacy_id);
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-23 WARN: % claim_requests have artisan_legacy_id that resolves to no artisan via either path — those approvals will return artisan_not_found', v_count;
  ELSE
    RAISE NOTICE 'PM-23 PASS: all artisan_legacy_id values resolve to at least one artisan (or are NULL)';
  END IF;

  -- PM-24: AMBIGUITY CHECK — artisan_legacy_id resolving to MORE THAN ONE artisan
  -- An artisan_legacy_id could match via a.id::text AND a.legacy_id on DIFFERENT artisans.
  -- The 3-tier resolution is sequential (first match wins), so this is only dangerous
  -- if the same legacy_id string resolves to different artisan UUIDs in different tiers.
  SELECT COUNT(*) INTO v_count FROM (
    SELECT cr.artisan_legacy_id,
           COUNT(DISTINCT a.id) AS artisan_count
    FROM public.claim_requests cr
    JOIN public.artisans a
      ON (a.id::text = cr.artisan_legacy_id OR a.legacy_id = cr.artisan_legacy_id)
    WHERE cr.artisan_id IS NULL
      AND cr.artisan_legacy_id IS NOT NULL
    GROUP BY cr.artisan_legacy_id
    HAVING COUNT(DISTINCT a.id) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-24 HARD STOP: % artisan_legacy_id value(s) resolve to more than one distinct artisan UUID via combined resolution paths. Approval would be ambiguous. Manual review required.', v_count;
  END IF;
  RAISE NOTICE 'PM-24 PASS: no artisan_legacy_id resolves to more than one canonical artisan UUID';

  -- PM-25: DUPLICATE artisans.legacy_id values (non-null)
  SELECT COUNT(*) INTO v_count FROM (
    SELECT legacy_id FROM public.artisans
    WHERE legacy_id IS NOT NULL
    GROUP BY legacy_id HAVING COUNT(*) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-25 HARD STOP: % duplicate non-null artisans.legacy_id values found. Resolution via legacy_id match would be ambiguous. Dedup required before migration.', v_count;
  END IF;
  RAISE NOTICE 'PM-25 PASS: artisans.legacy_id values are unique (or null)';

  -- ════════════════════════════════════════════════════════
  -- SECTION 6: Ownership integrity baseline
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 6: Ownership integrity baseline ══';

  -- PM-26: artisans with owner_user_id set
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE owner_user_id IS NOT NULL;
  RAISE NOTICE 'PM-26 INFO: artisans with owner_user_id set = %', v_count;

  -- PM-27: artisans with claim_status=approved
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE claim_status='approved';
  RAISE NOTICE 'PM-27 INFO: artisans with claim_status=approved = %', v_count;

  -- PM-28: ORPHAN CHECK — approved claim_status but owner_user_id IS NULL
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE claim_status='approved' AND owner_user_id IS NULL;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-28 WARN: % artisan(s) have claim_status=approved but owner_user_id IS NULL — orphan approval state (pre-existing)', v_count;
  ELSE
    RAISE NOTICE 'PM-28 PASS: no orphan approved artisans';
  END IF;

  -- PM-29: INCONSISTENCY CHECK — owner_user_id set but claim_status != approved
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE owner_user_id IS NOT NULL AND claim_status != 'approved';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-29 WARN: % artisan(s) have owner_user_id set but claim_status != approved — inconsistent ownership state', v_count;
  ELSE
    RAISE NOTICE 'PM-29 PASS: all owner-linked artisans have claim_status=approved';
  END IF;

  -- PM-30: DUPLICATE OWNER CHECK — one user owns > 1 artisan
  SELECT COUNT(*) INTO v_count FROM (
    SELECT owner_user_id FROM public.artisans
    WHERE owner_user_id IS NOT NULL
    GROUP BY owner_user_id HAVING COUNT(*) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-30 WARN: % user(s) linked to more than one artisan profile — duplicate ownership', v_count;
  ELSE
    RAISE NOTICE 'PM-30 PASS: no duplicate owner_user_id mappings';
  END IF;

  -- PM-31: CONTRADICTORY OWNERSHIP — different requester approved for same artisan
  -- Checks if multiple approved claim rows for the same canonical artisan
  -- have different requester_user_id values.
  SELECT COUNT(*) INTO v_count FROM (
    SELECT COALESCE(cr.artisan_id::text, cr.artisan_legacy_id) AS artisan_key,
           COUNT(DISTINCT cr.requester_user_id) AS requester_count
    FROM public.claim_requests cr
    WHERE cr.status = 'approved'
      AND COALESCE(cr.artisan_id::text, cr.artisan_legacy_id) IS NOT NULL
    GROUP BY COALESCE(cr.artisan_id::text, cr.artisan_legacy_id)
    HAVING COUNT(DISTINCT cr.requester_user_id) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-31 HARD STOP: % artisan(s) have approved claim_requests with different requester_user_id values — contradictory ownership. Manual resolution required.', v_count;
  END IF;
  RAISE NOTICE 'PM-31 PASS: no contradictory ownership (same artisan, multiple approved requesters)';

  -- PM-32: OWNER vs APPROVED CLAIM CONSISTENCY
  -- For artisans where owner_user_id IS NOT NULL AND an approved claim exists,
  -- check that artisan.owner_user_id == claim.requester_user_id.
  SELECT COUNT(*) INTO v_count FROM public.artisans a
  JOIN public.claim_requests cr ON (
    cr.artisan_id = a.id OR cr.artisan_legacy_id = a.id::text OR cr.artisan_legacy_id = a.legacy_id
  )
  WHERE a.owner_user_id IS NOT NULL
    AND cr.status = 'approved'
    AND cr.requester_user_id != a.owner_user_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-32 HARD STOP: % artisan row(s) have owner_user_id that contradicts the approved claim requester_user_id. Ownership data is corrupted. Manual review required.', v_count;
  END IF;
  RAISE NOTICE 'PM-32 PASS: artisan owner_user_id consistent with approved claim requester (or no such pair exists)';

  -- ════════════════════════════════════════════════════════
  -- SECTION 7: Multi-pending claims audit
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 7: Multi-pending claims (first-wins) ══';

  -- PM-33: Multiple pending claims for same artisan_id UUID
  SELECT COUNT(*) INTO v_count FROM (
    SELECT artisan_id FROM public.claim_requests
    WHERE status='pending' AND artisan_id IS NOT NULL
    GROUP BY artisan_id HAVING COUNT(*) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-33 WARN: % artisan_id(s) have multiple pending claims — approve_artisan_claim first-wins will supersede losers (expected / handled)', v_count;
  ELSE
    RAISE NOTICE 'PM-33 PASS: no artisan has multiple pending claims by artisan_id';
  END IF;

  -- PM-34: Multiple pending claims for same artisan_legacy_id
  SELECT COUNT(*) INTO v_count FROM (
    SELECT artisan_legacy_id FROM public.claim_requests
    WHERE status='pending' AND artisan_legacy_id IS NOT NULL
    GROUP BY artisan_legacy_id HAVING COUNT(*) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-34 WARN: % artisan_legacy_id(s) have multiple pending claims — first-wins will supersede losers (handled)', v_count;
  ELSE
    RAISE NOTICE 'PM-34 PASS: no artisan has multiple pending claims by artisan_legacy_id';
  END IF;

  -- PM-35: Total pending claims count
  SELECT COUNT(*) INTO v_count FROM public.claim_requests WHERE status='pending';
  RAISE NOTICE 'PM-35 INFO: total pending claims = %', v_count;

  -- ════════════════════════════════════════════════════════
  -- SECTION 8: Trigger state
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 8: sync_artisan_claim trigger state ══';

  -- PM-36: sync_artisan_claim() function existence and defect confirmation
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_artisan_claim';
  IF v_count=0 THEN
    RAISE NOTICE 'PM-36 INFO: sync_artisan_claim() function not found — migration DROP is a no-op (safe)';
  ELSE
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='sync_artisan_claim' LIMIT 1;
    -- Confirm Defect 1: onboarding_completed auto-set
    IF v_def ~* 'onboarding_completed\s*=\s*\(' OR v_def ~* 'onboarding_completed\s*=' THEN
      RAISE NOTICE 'PM-36 DEFECT-1 CONFIRMED: sync_artisan_claim sets onboarding_completed — migration DROP is required';
    ELSE
      RAISE NOTICE 'PM-36 INFO: sync_artisan_claim onboarding_completed pattern not detected in definition';
    END IF;
    -- Confirm Defect 2: verified=TRUE
    IF v_def ~* 'verified\s*=\s*true' THEN
      RAISE NOTICE 'PM-36 DEFECT-2 CONFIRMED: sync_artisan_claim sets verified=TRUE — migration DROP is required';
    ELSE
      RAISE NOTICE 'PM-36 INFO: sync_artisan_claim verified=TRUE pattern not detected';
    END IF;
    -- Confirm Defect 3: writes owner_user_id (double-write risk)
    IF v_def ILIKE '%owner_user_id%' THEN
      RAISE NOTICE 'PM-36 DEFECT-3 CONFIRMED: sync_artisan_claim writes owner_user_id — double-write race with approve RPC';
    ELSE
      RAISE NOTICE 'PM-36 INFO: sync_artisan_claim owner_user_id reference not detected';
    END IF;
  END IF;

  -- PM-37: claim_approval_sync trigger existence on claim_requests
  SELECT COUNT(*) INTO v_count FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table='claim_requests'
    AND trigger_name = 'claim_approval_sync';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-37 INFO: claim_approval_sync trigger EXISTS on claim_requests — migration Step 1 will DROP it';
  ELSE
    RAISE NOTICE 'PM-37 INFO: claim_approval_sync trigger not found — migration DROP is a no-op (safe)';
  END IF;

  -- PM-38: Any OTHER triggers on claim_requests (unexpected — could introduce reverse lock order)
  SELECT COUNT(*) INTO v_count FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table='claim_requests'
    AND trigger_name != 'claim_approval_sync';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-38 WARN: % unexpected trigger(s) on claim_requests beyond claim_approval_sync — audit lock order compatibility', v_count;
    FOR v_row IN
      SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE trigger_schema='public' AND event_object_table='claim_requests'
        AND trigger_name != 'claim_approval_sync'
    LOOP
      RAISE NOTICE 'PM-38 UNEXPECTED TRIGGER: name=% event=% timing=%', v_row.trigger_name, v_row.event_manipulation, v_row.action_timing;
    END LOOP;
  ELSE
    RAISE NOTICE 'PM-38 PASS: no unexpected triggers on claim_requests';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 9: RPC collision / signature audit
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 9: RPC collision / signature audit ══';

  -- PM-39: approve_artisan_claim collision check
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='approve_artisan_claim';
  IF v_count > 0 THEN
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1;
    RAISE NOTICE 'PM-39 INFO: approve_artisan_claim already exists — CREATE OR REPLACE will overwrite. Existing signature (first 300 chars): %', LEFT(v_def,300);
    -- Check if existing function takes uuid (compatible)
    IF pg_get_function_arguments(
      (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1)
    ) NOT ILIKE '%uuid%' THEN
      RAISE EXCEPTION 'PM-39 HARD STOP: approve_artisan_claim exists with incompatible signature (not uuid). Manual DROP required before migration.';
    END IF;
    RAISE NOTICE 'PM-39 NOTE: existing approve_artisan_claim signature is uuid-compatible — CREATE OR REPLACE safe';
  ELSE
    RAISE NOTICE 'PM-39 PASS: approve_artisan_claim does not exist yet';
  END IF;

  -- PM-40: reject_artisan_claim collision check
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim';
  IF v_count > 0 THEN
    IF pg_get_function_arguments(
      (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1)
    ) NOT ILIKE '%uuid%' THEN
      RAISE EXCEPTION 'PM-40 HARD STOP: reject_artisan_claim exists with incompatible signature (not uuid). Manual DROP required.';
    END IF;
    RAISE NOTICE 'PM-40 NOTE: reject_artisan_claim already exists, uuid-compatible — CREATE OR REPLACE safe';
  ELSE
    RAISE NOTICE 'PM-40 PASS: reject_artisan_claim does not exist yet';
  END IF;

  -- PM-41: _supersede_competing_claims helper collision check
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='_supersede_competing_claims';
  IF v_count > 0 THEN
    -- Must have signature (uuid, uuid, text) to be compatible
    SELECT pg_get_function_arguments(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_supersede_competing_claims' LIMIT 1;
    RAISE NOTICE 'PM-41 INFO: _supersede_competing_claims already exists, current args: %', v_def;
    IF v_def NOT ILIKE '%uuid%' OR v_def NOT ILIKE '%text%' THEN
      RAISE EXCEPTION 'PM-41 HARD STOP: _supersede_competing_claims exists with incompatible signature [%]. Expected (uuid, uuid, text). Manual DROP required.', v_def;
    END IF;
    RAISE NOTICE 'PM-41 NOTE: _supersede_competing_claims signature is compatible — CREATE OR REPLACE safe';
  ELSE
    RAISE NOTICE 'PM-41 PASS: _supersede_competing_claims does not exist yet';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 10: LIVE RLS state on claim_requests
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 10: LIVE RLS effective state on claim_requests ══';

  -- PM-42: RLS enabled on claim_requests
  SELECT relrowsecurity::text INTO v_type FROM pg_class
  WHERE relname='claim_requests' AND relnamespace='public'::regnamespace;
  IF v_type IS NULL OR v_type='false' THEN
    RAISE NOTICE 'PM-42 WARN: RLS is NOT enabled on claim_requests — migration Step 5 enables it';
  ELSE
    RAISE NOTICE 'PM-42 PASS: RLS enabled on claim_requests';
  END IF;

  -- PM-43: FORCE RLS state (affects SECURITY DEFINER RPCs)
  SELECT relforcerowsecurity::text INTO v_type FROM pg_class
  WHERE relname='claim_requests' AND relnamespace='public'::regnamespace;
  RAISE NOTICE 'PM-43 INFO: claim_requests FORCE ROW SECURITY = % (SECURITY DEFINER RPCs bypass RLS; this is correct)', v_type;

  -- PM-44: Enumerate ALL live policies on claim_requests
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests';
  RAISE NOTICE 'PM-44 INFO: total policies on claim_requests = %', v_count;
  FOR v_row IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies WHERE schemaname='public' AND tablename='claim_requests'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'PM-44 POLICY: name=% cmd=% roles=% qual=% wcheck=%',
      v_row.policyname, v_row.cmd, v_row.roles, COALESCE(v_row.qual,'—'), COALESCE(v_row.with_check,'—');
  END LOOP;

  -- PM-45: Detect anon UPDATE/INSERT/ALL effective access
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND roles @> '{anon}'
    AND cmd IN ('INSERT','UPDATE','ALL')
    AND (qual IS NULL OR qual != 'false');
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-45 WARN: % non-blocking anon INSERT/UPDATE/ALL policies on claim_requests — Step 5 will remove', v_count;
  ELSE
    RAISE NOTICE 'PM-45 PASS: no effective anon INSERT/UPDATE/ALL policies on claim_requests';
  END IF;

  -- PM-46: Detect authenticated UPDATE/DELETE/ALL — direct status write risk
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND (roles @> '{authenticated}' OR roles @> '{public}')
    AND cmd IN ('UPDATE','DELETE','ALL');
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-46 WARN: % authenticated/public UPDATE/DELETE/ALL policies on claim_requests — browser direct status write possible; Step 5 will remove', v_count;
    FOR v_row IN
      SELECT policyname, cmd, roles FROM pg_policies
      WHERE schemaname='public' AND tablename='claim_requests'
        AND (roles @> '{authenticated}' OR roles @> '{public}')
        AND cmd IN ('UPDATE','DELETE','ALL')
    LOOP
      RAISE NOTICE 'PM-46 DIRECT-WRITE POLICY: name=% cmd=% roles=%', v_row.policyname, v_row.cmd, v_row.roles;
    END LOOP;
  ELSE
    RAISE NOTICE 'PM-46 PASS: no authenticated UPDATE/DELETE/ALL policies on claim_requests';
  END IF;

  -- PM-47: Detect open WITH CHECK(true) insert policies (allow any authenticated insert)
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND cmd IN ('INSERT','ALL')
    AND with_check IS NOT NULL
    AND with_check = 'true';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-47 WARN: % policies have WITH CHECK(true) on claim_requests INSERT — allows unconstrained inserts; Step 5 will remove', v_count;
  ELSE
    RAISE NOTICE 'PM-47 PASS: no open WITH CHECK(true) INSERT policies on claim_requests';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 11: LIVE RLS state on artisans, users, profiles
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 11: LIVE RLS state on artisans / users / profiles ══';

  -- PM-48: RLS on artisans
  SELECT relrowsecurity::text, relforcerowsecurity::text INTO v_type, v_nullable
  FROM pg_class WHERE relname='artisans' AND relnamespace='public'::regnamespace;
  RAISE NOTICE 'PM-48 INFO: artisans RLS=% FORCE=%', v_type, v_nullable;

  -- PM-49: UPDATE policies on artisans — approve RPC writes owner_user_id via SECURITY DEFINER
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='artisans'
    AND cmd IN ('UPDATE','ALL')
    AND (roles @> '{authenticated}' OR roles @> '{anon}' OR roles @> '{public}');
  RAISE NOTICE 'PM-49 INFO: artisans authenticated/anon UPDATE/ALL policies = % (SECURITY DEFINER RPC bypasses; informational)', v_count;
  FOR v_row IN
    SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
    WHERE schemaname='public' AND tablename='artisans'
      AND cmd IN ('UPDATE','ALL')
      AND (roles @> '{authenticated}' OR roles @> '{anon}' OR roles @> '{public}')
  LOOP
    RAISE NOTICE 'PM-49 ARTISAN UPDATE POLICY: name=% cmd=% roles=% qual=%',
      v_row.policyname, v_row.cmd, v_row.roles, COALESCE(v_row.qual,'—');
  END LOOP;

  -- PM-50: RLS on users
  SELECT relrowsecurity::text, relforcerowsecurity::text INTO v_type, v_nullable
  FROM pg_class WHERE relname='users' AND relnamespace='public'::regnamespace;
  RAISE NOTICE 'PM-50 INFO: users RLS=% FORCE=%', v_type, v_nullable;

  -- PM-51: RLS on profiles
  SELECT relrowsecurity::text, relforcerowsecurity::text INTO v_type, v_nullable
  FROM pg_class WHERE relname='profiles' AND relnamespace='public'::regnamespace;
  RAISE NOTICE 'PM-51 INFO: profiles RLS=% FORCE=%', v_type, v_nullable;

  -- ════════════════════════════════════════════════════════
  -- SECTION 12: admin role source confirmation
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 12: admin role source ══';

  -- PM-52: users.role column exists and can identify admin
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='role';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-52 HARD STOP: users.role not found — approve/reject RPCs cannot verify admin caller'; END IF;
  RAISE NOTICE 'PM-52 PASS: users.role exists (type=%)', v_type;

  -- PM-53: at least one admin in users table (informational — approval cannot succeed without one)
  SELECT COUNT(*) INTO v_count FROM public.users WHERE role='admin';
  IF v_count = 0 THEN
    RAISE NOTICE 'PM-53 WARN: no users with role=admin found — approve_artisan_claim calls will return not_admin until an admin exists';
  ELSE
    RAISE NOTICE 'PM-53 PASS: % admin user(s) found in users table', v_count;
  END IF;

  -- PM-54: profiles.role exists (approve RPC also writes profiles.role)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='role';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-54 HARD STOP: profiles.role not found — approve RPC will fail at role promotion step'; END IF;
  RAISE NOTICE 'PM-54 PASS: profiles.role exists';

  -- ════════════════════════════════════════════════════════
  -- SECTION 13: Lock-order schema prerequisites
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 13: Lock-order schema prerequisites ══';

  -- PM-55: artisans has PK on id (SELECT FOR UPDATE requires stable, unique key)
  SELECT COUNT(*) INTO v_count FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname='public' AND r.relname='artisans' AND c.contype='p';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-55 HARD STOP: artisans table has no PRIMARY KEY — SELECT FOR UPDATE artisan row is unsafe';
  END IF;
  RAISE NOTICE 'PM-55 PASS: artisans has PRIMARY KEY';

  -- PM-56: claim_requests has PK on id
  SELECT COUNT(*) INTO v_count FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname='public' AND r.relname='claim_requests' AND c.contype='p';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-56 HARD STOP: claim_requests table has no PRIMARY KEY — SELECT FOR UPDATE is unsafe';
  END IF;
  RAISE NOTICE 'PM-56 PASS: claim_requests has PRIMARY KEY';

  -- PM-57: claim_requests.artisan_id is UUID (matches artisans.id for LOCK A resolution)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='artisan_id';
  IF v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-57 HARD STOP: claim_requests.artisan_id type=% (expected uuid to match artisans.id)', v_type;
  END IF;
  RAISE NOTICE 'PM-57 PASS: claim_requests.artisan_id is uuid (matches artisans.id type)';

  -- PM-58: artisans.owner_user_id is uuid (matches auth.uid() return type)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='owner_user_id';
  IF v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-58 HARD STOP: artisans.owner_user_id type=% (expected uuid to match auth.uid())', v_type;
  END IF;
  RAISE NOTICE 'PM-58 PASS: artisans.owner_user_id is uuid';

  -- PM-59: No triggers on artisans that could introduce reverse lock order
  -- (A trigger AFTER UPDATE on artisans that SELECTs claim_requests would reverse the lock order)
  SELECT COUNT(*) INTO v_count FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table='artisans';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-59 WARN: % trigger(s) on artisans — verify none acquire claim_requests row locks (reverse lock order risk)', v_count;
    FOR v_row IN
      SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE trigger_schema='public' AND event_object_table='artisans'
    LOOP
      RAISE NOTICE 'PM-59 ARTISAN TRIGGER: name=% event=% timing=%', v_row.trigger_name, v_row.event_manipulation, v_row.action_timing;
    END LOOP;
  ELSE
    RAISE NOTICE 'PM-59 PASS: no triggers on artisans (no reverse lock order risk)';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SECTION 14: dispatch_request_v1 non-regression check
  -- ════════════════════════════════════════════════════════
  RAISE NOTICE '══ SECTION 14: 7C.11 non-regression ══';

  -- PM-60: dispatch_request_v1 still present (migration must not touch it)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='dispatch_request_v1';
  IF v_count=0 THEN
    RAISE EXCEPTION 'PM-60 HARD STOP: dispatch_request_v1 not found — 7C.11 RPC is missing before migration even ran';
  END IF;
  RAISE NOTICE 'PM-60 PASS: dispatch_request_v1 present (7C.11 non-regression ok)';

  RAISE NOTICE '══ 7C.12A.1 PRECHECK COMPLETE (v2) ══';
  RAISE NOTICE 'Review all WARN and INFO lines. Any HARD STOP = do not apply migration.';
  RAISE NOTICE 'PASS on all numbered PM checks = safe to proceed.';

END $$;
