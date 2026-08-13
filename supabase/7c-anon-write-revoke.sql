-- ============================================================
-- FIXEO — Anon Write Privilege Hardening
-- File: supabase/7c-anon-write-revoke.sql
-- Version: v1a — 2026-08-13
-- Safe to re-run: REVOKE is idempotent (no-ops if privilege absent)
-- ============================================================
-- CONTEXT:
--   Production forensic confirmed anon has table-level
--   INSERT, DELETE on public.artisans and
--   INSERT, UPDATE, DELETE on public.portfolio_items.
--   These were never intentionally granted; they come from
--   Supabase project-default GRANT ALL ON ... TO anon.
--
--   7C.12A.2 already REVOKED table-level UPDATE on artisans from anon.
--   This file completes the hardening by revoking INSERT and DELETE.
--
-- WHAT IS PRESERVED:
--   anon SELECT on artisans               — public marketplace reads ✅
--   anon SELECT on portfolio_items        — public portfolio display ✅
--   authenticated INSERT/DELETE on portfolio_items — artisan gallery ✅
--   authenticated column UPDATE on artisans (5 safe fields) — profile edit ✅
--   All RLS policies (unchanged)          — remain as defined          ✅
--   Storage bucket + policies (unchanged) — not touched                ✅
--
-- WHAT IS REMOVED (never intentionally granted):
--   anon INSERT on artisans               — anon cannot create artisan rows
--   anon DELETE on artisans               — anon cannot delete artisan rows
--   anon INSERT on portfolio_items        — anon cannot upload gallery items
--   anon UPDATE on portfolio_items        — anon cannot edit gallery items
--   anon DELETE on portfolio_items        — anon cannot delete gallery items
-- ============================================================

-- ── artisans: remove anon write privileges ────────────────────
REVOKE INSERT ON public.artisans FROM anon;
REVOKE DELETE ON public.artisans FROM anon;
-- Note: REVOKE UPDATE already applied in 7C.12A.2
-- anon SELECT on artisans is intentionally retained (public marketplace)

-- ── portfolio_items: remove all anon write privileges ─────────
REVOKE INSERT ON public.portfolio_items FROM anon;
REVOKE UPDATE ON public.portfolio_items FROM anon;
REVOKE DELETE ON public.portfolio_items FROM anon;
-- anon SELECT on portfolio_items retained (public portfolio display)

-- ============================================================
-- POST-APPLY: run 7c-anon-write-revoke-verify.sql to confirm
-- ============================================================
