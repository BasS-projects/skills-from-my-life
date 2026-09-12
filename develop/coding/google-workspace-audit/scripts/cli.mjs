#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { json, validateConfig, safeError } from './src/common.mjs';
import { collect } from './src/collect.mjs';
import { analyze, inspect, trace } from './src/analyze.mjs';
import { DemoReader, demoConfig } from './src/demo.mjs';
import { loadOAuth, GoogleReader } from './src/google.mjs';

const help = `Google Workspace read-only audit (Node 22+)
  node cli.mjs demo --out ../runs/demo
  node cli.mjs audit --config ../config.local.json --out ../runs/live [--resume]
  node cli.mjs analyze --out ../runs/live
  node cli.mjs inspect --out ../runs/live --book ID --sheet 'Sheet name' --range A1:C20 [--offset 0 --limit 100]
  node cli.mjs trace --out ../runs/live --node 'cell:ID:0:B2' [--direction upstream --depth 4 --limit 100]
Live credentials: GOOGLE_OAUTH_TOKEN_FILE or GOOGLE_OAUTH_TOKEN_JSON.
Reports stay in the output directory. This program never writes to Google files.`;
try {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries(['out', 'config', 'book', 'sheet', 'range', 'node', 'direction', 'depth', 'limit', 'offset'].map(k => [k, { type: 'string' }]).concat([['resume', { type: 'boolean' }], ['help', { type: 'boolean' }]])) });
  const command = positionals[0];
  if (args.help || !command) { console.log(help); process.exit(0); }
  if (positionals.length !== 1 || !['demo', 'audit', 'analyze', 'inspect', 'trace'].includes(command)) throw new Error(help);
  if (!args.out) throw new Error('Provide --out.');
  const out = resolve(args.out);
  let result;
  if (command === 'demo') { await collect(demoConfig, new DemoReader(), out, { mode: 'demo', resume: args.resume }); result = await analyze(out); }
  if (command === 'audit') {
    if (!args.config) throw new Error('Provide --config.');
    const config = validateConfig(await json(resolve(args.config)));
    let reader;
    try { reader = new GoogleReader(config, await loadOAuth()); await reader.authorize(); }
    catch (e) { throw new Error(safeError(e)); }
    await collect(config, reader, out, { resume: args.resume, progress: p => { if (p.pages % 25 === 0) process.stderr.write(`Read ${p.pages} pages; ${p.errors} errors.\n`); } });
    result = await analyze(out);
  }
  if (command === 'analyze') result = await analyze(out);
  if (command === 'inspect') result = await inspect(out, { book: args.book, sheet: args.sheet, range: args.range, offset: Number(args.offset ?? 0), limit: Number(args.limit ?? 100) });
  if (command === 'trace') result = trace(await json(join(out, 'graph.json')), args.node, { direction: args.direction ?? 'downstream', depth: Number(args.depth ?? 4), limit: Number(args.limit ?? 100) });
  console.log(JSON.stringify(['demo', 'audit', 'analyze'].includes(command) ? { status: result.status, coverage: result.coverage, formulas: result.formulas, functions: result.functions, issueCount: result.issueCount, report: join(out, 'report.html') } : result, null, 2));
  if (result.status === 'partial') process.exitCode = 2;
} catch (e) { console.error(e.message); process.exitCode = 1; }
