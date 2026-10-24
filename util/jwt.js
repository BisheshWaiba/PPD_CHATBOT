import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { dataDir, isProduction } from './paths.js';

let cachedSecret = null;

// The signing secret must never fall back to a value that is written in the source code.
// - JWT_SECRET set: use it (it must be long enough in production).
// - Not set in production: refuse to run.
// - Not set in development: generate a random secret once and keep it in data/.jwt-secret
//   so sign-ins survive a restart.
export function getJwtSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) {
      if (isProduction()) {
        throw new Error('JWT_SECRET must be at least 32 characters in production.');
      }
      console.warn('JWT_SECRET is shorter than 32 characters. Use a long random value.');
    }
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (isProduction()) {
    throw new Error('JWT_SECRET is not set. Refusing to start in production without it.');
  }

  const file = path.join(dataDir(), '.jwt-secret');
  try {
    cachedSecret = fs.readFileSync(file, 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (!cachedSecret) {
    cachedSecret = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
    console.warn('JWT_SECRET is not set. Generated a development secret in data/.jwt-secret.');
  }
  return cachedSecret;
}

// Call once at startup so a missing secret in production fails immediately
export function assertJwtConfig() {
  getJwtSecret();
}

// Every token gets its own id (the "jti" claim), so signing out can end this one token
// without touching the same account's sign-ins on other devices.
export function signToken(user) {
  return jwt.sign({ id: String(user.id) }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRE || '7d',
    jwtid: crypto.randomUUID()
  });
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

// Test helper: forget the cached secret
export function resetJwtSecretCache() {
  cachedSecret = null;
}
