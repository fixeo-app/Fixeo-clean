-- ============================================================
-- FIXEO — RLS Policies extras + service role bypass
-- Run AFTER schema.sql
-- ============================================================

-- Service role bypass (for migration script running with service key)
-- In your Supabase project settings, the service_role key bypasses RLS automatically.
-- Nothing to add here — just use service_role key when running migrateLocalToSupabase()
-- from a server environment.

-- Allow unauthenticated reads on artisans (public listing)
-- Already covered by "artisans_public_read" policy in schema.sql

-- Allow unauthenticated claim submissions (phone-verified flows)
ALTER POLICY "claims_insert" ON public.claim_requests
  USING (TRUE)
  WITH CHECK (TRUE);

-- Optional: Artisan self-update only their own editable fields
-- (Enforced at application layer too, but this adds DB-level protection)
CREATE POLICY "artisans_self_fields" ON public.artisans
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (
    owner_user_id = auth.uid()
    -- city, full_name, id, created_at cannot be changed by owner — enforced by app
  );
