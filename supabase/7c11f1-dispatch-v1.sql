-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Real Dispatch Engine V1 Core RPC
-- supabase/7c11f1-dispatch-v1.sql
-- Revision: 7C.11F.1
--
-- Creates ONE server-authoritative RPC:
--   public.dispatch_request_v1(p_request_id uuid)
--
-- ARCHITECTURE:
--   SECURITY DEFINER — runs with elevated DB privileges
--   SET search_path = '' — no schema injection
--   Restricted to service_role ONLY (never browser-callable)
--   No artisan identity accepted from caller
--   No pricing invented
--   No auto-activation — must be called explicitly by server code
--
-- DISPATCH MODEL:
--   V1 Sequential Single-Candidate — exactly one offered mission per request.
--   V2 (top-3 simultaneous) requires a separate schema migration.
--
-- TYPE CONTRACT:
--   service_requests.id  = UUID
--   missions.request_id  = TEXT
--   artisans.id          = UUID
--   Cross-table: m.request_id = sr.id::text (cast UUID side only)
--   NEVER: missions.request_id::uuid
--
-- ARTISAN ELIGIBILITY (all conditions required — proven from live schema):
--   1. owner_user_id IS NOT NULL — artisan can authenticate to dashboard
--   2. claim_status = 'approved'  — CHECK: ('unclaimed','pending','approved','rejected')
--   3. onboarding_completed = true — CHECK: boolean NOT NULL DEFAULT FALSE
--   4. availability = 'available'  — CHECK: ('available','busy','unavailable')
--   (completed_missions is NOT a DB column — not used. review_count/rating are used.)
--
-- PRIOR-OFFER EXCLUSION:
--   Artisans already having any mission row for this request are excluded.
--   Prevents re-offering to declined/expired artisans.
--
-- RANKING ALGORITHM (weights sum to 100):
--   service match   weight 35: exact=35, substring=25, no-cat=18, mismatch=0
--   city match      weight 30: exact=30, substring=28, work_zone=24,
--                              no-city=15, proximity-group=18, national=6, other=0
--   trust score     weight 20: review_count tiers + rating tiers; clamp 0–20
--   activity score  weight 15: updated_at recency tiers; clamp 0–15
--   Tie-breaker: artisan.id ASC (deterministic, no invented metric)
--
-- CONCURRENCY:
--   SELECT ... FOR UPDATE on service_requests row serializes concurrent calls.
--   23505 unique_violation on INSERT → read existing offered mission.
--
-- NO-CANDIDATE:
--   Returns ok:false, reason:'no_candidate'
--   Does NOT set service_requests.status='no_match' in V1.
--
-- Run 7c11f1-dispatch-v1-precheck.sql first.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_request_v1(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Request state
  v_request_id_text   text;
  v_sr_status         text;
  v_sr_category       text;
  v_sr_city           text;
  v_sr_urgency        text;

  -- Existing offer/winner check
  v_existing_mission  uuid;
  v_existing_status   text;

  -- Candidate loop variables
  v_artisan_id        uuid;
  v_artisan_city      text;
  v_artisan_cat       text;
  v_artisan_zone      text;
  v_artisan_rc        integer;
  v_artisan_rat       numeric;
  v_artisan_updated   timestamptz;

  -- Scoring
  v_svc_score         integer;
  v_city_score        integer;
  v_trust_score       integer;
  v_act_score         integer;
  v_score             integer;
  v_best_score        integer := -1;
  v_best_artisan_id   uuid;

  -- Normalized strings for comparison
  v_req_cat_norm      text;
  v_req_city_norm     text;
  v_art_cat_norm      text;
  v_art_city_norm     text;
  v_art_zone_norm     text;

  -- City proximity group matching
  v_city_groups       text[] := ARRAY[
    'casablanca,mohammeddia,mohammedia,benslimane,el jadida',
    'rabat,sale,temara,kenitra,khemisset',
    'marrakech,safi,el kelaa des sraghna',
    'fes,fez,meknes,ifrane,taza',
    'agadir,tiznit,inezgane',
    'tanger,tanger-assilah,tetouan,chefchaouen',
    'oujda,berkane,nador',
    'laayoune,dakhla'
  ];
  v_group             text;
  v_req_in_group      boolean;
  v_art_in_group      boolean;
  v_days_since        integer;

  -- Mission creation
  v_new_mission_id    uuid;

BEGIN

  -- ── TYPE CONTRACT: cast request UUID to text once ─────────
  v_request_id_text := p_request_id::text;

  -- ── STEP 1: Lock the service_request row ──────────────────
  -- FOR UPDATE serializes concurrent dispatch_request_v1 calls for the same request.
  -- The waiting transaction re-reads status after lock is acquired.
  SELECT sr.status, sr.service_category, sr.city, sr.urgency
  INTO   v_sr_status, v_sr_category, v_sr_city, v_sr_urgency
  FROM   public.service_requests sr
  WHERE  sr.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_found');
  END IF;

  -- ── STEP 2: Request must be 'new' ─────────────────────────
  IF v_sr_status != 'new' THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'request_not_dispatchable',
      'status', v_sr_status
    );
  END IF;

  -- ── STEP 3: Pending winner guard ──────────────────────────
  -- If someone already claimed this request, do not re-dispatch.
  SELECT m.id INTO v_existing_mission
  FROM   public.missions m
  WHERE  m.request_id = v_request_id_text
    AND  m.status     = 'pending'
  LIMIT  1;

  IF v_existing_mission IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',         false,
      'reason',     'already_claimed',
      'mission_id', v_existing_mission
    );
  END IF;

  -- ── STEP 4: Active offer idempotency ──────────────────────
  -- If an offered mission already exists, return it without creating another.
  SELECT m.id INTO v_existing_mission
  FROM   public.missions m
  WHERE  m.request_id = v_request_id_text
    AND  m.status     = 'offered'
  LIMIT  1;

  IF v_existing_mission IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'existing_offer',
      'mission_id', v_existing_mission
    );
  END IF;

  -- ── STEP 5: Normalize request category and city ───────────
  v_req_cat_norm  := lower(unaccent(COALESCE(v_sr_category, '')));
  v_req_city_norm := lower(unaccent(COALESCE(v_sr_city, '')));

  -- ── STEP 6: Candidate selection and scoring ───────────────
  -- Eligibility gates enforced in WHERE clause.
  -- Prior-offer exclusion via NOT EXISTS subquery.
  -- Score computed per candidate; highest wins.
  -- Tie-breaker: artisan.id ASC (deterministic — no invented metric).

  FOR v_artisan_id, v_artisan_city, v_artisan_cat, v_artisan_zone,
      v_artisan_rc, v_artisan_rat, v_artisan_updated IN

    SELECT
      a.id,
      a.city,
      a.service_category,
      COALESCE(a.work_zone, ''),
      COALESCE(a.review_count, 0),
      COALESCE(a.rating, 0.0),
      a.updated_at
    FROM   public.artisans a
    WHERE  a.owner_user_id       IS NOT NULL      -- must be able to log in
      AND  a.claim_status         = 'approved'    -- verified artisan
      AND  a.onboarding_completed = true          -- fully onboarded
      AND  a.availability         = 'available'   -- not busy/unavailable
      AND  NOT EXISTS (                           -- no prior mission for this request
        SELECT 1
        FROM   public.missions m
        WHERE  m.request_id         = v_request_id_text
          AND  m.artisan_profile_id = a.id
      )
    ORDER BY a.id ASC   -- stable base order; fine-grained by score below

  LOOP

    -- ── SERVICE MATCH (weight 35) ────────────────────────────
    v_art_cat_norm := lower(unaccent(COALESCE(v_artisan_cat, '')));

    IF v_req_cat_norm = '' THEN
      v_svc_score := 18;                           -- no category — partial neutral credit
    ELSIF v_art_cat_norm = v_req_cat_norm THEN
      v_svc_score := 35;                           -- exact match
    ELSIF position(v_req_cat_norm IN v_art_cat_norm) > 0
       OR position(v_art_cat_norm IN v_req_cat_norm) > 0 THEN
      v_svc_score := 25;                           -- substring (e.g. climatisation / clim)
    ELSE
      v_svc_score := 0;                            -- mismatch
    END IF;

    -- ── CITY MATCH (weight 30) ──────────────────────────────
    v_art_city_norm := lower(unaccent(COALESCE(v_artisan_city, '')));
    v_art_zone_norm := lower(unaccent(COALESCE(v_artisan_zone, '')));

    IF v_req_city_norm = '' THEN
      v_city_score := 15;                          -- no city info — neutral

    ELSIF v_art_city_norm = v_req_city_norm THEN
      v_city_score := 30;                          -- exact match

    ELSIF position(v_req_city_norm IN v_art_city_norm) > 0
       OR position(v_art_city_norm IN v_req_city_norm) > 0 THEN
      v_city_score := 28;                          -- substring (Tanger / Tanger-Assilah)

    ELSIF position(v_req_city_norm IN v_art_zone_norm) > 0 THEN
      v_city_score := 24;                          -- work_zone declares coverage

    ELSE
      -- Proximity group check — same group = partial credit
      v_city_score   := 0;
      v_req_in_group := false;
      v_art_in_group := false;

      FOREACH v_group IN ARRAY v_city_groups LOOP
        v_req_in_group := position(v_req_city_norm IN v_group) > 0;
        v_art_in_group := position(v_art_city_norm IN v_group) > 0;
        IF v_req_in_group AND v_art_in_group THEN
          v_city_score := 18;
          EXIT;
        END IF;
      END LOOP;

      -- National/all-Morocco coverage
      IF v_city_score = 0 AND (
           position('national' IN v_art_zone_norm) > 0 OR
           position('maroc'    IN v_art_zone_norm) > 0 OR
           position('tout'     IN v_art_zone_norm) > 0
         ) THEN
        v_city_score := 6;
      END IF;

    END IF;

    -- ── TRUST SCORE (weight 20) ─────────────────────────────
    -- review_count and rating are live schema columns.
    -- completed_missions is NOT in public.artisans — omitted.
    v_trust_score := 0;

    -- Review volume tiers
    IF    v_artisan_rc >= 100 THEN v_trust_score := v_trust_score + 12;
    ELSIF v_artisan_rc >= 50  THEN v_trust_score := v_trust_score + 9;
    ELSIF v_artisan_rc >= 20  THEN v_trust_score := v_trust_score + 6;
    ELSIF v_artisan_rc >= 5   THEN v_trust_score := v_trust_score + 3;
    ELSIF v_artisan_rc  = 0   THEN v_trust_score := v_trust_score - 2;
    END IF;

    -- Rating quality tiers
    IF    v_artisan_rat >= 4.8 THEN v_trust_score := v_trust_score + 8;
    ELSIF v_artisan_rat >= 4.5 THEN v_trust_score := v_trust_score + 6;
    ELSIF v_artisan_rat >= 4.0 THEN v_trust_score := v_trust_score + 4;
    ELSIF v_artisan_rat >  0.0 AND v_artisan_rat < 3.5 THEN
          v_trust_score := v_trust_score - 3;
    END IF;

    -- Clamp to weight [0, 20]
    IF v_trust_score > 20 THEN v_trust_score := 20; END IF;
    IF v_trust_score < 0  THEN v_trust_score := 0;  END IF;

    -- ── ACTIVITY SCORE (weight 15) ──────────────────────────
    -- updated_at recency (live schema column)
    IF v_artisan_updated IS NULL THEN
      v_days_since := 999;
    ELSE
      v_days_since := EXTRACT(EPOCH FROM (now() - v_artisan_updated))::integer / 86400;
    END IF;

    IF    v_days_since <= 1  THEN v_act_score := 15;
    ELSIF v_days_since <= 7  THEN v_act_score := 12;
    ELSIF v_days_since <= 30 THEN v_act_score := 8;
    ELSIF v_days_since <= 90 THEN v_act_score := 4;
    ELSE                          v_act_score := 0;
    END IF;

    -- ── COMPOSITE SCORE ─────────────────────────────────────
    v_score := v_svc_score + v_city_score + v_trust_score + v_act_score;

    -- Best score wins; tie is broken by artisan.id ASC (loop order)
    IF v_score > v_best_score THEN
      v_best_score      := v_score;
      v_best_artisan_id := v_artisan_id;
    END IF;

  END LOOP;

  -- ── STEP 7: No candidate found ────────────────────────────
  IF v_best_artisan_id IS NULL THEN
    -- Return stable result. Do NOT set service_requests.status='no_match' in V1.
    -- The request remains 'new' for ops/manual handling.
    RETURN jsonb_build_object('ok', false, 'reason', 'no_candidate');
  END IF;

  -- ── STEP 8: Create exactly ONE offered mission ────────────
  --
  -- TYPE CONTRACT:
  --   request_id         = v_request_id_text  (TEXT = p_request_id::text)
  --   artisan_profile_id = v_best_artisan_id  (UUID from artisans.id)
  --
  -- agreed_price: NULL — no price invented at dispatch time.
  -- client_profile_id: not populated (no auth context in service_role dispatch).
  -- accepted_at: NULL — set by claim_mission() at acceptance.
  --
  -- The unique partial index missions_one_offer_per_request (WHERE status='offered')
  -- is defense-in-depth against a concurrent winner in a concurrent transaction.

  BEGIN
    INSERT INTO public.missions (
      request_id,
      artisan_profile_id,
      status,
      agreed_price
    )
    VALUES (
      v_request_id_text,    -- TEXT: missions.request_id type contract
      v_best_artisan_id,    -- UUID: artisans.id
      'offered',
      NULL                  -- agreed_price: NULL — no price invented
    )
    RETURNING id INTO v_new_mission_id;

  EXCEPTION
    WHEN unique_violation THEN
      -- 23505: a concurrent dispatch_request_v1 won the race.
      -- Read the winner deterministically and return it.
      SELECT m.id INTO v_new_mission_id
      FROM   public.missions m
      WHERE  m.request_id = v_request_id_text
        AND  m.status     = 'offered'
      LIMIT  1;

      IF v_new_mission_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok',         true,
          'reason',     'existing_offer',
          'mission_id', v_new_mission_id
        );
      ELSE
        -- Offered was claimed before we could read — race with claim_mission
        RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
      END IF;

    WHEN OTHERS THEN
      RAISE WARNING '[dispatch_request_v1] insert error: %', SQLERRM;
      RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
  END;

  -- ── Success: mission created, service_request remains 'new' ──
  RETURN jsonb_build_object(
    'ok',         true,
    'reason',     'dispatched',
    'mission_id', v_new_mission_id,
    'artisan_id', v_best_artisan_id,
    'score',      v_best_score
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[dispatch_request_v1] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- PERMISSIONS — service_role ONLY
--
-- CRITICAL SECURITY:
--   This RPC must NEVER be callable from the browser.
--   authenticated and anon are explicitly revoked.
--   Only server-side Vercel functions with SUPABASE_SERVICE_ROLE_KEY
--   may call this function.
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) TO service_role;
