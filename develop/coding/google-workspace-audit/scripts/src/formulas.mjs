import { columnNumber } from './common.mjs';

function maskStrings(formula) {
  let out = '', inside = false;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '"') {
      out += ' ';
      if (inside && formula[i + 1] === '"') { out += ' '; i++; }
      else inside = !inside;
    } else out += inside ? ' ' : ch;
  }
  return out;
}
const CELL = '\\$?[A-Za-z]{1,3}\\$?[1-9]\\d*';
const ENDPOINT = `(?:${CELL}|\\$?[A-Za-z]{1,3}|\\$?[1-9]\\d*)`;
const RANGE = `(?:${ENDPOINT}:${ENDPOINT}|${CELL})`;
const REFERENCE = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_.$!])(?:(?<sheet>'(?:[^']|'')+'|[\\p{L}\\p{M}_][\\p{L}\\p{M}\\p{N}_.]*)!)?(?<a1>${RANGE})(?![\\p{L}\\p{M}\\p{N}_]|\\s*\\()`, 'gu');
export function scanFormula(formula, currentSheet, names = []) {
  const masked = maskStrings(formula);
  const refs = [...masked.matchAll(REFERENCE)].map(m => ({
    sheet: m.groups.sheet ? (m.groups.sheet.startsWith("'") ? m.groups.sheet.slice(1, -1).replaceAll("''", "'") : m.groups.sheet) : currentSheet,
    a1: m.groups.a1, start: m.index, end: m.index + m[0].length,
  }));
  const functions = [...new Set([...masked.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)].map(m => m[1].toUpperCase()))];
  const issues = [];
  for (const fn of ['INDIRECT', 'OFFSET', 'IMPORTRANGE', 'IMPORTXML', 'IMPORTDATA', 'IMPORTHTML', 'GOOGLEFINANCE']) {
    if (functions.includes(fn)) issues.push(`${fn}: runtime or external references require additional evidence.`);
  }
  if (functions.some(x => ['ARRAYFORMULA', 'FILTER', 'QUERY', 'SEQUENCE', 'MAP', 'BYROW', 'BYCOL'].includes(x))) issues.push('Array output: dependencies are attached to the formula anchor; spill-cell ownership is not inferred.');
  const namedRefs = [];
  const shadowed = functions.includes('LET') || functions.includes('LAMBDA');
  for (const name of names) {
    const escaped = name.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_.])${escaped}(?![\\p{L}\\p{M}\\p{N}_.]|\\s*\\()`, 'giu');
    if ([...masked.matchAll(pattern)].some(m => !refs.some(r => m.index >= r.start && m.index < r.end))) {
      if (shadowed) issues.push(`Named range ${name.name}: possible LET/LAMBDA shadowing; review manually.`);
      else namedRefs.push(name);
    }
  }
  if (masked.includes('[')) issues.push('Structured/table reference is not resolved by the A1 parser.');
  return { refs, namedRefs, functions, issues };
}
export function formulaPattern(formula, refs, row, col) {
  let out = formula;
  for (const ref of [...refs].reverse()) {
    const value = ref.a1.toUpperCase().replace(/(\$?)([A-Z]+)(\$?)(\d+)?/g, (_, ca, c, ra, r) => `C${ca ? columnNumber(c) : `[${columnNumber(c) - col}]`}${r ? `R${ra ? r : `[${Number(r) - row}]`}` : ''}`);
    out = out.slice(0, ref.start) + `${ref.sheet}!${value}` + out.slice(ref.end);
  }
  return out;
}
