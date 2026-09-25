-- FIXEO Enterprise H6.2 — bounded operational change snapshots.
BEGIN;
CREATE TABLE public.enterprise_rafi_followup_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,
 followup_id uuid NOT NULL REFERENCES public.enterprise_rafi_followups(id) ON DELETE CASCADE,
 state_key text NOT NULL CHECK(char_length(state_key)<=80),
 severity smallint NOT NULL CHECK(severity BETWEEN 0 AND 4),
 captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enterprise_rafi_followup_snapshots_lookup ON public.enterprise_rafi_followup_snapshots(enterprise_id,followup_id,captured_at DESC);
ALTER TABLE public.enterprise_rafi_followup_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enterprise_rafi_followup_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.enterprise_rafi_followup_snapshots TO authenticated;
CREATE POLICY enterprise_rafi_followup_snapshots_select ON public.enterprise_rafi_followup_snapshots FOR SELECT TO authenticated
USING(fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE OR REPLACE FUNCTION public.capture_enterprise_rafi_changes_v1(p_enterprise_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_role text;v_count int:=0;v_changes jsonb;
BEGIN
 IF v_actor IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated');END IF;
 SELECT role INTO v_role FROM public.enterprise_members WHERE enterprise_id=p_enterprise_id AND user_id=v_actor AND status='active' LIMIT 1;
 IF v_role IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','forbidden');END IF;

 WITH current_state AS (
  SELECT f.id followup_id,
   CASE
    WHEN f.status='resolved' THEN 'resolved'
    WHEN f.target_type='enterprise_approval_case' THEN coalesce((SELECT c.status FROM public.enterprise_approval_cases c WHERE c.id=f.target_id AND c.enterprise_id=p_enterprise_id),'missing')
    WHEN f.target_type='enterprise_maintenance_plan' THEN coalesce((SELECT p.status FROM public.enterprise_maintenance_plans p WHERE p.id=f.target_id AND p.enterprise_id=p_enterprise_id),'missing')
    WHEN f.target_type='service_request' THEN coalesce((SELECT sr.status FROM public.enterprise_request_context erc JOIN public.service_requests sr ON sr.id=erc.service_request_id WHERE erc.enterprise_id=p_enterprise_id AND erc.service_request_id=f.target_id),'missing')
    ELSE f.status END state_key,
   CASE WHEN f.status='resolved' THEN 0 WHEN f.followup_kind='sla' THEN 4 WHEN f.followup_kind IN('governance','maintenance','equipment') THEN 3 ELSE 2 END severity
  FROM public.enterprise_rafi_followups f WHERE f.enterprise_id=p_enterprise_id AND f.updated_at>now()-interval '90 days'
 ), changed AS (
  SELECT c.*,l.state_key previous_key,l.severity previous_severity
  FROM current_state c LEFT JOIN LATERAL(SELECT s.state_key,s.severity FROM public.enterprise_rafi_followup_snapshots s WHERE s.enterprise_id=p_enterprise_id AND s.followup_id=c.followup_id ORDER BY s.captured_at DESC LIMIT 1)l ON true
  WHERE l.state_key IS NULL OR l.state_key<>c.state_key OR l.severity<>c.severity
 ), ins AS (
  INSERT INTO public.enterprise_rafi_followup_snapshots(enterprise_id,followup_id,state_key,severity)
  SELECT p_enterprise_id,followup_id,state_key,severity FROM changed RETURNING followup_id,state_key,severity
 )
 SELECT count(*) INTO v_count FROM ins;

 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_changes FROM (
  SELECT f.id followup_id,f.target_type,f.target_id,f.followup_kind,s.state_key,s.severity,
   CASE WHEN prev.id IS NULL THEN 'new' WHEN s.state_key='resolved' THEN 'resolved'
        WHEN s.severity<prev.severity THEN 'improved' WHEN s.severity>prev.severity THEN 'worsened'
        WHEN s.state_key<>prev.state_key THEN 'changed' ELSE 'unchanged' END change
  FROM public.enterprise_rafi_followups f
  JOIN LATERAL(SELECT * FROM public.enterprise_rafi_followup_snapshots z WHERE z.followup_id=f.id ORDER BY captured_at DESC LIMIT 1)s ON true
  LEFT JOIN LATERAL(SELECT * FROM public.enterprise_rafi_followup_snapshots z WHERE z.followup_id=f.id AND z.id<>s.id ORDER BY captured_at DESC LIMIT 1)prev ON true
  WHERE f.enterprise_id=p_enterprise_id AND f.updated_at>now()-interval '90 days' ORDER BY s.captured_at DESC LIMIT 60
 )x;
 RETURN jsonb_build_object('ok',true,'captured',v_count,'changes',v_changes);
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[capture_enterprise_rafi_changes_v1] % %',SQLSTATE,SQLERRM;RETURN jsonb_build_object('ok',false,'reason','internal_error');END $$;
ALTER FUNCTION public.capture_enterprise_rafi_changes_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.capture_enterprise_rafi_changes_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_enterprise_rafi_changes_v1(uuid) TO authenticated;
COMMIT;