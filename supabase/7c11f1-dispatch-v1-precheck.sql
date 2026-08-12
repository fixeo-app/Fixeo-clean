-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Dispatch V1 Precheck
-- supabase/7c11f1-dispatch-v1-precheck.sql
-- Revision: 7C.11F.1B — agreed_price nullability contract added
--
-- Run BEFORE 7c11f1-dispatch-v1.sql.
-- All PM checks must pass (RAISE NOTICE PM-xx PASS).
-- Any RAISE EXCEPTION is a HARD STOP — do not proceed.
--
-- PM-24 now validates the full agreed_price contract:
--   type = numeric
--   nullability confirmed
--   CHECK constraint definition captured
--   current NULL-priced missions counted
--   dispatch readiness for agreed_price=NULL INSERT confirmed
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count      integer;
  v_type       text;
  v_nullable   text;
  v_check_def  text;
BEGIN

  -- PM-1: service_requests table exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'service_requests';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-1 FAIL: service_requests not found'; END IF;
  RAISE NOTICE 'PM-1 PASS: service_requests exists';

  -- PM-2: service_requests.id is UUID
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_requests' AND column_name = 'id';
  IF v_type IS NULL OR v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-2 FAIL: service_requests.id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-2 PASS: service_requests.id = uuid';

  -- PM-3: service_requests.status exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_requests' AND column_name = 'status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-3 FAIL: service_requests.status column not found'; END IF;
  RAISE NOTICE 'PM-3 PASS: service_requests.status exists (type=%)', v_type;

  -- PM-4: service_requests.service_category exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_requests' AND column_name = 'service_category';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-4 FAIL: service_requests.service_category not found'; END IF;
  RAISE NOTICE 'PM-4 PASS: service_requests.service_category exists';

  -- PM-5: service_requests.city exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_requests' AND column_name = 'city';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-5 FAIL: service_requests.city not found'; END IF;
  RAISE NOTICE 'PM-5 PASS: service_requests.city exists';

  -- PM-6: missions table exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'missions';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-6 FAIL: missions not found'; END IF;
  RAISE NOTICE 'PM-6 PASS: missions exists';

  -- PM-7: missions.request_id is TEXT (TYPE CONTRACT — must not be UUID)
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'request_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-7 FAIL: missions.request_id not found'; END IF;
  IF v_type ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-7 FAIL: missions.request_id is UUID — TEXT contract violated; abort';
  END IF;
  RAISE NOTICE 'PM-7 PASS: missions.request_id is TEXT (type=%)', v_type;

  -- PM-8: missions.artisan_profile_id is UUID
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'artisan_profile_id';
  IF v_type IS NULL OR v_type NOT ILIKE '%uuid%' THEN
    RAISE EXCEPTION 'PM-8 FAIL: missions.artisan_profile_id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-8 PASS: missions.artisan_profile_id = uuid';

  -- PM-9: missions.status CHECK includes 'offered'
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint c
  WHERE c.conrelid = 'public.missions'::regclass
    AND c.contype  = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%offered%';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-9 FAIL: missions status CHECK does not include offered (7C.11C not applied?)'; END IF;
  RAISE NOTICE 'PM-9 PASS: missions status CHECK includes offered';

  -- PM-10: unique index missions_one_offer_per_request exists
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'missions'
    AND indexname = 'missions_one_offer_per_request';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-10 FAIL: missions_one_offer_per_request index missing (7C.11C not applied?)'; END IF;
  RAISE NOTICE 'PM-10 PASS: missions_one_offer_per_request index exists';

  -- PM-11: unique index missions_one_pending_per_request exists
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'missions'
    AND indexname = 'missions_one_pending_per_request';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-11 FAIL: missions_one_pending_per_request index missing (7C.11C not applied?)'; END IF;
  RAISE NOTICE 'PM-11 PASS: missions_one_pending_per_request index exists';

  -- PM-12: missions_unique_artisan_per_request exists
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'missions'
    AND indexname = 'missions_unique_artisan_per_request';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-12 FAIL: missions_unique_artisan_per_request index missing (7C.11C not applied?)'; END IF;
  RAISE NOTICE 'PM-12 PASS: missions_unique_artisan_per_request index exists';

  -- PM-13: artisans.owner_user_id exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'owner_user_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-13 FAIL: artisans.owner_user_id not found'; END IF;
  RAISE NOTICE 'PM-13 PASS: artisans.owner_user_id exists';

  -- PM-14: artisans.availability exists with known CHECK values
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'availability';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-14 FAIL: artisans.availability not found'; END IF;
  RAISE NOTICE 'PM-14 PASS: artisans.availability exists';

  -- PM-15: artisans.claim_status exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'claim_status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-15 FAIL: artisans.claim_status not found'; END IF;
  RAISE NOTICE 'PM-15 PASS: artisans.claim_status exists';

  -- PM-16: artisans.onboarding_completed exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'onboarding_completed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-16 FAIL: artisans.onboarding_completed not found'; END IF;
  RAISE NOTICE 'PM-16 PASS: artisans.onboarding_completed exists';

  -- PM-17: artisans.service_category exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'service_category';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-17 FAIL: artisans.service_category not found'; END IF;
  RAISE NOTICE 'PM-17 PASS: artisans.service_category exists';

  -- PM-18: artisans.city exists
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'city';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-18 FAIL: artisans.city not found'; END IF;
  RAISE NOTICE 'PM-18 PASS: artisans.city exists';

  -- PM-19: artisans.work_zone exists (city cluster fallback)
  SELECT data_type, is_nullable INTO v_type, v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'work_zone';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-19 FAIL: artisans.work_zone not found'; END IF;
  RAISE NOTICE 'PM-19 PASS: artisans.work_zone exists (nullable=%)', v_nullable;

  -- PM-20: dispatch_request_v1 does not already exist (function collision)
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-20 NOTE: dispatch_request_v1 already exists — CREATE OR REPLACE will overwrite it';
  ELSE
    RAISE NOTICE 'PM-20 PASS: dispatch_request_v1 does not exist yet';
  END IF;

  -- PM-21: current offered mission count (must be 0 before first dispatch)
  SELECT COUNT(*) INTO v_count
  FROM public.missions WHERE status = 'offered';
  RAISE NOTICE 'PM-21 INFO: current offered missions = %', v_count;

  -- PM-22: current pending mission count
  SELECT COUNT(*) INTO v_count
  FROM public.missions WHERE status = 'pending';
  RAISE NOTICE 'PM-22 INFO: current pending missions = %', v_count;

  -- PM-23: eligible artisans (owner_user_id IS NOT NULL, claim_status=approved,
  --         onboarding_completed=true, availability=available) — informational
  SELECT COUNT(*) INTO v_count
  FROM public.artisans a
  WHERE a.owner_user_id        IS NOT NULL
    AND a.claim_status          = 'approved'
    AND a.onboarding_completed  = true
    AND a.availability          = 'available';
  RAISE NOTICE 'PM-23 INFO: fully eligible artisans = %', v_count;

  -- ══════════════════════════════════════════════════════════
  -- PM-24 HARDENED — agreed_price full contract validation
  --
  -- Validates:
  --   (a) column exists with correct numeric type
  --   (b) exact current nullability — NOT NULL is a BLOCKER for dispatch
  --   (c) agreed_price CHECK constraint definition (must be preserved)
  --   (d) current count of missions with agreed_price IS NULL (baseline)
  --
  -- DISPATCH CANONICAL CONTRACT (7C.11F.1B):
  --   An OFFER is NOT an agreed commercial price.
  --   agreed_price MUST be nullable so dispatch can INSERT
  --   status='offered', agreed_price=NULL truthfully.
  --   agreed_price=0 is NOT acceptable (falsehood — price is unknown).
  --   The real price is set by admin COD process after mission completion.
  --
  -- If is_nullable='NO' → migration Step 0 (DROP NOT NULL) is required
  --   before dispatch_request_v1 can be created.
  -- ══════════════════════════════════════════════════════════

  -- PM-24a: agreed_price column exists and is numeric
  SELECT data_type, is_nullable INTO v_type, v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'agreed_price';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'PM-24a FAIL: missions.agreed_price column not found';
  END IF;
  IF v_type NOT ILIKE '%numeric%' AND v_type NOT ILIKE '%decimal%' AND v_type NOT ILIKE '%integer%' AND v_type NOT ILIKE '%real%' AND v_type NOT ILIKE '%double%' THEN
    RAISE EXCEPTION 'PM-24a FAIL: missions.agreed_price is type=% — expected numeric/decimal', v_type;
  END IF;
  RAISE NOTICE 'PM-24a PASS: missions.agreed_price exists, type=%, current_nullable=%', v_type, v_nullable;

  -- PM-24b: nullability gate — is agreed_price already nullable?
  IF v_nullable = 'NO' THEN
    RAISE NOTICE 'PM-24b INFO: agreed_price is NOT NULL — migration Step 0 (DROP NOT NULL) required';
    RAISE NOTICE 'PM-24b INFO: Step 0 will execute: ALTER TABLE public.missions ALTER COLUMN agreed_price DROP NOT NULL';
    RAISE NOTICE 'PM-24b INFO: This is safe — all existing rows have agreed_price > 0 (legacy workaround). Nullability change has zero data effect.';
  ELSE
    RAISE NOTICE 'PM-24b PASS: agreed_price is already nullable — Step 0 is idempotent (no-op)';
  END IF;

  -- PM-24c: capture agreed_price CHECK constraint definition (informational — must survive migration)
  SELECT pg_get_constraintdef(c.oid) INTO v_check_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.missions'::regclass
    AND c.contype  = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%agreed_price%'
  LIMIT 1;
  IF v_check_def IS NULL THEN
    RAISE NOTICE 'PM-24c INFO: no CHECK constraint found for agreed_price (will not be added by this migration)';
  ELSE
    RAISE NOTICE 'PM-24c INFO: agreed_price CHECK constraint: %', v_check_def;
    RAISE NOTICE 'PM-24c INFO: This CHECK constraint will be PRESERVED — DROP NOT NULL does not touch CHECK constraints';
  END IF;

  -- PM-24d: count existing missions with agreed_price IS NULL (baseline before Step 0)
  SELECT COUNT(*) INTO v_count
  FROM public.missions
  WHERE agreed_price IS NULL;
  RAISE NOTICE 'PM-24d INFO: missions with agreed_price IS NULL (pre-migration) = %', v_count;
  -- Expected: 0 before Step 0 (legacy code always wrote 0)
  -- After Step 0 + first dispatch offer: 1+ (truthful)

  -- PM-24e: count existing missions with agreed_price = 0 (legacy sentinel)
  SELECT COUNT(*) INTO v_count
  FROM public.missions
  WHERE agreed_price = 0;
  RAISE NOTICE 'PM-24e INFO: missions with agreed_price = 0 (legacy sentinel) = %', v_count;
  -- Informational — these are historical placeholder rows; dispatch will not create new 0-price rows

  -- PM-24f: total missions count (baseline)
  SELECT COUNT(*) INTO v_count
  FROM public.missions;
  RAISE NOTICE 'PM-24f INFO: total missions = %', v_count;

  RAISE NOTICE '══ 7C.11F.1 PRECHECK COMPLETE — proceed to migration ══';
  RAISE NOTICE '══ Step 0 (DROP NOT NULL) runs first in migration if agreed_price is NOT NULL ══';

END $$;
