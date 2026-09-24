-- S1B additive candidate. REVIEW ONLY: NOT APPLIED.
-- Deploy this RPC before the proposed frontend. Final INSERT revoke is separate and blocked.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR to_regprocedure('public.publish_notification_event_s1b(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'S1B owner/function drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications'
    AND policyname='user_insert_notifications' AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[] AND with_check='true')
    OR NOT has_table_privilege('authenticated','public.notifications','INSERT')
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.notifications'::regclass AND relrowsecurity AND relowner='postgres'::regrole) THEN
    RAISE EXCEPTION 'S1B notifications baseline drift';
  END IF;
END $guard$;

CREATE FUNCTION public.publish_notification_event_s1b(p_event text, p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_request public.service_requests%ROWTYPE;
  v_mission public.missions%ROWTYPE;
  v_artisan public.artisans%ROWTYPE;
  v_claim public.claim_requests%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_ref text;
  v_metadata jsonb;
  v_recipient uuid;
  v_count integer := 0;
  v_affected integer;
BEGIN
  IF v_uid IS NULL OR p_entity_id IS NULL OR p_event IS NULL OR p_event NOT IN
    ('request_created','mission_accepted','mission_started','mission_completed','mission_validated','claim_submitted') THEN
    RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND role='admin') INTO v_admin;
  -- Serialize retries for the same business event. No business row is modified.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fixeo:s1b:'||p_event||':'||p_entity_id::text,0));
  v_ref := pg_catalog.upper(pg_catalog.right(p_entity_id::text,6));
  v_metadata := pg_catalog.jsonb_build_object('source','s1b','event',p_event);

  IF p_event='claim_submitted' THEN
    SELECT * INTO v_claim FROM public.claim_requests WHERE id=p_entity_id;
    IF NOT FOUND OR v_claim.status <> 'pending' OR (NOT v_admin AND v_claim.requester_user_id IS DISTINCT FROM v_uid) THEN
      RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
    END IF;
    v_items := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('role','admin','type','adm_claim_request',
      'title','Nouvelle revendication','message','Revendication artisan soumise — ID claim: '||p_entity_id::text));
  ELSE
    SELECT * INTO v_request FROM public.service_requests WHERE id=p_entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501'; END IF;
    IF p_event='request_created' THEN
      IF NOT v_admin AND v_request.client_profile_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
      END IF;
      IF v_request.client_profile_id IS NOT NULL THEN
        v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('uid',v_request.client_profile_id,'role','client',
          'type','c_request_created','title','Demande publiée','message','Votre demande pour « '||coalesce(v_request.service_category,'')||' » a été envoyée.'));
      END IF;
      v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('role','admin','type','adm_new_request',
        'title','Nouvelle demande','message','Nouvelle demande : '||coalesce(v_request.service_category,'')||' — #'||v_ref));
    ELSE
      -- One unambiguous active/completed mission, never a phone/metadata identity fallback.
      IF (SELECT count(*) FROM public.missions m WHERE m.request_id=p_entity_id::text AND m.status IN('pending','done','validated')) <> 1 THEN
        RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
      END IF;
      SELECT * INTO v_mission FROM public.missions WHERE request_id=p_entity_id::text AND status IN('pending','done','validated');
      SELECT * INTO v_artisan FROM public.artisans WHERE id=v_mission.artisan_profile_id;
      IF NOT FOUND OR v_artisan.owner_user_id IS NULL
        OR (v_mission.client_profile_id IS NOT NULL AND v_mission.client_profile_id IS DISTINCT FROM v_request.client_profile_id) THEN
        RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
      END IF;
      IF p_event='mission_validated' THEN
        IF (NOT v_admin AND v_request.client_profile_id IS DISTINCT FROM v_uid)
          OR v_request.status <> 'validated' OR v_mission.status NOT IN('done','validated') THEN
          RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
        END IF;
      ELSE
        IF NOT v_admin AND v_artisan.owner_user_id IS DISTINCT FROM v_uid THEN
          RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
        END IF;
        IF (p_event='mission_accepted' AND (v_request.status <> 'assigned' OR v_mission.status <> 'pending'))
          OR (p_event='mission_started' AND (v_request.status <> 'in_progress' OR v_mission.status <> 'pending'))
          OR (p_event='mission_completed' AND (v_request.status <> 'completed' OR v_mission.status <> 'done')) THEN
          RAISE EXCEPTION 'Notification event not authorized' USING ERRCODE='42501';
        END IF;
      END IF;
      CASE p_event
      WHEN 'mission_accepted' THEN
        v_items := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('uid',v_artisan.owner_user_id,'role','artisan','type','a_mission_accepted','title','Mission acceptée','message','Mission #'||v_ref||' acceptée.'),
          pg_catalog.jsonb_build_object('uid',v_request.client_profile_id,'role','client','type','c_artisan_assigned','title','Artisan assigné','message','Un artisan a accepté votre mission #'||v_ref||'.'));
      WHEN 'mission_started' THEN
        v_items := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('uid',v_artisan.owner_user_id,'role','artisan','type','a_mission_started','title','Intervention démarrée','message','Mission #'||v_ref||' démarrée.'),
          pg_catalog.jsonb_build_object('uid',v_request.client_profile_id,'role','client','type','c_mission_started','title','Intervention démarrée','message','Votre artisan a démarré l''intervention.'),
          pg_catalog.jsonb_build_object('role','admin','type','adm_new_request','title','Intervention démarrée','message','Mission #'||v_ref||' en cours.'));
      WHEN 'mission_completed' THEN
        v_items := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('uid',v_artisan.owner_user_id,'role','artisan','type','a_mission_completed','title','Mission terminée','message','Mission #'||v_ref||' en attente confirmation.'),
          pg_catalog.jsonb_build_object('uid',v_request.client_profile_id,'role','client','type','c_mission_completed','title','Intervention terminée','message','Votre artisan a terminé. Confirmez pour valider la mission.'),
          pg_catalog.jsonb_build_object('uid',v_request.client_profile_id,'role','client','type','c_confirm_pending','title','Confirmation requise','message','Confirmez la mission #'||v_ref||' pour clôturer.'),
          pg_catalog.jsonb_build_object('role','admin','type','adm_mission_validated','title','Intervention terminée','message','Mission #'||v_ref||' — À valider.'));
      WHEN 'mission_validated' THEN
        -- Amount is deliberately not inferred from client-editable financial fields.
        v_items := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('uid',v_request.client_profile_id,'role','client','type','c_mission_validated','title','Mission validée','message','Mission #'||v_ref||' validée.'),
          pg_catalog.jsonb_build_object('uid',v_artisan.owner_user_id,'role','artisan','type','a_mission_validated','title','Mission validée par le client','message','Le client a validé la mission #'||v_ref||'.'),
          pg_catalog.jsonb_build_object('role','admin','type','adm_commission_due','title','Commission à vérifier','message','Mission #'||v_ref||' validée — commission à vérifier.'));
      END CASE;
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) LOOP
    v_recipient := (v_item->>'uid')::uuid;
    -- Guest requests have no authenticated Client recipient; never create a NULL client broadcast.
    IF v_recipient IS NULL AND v_item->>'role' <> 'admin' THEN CONTINUE; END IF;
    INSERT INTO public.notifications(recipient_user_id,recipient_role,type,title,message,related_entity_type,related_entity_id,metadata)
      SELECT v_recipient,v_item->>'role',v_item->>'type',v_item->>'title',v_item->>'message',
        CASE WHEN p_event='claim_submitted' THEN 'claim_request' WHEN p_event='request_created' THEN 'service_request' ELSE 'mission' END,
        p_entity_id::text,v_metadata
      WHERE NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.related_entity_id=p_entity_id::text
        AND n.type=v_item->>'type' AND n.recipient_user_id IS NOT DISTINCT FROM v_recipient AND n.metadata @> v_metadata);
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_count := v_count + v_affected;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('ok',true,'inserted',v_count);
END $function$;
ALTER FUNCTION public.publish_notification_event_s1b(text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_notification_event_s1b(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_notification_event_s1b(text,uuid) TO authenticated,service_role;
-- Authenticated business identity is required even through the RPC. Existing service_role direct writes remain unchanged.
DO $post$
BEGIN
  IF has_function_privilege('anon','public.publish_notification_event_s1b(text,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.publish_notification_event_s1b(text,uuid)','EXECUTE')
    OR NOT has_table_privilege('authenticated','public.notifications','INSERT')
    OR NOT has_table_privilege('service_role','public.notifications','INSERT') THEN
    RAISE EXCEPTION 'S1B additive postcondition failed';
  END IF;
END $post$;
COMMIT;
