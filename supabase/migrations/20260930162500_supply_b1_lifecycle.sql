-- FIXEO Supply Engine — Bloc 1
-- Canonical lifecycle + event ledger + contact suppression semantics.
-- Orchestration only: public.artisans remains the profile master.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.artisans') IS NULL
     OR to_regclass('public.claim_requests') IS NULL
     OR to_regprocedure('fixeo_private._fixeo_is_admin()') IS NULL
  THEN
    RAISE EXCEPTION 'SUPPLY_B1_BASELINE_DRIFT';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION fixeo_private.supply_require_actor_v1()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN 'agent'; END IF;
  IF fixeo_private._fixeo_is_admin() THEN RETURN 'human'; END IF;
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
END
$fn$;
ALTER FUNCTION fixeo_private.supply_require_actor_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_require_actor_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.supply_artisan_state_v1(
  artisan_id uuid PRIMARY KEY REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  lifecycle_stage text NOT NULL DEFAULT 'REFERENCED'
    CHECK(lifecycle_stage IN(
      'REFERENCED','TO_CONTACT','RECRUITMENT_CANDIDATE','CONTACTED','ENGAGED',
      'CLAIM_IN_PROGRESS','CLAIMED','ONBOARDED','VERIFIED','ACTIVATED'
    )),
  activation_proof text,
  activation_confirmed_at timestamptz,
  last_contact_at timestamptz,
  last_engaged_at timestamptz,
  next_action_at timestamptz,
  priority_score integer NOT NULL DEFAULT 0 CHECK(priority_score BETWEEN 0 AND 1000),
  priority_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(priority_reasons)='array'),
  source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(source_evidence)='object'),
  stage_updated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_contact_preferences_v1(
  artisan_id uuid PRIMARY KEY REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  outreach_status text NOT NULL DEFAULT 'ALLOWED'
    CHECK(outreach_status IN('ALLOWED','COOLDOWN','OPTED_OUT','WRONG_NUMBER','BLOCKED')),
  reason text,
  cooldown_until timestamptz,
  opted_out_at timestamptz,
  explicit_opt_in_at timestamptz,
  updated_by_user_id uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(outreach_status <> 'COOLDOWN' OR cooldown_until IS NOT NULL),
  CHECK(outreach_status <> 'OPTED_OUT' OR opted_out_at IS NOT NULL)
);

CREATE TABLE public.supply_lifecycle_events_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  event_type text NOT NULL,
  from_stage text,
  to_stage text,
  actor_kind text NOT NULL CHECK(actor_kind IN('human','agent','system')),
  actor_user_id uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  agent_id uuid,
  run_id uuid,
  task_id uuid,
  campaign_id uuid,
  evidence_class text NOT NULL DEFAULT 'deterministic_rule'
    CHECK(evidence_class IN('canonical_db','provider_event','user_message','operator_assertion','deterministic_rule','model_inference')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object'),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(artisan_id,idempotency_key)
);

CREATE INDEX supply_lifecycle_events_artisan_created_idx
  ON public.supply_lifecycle_events_v1(artisan_id,created_at DESC);
CREATE INDEX supply_state_next_action_idx
  ON public.supply_artisan_state_v1(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX supply_contact_status_idx
  ON public.supply_contact_preferences_v1(outreach_status,cooldown_until);

ALTER TABLE public.supply_artisan_state_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_contact_preferences_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_lifecycle_events_v1 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supply_artisan_state_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_contact_preferences_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_lifecycle_events_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private.supply_derived_stage_v1(p_artisan_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
WITH a AS (
  SELECT * FROM public.artisans WHERE id=p_artisan_id
), s AS (
  SELECT * FROM public.supply_artisan_state_v1 WHERE artisan_id=p_artisan_id
), c AS (
  SELECT EXISTS(
    SELECT 1 FROM public.claim_requests cr
    WHERE cr.artisan_id=p_artisan_id AND cr.status='pending'
  ) pending_claim
)
SELECT CASE
  WHEN NOT EXISTS(SELECT 1 FROM a) THEN NULL
  WHEN (SELECT claimed FROM a) IS TRUE
   AND (SELECT owner_user_id FROM a) IS NOT NULL
   AND (SELECT onboarding_completed FROM a) IS TRUE
   AND (SELECT verified FROM a) IS TRUE
   AND COALESCE((SELECT activation_confirmed_at FROM s),NULL) IS NOT NULL
    THEN 'ACTIVATED'
  WHEN (SELECT claimed FROM a) IS TRUE
   AND (SELECT owner_user_id FROM a) IS NOT NULL
   AND (SELECT onboarding_completed FROM a) IS TRUE
   AND (SELECT verified FROM a) IS TRUE
    THEN 'VERIFIED'
  WHEN (SELECT claimed FROM a) IS TRUE
   AND (SELECT owner_user_id FROM a) IS NOT NULL
   AND (SELECT onboarding_completed FROM a) IS TRUE
    THEN 'ONBOARDED'
  WHEN (SELECT claimed FROM a) IS TRUE
   AND (SELECT owner_user_id FROM a) IS NOT NULL
    THEN 'CLAIMED'
  WHEN (SELECT pending_claim FROM c) THEN 'CLAIM_IN_PROGRESS'
  WHEN COALESCE((SELECT lifecycle_stage FROM s),'REFERENCED') IN(
    'TO_CONTACT','RECRUITMENT_CANDIDATE','CONTACTED','ENGAGED'
  ) THEN (SELECT lifecycle_stage FROM s)
  ELSE 'REFERENCED'
END
$fn$;
ALTER FUNCTION fixeo_private.supply_derived_stage_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_derived_stage_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE VIEW public.supply_artisan_projection_v1
WITH (security_invoker=false)
AS
SELECT
  a.id artisan_id,
  COALESCE(NULLIF(btrim(a.full_name),''),NULLIF(btrim(a.name),''),'Artisan '||left(a.id::text,8)) artisan_name,
  a.city,
  a.service_category,
  a.source,
  COALESCE(NULLIF(btrim(a.phone_public),''),NULLIF(btrim(a.phone),'')) contact_phone,
  a.claimable,
  a.claimed,
  a.claim_status,
  a.owner_user_id,
  a.onboarding_completed,
  a.verified,
  a.availability declared_availability,
  a.is_public,
  a.updated_at profile_updated_at,
  fixeo_private.supply_derived_stage_v1(a.id) lifecycle_stage,
  COALESCE(cp.outreach_status,'ALLOWED') outreach_status,
  cp.cooldown_until,
  cp.opted_out_at,
  CASE
    WHEN COALESCE(cp.outreach_status,'ALLOWED') IN('OPTED_OUT','WRONG_NUMBER','BLOCKED') THEN false
    WHEN cp.outreach_status='COOLDOWN' AND cp.cooldown_until>now() THEN false
    WHEN COALESCE(NULLIF(btrim(a.phone_public),''),NULLIF(btrim(a.phone),'')) IS NULL THEN false
    ELSE true
  END contactable,
  s.last_contact_at,
  s.last_engaged_at,
  s.next_action_at,
  COALESCE(s.priority_score,0) priority_score,
  COALESCE(s.priority_reasons,'[]'::jsonb) priority_reasons,
  s.activation_confirmed_at,
  CASE
    WHEN fixeo_private.supply_derived_stage_v1(a.id)='ACTIVATED'
      AND a.availability='available'
      AND s.activation_confirmed_at >= now()-interval '30 days'
    THEN true ELSE false
  END operational_capacity_proven
FROM public.artisans a
LEFT JOIN public.supply_artisan_state_v1 s ON s.artisan_id=a.id
LEFT JOIN public.supply_contact_preferences_v1 cp ON cp.artisan_id=a.id
WHERE COALESCE(a.data_classification,'production')='production';

ALTER VIEW public.supply_artisan_projection_v1 OWNER TO postgres;
REVOKE ALL ON public.supply_artisan_projection_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_summary_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE j jsonb;
BEGIN
  PERFORM fixeo_private.supply_require_actor_v1();
  SELECT jsonb_build_object(
    'referenced',count(*),
    'contactable',count(*) FILTER(WHERE contactable),
    'claimable_unowned',count(*) FILTER(WHERE claimable IS TRUE AND claimed IS FALSE AND owner_user_id IS NULL),
    'contacted',count(*) FILTER(WHERE lifecycle_stage='CONTACTED'),
    'engaged',count(*) FILTER(WHERE lifecycle_stage='ENGAGED'),
    'claim_in_progress',count(*) FILTER(WHERE lifecycle_stage='CLAIM_IN_PROGRESS'),
    'claimed',count(*) FILTER(WHERE lifecycle_stage='CLAIMED'),
    'onboarded',count(*) FILTER(WHERE lifecycle_stage='ONBOARDED'),
    'verified',count(*) FILTER(WHERE lifecycle_stage='VERIFIED'),
    'activated',count(*) FILTER(WHERE lifecycle_stage='ACTIVATED'),
    'operational_capacity_proven',count(*) FILTER(WHERE operational_capacity_proven),
    'opted_out',count(*) FILTER(WHERE outreach_status='OPTED_OUT'),
    'wrong_number',count(*) FILTER(WHERE outreach_status='WRONG_NUMBER'),
    'declared_available',count(*) FILTER(WHERE declared_availability='available')
  ) INTO j
  FROM public.supply_artisan_projection_v1;
  RETURN j;
END
$fn$;
ALTER FUNCTION public.supply_admin_summary_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_summary_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_summary_v1() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_set_contact_preference_v1(
  p_artisan_id uuid,
  p_status text,
  p_reason text DEFAULT NULL,
  p_cooldown_until timestamptz DEFAULT NULL,
  p_explicit_opt_in boolean DEFAULT false,
  p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  actor_kind text;
  old_status text;
  old_stage text;
BEGIN
  actor_kind:=fixeo_private.supply_require_actor_v1();
  IF NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=p_artisan_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','artisan_not_found');
  END IF;
  IF p_status NOT IN('ALLOWED','COOLDOWN','OPTED_OUT','WRONG_NUMBER','BLOCKED') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;
  IF p_status='COOLDOWN' AND (p_cooldown_until IS NULL OR p_cooldown_until<=now()) THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_cooldown');
  END IF;

  SELECT outreach_status INTO old_status
  FROM public.supply_contact_preferences_v1
  WHERE artisan_id=p_artisan_id
  FOR UPDATE;

  IF old_status='OPTED_OUT' AND p_status='ALLOWED' AND p_explicit_opt_in IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',false,'reason','explicit_opt_in_required');
  END IF;

  INSERT INTO public.supply_contact_preferences_v1(
    artisan_id,outreach_status,reason,cooldown_until,opted_out_at,explicit_opt_in_at,updated_by_user_id,updated_at
  ) VALUES(
    p_artisan_id,p_status,NULLIF(btrim(COALESCE(p_reason,'')),''),
    CASE WHEN p_status='COOLDOWN' THEN p_cooldown_until ELSE NULL END,
    CASE WHEN p_status='OPTED_OUT' THEN now() ELSE NULL END,
    CASE WHEN p_status='ALLOWED' AND p_explicit_opt_in THEN now() ELSE NULL END,
    auth.uid(),now()
  )
  ON CONFLICT(artisan_id) DO UPDATE SET
    outreach_status=excluded.outreach_status,
    reason=excluded.reason,
    cooldown_until=excluded.cooldown_until,
    opted_out_at=CASE
      WHEN excluded.outreach_status='OPTED_OUT' THEN COALESCE(public.supply_contact_preferences_v1.opted_out_at,now())
      WHEN excluded.outreach_status='ALLOWED' AND p_explicit_opt_in THEN NULL
      ELSE public.supply_contact_preferences_v1.opted_out_at END,
    explicit_opt_in_at=CASE WHEN excluded.outreach_status='ALLOWED' AND p_explicit_opt_in THEN now() ELSE public.supply_contact_preferences_v1.explicit_opt_in_at END,
    updated_by_user_id=auth.uid(),
    updated_at=now();

  old_stage:=fixeo_private.supply_derived_stage_v1(p_artisan_id);
  INSERT INTO public.supply_lifecycle_events_v1(
    artisan_id,event_type,from_stage,to_stage,actor_kind,actor_user_id,evidence_class,evidence,idempotency_key
  ) VALUES(
    p_artisan_id,'contact.preference_changed',old_stage,old_stage,actor_kind,auth.uid(),
    CASE WHEN actor_kind='human' THEN 'operator_assertion' ELSE 'deterministic_rule' END,
    jsonb_build_object('from',COALESCE(old_status,'ALLOWED'),'to',p_status,'reason',p_reason),
    p_idempotency_key
  )
  ON CONFLICT(artisan_id,idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok',true,'artisan_id',p_artisan_id,'outreach_status',p_status);
END
$fn$;
ALTER FUNCTION public.supply_set_contact_preference_v1(uuid,text,text,timestamptz,boolean,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_set_contact_preference_v1(uuid,text,text,timestamptz,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_set_contact_preference_v1(uuid,text,text,timestamptz,boolean,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_record_stage_v1(
  p_artisan_id uuid,
  p_stage text,
  p_event_type text,
  p_evidence_class text DEFAULT 'operator_assertion',
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_next_action_at timestamptz DEFAULT NULL,
  p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  actor_kind text;
  current_stage text;
  derived_after text;
BEGIN
  actor_kind:=fixeo_private.supply_require_actor_v1();
  current_stage:=fixeo_private.supply_derived_stage_v1(p_artisan_id);
  IF current_stage IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','artisan_not_found'); END IF;
  IF p_stage NOT IN('REFERENCED','TO_CONTACT','RECRUITMENT_CANDIDATE','CONTACTED','ENGAGED') THEN
    RETURN jsonb_build_object('ok',false,'reason','canonical_stage_owned_elsewhere');
  END IF;
  IF p_evidence_class NOT IN('canonical_db','provider_event','user_message','operator_assertion','deterministic_rule','model_inference') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_evidence_class');
  END IF;
  IF current_stage IN('CLAIM_IN_PROGRESS','CLAIMED','ONBOARDED','VERIFIED','ACTIVATED') THEN
    RETURN jsonb_build_object('ok',false,'reason','cannot_downgrade_canonical_stage','current_stage',current_stage);
  END IF;

  INSERT INTO public.supply_artisan_state_v1(artisan_id,lifecycle_stage,next_action_at,stage_updated_at,updated_at)
  VALUES(p_artisan_id,p_stage,p_next_action_at,now(),now())
  ON CONFLICT(artisan_id) DO UPDATE SET
    lifecycle_stage=excluded.lifecycle_stage,
    next_action_at=excluded.next_action_at,
    stage_updated_at=now(),
    updated_at=now();

  IF p_stage='CONTACTED' THEN
    UPDATE public.supply_artisan_state_v1 SET last_contact_at=now() WHERE artisan_id=p_artisan_id;
  ELSIF p_stage='ENGAGED' THEN
    UPDATE public.supply_artisan_state_v1 SET last_engaged_at=now() WHERE artisan_id=p_artisan_id;
  END IF;

  derived_after:=fixeo_private.supply_derived_stage_v1(p_artisan_id);
  INSERT INTO public.supply_lifecycle_events_v1(
    artisan_id,event_type,from_stage,to_stage,actor_kind,actor_user_id,evidence_class,evidence,idempotency_key
  ) VALUES(
    p_artisan_id,COALESCE(NULLIF(btrim(p_event_type),''),'stage.changed'),
    current_stage,derived_after,actor_kind,auth.uid(),p_evidence_class,COALESCE(p_evidence,'{}'::jsonb),p_idempotency_key
  )
  ON CONFLICT(artisan_id,idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok',true,'artisan_id',p_artisan_id,'stage',derived_after);
END
$fn$;
ALTER FUNCTION public.supply_record_stage_v1(uuid,text,text,text,jsonb,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_record_stage_v1(uuid,text,text,text,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_record_stage_v1(uuid,text,text,text,jsonb,timestamptz,uuid) TO authenticated,service_role;

COMMIT;
