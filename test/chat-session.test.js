// Chat sessions belong to the account that opened them. Run with: npm test
//
// The end-to-end test starts the real Python chatbot, so it is skipped when `python` is not
// available. It uses the local user file in a temporary folder, like the auth tests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-chat-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');
const { sessionKey } = await import('../util/chatSession.js');

const tempDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'temp');
const hasPython = spawnSync('python', ['--version']).status === 0;

test('session key: same account and session give the same key', () => {
  assert.equal(sessionKey('user-1', 'abc'), sessionKey('user-1', 'abc'));
});

test('session key: another account gets a different key for the same session id', () => {
  assert.notEqual(sessionKey('user-1', 'abc'), sessionKey('user-2', 'abc'));
});

test('session key: only safe file-name characters, whatever the user id looks like', () => {
  const key = sessionKey('../../etc/passwd', 'abc-DEF_123');
  assert.match(key, /^[a-f0-9]{16}_abc-DEF_123$/);
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

// A client opens a conversation by asking for the greeting, which hands out the session id
async function greet(account) {
  const res = await fetch(`${base}/api/chatbot/greeting`, {
    headers: { Authorization: `Bearer ${account.token}` }
  });
  assert.equal(res.status, 200);
  const { sessionId } = await res.json();
  usedKeys.push(sessionKey(account.id, sessionId));
  return sessionId;
}

async function say(account, sessionId, message) {
  usedKeys.push(sessionKey(account.id, sessionId));
  const res = await fetch(`${base}/api/chatbot/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${account.token}`,
      'x-session-id': sessionId
    },
    body: JSON.stringify({ message })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sessionId, sessionId);
  return body.response;
}

test('another account cannot read or move a conversation by reusing its session id',
  { skip: !hasPython && 'python is not available' },
  async () => {
    const alice = await register('alice');
    const bob = await register('bob');

    // What a brand-new conversation answers to "1": the control for Bob's request
    const fresh = await say(bob, randomUUID(), '1');

    // Alice opens a conversation and moves on to the consent question
    const aliceSession = await greet(alice);
    const consent = await say(alice, aliceSession, 'hello');
    assert.notEqual(consent, fresh);

    // Bob sends Alice's session id. He must get a new conversation, not hers.
    const bobsReply = await say(bob, aliceSession, '1');
    assert.equal(bobsReply, fresh);

    // Alice's conversation carries on from where she was: Bob did not move it
    const aliceNext = await say(alice, aliceSession, '1');
    assert.match(aliceNext, /age/i);
  });
