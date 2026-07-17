-- ============================================================
-- FIXEO — Enterprise Leads Table
-- File: supabase/enterprise_leads.sql
-- Commit: fec-v1b (security correction — service_role insert)
-- Version: 1.1 — 2026-07-17
--
-- SECURITY ARCHITECTURE
-- ─────────────────────
-- Inserts arrive exclusively from the Vercel serverless function
-- api/enterprise-contact-fn/index.js, which uses the Supabase
-- SERVICE ROLE key (server-side env var — never exposed to browser).
--
-- The service role bypasses RLS at the Supabase PostgREST layer,
-- so no anon INSERT policy is needed or wanted.
--
-- Role access summary:
--   anon          → NO access (REVOKE ALL, no policies)
--   authenticated → SELECT + UPDATE for admin role only; DELETE denied
--   service_role  → unrestricted (Vercel fn + Supabase Studio)
--
-- RLS is still ENABLED and FORCED as defence-in-depth.
-- If the service role key is ever accidentally replaced with the
-- anon key, all inserts will be blocked — not silently accepted.
--
-- SAFE TO RE-RUN
-- ──────────────
-- All statements use IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- Running this script twice on the same database is harmless.
-- ============================================================


-- ============================================================
-- SECTION 1 — CREATE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.enterprise_leads (

  -- ── Identity ──────────────────────────────────────────────
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Contact fields (required in app, stored as text) ──────
  nom             text          NOT NULL CHECK (char_length(nom)        BETWEEN 1 AND 500),
  prenom          text          NOT NULL CHECK (char_length(prenom)     BETWEEN 1 AND 500),
  entreprise      text          NOT NULL CHECK (char_length(entreprise) BETWEEN 1 AND 500),
  fonction        text          NOT NULL CHECK (char_length(fonction)   BETWEEN 1 AND 500),
  telephone       text          NOT NULL CHECK (char_length(telephone)  BETWEEN 1 AND 50),
  email           text          NOT NULL CHECK (char_length(email)      BETWEEN 3 AND 254),

  -- ── Optional contact context ──────────────────────────────
  ville           text                   CHECK (char_length(ville)      <= 100),

  -- ── Organisation classification ───────────────────────────
  org_type        text          NOT NULL CHECK (char_length(org_type)   BETWEEN 1 AND 100),

  -- ── Needs (comma-separated checkbox values) ───────────────
  -- e.g. 'maintenance_ponctuelle,facility_management,multi_sites'
  needs           text                   CHECK (char_length(needs)      <= 500),

  -- ── Optional additional information ───────────────────────
  batiments       text                   CHECK (char_length(batiments)  <= 50),
  message         text                   CHECK (char_length(message)    <= 2000),

  -- ── Routing / audit metadata ──────────────────────────────
  -- source is hardcoded to 'enterprise' in the Vercel fn payload.
  source          text          NOT NULL DEFAULT 'enterprise'
                                CHECK (source = 'enterprise'),

  -- page: URL path from which the form was submitted
  page            text                   CHECK (char_length(page)       <= 200),

  -- submitted_at: ISO timestamp supplied by the Vercel fn
  submitted_at    timestamptz            DEFAULT now(),

  -- created_at: authoritative server-side timestamp
  created_at      timestamptz   NOT NULL DEFAULT now()

);

-- ── Table comments ─────────────────────────────────────────
COMMENT ON TABLE public.enterprise_leads IS
  'B2B Enterprise demo/contact requests from /entreprises. '
  'Inserted server-side by api/enterprise-contact-fn via service_role key. '
  'Version 1.1 — anon has no access. Source: fec-v1b.';

COMMENT ON COLUMN public.enterprise_leads.needs IS
  'Comma-separated checkbox values: maintenance_ponctuelle, contrat_maintenance, '
  'facility_management, multi_sites, demonstration';

COMMENT ON COLUMN public.enterprise_leads.org_type IS
  'Dropdown value: hotel | restaurant | cafe | bureau | clinique | '
  'ecole | syndic | commerce | industrie | autre';

COMMENT ON COLUMN public.enterprise_leads.source IS
  'Always ''enterprise''. Hardcoded in Vercel fn — not trusted from client input.';


-- ============================================================
-- SECTION 2 — INDEXES
-- ============================================================

-- Primary admin lookup: most recent leads first
CREATE INDEX IF NOT EXISTS enterprise_leads_created_at_idx
  ON public.enterprise_leads (created_at DESC);

-- Email dedup / CRM lookups
CREATE INDEX IF NOT EXISTS enterprise_leads_email_idx
  ON public.enterprise_leads (lower(email));

-- Filter by organisation type (pipeline segmentation)
CREATE INDEX IF NOT EXISTS enterprise_leads_org_type_idx
  ON public.enterprise_leads (org_type);

-- Filter by city (geographic routing)
CREATE INDEX IF NOT EXISTS enterprise_leads_ville_idx
  ON public.enterprise_leads (ville)
  WHERE ville IS NOT NULL;


-- ============================================================
-- SECTION 3 — ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS (defence-in-depth — service role bypasses it,
-- but all other roles are now blocked by policy or grant)
ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner when accessed via API
ALTER TABLE public.enterprise_leads FORCE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 4 — REVOKE ALL FROM anon
-- ============================================================
-- anon has no business touching this table at all.
-- The Vercel fn uses the service role key, not the anon key.
-- Belt-and-suspenders: revoke at grant level AND have no policies.

REVOKE ALL ON public.enterprise_leads FROM anon;

-- Drop any previously created anon policies (idempotent)
DROP POLICY IF EXISTS "enterprise_leads_anon_insert"       ON public.enterprise_leads;
DROP POLICY IF EXISTS "enterprise_leads_anon_deny_select"  ON public.enterprise_leads;
DROP POLICY IF EXISTS "enterprise_leads_anon_deny_update"  ON public.enterprise_leads;
DROP POLICY IF EXISTS "enterprise_leads_anon_deny_delete"  ON public.enterprise_leads;
-- Drop authenticated INSERT policy if it was previously created
DROP POLICY IF EXISTS "enterprise_leads_auth_insert"       ON public.enterprise_leads;


-- ============================================================
-- SECTION 5 — RLS POLICIES (authenticated role only)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 5-A  authenticated SELECT — admin role only
-- ────────────────────────────────────────────────────────────
-- Only users whose profile has role = 'admin' can read leads
-- via the Supabase client (e.g. Supabase Studio, admin dashboard).
-- Non-admin authenticated users see zero rows.
-- service_role (Vercel fn, Studio as service) bypasses this.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_admin_select" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_admin_select"
  ON public.enterprise_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id   = auth.uid()
        AND profiles.role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────
-- 5-B  authenticated UPDATE — admin role only
-- ────────────────────────────────────────────────────────────
-- Admins can annotate leads (e.g. add notes, mark as contacted)
-- via a future admin UI. USING + WITH CHECK both require admin.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_admin_update" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_admin_update"
  ON public.enterprise_leads
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id   = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id   = auth.uid()
        AND profiles.role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────
-- 5-C  authenticated DELETE — DENY for all authenticated users
-- ────────────────────────────────────────────────────────────
-- Leads are permanent records. Hard deletion must be performed
-- in Supabase Studio using service_role (bypasses RLS).
-- No authenticated API caller can delete rows.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_deny_delete" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_deny_delete"
  ON public.enterprise_leads
  FOR DELETE
  TO authenticated
  USING (false);


-- ── No INSERT policy for authenticated ────────────────────────
-- Authenticated users cannot INSERT via the API either.
-- All inserts go through the Vercel fn using service_role.
-- If an INSERT is attempted by an authenticated session,
-- RLS will block it (no matching INSERT policy = deny by default).


-- ============================================================
-- SECTION 6 — GRANTS
-- ============================================================

-- anon: NO grants whatsoever
-- (REVOKE ALL already issued above; this is explicit confirmation)
REVOKE ALL ON public.enterprise_leads FROM anon;

-- authenticated: SELECT + UPDATE only (INSERT and DELETE denied by RLS)
GRANT SELECT, UPDATE ON public.enterprise_leads TO authenticated;

-- service_role: Supabase grants this implicitly; no explicit GRANT needed.
-- The Vercel fn uses service_role → bypasses RLS → INSERT + RETURNING work.

-- Schema usage (Supabase default — usually already granted)
GRANT USAGE ON SCHEMA public TO authenticated;


-- ============================================================
-- SECTION 7 — OPTIONAL: CRM workflow columns
-- ============================================================
-- Uncomment to enable admin annotation of leads in Supabase Studio.

-- ALTER TABLE public.enterprise_leads
--   ADD COLUMN IF NOT EXISTS admin_notes text;

-- ALTER TABLE public.enterprise_leads
--   ADD COLUMN IF NOT EXISTS contacted_at timestamptz;

-- ALTER TABLE public.enterprise_leads
--   ADD COLUMN IF NOT EXISTS status text
--     DEFAULT 'new'
--     CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'lost'));


-- ============================================================
-- SECTION 8 — VERIFICATION QUERIES
-- Run after applying to confirm everything is correct.
-- ============================================================

-- 8-A: Confirm table columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'enterprise_leads'
ORDER BY ordinal_position;

-- 8-B: Confirm RLS is enabled and forced
SELECT
  relname              AS table_name,
  relrowsecurity       AS rls_enabled,
  relforcerowsecurity  AS rls_forced
FROM pg_class
WHERE relname = 'enterprise_leads';

-- 8-C: List all policies (should show exactly 3: admin_select, admin_update, deny_delete)
SELECT
  policyname,
  roles,
  cmd        AS command,
  qual       AS using_expr,
  with_check
FROM pg_policies
WHERE tablename = 'enterprise_leads'
ORDER BY policyname;

-- 8-D: Confirm indexes (should show 5: pkey + 4 named indexes)
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'enterprise_leads'
ORDER BY indexname;

-- 8-E: Confirm anon has no privileges on this table
-- Expected: zero rows returned for anon
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'enterprise_leads'
  AND grantee    = 'anon';

-- 8-F: Test INSERT as service_role (simulates the Vercel fn)
-- The SQL Editor runs as service_role by default — this should succeed.
INSERT INTO public.enterprise_leads (
  nom, prenom, entreprise, fonction,
  telephone, email, ville,
  org_type, needs, batiments, message,
  source, page, submitted_at
) VALUES (
  'Test', 'QA', 'FIXEO SA', 'Directeur Technique',
  '+212600000000', 'test.qa@fixeo.ma', 'Casablanca',
  'hotel', 'facility_management,multi_sites', '3',
  'Test de vérification du schéma v1.1.',
  'enterprise', '/entreprises', now()
)
RETURNING id, created_at;

-- 8-G: Clean up test row
DELETE FROM public.enterprise_leads
WHERE email = 'test.qa@fixeo.ma';
