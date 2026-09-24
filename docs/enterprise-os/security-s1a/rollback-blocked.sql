-- BLOCKED REFERENCE ONLY. Never execute without new explicit Production authorization.
-- Reopens broad guest INSERT, broad authenticated assignment and phone fallback.
BEGIN;
DO $blocked$ BEGIN RAISE EXCEPTION 'S1A rollback blocked: new explicit authorization required'; END $blocked$;
REVOKE INSERT (service_category, city, description, status) ON TABLE public.service_requests FROM anon;
GRANT INSERT ON TABLE public.service_requests TO anon;
DROP POLICY IF EXISTS "anon_insert" ON public.service_requests;
DROP POLICY IF EXISTS "anon_service_requests_insert" ON public.service_requests;
DROP POLICY IF EXISTS "artisan_assign_new_requests" ON public.service_requests;
DROP POLICY IF EXISTS "artisan_update_assigned_requests" ON public.service_requests;
CREATE POLICY "anon_insert" ON public.service_requests AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);
CREATE POLICY "anon_service_requests_insert" ON public.service_requests AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);
CREATE POLICY "artisan_assign_new_requests" ON public.service_requests AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((status = 'new'::text)) WITH CHECK ((status = 'assigned'::text));
CREATE POLICY "artisan_update_assigned_requests" ON public.service_requests AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (missions m
     JOIN artisans a ON (((m.artisan_profile_id)::text = (a.id)::text)))
  WHERE ((m.request_id = (service_requests.id)::text) AND (((a.owner_user_id)::text = (auth.uid())::text) OR (a.phone_public = ( SELECT p.phone
           FROM profiles p
          WHERE ((p.id)::text = (auth.uid())::text)
         LIMIT 1))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (missions m
     JOIN artisans a ON (((m.artisan_profile_id)::text = (a.id)::text)))
  WHERE ((m.request_id = (service_requests.id)::text) AND (((a.owner_user_id)::text = (auth.uid())::text) OR (a.phone_public = ( SELECT p.phone
           FROM profiles p
          WHERE ((p.id)::text = (auth.uid())::text)
         LIMIT 1)))))));
COMMIT;
