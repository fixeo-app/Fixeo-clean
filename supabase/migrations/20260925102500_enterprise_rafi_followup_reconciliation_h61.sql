-- FIXEO Enterprise H6.1 — RAFI follow-up reconciliation engine.
BEGIN;
CREATE OR REPLACE FUNCTION public.reconcile_enterprise_rafi_followups_v1(p_enterprise_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_role text;v_resolved int:=0;v_open int:=0;
BEGIN
 IF v_actor IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated');END IF;
 SELECT role INTO v_role FROM public.enterprise_members WHERE enterprise_id=p_enterprise_id AND user_id=v_actor AND status='active' LIMIT 1;
 IF v_role IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','forbidden');END IF;

 -- Governance cases close when the canonical case is no longer pending.
 UPDATE public.enterprise_rafi_followups f SET status='resolved',updated_by=v_actor,updated_at=now()
 WHERE f.enterprise_id=p_enterprise_id AND f.status='open' AND f.target_type='enterprise_approval_case'
 AND EXISTS(SELECT 1 FROM public.enterprise_approval_cases c WHERE c.id=f.target_id AND c.enterprise_id=p_enterprise_id AND c.status IN('approved','rejected'));
 GET DIAGNOSTICS v_resolved=ROW_COUNT;

 -- Maintenance followups close only when the canonical plan is inactive.
 UPDATE public.enterprise_rafi_followups f SET status='resolved',updated_by=v_actor,updated_at=now()
 WHERE f.enterprise_id=p_enterprise_id AND f.status='open' AND f.target_type='enterprise_maintenance_plan'
 AND EXISTS(SELECT 1 FROM public.enterprise_maintenance_plans p WHERE p.id=f.target_id AND p.enterprise_id=p_enterprise_id AND p.status='inactive');
 GET DIAGNOSTICS v_open=ROW_COUNT; v_resolved:=v_resolved+v_open;

 -- Request followups close only on canonical terminal request states.
 UPDATE public.enterprise_rafi_followups f SET status='resolved',updated_by=v_actor,updated_at=now()
 WHERE f.enterprise_id=p_enterprise_id AND f.status='open' AND f.target_type='service_request'
 AND EXISTS(SELECT 1 FROM public.enterprise_request_context erc JOIN public.service_requests sr ON sr.id=erc.service_request_id
   WHERE erc.enterprise_id=p_enterprise_id AND erc.service_request_id=f.target_id AND sr.status IN('completed','cancelled','canceled','closed'));
 GET DIAGNOSTICS v_open=ROW_COUNT; v_resolved:=v_resolved+v_open;

 SELECT count(*) INTO v_open FROM public.enterprise_rafi_followups WHERE enterprise_id=p_enterprise_id AND status='open';
 RETURN jsonb_build_object('ok',true,'resolved_now',v_resolved,'open_remaining',v_open);
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[reconcile_enterprise_rafi_followups_v1] % %',SQLSTATE,SQLERRM;RETURN jsonb_build_object('ok',false,'reason','internal_error');END $$;
ALTER FUNCTION public.reconcile_enterprise_rafi_followups_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_enterprise_rafi_followups_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_enterprise_rafi_followups_v1(uuid) TO authenticated;
COMMIT;