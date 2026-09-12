import { OAuth2Client } from 'google-auth-library';
import { readFile } from 'node:fs/promises';
import { SCOPES, assertScopes, quoteSheet, column } from './common.mjs';

export async function loadOAuth() {
  const raw = process.env.GOOGLE_OAUTH_TOKEN_JSON ?? (process.env.GOOGLE_OAUTH_TOKEN_FILE ? await readFile(process.env.GOOGLE_OAUTH_TOKEN_FILE, 'utf8') : null);
  if (!raw) throw new Error('Set GOOGLE_OAUTH_TOKEN_FILE or GOOGLE_OAUTH_TOKEN_JSON.');
  const data = JSON.parse(raw);
  if (data.type !== 'authorized_user' || !data.client_id || !data.client_secret || !data.refresh_token) throw new Error('Use the authorized_user token produced by oauth.mjs.');
  const client = new OAuth2Client(data.client_id, data.client_secret);
  client.setCredentials({ refresh_token: data.refresh_token });
  return client;
}

export class GoogleReader {
  constructor(config, auth, { sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    this.books = new Set(config.spreadsheets.map(x => x.id));
    this.scripts = new Set(config.scripts.map(x => x.id));
    this.auth = auth;
    this.sleep = sleep;
    this.validatedToken = null;
  }
  async authorize() {
    const result = await this.auth.getAccessToken();
    const token = typeof result === 'string' ? result : result.token;
    if (!token) throw new Error('No OAuth access token.');
    if (token !== this.validatedToken) {
      assertScopes((await this.auth.getTokenInfo(token)).scopes);
      this.validatedToken = token;
    }
    return token;
  }
  async read(kind, id, suffix, params = {}) {
    if (!(kind === 'sheets' ? this.books : this.scripts).has(id)) throw new Error('ID is outside the configured allowlist.');
    if (!(kind === 'sheets' && suffix === '' || kind === 'scripts' && suffix === '/content')) throw new Error('Unsupported read endpoint.');
    const base = kind === 'sheets' ? 'https://sheets.googleapis.com/v4/spreadsheets/' : 'https://script.googleapis.com/v1/projects/';
    const url = new URL(base + encodeURIComponent(id) + suffix);
    for (const [key, value] of Object.entries(params)) for (const item of [].concat(value)) url.searchParams.append(key, String(item));
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await this.authorize();
      try {
        // The Google data path has only GET endpoints. OAuth refresh happens in the auth library.
        const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(60000) });
        if (res.ok) return await res.json();
        const error = new Error('Google read failed.');
        error.status = res.status;
        error.safeMessage = `Google read returned HTTP ${res.status}.`;
        await res.body?.cancel();
        throw error;
      } catch (e) {
        const retry = [429, 500, 502, 503, 504].includes(e.status) || ['TimeoutError', 'AbortError'].includes(e.name);
        if (!retry || attempt === 3) throw e;
        await this.sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
  }
  metadata(id) {
    return this.read('sheets', id, '', { fields: 'spreadsheetId,properties(title,locale,timeZone),namedRanges,sheets(properties,charts)' });
  }
  page(id, sheet, box) {
    const range = `${quoteSheet(sheet.title)}!${column(box.c1)}${box.r1}:${column(box.c2)}${box.r2}`;
    return this.read('sheets', id, '', { ranges: range, includeGridData: true, fields: 'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,note,dataValidation,hyperlink))))' });
  }
  script(spec) { return this.read('scripts', spec.id, '/content', spec.versionNumber ? { versionNumber: spec.versionNumber } : {}); }
}
export { SCOPES };
