-- ============================================================
-- FIXEO — Cockpit V1: Gallery + Profile Photo Backend
-- File: supabase/7c-cockpit-gallery-photo.sql
-- Version: v1a — 2026-08-13
-- Safe to re-run: all statements are idempotent
-- Applies: portfolio_items table + artisan-media storage policies
-- ============================================================
-- APPLY ORDER: after 7C.12A.3 (artisan onboarding completion gate)
-- ============================================================

-- ── Step 1: portfolio_items metadata table ────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id   text        NOT NULL,   /* auth.uid()::text — matches storage path */
  image_url    text        NOT NULL DEFAULT '',
  description  text        NOT NULL DEFAULT '',
  source       text        NOT NULL DEFAULT 'dashboard_upload',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Fast artisan lookup
CREATE INDEX IF NOT EXISTS portfolio_items_artisan_idx
  ON public.portfolio_items (artisan_id, created_at DESC);

-- ── Step 2: RLS ───────────────────────────────────────────────
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_public_read"        ON public.portfolio_items;
DROP POLICY IF EXISTS "portfolio_artisan_insert"     ON public.portfolio_items;
DROP POLICY IF EXISTS "portfolio_artisan_delete"     ON public.portfolio_items;
DROP POLICY IF EXISTS "portfolio_no_cross_update"    ON public.portfolio_items;

-- Anyone can read (public profile display)
CREATE POLICY "portfolio_public_read"
  ON public.portfolio_items FOR SELECT
  USING (true);

-- Artisan can insert own items only (artisan_id = auth.uid()::text)
CREATE POLICY "portfolio_artisan_insert"
  ON public.portfolio_items FOR INSERT
  TO authenticated
  WITH CHECK (artisan_id = auth.uid()::text);

-- Artisan can delete own items only
CREATE POLICY "portfolio_artisan_delete"
  ON public.portfolio_items FOR DELETE
  TO authenticated
  USING (artisan_id = auth.uid()::text);

-- No UPDATE policy — artisans cannot edit image_url/artisan_id after insert

-- ── Step 3: Grants ───────────────────────────────────────────
GRANT SELECT                    ON public.portfolio_items TO anon;
GRANT SELECT, INSERT, DELETE    ON public.portfolio_items TO authenticated;
GRANT ALL                       ON public.portfolio_items TO service_role;

-- ── Step 4: Storage bucket + policies ────────────────────────
-- Bucket must be created via Supabase dashboard or API (cannot be done in SQL).
-- Bucket name: artisan-media
-- Settings:    public=true, file_size_limit=8MB, allowed_mime_types=image/*
--
-- STORAGE RLS POLICIES (run after bucket creation):

-- Allow public read of artisan-media bucket
DROP POLICY IF EXISTS "artisan_media_public_read"   ON storage.objects;
CREATE POLICY "artisan_media_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'artisan-media');

-- Artisan can upload to their own path: profiles/{uid}/...
DROP POLICY IF EXISTS "artisan_media_owner_upload"  ON storage.objects;
CREATE POLICY "artisan_media_owner_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'artisan-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Artisan can update own objects (upsert profile photo)
DROP POLICY IF EXISTS "artisan_media_owner_update"  ON storage.objects;
CREATE POLICY "artisan_media_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'artisan-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Artisan can delete own gallery photos
DROP POLICY IF EXISTS "artisan_media_owner_delete"  ON storage.objects;
CREATE POLICY "artisan_media_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'artisan-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── Step 5: Verification ─────────────────────────────────────
/*
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename='portfolio_items';

SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='portfolio_items';

SELECT name, public, file_size_limit FROM storage.buckets WHERE name='artisan-media';
*/

-- ── NOTES ─────────────────────────────────────────────────────
-- artisan_id TEXT (not UUID) matches auth.uid()::text for storage path ownership.
-- Storage policies use (storage.foldername(name))[2] = auth.uid()::text
--   to ensure an artisan cannot upload to another artisan's path.
-- photo_url is stored in artisans.photo_url (column grant already active).
-- No service_role key exposed to browser — all uploads use anon/authenticated client.
-- ============================================================
