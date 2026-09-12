import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, json, writeJson, validateConfig, safeError, column } from './common.mjs';

export function* tiles(rows, columns, maxCells) {
  const width = Math.min(columns, maxCells);
  const height = Math.max(1, Math.floor(maxCells / width));
  for (let row = 1; row <= rows; row += height) {
    for (let col = 1; col <= columns; col += width) yield { r1: row, r2: Math.min(rows, row + height - 1), c1: col, c2: Math.min(columns, col + width - 1) };
  }
}
export async function collect(input, reader, out, { resume = false, mode = 'live', progress = () => {} } = {}) {
  const config = validateConfig(input);
  await mkdir(out, { recursive: true });
  const manifestPath = join(out, 'manifest.json');
  const entries = await readdir(out);
  if (entries.length && !resume) throw new Error('Output exists. Choose a fresh directory or use --resume.');
  const state = resume ? await json(manifestPath) : {
    schemaVersion: 1, mode, configHash: hash(config), startedAt: new Date().toISOString(),
    spreadsheets: [], pages: {}, scripts: {}, errors: [], status: 'running',
    consistency: 'Reads span multiple requests; this is not an atomic point-in-time snapshot.',
  };
  if (state.configHash !== hash(config) || state.mode !== mode) throw new Error('Resume configuration differs from the original run.');
  state.errors = [];
  state.status = 'running';
  const persist = () => writeJson(manifestPath, state);
  await persist();
  for (const spec of config.spreadsheets) {
    let meta;
    try {
      meta = await reader.metadata(spec.id);
      if (meta.spreadsheetId !== spec.id || !Array.isArray(meta.sheets) || !meta.sheets.length || meta.sheets.some(s => !Number.isInteger(s.properties?.sheetId) || typeof s.properties.title !== 'string')) throw new Error('Incomplete spreadsheet metadata.');
      if (new Set(meta.sheets.map(s => s.properties.sheetId)).size !== meta.sheets.length) throw new Error('Duplicate sheet metadata.');
    }
    catch (e) { state.errors.push({ kind: 'spreadsheet', id: spec.id, error: safeError(e) }); await persist(); continue; }
    const fingerprint = hash(meta);
    const previous = state.spreadsheets.find(x => x.id === spec.id);
    if (previous && previous.fingerprint !== fingerprint) throw new Error('Spreadsheet structure changed. Start a fresh run; do not mix differently shaped snapshots.');
    if (!previous) state.spreadsheets.push({ id: spec.id, fingerprint, metadata: meta });
    await persist();
    for (const item of meta.sheets ?? []) {
      const sheet = item.properties;
      const rows = sheet.gridProperties?.rowCount, cols = sheet.gridProperties?.columnCount;
      if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
        state.errors.push({ kind: 'unsupported-sheet', id: spec.id, sheetId: sheet.sheetId }); continue;
      }
      for (const box of tiles(rows, cols, config.cellsPerPage)) {
        const key = hash([spec.id, sheet.sheetId, box]);
        if (state.pages[key]) {
          const saved = await json(join(out, 'pages', `${key}.json`));
          if (hash(saved) !== state.pages[key].hash) throw new Error('Saved page is corrupt; start a fresh run.');
          continue;
        }
        try {
          const data = await reader.page(spec.id, sheet, box);
          validatePage(data, sheet.sheetId, box);
          await writeJson(join(out, 'pages', `${key}.json`), data);
          state.pages[key] = { spreadsheetId: spec.id, sheetId: sheet.sheetId, box, hash: hash(data), readAt: new Date().toISOString() };
        } catch (e) { state.errors.push({ kind: 'page', id: spec.id, sheetId: sheet.sheetId, box, error: safeError(e) }); }
        await persist();
        progress({ pages: Object.keys(state.pages).length, errors: state.errors.length });
      }
    }
  }
  for (const spec of config.scripts) {
    if (state.scripts[spec.id]) {
      if (hash(await json(join(out, 'scripts', `${spec.id}.json`))) !== state.scripts[spec.id].hash) throw new Error('Saved script is corrupt; start a fresh run.');
      continue;
    }
    try {
      const data = await reader.script(spec);
      if (!Array.isArray(data.files) || data.files.some(f => typeof f.source !== 'string')) throw new Error('Incomplete script response.');
      await writeJson(join(out, 'scripts', `${spec.id}.json`), data);
      state.scripts[spec.id] = { ...spec, hash: hash(data), fileCount: data.files.length, readAt: new Date().toISOString(), sourceVersion: spec.versionNumber ?? 'HEAD' };
    } catch (e) { state.errors.push({ kind: 'script', id: spec.id, error: safeError(e) }); }
    await persist();
  }
  const expectedCells = state.spreadsheets.reduce((total, b) => total + (b.metadata.sheets ?? []).reduce((sum, s) => sum + (s.properties.gridProperties?.rowCount ?? 0) * (s.properties.gridProperties?.columnCount ?? 0), 0), 0);
  const coveredCells = Object.values(state.pages).reduce((sum, p) => sum + (p.box.r2 - p.box.r1 + 1) * (p.box.c2 - p.box.c1 + 1), 0);
  state.coverage = { expectedCells, coveredCells, spreadsheetsExpected: config.spreadsheets.length, spreadsheetsRead: state.spreadsheets.length, scriptsExpected: config.scripts.length, scriptsRead: Object.keys(state.scripts).length };
  state.status = state.errors.length || expectedCells !== coveredCells ? 'partial' : 'complete';
  state.finishedAt = new Date().toISOString();
  await persist();
  return state;
}
function validatePage(data, sheetId, box) {
  if (!Array.isArray(data.sheets) || !data.sheets.some(s => s.properties?.sheetId === sheetId)) throw new Error('Expected sheet missing from response.');
  for (const sheet of data.sheets) {
    if (sheet.properties?.sheetId !== sheetId) throw new Error('Unexpected sheet in response.');
    for (const grid of sheet.data ?? []) {
      for (let r = 0; r < (grid.rowData ?? []).length; r++) for (let c = 0; c < (grid.rowData[r].values ?? []).length; c++) {
        const row = (grid.startRow ?? 0) + r + 1, col = (grid.startColumn ?? 0) + c + 1;
        if (row < box.r1 || row > box.r2 || col < box.c1 || col > box.c2) throw new Error('Grid data extends beyond the requested rectangle.');
      }
    }
  }
}
export async function* cells(out, manifest) {
  for (const [key, page] of Object.entries(manifest.pages)) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid snapshot page key.');
    const data = await json(join(out, 'pages', `${key}.json`));
    if (hash(data) !== page.hash) throw new Error('Snapshot page integrity check failed.');
    for (const sheet of data.sheets ?? []) for (const grid of sheet.data ?? []) {
      for (let r = 0; r < (grid.rowData ?? []).length; r++) {
        for (let c = 0; c < (grid.rowData[r].values ?? []).length; c++) {
          const value = grid.rowData[r].values[c];
          if (!Object.keys(value).length) continue;
          const row = (grid.startRow ?? 0) + r + 1, col = (grid.startColumn ?? 0) + c + 1;
          yield { spreadsheetId: page.spreadsheetId, sheetId: page.sheetId, row, col, a1: `${column(col)}${row}`, ...value };
        }
      }
    }
  }
}
