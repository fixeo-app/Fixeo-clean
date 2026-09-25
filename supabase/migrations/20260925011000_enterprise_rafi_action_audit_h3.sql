-- FIXEO Enterprise H3 — RAFI action audit & explainability.
BEGIN;

ALTER TABLE public.enterprise_audit_events DROP CONSTRAINT enterprise_audit_events_event_type_chk;
ALTER TABLE public.enterprise_audit_events ADD CONSTRAINT enterprise_audit_events_event_type_chk
CHECK (event_type = ANY (ARRAY[
'member.role_updated','member.status_updated','site.created','site.updated','site.status_updated','request.created',
'account.created','account.updated','member.invited','member.invitation_accepted','member.invitation_revoked','member.invitation_expired',
'account.status_updated','account.ownership_transferred','sla.policy_created','sla.policy_updated','sla.snapshot_created',
'member.site_assigned','member.site_unassigned','workforce.worker_created','workforce.worker_updated','workforce.skills_updated',
'workforce.sites_updated','workforce.availability_updated','dispatch.policy_created','dispatch.policy_updated','dispatch.internal_offered',
'dispatch.internal_accepted','dispatch.internal_declined','dispatch.internal_assignment_updated','dispatch.external_started',
'dispatch.external_fallback','dispatch.no_internal_candidate','control_tower.escalation_created','control_tower.escalation_updated',
'maintenance.plan_created','maintenance.plan_updated','equipment.created','equipment.updated','equipment.request_linked',
'equipment.request_unlinked','equipment.maintenance_linked','equipment.maintenance_unlinked','equipment.asset_registered',
'equipment.asset_removed','finance.cost_center_created','finance.cost_center_updated','finance.budget_created','finance.budget_updated',
'finance.po_created','finance.po_updated','finance.worker_rate_updated','finance.request_context_updated','governance.policy_created',
'governance.policy_updated','governance.case_created','governance.case_approved','governance.case_rejected',
'rafi.action_confirmed'
]::text[]));

ALTER TABLE public.enterprise_audit_events DROP CONSTRAINT enterprise_audit_events_target_type_chk;
ALTER TABLE public.enterprise_audit_events ADD CONSTRAINT enterprise_audit_events_target_type_chk
CHECK (target_type = ANY (ARRAY[
'enterprise_member','enterprise_site','service_request','enterprise_account','enterprise_invitation','enterprise_member_site',
'enterprise_workforce_worker','enterprise_dispatch_policy','enterprise_internal_assignment','enterprise_control_tower_escalation',
'enterprise_maintenance_plan','enterprise_equipment','enterprise_equipment_asset','enterprise_cost_center','enterprise_budget',
'enterprise_purchase_order','enterprise_request_finance_context','enterprise_approval_policy','enterprise_approval_case','rafi_action'
]::text[]));

CREATE OR REPLACE FUNCTION public.audit_enterprise_rafi_action_v1(
 p_enterprise_id uuid,p_action_type text,p_target_id uuid,p_result text,p_details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_role text;v_safe jsonb;
BEGIN
 IF v_actor IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated'); END IF;
 SELECT em.role INTO v_role FROM public.enterprise_members em
 WHERE em.enterprise_id=p_enterprise_id AND em.user_id=v_actor AND em.status='active' LIMIT 1;
 IF v_role IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
 IF p_action_type NOT IN ('create_governed_request','propose_internal_assignment','propose_hybrid_dispatch','decide_approval','upsert_control_tower_escalation','prepare_maintenance_action')
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_action_type'); END IF;
 IF p_result NOT IN ('executed','pending_approval') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_result'); END IF;
 IF p_target_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_target'); END IF;
 IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN RETURN jsonb_build_object('ok',false,'reason','invalid_details'); END IF;
 v_safe:=jsonb_strip_nulls(jsonb_build_object(
   'action_type',p_action_type,'result',p_result,'actor_role',v_role,
   'workflow',left(coalesce(p_details->>'workflow',''),120),
   'governance_status',left(coalesce(p_details->>'governance_status',''),40)
 ));
 PERFORM fixeo_private._write_enterprise_audit_event(
   p_enterprise_id,'rafi.action_confirmed','rafi_action',p_target_id,NULL,
   jsonb_build_object('result',p_result),v_safe
 );
 RETURN jsonb_build_object('ok',true);
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING '[audit_enterprise_rafi_action_v1] % %',SQLSTATE,SQLERRM;
 RETURN jsonb_build_object('ok',false,'reason','internal_error');
END $$;

ALTER FUNCTION public.audit_enterprise_rafi_action_v1(uuid,text,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_enterprise_rafi_action_v1(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.audit_enterprise_rafi_action_v1(uuid,text,uuid,text,jsonb) TO authenticated;

COMMIT;
