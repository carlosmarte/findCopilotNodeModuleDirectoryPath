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

/**
 * Error codes that mean "Node could not produce an entry path" — either the
 * package is absent, or it IS installed but its `exports`/`main` field blocks
 * resolution of the requested path (e.g. `@github/copilot` exposes no `.`
 * export). All of these should degrade to the manual walk, never throw.
 * @type {Set<string>}
 */
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

/**
 * Best-effort entry path for a package whose `exports` blocks native
 * resolution: read its own `package.json` and probe `main` / `module` / `bin`
 * (first value) / `index.js`, returning the first that exists on disk.
 * @param {string} dir Package root directory.
 * @returns {string|null}
 */
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

/**
 * Resolve the `.bin` directory of the `node_modules` that directly contains the
 * found package, plus the package's bin shims. npm links every `bin` entry into
 * `<node_modules>/.bin/<name>`, so this maps each declared bin name to its shim.
 *
 * For `@github/copilot` at `.../node_modules/@github/copilot`, the parent
 * `node_modules` is two levels up (scoped name = two segments), and `.bin` is
 * its sibling: `.../node_modules/.bin`.
 *
 * @param {string} moduleName
 * @param {string} dir Package root directory.
 * @returns {{ binDir: string, bin: Record<string, string> }}
 */
function resolveBinInfo(moduleName, dir) {
  const segments = moduleName.split('/');
  // Climb out of the package back to its containing node_modules.
  const nodeModulesDir = path.resolve(dir, ...segments.map(() => '..'));
  const binDir = path.join(nodeModulesDir, '.bin');
  const bin = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (typeof pkg.bin === 'string') {
      // String form: the bin name is the package's unscoped name.
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

/**
 * Resolve a module's entry file using Node's native resolution. Returns null
 * (rather than throwing) when the package is absent OR when it is installed but
 * its `exports`/`main` field does not expose an importable entry.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null} Absolute path to the entry file, or null.
 */
function resolveModuleEntry(moduleName, opts = {}) {
  const fromDir = opts.fromDir || process.cwd();
  try {
    return require.resolve(moduleName, { paths: [fromDir] });
  } catch (err) {
    if (err && NOT_RESOLVABLE.has(err.code)) return null;
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
 * @property {string|null} entry The entry file (native, or best-effort for manual hits).
 * @property {string|null} binDir The `.bin` dir of the containing node_modules.
 * @property {Record<string,string>} bin Map of bin name → shim path in `.bin`.
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
