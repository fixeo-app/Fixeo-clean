const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('js/fixeo-artisan-profile-v4.js'),css=read('css/fixeo-artisan-profile-v4.css'),html=read('artisan-profile.html');
const marker='/* B3.7.1 FIXEO ID optical fix + Hero CTA signature */';const p=css.slice(css.indexOf(marker));
test('B3.7.1 makes initials the dominant FIXEO ID signal',()=>{assert.ok(p.startsWith(marker));assert.match(p,/\.fxp4-b371 \.fxp4-fixeo-id strong/);assert.match(p,/font-size:3\.1rem/);assert.match(p,/transform:translate\(-50%,-46%\)/);});
test('B3.7.1 makes trade code a subtle watermark and brand mark smaller',()=>{assert.match(p,/\.fxp4-b371 \.fxp4-fixeo-id-code/);assert.match(p,/color:rgba\(255,255,255,\.045\)/);assert.match(p,/\.fxp4-b371 \.fxp4-fixeo-id-brand/);assert.match(p,/width:20px/);});
test('B3.7.1 hero CTA uses FIXEO signature instead of white system surface',()=>{assert.match(js,/fxp4-primary-signature/);assert.match(js,/Demande ciblée par FIXEO/);assert.match(p,/linear-gradient\(135deg,#181920,#121319\) padding-box/);assert.doesNotMatch(p,/background:#fff!important/);});
test('B3.7.1 hero CTA keeps original booking target',()=>{assert.match(js,/id="public-artisan-action"/);assert.match(js,/FixeoReservation\.open\(artisan\(p\),false\)/);});
test('B3.7.1 remains non-human and photo-first',()=>{assert.match(js,/if\(photo\)return '<div class="fxp4-avatar photo"/);assert.doesNotMatch(js,/generated.*face|portrait.*ai|Math\.random/i);});
test('B3.7.1 fresh assets are isolated',()=>{assert.match(html,/fxp4-b34dm1-b35wow1-b36p1-b37id1-b371opt1/);});
