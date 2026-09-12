import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { cells } from './collect.mjs';
import { json, hash, writeJson, bounds, overlaps, canonicalRange, gridA1 } from './common.mjs';
import { scanFormula, formulaPattern } from './formulas.mjs';
import { analyzeScripts } from './script-analysis.mjs';
import { renderReport } from './report.mjs';

export const sheetKey = (book, sheet) => `sheet:${book}:${sheet}`;
export const rangeKey = (book, sheet, a1) => `${canonicalRange(a1).includes(':') ? 'range' : 'cell'}:${book}:${sheet}:${canonicalRange(a1)}`;

export async function analyze(out) {
  const manifest = await json(join(out, 'manifest.json'));
  if (manifest.schemaVersion !== 1 || !['complete', 'partial'].includes(manifest.status)) throw new Error('Collect a completed or explicitly partial snapshot first.');
  const sheets = new Map(), nodes = new Map(), edges = new Map(), populated = new Map(), groups = new Map();
  const issues = manifest.errors.map(e => ({ kind: 'collection', ...e }));
  const addEdge = (source, target, relation, evidence, certainty = 'static') => {
    const key = hash([source, target, relation, evidence]);
    edges.set(key, { id: key, source, target, relation, evidence, certainty });
  };
  for (const book of manifest.spreadsheets) for (const s of book.metadata.sheets ?? []) {
    const p = s.properties, id = sheetKey(book.id, p.sheetId);
    const entry = { id, book: book.id, bookTitle: book.metadata.properties?.title ?? book.id, sheetId: p.sheetId, title: p.title, hidden: p.hidden ?? false, dimensions: p.gridProperties, populatedCells: 0, formulas: 0, errors: 0 };
    sheets.set(id, entry);
    nodes.set(id, { ...entry, kind: 'sheet', label: `${entry.bookTitle} / ${p.title}` });
  }
  const targetRange = (book, title, a1, context) => {
    const sheet = [...sheets.values()].find(s => s.book === book && s.title.toLocaleLowerCase() === title.toLocaleLowerCase());
    const box = bounds(a1);
    if (!sheet || !box) {
      issues.push({ kind: 'unresolved-range', context, book, sheet: title, a1, reason: 'Unknown sheet, unconfigured spreadsheet, or unsupported range syntax.' });
      return null;
    }
    const id = rangeKey(book, sheet.sheetId, a1);
    if (!nodes.has(id)) nodes.set(id, { id, kind: id.startsWith('cell:') ? 'cell' : 'range', parent: sheet.id, book, sheetId: sheet.sheetId, sheet: title, a1: canonicalRange(a1), label: `${sheet.title}!${canonicalRange(a1)}` });
    return id;
  };
  for await (const cell of cells(out, manifest)) {
    const sheet = sheets.get(sheetKey(cell.spreadsheetId, cell.sheetId));
    if (!sheet) throw new Error('Snapshot cell has no matching sheet metadata.');
    sheet.populatedCells++;
    const key = rangeKey(cell.spreadsheetId, cell.sheetId, cell.a1);
    populated.set(key, cell);
    if (cell.effectiveValue?.errorValue) sheet.errors++;
    if (!cell.userEnteredValue?.formulaValue) continue;
    sheet.formulas++;
    const formula = cell.userEnteredValue.formulaValue;
    targetRange(cell.spreadsheetId, sheet.title, cell.a1, key);
    Object.assign(nodes.get(key), { formula });
    const book = manifest.spreadsheets.find(b => b.id === cell.spreadsheetId);
    const names = (book.metadata.namedRanges ?? []).map(n => ({ name: n.name, range: n.range }));
    const parsed = scanFormula(formula, sheet.title, names);
    for (const reason of parsed.issues) issues.push({ kind: 'formula', node: key, reason });
    for (const ref of parsed.refs) {
      const source = targetRange(cell.spreadsheetId, ref.sheet, ref.a1, key);
      if (source) addEdge(source, key, 'formula-reference', { formulaCell: key, token: formula.slice(ref.start, ref.end) });
    }
    for (const named of parsed.namedRefs) {
      const owner = sheets.get(sheetKey(cell.spreadsheetId, named.range.sheetId));
      const a1 = gridA1(named.range, owner?.dimensions);
      if (!owner || !a1) { issues.push({ kind: 'named-range', node: key, reason: `Cannot resolve ${named.name}.` }); continue; }
      const source = targetRange(cell.spreadsheetId, owner.title, a1, key);
      if (source) addEdge(source, key, 'named-range', { name: named.name, formulaCell: key });
    }
    nodes.get(key).functions = parsed.functions;
    const pattern = formulaPattern(formula, parsed.refs, cell.row, cell.col);
    const groupKey = hash([sheet.id, pattern]);
    const group = groups.get(groupKey) ?? { sheet: sheet.id, pattern, count: 0, examples: [] };
    group.count++;
    if (group.examples.length < 3) group.examples.push({ a1: cell.a1, formula });
    groups.set(groupKey, group);
  }
  const projects = [];
  for (const spec of Object.values(manifest.scripts)) {
    if (!/^[A-Za-z0-9_-]+$/.test(spec.id)) throw new Error('Invalid snapshot script ID.');
    const data = await json(join(out, 'scripts', `${spec.id}.json`));
    if (hash(data) !== spec.hash) throw new Error('Snapshot script integrity check failed.');
    projects.push({ ...spec, files: data.files });
  }
  const scriptAnalysis = analyzeScripts(projects);
  issues.push(...scriptAnalysis.issues.map(i => ({ kind: 'script', ...i })));
  for (const fn of scriptAnalysis.functions) {
    nodes.set(fn.id, { ...fn, kind: 'function', label: `${fn.file}.${fn.name}` });
    issues.push(...fn.issues.map(i => ({ kind: 'script', node: fn.id, ...i })));
    for (const [direction, refs] of [['read', fn.reads], ['write', fn.writes]]) for (const ref of refs) {
      const range = targetRange(ref.book, ref.sheet, ref.a1, fn.id);
      if (range) addEdge(direction === 'read' ? range : fn.id, direction === 'read' ? fn.id : range, `script-${direction}`, { scriptId: fn.scriptId, file: fn.file, line: ref.line }, 'static-possible');
    }
  }
  for (const fn of scriptAnalysis.functions) for (const call of fn.calls) {
    const candidates = scriptAnalysis.functions.filter(f => f.scriptId === fn.scriptId && f.name === call.name);
    for (const other of candidates) addEdge(fn.id, other.id, 'calls', { file: fn.file, line: call.line }, 'static-possible');
    if (candidates.length > 1) issues.push({ kind: 'script', node: fn.id, reason: `Ambiguous function name ${call.name}.` });
  }
  for (const node of nodes.values()) {
    const cell = populated.get(node.id);
    if (cell) Object.assign(node, { effectiveValue: cell.effectiveValue, formattedValue: cell.formattedValue, enteredValue: cell.userEnteredValue, note: cell.note });
    for (const name of node.functions ?? []) {
      const candidates = scriptAnalysis.functions.filter(f => f.name.toUpperCase() === name && projects.find(p => p.id === f.scriptId)?.spreadsheetId === node.book);
      for (const fn of candidates) addEdge(fn.id, node.id, 'custom-function-candidate', { formulaCell: node.id, name }, 'static-possible');
    }
  }
  const graph = { schemaVersion: 1, direction: 'Input → formula; range → script read; script → potential write; caller → callee.', nodes: [...nodes.values()], edges: [...edges.values()], issues };
  const summary = {
    schemaVersion: 1, mode: manifest.mode, status: manifest.status, coverage: manifest.coverage,
    startedAt: manifest.startedAt, finishedAt: manifest.finishedAt,
    sheets: [...sheets.values()], populatedCells: populated.size,
    formulas: [...sheets.values()].reduce((n, s) => n + s.formulas, 0),
    formulaGroups: [...groups.values()].sort((a, b) => b.count - a.count),
    functions: scriptAnalysis.functions.length, nodes: nodes.size, edges: edges.size, issueCount: issues.length,
    limitations: [manifest.consistency, 'Empty cells are covered by requested rectangles; only returned populated cells occupy storage.', 'Formula parsing covers A1 and named ranges. Dynamic references, structured tables and array spill ownership remain unresolved.', 'Script links are static possibilities, not proof that code ran. Triggers, libraries, properties and runtime permissions are not fetched.', 'Charts and validation metadata are collected; their dependencies are not analyzed.'],
  };
  await writeJson(join(out, 'graph.json'), graph);
  await writeJson(join(out, 'summary.json'), summary);
  const clean = x => String(x).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
  const md = [`# Google Workspace audit (${summary.mode})`, '', `Collection: **${summary.status}**. ${summary.coverage.coveredCells}/${summary.coverage.expectedCells} grid cells covered in readable spreadsheets.`, `Spreadsheets: ${summary.coverage.spreadsheetsRead}/${summary.coverage.spreadsheetsExpected}; scripts: ${summary.coverage.scriptsRead}/${summary.coverage.scriptsExpected}.`, '', `${summary.populatedCells} populated cells; ${summary.formulas} formulas; ${summary.functions} script functions; ${summary.edges} static links; ${summary.issueCount} issues to review.`, '', '| Spreadsheet / sheet | Hidden | Populated | Formulas | Errors |', '|---|---|---:|---:|---:|', ...summary.sheets.map(s => `| ${clean(s.bookTitle)} / ${clean(s.title)} | ${s.hidden} | ${s.populatedCells} | ${s.formulas} | ${s.errors} |`), '', '## Interpretation', '', graph.direction, '', ...summary.limitations.map(x => `- ${x}`), '', 'Open report.html to explore links. Inspect raw cells with the inspect command; graph.json contains all extracted relationships and unresolved items.', ''];
  await writeFile(join(out, 'report.md'), md.join('\n'), { mode: 0o600 });
  await writeFile(join(out, 'report.html'), renderReport(summary, graph), { mode: 0o600 });
  return summary;
}

export async function inspect(out, { book, sheet, range = 'A1:ZZZ10000000', offset = 0, limit = 100 }) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Use offset >= 0 and limit between 1 and 1000.');
  const box = bounds(range);
  if (!box) throw new Error('Invalid A1 range.');
  const manifest = await json(join(out, 'manifest.json'));
  const meta = manifest.spreadsheets.find(b => b.id === book)?.metadata.sheets.find(s => s.properties.title === sheet);
  if (!meta) throw new Error('Unknown configured spreadsheet or sheet.');
  const result = []; let total = 0;
  for await (const cell of cells(out, manifest)) {
    if (cell.spreadsheetId !== book || cell.sheetId !== meta.properties.sheetId || !overlaps(box, bounds(cell.a1))) continue;
    if (total >= offset && result.length < limit) result.push(cell);
    total++;
  }
  return { status: manifest.status, range, totalPopulatedMatches: total, cells: result, nextOffset: offset + result.length < total ? offset + result.length : null, emptyCells: 'Omitted; consult manifest coverage before assuming blanks.' };
}

export function trace(graph, id, { direction = 'downstream', depth = 4, limit = 100 } = {}) {
  if (!['downstream', 'upstream'].includes(direction) || !Number.isInteger(depth) || depth < 0 || depth > 20 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid trace parameters.');
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  if (!byId.has(id)) throw new Error('Unknown graph node ID.');
  const seen = new Set([id]), result = new Map(), queue = [[id, 0]]; let truncated = false;
  const add = (edge, next, level) => {
    if (!seen.has(next) && seen.size >= limit) { truncated = true; return; }
    result.set(edge.id, edge);
    if (!seen.has(next)) { seen.add(next); queue.push([next, level + 1]); }
  };
  for (let i = 0; i < queue.length; i++) {
    const [current, level] = queue[i], node = byId.get(current);
    const direct = graph.edges.filter(e => (direction === 'downstream' ? e.source : e.target) === current);
    const overlapping = graph.nodes.filter(other => node.a1 && other.a1 && node.id !== other.id && node.parent === other.parent && (node.kind === 'range' || other.kind === 'range') && overlaps(bounds(node.a1), bounds(other.a1)));
    if (level >= depth) { if (direct.some(e => !seen.has(direction === 'downstream' ? e.target : e.source)) || overlapping.some(n => !seen.has(n.id))) truncated = true; continue; }
    for (const edge of direct) add(edge, direction === 'downstream' ? edge.target : edge.source, level);
    // Range membership is a geometric relationship, never an execution claim.
    for (const other of overlapping) {
      const edge = { id: hash(['overlap', current, other.id]), source: current, target: other.id, relation: 'range-overlap', certainty: 'geometric' };
      add(edge, other.id, level);
    }
  }
  return { direction, nodes: [...seen].map(n => byId.get(n)), edges: [...result.values()], truncated, depth, limit, note: 'Range overlap gives potential impact. It does not imply every cell affects every other cell in the range.' };
}
