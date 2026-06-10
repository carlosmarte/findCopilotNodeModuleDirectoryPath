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

// Codes meaning "Node produced no entry path" — package absent, OR installed
// but its `exports`/`main` blocks resolution (e.g. `@github/copilot` exposes no
// `.` export). All degrade to the manual walk instead of throwing.
const NOT_RESOLVABLE = new Set([
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_UNSUPPORTED_DIR_IMPORT',
]);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Best-effort entry for a package whose `exports` blocks native resolution:
// read its package.json and probe main / module / bin / index.js.
function readManifestEntry(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const rels = [];
    if (typeof pkg.main === 'string') rels.push(pkg.main);
    if (typeof pkg.module === 'string') rels.push(pkg.module);
    if (typeof pkg.bin === 'string') rels.push(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === 'object') {
      const first = Object.values(pkg.bin).find((v) => typeof v === 'string');
      if (first) rels.push(first);
    }
    rels.push('index.js');
    for (const rel of rels) {
      const abs = path.join(dir, rel);
      if (isFile(abs)) return abs;
    }
  } catch {
    // missing/unreadable manifest — fall through
  }
  return null;
}

// Resolve the `.bin` dir of the node_modules that contains the found package,
// and map the package's declared bin names to their shim paths under it.
function resolveBinInfo(moduleName, dir) {
  const segments = moduleName.split('/');
  const nodeModulesDir = path.resolve(dir, ...segments.map(() => '..'));
  const binDir = path.join(nodeModulesDir, '.bin');
  const bin = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (typeof pkg.bin === 'string') {
      const name = segments[segments.length - 1];
      bin[name] = path.join(binDir, name);
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      for (const name of Object.keys(pkg.bin)) {
        bin[name] = path.join(binDir, name);
      }
    }
  } catch {
    // no/unreadable manifest — leave bin empty
  }
  return { binDir, bin };
}

function resolveModuleEntry(moduleName, opts = {}) {
  const fromDir = opts.fromDir || process.cwd();
  try {
    return require.resolve(moduleName, { paths: [fromDir] });
  } catch (err) {
    if (err && NOT_RESOLVABLE.has(err.code)) return null;
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
        const dir = packageRootFromEntry(name, entry, { fromDir });
        const { binDir, bin } = dir
          ? resolveBinInfo(name, dir)
          : { binDir: null, bin: {} };
        return { name, dir, entry, binDir, bin, strategy: 'native', fromDir };
      }
    }
    if (strategy === 'auto' || strategy === 'manual') {
      const dir = findClosestModuleDir(name, { fromDir });
      if (dir) {
        const { binDir, bin } = resolveBinInfo(name, dir);
        return {
          name,
          dir,
          entry: readManifestEntry(dir),
          binDir,
          bin,
          strategy: 'manual',
          fromDir,
        };
      }
    }
  }
  return null;
}

module.exports = {
  DEFAULT_CANDIDATES,
  resolveModuleEntry,
  packageRootFromEntry,
  readManifestEntry,
  resolveBinInfo,
  findClosestModuleDir,
  findCopilot,
};
