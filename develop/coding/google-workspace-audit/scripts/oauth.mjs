#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseArgs } from 'node:util';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { SCOPES, assertScopes } from './src/common.mjs';

// Run locally for initial consent. The loopback listener accepts only a matching random state.
try {
  const { values: args } = parseArgs({ options: { client: { type: 'string' }, out: { type: 'string' } } });
  if (!args.client || !args.out) throw new Error('Usage: node oauth.mjs --client /path/client_secret.json --out ../.secrets/token.json');
  const credentials = JSON.parse(await readFile(resolve(args.client), 'utf8')).installed;
  if (!credentials?.client_id || !credentials.client_secret) throw new Error('Use a Google OAuth Desktop app client JSON.');
  const server = createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const redirect = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const client = new OAuth2Client(credentials.client_id, credentials.client_secret, redirect);
  const state = randomBytes(32).toString('hex');
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const timer = setTimeout(() => { console.error('Consent timed out after 5 minutes.'); server.close(); process.exitCode = 1; }, 300000);
  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: false, scope: SCOPES, state, code_challenge: codeChallenge, code_challenge_method: 'S256' });
  console.log('Open this consent URL in your own browser. Do not share the resulting token file.\n' + authUrl);
  let consumed = false;
  server.on('request', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, redirect), incoming = url.searchParams.get('state') ?? '';
    if (req.method !== 'GET' || url.pathname !== '/oauth2callback' || !/^[a-f0-9]{64}$/.test(incoming) || !timingSafeEqual(Buffer.from(incoming), Buffer.from(state))) { res.writeHead(400); res.end('Invalid callback.'); return; }
    if (consumed) { res.writeHead(409); res.end('Callback already consumed.'); return; }
    consumed = true;
    try {
      if (!url.searchParams.get('code') || url.searchParams.has('error')) throw new Error('Consent was not completed.');
      const { tokens } = await client.getToken({ code: url.searchParams.get('code'), codeVerifier, redirect_uri: redirect });
      if (!tokens.refresh_token || !tokens.access_token) throw new Error('Offline token missing.');
      assertScopes((await client.getTokenInfo(tokens.access_token)).scopes);
      const out = resolve(args.out);
      await mkdir(dirname(out), { recursive: true, mode: 0o700 });
      await writeFile(out, JSON.stringify({ type: 'authorized_user', client_id: credentials.client_id, client_secret: credentials.client_secret, refresh_token: tokens.refresh_token, scopes: SCOPES }), { mode: 0o600, flag: 'wx' });
      res.end('Read-only authorization saved. You can close this tab.');
      console.log('Read-only token saved to the requested file.');
    } catch {
      res.writeHead(400); res.end('Authorization failed. Check consent scopes, Desktop client setup, and that the output file does not already exist.');
      console.error('Authorization failed; no credentials were printed. Use a dedicated client granting only the two read-only scopes.');
      process.exitCode = 1;
    } finally { clearTimeout(timer); server.close(); }
  });
} catch (e) { console.error(e.message?.startsWith('Usage:') ? e.message : 'OAuth setup failed. Check the Desktop client JSON and local listener availability.'); process.exitCode = 1; }
