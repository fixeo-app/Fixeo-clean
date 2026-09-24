-- FIXEO ENTERPRISE — BLOCK D / Equipment & Asset Registry
BEGIN;

-- 1) Extend Enterprise audit vocabulary.
ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_event_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_event_type_chk
  CHECK (event_type = ANY (ARRAY[
    'member.role_updated'::text,'member.status_updated'::text,
    'site.created'::text,'site.updated'::text,'site.status_updated'::text,
    'request.created'::text,'account.created'::text,'account.updated'::text,
    'member.invited'::text,'member.invitation_accepted'::text,
    'member.invitation_revoked'::text,'member.invitation_expired'::text,
    'account.status_updated'::text,'account.ownership_transferred'::text,
    'sla.policy_created'::text,'sla.policy_updated'::text,'sla.snapshot_created'::text,
    'member.site_assigned'::text,'member.site_unassigned'::text,
    'workforce.worker_created'::text,'workforce.worker_updated'::text,
    'workforce.skills_updated'::text,'workforce.sites_updated'::text,
    'workforce.availability_updated'::text,
    'dispatch.policy_created'::text,'dispatch.policy_updated'::text,
    'dispatch.internal_offered'::text,'dispatch.internal_accepted'::text,
    'dispatch.internal_declined'::text,'dispatch.internal_assignment_updated'::text,
    'dispatch.external_started'::text,'dispatch.external_fallback'::text,
    'dispatch.no_internal_candidate'::text,
    'control_tower.escalation_created'::text,'control_tower.escalation_updated'::text,
    'maintenance.plan_created'::text,'maintenance.plan_updated'::text,
    'equipment.created'::text,'equipment.updated'::text,
    'equipment.request_linked'::text,'equipment.request_unlinked'::text,
    'equipment.maintenance_linked'::text,'equipment.maintenance_unlinked'::text,
    'equipment.asset_registered'::text,'equipment.asset_removed'::text
  ]));

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_target_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_target_type_chk
  CHECK (target_type = ANY (ARRAY[
    'enterprise_member'::text,'enterprise_site'::text,'service_request'::text,
    'enterprise_account'::text,'enterprise_invitation'::text,'enterprise_member_site'::text,
    'enterprise_workforce_worker'::text,'enterprise_dispatch_policy'::text,
    'enterprise_internal_assignment'::text,'enterprise_control_tower_escalation'::text,
    'enterprise_maintenance_plan'::text,'enterprise_equipment'::text,
    'enterprise_equipment_asset'::text
  ]));

-- 2) Equipment registry.
CREATE TABLE public.enterprise_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.enterprise_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name text NOT NULL,
  category text NOT NULL,
  asset_code text,
  manufacturer text,
  model text,
  serial_number text,
  installed_at date,
  criticality text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_equipment_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT enterprise_equipment_category_chk CHECK (char_length(btrim(category)) BETWEEN 1 AND 160),
  CONSTRAINT enterprise_equipment_code_chk CHECK (asset_code IS NULL OR char_length(btrim(asset_code)) BETWEEN 1 AND 100),
  CONSTRAINT enterprise_equipment_criticality_chk CHECK (criticality IN ('low','medium','high','critical')),
  CONSTRAINT enterprise_equipment_status_chk CHECK (status IN ('active','out_of_service','retired')),
  CONSTRAINT enterprise_equipment_notes_chk CHECK (notes IS NULL OR char_length(btrim(notes)) <= 2000)
);
CREATE UNIQUE INDEX enterprise_equipment_asset_code_uq
  ON public.enterprise_equipment(enterprise_id,lower(btrim(asset_code)))
  WHERE asset_code IS NOT NULL;
CREATE INDEX idx_enterprise_equipment_site ON public.enterprise_equipment(enterprise_id,site_id,status);
CREATE INDEX idx_enterprise_equipment_criticality ON public.enterprise_equipment(enterprise_id,criticality,status);

CREATE TABLE public.enterprise_equipment_request_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.enterprise_equipment(id) ON UPDATE CASCADE ON DELETE CASCADE,
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_equipment_request_links_uq UNIQUE(equipment_id,service_request_id)
);
CREATE INDEX idx_enterprise_equipment_request_links_request
  ON public.enterprise_equipment_request_links(enterprise_id,service_request_id);

CREATE TABLE public.enterprise_equipment_maintenance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.enterprise_equipment(id) ON UPDATE CASCADE ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.enterprise_maintenance_plans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_equipment_maintenance_links_uq UNIQUE(equipment_id,plan_id)
);

CREATE TABLE public.enterprise_equipment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.enterprise_equipment(id) ON UPDATE CASCADE ON DELETE CASCADE,
  asset_type text NOT NULL,
  title text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_equipment_assets_type_chk CHECK (asset_type IN ('photo','document','manual','warranty','invoice','other')),
  CONSTRAINT enterprise_equipment_assets_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT enterprise_equipment_assets_mime_chk CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  CONSTRAINT enterprise_equipment_assets_size_chk CHECK (size_bytes BETWEEN 1 AND 10485760)
);
CREATE INDEX idx_enterprise_equipment_assets_equipment ON public.enterprise_equipment_assets(equipment_id,created_at DESC);

-- 3) Access helpers.
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_can_manage_enterprise_equipment(
  p_enterprise_id uuid,p_site_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.enterprise_id=p_enterprise_id
      AND em.user_id=auth.uid()
      AND em.status='active'
      AND (
        em.role IN ('owner','admin','operations_manager')
        OR (
          em.role='site_manager'
          AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,p_site_id)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_can_access_enterprise_equipment(
  p_enterprise_id uuid,p_equipment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.enterprise_equipment e
    WHERE e.id=p_equipment_id
      AND e.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(e.enterprise_id,e.site_id)
  );
$function$;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_can_manage_enterprise_equipment_id(
  p_enterprise_id uuid,p_equipment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.enterprise_equipment e
    WHERE e.id=p_equipment_id
      AND e.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_manage_enterprise_equipment(e.enterprise_id,e.site_id)
  );
$function$;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_can_access_enterprise_equipment_path(
  p_enterprise_id_text text,p_equipment_id_text text,p_manage boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_enterprise_id uuid;
  v_equipment_id uuid;
BEGIN
  BEGIN
    v_enterprise_id:=p_enterprise_id_text::uuid;
    v_equipment_id:=p_equipment_id_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF p_manage THEN
    RETURN fixeo_private._fixeo_can_manage_enterprise_equipment_id(v_enterprise_id,v_equipment_id);
  END IF;
  RETURN fixeo_private._fixeo_can_access_enterprise_equipment(v_enterprise_id,v_equipment_id);
END;
$function$;

REVOKE ALL ON FUNCTION fixeo_private._fixeo_can_manage_enterprise_equipment(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_can_access_enterprise_equipment(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_can_manage_enterprise_equipment_id(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_can_access_enterprise_equipment_path(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_can_manage_enterprise_equipment(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_can_access_enterprise_equipment(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_can_manage_enterprise_equipment_id(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_can_access_enterprise_equipment_path(text,text,boolean) TO authenticated,service_role;

-- 4) RLS / table grants.
ALTER TABLE public.enterprise_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_equipment_request_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_equipment_maintenance_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_equipment_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY ee_members_select ON public.enterprise_equipment
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id));

CREATE POLICY eerl_members_select ON public.enterprise_equipment_request_links
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_can_access_enterprise_equipment(enterprise_id,equipment_id));

CREATE POLICY eeml_members_select ON public.enterprise_equipment_maintenance_links
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_can_access_enterprise_equipment(enterprise_id,equipment_id));

CREATE POLICY eea_members_select ON public.enterprise_equipment_assets
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_can_access_enterprise_equipment(enterprise_id,equipment_id));

REVOKE ALL ON TABLE public.enterprise_equipment,public.enterprise_equipment_request_links,
  public.enterprise_equipment_maintenance_links,public.enterprise_equipment_assets
FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.enterprise_equipment,public.enterprise_equipment_request_links,
  public.enterprise_equipment_maintenance_links,public.enterprise_equipment_assets
TO authenticated;

-- 5) Private Storage bucket for equipment assets.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES(
  'enterprise-equipment-private',
  'enterprise-equipment-private',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY enterprise_equipment_assets_storage_read
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='enterprise-equipment-private'
  AND (storage.foldername(name))[1]='enterprise'
  AND (storage.foldername(name))[3]='equipment'
  AND fixeo_private._fixeo_can_access_enterprise_equipment_path(
    (storage.foldername(name))[2],
    (storage.foldername(name))[4],
    false
  )
);

CREATE POLICY enterprise_equipment_assets_storage_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='enterprise-equipment-private'
  AND (storage.foldername(name))[1]='enterprise'
  AND (storage.foldername(name))[3]='equipment'
  AND fixeo_private._fixeo_can_access_enterprise_equipment_path(
    (storage.foldername(name))[2],
    (storage.foldername(name))[4],
    true
  )
);

CREATE POLICY enterprise_equipment_assets_storage_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id='enterprise-equipment-private'
  AND (storage.foldername(name))[1]='enterprise'
  AND (storage.foldername(name))[3]='equipment'
  AND fixeo_private._fixeo_can_access_enterprise_equipment_path(
    (storage.foldername(name))[2],
    (storage.foldername(name))[4],
    true
  )
);

-- 6) Equipment upsert.
CREATE OR REPLACE FUNCTION public.upsert_enterprise_equipment_v1(
  p_enterprise_id uuid,p_equipment_id uuid,p_site_id uuid,p_name text,p_category text,
  p_asset_code text,p_manufacturer text,p_model text,p_serial_number text,p_installed_at date,
  p_criticality text,p_status text,p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_id uuid; v_before jsonb; v_event text;
  v_name text:=pg_catalog.btrim(p_name);
  v_category text:=pg_catalog.lower(pg_catalog.btrim(p_category));
  v_code text:=NULLIF(pg_catalog.btrim(p_asset_code),'');
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_can_manage_enterprise_equipment(p_enterprise_id,p_site_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','forbidden');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.enterprise_sites s WHERE s.id=p_site_id AND s.enterprise_id=p_enterprise_id AND s.status='active') THEN
    RETURN jsonb_build_object('ok',false,'reason','site_not_available');
  END IF;
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_name'); END IF;
  IF v_category IS NULL OR char_length(v_category) NOT BETWEEN 1 AND 160 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_category'); END IF;
  IF p_criticality NOT IN ('low','medium','high','critical') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_criticality'); END IF;
  IF p_status NOT IN ('active','out_of_service','retired') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;

  IF p_equipment_id IS NULL THEN
    INSERT INTO public.enterprise_equipment(
      enterprise_id,site_id,name,category,asset_code,manufacturer,model,serial_number,
      installed_at,criticality,status,notes,created_by,updated_by
    ) VALUES(
      p_enterprise_id,p_site_id,v_name,v_category,v_code,NULLIF(btrim(p_manufacturer),''),
      NULLIF(btrim(p_model),''),NULLIF(btrim(p_serial_number),''),p_installed_at,
      p_criticality,p_status,NULLIF(btrim(p_notes),''),auth.uid(),auth.uid()
    ) RETURNING id INTO v_id;
    v_event:='equipment.created';
  ELSE
    SELECT to_jsonb(e) INTO v_before FROM public.enterprise_equipment e
    WHERE e.id=p_equipment_id AND e.enterprise_id=p_enterprise_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','equipment_not_found'); END IF;
    UPDATE public.enterprise_equipment SET
      site_id=p_site_id,name=v_name,category=v_category,asset_code=v_code,
      manufacturer=NULLIF(btrim(p_manufacturer),''),model=NULLIF(btrim(p_model),''),
      serial_number=NULLIF(btrim(p_serial_number),''),installed_at=p_installed_at,
      criticality=p_criticality,status=p_status,notes=NULLIF(btrim(p_notes),''),
      updated_by=auth.uid(),updated_at=now()
    WHERE id=p_equipment_id RETURNING id INTO v_id;
    v_event:='equipment.updated';
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,v_event,'enterprise_equipment',v_id,v_before,
    jsonb_build_object('site_id',p_site_id,'category',v_category,'criticality',p_criticality,'status',p_status,'asset_code',v_code),
    jsonb_build_object('name',v_name)
  );
  RETURN jsonb_build_object('ok',true,'equipment_id',v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok',false,'reason','asset_code_exists');
WHEN OTHERS THEN
  RAISE WARNING '[upsert_enterprise_equipment_v1] % %',SQLSTATE,SQLERRM;
  RETURN jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

-- 7) Link / unlink an intervention.
CREATE OR REPLACE FUNCTION public.set_enterprise_equipment_request_link_v1(
  p_enterprise_id uuid,p_equipment_id uuid,p_request_id uuid,p_linked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_site_id uuid; v_link_id uuid; v_event text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  SELECT e.site_id INTO v_site_id FROM public.enterprise_equipment e
  WHERE e.id=p_equipment_id AND e.enterprise_id=p_enterprise_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','equipment_not_found'); END IF;
  IF NOT fixeo_private._fixeo_can_manage_enterprise_equipment(p_enterprise_id,v_site_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.enterprise_request_context erc
    WHERE erc.enterprise_id=p_enterprise_id AND erc.site_id=v_site_id AND erc.service_request_id=p_request_id
  ) THEN RETURN jsonb_build_object('ok',false,'reason','request_site_mismatch'); END IF;

  IF p_linked THEN
    INSERT INTO public.enterprise_equipment_request_links(enterprise_id,equipment_id,service_request_id,created_by)
    VALUES(p_enterprise_id,p_equipment_id,p_request_id,auth.uid())
    ON CONFLICT(equipment_id,service_request_id) DO NOTHING
    RETURNING id INTO v_link_id;
    IF v_link_id IS NULL THEN
      SELECT id INTO v_link_id FROM public.enterprise_equipment_request_links WHERE equipment_id=p_equipment_id AND service_request_id=p_request_id;
    END IF;
    v_event:='equipment.request_linked';
  ELSE
    DELETE FROM public.enterprise_equipment_request_links
    WHERE enterprise_id=p_enterprise_id AND equipment_id=p_equipment_id AND service_request_id=p_request_id
    RETURNING id INTO v_link_id;
    v_event:='equipment.request_unlinked';
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,v_event,'enterprise_equipment',p_equipment_id,NULL,
    jsonb_build_object('service_request_id',p_request_id,'site_id',v_site_id),
    '{}'::jsonb
  );
  RETURN jsonb_build_object('ok',true,'linked',p_linked,'link_id',v_link_id);
END;
$function$;

-- 8) Link / unlink a preventive plan.
CREATE OR REPLACE FUNCTION public.set_enterprise_equipment_maintenance_link_v1(
  p_enterprise_id uuid,p_equipment_id uuid,p_plan_id uuid,p_linked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_site_id uuid; v_link_id uuid; v_event text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  SELECT e.site_id INTO v_site_id FROM public.enterprise_equipment e
  WHERE e.id=p_equipment_id AND e.enterprise_id=p_enterprise_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','equipment_not_found'); END IF;
  IF NOT fixeo_private._fixeo_can_manage_enterprise_equipment(p_enterprise_id,v_site_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.enterprise_maintenance_plans p
    WHERE p.id=p_plan_id AND p.enterprise_id=p_enterprise_id AND p.site_id=v_site_id
  ) THEN RETURN jsonb_build_object('ok',false,'reason','plan_site_mismatch'); END IF;

  IF p_linked THEN
    INSERT INTO public.enterprise_equipment_maintenance_links(enterprise_id,equipment_id,plan_id,created_by)
    VALUES(p_enterprise_id,p_equipment_id,p_plan_id,auth.uid())
    ON CONFLICT(equipment_id,plan_id) DO NOTHING
    RETURNING id INTO v_link_id;
    IF v_link_id IS NULL THEN SELECT id INTO v_link_id FROM public.enterprise_equipment_maintenance_links WHERE equipment_id=p_equipment_id AND plan_id=p_plan_id; END IF;
    v_event:='equipment.maintenance_linked';
  ELSE
    DELETE FROM public.enterprise_equipment_maintenance_links
    WHERE enterprise_id=p_enterprise_id AND equipment_id=p_equipment_id AND plan_id=p_plan_id
    RETURNING id INTO v_link_id;
    v_event:='equipment.maintenance_unlinked';
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,v_event,'enterprise_equipment',p_equipment_id,NULL,
    jsonb_build_object('plan_id',p_plan_id,'site_id',v_site_id),
    '{}'::jsonb
  );
  RETURN jsonb_build_object('ok',true,'linked',p_linked,'link_id',v_link_id);
END;
$function$;

-- 9) Asset metadata registration/removal. Storage object upload/delete remains governed by storage RLS.
CREATE OR REPLACE FUNCTION public.register_enterprise_equipment_asset_v1(
  p_enterprise_id uuid,p_equipment_id uuid,p_asset_type text,p_title text,
  p_storage_path text,p_mime_type text,p_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_id uuid; v_prefix text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_can_manage_enterprise_equipment_id(p_enterprise_id,p_equipment_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF p_asset_type NOT IN ('photo','document','manual','warranty','invoice','other') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_asset_type'); END IF;
  IF p_mime_type NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_mime_type'); END IF;
  IF p_size_bytes IS NULL OR p_size_bytes<1 OR p_size_bytes>10485760 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_size'); END IF;
  v_prefix:='enterprise/'||p_enterprise_id::text||'/equipment/'||p_equipment_id::text||'/';
  IF p_storage_path IS NULL OR position(v_prefix in p_storage_path)<>1 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_storage_path'); END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='enterprise-equipment-private' AND o.name=p_storage_path) THEN
    RETURN jsonb_build_object('ok',false,'reason','object_not_found');
  END IF;

  INSERT INTO public.enterprise_equipment_assets(enterprise_id,equipment_id,asset_type,title,storage_path,mime_type,size_bytes,created_by)
  VALUES(p_enterprise_id,p_equipment_id,p_asset_type,btrim(p_title),p_storage_path,p_mime_type,p_size_bytes,auth.uid())
  RETURNING id INTO v_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,'equipment.asset_registered','enterprise_equipment_asset',v_id,NULL,
    jsonb_build_object('equipment_id',p_equipment_id,'asset_type',p_asset_type,'mime_type',p_mime_type,'size_bytes',p_size_bytes),
    '{}'::jsonb
  );
  RETURN jsonb_build_object('ok',true,'asset_id',v_id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'reason','asset_exists');
WHEN OTHERS THEN
  RAISE WARNING '[register_enterprise_equipment_asset_v1] % %',SQLSTATE,SQLERRM;
  RETURN jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_enterprise_equipment_asset_v1(
  p_enterprise_id uuid,p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_equipment_id uuid; v_path text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  SELECT a.equipment_id,a.storage_path INTO v_equipment_id,v_path
  FROM public.enterprise_equipment_assets a
  WHERE a.id=p_asset_id AND a.enterprise_id=p_enterprise_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','asset_not_found'); END IF;
  IF NOT fixeo_private._fixeo_can_manage_enterprise_equipment_id(p_enterprise_id,v_equipment_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;

  DELETE FROM public.enterprise_equipment_assets WHERE id=p_asset_id;
  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,'equipment.asset_removed','enterprise_equipment_asset',p_asset_id,
    jsonb_build_object('equipment_id',v_equipment_id,'storage_path',v_path),NULL,'{}'::jsonb
  );
  RETURN jsonb_build_object('ok',true,'storage_path',v_path,'equipment_id',v_equipment_id);
END;
$function$;

-- 10) Fleet read model.
CREATE OR REPLACE FUNCTION public.get_enterprise_equipment_fleet_v1(
  p_enterprise_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_items jsonb; v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_member(p_enterprise_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',e.id,'site_id',e.site_id,'site_name',s.name,'city',s.city,
    'name',e.name,'category',e.category,'asset_code',e.asset_code,
    'manufacturer',e.manufacturer,'model',e.model,'serial_number',e.serial_number,
    'installed_at',e.installed_at,'criticality',e.criticality,'status',e.status,'notes',e.notes,
    'intervention_count',(SELECT count(*)::int FROM public.enterprise_equipment_request_links l WHERE l.equipment_id=e.id),
    'open_intervention_count',(SELECT count(*)::int FROM public.enterprise_equipment_request_links l JOIN public.service_requests sr ON sr.id=l.service_request_id WHERE l.equipment_id=e.id AND sr.status NOT IN ('completed','validated','cancelled')),
    'failure_count_90d',(SELECT count(*)::int FROM public.enterprise_equipment_request_links l JOIN public.service_requests sr ON sr.id=l.service_request_id WHERE l.equipment_id=e.id AND sr.created_at>=now()-interval '90 days'),
    'recurring_failure',(SELECT count(*)>=3 FROM public.enterprise_equipment_request_links l JOIN public.service_requests sr ON sr.id=l.service_request_id WHERE l.equipment_id=e.id AND sr.created_at>=now()-interval '90 days'),
    'maintenance_plan_count',(SELECT count(*)::int FROM public.enterprise_equipment_maintenance_links ml WHERE ml.equipment_id=e.id),
    'asset_count',(SELECT count(*)::int FROM public.enterprise_equipment_assets a WHERE a.equipment_id=e.id),
    'last_intervention_at',(SELECT max(sr.created_at) FROM public.enterprise_equipment_request_links l JOIN public.service_requests sr ON sr.id=l.service_request_id WHERE l.equipment_id=e.id),
    'updated_at',e.updated_at
  ) ORDER BY
    CASE e.criticality WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    e.name), '[]'::jsonb)
  INTO v_items
  FROM public.enterprise_equipment e
  JOIN public.enterprise_sites s ON s.id=e.site_id
  WHERE e.enterprise_id=p_enterprise_id
    AND fixeo_private._fixeo_can_access_enterprise_site(e.enterprise_id,e.site_id);

  SELECT jsonb_build_object(
    'total',count(*)::int,
    'active',count(*) FILTER(WHERE e.status='active')::int,
    'out_of_service',count(*) FILTER(WHERE e.status='out_of_service')::int,
    'critical',count(*) FILTER(WHERE e.criticality='critical' AND e.status<>'retired')::int,
    'recurring_failure',count(*) FILTER(WHERE (
      SELECT count(*)>=3 FROM public.enterprise_equipment_request_links l
      JOIN public.service_requests sr ON sr.id=l.service_request_id
      WHERE l.equipment_id=e.id AND sr.created_at>=now()-interval '90 days'
    ))::int
  )
  INTO v_summary
  FROM public.enterprise_equipment e
  WHERE e.enterprise_id=p_enterprise_id
    AND fixeo_private._fixeo_can_access_enterprise_site(e.enterprise_id,e.site_id);

  RETURN jsonb_build_object('ok',true,'summary',v_summary,'equipment',v_items);
END;
$function$;

-- 11) Equipment detail / complete history.
CREATE OR REPLACE FUNCTION public.get_enterprise_equipment_detail_v1(
  p_enterprise_id uuid,p_equipment_id uuid,p_history_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_equipment jsonb; v_requests jsonb; v_plans jsonb; v_assets jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_history_limit<1 OR p_history_limit>500 THEN RAISE EXCEPTION 'invalid_limit'; END IF;
  IF NOT fixeo_private._fixeo_can_access_enterprise_equipment(p_enterprise_id,p_equipment_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT to_jsonb(x) INTO v_equipment FROM (
    SELECT e.id,e.enterprise_id,e.site_id,s.name site_name,s.city,e.name,e.category,e.asset_code,
      e.manufacturer,e.model,e.serial_number,e.installed_at,e.criticality,e.status,e.notes,e.created_at,e.updated_at
    FROM public.enterprise_equipment e JOIN public.enterprise_sites s ON s.id=e.site_id
    WHERE e.id=p_equipment_id AND e.enterprise_id=p_enterprise_id
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'request_id',sr.id,'service_category',sr.service_category,'urgency',sr.urgency,
    'status',sr.status,'created_at',sr.created_at
  ) ORDER BY sr.created_at DESC),'[]'::jsonb)
  INTO v_requests
  FROM (
    SELECT sr.*
    FROM public.enterprise_equipment_request_links l
    JOIN public.service_requests sr ON sr.id=l.service_request_id
    WHERE l.equipment_id=p_equipment_id
    ORDER BY sr.created_at DESC
    LIMIT p_history_limit
  ) sr;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'plan_id',p.id,'name',p.name,'service_category',p.service_category,
    'frequency',p.frequency,'interval_count',p.interval_count,'next_due_at',p.next_due_at,'status',p.status
  ) ORDER BY p.next_due_at),'[]'::jsonb)
  INTO v_plans
  FROM public.enterprise_equipment_maintenance_links l
  JOIN public.enterprise_maintenance_plans p ON p.id=l.plan_id
  WHERE l.equipment_id=p_equipment_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',a.id,'asset_type',a.asset_type,'title',a.title,'storage_path',a.storage_path,
    'mime_type',a.mime_type,'size_bytes',a.size_bytes,'created_at',a.created_at
  ) ORDER BY a.created_at DESC),'[]'::jsonb)
  INTO v_assets
  FROM public.enterprise_equipment_assets a
  WHERE a.equipment_id=p_equipment_id;

  RETURN jsonb_build_object('ok',true,'equipment',v_equipment,'interventions',v_requests,'maintenance_plans',v_plans,'assets',v_assets);
END;
$function$;

-- Ownership/grants.
ALTER FUNCTION public.upsert_enterprise_equipment_v1(uuid,uuid,uuid,text,text,text,text,text,text,date,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.set_enterprise_equipment_request_link_v1(uuid,uuid,uuid,boolean) OWNER TO postgres;
ALTER FUNCTION public.set_enterprise_equipment_maintenance_link_v1(uuid,uuid,uuid,boolean) OWNER TO postgres;
ALTER FUNCTION public.register_enterprise_equipment_asset_v1(uuid,uuid,text,text,text,text,bigint) OWNER TO postgres;
ALTER FUNCTION public.remove_enterprise_equipment_asset_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_equipment_fleet_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_equipment_detail_v1(uuid,uuid,integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_enterprise_equipment_v1(uuid,uuid,uuid,text,text,text,text,text,text,date,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_enterprise_equipment_request_link_v1(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_enterprise_equipment_maintenance_link_v1(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.register_enterprise_equipment_asset_v1(uuid,uuid,text,text,text,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.remove_enterprise_equipment_asset_v1(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_equipment_fleet_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_equipment_detail_v1(uuid,uuid,integer) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.upsert_enterprise_equipment_v1(uuid,uuid,uuid,text,text,text,text,text,text,date,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_enterprise_equipment_request_link_v1(uuid,uuid,uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_enterprise_equipment_maintenance_link_v1(uuid,uuid,uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_enterprise_equipment_asset_v1(uuid,uuid,text,text,text,text,bigint) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_enterprise_equipment_asset_v1(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_equipment_fleet_v1(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_equipment_detail_v1(uuid,uuid,integer) TO authenticated,service_role;

COMMIT;
