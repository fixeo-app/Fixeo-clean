-- ============================================================
-- FIXEO — Final Table Privilege Hardening (Least-Privilege)
-- File: supabase/7c-privilege-final-hardening.sql
-- Version: v1a — 2026-08-13
-- Safe to re-run: all REVOKE statements are idempotent
-- ============================================================
-- CONTEXT:
--   Supabase project-default GRANT ALL ON ALL TABLES IN SCHEMA public
--   TO anon, authenticated was applied at project creation.
--   Previous patches removed INSERT/UPDATE/DELETE from anon on
--   artisans and portfolio_items (7c-anon-write-revoke.sql).
--
--   Remaining unnecessary privileges confirmed via production forensic:
--
--   portfolio_items — anon:
--     REFERENCES, TRIGGER, TRUNCATE (never needed; Supabase default only)
--
--   portfolio_items — authenticated:
--     UPDATE     (no application path; no RLS UPDATE policy; intentionally absent)
--     REFERENCES (never needed at runtime; FK creation = migration/DBA only)
--     TRIGGER    (never needed at runtime; triggers created by postgres/service_role)
--     TRUNCATE   (bypasses RLS entirely — dangerous; never needed at runtime)
--
--   artisans — anon:
--     REFERENCES, TRIGGER, TRUNCATE (never needed; Supabase default only)
--
--   artisans — authenticated:
--     REFERENCES, TRIGGER, TRUNCATE (never needed; Supabase default only)
--     Note: table-level UPDATE already REVOKED in 7C.12A.2.
--           Re-REVOKE here is idempotent safety net.
--
-- WHAT IS PRESERVED (not touched):
--   anon SELECT on portfolio_items         — public portfolio display ✅
--   anon SELECT on artisans                — public marketplace read  ✅
--   authenticated SELECT on portfolio_items                           ✅
--   authenticated INSERT on portfolio_items (gallery upload)          ✅
--   authenticated DELETE on portfolio_items (gallery delete)          ✅
--   authenticated column UPDATE on artisans (5 safe profile fields)   ✅
--   authenticated photo_url column UPDATE on artisans                 ✅
--   service_role ALL on portfolio_items                               ✅
--   service_role ALL on artisans                                      ✅
--   All RLS policies (not touched)                                    ✅
--   All storage.objects policies (not touched)                        ✅
--   All RPCs (not touched)                                            ✅
--
-- TRUNCATE NOTE:
--   TRUNCATE bypasses row-level security in PostgreSQL. Leaving it
--   on anon or authenticated is a critical misconfiguration regardless
--   of other RLS controls — must be revoked.
-- ============================================================

-- ── portfolio_items: remove remaining unnecessary anon privileges
REVOKE REFERENCES ON public.portfolio_items FROM anon;
REVOKE TRIGGER    ON public.portfolio_items FROM anon;
REVOKE TRUNCATE   ON public.portfolio_items FROM anon;

-- ── portfolio_items: remove unnecessary authenticated privileges ─
REVOKE UPDATE     ON public.portfolio_items FROM authenticated;
-- (No RLS UPDATE policy exists; no application path uses UPDATE on portfolio_items)
REVOKE REFERENCES ON public.portfolio_items FROM authenticated;
REVOKE TRIGGER    ON public.portfolio_items FROM authenticated;
REVOKE TRUNCATE   ON public.portfolio_items FROM authenticated;

-- ── artisans: remove remaining unnecessary anon privileges ───────
REVOKE REFERENCES ON public.artisans FROM anon;
REVOKE TRIGGER    ON public.artisans FROM anon;
REVOKE TRUNCATE   ON public.artisans FROM anon;
-- (INSERT, DELETE, UPDATE already revoked in prior patches)

-- ── artisans: remove unnecessary authenticated privileges ────────
-- Table-level UPDATE already REVOKED in 7C.12A.2; idempotent safety net:
REVOKE UPDATE     ON public.artisans FROM authenticated;
REVOKE REFERENCES ON public.artisans FROM authenticated;
REVOKE TRIGGER    ON public.artisans FROM authenticated;
REVOKE TRUNCATE   ON public.artisans FROM authenticated;
-- Column-specific UPDATE grants (full_name, service_category, city,
-- description, work_zone, photo_url) are NOT affected by REVOKE of
-- table-level UPDATE — column grants are independent in PostgreSQL.

-- ============================================================
-- FINAL INTENDED PRIVILEGE MATRIX:
--
-- public.portfolio_items:
--   anon:          SELECT
--   authenticated: SELECT, INSERT, DELETE
--   service_role:  ALL (unchanged)
--
-- public.artisans:
--   anon:          SELECT
--   authenticated: SELECT (+ column UPDATE via column grants — 6 fields)
--   service_role:  ALL (unchanged)
--
-- POST-APPLY: run 7c-privilege-final-hardening-verify.sql to confirm
-- ============================================================
