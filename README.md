# Sutkeri: Postpartum Care Platform

An Express.js app with JWT authentication, MongoDB, and a postpartum support chatbot.

## Features

- Account registration and sign-in (bcrypt-hashed passwords, JWT sessions)
- Protected pages (the assistant and the results report) and a protected chatbot API
- Sign-in rate limiting, security headers, and no secrets in the source code
- MongoDB with Mongoose, plus a local development fallback when MongoDB is unavailable

## Prerequisites

- Node.js 18 or higher
- Python 3 for the chat assistant (no extra packages needed). The server warns on start-up if it
  cannot find it; set `PYTHON` in `.env` to the command or full path if it is not on your PATH.
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
| GET | `/api/v1/auth/me` | Bearer token | The signed-in user. 401 if the token is missing, expired, invalid or signed out |
| GET | `/api/v1/chatbot/greeting` | Bearer token | Starts a chat. Returns `sessionId` and the greeting |
| POST | `/api/v1/chatbot/message` | Bearer token | `{ message }` with the `x-session-id` header. Returns `sessionId` and `response`. 400 if the message is missing, blank or over 1000 characters. 429 past 30 requests a minute per account |

Chat requests answer 503 when the Python chatbot cannot run (not installed, crashed or too slow).
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

Chat sessions belong to the account that opened them: another account sending the same session
id gets its own conversation. Change the request limit with `CHAT_RATE_LIMIT`. Conversation files in
`temp/` are removed automatically once they have been idle for 24 hours.

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
- **Chat answers:** every numbered question is also offered as tappable buttons (a tap does exactly
  what typing the number does), and if something goes wrong the chat says so with a "Try again"
  button.
- **Accessibility:** every focusable element shows a visible focus ring (light on the dark footer
  and the berry call-to-action), and text meets 4.5:1 contrast. `test/design-tokens.test.js` checks
  the colour pairs, so changing a token that breaks contrast fails the tests.
- **Old design:** screenshots of the earlier pink "MOM" design are in `docs/old-ui-screenshots/`.
  They are reference only and are not served.

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
report, the five information topics, urgent physical symptoms, and medicines. A short "yes", "no"
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

## Tests

```bash
npm test
```

Runs the authentication tests against the local user store. To run the same tests against a
real MongoDB, set `TEST_MONGO_URI` (use a throw-away database, the tests drop it).

## Production checklist

- `NODE_ENV=production`, a real `JWT_SECRET`, and a reachable `MONGO_URI`
- Serve over HTTPS (the server sends HSTS in production)
- Set `TRUST_PROXY=true` if there is a reverse proxy in front

## License

MIT

# Postpartum Support Chatbot

## Project Overview
This project implements a conversational chatbot designed to provide support to women in the postpartum period. The chatbot guides users through a series of questions to assess their mental health status and provides personalized recommendations based on their responses.

## Recent Improvements

### Chatbot Interface Enhancements
1. **Fixed Repetitive Greeting Issue**: Resolved a problem where the chatbot would repeatedly display the greeting message instead of progressing through the conversation flow.
2. **Improved HTML Report Rendering**: Updated the client-side code to properly render HTML content in the chat interface, allowing for rich formatting of the assessment report.
3. **Added Dedicated Styling**: Created a specialized CSS file for the report output, improving readability and visual appeal.

### Report Formatting Improvements
1. **Enhanced Visual Layout**: Redesigned the postpartum assessment report with clear sections, better typography, and visual hierarchy.
2. **Risk Level Indicators**: Added color-coded indicators for risk levels (low, moderate, high) to highlight important information.
3. **Responsive Design**: Ensured the report displays correctly on various screen sizes.
4. **Print Functionality**: Added print-specific styling to allow users to easily print their assessment report.

### Technical Implementation
1. **HTML Content Handling**: Modified the client-side message handling to detect and properly render HTML content from the server.
2. **Server-Side Report Generation**: Updated the report generation logic to produce semantically structured HTML with appropriate CSS classes.
3. **Session Management**: Improved the handling of chat sessions to ensure proper conversation flow.

## Usage
1. Navigate to the chat interface
2. Answer the chatbot's questions about your postpartum experience
3. Receive a personalized assessment report with recommendations
4. Save or print your report for future reference or to share with healthcare providers

## Technical Details
- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Session Management**: Server-side state with client-side session ID tracking
- **Report Generation**: Dynamic HTML content with CSS styling
