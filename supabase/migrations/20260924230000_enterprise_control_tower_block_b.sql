-- FIXEO ENTERPRISE — BLOCK B / Control Tower
-- Live SLA alerts, attention queue, site/worker load, manual escalation & prioritization.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Audit vocabulary extension.
-- ---------------------------------------------------------------------------
ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_event_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_event_type_chk
  CHECK (event_type = ANY (ARRAY[
    'member.role_updated'::text,
    'member.status_updated'::text,
    'site.created'::text,
    'site.updated'::text,
    'site.status_updated'::text,
    'request.created'::text,
    'account.created'::text,
    'account.updated'::text,
    'member.invited'::text,
    'member.invitation_accepted'::text,
    'member.invitation_revoked'::text,
    'member.invitation_expired'::text,
    'account.status_updated'::text,
    'account.ownership_transferred'::text,
    'sla.policy_created'::text,
    'sla.policy_updated'::text,
    'sla.snapshot_created'::text,
    'member.site_assigned'::text,
    'member.site_unassigned'::text,
    'workforce.worker_created'::text,
    'workforce.worker_updated'::text,
    'workforce.skills_updated'::text,
    'workforce.sites_updated'::text,
    'workforce.availability_updated'::text,
    'dispatch.policy_created'::text,
    'dispatch.policy_updated'::text,
    'dispatch.internal_offered'::text,
    'dispatch.internal_accepted'::text,
    'dispatch.internal_declined'::text,
    'dispatch.internal_assignment_updated'::text,
    'dispatch.external_started'::text,
    'dispatch.external_fallback'::text,
    'dispatch.no_internal_candidate'::text,
    'control_tower.escalation_created'::text,
    'control_tower.escalation_updated'::text
  ]));

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_target_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_target_type_chk
  CHECK (target_type = ANY (ARRAY[
    'enterprise_member'::text,
    'enterprise_site'::text,
    'service_request'::text,
    'enterprise_account'::text,
    'enterprise_invitation'::text,
    'enterprise_member_site'::text,
    'enterprise_workforce_worker'::text,
    'enterprise_dispatch_policy'::text,
    'enterprise_internal_assignment'::text,
    'enterprise_control_tower_escalation'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Manual escalation / priority overlay.
-- ---------------------------------------------------------------------------
CREATE TABLE public.enterprise_control_tower_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  service_request_id uuid NOT NULL UNIQUE
    REFERENCES public.service_requests(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_to_member_id uuid
    REFERENCES public.enterprise_members(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_control_tower_escalations_priority_chk
    CHECK (priority IN ('normal','high','critical')),
  CONSTRAINT enterprise_control_tower_escalations_status_chk
    CHECK (status IN ('open','acknowledged','resolved')),
  CONSTRAINT enterprise_control_tower_escalations_note_chk
    CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 1000)
);

CREATE INDEX idx_enterprise_control_tower_escalations_enterprise
  ON public.enterprise_control_tower_escalations
  (enterprise_id,status,priority,updated_at DESC);

ALTER TABLE public.enterprise_control_tower_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecte_members_select
ON public.enterprise_control_tower_escalations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_request_context erc
    WHERE erc.enterprise_id=enterprise_control_tower_escalations.enterprise_id
      AND erc.service_request_id=enterprise_control_tower_escalations.service_request_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
  )
);

REVOKE ALL ON TABLE public.enterprise_control_tower_escalations
FROM PUBLIC,anon,authenticated;

GRANT SELECT ON TABLE public.enterprise_control_tower_escalations
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Escalation mutation RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_enterprise_control_tower_escalation_v1(
  p_enterprise_id uuid,
  p_request_id uuid,
  p_priority text,
  p_status text,
  p_assigned_to_member_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_site_id uuid;
  v_note text;
  v_existing_id uuid;
  v_before jsonb;
  v_id uuid;
  v_event text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_dispatch_operator(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF p_priority NOT IN ('normal','high','critical') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_priority');
  END IF;

  IF p_status NOT IN ('open','acknowledged','resolved') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note),'');
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note)>1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','note_too_long');
  END IF;

  SELECT erc.site_id
  INTO v_site_id
  FROM public.enterprise_request_context erc
  WHERE erc.enterprise_id=p_enterprise_id
    AND erc.service_request_id=p_request_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','request_not_found');
  END IF;

  IF p_assigned_to_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.id=p_assigned_to_member_id
      AND em.enterprise_id=p_enterprise_id
      AND em.status='active'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','assignee_not_available');
  END IF;

  SELECT e.id,pg_catalog.to_jsonb(e)
  INTO v_existing_id,v_before
  FROM public.enterprise_control_tower_escalations e
  WHERE e.enterprise_id=p_enterprise_id
    AND e.service_request_id=p_request_id
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.enterprise_control_tower_escalations(
      enterprise_id,service_request_id,priority,status,
      assigned_to_member_id,note,created_by,updated_by
    )
    VALUES(
      p_enterprise_id,p_request_id,p_priority,p_status,
      p_assigned_to_member_id,v_note,auth.uid(),auth.uid()
    )
    RETURNING id INTO v_id;
    v_event := 'control_tower.escalation_created';
  ELSE
    UPDATE public.enterprise_control_tower_escalations
    SET priority=p_priority,
        status=p_status,
        assigned_to_member_id=p_assigned_to_member_id,
        note=v_note,
        updated_by=auth.uid(),
        updated_at=now()
    WHERE id=v_existing_id
    RETURNING id INTO v_id;
    v_event := 'control_tower.escalation_updated';
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    v_event,
    'enterprise_control_tower_escalation',
    v_id,
    v_before,
    pg_catalog.jsonb_build_object(
      'service_request_id',p_request_id,
      'site_id',v_site_id,
      'priority',p_priority,
      'status',p_status,
      'member_id',p_assigned_to_member_id
    ),
    pg_catalog.jsonb_build_object('note_present',v_note IS NOT NULL)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'escalation_id',v_id,
    'service_request_id',p_request_id,
    'priority',p_priority,
    'status',p_status
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[upsert_enterprise_control_tower_escalation_v1] % %',SQLSTATE,SQLERRM;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.upsert_enterprise_control_tower_escalation_v1(
  uuid,uuid,text,text,uuid,text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_enterprise_control_tower_escalation_v1(
  uuid,uuid,text,text,uuid,text
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.upsert_enterprise_control_tower_escalation_v1(
  uuid,uuid,text,text,uuid,text
) TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 4) Control Tower live read model.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_enterprise_control_tower_v1(
  p_enterprise_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attention jsonb;
  v_sites jsonb;
  v_workers jsonb;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_enterprise_id IS NULL THEN
    RAISE EXCEPTION 'enterprise_required';
  END IF;

  IF p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_member(p_enterprise_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT
      sr.id AS request_id,
      erc.site_id,
      es.name AS site_name,
      es.city,
      sr.service_category,
      sr.urgency,
      sr.status AS request_status,
      sr.created_at,
      ers.at_risk_at,
      ers.due_at,
      hs.mode AS dispatch_mode,
      hs.status AS dispatch_status,
      hs.fallback_due_at,
      hs.external_dispatched_at,
      ia.worker_id AS internal_worker_id,
      ia.status AS internal_assignment_status,
      ia.assigned_at,
      ia.started_at,
      ia.completed_at,
      w.display_label AS internal_worker_label,
      esc.id AS escalation_id,
      esc.priority AS escalation_priority,
      esc.status AS escalation_status,
      esc.assigned_to_member_id,
      esc.note AS escalation_note,
      esc.updated_at AS escalation_updated_at,
      CASE
        WHEN sr.status IN ('completed','validated','cancelled') THEN 'none'
        WHEN esc.status IS DISTINCT FROM 'resolved' AND esc.priority='critical' THEN 'critical'
        WHEN ers.due_at IS NOT NULL AND now()>=ers.due_at THEN 'critical'
        WHEN esc.status IS DISTINCT FROM 'resolved' AND esc.priority='high' THEN 'high'
        WHEN ers.at_risk_at IS NOT NULL AND now()>=ers.at_risk_at THEN 'high'
        WHEN hs.status IN ('external_failed','no_internal_candidate') THEN 'high'
        WHEN hs.mode='internal_first' AND hs.status='internal_offered'
             AND hs.fallback_due_at IS NOT NULL AND now()>=hs.fallback_due_at THEN 'high'
        WHEN sr.status='new' THEN 'medium'
        WHEN sr.status='assigned' AND ia.id IS NOT NULL AND ia.started_at IS NULL THEN 'medium'
        ELSE 'low'
      END AS severity,
      CASE
        WHEN sr.status IN ('completed','validated','cancelled') THEN 'resolved'
        WHEN esc.status IS DISTINCT FROM 'resolved' AND esc.priority='critical' THEN 'manual_critical'
        WHEN ers.due_at IS NOT NULL AND now()>=ers.due_at THEN 'sla_breached'
        WHEN esc.status IS DISTINCT FROM 'resolved' AND esc.priority='high' THEN 'manual_high'
        WHEN ers.at_risk_at IS NOT NULL AND now()>=ers.at_risk_at THEN 'sla_at_risk'
        WHEN hs.status='external_failed' THEN 'external_dispatch_failed'
        WHEN hs.status='no_internal_candidate' THEN 'no_internal_candidate'
        WHEN hs.mode='internal_first' AND hs.status='internal_offered'
             AND hs.fallback_due_at IS NOT NULL AND now()>=hs.fallback_due_at THEN 'fallback_due'
        WHEN sr.status='new' THEN 'unassigned'
        WHEN sr.status='assigned' AND ia.id IS NOT NULL AND ia.started_at IS NULL THEN 'assigned_not_started'
        ELSE 'monitor'
      END AS reason
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id=erc.service_request_id
    JOIN public.enterprise_sites es ON es.id=erc.site_id
    LEFT JOIN public.enterprise_request_sla ers ON ers.service_request_id=sr.id
    LEFT JOIN public.enterprise_hybrid_dispatch_state hs ON hs.service_request_id=sr.id
    LEFT JOIN public.enterprise_internal_assignments ia ON ia.service_request_id=sr.id
    LEFT JOIN public.enterprise_workforce_workers w ON w.id=ia.worker_id
    LEFT JOIN public.enterprise_control_tower_escalations esc
      ON esc.service_request_id=sr.id AND esc.enterprise_id=erc.enterprise_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
  ),
  attention_rows AS MATERIALIZED (
    SELECT *
    FROM scoped
    WHERE severity IN ('critical','high','medium')
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      COALESCE(due_at,created_at) ASC,
      created_at ASC
    LIMIT p_limit
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'request_id',a.request_id,
        'site_id',a.site_id,
        'site_name',a.site_name,
        'city',a.city,
        'service_category',a.service_category,
        'urgency',a.urgency,
        'request_status',a.request_status,
        'created_at',a.created_at,
        'severity',a.severity,
        'reason',a.reason,
        'at_risk_at',a.at_risk_at,
        'due_at',a.due_at,
        'dispatch_mode',a.dispatch_mode,
        'dispatch_status',a.dispatch_status,
        'fallback_due_at',a.fallback_due_at,
        'external_dispatched_at',a.external_dispatched_at,
        'internal_worker_id',a.internal_worker_id,
        'internal_worker_label',a.internal_worker_label,
        'internal_assignment_status',a.internal_assignment_status,
        'escalation',
          CASE WHEN a.escalation_id IS NULL THEN NULL
          ELSE pg_catalog.jsonb_build_object(
            'id',a.escalation_id,
            'priority',a.escalation_priority,
            'status',a.escalation_status,
            'assigned_to_member_id',a.assigned_to_member_id,
            'note',a.escalation_note,
            'updated_at',a.escalation_updated_at
          ) END
      )
      ORDER BY
        CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        COALESCE(a.due_at,a.created_at) ASC
    ),
    '[]'::jsonb
  )
  INTO v_attention
  FROM attention_rows a;

  WITH scoped AS MATERIALIZED (
    SELECT
      erc.site_id,
      es.name AS site_name,
      es.city,
      sr.status,
      ers.at_risk_at,
      ers.due_at,
      ia.id AS internal_assignment_id
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id=erc.service_request_id
    JOIN public.enterprise_sites es ON es.id=erc.site_id
    LEFT JOIN public.enterprise_request_sla ers ON ers.service_request_id=sr.id
    LEFT JOIN public.enterprise_internal_assignments ia ON ia.service_request_id=sr.id
    WHERE erc.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
  ),
  by_site AS (
    SELECT
      site_id,site_name,city,
      count(*) FILTER (WHERE status NOT IN ('completed','validated','cancelled'))::integer AS open_count,
      count(*) FILTER (
        WHERE status NOT IN ('completed','validated','cancelled')
          AND due_at IS NOT NULL AND now()>=due_at
      )::integer AS breached_count,
      count(*) FILTER (
        WHERE status NOT IN ('completed','validated','cancelled')
          AND at_risk_at IS NOT NULL AND now()>=at_risk_at
          AND (due_at IS NULL OR now()<due_at)
      )::integer AS at_risk_count,
      count(*) FILTER (
        WHERE status NOT IN ('completed','validated','cancelled')
          AND internal_assignment_id IS NOT NULL
      )::integer AS internal_active_count
    FROM scoped
    GROUP BY site_id,site_name,city
    ORDER BY breached_count DESC,at_risk_count DESC,open_count DESC,site_name
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'site_id',s.site_id,
        'site_name',s.site_name,
        'city',s.city,
        'open_count',s.open_count,
        'breached_count',s.breached_count,
        'at_risk_count',s.at_risk_count,
        'internal_active_count',s.internal_active_count
      )
    ),
    '[]'::jsonb
  )
  INTO v_sites
  FROM by_site s;

  WITH worker_load AS (
    SELECT
      w.id AS worker_id,
      w.display_label,
      w.status,
      w.availability,
      w.max_concurrent_jobs,
      count(ia.id) FILTER (
        WHERE ia.status IN ('assigned','in_progress')
          AND EXISTS (
            SELECT 1
            FROM public.enterprise_request_context erc2
            WHERE erc2.service_request_id=ia.service_request_id
              AND erc2.enterprise_id=p_enterprise_id
              AND fixeo_private._fixeo_can_access_enterprise_site(erc2.enterprise_id,erc2.site_id)
          )
      )::integer AS active_assignments,
      count(ia.id) FILTER (
        WHERE ia.status='assigned'
          AND EXISTS (
            SELECT 1
            FROM public.enterprise_request_context erc2
            WHERE erc2.service_request_id=ia.service_request_id
              AND erc2.enterprise_id=p_enterprise_id
              AND fixeo_private._fixeo_can_access_enterprise_site(erc2.enterprise_id,erc2.site_id)
          )
      )::integer AS waiting_start_count,
      count(ia.id) FILTER (
        WHERE ia.status='in_progress'
          AND EXISTS (
            SELECT 1
            FROM public.enterprise_request_context erc2
            WHERE erc2.service_request_id=ia.service_request_id
              AND erc2.enterprise_id=p_enterprise_id
              AND fixeo_private._fixeo_can_access_enterprise_site(erc2.enterprise_id,erc2.site_id)
          )
      )::integer AS in_progress_count
    FROM public.enterprise_workforce_workers w
    LEFT JOIN public.enterprise_internal_assignments ia ON ia.worker_id=w.id
    WHERE w.enterprise_id=p_enterprise_id
      AND (
        w.all_sites=true
        OR EXISTS (
          SELECT 1
          FROM public.enterprise_workforce_sites ws
          WHERE ws.worker_id=w.id
            AND ws.enterprise_id=p_enterprise_id
            AND fixeo_private._fixeo_can_access_enterprise_site(ws.enterprise_id,ws.site_id)
        )
      )
    GROUP BY w.id,w.display_label,w.status,w.availability,w.max_concurrent_jobs
    ORDER BY active_assignments DESC,w.display_label
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'worker_id',x.worker_id,
        'display_label',x.display_label,
        'status',x.status,
        'availability',x.availability,
        'max_concurrent_jobs',x.max_concurrent_jobs,
        'active_assignments',x.active_assignments,
        'waiting_start_count',x.waiting_start_count,
        'in_progress_count',x.in_progress_count,
        'utilization_percent',
          CASE WHEN x.max_concurrent_jobs>0
            THEN pg_catalog.round((x.active_assignments::numeric/x.max_concurrent_jobs::numeric)*100,1)
            ELSE 0 END
      )
    ),
    '[]'::jsonb
  )
  INTO v_workers
  FROM worker_load x;

  WITH scoped AS (
    SELECT
      sr.status,
      ers.at_risk_at,
      ers.due_at,
      esc.priority,
      esc.status AS escalation_status
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id=erc.service_request_id
    LEFT JOIN public.enterprise_request_sla ers ON ers.service_request_id=sr.id
    LEFT JOIN public.enterprise_control_tower_escalations esc
      ON esc.service_request_id=sr.id AND esc.enterprise_id=erc.enterprise_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(erc.enterprise_id,erc.site_id)
  )
  SELECT pg_catalog.jsonb_build_object(
    'open_requests',
      count(*) FILTER (WHERE status NOT IN ('completed','validated','cancelled'))::integer,
    'critical',
      count(*) FILTER (
        WHERE status NOT IN ('completed','validated','cancelled')
          AND (
            (escalation_status IS DISTINCT FROM 'resolved' AND priority='critical')
            OR (due_at IS NOT NULL AND now()>=due_at)
          )
      )::integer,
    'at_risk',
      count(*) FILTER (
        WHERE status NOT IN ('completed','validated','cancelled')
          AND at_risk_at IS NOT NULL AND now()>=at_risk_at
          AND (due_at IS NULL OR now()<due_at)
      )::integer,
    'manual_escalations',
      count(*) FILTER (
        WHERE escalation_status IN ('open','acknowledged')
      )::integer
  )
  INTO v_summary
  FROM scoped;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'generated_at',now(),
    'summary',v_summary,
    'attention',v_attention,
    'site_load',v_sites,
    'worker_load',v_workers
  );
END;
$function$;

ALTER FUNCTION public.get_enterprise_control_tower_v1(uuid,integer)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_enterprise_control_tower_v1(uuid,integer)
  FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.get_enterprise_control_tower_v1(uuid,integer)
  TO authenticated,service_role;

COMMIT;
