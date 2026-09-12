import test from 'node:test';
import assert from 'node:assert/strict';
import { bounds, overlaps, gridA1, SCOPES, assertScopes } from '../src/common.mjs';
import { tiles } from '../src/collect.mjs';
import { scanFormula, formulaPattern } from '../src/formulas.mjs';
import { analyzeScripts } from '../src/script-analysis.mjs';
import { trace } from '../src/analyze.mjs';

test('tile scanning covers every physical cell exactly once, including grids wider than a page', () => {
  for (const [rows, cols, budget] of [[3, 10, 4], [17, 7, 20], [1, 1, 1]]) {
    const seen = new Set();
    for (const box of tiles(rows, cols, budget)) {
      assert.ok((box.r2 - box.r1 + 1) * (box.c2 - box.c1 + 1) <= budget);
      for (let r = box.r1; r <= box.r2; r++) for (let c = box.c1; c <= box.c2; c++) { const key = `${r},${c}`; assert.ok(!seen.has(key)); seen.add(key); }
    }
    assert.equal(seen.size, rows * cols);
  }
});
test('A1 parser distinguishes functions, quoted strings, escaped sheet names, unicode and mixed ranges', () => {
  const parsed = scanFormula('=SUM(\'O\'\'Brien\'!$A$1:B9,ข้อมูล!C:C,2:7,A2:A)+LOG10(B2)+IF(C3="A99",1,0)', 'Here');
  assert.deepEqual(parsed.refs.map(r => [r.sheet, r.a1]), [["O'Brien", '$A$1:B9'], ['ข้อมูล', 'C:C'], ['Here', '2:7'], ['Here', 'A2:A'], ['Here', 'B2'], ['Here', 'C3']]);
  assert.ok(parsed.functions.includes('LOG10'));
});
test('dynamic and array references remain visibly unresolved', () => {
  const parsed = scanFormula('=ARRAYFORMULA(INDIRECT("A2:A")+IMPORTRANGE("https://example.invalid/id","Sheet!B2"))', 'S');
  assert.equal(parsed.refs.length, 0);
  assert.equal(parsed.issues.length, 3);
});
test('named ranges respect boundaries and LET/LAMBDA shadowing is not guessed', () => {
  const names = [{ name: 'TaxRate', range: {} }];
  assert.equal(scanFormula('=TaxRate*A1+"TaxRate"', 'S', names).namedRefs.length, 1);
  assert.equal(scanFormula('=MyTaxRate*A1', 'S', names).namedRefs.length, 0);
  const shadow = scanFormula('=LET(TaxRate,2,TaxRate*A1)', 'S', names);
  assert.equal(shadow.namedRefs.length, 0);
  assert.ok(shadow.issues.some(x => x.includes('shadowing')));
});
test('relative formulas group while absolute anchors stay different', () => {
  const pattern = (formula, row) => formulaPattern(formula, scanFormula(formula, 'S').refs, row, 2);
  assert.equal(pattern('=A2*$C$1', 2), pattern('=A3*$C$1', 3));
  assert.notEqual(pattern('=A2*$C$1', 2), pattern('=A3*$C$2', 3));
});
test('symbolic ranges overlap without cell expansion and open named ranges use actual grid bounds', () => {
  assert.ok(overlaps(bounds('A2:A'), bounds('A10000000')));
  assert.ok(!overlaps(bounds('A:A'), bounds('B2')));
  assert.deepEqual(bounds('2:7'), { r1: 2, r2: 7, c1: 1, c2: Infinity });
  assert.equal(gridA1({ startRowIndex: 5 }, { rowCount: 20, columnCount: 10 }), 'A6:J20');
});
test('tokens with missing scopes, unrelated scopes or write scopes are rejected', () => {
  assert.doesNotThrow(() => assertScopes(SCOPES));
  for (const scopes of [[], SCOPES.slice(0, 1), [...SCOPES, 'https://www.googleapis.com/auth/drive'], [...SCOPES, 'openid']]) assert.throws(() => assertScopes(scopes), /exactly/);
});
const script = source => analyzeScripts([{ id: 'script', spreadsheetId: 'book', files: [{ name: 'Code', type: 'SERVER_JS', source }] }]);
test('Apps Script AST resolves literal range aliases, computed names and potential writes without execution', () => {
  const result = script(`function audit() { throw new Error('MUST NOT RUN'); const b=SpreadsheetApp.getActive(); const s=b.getSheetByName('In'+'puts'); const r=s.getRange(2,2,3,1); r.getValues(); b.getSheetByName('Output').getRange('A1').setValue(1); }`);
  assert.deepEqual(result.functions[0].reads.map(x => x.a1), ['B2:B4']);
  assert.deepEqual(result.functions[0].writes.map(x => x.sheet), ['Output']);
});
test('runtime selections and branch reassignment do not silently become a definite range', () => {
  const result = script(`function f(flag) { let name='A'; if(flag) name='B'; SpreadsheetApp.getActive().getSheetByName(name).getRange('A1').getValue(); }`);
  assert.equal(result.functions[0].reads.length, 0);
  assert.ok(result.functions[0].issues.length > 0);
  assert.equal(script('function broken(').issues.length, 1);
});
test('dependency tracing handles cycles and includes range membership without unbounded recursion', () => {
  const graph = { nodes: [{ id: 'a', parent: 's', kind: 'cell', a1: 'A2' }, { id: 'r', parent: 's', kind: 'range', a1: 'A:A' }, { id: 'f', parent: 's', kind: 'cell', a1: 'B1' }], edges: [{ id: '1', source: 'r', target: 'f' }, { id: '2', source: 'f', target: 'r' }] };
  const result = trace(graph, 'a');
  assert.equal(result.nodes.length, 3);
  assert.equal(trace(graph, 'a', { limit: 1 }).truncated, true);
  assert.equal(trace(graph, 'a', { depth: 0 }).truncated, true);
});
