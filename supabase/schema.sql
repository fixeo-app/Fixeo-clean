-- ============================================================
-- FIXEO — Supabase Schema (idempotent, safe to re-run)
-- ============================================================
-- Paste this entire file into:
--   Supabase Dashboard → SQL Editor → New query → Run
--
-- Safe to run on an existing database:
--   - CREATE TABLE IF NOT EXISTS
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   - DROP POLICY IF EXISTS before CREATE POLICY
--   - CREATE OR REPLACE for functions and views
--   - CREATE INDEX IF NOT EXISTS
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'client',
  email      TEXT,
  full_name  TEXT NOT NULL DEFAULT '',
  phone      TEXT DEFAULT '',
  city       TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if table already existed
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role      TEXT NOT NULL DEFAULT 'client';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email     TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone     TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city      TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add CHECK constraint safely (ignore if already exists)
DO $$
BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'artisan', 'client'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_read"   ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;
DROP POLICY IF EXISTS "users_admin_read"  ON public.users;
DROP POLICY IF EXISTS "users_insert_own"  ON public.users;

CREATE POLICY "users_self_read"   ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_admin_read"  ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
CREATE POLICY "users_insert_own"  ON public.users FOR INSERT WITH CHECK (auth.uid() = id);


-- ============================================================
-- TABLE: artisans
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artisans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);

-- Add every required column individually (safe if any already exist)
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS legacy_id            TEXT;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS public_slug          TEXT;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS full_name            TEXT NOT NULL DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS city                 TEXT NOT NULL DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS description          TEXT DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS experience           TEXT DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS photo_url            TEXT DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS service_category     TEXT NOT NULL DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS services             JSONB DEFAULT '[]';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS work_zone            TEXT DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS phone_public         TEXT DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS availability         TEXT NOT NULL DEFAULT 'available';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS verified             BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS claimed              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS claim_status         TEXT NOT NULL DEFAULT 'unclaimed';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS owner_user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS rating               NUMERIC(3,1) DEFAULT 0.0;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS review_count         INTEGER DEFAULT 0;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS price_from           INTEGER DEFAULT NULL;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS price_label          TEXT DEFAULT '';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS source               TEXT DEFAULT 'admin';
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Unique constraints (safe)
DO $$
BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_legacy_id_unique UNIQUE (legacy_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_slug_unique UNIQUE (public_slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints (safe)
DO $$
BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_availability_check
    CHECK (availability IN ('available', 'busy', 'unavailable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_claim_status_check
    CHECK (claim_status IN ('unclaimed', 'pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_rating_check
    CHECK (rating >= 0 AND rating <= 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_review_count_check
    CHECK (review_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artisans_legacy_id    ON public.artisans(legacy_id);
CREATE INDEX IF NOT EXISTS idx_artisans_city         ON public.artisans(city);
CREATE INDEX IF NOT EXISTS idx_artisans_service      ON public.artisans(service_category);
CREATE INDEX IF NOT EXISTS idx_artisans_availability ON public.artisans(availability);
CREATE INDEX IF NOT EXISTS idx_artisans_claimed      ON public.artisans(claimed);
CREATE INDEX IF NOT EXISTS idx_artisans_verified     ON public.artisans(verified);
CREATE INDEX IF NOT EXISTS idx_artisans_owner        ON public.artisans(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_artisans_rating       ON public.artisans(rating DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS artisans_updated_at ON public.artisans;
CREATE TRIGGER artisans_updated_at
  BEFORE UPDATE ON public.artisans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artisans_public_read"   ON public.artisans;
DROP POLICY IF EXISTS "artisans_owner_update"  ON public.artisans;
DROP POLICY IF EXISTS "artisans_admin_write"   ON public.artisans;

CREATE POLICY "artisans_public_read" ON public.artisans
  FOR SELECT USING (TRUE);

CREATE POLICY "artisans_owner_update" ON public.artisans
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "artisans_admin_write" ON public.artisans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );


-- ============================================================
-- TABLE: claim_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.claim_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);

ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS artisan_id        UUID REFERENCES public.artisans(id) ON DELETE CASCADE;
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS artisan_legacy_id TEXT;
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS requester_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS requester_name    TEXT DEFAULT '';
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS requester_phone   TEXT DEFAULT '';
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS onboarding_data   JSONB DEFAULT '{}';
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS notes             TEXT DEFAULT '';
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.claim_requests ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.claim_requests ADD CONSTRAINT claims_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_claims_artisan_id  ON public.claim_requests(artisan_id);
CREATE INDEX IF NOT EXISTS idx_claims_requester   ON public.claim_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_status      ON public.claim_requests(status);
CREATE INDEX IF NOT EXISTS idx_claims_legacy      ON public.claim_requests(artisan_legacy_id);

ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_requester_read" ON public.claim_requests;
DROP POLICY IF EXISTS "claims_insert"         ON public.claim_requests;
DROP POLICY IF EXISTS "claims_admin_all"      ON public.claim_requests;

CREATE POLICY "claims_requester_read" ON public.claim_requests
  FOR SELECT USING (requester_user_id = auth.uid());

CREATE POLICY "claims_insert" ON public.claim_requests
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "claims_admin_all" ON public.claim_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );


-- ============================================================
-- TRIGGER: auto-approve artisan when claim is approved
-- ============================================================
CREATE OR REPLACE FUNCTION sync_artisan_claim()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    UPDATE public.artisans
    SET
      claimed              = TRUE,
      claim_status         = 'approved',
      owner_user_id        = NEW.requester_user_id,
      onboarding_completed = (NEW.onboarding_data IS NOT NULL AND NEW.onboarding_data <> '{}'),
      verified             = TRUE,
      updated_at           = NOW()
    WHERE id = NEW.artisan_id OR legacy_id = NEW.artisan_legacy_id;
  END IF;

  IF NEW.status = 'rejected' AND OLD.status <> 'rejected' THEN
    UPDATE public.artisans
    SET claim_status = 'rejected', updated_at = NOW()
    WHERE id = NEW.artisan_id OR legacy_id = NEW.artisan_legacy_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS claim_approval_sync ON public.claim_requests;
CREATE TRIGGER claim_approval_sync
  AFTER UPDATE ON public.claim_requests
  FOR EACH ROW EXECUTE FUNCTION sync_artisan_claim();


-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.artisans_available AS
  SELECT * FROM public.artisans
  WHERE availability = 'available'
  ORDER BY rating DESC, review_count DESC;

CREATE OR REPLACE VIEW public.claims_pending AS
  SELECT
    cr.*,
    a.full_name        AS artisan_name,
    a.city             AS artisan_city,
    a.service_category AS artisan_service
  FROM public.claim_requests cr
  JOIN public.artisans a
    ON (a.id = cr.artisan_id OR a.legacy_id = cr.artisan_legacy_id)
  WHERE cr.status = 'pending'
  ORDER BY cr.created_at ASC;


-- ============================================================
-- DONE
-- All tables, columns, indexes, RLS policies, triggers, and
-- views are now in place. Existing rows are untouched.
--
-- Run this in your browser console on admin.html:
--   await FixeoRepository.migrateLocalToSupabase()
-- ============================================================
