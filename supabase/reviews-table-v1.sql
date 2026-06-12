-- ============================================================
-- FIXEO Review Engine V1 — Database Layer
-- Version: rev-v1a
-- Run in: Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ── 1. Create reviews table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  artisan_id          uuid NOT NULL,
  client_profile_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  client_phone        text,
  rating              smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text         text DEFAULT '' CHECK (char_length(review_text) <= 500),
  verified            boolean NOT NULL DEFAULT true,
  response_time_score smallint CHECK (response_time_score BETWEEN 1 AND 5),
  quality_score       smallint CHECK (quality_score BETWEEN 1 AND 5),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 2. One review per mission (hard constraint) ─────────────
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_mission
  ON reviews(mission_id);

-- ── 3. Fast lookups ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS reviews_artisan_idx
  ON reviews(artisan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_client_idx
  ON reviews(client_profile_id)
  WHERE client_profile_id IS NOT NULL;

-- ── 4. RLS policies ─────────────────────────────────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews (public trust signals)
CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT
  USING (true);

-- Authenticated clients can insert their own review
CREATE POLICY "reviews_client_insert"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND client_profile_id = auth.uid()
  );

-- Allow anon insert (for guest-completed missions identified by phone)
CREATE POLICY "reviews_anon_insert"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL
    AND client_phone IS NOT NULL
    AND char_length(client_phone) >= 8
  );

-- Clients cannot update or delete reviews
-- (no UPDATE / DELETE policies = forbidden)

-- ── 5. Artisan aggregate view ────────────────────────────────
-- Materialised as a view — no extra cron needed.
-- Dispatch V2 and Profile can SELECT from this.
CREATE OR REPLACE VIEW artisan_review_stats AS
SELECT
  artisan_id,
  COUNT(*)::integer                              AS review_count,
  ROUND(AVG(rating)::numeric, 2)                AS avg_rating,
  ROUND(AVG(response_time_score)::numeric, 2)   AS avg_response_time_score,
  ROUND(AVG(quality_score)::numeric, 2)         AS avg_quality_score,
  -- Trust score formula:
  --   50% avg_rating quality (normalised to 0-100)
  --   20% volume (log scale, capped at 100)
  --   15% response time score (normalised)
  --   15% quality_score (normalised)
  ROUND(
    (
      (COALESCE(AVG(rating),0) / 5.0) * 50 +
      LEAST(LN(COUNT(*) + 1) / LN(201) * 100, 100) * 0.20 +
      (COALESCE(AVG(response_time_score),3) / 5.0) * 15 +
      (COALESCE(AVG(quality_score),3) / 5.0) * 15
    )::numeric, 1
  )                                              AS trust_score,
  MAX(created_at)                                AS last_review_at
FROM reviews
WHERE verified = true
GROUP BY artisan_id;

-- ── 6. Comment ───────────────────────────────────────────────
COMMENT ON TABLE reviews IS
  'Client reviews for completed missions. One per mission. Verified = admin-approved or auto-verified for authenticated users.';
