const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function blobSha(p){
  const b=fs.readFileSync(path.join(root,p));
  return crypto.createHash('sha1')
    .update(Buffer.from('blob '+b.length+'\0'))
    .update(b)
    .digest('hex');
}

const html=read('artisans.html');
const css=read('css/fixeo-artisan-directory-v1.css');

test('Homepage official files remain byte-identical to the frozen checkpoint',()=>{
  const frozen={
    'index.html':'74b71bc778407e2615e45924cf536535f939ef29',
    'js/fixeo_homepage_premium_patch.js':'23493081617d753b665c8ababb9dbb73cfb9165a',
    'css/fixeo-homepage-passport-v2.css':'664d3ea86b280174ae99b1872b7467656002f564',
    'js/main.js':'ed9086b710c636124984cd9f277d83f1e55acfa9'
  };
  for(const [p,sha] of Object.entries(frozen)) assert.equal(blobSha(p),sha,p);
});

test('Public profile and shared reservation engine remain untouched',()=>{
  assert.equal(blobSha('artisan-profile.html'),'cb27e2072fa54c03d64e78a1e6973d439249f6f2');
  assert.equal(blobSha('js/reservation.js'),'3007fa18708e0b1a3c805a3516eb348a60eed636');
});

test('Directory-only CSS owns the targeted booking viewport',()=>{
  for(const selector of [
    '.fixeo-gh-shell',
    '.fixeo-gh-universal-shell',
    '.fixeo-gh-source-shell',
    '.fixeo-gh-mobile',
    '#fixeo-gh-menu-portal',
    '.fixeo-gh-mobile-bar'
  ]){
    assert.ok(
      css.includes('body.fixeo-targeted-booking-open '+selector),
      selector
    );
  }
  assert.match(css,/body\.fixeo-targeted-booking-open #fixeo-reservation-backdrop\{[\s\S]*?z-index:11990!important/);
  assert.match(css,/body\.fixeo-targeted-booking-open #fixeo-reservation-modal\{[\s\S]*?position:fixed!important;[\s\S]*?inset:0!important;[\s\S]*?z-index:12000!important/);
});

test('Directory page pins only its dedicated viewport fix asset',()=>{
  assert.match(html,/css\/fixeo-artisan-directory-v1\.css\?v=fxdir-v4-p0/);
  assert.match(html,/js\/reservation\.js\?v=av1-card2/);
  assert.match(html,/css\/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v4/);
});

test('Directory Passport V2 remains the active card system',()=>{
  assert.match(css,/ARTISAN CARD PASSPORT V2/);
  assert.match(css,/\.artdir-card--passport/);
  assert.match(css,/\.artdir-fixeo-id/);
  assert.match(css,/\.artdir-btn-reserve--passport/);
});
