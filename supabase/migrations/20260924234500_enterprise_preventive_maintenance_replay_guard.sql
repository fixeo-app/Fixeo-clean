-- FIXEO ENTERPRISE — BLOCK C FINAL HARDENING
-- Replay/idempotence guard for preventive maintenance scheduler only.
BEGIN;

DO $guard$
BEGIN
  IF pg_catalog.to_regprocedure('public.run_enterprise_maintenance_scheduler_v1()') IS NULL THEN
    RAISE EXCEPTION 'BLOCK C hardening abort: scheduler missing';
  END IF;

  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.run_enterprise_maintenance_scheduler_v1()'::pg_catalog.regprocedure
     )) <> '229eff1a5621228eb236f71119a57f68'
  THEN
    RAISE EXCEPTION 'BLOCK C hardening abort: scheduler drift';
  END IF;

  IF pg_catalog.to_regclass('public.enterprise_maintenance_runs') IS NULL
     OR pg_catalog.to_regclass('public.enterprise_maintenance_plans') IS NULL
  THEN
    RAISE EXCEPTION 'BLOCK C hardening abort: maintenance tables missing';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.run_enterprise_maintenance_scheduler_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_plan record;
  v_run_id uuid;
  v_result jsonb;
  v_next_due timestamptz;
  v_generated integer := 0;
  v_failed integer := 0;
BEGIN
  FOR v_plan IN
    SELECT p.*
    FROM public.enterprise_maintenance_plans p
    WHERE p.status='active'
      AND p.next_due_at<=now()
    ORDER BY p.next_due_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.enterprise_maintenance_runs(
      enterprise_id,plan_id,due_at,status,created_at,updated_at
    )
    VALUES(
      v_plan.enterprise_id,v_plan.id,v_plan.next_due_at,'processing',now(),now()
    )
    ON CONFLICT (plan_id,due_at)
    DO UPDATE SET updated_at=now()
    RETURNING id INTO v_run_id;

    IF EXISTS (
      SELECT 1
      FROM public.enterprise_maintenance_runs r
      WHERE r.id=v_run_id
        AND r.status='generated'
        AND r.service_request_id IS NOT NULL
    ) THEN
      v_next_due := fixeo_private._fixeo_next_maintenance_due(
        v_plan.next_due_at,v_plan.frequency,v_plan.interval_count
      );
      UPDATE public.enterprise_maintenance_plans
      SET next_due_at=v_next_due,updated_at=now()
      WHERE id=v_plan.id;
      CONTINUE;
    END IF;

    UPDATE public.enterprise_maintenance_runs
    SET status='processing',error_code=NULL,updated_at=now()
    WHERE id=v_run_id;

    SELECT fixeo_private._fixeo_generate_maintenance_request_v1(
      v_plan.id,
      v_plan.next_due_at
    )
    INTO v_result;

    IF COALESCE((v_result->>'ok')::boolean,false) THEN
      UPDATE public.enterprise_maintenance_runs
      SET service_request_id=(v_result->>'service_request_id')::uuid,
          status='generated',
          generated_at=now(),
          error_code=NULL,
          updated_at=now()
      WHERE id=v_run_id;

      v_next_due := fixeo_private._fixeo_next_maintenance_due(
        v_plan.next_due_at,v_plan.frequency,v_plan.interval_count
      );

      UPDATE public.enterprise_maintenance_plans
      SET next_due_at=v_next_due,
          updated_at=now()
      WHERE id=v_plan.id;

      v_generated := v_generated+1;
    ELSE
      UPDATE public.enterprise_maintenance_runs
      SET status='failed',
          error_code=COALESCE(v_result->>'reason','generation_failed'),
          updated_at=now()
      WHERE id=v_run_id;

      v_failed := v_failed+1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'generated',v_generated,
    'failed',v_failed
  );
END;
$function$;

COMMIT;
