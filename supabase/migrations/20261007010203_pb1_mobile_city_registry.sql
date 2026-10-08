-- PB1: necessary STAGING city contract alignment. No row, Auth, RLS, grant or business transition changes.
-- Generated from api/diagnostic/cities.json. Existing function guards and bodies are retained.
DO $migration$
DECLARE r record; updated text; count_changed integer := 0;
BEGIN
 FOR r IN SELECT p.oid, pg_get_functiondef(p.oid) AS definition FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.proname IN
   ('confirm_estimator_request_v1','confirm_estimator_request_vap_v1','create_diagnostic_critical_request_v1','create_diagnostic_quote_request_v1')
 LOOP
  IF r.definition LIKE '%WHEN ''martil'' THEN ''Martil''%' THEN
   count_changed := count_changed + 1;
   CONTINUE;
  END IF;
  updated := regexp_replace(r.definition, '(WHEN ''mohammedia''[[:space:]]+THEN ''Mohammedia'')', E'\\1 WHEN ''martil'' THEN ''Martil''', 'g');
  updated := replace(updated, '''Temara''', '''Témara''');
  IF updated = r.definition OR updated NOT LIKE '%WHEN ''martil'' THEN ''Martil''%' THEN
   RAISE EXCEPTION 'PB1_CITY_MAPPING_UNEXPECTED';
  END IF;
  EXECUTE updated;
  count_changed := count_changed + 1;
 END LOOP;
 IF count_changed <> 4 THEN RAISE EXCEPTION 'PB1_CITY_FUNCTION_COUNT'; END IF;
END
$migration$;
ALTER TABLE fixeo_private.diagnostic_sessions_v1 DROP CONSTRAINT diagnostic_sessions_v1_city_slug_check;
ALTER TABLE fixeo_private.diagnostic_sessions_v1 ADD CONSTRAINT diagnostic_sessions_v1_city_slug_check
 CHECK (city_slug = ANY (ARRAY['casablanca','rabat','marrakech','fes','tanger','agadir','meknes','oujda','kenitra','tetouan','safi','el-jadida','sale','temara','beni-mellal','nador','khouribga','taza','ouarzazate','mohammedia','martil']::text[]));
