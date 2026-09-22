-- READ ONLY. After the single policy migration, before ANY private bucket creation.
BEGIN TRANSACTION READ ONLY;
DO $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname='portfolio_public_read' AND cmd='SELECT' AND roles=ARRAY['anon','authenticated']::name[]
  AND permissive='PERMISSIVE' AND qual='(bucket_id = ''portfolio''::text)' AND with_check IS NULL)
  THEN RAISE EXCEPTION 'Portfolio is not scoped'; END IF;
 IF (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY policyname)::text,'[]')) FROM pg_policies p
  WHERE schemaname='storage' AND tablename='objects' AND policyname<>'portfolio_public_read')<>'3f4c0c4b2715ccd10957eb8e8da7da6e'
  THEN RAISE EXCEPTION 'Other Storage policies drift'; END IF;
END $guard$;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id;
SET LOCAL ROLE anon;
SELECT bucket_id,count(*) AS visible_objects FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT bucket_id,count(*) AS visible_objects FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id;
RESET ROLE;
SELECT policyname,cmd,roles,permissive,qual,with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('SELECT','ALL');
ROLLBACK;
-- Existing portfolio is empty: zero rows is NOT proof of serving an actual file.
-- Actual upload/read/delete fixture testing is WRITE, needs explicit authorization.
-- Test a real fixture in portfolio and a different PRIVATE bucket through Storage API:
-- public portfolio URL => 200; artisan-media existing public object => 200;
-- private public URL/anon authenticated/list => denied; owner signed URL => 200,
-- same URL after 60 seconds => denied. Remove fixture via Storage API (never objects SQL).
