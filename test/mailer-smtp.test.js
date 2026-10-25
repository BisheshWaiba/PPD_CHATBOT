// The mailer over a real SMTP conversation. Run with: npm test
//
// The other email tests use a stand-in for the mail server. These talk to a small real SMTP server
// running on this machine (test/support/smtp.js), so the login, the delivery, the encoding of a
// Nepali name, and the failures of a mail server (wrong password, nobody there) are all real.
// Nothing is delivered anywhere.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { mock } from 'node:test';
import { startSmtpServer } from './support/smtp.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-smtp-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'https://sutkeri.test';
process.env.MAIL_FROM = 'Sutkeri <no-reply@sutkeri.test>';
process.env.SMTP_SECURE = 'false';
process.env.TRUST_PROXY = 'true';
delete process.env.CORS_ORIGIN;

const { createApp } = await import('../app.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const { sendMail, verifyMailServer, mailMode, setMailTransport } = await import('../util/mailer.js');
const { sendResetEmail } = await import('../util/accountEmails.js');
const { hashToken } = await import('../util/authTokens.js');

setMailTransport(null); // the real transport, whatever an earlier import left

let smtp;
let server;
let base;
let visitor = 0;

before(async () => {
  initUserStore({ mongoConnected: false });
  smtp = await startSmtpServer({ user: 'mailer', pass: 'mail-password' });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await smtp.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const pointAt = ({ port = smtp.port, user = 'mailer', pass = 'mail-password' } = {}) => {
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = user;
  process.env.SMTP_PASS = pass;
};

beforeEach(() => {
  pointAt();
  smtp.messages.length = 0;
  smtp.attempts.length = 0;
});

// Decodes the readable part of what was delivered (the mailer sends plain text, quoted-printable when it has non-ASCII)
function readable(raw) {
  const [head, ...rest] = raw.split('\r\n\r\n');
  let body = rest.join('\r\n\r\n');
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(head)) {
    body = Buffer.from(body.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8');
  } else if (/Content-Transfer-Encoding:\s*base64/i.test(head)) {
    body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  return { head, body };
}

async function waitForMessages(count) {
  for (let i = 0; i < 100 && smtp.messages.length < count; i++) await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(smtp.messages.length >= count, `expected ${count} delivered, got ${smtp.messages.length}`);
}

const call = (route, body) => fetch(base + route, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.7.0.${++visitor}` },
  body: JSON.stringify(body)
}).then(async res => ({ status: res.status, body: await res.json() }));

// --- Delivering ---------------------------------------------------------------------------------

test('with SMTP settings the mailer is in smtp mode and sends a real message: login, envelope, headers and body', async () => {
  assert.equal(mailMode(), 'smtp');
  await sendMail({ to: 'mina@example.com', subject: 'Hello from the test', text: 'First line.\n\nSecond line, with a dot at the end.\n.\nand a line that is only a dot above.' });

  assert.deepEqual(smtp.attempts, [{ user: 'mailer', ok: true }], 'it logged in once, with the configured login');
  assert.equal(smtp.messages.length, 1);
  const [message] = smtp.messages;
  assert.equal(message.from, 'no-reply@sutkeri.test');
  assert.deepEqual(message.to, ['mina@example.com']);

  const { head, body } = readable(message.raw);
  assert.match(head, /^From: Sutkeri <no-reply@sutkeri\.test>$/m);
  assert.match(head, /^To: mina@example\.com$/m);
  assert.match(head, /^Subject: Hello from the test$/m);
  assert.match(body, /First line\./);
  assert.ok(body.includes('and a line that is only a dot above.'), 'a line of just a dot did not end the message early');
});

test('a Nepali name and subject arrive intact', async () => {
  await sendMail({ to: 'sita@example.com', subject: 'तपाईंको पासवर्ड परिवर्तन भयो', text: 'नमस्ते सीता,\n\nतपाईंको खाता सुरक्षित छ।' });
  const { head, body } = readable(smtp.messages[0].raw);
  assert.match(head, /^Subject: =\?UTF-8\?/m, 'a non-ASCII subject is encoded in the header');
  assert.ok(body.includes('नमस्ते सीता,') && body.includes('तपाईंको खाता सुरक्षित छ।'), body);
});

test('the reset email, built by the app, arrives with a working link and the first name only', async () => {
  const user = await getUserStore().create({ name: 'सीता राई', email: `smtp-reset-${Date.now()}@example.com`, password: 'correct horse battery' });
  await sendResetEmail(user);
  await waitForMessages(1);

  const { head, body } = readable(smtp.messages[0].raw);
  assert.match(head, /^Subject: Reset your Sutkeri password$/m);
  assert.ok(body.includes('Hello सीता,'), 'the first name');
  assert.ok(!body.includes('राई'), 'not the whole name');
  const link = body.match(/https:\/\/sutkeri\.test\/reset-password\.html\?token=([A-Za-z0-9_-]{43})/);
  assert.ok(link, body);
  assert.equal(await getUserStore().peekAuthToken('reset', hashToken(link[1])), user.id, 'the link in the email is one the store knows');
});

test('through the whole app: signing up and asking for a password reset each send a real email', async () => {
  const email = `smtp-flow-${Date.now()}@example.com`;
  const signup = await call('/api/v1/auth/register', { name: 'Mina Gurung', email, password: 'correct horse battery' });
  assert.equal(signup.status, 201);
  await waitForMessages(1);
  assert.match(readable(smtp.messages[0].raw).head, /^Subject: Confirm your email address for Sutkeri$/m);
  assert.deepEqual(smtp.messages[0].to, [email]);

  // Confirm the address from the link in the email, then ask for a reset
  const token = readable(smtp.messages[0].raw).body.match(/verify-email\.html\?token=([A-Za-z0-9_-]{43})/)[1];
  assert.equal((await call('/api/v1/auth/verify-email', { token })).status, 200);
  assert.equal((await call('/api/v1/auth/forgot-password', { email })).status, 200);
  await waitForMessages(2);
  assert.match(readable(smtp.messages[1].raw).head, /^Subject: Reset your Sutkeri password$/m);
});

// --- When the mail server is not as hoped -----------------------------------------------------------

test('the check that logs in without sending says yes for a good login, and no for a wrong password with a clear reason', async () => {
  await verifyMailServer();
  assert.equal(smtp.messages.length, 0, 'nothing was sent');
  assert.deepEqual(smtp.attempts, [{ user: 'mailer', ok: true }]);

  pointAt({ pass: 'not-the-password' });
  await assert.rejects(verifyMailServer(), error => {
    assert.equal(error.code, 'EAUTH');
    assert.equal(error.responseCode, 535);
    return true;
  });
});

test('a mail server that is not there is reported quickly, not after a long hang', async () => {
  const closed = await new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
  pointAt({ port: closed });
  const started = Date.now();
  await assert.rejects(verifyMailServer(), error => { assert.ok(['ECONNECTION', 'ESOCKET'].includes(error.code), error.code); return true; });
  assert.ok(Date.now() - started < 5000);
});

test('a wrong mail password never stops a sign-up or a reset request, and the log has only the error code', async () => {
  pointAt({ pass: 'not-the-password' });
  const lines = [];
  const spy = mock.method(console, 'error', (...args) => { lines.push(args.join(' ')); });
  try {
    const email = `smtp-broken-${Date.now()}@example.com`;
    const signup = await call('/api/v1/auth/register', { name: 'Mina Gurung', email, password: 'correct horse battery' });
    assert.equal(signup.status, 201, 'the sign-up itself still works');
    await new Promise(resolve => setTimeout(resolve, 400));
  } finally {
    spy.mock.restore();
  }
  assert.equal(smtp.messages.length, 0);
  const logged = lines.join('\n');
  assert.match(logged, /could not send the verification email: EAUTH 535/);
  assert.ok(!logged.includes('smtp-broken'), 'the address is not in the log');
  assert.ok(!logged.includes('not-the-password') && !logged.includes('mail-password'), 'neither is any password');
});
