'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');

const migration = read('supabase/migrations/20260930123000_control_os_enterprise_provisioning.sql');
const ui = read('js/admin-enterprise-provisioning.js');
const html = read('admin.html');
const dossier = read('js/admin-fixeo-dossier.js');
const invitationUi = read('js/fixeo-enterprise-invitation.js');
const invitationHtml = read('enterprise-invitation.html');
const workspaceRouter = read('js/fixeo-workspace-router.js');
const provisionCss = read('css/admin-enterprise-provisioning.css');
const invitationLifecycle = read('supabase/7c15a7-enterprise-account-lifecycle.sql');
const api = require('../../js/admin-enterprise-provisioning.js');

test('Block 1 — authority is Admin-only and never mutates global role', () => {
  assert.match(migration,/fixeo_private\._fixeo_is_admin\(\)/);
  assert.match(migration,/admin_provision_enterprise_v1/);
  assert.doesNotMatch(migration,/UPDATE\s+public\.users\s+SET\s+role/i);
  assert.doesNotMatch(migration,/service_role\s*[:=]/i);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.admin_provision_enterprise_v1[^;]+FROM PUBLIC,anon;/);
});

test('Block 2 — founder owner invitation is representable but ordinary manager invitation still rejects owner', () => {
  assert.match(migration,/enterprise_invitations_role_chk[\s\S]+?'owner'::text/);
  const createStart=invitationLifecycle.indexOf('CREATE OR REPLACE FUNCTION public.create_enterprise_invitation');
  const acceptStart=invitationLifecycle.indexOf('CREATE OR REPLACE FUNCTION public.accept_enterprise_invitation');
  assert.ok(createStart>=0&&acceptStart>createStart);
  const createBody=invitationLifecycle.slice(createStart,acceptStart);
  const roleStart=createBody.indexOf('OR p_role NOT IN (');
  const roleEnd=createBody.indexOf(')',roleStart);
  assert.ok(roleStart>=0&&roleEnd>roleStart);
  const roleAllowlist=createBody.slice(roleStart,roleEnd+1);
  for(const role of ['admin','operations_manager','site_manager','reporter','viewer']) assert.match(roleAllowlist,new RegExp("'"+role+"'"));
  assert.doesNotMatch(roleAllowlist,/'owner'/);
});

test('Block 2 — raw founder token is returned once but never stored in provisioning ledger', () => {
  assert.match(migration,/enterprise_provision_commands_v1/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/idempotency_conflict/);
  const storedStart=migration.indexOf('v_stored := pg_catalog.jsonb_build_object');
  const ledgerInsert=migration.indexOf('INSERT INTO fixeo_private.enterprise_provision_commands_v1',storedStart);
  assert.ok(storedStart>0&&ledgerInsert>storedStart);
  const storedBlock=migration.slice(storedStart,ledgerInsert);
  assert.doesNotMatch(storedBlock,/'invitation_token'\s*,/);
  assert.match(storedBlock,/token_available/);
});

test('Block 3/4 — Control OS exposes provisioning and Enterprise dossier owner management', () => {
  assert.match(html,/id="enterprise-provision-open"/);
  assert.match(html,/id="enterprise-provision-dialog"/);
  assert.match(html,/admin-enterprise-provisioning\.css\?v=ep1/);
  assert.match(html,/admin-enterprise-provisioning\.js\?v=ep1/);
  assert.match(dossier,/data-enterprise-provision-manage/);
});

test('Block 3 — browser module uses secured RPCs only', () => {
  for(const name of [
    'admin_find_enterprise_owner_v1',
    'admin_provision_enterprise_v1',
    'admin_get_enterprise_owner_state_v1',
    'admin_assign_founder_owner_v1',
    'admin_rotate_founder_invitation_v1',
    'admin_revoke_founder_invitation_v1'
  ]) assert.match(ui,new RegExp(name));
  assert.doesNotMatch(ui,/\.from\s*\(/);
  assert.doesNotMatch(ui,/\.insert\s*\(/);
  assert.doesNotMatch(ui,/\.update\s*\(/);
  assert.doesNotMatch(ui,/\.delete\s*\(/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE|service_role/i);
});

test('Block 5 — UI validation requires exact IDs and phone-first founder identity', () => {
  assert.equal(api._test.validId('11111111-1111-4111-8111-111111111111'),true);
  assert.equal(api._test.validId('bad'),false);
  assert.equal(api._test.normalizePhone('06 12 34 56 78'),'+212612345678');
  assert.equal(api._test.normalizePhone('+212612345678'),'+212612345678');
  assert.equal(api._test.normalizePhone('0512345678'),null);
  assert.equal(api._test.syntheticEmailFromPhone('0612345678'),'212612345678@fixeo.ma');
  assert.equal(api._test.invitationLink('a'.repeat(64)),'https://www.fixeo.ma/enterprise-invitation.html?token='+'a'.repeat(64));
  assert.match(invitationUi,/numéro WhatsApp correspondant à cette invitation/);
  assert.doesNotMatch(invitationUi,/Connectez-vous avec l’adresse email qui a reçu cette invitation/);
});

test('Block 5 — provisioning SQL includes owner-state guards, audit and secure token rotation/revocation', () => {
  assert.match(migration,/founding_owner_already_set/);
  assert.match(migration,/'account\.created'/);
  assert.match(migration,/'member\.invited'/);
  assert.match(migration,/'member\.invitation_revoked'/);
  assert.match(migration,/admin_rotate_founder_invitation_v1/);
  assert.match(migration,/admin_revoke_founder_invitation_v1/);
  assert.match(migration,/extensions\.gen_random_bytes\(32\)/);
  assert.match(migration,/extensions\.digest/);
});

async function withDb(t,fn){
  const url=process.env.ENTERPRISE_PROVISION_TEST_DATABASE_URL;
  if(!url){t.skip('ENTERPRISE_PROVISION_TEST_DATABASE_URL absent');return;}
  const {Client}=require('pg');
  const client=new Client({connectionString:url});
  await client.connect();
  try{await fn(client);}finally{await client.end();}
}

async function setUser(client,id){
  await client.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
}

test('Block 6 — PostgreSQL integration: exact search, idempotent active-owner provisioning, secure invitation lifecycle', async t => {
  await withDb(t, async client => {
    const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const nonAdmin='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const fixture = String.raw`
      DROP SCHEMA IF EXISTS fixeo_private CASCADE;
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS extensions CASCADE;
      DROP TABLE IF EXISTS public.enterprise_audit_events CASCADE;
      DROP TABLE IF EXISTS public.enterprise_invitations CASCADE;
      DROP TABLE IF EXISTS public.enterprise_members CASCADE;
      DROP TABLE IF EXISTS public.enterprise_accounts CASCADE;
      DROP TABLE IF EXISTS public.users CASCADE;

      CREATE SCHEMA auth;
      CREATE SCHEMA fixeo_private;
      CREATE SCHEMA extensions;
      DO $role$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
      DO $role$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
      DO $role$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

      CREATE TABLE public.users(
        id uuid PRIMARY KEY,
        role text NOT NULL,
        email text,
        full_name text NOT NULL DEFAULT '',
        phone text,
        city text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.enterprise_accounts(
        id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
        name text NOT NULL CHECK(char_length(name) between 1 and 200),
        legal_name text CHECK(legal_name is null or char_length(legal_name) between 1 and 300),
        status text NOT NULL DEFAULT 'active' CHECK(status in ('active','suspended','closed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        data_classification text DEFAULT 'production' CHECK(data_classification in ('production','test','internal'))
      );
      CREATE TABLE public.enterprise_members(
        id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
        enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK(role in ('owner','admin','operations_manager','site_manager','reporter','viewer')),
        status text NOT NULL DEFAULT 'active' CHECK(status in ('invited','active','suspended','removed')),
        invited_by uuid REFERENCES public.users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT enterprise_members_unique_membership UNIQUE(enterprise_id,user_id)
      );
      CREATE TABLE public.enterprise_invitations(
        id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
        enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,
        email_normalized text NOT NULL,
        role text NOT NULL,
        invited_by uuid NOT NULL REFERENCES public.users(id),
        target_user_id uuid REFERENCES public.users(id),
        token_hash text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'pending' CHECK(status in ('pending','accepted','revoked','expired')),
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        accepted_by uuid REFERENCES public.users(id),
        revoked_at timestamptz,
        revoked_by uuid REFERENCES public.users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT enterprise_invitations_role_chk CHECK(role in ('admin','operations_manager','site_manager','reporter','viewer')),
        CONSTRAINT enterprise_invitations_email_chk CHECK(email_normalized=lower(btrim(email_normalized)) and char_length(email_normalized) between 3 and 320 and strpos(email_normalized,'@')>1),
        CONSTRAINT enterprise_invitations_expiry_chk CHECK(expires_at>created_at)
      );
      CREATE UNIQUE INDEX enterprise_invitations_one_pending_email_uq ON public.enterprise_invitations(enterprise_id,email_normalized) WHERE status='pending';

      CREATE TABLE public.enterprise_audit_events(
        id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
        enterprise_id uuid NOT NULL REFERENCES public.enterprise_accounts(id),
        actor_user_id uuid NOT NULL REFERENCES public.users(id),
        event_type text NOT NULL,
        target_type text NOT NULL,
        target_id uuid,
        before_state jsonb,
        after_state jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
        SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role='admin')
      $$;
      CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
        SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role='admin')
      $$;
      CREATE OR REPLACE FUNCTION fixeo_private._write_enterprise_audit_event(
        p_enterprise_id uuid,p_event_type text,p_target_type text,p_target_id uuid,
        p_before_state jsonb DEFAULT NULL,p_after_state jsonb DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb
      ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
      DECLARE x uuid;
      BEGIN
        INSERT INTO public.enterprise_audit_events(enterprise_id,actor_user_id,event_type,target_type,target_id,before_state,after_state,metadata)
        VALUES(p_enterprise_id,auth.uid(),p_event_type,p_target_type,p_target_id,p_before_state,p_after_state,coalesce(p_metadata,'{}'::jsonb))
        RETURNING id INTO x;
        RETURN x;
      END $$;

      INSERT INTO public.users(id,role,email,full_name,phone) VALUES
      ('${admin}','admin','admin@fixeo.test','Admin FIXEO','0600000001'),
      ('${owner}','client','owner@atlas.test','Owner Atlas','0663123456'),
      ('${nonAdmin}','client','client@fixeo.test','Client','0611111111');
    `;

    await client.query(fixture);
    await client.query(migration);

    await setUser(client,admin);
    const search=await client.query("select * from public.admin_find_enterprise_owner_v1($1)",['06 63 12 34 56']);
    assert.equal(search.rowCount,1);
    assert.equal(search.rows[0].user_id,owner);

    const key='11111111-1111-4111-8111-111111111111';
    const p1=await client.query(
      "select public.admin_provision_enterprise_v1($1,$2,$3,$4,$5,$6) as x",
      ['Atlas Facilities','Atlas Facilities SARL',owner,null,key,null]
    );
    const first=p1.rows[0].x;
    assert.equal(first.ok,true);
    assert.equal(first.owner_state,'active');
    assert.equal(first.owner_user_id,owner);

    const replay=(await client.query(
      "select public.admin_provision_enterprise_v1($1,$2,$3,$4,$5,$6) as x",
      ['Atlas Facilities','Atlas Facilities SARL',owner,null,key,null]
    )).rows[0].x;
    assert.equal(replay.ok,true);
    assert.equal(replay.enterprise_id,first.enterprise_id);
    assert.equal(replay.replayed,true);
    assert.equal((await client.query("select count(*)::int n from public.enterprise_accounts")).rows[0].n,1);
    const membership=(await client.query("select user_id,role,status from public.enterprise_members where enterprise_id=$1",[first.enterprise_id])).rows;
    assert.deepEqual(membership,[{user_id:owner,role:'owner',status:'active'}]);
    assert.equal(membership.some(x=>x.user_id===admin),false);

    const conflict=(await client.query(
      "select public.admin_provision_enterprise_v1($1,$2,$3,$4,$5,$6) as x",
      ['Different Name',null,owner,null,key,null]
    )).rows[0].x;
    assert.equal(conflict.reason,'idempotency_conflict');

    const inviteKey='22222222-2222-4222-8222-222222222222';
    const p2=(await client.query(
      "select public.admin_provision_enterprise_v1($1,$2,$3,$4,$5,$6) as x",
      ['Nova Hotels',null,null,'212612345678@fixeo.ma',inviteKey,null]
    )).rows[0].x;
    assert.equal(p2.ok,true);
    assert.equal(p2.owner_state,'invitation_pending');
    assert.match(p2.invitation_token,/^[0-9a-f]{64}$/);

    const inv=(await client.query("select token_hash,status,role,email_normalized from public.enterprise_invitations where id=$1",[p2.invitation_id])).rows[0];
    assert.equal(inv.status,'pending');
    assert.equal(inv.role,'owner');
    assert.equal(inv.email_normalized,'212612345678@fixeo.ma');
    assert.notEqual(inv.token_hash,p2.invitation_token);

    const pendingState=(await client.query(
      "select public.admin_get_enterprise_owner_state_v1($1) as x",
      [p2.enterprise_id]
    )).rows[0].x;
    assert.equal(pendingState.ok,true);
    assert.equal(pendingState.owner_state,'invitation_pending');
    assert.equal(pendingState.invitation_id,p2.invitation_id);
    assert.equal(pendingState.owner_phone,'+212612345678');
    assert.equal(pendingState.owner_email,null);
    const ledger=(await client.query("select result::text result from fixeo_private.enterprise_provision_commands_v1 where idempotency_key=$1",[inviteKey])).rows[0].result;
    assert.equal(ledger.includes(p2.invitation_token),false);

    const rotated=(await client.query(
      "select public.admin_rotate_founder_invitation_v1($1,$2,$3) as x",
      [p2.enterprise_id,p2.invitation_id,null]
    )).rows[0].x;
    assert.equal(rotated.ok,true);
    assert.match(rotated.invitation_token,/^[0-9a-f]{64}$/);
    assert.notEqual(rotated.invitation_token,p2.invitation_token);

    const revoked=(await client.query(
      "select public.admin_revoke_founder_invitation_v1($1,$2) as x",
      [p2.enterprise_id,p2.invitation_id]
    )).rows[0].x;
    assert.equal(revoked.ok,true);
    assert.equal(revoked.owner_state,'missing');

    const assigned=(await client.query(
      "select public.admin_assign_founder_owner_v1($1,$2,$3,$4) as x",
      [p2.enterprise_id,nonAdmin,null,null]
    )).rows[0].x;
    assert.equal(assigned.ok,true);
    assert.equal(assigned.owner_state,'active');
    assert.equal(assigned.owner_user_id,nonAdmin);

    const ownerState=(await client.query(
      "select public.admin_get_enterprise_owner_state_v1($1) as x",
      [p2.enterprise_id]
    )).rows[0].x;
    assert.equal(ownerState.ok,true);
    assert.equal(ownerState.owner_state,'active');
    assert.equal(ownerState.owner_user_id,nonAdmin);

    await setUser(client,nonAdmin);
    const denied=(await client.query(
      "select public.admin_provision_enterprise_v1($1,$2,$3,$4,$5,$6) as x",
      ['Forbidden Co',null,owner,null,'33333333-3333-4333-8333-333333333333',null]
    )).rows[0].x;
    assert.equal(denied.reason,'forbidden');
    await assert.rejects(
      client.query("select * from public.admin_find_enterprise_owner_v1($1)",['owner@atlas.test']),
      /FORBIDDEN/
    );
  });
});


test('Block 3 — provisioning wizard renders the phone-first three-step flow in DOM', async () => {
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM('<!doctype html><button id="enterprise-provision-open">open</button><dialog id="enterprise-provision-dialog"><div id="enterprise-provision-body"></div><div id="enterprise-provision-state"></div></dialog>',{
    url:'https://www.fixeo.ma/admin.html?view=network',
    runScripts:'outside-only'
  });
  const w=dom.window;
  Object.defineProperty(w.crypto,'randomUUID',{configurable:true,value:()=> '44444444-4444-4444-8444-444444444444'});
  w.eval(ui);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  w.FixeoEnterpriseProvisioning.openCreate();
  assert.equal(w.document.getElementById('enterprise-provision-dialog').hasAttribute('open'),true);
  assert.ok(w.document.getElementById('ep-company-form'));

  const company=w.document.getElementById('ep-company-form');
  company.elements.name.value='Atlas Facilities';
  company.elements.legal_name.value='Atlas Facilities SARL';
  company.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.match(w.document.getElementById('enterprise-provision-body').textContent,/Choisir le propriétaire/);

  w.document.querySelector('[data-ep-mode="invite"]').click();
  const phoneForm=w.document.getElementById('ep-owner-phone');
  assert.ok(phoneForm);
  phoneForm.elements.phone.value='06 12 34 56 78';
  w.document.querySelector('[data-ep-next-owner]').click();
  assert.match(w.document.getElementById('enterprise-provision-body').textContent,/Confirmer le provisioning/);
  assert.match(w.document.getElementById('enterprise-provision-body').textContent,/\+212612345678/);

  const submit=w.document.querySelector('[data-ep-submit]');
  assert.equal(submit.disabled,true);
  const confirm=w.document.getElementById('ep-confirm-check');
  confirm.checked=true;
  confirm.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(submit.disabled,false);
  dom.window.close();
});


test('Invitation handoff preserves the pending invite through authentication', () => {
  assert.match(invitationHtml,/id="fxei-signup"/);
  assert.match(invitationHtml,/Créer mon compte FIXEO/);
  assert.match(invitationUi,/fixeo_enterprise_invitation_return/);
  assert.match(invitationUi,/Changer de compte/);
  assert.match(workspaceRouter,/fixeo_enterprise_invitation_return/);
  assert.match(workspaceRouter,/ENTERPRISE_INVITATION_PENDING/);
  assert.match(provisionCss,/button:disabled/);
});
