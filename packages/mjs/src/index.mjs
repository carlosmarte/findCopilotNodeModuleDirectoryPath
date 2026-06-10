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

/**
 * Codes meaning "Node produced no entry path" — package absent, OR installed
 * but its `exports`/`main` blocks resolution (e.g. `@github/copilot` exposes no
 * `.` export). All degrade to the manual walk instead of throwing.
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
 * Best-effort entry for a package whose `exports` blocks native resolution:
 * read its package.json and probe main / module / bin (first value) / index.js.
 * @param {string} dir
 * @returns {string|null}
 */
export function readManifestEntry(dir) {
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
 * Resolve the `.bin` directory of the node_modules containing the found
 * package, plus a map of the package's declared bin names → shim paths under
 * it. npm links every `bin` entry into `<node_modules>/.bin/<name>`.
 * @param {string} moduleName
 * @param {string} dir Package root directory.
 * @returns {{ binDir: string, bin: Record<string, string> }}
 */
export function resolveBinInfo(moduleName, dir) {
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
    if (err && NOT_RESOLVABLE.has(err.code)) return null;
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
    if (err && NOT_RESOLVABLE.has(err.code)) return null;
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
