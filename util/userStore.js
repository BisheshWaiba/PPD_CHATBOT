import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import RevokedToken from '../models/RevokedToken.js';
import { hashPassword, comparePassword } from './passwords.js';
import { dataDir, isProduction } from './paths.js';

// Where users live. Both stores expose the same calls and never return a password.
//   create({ name, email, password })  -> user, throws DuplicateEmailError
//   authenticate(email, password)      -> user or null
//   findById(id)                       -> user or null
//   revokeToken(jti, exp)              -> remembers a signed-out token until exp (seconds)
//   isTokenRevoked(jti)                -> true while that token must be refused
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

const toPublic = user => ({
  id: String(user.id ?? user._id),
  name: user.name,
  email: user.email,
  role: user.role || 'user',
  createdAt: user.createdAt
});

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
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
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
