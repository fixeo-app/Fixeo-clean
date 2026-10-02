const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),v4=read('js/fixeo-artisan-profile-v4.js');
const forbidden=[
'fixeo-public-artisan-profile.js','fixeo-profile-v2a.js','fixeo-profile-premium-ui.js','fixeo-profile-provision.js',
'fixeo-artisan-identity.js','fixeo-profile-v1jb.js','fixeo-mission-mirror.js','fixeo-mission-rehydration.js',
'fixeo-portfolio-mirror.js','fixeo-claim-system.js','fixeo-seo-profile-blocks.js','fixeo-profile-v3.js','fixeo-profile-flagship-v1.js',
'artisan-profile-premium.css','artisan-profile-v2a.css','fixeo-profile-v1jb.css','fixeo-seo-profile-blocks.css','fixeo-profile-v3.css','fixeo-profile-flagship-v1.css'
];
test('B1 Clean Room: no legacy profile producer is loaded',()=>{for(const x of forbidden)assert.equal(html.includes(x),false,x)});
test('B1 Clean Room: V4 is the sole public profile renderer',()=>{assert.match(html,/id="public-artisan-root"/);assert.match(html,/fixeo-artisan-profile-v4\.js\?v=fxp4-b34/);assert.match(v4,/resolve_artisan_public_profile_v4/);assert.match(html,/data-fxp4-owner="boot"/)});
test('B1 Clean Room: legacy marketplace fast paths are absent',()=>{assert.doesNotMatch(html,/fixeo_admin_artisans_v21|fixeo_public_artisans_registry|artisan-index\.json|__fxHeroRendered|fixeo_profile_prefetch_/)});
test('B1 Clean Room: targeted reservation stack is rolled back to the last known-good presentation',()=>{for(const x of ['js/reservation.js?v=av1-targeted1','js/reservation-v2.js?v=v2c6f-b','js/cod-payment.js?v=fxresf-cod-v1','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-supabase-bridge.js?v=v2','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11a'])assert.ok(html.includes(x),x);assert.equal(html.includes('js/fixeo-reservation-v4.js'),false);assert.match(v4,/FixeoReservation\.open\(artisan\(p\),false\)/)});
test('B1 Clean Room: only one intervention CTA is produced by profile renderer',()=>{assert.equal((v4.match(/id="public-artisan-action"/g)||[]).length,1)});
