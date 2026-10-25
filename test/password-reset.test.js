// Password reset and email confirmation. Run with: npm test
//
// Uses the local files in a temporary folder by default. Set TEST_MONGO_URI to a MongoDB to run the
// same tests against the MongoDB store.
//
// Emails are caught by a stand-in transport, so nothing is sent. Every test uses its own made-up
// visitor address (through X-Forwarded-For), so the rate limits of one test never affect another.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { connectTestDatabase, dropTestDatabase } from './support/mongo.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-reset-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = 'true';
process.env.APP_URL = 'https://sutkeri.test/';
process.env.SMTP_HOST = 'smtp.invalid';
process.env.MAIL_FROM = 'Sutkeri <no-reply@sutkeri.test>';
delete process.env.CORS_ORIGIN;

const useMongo = Boolean(process.env.TEST_MONGO_URI);
if (!useMongo) process.env.AUTH_STORE = 'file';

const { createApp } = await import('../app.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const { setMailTransport, appUrl, mailMode } = await import('../util/mailer.js');
const { hashToken, newToken, looksLikeToken } = await import('../util/authTokens.js');
const mongoose = (await import('mongoose')).default;
const User = (await import('../models/User.js')).default;
const AuthToken = (await import('../models/AuthToken.js')).default;

let server;
let base;
let port;
let outbox = [];
let mailFails = false;

before(async () => {
  if (useMongo) {
    await connectTestDatabase('password-reset');
    await User.init(); // build the unique email index
    await AuthToken.init(); // and the unique and expiry indexes of the links
    initUserStore({ mongoConnected: true });
  } else {
    initUserStore({ mongoConnected: false });
  }
  setMailTransport({
    sendMail: async message => {
      if (mailFails) throw new Error('smtp is down');
      outbox.push(message);
    }
  });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (useMongo) {
    await dropTestDatabase();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  outbox = [];
  mailFails = false;
});

// ---------------------------------------------------------------- helpers

let visitor = 0;
const newVisitor = () => `10.9.${Math.floor(++visitor / 250)}.${visitor % 250}`;

const call = async (route, { method = 'POST', body, token, ip } = {}) => {
  const res = await fetch(base + route, {
    method,
    headers: {
      'X-Forwarded-For': ip || newVisitor(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Emails are sent in the background, so wait until the one we expect has arrived
async function mailTo(address, { subject, count = 1 } = {}) {
  for (let i = 0; i < 100; i++) {
    const found = outbox.filter(mail => mail.to === address && (!subject || subject.test(mail.subject)));
    if (found.length >= count) return found[found.length - 1];
    await sleep(20);
  }
  assert.fail(`no email to ${address}${subject ? ` matching ${subject}` : ''}. Outbox: ${outbox.map(mail => `${mail.to}: ${mail.subject}`).join('; ')}`);
}

// After something that must NOT send an email: give a wrongly sent one time to show up
async function assertNoMailTo(address) {
  await sleep(150);
  assert.deepEqual(outbox.filter(mail => mail.to === address).map(mail => mail.subject), []);
}

const linkIn = mail => {
  const match = mail.text.match(/(https?:\/\/\S+?\/(reset-password|verify-email)\.html\?token=([A-Za-z0-9_-]+))/);
  assert.ok(match, `no link in:\n${mail.text}`);
  return { url: match[1], page: match[2], token: match[3] };
};

let counter = 0;
async function newUser({ verified = false } = {}) {
  const email = `user${++counter}@example.com`;
  const password = 'correct horse battery';
  const { status, body } = await call('/api/v1/auth/register', { body: { name: 'Mina Gurung', email, password } });
  assert.equal(status, 201);
  await mailTo(email, { subject: /Confirm your email/ });
  if (verified) {
    const { token } = linkIn(await mailTo(email, { subject: /Confirm your email/ }));
    assert.equal((await call('/api/v1/auth/verify-email', { body: { token } })).status, 200);
  }
  outbox = [];
  return { email, password, id: body.user.id, jwt: body.token };
}

const me = jwt => call('/api/v1/auth/me', { method: 'GET', token: jwt });

// ---------------------------------------------------------------- settings

test('the address in emails comes from APP_URL: normalised, and only a web address', () => {
  const saved = process.env.APP_URL;
  try {
    assert.equal(appUrl(), 'https://sutkeri.test');
    process.env.APP_URL = 'http://localhost:9000///';
    assert.equal(appUrl(), 'http://localhost:9000');
    for (const bad of ['javascript:alert(1)', 'ftp://files.example.com', 'not a url']) {
      process.env.APP_URL = bad;
      assert.equal(appUrl(), null, bad);
      assert.equal(mailMode(), 'off', `${bad} must switch email off`);
    }
  } finally {
    process.env.APP_URL = saved;
  }
});

test('email needs a mail server and a sender; tests and production never print links to the console', () => {
  const saved = { ...process.env };
  try {
    assert.equal(mailMode(), 'smtp');
    delete process.env.MAIL_FROM;
    assert.equal(mailMode(), 'off', 'a server without a sender is not usable');
    process.env.MAIL_FROM = saved.MAIL_FROM;
    delete process.env.SMTP_HOST;
    assert.equal(mailMode(), 'off', 'tests do not print emails');
    process.env.NODE_ENV = 'development';
    assert.equal(mailMode(), 'console', 'on a developer\'s computer the emails are printed');
    process.env.NODE_ENV = 'production';
    assert.equal(mailMode(), 'off');
    delete process.env.APP_URL;
    process.env.SMTP_HOST = saved.SMTP_HOST;
    assert.equal(mailMode(), 'off', 'production never guesses its own address');
  } finally {
    Object.assign(process.env, saved);
  }
});

test('the pages that carry a secret link keep it private', () => {
  for (const page of ['reset-password', 'verify-email']) {
    const html = fs.readFileSync(path.join(publicDir, `${page}.html`), 'utf8');
    assert.match(html, /<meta name="referrer" content="no-referrer"/, `${page} must not pass its address on to other sites`);
    assert.match(html, /<meta name="robots" content="noindex"/);
    const script = fs.readFileSync(path.join(publicDir, 'js', 'pages', `${page}.js`), 'utf8');
    assert.match(script, /history\.replaceState/, `${page} must take the secret out of the address bar`);
    assert.match(script, /\{43\}/, `${page} must check the same shape of link as the server`);
  }
});

test('a mail server\'s own error message (which can hold the address) is never logged', async () => {
  const { inBackground } = await import('../util/accountEmails.js');
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const failure = Object.assign(new Error('550 <secret.person@example.com>: Recipient address rejected'), { responseCode: 550 });
    inBackground(Promise.reject(failure), 'password reset');
    inBackground(Promise.reject(Object.assign(new Error('oops secret.person@example.com'), { code: 'EENVELOPE' })), 'verification');
    await sleep(20);
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 2);
  assert.ok(!logged.join('\n').includes('secret.person'));
  assert.match(logged[0], /Error 550/);
  assert.match(logged[1], /EENVELOPE/);
});

test('the pages can ask whether email is available', async () => {
  const { status, body } = await call('/api/v1/auth/features', { method: 'GET' });
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, data: { email: true } });

  const saved = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  try {
    assert.equal((await call('/api/v1/auth/features', { method: 'GET' })).body.data.email, false);
  } finally {
    process.env.SMTP_HOST = saved;
  }
});

test('tokens are long random strings that only we can recognise', () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  assert.ok(looksLikeToken(a));
  assert.equal(a.length, 43);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  for (const bad of ['', 'short', a + 'x', `${a.slice(1)}!`, null, undefined, 42, {}, [a]]) {
    assert.equal(looksLikeToken(bad), false, String(bad));
  }
});

// ---------------------------------------------------------------- confirming the address

test('signing up sends one confirmation email with a link built from APP_URL', async () => {
  const email = `signup${++counter}@example.com`;
  const { status, body } = await call('/api/v1/auth/register', { body: { name: 'Mina Gurung', email, password: 'correct horse battery' } });
  assert.equal(status, 201);
  assert.equal(body.user.emailVerified, false);

  const mail = await mailTo(email, { subject: /Confirm your email/ });
  const link = linkIn(mail);
  assert.equal(link.page, 'verify-email');
  assert.ok(link.url.startsWith('https://sutkeri.test/verify-email.html?token='));
  assert.ok(looksLikeToken(link.token));
  assert.match(mail.text, /Hello Mina,/);
  assert.equal(mail.from, 'Sutkeri <no-reply@sutkeri.test>');
  assert.ok(!JSON.stringify(body).includes(link.token), 'the link is only ever in the email');
  assert.equal(outbox.filter(m => m.to === email).length, 1);
});

test('a broken mail server never breaks signing up', async () => {
  mailFails = true;
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const email = `signup${++counter}@example.com`;
    const { status, body } = await call('/api/v1/auth/register', { body: { name: 'Mina Gurung', email, password: 'correct horse battery' } });
    assert.equal(status, 201);
    assert.ok(body.token);
    await sleep(100);
    assert.ok(logged.some(line => /could not send the verification email/.test(line)));
    assert.ok(!logged.join('\n').includes(email), 'the log must not hold the address');
  } finally {
    console.error = original;
  }
});

test('the link confirms the address, and works only once', async () => {
  const user = await newUser();
  assert.equal((await me(user.jwt)).body.data.emailVerified, false);

  await call('/api/v1/auth/resend-verification', { token: user.jwt });
  const { token } = linkIn(await mailTo(user.email, { subject: /Confirm your email/ }));

  const first = await call('/api/v1/auth/verify-email', { body: { token } });
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.equal((await me(user.jwt)).body.data.emailVerified, true);

  const again = await call('/api/v1/auth/verify-email', { body: { token } });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /not valid any more/);
});

test('being signed in is not needed to use the link (it is often opened on a phone)', async () => {
  const email = `phone${++counter}@example.com`;
  await call('/api/v1/auth/register', { body: { name: 'Mina Gurung', email, password: 'correct horse battery' } });
  const { token } = linkIn(await mailTo(email, { subject: /Confirm your email/ }));
  assert.equal((await call('/api/v1/auth/verify-email', { body: { token } })).status, 200);
});

test('a confirmation link that is expired, made up, or of the wrong kind is refused', async () => {
  const user = await newUser();
  const store = getUserStore();

  // The expired link is made last: making any link also clears away the expired ones of other people
  const wrongKind = newToken();
  await store.createAuthToken(user.id, 'reset', hashToken(wrongKind), Date.now() + 60000);
  const expired = newToken();
  await store.createAuthToken(user.id, 'verify', hashToken(expired), Date.now() - 1000);

  for (const token of [expired, wrongKind, newToken(), 'nonsense', '', null, 12345, ['a'], { $ne: '' }]) {
    const { status, body } = await call('/api/v1/auth/verify-email', { body: { token } });
    assert.equal(status, 400, JSON.stringify(token));
    assert.match(body.message, /not valid any more/);
  }
  assert.equal((await me(user.jwt)).body.data.emailVerified, false);
  assert.equal((await call('/api/v1/auth/verify-email', { body: {} })).status, 400);
  assert.equal((await call('/api/v1/auth/verify-email')).status, 400);
});

test('resending needs a sign-in, replaces the old link, and is limited', async () => {
  const user = await newUser();
  assert.equal((await call('/api/v1/auth/resend-verification')).status, 401);

  const first = await call('/api/v1/auth/resend-verification', { token: user.jwt });
  assert.equal(first.status, 200);
  assert.match(first.body.message, new RegExp(user.email.replace('.', '\\.')));
  const oldLink = linkIn(await mailTo(user.email, { subject: /Confirm your email/ }));

  await call('/api/v1/auth/resend-verification', { token: user.jwt });
  const newLink = linkIn(await mailTo(user.email, { subject: /Confirm your email/, count: 2 }));
  assert.notEqual(newLink.token, oldLink.token);

  assert.equal((await call('/api/v1/auth/verify-email', { body: { token: oldLink.token } })).status, 400, 'the earlier link stops working');
  await call('/api/v1/auth/resend-verification', { token: user.jwt });
  await mailTo(user.email, { subject: /Confirm your email/, count: 3 });
  const limited = await call('/api/v1/auth/resend-verification', { token: user.jwt });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  await assertNoMailTo(`${user.email}-nothing`);
  assert.equal(outbox.filter(mail => mail.to === user.email).length, 3, 'the limited request sent nothing');
});

test('resending to an address that is already confirmed says so and sends nothing', async () => {
  const user = await newUser({ verified: true });
  const { status, body } = await call('/api/v1/auth/resend-verification', { token: user.jwt });
  assert.equal(status, 200);
  assert.match(body.message, /already confirmed/);
  await assertNoMailTo(user.email);
});

test('resending says so when this server has no email', async () => {
  const user = await newUser();
  const saved = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  try {
    const { status, body } = await call('/api/v1/auth/resend-verification', { token: user.jwt });
    assert.equal(status, 503);
    assert.match(body.message, /not available/);
  } finally {
    process.env.SMTP_HOST = saved;
  }
});

// ---------------------------------------------------------------- asking for a reset link

test('a confirmed address gets a reset link built from APP_URL, valid for one hour', async () => {
  const user = await newUser({ verified: true });
  const { status, body } = await call('/api/v1/auth/forgot-password', { body: { email: user.email } });
  assert.equal(status, 200);
  assert.equal(body.success, true);

  const mail = await mailTo(user.email, { subject: /Reset your Sutkeri password/ });
  const link = linkIn(mail);
  assert.equal(link.page, 'reset-password');
  assert.ok(link.url.startsWith('https://sutkeri.test/reset-password.html?token='));
  assert.match(mail.text, /1 hour/);
  assert.ok(!JSON.stringify(body).includes(link.token));
});

test('the answer is identical for an unknown address, an unconfirmed one and a confirmed one', async () => {
  const confirmed = await newUser({ verified: true });
  const unconfirmed = await newUser();
  const answers = [];
  for (const email of [confirmed.email, unconfirmed.email, 'nobody-at-all@example.com', confirmed.email.toUpperCase()]) {
    const res = await call('/api/v1/auth/forgot-password', { body: { email: `  ${email}  ` } });
    answers.push({ status: res.status, body: res.body });
  }
  for (const answer of answers) assert.deepEqual(answer, answers[0]);
  assert.equal(answers[0].status, 200);

  await mailTo(confirmed.email, { subject: /Reset your/ });
  await assertNoMailTo(unconfirmed.email);
  await assertNoMailTo('nobody-at-all@example.com');
});

test('a mistyped address at sign-up cannot be used to take over the account', async () => {
  // Someone signs up as mina@exmaple.com by mistake: the address was never confirmed
  const user = await newUser();
  const { status } = await call('/api/v1/auth/forgot-password', { body: { email: user.email } });
  assert.equal(status, 200);
  await assertNoMailTo(user.email);
});

test('a bad address is refused by its shape, and nothing is sent for it', async () => {
  for (const email of ['', 'no-at-sign', 'a@b', null, 42, undefined, ['a@b.com']]) {
    const { status, body } = await call('/api/v1/auth/forgot-password', { body: { email } });
    assert.equal(status, 400, JSON.stringify(email));
    assert.equal(body.success, false);
  }
  assert.equal((await call('/api/v1/auth/forgot-password')).status, 400);
  assert.deepEqual(outbox, []);
});

test('the link is always built from APP_URL, never from the request headers', async () => {
  const user = await newUser({ verified: true });
  await new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: '/api/v1/auth/forgot-password', method: 'POST', headers: {
        'Content-Type': 'application/json',
        Host: 'evil.example',
        'X-Forwarded-Host': 'evil.example',
        'X-Forwarded-Proto': 'https',
        Origin: 'https://evil.example',
        Referer: 'https://evil.example/',
        'X-Forwarded-For': newVisitor()
      } },
      res => { res.resume(); res.on('end', resolve); }
    );
    request.on('error', reject);
    request.end(JSON.stringify({ email: user.email }));
  });
  const mail = await mailTo(user.email, { subject: /Reset your/ });
  assert.ok(linkIn(mail).url.startsWith('https://sutkeri.test/'));
  assert.ok(!mail.text.includes('evil.example'));
});

test('a new request replaces the earlier link', async () => {
  const user = await newUser({ verified: true });
  await call('/api/v1/auth/forgot-password', { body: { email: user.email } });
  const first = linkIn(await mailTo(user.email, { subject: /Reset your/ }));
  await call('/api/v1/auth/forgot-password', { body: { email: user.email } });
  const second = linkIn(await mailTo(user.email, { subject: /Reset your/, count: 2 }));
  assert.notEqual(first.token, second.token);

  const old = await call('/api/v1/auth/reset-password', { body: { token: first.token, password: 'a brand new password' } });
  assert.equal(old.status, 400);
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token: second.token, password: 'a brand new password' } })).status, 200);
});

test('asking again and again is limited, whether or not the address has an account', async () => {
  const ip = newVisitor();
  for (const email of ['limit-known@example.com', 'limit-unknown@example.com']) {
    if (email.includes('known@')) await getUserStore().create({ name: 'Limit', email, password: 'correct horse battery' });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await call('/api/v1/auth/forgot-password', { body: { email }, ip: newVisitor() })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429], email);
  }

  // The visitor's address is limited too, across different addresses
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await call('/api/v1/auth/forgot-password', { body: { email: `spread${i}@example.com` }, ip })).status);
  assert.deepEqual(statuses, [...Array(10).fill(200), 429, 429]);
  const limited = await call('/api/v1/auth/forgot-password', { body: { email: 'spread99@example.com' }, ip });
  assert.match(limited.body.message, /Too many attempts/);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('a broken mail server does not change the answer', async () => {
  const user = await newUser({ verified: true });
  mailFails = true;
  const original = console.error;
  console.error = () => {};
  try {
    const { status, body } = await call('/api/v1/auth/forgot-password', { body: { email: user.email } });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    await sleep(100);
  } finally {
    console.error = original;
  }
});

test('with no email on this server, asking for a link says so plainly', async () => {
  const saved = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  try {
    const { status, body } = await call('/api/v1/auth/forgot-password', { body: { email: 'anyone@example.com' } });
    assert.equal(status, 503);
    assert.match(body.message, /not available/);
  } finally {
    process.env.SMTP_HOST = saved;
  }
});

// ---------------------------------------------------------------- choosing a new password

// Asks for a link and returns the one that arrives. The email is sent in the background, so it is
// counted BEFORE asking: a database that takes a few milliseconds must not make us pick up the old one.
async function resetLink(user) {
  const before = outbox.filter(mail => mail.to === user.email && /Reset your/.test(mail.subject)).length;
  await call('/api/v1/auth/forgot-password', { body: { email: user.email } });
  return linkIn(await mailTo(user.email, { subject: /Reset your/, count: before + 1 })).token;
}

test('the whole journey: forgot, reset, old password and old sign-ins stop, new ones work', async () => {
  const user = await newUser({ verified: true });
  const signedInBefore = (await call('/api/v1/auth/login', { body: { email: user.email, password: user.password } })).body.token;
  assert.equal((await me(signedInBefore)).status, 200);
  assert.equal((await me(user.jwt)).status, 200);

  const token = await resetLink(user);
  const newPassword = 'a brand new password';
  const done = await call('/api/v1/auth/reset-password', { body: { token, password: newPassword } });
  assert.equal(done.status, 200);
  assert.equal(done.body.success, true);
  assert.equal(done.body.token, undefined, 'a reset does not sign anyone in: the person signs in with the new password');

  // The old password no longer works, the new one does
  assert.equal((await call('/api/v1/auth/login', { body: { email: user.email, password: user.password } })).status, 401);
  const fresh = await call('/api/v1/auth/login', { body: { email: user.email, password: newPassword } });
  assert.equal(fresh.status, 200);

  // Every sign-in from before the change is ended, wherever it was made
  for (const old of [signedInBefore, user.jwt]) {
    const res = await me(old);
    assert.equal(res.status, 401);
    assert.match(res.body.message, /password was changed/i);
  }
  assert.equal((await me(fresh.body.token)).status, 200);

  // The person is told, in case it was not them
  const notice = await mailTo(user.email, { subject: /password was changed/ });
  assert.match(notice.text, /If you did not/);
  assert.ok(!notice.text.includes(newPassword) && !notice.text.includes(token));
});

test('a reset link works only once', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token, password: 'a brand new password' } })).status, 200);
  const second = await call('/api/v1/auth/reset-password', { body: { token, password: 'another new password' } });
  assert.equal(second.status, 400);
  assert.equal((await call('/api/v1/auth/login', { body: { email: user.email, password: 'another new password' } })).status, 401);
});

test('two people using the same link at the same moment: only one of them wins', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  const results = await Promise.all(['first new password', 'second new password', 'third new password']
    .map(password => call('/api/v1/auth/reset-password', { body: { token, password } })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 400).length, 2);
});

test('a password that is too weak is refused without using up the link', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);

  for (const [password, expected] of [
    ['short', /at least 8/],
    ['a'.repeat(73), /too long/i],
    [user.email, /same as your email/i],
    [user.email.toUpperCase(), /same as your email/i],
    ['', /password/i],
    [undefined, /password/i],
    [12345678, /password/i]
  ]) {
    const { status, body } = await call('/api/v1/auth/reset-password', { body: { token, password } });
    assert.equal(status, 400, String(password));
    assert.match(body.message, expected);
  }

  // The same link still works afterwards
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token, password: 'finally a good one' } })).status, 200);
  assert.equal((await call('/api/v1/auth/login', { body: { email: user.email, password: 'finally a good one' } })).status, 200);
});

test('a reset link that is expired, made up, or of the wrong kind is refused, all with the same message', async () => {
  const user = await newUser({ verified: true });
  const store = getUserStore();
  const wrongKind = newToken();
  await store.createAuthToken(user.id, 'verify', hashToken(wrongKind), Date.now() + 60000);
  const expired = newToken();
  await store.createAuthToken(user.id, 'reset', hashToken(expired), Date.now() - 1000);

  const messages = new Set();
  for (const token of [expired, wrongKind, newToken(), 'nonsense', '', null, 12345, ['a'], { $ne: '' }]) {
    const { status, body } = await call('/api/v1/auth/reset-password', { body: { token, password: 'a brand new password' } });
    assert.equal(status, 400, JSON.stringify(token));
    messages.add(body.message);
  }
  assert.equal(messages.size, 1, 'the reasons must not be told apart');
  assert.equal((await call('/api/v1/auth/login', { body: { email: user.email, password: 'a brand new password' } })).status, 401);
  assert.equal((await call('/api/v1/auth/reset-password', { body: {} })).status, 400);
  assert.equal((await call('/api/v1/auth/reset-password')).status, 400);
});

test('the page can ask whether a reset link is still good, without using it up', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  const ip = newVisitor();

  for (let i = 0; i < 3; i++) {
    const { status, body } = await call('/api/v1/auth/check-reset-link', { body: { token }, ip });
    assert.equal(status, 200);
    assert.deepEqual(body, { success: true }, 'it says nothing about whose link it is');
  }
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token, password: 'a brand new password' } })).status, 200, 'the link still worked afterwards');

  const used = await call('/api/v1/auth/check-reset-link', { body: { token }, ip });
  assert.equal(used.status, 400);
  assert.match(used.body.message, /not valid any more/);
});

test('a reset link check refuses expired, made-up and wrong-kind links with the usual message, and is limited', async () => {
  const user = await newUser({ verified: true });
  const store = getUserStore();
  const wrongKind = newToken();
  await store.createAuthToken(user.id, 'verify', hashToken(wrongKind), Date.now() + 60000);
  const expired = newToken();
  await store.createAuthToken(user.id, 'reset', hashToken(expired), Date.now() - 1000);

  const ip = newVisitor();
  const messages = new Set();
  for (const token of [expired, wrongKind, newToken(), 'nonsense', '', null, 42, { $ne: '' }]) {
    const { status, body } = await call('/api/v1/auth/check-reset-link', { body: { token }, ip });
    assert.equal(status, 400, JSON.stringify(token));
    messages.add(body.message);
  }
  assert.equal(messages.size, 1);
  assert.equal((await call('/api/v1/auth/check-reset-link', { ip })).status, 400);

  // 9 bad ones so far; the limit is 15 for guesses of any kind
  for (let i = 0; i < 6; i++) await call('/api/v1/auth/check-reset-link', { body: { token: newToken() }, ip });
  assert.equal((await call('/api/v1/auth/check-reset-link', { body: { token: newToken() }, ip })).status, 429);
});

test('a link for an account that has been deleted does nothing', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  await getUserStore().deleteUser(user.id);
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token, password: 'a brand new password' } })).status, 400);
});

test('deleting an account also deletes its links', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  await getUserStore().deleteUser(user.id);
  assert.equal(await getUserStore().peekAuthToken('reset', hashToken(token)), null);
});

test('guessing links is limited', async () => {
  const ip = newVisitor();
  const statuses = [];
  for (let i = 0; i < 17; i++) statuses.push((await call('/api/v1/auth/reset-password', { body: { token: newToken(), password: 'a brand new password' }, ip })).status);
  assert.deepEqual(statuses, [...Array(15).fill(400), 429, 429]);
  assert.equal((await call('/api/v1/auth/verify-email', { body: { token: newToken() }, ip })).status, 429, 'the limit is shared with confirming');
});

test('a weak password is not counted as a bad link', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  const ip = newVisitor();
  for (let i = 0; i < 20; i++) {
    assert.equal((await call('/api/v1/auth/reset-password', { body: { token, password: 'short' }, ip })).status, 400);
  }
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token, password: 'a brand new password' }, ip })).status, 200);
});

test('after a reset, the next reset works too (the sign-in check keeps counting)', async () => {
  const user = await newUser({ verified: true });
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token: await resetLink(user), password: 'second password here' } })).status, 200);
  const signedIn = (await call('/api/v1/auth/login', { body: { email: user.email, password: 'second password here' } })).body.token;
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token: await resetLink(user), password: 'third password here' } })).status, 200);
  assert.equal((await me(signedIn)).status, 401);
  assert.equal((await call('/api/v1/auth/login', { body: { email: user.email, password: 'third password here' } })).status, 200);
});

// ---------------------------------------------------------------- what is stored and shown

test('only a hash of each link is stored, never the link itself', async () => {
  const user = await newUser({ verified: true });
  const token = await resetLink(user);
  await sleep(50);

  let stored;
  let waiting;
  if (useMongo) {
    const entries = await AuthToken.find().lean();
    stored = JSON.stringify(entries);
    waiting = entries.find(entry => entry.userId === user.id && entry.purpose === 'reset');
    if (waiting) waiting = { ...waiting, expiresAt: waiting.expiresAt.getTime() };
  } else {
    stored = fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8');
    waiting = JSON.parse(stored).authTokens.find(entry => entry.userId === user.id && entry.purpose === 'reset');
  }
  assert.ok(!stored.includes(token), 'the link itself must not be in the database');
  assert.ok(waiting, 'the link is waiting to be used');
  assert.equal(waiting.hash, hashToken(token));
  assert.ok(waiting.expiresAt > Date.now() && waiting.expiresAt <= Date.now() + 60 * 60 * 1000, 'valid for at most an hour');
});

test('nothing about links or sign-in versions appears in what the API shows about a person', async () => {
  const user = await newUser({ verified: true });
  const res = await me(user.jwt);
  assert.deepEqual(Object.keys(res.body.data).sort(), ['createdAt', 'email', 'emailVerified', 'id', 'name', 'role']);
  assert.ok(!JSON.stringify(res.body).includes('tokenVersion'));
});

test('accounts made before this existed show as not confirmed, and their sign-ins keep working', async () => {
  // A record and a token exactly as the earlier version wrote them: no emailVerified, no tokenVersion, no "tv"
  const legacy = { email: 'old-account@example.com' };
  const passwordHash = await bcrypt.hash('correct horse battery', 4);
  if (useMongo) {
    // Straight into the collection, so the model's defaults cannot fill the missing fields in
    const { insertedId } = await User.collection.insertOne({ name: 'Old Account', email: legacy.email, password: passwordHash, role: 'user', createdAt: new Date('2025-01-01T00:00:00.000Z') });
    legacy.id = String(insertedId);
    const raw = await User.collection.findOne({ _id: insertedId });
    assert.ok(!('emailVerified' in raw) && !('tokenVersion' in raw), 'the stored record really lacks the new fields');
  } else {
    const file = path.join(dataDir, 'users.json');
    await sleep(200); // let anything still being written finish
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    legacy.id = 'legacy-account-1';
    data.users.push({ id: legacy.id, name: 'Old Account', email: legacy.email, passwordHash, role: 'user', createdAt: '2025-01-01T00:00:00.000Z' });
    fs.writeFileSync(file, JSON.stringify(data));
    initUserStore({ mongoConnected: false }); // reads the file again
  }

  const oldToken = jwt.sign({ id: legacy.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d', jwtid: 'legacy-jti' });
  const signedIn = await me(oldToken);
  assert.equal(signedIn.status, 200, 'a sign-in made before the update must survive it');
  assert.equal(signedIn.body.data.emailVerified, false);
  assert.ok(!('tokenVersion' in signedIn.body.data));

  const login = await call('/api/v1/auth/login', { body: { email: legacy.email, password: 'correct horse battery' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.emailVerified, false);

  // Until they confirm their address, no reset link goes to them
  await call('/api/v1/auth/forgot-password', { body: { email: legacy.email } });
  await assertNoMailTo(legacy.email);

  // After they confirm it, everything works for them like for anyone else
  await call('/api/v1/auth/resend-verification', { token: login.body.token });
  const { token } = linkIn(await mailTo(legacy.email, { subject: /Confirm your email/ }));
  assert.equal((await call('/api/v1/auth/verify-email', { body: { token } })).status, 200);
  await call('/api/v1/auth/forgot-password', { body: { email: legacy.email } });
  const reset = linkIn(await mailTo(legacy.email, { subject: /Reset your/ })).token;
  assert.equal((await call('/api/v1/auth/reset-password', { body: { token: reset, password: 'a brand new password' } })).status, 200);
  assert.equal((await me(oldToken)).status, 401, 'and the reset ends the old sign-in');
});
