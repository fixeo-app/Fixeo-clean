-- Additive foundation only. No changes to missions or the legacy trigger.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.fixeo_vap_commission_minor_v1(v bigint)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE weighted bigint;
BEGIN
  IF v IS NULL OR v <= 0 OR v > 50000000 THEN
    RAISE EXCEPTION 'Invalid VAP centimes' USING ERRCODE='22023';
  END IF;
  weighted := 15 * least(v,200000)
    + 10 * least(greatest(v-200000,0),300000)
    + 7 * least(greatest(v-500000,0),500000)
    + 5 * greatest(v-1000000,0);
  RETURN least(150000,greatest(6000,(weighted+50)/100));
END;
$$;
REVOKE ALL ON FUNCTION public.fixeo_vap_commission_minor_v1(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fixeo_vap_commission_minor_v1(bigint) TO service_role;

CREATE TABLE public.fixeo_pricing_offers_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_key uuid NOT NULL UNIQUE,
  pricing_version text NOT NULL CHECK (pricing_version = 'vap-bp33-v1'),
  currency text NOT NULL CHECK (currency = 'MAD'),
  service_code text NOT NULL CHECK (length(btrim(service_code)) BETWEEN 1 AND 160),
  catalogue_version text NOT NULL CHECK (length(btrim(catalogue_version)) BETWEEN 1 AND 80),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 1 AND 120),
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object' AND scope <> '{}'::jsonb),
  vap_minor bigint NOT NULL CHECK (vap_minor BETWEEN 1 AND 50000000),
  materials_minor bigint NOT NULL CHECK (materials_minor BETWEEN 0 AND 50000000),
  commission_minor bigint NOT NULL CHECK (commission_minor = public.fixeo_vap_commission_minor_v1(vap_minor)),
  client_total_minor bigint NOT NULL CHECK (client_total_minor BETWEEN 1 AND 50000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (client_total_minor = vap_minor + commission_minor + materials_minor),
  CHECK (isfinite(created_at) AND isfinite(expires_at) AND expires_at > created_at)
);
ALTER TABLE public.fixeo_pricing_offers_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fixeo_pricing_offers_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.fixeo_pricing_offers_v1 TO service_role;
CREATE POLICY vap_offers_server_select ON public.fixeo_pricing_offers_v1
  FOR SELECT TO service_role USING (true);
CREATE POLICY vap_offers_server_insert ON public.fixeo_pricing_offers_v1
  FOR INSERT TO service_role WITH CHECK (true);

CREATE FUNCTION public.fixeo_reject_offer_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Pricing offers are immutable; create a new offer' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION public.fixeo_reject_offer_mutation_v1() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER vap_offer_immutable BEFORE UPDATE OR DELETE ON public.fixeo_pricing_offers_v1
  FOR EACH ROW EXECUTE FUNCTION public.fixeo_reject_offer_mutation_v1();
COMMENT ON TABLE public.fixeo_pricing_offers_v1 IS
  'Server-only immutable VAP offers. Foundation only: not an accepted booking, mission, payment or dispatch authority. No existing mission is recalculated.';
