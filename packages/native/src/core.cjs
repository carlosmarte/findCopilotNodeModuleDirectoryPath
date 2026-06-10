'use strict';

/**
 * @findcopilot/native — core resolution logic (single source of truth).
 *
 * This file is authored once, in CommonJS, and consumed by BOTH entry points:
 *   - index.cjs  → `module.exports = require('./src/core.cjs')`
 *   - index.mjs  → `createRequire(import.meta.url)('./src/core.cjs')` then
 *                  named re-exports.
 *
 * That makes the package a true native dual-format package (CJS + ESM
 * consumers, one implementation, no transpile / build step). The `exports`
 * map in package.json picks the right wrapper per consumer condition.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CANDIDATES = [
  '@github/copilot',
  '@github/copilot-sdk',
  '@github/copilot-language-server',
];

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function resolveModuleEntry(moduleName, opts = {}) {
  const fromDir = opts.fromDir || process.cwd();
  try {
    return require.resolve(moduleName, { paths: [fromDir] });
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

function packageRootFromEntry(moduleName, entry, opts = {}) {
  if (!entry) return null;
  const marker = path.join('node_modules', ...moduleName.split('/'));
  const idx = entry.lastIndexOf(marker);
  if (idx !== -1) return entry.slice(0, idx + marker.length);

  try {
    const fromDir = opts.fromDir || process.cwd();
    const manifest = require.resolve(`${moduleName}/package.json`, {
      paths: [fromDir],
    });
    return path.dirname(manifest);
  } catch {
    return null;
  }
}

function findClosestModuleDir(moduleName, opts = {}) {
  const segments = moduleName.split('/');
  let dir = path.resolve(opts.fromDir || process.cwd());
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, 'node_modules', ...segments);
    if (isDir(candidate)) return candidate;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

function findCopilot(opts = {}) {
  const fromDir = opts.fromDir || process.cwd();
  const strategy = opts.strategy || 'auto';
  const list = opts.candidates
    ? (Array.isArray(opts.candidates) ? opts.candidates : [opts.candidates])
    : DEFAULT_CANDIDATES;

  for (const name of list) {
    if (strategy === 'auto' || strategy === 'native') {
      const entry = resolveModuleEntry(name, { fromDir });
      if (entry) {
        return {
          name,
          entry,
          dir: packageRootFromEntry(name, entry, { fromDir }),
          strategy: 'native',
          fromDir,
        };
      }
    }
    if (strategy === 'auto' || strategy === 'manual') {
      const dir = findClosestModuleDir(name, { fromDir });
      if (dir) {
        return { name, dir, entry: null, strategy: 'manual', fromDir };
      }
    }
  }
  return null;
}

module.exports = {
  DEFAULT_CANDIDATES,
  resolveModuleEntry,
  packageRootFromEntry,
  findClosestModuleDir,
  findCopilot,
};
