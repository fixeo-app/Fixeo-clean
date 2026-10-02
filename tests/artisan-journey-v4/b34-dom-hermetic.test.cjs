const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('js/fixeo-artisan-profile-v4.js'),html=read('artisan-profile.html');
test('public profile seals stray direct body text before rendering',()=>{assert.match(js,/function sealProfileDOM/);assert.match(js,/n\.nodeType===3&&c\(n\.nodeValue\)/);assert.match(js,/n\.remove\(\)/);assert.match(js,/async function boot\(\)\{sealProfileDOM\(\)/)});
test('known global shells and overlays remain protected',()=>{for(const x of ['nav.navbar','.mobile-nav','.fixeo-gh-shell','#fixeo-gh-menu-portal','footer'])assert.ok(js.includes(x),x)});
test('hermetic runtime has a fresh asset key',()=>{assert.match(html,/fixeo-artisan-profile-v4\.js\?v=fxp4-b34/)});
