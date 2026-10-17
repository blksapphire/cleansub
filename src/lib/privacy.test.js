import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The privacy promise ("your statement never leaves your device") rests on the analysis
// code having no way to reach the network. This fails if any analysis file gains one.
// Billing/auth code must live outside these paths, and must never receive transactions.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|import\(\s*['"`]https?:/;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function analysisFiles() {
  const files = [path.join(root, 'analysis.worker.js')];
  for (const dir of ['lib', 'data']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      if (name.endsWith('.js') && !name.endsWith('.test.js')) files.push(path.join(root, dir, name));
    }
  }
  return files;
}

test('analysis code contains no network primitives', () => {
  const offenders = [];
  for (const file of analysisFiles()) {
    const match = stripComments(fs.readFileSync(file, 'utf8')).match(FORBIDDEN);
    if (match) offenders.push(`${path.relative(root, file)}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('the guard actually catches a violation', () => {
  assert.ok(FORBIDDEN.test('await fetch("https://x.test")'));
  assert.ok(FORBIDDEN.test('navigator.sendBeacon(url, data)'));
  assert.ok(!FORBIDDEN.test(stripComments('// fetch is not used here\nconst a = 1;')));
});

test('the shipped CSP stays locked to its own origin until billing is added on purpose', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, '..', 'vercel.json'), 'utf8'));
  const csp = config.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*https?:/);
});
