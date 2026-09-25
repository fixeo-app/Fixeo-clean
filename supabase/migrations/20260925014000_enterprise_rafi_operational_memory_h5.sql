-- FIXEO Enterprise H5 — RAFI operational follow-up state. No conversation storage.
BEGIN;
CREATE TABLE public.enterprise_rafi_followups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,
 target_type text NOT NULL CHECK(target_type IN('service_request','enterprise_approval_case','enterprise_maintenance_plan','enterprise_equipment','enterprise_site')),
 target_id uuid NOT NULL,
 followup_kind text NOT NULL CHECK(followup_kind IN('attention','sla','governance','maintenance','equipment','workforce')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','dismissed')),
 note text NULL CHECK(note IS NULL OR char_length(note)<=500),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 updated_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enterprise_id,target_type,target_id,followup_kind)
);
ALTER TABLE public.enterprise_rafi_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enterprise_rafi_followups FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.enterprise_rafi_followups TO authenticated;
CREATE POLICY enterprise_rafi_followups_select ON public.enterprise_rafi_followups FOR SELECT TO authenticated
USING(fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE OR REPLACE FUNCTION public.upsert_enterprise_rafi_followup_v1(p_enterprise_id uuid,p_target_type text,p_target_id uuid,p_followup_kind text,p_status text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_role text;v_id uuid;
BEGIN
 IF v_actor IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated');END IF;
 SELECT role INTO v_role FROM public.enterprise_members WHERE enterprise_id=p_enterprise_id AND user_id=v_actor AND status='active' LIMIT 1;
 IF v_role IS NULL OR v_role NOT IN('owner','admin','operations_manager','site_manager') THEN RETURN jsonb_build_object('ok',false,'reason','forbidden');END IF;
 IF p_target_type NOT IN('service_request','enterprise_approval_case','enterprise_maintenance_plan','enterprise_equipment','enterprise_site')
 OR p_followup_kind NOT IN('attention','sla','governance','maintenance','equipment','workforce')
 OR p_status NOT IN('open','resolved','dismissed') OR p_target_id IS NULL OR char_length(coalesce(p_note,''))>500
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_input');END IF;
 INSERT INTO public.enterprise_rafi_followups(enterprise_id,target_type,target_id,followup_kind,status,note,created_by,updated_by)
 VALUES(p_enterprise_id,p_target_type,p_target_id,p_followup_kind,p_status,nullif(btrim(p_note),''),v_actor,v_actor)
 ON CONFLICT(enterprise_id,target_type,target_id,followup_kind) DO UPDATE SET status=excluded.status,note=excluded.note,updated_by=v_actor,updated_at=now()
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'followup_id',v_id);
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[upsert_enterprise_rafi_followup_v1] % %',SQLSTATE,SQLERRM;RETURN jsonb_build_object('ok',false,'reason','internal_error');END $$;

CREATE OR REPLACE FUNCTION public.get_enterprise_rafi_followups_v1(p_enterprise_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_rows jsonb;
BEGIN
 IF v_actor IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','unauthenticated');END IF;
 IF NOT fixeo_private._fixeo_is_enterprise_member(p_enterprise_id) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'target_type',target_type,'target_id',target_id,'followup_kind',followup_kind,'status',status,'note',note,'updated_at',updated_at) ORDER BY updated_at DESC),'[]'::jsonb)
 INTO v_rows FROM public.enterprise_rafi_followups WHERE enterprise_id=p_enterprise_id AND status='open' AND updated_at>now()-interval '90 days';
 RETURN jsonb_build_object('ok',true,'followups',v_rows);
END $$;
ALTER FUNCTION public.upsert_enterprise_rafi_followup_v1(uuid,text,uuid,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_rafi_followups_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.upsert_enterprise_rafi_followup_v1(uuid,text,uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_rafi_followups_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upsert_enterprise_rafi_followup_v1(uuid,text,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_enterprise_rafi_followups_v1(uuid) TO authenticated;
COMMIT;