import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Import through the package's ESM entry point (index.mjs → src/core.cjs).
import * as lib from '../index.mjs';
import core from '../index.mjs';

function makeFixture(moduleName = '@github/copilot') {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-nat-mjs-')));
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

test('ESM entry: named exports are present', () => {
  for (const k of ['findCopilot', 'findClosestModuleDir', 'resolveModuleEntry', 'DEFAULT_CANDIDATES']) {
    assert.ok(k in lib, `missing export ${k}`);
  }
  assert.equal(core.findCopilot, lib.findCopilot, 'default and named share one implementation');
});

test('ESM entry: findCopilot resolves natively (same core as CJS)', () => {
  const { modDir, deep } = makeFixture();
  const r = lib.findCopilot({ fromDir: deep });
  assert.equal(r.name, '@github/copilot');
  assert.equal(r.dir, modDir);
  assert.equal(r.strategy, 'native');
});

test('ESM entry: absent module is null', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-nat-mjs-empty-')));
  assert.equal(lib.findCopilot({ fromDir: tmp }), null);
});

test('ESM entry: exports-blocked package falls back to manual (no throw)', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-nat-mjs-exp-')));
  const modDir = path.join(tmp, 'node_modules', '@github', 'copilot');
  fs.mkdirSync(modDir, { recursive: true });
  fs.writeFileSync(
    path.join(modDir, 'package.json'),
    JSON.stringify({
      name: '@github/copilot',
      bin: { copilot: './cli.js' },
      exports: { './package.json': './package.json' },
    }),
  );
  fs.writeFileSync(path.join(modDir, 'cli.js'), '#!/usr/bin/env node\n');

  const r = lib.findCopilot({ fromDir: modDir });
  assert.equal(r.strategy, 'manual');
  assert.equal(r.dir, modDir);
  assert.equal(r.entry, path.join(modDir, 'cli.js'));
  assert.equal(r.binDir, path.join(tmp, 'node_modules', '.bin'));
  assert.deepEqual(r.bin, { copilot: path.join(tmp, 'node_modules', '.bin', 'copilot') });
});
