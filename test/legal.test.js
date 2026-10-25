// The privacy policy and the terms. Run with: npm test
//
// These are not legal advice and cannot say whether the text is right in law. They check what a
// program can: that the pages are reachable from where people agree to them, that every blank for
// the operator is visible, and that the facts the policy states still match what the code does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-legal-test-'));
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_STORE = 'file';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../app.js');
const { initUserStore } = await import('../util/userStore.js');
const { MAX_CONTEXT_MESSAGES } = await import('../util/assistant.js');
const { RESET_TTL_MS, VERIFY_TTL_MS } = await import('../util/authTokens.js');
const { HELPLINES } = await import('../public/js/chat-logic.js');

const page = file => fs.readFileSync(path.join(publicDir, file), 'utf8');
const visibleText = html => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const privacy = page('privacy.html');
const terms = page('terms.html');

let server;
let base;
before(async () => {
  initUserStore({ mongoConnected: false });
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// --- Reachable ------------------------------------------------------------------------------

test('both pages are served, with the site design and the usual header', async () => {
  for (const file of ['privacy.html', 'terms.html']) {
    const res = await fetch(`${base}/${file}`);
    assert.equal(res.status, 200, file);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /href="\/css\/site\.css"/);
    assert.match(html, /<script src="\/js\/auth\.js"><\/script>/, `${file} shows the account menu like every other page`);
    assert.match(html, /<h1>/);
  }
});

test('the sign-up checkbox links to the real pages, in a new tab so the form is kept', () => {
  const signup = page('signup.html');
  assert.doesNotMatch(signup, /href="#"/, 'no dead link where people agree');
  assert.match(signup, /<a href="\/terms\.html" target="_blank" rel="noopener">Terms<\/a>/);
  assert.match(signup, /<a href="\/privacy\.html" target="_blank" rel="noopener">Privacy Policy<\/a>/);
  assert.match(signup, /<input type="checkbox" id="terms" name="terms" required>/, 'and agreeing is still required');
});

test('the pages with a full footer, and the account page, link to the privacy policy and terms', () => {
  for (const file of ['home.html', 'aboutus.html']) {
    const html = page(file);
    assert.match(html, /<span>&copy; 2026 Sutkeri, your postpartum care companion\. <a href="\/privacy\.html">Privacy<\/a> · <a href="\/terms\.html">Terms<\/a><\/span>/, file);
    assert.doesNotMatch(html, /<li><a href="\/privacy\.html">/, `${file}: the footer's own link list is left as it was`);
  }
  assert.match(page('account.html'), /<a href="\/privacy\.html" class="text-link">Read the privacy policy<\/a>/);
});

test('each of the two pages links to the other, so neither is a dead end', () => {
  assert.match(privacy, /href="\/terms\.html"/);
  assert.match(terms, /href="\/privacy\.html"/);
});

// --- The blanks -----------------------------------------------------------------------------

test('every blank for the operator is a visible, highlighted marker, written the way the launch check looks for it', () => {
  for (const [file, html] of [['privacy.html', privacy], ['terms.html', terms]]) {
    const markers = [...html.matchAll(/<mark class="todo">([\s\S]*?)<\/mark>/g)].map(match => match[1]);
    assert.ok(markers.length > 0 || !/\[\[/.test(html), `${file}: a marker is not inside <mark class="todo">`);
    for (const marker of markers) {
      assert.match(marker, /^\[\[[^\]]+\]\]$/, `${file}: "${marker.slice(0, 50)}" is not written as [[...]] with no ] inside`);
    }
    // No double bracket outside a highlighted marker, where nobody would notice it
    assert.equal((html.match(/\[\[/g) || []).length, markers.length, `${file}: a [[ outside a marker`);
  }
});

test('the blanks that cannot be guessed are there: who runs it, how to reach them, where the data is, the law', () => {
  const needs = {
    'the organisation': /\[\[NAME OF THE ORGANISATION/,
    'a contact address': /\[\[CONTACT EMAIL/,
    'the hosting provider': /\[\[HOSTING PROVIDER\]\]/,
    'the database provider and its region': /\[\[DATABASE PROVIDER/,
    'the email provider': /\[\[EMAIL PROVIDER\]\]/,
    'Anthropic\'s current terms, to be checked': /\[\[ADD A LINK TO ANTHROPIC/,
    'how long backups are kept': /\[\[HOW LONG BACKUPS/,
    'the newsletter box that does nothing': /\[\[NEWSLETTER/,
    'the decision about young people': /\[\[DECIDE AND WRITE/,
    'where information is held abroad': /\[\[SAY WHERE YOUR INFORMATION IS HELD/
  };
  for (const [what, pattern] of Object.entries(needs)) assert.match(privacy, pattern, what);
  assert.match(terms, /\[\[COUNTRY OR REGION\]\]/);
  assert.match(terms, /\[\[HAVE SOMEONE QUALIFIED WRITE THIS SECTION/);
});

// --- What it says matches what the code does ----------------------------------------------------

test('it says how many messages go to the AI provider, and that is how many do', () => {
  assert.match(visibleText(privacy), new RegExp(`up to ${MAX_CONTEXT_MESSAGES}\\b`));
  const client = fs.readFileSync(path.join(publicDir, 'js', 'chatbot-client.js'), 'utf8');
  assert.match(client, new RegExp(`transcript\\.slice\\(-${MAX_CONTEXT_MESSAGES}\\)`), 'the page sends the number the code and the policy agree on');
});

test('it names the AI provider and every outside service the pages really contact', () => {
  const text = visibleText(privacy);
  assert.match(text, /Anthropic, PBC/);
  assert.match(text, /Google Fonts/);

  // Every host a page loads something from is explained. (Links people may click are not loads.)
  const loaded = new Set();
  for (const file of fs.readdirSync(publicDir).filter(name => name.endsWith('.html'))) {
    for (const match of page(file).matchAll(/(?:<link[^>]+href|<script[^>]+src|<img[^>]+src)="(https?:\/\/[^"/]+)/g)) loaded.add(match[1]);
  }
  assert.deepEqual([...loaded].sort(), ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'], 'a new outside service must be added to the privacy policy first');
});

test('it says the site sets no cookies, and the code sets none', () => {
  assert.match(visibleText(privacy), /no cookies/);
  for (const dir of ['routes', 'middleware', 'util']) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(root, dir, file), 'utf8');
      assert.doesNotMatch(source, /\.cookie\(|Set-Cookie|cookie-parser|express-session/i, `${dir}/${file}`);
    }
  }
  const pages = path.join(publicDir, 'js');
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]));
  for (const file of walk(pages).filter(name => name.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /document\.cookie/, path.relative(root, file));
  }
});

test('it says how long email links last, and that is how long they last', () => {
  const text = visibleText(privacy);
  assert.equal(VERIFY_TTL_MS, 2 * 24 * 60 * 60 * 1000);
  assert.equal(RESET_TTL_MS, 60 * 60 * 1000);
  assert.match(text, /after 2 days or 1 hour/);
});

test('the choices it describes are real, with the same words as the page that offers them', () => {
  const text = visibleText(privacy);
  const account = visibleText(page('account.html'));
  assert.match(text, /"Download my data"/);
  assert.match(account, /Download my data/);
  assert.match(text, /Account & privacy/);
  assert.match(account, /Account & privacy/);
  assert.match(text, /History/);
  assert.match(visibleText(page('history.html')), /History/);
  assert.match(account, /Delete my account/);
});

test('the emergency number in both pages is the one the chat gives', () => {
  assert.match(HELPLINES.english, /1166/);
  for (const html of [privacy, terms]) assert.match(visibleText(html), /1166/);
});

test('it says the password is only kept scrambled, and the code uses a one-way hash', () => {
  assert.match(visibleText(privacy), /one-way scrambled form/);
  const store = fs.readFileSync(path.join(root, 'util', 'passwords.js'), 'utf8');
  assert.match(store, /bcrypt\.hash/);
});

test('no page still claims that answers are kept only in the browser: chats are saved to the account', () => {
  for (const file of fs.readdirSync(publicDir).filter(name => name.endsWith('.html'))) {
    assert.doesNotMatch(visibleText(page(file)), /saved only in your own browser|only in your own browser|stored only in your browser/i, file);
  }
  // And what the home page now says is what the policy and the chat say
  assert.match(visibleText(page('home.html')), /Your chats are saved to your account/);
  assert.match(visibleText(privacy), /saved to your account/);
});

test('the terms say plainly that Sutkeri is not medical care and not for emergencies', () => {
  const text = visibleText(terms);
  assert.match(text, /It is not medical care/);
  assert.match(text, /does not diagnose, treat or prevent/);
  assert.match(text, /nobody reads your chat as you write it/);
  assert.match(text, /If you or your baby may be in danger right now/);
});

test('neither page invents anything the app does not do: no selling, no ads, no tracking claims the code contradicts', () => {
  const text = visibleText(privacy);
  assert.match(text, /do not sell your information/);
  // The privacy policy promises no analytics, so none may be in the pages
  for (const file of fs.readdirSync(publicDir).filter(name => name.endsWith('.html'))) {
    assert.doesNotMatch(page(file), /google-analytics|googletagmanager|gtag\(|fbq\(|hotjar|segment\.com|plausible/i, file);
  }
});
