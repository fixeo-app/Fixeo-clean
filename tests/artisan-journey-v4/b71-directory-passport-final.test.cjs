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
  const i=src.indexOf(a), j=src.indexOf(b,i+a.length);
  return i>=0&&j>i?src.slice(i,j):'';
}

const html=read('artisans.html');
const js=read('js/fixeo-artisan-directory-v1.js');
const css=read('css/fixeo-artisan-directory-v1.css');
const card=between(js,'function _buildCard(a) {','/* ══════════════════════════════════════════════════════════════\n     AVATAR STAGED FALLBACK');

test('Homepage, public profile and shared reservation engine stay byte-frozen',()=>{
  const frozen={
    'index.html':'74b71bc778407e2615e45924cf536535f939ef29',
    'js/fixeo_homepage_premium_patch.js':'23493081617d753b665c8ababb9dbb73cfb9165a',
    'css/fixeo-homepage-passport-v2.css':'664d3ea86b280174ae99b1872b7467656002f564',
    'js/main.js':'ed9086b710c636124984cd9f277d83f1e55acfa9',
    'artisan-profile.html':'cb27e2072fa54c03d64e78a1e6973d439249f6f2',
    'js/fixeo-artisan-profile-v4.js':'25e467e777ee5404b29ede119322cf6ce3482037',
    'js/reservation.js':'3007fa18708e0b1a3c805a3516eb348a60eed636'
  };
  for(const [p,sha] of Object.entries(frozen)) assert.equal(blobSha(p),sha,p);
});

test('Directory Passport uses real photo then deterministic FIXEO ID only',()=>{
  const avatar=between(js,'function _buildAvatar(a, cat)','/* ── Card builder');
  assert.match(avatar,/a\.photo_url \|\| a\.avatar \|\| a\.photo/);
  assert.match(avatar,/_fixeoIdHtml/);
  assert.doesNotMatch(avatar,/FixeoHeroes|getCardAvatar|metier-webp|metier-png|artdir-avatar-silhouette/);
});

test('Directory status chips are canonical and never score-inferred',()=>{
  assert.match(card,/a\.verified === true/);
  assert.match(card,/Vérifié FIXEO/);
  assert.match(card,/a\.claimed === true/);
  assert.match(card,/Profil revendiqué/);
  assert.doesNotMatch(card,/trustScore|score_qualification|responseTime|response_time|completed_missions/);
});

test('Directory removes synthetic biography filler',()=>{
  assert.match(card,/No synthetic biography/);
  assert.doesNotMatch(card,/Profil professionnel référencé sur FIXEO\.<\/p>/);
  assert.match(card,/var descHtml = desc[\s\S]*?: '';/);
});

test('Directory keeps truth-only availability and pricing surfaces',()=>{
  assert.match(card,/Disponibilité à confirmer/);
  assert.match(js,/Tarif confirmé avant intervention/);
  assert.match(js,/Paiement après intervention/);
  assert.doesNotMatch(card,/Disponible aujourd|Disponible maintenant|Réponse rapide|À partir de|Budget indicatif/);
});

test('Directory keeps canonical CTA and profile continuity',()=>{
  assert.match(card,/Demander une intervention/);
  assert.match(card,/Voir le profil complet/);
  assert.match(card,/a\._supabase_id \|\| a\.id/);
  assert.match(js,/FixeoReservation\.open\(selected, false\)/);
});

test('Final Passport optical layer is directory-scoped and mobile-safe',()=>{
  assert.match(css,/ARTISAN PASSPORT V2 — FINAL OPTICAL PASS/);
  assert.match(css,/\.artdir-card--passport::before/);
  assert.match(css,/\.artdir-passport-status--verified/);
  assert.match(css,/\.artdir-passport-status--claimed/);
  assert.match(css,/\.artdir-price-kicker/);
  assert.match(css,/\.artdir-btn-reserve--passport/);
  assert.match(css,/@media\(max-width:540px\)/);
  assert.match(css,/@media\(max-width:350px\)/);
});

test('Directory-only P0 viewport ownership remains present',()=>{
  assert.match(css,/body\.fixeo-targeted-booking-open \.fixeo-gh-universal-shell/);
  assert.match(css,/body\.fixeo-targeted-booking-open #fixeo-gh-menu-portal/);
  assert.match(css,/body\.fixeo-targeted-booking-open #fixeo-reservation-modal\{[\s\S]*?z-index:12000!important/);
});

test('Directory page pins final Passport assets only',()=>{
  assert.match(html,/css\/fixeo-artisan-directory-v1\.css\?v=fxdir-v5-passport-final/);
  assert.match(html,/js\/fixeo-artisan-directory-v1\.js\?v=fxdir-v5-passport-final/);
  assert.match(html,/js\/reservation\.js\?v=av1-card2/);
  assert.match(html,/css\/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v4/);
});
