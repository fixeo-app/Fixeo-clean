CREATE OR REPLACE FUNCTION public.dispatch_request_v1(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  -- Request state
  v_request_id_text   text;
  v_sr_status         text;
  v_sr_category       text;
  v_sr_city           text;
  v_sr_urgency        text;
  v_sr_target_artisan_id uuid;

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
  -- Normalization: translate(lower(COALESCE(value,'')), 'éèêëàâäôöùûüïîç', 'eeeeaaaoouuuiic')
  -- lower() runs first — no uppercase remains for translate().
  -- 15-char verified one-to-one mapping (7C.11F.1C).
  -- translate() and lower() are pg_catalog — safe with SET search_path=''.
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
  SELECT
  sr.status,
  sr.service_category,
  sr.city,
  sr.urgency,
  sr.target_artisan_id
INTO
  v_sr_status,
  v_sr_category,
  v_sr_city,
  v_sr_urgency,
  v_sr_target_artisan_id
FROM public.service_requests sr
WHERE sr.id = p_request_id
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
  -- Canonical normalization: translate(lower(COALESCE(value,'')), src15, dst15)
  -- lower() first → uppercase eliminated before translate() runs.
  -- 15-char verified one-to-one French accent map.
  v_req_cat_norm  := translate(lower(COALESCE(v_sr_category, '')),
                               'éèêëàâäôöùûüïîç',
                               'eeeeaaaoouuuiic');
  v_req_city_norm := translate(lower(COALESCE(v_sr_city, '')),
                               'éèêëàâäôöùûüïîç',
                               'eeeeaaaoouuuiic');

  -- ── STEP 6: Candidate selection and scoring ───────────────
  -- Eligibility gates enforced in WHERE clause.
  -- Prior-offer exclusion via NOT EXISTS subquery.
  -- Score computed per candidate; highest wins.
  -- Tie-breaker: artisan.id ASC (deterministic — no invented metric).
  --
  -- ELIMINATION GATES (11F.1A + 11F.1C):
  --   Blank artisan service against categorized request → CONTINUE
  --   Explicit service mismatch → CONTINUE
  --   Blank artisan city without zone/national coverage → CONTINUE
  --   Empty-string substring trap: guards placed BEFORE position() calls.

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
    WHERE a.availability = 'available'
    AND (
    v_sr_target_artisan_id IS NULL
    OR a.id = v_sr_target_artisan_id
  )
      AND  NOT EXISTS (                           -- no prior mission for this request
        SELECT 1
        FROM   public.missions m
        WHERE  m.request_id         = v_request_id_text
          AND  m.artisan_profile_id = a.id
      )
    ORDER BY a.id ASC   -- stable base order; fine-grained by score below

  LOOP

    -- ── NORMALIZE ARTISAN STRINGS ────────────────────────────
    v_art_cat_norm  := translate(lower(COALESCE(v_artisan_cat, '')),
                                 'éèêëàâäôöùûüïîç',
                                 'eeeeaaaoouuuiic');
    v_art_city_norm := translate(lower(COALESCE(v_artisan_city, '')),
                                 'éèêëàâäôöùûüïîç',
                                 'eeeeaaaoouuuiic');
    v_art_zone_norm := translate(lower(COALESCE(v_artisan_zone, '')),
                                 'éèêëàâäôöùûüïîç',
                                 'eeeeaaaoouuuiic');

    -- ── SERVICE MATCH (weight 35) ────────────────────────────
    -- Empty-string safety: position('' IN 'anything') = 1 in PostgreSQL.
    -- Guard artisan blank before substring check.
    --
    -- Policy:
    --   req blank   → neutral 18 (request has no category — all eligible)
    --   art blank   → CONTINUE (artisan has no category for a categorized request)
    --   exact       → 35
    --   substring   → 25 (both sides proven non-empty by this point)
    --   mismatch    → CONTINUE (elimination)

    IF v_req_cat_norm = '' THEN
  v_svc_score := 18;

ELSIF v_art_cat_norm = '' THEN
  CONTINUE;

ELSIF v_art_cat_norm = v_req_cat_norm THEN
  v_svc_score := 35;

ELSIF position(v_req_cat_norm IN v_art_cat_norm) > 0
   OR position(v_art_cat_norm IN v_req_cat_norm) > 0 THEN
  v_svc_score := 25;

-- ── FAMILY MATCHES ─────────────────────────────────────────────
-- Allows real artisan specialities to match their canonical family.

ELSIF v_req_cat_norm = 'plomberie'
  AND (
    v_art_cat_norm LIKE '%plomberie%'
    OR v_art_cat_norm LIKE '%chauffage%'
    OR v_art_cat_norm LIKE '%sanitaire%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'electricite'
  AND (
    v_art_cat_norm LIKE '%electric%'
    OR v_art_cat_norm LIKE '%technique%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'serrurerie'
  AND (
    v_art_cat_norm LIKE '%serrur%'
    OR v_art_cat_norm LIKE '%ferronner%'
    OR v_art_cat_norm LIKE '%fer forge%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'climatisation'
  AND (
    v_art_cat_norm LIKE '%clim%'
    OR v_art_cat_norm LIKE '%froid%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'menuiserie'
  AND (
    v_art_cat_norm LIKE '%menuiser%'
    OR v_art_cat_norm LIKE '%bois%'
    OR v_art_cat_norm LIKE '%mdf%'
    OR v_art_cat_norm LIKE '%mobilier%'
    OR v_art_cat_norm LIKE '%inox%'
    OR v_art_cat_norm LIKE '%aluminium%'
    OR v_art_cat_norm LIKE '%agencement%'
    OR v_art_cat_norm LIKE '%amenagement%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'peinture'
  AND (
    v_art_cat_norm LIKE '%peint%'
    OR v_art_cat_norm LIKE '%decoration%'
    OR v_art_cat_norm LIKE '%tadelakt%'
    OR v_art_cat_norm LIKE '%vernis%'
    OR v_art_cat_norm LIKE '%finition%'
    OR v_art_cat_norm LIKE '%facade%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'maconnerie'
  AND (
    v_art_cat_norm LIKE '%maconner%'
    OR v_art_cat_norm LIKE '%construction%'
    OR v_art_cat_norm LIKE '%carrelage%'
    OR v_art_cat_norm LIKE '%marbre%'
    OR v_art_cat_norm LIKE '%platre%'
    OR v_art_cat_norm LIKE '%placo%'
    OR v_art_cat_norm LIKE '%zellige%'
    OR v_art_cat_norm LIKE '%etancheite%'
    OR v_art_cat_norm LIKE '%renovation%'
    OR v_art_cat_norm LIKE '%facade%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'nettoyage'
  AND v_art_cat_norm LIKE '%nettoy%' THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'jardinage'
  AND v_art_cat_norm LIKE '%jardin%' THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'demenagement'
  AND (
    v_art_cat_norm LIKE '%demenag%'
    OR v_art_cat_norm LIKE '%transport%'
  ) THEN
  v_svc_score := 24;

ELSIF v_req_cat_norm = 'autre'
  AND (
    v_art_cat_norm LIKE '%bricolage%'
    OR v_art_cat_norm LIKE '%maintenance%'
    OR v_art_cat_norm LIKE '%multi service%'
    OR v_art_cat_norm LIKE '%multiservice%'
    OR v_art_cat_norm LIKE '%piscine%'
    OR v_art_cat_norm LIKE '%amenagement%'
    OR v_art_cat_norm LIKE '%renovation%'
  ) THEN
  v_svc_score := 20;

ELSE
  CONTINUE;
END IF;

    -- ── CITY MATCH (weight 30) ──────────────────────────────
    -- Empty-string safety: artisan city blank must never produce a false
    -- substring hit. Non-empty guard applied before position() calls.
    -- work_zone and national fallbacks remain valid even when city is blank.
    --
    -- Policy:
    --   req blank       → neutral 15 (any artisan may serve uncitied request)
    --   art exact       → 30 (non-empty guard in place)
    --   art substring   → 28 (non-empty guard in place)
    --   work_zone match → 24 (zone may legitimately cover request city)
    --   proximity group → 18
    --   national        → 6
    --   none            → CONTINUE (when request city is known)

    IF v_req_city_norm = '' THEN
      v_city_score := 15;                         -- request has no city — neutral

    ELSIF v_art_city_norm <> ''
      AND v_art_city_norm = v_req_city_norm THEN
      v_city_score := 30;                         -- exact city match

    ELSIF v_art_city_norm <> ''
      AND (position(v_req_city_norm IN v_art_city_norm) > 0
        OR position(v_art_city_norm IN v_req_city_norm) > 0) THEN
      v_city_score := 28;                         -- substring (Tanger / Tanger-Assilah)

    ELSIF v_art_zone_norm <> ''
      AND position(v_req_city_norm IN v_art_zone_norm) > 0 THEN
      v_city_score := 24;                         -- work_zone declares coverage

    ELSE
      -- Proximity group check — same Moroccan geographic cluster
      v_city_score   := 0;
      v_req_in_group := false;
      v_art_in_group := false;

      -- Proximity group: artisan city must also be non-empty.
      -- position('' IN group) = 1 in PostgreSQL — empty artisan city would
      -- always match any group, producing a false proximity claim.
      IF v_art_city_norm <> '' THEN
        FOREACH v_group IN ARRAY v_city_groups LOOP
          v_req_in_group := position(v_req_city_norm IN v_group) > 0;
          v_art_in_group := position(v_art_city_norm IN v_group) > 0;
          IF v_req_in_group AND v_art_in_group THEN
            v_city_score := 18;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      -- National/all-Morocco coverage declared in work_zone
      IF v_city_score = 0 AND v_art_zone_norm <> '' AND (
           position('national' IN v_art_zone_norm) > 0 OR
           position('maroc'    IN v_art_zone_norm) > 0 OR
           position('tout'     IN v_art_zone_norm) > 0
         ) THEN
        v_city_score := 6;
      END IF;

      -- ELIMINATION: request city known, artisan has no geographic relation.
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
$function$;

