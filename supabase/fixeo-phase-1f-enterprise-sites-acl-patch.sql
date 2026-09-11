-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — Production Patch
-- File: supabase/fixeo-phase-1f-enterprise-sites-acl-patch.sql
-- Approved commit at time of patch:
--   34ed479a39880f77d9d77ba0861b8e1bb1905531
--
-- PURPOSE
--   Correct the public.enterprise_sites table-level ACL for the
--   authenticated role.
--
-- ROOT CAUSE
--   Supabase hosted projects configure default privileges that
--   automatically grant authenticated=arwdDxtm (ALL) on every new
--   table created in the public schema. Migration 2 (7c13a2) revoked
--   from PUBLIC and anon but did not first revoke from authenticated,
--   leaving authenticated with the full default ACL:
--     INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--
-- TARGET STATE AFTER THIS PATCH
--   authenticated: SELECT + UPDATE(name,site_code,address_line,city,status) only
--   service_role:  unchanged (preserved)
--   postgres:      unchanged (owner, preserved)
--   anon:          no privileges (unchanged)
--
-- SCOPE
--   ONLY: REVOKE + GRANT statements on public.enterprise_sites
--   NO table structure change
--   NO column change
--   NO constraint change
--   NO index change
--   NO RLS policy change
--   NO RPC change
--   NO other table touched
--
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── Step 1: Strip all authenticated table-level privileges ───
-- This removes the Supabase-default broad ACL
-- (INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER)
-- from authenticated. service_role and postgres are NOT touched.
REVOKE ALL ON public.enterprise_sites FROM authenticated;

-- ── Step 2: Re-grant exactly the approved minimum ────────────
-- Table-level SELECT only.
GRANT SELECT ON public.enterprise_sites TO authenticated;

-- Column-level UPDATE on exactly the five named columns.
-- id, enterprise_id, created_at, updated_at deliberately excluded —
-- authenticated cannot modify them regardless of RLS outcome.
GRANT UPDATE (
  name,
  site_code,
  address_line,
  city,
  status
) ON public.enterprise_sites TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════
-- READ-ONLY VERIFICATION
-- Run this block AFTER the patch commits to confirm ACL state.
-- This block is outside the transaction — it is SELECT-only.
-- ════════════════════════════════════════════════════════════
--
-- IMPORTANT NOTE ON has_table_privilege() and UPDATE:
--   has_table_privilege('authenticated', 'public.enterprise_sites', 'UPDATE')
--   returns TRUE even when only column-level UPDATE grants exist,
--   because PostgreSQL considers effective UPDATE privilege satisfied
--   by any column-level UPDATE grant on the relation.
--   It cannot be used to distinguish table-level from column-level UPDATE.
--
--   Instead this verification reads pg_class.relacl (table-level ACL)
--   and pg_attribute.attacl (column-level ACL) directly.
-- ════════════════════════════════════════════════════════════

SELECT

  -- ── 1. Raw table-level ACL for enterprise_sites ──────────
  (
    SELECT array_to_string(relacl, ', ')
    FROM   pg_class
    WHERE  oid = 'public.enterprise_sites'::regclass
  ) AS raw_relacl,

  -- ── 2. Authenticated entry only (letter-code breakdown) ──
  (
    SELECT pg_catalog.regexp_replace(
             acl_entry::text,
             '^authenticated=([^/]+)/.*$',
             '\1'
           )
    FROM   pg_class c,
           unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS authenticated_acl_letters,

  -- ── 3. Table-level privilege flags (from relacl) ─────────
  --   Absence of letter = privilege NOT granted at table level.
  --   'r' = SELECT, 'a' = INSERT, 'w' = UPDATE (table-level),
  --   'd' = DELETE, 'D' = TRUNCATE, 'x' = REFERENCES, 't' = TRIGGER
  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 'r'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_select_granted,

  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 'a'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_insert_granted,

  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 'w'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_update_granted,

  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 'd'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_delete_granted,

  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 'D'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_truncate_granted,

  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 'x'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_references_granted,

  (
    SELECT
      pg_catalog.regexp_replace(
        acl_entry::text, '^authenticated=([^/]+)/.*$', '\1'
      ) ~ 't'
    FROM   pg_class c, unnest(c.relacl) AS acl_entry
    WHERE  c.oid = 'public.enterprise_sites'::regclass
      AND  acl_entry::text LIKE 'authenticated=%'
  ) AS tbl_trigger_granted;

-- ── 4. Column-level UPDATE grants for authenticated ──────────
-- Expected: exactly name, site_code, address_line, city, status
-- Each row = one column with column-level UPDATE for authenticated.

SELECT
  pa.attname                         AS column_name,
  pa.attacl::text                    AS column_acl
FROM   pg_attribute pa
WHERE  pa.attrelid = 'public.enterprise_sites'::regclass
  AND  pa.attnum   > 0
  AND  NOT pa.attisdropped
  AND  pa.attacl   IS NOT NULL
  AND  pg_catalog.array_to_string(pa.attacl, ',') LIKE '%authenticated%'
ORDER BY pa.attnum;

-- ════════════════════════════════════════════════════════════
-- EXPECTED RESULTS
-- ════════════════════════════════════════════════════════════
--
-- Query 1 — table-level flags (one row):
--   raw_relacl             : postgres=arwdDxtm/postgres,
--                            authenticated=r/postgres,
--                            service_role=arwdDxtm/postgres
--   authenticated_acl_letters : r
--   tbl_select_granted     : true
--   tbl_insert_granted     : false   ← MUST be false
--   tbl_update_granted     : false   ← MUST be false (column-level only)
--   tbl_delete_granted     : false   ← MUST be false
--   tbl_truncate_granted   : false   ← MUST be false
--   tbl_references_granted : false   ← MUST be false
--   tbl_trigger_granted    : false   ← MUST be false
--
-- Query 2 — column-level UPDATE (five rows):
--   name         | {authenticated=w/postgres}
--   site_code    | {authenticated=w/postgres}
--   address_line | {authenticated=w/postgres}
--   city         | {authenticated=w/postgres}
--   status       | {authenticated=w/postgres}
--
-- ════════════════════════════════════════════════════════════
