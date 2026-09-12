import { parse } from 'acorn';
import { column, hash } from './common.mjs';

const READS = new Set(['getValue', 'getValues', 'getFormula', 'getFormulas', 'getFormulasR1C1', 'getDisplayValue', 'getDisplayValues', 'getNotes']);
const WRITES = new Set(['setValue', 'setValues', 'setFormula', 'setFormulas', 'setFormulaR1C1', 'setFormulasR1C1', 'clear', 'clearContent']);
const UNKNOWN = undefined;
export function analyzeScripts(projects) {
  const functions = [], issues = [];
  for (const project of projects) {
    for (const file of project.files) {
      if (file.type !== 'SERVER_JS') continue;
      let tree;
      try { tree = parse(file.source, { ecmaVersion: 'latest', locations: true, sourceType: 'script' }); }
      catch { issues.push({ scriptId: project.id, file: file.name, reason: 'JavaScript parse failed; source was collected but relationships are unresolved.' }); continue; }
      const units = [];
      for (const node of tree.body) {
        if (node.type === 'FunctionDeclaration') units.push({ name: node.id.name, node });
        if (node.type === 'VariableDeclaration') for (const dec of node.declarations) {
          if (dec.id.type === 'Identifier' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(dec.init?.type)) units.push({ name: dec.id.name, node: dec.init });
        }
      }
      const global = { name: '<top-level>', node: { type: 'Program', body: tree.body.filter(n => n.type !== 'FunctionDeclaration' && !(n.type === 'VariableDeclaration' && n.declarations.every(d => ['ArrowFunctionExpression', 'FunctionExpression'].includes(d.init?.type)))), loc: { start: { line: 1 } }, start: 0, end: file.source.length } };
      const globals = new Map();
      for (const unit of [global, ...units]) {
        const fn = { id: `function:${project.id}:${file.name}:${unit.name}`, scriptId: project.id, file: file.name, name: unit.name, line: unit.node.loc.start.line, sourceHash: hash(file.source.slice(unit.node.start, unit.node.end)), reads: [], writes: [], calls: [], issues: [] };
        const env = unit === global ? globals : new Map(globals);
        for (const param of unit.node.params ?? []) if (param.type === 'Identifier') env.set(param.name, UNKNOWN);
        const issue = (node, reason) => fn.issues.push({ line: node.loc?.start.line ?? fn.line, reason });
        const evaluate = (node, scope) => {
          if (!node) return UNKNOWN;
          if (node.type === 'Literal') return node.value;
          if (node.type === 'Identifier') return scope.has(node.name) ? scope.get(node.name) : (node.name === 'SpreadsheetApp' ? { kind: 'service' } : UNKNOWN);
          if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
          if (node.type === 'BinaryExpression' && node.operator === '+') {
            const left = evaluate(node.left, scope), right = evaluate(node.right, scope);
            return ['string', 'number'].includes(typeof left) && ['string', 'number'].includes(typeof right) ? left + right : UNKNOWN;
          }
          if (node.type === 'CallExpression') {
            const callee = node.callee;
            const obj = callee.type === 'MemberExpression' ? evaluate(callee.object, scope) : UNKNOWN;
            const method = callee.type === 'MemberExpression' ? (callee.computed ? evaluate(callee.property, scope) : callee.property.name) : null;
            const args = node.arguments.map(a => evaluate(a, scope));
            if (callee.type === 'Identifier') fn.calls.push({ name: callee.name, line: node.loc.start.line });
            if (obj?.kind === 'service') {
              if (['getActive', 'getActiveSpreadsheet'].includes(method)) return project.spreadsheetId ? { kind: 'book', book: project.spreadsheetId } : UNKNOWN;
              if (method === 'openById' && typeof args[0] === 'string') return { kind: 'book', book: args[0] };
            }
            if (obj?.kind === 'book' && method === 'getSheetByName' && typeof args[0] === 'string') return { kind: 'sheet', book: obj.book, sheet: args[0] };
            if (obj?.kind === 'sheet' && method === 'getRange') {
              if (typeof args[0] === 'string') return { kind: 'range', book: obj.book, sheet: obj.sheet, a1: args[0] };
              if (args.length >= 2 && args.every(x => Number.isInteger(x) && x > 0)) {
                const [r, c, nr = 1, nc = 1] = args;
                return { kind: 'range', book: obj.book, sheet: obj.sheet, a1: `${column(c)}${r}:${column(c + nc - 1)}${r + nr - 1}` };
              }
            }
            if (obj?.kind === 'range') {
              const entry = { book: obj.book, sheet: obj.sheet, a1: obj.a1, line: node.loc.start.line };
              if (READS.has(method)) fn.reads.push(entry);
              if (WRITES.has(method)) { fn.writes.push(entry); return obj; }
              if (method === 'copyTo') {
                fn.reads.push(entry);
                if (args[0]?.kind === 'range') fn.writes.push({ ...args[0], line: node.loc.start.line });
                else issue(node, 'copyTo destination could not be resolved.');
              }
            } else if (READS.has(method) || WRITES.has(method)) issue(node, `${method}: range could not be resolved statically.`);
            if (['getRange', 'getActiveRange', 'getActiveSheet', 'getDataRange', 'getRangeList', 'openByUrl', 'offset', 'appendRow'].includes(method)) issue(node, `${method}: dynamic/unsupported target; inspect this source location.`);
            if (['fetch', 'fetchAll', 'newTrigger'].includes(method)) issue(node, `${method}: external effect or trigger declaration; runtime state was not inspected.`);
            return UNKNOWN;
          }
          if (node.type === 'AssignmentExpression') {
            const value = evaluate(node.right, scope);
            if (node.left.type === 'Identifier') scope.set(node.left.name, node.operator === '=' ? value : UNKNOWN);
            return value;
          }
          if (node.type === 'UpdateExpression') { if (node.argument.type === 'Identifier') scope.set(node.argument.name, UNKNOWN); return UNKNOWN; }
          if (['FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
            issue(node, 'Nested callback: parameters and invocation context may be dynamic.');
            const nested = new Map(scope);
            for (const p of node.params) if (p.type === 'Identifier') nested.set(p.name, UNKNOWN);
            visit(node.body, nested);
            return UNKNOWN;
          }
          for (const child of children(node)) evaluate(child, scope);
          return UNKNOWN;
        };
        const visit = (node, scope) => {
          if (!node) return;
          if (node.type === 'FunctionDeclaration') { issue(node, 'Nested function declaration is not linked automatically.'); return; }
          if (node.type === 'VariableDeclaration') {
            for (const dec of node.declarations) {
              if (['ArrowFunctionExpression', 'FunctionExpression'].includes(dec.init?.type) && unit === global) continue;
              const value = evaluate(dec.init, scope);
              if (dec.id.type === 'Identifier') scope.set(dec.id.name, value);
            }
            return;
          }
          if (node.type === 'BlockStatement' || node.type === 'Program') { for (const child of node.body) visit(child, scope); return; }
          if (['IfStatement', 'ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement'].includes(node.type)) {
            // Clear values written in a branch/loop before analyzing it. Do not assume one branch won.
            const assigned = new Set();
            walk(node, n => {
              if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') assigned.add(n.left.name);
              if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier') assigned.add(n.argument.name);
              if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') assigned.add(n.id.name);
            });
            const branch = new Map(scope);
            for (const name of assigned) { branch.set(name, UNKNOWN); if (scope.has(name)) scope.set(name, UNKNOWN); }
            for (const child of children(node)) visit(child, new Map(branch));
            return;
          }
          if (node.type.endsWith('Statement')) { for (const child of children(node)) visit(child, scope); return; }
          evaluate(node, scope);
        };
        visit(unit === global ? unit.node : unit.node.body, env);
        if (unit !== global || fn.reads.length || fn.writes.length || fn.issues.length) functions.push(fn);
      }
    }
  }
  return { functions, issues };
}
function children(node) {
  return Object.values(node).flatMap(value => Array.isArray(value) ? value.filter(x => x?.type) : value?.type ? [value] : []);
}
function walk(node, fn) { fn(node); for (const child of children(node)) walk(child, fn); }
