-- ============================================================
-- FIXEO — 7C.9M.1 Estimator Verified Price → Request Binding
-- File: supabase/7c9m1-estimator-request-binding.sql
--
-- PURPOSE
-- -------
-- Bind one server-verified estimator pricing context to the
-- canonical service_request created after client confirmation.
--
-- IMPORTANT
-- ---------
-- - Does NOT change estimator pricing.
-- - Does NOT create any service_request.
-- - Does NOT dispatch any artisan.
-- - Does NOT mutate existing rows.
-- - Does NOT expose estimator pricing to the browser.
-- - Existing estimator_context_redemptions remains the
--   canonical server-side price/idempotency record.
--
-- FLOW AFTER THIS FOUNDATION
-- --------------------------
-- pricing_context_token
--   → server verification
--   → estimator_context_redemptions
--   → service_requests
--   → dispatch
--
-- One estimator context may bind to at most one service_request.
-- One service_request may bind to at most one estimator context.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. HARD PRECONDITIONS
-- ============================================================

DO $$
BEGIN

  IF pg_catalog.to_regclass(
    'public.estimator_context_redemptions'
  ) IS NULL THEN
    RAISE EXCEPTION
      '7C.9M.1 ABORT: public.estimator_context_redemptions is missing';
  END IF;

  IF pg_catalog.to_regclass(
    'public.service_requests'
  ) IS NULL THEN
    RAISE EXCEPTION
      '7C.9M.1 ABORT: public.service_requests is missing';
  END IF;

END;
$$;


-- ============================================================
-- 2. ADD REQUEST BINDING
-- ============================================================
--
-- Nullable by design:
-- existing estimator redemption rows remain untouched.
--
-- It is populated only after the canonical service_request has
-- been successfully created server-side.
-- ============================================================

ALTER TABLE public.estimator_context_redemptions
  ADD COLUMN IF NOT EXISTS service_request_id uuid;


COMMENT ON COLUMN
  public.estimator_context_redemptions.service_request_id
IS
  'Canonical service_requests.id created from this verified '
  'estimator pricing context. Server-side binding only. '
  'NULL until the client confirms the intervention.';


-- ============================================================
-- 3. FOREIGN KEY — NO ORPHAN REQUEST BINDING
-- ============================================================

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid =
      'public.estimator_context_redemptions'::regclass
      AND conname =
        'estimator_context_redemptions_service_request_fk'
  ) THEN

    ALTER TABLE public.estimator_context_redemptions
      ADD CONSTRAINT
        estimator_context_redemptions_service_request_fk
      FOREIGN KEY (service_request_id)
      REFERENCES public.service_requests(id)
      ON DELETE RESTRICT;

  END IF;

END;
$$;


-- ============================================================
-- 4. ONE REQUEST PER VERIFIED PRICING CONTEXT
-- ============================================================
--
-- context_id is already UNIQUE.
--
-- This additional partial UNIQUE index guarantees that the same
-- service_request cannot accidentally be attached to multiple
-- estimator contexts.
--
-- NULL values remain valid for historical/uncommitted contexts.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  estimator_context_redemptions_service_request_id_unique
ON public.estimator_context_redemptions(service_request_id)
WHERE service_request_id IS NOT NULL;


-- ============================================================
-- 5. SECURITY CONTRACT
-- ============================================================
--
-- No new GRANT.
--
-- Existing estimator_context_redemptions security remains
-- authoritative:
--
-- anon          → no access
-- authenticated → no direct writes
-- service_role  → server-side writes only
--
-- RLS / FORCE RLS are preserved unchanged.
-- ============================================================


COMMIT;
