// Saved chat history: private to each account, with sensible limits. Run with: npm test
//
// Uses the local files in a temporary folder by default. Set TEST_MONGO_URI to a MongoDB to run
// the same tests against the MongoDB store (the on-disk checks are file-only).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { connectTestDatabase, dropTestDatabase } from './support/mongo.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-history-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.HISTORY_RATE_LIMIT = '400';
delete process.env.CORS_ORIGIN;

const useMongo = Boolean(process.env.TEST_MONGO_URI);
if (!useMongo) process.env.AUTH_STORE = 'file';

const { createApp } = await import('../app.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const { signToken } = await import('../util/jwt.js');
const { MAX_MESSAGES, MAX_CHATS } = await import('../util/historyStore.js');
const { HISTORY_TEXT_MAX, HISTORY_BATCH_MAX } = await import('../util/validation.js');
const mongoose = (await import('mongoose')).default;

let server;
let base;

before(async () => {
  if (useMongo) {
    await connectTestDatabase('history');
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

// Accounts are made straight in the user store: going through sign-up for each one would hit its
// rate limit (10 an hour per address), which is not what these tests are about.
async function newAccount(name = 'History Test') {
  const user = await getUserStore().create({
    name,
    email: `history-${randomUUID()}@example.com`,
    password: 'a-long-password'
  });
  return { token: signToken(user), id: user.id };
}

const json = async res => ({ status: res.status, body: await res.json() });

async function startChat(account) {
  const { status, body } = await json(await api('/api/v1/conversations', { method: 'POST', token: account.token }));
  assert.equal(status, 201);
  return body.data.id;
}

const say = (account, chatId, messages) =>
  api(`/api/v1/conversations/${chatId}/messages`, { method: 'POST', token: account.token, body: { messages } });

// --- The basics ----------------------------------------------------------------------------

test('a new chat starts empty and shows up in the list', async () => {
  const account = await newAccount();
  const created = await json(await api('/api/v1/conversations', { method: 'POST', token: account.token }));
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.deepEqual(Object.keys(created.body.data).sort(), ['id', 'messageCount', 'preview', 'startedAt', 'updatedAt']);
  assert.equal(created.body.data.messageCount, 0);

  const list = await json(await api('/api/v1/conversations', { token: account.token }));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.map(chat => chat.id), [created.body.data.id]);
});

test('messages are saved in order with their roles and times, and the preview is the first thing said', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);

  assert.equal((await say(account, chatId, [{ role: 'bot', text: 'Hi there!' }, { role: 'user', text: 'Continue' }])).status, 200);
  const second = await json(await say(account, chatId, [{ role: 'bot', text: 'May I ask your age?' }, { role: 'user', text: '28' }]));
  assert.equal(second.body.data.messageCount, 4);
  assert.equal(second.body.data.preview, 'Continue');

  const chat = (await json(await api(`/api/v1/conversations/${chatId}`, { token: account.token }))).body.data;
  assert.deepEqual(chat.messages.map(m => [m.role, m.text]), [
    ['bot', 'Hi there!'], ['user', 'Continue'], ['bot', 'May I ask your age?'], ['user', '28']
  ]);
  assert.ok(chat.messages.every(m => !Number.isNaN(Date.parse(m.at))), 'every message has a time');
  assert.ok(Date.parse(chat.updatedAt) >= Date.parse(chat.startedAt));
});

test('the list shows the most recently active chat first, without the messages', async () => {
  const account = await newAccount();
  const older = await startChat(account);
  const newer = await startChat(account);
  await new Promise(resolve => setTimeout(resolve, 15));
  await say(account, older, [{ role: 'user', text: 'I was here first but spoke last' }]);

  const list = (await json(await api('/api/v1/conversations', { token: account.token }))).body.data;
  assert.deepEqual(list.map(chat => chat.id), [older, newer]);
  assert.ok(list.every(chat => !('messages' in chat)));
});

test('a chat is named after the first thing said that says something, not an opener like Continue', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const preview = async () => (await json(await api('/api/v1/conversations', { token: account.token }))).body.data[0].preview;

  // Only openers so far: the first one is used
  await say(account, chatId, [{ role: 'bot', text: 'Hi there!' }, { role: 'user', text: 'Continue' }, { role: 'user', text: '28' }]);
  assert.equal(await preview(), 'Continue');

  // The first real thing said becomes the name, and later messages do not change it
  await say(account, chatId, [{ role: 'user', text: 'not yet' }, { role: 'user', text: 'Causes of postpartum depression' }]);
  assert.equal(await preview(), 'Causes of postpartum depression');
  await say(account, chatId, [{ role: 'user', text: 'something else entirely' }]);
  assert.equal(await preview(), 'Causes of postpartum depression');
});

test('numbers, yes/no and Nepali openers are skipped when naming a chat', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  await say(account, chatId, [
    { role: 'user', text: '1' }, { role: 'user', text: '2.' }, { role: 'user', text: 'Yes' }, { role: 'user', text: 'होइन' },
    { role: 'user', text: 'I have not been sleeping' }
  ]);
  const { preview } = (await json(await api('/api/v1/conversations', { token: account.token }))).body.data[0];
  assert.equal(preview, 'I have not been sleeping');
});

test('the preview is one tidy line, cut to a sensible length', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  await say(account, chatId, [{ role: 'user', text: `  hello\n\n   there  ${'x'.repeat(300)}` }]);
  const { preview } = (await json(await api('/api/v1/conversations', { token: account.token }))).body.data[0];
  assert.match(preview, /^hello there x+$/);
  assert.equal(preview.length, 100);
});

// --- Privacy: each account sees only its own chats --------------------------------------------

test('another account cannot list, read, add to or delete a chat that is not theirs', async () => {
  const alice = await newAccount('Alice');
  const bob = await newAccount('Bob');
  const chatId = await startChat(alice);
  await say(alice, chatId, [{ role: 'user', text: 'something private' }]);

  assert.deepEqual((await json(await api('/api/v1/conversations', { token: bob.token }))).body.data, []);
  assert.equal((await api(`/api/v1/conversations/${chatId}`, { token: bob.token })).status, 404);
  assert.equal((await say(bob, chatId, [{ role: 'user', text: 'let me in' }])).status, 404);
  assert.equal((await api(`/api/v1/conversations/${chatId}`, { method: 'DELETE', token: bob.token })).status, 404);

  // Alice's chat is exactly as she left it
  const chat = (await json(await api(`/api/v1/conversations/${chatId}`, { token: alice.token }))).body.data;
  assert.deepEqual(chat.messages.map(m => m.text), ['something private']);
});

test('"delete all" only deletes the signed-in account\'s chats', async () => {
  const alice = await newAccount('Alice');
  const bob = await newAccount('Bob');
  await startChat(alice); await startChat(alice);
  const bobsChat = await startChat(bob);

  const result = await json(await api('/api/v1/conversations', { method: 'DELETE', token: alice.token }));
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted, 2);
  assert.deepEqual((await json(await api('/api/v1/conversations', { token: alice.token }))).body.data, []);
  assert.deepEqual((await json(await api('/api/v1/conversations', { token: bob.token }))).body.data.map(c => c.id), [bobsChat]);
});

test('every request needs a signed-in account', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const requests = [
    ['GET', '/api/v1/conversations'], ['POST', '/api/v1/conversations'], ['DELETE', '/api/v1/conversations'],
    ['GET', `/api/v1/conversations/${chatId}`], ['DELETE', `/api/v1/conversations/${chatId}`],
    ['POST', `/api/v1/conversations/${chatId}/messages`]
  ];
  for (const [method, route] of requests) {
    const res = await api(route, { method, body: method === 'POST' ? { messages: [] } : undefined });
    assert.equal(res.status, 401, `${method} ${route}`);
  }
  assert.equal((await api('/api/v1/conversations', { token: 'not-a-token' })).status, 401);
});

test('a signed-out token can no longer read the history', async () => {
  const account = await newAccount();
  await startChat(account);
  await api('/api/v1/auth/logout', { method: 'POST', token: account.token });
  assert.equal((await api('/api/v1/conversations', { token: account.token })).status, 401);
});

test('the older /api path is the same history', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const viaOld = await json(await api('/api/conversations', { token: account.token }));
  assert.deepEqual(viaOld.body.data.map(c => c.id), [chatId]);
});

// --- Deleting ----------------------------------------------------------------------------------

test('deleting a chat removes it for good', async () => {
  const account = await newAccount();
  const keep = await startChat(account);
  const drop = await startChat(account);

  const gone = await json(await api(`/api/v1/conversations/${drop}`, { method: 'DELETE', token: account.token }));
  assert.equal(gone.status, 200);
  assert.equal(gone.body.success, true);

  assert.equal((await api(`/api/v1/conversations/${drop}`, { token: account.token })).status, 404);
  assert.equal((await api(`/api/v1/conversations/${drop}`, { method: 'DELETE', token: account.token })).status, 404);
  assert.deepEqual((await json(await api('/api/v1/conversations', { token: account.token }))).body.data.map(c => c.id), [keep]);
});

// --- Input rules -------------------------------------------------------------------------------

test('bad messages are refused with a reason, in the common error shape', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const bad = [
    ['no messages', undefined], ['not a list', 'hello'], ['an empty list', []],
    ['a wrong role', [{ role: 'admin', text: 'hi' }]], ['no role', [{ text: 'hi' }]],
    ['no text', [{ role: 'user' }]], ['blank text', [{ role: 'user', text: '   ' }]],
    ['text that is not text', [{ role: 'user', text: 42 }]], ['a null entry', [null]],
    ['text that is too long', [{ role: 'user', text: 'a'.repeat(HISTORY_TEXT_MAX + 1) }]],
    ['too many at once', Array.from({ length: HISTORY_BATCH_MAX + 1 }, () => ({ role: 'user', text: 'hi' }))]
  ];
  for (const [label, messages] of bad) {
    const { status, body } = await json(await say(account, chatId, messages));
    assert.equal(status, 400, label);
    assert.deepEqual(Object.keys(body).sort(), ['message', 'success'], label);
    assert.equal(body.success, false, label);
  }
  // Nothing from the refused requests was saved
  const chat = (await json(await api(`/api/v1/conversations/${chatId}`, { token: account.token }))).body.data;
  assert.equal(chat.messages.length, 0);
});

test('the largest allowed message and batch are accepted', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const res = await say(account, chatId, Array.from({ length: HISTORY_BATCH_MAX }, () => ({ role: 'bot', text: 'a'.repeat(HISTORY_TEXT_MAX) })));
  assert.equal(res.status, 200);
});

test('ids that are not real chats are a plain 404', async () => {
  const account = await newAccount();
  for (const id of ['nope', '123', 'a'.repeat(65), '..%2F..%2Fusers', randomUUID()]) {
    assert.equal((await api(`/api/v1/conversations/${id}`, { token: account.token })).status, 404, id);
    assert.equal((await say(account, id, [{ role: 'user', text: 'hi' }])).status, 404, id);
  }
});

test('markup in a saved message is stored as plain text and handed back unchanged', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const text = '<img src=x onerror=alert(1)> & <b>bold</b>';
  await say(account, chatId, [{ role: 'user', text }]);
  const chat = (await json(await api(`/api/v1/conversations/${chatId}`, { token: account.token }))).body.data;
  assert.equal(chat.messages[0].text, text);
});

// --- Limits ------------------------------------------------------------------------------------

test('a chat holds at most MAX_MESSAGES messages, and says so clearly', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  const batch = Array.from({ length: HISTORY_BATCH_MAX }, () => ({ role: 'user', text: 'hi' }));

  for (let saved = 0; saved < MAX_MESSAGES; saved += HISTORY_BATCH_MAX) {
    assert.equal((await say(account, chatId, batch)).status, 200);
  }
  const full = await json(await say(account, chatId, [{ role: 'user', text: 'one more' }]));
  assert.equal(full.status, 409);
  assert.equal(full.body.success, false);
  assert.match(full.body.message, /full/i);

  const chat = (await json(await api(`/api/v1/conversations/${chatId}`, { token: account.token }))).body.data;
  assert.equal(chat.messages.length, MAX_MESSAGES);
});

test('an account can keep at most MAX_CHATS chats', async () => {
  const account = await newAccount();
  // Fill the account directly in one go: creating hundreds through the API would only slow the test
  const { getHistoryStore } = await import('../util/historyStore.js');
  const store = getHistoryStore();
  for (let i = 0; i < MAX_CHATS; i++) await store.create(account.id);

  const over = await json(await api('/api/v1/conversations', { method: 'POST', token: account.token }));
  assert.equal(over.status, 409);
  assert.match(over.body.message, /limit/i);

  // Deleting makes room again
  const list = (await json(await api('/api/v1/conversations', { token: account.token }))).body.data;
  await api(`/api/v1/conversations/${list[0].id}`, { method: 'DELETE', token: account.token });
  assert.equal((await api('/api/v1/conversations', { method: 'POST', token: account.token })).status, 201);
});

test('a runaway script is slowed down, and only its own account', async () => {
  const noisy = await newAccount();
  const quiet = await newAccount();
  const limit = Number(process.env.HISTORY_RATE_LIMIT);

  // Each chat started or message saved counts. Use messages on one chat so the account stays small.
  const chatId = await startChat(noisy);
  for (let i = 1; i < limit; i++) assert.equal((await say(noisy, chatId, [{ role: 'user', text: 'x' }])).status, i <= MAX_MESSAGES ? 200 : 409);

  const blocked = await say(noisy, chatId, [{ role: 'user', text: 'x' }]);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  const body = await blocked.json();
  assert.deepEqual(Object.keys(body).sort(), ['message', 'success']);

  // Reading still works, and another account is not affected
  assert.equal((await api('/api/v1/conversations', { token: noisy.token })).status, 200);
  assert.equal((await api('/api/v1/conversations', { method: 'POST', token: quiet.token })).status, 201);
});

// --- Staying put -------------------------------------------------------------------------------

test('saved chats survive a restart', async () => {
  const account = await newAccount();
  const chatId = await startChat(account);
  await say(account, chatId, [{ role: 'user', text: 'still here after a restart' }]);

  // A restart builds the stores again from what is on disk (or in MongoDB)
  initUserStore({ mongoConnected: useMongo });
  const chat = (await json(await api(`/api/v1/conversations/${chatId}`, { token: account.token }))).body.data;
  assert.deepEqual(chat.messages.map(m => m.text), ['still here after a restart']);
});

test('the history file is private to its owner', { skip: useMongo || process.platform === 'win32' }, () => {
  const mode = fs.statSync(path.join(dataDir, 'history.json')).mode & 0o777;
  assert.equal(mode, 0o600);
});
