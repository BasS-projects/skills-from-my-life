import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { collect } from '../src/collect.mjs';
import { analyze, inspect, trace } from '../src/analyze.mjs';
import { DemoReader, demoConfig } from '../src/demo.mjs';
import { json, writeJson } from '../src/common.mjs';
const temp = async t => { const dir = await mkdtemp(join(tmpdir(), 'workspace-audit-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };

test('end-to-end synthetic audit covers hidden and blank cells, raw formulas, zero/false and script sources', async t => {
  const out = await temp(t);
  const state = await collect(demoConfig, new DemoReader(), out, { mode: 'demo' });
  assert.equal(state.status, 'complete');
  assert.equal(state.coverage.coveredCells, 60);
  const summary = await analyze(out);
  assert.equal(summary.formulas, 6);
  assert.equal(summary.functions, 4);
  assert.equal(summary.sheets.find(s => s.title === 'Config').hidden, true);
  const values = await inspect(out, { book: 'demo_book', sheet: 'Inputs', range: 'B4:B5', limit: 1 });
  assert.equal(values.cells[0].userEnteredValue.numberValue, 0);
  assert.equal(values.nextOffset, 1);
  assert.equal((await inspect(out, { book: 'demo_book', sheet: 'Inputs', range: 'B4:B5', offset: 1 })).cells[0].userEnteredValue.boolValue, false);
  const graph = await json(join(out, 'graph.json'));
  assert.ok(graph.edges.some(e => e.relation === 'script-write' && e.certainty === 'static-possible'));
  assert.ok(graph.edges.some(e => e.relation === 'named-range'));
  assert.ok(graph.edges.some(e => e.relation === 'custom-function-candidate'));
  assert.ok(trace(graph, 'cell:demo_book:1:B2').nodes.some(n => n.a1 === 'B4'));
  const html = await readFile(join(out, 'report.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  assert.doesNotThrow(() => JSON.parse(scripts[0][1]));
  assert.ok(JSON.parse(scripts[0][1]).graph.nodes.some(n => n.note?.includes('</script>')));
  assert.doesNotThrow(() => new Script(scripts[1][1]));
});
test('failed page is explicit partial, resume reads only missing page, saved corruption is rejected', async t => {
  const out = await temp(t); let reads = 0;
  class Flaky extends DemoReader { async page(...args) { if (++reads === 2) throw new Error('synthetic failure'); return super.page(...args); } }
  const first = await collect(demoConfig, new Flaky(), out, { mode: 'demo' });
  assert.equal(first.status, 'partial');
  assert.equal(first.errors.length, 1);
  const originalReads = reads;
  const resumed = await collect(demoConfig, new Flaky(), out, { mode: 'demo', resume: true });
  assert.equal(resumed.status, 'complete');
  assert.equal(reads - originalReads, 1);
  const key = Object.keys(resumed.pages)[0];
  await writeJson(join(out, 'pages', key + '.json'), {});
  await assert.rejects(() => collect(demoConfig, new DemoReader(), out, { mode: 'demo', resume: true }), /corrupt/);
});
test('missing spreadsheet metadata cannot be reported as complete', async t => {
  const out = await temp(t);
  class Denied extends DemoReader { async metadata() { throw new Error('denied'); } }
  const state = await collect(demoConfig, new Denied(), out, { mode: 'demo' });
  assert.equal(state.status, 'partial');
  assert.equal(state.coverage.spreadsheetsRead, 0);
  assert.equal(state.coverage.spreadsheetsExpected, 1);
});
test('malformed metadata cannot silently turn an incomplete audit into a zero-cell success', async t => {
  const out = await temp(t);
  class Malformed extends DemoReader { async metadata() { return {}; } }
  const state = await collect(demoConfig, new Malformed(), out, { mode: 'demo' });
  assert.equal(state.status, 'partial');
  assert.equal(state.coverage.spreadsheetsRead, 0);
});
test('MCP client can discover tools, page cells, follow links and read source without credentials', async t => {
  const out = await temp(t);
  await collect(demoConfig, new DemoReader(), out, { mode: 'demo' });
  await analyze(out);
  const client = new Client({ name: 'audit-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../mcp.mjs', import.meta.url))], env: { PATH: process.env.PATH, AUDIT_SNAPSHOT: out }, stderr: 'pipe' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 6);
  assert.ok(tools.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
  const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.ok(!result.isError); return JSON.parse(result.content[0].text); };
  assert.equal((await call('audit_summary')).status, 'complete');
  assert.equal((await call('audit_cells', { book: 'demo_book', sheet: 'Summary', range: 'B2' })).cells[0].userEnteredValue.formulaValue, '=SUM(Inputs!B2:B4)');
  assert.ok((await call('audit_nodes', { query: 'DOUBLE' })).nodes.length > 0);
  assert.ok((await call('audit_trace', { node: 'cell:demo_book:1:B2' })).nodes.length > 1);
  assert.equal((await call('audit_script_source', { script: 'demo_script', file: 'Code', limit: 1 })).lines.length, 1);
  assert.ok((await client.callTool({ name: 'audit_script_source', arguments: { script: '../outside', file: 'Code' } })).isError);
});
