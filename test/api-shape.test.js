// One shape for every API answer, real 404s, and the /api/v1 prefix. Run with: npm test
//
// Tests that need an answer from the Python chatbot are skipped when `python` is not available.
import { test, before, after, afterEach } from 'node:test';
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
const { sessionKey } = await import('../util/chatSession.js');
const { pythonAvailable } = await import('../util/python.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = path.join(root, 'temp');
const needsPython = { skip: !pythonAvailable() && 'python is not available' };

const originalPython = process.env.PYTHON;
afterEach(() => {
  if (originalPython === undefined) delete process.env.PYTHON;
  else process.env.PYTHON = originalPython;
});

let server;
let base;
const usedKeys = [];

before(async () => {
  initUserStore({ mongoConnected: false });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
  for (const key of usedKeys) {
    for (const name of [`state_${key}.json`, `message_${key}.txt`]) {
      fs.rmSync(path.join(tempDir, name), { force: true });
    }
  }
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
  for (const file of ['public/js/auth.js', 'public/login.html', 'public/signup.html']) {
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
    ['chat without a token', send('/api/v1/chatbot/greeting'), 401],
    ['chat with no message', send('/api/v1/chatbot/message', { method: 'POST', body: {}, token: account.token }), 400]
  ];
  for (const [label, request, status] of cases) {
    await assertErrorShape(await request, status, label);
  }
});

// --- Chat answers --------------------------------------------------------------------------

test('chat answers say success: true next to the session id and reply', needsPython, async () => {
  const account = await register();

  const greeting = await send('/api/v1/chatbot/greeting', { token: account.token });
  assert.equal(greeting.status, 200);
  const first = await greeting.json();
  assert.equal(first.success, true);
  assert.match(first.sessionId, /^[0-9a-f-]{36}$/);
  assert.match(first.response, /Sutkeri/);
  usedKeys.push(sessionKey(account.id, first.sessionId));

  const message = await send('/api/v1/chatbot/message', {
    method: 'POST',
    body: { message: 'hello' },
    token: account.token,
    headers: { 'x-session-id': first.sessionId }
  });
  assert.equal(message.status, 200);
  const reply = await message.json();
  assert.equal(reply.success, true);
  assert.equal(reply.sessionId, first.sessionId);
  assert.equal(typeof reply.response, 'string');
});

test('when the chatbot cannot run, chat answers are a 503 with the common shape, not a friendly 200', async () => {
  const account = await register();
  process.env.PYTHON = 'no-such-python-command';

  const greeting = await send('/api/v1/chatbot/greeting', { token: account.token });
  const greetingBody = await assertErrorShape(greeting, 503, 'greeting');
  assert.match(greetingBody.message, /not available/);

  const sessionId = randomUUID();
  const key = sessionKey(account.id, sessionId);
  usedKeys.push(key);
  const message = await send('/api/v1/chatbot/message', {
    method: 'POST',
    body: { message: 'hello' },
    token: account.token,
    headers: { 'x-session-id': sessionId }
  });
  await assertErrorShape(message, 503, 'message');

  // The failed request does not leave its message file behind
  assert.equal(fs.existsSync(path.join(tempDir, `message_${key}.txt`)), false);
});
