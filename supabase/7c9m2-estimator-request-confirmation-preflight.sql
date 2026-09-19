-- ============================================================
-- FIXEO — 7C.9M.2 Estimator Request Confirmation — PRE-FLIGHT
-- File: supabase/7c9m2-estimator-request-confirmation-preflight.sql
--
-- READ-ONLY ONLY.
-- ZERO INSERT / UPDATE / DELETE / DDL.
--
-- PURPOSE
-- -------
-- Validate production prerequisites before introducing the
-- server-only atomic confirmation RPC for the estimator flow:
--
-- verified pricing context
--   -> mandatory client phone
--   -> canonical service_request
--   -> guest tracking credentials
--   -> estimator context binding
--   -> FIXEO dispatch handoff
--
-- The future 7C.9M.2 migration MUST NOT be executed unless every
-- blocking check below returns PASS.
-- ============================================================

WITH
ecr AS (
  SELECT pg_catalog.to_regclass('public.estimator_context_redemptions') AS rel
),
sr AS (
  SELECT pg_catalog.to_regclass('public.service_requests') AS rel
),
ecr_columns AS (
  SELECT
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'estimator_context_redemptions'
),
sr_columns AS (
  SELECT
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'service_requests'
),
checks AS (

  SELECT
    'P01'::text AS check_id,
    'estimator_context_redemptions exists'::text AS check_name,
    CASE WHEN (SELECT rel FROM ecr) IS NOT NULL
      THEN 'PASS' ELSE 'FAIL' END AS result,
    pg_catalog.jsonb_build_object(
      'relation',
      COALESCE((SELECT rel::text FROM ecr), 'missing')
    ) AS evidence

  UNION ALL

  SELECT
    'P02',
    'service_requests exists',
    CASE WHEN (SELECT rel FROM sr) IS NOT NULL
      THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'relation',
      COALESCE((SELECT rel::text FROM sr), 'missing')
    )

  UNION ALL

  SELECT
    'P03',
    'estimator service_request_id is nullable uuid',
    CASE WHEN EXISTS (
      SELECT 1
      FROM ecr_columns
      WHERE column_name = 'service_request_id'
        AND udt_name = 'uuid'
        AND is_nullable = 'YES'
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_build_object(
          'data_type', data_type,
          'udt_name', udt_name,
          'is_nullable', is_nullable
        )
        FROM ecr_columns
        WHERE column_name = 'service_request_id'
        LIMIT 1
      ),
      '{"column_present":false}'::jsonb
    )

  UNION ALL

  SELECT
    'P04',
    'estimator service_request FK exists',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid =
        pg_catalog.to_regclass('public.estimator_context_redemptions')
        AND con.conname =
          'estimator_context_redemptions_service_request_fk'
        AND con.contype = 'f'
        AND pg_catalog.pg_get_constraintdef(con.oid)
          ILIKE '%REFERENCES service_requests(id) ON DELETE RESTRICT%'
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_build_object(
          'constraint_name', con.conname,
          'definition', pg_catalog.pg_get_constraintdef(con.oid)
        )
        FROM pg_catalog.pg_constraint con
        WHERE con.conrelid =
          pg_catalog.to_regclass('public.estimator_context_redemptions')
          AND con.conname =
            'estimator_context_redemptions_service_request_fk'
        LIMIT 1
      ),
      '{"constraint_present":false}'::jsonb
    )

  UNION ALL

  SELECT
    'P05',
    'service_request binding unique index exists',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = 'estimator_context_redemptions'
        AND i.indexname =
          'estimator_context_redemptions_service_request_id_unique'
        AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
        AND i.indexdef ILIKE '%service_request_id%'
        AND i.indexdef ILIKE '%WHERE (service_request_id IS NOT NULL)%'
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_build_object(
          'index', i.indexname,
          'indexdef', i.indexdef
        )
        FROM pg_catalog.pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'estimator_context_redemptions'
          AND i.indexname =
            'estimator_context_redemptions_service_request_id_unique'
        LIMIT 1
      ),
      '{"index_present":false}'::jsonb
    )

  UNION ALL

  SELECT
    'P06',
    'estimator canonical identity columns intact',
    CASE WHEN (
      SELECT COUNT(*)
      FROM ecr_columns
      WHERE
        (column_name = 'context_id'   AND udt_name = 'text' AND is_nullable = 'NO')
        OR
        (column_name = 'outcome_type' AND udt_name = 'text' AND is_nullable = 'NO')
        OR
        (column_name = 'service_code' AND udt_name = 'text' AND is_nullable = 'NO')
        OR
        (column_name = 'session_id'   AND udt_name = 'text' AND is_nullable = 'NO')
        OR
        (column_name = 'amount_mad'   AND udt_name = 'int4' AND is_nullable = 'NO')
        OR
        (column_name = 'state'        AND udt_name = 'text' AND is_nullable = 'NO')
    ) = 6 THEN 'PASS' ELSE 'FAIL' END,
    (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'column', column_name,
          'udt_name', udt_name,
          'is_nullable', is_nullable
        )
        ORDER BY column_name
      )
      FROM ecr_columns
      WHERE column_name IN (
        'context_id','outcome_type','service_code',
        'session_id','amount_mad','state'
      )
    )

  UNION ALL

  SELECT
    'P07',
    'service_requests estimator handoff columns present',
    CASE WHEN (
      SELECT COUNT(DISTINCT column_name)
      FROM sr_columns
      WHERE column_name IN (
        'id',
        'service_category',
        'city',
        'description',
        'client_phone',
        'urgency',
        'status',
        'idempotency_key',
        'tracking_ref',
        'guest_token_hash',
        'created_at'
      )
    ) = 11 THEN 'PASS' ELSE 'FAIL' END,
    (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'column', column_name,
          'udt_name', udt_name,
          'is_nullable', is_nullable,
          'default', column_default
        )
        ORDER BY column_name
      )
      FROM sr_columns
      WHERE column_name IN (
        'id',
        'service_category',
        'city',
        'description',
        'client_phone',
        'urgency',
        'status',
        'idempotency_key',
        'tracking_ref',
        'guest_token_hash',
        'created_at'
      )
    )

  UNION ALL

  SELECT
    'P08',
    'service_requests id is uuid primary key',
    CASE WHEN
      EXISTS (
        SELECT 1
        FROM sr_columns
        WHERE column_name = 'id'
          AND udt_name = 'uuid'
          AND is_nullable = 'NO'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        WHERE con.conrelid =
          pg_catalog.to_regclass('public.service_requests')
          AND con.contype = 'p'
          AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%PRIMARY KEY (id)%'
      )
    THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'column',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_build_object(
            'udt_name', udt_name,
            'is_nullable', is_nullable,
            'default', column_default
          )
          FROM sr_columns
          WHERE column_name = 'id'
          LIMIT 1
        ),
        '{}'::jsonb
      ),
      'primary_key',
      COALESCE(
        (
          SELECT pg_catalog.pg_get_constraintdef(con.oid)
          FROM pg_catalog.pg_constraint con
          WHERE con.conrelid =
            pg_catalog.to_regclass('public.service_requests')
            AND con.contype = 'p'
          LIMIT 1
        ),
        'missing'
      )
    )

  UNION ALL

  SELECT
    'P09',
    'service_requests status allows new',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid =
        pg_catalog.to_regclass('public.service_requests')
        AND con.contype = 'c'
        AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%status%'
        AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%new%'
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'constraint_name', con.conname,
            'definition', pg_catalog.pg_get_constraintdef(con.oid)
          )
        )
        FROM pg_catalog.pg_constraint con
        WHERE con.conrelid =
          pg_catalog.to_regclass('public.service_requests')
          AND con.contype = 'c'
          AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%status%'
      ),
      '[]'::jsonb
    )

  UNION ALL

  SELECT
    'P10',
    'service_requests urgency allows normale',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid =
        pg_catalog.to_regclass('public.service_requests')
        AND con.contype = 'c'
        AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%urgency%'
        AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%normale%'
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'constraint_name', con.conname,
            'definition', pg_catalog.pg_get_constraintdef(con.oid)
          )
        )
        FROM pg_catalog.pg_constraint con
        WHERE con.conrelid =
          pg_catalog.to_regclass('public.service_requests')
          AND con.contype = 'c'
          AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%urgency%'
      ),
      '[]'::jsonb
    )

  UNION ALL

  SELECT
    'P11',
    'service_requests idempotency unique index exists',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = 'service_requests'
        AND i.indexname = 'service_requests_idempotency_key_unique'
        AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
        AND i.indexdef ILIKE '%WHERE (idempotency_key IS NOT NULL)%'
    ) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      (
        SELECT pg_catalog.jsonb_build_object(
          'index', i.indexname,
          'indexdef', i.indexdef
        )
        FROM pg_catalog.pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'service_requests'
          AND i.indexname = 'service_requests_idempotency_key_unique'
        LIMIT 1
      ),
      '{"index_present":false}'::jsonb
    )

  UNION ALL

  SELECT
    'P12',
    'confirm_estimator_request_v1 name is free',
    CASE WHEN NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'confirm_estimator_request_v1'
    ) THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'existing_overloads',
      (
        SELECT COUNT(*)
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n
          ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'confirm_estimator_request_v1'
      )
    )

  UNION ALL

  SELECT
    'P13',
    'service_role required table privileges present',
    CASE WHEN
      pg_catalog.has_table_privilege(
        'service_role',
        'public.estimator_context_redemptions',
        'SELECT,INSERT,UPDATE'
      )
      AND pg_catalog.has_table_privilege(
        'service_role',
        'public.service_requests',
        'SELECT,INSERT,UPDATE'
      )
    THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'ecr_select',
      pg_catalog.has_table_privilege(
        'service_role','public.estimator_context_redemptions','SELECT'
      ),
      'ecr_insert',
      pg_catalog.has_table_privilege(
        'service_role','public.estimator_context_redemptions','INSERT'
      ),
      'ecr_update',
      pg_catalog.has_table_privilege(
        'service_role','public.estimator_context_redemptions','UPDATE'
      ),
      'sr_select',
      pg_catalog.has_table_privilege(
        'service_role','public.service_requests','SELECT'
      ),
      'sr_insert',
      pg_catalog.has_table_privilege(
        'service_role','public.service_requests','INSERT'
      ),
      'sr_update',
      pg_catalog.has_table_privilege(
        'service_role','public.service_requests','UPDATE'
      )
    )

  UNION ALL

  SELECT
    'P14',
    'browser roles cannot write estimator redemptions',
    CASE WHEN
      NOT pg_catalog.has_table_privilege(
        'anon','public.estimator_context_redemptions','INSERT'
      )
      AND NOT pg_catalog.has_table_privilege(
        'anon','public.estimator_context_redemptions','UPDATE'
      )
      AND NOT pg_catalog.has_table_privilege(
        'anon','public.estimator_context_redemptions','DELETE'
      )
      AND NOT pg_catalog.has_table_privilege(
        'authenticated','public.estimator_context_redemptions','INSERT'
      )
      AND NOT pg_catalog.has_table_privilege(
        'authenticated','public.estimator_context_redemptions','UPDATE'
      )
      AND NOT pg_catalog.has_table_privilege(
        'authenticated','public.estimator_context_redemptions','DELETE'
      )
    THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'anon_insert',
      pg_catalog.has_table_privilege(
        'anon','public.estimator_context_redemptions','INSERT'
      ),
      'anon_update',
      pg_catalog.has_table_privilege(
        'anon','public.estimator_context_redemptions','UPDATE'
      ),
      'anon_delete',
      pg_catalog.has_table_privilege(
        'anon','public.estimator_context_redemptions','DELETE'
      ),
      'authenticated_insert',
      pg_catalog.has_table_privilege(
        'authenticated','public.estimator_context_redemptions','INSERT'
      ),
      'authenticated_update',
      pg_catalog.has_table_privilege(
        'authenticated','public.estimator_context_redemptions','UPDATE'
      ),
      'authenticated_delete',
      pg_catalog.has_table_privilege(
        'authenticated','public.estimator_context_redemptions','DELETE'
      )
    )

  UNION ALL

  SELECT
    'P15',
    'no unexpected estimator request bindings exist',
    CASE WHEN (
      SELECT COUNT(*)
      FROM public.estimator_context_redemptions
      WHERE service_request_id IS NOT NULL
    ) = 0 THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'total_rows',
      (
        SELECT COUNT(*)
        FROM public.estimator_context_redemptions
      ),
      'bound_rows',
      (
        SELECT COUNT(*)
        FROM public.estimator_context_redemptions
        WHERE service_request_id IS NOT NULL
      ),
      'acquired',
      (
        SELECT COUNT(*)
        FROM public.estimator_context_redemptions
        WHERE state = 'acquired'
      ),
      'committed',
      (
        SELECT COUNT(*)
        FROM public.estimator_context_redemptions
        WHERE state = 'committed'
      ),
      'failed',
      (
        SELECT COUNT(*)
        FROM public.estimator_context_redemptions
        WHERE state = 'failed'
      )
    )

  UNION ALL

  SELECT
    'P16',
    'dispatch_request_v1 exists',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'dispatch_request_v1'
    ) THEN 'PASS' ELSE 'FAIL' END,
    pg_catalog.jsonb_build_object(
      'overloads',
      (
        SELECT COUNT(*)
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n
          ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'dispatch_request_v1'
      )
    )
)

SELECT
  check_id,
  check_name,
  result,
  evidence
FROM checks
ORDER BY check_id;
