// How the chatbot is started and tidied up: the Python command, start-up cost and old files.
// Run with: npm test
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { pythonCommand, pythonAvailable } from '../util/python.js';
import { removeOldChatFiles, CHAT_FILE_MAX_AGE_MS } from '../util/tempCleanup.js';
import { tempDir } from '../util/paths.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const needsPython = { skip: !pythonAvailable() && 'python is not available' };

const originalPython = process.env.PYTHON;
afterEach(() => {
  if (originalPython === undefined) delete process.env.PYTHON;
  else process.env.PYTHON = originalPython;
});

test('python command: PYTHON in the environment wins', () => {
  process.env.PYTHON = 'C:\\tools\\python312\\python.exe';
  assert.equal(pythonCommand(), 'C:\\tools\\python312\\python.exe');
});

test('python command: defaults to python on Windows and python3 elsewhere', () => {
  delete process.env.PYTHON;
  assert.equal(pythonCommand(), process.platform === 'win32' ? 'python' : 'python3');
});

test('python check: a command that does not exist is reported as unavailable', () => {
  process.env.PYTHON = 'no-such-python-command';
  assert.equal(pythonAvailable(), false);
});

test('the chatbot does not load the requests library, which cost half a second per message', needsPython, () => {
  const key = `importcheck-${process.pid}`;
  try {
    const run = spawnSync(
      pythonCommand(),
      ['-X', 'importtime', path.join(root, 'chatbot', 'chatbot.py'), '--first-run', '--user', key],
      { encoding: 'utf8' }
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Sutkeri/); // it still greets
    const imported = run.stderr.split('\n').filter(line => line.startsWith('import time:'));
    assert.ok(imported.length > 10, 'import timing was not captured');
    assert.equal(imported.some(line => /\|\s+requests\s*$/.test(line)), false);
  } finally {
    fs.rmSync(path.join(tempDir(), `state_${key}.json`), { force: true });
  }
});

// A folder with chat files of known ages, plus a file that is not the chatbot's
function folderWithFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-cleanup-test-'));
  const now = Date.now();
  const hours = h => h * 60 * 60 * 1000;
  const files = {
    'state_old.json': hours(25),
    'message_old.txt': hours(25),
    'state_recent.json': hours(23),
    'state_new.json': 0,
    'notes.txt': hours(48),
    'state_.json': hours(48) // no session id: not a chat file
  };
  for (const [name, age] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '{}');
    const when = new Date(now - age);
    fs.utimesSync(file, when, when);
  }
  return { dir, now };
}

test('cleanup: removes chat files idle for more than a day and keeps the rest', () => {
  const { dir, now } = folderWithFiles();
  try {
    assert.equal(CHAT_FILE_MAX_AGE_MS, 24 * 60 * 60 * 1000);
    assert.equal(removeOldChatFiles(dir, { now }), 2);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['notes.txt', 'state_.json', 'state_new.json', 'state_recent.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanup: the age limit can be changed', () => {
  const { dir, now } = folderWithFiles();
  try {
    assert.equal(removeOldChatFiles(dir, { now, maxAgeMs: 60 * 60 * 1000 }), 3);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['notes.txt', 'state_.json', 'state_new.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanup: a folder that does not exist is not an error', () => {
  assert.equal(removeOldChatFiles(path.join(os.tmpdir(), 'mom-no-such-folder-' + process.pid)), 0);
});
