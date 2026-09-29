-- Bloc 1 / phase 5: close the legacy Claims confirmation bypass.
-- Existing Claims functions remain the sole ownership/rejection authorities.
-- Apply after the four reviewed Bloc 1 migrations and the browser adapter.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
REVOKE ALL ON FUNCTION public.approve_artisan_claim(uuid),
 public.reject_artisan_claim(uuid,text),
 public._supersede_competing_claims(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- Pending own-claim INSERT and related SELECT retain their existing RLS.
-- Only the canonical SECURITY DEFINER authorities may review existing claims.
REVOKE UPDATE,DELETE,TRUNCATE ON public.claim_requests FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE cols text;
BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols
 FROM pg_attribute WHERE attrelid='public.claim_requests'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE UPDATE (%s) ON public.claim_requests FROM PUBLIC,anon,authenticated,service_role',cols);
END $$;
COMMIT;
