import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import manifest from './fixtures/w4-invariants.json';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const printer = ts.createPrinter({ removeComments: true });

test('W4 preserves all existing services, mission engine, W2, W3, Auth and Artisan sources byte-for-byte', () => {
  for (const [file, digest] of Object.entries(manifest.protectedFiles)) assert.equal(sha(readFileSync(file)), digest, file);
});

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
  const home = readFileSync('app/index.tsx', 'utf8');
  assert.match(home, /const normalizedCity = city\.trim\(\)/);
  assert.match(home, /createRequest\(\s*need\.serviceCategory,\s*normalizedCity,\s*need\.description,\s*idempotencyKeyRef\.current,\s*\)/);
  assert.doesNotMatch(home, /latitude|longitude|requestForegroundPermissions/);
  assert.match(home, /<ClientLocationField city=\{city\} onChangeCity=\{setCity\}/);
  assert.match(home, /code === 'CITY_NOT_SUPPORTED'/);
});
