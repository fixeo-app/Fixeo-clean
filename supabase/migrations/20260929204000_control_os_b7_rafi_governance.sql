-- B7: evidence references, governed proposal links and explicit operator followups.
-- Existing business tables, authorities and policies remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE IF NOT EXISTS fixeo_private.rafi_proposals_v3(
 preview_id uuid PRIMARY KEY REFERENCES fixeo_private.control_action_previews_v1(id),
 actor_id uuid NOT NULL REFERENCES public.users(id), signal_id text NOT NULL, rule_id text NOT NULL,
 proof jsonb NOT NULL CHECK(octet_length(proof::text)<2048), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fixeo_private.rafi_proposals_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.rafi_proposals_v3 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.control_rafi_source_v3(p_source text,p_classification text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; rows jsonb;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_source NOT IN('operations','network','trust','finance','enterprise') OR p_source IS NULL THEN RAISE EXCEPTION 'INVALID_SOURCE';END IF;
 j:=CASE WHEN p_source='network' THEN public.control_marketplace_signals_v1(p_source,p_classification) ELSE public.control_rafi_source_v1(p_source,p_classification) END;
 SELECT coalesce(jsonb_agg(o||jsonb_build_object('proof',jsonb_build_object('source',p_source,'classification',p_classification,
 'ref','obs_'||md5(jsonb_build_array(p_source,p_classification,o->>'kind',o->>'target_type',o->>'target_id',o->>'city',o->>'service_category',o->>'enterprise_id',o->>'site_id')::text),
 'token',md5(o::text),'observed_at',now(),'valid_until',now()+interval '60 seconds')) ORDER BY ordinal),'[]') INTO rows
 FROM jsonb_array_elements(j->'observations') WITH ORDINALITY e(o,ordinal);
 RETURN j||jsonb_build_object('observations',rows,'evidence_contract','rafi-evidence-v3');
END $$;

CREATE FUNCTION fixeo_private.rafi_current_proof_v3(p_proof jsonb,p_fresh boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; o jsonb;t timestamptz;until_at timestamptz;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_proof IS NULL OR jsonb_typeof(p_proof)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_proof) k WHERE k NOT IN('source','classification','ref','token','observed_at','valid_until'))
 OR p_proof->>'ref' IS NULL OR p_proof->>'ref' !~ '^obs_[0-9a-f]{32}$' OR p_proof->>'token' IS NULL OR p_proof->>'token' !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'INVALID_EVIDENCE';END IF;
 t:=(p_proof->>'observed_at')::timestamptz;until_at:=(p_proof->>'valid_until')::timestamptz;
 IF p_fresh AND(t IS NULL OR until_at IS NULL OR t>now()+interval '5 seconds' OR t<now()-interval '60 seconds' OR until_at<=now() OR until_at>t+interval '60 seconds') THEN RAISE EXCEPTION 'STALE_EVIDENCE';END IF;
 j:=public.control_rafi_source_v3(p_proof->>'source',p_proof->>'classification');
 SELECT value INTO o FROM jsonb_array_elements(j->'observations') WHERE value#>>'{proof,ref}'=p_proof->>'ref';
 IF o IS NULL THEN RAISE EXCEPTION 'EVIDENCE_NOT_OBSERVED';END IF;
 IF o#>>'{proof,token}' IS DISTINCT FROM p_proof->>'token' THEN RAISE EXCEPTION 'EVIDENCE_CHANGED';END IF;
 RETURN o;
END $$;

CREATE FUNCTION public.control_rafi_proposal_v3(p_proof jsonb,p_rule text,p_capability text,p_target_id uuid,p_payload jsonb,p_correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1();o jsonb;j jsonb;sid text;pid uuid;expiry timestamptz;
BEGIN
 o:=fixeo_private.rafi_current_proof_v3(p_proof,true);
 IF p_target_id IS NULL OR o->>'target_id' IS DISTINCT FROM p_target_id::text OR o->>'kind' IS DISTINCT FROM p_rule THEN RAISE EXCEPTION 'INVALID_PROPOSAL_TARGET';END IF;
 IF NOT ((p_rule='request.waiting' AND p_capability='request.dispatch' AND o->>'enterprise_id' IS NULL AND o#>>'{facts,status}'='new')
 OR(p_rule='quote.review' AND p_capability IN('quote.approve','quote.reject'))
 OR(p_rule='claim.pending' AND p_capability IN('claim.approve','claim.reject'))
 OR(p_rule='finance.price_missing' AND p_capability='mission.settle')) THEN RAISE EXCEPTION 'PROPOSAL_NOT_ADMISSIBLE';END IF;
 -- The existing authority validates payload, permission, P0 and all business preconditions.
 j:=public.control_action_preview_v1(p_capability,p_target_id,p_payload,p_correlation_id);pid:=(j->>'preview_id')::uuid;
 sid:='rafi_'||md5((p_proof->>'ref')||p_rule);expiry:=least((j->>'expires_at')::timestamptz,(p_proof->>'valid_until')::timestamptz);
 INSERT INTO fixeo_private.rafi_proposals_v3(preview_id,actor_id,signal_id,rule_id,proof,expires_at) VALUES(pid,uid,sid,p_rule,p_proof,expiry);
 PERFORM fixeo_private.authority_audit_v1(o->>'target_type',p_target_id,'RAFI proposal','preview','prepared',jsonb_build_object('signal_id',sid,'evidence_ref',p_proof->>'ref','fingerprint',p_proof->>'token','preview_id',pid,'authority',p_capability));
 RETURN j||jsonb_build_object('kind','ActionProposal','signal_id',sid,'evidence_ref',p_proof->>'ref','evidence_fingerprint',p_proof->>'token','expires_at',expiry,'requires_confirmation',true,'execution_authorized',false);
END $$;

CREATE FUNCTION public.control_rafi_execute_v3(p_preview_id uuid,p_confirmed boolean,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1();link fixeo_private.rafi_proposals_v3;prior fixeo_private.control_action_previews_v1;j jsonb;err text;aid uuid;
BEGIN
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'HUMAN_CONFIRMATION_REQUIRED';END IF;
 SELECT * INTO link FROM fixeo_private.rafi_proposals_v3 WHERE preview_id=p_preview_id AND actor_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND';END IF;
 SELECT * INTO prior FROM fixeo_private.control_action_previews_v1 WHERE id=p_preview_id AND actor_id=uid;
 IF prior.executed_at IS NULL THEN
  BEGIN
   IF link.expires_at<=now() THEN RAISE EXCEPTION 'STALE_EVIDENCE';END IF;
   PERFORM fixeo_private.rafi_current_proof_v3(link.proof,false);
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err NOT IN('STALE_EVIDENCE','EVIDENCE_CHANGED','EVIDENCE_NOT_OBSERVED') THEN RAISE;END IF;
   aid:=fixeo_private.authority_audit_v1('rafi_proposal',p_preview_id,'RAFI proposal','execute','refused',jsonb_build_object('signal_id',link.signal_id,'evidence_ref',link.proof->>'ref','code',err));
   RETURN jsonb_build_object('ok',false,'code',err,'audit_id',aid,'signal_id',link.signal_id);
  END;
 END IF;
 -- Successful retries stay governed by the canonical idempotency ledger, including after evidence expiry.
 j:=public.control_action_execute_v1(p_preview_id,true,p_idempotency_key);
 RETURN j||jsonb_build_object('kind','DecisionResult','signal_id',link.signal_id,'evidence_ref',link.proof->>'ref','evidence_fingerprint',link.proof->>'token','actor_id',uid,'confirmation',true);
END $$;

CREATE TABLE IF NOT EXISTS fixeo_private.rafi_followups_v3(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.users(id),
 signal_id text NOT NULL,rule_id text NOT NULL CHECK(length(rule_id)<80),proof jsonb NOT NULL CHECK(octet_length(proof::text)<2048),
 observation_ref text NOT NULL,target_type text NOT NULL,target_id uuid,
 due_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged','resolved')),
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 resolution_audit_id uuid REFERENCES fixeo_private.authority_audit_events_v1(id),last_audit_id uuid,
 UNIQUE(owner_id,observation_ref,rule_id)
);
CREATE TABLE IF NOT EXISTS fixeo_private.rafi_followup_commands_v3(
 actor_id uuid NOT NULL REFERENCES public.users(id),idempotency_key uuid NOT NULL,request_hash text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE fixeo_private.rafi_followups_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.rafi_followup_commands_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.rafi_followups_v3,fixeo_private.rafi_followup_commands_v3 FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS rafi_followups_owner_page_v3 ON fixeo_private.rafi_followups_v3(owner_id,id);

CREATE FUNCTION public.control_rafi_followups_v3(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1();f record;j jsonb;current_o jsonb;cache jsonb:='{}';items jsonb:='[]';key text;delta text;more boolean;total_n bigint;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_LIMIT';END IF;
 SELECT count(*) INTO total_n FROM fixeo_private.rafi_followups_v3 WHERE owner_id=uid;
 FOR f IN SELECT * FROM fixeo_private.rafi_followups_v3 WHERE owner_id=uid AND(p_after IS NULL OR id>p_after) ORDER BY id LIMIT p_limit LOOP
  key:=(f.proof->>'source')||':'||(f.proof->>'classification');
  IF NOT cache?key THEN
   BEGIN j:=public.control_rafi_source_v3(f.proof->>'source',f.proof->>'classification');
   EXCEPTION WHEN OTHERS THEN j:=jsonb_build_object('status','ERROR','observations','[]'::jsonb,'as_of',NULL);END;
   cache:=cache||jsonb_build_object(key,j);
  END IF;
  SELECT value INTO current_o FROM jsonb_array_elements(cache#>ARRAY[key,'observations']) WHERE value#>>'{proof,ref}'=f.observation_ref;
  delta:=CASE WHEN current_o IS NULL THEN 'UNKNOWN' WHEN current_o#>>'{proof,token}'=f.proof->>'token' THEN 'UNCHANGED' ELSE 'CHANGED' END;
  items:=items||jsonb_build_array(jsonb_build_object('kind','Followup','id',f.id,'owner_id',uid,'signal_id',f.signal_id,'rule_id',f.rule_id,'target_type',f.target_type,'target_id',f.target_id,'due_at',f.due_at,'status',f.status,'version',f.version,'created_at',f.created_at,'updated_at',f.updated_at,'evidence_ref',f.observation_ref,'evidence_fingerprint',f.proof->>'token','delta',delta,'source_status',CASE WHEN cache#>>ARRAY[key,'status']='ERROR' THEN 'ERROR' WHEN cache#>>ARRAY[key,'has_more']='true' THEN 'PARTIAL' ELSE 'FRESH' END,'last_observed_at',cache#>ARRAY[key,'as_of'],'resolution_audit_id',f.resolution_audit_id,'audit_id',f.last_audit_id,'closure','explicit canonical event proof required; absence never resolves'));
 END LOOP;
 SELECT EXISTS(SELECT 1 FROM fixeo_private.rafi_followups_v3 WHERE owner_id=uid AND id>(items->-1->>'id')::uuid) INTO more;
 RETURN jsonb_build_object('items',items,'has_more',more,'total',total_n,'next_cursor',CASE WHEN more THEN items->-1->>'id' END,'as_of',now(),'scope','operator-owned followups only','source_reads',(SELECT count(*) FROM jsonb_object_keys(cache)),'business_mutations',0);
END $$;

CREATE FUNCTION public.control_rafi_followup_v3(p_operation text,p_id uuid,p_version integer,p_proof jsonb,p_rule text,p_due_at timestamptz,p_resolution_audit_id uuid,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1();f fixeo_private.rafi_followups_v3;prior fixeo_private.rafi_followup_commands_v3;event fixeo_private.authority_audit_events_v1;o jsonb;request_hash text;result jsonb;before_state jsonb;aid uuid;created_id uuid;resolved boolean:=false;
BEGIN
 IF p_idempotency_key IS NULL OR p_operation IS NULL OR p_operation NOT IN('create','acknowledge','reschedule','resolve','reopen') THEN RAISE EXCEPTION 'INVALID_FOLLOWUP_COMMAND';END IF;
 request_hash:=md5(jsonb_build_array(p_operation,p_id,p_version,p_proof,p_rule,p_due_at,p_resolution_audit_id)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||p_idempotency_key::text,0));
 SELECT * INTO prior FROM fixeo_private.rafi_followup_commands_v3 WHERE actor_id=uid AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request_hash<>request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN prior.result;END IF;
 IF p_operation IN('create','reschedule','reopen') AND(p_due_at IS NULL OR p_due_at<now()-interval '1 day' OR p_due_at>now()+interval '365 days') THEN RAISE EXCEPTION 'INVALID_DUE_AT';END IF;
 IF p_operation IN('create','reopen') THEN
  o:=fixeo_private.rafi_current_proof_v3(p_proof,true);
  IF p_rule IS NULL OR p_rule NOT IN('request.waiting','mission.inconsistent','mission.aging','quote.review','dispatch.failed','network.context_missing','network.coverage','network.capacity','network.verify','network.activate','network.concentration','claim.pending','artisan.verification_conflict','finance.price_missing','finance.declared','finance.overpaid','enterprise.sla','enterprise.internal_capacity','enterprise.fallback','enterprise.dispatch_failed','marketplace.conversion_review') THEN RAISE EXCEPTION 'INVALID_RULE';END IF;
  IF NOT(o->>'kind'=p_rule OR(o->>'kind'='network.cohort' AND p_rule LIKE 'network.%') OR(o->>'kind'='enterprise.request' AND p_rule LIKE 'enterprise.%') OR(o->>'kind'='marketplace.cohorts' AND p_rule='marketplace.conversion_review')) THEN RAISE EXCEPTION 'INVALID_RULE';END IF;
 END IF;
 IF p_operation='create' THEN
  IF p_id IS NOT NULL OR p_version IS NOT NULL OR p_resolution_audit_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_FOLLOWUP_COMMAND';END IF;
  INSERT INTO fixeo_private.rafi_followups_v3(owner_id,signal_id,rule_id,proof,observation_ref,target_type,target_id,due_at)
   VALUES(uid,'rafi_'||md5((p_proof->>'ref')||p_rule),p_rule,p_proof,p_proof->>'ref',o->>'target_type',(o->>'target_id')::uuid,p_due_at)
   ON CONFLICT(owner_id,observation_ref,rule_id) DO NOTHING RETURNING id INTO created_id;
  SELECT * INTO f FROM fixeo_private.rafi_followups_v3 WHERE owner_id=uid AND observation_ref=p_proof->>'ref' AND rule_id=p_rule FOR UPDATE;
  IF created_id IS NULL THEN
   result:=jsonb_build_object('ok',true,'followup',to_jsonb(f)-'proof','audit_id',f.last_audit_id,'unchanged',true);
   INSERT INTO fixeo_private.rafi_followup_commands_v3 VALUES(uid,p_idempotency_key,request_hash,result,now());RETURN result;
  END IF;
 ELSE
  SELECT * INTO f FROM fixeo_private.rafi_followups_v3 WHERE id=p_id AND owner_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
  IF p_version IS NULL OR f.version<>p_version THEN RAISE EXCEPTION 'STALE_FOLLOWUP';END IF;
  IF p_operation<>'reopen' AND f.status='resolved' THEN RAISE EXCEPTION 'FOLLOWUP_RESOLVED';END IF;
  before_state:=jsonb_build_object('status',f.status,'version',f.version,'due_at',f.due_at);
  IF p_operation='resolve' THEN
   SELECT * INTO event FROM fixeo_private.authority_audit_events_v1 WHERE id=p_resolution_audit_id;
   IF NOT FOUND OR event.result<>'succeeded' OR event.occurred_at<f.created_at OR event.authority IN('RAFI followup','RAFI proposal') OR f.target_id IS NULL THEN RAISE EXCEPTION 'CANONICAL_RESOLUTION_PROOF_REQUIRED';END IF;
   IF event.target_id<>f.target_id AND NOT(f.target_type='request' AND EXISTS(SELECT 1 FROM public.missions m WHERE m.id=event.target_id AND m.request_id=f.target_id::text)) THEN RAISE EXCEPTION 'RESOLUTION_TARGET_MISMATCH';END IF;
   CASE f.rule_id
    WHEN 'claim.pending' THEN SELECT status IN('approved','rejected','superseded_by_approval') INTO resolved FROM public.claim_requests WHERE id=f.target_id FOR SHARE;
    WHEN 'quote.review' THEN SELECT review_status IN('approved','rejected') INTO resolved FROM public.quotes WHERE id=f.target_id FOR SHARE;
    WHEN 'finance.price_missing' THEN SELECT m.final_price IS NOT NULL AND EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id::text=m.request_id) INTO resolved FROM public.missions m WHERE m.id=f.target_id FOR SHARE;
    WHEN 'request.waiting' THEN SELECT EXISTS(SELECT 1 FROM public.missions m WHERE m.request_id=r.id::text AND m.status IN('pending','done','validated') AND m.accepted_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.enterprise_internal_assignments i WHERE i.service_request_id=r.id AND i.status IN('assigned','in_progress','completed','validated')) INTO resolved FROM public.service_requests r WHERE r.id=f.target_id FOR SHARE;
    ELSE resolved:=false;
   END CASE;
   IF resolved IS DISTINCT FROM true THEN RAISE EXCEPTION 'RESOLUTION_NOT_PROVEN';END IF;
   f.status:='resolved';f.resolution_audit_id:=p_resolution_audit_id;
  ELSIF p_operation='acknowledge' THEN f.status:='acknowledged';
  ELSIF p_operation='reschedule' THEN f.due_at:=p_due_at;
  ELSE
   IF f.status<>'resolved' OR p_proof->>'ref' IS DISTINCT FROM f.observation_ref OR p_rule IS DISTINCT FROM f.rule_id THEN RAISE EXCEPTION 'INVALID_REOPEN';END IF;
   f.status:='open';f.proof:=p_proof;f.due_at:=p_due_at;f.resolution_audit_id:=NULL;
  END IF;
  f.version:=f.version+1;f.updated_at:=now();
 END IF;
 PERFORM set_config('fixeo.idempotency_key',p_idempotency_key::text,true);
 aid:=fixeo_private.authority_audit_v1(CASE WHEN f.target_id IS NULL THEN 'rafi_followup' ELSE f.target_type END,coalesce(f.target_id,f.id),'RAFI followup',p_operation,'succeeded',jsonb_build_object('followup_id',f.id,'signal_id',f.signal_id,'evidence_ref',f.observation_ref,'before',before_state,'after',jsonb_build_object('status',f.status,'version',f.version,'due_at',f.due_at),'resolution_audit_id',f.resolution_audit_id));
 UPDATE fixeo_private.rafi_followups_v3 SET status=f.status,version=f.version,due_at=f.due_at,proof=f.proof,updated_at=f.updated_at,resolution_audit_id=f.resolution_audit_id,last_audit_id=aid WHERE id=f.id;
 f.last_audit_id:=aid;result:=jsonb_build_object('ok',true,'followup',to_jsonb(f)-'proof','audit_id',aid,'business_mutations',0);
 INSERT INTO fixeo_private.rafi_followup_commands_v3 VALUES(uid,p_idempotency_key,request_hash,result,now());RETURN result;
END $$;

CREATE FUNCTION public.control_rafi_followup_evidence_v3(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1();f fixeo_private.rafi_followups_v3;items jsonb;
BEGIN
 SELECT * INTO f FROM fixeo_private.rafi_followups_v3 WHERE id=p_id AND owner_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.occurred_at DESC,a.id),'[]') INTO items FROM(
  SELECT e.id,e.occurred_at,e.authority,e.action,e.result FROM fixeo_private.authority_audit_events_v1 e
  WHERE e.occurred_at>=f.created_at AND e.result='succeeded' AND e.authority NOT IN('RAFI followup','RAFI proposal')
  AND(e.target_id=f.target_id OR(f.target_type='request' AND EXISTS(SELECT 1 FROM public.missions m WHERE m.id=e.target_id AND m.request_id=f.target_id::text)))
  ORDER BY e.occurred_at DESC,e.id LIMIT 10
 ) a;
 RETURN jsonb_build_object('followup_id',f.id,'version',f.version,'candidates',items,'status','REVIEW_REQUIRED','message','Événements canoniques à examiner. La clôture exige également un état métier compatible, revérifié par le serveur.','execution_authorized',false);
END $$;
REVOKE ALL ON FUNCTION public.control_rafi_followup_evidence_v3(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_rafi_followup_evidence_v3(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.control_rafi_followups_v3(uuid,integer),public.control_rafi_followup_v3(text,uuid,integer,jsonb,text,timestamptz,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_rafi_followups_v3(uuid,integer),public.control_rafi_followup_v3(text,uuid,integer,jsonb,text,timestamptz,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION fixeo_private.rafi_current_proof_v3(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.control_rafi_source_v3(text,text),public.control_rafi_proposal_v3(jsonb,text,text,uuid,jsonb,uuid),public.control_rafi_execute_v3(uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_rafi_source_v3(text,text),public.control_rafi_proposal_v3(jsonb,text,text,uuid,jsonb,uuid),public.control_rafi_execute_v3(uuid,boolean,uuid) TO authenticated;
CREATE FUNCTION fixeo_private.rafi_guard_bound_preview_v3(p_preview_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1();link fixeo_private.rafi_proposals_v3;
BEGIN
 SELECT * INTO link FROM fixeo_private.rafi_proposals_v3 WHERE preview_id=p_preview_id;
 IF NOT FOUND THEN RETURN;END IF;
 IF link.actor_id<>uid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF link.expires_at<=now() THEN RAISE EXCEPTION 'STALE_EVIDENCE';END IF;
 PERFORM fixeo_private.rafi_current_proof_v3(link.proof,false);
END $$;
REVOKE ALL ON FUNCTION fixeo_private.rafi_guard_bound_preview_v3(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.control_action_execute_v1(p_preview_id uuid,p_confirmed boolean,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1(); a fixeo_private.control_action_previews_v1; prior fixeo_private.control_action_previews_v1; typ text; j jsonb; result jsonb; q public.quotes; aid uuid; rid uuid; err text; audit_id uuid;
BEGIN
 IF p_confirmed IS DISTINCT FROM true OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'HUMAN_CONFIRMATION_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||p_idempotency_key::text,0));
 SELECT * INTO prior FROM fixeo_private.control_action_previews_v1 WHERE actor_id=uid AND idempotency_key=p_idempotency_key;
 IF FOUND AND prior.id<>p_preview_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 SELECT * INTO a FROM fixeo_private.control_action_previews_v1 WHERE id=p_preview_id AND actor_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF a.executed_at IS NOT NULL THEN RETURN a.execution_result; END IF;
 IF a.expires_at<=now() THEN RAISE EXCEPTION 'PREVIEW_EXPIRED'; END IF;
 PERFORM set_config('fixeo.correlation_id',a.correlation_id::text,true); PERFORM set_config('fixeo.idempotency_key',p_idempotency_key::text,true);
 typ:=fixeo_private.control_action_type_v1(a.capability);
 BEGIN
  -- Match canonical lock ordering. Never lock claim before its artisan or quote before its request.
  CASE typ
   WHEN 'request' THEN PERFORM 1 FROM public.service_requests WHERE id=a.target_id FOR UPDATE;
   WHEN 'mission' THEN PERFORM 1 FROM public.missions WHERE id=a.target_id FOR UPDATE;
   WHEN 'artisan' THEN PERFORM 1 FROM public.artisans WHERE id=a.target_id FOR UPDATE;
   WHEN 'enterprise' THEN PERFORM 1 FROM public.enterprise_accounts WHERE id=a.target_id FOR UPDATE;
   WHEN 'quote' THEN SELECT request_id INTO rid FROM public.quotes WHERE id=a.target_id; PERFORM 1 FROM public.service_requests WHERE id=rid FOR UPDATE; PERFORM 1 FROM public.quotes WHERE id=a.target_id FOR UPDATE;
   WHEN 'claim' THEN SELECT coalesce((SELECT id FROM public.artisans WHERE id=c.artisan_id),(SELECT id FROM public.artisans WHERE id::text=c.artisan_legacy_id LIMIT 1),(SELECT id FROM public.artisans WHERE legacy_id=c.artisan_legacy_id ORDER BY id LIMIT 1)) INTO aid FROM public.claim_requests c WHERE c.id=a.target_id; PERFORM 1 FROM public.artisans WHERE id=aid FOR UPDATE; PERFORM 1 FROM public.claim_requests WHERE id=a.target_id FOR UPDATE;
  END CASE;
 PERFORM fixeo_private.rafi_guard_bound_preview_v3(a.id);
  j:=fixeo_private.control_row_v1(typ,a.target_id);
  IF j IS NULL OR md5(j::text)<>a.fingerprint THEN RAISE EXCEPTION 'STALE_PREVIEW' USING ERRCODE='40001'; END IF;
  CASE a.capability
   WHEN 'artisan.verify' THEN result:=public.admin_verify_artisan_v1(a.target_id);
   WHEN 'claim.approve' THEN result:=public.approve_artisan_claim(a.target_id);
   WHEN 'claim.reject' THEN result:=public.reject_artisan_claim(a.target_id,a.payload->>'reason');
   WHEN 'quote.approve' THEN q:=public.review_marketplace_quote_v1(a.target_id,(a.payload->>'version')::integer,true,a.payload->>'reason',(a.payload->>'expires_at')::timestamptz); result:=jsonb_build_object('id',q.id,'review_status',q.review_status,'version',q.quote_version);
   WHEN 'quote.reject' THEN q:=public.review_marketplace_quote_v1(a.target_id,(a.payload->>'version')::integer,false,a.payload->>'reason'); result:=jsonb_build_object('id',q.id,'review_status',q.review_status,'version',q.quote_version);
   WHEN 'mission.settle' THEN result:=public.admin_settle_mission_v1(a.target_id,(a.payload->>'final_price')::numeric,(a.payload->>'expected_final_price')::numeric,a.payload->>'reason');
   WHEN 'request.dispatch' THEN
    IF EXISTS(SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=a.target_id) THEN RAISE EXCEPTION 'ENTERPRISE_DELEGATION_REQUIRED' USING ERRCODE='42501'; END IF;
    result:=public.admin_targeted_dispatch_v1(a.target_id,(a.payload->>'artisan_id')::uuid);
    IF coalesce((result->>'ok')::boolean,false) THEN PERFORM public.admin_targeted_dispatch_notifications_s1b2(a.target_id,(a.payload->>'artisan_id')::uuid); END IF;
   WHEN 'request.classify' THEN
    IF coalesce(a.payload->>'classification','') NOT IN('production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
    UPDATE public.service_requests SET data_classification=nullif(a.payload->>'classification','unclassified') WHERE id=a.target_id; result:=jsonb_build_object('classification',a.payload->>'classification');
   WHEN 'artisan.classify' THEN
    IF coalesce(a.payload->>'classification','') NOT IN('production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
    UPDATE public.artisans SET data_classification=nullif(a.payload->>'classification','unclassified') WHERE id=a.target_id; result:=jsonb_build_object('classification',a.payload->>'classification');
   WHEN 'enterprise.classify' THEN
    IF coalesce(a.payload->>'classification','') NOT IN('production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
    UPDATE public.enterprise_accounts SET data_classification=nullif(a.payload->>'classification','unclassified') WHERE id=a.target_id; result:=jsonb_build_object('classification',a.payload->>'classification');
   ELSE
    IF a.capability NOT IN('finance.declare','finance.confirm','finance.cancel','finance.correct') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
    result:=public.admin_commission_remittance_v1(a.target_id,split_part(a.capability,'.',2),(a.payload->>'remittance_id')::uuid,(a.payload->>'version')::integer,(a.payload->>'amount')::numeric,a.payload->>'method',a.payload->>'proof_reference',a.payload->>'reason');
  END CASE;
  IF result->>'ok'='false' THEN RAISE EXCEPTION '%',coalesce(result->>'reason','AUTHORITY_REJECTED'); END IF;
  -- Verify by re-reading the authority under the transaction; expose only the minimal projection.
  j:=fixeo_private.control_row_v1(typ,a.target_id);
  result:=jsonb_build_object('ok',true,'result',result,'verified',j);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  result:=jsonb_build_object('ok',false,'code',CASE WHEN err ~ '^[A-Za-z0-9_]{3,80}$' THEN err ELSE 'AUTHORITY_REJECTED' END);
 END;
 audit_id:=fixeo_private.authority_audit_v1(typ,a.target_id,a.capability,'execute',CASE WHEN result->>'ok'='true' THEN 'succeeded' ELSE 'failed' END,jsonb_build_object('preview_id',a.id,'code',result->>'code'));
 result:=result||jsonb_build_object('audit_id',audit_id,'correlation_id',a.correlation_id,'idempotency_key',p_idempotency_key);
 UPDATE fixeo_private.control_action_previews_v1 SET executed_at=now(),execution_result=result,idempotency_key=p_idempotency_key WHERE id=a.id;
 RETURN result;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
