-- Scheduled deletion and accepted-partner context; no live scheduler is enabled here.
SET LOCAL lock_timeout = '3s';
ALTER TABLE fixeo_private.diagnostic_media_v1
  ADD raw_finalized boolean NOT NULL DEFAULT false,
  ADD purge_lease uuid,
  ADD purge_lease_until timestamptz,
  ADD purge_clean boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.diagnostic_cleanup_v1(p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE m fixeo_private.diagnostic_media_v1%ROWTYPE; items jsonb := '[]';
  delete_clean boolean; complete_raw boolean;
BEGIN
  IF p_action='claim' THEN
    -- Interrupted requests do not hold a dossier indefinitely.
    UPDATE fixeo_private.diagnostic_runs_v1 SET state='failed',error_code='LEASE_EXPIRED',finished_at=now()
      WHERE state='running' AND lease_until<now();
    UPDATE fixeo_private.diagnostic_sessions_v1 s SET state='draft',updated_at=now()
      WHERE s.state='analyzing' AND NOT EXISTS(SELECT 1 FROM fixeo_private.diagnostic_runs_v1 r WHERE r.session_id=s.id AND r.state='running');
    -- First observed closure starts the 30-day media retention window.
    UPDATE fixeo_private.diagnostic_sessions_v1 s SET closed_seen_at=now()
      WHERE s.state='bound' AND s.closed_seen_at IS NULL AND EXISTS(
        SELECT 1 FROM public.service_requests sr WHERE sr.id=s.service_request_id
          AND sr.status IN ('completed','validated','cancelled'));
    UPDATE fixeo_private.diagnostic_media_v1 x SET expires_at=least(x.expires_at,s.closed_seen_at+interval '30 days')
      FROM fixeo_private.diagnostic_sessions_v1 s WHERE s.id=x.session_id AND s.closed_seen_at IS NOT NULL
        AND x.expires_at>s.closed_seen_at+interval '30 days';
    FOR m IN SELECT x.* FROM fixeo_private.diagnostic_media_v1 x
      WHERE x.state<>'deleted' AND x.purge_after<=now()
        AND (x.purge_lease_until IS NULL OR x.purge_lease_until<now())
        AND (x.expires_at<=now() OR x.state IN ('rejected','removed')
          OR (NOT x.raw_finalized AND (x.state='ready' OR x.upload_expires_at+interval '5 minutes'<now())))
      ORDER BY x.purge_after,x.id LIMIT 8 FOR UPDATE SKIP LOCKED LOOP
      delete_clean := m.expires_at<=now() OR m.state IN ('removed','rejected');
      UPDATE fixeo_private.diagnostic_media_v1 SET purge_lease=gen_random_uuid(),purge_lease_until=now()+interval '5 minutes',purge_clean=delete_clean
        WHERE id=m.id RETURNING * INTO m;
      items:=items || jsonb_build_array(jsonb_build_object('id',m.id,'lease',m.purge_lease,
        'paths',CASE WHEN delete_clean THEN jsonb_build_array(m.raw_path,m.clean_path) ELSE jsonb_build_array(m.raw_path) END));
    END LOOP;
    -- Expired dossiers are removed only after their object tombstones are final.
    DELETE FROM fixeo_private.diagnostic_sessions_v1 s WHERE s.expires_at<now()
      AND NOT EXISTS(SELECT 1 FROM fixeo_private.diagnostic_media_v1 x WHERE x.session_id=s.id AND x.state<>'deleted');
    DELETE FROM fixeo_private.diagnostic_usage_windows_v1 WHERE window_start<now()-interval '31 days';
    RETURN jsonb_build_object('items',items);
  ELSIF p_action='finish' THEN
    SELECT * INTO m FROM fixeo_private.diagnostic_media_v1 WHERE id=(p_payload->>'id')::uuid
      AND purge_lease=(p_payload->>'lease')::uuid FOR UPDATE;
    IF NOT FOUND OR m.purge_lease_until<now() THEN RAISE EXCEPTION 'DIAGNOSTIC_LEASE_EXPIRED'; END IF;
    IF p_payload->>'ok'='true' THEN
      complete_raw := m.upload_expires_at+interval '5 minutes'<now();
      -- Only acknowledge paths actually present in the claimed deletion batch.
      delete_clean := m.purge_clean;
      UPDATE fixeo_private.diagnostic_media_v1 SET raw_deleted_at=now(),raw_finalized=complete_raw,
        state=CASE WHEN delete_clean AND complete_raw THEN 'deleted' ELSE state END,
        purge_after=CASE WHEN NOT complete_raw THEN upload_expires_at+interval '5 minutes' ELSE expires_at END,
        purge_lease=NULL,purge_lease_until=NULL,last_purge_error=NULL WHERE id=m.id;
    ELSE
      UPDATE fixeo_private.diagnostic_media_v1 SET purge_attempts=purge_attempts+1,
        purge_after=now()+interval '5 minutes' * least(288,power(2,least(purge_attempts,8)))::integer,
        last_purge_error='STORAGE_DELETE_FAILED',purge_lease=NULL,purge_lease_until=NULL WHERE id=m.id;
    END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;
  RAISE EXCEPTION 'DIAGNOSTIC_INVALID_ACTION';
END $fn$;

CREATE FUNCTION public.diagnostic_mission_context_v1(p_user_id uuid,p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s fixeo_private.diagnostic_sessions_v1%ROWTYPE; r fixeo_private.diagnostic_runs_v1%ROWTYPE; media jsonb; pricing jsonb;
BEGIN
  -- API supplies an Auth-verified subject. A phone, supplied role or mission UUID is insufficient.
  IF p_user_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.missions m JOIN public.artisans a ON a.id=m.artisan_profile_id
    WHERE m.id=p_mission_id AND a.owner_user_id=p_user_id
      AND m.accepted_at IS NOT NULL AND m.status IN ('pending','done','validated')
  ) THEN RAISE EXCEPTION 'DIAGNOSTIC_NOT_FOUND'; END IF;
  SELECT d.* INTO s FROM fixeo_private.diagnostic_sessions_v1 d
    JOIN public.missions m ON m.request_id=d.service_request_id::text
    WHERE m.id=p_mission_id AND d.state='bound' AND d.expires_at>now();
  IF NOT FOUND THEN RETURN jsonb_build_object('result',NULL,'input',NULL,'media','[]'::jsonb); END IF;
  SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1 WHERE id=s.selected_run_id AND session_id=s.id AND state='complete';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'clean_path',m.clean_path)),'[]') INTO media
    FROM fixeo_private.diagnostic_media_v1 m WHERE m.session_id=s.id AND m.state='ready' AND m.expires_at>now()
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.input_snapshot->'media') used WHERE used->>'id'=m.id::text AND used->>'sha256'=m.sha256);
  SELECT jsonb_build_object('service_code',o.service_code,'amount_mad',o.client_total_minor::numeric/100,'currency',o.currency) INTO pricing
    FROM public.service_requests sr JOIN public.fixeo_pricing_offers_v1 o ON o.id=sr.pricing_offer_id WHERE sr.id=s.service_request_id;
  RETURN jsonb_build_object('pricing',pricing,'result',r.result,'input',r.input_snapshot->'input','media',media,'booking',to_jsonb(s)->'booking_context');
END $fn$;

REVOKE ALL ON FUNCTION public.diagnostic_cleanup_v1(text,jsonb),public.diagnostic_mission_context_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.diagnostic_cleanup_v1(text,jsonb),public.diagnostic_mission_context_v1(uuid,uuid) TO service_role;
