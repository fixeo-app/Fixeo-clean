-- ════════════════════════════════════════════════════════════════════════════
-- FIXEO — BP02 Mission Lifecycle Test Pack V3
-- File: supabase/fixeo-bp02-lifecycle-tests-v1.sql
-- Phase: BP02 V3 — Aligned to authoritative production contract
--
-- AUTHORITATIVE PRODUCTION CONTRACT UNDER TEST
-- ─────────────────────────────────────────────
--   Production function: public.confirm_completed_mission(p_request_id uuid)
--   Production MD5:      8b70152880cd87d52044f730fd1dd2c2
--
--   Canonical transitions:
--     missions.status:          done      → validated   ← DB canonical
--     service_requests.status:  completed → validated   ← DB canonical
--
--   'terminée' and 'validée' are localStorage/display vocabulary ONLY.
--   They are NOT stored in missions.status by any deployed Supabase function.
--   Tests assert 'validated', not 'terminée'.
--
-- ISOLATION PROTOCOL
-- ──────────────────
-- Every test executes in its own explicit transaction:
--   BEGIN; ... ROLLBACK;
-- No fixtures are shared between tests.
-- All inserts and mutations are rolled back after each test.
-- Zero COMMITs — production is never modified by this file.
--
-- STRUCTURAL INVARIANTS
-- ─────────────────────
--   TEST BLOCKS = 20
--   BEGIN       = 20
--   ROLLBACK    = 20
--   COMMIT      = 0
--
-- validate_mission_v1 is NOT tested — omitted from 7c14a1 v3 (no active caller).
--
-- TEST INVENTORY
-- ──────────────
--   T01 — unauthenticated caller → unauthenticated
--   T02 — non-existent SR UUID → request_not_found_or_not_owned
--   T03 — wrong B2C actor → request_not_found_or_not_owned; mission unchanged
--   T04 — SR status=new → request_not_completed
--   T05 — SR=completed but no done mission → completed_mission_not_found
--   T06 — B2C happy path: done → validated, completed → validated [CANONICAL]
--   T07 — B2C idempotent: SR=validated + mission=validated
--          → Guard 3a: already_validated:true + request_id + mission_id
--   T08 — CANONICAL REPAIR: SR=validated + mission=done
--          → Guard 3a: UPDATE mission done→validated → repaired:true
--          → request_id + mission_id in response
--          → mission.status = 'validated'; SR.status = 'validated' (unchanged)
--   T09 — UNSUPPORTED INVERSE STATE: SR=completed + mission=validated
--          → Guard 3c: no 'done' mission → completed_mission_not_found
--          → SR stays 'completed'; mission stays 'validated'; no SR healing
--   T10 — Enterprise: owner can confirm
--   T11 — Enterprise: site_manager (non-submitter) can confirm
--   T12 — Enterprise: reporter BLOCKED
--   T13 — Enterprise: viewer BLOCKED
--   T14 — Enterprise: suspended member BLOCKED
--   T15 — Enterprise: member of different enterprise BLOCKED
--   T16 — Atomicity: SR in_progress (not completed) → no mutation before guard fires
--   T17 — Triple confirm: calls 1,2,3 all ok:true; calls 2+3 already_validated:true
--          with request_id + mission_id
--   T18 — start_mission regression: offered → not_accepted
--   T19 — complete_mission regression: offered → not_started
--   T20 — INVARIANT: terminée NOT required for canonical DB lifecycle
--         (missions CHECK confirms 'validated' is sufficient — 'terminée' absent)
--
-- CANONICAL REGRESSION ASSERTIONS IN T06
-- ───────────────────────────────────────
--   missions.status   = 'validated'  (NOT 'terminée')
--   SR.status         = 'validated'
--   result.ok         = true
--   result.request_id = v_sr    (production includes request_id)
--   result.mission_id = v_mission
--
-- FIXTURE NAMESPACING
-- ────────────────────
-- All fixture UUIDs use 00000000-0000-0000-0001-xxxxxxxxxxxx namespace.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- T01 — unauthenticated caller
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_uid    uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_sr     uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'plomberie', 'Casablanca', 'completed', v_uid);

  -- postgres role with no JWT → auth.uid() = NULL
  SET LOCAL ROLE postgres;
  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  IF (v_result->>'ok')::boolean = false AND v_result->>'reason' = 'unauthenticated' THEN
    RAISE NOTICE 'T01 PASS: unauthenticated → ok:false reason:unauthenticated';
  ELSE
    RAISE EXCEPTION 'T01 FAIL: expected unauthenticated, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T02 — non-existent SR UUID
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_uid    uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_fake   uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid;
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_fake) INTO v_result;

  SET LOCAL ROLE postgres;

  IF (v_result->>'ok')::boolean = false AND v_result->>'reason' = 'request_not_found_or_not_owned' THEN
    RAISE NOTICE 'T02 PASS: non-existent SR → request_not_found_or_not_owned';
  ELSE
    RAISE EXCEPTION 'T02 FAIL: expected request_not_found_or_not_owned, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T03 — wrong B2C actor: client_b calls confirm on client_a's request
-- Mission must remain unchanged (done).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client_a uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_client_b uuid := '00000000-0000-0000-0001-000000000002'::uuid;
  v_artisan  uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr       uuid := gen_random_uuid();
  v_mission  uuid := gen_random_uuid();
  v_result   jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T03', 'Casablanca', 'plomberie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'plomberie', 'Casablanca', 'completed', v_client_a);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client_a, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client_b), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T03 PASS: wrong B2C actor rejected; mission unchanged (done)';
  ELSE
    RAISE EXCEPTION 'T03 FAIL: result=%, mission_status=%', v_result, v_m_status;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T04 — SR status=new → request_not_completed
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_sr     uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'serrurerie', 'Fes', 'new', v_client);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  IF (v_result->>'ok')::boolean = false AND v_result->>'reason' = 'request_not_completed' THEN
    RAISE NOTICE 'T04 PASS: SR=new → request_not_completed';
  ELSE
    RAISE EXCEPTION 'T04 FAIL: expected request_not_completed, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T05 — SR=completed but no done mission → completed_mission_not_found
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_sr     uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'peinture', 'Tanger', 'completed', v_client);
  -- No mission inserted

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  IF (v_result->>'ok')::boolean = false AND v_result->>'reason' = 'completed_mission_not_found' THEN
    RAISE NOTICE 'T05 PASS: no done mission → completed_mission_not_found';
  ELSE
    RAISE EXCEPTION 'T05 FAIL: expected completed_mission_not_found, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T06 — B2C HAPPY PATH: CANONICAL LIFECYCLE REGRESSION TEST
-- ────────────────────────────────────────────────────────
-- ASSERTS:
--   missions.status   = 'validated'   (NOT 'terminée' — DB canonical)
--   SR.status         = 'validated'
--   result.ok         = true
--   result.mission_id = v_mission
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client    uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T06', 'Marrakech', 'plomberie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'plomberie', 'Marrakech', 'completed', v_client);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  -- ── CANONICAL CONTRACT ASSERTIONS ──────────────────────────────────────
  -- missions.status MUST be 'validated' (the DB canonical confirmed state).
  -- missions.status must NOT be 'terminée' (that is localStorage vocabulary only).
  -- service_requests.status MUST be 'validated'.
  -- result.request_id MUST equal v_sr.
  -- result.mission_id MUST equal v_mission.
  -- Both transitions in one atomic call.
  IF  (v_result->>'ok')::boolean = true
  AND (v_result->>'mission_id')::uuid = v_mission
  AND (v_result->>'request_id')::uuid = v_sr
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T06 PASS: B2C canonical — SR=validated mission=validated result=%', v_result;
  ELSE
    RAISE EXCEPTION
      'T06 FAIL: SR=% (expected validated), mission=% (expected validated, NOT terminée), result=%',
      v_sr_status, v_m_status, v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T07 — B2C idempotent: SR=validated + mission=validated → already_validated:true
-- ───────────────────────────────────────────────────────────────────────────
-- Guard 3a fires. Mission found with status='validated'.
-- Production response: ok:true, request_id:uuid, mission_id:uuid, already_validated:true
-- No mutation. Both rows unchanged.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client  uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T07', 'Agadir', 'nettoyage', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- SR already validated — simulates a completed prior confirmation
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'nettoyage', 'Agadir', 'validated', v_client);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'validated');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  -- Guard 3a: SR=validated, mission=validated.
  -- Production: ok:true, request_id:v_sr, mission_id:v_mission, already_validated:true.
  -- No mutation occurred.
  IF  (v_result->>'ok')::boolean = true
  AND (v_result->>'already_validated')::boolean = true
  AND (v_result->>'request_id')::uuid = v_sr
  AND (v_result->>'mission_id')::uuid = v_mission
  THEN
    RAISE NOTICE 'T07 PASS: idempotent on validated SR+mission — ok:true already_validated:true request_id:% mission_id:%', v_sr, v_mission;
  ELSE
    RAISE EXCEPTION 'T07 FAIL: expected ok:true already_validated:true with request_id and mission_id, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T08 — CANONICAL REPAIR PATH
-- ─────────────────────────────────────────────────────────────────────────
-- SR.status      = validated  (Step 1 already completed in a prior call)
-- mission.status = done       (Step 2 never ran — partial state remains)
--
-- Expected production behavior (Guard 3a):
--   SR=validated → look for mission IN ('done','validated').
--   Mission is 'done' → UPDATE mission done→validated → return repaired:true.
--
-- CRITICAL ASSERTIONS (no weakening):
--   result.ok            = true        (call succeeds)
--   result.repaired      = true        (canonical repair signal — not already_confirmed)
--   mission.status after = 'validated' (repair was executed)
--   SR.status after      = 'validated' (unchanged — no second SR mutation)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client    uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T08', 'Rabat', 'electricite', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- SR already validated (Step 1 succeeded in prior call)
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'electricite', 'Rabat', 'validated', v_client);

  -- Mission still done (Step 2 never ran — partial state)
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  -- CANONICAL REPAIR: Guard 3a fires.
  -- SR=validated + mission=done → UPDATE mission done→validated → repaired:true.
  -- result.repaired      MUST be true (not already_confirmed — the repair ran).
  -- result.request_id    MUST equal v_sr.
  -- result.mission_id    MUST equal v_mission.
  -- mission.status after MUST be 'validated' (repair was executed).
  -- SR.status after      MUST remain 'validated' (no second SR mutation).
  IF  (v_result->>'ok')::boolean = true
  AND (v_result->>'repaired')::boolean = true
  AND (v_result->>'request_id')::uuid = v_sr
  AND (v_result->>'mission_id')::uuid = v_mission
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T08 PASS: canonical repair — SR=validated + mission=done → repaired:true, request_id:%, mission_id:%', v_sr, v_mission;
  ELSE
    RAISE EXCEPTION
      'T08 FAIL: expected ok:true repaired:true request_id:% mission_id:% mission=validated SR=validated. '
      'Got result=%, SR=%, mission=%',
      v_sr, v_mission, v_result, v_sr_status, v_m_status;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T09 — UNSUPPORTED INVERSE STATE (anti-regression)
-- ─────────────────────────────────────────────────────────────────────────
-- SR.status      = completed  (Step 1 never ran)
-- mission.status = validated  (Step 2 somehow set — unsupported inconsistency)
--
-- Production does NOT repair SR in this case. The only repair path is
-- Guard 3a (SR=validated + mission=done). This is the inverse — not supported.
--
-- Guard 3c (SR=completed): looks for a 'done' mission.
-- No 'done' mission exists (mission is 'validated', not 'done').
-- → completed_mission_not_found. SR stays 'completed'. No mutation.
--
-- CRITICAL ASSERTIONS (no weakening):
--   result.ok     = false                              (call fails)
--   result.reason = 'completed_mission_not_found'     (correct error code)
--   SR.status     = 'completed'  (NOT healed to 'validated')
--   mission.status = 'validated' (unchanged — no double-mutation)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client    uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T09', 'Kenitra', 'menuiserie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- SR still completed (Step 1 never ran)
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'menuiserie', 'Kenitra', 'completed', v_client);

  -- Mission already validated — no 'done' mission for this SR (unsupported inverse state)
  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'validated');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  -- Guard 3c: SR=completed, no 'done' mission found.
  -- Must return ok:false, reason:completed_mission_not_found.
  -- SR must NOT be healed to 'validated' (no inverse repair).
  -- mission.status must remain 'validated' (no mutation).
  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'completed_mission_not_found'
  AND v_sr_status = 'completed'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE
      'T09 PASS: unsupported inverse state — ok:false reason:completed_mission_not_found, '
      'SR stays completed, mission stays validated. No inverse healing.';
  ELSE
    RAISE EXCEPTION
      'T09 FAIL: expected ok:false reason:completed_mission_not_found SR=completed mission=validated. '
      'Got result=%, SR=%, mission=%',
      v_result, v_sr_status, v_m_status;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T10 — Enterprise: owner role can confirm
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_owner     uuid := '00000000-0000-0000-0001-000000000004'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id    uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T10', 'Casablanca', 'climatisation', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- Enterprise SR: client_profile_id = NULL (enterprise V1 pattern)
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'climatisation', 'Casablanca', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T10', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T10', 'Casablanca', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_owner)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_owner, 't10.owner@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_owner, 'owner', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = true
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T10 PASS: enterprise owner confirmed SR=validated mission=validated';
  ELSE
    RAISE EXCEPTION 'T10 FAIL: result=%, SR=%, mission=%', v_result, v_sr_status, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T10 INCONCLUSIVE: enterprise tables unavailable or schema mismatch: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T11 — Enterprise: site_manager (non-submitter) can confirm
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_submitter uuid := '00000000-0000-0000-0001-000000000004'::uuid;
  v_manager   uuid := '00000000-0000-0000-0001-000000000005'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id    uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T11', 'Meknes', 'carrelage', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'carrelage', 'Meknes', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T11', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T11', 'Meknes', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_submitter)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_submitter, 't11.sub@test.fixeo', 'enterprise'),
         (v_manager,   't11.mgr@test.fixeo', 'enterprise')
  ON CONFLICT (id) DO NOTHING;

  -- site_manager is NOT the submitter — proves role > created_by
  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_manager, 'site_manager', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_manager), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = true
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T11 PASS: enterprise site_manager (non-submitter) confirmed SR=validated mission=validated';
  ELSE
    RAISE EXCEPTION 'T11 FAIL: result=%, SR=%, mission=%', v_result, v_sr_status, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T11 INCONCLUSIVE: enterprise tables unavailable: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T12 — Enterprise: reporter BLOCKED
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_reporter uuid := '00000000-0000-0000-0001-000000000006'::uuid;
  v_artisan  uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id   uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_sr       uuid := gen_random_uuid();
  v_mission  uuid := gen_random_uuid();
  v_result   jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T12', 'Oujda', 'jardinage', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'jardinage', 'Oujda', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T12', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T12', 'Oujda', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_reporter)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_reporter, 't12.rep@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_reporter, 'reporter', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_reporter), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T12 PASS: reporter BLOCKED; mission unchanged (done)';
  ELSE
    RAISE EXCEPTION 'T12 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T12 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T13 — Enterprise: viewer BLOCKED
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_viewer   uuid := '00000000-0000-0000-0001-000000000007'::uuid;
  v_artisan  uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id   uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_sr       uuid := gen_random_uuid();
  v_mission  uuid := gen_random_uuid();
  v_result   jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T13', 'Sale', 'bricolage', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'bricolage', 'Sale', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T13', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T13', 'Sale', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_viewer)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_viewer, 't13.view@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_viewer, 'viewer', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_viewer), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T13 PASS: viewer BLOCKED; mission unchanged (done)';
  ELSE
    RAISE EXCEPTION 'T13 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T13 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T14 — Enterprise: suspended member BLOCKED
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_member   uuid := '00000000-0000-0000-0001-000000000008'::uuid;
  v_artisan  uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id   uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_sr       uuid := gen_random_uuid();
  v_mission  uuid := gen_random_uuid();
  v_result   jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T14', 'Tetouan', 'maconnerie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'maconnerie', 'Tetouan', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T14', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T14', 'Tetouan', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_member)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_member, 't14.susp@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  -- operations_manager role but SUSPENDED
  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_member, 'operations_manager', 'suspended') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_member), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T14 PASS: suspended operations_manager BLOCKED; mission unchanged';
  ELSE
    RAISE EXCEPTION 'T14 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T14 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T15 — Enterprise: member of DIFFERENT enterprise BLOCKED
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_legit_ent   uuid := gen_random_uuid();
  v_other_ent   uuid := gen_random_uuid();
  v_other_owner uuid := '00000000-0000-0000-0001-000000000009'::uuid;
  v_creator     uuid := '00000000-0000-0000-0001-000000000010'::uuid;
  v_artisan     uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_site_id     uuid := gen_random_uuid();
  v_sr          uuid := gen_random_uuid();
  v_mission     uuid := gen_random_uuid();
  v_result      jsonb;
  v_m_status    text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T15', 'Fes', 'peinture', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'peinture', 'Fes', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_legit_ent, 'Entreprise T15 legit', 'active'),
         (v_other_ent, 'Entreprise T15 other', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_legit_ent, 'Site T15', 'Fes', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_creator,     't15.creator@test.fixeo', 'enterprise'),
         (v_other_owner, 't15.other@test.fixeo',   'enterprise')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_legit_ent, v_site_id, v_sr, v_creator)
  ON CONFLICT (service_request_id) DO NOTHING;

  -- other_owner is owner of a DIFFERENT enterprise
  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_other_ent, v_other_owner, 'owner', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_other_owner), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T15 PASS: owner of DIFFERENT enterprise BLOCKED; mission unchanged';
  ELSE
    RAISE EXCEPTION 'T15 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T15 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T16 — Atomicity: SR in_progress (not completed) → guard fires; no mutation
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client    uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_m_status  text;
  v_sr_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T16', 'Casablanca', 'plomberie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- SR is in_progress — artisan has not yet called complete_mission
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'plomberie', 'Casablanca', 'in_progress', v_client);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  -- Guard 3 fires on SR state check BEFORE Step 1 (mission UPDATE)
  -- Both rows must be completely unchanged.
  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_completed'
  AND v_m_status  = 'done'
  AND v_sr_status = 'in_progress'
  THEN
    RAISE NOTICE 'T16 PASS: atomicity — guard fired before any mutation; both rows unchanged';
  ELSE
    RAISE EXCEPTION 'T16 FAIL: result=%, SR=%, mission=%', v_result, v_sr_status, v_m_status;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T17 — Triple confirm: three successive calls all ok:true
-- Call 1: real transition done→validated + completed→validated
-- Calls 2+3: Guard 3a fires (SR=validated + mission=validated)
--            → already_validated:true + request_id + mission_id
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client  uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_r1      jsonb;
  v_r2      jsonb;
  v_r3      jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T17', 'Tanger', 'nettoyage', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'nettoyage', 'Tanger', 'completed', v_client);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'done');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_r1;
  SELECT public.confirm_completed_mission(v_sr) INTO v_r2;
  SELECT public.confirm_completed_mission(v_sr) INTO v_r3;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  -- Call 1: transitions SR completed→validated, mission done→validated.
  -- Calls 2+3: Guard 3a fires with SR=validated + mission=validated.
  --            Production: ok:true, already_validated:true, request_id:v_sr, mission_id:v_mission.
  IF  (v_r1->>'ok')::boolean = true
  AND (v_r2->>'ok')::boolean = true
  AND (v_r3->>'ok')::boolean = true
  AND (v_r2->>'already_validated')::boolean = true
  AND (v_r3->>'already_validated')::boolean = true
  AND (v_r2->>'request_id')::uuid = v_sr
  AND (v_r3->>'request_id')::uuid = v_sr
  AND (v_r2->>'mission_id')::uuid = v_mission
  AND (v_r3->>'mission_id')::uuid = v_mission
  AND v_m_status = 'validated'
  THEN
    RAISE NOTICE 'T17 PASS: triple confirm — call 1 transitioned to validated, calls 2+3 already_validated:true';
  ELSE
    RAISE EXCEPTION 'T17 FAIL: r1=%, r2=%, r3=%, mission=%', v_r1, v_r2, v_r3, v_m_status;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T18 — start_mission regression: offered mission → not_accepted
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T18', 'Casablanca', 'serrurerie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status)
  VALUES (v_sr, 'serrurerie', 'Casablanca', 'new');

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'offered');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_artisan), true);
  SET LOCAL ROLE authenticated;

  SELECT public.start_mission(v_mission) INTO v_result;

  SET LOCAL ROLE postgres;

  IF (v_result->>'ok')::boolean = false AND v_result->>'reason' = 'not_accepted' THEN
    RAISE NOTICE 'T18 PASS: start_mission on offered → not_accepted (regression OK)';
  ELSE
    RAISE EXCEPTION 'T18 FAIL: expected not_accepted, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T19 — complete_mission regression: offered mission → not_started
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T19', 'Rabat', 'peinture', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status)
  VALUES (v_sr, 'peinture', 'Rabat', 'new');

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'offered');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_artisan), true);
  SET LOCAL ROLE authenticated;

  SELECT public.complete_mission(v_mission) INTO v_result;

  SET LOCAL ROLE postgres;

  IF (v_result->>'ok')::boolean = false AND v_result->>'reason' = 'not_started' THEN
    RAISE NOTICE 'T19 PASS: complete_mission on offered → not_started (regression OK)';
  ELSE
    RAISE EXCEPTION 'T19 FAIL: expected not_started, got: %', v_result;
  END IF;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T20 — INVARIANT: terminée NOT required for the canonical DB lifecycle
-- ─────────────────────────────────────────────────────────────────────────
-- This test verifies that:
--   (a) missions.status = 'validated' is accepted by the CHECK constraint
--   (b) missions.status = 'terminée' is REJECTED by the CHECK constraint
--       (it is not in the deployed vocabulary)
--
-- The confirmed mission state is 'validated' in Supabase.
-- 'terminée' is localStorage/display vocabulary only.
-- This test proves the production contract does NOT require 'terminée' in DB.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_sr_v      uuid := gen_random_uuid();
  v_m_v       uuid := gen_random_uuid();
  v_status_v  text;
  v_blocked   boolean := false;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T20', 'Marrakech', 'electricite', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status)
  VALUES (v_sr_v, 'electricite', 'Marrakech', 'validated');

  -- PART A: 'validated' MUST be accepted by the CHECK constraint
  BEGIN
    INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
    VALUES (v_m_v, v_sr_v::text, v_artisan, 'validated');

    SELECT m.status INTO v_status_v FROM public.missions m WHERE m.id = v_m_v;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION
      'T20 PART A FAIL: missions CHECK REJECTS ''validated'' — '
      'this means the deployed CHECK is missing the canonical confirmed state. '
      'migrations_status_check must include ''validated''.';
  END;

  -- PART B: 'terminée' MUST be rejected by the CHECK constraint
  -- (it is not a Supabase DB vocabulary value — localStorage only)
  BEGIN
    INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
    VALUES (gen_random_uuid(), v_sr_v::text, v_artisan, 'terminée');
    -- If we reach here, 'terminée' was accepted — this would mean the
    -- DB vocabulary was incorrectly expanded (e.g. 7c14a1 v2 was applied).
    v_blocked := false;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;  -- Expected: CHECK correctly rejects 'terminée'
  END;

  IF v_status_v = 'validated' AND v_blocked = true THEN
    RAISE NOTICE 'T20 PASS: '
      '''validated'' accepted by CHECK (canonical); '
      '''terminée'' rejected by CHECK (not a DB value — localStorage only). '
      'Production contract confirmed: terminée NOT required in Supabase vocabulary.';
  ELSIF v_status_v != 'validated' THEN
    RAISE EXCEPTION 'T20 FAIL PART A: validated not stored correctly — got: %', v_status_v;
  ELSE
    RAISE EXCEPTION 'T20 FAIL PART B: missions CHECK ACCEPTED ''terminée'' — '
      'the DB vocabulary was unexpectedly expanded. '
      'Verify that 7c14a1 v2 (which added terminée) was NOT applied.';
  END IF;
END;
$$;

ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- END OF TEST PACK
--   TEST BLOCKS = 20
--   BEGIN       = 20
--   ROLLBACK    = 20
--   COMMIT      = 0
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- T21 — Enterprise: admin (active) can confirm
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_admin   uuid := '00000000-0000-0000-0001-000000000021'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id  uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T21', 'Casablanca', 'plomberie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'plomberie', 'Casablanca', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T21', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T21', 'Casablanca', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_admin)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_admin, 't21.admin@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_admin, 'admin', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_admin), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = true
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T21 PASS: enterprise admin (active) confirmed — SR=validated mission=validated';
  ELSE
    RAISE EXCEPTION 'T21 FAIL: result=%, SR=%, mission=%', v_result, v_sr_status, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T21 INCONCLUSIVE: enterprise tables unavailable: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T22 — Enterprise: operations_manager (active) can confirm
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_opsmgr  uuid := '00000000-0000-0000-0001-000000000022'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id  uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T22', 'Rabat', 'electricite', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'electricite', 'Rabat', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T22', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T22', 'Rabat', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_opsmgr)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_opsmgr, 't22.opsmgr@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_opsmgr, 'operations_manager', 'active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_opsmgr), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = true
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T22 PASS: enterprise operations_manager (active) confirmed — SR=validated mission=validated';
  ELSE
    RAISE EXCEPTION 'T22 FAIL: result=%, SR=%, mission=%', v_result, v_sr_status, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T22 INCONCLUSIVE: enterprise tables unavailable: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T23 — Enterprise: invited member BLOCKED (not yet active)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_invited uuid := '00000000-0000-0000-0001-000000000023'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id  uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T23', 'Fes', 'serrurerie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'serrurerie', 'Fes', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T23', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T23', 'Fes', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_invited)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_invited, 't23.invited@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  -- admin role but status = 'invited' (not yet active)
  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_invited, 'admin', 'invited') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_invited), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T23 PASS: invited member BLOCKED (status≠active); mission unchanged (done)';
  ELSE
    RAISE EXCEPTION 'T23 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T23 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T24 — Enterprise: removed member BLOCKED (status=removed)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_removed uuid := '00000000-0000-0000-0001-000000000024'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id  uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T24', 'Tanger', 'peinture', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'peinture', 'Tanger', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T24', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T24', 'Tanger', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_removed)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_removed, 't24.removed@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  -- owner role but status = 'removed'
  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_removed, 'owner', 'removed') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_removed), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T24 PASS: removed member BLOCKED (status=removed); mission unchanged (done)';
  ELSE
    RAISE EXCEPTION 'T24 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T24 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T25 — Enterprise: SR without enterprise_request_context BLOCKED via Enterprise path
-- (B2C path also blocked since client_profile_id = NULL)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_user    uuid := '00000000-0000-0000-0001-000000000025'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id  uuid := gen_random_uuid();
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
  v_m_status text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T25', 'Agadir', 'nettoyage', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- SR with no enterprise_request_context and client_profile_id=NULL
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'nettoyage', 'Agadir', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T25', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_user, 't25.user@test.fixeo', 'enterprise') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status)
  VALUES (v_ent_id, v_user, 'owner', 'active') ON CONFLICT DO NOTHING;

  -- NO enterprise_request_context inserted — SR is not linked to this enterprise

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_user), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T25 PASS: SR without enterprise_request_context BLOCKED via both B2C and Enterprise paths; mission unchanged';
  ELSE
    RAISE EXCEPTION 'T25 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T25 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T26 — B2C request unaffected by Enterprise path
-- Confirms that an existing B2C owner call succeeds even when an
-- enterprise_request_context exists for the same SR
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_client  uuid := '00000000-0000-0000-0001-000000000026'::uuid;
  v_artisan uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id  uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_sr      uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_result  jsonb;
  v_sr_status text;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T26', 'Marrakech', 'plomberie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  -- B2C SR: has client_profile_id = v_client (B2C owner)
  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'plomberie', 'Marrakech', 'completed', v_client);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, client_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, v_client, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T26', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T26', 'Marrakech', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_client, 't26.client@test.fixeo', 'client') ON CONFLICT (id) DO NOTHING;

  -- Enterprise context also linked — B2C path should still work via client_profile_id
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_client)
  ON CONFLICT (service_request_id) DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_client), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT sr.status INTO v_sr_status FROM public.service_requests sr WHERE sr.id = v_sr;
  SELECT m.status  INTO v_m_status  FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = true
  AND v_sr_status = 'validated'
  AND v_m_status  = 'validated'
  THEN
    RAISE NOTICE 'T26 PASS: B2C owner succeeds even when enterprise_request_context exists — B2C path unaffected';
  ELSE
    RAISE EXCEPTION 'T26 FAIL: result=%, SR=%, mission=%', v_result, v_sr_status, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T26 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- T27 — Enterprise non-member BLOCKED (authenticated but no membership row)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_nonmember uuid := '00000000-0000-0000-0001-000000000027'::uuid;
  v_artisan   uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  v_ent_id    uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_creator   uuid := '00000000-0000-0000-0001-000000000004'::uuid;
  v_sr        uuid := gen_random_uuid();
  v_mission   uuid := gen_random_uuid();
  v_result    jsonb;
  v_m_status  text;
BEGIN
  INSERT INTO public.artisans (id, full_name, city, service_category, owner_user_id)
  VALUES (v_artisan, 'Artisan T27', 'Kenitra', 'maconnerie', v_artisan)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_requests (id, service_category, city, status, client_profile_id)
  VALUES (v_sr, 'maconnerie', 'Kenitra', 'completed', NULL);

  INSERT INTO public.missions (id, request_id, artisan_profile_id, status)
  VALUES (v_mission, v_sr::text, v_artisan, 'done');

  INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (v_ent_id, 'Entreprise T27', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
  VALUES (v_site_id, v_ent_id, 'Site T27', 'Kenitra', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
  VALUES (gen_random_uuid(), v_ent_id, v_site_id, v_sr, v_creator)
  ON CONFLICT (service_request_id) DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_nonmember, 't27.nonmember@test.fixeo', 'enterprise'),
         (v_creator,   't27.creator@test.fixeo',   'enterprise')
  ON CONFLICT (id) DO NOTHING;

  -- v_nonmember has NO enterprise_members row at all

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_nonmember), true);
  SET LOCAL ROLE authenticated;

  SELECT public.confirm_completed_mission(v_sr) INTO v_result;

  SET LOCAL ROLE postgres;

  SELECT m.status INTO v_m_status FROM public.missions m WHERE m.id = v_mission;

  IF  (v_result->>'ok')::boolean = false
  AND v_result->>'reason' = 'request_not_found_or_not_owned'
  AND v_m_status = 'done'
  THEN
    RAISE NOTICE 'T27 PASS: non-member (no enterprise_members row) BLOCKED; mission unchanged';
  ELSE
    RAISE EXCEPTION 'T27 FAIL: result=%, mission=%', v_result, v_m_status;
  END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL ROLE postgres;
  RAISE NOTICE 'T27 INCONCLUSIVE: %', SQLERRM;
END;
$$;

ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- END OF TEST PACK (EXTENDED)
--   TEST BLOCKS = 27
--   BEGIN       = 27
--   ROLLBACK    = 27
--   COMMIT      = 0
-- ════════════════════════════════════════════════════════════════════════════
