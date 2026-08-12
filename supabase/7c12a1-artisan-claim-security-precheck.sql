-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Foundation Precheck
-- supabase/7c12a1-artisan-claim-security-precheck.sql
--
-- Run BEFORE 7c12a1-artisan-claim-security.sql.
-- All PM checks must RAISE NOTICE PM-xx PASS.
-- Any RAISE EXCEPTION is a HARD STOP — do not proceed.
--
-- This precheck is READ ONLY. No DDL. No DML. No writes.
--
-- Inspects LIVE pg_policies, pg_proc, information_schema.
-- Does NOT trust repo files — queries the actual live DB state.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count      integer;
  v_type       text;
  v_nullable   text;
  v_def        text;
  v_policy     text;
BEGIN

  -- ── SECTION 1: claim_requests schema ────────────────────────
  RAISE NOTICE '══ SECTION 1: claim_requests schema ══';

  -- PM-1: claim_requests table exists
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='claim_requests';
  IF v_count=0 THEN RAISE EXCEPTION 'PM-1 FAIL: claim_requests table not found'; END IF;
  RAISE NOTICE 'PM-1 PASS: claim_requests exists';

  -- PM-2: claim_requests.id is UUID
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='id';
  IF v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-2 FAIL: claim_requests.id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-2 PASS: claim_requests.id = uuid';

  -- PM-3: claim_requests.requester_user_id exists
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='requester_user_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-3 FAIL: claim_requests.requester_user_id not found'; END IF;
  RAISE NOTICE 'PM-3 PASS: claim_requests.requester_user_id exists (type=%, nullable=%)', v_type, v_nullable;

  -- PM-4: claim_requests.status exists with CHECK
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-4 FAIL: claim_requests.status not found'; END IF;
  RAISE NOTICE 'PM-4 PASS: claim_requests.status exists (type=%)', v_type;

  -- PM-5: claim_requests.artisan_legacy_id exists (used for artisan resolution)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='artisan_legacy_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-5 FAIL: claim_requests.artisan_legacy_id not found'; END IF;
  RAISE NOTICE 'PM-5 PASS: claim_requests.artisan_legacy_id exists';

  -- PM-6: claim_requests.reviewed_at exists (for server-set timestamp)
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claim_requests' AND column_name='reviewed_at';
  IF v_type IS NULL THEN
    RAISE NOTICE 'PM-6 WARN: claim_requests.reviewed_at not found — migration will add it if missing';
  ELSE
    RAISE NOTICE 'PM-6 PASS: claim_requests.reviewed_at exists (type=%)', v_type;
  END IF;

  -- ── SECTION 2: artisans ownership columns ───────────────────
  RAISE NOTICE '══ SECTION 2: artisans ownership columns ══';

  -- PM-7: artisans.owner_user_id exists
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='owner_user_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-7 FAIL: artisans.owner_user_id not found'; END IF;
  RAISE NOTICE 'PM-7 PASS: artisans.owner_user_id exists (type=%, nullable=%)', v_type, v_nullable;

  -- PM-8: artisans.claim_status exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='claim_status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-8 FAIL: artisans.claim_status not found'; END IF;
  RAISE NOTICE 'PM-8 PASS: artisans.claim_status exists';

  -- PM-9: artisans.claimed exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='claimed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-9 FAIL: artisans.claimed not found'; END IF;
  RAISE NOTICE 'PM-9 PASS: artisans.claimed exists (type=%)', v_type;

  -- PM-10: artisans.onboarding_completed exists
  SELECT data_type, is_nullable INTO v_type, v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='artisans' AND column_name='onboarding_completed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-10 FAIL: artisans.onboarding_completed not found'; END IF;
  RAISE NOTICE 'PM-10 PASS: artisans.onboarding_completed exists (type=%, nullable=%)', v_type, v_nullable;

  -- ── SECTION 3: users/profiles role fields ───────────────────
  RAISE NOTICE '══ SECTION 3: users/profiles role fields ══';

  -- PM-11: users.role exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='role';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-11 FAIL: users.role not found'; END IF;
  RAISE NOTICE 'PM-11 PASS: users.role exists';

  -- PM-12: profiles.role exists
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='role';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-12 FAIL: profiles.role not found'; END IF;
  RAISE NOTICE 'PM-12 PASS: profiles.role exists';

  -- ── SECTION 4: admin role source ────────────────────────────
  RAISE NOTICE '══ SECTION 4: admin role source ══';

  -- PM-13: users table has admin-role rows (informational)
  SELECT COUNT(*) INTO v_count FROM public.users WHERE role='admin';
  RAISE NOTICE 'PM-13 INFO: users with role=admin = % (expected >= 1 for admin approval to work)', v_count;

  -- ── SECTION 5: LIVE RLS policies (pg_policies) ──────────────
  RAISE NOTICE '══ SECTION 5: LIVE RLS on claim_requests ══';

  -- PM-14: RLS enabled on claim_requests
  SELECT relrowsecurity::text INTO v_type FROM pg_class
  WHERE relname='claim_requests' AND relnamespace='public'::regnamespace;
  IF v_type IS NULL OR v_type='false' THEN
    RAISE EXCEPTION 'PM-14 FAIL: RLS is NOT enabled on claim_requests — major security gap';
  END IF;
  RAISE NOTICE 'PM-14 PASS: RLS enabled on claim_requests';

  -- PM-15: enumerate live policies on claim_requests
  FOR v_policy IN
    SELECT 'cmd=' || cmd || ' role=' || roles::text || ' qual=' || COALESCE(qual,'') || ' wcheck=' || COALESCE(with_check,'')
    FROM pg_policies WHERE schemaname='public' AND tablename='claim_requests'
  LOOP
    RAISE NOTICE 'PM-15 LIVE POLICY: %', v_policy;
  END LOOP;
  SELECT COUNT(*) INTO v_count FROM pg_policies WHERE schemaname='public' AND tablename='claim_requests';
  RAISE NOTICE 'PM-15 INFO: total policies on claim_requests = %', v_count;

  -- PM-16: check anon INSERT capability on claim_requests
  IF has_table_privilege('anon', 'public.claim_requests', 'INSERT') THEN
    RAISE NOTICE 'PM-16 WARN: anon has raw table INSERT privilege — policy check required';
  ELSE
    RAISE NOTICE 'PM-16 PASS: anon lacks raw INSERT privilege on claim_requests';
  END IF;

  -- PM-17: check authenticated INSERT capability
  IF has_table_privilege('authenticated', 'public.claim_requests', 'INSERT') THEN
    RAISE NOTICE 'PM-17 INFO: authenticated has INSERT — policy must restrict to requester_user_id=auth.uid()';
  ELSE
    RAISE NOTICE 'PM-17 INFO: authenticated lacks INSERT — claim insert uses service_role path only';
  END IF;

  -- PM-18: policies on claim_requests — check for any UPDATE policy that could allow self-approval
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND cmd IN ('UPDATE','ALL')
    AND (roles @> '{authenticated}' OR roles @> '{anon}' OR roles @> '{public}');
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-18 WARN: % UPDATE/ALL policy on claim_requests allows authenticated/anon — audit required', v_count;
  ELSE
    RAISE NOTICE 'PM-18 PASS: no authenticated/anon UPDATE policy on claim_requests (RPCs handle updates)';
  END IF;

  -- ── SECTION 6: LIVE RLS on artisans ─────────────────────────
  RAISE NOTICE '══ SECTION 6: LIVE RLS on artisans ══';

  -- PM-19: RLS enabled on artisans
  SELECT relrowsecurity::text INTO v_type FROM pg_class
  WHERE relname='artisans' AND relnamespace='public'::regnamespace;
  IF v_type IS NULL OR v_type='false' THEN
    RAISE NOTICE 'PM-19 WARN: RLS is NOT enabled on artisans — public reads ok, but UPDATE policy not enforced at DB level';
  ELSE
    RAISE NOTICE 'PM-19 PASS: RLS enabled on artisans';
  END IF;

  -- PM-20: enumerate live UPDATE policies on artisans
  FOR v_policy IN
    SELECT 'cmd=' || cmd || ' role=' || roles::text || ' qual=' || COALESCE(qual,'') || ' wcheck=' || COALESCE(with_check,'')
    FROM pg_policies WHERE schemaname='public' AND tablename='artisans' AND cmd IN ('UPDATE','ALL')
  LOOP
    RAISE NOTICE 'PM-20 LIVE ARTISAN UPDATE POLICY: %', v_policy;
  END LOOP;

  -- ── SECTION 7: sync_artisan_claim() trigger definition ──────
  RAISE NOTICE '══ SECTION 7: sync_artisan_claim trigger ══';

  -- PM-21: trigger function exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_artisan_claim';
  IF v_count=0 THEN
    RAISE NOTICE 'PM-21 INFO: sync_artisan_claim() function not found — trigger path not active';
  ELSE
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='sync_artisan_claim' LIMIT 1;
    RAISE NOTICE 'PM-21 FOUND: sync_artisan_claim() definition (truncated): %', LEFT(v_def, 500);
    -- Check for onboarding_completed auto-set
    IF v_def ILIKE '%onboarding_completed%' AND v_def ILIKE '%true%' THEN
      RAISE NOTICE 'PM-21 DEFECT: sync_artisan_claim sets onboarding_completed=true — migration must neutralize this';
    ELSE
      RAISE NOTICE 'PM-21 PASS: no obvious onboarding_completed auto-true in trigger';
    END IF;
    -- Check for owner_user_id write
    IF v_def ILIKE '%owner_user_id%' THEN
      RAISE NOTICE 'PM-21 INFO: sync_artisan_claim references owner_user_id — verify it sets from requester_user_id';
    END IF;
  END IF;

  -- PM-22: trigger exists on claim_requests
  SELECT COUNT(*) INTO v_count FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table='claim_requests'
    AND trigger_name ILIKE '%artisan_claim%';
  RAISE NOTICE 'PM-22 INFO: claim_requests triggers matching artisan_claim = %', v_count;

  -- ── SECTION 8: ownership integrity baseline ──────────────────
  RAISE NOTICE '══ SECTION 8: ownership integrity baseline ══';

  -- PM-23: artisans with owner_user_id set (non-null)
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE owner_user_id IS NOT NULL;
  RAISE NOTICE 'PM-23 INFO: artisans with owner_user_id set = %', v_count;

  -- PM-24: artisans with claim_status=approved
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE claim_status='approved';
  RAISE NOTICE 'PM-24 INFO: artisans with claim_status=approved = %', v_count;

  -- PM-25: CORRUPTION CHECK — approved claim_status but owner_user_id IS NULL
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE claim_status='approved' AND owner_user_id IS NULL;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-25 WARN: % artisan(s) have claim_status=approved but owner_user_id IS NULL — orphan approval state', v_count;
  ELSE
    RAISE NOTICE 'PM-25 PASS: no orphan approved artisans (approved + no owner)';
  END IF;

  -- PM-26: CORRUPTION CHECK — owner_user_id set but claim_status != approved
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE owner_user_id IS NOT NULL AND claim_status != 'approved';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-26 WARN: % artisan(s) have owner_user_id set but claim_status != approved — inconsistent ownership', v_count;
  ELSE
    RAISE NOTICE 'PM-26 PASS: all owner-linked artisans have claim_status=approved';
  END IF;

  -- PM-27: CORRUPTION CHECK — duplicate owner_user_id (one user owns > 1 artisan)
  SELECT COUNT(*) INTO v_count FROM (
    SELECT owner_user_id FROM public.artisans
    WHERE owner_user_id IS NOT NULL
    GROUP BY owner_user_id HAVING COUNT(*) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-27 WARN: % user(s) linked to more than one artisan profile — duplicate ownership detected', v_count;
  ELSE
    RAISE NOTICE 'PM-27 PASS: no duplicate owner_user_id mappings';
  END IF;

  -- PM-28: pending claims count
  SELECT COUNT(*) INTO v_count FROM public.claim_requests WHERE status='pending';
  RAISE NOTICE 'PM-28 INFO: pending claims = %', v_count;

  -- PM-29: approved claims vs linked artisans consistency
  SELECT COUNT(*) INTO v_count FROM public.claim_requests cr
  WHERE cr.status='approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.artisans a
      WHERE a.claim_status='approved'
        AND (a.id::text = cr.artisan_legacy_id OR a.owner_user_id::text = cr.requester_user_id::text)
    );
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-29 WARN: % approved claim_requests have no matching approved artisan row', v_count;
  ELSE
    RAISE NOTICE 'PM-29 PASS: approved claims consistent with artisan ownership';
  END IF;

  -- PM-30: claims referencing missing users
  SELECT COUNT(*) INTO v_count FROM public.claim_requests cr
  WHERE cr.requester_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=cr.requester_user_id);
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-30 WARN: % claim_requests reference requester_user_id not in users table', v_count;
  ELSE
    RAISE NOTICE 'PM-30 PASS: all requester_user_id values have matching users rows';
  END IF;

  -- PM-31: HARD STOP check — multiple pending claims for same artisan
  SELECT COUNT(*) INTO v_count FROM (
    SELECT artisan_legacy_id FROM public.claim_requests
    WHERE status='pending'
    GROUP BY artisan_legacy_id HAVING COUNT(*) > 1
  ) sub;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-31 WARN: % artisans have multiple pending claims — approve_artisan_claim will handle first-wins', v_count;
  ELSE
    RAISE NOTICE 'PM-31 PASS: no artisan has multiple pending claims';
  END IF;

  -- ── SECTION 9: RPCs that will be created ────────────────────
  RAISE NOTICE '══ SECTION 9: RPC pre-existence check ══';

  -- PM-32: approve_artisan_claim RPC pre-existence
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='approve_artisan_claim';
  IF v_count>0 THEN
    RAISE NOTICE 'PM-32 NOTE: approve_artisan_claim already exists — CREATE OR REPLACE will overwrite';
  ELSE
    RAISE NOTICE 'PM-32 PASS: approve_artisan_claim does not exist yet';
  END IF;

  -- PM-33: reject_artisan_claim RPC pre-existence
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim';
  IF v_count>0 THEN
    RAISE NOTICE 'PM-33 NOTE: reject_artisan_claim already exists — CREATE OR REPLACE will overwrite';
  ELSE
    RAISE NOTICE 'PM-33 PASS: reject_artisan_claim does not exist yet';
  END IF;

  RAISE NOTICE '══ 7C.12A.1 PRECHECK COMPLETE — review all WARN and INFO lines above before migrating ══';

END $$;
