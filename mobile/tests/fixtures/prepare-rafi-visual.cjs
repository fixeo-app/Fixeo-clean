const path=require('node:path'), fs=require('node:fs');
const mobile=path.resolve(__dirname,'../..');
const {buildSync}=require(path.join(mobile,'node_modules/esbuild'));
const dir=path.resolve(process.argv[2] || path.join(mobile,'node_modules/.w3-visual'));
fs.mkdirSync(dir,{recursive:true});
const alias={'react-native':path.join(mobile,'node_modules/react-native-web'), 'expo-router':path.join(mobile,'tests/fixtures/rafi-router.web.ts')};
for(const name of ['auth','supabase','missionTerrain','decisionCenter','artisanWorkspace','magicLoop','clientWatch','push','rafiGateway','mobileDiagnostic']) alias['@/lib/'+name]=path.join(mobile,'tests/fixtures/rafi-empty-services.web.ts');
for(const name of ['mobileEstimator','mobileDiagnosticReference','clientWorkspace']) alias['@/lib/'+name]=path.join(mobile,'tests/fixtures/client-services.web.ts');
for(const name of ['expo-audio','expo-image-picker']) alias[name]=path.join(mobile,'tests/fixtures/rafi-capture.web.ts');
buildSync({entryPoints:[process.argv[3] ? path.resolve(process.argv[3]) : path.join(mobile,'tests/fixtures/rafi-visual.tsx')],outfile:path.join(dir,'app.js'),bundle:true,platform:'browser',jsx:'automatic',
 loader:{'.js':'jsx','.ttf':'dataurl','.png':'file'},resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.js','.json'],alias,
 define:{global:'globalThis',__DEV__:'false','process.env.NODE_ENV':'"production"'},logLevel:'warning'});
fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>W3 RAFI verification</title><style>html,body,#root{width:100%;min-height:100%;margin:0}html,body{height:100%}#root{height:100%;display:flex;flex-direction:column}</style></head><body><div id="root"></div><script>globalThis.process={env:{NODE_ENV:"production",EXPO_OS:"web"}};</script><script src="/app.js"></script></body></html>');
console.log(dir);
