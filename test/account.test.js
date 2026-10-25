// Taking your data with you, deleting it, and letting old chats expire. Run with: npm test
//
// Uses the local files in a temporary folder by default. Set TEST_MONGO_URI to a MongoDB to run
// the same tests against the MongoDB store.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-account-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.HISTORY_RATE_LIMIT = '1000';
delete process.env.CHAT_HISTORY_DAYS;
delete process.env.CORS_ORIGIN;

const useMongo = Boolean(process.env.TEST_MONGO_URI);
if (!useMongo) process.env.AUTH_STORE = 'file';

const { createApp } = await import('../app.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const { getHistoryStore, sweepHistory, retentionDays } = await import('../util/historyStore.js');
const { signToken } = await import('../util/jwt.js');
const { ownerPrefix } = await import('../util/chatSession.js');
const { removeChatFilesFor } = await import('../util/tempCleanup.js');
const mongoose = (await import('mongoose')).default;

const tempDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'temp');
const PASSWORD = 'a-long-password';

let server;
let base;

before(async () => {
  if (useMongo) {
    await mongoose.connect(process.env.TEST_MONGO_URI);
    await (await import('../models/User.js')).default.init();
    await (await import('../models/Conversation.js')).default.init();
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

beforeEach(() => {
  delete process.env.CHAT_HISTORY_DAYS;
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

const json = async res => ({ status: res.status, body: await res.json() });

// Accounts are made straight in the user store, so sign-up's own rate limit is not involved
async function newAccount(name = 'Priya Sharma') {
  const email = `account-${randomUUID()}@example.com`;
  const user = await getUserStore().create({ name, email, password: PASSWORD });
  return { token: signToken(user), id: user.id, name, email };
}

// A saved chat with some messages, made through the store
async function saveChat(account, messages) {
  const history = getHistoryStore();
  const chat = await history.create(account.id);
  await history.append(account.id, chat.id, messages);
  return chat.id;
}

const deleteAccount = (account, password) => api('/api/v1/account', { method: 'DELETE', token: account.token, body: { password } });

// --- Taking your data with you -----------------------------------------------------------------

test('the export holds the account details and every saved chat, in order, as a download', async () => {
  const account = await newAccount();
  await saveChat(account, [{ role: 'bot', text: 'Hi there!' }, { role: 'user', text: 'I feel tired' }]);
  await saveChat(account, [{ role: 'user', text: 'Another day' }]);

  const res = await api('/api/v1/account/export', { token: account.token });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename=".+\.json"$/);
  const data = await res.json();

  assert.equal(data.account.id, account.id);
  assert.equal(data.account.name, account.name);
  assert.equal(data.account.email, account.email);
  assert.ok(!Number.isNaN(Date.parse(data.exportedAt)));
  assert.equal(data.chats.length, 2);
  const texts = data.chats.flatMap(chat => chat.messages.map(m => `${m.role}:${m.text}`)).sort();
  assert.deepEqual(texts, ['bot:Hi there!', 'user:Another day', 'user:I feel tired']);
  assert.ok(data.chats.every(chat => chat.messages.every(m => m.at)), 'messages keep their times');
});

test('the export never contains a password or its hash', async () => {
  const account = await newAccount();
  const text = await (await api('/api/v1/account/export', { token: account.token })).text();
  assert.equal(text.includes(PASSWORD), false);
  assert.equal(/\$2[aby]\$/.test(text), false, 'no bcrypt hash');
  assert.equal(/password/i.test(text.replace(/Passwords are never stored[^"]*/, '')), false, 'no password field');
});

test('the export holds only the signed-in account\'s own data', async () => {
  const alice = await newAccount('Alice');
  const bob = await newAccount('Bob');
  await saveChat(alice, [{ role: 'user', text: 'alice\'s private words' }]);
  await saveChat(bob, [{ role: 'user', text: 'bob\'s private words' }]);

  const text = await (await api('/api/v1/account/export', { token: bob.token })).text();
  assert.ok(text.includes('bob\'s private words'));
  for (const secret of ['alice\'s private words', alice.email, alice.id, 'Alice']) {
    assert.equal(text.includes(secret), false, `Bob's export must not contain "${secret}"`);
  }
});

test('an account with no chats exports cleanly', async () => {
  const account = await newAccount();
  const data = await (await api('/api/v1/account/export', { token: account.token })).json();
  assert.deepEqual(data.chats, []);
});

test('the export and the deletion need a signed-in account', async () => {
  assert.equal((await api('/api/v1/account/export')).status, 401);
  assert.equal((await api('/api/v1/account', { method: 'DELETE', body: { password: PASSWORD } })).status, 401);
  assert.equal((await api('/api/v1/account/export', { token: 'not-a-token' })).status, 401);
});

// --- Deleting the account ----------------------------------------------------------------------

test('deleting needs the password: without it, or with a wrong one, nothing is deleted', async () => {
  const account = await newAccount();
  await saveChat(account, [{ role: 'user', text: 'keep me' }]);

  for (const password of [undefined, '', 42, 'wrong-password']) {
    const { status, body } = await json(await deleteAccount(account, password));
    assert.equal(status, password === 'wrong-password' ? 403 : 400, String(password));
    assert.deepEqual(Object.keys(body).sort(), ['message', 'success']);
    assert.equal(body.success, false);
  }
  assert.equal((await getHistoryStore().list(account.id)).length, 1, 'the chat is still there');
  assert.equal((await api('/api/v1/auth/me', { token: account.token })).status, 200, 'the account still works');
});

test('a wrong password is a 403, so the page does not mistake it for an ended session', async () => {
  const account = await newAccount();
  assert.equal((await deleteAccount(account, 'wrong-password')).status, 403);
  assert.equal((await api('/api/v1/auth/me', { token: account.token })).status, 200, 'still signed in after the typo');
});

test('the right password deletes the account, every chat, and ends every sign-in', async () => {
  const account = await newAccount();
  const other = await newAccount();
  await saveChat(account, [{ role: 'user', text: 'one' }]);
  await saveChat(account, [{ role: 'user', text: 'two' }]);
  const othersChat = await saveChat(other, [{ role: 'user', text: 'not yours to touch' }]);

  const { status, body } = await json(await deleteAccount(account, PASSWORD));
  assert.equal(status, 200);
  assert.equal(body.success, true);

  // The account is gone: it cannot sign in, and its sign-in token no longer works anywhere
  const login = await api('/api/v1/auth/login', { method: 'POST', body: { email: account.email, password: PASSWORD } });
  assert.equal(login.status, 401);
  for (const route of ['/api/v1/auth/me', '/api/v1/conversations', '/api/v1/account/export']) {
    assert.equal((await api(route, { token: account.token })).status, 401, route);
  }

  // Its chats are gone from the store itself, not just hidden
  assert.deepEqual(await getHistoryStore().list(account.id), []);

  // Nobody else was touched
  assert.equal((await api('/api/v1/auth/me', { token: other.token })).status, 200);
  assert.equal((await getHistoryStore().get(other.id, othersChat)).messages[0].text, 'not yours to touch');
});

test('the chatbot\'s leftover session files for the account go too, and only that account\'s', async () => {
  const account = await newAccount();
  const other = await newAccount();
  fs.mkdirSync(tempDir, { recursive: true });
  const files = [
    `state_${ownerPrefix(account.id)}_session-a.json`, `message_${ownerPrefix(account.id)}_session-a.txt`,
    `state_${ownerPrefix(other.id)}_session-b.json`
  ];
  files.forEach(name => fs.writeFileSync(path.join(tempDir, name), '{}'));
  try {
    assert.equal((await deleteAccount(account, PASSWORD)).status, 200);
    assert.equal(fs.existsSync(path.join(tempDir, files[0])), false);
    assert.equal(fs.existsSync(path.join(tempDir, files[1])), false);
    assert.equal(fs.existsSync(path.join(tempDir, files[2])), true, 'another account\'s file stays');
  } finally {
    files.forEach(name => fs.rmSync(path.join(tempDir, name), { force: true }));
  }
});

test('the email can be used again afterwards, and the new account starts empty', async () => {
  const account = await newAccount();
  await saveChat(account, [{ role: 'user', text: 'old words' }]);
  await deleteAccount(account, PASSWORD);

  const again = await getUserStore().create({ name: 'New Person', email: account.email, password: PASSWORD });
  assert.notEqual(again.id, account.id);
  assert.deepEqual(await getHistoryStore().list(again.id), []);
});

test('deleting twice is refused the second time: the account is already gone', async () => {
  const account = await newAccount();
  assert.equal((await deleteAccount(account, PASSWORD)).status, 200);
  assert.equal((await deleteAccount(account, PASSWORD)).status, 401);
});

test('another account\'s sign-in cannot delete yours, even with your password', async () => {
  const alice = await newAccount('Alice');
  const bob = await newAccount('Bob');
  // Bob's token with Alice's (identical) password still only ever means Bob's own account
  assert.equal((await deleteAccount(bob, 'not-bobs-password')).status, 403);
  assert.equal((await api('/api/v1/auth/me', { token: alice.token })).status, 200);
});

test('the password cannot be guessed through the deletion route: five wrong tries and it waits', async () => {
  const account = await newAccount();
  const other = await newAccount();
  for (let i = 0; i < 5; i++) assert.equal((await deleteAccount(account, `wrong-${i}`)).status, 403);

  const blocked = await deleteAccount(account, PASSWORD); // even the right one now waits
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  assert.deepEqual(Object.keys(await blocked.json()).sort(), ['message', 'success']);
  assert.equal((await api('/api/v1/auth/me', { token: account.token })).status, 200, 'the account was not deleted');

  assert.equal((await deleteAccount(other, 'wrong')).status, 403, 'another account has its own allowance');
});

test('a right password after a few wrong ones starts the count again', async () => {
  const account = await newAccount();
  for (let i = 0; i < 3; i++) await deleteAccount(account, 'wrong');
  assert.equal((await deleteAccount(account, PASSWORD)).status, 200);
});

test('deleting an unknown user is a no-op', async () => {
  assert.equal(await getUserStore().deleteUser(useMongo ? '507f1f77bcf86cd799439011' : randomUUID()), false);
});

// --- Cleaning up session files directly --------------------------------------------------------

test('only the named account\'s chatbot files are removed, and nothing else in the folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-session-files-'));
  try {
    const mine = ownerPrefix('user-1');
    const theirs = ownerPrefix('user-2');
    const files = [`state_${mine}_a.json`, `message_${mine}_a.txt`, `state_${theirs}_a.json`, 'notes.txt', `state_${mine}.json`];
    files.forEach(name => fs.writeFileSync(path.join(dir, name), '{}'));
    assert.equal(removeChatFilesFor(dir, 'user-1'), 2);
    assert.deepEqual(fs.readdirSync(dir).sort(), [`state_${mine}.json`, `state_${theirs}_a.json`, 'notes.txt'].sort());
    assert.equal(removeChatFilesFor(path.join(dir, 'no-such-folder'), 'user-1'), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Letting old chats expire ------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

test('chats are kept for ever unless expiry is switched on', async () => {
  const account = await newAccount();
  await saveChat(account, [{ role: 'user', text: 'still here' }]);
  assert.equal(retentionDays(), 0);
  assert.equal(await sweepHistory(Date.now() + 5000 * DAY), 0);
  assert.equal((await getHistoryStore().list(account.id)).length, 1);
});

test('the setting is read sensibly', () => {
  for (const [value, expected] of [[undefined, 0], ['', 0], ['abc', 0], ['-5', 0], ['0', 0], ['30', 30], ['2.9', 2]]) {
    if (value === undefined) delete process.env.CHAT_HISTORY_DAYS; else process.env.CHAT_HISTORY_DAYS = value;
    assert.equal(retentionDays(), expected, String(value));
  }
});

test('a chat is deleted once that many days have passed since its last message; a recent one stays', async (t) => {
  process.env.CHAT_HISTORY_DAYS = '30';
  const start = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now: start });

  const alice = await newAccount('Alice');
  const bob = await newAccount('Bob');
  const idle = await saveChat(alice, [{ role: 'user', text: 'left alone for a month' }]);
  const revisited = await saveChat(alice, [{ role: 'user', text: 'started long ago' }]);
  const bobsOld = await saveChat(bob, [{ role: 'user', text: 'bob\'s old chat' }]);

  // Twenty-five days later one chat gets a new message
  t.mock.timers.setTime(start + 25 * DAY);
  await getHistoryStore().append(alice.id, revisited, [{ role: 'user', text: 'back again' }]);
  const fresh = await saveChat(bob, [{ role: 'user', text: 'a new chat' }]);

  // Thirty-one days after the start: the untouched chats are past 30 days, the others are not
  t.mock.timers.setTime(start + 31 * DAY);
  assert.equal(await sweepHistory(), 2);

  const ids = async account => (await getHistoryStore().list(account.id)).map(chat => chat.id);
  assert.deepEqual(await ids(alice), [revisited], 'a chat that was revisited stays');
  assert.deepEqual(await ids(bob), [fresh], 'expiry applies to everyone, and a new chat stays');
  assert.equal(await getHistoryStore().get(alice.id, idle), null);
  assert.equal(await getHistoryStore().get(bob.id, bobsOld), null);
});

test('a chat exactly at the limit is kept, and the day after it goes', async (t) => {
  process.env.CHAT_HISTORY_DAYS = '10';
  // Expiry covers everyone's chats, so start from an empty store: chats left by earlier tests
  // would count too
  await getHistoryStore().removeOlderThan(new Date('2100-01-01'));
  const start = Date.UTC(2026, 5, 1);
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const account = await newAccount();
  await saveChat(account, [{ role: 'user', text: 'borderline' }]);

  t.mock.timers.setTime(start + 10 * DAY);
  assert.equal(await sweepHistory(), 0);
  t.mock.timers.setTime(start + 10 * DAY + 1000);
  assert.equal(await sweepHistory(), 1);
});

test('the list of chats tells the page how long they are kept', async () => {
  const account = await newAccount();
  assert.equal((await json(await api('/api/v1/conversations', { token: account.token }))).body.retentionDays, 0);
  process.env.CHAT_HISTORY_DAYS = '90';
  assert.equal((await json(await api('/api/v1/conversations', { token: account.token }))).body.retentionDays, 90);
});
