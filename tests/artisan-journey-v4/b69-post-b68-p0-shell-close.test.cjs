const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function blobSha(p){
  const b=fs.readFileSync(path.join(root,p));
  return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
}
function between(src,a,b){
  const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
  return i>=0&&j>i?src.slice(i,j):'';
}

const engine=read('js/reservation.js');
const shell=read('css/fixeo-reservation-targeted-polish-v1.css');
const headerJs=read('js/fixeo-header-global.js');
const headerCss=read('css/fixeo-header-global.css');
const artisans=read('artisans.html');
const profile=read('artisan-profile.html');
const dir=read('js/fixeo-artisan-directory-v1.js');
const local=read('js/fixeo-local-flagship-v1.js');

test('Homepage official surface remains byte-frozen for this execution',()=>{
  const protectedBlobs={
    'index.html':'74b71bc778407e2615e45924cf536535f939ef29',
    'js/fixeo_homepage_premium_patch.js':'23493081617d753b665c8ababb9dbb73cfb9165a',
    'css/fixeo-homepage-passport-v2.css':'664d3ea86b280174ae99b1872b7467656002f564',
    'css/artisan-card-conversion-v1.css':'0de1771d092aa31aee2a1eade675bab9bf8e5d41',
    'js/main.js':'ed9086b710c636124984cd9f277d83f1e55acfa9'
  };
  for(const [p,sha] of Object.entries(protectedBlobs)) assert.equal(blobSha(p),sha,p);
});

test('P0-A targeted shell neutralizes the universal header owner, not only its mobile bar',()=>{
  for(const selector of [
    '.fixeo-gh-shell',
    '.fixeo-gh-universal-shell',
    '.fixeo-gh-source-shell',
    '.fixeo-gh-mobile',
    '#fixeo-gh-menu-portal'
  ]){
    assert.ok(engine.includes('body.fixeo-targeted-booking-open '+selector),selector+' bootstrap');
    assert.ok(shell.includes('body.fixeo-targeted-booking-open '+selector),selector+' stylesheet');
  }
  assert.match(headerJs,/fixeo-gh-shell--synthetic/);
  assert.match(headerJs,/fixeo-gh-universal-shell/);
  assert.match(headerJs,/fixeo-gh-menu-portal/);
});

test('P0-A targeted modal remains fixed above the global header stack',()=>{
  assert.match(engine,/position:fixed!important;inset:0!important;[\s\S]*?z-index:12000!important/);
  assert.match(shell,/body\.fixeo-targeted-booking-open #fixeo-reservation-modal\{[\s\S]*?z-index:12000!important/);
  assert.match(headerCss,/z-index:\s*1200/);
});

test('P0-B close has exactly one capture owner and supports non-Element iOS targets',()=>{
  const owner=between(engine,'/* P0 close owner: dedicated capture listener.','/* ── 7C.9L.3I: Delegated city-chip click handler');
  assert.ok(owner);
  assert.match(owner,/nodeType === 1/);
  assert.match(owner,/parentElement/);
  assert.match(owner,/origin\.closest\('\.fixeo-res-close'\)/);
  assert.match(owner,/modal\.contains\(btn\)/);
  assert.match(owner,/stopImmediatePropagation/);
  assert.match(owner,/close\(\)/);
  assert.match(owner,/\}, true\);/);
  assert.equal((engine.match(/closest\('\.fixeo-res-close'\)/g)||[]).length,1);
  assert.doesNotMatch(engine,/Priority -1 — canonical close control/);
});

test('P0-B teardown restores source page state and can be reopened cleanly',()=>{
  const dismiss=between(engine,'function _dismissReservationLayer() {','function close() {');
  const closeBlock=between(engine,'function close() {','/* ════════════════════════════════════════════════════════\n     PUBLIC API');
  assert.match(dismiss,/classList\.remove\('fixeo-booking-modal-open'\)/);
  assert.match(dismiss,/classList\.remove\('fixeo-targeted-booking-open'\)/);
  assert.match(dismiss,/modal\.classList\.remove\('open'\)/);
  assert.match(dismiss,/modal\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(dismiss,/removeBackdrop\(\)/);
  assert.match(dismiss,/document\.body\.style\.overflow = ''/);
  assert.match(closeBlock,/state\.artisan = null/);
  assert.match(closeBlock,/state\.isTargeted = false/);
  assert.match(closeBlock,/window\._fixeoCurrentReservationArtisan = null/);
  assert.match(engine,/document\.body\.classList\.add\('fixeo-targeted-booking-open'\)/);
  assert.match(engine,/_activeModal\.setAttribute\('aria-hidden', 'false'\)/);
});

test('Directory and profile pin the same P0 engine and targeted shell revision',()=>{
  for(const html of [artisans,profile]){
    assert.match(html,/js\/reservation\.js\?v=av1-card3/);
    assert.match(html,/css\/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v5/);
  }
  assert.match(engine,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v5/);
});

test('Post-B68 directory card truth and canonical booking contract remain intact',()=>{
  const avatar=between(dir,'function _buildAvatar(a, cat)','/* ── Card builder');
  assert.match(avatar,/photoSrc/);
  assert.match(avatar,/_fixeoIdHtml/);
  assert.doesNotMatch(avatar,/FixeoHeroes|getCardAvatar|metier-webp|metier-png|artdir-avatar-silhouette/);
  assert.match(dir,/Tarif confirmé avant intervention/);
  assert.match(dir,/Disponibilité à confirmer/);
  assert.match(dir,/Demander une intervention/);
  assert.match(dir,/Voir le profil complet/);
  assert.match(dir,/FixeoReservation\.open\(selected, false\)/);
});

test('Post-B68 local runtime keeps the same identity and booking continuity',()=>{
  const avatar=between(local,'function _buildAvatarHtml','/* ── Trust rows');
  assert.match(avatar,/_fixeoIdHtml/);
  assert.match(avatar,/real-photo/);
  assert.doesNotMatch(avatar,/FixeoHeroes|getCardAvatar|illustrative-metier|pvc-avatar-silhouette/);
  assert.match(local,/Demander une intervention/);
  assert.match(local,/availability:'confirmation_required'/);
  assert.match(local,/FixeoReservation\.open\(artisanObj, false\)/);
});

test('Targeted close control stays tappable above presentation enhancers',()=>{
  assert.match(shell,/\.fixeo-res-close\{[\s\S]*?z-index:140!important/);
  assert.match(shell,/\.fixeo-res-close\{[\s\S]*?pointer-events:auto!important/);
  assert.match(shell,/\.fixeo-res-close\{[\s\S]*?touch-action:manipulation!important/);
});
