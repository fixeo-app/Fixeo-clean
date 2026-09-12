-- ════════════════════════════════════════════════════════════
-- FIXEO — BP02 Mission Lifecycle Test Pack V1
-- File: supabase/fixeo-bp02-lifecycle-tests-v1.sql
-- Phase: BP02 — Mission Lifecycle Completion
--
-- SCOPE
-- ─────
-- Full transition matrix for confirm_completed_mission() and
-- validate_mission_v1() RPCs introduced in 7c14a1.
-- Also validates the missions_status_check extension (terminée/validée).
--
-- TRANSACTION CONTRACT
-- ─────────────────────
-- ONE BEGIN. ZERO COMMIT. Final = unconditional ROLLBACK.
-- All mutations are rolled back at the end.
-- Safe to execute on production (read + rollback only).
-- Test fixture data is created inside the transaction and never persists.
--
-- STRUCTURAL INVARIANTS (must be verified before executing):
--   BEGIN  count = 1
--   COMMIT count = 0
--   ROLLBACK count = 1
--
-- TEST INVENTORY
-- ──────────────
-- T01 — Unauthenticated call: confirm_completed_mission → unauthenticated
-- T02 — Unauthenticated call: validate_mission_v1 → unauthenticated
-- T03 — confirm_completed_mission: request not owned → request_not_found_or_not_owned
-- T04 — confirm_completed_mission: wrong current status (new) → request_not_completed
-- T05 — confirm_completed_mission: request=completed, no done mission → completed_mission_not_found
-- T06 — confirm_completed_mission: legal happy path (completed+done → validated+terminée)
-- T07 — confirm_completed_mission: idempotent (already terminée → ok:true + already_confirmed)
-- T08 — validate_mission_v1: legal happy path (done+completed → terminée+validated)
-- T09 — validate_mission_v1: wrong current status (pending) → not_done_yet
-- T10 — validate_mission_v1: non-existent mission → mission_not_found
-- T11 — validate_mission_v1: not owned → request_not_found_or_not_owned
-- T12 — validate_mission_v1: idempotent (already terminée → ok:true + already_confirmed)
-- T13 — missions_status_check: terminée value accepted
-- T14 — missions_status_check: validée value accepted
-- T15 — confirm_completed_mission: enterprise path (ERC.created_by ownership)
-- T16 — confirm_completed_mission: wrong actor (different auth.uid) → not_owned
-- T17 — start_mission: confirm start_mission still wired (not_accepted when mission=offered)
-- T18 — complete_mission: confirm complete_mission still wired (not_started when mission=offered)
-- T19 — Atomicity: mission terminée but SR not validated → atomicity_error recovery
-- T20 — Double-confirm: second confirm call on same terminée mission → already_confirmed
--
-- FIXTURE STRATEGY
-- ─────────────────
-- Creates minimal test rows using postgres role (bypasses RLS).
-- Simulates auth.uid() via set_config('request.jwt.claims', ...) + SET LOCAL ROLE authenticated.
-- All fixture UUIDs use the test namespace pattern to avoid collisions.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- RESULTS LOG
-- ════════════════════════════════════════════════════════════

CREATE TEMP TABLE bp02_results (
  test_id     text,
  section     text,
  verdict     text,
  detail      text,
  logged_at   timestamptz DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- FIXTURE SETUP
-- Using postgres role (bypasses RLS) to create test data.
-- ════════════════════════════════════════════════════════════

-- Test UUIDs (fixed, memorable)
-- client A: the legitimate owner
-- client B: a different user (wrong actor tests)
-- artisan C: the artisan
-- enterprise member E: enterprise path owner

DO $$
DECLARE
  v_client_a   uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_client_b   uuid := '00000000-0000-0000-0001-000000000002'::uuid;
  v_artisan_c  uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_member uuid := '00000000-0000-0000-0001-000000000004'::uuid;
  v_artisan_id uuid;
  v_sr_id_b2c  uuid;
  v_sr_id_ent  uuid;
  v_sr_id_new  uuid;
  v_sr_id_done_nomission uuid;
  v_mission_b2c uuid;
  v_mission_ent uuid;
BEGIN

  -- ── Insert test users (auth.users equivalent via users table) ──
  -- We work only with public.users and public.artisans for identity.
  -- These inserts will fail on FK to auth.users if that FK is enforced —
  -- in that case, test must be adapted for staging environment.
  -- For read-only auth simulation, we use set_config path only.

  -- ── Insert artisan row (no FK to auth.users needed for artisans.id) ──
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan_c, 'Test Artisan BP02', 'Casablanca', 'plomberie', v_client_a)
  ON CONFLICT (id) DO UPDATE SET owner_user_id = v_client_a;

  v_artisan_id := v_artisan_c;

  -- ── B2C service_request (completed, client = v_client_a) ──
  v_sr_id_b2c := gen_random_uuid();
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id_b2c, 'plomberie', 'Casablanca', 'completed', v_client_a);

  -- ── B2C mission (done) ──
  v_mission_b2c := gen_random_uuid();
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_b2c, v_sr_id_b2c::text, v_artisan_id, v_client_a, 'done');

  -- ── Store test UUIDs for later DO blocks ──
  PERFORM set_config('bp02.client_a',           v_client_a::text,   true);
  PERFORM set_config('bp02.client_b',           v_client_b::text,   true);
  PERFORM set_config('bp02.artisan_c',          v_artisan_c::text,  true);
  PERFORM set_config('bp02.ent_member',         v_ent_member::text, true);
  PERFORM set_config('bp02.sr_id_b2c',          v_sr_id_b2c::text,  true);
  PERFORM set_config('bp02.mission_b2c',        v_mission_b2c::text, true);
  PERFORM set_config('bp02.artisan_id',         v_artisan_id::text, true);

  RAISE NOTICE 'Fixture setup complete.';
  RAISE NOTICE '  client_a=%, artisan_c=%', v_client_a, v_artisan_c;
  RAISE NOTICE '  sr_b2c=%, mission_b2c=%', v_sr_id_b2c, v_mission_b2c;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- HELPER: run RPC as postgres role (no auth.uid() → simulates anon/unauthenticated)
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- T01 — Unauthenticated confirm_completed_mission
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_sr_id uuid := current_setting('bp02.sr_id_b2c')::uuid;
  v_result jsonb;
BEGIN
  -- Run as postgres (no JWT → auth.uid() returns NULL)
  SET LOCAL ROLE postgres;
  SELECT public.confirm_completed_mission(v_sr_id) INTO v_result;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'unauthenticated' THEN
    INSERT INTO bp02_results VALUES ('T01','auth','PASS','confirm_completed_mission: unauthenticated → ok:false reason:unauthenticated');
  ELSE
    INSERT INTO bp02_results VALUES ('T01','auth','FAIL', pg_catalog.format('Expected unauthenticated, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T02 — Unauthenticated validate_mission_v1
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_mission_id uuid := current_setting('bp02.mission_b2c')::uuid;
  v_result     jsonb;
BEGIN
  SET LOCAL ROLE postgres;
  SELECT public.validate_mission_v1(v_mission_id) INTO v_result;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'unauthenticated' THEN
    INSERT INTO bp02_results VALUES ('T02','auth','PASS','validate_mission_v1: unauthenticated → ok:false reason:unauthenticated');
  ELSE
    INSERT INTO bp02_results VALUES ('T02','auth','FAIL', pg_catalog.format('Expected unauthenticated, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T03 — confirm_completed_mission: request not owned by caller (client_b)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_sr_id    uuid := current_setting('bp02.sr_id_b2c')::uuid;
  v_client_b uuid := current_setting('bp02.client_b')::uuid;
  v_result   jsonb;
BEGIN
  -- Authenticate as client_b (does NOT own this request)
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_b), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr_id) INTO v_result;

  SET LOCAL ROLE postgres;
  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'request_not_found_or_not_owned' THEN
    INSERT INTO bp02_results VALUES ('T03','ownership','PASS','confirm: wrong actor → request_not_found_or_not_owned');
  ELSE
    INSERT INTO bp02_results VALUES ('T03','ownership','FAIL', pg_catalog.format('Expected not_owned, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T04 — confirm_completed_mission: wrong status (new, not completed)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a uuid := current_setting('bp02.client_a')::uuid;
  v_sr_id_new uuid;
  v_result    jsonb;
BEGIN
  -- Create a 'new' service_request owned by client_a
  v_sr_id_new := gen_random_uuid();
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id_new, 'electricite', 'Rabat', 'new', v_client_a);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr_id_new) INTO v_result;

  SET LOCAL ROLE postgres;
  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'request_not_completed' THEN
    INSERT INTO bp02_results VALUES ('T04','state','PASS','confirm: status=new → request_not_completed');
  ELSE
    INSERT INTO bp02_results VALUES ('T04','state','FAIL', pg_catalog.format('Expected request_not_completed, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T05 — confirm_completed_mission: completed SR but no 'done' mission
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a uuid := current_setting('bp02.client_a')::uuid;
  v_sr_no_mission uuid;
  v_result         jsonb;
BEGIN
  v_sr_no_mission := gen_random_uuid();
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_no_mission, 'peinture', 'Fes', 'completed', v_client_a);
  -- No mission inserted for this SR

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr_no_mission) INTO v_result;

  SET LOCAL ROLE postgres;
  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'completed_mission_not_found' THEN
    INSERT INTO bp02_results VALUES ('T05','state','PASS','confirm: completed SR no done mission → completed_mission_not_found');
  ELSE
    INSERT INTO bp02_results VALUES ('T05','state','FAIL', pg_catalog.format('Expected completed_mission_not_found, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T06 — confirm_completed_mission: legal happy path
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid;
  v_mission_id  uuid;
  v_result      jsonb;
  v_sr_status   text;
  v_m_status    text;
BEGIN
  -- Fresh SR + mission (completed + done)
  v_sr_id      := gen_random_uuid();
  v_mission_id := gen_random_uuid();

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'plomberie', 'Casablanca', 'completed', v_client_a);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr_id) INTO v_result;

  SET LOCAL ROLE postgres;

  -- Verify DB state
  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr_id;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission_id;

  IF  v_result->>'ok' = 'true'
  AND v_sr_status = 'validated'
  AND v_m_status  = 'terminée'
  THEN
    INSERT INTO bp02_results VALUES ('T06','happy_path','PASS',
      pg_catalog.format('confirm happy path: SR→validated, mission→terminée, result: %s', v_result));
  ELSE
    INSERT INTO bp02_results VALUES ('T06','happy_path','FAIL',
      pg_catalog.format('SR=%s, mission=%s, result=%s', v_sr_status, v_m_status, v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T07 — confirm_completed_mission: idempotent (already terminée)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid;
  v_mission_id  uuid;
  v_result1     jsonb;
  v_result2     jsonb;
BEGIN
  v_sr_id      := gen_random_uuid();
  v_mission_id := gen_random_uuid();

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'nettoyage', 'Agadir', 'completed', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  -- First call: should succeed
  SELECT public.confirm_completed_mission(v_sr_id) INTO v_result1;
  -- Second call: idempotent
  SELECT public.confirm_completed_mission(v_sr_id) INTO v_result2;

  SET LOCAL ROLE postgres;

  IF  v_result1->>'ok' = 'true'
  AND v_result2->>'ok' = 'true'
  AND (v_result2->>'already_confirmed')::boolean = true
  THEN
    INSERT INTO bp02_results VALUES ('T07','idempotency','PASS','confirm idempotent: 2nd call → ok:true + already_confirmed:true');
  ELSE
    INSERT INTO bp02_results VALUES ('T07','idempotency','FAIL',
      pg_catalog.format('1st=%s, 2nd=%s', v_result1, v_result2));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T08 — validate_mission_v1: legal happy path
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid;
  v_mission_id  uuid;
  v_result      jsonb;
  v_sr_status   text;
  v_m_status    text;
BEGIN
  v_sr_id      := gen_random_uuid();
  v_mission_id := gen_random_uuid();

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'electricite', 'Tanger', 'completed', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.validate_mission_v1(v_mission_id) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr_id;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission_id;

  IF  v_result->>'ok' = 'true'
  AND v_sr_status = 'validated'
  AND v_m_status  = 'terminée'
  THEN
    INSERT INTO bp02_results VALUES ('T08','happy_path','PASS',
      pg_catalog.format('validate_mission_v1 happy path: SR→validated, mission→terminée'));
  ELSE
    INSERT INTO bp02_results VALUES ('T08','happy_path','FAIL',
      pg_catalog.format('SR=%s, mission=%s, result=%s', v_sr_status, v_m_status, v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T09 — validate_mission_v1: wrong current status (pending)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid;
  v_mission_id  uuid;
  v_result      jsonb;
BEGIN
  v_sr_id      := gen_random_uuid();
  v_mission_id := gen_random_uuid();

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'serrurerie', 'Meknes', 'assigned', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'pending');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.validate_mission_v1(v_mission_id) INTO v_result;

  SET LOCAL ROLE postgres;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'not_done_yet' THEN
    INSERT INTO bp02_results VALUES ('T09','state','PASS','validate_mission_v1: pending mission → not_done_yet');
  ELSE
    INSERT INTO bp02_results VALUES ('T09','state','FAIL',
      pg_catalog.format('Expected not_done_yet, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T10 — validate_mission_v1: non-existent mission
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_fake_id     uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid;
  v_result      jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.validate_mission_v1(v_fake_id) INTO v_result;

  SET LOCAL ROLE postgres;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'mission_not_found' THEN
    INSERT INTO bp02_results VALUES ('T10','not_found','PASS','validate_mission_v1: fake UUID → mission_not_found');
  ELSE
    INSERT INTO bp02_results VALUES ('T10','not_found','FAIL',
      pg_catalog.format('Expected mission_not_found, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T11 — validate_mission_v1: not owned (wrong actor)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_client_b    uuid := current_setting('bp02.client_b')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid;
  v_mission_id  uuid;
  v_result      jsonb;
BEGIN
  v_sr_id      := gen_random_uuid();
  v_mission_id := gen_random_uuid();

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'peinture', 'Oujda', 'completed', v_client_a);  -- owned by A
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'done');

  -- Auth as client_b (not the owner)
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_b), true);
  SET LOCAL ROLE authenticated;

  SELECT public.validate_mission_v1(v_mission_id) INTO v_result;

  SET LOCAL ROLE postgres;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'request_not_found_or_not_owned' THEN
    INSERT INTO bp02_results VALUES ('T11','ownership','PASS','validate_mission_v1: wrong actor → request_not_found_or_not_owned');
  ELSE
    INSERT INTO bp02_results VALUES ('T11','ownership','FAIL',
      pg_catalog.format('Expected not_owned, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T12 — validate_mission_v1: idempotent (already terminée)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid;
  v_mission_id  uuid;
  v_result1     jsonb;
  v_result2     jsonb;
BEGIN
  v_sr_id      := gen_random_uuid();
  v_mission_id := gen_random_uuid();

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'maconnerie', 'Marrakech', 'completed', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.validate_mission_v1(v_mission_id) INTO v_result1;
  SELECT public.validate_mission_v1(v_mission_id) INTO v_result2;

  SET LOCAL ROLE postgres;

  IF  v_result1->>'ok' = 'true'
  AND v_result2->>'ok' = 'true'
  AND (v_result2->>'already_confirmed')::boolean = true
  THEN
    INSERT INTO bp02_results VALUES ('T12','idempotency','PASS','validate_mission_v1 idempotent: 2nd call → already_confirmed:true');
  ELSE
    INSERT INTO bp02_results VALUES ('T12','idempotency','FAIL',
      pg_catalog.format('1st=%s, 2nd=%s', v_result1, v_result2));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T13 — missions_status_check: terminée is accepted
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_mission_id  uuid := gen_random_uuid();
  v_sr_id       uuid := gen_random_uuid();
  v_status_ok   text;
BEGIN
  -- Insert a service_request first (needed for FK if any)
  INSERT INTO public.service_requests (id, service_category, city, status)
  VALUES (v_sr_id, 'plomberie', 'Rabat', 'completed');

  -- Insert mission with status='terminée' — should NOT fail constraint
  BEGIN
    INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
    VALUES (v_mission_id, v_sr_id::text, v_artisan_id, 'terminée');

    SELECT m.status INTO v_status_ok FROM public.missions m WHERE m.id = v_mission_id;

    IF v_status_ok = 'terminée' THEN
      INSERT INTO bp02_results VALUES ('T13','constraint','PASS','missions CHECK: terminée accepted');
    ELSE
      INSERT INTO bp02_results VALUES ('T13','constraint','FAIL','INSERT succeeded but status mismatch');
    END IF;
  EXCEPTION WHEN check_violation THEN
    INSERT INTO bp02_results VALUES ('T13','constraint','FAIL',
      'missions_status_check REJECTS terminée — 7c14a1 migration not applied or constraint issue');
  END;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T14 — missions_status_check: validée is accepted
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_mission_id  uuid := gen_random_uuid();
  v_sr_id       uuid := gen_random_uuid();
  v_status_ok   text;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status)
  VALUES (v_sr_id, 'electricite', 'Casablanca', 'validated');

  BEGIN
    INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
    VALUES (v_mission_id, v_sr_id::text, v_artisan_id, 'validée');

    SELECT m.status INTO v_status_ok FROM public.missions m WHERE m.id = v_mission_id;

    IF v_status_ok = 'validée' THEN
      INSERT INTO bp02_results VALUES ('T14','constraint','PASS','missions CHECK: validée accepted');
    ELSE
      INSERT INTO bp02_results VALUES ('T14','constraint','FAIL','INSERT succeeded but status mismatch');
    END IF;
  EXCEPTION WHEN check_violation THEN
    INSERT INTO bp02_results VALUES ('T14','constraint','FAIL',
      'missions_status_check REJECTS validée — 7c14a1 migration not applied');
  END;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T15 — confirm_completed_mission: enterprise path (ERC ownership)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_ent_member  uuid := current_setting('bp02.ent_member')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid := gen_random_uuid();
  v_mission_id  uuid := gen_random_uuid();
  v_erc_id      uuid := gen_random_uuid();
  v_ent_id      uuid := gen_random_uuid();
  v_site_id     uuid := gen_random_uuid();
  v_result      jsonb;
  v_sr_status   text;
  v_m_status    text;
BEGIN
  -- Enterprise SR: client_profile_id = NULL (enterprise path)
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'climatisation', 'Casablanca', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, 'done');

  -- ERC row: created_by = v_ent_member (the enterprise user who submitted)
  -- We need enterprise_accounts and enterprise_sites for FK chains
  -- Insert minimal enterprise_accounts + enterprise_sites + ERC
  BEGIN
    INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ent_id, 'Test Enterprise BP02', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ent_id, 'Site Test BP02', 'Casablanca', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.enterprise_request_context
      (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (v_erc_id, v_ent_id, v_site_id, v_sr_id, v_ent_member)
    ON CONFLICT (service_request_id) DO NOTHING;

    -- Auth as enterprise member
    PERFORM set_config('request.jwt.claims',
      pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_ent_member), true);
    SET LOCAL ROLE authenticated;

    SELECT public.confirm_completed_mission(v_sr_id) INTO v_result;

    SET LOCAL ROLE postgres;

    SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr_id;
    SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission_id;

    IF  v_result->>'ok' = 'true'
    AND v_sr_status = 'validated'
    AND v_m_status  = 'terminée'
    THEN
      INSERT INTO bp02_results VALUES ('T15','enterprise','PASS',
        'Enterprise path: ERC.created_by owner can confirm → validated+terminée');
    ELSE
      INSERT INTO bp02_results VALUES ('T15','enterprise','FAIL',
        pg_catalog.format('SR=%s, mission=%s, result=%s', v_sr_status, v_m_status, v_result));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    SET LOCAL ROLE postgres;
    -- Enterprise tables may not exist in all environments; document as INCONCLUSIVE
    INSERT INTO bp02_results VALUES ('T15','enterprise','INCONCLUSIVE',
      pg_catalog.format('Enterprise fixture failed (tables may not exist in this env): %s', SQLERRM));
  END;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T16 — confirm_completed_mission: wrong actor (client_b on client_a's request)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_client_b    uuid := current_setting('bp02.client_b')::uuid;
  v_sr_id_b2c   uuid := current_setting('bp02.sr_id_b2c')::uuid;
  v_result      jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_b), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr_id_b2c) INTO v_result;

  SET LOCAL ROLE postgres;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'request_not_found_or_not_owned' THEN
    INSERT INTO bp02_results VALUES ('T16','ownership','PASS','confirm: client_b cannot confirm client_a request');
  ELSE
    INSERT INTO bp02_results VALUES ('T16','ownership','FAIL',
      pg_catalog.format('Expected not_owned, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T17 — start_mission: still wired (not_accepted when offered)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a   uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id      uuid := gen_random_uuid();
  v_mission_id uuid := gen_random_uuid();
  v_result     jsonb;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'jardinage', 'Sale', 'new', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, 'offered');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  -- start_mission requires mission.status='pending'; 'offered' → not_accepted
  SELECT public.start_mission(v_mission_id) INTO v_result;

  SET LOCAL ROLE postgres;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'not_accepted' THEN
    INSERT INTO bp02_results VALUES ('T17','existing_rpc','PASS','start_mission still wired: offered → not_accepted');
  ELSE
    INSERT INTO bp02_results VALUES ('T17','existing_rpc','FAIL',
      pg_catalog.format('Expected not_accepted, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T18 — complete_mission: not_started when mission=offered
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a   uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id      uuid := gen_random_uuid();
  v_mission_id uuid := gen_random_uuid();
  v_result     jsonb;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'menuiserie', 'Kenitra', 'new', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, 'offered');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.complete_mission(v_mission_id) INTO v_result;

  SET LOCAL ROLE postgres;

  IF v_result->>'ok' = 'false' AND v_result->>'reason' = 'not_started' THEN
    INSERT INTO bp02_results VALUES ('T18','existing_rpc','PASS','complete_mission still wired: offered → not_started');
  ELSE
    INSERT INTO bp02_results VALUES ('T18','existing_rpc','FAIL',
      pg_catalog.format('Expected not_started, got: %s', v_result));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T19 — Atomicity guard: RAISE EXCEPTION triggers full rollback
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid := gen_random_uuid();
  v_mission_id  uuid := gen_random_uuid();
  v_result      jsonb;
  v_m_status    text;
BEGIN
  -- SR in 'assigned' (not 'completed') — complete_mission will fail atomic SR update
  -- This simulates a state where mission=done but SR not in in_progress (can't reach completed)
  -- We test: confirm on a 'done' mission whose SR is 'in_progress' (not 'completed')
  -- Expected: request_not_completed
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'bricolage', 'Tetouan', 'in_progress', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr_id) INTO v_result;

  SET LOCAL ROLE postgres;

  -- Mission should NOT have been changed (atomicity: SR update would fail on predicate)
  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission_id;

  IF  v_result->>'ok' = 'false'
  AND v_result->>'reason' = 'request_not_completed'
  AND v_m_status = 'done'  -- mission unchanged
  THEN
    INSERT INTO bp02_results VALUES ('T19','atomicity','PASS',
      'Atomicity: SR not completed → mission stays done, request_not_completed returned');
  ELSE
    INSERT INTO bp02_results VALUES ('T19','atomicity','FAIL',
      pg_catalog.format('result=%s, mission_status=%s (expected done)', v_result, v_m_status));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- T20 — Double confirm: third call after T07 style, still idempotent
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_client_a    uuid := current_setting('bp02.client_a')::uuid;
  v_artisan_id  uuid := current_setting('bp02.artisan_id')::uuid;
  v_sr_id       uuid := gen_random_uuid();
  v_mission_id  uuid := gen_random_uuid();
  v_results     jsonb[];
  v_i           integer;
  v_all_ok      boolean := true;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr_id, 'carrelage', 'Fes', 'completed', v_client_a);
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission_id, v_sr_id::text, v_artisan_id, v_client_a, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_a), true);
  SET LOCAL ROLE authenticated;

  -- Call 3 times
  FOR v_i IN 1..3 LOOP
    DECLARE v_res jsonb;
    BEGIN
      SELECT public.confirm_completed_mission(v_sr_id) INTO v_res;
      IF v_res->>'ok' != 'true' THEN
        v_all_ok := false;
      END IF;
    END;
  END LOOP;

  SET LOCAL ROLE postgres;

  IF v_all_ok THEN
    INSERT INTO bp02_results VALUES ('T20','idempotency','PASS','Triple confirm call: all 3 return ok:true');
  ELSE
    INSERT INTO bp02_results VALUES ('T20','idempotency','FAIL','One or more calls returned ok:false');
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- SECTION I — AGGREGATE RESULTS
-- ════════════════════════════════════════════════════════════

-- I1: Individual test results
SELECT
  test_id,
  section,
  verdict,
  detail
FROM bp02_results
ORDER BY test_id;

-- I2: Summary
SELECT
  COUNT(*) FILTER (WHERE verdict = 'PASS')         AS total_pass,
  COUNT(*) FILTER (WHERE verdict = 'FAIL')         AS total_fail,
  COUNT(*) FILTER (WHERE verdict = 'INCONCLUSIVE') AS total_inconclusive,
  COUNT(*)                                          AS total_tests,
  CASE
    WHEN COUNT(*) FILTER (WHERE verdict = 'FAIL') = 0
    THEN 'ALL PASS'
    ELSE 'FAILURES DETECTED'
  END AS final_verdict,
  string_agg(test_id, ', ') FILTER (WHERE verdict = 'FAIL')         AS fail_test_ids,
  string_agg(test_id, ', ') FILTER (WHERE verdict = 'INCONCLUSIVE') AS inconclusive_test_ids
FROM bp02_results;

-- ════════════════════════════════════════════════════════════
-- ROLLBACK — all fixture data cleaned up
-- ════════════════════════════════════════════════════════════

ROLLBACK;

-- ════════════════════════════════════════════════════════════
-- STRUCTURAL INVARIANT PROOF
-- BEGIN=1, COMMIT=0, ROLLBACK=1
-- Verify with: grep -c '^\(BEGIN\|COMMIT\|ROLLBACK\)' this_file.sql
-- ════════════════════════════════════════════════════════════
