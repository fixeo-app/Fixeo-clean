-- Dossier foundation only. No bucket, request, mission or dispatch is created.
-- Controlled one-time migration; existing objects with these names must abort.
SET LOCAL lock_timeout = '3s';
CREATE SCHEMA IF NOT EXISTS fixeo_private;

CREATE TABLE fixeo_private.diagnostic_sessions_v1 (
  id uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  guest_secret_hash text CHECK (guest_secret_hash ~ '^[0-9a-f]{64}$'),
  owner_key text NOT NULL,
  source text NOT NULL DEFAULT 'homepage' CHECK (source IN ('homepage','rafi','client')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','analyzing','questions','ready','bound','expired')),
  city_slug text NOT NULL CHECK (city_slug = ANY(ARRAY['casablanca','rabat','marrakech','fes','tanger','agadir','meknes','oujda','kenitra','tetouan','sale','temara','el-jadida','beni-mellal','nador','khouribga','safi','taza','ouarzazate','mohammedia'])),
  input jsonb NOT NULL CHECK (jsonb_typeof(input)='object' AND octet_length(input::text) <= 32768),
  safety_signals jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(safety_signals)='array'),
  selected_run_id uuid,
  service_request_id uuid UNIQUE REFERENCES public.service_requests(id),
  consent_version text NOT NULL CHECK (consent_version='diagnostic-privacy-v1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  closed_seen_at timestamptz,
  CHECK ((owner_user_id IS NOT NULL AND guest_secret_hash IS NULL AND owner_key='u:'||owner_user_id::text)
      OR (owner_user_id IS NULL AND guest_secret_hash IS NOT NULL AND owner_key='g:'||guest_secret_hash)),
  CHECK ((state='bound') = (service_request_id IS NOT NULL))
);

CREATE TABLE fixeo_private.diagnostic_media_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES fixeo_private.diagnostic_sessions_v1(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo','video')),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','validating','ready','rejected','removed','deleted')),
  raw_path text NOT NULL UNIQUE,
  clean_path text NOT NULL UNIQUE,
  declared_mime text NOT NULL,
  declared_bytes integer NOT NULL CHECK (declared_bytes BETWEEN 1 AND 8388608),
  actual_mime text,
  actual_bytes integer CHECK (actual_bytes BETWEEN 1 AND 8388608),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  duration_ms integer CHECK (duration_ms > 0),
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  validation_lease uuid,
  lease_until timestamptz,
  upload_expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  purge_attempts integer NOT NULL DEFAULT 0,
  purge_after timestamptz NOT NULL DEFAULT now(),
  raw_deleted_at timestamptz,
  last_purge_error text,
  UNIQUE(session_id,id),
  CHECK (state <> 'ready' OR (actual_mime='image/webp' AND actual_bytes IS NOT NULL
    AND width IS NOT NULL AND height IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK (raw_path LIKE 'raw/'||session_id::text||'/%'),
  CHECK (clean_path LIKE 'safe/'||session_id::text||'/%')
);
CREATE INDEX diagnostic_media_session_idx ON fixeo_private.diagnostic_media_v1(session_id);
CREATE INDEX diagnostic_media_purge_idx ON fixeo_private.diagnostic_media_v1(purge_after,expires_at) WHERE state<>'deleted';

CREATE TABLE fixeo_private.diagnostic_runs_v1 (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES fixeo_private.diagnostic_sessions_v1(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  state text NOT NULL CHECK (state IN ('running','complete','failed')),
  input_snapshot jsonb NOT NULL,
  result jsonb,
  provider text NOT NULL,
  model text NOT NULL,
  contract_version text NOT NULL CHECK (contract_version='fixeo-diagnostic-v1'),
  safety_version text NOT NULL DEFAULT 'fixeo-safety-v1',
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd >= 0),
  usage jsonb NOT NULL DEFAULT '{}',
  error_code text,
  latency_ms integer CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  finished_at timestamptz,
  UNIQUE(session_id,id),
  CHECK (state <> 'complete' OR (result IS NOT NULL AND finished_at IS NOT NULL)),
  CHECK (result IS NULL OR octet_length(result::text) <= 32768)
);
CREATE UNIQUE INDEX diagnostic_one_running_idx ON fixeo_private.diagnostic_runs_v1(session_id) WHERE state='running';
ALTER TABLE fixeo_private.diagnostic_sessions_v1 ADD CONSTRAINT diagnostic_selected_run_fk
  FOREIGN KEY(id,selected_run_id) REFERENCES fixeo_private.diagnostic_runs_v1(session_id,id);

CREATE TABLE fixeo_private.diagnostic_usage_windows_v1 (
  quota_key text NOT NULL CHECK (length(quota_key) BETWEEN 1 AND 160),
  window_start timestamptz NOT NULL,
  requests bigint NOT NULL DEFAULT 0 CHECK (requests >= 0),
  sessions bigint NOT NULL DEFAULT 0 CHECK (sessions >= 0),
  analyses bigint NOT NULL DEFAULT 0 CHECK (analyses >= 0),
  bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  PRIMARY KEY(quota_key,window_start)
);

ALTER TABLE fixeo_private.diagnostic_sessions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.diagnostic_media_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.diagnostic_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.diagnostic_usage_windows_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.diagnostic_sessions_v1, fixeo_private.diagnostic_media_v1,
  fixeo_private.diagnostic_runs_v1, fixeo_private.diagnostic_usage_windows_v1
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION fixeo_private.diagnostic_quota_v1(p_limits jsonb,p_delta jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE lim jsonb; q fixeo_private.diagnostic_usage_windows_v1%ROWTYPE;
  w timestamptz := date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  dr bigint := coalesce((p_delta->>'requests')::bigint,0);
  ds bigint := coalesce((p_delta->>'sessions')::bigint,0);
  da bigint := coalesce((p_delta->>'analyses')::bigint,0);
  db bigint := coalesce((p_delta->>'bytes')::bigint,0);
  dc bigint := coalesce((p_delta->>'reserved_micro_usd')::bigint,0);
BEGIN
  IF p_limits IS NULL OR p_delta IS NULL OR jsonb_typeof(p_limits)<>'array' OR jsonb_array_length(p_limits) NOT BETWEEN 1 AND 3
    OR least(dr,ds,da,db,dc)<0 THEN RAISE EXCEPTION 'DIAGNOSTIC_QUOTA_INVALID'; END IF;
  -- Sorted row locking makes concurrent requests reserve all limits atomically.
  FOR lim IN SELECT value FROM jsonb_array_elements(p_limits) ORDER BY value->>'key' LOOP
    IF NOT (lim ?& ARRAY['key','requests','sessions','analyses','bytes','reserved_micro_usd'])
      OR EXISTS(SELECT 1 FROM jsonb_each(lim) x WHERE x.key IN ('requests','sessions','analyses','bytes','reserved_micro_usd') AND (jsonb_typeof(x.value)<>'number' OR x.value::text !~ '^[0-9]+$'))
      THEN RAISE EXCEPTION 'DIAGNOSTIC_QUOTA_INVALID'; END IF;
    INSERT INTO fixeo_private.diagnostic_usage_windows_v1(quota_key,window_start)
      VALUES(lim->>'key',w) ON CONFLICT DO NOTHING;
    SELECT * INTO q FROM fixeo_private.diagnostic_usage_windows_v1
      WHERE quota_key=lim->>'key' AND window_start=w FOR UPDATE;
    IF q.requests+dr>(lim->>'requests')::bigint OR q.sessions+ds>(lim->>'sessions')::bigint
      OR q.analyses+da>(lim->>'analyses')::bigint OR q.bytes+db>(lim->>'bytes')::bigint
      OR q.reserved_micro_usd+dc>(lim->>'reserved_micro_usd')::bigint
      THEN RAISE EXCEPTION 'DIAGNOSTIC_QUOTA_EXCEEDED'; END IF;
    UPDATE fixeo_private.diagnostic_usage_windows_v1 SET requests=requests+dr,
      sessions=sessions+ds, analyses=analyses+da, bytes=bytes+db,
      reserved_micro_usd=reserved_micro_usd+dc WHERE quota_key=q.quota_key AND window_start=w;
  END LOOP;
END $fn$;

CREATE FUNCTION public.diagnostic_quota_v1(p_limits jsonb,p_delta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM fixeo_private.diagnostic_quota_v1(p_limits,p_delta);
  RETURN jsonb_build_object('ok',true);
END $fn$;

CREATE FUNCTION fixeo_private.diagnostic_lock_v1(p_id uuid,p_actor text)
RETURNS fixeo_private.diagnostic_sessions_v1 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s fixeo_private.diagnostic_sessions_v1%ROWTYPE;
BEGIN
  SELECT * INTO s FROM fixeo_private.diagnostic_sessions_v1 WHERE id=p_id AND owner_key=p_actor FOR UPDATE;
  IF NOT FOUND OR s.expires_at <= now() OR s.state='expired'
    THEN RAISE EXCEPTION 'DIAGNOSTIC_NOT_FOUND'; END IF;
  RETURN s;
END $fn$;

CREATE FUNCTION public.diagnostic_state_v1(p_action text,p_actor text,p_session_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s fixeo_private.diagnostic_sessions_v1%ROWTYPE;
  m fixeo_private.diagnostic_media_v1%ROWTYPE;
  r fixeo_private.diagnostic_runs_v1%ROWTYPE;
  media jsonb; mid uuid; rid uuid; snapshot jsonb;
BEGIN
  IF p_actor IS NULL OR p_actor !~ '^(u:[0-9a-f-]{36}|g:[0-9a-f]{64})$'
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_INPUT'; END IF;
  IF p_action='create' THEN
    IF NOT EXISTS(SELECT 1 FROM fixeo_private.diagnostic_sessions_v1 WHERE id=p_session_id) THEN
      PERFORM fixeo_private.diagnostic_quota_v1(p_payload->'limits','{"sessions":1}');
      INSERT INTO fixeo_private.diagnostic_sessions_v1(id,owner_key,owner_user_id,guest_secret_hash,source,city_slug,input,consent_version)
        VALUES(p_session_id,p_actor,CASE WHEN left(p_actor,2)='u:' THEN substring(p_actor from 3)::uuid END,
          CASE WHEN left(p_actor,2)='g:' THEN substring(p_actor from 3) END,
          p_payload->>'source',p_payload->>'city_slug',p_payload->'input',p_payload->>'consent_version');
    END IF;
  END IF;
  s := fixeo_private.diagnostic_lock_v1(p_session_id,p_actor);
  IF p_action NOT IN ('create','get') THEN
    IF s.state='bound' THEN RAISE EXCEPTION 'DIAGNOSTIC_IMMUTABLE'; END IF;
    IF (p_payload->>'revision')::integer IS DISTINCT FROM s.revision
      THEN RAISE EXCEPTION 'DIAGNOSTIC_REVISION_CONFLICT'; END IF;
  END IF;
  IF p_action='update' THEN
    IF s.state='analyzing' THEN RAISE EXCEPTION 'DIAGNOSTIC_BUSY'; END IF;
    UPDATE fixeo_private.diagnostic_sessions_v1 SET input=p_payload->'input',city_slug=p_payload->>'city_slug',
      revision=revision+1,state='draft',selected_run_id=NULL,updated_at=now() WHERE id=s.id;
  ELSIF p_action='media_reserve' THEN
    IF s.state='analyzing' THEN RAISE EXCEPTION 'DIAGNOSTIC_BUSY'; END IF;
    IF p_payload->>'kind' IS DISTINCT FROM 'photo' THEN RAISE EXCEPTION 'DIAGNOSTIC_VIDEO_DISABLED'; END IF;
    IF (SELECT count(*) FROM fixeo_private.diagnostic_media_v1 WHERE session_id=s.id AND state IN ('reserved','validating','ready'))>=3
      THEN RAISE EXCEPTION 'DIAGNOSTIC_MEDIA_LIMIT'; END IF;
    IF p_payload->>'mime' NOT IN ('image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'DIAGNOSTIC_MEDIA_TYPE'; END IF;
    -- Reserve the maximum raw + sanitized bytes, not the untrusted declaration.
    PERFORM fixeo_private.diagnostic_quota_v1(p_payload->'limits','{"bytes":16777216}');
    mid:=gen_random_uuid();
    INSERT INTO fixeo_private.diagnostic_media_v1(id,session_id,kind,raw_path,clean_path,declared_mime,declared_bytes)
      VALUES(mid,s.id,'photo','raw/'||s.id::text||'/'||mid::text,
        'safe/'||s.id::text||'/'||mid::text||'.webp',p_payload->>'mime',(p_payload->>'bytes')::integer) RETURNING * INTO m;
    UPDATE fixeo_private.diagnostic_sessions_v1 SET revision=revision+1,state='draft',selected_run_id=NULL,updated_at=now() WHERE id=s.id;
  ELSIF p_action IN ('media_claim','media_finish','media_reject','media_remove') THEN
    IF s.state='analyzing' THEN RAISE EXCEPTION 'DIAGNOSTIC_BUSY'; END IF;
    SELECT * INTO m FROM fixeo_private.diagnostic_media_v1 WHERE session_id=s.id AND id=(p_payload->>'media_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DIAGNOSTIC_NOT_FOUND'; END IF;
    IF p_action='media_claim' THEN
      IF m.state='ready' THEN NULL;
      ELSIF m.state='reserved' OR (m.state='validating' AND m.lease_until<now()) THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('diagnostic-media-validation-v1',0));
        IF (SELECT count(*) FROM fixeo_private.diagnostic_media_v1 x WHERE x.state='validating' AND x.lease_until>now())>=4
          THEN RAISE EXCEPTION 'DIAGNOSTIC_CONCURRENCY_LIMIT'; END IF;
        UPDATE fixeo_private.diagnostic_media_v1 SET state='validating',validation_lease=gen_random_uuid(),lease_until=now()+interval '2 minutes'
          WHERE id=m.id RETURNING * INTO m;
      ELSE RAISE EXCEPTION 'DIAGNOSTIC_BUSY'; END IF;
    ELSIF p_action IN ('media_finish','media_reject') THEN
      IF m.state<>'validating' OR m.validation_lease IS DISTINCT FROM (p_payload->>'lease')::uuid OR m.lease_until<now()
        THEN RAISE EXCEPTION 'DIAGNOSTIC_LEASE_EXPIRED'; END IF;
      UPDATE fixeo_private.diagnostic_media_v1 SET state=CASE WHEN p_action='media_finish' THEN 'ready' ELSE 'rejected' END,
        actual_mime=p_payload->>'mime',actual_bytes=(p_payload->>'bytes')::integer,
        width=(p_payload->>'width')::integer,height=(p_payload->>'height')::integer,sha256=p_payload->>'sha256',
        validation_lease=NULL,lease_until=NULL WHERE id=m.id RETURNING * INTO m;
    ELSE
      IF m.state='validating' AND m.lease_until>now() THEN RAISE EXCEPTION 'DIAGNOSTIC_BUSY'; END IF;
      UPDATE fixeo_private.diagnostic_media_v1 SET state='removed',expires_at=now() WHERE id=m.id RETURNING * INTO m;
      UPDATE fixeo_private.diagnostic_sessions_v1 SET revision=revision+1,state='draft',selected_run_id=NULL,updated_at=now() WHERE id=s.id;
    END IF;
  ELSIF p_action='run_start' THEN
    rid:=(p_payload->>'run_id')::uuid;
    SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1 WHERE id=rid AND session_id=s.id;
    IF FOUND THEN
      IF r.revision<>s.revision THEN RAISE EXCEPTION 'DIAGNOSTIC_REVISION_CONFLICT'; END IF;
      RETURN jsonb_build_object('session',to_jsonb(s),'run',to_jsonb(r),'replayed',true);
    END IF;
    UPDATE fixeo_private.diagnostic_runs_v1 SET state='failed',error_code='LEASE_EXPIRED',finished_at=now()
      WHERE session_id=s.id AND state='running' AND lease_until<now();
    IF EXISTS(SELECT 1 FROM fixeo_private.diagnostic_runs_v1 WHERE session_id=s.id AND state='running')
      THEN RAISE EXCEPTION 'DIAGNOSTIC_BUSY'; END IF;
    IF EXISTS(SELECT 1 FROM fixeo_private.diagnostic_media_v1 WHERE session_id=s.id AND state IN ('reserved','validating'))
      THEN RAISE EXCEPTION 'DIAGNOSTIC_MEDIA_PENDING'; END IF;
    PERFORM fixeo_private.diagnostic_quota_v1(p_payload->'limits',jsonb_build_object('analyses',1,'reserved_micro_usd',(p_payload->>'reserved_micro_usd')::bigint));
    -- The global quota row stays locked through commit, serializing this admission check.
    IF (SELECT count(*) FROM fixeo_private.diagnostic_runs_v1 WHERE state='running' AND lease_until>now())>=4
      THEN RAISE EXCEPTION 'DIAGNOSTIC_CONCURRENCY_LIMIT'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sha256',sha256,'path',clean_path,'mime',actual_mime,'bytes',actual_bytes) ORDER BY id),'[]')
      INTO media FROM fixeo_private.diagnostic_media_v1 WHERE session_id=s.id AND state='ready';
    snapshot:=jsonb_build_object('input',s.input,'city_slug',s.city_slug,'media',media,'previous_safety_signals',s.safety_signals);
    INSERT INTO fixeo_private.diagnostic_runs_v1(id,session_id,revision,state,input_snapshot,provider,model,contract_version,reserved_micro_usd)
      VALUES(rid,s.id,s.revision,'running',snapshot,p_payload->>'provider',p_payload->>'model','fixeo-diagnostic-v1',(p_payload->>'reserved_micro_usd')::bigint) RETURNING * INTO r;
    UPDATE fixeo_private.diagnostic_sessions_v1 SET state='analyzing',selected_run_id=NULL,updated_at=now() WHERE id=s.id;
  ELSIF p_action IN ('run_finish','run_fail') THEN
    SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1 WHERE id=(p_payload->>'run_id')::uuid AND session_id=s.id FOR UPDATE;
    IF NOT FOUND OR r.state<>'running' OR r.revision<>s.revision OR r.lease_until<now()
      THEN RAISE EXCEPTION 'DIAGNOSTIC_LEASE_EXPIRED'; END IF;
    UPDATE fixeo_private.diagnostic_runs_v1 SET state=CASE WHEN p_action='run_finish' THEN 'complete' ELSE 'failed' END,
      result=CASE WHEN p_action='run_finish' THEN p_payload->'result' END,usage=coalesce(p_payload->'usage','{}'),
      error_code=p_payload->>'error_code',latency_ms=(p_payload->>'latency_ms')::integer,finished_at=now()
      WHERE id=r.id RETURNING * INTO r;
    UPDATE fixeo_private.diagnostic_sessions_v1 SET state=CASE WHEN p_action='run_fail' THEN 'draft'
        WHEN jsonb_array_length(coalesce(r.result->'questions','[]'))>0 THEN 'questions' ELSE 'ready' END,
      selected_run_id=CASE WHEN p_action='run_finish' THEN r.id END,
      safety_signals=CASE WHEN p_action='run_finish' THEN
        (SELECT coalesce(jsonb_agg(DISTINCT x),'[]') FROM jsonb_array_elements(s.safety_signals || coalesce(r.result->'safety'->'signals','[]')) x)
        ELSE s.safety_signals END,updated_at=now() WHERE id=s.id;
  ELSIF p_action NOT IN ('create','get') THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_ACTION'; END IF;

  SELECT * INTO s FROM fixeo_private.diagnostic_sessions_v1 WHERE id=s.id;
  IF s.selected_run_id IS NOT NULL THEN SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1 WHERE id=s.selected_run_id;
  ELSIF s.state='analyzing' THEN SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1 WHERE session_id=s.id AND state='running' ORDER BY created_at DESC LIMIT 1; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at),'[]') INTO media
    FROM fixeo_private.diagnostic_media_v1 x WHERE session_id=s.id AND state NOT IN ('removed','deleted');
  RETURN jsonb_build_object('session',to_jsonb(s),'media',media,'item',CASE WHEN m.id IS NOT NULL THEN to_jsonb(m) END,
    'run',CASE WHEN r.id IS NOT NULL THEN to_jsonb(r) END,'replayed',false);
END $fn$;

CREATE FUNCTION fixeo_private.diagnostic_run_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF OLD.state<>'running' OR NEW.id<>OLD.id OR NEW.session_id<>OLD.session_id
    OR NEW.revision<>OLD.revision OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
    OR NEW.provider<>OLD.provider OR NEW.model<>OLD.model OR NEW.contract_version<>OLD.contract_version
    OR NEW.reserved_micro_usd<>OLD.reserved_micro_usd
    THEN RAISE EXCEPTION 'DIAGNOSTIC_RUN_IMMUTABLE'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER diagnostic_run_immutable BEFORE UPDATE ON fixeo_private.diagnostic_runs_v1
  FOR EACH ROW EXECUTE FUNCTION fixeo_private.diagnostic_run_immutable_v1();

REVOKE ALL ON FUNCTION fixeo_private.diagnostic_quota_v1(jsonb,jsonb),
  fixeo_private.diagnostic_lock_v1(uuid,text),fixeo_private.diagnostic_run_immutable_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.diagnostic_state_v1(text,text,uuid,jsonb),
  public.diagnostic_quota_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.diagnostic_state_v1(text,text,uuid,jsonb),
  public.diagnostic_quota_v1(jsonb,jsonb) TO service_role;
