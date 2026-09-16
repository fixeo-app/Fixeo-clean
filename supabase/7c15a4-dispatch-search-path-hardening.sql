-- =============================================================================
-- FIXEO — 7c15a4 DISPATCH SEARCH-PATH HARDENING
-- Production migration
--
-- Preconditions:
--   Final Production READ-ONLY precheck P01-P14 = TRUE.
--
-- Scope: ONLY these three existing SECURITY DEFINER functions.
-- No function body, ACL, owner, signature, volatility, or business logic change.
-- =============================================================================

BEGIN;

ALTER FUNCTION public.dispatch_batch_preview_v1(uuid, integer)
  SET search_path TO '';

ALTER FUNCTION public.dispatch_candidate_pool_v1(uuid, integer)
  SET search_path TO '';

ALTER FUNCTION public.dispatch_execution_plan_v1(uuid, integer)
  SET search_path TO '';

COMMIT;
