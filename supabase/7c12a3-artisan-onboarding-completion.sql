-- ════════════════════════════════════════════════════════════════════════════
-- 7C.12A.3 — Artisan Onboarding Completion Gate
-- File: 7c12a3-artisan-onboarding-completion.sql
-- Phase: 7C.12A.3
-- Author: Fixeo Engineering
-- Date: 2026-08-13
-- ════════════════════════════════════════════════════════════════════════════
--
-- OBJECTIVE
-- Create public.complete_artisan_onboarding() — the ONLY server-authoritative
-- path that sets artisans.onboarding_completed = true and transitions
-- availability to 'available'.
--
-- 7C.12A.2 already REVOKED table-level UPDATE on public.artisans and did NOT
-- grant UPDATE on onboarding_completed or availability (only via RPC).
-- This RPC closes the final gap: who may call update_artisan_availability()
-- with 'available' requires onboarding_completed=true — which previously had
-- no setter. This RPC atomically sets onboarding_completed=true then calls
-- no external function; it writes both fields in a single UPDATE statement.
--
-- REQUIRED ONBOARDING FIELDS (minimum canonical — no invented fields):
--   full_name        (collected at registration, must be non-empty ≥3 chars)
--   service_category (collected at registration, must be non-empty)
--   city             (collected at registration, must be non-empty)
--   description      (optional at registration — NOT required for completion)
--
-- SECURITY CONTRACT:
--   - Identity: derived exclusively from auth.uid()
--   - Row lock: artisans FOR UPDATE on owner_user_id = auth.uid()
--   - Pre-conditions: claimed=true, claim_status='approved', required fields
--   - Atomically sets: onboarding_completed=true, availability='available'
--   - Never writes: verified, owner_user_id, claimed, claim_status
--   - Idempotent: already-completed returns ok:true reason:'already_completed'
--   - SECURITY DEFINER with SET search_path=''
--   - REVOKE from PUBLIC/anon; GRANT to authenticated + service_role
--
-- COLUMN WRITABILITY (post-7C.12A.2+7C.12A.3):
--   onboarding_completed → complete_artisan_onboarding() ONLY
--   availability         → update_artisan_availability() (gated) or this RPC
--   owner_user_id        → register_new_artisan() ONLY (auth.uid())
--   claimed              → register_new_artisan() ONLY
--   claim_status         → approve/reject_artisan_claim() ONLY (7C.12A.1)
--   verified             → admin only (no RPC path)
--
-- RETURN VALUES (ok:false):
--   unauthenticated   — no auth session
--   not_owner         — no artisan row for this uid
--   not_approved      — claimed=false or claim_status!='approved'
--   profile_incomplete— required field(s) missing (full_name/service_cat/city)
-- RETURN VALUES (ok:true):
--   already_completed — idempotent: was already onboarding_completed=true
--   completed         — transition applied; artisan is now dispatch-eligible
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: complete_artisan_onboarding() SECURITY DEFINER RPC
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_artisan_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid               uuid;
  v_artisan_id        uuid;
  v_full_name         text;
  v_service_category  text;
  v_city              text;
  v_claimed           boolean;
  v_claim_status      text;
  v_onboarding_done   boolean;
  v_missing_fields    text[];
BEGIN

  -- ── Guard: authentication ─────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Lock owned artisan row ────────────────────────────────────────────────
  -- PRE-READ (non-locking) is unnecessary; go straight to locking SELECT
  -- because we need all fields in one pass and there is no secondary lock.
  SELECT
    a.id,
    a.full_name,
    a.service_category,
    a.city,
    a.claimed,
    a.claim_status,
    a.onboarding_completed
  INTO
    v_artisan_id,
    v_full_name,
    v_service_category,
    v_city,
    v_claimed,
    v_claim_status,
    v_onboarding_done
  FROM public.artisans a
  WHERE a.owner_user_id = v_uid
  LIMIT 1
  FOR UPDATE;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner',
      'message', 'Aucun profil artisan trouvé pour ce compte.');
  END IF;

  -- ── Idempotency: already completed ───────────────────────────────────────
  IF v_onboarding_done = true THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'already_completed',
      'artisan_id', v_artisan_id
    );
  END IF;

  -- ── Guard: must be approved ───────────────────────────────────────────────
  IF v_claimed IS NOT TRUE OR v_claim_status != 'approved' THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'not_approved',
      'message', 'Le compte artisan doit être approuvé avant de compléter le profil.'
    );
  END IF;

  -- ── Guard: required profile fields ───────────────────────────────────────
  -- Minimum canonical fields: full_name (≥3 chars), service_category, city.
  -- description is optional — not required for dispatch eligibility.
  v_missing_fields := ARRAY[]::text[];
  IF length(trim(COALESCE(v_full_name, ''))) < 3 THEN
    v_missing_fields := v_missing_fields || ARRAY['full_name'];
  END IF;
  IF length(trim(COALESCE(v_service_category, ''))) = 0 THEN
    v_missing_fields := v_missing_fields || ARRAY['service_category'];
  END IF;
  IF length(trim(COALESCE(v_city, ''))) = 0 THEN
    v_missing_fields := v_missing_fields || ARRAY['city'];
  END IF;

  IF array_length(v_missing_fields, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok',             false,
      'reason',         'profile_incomplete',
      'missing_fields', to_jsonb(v_missing_fields),
      'message',        'Profil incomplet. Champs manquants: ' || array_to_string(v_missing_fields, ', ')
    );
  END IF;

  -- ── Atomic completion: set onboarding_completed=true + availability='available' ──
  -- Security invariants maintained:
  --   owner_user_id  NOT written  (never mutated after registration)
  --   claimed        NOT written  (was true; remains true)
  --   claim_status   NOT written  (was 'approved'; remains 'approved')
  --   verified       NOT written  (always false until admin action)
  UPDATE public.artisans
  SET
    onboarding_completed = true,
    availability         = 'available',
    updated_at           = now()
  WHERE id = v_artisan_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'reason',     'completed',
    'artisan_id', v_artisan_id,
    'message',    'Profil complété. Vous êtes maintenant disponible pour recevoir des missions.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[complete_artisan_onboarding] unexpected error for uid %: %', v_uid, SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: REVOKE / GRANT EXECUTE
-- ────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.complete_artisan_onboarding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_artisan_onboarding() FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_artisan_onboarding() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_artisan_onboarding() TO service_role;

COMMIT;
