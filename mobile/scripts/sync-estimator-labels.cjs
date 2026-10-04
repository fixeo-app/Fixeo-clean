// Export canonical presentation labels only. No engine or price is imported by Mobile.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
const start = source.indexOf('var labels = {', source.indexOf('function optionLabel'));
if (start < 0) throw new Error('Canonical option labels not found');
const labels = vm.runInNewContext('(' + source.slice(start + 13, source.indexOf('\n    };', start) + 6) + ')');
for (const name of ['serrurerie', 'climatisation', 'electricity', 'plumbing']) Object.assign(labels, require(path.join(root, 'data/pricing/engine/' + name + '-pilot-v1.js')).labels);
if (Object.values(labels).some(value => typeof value !== 'string')) throw new Error('Labels must contain text only');
fs.writeFileSync(path.join(root, 'mobile/lib/clientEstimatorLabels.generated.json'), JSON.stringify(labels, null, 2) + '\n');
