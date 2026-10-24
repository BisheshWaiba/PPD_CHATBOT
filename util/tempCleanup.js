import fs from 'fs';
import path from 'path';

// The chatbot leaves a state file per conversation and a message file per request in temp/.
// Nothing else removes them, so a conversation counts as finished once none of its files has
// been touched for this long (the chatbot rewrites the state file on every message).
export const CHAT_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

// Only the chatbot's own files: anything else in the folder is left alone
const CHAT_FILE = /^(state|message)_.+\.(json|txt)$/;

// Deletes chat files older than maxAgeMs and returns how many it removed
export function removeOldChatFiles(dir, { maxAgeMs = CHAT_FILE_MAX_AGE_MS, now = Date.now() } = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const name of names) {
    if (!CHAT_FILE.test(name)) continue;
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) {
        fs.rmSync(file);
        removed += 1;
      }
    } catch {
      // Already gone, or in use by a running chatbot: the next sweep tries again
    }
  }
  return removed;
}

// Sweeps now and then every hour for as long as the server runs
export function startChatCleanup(dir) {
  const sweep = () => {
    const removed = removeOldChatFiles(dir);
    if (removed) console.log(`Removed ${removed} old chat file${removed === 1 ? '' : 's'} from ${dir}`);
  };
  sweep();
  setInterval(sweep, SWEEP_EVERY_MS).unref();
}
