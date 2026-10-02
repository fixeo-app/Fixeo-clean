const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('css/fixeo-artisan-profile-v4.css'),js=read('js/fixeo-artisan-profile-v4.js'),html=read('artisan-profile.html');
const marker='/* B3.7.3 FIXEO ID MOBILE CENTER — explicit visual correction after real-device review */';const p=css.slice(css.indexOf(marker));
test('B3.7.3 hard-centers initials independent of inherited positioning',()=>{assert.ok(p.startsWith(marker));assert.match(p,/inset:0;\n  display:grid;\n  place-items:center/);assert.match(p,/width:100%;\n  height:100%;\n  transform:none/);});
test('B3.7.3 removes trade watermark and inner mesh on mobile',()=>{assert.match(p,/\.fxp4-b371 \.fxp4-fixeo-id-code\{display:none\}/);assert.match(p,/\.fxp4-b371 \.fxp4-fixeo-id-mesh\{display:none\}/);});
test('B3.7.3 reduces F mark to a signature detail',()=>{assert.match(p,/width:12px/);assert.match(p,/height:12px/);assert.match(p,/font-size:\.28rem/);});
test('B3.7.3 preserves deterministic FIXEO ID and booking',()=>{assert.match(js,/fxp4-fixeo-id/);assert.match(js,/FixeoReservation\.open\(artisan\(p\),false\)/);});
test('B3.7.3 keeps real photo priority',()=>{assert.match(js,/if\(photo\)return '<div class="fxp4-avatar photo"/);});
test('B3.7.3 fresh asset key is isolated',()=>{assert.match(html,/b373id2/);});
