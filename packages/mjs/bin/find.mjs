#!/usr/bin/env node

import { findCopilot, DEFAULT_CANDIDATES } from '../src/index.mjs';

const HELP = `find-copilot-mjs — locate the closest installed @github/copilot* module (ESM)

Usage:
  find-copilot-mjs [options] [moduleName ...]

Options:
  --from <dir>   Directory to resolve from (default: cwd)
  --native       Native strategy only (createRequire/require.resolve)
  --manual       Manual strategy only (node_modules walk)
  --json         Emit JSON
  -h, --help     Show this help

Defaults to the candidate list (first match wins):
  ${DEFAULT_CANDIDATES.join('\n  ')}`;

function parseArgs(argv) {
  const opts = { fromDir: process.cwd(), strategy: 'auto', json: false, names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') opts.fromDir = argv[++i];
    else if (a === '--native') opts.strategy = 'native';
    else if (a === '--manual') opts.strategy = 'manual';
    else if (a === '--json') opts.json = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts.names.push(a);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  process.stdout.write(HELP + '\n');
} else {
  const result = findCopilot({
    candidates: opts.names.length ? opts.names : undefined,
    fromDir: opts.fromDir,
    strategy: opts.strategy,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result ? 0 : 1;
  } else if (!result) {
    process.stderr.write('❌ No @github/copilot* module found in any parent node_modules.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`✅ ${result.name} found (${result.strategy})\n`);
    process.stdout.write(`   dir:   ${result.dir}\n`);
    if (result.entry) process.stdout.write(`   entry: ${result.entry}\n`);
  }
}
