-- ============================================================
-- FIXEO — notifications table + RLS
-- File: supabase/notifications-table-v1.sql
-- Version: v1a — 2026-06-11
-- ============================================================
-- Run order: any time (no deps on other pending SQL files)
-- Safe to re-run: all statements are idempotent
-- ============================================================

-- ── Step 1: Create table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role      text        NOT NULL DEFAULT 'client',
  type                text        NOT NULL,
  title               text        NOT NULL DEFAULT '',
  message             text        NOT NULL DEFAULT '',
  related_entity_type text        NOT NULL DEFAULT '',
  related_entity_id   text        NOT NULL DEFAULT '',
  read                boolean     NOT NULL DEFAULT false,
  metadata            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Step 2: Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON public.notifications(recipient_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- ── Step 3: Enable RLS ────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── Step 4: Drop old policies (idempotent) ────────────────────
DROP POLICY IF EXISTS "anon_deny_notifications"              ON public.notifications;
DROP POLICY IF EXISTS "user_read_own_notifications"          ON public.notifications;
DROP POLICY IF EXISTS "user_update_own_notifications"        ON public.notifications;
DROP POLICY IF EXISTS "admin_all_notifications"              ON public.notifications;
DROP POLICY IF EXISTS "service_role_insert_notifications"    ON public.notifications;

-- ── Step 5: RLS policies ──────────────────────────────────────

-- Anon: deny everything
CREATE POLICY "anon_deny_notifications"
  ON public.notifications
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Authenticated: read only their own notifications
CREATE POLICY "user_read_own_notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Authenticated: update (mark-read) only their own notifications
CREATE POLICY "user_update_own_notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING     (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Admin: read all notifications
-- Identifies admin by profiles.role = 'admin'
CREATE POLICY "admin_all_notifications"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE  p.id = auth.uid()
      AND    p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE  p.id = auth.uid()
      AND    p.role = 'admin'
    )
  );

-- Service role: unrestricted (used for server-side inserts)
-- Note: service_role bypasses RLS by default in Supabase
-- No explicit policy needed — service_role is exempt from RLS

-- ── Step 6: Grant permissions ─────────────────────────────────
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL            ON public.notifications TO service_role;

-- ── Step 7: Verification query (run to confirm) ───────────────
/*
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'notifications';

SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY cmd;
*/

-- ── NOTES ─────────────────────────────────────────────────────
-- recipient_user_id is nullable: admin-audience rows may not have
-- a specific user_id (they are broadcast to the admin role).
-- Client/artisan rows always have recipient_user_id set.
--
-- INSERT policy: currently absent for authenticated users.
-- Notifications are written by:
--   (a) fixeo-notification-engine.js — client-side, via FixeoSupabaseClient
--       authenticated as the acting user.
-- If per-user INSERT is required, add:
--   CREATE POLICY "user_insert_own_notifications"
--     ON public.notifications FOR INSERT TO authenticated
--     WITH CHECK (recipient_user_id = auth.uid());
-- Currently we allow inserts via the admin policy only.
-- TODO: add explicit INSERT policy once server-side function is implemented.
