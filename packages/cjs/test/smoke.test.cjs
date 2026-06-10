'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lib = require('../src/index.cjs');

/** Build a throwaway tree: <tmp>/node_modules/@github/copilot + <tmp>/a/b/c */
function makeFixture(moduleName = '@github/copilot') {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-cjs-')));
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

test('resolveModuleEntry resolves the entry file natively', () => {
  const { modDir, deep } = makeFixture();
  const entry = lib.resolveModuleEntry('@github/copilot', { fromDir: deep });
  assert.equal(entry, path.join(modDir, 'index.js'));
});

test('packageRootFromEntry derives the package root from an entry', () => {
  const { modDir, deep } = makeFixture();
  const entry = lib.resolveModuleEntry('@github/copilot', { fromDir: deep });
  assert.equal(lib.packageRootFromEntry('@github/copilot', entry), modDir);
});

test('findCopilot returns a native hit with name, dir and entry', () => {
  const { modDir, deep } = makeFixture();
  const r = lib.findCopilot({ fromDir: deep });
  assert.equal(r.name, '@github/copilot');
  assert.equal(r.strategy, 'native');
  assert.equal(r.dir, modDir);
});

test('findCopilot manual strategy returns dir + best-effort entry from manifest', () => {
  const { modDir, deep } = makeFixture();
  const r = lib.findCopilot({ fromDir: deep, strategy: 'manual' });
  assert.equal(r.strategy, 'manual');
  assert.equal(r.dir, modDir);
  // manual hits now surface the manifest's main/bin/index.js when present.
  assert.equal(r.entry, path.join(modDir, 'index.js'));
});

test('absent module resolves to null on both strategies', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-cjs-empty-')));
  assert.equal(lib.findClosestModuleDir('@github/copilot', { fromDir: tmp }), null);
  assert.equal(lib.resolveModuleEntry('@github/copilot', { fromDir: tmp }), null);
  assert.equal(lib.findCopilot({ fromDir: tmp }), null);
});

test('exports-blocked package: no throw, manual fallback with best-effort entry', () => {
  // Mimic @github/copilot: installed, but `exports` does not expose ".".
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-cjs-exp-')));
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

  // require.resolve throws ERR_PACKAGE_PATH_NOT_EXPORTED → swallowed to null.
  assert.equal(lib.resolveModuleEntry('@github/copilot', { fromDir: modDir }), null);

  // findCopilot must NOT throw, and still locate the dir + a usable entry.
  const r = lib.findCopilot({ fromDir: modDir });
  assert.equal(r.name, '@github/copilot');
  assert.equal(r.strategy, 'manual');
  assert.equal(r.dir, modDir);
  assert.equal(r.entry, path.join(modDir, 'cli.js'));
  // .bin lives at the root of the containing node_modules (two up for a scope).
  assert.equal(r.binDir, path.join(tmp, 'node_modules', '.bin'));
  assert.deepEqual(r.bin, { copilot: path.join(tmp, 'node_modules', '.bin', 'copilot') });
});

test('resolveBinInfo maps string-form bin to the unscoped package name', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-cjs-binstr-')));
  const modDir = path.join(tmp, 'node_modules', '@github', 'copilot');
  fs.mkdirSync(modDir, { recursive: true });
  fs.writeFileSync(
    path.join(modDir, 'package.json'),
    JSON.stringify({ name: '@github/copilot', bin: './cli.js' }),
  );
  const { binDir, bin } = lib.resolveBinInfo('@github/copilot', modDir);
  assert.equal(binDir, path.join(tmp, 'node_modules', '.bin'));
  assert.deepEqual(bin, { copilot: path.join(binDir, 'copilot') });
});

test('candidate priority: bare copilot wins over the SDK fallback', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-cjs-prio-')));
  for (const name of ['@github/copilot', '@github/copilot-sdk']) {
    const d = path.join(tmp, 'node_modules', ...name.split('/'));
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, main: 'index.js' }));
    fs.writeFileSync(path.join(d, 'index.js'), 'module.exports = {};\n');
  }
  const r = lib.findCopilot({ fromDir: tmp });
  assert.equal(r.name, '@github/copilot');
});
