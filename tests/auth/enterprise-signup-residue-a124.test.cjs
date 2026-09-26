const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const h=fs.readFileSync(path.join(__dirname,'../../auth.html'),'utf8');
test('A1.2.4 login signup switch has isolated target',()=>assert.match(h,/id="login-signup-switch"/));
test('A1.2.4 Enterprise hides only login signup residue',()=>assert.match(h,/loginSignupSwitch\.hidden=space==='enterprise'/));
test('A1.2.4 Client and Artisan signup mechanics remain present',()=>{assert.match(h,/switchTab\('signup'\)/);assert.match(h,/value="client"/);assert.match(h,/value="artisan"/);assert.doesNotMatch(h,/value="enterprise"/);});
