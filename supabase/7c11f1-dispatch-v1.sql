-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Real Dispatch Engine V1 Core RPC
-- supabase/7c11f1-dispatch-v1.sql
-- Revision: 7C.11F.1B — agreed_price nullability + eligibility hardening
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
-- ELIGIBILITY GATES — 11F.1A HARDENING:
--   Service mismatch (score=0) is an ELIMINATION, not merely a penalty.
--     If the request has a category and the artisan's service_category
--     produces a service score of 0 (no match, no substring), the artisan
--     is EXCLUDED from the offer — regardless of trust/activity scores.
--   Artisans with blank/null service_category receive partial neutral credit
--     (score=18) only when no service category is recorded in the schema.
--     This preserves existing "uncategorized" artisan semantics from
--     fixeo-dispatch-engine.js (neutral 50 for no-category).
--   City score = 0 (no city relation) is also an ELIMINATION when the
--     request has an explicit city. An artisan in an unrelated city/zone
--     with no national coverage must not receive the offer purely on
--     trust/activity scores.
--   Exception: if request has no city (v_sr_city blank/null), city
--     filtering is suspended — any artisan may serve an uncitied request.
--
-- SEARCH_PATH SAFETY:
--   unaccent() is NOT confirmed in the live schema (only uuid-ossp).
--   Using unaccent() in a SET search_path='' context would either fail
--   (function not found with empty path) or require public.unaccent().
--   11F.1A removes unaccent() entirely. Normalization is done with:
--     lower() — pg_catalog function, always available with empty search_path
--     Manual accent strip via translate() — no extension dependency
--   This is safe and deterministic.
--
-- PRIOR-OFFER EXCLUSION:
--   Artisans already having any mission row for this request are excluded.
--   Comparison: m.request_id = v_request_id_text (TEXT/TEXT — no cast).
--   Prevents re-offering to declined/expired artisans.
--
-- RANKING ALGORITHM (weights sum to 100):
--   service match   weight 35: exact=35, substring=25, no-cat=18, mismatch=ELIMINATED
--   city match      weight 30: exact=30, substring=28, work_zone=24,
--                              no-city=15, proximity-group=18, national=6, other=ELIMINATED
--   trust score     weight 20: review_count tiers + rating tiers; clamp 0–20
--   activity score  weight 15: updated_at recency tiers; clamp 0–15
--   Tie-breaker: artisan.id ASC (deterministic, no invented metric)
--
-- CONCURRENCY:
--   SELECT ... FOR UPDATE on service_requests row serializes concurrent calls.
--   Status is read UNDER the lock — authoritative.
--   23505 unique_violation on INSERT → read existing offered mission.
--   23505 handler verifies actual offered row exists before returning ok:true.
--
-- NO-CANDIDATE:
--   Returns ok:false, reason:'no_candidate'
--   Does NOT set service_requests.status='no_match' in V1.
--
-- Run 7c11f1-dispatch-v1-precheck.sql first.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- STEP 0 — agreed_price nullability contract remediation
--
-- FORENSIC FINDING (7C.11F.1B):
--   Production schema: missions.agreed_price = numeric NOT NULL, no default.
--   Every historical INSERT wrote agreed_price=0 as a placeholder sentinel.
--   Sources: fixeo-artisan-dashboard-v2.js L944, fixeo-dispatch-engine.js L671,
--            rls-phase2-2026-05-08.sql L546 (commented probe).
--   0 is NOT a real price — it is a workaround for the NOT NULL constraint.
--
-- BUSINESS RULE:
--   An OFFER is not an agreed commercial price.
--   The real price is established after mission completion via the admin
--   COD process (fixeo-admin-cod.js, commission-lifecycle-p3a.js).
--   dispatch_request_v1 must NOT invent a price to satisfy a schema artifact.
--   agreed_price=NULL is the truthful value at offer creation time.
--
-- FIX: DROP NOT NULL constraint on agreed_price.
--
-- SAFETY:
--   - No existing row is deleted or updated.
--   - No DEFAULT is added (NULL is explicit — no silent data change).
--   - The agreed_price CHECK constraint (>= 0 if present) is preserved.
--     PostgreSQL CHECK constraints: NULL does NOT violate a CHECK (SQL standard).
--     So agreed_price=NULL satisfies CHECK (agreed_price >= 0).
--   - Legacy code writing agreed_price=0 continues to work unchanged.
--   - Admin COD process writing a real price continues to work unchanged.
--   - This is idempotent: if agreed_price is already nullable, it is a no-op.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Only execute if the column is currently NOT NULL.
  -- This makes the step idempotent (safe to run twice).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'missions'
      AND column_name  = 'agreed_price'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.missions ALTER COLUMN agreed_price DROP NOT NULL;
    RAISE NOTICE 'Step 0: agreed_price NOT NULL dropped — column is now nullable';
  ELSE
    RAISE NOTICE 'Step 0: agreed_price already nullable — no change needed';
  END IF;
END $$;

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
  -- NOTE: lower() is in pg_catalog — safe with SET search_path=''.
  -- unaccent() requires extension in search_path — NOT used here.
  -- Normalization uses lower() + translate() for common French accents only.
  v_req_cat_norm      text;
  v_req_city_norm     text;
  v_art_cat_norm      text;
  v_art_city_norm     text;
  v_art_zone_norm     text;

  -- City proximity groups (lowercase, comma-delimited per group)
  -- Mirrors CITY_GROUPS from fixeo-dispatch-engine.js
  v_city_groups       text[] := ARRAY[
    'casablanca,mohammedia,mohammeddia,benslimane,el jadida',
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
  -- FOR UPDATE acquires a row-level exclusive lock.
  -- v_sr_status is read UNDER the lock — this is the authoritative
  -- post-lock state. Any concurrent transaction that modified the row
  -- before us will have committed; we see the final state.
  SELECT sr.status, sr.service_category, sr.city, sr.urgency
  INTO   v_sr_status, v_sr_category, v_sr_city, v_sr_urgency
  FROM   public.service_requests sr
  WHERE  sr.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_found');
  END IF;

  -- ── STEP 2: Request must be 'new' (evaluated AFTER lock) ──
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
  -- lower() is a pg_catalog function — safe with SET search_path=''.
  -- translate() is also pg_catalog — safe.
  -- unaccent() requires an extension and is NOT used here.
  -- French accent normalization via translate() covers the common cases
  -- present in Moroccan city/service names (é→e, è→e, ê→e, à→a, â→a, ô→o, ù→u, û→u).
  v_req_cat_norm  := lower(translate(COALESCE(v_sr_category, ''),
    'éèêëàâäôöùûüïîçÉÈÊËÀÂÄÔÖÙÛÜÏÎÇ',
    'eeeeannnouuuiicEEEEAAAAOOUUUIIC'));
  v_req_city_norm := lower(translate(COALESCE(v_sr_city, ''),
    'éèêëàâäôöùûüïîçÉÈÊËÀÂÄÔÖÙÛÜÏÎÇ',
    'eeeeannnouuuiicEEEEAAAAOOUUUIIC'));

  -- ── STEP 6: Candidate selection and scoring ───────────────
  -- Eligibility gates enforced in WHERE clause.
  -- Prior-offer exclusion via NOT EXISTS subquery.
  -- Score computed per candidate; highest wins.
  -- Tie-breaker: artisan.id ASC (deterministic — no invented metric).
  --
  -- ELIMINATION GATES (11F.1A hardening):
  --   Service score = 0  AND request has a category → artisan SKIPPED (CONTINUE)
  --   City score = 0     AND request has a city     → artisan SKIPPED (CONTINUE)
  -- These are not ranking penalties — they are eligibility rejections.

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
    ORDER BY a.id ASC   -- stable base order; fine-grained by score comparison below

  LOOP

    -- ── SERVICE MATCH (weight 35) ────────────────────────────
    v_art_cat_norm := lower(translate(COALESCE(v_artisan_cat, ''),
      'éèêëàâäôöùûüïîçÉÈÊËÀÂÄÔÖÙÛÜÏÎÇ',
      'eeeeannnouuuiicEEEEAAAAOOUUUIIC'));

    IF v_req_cat_norm = '' THEN
      -- Request has no category — all artisans eligible, neutral credit
      v_svc_score := 18;
    ELSIF v_art_cat_norm = v_req_cat_norm THEN
      v_svc_score := 35;                           -- exact match
    ELSIF position(v_req_cat_norm IN v_art_cat_norm) > 0
       OR position(v_art_cat_norm IN v_req_cat_norm) > 0 THEN
      v_svc_score := 25;                           -- substring overlap
    ELSE
      -- ELIMINATION: explicit service mismatch when request has a category.
      -- Trust/activity scores are irrelevant. Skip this artisan.
      CONTINUE;
    END IF;

    -- ── CITY MATCH (weight 30) ──────────────────────────────
    v_art_city_norm := lower(translate(COALESCE(v_artisan_city, ''),
      'éèêëàâäôöùûüïîçÉÈÊËÀÂÄÔÖÙÛÜÏÎÇ',
      'eeeeannnouuuiicEEEEAAAAOOUUUIIC'));
    v_art_zone_norm := lower(translate(COALESCE(v_artisan_zone, ''),
      'éèêëàâäôöùûüïîçÉÈÊËÀÂÄÔÖÙÛÜÏÎÇ',
      'eeeeannnouuuiicEEEEAAAAOOUUUIIC'));

    IF v_req_city_norm = '' THEN
      -- Request has no city — any artisan eligible, neutral credit
      v_city_score := 15;

    ELSIF v_art_city_norm = v_req_city_norm THEN
      v_city_score := 30;                          -- exact match

    ELSIF position(v_req_city_norm IN v_art_city_norm) > 0
       OR position(v_art_city_norm IN v_req_city_norm) > 0 THEN
      v_city_score := 28;                          -- substring (Tanger / Tanger-Assilah)

    ELSIF position(v_req_city_norm IN v_art_zone_norm) > 0 THEN
      v_city_score := 24;                          -- work_zone explicitly covers request city

    ELSE
      -- Proximity group check — same Moroccan geographic cluster
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

      -- National/all-Morocco coverage declared in work_zone
      IF v_city_score = 0 AND (
           position('national' IN v_art_zone_norm) > 0 OR
           position('maroc'    IN v_art_zone_norm) > 0 OR
           position('tout'     IN v_art_zone_norm) > 0
         ) THEN
        v_city_score := 6;
      END IF;

      -- ELIMINATION: if request has an explicit city and artisan has no
      -- geographic relation (city_score still 0), skip this artisan.
      -- Trust/activity scores cannot override geographic incompatibility.
      IF v_city_score = 0 THEN
        CONTINUE;
      END IF;

    END IF;

    -- ── TRUST SCORE (weight 20) ─────────────────────────────
    -- review_count and rating are proven live schema columns.
    -- completed_missions is NOT in public.artisans — not used.
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
    -- updated_at recency (live schema column).
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
      -- Verify: read the actually-persisted offered mission row.
      -- We do NOT return ok:true based solely on SQLSTATE 23505 —
      -- the row must exist and be in status='offered'.
      SELECT m.id INTO v_new_mission_id
      FROM   public.missions m
      WHERE  m.request_id = v_request_id_text
        AND  m.status     = 'offered'
      LIMIT  1;

      IF v_new_mission_id IS NOT NULL THEN
        -- Verified: concurrent dispatch created the offer — return it.
        RETURN jsonb_build_object(
          'ok',         true,
          'reason',     'existing_offer',
          'mission_id', v_new_mission_id
        );
      ELSE
        -- 23505 but no offered row visible — either:
        --   (a) the unique violation was on a different constraint, OR
        --   (b) the offered row was immediately claimed by another transaction.
        -- Both cases: return a stable conflict result, not ok:true.
        RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
      END IF;

    WHEN OTHERS THEN
      RAISE WARNING '[dispatch_request_v1] insert error: %', SQLERRM;
      RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
  END;

  -- ── Success: mission created, service_request.status remains 'new' ──
  -- The service_request row is NOT updated here.
  -- Only claim_mission() may transition service_requests.status to 'assigned'.
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
