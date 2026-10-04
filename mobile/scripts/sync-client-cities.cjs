// The public catalogue stays authoritative; never hand-edit the generated mobile copy.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const mobile = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(mobile, '../js/fixeo-cities.js'), 'utf8'), context, { timeout: 1000 });
const cities = context.window.FIXEO_CITIES_MAP;
if (!Array.isArray(cities) || !cities.length) throw new Error('Canonical city catalogue unavailable');
fs.writeFileSync(path.join(mobile, 'lib/clientCities.generated.json'), JSON.stringify(cities, null, 2) + '\n');
