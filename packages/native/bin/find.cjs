#!/usr/bin/env node
'use strict';

const { findCopilot, DEFAULT_CANDIDATES } = require('../index.cjs');

const HELP = `find-copilot — locate the closest installed @github/copilot* module (native dual-format)

Usage:
  find-copilot [options] [moduleName ...]

Options:
  --from <dir>   Directory to resolve from (default: cwd)
  --native       Native strategy only (require.resolve)
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP + '\n');
    return;
  }

  const result = findCopilot({
    candidates: opts.names.length ? opts.names : undefined,
    fromDir: opts.fromDir,
    strategy: opts.strategy,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result ? 0 : 1;
    return;
  }

  if (!result) {
    process.stderr.write('❌ No @github/copilot* module found in any parent node_modules.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`✅ ${result.name} found (${result.strategy})\n`);
  process.stdout.write(`   dir:   ${result.dir}\n`);
  if (result.entry) process.stdout.write(`   entry: ${result.entry}\n`);
  if (result.binDir) process.stdout.write(`   .bin:  ${result.binDir}\n`);
  for (const [n, p] of Object.entries(result.bin || {})) {
    process.stdout.write(`   bin:   ${n} → ${p}\n`);
  }
}

main();
