// Entirely synthetic fixture. No Google account or network is used.
export const demoConfig = { spreadsheets: [{ id: 'demo_book' }], scripts: [{ id: 'demo_script', spreadsheetId: 'demo_book' }], cellsPerPage: 8 };
const number = n => ({ userEnteredValue: { numberValue: n }, effectiveValue: { numberValue: n }, formattedValue: String(n) });
const text = s => ({ userEnteredValue: { stringValue: s }, effectiveValue: { stringValue: s }, formattedValue: s });
const formula = (s, n) => ({ userEnteredValue: { formulaValue: s }, effectiveValue: { numberValue: n }, formattedValue: String(n) });
const data = {
  0: { A1: text('Product'), B1: text('Amount'), A2: text('Alpha'), B2: number(10), A3: text('Beta'), B3: number(20), A4: text('Zero'), B4: number(0), A5: text('Enabled'), B5: { userEnteredValue: { boolValue: false }, effectiveValue: { boolValue: false } }, C2: text('Literal A99 is not a formula reference') },
  1: { A1: text('Summary'), A2: text('Total'), B2: formula('=SUM(Inputs!B2:B4)', 30), A3: text('With tax'), B3: formula('=B2*(1+Config!B1)', 32.1), A4: text('Custom function'), B4: formula('=DOUBLE(B3)', 64.2), A5: text('Dynamic ref'), B5: formula('=INDIRECT("Inputs!B2")', 10), C2: formula('=TaxRate*Inputs!B3', 1.4), C3: formula('=TaxRate*Inputs!B4', 0) },
  2: { A1: text('Tax rate'), B1: { ...number(0.07), note: '</script><script>throw new Error("untrusted note")</script>' }, A2: text('Audit note'), B2: text('</script><script>throw new Error("untrusted cell text")</script>') },
};
export class DemoReader {
  async metadata(id) {
    return { spreadsheetId: id, properties: { title: 'Synthetic sales model', locale: 'en_US', timeZone: 'Etc/UTC' }, namedRanges: [{ name: 'TaxRate', namedRangeId: 'tax', range: { sheetId: 2, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 } }], sheets: [
      { properties: { sheetId: 0, title: 'Inputs', gridProperties: { rowCount: 6, columnCount: 4 } } },
      { properties: { sheetId: 1, title: 'Summary', gridProperties: { rowCount: 6, columnCount: 4 } } },
      { properties: { sheetId: 2, title: 'Config', hidden: true, gridProperties: { rowCount: 4, columnCount: 3 } } },
    ] };
  }
  async page(id, sheet, box) {
    const { column } = await import('./common.mjs');
    const rows = [];
    for (let r = box.r1; r <= box.r2; r++) {
      const values = [];
      for (let c = box.c1; c <= box.c2; c++) values.push(data[sheet.sheetId]?.[`${column(c)}${r}`] ?? {});
      while (values.length && !Object.keys(values.at(-1)).length) values.pop();
      rows.push(values.length ? { values } : {});
    }
    while (rows.length && !rows.at(-1).values?.length) rows.pop();
    return { sheets: [{ properties: { sheetId: sheet.sheetId }, ...(rows.length ? { data: [{ startRow: box.r1 - 1, startColumn: box.c1 - 1, rowData: rows }] } : {}) }] };
  }
  async script() {
    return { scriptId: 'demo_script', files: [
      { name: 'Code', type: 'SERVER_JS', source: `function DOUBLE(value) { return value * 2; }
function refreshSummary() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const input = book.getSheetByName('Inputs').getRange('B2:B4').getValues();
  book.getSheetByName('Summary').getRange('C4').setValue(input.length);
  helper();
}
function helper() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config').getRange('B1').getValue(); }
function onEdit(e) { return e.range.getValue(); }
` },
      { name: 'appsscript', type: 'JSON', source: '{"timeZone":"Etc/UTC","runtimeVersion":"V8"}' },
      { name: 'Sidebar', type: 'HTML', source: '<p>Synthetic sidebar; stored but never executed.</p>' },
    ] };
  }
}
