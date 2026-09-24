const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('../auth-security-p0/node_modules/@electric-sql/pglite');
const { evidence, before, after, dir, literal, uuid, ids, fixtureSQL, transactionBody, catalogue } = require('./fixture.cjs');
const patch = transactionBody(path.join(dir, 'patch-proposed.sql'));
const rollback = transactionBody(path.join(dir, 'rollback-reference.sql'));

test('S0 PostgreSQL 17: every fixture and validation write is enclosed in BEGIN / ROLLBACK', async t => {
  const db = new PGlite();
  const rows = async sql => (await db.query(sql)).rows;
  const scalar = async sql => Object.values((await rows(sql))[0])[0];
  const snapshot = async () => (await rows(catalogue))[0].contract;
  const asRole = async (role, sub = null) => db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims',${literal(JSON.stringify({role,sub}))},true); SET LOCAL ROLE ${role};`);
  const owner = () => asRole('postgres');
  const error = async (sql, code) => {
    await db.exec('SAVEPOINT expected_error;');
    try { await assert.rejects(db.exec(sql), e => e.code === code); }
    finally { await db.exec('ROLLBACK TO expected_error; RELEASE expected_error;'); }
  };
  const isolated = async (name, fn) => t.test(name, async () => {
    await owner();
    await db.exec('SAVEPOINT test_case;');
    try { await fn(); }
    finally { await db.exec('ROLLBACK TO test_case; RELEASE test_case;'); await owner(); }
  });
  const request = n => `INSERT INTO public.service_requests(id,client_profile_id,service_category,city,description) VALUES ('${uuid(n)}','${ids.client}','plomberie','Casablanca','synthetic local ACL test');`;
  const allData = async () => {
    const result = {};
    for (const tab of evidence.tables.tables) result[tab.name] = await scalar(`SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (SELECT to_jsonb(t) x FROM public.${tab.name} t) s`);
    return result;
  };
  try {
    assert.match(await scalar('SHOW server_version'), /^17\./);
    await db.exec('BEGIN;');
    await db.exec(fixtureSQL());
    await isolated('S01 Exact baseline: 29 functions, 23 tables, 86 policies, 21 triggers and 155 constraints', async () => {
      assert.deepEqual(await snapshot(), before);
    });
    await isolated('S02 Atomic preflight rejects an unexpected backup grant without partial ACL changes', async () => {
      await db.exec('REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1_backup_20260821(uuid) FROM anon;');
      const drift = await snapshot();
      await error(patch, 'P0001');
      assert.deepEqual(await snapshot(), drift);
    });
    await isolated('S03 Atomic preflight rejects a changed trigger function body', async () => {
      await db.exec("CREATE OR REPLACE FUNCTION public.auto_dispatch_service_request_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN NEW; END $$;");
      const drift = await snapshot();
      await error(patch, 'P0001');
      assert.deepEqual(await snapshot(), drift);
    });
    await isolated('S04 Atomic preflight rejects a disabled live dispatch trigger', async () => {
      await db.exec('ALTER TABLE public.service_requests DISABLE TRIGGER trg_dispatch_v2_on_service_request;');
      await error(patch, 'P0001');
    });
    const originalData = await allData();
    await db.exec(patch);
    await isolated('S05 Exact postflight: only the expected five function ACLs and 52 table grants change', async () => {
      assert.deepEqual(await snapshot(), after);
      assert.deepEqual(await allData(), originalData);
    });
    await isolated('S06 Every worker/internal RPC rejects anon before execution (27 signatures)', async () => {
      await asRole('anon');
      for (const f of before.function_inventory.filter(f => !['get_my_dispatch_offers_v1()', 'accept_my_dispatch_offer_v1(uuid)'].includes(f.signature))) {
        const [name,args] = f.signature.slice(0,-1).split('(');
        await error(`SELECT public.${name}(${args ? args.split(',').map(type => 'NULL::'+type).join(',') : ''});`, '42501');
      }
    });
    await isolated('S07 Every worker/internal RPC rejects authenticated, including the backup (27 signatures)', async () => {
      await asRole('authenticated', ids.artisan);
      for (const f of before.function_inventory.filter(f => !['get_my_dispatch_offers_v1()', 'accept_my_dispatch_offer_v1(uuid)'].includes(f.signature))) {
        const [name,args] = f.signature.slice(0,-1).split('(');
        await error(`SELECT public.${name}(${args ? args.split(',').map(type => 'NULL::'+type).join(',') : ''});`, '42501');
      }
    });
    await isolated('S08 All service_role and postgres EXECUTE/table privileges remain exactly equal', async () => {
      const current = await snapshot();
      for (const role of ['service_role','postgres']) {
        for (const f of current.function_inventory) assert.equal(f.execute[role], before.function_inventory.find(b => b.signature===f.signature).execute[role]);
        assert.deepEqual(current.table_effective.filter(p => p.role===role), before.table_effective.filter(p => p.role===role));
      }
    });
    await isolated('S09 Existing service_request trigger fires from a real authenticated INSERT after EXECUTE/TRIGGER revoke', async () => {
      await asRole('authenticated', ids.client);
      await db.exec(request(100));
      await owner();
      assert.equal(await scalar(`SELECT count(*)::int FROM public.dispatch_execution_queue WHERE request_id='${uuid(100)}'`), 2);
    });
    await isolated('S10 Existing guest INSERT also fires V2 dispatch without an EXECUTE grant', async () => {
      await asRole('anon');
      await db.exec(request(101).replace(`'${ids.client}'`, 'NULL'));
      await owner();
      assert.equal(await scalar(`SELECT count(*)::int FROM public.dispatch_execution_queue WHERE request_id='${uuid(101)}'`), 2);
    });
    await isolated('S11 Canonical V1 service dispatch creates one mission and one outbox entry; repeated call is idempotent', async () => {
      await db.exec(request(102));
      await asRole('service_role');
      const a = await scalar(`SELECT public.dispatch_request_v1('${uuid(102)}')`);
      assert.equal(a.ok, true); assert.equal(a.reason, 'dispatched');
      const b = await scalar(`SELECT public.dispatch_request_v1('${uuid(102)}')`);
      assert.equal(b.reason, 'existing_offer'); assert.equal(b.mission_id, a.mission_id);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.missions WHERE request_id='${uuid(102)}'`), 1);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.dispatch_notification_outbox WHERE request_id='${uuid(102)}'`), 1);
    });
    await isolated('S12 Canonical V2 explicit service dispatch retains its candidate chain and idempotency', async () => {
      await db.exec(request(103));
      await asRole('service_role');
      const a = await rows(`SELECT * FROM public.dispatch_execute_v1('${uuid(103)}',3)`);
      assert.equal(a.length, 2);
      assert.deepEqual(await rows(`SELECT * FROM public.dispatch_execute_v1('${uuid(103)}',3)`), a);
    });
    await isolated('S13 Old backup remains usable by privileged service and still can write a mission (LOCAL ONLY)', async () => {
      await db.exec(request(104));
      await asRole('service_role');
      const a = await scalar(`SELECT public.dispatch_request_v1_backup_20260821('${uuid(104)}')`);
      assert.equal(a.ok, true); assert.ok(a.mission_id);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.missions WHERE request_id='${uuid(104)}'`), 1);
    });
    await isolated('S14 Service worker_peek retains its contact result and changes no data', async () => {
      await db.exec(request(105));
      await scalar(`SELECT public.dispatch_request_v1('${uuid(105)}')`);
      const data = await allData();
      await asRole('service_role');
      const a = await rows("SELECT * FROM public.dispatch_notification_worker_peek_v1('WHATSAPP')");
      assert.equal(a.length, 1); assert.equal(a[0].contact_phone, '+000000000001');
      await owner(); assert.deepEqual(await allData(), data);
    });
    await isolated('S15 Existing mission trigger fires from an authenticated column-granted INSERT', async () => {
      await db.exec(request(106));
      await asRole('authenticated', ids.artisan);
      await db.exec(`INSERT INTO public.missions(request_id,artisan_profile_id,status) VALUES ('${uuid(106)}','${ids.artisanRow}','offered');`);
      await owner();
      assert.equal(await scalar(`SELECT count(*)::int FROM public.dispatch_notification_outbox WHERE request_id='${uuid(106)}'`), 1);
    });
    await isolated('S16 Column-level mission INSERT and UPDATE(status) remain functional and bounded', async () => {
      await db.exec(request(107));
      await asRole('authenticated', ids.artisan);
      await db.exec(`INSERT INTO public.missions(request_id,artisan_profile_id,status) VALUES ('${uuid(107)}','${ids.artisanRow}','offered');`);
      assert.equal((await rows(`UPDATE public.missions SET status='declined' WHERE request_id='${uuid(107)}' RETURNING status`))[0].status,'declined');
      await error(`UPDATE public.missions SET agreed_price=1 WHERE request_id='${uuid(107)}';`, '42501');
    });
    await isolated('S17 get_my_dispatch_offers_v1 is still authenticated and filters by canonical artisan owner', async () => {
      await db.exec(request(108));
      await db.exec(`DELETE FROM public.dispatch_execution_queue WHERE artisan_id='${ids.otherArtisan}';`);
      await asRole('authenticated', ids.artisan);
      const a = await scalar('SELECT public.get_my_dispatch_offers_v1()');
      assert.equal(a.ok, true); assert.equal(a.offers.length, 1);
      assert.equal(a.offers[0].request_id, uuid(108));
      await asRole('authenticated', ids.other);
      const b = await scalar('SELECT public.get_my_dispatch_offers_v1()');
      assert.equal(b.offers.length, 0);
    });
    await isolated('S18 accept_my_dispatch_offer_v1 remains authenticated and performs the real winner transition', async () => {
      await db.exec(request(109));
      await asRole('authenticated', ids.artisan);
      const a = await scalar(`SELECT public.accept_my_dispatch_offer_v1('${uuid(109)}')`);
      assert.equal(a.ok,true); assert.equal(a.reason,'accepted');
      await owner();
      assert.equal(await scalar(`SELECT status FROM public.service_requests WHERE id='${uuid(109)}'`),'assigned');
      assert.equal(await scalar(`SELECT execution_status FROM public.dispatch_execution_queue WHERE request_id='${uuid(109)}' AND artisan_id='${ids.otherArtisan}'`),'CANCELLED');
      assert.equal(await scalar(`SELECT count(*)::int FROM public.missions WHERE request_id='${uuid(109)}' AND status='pending'`),1);
    });
    await isolated('S19 A second artisan cannot accept a cancelled opportunity', async () => {
      await db.exec(request(110));
      await asRole('authenticated', ids.artisan);
      assert.equal((await scalar(`SELECT public.accept_my_dispatch_offer_v1('${uuid(110)}')`)).ok,true);
      await asRole('authenticated', ids.other);
      assert.equal((await scalar(`SELECT public.accept_my_dispatch_offer_v1('${uuid(110)}')`)).ok,false);
    });
    await isolated('S20 anon cannot call the two retained authenticated RPCs', async () => {
      await asRole('anon');
      await error('SELECT public.get_my_dispatch_offers_v1();','42501');
      await error(`SELECT public.accept_my_dispatch_offer_v1('${uuid(111)}');`,'42501');
    });
    await isolated('S21 P0 canonical Admin authority, hardened profile role and users INSERT remain intact', async () => {
      await asRole('authenticated',ids.admin); assert.equal(await scalar('SELECT public.is_admin()'),true);
      await asRole('authenticated',ids.client); assert.equal(await scalar('SELECT public.is_admin()'),false);
      await asRole('authenticated',ids.artisan); assert.equal(await scalar('SELECT public.is_admin()'),false);
      await owner();
      await db.exec(`DELETE FROM public.profiles WHERE id='${ids.artisan}';`);
      await asRole('authenticated',ids.artisan);
      await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.artisan}','admin');`);
      assert.equal(await scalar(`SELECT role FROM public.profiles WHERE id='${ids.artisan}'`),'artisan');
      await error(`UPDATE public.users SET role='admin' WHERE id='${ids.artisan}';`, '42501');
      await owner(); await db.exec(`INSERT INTO auth.users(id) VALUES ('${uuid(5)}');`);
      await asRole('authenticated',uuid(5));
      await error(`INSERT INTO public.users(id,role) VALUES ('${uuid(5)}','admin');`, '42501');
      await db.exec(`INSERT INTO public.users(id,role) VALUES ('${uuid(5)}','client');`);
    });
    await isolated('S22 Protected deployed worker handler still calls peek with service_role (local fetch double)', async () => {
      await db.exec(request(112));
      await scalar(`SELECT public.dispatch_request_v1('${uuid(112)}')`);
      const source = fs.readFileSync(path.join(__dirname,'../../api/dispatch-whatsapp-worker-fn/index.js'),'utf8');
      let calls=0;
      const box = {module:{exports:{}},require:()=>({assertServerTarget(){}}),console:{error(){}},process:{env:{DISPATCH_WHATSAPP_WORKER_SECRET:'local-worker',SUPABASE_URL:'https://offline.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-service',WHATSAPP_PHONE_NUMBER_ID:'local-phone',WHATSAPP_ACCESS_TOKEN:'local-token'}},fetch:async(url,options)=>{
        calls++; assert.equal(url,'https://offline.invalid/rest/v1/rpc/dispatch_notification_worker_peek_v1');
        assert.equal(options.headers.Authorization,'Bearer local-service');
        assert.equal(options.headers.apikey,'local-service');
        await asRole('service_role');
        const data=await rows("SELECT * FROM public.dispatch_notification_worker_peek_v1('WHATSAPP')");
        return {ok:true,text:async()=>JSON.stringify(data)};
      }};
      vm.runInNewContext(source,box);
      const response=()=>({code:null,body:null,setHeader(){},status(n){this.code=n;return this;},json(o){this.body=o;return this;}});
      const denied=response(); await box.module.exports({method:'POST',headers:{}},denied);
      assert.equal(denied.code,401); assert.equal(calls,0);
      const allowed=response(); await box.module.exports({method:'POST',headers:{authorization:'Bearer local-worker'}},allowed);
      assert.equal(allowed.code,200); assert.equal(allowed.body.mode,'DRY_RUN'); assert.equal(calls,1);
    });
    await isolated('S23 All 52 excess table privileges are false; TRUNCATE is denied before touching data', async () => {
      const removed=before.table_effective.filter(p=>['anon','authenticated'].includes(p.role)&&['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'].includes(p.privilege)&&p.allowed);
      assert.equal(removed.length,52);
      const current=await snapshot();
      for(const p of removed) assert.equal(current.table_effective.find(a=>a.table===p.table&&a.role===p.role&&a.privilege===p.privilege).allowed,false);
      for(const role of ['anon','authenticated']) {await asRole(role,ids.artisan);await error('TRUNCATE public.notifications;','42501');}
    });
    await isolated('S24 Every CRUD grant and every column ACL is exactly preserved, including invitation token exclusion', async () => {
      const current=await snapshot();
      const crud=p=>['SELECT','INSERT','UPDATE','DELETE'].includes(p.privilege);
      assert.deepEqual(current.table_effective.filter(crud),before.table_effective.filter(crud));
      assert.deepEqual(current.column_acl,before.column_acl);
      assert.equal(await scalar("SELECT has_column_privilege('authenticated','public.enterprise_invitations','token_hash','SELECT')"),false);
      assert.equal(await scalar("SELECT has_column_privilege('authenticated','public.enterprise_invitations','email_normalized','SELECT')"),true);
    });
    await isolated('S25 Enterprise membership stays independent of global role; existing Enterprise RLS is retained', async () => {
      await db.exec(`INSERT INTO public.enterprise_accounts(id,name) VALUES ('${uuid(200)}','Synthetic Enterprise A'),('${uuid(201)}','Synthetic Enterprise B');
        INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status) VALUES ('${uuid(200)}','${ids.client}','owner','active');`);
      await asRole('authenticated',ids.client);
      assert.equal(await scalar('SELECT public.is_admin()'),false);
      assert.equal(await scalar(`SELECT fixeo_private._fixeo_is_enterprise_member('${uuid(200)}')`),true);
      assert.equal(await scalar(`SELECT fixeo_private._fixeo_is_enterprise_member('${uuid(201)}')`),false);
      assert.equal(await scalar('SELECT count(*)::int FROM public.enterprise_accounts'),1);
    });
    await isolated('S26 Existing notification frontend INSERT/UPDATE survives unchanged', async () => {
      await asRole('authenticated',ids.client);
      await db.exec(`INSERT INTO public.notifications(id,recipient_user_id,type) VALUES ('${uuid(300)}','${ids.client}','mission_assigned');`);
      assert.equal((await rows(`UPDATE public.notifications SET read=true WHERE id='${uuid(300)}' RETURNING read`))[0].read,true);
    });
    await isolated('S27 Rollback is blocked by default and restores no privilege', async () => {
      await error(rollback,'P0001'); assert.deepEqual(await snapshot(),after);
    });
    await isolated('S28 Explicit LOCAL rollback reference restores the exact ACL baseline without changing data', async () => {
      const data=await allData();
      await db.exec("SET LOCAL fixeo.s0_rollback_authorized='RESTORE_KNOWN_EXPOSURE';");
      await db.exec(rollback);
      assert.deepEqual(await snapshot(),before); assert.deepEqual(await allData(),data);
    });
    await isolated('S29 Reapplying the patch is stopped by its exact-baseline preflight', async () => {
      await error(patch,'P0001'); assert.deepEqual(await snapshot(),after);
    });
    await isolated('S30 The unused auto-dispatch function stays unattached; attached triggers and all function bodies are unchanged', async () => {
      const current=await snapshot();
      assert.deepEqual(current.triggers,before.triggers);
      assert.deepEqual(current.all_function_definitions,before.all_function_definitions);
      assert.equal(await scalar("SELECT count(*)::int FROM pg_trigger WHERE tgfoid='public.auto_dispatch_service_request_v1()'::regprocedure"),0);
      assert.equal(await scalar("SELECT md5(pg_get_functiondef('public.is_admin()'::regprocedure))"),'1986929dce09806c133d90b1bf480e1d');
    });
    await isolated('S31 Postflight sees no persistent test data and unchanged business constraints/RLS', async () => {
      assert.deepEqual(await allData(),originalData);
      assert.deepEqual(await snapshot(),after);
    });
  } finally {
    await db.exec('ROLLBACK;');
    assert.equal((await rows("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'"))[0].n,0);
    await db.close();
  }
});
