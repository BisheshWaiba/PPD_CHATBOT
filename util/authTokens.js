import { randomBytes, createHash } from 'crypto';

// The tokens in "reset your password" and "verify your email" links. 32 random bytes (256 bits),
// so they cannot be guessed. The database only ever holds a hash of them: someone who gets a copy
// of the database cannot turn it into a working link.

export const RESET_TTL_MS = 60 * 60 * 1000;        // a reset link works for one hour
export const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;  // a verification link for two days

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = token => createHash('sha256').update(String(token)).digest('hex');

// 32 bytes in base64url is exactly 43 characters. Anything else cannot be one of ours.
export const looksLikeToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

// Makes a fresh token for the account and keeps its hash. Returns the token to put in the email.
// An earlier link of the same kind stops working.
export async function issueToken(store, userId, purpose) {
  const token = newToken();
  await store.createAuthToken(userId, purpose, hashToken(token), Date.now() + (purpose === 'reset' ? RESET_TTL_MS : VERIFY_TTL_MS));
  return token;
}
