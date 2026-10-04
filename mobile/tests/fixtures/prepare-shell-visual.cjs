const path = require('node:path');
const fs = require('node:fs');
const mobile = path.resolve(__dirname, '../..');
const { buildSync } = require(path.join(mobile, 'node_modules/esbuild'));
const dir = path.resolve(process.argv[2] || path.join(mobile, 'node_modules/.w2-visual'));
fs.mkdirSync(dir, {recursive:true});
buildSync({ entryPoints: [path.join(mobile, 'tests/fixtures/shell-visual.tsx')], outfile: path.join(dir,'app.js'), bundle:true, platform:'browser', jsx:'automatic',
 loader:{'.js':'jsx','.ttf':'dataurl','.png':'file'}, resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.js','.json'],
 alias:{'react-native':path.join(mobile,'node_modules/react-native-web'), 'expo-router':path.join(mobile,'tests/fixtures/shell-router.web.ts'), '@/lib/auth':path.join(mobile,'tests/fixtures/shell-auth.web.ts')},
 define:{global:'globalThis',__DEV__:'false','process.env.NODE_ENV':'"production"'},logLevel:'warning'});
fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>W2 Shell verification</title><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}#root{display:flex}</style></head><body><div id="root"></div><script>globalThis.process={env:{NODE_ENV:"production",EXPO_OS:"web"}};</script><script src="/app.js"></script></body></html>');
console.log(dir);
