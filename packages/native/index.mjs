// ESM entry point — loads the shared CommonJS core via createRequire and
// re-exports it as named ESM bindings. One implementation, two formats.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./src/core.cjs');

export const DEFAULT_CANDIDATES = core.DEFAULT_CANDIDATES;
export const resolveModuleEntry = core.resolveModuleEntry;
export const packageRootFromEntry = core.packageRootFromEntry;
export const readManifestEntry = core.readManifestEntry;
export const resolveBinInfo = core.resolveBinInfo;
export const findClosestModuleDir = core.findClosestModuleDir;
export const findCopilot = core.findCopilot;

export default core;
