-- ============================================================
-- FIXEO — Supabase Schema Phase 1
-- ============================================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- Tables: users, artisans, claim_requests
-- ============================================================

-- Enable UUID extension (already on by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS (profile table — extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'client'
                CHECK (role IN ('admin', 'artisan', 'client')),
  email        TEXT,
  full_name    TEXT NOT NULL DEFAULT '',
  phone        TEXT DEFAULT '',
  city         TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on role (admin/artisan queries)
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "users_self_read"   ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON public.users FOR UPDATE USING (auth.uid() = id);
-- Admins can read all
CREATE POLICY "users_admin_read"  ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
-- Insert on signup (triggered via service, or during signUp)
CREATE POLICY "users_insert_own"  ON public.users FOR INSERT WITH CHECK (auth.uid() = id);


-- ============================================================
-- 2. ARTISANS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artisans (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id             TEXT UNIQUE,              -- old localStorage string ID (for migration)
  public_slug           TEXT UNIQUE,              -- URL-friendly slug

  -- Identity
  full_name             TEXT NOT NULL DEFAULT '',
  city                  TEXT NOT NULL DEFAULT '',
  description           TEXT DEFAULT '',
  experience            TEXT DEFAULT '',
  photo_url             TEXT DEFAULT '',

  -- Services
  service_category      TEXT NOT NULL DEFAULT '',
  services              JSONB DEFAULT '[]',       -- array of service strings
  work_zone             TEXT DEFAULT '',

  -- Contact (public)
  phone_public          TEXT DEFAULT '',

  -- Availability
  availability          TEXT NOT NULL DEFAULT 'available'
                          CHECK (availability IN ('available', 'busy', 'unavailable')),

  -- Trust & verification
  verified              BOOLEAN NOT NULL DEFAULT FALSE,
  claimed               BOOLEAN NOT NULL DEFAULT FALSE,
  claim_status          TEXT NOT NULL DEFAULT 'unclaimed'
                          CHECK (claim_status IN ('unclaimed', 'pending', 'approved', 'rejected')),
  owner_user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Ratings
  rating                NUMERIC(3,1) DEFAULT 0.0
                          CHECK (rating >= 0 AND rating <= 5),
  review_count          INTEGER DEFAULT 0 CHECK (review_count >= 0),

  -- Pricing
  price_from            INTEGER DEFAULT NULL,     -- MAD
  price_label           TEXT DEFAULT '',

  -- Metadata
  source                TEXT DEFAULT 'admin',     -- 'admin'|'seed'|'master'|'supabase'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artisans_city            ON public.artisans(city);
CREATE INDEX IF NOT EXISTS idx_artisans_service         ON public.artisans(service_category);
CREATE INDEX IF NOT EXISTS idx_artisans_availability    ON public.artisans(availability);
CREATE INDEX IF NOT EXISTS idx_artisans_claimed         ON public.artisans(claimed);
CREATE INDEX IF NOT EXISTS idx_artisans_verified        ON public.artisans(verified);
CREATE INDEX IF NOT EXISTS idx_artisans_owner           ON public.artisans(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_artisans_rating          ON public.artisans(rating DESC);
CREATE INDEX IF NOT EXISTS idx_artisans_legacy_id       ON public.artisans(legacy_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artisans_updated_at
  BEFORE UPDATE ON public.artisans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;

-- Public read (all artisans visible to everyone)
CREATE POLICY "artisans_public_read" ON public.artisans
  FOR SELECT USING (TRUE);

-- Owner can update their own profile (editable fields only)
CREATE POLICY "artisans_owner_update" ON public.artisans
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Admin can insert / update / delete
CREATE POLICY "artisans_admin_write" ON public.artisans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );


-- ============================================================
-- 3. CLAIM_REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.claim_requests (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artisan_id         UUID REFERENCES public.artisans(id) ON DELETE CASCADE,
  artisan_legacy_id  TEXT,                         -- for migration from localStorage

  requester_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requester_name     TEXT DEFAULT '',              -- captured at claim time
  requester_phone    TEXT DEFAULT '',

  onboarding_data    JSONB DEFAULT '{}',           -- full onboarding form snapshot

  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected')),
  notes              TEXT DEFAULT '',              -- admin note on review

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at        TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_claims_artisan_id  ON public.claim_requests(artisan_id);
CREATE INDEX IF NOT EXISTS idx_claims_requester   ON public.claim_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_status      ON public.claim_requests(status);
CREATE INDEX IF NOT EXISTS idx_claims_legacy      ON public.claim_requests(artisan_legacy_id);

-- RLS
ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

-- Users see their own requests
CREATE POLICY "claims_requester_read" ON public.claim_requests
  FOR SELECT USING (requester_user_id = auth.uid());

-- Users can submit a claim
CREATE POLICY "claims_insert" ON public.claim_requests
  FOR INSERT WITH CHECK (
    requester_user_id = auth.uid() OR requester_user_id IS NULL
  );

-- Admins see all + can update (approve/reject)
CREATE POLICY "claims_admin_all" ON public.claim_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );


-- ============================================================
-- 4. HELPER: wire artisan claim approval
--    When claim_requests.status is set to 'approved',
--    automatically update artisans.claimed = TRUE via trigger.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_artisan_claim()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    -- Try to update by UUID first, then by legacy_id
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

CREATE TRIGGER claim_approval_sync
  AFTER UPDATE ON public.claim_requests
  FOR EACH ROW EXECUTE FUNCTION sync_artisan_claim();


-- ============================================================
-- 5. USEFUL VIEWS
-- ============================================================

-- Available verified artisans (used by homepage listing)
CREATE OR REPLACE VIEW public.artisans_available AS
  SELECT * FROM public.artisans
  WHERE availability = 'available'
  ORDER BY rating DESC, review_count DESC;

-- Pending claims with artisan info (admin dashboard)
CREATE OR REPLACE VIEW public.claims_pending AS
  SELECT
    cr.*,
    a.full_name  AS artisan_name,
    a.city       AS artisan_city,
    a.service_category AS artisan_service
  FROM public.claim_requests cr
  JOIN public.artisans a ON (a.id = cr.artisan_id OR a.legacy_id = cr.artisan_legacy_id)
  WHERE cr.status = 'pending'
  ORDER BY cr.created_at ASC;


-- ============================================================
-- DONE. Your 3 tables are ready.
-- Next step: paste SUPABASE_URL + SUPABASE_ANON_KEY into
--   js/supabase-client.js then run:
--   await FixeoRepository.migrateLocalToSupabase()
-- ============================================================
