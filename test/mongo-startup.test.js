// Connecting to MongoDB at start-up. Run with: npm test
//
// The tests about a database that cannot be reached run everywhere. The ones that need a real
// MongoDB are skipped unless TEST_MONGO_URI is set (see test/support/mongo.js for how the test
// databases are named and cleaned up).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
const useMongo = Boolean(process.env.TEST_MONGO_URI);
const needsMongo = { skip: !useMongo && 'set TEST_MONGO_URI to run this against a real MongoDB' };
const DB = 'sutkeri_test_startup';

const { default: connectDB } = await import('../config/db.js');
// The models are registered by the stores, so import them as the real server does
await import('../util/userStore.js');
await import('../util/historyStore.js');

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (useMongo) {
    const cleanup = await mongoose.createConnection(process.env.TEST_MONGO_URI, { dbName: DB }).asPromise();
    await cleanup.dropDatabase();
    await cleanup.close();
  }
});

// Runs fn while capturing what the server would print
async function captured(fn) {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args) => lines.push(args.join(' '));
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, original);
  }
}

test('no MONGO_URI: says so and reports no database', async () => {
  const { result, lines } = await captured(() => connectDB(''));
  assert.equal(result, false);
  assert.match(lines.join('\n'), /MONGO_URI is not set/);
});

test('a database that cannot be reached: reports no database, explains, and does not hang', async () => {
  const started = Date.now();
  const { result, lines } = await captured(() => connectDB('mongodb://127.0.0.1:1/none', { serverSelectionTimeoutMS: 400 }));
  assert.equal(result, false);
  assert.match(lines.join('\n'), /MongoDB connection failed/);
  assert.match(lines.join('\n'), /IP address is allowed in MongoDB Atlas/);
  assert.ok(Date.now() - started < 5000);
});

test('a reachable database: connects, and every index is already built when it returns', needsMongo, async () => {
  const { result } = await captured(() => connectDB(process.env.TEST_MONGO_URI, { dbName: DB }));
  assert.equal(result, true);

  const indexes = async model => (await mongoose.model(model).collection.indexes());
  const users = await indexes('User');
  assert.ok(users.some(i => i.key.email === 1 && i.unique), 'unique email');
  const links = await indexes('AuthToken');
  assert.ok(links.some(i => i.key.hash === 1 && i.unique), 'unique link hash');
  assert.ok(links.some(i => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), 'links expire by themselves');
  const signedOut = await indexes('RevokedToken');
  assert.ok(signedOut.some(i => i.key.jti === 1 && i.unique), 'unique sign-out id');
  assert.ok(signedOut.some(i => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), 'sign-outs expire by themselves');
  const chats = await indexes('Conversation');
  assert.ok(chats.some(i => i.key.userId === 1 && i.key.updatedAt === -1), 'chats listed by owner, newest first');

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('two accounts with one address already stored: the database is refused, loudly, and left disconnected', needsMongo, async () => {
  // Put the duplicates in before the app has ever used this database, so no unique index exists yet
  const seed = await mongoose.createConnection(process.env.TEST_MONGO_URI, { dbName: DB }).asPromise();
  await seed.dropDatabase();
  await seed.collection('users').insertMany([
    { name: 'First', email: 'same@example.com', password: 'x', role: 'user' },
    { name: 'Second', email: 'same@example.com', password: 'x', role: 'user' }
  ]);
  await seed.close();

  const { result, lines } = await captured(() => connectDB(process.env.TEST_MONGO_URI, { dbName: DB }));
  assert.equal(result, false, 'a database that cannot enforce unique emails must not be used');
  const printed = lines.join('\n');
  assert.match(printed, /index could not be built/);
  assert.match(printed, /duplicate key/i);
  assert.match(printed, /NOT being used/);
  assert.equal(mongoose.connection.readyState, 0, 'and it is not left connected');
});
