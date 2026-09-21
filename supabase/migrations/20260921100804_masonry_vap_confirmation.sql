CREATE OR REPLACE FUNCTION public.confirm_estimator_request_vap_v1(p_context_id text, p_outcome_type text, p_service_code text, p_session_id text, p_amount_mad numeric, p_city_slug text, p_client_phone text, p_description text, p_tracking_ref text, p_guest_token_hash text, p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_offer public.fixeo_pricing_offers_v1%ROWTYPE;
  v_context_id       text;
  v_outcome_type     text;
  v_service_code     text;
  v_session_id       text;
  v_city_slug        text;
  v_city              text;
  v_service_category text;
  v_phone             text;
  v_description       text;
  v_tracking_ref      text;
  v_guest_token_hash  text;
  v_idempotency_key   text;

  v_existing_outcome_type text;
  v_existing_service_code text;
  v_existing_session_id   text;
  v_existing_amount_mad   numeric;
  v_existing_state        text;
  v_existing_request_id   uuid;

  v_request_id              uuid;
  v_existing_tracking_ref   text;
  v_existing_request_status text;
  v_existing_guest_hash     text;
BEGIN
  SELECT * INTO v_offer FROM public.fixeo_pricing_offers_v1 WHERE id=p_offer_id;
  IF NOT FOUND OR v_offer.pricing_version <> 'vap-bp33-v1'
    OR v_offer.scope->>'context_id' IS DISTINCT FROM p_context_id
    OR v_offer.scope->>'session_id' IS DISTINCT FROM p_session_id
    OR v_offer.scope->>'outcome_type' IS DISTINCT FROM p_outcome_type
    OR v_offer.service_code IS DISTINCT FROM p_service_code
    OR v_offer.city IS DISTINCT FROM p_city_slug
    OR v_offer.client_total_minor::numeric/100 IS DISTINCT FROM p_amount_mad
  THEN RETURN jsonb_build_object('ok',false,'reason','offer_mismatch'); END IF;
  IF v_offer.expires_at <= now() AND NOT EXISTS (
    SELECT 1 FROM public.estimator_context_redemptions WHERE context_id=p_context_id AND state='committed'
  ) THEN RETURN jsonb_build_object('ok',false,'reason','offer_expired'); END IF;
  v_context_id := pg_catalog.btrim(COALESCE(p_context_id, ''));

  IF v_context_id !~ '^fxctx-[0-9a-f]{32}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_context_id');
  END IF;

  v_outcome_type := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_outcome_type, '')));

  IF NOT (
    v_outcome_type = ANY (
      ARRAY[
        'PRICE_READY',
        'DIAGNOSTIC_READY',
        'LABOUR_PLUS_PART_READY',
        'ADD_ON_READY'
      ]::text[]
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'non_payable_outcome');
  END IF;

  v_service_code := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_service_code, '')));

  IF
    v_service_code = ''
    OR pg_catalog.char_length(v_service_code) > 200
    OR v_service_code !~ '^[a-z0-9_]+([.][a-z0-9_]+)+$'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_service_code');
  END IF;

  v_service_category := pg_catalog.split_part(v_service_code, '.', 1);

  IF NOT (
    v_service_category = ANY (
      ARRAY[
        'plomberie',
        'electricite',
        'serrurerie',
        'climatisation',
        'bricolage',
        'nettoyage',
        'peinture',
        'menuiserie', 'jardinage', 'carrelage', 'maconnerie'
      ]::text[]
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unsupported_service_category');
  END IF;

  v_session_id := pg_catalog.btrim(COALESCE(p_session_id, ''));

  IF v_session_id = '' OR pg_catalog.char_length(v_session_id) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_session_id');
  END IF;

  IF p_amount_mad IS NULL OR p_amount_mad <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_canonical_amount');
  END IF;

  v_city_slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_city_slug, '')));

  v_city :=
    CASE v_city_slug
      WHEN 'casablanca'  THEN 'Casablanca'
      WHEN 'rabat'       THEN 'Rabat'
      WHEN 'marrakech'   THEN 'Marrakech'
      WHEN 'fes'         THEN 'Fès'
      WHEN 'tanger'      THEN 'Tanger'
      WHEN 'agadir'      THEN 'Agadir'
      WHEN 'meknes'      THEN 'Meknès'
      WHEN 'oujda'       THEN 'Oujda'
      WHEN 'kenitra'     THEN 'Kénitra'
      WHEN 'tetouan'     THEN 'Tétouan'
      WHEN 'sale'        THEN 'Salé'
      WHEN 'temara'      THEN 'Temara'
      WHEN 'el-jadida'   THEN 'El Jadida'
      WHEN 'beni-mellal' THEN 'Béni Mellal'
      WHEN 'nador'       THEN 'Nador'
      WHEN 'khouribga'   THEN 'Khouribga'
      WHEN 'safi'        THEN 'Safi'
      WHEN 'taza'        THEN 'Taza'
      WHEN 'ouarzazate'  THEN 'Ouarzazate'
      WHEN 'mohammedia'  THEN 'Mohammedia'
      ELSE NULL
    END;

  IF v_city IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_city');
  END IF;

  v_phone := pg_catalog.regexp_replace(
    pg_catalog.btrim(COALESCE(p_client_phone, '')),
    '[[:space:]().-]+',
    '',
    'g'
  );

  IF v_phone !~ '^(\+212|0)[5-7][0-9]{8}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_client_phone');
  END IF;

  v_description := pg_catalog.btrim(COALESCE(p_description, ''));

  IF v_description = '' OR pg_catalog.char_length(v_description) > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_description');
  END IF;

  v_tracking_ref := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_tracking_ref, '')));

  IF
    pg_catalog.char_length(v_tracking_ref) > 32
    OR v_tracking_ref !~ '^FX-[A-Z0-9-]{1,29}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_tracking_ref');
  END IF;

  v_guest_token_hash := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_guest_token_hash, '')));

  IF v_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_guest_token_hash');
  END IF;

  v_idempotency_key := 'estimator:' || v_context_id;

  INSERT INTO public.estimator_context_redemptions (
    context_id,
    outcome_type,
    service_code,
    session_id,
    amount_mad,
    state,
    acquired_at
  )
  VALUES (
    v_context_id,
    v_outcome_type,
    v_service_code,
    v_session_id,
    p_amount_mad,
    'acquired',
    pg_catalog.now()
  )
  ON CONFLICT (context_id)
  DO NOTHING;

  SELECT
    ecr.outcome_type,
    ecr.service_code,
    ecr.session_id,
    ecr.amount_mad,
    ecr.state,
    ecr.service_request_id
  INTO
    v_existing_outcome_type,
    v_existing_service_code,
    v_existing_session_id,
    v_existing_amount_mad,
    v_existing_state,
    v_existing_request_id
  FROM public.estimator_context_redemptions ecr
  WHERE ecr.context_id = v_context_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      '7C.9M.2 invariant failure: redemption row not found after acquisition';
  END IF;

  IF
    v_existing_outcome_type IS DISTINCT FROM v_outcome_type
    OR v_existing_service_code IS DISTINCT FROM v_service_code
    OR v_existing_session_id IS DISTINCT FROM v_session_id
    OR v_existing_amount_mad IS DISTINCT FROM p_amount_mad
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'context_identity_mismatch');
  END IF;

  IF v_existing_state = 'committed' THEN
    IF v_existing_request_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'context_already_consumed_without_request'
      );
    END IF;

    SELECT
      sr.tracking_ref,
      sr.status,
      sr.guest_token_hash
    INTO
      v_existing_tracking_ref,
      v_existing_request_status,
      v_existing_guest_hash
    FROM public.service_requests sr
    WHERE sr.id = v_existing_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        '7C.9M.2 invariant failure: committed redemption references missing request %',
        v_existing_request_id;
    END IF;

    IF
      v_existing_guest_hash IS NULL
      OR v_existing_guest_hash IS DISTINCT FROM v_guest_token_hash
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'guest_token_mismatch');
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'replayed', true,
      'request_id', v_existing_request_id,
      'tracking_ref', v_existing_tracking_ref,
      'service_category', v_service_category,
      'service_code', v_service_code,
      'city', v_city,
      'status', v_existing_request_status,
      'outcome_type', v_outcome_type,
      'amount_mad', p_amount_mad
    );
  END IF;

  IF v_existing_request_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'inconsistent_existing_request_binding'
    );
  END IF;

  IF v_existing_state = 'failed' THEN
    UPDATE public.estimator_context_redemptions
    SET
      state = 'acquired',
      acquired_at = pg_catalog.now(),
      failed_at = NULL,
      failure_reason = NULL,
      booking_ref = NULL,
      order_id = NULL
    WHERE context_id = v_context_id;
  ELSIF v_existing_state <> 'acquired' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'invalid_redemption_state',
      'state', v_existing_state
    );
  END IF;

  INSERT INTO public.service_requests (
    service_category,
    city,
    description,
    client_phone,
    urgency,
    status,
    idempotency_key,
    tracking_ref,
    guest_token_hash, pricing_offer_id
  )
  VALUES (
    v_service_category,
    v_city,
    v_description,
    v_phone,
    'normale',
    'new',
    v_idempotency_key,
    v_tracking_ref,
    v_guest_token_hash, p_offer_id
  )
  RETURNING id
  INTO v_request_id;

  UPDATE public.estimator_context_redemptions
  SET
    state = 'committed',
    service_request_id = v_request_id,
    committed_at = pg_catalog.now(),
    failed_at = NULL,
    failure_reason = NULL
  WHERE context_id = v_context_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      '7C.9M.2 invariant failure: redemption disappeared before commit';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replayed', false,
    'request_id', v_request_id,
    'tracking_ref', v_tracking_ref,
    'service_category', v_service_category,
    'service_code', v_service_code,
    'city', v_city,
    'status', 'new',
    'outcome_type', v_outcome_type,
    'amount_mad', p_amount_mad
  );
END;
$function$;

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
    -- Approved small masonry packages require a declared masonry speciality.
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.service_requests msr
        WHERE msr.id=p_request_id AND msr.pricing_offer_id IS NOT NULL
          AND msr.service_category='maconnerie'
      )
      OR translate(lower(COALESCE(a.service_category,'')),
        'éèêëàâäôöùûüïîç','eeeeaaaoouuuiic') LIKE '%maconn%'
    )

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

CREATE OR REPLACE FUNCTION public.dispatch_preview_v21(p_request_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(match_rank bigint, artisan_id uuid, artisan_name text, contact_phone text, source text, raw_request_category text, resolved_request_category text, request_city text, request_urgency text, artisan_city text, artisan_category text, work_zone text, service_score integer, geography_score integer, profile_score integer, final_score integer, has_photo boolean, is_public boolean, claimed boolean, claim_status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$

WITH req AS (
  SELECT
    sr.id,

    sr.service_category AS raw_request_category,

    public.resolve_service_category_v1(
      sr.service_category,
      sr.description
    ) AS resolved_request_category,

    sr.city AS request_city,
    sr.urgency AS request_urgency,

    translate(
      lower(
        COALESCE(
          public.resolve_service_category_v1(
            sr.service_category,
            sr.description
          ),
          ''
        )
      ),
      'éèêëàâäôöùûüïîç',
      'eeeeaaaoouuuiic'
    ) AS req_cat_norm,

    translate(
      lower(COALESCE(sr.city, '')),
      'éèêëàâäôöùûüïîç',
      'eeeeaaaoouuuiic'
    ) AS req_city_norm

  FROM public.service_requests sr

  WHERE sr.id = p_request_id
    AND sr.status = 'new'
),

candidates AS (
  SELECT
    a.id AS artisan_id,
    a.owner_user_id,

    COALESCE(
      NULLIF(trim(a.full_name), ''),
      NULLIF(trim(a.name), ''),
      'Artisan ' || left(a.id::text, 8)
    ) AS artisan_name,

    COALESCE(
      NULLIF(trim(a.phone_public), ''),
      NULLIF(trim(a.phone), '')
    ) AS contact_phone,

    a.source,
    a.city AS artisan_city,
    a.service_category AS artisan_category,
    COALESCE(a.work_zone, '') AS work_zone,

    COALESCE(a.claimed, false) AS claimed,
    a.claim_status,

    (
      NULLIF(trim(a.photo_url), '') IS NOT NULL
    ) AS has_photo,

    COALESCE(a.is_public, false) AS is_public,

    translate(
      lower(COALESCE(a.service_category, '')),
      'éèêëàâäôöùûüïîç',
      'eeeeaaaoouuuiic'
    ) AS art_cat_norm,

    translate(
      lower(COALESCE(a.city, '')),
      'éèêëàâäôöùûüïîç',
      'eeeeaaaoouuuiic'
    ) AS art_city_norm,

    translate(
      lower(COALESCE(a.work_zone, '')),
      'éèêëàâäôöùûüïîç',
      'eeeeaaaoouuuiic'
    ) AS art_zone_norm

  FROM public.artisans a

  WHERE a.availability = 'available'
    -- Approved small masonry packages require a declared masonry speciality.
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.service_requests msr
        WHERE msr.id=p_request_id AND msr.pricing_offer_id IS NOT NULL
          AND msr.service_category='maconnerie'
      )
      OR translate(lower(COALESCE(a.service_category,'')),
        'éèêëàâäôöùûüïîç','eeeeaaaoouuuiic') LIKE '%maconn%'
    )


    AND NOT EXISTS (
      SELECT 1
      FROM public.missions m
      WHERE m.request_id = p_request_id::text
        AND m.artisan_profile_id = a.id
    )
),

scored AS (
  SELECT
    r.*,
    a.*,

    CASE
      WHEN r.resolved_request_category IS NULL
        THEN NULL

      WHEN r.req_cat_norm = ''
        THEN NULL

      WHEN a.art_cat_norm = ''
        THEN NULL

      WHEN a.art_cat_norm = r.req_cat_norm
        THEN 40

      WHEN strpos(a.art_cat_norm, r.req_cat_norm) > 0
        OR strpos(r.req_cat_norm, a.art_cat_norm) > 0
        THEN 30

      ELSE NULL
    END::integer AS service_score,

    CASE
      WHEN r.req_city_norm = ''
        THEN 18

      WHEN a.art_city_norm <> ''
        AND a.art_city_norm = r.req_city_norm
        THEN 35

      WHEN a.art_city_norm <> ''
        AND (
          strpos(a.art_city_norm, r.req_city_norm) > 0
          OR strpos(r.req_city_norm, a.art_city_norm) > 0
        )
        THEN 32

      WHEN a.art_zone_norm <> ''
        AND strpos(a.art_zone_norm, r.req_city_norm) > 0
        THEN 28

      WHEN a.art_city_norm <> ''
        AND EXISTS (
          SELECT 1
          FROM unnest(
            ARRAY[
              'casablanca,mohammedia,mohammeddia,benslimane,el jadida',
              'rabat,sale,temara,kenitra,khemisset',
              'marrakech,safi,el kelaa des sraghna',
              'fes,fez,meknes,ifrane,taza',
              'agadir,tiznit,inezgane',
              'tanger,tanger-assilah,tetouan,chefchaouen',
              'oujda,berkane,nador',
              'laayoune,dakhla'
            ]::text[]
          ) AS g(group_text)

          WHERE strpos(g.group_text, r.req_city_norm) > 0
            AND strpos(g.group_text, a.art_city_norm) > 0
        )
        THEN 20

      WHEN a.art_zone_norm <> ''
        AND (
          strpos(a.art_zone_norm, 'national') > 0
          OR strpos(a.art_zone_norm, 'maroc') > 0
          OR strpos(a.art_zone_norm, 'tout') > 0
        )
        THEN 8

      ELSE NULL
    END::integer AS geography_score,

    (
      CASE WHEN a.has_photo THEN 5 ELSE 0 END
      +
      CASE WHEN a.is_public THEN 5 ELSE 0 END
      +
      CASE
        WHEN a.owner_user_id IS NOT NULL
         AND a.claimed = true
         AND a.claim_status = 'approved'
        THEN 20
        ELSE 0
      END
    )::integer AS profile_score

  FROM req r
  CROSS JOIN candidates a
),

eligible AS (
  SELECT
    *,

    (
      service_score
      + geography_score
      + profile_score
    )::integer AS final_score

  FROM scored

  WHERE resolved_request_category IS NOT NULL
    AND service_score IS NOT NULL
    AND geography_score IS NOT NULL
)

SELECT
  row_number() OVER (
    ORDER BY
      final_score DESC,
      service_score DESC,
      geography_score DESC,
      artisan_id ASC
  ) AS match_rank,

  artisan_id,
  artisan_name,
  contact_phone,
  source,

  raw_request_category,
  resolved_request_category,
  request_city,
  request_urgency,

  artisan_city,
  artisan_category,
  work_zone,

  service_score,
  geography_score,
  profile_score,
  final_score,

  has_photo,
  is_public,
  claimed,
  claim_status

FROM eligible

ORDER BY
  final_score DESC,
  service_score DESC,
  geography_score DESC,
  artisan_id ASC

LIMIT GREATEST(
  1,
  LEAST(COALESCE(p_limit, 10), 50)
);

$function$;
