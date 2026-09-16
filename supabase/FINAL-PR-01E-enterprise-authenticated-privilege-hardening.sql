-- =============================================================================
-- FIXEO — FINAL-PR-01E v3
-- ENTERPRISE AUTHENTICATED PRIVILEGE HARDENING
-- CANDIDATE PRODUCTION MIGRATION
--
-- STATUS
--   CANDIDATE ONLY — DO NOT APPLY TO PRODUCTION YET.
--
-- SCOPE
--   public.enterprise_leads
--   public.enterprise_members
--   public.enterprise_request_sla
--   public.enterprise_sla_policies
--
-- PURPOSE
--   Remove unnecessary administrative / structural table privileges from
--   authenticated while preserving the verified effective application
--   privilege surface.
--
-- PRIVILEGES REMOVED FROM authenticated
--   MAINTAIN
--   REFERENCES
--   TRIGGER
--   TRUNCATE
--
-- EXPLICIT NON-CHANGES
--   - No SELECT / INSERT / UPDATE / DELETE privilege mutation.
--   - No service_role privilege mutation.
--   - No postgres privilege mutation.
--   - No RLS / policy changes.
--   - No function / RPC changes.
--   - No trigger changes.
--   - No schema changes.
--   - No data changes.
--
-- EVIDENCE GATES
--   FINAL-PR-01B — privilege necessity audit.
--   FINAL-PR-01C — final dependency precheck.
--   FINAL-PR-01D — pre-hardening production-state confirmation.
--
-- VERIFIED TARGET ACL BASELINE
--   For each target table / target privilege pair:
--     grantor      = postgres
--     grantee      = authenticated
--     is_grantable = false
--
-- VERIFIED AUTHENTICATED EFFECTIVE CRUD BASELINE
--
--   enterprise_leads
--     SELECT=true INSERT=true UPDATE=true DELETE=true
--
--   enterprise_members
--     SELECT=true INSERT=false UPDATE=false DELETE=false
--
--   enterprise_request_sla
--     SELECT=true INSERT=false UPDATE=false DELETE=false
--
--   enterprise_sla_policies
--     SELECT=true INSERT=true UPDATE=true DELETE=false
--
-- FAIL-CLOSED CONTRACT
--   BEFORE:
--     - all four target relations exist;
--     - all 16 target ACL entries exactly match the audited ACL baseline;
--     - authenticated has no directly granted parent role;
--     - all 16 target effective privileges are present;
--     - authenticated effective CRUD matches the audited baseline;
--     - service_role retains all 16 target effective privileges.
--
--   AFTER:
--     - all 16 authenticated target effective privileges are absent;
--     - all 16 direct authenticated target ACL entries are absent;
--     - service_role retains all 16 target effective privileges;
--     - authenticated effective CRUD remains unchanged.
--
-- Any exception aborts the transaction before COMMIT.
-- =============================================================================

BEGIN;


-- =============================================================================
-- SECTION 0 — HARD PRECONDITIONS
-- =============================================================================

DO $final_pr_01e_pre$
DECLARE
  v_table text;
  v_privilege text;
  v_acl_count bigint;
BEGIN

  -- ---------------------------------------------------------------------------
  -- 0A. Target relations.
  -- ---------------------------------------------------------------------------

  FOREACH v_table IN ARRAY ARRAY[
    'enterprise_leads',
    'enterprise_members',
    'enterprise_request_sla',
    'enterprise_sla_policies'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n
        ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relkind IN ('r', 'p')
    ) THEN
      RAISE EXCEPTION
        'FINAL-PR-01E ABORT: required table public.% is missing or has unexpected relkind',
        v_table;
    END IF;
  END LOOP;


  -- ---------------------------------------------------------------------------
  -- 0B. Role-membership baseline.
  --
  -- The audited production state showed no role directly granted to
  -- authenticated. Abort if that security assumption has changed.
  -- ---------------------------------------------------------------------------

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles member_role
      ON member_role.oid = m.member
    WHERE member_role.rolname = 'authenticated'
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: authenticated now has a granted parent role';
  END IF;


  -- ---------------------------------------------------------------------------
  -- 0C. Exact direct ACL baseline + effective target privileges.
  -- ---------------------------------------------------------------------------

  FOREACH v_table IN ARRAY ARRAY[
    'enterprise_leads',
    'enterprise_members',
    'enterprise_request_sla',
    'enterprise_sla_policies'
  ]
  LOOP
    FOREACH v_privilege IN ARRAY ARRAY[
      'MAINTAIN',
      'REFERENCES',
      'TRIGGER',
      'TRUNCATE'
    ]
    LOOP

      /*
       * Require exactly one authenticated ACL entry for this privilege,
       * and require that exact entry to match:
       *
       *   grantor      = postgres
       *   is_grantable = false
       *
       * Counting ALL authenticated entries for the privilege prevents an
       * unexpected variant from being hidden by the expected entry.
       */
      SELECT COUNT(*)
      INTO v_acl_count
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n
        ON n.oid = c.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          c.relacl,
          pg_catalog.acldefault('r', c.relowner)
        )
      ) acl
      JOIN pg_catalog.pg_roles grantee_role
        ON grantee_role.oid = acl.grantee
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relkind IN ('r', 'p')
        AND grantee_role.rolname = 'authenticated'
        AND acl.privilege_type = v_privilege;

      IF v_acl_count <> 1 THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: expected exactly one authenticated % ACL on public.%, found %',
          v_privilege,
          v_table,
          v_acl_count;
      END IF;


      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            c.relacl,
            pg_catalog.acldefault('r', c.relowner)
          )
        ) acl
        JOIN pg_catalog.pg_roles grantee_role
          ON grantee_role.oid = acl.grantee
        JOIN pg_catalog.pg_roles grantor_role
          ON grantor_role.oid = acl.grantor
        WHERE n.nspname = 'public'
          AND c.relname = v_table
          AND c.relkind IN ('r', 'p')
          AND grantee_role.rolname = 'authenticated'
          AND grantor_role.rolname = 'postgres'
          AND acl.privilege_type = v_privilege
          AND acl.is_grantable = false
      ) THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: authenticated % ACL baseline mismatch on public.%',
          v_privilege,
          v_table;
      END IF;


      IF NOT pg_catalog.has_table_privilege(
        'authenticated',
        pg_catalog.format('public.%I', v_table),
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: authenticated effective % unexpectedly absent on public.%',
          v_privilege,
          v_table;
      END IF;

    END LOOP;
  END LOOP;


  -- ---------------------------------------------------------------------------
  -- 0D. Verified authenticated EFFECTIVE CRUD baseline.
  -- ---------------------------------------------------------------------------

  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'SELECT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'INSERT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'UPDATE'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_leads effective CRUD baseline drift';
  END IF;


  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'SELECT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'INSERT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'UPDATE'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_members effective CRUD baseline drift';
  END IF;


  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'SELECT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'INSERT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'UPDATE'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_request_sla effective CRUD baseline drift';
  END IF;


  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'SELECT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'INSERT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'UPDATE'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_sla_policies effective CRUD baseline drift';
  END IF;


  -- ---------------------------------------------------------------------------
  -- 0E. service_role baseline.
  -- ---------------------------------------------------------------------------

  FOREACH v_table IN ARRAY ARRAY[
    'enterprise_leads',
    'enterprise_members',
    'enterprise_request_sla',
    'enterprise_sla_policies'
  ]
  LOOP
    FOREACH v_privilege IN ARRAY ARRAY[
      'MAINTAIN',
      'REFERENCES',
      'TRIGGER',
      'TRUNCATE'
    ]
    LOOP
      IF NOT pg_catalog.has_table_privilege(
        'service_role',
        pg_catalog.format('public.%I', v_table),
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: service_role baseline missing % on public.%',
          v_privilege,
          v_table;
      END IF;
    END LOOP;
  END LOOP;

END;
$final_pr_01e_pre$;


-- =============================================================================
-- SECTION 1 — ONLY INTENDED MUTATION
-- =============================================================================

REVOKE
  MAINTAIN,
  REFERENCES,
  TRIGGER,
  TRUNCATE
ON TABLE
  public.enterprise_leads,
  public.enterprise_members,
  public.enterprise_request_sla,
  public.enterprise_sla_policies
FROM authenticated;


-- =============================================================================
-- SECTION 2 — HARD POSTCONDITIONS
-- =============================================================================

DO $final_pr_01e_post$
DECLARE
  v_table text;
  v_privilege text;
BEGIN

  FOREACH v_table IN ARRAY ARRAY[
    'enterprise_leads',
    'enterprise_members',
    'enterprise_request_sla',
    'enterprise_sla_policies'
  ]
  LOOP
    FOREACH v_privilege IN ARRAY ARRAY[
      'MAINTAIN',
      'REFERENCES',
      'TRIGGER',
      'TRUNCATE'
    ]
    LOOP

      -- authenticated effective privilege must be gone.
      IF pg_catalog.has_table_privilege(
        'authenticated',
        pg_catalog.format('public.%I', v_table),
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: authenticated still effectively holds % on public.%',
          v_privilege,
          v_table;
      END IF;


      -- authenticated direct ACL entry must also be gone.
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            c.relacl,
            pg_catalog.acldefault('r', c.relowner)
          )
        ) acl
        JOIN pg_catalog.pg_roles grantee_role
          ON grantee_role.oid = acl.grantee
        WHERE n.nspname = 'public'
          AND c.relname = v_table
          AND c.relkind IN ('r', 'p')
          AND grantee_role.rolname = 'authenticated'
          AND acl.privilege_type = v_privilege
      ) THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: authenticated direct % ACL remains on public.%',
          v_privilege,
          v_table;
      END IF;


      -- service_role must remain effective.
      IF NOT pg_catalog.has_table_privilege(
        'service_role',
        pg_catalog.format('public.%I', v_table),
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'FINAL-PR-01E ABORT: service_role lost % on public.%',
          v_privilege,
          v_table;
      END IF;

    END LOOP;
  END LOOP;


  -- ---------------------------------------------------------------------------
  -- authenticated EFFECTIVE CRUD must remain at the verified baseline.
  -- ---------------------------------------------------------------------------

  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'SELECT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'INSERT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'UPDATE'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_leads', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_leads effective CRUD changed';
  END IF;


  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'SELECT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'INSERT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'UPDATE'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_members', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_members effective CRUD changed';
  END IF;


  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'SELECT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'INSERT'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'UPDATE'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_request_sla', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_request_sla effective CRUD changed';
  END IF;


  IF NOT (
       pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'SELECT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'INSERT'
       )
   AND pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'UPDATE'
       )
   AND NOT pg_catalog.has_table_privilege(
         'authenticated', 'public.enterprise_sla_policies', 'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-01E ABORT: enterprise_sla_policies effective CRUD changed';
  END IF;

END;
$final_pr_01e_post$;


COMMIT;


-- =============================================================================
-- END — FINAL-PR-01E v3 CANDIDATE
--
-- DO NOT APPLY TO PRODUCTION UNTIL:
--   1. v3 static audit PASS;
--   2. exact artifact frozen;
--   3. SHA-256 recorded;
--   4. immediate production read-only preflight PASS;
--   5. explicit human authorization.
-- =============================================================================
