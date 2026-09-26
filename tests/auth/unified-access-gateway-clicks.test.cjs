const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const h=fs.readFileSync(path.join(__dirname,'../../auth.html'),'utf8');
test('gateway script contains no escaped newline token between statements',()=>assert.doesNotMatch(h,/enterpriseAccess\.hidden=space!==['"]enterprise['"];\\n/));
test('all Unified Access cards invoke the gateway selector',()=>{for(const role of ['client','artisan','enterprise'])assert.ok(h.includes("onclick=\"selectGateway('"+role+"')\""));});
test('gateway selector supports all three presentation states',()=>{assert.match(h,/function selectGateway\(space\)/);assert.match(h,/\['client','artisan','enterprise'\]\.includes\(space\)/);});
