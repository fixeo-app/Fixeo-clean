// Presentation metadata only, projected from the existing diagnostic contract.
const fs = require('node:fs'), path = require('node:path');
const { QUESTIONS } = require('../../api/diagnostic/contract');
fs.writeFileSync(path.join(__dirname, '../lib/diagnosticSafetyQuestions.generated.json'), JSON.stringify(
  Object.entries(QUESTIONS).filter(([, question]) => !!question.hazard).map(([id]) => id), null, 2) + '\n');
