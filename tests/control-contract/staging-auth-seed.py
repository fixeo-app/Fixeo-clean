"""Prepare synthetic staging identities; never output passwords or hashes.

Only the SQL seed is submitted through the authorized staging database channel.
Supabase Auth/Storage platform definitions remain untouched. Password login,
JWT creation and refresh are subsequently exercised through real Auth HTTP.
"""
import crypt
import json
import os
import pathlib
import secrets
import sys

ref, destination = sys.argv[1:3]
append = sys.argv[3:] == ['--append-synthetic']
if ref != 'kqyhusnbybsukbcaoqtu':
    raise RuntimeError('APPROVED_STAGING_REQUIRED')
folder = pathlib.Path(destination)
folder.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(folder, 0o700)
credential_file = folder / 'identities.json'
if credential_file.exists() and not append:
    raise RuntimeError('IDENTITIES_ALREADY_PREPARED_DO_NOT_ROTATE')
names = [
    ('client', 'client'), ('artisan', 'artisan'), ('admin', 'admin'),
    ('client_other', 'client'), ('enterprise_owner', 'client'),
    ('enterprise_operations', 'client'), ('enterprise_viewer', 'client'),
    ('enterprise_b_owner', 'client'), ('enterprise_b_operations', 'client'),
    ('enterprise_b_viewer', 'client'), ('workforce', 'client'),
    ('artisan_other', 'artisan'), ('admin_other', 'admin'),
    ('enterprise_site_manager', 'client'),
    ('claimant_a', 'client'), ('claimant_b', 'client'),
]
def literal(value):
    return "'" + value.replace("'", "''") + "'"
identities = json.loads(credential_file.read_text())['identities'] if append else {}
prepared = 0
sql = ["BEGIN; DO $gate$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE raw_app_meta_data->>'fixture_suite' IS DISTINCT FROM 'control-b1') THEN RAISE EXCEPTION 'NON_SYNTHETIC_AUTH_PRESENT'; END IF; END $gate$;"]
for n, (name, role) in enumerate(names, 1):
    uid = f'10000000-0000-4000-8000-{n:012d}'
    if name in identities:
        assert identities[name]['id'] == uid and identities[name]['role'] == role
        continue
    email = name.replace('_', '.') + '.synthetic@fixeo-staging.invalid'
    password = 'T9!' + secrets.token_urlsafe(30)
    encrypted = crypt.crypt(password, crypt.mksalt(crypt.METHOD_BLOWFISH))
    metadata = json.dumps({'role': 'artisan' if role == 'artisan' else 'client', 'full_name': name.upper() + '_SYNTHETIC', 'city': 'Fès'})
    app_metadata = json.dumps({'provider': 'email', 'providers': ['email'], 'fixture_suite': 'control-b1'})
    sql.append("INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) VALUES(" +
               "'00000000-0000-0000-0000-000000000000'," + literal(uid) + ",'authenticated','authenticated'," + literal(email) + ',' + literal(encrypted) + ",now(),'','','',''," + literal(app_metadata) + '::jsonb,' + literal(metadata) + '::jsonb,now(),now(),false,false);')
    identity = json.dumps({'sub': uid, 'email': email, 'email_verified': True})
    sql.append("INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES(" + literal(uid) + ',' + literal(uid) + ',' + literal(identity) + "::jsonb,'email',now(),now());")
    sql.append("UPDATE public.users SET role=" + literal(role) + ' WHERE id=' + literal(uid) + ';')
    sql.append("UPDATE public.profiles SET role=" + literal(role) + ' WHERE id=' + literal(uid) + ';')
    identities[name] = {'id': uid, 'email': email, 'password': password, 'role': role}
    prepared += 1
sql.append('COMMIT;')
for file, content in [(credential_file, json.dumps({'project_ref': ref, 'identities': identities})), (folder / 'seed-auth.sql', '\n'.join(sql))]:
    descriptor = os.open(file, os.O_WRONLY | os.O_CREAT | (os.O_TRUNC if append else os.O_EXCL), 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(content)
print(json.dumps({'project_ref': ref, 'synthetic_accounts_prepared': prepared, 'total': len(identities), 'credentials_displayed': False}))
