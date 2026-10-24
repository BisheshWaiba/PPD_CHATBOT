# Sutkeri: Postpartum Care Platform

An Express.js app with JWT authentication, MongoDB, and a postpartum support chatbot.

## Features

- Account registration and sign-in (bcrypt-hashed passwords, JWT sessions)
- Protected pages (the assistant and the results report) and a protected chatbot API
- Sign-in rate limiting, security headers, and no secrets in the source code
- MongoDB with Mongoose, plus a local development fallback when MongoDB is unavailable

## Prerequisites

- Node.js 18 or higher
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
  clears it, together with the check-in answers the chat saved in the browser.
- **Protected pages:** put `data-require-auth` on `<body>` and include `/js/auth.js`. The page
  stays hidden until the server confirms the session, then redirects to
  `/login.html?next=<page>` if it is not valid.
- **Rate limits:** 8 failed sign-ins per account and 40 per IP in 15 minutes; 10 registrations
  per IP per hour. Set `TRUST_PROXY=true` behind a reverse proxy so the real IP is used.

### API

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | Public | `{ name, email, password }`. 201, 400 invalid, 409 email taken |
| POST | `/api/auth/login` | Public | `{ email, password }`. 200 with `token` and `user`, 401 for a wrong email or password |
| GET | `/api/auth/me` | Bearer token | The signed-in user. 401 if the token is missing, expired or invalid |
| GET | `/api/chatbot/greeting` | Bearer token | Starts a chat. Returns `sessionId` and the greeting |
| POST | `/api/chatbot/message` | Bearer token | `{ message }` with the `x-session-id` header. 400 if the message is missing, blank or over 1000 characters. 429 past 30 requests a minute per account |

Chat sessions belong to the account that opened them: another account sending the same session
id gets its own conversation. Change the request limit with `CHAT_RATE_LIMIT`.

```bash
curl -X POST http://localhost:8004/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"a-long-password"}'

curl http://localhost:8004/api/auth/me -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

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
