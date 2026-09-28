-- Bloc 1 / phase 1: additive foundation. REVIEW CANDIDATE, NOT APPLIED TO PRODUCTION.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE fixeo_private.authority_audit_events_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid, actor_role text NOT NULL, target_type text NOT NULL, target_id uuid NOT NULL,
 authority text NOT NULL, action text NOT NULL, result text NOT NULL,
 correlation_id uuid NOT NULL, idempotency_key uuid, change jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK (octet_length(change::text)<=4096)
);
ALTER TABLE fixeo_private.authority_audit_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.authority_audit_events_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX authority_audit_target_v1 ON fixeo_private.authority_audit_events_v1(target_type,target_id,occurred_at DESC);

CREATE FUNCTION fixeo_private.control_require_admin_v1() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN auth.uid();
END $$;
REVOKE ALL ON FUNCTION fixeo_private.control_require_admin_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.authority_audit_v1(p_type text,p_id uuid,p_authority text,p_action text,p_result text,p_change jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_correlation uuid; v_key uuid;
BEGIN
 v_correlation:=coalesce(nullif(current_setting('fixeo.correlation_id',true),'')::uuid,gen_random_uuid());
 v_key:=nullif(current_setting('fixeo.idempotency_key',true),'')::uuid;
 INSERT INTO fixeo_private.authority_audit_events_v1(actor_id,actor_role,target_type,target_id,authority,action,result,correlation_id,idempotency_key,change)
 VALUES(auth.uid(),coalesce((SELECT role FROM public.users WHERE id=auth.uid()),'server'),p_type,p_id,p_authority,p_action,p_result,v_correlation,v_key,p_change) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.authority_audit_v1(text,uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- NULL means historic/unclassified. DEFAULT affects future rows only; no backfill.
ALTER TABLE public.service_requests ADD COLUMN data_classification text CHECK(data_classification IN('production','test','internal'));
ALTER TABLE public.service_requests ALTER COLUMN data_classification SET DEFAULT 'production';
ALTER TABLE public.artisans ADD COLUMN data_classification text CHECK(data_classification IN('production','test','internal'));
ALTER TABLE public.artisans ALTER COLUMN data_classification SET DEFAULT 'production';
ALTER TABLE public.enterprise_accounts ADD COLUMN data_classification text CHECK(data_classification IN('production','test','internal'));
ALTER TABLE public.enterprise_accounts ALTER COLUMN data_classification SET DEFAULT 'production';
ALTER TABLE public.missions ADD COLUMN started_at timestamptz, ADD COLUMN completed_at timestamptz, ADD COLUMN validated_at timestamptz,
 ADD COLUMN accepted_quote_id uuid REFERENCES public.quotes(id), ADD COLUMN accepted_quote_version integer;
CREATE UNIQUE INDEX missions_accepted_quote_v1 ON public.missions(accepted_quote_id) WHERE accepted_quote_id IS NOT NULL;

-- Review is orthogonal to the existing client's pending/accepted/rejected state.
ALTER TABLE public.quotes ADD COLUMN review_status text NOT NULL DEFAULT 'submitted' CHECK(review_status IN('submitted','approved','rejected')),
 ADD COLUMN quote_version integer NOT NULL DEFAULT 1 CHECK(quote_version>0),
 ADD COLUMN reviewed_version integer, ADD COLUMN reviewed_at timestamptz, ADD COLUMN reviewed_by uuid REFERENCES public.users(id),
 ADD COLUMN review_reason text, ADD COLUMN presented_at timestamptz, ADD COLUMN expires_at timestamptz;
COMMENT ON COLUMN public.quotes.expires_at IS 'Optional validity chosen on FIXEO review. NULL explicitly means no stated expiry; never invent an expiry.';

CREATE TABLE fixeo_private.control_action_previews_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES public.users(id),
 capability text NOT NULL, target_id uuid NOT NULL, payload jsonb NOT NULL, fingerprint text NOT NULL,
 correlation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 executed_at timestamptz, execution_result jsonb, idempotency_key uuid,
 UNIQUE(actor_id,idempotency_key)
);
ALTER TABLE fixeo_private.control_action_previews_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.control_action_previews_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.commission_remittances_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES public.missions(id),
 amount numeric(12,2) NOT NULL CHECK(amount>0), currency text NOT NULL DEFAULT 'MAD' CHECK(currency='MAD'),
 method text NOT NULL CHECK(method IN('cash','wafacash','bank_transfer')),
 status text NOT NULL DEFAULT 'declared' CHECK(status IN('declared','confirmed','cancelled')),
 proof_reference text NOT NULL CHECK(length(proof_reference) BETWEEN 3 AND 128),
 declared_by uuid NOT NULL REFERENCES public.users(id), confirmed_by uuid REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, cancelled_at timestamptz,
 version integer NOT NULL DEFAULT 1, supersedes_id uuid REFERENCES public.commission_remittances_v1(id)
);
ALTER TABLE public.commission_remittances_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_remittances_v1 FROM PUBLIC,anon,authenticated,service_role;
-- Access only through the minimal Finance projection or its bounded authority.
CREATE INDEX commission_remittances_mission_v1 ON public.commission_remittances_v1(mission_id,status);

CREATE FUNCTION fixeo_private.control_event_capture_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oldj jsonb:='{}'; newj jsonb:=to_jsonb(NEW); delta jsonb; k text; keys text[];
BEGIN
 IF TG_OP='UPDATE' THEN oldj:=to_jsonb(OLD); END IF;
 keys:=CASE TG_TABLE_NAME
 WHEN 'service_requests' THEN ARRAY['status','data_classification']
 WHEN 'missions' THEN ARRAY['status','accepted_at','started_at','completed_at','validated_at','final_price','commission_amount']
 WHEN 'quotes' THEN ARRAY['status','review_status','quote_version','reviewed_version','proposed_price']
 WHEN 'claim_requests' THEN ARRAY['status']
 WHEN 'artisans' THEN ARRAY['verified','is_verified','claimed','data_classification']
 WHEN 'enterprise_accounts' THEN ARRAY['data_classification'] ELSE ARRAY[]::text[] END;
 delta:='{}';
 FOREACH k IN ARRAY keys LOOP
  IF oldj->k IS DISTINCT FROM newj->k THEN delta:=delta||jsonb_build_object(k,jsonb_build_object('before',oldj->k,'after',newj->k)); END IF;
 END LOOP;
 IF delta<>'{}' THEN PERFORM fixeo_private.authority_audit_v1(TG_TABLE_NAME,NEW.id,'canonical.'||TG_TABLE_NAME,lower(TG_OP),'succeeded',delta); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.control_event_capture_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER control_audit_requests_v1 AFTER INSERT OR UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION fixeo_private.control_event_capture_v1();
CREATE TRIGGER control_audit_missions_v1 AFTER INSERT OR UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION fixeo_private.control_event_capture_v1();
CREATE TRIGGER control_audit_quotes_v1 AFTER INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION fixeo_private.control_event_capture_v1();
CREATE TRIGGER control_audit_claims_v1 AFTER INSERT OR UPDATE ON public.claim_requests FOR EACH ROW EXECUTE FUNCTION fixeo_private.control_event_capture_v1();
CREATE TRIGGER control_audit_artisans_v1 AFTER INSERT OR UPDATE ON public.artisans FOR EACH ROW EXECUTE FUNCTION fixeo_private.control_event_capture_v1();
CREATE TRIGGER control_audit_enterprise_v1 AFTER UPDATE ON public.enterprise_accounts FOR EACH ROW EXECUTE FUNCTION fixeo_private.control_event_capture_v1();

CREATE FUNCTION fixeo_private.mission_event_times_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='done' AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.completed_at:=coalesce(NEW.completed_at,clock_timestamp()); END IF;
 IF NEW.status='validated' AND OLD.status='done' THEN NEW.validated_at:=coalesce(NEW.validated_at,clock_timestamp()); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.mission_event_times_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mission_event_times_v1 BEFORE UPDATE OF status ON public.missions FOR EACH ROW EXECUTE FUNCTION fixeo_private.mission_event_times_v1();
CREATE FUNCTION fixeo_private.request_start_time_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='in_progress' AND OLD.status='assigned' THEN
  UPDATE public.missions SET started_at=coalesce(started_at,clock_timestamp()) WHERE request_id=NEW.id::text AND status='pending' AND accepted_at IS NOT NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.request_start_time_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER request_start_time_v1 AFTER UPDATE OF status ON public.service_requests FOR EACH ROW EXECUTE FUNCTION fixeo_private.request_start_time_v1();
COMMIT;
