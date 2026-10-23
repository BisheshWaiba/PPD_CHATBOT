// How the JWT secret is chosen: never from a value written in the source code.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { getJwtSecret, resetJwtSecretCache } = await import('../util/jwt.js');

let dir;
const saved = {};
const KEYS = ['JWT_SECRET', 'NODE_ENV', 'AUTH_DATA_DIR'];

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-jwt-test-'));
  process.env.AUTH_DATA_DIR = dir;
  delete process.env.JWT_SECRET;
  resetJwtSecretCache();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetJwtSecretCache();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('uses JWT_SECRET from the environment', () => {
  process.env.JWT_SECRET = 'a'.repeat(40);
  process.env.NODE_ENV = 'production';
  assert.equal(getJwtSecret(), 'a'.repeat(40));
});

test('production refuses to run without a secret', () => {
  process.env.NODE_ENV = 'production';
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
});

test('production refuses a short secret', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'short';
  assert.throws(() => getJwtSecret(), /at least 32/);
});

test('development generates a random secret and keeps it across restarts', () => {
  process.env.NODE_ENV = 'development';
  const first = getJwtSecret();
  assert.ok(first.length >= 64);
  assert.notEqual(first, 'momapp_default_jwt_secret_key');
  resetJwtSecretCache(); // simulates a restart
  assert.equal(getJwtSecret(), first);
});
