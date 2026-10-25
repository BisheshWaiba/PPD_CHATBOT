// Authentication tests. Run with: npm test
//
// By default they use the local development user file in a temporary folder.
// Set TEST_MONGO_URI to a MongoDB (for example an in-memory one) to run the same
// tests against the real MongoDB store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { connectTestDatabase, dropTestDatabase } from './support/mongo.js';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-auth-test-'));
process.env.JWT_SECRET = SECRET;
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;

const useMongo = Boolean(process.env.TEST_MONGO_URI);
if (!useMongo) process.env.AUTH_STORE = 'file';

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');
const mongoose = (await import('mongoose')).default;

let server;
let base;

before(async () => {
  if (useMongo) {
    await connectTestDatabase('auth');
    await (await import('../models/User.js')).default.init(); // build the unique email index
    initUserStore({ mongoConnected: true });
  } else {
    initUserStore({ mongoConnected: false });
  }
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (useMongo) {
    await dropTestDatabase();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const api = (route, { method = 'GET', body, token, raw } = {}) =>
  fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });

const json = async res => ({ status: res.status, headers: res.headers, body: await res.json() });

const register = (fields, extra) => api('/api/auth/register', { method: 'POST', body: fields, ...extra }).then(json);
const login = (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } }).then(json);

const alice = { name: 'Alice Rai', email: 'alice@example.com', password: 'correct horse battery' };

// ---------------------------------------------------------------- registration

test('registers a user and returns a token without any password data', async () => {
  const { status, body } = await register(alice);
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.ok(body.token);
  assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'email', 'emailVerified', 'id', 'name', 'role']);
  assert.equal(body.user.emailVerified, false);
  assert.equal(body.user.email, 'alice@example.com');
  assert.equal(body.user.role, 'user');
  assert.ok(!JSON.stringify(body).includes(alice.password));
});

test('stores only a bcrypt hash of the password', { skip: useMongo }, () => {
  const stored = fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8');
  assert.ok(!stored.includes(alice.password), 'plain password must not be on disk');
  assert.match(JSON.parse(stored).users[0].passwordHash, /^\$2[aby]\$/);
});

test('rejects a duplicate email, ignoring case and spaces', async () => {
  const { status, body } = await register({ ...alice, name: 'Someone Else', email: '  ALICE@Example.com ' });
  assert.equal(status, 409);
  assert.equal(body.success, false);
});

for (const [label, fields, expected] of [
  ['a missing name', { ...alice, email: 'n1@example.com', name: '' }, /name/i],
  ['a name that is too long', { ...alice, email: 'n2@example.com', name: 'x'.repeat(51) }, /50/],
  ['an invalid email', { ...alice, email: 'not-an-email' }, /valid email/i],
  ['an email without a domain suffix', { ...alice, email: 'a@b' }, /valid email/i],
  ['a password shorter than 8 characters', { ...alice, email: 'n3@example.com', password: 'abc1234' }, /at least 8/],
  ['a password longer than 72 bytes', { ...alice, email: 'n4@example.com', password: 'a'.repeat(73) }, /too long/i],
  ['a password equal to the email', { ...alice, email: 'samesame@example.com', password: 'samesame@example.com' }, /same as your email/i],
  ['a non-string password', { ...alice, email: 'n5@example.com', password: 12345678 }, /password/i]
]) {
  test(`registration rejects ${label}`, async () => {
    const { status, body } = await register(fields);
    assert.equal(status, 400);
    assert.match(body.message, expected);
  });
}

test('accepts short company domains that the old rules rejected', async () => {
  const { status } = await register({ name: 'Bo Li', email: 'bo@me.io', password: 'a-good-password' });
  assert.equal(status, 201);
});

test('malformed JSON gets a 400, not a stack trace', async () => {
  const res = await api('/api/auth/register', { method: 'POST', raw: '{"name": ' });
  const { status, body } = await json(res);
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.ok(!JSON.stringify(body).includes('SyntaxError'));
});

// ---------------------------------------------------------------------- login

test('signs in with the right password, in any email case', async () => {
  const { status, body } = await login('Alice@EXAMPLE.com', alice.password);
  assert.equal(status, 200);
  assert.ok(body.token);
  assert.equal(body.user.name, 'Alice Rai');
});

test('rejects a wrong password (the old mock accepted anything)', async () => {
  const { status, body } = await login(alice.email, 'wrong password!');
  assert.equal(status, 401);
  assert.equal(body.message, 'Invalid email or password');
  assert.equal(body.token, undefined);
});

test('an unknown email looks exactly like a wrong password', async () => {
  const unknown = await login('nobody@example.com', 'whatever-password');
  const wrong = await login(alice.email, 'another wrong one');
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
});

test('login rejects missing or invalid input', async () => {
  assert.equal((await login('', '')).status, 400);
  assert.equal((await login(alice.email, '')).status, 400);
  assert.equal((await login('not-an-email', 'x')).status, 400);
  const notStrings = await api('/api/auth/login', { method: 'POST', body: { email: { $ne: '' }, password: { $ne: '' } } }).then(json);
  assert.equal(notStrings.status, 400);
});

test('locks an account after repeated failures, then lets other accounts through', async () => {
  const victim = { name: 'Victim', email: 'victim@example.com', password: 'victims-real-password' };
  assert.equal((await register(victim)).status, 201);

  for (let i = 0; i < 8; i++) {
    assert.equal((await login(victim.email, `guess number ${i}`)).status, 401);
  }
  const blocked = await login(victim.email, victim.password); // even the right password
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  assert.equal((await login(alice.email, alice.password)).status, 200);
});

// --------------------------------------------------------------------- tokens

async function tokenFor(user) {
  return (await login(user.email, user.password)).body.token;
}

test('/me returns the signed-in user', async () => {
  const { status, body } = await api('/api/auth/me', { token: await tokenFor(alice) }).then(json);
  assert.equal(status, 200);
  assert.equal(body.data.email, alice.email);
  assert.ok(!('password' in body.data) && !('passwordHash' in body.data));
});

test('/me needs a token', async () => {
  assert.equal((await api('/api/auth/me').then(json)).status, 401);
  assert.equal((await api('/api/auth/me', { token: 'garbage' }).then(json)).status, 401);
});

test('an expired token is refused with a clear message', async () => {
  const { body: { user } } = await login(alice.email, alice.password);
  const expired = jwt.sign({ id: user.id }, SECRET, { expiresIn: '-10s' });
  const { status, body } = await api('/api/auth/me', { token: expired }).then(json);
  assert.equal(status, 401);
  assert.match(body.message, /expired/i);
});

test('a token signed with another secret is refused', async () => {
  const { body: { user } } = await login(alice.email, alice.password);
  const forged = jwt.sign({ id: user.id }, 'some-other-secret'.padEnd(40, 'z'));
  assert.equal((await api('/api/auth/me', { token: forged }).then(json)).status, 401);
});

test('the old mock tokens no longer work, even signed with the old hardcoded secrets', async () => {
  for (const oldSecret of ['momapp_default_jwt_secret_key', 'temporary_secret', 'mock_jwt_secret']) {
    const mock = jwt.sign({ id: 'temp_123', name: 'Mallory', email: 'mallory@example.com' }, oldSecret);
    assert.equal((await api('/api/auth/me', { token: mock }).then(json)).status, 401, oldSecret);
  }
  // Even with the current secret, a "temp_" id is not a real user
  const mockWithRealSecret = jwt.sign({ id: 'temp_123', name: 'Mallory', email: 'm@example.com' }, SECRET);
  assert.equal((await api('/api/auth/me', { token: mockWithRealSecret }).then(json)).status, 401);
});

test('a token for a user that does not exist is refused', async () => {
  const ghost = jwt.sign({ id: randomUUID() }, SECRET);
  const { status, body } = await api('/api/auth/me', { token: ghost }).then(json);
  assert.equal(status, 401);
  assert.match(body.message, /no longer exists/i);
});

test('an unsigned "alg: none" token is refused', async () => {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const { body: { user } } = await login(alice.email, alice.password);
  const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: user.id })}.`;
  assert.equal((await api('/api/auth/me', { token: unsigned }).then(json)).status, 401);
});

// ------------------------------------------------------------ rest of the app

test('the chat history, AI and account APIs need a signed-in user', async () => {
  assert.equal((await api('/api/conversations').then(json)).status, 401);
  assert.equal((await api('/api/conversations', { method: 'POST' }).then(json)).status, 401);
  assert.equal((await api('/api/assistant').then(json)).status, 401);
  assert.equal((await api('/api/assistant/reply', { method: 'POST', body: { messages: [] } }).then(json)).status, 401);
  assert.equal((await api('/api/account/export').then(json)).status, 401);
});

test('unknown API paths return JSON 404', async () => {
  const { status, body } = await api('/api/does-not-exist').then(json);
  assert.equal(status, 404);
  assert.equal(body.success, false);
});

test('sends security headers and serves the site', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  const api404 = await fetch(base + '/api/auth/me');
  assert.equal(api404.headers.get('cache-control'), 'no-store');
});

test('production also blocks framing and sends HSTS; development allows editor previews', async () => {
  assert.equal((await fetch(base + '/')).headers.get('x-frame-options'), null);
  process.env.NODE_ENV = 'production';
  try {
    const res = await fetch(base + '/');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('strict-transport-security'), /max-age=/);
  } finally {
    process.env.NODE_ENV = 'test';
  }
});

// ---------------------------------------------------------- MongoDB-only checks

test('saving a user again does not hash the password a second time', { skip: !useMongo }, async () => {
  const User = (await import('../models/User.js')).default;
  const doc = await User.findOne({ email: alice.email }).select('+password');
  const before = doc.password;
  doc.name = 'Alice Renamed';
  await doc.save();
  assert.equal((await User.findOne({ email: alice.email }).select('+password')).password, before);
  assert.equal((await login(alice.email, alice.password)).status, 200);
});
