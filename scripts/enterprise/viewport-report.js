#!/usr/bin/env node
/**
 * BP07-F: Viewport / CSS breakpoint report.
 * Reads enterprise-dashboard-v1.css and reports all @media breakpoints found,
 * then verifies that required responsive patterns are present.
 * Output: tests/enterprise/viewport-report.txt
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CSS_FILE = path.join(__dirname, '../../css/enterprise-dashboard-v1.css');
const OUT_FILE = path.join(__dirname, '../../tests/enterprise/viewport-report.txt');

if (!fs.existsSync(CSS_FILE)) {
  console.error('[viewport-report] ERROR: CSS file not found:', CSS_FILE);
  process.exit(1);
}

const css = fs.readFileSync(CSS_FILE, 'utf8');

// ── Extract all @media rules
const MEDIA_RE = /@media\s*([^{]+)\{/g;
const breakpoints = [];
let m;
while ((m = MEDIA_RE.exec(css)) !== null) {
  breakpoints.push(m[1].trim());
}

// Deduplicate
const unique = [...new Set(breakpoints)].sort();

// ── Required responsive patterns to verify
const REQUIRED_PATTERNS = [
  { label: 'Mobile sidebar (max-width ≤768px)',      pattern: /max-width:\s*768px/ },
  { label: 'Small mobile (max-width ≤599px or ≤600px)', pattern: /max-width:\s*5[69][90]px/ },
  { label: 'Mobile narrow (max-width ≤480px or ≤479px)', pattern: /max-width:\s*4[78][09]px/ },
  { label: 'Wide layout (min-width ≥769px or ≥960px)', pattern: /min-width:\s*(769|960|1024)px/ },
  { label: 'Mobile detail bottom-sheet (≤767px)',    pattern: /max-width:\s*767px/ },
];

const lines = [];
lines.push('═══════════════════════════════════════════════════════');
lines.push('  BP07 Viewport / CSS Breakpoint Report');
lines.push('  Generated: ' + new Date().toISOString());
lines.push('  Source: ' + path.relative(path.join(__dirname, '../..'), CSS_FILE));
lines.push('═══════════════════════════════════════════════════════');
lines.push('');
lines.push('── All @media breakpoints found (' + unique.length + ') ──');
unique.forEach(function(bp, i) {
  lines.push('  [' + String(i + 1).padStart(2, '0') + '] ' + bp);
});

lines.push('');
lines.push('── Required patterns check ──');
let allOk = true;
REQUIRED_PATTERNS.forEach(function(req) {
  const found = req.pattern.test(css);
  const status = found ? '  ✓ PASS' : '  ✗ MISSING';
  if (!found) allOk = false;
  lines.push(status + '  ' + req.label);
});

lines.push('');
lines.push('── BP07 Feature CSS check ──');
const BP07_CSS_CHECKS = [
  { label: '.ent-daily-brief',        pattern: /\.ent-daily-brief/ },
  { label: '.ent-health-summary',     pattern: /\.ent-health-summary/ },
  { label: '.ent-quick-actions',      pattern: /\.ent-quick-actions/ },
  { label: '.ent-site-compare-table', pattern: /\.ent-site-compare-table/ },
  { label: '.ent-db-item-critical',   pattern: /\.ent-db-item-critical/ },
  { label: '.ent-hs-bar-fill',        pattern: /\.ent-hs-bar-fill/ },
  { label: '.ent-qa-btn',             pattern: /\.ent-qa-btn/ },
  { label: '.ent-site-compare-toggle',pattern: /\.ent-site-compare-toggle/ },
];
BP07_CSS_CHECKS.forEach(function(chk) {
  const found = chk.pattern.test(css);
  const status = found ? '  ✓ FOUND' : '  ✗ MISSING';
  if (!found) allOk = false;
  lines.push(status + '  ' + chk.label);
});

lines.push('');
lines.push('── Summary ──');
lines.push(allOk ? '  ✓ All checks passed.' : '  ✗ Some checks FAILED — review above.');
lines.push('');

const report = lines.join('\n');
console.log(report);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, report, 'utf8');
console.log('[viewport-report] Written:', OUT_FILE);
