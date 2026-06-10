'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Import through the package's CJS entry point (index.cjs → src/core.cjs).
const lib = require('../index.cjs');

function makeFixture(moduleName = '@github/copilot') {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-nat-cjs-')));
  const modDir = path.join(tmp, 'node_modules', ...moduleName.split('/'));
  fs.mkdirSync(modDir, { recursive: true });
  fs.writeFileSync(
    path.join(modDir, 'package.json'),
    JSON.stringify({ name: moduleName, main: 'index.js' }),
  );
  fs.writeFileSync(path.join(modDir, 'index.js'), 'module.exports = {};\n');
  const deep = path.join(tmp, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  return { modDir, deep };
}

test('CJS entry: findCopilot resolves natively', () => {
  const { modDir, deep } = makeFixture();
  const r = lib.findCopilot({ fromDir: deep });
  assert.equal(r.name, '@github/copilot');
  assert.equal(r.dir, modDir);
});

test('CJS entry: manual walk finds the nearest module', () => {
  const { modDir, deep } = makeFixture();
  assert.equal(lib.findClosestModuleDir('@github/copilot', { fromDir: deep }), modDir);
});

test('CJS entry: absent module is null', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-nat-cjs-empty-')));
  assert.equal(lib.findCopilot({ fromDir: tmp }), null);
});
