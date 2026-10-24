// The browser side of chat history: saving in the background, and how saved chats are written.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder } from '../public/js/history-recorder.js';
import { plainText, formatWhen, countLabel } from '../public/js/history-format.js';

// A stand-in for the server that remembers what it was asked to save
function fakeServer({ failAppend = () => false, failCreate = () => false, appendStatus = () => null } = {}) {
  const chats = new Map(); // id -> messages
  const calls = [];
  let created = 0;
  const respond = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

  const api = async (method, path, body) => {
    calls.push(`${method} ${path}`);
    if (method === 'POST' && path === '/api/v1/conversations') {
      if (failCreate(calls.length)) return respond(500);
      const id = `chat-${++created}`;
      chats.set(id, []);
      return respond(201, { data: { id } });
    }
    const match = path.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/);
    if (method === 'POST' && match) {
      if (failAppend(calls.length)) return respond(500);
      const status = appendStatus(match[1], body.messages.length);
      if (status) return respond(status);
      assert.ok(body.messages.length <= 20, 'a request never carries more than 20 messages');
      chats.get(match[1]).push(...body.messages);
      return respond(200, { data: {} });
    }
    throw new Error(`unexpected request ${method} ${path}`);
  };
  const texts = id => (chats.get(id) || []).map(m => `${m.role}:${m.text}`);
  return { api, chats, calls, texts };
}

test('nothing is saved until the person actually says something', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('bot', 'Hi there!');
  await recorder.idle();
  assert.deepEqual(server.calls, []);
  assert.equal(recorder.pending(), 1);
});

test('the first thing said starts a saved chat that includes the welcome, in order', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('bot', 'Hi there!');
  recorder.record('user', 'Continue');
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['bot:Hi there!', 'user:Continue']);
  assert.equal(server.calls.filter(call => call === 'POST /api/v1/conversations').length, 1);
});

test('later messages go into the same chat, in the order they were shown', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('user', 'one');
  await recorder.idle();
  for (const [role, text] of [['bot', 'two'], ['user', 'three'], ['bot', 'four']]) recorder.record(role, text);
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['user:one', 'bot:two', 'user:three', 'bot:four']);
  assert.equal(server.chats.size, 1);
});

test('a reply from the assistant is saved on its own, right away, without waiting for the next message', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('user', 'Continue');
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['user:Continue']);

  // The reply arrives alone, a moment later: it must not be held back
  recorder.record('bot', 'May I ask your age?');
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['user:Continue', 'bot:May I ask your age?']);
  assert.equal(recorder.pending(), 0);
});

test('messages recorded back to back are each saved exactly once', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  for (let i = 1; i <= 7; i++) recorder.record(i % 2 ? 'user' : 'bot', `m${i}`);
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['user:m1', 'bot:m2', 'user:m3', 'bot:m4', 'user:m5', 'bot:m6', 'user:m7']);
});

test('a long run of messages is saved in requests of at most 20', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  for (let i = 1; i <= 45; i++) recorder.record('user', `m${i}`);
  await recorder.idle();
  assert.equal(server.chats.get('chat-1').length, 45);
  assert.equal(server.calls.filter(call => call.endsWith('/messages')).length, 3);
});

test('starting over begins a new saved chat and leaves the old one alone', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('bot', 'welcome');
  recorder.record('user', 'first chat');
  recorder.startNew();
  recorder.record('user', 'new');
  recorder.record('bot', 'Hi, I am Sutkeri');
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['bot:welcome', 'user:first chat']);
  assert.deepEqual(server.texts('chat-2'), ['user:new', 'bot:Hi, I am Sutkeri']);
});

test('starting over before saying anything does not save an empty chat', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('bot', 'welcome');
  recorder.startNew();
  recorder.record('user', 'new');
  await recorder.idle();
  assert.equal(server.chats.size, 1);
  assert.deepEqual(server.texts('chat-1'), ['user:new']);
});

test('when saving fails nothing is lost: the messages are sent again with the next ones, once each', async () => {
  let failing = true;
  const server = fakeServer({ failAppend: () => failing });
  const recorder = createRecorder(server.api);

  recorder.record('user', 'a');
  recorder.record('bot', 'b');
  await recorder.idle(); // does not throw, whatever happens
  assert.equal(recorder.pending(), 2);
  assert.deepEqual(server.texts('chat-1'), []);

  failing = false;
  recorder.record('user', 'c');
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['user:a', 'bot:b', 'user:c']);
  assert.equal(recorder.pending(), 0);
});

test('when the chat cannot even be created, nothing is lost either', async () => {
  let failing = true;
  const server = fakeServer({ failCreate: () => failing });
  const recorder = createRecorder(server.api);
  recorder.record('user', 'hello');
  await recorder.idle();
  assert.equal(recorder.pending(), 1);

  failing = false;
  recorder.record('bot', 'hi');
  await recorder.idle();
  assert.deepEqual(server.texts('chat-1'), ['user:hello', 'bot:hi']);
});

test('a chat that is full, or was deleted meanwhile, carries on in a new one', async () => {
  for (const status of [409, 404]) {
    const server = fakeServer({ appendStatus: id => (id === 'chat-1' ? status : null) });
    const recorder = createRecorder(server.api);
    recorder.record('user', 'before');
    recorder.record('user', 'after');
    await recorder.idle();
    assert.deepEqual(server.texts('chat-1'), [], `old chat (${status})`);
    assert.deepEqual(server.texts('chat-2'), ['user:before', 'user:after'], `new chat (${status})`);
  }
});

test('once the session has ended it stops trying', async () => {
  const server = fakeServer({ appendStatus: () => 401 });
  const recorder = createRecorder(server.api);
  recorder.record('user', 'hello');
  await recorder.idle();
  const requests = server.calls.length;
  recorder.record('user', 'anyone there?');
  recorder.startNew();
  await recorder.idle();
  assert.equal(server.calls.length, requests);
});

test('very long messages are cut to what the server accepts, and blank ones are ignored', async () => {
  const server = fakeServer();
  const recorder = createRecorder(server.api);
  recorder.record('user', 'x'.repeat(9000));
  recorder.record('bot', '   ');
  recorder.record('bot', undefined);
  await recorder.idle();
  assert.equal(server.chats.get('chat-1').length, 1);
  assert.equal(server.chats.get('chat-1')[0].text.length, 4000);
});

test('while saving keeps failing, only the most recent 200 messages are held on to', async () => {
  const server = fakeServer({ failAppend: () => true });
  const recorder = createRecorder(server.api);
  for (let i = 1; i <= 250; i++) recorder.record('user', `m${i}`);
  await recorder.idle();
  assert.equal(recorder.pending(), 200);
});

// --- How saved chats are written ---------------------------------------------------------------

test('the assistant\'s links are shown as plain text, and nothing else of its markup survives', () => {
  assert.equal(
    plainText('Done.\n\n📄 <a href="/report.html" target="_blank" rel="noopener">Open a printable version</a>', 'bot'),
    'Done.\n\n📄 Open a printable version (/report.html)'
  );
  assert.equal(plainText('a <b>bold</b> <i>move</i>', 'bot'), 'a bold move');
});

test('what a person typed is shown exactly as they typed it', () => {
  assert.equal(plainText('I think <b>this</b> & that <3', 'user'), 'I think <b>this</b> & that <3');
  assert.equal(plainText(undefined, 'user'), '');
});

test('dates are written in the person\'s own format', () => {
  const iso = '2026-10-20T15:41:00.000Z';
  assert.equal(formatWhen(iso, { locale: 'en-GB', timeZone: 'UTC' }), '20 Oct 2026, 15:41');
  assert.equal(formatWhen(iso, { locale: 'en-US', timeZone: 'UTC' }), 'Oct 20, 2026, 3:41 PM');
  assert.equal(formatWhen('not a date'), '');
});

test('message counts read naturally', () => {
  assert.equal(countLabel(1), '1 message');
  assert.equal(countLabel(0), '0 messages');
  assert.equal(countLabel(12), '12 messages');
});
