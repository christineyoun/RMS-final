'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..', '..');
const app = fs.readFileSync(path.join(project, 'App.tsx'), 'utf8');
const header = fs.readFileSync(path.join(project, 'components', 'Header.tsx'), 'utf8');

test('a fresh RMS launch defaults to USD without altering user selection control', () => {
  assert.match(app, /const \[currency, setCurrency\] = useState<Currency>\('USD'\);/);
  assert.doesNotMatch(app, /const \[currency, setCurrency\] = useState<Currency>\('KRW'\);/);
  assert.match(app, /onToggleCurrency=\{setCurrency\}/);
});

test('header currency toggle shows USD, KRW, EUR in that order', () => {
  const start = header.indexOf('{/* Currency Toggle */}');
  const end = header.indexOf('{issueNumber && (', start);
  assert.ok(start >= 0 && end > start, 'currency toggle markers found');
  const section = header.slice(start, end);
  const handlers = [...section.matchAll(/onClick=\{\(\) => onToggleCurrency\('(USD|KRW|EUR)'\)\}/g)].map(m => m[1]);
  assert.deepEqual(handlers, ['USD', 'KRW', 'EUR']);
  for (const symbol of ['USD', 'KRW', 'EUR']) {
    const count = section.split(`currency === '${symbol}'`).length - 1;
    assert.equal(count, 1, `${symbol} selected-state styling remains attached to its button`);
  }
  const labels = [...section.matchAll(/(?:USD \(\$\)|KRW \(₩\)|EUR \(€\))/g)].map(m => m[0]);
  assert.deepEqual(labels, ['USD ($)', 'KRW (₩)', 'EUR (€)']);
});

test('does not replace FX conversion functions or the other currencies', () => {
  assert.match(app, /fetchCommodityQuotes/);
  assert.match(app, /mapCommodityForDisplay/);
  assert.match(header, /onToggleCurrency\('KRW'\)/);
  assert.match(header, /onToggleCurrency\('EUR'\)/);
});
