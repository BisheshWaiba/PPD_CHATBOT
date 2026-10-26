// The launch check (npm run check:production). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { runProductionChecks, countByLevel } = await import('../util/productionCheck.js');

// Secrets that must never appear in any output
const SECRETS = {
  jwt: randomBytes(48).toString('hex'),
  mongoPassword: 'Tr0ub4dor-and-3-horses',
  smtpPassword: 'smtp-pass-that-must-stay-secret',
  apiKey: 'sk-ant-api03-THIS-KEY-MUST-STAY-SECRET'
};

const goodEnv = () => ({
  NODE_ENV: 'production',
  JWT_SECRET: SECRETS.jwt,
  MONGO_URI: `mongodb+srv://appuser:${SECRETS.mongoPassword}@cluster0.abcde.mongodb.net/sutkeri?retryWrites=true&w=majority`,
  APP_URL: 'https://sutkeri.example.com',
  TRUST_PROXY: 'true',
  SMTP_HOST: 'smtp.mail.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'mailer',
  SMTP_PASS: SECRETS.smtpPassword,
  MAIL_FROM: 'Sutkeri <no-reply@sutkeri.example.com>',
  ANTHROPIC_API_KEY: SECRETS.apiKey,
  ASSISTANT_DAILY_BUDGET_USD: '5',
  CHAT_HISTORY_DAYS: '90'
});

const goodDeps = () => ({
  nodeVersion: '24.4.0',
  skipNetwork: false,
  connectDatabase: async () => ({ ok: true }),
  verifyMail: async () => ({ ok: true }),
  readPublicPage: () => '<html><body>finished</body></html>',
  knowledgeEntries: [{ id: 'what-is-ppd', signed: true }, { id: 'baby-blues', signed: true }]
});

const run = (envChanges = {}, depsChanges = {}) => {
  const env = { ...goodEnv(), ...envChanges };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  return runProductionChecks(env, { ...goodDeps(), ...depsChanges });
};
const find = (results, pattern) => results.find(item => pattern.test(item.title));
const levels = results => countByLevel(results);

test('a complete, safe production configuration has nothing to fix and nothing risky', async () => {
  const results = await run();
  assert.deepEqual({ fail: levels(results).fail, warn: levels(results).warn }, { fail: 0, warn: 0 }, JSON.stringify(results.filter(item => ['fail', 'warn'].includes(item.level))));
  assert.ok(levels(results).ok >= 8, 'and says what it checked');
  assert.ok(results.some(item => item.level === 'info'), 'and still leaves the notes that no program can check');
});

// [what is wrong, changes to the settings, expected level, expected title]
const SETTINGS = [
  ['not in production mode', { NODE_ENV: 'development' }, 'fail', /NODE_ENV is not "production"/],
  ['no mode at all', { NODE_ENV: undefined }, 'fail', /NODE_ENV is not "production"/],
  ['no JWT secret', { JWT_SECRET: undefined }, 'fail', /JWT_SECRET is not set/],
  ['a short JWT secret', { JWT_SECRET: 'short-secret' }, 'fail', /JWT_SECRET is too short/],
  ['a JWT secret that is one repeated character', { JWT_SECRET: 'x'.repeat(48) }, 'fail', /looks like a placeholder/],
  ['a JWT secret copied from the examples', { JWT_SECRET: 'your-secret-goes-here-and-it-is-long-enough' }, 'fail', /looks like a placeholder/],
  ['weak password hashing left over from testing', { BCRYPT_ROUNDS: '4' }, 'fail', /BCRYPT_ROUNDS is set low/],
  ['the local user file forced on', { AUTH_STORE: 'file' }, 'fail', /AUTH_STORE=file/],
  ['no database address', { MONGO_URI: undefined }, 'fail', /MONGO_URI is not set/],
  ['a database address that is not MongoDB', { MONGO_URI: 'postgres://example.com/db' }, 'fail', /does not look like a MongoDB address/],
  ['the example placeholders still in the database address', { MONGO_URI: 'mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>' }, 'fail', /example placeholders/],
  ['a database on the same machine', { MONGO_URI: 'mongodb://127.0.0.1:27017/sutkeri' }, 'warn', /same machine/],
  ['a remote database without an encrypted connection', { MONGO_URI: 'mongodb://db.example.com:27017/sutkeri' }, 'warn', /does not ask for an encrypted connection/],
  ['no site address', { APP_URL: undefined }, 'fail', /APP_URL is not set/],
  ['a site address that is not an address', { APP_URL: 'sutkeri dot com' }, 'fail', /not a web address/],
  ['a site address that is not HTTPS', { APP_URL: 'http://sutkeri.example.com' }, 'fail', /APP_URL is not HTTPS/],
  ['a site address that points at this machine', { APP_URL: 'https://localhost:8006' }, 'fail', /points at this machine/],
  ['a site address with a path', { APP_URL: 'https://sutkeri.example.com/app' }, 'warn', /APP_URL has a path/],
  ['no proxy setting', { TRUST_PROXY: undefined }, 'warn', /TRUST_PROXY is not set/],
  ['no email at all', { SMTP_HOST: undefined, MAIL_FROM: undefined }, 'warn', /Email is not set up/],
  ['email half set up', { MAIL_FROM: undefined }, 'fail', /half set up/],
  ['a sender with no address in it', { MAIL_FROM: 'Sutkeri' }, 'fail', /MAIL_FROM has no email address/],
  ['every website allowed to call the API', { CORS_ORIGIN: 'https://a.example.com, *' }, 'fail', /CORS_ORIGIN allows every site/],
  ['the AI pointed somewhere else', { ANTHROPIC_BASE_URL: 'http://localhost:9999' }, 'warn', /ANTHROPIC_BASE_URL is set/],
  ['an AI key without a daily budget', { ASSISTANT_DAILY_BUDGET_USD: undefined }, 'warn', /no daily budget/],
  ['an AI budget of nonsense', { ASSISTANT_DAILY_BUDGET_USD: 'lots' }, 'warn', /no daily budget/],
  ['an AI model we cannot price', { ASSISTANT_MODEL: 'some-model-from-the-future' }, 'warn', /has no price in this app/],
  ['a key that is not an Anthropic key', { ANTHROPIC_API_KEY: 'not-an-anthropic-key' }, 'warn', /does not look like an Anthropic key/]
];

for (const [label, changes, level, title] of SETTINGS) {
  test(`${label}: ${level}`, async () => {
    const results = await run(changes);
    const item = find(results, title);
    assert.ok(item, `expected "${title}" in: ${results.map(r => r.title).join(' | ')}`);
    assert.equal(item.level, level);
    assert.ok(item.detail.length > 30, 'and it says what to do about it');
  });
}

test('an old Node version is refused', async () => {
  const item = find(await run({}, { nodeVersion: '20.11.0' }), /too old/);
  assert.equal(item.level, 'fail');
  assert.match(item.detail, /Node 22/);
});

test('a database that cannot be used, or a mail server that cannot be logged in to, is a failure that says why', async () => {
  const database = find(await run({}, { connectDatabase: async () => ({ ok: false, message: 'MongoDB connection failed: Authentication failed.' }) }), /Could not use the database/);
  assert.equal(database.level, 'fail');
  assert.match(database.detail, /Authentication failed/);

  const mail = find(await run({}, { verifyMail: async () => ({ ok: false, message: 'EAUTH 535.' }) }), /Could not use the mail server/);
  assert.equal(mail.level, 'fail');
  assert.match(mail.detail, /EAUTH 535/);
});

test('--skip-network tries neither the database nor the mail server', async () => {
  const forbidden = async () => { throw new Error('must not be called'); };
  const results = await run({}, { skipNetwork: true, connectDatabase: forbidden, verifyMail: forbidden });
  assert.equal(levels(results).fail, 0);
  assert.ok(find(results, /Database connection not tried/));
  assert.ok(find(results, /Mail server not tried/));
});

test('a policy page with unfilled markers, or one that is missing, blocks the launch and says which', async () => {
  const draft = '<p>Run by <mark class="todo">[[NAME OF THE ORGANISATION]]</mark>, at <mark class="todo">[[ADDRESS]]</mark>.</p>';
  const item = find(await run({}, { readPublicPage: file => (file === 'privacy.html' ? draft : '<p>finished</p>') }), /not finished/);
  assert.equal(item.level, 'fail');
  assert.match(item.detail, /The privacy policy \(public\/privacy\.html\) still has 2 unfilled markers/);
  assert.match(item.detail, /NAME OF THE ORGANISATION/);
  assert.ok(!/terms/i.test(item.detail.split('Fill in')[0]), 'the finished page is not blamed');

  const missing = find(await run({}, { readPublicPage: file => (file === 'terms.html' ? null : '<p>finished</p>') }), /not finished/);
  assert.match(missing.detail, /The terms \(public\/terms\.html\) is missing/);
});

test('health answers that no clinician has signed block the launch and are named; signed ones do not', async () => {
  const unsigned = find(await run({}, { knowledgeEntries: [{ id: 'what-is-ppd', signed: false }, { id: 'baby-blues', signed: true }, { id: 'lochia', signed: false }] }), /sourced health answers have not been reviewed/);
  assert.equal(unsigned.level, 'fail');
  assert.match(unsigned.title, /^2 of 3 /);
  assert.match(unsigned.detail, /Not yet signed: what-is-ppd, lochia\./);
  assert.ok(!/baby-blues/.test(unsigned.detail), 'a signed answer is not blamed');
  assert.match(unsigned.detail, /review:pack/);

  const signed = await run();
  assert.equal(find(signed, /sourced health answers have been signed/).level, 'ok');
  assert.equal(levels(signed).fail, 0);
  assert.equal(find(signed, /health answers are in English only/).level, 'info', 'and the Nepali gap is always mentioned');
});

test('with no list of health answers given, the check says nothing rather than guess', async () => {
  const results = await run({}, { knowledgeEntries: undefined });
  assert.equal(find(results, /health answers/), undefined);
});

test('with the AI off, nothing about the AI is demanded', async () => {
  const results = await run({ ANTHROPIC_API_KEY: undefined, ASSISTANT_DAILY_BUDGET_USD: undefined });
  assert.equal(levels(results).warn, 0);
  assert.equal(find(results, /AI conversation is off/).level, 'info');
});

test('how long chats are kept is mentioned either way, so the policy can be matched to it', async () => {
  assert.match(find(await run({ CHAT_HISTORY_DAYS: '90' }), /Chats are deleted/).title, /90 days/);
  assert.match(find(await run({ CHAT_HISTORY_DAYS: undefined }), /Chats are kept until/).title, /kept until their owner deletes/);
});

test('the note about running one copy is always there', async () => {
  assert.ok(find(await run(), /exactly one copy/));
});

test('no secret ever appears in the results, whatever is wrong', async () => {
  for (const changes of [{}, { JWT_SECRET: SECRETS.jwt.slice(0, 20) }, { MONGO_URI: `mongodb://admin:${SECRETS.mongoPassword}@db.example.com/x` }, { APP_URL: 'http://x.example.com' }]) {
    const text = JSON.stringify(await run(changes, { connectDatabase: async () => ({ ok: false, message: 'MongoDB connection failed.' }) }));
    for (const [name, secret] of Object.entries(SECRETS)) assert.ok(!text.includes(secret), `${name} leaked`);
  }
});

// --- The command, run for real ---------------------------------------------------------------------

const realMarkers = ['privacy.html', 'terms.html'].reduce((total, file) => total + (fs.readFileSync(path.join(root, 'public', file), 'utf8').match(/\[\[[^\]]*\]\]/g) || []).length, 0);
const { ENTRIES, isSignedOff } = await import('../public/js/knowledge.js');
const unsignedAnswers = ENTRIES.filter(entry => !isSignedOff(entry)).length;

function runCli(args, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'check-production.js'), ...args], {
      cwd: root,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('close', code => resolve({ code, out }));
  });
}

function envFile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-production-test-'));
  const file = path.join(dir, 'production.env');
  fs.writeFileSync(file, Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n'));
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the command reads a settings file, groups what it finds, exits 1 when something must be fixed, and prints no secret', async () => {
  const { file, cleanup } = envFile({ ...goodEnv(), NODE_ENV: 'development', ASSISTANT_DAILY_BUDGET_USD: '' });
  try {
    const { code, out } = await runCli(['--skip-network', '--env', file]);
    assert.equal(code, 1);
    assert.match(out, /FIX\s+NODE_ENV is not "production"/);
    assert.match(out, /RISK\s+The AI has no daily budget/);
    assert.match(out, /ok\s+JWT_SECRET is set and long enough/);
    assert.match(out, /\d+ to fix, \d+ risks?, \d+ fine\./);
    assert.match(out, /Not ready to launch\./);
    for (const [name, secret] of Object.entries(SECRETS)) assert.ok(!out.includes(secret), `${name} was printed`);
  } finally {
    cleanup();
  }
});

test('the shipped privacy policy, terms and health answers count against launch for as long as they are unfinished or unsigned', async () => {
  const { file, cleanup } = envFile(goodEnv());
  try {
    const { code, out } = await runCli(['--skip-network', '--env', file]);
    const toFix = (realMarkers > 0 ? 1 : 0) + (unsignedAnswers > 0 ? 1 : 0);
    assert.equal(code, toFix > 0 ? 1 : 0, out);
    assert.match(out, new RegExp(`\\b${toFix} to fix`));
    if (realMarkers > 0) assert.match(out, /FIX\s+The privacy policy and terms are not finished/);
    if (unsignedAnswers > 0) assert.match(out, new RegExp(`FIX\\s+${unsignedAnswers} of ${ENTRIES.length} sourced health answers have not been reviewed`));
    for (const [name, secret] of Object.entries(SECRETS)) assert.ok(!out.includes(secret), `${name} was printed`);
  } finally {
    cleanup();
  }
});

test('a settings file that is not there is explained, not a crash', async () => {
  const { code, out } = await runCli(['--env', path.join(os.tmpdir(), 'no-such-settings-file.env')]);
  assert.equal(code, 1);
  assert.match(out, /Cannot find the settings file/);
  assert.doesNotMatch(out, /at .*\.js:\d+/, 'no stack trace');
});
