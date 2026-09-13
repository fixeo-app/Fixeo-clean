-- ════════════════════════════════════════════════════════════
-- BP09 — Enterprise Dashboard: RLS Policies
-- File: supabase/bp09-enterprise-rls-and-schema.sql
-- Branch: recovery/seo-v3-safe
-- Safety: LOCAL ONLY — static migration for production deployment
--
-- PURPOSE
--   Add enterprise member SELECT policies on service_requests
--   and missions so that enterprise dashboard users can read
--   the rows they are authorized to see.
--
-- CANONICAL ARCHITECTURE
--   enterprise_request_context is the authoritative Enterprise
--   linkage: enterprise_id → site_id → service_request_id.
--   service_requests schema is NOT modified.
--   No denormalized columns. No triggers. No backfill.
--
-- PROBLEMS ADDRESSED
--   1. service_requests RLS only covers:
--        client_own_requests_read (client_profile_id = auth.uid())
--        artisan_read_own_linked_requests (missions join)
--        admin_all_service_requests (admin users)
--      Enterprise members cannot SELECT rows → dashboard returns
--      0 requests for every enterprise user.
--
--   2. missions RLS only covers:
--        client_select_own_missions / artisan_select_own_missions /
--        admin_all_missions
--      Enterprise members cannot SELECT missions → mission block
--      in request detail is silently empty.
--
-- SOLUTION
--   Additive SELECT policies on service_requests and missions.
--   Authorization is bridged entirely through
--   enterprise_request_context — no schema changes to
--   service_requests or missions.
--
-- TYPE CONTRACT — missions.request_id
--   missions.request_id is TEXT (live production schema).
--   service_requests.id is UUID.
--   enterprise_request_context.service_request_id is UUID.
--   DO NOT cast missions.request_id to UUID — legacy non-UUID
--   values may exist and a cast in an RLS policy would throw
--   and break ALL mission reads.
--   Canonical pattern (from 7c11c-dispatch-foundation.sql):
--     m.request_id = sr.id::text   (cast the UUID side)
--   RLS policy join:
--     missions.request_id = erc.service_request_id::text
--
-- SAFETY INVARIANTS
--   - No ALTER TABLE
--   - No CREATE TABLE
--   - No triggers
--   - No backfill
--   - No modification to existing RPCs
--   - No modification to pricing files
--   - No modification to 7c15a4 (HOLD)
--   - No dispatch_execute_v1 calls
--   - DROP POLICY IF EXISTS: idempotent
--   - All policies are additive SELECT only
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- SECTION 1 — service_requests: enterprise member read
-- ════════════════════════════════════════════════════════════
--
-- Authorization bridge: enterprise_request_context
--   erc.service_request_id = service_requests.id   (both UUID)
--
-- Site manager scope (BP08F):
--   site_manager: only requests from their assigned sites
--   owner/admin/operations_manager/reporter/viewer: all enterprise
--
-- These policies are additive — all existing policies unchanged.
-- ════════════════════════════════════════════════════════════

-- 1a: Non-site_manager enterprise members
DROP POLICY IF EXISTS "enterprise_non_sm_requests_read" ON public.service_requests;
CREATE POLICY "enterprise_non_sm_requests_read"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enterprise_request_context erc
      JOIN   public.enterprise_members em
               ON  em.enterprise_id = erc.enterprise_id
               AND em.user_id       = auth.uid()
               AND em.status        = 'active'
               AND em.role IN ('owner','admin','operations_manager','reporter','viewer')
      WHERE  erc.service_request_id = service_requests.id
    )
  );

DO $$ BEGIN RAISE NOTICE 'BP09 Section 1a — enterprise_non_sm_requests_read policy created'; END $$;

-- 1b: site_manager — assigned sites only
DROP POLICY IF EXISTS "enterprise_sm_requests_read" ON public.service_requests;
CREATE POLICY "enterprise_sm_requests_read"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enterprise_request_context erc
      JOIN   public.enterprise_members em
               ON  em.enterprise_id  = erc.enterprise_id
               AND em.user_id        = auth.uid()
               AND em.status         = 'active'
               AND em.role           = 'site_manager'
      JOIN   public.enterprise_member_sites ems
               ON  ems.member_id     = em.id
               AND ems.site_id       = erc.site_id
               AND ems.enterprise_id = erc.enterprise_id
      WHERE  erc.service_request_id = service_requests.id
    )
  );

DO $$ BEGIN RAISE NOTICE 'BP09 Section 1b — enterprise_sm_requests_read policy created'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 2 — missions: enterprise member read
-- ════════════════════════════════════════════════════════════
--
-- TYPE CONTRACT:
--   missions.request_id          TEXT  (live production type)
--   enterprise_request_context.service_request_id  UUID
--   Join: missions.request_id = erc.service_request_id::text
--   This casts the UUID side — safe even if legacy non-UUID
--   text values exist in missions.request_id, because those
--   rows simply won't match any UUID::text and are skipped.
--   A cast of missions.request_id to UUID would throw on
--   non-UUID legacy rows and must never be used in RLS.
-- ════════════════════════════════════════════════════════════

-- 2a: Non-site_manager enterprise members
DROP POLICY IF EXISTS "enterprise_non_sm_missions_read" ON public.missions;
CREATE POLICY "enterprise_non_sm_missions_read"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enterprise_request_context erc
      JOIN   public.enterprise_members em
               ON  em.enterprise_id = erc.enterprise_id
               AND em.user_id       = auth.uid()
               AND em.status        = 'active'
               AND em.role IN ('owner','admin','operations_manager','reporter','viewer')
      WHERE  missions.request_id = erc.service_request_id::text
    )
  );

DO $$ BEGIN RAISE NOTICE 'BP09 Section 2a — enterprise_non_sm_missions_read policy created'; END $$;

-- 2b: site_manager — assigned sites only
DROP POLICY IF EXISTS "enterprise_sm_missions_read" ON public.missions;
CREATE POLICY "enterprise_sm_missions_read"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enterprise_request_context erc
      JOIN   public.enterprise_members em
               ON  em.enterprise_id  = erc.enterprise_id
               AND em.user_id        = auth.uid()
               AND em.status         = 'active'
               AND em.role           = 'site_manager'
      JOIN   public.enterprise_member_sites ems
               ON  ems.member_id     = em.id
               AND ems.site_id       = erc.site_id
               AND ems.enterprise_id = erc.enterprise_id
      WHERE  missions.request_id = erc.service_request_id::text
    )
  );

DO $$ BEGIN RAISE NOTICE 'BP09 Section 2b — enterprise_sm_missions_read policy created'; END $$;

-- ════════════════════════════════════════════════════════════
-- SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP09 — Enterprise RLS COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'NO schema changes to service_requests or missions.';
  RAISE NOTICE 'NO columns added. NO triggers. NO backfill.';
  RAISE NOTICE '';
  RAISE NOTICE 'Section 1: service_requests enterprise member RLS';
  RAISE NOTICE '  enterprise_non_sm_requests_read';
  RAISE NOTICE '  enterprise_sm_requests_read (site_manager scope)';
  RAISE NOTICE '';
  RAISE NOTICE 'Section 2: missions enterprise member RLS';
  RAISE NOTICE '  enterprise_non_sm_missions_read';
  RAISE NOTICE '  enterprise_sm_missions_read (site_manager scope)';
  RAISE NOTICE '';
  RAISE NOTICE 'Type contract: missions.request_id TEXT';
  RAISE NOTICE '  Join: missions.request_id = erc.service_request_id::text';
  RAISE NOTICE '  UUID side cast — safe for legacy rows.';
  RAISE NOTICE '';
  RAISE NOTICE 'Authorization bridge: enterprise_request_context';
  RAISE NOTICE 'Existing B2C / artisan / admin policies: UNCHANGED.';
  RAISE NOTICE '7c15a4 NOT touched.';
  RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;

COMMIT;
