# @findcopilot/mjs

ES Module resolver for the closest installed `@github/copilot*` module.

```js
import { findCopilot } from "@findcopilot/mjs";
resolveFromHere("@github/copilot").bin.copilot;
```

```js
import {
  findCopilot,
  resolveModuleEntry,
  resolveFromHere,
} from "@findcopilot/mjs";

findCopilot({ fromDir: import.meta.dirname }); // { name, dir, entry, strategy, fromDir } | null
resolveModuleEntry("@github/copilot-sdk", { fromDir }); // anchored at fromDir
resolveFromHere("@github/copilot"); // import.meta.resolve, relative to this module
```

ESM has no implicit `require`, so native resolution is offered two ways:

- `resolveModuleEntry(name, { fromDir })` — `createRequire(fromDir)` then
  `require.resolve`. Portable, anchors at an arbitrary directory, Node 18+.
- `resolveFromHere(name)` — pure-ESM `import.meta.resolve`, resolves relative to
  the library module. Node 20.6+.

The **manual** walk (`findClosestModuleDir`) uses only `node:fs` / `node:path`.

CLI: `find-copilot-mjs [--from <dir>] [--native|--manual] [--json] [name ...]`

See the [repo root README](../../README.md) for the full API and the CJS / native twins.
