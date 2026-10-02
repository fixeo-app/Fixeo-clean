const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),js=read('js/fixeo-artisan-profile-v4.js');
test('P0 profile document starts with a real doctype and no claim residue',()=>{assert.equal(html.startsWith('<!DOCTYPE html>'),true);assert.doesNotMatch(html,/claaim sys|claim sys|claim system/i);});
test('P0 generic navigation never opens an artisan profile without an id',()=>{assert.match(html,/href="\/artisans\.html"[^>]*><span class="dd-icon">⭐<\/span>Profils artisans/);assert.doesNotMatch(html,/href="\/artisan-profile\.html" class="nav-dropdown-item"/);});
test('P0 direct profile route without id redirects to artisan directory',()=>{assert.match(js,/if\(!ref\)\{window\.location\.replace\('\/artisans\.html'\);return\}/);});
test('P0 valid artisan profiles keep canonical resolver and booking handoff',()=>{assert.match(js,/resolve_artisan_public_profile_v4/);assert.match(js,/FixeoReservation\.open\(artisan\(p\),false\)/);});
