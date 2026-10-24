// Chat input rules and the per-account message allowance. Run with: npm test
//
// Rejected requests never reach the chatbot, so those tests need nothing but the server.
// The tests that send accepted messages start the real Python chatbot and are skipped when
// `python` is not available.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-chat-input-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';
process.env.CHAT_RATE_LIMIT = '3';
delete process.env.CORS_ORIGIN;

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');
const { sessionKey } = await import('../util/chatSession.js');
const { pythonAvailable } = await import('../util/python.js');
const { validateChatMessage, CHAT_MESSAGE_MAX } = await import('../util/validation.js');

const tempDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'temp');
const hasPython = pythonAvailable();
const needsPython = { skip: !hasPython && 'python is not available' };

test('validation: ordinary messages are accepted', () => {
  assert.equal(validateChatMessage('I feel tired today'), null);
  assert.equal(validateChatMessage('1'), null);
  assert.equal(validateChatMessage('म धेरै थकित छु'), null);
});

test('validation: missing, non-text and blank messages are refused', () => {
  for (const bad of [undefined, null, 42, {}, ['hi'], '', '   \n\t ']) {
    assert.ok(validateChatMessage(bad), `should refuse ${JSON.stringify(bad)}`);
  }
});

test('validation: the length limit is exact', () => {
  assert.equal(validateChatMessage('a'.repeat(CHAT_MESSAGE_MAX)), null);
  assert.match(validateChatMessage('a'.repeat(CHAT_MESSAGE_MAX + 1)), /more than 1000 characters/);
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
  // The chatbot writes its state files into the project's temp folder
  for (const key of usedKeys) {
    for (const name of [`state_${key}.json`, `message_${key}.txt`]) {
      fs.rmSync(path.join(tempDir, name), { force: true });
    }
  }
});

async function register(name) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: `${name}-${randomUUID()}@example.com`, password: 'a-long-password' })
  });
  const { token, user } = await res.json();
  return { token, id: user.id };
}

// Posts a raw body so the tests can send things the normal client never would
async function post(account, raw) {
  const sessionId = randomUUID();
  usedKeys.push(sessionKey(account.id, sessionId));
  return fetch(`${base}/api/chatbot/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${account.token}`,
      'x-session-id': sessionId
    },
    body: raw
  });
}

const send = (account, message) => post(account, JSON.stringify({ message }));

test('a missing or non-text message is a 400 with a reason, not a polite 200', async () => {
  const account = await register('missing');
  for (const raw of ['{}', '{"message":42}', '{"message":{"a":1}}', '{"message":null}', '[]']) {
    const res = await post(account, raw);
    assert.equal(res.status, 400, raw);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'Please write a message');
  }
});

test('a blank message is a 400', async () => {
  const account = await register('blank');
  const res = await send(account, '  \n ');
  assert.equal(res.status, 400);
});

test('a message over the limit is a 400, even a large one that fits in the request', async () => {
  const account = await register('long');
  const justOver = await send(account, 'a'.repeat(CHAT_MESSAGE_MAX + 1));
  assert.equal(justOver.status, 400);
  assert.match((await justOver.json()).message, /more than 1000 characters/);

  const huge = await send(account, 'a'.repeat(90_000));
  assert.equal(huge.status, 400);
});

test('a signed-out request is still a 401, before any input check', async () => {
  const res = await fetch(`${base}/api/chatbot/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  assert.equal(res.status, 401);
});

test('a message of exactly the maximum length is accepted', needsPython, async () => {
  const account = await register('exact');
  const res = await send(account, 'a'.repeat(CHAT_MESSAGE_MAX));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).response);
});

test('an account is limited per minute; rejected input does not use the allowance up', needsPython, async () => {
  const busy = await register('busy');
  const other = await register('other');

  // Far more rejected requests than the allowance of 3: none of them may count
  for (let i = 0; i < 6; i++) assert.equal((await send(busy, '')).status, 400);

  // The allowance (3) is still whole
  for (let i = 0; i < 3; i++) assert.equal((await send(busy, 'hello')).status, 200);

  // The fourth message is turned away, with a reason and a wait time
  const limited = await send(busy, 'hello');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  const body = await limited.json();
  assert.equal(body.success, false);
  assert.match(body.message, /Too many messages/);

  // A blocked account gets 429 before its input is even looked at
  assert.equal((await send(busy, '')).status, 429);

  // Another account is not affected
  assert.equal((await send(other, 'hello')).status, 200);
});

test('the greeting uses the same allowance as messages', needsPython, async () => {
  const account = await register('greeter');
  const greet = () => fetch(`${base}/api/chatbot/greeting`, {
    headers: { Authorization: `Bearer ${account.token}` }
  });
  for (let i = 0; i < 3; i++) {
    const res = await greet();
    assert.equal(res.status, 200);
    usedKeys.push(sessionKey(account.id, (await res.json()).sessionId));
  }
  assert.equal((await greet()).status, 429);
  assert.equal((await send(account, 'hello')).status, 429);
});
