import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/script.projects.readonly',
];
export const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export const json = async file => JSON.parse(await readFile(file, 'utf8'));
export async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await rename(tmp, file);
}
export function validateConfig(input) {
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && !value.startsWith('YOUR_');
  if (!Array.isArray(input.spreadsheets) || !input.spreadsheets.length) throw new Error('Configure at least one spreadsheet.');
  const spreadsheets = input.spreadsheets.map(x => {
    if (!id(x.id)) throw new Error('Invalid spreadsheet ID; use an ID, not a URL or placeholder.');
    return { id: x.id };
  });
  const books = new Set(spreadsheets.map(x => x.id));
  if (books.size !== spreadsheets.length) throw new Error('Duplicate spreadsheet IDs.');
  const scripts = (input.scripts ?? []).map(x => {
    if (!id(x.id) || (x.spreadsheetId && !books.has(x.spreadsheetId))) throw new Error('Invalid script ID or spreadsheet mapping.');
    if (x.versionNumber !== undefined && (!Number.isInteger(x.versionNumber) || x.versionNumber < 1)) throw new Error('Invalid script version number.');
    return { id: x.id, ...(x.spreadsheetId ? { spreadsheetId: x.spreadsheetId } : {}), ...(x.versionNumber ? { versionNumber: x.versionNumber } : {}) };
  });
  if (new Set(scripts.map(x => x.id)).size !== scripts.length) throw new Error('Duplicate script IDs.');
  const cellsPerPage = input.cellsPerPage ?? 20000;
  if (!Number.isInteger(cellsPerPage) || cellsPerPage < 1 || cellsPerPage > 50000) throw new Error('cellsPerPage must be between 1 and 50000.');
  return { spreadsheets, scripts, cellsPerPage };
}
export function assertScopes(scopes) {
  const actual = new Set(scopes);
  if (SCOPES.some(s => !actual.has(s)) || [...actual].some(s => !SCOPES.includes(s))) {
    throw new Error('OAuth token must grant exactly spreadsheets.readonly and script.projects.readonly. Re-authorize with a dedicated OAuth client; broader grants are refused.');
  }
}
export function column(n) {
  let out = '';
  while (n > 0) { n--; out = String.fromCharCode(65 + n % 26) + out; n = Math.floor(n / 26); }
  return out;
}
export function columnNumber(s) { return [...s.toUpperCase()].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0); }
export const quoteSheet = title => `'${title.replaceAll("'", "''")}'`;
export const canonicalRange = a1 => a1.replaceAll('$', '').toUpperCase();
export function bounds(a1) {
  const parts = canonicalRange(a1).split(':');
  const part = s => {
    const m = /^([A-Z]+)?([1-9]\d*)?$/.exec(s);
    return m && (m[1] || m[2]) ? { col: m[1] ? columnNumber(m[1]) : null, row: m[2] ? Number(m[2]) : null } : null;
  };
  const a = part(parts[0]), b = part(parts[1] ?? parts[0]);
  if (!a || !b || parts.length > 2 || (parts.length === 1 && (!a.row || !a.col))) return null;
  const box = { r1: a.row ?? 1, r2: b.row ?? Infinity, c1: a.col ?? 1, c2: b.col ?? Infinity };
  return box.r1 <= box.r2 && box.c1 <= box.c2 ? box : null;
}
export const overlaps = (a, b) => a && b && a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
export function gridA1(grid, dimensions = {}) {
  const start = `${grid.startColumnIndex === undefined ? 'A' : column(grid.startColumnIndex + 1)}${(grid.startRowIndex ?? 0) + 1}`;
  const endCol = grid.endColumnIndex ?? dimensions.columnCount;
  const endRow = grid.endRowIndex ?? dimensions.rowCount;
  return endCol && endRow ? `${start}:${column(endCol)}${endRow}` : null;
}
export const safeError = e => e?.safeMessage ?? (e?.message?.startsWith('OAuth token') ? e.message : 'Read failed; check credentials, file access, and API configuration.');
