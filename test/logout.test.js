// Signing out ends a token on the server. Run with: npm test
//
// Uses the local user file in a temporary folder by default. Set TEST_MONGO_URI to a MongoDB
// to run the same tests against the real MongoDB store (the clean-up test is file-only).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-logout-test-'));
process.env.JWT_SECRET = SECRET;
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;

const useMongo = Boolean(process.env.TEST_MONGO_URI);
if (!useMongo) process.env.AUTH_STORE = 'file';

const { createApp } = await import('../app.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const mongoose = (await import('mongoose')).default;

let server;
let base;

before(async () => {
  if (useMongo) {
    await mongoose.connect(process.env.TEST_MONGO_URI);
    await (await import('../models/User.js')).default.init();
    await (await import('../models/RevokedToken.js')).default.init();
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
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const api = (route, { method = 'GET', body, token } = {}) =>
  fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

async function newAccount() {
  const email = `logout-${randomUUID()}@example.com`;
  const res = await api('/api/v1/auth/register', {
    method: 'POST',
    body: { name: 'Logout Test', email, password: 'a-long-password' }
  });
  const { token, user } = await res.json();
  return { email, token, user };
}

const signIn = async ({ email }) =>
  (await (await api('/api/v1/auth/login', { method: 'POST', body: { email, password: 'a-long-password' } })).json()).token;

const meStatus = async token => (await api('/api/v1/auth/me', { token })).status;

test('every token carries its own id, even two issued in the same second', async () => {
  const account = await newAccount();
  const second = await signIn(account);
  const third = await signIn(account);
  const ids = [account.token, second, third].map(token => jwt.decode(token).jti);
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, 3);
});

test('signing out ends the token at once', async () => {
  const { token } = await newAccount();
  assert.equal(await meStatus(token), 200);

  const out = await api('/api/v1/auth/logout', { method: 'POST', token });
  assert.equal(out.status, 200);
  assert.deepEqual(await out.json(), { success: true, message: 'Signed out' });

  const after = await api('/api/v1/auth/me', { token });
  assert.equal(after.status, 401);
  assert.match((await after.json()).message, /signed out/i);
});

test('a signed-out token is refused everywhere, not only on /me', async () => {
  const { token } = await newAccount();
  await api('/api/v1/auth/logout', { method: 'POST', token });
  assert.equal((await api('/api/v1/chatbot/greeting', { token })).status, 401);
  assert.equal((await api('/api/v1/auth/logout', { method: 'POST', token })).status, 401);
});

test('only the token that signed out is ended; the account\'s other sign-ins keep working', async () => {
  const account = await newAccount();
  const phone = await signIn(account);
  const laptop = await signIn(account);

  await api('/api/v1/auth/logout', { method: 'POST', token: phone });

  assert.equal(await meStatus(phone), 401);
  assert.equal(await meStatus(laptop), 200);
  assert.equal(await meStatus(account.token), 200);
});

test('the account can sign in again after signing out', async () => {
  const account = await newAccount();
  await api('/api/v1/auth/logout', { method: 'POST', token: account.token });
  const fresh = await signIn(account);
  assert.equal(await meStatus(fresh), 200);
});

test('signing out needs a valid token', async () => {
  assert.equal((await api('/api/v1/auth/logout', { method: 'POST' })).status, 401);
  assert.equal((await api('/api/v1/auth/logout', { method: 'POST', token: 'not-a-token' })).status, 401);
});

test('the older /api path signs out too', async () => {
  const { token } = await newAccount();
  assert.equal((await api('/api/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal(await meStatus(token), 401);
});

test('a sign-out is remembered after the server restarts', async () => {
  const { token } = await newAccount();
  await api('/api/v1/auth/logout', { method: 'POST', token });

  // A restart builds the user store again from what is on disk (or in MongoDB)
  initUserStore({ mongoConnected: useMongo });
  assert.equal(await meStatus(token), 401);
});

test('a token from before sign-out existed has no id: it still works and simply runs until it expires', async () => {
  const { user } = await newAccount();
  const legacy = jwt.sign({ id: user.id }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  assert.equal(await meStatus(legacy), 200);
  assert.equal((await api('/api/v1/auth/logout', { method: 'POST', token: legacy })).status, 200);
  assert.equal(await meStatus(legacy), 200);
});

test('expired sign-outs are dropped from the file, so the list does not grow forever',
  { skip: useMongo }, async () => {
    const file = path.join(dataDir, 'users.json');
    const store = getUserStore();
    const nowSeconds = Math.floor(Date.now() / 1000);

    await store.revokeToken('long-expired', nowSeconds - 60);
    assert.ok('long-expired' in JSON.parse(fs.readFileSync(file, 'utf8')).revoked);

    const { token } = await newAccount();
    await api('/api/v1/auth/logout', { method: 'POST', token });

    const revoked = JSON.parse(fs.readFileSync(file, 'utf8')).revoked;
    assert.equal('long-expired' in revoked, false);
    assert.ok(revoked[jwt.decode(token).jti] > Date.now());
  });

test('an expired sign-out entry no longer matters', { skip: useMongo }, async () => {
  const store = getUserStore();
  await store.revokeToken('about-to-lapse', Math.floor(Date.now() / 1000) - 1);
  assert.equal(await store.isTokenRevoked('about-to-lapse'), false);
});
