import nodemailer from 'nodemailer';
import { isProduction } from './paths.js';

// Sending email, with any provider that speaks SMTP (Gmail, Brevo, Resend, SendGrid, Mailtrap, your
// own server...). Settings, all in .env:
//
//   APP_URL     the public address of this site, such as https://sutkeri.example.com. Links in
//               emails are built from this and NEVER from the address the request came in on: a
//               forged Host header must not be able to point a reset link at someone else's site.
//   SMTP_HOST   the provider's mail server. SMTP_PORT (587), SMTP_SECURE (true for port 465),
//               SMTP_USER and SMTP_PASS (leave out for a server that needs no login).
//   MAIL_FROM   who the email is from, for example  Sutkeri <no-reply@sutkeri.example.com>
//
// Three modes:
//   smtp     SMTP_HOST, MAIL_FROM and a usable APP_URL are set: real email.
//   console  development with no SMTP settings: each email is printed in the server console, so the
//            links can be tried without any email account.
//   off      anything else (in production or tests without settings). Password reset and
//            verification are switched off and the pages say so, rather than failing quietly.

export function appUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href.replace(/\/+$/, '');
    } catch {
      // not a web address
    }
    return null;
  }
  return isProduction() ? null : `http://localhost:${process.env.PORT || 8004}`;
}

export function mailMode() {
  if (!appUrl()) return 'off';
  if (process.env.SMTP_HOST?.trim() && process.env.MAIL_FROM?.trim()) return 'smtp';
  // Printing emails is for someone trying the site on their own computer. The tests stay quiet.
  return isProduction() || process.env.NODE_ENV === 'test' ? 'off' : 'console';
}

let transport = null; // tests put a stand-in here
export const setMailTransport = replacement => { transport = replacement; };

let cached = null;
function smtpTransport() {
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  const settings = {
    host: process.env.SMTP_HOST.trim(),
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
    // A slow mail server must not hang a request for minutes
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  };
  const signature = JSON.stringify(settings);
  if (cached?.signature !== signature) cached = { signature, transporter: nodemailer.createTransport(settings) };
  return cached.transporter;
}

// Connects to the mail server and logs in, without sending anything. For `npm run check:production`.
export async function verifyMailServer() {
  if (transport?.verify) return transport.verify();
  return smtpTransport().verify();
}

// Sends one plain-text email. Throws if the mail cannot be sent: callers decide what that means.
export async function sendMail({ to, subject, text }) {
  const mode = mailMode();
  if (mode === 'off') throw new Error('email is not configured');

  const from = process.env.MAIL_FROM?.trim() || 'Sutkeri <no-reply@localhost>';
  const message = { from, to, subject, text };

  if (transport) return transport.sendMail(message);

  if (mode === 'console') {
    console.log(`\n--- email (not sent: no SMTP settings, so it is printed here) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
    return null;
  }
  return smtpTransport().sendMail(message);
}
