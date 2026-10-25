// What a host needs from the app: a health check, HTTPS, and a clean stop. Run with: npm test
//
// The test against a real MongoDB is skipped unless TEST_MONGO_URI is set.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { connectTestDatabase, dropTestDatabase } from './support/mongo.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-deploy-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;
delete process.env.AUTH_STORE;

const useMongo = Boolean(process.env.TEST_MONGO_URI);

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');
const { createShutdown } = await import('../util/shutdown.js');
const { isReady } = await import('../util/health.js');

let server;
let base;
let port;

before(async () => {
  initUserStore({ mongoConnected: false }); // the local file store, as in development
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Sets environment variables for one test and puts them back afterwards
const saved = {};
const setEnv = vars => {
  for (const [key, value] of Object.entries(vars)) {
    if (!(key in saved)) saved[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
};
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    delete saved[key];
  }
  initUserStore({ mongoConnected: false });
});

const get = (route, headers = {}, method = 'GET') => fetch(base + route, { method, headers, redirect: 'manual' });

// A request with a Host header of our choosing (fetch does not let us forge it)
const rawRequest = (route, headers, method = 'GET') => new Promise((resolve, reject) => {
  const request = http.request({ host: '127.0.0.1', port, path: route, method, headers }, res => {
    res.resume();
    res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
  });
  request.on('error', reject);
  request.end();
});

// --- The health check -----------------------------------------------------------------------

test('the health check says ok when the app can do its job, and says nothing else', async () => {
  const res = await get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('the health check needs no sign-in and is not part of the API', async () => {
  assert.equal((await get('/healthz')).status, 200);
  assert.equal((await get('/api/v1/healthz')).status, 404);
  assert.equal((await get('/healthz', {}, 'HEAD')).status, 200, 'a monitor may use HEAD');
});

test('with no user database (production without MongoDB) the health check says unavailable', async () => {
  setEnv({ NODE_ENV: 'production' });
  assert.equal(initUserStore({ mongoConnected: false }), null, 'production refuses the local file');
  const res = await get('/healthz');
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: 'unavailable' });
});

test('with MongoDB as the store but the connection down, the health check says unavailable', async () => {
  assert.notEqual(mongoose.connection.readyState, 1);
  initUserStore({ mongoConnected: true }); // the MongoDB store is chosen, but nothing is connected
  assert.equal(isReady(), false);
  const res = await get('/healthz');
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: 'unavailable' });
});

test('with a real MongoDB connected the health check says ok, and unavailable again once it is gone', { skip: !useMongo && 'set TEST_MONGO_URI to run this' }, async () => {
  await connectTestDatabase('deployment');
  try {
    initUserStore({ mongoConnected: true });
    assert.equal((await get('/healthz')).status, 200);
    await mongoose.disconnect();
    assert.equal((await get('/healthz')).status, 503);
  } finally {
    await connectTestDatabase('deployment').catch(() => {});
    await dropTestDatabase().catch(() => {});
  }
});

// --- HTTPS ----------------------------------------------------------------------------------

const production = (extra = {}) => setEnv({ NODE_ENV: 'production', APP_URL: 'https://sutkeri.example.com', ...extra });

test('in production a visitor who came by plain HTTP is sent to the HTTPS address, keeping the path and query', async () => {
  production();
  const res = await get('/login.html?next=%2Fchat.html', { 'x-forwarded-proto': 'http' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://sutkeri.example.com/login.html?next=%2Fchat.html');
});

test('a visitor who came by HTTPS, or whose connection says nothing, is not redirected: no loop is possible', async () => {
  production();
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'https' })).status, 200);
  assert.equal((await get('/login.html')).status, 200, 'a proxy that does not say anything must not cause a redirect for ever');
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'https, http' })).status, 200, 'the first value is the visitor\'s');
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'HTTP' })).status, 301, 'case does not matter');
});

test('a request that is not a page keeps its method: a POST gets a 308, not a 301 that would turn it into a GET', async () => {
  production();
  const res = await get('/api/v1/auth/login', { 'x-forwarded-proto': 'http' }, 'POST');
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://sutkeri.example.com/api/v1/auth/login');
});

test('the address in the redirect is always the configured one, never one taken from the request', async () => {
  production();
  const forged = await rawRequest('/login.html', { host: 'evil.example', 'x-forwarded-proto': 'http', 'x-forwarded-host': 'evil.example' });
  assert.equal(forged.status, 301);
  assert.equal(forged.location, 'https://sutkeri.example.com/login.html');

  // A path that looks like an address cannot change where it goes either
  const sneaky = await get('//evil.example/login.html', { 'x-forwarded-proto': 'http' });
  assert.ok(new URL(sneaky.headers.get('location')).origin === 'https://sutkeri.example.com', sneaky.headers.get('location'));
});

test('the health check is never redirected, so a monitor can call it over plain HTTP', async () => {
  production();
  const res = await get('/healthz', { 'x-forwarded-proto': 'http' });
  assert.equal(res.status, 200, 'answered where it was asked, not sent elsewhere');
  assert.equal(res.headers.get('location'), null);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('there is no redirect outside production, or when the site address is not HTTPS, or is not set', async () => {
  setEnv({ NODE_ENV: 'test', APP_URL: 'https://sutkeri.example.com' });
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'http' })).status, 200, 'development and tests');

  production({ APP_URL: 'http://sutkeri.example.com' });
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'http' })).status, 200, 'an http address would only redirect to itself');

  production({ APP_URL: undefined });
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'http' })).status, 200, 'no address: nowhere to send anyone');

  production({ APP_URL: 'javascript:alert(1)' });
  assert.equal((await get('/login.html', { 'x-forwarded-proto': 'http' })).status, 200, 'not a web address');
});

test('production also sends HSTS and refuses framing on every page, redirected or not', async () => {
  production();
  const res = await get('/login.html', { 'x-forwarded-proto': 'https' });
  assert.match(res.headers.get('strict-transport-security'), /max-age=\d+/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  const redirected = await get('/login.html', { 'x-forwarded-proto': 'http' });
  assert.match(redirected.headers.get('strict-transport-security'), /max-age=\d+/);
});

// --- A clean stop ---------------------------------------------------------------------------

function recorder() {
  const events = [];
  return { events, log: message => events.push(`log: ${message}`), exit: code => events.push(`exit ${code}`) };
}

test('a request in progress finishes before the app stops, and the database is closed after the server', async () => {
  const { events, log, exit } = recorder();
  let arrived;
  const requestArrived = new Promise(resolve => { arrived = resolve; });
  const slow = http.createServer((req, res) => {
    arrived();
    setTimeout(() => { res.end('finished'); events.push('request finished'); }, 150);
  });
  await new Promise(resolve => slow.listen(0, '127.0.0.1', resolve));

  const inProgress = fetch(`http://127.0.0.1:${slow.address().port}/`).then(res => res.text());
  await requestArrived; // the server has the request and is working on it, however slow this machine is

  const shutdown = createShutdown({ server: slow, closeDatabase: async () => { events.push('database closed'); }, log, exit });
  await shutdown('SIGTERM');

  assert.equal(await inProgress, 'finished', 'the person got their answer');
  assert.deepEqual(events.filter(event => !event.startsWith('log')), ['request finished', 'database closed', 'exit 0']);
  assert.match(events[0], /SIGTERM received/);
});

test('connections that are only waiting do not hold the stop up', async () => {
  const { events, log, exit } = recorder();
  const idle = http.createServer((req, res) => res.end('ok'));
  await new Promise(resolve => idle.listen(0, '127.0.0.1', resolve));
  const agent = new http.Agent({ keepAlive: true });
  await new Promise(resolve => http.get({ host: '127.0.0.1', port: idle.address().port, agent }, res => { res.resume(); res.on('end', resolve); }));

  const started = Date.now();
  await createShutdown({ server: idle, closeDatabase: async () => {}, log, exit, timeoutMs: 5000 })('SIGTERM');
  agent.destroy();
  assert.ok(Date.now() - started < 2000, 'a kept-alive connection must not make it wait for the timeout');
  assert.deepEqual(events.filter(event => event.startsWith('exit')), ['exit 0']);
});

test('a second signal while stopping changes nothing', async () => {
  const { events, log, exit } = recorder();
  let closes = 0;
  const server = { close: cb => { closes += 1; setTimeout(cb, 20); }, closeIdleConnections() {} };
  const shutdown = createShutdown({ server, closeDatabase: async () => {}, log, exit });
  await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT'), shutdown('SIGTERM')]);
  assert.equal(closes, 1);
  assert.deepEqual(events.filter(event => event.startsWith('exit')), ['exit 0']);
});

test('if something goes wrong while stopping, it still exits, with a failure code', async () => {
  const { events, log, exit } = recorder();
  const server = { close: cb => cb(), closeIdleConnections() {} };
  await createShutdown({ server, closeDatabase: async () => { throw new Error('the database would not close'); }, log, exit })('SIGTERM');
  assert.deepEqual(events.filter(event => event.startsWith('exit')), ['exit 1']);
  assert.ok(events.some(event => /database would not close/.test(event)));
});

test('if the stop never finishes, it gives up after the timeout instead of hanging for ever', async () => {
  const { events, log, exit } = recorder();
  const server = { close() { /* never calls back */ }, closeIdleConnections() {} };
  createShutdown({ server, closeDatabase: async () => {}, log, exit, timeoutMs: 60 })('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(events.filter(event => event.startsWith('exit')), ['exit 1']);
  assert.ok(events.some(event => /taking longer than/.test(event)));
});

// --- Passwords -----------------------------------------------------------------------------

test('in production a weak BCRYPT_ROUNDS left over from testing is ignored, never used', async () => {
  const { bcryptRounds } = await import('../util/passwords.js');
  setEnv({ NODE_ENV: 'test', BCRYPT_ROUNDS: '4' });
  assert.equal(bcryptRounds(), 4, 'tests may use a few rounds to stay fast');

  setEnv({ NODE_ENV: 'production' });
  assert.equal(bcryptRounds(), 10, 'but production never goes below 10');

  setEnv({ BCRYPT_ROUNDS: '14' });
  assert.equal(bcryptRounds(), 14, 'and a stronger setting is honoured');

  setEnv({ BCRYPT_ROUNDS: undefined });
  assert.equal(bcryptRounds(), 12, 'the default');
});

// --- Behind a proxy ------------------------------------------------------------------------

test('the server keeps an idle connection open longer than a proxy does, so the proxy is always the one to close it', async () => {
  const { tuneServer, KEEP_ALIVE_MS, HEADERS_MS } = await import('../util/serverTuning.js');
  const plain = http.createServer();
  assert.equal(plain.keepAliveTimeout, 5000, 'Node\'s own 5 seconds: shorter than a load balancer\'s idle time, which causes sporadic 502s');

  assert.equal(tuneServer(plain), plain);
  assert.equal(plain.keepAliveTimeout, KEEP_ALIVE_MS);
  assert.ok(KEEP_ALIVE_MS > 60 * 1000, 'longer than the usual 60 second proxy limit');
  assert.ok(HEADERS_MS > KEEP_ALIVE_MS, 'Node requires the header timeout to be the longer of the two');
  assert.equal(plain.headersTimeout, HEADERS_MS);
});

test('the real server start-up uses it', () => {
  const source = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'server.js'), 'utf8');
  assert.match(source, /tuneServer\(app\.listen\(/);
});
