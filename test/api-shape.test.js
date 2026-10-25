// One shape for every API answer, real 404s, and the /api/v1 prefix. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-shape-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let server;
let base;

before(async () => {
  initUserStore({ mongoConnected: false });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const send = (route, { method = 'GET', body, raw, token, headers } = {}) =>
  fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });

async function register(prefix = '/api/v1') {
  const email = `shape-${randomUUID()}@example.com`;
  const res = await send(`${prefix}/auth/register`, {
    method: 'POST',
    body: { name: 'Shape Test', email, password: 'a-long-password' }
  });
  assert.equal(res.status, 201);
  const { token, user } = await res.json();
  return { token, id: user.id, email };
}

// Every API error is exactly { success: false, message }
async function assertErrorShape(res, status, label) {
  assert.equal(res.status, status, label);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['message', 'success'], label);
  assert.equal(body.success, false, label);
  assert.equal(typeof body.message, 'string', label);
  assert.ok(body.message.length > 0, label);
  return body;
}

// --- Pages ---------------------------------------------------------------------------------

test('an unknown address is a real 404 page, not the home page', async () => {
  for (const url of ['/nope', '/a/b/c', '/login', '/report.htm']) {
    const res = await send(url);
    assert.equal(res.status, 404, url);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /Page not found/, url);
  }
});

test('a 404 for a non-GET request is the same page', async () => {
  const res = await send('/nope', { method: 'POST', body: {} });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Page not found/);
});

test('real pages still load', async () => {
  for (const url of ['/', '/login.html', '/signup.html', '/aboutus.html', '/chat', '/chat.html']) {
    assert.equal((await send(url)).status, 200, url);
  }
  const home = await fetch(`${base}/home`, { redirect: 'manual' });
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/');
});

test('the 404 page only links to things that exist', async () => {
  const html = await (await send('/nope')).text();
  const targets = [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)].map(match => match[1]);
  assert.ok(targets.includes('/css/site.css') && targets.includes('/js/auth.js'));
  for (const target of new Set(targets)) {
    assert.equal((await send(target)).status, 200, target);
  }
});

test('the pages call the versioned API', () => {
  for (const file of ['public/js/auth.js', 'public/js/pages/login.js', 'public/js/pages/signup.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /\/api\/v1\/auth\//, file);
    assert.doesNotMatch(source, /['"`]\/api\/auth\//, file);
  }
});

// --- Versions ------------------------------------------------------------------------------

test('/api/v1 and the older /api paths are the same API', async () => {
  const account = await register('/api/v1');

  const login = await send('/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: 'a-long-password' }
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();

  for (const prefix of ['/api/v1', '/api']) {
    const me = await send(`${prefix}/auth/me`, { token });
    assert.equal(me.status, 200, prefix);
    assert.equal((await me.json()).data.email, account.email);
  }
});

test('the two paths share one sign-in allowance, so switching paths gains nothing', async () => {
  const account = await register();
  const wrong = prefix => send(`${prefix}/auth/login`, {
    method: 'POST',
    body: { email: account.email, password: 'wrong-password' }
  });

  for (let i = 0; i < 8; i++) {
    assert.equal((await wrong(i % 2 ? '/api' : '/api/v1')).status, 401);
  }
  // Both are now blocked, whichever path is used
  await assertErrorShape(await wrong('/api/v1'), 429, 'v1 blocked');
  await assertErrorShape(await wrong('/api'), 429, 'unversioned blocked');
});

// --- Error shape ---------------------------------------------------------------------------

test('unknown API paths are a JSON 404 under both prefixes', async () => {
  for (const url of ['/api/nope', '/api/v1', '/api/v1/nope', '/api/v1/auth/nope']) {
    const body = await assertErrorShape(await send(url), 404, url);
    assert.equal(body.message, 'Not found');
  }
});

test('every kind of API failure has the same { success, message } shape', async () => {
  const account = await register();
  const cases = [
    ['register with nothing', send('/api/v1/auth/register', { method: 'POST', body: {} }), 400],
    ['login with a wrong password', send('/api/v1/auth/login', { method: 'POST', body: { email: account.email, password: 'nope-nope-nope' } }), 401],
    ['me without a token', send('/api/v1/auth/me'), 401],
    ['me with a bad token', send('/api/v1/auth/me', { token: 'not-a-token' }), 401],
    ['broken JSON body', send('/api/v1/auth/login', { method: 'POST', raw: '{bad json' }), 400],
    ['a request body that is too large', send('/api/v1/auth/login', { method: 'POST', raw: JSON.stringify({ x: 'a'.repeat(200_000) }) }), 413],
    ['saved chats without a token', send('/api/v1/conversations'), 401],
    ['the AI conversation without a token', send('/api/v1/assistant/reply', { method: 'POST', body: { messages: [] } }), 401],
    ['deleting the account with no password', send('/api/v1/account', { method: 'DELETE', body: {}, token: account.token }), 400]
  ];
  for (const [label, request, status] of cases) {
    await assertErrorShape(await request, status, label);
  }
});

// --- The removed chat API ------------------------------------------------------------------

test('the old server-side chat API is gone: a JSON 404 under both prefixes, with or without a sign-in', async () => {
  const account = await register();
  for (const prefix of ['/api/v1', '/api']) {
    for (const [route, method] of [['/chatbot/greeting', 'GET'], ['/chatbot/message', 'POST']]) {
      for (const token of [undefined, account.token]) {
        const body = await assertErrorShape(await send(prefix + route, { method, body: method === 'POST' ? { message: 'hello' } : undefined, token }), 404, prefix + route);
        assert.equal(body.message, 'Not found');
      }
    }
  }
});
