# Sutkeri: Postpartum Care Platform

[![Tests](https://github.com/BisheshWaiba/PPD_CHATBOT/actions/workflows/test.yml/badge.svg)](https://github.com/BisheshWaiba/PPD_CHATBOT/actions/workflows/test.yml)

An Express.js app with JWT authentication, MongoDB, and a postpartum support chat that runs in the browser.

## Features

- Account registration and sign-in (bcrypt-hashed passwords, JWT sessions)
- Protected pages (the assistant, saved chats and the results report) and protected chat-history and account APIs
- Sign-in rate limiting, security headers, and no secrets in the source code
- MongoDB with Mongoose, plus a local development fallback when MongoDB is unavailable

## Prerequisites

- Node.js 22 or higher (the tests run on 22 and 24; `npm test` needs at least Node 21)
- A MongoDB database (Atlas or local). See `MongoDB-Setup-Guide.md`.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill it in (never commit `.env`):
```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=            # required in production, 32+ random characters
JWT_EXPIRE=7d
PORT=8004
```

3. Start the server:
```bash
npm run dev      # restarts on changes
npm start        # plain start
```

Open http://localhost:8004. If MongoDB is not reachable in development, accounts are kept in
`data/users.json` instead and the server says so on start-up.

## Authentication

- **Passwords:** 8 to 72 bytes, hashed with bcrypt. Never stored or returned in plain text.
- **Sessions:** the server signs a JWT (`JWT_EXPIRE`, default 7 days). The browser keeps it in
  `localStorage` when "Remember me" is ticked and in `sessionStorage` otherwise. Logging out
  clears it, together with the check-in answers the chat saved in the browser, and tells the
  server to end that token, so a copy of it stops working at once. Only that sign-in ends: the
  same account's other devices stay signed in. Ended tokens are remembered in the user store
  until they would have expired anyway (so they survive a restart).
- **Content-Security-Policy:** every response carries one. Scripts may only come from this
  site and never inline, so put page code in a file under `public/js/` (see `public/js/pages/`)
  and not in a `<script>` block or an `onclick=""` attribute: the browser will refuse it.
  Inline styles and Google Fonts are allowed. In production the pages also refuse to be framed.
- **Protected pages:** put `data-require-auth` on `<body>` and include `/js/auth.js`. The page
  stays hidden until the server confirms the session, then redirects to
  `/login.html?next=<page>` if it is not valid.
- **Rate limits:** 8 failed sign-ins per account and 40 per IP in 15 minutes; 10 registrations
  per IP per hour. Set `TRUST_PROXY=true` behind a reverse proxy so the real IP is used.
- **Forgotten passwords and email confirmation:** see below.

### Forgotten passwords and email confirmation

New accounts are sent a link to confirm their email address (Account page → "Send me a
confirmation email" sends it again). **Only a confirmed address can get a password-reset link**:
if a typo at sign-up (`mina@exmaple.com`) could receive one, a stranger who owns that address
could take the account over. Accounts made before this existed start as "not confirmed", so
those people confirm their address once from the Account page.

How it is kept safe:

- A link holds 32 random bytes and works once. A reset link lasts 1 hour, a confirmation link
  2 days. Only a SHA-256 hash of a link is stored, so a copy of the database holds no usable link.
  Asking again replaces the earlier link.
- `POST /auth/forgot-password` answers the same way for an unknown address, an unconfirmed one
  and a confirmed one, and counts every request (3 per address and 10 per visitor per hour), so it
  cannot be used to find out who has an account or to fill someone's inbox.
- Links are built from `APP_URL` and **never** from the request's `Host` header, so a forged header
  cannot point a link at someone else's site.
- A new password that is too weak is refused **without** using up the link. A good one ends every
  sign-in made before (every device), and the person gets a "your password was changed" email.
- The pages remove the secret from the address bar as soon as they load, and ask browsers not to
  send it on to other sites (`Referrer-Policy`).
- Sending runs in the background. A broken mail server never fails or slows a request, and the log
  line it leaves holds neither the address nor the link.

Email goes out through any provider that offers SMTP (Gmail, Brevo, Resend, SendGrid, Mailtrap,
your own server). Set these in `.env`:

```
APP_URL=https://sutkeri.example.com     # the public address of the site
SMTP_HOST=smtp.example.com
SMTP_PORT=587                           # 465 with SMTP_SECURE=true
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=Sutkeri <no-reply@sutkeri.example.com>
```

On your own computer you need none of this: without `SMTP_HOST`, each email is printed in the
server console, with its link, so the whole flow can be tried. **In production without these
settings the features switch themselves off** (the pages say so) instead of failing quietly.

### API

Use the `/api/v1` paths below. The older unversioned paths (`/api/auth/login` and so on) still
work and are the same API with the same rate limits.

Every answer is JSON. A failure is always `{ "success": false, "message": "..." }` with a real
status code, so `response.ok` is enough to tell them apart. A success carries `"success": true`.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | `{ name, email, password }`. 201, 400 invalid, 409 email taken |
| POST | `/api/v1/auth/login` | Public | `{ email, password }`. 200 with `token` and `user`, 401 for a wrong email or password |
| POST | `/api/v1/auth/logout` | Bearer token | Ends this token at once. 200, or 401 if it is already invalid or signed out |
| GET | `/api/v1/auth/me` | Bearer token | The signed-in user. 401 if the token is missing, expired, invalid, signed out, or from before a password change |
| GET | `/api/v1/auth/features` | Public | `{ data: { email } }`: whether this server can send email (so pages can hide what depends on it) |
| POST | `/api/v1/auth/forgot-password` | Public | `{ email }`. The same 200 whether or not the address has a (confirmed) account. 400 for a malformed address, 429 past the limits, 503 when the server has no email |
| POST | `/api/v1/auth/check-reset-link` | Public | `{ token }`. 200 if the link can still be used, 400 if not. Does not use it up. The reset page calls it on load, so a used or expired link is explained before anyone types a password |
| POST | `/api/v1/auth/reset-password` | Public | `{ token, password }` from the emailed link. 200, or 400 with one message for every way a link can be bad (expired, used, made up) and for a weak password (the link is kept) |
| POST | `/api/v1/auth/verify-email` | Public | `{ token }` from the emailed link. 200 or 400. Opening the page does not confirm anything; the page asks for a click |
| POST | `/api/v1/auth/resend-verification` | Bearer token | Sends the confirmation email again. 3 per hour, 503 when the server has no email |
An address that is not a page or an API path is a real 404 (a page for browsers, JSON under `/api`).

Saved chats (all need a bearer token, and each account only ever reaches its own: a chat that is
not yours is a 404, exactly like one that does not exist):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/conversations` | Your saved chats, most recently active first: `{ id, startedAt, updatedAt, messageCount, preview }` |
| POST | `/api/v1/conversations` | Starts a saved chat. 201 with its summary. 409 at 500 saved chats |
| GET | `/api/v1/conversations/:id` | One chat with all its messages: `{ role: "user" \| "bot", text, at }` |
| POST | `/api/v1/conversations/:id/messages` | `{ messages: [{ role, text }] }`, up to 20 at a time, 4000 characters each. 409 once a chat holds 500 messages |
| DELETE | `/api/v1/conversations/:id` | Deletes one chat |
| DELETE | `/api/v1/conversations` | Deletes all of your chats |

Your account and your data (bearer token):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/account/export` | Everything stored about you, as one downloadable JSON file: your details and the full text of every chat. The answer is the file itself, not wrapped in `{ success, data }`. No password or hash is in it |
| DELETE | `/api/v1/account` | `{ password }`. Deletes the account and every saved chat, and every sign-in stops working at once. 400 without a password, **403** for a wrong one (not 401, so the page does not sign you out for a typo), 429 after 5 wrong passwords in 15 minutes |

```bash
curl -X POST http://localhost:8004/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"a-long-password"}'

curl http://localhost:8004/api/v1/auth/me -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Front end

- **Design:** `public/css/site.css` (colours, type, header, footer) plus `public/css/auth.css` for
  the sign-in and sign-up pages. These are the only stylesheets; every page uses `site.css`.
- **Page code:** `public/js/auth.js` is shared; each page's own code is in `public/js/pages/`
  (inline scripts are blocked by the Content-Security-Policy). The chat runs in the browser:
  `public/js/chat-logic.js` holds the wording and scoring, `public/js/chatbot-client.js` the
  conversation.
- **Chat history:** while signed in, every chat is saved to the account, and the History page
  (`/history.html`, reached from the account menu or the History button in the chat) lists them,
  shows any of them as a conversation, and deletes one or all of them (each asks for a second click).
  The chat page says so in its welcome message. Chats are saved in the background and chatting never
  waits for it: if saving fails, the messages are sent again with the next ones. Typing "new" or
  pressing New check-in starts a new saved chat, and a chat is named after the first thing that was
  said that says something, not "Continue". What is saved is the text of the conversation, kept in
  `data/history.json` (git-ignored) or in MongoDB, and only the signed-in owner can read or delete it.
  Chat history is separate from logging out, which clears the browser's copy but keeps the saved chats.
- **Account & privacy:** `/account.html` (account menu, or the link on the History page) shows what is
  kept about you, downloads all of it as a file, and deletes the account. Deleting asks for the
  password again and then for a second click, removes the account and every saved chat for good,
  signs you out and clears this browser's copy of the check-in. Set `CHAT_HISTORY_DAYS` to also
  delete each chat that many days after its last message (off by default; the History and Account
  pages say so when it is on).
- **Chat answers:** every numbered question is also offered as tappable buttons (a tap does exactly
  what typing the number does), and if something goes wrong the chat says so with a "Try again"
  button.
- **Accessibility:** every focusable element shows a visible focus ring (light on the dark footer
  and the berry call-to-action), and text meets 4.5:1 contrast. `test/design-tokens.test.js` checks
  the colour pairs, so changing a token that breaks contrast fails the tests.
- **Old design:** screenshots of the earlier pink "MOM" design are in `docs/old-ui-screenshots/`.
  They are reference only and are not served.

## Answers to health questions (sourced)

A mother can type a question about postnatal depression, the baby blues, the first weeks with a
newborn, breastfeeding or what happens at the postnatal checkups, and the chat answers it. These
answers need no AI and no API key. Each one was written in advance from named sources (the NHS,
the World Health Organization, a 2016 study of the Nepali Edinburgh scale in Kathmandu), is shown
with links to them and a reminder that it is general information, and sends her to a health worker
for anything about her own situation. Nothing is made up at the moment she asks.

- **Where they are:** `public/js/knowledge.js` holds the sources, the answers and the code that
  finds the right one. A question is matched to an answer by its main words (spelling, plurals and
  "postpartum"/"postnatal" are treated alike); an answer is shown only when one answer clearly
  fits. A question that is unclear, about something near but not written yet (causes, diet,
  medicines, caesareans, a lost baby), or only a few common words, gets no answer and falls back to
  the usual reply (or the AI, when it is on).
- **What never gets one:** a crisis message, a physical warning sign, a baby who may be in danger
  (not breathing, turning blue, a seizure: a separate fixed emergency reply), a medicine question,
  the helplines, the menu, and "take the check-in". They keep their own replies.
- **Draft until signed:** every answer is a draft until a clinician has read it against its source
  and signed it (`status`, `reviewedBy`, `reviewedOn`). `npm run check:production` fails until
  they all are. See `docs/DEPLOYMENT.md` ("The sourced health answers") and section 8 of the review
  pack. The pack also lists the open questions this raised: for example, the study found the best
  cut-off for the Nepali scale was 12/13, while the check-in treats 10 or more as "Possible
  depression", and the older information text says "about 1 in 7 births" while WHO says almost 1
  in 5 women have a mental health condition in pregnancy or the year after.
- **Adding or changing one:** add an entry with its `sources`, example `aliases` and `keywords`, and
  add questions for it to `util/knowledgeEval.js` (including a few that must *not* find it). The
  tests check that every answer names real sources on an allowed site, that no figure changes
  without a test being changed, that nothing belongs to another country (no UK phone numbers), that
  there is no medicine advice and no diagnosis, and that each question in the set finds exactly the
  answer it should and no more. Run `node --test test/knowledge.test.js`.

## AI conversation (optional)

Out of the box the chat answers with fixed, reviewed replies. Add an Anthropic API key and the
open conversation becomes a real conversation: it remembers what you told it, answers in natural
language, asks one gentle question at a time, and does not end every reply with a menu.

**Turn it on**

1. Get a key at https://console.anthropic.com and put it in `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
2. Run `npm run check:assistant`. It asks Claude one question and prints the answer, the tokens and
   the cost, so you know the key works before anyone chats.
3. Restart the server. The chat's welcome message now says that an AI writes the replies.

To turn it off, remove the key. Nothing else changes.

**What the AI answers, and what it never does.** The AI takes conversation: greetings, how someone
feels, questions about the baby and family, thanks, and off-topic questions (which it declines
kindly). Everything with a reviewed answer or a safety reply stays fixed: the guided steps (age,
birth date), the questionnaire and its scoring, the symptom check, the helplines, the printable
report, the five information topics, the sourced health answers (above), urgent physical symptoms,
a baby who may be in danger, and medicines. A short "yes", "no"
or number right after the AI spoke goes back to the AI, because it answers the AI's question.

**Safety, in layers.**

1. A crisis message (thoughts of self-harm or of harming the baby, in English or Nepali) is
   answered by the fixed crisis reply with the helplines, in code, before and without the AI. It
   works even when no key is set, and it is never held back by a limit.
2. The AI is told never to diagnose, never to advise on medicines or interpret symptoms, to send
   urgent symptoms to a hospital, to stay on topic, to ignore instructions hidden in the
   conversation, and to give only the helpline numbers it was given.
3. Every reply is checked before anyone sees it. Markup is removed, it is shown as plain text only,
   and a reply containing a phone number that is not one of our helplines is thrown away.
4. If anything goes wrong (no key, a bad key, no credit, Anthropic down, too slow, the model
   declines, an unsafe reply) the chat quietly uses its fixed reply instead, and leaves the AI alone
   for a minute. Nothing the person wrote ever appears in a log or an error message.
5. Each account has an allowance (12 AI replies a minute, 150 a day by default) so a script cannot
   run up your bill. Also set a monthly spend limit in the Anthropic console.

**What is sent to Anthropic.** Only the text of the latest messages of the chat (up to 16, each cut
to 3000 characters), to write one reply. Never a name, an email, an account id or anything else
about the account. People are told this in the welcome message and asked not to share their full
name, phone number or address. Messages that stay with the fixed replies (the check-in, the menu,
the information topics) are not sent on their own, but they can appear as earlier context when a
later free message is. Check Anthropic's current data-retention and privacy terms for your account,
and mention the AI service in your own privacy notice if you publish this.

**Cost.** Every AI reply is one API call. On the default model (`claude-opus-5-5`, $4 per million
input tokens and $20 per million output) a reply costs roughly 1 to 2 cents, more in a long chat.
`ASSISTANT_MODEL=claude-sonnet-5-5` costs about half that and `claude-haiku-5-5` a small fraction.
The system prompt is the same every time, so it is marked for caching.

**How it is built.** `POST /api/v1/assistant/reply` (`{ messages: [{ role, text }] }`, ending with
the person's message) and `GET /api/v1/assistant` (is it on?) in `routes/assistant.js`; the safety
logic and the call to Claude (through the official `@anthropic-ai/sdk`) in `util/assistant.js`. The
chat page (`public/js/chatbot-client.js`) decides who answers with `wantsAssistant` in
`public/js/chat-logic.js`. The tests use a fake of the Anthropic API, so no real account is needed
to run them.

### Trying it with a real key, and getting it reviewed

1. `npm run check:assistant` asks the real model one question and prints the reply, how long it
   took and what it cost. Do this first: it tells you at once if the key, the credit or the
   model name is wrong.
2. `npm run review:pack -- --with-replies` asks it 27 made-up messages (about 20 cents on the
   default model): ordinary feelings, loss, physical warning signs, medicine questions,
   distress in words the code does not recognise, Nepali, and attempts to make it break its
   rules. Each reply gets a first automatic check (no lists, no diagnosis, no doses, the right
   language, "go to the hospital" when it should), and everything is written to
   `review/review-pack.html`. It stops after two failed calls in a row, so a bad key costs nothing.
3. `npm run review:pack` without `--with-replies` is free and needs no key. It makes the same page
   with everything that does not need the AI: the AI's exact instructions, what the safety code
   recognises (and what it misses), every fixed text, and the Nepali next to the English.
4. Give the page to a clinician (midwife, nurse, doctor or psychologist) and to a Nepali speaker.
   It says what to look at and has the questions for each. Open it in a browser and print it or
   save it as a PDF. The automatic checks only catch clear mistakes; kindness and accuracy need
   a person.

The made-up messages are in `util/assistantReview.js`. Add to them freely: a test checks that each
one still reaches the layer it says it does (the code's safety reply, a fixed reply, or the AI).
The code's crisis and warning-sign rules deliberately catch too much rather than too little. The
Nepali phrases in them (in Devanagari and in English letters) are marked as needing a Nepali
speaker's confirmation and extension.

## Tests

```bash
npm test
```

Runs the whole suite (authentication, chat, saved history, the AI conversation, security and
design checks) against the local user store. No Anthropic account is needed: the AI tests use a
fake of its API.

### Testing against MongoDB

Set `TEST_MONGO_URI` to any MongoDB (a local one, or a free Atlas cluster) and the same suite also
runs the account, sign-out, history, password-reset and start-up tests against it:

```bash
TEST_MONGO_URI="mongodb://127.0.0.1:27017" npm test
```

Every test file creates and deletes **its own** databases, named `sutkeri_test_<file>`. Nothing
else on the server is touched, not even the database named in the URI, so it is safe to point
at a cluster that holds other data. The GitHub workflow runs the suite this way too, against a
MongoDB 7 container, on every push.

### What the app checks when it starts up on MongoDB

The app depends on its database indexes (one account per email, single-use link and sign-out
entries, entries that expire by themselves). Start-up waits for them to be built. If one cannot
be (for example the `users` collection already holds two accounts with the same email), it says
so and **refuses to use that database**: in production sign-in stays disabled until it is fixed,
and in development the local user file is used. While MongoDB is unreachable, pages still load,
signed-in requests answer 503 (so nobody is signed out) and sign-in answers 503 "temporarily
unavailable"; when it returns, everything works again without a restart.

### Automatic checks on GitHub

`.github/workflows/test.yml` runs the suite on Node 22 and 24 for every push to `main` and every
pull request, plus a separate job that fails when `npm audit` finds a high or critical
vulnerability in the app's dependencies. It also runs every Monday, because a new advisory can be
published for a package you already use without any change to your code. The badge at the top of
this file shows whether `main` is passing. To run the same checks yourself:

```bash
npm ci          # installs exactly what package-lock.json says
npm test
npm audit --audit-level=high
```

## Your users' data

What is stored, and where: each account's name, email and a bcrypt hash of the password
(`data/users.json` or MongoDB) and the full text of its saved chats (`data/history.json` or
MongoDB). Everything is deleted when the account is, and chats can also expire
(`CHAT_HISTORY_DAYS`).

What is **not** done yet: the files in `data/` are plain text on disk, so protect the machine (and
backups) they live on, or use MongoDB with encryption at rest. If you publish this, write a privacy
notice that mentions the saved chats, the emails the site sends (confirmation and password reset,
through your mail provider) and, when the AI conversation is on, the AI provider.

## Production checklist

Putting Sutkeri online for real people is a bigger step than running it on your computer. Read
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: the database, email, HTTPS, the AI spend limit, the
privacy policy, and why to run exactly one copy. Then run `npm run check:production`. It looks at
your settings, connects to the database and the mail server (nothing is written or sent), and
lists what must be fixed, what is risky and what is fine, without printing a secret. In short:

- `NODE_ENV=production`, a real `JWT_SECRET`, and a hosted `MONGO_URI` with backups
- `APP_URL` set to the public **https** address. In production a visitor who arrives over plain
  HTTP (the proxy says so in `X-Forwarded-Proto`) is sent there, and every page carries HSTS
- `TRUST_PROXY=true` behind a proxy or hosting platform, or every visitor looks like one address
- The `SMTP_*` and `MAIL_FROM` settings, or password reset and email confirmation stay switched off
- `ASSISTANT_DAILY_BUDGET_USD`, **and** a spend limit in the Anthropic console
- `public/privacy.html` and `public/terms.html` finished: every highlighted `[[...]]` filled in,
  and read by someone qualified. The launch check fails until it is
- Every sourced health answer in `public/js/knowledge.js` read and signed by a clinician. The
  launch check fails until it is
- Exactly **one** running copy: the rate limits and the AI budget live in the memory of one process
- A host health check on `GET /healthz` (200 when the app and its database are up, else 503)

## License

MIT
