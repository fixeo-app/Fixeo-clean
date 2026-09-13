-- bp15-enterprise-automation.sql
-- BP15: Enterprise Automation & Rules Engine
-- Depends on: 7c13a1 (enterprise_accounts), 7c13a2 (sites),
--             7c15a1 (enterprise_members), 7c15a6 (member_sites),
--             7c15a3 (enterprise_audit_log + _eal_append),
--             bp12-enterprise-sla-policies.sql (enterprise_sla_status view),
--             bp13-enterprise-escalations.sql (enterprise_escalations,
--               open_escalation RPC, ee_unique_active_escalation index)
-- Rule evaluation uses BP12 sla_status view and BP13 escalation table.
-- BP15 NEVER calls dispatch_execute_v1.
-- No duplicate lifecycle tables.
-- enterprise_request_context = sole enterprise linkage.
-- No arbitrary SQL in rules. No eval(). No user-defined code.
-- Rules are data. Conditions/actions from strict server-side enums.
--
-- EVALUATOR CALLER NOTE:
--   V1 evaluate_enterprise_automations must be called by an authenticated
--   enterprise member with role IN ('owner','admin','operations_manager').
--   System-level evaluation (future cron) uses a service-role bypass — V1
--   does NOT support background/daemon invocation.
--
-- ESCALATION_UNACKNOWLEDGED V1 LIMITATION:
--   BP13 has no severity-change RPC. When an escalation is unacknowledged
--   beyond the threshold, BP15 emits a SECOND escalation with the rule's
--   reason_code (default: 'auto_escalated'). The ee_unique_active_escalation
--   partial unique index (enterprise_id, service_request_id, reason_code)
--   WHERE status IN ('open','acknowledged') prevents duplicates for the same
--   reason_code+request combination. A different reason_code is allowed per
--   BP13 contract. This is a known V1 design choice: no in-place severity upgrade.
BEGIN;

-- ============================================================
-- BLOCK 1 — enterprise_automation_rules table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.enterprise_automation_rules (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id      uuid        NOT NULL,
  site_id            uuid            NULL,  -- NULL = enterprise-wide
  name               text        NOT NULL,
  signal_type        text        NOT NULL,
  action_type        text        NOT NULL,
  -- Optional thresholds / parameters
  urgency_filter     text            NULL,  -- 'urgent'|'now'|NULL (match any)
  threshold_minutes  integer         NULL,  -- for time-based signals (e.g. unacknowledged for N min)
  severity           text        NOT NULL DEFAULT 'high',  -- escalation severity to open
  reason_code        text        NOT NULL DEFAULT 'sla_breached',  -- escalation reason_code; must match ee_reason_code_check ('sla_breached','sla_approaching','urgent_unassigned','mission_stalled','manual')
  active             boolean     NOT NULL DEFAULT true,
  created_by         uuid        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ear_pkey PRIMARY KEY (id),

  CONSTRAINT ear_enterprise_fk FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id) ON DELETE RESTRICT,

  CONSTRAINT ear_site_fk FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites(id) ON DELETE SET NULL,

  CONSTRAINT ear_created_by_fk FOREIGN KEY (created_by)
    REFERENCES public.users(id) ON DELETE RESTRICT,

  CONSTRAINT ear_signal_type_check CHECK (
    signal_type IN ('sla_breached', 'urgent_unattended', 'escalation_unacknowledged')
  ),

  CONSTRAINT ear_action_type_check CHECK (
    action_type IN ('open_escalation')
  ),

  CONSTRAINT ear_severity_check CHECK (
    severity IN ('critical', 'high', 'medium', 'low')
  ),

  CONSTRAINT ear_urgency_filter_check CHECK (
    urgency_filter IS NULL OR urgency_filter IN ('normale', 'urgent', 'now')
  ),

  CONSTRAINT ear_threshold_positive CHECK (
    threshold_minutes IS NULL OR threshold_minutes > 0
  ),

  CONSTRAINT ear_name_nonempty CHECK (
    length(trim(name)) > 0
  ),

  CONSTRAINT ear_reason_code_nonempty CHECK (
    length(trim(reason_code)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_ear_enterprise_active
  ON public.enterprise_automation_rules (enterprise_id, active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_ear_site
  ON public.enterprise_automation_rules (site_id)
  WHERE site_id IS NOT NULL;

-- ============================================================
-- BLOCK 2 — enterprise_automation_executions ledger
-- Append-only. Immutable. Non-canonical.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.enterprise_automation_executions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  rule_id         uuid        NOT NULL,
  enterprise_id   uuid        NOT NULL,
  signal_type     text        NOT NULL,
  signal_key      text        NOT NULL,  -- deterministic fingerprint: signal_type||':'||request_id||':'||rule_id
  action_type     text        NOT NULL,
  outcome         text        NOT NULL,  -- 'executed' | 'skipped' | 'error'
  escalation_id   uuid            NULL,  -- if an escalation was opened
  metadata        jsonb       NOT NULL DEFAULT '{}',
  executed_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT eae_pkey PRIMARY KEY (id),

  CONSTRAINT eae_rule_fk FOREIGN KEY (rule_id)
    REFERENCES public.enterprise_automation_rules(id) ON DELETE RESTRICT,

  CONSTRAINT eae_enterprise_fk FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id) ON DELETE RESTRICT,

  CONSTRAINT eae_outcome_check CHECK (
    outcome IN ('executed', 'skipped', 'error')
  ),

  CONSTRAINT eae_signal_type_check CHECK (
    signal_type IN ('sla_breached', 'urgent_unattended', 'escalation_unacknowledged')
  ),

  CONSTRAINT eae_action_type_check CHECK (
    action_type IN ('open_escalation')
  )
);

-- Idempotency: one 'executed' outcome per signal_key per rule prevents re-execution
-- 'skipped'/'error' outcomes are allowed multiple times (observability).
CREATE UNIQUE INDEX IF NOT EXISTS idx_eae_idempotency
  ON public.enterprise_automation_executions (rule_id, signal_key)
  WHERE outcome = 'executed';

CREATE INDEX IF NOT EXISTS idx_eae_enterprise_executed
  ON public.enterprise_automation_executions (enterprise_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_eae_rule
  ON public.enterprise_automation_executions (rule_id, executed_at DESC);

-- ============================================================
-- BLOCK 3 — RLS on both tables
-- ============================================================

-- ── enterprise_automation_rules RLS
ALTER TABLE public.enterprise_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_automation_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ear_deny_anon" ON public.enterprise_automation_rules;
CREATE POLICY "ear_deny_anon"
  ON public.enterprise_automation_rules AS RESTRICTIVE TO anon USING (false);

DROP POLICY IF EXISTS "ear_members_select" ON public.enterprise_automation_rules;
CREATE POLICY "ear_members_select"
  ON public.enterprise_automation_rules FOR SELECT TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

DROP POLICY IF EXISTS "ear_managers_write" ON public.enterprise_automation_rules;
CREATE POLICY "ear_managers_write"
  ON public.enterprise_automation_rules FOR ALL TO authenticated
  USING     (fixeo_private._fixeo_is_enterprise_manager(enterprise_id))
  WITH CHECK (fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

DROP POLICY IF EXISTS "ear_admin_all" ON public.enterprise_automation_rules;
CREATE POLICY "ear_admin_all"
  ON public.enterprise_automation_rules TO authenticated
  USING     (fixeo_private._fixeo_is_admin())
  WITH CHECK (fixeo_private._fixeo_is_admin());

REVOKE ALL ON public.enterprise_automation_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.enterprise_automation_rules TO authenticated;

-- ── enterprise_automation_executions RLS
ALTER TABLE public.enterprise_automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_automation_executions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eae_deny_anon" ON public.enterprise_automation_executions;
CREATE POLICY "eae_deny_anon"
  ON public.enterprise_automation_executions AS RESTRICTIVE TO anon USING (false);

DROP POLICY IF EXISTS "eae_members_select" ON public.enterprise_automation_executions;
CREATE POLICY "eae_members_select"
  ON public.enterprise_automation_executions FOR SELECT TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

DROP POLICY IF EXISTS "eae_admin_all" ON public.enterprise_automation_executions;
CREATE POLICY "eae_admin_all"
  ON public.enterprise_automation_executions TO authenticated
  USING     (fixeo_private._fixeo_is_admin())
  WITH CHECK (fixeo_private._fixeo_is_admin());

REVOKE ALL ON public.enterprise_automation_executions FROM PUBLIC, anon;
GRANT SELECT ON public.enterprise_automation_executions TO authenticated;
-- No INSERT grant to authenticated: all writes via SECURITY DEFINER RPCs only

-- ============================================================
-- BLOCK 4 — eal_action_type_check extension
-- Adds 'automation_executed' while preserving all 11 existing values.
-- ============================================================

DO $$
DECLARE
  v_col_type text;
BEGIN
  SELECT data_type INTO v_col_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'enterprise_audit_log'
    AND  column_name  = 'action_type';

  IF v_col_type = 'text' THEN
    -- Drop and recreate CHECK constraint preserving all 12 values
    ALTER TABLE public.enterprise_audit_log
      DROP CONSTRAINT IF EXISTS eal_action_type_check;
    ALTER TABLE public.enterprise_audit_log
      ADD CONSTRAINT eal_action_type_check CHECK (
        action_type IN (
          'member_role_changed',
          'member_status_changed',
          'site_updated',
          'site_status_changed',
          'account_profile_updated',
          'invitation_created',
          'invitation_revoked',
          'invitation_accepted',
          'escalation_opened',
          'escalation_acknowledged',
          'escalation_resolved',
          'automation_executed'
        )
      );
    RAISE NOTICE 'BP15: eal_action_type_check extended with automation_executed';
  ELSE
    RAISE NOTICE 'BP15: action_type is not text/check — skipping constraint extension (type: %)', v_col_type;
  END IF;
END $$;

-- ============================================================
-- BLOCK 5 — Updated_at trigger for rules
-- ============================================================

CREATE OR REPLACE FUNCTION public._ear_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS ear_updated_at ON public.enterprise_automation_rules;
CREATE TRIGGER ear_updated_at
  BEFORE UPDATE ON public.enterprise_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public._ear_set_updated_at();

-- ============================================================
-- BLOCK 6 — Helper: fixeo_private._bp15_check_automation_manager
-- Returns role or raises. Owner/admin only for writes.
-- ============================================================

CREATE OR REPLACE FUNCTION fixeo_private._bp15_check_automation_manager(
  p_enterprise_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role INTO v_role
  FROM public.enterprise_members
  WHERE enterprise_id = p_enterprise_id
    AND user_id = auth.uid()
    AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enterprise_member'; END IF;
  IF v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'insufficient_privilege'; END IF;
  RETURN v_role;
END; $$;
REVOKE ALL ON FUNCTION fixeo_private._bp15_check_automation_manager FROM PUBLIC, anon, authenticated;

-- ============================================================
-- BLOCK 7 — Helper: fixeo_private._bp15_check_automation_reader
-- Returns role (any active member).
-- ============================================================

CREATE OR REPLACE FUNCTION fixeo_private._bp15_check_automation_reader(
  p_enterprise_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role INTO v_role
  FROM public.enterprise_members
  WHERE enterprise_id = p_enterprise_id
    AND user_id = auth.uid()
    AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enterprise_member'; END IF;
  RETURN v_role;
END; $$;
REVOKE ALL ON FUNCTION fixeo_private._bp15_check_automation_reader FROM PUBLIC, anon, authenticated;

-- ============================================================
-- BLOCK 8 — RPC: create_automation_rule
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_automation_rule(
  p_enterprise_id     uuid,
  p_name              text,
  p_signal_type       text,
  p_action_type       text,
  p_site_id           uuid    DEFAULT NULL,
  p_urgency_filter    text    DEFAULT NULL,
  p_threshold_minutes integer DEFAULT NULL,
  p_severity          text    DEFAULT 'high',
  p_reason_code       text    DEFAULT 'sla_breached'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role    text;
  v_rule_id uuid;
  v_name    text;
BEGIN
  v_role := fixeo_private._bp15_check_automation_manager(p_enterprise_id);

  -- Validate signal_type
  IF p_signal_type NOT IN ('sla_breached', 'urgent_unattended', 'escalation_unacknowledged') THEN
    RAISE EXCEPTION 'invalid_signal_type';
  END IF;

  -- Validate action_type
  IF p_action_type NOT IN ('open_escalation') THEN
    RAISE EXCEPTION 'invalid_action_type';
  END IF;

  -- Validate severity
  IF p_severity NOT IN ('critical', 'high', 'medium', 'low') THEN
    RAISE EXCEPTION 'invalid_severity';
  END IF;

  -- Validate urgency_filter
  IF p_urgency_filter IS NOT NULL AND p_urgency_filter NOT IN ('normale', 'urgent', 'now') THEN
    RAISE EXCEPTION 'invalid_urgency_filter';
  END IF;

  -- Validate threshold
  IF p_threshold_minutes IS NOT NULL AND p_threshold_minutes <= 0 THEN
    RAISE EXCEPTION 'threshold_must_be_positive';
  END IF;

  -- Validate name
  v_name := trim(p_name);
  IF v_name IS NULL OR length(v_name) = 0 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF length(v_name) > 200 THEN RAISE EXCEPTION 'name_too_long'; END IF;

  -- Validate reason_code
  IF p_reason_code IS NULL OR length(trim(p_reason_code)) = 0 THEN RAISE EXCEPTION 'reason_code_required'; END IF;

  -- Validate site belongs to enterprise (if provided)
  IF p_site_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.enterprise_sites
      WHERE id = p_site_id AND enterprise_id = p_enterprise_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'site_not_found_or_inactive';
    END IF;
  END IF;

  INSERT INTO public.enterprise_automation_rules
    (enterprise_id, site_id, name, signal_type, action_type,
     urgency_filter, threshold_minutes, severity, reason_code, created_by)
  VALUES
    (p_enterprise_id, p_site_id, v_name, p_signal_type, p_action_type,
     p_urgency_filter, p_threshold_minutes, p_severity, p_reason_code, auth.uid())
  RETURNING id INTO v_rule_id;

  -- Audit
  PERFORM fixeo_private._eal_append(
    p_enterprise_id, auth.uid(), 'automation_executed',
    'enterprise_automation_rule', v_rule_id,
    jsonb_build_object(
      'action', 'rule_created',
      'signal_type', p_signal_type,
      'action_type', p_action_type
    )
  );

  RETURN jsonb_build_object('ok', true, 'rule_id', v_rule_id);
END; $$;
REVOKE ALL ON FUNCTION public.create_automation_rule FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_automation_rule TO authenticated;

-- ============================================================
-- BLOCK 9 — RPC: set_automation_rule_active
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_automation_rule_active(
  p_rule_id uuid,
  p_active  boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_enterprise_id uuid;
  v_role          text;
BEGIN
  SELECT enterprise_id INTO v_enterprise_id
  FROM public.enterprise_automation_rules
  WHERE id = p_rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  v_role := fixeo_private._bp15_check_automation_manager(v_enterprise_id);

  UPDATE public.enterprise_automation_rules
  SET active = p_active, updated_at = now()
  WHERE id = p_rule_id;

  -- Audit
  PERFORM fixeo_private._eal_append(
    v_enterprise_id, auth.uid(), 'automation_executed',
    'enterprise_automation_rule', p_rule_id,
    jsonb_build_object('action', CASE WHEN p_active THEN 'rule_activated' ELSE 'rule_deactivated' END)
  );

  RETURN jsonb_build_object('ok', true, 'rule_id', p_rule_id, 'active', p_active);
END; $$;
REVOKE ALL ON FUNCTION public.set_automation_rule_active FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_automation_rule_active TO authenticated;

-- ============================================================
-- BLOCK 10 — RPC: list_automation_rules
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_automation_rules(
  p_enterprise_id uuid,
  p_active_only   boolean DEFAULT false
) RETURNS TABLE (
  id               uuid,
  enterprise_id    uuid,
  site_id          uuid,
  site_name        text,
  name             text,
  signal_type      text,
  action_type      text,
  urgency_filter   text,
  threshold_minutes integer,
  severity         text,
  reason_code      text,
  active           boolean,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role text;
BEGIN
  v_role := fixeo_private._bp15_check_automation_reader(p_enterprise_id);

  RETURN QUERY
  SELECT
    r.id, r.enterprise_id, r.site_id, es.name AS site_name,
    r.name, r.signal_type, r.action_type,
    r.urgency_filter, r.threshold_minutes, r.severity,
    r.reason_code, r.active, r.created_at, r.updated_at
  FROM public.enterprise_automation_rules r
  LEFT JOIN public.enterprise_sites es ON es.id = r.site_id
  WHERE r.enterprise_id = p_enterprise_id
    AND (NOT p_active_only OR r.active = true)
    -- site_manager: only rules for assigned sites or enterprise-wide
    AND (
      v_role NOT IN ('site_manager')
      OR r.site_id IS NULL
      OR r.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id))
    )
  ORDER BY r.created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.list_automation_rules FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_automation_rules TO authenticated;

-- ============================================================
-- BLOCK 11 — RPC: evaluate_enterprise_automations
-- Core evaluator. Called by authenticated manager-level member.
-- Returns bounded structured results.
--
-- CALLER CONTRACT:
--   Requires role IN ('owner','admin','operations_manager').
--   V1: NOT for background/daemon use. Future cron uses service-role bypass.
--
-- IDEMPOTENCY:
--   1. Ledger check (idx_eae_idempotency) prevents re-execution without
--      querying live signal state on repeat calls.
--   2. Pre-insert SELECT on enterprise_escalations catches already-open cases.
--   3. ee_unique_active_escalation partial unique index (BP13) is the final
--      concurrency guard; unique_violation is caught and logged as 'skipped'.
--
-- PERIOD BOUND:
--   All signal queries are bounded (LIMIT 100 per rule, hard row cap = p_limit).
--   No unbounded full-table scans. Terminal statuses excluded.
-- ============================================================

CREATE OR REPLACE FUNCTION public.evaluate_enterprise_automations(
  p_enterprise_id uuid,
  p_limit         integer DEFAULT 50
) RETURNS TABLE (
  rule_id       uuid,
  rule_name     text,
  signal_type   text,
  action_type   text,
  signal_key    text,
  outcome       text,   -- 'executed' | 'skipped' | 'error'
  escalation_id uuid,
  detail        text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role    text;
  v_limit   integer := LEAST(GREATEST(p_limit, 1), 200);
  v_rule    record;
  v_req     record;
  v_esc     record;
  v_sig_key text;
  v_esc_id  uuid;
  v_outcome text;
  v_detail  text;
  v_rows    integer := 0;
BEGIN
  -- Auth: caller must be at minimum operations_manager
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT em.role INTO v_role
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = auth.uid()
    AND em.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enterprise_member'; END IF;
  IF v_role NOT IN ('owner', 'admin', 'operations_manager') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Iterate active rules (bounded by v_limit)
  FOR v_rule IN
    SELECT r.*
    FROM public.enterprise_automation_rules r
    WHERE r.enterprise_id = p_enterprise_id
      AND r.active = true
    ORDER BY r.created_at ASC
    LIMIT v_limit
  LOOP

    -- ── SIGNAL: sla_breached ──────────────────────────────────────────────
    IF v_rule.signal_type = 'sla_breached' THEN
      FOR v_req IN
        SELECT sla.request_id, sla.site_id, sla.sla_state
        FROM public.enterprise_sla_status sla
        JOIN public.enterprise_request_context erc
          ON erc.service_request_id = sla.request_id
         AND erc.enterprise_id = p_enterprise_id
        WHERE sla.enterprise_id = p_enterprise_id
          AND sla.sla_state = 'breached'
          -- Site scoping
          AND (v_rule.site_id IS NULL OR sla.site_id = v_rule.site_id)
          -- Exclude terminal requests
          AND sla.request_status NOT IN ('validated', 'cancelled', 'no_match')
          -- Urgency filter
          AND (v_rule.urgency_filter IS NULL OR sla.urgency = v_rule.urgency_filter)
        LIMIT 100  -- inner limit per rule evaluation
      LOOP
        v_rows    := v_rows + 1;
        v_sig_key := 'sla_breached:' || v_req.request_id::text || ':' || v_rule.id::text;
        v_esc_id  := NULL;
        v_outcome := 'skipped';
        v_detail  := '';

        -- Check idempotency ledger
        IF EXISTS (
          SELECT 1 FROM public.enterprise_automation_executions
          WHERE rule_id   = v_rule.id
            AND signal_key = v_sig_key
            AND outcome    = 'executed'
        ) THEN
          v_outcome := 'skipped';
          v_detail  := 'already_executed';
        ELSE
          BEGIN
            -- Pre-check: active escalation already exists for this reason_code?
            SELECT id INTO v_esc_id
            FROM public.enterprise_escalations
            WHERE enterprise_id      = p_enterprise_id
              AND service_request_id = v_req.request_id
              AND reason_code        = v_rule.reason_code
              AND status IN ('open', 'acknowledged');

            IF FOUND THEN
              v_outcome := 'skipped';
              v_detail  := 'escalation_already_active';
            ELSE
              -- Open escalation inline (SECURITY DEFINER; ee_unique_active_escalation is final guard)
              INSERT INTO public.enterprise_escalations
                (enterprise_id, service_request_id, site_id, severity, reason_code, status, opened_by)
              VALUES
                (p_enterprise_id, v_req.request_id,
                 COALESCE(v_rule.site_id, v_req.site_id),
                 v_rule.severity, v_rule.reason_code, 'open', auth.uid())
              RETURNING id INTO v_esc_id;

              -- Audit
              PERFORM fixeo_private._eal_append(
                p_enterprise_id, auth.uid(), 'automation_executed',
                'enterprise_escalation', v_esc_id,
                jsonb_build_object(
                  'rule_id',            v_rule.id,
                  'signal_type',        'sla_breached',
                  'action_type',        'open_escalation',
                  'service_request_id', v_req.request_id
                )
              );

              -- Ledger (idempotency record)
              INSERT INTO public.enterprise_automation_executions
                (rule_id, enterprise_id, signal_type, signal_key, action_type,
                 outcome, escalation_id, metadata)
              VALUES
                (v_rule.id, p_enterprise_id, 'sla_breached', v_sig_key, 'open_escalation',
                 'executed', v_esc_id,
                 jsonb_build_object('service_request_id', v_req.request_id))
              ON CONFLICT (rule_id, signal_key) WHERE outcome = 'executed' DO NOTHING;

              v_outcome := 'executed';
              v_detail  := 'escalation_opened';
            END IF;

          EXCEPTION
            WHEN unique_violation THEN
              v_outcome := 'skipped';
              v_detail  := 'concurrent_duplicate_prevented';
            WHEN OTHERS THEN
              v_outcome := 'error';
              v_detail  := 'execution_error';
              -- Record error in ledger (non-unique; no conflict expected)
              INSERT INTO public.enterprise_automation_executions
                (rule_id, enterprise_id, signal_type, signal_key, action_type,
                 outcome, metadata)
              VALUES
                (v_rule.id, p_enterprise_id, 'sla_breached', v_sig_key, 'open_escalation',
                 'error', jsonb_build_object('error', 'execution_failed'))
              ON CONFLICT DO NOTHING;
          END;
        END IF;

        -- Populate output columns before RETURN NEXT
        rule_id       := v_rule.id;
        rule_name     := v_rule.name;
        signal_type   := v_rule.signal_type;
        action_type   := v_rule.action_type;
        signal_key    := v_sig_key;
        outcome       := v_outcome;
        escalation_id := v_esc_id;
        detail        := v_detail;
        RETURN NEXT;
      END LOOP;

    -- ── SIGNAL: urgent_unattended ─────────────────────────────────────────
    ELSIF v_rule.signal_type = 'urgent_unattended' THEN
      FOR v_req IN
        SELECT erc.service_request_id, erc.site_id, sr.urgency, sr.status, sr.created_at
        FROM public.enterprise_request_context erc
        JOIN public.service_requests sr ON sr.id = erc.service_request_id
        WHERE erc.enterprise_id = p_enterprise_id
          AND sr.urgency IN ('urgent', 'now')
          AND (v_rule.urgency_filter IS NULL OR sr.urgency = v_rule.urgency_filter)
          AND sr.status IN ('new', 'assigned')
          AND sr.status NOT IN ('validated', 'cancelled', 'no_match')
          AND (v_rule.site_id IS NULL OR erc.site_id = v_rule.site_id)
          -- Threshold: unattended for at least threshold_minutes (NULL = immediate)
          AND (
            v_rule.threshold_minutes IS NULL
            OR sr.created_at <= now() - (v_rule.threshold_minutes || ' minutes')::interval
          )
          -- No active mission
          AND NOT EXISTS (
            SELECT 1 FROM public.missions m
            WHERE m.request_id = sr.id::text
              AND m.status IN ('accepted', 'started')
          )
        LIMIT 100
      LOOP
        v_rows    := v_rows + 1;
        v_sig_key := 'urgent_unattended:' || v_req.service_request_id::text || ':' || v_rule.id::text;
        v_esc_id  := NULL;
        v_outcome := 'skipped';
        v_detail  := '';

        IF EXISTS (
          SELECT 1 FROM public.enterprise_automation_executions
          WHERE rule_id    = v_rule.id
            AND signal_key = v_sig_key
            AND outcome    = 'executed'
        ) THEN
          v_outcome := 'skipped';
          v_detail  := 'already_executed';
        ELSE
          BEGIN
            SELECT id INTO v_esc_id
            FROM public.enterprise_escalations
            WHERE enterprise_id      = p_enterprise_id
              AND service_request_id = v_req.service_request_id
              AND reason_code        = v_rule.reason_code
              AND status IN ('open', 'acknowledged');

            IF FOUND THEN
              v_outcome := 'skipped';
              v_detail  := 'escalation_already_active';
            ELSE
              INSERT INTO public.enterprise_escalations
                (enterprise_id, service_request_id, site_id, severity, reason_code, status, opened_by)
              VALUES
                (p_enterprise_id, v_req.service_request_id,
                 COALESCE(v_rule.site_id, v_req.site_id),
                 v_rule.severity, v_rule.reason_code, 'open', auth.uid())
              RETURNING id INTO v_esc_id;

              PERFORM fixeo_private._eal_append(
                p_enterprise_id, auth.uid(), 'automation_executed',
                'enterprise_escalation', v_esc_id,
                jsonb_build_object(
                  'rule_id',            v_rule.id,
                  'signal_type',        'urgent_unattended',
                  'action_type',        'open_escalation',
                  'service_request_id', v_req.service_request_id
                )
              );

              INSERT INTO public.enterprise_automation_executions
                (rule_id, enterprise_id, signal_type, signal_key, action_type,
                 outcome, escalation_id, metadata)
              VALUES
                (v_rule.id, p_enterprise_id, 'urgent_unattended', v_sig_key, 'open_escalation',
                 'executed', v_esc_id,
                 jsonb_build_object('service_request_id', v_req.service_request_id))
              ON CONFLICT (rule_id, signal_key) WHERE outcome = 'executed' DO NOTHING;

              v_outcome := 'executed';
              v_detail  := 'escalation_opened';
            END IF;
          EXCEPTION
            WHEN unique_violation THEN
              v_outcome := 'skipped';
              v_detail  := 'concurrent_duplicate_prevented';
            WHEN OTHERS THEN
              v_outcome := 'error';
              v_detail  := 'execution_error';
          END;
        END IF;

        rule_id       := v_rule.id;
        rule_name     := v_rule.name;
        signal_type   := v_rule.signal_type;
        action_type   := v_rule.action_type;
        signal_key    := v_sig_key;
        outcome       := v_outcome;
        escalation_id := v_esc_id;
        detail        := v_detail;
        RETURN NEXT;
      END LOOP;

    -- ── SIGNAL: escalation_unacknowledged ────────────────────────────────
    -- BP13 has no severity-change RPC. V1 action: open a NEW escalation with
    -- reason_code = rule.reason_code (recommended default: 'auto_escalated').
    -- The ee_unique_active_escalation index (enterprise_id, service_request_id,
    -- reason_code) WHERE status IN ('open','acknowledged') prevents duplicates
    -- for the same reason_code+request tuple.
    -- V1 KNOWN LIMITATION: no in-place severity upgrade of the source escalation.
    ELSIF v_rule.signal_type = 'escalation_unacknowledged' THEN
      FOR v_esc IN
        SELECT e.id AS esc_id, e.service_request_id, e.site_id,
               e.severity, e.opened_at, e.enterprise_id
        FROM public.enterprise_escalations e
        WHERE e.enterprise_id = p_enterprise_id
          AND e.status = 'open'
          AND (v_rule.site_id IS NULL OR e.site_id = v_rule.site_id)
          -- threshold_minutes is REQUIRED for this signal; skip if not set
          AND (
            v_rule.threshold_minutes IS NOT NULL
            AND e.opened_at <= now() - (v_rule.threshold_minutes || ' minutes')::interval
          )
          -- Exclude terminal requests
          AND EXISTS (
            SELECT 1 FROM public.service_requests sr
            WHERE sr.id = e.service_request_id
              AND sr.status NOT IN ('validated', 'cancelled', 'no_match')
          )
        LIMIT 100
      LOOP
        v_rows    := v_rows + 1;
        v_sig_key := 'escalation_unacknowledged:' || v_esc.esc_id::text || ':' || v_rule.id::text;
        v_esc_id  := NULL;
        v_outcome := 'skipped';
        v_detail  := '';

        IF EXISTS (
          SELECT 1 FROM public.enterprise_automation_executions
          WHERE rule_id    = v_rule.id
            AND signal_key = v_sig_key
            AND outcome    = 'executed'
        ) THEN
          v_outcome := 'skipped';
          v_detail  := 'already_executed';
        ELSE
          BEGIN
            -- Check if a same-reason_code escalation already exists for this request
            SELECT id INTO v_esc_id
            FROM public.enterprise_escalations
            WHERE enterprise_id      = p_enterprise_id
              AND service_request_id = v_esc.service_request_id
              AND reason_code        = v_rule.reason_code
              AND status IN ('open', 'acknowledged');

            IF FOUND THEN
              v_outcome := 'skipped';
              v_detail  := 'escalation_already_active';
            ELSE
              INSERT INTO public.enterprise_escalations
                (enterprise_id, service_request_id, site_id, severity, reason_code, status, opened_by)
              VALUES
                (p_enterprise_id, v_esc.service_request_id,
                 COALESCE(v_rule.site_id, v_esc.site_id),
                 v_rule.severity, v_rule.reason_code, 'open', auth.uid())
              RETURNING id INTO v_esc_id;

              PERFORM fixeo_private._eal_append(
                p_enterprise_id, auth.uid(), 'automation_executed',
                'enterprise_escalation', v_esc_id,
                jsonb_build_object(
                  'rule_id',              v_rule.id,
                  'signal_type',          'escalation_unacknowledged',
                  'action_type',          'open_escalation',
                  'source_escalation_id', v_esc.esc_id,
                  'service_request_id',   v_esc.service_request_id
                )
              );

              INSERT INTO public.enterprise_automation_executions
                (rule_id, enterprise_id, signal_type, signal_key, action_type,
                 outcome, escalation_id, metadata)
              VALUES
                (v_rule.id, p_enterprise_id, 'escalation_unacknowledged', v_sig_key, 'open_escalation',
                 'executed', v_esc_id,
                 jsonb_build_object(
                   'source_escalation_id', v_esc.esc_id,
                   'service_request_id',   v_esc.service_request_id
                 ))
              ON CONFLICT (rule_id, signal_key) WHERE outcome = 'executed' DO NOTHING;

              v_outcome := 'executed';
              v_detail  := 'escalation_opened';
            END IF;
          EXCEPTION
            WHEN unique_violation THEN
              v_outcome := 'skipped';
              v_detail  := 'concurrent_duplicate_prevented';
            WHEN OTHERS THEN
              v_outcome := 'error';
              v_detail  := 'execution_error';
          END;
        END IF;

        rule_id       := v_rule.id;
        rule_name     := v_rule.name;
        signal_type   := v_rule.signal_type;
        action_type   := v_rule.action_type;
        signal_key    := v_sig_key;
        outcome       := v_outcome;
        escalation_id := v_esc_id;
        detail        := v_detail;
        RETURN NEXT;
      END LOOP;
    END IF;

    -- Hard limit: stop if we've processed too many rows across all rules
    IF v_rows >= v_limit THEN EXIT; END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.evaluate_enterprise_automations FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.evaluate_enterprise_automations TO authenticated;

-- ============================================================
-- BLOCK 12 — RPC: list_automation_executions
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_automation_executions(
  p_enterprise_id uuid,
  p_limit         integer DEFAULT 50
) RETURNS TABLE (
  id            uuid,
  rule_id       uuid,
  rule_name     text,
  signal_type   text,
  action_type   text,
  signal_key    text,
  outcome       text,
  escalation_id uuid,
  metadata      jsonb,
  executed_at   timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  v_role := fixeo_private._bp15_check_automation_reader(p_enterprise_id);

  RETURN QUERY
  SELECT ex.id, ex.rule_id, r.name AS rule_name,
         ex.signal_type, ex.action_type, ex.signal_key,
         ex.outcome, ex.escalation_id, ex.metadata, ex.executed_at
  FROM public.enterprise_automation_executions ex
  JOIN public.enterprise_automation_rules r ON r.id = ex.rule_id
  WHERE ex.enterprise_id = p_enterprise_id
    AND (
      v_role NOT IN ('site_manager')
      OR r.site_id IS NULL
      OR r.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id))
    )
  ORDER BY ex.executed_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END; $$;
REVOKE ALL ON FUNCTION public.list_automation_executions FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_automation_executions TO authenticated;

-- ============================================================
-- BLOCK 13 — Comments + COMMIT
-- ============================================================

COMMENT ON TABLE public.enterprise_automation_rules IS
  'BP15: Enterprise automation rules. signal_type and action_type are strict enums. '
  'No arbitrary SQL or code. Rules are data.';

COMMENT ON TABLE public.enterprise_automation_executions IS
  'BP15: Immutable automation execution ledger. Append-only. '
  'Idempotency: unique index on (rule_id, signal_key) WHERE outcome=executed.';

COMMENT ON FUNCTION public.evaluate_enterprise_automations IS
  'BP15: Evaluate active automation rules for an enterprise. '
  'Caller must be owner/admin/operations_manager. Bounded by p_limit (max 200). '
  'Idempotent: repeated evaluation is safe. Concurrency: unique_violation caught. '
  'V1: called by authenticated manager only — not for background/daemon use.';

COMMIT;
