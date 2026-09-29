-- Run only after application rollback to the B5 tree. No business data or prior authority changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DROP FUNCTION public.control_marketplace_signals_v1(text,text);
DROP FUNCTION public.control_marketplace_cohorts_v1(jsonb);
DROP FUNCTION public.control_marketplace_coverage_v1(jsonb,uuid,integer);
DROP FUNCTION public.control_marketplace_population_v1(text,jsonb,jsonb,integer);
DROP FUNCTION public.control_marketplace_cube_v1(text,jsonb,jsonb,integer);
DROP FUNCTION fixeo_private.control_marketplace_artisans_v1(jsonb);
DROP FUNCTION fixeo_private.control_marketplace_requests_v1(jsonb);
DROP FUNCTION fixeo_private.control_marketplace_scope_v1(jsonb);
DROP FUNCTION fixeo_private.control_marketplace_dimension_v1(text);
NOTIFY pgrst,'reload schema';
COMMIT;
