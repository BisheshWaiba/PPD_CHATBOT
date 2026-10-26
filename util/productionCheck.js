import { PRICES } from './assistant.js';

// The checks behind `npm run check:production`: is this configuration safe to put real people on?
//
// runProductionChecks(env, deps) looks at the settings in `env` (never at process.env) and returns
// a list of { level, title, detail }:
//   fail  something that must be fixed before launch
//   warn  something that is probably a mistake, or a risk you are taking on purpose
//   ok    checked and fine
//   info  not something a program can check, but worth reading
//
// Secrets are never put in the output. deps carries what has to be done for real (a connection to
// the database and to the mail server, and the list of sourced health answers with whether each is
// signed), so the checks themselves can be tested without any of them.

const result = (level, title, detail = '') => ({ level, title, detail });
const PLACEHOLDER = /\[\[([^\]]*)\]\]/g;

const text = value => (typeof value === 'string' ? value.trim() : '');
const looksLocal = host => /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(host);

function hostOf(uri) {
  const match = String(uri).match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/);
  return match ? match[1].split(',')[0].replace(/:\d+$/, '') : '';
}

function checkNode(deps, out) {
  const major = Number(String(deps.nodeVersion).split('.')[0]);
  out.push(major >= 22
    ? result('ok', `Node ${deps.nodeVersion}`)
    : result('fail', `Node ${deps.nodeVersion} is too old`, 'This app needs Node 22 or newer. Choose a newer Node version on your host.'));
}

function checkMode(env, out) {
  if (text(env.NODE_ENV) === 'production') return out.push(result('ok', 'NODE_ENV is production'));
  out.push(result('fail', 'NODE_ENV is not "production"',
    'Without it the site runs in development mode: no HSTS header, pages can be framed by other sites, no redirect to HTTPS, and the local user file can be used instead of MongoDB. Set NODE_ENV=production.'));
}

function checkSecrets(env, out) {
  const secret = text(env.JWT_SECRET);
  if (!secret) {
    out.push(result('fail', 'JWT_SECRET is not set', 'It signs every sign-in. The server refuses to start in production without it. Make one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'));
  } else if (secret.length < 32) {
    out.push(result('fail', 'JWT_SECRET is too short', 'Use at least 32 random characters (48 bytes of randomness is better).'));
  } else if (/^(.)\1+$/.test(secret) || /change.?me|your.?secret|example|placeholder|test-secret|password/i.test(secret)) {
    out.push(result('fail', 'JWT_SECRET looks like a placeholder', 'Anyone who guesses it can sign in as anyone. Make a random one.'));
  } else {
    out.push(result('ok', 'JWT_SECRET is set and long enough'));
  }

  const rounds = Number(env.BCRYPT_ROUNDS);
  if (env.BCRYPT_ROUNDS !== undefined && text(env.BCRYPT_ROUNDS) !== '' && !(rounds >= 10)) {
    out.push(result('fail', 'BCRYPT_ROUNDS is set low', 'It is meant for tests only. Passwords hashed with few rounds are cheap to crack if the database leaks. Remove it (the default is 12).'));
  }
}

async function checkDatabase(env, deps, out) {
  const uri = text(env.MONGO_URI);
  if (text(env.AUTH_STORE) === 'file') {
    out.push(result('fail', 'AUTH_STORE=file', 'The local user file is for development. Production refuses to use it. Remove AUTH_STORE.'));
  }
  if (!uri) return out.push(result('fail', 'MONGO_URI is not set', 'Nobody can sign in or register without a database. See MongoDB-Setup-Guide.md.'));
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) return out.push(result('fail', 'MONGO_URI does not look like a MongoDB address', 'It should start with mongodb:// or mongodb+srv://.'));
  if (/<[^>]+>/.test(uri)) return out.push(result('fail', 'MONGO_URI still has the example placeholders in it', 'Replace <username>, <password>, <cluster> and <dbname> with your own.'));

  const host = hostOf(uri);
  if (looksLocal(host)) {
    out.push(result('warn', 'The database is on this same machine', 'That is fine only if you run it, secure it and back it up yourself. A hosted database (MongoDB Atlas) does the backups and updates for you.'));
  } else if (!uri.startsWith('mongodb+srv://') && !/[?&](tls|ssl)=true/i.test(uri)) {
    out.push(result('warn', 'MONGO_URI does not ask for an encrypted connection', 'Add ?tls=true so the data cannot be read on its way to the database.'));
  }

  if (deps.skipNetwork) return out.push(result('info', 'Database connection not tried (--skip-network)'));
  const connection = await deps.connectDatabase(uri);
  out.push(connection.ok
    ? result('ok', 'Connected to the database, and its indexes are in place')
    : result('fail', 'Could not use the database', `${connection.message} Check the address, the password, and that the database allows connections from where this app runs.`));
}

function checkAddress(env, out) {
  const raw = text(env.APP_URL);
  if (!raw) {
    return out.push(result('fail', 'APP_URL is not set', 'It is the public address of the site, for example https://sutkeri.example.com. Links in emails are built from it, and the redirect to HTTPS uses it.'));
  }
  let url;
  try { url = new URL(raw); } catch { url = null; }
  if (!url || !/^https?:$/.test(url.protocol)) return out.push(result('fail', 'APP_URL is not a web address', 'Use the full address, starting with https://.'));
  if (url.protocol !== 'https:') return out.push(result('fail', 'APP_URL is not HTTPS', 'Real people must reach the site over HTTPS, or their sign-ins and chats can be read by anyone on the network. Use https://.'));
  if (looksLocal(url.hostname)) return out.push(result('fail', 'APP_URL points at this machine', 'Use the address people will really type.'));
  out.push(result('ok', `APP_URL is ${url.origin}`));
  if (url.pathname.replace(/\/+$/, '')) out.push(result('warn', 'APP_URL has a path', 'It should be only the address of the site, with nothing after it.'));
}

function checkProxy(env, out) {
  if (text(env.TRUST_PROXY)) return out.push(result('ok', `TRUST_PROXY is set (${text(env.TRUST_PROXY)})`));
  out.push(result('warn', 'TRUST_PROXY is not set',
    'Almost every host puts a proxy in front of the app. Without TRUST_PROXY=true the app sees every visitor as the proxy\'s one address, so the sign-in limits count everybody together: one person guessing passwords would lock everyone out. Set it unless the app really is reached directly.'));
}

async function checkEmail(env, deps, out) {
  const host = text(env.SMTP_HOST);
  const from = text(env.MAIL_FROM);
  if (!host && !from) {
    return out.push(result('warn', 'Email is not set up',
      'Without SMTP_HOST and MAIL_FROM, "forgot password" and email confirmation are switched off, and a mother who forgets her password cannot get back in. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.'));
  }
  if (!host || !from) return out.push(result('fail', 'Email is half set up', 'SMTP_HOST and MAIL_FROM are both needed.'));
  if (!/@/.test(from)) out.push(result('fail', 'MAIL_FROM has no email address in it', 'For example: Sutkeri <no-reply@sutkeri.example.com>'));
  if (deps.skipNetwork) return out.push(result('info', 'Mail server not tried (--skip-network)'));

  const verified = await deps.verifyMail();
  out.push(verified.ok
    ? result('ok', 'Connected to the mail server and logged in (nothing was sent)')
    : result('fail', 'Could not use the mail server', `${verified.message} Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASS.`));
  out.push(result('info', 'Email that reaches the inbox', 'Set up SPF, DKIM and DMARC for the domain in MAIL_FROM at your email provider, and send yourself a reset email from the live site. Mail without them goes to spam, and a reset email in spam is no use.'));
}

function checkOther(env, out) {
  if (text(env.CORS_ORIGIN).split(',').map(value => value.trim()).includes('*')) {
    out.push(result('fail', 'CORS_ORIGIN allows every site', 'The site and its API share one address, so CORS should stay unset. If another site must call the API, list only that site.'));
  }
  if (text(env.ANTHROPIC_BASE_URL)) {
    out.push(result('warn', 'ANTHROPIC_BASE_URL is set', 'It sends the AI conversation somewhere other than Anthropic. It is for tests. Remove it unless you really mean it.'));
  }
}

function checkAssistant(env, out) {
  const key = text(env.ANTHROPIC_API_KEY);
  if (!key) return out.push(result('info', 'The AI conversation is off (no ANTHROPIC_API_KEY)', 'Open conversation uses the fixed, reviewed replies. Nothing is sent to an AI provider.'));

  if (!key.startsWith('sk-ant-')) out.push(result('warn', 'ANTHROPIC_API_KEY does not look like an Anthropic key', 'Keys start with sk-ant-. Check that the whole key was copied from the Anthropic console, with nothing added.'));
  const budget = Number(env.ASSISTANT_DAILY_BUDGET_USD);
  if (budget > 0) {
    out.push(result('ok', `The AI has a daily budget of $${budget}`, 'Once it is used up the AI switches off until midnight UTC and the chat uses its fixed replies.'));
  } else {
    out.push(result('warn', 'The AI has no daily budget', 'Set ASSISTANT_DAILY_BUDGET_USD (for example 5). Without it, the only ceiling is each person\'s own allowance, which does not stop many people (or many accounts) adding up.'));
  }
  const model = text(env.ASSISTANT_MODEL);
  if (model && !(model in PRICES)) {
    out.push(result('warn', `ASSISTANT_MODEL "${model}" has no price in this app`, 'The daily budget will count it at the dearest price it knows, so it may stop the AI earlier than needed.'));
  }
  out.push(result('info', 'Set a spend limit in the Anthropic console too', 'The budget above lives inside this app. The limit in the Anthropic console is the one that holds even if this app has a bug or is run twice. This cannot be checked from here.'));
}

function checkPolicies(deps, out) {
  const problems = [];
  for (const [file, label] of [['privacy.html', 'the privacy policy'], ['terms.html', 'the terms']]) {
    const page = deps.readPublicPage(file);
    if (page === null) { problems.push(`${label[0].toUpperCase()}${label.slice(1)} (public/${file}) is missing`); continue; }
    const markers = [...page.matchAll(PLACEHOLDER)].map(match => match[1].trim());
    if (markers.length) problems.push(`${label[0].toUpperCase()}${label.slice(1)} (public/${file}) still has ${markers.length} unfilled marker${markers.length === 1 ? '' : 's'}, such as: ${markers.slice(0, 3).map(marker => `"${marker.slice(0, 50)}"`).join(', ')}`);
  }
  out.push(problems.length
    ? result('fail', 'The privacy policy and terms are not finished', `${problems.join('. ')}. Fill in every [[...]] in public/privacy.html and public/terms.html, and have someone qualified read them before you launch.`)
    : result('ok', 'The privacy policy and terms have no unfilled markers'));
}

// The sourced answers to health questions (public/js/knowledge.js) are drafts until a clinician has
// read each against its source and signed it. A mother who asks a health question is shown them, so
// the launch check refuses to pass while any is unsigned. deps.knowledgeEntries: [{ id, signed }].
function checkKnowledge(deps, out) {
  const entries = deps.knowledgeEntries;
  if (!Array.isArray(entries)) return;
  const unsigned = entries.filter(entry => !entry.signed);
  out.push(unsigned.length
    ? result('fail', `${unsigned.length} of ${entries.length} sourced health answers have not been reviewed by a clinician`,
      `They are drafts, written from NHS and WHO pages by people who are not clinicians, and any mother who asks a health question is shown them. Have a clinician read each against its source (npm run review:pack makes the pack, section 8 is for this), then in public/js/knowledge.js set its status to "reviewed" and fill in reviewedBy and reviewedOn. Not yet signed: ${unsigned.map(entry => entry.id).join(', ')}.`)
    : result('ok', `All ${entries.length} sourced health answers have been signed by a clinician`));
  out.push(result('info', 'The sourced health answers are in English only', 'A mother who writes in Nepali is shown the English answer. A Nepali speaker has to write and check the Nepali before it can be offered.'));
}

function checkNotes(env, out) {
  const days = Number(env.CHAT_HISTORY_DAYS);
  out.push(days > 0
    ? result('info', `Chats are deleted ${days} day${days === 1 ? '' : 's'} after their last message`, 'Make sure the privacy policy says the same.')
    : result('info', 'Chats are kept until their owner deletes them', 'That is the default. Make sure the privacy policy says so, or set CHAT_HISTORY_DAYS.'));
  out.push(result('info', 'Run exactly one copy of the app',
    'Sign-in limits, the AI allowances and the daily AI budget are kept in the memory of one process. With two copies each has its own count, so every limit doubles. See docs/DEPLOYMENT.md before you scale.'));
}

export async function runProductionChecks(env, deps) {
  const out = [];
  checkNode(deps, out);
  checkMode(env, out);
  checkSecrets(env, out);
  await checkDatabase(env, deps, out);
  checkAddress(env, out);
  checkProxy(env, out);
  await checkEmail(env, deps, out);
  checkOther(env, out);
  checkAssistant(env, out);
  checkPolicies(deps, out);
  checkKnowledge(deps, out);
  checkNotes(env, out);
  return out;
}

export const countByLevel = results => results.reduce((counts, item) => ({ ...counts, [item.level]: (counts[item.level] || 0) + 1 }), { fail: 0, warn: 0, ok: 0, info: 0 });
