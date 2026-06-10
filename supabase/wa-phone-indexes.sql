-- ============================================================
-- FIXEO — WhatsApp-First Auth: Phone Unique Indexes
-- wa-phone-indexes.sql
-- Date: 2026-06-10
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
--
-- PURPOSE:
--   Prevent two accounts from registering the same phone number.
--   Morocco phone numbers are globally unique identifiers.
--   Partial indexes: skip empty strings and NULLs.
--
-- SAFE TO RE-RUN: CREATE INDEX IF NOT EXISTS is idempotent.
-- NO RLS changes. NO table structure changes. NO data migration.
-- ============================================================

-- 1. Unique partial index on public.profiles.phone
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- 2. Unique partial index on public.users.phone
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON public.users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- 3. Performance index on public.profiles.phone (for artisan RLS fallback join)
--    phone_public = profiles.phone lookup — used in artisan_read_own_linked_requests
CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- ============================================================
-- VERIFICATION (run each manually after applying):
--
-- V1: unique constraint on profiles — should return 0 duplicate phone rows
-- SELECT phone, COUNT(*) FROM public.profiles
--   WHERE phone IS NOT NULL AND phone <> ''
--   GROUP BY phone HAVING COUNT(*) > 1;
--
-- V2: unique constraint on users — same check
-- SELECT phone, COUNT(*) FROM public.users
--   WHERE phone IS NOT NULL AND phone <> ''
--   GROUP BY phone HAVING COUNT(*) > 1;
--
-- V3: index exists (confirm in psql)
-- SELECT indexname FROM pg_indexes
--   WHERE tablename IN ('profiles','users')
--   AND indexname IN ('profiles_phone_unique','users_phone_unique','idx_profiles_phone');
-- ============================================================
