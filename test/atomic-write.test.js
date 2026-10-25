// Writing the development files safely, even when Windows briefly refuses. Run with: npm test
//
// OneDrive, antivirus and the search indexer can hold a file open for a moment, which makes
// replacing it fail with EPERM, EBUSY or EACCES. That used to turn a chat save into a 500.
import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-atomic-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_DATA_DIR = workDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';

const { writeFileAtomic } = await import('../util/atomicWrite.js');
const { initUserStore, getUserStore } = await import('../util/userStore.js');
const { getHistoryStore } = await import('../util/historyStore.js');

after(() => fs.rmSync(workDir, { recursive: true, force: true }));

const realRename = fs.renameSync;
const refuse = (code, times, target) => {
  let refused = 0;
  const calls = [];
  const spy = mock.method(fs, 'renameSync', (from, to) => {
    calls.push(String(to));
    if ((!target || String(to).endsWith(target)) && refused < times) {
      refused += 1;
      throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
    }
    return realRename(from, to);
  });
  return { calls, restore: () => spy.mock.restore(), refusedCount: () => refused };
};
const fresh = name => path.join(workDir, `${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);

test('it writes the file, replaces an old one in one step, and leaves no temporary file behind', () => {
  const file = fresh('a.json');
  writeFileAtomic(file, '{"first":true}');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"first":true}');
  writeFileAtomic(file, '{"second":true}');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"second":true}');
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('it makes the folder if it is not there yet', () => {
  const file = path.join(fresh('folder'), 'deeper', 'b.json');
  writeFileAtomic(file, 'x');
  assert.equal(fs.readFileSync(file, 'utf8'), 'x');
});

test('the file is private to its owner (where the system has such a thing)', { skip: process.platform === 'win32' && 'Windows has no Unix permission bits' }, () => {
  const file = fresh('private.json');
  writeFileAtomic(file, 'secret');
  assert.equal(fs.statSync(file).mode & 0o077, 0, 'nobody else may read it');
});

for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
  test(`a ${code} while replacing is tried again, and the write goes through`, () => {
    const file = fresh('c.json');
    writeFileAtomic(file, 'old');
    const refusing = refuse(code, 3);
    try {
      writeFileAtomic(file, 'new');
      assert.equal(refusing.refusedCount(), 3);
      assert.equal(refusing.calls.length, 4, 'three refusals, then it worked');
    } finally {
      refusing.restore();
    }
    assert.equal(fs.readFileSync(file, 'utf8'), 'new');
    assert.equal(fs.existsSync(`${file}.tmp`), false);
  });
}

test('if the file stays locked it gives up after the tries, says so, cleans up, and the old file is untouched', () => {
  const file = fresh('d.json');
  writeFileAtomic(file, 'precious');
  const refusing = refuse('EPERM', 99);
  try {
    const started = Date.now();
    assert.throws(() => writeFileAtomic(file, 'new', { retries: 3 }), error => error.code === 'EPERM');
    assert.equal(refusing.calls.length, 4, 'the first try and three more');
    assert.ok(Date.now() - started < 1500, 'it does not wait for long');
  } finally {
    refusing.restore();
  }
  assert.equal(fs.readFileSync(file, 'utf8'), 'precious');
  assert.equal(fs.existsSync(`${file}.tmp`), false, 'no half-written file is left');
});

test('any other error is a real problem: not retried, and it is passed on', () => {
  for (const code of ['ENOSPC', 'EXDEV', 'ENOENT', 'EIO']) {
    const file = fresh('e.json');
    const refusing = refuse(code, 99);
    try {
      assert.throws(() => writeFileAtomic(file, 'x'), error => error.code === code, code);
      assert.equal(refusing.calls.length, 1, `${code} must not be retried`);
    } finally {
      refusing.restore();
    }
    assert.equal(fs.existsSync(`${file}.tmp`), false);
  }
});

// --- What it fixes: the stores that write the user's files ----------------------------------

test('a sign-up still works when the users file is locked for a moment (it used to be a 500)', async () => {
  initUserStore({ mongoConnected: false });
  const refusing = refuse('EPERM', 2, 'users.json');
  try {
    const user = await getUserStore().create({ name: 'Mina Rai', email: `atomic-${Date.now()}@example.com`, password: 'correct horse battery' });
    assert.ok(user.id);
    assert.equal(refusing.refusedCount(), 2);
    assert.equal((await getUserStore().findById(user.id)).name, 'Mina Rai');
  } finally {
    refusing.restore();
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(workDir, 'users.json'), 'utf8')).users.length >= 1, true, 'and it reached the file');
});

test('saving a chat still works when the history file is locked for a moment (it used to be a 500)', async () => {
  initUserStore({ mongoConnected: false });
  const owner = `owner-${Date.now()}`;
  const history = getHistoryStore();
  const chat = await history.create(owner);

  const refusing = refuse('EBUSY', 2, 'history.json');
  try {
    await history.append(owner, chat.id, [{ role: 'user', text: 'I feel tired' }, { role: 'bot', text: 'Tell me more' }]);
    assert.equal(refusing.refusedCount(), 2);
  } finally {
    refusing.restore();
  }
  const saved = await history.get(owner, chat.id);
  assert.deepEqual(saved.messages.map(message => message.text), ['I feel tired', 'Tell me more']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(workDir, 'history.json'), 'utf8')).chats.some(item => item.id === chat.id), true);
});
