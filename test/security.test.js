// Content-Security-Policy, pages that must stay compatible with it, and removed debug pages.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-security-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

let server;
let base;

before(async () => {
  initUserStore({ mongoConnected: false });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// "script-src 'self'; style-src ..." -> { 'script-src': ["'self'"], ... }
const parsePolicy = header => Object.fromEntries(
  header.split(';').map(part => part.trim().split(/\s+/)).filter(parts => parts[0]).map(([name, ...values]) => [name, values])
);

// The pages people actually use
const LIVE_PAGES = ['home.html', 'chat.html', 'login.html', 'signup.html', 'aboutus.html', 'report.html', 'history.html', '404.html'];

test('scripts may only come from this site, and never inline', async () => {
  const res = await fetch(`${base}/`);
  const policy = parsePolicy(res.headers.get('content-security-policy'));
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['base-uri'], ["'self'"]);
  assert.deepEqual(policy['form-action'], ["'self'"]);
  assert.deepEqual(policy['connect-src'], ["'self'"]);
  assert.ok(policy['style-src'].includes('https://fonts.googleapis.com'));
  assert.deepEqual(policy['font-src'], ['https://fonts.gstatic.com']);
});

test('the policy is sent on pages, API answers and 404s alike', async () => {
  for (const url of ['/', '/login.html', '/nope', '/api/v1/nope', '/api/v1/auth/me']) {
    const res = await fetch(base + url);
    assert.ok(res.headers.get('content-security-policy'), url);
  }
});

test('framing is refused only in production, like X-Frame-Options', async () => {
  const development = parsePolicy((await fetch(`${base}/`)).headers.get('content-security-policy'));
  assert.equal('frame-ancestors' in development, false);

  process.env.NODE_ENV = 'production';
  try {
    const res = await fetch(`${base}/`);
    assert.deepEqual(parsePolicy(res.headers.get('content-security-policy'))['frame-ancestors'], ["'none'"]);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  } finally {
    process.env.NODE_ENV = 'test';
  }
});

test('the live pages have no inline scripts or inline event handlers, which the policy would block', () => {
  for (const page of LIVE_PAGES) {
    const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, `${page} has an inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, `${page} has an inline event handler`);
    assert.doesNotMatch(html, /href\s*=\s*["']javascript:/i, `${page} has a javascript: link`);
  }
});

test('every script the live pages load is served from this site as JavaScript', async () => {
  const sources = new Set();
  for (const page of LIVE_PAGES) {
    const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
    for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/gi)) sources.add(match[1]);
  }
  assert.ok(sources.size >= 6, 'expected the pages to load several scripts');
  for (const src of sources) {
    assert.ok(src.startsWith('/'), `${src} must be a path on this site`);
    const res = await fetch(base + src);
    assert.equal(res.status, 200, src);
    assert.match(res.headers.get('content-type'), /javascript/, src);
  }
});

test('the debug and test pages are gone', async () => {
  const removed = [
    'debug-test.html', 'direct-test.html', 'emotional-test.html', 'fixed-chatbot.html',
    'test-chatbot.html', 'test-emotional.html', 'verify-chatbot.html',
    'js/debug-chatbot.js', 'js/debug.js', 'js/force-emotional-state.js',
    'js/simple-test.js', 'js/test-emotional.js', 'js/verify-emotional.js'
  ];
  for (const file of removed) {
    assert.equal((await fetch(`${base}/${file}`)).status, 404, file);
  }
});

test('the chat page cannot be given a fake date through the address', async () => {
  const source = await (await fetch(`${base}/js/chatbot-client.js`)).text();
  assert.doesNotMatch(source, /testDate|mockDate|Mock Date/);
});
