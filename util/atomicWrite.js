import fs from 'fs';
import path from 'path';

// Replaces a file's contents in one step: the new contents are written to a temporary file next to
// it, which then takes the old file's place. A crash or a power cut in the middle leaves either the
// old file or the new one, never half of each.
//
// On Windows, replacing a file can fail for a moment with EPERM, EBUSY or EACCES when another
// program has it open: OneDrive syncing a folder, antivirus scanning it, the search indexer. The
// program lets go within a few milliseconds, so the replace is tried again a few times, with a short
// wait between, before giving up. Only these errors are retried; anything else is a real problem.
//
// It waits without freeing the event loop (it is used by the synchronous development file stores),
// for at most about a second in total.
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function writeFileAtomic(file, data, { retries = 8 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  // Private to the owner of the file: these hold accounts and chats
  fs.writeFileSync(tmp, data, { mode: 0o600 });

  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      if (!TRANSIENT.has(error.code) || attempt >= retries) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean up */ }
        throw error;
      }
      pause(Math.min(20 * 2 ** attempt, 200));
    }
  }
}
