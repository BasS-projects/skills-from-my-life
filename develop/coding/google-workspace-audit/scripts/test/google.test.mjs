import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleReader } from '../src/google.mjs';
import { SCOPES, safeError } from '../src/common.mjs';
const config = { spreadsheets: [{ id: 'book' }], scripts: [{ id: 'script' }] };
const auth = scopes => ({ getAccessToken: async () => ({ token: 'synthetic-access-token' }), getTokenInfo: async () => ({ scopes }) });

test('Google data adapter permits only allowlisted GET endpoints and preserves raw formula fields', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url: new URL(url), options }); return new Response('{}', { status: 200 }); });
  const reader = new GoogleReader(config, auth(SCOPES));
  await reader.metadata('book');
  await reader.page('book', { title: "O'Brien" }, { r1: 1, r2: 2, c1: 1, c2: 3 });
  await reader.script({ id: 'script', versionNumber: 3 });
  assert.ok(calls.every(c => c.options.method === 'GET' && c.options.redirect === 'error'));
  assert.equal(calls[1].url.searchParams.get('ranges'), "'O''Brien'!A1:C2");
  assert.ok(calls[1].url.searchParams.get('fields').includes('userEnteredValue'));
  assert.equal(calls[2].url.searchParams.get('versionNumber'), '3');
  await assert.rejects(() => reader.metadata('other'), /allowlist/);
  await assert.rejects(() => reader.read('scripts', 'script', ':run'), /Unsupported/);
  assert.equal(calls.length, 3);
});
test('broad token never reaches a Google data endpoint', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not be called'); });
  const reader = new GoogleReader(config, auth([...SCOPES, 'https://www.googleapis.com/auth/spreadsheets']));
  await assert.rejects(() => reader.metadata('book'), /broader grants/);
  assert.equal(fetchMock.mock.callCount(), 0);
});
test('a refreshed token is scope checked again', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const reader = new GoogleReader(config, { getAccessToken: async () => ({ token: String(++count) }), getTokenInfo: async token => ({ scopes: token === '1' ? SCOPES : [...SCOPES, 'write'] }) });
  await reader.metadata('book');
  await assert.rejects(() => reader.metadata('book'), /exactly/);
});
test('retryable reads stop after four attempts and errors do not expose response bodies', async t => {
  const sleeps = [];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('SENSITIVE RESPONSE BODY', { status: 429 }));
  const reader = new GoogleReader(config, auth(SCOPES), { sleep: async ms => { sleeps.push(ms); } });
  await assert.rejects(() => reader.metadata('book'), e => safeError(e) === 'Google read returned HTTP 429.');
  assert.equal(fetchMock.mock.callCount(), 4);
  assert.deepEqual(sleeps, [500, 1000, 2000]);
});
test('authorization failures are not retried', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('private', { status: 403 }));
  const reader = new GoogleReader(config, auth(SCOPES));
  await assert.rejects(() => reader.metadata('book'));
  assert.equal(fetchMock.mock.callCount(), 1);
});
