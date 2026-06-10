# @findcopilot/cjs

CommonJS resolver for the closest installed `@github/copilot*` module.

```js
const { findCopilot, findClosestModuleDir, resolveModuleEntry } = require('@findcopilot/cjs');

findCopilot();                                  // { name, dir, entry, strategy, fromDir } | null
resolveModuleEntry('@github/copilot-sdk');      // entry file via require.resolve | null
findClosestModuleDir('@github/copilot');        // package dir via node_modules walk | null
```

- **Native** strategy uses `require.resolve(name, { paths: [fromDir] })`.
- **Manual** strategy walks parent directories for `node_modules/<name>` — works
  even when the package has no `main`/`exports`.

CLI: `find-copilot-cjs [--from <dir>] [--native|--manual] [--json] [name ...]`

See the [repo root README](../../README.md) for the full API and the MJS / native twins.
