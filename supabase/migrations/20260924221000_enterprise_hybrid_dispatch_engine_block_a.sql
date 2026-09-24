-- FIXEO ENTERPRISE — BLOCK A / A12-A14
-- Internal dispatch, assignment lifecycle, hybrid external fallback and safe Enterprise creation.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Preserve historical public dispatch, but allow a transaction-local
--    Enterprise wrapper to defer it until ERC exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_dispatch_v2_on_service_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'new'
     AND COALESCE(
       pg_catalog.current_setting('fixeo.enterprise_dispatch_deferred', true),
       'off'
     ) <> 'on'
  THEN
    PERFORM public.dispatch_execute_v1(NEW.id, 3);
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.trigger_dispatch_v2_on_service_request()
  OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- 2) Internal helper to start the existing artisan dispatch.
--    System/cron callers are traced in hybrid state; human callers additionally
--    produce an enterprise audit event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_start_external_dispatch_v1(
  p_request_id uuid,
  p_enterprise_id uuid,
  p_policy_id uuid,
  p_mode text,
  p_event_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  BEGIN
    PERFORM public.dispatch_execute_v1(p_request_id, 3);

    INSERT INTO public.enterprise_hybrid_dispatch_state(
      service_request_id,enterprise_id,policy_id,mode,status,
      fallback_due_at,external_dispatched_at,created_at,updated_at
    )
    VALUES(
      p_request_id,p_enterprise_id,p_policy_id,p_mode,'external_dispatched',
      NULL,now(),now(),now()
    )
    ON CONFLICT (service_request_id)
    DO UPDATE SET
      policy_id=EXCLUDED.policy_id,
      mode=EXCLUDED.mode,
      status='external_dispatched',
      fallback_due_at=NULL,
      external_dispatched_at=now(),
      updated_at=now();

    IF auth.uid() IS NOT NULL THEN
      PERFORM fixeo_private._write_enterprise_audit_event(
        p_enterprise_id,
        p_event_type,
        'service_request',
        p_request_id,
        NULL,
        pg_catalog.jsonb_build_object(
          'mode',p_mode,
          'policy_id',p_policy_id,
          'status','external_dispatched'
        ),
        '{}'::jsonb
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'channel','external','status','external_dispatched'
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.enterprise_hybrid_dispatch_state(
      service_request_id,enterprise_id,policy_id,mode,status,
      fallback_due_at,external_dispatched_at,created_at,updated_at
    )
    VALUES(
      p_request_id,p_enterprise_id,p_policy_id,p_mode,'external_failed',
      NULL,NULL,now(),now()
    )
    ON CONFLICT (service_request_id)
    DO UPDATE SET
      policy_id=EXCLUDED.policy_id,
      mode=EXCLUDED.mode,
      status='external_failed',
      fallback_due_at=NULL,
      updated_at=now();

    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'channel','external','status','external_failed'
    );
  END;
END;
$function$;

REVOKE ALL ON FUNCTION fixeo_private._fixeo_start_external_dispatch_v1(
  uuid,uuid,uuid,text,text
) FROM PUBLIC,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3) Hybrid dispatch resolver.
--    No browser EXECUTE: called by the Enterprise creation wrapper, retry RPC,
--    and service-role fallback worker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_enterprise_hybrid_v1(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_id uuid;
  v_site_id uuid;
  v_category text;
  v_request_status text;
  v_policy_id uuid;
  v_mode text := 'external_only';
  v_offer_limit integer := 3;
  v_offer_ttl integer := 15;
  v_fallback_after integer := 10;
  v_offer_count integer := 0;
  v_external jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','request_required');
  END IF;

  SELECT erc.enterprise_id,erc.site_id,
         pg_catalog.lower(pg_catalog.btrim(sr.service_category)),
         sr.status
  INTO v_enterprise_id,v_site_id,v_category,v_request_status
  FROM public.enterprise_request_context erc
  JOIN public.service_requests sr
    ON sr.id=erc.service_request_id
  WHERE erc.service_request_id=p_request_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_enterprise_request');
  END IF;

  IF v_request_status <> 'new' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'reason','already_claimed','status',v_request_status
    );
  END IF;

  SELECT p.id,p.mode,p.internal_offer_limit,p.offer_ttl_minutes,p.fallback_after_minutes
  INTO v_policy_id,v_mode,v_offer_limit,v_offer_ttl,v_fallback_after
  FROM public.enterprise_dispatch_policies p
  WHERE p.enterprise_id=v_enterprise_id
    AND p.status='active'
    AND (p.site_id=v_site_id OR p.site_id IS NULL)
    AND (
      p.service_category IS NULL
      OR pg_catalog.lower(pg_catalog.btrim(p.service_category))=v_category
    )
  ORDER BY
    CASE WHEN p.site_id=v_site_id THEN 0 ELSE 1 END,
    CASE
      WHEN p.service_category IS NOT NULL
       AND pg_catalog.lower(pg_catalog.btrim(p.service_category))=v_category
      THEN 0 ELSE 1
    END,
    p.created_at DESC
  LIMIT 1;

  IF v_policy_id IS NULL THEN
    v_mode := 'external_only';
    v_offer_limit := 3;
    v_offer_ttl := 15;
    v_fallback_after := 10;
  END IF;

  IF v_mode='external_only' THEN
    RETURN fixeo_private._fixeo_start_external_dispatch_v1(
      p_request_id,v_enterprise_id,v_policy_id,v_mode,'dispatch.external_started'
    );
  END IF;

  INSERT INTO public.enterprise_internal_dispatch_offers(
    enterprise_id,service_request_id,worker_id,status,score,offered_at,expires_at,responded_at
  )
  SELECT
    v_enterprise_id,
    p_request_id,
    ranked.worker_id,
    'offered',
    ranked.score,
    now(),
    now()+pg_catalog.make_interval(mins=>v_offer_ttl),
    NULL
  FROM (
    SELECT
      w.id AS worker_id,
      (
        s.skill_level*100
        - (
          SELECT count(*)::integer*20
          FROM public.enterprise_internal_assignments ia
          WHERE ia.worker_id=w.id
            AND ia.status IN ('assigned','in_progress')
        )
        + CASE WHEN w.all_sites THEN 0 ELSE 10 END
      )::integer AS score
    FROM public.enterprise_workforce_workers w
    JOIN public.enterprise_members em
      ON em.id=w.member_id
     AND em.enterprise_id=w.enterprise_id
    JOIN public.enterprise_workforce_skills s
      ON s.worker_id=w.id
     AND s.enterprise_id=w.enterprise_id
     AND s.active=true
     AND pg_catalog.lower(pg_catalog.btrim(s.service_category))=v_category
    WHERE w.enterprise_id=v_enterprise_id
      AND w.status='active'
      AND w.availability='available'
      AND em.status='active'
      AND (
        w.all_sites
        OR EXISTS (
          SELECT 1
          FROM public.enterprise_workforce_sites ws
          WHERE ws.enterprise_id=v_enterprise_id
            AND ws.worker_id=w.id
            AND ws.site_id=v_site_id
        )
      )
      AND (
        SELECT count(*)
        FROM public.enterprise_internal_assignments ia
        WHERE ia.worker_id=w.id
          AND ia.status IN ('assigned','in_progress')
      ) < w.max_concurrent_jobs
    ORDER BY score DESC,w.id
    LIMIT v_offer_limit
  ) ranked
  ON CONFLICT (service_request_id,worker_id)
  DO UPDATE SET
    status='offered',
    score=EXCLUDED.score,
    offered_at=now(),
    expires_at=EXCLUDED.expires_at,
    responded_at=NULL;

  GET DIAGNOSTICS v_offer_count = ROW_COUNT;

  IF v_offer_count=0 THEN
    IF v_mode='internal_only' THEN
      INSERT INTO public.enterprise_hybrid_dispatch_state(
        service_request_id,enterprise_id,policy_id,mode,status,created_at,updated_at
      )
      VALUES(
        p_request_id,v_enterprise_id,v_policy_id,v_mode,'no_internal_candidate',now(),now()
      )
      ON CONFLICT (service_request_id)
      DO UPDATE SET
        policy_id=EXCLUDED.policy_id,
        mode=EXCLUDED.mode,
        status='no_internal_candidate',
        fallback_due_at=NULL,
        updated_at=now();

      IF auth.uid() IS NOT NULL THEN
        PERFORM fixeo_private._write_enterprise_audit_event(
          v_enterprise_id,
          'dispatch.no_internal_candidate',
          'service_request',
          p_request_id,
          NULL,
          pg_catalog.jsonb_build_object(
            'mode',v_mode,'service_category',v_category,'site_id',v_site_id
          ),
          '{}'::jsonb
        );
      END IF;

      RETURN pg_catalog.jsonb_build_object(
        'ok',true,'mode',v_mode,'status','no_internal_candidate','offers',0
      );
    END IF;

    RETURN fixeo_private._fixeo_start_external_dispatch_v1(
      p_request_id,v_enterprise_id,v_policy_id,v_mode,'dispatch.external_started'
    );
  END IF;

  IF v_mode='hybrid' THEN
    BEGIN
      PERFORM public.dispatch_execute_v1(p_request_id,3);

      INSERT INTO public.enterprise_hybrid_dispatch_state(
        service_request_id,enterprise_id,policy_id,mode,status,
        fallback_due_at,external_dispatched_at,created_at,updated_at
      )
      VALUES(
        p_request_id,v_enterprise_id,v_policy_id,v_mode,'hybrid_active',
        NULL,now(),now(),now()
      )
      ON CONFLICT (service_request_id)
      DO UPDATE SET
        policy_id=EXCLUDED.policy_id,
        mode=EXCLUDED.mode,
        status='hybrid_active',
        fallback_due_at=NULL,
        external_dispatched_at=now(),
        updated_at=now();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.enterprise_hybrid_dispatch_state(
        service_request_id,enterprise_id,policy_id,mode,status,
        fallback_due_at,external_dispatched_at,created_at,updated_at
      )
      VALUES(
        p_request_id,v_enterprise_id,v_policy_id,v_mode,'internal_offered',
        NULL,NULL,now(),now()
      )
      ON CONFLICT (service_request_id)
      DO UPDATE SET
        policy_id=EXCLUDED.policy_id,
        mode=EXCLUDED.mode,
        status='internal_offered',
        fallback_due_at=NULL,
        updated_at=now();
    END;
  ELSE
    INSERT INTO public.enterprise_hybrid_dispatch_state(
      service_request_id,enterprise_id,policy_id,mode,status,
      fallback_due_at,external_dispatched_at,created_at,updated_at
    )
    VALUES(
      p_request_id,
      v_enterprise_id,
      v_policy_id,
      v_mode,
      'internal_offered',
      CASE
        WHEN v_mode='internal_first'
        THEN now()+pg_catalog.make_interval(mins=>v_fallback_after)
        ELSE NULL
      END,
      NULL,
      now(),
      now()
    )
    ON CONFLICT (service_request_id)
    DO UPDATE SET
      policy_id=EXCLUDED.policy_id,
      mode=EXCLUDED.mode,
      status='internal_offered',
      fallback_due_at=EXCLUDED.fallback_due_at,
      external_dispatched_at=NULL,
      updated_at=now();
  END IF;

  IF auth.uid() IS NOT NULL THEN
    PERFORM fixeo_private._write_enterprise_audit_event(
      v_enterprise_id,
      'dispatch.internal_offered',
      'service_request',
      p_request_id,
      NULL,
      pg_catalog.jsonb_build_object(
        'mode',v_mode,
        'offer_count',v_offer_count,
        'service_category',v_category,
        'site_id',v_site_id
      ),
      pg_catalog.jsonb_build_object('policy_id',v_policy_id)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'mode',v_mode,
    'status',CASE WHEN v_mode='hybrid' THEN 'hybrid_active' ELSE 'internal_offered' END,
    'offers',v_offer_count,
    'fallback_due_at',
      CASE
        WHEN v_mode='internal_first'
        THEN now()+pg_catalog.make_interval(mins=>v_fallback_after)
        ELSE NULL
      END
  );
END;
$function$;

ALTER FUNCTION public.dispatch_enterprise_hybrid_v1(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dispatch_enterprise_hybrid_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_enterprise_hybrid_v1(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Safe Enterprise creation path: defer historical external trigger, reuse the
--    canonical create_enterprise_request contract, then run hybrid resolver.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_enterprise_request_hybrid(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_service_category text,
  p_description text,
  p_urgency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_created jsonb;
  v_request_id uuid;
  v_dispatch jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  PERFORM pg_catalog.set_config('fixeo.enterprise_dispatch_deferred','on',true);

  SELECT public.create_enterprise_request(
    p_enterprise_id,
    p_site_id,
    p_service_category,
    p_description,
    p_urgency
  )
  INTO v_created;

  PERFORM pg_catalog.set_config('fixeo.enterprise_dispatch_deferred','off',true);

  IF v_created IS NULL OR COALESCE((v_created->>'ok')::boolean,false) IS NOT TRUE THEN
    RETURN COALESCE(
      v_created,
      pg_catalog.jsonb_build_object('ok',false,'reason','create_failed')
    );
  END IF;

  v_request_id := (v_created->>'service_request_id')::uuid;
  v_dispatch := public.dispatch_enterprise_hybrid_v1(v_request_id);

  RETURN v_created || pg_catalog.jsonb_build_object('dispatch',v_dispatch);

EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('fixeo.enterprise_dispatch_deferred','off',true);
  RAISE WARNING '[create_enterprise_request_hybrid] % %',SQLSTATE,SQLERRM;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.create_enterprise_request_hybrid(uuid,uuid,text,text,text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_enterprise_request_hybrid(uuid,uuid,text,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_request_hybrid(uuid,uuid,text,text,text)
  TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5) Internal worker acceptance / decline.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_my_enterprise_workforce_offer_v1(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_worker_id uuid;
  v_enterprise_id uuid;
  v_offer_id uuid;
  v_offer_status text;
  v_expires_at timestamptz;
  v_request_status text;
  v_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  SELECT w.id,w.enterprise_id
  INTO v_worker_id,v_enterprise_id
  FROM public.enterprise_workforce_workers w
  JOIN public.enterprise_members em
    ON em.id=w.member_id
   AND em.enterprise_id=w.enterprise_id
  WHERE em.user_id=auth.uid()
    AND em.status='active'
    AND w.status='active'
  LIMIT 1;

  IF v_worker_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found');
  END IF;

  SELECT sr.status
  INTO v_request_status
  FROM public.service_requests sr
  WHERE sr.id=p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','request_not_found');
  END IF;

  SELECT o.id,o.status,o.expires_at
  INTO v_offer_id,v_offer_status,v_expires_at
  FROM public.enterprise_internal_dispatch_offers o
  WHERE o.service_request_id=p_request_id
    AND o.worker_id=v_worker_id
    AND o.enterprise_id=v_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','offer_not_found');
  END IF;

  IF v_offer_status='accepted' THEN
    SELECT ia.id
    INTO v_assignment_id
    FROM public.enterprise_internal_assignments ia
    WHERE ia.service_request_id=p_request_id
      AND ia.worker_id=v_worker_id
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'reason','already_accepted','assignment_id',v_assignment_id
    );
  END IF;

  IF v_offer_status<>'offered' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','offer_not_active');
  END IF;

  IF v_expires_at<=now() THEN
    UPDATE public.enterprise_internal_dispatch_offers
    SET status='expired',responded_at=now()
    WHERE id=v_offer_id;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','offer_expired');
  END IF;

  IF v_request_status<>'new' THEN
    UPDATE public.enterprise_internal_dispatch_offers
    SET status='cancelled',responded_at=now()
    WHERE id=v_offer_id;
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'reason','already_claimed','status',v_request_status
    );
  END IF;

  INSERT INTO public.enterprise_internal_assignments(
    enterprise_id,service_request_id,worker_id,offer_id,status,assigned_at,updated_at
  )
  VALUES(
    v_enterprise_id,p_request_id,v_worker_id,v_offer_id,'assigned',now(),now()
  )
  RETURNING id INTO v_assignment_id;

  UPDATE public.service_requests
  SET status='assigned'
  WHERE id=p_request_id AND status='new';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'internal_acceptance_conflict' USING ERRCODE='P0001';
  END IF;

  UPDATE public.enterprise_internal_dispatch_offers
  SET status='accepted',responded_at=now()
  WHERE id=v_offer_id;

  UPDATE public.enterprise_internal_dispatch_offers
  SET status='cancelled',responded_at=now()
  WHERE service_request_id=p_request_id
    AND id<>v_offer_id
    AND status='offered';

  UPDATE public.dispatch_execution_queue
  SET execution_status='CANCELLED',updated_at=now()
  WHERE request_id=p_request_id
    AND execution_status IN ('QUEUED','CONTACTED');

  UPDATE public.enterprise_hybrid_dispatch_state
  SET status='internal_assigned',
      fallback_due_at=NULL,
      updated_at=now()
  WHERE service_request_id=p_request_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    v_enterprise_id,
    'dispatch.internal_accepted',
    'enterprise_internal_assignment',
    v_assignment_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'status','assigned',
      'worker_id',v_worker_id,
      'service_request_id',p_request_id
    ),
    pg_catalog.jsonb_build_object('offer_id',v_offer_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'reason','accepted',
    'assignment_id',v_assignment_id,
    'worker_id',v_worker_id,
    'request_id',p_request_id
  );

EXCEPTION
  WHEN unique_violation OR SQLSTATE 'P0001' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','already_claimed');
  WHEN OTHERS THEN
    RAISE WARNING '[accept_my_enterprise_workforce_offer_v1] % %',SQLSTATE,SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_my_enterprise_workforce_offer_v1(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_worker_id uuid;
  v_enterprise_id uuid;
  v_offer_id uuid;
  v_request_status text;
  v_mode text;
  v_policy_id uuid;
  v_remaining integer;
  v_external jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  SELECT w.id,w.enterprise_id
  INTO v_worker_id,v_enterprise_id
  FROM public.enterprise_workforce_workers w
  JOIN public.enterprise_members em
    ON em.id=w.member_id
   AND em.enterprise_id=w.enterprise_id
  WHERE em.user_id=auth.uid()
    AND em.status='active'
    AND w.status='active'
  LIMIT 1;

  IF v_worker_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found');
  END IF;

  SELECT sr.status
  INTO v_request_status
  FROM public.service_requests sr
  WHERE sr.id=p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','request_not_found');
  END IF;

  SELECT o.id
  INTO v_offer_id
  FROM public.enterprise_internal_dispatch_offers o
  WHERE o.service_request_id=p_request_id
    AND o.worker_id=v_worker_id
    AND o.status='offered'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','offer_not_active');
  END IF;

  UPDATE public.enterprise_internal_dispatch_offers
  SET status='declined',responded_at=now()
  WHERE id=v_offer_id;

  SELECT count(*)::integer
  INTO v_remaining
  FROM public.enterprise_internal_dispatch_offers
  WHERE service_request_id=p_request_id
    AND status='offered'
    AND expires_at>now();

  SELECT s.mode,s.policy_id
  INTO v_mode,v_policy_id
  FROM public.enterprise_hybrid_dispatch_state s
  WHERE s.service_request_id=p_request_id
  FOR UPDATE;

  IF v_request_status='new' AND v_remaining=0 THEN
    IF v_mode='internal_first' THEN
      v_external := fixeo_private._fixeo_start_external_dispatch_v1(
        p_request_id,v_enterprise_id,v_policy_id,v_mode,'dispatch.external_fallback'
      );
    ELSIF v_mode='internal_only' THEN
      UPDATE public.enterprise_hybrid_dispatch_state
      SET status='no_internal_candidate',fallback_due_at=NULL,updated_at=now()
      WHERE service_request_id=p_request_id;
    END IF;
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    v_enterprise_id,
    'dispatch.internal_declined',
    'service_request',
    p_request_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'worker_id',v_worker_id,
      'remaining_offers',v_remaining,
      'mode',v_mode
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'reason','declined','remaining_offers',v_remaining
  );
END;
$function$;

ALTER FUNCTION public.accept_my_enterprise_workforce_offer_v1(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.decline_my_enterprise_workforce_offer_v1(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_my_enterprise_workforce_offer_v1(uuid)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.decline_my_enterprise_workforce_offer_v1(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_my_enterprise_workforce_offer_v1(uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decline_my_enterprise_workforce_offer_v1(uuid)
  TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 6) Direct manager/operator assignment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_enterprise_internal_worker_v1(
  p_enterprise_id uuid,
  p_request_id uuid,
  p_worker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_site_id uuid;
  v_request_status text;
  v_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_dispatch_operator(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT erc.site_id,sr.status
  INTO v_site_id,v_request_status
  FROM public.enterprise_request_context erc
  JOIN public.service_requests sr ON sr.id=erc.service_request_id
  WHERE erc.enterprise_id=p_enterprise_id
    AND erc.service_request_id=p_request_id
  FOR UPDATE OF sr;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','request_not_found');
  END IF;

  IF v_request_status<>'new' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','already_claimed','status',v_request_status);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.enterprise_workforce_workers w
    JOIN public.enterprise_members em
      ON em.id=w.member_id
     AND em.enterprise_id=w.enterprise_id
    WHERE w.id=p_worker_id
      AND w.enterprise_id=p_enterprise_id
      AND w.status='active'
      AND w.availability='available'
      AND em.status='active'
      AND (
        w.all_sites
        OR EXISTS (
          SELECT 1 FROM public.enterprise_workforce_sites ws
          WHERE ws.worker_id=w.id
            AND ws.enterprise_id=p_enterprise_id
            AND ws.site_id=v_site_id
        )
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_eligible');
  END IF;

  INSERT INTO public.enterprise_internal_assignments(
    enterprise_id,service_request_id,worker_id,status,assigned_at,updated_at
  )
  VALUES(p_enterprise_id,p_request_id,p_worker_id,'assigned',now(),now())
  RETURNING id INTO v_assignment_id;

  UPDATE public.service_requests
  SET status='assigned'
  WHERE id=p_request_id AND status='new';

  UPDATE public.enterprise_internal_dispatch_offers
  SET status='cancelled',responded_at=now()
  WHERE service_request_id=p_request_id AND status='offered';

  UPDATE public.dispatch_execution_queue
  SET execution_status='CANCELLED',updated_at=now()
  WHERE request_id=p_request_id
    AND execution_status IN ('QUEUED','CONTACTED');

  INSERT INTO public.enterprise_hybrid_dispatch_state(
    service_request_id,enterprise_id,mode,status,created_at,updated_at
  )
  VALUES(p_request_id,p_enterprise_id,'internal_only','internal_assigned',now(),now())
  ON CONFLICT (service_request_id)
  DO UPDATE SET
    status='internal_assigned',
    fallback_due_at=NULL,
    updated_at=now();

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'dispatch.internal_accepted',
    'enterprise_internal_assignment',
    v_assignment_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'status','assigned',
      'worker_id',p_worker_id,
      'service_request_id',p_request_id
    ),
    pg_catalog.jsonb_build_object('source','manager_assignment')
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'assignment_id',v_assignment_id,'request_id',p_request_id,'worker_id',p_worker_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','already_claimed');
  WHEN OTHERS THEN
    RAISE WARNING '[assign_enterprise_internal_worker_v1] % %',SQLSTATE,SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.assign_enterprise_internal_worker_v1(uuid,uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_enterprise_internal_worker_v1(uuid,uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_enterprise_internal_worker_v1(uuid,uuid,uuid)
  TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 7) Assignment lifecycle: worker self or Enterprise dispatch operator.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_enterprise_internal_assignment_status_v1(
  p_enterprise_id uuid,
  p_request_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_assignment_id uuid;
  v_worker_id uuid;
  v_old_status text;
  v_is_self boolean;
  v_is_operator boolean;
  v_request_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_status NOT IN ('in_progress','completed','validated') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  SELECT ia.id,ia.worker_id,ia.status,sr.status
  INTO v_assignment_id,v_worker_id,v_old_status,v_request_status
  FROM public.enterprise_internal_assignments ia
  JOIN public.service_requests sr ON sr.id=ia.service_request_id
  WHERE ia.enterprise_id=p_enterprise_id
    AND ia.service_request_id=p_request_id
  FOR UPDATE OF ia,sr;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','assignment_not_found');
  END IF;

  v_is_self := fixeo_private._fixeo_is_enterprise_workforce_self(v_worker_id);
  v_is_operator := fixeo_private._fixeo_is_enterprise_dispatch_operator(p_enterprise_id);

  IF NOT v_is_self AND NOT v_is_operator THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF p_status='in_progress' AND v_old_status<>'assigned' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_transition');
  END IF;

  IF p_status='completed' AND v_old_status NOT IN ('assigned','in_progress') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_transition');
  END IF;

  IF p_status='validated' THEN
    IF NOT v_is_operator OR v_old_status<>'completed' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_transition');
    END IF;
  END IF;

  UPDATE public.enterprise_internal_assignments
  SET status=p_status,
      started_at=CASE
        WHEN p_status='in_progress' THEN COALESCE(started_at,now())
        ELSE started_at
      END,
      completed_at=CASE
        WHEN p_status IN ('completed','validated') THEN COALESCE(completed_at,now())
        ELSE completed_at
      END,
      updated_at=now()
  WHERE id=v_assignment_id;

  UPDATE public.service_requests
  SET status=CASE
    WHEN p_status='in_progress' THEN 'in_progress'
    WHEN p_status='completed' THEN 'completed'
    WHEN p_status='validated' THEN 'validated'
    ELSE status
  END
  WHERE id=p_request_id;

  IF p_status='validated' THEN
    UPDATE public.enterprise_hybrid_dispatch_state
    SET status='completed',updated_at=now()
    WHERE service_request_id=p_request_id;
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'dispatch.internal_assignment_updated',
    'enterprise_internal_assignment',
    v_assignment_id,
    pg_catalog.jsonb_build_object('status',v_old_status),
    pg_catalog.jsonb_build_object('status',p_status),
    pg_catalog.jsonb_build_object(
      'worker_id',v_worker_id,
      'service_request_id',p_request_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'assignment_id',v_assignment_id,'status',p_status
  );
END;
$function$;

ALTER FUNCTION public.set_enterprise_internal_assignment_status_v1(uuid,uuid,text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_enterprise_internal_assignment_status_v1(uuid,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_enterprise_internal_assignment_status_v1(uuid,uuid,text)
  TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 8) Operator retry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_enterprise_hybrid_dispatch_v1(
  p_enterprise_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_dispatch_operator(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id=erc.service_request_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND erc.service_request_id=p_request_id
      AND sr.status='new'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','request_not_dispatchable');
  END IF;

  RETURN public.dispatch_enterprise_hybrid_v1(p_request_id);
END;
$function$;

ALTER FUNCTION public.retry_enterprise_hybrid_dispatch_v1(uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.retry_enterprise_hybrid_dispatch_v1(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_enterprise_hybrid_dispatch_v1(uuid,uuid)
  TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 9) Automatic internal-first fallback. Service-role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_enterprise_dispatch_fallbacks_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_result jsonb;
BEGIN
  FOR v_row IN
    SELECT s.service_request_id,s.enterprise_id,s.policy_id,s.mode
    FROM public.enterprise_hybrid_dispatch_state s
    JOIN public.service_requests sr ON sr.id=s.service_request_id
    WHERE s.status='internal_offered'
      AND s.mode='internal_first'
      AND s.fallback_due_at IS NOT NULL
      AND s.fallback_due_at<=now()
      AND sr.status='new'
    ORDER BY s.fallback_due_at
    LIMIT 100
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    UPDATE public.enterprise_internal_dispatch_offers
    SET status='expired',responded_at=now()
    WHERE service_request_id=v_row.service_request_id
      AND status='offered';

    v_result := fixeo_private._fixeo_start_external_dispatch_v1(
      v_row.service_request_id,
      v_row.enterprise_id,
      v_row.policy_id,
      v_row.mode,
      'dispatch.external_fallback'
    );

    IF COALESCE((v_result->>'ok')::boolean,false) THEN
      v_processed := v_processed + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'processed',v_processed,
    'failed',v_failed
  );
END;
$function$;

ALTER FUNCTION public.run_enterprise_dispatch_fallbacks_v1()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_enterprise_dispatch_fallbacks_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_enterprise_dispatch_fallbacks_v1()
  TO service_role;

COMMIT;
