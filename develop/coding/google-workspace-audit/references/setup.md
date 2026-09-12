# Setup and cloud execution

## Local demo

Use Node 22 or newer. From the skill's `scripts/` directory:

```bash
npm ci --ignore-scripts
npm test
node cli.mjs demo --out ../runs/demo
```

Open `../runs/demo/report.html` in a browser. The fixture contains three sheets, a hidden configuration tab, six formulas, four functions, and an unresolved dynamic reference. It is synthetic and never accesses Google.

## Google authorization

1. In a Google Cloud project, enable **Google Sheets API** and **Apps Script API**. Configure the OAuth consent screen and a **Desktop app** OAuth client. When the app is in testing, add the Google account as a test user. Download its client JSON outside the repository, or inside the ignored `.secrets/` directory.
2. In the Google account's [Apps Script user settings](https://script.google.com/home/usersettings), enable Apps Script API project access when required. The account must be able to access both the spreadsheet and the script project. File sharing and OAuth scopes are separate controls.
3. Create a dedicated OAuth client for this auditor so previously granted write scopes are not combined with this consent. The helper requests exactly:

   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `https://www.googleapis.com/auth/script.projects.readonly`

4. Run initial consent on your own computer, which can open a browser and receive a loopback callback:

```bash
node oauth.mjs --client /absolute/path/client_secret.json --out ../.secrets/token.json
```

Open the printed URL in your browser. The helper uses random state, PKCE and a localhost callback; the output file is created with mode `0600`. It contains the client ID, client secret and refresh token. Never paste it into chat or commit it. The output file must not already exist; use a new filename for reauthorization.

The collector checks actual granted scopes on each new access token. A token with additional scopes is refused, even if those scopes are also read-only. These OAuth scopes apply to accessible files generally; the application allowlist narrows which IDs this collector requests. OAuth alone cannot express a list of spreadsheet IDs. For account-level file isolation, use a dedicated account with access only to the intended files.

External OAuth applications in testing can have refresh-token expiry, and Workspace administrators can restrict API access. Reauthorize or resolve the administrative setting when required; do not broaden scopes to work around a 403.

## Configure targets and collect

Copy `assets/config.example.json` to the ignored `config.local.json` in the skill directory. Replace every placeholder.

- Spreadsheet ID: the segment after `/spreadsheets/d/` in its URL.
- Script ID: Apps Script editor → Project Settings → Script ID. This is a different ID from the spreadsheet ID. Source discovery from a spreadsheet ID is not automatic.
- `scripts[].spreadsheetId`: explicitly maps a bound script to its spreadsheet, allowing static resolution of `getActiveSpreadsheet()` and custom-function candidates. Omit for a standalone script unless the relationship is known.
- `scripts[].versionNumber`: optional positive integer for an existing saved script version. Omit to read HEAD.
- `cellsPerPage`: maximum allocated cells per request, 1–50,000, default 20,000. All configured sheets are scanned, including hidden tabs and unused allocated grid space.
- `scripts: []` is valid for a sheets-only run; this auditor's fixed authorization policy still uses the same two scopes.

```bash
GOOGLE_OAUTH_TOKEN_FILE=../.secrets/token.json node cli.mjs audit --config ../config.local.json --out ../runs/first-audit
```

To continue missing pages after resolving an error, repeat with `--resume`. To refresh data, use a **new** directory. Saved pages are never silently mixed with a changed sheet structure. Reads happen across multiple requests and are not an atomic transaction; avoid editing the source during a scan when consistency matters. A long interrupted/resumed run can contain old and new values; the manifest records per-page timestamps.

Large allocated grids take time and API quota even if mostly empty. Pages are checkpointed on disk. Analysis holds populated cells and the dependency graph in memory, so choose a runner with enough RAM for the workbook. Unsupported sheet types or failed pages produce a partial result rather than a success claim.

## GitHub Actions

The repository workflow `.github/workflows/google-workspace-audit.yml` runs tests and creates a synthetic demo artifact on matching pushes and pull requests. No Google secret is used in these jobs.

After the workflow is on the default branch, **Actions → Google Workspace audit → Run workflow** can run `demo` or `live`. Manual dispatch generally requires the workflow file to exist on the default branch. Merely pushing this feature branch does not merge it.

For a live cloud run, use this code in a **private repository**, then set:

| GitHub setting | Name | Value |
|---|---|---|
| Actions secret | `GOOGLE_OAUTH_TOKEN_JSON` | Entire authorized-user token file from the local consent step |
| Actions variable | `GOOGLE_AUDIT_CONFIG_JSON` | Entire configured target JSON |

Select `live`. The live job reads Google with the restricted token and uploads the output folder as an Actions artifact retained for seven days. Only the audit step receives the Google secret. Credentials are not part of the artifact. Partial scans also upload their manifest and report, then fail the job visibly.

This source repository is public, so the live job refuses to upload real audit data here. The demo remains available. A real audit contains cell values and script source; readers of its artifact can inspect that data. Run locally or use a private repository whose access matches the data. No recurring schedule is enabled.

## Optional Codex MCP connection

The stdio MCP server exposes an **already collected** snapshot: summary, cell pagination, node search, dependency tracing, unresolved items, and script source lines. It needs no Google credentials. First run the CLI locally or download and extract a cloud audit artifact.

For Codex CLI/IDE, add an MCP server using absolute paths in the supported MCP configuration:

```toml
[mcp_servers.google_workspace_audit]
command = "node"
args = ["/absolute/path/google-workspace-audit/scripts/mcp.mjs"]

[mcp_servers.google_workspace_audit.env]
AUDIT_SNAPSHOT = "/absolute/path/to/extracted-audit"
```

Install the skill folder in your Codex skill directory and ask: `Use $google-workspace-audit to summarize this snapshot and explain what links to what.` Keep the whole folder, including its runtime and references. A copied SKILL.md alone does not provide API access or executable tools.

This configuration is for a host that supports local stdio MCP. It does not install a remote connector into ChatGPT Work or make the MCP server available inside a cloud agent automatically. GitHub Actions is the included cloud runner; a hosted HTTP MCP service would require a separate authenticated deployment.

## Official references

- [Sheets CellData](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells): entered formulas, effective values and formatted values.
- [Sheets get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get) and [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes): ranged grid reads and read-only authorization.
- [Apps Script getContent](https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent): source files, manifest, HEAD and versioned reads.
- [Apps Script API enablement](https://developers.google.com/apps-script/api/how-tos/enable): project and user access configuration.
- [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app): loopback consent and PKCE.
- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
- [Codex MCP configuration](https://developers.openai.com/codex/mcp/).
