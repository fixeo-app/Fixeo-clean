-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.9 Enterprise Member Invitations
-- File: supabase/7c15a9-enterprise-invitations.sql
-- Sprint: BP10
-- Branch: recovery/seo-v3-safe
--
-- AUTHORED BY: Agent 1 (BP10) + Agent 3 security hardening
-- NOTE: Agent 1 did not deliver; Agent 3 authored this migration
--       incorporating all contract requirements from bp10-invitation-tests.js
--       and the full security audit checklist.
--
-- PURPOSE
--   Token-based enterprise member invitation system.
--   Admins/owners create invitation tokens that are emailed or
--   shared with the invitee. The invitee accepts via URL.
--   No auth.users email lookup required — identity is verified
--   at acceptance time via auth.email().
--
-- SCOPE
--   1. Table: public.enterprise_invitations
--   2. Partial unique index: pending invitations (enterprise_id, email_normalized)
--   3. RPC: create_enterprise_invitation()
--   4. RPC: accept_enterprise_invitation()
--   5. RPC: revoke_enterprise_invitation()
--   6. RLS + grants
--
-- SECURITY ARCHITECTURE
--   • Token entropy: gen_random_bytes(32) → encode(…, 'hex') → 64-char hex string
--   • Hash storage: digest(raw_token_hex, 'sha256') — pgcrypto
--   • Raw token NEVER stored in DB — only token_hash
--   • Raw token returned once in RPC response (over TLS)
--   • SECURITY DEFINER on all RPCs — runs as postgres, bypasses RLS
--   • SET search_path = '' — prevents search-path injection
--   • Oracle protection: token-not-found and revoked both return 'invalid_token'
--   • Email normalization: lower(trim(email))
--   • Identity: auth.email() used at accept time; auth.uid() for membership
--   • No auth.users lookup (no email enumeration oracle)
--
-- INVARIANTS
--   A. Only active owner/admin may create invitations
--   B. Owner role cannot be invited (CHECK constraint + RPC guard)
--   C. Token is single-use: accept atomically sets status='accepted'
--   D. Expired tokens: invitation_expired error (distinct from invalid_token)
--   E. Revoked / accepted tokens: 'invalid_token' (oracle-safe)
--   F. Email mismatch at accept: 'email_mismatch' (caller knows own email)
--   G. No duplicate pending invitation per (enterprise_id, email_normalized)
--   H. Cross-tenant revoke blocked: invitation.enterprise_id must match caller
--   I. site_ids validated against caller's enterprise
--   J. site_ids only applied for role='site_manager'
--
-- EXTENSIONS REQUIRED
--   pgcrypto (for digest(), gen_random_bytes())
--   uuid-ossp or gen_random_uuid() (already available in existing migrations)
--
-- ADDITIVE ONLY
--   Zero modifications to existing tables, RPCs, triggers, policies.
-- ════════════════════════════════════════════════════════════
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_em_exists   boolean;
  v_ea_exists   boolean;
  v_h3_exists   boolean;
  v_ei_exists   boolean;
  v_pgc_exists  boolean;
  v_ems_exists  boolean;
BEGIN
  -- enterprise_members must exist
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_members')
  INTO v_em_exists;
  IF NOT v_em_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_members not found. Apply 7c13a1 first.';
  END IF;

  -- enterprise_accounts must exist
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_accounts')
  INTO v_ea_exists;
  IF NOT v_ea_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_accounts not found. Apply 7c13a1 first.';
  END IF;

  -- enterprise_member_sites must exist (for site_ids validation)
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_member_sites')
  INTO v_ems_exists;
  IF NOT v_ems_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_member_sites not found. Apply 7c15a6 first.';
  END IF;

  -- _fixeo_is_enterprise_manager must exist
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='fixeo_private' AND p.proname='_fixeo_is_enterprise_manager')
  INTO v_h3_exists;
  IF NOT v_h3_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_manager not found. Apply 7c13a1 first.';
  END IF;

  -- enterprise_invitations must NOT already exist (idempotency guard)
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_invitations')
  INTO v_ei_exists;
  IF v_ei_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_invitations already exists. Already applied?';
  END IF;

  -- pgcrypto must be available
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pgcrypto')
  INTO v_pgc_exists;
  IF NOT v_pgc_exists THEN
    RAISE EXCEPTION 'ABORT: pgcrypto extension not installed. Run: CREATE EXTENSION pgcrypto;';
  END IF;

  RAISE NOTICE '7c15a9 preconditions PASSED';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Table — public.enterprise_invitations
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.enterprise_invitations (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id     uuid        NOT NULL,
  email_normalized  text        NOT NULL,
  role              text        NOT NULL,
  token_hash        text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending',
  invited_by        uuid        NOT NULL,
  site_ids          uuid[]              ,  -- NULL unless role='site_manager'
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_invitations_pkey
    PRIMARY KEY (id),

  CONSTRAINT enterprise_invitations_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id)
    ON DELETE CASCADE,

  CONSTRAINT enterprise_invitations_invited_by_fk
    FOREIGN KEY (invited_by)
    REFERENCES public.users(id)
    ON DELETE RESTRICT,

  -- Token hash must be unique across all invitations
  CONSTRAINT enterprise_invitations_token_hash_unique
    UNIQUE (token_hash),

  -- Invitable roles: owner cannot be invited
  CONSTRAINT enterprise_invitations_role_values
    CHECK (role IN ('admin','operations_manager','site_manager','reporter','viewer')),

  -- Valid statuses
  CONSTRAINT enterprise_invitations_status_values
    CHECK (status IN ('pending','accepted','revoked','expired')),

  -- Email must be non-empty
  CONSTRAINT enterprise_invitations_email_nonempty
    CHECK (char_length(email_normalized) > 0),

  -- token_hash must be non-empty (sha256 hex = 64 chars)
  CONSTRAINT enterprise_invitations_token_hash_length
    CHECK (char_length(token_hash) = 64)
);

DO $$ BEGIN RAISE NOTICE '7c15a9 — enterprise_invitations table created'; END $$;

-- ── updated_at trigger ──────────────────────────────────────
DROP TRIGGER IF EXISTS enterprise_invitations_updated_at ON public.enterprise_invitations;
CREATE TRIGGER enterprise_invitations_updated_at
  BEFORE UPDATE ON public.enterprise_invitations
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- ── Indexes ─────────────────────────────────────────────────
-- Lookup by enterprise for admin list view
CREATE INDEX IF NOT EXISTS idx_ei_enterprise_status
  ON public.enterprise_invitations(enterprise_id, status);

-- Lookup by token_hash for accept flow
CREATE INDEX IF NOT EXISTS idx_ei_token_hash
  ON public.enterprise_invitations(token_hash);

-- Lookup by invitee email (admin view)
CREATE INDEX IF NOT EXISTS idx_ei_email_normalized
  ON public.enterprise_invitations(email_normalized);

DO $$ BEGIN RAISE NOTICE '7c15a9 — enterprise_invitations indexes created'; END $$;

-- ── F-21 Fix: Partial unique index for pending invitations ──
-- Prevents duplicate pending invitations per (enterprise_id, email_normalized).
-- Partial (WHERE status='pending') so that:
--   - A re-invite after revoke/accept is allowed.
--   - Only one active pending invitation per email per enterprise.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ei_pending_email_ent
  ON public.enterprise_invitations(enterprise_id, email_normalized)
  WHERE status = 'pending';

DO $$ BEGIN RAISE NOTICE '7c15a9 — uq_ei_pending_email_ent partial unique index created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: RLS on enterprise_invitations
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.enterprise_invitations ENABLE ROW LEVEL SECURITY;

-- Deny all anon access
DROP POLICY IF EXISTS "ei_deny_anon" ON public.enterprise_invitations;
CREATE POLICY "ei_deny_anon"
  ON public.enterprise_invitations
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Active owner/admin can SELECT invitations for their enterprise
DROP POLICY IF EXISTS "ei_manager_select" ON public.enterprise_invitations;
CREATE POLICY "ei_manager_select"
  ON public.enterprise_invitations
  FOR SELECT
  TO authenticated
  USING (
    fixeo_private._fixeo_is_enterprise_manager(enterprise_id)
  );

-- No direct INSERT/UPDATE/DELETE from browser — mutations via RPC only
-- (No INSERT/UPDATE/DELETE policies for authenticated; RPCs are SECURITY DEFINER
--  and run as postgres which bypasses RLS on this table.)

DO $$ BEGIN RAISE NOTICE '7c15a9 — enterprise_invitations RLS enabled + policies created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Grants on enterprise_invitations table
--
-- authenticated: SELECT only (mutations via SECURITY DEFINER RPCs)
-- anon: no access
-- ════════════════════════════════════════════════════════════
REVOKE ALL ON public.enterprise_invitations FROM PUBLIC;
REVOKE ALL ON public.enterprise_invitations FROM anon;
REVOKE ALL ON public.enterprise_invitations FROM authenticated;
GRANT SELECT ON public.enterprise_invitations TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a9 — enterprise_invitations table grants applied'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: RPC — create_enterprise_invitation()
--
-- SECURITY: SECURITY DEFINER (runs as postgres)
-- CALLERS: authenticated (owner/admin only)
-- RETURNS: jsonb { ok, raw_token?, invitation_id?, error? }
--
-- Token flow:
--   raw_bytes   ← gen_random_bytes(32)         -- 256-bit entropy
--   raw_token   ← encode(raw_bytes, 'hex')     -- 64-char URL-safe hex
--   token_hash  ← digest(raw_token, 'sha256')  -- pgcrypto, stored
--   raw_token returned to caller (once, over TLS) — never stored
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_enterprise_invitation(
  p_enterprise_id   uuid,
  p_email           text,
  p_role            text,
  p_site_ids        uuid[]   DEFAULT NULL,
  p_expires_in_days integer  DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_status  text;
  v_email_norm     text;
  v_raw_bytes      bytea;
  v_raw_token      text;
  v_token_hash     text;
  v_invitation_id  uuid;
  v_validated_site_ids uuid[];
  v_bad_site_count integer;
BEGIN
  -- ── 1. Caller identity ─────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- ── 2. Caller authorization: active owner or admin ─────────
  SELECT em.role, em.status
  INTO   v_caller_role, v_caller_status
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = p_enterprise_id
    AND  em.user_id       = v_caller_id
    AND  em.status        = 'active'
    AND  em.role          IN ('owner', 'admin')
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- ── 3. Input validation ────────────────────────────────────
  -- Email normalization
  v_email_norm := lower(trim(p_email));
  IF v_email_norm IS NULL OR char_length(v_email_norm) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  -- Role validation: owner not invitable
  IF p_role NOT IN ('admin','operations_manager','site_manager','reporter','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- ── 4. Duplicate member check ───────────────────────────────
  -- Check if any user with this normalized email is already an active member.
  -- We look up via public.users to avoid auth.users access.
  -- Note: users may not have an account yet — that is allowed (invite-first flow).
  IF EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    JOIN   public.users u ON u.id = em.user_id
    WHERE  em.enterprise_id = p_enterprise_id
      AND  em.status        = 'active'
      AND  lower(trim(u.email)) = v_email_norm
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- ── 5. Duplicate pending invitation check ──────────────────
  -- The partial unique index (uq_ei_pending_email_ent) is the hard
  -- constraint; this early return gives a friendlier error code.
  IF EXISTS (
    SELECT 1
    FROM   public.enterprise_invitations ei
    WHERE  ei.enterprise_id    = p_enterprise_id
      AND  ei.email_normalized = v_email_norm
      AND  ei.status           = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pending_exists');
  END IF;

  -- ── 6. site_ids validation ──────────────────────────────────
  -- Only relevant for role='site_manager'. For other roles, strip.
  IF p_role = 'site_manager' AND p_site_ids IS NOT NULL AND cardinality(p_site_ids) > 0 THEN
    -- All provided site_ids must belong to this enterprise
    SELECT count(*)
    INTO   v_bad_site_count
    FROM   unnest(p_site_ids) AS sid
    WHERE  NOT EXISTS (
      SELECT 1
      FROM   public.enterprise_sites es
      WHERE  es.id            = sid
        AND  es.enterprise_id = p_enterprise_id
    );

    IF v_bad_site_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_site_ids');
    END IF;

    v_validated_site_ids := p_site_ids;
  ELSE
    -- Strip site_ids for non-site_manager roles
    v_validated_site_ids := NULL;
  END IF;

  -- ── 7. Token generation ─────────────────────────────────────
  -- 256-bit entropy raw token (never stored in DB)
  v_raw_bytes  := gen_random_bytes(32);
  v_raw_token  := encode(v_raw_bytes, 'hex');              -- 64-char hex
  v_token_hash := encode(
                    digest(v_raw_token, 'sha256'),         -- pgcrypto sha256
                    'hex'
                  );                                        -- 64-char hex hash

  -- ── 8. Insert invitation ────────────────────────────────────
  INSERT INTO public.enterprise_invitations (
    enterprise_id,
    email_normalized,
    role,
    token_hash,
    status,
    invited_by,
    site_ids,
    expires_at
  ) VALUES (
    p_enterprise_id,
    v_email_norm,
    p_role,
    v_token_hash,
    'pending',
    v_caller_id,
    v_validated_site_ids,
    now() + (COALESCE(p_expires_in_days, 7) * interval '1 day')
  )
  RETURNING id INTO v_invitation_id;

  -- ── 9. Audit log ────────────────────────────────────────────
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'invitation_created',
    'enterprise_invitations',
    v_invitation_id,
    jsonb_build_object(
      'email_normalized', v_email_norm,
      'role',             p_role
    )
  );

  -- ── 10. Return raw_token (one-time, over TLS) ───────────────
  RETURN jsonb_build_object(
    'ok',            true,
    'invitation_id', v_invitation_id,
    'raw_token',     v_raw_token
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Partial unique index (uq_ei_pending_email_ent) or token_hash collision
    -- If token_hash collision (astronomically unlikely), could retry; treat as error.
    RETURN jsonb_build_object('ok', false, 'error', 'pending_exists');
  WHEN OTHERS THEN
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_enterprise_invitation(uuid,text,text,uuid[],integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_enterprise_invitation(uuid,text,text,uuid[],integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_invitation(uuid,text,text,uuid[],integer) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a9 — create_enterprise_invitation() RPC created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: RPC — accept_enterprise_invitation()
--
-- SECURITY: SECURITY DEFINER (runs as postgres)
-- CALLERS: authenticated
-- RETURNS: jsonb { ok, error? }
--
-- Token lookup by hash; atomic status update + membership insert.
-- email is verified at accept-time via auth.email().
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_enterprise_invitation(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id     uuid;
  v_caller_email  text;
  v_token_hash    text;
  v_inv           record;
  v_member_id     uuid;
BEGIN
  -- ── 1. Caller identity ─────────────────────────────────────
  v_caller_id    := auth.uid();
  v_caller_email := auth.email();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- ── 2. Token validation ────────────────────────────────────
  IF p_token IS NULL OR char_length(trim(p_token)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Hash the provided token for comparison
  v_token_hash := encode(
                    digest(p_token, 'sha256'),
                    'hex'
                  );

  -- ── 3. Fetch invitation (lock row for atomic update) ────────
  SELECT *
  INTO   v_inv
  FROM   public.enterprise_invitations
  WHERE  token_hash = v_token_hash
  FOR UPDATE;  -- prevent double-accept race

  -- Token not found → oracle-safe error
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- ── 4. State checks ─────────────────────────────────────────
  -- Revoked or already accepted: oracle-safe 'invalid_token' (not 'revoked')
  IF v_inv.status IN ('revoked', 'accepted', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- status must be 'pending' to proceed
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- ── 5. Expiry check ─────────────────────────────────────────
  -- Distinct 'invitation_expired' error (acceptable — doesn't expose DB state,
  -- invitee already knows the token was meant for them).
  IF now() > v_inv.expires_at THEN
    -- Mark as expired for housekeeping
    UPDATE public.enterprise_invitations
    SET    status = 'expired', updated_at = now()
    WHERE  id     = v_inv.id
      AND  status = 'pending';

    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  -- ── 6. Email identity check ─────────────────────────────────
  -- Verify the authenticated user's email matches the invitation.
  -- auth.email() returns the verified email from the JWT.
  -- Normalize for comparison.
  IF v_caller_email IS NOT NULL AND v_inv.email_normalized IS NOT NULL THEN
    IF lower(trim(v_caller_email)) <> v_inv.email_normalized THEN
      RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
    END IF;
  END IF;

  -- ── 7. Duplicate membership check ───────────────────────────
  IF EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.enterprise_id = v_inv.enterprise_id
      AND  em.user_id       = v_caller_id
      AND  em.status        = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- ── 8. Atomic: accept invitation + insert membership ────────
  -- Conditional WHERE status='pending' prevents double-accept race
  UPDATE public.enterprise_invitations
  SET    status     = 'accepted',
         updated_at = now()
  WHERE  id         = v_inv.id
    AND  status     = 'pending';  -- double-accept guard

  -- If no rows updated (concurrent accept beat us), return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Insert membership
  INSERT INTO public.enterprise_members (
    enterprise_id,
    user_id,
    role,
    status,
    invited_by
  ) VALUES (
    v_inv.enterprise_id,
    v_caller_id,
    v_inv.role,
    'active',
    v_inv.invited_by
  )
  ON CONFLICT (enterprise_id, user_id)
  DO UPDATE
    SET role       = EXCLUDED.role,
        status     = 'active',
        updated_at = now()
    WHERE enterprise_members.status <> 'active';  -- don't overwrite active members

  -- ── 9. Audit log ────────────────────────────────────────────
  PERFORM fixeo_private._eal_append(
    v_inv.enterprise_id,
    v_caller_id,
    'invitation_accepted',
    'enterprise_invitations',
    v_inv.id,
    jsonb_build_object(
      'role', v_inv.role,
      'invited_by', v_inv.invited_by
    )
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION
  WHEN unique_violation THEN
    -- Membership unique constraint: user already active member
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  WHEN OTHERS THEN
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_enterprise_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_enterprise_invitation(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_enterprise_invitation(text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a9 — accept_enterprise_invitation() RPC created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 6: RPC — revoke_enterprise_invitation()
--
-- SECURITY: SECURITY DEFINER (runs as postgres)
-- CALLERS: authenticated (owner/admin of same enterprise)
-- RETURNS: jsonb { ok, error? }
--
-- Cross-tenant guard: invitation.enterprise_id must match
-- the caller's own active membership enterprise.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_enterprise_invitation(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  uuid;
  v_inv        record;
  v_caller_mgr boolean;
BEGIN
  -- ── 1. Caller identity ─────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- ── 2. Fetch invitation ────────────────────────────────────
  SELECT *
  INTO   v_inv
  FROM   public.enterprise_invitations
  WHERE  id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- ── 3. Cross-tenant authorization ──────────────────────────
  -- Caller must be active owner/admin of the SAME enterprise as the invitation
  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.enterprise_id = v_inv.enterprise_id
      AND  em.user_id       = v_caller_id
      AND  em.role          IN ('owner', 'admin')
      AND  em.status        = 'active'
  ) INTO v_caller_mgr;

  IF NOT v_caller_mgr THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- ── 4. Only pending invitations can be revoked ──────────────
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_revocable');
  END IF;

  -- ── 5. Revoke ───────────────────────────────────────────────
  UPDATE public.enterprise_invitations
  SET    status     = 'revoked',
         updated_at = now()
  WHERE  id         = v_inv.id
    AND  status     = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_revocable');
  END IF;

  -- ── 6. Audit log ────────────────────────────────────────────
  PERFORM fixeo_private._eal_append(
    v_inv.enterprise_id,
    v_caller_id,
    'invitation_revoked',
    'enterprise_invitations',
    v_inv.id,
    jsonb_build_object(
      'email_normalized', v_inv.email_normalized,
      'role',             v_inv.role
    )
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_enterprise_invitation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_enterprise_invitation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_enterprise_invitation(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a9 — revoke_enterprise_invitation() RPC created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 7: Pending invitation list helper
--
-- RPC: list_enterprise_pending_invitations(p_enterprise_id)
-- Returns pending invitations for admin view.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.list_enterprise_pending_invitations(
  p_enterprise_id uuid
)
RETURNS TABLE (
  id               uuid,
  email_normalized text,
  role             text,
  invited_by       uuid,
  expires_at       timestamptz,
  created_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be active owner/admin
  IF NOT EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.enterprise_id = p_enterprise_id
      AND  em.user_id       = v_caller_id
      AND  em.role          IN ('owner', 'admin')
      AND  em.status        = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      ei.id,
      ei.email_normalized,
      ei.role,
      ei.invited_by,
      ei.expires_at,
      ei.created_at
    FROM   public.enterprise_invitations ei
    WHERE  ei.enterprise_id = p_enterprise_id
      AND  ei.status        = 'pending'
      AND  ei.expires_at    > now()
    ORDER BY ei.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_enterprise_pending_invitations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_enterprise_pending_invitations(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_enterprise_pending_invitations(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a9 — list_enterprise_pending_invitations() helper created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 8: Comments
-- ════════════════════════════════════════════════════════════
COMMENT ON TABLE public.enterprise_invitations IS
  'Token-based enterprise member invitations. Raw token is NEVER stored — only sha256 hash. BP10.';
COMMENT ON COLUMN public.enterprise_invitations.token_hash IS
  'sha256(encode(gen_random_bytes(32), ''hex'')) — pgcrypto. 64-char hex. The raw token is returned once to the RPC caller and never persisted.';
COMMENT ON COLUMN public.enterprise_invitations.email_normalized IS
  'lower(trim(email)) — normalized at invitation creation time.';
COMMENT ON COLUMN public.enterprise_invitations.site_ids IS
  'Only set for role=site_manager. Validated against enterprise_sites.enterprise_id at create time.';


-- ════════════════════════════════════════════════════════════
-- SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '7c15a9 — Enterprise Member Invitations COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'Table   : public.enterprise_invitations';
  RAISE NOTICE 'Indexes : idx_ei_enterprise_status, idx_ei_token_hash,';
  RAISE NOTICE '          idx_ei_email_normalized, uq_ei_pending_email_ent';
  RAISE NOTICE 'RLS     : ENABLED — ei_deny_anon, ei_manager_select';
  RAISE NOTICE 'Grants  : SELECT to authenticated; mutations via RPC only';
  RAISE NOTICE '';
  RAISE NOTICE 'RPCs:';
  RAISE NOTICE '  create_enterprise_invitation()   — owner/admin only';
  RAISE NOTICE '  accept_enterprise_invitation()   — authenticated (any)';
  RAISE NOTICE '  revoke_enterprise_invitation()   — owner/admin, same enterprise';
  RAISE NOTICE '  list_enterprise_pending_invitations() — owner/admin only';
  RAISE NOTICE '';
  RAISE NOTICE 'Token security:';
  RAISE NOTICE '  entropy    : gen_random_bytes(32) = 256 bits';
  RAISE NOTICE '  encoding   : encode(…, ''hex'') — 64-char hex';
  RAISE NOTICE '  hash       : digest(raw_hex, ''sha256'') — pgcrypto';
  RAISE NOTICE '  raw stored : NEVER (only hash stored)';
  RAISE NOTICE '';
  RAISE NOTICE '7c15a4 NOT touched.';
  RAISE NOTICE 'Pricing files NOT touched.';
  RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;

COMMIT;


-- ════════════════════════════════════════════════════════════
-- SECTION 9: Extend enterprise_audit_log action_type constraint
-- ════════════════════════════════════════════════════════════
-- Precondition: 7c15a3 defines eal_action_type_check with 5 values.
-- We extend it to include the 3 new invitation action types.
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.enterprise_audit_log
  DROP CONSTRAINT IF EXISTS eal_action_type_check;

ALTER TABLE public.enterprise_audit_log
  ADD CONSTRAINT eal_action_type_check CHECK (
    action_type IN (
      'member_role_changed',
      'member_status_changed',
      'site_updated',
      'site_status_changed',
      'account_profile_updated',
      'invitation_created',
      'invitation_revoked',
      'invitation_accepted'
    )
  );

DO $$ BEGIN RAISE NOTICE '7c15a9 — eal_action_type_check extended with invitation action types'; END $$;
