# Putting Sutkeri online

This is for the person who will run Sutkeri for real mothers. It assumes you have never deployed
a website. It says what to set up, in what order, how to check it, and what to watch afterwards.

Real people will type how they feel into this site. Take your time with it, and do not skip
section 1.

## 1. Before anyone real uses it

Some of these are things the app now does for you. The rest only you can do. Run
`npm run check:production` (section 7) at any time to see what is left.

| | What | Who |
|---|---|---|
| 1 | A **hosted database with backups** (section 3). Not a file, not the free tier without backups. | You |
| 2 | **HTTPS on your own domain** (section 6). The app redirects to it and sends HSTS. | You set it up; the app does the rest |
| 3 | **Email that works** and lands in the inbox, not in spam (section 4). | You |
| 4 | **A spend limit in the Anthropic console**, and `ASSISTANT_DAILY_BUDGET_USD` (section 5). | You, and the app |
| 5 | A **privacy policy and terms** that are finished and have been read by someone qualified (section 8). | You, with a lawyer |
| 6 | The **clinical review** of the AI, the fixed texts and the **sourced health answers**, and the helplines checked (`npm run review:pack`). The launch check fails until a clinician has signed every sourced answer (see "The sourced health answers" below). | You, with a clinician and a Nepali speaker |
| 7 | **Remove the "Stay updated" box** on the home page, or connect it. Today the Subscribe button does nothing. | You |
| 8 | A **decision about people under 18** (the chat welcomes young mothers today). | You |
| 9 | **Restore a backup once**, to see that it works. | You |
| 10 | Someone **reads the contact email** in the privacy policy, and someone is told when the site is down. | You |
| 11 | **Exactly one copy** of the app is running (section 9). | You |

## 2. What you need

- A **host** for the app: a platform that runs Node apps (many do), or a small server of your own.
  Node 22 or newer. In production the app keeps its data in MongoDB and does not need a disk that lasts, so it suits either.
- A **domain name** you control.
- A **MongoDB Atlas** account (or another hosted MongoDB).
- An **email provider** that offers SMTP (Brevo, Resend, SendGrid, Mailgun, your own domain's mail, and so on).
- An **Anthropic** account with a key, if you want the AI conversation. The chat works without it,
  with its fixed replies.
- A budget for the monthly costs: the host, the database (the tier with backups), email, and AI use.

## 3. The database (MongoDB Atlas)

1. Create a cluster. Before you pick a tier, open its **Backup** page and check that it has real
   backups. A free tier may not, and real people's chats are not something to lose. Pick a region
   near your host and your users, and **write the region in the privacy policy**.
2. **Database Access:** create one user for the app, with the **readWrite** role on this one
   database only, and a long random password. Not an Atlas admin.
3. **Network Access:** Atlas refuses every address you have not allowed. If your host gives the app
   a fixed outgoing address, allow only that. Many hosts do not. If yours does not, you will have to
   allow `0.0.0.0/0`, which means the strong password is the only protection: make it long, and
   look for a private-network option on a paid plan.
4. Copy the connection string (`mongodb+srv://...`) into `MONGO_URI` **on the host only**.
5. Turn on **alerts** (for example when the database is nearly full or has stopped answering).

When the app starts it builds the database indexes it depends on, and refuses a database that
cannot provide them (for example one that already holds two accounts with the same email).

## 4. Email

1. Choose a provider and get its SMTP details: host, port, user, password.
2. Set `SMTP_HOST`, `SMTP_PORT` (587, or 465 with `SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASS`, and
   `MAIL_FROM`, for example `Sutkeri <no-reply@your-domain.com>`.
3. **Prove your domain to the provider** and set up **SPF, DKIM and DMARC** records for the domain
   in `MAIL_FROM`. Without them, the confirmation and password-reset emails go to spam, and a
   mother who has forgotten her password never gets back in.
4. After you are live: sign up with an address you own, and check that every email arrives in the
   inbox.

## 5. The AI conversation

1. In the **Anthropic console**, create a key just for production and name it so.
2. **Set a spend limit** in the console. This is the one that matters. It holds even if this app
   has a bug or is run twice, and the app cannot check it for you.
3. Set `ASSISTANT_DAILY_BUDGET_USD` too, for example `5`. Once that much has been spent in a day
   (UTC), the AI switches itself off until midnight and the chat uses its fixed replies. A
   crisis message is still answered in code, always.
4. Run `npm run check:assistant` once with the production key, then
   `npm run review:pack -- --with-replies`, and give the pack to your reviewers.
5. The model is `claude-opus-5-5` unless you set `ASSISTANT_MODEL`. A smaller model is much cheaper.
   Decide that with your reviewers, not on price alone.

### The sourced health answers

A mother can ask a health question (what postnatal depression is, the baby blues, newborn danger
signs, breastfeeding, what happens at the checkups). If the question matches one of the written
answers in `public/js/knowledge.js`, she is shown that answer with links to where it comes from.
These answers work with or without an AI key, and the AI is never asked about a question that has
one.

They were written from NHS and WHO pages, one study from Kathmandu, and WHO's 2013 postnatal
recommendations, by people who are not clinicians. **Every answer is a draft until a clinician has
read it against its source and signed it.** `npm run check:production` fails while any is unsigned,
and says which. To get them signed:

1. `npm run review:pack` and give `review/review-pack.html` to a clinician. Section 8 has every
   answer, its sources, what was changed from the source, and a question for the reviewer where
   a decision is needed (for example which check-in cut-off to use for Nepal).
2. For each answer the clinician accepts, set `status: 'reviewed'`, `reviewedBy` and `reviewedOn` on
   that entry in `public/js/knowledge.js`. A status without a name and a date does not count.
3. Where they ask for a change, edit the entry and have it read again. The tests pin every figure
   in every answer (`test/knowledge.test.js`), so a changed number has to be changed there too, on
   purpose.

The answers are in English only. A Nepali speaker has to write and check any Nepali.

## 6. The host, the domain and HTTPS

### What the app needs from the host

| | |
|---|---|
| Install | `npm ci --omit=dev` |
| Start | `npm start` (runs `node server.js`) |
| Port | the app listens on `PORT`. Most hosts set it for you |
| Health check | `GET /healthz`. It answers 200 `{"status":"ok"}` when the app and the database are up, and 503 when not |
| Copies | **exactly one** (section 9) |
| Stopping | the app handles `SIGTERM`: it finishes the requests in progress, closes the database, and exits |

### Settings (environment variables)

Set these on the host, never in the code and never in git.

| Name | | Notes |
|---|---|---|
| `NODE_ENV` | required | `production` |
| `MONGO_URI` | required | from section 3 |
| `JWT_SECRET` | required | at least 32 random characters. Make one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it signs everyone out |
| `APP_URL` | required | the public address, for example `https://sutkeri.example.com`. Emails and the redirect to HTTPS use it |
| `TRUST_PROXY` | required behind a proxy | `true`. Almost every host is one. Without it, every visitor looks like the same address and the sign-in limits count everybody together |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | for email | section 4 |
| `ANTHROPIC_API_KEY` | for the AI | section 5 |
| `ASSISTANT_DAILY_BUDGET_USD` | with the AI | section 5 |
| `CHAT_HISTORY_DAYS` | optional | delete chats this many days after their last message. Unset means they are kept until their owner deletes them. **The privacy policy must say the same** |
| `ASSISTANT_MODEL`, `ASSISTANT_RATE_LIMIT`, `ASSISTANT_DAILY_LIMIT` | optional | see `.env.example` |
| `JWT_EXPIRE` | optional | how long a sign-in lasts. Default 7 days |

Leave these **unset** in production: `AUTH_STORE`, `BCRYPT_ROUNDS`, `CORS_ORIGIN`, `ANTHROPIC_BASE_URL`. They
are for development and tests, and the launch check complains if they are there.

### On a platform that runs Node apps

Connect the repository, set the install and start commands above, set the health check path to
`/healthz`, set the number of instances to **1**, add the settings, and add your domain. The
platform gives you HTTPS and passes `X-Forwarded-Proto` and `X-Forwarded-For`, which is what the
app needs (`TRUST_PROXY=true`).

### On a server of your own

Example only; these files have not been tried here. Adjust the paths.

`/etc/caddy/Caddyfile`, where Caddy gets and renews the HTTPS certificate by itself:

```
sutkeri.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8004
}
```

`/etc/systemd/system/sutkeri.service`, which restarts the app if it stops and stops it politely:

```
[Unit]
Description=Sutkeri
After=network.target

[Service]
User=sutkeri
WorkingDirectory=/srv/sutkeri
EnvironmentFile=/etc/sutkeri.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=15
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Keep `/etc/sutkeri.env` readable only by root. Open only ports 80 and 443 in the firewall, and keep
the system updated.

### The domain

Point your domain at the host as it tells you, set `APP_URL` to the address people will type, and
then check from your own computer:

```
curl -I http://your-domain.com/login.html     # should answer 301 to https://your-domain.com/login.html
curl -I https://your-domain.com/login.html    # should answer 200, with strict-transport-security
curl https://your-domain.com/healthz           # {"status":"ok"}
```

## 7. Check it

```
npm run check:production
npm run check:production -- --env path/to/production.env
```

It looks at the settings the app would start with (or at a file of them, kept out of git),
connects to the database, logs in to the mail server (nothing is sent), and lists what **must be
fixed**, what is **risky**, and what is **fine**. It never prints a secret. Run it before the
first launch and again after every change to the settings.

After the first deploy, by hand: sign up; confirm the email; log out and use "Forgot password?";
chat; type something the crisis rule should catch and check the helplines appear; look at History;
download your data; delete the account.

## 8. The privacy policy and terms

`public/privacy.html` and `public/terms.html` are written from what the app really does, but they
are drafts. Every blank you must fill in is a highlighted `[[...]]`: who runs Sutkeri, how to
reach them, the hosting, database and email providers, where the data is held, how long backups
are kept, the decision about young people, and a section about liability. **Have someone qualified
read them for your country before you launch.** The launch check fails while any `[[...]]` is left.

Tests tie the facts in the policy to the code (for example how many messages go to the AI, which
outside sites the pages load, that no cookies are set), so if the app changes, the policy has to
change with it.

Two things the policy has to be honest about:

- Every page loads its lettering from **Google Fonts**, so Google receives each visitor's network
  address. The policy says so. To stop it, the fonts can be kept on your own site instead.
- The recent messages of a chat, **including what was typed in the guided questions** (such as her
  age and her baby's birth date), go to Anthropic when the AI writes a reply.

## 9. One copy only

These live in the memory of the single running process: the sign-in and registration limits, the
reset-email limits, each person's AI allowance, and the daily AI budget. With two copies, each has
its own count, so **every limit doubles** (and a person can be refused on one copy and allowed on
the other). Do not set the number of instances above 1, and do not use a "serverless" host that
starts copies on demand.

If you ever need more than one: the limits must move to something shared (MongoDB can hold them,
or Redis), and the budget too. That is not built. Plan it before you scale, not after.

## 10. Running it

- **Backups.** Make sure they run. **Restore one** to a test database every few months, so that you
  know it works.
- **Is it up?** Point an uptime monitor at `/healthz`, and have it tell a person.
- **Logs.** The app logs errors and a line when the AI budget is used up. It is built, and tested,
  not to log what someone wrote, an email address, or a link. Your host may log visitors' network addresses:
  say so, and say for how long, in the privacy policy.
- **Errors.** While the database is unreachable, pages still load, signed-in requests answer 503 (so
  nobody is signed out) and sign-in says "temporarily unavailable". It recovers by itself.
- **Updates.** The GitHub workflow checks every Monday for known weaknesses in the packages. Keep
  Node on a supported version, and deploy fixes promptly.
- **Secrets.** If a key or password may have leaked, replace it at once. Changing `JWT_SECRET`
  signs everyone out; changing the database password means updating `MONGO_URI`.
- **Data requests.** People can download and delete their own data on the Account page. Keep an
  eye on the contact email for the rest.
- **If something goes wrong with people's data,** you will need to know whom to tell and how fast.
  Decide that now and write it in the privacy policy.
