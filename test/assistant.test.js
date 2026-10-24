// The AI conversation: what is sent, what is checked, and what happens when things go wrong.
// Run with: npm test
//
// No real Anthropic account is used. A small fake of the Messages API runs on this machine, so the
// tests can read exactly what would be sent and trigger every kind of failure.
import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-assistant-test-'));
const API_KEY = 'sk-ant-test-key-do-not-leak';
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = API_KEY;
process.env.ASSISTANT_RETRIES = '0';
process.env.ASSISTANT_TIMEOUT_MS = '1200';
process.env.ASSISTANT_RATE_LIMIT = '4';
process.env.ASSISTANT_DAILY_LIMIT = '7';
delete process.env.ASSISTANT_MODEL;
delete process.env.CORS_ORIGIN;

const { createApp } = await import('../app.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const { signToken } = await import('../util/jwt.js');
const assistant = await import('../util/assistant.js');
const { validateAssistantEntries, ASSISTANT_LAST_MAX, ASSISTANT_ENTRIES_MAX } = await import('../util/validation.js');
const { HELPLINES } = await import('../public/js/chat-logic.js');

// --- A fake of the Messages API ---------------------------------------------------------------

const fake = { requests: [], mode: 'ok', status: 500, reply: 'That sounds really exhausting. How have you been sleeping?' };
let fakeServer;

const messageJson = (model, content, stop = 'end_turn') => JSON.stringify({
  id: 'msg_test', type: 'message', role: 'assistant', model, content,
  stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 30 }
});

function startFake() {
  fakeServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      fake.requests.push({ method: req.method, url: req.url, headers: req.headers, body: parsed });
      const json = (status, text) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(text); };
      switch (fake.mode) {
        case 'ok':
          return json(200, messageJson(parsed.model, [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: fake.reply }]));
        case 'status':
          return json(fake.status, JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'secret upstream detail' } }));
        case 'refusal':
          return json(200, messageJson(parsed.model, [], 'refusal'));
        case 'empty':
          return json(200, messageJson(parsed.model, [{ type: 'text', text: '   ' }]));
        case 'hang':
          return; // never answers: the client's timeout has to end it
        default:
          return json(500, '{}');
      }
    });
  });
  return new Promise(resolve => fakeServer.listen(0, '127.0.0.1', resolve));
}

let server;
let base;

before(async () => {
  await startFake();
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fakeServer.address().port}`;
  initUserStore({ mongoConnected: false });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => fakeServer.closeAllConnections?.() || resolve());
  await new Promise(resolve => fakeServer.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  fake.requests.length = 0;
  fake.mode = 'ok';
  fake.reply = 'That sounds really exhausting. How have you been sleeping?';
  process.env.ANTHROPIC_API_KEY = API_KEY;
  delete process.env.ASSISTANT_MODEL;
});

// --- Helpers ----------------------------------------------------------------------------------

const api = (route, { method = 'GET', body, token } = {}) =>
  fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

// Accounts are made straight in the user store, so sign-up's own rate limit is not involved
async function newAccount(name = 'Priya Sharma') {
  const email = `assistant-${randomUUID()}@example.com`;
  const user = await getUserStore().create({ name, email, password: 'a-long-password' });
  return { token: signToken(user), id: user.id, name, email };
}

const ask = (account, messages) => api('/api/v1/assistant/reply', { method: 'POST', token: account.token, body: { messages } });
const said = text => [{ role: 'user', text }];
const json = async res => ({ status: res.status, body: await res.json() });

// Captures everything the server prints while `fn` runs
async function captureLogs(fn) {
  const lines = [];
  const spies = ['log', 'error', 'warn'].map(name => mock.method(console, name, (...args) => { lines.push(args.join(' ')); }));
  try {
    await fn();
  } finally {
    spies.forEach(spy => spy.mock.restore());
  }
  return lines.join('\n');
}

// --- Preparing the conversation ---------------------------------------------------------------

test('the conversation becomes alternating messages that start and end with the person', () => {
  const messages = assistant.toApiMessages([
    { role: 'bot', text: 'Hi there!' }, { role: 'bot', text: 'Welcome. Please continue.' },
    { role: 'user', text: 'Continue' },
    { role: 'bot', text: 'May I ask your age?' }, { role: 'bot', text: 'Thank you.' },
    { role: 'user', text: 'I am so tired' }
  ]);
  assert.deepEqual(messages, [
    { role: 'user', content: 'Continue' },
    { role: 'assistant', content: 'May I ask your age?\n\nThank you.' },
    { role: 'user', content: 'I am so tired' }
  ]);
});

test('only the latest part of a long conversation is sent, and a huge one is trimmed from the old end', () => {
  const long = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'bot' : 'user', text: `message ${i}` }));
  long.push({ role: 'user', text: 'newest' });
  const recent = assistant.toApiMessages(long);
  assert.ok(recent.length <= assistant.MAX_CONTEXT_MESSAGES);
  assert.equal(recent[recent.length - 1].content, 'newest');
  assert.equal(recent[0].role, 'user');

  const huge = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'bot' : 'user', text: 'x'.repeat(2900) }));
  huge.push({ role: 'user', text: 'and now' });
  const trimmed = assistant.toApiMessages(huge);
  assert.equal(trimmed[trimmed.length - 1].content, 'and now');
  assert.equal(trimmed[0].role, 'user');
  assert.ok(trimmed.reduce((total, m) => total + m.content.length, 0) <= 14000 + 3000);
});

test('a conversation with nothing from the person is refused', () => {
  assert.throws(() => assistant.toApiMessages([{ role: 'bot', text: 'Hello' }]), assistant.AssistantUnavailableError);
});

// --- Checking what comes back -----------------------------------------------------------------

test('markup and markdown never get through, and an over-long reply is cut at a sentence', () => {
  assert.equal(assistant.sanitizeReply('Hello <img src=x onerror=alert(1)>**there**'), 'Hello there');
  assert.equal(assistant.sanitizeReply('<b>Be</b> kind\r\n\r\n\r\n\r\nto yourself'), 'Be kind\n\nto yourself');

  const sentence = 'You are doing better than you think. ';
  const cut = assistant.sanitizeReply(sentence.repeat(100));
  assert.ok(cut.length <= assistant.MAX_REPLY_CHARS);
  assert.ok(cut.endsWith('.'), 'cut at the end of a sentence');
});

test('a phone number that is not one of our helplines is caught', () => {
  const has = assistant.hasUnknownPhoneNumber;
  assert.equal(has('Please call 1166 right now.'), false);
  assert.equal(has('TPO Nepal is on 1660-010-2005.'), false);
  assert.equal(has('Or +977-9847386158.'), false);
  assert.equal(has('Or 9847386158 if you prefer.'), false, 'our number written without the country code');
  assert.equal(has('Try 9841234567.'), true);
  assert.equal(has('Call 100-200-3000 today.'), true);
  assert.equal(has('Call 1177.'), true);
  // Ordinary numbers are fine
  assert.equal(has('Try this for 10 minutes, twice a day, since 2026.'), false);
});

// --- The system prompt ------------------------------------------------------------------------

test('the system prompt carries the safety rules and the helplines, and is identical every time', () => {
  const prompt = assistant.buildSystemPrompt();
  assert.equal(prompt, assistant.buildSystemPrompt(), 'stable text can be cached');
  assert.ok(prompt.includes(HELPLINES.english), 'the real helplines are in it');
  for (const rule of [/never diagnose/i, /medicines, doses/i, /never interpret physical symptoms/i, /hurting themselves/i,
                      /never invent phone numbers/i, /stay on topic/i, /untrusted/i, /you are an AI/i]) {
    assert.match(prompt, rule);
  }
  assert.doesNotMatch(prompt, /\d{4}-\d{2}-\d{2}/, 'no date or timestamp that would change it');
});

// --- Input rules ------------------------------------------------------------------------------

test('the conversation sent to the assistant is checked', () => {
  const ok = [{ role: 'bot', text: 'Hi' }, { role: 'user', text: 'Hello' }];
  assert.equal(validateAssistantEntries(ok), null);
  for (const bad of [undefined, [], 'hi', [{ role: 'user', text: '' }], [{ role: 'admin', text: 'hi' }], [{ role: 'user' }],
                     [{ role: 'user', text: 'a' }, { role: 'bot', text: 'b' }],
                     [{ role: 'user', text: 'a'.repeat(ASSISTANT_LAST_MAX + 1) }],
                     Array.from({ length: ASSISTANT_ENTRIES_MAX + 1 }, () => ({ role: 'user', text: 'hi' }))]) {
    assert.ok(validateAssistantEntries(bad), `should refuse ${JSON.stringify(bad)?.slice(0, 60)}`);
  }
});

// --- The API ----------------------------------------------------------------------------------

test('the status says whether the AI conversation is switched on', async () => {
  const account = await newAccount();
  assert.deepEqual((await json(await api('/api/v1/assistant', { token: account.token }))).body, { success: true, data: { enabled: true } });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await json(await api('/api/v1/assistant', { token: account.token }))).body.data.enabled, false);
});

test('both endpoints need a signed-in account', async () => {
  assert.equal((await api('/api/v1/assistant')).status, 401);
  assert.equal((await api('/api/v1/assistant/reply', { method: 'POST', body: { messages: said('hi') } })).status, 401);
  assert.equal(fake.requests.length, 0);
});

test('a reply comes back as plain text with its source', async () => {
  const account = await newAccount();
  const { status, body } = await json(await ask(account, [
    { role: 'bot', text: 'Hi there!' }, { role: 'user', text: 'I feel so tired and alone' }
  ]));
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, data: { reply: fake.reply, source: 'ai' } });
});

test('exactly the right request is made to Anthropic', async () => {
  const account = await newAccount();
  await ask(account, [{ role: 'bot', text: 'Hi there!' }, { role: 'user', text: 'I feel tired' }, { role: 'bot', text: 'Tell me more.' }, { role: 'user', text: 'I cannot sleep' }]);
  assert.equal(fake.requests.length, 1);
  const { method, url, headers, body } = fake.requests[0];

  assert.equal(method, 'POST');
  assert.match(url, /^\/v1\/messages/);
  // The SDK sends the key as a bearer token (older ones used the x-api-key header)
  assert.equal(headers['x-api-key'] ?? headers.authorization?.replace(/^Bearer /, ''), API_KEY);
  assert.ok(headers['anthropic-version']);

  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.max_tokens, 2000);
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal(body.system[0].type, 'text');
  assert.ok(body.system[0].text.startsWith('You are Sutkeri'));
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.messages.map(m => m.role), ['user', 'assistant', 'user'], 'the welcome is dropped and roles alternate');

  // The refusal fallback is on for this model
  assert.equal(body.fallbacks, 'default');
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);

  // Settings this model rejects are not sent
  for (const forbidden of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice']) {
    assert.equal(forbidden in body, false, `${forbidden} must not be sent`);
  }
});

test('nothing that identifies the person is sent: no name, email or account id', async () => {
  const account = await newAccount('Priya Sharma');
  await ask(account, said('I feel low today'));
  const sent = JSON.stringify(fake.requests[0].body) + JSON.stringify(fake.requests[0].headers);
  for (const secret of [account.name, 'Priya', account.email, account.id, account.token]) {
    assert.equal(sent.includes(secret), false, `"${secret.slice(0, 12)}..." must not be sent`);
  }
});

test('another model can be chosen, and the Opus-only fallback is then left out', async () => {
  process.env.ASSISTANT_MODEL = 'claude-haiku-5-5';
  const account = await newAccount();
  const { status } = await json(await ask(account, said('I feel low')));
  assert.equal(status, 200);
  const { body, headers, url } = fake.requests[0];
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal('fallbacks' in body, false);
  assert.equal(headers['anthropic-beta'], undefined);
  assert.equal(url.includes('beta=true'), false);
});

test('a crisis message is answered in code: never sent to the model, and never held back by a limit', async () => {
  const account = await newAccount();
  const { status, body } = await json(await ask(account, said('I want to kill myself')));
  assert.equal(status, 200);
  assert.equal(body.data.source, 'safety');
  assert.ok(body.data.reply.includes('1166'), 'the helplines are in the reply');
  assert.equal(fake.requests.length, 0);

  // Used up the allowance: a crisis message still gets its answer
  for (let i = 0; i < 4; i++) assert.equal((await ask(account, said(`tired ${i}`))).status, 200);
  assert.equal((await ask(account, said('tired once more'))).status, 429);
  assert.equal((await ask(account, said('I want to end my life'))).status, 200);

  // Nepali too
  const nepali = await json(await ask(await newAccount(), said('म आत्महत्या गर्न चाहन्छु')));
  assert.equal(nepali.body.data.source, 'safety');
  assert.match(nepali.body.data.reply, /[ऀ-ॿ]/, 'the reply is in Nepali');
});

test('a crisis message is answered even when the AI is not configured', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { status, body } = await json(await ask(await newAccount(), said('I do not want to be alive')));
  assert.equal(status, 200);
  assert.equal(body.data.source, 'safety');
});

test('without an API key everything else is a 503 and nothing is attempted', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { status, body } = await json(await ask(await newAccount(), said('I feel tired')));
  assert.equal(status, 503);
  assert.deepEqual(Object.keys(body).sort(), ['message', 'success']);
  assert.equal(body.success, false);
  assert.equal(fake.requests.length, 0);
});

test('every kind of failure is the same plain 503, and leaks neither the key, the upstream detail nor the message', async () => {
  const secretMessage = 'my private worry about the baby';
  const failures = [
    ['the key is rejected', { mode: 'status', status: 401 }],
    ['Anthropic is rate limiting', { mode: 'status', status: 429 }],
    ['Anthropic is down', { mode: 'status', status: 500 }],
    ['Anthropic is overloaded', { mode: 'status', status: 529 }],
    ['the request is refused', { mode: 'status', status: 400 }],
    ['the model declines', { mode: 'refusal' }],
    ['the model returns nothing', { mode: 'empty' }],
    ['the model hangs', { mode: 'hang' }],
    ['the reply has an invented phone number', { mode: 'ok', reply: 'Please call 9841234567 for help.' }]
  ];
  for (const [label, setup] of failures) {
    Object.assign(fake, { status: 500, reply: 'fine', ...setup });
    const account = await newAccount();
    let result;
    const logs = await captureLogs(async () => { result = await json(await ask(account, said(secretMessage))); });

    assert.equal(result.status, 503, label);
    assert.deepEqual(Object.keys(result.body).sort(), ['message', 'success'], label);
    assert.equal(result.body.success, false, label);
    const everything = JSON.stringify(result.body) + logs;
    for (const secret of [API_KEY, 'secret upstream detail', secretMessage]) {
      assert.equal(everything.includes(secret), false, `${label}: must not leak "${secret.slice(0, 20)}"`);
    }
    assert.match(logs, /\[assistant\] no AI reply:/, `${label}: the reason is logged`);
  }
});

test('markup in the model\'s reply is removed before it is sent on', async () => {
  fake.reply = 'Hello <img src=x onerror=alert(1)> **there**, <script>alert(1)</script>take care.';
  const { body } = await json(await ask(await newAccount(), said('hi')));
  assert.equal(body.data.reply.includes('<'), false);
  assert.equal(body.data.reply.includes('onerror'.concat('=')) && body.data.reply.includes('<'), false);
  assert.match(body.data.reply, /^Hello\s+there,/);
});

test('nothing the person wrote is printed in the server log, even when all goes well', async () => {
  const secretMessage = 'the secret thing I only told the assistant';
  let status;
  const logs = await captureLogs(async () => { status = (await ask(await newAccount(), said(secretMessage))).status; });
  assert.equal(status, 200);
  assert.equal(logs.includes(secretMessage), false);
  assert.equal(logs.includes(API_KEY), false);
});

test('bad requests are a 400 with a reason, and cost nothing', async () => {
  const account = await newAccount();
  for (const messages of [undefined, [], 'hi', [{ role: 'bot', text: 'last one is the assistant' }],
                          [{ role: 'user', text: 'a'.repeat(ASSISTANT_LAST_MAX + 1) }]]) {
    const { status, body } = await json(await ask(account, messages));
    assert.equal(status, 400);
    assert.deepEqual(Object.keys(body).sort(), ['message', 'success']);
  }
  assert.equal(fake.requests.length, 0);
});

test('each account has a per-minute allowance, and another account is not affected', async () => {
  const busy = await newAccount();
  const other = await newAccount();
  for (let i = 0; i < 4; i++) assert.equal((await ask(busy, said(`hello ${i}`))).status, 200);

  const limited = await ask(busy, said('hello again'));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.deepEqual(Object.keys(await limited.json()).sort(), ['message', 'success']);

  assert.equal((await ask(other, said('hello'))).status, 200);
  const sent = fake.requests.length;
  await ask(busy, said('and again'));
  assert.equal(fake.requests.length, sent, 'a limited request never reaches Anthropic');
});

test('there is also a daily allowance', async (t) => {
  const account = await newAccount();
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);

  for (let i = 0; i < 4; i++) assert.equal((await ask(account, said(`morning ${i}`))).status, 200);
  now += 61_000; // the per-minute window has passed
  for (let i = 0; i < 3; i++) assert.equal((await ask(account, said(`later ${i}`))).status, 200);
  now += 61_000;
  assert.equal((await ask(account, said('one more'))).status, 429, 'the daily allowance of 7 is used up');
});
