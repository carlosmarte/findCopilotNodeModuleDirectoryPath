# @findcopilot/native

Native **dual-format** resolver for the closest installed `@github/copilot*`
module — one implementation, consumed from both CommonJS and ESM, **no build step**.

```js
const { findCopilot } = require('@findcopilot/native'); // CJS consumer → index.cjs
import { findCopilot } from '@findcopilot/native';      // ESM consumer → index.mjs
```

Both entry points resolve to the **same** logic:

```
src/core.cjs   ← single source of truth (CommonJS, node:fs / node:path only)
index.cjs      → module.exports = require('./src/core.cjs')
index.mjs      → createRequire(import.meta.url)('./src/core.cjs'), re-exported
package.json   → exports map picks the right wrapper per consumer condition:
                 { "require": "./index.cjs", "import": "./index.mjs" }
```

This is the canonical zero-transpile dual-package pattern: the core is authored
once in CJS, the ESM wrapper loads it via `createRequire`, and Node's `exports`
conditions route each consumer to the correct entry. No duplicate logic, no
dual-package hazard (both sides share the one CJS module instance).

API is identical to the [CJS](../cjs) and [MJS](../mjs) twins
(`findCopilot`, `findClosestModuleDir`, `resolveModuleEntry`,
`packageRootFromEntry`, `DEFAULT_CANDIDATES`).

CLI: `find-copilot [--from <dir>] [--native|--manual] [--json] [name ...]`

See the [repo root README](../../README.md) for the full API.
