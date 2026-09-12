# Reading evidence and tracing relationships

`complete` means all configured spreadsheets and scripts were collected, including every allocated grid rectangle. It does not mean the static analyzer understands every formula or runtime code path. Check both collection coverage and `graph.json.issues`.

## Data and output

| Artifact | Contents |
|---|---|
| `manifest.json` | Target metadata, requested rectangles, read timestamps, hashes, coverage, errors |
| `pages/*.json` | Sparse Sheets API GridData: entered values/formulas, effective values/errors, formatted values, notes, validation and hyperlinks |
| `scripts/*.json` | Every returned project file, including server JavaScript, HTML and JSON manifest source |
| `summary.json` | Coverage and counts, sheet summaries, normalized formula groups, limitations |
| `graph.json` | Formula/range/function nodes, directed static links with evidence, unresolved cases |
| `report.html` | Standalone interactive graph, sheet coverage, node search and evidence details; no remote assets or network requests |
| `report.md` | Compact deterministic inventory for a human or agent to read before a contextual summary |

The API omits trailing empty rows/cells. Blank cells are represented by the requested rectangle's successful coverage, not millions of empty JSON objects. A returned cell containing zero, false, an error or a formula is preserved. The script manifest's declared scopes describe the **audited script**, not the auditor's authorization.

## Graph semantics

| Edge | Direction and meaning |
|---|---|
| `formula-reference` | Referenced cell/range → formula cell; A1 expression evidence |
| `named-range` | Resolved named range → formula cell |
| `script-read` | Range → function; source contains a possible read |
| `script-write` | Function → range; source contains a possible write; not executed |
| `calls` | Caller → same-project function candidate |
| `custom-function-candidate` | Mapped Apps Script function → formula using its name; candidate match, not runtime proof |
| `range-overlap` | Added during tracing when symbolic ranges share cells; geometric possibility, not an execution dependency |

Ranges such as `A:A` and `B2:B1000000` remain symbolic. `trace` includes overlap with known nodes, so a formula inside a referenced range can be followed without expanding millions of cells. Range overlap can overapproximate impact, especially upstream through a wide range. Report that uncertainty. Call edges describe invocation, whereas value edges describe data flow; do not confuse the two.

The HTML sheet/function overview groups edges. Cell view and node search expose the underlying formulas and source locations. Rendering is capped at 45 nodes and 160 links per selection, search at 40 results, and issue display at 200; the interface states these limits. Full extracted results remain in JSON. Search and CLI/MCP pagination can reach nodes omitted from the initial display.

## Inspect specific evidence

From `scripts/`:

```bash
node cli.mjs inspect --out ../runs/demo --book demo_book --sheet Summary --range B2:B5 --limit 2
node cli.mjs inspect --out ../runs/demo --book demo_book --sheet Summary --range B2:B5 --offset 2 --limit 2
node cli.mjs trace --out ../runs/demo --node cell:demo_book:1:B2 --direction upstream --depth 5
node cli.mjs analyze --out ../runs/demo
```

`inspect` returns populated cells, their original formulas and values, and `nextOffset`. It does not assume that missing pages are empty. `trace` reports `truncated` when its depth/node bound prevents completion. Node IDs are returned by `audit_nodes` or found in `graph.json`; avoid constructing IDs from a display title alone.

With MCP, first use `audit_summary`, then `audit_nodes`, `audit_cells`, `audit_trace`, `audit_issues`, and `audit_script_source` as needed. All list tools paginate or cap results; `audit_summary` includes at most 20 formula groups and reports the total group count. Detailed groups remain in `summary.json`. Script source offsets are zero based; returned `firstLine` and AST evidence lines are one based.

## Known analysis limits

- The formula scanner handles common A1 syntax, absolute/relative anchors, quoted/Unicode sheet names, whole rows/columns and workbook named ranges. It is not a complete Google Sheets expression parser or recalculation engine.
- `INDIRECT`, `OFFSET`, `IMPORTRANGE`, external import functions and finance data are flagged as runtime/external. No automatically discovered external spreadsheet is fetched.
- LET/LAMBDA can shadow names, structured table references are unresolved, and array spill ownership is not inferred. Only the formula anchor owns extracted dependencies.
- Apps Script uses an AST and literal propagation for common `SpreadsheetApp` → spreadsheet → named sheet → range patterns, numeric range coordinates, reads/writes, and simple function calls. It never evaluates the source. Parameters, active selections, branch-dependent aliases, cross-file globals, closures, object/class methods, dynamic dispatch and library code are not fully resolved. Script edges always remain `static-possible`.
- Triggers, deployments, script properties, execution history and effective runtime privileges are not collected. No assumption about whether a function runs on edit or a schedule follows from its name alone.
- Chart specifications and cell validation are collected as metadata, but their dependency links are not extracted. Formula groups are structural hints and do not prove semantic equivalence.

Produce a contextual summary grounded in raw evidence, with concrete examples and unresolved cases. The bundled Markdown report is an inventory, not an AI-generated explanation of the workbook's business purpose.
