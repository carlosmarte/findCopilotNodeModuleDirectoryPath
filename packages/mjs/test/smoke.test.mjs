import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as lib from '../src/index.mjs';

function makeFixture(moduleName = '@github/copilot') {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-mjs-')));
  const modDir = path.join(tmp, 'node_modules', ...moduleName.split('/'));
  fs.mkdirSync(modDir, { recursive: true });
  fs.writeFileSync(
    path.join(modDir, 'package.json'),
    JSON.stringify({ name: moduleName, version: '0.0.0', main: 'index.js' }),
  );
  fs.writeFileSync(path.join(modDir, 'index.js'), 'module.exports = {};\n');
  const deep = path.join(tmp, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  return { tmp, modDir, deep };
}

test('findClosestModuleDir walks up to the nearest node_modules', () => {
  const { modDir, deep } = makeFixture();
  assert.equal(lib.findClosestModuleDir('@github/copilot', { fromDir: deep }), modDir);
});

test('resolveModuleEntry resolves the entry via createRequire', () => {
  const { modDir, deep } = makeFixture();
  const entry = lib.resolveModuleEntry('@github/copilot', { fromDir: deep });
  assert.equal(entry, path.join(modDir, 'index.js'));
});

test('findCopilot returns a native hit', () => {
  const { modDir, deep } = makeFixture();
  const r = lib.findCopilot({ fromDir: deep });
  assert.equal(r.name, '@github/copilot');
  assert.equal(r.strategy, 'native');
  assert.equal(r.dir, modDir);
});

test('findCopilot manual strategy works without an entry', () => {
  const { modDir, deep } = makeFixture();
  const r = lib.findCopilot({ fromDir: deep, strategy: 'manual' });
  assert.equal(r.strategy, 'manual');
  assert.equal(r.dir, modDir);
});

test('absent module resolves to null', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-mjs-empty-')));
  assert.equal(lib.findClosestModuleDir('@github/copilot', { fromDir: tmp }), null);
  assert.equal(lib.resolveModuleEntry('@github/copilot', { fromDir: tmp }), null);
  assert.equal(lib.findCopilot({ fromDir: tmp }), null);
});

test('resolveFromHere returns a path for a real installed module or null', () => {
  // node:path is always resolvable; import.meta.resolve handles bare builtins
  // by returning a node: URL, so just assert it does not throw and is typed.
  const r = lib.resolveFromHere('@github/copilot');
  assert.ok(r === null || typeof r === 'string');
});
