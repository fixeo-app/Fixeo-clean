-- ============================================================
-- FIXEO — Enterprise Leads Table
-- File: supabase/enterprise_leads.sql
-- Commit: d5631b7
-- Version: 1.0 — 2026-07-17
--
-- PURPOSE
-- ───────
-- Stores B2B demo/contact requests submitted via the Enterprise
-- landing page (/entreprises) modal.
-- Inserts arrive from the Vercel serverless function:
--   api/enterprise-contact-fn/index.js
-- using the Supabase ANON key (public, no auth session).
--
-- SECURITY MODEL
-- ──────────────
-- • anon role  → INSERT only (write-once, no read-back)
-- • authenticated role → INSERT only (same capability if ever logged in)
-- • service_role → unrestricted (Supabase Studio + admin queries)
-- • No client-side SELECT is ever needed; the Vercel fn only reads
--   the inserted row's `id` from the RETURNING clause.
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
  nom             text          NOT NULL CHECK (char_length(nom)       BETWEEN 1 AND 500),
  prenom          text          NOT NULL CHECK (char_length(prenom)    BETWEEN 1 AND 500),
  entreprise      text          NOT NULL CHECK (char_length(entreprise) BETWEEN 1 AND 500),
  fonction        text          NOT NULL CHECK (char_length(fonction)   BETWEEN 1 AND 500),
  telephone       text          NOT NULL CHECK (char_length(telephone)  BETWEEN 1 AND 50),
  email           text          NOT NULL CHECK (char_length(email)      BETWEEN 3 AND 254),

  -- ── Optional contact context ──────────────────────────────
  ville           text                   CHECK (char_length(ville)     <= 100),

  -- ── Organisation classification ───────────────────────────
  -- Validated against the dropdown list in the modal.
  -- Stored as the raw dropdown value (e.g. 'hotel', 'clinique').
  org_type        text          NOT NULL CHECK (char_length(org_type)  BETWEEN 1 AND 100),

  -- ── Needs (comma-separated checkbox values) ───────────────
  -- e.g. 'maintenance_ponctuelle,facility_management,multi_sites'
  needs           text                   CHECK (char_length(needs)     <= 500),

  -- ── Optional additional information ───────────────────────
  batiments       text                   CHECK (char_length(batiments) <= 50),
  message         text                   CHECK (char_length(message)   <= 2000),

  -- ── Routing / audit metadata ──────────────────────────────
  -- source: always 'enterprise' (enforced in Vercel fn payload)
  source          text          NOT NULL DEFAULT 'enterprise'
                                CHECK (source = 'enterprise'),

  -- page: the URL path from which the form was submitted
  page            text                   CHECK (char_length(page)      <= 200),

  -- submitted_at: set by the Vercel fn (ISO timestamp from client)
  -- may differ slightly from created_at if clock skew exists
  submitted_at    timestamptz            DEFAULT now(),

  -- created_at: authoritative server-side timestamp
  created_at      timestamptz   NOT NULL DEFAULT now()

);

-- ── Table comment ──────────────────────────────────────────
COMMENT ON TABLE public.enterprise_leads IS
  'B2B Enterprise demo/contact requests from /entreprises. '
  'Inserted by api/enterprise-contact-fn via anon key. Source: d5631b7.';

COMMENT ON COLUMN public.enterprise_leads.needs IS
  'Comma-separated checkbox values: maintenance_ponctuelle, contrat_maintenance, '
  'facility_management, multi_sites, demonstration';

COMMENT ON COLUMN public.enterprise_leads.org_type IS
  'Dropdown value: hotel | restaurant | cafe | bureau | clinique | '
  'ecole | syndic | commerce | industrie | autre';

COMMENT ON COLUMN public.enterprise_leads.source IS
  'Always ''enterprise''. Identifies origin in shared CRM queries.';


-- ============================================================
-- SECTION 2 — INDEXES
-- ============================================================

-- Primary lookup for admin: most recent leads first
CREATE INDEX IF NOT EXISTS enterprise_leads_created_at_idx
  ON public.enterprise_leads (created_at DESC);

-- Email dedup / CRM lookups
CREATE INDEX IF NOT EXISTS enterprise_leads_email_idx
  ON public.enterprise_leads (lower(email));

-- Filter by organisation type (pipeline segmentation)
CREATE INDEX IF NOT EXISTS enterprise_leads_org_type_idx
  ON public.enterprise_leads (org_type);

-- Filter by city (geographic routing to account managers)
CREATE INDEX IF NOT EXISTS enterprise_leads_ville_idx
  ON public.enterprise_leads (ville)
  WHERE ville IS NOT NULL;


-- ============================================================
-- SECTION 3 — ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on the table
ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (belt-and-suspenders)
ALTER TABLE public.enterprise_leads FORCE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 4 — RLS POLICIES
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 4-A  anon INSERT (write-once, no auth required)
-- ────────────────────────────────────────────────────────────
-- The Vercel function uses the publishable ANON key.
-- Visitors never have a Supabase auth session.
-- WITH CHECK (true) allows any conforming row.
-- The CHECK constraints on the table columns provide
-- the actual data-level guards (length, not-null, source='enterprise').
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_anon_insert" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_anon_insert"
  ON public.enterprise_leads
  FOR INSERT
  TO anon
  WITH CHECK (
    source = 'enterprise'            -- only accepted source value
    AND char_length(nom)        >= 1
    AND char_length(prenom)     >= 1
    AND char_length(entreprise) >= 1
    AND char_length(fonction)   >= 1
    AND char_length(telephone)  >= 1
    AND char_length(email)      >= 3
    AND char_length(org_type)   >= 1
  );


-- ────────────────────────────────────────────────────────────
-- 4-B  anon SELECT — DENY
-- ────────────────────────────────────────────────────────────
-- Anonymous callers must never be able to read any leads.
-- USING (false) means no row ever passes the filter → empty result.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_anon_deny_select" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_anon_deny_select"
  ON public.enterprise_leads
  FOR SELECT
  TO anon
  USING (false);


-- ────────────────────────────────────────────────────────────
-- 4-C  anon UPDATE — DENY
-- ────────────────────────────────────────────────────────────
-- Leads are write-once. Anonymous users cannot modify rows.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_anon_deny_update" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_anon_deny_update"
  ON public.enterprise_leads
  FOR UPDATE
  TO anon
  USING (false);


-- ────────────────────────────────────────────────────────────
-- 4-D  anon DELETE — DENY
-- ────────────────────────────────────────────────────────────
-- Leads are permanent records. Anonymous users cannot delete rows.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_anon_deny_delete" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_anon_deny_delete"
  ON public.enterprise_leads
  FOR DELETE
  TO anon
  USING (false);


-- ────────────────────────────────────────────────────────────
-- 4-E  authenticated INSERT
-- ────────────────────────────────────────────────────────────
-- If a logged-in admin or artisan somehow reaches this form,
-- their insert is also accepted. Same guards as anon.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_auth_insert" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_auth_insert"
  ON public.enterprise_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (source = 'enterprise');


-- ────────────────────────────────────────────────────────────
-- 4-F  authenticated SELECT — admin role only
-- ────────────────────────────────────────────────────────────
-- Only users whose profile has role = 'admin' can read leads.
-- Requires a profiles table with a `role` column (already exists
-- in the Fixeo schema: public.profiles.role).
-- Non-admin authenticated users see nothing (USING returns false).
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
-- 4-G  authenticated UPDATE — admin role only
-- ────────────────────────────────────────────────────────────
-- Admins can annotate leads (e.g. add a note, mark contacted).
-- Non-admin authenticated users cannot update anything.
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
-- 4-H  authenticated DELETE — DENY for everyone
-- ────────────────────────────────────────────────────────────
-- Leads are never deleted through the API.
-- Hard deletion must be done via service_role in Supabase Studio.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "enterprise_leads_deny_delete" ON public.enterprise_leads;

CREATE POLICY "enterprise_leads_deny_delete"
  ON public.enterprise_leads
  FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- SECTION 5 — GRANTS
-- ============================================================

-- anon: INSERT only (SELECT/UPDATE/DELETE blocked by RLS policies)
GRANT INSERT ON public.enterprise_leads TO anon;

-- authenticated: INSERT + SELECT + UPDATE (further restricted by RLS)
GRANT INSERT, SELECT, UPDATE ON public.enterprise_leads TO authenticated;

-- Sequence grant for gen_random_uuid() — uuid is generated by default,
-- no sequence involved, but grant USAGE on the schema for completeness
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;


-- ============================================================
-- SECTION 6 — OPTIONAL: admin_notes column for CRM workflow
-- ============================================================
-- Uncomment if you want admins to annotate leads in Supabase Studio
-- without a separate CRM. Adds a text column for free-form notes.

-- ALTER TABLE public.enterprise_leads
--   ADD COLUMN IF NOT EXISTS admin_notes text;

-- ALTER TABLE public.enterprise_leads
--   ADD COLUMN IF NOT EXISTS contacted_at timestamptz;

-- ALTER TABLE public.enterprise_leads
--   ADD COLUMN IF NOT EXISTS status text
--     DEFAULT 'new'
--     CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'lost'));


-- ============================================================
-- SECTION 7 — VERIFICATION QUERIES
-- Run each block to confirm the setup is correct.
-- ============================================================

-- 7-A: Confirm table exists with expected columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'enterprise_leads'
ORDER BY ordinal_position;

-- 7-B: Confirm RLS is enabled
SELECT
  relname         AS table_name,
  relrowsecurity  AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'enterprise_leads';

-- 7-C: List all policies
SELECT
  policyname,
  roles,
  cmd       AS command,
  qual      AS using_expr,
  with_check
FROM pg_policies
WHERE tablename = 'enterprise_leads'
ORDER BY policyname;

-- 7-D: Confirm indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'enterprise_leads'
ORDER BY indexname;

-- 7-E: Test anon INSERT (simulates what the Vercel fn sends)
-- Run in Supabase SQL Editor as service_role (default) — passes.
-- To test as anon: use the REST API with the anon key.
INSERT INTO public.enterprise_leads (
  nom, prenom, entreprise, fonction,
  telephone, email, ville,
  org_type, needs, batiments, message,
  source, page, submitted_at
) VALUES (
  'Test', 'QA', 'FIXEO SA', 'Directeur Technique',
  '+212600000000', 'test.qa@fixeo.ma', 'Casablanca',
  'hotel', 'facility_management,multi_sites', '3',
  'Ceci est un test de vérification du schéma.',
  'enterprise', '/entreprises', now()
)
RETURNING id, created_at;

-- 7-F: Clean up test row
DELETE FROM public.enterprise_leads
WHERE email = 'test.qa@fixeo.ma';
