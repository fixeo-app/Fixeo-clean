-- FIXEO Diagnostic prerequisite. Reviewed against production 2026-09-21.
-- Run in the migration transaction. Abort on unexpected policy drift.
-- Does NOT alter public.portfolio_items, buckets, grants or object data.
SET LOCAL lock_timeout = '3s';

DO $guard$
DECLARE
  p record;
  other_policies text;
BEGIN
  SELECT * INTO p FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'portfolio_public_read';
  IF NOT FOUND OR p.cmd <> 'SELECT' OR p.permissive <> 'PERMISSIVE'
    OR p.roles IS DISTINCT FROM ARRAY['anon','authenticated']::name[]
    OR p.with_check IS NOT NULL
    OR p.qual NOT IN ('true', '(bucket_id = ''portfolio''::text)')
    OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
            WHERE oid = 'storage.objects'::regclass)
  THEN RAISE EXCEPTION 'Storage precondition changed: portfolio_public_read'; END IF;

  SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY policyname)::text,'[]'))
  INTO other_policies
  FROM pg_catalog.pg_policies x
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname <> 'portfolio_public_read';
  IF other_policies <> '3f4c0c4b2715ccd10957eb8e8da7da6e'
  THEN RAISE EXCEPTION 'Storage precondition changed: other policies'; END IF;
END;
$guard$;

ALTER POLICY "portfolio_public_read"
ON storage.objects
USING (bucket_id = 'portfolio'::text);
