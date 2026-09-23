-- EMERGENCY REFERENCE ONLY. Restores the audited vulnerable baseline.
-- NOT authorized. Prefer keeping SQL hardening and reverting only the JS if needed.
-- Requires a separate explicit decision and the opt-in below, inside this transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- SET LOCAL fixeo.p0.allow_insecure_rollback = 'I_ACCEPT_REOPENING_P0';
DO $guard$ BEGIN
  IF current_setting('fixeo.p0.allow_insecure_rollback',true) IS DISTINCT FROM 'I_ACCEPT_REOPENING_P0' THEN
    RAISE EXCEPTION 'Rollback blocked: this would reopen the P0 vulnerability';
  END IF;
END $guard$;
LOCK TABLE public.users, public.profiles, public.service_requests,
  public.missions, public.notifications, public.enterprise_leads,
  public.estimator_context_redemptions IN SHARE ROW EXCLUSIVE MODE;
ALTER POLICY "enterprise_leads_admin_select" ON public.enterprise_leads
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

ALTER POLICY "enterprise_leads_admin_update" ON public.enterprise_leads
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

ALTER POLICY "ecr_admin_select" ON public.estimator_context_redemptions
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

ALTER POLICY "admin_all_missions" ON public.missions
  USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE (((u.id)::text = (auth.uid())::text) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users u
  WHERE (((u.id)::text = (auth.uid())::text) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text))))));

ALTER POLICY "admin_all_notifications" ON public.notifications
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text)))));

ALTER POLICY "profiles_insert_own" ON public.profiles
  WITH CHECK ((auth.uid() = id));

ALTER POLICY "admin_all_service_requests" ON public.service_requests
  USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));

ALTER POLICY "users_insert_own" ON public.users
  WITH CHECK ((auth.uid() = id));
DROP TRIGGER enforce_profiles_canonical_role_p0 ON public.profiles;
DROP FUNCTION fixeo_private.enforce_profile_canonical_role_p0();
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.users, public.profiles TO anon, authenticated;
COMMIT;
