const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const profile=read('artisan-profile.html'),artisans=read('artisans.html'),engine=read('js/reservation.js'),resFlag=read('js/fixeo-reservation-flagship-v1.js'),dir=read('js/fixeo-artisan-directory-v1.js'),dirCss=read('css/fixeo-artisan-directory-v1.css'),local=read('js/fixeo-local-flagship-v1.js'),localCss=read('css/fixeo-local-flagship-v1.css');

test('Block 1: targeted reservation shell self-mounts regardless of source page',()=>{assert.match(engine,/function _ensureTargetedShellAssets/);assert.match(engine,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v3/);assert.match(engine,/fixeo-targeted-shell-bootstrap-v1/);assert.match(engine,/if \(state\.isTargeted\) \{\s*_ensureTargetedShellAssets\(\)/);});

test('Block 1: artisan directory loads the same targeted reservation stack as public profile',()=>{for(const x of ['js/reservation.js?v=av1-card1','js/reservation-v2.js?v=v2c6f-c','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11c','js/fixeo-reservation-supabase-bridge.js?v=v2','css/fixeo-reservation-targeted-polish-v1.css?v=fxrt-v3'])assert.ok(artisans.includes(x),x);assert.match(profile,/js\/reservation\.js\?v=av1-card1/);assert.match(profile,/fixeo-reservation-flagship-v1\.js\?v=fxresf-v11c/);});

test('Block 1: card and profile entries converge on the canonical reservation API',()=>{assert.match(dir,/FixeoReservation\.open\(selected, false\)/);assert.match(local,/FixeoReservation\.open\(artisanObj, false\)/);assert.match(read('js/fixeo-artisan-profile-v4.js'),/FixeoReservation\.open\(artisan\(p\),false\)/);});

test('Block 2: close control is captured before presentation enhancers',()=>{const i=engine.indexOf('Priority -1 — canonical close control');const block=engine.slice(i,i+1200);assert.ok(i>=0);assert.match(block,/closest\('\.fixeo-res-close'\)/);assert.match(block,/stopImmediatePropagation/);assert.match(block,/close\(\)/);});

test('Block 2: close teardown clears target shell and accessibility state',()=>{assert.match(engine,/classList\.remove\('fixeo-targeted-booking-open'\)/);assert.match(engine,/modal\.setAttribute\('aria-hidden', 'true'\)/);assert.match(engine,/_activeModal\.setAttribute\('aria-hidden', 'false'\)/);});

test('Block 3: directory avatar contract is real photo then FIXEO ID only',()=>{const a=dir.indexOf('function _buildAvatar(a, cat)'),b=dir.indexOf('/* ── Card builder',a),block=dir.slice(a,b);assert.ok(a>=0&&b>a);assert.match(block,/photoSrc/);assert.match(block,/_fixeoIdHtml/);assert.doesNotMatch(block,/FixeoHeroes|getCardAvatar|metier-webp|metier-png|artdir-avatar-silhouette/);});

test('Block 3: local runtime avatar contract is real photo then FIXEO ID only',()=>{const a=local.indexOf('function _buildAvatarHtml'),b=local.indexOf('/* ── Trust rows',a),block=local.slice(a,b);assert.ok(a>=0&&b>a);assert.match(block,/_fixeoIdHtml/);assert.match(block,/real-photo/);assert.doesNotMatch(block,/FixeoHeroes|getCardAvatar|illustrative-metier|pvc-avatar-silhouette/);});

test('Block 3: passport cards remove métier avatar badges and use canonical UUID when available',()=>{const a=dir.indexOf('function _buildCard(a)'),b=dir.indexOf('AVATAR STAGED FALLBACK',a),block=dir.slice(a,b);assert.match(block,/a\._supabase_id \|\| a\.id/);assert.match(block,/artdir-card--passport/);assert.match(block,/PROFIL PROFESSIONNEL FIXEO/);assert.doesNotMatch(block,/artdir-avatar-badge/);assert.match(dirCss,/ARTISAN CARD PASSPORT V2/);assert.match(dirCss,/\.artdir-fixeo-id/);});

test('Block 3: targeted modal presentation reuses exact artisan object from card entry',()=>{assert.match(engine,/_fixeoCurrentReservationArtisan = state\.artisan/);assert.match(resFlag,/window\._fixeoCurrentReservationArtisan/);assert.match(resFlag,/tr\.photo_url \|\| tr\.photo \|\| tr\.avatar/);});

test('Block 4: directory pricing surface never exposes a legacy starting price',()=>{const a=dir.indexOf('function _buildPricing'),b=dir.indexOf('/* ── Description sanitizer',a),block=dir.slice(a,b);assert.match(block,/Tarif confirmé avant intervention/);assert.match(block,/Paiement après intervention/);assert.doesNotMatch(block,/À partir de|price_from|priceFrom|Tarif renseigné/);});

test('Block 4: card CTA language matches targeted booking product',()=>{const da=dir.indexOf('function _buildCard(a)'),db=dir.indexOf('AVATAR STAGED FALLBACK',da),dblock=dir.slice(da,db);const la=local.indexOf('function _buildCard(artisan, ctx)'),lb=local.indexOf('/* ── Empty state',la),lblock=local.slice(la,lb);assert.match(dblock,/Demander une intervention/);assert.match(lblock,/Demander une intervention/);assert.match(lblock,/Tarif à confirmer/);assert.match(local,/availability:'confirmation_required'/);});

test('Block 4: public card copy suppresses internal sourcing notes',()=>{assert.match(dir,/sourc\[ée\].*facebook/);assert.match(local,/sourc\[ée\].*facebook/);});

test('Block 4: passport visual system is mounted for both directory and local runtime',()=>{assert.match(dirCss,/artdir-btn-reserve--passport/);assert.match(localCss,/ARTISAN CARD PASSPORT V2 — local runtime adapter/);assert.match(localCss,/\.pvc-fixeo-id/);});

test('final card rollout uses current profile document version and keeps Reservation V4 dormant',()=>{assert.match(profile,/PROFILE_PAGE_VERSION='20261002cards1'/);assert.match(dir,/20261002cards1/);assert.doesNotMatch(profile,/fixeo-reservation-v4\.(?:js|css)/);});
