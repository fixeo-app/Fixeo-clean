import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import manifest from './fixtures/w4-invariants.json';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const printer = ts.createPrinter({ removeComments: true });

test('W6 preserves W4/W5 business services, mission engine and unchanged W2/W3 components byte-for-byte', () => {
  for (const [file, digest] of Object.entries(manifest.protectedFiles)) assert.equal(sha(readFileSync(file)), digest, file);
});

// Intake and bounded bootstrap callbacks are updated by the explicitly authorized W4.1 integration;
// their former hashes remain in w4FinalReplacedCallbacks and UI behavior is tested separately.
test('W4 keeps original request, auth, watch, load, evidence, validation and adjustment callbacks', () => {
  for (const [file, expected] of Object.entries(manifest.callbacks)) {
    // Only new presentation state assignments are omitted; no service call,
    // dependency, interval or callback argument is omitted. The explicit W4
    // CITY_NOT_SUPPORTED error branch is separately checked in browser tests.
    const text = readFileSync(file, 'utf8')
      .replace(/catch \(error: any\) \{\n      if \(String\(error\?\.message \|\| ''\)\.includes\('CITY_NOT_SUPPORTED'\)\) \{[\s\S]*?        return;\n      \}/, 'catch {')
      .replace(/^\s*setMissionSummary\(mission\);\n/gm, '\n')
      .replace(/^\s*setEditing\(false\);\n/gm, '\n')
      .replace(/^\s*setEvidenceState\(evidenceResult.status === 'fulfilled' \? 'ready' : 'unavailable'\);\n/gm, '\n');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const functions = new Map<string, string>();
    const hooks = new Set<string>();
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) functions.set(node.name.text, sha(printer.printNode(ts.EmitHint.Unspecified, node, source)));
      if (ts.isCallExpression(node) && ['useEffect', 'useCallback'].includes(node.expression.getText(source))) hooks.add(sha(printer.printNode(ts.EmitHint.Unspecified, node, source)));
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const [name, digest] of Object.entries(expected)) {
      if (name.startsWith('hook-')) assert.ok(hooks.has(digest), `${file} original ${name}`);
      else assert.equal(functions.get(name), digest, `${file} ${name}`);
    }
  }
});

test('W4 request contract remains four arguments including normalized city and no GPS', () => {
  const home = readFileSync('components/ClientRequestComposer.tsx', 'utf8');
  assert.match(home, /const normalizedCity = city\.trim\(\)/);
  assert.match(home, /createRequest\(\s*need\.serviceCategory,\s*normalizedCity,\s*need\.description,\s*idempotencyKeyRef\.current,\s*\)/);
  assert.doesNotMatch(home, /latitude|longitude|requestForegroundPermissions/);
  assert.match(home, /<ClientLocationField city=\{city\} error=\{cityError[\s\S]*?onChangeCity=\{chooseCity\}/);
  assert.match(home, /setCity\(value\); setCityChosen\(true\); setCityError\(false\)/);
  assert.match(home, /code === 'CITY_NOT_SUPPORTED'/);
});

// PB1 V2 explicitly authorizes availability correction. Every other byte in the
// previous service module is retained; executable write/refusal tests cover the replacement.
test('PB1 V2 changes availability only within the former protected workspace service', () => {
  const expected = JSON.parse(readFileSync('tests/fixtures/pb1-v2-availability-preserved.json', 'utf8'));
  const rest = readFileSync('lib/artisanWorkspace.ts', 'utf8')
    .replace(/^import .*?;\n/gm, '')
    .replace(/export async function setArtisanAvailability\([\s\S]*?\n}\n/, 'AVAILABILITY_REPLACED\n');
  assert.equal(sha(rest), expected.sha256);
});

test('PB1 V2 city projections and photo timeout preserve all other mission/auth/result statements', () => {
  const fixture: Record<string, {authorized_functions:string[];unchanged_statements:string[]}> = JSON.parse(readFileSync('tests/fixtures/pb1-v2-read-boundaries.json','utf8'));
  for(const [file,expected] of Object.entries(fixture)) {
    // PB1 explicitly adds only optional photo relevance metadata; all former fields/statements retain their hashes.
    const text=readFileSync(file,'utf8').replace(/^  photo_relevance\?: \{ value: 'related' \| 'unrelated' \| 'uncertain'; provenance: string \};\n/m, '');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    const actual=source.statements.filter(node=>!ts.isImportDeclaration(node)&&!(ts.isFunctionDeclaration(node)&&expected.authorized_functions.includes(node.name?.text || '')))
      .map(node=>sha(printer.printNode(ts.EmitHint.Unspecified,node,source)));
    assert.deepEqual(actual,expected.unchanged_statements,file);
  }
});
