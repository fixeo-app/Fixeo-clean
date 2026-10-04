CREATE OR REPLACE FUNCTION public.diagnostic_cleanup_v1(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$
