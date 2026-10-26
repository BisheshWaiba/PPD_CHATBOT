// Is this configuration safe to put real people on?   npm run check:production
//
//   npm run check:production                       checks the settings this app would start with now
//                                                  (the environment, plus .env)
//   npm run check:production -- --env path/to/file checks the settings in that file instead, for
//                                                  example a copy of your production settings. Keep
//                                                  such a file out of git.
//   --skip-network                                 do not connect to the database or the mail server
//
// It connects to the database and logs in to the mail server (nothing is written or sent), and
// lists what must be fixed, what is risky, and what is fine. It never prints a secret.
// Exit code 1 when something must be fixed.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import { verifyMailServer } from '../util/mailer.js';
import { runProductionChecks, countByLevel } from '../util/productionCheck.js';
import { ENTRIES, isSignedOff } from '../public/js/knowledge.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipNetwork = args.includes('--skip-network');
const envIndex = args.indexOf('--env');

async function main() {
  let env = process.env;
  if (envIndex >= 0) {
    const file = args[envIndex + 1];
    if (!file || !fs.existsSync(file)) {
      console.error(`Cannot find the settings file${file ? ` "${file}"` : ''}. Use: npm run check:production -- --env path/to/file`);
      return 1;
    }
    env = dotenv.parse(fs.readFileSync(file));
    // The database and mail connections below read their settings from the environment
    Object.assign(process.env, env);
    console.log(`Checking the settings in ${file}\n`);
  }

  // Quiet while connecting: the connection code prints its own messages
  async function quietly(work) {
    const original = { log: console.log, warn: console.warn, error: console.error };
    const lines = [];
    console.log = console.warn = console.error = (...parts) => lines.push(parts.join(' '));
    try { return { value: await work(), lines }; } finally { Object.assign(console, original); }
  }

  const deps = {
    nodeVersion: process.versions.node,
    skipNetwork,
    knowledgeEntries: ENTRIES.map(entry => ({ id: entry.id, signed: isSignedOff(entry) })),
    readPublicPage: file => {
      try { return fs.readFileSync(path.join(root, 'public', file), 'utf8'); } catch { return null; }
    },
    connectDatabase: async uri => {
      const { value: connected, lines } = await quietly(() => connectDB(uri, { serverSelectionTimeoutMS: 8000 }));
      await mongoose.disconnect().catch(() => {});
      // The connection code's own words, which say what went wrong and never contain the password
      const reason = lines.filter(line => /fail|index|error/i.test(line)).join(' ').replace(/mongodb(\+srv)?:\/\/\S+/gi, '[address]');
      return { ok: connected, message: reason };
    },
    verifyMail: async () => {
      try {
        await verifyMailServer();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: `${error.code || error.name}${error.responseCode ? ` ${error.responseCode}` : ''}.` };
      }
    }
  };

  const results = await runProductionChecks(env, deps);
  const label = { fail: 'FIX   ', warn: 'RISK  ', ok: 'ok    ', info: 'note  ' };
  for (const item of results) {
    console.log(`${label[item.level]} ${item.title}`);
    if (item.detail && item.level !== 'ok') console.log(`       ${item.detail}`);
  }

  const counts = countByLevel(results);
  console.log(`\n${counts.fail} to fix, ${counts.warn} risk${counts.warn === 1 ? '' : 's'}, ${counts.ok} fine.`);
  console.log(counts.fail ? 'Not ready to launch.' : counts.warn ? 'Nothing blocks a launch, but read the risks above.' : 'Ready, as far as a program can tell. Read the notes, and see docs/DEPLOYMENT.md.');
  return counts.fail ? 1 : 0;
}

process.exitCode = await main();
