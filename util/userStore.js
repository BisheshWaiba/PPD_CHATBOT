import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { writeFileAtomic } from './atomicWrite.js';
import User from '../models/User.js';
import RevokedToken from '../models/RevokedToken.js';
import AuthToken from '../models/AuthToken.js';
import { hashPassword, comparePassword } from './passwords.js';
import { dataDir, isProduction } from './paths.js';

// Where users live. Both stores expose the same calls and never return a password.
//   create({ name, email, password })  -> user, throws DuplicateEmailError
//   authenticate(email, password)      -> user or null
//   findById(id)                       -> user or null
//   revokeToken(jti, exp)              -> remembers a signed-out token until exp (seconds)
//   isTokenRevoked(jti)                -> true while that token must be refused
//   deleteUser(id)                     -> true if the account existed and is now gone
//   findByEmail(email)                 -> user or null
//   markEmailVerified(id)              -> true if the account exists
//   setPassword(id, newPassword)       -> true if the account exists. Ends every sign-in made
//                                         before, and clears the account's reset links.
//   createAuthToken(userId, purpose, hash, expiresAtMs)
//                                      -> keeps a single-use link token (only its hash, never the
//                                         token itself), replacing any earlier one of that purpose
//   peekAuthToken(purpose, hash)       -> the user id if the token is good, without using it up
//   consumeAuthToken(purpose, hash)    -> the user id the first time, then never again; null when
//                                         the token is unknown, used up or expired
//
// - mongo: the real database (always used when MongoDB is connected).
// - file:  data/users.json with bcrypt hashes. Development fallback for when MongoDB
//          is not reachable. Never used in production.

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists');
    this.name = 'DuplicateEmailError';
  }
}

// Failed sign-ins for unknown emails still cost one bcrypt comparison, so response time
// does not reveal which emails have accounts.
let dummyHash = null;
async function spendComparison(password) {
  dummyHash ||= await hashPassword(randomUUID());
  await comparePassword(password, dummyHash);
}

const toPublic = user => {
  const publicUser = {
    id: String(user.id ?? user._id),
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    createdAt: user.createdAt,
    emailVerified: Boolean(user.emailVerified)
  };
  // Which sign-ins are still valid. It is deliberately not enumerable, so it never appears in a
  // response: only the token code reads it (user.tokenVersion).
  Object.defineProperty(publicUser, 'tokenVersion', { value: user.tokenVersion || 0, enumerable: false });
  return publicUser;
};

const mongoStore = {
  kind: 'mongo',

  async create({ name, email, password }) {
    try {
      // The model hashes the password before saving
      const user = await User.create({ name, email, password });
      return toPublic(user);
    } catch (err) {
      if (err?.code === 11000) throw new DuplicateEmailError();
      throw err;
    }
  },

  async authenticate(email, password) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      await spendComparison(password);
      return null;
    }
    return (await user.matchPassword(password)) ? toPublic(user) : null;
  },

  async findById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    const user = await User.findById(id);
    return user ? toPublic(user) : null;
  },

  async deleteUser(id) {
    if (!mongoose.isValidObjectId(id)) return false;
    await AuthToken.deleteMany({ userId: String(id) });
    return (await User.deleteOne({ _id: id })).deletedCount > 0;
  },

  async findByEmail(email) {
    const user = await User.findOne({ email });
    return user ? toPublic(user) : null;
  },

  async markEmailVerified(id) {
    if (!mongoose.isValidObjectId(id)) return false;
    return (await User.updateOne({ _id: id }, { $set: { emailVerified: true } })).matchedCount > 0;
  },

  async setPassword(id, newPassword) {
    if (!mongoose.isValidObjectId(id)) return false;
    const user = await User.findById(id).select('+password');
    if (!user) return false;
    user.password = newPassword; // the model hashes it before saving
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await AuthToken.deleteMany({ userId: String(id), purpose: 'reset' });
    return true;
  },

  async createAuthToken(userId, purpose, hash, expiresAtMs) {
    await AuthToken.deleteMany({ userId: String(userId), purpose });
    await AuthToken.create({ userId: String(userId), purpose, hash, expiresAt: new Date(expiresAtMs) });
  },

  async peekAuthToken(purpose, hash) {
    const found = await AuthToken.findOne({ purpose, hash, expiresAt: { $gt: new Date() } });
    return found ? found.userId : null;
  },

  async consumeAuthToken(purpose, hash) {
    const found = await AuthToken.findOneAndDelete({ purpose, hash, expiresAt: { $gt: new Date() } });
    return found ? found.userId : null;
  },

  async revokeToken(jti, exp) {
    try {
      await RevokedToken.create({ jti, expiresAt: new Date(exp * 1000) });
    } catch (err) {
      if (err?.code !== 11000) throw err; // already signed out
    }
  },

  async isTokenRevoked(jti) {
    return Boolean(await RevokedToken.exists({ jti }));
  }
};

function createFileStore() {
  const file = path.join(dataDir(), 'users.json');
  let db = null;

  function load() {
    if (db) return db;
    try {
      db = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      db = { users: [] };
    }
    return db;
  }

  function save() {
    writeFileAtomic(file, JSON.stringify(db, null, 2));
  }

  return {
    kind: 'file',

    async create({ name, email, password }) {
      const passwordHash = await hashPassword(password);
      // Everything below is synchronous, so two sign-ups with the same email cannot both get in
      const { users } = load();
      if (users.some(u => u.email === email)) throw new DuplicateEmailError();
      const user = {
        id: randomUUID(),
        name: name.trim(),
        email,
        passwordHash,
        role: 'user',
        emailVerified: false,
        tokenVersion: 0,
        createdAt: new Date().toISOString()
      };
      users.push(user);
      save();
      return toPublic(user);
    },

    async authenticate(email, password) {
      const user = load().users.find(u => u.email === email);
      if (!user) {
        await spendComparison(password);
        return null;
      }
      return (await comparePassword(password, user.passwordHash)) ? toPublic(user) : null;
    },

    async findById(id) {
      const user = load().users.find(u => u.id === id);
      return user ? toPublic(user) : null;
    },

    async deleteUser(id) {
      const data = load();
      const before = data.users.length;
      data.users = data.users.filter(user => user.id !== id);
      if (data.users.length === before) return false;
      data.authTokens = (data.authTokens || []).filter(token => token.userId !== id);
      save();
      return true;
    },

    async findByEmail(email) {
      const user = load().users.find(u => u.email === email);
      return user ? toPublic(user) : null;
    },

    async markEmailVerified(id) {
      const user = load().users.find(u => u.id === id);
      if (!user) return false;
      user.emailVerified = true;
      save();
      return true;
    },

    async setPassword(id, newPassword) {
      // Hashing takes a moment, so it happens before anything is changed. The rest is synchronous.
      const passwordHash = await hashPassword(newPassword);
      const data = load();
      const user = data.users.find(u => u.id === id);
      if (!user) return false;
      user.passwordHash = passwordHash;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      data.authTokens = (data.authTokens || []).filter(token => !(token.userId === id && token.purpose === 'reset'));
      save();
      return true;
    },

    // Link tokens live in the same file as { purpose, hash, userId, expiresAt in ms }. Expired ones
    // are dropped whenever a new one is made.
    async createAuthToken(userId, purpose, hash, expiresAtMs) {
      const data = load();
      const now = Date.now();
      data.authTokens = (data.authTokens || []).filter(token => token.expiresAt > now && !(token.userId === userId && token.purpose === purpose));
      data.authTokens.push({ purpose, hash, userId, expiresAt: expiresAtMs });
      save();
    },

    async peekAuthToken(purpose, hash) {
      const token = (load().authTokens || []).find(t => t.purpose === purpose && t.hash === hash);
      return token && token.expiresAt > Date.now() ? token.userId : null;
    },

    async consumeAuthToken(purpose, hash) {
      const data = load();
      const tokens = data.authTokens || [];
      const index = tokens.findIndex(token => token.purpose === purpose && token.hash === hash);
      if (index === -1) return null;
      const [token] = tokens.splice(index, 1);
      data.authTokens = tokens;
      save();
      return token.expiresAt > Date.now() ? token.userId : null;
    },

    // Signed-out tokens live in the same file as { jti: expiry in ms }. Entries that have
    // expired are dropped on the next sign-out, so the list never grows without bound.
    async revokeToken(jti, exp) {
      const data = load();
      data.revoked ||= {};
      const now = Date.now();
      for (const [id, expiresAt] of Object.entries(data.revoked)) {
        if (expiresAt <= now) delete data.revoked[id];
      }
      data.revoked[jti] = exp * 1000;
      save();
    },

    async isTokenRevoked(jti) {
      return (load().revoked?.[jti] ?? 0) > Date.now();
    }
  };
}

let active = null;

// Decide which store to use. AUTH_STORE=file|mongo forces one; otherwise MongoDB when
// connected, and the local file only outside production.
export function initUserStore({ mongoConnected }) {
  const mode = process.env.AUTH_STORE;
  if (mode === 'file') active = createFileStore();
  else if (mongoConnected) active = mongoStore;
  else if (mode !== 'mongo' && !isProduction()) active = createFileStore();
  else active = null;
  return active;
}

export const getUserStore = () => active;
