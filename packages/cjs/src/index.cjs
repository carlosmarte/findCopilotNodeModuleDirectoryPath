'use strict';

/**
 * @findcopilot/cjs — CommonJS resolver for the closest installed
 * `@github/copilot*` module.
 *
 * Two strategies, both built on Node core only (no dependencies):
 *
 *   1. Native    — `require.resolve(name, { paths: [fromDir] })`. Node's own
 *                  module-resolution algorithm walks the `node_modules`
 *                  hierarchy upward from `fromDir`. Requires the package to
 *                  expose a resolvable entry (`main`/`exports`).
 *   2. Manual    — walk up the directory tree checking for
 *                  `<dir>/node_modules/<name>`. Works even when the package
 *                  has no `main`/`exports` field (e.g. data-only packages).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Default candidate package names, in priority order. The bare `@github/copilot`
 * is tried first, then the SDK, then the language server.
 * @type {string[]}
 */
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

/**
 * Resolve a module's entry file using Node's native resolution.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null} Absolute path to the entry file, or null if not found.
 */
function resolveModuleEntry(moduleName, opts = {}) {
  const fromDir = opts.fromDir || process.cwd();
  try {
    return require.resolve(moduleName, { paths: [fromDir] });
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/**
 * Given a resolved entry file, derive the package's root directory. Anchors on
 * the `node_modules/<name>` marker (handles scoped names), then falls back to
 * resolving the package's own `package.json`.
 * @param {string} moduleName
 * @param {string|null} entry
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
function packageRootFromEntry(moduleName, entry, opts = {}) {
  if (!entry) return null;
  const marker = path.join('node_modules', ...moduleName.split('/'));
  const idx = entry.lastIndexOf(marker);
  if (idx !== -1) return entry.slice(0, idx + marker.length);

  // Fallback: some entries live outside a node_modules/<name> path (linked,
  // pnpm store, etc.). Resolve the manifest directly.
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

/**
 * Manually walk up the directory tree looking for `node_modules/<name>`.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null} Absolute path to the module directory, or null.
 */
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

/**
 * @typedef {Object} FindResult
 * @property {string} name      The candidate name that matched.
 * @property {string|null} dir  The package root directory.
 * @property {string|null} entry The native entry file (null for manual hits).
 * @property {'native'|'manual'} strategy
 * @property {string} fromDir
 */

/**
 * Find the closest installed copilot module across a list of candidates.
 * @param {{ candidates?: string|string[], fromDir?: string, strategy?: 'auto'|'native'|'manual' }} [opts]
 * @returns {FindResult|null}
 */
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
