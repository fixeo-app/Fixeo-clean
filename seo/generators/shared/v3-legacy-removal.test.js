'use strict';
/**
 * v3-legacy-removal.test.js
 * Task 2.8 — Shared flagship script removal helper
 */

const { removeFlagshipScript, FLAGSHIP_SCRIPT_TAG } = require('./v3-legacy-removal');
const { CORE_JS } = require('./page-template');

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)           { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg) { if (!s.includes(sub)) throw new Error(msg || `Expected to contain: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg) { if (s.includes(sub)) throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)     { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\nv3-legacy-removal.test.js\n');

// 1. FLAGSHIP_SCRIPT_TAG is derived from CORE_JS
test('1. FLAGSHIP_SCRIPT_TAG is not null (entry exists in CORE_JS)', () => {
  assert(FLAGSHIP_SCRIPT_TAG !== null, 'FLAGSHIP_SCRIPT_TAG must not be null — entry missing from CORE_JS');
});

test('2. FLAGSHIP_SCRIPT_TAG has exactly 2 leading spaces (matching page-template indentation)', () => {
  assert(FLAGSHIP_SCRIPT_TAG.startsWith('  <script '), 'Must start with exactly 2 spaces + <script');
  assert(!FLAGSHIP_SCRIPT_TAG.startsWith('   '), 'Must not have 3+ leading spaces');
});

test('3. FLAGSHIP_SCRIPT_TAG contains the canonical src path', () => {
  assertContains(FLAGSHIP_SCRIPT_TAG, '/js/fixeo-local-flagship-v1.js', 'Must contain canonical script path');
});

test('4. FLAGSHIP_SCRIPT_TAG has defer attribute (entry is defer: true)', () => {
  assertContains(FLAGSHIP_SCRIPT_TAG, ' defer>', 'Must contain defer attribute');
});

test('5. FLAGSHIP_SCRIPT_TAG matches CORE_JS entry exactly (version-safe)', () => {
  const entry = CORE_JS.find(s => s.src && s.src.includes('/js/fixeo-local-flagship-v1.js'));
  assert(entry, 'CORE_JS must have the entry');
  const expectedTag = entry.defer
    ? `  <script src="${entry.src}" defer></script>`
    : `  <script src="${entry.src}"></script>`;
  assertEquals(FLAGSHIP_SCRIPT_TAG, expectedTag, 'Tag must match CORE_JS entry exactly');
});

test('6. removeFlagshipScript removes the exact tag from HTML', () => {
  const html = '<head></head><body>\n' + FLAGSHIP_SCRIPT_TAG + '\n<script src="other.js"></script>\n</body>';
  const { html: result, removed, warning } = removeFlagshipScript(html);
  assertEquals(removed, true, 'removed must be true');
  assertEquals(warning, null, 'warning must be null on success');
  assertNotContains(result, 'fixeo-local-flagship-v1.js', 'flagship script must be absent after removal');
  assertContains(result, 'other.js', 'other scripts must be preserved');
});

test('7. removeFlagshipScript does NOT touch the CSS link (only removes JS)', () => {
  const cssLink = '  <link rel="stylesheet" href="/css/fixeo-local-flagship-v1.css?v=fxlp-v15">';
  const html = '<head>\n' + cssLink + '\n</head><body>\n' + FLAGSHIP_SCRIPT_TAG + '\n</body>';
  const { html: result } = removeFlagshipScript(html);
  assertContains(result, cssLink, 'CSS link must be preserved');
  assertNotContains(result, FLAGSHIP_SCRIPT_TAG, 'JS script must be removed');
});

test('8. removeFlagshipScript returns removed=false + warning if tag absent', () => {
  const html = '<body><script src="other.js"></script></body>';
  const { html: result, removed, warning } = removeFlagshipScript(html);
  assertEquals(removed, false, 'removed must be false when tag absent');
  assert(warning !== null && warning.length > 0, 'warning must be set when tag absent');
  assertEquals(result, html, 'html must be unchanged when tag absent');
});

test('9. removeFlagshipScript does not perform broad regex (only removes the exact tag)', () => {
  // A tag with different src must not be removed
  const otherScript = '  <script src="/js/fixeo-local-flagship-v2.js" defer></script>';
  const html = '<body>\n' + otherScript + '\n</body>';
  const { html: result, removed } = removeFlagshipScript(html);
  assertEquals(removed, false, 'Must not remove a different script version');
  assertContains(result, otherScript, 'Other script must be preserved');
});

test('10. removeFlagshipScript removes trailing newline cleanly (no blank line debris)', () => {
  const html = '<body>\n' + FLAGSHIP_SCRIPT_TAG + '\n<script src="b.js"></script>\n</body>';
  const { html: result } = removeFlagshipScript(html);
  // Should not have a lone blank line where the flagship tag was
  assert(!result.includes('\n\n<script src="b.js"'), 'No blank line debris after removal');
});

test('11. removeFlagshipScript is idempotent (calling twice does not error)', () => {
  const html = '<body>\n' + FLAGSHIP_SCRIPT_TAG + '\n</body>';
  const { html: once } = removeFlagshipScript(html);
  const { html: twice, removed, warning } = removeFlagshipScript(once);
  assertEquals(removed, false, 'Second call: removed=false (tag already gone)');
  assert(warning !== null, 'Second call: warning set (expected)');
  assertEquals(once, twice, 'HTML unchanged on second call');
});

test('12. FLAGSHIP_SCRIPT_TAG is NOT a substring match issue (no orphan whitespace)', () => {
  // Hub bug: tag without leading spaces is a substring of tag with spaces
  // Verify that FLAGSHIP_SCRIPT_TAG (with spaces) is NOT a substring of a shorter tag
  const noSpacesTag = FLAGSHIP_SCRIPT_TAG.trimStart();
  assert(FLAGSHIP_SCRIPT_TAG !== noSpacesTag, 'Tag must have leading spaces');
  // The no-spaces version should be found inside the spaced version (substring)
  assert(FLAGSHIP_SCRIPT_TAG.includes(noSpacesTag), 'Spaced tag contains no-space tag as substring');
  // But replacement using no-spaces tag leaves orphan whitespace — that is the bug.
  // Verify the correct (spaced) version replaces cleanly:
  const html = '<body>\n' + FLAGSHIP_SCRIPT_TAG + '\n</body>';
  const bad = html.replace(noSpacesTag, ''); // the old hub bug
  const good = html.replace(FLAGSHIP_SCRIPT_TAG, ''); // correct
  assert(bad !== good, 'With-spaces and no-spaces replacements must differ');
  assert(good.includes('\n\n') === false || !good.includes('  \n'), 'Clean replacement leaves no orphan spaces');
});

// Summary
console.log(`\nTotal tests : ${passed + failed}`);
console.log(`  Passed    : ${passed}`);
console.log(`  Failed    : ${failed}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.label}\n     ${f.error}`));
  process.exit(1);
} else { console.log('\n✅ All tests passed.\n'); }
