// Canonical runtime registry shared with the Mobile Vision backend.
const fs = require('node:fs'), path = require('node:path');
const mobile = path.resolve(__dirname, '..');
const cities = require('../../api/diagnostic/cities.json');
if (!Array.isArray(cities) || !cities.length || new Set(cities.map(c => c.value)).size !== cities.length) throw new Error('Invalid canonical city registry');
fs.writeFileSync(path.join(mobile, 'lib/clientCities.generated.json'), JSON.stringify(cities, null, 2) + '\n');
