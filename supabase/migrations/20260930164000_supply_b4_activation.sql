-- FIXEO Supply Engine — Bloc 4
-- Claim & activation journey orchestration around existing canonical authorities.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regprocedure('public.approve_artisan_claim(uuid)') IS NULL
     OR to_regprocedure('public.complete_artisan_onboarding()') IS NULL
     OR to_regprocedure('public.admin_verify_artisan_v1(uuid)') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B4_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.supply_activation_plan_v1(p_artisan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE p public.supply_artisan_projection_v1; action text; path text;
BEGIN
  PERFORM fixeo_private.supply_require_actor_v1();
  SELECT * INTO p FROM public.supply_artisan_projection_v1 WHERE artisan_id=p_artisan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','artisan_not_found'); END IF;
  path:='/rejoindre-fixeo.html?id='||p_artisan_id::text||'#revendique';
  action:=CASE p.lifecycle_stage
    WHEN 'REFERENCED' THEN 'CONTACT'
    WHEN 'TO_CONTACT' THEN 'CONTACT'
    WHEN 'RECRUITMENT_CANDIDATE' THEN 'CONTACT'
    WHEN 'CONTACTED' THEN 'WAIT_OR_FOLLOW_UP'
    WHEN 'ENGAGED' THEN 'CLAIM_PROFILE'
    WHEN 'CLAIM_IN_PROGRESS' THEN 'REVIEW_CLAIM'
    WHEN 'CLAIMED' THEN 'COMPLETE_ONBOARDING'
    WHEN 'ONBOARDED' THEN 'VERIFY'
    WHEN 'VERIFIED' THEN 'CONFIRM_ACTIVATION'
    WHEN 'ACTIVATED' THEN 'DISPATCH_ASSESSMENT'
    ELSE 'HUMAN_REVIEW' END;
  RETURN jsonb_build_object(
    'ok',true,'artisan_id',p.artisan_id,'artisan_name',p.artisan_name,
    'stage',p.lifecycle_stage,'next_action',action,
    'claim_path',CASE WHEN p.lifecycle_stage IN('REFERENCED','TO_CONTACT','RECRUITMENT_CANDIDATE','CONTACTED','ENGAGED') THEN path ELSE NULL END,
    'outreach_status',p.outreach_status,'contactable',p.contactable,
    'verified',p.verified,'onboarding_completed',p.onboarding_completed,
    'declared_availability',p.declared_availability,
    'operational_capacity_proven',p.operational_capacity_proven
  );
END
$fn$;
ALTER FUNCTION public.supply_activation_plan_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_activation_plan_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_activation_plan_v1(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_confirm_activation_v1(
  p_artisan_id uuid,p_evidence_class text,p_evidence jsonb,p_confirmed_at timestamptz DEFAULT now(),
  p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE actor_kind text; a public.artisans; before_stage text;
BEGIN
  actor_kind:=fixeo_private.supply_require_actor_v1();
  IF p_evidence_class NOT IN('provider_event','user_message','operator_assertion','canonical_db') THEN
    RETURN jsonb_build_object('ok',false,'reason','activation_requires_strong_evidence');
  END IF;
  SELECT * INTO a FROM public.artisans WHERE id=p_artisan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','artisan_not_found'); END IF;
  IF NOT (a.claimed IS TRUE AND a.owner_user_id IS NOT NULL AND a.onboarding_completed IS TRUE AND a.verified IS TRUE) THEN
    RETURN jsonb_build_object('ok',false,'reason','activation_prerequisites_missing');
  END IF;
  IF p_confirmed_at IS NULL OR p_confirmed_at>now()+interval '5 minutes' OR p_confirmed_at<now()-interval '30 days' THEN
    RETURN jsonb_build_object('ok',false,'reason','activation_evidence_stale');
  END IF;
  before_stage:=fixeo_private.supply_derived_stage_v1(p_artisan_id);
  INSERT INTO public.supply_artisan_state_v1(
    artisan_id,lifecycle_stage,activation_proof,activation_confirmed_at,source_evidence,stage_updated_at,updated_at
  ) VALUES(
    p_artisan_id,'ACTIVATED',p_evidence_class,p_confirmed_at,COALESCE(p_evidence,'{}'::jsonb),now(),now()
  )
  ON CONFLICT(artisan_id) DO UPDATE SET
    lifecycle_stage='ACTIVATED',activation_proof=excluded.activation_proof,
    activation_confirmed_at=excluded.activation_confirmed_at,
    source_evidence=excluded.source_evidence,stage_updated_at=now(),updated_at=now();

  INSERT INTO public.supply_lifecycle_events_v1(
    artisan_id,event_type,from_stage,to_stage,actor_kind,actor_user_id,evidence_class,evidence,idempotency_key
  ) VALUES(
    p_artisan_id,'activation.confirmed',before_stage,'ACTIVATED',actor_kind,auth.uid(),
    p_evidence_class,COALESCE(p_evidence,'{}'::jsonb),p_idempotency_key
  ) ON CONFLICT(artisan_id,idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok',true,'artisan_id',p_artisan_id,'stage','ACTIVATED','confirmed_at',p_confirmed_at);
END
$fn$;
ALTER FUNCTION public.supply_confirm_activation_v1(uuid,text,jsonb,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_confirm_activation_v1(uuid,text,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_confirm_activation_v1(uuid,text,jsonb,timestamptz,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private.supply_canonical_stage_from_row_v1(
  p_claimed boolean,p_owner uuid,p_onboarded boolean,p_verified boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $fn$
SELECT CASE
  WHEN p_claimed IS TRUE AND p_owner IS NOT NULL AND p_onboarded IS TRUE AND p_verified IS TRUE THEN 'VERIFIED'
  WHEN p_claimed IS TRUE AND p_owner IS NOT NULL AND p_onboarded IS TRUE THEN 'ONBOARDED'
  WHEN p_claimed IS TRUE AND p_owner IS NOT NULL THEN 'CLAIMED'
  ELSE NULL END
$fn$;
ALTER FUNCTION fixeo_private.supply_canonical_stage_from_row_v1(boolean,uuid,boolean,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_canonical_stage_from_row_v1(boolean,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private.supply_artisan_canonical_event_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE old_stage text; new_stage text; evt text;
BEGIN
  old_stage:=fixeo_private.supply_canonical_stage_from_row_v1(OLD.claimed,OLD.owner_user_id,OLD.onboarding_completed,OLD.verified);
  new_stage:=fixeo_private.supply_canonical_stage_from_row_v1(NEW.claimed,NEW.owner_user_id,NEW.onboarding_completed,NEW.verified);
  IF old_stage IS NOT DISTINCT FROM new_stage THEN RETURN NEW; END IF;
  evt:=CASE new_stage WHEN 'CLAIMED' THEN 'canonical.claimed'
                      WHEN 'ONBOARDED' THEN 'canonical.onboarded'
                      WHEN 'VERIFIED' THEN 'canonical.verified'
                      ELSE 'canonical.changed' END;
  INSERT INTO public.supply_lifecycle_events_v1(
    artisan_id,event_type,from_stage,to_stage,actor_kind,actor_user_id,evidence_class,evidence,idempotency_key
  ) VALUES(
    NEW.id,evt,COALESCE(old_stage,fixeo_private.supply_derived_stage_v1(NEW.id)),new_stage,
    'system',auth.uid(),'canonical_db',
    jsonb_build_object('claimed',NEW.claimed,'owner_present',NEW.owner_user_id IS NOT NULL,
      'onboarding_completed',NEW.onboarding_completed,'verified',NEW.verified),
    gen_random_uuid()
  );
  RETURN NEW;
END
$fn$;
ALTER FUNCTION fixeo_private.supply_artisan_canonical_event_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_artisan_canonical_event_v1() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS supply_artisan_canonical_event_v1 ON public.artisans;
CREATE TRIGGER supply_artisan_canonical_event_v1
AFTER UPDATE OF claimed,owner_user_id,onboarding_completed,verified ON public.artisans
FOR EACH ROW EXECUTE FUNCTION fixeo_private.supply_artisan_canonical_event_v1();

CREATE OR REPLACE FUNCTION fixeo_private.supply_claim_event_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE aid uuid; stage text;
BEGIN
  aid:=NEW.artisan_id;
  IF aid IS NULL AND NEW.artisan_legacy_id IS NOT NULL THEN
    SELECT id INTO aid FROM public.artisans
    WHERE legacy_id=NEW.artisan_legacy_id ORDER BY id LIMIT 1;
  END IF;
  IF aid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    stage:=CASE WHEN NEW.status='pending' THEN 'CLAIM_IN_PROGRESS' ELSE fixeo_private.supply_derived_stage_v1(aid) END;
    INSERT INTO public.supply_lifecycle_events_v1(
      artisan_id,event_type,from_stage,to_stage,actor_kind,actor_user_id,evidence_class,evidence,idempotency_key
    ) VALUES(
      aid,'claim.'||lower(NEW.status),NULL,stage,'system',auth.uid(),'canonical_db',
      jsonb_build_object('claim_id',NEW.id,'status',NEW.status),gen_random_uuid()
    );
  END IF;
  RETURN NEW;
END
$fn$;
ALTER FUNCTION fixeo_private.supply_claim_event_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_claim_event_v1() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS supply_claim_event_v1 ON public.claim_requests;
CREATE TRIGGER supply_claim_event_v1
AFTER INSERT OR UPDATE OF status ON public.claim_requests
FOR EACH ROW EXECUTE FUNCTION fixeo_private.supply_claim_event_v1();

COMMIT;
