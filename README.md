# findCopilotNodeModuleDirectoryPath

Polyglot Node packages that locate the **closest installed `@github/copilot*` module
directory** from any starting point — built three ways so you can drop the one that
matches your module system:

| Package | Format | Native resolver | Use when |
| --- | --- | --- | --- |
| [`@findcopilot/cjs`](packages/cjs) | CommonJS | `require.resolve(name, { paths })` | Your code is `require()`-based |
| [`@findcopilot/mjs`](packages/mjs) | ES Module | `createRequire` / `import.meta.resolve` | Your code is `import`-based |
| [`@findcopilot/native`](packages/native) | **Dual (CJS + ESM)** | shared core, picked by `exports` conditions | A library consumed both ways, zero build |

All three expose the **same API** and find the module **two ways**:

1. **Native** — Node's own module-resolution algorithm walks the `node_modules`
   hierarchy upward. Needs a resolvable entry (`main`/`exports`).
2. **Manual** — walk up the directory tree checking for `node_modules/<name>`.
   Works even for packages with no `main`/`exports` (data-only packages).

The default candidate list is tried first-match-wins:
`@github/copilot` → `@github/copilot-sdk` → `@github/copilot-language-server`.

## Layout

```
packages/
  cjs/     @findcopilot/cjs     — require.resolve + manual walk
  mjs/     @findcopilot/mjs     — createRequire / import.meta.resolve + manual walk
  native/  @findcopilot/native  — one CJS core, re-exported to both CJS and ESM
```

## API

Every package exports:

```ts
DEFAULT_CANDIDATES: string[]
resolveModuleEntry(name, { fromDir? }): string | null      // native entry file
packageRootFromEntry(name, entry, { fromDir? }): string | null
findClosestModuleDir(name, { fromDir? }): string | null    // manual walk
findCopilot({ candidates?, fromDir?, strategy? }): FindResult | null
// strategy: 'auto' (default) | 'native' | 'manual'
```

`@findcopilot/mjs` additionally exports `resolveFromHere(name)` — pure-ESM
`import.meta.resolve`, relative to the library module (Node 20.6+).

`FindResult = { name, dir, entry, strategy, fromDir }`.

### CommonJS

```js
const { findCopilot } = require('@findcopilot/cjs');
const hit = findCopilot();          // { name, dir, entry, strategy: 'native', ... }
console.log(hit?.dir);
```

### ES Module

```js
import { findCopilot } from '@findcopilot/mjs';
const hit = findCopilot({ fromDir: import.meta.dirname });
console.log(hit?.dir);
```

### Native dual-format

```js
const { findCopilot } = require('@findcopilot/native'); // CJS consumer
import { findCopilot } from '@findcopilot/native';      // ESM consumer — same core
```

## CLI

Each package ships a `bin`:

```bash
find-copilot-cjs   [--from <dir>] [--native|--manual] [--json] [name ...]
find-copilot-mjs   [--from <dir>] [--native|--manual] [--json] [name ...]
find-copilot       [--from <dir>] [--native|--manual] [--json] [name ...]   # native pkg
```

```
$ find-copilot
✅ @github/copilot found (native)
   dir:   /path/to/node_modules/@github/copilot
   entry: /path/to/node_modules/@github/copilot/index.js
```

Exit code is `0` on a hit, `1` when nothing is found.

## Develop

```bash
npm install        # wires the workspaces
npm test           # runs node --test across all three packages
```

This repo is an npm-workspaces monorepo — no dependencies, Node 18.17+.
