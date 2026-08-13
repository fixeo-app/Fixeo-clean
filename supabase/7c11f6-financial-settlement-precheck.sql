-- ============================================================
-- FIXEO Phase 7C.11F.6 — Financial Settlement Preflight
-- supabase/7c11f6-financial-settlement-precheck.sql
--
-- PURPOSE: READ-ONLY schema inspection of production Supabase.
--   Reports whether missions / service_requests / payments have
--   the canonical financial columns needed for server-side settlement.
--
-- ⚠️  THIS SCRIPT MAKES ZERO MUTATIONS.
--   No INSERT / UPDATE / DELETE / ALTER / CREATE / DROP.
--   Safe to run in any Supabase SQL editor against production.
--
-- HUMAN ACTION REQUIRED:
--   Run this in the Supabase dashboard SQL editor.
--   Return ALL output to the engineering agent before authorizing
--   any migration or server endpoint deployment.
--
-- EXPECTED OUTPUT FORMAT:
--   SCENARIO A — all required columns present → server endpoint safe to deploy
--   SCENARIO B — one or more columns missing  → migration required first
--
-- HARD STOP CONDITIONS (look for these in output):
--   HARD STOP: column missing
--   HARD STOP: constraint conflict
--   HARD STOP: trigger rewrites financial fields
--   HARD STOP: anon/authenticated can directly UPDATE final_price
-- ============================================================

DO $$
DECLARE
  v_col_exists   BOOLEAN;
  v_col_type     TEXT;
  v_col_nullable TEXT;
  v_col_default  TEXT;
  v_constraint   TEXT;
  v_count        INTEGER;
  v_scenario     TEXT := 'A';   -- optimistic; set to 'B' if any column missing
BEGIN

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIXEO 7C.11F.6 — Financial Settlement Preflight';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';

  -- ── BLOCK 1: missions table ────────────────────────────────
  RAISE NOTICE '── BLOCK 1: missions table ──────────────────────────────';

  -- 1a. agreed_price
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name = 'agreed_price'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'HARD STOP: missions.agreed_price MISSING — foundational contract broken';
    v_scenario := 'B';
  ELSE
    SELECT data_type, is_nullable, column_default
    INTO   v_col_type, v_col_nullable, v_col_default
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name='missions' AND column_name='agreed_price';
    RAISE NOTICE 'missions.agreed_price: type=%, nullable=%, default=%', v_col_type, v_col_nullable, COALESCE(v_col_default, 'NULL');
  END IF;

  -- 1b. final_price
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name = 'final_price'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'SCENARIO B: missions.final_price MISSING → migration required';
    v_scenario := 'B';
  ELSE
    SELECT data_type, is_nullable, column_default
    INTO   v_col_type, v_col_nullable, v_col_default
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name='missions' AND column_name='final_price';
    RAISE NOTICE 'missions.final_price: type=%, nullable=%, default=%', v_col_type, v_col_nullable, COALESCE(v_col_default, 'NULL');
    -- Check for existing non-null values
    EXECUTE format('SELECT COUNT(*) FROM public.missions WHERE final_price IS NOT NULL') INTO v_count;
    RAISE NOTICE 'missions.final_price: rows with non-null value = %', v_count;
  END IF;

  -- 1c. commission_amount
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name = 'commission_amount'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'SCENARIO B: missions.commission_amount MISSING → migration required';
    v_scenario := 'B';
  ELSE
    SELECT data_type, is_nullable, column_default
    INTO   v_col_type, v_col_nullable, v_col_default
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name='missions' AND column_name='commission_amount';
    RAISE NOTICE 'missions.commission_amount: type=%, nullable=%, default=%', v_col_type, v_col_nullable, COALESCE(v_col_default, 'NULL');
    EXECUTE format('SELECT COUNT(*) FROM public.missions WHERE commission_amount IS NOT NULL AND commission_amount > 0') INTO v_count;
    RAISE NOTICE 'missions.commission_amount: rows with value > 0 = %', v_count;
  END IF;

  -- 1d. artisan_net  (derived — may not need persistence)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name = 'artisan_net'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'INFO: missions.artisan_net MISSING (derivable; may not need storage)';
    -- Not a hard stop — can derive as final_price - commission_amount
  ELSE
    SELECT data_type, is_nullable, column_default
    INTO   v_col_type, v_col_nullable, v_col_default
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name='missions' AND column_name='artisan_net';
    RAISE NOTICE 'missions.artisan_net: type=%, nullable=%, default=%', v_col_type, v_col_nullable, COALESCE(v_col_default, 'NULL');
  END IF;

  -- 1e. status column and CHECK constraint
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name = 'status'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'HARD STOP: missions.status MISSING';
  ELSE
    SELECT data_type INTO v_col_type
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name='missions' AND column_name='status';
    RAISE NOTICE 'missions.status: type=%', v_col_type;
    -- Report distinct current status values
    RAISE NOTICE 'missions.status distinct values (from data):';
    FOR v_constraint IN
      SELECT DISTINCT status FROM public.missions ORDER BY 1
    LOOP
      RAISE NOTICE '  status value: %', v_constraint;
    END LOOP;
  END IF;

  -- 1f. CHECK constraints on financial columns
  RAISE NOTICE '';
  RAISE NOTICE 'missions CHECK constraints on financial columns:';
  FOR v_constraint IN
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM   pg_constraint c
    JOIN   pg_class t ON t.oid = c.conrelid
    JOIN   pg_namespace n ON n.oid = t.relnamespace
    WHERE  n.nspname = 'public'
      AND  t.relname = 'missions'
      AND  c.contype = 'c'
      AND  (pg_get_constraintdef(c.oid) ILIKE '%final_price%'
         OR pg_get_constraintdef(c.oid) ILIKE '%commission_amount%'
         OR pg_get_constraintdef(c.oid) ILIKE '%artisan_net%'
         OR pg_get_constraintdef(c.oid) ILIKE '%agreed_price%')
  LOOP
    RAISE NOTICE '  CHECK: %', v_constraint;
  END LOOP;

  -- 1g. Triggers on missions
  RAISE NOTICE '';
  RAISE NOTICE 'missions TRIGGERS (check for financial rewrites):';
  FOR v_constraint IN
    SELECT trigger_name || ' — ' || event_manipulation || ' — ' || action_statement
    FROM   information_schema.triggers
    WHERE  event_object_schema = 'public'
      AND  event_object_table  = 'missions'
  LOOP
    RAISE NOTICE '  TRIGGER: %', v_constraint;
  END LOOP;

  -- 1h. Mission id type
  SELECT data_type INTO v_col_type
  FROM   information_schema.columns
  WHERE  table_schema='public' AND table_name='missions' AND column_name='id';
  RAISE NOTICE 'missions.id type: %', COALESCE(v_col_type, 'NOT FOUND');

  -- 1i. request_id / service_request_id FK
  FOR v_constraint IN
    SELECT kcu.column_name || ' → ' || ccu.table_name || '.' || ccu.column_name
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN   information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
    WHERE  tc.constraint_type = 'FOREIGN KEY'
      AND  tc.table_schema    = 'public'
      AND  tc.table_name      = 'missions'
  LOOP
    RAISE NOTICE 'missions FK: %', v_constraint;
  END LOOP;

  -- ── BLOCK 2: service_requests.final_price ──────────────────
  RAISE NOTICE '';
  RAISE NOTICE '── BLOCK 2: service_requests table ──────────────────────';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_requests'
      AND column_name = 'final_price'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'service_requests.final_price: MISSING (not required for mission settlement)';
  ELSE
    SELECT data_type, is_nullable, column_default
    INTO   v_col_type, v_col_nullable, v_col_default
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name='service_requests' AND column_name='final_price';
    RAISE NOTICE 'service_requests.final_price: type=%, nullable=%, default=%', v_col_type, v_col_nullable, COALESCE(v_col_default, 'NULL');
    EXECUTE format('SELECT COUNT(*) FROM public.service_requests WHERE final_price IS NOT NULL AND final_price > 0') INTO v_count;
    RAISE NOTICE 'service_requests.final_price: rows with value > 0 = %', v_count;
  END IF;

  -- ── BLOCK 3: payments table ───────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '── BLOCK 3: payments table ──────────────────────────────';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'payments: TABLE DOES NOT EXIST';
  ELSE
    RAISE NOTICE 'payments: TABLE EXISTS';
    -- Columns
    RAISE NOTICE 'payments columns:';
    FOR v_constraint IN
      SELECT column_name || ': ' || data_type || ' nullable=' || is_nullable
      FROM   information_schema.columns
      WHERE  table_schema='public' AND table_name='payments'
      ORDER  BY ordinal_position
    LOOP
      RAISE NOTICE '  %', v_constraint;
    END LOOP;
    -- Row count
    EXECUTE format('SELECT COUNT(*) FROM public.payments') INTO v_count;
    RAISE NOTICE 'payments row count: %', v_count;
    -- RLS
    SELECT relrowsecurity INTO v_col_exists
    FROM   pg_class
    JOIN   pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE  pg_namespace.nspname = 'public' AND relname = 'payments';
    RAISE NOTICE 'payments RLS enabled: %', v_col_exists;
    -- Policies
    FOR v_constraint IN
      SELECT polname || ' (' || polcmd || ')'
      FROM   pg_policy
      JOIN   pg_class ON pg_class.oid = pg_policy.polrelid
      JOIN   pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE  pg_namespace.nspname = 'public' AND pg_class.relname = 'payments'
    LOOP
      RAISE NOTICE '  POLICY: %', v_constraint;
    END LOOP;
  END IF;

  -- ── BLOCK 4: RLS on missions financial columns ─────────────
  RAISE NOTICE '';
  RAISE NOTICE '── BLOCK 4: missions RLS + privilege check ───────────────';

  -- RLS enabled?
  SELECT relrowsecurity INTO v_col_exists
  FROM   pg_class
  JOIN   pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE  pg_namespace.nspname = 'public' AND relname = 'missions';
  RAISE NOTICE 'missions RLS enabled: %', v_col_exists;

  RAISE NOTICE 'missions RLS policies:';
  FOR v_constraint IN
    SELECT polname || ' cmd=' || polcmd || ' roles=' ||
           COALESCE(array_to_string(polroles::regrole[], ','), 'PUBLIC')
    FROM   pg_policy
    JOIN   pg_class ON pg_class.oid = pg_policy.polrelid
    JOIN   pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE  pg_namespace.nspname = 'public' AND pg_class.relname = 'missions'
  LOOP
    RAISE NOTICE '  POLICY: %', v_constraint;
  END LOOP;

  -- ── BLOCK 5: SCENARIO CONCLUSION ──────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SCENARIO: %', v_scenario;
  IF v_scenario = 'A' THEN
    RAISE NOTICE 'SCENARIO A: All required columns present.';
    RAISE NOTICE '  → Server settlement endpoint can be deployed without migration.';
    RAISE NOTICE '  → Return this output to engineering agent to authorize deployment.';
  ELSE
    RAISE NOTICE 'SCENARIO B: One or more columns missing.';
    RAISE NOTICE '  → Migration supabase/7c11f6-financial-settlement.sql required.';
    RAISE NOTICE '  → Run migration in Supabase SQL editor, then re-run this preflight.';
    RAISE NOTICE '  → Do NOT deploy settlement endpoint until SCENARIO A is confirmed.';
  END IF;
  RAISE NOTICE '============================================================';

END $$;

-- ── SUPPLEMENTAL: Column catalog (tabular, for copy-paste verification) ──
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('missions','service_requests','payments')
  AND column_name IN (
    'id','status','agreed_price','final_price','commission_amount',
    'artisan_net','request_id','service_request_id','amount','mission_id'
  )
ORDER BY table_name, ordinal_position;
