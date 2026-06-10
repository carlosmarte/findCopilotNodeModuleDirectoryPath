/**
 * @findcopilot/mjs — ES Module resolver for the closest installed
 * `@github/copilot*` module.
 *
 * ESM has no implicit `require`, so native resolution is done two ways:
 *
 *   1. `createRequire(fromDir)` — anchor a CommonJS-style `require.resolve`
 *      at an arbitrary directory. This is the portable choice and works on
 *      Node 18+. It is what `resolveModuleEntry()` uses.
 *   2. `import.meta.resolve(name)` — the pure-ESM native resolver (stable and
 *      synchronous since Node 20.6). It resolves relative to THIS module's
 *      location, so it is exposed separately as `resolveFromHere()`.
 *
 * The manual `node_modules` walk is identical in spirit to the CJS twin and
 * uses only `node:fs` / `node:path`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** @type {string[]} */
export const DEFAULT_CANDIDATES = [
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
 * Resolve a module's entry file natively, anchored at `fromDir`, via
 * `createRequire`. Works on Node 18+.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
export function resolveModuleEntry(moduleName, opts = {}) {
  const fromDir = path.resolve(opts.fromDir || process.cwd());
  // createRequire wants a file (or file: URL) to anchor resolution; the file
  // need not exist — only its directory is used as the lookup base.
  const require = createRequire(path.join(fromDir, 'noop.cjs'));
  try {
    return require.resolve(moduleName);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/**
 * Pure-ESM native resolution via `import.meta.resolve`, relative to THIS
 * module. Returns an absolute file path (file: URL converted), or null.
 * Requires Node 20.6+.
 * @param {string} moduleName
 * @returns {string|null}
 */
export function resolveFromHere(moduleName) {
  try {
    if (typeof import.meta.resolve !== 'function') return null;
    const url = import.meta.resolve(moduleName);
    return url.startsWith('file:') ? fileURLToPath(url) : url;
  } catch (err) {
    if (err && (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND')) {
      return null;
    }
    throw err;
  }
}

/**
 * Derive the package root from a resolved entry file.
 * @param {string} moduleName
 * @param {string|null} entry
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
export function packageRootFromEntry(moduleName, entry, opts = {}) {
  if (!entry) return null;
  const marker = path.join('node_modules', ...moduleName.split('/'));
  const idx = entry.lastIndexOf(marker);
  if (idx !== -1) return entry.slice(0, idx + marker.length);

  try {
    const fromDir = path.resolve(opts.fromDir || process.cwd());
    const require = createRequire(path.join(fromDir, 'noop.cjs'));
    const manifest = require.resolve(`${moduleName}/package.json`);
    return path.dirname(manifest);
  } catch {
    return null;
  }
}

/**
 * Manually walk up the directory tree looking for `node_modules/<name>`.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
export function findClosestModuleDir(moduleName, opts = {}) {
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
 * Find the closest installed copilot module across a list of candidates.
 * @param {{ candidates?: string|string[], fromDir?: string, strategy?: 'auto'|'native'|'manual' }} [opts]
 * @returns {{ name: string, dir: string|null, entry: string|null, strategy: 'native'|'manual', fromDir: string }|null}
 */
export function findCopilot(opts = {}) {
  const fromDir = path.resolve(opts.fromDir || process.cwd());
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
