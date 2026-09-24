-- FIXEO ENTERPRISE — BLOCK E / Finance
-- Cost centers, budgets, purchase orders, request finance context, workforce rates, consolidated reporting/export.
BEGIN;

-- 1) Extend audit vocabulary.
ALTER TABLE public.enterprise_audit_events DROP CONSTRAINT enterprise_audit_events_event_type_chk;
ALTER TABLE public.enterprise_audit_events ADD CONSTRAINT enterprise_audit_events_event_type_chk
CHECK (event_type = ANY (ARRAY[
'member.role_updated'::text,'member.status_updated'::text,'site.created'::text,'site.updated'::text,'site.status_updated'::text,
'request.created'::text,'account.created'::text,'account.updated'::text,'member.invited'::text,'member.invitation_accepted'::text,
'member.invitation_revoked'::text,'member.invitation_expired'::text,'account.status_updated'::text,'account.ownership_transferred'::text,
'sla.policy_created'::text,'sla.policy_updated'::text,'sla.snapshot_created'::text,'member.site_assigned'::text,'member.site_unassigned'::text,
'workforce.worker_created'::text,'workforce.worker_updated'::text,'workforce.skills_updated'::text,'workforce.sites_updated'::text,
'workforce.availability_updated'::text,'dispatch.policy_created'::text,'dispatch.policy_updated'::text,'dispatch.internal_offered'::text,
'dispatch.internal_accepted'::text,'dispatch.internal_declined'::text,'dispatch.internal_assignment_updated'::text,
'dispatch.external_started'::text,'dispatch.external_fallback'::text,'dispatch.no_internal_candidate'::text,
'control_tower.escalation_created'::text,'control_tower.escalation_updated'::text,
'maintenance.plan_created'::text,'maintenance.plan_updated'::text,
'equipment.created'::text,'equipment.updated'::text,'equipment.request_linked'::text,'equipment.request_unlinked'::text,
'equipment.maintenance_linked'::text,'equipment.maintenance_unlinked'::text,'equipment.asset_registered'::text,'equipment.asset_removed'::text,
'finance.cost_center_created'::text,'finance.cost_center_updated'::text,'finance.budget_created'::text,'finance.budget_updated'::text,
'finance.po_created'::text,'finance.po_updated'::text,'finance.worker_rate_updated'::text,'finance.request_context_updated'::text
]));

ALTER TABLE public.enterprise_audit_events DROP CONSTRAINT enterprise_audit_events_target_type_chk;
ALTER TABLE public.enterprise_audit_events ADD CONSTRAINT enterprise_audit_events_target_type_chk
CHECK (target_type = ANY (ARRAY[
'enterprise_member'::text,'enterprise_site'::text,'service_request'::text,'enterprise_account'::text,'enterprise_invitation'::text,
'enterprise_member_site'::text,'enterprise_workforce_worker'::text,'enterprise_dispatch_policy'::text,'enterprise_internal_assignment'::text,
'enterprise_control_tower_escalation'::text,'enterprise_maintenance_plan'::text,'enterprise_equipment'::text,'enterprise_equipment_asset'::text,
'enterprise_cost_center'::text,'enterprise_budget'::text,'enterprise_purchase_order'::text,'enterprise_request_finance_context'::text
]));

-- 2) Finance tables.
CREATE TABLE public.enterprise_cost_centers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  site_id uuid REFERENCES public.enterprise_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  department text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_cost_centers_code_chk CHECK(char_length(btrim(code)) BETWEEN 1 AND 80),
  CONSTRAINT enterprise_cost_centers_name_chk CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT enterprise_cost_centers_status_chk CHECK(status IN ('active','inactive'))
);
CREATE UNIQUE INDEX enterprise_cost_centers_code_uq ON public.enterprise_cost_centers(enterprise_id,lower(btrim(code)));
CREATE INDEX idx_enterprise_cost_centers_scope ON public.enterprise_cost_centers(enterprise_id,site_id,status);

CREATE TABLE public.enterprise_budgets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  cost_center_id uuid NOT NULL REFERENCES public.enterprise_cost_centers(id) ON UPDATE CASCADE ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_budgets_period_chk CHECK(period_end>=period_start),
  CONSTRAINT enterprise_budgets_amount_chk CHECK(amount>=0),
  CONSTRAINT enterprise_budgets_status_chk CHECK(status IN ('active','inactive')),
  CONSTRAINT enterprise_budgets_scope_uq UNIQUE(cost_center_id,period_start,period_end)
);
CREATE INDEX idx_enterprise_budgets_enterprise ON public.enterprise_budgets(enterprise_id,period_start,period_end,status);

CREATE TABLE public.enterprise_purchase_orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.enterprise_cost_centers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  site_id uuid REFERENCES public.enterprise_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  reference text NOT NULL,
  approved_amount numeric(14,2),
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_purchase_orders_ref_chk CHECK(char_length(btrim(reference)) BETWEEN 1 AND 120),
  CONSTRAINT enterprise_purchase_orders_amount_chk CHECK(approved_amount IS NULL OR approved_amount>=0),
  CONSTRAINT enterprise_purchase_orders_status_chk CHECK(status IN ('open','closed','cancelled')),
  CONSTRAINT enterprise_purchase_orders_notes_chk CHECK(notes IS NULL OR char_length(btrim(notes))<=2000)
);
CREATE UNIQUE INDEX enterprise_purchase_orders_ref_uq ON public.enterprise_purchase_orders(enterprise_id,lower(btrim(reference)));
CREATE INDEX idx_enterprise_purchase_orders_scope ON public.enterprise_purchase_orders(enterprise_id,site_id,status);

CREATE TABLE public.enterprise_worker_cost_rates(
  worker_id uuid PRIMARY KEY REFERENCES public.enterprise_workforce_workers(id) ON UPDATE CASCADE ON DELETE CASCADE,
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  hourly_cost numeric(12,2) NOT NULL,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_worker_cost_rates_amount_chk CHECK(hourly_cost>=0)
);
CREATE INDEX idx_enterprise_worker_cost_rates_enterprise ON public.enterprise_worker_cost_rates(enterprise_id);

CREATE TABLE public.enterprise_request_finance_context(
  service_request_id uuid PRIMARY KEY REFERENCES public.service_requests(id) ON UPDATE CASCADE ON DELETE CASCADE,
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.enterprise_cost_centers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.enterprise_purchase_orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_enterprise_request_finance_context_enterprise ON public.enterprise_request_finance_context(enterprise_id,cost_center_id,purchase_order_id);

-- 3) Finance access helpers.
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_finance_reader(p_enterprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
SELECT EXISTS(
  SELECT 1 FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id AND em.user_id=auth.uid() AND em.status='active'
    AND em.role IN ('owner','admin','operations_manager','reporter','site_manager')
);
$function$;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_finance_global_reader(p_enterprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
SELECT EXISTS(
  SELECT 1 FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id AND em.user_id=auth.uid() AND em.status='active'
    AND em.role IN ('owner','admin','operations_manager','reporter')
);
$function$;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_finance_manager(p_enterprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
SELECT EXISTS(
  SELECT 1 FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id AND em.user_id=auth.uid() AND em.status='active'
    AND em.role IN ('owner','admin')
);
$function$;

REVOKE ALL ON FUNCTION fixeo_private._fixeo_is_enterprise_finance_reader(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_is_enterprise_finance_global_reader(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_is_enterprise_finance_manager(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_finance_reader(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_finance_global_reader(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_finance_manager(uuid) TO authenticated,service_role;

-- 4) RLS + SELECT-only browser tables.
ALTER TABLE public.enterprise_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_worker_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_request_finance_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecc_finance_select ON public.enterprise_cost_centers FOR SELECT TO authenticated
USING(
  fixeo_private._fixeo_is_enterprise_finance_reader(enterprise_id)
  AND (
    (site_id IS NULL AND fixeo_private._fixeo_is_enterprise_finance_global_reader(enterprise_id))
    OR (site_id IS NOT NULL AND fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id))
  )
);
CREATE POLICY eb_finance_select ON public.enterprise_budgets FOR SELECT TO authenticated
USING(
  fixeo_private._fixeo_is_enterprise_finance_reader(enterprise_id)
  AND EXISTS(
    SELECT 1 FROM public.enterprise_cost_centers c
    WHERE c.id=enterprise_budgets.cost_center_id
      AND (
      (c.site_id IS NULL AND fixeo_private._fixeo_is_enterprise_finance_global_reader(c.enterprise_id))
      OR (c.site_id IS NOT NULL AND fixeo_private._fixeo_can_access_enterprise_site(c.enterprise_id,c.site_id))
    )
  )
);
CREATE POLICY epo_finance_select ON public.enterprise_purchase_orders FOR SELECT TO authenticated
USING(
  fixeo_private._fixeo_is_enterprise_finance_reader(enterprise_id)
  AND (
    (site_id IS NULL AND fixeo_private._fixeo_is_enterprise_finance_global_reader(enterprise_id))
    OR (site_id IS NOT NULL AND fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id))
  )
);
CREATE POLICY ewcr_finance_select ON public.enterprise_worker_cost_rates FOR SELECT TO authenticated
USING(fixeo_private._fixeo_is_enterprise_finance_manager(enterprise_id));
CREATE POLICY erfc_finance_select ON public.enterprise_request_finance_context FOR SELECT TO authenticated
USING(
  fixeo_private._fixeo_is_enterprise_finance_reader(enterprise_id)
  AND EXISTS(
    SELECT 1 FROM public.enterprise_request_context erc
    WHERE erc.service_request_id=enterprise_request_finance_context.service_request_id
      AND erc.enterprise_id=enterprise_request_finance_context.enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
  )
);

REVOKE ALL ON TABLE public.enterprise_cost_centers,public.enterprise_budgets,public.enterprise_purchase_orders,
  public.enterprise_worker_cost_rates,public.enterprise_request_finance_context
FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.enterprise_cost_centers,public.enterprise_budgets,public.enterprise_purchase_orders,
  public.enterprise_worker_cost_rates,public.enterprise_request_finance_context
TO authenticated;

-- 5) Cost center management.
CREATE OR REPLACE FUNCTION public.upsert_enterprise_cost_center_v1(
  p_enterprise_id uuid,p_cost_center_id uuid,p_site_id uuid,p_code text,p_name text,p_department text,p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_id uuid; v_before jsonb; v_event text; v_code text:=lower(btrim(p_code)); v_name text:=btrim(p_name);
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_finance_manager(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF p_site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_sites s WHERE s.id=p_site_id AND s.enterprise_id=p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','site_not_found'); END IF;
  IF v_code IS NULL OR char_length(v_code) NOT BETWEEN 1 AND 80 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_code'); END IF;
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_name'); END IF;
  IF p_status NOT IN ('active','inactive') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
  IF p_cost_center_id IS NULL THEN
    INSERT INTO public.enterprise_cost_centers(enterprise_id,site_id,code,name,department,status,created_by,updated_by)
    VALUES(p_enterprise_id,p_site_id,v_code,v_name,NULLIF(btrim(p_department),''),p_status,auth.uid(),auth.uid())
    RETURNING id INTO v_id; v_event:='finance.cost_center_created';
  ELSE
    SELECT to_jsonb(c) INTO v_before FROM public.enterprise_cost_centers c WHERE c.id=p_cost_center_id AND c.enterprise_id=p_enterprise_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','cost_center_not_found'); END IF;
    UPDATE public.enterprise_cost_centers SET site_id=p_site_id,code=v_code,name=v_name,department=NULLIF(btrim(p_department),''),
      status=p_status,updated_by=auth.uid(),updated_at=now() WHERE id=p_cost_center_id RETURNING id INTO v_id;
    v_event:='finance.cost_center_updated';
  END IF;
  PERFORM fixeo_private._write_enterprise_audit_event(p_enterprise_id,v_event,'enterprise_cost_center',v_id,v_before,
    jsonb_build_object('site_id',p_site_id,'code',v_code,'department',NULLIF(btrim(p_department),''),'status',p_status),
    jsonb_build_object('name',v_name));
  RETURN jsonb_build_object('ok',true,'cost_center_id',v_id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'reason','code_exists');
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_enterprise_budget_v1(
  p_enterprise_id uuid,p_budget_id uuid,p_cost_center_id uuid,p_period_start date,p_period_end date,p_amount numeric,p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_id uuid; v_before jsonb; v_event text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_finance_manager(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.enterprise_cost_centers c WHERE c.id=p_cost_center_id AND c.enterprise_id=p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','cost_center_not_found'); END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end<p_period_start THEN RETURN jsonb_build_object('ok',false,'reason','invalid_period'); END IF;
  IF p_amount IS NULL OR p_amount<0 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_amount'); END IF;
  IF p_status NOT IN ('active','inactive') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
  IF p_budget_id IS NULL THEN
    INSERT INTO public.enterprise_budgets(enterprise_id,cost_center_id,period_start,period_end,amount,status,created_by,updated_by)
    VALUES(p_enterprise_id,p_cost_center_id,p_period_start,p_period_end,p_amount,p_status,auth.uid(),auth.uid()) RETURNING id INTO v_id;
    v_event:='finance.budget_created';
  ELSE
    SELECT to_jsonb(b) INTO v_before FROM public.enterprise_budgets b WHERE b.id=p_budget_id AND b.enterprise_id=p_enterprise_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','budget_not_found'); END IF;
    UPDATE public.enterprise_budgets SET cost_center_id=p_cost_center_id,period_start=p_period_start,period_end=p_period_end,
      amount=p_amount,status=p_status,updated_by=auth.uid(),updated_at=now() WHERE id=p_budget_id RETURNING id INTO v_id;
    v_event:='finance.budget_updated';
  END IF;
  PERFORM fixeo_private._write_enterprise_audit_event(p_enterprise_id,v_event,'enterprise_budget',v_id,v_before,
    jsonb_build_object('cost_center_id',p_cost_center_id,'period_start',p_period_start,'period_end',p_period_end,'amount',p_amount,'status',p_status),'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'budget_id',v_id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'reason','budget_exists');
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_enterprise_purchase_order_v1(
  p_enterprise_id uuid,p_purchase_order_id uuid,p_cost_center_id uuid,p_site_id uuid,p_reference text,
  p_approved_amount numeric,p_status text,p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_id uuid; v_before jsonb; v_event text; v_ref text:=btrim(p_reference);
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_finance_manager(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF p_cost_center_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_cost_centers c WHERE c.id=p_cost_center_id AND c.enterprise_id=p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','cost_center_not_found'); END IF;
  IF p_site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_sites s WHERE s.id=p_site_id AND s.enterprise_id=p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','site_not_found'); END IF;
  IF v_ref IS NULL OR char_length(v_ref) NOT BETWEEN 1 AND 120 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_reference'); END IF;
  IF p_approved_amount IS NOT NULL AND p_approved_amount<0 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_amount'); END IF;
  IF p_status NOT IN ('open','closed','cancelled') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
  IF p_purchase_order_id IS NULL THEN
    INSERT INTO public.enterprise_purchase_orders(enterprise_id,cost_center_id,site_id,reference,approved_amount,status,notes,created_by,updated_by)
    VALUES(p_enterprise_id,p_cost_center_id,p_site_id,v_ref,p_approved_amount,p_status,NULLIF(btrim(p_notes),''),auth.uid(),auth.uid()) RETURNING id INTO v_id;
    v_event:='finance.po_created';
  ELSE
    SELECT to_jsonb(po) INTO v_before FROM public.enterprise_purchase_orders po WHERE po.id=p_purchase_order_id AND po.enterprise_id=p_enterprise_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','po_not_found'); END IF;
    UPDATE public.enterprise_purchase_orders SET cost_center_id=p_cost_center_id,site_id=p_site_id,reference=v_ref,
      approved_amount=p_approved_amount,status=p_status,notes=NULLIF(btrim(p_notes),''),updated_by=auth.uid(),updated_at=now()
    WHERE id=p_purchase_order_id RETURNING id INTO v_id; v_event:='finance.po_updated';
  END IF;
  PERFORM fixeo_private._write_enterprise_audit_event(p_enterprise_id,v_event,'enterprise_purchase_order',v_id,v_before,
    jsonb_build_object('cost_center_id',p_cost_center_id,'site_id',p_site_id,'reference',v_ref,'approved_amount',p_approved_amount,'status',p_status),'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'purchase_order_id',v_id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'reason','reference_exists');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_enterprise_worker_cost_rate_v1(
  p_enterprise_id uuid,p_worker_id uuid,p_hourly_cost numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_finance_manager(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.enterprise_workforce_workers w WHERE w.id=p_worker_id AND w.enterprise_id=p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','worker_not_found'); END IF;
  IF p_hourly_cost IS NULL OR p_hourly_cost<0 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_amount'); END IF;
  INSERT INTO public.enterprise_worker_cost_rates(worker_id,enterprise_id,hourly_cost,updated_by,updated_at)
  VALUES(p_worker_id,p_enterprise_id,p_hourly_cost,auth.uid(),now())
  ON CONFLICT(worker_id) DO UPDATE SET hourly_cost=excluded.hourly_cost,updated_by=auth.uid(),updated_at=now();
  PERFORM fixeo_private._write_enterprise_audit_event(p_enterprise_id,'finance.worker_rate_updated','enterprise_workforce_worker',p_worker_id,NULL,
    jsonb_build_object('hourly_cost',p_hourly_cost),'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'worker_id',p_worker_id,'hourly_cost',p_hourly_cost);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_enterprise_request_finance_context_v1(
  p_enterprise_id uuid,p_request_id uuid,p_cost_center_id uuid,p_purchase_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_site_id uuid; v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_dispatch_operator(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  SELECT erc.site_id INTO v_site_id FROM public.enterprise_request_context erc WHERE erc.enterprise_id=p_enterprise_id AND erc.service_request_id=p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','request_not_found'); END IF;
  IF NOT fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,v_site_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF p_cost_center_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.enterprise_cost_centers c WHERE c.id=p_cost_center_id AND c.enterprise_id=p_enterprise_id AND c.status='active'
      AND (c.site_id IS NULL OR c.site_id=v_site_id)
  ) THEN RETURN jsonb_build_object('ok',false,'reason','cost_center_not_available'); END IF;
  IF p_purchase_order_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.enterprise_purchase_orders po WHERE po.id=p_purchase_order_id AND po.enterprise_id=p_enterprise_id AND po.status='open'
      AND (po.site_id IS NULL OR po.site_id=v_site_id)
  ) THEN RETURN jsonb_build_object('ok',false,'reason','po_not_available'); END IF;
  SELECT to_jsonb(x) INTO v_before FROM public.enterprise_request_finance_context x WHERE x.service_request_id=p_request_id;
  INSERT INTO public.enterprise_request_finance_context(service_request_id,enterprise_id,cost_center_id,purchase_order_id,updated_by,updated_at)
  VALUES(p_request_id,p_enterprise_id,p_cost_center_id,p_purchase_order_id,auth.uid(),now())
  ON CONFLICT(service_request_id) DO UPDATE SET cost_center_id=excluded.cost_center_id,purchase_order_id=excluded.purchase_order_id,updated_by=auth.uid(),updated_at=now();
  PERFORM fixeo_private._write_enterprise_audit_event(p_enterprise_id,'finance.request_context_updated','enterprise_request_finance_context',p_request_id,
    v_before,jsonb_build_object('cost_center_id',p_cost_center_id,'purchase_order_id',p_purchase_order_id,'site_id',v_site_id),'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'request_id',p_request_id);
END;
$function$;

-- 6) Consolidated finance read model.
CREATE OR REPLACE FUNCTION public.get_enterprise_finance_v1(
  p_enterprise_id uuid,p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_limit integer DEFAULT 500
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_rows jsonb; v_cost_centers jsonb; v_budgets jsonb; v_pos jsonb; v_rates jsonb; v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_finance_reader(p_enterprise_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_limit<1 OR p_limit>2000 THEN RAISE EXCEPTION 'invalid_limit'; END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to<p_from THEN RAISE EXCEPTION 'invalid_period'; END IF;

  WITH request_finance AS MATERIALIZED(
    SELECT
      sr.id request_id,erc.site_id,s.name site_name,s.city,sr.service_category,sr.status request_status,sr.created_at,
      fc.cost_center_id,cc.code cost_center_code,cc.name cost_center_name,cc.department,
      fc.purchase_order_id,po.reference purchase_order_reference,po.approved_amount purchase_order_approved_amount,
      COALESCE((
        SELECT sum(COALESCE(m.final_price,m.agreed_price,0))
        FROM public.missions m
        WHERE m.request_id=sr.id::text AND m.status IN ('done','validated')
      ),0)::numeric(14,2) external_cost,
      COALESCE((
        SELECT sum(COALESCE(m.commission_amount,0))
        FROM public.missions m
        WHERE m.request_id=sr.id::text AND m.status IN ('done','validated')
      ),0)::numeric(14,2) fixeo_commission,
      COALESCE((
        SELECT round(sum(
          CASE
            WHEN ia.started_at IS NULL OR rate.hourly_cost IS NULL THEN 0
            ELSE GREATEST(EXTRACT(EPOCH FROM (
              CASE WHEN ia.completed_at IS NOT NULL THEN ia.completed_at
                   WHEN ia.status='in_progress' THEN now()
                   ELSE ia.started_at END
              - ia.started_at
            ))/3600.0,0) * rate.hourly_cost
          END
        )::numeric,2)
        FROM public.enterprise_internal_assignments ia
        LEFT JOIN public.enterprise_worker_cost_rates rate ON rate.worker_id=ia.worker_id
        WHERE ia.service_request_id=sr.id AND ia.enterprise_id=p_enterprise_id
          AND ia.status IN ('assigned','in_progress','completed','validated')
      ),0)::numeric(14,2) internal_cost
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id=erc.service_request_id
    JOIN public.enterprise_sites s ON s.id=erc.site_id
    LEFT JOIN public.enterprise_request_finance_context fc ON fc.service_request_id=sr.id
    LEFT JOIN public.enterprise_cost_centers cc ON cc.id=fc.cost_center_id
    LEFT JOIN public.enterprise_purchase_orders po ON po.id=fc.purchase_order_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
      AND (p_from IS NULL OR sr.created_at::date>=p_from)
      AND (p_to IS NULL OR sr.created_at::date<=p_to)
  ),
  limited AS(
    SELECT *, (external_cost+internal_cost)::numeric(14,2) total_operational_cost
    FROM request_finance ORDER BY created_at DESC LIMIT p_limit
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC),'[]'::jsonb) INTO v_rows FROM limited l;

  WITH request_finance AS(
    SELECT sr.id,erc.site_id,sr.created_at,fc.cost_center_id,
      COALESCE((SELECT sum(COALESCE(m.final_price,m.agreed_price,0)) FROM public.missions m WHERE m.request_id=sr.id::text AND m.status IN ('done','validated')),0) external_cost,
      COALESCE((SELECT sum(COALESCE(m.commission_amount,0)) FROM public.missions m WHERE m.request_id=sr.id::text AND m.status IN ('done','validated')),0) fixeo_commission,
      COALESCE((SELECT sum(CASE WHEN ia.started_at IS NULL OR rate.hourly_cost IS NULL THEN 0 ELSE GREATEST(EXTRACT(EPOCH FROM ((CASE WHEN ia.completed_at IS NOT NULL THEN ia.completed_at WHEN ia.status='in_progress' THEN now() ELSE ia.started_at END)-ia.started_at))/3600.0,0)*rate.hourly_cost END)
        FROM public.enterprise_internal_assignments ia LEFT JOIN public.enterprise_worker_cost_rates rate ON rate.worker_id=ia.worker_id
        WHERE ia.service_request_id=sr.id AND ia.enterprise_id=p_enterprise_id AND ia.status IN ('assigned','in_progress','completed','validated')),0) internal_cost
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id=erc.service_request_id
    LEFT JOIN public.enterprise_request_finance_context fc ON fc.service_request_id=sr.id
    WHERE erc.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
      AND (p_from IS NULL OR sr.created_at::date>=p_from)
      AND (p_to IS NULL OR sr.created_at::date<=p_to)
  )
  SELECT jsonb_build_object(
    'external_cost',round(COALESCE(sum(external_cost),0)::numeric,2),
    'internal_cost',round(COALESCE(sum(internal_cost),0)::numeric,2),
    'operational_cost',round(COALESCE(sum(external_cost+internal_cost),0)::numeric,2),
    'fixeo_commission',round(COALESCE(sum(fixeo_commission),0)::numeric,2),
    'requests',count(*)::int,
    'requests_with_cost_center',count(*) FILTER(WHERE cost_center_id IS NOT NULL)::int
  ) INTO v_summary FROM request_finance;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'site_id',c.site_id,'code',c.code,'name',c.name,'department',c.department,'status',c.status) ORDER BY c.code),'[]'::jsonb)
  INTO v_cost_centers FROM public.enterprise_cost_centers c
  WHERE c.enterprise_id=p_enterprise_id AND (
      (c.site_id IS NULL AND fixeo_private._fixeo_is_enterprise_finance_global_reader(c.enterprise_id))
      OR (c.site_id IS NOT NULL AND fixeo_private._fixeo_can_access_enterprise_site(c.enterprise_id,c.site_id))
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',b.id,'cost_center_id',b.cost_center_id,'period_start',b.period_start,'period_end',b.period_end,'amount',b.amount,'status',b.status,
    'spent',COALESCE((
      SELECT round(sum(x.total_cost)::numeric,2) FROM (
        SELECT sr.id,(COALESCE((SELECT sum(COALESCE(m.final_price,m.agreed_price,0)) FROM public.missions m WHERE m.request_id=sr.id::text AND m.status IN ('done','validated')),0)
          +COALESCE((SELECT sum(CASE WHEN ia.started_at IS NULL OR rate.hourly_cost IS NULL THEN 0 ELSE GREATEST(EXTRACT(EPOCH FROM ((CASE WHEN ia.completed_at IS NOT NULL THEN ia.completed_at WHEN ia.status='in_progress' THEN now() ELSE ia.started_at END)-ia.started_at))/3600.0,0)*rate.hourly_cost END)
            FROM public.enterprise_internal_assignments ia LEFT JOIN public.enterprise_worker_cost_rates rate ON rate.worker_id=ia.worker_id
            WHERE ia.service_request_id=sr.id AND ia.enterprise_id=p_enterprise_id AND ia.status IN ('assigned','in_progress','completed','validated')),0)
        ) total_cost
        FROM public.enterprise_request_context erc
        JOIN public.service_requests sr ON sr.id=erc.service_request_id
        JOIN public.enterprise_request_finance_context fc ON fc.service_request_id=sr.id
        WHERE erc.enterprise_id=p_enterprise_id AND fc.cost_center_id=b.cost_center_id
          AND sr.created_at::date BETWEEN b.period_start AND b.period_end
          AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
      ) x
    ),0)
  ) ORDER BY b.period_start DESC),'[]'::jsonb)
  INTO v_budgets
  FROM public.enterprise_budgets b
  JOIN public.enterprise_cost_centers c ON c.id=b.cost_center_id
  WHERE b.enterprise_id=p_enterprise_id AND (
      (c.site_id IS NULL AND fixeo_private._fixeo_is_enterprise_finance_global_reader(c.enterprise_id))
      OR (c.site_id IS NOT NULL AND fixeo_private._fixeo_can_access_enterprise_site(c.enterprise_id,c.site_id))
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',po.id,'cost_center_id',po.cost_center_id,'site_id',po.site_id,'reference',po.reference,
    'approved_amount',po.approved_amount,'status',po.status,'notes',po.notes) ORDER BY po.created_at DESC),'[]'::jsonb)
  INTO v_pos FROM public.enterprise_purchase_orders po
  WHERE po.enterprise_id=p_enterprise_id AND (
    (po.site_id IS NULL AND fixeo_private._fixeo_is_enterprise_finance_global_reader(po.enterprise_id))
    OR (po.site_id IS NOT NULL AND fixeo_private._fixeo_can_access_enterprise_site(po.enterprise_id,po.site_id))
  );

  IF fixeo_private._fixeo_is_enterprise_finance_manager(p_enterprise_id) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('worker_id',r.worker_id,'display_label',w.display_label,'hourly_cost',r.hourly_cost) ORDER BY w.display_label),'[]'::jsonb)
    INTO v_rates FROM public.enterprise_worker_cost_rates r JOIN public.enterprise_workforce_workers w ON w.id=r.worker_id WHERE r.enterprise_id=p_enterprise_id;
  ELSE
    v_rates:='[]'::jsonb;
  END IF;

  RETURN jsonb_build_object('ok',true,'summary',v_summary,'rows',v_rows,'cost_centers',v_cost_centers,'budgets',v_budgets,'purchase_orders',v_pos,'worker_rates',v_rates);
END;
$function$;

-- 7) Grants.
ALTER FUNCTION public.upsert_enterprise_cost_center_v1(uuid,uuid,uuid,text,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.upsert_enterprise_budget_v1(uuid,uuid,uuid,date,date,numeric,text) OWNER TO postgres;
ALTER FUNCTION public.upsert_enterprise_purchase_order_v1(uuid,uuid,uuid,uuid,text,numeric,text,text) OWNER TO postgres;
ALTER FUNCTION public.set_enterprise_worker_cost_rate_v1(uuid,uuid,numeric) OWNER TO postgres;
ALTER FUNCTION public.set_enterprise_request_finance_context_v1(uuid,uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_finance_v1(uuid,date,date,integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_enterprise_cost_center_v1(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.upsert_enterprise_budget_v1(uuid,uuid,uuid,date,date,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.upsert_enterprise_purchase_order_v1(uuid,uuid,uuid,uuid,text,numeric,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_enterprise_worker_cost_rate_v1(uuid,uuid,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_enterprise_request_finance_context_v1(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_finance_v1(uuid,date,date,integer) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.upsert_enterprise_cost_center_v1(uuid,uuid,uuid,text,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.upsert_enterprise_budget_v1(uuid,uuid,uuid,date,date,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.upsert_enterprise_purchase_order_v1(uuid,uuid,uuid,uuid,text,numeric,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_enterprise_worker_cost_rate_v1(uuid,uuid,numeric) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_enterprise_request_finance_context_v1(uuid,uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_finance_v1(uuid,date,date,integer) TO authenticated,service_role;

COMMIT;
