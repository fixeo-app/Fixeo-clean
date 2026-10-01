import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(import.meta.dirname,'..');

function read(relative:string){
  return fs.readFileSync(path.join(root,relative),'utf8');
}

test('mobile bundle never embeds privileged backend secrets or Production Supabase',()=>{
  const files=[
    'lib/supabase.ts','lib/rafiGateway.ts','lib/magicLoop.ts','lib/push.ts',
    'app/index.tsx','app/artisan.tsx','app/sign-in.tsx','app/_layout.tsx'
  ];
  const source=files.map(read).join('\n');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(!source.includes('OPENAI_API_KEY'));
  assert.ok(!source.includes('ztwtbgoqanqzvwiibtuh'));
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(source));
});

test('Gate A/B Supabase client is hard-locked to staging and publishable key',()=>{
  const source=read('lib/supabase.ts');
  assert.match(source,/GATE_AB_STAGING_REF = 'kqyhusnbybsukbcaoqtu'/);
  assert.match(source,/sb_publishable_/);
  assert.match(source,/staging-only/);
});

test('Magic Loop uses canonical Dispatch V2 authority',()=>{
  const source=read('lib/magicLoop.ts');
  assert.match(source,/get_my_dispatch_offers_v1/);
  assert.match(source,/accept_my_dispatch_offer_v1/);
  assert.match(source,/mobile-magic-loop-push/);
});
