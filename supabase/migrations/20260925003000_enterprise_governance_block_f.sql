-- FIXEO ENTERPRISE — BLOCK F / Governance & Approvals
BEGIN;

-- 1) Audit vocabulary.
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
'finance.po_created'::text,'finance.po_updated'::text,'finance.worker_rate_updated'::text,'finance.request_context_updated'::text,
'governance.policy_created'::text,'governance.policy_updated'::text,'governance.case_created'::text,
'governance.case_approved'::text,'governance.case_rejected'::text
]));

ALTER TABLE public.enterprise_audit_events DROP CONSTRAINT enterprise_audit_events_target_type_chk;
ALTER TABLE public.enterprise_audit_events ADD CONSTRAINT enterprise_audit_events_target_type_chk
CHECK (target_type = ANY (ARRAY[
'enterprise_member'::text,'enterprise_site'::text,'service_request'::text,'enterprise_account'::text,'enterprise_invitation'::text,
'enterprise_member_site'::text,'enterprise_workforce_worker'::text,'enterprise_dispatch_policy'::text,'enterprise_internal_assignment'::text,
'enterprise_control_tower_escalation'::text,'enterprise_maintenance_plan'::text,'enterprise_equipment'::text,'enterprise_equipment_asset'::text,
'enterprise_cost_center'::text,'enterprise_budget'::text,'enterprise_purchase_order'::text,'enterprise_request_finance_context'::text,
'enterprise_approval_policy'::text,'enterprise_approval_case'::text
]));

-- 2) Policy and runtime tables.
CREATE TABLE public.enterprise_approval_policies(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name text NOT NULL,
  site_id uuid REFERENCES public.enterprise_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  service_category text,
  urgency text,
  requester_role text,
  min_amount numeric(14,2),
  max_amount numeric(14,2),
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_approval_policies_name_chk CHECK(char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT enterprise_approval_policies_urgency_chk CHECK(urgency IS NULL OR urgency IN ('normale','urgent','now')),
  CONSTRAINT enterprise_approval_policies_requester_role_chk CHECK(requester_role IS NULL OR requester_role IN ('owner','admin','operations_manager','site_manager','reporter')),
  CONSTRAINT enterprise_approval_policies_amount_chk CHECK(
    (min_amount IS NULL OR min_amount>=0) AND (max_amount IS NULL OR max_amount>=0)
    AND (min_amount IS NULL OR max_amount IS NULL OR max_amount>=min_amount)
  ),
  CONSTRAINT enterprise_approval_policies_priority_chk CHECK(priority BETWEEN 1 AND 10000),
  CONSTRAINT enterprise_approval_policies_status_chk CHECK(status IN ('active','inactive'))
);
CREATE INDEX idx_enterprise_approval_policies_match
ON public.enterprise_approval_policies(enterprise_id,status,site_id,priority);

CREATE TABLE public.enterprise_approval_policy_steps(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.enterprise_approval_policies(id) ON UPDATE CASCADE ON DELETE CASCADE,
  step_order integer NOT NULL,
  approver_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_approval_policy_steps_order_chk CHECK(step_order BETWEEN 1 AND 10),
  CONSTRAINT enterprise_approval_policy_steps_role_chk CHECK(approver_role IN ('owner','admin','operations_manager','site_manager')),
  CONSTRAINT enterprise_approval_policy_steps_uq UNIQUE(policy_id,step_order)
);

CREATE TABLE public.enterprise_approval_cases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.enterprise_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES public.enterprise_approval_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  requester_role text NOT NULL,
  service_category text NOT NULL,
  description text NOT NULL,
  urgency text,
  requested_amount numeric(14,2),
  current_step integer NOT NULL DEFAULT 1,
  total_steps integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  service_request_id uuid UNIQUE REFERENCES public.service_requests(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT enterprise_approval_cases_role_chk CHECK(requester_role IN ('owner','admin','operations_manager','site_manager','reporter')),
  CONSTRAINT enterprise_approval_cases_urgency_chk CHECK(urgency IS NULL OR urgency IN ('normale','urgent','now')),
  CONSTRAINT enterprise_approval_cases_amount_chk CHECK(requested_amount IS NULL OR requested_amount>=0),
  CONSTRAINT enterprise_approval_cases_steps_chk CHECK(total_steps BETWEEN 1 AND 10 AND current_step BETWEEN 1 AND total_steps),
  CONSTRAINT enterprise_approval_cases_status_chk CHECK(status IN ('pending','approved','rejected'))
);
CREATE INDEX idx_enterprise_approval_cases_pending
ON public.enterprise_approval_cases(enterprise_id,status,site_id,current_step,created_at);

CREATE TABLE public.enterprise_approval_decisions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.enterprise_approval_cases(id) ON UPDATE CASCADE ON DELETE CASCADE,
  step_order integer NOT NULL,
  approver_member_id uuid NOT NULL REFERENCES public.enterprise_members(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  approver_role text NOT NULL,
  decision text NOT NULL,
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_approval_decisions_role_chk CHECK(approver_role IN ('owner','admin','operations_manager','site_manager')),
  CONSTRAINT enterprise_approval_decisions_value_chk CHECK(decision IN ('approved','rejected')),
  CONSTRAINT enterprise_approval_decisions_note_chk CHECK(note IS NULL OR char_length(btrim(note))<=1000),
  CONSTRAINT enterprise_approval_decisions_uq UNIQUE(case_id,step_order)
);

-- 3) RLS: read visible policy/cases; no direct browser mutations.
ALTER TABLE public.enterprise_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_approval_policy_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_approval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_approval_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY eap_managers_select ON public.enterprise_approval_policies
FOR SELECT TO authenticated
USING(fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

CREATE POLICY eaps_managers_select ON public.enterprise_approval_policy_steps
FOR SELECT TO authenticated
USING(fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

CREATE POLICY eac_members_select ON public.enterprise_approval_cases
FOR SELECT TO authenticated
USING(
  fixeo_private._fixeo_is_enterprise_member(enterprise_id)
  AND fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id)
);

CREATE POLICY ead_members_select ON public.enterprise_approval_decisions
FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM public.enterprise_approval_cases c
    WHERE c.id=enterprise_approval_decisions.case_id
      AND c.enterprise_id=enterprise_approval_decisions.enterprise_id
      AND fixeo_private._fixeo_is_enterprise_member(c.enterprise_id)
      AND fixeo_private._fixeo_can_access_enterprise_site(c.enterprise_id,c.site_id)
  )
);

REVOKE ALL ON TABLE public.enterprise_approval_policies,public.enterprise_approval_policy_steps,
  public.enterprise_approval_cases,public.enterprise_approval_decisions
FROM PUBLIC,anon,authenticated;

GRANT SELECT ON TABLE public.enterprise_approval_policies,public.enterprise_approval_policy_steps,
  public.enterprise_approval_cases,public.enterprise_approval_decisions
TO authenticated;

-- 4) Policy management (owner/admin only), steps replaced atomically.
CREATE OR REPLACE FUNCTION public.upsert_enterprise_approval_policy_v1(
  p_enterprise_id uuid,p_policy_id uuid,p_name text,p_site_id uuid,p_service_category text,
  p_urgency text,p_requester_role text,p_min_amount numeric,p_max_amount numeric,
  p_priority integer,p_status text,p_steps jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_id uuid; v_before jsonb; v_event text; v_item jsonb; v_order integer:=0;
  v_role text; v_count integer:=0; v_category text:=NULLIF(lower(btrim(p_service_category)),'');
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF p_site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_sites s WHERE s.id=p_site_id AND s.enterprise_id=p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','site_not_found'); END IF;
  IF btrim(p_name) IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_name'); END IF;
  IF p_urgency IS NOT NULL AND p_urgency NOT IN ('normale','urgent','now') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_urgency'); END IF;
  IF p_requester_role IS NOT NULL AND p_requester_role NOT IN ('owner','admin','operations_manager','site_manager','reporter') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_requester_role'); END IF;
  IF p_min_amount IS NOT NULL AND p_min_amount<0 OR p_max_amount IS NOT NULL AND p_max_amount<0 OR p_min_amount IS NOT NULL AND p_max_amount IS NOT NULL AND p_max_amount<p_min_amount THEN RETURN jsonb_build_object('ok',false,'reason','invalid_amount_range'); END IF;
  IF p_priority IS NULL OR p_priority NOT BETWEEN 1 AND 10000 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_priority'); END IF;
  IF p_status NOT IN ('active','inactive') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps)<>'array' OR jsonb_array_length(p_steps)<1 OR jsonb_array_length(p_steps)>10 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_steps'); END IF;

  v_count:=0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_steps)
  LOOP
    v_count:=v_count+1;
    BEGIN
      v_order:=COALESCE((v_item->>'step_order')::integer,v_count);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_step_order');
    END;
    v_role:=v_item->>'approver_role';
    IF v_order<>v_count OR v_role NOT IN ('owner','admin','operations_manager','site_manager') THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_step');
    END IF;
  END LOOP;

  IF p_policy_id IS NULL THEN
    INSERT INTO public.enterprise_approval_policies(
      enterprise_id,name,site_id,service_category,urgency,requester_role,min_amount,max_amount,priority,status,created_by,updated_by
    ) VALUES(
      p_enterprise_id,btrim(p_name),p_site_id,v_category,p_urgency,p_requester_role,p_min_amount,p_max_amount,p_priority,p_status,auth.uid(),auth.uid()
    ) RETURNING id INTO v_id;
    v_event:='governance.policy_created';
  ELSE
    SELECT to_jsonb(p) INTO v_before FROM public.enterprise_approval_policies p
    WHERE p.id=p_policy_id AND p.enterprise_id=p_enterprise_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','policy_not_found'); END IF;
    UPDATE public.enterprise_approval_policies SET
      name=btrim(p_name),site_id=p_site_id,service_category=v_category,urgency=p_urgency,requester_role=p_requester_role,
      min_amount=p_min_amount,max_amount=p_max_amount,priority=p_priority,status=p_status,updated_by=auth.uid(),updated_at=now()
    WHERE id=p_policy_id RETURNING id INTO v_id;
    DELETE FROM public.enterprise_approval_policy_steps WHERE policy_id=v_id;
    v_event:='governance.policy_updated';
  END IF;

  v_count:=0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_steps)
  LOOP
    v_count:=v_count+1;
    v_order:=v_count;
    v_role:=v_item->>'approver_role';
    INSERT INTO public.enterprise_approval_policy_steps(enterprise_id,policy_id,step_order,approver_role)
    VALUES(p_enterprise_id,v_id,v_order,v_role);
  END LOOP;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,v_event,'enterprise_approval_policy',v_id,v_before,
    jsonb_build_object('site_id',p_site_id,'service_category',v_category,'urgency',p_urgency,'requester_role',p_requester_role,
      'min_amount',p_min_amount,'max_amount',p_max_amount,'priority',p_priority,'status',p_status,'step_count',v_count),
    jsonb_build_object('name',btrim(p_name))
  );
  RETURN jsonb_build_object('ok',true,'policy_id',v_id,'step_count',v_count);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok',false,'reason','duplicate_step');
WHEN OTHERS THEN
  RAISE WARNING '[upsert_enterprise_approval_policy_v1] % %',SQLSTATE,SQLERRM;
  RETURN jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

-- 5) Governed intake: match best policy; otherwise preserve immediate hybrid flow.
CREATE OR REPLACE FUNCTION public.submit_enterprise_governed_request_v1(
  p_enterprise_id uuid,p_site_id uuid,p_service_category text,p_description text,
  p_urgency text DEFAULT NULL,p_requested_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_member_id uuid; v_role text; v_policy_id uuid; v_total_steps integer; v_case_id uuid; v_created jsonb;
  v_category text:=lower(btrim(p_service_category));
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  SELECT em.id,em.role INTO v_member_id,v_role
  FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id AND em.user_id=auth.uid() AND em.status='active'
    AND em.role IN ('owner','admin','operations_manager','site_manager','reporter');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.enterprise_sites s WHERE s.id=p_site_id AND s.enterprise_id=p_enterprise_id AND s.status='active') THEN RETURN jsonb_build_object('ok',false,'reason','site_not_available'); END IF;
  IF NOT fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,p_site_id) THEN RETURN jsonb_build_object('ok',false,'reason','site_forbidden'); END IF;
  IF v_category IS NULL OR char_length(v_category)<1 OR btrim(p_description) IS NULL OR char_length(btrim(p_description))<1 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_input'); END IF;
  IF p_urgency IS NOT NULL AND p_urgency NOT IN ('normale','urgent','now') THEN RETURN jsonb_build_object('ok',false,'reason','urgency_invalid'); END IF;
  IF p_requested_amount IS NOT NULL AND p_requested_amount<0 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_amount'); END IF;

  SELECT p.id INTO v_policy_id
  FROM public.enterprise_approval_policies p
  WHERE p.enterprise_id=p_enterprise_id AND p.status='active'
    AND (p.site_id=p_site_id OR p.site_id IS NULL)
    AND (p.service_category IS NULL OR lower(btrim(p.service_category))=v_category)
    AND (p.urgency IS NULL OR p.urgency IS NOT DISTINCT FROM p_urgency)
    AND (p.requester_role IS NULL OR p.requester_role=v_role)
    AND (p.min_amount IS NULL OR (p_requested_amount IS NOT NULL AND p_requested_amount>=p.min_amount))
    AND (p.max_amount IS NULL OR (p_requested_amount IS NOT NULL AND p_requested_amount<=p.max_amount))
  ORDER BY
    CASE WHEN p.site_id=p_site_id THEN 0 ELSE 1 END,
    CASE WHEN p.service_category IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN p.urgency IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN p.requester_role IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN p.min_amount IS NOT NULL OR p.max_amount IS NOT NULL THEN 0 ELSE 1 END,
    p.priority ASC,p.created_at ASC
  LIMIT 1 FOR SHARE;

  IF v_policy_id IS NULL THEN
    v_created:=public.create_enterprise_request_hybrid(p_enterprise_id,p_site_id,v_category,btrim(p_description),p_urgency);
    RETURN v_created || jsonb_build_object('governance_status','not_required');
  END IF;

  SELECT count(*)::integer INTO v_total_steps
  FROM public.enterprise_approval_policy_steps s WHERE s.policy_id=v_policy_id;
  IF v_total_steps<1 THEN RETURN jsonb_build_object('ok',false,'reason','policy_has_no_steps'); END IF;

  INSERT INTO public.enterprise_approval_cases(
    enterprise_id,site_id,policy_id,requested_by,requester_role,service_category,description,urgency,
    requested_amount,current_step,total_steps,status
  ) VALUES(
    p_enterprise_id,p_site_id,v_policy_id,auth.uid(),v_role,v_category,btrim(p_description),p_urgency,
    p_requested_amount,1,v_total_steps,'pending'
  ) RETURNING id INTO v_case_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,'governance.case_created','enterprise_approval_case',v_case_id,NULL,
    jsonb_build_object('site_id',p_site_id,'policy_id',v_policy_id,'requester_role',v_role,'service_category',v_category,
      'urgency',p_urgency,'requested_amount',p_requested_amount,'total_steps',v_total_steps),'{}'::jsonb
  );

  RETURN jsonb_build_object('ok',true,'governance_status','pending_approval','approval_case_id',v_case_id,'policy_id',v_policy_id,'current_step',1,'total_steps',v_total_steps);
END;
$function$;

-- 6) Approve/reject a pending case. Final approval creates actual request + hybrid dispatch.
CREATE OR REPLACE FUNCTION public.decide_enterprise_approval_case_v1(
  p_enterprise_id uuid,p_case_id uuid,p_decision text,p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_case public.enterprise_approval_cases%ROWTYPE; v_member_id uuid; v_role text; v_required_role text;
  v_created jsonb; v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_decision'); END IF;
  IF p_note IS NOT NULL AND char_length(btrim(p_note))>1000 THEN RETURN jsonb_build_object('ok',false,'reason','note_too_long'); END IF;

  SELECT * INTO v_case FROM public.enterprise_approval_cases c
  WHERE c.id=p_case_id AND c.enterprise_id=p_enterprise_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','case_not_found'); END IF;
  IF v_case.status<>'pending' THEN RETURN jsonb_build_object('ok',false,'reason','case_not_pending'); END IF;
  IF NOT fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,v_case.site_id) THEN RETURN jsonb_build_object('ok',false,'reason','site_forbidden'); END IF;

  SELECT em.id,em.role INTO v_member_id,v_role
  FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id AND em.user_id=auth.uid() AND em.status='active';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;

  SELECT s.approver_role INTO v_required_role
  FROM public.enterprise_approval_policy_steps s
  WHERE s.policy_id=v_case.policy_id AND s.step_order=v_case.current_step;
  IF v_required_role IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','step_not_found'); END IF;
  IF v_role<>v_required_role THEN RETURN jsonb_build_object('ok',false,'reason','wrong_approver_role','required_role',v_required_role); END IF;
  IF v_role='site_manager' AND NOT fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,v_case.site_id) THEN RETURN jsonb_build_object('ok',false,'reason','site_forbidden'); END IF;

  INSERT INTO public.enterprise_approval_decisions(
    enterprise_id,case_id,step_order,approver_member_id,approver_role,decision,note
  ) VALUES(p_enterprise_id,p_case_id,v_case.current_step,v_member_id,v_role,p_decision,NULLIF(btrim(p_note),''));

  IF p_decision='rejected' THEN
    UPDATE public.enterprise_approval_cases SET status='rejected',resolved_at=now() WHERE id=p_case_id;
    PERFORM fixeo_private._write_enterprise_audit_event(
      p_enterprise_id,'governance.case_rejected','enterprise_approval_case',p_case_id,NULL,
      jsonb_build_object('step_order',v_case.current_step,'approver_role',v_role),'{}'::jsonb
    );
    RETURN jsonb_build_object('ok',true,'status','rejected','approval_case_id',p_case_id);
  END IF;

  IF v_case.current_step<v_case.total_steps THEN
    UPDATE public.enterprise_approval_cases SET current_step=current_step+1 WHERE id=p_case_id;
    RETURN jsonb_build_object('ok',true,'status','pending','approval_case_id',p_case_id,'current_step',v_case.current_step+1,'total_steps',v_case.total_steps);
  END IF;

  v_created:=public.create_enterprise_request_hybrid(
    p_enterprise_id,v_case.site_id,v_case.service_category,v_case.description,v_case.urgency
  );
  IF v_created IS NULL OR COALESCE((v_created->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'final_approval_request_create_failed';
  END IF;
  v_request_id:=(v_created->>'service_request_id')::uuid;
  UPDATE public.enterprise_approval_cases
  SET status='approved',service_request_id=v_request_id,resolved_at=now()
  WHERE id=p_case_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,'governance.case_approved','enterprise_approval_case',p_case_id,NULL,
    jsonb_build_object('service_request_id',v_request_id,'approver_role',v_role,'requested_amount',v_case.requested_amount),
    jsonb_build_object('policy_id',v_case.policy_id)
  );

  RETURN v_created || jsonb_build_object('governance_status','approved','approval_case_id',p_case_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok',false,'reason','step_already_decided');
WHEN OTHERS THEN
  RAISE WARNING '[decide_enterprise_approval_case_v1] % %',SQLSTATE,SQLERRM;
  RETURN jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

-- 7) Governance read model.
CREATE OR REPLACE FUNCTION public.get_enterprise_governance_v1(
  p_enterprise_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_role text; v_policies jsonb; v_cases jsonb; v_pending_for_me integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT em.role INTO v_role FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id AND em.user_id=auth.uid() AND em.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_role IN ('owner','admin') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'site_id',p.site_id,'service_category',p.service_category,'urgency',p.urgency,
      'requester_role',p.requester_role,'min_amount',p.min_amount,'max_amount',p.max_amount,'priority',p.priority,'status',p.status,
      'steps',COALESCE((SELECT jsonb_agg(jsonb_build_object('step_order',s.step_order,'approver_role',s.approver_role) ORDER BY s.step_order)
        FROM public.enterprise_approval_policy_steps s WHERE s.policy_id=p.id),'[]'::jsonb)
    ) ORDER BY p.priority,p.created_at),'[]'::jsonb)
    INTO v_policies
    FROM public.enterprise_approval_policies p
    WHERE p.enterprise_id=p_enterprise_id;
  ELSE
    v_policies:='[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',c.id,'site_id',c.site_id,'policy_id',c.policy_id,'requested_by',c.requested_by,'requester_role',c.requester_role,
    'service_category',c.service_category,'description',c.description,'urgency',c.urgency,'requested_amount',c.requested_amount,
    'current_step',c.current_step,'total_steps',c.total_steps,'status',c.status,'service_request_id',c.service_request_id,
    'created_at',c.created_at,'resolved_at',c.resolved_at,
    'required_role',(SELECT s.approver_role FROM public.enterprise_approval_policy_steps s WHERE s.policy_id=c.policy_id AND s.step_order=c.current_step),
    'decisions',COALESCE((SELECT jsonb_agg(jsonb_build_object('step_order',d.step_order,'approver_role',d.approver_role,'decision',d.decision,'note',d.note,'decided_at',d.decided_at) ORDER BY d.step_order)
      FROM public.enterprise_approval_decisions d WHERE d.case_id=c.id),'[]'::jsonb)
  ) ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END,c.created_at DESC),'[]'::jsonb)
  INTO v_cases
  FROM public.enterprise_approval_cases c
  WHERE c.enterprise_id=p_enterprise_id
    AND fixeo_private._fixeo_can_access_enterprise_site(c.enterprise_id,c.site_id);

  SELECT count(*)::integer INTO v_pending_for_me
  FROM public.enterprise_approval_cases c
  JOIN public.enterprise_approval_policy_steps s ON s.policy_id=c.policy_id AND s.step_order=c.current_step
  WHERE c.enterprise_id=p_enterprise_id AND c.status='pending' AND s.approver_role=v_role
    AND fixeo_private._fixeo_can_access_enterprise_site(c.enterprise_id,c.site_id);

  RETURN jsonb_build_object('ok',true,'role',v_role,'pending_for_me',v_pending_for_me,'policies',v_policies,'cases',v_cases);
END;
$function$;

-- 8) Ownership / execute grants.
ALTER FUNCTION public.upsert_enterprise_approval_policy_v1(uuid,uuid,text,uuid,text,text,text,numeric,numeric,integer,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.submit_enterprise_governed_request_v1(uuid,uuid,text,text,text,numeric) OWNER TO postgres;
ALTER FUNCTION public.decide_enterprise_approval_case_v1(uuid,uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_governance_v1(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_enterprise_approval_policy_v1(uuid,uuid,text,uuid,text,text,text,numeric,numeric,integer,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_enterprise_governed_request_v1(uuid,uuid,text,text,text,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.decide_enterprise_approval_case_v1(uuid,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_governance_v1(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.upsert_enterprise_approval_policy_v1(uuid,uuid,text,uuid,text,text,text,numeric,numeric,integer,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_enterprise_governed_request_v1(uuid,uuid,text,text,text,numeric) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decide_enterprise_approval_case_v1(uuid,uuid,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_governance_v1(uuid) TO authenticated,service_role;

COMMIT;
