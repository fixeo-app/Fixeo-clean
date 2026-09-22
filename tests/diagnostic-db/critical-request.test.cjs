'use strict';
// PostgreSQL tests in an ephemeral PGlite database. Never contacts Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read(
  'supabase/migrations/20260922161825_diagnostic_critical_request_v2.sql',
);
const actor = 'g:' + 'a'.repeat(64);
const result = () => ({
  safety: {
    version: 'fixeo-risk-routing-v2',
    level: 'CRITICAL',
    stop: true,
    urgency: 'now',
    signals: ['gas'],
  },
  trade: { value: 'plomberie' },
  questions: [],
});

test('critical registration PostgreSQL contract', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_category text, city text, description text, client_phone text,
      urgency text CHECK(urgency IN ('normale','urgent','now')), status text, idempotency_key text UNIQUE, tracking_ref text, guest_token_hash text, client_profile_id uuid, pricing_offer_id uuid);
    CREATE TABLE public.fixture_dispatch(request_id uuid);
    CREATE FUNCTION public.fixture_dispatch_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description LIKE '%DB_ROLLBACK_FIXTURE%' THEN RAISE EXCEPTION 'FIXTURE_DISPATCH_FAILURE'; END IF;
      INSERT INTO public.fixture_dispatch VALUES(NEW.id); RETURN NEW; END $$;
    CREATE TRIGGER fixture_dispatch AFTER INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.fixture_dispatch_trigger();`);
  await db.exec(
    read('supabase/migrations/20260921174531_diagnostic_foundation_v1.sql'),
  );
  await db.exec(
    'ALTER TABLE fixeo_private.diagnostic_sessions_v1 ADD booking_context jsonb',
  );
  const bridge = read(
    'supabase/migrations/20260922014439_diagnostic_bridge_preserve_estimation_v1.sql',
  );
  const bind = bridge.match(
    /CREATE FUNCTION fixeo_private\.diagnostic_bind_v1[\s\S]*?END \$fn\$;/,
  )[0];
  await db.exec(bind);
  await db.exec(
    'REVOKE ALL ON FUNCTION fixeo_private.diagnostic_bind_v1(jsonb,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role',
  );
  async function seed(options = {}) {
    const id = randomUUID(),
      run = randomUUID();
    await db.query(
      `INSERT INTO fixeo_private.diagnostic_sessions_v1(id,guest_secret_hash,owner_key,city_slug,input,consent_version,expires_at)
      VALUES($1,$2,$3,'rabat',$4,'diagnostic-privacy-v1',now()+($5::integer * interval '1 hour'))`,
      [
        id,
        'a'.repeat(64),
        actor,
        JSON.stringify({ description: options.description || 'Odeur de gaz.' }),
        options.expired ? -1 : 24,
      ],
    );
    await db.query(
      `INSERT INTO fixeo_private.diagnostic_runs_v1(id,session_id,revision,state,input_snapshot,result,provider,model,contract_version,reserved_micro_usd,finished_at)
      VALUES($1,$2,1,'complete','{}',$3,'fixture','fixture','fixeo-diagnostic-v1',0,now())`,
      [run, id, JSON.stringify(options.result || result())],
    );
    await db.query(
      `UPDATE fixeo_private.diagnostic_sessions_v1 SET selected_run_id=$2,state='ready' WHERE id=$1`,
      [id, run],
    );
    return {
      session_id: id,
      run_id: run,
      revision: 1,
      actor,
      acknowledged: true,
    };
  }
  const legacyResult = result();
  legacyResult.safety.version = 'fixeo-safety-v1';
  const legacy = await seed({ result: legacyResult });
  const snapshot = async (id) =>
    (
      await db.query(
        'SELECT to_jsonb(s) AS value FROM fixeo_private.diagnostic_sessions_v1 s WHERE id=$1',
        [id],
      )
    ).rows[0].value;
  const beforeLegacy = await snapshot(legacy.session_id);
  await db.exec(migration);
  const call = async (context, extra = {}) =>
    (
      await db.query(
        'SELECT public.create_diagnostic_critical_request_v1($1,$2,$3,$4,$5) AS value',
        [
          JSON.stringify(context),
          extra.phone || '0600000000',
          'FX-TESTCRITICAL',
          'b'.repeat(64),
          extra.version || 'fixeo-critical-ack-v1',
        ],
      )
    ).rows[0].value;

  await t.test(
    'migration leaves old dossiers unchanged and refuses their critical results',
    async () => {
      assert.deepEqual(await snapshot(legacy.session_id), beforeLegacy);
      await assert.rejects(call(legacy), /DIAGNOSTIC_NOT_QUALIFIED/);
      assert.deepEqual(await snapshot(legacy.session_id), beforeLegacy);
    },
  );
  await t.test(
    'only service_role may invoke the new registration endpoint',
    async () => {
      const c = await seed();
      for (const role of ['anon', 'authenticated']) {
        await db.exec('SET ROLE ' + role);
        try {
          await assert.rejects(call(c), /permission denied/);
        } finally {
          await db.exec('RESET ROLE');
        }
      }
      const grants = await db.query(
        "SELECT has_function_privilege('service_role','public.create_diagnostic_critical_request_v1(jsonb,text,text,text,text)','EXECUTE') AS allowed",
      );
      assert.equal(grants.rows[0].allowed, true);
    },
  );
  await t.test(
    'false, absent, string or obsolete acknowledgement never writes',
    async () => {
      const c = await seed(),
        before = await snapshot(c.session_id);
      for (const acknowledged of [false, undefined, 'true'])
        await assert.rejects(
          call({ ...c, acknowledged }),
          /ACKNOWLEDGEMENT_REQUIRED/,
        );
      await assert.rejects(
        call(c, { version: 'wrong' }),
        /ACKNOWLEDGEMENT_REQUIRED/,
      );
      assert.deepEqual(await snapshot(c.session_id), before);
    },
  );
  await t.test(
    'ownership, exact revision/run and expiry are checked under the session lock',
    async () => {
      const c = await seed();
      await assert.rejects(
        call({ ...c, actor: 'g:' + 'c'.repeat(64) }),
        /DIAGNOSTIC_NOT_FOUND/,
      );
      await assert.rejects(
        call({ ...c, revision: 2 }),
        /DIAGNOSTIC_REVISION_CONFLICT/,
      );
      await assert.rejects(
        call({ ...c, run_id: randomUUID() }),
        /DIAGNOSTIC_REVISION_CONFLICT/,
      );
      await assert.rejects(
        call(await seed({ expired: true })),
        /DIAGNOSTIC_NOT_FOUND/,
      );
    },
  );
  await t.test(
    'noncritical or malformed results and invalid contacts cannot be registered as critical',
    async () => {
      for (const patch of [
        { level: 'URGENT' },
        { stop: false },
        { urgency: 'urgent' },
      ]) {
        const r = result();
        Object.assign(r.safety, patch);
        await assert.rejects(
          call(await seed({ result: r })),
          /DIAGNOSTIC_NOT_QUALIFIED/,
        );
      }
      const r = result();
      r.questions = [{ id: 'onset' }];
      await assert.rejects(
        call(await seed({ result: r })),
        /DIAGNOSTIC_NOT_QUALIFIED/,
      );
      await assert.rejects(
        call(await seed(), { phone: 'bad' }),
        /DIAGNOSTIC_INVALID_INPUT/,
      );
    },
  );
  await t.test(
    'acknowledged critical request binds atomically with now priority and an immutable CRITICAL audit',
    async () => {
      const c = await seed();
      await db.exec('SET ROLE service_role');
      let saved;
      try {
        saved = await call(c);
      } finally {
        await db.exec('RESET ROLE');
      }
      const s = await snapshot(c.session_id);
      assert.equal(s.state, 'bound');
      assert.equal(s.service_request_id, saved.request_id);
      assert.equal(s.booking_context.risk_level, 'CRITICAL');
      assert.equal(s.booking_context.acknowledgement.run_id, c.run_id);
      assert.equal(s.booking_context.acknowledgement.accepted, true);
      assert.ok(s.booking_context.acknowledgement.at);
      const sr = (
        await db.query('SELECT * FROM public.service_requests WHERE id=$1', [
          saved.request_id,
        ])
      ).rows[0];
      assert.equal(sr.urgency, 'now');
      assert.equal(sr.city, 'Rabat');
      assert.equal(sr.pricing_offer_id, null);
      const run = (
        await db.query(
          'SELECT result FROM fixeo_private.diagnostic_runs_v1 WHERE id=$1',
          [c.run_id],
        )
      ).rows[0].result;
      assert.equal(run.safety.stop, true);
      assert.equal(run.safety.level, 'CRITICAL');
    },
  );
  await t.test(
    'retry returns the same request and cannot change its phone or redispatch',
    async () => {
      const c = await seed(),
        first = await call(c),
        before = await snapshot(c.session_id),
        retry = await call(c);
      assert.equal(retry.request_id, first.request_id);
      assert.equal(retry.replayed, true);
      assert.deepEqual(await snapshot(c.session_id), before);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM public.fixture_dispatch WHERE request_id=$1',
            [first.request_id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        call(c, { phone: '0611111111' }),
        /DIAGNOSTIC_REQUEST_MISMATCH/,
      );
    },
  );
  await t.test(
    'downstream failure rolls back the request and leaves the dossier unbound',
    async () => {
      const c = await seed({ description: 'DB_ROLLBACK_FIXTURE' }),
        before = await snapshot(c.session_id);
      await assert.rejects(call(c), /FIXTURE_DISPATCH_FAILURE/);
      assert.deepEqual(await snapshot(c.session_id), before);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM public.service_requests WHERE idempotency_key=$1',
            ['diagnostic-critical:' + c.session_id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
});
